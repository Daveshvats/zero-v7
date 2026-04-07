import { GroupSchema, SettingsSchema, UserSchema } from "#lib/schema/index";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

class Helper {
        constructor(name, data, schema) {
                this.name = name;
                this._data = data ?? {};
                this.schema = schema;
        }

        get(key) {
                return this._data[key] ?? null;
        }

        set(key, value) {
                if (!this._data[key]) {
                        this._data[key] = {};
                        for (const k in this.schema) {
                                this._data[key][k] =
                                        typeof this.schema[k] === "function"
                                                ? this.schema[k]()
                                                : this.schema[k];
                        }
                }
                if (value && typeof value === "object") {
                        Object.assign(this._data[key], value);
                }
                return this._data[key];
        }

        delete(key) {
                delete this._data[key];
        }

        all() {
                return { ...this._data };
        }
}

class LocalDB {
        #initialized = false;
        #path = process.env.DATABASE_LOCAL_PATH ?? "./sessions/database.json";
        #data = {
                users: {},
                groups: {},
                settings: {},
                sessions: {},
        };
        #dirty = false; // Track if data changed since last save
        #saveTimer = null;
        #saveInterval = null;

        constructor() {
                this.users = new Helper("users", this.#data.users, UserSchema);
                this.groups = new Helper("groups", this.#data.groups, GroupSchema);
                this.settings = new Helper(
                        "settings",
                        this.#data.settings,
                        SettingsSchema
                );
        }

        async initialize() {
                if (this.#initialized) {
                        return;
                }
                if (!existsSync(this.#path)) {
                        writeFileSync(this.#path, JSON.stringify(this.#data, null, 2));
                }
                try {
                        const content = readFileSync(this.#path, "utf-8");
                        this.#data = JSON.parse(content);
                } catch {
                        this.#data = {
                                users: {},
                                groups: {},
                                settings: {},
                                sessions: {},
                        };
                }
                this.users = new Helper("users", this.#data.users, UserSchema);
                this.groups = new Helper("groups", this.#data.groups, GroupSchema);
                this.settings = new Helper(
                        "settings",
                        this.#data.settings,
                        SettingsSchema
                );
                this.#initialized = true;
        }

        save() {
                if (!this.#dirty) return; // Skip save if nothing changed
                writeFileSync(this.#path, JSON.stringify(this.#data, null, 2));
                this.#dirty = false;
        }

        /**
         * Mark data as dirty. The next periodic save will write to disk.
         * This avoids writing the same file hundreds of times per second.
         */
        markDirty() {
                this.#dirty = true;
        }

        savePeriodically(interval = 10_000) {
                // Clear any existing interval
                if (this.#saveInterval) clearInterval(this.#saveInterval);
                this.#saveInterval = setInterval(() => this.save(), interval);
                if (this.#saveInterval.unref) this.#saveInterval.unref();
        }

        stopPeriodicSave() {
                if (this.#saveInterval) {
                        clearInterval(this.#saveInterval);
                        this.#saveInterval = null;
                }
                // Final save on shutdown
                this.save();
        }
}

const local = new LocalDB();
export default local;
