import workerPool from "#lib/workers/pool";

/**
 * Wrapper around the worker pool's sticker creation.
 * Falls back to main-thread if workers are unavailable.
 *
 * @param {Buffer} mediaBuffer - The media buffer to create the sticker from.
 * @param {Object} options - { packname, author, emojis }
 * @returns {Promise<Buffer>} - The created sticker buffer.
 */
async function createSticker(mediaBuffer, options = {}) {
        return workerPool.exec("sticker", { mediaBuffer, options });
}

export default {
        create: createSticker,
};
