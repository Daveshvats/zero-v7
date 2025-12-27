import axios from "axios";
import * as cheerio from "cheerio";
import FormData from "form-data";

const LOGO_EFFECTS = [
        { title: "neon", url: "https://textpro.me/neon-text-effect-online-963.html" },
        { title: "3d-gold", url: "https://textpro.me/3d-luxury-gold-text-effect-online-1003.html" },
        { title: "glitch", url: "https://textpro.me/create-a-glitch-text-effect-online-free-1026.html" },
        { title: "blackpink", url: "https://textpro.me/create-blackpink-logo-style-online-1001.html" },
        { title: "graffiti", url: "https://textpro.me/create-wonderful-graffiti-art-text-effect-1011.html" },
        { title: "thunder", url: "https://textpro.me/online-thunder-text-effect-generator-1031.html" },
        { title: "neon-galaxy", url: "https://textpro.me/neon-light-text-effect-with-galaxy-style-981.html" },
        { title: "cloud", url: "https://textpro.me/create-a-cloud-text-effect-on-the-sky-online-1004.html" },
        { title: "fire", url: "https://textpro.me/create-a-magma-hot-text-effect-online-1030.html" },
        { title: "metal", url: "https://textpro.me/create-a-metallic-text-effect-free-online-1041.html" },
        { title: "horror", url: "https://textpro.me/create-green-horror-style-text-effect-online-1036.html" },
        { title: "berry", url: "https://textpro.me/create-berry-text-effect-online-free-1033.html" },
        { title: "christmas", url: "https://textpro.me/create-a-christmas-holiday-snow-text-effect-1007.html" },
        { title: "retro", url: "https://textpro.me/80-s-retro-neon-text-effect-online-979.html" },
        { title: "avengers", url: "https://textpro.me/create-3d-avengers-logo-online-974.html" },
        { title: "marvel", url: "https://textpro.me/create-logo-style-marvel-studios-online-971.html" },
        { title: "silver", url: "https://textpro.me/deluxe-silver-text-effect-970.html" },
        { title: "carbon", url: "https://textpro.me/glossy-carbon-text-effect-965.html" },
        { title: "balloon", url: "https://textpro.me/foil-balloon-text-effect-for-birthday-987.html" },
        { title: "sand", url: "https://textpro.me/write-in-sand-summer-beach-free-online-991.html" },
];

async function createLogo(url, texts) {
        try {
                const response = await axios.get(url);
                const $ = cheerio.load(response.data);
                const form = $("form").first();
                const action = form.attr("action");
                const inputs = form.find('input[name^="text"]');
                
                if (inputs.length === 0) {
                        throw new Error("No text inputs found");
                }

                const formData = new FormData();
                let textIndex = 0;
                
                form.find("input, select").each((_, el) => {
                        const name = $(el).attr("name");
                        const value = $(el).val();
                        if (name) {
                                if (name.startsWith("text") && textIndex < texts.length) {
                                        formData.append(name, texts[textIndex++]);
                                } else if (value) {
                                        formData.append(name, value);
                                }
                        }
                });

                const baseUrl = new URL(url).origin;
                const submitUrl = action?.startsWith("http") ? action : `${baseUrl}${action}`;

                const submitRes = await axios.post(submitUrl, formData, {
                        headers: {
                                ...formData.getHeaders(),
                                Referer: url,
                                Origin: baseUrl,
                        },
                        timeout: 30000,
                });

                const $result = cheerio.load(submitRes.data);
                const imageUrl = $result('img[src*="/image/"]').first().attr("src");
                
                if (!imageUrl) {
                        const altImage = $result('a[href*="/image/"]').first().attr("href");
                        if (altImage) {
                                return { image: altImage.startsWith("http") ? altImage : `${baseUrl}${altImage}` };
                        }
                        throw new Error("Could not find result image");
                }

                return { image: imageUrl.startsWith("http") ? imageUrl : `${baseUrl}${imageUrl}` };
        } catch (error) {
                console.error("Logo creation error:", error.message);
                throw error;
        }
}

export default {
        name: "logos",
        description: "Create stylized text logos with various effects",
        command: ["logo", "logos", "textpro"],
        permissions: "all",
        hidden: false,
        failed: "Failed to %command: %error",
        wait: "⏳ Creating logo... (this may take a moment)",
        category: "tools",
        cooldown: 15,
        limit: true,
        usage: "$prefix$command <effect> <text>\nExample: !logo neon MyText",
        react: true,
        botAdmin: false,
        group: false,
        private: false,
        owner: false,

        async execute(m, { sock, args }) {
                if (!args[0]) {
                        const effectList = LOGO_EFFECTS.map((e) => `• ${e.title}`).join("\n");
                        return m.reply(
                                `🎨 *LOGO EFFECTS*\n\n${effectList}\n\n*Usage:* !logo <effect> <text>\n*Example:* !logo neon Katsumi`
                        );
                }

                const effect = args[0].toLowerCase();
                const text = args.slice(1).join(" ");

                if (!text) {
                        return m.reply(`❌ Please provide text for your logo!\n*Usage:* !logo ${effect} YourText`);
                }

                const selectedEffect = LOGO_EFFECTS.find(
                        (e) => e.title.toLowerCase() === effect
                );

                if (!selectedEffect) {
                        const effectList = LOGO_EFFECTS.map((e) => `• ${e.title}`).join("\n");
                        return m.reply(
                                `❌ Effect "${effect}" not found!\n\n🎨 *Available Effects:*\n${effectList}`
                        );
                }

                try {
                        const texts = text.includes("|") 
                                ? text.split("|").map((t) => t.trim()) 
                                : [text];

                        const result = await createLogo(selectedEffect.url, texts);

                        if (!result?.image) {
                                throw new Error("Failed to generate logo");
                        }

                        await sock.sendMessage(
                                m.chat,
                                {
                                        image: { url: result.image },
                                        caption: `✨ *Logo Created!*\n🎨 Effect: ${selectedEffect.title}\n📝 Text: ${text}`,
                                },
                                { quoted: m.msg }
                        );
                } catch (e) {
                        console.error("[logos ERROR]:", e);
                        m.reply(`❌ Failed to create logo: ${e.message}\n\nTry a different effect or try again later.`);
                }
        },
};
