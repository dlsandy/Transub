/**
 * Global single-slot lock for heavy compute (engine / TWAI / Advanced LLM / 推理翻译).
 * Nested work inside a batch must pass `_batchMode`, `_engineExternalMt`, or
 * `_skipComputeLock` so it does not re-acquire.
 *
 * Prefer engine `/v1/compute/*` when capabilities.features.computeLock is true
 * (compute-ownership P3). Fall back to in-process lock if engine is down.
 */

const crypto = require('crypto');

/** @type {{ token: string, kind: string, owner: string, source: string, since: number, via?: string } | null} */
let holder = null;
/** @type {boolean|null} */
let engineLockSupportedCache = null;
/** @type {string} */
let engineLockBaseUrl = '';

const KIND_LABELS = {
    engine_batch: '引擎字幕任务',
    engine_range: '引擎区间重转写',
    engine_resume: '引擎从原文继续',
    engine_opus_text: '机器翻译',
    twai_batch: '字幕生成任务',
    twai_range: '区间重转写',
    advanced_reconstruct: '语境重构',
    advanced_film_reconstruct: '影片理解重构',
    advanced_smart_translate: '智能翻译',
    advanced_semantic_review: '双语语义审阅',
    advanced_batch_reconstruct: '批量语境重构',
    advanced_asr_semantic_repair: '转录语义校正',
    sakura_translate: '推理翻译',
    managed_llm_perf: '模型性能测试',
    ffmpeg_burn: '字幕烧录',
};

function kindLabel(kind) {
    return KIND_LABELS[kind] || String(kind || '计算任务');
}

function resolveEngineLockUrl(explicit = '') {
    let url = String(explicit || '').trim().replace(/\/+$/, '');
    if (url) return url;
    // Only use engine lock after setEngineLockBaseUrl (batch / ensure) — avoid
    // surprising sync HTTP to DEFAULT_ENGINE_URL during unit tests.
    return engineLockBaseUrl || '';
}

/**
 * Optional: pin engine URL for lock calls (batch start / settings).
 * @param {string} url
 */
function setEngineLockBaseUrl(url) {
    engineLockBaseUrl = String(url || '').trim().replace(/\/+$/, '');
}

function snapshot(h = holder) {
    if (!h) return null;
    return {
        kind: h.kind,
        owner: h.owner,
        source: h.source,
        since: h.since,
        label: kindLabel(h.kind),
        via: h.via || 'local',
    };
}

function formatBusyError(h = holder) {
    const snap = snapshot(h);
    if (!snap) return '已有计算任务正在运行，请等待完成后再试';
    const owner = snap.owner ? `（${snap.owner}）` : '';
    return `已有${snap.label}正在运行${owner}，请等待完成后再试`;
}

function broadcast(channel, payload) {
    try {
        const { BrowserWindow } = require('electron');
        for (const win of BrowserWindow.getAllWindows()) {
            if (!win || win.isDestroyed()) continue;
            try {
                win.webContents.send(channel, payload);
            } catch { /* ignore */ }
        }
    } catch { /* tests / no electron */ }
}

function mirrorHolderFromEngine(data) {
    if (!data || !data.token) return;
    holder = {
        token: String(data.token),
        kind: String(data.kind || 'compute').trim() || 'compute',
        owner: String(data.owner || '').trim(),
        source: String(data.source || '').trim(),
        since: Number(data.since) || Date.now(),
        via: 'engine',
    };
}

/**
 * @param {object} [meta]
 * @returns {{ ok: true, token: string, via?: string } | { ok: false, error: string, code: string, holder: object|null }}
 */
function tryAcquireLocal(meta = {}) {
    if (holder) {
        return {
            ok: false,
            error: formatBusyError(holder),
            code: 'compute_busy',
            holder: snapshot(holder),
        };
    }
    const token = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
    holder = {
        token,
        kind: String(meta.kind || 'compute').trim() || 'compute',
        owner: String(meta.owner || '').trim(),
        source: String(meta.source || '').trim(),
        since: Date.now(),
        via: 'local',
    };
    broadcast('transub-compute-task-changed', { busy: true, ...snapshot(holder) });
    return { ok: true, token, via: 'local' };
}

/**
 * @param {object} [meta]
 * @param {string} [meta.kind]
 * @param {string} [meta.owner]
 * @param {string} [meta.source]
 * @param {string} [meta.engineUrl]
 * @param {boolean} [meta.forceLocal]
 * @returns {{ ok: true, token: string, via?: string } | { ok: false, error: string, code: string, holder: object|null }}
 */
function tryAcquire(meta = {}) {
    if (holder) {
        return {
            ok: false,
            error: formatBusyError(holder),
            code: 'compute_busy',
            holder: snapshot(holder),
        };
    }

    const forceLocal = meta.forceLocal === true;
    const engineUrl = resolveEngineLockUrl(meta.engineUrl);
    if (!forceLocal && engineUrl && engineLockSupportedCache !== false) {
        try {
            const client = require('./engine-compute-client');
            const res = client.acquireComputeLockSync(engineUrl, {
                kind: meta.kind,
                owner: meta.owner,
                source: meta.source,
                clientId: meta.clientId || 'transub-desktop',
            });
            if (res.status === 404) {
                engineLockSupportedCache = false;
            } else if (res.ok && res.data?.ok && res.data?.token) {
                engineLockSupportedCache = true;
                engineLockBaseUrl = engineUrl;
                mirrorHolderFromEngine(res.data);
                broadcast('transub-compute-task-changed', { busy: true, ...snapshot(holder) });
                return { ok: true, token: holder.token, via: 'engine' };
            } else if (res.code === 'compute_busy' || res.status === 409 || res.data?.code === 'compute_busy') {
                engineLockSupportedCache = true;
                engineLockBaseUrl = engineUrl;
                const remoteHolder = res.data?.holder || null;
                return {
                    ok: false,
                    error: res.data?.error || res.error || formatBusyError(remoteHolder),
                    code: 'compute_busy',
                    holder: remoteHolder
                        ? { ...remoteHolder, label: remoteHolder.label || kindLabel(remoteHolder.kind), via: 'engine' }
                        : null,
                };
            }
            // network / unexpected → fall through to local
        } catch (_) { /* fall through */ }
    }

    return tryAcquireLocal(meta);
}

/**
 * Async acquire for UI-critical paths (avoids spawnSync HTTP on the main process).
 * @param {object} [meta]
 */
async function tryAcquireAsync(meta = {}) {
    if (holder) {
        return {
            ok: false,
            error: formatBusyError(holder),
            code: 'compute_busy',
            holder: snapshot(holder),
        };
    }

    const forceLocal = meta.forceLocal === true;
    const engineUrl = resolveEngineLockUrl(meta.engineUrl);
    if (!forceLocal && engineUrl && engineLockSupportedCache !== false) {
        try {
            const client = require('./engine-compute-client');
            const res = await client.acquireComputeLock(engineUrl, {
                kind: meta.kind,
                owner: meta.owner,
                source: meta.source,
                clientId: meta.clientId || 'transub-desktop',
            }, { timeoutMs: 8000 });
            if (res.status === 404) {
                engineLockSupportedCache = false;
            } else if (res.ok && res.data?.ok && res.data?.token) {
                engineLockSupportedCache = true;
                engineLockBaseUrl = engineUrl;
                mirrorHolderFromEngine(res.data);
                broadcast('transub-compute-task-changed', { busy: true, ...snapshot(holder) });
                return { ok: true, token: holder.token, via: 'engine' };
            } else if (res.code === 'compute_busy' || res.status === 409 || res.data?.code === 'compute_busy') {
                engineLockSupportedCache = true;
                engineLockBaseUrl = engineUrl;
                const remoteHolder = res.data?.holder || null;
                return {
                    ok: false,
                    error: res.data?.error || res.error || formatBusyError(remoteHolder),
                    code: 'compute_busy',
                    holder: remoteHolder
                        ? { ...remoteHolder, label: remoteHolder.label || kindLabel(remoteHolder.kind), via: 'engine' }
                        : null,
                };
            }
        } catch (_) { /* fall through */ }
    }

    return tryAcquireLocal(meta);
}

/**
 * @param {string} [token]
 * @returns {{ ok: boolean, error?: string }}
 */
function release(token) {
    const wasEngine = holder?.via === 'engine';
    const url = engineLockBaseUrl || resolveEngineLockUrl();
    if (wasEngine && url && engineLockSupportedCache !== false) {
        try {
            require('./engine-compute-client').releaseComputeLockSync(url, token || holder?.token || '');
        } catch (_) { /* ignore */ }
    }
    if (!holder) return { ok: true };
    if (token && holder.token !== token) {
        return { ok: false, error: 'token mismatch' };
    }
    holder = null;
    broadcast('transub-compute-task-changed', { busy: false });
    return { ok: true };
}

/**
 * Async release companion for tryAcquireAsync / runWithComputeLock.
 * @param {string} [token]
 */
async function releaseAsync(token) {
    const wasEngine = holder?.via === 'engine';
    const url = engineLockBaseUrl || resolveEngineLockUrl();
    const tok = token || holder?.token || '';
    if (wasEngine && url && engineLockSupportedCache !== false) {
        try {
            await require('./engine-compute-client').releaseComputeLock(url, tok, { timeoutMs: 8000 });
        } catch (_) { /* ignore */ }
    }
    if (!holder) return { ok: true };
    if (token && holder.token !== token) {
        return { ok: false, error: 'token mismatch' };
    }
    holder = null;
    broadcast('transub-compute-task-changed', { busy: false });
    return { ok: true };
}

function forceRelease() {
    const url = engineLockBaseUrl || resolveEngineLockUrl();
    const hadLocal = !!holder;
    if (url && engineLockSupportedCache !== false) {
        try {
            require('./engine-compute-client').forceReleaseComputeLockSync(url);
        } catch (_) { /* ignore */ }
    }
    holder = null;
    // Confirm engine side is idle when we can probe; otherwise still report released
    // if we cleared a local holder or attempted against a pinned URL.
    let stillBusy = false;
    if (url && engineLockSupportedCache !== false) {
        try {
            const st = getStatus();
            stillBusy = !!st?.busy;
        } catch (_) { /* ignore */ }
    }
    if (hadLocal || url) {
        if (!stillBusy) {
            broadcast('transub-compute-task-changed', { busy: false });
        }
        return { ok: true, released: !stillBusy };
    }
    return { ok: true, released: false };
}

function getStatus() {
    // Any in-process holder is authoritative. Probing the engine while we already
    // mirror an engine lock used spawnSync HTTP and froze the main process (and
    // thus the renderer) during long batches. Orphan detection only when idle locally.
    if (holder) {
        return { busy: true, ...snapshot(holder) };
    }
    const url = engineLockBaseUrl || resolveEngineLockUrl();
    // Probe whenever a URL is pinned and the engine lock API is not known-absent.
    // Previously required engineLockSupportedCache === true, so cold-start pins
    // (setEngineLockBaseUrl after ensure) could not see orphaned engine locks.
    if (url && engineLockSupportedCache !== false) {
        try {
            const res = require('./engine-compute-client').getComputeStatusSync(url, 1500);
            if (res.status === 404) {
                engineLockSupportedCache = false;
            } else if (res.ok && res.data) {
                engineLockSupportedCache = true;
                if (res.data.busy) {
                    return {
                        busy: true,
                        kind: res.data.kind,
                        owner: res.data.owner,
                        source: res.data.source,
                        since: res.data.since,
                        label: res.data.label || kindLabel(res.data.kind),
                        via: 'engine',
                    };
                }
                return { busy: false, via: 'engine' };
            }
        } catch (_) { /* ignore */ }
    }
    return { busy: false };
}

/**
 * Local-only status — never spawnSync-probes the engine.
 * Use on UI-critical paths (editor close reclaim, tray polls).
 */
function getLocalStatus() {
    if (!holder) return { busy: false };
    return { busy: true, ...snapshot(holder) };
}

function isBusy() {
    return !!getStatus()?.busy;
}

/**
 * Nested batch / adapter calls must skip the global lock.
 * @param {object} [payload]
 */
function shouldSkipComputeLock(payload) {
    const p = payload && typeof payload === 'object' ? payload : {};
    return !!(p._batchMode || p._skipComputeLock || p._engineExternalMt);
}

/**
 * @param {object} meta
 * @param {() => Promise<object>|object} fn
 * @returns {Promise<object>}
 */
async function runWithComputeLock(meta, fn) {
    const lock = await tryAcquireAsync(meta);
    if (!lock.ok) {
        return {
            ok: false,
            error: lock.error,
            code: lock.code || 'compute_busy',
            holder: lock.holder || null,
        };
    }
    try {
        return await fn(lock.token);
    } finally {
        await releaseAsync(lock.token);
    }
}

/**
 * Acquire unless payload opts into nested/skip mode.
 * @param {object} meta
 * @param {object} [payload]
 * @param {() => Promise<object>|object} fn
 */
async function runWithComputeLockUnlessNested(meta, payload, fn) {
    if (shouldSkipComputeLock(payload)) {
        return fn(null);
    }
    return runWithComputeLock(meta, fn);
}

/** @private test helper */
function __resetEngineLockCacheForTests() {
    engineLockSupportedCache = null;
    engineLockBaseUrl = '';
}

module.exports = {
    KIND_LABELS,
    kindLabel,
    tryAcquire,
    tryAcquireAsync,
    release,
    releaseAsync,
    forceRelease,
    getStatus,
    getLocalStatus,
    isBusy,
    formatBusyError,
    shouldSkipComputeLock,
    runWithComputeLock,
    runWithComputeLockUnlessNested,
    setEngineLockBaseUrl,
    resolveEngineLockUrl,
    __resetEngineLockCacheForTests,
};
