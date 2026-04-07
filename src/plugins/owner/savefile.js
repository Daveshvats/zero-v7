import { writeFile } from "node:fs/promises";

export default {
        name: "savefile",
        description: "Save file.",
        command: ["sf", "savefile"],
        permissions: "owner",
        hidden: false,
        failed: "Failed to %command: %error",
        wait: null,
        category: "owner",
        cooldown: 5,
        limit: false,
        usage: "$prefix$command <reply_code>",
        react: true,
        botAdmin: false,
        group: false,
        private: false,
        owner: true,

        /**
         * @param {import('baileys').WASocket} sock - The Baileys socket object.
         * @param {object} m - The serialized message object.
         */
        execute: async (m) => {
                try {
                        if (!m.text) {
                                return m.reply(
                                        `Where is the path?\n${m.prefix + m.command} src/plugin/*/icikiwir.js`
                                );
                        }
                        if (!m.quoted.text) {
                                return m.reply("Reply code.");
                        }
                        await writeFile(m.text, m.quoted.text);
                        m.reply(`Saved ${m.text} to file.`);
                } catch (error) {
                        await m.reply(`❌ Error: ${error.message || 'Unknown error occurred'}`);
                }
        },
};
