/**
 * Shared engine client registry for Editor / Transub UI.
 * File: %AppData%/Transub/engine-clients.json
 */
const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 1;
/** Drop clients whose heartbeat is older than this. */
const HEARTBEAT_TTL_MS = 45_000;

/** @type {{ schemaVersion: number, clients: object[], host: object|null } | null} */
let state = null;
/** @type {string | null} */
let filePath = null;
/** @type {(() => void) | null} */
let onIdleShutdown = null;
/** @type {'daemon'|'gui'|null} */
let hostKind = null;

function defaultClientsPath() {
    try {
        const { app } = require('electron');
        return path.join(app.getPath('appData'), 'Transub', 'engine-clients.json');
    } catch (_) {
        return path.join(
            process.env.APPDATA || path.join(require('os').homedir(), 'AppData', 'Roaming'),
            'Transub',
            'engine-clients.json',
        );
    }
}

function nowIso() {
    return new Date().toISOString();
}

function isPidAlive(pid) {
    const n = Number(pid);
    if (!Number.isFinite(n) || n <= 0) return false;
    try {
        process.kill(n, 0);
        return true;
    } catch (err) {
        return err && err.code === 'EPERM';
    }
}

function emptyState() {
    return {
        schemaVersion: SCHEMA_VERSION,
        clients: [],
        host: null,
    };
}

function loadFromDisk() {
    if (!filePath || !fs.existsSync(filePath)) {
        state = emptyState();
        return state;
    }
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        state = {
            schemaVersion: SCHEMA_VERSION,
            clients: Array.isArray(parsed.clients) ? parsed.clients : [],
            host: parsed.host && typeof parsed.host === 'object' ? parsed.host : null,
        };
    } catch (_) {
        state = emptyState();
    }
    return state;
}

function persist() {
    if (!filePath || !state) return;
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8' });
    try {
        fs.chmodSync(filePath, 0o600);
    } catch (_) { /* windows may ignore */ }
}

function clearFile() {
    try {
        if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (_) { /* ignore */ }
    state = emptyState();
}

/**
 * @param {{ clientsPath?: string, hostKind?: 'daemon'|'gui', onIdleShutdown?: () => void }} opts
 */
function initFactoryClients(opts = {}) {
    filePath = opts.clientsPath || defaultClientsPath();
    hostKind = opts.hostKind === 'daemon' ? 'daemon' : 'gui';
    onIdleShutdown = typeof opts.onIdleShutdown === 'function' ? opts.onIdleShutdown : null;
    loadFromDisk();
    state.host = {
        kind: hostKind,
        pid: process.pid,
        updatedAt: nowIso(),
    };
    state.clients = pruneDead(state.clients);
    persist();
    return { ok: true, hostKind, path: filePath };
}

function pruneDead(clients) {
    const cutoff = Date.now() - HEARTBEAT_TTL_MS;
    return (clients || []).filter((c) => {
        if (!c || typeof c !== 'object') return false;
        if (!isPidAlive(c.pid)) return false;
        const t = Date.parse(String(c.updatedAt || ''));
        if (!Number.isFinite(t)) return false;
        return t >= cutoff;
    });
}

function snapshot() {
    if (!state) loadFromDisk();
    state.clients = pruneDead(state.clients);
    return {
        schemaVersion: SCHEMA_VERSION,
        clients: state.clients.slice(),
        host: state.host ? { ...state.host } : null,
    };
}

function maybeIdleShutdown() {
    if (!state) return false;
    state.clients = pruneDead(state.clients);
    persist();
    if (state.clients.length > 0) return false;
    if (hostKind !== 'daemon') return false;
    if (typeof onIdleShutdown === 'function') {
        setImmediate(() => {
            try { onIdleShutdown(); } catch (_) { /* ignore */ }
        });
        return true;
    }
    return false;
}

/**
 * @param {{ id?: string, kind?: string, pid?: number }} body
 */
function registerClient(body = {}) {
    if (!state) loadFromDisk();
    const kind = String(body.kind || '').trim().toLowerCase();
    if (kind !== 'editor' && kind !== 'transub-ui') {
        return { ok: false, code: 'bad_request', error: 'kind must be editor|transub-ui' };
    }
    const pid = Number(body.pid);
    if (!Number.isFinite(pid) || pid <= 0) {
        return { ok: false, code: 'bad_request', error: 'pid required' };
    }
    const id = String(body.id || `${kind}-${pid}`).trim() || `${kind}-${pid}`;
    state.clients = pruneDead(state.clients).filter((c) => c.id !== id);
    state.clients.push({
        id,
        kind,
        pid,
        updatedAt: nowIso(),
    });
    if (state.host) state.host.updatedAt = nowIso();
    persist();
    return { ok: true, client: { id, kind, pid }, clients: snapshot().clients };
}

/**
 * @param {{ id?: string }} body
 */
function heartbeatClient(body = {}) {
    if (!state) loadFromDisk();
    const id = String(body.id || '').trim();
    if (!id) return { ok: false, code: 'bad_request', error: 'id required' };
    state.clients = pruneDead(state.clients);
    const row = state.clients.find((c) => c.id === id);
    if (!row) {
        return { ok: false, code: 'not_found', error: 'client not registered' };
    }
    row.updatedAt = nowIso();
    if (state.host) state.host.updatedAt = nowIso();
    persist();
    return { ok: true, client: { ...row } };
}

/**
 * @param {{ id?: string }} body
 */
function unregisterClient(body = {}) {
    if (!state) loadFromDisk();
    const id = String(body.id || '').trim();
    if (!id) return { ok: false, code: 'bad_request', error: 'id required' };
    state.clients = pruneDead(state.clients).filter((c) => c.id !== id);
    persist();
    const shuttingDown = maybeIdleShutdown();
    return {
        ok: true,
        shuttingDown,
        clients: snapshot().clients,
    };
}

function setHostKind(kind) {
    hostKind = kind === 'daemon' ? 'daemon' : 'gui';
    if (!state) loadFromDisk();
    state.host = {
        kind: hostKind,
        pid: process.pid,
        updatedAt: nowIso(),
    };
    persist();
}

function disposeFactoryClients() {
    clearFile();
    onIdleShutdown = null;
    hostKind = null;
    filePath = null;
}

module.exports = {
    HEARTBEAT_TTL_MS,
    initFactoryClients,
    disposeFactoryClients,
    registerClient,
    heartbeatClient,
    unregisterClient,
    snapshot,
    setHostKind,
    maybeIdleShutdown,
    defaultClientsPath,
    /** @private */
    _test: {
        isPidAlive,
        pruneDead,
        emptyState,
    },
};
