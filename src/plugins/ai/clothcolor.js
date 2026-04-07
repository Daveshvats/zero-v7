import itsrose from "#lib/itsrose";
import { submitPollAndSend } from "#lib/ai-helper";

const CLOTH_CATEGORIES = [
    "None", "dress", "up", "down", "coat", "up-down", "jumpsuit"
];

export default {
    name: "cloth-color",
    description: "Change the color of clothes in an image.",
    command: ["clothcolor", "recolor"],
    usage: "$prefix$command <#hex_color> [category] (reply to image)\nExample: $prefix$command #FF0000 dress",
    category: "image",
    permissions: "all",
    limit: true,
    cooldown: 5,

    async execute(m) {
        const args = m.text ? m.text.trim().split(/\s+/) : [];
        const color = args[0] || null;
        const category = args[1] ? args[1].charAt(0).toUpperCase() + args[1].slice(1).toLowerCase() : "None";

        if (!color) {
            let msg = "*🎨 CLOTH COLOR CHANGE*\n\n";
            msg += "*Usage:*\nReply to an image with: `.clothcolor #FF0000 dress`\n\n";
            msg += "*Categories:*\n";
            msg += CLOTH_CATEGORIES.map(c => `• ${c}`).join("\n");
            msg += "\n\n*Color:* Use hex format like `#FF0000` (red), `#0000FF` (blue)";
            return m.reply(msg);
        }

        // Validate hex color
        if (!/^#([0-9A-Fa-f]{3}){1,2}$/.test(color)) {
            return m.reply("❌ Invalid color format. Use hex like `#FF0000`.");
        }

        if (!CLOTH_CATEGORIES.includes(category)) {
            return m.reply(`❌ Category *${category}* not found. Available: ${CLOTH_CATEGORIES.join(", ")}`);
        }

        const quoted = m.quoted ? m.quoted : m;
        const isImage =
            m.type === "imageMessage" ||
            (m.quoted && m.quoted.type === "imageMessage") ||
            /image/i.test(quoted.mime || quoted.mimetype || "");

        if (!isImage) {
            return m.reply("📸 Please reply to an image.");
        }

        try {
            await m.reply(`⌛ Changing cloth color to *${color}*...`);

            const buffer = await quoted.download();
            if (!buffer) return m.reply("❌ Failed to download image.");

            const submit = await itsrose.post(
                "/image/change_cloth_color",
                {
                    init_image: buffer.toString("base64"),
                    color,
                    category,
                    sync: false,
                }
            ).catch(e => e.response);

            if (!submit?.data?.ok) {
                return m.reply(`❌ API Error: ${submit?.data?.message || "Server error"}`);
            }

            return submitPollAndSend(m, submit.data.data, `✅ Color: ${color} | Category: ${category}`, {
                pollPath: '/image/get_task',
                label: 'Cloth Color Change',
            });
        } catch (e) {
            console.error("CLOTH COLOR ERROR:", e);
            return m.reply(`❌ System Error: ${e.message}`);
        }
    },
};
