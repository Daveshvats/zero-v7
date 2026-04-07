import NodeCache from "@cacheable/node-cache";
import { containsProhibitedContent } from "#lib/filter";
import { TERMS_OF_SERVICE } from "#lib/legal";
import { getPrefix } from "#lib/prefix";
import { print } from "#lib/print";
import { getSettings } from "#lib/settingsCache";
import serialize from "#lib/serialize";

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

                                // ── Early Filter: skip non-actionable message types ─────
                                // protocolMessage = read receipts, ephemeral settings, encryption keys, etc.
                                // These generate no body text and should never enter the command pipeline.
                                const msgType = msg.message ? Object.keys(msg.message)[0] : null;
                                if (msgType === "protocolMessage") {
                                        continue;
                                }
                                // Skip reaction messages (emoji reactions on messages)
                                if (msgType === "reactionMessage") {
                                        continue;
                                }

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
                                const rawBody = m.body.trim().toLowerCase();
                                const isAgree = rawBody === "i agree" || rawBody === "iagree";
                                const isExempt =
                                        m.isOwner ||
                                        m.isClonebot ||
                                        EXEMPT_COMMANDS.includes(cmdLower);

                                // Only check consent when necessary:
                                //   - Private chat: always check (any message)
                                //   - Group chat: check on commands AND "i agree"/"iagree" responses
                                //   - Group already consented: skip entirely
                                const groupConsented = m.isGroup && this.groupConsentCache.get(`gc:${m.from}`);
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
}

export default Message;
