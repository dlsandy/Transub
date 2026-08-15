/**
 * Global single-slot lock for heavy compute (engine / TWAI / Advanced LLM / Sakura).
 * Nested work inside a batch must pass `_batchMode`, `_engineExternalMt`, or
 * `_skipComputeLock` so it does not re-acquire.
 *
 * Concurrency note (see docs/asr.md):
 * - Desktop product path is intentionally single-slot.
 * - Engine may allow TRANSUB_MAX_CONCURRENT_JOBS > 1 for its own scheduler,
 *   but UI-driven batches still serialize through this lock.
 */

const crypto = require('crypto');

/** @type {{ token: string, kind: string, owner: string, source: string, since: number } | null} */
let holder = null;

const KIND_LABELS = {
    engine_batch: '引擎字幕任务',
    engine_range: '引擎区间重转写',
    engine_resume: '引擎断点恢复',
    engine_opus_text: '机器翻译',
    twai_batch: '字幕生成任务',
    twai_range: '区间重转写',
    twai_trial: '参数对比试跑',
    advanced_reconstruct: '语境重构',
    advanced_film_reconstruct: '影片理解重构',
    advanced_smart_translate: '智能翻译',
    advanced_semantic_review: '双语语义审阅',
    advanced_batch_reconstruct: '批量语境重构',
    sakura_translate: 'Sakura 翻译',
    managed_llm_perf: '模型性能测试',
};

function kindLabel(kind) {
    return KIND_LABELS[kind] || String(kind || '计算任务');
}

function snapshot(h = holder) {
    if (!h) return null;
    return {
        kind: h.kind,
        owner: h.owner,
        source: h.source,
        since: h.since,
        label: kindLabel(h.kind),
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

/**
 * @param {object} [meta]
 * @param {string} [meta.kind]
 * @param {string} [meta.owner]
 * @param {string} [meta.source]
 * @returns {{ ok: true, token: string } | { ok: false, error: string, code: string, holder: object|null }}
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
    const token = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
    holder = {
        token,
        kind: String(meta.kind || 'compute').trim() || 'compute',
        owner: String(meta.owner || '').trim(),
        source: String(meta.source || '').trim(),
        since: Date.now(),
    };
    broadcast('transub-compute-task-changed', { busy: true, ...snapshot(holder) });
    return { ok: true, token };
}

/**
 * @param {string} [token]
 * @returns {{ ok: boolean, error?: string }}
 */
function release(token) {
    if (!holder) return { ok: true };
    if (token && holder.token !== token) {
        return { ok: false, error: 'token mismatch' };
    }
    holder = null;
    broadcast('transub-compute-task-changed', { busy: false });
    return { ok: true };
}

function forceRelease() {
    if (!holder) return { ok: true, released: false };
    holder = null;
    broadcast('transub-compute-task-changed', { busy: false });
    return { ok: true, released: true };
}

function getStatus() {
    if (!holder) return { busy: false };
    return { busy: true, ...snapshot(holder) };
}

function isBusy() {
    return !!holder;
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
    const lock = tryAcquire(meta);
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
        release(lock.token);
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

module.exports = {
    KIND_LABELS,
    kindLabel,
    tryAcquire,
    release,
    forceRelease,
    getStatus,
    isBusy,
    formatBusyError,
    shouldSkipComputeLock,
    runWithComputeLock,
    runWithComputeLockUnlessNested,
};
