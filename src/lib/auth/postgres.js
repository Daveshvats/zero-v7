import print from "#lib/print";
import { BufferJSON, WAProto, initAuthCreds } from "baileys";
import pg from "pg";

const { Pool } = pg;

let pool = null;

async function ensureTable(pool, tableName) {
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

	if (!pool) {
		pool = new Pool({ connectionString: process.env.DATABASE_URL });
		print.info("PostgreSQL auth: Connected");
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

	const readData = async (fileName) => {
		try {
			const result = await db.query(
				`SELECT datajson FROM ${tableName} WHERE identifier = $1 AND filename = $2`,
				[identifier, fixFileName(fileName)]
			);
			if (result.rows.length > 0) {
				return JSON.parse(result.rows[0].datajson, BufferJSON.reviver);
			}
			return null;
		} catch (error) {
			print.error(`Failed to read auth data for: ${fileName}`, error.message);
			return null;
		}
	};

	const writeData = async (datajson, fileName) => {
		try {
			const jsonStr = JSON.stringify(datajson, BufferJSON.replacer);
			await db.query(
				`INSERT INTO ${tableName} (identifier, filename, datajson, updated_at)
				 VALUES ($1, $2, $3, NOW())
				 ON CONFLICT (identifier, filename)
				 DO UPDATE SET datajson = $3, updated_at = NOW()`,
				[identifier, fixFileName(fileName), jsonStr]
			);
		} catch (error) {
			print.error(`Failed to write auth data for: ${fileName}`, error.message);
			throw error;
		}
	};

	const removeData = async (fileName) => {
		try {
			await db.query(
				`DELETE FROM ${tableName} WHERE identifier = $1 AND filename = $2`,
				[identifier, fixFileName(fileName)]
			);
		} catch (error) {
			print.error(`Failed to delete auth data for: ${fileName}`, error.message);
			throw error;
		}
	};

	const clearAll = async () => {
		try {
			await db.query(
				`DELETE FROM ${tableName} WHERE identifier = $1`,
				[identifier]
			);
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
					const data = {};
					await Promise.all(
						ids.map(async (id) => {
							let value = await readData(`${type}-${id}.json`);
							if (type === "app-state-sync-key" && value) {
								value = WAProto.Message.AppStateSyncKeyData.fromObject(value);
							}
							data[id] = value;
						})
					);
					return data;
				},
				set: async (data) => {
					const tasks = [];
					for (const category in data) {
						for (const id in data[category]) {
							const value = data[category][id];
							const file = `${category}-${id}.json`;
							tasks.push(
								value ? writeData(value, file) : removeData(file)
							);
						}
					}
					await Promise.all(tasks);
				},
			},
		},
		saveCreds: () => writeData(creds, "creds.json"),
		removeCreds: clearAll,
	};
};

export async function closePostgresAuth() {
	if (pool) {
		await pool.end();
		pool = null;
		print.info("PostgreSQL auth: Connection closed");
	}
}
