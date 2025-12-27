import { GroupModel, UserModel } from "#lib/database/index";

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
                if (m?.quoted?.sender || m.mentions[0] || m.text) {
                        const _user =
                                (m?.quoted?.sender || m.mentions[0] || m.text).replace(
                                        /[^0-9]/g,
                                        ""
                                ) + "@s.whatsapp.net";

                        await UserModel.setUser(_user, { name: m.pushName });
                        await UserModel.setBanned(_user, false);

                        await m.reply(
                                `Unbanned @${_user.replace(/[^0-9]/g, "")}`
                        );

                        return;
                }

                await GroupModel.setGroup(m.chat, { name: groupMetadata.subject });
                await GroupModel.setBanned(m.chat, false);

                await m.reply(
                        `Unbanchat is now disabled for ${groupMetadata.subject}`
                );

                return;
        },
};
