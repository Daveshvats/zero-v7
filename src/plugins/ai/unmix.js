import itsrose, { pollTask } from "#lib/itsrose";
import axios from "axios";
import { sendAudioBuffer } from "#lib/media";

const STEM_MODES = [
    { id: "vocals_instrumental", label: "Vocals + Instrumental", description: "Split into vocals and instrumental" },
    { id: "voice_drums_bass_others", label: "4-Stem", description: "Voice, drums, bass, others" },
    { id: "voice_drums_bass_others_v2", label: "4-Stem V2", description: "Improved 4-stem separation" },
];

export default {
    name: "unmix",
    description: "Separate audio into stems (vocals, drums, bass, etc.).",
    command: ["unmix", "stems", "separate"],
    usage: "$prefix$command [mode] (reply to audio)\nModes: vocals_instrumental, voice_drums_bass_others, voice_drums_bass_others_v2",
    category: "tools",
    permissions: "all",
    limit: true,
    cooldown: 10,

    async execute(m) {
        const args = m.text ? m.text.trim().split(/\s+/) : [];
        const input = args[0] ? args[0].toLowerCase() : "vocals_instrumental";

        // Show modes if requested
        if (input === "list" || input === "modes") {
            let msg = "🎵 *AUDIO STEM SEPARATION*\n\n*Available modes:*\n\n";
            for (const mode of STEM_MODES) {
                msg += `*${mode.id}*\n${mode.description}\n\n`;
            }
            msg += "*Usage:*\nReply to audio with: `.unmix voice_drums_bass_others`\n\n";
            msg += "_Default mode: vocals_instrumental_";
            return m.reply(msg);
        }

        const modeId = STEM_MODES.find(s => s.id === input) ? input : "vocals_instrumental";

        const quoted = m.quoted ? m.quoted : m;
        const isAudio =
            m.type === "audioMessage" ||
            (m.quoted && m.quoted.type === "audioMessage") ||
            /audio/i.test(quoted.mime || quoted.mimetype || "");

        if (!isAudio) {
            return m.reply("🎵 Please reply to an audio/voice message to separate stems.");
        }

        try {
            await m.reply(`⌛ Separating audio stems (${modeId})... this may take a while.`);

            const buffer = await quoted.download();
            if (!buffer) return m.reply("❌ Failed to download audio.");

            const mime = quoted.mimetype || quoted.mime || "audio/mpeg";
            const base64Audio = buffer.toString("base64");

            // Submit task
            const submit = await itsrose.post(
                "/unmix/submit_task",
                { init_audio: `data:${mime};base64,${base64Audio}`, stems: modeId }
            ).catch(e => e.response);

            if (!submit?.data?.ok) {
                return m.reply(`❌ API Error: ${submit?.data?.message || "Server error"}`);
            }

            const taskId = submit.data.data?.task_id;
            if (!taskId) return m.reply("❌ No task ID returned.");

            // Polling loop (audio separation can take a while)
            try {
                const taskRes = await pollTask(taskId, '/unmix/get_task', { label: 'Audio separation', maxAttempts: 60 });

                // The completed task should contain stem URLs
                await m.reply("✅ Audio separation complete! Sending stems...");

                // Try to extract stem files from result
                const stems = taskRes.stems || taskRes.result || taskRes;

                if (typeof stems === "object" && stems !== null) {
                    for (const [stemName, stemUrl] of Object.entries(stems)) {
                        if (typeof stemUrl === "string" && stemUrl.startsWith("http")) {
                            const audioRes = await axios.get(stemUrl, { responseType: "arraybuffer" });
                            const audioBuffer = Buffer.from(audioRes.data);
                            await sendAudioBuffer(m, audioBuffer, { mimetype: "audio/mpeg" });
                            await m.reply(`🎼 Stem: ${stemName}`);
                        }
                    }
                }

                return;
            } catch (e) {
                if (e.message.includes('failed') || e.message.includes('error')) {
                    return m.reply("❌ Audio separation failed.");
                }
                return m.reply("⏰ Request timed out. The audio is taking too long to process.");
            }
        } catch (e) {
            console.error("UNMIX ERROR:", e);
            return m.reply(`❌ System Error: ${e.message}`);
        }
    },
};
