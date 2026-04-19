import { fileTypeFromBuffer } from "file-type";
import { bufferToStream, convert } from "#utils/converter";
import webp from "node-webpmux";
import { outputOptionsArgs } from "#config/sticker";

/**
 * Worker thread entry point — handles CPU-heavy tasks off the main event loop.
 * Runs in a separate thread so the bot can keep processing messages while
 * sticker creation / audio conversion / image processing happens.
 *
 * Communication via parentPort:
 *   parentPort.postMessage({ id, type, data })
 */
import ffmpeg from "fluent-ffmpeg";
import { execSync } from "node:child_process";

try {
    const isWin = process.platform === "win32";
    const ffmpegPath = execSync(isWin ? "where ffmpeg" : "which ffmpeg", {
        encoding: "utf8",
        env: process.env,
        shell: true,
    }).trim().split(/\r?\n/)[0];

    if (ffmpegPath) {
        ffmpeg.setFfmpegPath(ffmpegPath);
        ffmpeg.setFfprobePath(ffmpegPath.replace(/ffmpeg(\.exe)?$/i, "ffprobe$1"));
    }
} catch (e) {
    console.warn("[cpu-worker] ffmpeg not found, sticker/audio conversion may fail");
}
const { parentPort } = await import("node:worker_threads");

if (!parentPort) {
        console.error("[worker] Not running as worker thread, exiting");
        process.exit(1);
}

/**
 * Sticker metadata generation (same as lib/sticker.js)
 */
function metadata(options) {
        const loadDataExif = Buffer.concat([
                Buffer.from([
                        0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41,
                        0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
                ]),
                Buffer.from(JSON.stringify(options), "utf-8"),
        ]);
        loadDataExif.writeUIntLE(
                Buffer.from(JSON.stringify(options), "utf-8").length,
                14,
                4
        );
        return loadDataExif;
}

function exif(packname, author, emojis) {
        return {
                "sticker-pack-id":
                        "com.snowcorp.stickerly.android.stickercontentprovider b5e7275f-f1de-4137-961f-57becfad34f2",
                "sticker-pack-name": packname,
                "sticker-pack-publisher": author,
                emojis: Array.isArray(emojis) ? emojis : [emojis],
                "is-avatar-sticker": 0,
                "is-ai-sticker": 0,
                "api-url": "https://natsyn.xyz",
                "android-app-store-link":
                        "https://play.google.com/store/apps/details?id=com.snowcorp.stickerly.android",
                "ios-app-store-link":
                        "https://apps.apple.com/us/app/sticker-ly-sticker-maker/id1458740001",
        };
}

/**
 * Create a sticker in the worker thread.
 * @param {Buffer} mediaBuffer - Input media
 * @param {object} options - { packname, author, emojis }
 * @returns {Promise<Buffer>} - Sticker webp buffer
 */
async function createSticker(mediaBuffer, options = {}) {
        const packname = options.packname || "⛓️Zero⛓️";
        const author = options.author || "Zero.V7";
        const emojis = options.emojis || ["❤️"];

        const { mime } = (await fileTypeFromBuffer(mediaBuffer)) || {};
        if (!mime) {
                throw new Error("Invalid file type");
        }

        const args = mime.includes("image")
                ? outputOptionsArgs.image
                : outputOptionsArgs.video;
        const webpBuffer =
                (!mime.includes("webp") &&
                        (await convert(mediaBuffer, args, "webp"))) ||
                mediaBuffer;
        const image = new webp.Image();
        await image.load(webpBuffer);
        const exifData = metadata(exif(packname, author, emojis));
        image.exif = exifData;
        return await image.save(null);
}

/**
 * Convert audio buffer to target format in the worker thread.
 * @param {Buffer} mediaBuffer - Input audio
 * @param {string} ext - Target format (mp3, ogg, etc.)
 * @returns {Promise<Buffer>}
 */
async function convertAudio(mediaBuffer, ext) {
        const supported = {
                mp3: ["-vn", "-c:a", "libmp3lame", "-q:a", "2"],
                ogg: ["-vn", "-c:a", "libvorbis", "-q:a", "3"],
                opus: ["-vn", "-c:a", "libopus", "-b:a", "128k", "-vbr", "on", "-compression_level", "10"],
                m4a: ["-vn", "-c:a", "aac", "-b:a", "128k"],
                flac: ["-vn", "-c:a", "flac"],
                wav: ["-vn", "-c:a", "pcm_s16le"],
                amr: ["-vn", "-c:a", "libopencore_amrnb", "-ar", "8000", "-b:a", "12.2k"],
        };

        if (!ext) {
                ext = (await fileTypeFromBuffer(mediaBuffer))?.ext;
        }
        if (!supported[ext]) {
                throw new Error(`Unsupported file type ${ext}`);
        }

        return await convert(mediaBuffer, supported[ext], ext);
}

/**
 * Convert WebP buffer to PNG (first frame only) in worker thread.
 * @param {Buffer} buffer - WebP input
 * @returns {Promise<Buffer>}
 */
async function webpToImage(buffer) {
        const { spawn } = await import("node:child_process");
        const { Readable } = await import("node:stream");

        return new Promise((resolve, reject) => {
                try {
                        const chunks = [];
                        const command = spawn("ffmpeg", [
                                "-i", "pipe:0",
                                "-vframes", "1",
                                "-f", "image2pipe",
                                "-vcodec", "png",
                                "pipe:1",
                        ]);

                        command.on("error", (e) => reject(e));
                        command.stdout.on("data", (chunk) => chunks.push(chunk));
                        command.stderr.on("data", () => {});
                        command.stdin.on("error", (err) => {
                                console.error("[worker] Stdin Error (safe to ignore):", err.message);
                        });

                        if (command.stdin.writable) {
                                command.stdin.write(buffer);
                                command.stdin.end();
                        }

                        command.on("close", (code) => {
                                if (code === 0) {
                                        resolve(Buffer.concat(chunks));
                                } else {
                                        reject(new Error(`ffmpeg exited with code ${code}`));
                                }
                        });
                } catch (err) {
                        reject(err);
                }
        });
}

// ── Message Handler ────────────────────────────────────────────────────

parentPort.on("message", async ({ id, type, data }) => {
        try {
                let result;

                switch (type) {
                        case "sticker": {
                                const stickerBuf = await createSticker(data.mediaBuffer, data.options);
                                result = stickerBuf;
                                break;
                        }
                        case "convert-audio": {
                                const audioBuf = await convertAudio(data.mediaBuffer, data.ext);
                                result = audioBuf;
                                break;
                        }
                        case "webp-to-image": {
                                const imgBuf = await webpToImage(data.buffer);
                                result = imgBuf;
                                break;
                        }
                        default:
                                parentPort.postMessage({ id, error: `Unknown worker task type: ${type}` });
                                return;
                }

                // Transfer the buffer back (zero-copy)
                parentPort.postMessage({ id, result }, [result.buffer]);
        } catch (error) {
                parentPort.postMessage({ id, error: error.message });
        }
});
