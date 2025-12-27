import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and, desc, sql } from "drizzle-orm";
import pg from "pg";
import * as schema from "./schema.js";
import print from "#lib/print";

const { Pool } = pg;

let pool = null;
let db = null;

const POOL_CONFIG = {
        min: 2,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
        allowExitOnIdle: false,
};

export async function initPostgres() {
        if (!process.env.DATABASE_URL) {
                print.warn("DATABASE_URL not set, PostgreSQL disabled");
                return null;
        }

        try {
                pool = new Pool({
                        connectionString: process.env.DATABASE_URL,
                        ...POOL_CONFIG,
                });
                
                pool.on("error", (err) => {
                        print.error("PostgreSQL pool error:", err.message);
                });
                
                pool.on("connect", () => {
                        print.debug("PostgreSQL new connection established");
                });
                
                db = drizzle(pool, { schema });
                
                await pool.query("SELECT 1");
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
                const existing = await this.getUser(jid);
                if (existing) {
                        const [updated] = await db
                                .update(schema.users)
                                .set({ ...data, updatedAt: new Date() })
                                .where(eq(schema.users.jid, jid))
                                .returning();
                        return updated;
                }
                const [created] = await db
                        .insert(schema.users)
                        .values({ jid, ...data })
                        .returning();
                return created;
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
                const existing = await this.getGroup(jid);
                if (existing) {
                        const [updated] = await db
                                .update(schema.groups)
                                .set({ ...data, updatedAt: new Date() })
                                .where(eq(schema.groups.jid, jid))
                                .returning();
                        return updated;
                }
                const [created] = await db
                        .insert(schema.groups)
                        .values({ jid, ...data })
                        .returning();
                return created;
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
                for (const [key, value] of Object.entries(data)) {
                        await this.setSetting(key, value);
                }
        },

        async setSetting(key, value) {
                if (!db) {
                        return null;
                }
                const existing = await this.getSetting(key);
                if (existing !== null) {
                        const [updated] = await db
                                .update(schema.settings)
                                .set({ value, updatedAt: new Date() })
                                .where(eq(schema.settings.key, key))
                                .returning();
                        return updated;
                }
                const [created] = await db
                        .insert(schema.settings)
                        .values({ key, value })
                        .returning();
                return created;
        },

        async updateSettings(update) {
                const current = await this.getSettings();
                return this.setSettings({ ...current, ...update });
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
