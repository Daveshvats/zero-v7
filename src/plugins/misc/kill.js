import fetch from "node-fetch";
import Sticker from "#lib/sticker"; // Using your sticker library

export default {
    name: "kill",
    description: "Kill someone with a reaction sticker.",
    command: ["kill"],
    permissions: "all",
    hidden: false,
    failed: "Failed to %command: %error",
    wait: null,
    category: "fun",
    cooldown: 5,
    limit: true,
    usage: "$prefix$command @tag / reply",
    react: true,
    botAdmin: false,
    group: false,
    private: false,
    owner: false,

    async execute(m, { sock }) {
        // 1. Target Detection
        const user = m?.quoted?.sender || m.mentions[0];
        if (!user) return m.reply("Reply or tag a user!");

        try {
            // 2. Fetch Media from waifu.pics
            const res = await fetch(`https://api.waifu.pics/sfw/kill`);
            if (!res.ok) throw new Error("API Error");
            const json = await res.json();

            // 3. Download the media into a Buffer
            const mediaRes = await fetch(json.url);
            const buffer = Buffer.from(await mediaRes.arrayBuffer());

            // 4. Create Sticker using your technique
            const sticker = await Sticker.create(buffer, {
                packname: "⛓️Zero⛓️", // Consistent with your brat command
                author: m.pushName,
                emojis: "🗡️",
            });

            // 5. Send Sticker
            await m.reply({ sticker });

            // 6. Send Mention Text
            const senderTag = `@${m.sender.split('@')[0]}`;
            const targetTag = `@${user.split('@')[0]}`;
            await m.reply({
                text: `${senderTag} killed ${targetTag}`,
                mentions: [m.sender, user]
            });

        } catch (e) {
            console.error("[KILL ERROR]:", e);
            m.reply(`❌ Failed to create sticker: ${e.message}`);
        }
    }
};