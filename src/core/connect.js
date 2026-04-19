import { BOT_CONFIG } from "#config/index";
import Message from "#core/message";
import getAuthState from "#lib/auth/state";
import logger from "#lib/logger";
import PluginManager from "#lib/plugins";
import print from "#lib/print";
import { Client } from "#lib/serialize";
import Store from "#lib/store";
import NodeCache from "@cacheable/node-cache";
import {
        Browsers,
        DisconnectReason,
        areJidsSameUser,
        fetchLatestBaileysVersion,
        getAggregateVotesInPollMessage,
        jidNormalizedUser,
        makeCacheableSignalKeyStore,
        makeWASocket,
} from "baileys";
import qrcode from "qrcode";

const msgRetryCounterCache = new NodeCache();

/** Max reconnect attempts before giving up on a loggedOut session */
const MAX_RECONNECT_ATTEMPTS = 3;

/**
 * Main class to manage the WhatsApp bot connection and events.
 */
class Connect {
        constructor() {
                this.sock = null;
                this.sessionName = BOT_CONFIG.sessionName;
                this._initialized = false;
                this._reconnectCount = 0;

                this.groupMetadataCache = new NodeCache({
                        stdTTL: 60 * 60,
                        checkperiod: 120,
                });

                this.store = new Store(this.sessionName);
                this.pluginManager = new PluginManager(BOT_CONFIG, this.store);

                this.message = new Message(
                        this.pluginManager,
                        BOT_CONFIG.ownerJids,
                        BOT_CONFIG.prefixes,
                        this.groupMetadataCache,
                        this.store
                );
        }

        /**
         * One-time initialization: load store, plugins, auth state.
         * Only runs once; subsequent calls are no-ops.
         */
        async _init() {
                if (this._initialized) return;

                print.info(`Starting WhatsApp Bot session: ${this.sessionName}`);

                await this.store.load();
                this.store.savePeriodically();

                const { version } = await fetchLatestBaileysVersion();
                this._version = version;
                print.info(`Baileys version: ${version.join(".")}`);

                await this.pluginManager.loadPlugins();
                this.pluginManager.watchPlugins();

                this._initialized = true;
        }

        /**
         * Create the Baileys socket, attach all event handlers.
         * This is the method that can be called multiple times for reconnects.
         */
        async _connect() {
                if (!this._initialized) {
                        await this._init();
                }

                const { state, saveCreds, removeCreds } = await getAuthState(
                        this.sessionName
                );

                const qrMode = process.env.QR === "true";
                const botNumber = process.env.BOT_NUMBER;
                const usePairingCode = !qrMode && !state.creds.registered;

                if (!qrMode && !state.creds.registered && !botNumber) {
                        print.error(
                                "BOT_NUMBER is not set in .env. Please set BOT_NUMBER for pairing code."
                        );
                        process.exit(1);
                }

                // Close old socket if it exists (clean reconnect)
                if (this.sock?.ws) {
                        try {
                                this.sock.ws.close();
                        } catch {}
                }

                print.info(`Connecting WhatsApp session: ${this.sessionName}`);

                const rawSock = makeWASocket({
                        auth: {
                                creds: state.creds,
                                keys: makeCacheableSignalKeyStore(state.keys, logger),
                        },
                        version: this._version,
                        logger,
                        getMessage: async (key) => {
                                const jid = jidNormalizedUser(key.remoteJid);
                                return this.store.loadMessage(jid, key.id)?.message || null;
                        },
                        getGroupMetadata: async (jid) => {
                                const normalizedJid = jidNormalizedUser(jid);

                                let metadata = this.groupMetadataCache.get(normalizedJid);
                                if (metadata) {
                                        return metadata;
                                }

                                metadata = this.store.getGroupMetadata(normalizedJid);
                                if (metadata) {
                                        this.groupMetadataCache.set(normalizedJid, metadata);
                                        return metadata;
                                }

                                try {
                                        metadata = await this.sock.groupMetadata(jid);
                                        this.groupMetadataCache.set(normalizedJid, metadata);
                                        this.store.setGroupMetadata(normalizedJid, metadata);
                                        print.debug(`Cached metadata for group: ${jid}`);
                                        return metadata;
                                } catch (e) {
                                        print.error(
                                                `Failed to fetch group metadata for ${jid}:`,
                                                e
                                        );
                                        return null;
                                }
                        },
                        browser: Browsers.macOS("Safari"),
                        syncFullHistory: false,
                        generateHighQualityLinkPreview: true,
                        qrTimeout: usePairingCode ? undefined : 60000,
                        msgRetryCounterCache,
                });

                this.sock = Client({ sock: rawSock, store: this.store });

                this.pluginManager.scheduleAllPeriodicTasks(this.sock);
                this.pluginManager.store = this.store;

                // ── Event Handlers ──────────────────────────────────────────

                this.sock.ev.on("creds.update", saveCreds);

                this.sock.ev.on("contacts.update", (update) => {
                        this.store.updateContacts(update);
                });

                this.sock.ev.on("contacts.upsert", (update) => {
                        this.store.upsertContacts(update);
                });

                this.sock.ev.on("groups.update", (updates) => {
                        this.store.updateGroupMetadata(updates);
                });

                this.sock.ev.on("messages.upsert", (data) =>
                        this.message.process(this.sock, data)
                );

                this.sock.ev.on("messages.update", async (event) => {
                        for (const { key, update } of event) {
                                if (update.pollUpdates) {
                                        const pollCreation = await this.store.loadMessage(
                                                jidNormalizedUser(key.remoteJid),
                                                key.id
                                        );
                                        if (pollCreation && pollCreation.message) {
                                                const aggregate = getAggregateVotesInPollMessage({
                                                        message: pollCreation.message,
                                                        pollUpdates: update.pollUpdates,
                                                });
                                                print.info("Got poll update, aggregation:", aggregate);
                                        }
                                }
                        }
                });

                this.sock.ev.on(
                        "group-participants.update",
                        async ({ id, participants, action }) => {
                                const participantJids = participants
                                        .map((p) => (typeof p === "string" ? p : p?.id))
                                        .filter(Boolean)
                                        .map(jidNormalizedUser);

                                print.info(
                                        `Group participants updated for ${id}: ${action} ${participantJids.join(", ")}`
                                );

                                const normalizedJid = jidNormalizedUser(id);
                                let metadata =
                                        this.groupMetadataCache.get(normalizedJid) ||
                                        this.store.getGroupMetadata(normalizedJid);

                                if (!metadata) {
                                        try {
                                                metadata = await this.sock.groupMetadata(id);
                                        } catch (e) {
                                                print.error(`Failed to fetch metadata for ${id}:`, e);
                                                return;
                                        }
                                }

                                switch (action) {
                                        case "add":
                                                participantJids.forEach((pid) => {
                                                        if (
                                                                !metadata.participants.some((p) => areJidsSameUser(p.id, pid))
                                                        ) {
                                                                metadata.participants.push({
                                                                        id: pid,
                                                                        admin: null,
                                                                });
                                                        }
                                                });
                                                break;
                                        case "promote":
                                                metadata.participants.forEach((p) => {
                                                        // FIX: Use areJidsSameUser instead of includes() to handle LID groups
                                                        // where p.id may be @lid while participantJids contains @s.whatsapp.net
                                                        if (participantJids.some((jid) => areJidsSameUser(jid, p.id))) {
                                                                p.admin = "admin";
                                                        }
                                                });
                                                break;
                                        case "demote":
                                                metadata.participants.forEach((p) => {
                                                        // FIX: Use areJidsSameUser instead of includes() to handle LID groups
                                                        if (participantJids.some((jid) => areJidsSameUser(jid, p.id))) {
                                                                p.admin = null;
                                                        }
                                                });
                                                break;
                                        case "remove":
                                                metadata.participants = metadata.participants.filter(
                                                        (p) => !participantJids.some((jid) => areJidsSameUser(jid, p.id))
                                                );
                                                break;
                                }

                                this.groupMetadataCache.set(normalizedJid, metadata);
                                this.store.setGroupMetadata(normalizedJid, metadata);
                                print.debug(`Updated group metadata cache for ${id}`);
                        }
                );

                // ── Connection lifecycle ───────────────────────────────────

                this.sock.ev.on("connection.update", async (update) => {
                        const { connection, lastDisconnect, qr } = update;

                        if (!usePairingCode && qr) {
                                print.info(`Scan QR Code for session ${this.sessionName}:`);
                                console.log(
                                        await qrcode.toString(qr, { type: "terminal", small: true })
                                );
                        }

                        if (
                                usePairingCode &&
                                connection === "connecting" &&
                                !state.creds.registered
                        ) {
                                if (botNumber) {
                                        setTimeout(async () => {
                                                try {
                                                        const code = await this.sock.requestPairingCode(
                                                                botNumber.trim()
                                                        );
                                                        print.info(`Your Pairing Code: ${code}`);
                                                        print.info(
                                                                "Enter this code on your WhatsApp phone: Settings -> Linked Devices -> Link a Device -> Link with phone number instead."
                                                        );
                                                } catch (e) {
                                                        print.error("Failed to request pairing code:", e);
                                                }
                                        }, 6000);
                                }
                        }

                        if (connection === "open") {
                                this._reconnectCount = 0;
                                print.info(
                                        `Connection opened successfully for session ${this.sessionName}.`
                                );
                                return;
                        }

                        if (connection !== "close") return;

                        const statusCode = lastDisconnect?.error?.output?.statusCode;
                        const isLoggedOut = statusCode === DisconnectReason.loggedOut;

                        print.warn(
                                `Connection closed. Reason: ${lastDisconnect?.error?.message || "Unknown"}. StatusCode: ${statusCode}.`
                        );

                        if (isLoggedOut) {
                                this._reconnectCount++;
                                if (this._reconnectCount > MAX_RECONNECT_ATTEMPTS) {
                                        print.error(
                                                `Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached for loggedOut session. Exiting.`
                                        );
                                        this.store.stopSaving();
                                        process.exit(1);
                                }
                                await removeCreds();
                                print.info(
                                        `Session logged out. Credentials cleared. Reconnecting for fresh QR (attempt ${this._reconnectCount}/${MAX_RECONNECT_ATTEMPTS})...`
                                );
                                clearTimeout(this._reconnectTimer);
                                this._reconnectTimer = setTimeout(() => this._connect(), 3000);
                                return;
                        }

                        // All other disconnects: reconnect immediately
                        print.info(`Reconnecting in 3s...`);
                        clearTimeout(this._reconnectTimer);
                        this._reconnectTimer = setTimeout(() => this._connect(), 3000);
                });
        }

        /**
         * Public start method — initializes once, then connects.
         */
        async start() {
                await this._init();
                await this._connect();
        }
}

export default Connect;