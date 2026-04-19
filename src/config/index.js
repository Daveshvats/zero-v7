/**
 * MySQL database configuration.
 * @type {object}
 */
export const MYSQL_CONFIG = {
        host: process.env.MYSQL_HOST,
        port: parseInt(process.env.MYSQL_PORT || "3306", 10),
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
        tableName: process.env.MYSQL_TABLE_NAME,
};

/**
 * General bot configuration.
 * @type {object}
 */
export const BOT_CONFIG = {
        sessionName: process.env.BOT_SESSION_NAME || "sessions",
        prefixes: (() => {
                if (!process.env.BOT_PREFIXES) return [];
                try {
                        return process.env.BOT_PREFIXES.includes("[")
                                ? JSON.parse(process.env.BOT_PREFIXES.replace(/'/g, '"'))
                                : process.env.BOT_PREFIXES.split(",").map((p) => p.trim()).filter(Boolean);
                } catch {
                        // FIX: Fallback to simple split if JSON.parse fails (malformed JSON)
                        return process.env.BOT_PREFIXES.split(",").map((p) => p.trim()).filter(Boolean);
                }
        })(),
        ownerJids: (() => {
                if (!process.env.OWNER_JIDS) return [];
                try {
                        return process.env.OWNER_JIDS.includes("[")
                                ? JSON.parse(process.env.OWNER_JIDS.replace(/'/g, '"'))
                                : process.env.OWNER_JIDS.split(",");
                } catch {
                        // FIX: Fallback to simple split if JSON.parse fails
                        return process.env.OWNER_JIDS.split(",").filter(Boolean);
                }
        })(),
        allowExperimental: process.env.BOT_ALLOW_EXPERIMENTAL !== "false",
};

/**
 * MongoDB configuration.
 * @type {object}
 */
export const MONGO_CONFIG = {
        uri: process.env.MONGO_URI,
        USE_MONGO: process.env.USE_MONGO === "true",
        auth: process.env.MONGO_AUTH_COLLECTION,
};

/**
 * ItsRose API configuration.
 * @type {object}
 */
export const ITSROSE_CONFIG = {
        apiKey: process.env.SR_ITSROSE_API_KEY || '',
        baseUrl: process.env.SR_ITSROSE_API_URL || 'https://api.itsrose.net',
};
