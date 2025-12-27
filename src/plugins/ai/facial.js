import axios from "axios";

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
        const apiKey = "sk_PNcLyV1b7EU6lGCMrOMPJBRyHPcHcojdHc-INT1qsrw";
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
            const submit = await axios.post("https://api.itsrose.net/image/facial_expression", {
                expression: input,
                pci: true, // Enhance quality
                cttp: true, // Context processing
                init_image: buffer.toString("base64"),
                sync: false // Set to false to handle polling for stability
            }, {
                headers: { 
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}` 
                }
            }).catch(e => e.response);

            if (!submit?.data?.status) {
                return m.reply(`❌ API Error: ${submit?.data?.message || "Server error"}`);
            }

            // --- 5. POLLING (Check Result) ---
            const taskId = submit.data.result.task_id;
            let attempts = 0;

            while (attempts < 35) {
                await new Promise(r => setTimeout(r, 4000)); // Check every 4s
                
                const check = await axios.get("https://api.itsrose.net/image/get_task", {
                    params: { task_id: taskId },
                    headers: { Authorization: `Bearer ${apiKey}` }
                });

                if (check.data?.status && check.data?.result) {
                    const res = check.data.result;
                    
                    if (res.status === "completed") {
                        const images = res.images || [];
                        // Parallel sending for better performance
                        await Promise.all(images.map(url => 
                            m.reply({ image: { url }, caption: `✅ Expression: ${input}` })
                        ));
                        return;
                    }

                    if (res.status === "failed") {
                        return m.reply("❌ Failed to modify the face in this image.");
                    }
                }
                attempts++;
            }

            return m.reply("⏰ Request timed out. The server is busy.");

        } catch (e) {
            console.error("EXPRESSION ERROR:", e);
            return m.reply(`❌ System Error: ${e.message}`);
        }
    }
};