import { submitPollAndSend } from "#lib/ai-helper";
import itsrose from "#lib/itsrose";

// Hardcoded Hair Style IDs for instant help
const HAIR_STYLES = [
    "straight_shoulder-length",
    "wavy_shoulder-length",
    "long_wavy",
    "long_wavy_more-volume",
    "straight_medium-length"
];

export default {
    name: "hair-change",
    description: "Change the hairstyle of a person in an image.",
    command: ["hair", "hairchange", "hairstyle"],
    usage: "$prefix$command <hair_id> (reply to image)",
    category: "image",
    permissions: "all",
    limit: true,
    cooldown: 5,

    async execute(m, { api }) {
        const args = m.text ? m.text.trim().split(/\s+/) : [];
        const input = args[0] ? args[0].toLowerCase() : null;

        // --- 1. SHOW HAIR STYLES IF NO INPUT ---
        if (!input) {
            let msg = "*💇 AVAILABLE HAIR STYLES*\n\n";
            msg += HAIR_STYLES.map(h => `• ${h}`).join("\n");
            msg += `\n\n*Usage:*\nReply to a photo with: \`.hair long_wavy\``;
            return m.reply(msg);
        }

        // --- 2. VALIDATE HAIR ID ---
        if (!HAIR_STYLES.includes(input)) {
            return m.reply(`❌ Hairstyle *${input}* not found. Send \`.hair\` alone to see the list.`);
        }

        // --- 3. ROBUST MEDIA DETECTION ---
        const quoted = m.quoted ? m.quoted : m;
        const mime = (quoted.msg || quoted).mimetype || quoted.media?.mimetype || "";
        const type = m.type || "";
        const quotedType = m.quoted ? m.quoted.type : "";

        const isImage = /image/i.test(mime) || type === 'imageMessage' || quotedType === 'imageMessage';

        if (!isImage) {
            return m.reply("📸 Please reply to an image or send an image with the command to change hair.");
        }

        try {
            await m.reply(`⌛ Re-styling hair to *${input.replace(/_/g, ' ')}*...`);

            const buffer = await quoted.download().catch(() => null);
            if (!buffer) return m.reply("❌ Failed to download image. Try again.");

            // --- 4. SUBMIT TO API ---
            const submit = await itsrose.post("/image/hair_change", {
                hair_id: input,
                init_image: buffer.toString("base64"),
                sync: true 
            }).catch(e => e.response);

            if (!submit?.data?.ok) {
                return m.reply(`❌ API Error: ${submit?.data?.message || "Server error"}`);
            }

            const res = submit.data.data;

            return submitPollAndSend(m, res, `✅ Hairstyle: ${input}`, {
                pollPath: '/image/get_task',
                label: 'Hair Change',
            });

        } catch (e) {
            console.error("HAIR CHANGE ERROR:", e);
            return m.reply(`❌ System Error: ${e.message}`);
        }
    }
};