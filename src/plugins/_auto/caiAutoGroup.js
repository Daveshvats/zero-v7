import itsrose from "#lib/itsrose";

// In-memory cache for group CAI config to avoid hitting DB on every message.
// TTL: 5 minutes for enabled groups (config is stable), 2 minutes for null (disabled) groups
// so they don't hammer the DB on every cache expiry.
const groupCache = new Map();

function getCachedConfig(groupJid) {
    const entry = groupCache.get(groupJid);
    if (entry && Date.now() - entry.ts < entry.ttl) {
        return entry.data;
    }
    return null;
}

function setCachedConfig(groupJid, data) {
    // Enabled groups: cache for 5 min. Disabled/null groups: cache for 2 min.
    const ttl = data?.caiEnabled ? 300_000 : 120_000;
    groupCache.set(groupJid, { data, ts: Date.now(), ttl });
}

// Rate limit: max 1 CAI response per group per 10 seconds to avoid spam/flood
const groupRateLimit = new Map();

function isRateLimited(groupJid) {
    const lastTime = groupRateLimit.get(groupJid) || 0;
    if (Date.now() - lastTime < 10_000) return true;
    groupRateLimit.set(groupJid, Date.now());
    return false;
}

// Periodic cleanup every 5 minutes to prevent unbounded Map growth.
// groupCache entries have per-entry TTL (5 min enabled, 2 min disabled).
// groupRateLimit entries are only relevant for 10 seconds — safe to evict after 30 seconds.
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of groupCache) {
        if (now - entry.ts > entry.ttl) groupCache.delete(key);
    }
    for (const [key, timestamp] of groupRateLimit) {
        if (now - timestamp > 30_000) groupRateLimit.delete(key); // 30s
    }
}, 300_000).unref(); // unref so it doesn't prevent process exit

export default {
    name: "cai-auto-group",
    description: "Auto-respond as a Character AI character when the bot is @mentioned in groups.",
    command: [],
    hidden: true,
    execute: () => {},

    periodic: {
        enabled: true,
        type: "message",
        run: async function (m, { sock }) {
            // Only in groups
            if (!m.isGroup) return;

            // Skip bot's own messages, commands, and media-only messages
            if (m.fromMe || m.isCommand || m.isBot) return;

            // Only respond to text messages
            if (!m.body || m.body.trim().length === 0) return;

            try {
                // Lazy-load DB
                let GroupModel;
                try {
                    const dbModule = await import("#lib/database/index");
                    GroupModel = dbModule.GroupModel;
                } catch {
                    return; // DB not available
                }

                // Check cache first
                let config = getCachedConfig(m.from);
                if (!config) {
                    try {
                        const group = await GroupModel.getGroup(m.from);
                        config = group ? {
                            caiEnabled: group.caiEnabled,
                            caiCharId: group.caiCharId,
                            caiCharName: group.caiCharName,
                            caiChatId: group.caiChatId,
                        } : null;
                        // Only log on cache miss for ENABLED groups — disabled groups are noise
                        if (config?.caiEnabled) {
                            console.debug("[CAI-AUTO] DB config loaded:", m.from, `enabled=true char=${config.caiCharId}`);
                        }
                    } catch (err) {
                        console.debug("[CAI-AUTO] DB error for", m.from, err.message);
                        config = null;
                    }
                    setCachedConfig(m.from, config);
                }

                // Must be enabled and have a character
                if (!config?.caiEnabled || !config?.caiCharId) return;

                // Check if bot is mentioned
                // sock is passed from PluginManager as second arg: periodic.run(m, { sock, pluginManager })
                const botJid = sock?.user?.id || "";
                const botNum = (botJid.match(/\d{8,}/) || [])[0];

                if (!botNum) {
                    console.debug("[CAI-AUTO] Cannot determine bot number from:", botJid || "empty");
                    return;
                }

                const mentions = m.mentions || [];

                // Strategy 1: Direct match — works for @s.whatsapp.net format mentions
                let isBotMentioned = mentions.some(jid => {
                    const num = (jid.match(/\d{8,}/) || [])[0];
                    return num === botNum;
                });

                // Strategy 2: Resolve @lid JIDs via group participant metadata
                // In newer WhatsApp/Baileys, mention JIDs use @lid (Linked ID) instead of @s.whatsapp.net.
                // The @lid number is an opaque WhatsApp internal ID, NOT the phone number.
                // We resolve it by finding the bot's entry in group participants and matching its lid.
                if (!isBotMentioned && mentions.some(j => j.endsWith('@lid'))) {
                    try {
                        // Use m.metadata if available (already fetched and LID-resolved by serialize.js)
                        // to avoid redundant groupMetadata calls
                        const meta = m.metadata || await sock.groupMetadata(m.from);
                        const participants = meta?.participants || [];

                        // FIX: In LID groups, p.id may be @lid (e.g. 189713587650632@lid), not the phone number.
                        // We cannot match by extracting digits from p.id. Instead, match botNum against:
                        //   1. p.phoneNumber field (which is the real phone JID)
                        //   2. p.jid field (if it's a phone JID)
                        //   3. Extract digits from p.phoneNumber if id is @lid
                        const botParticipant = participants.find(p => {
                            // Check phoneNumber field (most reliable — contains actual phone JID)
                            if (p.phoneNumber) {
                                const pnNum = (p.phoneNumber.match(/\d{8,}/) || [])[0];
                                if (pnNum === botNum) return true;
                            }
                            // Check jid field
                            if (p.jid && !p.jid.endsWith('@lid')) {
                                const jNum = (p.jid.match(/\d{8,}/) || [])[0];
                                if (jNum === botNum) return true;
                            }
                            // Check id field only if it's a phone JID (not @lid)
                            if (p.id && !p.id.endsWith('@lid')) {
                                const iNum = (p.id.match(/\d{8,}/) || [])[0];
                                if (iNum === botNum) return true;
                            }
                            return false;
                        });

                        if (botParticipant) {
                            // Build set of all known bot JIDs (phone JID + lid JID + variations)
                            const botJidSet = new Set([
                                botParticipant.id,                         // may be @lid or @s.whatsapp.net
                                `${botNum}@s.whatsapp.net`,               // fallback
                            ]);
                            // Add lid if participant has one
                            if (botParticipant.lid) {
                                botJidSet.add(botParticipant.lid);         // e.g. 189713587650632@lid
                            }
                            // Add jid if participant has one and it differs from id
                            if (botParticipant.jid && botParticipant.jid !== botParticipant.id) {
                                botJidSet.add(botParticipant.jid);
                            }
                            // Add phoneNumber if available and differs
                            if (botParticipant.phoneNumber && botParticipant.phoneNumber !== botParticipant.id) {
                                botJidSet.add(botParticipant.phoneNumber);
                            }

                            isBotMentioned = mentions.some(jid => botJidSet.has(jid));
                            if (isBotMentioned) {
                                console.debug("[CAI-AUTO] Bot mentioned via @lid resolution. lid:", botParticipant.lid || "none");
                            }
                        } else {
                            console.debug("[CAI-AUTO] Bot not found in group participants");
                        }
                    } catch (e) {
                        console.debug("[CAI-AUTO] groupMetadata error:", e.message);
                    }
                }

                // Strategy 3: Text-based fallback — @botNumber in message body
                if (!isBotMentioned) {
                    const body = m.body || "";
                    if (body.includes(`@${botNum}`)) {
                        isBotMentioned = true;
                        console.debug("[CAI-AUTO] Bot detected via text @mention");
                    }
                }

                if (!isBotMentioned) {
                    return;
                }

                // Rate limit check
                if (isRateLimited(m.from)) {
                    console.debug("[CAI-AUTO] Rate limited for", m.from);
                    return;
                }

                // Extract text — strip @mentions to get clean input
                const cleanText = (m.body || "")
                    .replace(/@\d+/g, "")
                    .replace(/@\S+/g, "")
                    .trim();

                if (!cleanText || cleanText.length < 2) return;

                console.debug(`[CAI-AUTO] Sending to CAI: char=${config.caiCharId} text="${cleanText.slice(0, 50)}"`);

                // Send typing indicator so user knows bot is "thinking"
                try {
                    await sock.sendPresenceUpdate("composing", m.from);
                } catch {
                    // Non-critical
                }

                // Build the CAI request body
                const requestBody = {
                    external_id: config.caiCharId,
                    message: cleanText,
                };

                // Only include chat_id if it exists (don't send empty string)
                if (config.caiChatId) {
                    requestBody.chat_id = config.caiChatId;
                }

                const res = await itsrose.post(
                    "/cai/send_message",
                    requestBody
                ).catch(e => e.response);

                if (!res?.data?.ok) {
                    console.error("[CAI-AUTO] API error:", res?.data?.message || "unknown", res?.status || "no status");
                    return;
                }

                const data = res.data.data;
                const replies = data?.replies || [];

                if (!replies.length) {
                    console.debug("[CAI-AUTO] No replies from API");
                    return;
                }

                console.debug("[CAI-AUTO] Got", replies.length, "reply(ies), chat_id:", data.chat_id || "none");

                // Persist the chat_id for conversation continuity
                if (data.chat_id && data.chat_id !== config.caiChatId) {
                    try {
                        await GroupModel.setGroup(m.from, { caiChatId: data.chat_id });
                        setCachedConfig(m.from, { ...config, caiChatId: data.chat_id });
                    } catch {
                        // Non-critical — chat just won't persist across restarts
                    }
                }

                // Send the character's reply
                for (const reply of replies) {
                    const text = reply.raw_content || reply.text || (typeof reply === "string" ? reply : "");
                    if (text) {
                        await m.reply(text);
                    }
                }
            } catch (e) {
                console.error("[CAI-AUTO] Error:", e.message);
            }
        },
    },
};
