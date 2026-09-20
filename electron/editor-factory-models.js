/**
 * Factory HTTP model list / download for Desktop C# (D1).
 * Thin client over engine-bridge ensure + engine-client list/download SSE.
 */
const crypto = require('crypto');

/** @type {{ requestId: string, state: string, startedAt: number, finishedAt?: number, result?: object, abort?: AbortController } | null} */
let activeDownload = null;

function getActiveDownload() {
    return activeDownload
        ? {
            requestId: activeDownload.requestId,
            state: activeDownload.state,
            startedAt: activeDownload.startedAt,
            finishedAt: activeDownload.finishedAt,
            result: activeDownload.result,
        }
        : null;
}

function clearActiveDownload() {
    if (activeDownload?.abort) {
        try { activeDownload.abort.abort(); } catch (_) { /* ignore */ }
    }
    activeDownload = null;
}

/**
 * @param {object} [body]
 * @param {{
 *   ensureEngineRunning?: Function,
 *   listModels?: Function,
 *   listSakuraModels?: Function,
 *   loadMergedOptions?: Function,
 * }} [deps]
 */
async function listFactoryModels(body = {}, deps = {}) {
    try {
        const sakuraModels = typeof deps.listSakuraModels === 'function'
            ? deps.listSakuraModels()
            : require('./sakura-mt').listSakuraModelsForEngine();

        const options = typeof deps.loadMergedOptions === 'function'
            ? await deps.loadMergedOptions(body.options || body || {})
            : await defaultMergedOptions(body.options || body || {});

        const ensureFn = typeof deps.ensureEngineRunning === 'function'
            ? deps.ensureEngineRunning
            : (opts) => require('./engine-bridge').ensureEngineRunning(opts);
        const listFn = typeof deps.listModels === 'function'
            ? deps.listModels
            : (url, opts) => require('./engine-client').listModels(url, opts);

        const ensure = await ensureFn(options);
        if (!ensure.ok) {
            return {
                httpStatus: ensure.code === 'compute_busy' || ensure.code === 'busy' ? 409 : 503,
                body: {
                    ok: false,
                    error: ensure.error || 'engine unavailable',
                    code: ensure.code || 'no_engine',
                    models: sakuraModels,
                },
            };
        }

        const res = await listFn(ensure.baseUrl, { timeoutMs: 20000 });
        if (!res.ok) {
            return {
                httpStatus: 502,
                body: {
                    ok: false,
                    error: res.data?.message || res.data?.error || `列出模型失败 (HTTP ${res.status})`,
                    models: sakuraModels,
                    status: res.status,
                },
            };
        }

        return {
            httpStatus: 200,
            body: {
                ok: true,
                models: [
                    ...(Array.isArray(res.data?.models) ? res.data.models : []),
                    ...sakuraModels,
                ],
                profiles: res.data?.profiles || {},
            },
        };
    } catch (err) {
        return {
            httpStatus: 500,
            body: { ok: false, code: 'internal', error: err.message || String(err), models: [] },
        };
    }
}

async function defaultMergedOptions(payloadOptions = {}) {
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

/**
 * Async model download → 202 + SSE on requestId.
 * Uses engine `/v1/models/download` SSE (not the full Electron extras/pip path).
 */
async function startFactoryModelDownload(body = {}, deps = {}) {
    if (activeDownload && activeDownload.state === 'running') {
        return {
            httpStatus: 409,
            body: {
                ok: false,
                code: 'busy',
                error: '已有模型下载正在进行',
                requestId: activeDownload.requestId,
            },
        };
    }

    const modelIds = Array.isArray(body.modelIds)
        ? body.modelIds.map((id) => String(id || '').trim()).filter(Boolean)
        : [];
    if (!modelIds.length && !body.profile) {
        return {
            httpStatus: 400,
            body: { ok: false, code: 'empty_models', error: '未指定 modelIds 或 profile' },
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

    const abort = new AbortController();
    activeDownload = {
        requestId,
        state: 'running',
        startedAt: Date.now(),
        abort,
    };

    emitProgress({ phase: 'accepted', message: '下载已接受', modelIds });

    setImmediate(() => {
        runDownloadBackground({
            requestId,
            body,
            modelIds,
            deps,
            emitProgress,
            signal: abort.signal,
        }).catch(() => { /* handled inside */ });
    });

    return {
        httpStatus: 202,
        body: {
            ok: true,
            accepted: true,
            requestId,
            modelIds,
        },
    };
}

async function runDownloadBackground({
    requestId,
    body,
    modelIds,
    deps,
    emitProgress,
    signal,
}) {
    try {
        const options = typeof deps.loadMergedOptions === 'function'
            ? await deps.loadMergedOptions(body.options || {})
            : await defaultMergedOptions(body.options || {});

        const hfEndpoint = body.hfEndpoint != null
            ? String(body.hfEndpoint || '').trim().replace(/\/+$/, '')
            : String(options.engineHfEndpoint || '').trim().replace(/\/+$/, '');
        const hfToken = body.hfToken != null
            ? String(body.hfToken || '').trim()
            : String(options.engineHfToken || '').trim();
        const optionsWithHf = {
            ...options,
            engineHfEndpoint: hfEndpoint,
            engineHfToken: hfToken,
        };

        const ensureFn = typeof deps.ensureEngineRunning === 'function'
            ? deps.ensureEngineRunning
            : (opts) => require('./engine-bridge').ensureEngineRunning(opts);
        const streamFn = typeof deps.downloadModelsStream === 'function'
            ? deps.downloadModelsStream
            : (url, b, opts) => require('./engine-client').downloadModelsStream(url, b, opts);

        emitProgress({ phase: 'running', message: '正在启动引擎…' });
        const ensure = await ensureFn(optionsWithHf);
        if (!ensure.ok) {
            throw Object.assign(new Error(ensure.error || 'engine unavailable'), {
                code: ensure.code || 'no_engine',
            });
        }

        emitProgress({ phase: 'running', message: '开始下载模型…' });
        const res = await streamFn(ensure.baseUrl, {
            profile: body.profile || options.engineProfile,
            modelIds: modelIds.length ? modelIds : undefined,
            hfEndpoint,
            hfToken: hfToken || undefined,
            force: !!body.force,
        }, {
            timeoutMs: 1800000,
            signal,
            onEvent: (ev) => {
                emitProgress({
                    phase: 'progress',
                    message: ev?.message || ev?.detail || '下载中',
                    pct: ev?.pct ?? ev?.percent,
                    modelId: ev?.modelId || ev?.id,
                    raw: ev,
                });
            },
        });

        if (signal.aborted) {
            throw Object.assign(new Error('已取消'), { code: 'aborted' });
        }
        if (!res.ok) {
            throw Object.assign(
                new Error(res.data?.message || res.data?.error || `下载失败 (HTTP ${res.status})`),
                { code: res.data?.code || 'download_failed', status: res.status },
            );
        }

        if (activeDownload && activeDownload.requestId === requestId) {
            activeDownload = {
                requestId,
                state: 'done',
                startedAt: activeDownload.startedAt,
                finishedAt: Date.now(),
                result: { ok: true, ...(res.data || {}) },
            };
        }
        emitProgress({
            phase: 'done',
            ok: true,
            message: '模型下载完成',
            result: res.data || null,
        });
    } catch (err) {
        const aborted = err?.code === 'aborted' || (err?.name === 'AbortError');
        const message = err?.message || String(err);
        if (activeDownload && activeDownload.requestId === requestId) {
            activeDownload = {
                requestId,
                state: aborted ? 'error' : 'error',
                startedAt: activeDownload.startedAt,
                finishedAt: Date.now(),
                result: {
                    ok: false,
                    code: aborted ? 'aborted' : (err?.code || 'download_failed'),
                    error: message,
                },
            };
        }
        emitProgress({
            phase: 'error',
            ok: false,
            code: aborted ? 'aborted' : (err?.code || 'download_failed'),
            message,
        });
    }
}

function getFactoryDownloadStatus(queryRequestId = '') {
    const want = String(queryRequestId || '').trim();
    if (!activeDownload) {
        return { ok: true, busy: false, state: 'idle', requestId: null };
    }
    if (want && want !== activeDownload.requestId) {
        return {
            ok: true,
            busy: activeDownload.state === 'running',
            state: 'other',
            requestId: activeDownload.requestId,
        };
    }
    return {
        ok: true,
        busy: activeDownload.state === 'running',
        state: activeDownload.state,
        requestId: activeDownload.requestId,
        startedAt: activeDownload.startedAt,
        finishedAt: activeDownload.finishedAt || null,
        result: activeDownload.state === 'running' ? null : (activeDownload.result || null),
    };
}

function noteFactoryDownloadAborted() {
    if (activeDownload?.abort) {
        try { activeDownload.abort.abort(); } catch (_) { /* ignore */ }
    }
    if (activeDownload && activeDownload.state === 'running') {
        const id = activeDownload.requestId;
        activeDownload = {
            requestId: id,
            state: 'error',
            startedAt: activeDownload.startedAt,
            finishedAt: Date.now(),
            result: { ok: false, code: 'aborted', error: '已取消' },
        };
        try {
            require('./editor-factory-progress').emit(id, {
                phase: 'error',
                ok: false,
                code: 'aborted',
                message: '已取消',
            });
        } catch (_) { /* ignore */ }
    }
}

module.exports = {
    listFactoryModels,
    startFactoryModelDownload,
    getFactoryDownloadStatus,
    getActiveDownload,
    clearActiveDownload,
    noteFactoryDownloadAborted,
    /** @private */
    _test: {
        setActiveDownload: (v) => { activeDownload = v; },
    },
};
