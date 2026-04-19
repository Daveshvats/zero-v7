import fetch from "node-fetch";

export default {
        name: "qrcode",
        description: "Generate a QR code from text",
        command: ["qr", "qrcode", "qr-code"],
        permissions: "all",
        hidden: false,
        failed: "Failed to %command: %error",
        wait: "⏳ Creating QR code...",
        category: "canvas",
        cooldown: 10,
        limit: true,
        usage: "$prefix$command <text>",
        react: true,
        botAdmin: false,
        group: false,
        private: false,
        owner: false,

        async execute(m, { args }) {
                let text = args.join(" ");

                if (!text) {
                        if (m.quoted?.text) {
                                text = m.quoted.text;
                        } else {
                                return m.reply(
                                        `❌ Please provide text!\n\n*Usage:* !qr <text>\n*Example:* !qr Hello World!`
                                );
                        }
                }

                try {
                        // Limit text length to prevent API errors
                        if (text.length > 100) {
                                return m.reply(
                                        "❌ Text is too long! Maximum 100 characters allowed."
                                );
                        }

                        const apiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(text)}`;

                        const res = await fetch(apiUrl);
                        if (!res.ok) throw new Error("API request failed");

                        const buffer = Buffer.from(await res.arrayBuffer());

                        await m.reply({
                                image: buffer,
                                caption: `✍🏻 *QR Code Created!*\n\n📝 Text: ${text}`,
                        });
                } catch (e) {
                        console.error("[qrcode ERROR]:", e);
                        m.reply(`❌ Failed to create QR code: ${e.message}`);
                }
        },
};
