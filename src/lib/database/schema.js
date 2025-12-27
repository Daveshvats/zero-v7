import { pgTable, serial, text, boolean, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
        id: serial("id").primaryKey(),
        jid: text("jid").notNull().unique(),
        name: text("name"),
        banned: boolean("banned").default(false),
        premium: boolean("premium").default(false),
        premiumExpired: timestamp("premium_expired"),
        limit: integer("limit").default(0),
        createdAt: timestamp("created_at").defaultNow(),
        updatedAt: timestamp("updated_at").defaultNow(),
});

export const groups = pgTable("groups", {
        id: serial("id").primaryKey(),
        jid: text("jid").notNull().unique(),
        name: text("name"),
        welcome: boolean("welcome").default(false),
        welcomeMessage: text("welcome_message"),
        goodbye: boolean("goodbye").default(false),
        goodbyeMessage: text("goodbye_message"),
        antilink: boolean("antilink").default(false),
        muted: boolean("muted").default(false),
        metadata: jsonb("metadata"),
        createdAt: timestamp("created_at").defaultNow(),
        updatedAt: timestamp("updated_at").defaultNow(),
});

export const commands = pgTable("commands", {
        id: serial("id").primaryKey(),
        commandName: text("command_name").notNull(),
        userJid: text("user_jid").notNull(),
        groupJid: text("group_jid"),
        args: text("args"),
        responseTimeMs: integer("response_time_ms"),
        success: boolean("success").default(true),
        error: text("error"),
        executedAt: timestamp("executed_at").defaultNow(),
});

export const aiTasks = pgTable("ai_tasks", {
        id: serial("id").primaryKey(),
        taskType: text("task_type").notNull(),
        userJid: text("user_jid").notNull(),
        prompt: text("prompt"),
        result: text("result"),
        status: text("status").default("pending"),
        processingTimeMs: integer("processing_time_ms"),
        metadata: jsonb("metadata"),
        createdAt: timestamp("created_at").defaultNow(),
        completedAt: timestamp("completed_at"),
});

export const settings = pgTable("settings", {
        id: serial("id").primaryKey(),
        key: text("key").notNull().unique(),
        value: jsonb("value"),
        updatedAt: timestamp("updated_at").defaultNow(),
});

export const sessions = pgTable("sessions", {
        id: serial("id").primaryKey(),
        sessionName: text("session_name").notNull().unique(),
        phone: text("phone"),
        connected: boolean("connected").default(false),
        isClone: boolean("is_clone").default(false),
        createdAt: timestamp("created_at").defaultNow(),
        lastActive: timestamp("last_active").defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
        commands: many(commands),
        aiTasks: many(aiTasks),
}));

export const commandsRelations = relations(commands, ({ one }) => ({
        user: one(users, {
                fields: [commands.userJid],
                references: [users.jid],
        }),
}));

export const aiTasksRelations = relations(aiTasks, ({ one }) => ({
        user: one(users, {
                fields: [aiTasks.userJid],
                references: [users.jid],
        }),
}));

export const migrations = pgTable("migrations", {
        id: serial("id").primaryKey(),
        name: text("name").notNull().unique(),
        hash: text("hash"),
        appliedAt: timestamp("applied_at").defaultNow(),
});

export const deadLetterQueue = pgTable("dead_letter_queue", {
        id: serial("id").primaryKey(),
        commandName: text("command_name").notNull(),
        userJid: text("user_jid").notNull(),
        groupJid: text("group_jid"),
        args: text("args"),
        error: text("error").notNull(),
        stackTrace: text("stack_trace"),
        metadata: jsonb("metadata"),
        failedAt: timestamp("failed_at").defaultNow(),
        resolved: boolean("resolved").default(false),
        resolvedAt: timestamp("resolved_at"),
}, (table) => [
        index("dlq_user_idx").on(table.userJid),
        index("dlq_command_idx").on(table.commandName),
        index("dlq_failed_at_idx").on(table.failedAt),
]);

export const permissions = pgTable("permissions", {
        id: serial("id").primaryKey(),
        jid: text("jid").notNull(),
        type: text("type").notNull(),
        commandName: text("command_name"),
        permission: text("permission").notNull(),
        grantedBy: text("granted_by"),
        reason: text("reason"),
        expiresAt: timestamp("expires_at"),
        createdAt: timestamp("created_at").defaultNow(),
        updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
        index("perm_jid_idx").on(table.jid),
        index("perm_command_idx").on(table.commandName),
]);
