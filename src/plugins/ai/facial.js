import { submitPollAndSend } from "#lib/ai-helper";
import itsrose from "#lib/itsrose";

// Hardcoded supported expressions for instant help
const EXPRESSIONS = [
    "laugh", "smile", "pursed_smile", "cool", "classic_smile" ,"classic_laugh"
];

export default {
    name: "facial-expression",
    description: "Change the facial expression of a person in an image.",
    command: ["expression", "face", "emo"],
    usage: "$prefix$command <expression> (reply to image)",
    category: "image",
    permissions: "all",
    limit: true,
    cooldown: 5,

    async execute(m, { api }) {
        const args = m.text ? m.text.trim().split(/\s+/) : [];
        const input = args[0] ? args[0].toLowerCase() : null;

        // --- 1. SHOW EXPRESSIONS IF NO INPUT ---
        if (!input) {
            let msg = "*🎭 AVAILABLE EXPRESSIONS*\n\n";
            msg += EXPRESSIONS.map(e => `• ${e}`).join("\n");
            msg += `\n\n*Usage:*\nReply to a photo with: \`.face laugh\``;
            return m.reply(msg);
        }

        // --- 2. VALIDATE EXPRESSION ---
        if (!EXPRESSIONS.includes(input)) {
            return m.reply(`❌ Expression *${input}* not found. Send \`.face\` alone to see the list.`);
        }

        // --- 3. MEDIA CHECK ---
        const quoted = m.quoted ? m.quoted : m;
              const isImage = m.type === 'imageMessage' || (m.quoted && m.quoted.type === 'imageMessage') || /image/i.test(quoted.mime || quoted.mimetype || "");

        if (!isImage) {
            return m.reply("📸 Please reply to an image to change the expression.");
        }

        try {
            await m.reply(`⌛ Changing expression to *${input}*...`);

            const buffer = await quoted.download();
            if (!buffer) return m.reply("❌ Failed to download image.");

            // --- 4. SUBMIT TO API ---
            const submit = await itsrose.post("/image/facial_expression", {
                expression: input,
                pci: true,
                cttp: true,
                init_image: buffer.toString("base64"),
                sync: false
            }).catch(e => e.response);

            if (!submit?.data?.ok) {
                return m.reply(`❌ API Error: ${submit?.data?.message || "Server error"}`);
            }

            // --- 5. POLLING + SEND ---
            return submitPollAndSend(m, submit.data.data, `✅ Expression: ${input}`, {
                pollPath: '/image/get_task',
                label: 'Facial Expression',
            });

        } catch (e) {
            console.error("EXPRESSION ERROR:", e);
            return m.reply(`❌ System Error: ${e.message}`);
        }
    }
};