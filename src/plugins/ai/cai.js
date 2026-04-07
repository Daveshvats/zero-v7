import itsrose from "#lib/itsrose";
import { sendImage } from "#lib/media";

export default {
    name: "character-ai",
    description: "Search, view info, and chat with Character AI characters.",
    command: ["cai", "charai"],
    usage:
        "$prefix$command search <query>\n" +
        "$prefix$command info <character_id>\n" +
        "$prefix$command chat <character_id> <message>",
    category: "ai",
    permissions: "all",
    limit: true,
    cooldown: 5,

    async execute(m) {
        const args = m.text ? m.text.trim().split(/\s+/) : [];
        const sub = args[0] ? args[0].toLowerCase() : null;

        // Show help if no subcommand
        if (!sub || (sub !== "search" && sub !== "info" && sub !== "chat")) {
            return m.reply(
                "🤖 *CHARACTER AI*\n\n" +
                "*Subcommands:*\n" +
                "• `.cai search <query>` — Search for characters\n" +
                "• `.cai info <character_id>` — View character details\n" +
                "• `.cai chat <character_id> <message>` — Chat with a character\n\n" +
                "*Example:*\n` .cai search anime girl`\n` .cai chat abc123 Hello!`"
            );
        }

        // --- SEARCH ---
        if (sub === "search") {
            const query = args.slice(1).join(" ");
            if (!query) return m.reply("❌ Provide a search query.\n*Example:* `.cai search anime girl`");

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
                for (const char of characters.slice(0, 10)) {
                    msg += `━━━━━━━━━━━━━━\n`;
                    msg += `*Title:* ${char.title || "-"}\n`;
                    msg += `*ID:* ${char.external_id || "-"}\n`;
                    msg += `*Tag:* ${char.tag || "-"}\n`;
                    msg += `*Description:* ${(char.description || "-").slice(0, 100)}...\n`;
                    msg += `*Interactions:* ${char.metadata?.interactions || 0} | *Chats:* ${char.metadata?.chats || 0}\n\n`;
                }
                msg += `\n_Reply to chat: .cai chat <ID> <message>_`;
                return m.reply(msg);
            } catch (e) {
                console.error("CAI SEARCH ERROR:", e);
                return m.reply(`❌ System Error: ${e.message}`);
            }
        }

        // --- INFO ---
        if (sub === "info") {
            const charId = args[1];
            if (!charId) return m.reply("❌ Provide a character ID.\n*Example:* `.cai info abc123`");

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
                msg += `*ID:* ${char.external_id || "-"}\n`;
                msg += `*Tag:* ${char.tag || "-"}\n`;
                msg += `*Language:* ${char.primary_language || "-"}\n`;
                msg += `*Licensed:* ${char.is_licensed_professional ? "Yes" : "No"}\n\n`;
                if (char.description) msg += `*Description:*\n${char.description}\n\n`;
                if (char.greeting) msg += `*Greeting:*\n${char.greeting}\n\n`;
                if (char.creator) {
                    msg += `*Creator:* ${char.creator.name || "-"} (@${char.creator.username || "-"})\n`;
                }
                if (char.metadata) {
                    msg += `\n*Stats:* ❤️ ${char.metadata.likes || 0} | 💬 ${char.metadata.chats || 0} | 🔄 ${char.metadata.interactions || 0}`;
                }

                if (char.avatar_url) {
                    return sendImage(m, char.avatar_url, msg, { label: "CAI Avatar" });
                }
                return m.reply(msg);
            } catch (e) {
                console.error("CAI INFO ERROR:", e);
                return m.reply(`❌ System Error: ${e.message}`);
            }
        }

        // --- CHAT ---
        if (sub === "chat") {
            const charId = args[1];
            const message = args.slice(2).join(" ") || (m.quoted?.text || null);

            if (!charId) return m.reply("❌ Provide a character ID.\n*Example:* `.cai chat abc123 Hello!`");
            if (!message) return m.reply("❌ Provide a message to send.\n*Example:* `.cai chat abc123 Hello!`");

            try {
                await m.reply("⌛ Chatting with character...");

                const res = await itsrose.post(
                    "/cai/send_message",
                    { external_id: charId, message }
                ).catch(e => e.response);

                if (!res?.data?.ok) {
                    return m.reply(`❌ API Error: ${res?.data?.message || "Server error"}`);
                }

                const data = res.data.data;
                const replies = data?.replies || [];
                if (!replies.length) return m.reply("❌ No reply from character.");

                for (const reply of replies) {
                    const text = reply.raw_content || reply.text || (typeof reply === "string" ? reply : "");
                    if (text) await m.reply(text);
                }
            } catch (e) {
                console.error("CAI CHAT ERROR:", e);
                return m.reply(`❌ System Error: ${e.message}`);
            }
        }
    },
};
