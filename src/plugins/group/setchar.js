import itsrose from "#lib/itsrose";
import { sendImage } from "#lib/media";

export default {
    name: "set-character",
    description: "Set a Character AI personality for the bot in this group. The bot will respond as that character when @mentioned.",
    command: ["setchar", "setcharacter"],
    usage:
        "$prefix$command search <query>\n" +
        "$prefix$command info <character_id>\n" +
        "$prefix$command select <character_id>\n" +
        "$prefix$command on\n" +
        "$prefix$command off\n" +
        "$prefix$command status",
    category: "group",
    permissions: "admin",
    cooldown: 10,

    async execute(m, { db }) {
        const { GroupModel } = db;
        const args = m.text ? m.text.trim().split(/\s+/) : [];
        const sub = args[0] ? args[0].toLowerCase() : null;

        if (!m.isGroup) {
            return m.reply("❌ This command only works in groups.");
        }

        // --- HELP ---
        if (!sub || !["search", "info", "select", "on", "off", "status", "reset"].includes(sub)) {
            const group = await GroupModel.getGroup(m.from);
            const enabled = group?.caiEnabled;
            const charName = group?.caiCharName || "none";

            return m.reply(
                "🤖 *GROUP CHARACTER AI*\n\n" +
                `*Status:* ${enabled ? "✅ ON" : "⬜ OFF"}\n` +
                `*Character:* ${charName}\n\n` +
                "*Commands:*\n" +
                "• `.setchar search <query>` — Search for characters\n" +
                "• `.setchar info <char_id>` — View character details\n" +
                "• `.setchar select <char_id>` — Choose a character\n" +
                "• `.setchar on` — Enable auto-response\n" +
                "• `.setchar off` — Disable auto-response\n" +
                "• `.setchar reset` — Reset chat history\n" +
                "• `.setchar status` — Current settings\n\n" +
                "*How it works:*\n" +
                "Once enabled, anyone who @tags the bot will get a reply\n" +
                "in the character's personality. The conversation is\n" +
                "remembered across messages (persistent chat session)."
            );
        }

        // --- STATUS ---
        if (sub === "status") {
            const group = await GroupModel.getGroup(m.from);
            if (!group?.caiEnabled) {
                return m.reply("⬜ *Character AI is OFF*\nNo character is set for this group.");
            }
            return m.reply(
                `✅ *Character AI is ON*\n\n` +
                `*Character:* ${group.caiCharName || "Unknown"}\n` +
                `*Character ID:* \`${group.caiCharId || "-"}\`\n` +
                `*Has chat history:* ${group.caiChatId ? "Yes" : "No"}`
            );
        }

        // --- SEARCH ---
        if (sub === "search") {
            const query = args.slice(1).join(" ");
            if (!query) return m.reply("❌ Provide a search query.\n*Example:* `.setchar search anime girl`");

            try {
                await m.reply(`⌛ Searching for *${query}*...`);

                const res = await itsrose.get("/cai/search_character", {
                    params: { query },
                }).catch(e => e.response);

                if (!res?.data?.ok) {
                    return m.reply(`❌ API Error: ${res?.data?.message || "Server error"}`);
                }

                const characters = res.data.data?.characters || [];
                if (!characters.length) return m.reply("🔍 No characters found.");

                let msg = `🔍 *Search results for "${query}"*\n\n`;
                for (const char of characters.slice(0, 8)) {
                    msg += `━━━━━━━━━━━━━━\n`;
                    msg += `*${char.title || "-"}*\n`;
                    msg += `ID: \`${char.external_id}\`\n`;
                    if (char.description) msg += `${(char.description || "").slice(0, 80)}...\n`;
                    msg += `❤️ ${char.metadata?.interactions || 0} interactions\n`;
                }
                msg += `\n_Reply to select: .setchar select <ID>_`;
                return m.reply(msg);
            } catch (e) {
                console.error("SETCHAR SEARCH ERROR:", e);
                return m.reply(`❌ System Error: ${e.message}`);
            }
        }

        // --- INFO ---
        if (sub === "info") {
            const charId = args[1];
            if (!charId) return m.reply("❌ Provide a character ID.\n*Example:* `.setchar info abc123`");

            try {
                await m.reply("⌛ Fetching character info...");

                const res = await itsrose.get("/cai/character_info", {
                    params: { external_id: charId },
                }).catch(e => e.response);

                if (!res?.data?.ok) {
                    return m.reply(`❌ API Error: ${res?.data?.message || "Server error"}`);
                }

                const char = res.data.data;
                let msg = `🤖 *CHARACTER INFO*\n\n`;
                msg += `*Title:* ${char.title || "-"}\n`;
                msg += `*ID:* \`${char.external_id}\`\n`;
                msg += `*Tag:* ${char.tag || "-"}\n\n`;
                if (char.greeting) msg += `*Greeting:*\n${char.greeting}\n\n`;
                msg += `_Reply to select: .setchar select ${char.external_id}_`;

                if (char.avatar_url) {
                    return sendImage(m, char.avatar_url, msg, { label: "Character Avatar" });
                }
                return m.reply(msg);
            } catch (e) {
                console.error("SETCHAR INFO ERROR:", e);
                return m.reply(`❌ System Error: ${e.message}`);
            }
        }

        // --- SELECT ---
        if (sub === "select") {
            const charId = args[1];
            if (!charId) return m.reply("❌ Provide a character ID.\n*Example:* `.setchar select abc123`");

            try {
                await m.reply(`⌛ Fetching character info for selection...`);

                // Fetch character info to get the name
                const res = await itsrose.get("/cai/character_info", {
                    params: { external_id: charId },
                }).catch(e => e.response);

                if (!res?.data?.ok) {
                    return m.reply(`❌ API Error: ${res?.data?.message || "Server error"}`);
                }

                const char = res.data.data;
                const charName = char.title || "Unknown";

                // Save to DB — enable automatically when selecting
                await GroupModel.setGroup(m.from, {
                    caiEnabled: true,
                    caiCharId: charId,
                    caiCharName: charName,
                    caiChatId: null, // fresh chat
                });

                let msg = `✅ *Character set for this group!*\n\n`;
                msg += `*Character:* ${charName}\n`;
                msg += `*ID:* \`${charId}\`\n`;
                msg += `*Status:* ✅ ON\n\n`;
                if (char.greeting) {
                    msg += `*Greeting:*\n${char.greeting}\n\n`;
                }
                msg += `Now anyone can @tag the bot to talk to ${charName}!`;

                if (char.avatar_url) {
                    await sendImage(m, char.avatar_url, msg, { label: "Character Avatar" });
                    return;
                }
                return m.reply(msg);
            } catch (e) {
                console.error("SETCHAR SELECT ERROR:", e);
                return m.reply(`❌ System Error: ${e.message}`);
            }
        }

        // --- ON ---
        if (sub === "on") {
            const group = await GroupModel.getGroup(m.from);
            if (!group?.caiCharId) {
                return m.reply("❌ No character selected yet.\nUse `.setchar search <query>` to find one, then `.setchar select <id>`.");
            }

            await GroupModel.setGroup(m.from, { caiEnabled: true });
            return m.reply(`✅ Character AI enabled. @tag the bot to talk to *${group.caiCharName}*!`);
        }

        // --- OFF ---
        if (sub === "off") {
            await GroupModel.setGroup(m.from, { caiEnabled: false });
            return m.reply("⬜ Character AI disabled. The bot will no longer respond as the character.");
        }

        // --- RESET ---
        if (sub === "reset") {
            const group = await GroupModel.getGroup(m.from);
            if (!group?.caiCharId) {
                return m.reply("❌ No character set for this group.");
            }

            await GroupModel.setGroup(m.from, { caiChatId: null });
            return m.reply(`🔄 Chat history with *${group.caiCharName}* has been reset. Fresh conversation!`);
        }
    },
};
