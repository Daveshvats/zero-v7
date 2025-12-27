import fetch from "node-fetch";

export default {
        name: "comment",
        description: "Create a YouTube comment image",
        command: ["comment", "ytcomment"],
        permissions: "all",
        hidden: false,
        failed: "Failed to %command: %error",
        wait: "⏳ Creating comment...",
        category: "fun",
        cooldown: 10,
        limit: true,
        usage: "$prefix$command <text>",
        react: true,
        botAdmin: false,
        group: false,
        private: false,
        owner: false,

        async execute(m, { sock, args }) {
                const text = args.join(" ");
                if (!text) return m.reply("❌ Please provide a comment text!\nUsage: !comment <text>");

                try {
                        let avatar;
                        try {
                                avatar = await sock.profilePictureUrl(m.sender, "image");
                        } catch {
                                avatar = "https://telegra.ph/file/24fa902ead26340f3df2c.png";
                        }

                        const username = m.pushName || "User";

                        const apiUrl = `https://some-random-api.com/canvas/misc/youtube-comment?avatar=${encodeURIComponent(avatar)}&username=${encodeURIComponent(username)}&comment=${encodeURIComponent(text)}`;

                        const res = await fetch(apiUrl);
                        if (!res.ok) throw new Error("API request failed");

                        const buffer = Buffer.from(await res.arrayBuffer());

                        await m.reply({
                                image: buffer,
                                caption: `💬 *YouTube Comment by ${username}*`,
                        });
                } catch (e) {
                        console.error("[comment ERROR]:", e);
                        m.reply(`❌ Failed to create comment: ${e.message}`);
                }
        },
};
