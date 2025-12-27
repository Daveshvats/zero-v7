import fetch from "node-fetch";

export default {
        name: "simpcard",
        description: "Create a simp card for someone",
        command: ["simp", "simpcard"],
        permissions: "all",
        hidden: false,
        failed: "Failed to %command: %error",
        wait: "⏳ Creating simp card...",
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

                        const apiUrl = `https://some-random-api.com/canvas/misc/simpcard?avatar=${encodeURIComponent(avatar)}`;

                        const res = await fetch(apiUrl);
                        if (!res.ok) throw new Error("API request failed");

                        const buffer = Buffer.from(await res.arrayBuffer());

                        await m.reply({
                                image: buffer,
                                caption: `😆 *@${who.split("@")[0]} is a SIMP!*`,
                        });
                } catch (e) {
                        console.error("[simpcard ERROR]:", e);
                        m.reply(`❌ Failed to create simp card: ${e.message}`);
                }
        },
};
