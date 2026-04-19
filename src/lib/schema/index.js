export const SettingsSchema = {
        self: Boolean,
        groupOnly: Boolean,
        privateChatOnly: Boolean,
};

export const UserSchema = {
        name: String,
        limit: Number,
        premium: Boolean,
        premium_expired: Number, // NOTE: snake_case — inconsistent with PostgreSQL schema's camelCase `premiumExpired`. Kept for backward compatibility with existing local DB data.
        emails: Array,
        banned: Boolean,
        balance: Number,
        payloads: Object,
};

export const GroupSchema = {
        name: String,
        banned: Boolean,
};
