import axios from "axios";

export default {
    name: "sunio",
    description: "Create AI Music using Suno (ItsRose API).",
    command: ["sunio", "suno"],
    usage: "$prefix$command <prompt>",
    permissions: "all",
    hidden: false,
    failed: "Failed to execute %command: %error",
    wait: null,
    category: "ai",
    cooldown: 10,
    limit: true,
    react: true,
    botAdmin: false,
    group: false,
    private: false,
    owner: false,

    async execute(m, { api }) {
        const input =
            m.text && m.text.trim() !== ""
                ? m.text
                : m.quoted && m.quoted.text
                    ? m.quoted.text
                    : null;

        if (!input) {
            return m.reply("Please provide a prompt/topic for the song.");
        }

        await m.reply("🎵 Creating your music... this may take a moment.");

        try {
            const apiKey = "sk_PNcLyV1b7EU6lGCMrOMPJBRyHPcHcojdHc-INT1qsrw"; 

            // 1. SUBMIT TASK
            const submitResponse = await axios.post(
                "https://api.itsrose.net/ai_song/submit_task",
                {
                    mode: "auto",
                    model: "v3.0",
                    prompt: input,
                },
                {
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${apiKey}`,
                    },
                }
            );

            const { data: submitData } = submitResponse;

            // Debug log to confirm structure
            console.log("Submit Response:", JSON.stringify(submitData, null, 2));

            if (!submitData.status || !submitData.result || !submitData.result.task_ids) {
                return m.reply(`Submission failed. API Response: ${submitData.message || "Invalid structure"}`);
            }

            // EXTRACT ID CORRECTLY based on your provided JSON
            const taskId = submitData.result.task_ids[0]; 

            if (!taskId) {
                return m.reply("Error: API returned success but no Task ID was found.");
            }

            // --- ⏳ INITIAL WAIT ---
            // Wait 10 seconds before the first check to give the server time to start
            await new Promise((resolve) => setTimeout(resolve, 10000)); 

            // 2. POLLING (Check status loop)
            let songData = null;
            let attempts = 0;
            const maxAttempts = 30; // Wait approx 2 mins total

            while (attempts < maxAttempts) {
                try {
                    const checkResponse = await axios.get(
                        `https://api.itsrose.net/ai_song/get_task`, 
                        {
                            params: { task_id: taskId },
                            headers: { Authorization: `Bearer ${apiKey}` },
                        }
                    );

                    const taskResult = checkResponse.data;
                    
                    // Check if processing is done
                    if (taskResult.status && taskResult.result && taskResult.result.length > 0) {
                        const currentStatus = taskResult.result[0].status;
                        
                        // If audio_url exists, it's done
                        if (taskResult.result[0].audio_url) {
                            songData = taskResult.result[0];
                            break; // Exit loop
                        }
                        
                        if (currentStatus === "failed" || currentStatus === "error") {
                            return m.reply("Generation failed during processing.");
                        }
                    }
                } catch (innerError) {
                    console.log("Polling error (ignoring):", innerError.message);
                }

                // Wait 4 seconds between subsequent checks
                await new Promise((resolve) => setTimeout(resolve, 4000));
                attempts++;
            }

            if (!songData) {
                return m.reply("Request timed out. The song took too long to generate.");
            }

            // 3. SEND RESULT
            let msg = "*🎹 SUNO AI MUSIC*\n\n";
            msg += `*📌 Title*: ${songData.title || "Untitled"}\n`;
            msg += `*⏱️ Duration*: ${songData.audio_duration || "-"}s\n`;
            msg += `*📝 Prompt*: ${input}\n`;
            
            if (songData.lyrics) {
                msg += `\n*🎤 Lyrics*:\n${songData.lyrics}...\n(Lyrics truncated)`;
            }

            if (songData.cover_url) {
                await m.reply({ 
                    image: { url: songData.cover_url }, 
                    caption: msg 
                });
            } else {
                await m.reply(msg);
            }

            await m.reply({
                audio: { url: songData.audio_url },
                mimetype: "audio/mpeg",
                ptt: false 
            });

        } catch (e) {
            console.error("Main Error:", e);
            return m.reply(`An error occurred: ${e.message}`);
        }
    },
};