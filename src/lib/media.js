/**
 * media.js — Centralized media download + send utility
 *
 * Every remote URL that needs to be sent as WhatsApp media MUST go through
 * this module.  It downloads the URL to a Buffer using the bot's own axios
 * client (with proper timeout / retry / error handling) and then passes
 * the Buffer to baileys — never a raw URL.
 *
 * Why:  Baileys' internal fetcher is unreliable with CDN / geo-restricted /
 * temporary-signed URLs.  By pre-downloading we get:
 *   • consistent timeouts (60 s default, configurable)
 *   • a single retry on transient failures
 *   • user-friendly error messages on permanent failures
 *   • zero URLs ever reaching baileys' own downloader
 */

import axios from "axios";
import { fileTypeFromBuffer } from "file-type";

// ── downloadMedia(url, opts?) → { data: Buffer, mime, ext, size } ──
export async function downloadMedia(url, opts = {}) {
        const timeout = opts.timeout || 60000;
        const retries = opts.retries ?? 1;

        for (let attempt = 1; attempt <= retries + 1; attempt++) {
                try {
                        const res = await axios.get(url, {
                                responseType: "arraybuffer",
                                timeout,
                                headers: {
                                        "User-Agent":
                                                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                                        ...(opts.headers || {}),
                                },
                        });

                        const buffer = Buffer.from(res.data);
                        const detected = (await fileTypeFromBuffer(buffer)) || {};
                        const mime = opts.mimetype || detected.mime || res.headers["content-type"] || "application/octet-stream";
                        const ext = detected.ext || mime.split("/")[1] || "bin";

                        return { data: buffer, mime, ext, size: Buffer.byteLength(buffer) };
                } catch (err) {
                        const isLast = attempt === retries + 1;
                        if (!isLast) {
                                console.warn(
                                        `[media] download attempt ${attempt} failed for ${url}: ${err.message} — retrying…`
                                );
                                await new Promise((r) => setTimeout(r, 2000));
                                continue;
                        }
                        throw new Error(
                                `Failed to download media${opts.label ? ` (${opts.label})` : ""}: ${err.message}`
                        );
                }
        }
}

/**
 * sendImage(m, url, caption, opts?)
 * Download an image URL and send it as a WhatsApp image message.
 * Returns the WA message info on success, or null on failure (error already replied).
 */
export async function sendImage(m, url, caption, opts = {}) {
        try {
                const { data, mime } = await downloadMedia(url, opts);
                return await m.reply({ image: data, mimetype: mime, caption }, opts.extra);
        } catch (err) {
                console.error(`[media] sendImage failed:`, err.message);
                await m.reply(`❌ Failed to send image: ${err.message}`).catch(() => {});
                return null;
        }
}

/**
 * sendVideo(m, url, caption, opts?)
 */
export async function sendVideo(m, url, caption, opts = {}) {
        try {
                const { data, mime } = await downloadMedia(url, opts);
                return await m.reply(
                        { video: data, mimetype: mime || "video/mp4", caption, ...(opts.extra || {}) },
                        opts.extra
                );
        } catch (err) {
                console.error(`[media] sendVideo failed:`, err.message);
                await m.reply(`❌ Failed to send video: ${err.message}`).catch(() => {});
                return null;
        }
}

/**
 * sendAudio(m, url, opts?)
 */
export async function sendAudio(m, url, opts = {}) {
        try {
                const { data, mime } = await downloadMedia(url, opts);
                return await m.reply(
                        { audio: data, mimetype: opts.mimetype || mime || "audio/mpeg", ptt: opts.ptt ?? false },
                        opts.extra
                );
        } catch (err) {
                console.error(`[media] sendAudio failed:`, err.message);
                await m.reply(`❌ Failed to send audio: ${err.message}`).catch(() => {});
                return null;
        }
}

/**
 * sendAudioBuffer(m, buffer, opts?)
 * For buffers already in memory (e.g. base64-decoded from API response).
 * Skips the download step entirely.
 */
export async function sendAudioBuffer(m, buffer, opts = {}) {
        try {
                return await m.reply(
                        { audio: buffer, mimetype: opts.mimetype || "audio/mpeg", ptt: opts.ptt ?? false },
                        opts.extra
                );
        } catch (err) {
                console.error(`[media] sendAudioBuffer failed:`, err.message);
                await m.reply(`❌ Failed to send audio: ${err.message}`).catch(() => {});
                return null;
        }
}

/**
 * sendAllImages(m, urls, caption, opts?)
 * Download and send multiple images in sequence.
 */
export async function sendAllImages(m, urls, captionFn, opts = {}) {
        for (let i = 0; i < urls.length; i++) {
                const caption = typeof captionFn === "function" ? captionFn(urls[i], i) : captionFn;
                await sendImage(m, urls[i], i === 0 ? caption : undefined, opts);
        }
}

// ── Utility helpers (used by hidetag, etc.) ──

export function isMediaMessage(type) {
        const mediaTypes = [
                "imageMessage",
                "videoMessage",
                "audioMessage",
                "documentMessage",
                "stickerMessage",
        ];
        return mediaTypes.includes(type);
}

export const mimeMap = {
        imageMessage: "image",
        videoMessage: "video",
        audioMessage: "audio",
        documentMessage: "document",
        stickerMessage: "sticker",
};
