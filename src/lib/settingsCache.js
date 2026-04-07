// lib/settingsCache.js
// In-memory cache for bot settings to avoid hitting the DB on every single message.

let _db = null;
async function getDB() {
        if (!_db) {
                _db = await import("#lib/database/index");
        }
        return _db;
}

/** @type {Object|null} */
let cachedSettings = null;

/** @type {number} */
let lastFetchTime = 0;

/** Cache TTL in milliseconds (30 seconds) */
const CACHE_TTL = 30_000;

/**
 * Returns cached settings, re-fetching from DB only if the cache is stale.
 * This reduces DB queries from "every message" to "at most once every 30s".
 *
 * @returns {Promise<Object>}
 */
export async function getSettings() {
        const now = Date.now();

        if (cachedSettings && now - lastFetchTime < CACHE_TTL) {
                return cachedSettings;
        }

        try {
                const db = await getDB();
                if (db?.SettingsModel?.getSettings) {
                        cachedSettings = await db.SettingsModel.getSettings();
                        lastFetchTime = now;
                        return cachedSettings;
                }
        } catch (err) {
                // On DB error, return stale cache if available
                if (cachedSettings) {
                        return cachedSettings;
                }
        }

        return {};
}

/**
 * Invalidates the settings cache so the next call fetches fresh data.
 * Call this after any settings mutation.
 */
export function invalidateSettingsCache() {
        cachedSettings = null;
        lastFetchTime = 0;
}
