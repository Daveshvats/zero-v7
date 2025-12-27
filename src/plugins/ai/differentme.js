import axios from "axios";

const STYLES_LIST = [
    "animal_fest", "old", "doll", "metal", "8bit", "city", "blazing_torch",
    "clay", "realism", "simulife", "sketch", "zombie", "oil_stick", "balloon",
    "pipe_craft", "crystal", "felt", "jade", "pink_girl", "vivid", "eastern",
    "mythical", "pixel_game", "league", "lineage", "happiness", "manga",
    "sweet", "pixel_art", "catwoman", "loose", "sakura", "pocket", "grains",
    "graduation", "oil_pastel", "flora_tour", "loong_year", "figure",
    "prospera", "guardians", "expedition", "leisure", "giftify", "amiable",
    "3d_cartoon", "sketch_ii", "collage", "mini_doll", "sketchresize",
    "cartoon", "fluffy", "insta", "local_graffiti", "peking_opera", "opera",
    "torch", "sport", "dunk", "anime25d", "anime", "comic_rl", "manhwa",
    "manhwa_female", "manhwa_male", "samyang", "comic_idol", "anime_ghibli",
    "anime_shinchan", "anime_chibi", "powerpuff", "anime_splash", "anime_dream",
    "game_lol", "game_ps2", "game_gta", "game_sim", "game_lr", "game_dress_up",
    "game_persona", "game_stardew_valley", "game_undawn", "game_lineage",
    "game_fantasy", "k_comic", "minecraft", "card_game", "kartun_dress_up",
    "cyberpunk", "dora"
];

export default {
    name: "different-me",
    description: "AI Image Style Changer",
    command: ["different-me", "diffme", "differentme"],
    usage: "$prefix$command <style>",
    category: "image",
    permissions: "all",
    limit: true,
    cooldown: 5,

    async execute(m, { api }) {
        const apiKey = "sk_PNcLyV1b7EU6lGCMrOMPJBRyHPcHcojdHc-INT1qsrw";
        
        // We use m.args if available, otherwise we split m.text manually
        // This ensures the bot sees the text even if m.text is formatted strangely
        const args = m.text ? m.text.trim().split(/\s+/) : [];
        const input = args[0] ? args[0].toLowerCase() : null;

        // --- 1. IF NO INPUT: SHOW STYLES ---
        if (!input) {
            let msg = "*🎭 AVAILABLE STYLES*\n\n";
            msg += STYLES_LIST.map(s => `• ${s}`).join("\n");
            msg += `\n\n*How to use:*\nReply to an image with: \`.diffme ${STYLES_LIST[0]}\``;
            return m.reply(msg);
        }

        // --- 2. VALIDATE STYLE ---
        if (!STYLES_LIST.includes(input)) {
            return m.reply(`❌ Style *${input}* not found. Send \`.diffme\` alone to see the list.`);
        }

        // --- 3. MEDIA CHECK ---
        const quoted = m.quoted ? m.quoted : m;
        // Check for image in the message or the quoted message
        const isImage = m.type === 'imageMessage' || (m.quoted && m.quoted.type === 'imageMessage') || /image/i.test(quoted.mime || quoted.mimetype || "");

        if (!isImage) {
            return m.reply("📸 Please reply to an image or send an image with the command.");
        }

        try {
            // We tell the user we are working
            await m.reply(`⌛ Applying style *${input}*...`);

            const buffer = await quoted.download();
            if (!buffer) return m.reply("❌ Failed to download image.");

            // --- 4. SUBMIT TO API ---
            const submit = await axios.post("https://api.itsrose.net/image/different_me", {
                init_image: buffer.toString("base64"),
                style_id: input,
                sync: false,
            }, {
                headers: { 
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}` 
                }
            }).catch(e => e.response); // Catch axios errors to see what API says

            if (!submit?.data?.status) {
                return m.reply(`❌ API Error: ${submit?.data?.message || "Server Unreachable"}`);
            }

            const taskId = submit.data.result.task_id;

            // --- 5. POLLING LOOP ---
            let attempts = 0;
            while (attempts < 35) {
                await new Promise(r => setTimeout(r, 4000)); // Wait 4s
                
                const check = await axios.get("https://api.itsrose.net/image/get_task", {
                    params: { task_id: taskId },
                    headers: { Authorization: `Bearer ${apiKey}` }
                });

                if (check.data?.status && check.data?.result) {
                    const res = check.data.result;
                    
                    if (res.status === "completed") {
                        const images = res.images || [];
                        // Send all images at once
                        for (const url of images) {
                            await m.reply({ image: { url }, caption: `✅ Style: ${input}` });
                        }
                        return;
                    }

                    if (res.status === "failed") {
                        return m.reply("❌ The AI failed to process this specific image.");
                    }
                }
                attempts++;
            }

            return m.reply("⏰ Request timed out. The image is taking too long.");

        } catch (e) {
            console.error("DEBUG ERROR:", e);
            return m.reply(`❌ System Error: ${e.message}`);
        }
    }
};