import itsrose from "#lib/itsrose";
import { submitPollAndSend } from "#lib/ai-helper";

const TURN_ME_STYLES = [
    "horrible-zombie", "halloween-makeup", "dark-gothic", "halloween-dark-makeup", "japanese-horror",
    "synthwave-punk", "chocolate-man", "crazy-scientist", "don-t-starve", "white-statue",
    "colorful-illustration", "paper-cut-craft", "blood-of-blue", "cyber-punk", "fanatic-adventure",
    "legend-of-elf", "realistic-muscle-man", "new-realistic-muscle", "racer", "cute-cartoon",
    "super-hero", "pixel-art", "retro-style", "black-swing", "fairy-tale",
    "thick-impasto", "rainbow-hair", "30-s-style", "water-magic", "on-fire",
    "luminous-cloud", "pocket-pet", "spirited-wind", "3d-style", "red-redemption",
    "boxing-man", "hell-kight", "calendar-girl", "cute-illustration", "aging-filter",
    "realistic-fire", "tattoo-magic", "christmas-girl", "ps-game-style-1", "thunderstruck-armor",
    "lightning-punk", "aether-punk", "new-world-s-pirates", "legend-fighters", "barbie-girl",
    "cool-guy", "muscle-man", "blindbox", "melted-chocolate", "90s-comic",
    "realistic-thunderstruck-armor", "anime-2d", "realistic-lightning-punk", "white-skin", "hourglass-body-shape",
    "pixel-style", "anime-hero", "christmas-3d", "christmas-family", "cartoon",
    "80-s-style", "christmas-cartoon", "ps-game-style-2", "anime", "city-punk",
    "cartoon-tattoo-muscle", "christmas-comic", "magic-muscle", "super-bowl", "romantic-anime",
    "animal-ears", "skeleton-bride", "joker",
];

export default {
    name: "turn-me",
    description: "Transform your image into a different style/persona (Turn Me AI).",
    command: ["turnme", "turn-me"],
    usage: "$prefix$command <style> (reply to image)",
    category: "image",
    permissions: "all",
    limit: true,
    cooldown: 5,

    async execute(m) {
        const args = m.text ? m.text.trim().split(/\s+/) : [];
        const input = args[0] ? args[0].toLowerCase() : null;

        // Show styles if no input
        if (!input) {
            let msg = "*🎭 TURN ME — STYLE TRANSFORM*\n\n";
            msg += TURN_ME_STYLES.map(s => `• ${s}`).join("\n");
            msg += `\n\n*Usage:*\nReply to an image with: \`.turnme cyber-punk\``;
            return m.reply(msg);
        }

        // Exact match first
        let styleId = TURN_ME_STYLES.includes(input) ? input : null;

        // Fuzzy match: check if input is a substring of any style, or vice versa
        if (!styleId) {
            styleId = TURN_ME_STYLES.find(s =>
                s.includes(input) || input.includes(s)
            );
        }

        if (!styleId) {
            return m.reply(`❌ Style *${input}* not found. Send \`.turnme\` alone to see the list.`);
        }

        const quoted = m.quoted ? m.quoted : m;
        const isImage =
            m.type === "imageMessage" ||
            (m.quoted && m.quoted.type === "imageMessage") ||
            /image/i.test(quoted.mime || quoted.mimetype || "");

        if (!isImage) {
            return m.reply("📸 Please reply to an image to transform.");
        }

        try {
            await m.reply(`⌛ Transforming to *${styleId}*...`);

            const buffer = await quoted.download();
            if (!buffer) return m.reply("❌ Failed to download image.");

            const { data: submit } = await itsrose.post("/turn_me/transform", {
                init_image: buffer.toString("base64"),
                style_id: styleId,
                image_num: 1,
            }).catch(e => e.response);

            if (!submit?.ok) {
                return m.reply(`❌ API Error: ${submit?.message || "Server error"}`);
            }

            return submitPollAndSend(m, submit.data, `✅ Turn Me: ${styleId}`, {
                pollPath: '/turn_me/get_task',
                label: 'Turn Me',
            });
        } catch (e) {
            console.error("TURN ME ERROR:", e);
            return m.reply(`❌ System Error: ${e.message}`);
        }
    },
};
