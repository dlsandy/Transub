/**
 * In-memory progress bus for Editor Factory SSE (P4).
 * Keyed by requestId; buffers recent events for late subscribers.
 */
/** @type {Map<string, { writers: Set<(evt: object) => void>, buffer: object[], createdAt: number }>} */
const channels = new Map();

const MAX_BUFFER = 64;
const CHANNEL_TTL_MS = 30 * 60 * 1000;

function sweep() {
    const now = Date.now();
    for (const [id, ch] of channels) {
        if (ch.writers.size === 0 && now - ch.createdAt > CHANNEL_TTL_MS) {
            channels.delete(id);
        }
    }
}

function ensure(requestId) {
    const id = String(requestId || '').trim();
    if (!id) return null;
    let ch = channels.get(id);
    if (!ch) {
        ch = { writers: new Set(), buffer: [], createdAt: Date.now() };
        channels.set(id, ch);
        if (channels.size > 200) sweep();
    }
    return ch;
}

/**
 * @param {string} requestId
 * @param {object} event
 */
function emit(requestId, event) {
    const ch = ensure(requestId);
    if (!ch) return;
    const payload = event && typeof event === 'object'
        ? { ...event, requestId: String(requestId), ts: event.ts || Date.now() }
        : { message: String(event || ''), requestId: String(requestId), ts: Date.now() };
    ch.buffer.push(payload);
    if (ch.buffer.length > MAX_BUFFER) ch.buffer.shift();
    for (const w of ch.writers) {
        try { w(payload); } catch (_) { /* ignore */ }
    }
}

/**
 * @param {string} requestId
 * @param {(evt: object) => void} writer
 * @returns {() => void} unsubscribe
 */
function subscribe(requestId, writer) {
    const ch = ensure(requestId);
    if (!ch || typeof writer !== 'function') return () => {};
    ch.writers.add(writer);
    for (const e of ch.buffer) {
        try { writer(e); } catch (_) { /* ignore */ }
    }
    return () => {
        ch.writers.delete(writer);
    };
}

function close(requestId) {
    const id = String(requestId || '').trim();
    if (!id) return;
    channels.delete(id);
}

function makeProgressEmitter(requestId) {
    const id = String(requestId || '').trim();
    return (info) => {
        if (!id) return;
        emit(id, info && typeof info === 'object' ? info : { message: String(info || '') });
    };
}

module.exports = {
    emit,
    subscribe,
    close,
    makeProgressEmitter,
    /** @private tests */
    _test: {
        channels,
        sweep,
        ensure,
        reset() { channels.clear(); },
    },
};
