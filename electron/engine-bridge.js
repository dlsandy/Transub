/**
 * Transub Engine bridge — spawn local engine HTTP server and run subtitle jobs.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadSettings, saveSettings } = require('./settings-data');
const {
    mergeEngineOptions,
    mapTaskToEngineTask,
    usesExternalMt,
    isApiCompatible,
    resolveEngineInstallPath,
    DEFAULT_ENGINE_URL,
} = require('./engine-options');
const { getBundledEnginePath, getBundledEnginePathIfPresent, isValidEngineRoot } = require('./app-paths');
const { normalizeHfEndpoint, buildHubUrls } = require('./engine-download-urls');
const {
    resolvePythonCommand,
    resolveEngineRuntimePython,
    resolveEngineEntrypoints,
    findEngineBundledFfmpeg,
    injectNvidiaCudaPathEnv,
    injectFfmpegPathEnv,
} = require('./engine-runtime-env');
const {
    modelIdsNeedWhisperExtras,
    modelIdsNeedSensevoiceExtras,
    modelIdsNeedQwenExtras,
    ensureRuntimeExtrasOffline,
    ensureAsrWhisperOffline,
    ensureAsrSensevoiceOffline,
    ensureAsrQwen3Offline,
} = require('./engine-runtime-extras');
const { omitRetiredEngineModels } = require('./engine-asr-aliases');
const downloadInfo = require('./engine-download-info');
const {
    resolveDownloadModelIds,
    manualPlaceHintForModel,
    normalizeEngineDownloadKind,
    getEngineModelsRoot,
    buildEngineDownloadInfo: buildEngineDownloadInfoCore,
} = downloadInfo;

async function buildEngineDownloadInfo(payload = {}) {
    return buildEngineDownloadInfoCore(payload, {
        mergeEngineOptions,
        resolveEngineInstallPath,
        ensureEngineRunning,
        listModels,
        buildHubUrls,
        normalizeHfEndpoint,
    });
}
const {
    normalizeEngineLogLine,
    shouldDropEngineLogLine,
    friendlyEngineError,
} = require('./engine-log-filter');
const {
    mapEngineStageToItemStage,
    engineStageZh,
    buildUiProgress,
    remapBridgeProgress,
    extractOutputPaths,
    mapEngineResultsToHistoryOutputs,
    getTranslateProgressSession,
    resetTranslateProgressSession,
    softenTranslateProgressFields,
} = require('./engine-job-progress');
const {
    parseHostPort,
    mapDeviceForEngine,
    sleep,
    waitForHealth: waitForHealthPoll,
} = require('./engine-spawn-utils');
const {
    interpretCreateJobResponse,
    interpretWaitJobResult,
    shouldContinueBatchAfterItemCancel,
    progressFieldsFromWaitEvent,
    sanitizeBatchEngineSseProgress,
    resolveFileMtPlan,
    buildFailedItemResult,
    buildCancelledItemResult,
    buildSkippedItemResult,
    summarizeAsrRunMeta,
    appendAsrRunToDetail,
} = require('./engine-batch-item');
const {
    getHealth,
    getCapabilities,
    listModels,
    recommendModels,
    detectLanguage,
    translateCuesMt,
    downloadModels,
    deleteModels,
    downloadModelsStream,
    getGpuRuntime,
    getAsrWhisperRuntime,
    ensureGpuRuntime,
    ensureGpuRuntimeStream,
    scanSystemCuda,
    adoptSystemCuda,
    releaseGpuMemory,
    getAudioSeparateRuntime,
    ensureAudioSeparateRuntime,
    ensureAudioSeparateRuntimeStream,
    createJob,
    cancelJob,
    resumeJob,
    getJobCheckpoint,
    waitJob,
} = require('./engine-client');
const {
    runEngineJobWithAsrFailover,
    resumeEngineJobAndWait,
    attachCheckpointResumeHint,
} = require('./engine-run-asr-job');
const rangeAsrPolicy = require('./engine-range-asr-policy');
const { resolveQwenAsrBatchModeForJob } = require('./engine-qwen-batch');
const { sampleJobGpuVramHint } = require('./engine-gpu-vram-hint');
const {
    resolveReleaseGpuAfterForBatchItem,
    shouldReleaseGpuAfterQwenBatch,
    shouldReleaseGpuAfterBatch,
    isQwenAsrModelId,
} = require('./engine-release-gpu-policy');
const {
    summarizeDomainFixChanges,
    formatDomainFixLogLine,
} = require('./asr-domain-fix-trace');
const { exportAsrDiagnosticsPack } = require('./asr-diagnostics-export');
const batchRecovery = require('../src/js/batch-recovery-core');
const { mergeTransWithAiOptions, stripPostTaskFields } = require('./transwithai-options');
const { mergeSenseOverrides, sanitizeSakuraMtForLanguage } = require('../src/js/content-profile-core');
const { mergeTranslateStyleOverrides } = require('../src/js/translate-style-core');
const { buildVadJobOptions, buildAudioJobOptions } = require('./engine-audio-options');
const {
    resolveEngineSubFormats,
    buildEngineGlossaryPairs,
    buildEngineAsrGlossaryPairs,
    buildEngineAsrHintsFromGlossary,
    buildEngineJobFlags,
    buildExternalMtJobFields,
    resolveExternalMtAdapterCall,
} = require('./engine-job-options');
const { startEngineMtAdapter } = require('./engine-mt-adapter');
const {
    broadcastEngineDownloadProgress,
} = require('./download-window');
const { registerLocalWhlIpc } = require('./local-whl-ipc');
const { createEngineLogIo } = require('./engine-log-io');
const { createEngineProcessLifecycle } = require('./engine-process-lifecycle');
const { createProgressEmitter } = require('./engine-progress-emit');
const { createEngineBatchHistory } = require('./engine-batch-history');
const batchMtPlan = require('./engine-batch-mt-plan');
const batchPostprocessPlan = require('./engine-batch-postprocess-plan');
const { createEngineBatchLoop } = require('./engine-batch-loop');
const { createEngineRangeTranscribe } = require('./engine-range-transcribe');
const { createEngineDownloadJob } = require('./engine-download-job');
const { createEngineEnsureRunning } = require('./engine-ensure-running');

/** Prefer installed ASR weights for failover; always keep the primary id. */
function resolveAsrFailoverCandidates(primaryAsr, engineInstallPath, options = {}) {
    const chain = rangeAsrPolicy.buildBatchAsrCandidates(primaryAsr, {
        perfProfile: options.perfProfile,
        maxCandidates: options.maxCandidates,
    });
    let installedIds = null;
    try {
        const installRoot = String(engineInstallPath || '').trim();
        if (installRoot) {
            const { listInstalledAsrIds } = require('./env-check');
            installedIds = listInstalledAsrIds(installRoot);
        }
    } catch (_) {
        installedIds = null;
    }
    return rangeAsrPolicy.filterAsrCandidatesByInstalled(chain, installedIds, { primaryAsr });
}

/** Short clip retranscribe — cap models; skip sibling-Qwen churn on ASR_EMPTY. */
function resolveRangeAsrFailoverCandidates(primaryAsr, engineInstallPath) {
    const chain = rangeAsrPolicy.buildRangeRetranscribeAsrCandidates(primaryAsr);
    let installedIds = null;
    try {
        const installRoot = String(engineInstallPath || '').trim();
        if (installRoot) {
            const { listInstalledAsrIds } = require('./env-check');
            installedIds = listInstalledAsrIds(installRoot);
        }
    } catch (_) {
        installedIds = null;
    }
    return rangeAsrPolicy.filterAsrCandidatesByInstalled(chain, installedIds, { primaryAsr });
}

let engineProc = null;
let engineBaseUrl = DEFAULT_ENGINE_URL;
let batchCancelled = false;
/** Stop the in-flight file only; batch loop continues with remaining items. */
let itemCancelled = false;
let batchRunning = false;
let currentJobId = '';
/** @type {((name: string) => void) | null} */
let ensureBridgeFn = null;
/** @type {AbortController | null} */
let batchMtAbortController = null;
/** Aborts in-flight post-task LLM / QC loop when the user hits stop. */
/** @type {AbortController|null} */
let itemWorkAbortController = null;
/** @type {AbortController|null} */
let downloadAbort = null;
let downloadBusy = false;
/** @type {AbortController|null} */
let opusTextAbortController = null;

const engineLogIo = createEngineLogIo({
    emitLine(payload, invokeSender) {
        emitToSubtitleUi('transwithai-infer-log', payload, invokeSender);
        emitToSubtitleUi('transub-engine-infer-log', payload, invokeSender);
    },
});
const {
    getEngineLogPath,
    resetEngineLogFile,
    flushDroppedEngineLogSummary,
    flushEngineLogRepeats,
    flushEngineLogWriteQueue,
    appendEngineLogLineRaw,
    appendEngineLogLine,
    flushEngineLogChunk,
    attachEngineProcessLogs,
    openEngineLatestLog,
} = engineLogIo;

const engineLifecycle = createEngineProcessLifecycle({
    getProc: () => engineProc,
    setProc: (p) => { engineProc = p; },
    getBaseUrl: () => engineBaseUrl,
    parseHostPort,
    defaultUrl: DEFAULT_ENGINE_URL,
    appendEngineLogLine,
    releaseGpuMemory,
    mergeEngineOptions,
    sleep,
});
const {
    stopEngineProcess,
    stopEngineProcessAndPort,
    stopLlamaServerQuiet,
    reclaimLocalComputeAfterEngineBatch,
    killListenersOnPort,
    releaseEngineVramBeforeLocalLlm,
} = engineLifecycle;

const {
    ensureEngineRunning,
    readEngineEnsurePolicy,
    isEngineChildAlive,
    waitForHealth,
} = createEngineEnsureRunning({
    getEngineProc: () => engineProc,
    setEngineProc: (p) => { engineProc = p; },
    getEngineBaseUrl: () => engineBaseUrl,
    setEngineBaseUrl: (u) => { engineBaseUrl = u; },
    getBatchRunning: () => batchRunning,
    mergeEngineOptions,
    resolveEngineInstallPath,
    DEFAULT_ENGINE_URL,
    parseHostPort,
    stopEngineProcess,
    stopEngineProcessAndPort,
    killListenersOnPort,
    sleep,
    getHealth,
    waitForHealthPoll,
    isApiCompatible,
    appendEngineLogLine,
    resolveEngineEntrypoints,
    getBundledEnginePath,
    injectFfmpegPathEnv,
    resetEngineLogFile,
    attachEngineProcessLogs,
});

let engineUiWindowManager = null;

const progressEmitter = createProgressEmitter({
    getWindowManager: () => engineUiWindowManager,
    appendEngineLogLine,
});
const {
    getMainWebContents,
    emitToSubtitleUi,
    sendProgress,
} = progressEmitter;

const engineBatchHistory = createEngineBatchHistory({
    buildEngineGlossaryPairs,
    buildEngineAsrGlossaryPairs,
    buildEngineAsrHintsFromGlossary,
    readBatchMergedGlossary: (opts) => {
        const { readBatchMergedGlossary } = require('./glossary-data');
        return readBatchMergedGlossary(opts);
    },
    getAbortController: () => batchMtAbortController,
    setAbortController: (c) => { batchMtAbortController = c; },
    stripPostTaskFields,
    mapEngineResultsToHistoryOutputs,
});
const {
    loadEngineGlossaryPairs,
    loadEngineAsrExtras,
    abortBatchMtAdapter,
    recordEngineBatchHistory,
} = engineBatchHistory;

async function runEngineBatch({ items, options, invokeSender, minimizeToTray = false }) {
    if (batchRunning) {
        return { ok: false, error: '已有字幕任务正在运行', code: 'compute_busy' };
    }
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return { ok: false, error: '没有待处理文件' };

    const merged = mergeTransWithAiOptions(mergeEngineOptions(options || {}));
    merged.engineInstallPath = resolveEngineInstallPath(merged.engineInstallPath);
    const paths = list
        .map((item) => path.resolve(String(item?.fullPath || item?.path || '').trim()))
        .filter(Boolean);
    if (!paths.length) return { ok: false, error: '没有待处理文件' };

    const computeLock = require('./compute-task-lock');
    return computeLock.runWithComputeLock({
        kind: 'engine_batch',
        owner: '引擎',
        source: 'runEngineBatch',
    }, () => runEngineBatchLocked({
        list,
        paths,
        merged,
        invokeSender,
        minimizeToTray,
    }));
}

function getEngineBatchLoop() {
    return createEngineBatchLoop({
        get batchCancelled() { return batchCancelled; },
        set batchCancelled(v) { batchCancelled = v; },
        get itemCancelled() { return itemCancelled; },
        set itemCancelled(v) { itemCancelled = v; },
        get batchRunning() { return batchRunning; },
        set batchRunning(v) { batchRunning = v; },
        get currentJobId() { return currentJobId; },
        set currentJobId(v) { currentJobId = v; },
        get batchMtAbortController() { return batchMtAbortController; },
        set batchMtAbortController(v) { batchMtAbortController = v; },
        get itemWorkAbortController() { return itemWorkAbortController; },
        set itemWorkAbortController(v) { itemWorkAbortController = v; },
        get engineUiWindowManager() { return engineUiWindowManager; },
        abortBatchMtAdapter,
        appendAsrRunToDetail,
        appendEngineLogLine,
        attachCheckpointResumeHint,
        batchMtPlan,
        batchPostprocessPlan,
        batchRecovery,
        buildAudioJobOptions,
        buildCancelledItemResult,
        shouldContinueBatchAfterItemCancel,
        buildEngineJobFlags,
        buildExternalMtJobFields,
        buildFailedItemResult,
        buildSkippedItemResult,
        buildVadJobOptions,
        createJob,
        emitToSubtitleUi,
        engineBatchHistory,
        ensureEngineRunning,
        extractOutputPaths,
        findEngineBundledFfmpeg,
        formatDomainFixLogLine,
        friendlyEngineError,
        getHealth,
        getJobCheckpoint,
        getTranslateProgressSession,
        interpretWaitJobResult,
        isQwenAsrModelId,
        mapDeviceForEngine,
        mapTaskToEngineTask,
        mergeSenseOverrides,
        mergeTranslateStyleOverrides,
        progressFieldsFromWaitEvent,
        reclaimLocalComputeAfterEngineBatch,
        recordEngineBatchHistory,
        releaseGpuMemory,
        remapBridgeProgress,
        resetTranslateProgressSession,
        resolveAsrFailoverCandidates,
        resolveEngineSubFormats,
        resolveExternalMtAdapterCall,
        resolveFileMtPlan,
        resolveQwenAsrBatchModeForJob,
        resolveReleaseGpuAfterForBatchItem,
        runEngineJobWithAsrFailover,
        sampleJobGpuVramHint,
        sanitizeBatchEngineSseProgress,
        sanitizeSakuraMtForLanguage,
        sendProgress,
        shouldReleaseGpuAfterQwenBatch,
        shouldReleaseGpuAfterBatch,
        softenTranslateProgressFields,
        startEngineMtAdapter,
        stopEngineProcessAndPort,
        summarizeAsrRunMeta,
        summarizeDomainFixChanges,
        usesExternalMt,
        waitJob,
        deferredEnsureTwai,
    });
}

async function runEngineBatchLocked(args) {
    return getEngineBatchLoop().runEngineBatchLocked(args);
}

function getEngineRangeTranscribe() {
    return createEngineRangeTranscribe({
        get batchCancelled() { return batchCancelled; },
        set batchCancelled(v) { batchCancelled = v; },
        get itemCancelled() { return itemCancelled; },
        set itemCancelled(v) { itemCancelled = v; },
        get batchRunning() { return batchRunning; },
        set batchRunning(v) { batchRunning = v; },
        get currentJobId() { return currentJobId; },
        set currentJobId(v) { currentJobId = v; },
        appendEngineLogLine,
        buildAudioJobOptions,
        buildVadJobOptions,
        createJob,
        ensureEngineRunning,
        friendlyEngineError,
        mapDeviceForEngine,
        mapTaskToEngineTask,
        mergeEngineOptions,
        rangeAsrPolicy,
        releaseGpuMemory,
        resolveQwenAsrBatchModeForJob,
        resolveRangeAsrFailoverCandidates,
        sampleJobGpuVramHint,
        waitJob,
    });
}

async function transcribeRangeWithEngine(payload = {}, deps = {}) {
    return getEngineRangeTranscribe().transcribeRangeWithEngine(payload, deps);
}


function setupEngineBridge(api, {
    getAppRoot,
    windowManager = null,
    ensureBridge = null,
} = {}) {
    const { register } = api;
    engineUiWindowManager = windowManager || null;
    ensureBridgeFn = typeof ensureBridge === 'function' ? ensureBridge : null;
    setupComputeTaskStatusIpc(register);

    async function readMergedOptions(payload = {}) {
        const saved = loadSettings(() => getAppRoot()).options || {};
        const merged = mergeTransWithAiOptions(mergeEngineOptions({
            ...stripPostTaskFields(saved),
            ...stripPostTaskFields(payload || {}),
        }));
        merged.engineInstallPath = resolveEngineInstallPath(merged.engineInstallPath);
        return merged;
    }

    let engineDownloadJob = null;
    function getEngineDownloadJob() {
        if (!engineDownloadJob) {
            engineDownloadJob = createEngineDownloadJob({
                getBatchRunning: () => batchRunning,
                getDownloadBusy: () => downloadBusy,
                setDownloadBusy: (v) => { downloadBusy = v; },
                getDownloadAbort: () => downloadAbort,
                setDownloadAbort: (v) => { downloadAbort = v; },
                getEngineProc: () => engineProc,
                normalizeEngineDownloadKind,
                broadcastEngineDownloadProgress,
                readMergedOptions,
                stopEngineProcessAndPort,
                stopEngineProcess,
                sleep,
                ensureEngineRunning,
                resolveEngineInstallPath,
                resolveEngineRuntimePython,
                DEFAULT_ENGINE_URL,
                modelIdsNeedWhisperExtras,
                modelIdsNeedSensevoiceExtras,
                modelIdsNeedQwenExtras,
                ensureAsrWhisperOffline,
                ensureAsrSensevoiceOffline,
                ensureAsrQwen3Offline,
                ensureAudioSeparateRuntimeStream,
                getAudioSeparateRuntime,
                ensureGpuRuntimeStream,
                getGpuRuntime,
                downloadModelsStream,
            });
        }
        return engineDownloadJob;
    }

    /** Capture UI post-task (shutdown/quit/sleep/…) before options are stripped for the engine. */
    function syncEngineSessionPostTask(payloadOptions = {}) {
        try {
            deferredEnsureTwai();
            const { setSessionPostTaskOptions } = require('./transwithai-bridge');
            if (typeof setSessionPostTaskOptions === 'function') {
                setSessionPostTaskOptions(payloadOptions || {});
            }
        } catch (err) {
            console.warn('[engine] sync post-task failed:', err?.message || err);
        }
    }

    // transub-engine-bundled-path is registered as cold IPC in main.js
    // so startup path fill does not load engine-bridge.

    register('transub-engine-validate', async (_event, payload = {}) => {
        try {
            const options = await readMergedOptions(payload);
            const ensure = await ensureEngineRunning(options);
            if (!ensure.ok) return ensure;
            const caps = await getCapabilities(ensure.baseUrl);
            return {
                ok: true,
                baseUrl: ensure.baseUrl,
                health: ensure.health,
                capabilities: caps.data || null,
                spawned: !!ensure.spawned,
                version: ensure.health?.engineVersion || '',
            };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-list-models', async (_event, payload = {}) => {
        try {
            const sakuraMt = require('./sakura-mt');
            const sakuraModels = sakuraMt.listSakuraModelsForEngine();
            const options = await readMergedOptions(payload);
            const ensure = await ensureEngineRunning(options);
            if (!ensure.ok) {
                return {
                    ...ensure,
                    // Still expose free Sakura so MT dropdown works offline from engine.
                    models: sakuraModels,
                };
            }
            const res = await listModels(ensure.baseUrl);
            if (!res.ok) {
                return {
                    ok: false,
                    error: res.data?.message || res.data?.error || `列出模型失败 (HTTP ${res.status})`,
                    status: res.status,
                    raw: res.data,
                    models: sakuraModels,
                };
            }
            return {
                ok: true,
                models: omitRetiredEngineModels([
                    ...(Array.isArray(res.data?.models) ? res.data.models : []),
                    ...sakuraModels,
                ]),
                profiles: res.data?.profiles || {},
                raw: res.data,
            };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-delete-models', async (_event, payload = {}) => {
        try {
            if (batchRunning) {
                return { ok: false, error: '字幕任务进行中，请先停止任务再删除模型' };
            }
            if (downloadBusy) {
                return { ok: false, error: '已有下载任务正在进行，请稍后再删除' };
            }
            const engineDelete = require('./engine-delete-model');
            const modelIds = engineDelete.uniqueIds(
                Array.isArray(payload.modelIds) ? payload.modelIds : [],
            );
            if (!modelIds.length) {
                return { ok: false, error: '未指定要删除的模型' };
            }

            const options = await readMergedOptions(payload);
            const rowsById = {};
            try {
                const ensureList = await ensureEngineRunning(options);
                if (ensureList.ok) {
                    const listRes = await listModels(ensureList.baseUrl, { timeoutMs: 15000 });
                    if (listRes.ok && Array.isArray(listRes.data?.models)) {
                        for (const m of listRes.data.models) {
                            const id = String(m?.id || '').trim();
                            if (id) rowsById[id] = m;
                        }
                    }
                }
            } catch (_) { /* list optional */ }

            try {
                stopEngineProcessAndPort();
            } catch {
                try { stopEngineProcess(); } catch { /* ignore */ }
            }
            await sleep(800);

            const deleteViaEngine = async (engineIds) => {
                const ensure = await ensureEngineRunning(options);
                if (!ensure.ok) return { ok: false, error: ensure.error || 'engine unavailable' };
                const res = await deleteModels(ensure.baseUrl, { modelIds: engineIds }, {
                    timeoutMs: 120000,
                });
                if (!res.ok) {
                    return {
                        ok: false,
                        error: res.data?.message || res.data?.error || `删除失败 (HTTP ${res.status})`,
                        failed: engineIds.map((id) => ({
                            id,
                            error: res.data?.message || res.data?.error || 'delete failed',
                        })),
                    };
                }
                return {
                    ok: true,
                    deleted: res.data?.deleted || [],
                    skipped: res.data?.skipped || [],
                    failed: res.data?.failed || [],
                };
            };

            return await engineDelete.deleteModelsBatch(modelIds, options, {
                rowsById,
                deleteViaEngine,
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-recommend', async (_event, payload = {}) => {
        try {
            const options = await readMergedOptions(payload);
            const ensure = await ensureEngineRunning(options);
            if (!ensure.ok) return ensure;
            const res = await recommendModels(ensure.baseUrl, payload.body || payload || {});
            if (!res.ok) {
                return {
                    ok: false,
                    error: res.data?.message || res.data?.error || `推荐失败 (HTTP ${res.status})`,
                    status: res.status,
                };
            }
            return { ok: true, ...(res.data || {}) };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-detect-language', async (_event, payload = {}) => {
        try {
            if (batchRunning) {
                return { ok: false, error: '字幕任务运行中，暂不探测语种' };
            }
            const options = await readMergedOptions(payload.options || payload || {});
            const mediaPath = String(payload.mediaPath || payload.path || '').trim();
            if (!mediaPath) return { ok: false, error: '未指定媒体路径' };
            const ensure = await ensureEngineRunning(options);
            if (!ensure.ok) return ensure;
            const res = await detectLanguage(ensure.baseUrl, {
                mediaPath,
                asrModel: payload.asrModel || options.engineAsrModel || undefined,
                device: payload.device || options.device || 'auto',
                durationSec: Math.max(3, Math.min(30, Number(payload.durationSec) || 12)),
                startSec: Math.max(0, Math.min(3600, Number(payload.startSec) || 0)),
            }, { timeoutMs: 600000 });
            if (!res.ok) {
                return {
                    ok: false,
                    error: res.data?.message || res.data?.error || `语种探测失败 (HTTP ${res.status})`,
                    status: res.status,
                    code: res.data?.code,
                };
            }
            return { ok: true, ...(res.data || {}) };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-translate-cues', async (event, payload = {}) => {
        try {
            return await translateCuesWithEngineOpus(payload || {}, {
                onProgress: (progress) => {
                    try {
                        if (!event?.sender?.isDestroyed?.()) {
                            event.sender.send('transub-engine-translate-progress', progress);
                        }
                    } catch (_) { /* ignore */ }
                },
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-download-models', async (_event, payload = {}) => {
        try {
            const options = await readMergedOptions(payload);
            const hfEndpoint = payload.hfEndpoint != null
                ? String(payload.hfEndpoint || '').trim().replace(/\/+$/, '')
                : String(options.engineHfEndpoint || '').trim().replace(/\/+$/, '');
            const hfToken = payload.hfToken != null
                ? String(payload.hfToken || '').trim()
                : String(options.engineHfToken || '').trim();
            const optionsWithHf = {
                ...options,
                engineHfEndpoint: hfEndpoint,
                engineHfToken: hfToken,
            };
            // Restart managed engine so HF_ENDPOINT is applied before Hub downloads.
            if (engineProc) {
                stopEngineProcess();
                await sleep(600);
            }
            const ensure = await ensureEngineRunning(optionsWithHf);
            if (!ensure.ok) return ensure;
            const modelIds = Array.isArray(payload.modelIds)
                ? payload.modelIds.map((id) => String(id || '').trim()).filter(Boolean)
                : undefined;
            const res = await downloadModels(ensure.baseUrl, {
                profile: payload.profile || options.engineProfile,
                modelIds,
                hfEndpoint,
                hfToken: hfToken || undefined,
                force: !!payload.force,
            }, { timeoutMs: 600000 });
            if (!res.ok) {
                const rawMsg = res.data?.message || res.data?.error || `模型下载失败 (HTTP ${res.status})`;
                const hint = /connecttimeout|10060|timed out|internet connection|connection reset|10054/i.test(String(rawMsg))
                    && !hfEndpoint
                    ? '（可在设置中填写 Hugging Face 镜像 https://hf-mirror.com 后重试）'
                    : /gated|authorized list|门禁/i.test(String(rawMsg)) && !hfToken
                        ? '（请在设置 → 网络填写 Hugging Face Token，并在官网同意模型条款后重试）'
                        : '';
                return {
                    ok: false,
                    error: `${rawMsg}${hint}`,
                    code: res.data?.code || '',
                    status: res.status,
                    raw: res.data,
                };
            }
            return { ok: true, ...(res.data || {}), status: res.status };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-gpu-status', async (_event, payload = {}) => {
        try {
            const options = await readMergedOptions(payload);
            const ensure = await ensureEngineRunning(options);
            if (!ensure.ok) return ensure;
            const res = await getGpuRuntime(ensure.baseUrl, { timeoutMs: 20000 });
            if (!res.ok) {
                return {
                    ok: false,
                    error: res.data?.message || res.data?.error || `GPU 状态查询失败 (HTTP ${res.status})`,
                    status: res.status,
                    raw: res.data,
                };
            }
            // Keep probe `status` (ready/partial/…); HTTP code goes to httpStatus.
            return { ok: true, ...(res.data || {}), httpStatus: res.status };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-scan-cuda', async (_event, payload = {}) => {
        try {
            const options = await readMergedOptions(payload);
            const ensure = await ensureEngineRunning(options);
            if (!ensure.ok) return ensure;
            const major = Number(payload?.major) || 12;
            const res = await scanSystemCuda(ensure.baseUrl, { major, timeoutMs: 45000 });
            if (!res.ok) {
                return {
                    ok: false,
                    error: res.data?.message || res.data?.error || `扫描失败 (HTTP ${res.status})`,
                    status: res.status,
                    raw: res.data,
                };
            }
            return { ok: true, ...(res.data || {}), status: res.status };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-adopt-cuda', async (_event, payload = {}) => {
        try {
            const options = await readMergedOptions(payload);
            const ensure = await ensureEngineRunning(options);
            if (!ensure.ok) return ensure;
            const major = Number(payload?.major) || 12;
            const res = await adoptSystemCuda(ensure.baseUrl, { major, timeoutMs: 180000 });
            if (!res.ok) {
                return {
                    ok: false,
                    error: res.data?.message || res.data?.error || `复用失败 (HTTP ${res.status})`,
                    status: res.status,
                    raw: res.data,
                };
            }
            // Restart so PATH / LoadLibrary picks up adopted bins.
            if (engineProc) {
                stopEngineProcess();
                await sleep(600);
                await ensureEngineRunning({ ...options, forceRestart: true });
            }
            return { ok: true, ...(res.data || {}), status: res.status };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-pick-cuda-root', async (event) => {
        try {
            const { dialog, BrowserWindow } = require('electron');
            const cudaScan = require('./cuda-runtime-scan');
            const { getWritableRoot } = require('./app-paths');
            const win = BrowserWindow.fromWebContents(event.sender);
            const picked = await dialog.showOpenDialog(win || undefined, {
                title: '选择含 CUDA 运行库的目录',
                message: '请选择含 cudart64_*.dll / cublas64_*.dll 的目录，或含 nvidia\\cuda_runtime\\bin 的 site-packages',
                properties: ['openDirectory'],
            });
            if (picked.canceled || !picked.filePaths?.length) {
                return { ok: false, cancelled: true };
            }
            const dir = path.resolve(String(picked.filePaths[0] || '').trim());
            if (!dir || !fs.existsSync(dir)) {
                return { ok: false, error: '目录无效' };
            }
            // Accept flat companion dir, nvidia tree, or site-packages parent.
            const candidates = [
                dir,
                path.join(dir, 'bin'),
                path.join(dir, 'nvidia'),
                path.basename(dir).toLowerCase() === 'nvidia' ? path.dirname(dir) : '',
                path.join(dir, 'Lib', 'site-packages'),
                path.join(dir, 'lib', 'site-packages'),
                path.join(dir, 'site-packages'),
            ].filter(Boolean);
            let savedRoot = dir;
            let scanHit = false;
            for (const major of [12, 13]) {
                for (const root of candidates) {
                    const scan = cudaScan.scanReusableCudaRuntimes({
                        major,
                        extraRoots: [root],
                        includePath: false,
                        env: { PATH: '' },
                    });
                    if (scan.ok && scan.best) {
                        savedRoot = root;
                        scanHit = true;
                        break;
                    }
                }
                if (scanHit) break;
            }
            const writable = getWritableRoot();
            const saved = cudaScan.addPersistedCudaExtraRoot(writable, savedRoot);
            if (!saved.ok) {
                return { ok: false, error: saved.error || '保存扫描目录失败' };
            }
            return {
                ok: true,
                dir: savedRoot,
                verified: scanHit,
                roots: saved.roots,
                message: scanHit
                    ? `已加入 CUDA 扫描目录：${savedRoot}`
                    : `已记录目录 ${savedRoot}（当前未检出齐全 companion DLL，仍会参与下次扫描）`,
            };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-asr-whisper-status', async (_event, payload = {}) => {
        try {
            const options = await readMergedOptions(payload);
            const ensure = await ensureEngineRunning(options);
            if (!ensure.ok) return ensure;
            const res = await getAsrWhisperRuntime(ensure.baseUrl, { timeoutMs: 20000 });
            if (!res.ok) {
                return {
                    ok: false,
                    error: res.data?.message || res.data?.error
                        || `Whisper 运行库查询失败 (HTTP ${res.status})`,
                    status: res.status,
                    raw: res.data,
                };
            }
            return { ok: true, ...(res.data || {}), status: res.status };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-audio-separate-status', async (_event, payload = {}) => {
        try {
            const options = await readMergedOptions(payload);
            const ensure = await ensureEngineRunning(options);
            if (!ensure.ok) return ensure;
            const res = await getAudioSeparateRuntime(ensure.baseUrl, { timeoutMs: 20000 });
            if (!res.ok) {
                return {
                    ok: false,
                    error: res.data?.message || res.data?.error
                        || `Demucs 状态查询失败 (HTTP ${res.status})`,
                    status: res.status,
                    raw: res.data,
                };
            }
            return { ok: true, ...(res.data || {}), status: res.status };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-ensure-gpu', async (_event, payload = {}) => {
        try {
            const options = await readMergedOptions(payload);
            // Restart so pip-installed nvidia/* wheels are visible to a fresh process PATH.
            if (engineProc) {
                stopEngineProcess();
                await sleep(600);
            }
            const ensure = await ensureEngineRunning(options);
            if (!ensure.ok) return ensure;
            const res = await ensureGpuRuntime(ensure.baseUrl, {
                force: !!payload.force,
            }, { timeoutMs: 1800000 });
            if (!res.ok) {
                return {
                    ok: false,
                    error: res.data?.message || res.data?.error || `GPU 支持安装失败 (HTTP ${res.status})`,
                    code: res.data?.code || '',
                    status: res.status,
                    raw: res.data,
                };
            }
            // Restart again after install so newly added DLLs bind cleanly.
            if (engineProc) {
                stopEngineProcess();
                await sleep(800);
            }
            const ensure2 = await ensureEngineRunning({ ...options, forceRestart: true });
            if (!ensure2.ok) {
                return {
                    ok: true,
                    ...(res.data || {}),
                    restarted: false,
                    restartError: ensure2.error,
                    message: (res.data?.message || 'GPU 支持已安装') + '（引擎重启失败，请手动检测引擎）',
                };
            }
            const statusRes = await getGpuRuntime(ensure2.baseUrl, { timeoutMs: 20000 });
            return {
                ok: true,
                ...(res.data || {}),
                restarted: true,
                probe: statusRes.data || res.data?.probe,
                message: statusRes.data?.hint || res.data?.message || 'GPU 支持已就绪',
            };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-open-download', async (_event, payload = {}) => {
        // 下载管理窗口已移除；调用方应直接使用 transub-engine-run-download
        return { ok: true, removed: true, kind: String(payload?.kind || 'models') };
    });

    register('transub-engine-cancel-download', async () => {
        try {
            if (downloadAbort) {
                try { downloadAbort.abort(); } catch { /* ignore */ }
            }
            // Never kill a running subtitle batch — only abort the download signal.
            if (engineProc && !batchRunning) {
                try { stopEngineProcess(); } catch { /* ignore */ }
            }
            broadcastEngineDownloadProgress({
                phase: 'cancelled',
                ok: false,
                message: batchRunning
                    ? '已取消下载（字幕任务仍在运行）'
                    : '已取消下载',
                pct: 0,
            });
            return { ok: true, cancelled: true };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-run-download', async (_event, payload = {}) => {
        return getEngineDownloadJob().runEngineDownload(payload, _event);
    });

    register('transub-engine-generate-subtitles', async (event, payload = {}) => {
        try {
            const payloadOptions = payload.options || {};
            syncEngineSessionPostTask(payloadOptions);
            const options = await readMergedOptions(payloadOptions);
            return await runEngineBatch({
                items: payload.items || [],
                options,
                invokeSender: event.sender,
                minimizeToTray: !!payload.minimizeToTray,
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-cancel', async () => {
        batchCancelled = true;
        itemCancelled = false;
        abortBatchMtAdapter();
        try { itemWorkAbortController?.abort(); } catch { /* ignore */ }
        if (opusTextAbortController) {
            try {
                opusTextAbortController.abort();
            } catch { /* ignore */ }
            opusTextAbortController = null;
        }
        const jobId = currentJobId;
        if (jobId && engineBaseUrl) {
            try {
                await cancelJob(engineBaseUrl, jobId);
            } catch { /* ignore */ }
        }
        // Post-task blank / ellipsis / Hy-MT may hold llama outside the engine job.
        try {
            await require('./engine-cancel-llm').interruptLocalMtLlm({
                scope: 'batch',
                engineBaseUrl,
            });
        } catch { /* ignore */ }
        // SenseVoice model.generate() / long MT ignore cooperative cancel.
        // Kill the managed engine process so waitJob unblocks immediately.
        if (engineProc) {
            try {
                stopEngineProcess();
                appendEngineLogLine('[engine] 取消：已停止引擎进程');
            } catch { /* ignore */ }
        } else {
            appendEngineLogLine('[engine] 已请求取消');
        }
        return { ok: true, cancelled: true };
    });

    register('transub-engine-cancel-current', async () => {
        if (!batchRunning) {
            return { ok: false, cancelled: false, error: '没有进行中的字幕批次', code: 'no_batch' };
        }
        // Keep batchCancelled false so the loop continues after this file.
        itemCancelled = true;
        try { itemWorkAbortController?.abort(); } catch { /* ignore */ }
        // Do not abortBatchMtAdapter — remaining items still need the external MT server.
        if (opusTextAbortController) {
            try {
                opusTextAbortController.abort();
            } catch { /* ignore */ }
            opusTextAbortController = null;
        }
        const jobId = currentJobId;
        if (jobId && engineBaseUrl) {
            try {
                await cancelJob(engineBaseUrl, jobId);
            } catch { /* ignore */ }
        }
        // Kill the engine only while an ASR/MT job is in flight. Post-task QC/LLM
        // must not be restarted by the closed loop after a row stop.
        if (jobId && engineProc) {
            try {
                stopEngineProcess();
                appendEngineLogLine('[engine] 停止本条：已停止引擎进程（其余任务继续）');
            } catch { /* ignore */ }
        } else {
            appendEngineLogLine('[engine] 已请求停止当前条目（其余任务继续）');
        }
        // Always reclaim local MT LLM: blank/ellipsis may run with or without a job id,
        // and leftover llama can block the next queue item until cold restart anyway.
        try {
            await require('./engine-cancel-llm').interruptLocalMtLlm({
                scope: 'item',
                engineBaseUrl,
            });
        } catch { /* ignore */ }
        return { ok: true, cancelled: true, scope: 'current' };
    });

    register('transub-engine-job-checkpoint', async (_event, payload = {}) => {
        try {
            const options = await readMergedOptions(payload);
            const ensure = await ensureEngineRunning(options);
            if (!ensure.ok) return ensure;
            const jobId = String(payload.jobId || payload.id || '').trim();
            if (!jobId) return { ok: false, error: '缺少 jobId' };
            return getJobCheckpoint(ensure.baseUrl, jobId);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-resume-job', async (event, payload = {}) => {
        try {
            const options = await readMergedOptions(payload.options || payload);
            const ensure = await ensureEngineRunning(options);
            if (!ensure.ok) return ensure;
            const fromJobId = String(payload.jobId || payload.resumeFromJobId || payload.id || '').trim();
            if (!fromJobId) return { ok: false, error: '缺少可恢复的 jobId' };
            const computeLock = require('./compute-task-lock');
            return computeLock.runWithComputeLock({
                kind: 'engine_resume',
                owner: '引擎',
                source: 'resumeJob',
            }, async () => {
                batchCancelled = false;
                const invokeSender = event.sender;
                const sakuraCatalog = require('../src/js/sakura-mt-catalog-core');
                const { planResumeMt, buildResumeMtOverrides } = require('./engine-resume-mt');
                const isLlmMtId = (id) => !!(
                    sakuraCatalog.isLlmInferenceMtModel?.(id)
                    || sakuraCatalog.isSakuraMtModel(id)
                );
                const { fileMerged, useExternalMt, useSmartTranslate, useSakuraMt } = planResumeMt(
                    options,
                    {
                        isLlmMtId,
                        usesExternalMt,
                        mapTaskToEngineTask,
                        mergeSenseOverrides,
                        sanitizeSakuraMtForLanguage,
                        mediaPath: payload.mediaPath,
                        optionOverrides: payload.optionOverrides,
                    },
                );

                let mtAdapter = null;
                let resumeOverrides = {};
                const {
                    createMtUiProgressTracker,
                    setMtUiCurrent,
                    noteEngineTranslatePercent,
                    mapAdapterMtProgress,
                } = require('./engine-mt-ui-progress');
                const resumeMtUi = createMtUiProgressTracker();
                setMtUiCurrent(resumeMtUi, {
                    file: String(payload.mediaPath || ''),
                    index1: 1,
                    total: 1,
                });
                abortBatchMtAdapter();
                batchMtAbortController = new AbortController();
                try {
                    if (useExternalMt) {
                        if (useSmartTranslate) {
                            try {
                                const { requireSmartTranslate } = require('./advanced-gates');
                                const gate = requireSmartTranslate({
                                    faithfulTone: !!fileMerged.smartTranslateFaithfulTone,
                                });
                                if (!gate.ok) {
                                    return {
                                        ok: false,
                                        error: gate.error || '智能翻译需解锁 Pro',
                                        code: gate.code,
                                    };
                                }
                            } catch (err) {
                                return { ok: false, error: err.message || String(err) };
                            }
                        }
                        const launch = batchMtPlan.resolveBatchMtAdapterLaunch({
                            batchWantsSmart: useSmartTranslate,
                            sakuraModelId: useSakuraMt ? fileMerged.engineMtModel : null,
                            merged: fileMerged,
                            list: [{ path: payload.mediaPath, optionOverrides: payload.optionOverrides }],
                        });
                        mtAdapter = await startEngineMtAdapter({
                            ...launch,
                            signal: batchMtAbortController.signal,
                            onProgress: (info) => {
                                if (batchCancelled) return;
                                const detail = info?.message || info?.detail || info?.phase || '翻译中';
                                appendEngineLogLine(
                                    `[engine-translate] ${detail}`,
                                    invokeSender,
                                );
                                const mapped = mapAdapterMtProgress(info, resumeMtUi);
                                if (mapped) sendProgress(invokeSender, mapped);
                            },
                        });
                        const built = buildResumeMtOverrides({
                            useExternalMt: true,
                            useSmartTranslate,
                            fileMerged,
                            mtAdapter,
                        });
                        if (!built.ok) {
                            return { ok: false, error: built.error, code: built.code };
                        }
                        resumeOverrides = built.overrides || {};
                        const mtModeZh = useSmartTranslate
                            ? '智能翻译'
                            : (useSakuraMt
                                ? (sakuraCatalog.translateModeLabel?.('llm') || '推理翻译')
                                : '外部');
                        appendEngineLogLine(
                            `[engine] 从原文继续 · 外部翻译适配器 · ${mtModeZh} · ${mtAdapter.url}`,
                            invokeSender,
                        );
                    }

                    appendEngineLogLine(`[engine] 从原文继续翻译 ${fromJobId}…`, invokeSender);
                    const outcome = await resumeEngineJobAndWait({
                        baseUrl: ensure.baseUrl,
                        fromJobId,
                        resumeJob,
                        waitJob,
                        overrides: resumeOverrides,
                        shouldStop: () => batchCancelled,
                        onEvent: (ev) => {
                            if (batchCancelled) return;
                            const rawFields = progressFieldsFromWaitEvent(ev);
                            if (!rawFields) {
                                currentJobId = String(ev?.data?.id || currentJobId || '');
                                return;
                            }
                            let fields = sanitizeBatchEngineSseProgress(rawFields);
                            const resumePath = payload.mediaPath || '';
                            fields = softenTranslateProgressFields(
                                fields,
                                getTranslateProgressSession(resumePath),
                            );
                            currentJobId = String(ev?.data?.id || currentJobId || '');
                            if (String(fields.stage || '').toLowerCase() === 'translate'
                                || String(fields.stage || '').toLowerCase() === 'mt') {
                                noteEngineTranslatePercent(resumeMtUi, fields.percent);
                            }
                            sendProgress(invokeSender, {
                                ...fields,
                                file: resumePath,
                                jobId: currentJobId,
                                detail: fields.detail || `从原文继续翻译（自 ${fromJobId}）…`,
                            });
                        },
                    });
                    currentJobId = '';
                    if (!outcome.ok) {
                        return {
                            ok: false,
                            cancelled: !!outcome.cancelled,
                            error: friendlyEngineError(outcome.error || '从原文继续翻译失败'),
                            code: outcome.code,
                            resumedFrom: fromJobId,
                        };
                    }
                    const result = outcome.result || outcome.waited?.data?.result || null;
                    const outPaths = extractOutputPaths(result);
                    appendEngineLogLine(
                        `[engine] 从原文继续翻译完成 → ${path.basename(outPaths.subtitlePath || outPaths.targetSubtitlePath || '')}`,
                        invokeSender,
                    );
                    return {
                        ok: true,
                        resumedFrom: fromJobId,
                        jobId: outcome.jobId,
                        result,
                        ...outPaths,
                    };
                } finally {
                    abortBatchMtAdapter();
                    try {
                        const { stopLlamaServer } = require('./advanced-llama-server');
                        stopLlamaServer();
                    } catch (_) { /* optional */ }
                }
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-export-diagnostics', async (_event, payload = {}) => {
        try {
            const options = await readMergedOptions(payload.options || payload);
            let checkpoint = null;
            const jobId = String(payload.jobId || '').trim();
            if (jobId) {
                try {
                    const ensure = await ensureEngineRunning(options);
                    if (ensure.ok) {
                        const ck = await getJobCheckpoint(ensure.baseUrl, jobId);
                        if (ck?.ok) checkpoint = ck.data;
                    }
                } catch { /* ignore */ }
            }
            let engineLogPath = '';
            try {
                engineLogPath = String(getEngineLogPath?.() || '').trim();
            } catch { /* ignore */ }
            const out = exportAsrDiagnosticsPack({
                outDir: payload.outDir,
                options,
                jobId,
                mediaPath: payload.mediaPath,
                checkpoint,
                domainFixTrace: payload.domainFixTrace,
                cueStats: payload.cueStats,
                logLines: payload.logLines,
                engineLogPath,
                d01Version: payload.d01Version,
                secondOpinion: payload.secondOpinion || null,
                badPool: (() => {
                    if (payload.badPool) return payload.badPool;
                    try {
                        const { summarizeBadPoolJsonl } = require('./asr-bad-pool-draft');
                        const sum = summarizeBadPoolJsonl({ sampleLimit: 8 });
                        return {
                            dir: sum.dir,
                            total: sum.total,
                            open: sum.open,
                            byKind: sum.byKind,
                            files: sum.files,
                            samples: sum.samples,
                        };
                    } catch {
                        return null;
                    }
                })(),
                extra: {
                    note: 'Local diagnostics only — not uploaded.',
                    concurrency: {
                        desktopLock: 'compute-task-lock single slot',
                        engineMaxJobs: 'TRANSUB_MAX_CONCURRENT_JOBS (default 1)',
                    },
                },
            });
            if (out.ok) {
                appendEngineLogLine(`[engine] 已导出诊断包 → ${out.dir}`);
            }
            return out;
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-open-latest-log', async () => {
        try {
            return openEngineLatestLog();
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-download-info', async (_event, payload = {}) => {
        try {
            const options = await readMergedOptions(payload || {});
            return await buildEngineDownloadInfo({
                ...options,
                ...(payload || {}),
                profile: (payload && payload.profile) || options.engineProfile,
                hfEndpoint: payload && payload.hfEndpoint != null
                    ? payload.hfEndpoint
                    : options.engineHfEndpoint,
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-open-manual-url', async (_event, payload = {}) => {
        try {
            const { shell } = require('electron');
            const url = String(payload.url || '').trim();
            if (!/^https?:\/\//i.test(url)) {
                return { ok: false, error: '无效链接' };
            }
            await shell.openExternal(url);
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    /** Open Thunder (迅雷) for http(s) wheel URLs via thunder:// tasks (all URLs, paced). */
    register('transub-engine-open-thunder-urls', async (_event, payload = {}) => {
        try {
            const { shell } = require('electron');
            const { openThunderUrls } = require('./download-tool-launch');
            return await openThunderUrls(shell, payload.urls);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    /** Open a download manager (thunder / idm / motrix) for the full URL list. */
    register('transub-engine-open-download-tool', async (_event, payload = {}) => {
        try {
            const { shell } = require('electron');
            const { openDownloadTool } = require('./download-tool-launch');
            return await openDownloadTool(payload.tool || payload.id, payload.urls, { shell });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-open-download-folder', async (_event, payload = {}) => {
        try {
            const { shell } = require('electron');
            const options = await readMergedOptions(payload || {});
            let folder = String(payload.folder || payload.localDir || '').trim();
            const modelId = String(payload.modelId || '').trim();
            if (!folder) {
                const info = await buildEngineDownloadInfo({
                    ...options,
                    ...(payload || {}),
                    kind: payload.kind || 'models',
                    modelIds: modelId
                        ? [modelId]
                        : (Array.isArray(payload.modelIds) ? payload.modelIds : undefined),
                    profile: (payload && payload.profile) || options.engineProfile,
                    hfEndpoint: payload && payload.hfEndpoint != null
                        ? payload.hfEndpoint
                        : options.engineHfEndpoint,
                });
                if (modelId) {
                    const item = (Array.isArray(info?.info?.items) ? info.info.items : [])
                        .find((it) => String(it?.id || '') === modelId);
                    folder = String(item?.localDir || item?.folder || '').trim();
                }
                if (!folder) {
                    folder = String(
                        info?.info?.folder
                        || getEngineModelsRoot(
                            options.engineInstallPath || (payload && payload.engineInstallPath),
                        ),
                    ).trim();
                }
            }
            fs.mkdirSync(folder, { recursive: true });
            const err = await shell.openPath(folder);
            if (err) return { ok: false, error: err };
            return { ok: true, path: folder, folder };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    registerLocalWhlIpc(register, {
        isBatchRunning: () => batchRunning,
        isDownloadBusy: () => downloadBusy,
        setDownloadBusy: (v) => { downloadBusy = !!v; },
        getDownloadAbort: () => downloadAbort,
        setDownloadAbort: (ac) => { downloadAbort = ac; },
        readMergedOptions,
        resolveEngineInstallPath,
        resolveEngineRuntimePython,
        getEngineProc: () => engineProc,
        stopEngineProcess,
        sleep,
        ensureEngineRunning,
        getAudioSeparateRuntime,
        getGpuRuntime,
    });

    register('transub-engine-get-log-path', async () => ({
        ok: true,
        path: getEngineLogPath(),
        exists: fs.existsSync(getEngineLogPath()),
    }));

    register('transub-engine-save-options', async (_event, payload = {}) => {
        try {
            const current = loadSettings(() => getAppRoot()).options || {};
            const next = mergeTransWithAiOptions(mergeEngineOptions({
                ...current,
                ...stripPostTaskFields(payload || {}),
            }));
            saveSettings(() => getAppRoot(), next);
            return { ok: true, options: next };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-generate-subtitles', async (event, payload = {}) => {
        const payloadOptions = payload.options || {};
        syncEngineSessionPostTask(payloadOptions);
        const options = await readMergedOptions(payloadOptions);
        if (options.engineBackend === 'twai') {
            return { ok: false, error: '请使用 TransWithAI 生成通道（engineBackend=twai）' };
        }
        return runEngineBatch({
            items: payload.items || [],
            options,
            invokeSender: event.sender,
            minimizeToTray: !!payload.minimizeToTray,
        });
    });

    register('transub-transcribe-range', async (event, payload = {}) => {
        const options = await readMergedOptions(payload.options || {});
        if (options.engineBackend === 'twai') {
            deferredEnsureTwai();
            const { transcribeMediaRange } = require('./transwithai-bridge');
            return transcribeMediaRange(payload || {}, {
                getUserDataPath: () => require('./app-paths').getWritableRoot(),
                getAppRoot,
                onProgress: (progress) => {
                    try {
                        if (!event?.sender?.isDestroyed?.()) {
                            event.sender.send('transub-retranscribe-progress', progress);
                        }
                    } catch (_) { /* ignore */ }
                },
            });
        }
        return transcribeRangeWithEngine(payload || {}, {
            options,
            invokeSender: event.sender,
            onProgress: (progress) => {
                try {
                    if (!event?.sender?.isDestroyed?.()) {
                        event.sender.send('transub-retranscribe-progress', progress);
                    }
                } catch (_) { /* ignore */ }
            },
        });
    });

    // Defer Sakura IPC module load until first sakura-* call (editor path).
    let sakuraHandlers = null;
    const ensureSakuraHandlers = () => {
        if (sakuraHandlers) return sakuraHandlers;
        const captured = new Map();
        const { setupSakuraTranslateBridge } = require('./sakura-translate');
        setupSakuraTranslateBridge({
            register(channel, handler) {
                captured.set(channel, handler);
            },
        });
        sakuraHandlers = captured;
        return sakuraHandlers;
    };
    for (const channel of [
        'transub-sakura-status',
        'transub-sakura-translate',
        'transub-sakura-cancel-translate',
    ]) {
        register(channel, async (event, payload) => {
            const handler = ensureSakuraHandlers().get(channel);
            if (typeof handler !== 'function') {
                throw new Error(`[engine] sakura channel missing: ${channel}`);
            }
            return handler(event, payload);
        });
    }
}

function deferredEnsureTwai() {
    // TWAI handlers may not be loaded yet when range is routed via engine bridge
    try {
        if (typeof ensureBridgeFn === 'function') {
            ensureBridgeFn('transwithai');
        } else {
            require('./transwithai-bridge');
        }
    } catch { /* ignore */ }
}

/**
 * Text-only Opus MT for editor / cue arrays — removed; callers should use LLM/smart.
 * @param {{ cues: Array, language?: string, mtModel?: string, glossary?: object, fileName?: string }} payload
 * @param {{ onProgress?: Function, options?: object }} [deps]
 */
async function translateCuesWithEngineOpus(payload = {}, deps = {}) {
    return {
        ok: false,
        error: '机器翻译（Opus）已移除，请改用推理翻译或智能翻译',
        code: 'opus_removed',
    };
}

function stopEngineJobs() {
    batchCancelled = true;
    itemCancelled = false;
    abortBatchMtAdapter();
    const jobId = currentJobId;
    if (jobId && engineBaseUrl) {
        cancelJob(engineBaseUrl, jobId).catch(() => {});
    }
    try {
        stopEngineProcessAndPort();
    } catch { /* ignore */ }
    stopLlamaServerQuiet();
}

function setupComputeTaskStatusIpc(register) {
    if (typeof register !== 'function') return;
    register('transub-compute-task-status', async (_event, opts = {}) => {
        const computeLock = require('./compute-task-lock');
        const explicitUrl = String(opts?.engineUrl || '').trim().replace(/\/+$/, '');
        if (explicitUrl) {
            computeLock.setEngineLockBaseUrl(explicitUrl);
        } else if (engineProc && engineBaseUrl) {
            // Only pin the live child URL — avoid probing DEFAULT when engine never started.
            computeLock.setEngineLockBaseUrl(engineBaseUrl);
        }
        let llamaServer = null;
        try {
            const st = require('./advanced-llama-server').getServerState?.();
            if (st) {
                llamaServer = {
                    modelId: st.modelId || '',
                    nGpuLayers: st.nGpuLayers,
                    parallelSlots: st.parallelSlots,
                    backend: Number(st.nGpuLayers) > 0 ? 'cuda' : 'cpu',
                };
            }
        } catch { /* ignore */ }
        return {
            ok: true,
            ...computeLock.getStatus(),
            batchRunning: !!batchRunning,
            llamaServer,
        };
    });
    register('transub-compute-task-force-release', async () => {
        const computeLock = require('./compute-task-lock');
        const before = computeLock.getStatus();
        const res = computeLock.forceRelease();
        return { ok: true, released: !!res?.released, before };
    });
    register('transub-compute-task-cancel', async () => {
        const computeLock = require('./compute-task-lock');
        const before = computeLock.getStatus();
        try {
            require('./active-task-guard').stopActiveJobs();
        } catch {
            // Fallback if guard fails: still cancel engine jobs from this module.
            try { stopEngineJobs(); } catch { /* ignore */ }
        }
        // Do not forceRelease here — holders release in finally; avoids orphaning mid-cancel.
        return {
            ok: true,
            stopped: true,
            before: before?.busy ? before : null,
            busy: !!computeLock.getStatus()?.busy,
        };
    });
}

module.exports = {
    setupEngineBridge,
    ensureEngineRunning,
    runEngineBatch,
    stopEngineJobs,
    stopEngineProcess,
    translateCuesWithEngineOpus,
    transcribeRangeWithEngine,
    resolveEngineEntrypoints,
    resolveEngineInstallPath,
    getBundledEnginePath,
    appendEngineLogLine,
    // Test helpers
    buildHubUrls,
    manualPlaceHintForModel,
    getEngineModelsRoot,
    mapEngineStageToItemStage,
    buildUiProgress,
    extractOutputPaths,
    mapDeviceForEngine,
    parseHostPort,
};
