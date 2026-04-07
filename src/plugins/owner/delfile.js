import { access, stat, rm, unlink } from "node:fs/promises";
import { join } from "node:path";

export default {
        name: "deletefile",
        description: "Delete file.",
        command: ["df", "deletefile"],
        permissions: "owner",
        hidden: false,
        failed: "Failed to %command: %error",
        wait: null,
        category: "owner",
        cooldown: 5,
        limit: false,
        usage: "$prefix$command <name_file>",
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
                        const filePath = join(process.cwd(), m.text);
                        let fileExists = false;
                        try { await access(filePath); fileExists = true; } catch {}
                        if (!fileExists) {
                                return m.reply(
                                        "Sorry, the file or folder in question was not found."
                                );
                        }
                        if ((await stat(filePath)).isDirectory()) {
                                await rm(filePath, { recursive: true });
                        } else {
                                await unlink(filePath);
                        }

                        m.reply(`Successfully delete ${m.text}`);
                } catch (error) {
                        await m.reply(`❌ Error: ${error.message || 'Unknown error occurred'}`);
                }
        },
};
