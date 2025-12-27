import Connect from "#core/connect";
import { autoLoadCloneBots } from "#lib/clonebot/load";
import { Colors, colorize } from "#lib/colors";
import { validateEnvironment } from "#lib/envValidator";
import gracefulShutdown from "#lib/gracefulShutdown";
import healthMonitor from "#lib/health";
import metricsCollector from "#lib/metrics";
import print from "#lib/print";

function centerText(text, width = 55) {
        const pad = Math.max(0, Math.floor((width - text.length) / 2));
        return " ".repeat(pad) + text;
}

function art() {
        return [
                colorize(Colors.FgWhite, centerText("Katsumi by NatsumiWorld")),
                colorize(
                        Colors.FgWhite,
                        "+====================================================+"
                ),
                colorize(
                        Colors.FgWhite,
                        "|         ,-~~\\             ,-. <~)_   ,-==.     ;. .|"
                ),
                colorize(
                        Colors.FgWhite,
                        "|          (   \\            | |  ( v~\\  (  (\\   ; |  |"
                ),
                colorize(
                        Colors.FgWhite,
                        "|.-===-.,   |\\. \\   .-==-.  | '   \\_/'   |\\.\\\\  `.|  |"
                ),
                colorize(
                        Colors.FgWhite,
                        "|\\.___.'   _]_]\\ \\ /______\\ |     /\\    _]_]\\ \\   |  |"
                ),
                colorize(
                        Colors.FgWhite,
                        "+====================================================+"
                ),
        ].join("\n");
}

async function animateStartup() {
        const msg = "Starting Katsumi WhatsApp Bot";
        for (let i = 0; i < 3; i++) {
                process.stdout.write(
                        `\r${colorize(Colors.FgYellow, msg + ".".repeat(i + 1) + "   ")}`
                );
                await new Promise((res) => setTimeout(res, 400));
        }
        process.stdout.write("\r" + " ".repeat(msg.length + 3) + "\r");
}

async function main() {
        try {
                console.log(art());

                validateEnvironment();

                gracefulShutdown.setup();

                await animateStartup();

                const bot = new Connect();

                gracefulShutdown.register(
                        "pluginManager",
                        async () => {
                                print.info("Stopping periodic tasks...");
                                bot.pluginManager.stopAllPeriodicTasks();
                        },
                        1
                );

                gracefulShutdown.register(
                        "store",
                        async () => {
                                print.info("Saving store data...");
                                try {
                                        if (bot.store) {
                                                bot.store.stopSaving();
                                                if (typeof bot.store.save === "function") {
                                                        await bot.store.save();
                                                }
                                        }
                                } catch (e) {
                                        print.debug("Store save skipped: " + e.message);
                                }
                        },
                        2
                );

                gracefulShutdown.register(
                        "socket",
                        async () => {
                                print.info("Closing WhatsApp connection...");
                                try {
                                        if (bot.sock && bot.sock.ws) {
                                                bot.sock.ws.close();
                                        }
                                } catch (e) {
                                        print.debug("Socket close skipped: " + e.message);
                                }
                        },
                        3
                );

                gracefulShutdown.registerImmediate(() => {
                        healthMonitor.stopPeriodicChecks();
                });

                gracefulShutdown.register(
                        "metrics",
                        async () => {
                                print.info("Final metrics report:");
                                metricsCollector.printSummary();
                        },
                        5
                );

                healthMonitor.registerComponent("whatsapp", async () => {
                        const connected = bot.sock && bot.sock.user;
                        return {
                                healthy: !!connected,
                                details: {
                                        connected: !!connected,
                                        user: connected ? bot.sock.user.id : null,
                                },
                        };
                });

                healthMonitor.registerComponent("plugins", async () => {
                        const pluginCount = bot.pluginManager.getPlugins().length;
                        return {
                                healthy: pluginCount > 0,
                                details: {
                                        loadedPlugins: pluginCount,
                                },
                        };
                });

                healthMonitor.on("critical", (event) => {
                        print.error(
                                `Critical health issue: ${event.component} - ${event.error} (${event.failures} failures)`
                        );
                });

                print.info("Bot started & periodic task scheduled!");

                await bot.start();
                await autoLoadCloneBots();

                healthMonitor.startPeriodicChecks(60000);

                if (process.send) {
                        process.send("ready");
                }

                print.info("Bot initialization complete");

                const report = await healthMonitor.checkAll();
                print.debug(`Initial health check: ${healthMonitor.getOverallStatus()}`);

        } catch (error) {
                print.error(colorize(Colors.FgRed, "Failed to start WhatsApp Bot:"), error);
                process.exit(1);
        }
}

main();
