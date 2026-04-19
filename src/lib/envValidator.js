import print from "#lib/print";

const ENV_SCHEMA = {
        required: [], // NOTE: All env vars have defaults; required is empty by design.
        optional: [
                {
                        key: "BOT_SESSION_NAME",
                        default: "sessions",
                        description: "Bot session name",
                },
                {
                        key: "BOT_PREFIXES",
                        default: "!",
                        description: "Bot command prefixes",
                },
                {
                        key: "OWNER_JIDS",
                        default: "",
                        description: "Owner JIDs (comma-separated)",
                },
                {
                        key: "BOT_NUMBER",
                        default: "",
                        description: "Bot phone number for pairing",
                },
                {
                        key: "QR",
                        default: "false",
                        description: "Use QR code for authentication",
                },
        ],
        conditional: [
                {
                        key: "MONGO_URI",
                        requiredWhen: () => process.env.USE_MONGO === "true",
                        description: "MongoDB connection URI",
                },
                {
                        key: "MYSQL_HOST",
                        requiredWhen: () =>
                                process.env.USE_MYSQL === "true" &&
                                process.env.USE_MONGO !== "true",
                        description: "MySQL host",
                },
                {
                        key: "MYSQL_USER",
                        requiredWhen: () =>
                                process.env.USE_MYSQL === "true" &&
                                process.env.USE_MONGO !== "true",
                        description: "MySQL user",
                },
                {
                        key: "MYSQL_PASSWORD",
                        requiredWhen: () =>
                                process.env.USE_MYSQL === "true" &&
                                process.env.USE_MONGO !== "true",
                        description: "MySQL password",
                },
                {
                        key: "MYSQL_DATABASE",
                        requiredWhen: () =>
                                process.env.USE_MYSQL === "true" &&
                                process.env.USE_MONGO !== "true",
                        description: "MySQL database name",
                },
        ],
};

class EnvValidator {
        constructor() {
                this.errors = [];
                this.warnings = [];
        }

        validate() {
                this.errors = [];
                this.warnings = [];

                this.validateRequired();
                this.validateConditional();
                this.applyDefaults();

                return {
                        valid: this.errors.length === 0,
                        errors: this.errors,
                        warnings: this.warnings,
                };
        }

        validateRequired() {
                for (const envVar of ENV_SCHEMA.required) {
                        const key = typeof envVar === "string" ? envVar : envVar.key;
                        if (!process.env[key]) {
                                this.errors.push(`Missing required environment variable: ${key}`);
                        }
                }
        }

        validateConditional() {
                for (const condition of ENV_SCHEMA.conditional) {
                        if (condition.requiredWhen() && !process.env[condition.key]) {
                                this.errors.push(
                                        `Missing conditional environment variable: ${condition.key} (${condition.description})`
                                );
                        }
                }
        }

        applyDefaults() {
                for (const optional of ENV_SCHEMA.optional) {
                        if (!process.env[optional.key] && optional.default !== undefined) {
                                process.env[optional.key] = optional.default;
                                this.warnings.push(
                                        `Using default value for ${optional.key}: ${optional.default}`
                                );
                        }
                }
        }

        printReport() {
                print.info("=== Environment Validation Report ===");

                if (this.errors.length > 0) {
                        print.error("Environment validation failed:");
                        this.errors.forEach((err) => print.error(`  - ${err}`));
                }

                if (this.warnings.length > 0) {
                        this.warnings.forEach((warn) => print.warn(`  - ${warn}`));
                }

                if (this.errors.length === 0) {
                        print.info("Environment validation passed");
                }

                print.info("=====================================");
        }

        getConfig() {
                return {
                        database: {
                                useMongo: process.env.USE_MONGO === "true",
                                mongoUri: process.env.MONGO_URI,
                                useMySQL: process.env.USE_MYSQL === "true",
                        },
                        bot: {
                                sessionName: process.env.BOT_SESSION_NAME || "sessions",
                                prefixes: process.env.BOT_PREFIXES,
                                ownerJids: process.env.OWNER_JIDS,
                                botNumber: process.env.BOT_NUMBER,
                                useQR: process.env.QR === "true",
                        },
                };
        }
}

export function validateEnvironment() {
        const validator = new EnvValidator();
        const result = validator.validate();

        validator.printReport();

        if (!result.valid) {
                print.error("Cannot start bot due to environment validation errors");
                process.exit(1);
        }

        return validator.getConfig();
}

export default EnvValidator;
