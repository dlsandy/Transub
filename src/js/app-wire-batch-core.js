/**
 * Domain wire: batch job progress / post-batch / start runner / queue helpers.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAppWireBatch = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function appWireBatchFactory(global) {
    function getBindApi() {
        return (global && global.TransubAppApiBind)
            || (typeof require === 'function' ? require('./app-api-bind-core.js') : null)
            || {};
    }

    function resolveApi(host, hostKey, globalName) {
        if (host && host[hostKey]) return host[hostKey];
        return (global && global[globalName]) || {};
    }

    function late(host, name) {
        return (...args) => {
            const fn = host[name];
            return typeof fn === 'function' ? fn(...args) : undefined;
        };
    }

    const BATCH_JOB_PROGRESS_METHODS = [
        'updateItem',
        'resetVideoProgress',
        'resetJobProgressState',
        'maybeAppendJobStageLog',
        'resolveIdleProgressLabel',
        'paintIdleProgressUi',
        'computeEtaSec',
        'paintProgressUi',
        'updateProgressUi',
        'syncVideoProgressFromPayload',
        'buildItemsFromPaths',
        'onJobStart',
        'onProgress',
        'refreshSubtitlePathsForItems',
        'onJobFinished',
    ];

    const POST_BATCH_RUNNER_METHODS = [
        'patchItemQcRunning',
        'scanQcForItems',
        'runPostBatchQcScan',
        'resolveQcSilenceSplitCharsFromSaved',
        'runPostBatchQcSilenceSplitOnly',
        'runPostBatchQcAutoFixIfEnabled',
        'resolvePostBatchChineseVariant',
        'runPostBatchChineseConvert',
        'runPostBatchInsertTextPreset',
    ];

    /**
     * @param {object} host
     * @returns {object} host
     */
    function install(host) {
        const h = host || {};
        const { bindApiMethods, createLazyFactory } = getBindApi();
        if (typeof createLazyFactory !== 'function' || typeof bindApiMethods !== 'function') {
            return h;
        }

        const settingsNormApi = h.settingsNormApi
            || (global && global.TransubSettingsOptionsNormalize)
            || {};
        const etaApi = h.etaApi || (global && global.TransubEta) || {};
        const rowRefreshAtByPath = h.rowRefreshAtByPath || new Map();
        const ROW_REFRESH_THROTTLE_MS = h.ROW_REFRESH_THROTTLE_MS || 800;

        h.getBatchJobProgress = createLazyFactory(
            () => resolveApi(h, 'batchJobProgressApi', 'TransubBatchJobProgress').createBatchJobProgress,
            () => ({
                state: h.state,
                els: h.els,
                electron: h.electron,
                appendLog: late(h, 'appendLog'),
                showToast: late(h, 'showToast'),
                uiTf: late(h, 'uiTf'),
                basename: late(h, 'basename'),
                normPath: late(h, 'normPath'),
                findItem: late(h, 'findItem'),
                renderList: late(h, 'renderList'),
                refreshListRow: late(h, 'refreshListRow'),
                updateStartButton: late(h, 'updateStartButton'),
                updateQcBanner: late(h, 'updateQcBanner'),
                clearItemQcFixed: late(h, 'clearItemQcFixed'),
                countQcIssues: late(h, 'countQcIssues'),
                flushPendingQueue: (...a) => h.flushPendingQueue(...a),
                scheduleExternalImportIdleAfterBatch: late(h, 'scheduleExternalImportIdleAfterBatch'),
                retryAllFailedItems: late(h, 'retryAllFailedItems'),
                syncEngineModelsBrowseOnlyFromTaskState: late(h, 'syncEngineModelsBrowseOnlyFromTaskState'),
                syncResourceUsageMonitor: late(h, 'syncResourceUsageMonitor'),
                startElapsedTicker: late(h, 'startElapsedTicker'),
                stopElapsedTicker: late(h, 'stopElapsedTicker'),
                taskLabelOf: late(h, 'taskLabelOf'),
                readTaskFromForm: late(h, 'readTaskFromForm'),
                readEngineBackendFromForm: late(h, 'readEngineBackendFromForm'),
                resolveOutputDirFromForm: late(h, 'resolveOutputDirFromForm'),
                formatDuration: late(h, 'formatDuration'),
                elapsedSecSince: late(h, 'elapsedSecSince'),
                setBadge: late(h, 'setBadge'),
                setFocusedTaskPath: late(h, 'setFocusedTaskPath'),
                trimTaskLog: (...a) => h.trimTaskLog(...a),
                updateTaskStation: late(h, 'updateTaskStation'),
                clearQwenIslandBatchSticky: late(h, 'clearQwenIslandBatchSticky'),
                computeDisplayProgress: late(h, 'computeDisplayProgress'),
                formatJobProgressLabel: late(h, 'formatJobProgressLabel'),
                stageLabel: late(h, 'stageLabel'),
                scrubProgressDetail: late(h, 'scrubProgressDetail'),
                bumpProgress: late(h, 'bumpProgress'),
                stageRank: late(h, 'stageRank'),
                isPreTranscribeStage: late(h, 'isPreTranscribeStage'),
                inferProgress: h.inferProgress || (global && global.TransubInferStageProgress) || {},
                progressDisplayApi: h.progressDisplayApi || (global && global.TransubProgressDisplay) || {},
                jobProgressLogApi: h.jobProgressLogApi || (global && global.TransubJobProgressLog) || {},
                jobLogTrackers: h.jobLogTrackers,
                etaApi,
                translateStyleApi: h.translateStyleApi || (global && global.TransubTranslateStyle) || {},
                rowRefreshAtByPath,
                ROW_REFRESH_THROTTLE_MS,
                getSavedOptionsSnapshot: () => (typeof h.getSavedOptionsSnapshot === 'function'
                    ? h.getSavedOptionsSnapshot()
                    : h.savedOptionsSnapshot),
                buildRuntimeOptions: late(h, 'buildRuntimeOptions'),
                getUx: () => (typeof h.ux === 'function' ? h.ux() : h.ux),
                getContentProfileApi: () => (global && global.TransubContentProfile) || null,
                getFeaturesApi: () => (global && global.TransubFeatures) || null,
                getBatchRecoveryApi: () => (global && global.TransubBatchRecovery) || null,
            }),
        );

        Object.assign(h, bindApiMethods(h.getBatchJobProgress, BATCH_JOB_PROGRESS_METHODS, {
            resolveIdleProgressLabel: (v) => v || '等待新任务...',
            computeEtaSec: (v) => v || 0,
            buildItemsFromPaths: (v) => v || [],
        }));

        h.isProgressIdle = function isProgressIdle() {
            const api = h.getBatchJobProgress();
            if (!api) {
                const state = h.state || {};
                return !state.running
                    && !state.postBatchBusy
                    && !state.retranslateBusy
                    && !state.qcFixing;
            }
            return api.isProgressIdle();
        };

        h.dismissLoadingOverlay = function dismissLoadingOverlay() {
            const api = h.getBatchJobProgress();
            if (!api) {
                const state = h.state || {};
                const els = h.els || {};
                state.loadingDepth = 0;
                const overlay = els.loadingOverlay
                    || (typeof document !== 'undefined' ? document.getElementById('loadingOverlay') : null);
                if (overlay) {
                    els.loadingOverlay = overlay;
                    overlay.classList.add('hidden');
                    overlay.classList.remove('flex', 'is-open');
                    overlay.style.display = 'none';
                }
                return;
            }
            return api.dismissLoadingOverlay();
        };

        h.persistFormOptionsQuiet = async function persistFormOptionsQuiet() {
            try {
                const opts = typeof h.buildSavedOptionsFromForm === 'function'
                    ? h.buildSavedOptionsFromForm()
                    : {};
                const res = await h.electron?.transWithAiSaveOptions?.(opts);
                if (res?.ok) {
                    if (typeof h.setSavedOptionsSnapshot === 'function') h.setSavedOptionsSnapshot(opts);
                    else h.savedOptionsSnapshot = opts;
                    return;
                }
                console.warn('[settings] quiet save failed:', res?.error || res || 'unknown');
            } catch (err) {
                console.warn('[settings] quiet save failed:', err?.message || err);
            }
        };

        h.refreshEtaRateFromHistory = async function refreshEtaRateFromHistory() {
            const state = h.state || {};
            const els = h.els || {};
            if (!etaApi?.rateFromHistory) {
                state.etaRate = 0.35;
                return;
            }
            try {
                const res = await h.electron?.transWithAiGetTaskHistory?.();
                const entries = res?.ok && Array.isArray(res.entries)
                    ? res.entries
                    : (Array.isArray(res?.entries) ? res.entries : []);
                state.historyEntries = entries;
                const device = els.deviceSelect?.value || 'cuda';
                const task = typeof h.readTaskFromForm === 'function' ? h.readTaskFromForm() : '';
                state.etaRate = etaApi.rateFromHistory(entries, { device, task })
                    ?? (task === 'dual'
                        ? (etaApi.DEFAULT_WALL_FACTOR ?? 0.35) * 2
                        : (etaApi.DEFAULT_WALL_FACTOR ?? 0.35));
            } catch {
                state.etaRate = etaApi.DEFAULT_WALL_FACTOR ?? 0.35;
            }
        };

        h.getPostBatchRunner = createLazyFactory(
            () => resolveApi(h, 'postBatchRunnerApi', 'TransubPostBatchRunner').createPostBatchRunner,
            () => ({
                state: h.state,
                electron: h.electron,
                els: h.els,
                getAdvancedEntitled: () => (typeof h.getAdvancedEntitled === 'function'
                    ? !!h.getAdvancedEntitled()
                    : !!h.advancedEntitled),
                appendLog: late(h, 'appendLog'),
                uiTf: late(h, 'uiTf'),
                basename: late(h, 'basename'),
                appConfirm: late(h, 'appConfirm'),
                getSubtitlePathForItem: late(h, 'getSubtitlePathForItem'),
                getPostBatchPathsForItem: late(h, 'getPostBatchPathsForItem'),
                resolveQcSemanticPairPathForItem: late(h, 'resolveQcSemanticPairPathForItem'),
                refreshListRow: late(h, 'refreshListRow'),
                updateProgressUi: late(h, 'updateProgressUi'),
                renderList: late(h, 'renderList'),
                updateQcBanner: late(h, 'updateQcBanner'),
                perItemQcApi: h.perItemQcApi || (global && global.TransubPerItemQc) || {},
                getPostBatchQcFixMode: late(h, 'getPostBatchQcFixMode'),
                normalizePostBatchQcFixMode: late(h, 'normalizePostBatchQcFixMode'),
                promptProUnlockRequired: late(h, 'promptProUnlockRequired'),
                markItemQcFixed: late(h, 'markItemQcFixed'),
                countQcIssues: late(h, 'countQcIssues'),
                getSavedOptionsSnapshot: () => (typeof h.getSavedOptionsSnapshot === 'function'
                    ? h.getSavedOptionsSnapshot()
                    : h.savedOptionsSnapshot),
                setSavedOptionsSnapshot: (v) => {
                    if (typeof h.setSavedOptionsSnapshot === 'function') h.setSavedOptionsSnapshot(v);
                    else h.savedOptionsSnapshot = v;
                },
                ensureJobRuntimeScripts: late(h, 'ensureJobRuntimeScripts'),
                postBatchAutofixApi: h.postBatchAutofixApi
                    || (global && global.TransubPostBatchAutofixPlan)
                    || {},
                settingsNormApi,
                normalizeViewingCleanMode: late(h, 'normalizeViewingCleanMode'),
                isTranslateLikeTask: late(h, 'isTranslateLikeTask'),
                readTaskFromForm: late(h, 'readTaskFromForm'),
                readDualLineOrderFromForm: late(h, 'readDualLineOrderFromForm'),
                getContentProfileApi: () => (global && global.TransubContentProfile) || null,
                getQcSmartApi: () => (global && global.TransubSubtitleQcSmart) || null,
                getSubtitleTargetLangApi: () => (global && global.TransubSubtitleTargetLang)
                    || (typeof window !== 'undefined' ? window.TransubSubtitleTargetLang : null),
            }),
        );

        Object.assign(h, bindApiMethods(h.getPostBatchRunner, POST_BATCH_RUNNER_METHODS, {
            scanQcForItems: (v) => v || { withIssues: 0, scanned: 0 },
            runPostBatchQcScan: (v) => v || { withIssues: 0, scanned: 0 },
            resolveQcSilenceSplitCharsFromSaved: (v) => (v == null ? 15 : v),
        }));

        h.runPostBatchQcSmartFix = async function runPostBatchQcSmartFix(onlyItem = null, opts = {}) {
            const runner = h.getPostBatchRunner();
            if (!runner) {
                if (typeof h.appendLog === 'function') h.appendLog('后处理核心未加载（post-batch-runner）', 'err');
                return;
            }
            return runner.runPostBatchQcSmartFix(onlyItem, opts);
        };

        h.runPostBatchQcFix = async function runPostBatchQcFix(onlyItem = null, opts = {}) {
            const runner = h.getPostBatchRunner();
            if (!runner) {
                if (typeof h.appendLog === 'function') h.appendLog('后处理核心未加载（post-batch-runner）', 'err');
                return;
            }
            return runner.runPostBatchQcFix(onlyItem, opts);
        };

        h.normalizeChineseSubtitleVariant = function normalizeChineseSubtitleVariant(raw) {
            const runner = h.getPostBatchRunner();
            if (runner) return runner.normalizeChineseSubtitleVariant(raw);
            if (settingsNormApi.normalizeChineseSubtitleVariant) {
                return settingsNormApi.normalizeChineseSubtitleVariant(raw);
            }
            const allowed = new Set(['simplified', 'traditional', 'traditional-tw', 'traditional-hk']);
            const cv = String(raw || 'simplified');
            return allowed.has(cv) ? cv : 'simplified';
        };

        h.chineseSubtitleVariantLabel = function chineseSubtitleVariantLabel(variant) {
            const runner = h.getPostBatchRunner();
            if (runner) return runner.chineseSubtitleVariantLabel(variant);
            if (settingsNormApi.chineseSubtitleVariantLabel) {
                return settingsNormApi.chineseSubtitleVariantLabel(variant);
            }
            if (variant === 'simplified') return '转简体';
            if (variant === 'traditional-hk') return '转繁体（香港）';
            if (variant === 'traditional-tw') return '转繁体（台湾字形）';
            return '转繁体（台湾）';
        };

        h.runPostBatchAutoFix = async function runPostBatchAutoFix(onlyItems = null) {
            const runner = h.getPostBatchRunner();
            if (!runner) {
                if (typeof h.appendLog === 'function') h.appendLog('后处理核心未加载（post-batch-runner）', 'err');
                return;
            }
            return runner.runPostBatchAutoFix(onlyItems);
        };

        h.trimTaskLog = function trimTaskLog(maxLines) {
            const els = h.els || {};
            if (!els.logHost) return;
            const renderApi = global && global.TransubLogPanelRender;
            const renderer = renderApi?.get?.(els.logHost);
            if (renderer?.trim) {
                renderer.trim(maxLines);
                renderer.flush?.(true);
                return;
            }
            const lines = [...els.logHost.querySelectorAll('.log-line')];
            if (lines.length <= maxLines) return;
            for (let i = 0; lines.length - maxLines > 0 && i < lines.length; i += 1) {
                lines[i].remove();
            }
        };

        h.reloadSavedOptionsIntoForm = async function reloadSavedOptionsIntoForm() {
            try {
                const optsRes = await h.electron?.transWithAiGetOptions?.();
                if (optsRes?.options) {
                    if (typeof h.applyOptionsToForm === 'function') await h.applyOptionsToForm(optsRes.options);
                    const snap = typeof h.buildSavedOptionsFromForm === 'function'
                        ? h.buildSavedOptionsFromForm()
                        : optsRes.options;
                    if (typeof h.setSavedOptionsSnapshot === 'function') h.setSavedOptionsSnapshot(snap);
                    else h.savedOptionsSnapshot = snap;
                    if (typeof h.updateParamsSummary === 'function') h.updateParamsSummary();
                    return optsRes.options;
                }
            } catch { /* ignore */ }
            return null;
        };

        h.getBatchStartRunner = createLazyFactory(
            () => resolveApi(h, 'batchStartRunnerApi', 'TransubBatchStartRunner').createBatchStartRunner,
            () => ({
                state: h.state,
                els: h.els,
                electron: h.electron,
                gates: {
                    computeStartBlockReason: late(h, 'computeStartBlockReason'),
                    clearStaleComputeBusyIfNeeded: late(h, 'clearStaleComputeBusyIfNeeded'),
                    syncComputeBusyFromMain: late(h, 'syncComputeBusyFromMain'),
                    getSelectedItems: late(h, 'getSelectedItems'),
                    ensureMtSelectionValidBeforeStart: late(h, 'ensureMtSelectionValidBeforeStart'),
                    ensureSmartTranslateReadinessBeforeStart: late(h, 'ensureSmartTranslateReadinessBeforeStart'),
                    warnIfSelectedEngineModelsMissing: (...a) => h.warnIfSelectedEngineModelsMissing(...a),
                    promptTorchCudaMismatchBeforeBatch: (...a) => h.promptTorchCudaMismatchBeforeBatch(...a),
                },
                options: {
                    buildRuntimeOptions: late(h, 'buildRuntimeOptions'),
                    reloadSavedOptionsIntoForm: (...a) => h.reloadSavedOptionsIntoForm(...a),
                    saveParamsSettings: late(h, 'saveParamsSettings'),
                    getSettingsFormDirty: () => (typeof h.getSettingsFormDirty === 'function'
                        ? !!h.getSettingsFormDirty()
                        : !!h.settingsFormDirty),
                    optionOverridesForJob: late(h, 'optionOverridesForJob'),
                    readTranslateModeFromForm: late(h, 'readTranslateModeFromForm'),
                    readTaskFromForm: late(h, 'readTaskFromForm'),
                    getMtUseForm: () => (typeof h.getMtUseForm === 'function'
                        ? h.getMtUseForm()
                        : !!h.mtUseFormState),
                    isMtModelAutoSelected: late(h, 'isMtModelAutoSelected'),
                },
                engine: {
                    refreshEngineStatus: (...a) => h.refreshEngineStatus(...a),
                    refreshInstallStatus: late(h, 'refreshInstallStatus'),
                    refreshEngineModels: (...a) => h.refreshEngineModels(...a),
                    ensureEngineModelsCatalog: (...a) => h.ensureEngineModelsCatalog(...a),
                    refreshEngineGpuStatus: (...a) => h.refreshEngineGpuStatus(...a),
                    refreshEtaRateFromHistory: (...a) => h.refreshEtaRateFromHistory(...a),
                    downloadEngineModels: (...a) => h.downloadEngineModels(...a),
                    resolveExpectedOpusMtModelIds: (...a) => h.resolveExpectedOpusMtModelIds(...a),
                    getCachedEngineModels: () => (typeof h.getCachedEngineModels === 'function'
                        ? h.getCachedEngineModels()
                        : h.cachedEngineModels),
                    getCachedModelItems: () => (typeof h.getCachedModelItems === 'function'
                        ? h.getCachedModelItems()
                        : h.cachedModelItems),
                    getCachedGpuRuntimeProbe: () => (typeof h.getCachedGpuRuntimeProbe === 'function'
                        ? h.getCachedGpuRuntimeProbe()
                        : h.cachedGpuRuntimeProbe),
                    modelApi: h.modelApi || (global && global.TransubModelSelect) || {},
                    getContentProfileApi: () => (global && global.TransubContentProfile) || null,
                },
                ui: {
                    appendLog: late(h, 'appendLog'),
                    showToast: late(h, 'showToast'),
                    uiTf: late(h, 'uiTf'),
                    basename: late(h, 'basename'),
                    setBadge: late(h, 'setBadge'),
                    updateStartButton: late(h, 'updateStartButton'),
                    renderList: late(h, 'renderList'),
                    openAppSettings: late(h, 'openAppSettings'),
                    dismissLoadingOverlay: (...a) => h.dismissLoadingOverlay(...a),
                    setLoading: late(h, 'setLoading'),
                    ensureLogExpanded: late(h, 'ensureLogExpanded'),
                    appConfirmChoice: late(h, 'appConfirmChoice'),
                    ensureJobRuntimeScripts: late(h, 'ensureJobRuntimeScripts'),
                    resetExternalImportIdle: late(h, 'resetExternalImportIdle'),
                },
            }),
        );

        h.startSubtitleGeneration = async function startSubtitleGeneration() {
            const r = h.getBatchStartRunner();
            if (!r) {
                if (typeof h.appendLog === 'function') h.appendLog('开始生成核心未加载（batch-start-runner）', 'err');
                return;
            }
            return r.startSubtitleGeneration();
        };

        h.flushPendingQueue = async function flushPendingQueue() {
            const state = h.state || {};
            if (state.running || state.postBatchBusy || !state.pendingQueue?.length) return;
            const queued = state.pendingQueue.splice(0);
            if (typeof h.updateQueueBadge === 'function') h.updateQueueBadge();
            if (typeof h.appendLog === 'function') {
                h.appendLog(`正在处理队列中的 ${queued.length} 个文件…`, 'info');
            }
            if (typeof h.addFiles === 'function') await h.addFiles(queued);
            const selectable = typeof h.getSelectedItems === 'function' ? h.getSelectedItems() : [];
            if (selectable.length && !state.running) {
                const yes = typeof h.appConfirm === 'function'
                    ? await h.appConfirm({
                        title: '继续处理队列',
                        message: (typeof h.uiTf === 'function'
                            ? h.uiTf('队列中有 {count} 个视频已就绪，是否立即开始生成字幕？', { count: selectable.length })
                            : `队列中有 ${selectable.length} 个视频已就绪，是否立即开始生成字幕？`),
                        primaryLabel: '立即开始',
                        secondaryLabel: '稍后再说',
                    })
                    : false;
                if (yes) await h.startSubtitleGeneration();
                else if (typeof h.appendLog === 'function') {
                    h.appendLog('已加入列表，可在准备好后点击「开始生成」', 'info');
                }
            }
        };

        h.appendItemsToLiveBatch = async function appendItemsToLiveBatch(items) {
            const liveBatchQueueApi = h.liveBatchQueueApi
                || (global && global.TransubLiveBatchQueue)
                || {};
            const optionOverridesForJob = typeof h.optionOverridesForJob === 'function'
                ? h.optionOverridesForJob
                : () => ({});
            const build = liveBatchQueueApi.buildAppendPayloadItems;
            const payloadItems = typeof build === 'function'
                ? build(items, optionOverridesForJob)
                : (Array.isArray(items) ? items : []).map((item) => ({
                    fullPath: item.path,
                    durationSec: Math.max(0, Number(item.duration) || 0),
                    optionOverrides: optionOverridesForJob(item),
                }));
            if (!payloadItems.length) return;
            try {
                const res = await h.electron?.transubLiveBatchAppend?.({ items: payloadItems });
                if (res?.ok) {
                    const n = Array.isArray(res.appended) ? res.appended.length : payloadItems.length;
                    if (n > 0) {
                        if (Number(res.total) > 0) h.state.total = Number(res.total);
                        if (typeof h.updateProgressUi === 'function') h.updateProgressUi();
                        if (typeof h.appendLog === 'function') {
                            h.appendLog(`已加入当前批次 ${n} 个文件`, 'info');
                        }
                    }
                    return;
                }
                if (res?.code === 'no_batch') {
                    if (typeof h.appendLog === 'function') {
                        h.appendLog(`已加入列表 ${payloadItems.length} 个文件（当前批次已结束，可再次开始）`, 'info');
                    }
                    return;
                }
                if (typeof h.appendLog === 'function') {
                    h.appendLog(
                        `已加入列表，但未能并入当前批次：${res?.error || '未知错误'}`,
                        'warn',
                    );
                }
            } catch (err) {
                if (typeof h.appendLog === 'function') {
                    h.appendLog(`已加入列表，并入当前批次失败：${err?.message || err}`, 'warn');
                }
            }
        };

        return h;
    }

    return { install, BATCH_JOB_PROGRESS_METHODS, POST_BATCH_RUNNER_METHODS };
}));
