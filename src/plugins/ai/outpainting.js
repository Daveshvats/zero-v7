import { submitPollAndSend } from "#lib/ai-helper";
import itsrose from "#lib/itsrose";

export default {
    name: "outpainting",
    description: "Expand image boundaries by generating new content (outpainting).",
    command: ["outpaint", "expand"],
    usage: "$prefix$command <ratio 0-1> (reply to image)\nExample: $prefix$command 0.3",
    category: "image",
    permissions: "all",
    limit: true,
    cooldown: 5,

    async execute(m) {
        const args = m.text ? m.text.trim().split(/\s+/) : [];
        const input = args[0] ? parseFloat(args[0]) : null;

        if (isNaN(input) || input <= 0 || input > 1) {
            return m.reply(
                "📸 *OUTPAINTING*\n\n" +
                "Expand image boundaries with AI-generated content.\n\n" +
                "*Usage:*\nReply to an image with: `.outpaint 0.3`\n\n" +
                "*Ratio:* 0.1 (small) to 1.0 (large) — how much to expand each side."
            );
        }

        const quoted = m.quoted ? m.quoted : m;
        const isImage =
            m.type === "imageMessage" ||
            (m.quoted && m.quoted.type === "imageMessage") ||
            /image/i.test(quoted.mime || quoted.mimetype || "");

        if (!isImage) {
            return m.reply("📸 Please reply to an image to outpaint.");
        }

        try {
            await m.reply(`⌛ Expanding image by ${Math.round(input * 100)}%...`);

            const buffer = await quoted.download();
            if (!buffer) return m.reply("❌ Failed to download image.");

            const submit = await itsrose.post(
                "/image/outpainting",
                { init_image: buffer.toString("base64"), expand_ratio: input, sync: false }
            ).catch(e => e.response);

            if (!submit?.data?.ok) {
                return m.reply(`❌ API Error: ${submit?.data?.message || "Server error"}`);
            }

            return submitPollAndSend(m, submit.data.data, `✅ Expanded by ${Math.round(input * 100)}%`, {
                pollPath: '/image/get_task',
                label: 'Outpainting',
            });
        } catch (e) {
            console.error("OUTPAINT ERROR:", e);
            return m.reply(`❌ System Error: ${e.message}`);
        }
    },
};
