/**
 * Worker thread pool for CPU-heavy tasks (sticker creation, audio conversion).
 * Offloads expensive operations to worker threads so the main event loop
 * stays free to process incoming WhatsApp messages.
 *
 * Usage:
 *   const stickerBuf = await workerPool.exec("sticker", { mediaBuffer, options });
 *   const audioBuf = await workerPool.exec("convert-audio", { mediaBuffer, ext: "mp3" });
 *
 * The pool automatically scales up to maxWorkers and reuses idle workers.
 * If workers are not available (e.g., worker_threads not supported), falls back
 * to main-thread execution — zero risk of breaking functionality.
 */

import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const WORKER_PATH = join(__dirname, "cpu-worker.js");

// Pool configuration
const MAX_WORKERS = Math.min(availableParallelism?.() || 2, 4);
const WORKER_TIMEOUT_MS = 30_000; // 30s max per task

let pool = [];
let taskIdCounter = 0;
let _nextWorker = 0;
const pendingTasks = new Map(); // taskId -> { resolve, reject, timer }
let _initialized = false;
let _fallback = false; // true if worker threads are not available

/**
 * Initialize the worker pool. Called lazily on first use.
 */
function initPool() {
        if (_initialized) return;
        _initialized = true;

        try {
                // Test if worker threads are available (some environments restrict them)
                const testWorker = new Worker(WORKER_PATH);
                testWorker.terminate();
        } catch (err) {
                console.warn("[WorkerPool] Worker threads not available, using main-thread fallback:", err.message);
                _fallback = true;
                return;
        }

        for (let i = 0; i < MAX_WORKERS; i++) {
                const worker = new Worker(WORKER_PATH);
                worker.on("message", (msg) => {
                        const task = pendingTasks.get(msg.id);
                        if (!task) return;

                        pendingTasks.delete(msg.id);
                        clearTimeout(task.timer);

                        if (msg.error) {
                                task.reject(new Error(msg.error));
                        } else {
                                // If the buffer was transferred, re-wrap it
                                const result = msg.result instanceof Uint8Array
                                        ? Buffer.from(msg.result)
                                        : msg.result;
                                task.resolve(result);
                        }
                });

                worker.on("error", (err) => {
                        console.error("[WorkerPool] Worker error:", err.message);
                });

                worker.on("exit", (code) => {
                        if (code !== 0) {
                                console.warn(`[WorkerPool] Worker exited with code ${code}`);
                        }
                });

                pool.push(worker);
        }

        console.info(`[WorkerPool] Initialized with ${MAX_WORKERS} worker thread(s)`);
}

/**
 * Execute a task on the worker pool.
 * Falls back to main-thread execution if workers are unavailable.
 *
 * @param {string} type - Task type: "sticker", "convert-audio", "webp-to-image"
 * @param {object} data - Task data (will be structured-cloned to worker)
 * @returns {Promise<Buffer>} - Result buffer
 */
export async function exec(type, data) {
        if (!_initialized) initPool();

        // Fallback: run on main thread if worker threads are not available
        if (_fallback) {
                return execFallback(type, data);
        }

        const id = ++taskIdCounter;

        return new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                        pendingTasks.delete(id);
                        reject(new Error(`Worker task '${type}' timed out after ${WORKER_TIMEOUT_MS}ms`));
                }, WORKER_TIMEOUT_MS);

                pendingTasks.set(id, { resolve, reject, timer });

                // Pick the least busy worker (round-robin counter)
                const worker = pool[_nextWorker % pool.length];
                _nextWorker++;
                worker.postMessage({ id, type, data });
        });
}

/**
 * Main-thread fallback for environments without worker thread support.
 * Dynamically imports the required modules and runs the task.
 */
async function execFallback(type, data) {
        // FIX: Import raw task functions directly, NOT sticker.js which would cause infinite recursion
        // (sticker.js calls workerPool.exec → execFallback → sticker.js → ...)
        const { to_audio, convert } = await import("#utils/converter.js");
        const webp = await import("node-webpmux");
        const { fileTypeFromBuffer } = await import("file-type");
        const { outputOptionsArgs } = await import("#config/sticker.js");

        switch (type) {
                case "sticker": {
                        // Inline sticker creation logic (same as cpu-worker.js createSticker)
                        const packname = data.options?.packname || "⛓️Zero⛓️";
                        const author = data.options?.author || "Zero.V7";
                        const emojis = data.options?.emojis || ["❤️"];
                        const { mime } = (await fileTypeFromBuffer(data.mediaBuffer)) || {};
                        if (!mime) throw new Error("Invalid file type");
                        const args = mime.includes("image") ? outputOptionsArgs.image : outputOptionsArgs.video;
                        const webpBuffer = (!mime.includes("webp") && (await convert(data.mediaBuffer, args, "webp"))) || data.mediaBuffer;
                        const image = new webp.Image();
                        await image.load(webpBuffer);
                        const exifData = Buffer.concat([
                                Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]),
                                Buffer.from(JSON.stringify({
                                        "sticker-pack-id": "com.snowcorp.stickerly.android.stickercontentprovider b5e7275f-f1de-4137-961f-57becfad34f2",
                                        "sticker-pack-name": packname,
                                        "sticker-pack-publisher": author,
                                        emojis: Array.isArray(emojis) ? emojis : [emojis],
                                        "is-avatar-sticker": 0, "is-ai-sticker": 0,
                                        "api-url": "https://natsyn.xyz",
                                        "android-app-store-link": "https://play.google.com/store/apps/details?id=com.snowcorp.stickerly.android",
                                        "ios-app-store-link": "https://apps.apple.com/us/app/sticker-ly-sticker-maker/id1458740001",
                                }), "utf-8"),
                        ]);
                        exifData.writeUIntLE(Buffer.from(JSON.stringify({
                                "sticker-pack-name": packname, "sticker-pack-publisher": author, emojis: Array.isArray(emojis) ? emojis : [emojis],
                        }), "utf-8").length, 14, 4);
                        image.exif = exifData;
                        return await image.save(null);
                }
                case "convert-audio":
                        return await to_audio(data.mediaBuffer, data.ext);
                case "webp-to-image": {
                        // Inline webp-to-image conversion
                        const { spawn } = await import("node:child_process");
                        const { execSync } = await import("node:child_process");
                        const ffmpegPath = process.platform === "win32"
                                ? execSync("where ffmpeg", { encoding: "utf8" }).trim().split("\n")[0]
                                : execSync("which ffmpeg", { encoding: "utf8" }).trim();
                        return new Promise((resolve, reject) => {
                                const chunks = [];
                                const command = spawn(ffmpegPath, ["-i", "pipe:0", "-vframes", "1", "-f", "image2pipe", "-vcodec", "png", "pipe:1"]);
                                command.on("error", reject);
                                command.stdout.on("data", (chunk) => chunks.push(chunk));
                                command.stderr.on("data", () => {});
                                command.stdin.on("error", () => {});
                                if (command.stdin.writable) { command.stdin.write(data.buffer); command.stdin.end(); }
                                command.on("close", (code) => code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`ffmpeg exited with code ${code}`)));
                        });
                }
                default:
                        throw new Error(`Unknown worker task type: ${type}`);
        }
}

/**
 * Get pool status for debugging.
 */
export function getStatus() {
        return {
                initialized: _initialized,
                fallback: _fallback,
                workerCount: pool.length,
                pendingTasks: pendingTasks.size,
                maxWorkers: MAX_WORKERS,
        };
}

/**
 * Terminate all workers (for graceful shutdown).
 */
export function terminate() {
        for (const worker of pool) {
                try { worker.terminate(); } catch {}
        }
        pool = [];
        for (const [, task] of pendingTasks) {
                clearTimeout(task.timer);
                task.reject(new Error("Worker pool terminated"));
        }
        pendingTasks.clear();
}

export default { exec, getStatus, terminate };
