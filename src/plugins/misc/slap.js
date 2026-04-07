import fetch from "node-fetch";
import Sticker from "#lib/sticker";

const ACTIONS = {
    slap: { path: "slap", verb: "slaped" },
    kiss: { path: "kiss", verb: "kissed" },
    yeet: { path: "yeet", verb: "yeeted" },
    kill: { path: "kill", verb: "killed" },
    pat: { path: "pat", verb: "pated" },
};

export default {
    name: "reactions",
    description: "React to someone with a fun sticker (slap, kiss, yeet, kill, pat).",
    command: Object.keys(ACTIONS),
    permissions: "all",
    hidden: false,
    failed: "Failed to %command: %error",
    wait: null,
    category: "fun",
    cooldown: 5,
    limit: true,
    usage: "$prefix$command @tag / reply",
    react: true,
    botAdmin: false,
    group: false,
    private: false,
    owner: false,

    async execute(m, { sock }) {
        const action = ACTIONS[m.command];
        if (!action) return m.reply("Unknown reaction command.");

        const user = m?.quoted?.sender || m.mentions[0];
        if (!user) return m.reply("Reply or tag a user!");

        try {
            const res = await fetch(`https://api.waifu.pics/sfw/${action.path}`);
            if (!res.ok) throw new Error("API Error");
            const json = await res.json();

            const mediaRes = await fetch(json.url);
            const buffer = Buffer.from(await mediaRes.arrayBuffer());

            const sticker = await Sticker.create(buffer, {
                packname: "⛓️Zero⛓️",
                author: m.pushName,
                emojis: "🗡️",
            });

            await m.reply({ sticker });

            const senderTag = `@${m.sender.split("@")[0]}`;
            const targetTag = `@${user.split("@")[0]}`;
            await m.reply({
                text: `${senderTag} ${action.verb} ${targetTag}`,
                mentions: [m.sender, user],
            });
        } catch (e) {
            console.error(`[${m.command} ERROR]:`, e);
            m.reply(`❌ Failed to create sticker: ${e.message}`);
        }
    },
};
