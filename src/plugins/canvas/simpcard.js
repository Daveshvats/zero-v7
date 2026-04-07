import fetch from "node-fetch";

const OVERLAYS = {
    simp: { path: "misc/simpcard", caption: (u) => `😆 *@${u} is a SIMP!*` },
    simpcard: { path: "misc/simpcard", caption: (u) => `😆 *@${u} is a SIMP!*` },
    jail: { path: "overlay/jail", caption: (u) => `🔒 *@${u} has been sent to jail!*` },
    prison: { path: "overlay/jail", caption: (u) => `🔒 *@${u} has been sent to jail!*` },
    wasted: { path: "overlay/wasted", caption: (u) => `💀 *@${u} WASTED*` },
    gta: { path: "overlay/wasted", caption: (u) => `💀 *@${u} WASTED*` },
    passed: { path: "overlay/passed", caption: (u) => `✅ *@${u} MISSION PASSED!*\n+Respect` },
    missionpassed: { path: "overlay/passed", caption: (u) => `✅ *@${u} MISSION PASSED!*\n+Respect` },
    horny: { path: "misc/horny", caption: (u) => `🥵 *@${u} is HORNY!*` },
    hornycard: { path: "misc/horny", caption: (u) => `🥵 *@${u} is HORNY!*` },
    lolice: { path: "lolice", caption: (u) => `👮 *CALL THE POLICE!! 😱*\n@${u} is in trouble!` },
};

const ALL_COMMANDS = [...new Set(Object.keys(OVERLAYS))];

export default {
    name: "canvas-overlays",
    description: "Apply fun canvas overlays to a user's avatar (simp, jail, wasted, passed, horny, lolice).",
    command: ALL_COMMANDS,
    permissions: "all",
    hidden: false,
    failed: "Failed to %command: %error",
    wait: "⏳ Processing image...",
    category: "fun",
    cooldown: 10,
    limit: true,
    usage: "$prefix$command @user or reply",
    react: true,
    botAdmin: false,
    group: false,
    private: false,
    owner: false,

    async execute(m, { sock }) {
        const overlay = OVERLAYS[m.command];
        if (!overlay) return m.reply("Unknown overlay command.");

        const who = m.quoted?.sender || m.mentions[0] || m.sender;

        try {
            let avatar;
            try {
                avatar = await sock.profilePictureUrl(who, "image");
            } catch {
                avatar = "https://telegra.ph/file/24fa902ead26340f3df2c.png";
            }

            const apiUrl = `https://some-random-api.com/canvas/${overlay.path}?avatar=${encodeURIComponent(avatar)}`;

            const res = await fetch(apiUrl);
            if (!res.ok) throw new Error("API request failed");

            const buffer = Buffer.from(await res.arrayBuffer());

            await m.reply({
                image: buffer,
                caption: overlay.caption(who.split("@")[0]),
            });
        } catch (e) {
            console.error(`[${m.command} ERROR]:`, e);
            m.reply(`❌ Failed to create image: ${e.message}`);
        }
    },
};
