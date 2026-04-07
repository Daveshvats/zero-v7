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
        termsAccepted: boolean("terms_accepted").default(false),
        termsAcceptedAt: timestamp("terms_accepted_at"),
        createdAt: timestamp("created_at").defaultNow(),
        updatedAt: timestamp("updated_at").defaultNow(),
});

export const groups = pgTable("groups", {
        id: serial("id").primaryKey(),
        jid: text("jid").notNull().unique(),
        name: text("name"),
        banned: boolean("banned").default(false),
        welcome: boolean("welcome").default(false),
        welcomeMessage: text("welcome_message"),
        goodbye: boolean("goodbye").default(false),
        goodbyeMessage: text("goodbye_message"),
        antilink: boolean("antilink").default(false),
        muted: boolean("muted").default(false),
        // Character AI auto-responder per group
        caiEnabled: boolean("cai_enabled").default(false),
        caiCharId: text("cai_char_id"),
        caiCharName: text("cai_char_name"),
        caiChatId: text("cai_chat_id"),   // persisted CAI chat_id for conversation continuity
        // Group-level terms acceptance (persisted so cache survives restarts)
        termsAccepted: boolean("terms_accepted").default(false),
        termsAcceptedAt: timestamp("terms_accepted_at"),
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
}, (table) => [
        index("cmd_user_jid_idx").on(table.userJid),
        index("cmd_command_name_idx").on(table.commandName),
        index("cmd_executed_at_idx").on(table.executedAt),
]);

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
}, (table) => [
        index("ai_task_user_jid_idx").on(table.userJid),
        index("ai_task_status_idx").on(table.status),
]);

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

export const voiceClones = pgTable("voice_clones", {
        id: serial("id").primaryKey(),
        groupJid: text("group_jid").notNull(),
        name: text("name").notNull(),
        voiceId: text("voice_id").notNull(),
        clonedBy: text("cloned_by").notNull(),
        createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
        index("vc_group_name_idx").on(table.groupJid, table.name),
        index("vc_group_idx").on(table.groupJid),
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
        index("perm_lookup_idx").on(table.jid, table.type, table.permission),
        index("perm_command_idx").on(table.commandName),
]);
