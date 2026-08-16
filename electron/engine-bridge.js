/**
 * Transub Engine bridge — spawn local engine HTTP server and run subtitle jobs.
 */

const { spawn } = require('child_process');
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
    ensureRuntimeExtrasOffline,
    ensureAsrWhisperOffline,
    ensureAsrSensevoiceOffline,
} = require('./engine-runtime-extras');
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
    extractOutputPaths,
    mapEngineResultsToHistoryOutputs,
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
    progressFieldsFromWaitEvent,
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
    downloadModelsStream,
    getGpuRuntime,
    getAsrWhisperRuntime,
    ensureGpuRuntime,
    ensureGpuRuntimeStream,
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
const {
    summarizeDomainFixChanges,
    formatDomainFixLogLine,
} = require('./asr-domain-fix-trace');
const { exportAsrDiagnosticsPack } = require('./asr-diagnostics-export');
const batchRecovery = require('../src/js/batch-recovery-core');
const { mergeTransWithAiOptions, stripPostTaskFields } = require('./transwithai-options');
const { mergeSenseOverrides, sanitizeSakuraMtForLanguage } = require('../src/js/content-profile-core');
const { buildVadJobOptions, buildAudioJobOptions } = require('./engine-audio-options');
const {
    resolveEngineSubFormats,
    buildEngineGlossaryPairs,
    buildEngineJobFlags,
    buildExternalMtJobFields,
} = require('./engine-job-options');
const { startEngineMtAdapter } = require('./engine-mt-adapter');
const {
    broadcastEngineDownloadProgress,
} = require('./download-window');
const {
    validateWhlFiles,
    installLocalWheels,
} = require('./local-whl-install');
const { createEngineLogIo } = require('./engine-log-io');
const { createEngineProcessLifecycle } = require('./engine-process-lifecycle');
const { createProgressEmitter } = require('./engine-progress-emit');
const { createEngineBatchHistory } = require('./engine-batch-history');
const batchMtPlan = require('./engine-batch-mt-plan');
const batchPostprocessPlan = require('./engine-batch-postprocess-plan');

let engineProc = null;
let engineBaseUrl = DEFAULT_ENGINE_URL;
let batchCancelled = false;
let batchRunning = false;
let currentJobId = '';
/** @type {((name: string) => void) | null} */
let ensureBridgeFn = null;
/** @type {AbortController | null} */
let batchMtAbortController = null;
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

async function waitForHealth(baseUrl, opts = {}) {
    return waitForHealthPoll(baseUrl, { ...opts, getHealth });
}

async function ensureEngineRunning(options = {}) {
    const opts = mergeEngineOptions(options);
    opts.engineInstallPath = resolveEngineInstallPath(opts.engineInstallPath);
    engineBaseUrl = opts.engineUrl || DEFAULT_ENGINE_URL;
    const forceRestart = !!options.forceRestart;
    const shouldStop = typeof options.shouldStop === 'function' ? options.shouldStop : null;

    if (forceRestart) {
        const { port } = parseHostPort(engineBaseUrl);
        stopEngineProcess();
        killListenersOnPort(port);
        await sleep(800);
    }

    const health = await getHealth(engineBaseUrl, { timeoutMs: 2000 }).catch(() => ({ ok: false }));
    if (health.ok && health.data?.ok) {
        if (!isApiCompatible(health.data.apiVersion)) {
            return {
                ok: false,
                error: `引擎 API 主版本不兼容（got ${health.data.apiVersion}）`,
                health: health.data,
            };
        }
        if (forceRestart) {
            appendEngineLogLine(
                '[engine] 强制重启后端口仍被占用：可能是外部进程，已跳过重新拉起'
            );
        }
        return { ok: true, baseUrl: engineBaseUrl, health: health.data, spawned: false };
    }

    if (!opts.engineAutoStart) {
        return { ok: false, error: '引擎未运行，且未启用自动启动' };
    }

    const entry = resolveEngineEntrypoints(opts.engineInstallPath);
    if (!entry) {
        const hint = opts.engineInstallPath
            || getBundledEnginePath()
            || '（未找到内置引擎）';
        return {
            ok: false,
            error: `未找到引擎：请确认内置目录 ${hint} 为独立版（含 runtime\\python.exe），或浏览自定义引擎目录，或启动已有 serve 并填写引擎 URL`,
        };
    }

    stopEngineProcess();
    const { host, port } = parseHostPort(engineBaseUrl);
    const args = [...entry.args, 'serve', '--host', host, '--port', String(port)];
    let env = {
        ...process.env,
        TRANSUB_ENGINE_STUB: process.env.TRANSUB_ENGINE_STUB || '',
        TQDM_DISABLE: '1',
        // Force UTF-8 so Chinese progress / logs are not GBK-mojibake on Windows.
        PYTHONIOENCODING: process.env.PYTHONIOENCODING || 'utf-8',
        PYTHONUTF8: process.env.PYTHONUTF8 || '1',
        // Suppress transformers/UserWarning spam in captured stderr.
        PYTHONWARNINGS: process.env.PYTHONWARNINGS
            || 'ignore::UserWarning:transformers,ignore::FutureWarning',
    };
    try {
        const { applyEngineTempEnv } = require('./temp-cleanup');
        // Keep ASR/Demucs/ffmpeg scratch out of %TEMP%; cleared after each job.
        env = applyEngineTempEnv(env);
    } catch { /* optional */ }
    try {
        const { applyProxyToEnv, normalizeProxyOptions } = require('./proxy-settings');
        // Prefer explicit proxy fields on opts (full settings payload); otherwise keep
        // the proxy already applied to the main process (activeProxy / process.env).
        if (Object.prototype.hasOwnProperty.call(opts, 'proxyEnabled')
            || Object.prototype.hasOwnProperty.call(opts, 'proxyUrl')) {
            applyProxyToEnv(env, normalizeProxyOptions(opts));
        } else {
            applyProxyToEnv(env);
        }
    } catch { /* proxy optional */ }
    const hfEndpoint = String(opts.engineHfEndpoint || '').trim().replace(/\/+$/, '');
    if (hfEndpoint) {
        env.HF_ENDPOINT = hfEndpoint;
    }
    const hfToken = String(opts.engineHfToken || opts.hfToken || '').trim();
    if (hfToken) {
        env.HF_TOKEN = hfToken;
        env.HUGGING_FACE_HUB_TOKEN = hfToken;
    }
    // Avoid Xet/CAS 401s when pulling LFS weights via domestic mirrors.
    if (!env.HF_HUB_DISABLE_XET) {
        env.HF_HUB_DISABLE_XET = '1';
    }
    // huggingface_hub defaults to 10s; too short for mirror/CDN hops on large weights.
    if (!env.HF_HUB_DOWNLOAD_TIMEOUT) {
        env.HF_HUB_DOWNLOAD_TIMEOUT = '120';
    }
    if (!env.HF_HUB_ETAG_TIMEOUT) {
        env.HF_HUB_ETAG_TIMEOUT = '30';
    }
    env = injectFfmpegPathEnv(env, opts.ffmpegPath, opts.engineInstallPath);
    if (!env.TRANSUB_ENGINE_HOME && opts.engineInstallPath) {
        env.TRANSUB_ENGINE_HOME = path.resolve(String(opts.engineInstallPath));
    }
    try {
        const tdpFs = require('./tdp-fs');
        env.TRANSUB_TDP_DIR = tdpFs.getTdpRoot();
    } catch { /* optional */ }
    try {
        resetEngineLogFile();
        engineProc = spawn(entry.command, args, {
            cwd: entry.cwd || opts.engineInstallPath,
            env,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        attachEngineProcessLogs(engineProc);
        appendEngineLogLine(`[engine] 启动 ${entry.command} ${args.join(' ')}`);
        engineProc.on('exit', (code, signal) => {
            appendEngineLogLine(`[engine] 进程退出 code=${code} signal=${signal || ''}`);
            engineProc = null;
            // Unexpected exit can leave a sibling listener on the port (respawn race).
            if (code !== 0 && code != null) {
                try {
                    const { port } = parseHostPort(engineBaseUrl || DEFAULT_ENGINE_URL);
                    killListenersOnPort(port);
                } catch { /* ignore */ }
            }
        });
    } catch (err) {
        return { ok: false, error: `无法启动引擎: ${err.message || err}` };
    }

    const ready = await waitForHealth(engineBaseUrl, {
        timeoutMs: 45000,
        shouldStop,
    });
    if (!ready.ok) {
        stopEngineProcess();
        return {
            ok: false,
            error: ready.cancelled ? '已取消' : (ready.error || '引擎启动后健康检查失败'),
            cancelled: !!ready.cancelled,
        };
    }
    if (!isApiCompatible(ready.data?.apiVersion)) {
        stopEngineProcessAndPort();
        return {
            ok: false,
            error: `引擎 API 主版本不兼容（got ${ready.data?.apiVersion}）`,
            health: ready.data,
        };
    }
    return { ok: true, baseUrl: engineBaseUrl, health: ready.data, spawned: true };
}

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
    getAbortController: () => batchMtAbortController,
    setAbortController: (c) => { batchMtAbortController = c; },
    stripPostTaskFields,
    mapEngineResultsToHistoryOutputs,
});
const {
    loadEngineGlossaryPairs,
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

async function runEngineBatchLocked({
    list,
    paths,
    merged,
    invokeSender,
    minimizeToTray = false,
}) {
    batchCancelled = false;
    // Editor LLM idle keep-alive can still hold VRAM; free it before ASR.
    try {
        require('./local-llm-reclaim').reclaimLocalLlmBeforeEngineJob(appendEngineLogLine);
    } catch (_) { /* ignore */ }
    // Restart only when env/PATH/version changed; otherwise reuse a healthy engine.
    let ensure = await ensureEngineRunning({
        ...merged,
        shouldStop: () => batchCancelled,
    });
    if (!ensure.ok) {
        return ensure;
    }

    const sakuraCatalog = require('../src/js/sakura-mt-catalog-core');
    const dualCore = require('../src/js/dual-subtitle-core');
    const {
        resolveLocalSubtitlePath,
        resolveDualSubtitlePaths,
    } = require('./subtitle-utils');
    const isLlmMtId = (id) => !!(
        sakuraCatalog.isLlmInferenceMtModel?.(id)
        || sakuraCatalog.isSakuraMtModel(id)
    );
    // Hard guard: never keep Sakura when the merged file language is known non-Japanese.
    const fileMergedList = batchMtPlan.buildSanitizedFileMergedList(list, merged, {
        mergeSenseOverrides,
        sanitizeSakuraMtForLanguage,
    });
    // Prefer per-file (post-sanitize) decisions so a global Sakura form cannot force
    // Sakura onto sensed non-Japanese items.
    const {
        batchWantsSmart,
        batchWantsSakura,
        sakuraModelId,
    } = batchMtPlan.resolveBatchMtPlan({
        fileMergedList,
        merged,
        listLength: list.length,
        isLlmMtId,
    });

    // Gate Advanced features before job-start so UI never flashes "running" then fails.
    if (batchWantsSmart) {
        try {
            const { requireSmartTranslate } = require('./advanced-gates');
            const gate = requireSmartTranslate({
                faithfulTone: !!merged.smartTranslateFaithfulTone,
            });
            if (!gate.ok) {
                return {
                    ok: false,
                    error: gate.error
                        || '智能翻译需解锁 Pro',
                };
            }
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    }
    if (batchMtPlan.batchNeedsFilmAudioGate(list, merged, mergeSenseOverrides)) {
        try {
            const { requireFilmAudioEnhance } = require('./advanced-gates');
            const gate = requireFilmAudioEnhance();
            if (!gate.ok) {
                return {
                    ok: false,
                    error: gate.error || '影视音频增强需解锁 Pro',
                };
            }
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    }
    batchRunning = true;
    batchCancelled = false;
    currentJobId = '';
    abortBatchMtAdapter();
    batchMtAbortController = new AbortController();
    let lastOutputDir = '';
    const liveBatch = require('./live-batch-queue');
    liveBatch.begin(list);
    const {
        createMtUiProgressTracker,
        setMtUiCurrent,
        noteEngineTranslatePercent,
        mapAdapterMtProgress,
    } = require('./engine-mt-ui-progress');
    const mtUiProgress = createMtUiProgressTracker();

    const jobStartedAt = new Date().toISOString();
    const jobStartedMs = Date.now();

    // Align with TWAI: notify UI so progress/badge/stop button activate immediately.
    try {
        if (minimizeToTray && engineUiWindowManager?.createMainWindow) {
            engineUiWindowManager.createMainWindow({ startMinimizedToTray: true });
        }
        const win = engineUiWindowManager?.getMainWindow?.();
        if (win?.webContents && !win.webContents.isDestroyed()) {
            if (win.webContents.isLoading()) {
                await new Promise((resolve) => {
                    win.webContents.once('did-finish-load', () => resolve());
                    setTimeout(resolve, 5000);
                });
            }
        }
    } catch { /* ignore */ }
    emitToSubtitleUi('subtitle-task-job-start', {
        total: paths.length,
        items: paths,
        startedAt: jobStartedAt,
        device: merged.device || 'auto',
        backend: 'transub',
    }, invokeSender);
    appendEngineLogLine(
        `[engine] 开始批次 · ${paths.length} 个文件 · ASR=${merged.engineAsrModel || 'sensevoice-small'} · 档位=${merged.engineProfile || 'balanced'}`,
        invokeSender,
    );

    const results = [];
    let generated = 0;
    let failed = 0;
    let skipped = 0;
    const usedExternalMt = usesExternalMt({
        smartTranslate: batchWantsSmart,
        sakuraMt: batchWantsSakura,
    });
    let batchFailedOrCancelled = false;
    /** @type {{ ok: boolean, stop?: function, mtExternal?: function, mode?: string, url?: string } | null} */
    let mtAdapter = null;
    try {
        if (usedExternalMt) {
            const launch = batchMtPlan.resolveBatchMtAdapterLaunch({
                batchWantsSmart,
                sakuraModelId,
                merged,
                list,
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
                    // Adapter ticks never reach engine SSE until the HTTP batch returns —
                    // push them to the UI so translate % / status keep moving.
                    if (!mtUiProgress.file) {
                        const cur = liveBatch.getCurrent?.() || '';
                        if (cur) {
                            setMtUiCurrent(mtUiProgress, {
                                file: cur,
                                index1: liveBatch.getCurrentIndex1?.() || 1,
                                total: list.length,
                            });
                        }
                    }
                    const mapped = mapAdapterMtProgress(info, mtUiProgress);
                    if (mapped) {
                        sendProgress(invokeSender, mapped);
                    }
                },
            });
            if (!mtAdapter?.ok) {
                const errMsg = mtAdapter?.error || '外部 MT 适配器启动失败';
                batchFailedOrCancelled = true;
                const finished = {
                    ok: false,
                    cancelled: false,
                    generated: 0,
                    skipped: 0,
                    failed: list.length,
                    error: errMsg,
                    results: [],
                };
                recordEngineBatchHistory({
                    list,
                    merged,
                    finished,
                    startedAt: jobStartedAt,
                    startedMs: jobStartedMs,
                    extraErrors: [errMsg],
                });
                emitToSubtitleUi('subtitle-task-job-finished', finished, invokeSender);
                return { ok: false, error: errMsg };
            }
            const mtModeZh = mtAdapter.mode === 'smart'
                ? '智能翻译'
                : (mtAdapter.mode === 'sakura' ? 'Sakura' : String(mtAdapter.mode || '外部'));
            appendEngineLogLine(
                `[engine] 外部翻译适配器 · ${mtModeZh} · ${mtAdapter.url}`,
                invokeSender,
            );
            // Preview LLM source from settings only (do not resolve/start managed server before ASR).
            if (mtAdapter.mode === 'smart') {
                try {
                    const { readAdvancedDoc } = require('./advanced-license-data');
                    const {
                        formatAdvancedLlmEngineLogLine,
                        llmHostHint,
                    } = require('./advanced-llm-log');
                    const entitlement = require('../src/js/advanced-entitlement-core');
                    const managedCatalog = require('../src/js/advanced-managed-llm-catalog-core');
                    const advDoc = readAdvancedDoc().doc;
                    const src = entitlement.normalizeLlmSource(advDoc?.llmSource);
                    let preview = { ok: true, source: src, model: '', baseUrl: '' };
                    if (src === 'byok') {
                        const byokCfg = entitlement.normalizeByok(advDoc?.byok);
                        preview = {
                            ok: true,
                            source: 'byok',
                            model: byokCfg.model || '',
                            baseUrl: byokCfg.baseUrl || '',
                        };
                    } else {
                        const choice = managedCatalog.resolveSmartTranslateModelChoice(
                            advDoc?.managedLlm,
                        );
                        preview = {
                            ok: true,
                            source: 'managed',
                            modelId: choice.modelId || '',
                            model: choice.modelId || '',
                            baseUrl: '',
                        };
                    }
                    const line = formatAdvancedLlmEngineLogLine(preview, { feature: '智能翻译' });
                    // Include host hint even when empty so line stays stable; skip empty model noise.
                    if (preview.model || preview.modelId || llmHostHint(preview.baseUrl)) {
                        appendEngineLogLine(line, invokeSender);
                    }
                } catch (_) { /* optional */ }
            }
        }

        for (let i = 0; i < list.length; i += 1) {
            if (batchCancelled) break;
            const item = list[i] || {};
            const mediaPath = path.resolve(String(item.fullPath || item.path || ''));
            const index1 = i + 1;

            if (liveBatch.consumeSkip(mediaPath)) {
                skipped += 1;
                results.push(buildCancelledItemResult(mediaPath, { removedFromQueue: true }));
                sendProgress(invokeSender, {
                    stage: 'cancelled',
                    index1,
                    total: list.length,
                    file: mediaPath,
                    detail: '已从队列移除',
                    error: 'cancelled',
                    percent: 0,
                });
                continue;
            }

            sendProgress(invokeSender, {
                stage: 'starting',
                index1,
                total: list.length,
                file: mediaPath,
                detail: '准备引擎任务…',
                percent: 0,
            });

            liveBatch.setCurrent(mediaPath);
            setMtUiCurrent(mtUiProgress, {
                file: mediaPath,
                index1,
                total: list.length,
            });
            try {
            if (!fs.existsSync(mediaPath)) {
                failed += 1;
                results.push({ ok: false, path: mediaPath, error: '文件不存在' });
                sendProgress(invokeSender, {
                    stage: 'error',
                    index1,
                    total: list.length,
                    file: mediaPath,
                    detail: '文件不存在',
                    error: '文件不存在',
                });
                continue;
            }

            const outDir = merged.outputMode === 'custom' && merged.outputDir
                ? merged.outputDir
                : path.dirname(mediaPath);
            lastOutputDir = outDir;

            const fileMergedRaw = mergeSenseOverrides(merged, item.optionOverrides || {});
            const sakuraSanitize = sanitizeSakuraMtForLanguage(fileMergedRaw, fileMergedRaw.language);
            const fileMerged = sakuraSanitize.options;
            if (sakuraSanitize.changed && sakuraSanitize.note) {
                appendEngineLogLine(
                    `[engine] #${index1}/${list.length} ${sakuraSanitize.note}`,
                    invokeSender,
                );
            }
            if (!fileMerged.overwrite) {
                const isDual = fileMerged.task === 'dual';
                if (isDual) {
                    const sourceSuffix = dualCore.resolveDualSourceSuffix(
                        fileMerged.language,
                        fileMerged.dualTargetSuffix,
                    );
                    const targetSuffix = dualCore.normalizeDualTargetSuffix(
                        fileMerged.dualTargetSuffix,
                    );
                    const { subFormats } = resolveEngineSubFormats(fileMerged);
                    const pair = resolveDualSubtitlePaths(mediaPath, outDir, {
                        sourceSuffix,
                        targetSuffix,
                        subFormats,
                    });
                    if (pair.complete) {
                        skipped += 1;
                        const skipPath = pair.targetPath || pair.sourcePath || '';
                        results.push(buildSkippedItemResult(mediaPath, {
                            subtitlePath: skipPath,
                            sourceSubtitlePath: pair.sourcePath || '',
                            targetSubtitlePath: pair.targetPath || '',
                        }));
                        sendProgress(invokeSender, {
                            stage: 'skipped',
                            index1,
                            total: list.length,
                            file: mediaPath,
                            percent: 100,
                            detail: '已有双语字幕',
                            subtitlePath: skipPath,
                            sourceSubtitlePath: pair.sourcePath || '',
                            targetSubtitlePath: pair.targetPath || '',
                        });
                        continue;
                    }
                } else {
                    const existing = resolveLocalSubtitlePath(mediaPath, outDir);
                    if (existing) {
                        skipped += 1;
                        results.push(buildSkippedItemResult(mediaPath, {
                            subtitlePath: existing,
                        }));
                        sendProgress(invokeSender, {
                            stage: 'skipped',
                            index1,
                            total: list.length,
                            file: mediaPath,
                            percent: 100,
                            detail: '已有字幕',
                            subtitlePath: existing,
                        });
                        continue;
                    }
                }
            }

            const {
                useSakuraMt,
                useSmartTranslate,
                useExternalMt,
                engineTask,
                jobMtModel,
            } = resolveFileMtPlan(fileMerged, {
                isLlmMtId,
                usesExternalMt,
                mapTaskToEngineTask,
            });

            // Never silently fall through to Opus when Sakura/smart was requested but
            // the external adapter was not started (would look like "missing opus-mt-*").
            if (useExternalMt && !mtAdapter?.ok) {
                const errMsg = mtAdapter?.error
                    || (useSakuraMt
                        ? `感知/表单指定了 ${fileMerged.engineMtModel || 'Sakura'}，但外部翻译适配器未启动`
                        : '智能翻译适配器未启动');
                failed += 1;
                results.push(buildFailedItemResult(mediaPath, errMsg));
                sendProgress(invokeSender, {
                    stage: 'failed',
                    index1,
                    total: list.length,
                    file: mediaPath,
                    error: errMsg,
                    detail: errMsg,
                });
                continue;
            }

            if (useSakuraMt) {
                appendEngineLogLine(
                    `[engine] #${index1}/${list.length} 翻译后端 · Sakura（${fileMerged.engineMtModel}）`,
                    invokeSender,
                );
            } else if (useSmartTranslate) {
                let smartBackend = '智能翻译';
                try {
                    const { readAdvancedDoc } = require('./advanced-license-data');
                    const { llmSourceLabel } = require('./advanced-llm-log');
                    const entitlement = require('../src/js/advanced-entitlement-core');
                    const src = entitlement.normalizeLlmSource(readAdvancedDoc().doc?.llmSource);
                    smartBackend = `智能翻译（${llmSourceLabel(src)}）`;
                } catch (_) { /* keep default */ }
                appendEngineLogLine(
                    `[engine] #${index1}/${list.length} 翻译后端 · ${smartBackend}`,
                    invokeSender,
                );
            }

            // Film flags were gated before job-start; only apply when requested.
            const filmEntitled = !!(fileMerged.filmAudioEnhance || fileMerged.filmVadPreset);

            const { subFormats, dualAss } = resolveEngineSubFormats(fileMerged);
            const jobFlags = buildEngineJobFlags(fileMerged, {
                sakuraOrSmart: useExternalMt,
            });
            const glossaryPairs = loadEngineGlossaryPairs({
                ...fileMerged,
                mtGlossaryMode: jobFlags.mtGlossaryMode,
            });
            const externalMtFields = useExternalMt && mtAdapter?.ok
                ? (typeof mtAdapter.mtExternal === 'function'
                    ? {
                        mtBackend: 'external',
                        mtExternal: mtAdapter.mtExternal(
                            useSmartTranslate
                                ? { batchSize: 40, timeoutSec: 1800 }
                                : { batchSize: 8, timeoutSec: 600 },
                        ),
                    }
                    : buildExternalMtJobFields({
                        url: mtAdapter.url,
                        token: mtAdapter.token,
                        batchSize: useSmartTranslate ? 40 : 8,
                        timeoutSec: useSmartTranslate ? 1800 : 600,
                    }))
                : null;

            const jobBody = {
                task: engineTask,
                mediaPath,
                outputDir: outDir,
                language: fileMerged.language || 'auto',
                asrModel: fileMerged.engineAsrModel || 'sensevoice-small',
                mtModel: jobMtModel,
                subFormats,
                dualAss,
                dualLineOrder: (() => {
                    const raw = fileMerged.dualLineOrder;
                    if (raw == null || String(raw).trim() === '') return 'target-first';
                    try {
                        const dualCore = require('../src/js/dual-subtitle-core');
                        return dualCore.normalizeDualLineOrder(raw);
                    } catch {
                        const order = String(raw).trim().toLowerCase();
                        if (order === 'source-first' || order === 'source') return 'source-first';
                        return 'target-first';
                    }
                })(),
                device: mapDeviceForEngine(fileMerged.device),
                beamSize: Math.max(1, Math.min(20, Number(fileMerged.beamSize) || 5)),
                vad: buildVadJobOptions(fileMerged),
                audio: buildAudioJobOptions(fileMerged, {
                    entitled: (!!fileMerged.filmAudioEnhance || !!fileMerged.filmVadPreset) && filmEntitled !== false,
                }),
                perfProfile: (() => {
                    const v = String(fileMerged.perfProfile || 'quality').trim().toLowerCase();
                    return v === 'speed' ? 'speed' : 'quality';
                })(),
                releaseGpuAfter: jobFlags.releaseGpuAfter,
                includeWords: jobFlags.includeWords,
                karaokeVtt: jobFlags.karaokeVtt,
                glossary: glossaryPairs,
                contentProfile: fileMerged.contentProfile || fileMerged.senseProfile || undefined,
                senseProfile: fileMerged.senseProfile || fileMerged.contentProfile || undefined,
                ...(fileMerged.timingAlign != null
                    ? { timingAlign: fileMerged.timingAlign }
                    : {}),
                ...(fileMerged.timingAlignModel != null
                    && String(fileMerged.timingAlignModel).trim() !== ''
                    ? { timingAlignModel: String(fileMerged.timingAlignModel).trim() }
                    : {}),
                // LLM MT: skip built-in JA name lexicon protect (__GLOSS*__),
                // which harms Sakura/smart quality vs the subtitle editor path.
                ...(useExternalMt ? { builtinNames: false } : {}),
                ...(externalMtFields || {}),
                ffmpegPath: (() => {
                    try {
                        const { resolveFfmpegForExecution, findBundledFfmpegPath } = require('./ffmpeg-bridge');
                        const resolved = resolveFfmpegForExecution(fileMerged.ffmpegPath);
                        let exe = resolved?.ok ? String(resolved.path || '').trim() : '';
                        if (!exe || exe === 'ffmpeg') {
                            exe = String(findBundledFfmpegPath?.() || '').trim();
                        }
                        if (!exe || exe === 'ffmpeg') {
                            exe = String(findEngineBundledFfmpeg(fileMerged.engineInstallPath) || '').trim();
                        }
                        return exe && exe !== 'ffmpeg' && fs.existsSync(exe) ? exe : '';
                    } catch {
                        return '';
                    }
                })(),
                sync: false,
            };

            const primaryAsr = String(fileMerged.engineAsrModel || 'sensevoice-small').trim()
                || 'sensevoice-small';
            const asrCandidates = rangeAsrPolicy.buildBatchAsrCandidates(primaryAsr);

            sendProgress(invokeSender, {
                stage: 'model',
                index1,
                total: list.length,
                file: mediaPath,
                detail: `创建引擎任务（${primaryAsr}）…`,
                percent: 2,
            });

            const buildJobBody = (asrModel) => ({
                ...jobBody,
                asrModel,
            });

            const runOutcome = await runEngineJobWithAsrFailover({
                baseUrl: ensure.baseUrl,
                buildJobBody,
                primaryAsr,
                candidates: asrCandidates,
                createJob,
                waitJob,
                shouldStop: () => batchCancelled,
                pingHealth: async (url) => {
                    const health = await getHealth(url || ensure.baseUrl, { timeoutMs: 2000 });
                    return {
                        ok: !!(health?.ok && health.data?.ok),
                        code: health?.code || '',
                        baseUrl: ensure.baseUrl,
                    };
                },
                restartEngine: async () => {
                    appendEngineLogLine(
                        '[engine] 引擎连接失败，正在重启后重试本条…',
                        invokeSender,
                    );
                    sendProgress(invokeSender, {
                        stage: 'starting',
                        index1,
                        total: list.length,
                        file: mediaPath,
                        detail: '引擎连接失败，正在重启后重试本条…',
                        percent: 2,
                    });
                    const again = await ensureEngineRunning({
                        ...merged,
                        forceRestart: true,
                        shouldStop: () => batchCancelled,
                    });
                    if (again?.ok) ensure = again;
                    return again;
                },
                onCandidate: ({ asrModel, index: candIdx }) => {
                    if (batchCancelled) return;
                    if (candIdx > 0) {
                        appendEngineLogLine(
                            `[engine] ASR 回退：${primaryAsr} → ${asrModel}`,
                            invokeSender,
                        );
                    }
                    sendProgress(invokeSender, {
                        stage: 'transcribe',
                        index1,
                        total: list.length,
                        file: mediaPath,
                        detail: candIdx === 0
                            ? `引擎转写中（${asrModel}）…`
                            : `${primaryAsr} 无结果，改用 ${asrModel}…`,
                        percent: 8,
                    });
                },
                onJobCreated: (jobId) => {
                    currentJobId = String(jobId || '');
                },
                onEvent: (ev) => {
                    if (batchCancelled) return;
                    const fields = progressFieldsFromWaitEvent(ev);
                    const jid = ev?.data?.id || currentJobId;
                    if (jid) currentJobId = String(jid);
                    if (String(fields.stage || '').toLowerCase() === 'translate'
                        || String(fields.stage || '').toLowerCase() === 'mt') {
                        noteEngineTranslatePercent(mtUiProgress, fields.percent);
                    }
                    sendProgress(invokeSender, {
                        ...fields,
                        index1,
                        total: list.length,
                        file: mediaPath,
                        jobId: currentJobId,
                    });
                },
            });
            // Keep last job id for cancel / checkpoint probe
            if (runOutcome.jobId) currentJobId = String(runOutcome.jobId);
            if (runOutcome.ok && runOutcome.asrModel && runOutcome.asrAttempts > 1) {
                appendEngineLogLine(
                    `[engine] ASR 回退成功：第 ${runOutcome.asrAttempts} 次候选 ${runOutcome.asrModel}`,
                    invokeSender,
                );
            }
            const waited = runOutcome.ok
                ? {
                    ok: true,
                    data: runOutcome.waited?.data || { result: runOutcome.result, id: runOutcome.jobId },
                    jobId: runOutcome.jobId,
                    asrModel: runOutcome.asrModel,
                }
                : {
                    ok: false,
                    error: runOutcome.error,
                    code: runOutcome.code,
                    cancelled: runOutcome.cancelled,
                    data: runOutcome.waited?.data,
                    jobId: runOutcome.jobId,
                    result: runOutcome.result,
                };
            const failedJobId = currentJobId;
            currentJobId = '';

            const waitInterp = interpretWaitJobResult(waited, batchCancelled);
            if (waitInterp.kind === 'cancelled') {
                const hint = await attachCheckpointResumeHint(
                    ensure.baseUrl,
                    failedJobId || waitInterp.jobId,
                    getJobCheckpoint,
                );
                const recovery = batchRecovery.buildBatchFailureGuidance({
                    message: '已取消',
                    code: 'cancelled',
                    resumable: hint.resumable,
                    resumeFromJobId: hint.resumeFromJobId,
                });
                results.push(buildCancelledItemResult(mediaPath, {
                    ...hint,
                    recovery,
                }));
                sendProgress(invokeSender, {
                    stage: 'cancelled',
                    index1,
                    total: list.length,
                    file: mediaPath,
                    detail: hint.resumable
                        ? `已取消（可从断点继续：${hint.resumeFromJobId}）`
                        : '已取消',
                    error: 'cancelled',
                    ...hint,
                    recovery,
                });
                break;
            }

            if (waitInterp.kind === 'failed') {
                const err = friendlyEngineError(waitInterp.error || '任务失败');
                const hint = await attachCheckpointResumeHint(
                    ensure.baseUrl,
                    failedJobId || waitInterp.jobId,
                    getJobCheckpoint,
                );
                const recovery = batchRecovery.buildBatchFailureGuidance({
                    message: err,
                    code: waitInterp.code || hint.checkpointStage || '',
                    resumable: hint.resumable,
                    resumeFromJobId: hint.resumeFromJobId,
                    asrCandidates: runOutcome.asrCandidates || asrCandidates,
                    asrAttempts: runOutcome.asrAttempts,
                    primaryAsr,
                    asrModel: runOutcome.asrModel,
                });
                failed += 1;
                results.push(buildFailedItemResult(mediaPath, err, {
                    code: waitInterp.code || '',
                    ...hint,
                    recovery,
                    asrAttempts: runOutcome.asrAttempts,
                    asrCandidates: runOutcome.asrCandidates || asrCandidates,
                    asrModel: runOutcome.asrModel || '',
                    primaryAsr,
                }));
                sendProgress(invokeSender, {
                    stage: 'error',
                    index1,
                    total: list.length,
                    file: mediaPath,
                    detail: recovery.shortTip ? `${err} · ${recovery.shortTip}` : err,
                    error: err,
                    errorCode: waitInterp.code || '',
                    ...hint,
                    recovery,
                    asrAttempts: runOutcome.asrAttempts,
                    asrCandidates: runOutcome.asrCandidates || asrCandidates,
                    asrModel: runOutcome.asrModel || '',
                    primaryAsr,
                });
                continue;
            }

            if (batchCancelled) {
                results.push(buildCancelledItemResult(mediaPath));
                break;
            }

            const outPaths = extractOutputPaths(waitInterp.result || waited.data?.result);
            const jobResult = waitInterp.result || waited.data?.result || null;

            // Free-path postprocess (same knobs as UI post-batch): strip Whisper YouTube-style hallucinations etc.
            const { applyPostBatchPipeline } = require('./post-batch-pipeline');
            applyPostBatchPipeline([
                outPaths.sourceSubtitlePath,
                outPaths.targetSubtitlePath,
                outPaths.bilingualSubtitlePath,
                outPaths.subtitlePath,
            ], merged, {
                onProgress: (info) => {
                    sendProgress(invokeSender, {
                        stage: 'transcribe',
                        index1,
                        total: list.length,
                        file: mediaPath,
                        detail: info?.detail || '后处理字幕…',
                        percent: 96,
                    });
                },
                onLog: (line) => {
                    appendEngineLogLine(`[engine] ${line}`, invokeSender);
                },
            });

            // File-level MT sanitize (Opus + any adapter miss): strip trailing cast-name
            // hallucinations / Gloss / loops on ZH against JA source or result.cues.source.
            const translateLike = batchPostprocessPlan.isTranslateLikeTask(fileMerged.task, engineTask);
            if (translateLike && merged.mtSanitize !== false) {
                try {
                    const { sanitizeMtSubtitlePair } = require('./extensions-bridge');
                    const uniqueZh = batchPostprocessPlan.collectUniqueZhSubtitlePaths(outPaths, {
                        resolve: path.resolve,
                        existsSync: (p) => fs.existsSync(p),
                    });
                    for (const zhPath of uniqueZh) {
                        sendProgress(invokeSender, {
                            stage: 'translate',
                            index1,
                            total: list.length,
                            file: mediaPath,
                            detail: '后处理：译后清洗…',
                            percent: 97,
                        });
                        const sm = sanitizeMtSubtitlePair(zhPath, outPaths.sourceSubtitlePath, {
                            sourceCues: jobResult?.cues?.source,
                            contentProfile: fileMerged.contentProfile || fileMerged.senseProfile,
                            senseProfile: fileMerged.senseProfile || fileMerged.contentProfile,
                            sakuraNsfwPrompt: fileMerged.sakuraNsfwPrompt,
                            nsfwPrompt: fileMerged.nsfwPrompt,
                            smartTranslateFaithfulTone: fileMerged.smartTranslateFaithfulTone
                                || fileMerged.faithfulTone,
                            faithfulTone: fileMerged.faithfulTone
                                || fileMerged.smartTranslateFaithfulTone,
                            applyNsfwLexicon: fileMerged.applyNsfwLexicon,
                            backupMode: 'off',
                        });
                        if (sm?.ok && sm.changed) {
                            appendEngineLogLine(
                                `[engine] ${sm.summary || '译后清洗'} ${path.basename(zhPath)}`,
                                invokeSender,
                            );
                            if (sm.jaAsrDomainChanged > 0 || sm.sourceDomainCleaned > 0) {
                                const trace = summarizeDomainFixChanges([{
                                    from: 'ja-asr-domain',
                                    to: 'applied',
                                    count: (sm.jaAsrDomainChanged || 0) + (sm.sourceDomainCleaned || 0),
                                }], 'desktop_sanitize');
                                const line = formatDomainFixLogLine(trace);
                                if (line) appendEngineLogLine(line, invokeSender);
                            }
                        }
                    }
                } catch (err) {
                    appendEngineLogLine(
                        `[engine] 译后清洗跳过：${err.message || err}`,
                        invokeSender,
                    );
                }
            }

            // Optional compact delivery: drop pure discourse / onomatopoeia pairs from ZH+JA.
            const {
                dropDiscourse,
                dropOnomatopoeia,
                shouldCompact,
            } = batchPostprocessPlan.resolveInterjectionDropFlags(merged);
            if (translateLike && shouldCompact) {
                try {
                    const { compactPureInterjectionSubtitlePair } = require('./extensions-bridge');
                    const uniqueZh = batchPostprocessPlan.collectUniqueZhSubtitlePaths(outPaths, {
                        resolve: path.resolve,
                        existsSync: (p) => fs.existsSync(p),
                    });
                    for (const zhPath of uniqueZh) {
                        sendProgress(invokeSender, {
                            stage: 'translate',
                            index1,
                            total: list.length,
                            file: mediaPath,
                            detail: '后处理：清除语气/拟声…',
                            percent: 97.5,
                        });
                        const cm = compactPureInterjectionSubtitlePair(
                            zhPath,
                            outPaths.sourceSubtitlePath,
                            {
                                sourceCues: jobResult?.cues?.source,
                                backupMode: 'off',
                                dropDiscourse,
                                dropOnomatopoeia,
                            },
                        );
                        if (cm?.ok && cm.dropped) {
                            appendEngineLogLine(
                                `[engine] ${cm.summary || '清除语气/拟声'} ${path.basename(zhPath)}`,
                                invokeSender,
                            );
                        }
                    }
                } catch (err) {
                    appendEngineLogLine(
                        `[engine] 清除语气/拟声跳过：${err.message || err}`,
                        invokeSender,
                    );
                }
            }

            // Keep ASR/source transcript archive before optional dual-track deletion.
            // translate_mt normally deletes `.src.partial.*` and only returns zh outputs —
            // fall back to result.cues.source so「保存转录字幕」 still works.
            // Prefer the keep path for history/library when the sidecar is later deleted.
            let keptSourcePath = '';
            try {
                const { keepTranscriptFromJobResult } = require('./transcript-keep');
                const kept = keepTranscriptFromJobResult({
                    task: merged.task,
                    sourceSubtitlePath: outPaths.sourceSubtitlePath,
                    subtitlePath: outPaths.subtitlePath,
                    sourceCues: jobResult?.cues?.source,
                    mediaPath,
                    options: merged,
                });
                if (kept?.ok && kept.kept?.length) {
                    keptSourcePath = String(kept.kept[0] || '').trim();
                    appendEngineLogLine(
                        `[engine] 已保存转录字幕 ${kept.kept.length} 个 → ${kept.dir || ''}`,
                        invokeSender,
                    );
                } else if (kept && kept.ok === false && kept.error) {
                    appendEngineLogLine(
                        `[engine] 保存转录字幕失败: ${kept.error}`,
                        invokeSender,
                    );
                }
            } catch (err) {
                appendEngineLogLine(
                    `[engine] 保存转录字幕跳过: ${err.message || err}`,
                    invokeSender,
                );
            }

            // 「合并双语」：写出与影片同名的可编辑 SRT（与 TWAI 一致）；可选再删原/译单轨。
            // 不再依赖 *.dual.ass 已存在——仅勾选合并、未勾选删原轨时也应合并。
            let doneDetail = outPaths.bilingualSubtitlePath ? '完成（含双语 ASS）' : '完成';
            if (fileMerged.mergeBilingualSubtitles && engineTask === 'dual') {
                try {
                    const { finalizeEngineDualMerge } = require('./subtitle-fs-helpers');
                    const finalized = finalizeEngineDualMerge(outPaths, {
                        mergeBilingualSubtitles: true,
                        deleteSourcesAfterMergeBilingual: !!fileMerged.deleteSourcesAfterMergeBilingual,
                        dualPrimaryTrack: fileMerged.dualPrimaryTrack || 'target',
                        dualLineOrder: fileMerged.dualLineOrder || 'target-first',
                    });
                    Object.assign(outPaths, finalized.outPaths);
                    doneDetail = finalized.detail || doneDetail;
                    if (finalized.error) {
                        appendEngineLogLine(
                            `[engine] 双语合并跳过：${finalized.error.message || finalized.error}`,
                            invokeSender,
                        );
                    } else if (finalized.mergedPath) {
                        appendEngineLogLine(
                            `[engine] 已合并双语 → ${path.basename(finalized.mergedPath)}`,
                            invokeSender,
                        );
                        // Ensure player-facing bilingual inherits viewing punct / in-cue clear.
                        applyPostBatchPipeline([finalized.mergedPath], merged, {
                            onLog: (line) => {
                                appendEngineLogLine(`[engine] ${line}`, invokeSender);
                            },
                        });
                    }
                } catch (err) {
                    appendEngineLogLine(
                        `[engine] 双语合并跳过：${err.message || err}`,
                        invokeSender,
                    );
                }
            }

            // Seed ASR confidence after paths are final (post-merge).
            try {
                const { runBatchSuccessHandoff } = require('./engine-batch-success-handoff');
                const handoff = runBatchSuccessHandoff(jobResult, outPaths);
                for (const line of (handoff.logs || [])) {
                    appendEngineLogLine(`[engine] ${line}`, invokeSender);
                }
            } catch (err) {
                appendEngineLogLine(
                    `[engine] 完成后交接跳过: ${err.message || err}`,
                    invokeSender,
                );
            }

            // Library 原文轨需要每次任务的转录：旁路被合并删除后改指向 keep 归档。
            const liveSource = String(outPaths.sourceSubtitlePath || '').trim();
            if ((!liveSource || !fs.existsSync(liveSource)) && keptSourcePath && fs.existsSync(keptSourcePath)) {
                outPaths.sourceSubtitlePath = keptSourcePath;
            }

            generated += 1;
            const asrRun = summarizeAsrRunMeta({
                asrModel: runOutcome.asrModel || waited.asrModel || primaryAsr,
                primaryAsr,
                asrAttempts: runOutcome.asrAttempts,
            });
            doneDetail = appendAsrRunToDetail(doneDetail, asrRun);
            results.push({
                ok: true,
                path: mediaPath,
                result: jobResult,
                asrModel: asrRun.asrModel,
                primaryAsr: asrRun.primaryAsr,
                asrAttempts: asrRun.asrAttempts,
                asrFailedOver: asrRun.failedOver,
                ...outPaths,
            });
            sendProgress(invokeSender, {
                stage: 'done',
                index1,
                total: list.length,
                file: mediaPath,
                percent: 100,
                detail: doneDetail,
                asrModel: asrRun.asrModel,
                primaryAsr: asrRun.primaryAsr,
                asrAttempts: asrRun.asrAttempts,
                asrFailedOver: asrRun.failedOver,
                ...outPaths,
            });
            } finally {
                liveBatch.clearCurrent();
                try {
                    require('./temp-cleanup').cleanupAfterJob();
                } catch { /* ignore */ }
            }
        }

        const cancelled = batchCancelled;
        const finished = {
            ok: !cancelled && failed === 0,
            cancelled,
            generated,
            skipped,
            failed: cancelled ? failed + (list.length - results.length) : failed,
            results,
        };
        batchFailedOrCancelled = !finished.ok || !!finished.cancelled;
        recordEngineBatchHistory({
            list,
            merged,
            finished,
            startedAt: jobStartedAt,
            startedMs: jobStartedMs,
        });
        emitToSubtitleUi('subtitle-task-job-finished', finished, invokeSender);
        if (!cancelled) {
            try {
                deferredEnsureTwai();
                const {
                    setSessionPostTaskOptions,
                    deferBatchFinalize,
                } = require('./transwithai-bridge');
                if (typeof setSessionPostTaskOptions !== 'function'
                    || typeof deferBatchFinalize !== 'function') {
                    throw new Error('deferBatchFinalize is not available');
                }
                if (lastOutputDir) {
                    setSessionPostTaskOptions({ lastOutputDir });
                }
                // Tray notify / sound / shutdown wait until UI finishes post-batch (incl. QC fix).
                deferBatchFinalize(merged, finished, engineUiWindowManager);
            } catch (err) {
                console.warn('[engine] defer batch finalize failed:', err?.message || err);
            }
        } else {
            try {
                const { clearDeferredBatchFinalize } = require('./transwithai-bridge');
                clearDeferredBatchFinalize?.();
            } catch { /* ignore */ }
        }
        return finished;
    } catch (err) {
        batchFailedOrCancelled = true;
        const finished = {
            ok: false,
            cancelled: false,
            generated,
            skipped,
            failed: Math.max(failed, 1),
            error: err.message || String(err),
            results,
        };
        recordEngineBatchHistory({
            list,
            merged,
            finished,
            startedAt: jobStartedAt,
            startedMs: jobStartedMs,
            extraErrors: [finished.error],
        });
        emitToSubtitleUi('subtitle-task-job-finished', finished, invokeSender);
        return finished;
    } finally {
        try {
            mtAdapter?.stop?.();
        } catch { /* ignore */ }
        abortBatchMtAdapter();
        try {
            require('./temp-cleanup').cleanupAfterJob();
        } catch { /* ignore */ }
        try {
            reclaimLocalComputeAfterEngineBatch({
                usedExternalMt,
                failedOrCancelled: batchFailedOrCancelled || batchCancelled,
            });
        } catch { /* ignore */ }
        batchRunning = false;
        currentJobId = '';
        try {
            require('./live-batch-queue').end();
        } catch { /* ignore */ }
    }
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

    register('transub-engine-bundled-path', async () => {
        try {
            const bundled = getBundledEnginePath();
            const present = isValidEngineRoot(bundled);
            return {
                ok: true,
                path: bundled,
                present,
                resolved: present ? bundled : getBundledEnginePathIfPresent(),
            };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

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
                models: [
                    ...(Array.isArray(res.data?.models) ? res.data.models : []),
                    ...sakuraModels,
                ],
                profiles: res.data?.profiles || {},
                raw: res.data,
            };
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
            return { ok: true, ...(res.data || {}), status: res.status };
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
        if (batchRunning) {
            return { ok: false, error: '字幕任务进行中，请先停止任务再下载模型 / 组件' };
        }
        if (downloadBusy) {
            return { ok: false, error: '已有下载任务正在进行' };
        }
        downloadBusy = true;
        downloadAbort = new AbortController();
        const signal = downloadAbort.signal;
        const kind = normalizeEngineDownloadKind(payload.kind);
        const emit = (info) => {
            broadcastEngineDownloadProgress({ ...(info || {}), kind });
        };
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

            if (batchRunning) {
                return { ok: false, error: '字幕任务进行中，请先停止任务再下载模型 / 组件' };
            }
            // Always reclaim engine + listen port before pip extras — orphaned
            // runtime\\python.exe holding onnxruntime/av DLLs causes WinError 5.
            try {
                stopEngineProcessAndPort();
            } catch {
                try { stopEngineProcess(); } catch { /* ignore */ }
            }
            await sleep(1200);

            // ASR extras must install while the engine is stopped: a running
            // server already imports native wheels and Windows then denies
            // overwrite (WinError 5 / 拒绝访问).
            const earlyModelIds = Array.isArray(payload.modelIds)
                ? payload.modelIds.map((id) => String(id || '').trim()).filter(Boolean)
                : [];
            const needWhisperExtras = !!payload.force || modelIdsNeedWhisperExtras(earlyModelIds);
            const needSensevoiceExtras = !!payload.force || modelIdsNeedSensevoiceExtras(earlyModelIds);
            const installPath = resolveEngineInstallPath(optionsWithHf.engineInstallPath);
            const pythonPath = resolveEngineRuntimePython(installPath);

            const runOfflineExtras = async ({ need, ensureFn, label, pctBase }) => {
                if (!need || !pythonPath) return { ok: true, skipped: true };
                emit({
                    phase: 'progress',
                    message: `正在补齐 ${label}（引擎已停止，避免文件占用）…`,
                    pct: pctBase,
                });
                let pre = await ensureFn({
                    pythonPath,
                    cwd: installPath,
                    force: false,
                    signal,
                    onProgress: (ev) => {
                        const pct = Number(ev.percent);
                        emit({
                            phase: 'progress',
                            message: ev.detail || ev.message || `正在安装 ${label}…`,
                            pct: Number.isFinite(pct)
                                ? Math.min(pctBase + 12, pctBase + Math.round(pct * 0.12))
                                : pctBase + 2,
                            raw: ev,
                        });
                    },
                });
                if (
                    !pre.ok
                    && pre.code === 'EXTRAS_LOCKED_IN_PROCESS'
                    && !signal?.aborted
                ) {
                    // Do NOT --force-reinstall the full Whisper stack: onnxruntime-gpu
                    // from 「下载 GPU 支持」is often already mapped and WinError 5 again.
                    // Stop harder, wait, then install only still-missing wheels.
                    emit({
                        phase: 'progress',
                        message: `${label}文件被占用，正在彻底停止引擎后重试（仅补缺失项）…`,
                        pct: pctBase + 2,
                    });
                    try {
                        stopEngineProcessAndPort();
                    } catch { /* ignore */ }
                    await sleep(1500);
                    pre = await ensureFn({
                        pythonPath,
                        cwd: installPath,
                        force: false,
                        signal,
                        onProgress: (ev) => {
                            const pct = Number(ev.percent);
                            emit({
                                phase: 'progress',
                                message: ev.detail || ev.message || `正在重试安装 ${label}…`,
                                pct: Number.isFinite(pct)
                                    ? Math.min(pctBase + 14, pctBase + 2 + Math.round(pct * 0.12))
                                    : pctBase + 4,
                                raw: ev,
                            });
                        },
                    });
                }
                return pre;
            };

            if (kind === 'models' && (needWhisperExtras || needSensevoiceExtras)) {
                if (needWhisperExtras) {
                    const pre = await runOfflineExtras({
                        need: true,
                        ensureFn: ensureAsrWhisperOffline,
                        label: 'Whisper 运行库',
                        pctBase: 3,
                    });
                    if (pre.cancelled || signal.aborted) {
                        emit({ phase: 'cancelled', ok: false, message: '已取消', pct: 0 });
                        return { ok: false, cancelled: true, error: 'cancelled' };
                    }
                    if (!pre.ok && pre.code !== 'SMART_APP_CONTROL' && !pre.skipped) {
                        const err = pre.error || pre.message || 'Whisper 运行库安装失败';
                        // Do not block SenseVoice repair when LID/Whisper extras fail first.
                        if (needSensevoiceExtras) {
                            emit({
                                phase: 'progress',
                                message: `Whisper 运行库暂未装好：${err}；继续补齐 SenseVoice…`,
                                pct: 8,
                            });
                        } else {
                            emit({ phase: 'error', ok: false, message: err, pct: 0 });
                            return { ok: false, error: err, code: pre.code || '', logTail: pre.logTail };
                        }
                    } else if (pre.code === 'SMART_APP_CONTROL') {
                        emit({
                            phase: 'progress',
                            message: pre.message || pre.error || 'Whisper 运行库受系统策略拦截，将继续尝试其它项…',
                            pct: 8,
                        });
                    }
                }
                if (needSensevoiceExtras) {
                    const pre = await runOfflineExtras({
                        need: true,
                        ensureFn: ensureAsrSensevoiceOffline,
                        label: 'SenseVoice 运行库',
                        pctBase: needWhisperExtras ? 10 : 3,
                    });
                    if (pre.cancelled || signal.aborted) {
                        emit({ phase: 'cancelled', ok: false, message: '已取消', pct: 0 });
                        return { ok: false, cancelled: true, error: 'cancelled' };
                    }
                    if (!pre.ok && pre.code !== 'SMART_APP_CONTROL' && !pre.skipped) {
                        const err = pre.error || pre.message || 'SenseVoice 运行库安装失败';
                        emit({ phase: 'error', ok: false, message: err, pct: 0 });
                        return { ok: false, error: err, code: pre.code || '', logTail: pre.logTail };
                    }
                    if (pre.code === 'SMART_APP_CONTROL') {
                        emit({
                            phase: 'progress',
                            message: pre.message || pre.error || 'SenseVoice 运行库受系统策略拦截，将继续尝试其它项…',
                            pct: 14,
                        });
                    }
                }
            }

            emit({ phase: 'progress', message: '正在启动引擎…', pct: 2 });
            let ensure = await ensureEngineRunning(optionsWithHf);
            const sakuraCatalogEarly = require('../src/js/sakura-mt-catalog-core');
            const earlyIds = Array.isArray(payload.modelIds)
                ? payload.modelIds.map((id) => String(id || '').trim()).filter(Boolean)
                : [];
            const earlySakuraOnly = earlyIds.length > 0
                && earlyIds.every((id) => sakuraCatalogEarly.isSakuraMtModel(id));
            if (!ensure.ok) {
                if (kind === 'models' && earlySakuraOnly) {
                    emit({
                        phase: 'progress',
                        message: '引擎未就绪，仅下载 Sakura GGUF…',
                        pct: 10,
                    });
                    // Skip to sakura-only path below via empty engine + selected sakura ids
                    ensure = { ok: true, baseUrl: optionsWithHf.engineUrl || DEFAULT_ENGINE_URL };
                } else {
                    emit({ phase: 'error', ok: false, message: ensure.error || '引擎未就绪', pct: 0 });
                    return ensure;
                }
            }
            let baseUrl = ensure.baseUrl;

            if (kind === 'demucs') {
                emit({ phase: 'progress', message: '正在安装 Demucs + CUDA PyTorch（若有 GPU）…', pct: 8 });
                const res = await ensureAudioSeparateRuntimeStream(baseUrl, {
                    force: !!payload.force,
                }, {
                    timeoutMs: 3600000,
                    signal,
                    onEvent: (ev) => {
                        const pct = Number(ev.percent);
                        emit({
                            phase: ev.type === 'done' ? 'done' : (ev.type === 'error' ? 'error' : 'progress'),
                            ok: ev.type === 'error' ? false : undefined,
                            message: ev.detail || ev.message || ev.hint || ev.stage || '处理中…',
                            pct: Number.isFinite(pct) ? pct : undefined,
                            raw: ev,
                        });
                    },
                });
                if (res.cancelled || signal.aborted) {
                    emit({ phase: 'cancelled', ok: false, message: '已取消', pct: 0 });
                    return { ok: false, cancelled: true, error: 'cancelled' };
                }
                if (!res.ok) {
                    const err = res.error || res.data?.message || 'Demucs 安装失败';
                    emit({ phase: 'error', ok: false, message: err, pct: 0 });
                    return { ok: false, error: err, raw: res.data };
                }
                emit({ phase: 'progress', message: '正在重启引擎…', pct: 92 });
                if (engineProc) {
                    stopEngineProcess();
                    await sleep(800);
                }
                const ensure2 = await ensureEngineRunning({ ...optionsWithHf, forceRestart: true });
                if (!ensure2.ok) {
                    const msg = (res.data?.message || 'Demucs 已安装') + '（引擎重启失败，请手动检测引擎）';
                    emit({ phase: 'done', ok: true, message: msg, pct: 100 });
                    return { ok: true, restarted: false, message: msg, ...(res.data || {}) };
                }
                const statusRes = await getAudioSeparateRuntime(ensure2.baseUrl, { timeoutMs: 20000 });
                const message = statusRes.data?.hint || res.data?.message || 'Demucs 已就绪';
                emit({ phase: 'done', ok: true, message, pct: 100 });
                return {
                    ok: true,
                    restarted: true,
                    probe: statusRes.data || res.data?.probe,
                    message,
                    ...(res.data || {}),
                };
            }

            if (kind === 'gpu') {
                emit({ phase: 'progress', message: '检测 GPU 并安装 CUDA 12 运行库…', pct: 8 });
                const res = await ensureGpuRuntimeStream(baseUrl, {
                    force: !!payload.force,
                }, {
                    timeoutMs: 1800000,
                    signal,
                    onEvent: (ev) => {
                        const pct = Number(ev.percent);
                        const downloadedBytes = Number(
                            ev.downloadedBytes ?? ev.received ?? ev.downloaded,
                        );
                        const totalBytes = Number(ev.totalBytes ?? ev.totalSize);
                        const bytesPerSecond = Number(ev.bytesPerSecond ?? ev.speed);
                        emit({
                            phase: ev.type === 'done' ? 'done' : (ev.type === 'error' ? 'error' : 'progress'),
                            ok: ev.type === 'error' ? false : undefined,
                            message: ev.detail || ev.message || ev.hint || ev.stage || '处理中…',
                            pct: Number.isFinite(pct) ? pct : undefined,
                            downloadedBytes: Number.isFinite(downloadedBytes) && downloadedBytes >= 0
                                ? downloadedBytes
                                : undefined,
                            totalBytes: Number.isFinite(totalBytes) && totalBytes > 0 ? totalBytes : undefined,
                            bytesPerSecond: Number.isFinite(bytesPerSecond) && bytesPerSecond > 0
                                ? bytesPerSecond
                                : undefined,
                            suggestManual: !!ev.suggestManual,
                            raw: ev,
                        });
                    },
                });
                if (res.cancelled || signal.aborted) {
                    emit({ phase: 'cancelled', ok: false, message: '已取消', pct: 0 });
                    return { ok: false, cancelled: true, error: 'cancelled' };
                }
                if (!res.ok) {
                    const err = res.error || res.data?.message || 'GPU 支持安装失败';
                    emit({ phase: 'error', ok: false, message: err, pct: 0 });
                    return { ok: false, error: err, raw: res.data };
                }
                emit({ phase: 'progress', message: '正在重启引擎以加载运行库…', pct: 92 });
                if (engineProc) {
                    stopEngineProcess();
                    await sleep(800);
                }
                const ensure2 = await ensureEngineRunning({ ...optionsWithHf, forceRestart: true });
                if (!ensure2.ok) {
                    const msg = (res.data?.message || 'GPU 支持已安装') + '（引擎重启失败，请手动检测引擎）';
                    emit({ phase: 'done', ok: true, message: msg, pct: 100 });
                    return { ok: true, restarted: false, message: msg, ...(res.data || {}) };
                }
                const statusRes = await getGpuRuntime(ensure2.baseUrl, { timeoutMs: 20000 });
                const message = statusRes.data?.hint || res.data?.message || 'GPU 支持已就绪';
                emit({ phase: 'done', ok: true, message, pct: 100 });
                return {
                    ok: true,
                    restarted: true,
                    probe: statusRes.data || res.data?.probe,
                    message,
                    ...(res.data || {}),
                };
            }

            // models — optionally install GPU runtime first when missing
            try {
                const gpuStatus = await getGpuRuntime(baseUrl, { timeoutMs: 15000 });
                const st = gpuStatus.data?.status;
                if (gpuStatus.ok && (st === 'need_install' || st === 'partial')) {
                    if (payload.skipGpuPrestep) {
                        emit({
                            phase: 'progress',
                            message: '已跳过自动安装 GPU 支持（可稍后单独修复）',
                            pct: 36,
                        });
                    } else {
                        emit({
                            phase: 'progress',
                            message: gpuStatus.data?.hint || '检测到 GPU，先安装 CUDA 运行库…',
                            pct: 4,
                        });
                        const gpuRes = await ensureGpuRuntimeStream(baseUrl, { force: false }, {
                            timeoutMs: 1800000,
                            signal,
                            onEvent: (ev) => {
                                const pct = Number(ev.percent);
                                const mapped = Number.isFinite(pct) ? Math.min(35, Math.round(pct * 0.35)) : undefined;
                                const downloadedBytes = Number(
                                    ev.downloadedBytes ?? ev.received ?? ev.downloaded,
                                );
                                const totalBytes = Number(ev.totalBytes ?? ev.totalSize);
                                const bytesPerSecond = Number(ev.bytesPerSecond ?? ev.speed);
                                emit({
                                    phase: 'progress',
                                    message: `GPU：${ev.detail || ev.message || ev.stage || '安装中…'}`,
                                    pct: mapped,
                                    downloadedBytes: Number.isFinite(downloadedBytes) && downloadedBytes >= 0
                                        ? downloadedBytes
                                        : undefined,
                                    totalBytes: Number.isFinite(totalBytes) && totalBytes > 0 ? totalBytes : undefined,
                                    bytesPerSecond: Number.isFinite(bytesPerSecond) && bytesPerSecond > 0
                                        ? bytesPerSecond
                                        : undefined,
                                    suggestManual: !!ev.suggestManual,
                                    raw: ev,
                                });
                            },
                        });
                        if (gpuRes.cancelled || signal.aborted) {
                            emit({ phase: 'cancelled', ok: false, message: '已取消', pct: 0 });
                            return { ok: false, cancelled: true, error: 'cancelled' };
                        }
                        if (!gpuRes.ok) {
                            emit({
                                phase: 'progress',
                                message: `GPU 预装未完成（${gpuRes.error || gpuRes.data?.message || '继续下载模型'}），先继续模型/运行库…`,
                                pct: 36,
                            });
                        } else {
                            if (engineProc) {
                                stopEngineProcess();
                                await sleep(600);
                            }
                            const ensureAfterGpu = await ensureEngineRunning({ ...optionsWithHf, forceRestart: true });
                            if (!ensureAfterGpu.ok) {
                                // Do not abort models/runtime download — one-click fix can continue
                                // and a later round / ensure-gpu step can recover.
                                emit({
                                    phase: 'progress',
                                    message: 'GPU 安装后引擎重启失败，仍继续下载模型/运行库…',
                                    pct: 36,
                                });
                            } else {
                                ensure = ensureAfterGpu;
                                baseUrl = ensureAfterGpu.baseUrl || baseUrl;
                                emit({ phase: 'progress', message: 'GPU 支持已处理，开始下载模型…', pct: 38 });
                            }
                        }
                    }
                }
            } catch { /* ignore optional GPU pre-step */ }

            // models — only selected IDs (do not merge profile when explicit list is sent)
            const sakuraCatalog = require('../src/js/sakura-mt-catalog-core');
            const allSelected = Array.isArray(payload.modelIds)
                ? payload.modelIds.map((id) => String(id || '').trim()).filter(Boolean)
                : [];
            const sakuraIds = allSelected.filter((id) => sakuraCatalog.isSakuraMtModel(id));
            const engineIds = allSelected.filter((id) => !sakuraCatalog.isSakuraMtModel(id));
            const useExplicitSelection = allSelected.length > 0;
            const profile = useExplicitSelection
                ? undefined
                : (payload.profile || options.engineProfile || 'balanced');

            if (!useExplicitSelection && !profile) {
                emit({ phase: 'error', ok: false, message: '未选择要下载的模型', pct: 0 });
                return { ok: false, error: '未选择要下载的模型' };
            }

            const doneIds = [];
            if (engineIds.length || profile) {
                emit({
                    phase: 'progress',
                    message: useExplicitSelection
                        ? `开始下载引擎模型（${engineIds.join(', ')}）…`
                        : `开始下载模型（档位 ${profile}）…`,
                    pct: 40,
                });
                const res = await downloadModelsStream(baseUrl, {
                    profile: profile || undefined,
                    modelIds: engineIds.length ? engineIds : undefined,
                    hfEndpoint,
                    hfToken: hfToken || undefined,
                    force: !!payload.force,
                }, {
                    timeoutMs: 1800000,
                    signal,
                    onEvent: (ev) => {
                        const stage = String(ev.stage || '').toLowerCase();
                        let pct = Number(ev.percent);
                        const downloadedBytes = Number(
                            ev.downloadedBytes ?? ev.received ?? ev.downloaded,
                        );
                        // Do not fall back to ev.total — engine SSE uses `total` for model count.
                        const totalBytes = Number(ev.totalBytes ?? ev.totalSize);
                        const bytesPerSecond = Number(ev.bytesPerSecond ?? ev.speed);
                        // Pip extras often omit percent; synthesize from byte counters.
                        if (!Number.isFinite(pct)
                            && Number.isFinite(downloadedBytes) && downloadedBytes >= 0
                            && Number.isFinite(totalBytes) && totalBytes > 0) {
                            pct = Math.max(0, Math.min(99, Math.round((downloadedBytes / totalBytes) * 100)));
                        }
                        let mapped;
                        if (Number.isFinite(pct)) {
                            if (stage === 'pip') {
                                // Reserve 40–58% for dependency wheels (torch etc.).
                                mapped = Math.min(58, 40 + Math.round(pct * 0.18));
                            } else {
                                mapped = Math.min(85, 58 + Math.round(pct * 0.27));
                            }
                        }
                        const detail = ev.detail || ev.message || '';
                        const modelId = ev.modelId ? ` [${ev.modelId}]` : '';
                        emit({
                            phase: ev.type === 'done' ? 'progress' : (ev.type === 'error' ? 'error' : 'progress'),
                            ok: ev.type === 'error' ? false : undefined,
                            message: `${detail}${modelId}`.trim() || '下载中…',
                            pct: mapped,
                            modelId: modelId || ev.modelId || undefined,
                            index: Number.isFinite(Number(ev.index)) ? Number(ev.index) : undefined,
                            downloadedBytes: Number.isFinite(downloadedBytes) && downloadedBytes >= 0
                                ? downloadedBytes
                                : undefined,
                            totalBytes: Number.isFinite(totalBytes) && totalBytes > 0 ? totalBytes : undefined,
                            bytesPerSecond: Number.isFinite(bytesPerSecond) && bytesPerSecond > 0
                                ? bytesPerSecond
                                : undefined,
                            suggestManual: !!ev.suggestManual,
                            raw: ev,
                        });
                    },
                });
                if (res.cancelled || signal.aborted) {
                    emit({ phase: 'cancelled', ok: false, message: '已取消', pct: 0 });
                    return { ok: false, cancelled: true, error: 'cancelled' };
                }
                if (!res.ok) {
                    const rawMsg = res.error || res.data?.message || res.data?.error || '模型下载失败';
                    const hint = /connecttimeout|10060|timed out|internet connection|connection reset|10054/i.test(String(rawMsg))
                        && !hfEndpoint
                        ? '（可在设置中填写 Hugging Face 镜像 https://hf-mirror.com 后重试）'
                        : /gated|authorized list|门禁/i.test(String(rawMsg)) && !hfToken
                            ? '（请在设置 → 网络填写 Hugging Face Token，并在官网同意模型条款后重试）'
                            : '';
                    const err = `${rawMsg}${hint}`;
                    emit({ phase: 'error', ok: false, message: err, pct: 0 });
                    return { ok: false, error: err, raw: res.data };
                }
                const results = Array.isArray(res.data?.results) ? res.data.results : [];
                doneIds.push(...results.filter((r) => r?.ok).map((r) => r.id).filter(Boolean));
            }

            if (sakuraIds.length) {
                const sakuraMt = require('./sakura-mt');
                for (let i = 0; i < sakuraIds.length; i += 1) {
                    if (signal.aborted) {
                        emit({ phase: 'cancelled', ok: false, message: '已取消', pct: 0 });
                        return { ok: false, cancelled: true, error: 'cancelled' };
                    }
                    const sid = sakuraIds[i];
                    const basePct = 85 + Math.round((i / Math.max(1, sakuraIds.length)) * 14);
                    emit({
                        phase: 'progress',
                        message: `下载 Sakura（${sid}）${i + 1}/${sakuraIds.length}…`,
                        pct: basePct,
                    });
                    const pull = await sakuraMt.pullSakuraModel({
                        modelId: sid,
                        force: !!payload.force,
                        signal,
                        onProgress: (p) => {
                            const pct = Number(p?.pct ?? p?.percent);
                            const downloadedBytes = Number(
                                p?.downloadedBytes ?? p?.received ?? p?.downloaded,
                            );
                            const totalBytes = Number(p?.totalBytes ?? p?.total);
                            const bytesPerSecond = Number(p?.bytesPerSecond ?? p?.speed);
                            emit({
                                phase: p?.phase === 'done' ? 'progress' : (p?.phase || 'progress'),
                                message: p?.message || `Sakura ${sid}`,
                                pct: Number.isFinite(pct)
                                    ? Math.min(99, basePct + Math.round(pct * 0.14 / sakuraIds.length))
                                    : undefined,
                                downloadedBytes: Number.isFinite(downloadedBytes) && downloadedBytes >= 0
                                    ? downloadedBytes
                                    : undefined,
                                totalBytes: Number.isFinite(totalBytes) && totalBytes > 0 ? totalBytes : undefined,
                                bytesPerSecond: Number.isFinite(bytesPerSecond) && bytesPerSecond > 0
                                    ? bytesPerSecond
                                    : undefined,
                            });
                        },
                    });
                    if (!pull?.ok) {
                        const err = pull?.error || `Sakura ${sid} 下载失败`;
                        emit({ phase: 'error', ok: false, message: err, pct: 0 });
                        return { ok: false, error: err };
                    }
                    doneIds.push(sid);
                }
            }

            const message = `模型下载完成${doneIds.length ? `：${doneIds.join(', ')}` : ''}`;
            emit({ phase: 'done', ok: true, message, pct: 100 });
            return { ok: true, message, results: doneIds.map((id) => ({ id, ok: true })) };
        } catch (err) {
            const msg = err.message || String(err);
            emit({ phase: 'error', ok: false, message: msg, pct: 0 });
            return { ok: false, error: msg };
        } finally {
            downloadBusy = false;
            downloadAbort = null;
        }
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
        abortBatchMtAdapter();
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
                            : (useSakuraMt ? 'Sakura' : '外部');
                        appendEngineLogLine(
                            `[engine] 断点恢复 · 外部翻译适配器 · ${mtModeZh} · ${mtAdapter.url}`,
                            invokeSender,
                        );
                    }

                    appendEngineLogLine(`[engine] 从断点恢复 ${fromJobId}…`, invokeSender);
                    const outcome = await resumeEngineJobAndWait({
                        baseUrl: ensure.baseUrl,
                        fromJobId,
                        resumeJob,
                        waitJob,
                        overrides: resumeOverrides,
                        shouldStop: () => batchCancelled,
                        onEvent: (ev) => {
                            if (batchCancelled) return;
                            const fields = progressFieldsFromWaitEvent(ev);
                            currentJobId = String(ev?.data?.id || currentJobId || '');
                            if (String(fields.stage || '').toLowerCase() === 'translate'
                                || String(fields.stage || '').toLowerCase() === 'mt') {
                                noteEngineTranslatePercent(resumeMtUi, fields.percent);
                            }
                            sendProgress(invokeSender, {
                                ...fields,
                                file: payload.mediaPath || '',
                                jobId: currentJobId,
                                detail: fields.detail || `断点恢复中（自 ${fromJobId}）…`,
                            });
                        },
                    });
                    currentJobId = '';
                    if (!outcome.ok) {
                        return {
                            ok: false,
                            cancelled: !!outcome.cancelled,
                            error: friendlyEngineError(outcome.error || '断点恢复失败'),
                            code: outcome.code,
                            resumedFrom: fromJobId,
                        };
                    }
                    const result = outcome.result || outcome.waited?.data?.result || null;
                    const outPaths = extractOutputPaths(result);
                    appendEngineLogLine(
                        `[engine] 断点恢复完成 → ${path.basename(outPaths.subtitlePath || outPaths.targetSubtitlePath || '')}`,
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

    register('transub-engine-pick-whl', async (event, payload = {}) => {
        try {
            const { BrowserWindow, dialog } = require('electron');
            const win = BrowserWindow.fromWebContents(event.sender);
            if (win && !win.isDestroyed()) {
                if (win.isMinimized()) win.restore();
                win.show();
                win.focus();
            }
            const result = await dialog.showOpenDialog(win || undefined, {
                title: String(payload.title || '选择已下载的 .whl 文件（可多选）'),
                properties: ['openFile', 'multiSelections'],
                filters: [
                    { name: 'Python Wheel (*.whl)', extensions: ['whl'] },
                    { name: '所有文件', extensions: ['*'] },
                ],
                defaultPath: String(payload.defaultPath || '').trim() || undefined,
            });
            if (result.canceled || !result.filePaths?.length) {
                return { ok: true, canceled: true, paths: [] };
            }
            const checked = validateWhlFiles(result.filePaths);
            if (!checked.ok) return checked;
            return { ok: true, canceled: false, paths: checked.paths };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-install-local-wheels', async (_event, payload = {}) => {
        if (batchRunning) {
            return { ok: false, error: '字幕任务进行中，请先停止任务再安装组件' };
        }
        if (downloadBusy) {
            return { ok: false, error: '已有下载/安装任务正在进行' };
        }
        const kind = normalizeEngineDownloadKind(payload.kind || 'gpu');
        const checked = validateWhlFiles(payload.paths || payload.wheelPaths || []);
        if (!checked.ok) return checked;

        downloadBusy = true;
        downloadAbort = new AbortController();
        const signal = downloadAbort.signal;
        const emit = (info) => {
            broadcastEngineDownloadProgress({ ...(info || {}), kind, source: 'local-whl' });
        };

        try {
            const options = await readMergedOptions(payload);
            const installPath = resolveEngineInstallPath(options.engineInstallPath);
            const pythonPath = resolveEngineRuntimePython(installPath);
            if (!pythonPath) {
                const err = '找不到引擎 Python（请确认引擎目录含 runtime\\python.exe）';
                emit({ phase: 'error', ok: false, message: err, pct: 0 });
                return { ok: false, error: err };
            }

            if (engineProc) {
                emit({ phase: 'progress', message: '正在停止引擎以便安装…', pct: 2 });
                stopEngineProcess();
                await sleep(600);
            }

            // onnxruntime (CPU) and onnxruntime-gpu are mutually exclusive.
            const hasOrtGpuWhl = checked.paths.some((p) => /onnxruntime[_-]gpu/i.test(path.basename(p)));
            if (hasOrtGpuWhl) {
                emit({
                    phase: 'progress',
                    message: '正在卸载 CPU 版 onnxruntime（与 GPU 版互斥）…',
                    pct: 5,
                });
                try {
                    await new Promise((resolve) => {
                        const child = spawn(
                            pythonPath,
                            ['-m', 'pip', 'uninstall', '-y', 'onnxruntime'],
                            { windowsHide: true, stdio: 'ignore' },
                        );
                        const t = setTimeout(() => {
                            try { child.kill(); } catch (_) { /* ignore */ }
                            resolve();
                        }, 60_000);
                        child.on('close', () => {
                            clearTimeout(t);
                            resolve();
                        });
                        child.on('error', () => {
                            clearTimeout(t);
                            resolve();
                        });
                    });
                } catch (_) { /* ignore */ }
            }

            emit({
                phase: 'progress',
                message: `正在本地安装 ${checked.paths.length} 个 wheel…`,
                pct: 8,
            });

            const res = await installLocalWheels({
                pythonPath,
                wheelPaths: checked.paths,
                signal,
                onProgress: (ev) => {
                    const pct = Number(ev.percent);
                    emit({
                        phase: ev.type === 'done' ? 'progress' : (ev.type === 'error' ? 'error' : 'progress'),
                        message: ev.detail || ev.message || '安装中…',
                        pct: Number.isFinite(pct) ? Math.min(88, pct) : undefined,
                        raw: ev,
                    });
                },
            });

            if (res.cancelled || signal.aborted) {
                emit({ phase: 'cancelled', ok: false, message: '已取消', pct: 0 });
                return { ok: false, cancelled: true, error: 'cancelled' };
            }
            if (!res.ok) {
                const err = res.error || '本地安装失败';
                emit({ phase: 'error', ok: false, message: err, pct: 0 });
                return { ok: false, error: err, logTail: res.logTail };
            }

            emit({ phase: 'progress', message: '正在重启引擎…', pct: 92 });
            const ensure2 = await ensureEngineRunning({ ...options, forceRestart: true });
            if (!ensure2.ok) {
                const msg = '本地 wheel 已安装（引擎重启失败，请手动检测引擎）';
                emit({ phase: 'done', ok: true, message: msg, pct: 100 });
                return {
                    ok: true,
                    restarted: false,
                    message: msg,
                    installed: res.installed,
                    kind,
                };
            }

            let message = `本地安装完成（${(res.installed || []).join(', ')}）`;
            let probe = null;
            try {
                if (kind === 'demucs') {
                    const statusRes = await getAudioSeparateRuntime(ensure2.baseUrl, { timeoutMs: 20000 });
                    probe = statusRes.data || null;
                    message = statusRes.data?.hint || message;
                } else if (kind === 'gpu') {
                    const statusRes = await getGpuRuntime(ensure2.baseUrl, { timeoutMs: 20000 });
                    probe = statusRes.data || null;
                    message = statusRes.data?.hint || message;
                }
            } catch (_) { /* ignore probe errors */ }

            emit({ phase: 'done', ok: true, message, pct: 100 });
            return {
                ok: true,
                restarted: true,
                message,
                installed: res.installed,
                kind,
                probe,
            };
        } catch (err) {
            const msg = err.message || String(err);
            emit({ phase: 'error', ok: false, message: msg, pct: 0 });
            return { ok: false, error: msg };
        } finally {
            downloadBusy = false;
            downloadAbort = null;
        }
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
 * Text-only Opus MT for editor / cue arrays (no media ASR).
 * @param {{ cues: Array, language?: string, mtModel?: string, glossary?: object, fileName?: string }} payload
 * @param {{ onProgress?: Function, options?: object }} [deps]
 */
async function translateCuesWithEngineOpus(payload = {}, deps = {}) {
    const onProgress = typeof deps.onProgress === 'function' ? deps.onProgress : null;
    const saved = (() => {
        try {
            return loadSettings(() => {
                try {
                    const { getAppRoot } = require('./app-paths');
                    return getAppRoot();
                } catch {
                    return process.cwd();
                }
            }).options || {};
        } catch {
            return {};
        }
    })();
    const options = mergeEngineOptions({
        ...stripPostTaskFields(saved),
        ...stripPostTaskFields(deps.options || payload.options || {}),
        ...(payload.options && typeof payload.options === 'object' ? payload.options : {}),
    });
    options.engineInstallPath = resolveEngineInstallPath(options.engineInstallPath);
    const sakuraCatalog = require('../src/js/sakura-mt-catalog-core');
    const normalized = rangeAsrPolicy.normalizeOpusTextCues(payload.cues);
    if (!normalized.length) {
        return { ok: false, error: '没有可翻译的字幕', code: 'empty_cues' };
    }

    const mtModel = rangeAsrPolicy.resolveNativeOpusMtModel(options, payload, {
        isSakuraMtModel: (id) => sakuraCatalog.isSakuraMtModel(id),
        isLlmInferenceMtModel: (id) => !!sakuraCatalog.isLlmInferenceMtModel?.(id),
    });

    const language = String(payload.language || options.language || 'ja').trim() || 'ja';
    if (opusTextAbortController) {
        try {
            opusTextAbortController.abort();
        } catch { /* ignore */ }
    }
    opusTextAbortController = new AbortController();
    const signal = opusTextAbortController.signal;
    const computeLock = require('./compute-task-lock');
    try {
        return await computeLock.runWithComputeLock({
            kind: 'engine_opus_text',
            owner: '字幕编辑器',
            source: 'translateCuesWithEngineOpus',
        }, async () => {
            onProgress?.({
                phase: 'start',
                message: '正在启动引擎机器翻译…',
                pct: 2,
                cueTotal: normalized.length,
            });
            const ensure = await ensureEngineRunning(options);
            if (!ensure.ok) return ensure;
            if (signal.aborted) {
                return { ok: false, cancelled: true, code: 'cancelled', error: '已取消' };
            }

            const CHUNK = 64;
            const outByIndex = new Map();
            const sourceForSanitize = normalized.map((c) => ({
                index: c.index,
                text: c.text,
            }));
            for (let offset = 0; offset < normalized.length; offset += CHUNK) {
                if (signal.aborted) {
                    return { ok: false, cancelled: true, code: 'cancelled', error: '已取消' };
                }
                const chunk = normalized.slice(offset, offset + CHUNK);
                onProgress?.({
                    phase: 'chunk',
                    chunk: Math.floor(offset / CHUNK) + 1,
                    total: Math.ceil(normalized.length / CHUNK),
                    message: `机器翻译 ${offset + 1}–${offset + chunk.length}/${normalized.length}`,
                    pct: Math.round((offset / Math.max(1, normalized.length)) * 90) + 5,
                    cueTotal: normalized.length,
                });
                let res;
                try {
                    res = await translateCuesMt(ensure.baseUrl, {
                        cues: chunk.map((c) => ({
                            id: c.id,
                            text: c.text,
                            start: c.start,
                            end: c.end,
                        })),
                        language,
                        targetLanguage: 'zh',
                        mtModel: mtModel || null,
                        device: options.device || 'auto',
                    }, { signal });
                } catch (err) {
                    if (signal.aborted || err?.name === 'AbortError') {
                        return { ok: false, cancelled: true, code: 'cancelled', error: '已取消' };
                    }
                    throw err;
                }
                if (signal.aborted) {
                    return { ok: false, cancelled: true, code: 'cancelled', error: '已取消' };
                }
                if (!res.ok) {
                    if (res.cancelled || res.code === 'cancelled') {
                        return { ok: false, cancelled: true, code: 'cancelled', error: '已取消' };
                    }
                    if (res.code === 'timeout') {
                        return {
                            ok: false,
                            code: 'timeout',
                            error: res.error || '请求超时',
                            status: res.status,
                        };
                    }
                    return {
                        ok: false,
                        error: friendlyEngineError(
                            res.error || res.data?.message || res.data?.error
                            || `机器翻译失败 (HTTP ${res.status || 0})`,
                        ),
                        code: res.code || res.data?.code,
                        status: res.status,
                    };
                }
                for (const u of res.data?.cues || []) {
                    const idx = Number(u?.id);
                    if (!Number.isInteger(idx)) continue;
                    outByIndex.set(idx, String(u?.text ?? ''));
                }
            }

            const outRaw = normalized.map((c) => ({
                index: c.index,
                text: outByIndex.has(c.index) ? outByIndex.get(c.index) : '',
            }));
            let cleaned = { cues: outRaw, changed: 0, flags: {} };
            try {
                const mtSanitize = require('../src/js/mt-sanitize-core');
                cleaned = mtSanitize.sanitizeMtCues(outRaw, sourceForSanitize, {
                    glossary: payload.glossary || null,
                    unifyNames: true,
                });
            } catch (_) { /* ignore */ }

            onProgress?.({
                phase: 'done',
                message: `机器翻译完成，共 ${cleaned.cues.length} 条`,
                pct: 100,
                cueTotal: cleaned.cues.length,
            });
            return {
                ok: true,
                cues: cleaned.cues,
                summary: `机器翻译完成，共 ${cleaned.cues.length} 条`
                    + (cleaned.changed ? `（清理 ${cleaned.changed}）` : ''),
                via: 'engine-opus',
                stats: {
                    cues: cleaned.cues.length,
                    sanitized: cleaned.changed,
                    mtModel: mtModel || 'auto',
                },
            };
        });
    } finally {
        if (opusTextAbortController && opusTextAbortController.signal === signal) {
            opusTextAbortController = null;
        }
    }
}

async function transcribeRangeWithEngine(payload = {}, deps = {}) {
    const os = require('os');
    const mediaPath = path.resolve(String(payload.mediaPath || payload.videoPath || ''));
    const rangeWin = rangeAsrPolicy.clampRangeWindow({
        startMs: payload.startMs,
        endMs: payload.endMs,
        padMs: payload.padMs,
    });
    const startMs = rangeWin.startMs;
    const endMs = rangeWin.endMs;
    const padMs = rangeWin.padMs;
    const onProgress = typeof deps.onProgress === 'function' ? deps.onProgress : null;
    const options = mergeEngineOptions(deps.options || {});

    if (!mediaPath || !fs.existsSync(mediaPath)) {
        return { ok: false, error: '媒体文件不存在' };
    }
    if (endMs - startMs < 200) {
        return { ok: false, error: '字幕时间范围过短，无法重转写' };
    }
    if (batchRunning) {
        return { ok: false, error: '已有字幕任务正在运行，请稍后再试', code: 'compute_busy' };
    }

    const computeLock = require('./compute-task-lock');
    return computeLock.runWithComputeLock({
        kind: 'engine_range',
        owner: '字幕编辑器',
        source: 'transcribeRangeWithEngine',
    }, async () => {
        try {
            require('./local-llm-reclaim').reclaimLocalLlmBeforeEngineJob(appendEngineLogLine);
        } catch (_) { /* ignore */ }
        const ensure = await ensureEngineRunning(options);
        if (!ensure.ok) return ensure;

        const clipStartMs = rangeWin.clipStartMs;
        const clipEndMs = rangeWin.clipEndMs;
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-engine-re-'));
        const clipPath = path.join(tempRoot, 'clip.wav');
        const outputDir = path.join(tempRoot, 'out');
        fs.mkdirSync(outputDir, { recursive: true });

        try {
            batchCancelled = false;
            onProgress?.({ stage: 'extract', detail: '截取音频片段' });
            const { extractMediaRange } = require('./ffmpeg-bridge');
            const clip = await extractMediaRange(mediaPath, clipStartMs, clipEndMs, clipPath, {
                ffmpegPath: options.ffmpegPath || payload.ffmpegPath,
            });
            if (!clip.ok) {
                return {
                    ok: false,
                    cancelled: !!clip.cancelled || batchCancelled,
                    error: friendlyEngineError(clip.error || '截取音频失败'),
                };
            }
            if (batchCancelled) {
                return { ok: false, cancelled: true, code: 'cancelled', error: '已取消' };
            }

            const task = mapTaskToEngineTask(
                payload.options?.task === 'translate' ? 'translate' : 'transcribe',
                { smartTranslate: false },
            );
            // Never pass Sakura/smart ids as native Engine Opus mtModel.
            const sakuraCatalog = require('../src/js/sakura-mt-catalog-core');
            const mtModel = rangeAsrPolicy.resolveRangeAsrMtModel(options, {
                isSakuraMtModel: (id) => sakuraCatalog.isSakuraMtModel(id),
                isLlmInferenceMtModel: (id) => !!sakuraCatalog.isLlmInferenceMtModel?.(id),
            });

            const primaryAsr = String(
                payload.asrModel || options.engineAsrModel || 'sensevoice-small',
            ).trim() || 'sensevoice-small';
            // SenseVoice 对短窗/AV 常空：有必要时再换 Whisper 试一次（未安装则原样失败）
            const asrCandidates = rangeAsrPolicy.buildRangeAsrCandidates(primaryAsr);
            const isRetryableAsrFail = rangeAsrPolicy.isRetryableAsrFail;

            const runAsrOnce = async (asrModel) => {
                onProgress?.({
                    stage: 'transcribe',
                    detail: asrModel === primaryAsr
                        ? '引擎推理中'
                        : `${primaryAsr} 无结果，改用 ${asrModel}…`,
                });
                const created = await createJob(ensure.baseUrl, {
                    task,
                    mediaPath: clipPath,
                    outputDir,
                    language: options.language || 'auto',
                    asrModel,
                    mtModel,
                    subFormats: ['srt'],
                    device: mapDeviceForEngine(options.device),
                    beamSize: Math.max(1, Math.min(20, Number(options.beamSize) || 5)),
                    vad: buildVadJobOptions(options),
                    // Short editor clips: keep VAD/denoise, skip Demucs (too heavy for range retranscribe)
                    audio: buildAudioJobOptions({
                        audioLightDenoise: options.audioLightDenoise,
                        filmAudioEnhance: false,
                        filmVadPreset: false,
                    }, { entitled: false }),
                    contentProfile: options.contentProfile || options.senseProfile || undefined,
                    senseProfile: options.senseProfile || options.contentProfile || undefined,
                    ...(options.timingAlign != null
                        ? { timingAlign: options.timingAlign }
                        : {}),
                    ...(options.timingAlignModel != null
                        && String(options.timingAlignModel).trim() !== ''
                        ? { timingAlignModel: String(options.timingAlignModel).trim() }
                        : {}),
                    castNames: options.castNames || options.cast_names || undefined,
                    releaseGpuAfter: true,
                    sync: false,
                }, { timeoutMs: 600000 });
                if (!created.ok || !created.data?.id) {
                    return {
                        ok: false,
                        cancelled: !!created.cancelled,
                        error: friendlyEngineError(
                            created.error || created.data?.message || created.data?.error || '创建引擎任务失败',
                        ),
                        code: created.code,
                    };
                }
                // Track job so Esc → transub-engine-cancel can cancelJob(currentJobId).
                currentJobId = created.data.id;
                const waited = await waitJob(ensure.baseUrl, created.data.id, {
                    shouldStop: () => batchCancelled,
                });
                currentJobId = '';
                if (!waited.ok) {
                    const errMsg = waited.error || waited.data?.error?.message || '引擎任务失败';
                    const errCode = waited.data?.error?.code
                        || ((waited.cancelled || batchCancelled) ? 'cancelled' : undefined);
                    return {
                        ok: false,
                        cancelled: !!waited.cancelled || batchCancelled,
                        error: friendlyEngineError(errMsg),
                        code: errCode,
                    };
                }
                const outputs = waited.data?.result?.outputs || [];
                const outPath = outputs[0]?.path || '';
                if (!outPath || !fs.existsSync(outPath)) {
                    return { ok: false, error: '重转写未生成字幕文件', code: 'ASR_EMPTY' };
                }
                const raw = fs.readFileSync(outPath, 'utf8');
                const { parseSubtitle } = require('./subtitle-format');
                const parsed = parseSubtitle(raw, 'srt');
                let cues = rangeAsrPolicy.remapClipCuesToTimeline(parsed.cues || [], clipStartMs);
                if (!cues.length) {
                    return { ok: false, error: '重转写结果为空', code: 'ASR_EMPTY' };
                }
                // Same source-prep as batch sanitizeMtSubtitlePair: name-loop + JA domain.
                let cleanupMeta = null;
                try {
                    const { cleanupAsrCues } = require('./asr-cue-cleanup');
                    const cleaned = cleanupAsrCues(cues, {
                        nameLoop: options.asrNameLoopClean !== false,
                        jaAsrDomainFix: options.jaAsrDomainFix !== false,
                    });
                    cues = cleaned.cues;
                    cleanupMeta = cleaned;
                    if (cleaned.changed) {
                        try {
                            const { formatDomainFixLogLine, summarizeDomainFixChanges } = require('./asr-domain-fix-trace');
                            if (cleaned.domainChanged) {
                                const trace = summarizeDomainFixChanges([{
                                    from: 'ja-asr-domain',
                                    to: 'applied',
                                    count: cleaned.domainChanged,
                                }], 'range_asr');
                                const line = formatDomainFixLogLine(trace);
                                if (line) appendEngineLogLine(line, deps.invokeSender || null);
                            }
                            appendEngineLogLine(`[engine] 局部重转写 ${cleaned.summary}`, deps.invokeSender || null);
                        } catch { /* log optional */ }
                    }
                } catch (err) {
                    appendEngineLogLine(
                        `[engine] 局部重转写 ASR 清理跳过：${err.message || err}`,
                        deps.invokeSender || null,
                    );
                }
                if (!cues.length) {
                    return { ok: false, error: '重转写结果为空', code: 'ASR_EMPTY' };
                }
                // Prefer engine result cue scores when SRT parse has none.
                try {
                    const { pickEngineCuesForConfidence, cueHasAsrScoreMeta } = require('./asr-confidence-seed');
                    const scored = pickEngineCuesForConfidence(waited.data?.result || {});
                    if (scored.length && cues.some((c) => !cueHasAsrScoreMeta(c))) {
                        const byText = new Map();
                        for (const s of scored) {
                            const key = String(s?.text || '').trim();
                            if (key && cueHasAsrScoreMeta(s) && !byText.has(key)) byText.set(key, s);
                        }
                        if (byText.size) {
                            cues = cues.map((c) => {
                                if (cueHasAsrScoreMeta(c)) return c;
                                const hit = byText.get(String(c?.text || '').trim());
                                if (!hit) return c;
                                return {
                                    ...c,
                                    avgLogprob: hit.avgLogprob ?? hit.avg_logprob,
                                    noSpeechProb: hit.noSpeechProb ?? hit.no_speech_prob,
                                    confidence: hit.confidence,
                                    score: hit.score,
                                    probability: hit.probability ?? hit.prob,
                                    meta: hit.meta && typeof hit.meta === 'object' ? hit.meta : c.meta,
                                };
                            });
                        }
                    }
                } catch { /* optional score enrich */ }
                const subtitlePath = String(
                    payload.subtitlePath || payload.sourceSubtitlePath || options.subtitlePath || '',
                ).trim();
                let confidenceSeed = null;
                if (subtitlePath) {
                    try {
                        const { mergeRangeAsrConfidenceMeta } = require('./asr-confidence-seed');
                        confidenceSeed = mergeRangeAsrConfidenceMeta(subtitlePath, cues, {
                            startMs,
                            endMs,
                        });
                        if (confidenceSeed?.ok && confidenceSeed.entryCount) {
                            appendEngineLogLine(
                                `[engine] 局部重转写已合并 ASR 置信度 ${confidenceSeed.entryCount} 条${confidenceSeed.heuristic ? '（启发式）' : ''} → ${path.basename(subtitlePath)}`,
                                deps.invokeSender || null,
                            );
                        }
                    } catch (err) {
                        appendEngineLogLine(
                            `[engine] 局部重转写置信度合并跳过：${err.message || err}`,
                            deps.invokeSender || null,
                        );
                    }
                }
                onProgress?.({ stage: 'done', detail: '重转写完成' });
                return {
                    ok: true,
                    cues,
                    clipStartMs,
                    clipEndMs,
                    padMs,
                    sourceStartMs: startMs,
                    sourceEndMs: endMs,
                    result: waited.data?.result,
                    task,
                    asrModel,
                    confidenceSeed,
                    asrCleanup: cleanupMeta
                        ? {
                            nameLoopsChanged: cleanupMeta.nameLoopsChanged,
                            domainChanged: cleanupMeta.domainChanged,
                            summary: cleanupMeta.summary,
                        }
                        : null,
                };
            };

            let lastFail = null;
            for (let i = 0; i < asrCandidates.length; i += 1) {
                const asrModel = asrCandidates[i];
                if (batchCancelled) {
                    return { ok: false, cancelled: true, code: 'cancelled', error: '已取消' };
                }
                // Avoid reusing stale SRT from a previous empty attempt
                try {
                    for (const name of fs.readdirSync(outputDir)) {
                        fs.rmSync(path.join(outputDir, name), { force: true });
                    }
                } catch { /* ignore */ }
                const outcome = await runAsrOnce(asrModel);
                if (outcome.ok) return outcome;
                lastFail = outcome;
                if (outcome.cancelled) return outcome;
                // Empty SenseVoice / missing Whisper → try next ASR candidate
                if (!isRetryableAsrFail(outcome)) return outcome;
                if (i < asrCandidates.length - 1) {
                    try {
                        console.warn(
                            `[engine] 局部重转写 ${asrModel} 未成功（${outcome.error || 'unknown'}），尝试 ${asrCandidates[i + 1]}`,
                        );
                    } catch { /* ignore */ }
                }
            }
            return lastFail || { ok: false, error: '重转写结果为空', code: 'ASR_EMPTY' };
        } catch (err) {
            return {
                ok: false,
                cancelled: err?.name === 'AbortError' || err?.code === 'cancelled' || batchCancelled,
                error: friendlyEngineError(err?.message || String(err)),
                code: (err?.name === 'AbortError' || batchCancelled) ? 'cancelled' : err?.code,
            };
        } finally {
            currentJobId = '';
            try {
                fs.rmSync(tempRoot, { recursive: true, force: true });
            } catch { /* ignore */ }
            try {
                require('./temp-cleanup').cleanupAfterJob();
            } catch { /* ignore */ }
        }
    });
}

function stopEngineJobs() {
    batchCancelled = true;
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
    register('transub-compute-task-status', async () => {
        const computeLock = require('./compute-task-lock');
        return { ok: true, ...computeLock.getStatus() };
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
