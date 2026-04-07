import itsrose from "#lib/itsrose";
import { submitPollAndSend } from "#lib/ai-helper";

const RESTORATION_MODES = [
    "HD", "UHD", "NG_UHD", "GAME", "ANIME", "PRODUCT", "TEXT"
];

export default {
    name: "restoration",
    description: "Restore, upscale, and denoise images with AI.",
    command: ["restore", "upscale"],
    usage: "$prefix$command <mode> (reply to image)",
    category: "image",
    permissions: "all",
    limit: true,
    cooldown: 5,

    async execute(m) {
        const args = m.text ? m.text.trim().split(/\s+/) : [];
        const input = args[0] ? args[0].toUpperCase() : null;

        // Show modes if no input
        if (!input) {
            let msg = "*🔧 RESTORATION MODES*\n\n";
            msg += RESTORATION_MODES.map(mode => `• ${mode}`).join("\n");
            msg += `\n\n*Usage:*\nReply to an image with: \`.restore HD\``;
            return m.reply(msg);
        }

        if (!RESTORATION_MODES.includes(input)) {
            return m.reply(`❌ Mode *${input}* not found. Send \`.restore\` alone to see modes.`);
        }

        const quoted = m.quoted ? m.quoted : m;
        const isImage =
            m.type === "imageMessage" ||
            (m.quoted && m.quoted.type === "imageMessage") ||
            /image/i.test(quoted.mime || quoted.mimetype || "");

        if (!isImage) {
            return m.reply("📸 Please reply to an image to restore.");
        }

        try {
            await m.reply(`⌛ Restoring image with *${input}* mode...`);

            const buffer = await quoted.download();
            if (!buffer) return m.reply("❌ Failed to download image.");

            const submit = await itsrose.post(
                "/image/restoration",
                { init_image: buffer.toString("base64"), restoration_mode: input, sync: false }
            ).catch(e => e.response);

            if (!submit?.data?.ok) {
                return m.reply(`❌ API Error: ${submit?.data?.message || "Server error"}`);
            }

            return submitPollAndSend(m, submit.data.data, `✅ Restored (mode: ${input})`, {
                pollPath: '/image/get_task',
                label: 'Image Restoration',
            });
        } catch (e) {
            console.error("RESTORATION ERROR:", e);
            return m.reply(`❌ System Error: ${e.message}`);
        }
    },
};
