/**
 * Engine models workspace: refresh / GPU·torch / download / delete orchestration.
 * Library modal open/close & panel mount live in engine-models-library-ui-core; inject via createEngineModelsWorkspace(deps).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubEngineModelsWorkspace = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function engineModelsWorkspaceFactory() {
    function createEngineModelsWorkspace(deps) {
        const d = deps || {};
        const electron = d.electron;
        const els = d.els;
        const engineModelsUi = d.engineModelsUi || {};
        const manualDownloadApi = d.manualDownloadApi || {};
        const gpuTorchApi = d.gpuTorchApi || {};
        const getAdvancedEntitled = typeof d.getAdvancedEntitled === 'function'
            ? d.getAdvancedEntitled
            : () => !!d.advancedEntitled;
        const getCachedEngineModels = d.getCachedEngineModels || (() => []);
        const setCachedEngineModels = d.setCachedEngineModels || (() => {});
        const getCachedHardwareRecommend = d.getCachedHardwareRecommend || (() => null);
        const setCachedHardwareRecommend = d.setCachedHardwareRecommend || (() => {});
        const appendLog = d.appendLog || (() => {});
        const appendEngineDownloadLog = d.appendEngineDownloadLog || appendLog;
        const uiTf = d.uiTf || ((s) => s);
        const showToast = d.showToast || (() => {});
        const appConfirm = d.appConfirm || (async () => false);
        const appConfirmChoice = d.appConfirmChoice || appConfirm;
        const setBadge = d.setBadge || (() => {});
        const openAppSettings = d.openAppSettings || (() => {});
        const engineFormPayload = d.engineFormPayload || (() => ({}));
        const formatEngineDownloadError = d.formatEngineDownloadError || ((e) => String(e || ''));
        const setEngineStatusText = d.setEngineStatusText || (() => {});
        const setEngineDownloadBusy = d.setEngineDownloadBusy || (() => {});
        const setEngineDownloadProgressPct = d.setEngineDownloadProgressPct || (() => {});
        const envOverviewApi = () => (
            (typeof globalThis !== 'undefined' && globalThis.TransubSettingsModalUi)
            || (typeof window !== 'undefined' && window.TransubSettingsModalUi)
            || {}
        );
        let lastEngineReadyForGpu = false;
        /** @type {object|null} */
        let cachedGpuRuntimeProbe = null;
        const setEngineDownloadProgressVisible = d.setEngineDownloadProgressVisible || (() => {});
        const clearEngineDownloadLog = d.clearEngineDownloadLog || (() => {});
        const resetAppEngineDlProgressLog = d.resetAppEngineDlProgressLog || (() => {});
        const markEngineModelsCacheFresh = d.markEngineModelsCacheFresh || (() => {});
        const setEngineModelsBrowseOnly = d.setEngineModelsBrowseOnly || (() => {});
        const hasEngineModelsCacheInMemory = d.hasEngineModelsCacheInMemory || (() => false);
        const ensureEngineModelsCacheApplied = d.ensureEngineModelsCacheApplied || (() => {});
        const loadEngineModelsCacheFromDisk = d.loadEngineModelsCacheFromDisk || (async () => {});
        const schedulePersistEngineModelsCache = d.schedulePersistEngineModelsCache || (() => {});
        const setCachedManagedCatalogSnapshot = d.setCachedManagedCatalogSnapshot || (() => {});
        const syncEngineModelsCacheBanner = d.syncEngineModelsCacheBanner || (() => {});
        const syncEngineModelsLibraryDlStrip = d.syncEngineModelsLibraryDlStrip || (() => {});
        const syncEngineModelsLibraryTabSummary = d.syncEngineModelsLibraryTabSummary || (() => {});
        const resolveEngineModelsBrowseOnly = d.resolveEngineModelsBrowseOnly || (() => false);
        const explainEngineModelsMutateBlocked = d.explainEngineModelsMutateBlocked || (() => '');
        const isEngineModelsLibraryOpen = d.isEngineModelsLibraryOpen || (() => false);
        const renderEngineModelsList = d.renderEngineModelsList || (() => {});
        const renderEngineModelsCards = d.renderEngineModelsCards || (() => {});
        const fillEngineModelSelect = d.fillEngineModelSelect || (() => {});
        const syncExpertExtraChipsUi = d.syncExpertExtraChipsUi || (() => {});
        const syncExpertQuickModelSelects = d.syncExpertQuickModelSelects || (() => {});
        const syncMtModelChipUi = d.syncMtModelChipUi || (() => {});
        const syncSmartTranslateReadinessUi = d.syncSmartTranslateReadinessUi || (() => {});
        const syncTranslateChipUi = d.syncTranslateChipUi || (() => {});
        const rebuildTranslateMenuMtSection = d.rebuildTranslateMenuMtSection || (() => {});
        const setCachedSmartTranslatePick = d.setCachedSmartTranslatePick || (() => {});
        const updateAsrRecommendChip = d.updateAsrRecommendChip || (() => {});
        const updateEnvBanner = d.updateEnvBanner || (() => {});
        const updateReadinessStrip = d.updateReadinessStrip || (() => {});
        const readLlmMtModelFromForm = d.readLlmMtModelFromForm || (() => '');
        const readOpusMtModelFromForm = d.readOpusMtModelFromForm || (() => '');
        const buildIntlAwareLlmMtFilter = d.buildIntlAwareLlmMtFilter || (() => null);
        const buildIntlAwareLlmMtDisableReason = d.buildIntlAwareLlmMtDisableReason || (() => null);
        const isLlmInferencePickModelId = d.isLlmInferencePickModelId || (() => false);
        const isSakuraMtModelId = d.isSakuraMtModelId || (() => false);
        const getManagedLlmCatalogApi = d.getManagedLlmCatalogApi || (() => null);
        const buildManagedLlmPickItems = d.buildManagedLlmPickItems || (() => []);
        const mergeManagedInstalledIntoEngineModels = d.mergeManagedInstalledIntoEngineModels || ((x) => x);
        const mergeDemucsPickItem = d.mergeDemucsPickItem || ((x) => x);
        const findManagedLlmCatalogEntry = d.findManagedLlmCatalogEntry || (() => null);
        const buildDeleteModelConfirmCopy = d.buildDeleteModelConfirmCopy || (() => ({ title: '删除', message: '' }));
        const explainDeleteBlockedForPickItem = d.explainDeleteBlockedForPickItem || (() => '');
        const isDemucsFullyReady = d.isDemucsFullyReady || (() => false);
        const isDemucsRuntimeUsable = d.isDemucsRuntimeUsable || (() => false);

        const ENGINE_DEMUCS_MODEL_ID = d.ENGINE_DEMUCS_MODEL_ID || d.demucsModelId || 'demucs';
        const getEngineModelsBusy = typeof d.getEngineModelsBusy === 'function'
            ? d.getEngineModelsBusy
            : () => false;
        const getEngineModelsBusyKind = typeof d.getEngineModelsBusyKind === 'function'
            ? d.getEngineModelsBusyKind
            : () => null;
        const setEngineModelsBusyKind = typeof d.setEngineModelsBusyKind === 'function'
            ? d.setEngineModelsBusyKind
            : (() => {});
        const getEngineModelsBrowseOnly = typeof d.getEngineModelsBrowseOnly === 'function'
            ? d.getEngineModelsBrowseOnly
            : () => false;
        const getCachedEnginePickCatalog = typeof d.getCachedEnginePickCatalog === 'function'
            ? d.getCachedEnginePickCatalog
            : () => [];
        const setCachedEnginePickCatalog = typeof d.setCachedEnginePickCatalog === 'function'
            ? d.setCachedEnginePickCatalog
            : (() => {});
        const setEngineDownloadActiveSource = typeof d.setEngineDownloadActiveSource === 'function'
            ? d.setEngineDownloadActiveSource
            : (() => {});
        const getCachedDemucsProbe = typeof d.getCachedDemucsProbe === 'function'
            ? d.getCachedDemucsProbe
            : () => null;
        const setCachedDemucsProbe = typeof d.setCachedDemucsProbe === 'function'
            ? d.setCachedDemucsProbe
            : (() => {});

async function refreshEngineModels({ silent = false } = {}) {
    if (!electron?.transubEngineListModels && !electron?.transubEngineDownloadInfo) {
        renderEngineModelsList([]);
        if (!silent) setEngineStatusText('当前环境不支持引擎模型列表', 'warn');
        return { ok: false, error: 'unsupported' };
    }
    if (await resolveEngineModelsBrowseOnly()) {
        await ensureEngineModelsCacheApplied();
        setEngineModelsBrowseOnly(true);
        if (els.engineModelsSummary) {
            els.engineModelsSummary.textContent = hasEngineModelsCacheInMemory()
                ? '任务进行中，显示缓存列表'
                : '任务进行中，暂无缓存列表';
        }
        syncEngineModelsLibraryTabSummary();
        if (!silent) {
            setEngineStatusText(explainEngineModelsMutateBlocked(), 'warn');
        }
        return {
            ok: true,
            deferred: true,
            fromCache: true,
            code: 'compute_busy',
            models: getCachedEngineModels(),
        };
    }
    setEngineModelsBrowseOnly(false);
    if (els.engineModelsSummary) els.engineModelsSummary.textContent = '刷新中…';
    if (els.engineModelsLibraryTabSummary) {
        els.engineModelsLibraryTabSummary.textContent = '正在刷新模型状态…';
    }
    const prevAsr = els.engineAsrModelSelect?.value || '';
    const prevMt = readOpusMtModelFromForm();
    const prevLlm = readLlmMtModelFromForm();
    const prevVad = els.engineVadModelSelect?.value || '';
    try {
        const payload = engineFormPayload();
        const [listRes, infoRes, managedRes] = await Promise.all([
            electron.transubEngineListModels?.(payload) || Promise.resolve(null),
            electron.transubEngineDownloadInfo?.({
                ...payload,
                kind: 'models',
                profile: els.engineProfileSelect?.value || payload.engineProfile || 'balanced',
                modelIds: [
                    prevAsr,
                    prevMt,
                    prevLlm,
                    prevVad,
                ].filter(Boolean),
                hfEndpoint: els.engineHfEndpointInput?.value.trim() || '',
            }) || Promise.resolve(null),
            electron.transubAdvancedManagedLlmStatus?.() || Promise.resolve(null),
        ]);
        const models = Array.isArray(listRes?.models) ? listRes.models : [];
        const catalog = Array.isArray(infoRes?.info?.catalog) ? infoRes.info.catalog : [];
        const managedCatalogRows = Array.isArray(managedRes?.managed?.catalog)
            ? managedRes.managed.catalog
            : (Array.isArray(managedRes?.catalog) ? managedRes.catalog : null);
        if ((!listRes?.ok && !models.length) && !catalog.length && !managedCatalogRows?.length) {
            setCachedEngineModels([]);
            setCachedDemucsProbe(null);
            renderEngineModelsList([]);
            if (els.engineModelsSummary) {
                els.engineModelsSummary.textContent = listRes?.error || infoRes?.error || '无法获取';
            }
            if (!silent) setEngineStatusText(listRes?.error || infoRes?.error || '无法获取模型列表', 'err');
            return listRes || infoRes || { ok: false, error: 'list failed' };
        }
        setCachedEngineModels(models.length
            ? models
            : catalog.map((c) => ({
                id: c.id,
                name: c.name,
                kind: c.kind,
                installed: !!c.installed,
                incomplete: !!c.incomplete,
                size_hint_mb: 0,
            })));
        // Surface installed managed LLMs in LLM 推理翻译 / 重新翻译 selects.
        // Must OR into existing engine rows (not only push missing ids): engine may
        // list the same GGUF as not installed / kind=llm while managed status is OK.
        const managedAsMt = (managedCatalogRows || buildManagedLlmPickItems())
            .filter((m) => m?.id && !!m.installed)
            .map((m) => ({
                id: m.id,
                name: m.name || m.id,
                kind: 'mt',
                installed: true,
                incomplete: false,
                size_hint_mb: 0,
            }));
        setCachedEngineModels(engineModelsUi.mergeManagedInstalledIntoEngineModels
            ? engineModelsUi.mergeManagedInstalledIntoEngineModels(getCachedEngineModels(), managedAsMt)
            : (() => {
                const list = Array.isArray(getCachedEngineModels()) ? getCachedEngineModels().slice() : [];
                for (const row of managedAsMt) {
                    const hit = list.find((m) => m.id === row.id);
                    if (hit) {
                        hit.installed = true;
                        hit.incomplete = false;
                        if (!hit.kind || hit.kind === 'llm') hit.kind = 'mt';
                    } else {
                        list.push(row);
                    }
                }
                return list;
            })());
        fillEngineModelSelect(els.engineAsrModelSelect, getCachedEngineModels(), 'asr', prevAsr);
        fillEngineModelSelect(els.engineMtModelSelect, getCachedEngineModels(), 'mt', prevMt, {
            allowEmpty: true,
            emptyLabel: '自动匹配（按源语言 · Opus）',
            modelFilter: (m) => !isLlmInferencePickModelId(m.id)
                && !global.TransubSakuraMtCatalog?.isNonTranslateEngineModelId?.(m.id),
        });
        fillEngineModelSelect(els.engineLlmMtModelSelect, getCachedEngineModels(), 'mt', prevLlm, {
            allowEmpty: true,
            emptyLabel: '自动匹配（按语言 / Pro / 硬件）',
            modelFilter: buildIntlAwareLlmMtFilter(),
            modelDisableReason: typeof buildIntlAwareLlmMtDisableReason === 'function'
                ? buildIntlAwareLlmMtDisableReason()
                : undefined,
        });
        fillEngineModelSelect(els.engineVadModelSelect, getCachedEngineModels(), 'vad', prevVad);
        try {
            const hybridSync = typeof globalThis !== 'undefined' ? globalThis.TransubHybridModelPickSync : null;
            hybridSync?.syncMirrorFromPrimary?.({
                primary: els.engineLlmMtModelSelect,
                mirror: els.hybridSentenceMtModelSelect,
            });
        } catch (_) { /* mirror optional */ }
        syncExpertQuickModelSelects();
        syncExpertExtraChipsUi();
        // Demucs probe is best-effort and must not block painting the catalog.
        // Under Smart App Control, a hung prior /v1/runtime/* request can wedge
        // the engine; keep UI responsive and refresh Demucs in the background.
        void (async () => {
            try {
                if (await resolveEngineModelsBrowseOnly()) return;
                const demucsRes = await electron.transubEngineAudioSeparateStatus?.(payload);
                if (demucsRes?.ok) {
                    if (await resolveEngineModelsBrowseOnly()) return;
                    setCachedDemucsProbe(demucsRes);
                    if (getCachedEnginePickCatalog().length) {
                        renderEngineModelsList(
                            catalog.length ? catalog : getCachedEngineModels(),
                            managedCatalogRows,
                        );
                        schedulePersistEngineModelsCache();
                    }
                }
            } catch { /* keep previous probe */ }
        })();
        renderEngineModelsList(catalog.length ? catalog : getCachedEngineModels(), managedCatalogRows);
        markEngineModelsCacheFresh(Date.now());
        if (Array.isArray(managedCatalogRows)) {
            setCachedManagedCatalogSnapshot(managedCatalogRows);
        }
        schedulePersistEngineModelsCache();
        syncEngineModelsCacheBanner();
        syncMtModelChipUi();
        if (managedRes?.managed || managedRes?.ok) {
            const managed = managedRes?.managed || null;
            setCachedSmartTranslatePick({
                catalog: Array.isArray(managed?.catalog) ? managed.catalog : (managedCatalogRows || []),
                smartTranslateModelId: String(managed?.smartTranslateModelId || '').trim(),
                smartTranslateResolvedId: String(
                    managed?.smartTranslateResolvedId
                    || managed?.smartTranslateModel?.id
                    || '',
                ).trim(),
                llmSource: String(managed?.llmSource || managedRes?.status?.llmSource || '').trim(),
            });
        }
        syncSmartTranslateReadinessUi();
        updateReadinessStrip();
        // Subtitle task model menu / chip lists — keep in sync after install/delete without restart.
        try { rebuildTranslateMenuMtSection(); } catch (_) { /* ignore */ }
        try { syncTranslateChipUi(); } catch (_) { /* ignore */ }
        if (!silent && listRes && !listRes.ok && (models.length || catalog.length || managedCatalogRows?.length)) {
            setEngineStatusText(`${listRes?.error || '引擎未就绪'}（已列出可用模型）`, 'warn');
        }
        return listRes || infoRes || { ok: true, models: getCachedEngineModels() };
    } catch (err) {
        // Keep prior memory/disk cache on transient failures — do not wipe.
        if (!hasEngineModelsCacheInMemory()) {
            await ensureEngineModelsCacheApplied();
        }
        const msg = err?.message || String(err);
        if (els.engineModelsSummary) {
            els.engineModelsSummary.textContent = hasEngineModelsCacheInMemory()
                ? '刷新失败（仍显示缓存）'
                : '刷新失败';
        }
        if (!silent) setEngineStatusText(msg, 'err');
        return { ok: false, error: msg, models: getCachedEngineModels() };
    }
}

function setEngineGpuStatusText(text, kind = '') {
    if (!els.engineGpuStatus) return;
    els.engineGpuStatus.textContent = text || '';
    const colors = {
        ok: 'text-xs text-emerald-600',
        warn: 'text-xs text-amber-600',
        err: 'text-xs text-red-600',
        busy: 'text-xs text-sky-600',
    };
    els.engineGpuStatus.className = colors[kind] || 'text-xs text-gray-500';
}

function syncEnvEngineChip(state, label) {
    try {
        envOverviewApi().setEnvOverviewChip?.('engine', { state, label });
    } catch (_) { /* ignore */ }
}

function syncEnvGpuChip(state, label) {
    try {
        envOverviewApi().setEnvOverviewChip?.('gpu', { state, label });
    } catch (_) { /* ignore */ }
}

function syncEnvGpuActionGuards(ready) {
    lastEngineReadyForGpu = !!ready;
    try {
        envOverviewApi().setEnvGpuActionsEnabled?.(!!ready);
    } catch (_) { /* ignore */ }
}

async function ensureEngineReadyForGpuAction(actionLabel) {
    if (lastEngineReadyForGpu) return true;
    const go = await appConfirm({
        title: '请先检测引擎',
        message: uiTf(
            '「{action}」属于显卡运行库组件，需要先在「① Transub引擎」检测通过。\n\n是否现在检测引擎？',
            { action: actionLabel || 'GPU 安装' },
        ),
        primaryLabel: '检测引擎',
        secondaryLabel: '取消',
    });
    if (!go) return false;
    const res = await refreshEngineStatus({ soft: false });
    if (res?.ok) return true;
    setEngineGpuStatusText(res?.error || '引擎未就绪，无法安装 GPU 组件', 'err');
    showToast(res?.error || '引擎未就绪', 'warn');
    return false;
}

function applyGpuRuntimeProbe(probe = {}) {
    cachedGpuRuntimeProbe = probe && typeof probe === 'object' ? probe : null;
    const status = String(probe.status || '').trim();
    const hint = String(probe.hint || '').trim();
    if (!status && !hint) {
        setEngineGpuStatusText('');
        syncEnvGpuChip('busy', '待检测');
        return;
    }
    const needTorch = probe.hasRocm && !probe.hasCuda
        ? !probe.torchRocm
        : (!!probe.torchCudaMismatch
            || (!!probe.needsTorchCuda128 && probe.torchCudaSuitable === false));
    const kind = status === 'ready' && !needTorch
        ? 'ok'
        : (status === 'need_install' || status === 'partial' || status === 'driver_too_old' || needTorch
            ? 'warn'
            : 'busy');
    const gpu = probe.gpuName ? `${probe.gpuName}` : '';
    const cuda = probe.driverCudaVersion ? uiTf('驱动 CUDA {ver}', { ver: probe.driverCudaVersion }) : '';
    const rocm = probe.hasRocm && !probe.hasCuda
        ? (probe.torchRocm ? 'ROCm PyTorch 就绪' : '需 ROCm PyTorch')
        : '';
    const bits = [hint || status, gpu, cuda || rocm].filter(Boolean);
    setEngineGpuStatusText(bits.join(' · '), kind);
    const isReadyChip = !needTorch
        && (status === 'ready' || /^GPU\s*运行库已就绪/.test(hint) || (probe.hasRocm && probe.torchRocm));
    const chipLabel = needTorch
        ? (probe.hasRocm && !probe.hasCuda ? '需补齐 ROCm' : '需补齐 PyTorch')
        : (isReadyChip
            ? (probe.hasRocm && !probe.hasCuda ? 'ROCm已就绪' : 'GPU运行库已就绪')
            : (status === 'need_install' || status === 'partial'
                ? '需安装 GPU 支持'
                : (hint || status || '检测中')));
    syncEnvGpuChip(
        needTorch ? 'warn' : (isReadyChip ? 'ok' : (kind === 'warn' ? 'warn' : 'busy')),
        chipLabel,
    );
    if (els.engineEnsureGpuBtn) {
        const need = status === 'need_install' || status === 'partial';
        els.engineEnsureGpuBtn.classList.toggle('ring-1', need);
        els.engineEnsureGpuBtn.classList.toggle('ring-sky-300', need);
    }
    if (els.engineEnsureTorchCudaBtn) {
        // Keep the action visible (like「下载 GPU 支持」) so users can reinstall;
        // only emphasize when probe says Blackwell torch is missing/wrong.
        const amdRocm = !!(probe.hasRocm && !probe.hasCuda);
        els.engineEnsureTorchCudaBtn.textContent = amdRocm ? '补齐 ROCm PyTorch' : '补齐 CUDA PyTorch';
        els.engineEnsureTorchCudaBtn.title = amdRocm
            ? 'Qwen3-ASR / SenseVoice / Demucs 用的 ROCm PyTorch；必须装进引擎 runtime（系统 pip 无效）'
            : 'Qwen3-ASR / Demucs 用的 PyTorch；RTX 50 系需 cu128 或 cu130';
        els.engineEnsureTorchCudaBtn.classList.toggle('ring-1', needTorch);
        els.engineEnsureTorchCudaBtn.classList.toggle('ring-amber-300', needTorch);
        els.engineEnsureTorchCudaBtn.classList.remove('hidden');
    }
}

function paintSoftGpuStatusPlaceholder() {
    if (cachedGpuRuntimeProbe && (cachedGpuRuntimeProbe.status || cachedGpuRuntimeProbe.hint)) {
        applyGpuRuntimeProbe(cachedGpuRuntimeProbe);
        return;
    }
    setEngineGpuStatusText('待检测（点「检测引擎」刷新 GPU / PyTorch 状态）', 'busy');
    syncEnvGpuChip('busy', '待检测');
    if (els.engineEnsureTorchCudaBtn) {
        els.engineEnsureTorchCudaBtn.classList.remove('hidden');
    }
}

async function ensureEngineTorchCuda({ force = true, silent = false, assumeBusy = false } = {}) {
    const amdRocm = !!(cachedGpuRuntimeProbe?.hasRocm && !cachedGpuRuntimeProbe?.hasCuda);
    const actionLabel = amdRocm ? '补齐 ROCm PyTorch' : '补齐 CUDA PyTorch';
    if (!assumeBusy) {
        const ready = await ensureEngineReadyForGpuAction(actionLabel);
        if (!ready) return { ok: false, error: 'engine_not_ready', cancelled: true };
    }
    if (!electron?.transubEngineRunDownload) {
        if (!silent) {
            appendLog(`当前环境不支持 ${actionLabel} 安装`, 'err');
            setEngineStatusText(`当前环境不支持 ${actionLabel} 安装`, 'err');
        }
        return { ok: false, error: 'unsupported' };
    }
    if (!assumeBusy && getEngineModelsBusy()) return { ok: false, error: 'busy' };
    if (amdRocm) {
        appendLog('开始补齐 ROCm PyTorch（装进引擎运行时）…', 'info');
        setEngineGpuStatusText('正在补齐 ROCm PyTorch…', 'busy');
        setEngineStatusText('正在补齐 ROCm PyTorch…', 'busy');
        if (!assumeBusy) {
            setEngineDownloadBusy(true);
            setEngineDownloadProgressPct(0);
            setEngineDownloadProgressVisible(true, '正在把 ROCm PyTorch 装进引擎运行时…');
            appendEngineDownloadLog('开始补齐 ROCm PyTorch');
        }
        try {
            const res = await electron.transubEngineRunDownload({
                ...engineFormPayload(),
                kind: 'torch-rocm',
                force: !!force,
            });
            if (res?.ok) {
                const okMsg = res.message || 'ROCm PyTorch 已装进引擎运行时';
                if (!silent) {
                    appendLog(okMsg, 'ok');
                    setEngineStatusText(okMsg, 'ok');
                }
                await refreshEngineGpuStatus({ silent: true });
                return { ok: true, message: okMsg, ...(res || {}) };
            }
            const err = formatEngineDownloadError(res?.error || res?.message || 'ROCm PyTorch 安装失败');
            if (!silent) {
                appendLog(err, 'err');
                setEngineStatusText(err, 'err');
            }
            return res || { ok: false, error: err };
        } catch (err) {
            const msg = formatEngineDownloadError(err?.message || String(err));
            if (!silent) {
                appendLog(msg, 'err');
                setEngineStatusText(msg, 'err');
            }
            return { ok: false, error: msg };
        } finally {
            if (!assumeBusy) setEngineDownloadBusy(false);
        }
    }
    const variant = String(
        cachedGpuRuntimeProbe?.torchCudaVariant
        || engineFormPayload()?.torchCudaVariant
        || 'cu128/cu130',
    ).trim();
    appendLog(`开始补齐 CUDA PyTorch（${variant}）…`, 'info');
    setEngineGpuStatusText(uiTf('正在补齐 CUDA PyTorch（{variant}）…', { variant }), 'busy');
    setEngineStatusText(uiTf('正在补齐 CUDA PyTorch（{variant}）…', { variant }), 'busy');
    if (!assumeBusy) {
        setEngineDownloadBusy(true);
        setEngineDownloadProgressPct(0);
        setEngineDownloadProgressVisible(true, uiTf('正在补齐 CUDA PyTorch（{variant}，约 2.5GB）…', { variant }));
        appendEngineDownloadLog(`开始补齐 CUDA PyTorch（${variant}）`);
    }
    try {
        const res = await electron.transubEngineRunDownload({
            ...engineFormPayload(),
            kind: 'demucs',
            force: !!force,
        });
        if (res?.ok && !res?.partial) {
            const msg = res.message || `CUDA PyTorch（${variant}）安装完成`;
            setEngineDownloadProgressPct(100);
            setEngineDownloadProgressVisible(true, msg);
            appendEngineDownloadLog(msg);
            if (!silent) {
                appendLog(msg, 'ok');
                setEngineStatusText(msg, 'ok');
            }
            await refreshEngineGpuStatus({ silent: true });
            return res;
        }
        if (res?.ok && res?.partial) {
            const msg = res.message || 'Demucs 已可用，CUDA PyTorch 未完全就绪';
            if (!silent) {
                appendLog(msg, 'warn');
                setEngineStatusText(msg, 'warn');
            }
            await refreshEngineGpuStatus({ silent: true });
            return res;
        }
        if (res?.cancelled) {
            const msg = res.error || '已取消安装';
            if (!silent) {
                appendLog(msg, 'warn');
                setEngineStatusText(msg, 'warn');
            }
            return res;
        }
        const err = formatEngineDownloadError(res?.error || res?.message || 'CUDA PyTorch 安装失败');
        if (!silent) {
            appendLog(err, 'err');
            setEngineStatusText(err, 'err');
        }
        if (!silent && !res?.cancelled) {
            if (!assumeBusy) setEngineDownloadBusy(false);
            const manual = await global.TransubManualWhlInstall?.offerAfterFailure?.({
                kind: 'torch-cuda',
                errorText: err,
                formPayload: engineFormPayload(),
            });
            if (manual?.ok) {
                const okMsg = manual.message || 'CUDA PyTorch 本地安装完成';
                appendLog(okMsg, 'ok');
                setEngineStatusText(okMsg, 'ok');
                await refreshEngineGpuStatus({ silent: true });
                return { ok: true, message: okMsg, manual: true, ...(manual || {}) };
            }
        }
        return res || { ok: false, error: err };
    } catch (err) {
        const msg = formatEngineDownloadError(err?.message || String(err));
        if (!silent) {
            appendLog(msg, 'err');
            setEngineStatusText(msg, 'err');
        }
        return { ok: false, error: msg };
    } finally {
        if (!assumeBusy) setEngineDownloadBusy(false);
    }
}

async function promptTorchCudaMismatchBeforeBatch(asrModelId) {
    if (!gpuTorchApi.shouldBlockBatchOnTorchMismatch?.(cachedGpuRuntimeProbe, asrModelId)) {
        return true;
    }
    if (!cachedGpuRuntimeProbe) {
        await refreshEngineGpuStatus({ silent: true });
    }
    if (!gpuTorchApi.shouldBlockBatchOnTorchMismatch?.(cachedGpuRuntimeProbe, asrModelId)) {
        return true;
    }
    const amdRocm = !!gpuTorchApi.needsTorchRocmForAsr?.(cachedGpuRuntimeProbe, asrModelId);
    const message = amdRocm
        ? (gpuTorchApi.buildTorchRocmMessage?.(cachedGpuRuntimeProbe, asrModelId)
            || '本机 AMD GPU 需要引擎内 ROCm PyTorch 才能 GPU 转写。')
        : (gpuTorchApi.buildTorchMismatchMessage?.(cachedGpuRuntimeProbe, asrModelId)
            || '本机 GPU 需要升级 CUDA PyTorch 才能 GPU 转写。');
    const choice = await appConfirmChoice({
        title: amdRocm ? '需要补齐 ROCm PyTorch' : '需要补齐 CUDA PyTorch',
        message,
        primaryLabel: '一键补齐',
        secondaryLabel: '仍用 CPU 继续',
        tertiaryLabel: '取消',
    });
    if (choice === 'primary') {
        setBadge('待安装', 'warn');
        appendLog(amdRocm ? '正在补齐 ROCm PyTorch…' : '正在补齐 CUDA PyTorch…', 'info');
        const res = await ensureEngineTorchCuda({ force: true, silent: false });
        const ok = amdRocm
            ? !!(res?.ok && cachedGpuRuntimeProbe?.torchRocm)
            : !!(res?.ok && !cachedGpuRuntimeProbe?.torchCudaMismatch);
        if (ok) {
            appendLog(amdRocm ? 'ROCm PyTorch 已就绪，请再次开始生成' : 'CUDA PyTorch 已就绪，请再次开始生成', 'ok');
        } else {
            appendLog(amdRocm ? 'ROCm PyTorch 未就绪；完成后请再次开始生成' : 'CUDA PyTorch 未就绪；完成后请再次开始生成', 'warn');
            openAppSettings('install');
        }
        return false;
    }
    if (choice === 'secondary') {
        appendLog(amdRocm ? '已选择 CPU 转写（未装引擎 ROCm PyTorch，将极慢）' : '已选择 CPU 转写（Blackwell GPU 无匹配 PyTorch，将极慢）', 'warn');
        return true;
    }
    appendLog(amdRocm ? '已取消开始生成（需补齐 ROCm PyTorch 才能 GPU 转写）' : '已取消开始生成（需补齐 CUDA PyTorch 才能 GPU 转写）', 'warn');
    return false;
}

async function maybePromptTorchCudaOnAsrSelect(asrModelId) {
    if (!gpuTorchApi.shouldPromptOnAsrSelect?.(cachedGpuRuntimeProbe, asrModelId)) {
        return;
    }
    const key = `transub.torchCudaPrompt.${String(asrModelId || '').trim()}`;
    try {
        if (sessionStorage.getItem(key) === '1') return;
    } catch (_) { /* ignore */ }
    const amdRocm = !!gpuTorchApi.needsTorchRocmForAsr?.(cachedGpuRuntimeProbe, asrModelId);
    const message = amdRocm
        ? (gpuTorchApi.buildTorchRocmMessage?.(cachedGpuRuntimeProbe, asrModelId)
            || '本机 AMD GPU 需要引擎内 ROCm PyTorch 才能 GPU 转写。')
        : (gpuTorchApi.buildTorchMismatchMessage?.(cachedGpuRuntimeProbe, asrModelId)
            || '本机 RTX 50 系需要 cu128/cu130 版 PyTorch 才能 GPU 转写。');
    const choice = await appConfirmChoice({
        title: amdRocm ? 'Qwen3-ASR 需要 ROCm PyTorch' : 'Qwen3-ASR 需要 CUDA PyTorch',
        message,
        primaryLabel: '去补齐',
        secondaryLabel: '稍后',
    });
    try { sessionStorage.setItem(key, '1'); } catch (_) { /* ignore */ }
    if (choice === 'primary') {
        openAppSettings('install');
        void ensureEngineTorchCuda({ force: true, silent: false });
    }
}

async function refreshHardwareRecommend({ silent = true } = {}) {
    if (!electron?.transubEngineRecommend) return null;
    try {
        const res = await electron.transubEngineRecommend(engineFormPayload());
        if (res?.ok) {
            const vramMb = Number(res.device?.vramMb || res.reason?.vramMb || 0);
            setCachedHardwareRecommend({
                vramMb: vramMb > 0 ? vramMb : undefined,
                profile: String(res.profile || '').trim() || undefined,
                asrModel: String(res.models?.asrModel || res.asrModel || '').trim() || undefined,
                gpuName: String(res.device?.gpuName || '').trim() || undefined,
                at: Date.now(),
            });
            syncTranslateChipUi();
            updateAsrRecommendChip(res);
            return res;
        }
        if (!silent) appendLog(res?.error || '硬件推荐失败', 'warn');
        return res;
    } catch (err) {
        if (!silent) appendLog(err?.message || String(err), 'warn');
        return { ok: false, error: err?.message || String(err) };
    }
}

async function refreshEngineGpuStatus({ silent = true, recommend = true } = {}) {
    if (!electron?.transubEngineGpuStatus) return null;
    try {
        const res = await electron.transubEngineGpuStatus(engineFormPayload());
        if (res?.ok) {
            applyGpuRuntimeProbe(res);
            const vramMb = Number(res.vramMb || res.device?.vramMb || 0);
            if (vramMb > 0) {
                setCachedHardwareRecommend({
                    ...(getCachedHardwareRecommend() || {}),
                    vramMb,
                    gpuName: String(res.gpuName || res.device?.gpuName || getCachedHardwareRecommend()?.gpuName || '').trim()
                        || undefined,
                    at: Date.now(),
                });
            }
            // Full profile (speed/balanced/quality) comes from recommend — skip on soft paths.
            if (recommend !== false) {
                void refreshHardwareRecommend({ silent: true });
            }
            return res;
        }
        if (!silent) setEngineGpuStatusText(res?.error || '无法获取 GPU 状态', 'err');
        return res;
    } catch (err) {
        if (!silent) setEngineGpuStatusText(err?.message || String(err), 'err');
        return { ok: false, error: err?.message || String(err) };
    }
}

function applyDemucsProbe(probe = {}) {
    setCachedDemucsProbe(probe && typeof probe === 'object' ? probe : null);
    if (getCachedEnginePickCatalog().length) {
        const rest = getCachedEnginePickCatalog().filter((m) => m.id !== ENGINE_DEMUCS_MODEL_ID);
        setCachedEnginePickCatalog(mergeDemucsPickItem(rest));
        renderEngineModelsCards();
    }
}

async function refreshEngineDemucsStatus({ silent = true } = {}) {
    if (!electron?.transubEngineAudioSeparateStatus) return null;
    try {
        const res = await electron.transubEngineAudioSeparateStatus(engineFormPayload());
        if (res?.ok) {
            applyDemucsProbe(res);
            return res;
        }
        if (!silent) setEngineStatusText(res?.error || '无法获取 Demucs 状态', 'err');
        return res;
    } catch (err) {
        if (!silent) setEngineStatusText(err?.message || String(err), 'err');
        return { ok: false, error: err?.message || String(err) };
    }
}

async function ensureEngineDemucs({ force = false, silent = false, assumeBusy = false } = {}) {
    if (!electron?.transubEngineRunDownload) {
        if (!silent) {
            appendLog('当前环境不支持 Demucs 安装', 'err');
            setEngineStatusText('当前环境不支持 Demucs 安装', 'err');
        }
        return { ok: false, error: 'unsupported' };
    }
    if (!assumeBusy && getEngineModelsBusy()) return { ok: false, error: 'busy' };
    appendLog('开始安装 Demucs（人声分离）…', 'info');
    setEngineStatusText('正在安装 Demucs…', 'busy');
    if (!assumeBusy) {
        setEngineDownloadBusy(true);
        setEngineDownloadProgressPct(0);
        setEngineDownloadProgressVisible(true, '正在安装 Demucs（人声分离）…');
        appendEngineDownloadLog('开始安装 Demucs（人声分离）');
    }
    try {
        const res = await electron.transubEngineRunDownload({
            ...engineFormPayload(),
            kind: 'demucs',
            force: !!force,
        });
        if (res?.ok) {
            await refreshEngineDemucsStatus({ silent: true });
            const probe = getCachedDemucsProbe() || res.probe || res;
            const partial = !!(res.partial
                || (engineModelsUi.isDemucsRuntimeUsable
                    && engineModelsUi.isDemucsRuntimeUsable(probe)
                    && engineModelsUi.isDemucsFullyReady
                    && !engineModelsUi.isDemucsFullyReady(probe)));
            const msg = partial
                ? (res.message || 'Demucs 已可用（CPU），CUDA 未就绪')
                : (res.message || 'Demucs 安装完成');
            setEngineDownloadProgressPct(100);
            setEngineDownloadProgressVisible(true, msg);
            appendEngineDownloadLog(msg);
            if (!silent) {
                appendLog(msg, partial ? 'warn' : 'ok');
                setEngineStatusText(msg, partial ? 'warn' : 'ok');
            }
            return { ...res, partial: partial || !!res.partial };
        }
        if (res?.cancelled) {
            const msg = res.error || '已取消安装';
            setEngineDownloadProgressVisible(true, msg);
            appendEngineDownloadLog(msg);
            if (!silent) {
                appendLog(msg, 'warn');
                setEngineStatusText(msg, 'warn');
            }
            return res;
        }
        const err = formatEngineDownloadError(res?.error || 'Demucs 安装失败');
        setEngineDownloadProgressVisible(true, err);
        appendEngineDownloadLog(err);
        if (!silent) {
            appendLog(err, 'err');
            setEngineStatusText(err, 'err');
        }
        if (!silent && !res?.cancelled) {
            if (!assumeBusy) setEngineDownloadBusy(false);
            const manual = await global.TransubManualWhlInstall?.offerAfterFailure?.({
                kind: 'demucs',
                errorText: err,
                formPayload: engineFormPayload(),
            });
            if (manual?.ok) {
                const msg = manual.message || 'Demucs 本地安装完成';
                setEngineDownloadProgressPct(100);
                setEngineDownloadProgressVisible(true, msg);
                appendEngineDownloadLog(msg);
                appendLog(msg, 'ok');
                setEngineStatusText(msg, 'ok');
                await refreshEngineDemucsStatus({ silent: true });
                return { ok: true, message: msg, manual: true, ...(manual || {}) };
            }
        }
        return res || { ok: false, error: err };
    } catch (err) {
        const msg = formatEngineDownloadError(err?.message || String(err));
        setEngineDownloadProgressVisible(true, msg);
        appendEngineDownloadLog(msg);
        if (!silent) {
            appendLog(msg, 'err');
            setEngineStatusText(msg, 'err');
        }
        if (!silent) {
            if (!assumeBusy) setEngineDownloadBusy(false);
            const manual = await global.TransubManualWhlInstall?.offerAfterFailure?.({
                kind: 'demucs',
                errorText: msg,
                formPayload: engineFormPayload(),
            });
            if (manual?.ok) {
                const okMsg = manual.message || 'Demucs 本地安装完成';
                setEngineDownloadProgressPct(100);
                setEngineDownloadProgressVisible(true, okMsg);
                appendEngineDownloadLog(okMsg);
                appendLog(okMsg, 'ok');
                setEngineStatusText(okMsg, 'ok');
                await refreshEngineDemucsStatus({ silent: true });
                return { ok: true, message: okMsg, manual: true, ...(manual || {}) };
            }
        }
        return { ok: false, error: msg };
    } finally {
        if (!assumeBusy) setEngineDownloadBusy(false);
    }
}

async function scanAndReuseEngineCuda() {
    const ready = await ensureEngineReadyForGpuAction('扫描复用本机 CUDA（Engine）');
    if (!ready) return { ok: false, error: 'engine_not_ready', cancelled: true };
    if (!electron?.transubEngineScanCuda || !electron?.transubEngineAdoptCuda) {
        appendLog('当前环境不支持扫描本机 CUDA', 'err');
        setEngineStatusText('当前环境不支持扫描本机 CUDA', 'err');
        return { ok: false, error: 'unsupported' };
    }
    if (getEngineModelsBusy()) return { ok: false, error: 'busy' };
    setEngineGpuStatusText('正在扫描本机 CUDA…', 'busy');
    setEngineStatusText('正在扫描本机 CUDA…', 'busy');
    try {
        const scan = await electron.transubEngineScanCuda({
            ...engineFormPayload(),
            major: 12,
        });
        if (!scan?.ok) {
            const err = scan?.error || '扫描失败';
            setEngineGpuStatusText(err, 'err');
            setEngineStatusText(err, 'err');
            appendLog(err, 'err');
            return scan || { ok: false, error: err };
        }
        if (!scan.found) {
            await appConfirm({
                title: '未找到可复用 CUDA',
                message: uiTf('{msg}\n\n仍可点「下载 GPU 支持」从镜像安装；也可用「选择 CUDA 目录」指定开发目录 / 其它项目中的 nvidia 或 cudart 目录后再扫。', {
                    msg: scan.message || '未找到齐全的本机 CUDA 运行库。',
                }),
                primaryLabel: '知道了',
            });
            setEngineGpuStatusText(scan.message || '未找到可复用 CUDA', 'warn');
            return { ok: true, found: false, message: scan.message };
        }
        const reused = (scan.cuda12?.reusable || []).join('、') || scan.message;
        const choice = await appConfirmChoice({
            title: '找到可复用本机 CUDA',
            message: uiTf('{msg}\n\n可复用：{reused}\n\n将复制到引擎目录（跳过 nvidia-* 大包下载）。仍缺的组件可随后用「下载 GPU 支持」补齐（含 onnxruntime-gpu）。', {
                msg: scan.message || '已找到可复用组件。',
                reused,
            }),
            primaryLabel: '复用到引擎',
            secondaryLabel: '仅查看',
        });
        setEngineGpuStatusText(scan.message || '已扫描', 'ok');
        if (choice !== 'primary') {
            return { ok: true, found: true, adopted: false, ...(scan || {}) };
        }
        setEngineStatusText('正在复用本机 CUDA 到引擎…', 'busy');
        const adopt = await electron.transubEngineAdoptCuda({
            ...engineFormPayload(),
            major: 12,
        });
        if (!adopt?.ok) {
            const err = adopt?.error || '复用失败';
            setEngineGpuStatusText(err, 'err');
            setEngineStatusText(err, 'err');
            appendLog(err, 'err');
            return adopt || { ok: false, error: err };
        }
        const msg = adopt.message || '已复用本机 CUDA 到引擎';
        appendLog(msg, 'ok');
        setEngineGpuStatusText(msg, 'ok');
        setEngineStatusText(msg, 'ok');
        await refreshEngineGpuStatus({ silent: true });
        return { ok: true, found: true, adopted: true, ...(adopt || {}) };
    } catch (err) {
        const msg = err?.message || String(err);
        setEngineGpuStatusText(msg, 'err');
        setEngineStatusText(msg, 'err');
        appendLog(msg, 'err');
        return { ok: false, error: msg };
    }
}

async function ensureEngineGpuSupport({ force = false, silent = false } = {}) {
    const ready = await ensureEngineReadyForGpuAction('下载 GPU 支持');
    if (!ready) return { ok: false, error: 'engine_not_ready', cancelled: true };
    if (!electron?.transubEngineRunDownload) {
        if (!silent) {
            appendLog('当前环境不支持 GPU 支持安装', 'err');
            setEngineStatusText('当前环境不支持 GPU 支持安装', 'err');
        }
        return { ok: false, error: 'unsupported' };
    }
    if (getEngineModelsBusy()) return { ok: false, error: 'busy' };
    appendLog('开始安装 GPU 支持…', 'info');
    setEngineGpuStatusText('正在安装…', 'busy');
    setEngineStatusText('正在安装 GPU 支持…', 'busy');
    setEngineDownloadBusy(true);
    setEngineDownloadProgressPct(0);
    setEngineDownloadProgressVisible(true, '正在安装 GPU 支持…');
    appendEngineDownloadLog('开始安装 GPU 支持');
    try {
        const res = await electron.transubEngineRunDownload({
            ...engineFormPayload(),
            kind: 'gpu',
            force: !!force,
        });
        if (res?.ok) {
            const msg = res.message || 'GPU 支持安装完成';
            setEngineDownloadProgressPct(100);
            setEngineDownloadProgressVisible(true, msg);
            appendEngineDownloadLog(msg);
            if (!silent) {
                appendLog(msg, 'ok');
                setEngineStatusText(msg, 'ok');
            }
            await refreshEngineGpuStatus({ silent: true });
            if (cachedGpuRuntimeProbe?.torchCudaMismatch) {
                appendLog('GPU 组件已就绪；检测到 PyTorch 与本机 GPU 不兼容，继续补齐 CUDA PyTorch…', 'info');
                const torchRes = await ensureEngineTorchCuda({
                    force: true,
                    silent: true,
                    assumeBusy: true,
                });
                if (torchRes?.ok && !cachedGpuRuntimeProbe?.torchCudaMismatch) {
                    const torchMsg = torchRes.message || 'CUDA PyTorch 安装完成';
                    setEngineDownloadProgressPct(100);
                    setEngineDownloadProgressVisible(true, torchMsg);
                    appendEngineDownloadLog(torchMsg);
                    if (!silent) {
                        appendLog(torchMsg, 'ok');
                        setEngineStatusText(torchMsg, 'ok');
                    }
                    return torchRes;
                }
            }
            return res;
        }
        if (res?.cancelled) {
            const msg = res.error || '已取消安装';
            setEngineDownloadProgressVisible(true, msg);
            appendEngineDownloadLog(msg);
            if (!silent) {
                appendLog(msg, 'warn');
                setEngineStatusText(msg, 'warn');
                setEngineGpuStatusText(msg, 'warn');
            }
            return res;
        }
        const err = formatEngineDownloadError(res?.error || 'GPU 支持安装失败');
        setEngineDownloadProgressVisible(true, err);
        appendEngineDownloadLog(err);
        if (!silent) {
            appendLog(err, 'err');
            setEngineStatusText(err, 'err');
            setEngineGpuStatusText(err, 'err');
        }
        if (!silent && !res?.cancelled) {
            // Release busy so local install IPC can run.
            setEngineDownloadBusy(false);
            const manual = await global.TransubManualWhlInstall?.offerAfterFailure?.({
                kind: 'gpu',
                errorText: err,
                formPayload: engineFormPayload(),
            });
            if (manual?.ok) {
                const msg = manual.message || 'GPU 支持本地安装完成';
                setEngineDownloadProgressPct(100);
                setEngineDownloadProgressVisible(true, msg);
                appendEngineDownloadLog(msg);
                appendLog(msg, 'ok');
                setEngineStatusText(msg, 'ok');
                await refreshEngineGpuStatus({ silent: true });
                return { ok: true, message: msg, manual: true, ...(manual || {}) };
            }
        }
        return res || { ok: false, error: err };
    } catch (err) {
        const msg = formatEngineDownloadError(err?.message || String(err));
        setEngineDownloadProgressVisible(true, msg);
        appendEngineDownloadLog(msg);
        if (!silent) {
            appendLog(msg, 'err');
            setEngineStatusText(msg, 'err');
            setEngineGpuStatusText(msg, 'err');
        }
        if (!silent) {
            setEngineDownloadBusy(false);
            const manual = await global.TransubManualWhlInstall?.offerAfterFailure?.({
                kind: 'gpu',
                errorText: msg,
                formPayload: engineFormPayload(),
            });
            if (manual?.ok) {
                const okMsg = manual.message || 'GPU 支持本地安装完成';
                setEngineDownloadProgressPct(100);
                setEngineDownloadProgressVisible(true, okMsg);
                appendEngineDownloadLog(okMsg);
                appendLog(okMsg, 'ok');
                setEngineStatusText(okMsg, 'ok');
                await refreshEngineGpuStatus({ silent: true });
                return { ok: true, message: okMsg, manual: true, ...(manual || {}) };
            }
        }
        return { ok: false, error: msg };
    } finally {
        setEngineDownloadBusy(false);
    }
}

function formatEngineTestResultMessage(res) {
    if (engineModelsUi.formatEngineTestResultMessage) {
        return engineModelsUi.formatEngineTestResultMessage(res, {
            installPath: els.engineInstallPathInput?.value || '',
            gpuStatus: els.engineGpuStatus?.textContent || '',
            models: getCachedEngineModels(),
            demucs: getCachedDemucsProbe(),
        });
    }
    if (!res?.ok) return String(res?.error || '引擎未就绪');
    return '引擎已就绪。';
}

async function showEngineTestResultDialog(res) {
    const ok = !!res?.ok;
    const message = formatEngineTestResultMessage(res);
    await appConfirm({
        title: ok ? '引擎检测结果' : '引擎检测未通过',
        message,
        primaryLabel: '确定',
        hideSecondary: true,
    });
}

async function refreshEngineStatus({ soft = false } = {}) {
    setEngineStatusText('检测中…', 'busy');
    syncEnvEngineChip('busy', '检测中…');
    const basePayload = engineFormPayload();
    // Soft/cold probe: never spawn the engine (default autoStart would otherwise
    // pull up Python right after first paint and freeze UI for seconds).
    const payload = soft
        ? { ...basePayload, engineAutoStart: false }
        : basePayload;
    const res = await electron?.transubEngineValidate?.(payload);
    if (res?.ok) {
        const ver = res.version || res.health?.engineVersion || '';
        const stub = res.health?.stub ? ', stub' : '';
        setEngineStatusText(
            ver ? uiTf('Transub Engine 引擎就绪 ({ver}{stub})', { ver, stub }) : 'Transub Engine 引擎就绪',
            'ok',
        );
        syncEnvEngineChip('ok', ver ? uiTf('就绪 {ver}', { ver }) : '已就绪');
        syncEnvGpuActionGuards(true);
        if (!soft) {
            // Models are optional (e.g. LLM-only translate); do not fold install gaps into「检测引擎」.
            await refreshEngineModels({ silent: true });
            await refreshEngineGpuStatus({ silent: true });
            await refreshEngineDemucsStatus({ silent: true });
        } else {
            // Soft path must stay cheap: no GPU HTTP probe (that ensureEngineRunning-spawns).
            paintSoftGpuStatusPlaceholder();
            if (!hasEngineModelsCacheInMemory()) {
                await loadEngineModelsCacheFromDisk({ apply: true }).catch(() => {});
            }
        }
    } else if (soft) {
        // Not running yet is expected on cold start when auto-start is deferred.
        if (basePayload.engineAutoStart !== false) {
            setEngineStatusText('引擎待命（开始任务时启动）', 'ok');
            syncEnvEngineChip('ok', '待命');
            // Bundled engine path is usable for GPU install even before first spawn.
            syncEnvGpuActionGuards(true);
            paintSoftGpuStatusPlaceholder();
        } else {
            setEngineStatusText(res?.error || 'Transub Engine 引擎未就绪', 'warn');
            syncEnvEngineChip('warn', '未就绪');
            syncEnvGpuActionGuards(false);
            syncEnvGpuChip('warn', '待检测');
            if (els.engineEnsureTorchCudaBtn) {
                els.engineEnsureTorchCudaBtn.classList.remove('hidden');
            }
        }
        if (!hasEngineModelsCacheInMemory()) {
            await loadEngineModelsCacheFromDisk({ apply: true }).catch(() => {});
        }
    } else {
        setEngineStatusText(res?.error || 'Transub Engine 引擎未就绪', 'err');
        syncEnvEngineChip('err', '未就绪');
        syncEnvGpuActionGuards(false);
        if (els.engineModelsSummary) els.engineModelsSummary.textContent = 'Transub Engine 引擎未就绪';
        setCachedEngineModels([]);
        setCachedDemucsProbe(null);
        if (isEngineModelsLibraryOpen()) renderEngineModelsList([]);
        setEngineGpuStatusText('');
        syncEnvGpuChip('err', '引擎未就绪');
    }
    updateEnvBanner();
    return res;
}

function getEngineDownloadModelMeta(modelIds) {
    const byId = new Map(getCachedEnginePickCatalog().map((m) => [m.id, m]));
    return (Array.isArray(modelIds) ? modelIds : [])
        .map((id) => String(id || '').trim())
        .filter(Boolean)
        .map((id) => ({
            id,
            installed: !!byId.get(id)?.installed,
            source: byId.get(id)?.source || (
                isSakuraMtModelId(id) ? 'sakura'
                    : (findManagedLlmCatalogEntry(id) ? 'managed' : 'engine')
            ),
        }));
}

function manualDownloadDeps() {
    return {
        demucsModelId: ENGINE_DEMUCS_MODEL_ID,
        isSakuraMtModelId,
        findManagedLlmCatalogEntry,
    };
}

function isManagedLlmDownloadId(modelId, source = '') {
    if (manualDownloadApi.isManagedLlmDownloadId) {
        return manualDownloadApi.isManagedLlmDownloadId(modelId, source, manualDownloadDeps());
    }
    return false;
}

/** Hub ASR/MT/VAD models that can be placed manually under engine models/. */
function canManualEngineHubDownload(item) {
    if (manualDownloadApi.canManualEngineHubDownload) {
        return manualDownloadApi.canManualEngineHubDownload(item, manualDownloadDeps());
    }
    return false;
}

function buildManualHubModelHint(info = {}) {
    if (manualDownloadApi.buildManualHubModelHint) {
        return manualDownloadApi.buildManualHubModelHint(info);
    }
    return String(info?.name || info?.modelId || '模型');
}

async function verifyManualEngineHubModel(modelId, info = null) {
    const id = String(modelId || '').trim();
    await refreshEngineModels({ silent: true });
    const row = (getCachedEnginePickCatalog() || []).find((m) => m.id === id);
    if (row?.installed && !row?.incomplete) {
        const msg = uiTf('已检测到本地模型：{name}', { name: row.name || id });
        appendLog(msg, 'ok');
        setEngineStatusText(msg, 'ok');
        return { ok: true, message: msg };
    }
    const folder = String(info?.localDir || info?.folder || row?.localDir || '').trim();
    const weightFile = String(info?.weightFile || '').trim();
    const err = [
        row?.incomplete
            ? uiTf('「{id}」目录不完整', { id })
            : uiTf('未检测到已安装的「{id}」', { id }),
        weightFile ? uiTf('请确认 {weightFile} 已完整放入目录', { weightFile }) : '',
        folder ? uiTf('目录：{folder}', { folder }) : '',
    ].filter(Boolean).join('\n');
    appendLog(err, 'err');
    setEngineStatusText(err, 'err');
    return { ok: false, error: err };
}

async function openEngineHubModelFolder(modelId, info = null) {
    const id = String(modelId || '').trim();
    const folderHint = String(info?.localDir || info?.folder || '').trim();
    if (!electron?.transubEngineOpenDownloadFolder && !electron?.openPath) {
        return { ok: false, error: '当前环境无法打开目录' };
    }
    try {
        if (electron.transubEngineOpenDownloadFolder) {
            const res = await electron.transubEngineOpenDownloadFolder({
                ...engineFormPayload(),
                kind: 'models',
                modelId: id,
                folder: folderHint || undefined,
                hfEndpoint: els.engineHfEndpointInput?.value.trim() || '',
            });
            if (res?.ok) {
                return {
                    ok: true,
                    folder: res.folder || res.path || folderHint,
                };
            }
            return { ok: false, error: res?.error || '无法打开存放目录' };
        }
        if (folderHint && electron.openPath) {
            await electron.openPath(folderHint);
            return { ok: true, folder: folderHint };
        }
        return { ok: false, error: '无法打开存放目录' };
    } catch (err) {
        return { ok: false, error: err?.message || '无法打开存放目录' };
    }
}

/**
 * Hub 模型（非 GGUF）：弹窗给出仓库网址、放置说明，并可打开存放目录。
 */
async function manualEngineHubModelDownload(modelId) {
    const id = String(modelId || '').trim();
    if (!id) return { ok: false, error: '未选择模型' };
    if (getEngineModelsBusy()) return { ok: false, error: 'busy' };
    if (!electron?.transubEngineDownloadInfo) {
        setEngineStatusText('当前环境不支持手动下载模型', 'err');
        return { ok: false, error: 'unsupported' };
    }
    setEngineStatusText('正在准备手动下载说明…', 'busy');
    let infoRes;
    try {
        infoRes = await electron.transubEngineDownloadInfo({
            ...engineFormPayload(),
            kind: 'models',
            modelIds: [id],
            hfEndpoint: els.engineHfEndpointInput?.value.trim() || '',
        });
    } catch (err) {
        const msg = err?.message || '无法获取下载信息';
        setEngineStatusText(msg, 'err');
        return { ok: false, error: msg };
    }
    if (!infoRes?.ok) {
        const msg = infoRes?.error || '无法获取下载信息';
        setEngineStatusText(msg, 'err');
        return { ok: false, error: msg };
    }
    const item = (Array.isArray(infoRes.info?.items) ? infoRes.info.items : [])
        .find((it) => String(it?.id || '') === id)
        || (Array.isArray(infoRes.info?.items) ? infoRes.info.items[0] : null);
    if (!item) {
        setEngineStatusText('未找到该模型的下载信息', 'err');
        return { ok: false, error: 'missing_item' };
    }
    if (item.bundled || !item.hubId) {
        const msg = `「${item.name || id}」无需单独下载（运行时内置）`;
        setEngineStatusText(msg, 'info');
        return { ok: true, bundled: true, message: msg };
    }
    const info = {
        ...item,
        modelId: id,
        folder: item.localDir || item.folder || '',
    };
    await new Promise((r) => setTimeout(r, 50));
    const choice = await appConfirmChoice({
        title: '手动下载模型',
        message: buildManualHubModelHint(info),
        primaryLabel: '打开下载页',
        tertiaryLabel: '打开存放目录',
        secondaryLabel: '取消',
    });
    if (choice === 'secondary') {
        setEngineStatusText('已取消手动下载', 'warn');
        return { ok: false, cancelled: true };
    }
    if (choice === 'tertiary') {
        const folderRes = await openEngineHubModelFolder(id, info);
        if (folderRes.ok) {
            setEngineStatusText(uiTf('已打开存放目录：{folder}', { folder: folderRes.folder || info.folder || '' }), 'info');
        } else {
            setEngineStatusText(folderRes.error || '无法打开存放目录', 'err');
        }
        const again = await appConfirmChoice({
            title: '手动下载模型',
            message: uiTf('{hint}\n\n目录已打开。是否继续打开下载页？', {
                hint: buildManualHubModelHint(info),
            }),
            primaryLabel: '打开下载页',
            secondaryLabel: '稍后',
        });
        if (again !== 'primary') return { ok: true, folderOnly: true };
    }
    const url = String(info.defaultUrl || info.mirrorUrl || info.officialUrl || '').trim();
    if (!url) {
        setEngineStatusText('未找到模型下载链接', 'err');
        return { ok: false, error: 'no_url' };
    }
    try {
        if (electron.transubEngineOpenManualUrl) {
            const openRes = await electron.transubEngineOpenManualUrl({ url });
            if (!openRes?.ok) {
                const msg = openRes?.error || '无法打开下载链接';
                setEngineStatusText(msg, 'err');
                return { ok: false, error: msg };
            }
        } else if (electron.openExternal) {
            await electron.openExternal(url);
        } else {
            setEngineStatusText('无法打开下载链接', 'err');
            return { ok: false, error: 'no_open' };
        }
    } catch (err) {
        const msg = err?.message || '无法打开下载链接';
        setEngineStatusText(msg, 'err');
        return { ok: false, error: msg };
    }
    const folder = String(info.localDir || info.folder || '').trim();
    const placedMsg = folder
        ? uiTf('已打开下载页。请将仓库文件放到：{folder}', { folder })
        : '已打开下载页。请按提示将文件放到引擎 models 目录';
    appendLog(placedMsg, 'info');
    setEngineStatusText(placedMsg, 'info');
    const verifyChoice = await appConfirmChoice({
        title: '检测本地文件',
        message: (
            `若已将文件放到指定目录，可立即检测是否可用。\n\n`
            + (info.weightFile ? uiTf('关键权重：{file}\n', { file: info.weightFile }) : '')
            + (folder ? uiTf('目录：{folder}', { folder }) : '')
        ),
        primaryLabel: '我已放入，检测',
        tertiaryLabel: '打开存放目录',
        secondaryLabel: '稍后',
    });
    if (verifyChoice === 'tertiary') {
        try {
            await openEngineHubModelFolder(id, info);
        } catch (_) { /* ignore */ }
        const retry = await appConfirm({
            title: '检测本地文件',
            message: '文件放好后，是否现在检测？',
            primaryLabel: '检测',
            secondaryLabel: '稍后',
        });
        if (!retry) return { ok: true, opened: true, message: placedMsg };
        return verifyManualEngineHubModel(id, info);
    }
    if (verifyChoice === 'primary') {
        return verifyManualEngineHubModel(id, info);
    }
    return { ok: true, opened: true, message: placedMsg };
}

function classifyManualKindsForModelIds(modelIds) {
    if (manualDownloadApi.classifyManualKindsForModelIds) {
        return manualDownloadApi.classifyManualKindsForModelIds(modelIds, ENGINE_DEMUCS_MODEL_ID);
    }
    return { kinds: [], hubIds: [] };
}

function buildManualGgufHint(info = {}) {
    if (manualDownloadApi.buildManualGgufHint) {
        return manualDownloadApi.buildManualGgufHint(info);
    }
    return String(info?.name || info?.modelId || '模型');
}

async function verifyManualManagedLlmModel(modelId, info = null) {
    const res = await electron?.transubAdvancedManagedLlmVerifyManual?.({ modelId, kind: 'model' });
    if (res?.ok) {
        const msg = res.message || '已检测到本地 GGUF';
        appendLog(msg, 'ok');
        setEngineStatusText(msg, 'ok');
        await refreshEngineModels({ silent: true });
        return { ok: true, message: msg };
    }
    const folder = res?.folder || info?.folder || '';
    const fileName = res?.fileName || info?.fileName || '';
    const err = [res?.error || '未检测到有效的模型文件', fileName && folder ? uiTf('请确认 {fileName} 已放在：{folder}', { fileName, folder }) : '']
        .filter(Boolean)
        .join('\n');
    appendLog(err, 'err');
    setEngineStatusText(err, 'err');
    return { ok: false, error: err };
}

/**
 * 单文件 GGUF：浏览器手动下载，并提示放到 advanced-llm/models。
 */
async function manualManagedLlmDownload(modelId) {
    const id = String(modelId || '').trim();
    if (!id) return { ok: false, error: '未选择模型' };
    if (getEngineModelsBusy()) return { ok: false, error: 'busy' };
    if (!electron?.transubAdvancedManagedLlmDownloadInfo || !electron?.transubAdvancedManagedLlmOpenManual) {
        setEngineStatusText('当前环境不支持手动下载 GGUF', 'err');
        return { ok: false, error: 'unsupported' };
    }
    setEngineStatusText('正在准备手动下载说明…', 'busy');
    let infoRes;
    try {
        infoRes = await electron.transubAdvancedManagedLlmDownloadInfo({ modelId: id, kind: 'model' });
    } catch (err) {
        const msg = err?.message || '无法获取下载信息';
        setEngineStatusText(msg, 'err');
        return { ok: false, error: msg };
    }
    if (!infoRes?.ok) {
        const msg = infoRes?.error || '无法获取下载信息';
        setEngineStatusText(msg, 'err');
        return { ok: false, error: msg };
    }
    const info = infoRes.info || {};
    await new Promise((r) => setTimeout(r, 50));
    const choice = await appConfirmChoice({
        title: '手动下载 GGUF',
        message: buildManualGgufHint(info),
        primaryLabel: '打开下载链接',
        tertiaryLabel: '打开存放目录',
        secondaryLabel: '取消',
    });
    if (choice === 'secondary') {
        setEngineStatusText('已取消手动下载', 'warn');
        return { ok: false, cancelled: true };
    }
    if (choice === 'tertiary') {
        try {
            const folderRes = await electron.transubAdvancedManagedLlmOpenFolder?.({ kind: 'model' });
            if (folderRes?.ok) {
                setEngineStatusText(uiTf('已打开存放目录：{folder}', { folder: folderRes.folder || info.folder || '' }), 'info');
            } else {
                setEngineStatusText(folderRes?.error || '无法打开存放目录', 'err');
            }
        } catch (err) {
            setEngineStatusText(err?.message || '无法打开存放目录', 'err');
        }
        const again = await appConfirmChoice({
            title: '手动下载 GGUF',
            message: uiTf('{hint}\n\n目录已打开。是否继续打开下载链接？', {
                hint: buildManualGgufHint(info),
            }),
            primaryLabel: '打开下载链接',
            secondaryLabel: '稍后',
        });
        if (again !== 'primary') return { ok: true, folderOnly: true };
    }
    try {
        const openRes = await electron.transubAdvancedManagedLlmOpenManual({
            modelId: id,
            kind: 'model',
            which: 'mirror',
        });
        if (!openRes?.ok) {
            const msg = openRes?.error || '无法打开下载链接';
            setEngineStatusText(msg, 'err');
            return { ok: false, error: msg };
        }
    } catch (err) {
        const msg = err?.message || '无法打开下载链接';
        setEngineStatusText(msg, 'err');
        return { ok: false, error: msg };
    }
    const folder = String(info.folder || '').trim();
    const fileName = String(info.fileName || '').trim();
    const placedMsg = fileName && folder
        ? uiTf('已打开下载页。请将 {fileName} 放到：{folder}', { fileName, folder })
        : '已打开下载页。请按提示将 GGUF 放到 advanced-llm/models 目录';
    appendLog(placedMsg, 'info');
    setEngineStatusText(placedMsg, 'info');
    const verifyChoice = await appConfirmChoice({
        title: '检测本地文件',
        message: (
            `若已将文件放到指定目录，可立即检测是否可用。\n\n`
            + (fileName ? uiTf('文件名：{fileName}\n', { fileName }) : '')
            + (folder ? uiTf('目录：{folder}', { folder }) : '')
        ),
        primaryLabel: '我已放入，检测',
        tertiaryLabel: '打开存放目录',
        secondaryLabel: '稍后',
    });
    if (verifyChoice === 'tertiary') {
        try {
            await electron.transubAdvancedManagedLlmOpenFolder?.({ kind: 'model' });
        } catch (_) { /* ignore */ }
        const retry = await appConfirm({
            title: '检测本地文件',
            message: '文件放好后，是否现在检测？',
            primaryLabel: '检测',
            secondaryLabel: '稍后',
        });
        if (!retry) return { ok: true, opened: true, message: placedMsg };
        return verifyManualManagedLlmModel(id, info);
    }
    if (verifyChoice === 'primary') {
        return verifyManualManagedLlmModel(id, info);
    }
    return { ok: true, opened: true, message: placedMsg };
}

async function openEngineModelHubLinks(modelIds) {
    const ids = (Array.isArray(modelIds) ? modelIds : []).filter(Boolean);
    if (!ids.length || !electron?.transubEngineDownloadInfo) {
        return { ok: false, error: '无可打开的模型镜像' };
    }
    try {
        const res = await electron.transubEngineDownloadInfo({
            ...engineFormPayload(),
            kind: 'models',
            modelIds: ids,
            hfEndpoint: els.engineHfEndpointInput?.value.trim() || '',
        });
        const idSet = new Set(ids);
        const items = (Array.isArray(res?.info?.items) ? res.info.items : [])
            .filter((it) => !it?.id || idSet.has(String(it.id)));
        const urls = [...new Set(
            items
                .map((it) => it.defaultUrl || it.mirrorUrl || it.officialUrl)
                .filter(Boolean),
        )];
        if (!urls.length) return { ok: false, error: '未找到模型下载链接' };
        for (const url of urls.slice(0, 8)) {
            try {
                if (electron.transubEngineOpenManualUrl) {
                    await electron.transubEngineOpenManualUrl({ url });
                } else {
                    await electron.openExternal?.(url);
                }
            } catch (_) { /* ignore */ }
        }
        const folder = res?.info?.folder;
        const msg = folder
            ? uiTf('已打开模型镜像页。请将文件放到：{folder}', { folder })
            : '已打开模型镜像页';
        return { ok: true, message: msg, folder };
    } catch (err) {
        return { ok: false, error: err?.message || String(err) };
    }
}

async function manualEngineDownloadInstall({ modelIds = null, kinds: forceKinds = null } = {}) {
    if (getEngineModelsBusy()) return { ok: false, error: 'busy' };
    if (!global.TransubManualWhlInstall?.openModal && !electron?.transubEngineDownloadInfo) {
        setEngineStatusText('当前环境不支持手动下载安装', 'err');
        return { ok: false, error: 'unsupported' };
    }

    const selectedIds = Array.isArray(modelIds)
        ? modelIds.map((id) => String(id || '').trim()).filter(Boolean)
        : [];
    let { kinds, hubIds } = classifyManualKindsForModelIds(selectedIds);
    if (Array.isArray(forceKinds) && forceKinds.length) {
        kinds = [...new Set(forceKinds.map((k) => String(k || '').trim()).filter(Boolean))];
    }

    // Nothing selected → offer common runtime wheels (SenseVoice / Whisper / Demucs / GPU).
    if (!kinds.length && !hubIds.length) {
        kinds = ['sensevoice', 'whisper', 'demucs', 'gpu'];
        setEngineStatusText('将列出常用运行库供手动下载', 'info');
    }

    let installedOk = false;
    if (kinds.length && global.TransubManualWhlInstall?.openModal) {
        const labels = kinds.map((k) => {
            if (k === 'sensevoice') return 'SenseVoice';
            if (k === 'whisper') return 'Whisper';
            if (k === 'demucs') return 'Demucs';
            return 'GPU';
        });
        setEngineStatusText(uiTf('打开手动下载（{labels}）…', { labels: labels.join(' + ') }), 'busy');
        appendLog(`手动下载安装：${labels.join('、')}`, 'info');
        const manual = await global.TransubManualWhlInstall.openModal({
            kind: kinds[0],
            kinds,
            formPayload: engineFormPayload(),
        });
        if (manual?.ok) {
            installedOk = true;
            const msg = manual.message || '手动安装完成';
            appendLog(msg, 'ok');
            setEngineStatusText(msg, 'ok');
            setEngineDownloadProgressVisible(true, msg);
            await refreshEngineModels({ silent: true });
            await refreshEngineGpuStatus({ silent: true });
            await refreshEngineDemucsStatus({ silent: true });
            // Local .whl install finished — do not auto-open HF mirror tabs
            // (same as env-check). Weights can still be fetched via 自动下载.
            return { ok: true, installed: true, message: msg };
        } else if (manual?.cancelled) {
            // User dismissed the dialog — do not open hub pages or another modal.
            setEngineStatusText('已取消手动下载', 'warn');
            return { ok: false, cancelled: true };
        }
    }

    if (hubIds.length) {
        const opened = await openEngineModelHubLinks(hubIds);
        if (opened.ok) {
            appendLog(opened.message, 'info');
            setEngineStatusText(opened.message, 'info');
            return { ok: true, hub: true, installed: installedOk, message: opened.message };
        }
        if (!installedOk) {
            setEngineStatusText(opened.error || '打开模型镜像失败', 'err');
            return { ok: false, error: opened.error };
        }
    }

    return installedOk
        ? { ok: true, installed: true }
        : { ok: false, cancelled: true };
}

async function downloadManagedLlmModels(modelIds, { force = false } = {}) {
    const ids = (Array.isArray(modelIds) ? modelIds : [])
        .map((id) => String(id || '').trim())
        .filter(Boolean);
    if (!ids.length) return { ok: false, error: '未选择模型' };
    if (!electron?.transubAdvancedManagedLlmPull) {
        return { ok: false, error: '当前环境不支持 LLM 模型下载' };
    }
    setEngineDownloadActiveSource('managed');
    clearEngineDownloadLog();
    resetAppEngineDlProgressLog();
    setEngineDownloadBusy(true);
    setEngineDownloadProgressPct(0);
    setEngineDownloadProgressVisible(true, uiTf('正在下载 LLM：{ids}', { ids: ids.join(', ') }));
    appendEngineDownloadLog(`开始下载 LLM 推理模型：${ids.join(', ')}`);
    appendLog(`开始下载 LLM 模型：${ids.join(', ')}`, 'info');
    setEngineStatusText('正在下载 LLM 模型…', 'busy');
    try {
        for (let i = 0; i < ids.length; i += 1) {
            const id = ids[i];
            const entry = findManagedLlmCatalogEntry(id);
            if (entry && getManagedLlmCatalogApi()?.isProScaleModel?.(entry) && !getAdvancedEntitled()) {
                const err = `「${entry.name || id}」为 Pro 规格模型。解锁 Pro 后可下载。`;
                setEngineDownloadProgressVisible(true, err);
                appendEngineDownloadLog(err);
                appendLog(err, 'err');
                setEngineStatusText(err, 'err');
                return { ok: false, error: err, code: 'pro_required' };
            }
            appendEngineDownloadLog(`下载 ${id}（${i + 1}/${ids.length}）…`);
            const res = await electron.transubAdvancedManagedLlmPull({
                modelId: id,
                force: !!force,
            });
            if (res?.cancelled || res?.code === 'cancelled') {
                const msg = res.error || '已取消下载';
                setEngineDownloadProgressVisible(true, msg);
                appendEngineDownloadLog(msg);
                appendLog(msg, 'warn');
                setEngineStatusText(msg, 'warn');
                return { ok: false, cancelled: true, error: msg };
            }
            if (!res?.ok) {
                const err = formatEngineDownloadError(res?.error || uiTf('下载 {id} 失败', { id }));
                setEngineDownloadProgressVisible(true, err);
                appendEngineDownloadLog(err);
                appendLog(err, 'err');
                setEngineStatusText(err, 'err');
                setEngineDownloadBusy(false);
                const proceed = await appConfirm({
                    title: '模型下载失败',
                    message: uiTf('{err}\n\n是否改为浏览器手动下载 GGUF，并按提示放到模型目录？', {
                        err: String(err).slice(0, 500),
                    }),
                    primaryLabel: '手动下载',
                    secondaryLabel: '取消',
                });
                if (proceed) {
                    await manualManagedLlmDownload(id);
                }
                return res || { ok: false, error: err };
            }
            appendEngineDownloadLog(res.message || `${id} 下载完成`);
        }
        const msg = ids.length === 1
            ? uiTf('模型 {id} 下载完成', { id: ids[0] })
            : uiTf('已下载 {n} 个 LLM 模型', { n: ids.length });
        setEngineDownloadProgressPct(100);
        setEngineDownloadProgressVisible(true, msg);
        appendEngineDownloadLog(msg);
        appendLog(msg, 'ok');
        setEngineStatusText(msg, 'ok');
        await refreshEngineModels({ silent: true });
        return { ok: true, message: msg };
    } catch (err) {
        const msg = formatEngineDownloadError(err?.message || String(err));
        setEngineDownloadProgressVisible(true, msg);
        appendEngineDownloadLog(msg);
        appendLog(msg, 'err');
        setEngineStatusText(msg, 'err');
        setEngineDownloadBusy(false);
        const failedId = ids[0] || '';
        if (failedId) {
            const proceed = await appConfirm({
                title: '模型下载失败',
                message: uiTf('{err}\n\n是否改为浏览器手动下载 GGUF，并按提示放到模型目录？', {
                    err: String(msg).slice(0, 500),
                }),
                primaryLabel: '手动下载',
                secondaryLabel: '取消',
            });
            if (proceed) {
                await manualManagedLlmDownload(failedId);
            }
        }
        return { ok: false, error: msg };
    } finally {
        setEngineDownloadBusy(false);
    }
}

async function deleteEngineModel(modelId) {
    const id = String(modelId || '').trim();
    if (!id || getEngineModelsBusy()) return;
    if (getEngineModelsBrowseOnly() || await resolveEngineModelsBrowseOnly()) {
        setEngineModelsBrowseOnly(true);
        showToast(explainEngineModelsMutateBlocked(), 'warn');
        return;
    }
    const item = (getCachedEnginePickCatalog() || []).find((m) => m.id === id) || { id };
    const blocked = engineModelsUi.explainDeleteBlockedForPickItem
        ? engineModelsUi.explainDeleteBlockedForPickItem(item, { demucsModelId: ENGINE_DEMUCS_MODEL_ID })
        : '';
    if (blocked) {
        showToast(blocked, 'warn');
        return;
    }
    const copy = engineModelsUi.buildDeleteModelConfirmCopy
        ? engineModelsUi.buildDeleteModelConfirmCopy(item)
        : {
            title: '删除模型',
            message: uiTf('确定删除「{name}」？', { name: item.name || id }),
            primaryLabel: '删除',
            secondaryLabel: '取消',
            danger: true,
        };
    const confirmed = await appConfirm(copy);
    if (!confirmed) return;

    if (!electron?.transubEngineDeleteModels) {
        showToast('当前环境不支持删除模型', 'err');
        return;
    }

    const deletingLabel = uiTf('正在删除：{name}…', { name: item.name || id });
    setEngineModelsBusyKind('delete');
    clearEngineDownloadLog();
    setEngineDownloadBusy(true);
    setEngineDownloadProgressPct(Number.NaN);
    setEngineDownloadProgressVisible(true, deletingLabel);
    appendEngineDownloadLog(deletingLabel);
    syncEngineModelsLibraryTabSummary();
    syncEngineModelsLibraryDlStrip(deletingLabel);
    setEngineStatusText(deletingLabel, 'busy');
    try {
        const res = await electron.transubEngineDeleteModels({
            ...engineFormPayload(),
            modelIds: [id],
        });
        if (res?.ok && Array.isArray(res.deleted) && res.deleted.includes(id)) {
            const msg = res.message || uiTf('已删除：{name}', { name: item.name || id });
            appendLog(msg, 'ok');
            showToast(msg, 'ok');
            setEngineDownloadProgressVisible(true, msg);
            appendEngineDownloadLog(msg);
            setEngineStatusText(msg, 'ok');
            const clearIfMatch = (selectEl) => {
                if (selectEl && String(selectEl.value || '') === id) {
                    selectEl.value = '';
                    selectEl.dispatchEvent(new Event('change'));
                }
            };
            clearIfMatch(els.engineAsrModelSelect);
            clearIfMatch(els.engineVadModelSelect);
            clearIfMatch(els.engineMtModelSelect);
            clearIfMatch(els.engineLlmMtModelSelect);
            clearIfMatch(els.quickAsrModelSelect);
            clearIfMatch(els.quickVadModelSelect);
            await refreshEngineModels({ silent: true });
        } else if (res?.ok && Array.isArray(res.skipped) && res.skipped.some((s) => s.id === id)) {
            const reason = res.skipped.find((s) => s.id === id)?.reason || 'skipped';
            const msg = reason === 'not_installed' ? '模型未下载或已删除' : '该模型不可删除';
            showToast(msg, 'warn');
            setEngineDownloadProgressVisible(true, msg);
            appendEngineDownloadLog(msg);
            setEngineStatusText(msg, 'warn');
            await refreshEngineModels({ silent: true });
        } else {
            const fail = Array.isArray(res?.failed)
                ? res.failed.find((f) => f.id === id)
                : null;
            const msg = fail?.error || res?.error || res?.message || '删除失败';
            appendLog(msg, 'err');
            showToast(msg, 'err');
            setEngineDownloadProgressVisible(true, msg);
            appendEngineDownloadLog(msg);
            setEngineStatusText(msg, 'err');
        }
    } catch (err) {
        const msg = err?.message || String(err);
        appendLog(`删除模型失败：${msg}`, 'err');
        showToast(msg, 'err');
        setEngineDownloadProgressVisible(true, msg);
        appendEngineDownloadLog(msg);
        setEngineStatusText(msg, 'err');
    } finally {
        setEngineDownloadBusy(false);
    }
}

async function downloadEngineModels(options = {}) {
    if (getEngineModelsBusy()) return;
    if (getEngineModelsBrowseOnly() || await resolveEngineModelsBrowseOnly()) {
        setEngineModelsBrowseOnly(true);
        showToast(explainEngineModelsMutateBlocked(), 'warn');
        return;
    }
    const overrideIds = Array.isArray(options.modelIds)
        ? options.modelIds.map((id) => String(id || '').trim()).filter(Boolean)
        : null;
    if (!overrideIds?.length) {
        setEngineStatusText('请点卡片上的「下载」获取模型', 'warn');
        return;
    }
    const selected = getEngineDownloadModelMeta(overrideIds);
    if (!selected.length) {
        setEngineStatusText('请点卡片上的「下载」获取模型', 'warn');
        return;
    }
    const installedIds = selected.filter((m) => m.installed).map((m) => m.id);
    let modelIds = selected.map((m) => m.id);
    let force = options.force === true;
    if (installedIds.length && options.force !== true && options.force !== false) {
        const preview = installedIds.length <= 3
            ? installedIds.join('、')
            : uiTf('{preview} 等 {n} 项', { preview: installedIds.slice(0, 3).join('、'), n: installedIds.length });
        const single = selected.length === 1;
        const redownload = await appConfirm({
            title: single ? '重新下载模型' : '部分模型已安装',
            message: single
                ? uiTf('「{id}」已下载。是否重新下载？', { id: installedIds[0] })
                : (
                    uiTf('其中 {n} 个已下载（{preview}）。\n\n', { n: installedIds.length, preview })
                    + '是否重新下载全部（含已安装）？\n'
                    + '选择「取消」将跳过已安装项，只下载未安装项。'
                ),
            primaryLabel: '重新下载',
            secondaryLabel: single ? '取消' : '跳过已安装',
        });
        if (redownload) {
            force = true;
        } else if (single) {
            setEngineStatusText('已取消重新下载', 'warn');
            return;
        } else {
            modelIds = selected.filter((m) => !m.installed).map((m) => m.id);
            if (!modelIds.length) {
                setEngineStatusText('已跳过全部已安装项，没有需要下载的模型', 'warn');
                return;
            }
        }
    }
    const wantDemucs = modelIds.includes(ENGINE_DEMUCS_MODEL_ID);
    modelIds = modelIds.filter((id) => id !== ENGINE_DEMUCS_MODEL_ID);
    if (wantDemucs && !modelIds.length) {
        await ensureEngineDemucs({ force, silent: false });
        return;
    }
    if (!modelIds.length) {
        setEngineStatusText('请点卡片上的「下载」获取模型', 'warn');
        return;
    }

    const byId = new Map(selected.map((m) => [m.id, m]));
    const managedIds = modelIds.filter((id) => isManagedLlmDownloadId(id, byId.get(id)?.source));
    const engineIds = modelIds.filter((id) => !isManagedLlmDownloadId(id, byId.get(id)?.source));

    // Managed LLM GGUF (non-Sakura) → Advanced pull; Sakura / Hub → engine download.
    if (managedIds.length && !engineIds.length && !wantDemucs) {
        await downloadManagedLlmModels(managedIds, { force });
        return;
    }
    if (managedIds.length && (engineIds.length || wantDemucs)) {
        const managedRes = await downloadManagedLlmModels(managedIds, { force });
        if (!managedRes?.ok) return managedRes;
        if (!engineIds.length && wantDemucs) {
            await ensureEngineDemucs({ force, silent: false });
            return;
        }
        modelIds = engineIds;
    }

    if (!electron?.transubEngineRunDownload) {
        appendLog('当前环境不支持引擎模型下载', 'err');
        setEngineStatusText('当前环境不支持引擎模型下载', 'err');
        return;
    }
    if (!modelIds.length) {
        if (wantDemucs) await ensureEngineDemucs({ force, silent: false });
        return;
    }

    const profile = els.engineProfileSelect?.value || 'balanced';
    const hfEndpoint = els.engineHfEndpointInput?.value.trim() || '';
    const hfToken = els.engineHfTokenInput?.value.trim() || '';
    setEngineDownloadActiveSource('engine');
    clearEngineDownloadLog();
    resetAppEngineDlProgressLog();
    setEngineDownloadBusy(true);
    setEngineDownloadProgressPct(0);
    setEngineDownloadProgressVisible(true, uiTf('正在下载：{ids}', { ids: modelIds.join(', ') }));
    appendEngineDownloadLog(
        `开始下载（档位 ${profile}${force ? ' · 强制重下' : ''}）：${modelIds.join(', ')}`,
    );
    appendLog(`开始下载模型：${modelIds.join(', ')}`, 'info');
    setEngineStatusText('正在下载模型…', 'busy');
    try {
        const res = await electron.transubEngineRunDownload({
            ...engineFormPayload(),
            kind: 'models',
            profile,
            modelIds,
            hfEndpoint,
            hfToken,
            force,
        });
        if (res?.ok) {
            const msg = res.message || '模型下载完成';
            setEngineDownloadProgressPct(100);
            setEngineDownloadProgressVisible(true, msg);
            appendEngineDownloadLog(msg);
            appendLog(msg, 'ok');
            setEngineStatusText(msg, 'ok');
            await refreshEngineModels({ silent: true });
            if (wantDemucs) {
                appendEngineDownloadLog('继续安装 Demucs（人声分离）…');
                await ensureEngineDemucs({ force, silent: false, assumeBusy: true });
            }
        } else if (res?.cancelled) {
            const msg = res.error || '已取消下载';
            setEngineDownloadProgressVisible(true, msg);
            appendEngineDownloadLog(msg);
            appendLog(msg, 'warn');
            setEngineStatusText(msg, 'warn');
        } else {
            const err = formatEngineDownloadError(res?.error || '模型下载失败');
            setEngineDownloadProgressVisible(true, err);
            appendEngineDownloadLog(err);
            appendLog(err, 'err');
            setEngineStatusText(err, 'err');
            setEngineDownloadBusy(false);
            const { kinds, hubIds } = classifyManualKindsForModelIds(modelIds);
            const singleHubId = modelIds.length === 1 && hubIds.includes(modelIds[0])
                ? modelIds[0]
                : '';
            const proceed = await appConfirm({
                title: '模型下载失败',
                message: singleHubId
                    ? `${String(err).slice(0, 500)}\n\n是否改为浏览器手动下载，并按说明放到引擎 models 目录？`
                    : `${String(err).slice(0, 500)}\n\n是否改为手动下载安装（运行库 .whl / 模型镜像）？`,
                primaryLabel: singleHubId ? '手动下载' : '手动下载安装',
                secondaryLabel: '取消',
            });
            if (proceed) {
                if (singleHubId) {
                    await manualEngineHubModelDownload(singleHubId);
                } else {
                    const manualKinds = kinds.length ? kinds : ['sensevoice', 'whisper'];
                    await manualEngineDownloadInstall({
                        modelIds: [...modelIds, ...(wantDemucs ? [ENGINE_DEMUCS_MODEL_ID] : [])],
                        kinds: manualKinds,
                    });
                }
            }
            return;
        }
    } catch (err) {
        const msg = formatEngineDownloadError(err?.message || String(err));
        setEngineDownloadProgressVisible(true, msg);
        appendEngineDownloadLog(msg);
        appendLog(msg, 'err');
        setEngineStatusText(msg, 'err');
        setEngineDownloadBusy(false);
        const { hubIds } = classifyManualKindsForModelIds(modelIds);
        const singleHubId = modelIds.length === 1 && hubIds.includes(modelIds[0])
            ? modelIds[0]
            : '';
        const proceed = await appConfirm({
            title: '模型下载失败',
            message: singleHubId
                ? `${String(msg).slice(0, 500)}\n\n是否改为浏览器手动下载，并按说明放到引擎 models 目录？`
                : `${String(msg).slice(0, 500)}\n\n是否改为手动下载安装？`,
            primaryLabel: singleHubId ? '手动下载' : '手动下载安装',
            secondaryLabel: '取消',
        });
        if (proceed) {
            if (singleHubId) {
                await manualEngineHubModelDownload(singleHubId);
            } else {
                await manualEngineDownloadInstall({
                    modelIds: [...modelIds, ...(wantDemucs ? [ENGINE_DEMUCS_MODEL_ID] : [])],
                });
            }
        }
        return;
    } finally {
        setEngineDownloadBusy(false);
    }
}


        return {
            applyDemucsProbe,
            applyGpuRuntimeProbe,
            buildManualGgufHint,
            buildManualHubModelHint,
            canManualEngineHubDownload,
            classifyManualKindsForModelIds,
            deleteEngineModel,
            downloadEngineModels,
            downloadManagedLlmModels,
            ensureEngineDemucs,
            ensureEngineGpuSupport,
            ensureEngineTorchCuda,
            formatEngineTestResultMessage,
            getEngineDownloadModelMeta,
            isManagedLlmDownloadId,
            manualDownloadDeps,
            manualEngineDownloadInstall,
            manualEngineHubModelDownload,
            manualManagedLlmDownload,
            maybePromptTorchCudaOnAsrSelect,
            openEngineHubModelFolder,
            openEngineModelHubLinks,
            promptTorchCudaMismatchBeforeBatch,
            refreshEngineDemucsStatus,
            refreshEngineGpuStatus,
            refreshEngineModels,
            refreshEngineStatus,
            refreshHardwareRecommend,
            scanAndReuseEngineCuda,
            setEngineGpuStatusText,
            showEngineTestResultDialog,
            verifyManualEngineHubModel,
            verifyManualManagedLlmModel,
        };
    }

    return { createEngineModelsWorkspace };
}));
