/**
 * ai-helper.js — Shared ItsRose AI image pipeline
 *
 * All ItsRose AI image plugins (turnme, rembg, remini, outpainting, hair,
 * restoration, clothcolor, differentme, clothseg, facial) follow the same
 * pattern:
 *
 *   1. Download user's image from WhatsApp
 *   2. POST base64 to ItsRose API → get task_id or immediate images
 *   3. If async → poll for completion → get image URLs
 *   4. Download each image URL → send as WhatsApp image
 *
 * This module consolidates steps 3-4 so each plugin only needs to handle
 * its specific API call and validation.
 */

import { sendAllImages } from "#lib/media";
import { pollTask } from "#lib/itsrose";

/**
 * Send the result images from an ItsRose API response.
 * Handles both immediate results and polled results.
 *
 * @param {object}   m          — serialized WhatsApp message
 * @param {string[]} images     — Array of image URLs from ItsRose
 * @param {string}   caption    — Caption for the first image
 * @param {object}   [opts]     — Optional overrides
 * @param {string}   [opts.label] — Label for error messages (e.g. "Turn Me")
 * @param {number}   [opts.timeout] — Download timeout per image in ms
 *
 * @returns {Promise<boolean>} true if at least one image was sent
 */
export async function sendAiImages(m, images, caption, opts = {}) {
        const label = opts.label || "AI";
        const timeout = opts.timeout || 60000;

        if (!images || !images.length) {
                await m.reply(`❌ ${label}: No images returned from API.`);
                return false;
        }

        // Normalize images: API may return objects ({ url, ... }) or plain URL strings
        const urls = images.map(img => {
                if (typeof img === "string") return img;
                if (img?.url) return img.url;
                // Last resort: try to find any string field that looks like a URL
                for (const val of Object.values(img || {})) {
                        if (typeof val === "string" && val.startsWith("http")) return val;
                }
                console.error(`[${label}] Cannot extract URL from image:`, typeof img, img);
                return null;
        }).filter(Boolean);

        if (!urls.length) {
                await m.reply(`❌ ${label}: Could not extract image URLs from API response.`);
                return false;
        }

        try {
                await sendAllImages(
                        m,
                        urls,
                        (url, i) => (i === 0 ? caption : undefined),
                        { label, timeout }
                );
                return true;
        } catch (err) {
                console.error(`[${label}] sendAiImages failed:`, err.message);
                await m.reply(`❌ ${label}: Failed to deliver result image — ${err.message}`).catch(() => {});
                return false;
        }
}

/**
 * Submit + poll + send — the full async pipeline for ItsRose image tasks.
 *
 * @param {object} m            — serialized WhatsApp message
 * @param {object} submitData   — The ItsRose submit response data (submit.data.data)
 * @param {string} caption      — Caption for the result image
 * @param {object} opts
 * @param {string} opts.pollPath  — e.g. '/image/get_task' or '/turn_me/get_task'
 * @param {string} opts.label     — Label for error messages
 * @param {number} [opts.intervalMs] — polling interval (default 4000)
 * @param {number} [opts.maxAttempts] — max poll attempts (default 35)
 * @param {number} [opts.timeout] — download timeout per image (default 60000)
 *
 * @returns {Promise<boolean>} true if at least one image was sent
 */
export async function submitPollAndSend(m, submitData, caption, opts = {}) {
        const {
                pollPath,
                label = "AI",
                intervalMs = 4000,
                maxAttempts = 35,
                timeout = 60000,
        } = opts;

        // ── 1. Check for immediate result ──
        if (submitData?.images?.length > 0) {
                return sendAiImages(m, submitData.images, caption, { label, timeout });
        }

        // ── 2. Poll for async result ──
        const taskId = submitData?.task_id;
        if (!taskId) {
                await m.reply(`❌ ${label}: No task ID returned from API.`);
                return false;
        }

        try {
                const result = await pollTask(taskId, pollPath, {
                        intervalMs,
                        maxAttempts,
                        label,
                });
                return sendAiImages(m, result.images || [], caption, { label, timeout });
        } catch (err) {
                if (err.message.includes("failed")) {
                        await m.reply(`❌ ${label} processing failed on the server.`);
                } else if (err.message.includes("timed out")) {
                        await m.reply(`⏰ ${label} timed out — the server is busy, try again later.`);
                } else {
                        await m.reply(`❌ ${label}: ${err.message}`);
                }
                return false;
        }
}
