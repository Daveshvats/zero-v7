import { GroupModel, UserModel } from "#lib/database/index";
import { resolveLidToJid } from "#lib/serialize";

export default {
        name: "unban",
        description: "Unban a user or group.",
        command: ["unban", "unbanchat"],
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
                if (m?.quoted?.sender || m.mentions[0]) {
                        // Get the raw JID from quoted sender or mentions
                        const rawJid = m?.quoted?.sender || m.mentions[0];
                        
                        // Resolve LID to regular JID using group participants (so it matches m.sender format)
                        const participants = groupMetadata?.participants || [];
                        const _user = resolveLidToJid(rawJid, participants);

                        const targetName = m?.quoted?.pushName || _user.split("@")[0];
                        await UserModel.setUser(_user, { name: targetName });
                        await UserModel.setBanned(_user, false);

                        await m.reply(
                                `Unbanned @${_user.split("@")[0]}`
                        );

                        return;
                }

                await GroupModel.setGroup(m.from, {
                        name: groupMetadata.subject,
                        banned: false,
                });

                await m.reply(
                        `ban is now disabled for ${groupMetadata.subject}`
                );

                return;
        },
};
