/**
 * Engine batch generate/cancel/resume/diagnostics + local whl IPC.
 * Extracted from engine-bridge setupEngineBridge (thin shell).
 */

/**
 * @param {(channel: string, handler: Function) => void} register
 * @param {object} host
 * @param {object} host.s mutable engine session (engineProc, batchRunning, …)
 * @param {object} host.h pure helpers / deps from engine-bridge
 */
function registerEngineBatchIpc(register, host = {}) {
    if (typeof register !== 'function') {
        throw new Error('registerEngineBatchIpc: register required');
    }
    const s = host.s;
    const h = host.h;
    if (!s || !h) throw new Error('registerEngineBatchIpc: host.s and host.h required');

    const {
        readMergedOptions,
        ensureEngineRunning,
        getGpuRuntime,
        getAudioSeparateRuntime,
        sleep,
        stopEngineProcess,
        stopEngineProcessAndPort,
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
        fs,
        path,
    } = h;

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
        s.batchCancelled = true;
        s.itemCancelled = false;
        abortBatchMtAdapter();
        try { s.itemWorkAbortController?.abort(); } catch { /* ignore */ }
        if (s.opusTextAbortController) {
            try {
                s.opusTextAbortController.abort();
            } catch { /* ignore */ }
            s.opusTextAbortController = null;
        }
        const jobId = s.currentJobId;
        if (jobId && s.engineBaseUrl) {
            try {
                await cancelJob(s.engineBaseUrl, jobId);
            } catch { /* ignore */ }
        }
        // Post-task blank / ellipsis / Hy-MT may hold llama outside the engine job.
        try {
            await require('./engine-cancel-llm').interruptLocalMtLlm({
                scope: 'batch',
                engineBaseUrl: s.engineBaseUrl,
            });
        } catch { /* ignore */ }
        // SenseVoice model.generate() / long MT ignore cooperative cancel.
        // Kill the managed engine process so waitJob unblocks immediately.
        if (s.engineProc) {
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
        if (!s.batchRunning) {
            return { ok: false, cancelled: false, error: '没有进行中的字幕批次', code: 'no_batch' };
        }
        // Keep s.batchCancelled false so the loop continues after this file.
        s.itemCancelled = true;
        try { s.itemWorkAbortController?.abort(); } catch { /* ignore */ }
        // Do not abortBatchMtAdapter — remaining items still need the external MT server.
        if (s.opusTextAbortController) {
            try {
                s.opusTextAbortController.abort();
            } catch { /* ignore */ }
            s.opusTextAbortController = null;
        }
        const jobId = s.currentJobId;
        if (jobId && s.engineBaseUrl) {
            try {
                await cancelJob(s.engineBaseUrl, jobId);
            } catch { /* ignore */ }
        }
        // Kill the engine only while an ASR/MT job is in flight. Post-task QC/LLM
        // must not be restarted by the closed loop after a row stop.
        if (jobId && s.engineProc) {
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
                engineBaseUrl: s.engineBaseUrl,
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
                s.batchCancelled = false;
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
                s.batchMtAbortController = new AbortController();
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
                            signal: s.batchMtAbortController.signal,
                            onProgress: (info) => {
                                if (s.batchCancelled) return;
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
                        shouldStop: () => s.batchCancelled,
                        onEvent: (ev) => {
                            if (s.batchCancelled) return;
                            const rawFields = progressFieldsFromWaitEvent(ev);
                            if (!rawFields) {
                                s.currentJobId = String(ev?.data?.id || s.currentJobId || '');
                                return;
                            }
                            let fields = sanitizeBatchEngineSseProgress(rawFields);
                            const resumePath = payload.mediaPath || '';
                            fields = softenTranslateProgressFields(
                                fields,
                                getTranslateProgressSession(resumePath),
                            );
                            s.currentJobId = String(ev?.data?.id || s.currentJobId || '');
                            if (String(fields.stage || '').toLowerCase() === 'translate'
                                || String(fields.stage || '').toLowerCase() === 'mt') {
                                noteEngineTranslatePercent(resumeMtUi, fields.percent);
                            }
                            sendProgress(invokeSender, {
                                ...fields,
                                file: resumePath,
                                jobId: s.currentJobId,
                                detail: fields.detail || `从原文继续翻译（自 ${fromJobId}）…`,
                            });
                        },
                    });
                    s.currentJobId = '';
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
                hfEndpoint: require('./engine-download-urls').resolveHfEndpointForDownload(
                    payload && payload.hfEndpoint,
                    options.engineHfEndpoint,
                ),
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
                    hfEndpoint: require('./engine-download-urls').resolveHfEndpointForDownload(
                        payload && payload.hfEndpoint,
                        options.engineHfEndpoint,
                    ),
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
        isBatchRunning: () => s.batchRunning,
        isDownloadBusy: () => s.downloadBusy,
        setDownloadBusy: (v) => { s.downloadBusy = !!v; },
        getDownloadAbort: () => s.downloadAbort,
        setDownloadAbort: (ac) => { s.downloadAbort = ac; },
        readMergedOptions,
        resolveEngineInstallPath,
        resolveEngineRuntimePython,
        getEngineProc: () => s.engineProc,
        stopEngineProcess,
        stopEngineProcessAndPort,
        sleep,
        ensureEngineRunning,
        getAudioSeparateRuntime,
        getGpuRuntime,
    });

    try {
        const { registerEngineEllipsisBackfillIpc } = require('./engine-ellipsis-backfill-ipc');
        registerEngineEllipsisBackfillIpc(register, {
            readMergedOptions,
            appendEngineLogLine,
            sendProgress,
        });
    } catch (err) {
        console.warn('[engine-batch-ipc] ellipsis-backfill ipc skipped', err?.message || err);
    }
}

module.exports = { registerEngineBatchIpc };
