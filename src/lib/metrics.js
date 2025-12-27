import print from "#lib/print";

class MetricsCollector {
	constructor() {
		this.metrics = {
			messages: {
				received: 0,
				processed: 0,
				commands: 0,
				errors: 0,
			},
			commands: {},
			performance: {
				avgResponseTime: 0,
				totalResponseTime: 0,
				responseCount: 0,
			},
			sessions: {
				main: 1,
				clones: 0,
			},
			errors: [],
			startTime: Date.now(),
		};

		this.maxErrorHistory = 100;
	}

	incrementMessageReceived() {
		this.metrics.messages.received++;
	}

	incrementMessageProcessed() {
		this.metrics.messages.processed++;
	}

	incrementCommand(commandName) {
		this.metrics.messages.commands++;
		if (!this.metrics.commands[commandName]) {
			this.metrics.commands[commandName] = { count: 0, errors: 0, totalTime: 0 };
		}
		this.metrics.commands[commandName].count++;
	}

	recordCommandDuration(commandName, durationMs) {
		if (this.metrics.commands[commandName]) {
			this.metrics.commands[commandName].totalTime += durationMs;
		}

		this.metrics.performance.totalResponseTime += durationMs;
		this.metrics.performance.responseCount++;
		this.metrics.performance.avgResponseTime =
			this.metrics.performance.totalResponseTime /
			this.metrics.performance.responseCount;
	}

	recordCommandError(commandName, error) {
		this.metrics.messages.errors++;
		if (this.metrics.commands[commandName]) {
			this.metrics.commands[commandName].errors++;
		}

		this.recordError(commandName, error);
	}

	recordError(context, error) {
		const errorEntry = {
			timestamp: new Date().toISOString(),
			context,
			message: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : null,
		};

		this.metrics.errors.unshift(errorEntry);

		if (this.metrics.errors.length > this.maxErrorHistory) {
			this.metrics.errors.pop();
		}
	}

	setCloneSessions(count) {
		this.metrics.sessions.clones = count;
	}

	getUptime() {
		return Date.now() - this.metrics.startTime;
	}

	getUptimeFormatted() {
		const uptime = this.getUptime();
		const seconds = Math.floor(uptime / 1000) % 60;
		const minutes = Math.floor(uptime / 60000) % 60;
		const hours = Math.floor(uptime / 3600000) % 24;
		const days = Math.floor(uptime / 86400000);

		const parts = [];
		if (days > 0) {
			parts.push(`${days}d`);
		}
		if (hours > 0) {
			parts.push(`${hours}h`);
		}
		if (minutes > 0) {
			parts.push(`${minutes}m`);
		}
		parts.push(`${seconds}s`);

		return parts.join(" ");
	}

	getTopCommands(limit = 10) {
		return Object.entries(this.metrics.commands)
			.sort((a, b) => b[1].count - a[1].count)
			.slice(0, limit)
			.map(([name, data]) => ({
				name,
				count: data.count,
				errors: data.errors,
				avgTime: data.count > 0 ? Math.round(data.totalTime / data.count) : 0,
			}));
	}

	getReport() {
		const memoryUsage = process.memoryUsage();

		return {
			uptime: this.getUptimeFormatted(),
			uptimeMs: this.getUptime(),
			messages: { ...this.metrics.messages },
			performance: {
				avgResponseTimeMs: Math.round(this.metrics.performance.avgResponseTime),
				totalCommands: this.metrics.performance.responseCount,
			},
			sessions: { ...this.metrics.sessions },
			topCommands: this.getTopCommands(5),
			recentErrors: this.metrics.errors.slice(0, 5),
			memory: {
				heapUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
				heapTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024),
				rssMB: Math.round(memoryUsage.rss / 1024 / 1024),
			},
		};
	}

	getDetailedReport() {
		return {
			...this.getReport(),
			allCommands: this.metrics.commands,
			allErrors: this.metrics.errors,
		};
	}

	printSummary() {
		const report = this.getReport();
		print.info("=== Bot Metrics Summary ===");
		print.info(`Uptime: ${report.uptime}`);
		print.info(
			`Messages: ${report.messages.received} received, ${report.messages.commands} commands, ${report.messages.errors} errors`
		);
		print.info(`Avg Response Time: ${report.performance.avgResponseTimeMs}ms`);
		print.info(
			`Memory: ${report.memory.heapUsedMB}MB / ${report.memory.heapTotalMB}MB`
		);
		print.info("===========================");
	}

	reset() {
		this.metrics = {
			messages: {
				received: 0,
				processed: 0,
				commands: 0,
				errors: 0,
			},
			commands: {},
			performance: {
				avgResponseTime: 0,
				totalResponseTime: 0,
				responseCount: 0,
			},
			sessions: {
				main: 1,
				clones: this.metrics.sessions.clones,
			},
			errors: [],
			startTime: Date.now(),
		};
	}
}

const metricsCollector = new MetricsCollector();

export { MetricsCollector };
export default metricsCollector;
