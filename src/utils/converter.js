import { exec, spawn } from "child_process";
import { fileTypeFromBuffer } from "file-type";
import ffmpeg from "fluent-ffmpeg";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import crypto from "node:crypto";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import { join } from "path";

const supported_audio_args = {
        "3g2": [
                "-vn",
                "-c:a",
                "libopus",
                "-b:a",
                "128k",
                "-vbr",
                "on",
                "-compression_level",
                "10",
        ],
        "3gp": [
                "-vn",
                "-c:a",
                "libopus",
                "-b:a",
                "128k",
                "-vbr",
                "on",
                "-compression_level",
                "10",
        ],
        aiff: ["-vn", "-c:a", "pcm_s16be"],
        amr: ["-vn", "-c:a", "libopencore_amrnb", "-ar", "8000", "-b:a", "12.2k"],
        flac: ["-vn", "-c:a", "flac"],
        m4a: ["-vn", "-c:a", "aac", "-b:a", "128k"],
        m4r: ["-vn", "-c:a", "libfdk_aac", "-b:a", "64k"],
        mka: ["-vn", "-c:a", "libvorbis", "-b:a", "128k"],
        mp3: ["-vn", "-c:a", "libmp3lame", "-q:a", "2"],
        ogg: ["-vn", "-c:a", "libvorbis", "-q:a", "3"],
        opus: [
                "-vn",
                "-c:a",
                "libopus",
                "-b:a",
                "128k",
                "-vbr",
                "on",
                "-compression_level",
                "10",
        ],
        wav: ["-vn", "-c:a", "pcm_s16le"],
        wma: ["-vn", "-c:a", "wmav2", "-b:a", "128k"],
};
/**
 * Converts the media buffer to a stream.
 * @param {Buffer} buffer - The media buffer to convert.
 * @returns {Readable} - The converted media stream.
 * @private
 */
export function bufferToStream(buffer) {
        const stream = new Readable();
        stream.push(buffer);
        stream.push(null);
        return stream;
}

/**
 * Converts the media buffer to a webp format using ffmpeg.
 * @param {Buffer} mediaBuffer - The media buffer to convert.
 * @param {string[]} args - The additional arguments for ffmpeg.
 * @param {string} format - The format to convert to (default: "webp").
 * @returns {Promise<Buffer>} - The converted media buffer.
 */
export async function convert(mediaBuffer, args, format = null) {
        const tempPath = join(tmpdir(), crypto.randomBytes(16).toString("hex"));
        return new Promise((resolve, reject) => {
                const ffmpegProcess = ffmpeg()
                        .input(bufferToStream(mediaBuffer))
                        .addOutputOptions(args)
                        .format(format)
                        .on("end", () => {
                                try {
                                        if (existsSync(tempPath)) {
                                                const buffer = readFileSync(tempPath);
                                                unlinkSync(tempPath);
                                                resolve(buffer);
                                        } else {
                                                reject(new Error("Output file not created"));
                                        }
                                } catch (err) {
                                        reject(err);
                                }
                        })
                        .on("error", (err) => {
                                try {
                                        if (existsSync(tempPath)) {
                                                unlinkSync(tempPath);
                                        }
                                } catch {}
                                reject(err);
                        })
                        .on("stderr", (stderrLine) => {
                                // Log stderr for debugging
                                if (stderrLine && stderrLine.includes("error")) {
                                        console.error("[ffmpeg stderr]:", stderrLine);
                                }
                        });
                ffmpegProcess.save(tempPath);
        });
}

/**
 *
 * @param {Buffer} mediaBuffer - The audio buffer to convert.
 * @param {string} ext - The file extension of the audio.
 * @returns {Promise<Buffer>} - The converted audio buffer.
 * @throws {Error} - If the file type is not supported.
 */
export async function to_audio(mediaBuffer, ext = null) {
        if (!ext) {
                ext = (await fileTypeFromBuffer(mediaBuffer)).ext;
        }
        if (!supported_audio_args[ext]) {
                throw new Error(`Unsupported file type ${ext}`);
        }
        const args = supported_audio_args[ext];
        const audio = await convert(mediaBuffer, args, ext);
        return audio;
}

/**
 * Converts a WebP buffer to an MP4 video.
 * @param {Buffer} buffer - The input buffer containing WebP data.
 * @returns {Promise<Buffer>} A promise that resolves with the MP4 video buffer.
 * @throws Will throw an error if the input buffer is not valid or conversion fails.
 */
export async function webpToVideo(buffer) {
        if (!Buffer.isBuffer(buffer)) {
                throw new Error("The buffer must be not empty");
        }

        const { ext } = await fileTypeFromBuffer(buffer);
        if (!/(webp)/i.test(ext)) {
                throw new Error("Buffer not supported media");
        }

        const input = join(".", `${Date.now()}.${ext}`);
        const gif = join(".", `${Date.now()}.gif`);
        const output = join(".", `${Date.now()}.mp4`);

        writeFileSync(input, buffer);

        return new Promise((resolve, reject) => {
                exec(`convert ${input} ${gif}`, (err) => {
                        if (err) {
                                unlinkSync(input);
                                return reject(err);
                        }

                        exec(
                                `ffmpeg -i ${gif} -pix_fmt yuv420p -c:v libx264 -movflags +faststart -filter:v crop='floor(in_w/2)*2:floor(in_h/2)*2' ${output}`,
                                (err) => {
                                        if (err) {
                                                unlinkSync(input);
                                                unlinkSync(gif);
                                                return reject(err);
                                        }

                                        let buff = readFileSync(output);
                                        resolve(buff);

                                        unlinkSync(input);
                                        unlinkSync(gif);
                                        unlinkSync(output);
                                }
                        );
                });
        });
}

/**
 * Converts a WebP buffer to a PNG image.
 * @param {Buffer} buffer - The input buffer containing WebP data.
 * @returns {Promise<Buffer>} A promise that resolves with the PNG image buffer.
 * @throws Will throw an error if the conversion process fails.
 */
export async function webpToImage(buffer) {
    return new Promise((resolve, reject) => {
        try {
            const chunks = [];
            // Use ffmpeg instead of convert for more stable piping
            const command = spawn("ffmpeg", [
                "-i", "pipe:0",      // Read from stdin
                "-vframes", "1",     // Take only the first frame (fixes animated sticker crash)
                "-f", "image2pipe",  // Output to pipe
                "-vcodec", "png",    // PNG format
                "pipe:1"             // Write to stdout
            ]);

            command.on("error", (e) => reject(e));
            
            command.stdout.on("data", (chunk) => chunks.push(chunk));
            
            command.stderr.on("data", () => {}); // Silence ffmpeg logs

            // Handle the stdin pipe safely
            command.stdin.on("error", (err) => {
                console.error("Stdin Error (safe to ignore):", err.message);
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
