import { existsSync } from "fs";
import { appendFile, mkdir } from "node:fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Colors, colorize } from "#lib/colors";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOG_LEVELS = {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3,
        FATAL: 4,
};

const LOG_COLORS = {
        DEBUG: Colors.FgGray,
        INFO: Colors.Bright,
        WARN: Colors.FgYellow,
        ERROR: Colors.FgRed,
        FATAL: Colors.BgRed,
};

class StructuredLogger {
        constructor(options = {}) {
                this.minLevel = LOG_LEVELS[options.level?.toUpperCase()] || LOG_LEVELS.DEBUG;
                this.logToFile = options.logToFile ?? false;
                this.logDir = options.logDir || join(__dirname, "../../logs");
                this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // NOTE: Reserved for future log rotation implementation
                this.context = options.context || "BOT";

                if (this.logToFile) {
                        this.ensureLogDirectory();
                }
        }

        ensureLogDirectory() {
                if (!existsSync(this.logDir)) {
                        mkdir(this.logDir, { recursive: true }).catch(() => {});
                }
        }

        formatTimestamp() {
                return new Date().toISOString();
        }

        formatMessage(level, message, meta = {}) {
                const timestamp = this.formatTimestamp();
                const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
                return {
                        formatted: `[${timestamp}] [${this.context}] [${level}] ${message}${metaStr}`,
                        json: {
                                timestamp,
                                level,
                                context: this.context,
                                message,
                                ...meta,
                        },
                };
        }

        shouldLog(level) {
                return LOG_LEVELS[level] >= this.minLevel;
        }

        log(level, message, meta = {}) {
                if (!this.shouldLog(level)) {
                        return;
                }

                const { formatted, json } = this.formatMessage(level, message, meta);

                const color = LOG_COLORS[level] || Colors.Reset;
                console.log(colorize(color, formatted));

                if (this.logToFile) {
                        this.writeToFile(json).catch(() => {});
                }
        }

        async writeToFile(logEntry) {
                if (!this.logToFile) return;
                try {
                        const date = new Date().toISOString().split("T")[0];
                        const logFile = join(this.logDir, `bot-${date}.log`);
                        await mkdir(dirname(logFile), { recursive: true });
                        await appendFile(logFile, JSON.stringify(logEntry) + "\n");
                } catch (error) {
                        console.error("Failed to write to log file:", error.message);
                }
        }

        debug(message, meta = {}) {
                this.log("DEBUG", message, meta);
        }

        info(message, meta = {}) {
                this.log("INFO", message, meta);
        }

        warn(message, meta = {}) {
                this.log("WARN", message, meta);
        }

        error(message, error = null, meta = {}) {
                const errorMeta = { ...meta };
                if (error instanceof Error) {
                        errorMeta.error = error.message;
                        errorMeta.stack = error.stack;
                } else if (error) {
                        errorMeta.error = error;
                }
                this.log("ERROR", message, errorMeta);
        }

        fatal(message, error = null, meta = {}) {
                const errorMeta = { ...meta };
                if (error instanceof Error) {
                        errorMeta.error = error.message;
                        errorMeta.stack = error.stack;
                } else if (error) {
                        errorMeta.error = error;
                }
                this.log("FATAL", message, errorMeta);
        }

        child(context) {
                return new StructuredLogger({
                        level: Object.keys(LOG_LEVELS).find((k) => LOG_LEVELS[k] === this.minLevel),
                        logToFile: this.logToFile,
                        logDir: this.logDir,
                        context: `${this.context}:${context}`,
                });
        }
}

const structuredLogger = new StructuredLogger({
        level: process.env.LOG_LEVEL || "DEBUG",
        logToFile: process.env.LOG_TO_FILE === "true",
});

export { StructuredLogger, LOG_LEVELS };
export default structuredLogger;
