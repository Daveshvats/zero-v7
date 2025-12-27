import axios from "axios";

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
        const apiKey = "sk_PNcLyV1b7EU6lGCMrOMPJBRyHPcHcojdHc-INT1qsrw";
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
            const submit = await axios.post("https://api.itsrose.net/image/hair_change", {
                hair_id: input,
                init_image: buffer.toString("base64"),
                sync: true 
            }, {
                headers: { 
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}` 
                }
            }).catch(e => e.response);

            if (!submit?.data?.status) {
                return m.reply(`❌ API Error: ${submit?.data?.message || "Server error"}`);
            }

            const res = submit.data.result;

            // --- 5. HANDLE IMMEDIATE RESULT (Sync: true) ---
            if (res.images && res.images.length > 0) {
                for (const url of res.images) {
                    await m.reply({ image: { url }, caption: `✅ Hairstyle: ${input}` });
                }
                return;
            }

            // --- 6. POLLING FALLBACK (if status is 'processing') ---
            if (res.task_id) {
                const taskId = res.task_id;
                let attempts = 0;
                while (attempts < 35) {
                    await new Promise(r => setTimeout(r, 4000));
                    
                    const check = await axios.get("https://api.itsrose.net/image/get_task", {
                        params: { task_id: taskId },
                        headers: { Authorization: `Bearer ${apiKey}` }
                    });

                    if (check.data?.status && check.data?.result) {
                        const statusRes = check.data.result;
                        if (statusRes.status === "completed") {
                            for (const url of statusRes.images) {
                                await m.reply({ image: { url }, caption: `✅ Hairstyle: ${input}` });
                            }
                            return;
                        }
                        if (statusRes.status === "failed") return m.reply("❌ Hair processing failed.");
                    }
                    attempts++;
                }
            }

        } catch (e) {
            console.error("HAIR CHANGE ERROR:", e);
            return m.reply(`❌ System Error: ${e.message}`);
        }
    }
};