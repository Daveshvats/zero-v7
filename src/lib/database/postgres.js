import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and, desc, sql } from "drizzle-orm";
import pg from "pg";
import * as schema from "./schema.js";
import print from "#lib/print";

const { Pool } = pg;

let pool = null;
let db = null;
let keepAliveTimer = null;

const POOL_CONFIG = {
        min: 2,
        max: 10,
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000,
        idleTimeoutMillis: 300000,     // 5 min — prevents excessive connect/disconnect churn with Neon
        connectionTimeoutMillis: 15000,
        allowExitOnIdle: false,
};

/**
 * Auto-switch Neon direct URLs to use the pooled endpoint (-pooler).
 * PgBouncer handles reconnection transparently, preventing dead connections.
 * If you're NOT using Neon, this is a no-op.
 */
function ensurePoolerURL(connectionString) {
        if (!connectionString) return connectionString;
        try {
                const url = new URL(connectionString);
                if (url.hostname.includes("-pooler.")) {
                        return connectionString;
                }
                if (url.hostname.includes(".neon.tech")) {
                        url.hostname = url.hostname.replace(/(ep-[^.]+)\./, "$1-pooler.");
                        print.info(`Detected Neon direct connection, auto-switching to pooled endpoint`);
                        return url.toString();
                }
        } catch {}
        return connectionString;
}

/**
 * Run auto-migrations: add columns to existing tables if they don't exist.
 * Uses raw SQL with IF NOT EXISTS so it's safe to run on every startup.
 */
async function runAutoMigrations(pool) {
        const migrations = [
                // === users table ===
                `ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT`,
                `ALTER TABLE users ADD COLUMN IF NOT EXISTS banned BOOLEAN DEFAULT false`,
                `ALTER TABLE users ADD COLUMN IF NOT EXISTS premium BOOLEAN DEFAULT false`,
                `ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_expired TIMESTAMP`,
                `ALTER TABLE users ADD COLUMN IF NOT EXISTS "limit" INTEGER DEFAULT 0`,
                `ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN DEFAULT false`,
                `ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP`,
                `ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`,
                `ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`,

                // === groups table ===
                `ALTER TABLE groups ADD COLUMN IF NOT EXISTS name TEXT`,
                `ALTER TABLE groups ADD COLUMN IF NOT EXISTS banned BOOLEAN DEFAULT false`,
                `ALTER TABLE groups ADD COLUMN IF NOT EXISTS welcome BOOLEAN DEFAULT false`,
                `ALTER TABLE groups ADD COLUMN IF NOT EXISTS welcome_message TEXT`,
                `ALTER TABLE groups ADD COLUMN IF NOT EXISTS goodbye BOOLEAN DEFAULT false`,
                `ALTER TABLE groups ADD COLUMN IF NOT EXISTS goodbye_message TEXT`,
                `ALTER TABLE groups ADD COLUMN IF NOT EXISTS antilink BOOLEAN DEFAULT false`,
                `ALTER TABLE groups ADD COLUMN IF NOT EXISTS muted BOOLEAN DEFAULT false`,
                `ALTER TABLE groups ADD COLUMN IF NOT EXISTS cai_enabled BOOLEAN DEFAULT false`,
                `ALTER TABLE groups ADD COLUMN IF NOT EXISTS cai_char_id TEXT`,
                `ALTER TABLE groups ADD COLUMN IF NOT EXISTS cai_char_name TEXT`,
                `ALTER TABLE groups ADD COLUMN IF NOT EXISTS cai_chat_id TEXT`,
                `ALTER TABLE groups ADD COLUMN IF NOT EXISTS metadata JSONB`,
                `ALTER TABLE groups ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN DEFAULT false`,
                `ALTER TABLE groups ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP`,
                `ALTER TABLE groups ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`,
                `ALTER TABLE groups ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`,

                // === voice_clones table ===
                `CREATE TABLE IF NOT EXISTS voice_clones (
                        id SERIAL PRIMARY KEY,
                        group_jid TEXT NOT NULL,
                        name TEXT NOT NULL,
                        voice_id TEXT NOT NULL,
                        cloned_by TEXT NOT NULL,
                        created_at TIMESTAMP DEFAULT NOW()
                )`,
                `CREATE UNIQUE INDEX IF NOT EXISTS vc_group_name_unique ON voice_clones(group_jid, name)`,
                // Fix any existing rows with uppercase names (case mismatch bug)
                `UPDATE voice_clones SET name = LOWER(name) WHERE name != LOWER(name)`,

                // === commands table ===
                `ALTER TABLE commands ADD COLUMN IF NOT EXISTS command_name TEXT NOT NULL DEFAULT ''`,
                `ALTER TABLE commands ADD COLUMN IF NOT EXISTS user_jid TEXT NOT NULL DEFAULT ''`,
                `ALTER TABLE commands ADD COLUMN IF NOT EXISTS group_jid TEXT`,
                `ALTER TABLE commands ADD COLUMN IF NOT EXISTS args TEXT`,
                `ALTER TABLE commands ADD COLUMN IF NOT EXISTS response_time_ms INTEGER`,
                `ALTER TABLE commands ADD COLUMN IF NOT EXISTS success BOOLEAN DEFAULT true`,
                `ALTER TABLE commands ADD COLUMN IF NOT EXISTS error TEXT`,
                `ALTER TABLE commands ADD COLUMN IF NOT EXISTS executed_at TIMESTAMP DEFAULT NOW()`,

                // === ai_tasks table ===
                `ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS task_type TEXT NOT NULL DEFAULT ''`,
                `ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS user_jid TEXT NOT NULL DEFAULT ''`,
                `ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS prompt TEXT`,
                `ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS result TEXT`,
                `ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'`,
                `ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS processing_time_ms INTEGER`,
                `ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS metadata JSONB`,
                `ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`,
                `ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP`,

                // === sessions table ===
                `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS phone TEXT`,
                `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS connected BOOLEAN DEFAULT false`,
                `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_clone BOOLEAN DEFAULT false`,
                `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`,
                `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_active TIMESTAMP DEFAULT NOW()`,

                // === settings table ===
                `ALTER TABLE settings ADD COLUMN IF NOT EXISTS value JSONB`,
                `ALTER TABLE settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`,
        ];

        // === Index creation migrations ===
        // Safe to run on every startup — PostgreSQL supports CREATE INDEX IF NOT EXISTS
        const indexMigrations = [
                `CREATE INDEX IF NOT EXISTS idx_commands_user_jid ON commands(user_jid)`,
                `CREATE INDEX IF NOT EXISTS idx_commands_command_name ON commands(command_name)`,
                `CREATE INDEX IF NOT EXISTS idx_commands_executed_at ON commands(executed_at)`,
                `CREATE INDEX IF NOT EXISTS idx_ai_tasks_user_jid ON ai_tasks(user_jid)`,
                `CREATE INDEX IF NOT EXISTS idx_ai_tasks_status ON ai_tasks(status)`,
                `CREATE INDEX IF NOT EXISTS idx_permissions_lookup ON permissions(jid, type, permission)`,
                `CREATE INDEX IF NOT EXISTS idx_voice_clones_group ON voice_clones(group_jid)`,
                `CREATE INDEX IF NOT EXISTS idx_voice_clones_group_name ON voice_clones(group_jid, name)`,
        ];

        for (const statement of [...migrations, ...indexMigrations]) {
                try {
                        await pool.query(statement);
                } catch (err) {
                        // Ignore "column already exists" or table-not-found errors during first boot
                        if (!err.message.includes("already exists") && !err.message.includes("does not exist")) {
                                print.debug(`Auto-migration notice: ${err.message}`);
                        }
                }
        }
        print.debug("Auto-migrations complete");
}

export async function initPostgres() {
        if (!process.env.DATABASE_URL) {
                print.warn("DATABASE_URL not set, PostgreSQL disabled");
                return null;
        }

        try {
                // Normalize the DATABASE_URL to explicitly use sslmode=verify-full.
                let connectionString = process.env.DATABASE_URL;
                if (connectionString) {
                        const url = new URL(connectionString);
                        const sslMode = url.searchParams.get("sslmode");
                        if (sslMode && sslMode !== "verify-full" && sslMode !== "disable" && sslMode !== "no-verify") {
                                url.searchParams.set("sslmode", "verify-full");
                                connectionString = url.toString();
                        } else if (!sslMode && url.protocol === "postgresql:") {
                                url.searchParams.set("sslmode", "verify-full");
                                connectionString = url.toString();
                        }
                }

                // Auto-switch to Neon pooled endpoint for stable connections
                connectionString = ensurePoolerURL(connectionString);

                pool = new Pool({
                        connectionString,
                        ...POOL_CONFIG,
                });
                
                pool.on("error", (err) => {
                        // Suppress noisy "terminating connection due to administrator command" errors.
                        // This happens when the cloud PostgreSQL provider (Neon/Supabase/Railway)
                        // kills idle connections after their server-side timeout (usually 5 min).
                        // The pool automatically creates a fresh connection on the next query.
                        if (err.message?.includes("terminating connection") || err.message?.includes("administrator command")) {
                                print.debug("PostgreSQL idle connection reclaimed by server (normal for cloud DBs)");
                        } else {
                                print.error("PostgreSQL pool error:", err.message);
                        }
                });
                
                pool.on("connect", () => {
                        print.debug("PostgreSQL new connection established");
                });
                
                pool.on("remove", () => {
                        print.debug("PostgreSQL connection removed from pool");
                });
                
                db = drizzle(pool, { schema });
                
                await pool.query("SELECT 1");
                
                // Run auto-migrations to add new columns to existing tables
                await runAutoMigrations(pool);

                // ── Keepalive heartbeat ──────────────────────────────────────────
                // With pooled endpoint this is mostly a safety net — PgBouncer
                // handles the real connection lifecycle. For direct connections
                // (local/non-Neon), this prevents OS-level idle kills.
                keepAliveTimer = setInterval(async () => {
                        try {
                                await pool.query("SELECT 1");
                        } catch {
                                // Connection was dead — pool will create a fresh one
                        }
                }, 30 * 1000);
                keepAliveTimer.unref();

                print.info(`PostgreSQL connected (pool: min=${POOL_CONFIG.min}, max=${POOL_CONFIG.max})`);
                
                return db;
        } catch (error) {
                print.error("PostgreSQL connection failed:", error);
                return null;
        }
}

export function getPoolStats() {
        if (!pool) return null;
        return {
                totalCount: pool.totalCount,
                idleCount: pool.idleCount,
                waitingCount: pool.waitingCount,
        };
}

export function getDb() {
        return db;
}

export function getPool() {
        return pool;
}

export async function closePostgres() {
        if (keepAliveTimer) {
                clearInterval(keepAliveTimer);
                keepAliveTimer = null;
        }
        if (pool) {
                await pool.end();
                print.info("PostgreSQL connection closed");
        }
}

export const UserModel = {
        async getUser(jid) {
                if (!db) {
                        return null;
                }
                const [user] = await db.select().from(schema.users).where(eq(schema.users.jid, jid));
                return user || null;
        },

        async getAllUsers() {
                if (!db) {
                        return [];
                }
                return db.select().from(schema.users);
        },

        async setUser(jid, data) {
                if (!db) {
                        return null;
                }
                // UPSERT: single query instead of SELECT + INSERT/UPDATE
                const [result] = await db
                        .insert(schema.users)
                        .values({ jid, ...data })
                        .onConflictDoUpdate({
                                target: schema.users.jid,
                                set: { ...data, updatedAt: new Date() },
                        })
                        .returning();
                return result;
        },

        async setBanned(jid, banned = false) {
                return this.setUser(jid, { banned });
        },

        async setPremium(jid, premium = false, expired = null) {
                return this.setUser(jid, { premium, premiumExpired: expired });
        },

        async setLimit(jid, limit = 0) {
                return this.setUser(jid, { limit });
        },
};

export const GroupModel = {
        async getGroup(jid) {
                if (!db) {
                        return null;
                }
                const [group] = await db.select().from(schema.groups).where(eq(schema.groups.jid, jid));
                return group || null;
        },

        async getAllGroups() {
                if (!db) {
                        return [];
                }
                return db.select().from(schema.groups);
        },

        async setGroup(jid, data) {
                if (!db) {
                        return null;
                }
                // UPSERT: single query instead of SELECT + INSERT/UPDATE
                const [result] = await db
                        .insert(schema.groups)
                        .values({ jid, ...data })
                        .onConflictDoUpdate({
                                target: schema.groups.jid,
                                set: { ...data, updatedAt: new Date() },
                        })
                        .returning();
                return result;
        },

        async setWelcome(jid, enabled, message = null) {
                return this.setGroup(jid, { welcome: enabled, welcomeMessage: message });
        },

        async setAntilink(jid, enabled) {
                return this.setGroup(jid, { antilink: enabled });
        },

        async setBanned(jid, banned = false) {
                return this.setGroup(jid, { banned });
        },
};

export const CommandModel = {
        async logCommand(commandName, userJid, groupJid = null, args = "", responseTimeMs = 0, success = true, error = null) {
                if (!db) {
                        return null;
                }
                const [logged] = await db
                        .insert(schema.commands)
                        .values({
                                commandName,
                                userJid,
                                groupJid,
                                args,
                                responseTimeMs,
                                success,
                                error,
                        })
                        .returning();
                return logged;
        },

        async getCommandStats(limit = 10) {
                if (!db) {
                        return [];
                }
                return db
                        .select({
                                commandName: schema.commands.commandName,
                                count: sql`count(*)::int`,
                                avgTime: sql`avg(${schema.commands.responseTimeMs})::int`,
                        })
                        .from(schema.commands)
                        .groupBy(schema.commands.commandName)
                        .orderBy(desc(sql`count(*)`))
                        .limit(limit);
        },

        async getUserCommands(userJid, limit = 50) {
                if (!db) {
                        return [];
                }
                return db
                        .select()
                        .from(schema.commands)
                        .where(eq(schema.commands.userJid, userJid))
                        .orderBy(desc(schema.commands.executedAt))
                        .limit(limit);
        },
};

export const AITaskModel = {
        async createTask(taskType, userJid, prompt = null, metadata = null) {
                if (!db) {
                        return null;
                }
                const [task] = await db
                        .insert(schema.aiTasks)
                        .values({
                                taskType,
                                userJid,
                                prompt,
                                metadata,
                                status: "pending",
                        })
                        .returning();
                return task;
        },

        async updateTask(id, data) {
                if (!db) {
                        return null;
                }
                const [updated] = await db
                        .update(schema.aiTasks)
                        .set(data)
                        .where(eq(schema.aiTasks.id, id))
                        .returning();
                return updated;
        },

        async completeTask(id, result, processingTimeMs = 0) {
                return this.updateTask(id, {
                        result,
                        status: "completed",
                        processingTimeMs,
                        completedAt: new Date(),
                });
        },

        async failTask(id, error) {
                return this.updateTask(id, {
                        status: "failed",
                        result: error,
                });
        },

        async getUserTasks(userJid, limit = 20) {
                if (!db) {
                        return [];
                }
                return db
                        .select()
                        .from(schema.aiTasks)
                        .where(eq(schema.aiTasks.userJid, userJid))
                        .orderBy(desc(schema.aiTasks.createdAt))
                        .limit(limit);
        },
};

export const SettingsModel = {
        async getSettings() {
                if (!db) {
                        return {};
                }
                const rows = await db.select().from(schema.settings);
                const result = {};
                for (const row of rows) {
                        result[row.key] = row.value;
                }
                return result;
        },

        async getSetting(key) {
                if (!db) {
                        return null;
                }
                const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, key));
                return row?.value || null;
        },

        async setSettings(data) {
                if (!db) {
                        return;
                }
                const entries = Object.entries(data);
                if (entries.length === 0) return;
                // Batch INSERT — replaces N sequential upserts with a single query.
                // Uses pool.query() directly for parameterized multi-row VALUES.
                const values = entries.map(([key, value], i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(',');
                const params = entries.flatMap(([key, value]) => [key, JSON.stringify(value)]);
                await pool.query(
                        `INSERT INTO settings (key, value) VALUES ${values} ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
                        params
                );
        },

        async setSetting(key, value) {
                if (!db) {
                        return null;
                }
                // UPSERT: single query instead of SELECT + INSERT/UPDATE
                const [result] = await db
                        .insert(schema.settings)
                        .values({ key, value })
                        .onConflictDoUpdate({
                                target: schema.settings.key,
                                set: { value, updatedAt: new Date() },
                        })
                        .returning();
                return result;
        },

        async updateSettings(update) {
                if (!db) return;
                const current = await this.getSettings();
                const merged = { ...current, ...update };
                await this.setSettings(merged); // FIX: Use batch method instead of N individual upserts
        },
};

export const SessionModel = {
        async getSession(sessionName) {
                if (!db) {
                        return null;
                }
                const [session] = await db
                        .select()
                        .from(schema.sessions)
                        .where(eq(schema.sessions.sessionName, sessionName));
                return session || null;
        },

        async list() {
                if (!db) {
                        return [];
                }
                return db.select().from(schema.sessions);
        },

        async createSession(sessionName, phone, isClone = false) {
                if (!db) {
                        return null;
                }
                const [session] = await db
                        .insert(schema.sessions)
                        .values({ sessionName, phone, isClone, connected: false })
                        .returning();
                return session;
        },

        async updateSession(sessionName, data) {
                if (!db) {
                        return null;
                }
                const [updated] = await db
                        .update(schema.sessions)
                        .set({ ...data, lastActive: new Date() })
                        .where(eq(schema.sessions.sessionName, sessionName))
                        .returning();
                return updated;
        },

        async deleteSession(sessionName) {
                if (!db) {
                        return;
                }
                await db.delete(schema.sessions).where(eq(schema.sessions.sessionName, sessionName));
        },
};

export const DeadLetterModel = {
        async addFailed(commandName, userJid, groupJid, args, error, stackTrace = null, metadata = null) {
                if (!db) return null;
                const [entry] = await db
                        .insert(schema.deadLetterQueue)
                        .values({
                                commandName,
                                userJid,
                                groupJid,
                                args,
                                error,
                                stackTrace,
                                metadata,
                        })
                        .returning();
                return entry;
        },

        async getRecent(limit = 50) {
                if (!db) return [];
                return db
                        .select()
                        .from(schema.deadLetterQueue)
                        .where(eq(schema.deadLetterQueue.resolved, false))
                        .orderBy(desc(schema.deadLetterQueue.failedAt))
                        .limit(limit);
        },

        async resolve(id) {
                if (!db) return null;
                const [updated] = await db
                        .update(schema.deadLetterQueue)
                        .set({ resolved: true, resolvedAt: new Date() })
                        .where(eq(schema.deadLetterQueue.id, id))
                        .returning();
                return updated;
        },

        async getByUser(userJid, limit = 20) {
                if (!db) return [];
                return db
                        .select()
                        .from(schema.deadLetterQueue)
                        .where(eq(schema.deadLetterQueue.userJid, userJid))
                        .orderBy(desc(schema.deadLetterQueue.failedAt))
                        .limit(limit);
        },

        async getStats() {
                if (!db) return null;
                const [stats] = await db
                        .select({
                                total: sql`count(*)::int`,
                                unresolved: sql`count(*) filter (where resolved = false)::int`,
                                lastHour: sql`count(*) filter (where failed_at > now() - interval '1 hour')::int`,
                        })
                        .from(schema.deadLetterQueue);
                return stats;
        },
};

export const PermissionModel = {
        async getPermission(jid, type, commandName = null) {
                if (!db) return null;
                const now = new Date();
                const conditions = [
                        eq(schema.permissions.jid, jid),
                        eq(schema.permissions.type, type),
                        sql`(expires_at IS NULL OR expires_at > ${now})`,
                ];
                if (commandName) {
                        conditions.push(
                                sql`(command_name IS NULL OR command_name = ${commandName})`
                        );
                }
                const [perm] = await db
                        .select()
                        .from(schema.permissions)
                        .where(and(...conditions));
                return perm || null;
        },

        async getUserPermissions(jid) {
                if (!db) return [];
                const now = new Date();
                return db
                        .select()
                        .from(schema.permissions)
                        .where(
                                and(
                                        eq(schema.permissions.jid, jid),
                                        sql`(expires_at IS NULL OR expires_at > ${now})`
                                )
                        );
        },

        async hasPermission(jid, type, permission, commandName = null) {
                if (!db) return false;
                const now = new Date();
                const conditions = [
                        eq(schema.permissions.jid, jid),
                        eq(schema.permissions.type, type),
                        eq(schema.permissions.permission, permission),
                        sql`(expires_at IS NULL OR expires_at > ${now})`,
                ];
                if (commandName) {
                        conditions.push(
                                sql`(command_name IS NULL OR command_name = ${commandName})`
                        );
                }
                const [perm] = await db
                        .select()
                        .from(schema.permissions)
                        .where(and(...conditions));
                return !!perm;
        },

        async grantPermission(jid, type, permission, options = {}) {
                if (!db) return null;
                const { commandName = null, grantedBy = null, reason = null, expiresAt = null } = options;
                
                const existing = await this.getPermission(jid, type, commandName);
                if (existing && existing.permission === permission) {
                        const [updated] = await db
                                .update(schema.permissions)
                                .set({ 
                                        permission, 
                                        grantedBy, 
                                        reason, 
                                        expiresAt, 
                                        updatedAt: new Date() 
                                })
                                .where(eq(schema.permissions.id, existing.id))
                                .returning();
                        return updated;
                }

                const [created] = await db
                        .insert(schema.permissions)
                        .values({
                                jid,
                                type,
                                commandName,
                                permission,
                                grantedBy,
                                reason,
                                expiresAt,
                        })
                        .returning();
                return created;
        },

        async revokePermission(jid, type, commandName = null) {
                if (!db) return;
                const conditions = [
                        eq(schema.permissions.jid, jid),
                        eq(schema.permissions.type, type),
                ];
                if (commandName) {
                        conditions.push(eq(schema.permissions.commandName, commandName));
                }
                await db.delete(schema.permissions).where(and(...conditions));
        },

        async isUserBlocked(jid, commandName = null) {
                if (!db) return false;
                return this.hasPermission(jid, "user", "blocked", commandName);
        },

        async isGroupDisabled(groupJid, commandName = null) {
                if (!db) return false;
                return this.hasPermission(groupJid, "group", "disabled", commandName);
        },

        async isPremium(jid) {
                if (!db) return false;
                return this.hasPermission(jid, "user", "premium");
        },

        async getCommandDisabledGroups(commandName) {
                if (!db) return [];
                const now = new Date();
                return db
                        .select()
                        .from(schema.permissions)
                        .where(
                                and(
                                        eq(schema.permissions.commandName, commandName),
                                        eq(schema.permissions.permission, "disabled"),
                                        eq(schema.permissions.type, "group"),
                                        sql`(expires_at IS NULL OR expires_at > ${now})`
                                )
                        );
        },
};

export const VoiceModel = {
        /** Save a voice clone. Returns the saved row or null on conflict. */
        async saveClone(groupJid, name, voiceId, clonedBy) {
                if (!db) return null;
                try {
                        const normalizedName = name.toLowerCase();
                        const [result] = await db
                                .insert(schema.voiceClones)
                                .values({ groupJid, name: normalizedName, voiceId, clonedBy })
                                .onConflictDoUpdate({
                                        target: [schema.voiceClones.groupJid, schema.voiceClones.name],
                                        set: { voiceId, clonedBy },
                                })
                                .returning();
                        return result;
                } catch (err) {
                        print.debug(`VoiceModel.saveClone error: ${err.message}`);
                        return null;
                }
        },

        /** Get a voice clone by name within a specific group. */
        async getClone(groupJid, name) {
                if (!db) return null;
                const searchName = name.toLowerCase();
                const [row] = await db
                        .select()
                        .from(schema.voiceClones)
                        .where(
                                and(
                                        eq(schema.voiceClones.groupJid, groupJid),
                                        eq(schema.voiceClones.name, searchName),
                                )
                        );
                return row || null;
        },

        /** List all voice clones for a group. */
        async getGroupClones(groupJid) {
                if (!db) return [];
                return db
                        .select()
                        .from(schema.voiceClones)
                        .where(eq(schema.voiceClones.groupJid, groupJid))
                        .orderBy(desc(schema.voiceClones.createdAt));
        },

        /** Delete a voice clone by name within a group. Returns true if deleted. */
        async deleteClone(groupJid, name) {
                if (!db) return false;
                const result = await db
                        .delete(schema.voiceClones)
                        .where(
                                and(
                                        eq(schema.voiceClones.groupJid, groupJid),
                                        eq(schema.voiceClones.name, name.toLowerCase()),
                                )
                        );
                // result is a QueryResult with rowCount
                return (result?.rowCount ?? 0) > 0;
        },
};

export const MigrationModel = {
        async getApplied() {
                if (!db) return [];
                return db.select().from(schema.migrations).orderBy(desc(schema.migrations.appliedAt));
        },

        async isApplied(name) {
                if (!db) return false;
                const [migration] = await db
                        .select()
                        .from(schema.migrations)
                        .where(eq(schema.migrations.name, name));
                return !!migration;
        },

        async markApplied(name, hash = null) {
                if (!db) return null;
                const [entry] = await db
                        .insert(schema.migrations)
                        .values({ name, hash })
                        .returning();
                return entry;
        },

        async getCurrentVersion() {
                if (!db) return null;
                const [latest] = await db
                        .select()
                        .from(schema.migrations)
                        .orderBy(desc(schema.migrations.appliedAt))
                        .limit(1);
                return latest?.name || null;
        },
};
