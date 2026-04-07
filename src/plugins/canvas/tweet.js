import fetch from "node-fetch";

const DEFAULT_AVATAR = "https://telegra.ph/file/24fa902ead26340f3df2c.png";

const ACTIONS = {
    tweet: {
        buildUrl: (avatar, username, text) =>
            `https://some-random-api.com/canvas/misc/tweet?avatar=${encodeURIComponent(avatar)}&username=${encodeURIComponent(username)}&displayname=${encodeURIComponent(username)}&comment=${encodeURIComponent(text)}`,
        caption: (username) => `🐦 *Tweet by @${username}*`,
        usageHint: "❌ Please provide tweet text!\nUsage: !tweet <text>",
        needsTarget: false,
    },
    comment: {
        buildUrl: (avatar, username, text) =>
            `https://some-random-api.com/canvas/misc/youtube-comment?avatar=${encodeURIComponent(avatar)}&username=${encodeURIComponent(username)}&comment=${encodeURIComponent(text)}`,
        caption: (username) => `💬 *YouTube Comment by ${username}*`,
        usageHint: "❌ Please provide a comment text!\nUsage: !comment <text>",
        needsTarget: false,
    },
    stupid: {
        buildUrl: (avatar, _username, text) =>
            `https://some-random-api.com/canvas/misc/its-so-stupid?avatar=${encodeURIComponent(avatar)}&dog=${encodeURIComponent(text)}`,
        caption: (_username, user, text) => `🐕 *@${user.split("@")[0]}*: "${text}"`,
        usageHint: null,
        needsTarget: true,
    },
};

// Map aliases to their primary action key
const ALIASES = {
    faketweet: "tweet",
    ytcomment: "comment",
    itssostupid: "stupid",
};

const ALL_COMMANDS = ["tweet", "faketweet", "comment", "ytcomment", "stupid", "itssostupid"];

function resolveAction(command) {
    return ACTIONS[command] || ACTIONS[ALIASES[command]] || null;
}

export default {
    name: "canvas-text",
    description: "Create fun text-based canvas images (tweet, comment, stupid).",
    command: ALL_COMMANDS,
    permissions: "all",
    hidden: false,
    failed: "Failed to %command: %error",
    wait: "⏳ Creating image...",
    category: "fun",
    cooldown: 10,
    limit: true,
    usage: "$prefix$command <text>",
    react: true,
    botAdmin: false,
    group: false,
    private: false,
    owner: false,

    async execute(m, { sock, args }) {
        const action = resolveAction(m.command);
        if (!action) return m.reply("Unknown command.");

        const username = m.pushName || "User";

        let avatar, text, captionUser;

        try {
            avatar = await sock.profilePictureUrl(
                action.needsTarget
                    ? (m.quoted?.sender || m.mentions[0] || m.sender)
                    : m.sender,
                "image"
            );
        } catch {
            avatar = DEFAULT_AVATAR;
        }

        if (action.needsTarget) {
            const targetUser = m.quoted?.sender || m.mentions[0] || m.sender;
            text = args.filter((a) => !a.includes("@")).join(" ") || "I'm stupid";
            captionUser = targetUser;
        } else {
            text = args.join(" ");
            if (!text) return m.reply(action.usageHint);
            captionUser = username;
        }

        try {
            const apiUrl = action.buildUrl(avatar, username, text);

            const res = await fetch(apiUrl);
            if (!res.ok) throw new Error("API request failed");

            const buffer = Buffer.from(await res.arrayBuffer());

            await m.reply({
                image: buffer,
                caption: action.caption(username, captionUser, text),
            });
        } catch (e) {
            console.error(`[${m.command} ERROR]:`, e);
            m.reply(`❌ Failed to create image: ${e.message}`);
        }
    },
};
