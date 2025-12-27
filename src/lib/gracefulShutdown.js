import print from "#lib/print";
import metricsCollector from "#lib/metrics";

class GracefulShutdown {
        constructor() {
                this.handlers = [];
                this.immediateHandlers = [];
                this.isShuttingDown = false;
                this.shutdownTimeout = 30000;
                this.signals = ["SIGINT", "SIGTERM", "SIGQUIT"];
        }

        registerImmediate(handler) {
                this.immediateHandlers.push(handler);
        }

        register(name, handler, priority = 10) {
                this.handlers.push({ name, handler, priority });
                this.handlers.sort((a, b) => a.priority - b.priority);
                print.debug(`Registered shutdown handler: ${name} (priority: ${priority})`);
        }

        unregister(name) {
                this.handlers = this.handlers.filter((h) => h.name !== name);
                print.debug(`Unregistered shutdown handler: ${name}`);
        }

        async executeHandlers() {
                print.info("Executing shutdown handlers...");

                for (const { name, handler } of this.handlers) {
                        try {
                                print.debug(`Running shutdown handler: ${name}`);
                                await Promise.race([
                                        handler(),
                                        new Promise((_, reject) =>
                                                setTimeout(() => reject(new Error("Handler timeout")), 10000)
                                        ),
                                ]);
                                print.debug(`Completed shutdown handler: ${name}`);
                        } catch (error) {
                                print.error(`Shutdown handler ${name} failed:`, error);
                        }
                }
        }

        async shutdown(signal) {
                if (this.isShuttingDown) {
                        print.warn("Shutdown already in progress, please wait...");
                        return;
                }

                this.isShuttingDown = true;
                print.info(`Received ${signal}, initiating graceful shutdown...`);

                for (const immediateHandler of this.immediateHandlers) {
                        try {
                                immediateHandler();
                        } catch (e) {
                                print.debug(`Immediate handler error: ${e.message}`);
                        }
                }

                metricsCollector.printSummary();

                const forceExitTimer = setTimeout(() => {
                        print.error("Shutdown timeout exceeded, forcing exit...");
                        process.exit(1);
                }, this.shutdownTimeout);

                try {
                        await this.executeHandlers();
                        clearTimeout(forceExitTimer);
                        print.info("Graceful shutdown completed");
                        process.exit(0);
                } catch (error) {
                        clearTimeout(forceExitTimer);
                        print.error("Shutdown error:", error);
                        process.exit(1);
                }
        }

        setup() {
                for (const signal of this.signals) {
                        process.on(signal, () => this.shutdown(signal));
                }

                process.on("uncaughtException", (error) => {
                        print.error("Uncaught exception:", error);
                        metricsCollector.recordError("uncaughtException", error);
                        this.shutdown("UNCAUGHT_EXCEPTION");
                });

                process.on("unhandledRejection", (reason, promise) => {
                        print.error("Unhandled rejection:", reason);
                        metricsCollector.recordError("unhandledRejection", reason);
                });

                print.info("Graceful shutdown handlers registered");
        }

        setShutdownTimeout(ms) {
                this.shutdownTimeout = ms;
        }
}

const gracefulShutdown = new GracefulShutdown();

export { GracefulShutdown };
export default gracefulShutdown;
