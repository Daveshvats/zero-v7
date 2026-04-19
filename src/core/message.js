import NodeCache from "@cacheable/node-cache";
import { containsProhibitedContent } from "#lib/filter";
import { TERMS_OF_SERVICE } from "#lib/legal";
import { getPrefix, quickCommandCheck } from "#lib/prefix";
import { print } from "#lib/print";
import { getSettings } from "#lib/settingsCache";
import serialize from "#lib/serialize";
import { extractMessageContent, getContentType, jidNormalizedUser } from "baileys";

/**
 * Commands that are exempt from the consent gate.
 * Users must be able to view terms, privacy, and agree without having accepted first.
 */
const EXEMPT_COMMANDS = ["terms", "privacy", "iagree", "accept"];

/** Consent cache TTL: 5 minutes (users rarely un-accept) */
const CONSENT_CACHE_TTL = 300;

/** Pre-loaded DB module reference (same lazy-init pattern as plugins.js) */
let _dbModule = null;
async function getDB() {
        if (!_dbModule) {
                _dbModule = await import("#lib/database/index");
        }
        return _dbModule;
}

/**
 * Extract raw text body from a Baileys message without any async work.
 * Uses the same logic as serialize() body extraction but runs in <0.1ms.
 * This is the "zero-cost" check to decide whether to enter the full pipeline.
 *
 * @param {object} msg - Raw Baileys message
 * @returns {string} - The raw text body (may be empty for media-only messages)
 */
function quickBodyExtract(msg) {
        if (!msg?.message) return "";

        // Apply the same parseMessage chain as serialize (simplified for body extraction)
        let content = extractMessageContent(msg.message);
        const handlers = [
                (m) => m?.viewOnceMessageV2Extension?.message,
                (m) => m?.viewOnceMessageV2?.message,
                (m) =>
                        m?.protocolMessage?.type === 14
                                ? m.protocolMessage[getContentType(m.protocolMessage)]
                                : m,
                (m) =>
                        m?.message ? m.message[getContentType(m.message)] : m,
        ];
        for (const handler of handlers) {
                const result = handler(content);
                if (result) { content = result; break; }
        }

        // Extract text from the parsed content (same priority as serialize.js m.body)
        const msgType = getContentType(content) || Object.keys(content)[0];
        const msgContent = msgType === "conversation" ? content : content[msgType];
        if (!msgContent) return "";

        return (
                msgContent.text ||
                msgContent.conversation ||
                msgContent.caption ||
                content.conversation ||
                msgContent.selectedButtonId ||
                msgContent.singleSelectReply?.selectedRowId ||
                msgContent.selectedId ||
                msgContent.contentText ||
                msgContent.selectedDisplayText ||
                msgContent.title ||
                msgContent.name ||
                ""
        );
}

/**
 * Class for processing incoming messages and routing them to the PluginManager.
 */
class Message {
        /**
         * @param {import('../lib/plugins.js').default} pluginManager - The plugin manager instance.
         * @param {string[]} ownerJids - An array of owner JIDs (raw numbers).
         * @param {string[]} prefixes - An array of bot prefixes.
         * @param {import('@cacheable/node-cache')} groupMetadataCache - Cache for group metadata.
         * @param {import('../lib/store.js')} store - Store instance.
         */
        constructor(pluginManager, ownerJids, prefixes, groupMetadataCache, store) {
                this.pluginManager = pluginManager;
                this.ownerJids = ownerJids;
                this.prefixes = prefixes;
                this.groupMetadataCache = groupMetadataCache;
                this.store = store;
                // In-memory cache for termsAccepted — avoids DB query on every single message
                this.consentCache = new NodeCache({ stdTTL: CONSENT_CACHE_TTL, checkperiod: 60 });
                // Group-level consent: once any user accepts terms in a group, it's accepted for all
                this.groupConsentCache = new NodeCache({ stdTTL: 24 * 60 * 60, checkperiod: 300 });
        }

        /**
         * Check whether a user has accepted the Terms of Service.
         * Owners and clone bots are always considered accepted.
         * Results are cached for CONSENT_CACHE_TTL to eliminate per-message DB hits.
         *
         * @param {object} m - Serialized message object.
         * @returns {Promise<boolean>}
         */
        async hasAcceptedTerms(m) {
                if (m.isOwner || m.isClonebot) return true;

                // Group-level consent: skip individual check if group is already consented
                if (m.isGroup) {
                        const groupConsented = this.groupConsentCache.get(`gc:${m.from}`);
                        if (groupConsented) {
                                return true;
                        }
                }

                const cacheKey = `consent:${m.sender}`;
                const cached = this.consentCache.get(cacheKey);
                if (cached !== undefined) {
                        return cached;
                }

                try {
                        const { UserModel } = await getDB();
                        if (!UserModel?.getUser) {
                                this.consentCache.set(cacheKey, false);
                                return false;
                        }
                        const user = await UserModel.getUser(m.sender);
                        const accepted = !!user?.termsAccepted;
                        this.consentCache.set(cacheKey, accepted);
                        // Cache the user doc on m so checkPermissions can reuse it (avoids duplicate DB call)
                        m._userDoc = user;
                        return accepted;
                } catch {
                        this.consentCache.set(cacheKey, false);
                        return false;
                }
        }

        /**
         * Mark a user's consent as accepted in the cache.
         * Also marks the group as consented (if in a group) so all members can use commands.
         * Persists group consent to DB so it survives bot restarts.
         *
         * @param {string} sender - The sender JID.
         * @param {string} [groupJid] - The group JID (if in a group).
         */
        async invalidateConsentCache(sender, groupJid) {
                this.consentCache.set(`consent:${sender}`, true);
                if (groupJid) {
                        this.groupConsentCache.set(`gc:${groupJid}`, true);
                        // Persist group consent to DB so it survives restarts
                        try {
                                const { GroupModel } = await getDB();
                                if (GroupModel?.setGroup) {
                                        await GroupModel.setGroup(groupJid, {
                                                termsAccepted: true,
                                                termsAcceptedAt: new Date(),
                                        });
                                }
                        } catch (err) {
                                console.debug("[Consent] Failed to persist group consent to DB:", err.message);
                        }
                }
        }

        /**
         * Hydrate group consent cache from DB on startup.
         * Loads all groups that have previously accepted terms so consent survives restarts.
         */
        async hydrateGroupConsentCache() {
                try {
                        const { GroupModel } = await getDB();
                        if (!GroupModel?.getAllGroups) return;

                        const allGroups = await GroupModel.getAllGroups();
                        let hydrated = 0;
                        for (const g of allGroups) {
                                if (g.termsAccepted) {
                                        this.groupConsentCache.set(`gc:${g.jid}`, true);
                                        hydrated++;
                                }
                        }
                        if (hydrated > 0) {
                                console.info(`[Consent] Hydrated group consent cache: ${hydrated} groups pre-accepted`);
                        }
                } catch (err) {
                        console.debug("[Consent] Failed to hydrate group consent cache:", err.message);
                }
        }

        /**
         * Handle 'messages.upsert' event from Baileys.
         *
         * ── Two-Tier Pipeline ──────────────────────────────────────────
         *
         * FAST PATH (non-commands in groups):
         *   1. Quick sync filters (protocol, reaction, fromMe)     < 0.1ms
         *   2. Quick body extraction (no async)                    < 0.1ms
         *   3. Quick command check (prefix + known cmd set)        < 0.1ms
         *   4. If NOT a command → saveMessage + print + fire CAI-AUTO periodic  < 5ms
         *      Total: ~5ms vs ~200ms for full serialize
         *
         * FULL PATH (commands, consent, private chat):
         *   Same as before — serialize, consent check, permissions, execute
         *
         * @param {import('baileys').WASocket} sock - Baileys socket object.
         * @param {{ messages: import('baileys').proto.IWebMessageInfo[], type: string }} data - Message data from the event.
         */
        async process(sock, { messages, type }) {
                if (type !== "notify") {
                        return;
                }

                // Hydrate group consent cache from DB on first message (lazy init, runs once)
                if (!this._consentHydrated) {
                        this._consentHydrated = true;
                        this.hydrateGroupConsentCache().catch(() => {});
                }

                // Fetch settings once per batch using cached settings (reduces DB calls drastically)
                const settings = await getSettings();

                for (const msg of messages) {
                        try {
                                if (!msg.message) {
                                        continue;
                                }

                                if (!msg.messageTimestamp) {
                                        msg.messageTimestamp = Date.now() / 1000;
                                }

                                // ── Sync Filters (no async, < 0.1ms) ─────────────────
                                const msgType = msg.message ? Object.keys(msg.message)[0] : null;
                                if (msgType === "protocolMessage") {
                                        continue;
                                }
                                if (msgType === "reactionMessage") {
                                        continue;
                                }

                                // Skip bot's own messages
                                if (msg.key?.fromMe) {
                                        continue;
                                }

                                // Determine if group (sync)
                                const remoteJid = msg.key?.remoteJid || "";
                                const isGroup = remoteJid.endsWith("@g.us");
                                const isPrivateChat = !isGroup && remoteJid.endsWith("@s.whatsapp.net");

                                // ── FAST PATH: Quick body + command check (< 0.5ms) ──
                                const rawBody = quickBodyExtract(msg);
                                const { isCommand: mightBeCommand } = quickCommandCheck(rawBody);

                                // Check for "i agree" responses (need full pipeline for consent handling)
                                const rawBodyLower = rawBody.trim().toLowerCase();
                                const isAgree = rawBodyLower === "i agree" || rawBodyLower === "iagree";

                                // Fast path decision: in groups, skip full serialize for non-commands
                                // unless the group hasn't consented yet and it might be "i agree"
                                const groupConsented = isGroup && this.groupConsentCache.get(`gc:${jidNormalizedUser(remoteJid)}`);
                                const needsFullPipeline = isPrivateChat
                                        || mightBeCommand
                                        || isAgree
                                        || (isGroup && !groupConsented);

                                if (!needsFullPipeline && isGroup) {
                                        // ── FAST PATH: Group non-command (< 5ms total) ──
                                        // Just store the message and fire periodic plugins (CAI-AUTO)
                                        this.store.saveMessage(remoteJid, msg);
                                        // Fire CAI-AUTO in fire-and-forget — it handles its own serialization needs
                                        // We pass a minimal lightweight object instead of full serialized message
                                        this._runPeriodicFast(sock, msg, rawBody, remoteJid);
                                        continue;
                                }

                                // ── FULL PATH: Command / consent / private chat ─────────
                                const m = await serialize(sock, msg, this.store);

                                this.store.saveMessage(m.from, msg);

                                await print(m, sock);

                                if (!m || !m.body) {
                                        continue;
                                }

                                const { prefix, isCommand, command, args, text } = getPrefix(
                                        m.body,
                                        m
                                );

                                m.prefix = prefix;
                                m.isCommand = isCommand;
                                m.command = command;
                                m.args = args;
                                m.text = text;

                                if (settings.self && !m.isOwner && !m.isClonebot) {
                                        continue;
                                }
                                if (settings.groupOnly && !m.isGroup && !m.isOwner) {
                                        continue;
                                }
                                if (settings.privateChatOnly && m.isGroup && !m.isOwner) {
                                        continue;
                                }

                                // ── Consent Gate ──────────────────────────────────────────────
                                const cmdLower = (command || "").toLowerCase();

                                const isExempt =
                                        m.isOwner ||
                                        m.isClonebot ||
                                        EXEMPT_COMMANDS.includes(cmdLower);

                                // Only check consent when necessary:
                                //   - Private chat: always check (any message)
                                //   - Group chat: check on commands AND "i agree"/"iagree" responses
                                //   - Group already consented: skip entirely
                                const needsConsentCheck = !isExempt && !groupConsented && (
                                        !m.isGroup || m.isCommand || isAgree
                                );

                                if (needsConsentCheck) {
                                        const accepted = await this.hasAcceptedTerms(m);

                                        if (!accepted) {
                                                if (isAgree) {
                                                        // Terms acceptance — works in both private and group chats
                                                        try {
                                                                const { UserModel } = await getDB();
                                                                if (UserModel?.setUser) {
                                                                        await UserModel.setUser(m.sender, {
                                                                                termsAccepted: true,
                                                                                termsAcceptedAt: new Date(),
                                                                        });
                                                                        // Accept for the user AND the group (if in a group)
                                                                        await this.invalidateConsentCache(m.sender, m.isGroup ? m.from : null);
                                                                }
                                                                await m.reply(
                                                                        "✅ *Terms accepted!*\n\nWelcome! You can now use all bot commands.\nType *help* to see available commands."
                                                                );
                                                        } catch (updateErr) {
                                                                console.error(
                                                                        "[Consent] Failed to save acceptance:",
                                                                        updateErr
                                                                );
                                                                await m.reply(
                                                                        "An error occurred while saving your acceptance. Please try again."
                                                                );
                                                        }
                                                        continue;
                                                }

                                                // Private chat: always prompt. Group chat: only prompt on commands.
                                                await m.reply(
                                                        "🔒 *You must accept the Terms of Service before using this bot.*\n\n" +
                                                                TERMS_OF_SERVICE
                                                );
                                                continue;
                                        }
                                }

                                // Handle .iagree / .accept as explicit commands (exempt list)
                                if (isExempt && (cmdLower === "iagree" || cmdLower === "accept")) {
                                        try {
                                                const { UserModel } = await getDB();
                                                if (UserModel?.setUser) {
                                                        await UserModel.setUser(m.sender, {
                                                                termsAccepted: true,
                                                                termsAcceptedAt: new Date(),
                                                        });
                                                        await this.invalidateConsentCache(m.sender, m.isGroup ? m.from : null);
                                                }
                                                await m.reply(
                                                        "✅ *Terms accepted!*\n\nWelcome! You can now use all bot commands.\nType *help* to see available commands."
                                                );
                                        } catch (updateErr) {
                                                console.error(
                                                        "[Consent] Failed to save acceptance:",
                                                        updateErr
                                                );
                                        }
                                        continue;
                                }

                                // ── Content Filter ────────────────────────────────────────────
                                if (m.body && containsProhibitedContent(m.body)) {
                                        console.warn(
                                                `[Filter] Prohibited content detected from ${m.sender}`
                                        );
                                        await m.reply(
                                                "🚫 *Request denied.* Prohibited content detected."
                                        );
                                        continue;
                                }

                                // ── Command Execution ────────────────────────────────────────
                                if (m.isCommand) {
                                        await this.pluginManager.enqueueCommand(sock, m);
                                }

                                // Fire-and-forget periodic/after hooks — don't block the message loop
                                this.pluginManager.runPeriodicMessagePlugins(m, sock).catch(() => {});
                                this.pluginManager.handleAfterPlugins(m, sock);
                        } catch (error) {
                                console.error("Error processing message:", error);
                        }
                }
        }

        /**
         * Fire periodic message plugins (like CAI-AUTO) on the fast path.
         * Creates a minimal lightweight message object — CAI-AUTO only needs
         * from, body, sender, mentions, isCommand, and isGroup.
         * The periodic plugin calls serialize internally if needed.
         *
         * @param {object} sock - Baileys socket
         * @param {object} msg - Raw Baileys message
         * @param {string} body - Raw text body
         * @param {string} from - Chat JID
         */
        _runPeriodicFast(sock, msg, body, from) {
                const senderNum = (msg.key?.participant || msg.key?.remoteJid || "").replace(/\D/g, "");
                const isCommand = body.trim().startsWith(".") || body.trim().startsWith("#") || body.trim().startsWith("!");

                // Minimal message stub — enough for CAI-AUTO to check mentions and process
                const m = {
                        body,
                        from,
                        isGroup: from.endsWith("@g.us"),
                        isCommand,
                        command: "",
                        msg: msg.message,
                        message: msg.message,
                        type: msg.message ? Object.keys(msg.message)[0] : null,
                        mentions: msg.message?.extendedTextMessage?.contextInfo?.mentionedJid
                                || msg.message?.conversation?.contextInfo?.mentionedJid
                                || [],
                        // Provide reply function — serializes on demand
                        reply: async (content) => {
                                const serialized = await serialize(sock, msg, this.store);
                                if (serialized) {
                                        if (typeof content === "string") {
                                                await sock.sendMessage(from, { text: content }, { quoted: msg });
                                        } else {
                                                await sock.sendMessage(from, content, { quoted: msg });
                                        }
                                }
                        },
                };

                // Fire-and-forget — don't block the message loop
                this.pluginManager.runPeriodicMessagePlugins(m, sock).catch(() => {});
        }
}

export default Message;
