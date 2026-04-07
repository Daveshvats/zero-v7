import { S_WHATSAPP_NET } from "baileys";
import sharp from "sharp";

export default {
        name: "setppgc",
        description: "Change profile picture group.",
        command: ["setppgc", "changeppgc"],
        permissions: "admin",
        hidden: false,
        failed: "Failed to %command: %error",
        wait: null,
        category: "group",
        cooldown: 5,
        limit: false,
        usage: "$prefix$command send/reply_media.",
        react: true,
        botAdmin: true,
        group: true,
        private: false,
        owner: false,

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
                                        target: m.from,
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
                        m.reply("Successfully change group picture.");
                } catch (error) {
                        await m.reply(`❌ Error: ${error.message || 'Unknown error occurred'}`);
                }
        },
};
