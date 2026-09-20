/**
 * Batch start orchestration (preflight → model gates → generate IPC).
 * Shell injects DOM/IPC/state via createBatchStartRunner(deps).
 * Nested bags (gates / options / engine / ui) keep the dep list scannable.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubBatchStartRunner = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function batchStartRunnerFactory() {
    /**
     * @param {object} deps shell adapters (flat keys and/or nested bags)
     */
    function createBatchStartRunner(deps) {
        const d = deps || {};
        const state = d.state;
        const els = d.els;
        const electron = d.electron;
        const gates = d.gates || {};
        const optionsBag = d.options || {};
        const engine = d.engine || {};
        const ui = d.ui || {};

        const appendLog = ui.appendLog || d.appendLog || (() => {});
        const showToast = ui.showToast || d.showToast || (() => {});
        const uiTf = ui.uiTf || d.uiTf || ((s) => s);
        const basename = ui.basename || d.basename || ((p) => String(p || '').split(/[/\\]/).pop() || '');
        const setBadge = ui.setBadge || d.setBadge || (() => {});
        const updateStartButton = ui.updateStartButton || d.updateStartButton || (() => {});
        const renderList = ui.renderList || d.renderList || (() => {});
        const openAppSettings = ui.openAppSettings || d.openAppSettings || (() => {});
        const dismissLoadingOverlay = ui.dismissLoadingOverlay || d.dismissLoadingOverlay || (() => {});
        const setLoading = ui.setLoading || d.setLoading || (() => {});
        const ensureLogExpanded = ui.ensureLogExpanded || d.ensureLogExpanded || (() => {});
        const appConfirmChoice = ui.appConfirmChoice || d.appConfirmChoice || (async () => 'secondary');
        const ensureJobRuntimeScripts = ui.ensureJobRuntimeScripts || d.ensureJobRuntimeScripts || (async () => {});
        const resetExternalImportIdle = ui.resetExternalImportIdle || d.resetExternalImportIdle || (() => {});

        function markBatchStartInFlight() {
            if (state) state.batchStartInFlight = true;
            updateStartButton();
        }

        function clearBatchStartInFlightUi() {
            if (state) state.batchStartInFlight = false;
            dismissLoadingOverlay();
            updateStartButton();
        }

        async function withEngineStartingOverlay(run) {
            setLoading(true, uiTf('引擎启动中…'));
            try {
                return await run();
            } finally {
                setLoading(false);
            }
        }

        const computeStartBlockReason = gates.computeStartBlockReason || d.computeStartBlockReason || (() => null);
        const clearStaleComputeBusyIfNeeded = gates.clearStaleComputeBusyIfNeeded
            || d.clearStaleComputeBusyIfNeeded
            || (async () => ({ cleared: false }));
        const syncComputeBusyFromMain = gates.syncComputeBusyFromMain || d.syncComputeBusyFromMain || (async () => {});
        const getSelectedItems = gates.getSelectedItems || d.getSelectedItems || (() => []);
        const ensureMtSelectionValidBeforeStart = gates.ensureMtSelectionValidBeforeStart
            || d.ensureMtSelectionValidBeforeStart
            || (async () => true);
        const ensureSmartTranslateReadinessBeforeStart = gates.ensureSmartTranslateReadinessBeforeStart
            || d.ensureSmartTranslateReadinessBeforeStart
            || (async () => true);
        const warnIfSelectedEngineModelsMissing = gates.warnIfSelectedEngineModelsMissing
            || d.warnIfSelectedEngineModelsMissing
            || (() => '');
        const promptTorchCudaMismatchBeforeBatch = gates.promptTorchCudaMismatchBeforeBatch
            || d.promptTorchCudaMismatchBeforeBatch
            || (async () => true);

        const buildRuntimeOptions = optionsBag.buildRuntimeOptions || d.buildRuntimeOptions || (() => ({}));
        const reloadSavedOptionsIntoForm = optionsBag.reloadSavedOptionsIntoForm
            || d.reloadSavedOptionsIntoForm
            || (async () => null);
        const saveParamsSettings = optionsBag.saveParamsSettings || d.saveParamsSettings || (async () => {});
        const getSettingsFormDirty = optionsBag.getSettingsFormDirty
            || d.getSettingsFormDirty
            || (() => false);
        const optionOverridesForJob = optionsBag.optionOverridesForJob || d.optionOverridesForJob || (() => undefined);
        const readTranslateModeFromForm = optionsBag.readTranslateModeFromForm
            || d.readTranslateModeFromForm
            || (() => 'normal');
        const readTaskFromForm = optionsBag.readTaskFromForm || d.readTaskFromForm || (() => 'translate');
        const getMtUseForm = optionsBag.getMtUseForm || d.getMtUseForm || (() => false);
        const isMtModelAutoSelected = optionsBag.isMtModelAutoSelected || d.isMtModelAutoSelected || (() => false);

        const refreshEngineStatus = engine.refreshEngineStatus || d.refreshEngineStatus || (async () => ({ ok: false }));
        const refreshInstallStatus = engine.refreshInstallStatus || d.refreshInstallStatus || (async () => ({ ok: false }));
        const refreshEngineModels = engine.refreshEngineModels || d.refreshEngineModels || (async () => {});
        const refreshEngineGpuStatus = engine.refreshEngineGpuStatus || d.refreshEngineGpuStatus || (async () => {});
        const refreshEtaRateFromHistory = engine.refreshEtaRateFromHistory || d.refreshEtaRateFromHistory || (async () => {});
        const downloadEngineModels = engine.downloadEngineModels || d.downloadEngineModels || (async () => {});
        const resolveExpectedOpusMtModelIds = engine.resolveExpectedOpusMtModelIds
            || d.resolveExpectedOpusMtModelIds
            || (() => []);
        const getCachedEngineModels = engine.getCachedEngineModels || d.getCachedEngineModels || (() => []);
        const ensureEngineModelsCatalog = engine.ensureEngineModelsCatalog
            || d.ensureEngineModelsCatalog
            || (async (opts = {}) => {
                if (opts.force) return refreshEngineModels({ silent: opts.silent !== false });
                const cached = getCachedEngineModels() || [];
                const required = Array.isArray(opts.requiredModelIds) ? opts.requiredModelIds : [];
                if (cached.length) {
                    if (!required.length) {
                        return { ok: true, fromCache: true, models: cached };
                    }
                    const ids = new Set(cached.map((m) => String(m?.id || '').trim()).filter(Boolean));
                    if (required.every((id) => ids.has(String(id || '').trim()))) {
                        return { ok: true, fromCache: true, models: cached };
                    }
                }
                return refreshEngineModels({ silent: opts.silent !== false });
            });
        const getCachedModelItems = engine.getCachedModelItems || d.getCachedModelItems || (() => []);
        const getCachedGpuRuntimeProbe = engine.getCachedGpuRuntimeProbe || d.getCachedGpuRuntimeProbe || (() => null);
        const modelApi = engine.modelApi || d.modelApi || null;
        const getContentProfileApi = engine.getContentProfileApi
            || d.getContentProfileApi
            || (() => (typeof globalThis !== 'undefined' ? globalThis.TransubContentProfile : null));

        async function startSubtitleGeneration() {
            await ensureJobRuntimeScripts();
            dismissLoadingOverlay();
            if (state) state.externalImportIdlePending = false;
            resetExternalImportIdle();
            try {
                // Phantom compute locks (e.g. aborted editor range) disable Start with no click feedback.
                if (state?.computeBusy && !state.running && !state.postBatchBusy && !state.retranslateBusy) {
                    const cleared = await clearStaleComputeBusyIfNeeded();
                    if (cleared.cleared) {
                        const msg = cleared.before?.label
                            ? `已清除卡住的算力锁（${cleared.before.label}）`
                            : '已清除卡住的算力锁';
                        appendLog(msg, 'warn');
                        showToast(msg, 'warn');
                    }
                } else if (state?.computeBusy) {
                    await syncComputeBusyFromMain();
                    updateStartButton();
                }

                const blockReason = computeStartBlockReason();
                if (blockReason) {
                    appendLog(blockReason, 'warn');
                    showToast(blockReason, 'warn');
                    updateStartButton();
                    return;
                }

                const selected = getSelectedItems();
                if (!selected.length) {
                    appendLog('请至少选择一个有效视频', 'warn');
                    showToast('请至少选择一个有效视频', 'warn');
                    return;
                }

                // Failed / cancelled rows stay selected — normalize so the batch path treats them as ready.
                selected.forEach((item) => {
                    if (item.status === 'failed' || item.status === 'cancelled' || item.status === 'error') {
                        item.status = 'ready';
                        item.progress = 0;
                        item.detail = '';
                        item.error = '';
                        item.recovery = null;
                    }
                });
                renderList();
                markBatchStartInFlight();

                if (getSettingsFormDirty()) {
                    const choice = await appConfirmChoice({
                        title: '设置未保存',
                        message: '设置有未保存的修改。开始任务前如何处理？',
                        primaryLabel: '保存并开始',
                        secondaryLabel: '取消',
                        tertiaryLabel: '不保存并开始',
                    });
                    if (choice === 'secondary') {
                        clearBatchStartInFlightUi();
                        return;
                    }
                    if (choice === 'primary') {
                        await saveParamsSettings({ closeAfter: false });
                        if (getSettingsFormDirty()) {
                            appendLog('设置保存失败，已中止任务', 'err');
                            clearBatchStartInFlightUi();
                            return;
                        }
                    }
                } else {
                    await reloadSavedOptionsIntoForm();
                }
                const optsPreview = buildRuntimeOptions();
                const useEnginePreview = (optsPreview.engineBackend || 'transub') !== 'twai';
                const validate = useEnginePreview
                    ? await withEngineStartingOverlay(() => refreshEngineStatus())
                    : await refreshInstallStatus();
                if (!validate?.ok) {
                    appendLog(
                        validate?.error || (useEnginePreview ? 'Transub Engine 未就绪' : 'TransWithAI 未就绪'),
                        'err',
                    );
                    setBadge('未就绪', 'error');
                    openAppSettings('install');
                    clearBatchStartInFlightUi();
                    return;
                }

                await refreshEtaRateFromHistory();
                // Re-read after validate in case install/engine probe updated options on disk.
                if (!getSettingsFormDirty()) {
                    await reloadSavedOptionsIntoForm();
                }
                let opts = buildRuntimeOptions();
                const useEngine = (opts.engineBackend || 'transub') !== 'twai';

                state.lastContentProfile = null;

                if (!useEngine && modelApi) {
                    const gate = modelApi.validateModelsForTask(opts, getCachedModelItems(), opts.task);
                    if (!gate.ok) {
                        appendLog(gate.error || '模型配置无效', 'err');
                        setBadge('模型未就绪', 'error');
                        openAppSettings('install');
                        clearBatchStartInFlightUi();
                        return;
                    }
                    (gate.warnings || []).forEach((w) => appendLog(w, 'warn'));
                    if (gate.options) {
                        opts.transcribeModelPath = gate.options.transcribeModelPath;
                        opts.translateModelPath = gate.options.translateModelPath;
                        opts.modelPath = gate.options.modelPath;
                    }
                }

                const cachedEngineModels = getCachedEngineModels() || [];
                if (useEngine) {
                    const allSkipAsr = selected.every((i) => !!(
                        i?.skipAsr || i?.shelfEntryStage || i?.shelfOptionOverrides?.skipAsr
                    ));
                    const asrId = allSkipAsr ? '' : (els?.engineAsrModelSelect?.value || '');
                    const vadId = els?.engineVadModelSelect?.value || '';
                    const llmId = els?.engineLlmMtModelSelect?.value || '';
                    const mtIds = resolveExpectedOpusMtModelIds();
                    const requiredModelIds = [asrId, vadId, llmId, ...mtIds].filter(Boolean);
                    await ensureEngineModelsCatalog({
                        silent: true,
                        requiredModelIds,
                    });
                    const mtOk = await ensureMtSelectionValidBeforeStart();
                    if (!mtOk) {
                        setBadge('需调整翻译模型', 'warn');
                        clearBatchStartInFlightUi();
                        return;
                    }
                    const smartReadyOk = await ensureSmartTranslateReadinessBeforeStart();
                    if (!smartReadyOk) {
                        setBadge('智能翻译未就绪', 'warn');
                        clearBatchStartInFlightUi();
                        return;
                    }
                    // Rebuild opts after possible model / hybrid fix
                    opts = buildRuntimeOptions();
                    const miss = warnIfSelectedEngineModelsMissing();
                    if (miss) {
                        const choice = await appConfirmChoice({
                            title: '模型未安装',
                            message: uiTf('{miss}\n\n是否现在下载缺失模型？', { miss }),
                            primaryLabel: '去下载',
                            secondaryLabel: '取消',
                        });
                        if (choice === 'primary') {
                            const asrNeedsFsmn = !allSkipAsr && (!asrId || !String(asrId).includes('whisper'));
                            let downloadMtIds = mtIds;
                            if (!downloadMtIds.length) {
                                // Opus removed — prefer Sakura GGUF when ASR/VAD missing prompt opens library
                                downloadMtIds = [];
                            }
                            const modelsNow = getCachedEngineModels() || [];
                            const ids = [
                                asrId,
                                ...downloadMtIds,
                                asrNeedsFsmn ? 'fsmn-vad' : '',
                            ]
                                .filter(Boolean)
                                .filter((id) => {
                                    const row = modelsNow.find((m) => m.id === id);
                                    return !row || !row.installed;
                                });
                            if (ids.length) {
                                void downloadEngineModels({ modelIds: ids, force: false });
                            } else {
                                openAppSettings('models', { openLibrary: true });
                            }
                            setBadge('待安装', 'warn');
                            appendLog('已打开模型下载；完成后请再次开始生成', 'info');
                            clearBatchStartInFlightUi();
                            return;
                        }
                        appendLog(miss, 'err');
                        setBadge('模型未安装', 'error');
                        clearBatchStartInFlightUi();
                        return;
                    }
                } else if (useEngine && allSenseCovered && !cachedEngineModels.length) {
                    await ensureEngineModelsCatalog({ silent: true });
                }

                if (useEngine) {
                    const asrForTorch = els?.engineAsrModelSelect?.value || opts.engineAsrModel || '';
                    if (!getCachedGpuRuntimeProbe()) {
                        await refreshEngineGpuStatus({ silent: true });
                    }
                    const canStart = await promptTorchCudaMismatchBeforeBatch(asrForTorch);
                    if (!canStart) {
                        clearBatchStartInFlightUi();
                        return;
                    }
                }

                appendLog(`开始生成字幕 ${selected.length} 个文件…`, 'info');
                ensureLogExpanded();
                if (opts.task === 'dual' && !useEngine) {
                    appendLog(
                        `双语模型：转写=${opts.transcribeModelPath || '默认'} · 翻译=${opts.translateModelPath || '默认'}`,
                        'info',
                    );
                }
                if (useEngine) {
                    appendLog(
                        `引擎后端：Transub Engine · ASR=${opts.engineAsrModel || 'sensevoice-small'} · 档位=${opts.engineProfile || 'balanced'}`,
                        'info',
                    );
                    appendLog('正在提交引擎任务（首次加载模型可能需数分钟）…', 'info');
                }
                const generateApi = useEngine
                    ? electron?.transubEngineGenerateSubtitles
                    : electron?.transWithAiGenerateSubtitles;
                if (!generateApi) {
                    setBadge('失败', 'error');
                    appendLog('当前环境不支持字幕生成接口', 'err');
                    clearBatchStartInFlightUi();
                    return;
                }
                // Cover ensureEngineRunning before job-start IPC (cold start can take seconds).
                if (useEngine) {
                    setLoading(true, uiTf('引擎启动中…'));
                }
                try {
                    const res = await generateApi({
                        items: selected.map((i) => ({
                            fullPath: i.path,
                            durationSec: i.duration || 0,
                            optionOverrides: optionOverridesForJob(i),
                        })),
                        options: opts,
                        minimizeToTray: !!opts.minimizeToTrayOnStart,
                    });
                    // Shelf translate snapshotted skipAsr into optionOverrides — clear so a later
                    // full Start on the same row does not silently skip ASR.
                    selected.forEach((i) => {
                        if (!i || (!i.skipAsr && !i.shelfOptionOverrides && !i.shelfEntryStage)) return;
                        delete i.shelfOptionOverrides;
                        delete i.skipAsr;
                        delete i.shelfEntryStage;
                        delete i.shelfSourceSlot;
                    });
                    if (!res?.ok) {
                        // Cancel / normal finish already handled by onJobFinished — do not clobber UI.
                        if (res?.cancelled) return;
                        if (res && ('generated' in res || 'failed' in res || 'skipped' in res)) return;
                        const errMsg = res?.error || '字幕生成失败';
                        appendLog(errMsg, 'err');
                        if (!state.running) {
                            setBadge('失败', 'error');
                            clearBatchStartInFlightUi();
                        }
                    }
                } catch (err) {
                    appendLog(err?.message || '字幕生成失败', 'err');
                    if (!state.running) {
                        setBadge('失败', 'error');
                        clearBatchStartInFlightUi();
                    }
                } finally {
                    // Job-start already dismissed when running; otherwise clear stuck prep overlay.
                    if (!state?.running) {
                        dismissLoadingOverlay();
                        if (state?.batchStartInFlight) clearBatchStartInFlightUi();
                    }
                }
            } catch (err) {
                const msg = err?.message || String(err) || '开始执行失败';
                appendLog(msg, 'err');
                showToast(msg, 'err');
                clearBatchStartInFlightUi();
            }
        }

        return { startSubtitleGeneration };
    }

    return { createBatchStartRunner };
}));
