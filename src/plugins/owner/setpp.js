import { S_WHATSAPP_NET } from "baileys";
import sharp from "sharp";

export default {
        name: "setpp",
        description: "Change profile picture.",
        command: ["setpp", "changepp"],
        permissions: "owner",
        hidden: false,
        failed: "Failed to %command: %error",
        wait: null,
        category: "owner",
        cooldown: 3,
        limit: false,
        usage: "$prefix$command send/reply_media.",
        react: true,
        botAdmin: false,
        group: false,
        private: false,
        owner: true,

        /**
         * @param {import('baileys').WASocket} sock - The Baileys socket object.
         * @param {object} m - The serialized message object.
         */
        async execute(m, { sock }) {
                try {
                        const q = m.isQuoted ? m.quoted : m;
                        const mime = q.type || "";

                        if (!/image|document/g.test(mime)) {
                                return m.reply("Please reply/send a image with the command.");
                        }

                        const media = await q.download();

                        async function pp() {
                                const metadata = await sharp(media).metadata();
                                let resized;
                                if (metadata.width > metadata.height) {
                                        resized = sharp(media).resize(720, null);
                                } else {
                                        resized = sharp(media).resize(null, 720);
                                }
                                return {
                                        img: await resized.jpeg().toBuffer(),
                                };
                        }

                        let { img } = await pp();
                        if (!img) {
                                return m.reply("Failed.");
                        }

                        await sock.query({
                                tag: "iq",
                                attrs: {
                                        to: S_WHATSAPP_NET,
                                        type: "set",
                                        xmlns: "w:profile:picture",
                                },
                                content: [
                                        {
                                                tag: "picture",
                                                attrs: { type: "image" },
                                                content: img,
                                        },
                                ],
                        });
                        m.reply("Successfully change profile picture.");
                } catch (error) {
                        await m.reply(`❌ Error: ${error.message || 'Unknown error occurred'}`);
                }
        },
};
