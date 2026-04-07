import { BOT_CONFIG } from "#config/index";

/** @type {Set<string>} - O(1) command existence check */
export let allCmdSet = new Set();

/** Pre-sorted prefix array (longest first) — cached to avoid sorting on every message */
let sortedPrefixCache = [];

export function setAllCommands(list) {
        allCmdSet = new Set((list || []).map((cmd) => cmd.toLowerCase()));
}

/** Rebuild the sorted prefix cache when needed */
function getSortedPrefixes() {
        if (sortedPrefixCache.length === 0) {
                const prefixes = (BOT_CONFIG.prefixes || []).filter(Boolean);
                sortedPrefixCache = prefixes.slice().sort((a, b) => b.length - a.length);
        }
        return sortedPrefixCache;
}

/**
 * Check if a given string is a known command (O(1) lookup).
 * @param {string} cmd
 * @returns {boolean}
 */
export function isKnownCommand(cmd) {
        return allCmdSet.has(cmd.toLowerCase());
}

/**
 * Get all known commands as an array.
 * @returns {string[]}
 */
export function getAllCommandsArray() {
        return Array.from(allCmdSet);
}

/*
 * Determines the prefix for a given message body and sender.
 * Owner can use no-prefix or prefix, regular users must use a prefix.
 *
 * @param {string} body - The message body.
 * @param {object} m - The serialized message object (needs m.isOwner).
 * @returns {{prefix: string, isCommand: boolean, command: string, args: string[], text: string}} An object containing prefix, isCommand, command, args, and text.
 */
export function getPrefix(body, m) {
        const isOwner = m.isOwner;

        let prefix = "";
        let isCommand = false;
        let command = "";
        let args = [];
        let text = "";

        if (!body) {
                return { prefix, isCommand, command, args, text };
        }

        const sortedPrefixes = getSortedPrefixes();

        for (const p of sortedPrefixes) {
                if (body.startsWith(p)) {
                        prefix = p;
                        break;
                }
        }

        if (!prefix && isOwner && sortedPrefixes.length && allCmdSet.size) {
                const parts = body.trim().split(/\s+/);
                const possibleCmd = (parts[0] || "").toLowerCase();
                if (allCmdSet.has(possibleCmd)) {
                        command = possibleCmd;
                        args = parts.slice(1);
                        text = args.join(" ");
                        isCommand = true;
                }
        } else if (prefix) {
                const contentWithoutPrefix = body.slice(prefix.length).trim();
                const parts = contentWithoutPrefix.split(/\s+/);
                const possibleCmd = (parts.shift() || "").toLowerCase();

                if (allCmdSet.has(possibleCmd)) {
                        command = possibleCmd;
                        args = parts;
                        text = args.join(" ");
                        isCommand = true;
                }
        }

        return { prefix, isCommand, command, args, text };
}
