import { Redis } from "@upstash/redis";
import print from "#lib/print";

let redis = null;
let useMemoryFallback = false;
const memoryCache = new Map();
const memoryTTL = new Map();

export async function initRedis() {
	if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
		try {
			redis = new Redis({
				url: process.env.UPSTASH_REDIS_REST_URL,
				token: process.env.UPSTASH_REDIS_REST_TOKEN,
			});
			
			await redis.ping();
			print.info("Redis (Upstash) connected successfully");
			return redis;
		} catch (error) {
			print.warn("Redis connection failed, using memory fallback:", error.message);
			useMemoryFallback = true;
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

	async set(key, value, ttlSeconds = null) {
		if (redis) {
			if (ttlSeconds) {
				return redis.setex(key, ttlSeconds, value);
			}
			return redis.set(key, value);
		}
		memoryCache.set(key, value);
		if (ttlSeconds) {
			memoryTTL.set(key, Date.now() + ttlSeconds * 1000);
		}
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
			return redis.keys(pattern);
		}
		const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
		return Array.from(memoryCache.keys()).filter((k) => regex.test(k));
	},

	async hget(key, field) {
		if (redis) {
			return redis.hget(key, field);
		}
		const hash = memoryCache.get(key);
		return hash?.[field] || null;
	},

	async hset(key, field, value) {
		if (redis) {
			return redis.hset(key, { [field]: value });
		}
		const hash = memoryCache.get(key) || {};
		hash[field] = value;
		memoryCache.set(key, hash);
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
		const window = Math.floor(Date.now() / (windowSeconds * 1000));
		const key = this.getKey(userId, window);
		
		const count = await cache.incr(key);
		
		if (count === 1) {
			await cache.set(key, count, windowSeconds);
		}
		
		return {
			allowed: count <= maxRequests,
			remaining: Math.max(0, maxRequests - count),
			resetIn: windowSeconds,
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

	async setSession(sessionName, data, ttlSeconds = 3600) {
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

	async addJob(jobType, jobId, data) {
		const key = `${this.getKey(jobType)}:${jobId}`;
		await cache.set(key, JSON.stringify({ ...data, status: "pending", createdAt: Date.now() }));
		return jobId;
	},

	async getJob(jobType, jobId) {
		const key = `${this.getKey(jobType)}:${jobId}`;
		const data = await cache.get(key);
		return data ? (typeof data === "string" ? JSON.parse(data) : data) : null;
	},

	async updateJob(jobType, jobId, updates) {
		const key = `${this.getKey(jobType)}:${jobId}`;
		const current = await this.getJob(jobType, jobId);
		if (current) {
			await cache.set(key, JSON.stringify({ ...current, ...updates, updatedAt: Date.now() }));
		}
	},

	async completeJob(jobType, jobId, result = null) {
		await this.updateJob(jobType, jobId, { status: "completed", result, completedAt: Date.now() });
	},

	async failJob(jobType, jobId, error) {
		await this.updateJob(jobType, jobId, { status: "failed", error, failedAt: Date.now() });
	},
};

export function isRedisConnected() {
	return redis !== null && !useMemoryFallback;
}

export default {
	cache,
	cooldownService,
	rateLimitService,
	sessionCache,
	jobQueue,
	initRedis,
	isRedisConnected,
};
