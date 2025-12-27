import fetch from "node-fetch";

export default {
        name: "stupid",
        description: "Create an 'it's so stupid' meme",
        command: ["stupid", "itssostupid"],
        permissions: "all",
        hidden: false,
        failed: "Failed to %command: %error",
        wait: "⏳ Creating stupid meme...",
        category: "fun",
        cooldown: 10,
        limit: true,
        usage: "$prefix$command [text] @user or reply",
        react: true,
        botAdmin: false,
        group: false,
        private: false,
        owner: false,

        async execute(m, { sock, args }) {
                const who = m.quoted?.sender || m.mentions[0] || m.sender;
                const text = args.filter((a) => !a.includes("@")).join(" ") || "I'm stupid";

                try {
                        let avatar;
                        try {
                                avatar = await sock.profilePictureUrl(who, "image");
                        } catch {
                                avatar = "https://telegra.ph/file/24fa902ead26340f3df2c.png";
                        }

                        const apiUrl = `https://some-random-api.com/canvas/misc/its-so-stupid?avatar=${encodeURIComponent(avatar)}&dog=${encodeURIComponent(text)}`;

                        const res = await fetch(apiUrl);
                        if (!res.ok) throw new Error("API request failed");

                        const buffer = Buffer.from(await res.arrayBuffer());

                        await m.reply({
                                image: buffer,
                                caption: `🐕 *@${who.split("@")[0]}*: "${text}"`,
                        });
                } catch (e) {
                        console.error("[stupid ERROR]:", e);
                        m.reply(`❌ Failed to create meme: ${e.message}`);
                }
        },
};
