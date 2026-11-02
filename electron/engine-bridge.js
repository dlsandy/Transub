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
const { registerEngineModelsIpc } = require('./engine-models-ipc');
const { registerEngineRuntimeIpc } = require('./engine-runtime-ipc');
const { registerEngineDownloadIpc } = require('./engine-download-ipc');
const { registerEngineBatchIpc } = require('./engine-batch-ipc');
const { registerEngineOptionsIpc } = require('./engine-options-ipc');
const { registerEngineComputeIpc } = require('./engine-compute-ipc');
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
    registerEngineComputeIpc(register, {
        getEngineProc: () => engineProc,
        getEngineBaseUrl: () => engineBaseUrl,
        isBatchRunning: () => batchRunning,
        stopEngineJobs,
    });

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

    const engineIpcSession = {
        get engineProc() { return engineProc; },
        set engineProc(v) { engineProc = v; },
        get engineBaseUrl() { return engineBaseUrl; },
        set engineBaseUrl(v) { engineBaseUrl = v; },
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
        get downloadAbort() { return downloadAbort; },
        set downloadAbort(v) { downloadAbort = v; },
        get downloadBusy() { return downloadBusy; },
        set downloadBusy(v) { downloadBusy = v; },
        get opusTextAbortController() { return opusTextAbortController; },
        set opusTextAbortController(v) { opusTextAbortController = v; },
    };

    const engineIpcHelpers = {
        readMergedOptions,
        ensureEngineRunning,
        getCapabilities,
        listModels,
        omitRetiredEngineModels,
        deleteModels,
        recommendModels,
        detectLanguage,
        translateCuesWithEngineOpus,
        downloadModels,
        getGpuRuntime,
        scanSystemCuda,
        adoptSystemCuda,
        getAsrWhisperRuntime,
        getAudioSeparateRuntime,
        ensureGpuRuntime,
        sleep,
        stopEngineProcess,
        stopEngineProcessAndPort,
        broadcastEngineDownloadProgress,
        getEngineDownloadJob,
        syncEngineSessionPostTask,
        runEngineBatch,
        abortBatchMtAdapter,
        cancelJob,
        appendEngineLogLine,
        getJobCheckpoint,
        resumeJob,
        waitJob,
        usesExternalMt,
        mapTaskToEngineTask,
        mergeSenseOverrides,
        sanitizeSakuraMtForLanguage,
        batchMtPlan,
        startEngineMtAdapter,
        progressFieldsFromWaitEvent,
        sanitizeBatchEngineSseProgress,
        softenTranslateProgressFields,
        getTranslateProgressSession,
        sendProgress,
        friendlyEngineError,
        extractOutputPaths,
        resumeEngineJobAndWait,
        exportAsrDiagnosticsPack,
        getEngineLogPath,
        openEngineLatestLog,
        buildEngineDownloadInfo,
        getEngineModelsRoot,
        resolveEngineInstallPath,
        resolveEngineRuntimePython,
        registerLocalWhlIpc,
        loadSettings,
        saveSettings,
        mergeTransWithAiOptions,
        mergeEngineOptions,
        stripPostTaskFields,
        getAppRoot,
        transcribeRangeWithEngine,
        deferredEnsureTwai,
        fs,
        path,
    };

    const ipcHost = { s: engineIpcSession, h: engineIpcHelpers };
    registerEngineModelsIpc(register, ipcHost);
    registerEngineRuntimeIpc(register, ipcHost);
    registerEngineDownloadIpc(register, ipcHost);
    registerEngineBatchIpc(register, ipcHost);
    registerEngineOptionsIpc(register, ipcHost);

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
