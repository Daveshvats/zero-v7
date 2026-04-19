import { Redis } from "@upstash/redis";
import print from "#lib/print";

let redis = null;
let useMemoryFallback = false;
const memoryCache = new Map();
const memoryTTL = new Map();

const DEFAULT_TTL = {
        JOB: 3600,
        SESSION: 3600,
        COOLDOWN: 3600,
        RATE_LIMIT: 60,
        DEAD_LETTER: 86400 * 7,
};

export async function initRedis() {
        const url = process.env.UPSTASH_REDIS_REST_URL;
        const token = process.env.UPSTASH_REDIS_REST_TOKEN;
        
        if (url && token) {
                try {
                        redis = new Redis({ url, token });
                        
                        const pong = await redis.ping();
                        print.info(`Redis (Upstash) connected successfully: ${pong}`);
                        return redis;
                } catch (error) {
                        print.warn(`Redis connection failed: ${error.message || error}`);
                        print.debug(`Redis URL: ${url ? url.substring(0, 30) + "..." : "not set"}`);
                        useMemoryFallback = true;
                        redis = null;
                }
        } else {
                print.warn("Redis not configured, using memory fallback");
                useMemoryFallback = true;
        }
        
        return null;
}

function cleanExpired(key) {
        const expiry = memoryTTL.get(key);
        if (expiry && Date.now() > expiry) {
                memoryCache.delete(key);
                memoryTTL.delete(key);
                return true;
        }
        return false;
}

export const cache = {
        async get(key) {
                if (redis) {
                        return redis.get(key);
                }
                cleanExpired(key);
                return memoryCache.get(key) || null;
        },

        async set(key, value, ttlSeconds = DEFAULT_TTL.JOB) {
                if (redis) {
                        return redis.setex(key, ttlSeconds, value);
                }
                memoryCache.set(key, value);
                memoryTTL.set(key, Date.now() + ttlSeconds * 1000);
                return "OK";
        },

        async del(key) {
                if (redis) {
                        return redis.del(key);
                }
                memoryCache.delete(key);
                memoryTTL.delete(key);
                return 1;
        },

        async exists(key) {
                if (redis) {
                        return redis.exists(key);
                }
                cleanExpired(key);
                return memoryCache.has(key) ? 1 : 0;
        },

        async incr(key) {
                if (redis) {
                        return redis.incr(key);
                }
                const current = parseInt(memoryCache.get(key) || "0", 10);
                memoryCache.set(key, current + 1);
                return current + 1;
        },

        async ttl(key) {
                if (redis) {
                        return redis.ttl(key);
                }
                const expiry = memoryTTL.get(key);
                if (!expiry) {
                        return -1;
                }
                const remaining = Math.ceil((expiry - Date.now()) / 1000);
                return remaining > 0 ? remaining : -2;
        },

        async keys(pattern) {
                if (redis) {
                        // Use SCAN instead of KEYS — KEYS is O(N) and blocks the server.
                        // SCAN is non-blocking and returns results incrementally.
                        const allKeys = [];
                        let cursor = 0;
                        do {
                                const [nextCursor, matchedKeys] = await redis.scan(cursor, { match: pattern, count: 100 });
                                cursor = nextCursor;
                                allKeys.push(...matchedKeys);
                        } while (cursor !== 0);
                        return allKeys;
                }
                const regex = new RegExp("^" + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, ".*") + "$");
                return Array.from(memoryCache.keys()).filter((k) => regex.test(k));
        },

        async hget(key, field) {
                if (redis) {
                        return redis.hget(key, field);
                }
                const hash = memoryCache.get(key);
                return hash?.[field] || null;
        },

        async hset(key, field, value, ttlSeconds = DEFAULT_TTL.JOB) {
                if (redis) {
                        await redis.hset(key, { [field]: value });
                        await redis.expire(key, ttlSeconds);
                        return 1;
                }
                const hash = memoryCache.get(key) || {};
                hash[field] = value;
                memoryCache.set(key, hash);
                memoryTTL.set(key, Date.now() + ttlSeconds * 1000);
                return 1;
        },

        async hgetall(key) {
                if (redis) {
                        return redis.hgetall(key);
                }
                return memoryCache.get(key) || {};
        },

        async hdel(key, field) {
                if (redis) {
                        return redis.hdel(key, field);
                }
                const hash = memoryCache.get(key);
                if (hash) {
                        delete hash[field];
                }
                return 1;
        },
};

export const cooldownService = {
        getKey(userId, command) {
                return `cooldown:${userId}:${command}`;
        },

        async isOnCooldown(userId, command) {
                const key = this.getKey(userId, command);
                const exists = await cache.exists(key);
                return exists === 1;
        },

        async setCooldown(userId, command, seconds) {
                const key = this.getKey(userId, command);
                await cache.set(key, Date.now(), seconds);
        },

        async getRemainingTime(userId, command) {
                const key = this.getKey(userId, command);
                const ttl = await cache.ttl(key);
                return ttl > 0 ? ttl : 0;
        },

        async clearCooldown(userId, command) {
                const key = this.getKey(userId, command);
                await cache.del(key);
        },
};

export const rateLimitService = {
        getKey(userId, window) {
                return `ratelimit:${userId}:${window}`;
        },

        async checkLimit(userId, maxRequests, windowSeconds) {
                if (redis) {
                        // Use incr + expire instead of incr + set to avoid race condition:
                        // Old pattern: incr → set (could overwrite a concurrent incr's value).
                        // New pattern: incr → expire (only sets TTL, never touches the value).
                        const key = `ratelimit:${userId}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
                        const count = await redis.incr(key);
                        if (count === 1) {
                                await redis.expire(key, windowSeconds);
                        }
                        return { allowed: count <= maxRequests, remaining: Math.max(0, maxRequests - count), resetTime: windowSeconds };
                }
                // Memory fallback — cache.incr/set handle TTL correctly for in-memory Map
                const window = Math.floor(Date.now() / (windowSeconds * 1000));
                const key = this.getKey(userId, window);
                const count = await cache.incr(key);
                if (count === 1) {
                        await cache.set(key, count, windowSeconds);
                }
                return {
                        allowed: count <= maxRequests,
                        remaining: Math.max(0, maxRequests - count),
                        resetTime: windowSeconds,
                };
        },
};

export const sessionCache = {
        getKey(sessionName) {
                return `session:${sessionName}`;
        },

        async getSession(sessionName) {
                const key = this.getKey(sessionName);
                const data = await cache.get(key);
                return data ? (typeof data === "string" ? JSON.parse(data) : data) : null;
        },

        async setSession(sessionName, data, ttlSeconds = DEFAULT_TTL.SESSION) {
                const key = this.getKey(sessionName);
                await cache.set(key, JSON.stringify(data), ttlSeconds);
        },

        async deleteSession(sessionName) {
                const key = this.getKey(sessionName);
                await cache.del(key);
        },
};

export const jobQueue = {
        getKey(jobType) {
                return `job:${jobType}`;
        },

        async addJob(jobType, jobId, data, ttlSeconds = DEFAULT_TTL.JOB) {
                const key = `${this.getKey(jobType)}:${jobId}`;
                await cache.set(key, JSON.stringify({ ...data, status: "pending", createdAt: Date.now() }), ttlSeconds);
                return jobId;
        },

        async getJob(jobType, jobId) {
                const key = `${this.getKey(jobType)}:${jobId}`;
                const data = await cache.get(key);
                return data ? (typeof data === "string" ? JSON.parse(data) : data) : null;
        },

        async updateJob(jobType, jobId, updates, ttlSeconds = DEFAULT_TTL.JOB) {
                const key = `${this.getKey(jobType)}:${jobId}`;
                const current = await this.getJob(jobType, jobId);
                if (current) {
                        await cache.set(key, JSON.stringify({ ...current, ...updates, updatedAt: Date.now() }), ttlSeconds);
                }
        },

        async completeJob(jobType, jobId, result = null) {
                await this.updateJob(jobType, jobId, { status: "completed", result, completedAt: Date.now() }, DEFAULT_TTL.JOB);
        },

        async failJob(jobType, jobId, error) {
                await this.updateJob(jobType, jobId, { status: "failed", error, failedAt: Date.now() }, DEFAULT_TTL.JOB);
        },
};

export const deadLetterQueue = {
        getKey() {
                return "dlq:failed_commands";
        },

        async addFailedCommand(data) {
                const key = `${this.getKey()}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
                await cache.set(key, JSON.stringify({
                        ...data,
                        failedAt: Date.now(),
                }), DEFAULT_TTL.DEAD_LETTER);
                return key;
        },

        async getFailedCommands(limit = 50) {
                const keys = await cache.keys("dlq:failed_commands:*");
                const commands = [];
                for (const key of keys.slice(0, limit)) {
                        const data = await cache.get(key);
                        if (data) {
                                commands.push(typeof data === "string" ? JSON.parse(data) : data);
                        }
                }
                return commands.sort((a, b) => b.failedAt - a.failedAt);
        },

        async clearOldEntries() {
                const keys = await cache.keys("dlq:failed_commands:*");
                let cleared = 0;
                for (const key of keys) {
                        const ttl = await cache.ttl(key);
                        if (ttl === -2) {
                                await cache.del(key);
                                cleared++;
                        }
                }
                return cleared;
        },
};

export function isRedisConnected() {
        return redis !== null && !useMemoryFallback;
}

export { DEFAULT_TTL };

export default {
        cache,
        cooldownService,
        rateLimitService,
        sessionCache,
        jobQueue,
        deadLetterQueue,
        initRedis,
        isRedisConnected,
        DEFAULT_TTL,
};
