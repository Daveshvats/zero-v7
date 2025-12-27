import fetch from "node-fetch";

export default {
        name: "tweet",
        description: "Create a fake tweet image",
        command: ["tweet", "faketweet"],
        permissions: "all",
        hidden: false,
        failed: "Failed to %command: %error",
        wait: "⏳ Creating tweet...",
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
                if (!text) return m.reply("❌ Please provide tweet text!\nUsage: !tweet <text>");

                try {
                        let avatar;
                        try {
                                avatar = await sock.profilePictureUrl(m.sender, "image");
                        } catch {
                                avatar = "https://telegra.ph/file/24fa902ead26340f3df2c.png";
                        }

                        const username = m.pushName || "User";
                        const displayName = username;

                        const apiUrl = `https://some-random-api.com/canvas/misc/tweet?avatar=${encodeURIComponent(avatar)}&username=${encodeURIComponent(username)}&displayname=${encodeURIComponent(displayName)}&comment=${encodeURIComponent(text)}`;

                        const res = await fetch(apiUrl);
                        if (!res.ok) throw new Error("API request failed");

                        const buffer = Buffer.from(await res.arrayBuffer());

                        await m.reply({
                                image: buffer,
                                caption: `🐦 *Tweet by @${username}*`,
                        });
                } catch (e) {
                        console.error("[tweet ERROR]:", e);
                        m.reply(`❌ Failed to create tweet: ${e.message}`);
                }
        },
};
