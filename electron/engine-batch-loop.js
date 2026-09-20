/**
 * Engine batch locked loop — per-file ASR / MT / handoff orchestration.
 * Bound from engine-bridge via createEngineBatchLoop(host).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { isTorchEngineProcessPoisonError } = require('./engine-log-filter');

/**
 * @param {object} host bridge bindings (mutable: batchCancelled, batchRunning, currentJobId, batchMtAbortController)
 */
function createEngineBatchLoop(host) {
    if (!host || typeof host !== 'object') {
        throw new Error('createEngineBatchLoop: host required');
    }

    async function runEngineBatchLocked({
        list,
        paths,
        merged,
        invokeSender,
        minimizeToTray = false,
    }) {
        const {
        abortBatchMtAdapter,
        appendAsrRunToDetail,
        appendEngineLogLine,
        attachCheckpointResumeHint,
        batchMtPlan,
        batchPostprocessPlan,
        batchRecovery,
        buildAudioJobOptions,
        buildCancelledItemResult,
        buildEngineJobFlags,
        buildExternalMtJobFields,
        buildFailedItemResult,
        buildSkippedItemResult,
        buildVadJobOptions,
        createJob,
        emitToSubtitleUi,
        engineBatchHistory,
        engineUiWindowManager,
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
        shouldContinueBatchAfterItemCancel,
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
        } = host;

    const stopRequested = () => !!(host.batchCancelled || host.itemCancelled);
    const continueAfterItemCancel = () => {
        const ok = typeof shouldContinueBatchAfterItemCancel === 'function'
            ? shouldContinueBatchAfterItemCancel(host)
            : !!(host.itemCancelled && !host.batchCancelled);
        if (ok) host.itemCancelled = false;
        return ok;
    };

    async function ensureEngineAfterItemCancel(mergedOpts, invokeSender) {
        appendEngineLogLine('[engine] 本条已停止，准备继续下一项…', invokeSender);
        const again = await ensureEngineRunning({
            ...mergedOpts,
            forceRestart: true,
            shouldStop: () => !!host.batchCancelled,
        });
        if (again?.ok) return again;
        appendEngineLogLine(
            `[engine] 停止本条后引擎重启失败：${again?.error || 'unknown'}`,
            invokeSender,
        );
        return again;
    }

    host.batchCancelled = false;
    host.itemCancelled = false;
    // Per-batch existence memo (positive hits only — misses may flip after writes).
    const existsMemo = new Map();
    const pathExists = (p) => {
        const key = String(p || '');
        if (!key) return false;
        if (existsMemo.has(key)) return true;
        let ok = false;
        try {
            ok = fs.existsSync(key);
        } catch {
            ok = false;
        }
        if (ok) existsMemo.set(key, true);
        return ok;
    };
    // Editor LLM idle keep-alive can still hold VRAM; free it before ASR.
    try {
        await require('./local-llm-reclaim').reclaimLocalLlmBeforeEngineJob(appendEngineLogLine);
    } catch (_) { /* ignore */ }
    // Restart only when env/PATH/version changed; otherwise reuse a healthy engine.
    let ensure = await ensureEngineRunning({
        ...merged,
        shouldStop: () => !!host.batchCancelled,
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
    host.batchRunning = true;
    host.batchCancelled = false;
    host.itemCancelled = false;
    host.currentJobId = '';
    abortBatchMtAdapter();
    host.batchMtAbortController = new AbortController();
    host.itemWorkAbortController = new AbortController();
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
    try {
        require('./engine-tray-progress').beginBatchTrayProgress(engineUiWindowManager, {
            list,
            merged,
        });
    } catch { /* ignore */ }
    appendEngineLogLine(
        `[engine] 开始批次 · ${paths.length} 个文件 · ASR=${merged.engineAsrModel || 'sensevoice-small'} · 档位=${merged.engineProfile || 'balanced'}`,
        invokeSender,
    );

    const results = [];
    let generated = 0;
    let failed = 0;
    let skipped = 0;
    const engineLlamaMt = require('./engine-llama-mt');
    const { isByokSentenceMtPreferred } = require('./sakura-mt-endpoint-resolve');
    let preferEngineLlamaMt = false;
    const byokSentenceMt = isByokSentenceMtPreferred(null, merged);
    if (batchWantsSakura && !batchWantsSmart && !byokSentenceMt) {
        const probeId = sakuraModelId || merged.engineMtModel || '';
        if (engineLlamaMt.canUseEngineLlamaMt(probeId)) {
            try {
                preferEngineLlamaMt = await require('./engine-llm-client')
                    .engineSupportsLlmServer(ensure.baseUrl);
            } catch {
                preferEngineLlamaMt = false;
            }
        }
    }
    if (byokSentenceMt) {
        preferEngineLlamaMt = false;
    }
    const usedExternalMt = usesExternalMt({
        smartTranslate: batchWantsSmart,
        sakuraMt: batchWantsSakura && !preferEngineLlamaMt,
    });
    let batchFailedOrCancelled = false;
    /** @type {{ ok: boolean, stop?: function, mtExternal?: function, mode?: string, url?: string } | null} */
    let mtAdapter = null;
    try {
        if (preferEngineLlamaMt) {
            appendEngineLogLine(
                '[engine] 免费推理翻译 · 引擎内 llama（跳过外部适配器）',
                invokeSender,
            );
        } else if (batchWantsSakura && !batchWantsSmart && byokSentenceMt) {
            try {
                // BYOK needs no local GGUF; make sure orphan llama is gone before ASR.
                const llama = require('./advanced-llama-server');
                const stop = typeof llama.stopLlamaServerAsync === 'function'
                    ? llama.stopLlamaServerAsync
                    : llama.stopLlamaServer;
                const stopped = await stop();
                if (stopped?.stopped || stopped?.orphanCleared) {
                    appendEngineLogLine(
                        '[engine] BYOK 推理翻译 · 已停止本机 llama-server（腾出显存给识别）',
                        invokeSender,
                    );
                }
            } catch { /* optional */ }
            try {
                const { readAdvancedDoc } = require('./advanced-license-data');
                const {
                    formatAdvancedLlmEngineLogLine,
                    llmHostHint,
                } = require('./advanced-llm-log');
                const entitlement = require('../src/js/advanced-entitlement-core');
                const advDoc = readAdvancedDoc().doc;
                const byokCfg = entitlement.normalizeByok(advDoc?.byok);
                const preview = {
                    ok: true,
                    source: 'byok',
                    model: byokCfg.model || '',
                    baseUrl: byokCfg.baseUrl || '',
                };
                const line = formatAdvancedLlmEngineLogLine(preview, { feature: '外部翻译' });
                if (preview.model || llmHostHint(preview.baseUrl)) {
                    appendEngineLogLine(line, invokeSender);
                }
            } catch { /* optional */ }
        }
        if (usedExternalMt) {
            const launch = batchMtPlan.resolveBatchMtAdapterLaunch({
                batchWantsSmart,
                sakuraModelId,
                merged,
                list,
            });
            mtAdapter = await startEngineMtAdapter({
                ...launch,
                signal: host.batchMtAbortController.signal,
                onProgress: (info) => {
                    if (host.batchCancelled) return;
                    const detail = info?.message || info?.detail || info?.phase || '翻译中';
                    appendEngineLogLine(
                        `[engine-translate] ${detail}`,
                        invokeSender,
                    );
                    // Adapter ticks never reach engine SSE until the HTTP batch returns —?
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
                : (mtAdapter.mode === 'sakura'
                    ? sakuraCatalog.translateModeLabel('llm')
                    : String(mtAdapter.mode || '外部'));
            appendEngineLogLine(
                `[engine] 外部翻译适配器· ${mtModeZh} · ${mtAdapter.url}`,
                invokeSender,
            );
            try {
                const { resolveMtTargetFields } = require('./sanitize-target-opts');
                const tf = resolveMtTargetFields(merged);
                const lang = tf?.subtitleTargetLang || merged.subtitleTargetLang || 'zh-Hans';
                appendEngineLogLine(
                    `[engine] 成片目标· ${lang}${tf && !tf.isZhTarget ? '（禁中文回填）' : ''}`,
                    invokeSender,
                );
            } catch { /* optional */ }
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
                        const managed = advDoc?.managedLlm || {};
                        const smartId = String(
                            managedCatalog.resolveSmartTranslateModelId?.(managed)
                            || managed.smartTranslateModelId
                            || '',
                        ).trim();
                        const activeId = String(managed.activeModelId || '').trim();
                        // Preview sentence-MT when translate-only; else chat 润色 only
                        // (never treat reconstruct activeModelId as the smart chat model).
                        const previewId = smartId;
                        preview = {
                            ok: true,
                            source: 'managed',
                            modelId: previewId,
                            model: previewId,
                            baseUrl: '',
                        };
                        if (smartId && managedCatalog.isTranslateOnlyModel?.(smartId)) {
                            appendEngineLogLine(
                                `[engine] 智能翻译句级 · ${smartId}`,
                                invokeSender,
                            );
                        } else if (smartId) {
                            appendEngineLogLine(
                                `[engine] 智能翻译润色 · ${smartId}`,
                                invokeSender,
                            );
                        } else if (activeId) {
                            appendEngineLogLine(
                                `[engine] 智能翻译润色未选用（推理模型 ${activeId} 仅用于语境重构）`,
                                invokeSender,
                            );
                        }
                    }
                    const line = formatAdvancedLlmEngineLogLine(preview, { feature: '智能翻译' });
                    // Include host hint even when empty so line stays stable; skip empty model noise.
                    if (preview.model || preview.modelId || llmHostHint(preview.baseUrl)) {
                        appendEngineLogLine(line, invokeSender);
                    }
                } catch (_) { /* optional */ }
            }
        }

        let batchQwenGpuHold = false;
        let batchQwenGpuHoldLogged = false;
        /** @type {Set<string>} one-shot engine restart per media after torch reimport poison */
        const torchPoisonRetried = new Set();

        for (let i = 0; i < list.length; i += 1) {
            if (host.batchCancelled) break;
            if (!host.itemWorkAbortController || host.itemWorkAbortController.signal?.aborted) {
                host.itemWorkAbortController = new AbortController();
            }
            const item = list[i] || {};
            const mediaPath = path.resolve(String(item.fullPath || item.path || ''));
            const index1 = i + 1;

            if (liveBatch.consumeSkip(mediaPath)) {
                skipped += 1;
                results.push(buildCancelledItemResult(mediaPath, { removedFromQueue: true }));
                sendProgress(invokeSender, {
                    stage: 'cancelled',
                    phase: 'cancelled',
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
            resetTranslateProgressSession(mediaPath);
            // Post-job QC / blank / ellipsis must share the same stop hooks as waitJob.
            const itemStopHooks = {
                shouldStop: stopRequested,
                get signal() { return host.itemWorkAbortController?.signal || null; },
            };
            /** @returns {Promise<'continue'|'break'>} */
            const settleCancelledItem = async () => {
                results.push(buildCancelledItemResult(mediaPath));
                sendProgress(invokeSender, {
                    stage: 'cancelled',
                    phase: 'cancelled',
                    index1,
                    total: list.length,
                    file: mediaPath,
                    detail: '已取消',
                    error: 'cancelled',
                });
                if (continueAfterItemCancel()) {
                    skipped += 1;
                    const again = await ensureEngineAfterItemCancel(merged, invokeSender);
                    if (again?.ok) {
                        ensure = again;
                        return 'continue';
                    }
                    return 'break';
                }
                return 'break';
            };
            if (stopRequested()) {
                results.push(buildCancelledItemResult(mediaPath));
                sendProgress(invokeSender, {
                    stage: 'cancelled',
                    phase: 'cancelled',
                    index1,
                    total: list.length,
                    file: mediaPath,
                    detail: '已取消',
                    error: 'cancelled',
                    percent: 0,
                });
                liveBatch.clearCurrent();
                if (continueAfterItemCancel()) {
                    skipped += 1;
                    continue;
                }
                break;
            }
            try {
            if (!pathExists(mediaPath)) {
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

            const fileMergedRaw = (() => {
                const senseMerged = mergeSenseOverrides(merged, item.optionOverrides || {});
                const styleMerged = mergeTranslateStyleOverrides(
                    senseMerged,
                    item.optionOverrides || {},
                );
                // mergeSenseOverrides only copies SENSE_OWNED_KEYS — re-apply shelf skip-ASR
                // keys so 从原文/转录翻译 does not fall through to full ASR.
                try {
                    const shelfTx = require('../src/js/subtitle-shelf-translate-core');
                    if (typeof shelfTx.mergeShelfBatchOverrides === 'function') {
                        return shelfTx.mergeShelfBatchOverrides(
                            styleMerged,
                            item.optionOverrides || {},
                        );
                    }
                } catch (_) { /* optional */ }
                return styleMerged;
            })();
            const sakuraSanitize = sanitizeSakuraMtForLanguage(fileMergedRaw, fileMergedRaw.language);
            let fileMerged = sakuraSanitize.options;
            if (sakuraSanitize.changed && sakuraSanitize.note) {
                appendEngineLogLine(
                    `[engine] #${index1}/${list.length} ${sakuraSanitize.note}`,
                    invokeSender,
                );
            }
            if (!fileMerged.overwrite) {
                const isDual = fileMerged.task === 'dual';
                const writeTarget = fileMerged.outputWriteTarget !== false
                    || fileMerged.outputWriteSource === false;
                const writeSource = fileMerged.outputWriteSource !== false;
                if (isDual) {
                    const sourceSuffix = dualCore.resolveDualSourceSuffix(
                        fileMerged.language,
                        fileMerged.dualTargetSuffix,
                    );
                    const targetSuffix = dualCore.resolveTargetFileSuffix
                        ? dualCore.resolveTargetFileSuffix(fileMerged)
                        : dualCore.normalizeDualTargetSuffix(fileMerged.dualTargetSuffix);
                    const { subFormats } = resolveEngineSubFormats(fileMerged);
                    const pair = resolveDualSubtitlePaths(mediaPath, outDir, {
                        sourceSuffix,
                        targetSuffix,
                        subFormats,
                    });
                    const haveTarget = !writeTarget || !!pair.targetPath;
                    const haveSource = !writeSource || !!pair.sourcePath;
                    if (haveTarget && haveSource && (writeTarget || writeSource)) {
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
                useLlamaMt,
                engineTask,
                jobMtModel,
                fileMerged: routedFileMerged,
                blockedNativeOpus,
                intlMtError,
            } = resolveFileMtPlan(fileMerged, {
                isLlmMtId,
                usesExternalMt,
                mapTaskToEngineTask,
                preferEngineLlamaMt,
                canUseEngineLlamaMt: engineLlamaMt.canUseEngineLlamaMt,
            });
            if (routedFileMerged && typeof routedFileMerged === 'object') {
                fileMerged = routedFileMerged;
            }

            if (blockedNativeOpus && intlMtError) {
                failed += 1;
                results.push(buildFailedItemResult(mediaPath, intlMtError));
                sendProgress(invokeSender, {
                    stage: 'failed',
                    index1,
                    total: list.length,
                    file: mediaPath,
                    error: intlMtError,
                    detail: intlMtError,
                });
                continue;
            }

            // Never silently fall through to Opus when Sakura/smart was requested but
            // the external adapter was not started (would look like "missing opus-mt-*").
            if (useExternalMt && !mtAdapter?.ok) {
                const errMsg = mtAdapter?.error
                    || (useSakuraMt
                        ? `感知/表单指定了推理翻译（${fileMerged.engineMtModel || 'llm'}），但外部翻译适配器未启动`
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
                const llmLabel = sakuraCatalog.translateModeLabel?.('llm') || '推理翻译';
                appendEngineLogLine(
                    `[engine] #${index1}/${list.length} 翻译后端 · ${llmLabel}：${fileMerged.engineMtModel}）`,
                    invokeSender,
                );
            } else if (useSmartTranslate) {
                let smartBackend = '智能翻译';
                try {
                    const { readAdvancedDoc } = require('./advanced-license-data');
                    const { llmSourceLabel } = require('./advanced-llm-log');
                    const entitlement = require('../src/js/advanced-entitlement-core');
                    const managedCatalog = require('../src/js/advanced-managed-llm-catalog-core');
                    const advDoc = readAdvancedDoc().doc;
                    const src = entitlement.normalizeLlmSource(advDoc?.llmSource);
                    const smartId = String(
                        fileMerged.smartTranslateModelId
                        || fileMerged.hybridMtModelId
                        || managedCatalog.resolveSmartTranslateModelId?.(advDoc?.managedLlm)
                        || advDoc?.managedLlm?.smartTranslateModelId
                        || '',
                    ).trim();
                    // Lite/translate-only forces hybrid at runtime even when settings flag is off.
                    const liteHybrid = !!(
                        smartId && managedCatalog.isTranslateOnlyModel?.(smartId)
                    );
                    const hybridOn = liteHybrid
                        || (fileMerged.smartTranslateHybridMt !== false
                            && fileMerged.smartTranslateHybridMt !== 0);
                    smartBackend = `智能翻译：${llmSourceLabel(src)} · ${hybridOn ? '混合句级' : '对话按行'}）`;
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
                sakuraOrSmart: useExternalMt || useLlamaMt,
            });
            const releaseGpuAfter = resolveReleaseGpuAfterForBatchItem(fileMerged, {
                sakuraOrSmart: useExternalMt || useLlamaMt,
                batchItemCount: list.length,
                asrModel: fileMerged.engineAsrModel,
            });
            if (
                batchQwenGpuHold === false
                && !releaseGpuAfter
                && list.length > 1
                && isQwenAsrModelId(fileMerged.engineAsrModel)
                && !useExternalMt
                && !useLlamaMt
                && fileMerged.releaseGpuAfter == null
            ) {
                batchQwenGpuHold = true;
            }
            if (batchQwenGpuHold && !batchQwenGpuHoldLogged) {
                batchQwenGpuHoldLogged = true;
                appendEngineLogLine(
                    '[engine] 批量 Qwen：条目间保持引擎显存（自动；勾选「任务结束后释放」则每条仍释放）',
                    invokeSender,
                );
            }
            const glossaryBundle = engineBatchHistory.loadEngineGlossaryBundle({
                ...fileMerged,
                mtGlossaryMode: jobFlags.mtGlossaryMode,
                mediaPath,
                outputDir: outDir,
            });
            const glossaryPairs = glossaryBundle.pairs;
            const asrGlossaryExtras = glossaryBundle.asrExtras;
            const externalMtFields = useExternalMt && mtAdapter?.ok
                ? (typeof mtAdapter.mtExternal === 'function'
                    ? {
                        mtBackend: 'external',
                        mtExternal: mtAdapter.mtExternal(
                            resolveExternalMtAdapterCall({
                                useSmartTranslate,
                                modelId: fileMerged.engineMtModel,
                            }),
                        ),
                    }
                    : buildExternalMtJobFields({
                        url: mtAdapter.url,
                        token: mtAdapter.token,
                        ...resolveExternalMtAdapterCall({
                            useSmartTranslate,
                            modelId: fileMerged.engineMtModel,
                        }),
                    }))
                : null;
            let llamaMtFields = null;
            if (useLlamaMt) {
                const built = engineLlamaMt.buildLlamaMtJobFields({
                    modelId: fileMerged.engineMtModel,
                    sakuraNsfwPrompt: fileMerged.sakuraNsfwPrompt,
                    glossaryMtEnabled: fileMerged.glossaryMtEnabled,
                    batchSize: fileMerged.sakuraBatchSize || fileMerged.llmBatchSize,
                    contextSize: fileMerged.contextSize,
                    nGpuLayers: fileMerged.nGpuLayers,
                });
                if (!built?.ok) {
                    const errMsg = built?.error || '引擎内 llama MT 配置失败';
                    failed += 1;
                    results.push(buildFailedItemResult(mediaPath, errMsg));
                    sendProgress(invokeSender, {
                        stage: 'error',
                        index1,
                        total: list.length,
                        file: mediaPath,
                        percent: 100,
                        detail: errMsg,
                    });
                    continue;
                }
                llamaMtFields = {
                    mtBackend: built.mtBackend,
                    mtLlama: built.mtLlama,
                };
            }

            const vramHint = await sampleJobGpuVramHint({
                device: mapDeviceForEngine(fileMerged.device),
            });

            const jobBody = {
                task: engineTask,
                mediaPath,
                outputDir: outDir,
                language: fileMerged.language || 'auto',
                asrModel: fileMerged.engineAsrModel || 'sensevoice-small',
                mtModel: jobMtModel,
                subFormats,
                dualAss,
                dualTargetSuffix: (() => {
                    try {
                        const dualCore = require('../src/js/dual-subtitle-core');
                        return dualCore.normalizeDualTargetSuffix(fileMerged.dualTargetSuffix);
                    } catch {
                        return String(fileMerged.dualTargetSuffix || 'zh-cn').trim().toLowerCase() || 'zh-cn';
                    }
                })(),
                targetSubtitleNaming: (() => {
                    try {
                        const dualCore = require('../src/js/dual-subtitle-core');
                        return dualCore.normalizeTargetSubtitleNaming(fileMerged.targetSubtitleNaming);
                    } catch {
                        const raw = String(fileMerged.targetSubtitleNaming || '').trim().toLowerCase();
                        return (raw === 'media' || raw === 'same' || raw === 'video') ? 'media' : 'lang';
                    }
                })(),
                outputWriteTarget: fileMerged.outputWriteTarget !== false
                    || fileMerged.outputWriteSource === false,
                outputWriteSource: fileMerged.outputWriteSource !== false,
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
                qwenAsrBatchMode: resolveQwenAsrBatchModeForJob(fileMerged),
                ...(vramHint.gpuTotalMiB ? vramHint : {}),
                releaseGpuAfter,
                includeWords: jobFlags.includeWords,
                karaokeVtt: jobFlags.karaokeVtt,
                wordTimestamps: jobFlags.wordTimestamps,
                glossary: glossaryPairs,
                ...(asrGlossaryExtras.asrGlossary?.length
                    ? { asrGlossary: asrGlossaryExtras.asrGlossary }
                    : {}),
                ...(asrGlossaryExtras.initialPrompt
                    ? { initialPrompt: asrGlossaryExtras.initialPrompt }
                    : {}),
                ...(asrGlossaryExtras.hotwords
                    ? { hotwords: asrGlossaryExtras.hotwords }
                    : {}),
                contentProfile: fileMerged.contentProfile || fileMerged.senseProfile || undefined,
                senseProfile: fileMerged.senseProfile || fileMerged.contentProfile || undefined,
                targetLanguage: (() => {
                    try {
                        const mtRoute = require('../src/js/mt-target-route-core');
                        return mtRoute.resolveMtTargetRoute(fileMerged).engineTargetLanguage || 'zh';
                    } catch {
                        return 'zh';
                    }
                })(),
                ...(fileMerged.subtitleTargetLang
                    ? { subtitleTargetLang: fileMerged.subtitleTargetLang }
                    : {}),
                ...(fileMerged.timingAlign != null
                    ? { timingAlign: fileMerged.timingAlign }
                    : {}),
                ...(fileMerged.timingAlignModel != null
                    && String(fileMerged.timingAlignModel).trim() !== ''
                    ? { timingAlignModel: String(fileMerged.timingAlignModel).trim() }
                    : {}),
                // LLM MT: skip built-in JA name lexicon protect (__GLOSS*__),
                // which harms Sakura/smart quality vs the subtitle editor path.
                ...(useExternalMt || useLlamaMt ? { builtinNames: false } : {}),
                ...(externalMtFields || {}),
                ...(llamaMtFields || {}),
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
                        return exe && exe !== 'ffmpeg' && pathExists(exe) ? exe : '';
                    } catch {
                        return '';
                    }
                })(),
                sync: false,
            };

            const primaryAsr = String(fileMerged.engineAsrModel || 'sensevoice-small').trim()
                || 'sensevoice-small';
            const asrCandidates = resolveAsrFailoverCandidates(
                primaryAsr,
                fileMerged.engineInstallPath,
                { perfProfile: fileMerged.perfProfile },
            );

            sendProgress(invokeSender, {
                stage: 'model',
                index1,
                total: list.length,
                file: mediaPath,
                detail: `创建引擎任务（${primaryAsr}）…`,
                ...remapBridgeProgress(engineTask, { stage: 'model', percent: 20 }),
            });

            const buildJobBody = (asrModel) => ({
                ...jobBody,
                asrModel,
            });

            const { runEngineJobWithPreMtHandoffs } = require('./engine-asr-semantic-handoff');

            const runOutcome = await runEngineJobWithPreMtHandoffs({
                jobBody,
                engineTask,
                fileMerged,
                options: fileMerged,
                setMtHoldIndexes: typeof mtAdapter?.setHoldIndexes === 'function'
                    ? (indexes, meta) => mtAdapter.setHoldIndexes(indexes, meta)
                    : null,
                repairMeta: {
                    glossary: glossaryPairs,
                    primaryAsr,
                    mediaPath,
                    onLog: (line) => {
                        appendEngineLogLine(`[engine] ${line}`, invokeSender);
                    },
                },
                runSingleJob: (body, progressMeta = {}) => runEngineJobWithAsrFailover({
                    baseUrl: ensure.baseUrl,
                    buildJobBody: (asrModel) => ({
                        ...body,
                        asrModel,
                    }),
                    primaryAsr,
                    candidates: asrCandidates,
                    createJob,
                    waitJob,
                    shouldStop: stopRequested,
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
                            shouldStop: stopRequested,
                        });
                        if (again?.ok) ensure = again;
                        return again;
                    },
                    onCandidate: ({ asrModel, index: candIdx }) => {
                        if (stopRequested()) return;
                        if (candIdx > 0) {
                            appendEngineLogLine(
                                `[engine] ASR 回退：${primaryAsr} → ${asrModel}`,
                                invokeSender,
                            );
                        }
                        // Stay in prep band until engine SSE reports transcribe — avoid
                        // pre-bumping to ~10% (transcribe@8) then stalling during model load.
                        sendProgress(invokeSender, {
                            stage: 'model',
                            index1,
                            total: list.length,
                            file: mediaPath,
                            detail: candIdx === 0
                                ? `加载识别模型（${asrModel}）…`
                                : `${primaryAsr} 无结果，改用 ${asrModel}…`,
                            ...remapBridgeProgress(engineTask, {
                                stage: 'model',
                                percent: candIdx === 0 ? 35 : 55,
                            }),
                        });
                    },
                    onJobCreated: (jobId) => {
                        host.currentJobId = String(jobId || '');
                    },
                    onEvent: (ev) => {
                        if (stopRequested()) return;
                        const rawFields = progressFieldsFromWaitEvent(ev);
                        // Bare `{type:done}` after ASR-only phase must not bump UI to 97%.
                        if (!rawFields) {
                            const jidOnly = ev?.data?.id || host.currentJobId;
                            if (jidOnly) host.currentJobId = String(jidOnly);
                            return;
                        }
                        let fields = sanitizeBatchEngineSseProgress(rawFields);
                        fields = softenTranslateProgressFields(
                            fields,
                            getTranslateProgressSession(mediaPath),
                        );
                        const jid = ev?.data?.id || host.currentJobId;
                        if (jid) host.currentJobId = String(jid);
                        if (String(fields.stage || '').toLowerCase() === 'translate'
                            || String(fields.stage || '').toLowerCase() === 'mt') {
                            noteEngineTranslatePercent(mtUiProgress, fields.percent);
                        }
                        sendProgress(invokeSender, {
                            ...fields,
                            index1,
                            total: list.length,
                            file: mediaPath,
                            jobId: host.currentJobId,
                            itemDualPhase: progressMeta.itemDualPhase || fields.itemDualPhase,
                        });
                    },
                }),
                onProgress: (info) => {
                    const mapped = remapBridgeProgress(engineTask, info);
                    sendProgress(invokeSender, {
                        ...mapped,
                        index1,
                        total: list.length,
                        file: mediaPath,
                        itemDualPhase: mapped.itemDualPhase,
                    });
                },
                onLog: (line) => {
                    appendEngineLogLine(`[engine] ${line}`, invokeSender);
                },
            });
            // Keep last job id for cancel / checkpoint probe
            if (runOutcome.jobId) host.currentJobId = String(runOutcome.jobId);
            if (runOutcome.ok && runOutcome.asrModel && runOutcome.asrAttempts > 1) {
                appendEngineLogLine(
                    `[engine] ASR 回退成功：第 ${runOutcome.asrAttempts} 次候选${runOutcome.asrModel}`,
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
            const failedJobId = host.currentJobId;
            host.currentJobId = '';

            const waitInterp = interpretWaitJobResult(waited, stopRequested());
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
                    phase: 'cancelled',
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
                if (continueAfterItemCancel()) {
                    skipped += 1;
                    const again = await ensureEngineAfterItemCancel(merged, invokeSender);
                    if (again?.ok) ensure = again;
                    else break;
                    continue;
                }
                break;
            }

            if (waitInterp.kind === 'failed') {
                const rawErr = waitInterp.error || '任务失败';
                if (
                    isTorchEngineProcessPoisonError(rawErr)
                    && !torchPoisonRetried.has(mediaPath)
                    && !stopRequested()
                ) {
                    torchPoisonRetried.add(mediaPath);
                    appendEngineLogLine(
                        '[engine] Torch 进程已损坏，正在重启引擎后重试本条…',
                        invokeSender,
                    );
                    sendProgress(invokeSender, {
                        stage: 'starting',
                        index1,
                        total: list.length,
                        file: mediaPath,
                        detail: 'Torch 进程已损坏，正在重启引擎后重试本条…',
                        percent: 2,
                    });
                    const again = await ensureEngineRunning({
                        ...merged,
                        forceRestart: true,
                        shouldStop: stopRequested,
                    });
                    if (again?.ok && again.spawned !== false) {
                        ensure = again;
                        i -= 1;
                        continue;
                    }
                    appendEngineLogLine(
                        `[engine] Torch 损坏后引擎重启失败：${
                            again?.spawned === false
                                ? '未拉起新进程（端口仍被占用）'
                                : (again?.error || 'unknown')
                        }`,
                        invokeSender,
                    );
                }
                const err = friendlyEngineError(rawErr);
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

            if (stopRequested()) {
                results.push(buildCancelledItemResult(mediaPath));
                sendProgress(invokeSender, {
                    stage: 'cancelled',
                    phase: 'cancelled',
                    index1,
                    total: list.length,
                    file: mediaPath,
                    detail: '已取消',
                    error: 'cancelled',
                });
                if (continueAfterItemCancel()) {
                    skipped += 1;
                    const again = await ensureEngineAfterItemCancel(merged, invokeSender);
                    if (again?.ok) ensure = again;
                    else break;
                    continue;
                }
                break;
            }

            const outPaths = extractOutputPaths(waitInterp.result || waited.data?.result);
            const jobResult = waitInterp.result || waited.data?.result || null;

            // translate_mt deletes `.src.partial` and omits role=source from outputs.
            // Materialize JA into transcript-keep BEFORE post-batch so paired noise
            // can run (otherwise ZH-only removeEmpty orphans JA dialogue).
            let keptSourcePath = '';
            try {
                const { keepTranscriptFromJobResult } = require('./transcript-keep');
                const kept = keepTranscriptFromJobResult({
                    task: merged.task,
                    sourceSubtitlePath: outPaths.sourceSubtitlePath,
                    subtitlePath: outPaths.subtitlePath,
                    sourceCues: jobResult?.cues?.source,
                    zhCues: jobResult?.cues?.zh,
                    targetSubtitlePath: outPaths.targetSubtitlePath || outPaths.subtitlePath,
                    outputDir: fileMerged.outputDir || merged.outputDir,
                    mediaPath,
                    options: merged,
                });
                if (kept?.ok && kept.kept?.length) {
                    keptSourcePath = String(kept.kept[0] || '').trim();
                    if (keptSourcePath) {
                        outPaths.sourceSubtitlePath = outPaths.sourceSubtitlePath || keptSourcePath;
                    }
                    appendEngineLogLine(
                        `[engine] 已保存转录字幕 ${kept.kept.length} 条 → ${kept.dir || ''}`,
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

            // 字幕库：ASR 转录完成后登记转录槽位（原文槽位在定稿交接后再建）
            // Pre-MT split already ingested 转录+原文; refresh transcript path after final keep.
            try {
                const { saveShelfTranscriptAfterAsr } = require('./subtitle-shelf-pipeline-ingest');
                saveShelfTranscriptAfterAsr({
                    mediaPath,
                    keptSourcePath,
                    outPaths,
                    options: merged,
                    onLog: runOutcome.preMtShelfSourceSaved
                        ? null
                        : (line) => appendEngineLogLine(`[engine] ${line}`, invokeSender),
                });
            } catch (err) {
                appendEngineLogLine(
                    `[engine] 字幕库保存转录跳过 ${err.message || err}`,
                    invokeSender,
                );
            }

            // ASR confidence + second opinion: after source materialized, before post-batch / MT sanitize.
            if (!runOutcome.preMtSecondOpinionDone) {
                try {
                    const asrSoCore = require('../src/js/asr-second-opinion-core');
                    const { runAsrPostTranscribeHandoff } = require('./engine-batch-success-handoff');
                    const soMode = asrSoCore.normalizeAsrSecondOpinionOption(fileMerged.asrSecondOpinion);
                    const includeSecondOpinion = soMode !== 'off' && (
                        soMode === 'on'
                        || asrSoCore.shouldRunAsrSecondOpinion({
                            asrSecondOpinion: soMode,
                            contentProfile: fileMerged.contentProfile || fileMerged.senseProfile,
                            primaryAsr: runOutcome.asrModel || waited.asrModel || primaryAsr,
                            engineAsrModel: runOutcome.asrModel || primaryAsr,
                        })
                    );
                    const handoff = await runAsrPostTranscribeHandoff(jobResult, outPaths, {
                        ...merged,
                        mediaPath,
                        primaryAsr: runOutcome.asrModel || waited.asrModel || primaryAsr,
                        engineAsrModel: runOutcome.asrModel || primaryAsr,
                        includeSecondOpinion,
                        onProgress: (info) => {
                            sendProgress(invokeSender, {
                                stage: 'transcribe',
                                index1,
                                total: list.length,
                                file: mediaPath,
                                detail: info?.detail || 'ASR 二意见…',
                            });
                        },
                    });
                    for (const line of (handoff.logs || [])) {
                        appendEngineLogLine(`[engine] ${line}`, invokeSender);
                    }
                } catch (err) {
                    appendEngineLogLine(
                        `[engine] ASR 定稿交接跳过: ${err.message || err}`,
                        invokeSender,
                    );
                }
            }

            // 字幕库：原文定稿后建立/刷新原文槽位（首次创建后内容不变）
            // Skip when pre-MT handoff already registered original (avoid duplicate log).
            if (!runOutcome.preMtShelfSourceSaved) {
                try {
                    const { saveShelfOriginalAfterSourceReady } = require('./subtitle-shelf-pipeline-ingest');
                    saveShelfOriginalAfterSourceReady({
                        mediaPath,
                        keptSourcePath,
                        outPaths,
                        options: merged,
                        onLog: (line) => appendEngineLogLine(`[engine] ${line}`, invokeSender),
                    });
                } catch (err) {
                    appendEngineLogLine(
                        `[engine] 字幕库保存原文跳过 ${err.message || err}`,
                        invokeSender,
                    );
                }
            }

            const translateLike = batchPostprocessPlan.isTranslateLikeTask(
                fileMerged.task,
                engineTask,
            );
            // Blank retranslate: early (pre-postbatch) pass retired — main MT already
            // in-chunk retries blanks; paired post-batch no longer removeEmpty on ZH.
            // Post-batch + posttask passes remain; skip LLM for indexes exhausted by main MT.
            let blankPolicy = null;
            try { blankPolicy = require('../src/js/blank-mt-retry-policy-core'); } catch { /* optional */ }
            const mtBlankExhausted = typeof mtAdapter?.getBlankExhaustedIndexes === 'function'
                ? mtAdapter.getBlankExhaustedIndexes()
                : [];
            let blankExhaustedAcc = blankPolicy?.normalizeBlankIndexList?.(mtBlankExhausted) || mtBlankExhausted || [];
            const runEarlyBlank = blankPolicy?.shouldRunEarlyBlankPass
                ? blankPolicy.shouldRunEarlyBlankPass(merged)
                : false;
            let earlyBlankLeft = null;
            if (translateLike && runEarlyBlank) {
                try {
                    const {
                        buildItemRecord,
                        runBlankMtRetranslatePass,
                    } = require('./engine-item-posttask-handoff');
                    const blankRes = await runBlankMtRetranslatePass(
                        buildItemRecord(outPaths, mediaPath),
                        merged,
                        {
                            engineTask,
                            onProgress: (info) => {
                                const mapped = remapBridgeProgress(engineTask, {
                                    stage: 'cleanup',
                                    percent: Number(info?.percent) || 88,
                                    detail: info?.detail || '空白重译…',
                                });
                                sendProgress(invokeSender, {
                                    ...mapped,
                                    index1,
                                    total: list.length,
                                    file: mediaPath,
                                });
                            },
                            onLog: (line) => {
                                appendEngineLogLine(`[engine] ${line}`, invokeSender);
                            },
                            event: invokeSender ? { sender: invokeSender } : null,
                            shouldStop: itemStopHooks.shouldStop,
                            signal: itemStopHooks.signal,
                        },
                    );
                    if (blankRes?.cancelled || stopRequested()) {
                        liveBatch.clearCurrent();
                        const adv = await settleCancelledItem();
                        if (adv === 'continue') continue;
                        break;
                    }
                    if (Number(blankRes?.recovered) > 0) {
                        appendEngineLogLine(
                            `[engine] 空白重译补全 ${blankRes.recovered} 条`,
                            invokeSender,
                        );
                    }
                    earlyBlankLeft = Number(blankRes?.left);
                    if (!Number.isFinite(earlyBlankLeft) && blankRes?.skipped && blankRes?.reason === 'none') {
                        earlyBlankLeft = 0;
                    }
                    blankExhaustedAcc = blankPolicy?.mergeBlankIndexLists?.(
                        blankExhaustedAcc,
                        blankRes?.exhaustedIndexes,
                    ) || blankExhaustedAcc;
                } catch (err) {
                    appendEngineLogLine(
                        `[engine] 空白重译跳过: ${err.message || err}`,
                        invokeSender,
                    );
                }
            }

            // Free-path postprocess (same knobs as UI post-batch): strip Whisper YouTube-style hallucinations etc.
            const { applyPostBatchPipeline } = require('./post-batch-pipeline');
            applyPostBatchPipeline([
                outPaths.sourceSubtitlePath,
                keptSourcePath,
                outPaths.targetSubtitlePath,
                outPaths.bilingualSubtitlePath,
                outPaths.subtitlePath,
            ], {
                ...merged,
                sourceCues: jobResult?.cues?.source,
            }, {
                onProgress: (info) => {
                    const mapped = remapBridgeProgress(engineTask, {
                        stage: 'cleanup',
                        percent: Number(info?.percent) || 50,
                        detail: info?.detail || '后处理字幕…',
                    });
                    sendProgress(invokeSender, {
                        ...mapped,
                        index1,
                        total: list.length,
                        file: mediaPath,
                    });
                },
                onLog: (line) => {
                    appendEngineLogLine(`[engine] ${line}`, invokeSender);
                },
            });

            // Second blank pass AFTER post-batch: viewing-punct used to wipe «…» slots;
            // recover any blanks that survive cleanup (primary mid-pipeline blank pass).
            const skipPostBlank = blankPolicy?.shouldSkipPostBatchBlankPass
                ? blankPolicy.shouldSkipPostBatchBlankPass({
                    earlyLeft: earlyBlankLeft,
                    options: merged,
                })
                : (merged.postBatchBlankRetranslate === false);
            const runPostBlank = !skipPostBlank && (
                blankPolicy?.shouldRunPostBatchBlankPass
                    ? blankPolicy.shouldRunPostBatchBlankPass(merged)
                    : (merged.postBatchBlankRetranslate !== false)
            );
            if (translateLike && runPostBlank) {
                try {
                    const {
                        buildItemRecord,
                        runBlankMtRetranslatePass,
                    } = require('./engine-item-posttask-handoff');
                    const blankOpts = {
                        ...merged,
                        blankMtSkipLlmIndexes: blankExhaustedAcc,
                        blankExhaustedIndexes: blankExhaustedAcc,
                    };
                    const blankRes2 = await runBlankMtRetranslatePass(
                        buildItemRecord({
                            ...outPaths,
                            sourceSubtitlePath: outPaths.sourceSubtitlePath || keptSourcePath,
                        }, mediaPath),
                        blankOpts,
                        {
                            engineTask,
                            onProgress: (info) => {
                                const mapped = remapBridgeProgress(engineTask, {
                                    stage: 'cleanup',
                                    percent: Number(info?.percent) || 92,
                                    detail: info?.detail || '空白重译（后处理）…',
                                });
                                sendProgress(invokeSender, {
                                    ...mapped,
                                    index1,
                                    total: list.length,
                                    file: mediaPath,
                                });
                            },
                            onLog: (line) => {
                                appendEngineLogLine(`[engine] ${line}`, invokeSender);
                            },
                            event: invokeSender ? { sender: invokeSender } : null,
                            shouldStop: itemStopHooks.shouldStop,
                            signal: itemStopHooks.signal,
                        },
                    );
                    if (blankRes2?.cancelled || stopRequested()) {
                        liveBatch.clearCurrent();
                        const adv = await settleCancelledItem();
                        if (adv === 'continue') continue;
                        break;
                    }
                    if (Number(blankRes2?.recovered) > 0) {
                        appendEngineLogLine(
                            `[engine] 后处理空白重译补录${blankRes2.recovered} 条`,
                            invokeSender,
                        );
                    }
                    blankExhaustedAcc = blankPolicy?.mergeBlankIndexLists?.(
                        blankExhaustedAcc,
                        blankRes2?.exhaustedIndexes,
                    ) || blankExhaustedAcc;
                    if (blankExhaustedAcc.length) {
                        merged.blankMtSkipLlmIndexes = blankExhaustedAcc;
                        merged.blankExhaustedIndexes = blankExhaustedAcc;
                        fileMerged.blankMtSkipLlmIndexes = blankExhaustedAcc;
                        fileMerged.blankExhaustedIndexes = blankExhaustedAcc;
                    }
                } catch (err) {
                    appendEngineLogLine(
                        `[engine] 后处理空白重译跳过 ${err.message || err}`,
                        invokeSender,
                    );
                }
            } else if (translateLike && skipPostBlank && Number.isFinite(earlyBlankLeft) && earlyBlankLeft <= 0) {
                appendEngineLogLine(
                    '[engine] 后处理空白重译跳过：译后首遍已无剩余空白',
                    invokeSender,
                );
            }
            // File-level MT sanitize (Opus + any adapter miss): strip trailing cast-name
            // hallucinations / Gloss / loops on ZH against JA source or result.cues.source.
            if (translateLike && merged.mtSanitize !== false) {
                try {
                    const { sanitizeMtSubtitlePair } = require('./extensions-bridge');
                    const uniqueZh = batchPostprocessPlan.collectUniqueZhSubtitlePaths(outPaths, {
                        resolve: path.resolve,
                        existsSync: pathExists,
                    });
                    for (const zhPath of uniqueZh) {
                        const mapped = remapBridgeProgress(engineTask, {
                            stage: 'cleanup',
                            percent: 85,
                            detail: '后处理：译后清洗…',
                        });
                        sendProgress(invokeSender, {
                            ...mapped,
                            index1,
                            total: list.length,
                            file: mediaPath,
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
                            skipFakeGreeting: useSmartTranslate || useExternalMt || useLlamaMt,
                            smartTranslate: useSmartTranslate,
                            translateMode: fileMerged.translateMode,
                            subtitleTargetLang: fileMerged.subtitleTargetLang || fileMerged.targetLang
                                || merged.subtitleTargetLang || merged.targetLang,
                            targetLang: fileMerged.targetLang || fileMerged.subtitleTargetLang
                                || merged.targetLang || merged.subtitleTargetLang,
                            targetLanguage: fileMerged.targetLanguage || merged.targetLanguage,
                            chineseSubtitleVariant: fileMerged.chineseSubtitleVariant
                                || merged.chineseSubtitleVariant,
                            backupMode: 'off',
                            // 推理/混合句级：首遍禁止整轨错位回正，否则易旋成「…」再触发数百条省略号直译。
                            skipDialogueContentShiftRepair: (() => {
                                try {
                                    const blankPolicy = require('../src/js/blank-mt-retry-policy-core');
                                    return !!blankPolicy.isInferenceBlankDirectFinalize?.(fileMerged)
                                        || !!blankPolicy.isInferenceBlankDirectFinalize?.(merged);
                                } catch {
                                    return false;
                                }
                            })(),
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
            // Honors settings for all titles including 番号 / av_soft.
            const {
                dropDiscourse,
                dropOnomatopoeia,
                shouldCompact,
            } = batchPostprocessPlan.resolveInterjectionDropFlags({
                ...merged,
                ...fileMerged,
            });
            if (translateLike && shouldCompact) {
                try {
                    const { compactPureInterjectionSubtitlePair } = require('./extensions-bridge');
                    const uniqueZh = batchPostprocessPlan.collectUniqueZhSubtitlePaths(outPaths, {
                        resolve: path.resolve,
                        existsSync: pathExists,
                    });
                    for (const zhPath of uniqueZh) {
                        const mapped = remapBridgeProgress(engineTask, {
                            stage: 'cleanup',
                            percent: 95,
                            detail: '后处理：清除语气/拟声…',
                        });
                        sendProgress(invokeSender, {
                            ...mapped,
                            index1,
                            total: list.length,
                            file: mediaPath,
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

            // Hy-MT ellipsis policy: delete pure moan/discourse; recover lexical …
            // Early left is stats-only; hard gate re-counts after post-task (dropAll may blank slots).
            let ellipsisEarlyLeft = 0;
            if (translateLike && merged.hyMtEllipsisPolicy !== false) {
                try {
                    const { runHyMtEllipsisPolicyPass } = require('./hymt-ellipsis-policy');
                    const uniqueZh = batchPostprocessPlan.collectUniqueZhSubtitlePaths(outPaths, {
                        resolve: path.resolve,
                        existsSync: pathExists,
                    });
                    const jaPath = outPaths.sourceSubtitlePath || keptSourcePath;
                    let ellipsisCancelAdvance = null;
                    for (const zhPath of uniqueZh) {
                        if (!jaPath || !pathExists(jaPath)) break;
                        const mapped = remapBridgeProgress(engineTask, {
                            stage: 'cleanup',
                            percent: 96,
                            detail: '后处理：省略号策略…',
                        });
                        sendProgress(invokeSender, {
                            ...mapped,
                            index1,
                            total: list.length,
                            file: mediaPath,
                        });
                        if (stopRequested()) {
                            ellipsisCancelAdvance = 'pending';
                            break;
                        }
                        const ep = await runHyMtEllipsisPolicyPass({
                            zhPath,
                            jaPath,
                            options: merged,
                            onProgress: (info) => {
                                // Blank-retry LLM emits many per-cue ticks; defaulting them all to
                                // 「省略号策略…」flooded the engine log (195× repeats). Only surface
                                // concrete progress text from the inner pass.
                                const detail = String(info?.detail || info?.message || '').trim();
                                if (!detail || /省略号策略/.test(detail)) return;
                                const pct = Number(info?.percent);
                                const m2 = remapBridgeProgress(engineTask, {
                                    stage: 'cleanup',
                                    percent: Number.isFinite(pct) && pct > 0 ? pct : 96,
                                    detail,
                                });
                                sendProgress(invokeSender, {
                                    ...m2,
                                    index1,
                                    total: list.length,
                                    file: mediaPath,
                                });
                            },
                            onLog: (line) => {
                                appendEngineLogLine(`[engine] ${line}`, invokeSender);
                            },
                            event: invokeSender ? { sender: invokeSender } : null,
                            shouldStop: itemStopHooks.shouldStop,
                            signal: itemStopHooks.signal,
                        });
                        if (ep?.cancelled || ep?.code === 'cancelled' || stopRequested()) {
                            ellipsisCancelAdvance = 'pending';
                            break;
                        }
                        if (ep?.summary && (ep.deleted || ep.recovered || ep.left || ep.planStats)) {
                            appendEngineLogLine(`[engine] ${ep.summary}`, invokeSender);
                            if (ep.planStats?.summaryLine) {
                                appendEngineLogLine(
                                    `[engine] 省略号分工：${ep.planStats.summaryLine}`,
                                    invokeSender,
                                );
                            }
                        }
                        ellipsisEarlyLeft += Number(ep?.left) || 0;
                    }
                    if (ellipsisCancelAdvance || stopRequested()) {
                        liveBatch.clearCurrent();
                        const adv = await settleCancelledItem();
                        if (adv === 'continue') continue;
                        break;
                    }
                } catch (err) {
                    appendEngineLogLine(
                        `[engine] 省略号策略跳过：${err.message || err}`,
                        invokeSender,
                    );
                }
            }
            let ellipsisGateLeft = 0;

            // Kept JA may have been materialized before ZH hit disk — borrow timeline from final 译文.
            // Skip when ZH already diverges from engine JA (index borrow would shift the whole track).
            if (keptSourcePath && pathExists(keptSourcePath)) {
                try {
                    const {
                        refreshKeptTranscriptTimings,
                        cuesHeadDivergesFromSnapshot,
                        engineCuesToKeepCues,
                    } = require('./transcript-keep');
                    const engJa = Array.isArray(jobResult?.cues?.source)
                        ? engineCuesToKeepCues(jobResult.cues.source)
                        : [];
                    let zhForRefresh = null;
                    try {
                        const { readSubtitleDocument } = require('./extensions-bridge');
                        const zhPath = outPaths.targetSubtitlePath || outPaths.subtitlePath;
                        const zhDoc = zhPath ? readSubtitleDocument(zhPath) : null;
                        if (zhDoc?.ok && Array.isArray(zhDoc.cues)) zhForRefresh = zhDoc.cues;
                    } catch { /* optional */ }
                    const skipBorrow = engJa.length >= 8
                        && Array.isArray(zhForRefresh)
                        && zhForRefresh.length >= 8
                        && cuesHeadDivergesFromSnapshot(zhForRefresh, engJa);
                    if (skipBorrow) {
                        appendEngineLogLine(
                            `[engine] 转录时间轴同步跳过：译文与引擎原文头/时间轴已漂移`,
                            invokeSender,
                        );
                    } else {
                        const timingRefs = {
                            zhCues: jobResult?.cues?.zh,
                            targetSubtitlePath: outPaths.targetSubtitlePath || outPaths.subtitlePath,
                            subtitlePath: outPaths.subtitlePath,
                            outputDir: fileMerged.outputDir || merged.outputDir,
                            mediaPath,
                        };
                        const refreshed = refreshKeptTranscriptTimings(
                            keptSourcePath,
                            timingRefs,
                            merged,
                        );
                        if (refreshed?.refreshed) {
                            appendEngineLogLine(
                                `[engine] 转录字幕时间轴已从译文同步 → ${path.basename(keptSourcePath)}`,
                                invokeSender,
                            );
                            if (outPaths.sourceSubtitlePath === keptSourcePath
                                || !outPaths.sourceSubtitlePath) {
                                outPaths.sourceSubtitlePath = keptSourcePath;
                            }
                        }
                    }
                } catch (err) {
                    appendEngineLogLine(
                        `[engine] 转录时间轴同步跳过 ${err.message || err}`,
                        invokeSender,
                    );
                }
            }

            // Transcript already saved before post-batch when possible. Only materialize
            // here if that step was skipped (no cues).
            if (!keptSourcePath) {
                try {
                    const { keepTranscriptFromJobResult } = require('./transcript-keep');
                    const kept = keepTranscriptFromJobResult({
                        task: merged.task,
                        sourceSubtitlePath: outPaths.sourceSubtitlePath,
                        subtitlePath: outPaths.subtitlePath,
                        sourceCues: jobResult?.cues?.source,
                        zhCues: jobResult?.cues?.zh,
                        targetSubtitlePath: outPaths.targetSubtitlePath || outPaths.subtitlePath,
                        outputDir: fileMerged.outputDir || merged.outputDir,
                        mediaPath,
                        options: merged,
                    });
                    if (kept?.ok && kept.kept?.length) {
                        keptSourcePath = String(kept.kept[0] || '').trim();
                        appendEngineLogLine(
                            `[engine] 已保存转录字幕 ${kept.kept.length} 条 → ${kept.dir || ''}`,
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

            // Library 原文轨需要每次任务的转录：旁路被合并删除后改指向 keep 归档。
            const liveSource = String(outPaths.sourceSubtitlePath || '').trim();
            if ((!liveSource || !pathExists(liveSource)) && keptSourcePath && pathExists(keptSourcePath)) {
                outPaths.sourceSubtitlePath = keptSourcePath;
            }

            const asrRun = summarizeAsrRunMeta({
                asrModel: runOutcome.asrModel || waited.asrModel || primaryAsr,
                primaryAsr,
                asrAttempts: runOutcome.asrAttempts,
            });
            // Count success only after ellipsis gate (below).
            doneDetail = appendAsrRunToDetail(doneDetail, asrRun);
            let postTaskMeta = { issueCount: 0 };
            try {
                const { runItemPostTaskHandoff } = require('./engine-item-posttask-handoff');
                postTaskMeta = await runItemPostTaskHandoff({
                    mediaPath,
                    outPaths,
                    options: merged,
                    primaryAsr: runOutcome.asrModel || primaryAsr,
                    engineTask,
                    polishAlreadyDone: true,
                    timingFallback: {
                        zh: jobResult?.cues?.zh || jobResult?.cues?.target,
                        ja: jobResult?.cues?.source || jobResult?.cues?.ja,
                    },
                    onProgress: (info) => {
                        sendProgress(invokeSender, {
                            ...info,
                            index1,
                            total: list.length,
                            file: mediaPath,
                        });
                    },
                    onLog: (line) => {
                        appendEngineLogLine(`[engine] ${line}`, invokeSender);
                    },
                    event: invokeSender ? { sender: invokeSender } : null,
                    shouldStop: stopRequested,
                    signal: host.itemWorkAbortController?.signal || null,
                }) || postTaskMeta;
            } catch (err) {
                appendEngineLogLine(
                    `[engine] 任务收尾跳过: ${err.message || err}`,
                    invokeSender,
                );
            }
            if (stopRequested() || postTaskMeta?.cancelled) {
                results.push(buildCancelledItemResult(mediaPath));
                sendProgress(invokeSender, {
                    stage: 'cancelled',
                    phase: 'cancelled',
                    index1,
                    total: list.length,
                    file: mediaPath,
                    detail: '已取消',
                    error: 'cancelled',
                });
                if (continueAfterItemCancel()) {
                    skipped += 1;
                    const again = await ensureEngineAfterItemCancel(merged, invokeSender);
                    if (again?.ok) ensure = again;
                    else break;
                    continue;
                }
                break;
            }
            if (Number(postTaskMeta.issueCount) > 0) {
                doneDetail = `${doneDetail} · QC ${postTaskMeta.issueCount} 项`;
            }
            // Final ellipsis + underfill gate: re-count after blank-retry + dropAll + viewing polish.
            if (translateLike && merged.hyMtEllipsisPolicy !== false
                && merged.hyMtEllipsisGate !== false) {
                try {
                    const { countRecoverableEllipsisLeft } = require('./hymt-ellipsis-policy');
                    const { countDeliveryUnderfillLeft } = require('./delivery-underfill-repair');
                    const uniqueZh = batchPostprocessPlan.collectUniqueZhSubtitlePaths(outPaths, {
                        resolve: path.resolve,
                        existsSync: pathExists,
                    });
                    const jaPath = outPaths.sourceSubtitlePath || keptSourcePath;
                    let underfillGateLeft = 0;
                    for (const zhPath of uniqueZh) {
                        if (!jaPath || !pathExists(jaPath)) break;
                        ellipsisGateLeft += countRecoverableEllipsisLeft(zhPath, jaPath, {
                            visibleOnly: true,
                        });
                        const uf = countDeliveryUnderfillLeft(zhPath, jaPath);
                        // ellipsisRecover already covered by countRecoverableEllipsisLeft —
                        // only add bareHa / underLick / jaLeak here.
                        underfillGateLeft += (Number(uf?.bareHa) || 0)
                            + (Number(uf?.underLick) || 0)
                            + (Number(uf?.jaLeak) || 0);
                    }
                    ellipsisGateLeft += underfillGateLeft;
                    if (ellipsisEarlyLeft > 0 && ellipsisGateLeft === 0) {
                        appendEngineLogLine(
                            `[engine] 省略号/欠译门禁：片中曾剩实义空条 ${ellipsisEarlyLeft}，收尾后已清零`,
                            invokeSender,
                        );
                    } else if (ellipsisGateLeft > 0 && ellipsisEarlyLeft !== ellipsisGateLeft) {
                        appendEngineLogLine(
                            `[engine] 省略号/欠译门禁：片中 ${ellipsisEarlyLeft} → 收尾后 ${ellipsisGateLeft}`
                                + (underfillGateLeft ? `（含欠译 ${underfillGateLeft}）` : ''),
                            invokeSender,
                        );
                    } else if (underfillGateLeft > 0) {
                        appendEngineLogLine(
                            `[engine] 欠译门禁：仍剩裸空/欠译/日文泄漏 ${underfillGateLeft}`,
                            invokeSender,
                        );
                    }
                } catch (err) {
                    appendEngineLogLine(
                        `[engine] 省略号/欠译门禁重算跳过：${err.message || err}`,
                        invokeSender,
                    );
                    ellipsisGateLeft = ellipsisEarlyLeft;
                }
            }
            const gateOn = merged.hyMtEllipsisGate !== false;
            // Soft by default: warn + succeed. Hard fail only when hyMtEllipsisGate === 'hard'.
            const gateHard = String(merged.hyMtEllipsisGate || '').toLowerCase() === 'hard';
            if (gateOn && gateHard && ellipsisGateLeft > 0) {
                failed += 1;
                doneDetail = `省略号/欠译门禁未过（仍剩缺陷 ${ellipsisGateLeft}）`;
                appendEngineLogLine(
                    `[engine] ${doneDetail} — 本条记为失败`,
                    invokeSender,
                );
                results.push({
                    ok: false,
                    error: doneDetail,
                    code: 'hymt_ellipsis_gate',
                    path: mediaPath,
                    ellipsisLeft: ellipsisGateLeft,
                    underfillLeft: Number(postTaskMeta?.underfillLeft) || 0,
                    bareHaLeft: Number(postTaskMeta?.bareHaLeft) || 0,
                    underLickLeft: Number(postTaskMeta?.underLickLeft) || 0,
                    blankRecovered: Number(postTaskMeta?.blankRecovered) || 0,
                    blankRounds: Number(postTaskMeta?.blankRounds) || 0,
                    blankLeft: Number(postTaskMeta?.blankLeft) || 0,
                    qcLoopRetranscribed: Number(postTaskMeta?.qcLoopRetranscribed) || 0,
                    qcLoopRetranslated: Number(postTaskMeta?.qcLoopRetranslated) || 0,
                    qcIssueCount: Number(postTaskMeta?.issueCount) || 0,
                    result: jobResult,
                    asrModel: asrRun.asrModel,
                    primaryAsr: asrRun.primaryAsr,
                    asrAttempts: asrRun.asrAttempts,
                    asrFailedOver: asrRun.failedOver,
                    ...outPaths,
                });
                sendProgress(invokeSender, {
                    stage: 'error',
                    phase: 'error',
                    index1,
                    total: list.length,
                    file: mediaPath,
                    percent: 100,
                    detail: doneDetail,
                    error: doneDetail,
                    asrModel: asrRun.asrModel,
                    primaryAsr: asrRun.primaryAsr,
                    ...outPaths,
                });
            } else {
                generated += 1;
                if (ellipsisGateLeft > 0) {
                    doneDetail = `${doneDetail} · 省略号/欠译告警（${ellipsisGateLeft}）`;
                    appendEngineLogLine(
                        `[engine] 省略号/欠译门禁告警（仍剩 ${ellipsisGateLeft}）— 本条仍记为完成`,
                        invokeSender,
                    );
                }
                results.push({
                    ok: true,
                    path: mediaPath,
                    result: jobResult,
                    asrModel: asrRun.asrModel,
                    primaryAsr: asrRun.primaryAsr,
                    asrAttempts: asrRun.asrAttempts,
                    asrFailedOver: asrRun.failedOver,
                    ellipsisLeft: ellipsisGateLeft || 0,
                    underfillLeft: Number(postTaskMeta?.underfillLeft) || 0,
                    bareHaLeft: Number(postTaskMeta?.bareHaLeft) || 0,
                    underLickLeft: Number(postTaskMeta?.underLickLeft) || 0,
                    blankRecovered: Number(postTaskMeta?.blankRecovered) || 0,
                    blankRounds: Number(postTaskMeta?.blankRounds) || 0,
                    blankLeft: Number(postTaskMeta?.blankLeft) || 0,
                    qcLoopRetranscribed: Number(postTaskMeta?.qcLoopRetranscribed) || 0,
                    qcLoopRetranslated: Number(postTaskMeta?.qcLoopRetranslated) || 0,
                    qcIssueCount: Number(postTaskMeta?.issueCount) || 0,
                    ...outPaths,
                });
                // 字幕库：单条任务完成后登记译文字幕（ASR-only 无译文时软跳过）.
                try {
                    const { saveShelfTranslationAfterTaskDone } = require('./subtitle-shelf-pipeline-ingest');
                    saveShelfTranslationAfterTaskDone({
                        mediaPath,
                        outPaths,
                        options: merged,
                        onLog: (line) => appendEngineLogLine(`[engine] ${line}`, invokeSender),
                    });
                } catch (err) {
                    appendEngineLogLine(
                        `[engine] 字幕库保存译文跳过 ${err.message || err}`,
                        invokeSender,
                    );
                }
                sendProgress(invokeSender, {
                    stage: 'done',
                    phase: 'done',
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
                    qcIssueCount: Number(postTaskMeta.issueCount) || 0,
                    qcFixedMode: postTaskMeta.qcFixedMode || '',
                    qcFixedWritten: !!postTaskMeta.qcFixedWritten,
                    qcFixedSummary: postTaskMeta.qcFixedSummary || '',
                });
            }
            } finally {
                liveBatch.clearCurrent();
                try {
                    require('./temp-cleanup').cleanupAfterJob();
                } catch { /* ignore */ }
            }
        }

        // Soft-release VRAM after the batch unless user opted into keep-warm (releaseGpuAfter=false).
        // Covers SenseVoice/Whisper (no per-job unload in auto mode) and Qwen multi-file hold.
        // Run AFTER job-finished so the completion dialog is not blocked on nvidia/GPU IPC.
        const shouldSoftReleaseGpu = (
            !host.batchCancelled
            && typeof shouldReleaseGpuAfterBatch === 'function'
            && shouldReleaseGpuAfterBatch(merged, {
                batchItemCount: list.length,
                primaryAsr: merged.engineAsrModel,
                sakuraOrSmart: usedExternalMt,
            })
        );

        const cancelled = host.batchCancelled;
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

        if (shouldSoftReleaseGpu) {
            try {
                const again = await ensureEngineRunning(merged);
                if (again?.ok) {
                    const released = await releaseGpuMemory(again.baseUrl, { timeoutMs: 15000 });
                    if (released?.ok) {
                        appendEngineLogLine('[engine] 批次结束 · 已释放引擎显存', invokeSender);
                    } else {
                        appendEngineLogLine(
                            `[engine] 批次结束 · 释放显存未成功：${released?.error || released?.detail || 'unknown'}`,
                            invokeSender,
                        );
                        // Explicit checkbox: soft API failed → stop process to free CUDA context.
                        if (merged.releaseGpuAfter === true && typeof stopEngineProcessAndPort === 'function') {
                            try {
                                stopEngineProcessAndPort();
                                appendEngineLogLine(
                                    '[engine] 批次结束 · 已停止引擎进程以强制释放显存',
                                    invokeSender,
                                );
                            } catch (stopErr) {
                                appendEngineLogLine(
                                    `[engine] 强制停引擎失败：${stopErr?.message || stopErr}`,
                                    invokeSender,
                                );
                            }
                        }
                    }
                }
            } catch (err) {
                appendEngineLogLine(
                    `[engine] 批次结束 · 释放显存异常：${err?.message || err}`,
                    invokeSender,
                );
            }
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
            await reclaimLocalComputeAfterEngineBatch({
                usedExternalMt,
                failedOrCancelled: batchFailedOrCancelled || host.batchCancelled,
            });
        } catch { /* ignore */ }
        host.batchRunning = false;
        host.currentJobId = '';
        try {
            require('./live-batch-queue').end();
        } catch { /* ignore */ }
        try {
            require('./engine-tray-progress').endBatchTrayProgress();
        } catch { /* ignore */ }
    }

    }

    return { runEngineBatchLocked };
}

module.exports = {
    createEngineBatchLoop,
};
