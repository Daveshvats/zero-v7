import print from "#lib/print";

const usePostgres = process.env.USE_POSTGRES === "true" || process.env.DATABASE_URL;
const useMongo = process.env.USE_MONGO === "true";
const useLocal = !usePostgres && !useMongo;

let SettingsModel, UserModel, GroupModel, SessionModel, CommandModel, AITaskModel, DeadLetterModel, PermissionModel, MigrationModel;
let dbType = "local";

async function initDatabase() {
        if (usePostgres) {
                try {
                        const postgres = await import("#lib/database/postgres");
                        await postgres.initPostgres();
                        
                        SettingsModel = postgres.SettingsModel;
                        UserModel = postgres.UserModel;
                        GroupModel = postgres.GroupModel;
                        SessionModel = postgres.SessionModel;
                        CommandModel = postgres.CommandModel;
                        AITaskModel = postgres.AITaskModel;
                        DeadLetterModel = postgres.DeadLetterModel;
                        PermissionModel = postgres.PermissionModel;
                        MigrationModel = postgres.MigrationModel;
                        dbType = "postgresql";
                        
                        print.info("Database: PostgreSQL initialized");
                        return;
                } catch (error) {
                        print.warn("PostgreSQL initialization failed, falling back:", error.message);
                }
        }

        if (useMongo) {
                try {
                        SettingsModel = (await import("#lib/database/models/settings")).default;
                        UserModel = (await import("#lib/database/models/user")).default;
                        GroupModel = (await import("#lib/database/models/group")).default;
                        SessionModel = (await import("#lib/database/models/session")).default;
                        dbType = "mongodb";
                        
                        print.info("Database: MongoDB initialized");
                        return;
                } catch (error) {
                        print.warn("MongoDB initialization failed, falling back:", error.message);
                }
        }

        const localDB = (await import("#lib/database/local")).default;

        SettingsModel = {
                async getSettings() {
                        await localDB.initialize();
                        return localDB.settings.get("bot") || {};
                },
                async setSettings(data) {
                        await localDB.initialize();
                        localDB.settings.set("bot", data);
                        localDB.save();
                },
                async updateSettings(update) {
                        await localDB.initialize();
                        const current = localDB.settings.get("bot") || {};
                        localDB.settings.set("bot", { ...current, ...update });
                        localDB.save();
                },
        };

        UserModel = {
                async getAllUsers() {
                        await localDB.initialize();
                        if (typeof localDB.users.values === "function") {
                                return Array.from(localDB.users.values());
                        }
                        return Object.values(localDB.users);
                },
                async getUser(id) {
                        await localDB.initialize();
                        return localDB.users.get(id) || {};
                },
                async setUser(id, data) {
                        await localDB.initialize();
                        const existing = localDB.users.get(id) || {};
                        localDB.users.set(id, { ...existing, ...data });
                        localDB.save();
                },
                async setName(id, name) {
                        await this.setUser(id, { name });
                },
                async setBanned(id, banned = false) {
                        await this.setUser(id, { banned });
                },
                async setPremium(id, premium = false, expired = 0) {
                        await this.setUser(id, { premium, premium_expired: expired });
                },
                async setLimit(id, limit = 0) {
                        await this.setUser(id, { limit });
                },
        };

        GroupModel = {
                async getGroup(id) {
                        await localDB.initialize();
                        return localDB.groups.get(id) || {};
                },
                async getAllGroups() {
                        await localDB.initialize();
                        if (typeof localDB.groups.values === "function") {
                                return Array.from(localDB.groups.values());
                        }
                        return Object.values(localDB.groups);
                },
                async setGroup(id, data) {
                        await localDB.initialize();
                        const existing = localDB.groups.get(id) || {};
                        localDB.groups.set(id, { ...existing, ...data });
                        localDB.save();
                },
                async setName(id, name) {
                        await this.setGroup(id, { name });
                },
                async setBanned(id, banned = true) {
                        await this.setGroup(id, { banned });
                },
        };

        CommandModel = {
                async logCommand() {
                        return null;
                },
                async getCommandStats() {
                        return [];
                },
                async getUserCommands() {
                        return [];
                },
        };

        AITaskModel = {
                async createTask() {
                        return null;
                },
                async updateTask() {
                        return null;
                },
                async completeTask() {
                        return null;
                },
                async failTask() {
                        return null;
                },
                async getUserTasks() {
                        return [];
                },
        };

        DeadLetterModel = {
                async addFailed() { return null; },
                async getRecent() { return []; },
                async resolve() { return null; },
                async getByUser() { return []; },
                async getStats() { return null; },
        };

        PermissionModel = {
                async getPermission() { return null; },
                async getUserPermissions() { return []; },
                async hasPermission() { return false; },
                async grantPermission() { return null; },
                async revokePermission() {},
                async isUserBlocked() { return false; },
                async isGroupDisabled() { return false; },
                async isPremium() { return false; },
                async getCommandDisabledGroups() { return []; },
        };

        MigrationModel = {
                async getApplied() { return []; },
                async isApplied() { return false; },
                async markApplied() { return null; },
                async getCurrentVersion() { return null; },
        };

        dbType = "local";
        print.info("Database: Local JSON initialized");
}

export function getDatabaseType() {
        return dbType;
}

export { initDatabase, SettingsModel, UserModel, GroupModel, SessionModel, CommandModel, AITaskModel, DeadLetterModel, PermissionModel, MigrationModel };
