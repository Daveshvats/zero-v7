import fetch from "node-fetch";

export default {
        name: "wasted",
        description: "Create a GTA wasted image",
        command: ["wasted", "gta"],
        permissions: "all",
        hidden: false,
        failed: "Failed to %command: %error",
        wait: "⏳ Creating wasted image...",
        category: "fun",
        cooldown: 10,
        limit: true,
        usage: "$prefix$command @user or reply",
        react: true,
        botAdmin: false,
        group: false,
        private: false,
        owner: false,

        async execute(m, { sock }) {
                const who = m.quoted?.sender || m.mentions[0] || m.sender;

                try {
                        let avatar;
                        try {
                                avatar = await sock.profilePictureUrl(who, "image");
                        } catch {
                                avatar = "https://telegra.ph/file/24fa902ead26340f3df2c.png";
                        }

                        const apiUrl = `https://some-random-api.com/canvas/overlay/wasted?avatar=${encodeURIComponent(avatar)}`;

                        const res = await fetch(apiUrl);
                        if (!res.ok) throw new Error("API request failed");

                        const buffer = Buffer.from(await res.arrayBuffer());

                        await m.reply({
                                image: buffer,
                                caption: `💀 *@${who.split("@")[0]} WASTED*`,
                        });
                } catch (e) {
                        console.error("[wasted ERROR]:", e);
                        m.reply(`❌ Failed to create wasted image: ${e.message}`);
                }
        },
};
