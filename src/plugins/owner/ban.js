import { GroupModel, UserModel } from "#lib/database/index";
import { resolveLidToJid } from "#lib/serialize";

export default {
    name: "ban",
    description: "Ban or unban a user or group.",
    command: ["ban", "banchat", "unban", "unbanchat"],
    category: "owner",
    permissions: "owner",
    owner: true,
    react: true,
    wait: null,
    failed: "Failed to execute %command: %error",
    usage: "$prefix$command reply or tag user.",
    cooldown: 5,
    limit: false,
    botAdmin: false,
    group: false,
    private: false,

    execute: async (m, { groupMetadata }) => {
        try {
            const isUnbanCommand = ["unban", "unbanchat"].includes(m.command);

            if (m?.quoted?.sender || m.mentions[0]) {
                // Get the raw JID from quoted sender or mentions
                const rawJid = m?.quoted?.sender || m.mentions[0];

                // Resolve LID to regular JID using group participants (so it matches m.sender format)
                const participants = groupMetadata?.participants || [];
                const _user = resolveLidToJid(rawJid, participants);

                const targetName = m?.quoted?.pushName || _user.split("@")[0];
                await UserModel.setUser(_user, { name: targetName });

                if (isUnbanCommand) {
                    await UserModel.setBanned(_user, false);
                    await m.reply(`Unbanned @${_user.split("@")[0]}`);
                } else {
                    const user = await UserModel.getUser(_user);
                    const newBanned = !user?.banned;
                    await UserModel.setBanned(_user, newBanned);
                    await m.reply(
                        `${newBanned ? "Banned" : "Unbanned"} @${_user.split("@")[0]}`
                    );
                }

                return;
            }

            if (isUnbanCommand) {
                await GroupModel.setGroup(m.from, {
                    name: groupMetadata.subject,
                    banned: false,
                });
                await m.reply(`ban is now disabled for ${groupMetadata.subject}`);
            } else {
                const group = await GroupModel.getGroup(m.from);
                const newBanned = !group?.banned;
                await GroupModel.setGroup(m.from, { name: groupMetadata.subject, banned: newBanned });
                await m.reply(
                    `Banchat is now ${newBanned ? "enabled" : "disabled"} for ${groupMetadata.subject}`
                );
            }

            return;
        } catch (error) {
            await m.reply(`❌ Error: ${error.message || 'Unknown error occurred'}`);
        }
    },
};
