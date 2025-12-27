import { exec } from "child_process";
import { readFileSync, unlinkSync } from "fs";
import { join } from "path";
import util from "util";

const execPromise = util.promisify(exec);

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
                                readFileSync(cookiesPath);
                                args.unshift("--cookies", cookiesPath);
                        } catch {
                                // cookies.txt not required
                        }

                        const cmd = `yt-dlp ${args.map((a) => `"${a}"`).join(" ")}`;
                        console.log("[yt-dlp cmd]", cmd);

                        await execPromise(cmd, { maxBuffer: 300 * 1024 * 1024 });

                        const buffer = readFileSync(outFile);
                        unlinkSync(outFile);

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
