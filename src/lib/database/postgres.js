import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and, desc, sql } from "drizzle-orm";
import pg from "pg";
import * as schema from "./schema.js";
import print from "#lib/print";

const { Pool } = pg;

let pool = null;
let db = null;

export async function initPostgres() {
	if (!process.env.DATABASE_URL) {
		print.warn("DATABASE_URL not set, PostgreSQL disabled");
		return null;
	}

	try {
		pool = new Pool({ connectionString: process.env.DATABASE_URL });
		db = drizzle(pool, { schema });
		
		await pool.query("SELECT 1");
		print.info("PostgreSQL connected successfully");
		
		return db;
	} catch (error) {
		print.error("PostgreSQL connection failed:", error);
		return null;
	}
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
