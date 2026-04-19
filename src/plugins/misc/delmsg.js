export default {
        name: "deletemessage",
        description: "Delete message.",
        command: ["del", "delete"],
        permissions: "all",
        hidden: false,
        failed: "Failed to %command: %error",
        wait: null,
        category: "misc",
        cooldown: 5,
        limit: false,
        usage: "$prefix$command <reply_message>",
        react: false,
        botAdmin: false,
        group: false,
        private: false,
        owner: false,

        /**
         * @param {import('baileys').WASocket} sock - The Baileys socket object.
         * @param {object} m - The serialized message object.
         */
        execute: async (m, { isAdmin, isOwner, isBotAdmin }) => {
                try {
                        if (m.quoted) {
                                // Only allow if sender is deleting their own message, or sender is admin/bot-admin
                                if (m.quoted.fromMe || m.isAdmin || m.isBotAdmin || m.isOwner) {
                                        await m.quoted.delete();
                                } else {
                                        await m.reply("❌ You can only delete your own messages or need admin privileges.");
                                }
                        }
                } catch (error) {
                        await m.reply(`❌ Error: ${error.message || 'Unknown error occurred'}`);
                }
        },
};
