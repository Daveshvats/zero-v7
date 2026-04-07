import { sendAiImages } from "#lib/ai-helper";
import itsrose from "#lib/itsrose";

const REMINI_PRESETS = {
    default: {
        bokeh: "background_blur_medium",
        color_enhance: "prism-blend",
        background_enhance: "shiba-strong-tensorrt",
        face_lifting: "pinko_bigger_dataset-style",
        face_enhance: "remini",
    },
    movie: {
        bokeh: "background_blur_high",
        color_enhance: "orange-teal",
        background_enhance: "rhino-tensorrt",
        face_lifting: "movie-style",
        face_enhance: "remini",
    },
    anime: {
        bokeh: "background_blur_low",
        color_enhance: "silky",
        background_enhance: "shiba-strong-tensorrt",
        face_lifting: "marzipan-style",
        face_enhance: "remini",
    },
    warm: {
        bokeh: "background_blur_medium",
        color_enhance: "lit_soft_warm",
        background_enhance: "shiba-strong-tensorrt",
        face_lifting: "pinko_bigger_dataset-style",
        face_enhance: "remini",
    },
    muted: {
        bokeh: "background_blur_low",
        color_enhance: "muted",
        background_enhance: "upsampler-bicubic",
        face_lifting: "marzipan-style",
        face_enhance: "remini",
    },
};

export default {
    name: "remini-enhance",
    description: "Enhance and restore image quality with AI Remini pipeline.",
    command: ["remini", "enhance", "hd"],
    usage: "$prefix$command [preset] (reply to image)",
    category: "image",
    permissions: "all",
    limit: true,
    cooldown: 5,

    async execute(m) {
        const args = m.text ? m.text.trim().split(/\s+/) : [];
        const preset = args[0] ? args[0].toLowerCase() : "default";

        // Show presets if requested or invalid
        if (preset === "list" || preset === "presets") {
            let msg = "*🎨 REMINI PRESETS*\n\n";
            for (const [name] of Object.entries(REMINI_PRESETS)) {
                msg += `• ${name}\n`;
            }
            msg += `\n*Usage:*\nReply to an image with: \`.remini movie\``;
            return m.reply(msg);
        }

        const pipeline = REMINI_PRESETS[preset];
        if (!pipeline) {
            return m.reply(`❌ Preset *${preset}* not found. Use \`.remini list\` to see available presets.`);
        }

        const quoted = m.quoted ? m.quoted : m;
        const isImage =
            m.type === "imageMessage" ||
            (m.quoted && m.quoted.type === "imageMessage") ||
            /image/i.test(quoted.mime || quoted.mimetype || "");

        if (!isImage) {
            return m.reply("📸 Please reply to an image to enhance.");
        }

        try {
            await m.reply(`⌛ Enhancing image with *${preset}* preset...`);

            const buffer = await quoted.download();
            if (!buffer) return m.reply("❌ Failed to download image.");

            const res = await itsrose.post(
                "/image/remini",
                { init_image: buffer.toString("base64"), pipeline }
            ).catch(e => e.response);

            if (!res?.data?.ok) {
                return m.reply(`❌ API Error: ${res?.data?.message || "Server error"}`);
            }

            const images = res.data.data?.images || [];
            if (!images.length) return m.reply("❌ No result returned.");

            await sendAiImages(m, images, `✅ Enhanced (preset: ${preset})`, { label: "Remini" });
        } catch (e) {
            console.error("REMINI ERROR:", e);
            return m.reply(`❌ System Error: ${e.message}`);
        }
    },
};
