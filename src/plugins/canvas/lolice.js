import fetch from "node-fetch";

export default {
        name: "lolice",
        description: "Call the police on someone with lolice effect",
        command: ["lolice"],
        permissions: "all",
        hidden: false,
        failed: "Failed to %command: %error",
        wait: "⏳ Calling the police...",
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

                        const apiUrl = `https://some-random-api.com/canvas/lolice?avatar=${encodeURIComponent(avatar)}`;

                        const res = await fetch(apiUrl);
                        if (!res.ok) throw new Error("API request failed");

                        const buffer = Buffer.from(await res.arrayBuffer());

                        await m.reply({
                                image: buffer,
                                caption: `👮 *CALL THE POLICE!! 😱*\n@${who.split("@")[0]} is in trouble!`,
                        });
                } catch (e) {
                        console.error("[lolice ERROR]:", e);
                        m.reply(`❌ Failed to create lolice image: ${e.message}`);
                }
        },
};
