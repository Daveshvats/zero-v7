import { sendImage, sendVideo, sendAudio } from "#lib/media";

export default {
        name: "tiktok",
        description: "Downloader TikTok.",
        command: ["tt", "tiktok"],
        usage: "$prefix$command https://vt.tiktok.com/ZSkSAodxb/",
        permissions: "all",
        hidden: false,
        failed: "Failed to execute %command: %error",
        wait: null,
        category: "downloader",
        cooldown: 5,
        limit: true,
        react: true,
        botAdmin: false,
        group: false,
        private: false,
        owner: false,

        async execute(m, { api }) {
                try {
                        const input =
                                m.text && m.text.trim() !== ""
                                        ? m.text
                                        : m.quoted && m.quoted.url
                                                ? m.quoted.url
                                                : null;

                        if (!input) {
                                return m.reply("Input URL TikTok.");
                        }

                        const {
                                data: { result, status, message },
                        } = await api.Gratis.get("/downloader/tiktok", { url: input });

                        if (!status) {
                                return m.reply(message);
                        }

                        const { author, aweme_id, region, desc, duration, download, info } =
                                result;

                        let msg = "*🕺 TIKTOK DOWNLOADER*\n\n";
                        msg += `*👤 User*: ${author.nickname} (@${author.unique_id})\n`;
                        msg += `*🆔 ID Video*: ${aweme_id}\n`;
                        msg += `*🌍 Region*: ${region}\n`;
                        msg += `*📝 Caption*: ${desc || "-"}\n`;
                        msg += `*⏱️ Duration*: ${duration}s\n`;
                        msg += `*🎶 Music*: ${download.music_info?.title || "-"} - ${download.music_info?.author || "-"}\n`;
                        msg += `*👁️ Views*: ${info?.play_count || 0}\n`;
                        msg += `*👍 Like*: ${info?.digg_count || 0} | 💬 ${info?.comment_count || 0} | 🔁 Share: ${result.info?.share_count || 0}\n`;
                        msg += `*🗓️ Upload*: ${info?.create_time ? new Date(info.create_time * 1000).toLocaleString("id-ID") : "-"}\n`;

                        if (download.images?.length > 0) {
                                for (const img of download.images) {
                                        await sendImage(m, img);
                                }
                        }

                        await sendVideo(m, download.original, msg.trim(), { label: "TikTok Video" });
                        await sendAudio(m, download.music, { mimetype: "audio/mpeg" });
                } catch (error) {
                        await m.reply(`❌ Error: ${error.message || 'Unknown error occurred'}`);
                }
        },
};
