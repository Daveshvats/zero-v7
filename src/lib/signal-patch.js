/**
 * Preload script: patches console.log and process.stdout/stderr BEFORE any
 * ES module imports are evaluated. Must be loaded via `--import`.
 *
 * Why this exists:
 *   In ES modules, all `import` statements are hoisted and evaluated before the
 *   module body runs. Baileys (imported transitively by main.js) captures
 *   console.log at import time — so patching it inside main() is too late.
 *
 *   Node.js `--import` runs this file BEFORE the main entry point's imports,
 *   so our patches are in place when Baileys loads and captures console.log.
 *
 * Usage:
 *   node --import ./src/lib/signal-patch.js src/main.js
 */

const SIGNAL_NOISE = [
        "Closing session:",
        "Decrypted message with closed session",
        "SessionEntry",
        "signal-protocol",
        "SessionRecord",
        "PreKeyStore",
        "SenderKeyStore",
        "libsignal",
];

function isNoise(str) {
        if (!str) return false;
        return SIGNAL_NOISE.some((p) => str.includes(p));
}

// ── Patch process.stdout.write ──────────────────────────────────────
const _stdoutWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = function (chunk, ...args) {
        const str = typeof chunk === "string" ? chunk : chunk?.toString?.() || "";
        if (isNoise(str)) return true;
        return _stdoutWrite(chunk, ...args);
};

// ── Patch process.stderr.write ──────────────────────────────────────
const _stderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = function (chunk, ...args) {
        const str = typeof chunk === "string" ? chunk : chunk?.toString?.() || "";
        if (isNoise(str)) return true;
        return _stderrWrite(chunk, ...args);
};

// ── Patch console methods ──────────────────────────────────────────
function filterFn(original) {
        return function (...args) {
                const str = args.map((v) => (typeof v === "string" ? v : String(v))).join(" ");
                if (isNoise(str)) return;
                return original.apply(this, args);
        };
}

const _consoleLog = console.log;
const _consoleDebug = console.debug;
const _consoleInfo = console.info;
const _consoleWarn = console.warn;
const _consoleError = console.error;

console.log = filterFn(_consoleLog);
console.debug = filterFn(_consoleDebug);
console.info = filterFn(_consoleInfo);
console.warn = filterFn(_consoleWarn);
console.error = filterFn(_consoleError);

// ── Patch Console.prototype (catches `new Console()` instances) ────
const { Console } = await import("node:console");

const _protoLog = Console.prototype.log;
const _protoDebug = Console.prototype.debug;
const _protoInfo = Console.prototype.info;
const _protoWarn = Console.prototype.warn;
const _protoError = Console.prototype.error;

Console.prototype.log = filterFn(_protoLog);
Console.prototype.debug = filterFn(_protoDebug);
Console.prototype.info = filterFn(_protoInfo);
Console.prototype.warn = filterFn(_protoWarn);
Console.prototype.error = filterFn(_protoError);
