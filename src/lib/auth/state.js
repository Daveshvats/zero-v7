import { MYSQL_CONFIG } from "#config/index";
import { useMongoDbAuthState } from "#lib/auth/mongodb";
import { usePostgresAuthState } from "#lib/auth/postgres";
import logger from "#lib/logger";
import { useMultiFileAuthState } from "baileys";
import useMySQLAuthState from "mysql-baileys";
import { readdir, unlink } from "node:fs/promises";
import { join } from "node:path";

const AUTH_BACKENDS = {
        POSTGRES: "postgres",
        MONGODB: "mongodb",
        MYSQL: "mysql",
        LOCAL: "local",
};

/**
 * Handles authentication state for different backends.
 * Priority: PostgreSQL (if DATABASE_URL) > MongoDB (if USE_MONGO_AUTH) > MySQL > Local
 *
 * @param {string} sessionName - Unique name for the session.
 * @returns {Promise<{state: any, saveCreds: Function, removeCreds: Function}>}
 */
export default async function getAuthState(sessionName) {
        const authStore = process.env.AUTH_STORE?.toLowerCase();
        const useMongo = process.env.USE_MONGO_AUTH === "true";
        const usePostgres = process.env.DATABASE_URL && authStore !== AUTH_BACKENDS.MONGODB && authStore !== AUTH_BACKENDS.MYSQL && authStore !== AUTH_BACKENDS.LOCAL;

        let backend;
        if (authStore === AUTH_BACKENDS.POSTGRES || usePostgres) {
                backend = AUTH_BACKENDS.POSTGRES;
        } else if (useMongo || authStore === AUTH_BACKENDS.MONGODB) {
                backend = AUTH_BACKENDS.MONGODB;
        } else if (authStore === AUTH_BACKENDS.MYSQL) {
                backend = AUTH_BACKENDS.MYSQL;
        } else {
                backend = AUTH_BACKENDS.LOCAL;
        }

        logger.info(`Initializing auth backend: ${backend}`);

        switch (backend) {
                case AUTH_BACKENDS.POSTGRES: {
                        if (!process.env.DATABASE_URL) {
                                throw new Error("DATABASE_URL is required for PostgreSQL auth.");
                        }
                        const { state, saveCreds, removeCreds } = await usePostgresAuthState(
                                sessionName
                        );
                        return { state, saveCreds, removeCreds };
                }

                case AUTH_BACKENDS.MONGODB: {
                        const mongoUrl = process.env.MONGO_URI;
                        if (!mongoUrl) {
                                throw new Error("MONGO_URI is required when using MongoDB auth.");
                        }
                        // FIX: Pass sessionName as string, not { session: sessionName }
                        // The function signature expects (mongoUri, identifier) where identifier is a string.
                        // Passing an object caused all sessions to be stored under "[object Object]".
                        const { state, saveCreds, removeCreds } = await useMongoDbAuthState(
                                mongoUrl,
                                sessionName
                        );
                        return { state, saveCreds, removeCreds };
                }

                case AUTH_BACKENDS.MYSQL: {
                        const { state, saveCreds, removeCreds } = await useMySQLAuthState({
                                ...MYSQL_CONFIG,
                                session: sessionName,
                        });
                        return { state, saveCreds, removeCreds };
                }

                case AUTH_BACKENDS.LOCAL:
                default: {
                        const authPath = process.env.LOCAL_AUTH_PATH || "auth_info_baileys";
                        const { state, saveCreds } = await useMultiFileAuthState(authPath);

                        const removeCreds = async () => {
                                try {
                                        const files = await readdir(authPath);
                                        await Promise.all(
                                                files.map((file) => unlink(join(authPath, file)))
                                        );
                                        logger.info(`All auth files removed from: ${authPath}`);
                                } catch (error) {
                                        if (error.code !== "ENOENT") {
                                                logger.error("Failed to remove local auth files:", error);
                                        }
                                }
                        };

                        return { state, saveCreds, removeCreds };
                }
        }
}
