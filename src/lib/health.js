import print from "#lib/print";
import { EventEmitter } from "events";

const HEALTH_STATUS = {
        HEALTHY: "healthy",
        DEGRADED: "degraded",
        UNHEALTHY: "unhealthy",
};

class HealthMonitor extends EventEmitter {
        constructor() {
                super();
                this.components = new Map();
                this.checkInterval = null;
                this.lastCheck = null;
                this.lastOverallStatus = null;
        }

        registerComponent(name, healthCheck) {
                this.components.set(name, {
                        name,
                        healthCheck,
                        status: HEALTH_STATUS.HEALTHY,
                        lastCheck: null,
                        lastError: null,
                        consecutiveFailures: 0,
                });
                print.debug(`Health component registered: ${name}`);
        }

        unregisterComponent(name) {
                this.components.delete(name);
                print.debug(`Health component unregistered: ${name}`);
        }

        async checkComponent(name) {
                const component = this.components.get(name);
                if (!component) {
                        return null;
                }

                try {
                        const startTime = Date.now();
                        const result = await Promise.race([
                                component.healthCheck(),
                                new Promise((_, reject) =>
                                        setTimeout(() => reject(new Error("Health check timeout")), 5000)
                                ),
                        ]);

                        const duration = Date.now() - startTime;

                        component.status = result.healthy
                                ? HEALTH_STATUS.HEALTHY
                                : HEALTH_STATUS.DEGRADED;
                        component.lastCheck = new Date().toISOString();
                        component.lastError = null;
                        component.consecutiveFailures = 0;
                        component.responseTime = duration;
                        component.details = result.details || {};

                        return component;
                } catch (error) {
                        component.status = HEALTH_STATUS.UNHEALTHY;
                        component.lastCheck = new Date().toISOString();
                        component.lastError = error.message;
                        component.consecutiveFailures++;

                        if (component.consecutiveFailures >= 3) {
                                this.emit("critical", {
                                        component: name,
                                        error: error.message,
                                        failures: component.consecutiveFailures,
                                });
                        }

                        return component;
                }
        }

        async checkAll() {
                const entries = Array.from(this.components.entries());
                const results = await Promise.all(
                        entries.map(async ([name]) => {
                                const result = await this.checkComponent(name);
                                return [name, result];
                        })
                );

                this.lastCheck = new Date().toISOString();
                return Object.fromEntries(results);
        }

        getOverallStatus() {
                let overall = HEALTH_STATUS.HEALTHY;

                for (const [, component] of this.components) {
                        if (component.status === HEALTH_STATUS.UNHEALTHY) {
                                return HEALTH_STATUS.UNHEALTHY;
                        }
                        if (component.status === HEALTH_STATUS.DEGRADED) {
                                overall = HEALTH_STATUS.DEGRADED;
                        }
                }

                return overall;
        }

        getHealthReport() {
                const components = {};

                for (const [name, component] of this.components) {
                        components[name] = {
                                status: component.status,
                                lastCheck: component.lastCheck,
                                lastError: component.lastError,
                                consecutiveFailures: component.consecutiveFailures,
                                responseTime: component.responseTime,
                                details: component.details,
                        };
                }

                return {
                        status: this.getOverallStatus(),
                        timestamp: new Date().toISOString(),
                        uptime: process.uptime(),
                        memory: process.memoryUsage(),
                        components,
                };
        }

        startPeriodicChecks(intervalMs = 60000) {
                if (this.checkInterval) {
                        clearInterval(this.checkInterval);
                }

                this.checkInterval = setInterval(async () => {
                        await this.checkAll();
                        const overall = this.getOverallStatus();

                        if (overall !== this.lastOverallStatus) {
                                if (overall === HEALTH_STATUS.HEALTHY) {
                                        print.info("Health check: recovered to healthy");
                                } else {
                                        const unhealthyComponents = [];
                                        for (const [name, comp] of this.components) {
                                                if (comp.status !== HEALTH_STATUS.HEALTHY) {
                                                        unhealthyComponents.push(`${name}: ${comp.lastError || "degraded"}`);
                                                }
                                        }
                                        print.warn(`Health check: ${overall} [${unhealthyComponents.join(", ")}]`);
                                }
                                this.lastOverallStatus = overall;
                        }
                }, intervalMs);

                if (this.checkInterval.unref) {
                        this.checkInterval.unref();
                }

                print.info(`Health monitoring started (interval: ${intervalMs}ms)`);
        }

        stopPeriodicChecks() {
                if (this.checkInterval) {
                        clearInterval(this.checkInterval);
                        this.checkInterval = null;
                        print.info("Health monitoring stopped");
                }
        }
}

const healthMonitor = new HealthMonitor();

healthMonitor.registerComponent("memory", async () => {
        const usage = process.memoryUsage();
        const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
        const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
        const rssMB = Math.round(usage.rss / 1024 / 1024);
        const arrayBuffersMB = Math.round((usage.arrayBuffers || 0) / 1024 / 1024);

        // Aggressive memory cleanup at high heap usage
        if (global.gc) {
                const heapPercent = (usage.heapUsed / usage.heapTotal) * 100;
                if (heapPercent > 80) {
                        try {
                                global.gc();
                        } catch (e) {
                                // gc flag may not be enabled
                        }
                }
        }

        // Node.js auto-grows heapTotal to match heapUsed, so heapUsed/heapTotal
        // is always high (~90%) and useless as a health metric.
        // Use RSS threshold instead: degraded above 256MB, unhealthy above 512MB.
        const MEMORY_DEGRADED_MB = 256;
        const MEMORY_UNHEALTHY_MB = 512;
        const healthy = rssMB < MEMORY_DEGRADED_MB;

        return {
                healthy,
                ...(rssMB >= MEMORY_DEGRADED_MB && { degraded: true }),
                ...(rssMB >= MEMORY_UNHEALTHY_MB && { unhealthy: true }),
                details: {
                        heapUsedMB,
                        heapTotalMB,
                        rssMB,
                        arrayBuffersMB,
                },
        };
});

healthMonitor.registerComponent("eventLoop", async () => {
        const start = Date.now();
        await new Promise((resolve) => setImmediate(resolve));
        const lag = Date.now() - start;

        return {
                healthy: lag < 500,
                details: {
                        lagMs: lag,
                },
        };
});

export { HealthMonitor, HEALTH_STATUS };
export default healthMonitor;
