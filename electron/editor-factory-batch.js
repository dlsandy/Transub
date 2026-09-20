/**
 * Factory HTTP batch — Desktop/C# main path without Electron IPC (D1).
 * Thin wrapper around engine-bridge.runEngineBatch + settings merge.
 */
const crypto = require('crypto');

/** @type {{ requestId: string, state: string, startedAt: number, finishedAt?: number, result?: object } | null} */
let activeBatch = null;

function getActiveBatch() {
    return activeBatch ? { ...activeBatch } : null;
}

function clearActiveBatch() {
    activeBatch = null;
    try {
        require('./engine-progress-emit').setFactoryBatchRequestId('');
    } catch (_) { /* ignore */ }
}

/**
 * @param {object} body
 * @param {{
 *   runEngineBatch?: Function,
 *   loadMergedOptions?: Function,
 *   getComputeStatus?: Function,
 *   emitProgress?: Function,
 * }} [deps]
 */
async function startFactoryBatch(body = {}, deps = {}) {
    if (activeBatch && activeBatch.state === 'running') {
        return {
            httpStatus: 409,
            body: {
                ok: false,
                code: 'busy',
                error: '已有批处理任务正在运行',
                requestId: activeBatch.requestId,
                holder: { kind: 'engine_batch', label: '引擎字幕任务', source: 'factory-batch' },
            },
        };
    }

    try {
        const lock = typeof deps.getComputeStatus === 'function'
            ? deps.getComputeStatus()
            : require('./compute-task-lock').getStatus();
        if (lock?.busy) {
            return {
                httpStatus: 409,
                body: {
                    ok: false,
                    code: 'busy',
                    error: lock.label
                        ? `已有${lock.label}正在运行，请稍后再试`
                        : '计算任务繁忙',
                    holder: {
                        kind: lock.kind || null,
                        owner: lock.owner || null,
                        source: lock.source || null,
                        label: lock.label || null,
                    },
                },
            };
        }
    } catch (_) { /* ignore */ }

    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) {
        return {
            httpStatus: 400,
            body: { ok: false, code: 'empty_items', error: '没有待处理文件' },
        };
    }

    const requestId = String(body.requestId || '').trim() || crypto.randomUUID();
    const emitProgress = typeof deps.emitProgress === 'function'
        ? deps.emitProgress
        : (evt) => {
            try {
                require('./editor-factory-progress').emit(requestId, evt);
            } catch (_) { /* ignore */ }
        };

    let options = body.options && typeof body.options === 'object' ? { ...body.options } : {};
    if (typeof deps.loadMergedOptions === 'function') {
        options = await deps.loadMergedOptions(options);
    } else {
        options = await defaultLoadMergedOptions(options);
    }

    activeBatch = {
        requestId,
        state: 'running',
        startedAt: Date.now(),
    };
    try {
        require('./engine-progress-emit').setFactoryBatchRequestId(requestId);
    } catch (_) { /* ignore */ }

    emitProgress({
        phase: 'accepted',
        message: '批处理已接受',
        itemCount: items.length,
    });

    // Fire-and-forget; client tracks via SSE + GET /batch/status.
    setImmediate(() => {
        runBatchBackground({
            requestId,
            items,
            options,
            minimizeToTray: !!body.minimizeToTray,
            deps,
            emitProgress,
        }).catch(() => { /* logged in runner */ });
    });

    return {
        httpStatus: 202,
        body: {
            ok: true,
            accepted: true,
            requestId,
            itemCount: items.length,
        },
    };
}

async function runBatchBackground({
    requestId,
    items,
    options,
    minimizeToTray,
    deps,
    emitProgress,
}) {
    const run = typeof deps.runEngineBatch === 'function'
        ? deps.runEngineBatch
        : async (payload) => {
            const engine = require('./engine-bridge');
            return engine.runEngineBatch(payload);
        };

    emitProgress({ phase: 'running', message: '批处理开始' });
    try {
        const result = await run({
            items,
            options,
            invokeSender: null,
            minimizeToTray: !!minimizeToTray,
        });
        if (activeBatch && activeBatch.requestId === requestId) {
            activeBatch = {
                ...activeBatch,
                state: result?.ok ? 'done' : 'error',
                finishedAt: Date.now(),
                result: result && typeof result === 'object' ? result : { ok: false },
            };
        }
        emitProgress({
            phase: result?.ok ? 'done' : 'error',
            message: result?.ok
                ? (result.message || '批处理完成')
                : (result?.error || '批处理失败'),
            ok: !!result?.ok,
            result: result || null,
        });
    } catch (err) {
        const message = err?.message || String(err);
        if (activeBatch && activeBatch.requestId === requestId) {
            activeBatch = {
                ...activeBatch,
                state: 'error',
                finishedAt: Date.now(),
                result: { ok: false, error: message },
            };
        }
        emitProgress({ phase: 'error', message, ok: false });
    } finally {
        try {
            require('./engine-progress-emit').setFactoryBatchRequestId('');
        } catch (_) { /* ignore */ }
        // Keep SSE channel buffered for late subscribers; TTL sweep cleans up.
    }
}

async function defaultLoadMergedOptions(payloadOptions = {}) {
    const { loadSettings } = require('./settings-data');
    const { mergeTransWithAiOptions, stripPostTaskFields } = require('./transwithai-options');
    const { mergeEngineOptions } = require('./engine-options');
    const getAppRoot = () => {
        try {
            const { app } = require('electron');
            return app.getAppPath();
        } catch (_) {
            return process.cwd();
        }
    };
    const saved = loadSettings(() => getAppRoot()).options || {};
    const merged = mergeTransWithAiOptions(mergeEngineOptions({
        ...stripPostTaskFields(saved),
        ...stripPostTaskFields(payloadOptions || {}),
    }));
    try {
        const engine = require('./engine-bridge');
        if (typeof engine.resolveEngineInstallPath === 'function') {
            merged.engineInstallPath = engine.resolveEngineInstallPath(merged.engineInstallPath);
        }
    } catch (_) { /* ignore */ }
    return merged;
}

const FACTORY_STRIP_OPTION_KEYS = [
    'advancedLicenseKey',
    'licensePrivateKey',
    'afdianToken',
    'advancedLicenseDoc',
];

function stripFactorySecretOptions(options = {}) {
    const out = { ...options };
    for (const key of FACTORY_STRIP_OPTION_KEYS) {
        delete out[key];
    }
    return out;
}

/**
 * Public options snapshot for C# Desktop (no secrets).
 * @param {{ loadSettings?: Function }} [deps]
 */
function getFactoryOptionsSnapshot(deps = {}) {
    try {
        const load = typeof deps.loadSettings === 'function'
            ? deps.loadSettings
            : () => require('./settings-data').loadSettings(() => process.cwd());
        const doc = load() || {};
        const options = doc.options && typeof doc.options === 'object' ? { ...doc.options } : {};
        return { ok: true, options: stripFactorySecretOptions(options) };
    } catch (err) {
        return { ok: false, error: err.message || String(err), options: {} };
    }
}

/**
 * PATCH/PUT options via the same normalize whitelist as the settings UI.
 * @param {object} body
 * @param {{
 *   replace?: boolean,
 *   loadSettings?: Function,
 *   saveOptions?: Function,
 *   buildFromPayload?: Function,
 * }} [deps]
 */
async function saveFactoryOptions(body = {}, deps = {}) {
    const rawPatch = body.options && typeof body.options === 'object'
        ? body.options
        : (body && typeof body === 'object' ? body : {});
    // License activation stays on Desktop/Electron UI — ignore via Factory.
    const patch = stripFactorySecretOptions(rawPatch);
    const replace = !!(deps.replace || body.replace || body.mode === 'replace');

    try {
        const getAppRoot = () => {
            try {
                const { app } = require('electron');
                return app.getAppPath();
            } catch (_) {
                return process.cwd();
            }
        };
        const load = typeof deps.loadSettings === 'function'
            ? deps.loadSettings
            : () => require('./settings-data').loadSettings(() => getAppRoot());
        const current = (load() || {}).options || {};
        const build = typeof deps.buildFromPayload === 'function'
            ? deps.buildFromPayload
            : (p, cur) => require('./transwithai-bridge').buildTransWithAiOptionsFromPayload(p, cur);

        const next = replace
            ? build(patch, {})
            : build(patch, current);

        const { stripPostTaskFields } = require('./transwithai-options');
        const toSave = stripPostTaskFields(next);

        if (typeof deps.saveOptions === 'function') {
            await deps.saveOptions(toSave);
        } else {
            const twai = require('./transwithai-bridge');
            await twai.saveTransWithAiOptions(() => getAppRoot(), toSave);
        }

        return {
            httpStatus: 200,
            body: {
                ok: true,
                replaced: replace,
                options: stripFactorySecretOptions(toSave),
            },
        };
    } catch (err) {
        return {
            httpStatus: 500,
            body: { ok: false, code: 'save_failed', error: err.message || String(err) },
        };
    }
}

function getFactoryBatchStatus(queryRequestId = '') {
    const want = String(queryRequestId || '').trim();
    let lock = { busy: false };
    try {
        lock = require('./compute-task-lock').getStatus() || lock;
    } catch (_) { /* ignore */ }

    if (!activeBatch) {
        return {
            ok: true,
            busy: !!lock.busy,
            state: 'idle',
            requestId: null,
            lock: lock.busy ? {
                kind: lock.kind || null,
                owner: lock.owner || null,
                label: lock.label || null,
                source: lock.source || null,
            } : null,
        };
    }

    if (want && want !== activeBatch.requestId) {
        return {
            ok: true,
            busy: !!lock.busy || activeBatch.state === 'running',
            state: 'other',
            requestId: activeBatch.requestId,
            message: '另有批处理会话',
        };
    }

    return {
        ok: true,
        busy: activeBatch.state === 'running' || !!lock.busy,
        state: activeBatch.state,
        requestId: activeBatch.requestId,
        startedAt: activeBatch.startedAt,
        finishedAt: activeBatch.finishedAt || null,
        result: activeBatch.state === 'running' ? null : (activeBatch.result || null),
    };
}

function noteFactoryBatchAborted() {
    if (activeBatch && activeBatch.state === 'running') {
        activeBatch = {
            ...activeBatch,
            state: 'error',
            finishedAt: Date.now(),
            result: { ok: false, code: 'aborted', error: '已取消' },
        };
        try {
            require('./editor-factory-progress').emit(activeBatch.requestId, {
                phase: 'error',
                ok: false,
                code: 'aborted',
                message: '已取消',
            });
        } catch (_) { /* ignore */ }
    }
    try {
        require('./engine-progress-emit').setFactoryBatchRequestId('');
    } catch (_) { /* ignore */ }
}

module.exports = {
    startFactoryBatch,
    getFactoryBatchStatus,
    getFactoryOptionsSnapshot,
    saveFactoryOptions,
    stripFactorySecretOptions,
    getActiveBatch,
    clearActiveBatch,
    noteFactoryBatchAborted,
    /** @private */
    _test: {
        setActiveBatch: (v) => { activeBatch = v; },
    },
};
