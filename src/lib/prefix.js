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

/**
 * Lightweight prefix set for fast-path checks (O(1) hasPrefix lookup).
 * Built once from the sorted prefixes, avoids array scan on every message.
 */
let _prefixSet = new Set();

export function getPrefixSet() {
        if (_prefixSet.size === 0) {
                const sortedPrefixes = getSortedPrefixes();
                for (const p of sortedPrefixes) {
                        _prefixSet.add(p);
                }
        }
        return _prefixSet;
}

/**
 * Fast-path command detection: checks if a raw body starts with any known prefix
 * and the following word is a known command. No serialize() needed.
 * Returns { isCommand, command } — only used for routing decisions.
 *
 * Owner no-prefix commands are NOT checked here (need isOwner from serialize).
 * Those fall through to the full pipeline automatically.
 *
 * @param {string} body - Raw message text
 * @returns {{ isCommand: boolean, command: string }}
 */
export function quickCommandCheck(body) {
        if (!body || typeof body !== "string") return { isCommand: false, command: "" };

        const prefixSet = getPrefixSet();
        // Check if body starts with any known prefix (O(1) per prefix, typically 1-3 prefixes)
        for (const p of prefixSet) {
                if (body.startsWith(p)) {
                        const rest = body.slice(p.length);
                        // Extract first word after prefix
                        const spaceIdx = rest.search(/\s/);
                        const possibleCmd = (spaceIdx === -1 ? rest : rest.slice(0, spaceIdx)).toLowerCase();
                        if (possibleCmd && allCmdSet.has(possibleCmd)) {
                                return { isCommand: true, command: possibleCmd };
                        }
                        // Starts with prefix but not a known command → prefix-only message, not a command
                        return { isCommand: false, command: "" };
                }
        }

        return { isCommand: false, command: "" };
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
