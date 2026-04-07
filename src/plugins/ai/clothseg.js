import { submitPollAndSend } from "#lib/ai-helper";
import itsrose from "#lib/itsrose";

export default {
    name: "cloth-segmentation",
    description: "Segment and extract clothing from an image.",
    command: ["clothseg", "segment"],
    usage: "$prefix$command (reply to image)",
    category: "image",
    permissions: "all",
    limit: true,
    cooldown: 5,

    async execute(m) {
        const quoted = m.quoted ? m.quoted : m;
        const isImage =
            m.type === "imageMessage" ||
            (m.quoted && m.quoted.type === "imageMessage") ||
            /image/i.test(quoted.mime || quoted.mimetype || "");

        if (!isImage) {
            return m.reply("📸 Please reply to an image to extract clothing.");
        }

        try {
            await m.reply("⌛ Segmenting clothing...");

            const buffer = await quoted.download();
            if (!buffer) return m.reply("❌ Failed to download image.");

            const submit = await itsrose.post(
                "/image/cloth_segmentation",
                { init_image: buffer.toString("base64"), sync: false }
            ).catch(e => e.response);

            if (!submit?.data?.ok) {
                return m.reply(`❌ API Error: ${submit?.data?.message || "Server error"}`);
            }

            return submitPollAndSend(m, submit.data.data, "✅ Clothing segmented", {
                pollPath: '/image/get_task',
                label: 'Cloth Segmentation',
            });
        } catch (e) {
            console.error("CLOTH SEG ERROR:", e);
            return m.reply(`❌ System Error: ${e.message}`);
        }
    },
};
