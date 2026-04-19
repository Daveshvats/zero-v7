// TODO: Consolidate with database/postgres.js pool — currently creates a second
// pg.Pool to the same DATABASE_URL, doubling connection count.
import print from "#lib/print";
import { BufferJSON, WAProto, initAuthCreds } from "baileys";
import pg from "pg";

const { Pool } = pg;

let pool = null;
let keepAliveTimer = null;

/**
 * Retry a database operation with exponential backoff.
 * Cloud providers kill idle connections, causing transient failures.
 * A retry with backoff lets the pool create fresh connections.
 */
async function withRetry(fn, retries = 3, baseDelay = 500) {
        for (let attempt = 0; attempt <= retries; attempt++) {
                try {
                        return await fn();
                } catch (error) {
                        const isRecoverable =
                                error.message?.includes("terminating connection") ||
                                error.message?.includes("administrator command") ||
                                error.message?.includes("connection terminated") ||
                                error.message?.includes("Connection terminated") ||
                                error.message?.includes("timeout exceeded") ||
                                error.message?.includes("ECONNRESET") ||
                                error.message?.includes("ECONNREFUSED") ||
                                error.message?.includes("SSL connection") ||
                                error.message?.includes("the server does not support SSL") ||
                                error.message?.includes("read ECONNRESET") ||
                                error.message?.includes("has been closed");

                        if (attempt < retries && isRecoverable) {
                                const delay = baseDelay * Math.pow(2, attempt);
                                await new Promise((r) => setTimeout(r, delay));
                                continue;
                        }
                        throw error;
                }
        }
}

function normalizeSSL(connectionString) {
        if (!connectionString) return connectionString;
        try {
                const url = new URL(connectionString);
                const sslMode = url.searchParams.get("sslmode");
                if (
                        sslMode &&
                        sslMode !== "verify-full" &&
                        sslMode !== "disable" &&
                        sslMode !== "no-verify"
                ) {
                        url.searchParams.set("sslmode", "verify-full");
                } else if (!sslMode && url.protocol === "postgresql:") {
                        url.searchParams.set("sslmode", "verify-full");
                }
                return url.toString();
        } catch {
                return connectionString;
        }
}

/**
 * Check if the pool should use Neon's pooled endpoint (-pooler).
 * Automatically converts direct Neon URLs to use the PgBouncer pooler,
 * which handles reconnection transparently and prevents idle-killing.
 *
 * How to verify: Check your Neon Console → Connect → Pooled connection string.
 * If it shows -pooler in the hostname, this is already configured.
 */
function ensurePoolerURL(connectionString) {
        if (!connectionString) return connectionString;
        try {
                const url = new URL(connectionString);
                const hostname = url.hostname;

                // If already using -pooler, nothing to do
                if (hostname.includes("-pooler.")) {
                        return connectionString;
                }

                // Detect Neon direct endpoints and auto-switch to pooled
                if (hostname.includes(".neon.tech")) {
                        const pooledHostname = hostname.replace(
                                /(ep-[^.]+)\./,
                                "$1-pooler."
                        );
                        url.hostname = pooledHostname;
                        print.info(`Detected Neon direct connection, auto-switching to pooled endpoint`);
                        return url.toString();
                }
        } catch {
                // URL parsing failed, return as-is
        }
        return connectionString;
}

async function ensureTable(pool, tableName) {
        if (!/^[a-zA-Z_]+$/.test(tableName)) throw new Error("Invalid table name");
        await pool.query(`
                CREATE TABLE IF NOT EXISTS ${tableName} (
                        id SERIAL PRIMARY KEY,
                        identifier TEXT NOT NULL,
                        filename TEXT NOT NULL,
                        datajson TEXT NOT NULL,
                        created_at TIMESTAMP DEFAULT NOW(),
                        updated_at TIMESTAMP DEFAULT NOW(),
                        UNIQUE(identifier, filename)
                )
        `);
}

async function connectToPostgres(tableName = "auth_state") {
        if (!process.env.DATABASE_URL) {
                throw new Error("DATABASE_URL is required for PostgreSQL auth.");
        }

        if (!/^[a-zA-Z_]+$/.test(tableName)) throw new Error("Invalid table name");

        if (!pool) {
                let connectionString = normalizeSSL(process.env.DATABASE_URL);

                // For Neon: auto-switch to pooled endpoint (-pooler) for stable connections.
                // PgBouncer handles reconnection transparently — no more dead connections.
                // If you're NOT using Neon, this is a no-op.
                connectionString = ensurePoolerURL(connectionString);

                pool = new Pool({
                        connectionString,
                        min: 2,
                        max: 10,
                        keepAlive: true,
                        keepAliveInitialDelayMillis: 10000,
                        // 30 second idle timeout — recycle connections before they go stale.
                        // With the pooled endpoint, this is just a safety net.
                        idleTimeoutMillis: 30000,
                        connectionTimeoutMillis: 15000,
                        allowExitOnIdle: false,
                });

                // Catch idle connection kills from cloud providers — prevents uncaught exception crashes
                pool.on("error", (err) => {
                        if (
                                err.message?.includes("terminating connection") ||
                                err.message?.includes("administrator command")
                        ) {
                                print.debug(
                                        "PostgreSQL auth idle connection reclaimed by server (normal for cloud DBs)"
                                );
                        } else {
                                print.error("PostgreSQL auth pool error:", err.message);
                        }
                });

                // ── Keepalive heartbeat ──────────────────────────────────────────
                // Keeps the pool connections warm. With the pooled endpoint this is
                // mostly a safety net — PgBouncer handles the real connection lifecycle.
                // For direct connections (local/non-Neon), this prevents OS-level idle kills.
                keepAliveTimer = setInterval(async () => {
                        try {
                                await pool.query("SELECT 1");
                        } catch {
                                // Connection was dead — pool will create a fresh one next time
                        }
                }, 30 * 1000);
                keepAliveTimer.unref();

                print.info("PostgreSQL auth: Connected (keepalive every 30s)");
        }

        await ensureTable(pool, tableName);
        return pool;
}

export const usePostgresAuthState = async (
        identifier = "default",
        tableName = "auth_state"
) => {
        const db = await connectToPostgres(tableName);

        const fixFileName = (file) =>
                file?.replace(/\//g, "__")?.replace(/:/g, "-") || "";

        // ── Single-item read (used for creds.json) ───────────────────────
        const readData = async (fileName) => {
                try {
                        return await withRetry(async () => {
                                const result = await db.query(
                                        `SELECT datajson FROM ${tableName} WHERE identifier = $1 AND filename = $2`,
                                        [identifier, fixFileName(fileName)]
                                );
                                if (result.rows.length > 0) {
                                        return JSON.parse(result.rows[0].datajson, BufferJSON.reviver);
                                }
                                return null;
                        });
                } catch (error) {
                        print.error(`Failed to read auth data for: ${fileName}`, error.message);
                        return null;
                }
        };

        // ── BATCH read: fetch multiple sessions in ONE query ──────────────
        const readBatch = async (fileNames) => {
                if (fileNames.length === 0) return {};
                try {
                        return await withRetry(async () => {
                                const fixed = fileNames.map(fixFileName);
                                const result = await db.query(
                                        `SELECT filename, datajson FROM ${tableName}
                                         WHERE identifier = $1 AND filename = ANY($2)`,
                                        [identifier, fixed]
                                );
                                const map = {};
                                for (const row of result.rows) {
                                        map[row.filename] = JSON.parse(row.datajson, BufferJSON.reviver);
                                }
                                return map;
                        });
                } catch (error) {
                        print.error(`Failed to batch-read auth data: ${error.message}`);
                        return {};
                }
        };

        // ── Single-item write (used for creds.json) ──────────────────────
        const writeData = async (datajson, fileName) => {
                try {
                        await withRetry(async () => {
                                const jsonStr = JSON.stringify(datajson, BufferJSON.replacer);
                                await db.query(
                                        `INSERT INTO ${tableName} (identifier, filename, datajson, updated_at)
                                         VALUES ($1, $2, $3, NOW())
                                         ON CONFLICT (identifier, filename)
                                         DO UPDATE SET datajson = $3, updated_at = NOW()`,
                                        [identifier, fixFileName(fileName), jsonStr]
                                );
                        });
                } catch (error) {
                        print.error(`Failed to write auth data for: ${fileName}`, error.message);
                }
        };

        // ── BATCH write: upsert multiple sessions in ONE query ────────────
        const writeBatch = async (entries) => {
                if (entries.length === 0) return;
                try {
                        await withRetry(async () => {
                                const identifiers = [];
                                const filenames = [];
                                const datajsons = [];
                                for (const { fileName, datajson } of entries) {
                                        identifiers.push(identifier);
                                        filenames.push(fixFileName(fileName));
                                        datajsons.push(JSON.stringify(datajson, BufferJSON.replacer));
                                }
                                await db.query(
                                        `INSERT INTO ${tableName} (identifier, filename, datajson, updated_at)
                                         SELECT * FROM UNNEST(
                                                $1::text[], $2::text[], $3::text[], $4::timestamp[]
                                         )
                                         ON CONFLICT (identifier, filename)
                                         DO UPDATE SET datajson = EXCLUDED.datajson, updated_at = EXCLUDED.updated_at`,
                                        [identifiers, filenames, datajsons, entries.map(() => new Date())]
                                );
                        });
                } catch (error) {
                        print.error(
                                `Failed to batch-write ${entries.length} auth entries: ${error.message}`
                        );
                }
        };

        // ── BATCH delete: remove multiple sessions in ONE query ───────────
        const deleteBatch = async (fileNames) => {
                if (fileNames.length === 0) return;
                try {
                        await withRetry(async () => {
                                const fixed = fileNames.map(fixFileName);
                                await db.query(
                                        `DELETE FROM ${tableName} WHERE identifier = $1 AND filename = ANY($2)`,
                                        [identifier, fixed]
                                );
                        });
                } catch (error) {
                        print.error(
                                `Failed to batch-delete ${fileNames.length} auth entries: ${error.message}`
                        );
                }
        };

        const removeData = async (fileName) => {
                try {
                        await withRetry(async () => {
                                await db.query(
                                        `DELETE FROM ${tableName} WHERE identifier = $1 AND filename = $2`,
                                        [identifier, fixFileName(fileName)]
                                );
                        });
                } catch (error) {
                        print.error(`Failed to delete auth data for: ${fileName}`, error.message);
                }
        };

        const clearAll = async () => {
                try {
                        await withRetry(async () => {
                                await db.query(
                                        `DELETE FROM ${tableName} WHERE identifier = $1`,
                                        [identifier]
                                );
                        });
                        print.info(`Cleared all auth data for identifier: ${identifier}`);
                } catch (error) {
                        print.error(`Failed to clear auth data for: ${identifier}`, error.message);
                        throw error;
                }
        };

        const creds = (await readData("creds.json")) || initAuthCreds();

        return {
                state: {
                        creds,
                        keys: {
                                get: async (type, ids) => {
                                        const fileNames = ids.map((id) => `${type}-${id}.json`);
                                        const resultMap = await readBatch(fileNames);

                                        const data = {};
                                        for (const id of ids) {
                                                const fixed = fixFileName(`${type}-${id}.json`);
                                                let value = resultMap[fixed] || null;
                                                if (type === "app-state-sync-key" && value) {
                                                        value =
                                                                WAProto.Message.AppStateSyncKeyData.fromObject(value);
                                                }
                                                data[id] = value;
                                        }
                                        return data;
                                },
                                set: async (data) => {
                                        const toWrite = [];
                                        const toDelete = [];

                                        for (const category in data) {
                                                for (const id in data[category]) {
                                                        const value = data[category][id];
                                                        const file = `${category}-${id}.json`;
                                                        if (value) {
                                                                toWrite.push({ fileName: file, datajson: value });
                                                        } else {
                                                                toDelete.push(file);
                                                        }
                                                }
                                        }

                                        await Promise.all([
                                                writeBatch(toWrite),
                                                deleteBatch(toDelete),
                                        ]);
                                },
                        },
                },
                saveCreds: () => writeData(creds, "creds.json"),
                removeCreds: clearAll,
        };
};

export async function closePostgresAuth() {
        if (keepAliveTimer) {
                clearInterval(keepAliveTimer);
                keepAliveTimer = null;
        }
        if (pool) {
                await pool.end();
                pool = null;
                print.info("PostgreSQL auth: Connection closed");
        }
}
