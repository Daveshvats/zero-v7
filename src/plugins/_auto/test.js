export default {
        name: "test",
        command: [],
        hidden: true,
        enabled: false, // NOTE: Debug/test plugin — should be disabled in production
        owner: false,
        execute: () => {},
        periodic: {
                enabled: false,
                type: "message",
                run: async function (m) {
                        if (/tes/i.test(m.body || "")) {
                                await m.reply("tis");
                        }
                },
        },
};