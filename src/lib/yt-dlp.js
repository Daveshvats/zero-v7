import { spawn } from "child_process";
import { readFile, unlink } from "node:fs/promises";
import { join } from "path";

/**
 * Spawn yt-dlp with the given args and return a promise that resolves on exit code 0.
 * @param {string[]} args
 * @returns {Promise<void>}
 */
function spawnYtDlp(args) {
        return new Promise((resolve, reject) => {
                const proc = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });
                let stderr = "";
                proc.stderr.on("data", (chunk) => { stderr += chunk; });
                proc.on("error", reject);
                proc.on("close", (code) => {
                        if (code === 0) return resolve();
                        reject(new Error(`yt-dlp exited with code ${code}: ${stderr.trim() || "unknown error"}`));
                });
        });
}

/**
 * Download YouTube audio/video with yt-dlp.
 * @param {String} url
 * @param {Object} opts { video?:boolean, cookiesPath?:string }
 * @returns {Promise<{buffer: Buffer, fileName: string}>}
 */
export async function downloadYt(url, opts = {}) {
        const { video = false, title = "youtube" } = opts;
        const cookiesPath = join(process.cwd(), "cookies.txt");

        // Fallback format options for when specific formats are unavailable
        const formatOptions = video
                ? [
                                "best[ext=mp4][height<=360]",
                                "best[ext=mp4]",
                                "best[vcodec!=none][acodec!=none][height<=360]",
                                "best",
                        ]
                : [
                                "bestaudio[ext=m4a]",
                                "bestaudio[ext=mp3]",
                                "bestaudio[ext=wav]",
                                "bestaudio",
                        ];

        const outputExt = video ? "mp4" : "m4a";
        let lastError = null;

        // Try each format option until one succeeds
        for (const format of formatOptions) {
                try {
                        const outFile = `/tmp/yt_${Date.now()}.${outputExt}`;

                        const args = [
                                "-f",
                                format,
                                "-o",
                                outFile,
                                url,
                        ];

                        try {
                                await readFile(cookiesPath);
                                args.unshift("--cookies", cookiesPath);
                        } catch {
                                // cookies.txt not required
                        }

                        console.log("[yt-dlp cmd]", "yt-dlp", args.join(" "));

                        await spawnYtDlp(args);

                        const buffer = await readFile(outFile);
                        await unlink(outFile);

                        return {
                                buffer,
                                fileName: `${title.replace(/[\\/:*?"<>|]/g, "").slice(0, 60) || "yt"}.${outputExt}`,
                        };
                } catch (error) {
                        lastError = error;
                        console.warn(`[yt-dlp] Format "${format}" failed, trying next...`);
                }
        }

        // If all formats failed, throw the last error
        throw new Error(
                `Failed to download from YouTube after trying multiple formats. Last error: ${lastError?.message || "Unknown error"}`
        );
}
