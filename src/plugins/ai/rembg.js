import { sendAiImages } from "#lib/ai-helper";
import itsrose from "#lib/itsrose";

export default {
    name: "remove-background",
    description: "Remove background from an image using AI.",
    command: ["rembg", "nobg", "removebg"],
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
            return m.reply("📸 Please reply to an image to remove its background.");
        }

        try {
            await m.reply("⌛ Removing background...");

            const buffer = await quoted.download();
            if (!buffer) return m.reply("❌ Failed to download image.");

            const res = await itsrose.post(
                "/image/rembg",
                { init_image: buffer.toString("base64") }
            ).catch(e => e.response);

            if (!res?.data?.ok) {
                return m.reply(`❌ API Error: ${res?.data?.message || "Server error"}`);
            }

            const images = res.data.data?.images || [];
            if (!images.length) return m.reply("❌ No result returned.");

            await sendAiImages(m, images, "✅ Background removed", { label: "Background Removal" });
        } catch (e) {
            console.error("REMBG ERROR:", e);
            return m.reply(`❌ System Error: ${e.message}`);
        }
    },
};
