import itsrose from "#lib/itsrose";
import { submitPollAndSend } from "#lib/ai-helper";

const V1_STYLES = [
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
    "cyberpunk", "dora",
];

export default {
    name: "different-me",
    description: "AI Image Style Changer (V1 & V2).",
    command: ["different-me", "diffme", "differentme"],
    usage: "$prefix$command [--v2] <style> (reply to image)\n$prefix$command --fetch [category_id]",
    category: "image",
    permissions: "all",
    limit: true,
    cooldown: 5,

    async execute(m) {
        const args = m.text ? m.text.trim().split(/\s+/) : [];
        const rawText = (m.text || "").trim();

        // --- FETCH STYLES FROM API ---
        if (rawText.includes("--fetch")) {
            const isV2 = rawText.includes("--v2");
            const catId = args.find(a => a && !a.startsWith("--") && a !== "fetch");
            const endpoint = isV2 ? "/different_me/get_styles_v2" : "/different_me/get_styles";

            try {
                await m.reply(`⌛ Fetching ${isV2 ? "V2" : "V1"} styles from API...`);

                const params = {};
                if (catId && isV2) params.category_id = catId;

                const res = await itsrose.get(endpoint, {
                    params,
                }).catch(e => e.response);

                if (!res?.data?.ok) {
                    return m.reply(`❌ API Error: ${res?.data?.message || "Server error"}`);
                }

                const styles = res.data.data?.styles || [];
                if (!styles.length) return m.reply("🔍 No styles found.");

                let msg = `🎭 *AVAILABLE ${isV2 ? "V2" : "V1"} STYLES* (${styles.length})\n\n`;
                for (const style of styles) {
                    const id = style.style_id || style.id || style;
                    const name = style.name || style.style_name || id;
                    msg += `• ${id}${name !== id ? ` (${name})` : ""}\n`;
                }
                msg += `\n*Usage:*\nReply to an image with: \`.diffme${isV2 ? " --v2" : ""} <style_id>\``;
                return m.reply(msg);
            } catch (e) {
                console.error("FETCH STYLES ERROR:", e);
                return m.reply(`❌ System Error: ${e.message}`);
            }
        }

        // Determine V1 vs V2
        const isV2 = rawText.includes("--v2");
        const styleInput = args.filter(a => !a.startsWith("--")).join(" ").toLowerCase() || null;

        // --- SHOW STYLES IF NO INPUT ---
        if (!styleInput) {
            const styles = isV2 ? "(fetch with --fetch)" : V1_STYLES;
            let msg = `🎭 *AVAILABLE ${isV2 ? "V2" : "V1"} STYLES*\n\n`;
            if (Array.isArray(styles)) {
                msg += styles.map(s => `• ${s}`).join("\n");
            } else {
                msg += `${styles}\nUse \`.diffme --v2 --fetch\` to fetch V2 styles from API.`;
            }
            msg += `\n\n*How to use:*\nReply to an image with: \`.diffme${isV2 ? " --v2" : ""} ${V1_STYLES[0]}\``;
            msg += `\n\n*Tip:* Use \`--v2\` for V2 styles, \`--fetch\` to load from API`;
            return m.reply(msg);
        }

        // Validate style (only for V1 hardcoded list; V2 styles are not validated locally)
        if (!isV2 && !V1_STYLES.includes(styleInput)) {
            return m.reply(`❌ Style *${styleInput}* not found. Send \`.diffme\` alone to see the list.`);
        }

        // --- MEDIA CHECK ---
        const quoted = m.quoted ? m.quoted : m;
        const isImage =
            m.type === "imageMessage" ||
            (m.quoted && m.quoted.type === "imageMessage") ||
            /image/i.test(quoted.mime || quoted.mimetype || "");

        if (!isImage) {
            return m.reply("📸 Please reply to an image or send an image with the command.");
        }

        try {
            await m.reply(`⌛ Applying ${isV2 ? "V2 " : ""}style *${styleInput}*...`);

            const buffer = await quoted.download();
            if (!buffer) return m.reply("❌ Failed to download image.");

            // Submit to correct endpoint
            const endpoint = isV2 ? "/different_me/transform_v2" : "/different_me/transform";
            const submit = await itsrose.post(
                endpoint,
                { init_image: buffer.toString("base64"), style_id: styleInput, sync: false }
            ).catch(e => e.response);

            if (!submit?.data?.ok) {
                return m.reply(`❌ API Error: ${submit?.data?.message || "Server Unreachable"}`);
            }

            return submitPollAndSend(m, submit.data.data, `✅ ${isV2 ? "V2 " : ""}Style: ${styleInput}`, {
                pollPath: '/different_me/get_task',
                label: 'Style Transfer',
            });
        } catch (e) {
            console.error("DIFFME ERROR:", e);
            return m.reply(`❌ System Error: ${e.message}`);
        }
    },
};
