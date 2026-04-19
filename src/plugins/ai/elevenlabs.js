import itsrose from "#lib/itsrose";
import { sendAudioBuffer } from "#lib/media";

/** Lazy-loaded DB references (same pattern as src/plugins/_auto/caiAutoGroup.js) */
let VoiceModel = null;
async function getDB() {
    if (!VoiceModel) {
        const db = await import("#lib/database/index");
        VoiceModel = db.VoiceModel;
    }
    return { VoiceModel };
}

export default {
    name: "elevenlabs",
    description: "Text-to-speech, voice search, clone, and voice conversion via ElevenLabs.",
    command: ["tts", "elevenlabs", "voice"],
    usage:
        "$prefix$command voices [query]\n" +
        "$prefix$command models\n" +
        "$prefix$command speak <voice_id|name> <text>\n" +
        "$prefix$command v2v <voice_id|name> (reply to audio)\n" +
        "$prefix$command clone <name> (reply to audio)\n" +
        "$prefix$command myvoices\n" +
        "$prefix$command delvoice <name>",
    category: "ai",
    permissions: "all",
    limit: true,
    cooldown: 5,

    async execute(m) {
        const args = m.text ? m.text.trim().split(/\s+/) : [];
        const sub = args[0] ? args[0].toLowerCase() : null;

        const allSubs = ["voices", "models", "speak", "v2v", "clone", "myvoices", "delvoice"];

        // --- HELP ---
        if (!sub || !allSubs.includes(sub)) {
            const groupHint = m.isGroup
                ? "\n\n🗣️ *Saved Voices (Group):*\n" +
                  "• `.tts myvoices` — List saved voices in this group\n" +
                  "• `.tts delvoice <name>` — Delete a saved voice\n" +
                  "• `.tts speak adam Hello!` — Speak with saved voice name\n" +
                  "• `.tts clone MyVoice` (reply to audio) — Clone & auto-save"
                : "";
            return m.reply(
                "🔊 *ELEVENLABS TTS*\n\n" +
                "*Subcommands:*\n" +
                "• `.tts voices [query]` — Search/list voices\n" +
                "• `.tts models` — List available models\n" +
                "• `.tts speak <voice_id|name> <text>` — Text-to-speech\n" +
                "• `.tts v2v <voice_id|name>` (reply to audio) — Voice-to-voice\n" +
                "• `.tts clone <name>` (reply to audio) — Clone a voice" +
                groupHint +
                "\n\n*Example:*\n` .tts voices anime`\n` .tts speak abc123 Hello world!`"
            );
        }

        // --- VOICES (search/list) ---
        if (sub === "voices") {
            const query = args.slice(1).join(" ") || null;

            try {
                await m.reply(query ? `⌛ Searching voices for *${query}*...` : "⌛ Fetching voices...");

                const body = { server_id: "rose" };
                if (query) body.query = query;

                const res = await itsrose.post("/elevenlabs/get_voices", body).catch(e => e.response);

                if (!res?.data?.ok) {
                    return m.reply(`❌ API Error: ${res?.data?.message || "Server error"}`);
                }

                const voices = res.data.data?.voices || [];
                if (!voices.length) return m.reply("🔍 No voices found.");

                let msg = `🔊 *VOICES*${query ? ` (search: ${query})` : ""}\n\n`;
                for (const v of voices.slice(0, 15)) {
                    msg += `*Name:* ${v.name || "-"}\n`;
                    msg += `*ID:* \`${v.voice_id || "-"}\`\n`;
                    if (v.labels) msg += `*Labels:* ${Object.entries(v.labels).map(([k, val]) => `${k}: ${val}`).join(", ")}\n`;
                    if (v.category) msg += `*Category:* ${v.category}\n`;
                    msg += "━━━━━━━━━━━━━━\n";
                }
                if (res.data.data?.has_more) msg += `\n_and more... use a specific search query_`;
                msg += `\n_Reply to speak: .tts speak <voice_id> <text>_`;
                return m.reply(msg);
            } catch (e) {
                console.error("TTS VOICES ERROR:", e);
                return m.reply(`❌ System Error: ${e.message}`);
            }
        }

        // --- MODELS ---
        if (sub === "models") {
            try {
                await m.reply("⌛ Fetching models...");

                const res = await itsrose.get("/elevenlabs/get_models").catch(e => e.response);

                if (!res?.data?.ok) {
                    return m.reply(`❌ API Error: ${res?.data?.message || "Server error"}`);
                }

                const models = res.data.data;
                if (Array.isArray(models)) {
                    let msg = "🤖 *ELEVENLABS MODELS*\n\n";
                    for (const model of models) {
                        msg += `*Name:* ${model.name || model.model_id || "-"}\n`;
                        msg += `*ID:* \`${model.model_id || "-"}\`\n`;
                        if (model.description) msg += `*Description:* ${model.description}\n`;
                        msg += "━━━━━━━━━━━━━━\n";
                    }
                    return m.reply(msg);
                }

                return m.reply(`📋 *Models result:*\n\`\`\`${JSON.stringify(models, null, 2)}\`\`\``);
            } catch (e) {
                console.error("TTS MODELS ERROR:", e);
                return m.reply(`❌ System Error: ${e.message}`);
            }
        }

        // --- MYVOICES (list saved voices in group) ---
        if (sub === "myvoices") {
            if (!m.isGroup) {
                return m.reply("❌ Voice saving is only available in groups.\nYou can still use `.tts speak <voice_id> <text>` with a voice ID directly.");
            }

            try {
                const { VoiceModel } = await getDB();
                const clones = await VoiceModel.getGroupClones(m.from);

                if (!clones || clones.length === 0) {
                    return m.reply(
                        "🗣️ *No saved voices in this group.*\n\n" +
                        "Clone a voice first:\n` .tts clone Adam` (reply to audio/voice note)\n\n" +
                        "Then use it with:\n` .tts speak Adam Hello world!`"
                    );
                }

                let msg = `🗣️ *Saved Voices (${clones.length})*\n\n`;
                for (let i = 0; i < clones.length; i++) {
                    const c = clones[i];
                    msg += `${i + 1}. *${c.name}*\n`;
                    msg += `   ID: \`${c.voiceId}\`\n`;
                    msg += `   Cloned by: ${c.clonedBy.split("@")[0]}\n`;
                }
                msg += "\n_Usage: .tts speak <name> <text>_";
                return m.reply(msg);
            } catch (e) {
                console.error("TTS MYVOICES ERROR:", e);
                return m.reply(`❌ System Error: ${e.message}`);
            }
        }

        // --- DELVOICE (delete a saved voice) ---
        if (sub === "delvoice") {
            if (!m.isGroup) {
                return m.reply("❌ Voice management is only available in groups.");
            }

            const name = args[1];
            if (!name) {
                return m.reply("❌ Provide the voice name to delete.\n*Example:* `.tts delvoice Adam`");
            }

            try {
                const { VoiceModel } = await getDB();
                const deleted = await VoiceModel.deleteClone(m.from, name);

                if (deleted) {
                    return m.reply(`🗑️ Voice *${name}* deleted from this group.`);
                } else {
                    return m.reply(`❌ Voice *${name}* not found in this group.\nUse .tts myvoices to see saved voices.`);
                }
            } catch (e) {
                console.error("TTS DELVOICE ERROR:", e);
                return m.reply(`❌ System Error: ${e.message}`);
            }
        }

        // --- SPEAK (Text-to-Speech) ---
        if (sub === "speak") {
            const rawId = args[1];
            const text = args.slice(2).join(" ") || (m.quoted?.text || null);

            if (!rawId) return m.reply("❌ Provide a voice ID or name.\n*Example:* `.tts speak adam Hello world!`");
            if (!text) return m.reply("❌ Provide text to speak.\n*Example:* `.tts speak adam Hello world!`");

            try {
                // Resolve voice ID: check if it's a saved name first (short string, not hex ID)
                let voiceId = rawId;
                const isLikelyId = /^[a-z0-9]{18,}$/i.test(rawId);

                if (!isLikelyId && m.isGroup) {
                    const { VoiceModel } = await getDB();
                    const clone = await VoiceModel.getClone(m.from, rawId);
                    if (clone) {
                        voiceId = clone.voiceId;
                    }
                    // If not found by name, fall through and use rawId as-is (might be a short ID)
                }
                await m.reply("⌛ Generating speech...");

                const res = await itsrose.post(
                    "/elevenlabs/inference_text",
                    { server_id: "rose", voice_id: voiceId, text }
                ).catch(e => e.response);

                if (!res?.data?.ok) {
                    return m.reply(`❌ API Error: ${res?.data?.message || "Server error"}`);
                }

                const audioData = res.data.data?.audio_base64;
                if (!audioData) return m.reply("❌ No audio returned.");

                const buffer = Buffer.from(audioData, "base64");
                await sendAudioBuffer(m, buffer, { mimetype: "audio/mpeg" });
            } catch (e) {
                console.error("TTS SPEAK ERROR:", e);
                return m.reply(`❌ System Error: ${e.message}`);
            }
        }

        // --- V2V (Voice-to-Voice) ---
        if (sub === "v2v") {
            const rawId = args[1];
            if (!rawId) return m.reply("❌ Provide a voice ID or name.\n*Example:* `.tts v2v adam` (reply to audio)");

            const quoted = m.quoted ? m.quoted : m;
            const isAudio =
                m.type === "audioMessage" ||
                (m.quoted && m.quoted.type === "audioMessage") ||
                /audio/i.test(quoted.mime || quoted.mimetype || "");

            if (!isAudio) {
                return m.reply("🎵 Please reply to an audio/voice message for voice conversion.");
            }

            try {
                // Resolve voice ID from saved name if it's not a hex ID
                let voiceId = rawId;
                const isLikelyId = /^[a-z0-9]{18,}$/i.test(rawId);

                if (!isLikelyId && m.isGroup) {
                    const { VoiceModel } = await getDB();
                    const clone = await VoiceModel.getClone(m.from, rawId);
                    if (clone) {
                        voiceId = clone.voiceId;
                    }
                }
                await m.reply("⌛ Converting voice...");

                const buffer = await quoted.download();
                if (!buffer) return m.reply("❌ Failed to download audio.");

                const res = await itsrose.post(
                    "/elevenlabs/inference_voice",
                    { server_id: "rose", voice_id: voiceId, init_audio: buffer.toString("base64") }
                ).catch(e => e.response);

                if (!res?.data?.ok) {
                    return m.reply(`❌ API Error: ${res?.data?.message || "Server error"}`);
                }

                const audioData = res.data.data?.audio_base64;
                if (!audioData) return m.reply("❌ No audio returned.");

                const outBuffer = Buffer.from(audioData, "base64");
                await sendAudioBuffer(m, outBuffer, { mimetype: "audio/mpeg" });
            } catch (e) {
                console.error("TTS V2V ERROR:", e);
                return m.reply(`❌ System Error: ${e.message}`);
            }
        }

        // --- CLONE VOICE ---
        if (sub === "clone") {
            const name = args[1];
            if (!name) return m.reply("❌ Provide a name for the cloned voice.\n*Example:* `.tts clone Adam` (reply to audio)");

            const quoted = m.quoted ? m.quoted : m;
            const isAudio =
                m.type === "audioMessage" ||
                (m.quoted && m.quoted.type === "audioMessage") ||
                /audio/i.test(quoted.mime || quoted.mimetype || "");

            if (!isAudio) {
                return m.reply("🎵 Please reply to an audio/voice message to clone a voice.");
            }

            try {
                await m.reply(`⌛ Cloning voice as *${name}*...`);

                const buffer = await quoted.download();
                if (!buffer) return m.reply("❌ Failed to download audio.");

                const base64Audio = buffer.toString("base64");
                const mime = quoted.mimetype || quoted.mime || "audio/mpeg";
                const dataUri = `data:${mime};base64,${base64Audio}`;

                const res = await itsrose.post(
                    "/elevenlabs/clone_voice",
                    {
                        server_id: "rose",
                        audio_urls: [dataUri],
                        name,
                        remove_background_noise: true,
                    }
                ).catch(e => e.response);

                if (!res?.data?.ok) {
                    return m.reply(`❌ API Error: ${res?.data?.message || "Server error"}`);
                }

                const data = res.data.data;
                const voiceId = data.voice_id || "-";

                // Auto-save to DB if in a group
                if (m.isGroup) {
                    try {
                        const { VoiceModel } = await getDB();
                        await VoiceModel.saveClone(m.from, name, voiceId, m.sender);
                        return m.reply(
                            `✅ *Voice cloned & saved!*\n\n` +
                            `*Name:* ${data.name || name}\n` +
                            `*Voice ID:* \`${voiceId}\`\n` +
                            `*Saved as:* \`${name.toLowerCase()}\` in this group\n\n` +
                            `Use it with: \`.tts speak ${name} <text>\`\n` +
                            `View all saved: \`.tts myvoices\``
                        );
                    } catch (dbErr) {
                        // Clone succeeded but save failed — still show the voice ID
                        console.error("TTS CLONE DB SAVE ERROR:", dbErr);
                        return m.reply(
                            `✅ *Voice cloned!* (DB save failed)\n\n` +
                            `*Name:* ${data.name || name}\n` +
                            `*Voice ID:* \`${voiceId}\`\n\n` +
                            `Use it with: \`.tts speak ${voiceId} <text>\``
                        );
                    }
                }

                // Private chat — no DB save, just show the ID
                return m.reply(
                    `✅ *Voice cloned successfully!*\n\n` +
                    `*Name:* ${data.name || name}\n` +
                    `*Voice ID:* \`${voiceId}\`\n\n` +
                    `Use it with: \`.tts speak ${voiceId} <text>\`\n\n` +
                    `💡 _Voice saving is available in groups — clone in a group to save it with a name!_`
                );
            } catch (e) {
                console.error("TTS CLONE ERROR:", e);
                return m.reply(`❌ System Error: ${e.message}`);
            }
        }
    },
};
