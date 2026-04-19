// lib/filter.js
// Content filter that checks message text against a list of banned keywords.

/**
 * List of banned words / phrases.
 * Add or remove entries as needed — comparisons are case-insensitive.
 */
const BANNED_WORDS = [
        'csam',
        'child porn',
        'cp',
        'loli',
        'shota',
        'minor',
        'rape',
        'forced',
        'gore',
        'snuff',
        'kill',
        'trafficking',
];

/**
 * Pre-compiled regex for faster matching.
 * Built once at startup instead of creating new regex on every message.
 */
const BANNED_PATTERN = new RegExp(
        BANNED_WORDS.map((w) => '\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').join('|'),
        'i'
);

/**
 * Checks whether the given text contains any prohibited content.
 *
 * @param {string} text — The message body to inspect.
 * @returns {boolean} `true` if at least one banned word is found.
 */
export function containsProhibitedContent(text) {
        if (!text) return false;
        return BANNED_PATTERN.test(text);
}
