export default {
        name: "kick",
        description: "Kick member from group.",
        command: ["kick", "out"],
        permissions: "admin",
        hidden: false,
        failed: "Failed to %command: %error",
        wait: null,
        category: "group",
        cooldown: 5,
        limit: false,
        usage: "$prefix$command reply, tag or number user.",
        react: true,
        botAdmin: true,
        group: true,
        private: false,
        owner: false,

        /**
         * @param {import('baileys').WASocket} sock - The Baileys socket object.
         * @param {object} m - The serialized message object.
         */
        async execute(m, { sock, groupMetadata }) {
                try {
                const user = m?.quoted?.sender || m?.mentions?.[0];
                if (!user) {
                        return m.reply("Reply or tag a user");
                }

                if (!groupMetadata?.participants) {
                        return m.reply("Group metadata not available.");
                }

                // FIX: In LID groups, participant.jid may be @lid or undefined.
                // Use areJidsSameUser for proper comparison instead of strict .includes()
                const admins = groupMetadata.participants
                        .filter((participant) => participant.admin) || [];

                // Import areJidsSameUser lazily to avoid breaking if not available
                const { areJidsSameUser } = await import("baileys");
                const isUserAdmin = admins.some((admin) => {
                        const adminJid = admin.jid || admin.phoneNumber || admin.id;
                        return areJidsSameUser(adminJid, user);
                });

                if (isUserAdmin) {
                        return m.reply("You can't kick an admin");
                }

                await m.reply({
                        text: `Kicked @${user.replace(/[^0-9]/g, "")} from ${groupMetadata.subject}`,
                        mentions: [user],
                });

                await sock
                        .groupParticipantsUpdate(m.from, [user], "remove")
                        .catch(e => m.reply('❌ ' + e.message));
                } catch (error) {
                        await m.reply(`❌ Error: ${error.message || 'Unknown error occurred'}`);
                }
        },
};