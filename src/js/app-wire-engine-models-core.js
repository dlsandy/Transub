/**
 * Domain wire: engine models cache / library / lab / missing / workspace.
 * install(host) assigns lazy getters + bound methods onto host.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAppWireEngineModels = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function appWireEngineModelsFactory(global) {
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

    const WORKSPACE_METHODS = [
        'refreshEngineModels',
        'setEngineGpuStatusText',
        'applyGpuRuntimeProbe',
        'ensureEngineTorchCuda',
        'promptTorchCudaMismatchBeforeBatch',
        'maybePromptTorchCudaOnAsrSelect',
        'refreshHardwareRecommend',
        'refreshEngineGpuStatus',
        'applyDemucsProbe',
        'refreshEngineDemucsStatus',
        'ensureEngineDemucs',
        'scanAndReuseEngineCuda',
        'ensureEngineGpuSupport',
        'formatEngineTestResultMessage',
        'showEngineTestResultDialog',
        'refreshEngineStatus',
        'getEngineDownloadModelMeta',
        'manualDownloadDeps',
        'isManagedLlmDownloadId',
        'canManualEngineHubDownload',
        'buildManualHubModelHint',
        'verifyManualEngineHubModel',
        'openEngineHubModelFolder',
        'manualEngineHubModelDownload',
        'classifyManualKindsForModelIds',
        'buildManualGgufHint',
        'verifyManualManagedLlmModel',
        'manualManagedLlmDownload',
        'openEngineModelHubLinks',
        'manualEngineDownloadInstall',
        'downloadManagedLlmModels',
        'deleteEngineModel',
        'downloadEngineModels',
    ];

    const CACHE_SHELL_METHODS = [
        'hasEngineModelsCacheInMemory',
        'getEngineModelsCacheMeta',
        'getCachedManagedCatalogSnapshot',
        'setCachedManagedCatalogSnapshot',
        'syncEngineModelsCacheBanner',
        'setEngineModelsBrowseOnly',
        'resolveEngineModelsBrowseOnly',
        'applyEngineModelsCacheSnapshot',
        'loadEngineModelsCacheFromDisk',
        'schedulePersistEngineModelsCache',
        'persistEngineModelsCacheNow',
        'ensureEngineModelsCacheApplied',
        'ensureEngineModelsCatalog',
        'explainEngineModelsMutateBlocked',
        'syncEngineModelsBrowseOnlyFromTaskState',
        'setEngineDownloadBusy',
        'clearEngineDownloadLog',
        'resetAppEngineDlProgressLog',
        'markEngineModelsCacheFresh',
        'appendEngineDownloadLog',
        'setEngineDownloadProgressPct',
        'formatEngineDownloadBytes',
        'formatEngineDownloadSpeed',
        'formatEngineDownloadSizeLine',
        'appendAppEngineDownloadProgressLog',
        'setEngineDownloadProgressVisible',
        'setEngineDownloadDrawerOpen',
    ];

    const LIBRARY_UI_METHODS = [
        'setEngineModelsLoadingVisible',
        'isEngineModelsLibraryOpen',
        'mountEngineModelsPanel',
        'syncEngineModelsLibraryDlStrip',
        'syncEngineModelsLibraryTabSummary',
        'openEngineModelsLibrary',
        'closeEngineModelsLibrary',
        'onFactoryModelsWorkspaceShow',
        'onFactoryModelsWorkspaceHide',
        'filteredEnginePickItems',
        'syncEngineModelPickSummary',
        'setEngineModelsFilter',
        'setEngineModelsStatusFilter',
        'setEngineModelsSearchQuery',
        'getEngineModelsFilter',
        'getEngineModelsStatusFilter',
        'getEngineModelsSearchQuery',
        'syncEngineModelsFilterCounts',
        'engineModelKindLabel',
        'formatEngineModelOptionLabel',
        'ensureSelectValue',
        'fillEngineModelSelect',
        'pickCatalogDeps',
        'normalizeEnginePickCatalog',
        'buildManagedLlmPickItems',
        'mergeManagedLlmIntoPickCatalog',
        'buildDemucsPickItem',
        'mergeDemucsPickItem',
        'engineModelGroupLabel',
        'renderEngineModelsList',
        'renderEngineModelsCards',
    ];

    /**
     * @param {object} host
     * @returns {object} host
     */
    function install(host) {
        const h = host || {};
        const {
            bindApiMethods,
            createLazyFactory,
            bindModuleMethodsWithLog,
        } = getBindApi();
        if (typeof createLazyFactory !== 'function' || typeof bindApiMethods !== 'function') {
            return h;
        }

        const engineModelsUi = h.engineModelsUi
            || (global && global.TransubEngineModelsUi)
            || {};
        const engineDlFmt = h.engineDlFmt
            || (global && global.TransubEngineDownloadFormat)
            || {};
        const manualDownloadApi = h.manualDownloadApi
            || (global && global.TransubEngineManualDownload)
            || {};
        const gpuTorchApi = h.gpuTorchApi
            || (global && global.TransubEngineGpuTorch)
            || {};
        const missingModelsApi = h.missingModelsApi
            || (global && global.TransubEngineMissingModels)
            || {};
        const settingsNormApi = h.settingsNormApi
            || (global && global.TransubSettingsOptionsNormalize)
            || {};
        const ENGINE_DEMUCS_MODEL_ID = h.ENGINE_DEMUCS_MODEL_ID || 'demucs';

        // --- workspace (bound first so refreshEngineModels exists for other deps) ---
        h.getEngineModelsWorkspace = createLazyFactory(
            () => resolveApi(h, 'engineModelsWorkspaceApi', 'TransubEngineModelsWorkspace').createEngineModelsWorkspace,
            () => ({
                electron: h.electron,
                els: h.els,
                engineModelsUi,
                manualDownloadApi,
                gpuTorchApi,
                getAdvancedEntitled: () => (typeof h.getAdvancedEntitled === 'function'
                    ? !!h.getAdvancedEntitled()
                    : !!h.advancedEntitled),
                getCachedEngineModels: () => (typeof h.getCachedEngineModels === 'function'
                    ? h.getCachedEngineModels()
                    : h.cachedEngineModels),
                setCachedEngineModels: (v) => {
                    if (typeof h.setCachedEngineModels === 'function') h.setCachedEngineModels(v);
                    else h.cachedEngineModels = v;
                },
                getCachedHardwareRecommend: () => (typeof h.getCachedHardwareRecommend === 'function'
                    ? h.getCachedHardwareRecommend()
                    : h.cachedHardwareRecommend),
                setCachedHardwareRecommend: (v) => {
                    if (typeof h.setCachedHardwareRecommend === 'function') h.setCachedHardwareRecommend(v);
                    else h.cachedHardwareRecommend = v;
                },
                appendLog: late(h, 'appendLog'),
                appendEngineDownloadLog: late(h, 'appendEngineDownloadLog'),
                uiTf: late(h, 'uiTf'),
                showToast: late(h, 'showToast'),
                appConfirm: late(h, 'appConfirm'),
                appConfirmChoice: late(h, 'appConfirmChoice'),
                setBadge: late(h, 'setBadge'),
                openAppSettings: late(h, 'openAppSettings'),
                engineFormPayload: late(h, 'engineFormPayload'),
                formatEngineDownloadError: late(h, 'formatEngineDownloadError'),
                setEngineStatusText: late(h, 'setEngineStatusText'),
                setEngineDownloadBusy: late(h, 'setEngineDownloadBusy'),
                setEngineDownloadProgressPct: late(h, 'setEngineDownloadProgressPct'),
                setEngineDownloadProgressVisible: late(h, 'setEngineDownloadProgressVisible'),
                clearEngineDownloadLog: late(h, 'clearEngineDownloadLog'),
                resetAppEngineDlProgressLog: late(h, 'resetAppEngineDlProgressLog'),
                markEngineModelsCacheFresh: late(h, 'markEngineModelsCacheFresh'),
                setEngineModelsBrowseOnly: late(h, 'setEngineModelsBrowseOnly'),
                hasEngineModelsCacheInMemory: late(h, 'hasEngineModelsCacheInMemory'),
                ensureEngineModelsCacheApplied: late(h, 'ensureEngineModelsCacheApplied'),
                loadEngineModelsCacheFromDisk: late(h, 'loadEngineModelsCacheFromDisk'),
                schedulePersistEngineModelsCache: late(h, 'schedulePersistEngineModelsCache'),
                setCachedManagedCatalogSnapshot: late(h, 'setCachedManagedCatalogSnapshot'),
                syncEngineModelsCacheBanner: late(h, 'syncEngineModelsCacheBanner'),
                syncEngineModelsLibraryDlStrip: late(h, 'syncEngineModelsLibraryDlStrip'),
                syncEngineModelsLibraryTabSummary: late(h, 'syncEngineModelsLibraryTabSummary'),
                resolveEngineModelsBrowseOnly: late(h, 'resolveEngineModelsBrowseOnly'),
                explainEngineModelsMutateBlocked: late(h, 'explainEngineModelsMutateBlocked'),
                isEngineModelsLibraryOpen: late(h, 'isEngineModelsLibraryOpen'),
                renderEngineModelsList: late(h, 'renderEngineModelsList'),
                renderEngineModelsCards: late(h, 'renderEngineModelsCards'),
                fillEngineModelSelect: late(h, 'fillEngineModelSelect'),
                syncExpertExtraChipsUi: late(h, 'syncExpertExtraChipsUi'),
                syncExpertQuickModelSelects: late(h, 'syncExpertQuickModelSelects'),
                syncMtModelChipUi: late(h, 'syncMtModelChipUi'),
                syncSmartTranslateReadinessUi: late(h, 'syncSmartTranslateReadinessUi'),
                syncTranslateChipUi: late(h, 'syncTranslateChipUi'),
                rebuildTranslateMenuMtSection: late(h, 'rebuildTranslateMenuMtSection'),
                setCachedSmartTranslatePick: (v) => {
                    if (typeof h.setCachedSmartTranslatePick === 'function') h.setCachedSmartTranslatePick(v);
                    else h.cachedSmartTranslatePick = v;
                },
                updateAsrRecommendChip: late(h, 'updateAsrRecommendChip'),
                updateEnvBanner: late(h, 'updateEnvBanner'),
                updateReadinessStrip: late(h, 'updateReadinessStrip'),
                readLlmMtModelFromForm: late(h, 'readLlmMtModelFromForm'),
                readOpusMtModelFromForm: late(h, 'readOpusMtModelFromForm'),
                buildIntlAwareLlmMtFilter: late(h, 'buildIntlAwareLlmMtFilter'),
                buildIntlAwareLlmMtDisableReason: late(h, 'buildIntlAwareLlmMtDisableReason'),
                isLlmInferencePickModelId: late(h, 'isLlmInferencePickModelId'),
                isSakuraMtModelId: late(h, 'isSakuraMtModelId'),
                getManagedLlmCatalogApi: late(h, 'getManagedLlmCatalogApi'),
                buildManagedLlmPickItems: late(h, 'buildManagedLlmPickItems'),
                mergeManagedInstalledIntoEngineModels: engineModelsUi.mergeManagedInstalledIntoEngineModels,
                mergeDemucsPickItem: late(h, 'mergeDemucsPickItem'),
                findManagedLlmCatalogEntry: late(h, 'findManagedLlmCatalogEntry'),
                buildDeleteModelConfirmCopy: engineModelsUi.buildDeleteModelConfirmCopy,
                explainDeleteBlockedForPickItem: engineModelsUi.explainDeleteBlockedForPickItem,
                isDemucsFullyReady: engineModelsUi.isDemucsFullyReady,
                isDemucsRuntimeUsable: engineModelsUi.isDemucsRuntimeUsable,
                ENGINE_DEMUCS_MODEL_ID,
                getEngineModelsBusy: () => (typeof h.getEngineModelsBusy === 'function'
                    ? h.getEngineModelsBusy()
                    : !!h.engineModelsBusy),
                getEngineModelsBusyKind: () => (typeof h.getEngineModelsBusyKind === 'function'
                    ? h.getEngineModelsBusyKind()
                    : h.engineModelsBusyKind),
                setEngineModelsBusyKind: (v) => {
                    if (typeof h.setEngineModelsBusyKind === 'function') h.setEngineModelsBusyKind(v);
                    else h.engineModelsBusyKind = v;
                },
                getEngineModelsBrowseOnly: () => (typeof h.getEngineModelsBrowseOnly === 'function'
                    ? h.getEngineModelsBrowseOnly()
                    : !!h.engineModelsBrowseOnly),
                getCachedEnginePickCatalog: () => (typeof h.getCachedEnginePickCatalog === 'function'
                    ? h.getCachedEnginePickCatalog()
                    : h.cachedEnginePickCatalog),
                setCachedEnginePickCatalog: (v) => {
                    if (typeof h.setCachedEnginePickCatalog === 'function') h.setCachedEnginePickCatalog(v);
                    else h.cachedEnginePickCatalog = Array.isArray(v) ? v : [];
                },
                setEngineDownloadActiveSource: (v) => {
                    if (typeof h.setEngineDownloadActiveSource === 'function') h.setEngineDownloadActiveSource(v);
                    else h.engineDownloadActiveSource = v;
                },
                getCachedDemucsProbe: () => (typeof h.getCachedDemucsProbe === 'function'
                    ? h.getCachedDemucsProbe()
                    : h.cachedDemucsProbe),
                setCachedDemucsProbe: (v) => {
                    if (typeof h.setCachedDemucsProbe === 'function') h.setCachedDemucsProbe(v);
                    else h.cachedDemucsProbe = v || null;
                },
            }),
        );

        Object.assign(h, bindModuleMethodsWithLog(h.getEngineModelsWorkspace, WORKSPACE_METHODS, {
            missingMessage: '引擎模型核心未加载（engine-models-workspace）',
            appendLog: (...a) => (typeof h.appendLog === 'function' ? h.appendLog(...a) : undefined),
        }));

        // --- library UI ---
        h.getEngineModelsLibraryUi = createLazyFactory(
            () => resolveApi(h, 'engineModelsLibraryUiApi', 'TransubEngineModelsLibraryUi').createEngineModelsLibraryUi,
            () => ({
                els: h.els,
                state: h.state,
                engineModelsUi,
                esc: late(h, 'esc'),
                uiTf: late(h, 'uiTf'),
                getIsStandaloneSettings: () => (typeof h.getIsStandaloneSettings === 'function'
                    ? !!h.getIsStandaloneSettings()
                    : !!h.isStandaloneSettings),
                getAdvancedEntitled: () => (typeof h.getAdvancedEntitled === 'function'
                    ? !!h.getAdvancedEntitled()
                    : !!h.advancedEntitled),
                getEngineModelsBusy: () => (typeof h.getEngineModelsBusy === 'function'
                    ? h.getEngineModelsBusy()
                    : !!h.engineModelsBusy),
                getEngineModelsBusyKind: () => (typeof h.getEngineModelsBusyKind === 'function'
                    ? h.getEngineModelsBusyKind()
                    : h.engineModelsBusyKind),
                getEngineModelsBrowseOnly: () => (typeof h.getEngineModelsBrowseOnly === 'function'
                    ? h.getEngineModelsBrowseOnly()
                    : !!h.engineModelsBrowseOnly),
                getCachedEnginePickCatalog: () => (typeof h.getCachedEnginePickCatalog === 'function'
                    ? h.getCachedEnginePickCatalog()
                    : h.cachedEnginePickCatalog),
                setCachedEnginePickCatalog: (v) => {
                    if (typeof h.setCachedEnginePickCatalog === 'function') h.setCachedEnginePickCatalog(v);
                    else h.cachedEnginePickCatalog = Array.isArray(v) ? v : [];
                },
                setCachedManagedLabModels: late(h, 'setCachedManagedLabModels'),
                getCachedDemucsProbe: () => (typeof h.getCachedDemucsProbe === 'function'
                    ? h.getCachedDemucsProbe()
                    : h.cachedDemucsProbe),
                ENGINE_DEMUCS_MODEL_ID,
                setFactoryWorkspace: late(h, 'setFactoryWorkspace'),
                openParamsModal: late(h, 'openParamsModal'),
                switchParamsTab: late(h, 'switchParamsTab'),
                readEngineBackendFromForm: late(h, 'readEngineBackendFromForm'),
                refreshEngineStatus: (...a) => h.refreshEngineStatus(...a),
                ensureEngineModelsCatalog: (...a) => h.ensureEngineModelsCatalog(...a),
                resolveEngineModelsBrowseOnly: late(h, 'resolveEngineModelsBrowseOnly'),
                ensureEngineModelsCacheApplied: late(h, 'ensureEngineModelsCacheApplied'),
                setEngineModelsBrowseOnly: late(h, 'setEngineModelsBrowseOnly'),
                hasEngineModelsCacheInMemory: late(h, 'hasEngineModelsCacheInMemory'),
                syncEngineModelsCacheBanner: late(h, 'syncEngineModelsCacheBanner'),
                clearStaleComputeBusyIfNeeded: late(h, 'clearStaleComputeBusyIfNeeded'),
                syncComputeBusyFromMain: late(h, 'syncComputeBusyFromMain'),
                appendLog: late(h, 'appendLog'),
                showToast: late(h, 'showToast'),
                isSakuraMtModelId: late(h, 'isSakuraMtModelId'),
                findManagedLlmCatalogEntry: late(h, 'findManagedLlmCatalogEntry'),
                getManagedLlmCatalogApi: late(h, 'getManagedLlmCatalogApi'),
                isManagedLlmDownloadId: late(h, 'isManagedLlmDownloadId'),
                canManualEngineHubDownload: late(h, 'canManualEngineHubDownload'),
                explainEngineModelsMutateBlocked: late(h, 'explainEngineModelsMutateBlocked'),
                markEngineModelsRefreshed: () => {
                    if (typeof h.markEngineModelsRefreshed === 'function') h.markEngineModelsRefreshed();
                    else h.lastEngineModelsRefreshAt = Date.now();
                },
                getHardwareBudget: () => {
                    if (typeof h.getHardwareBudget === 'function') return h.getHardwareBudget();
                    const vramMb = Number((typeof h.getCachedHardwareRecommend === 'function'
                        ? h.getCachedHardwareRecommend()
                        : h.cachedHardwareRecommend)?.vramMb || 0);
                    let systemMemoryGb = 0;
                    try {
                        const n = Number(typeof navigator !== 'undefined' ? navigator?.deviceMemory : 0);
                        if (Number.isFinite(n) && n > 0) systemMemoryGb = n;
                    } catch (_) { /* ignore */ }
                    return {
                        systemMemoryGb,
                        vramGb: vramMb > 0 ? vramMb / 1024 : 0,
                    };
                },
            }),
        );

        Object.assign(h, bindApiMethods(h.getEngineModelsLibraryUi, LIBRARY_UI_METHODS, {
            engineModelKindLabel: (v) => v || '',
            formatEngineModelOptionLabel: (v) => v || '',
            filteredEnginePickItems: (v) => v || [],
            engineModelGroupLabel: (v) => v || '',
        }));

        // --- lab UI ---
        h.getEngineModelsLabUi = createLazyFactory(
            () => resolveApi(h, 'engineModelsLabUiApi', 'TransubEngineModelsLabUi').createEngineModelsLabUi,
            () => ({
                els: h.els,
                electron: h.electron,
                esc: late(h, 'esc'),
                showToast: late(h, 'showToast'),
                getAdvancedEntitled: () => (typeof h.getAdvancedEntitled === 'function'
                    ? !!h.getAdvancedEntitled()
                    : !!h.advancedEntitled),
                promptProUnlockRequired: late(h, 'promptProUnlockRequired'),
                getManagedLlmCatalogApi: late(h, 'getManagedLlmCatalogApi'),
                setCachedManagedLabModels: late(h, 'setCachedManagedLabModels'),
                refreshEngineModels: (...a) => h.refreshEngineModels(...a),
                setEngineModelsStatusFilter: late(h, 'setEngineModelsStatusFilter'),
                downloadManagedLlmModels: (...a) => h.downloadManagedLlmModels(...a),
            }),
        );

        h.bindEngineModelsLabUi = (...args) => {
            const ui = h.getEngineModelsLabUi();
            if (!ui?.bindEngineModelsLabUi) {
                if (typeof h.appendLog === 'function') {
                    h.appendLog('模型实验室界面核心未加载（engine-models-lab-ui）', 'err');
                }
                return;
            }
            return ui.bindEngineModelsLabUi(...args);
        };

        Object.assign(h, bindApiMethods(h.getEngineModelsLabUi, [
            'setEngineModelsLabModalOpen',
            'openEngineModelsLab',
            'refreshEngineModelsLabList',
        ]));

        // --- cache shell ---
        h.getEngineModelsCacheShell = createLazyFactory(
            () => resolveApi(h, 'engineModelsCacheShellApi', 'TransubEngineModelsCacheShell').createEngineModelsCacheShell,
            () => ({
                els: h.els,
                state: h.state,
                electron: h.electron,
                engineModelsCacheApi: (global && global.TransubEngineModelsCache) || {},
                engineModelsUi,
                engineDlFmt,
                getEngineModelsBrowseOnly: () => (typeof h.getEngineModelsBrowseOnly === 'function'
                    ? h.getEngineModelsBrowseOnly()
                    : !!h.engineModelsBrowseOnly),
                setEngineModelsBrowseOnlyFlag: (v) => {
                    if (typeof h.setEngineModelsBrowseOnlyFlag === 'function') h.setEngineModelsBrowseOnlyFlag(v);
                    else h.engineModelsBrowseOnly = !!v;
                },
                getEngineModelsBusy: () => (typeof h.getEngineModelsBusy === 'function'
                    ? h.getEngineModelsBusy()
                    : !!h.engineModelsBusy),
                setEngineModelsBusy: (v) => {
                    if (typeof h.setEngineModelsBusy === 'function') h.setEngineModelsBusy(v);
                    else h.engineModelsBusy = !!v;
                },
                getEngineModelsBusyKind: () => (typeof h.getEngineModelsBusyKind === 'function'
                    ? h.getEngineModelsBusyKind()
                    : h.engineModelsBusyKind),
                setEngineModelsBusyKind: (v) => {
                    if (typeof h.setEngineModelsBusyKind === 'function') h.setEngineModelsBusyKind(v);
                    else h.engineModelsBusyKind = v;
                },
                getCachedEngineModels: () => (typeof h.getCachedEngineModels === 'function'
                    ? h.getCachedEngineModels()
                    : h.cachedEngineModels),
                setCachedEngineModels: (v) => {
                    if (typeof h.setCachedEngineModels === 'function') h.setCachedEngineModels(v);
                    else h.cachedEngineModels = Array.isArray(v) ? v : [];
                },
                getCachedEnginePickCatalog: () => (typeof h.getCachedEnginePickCatalog === 'function'
                    ? h.getCachedEnginePickCatalog()
                    : h.cachedEnginePickCatalog),
                setCachedEnginePickCatalog: (v) => {
                    if (typeof h.setCachedEnginePickCatalog === 'function') h.setCachedEnginePickCatalog(v);
                    else h.cachedEnginePickCatalog = Array.isArray(v) ? v : [];
                },
                getCachedDemucsProbe: () => (typeof h.getCachedDemucsProbe === 'function'
                    ? h.getCachedDemucsProbe()
                    : h.cachedDemucsProbe),
                setCachedDemucsProbe: (v) => {
                    if (typeof h.setCachedDemucsProbe === 'function') h.setCachedDemucsProbe(v);
                    else h.cachedDemucsProbe = v || null;
                },
                setCachedManagedLabModels: late(h, 'setCachedManagedLabModels'),
                setEngineDownloadActiveSource: (v) => {
                    if (typeof h.setEngineDownloadActiveSource === 'function') h.setEngineDownloadActiveSource(v);
                    else h.engineDownloadActiveSource = v;
                },
                getCachedSmartTranslatePick: () => (typeof h.getCachedSmartTranslatePick === 'function'
                    ? h.getCachedSmartTranslatePick()
                    : h.cachedSmartTranslatePick),
                setCachedSmartTranslatePick: (v) => {
                    if (typeof h.setCachedSmartTranslatePick === 'function') h.setCachedSmartTranslatePick(v);
                    else h.cachedSmartTranslatePick = v;
                },
                isEngineModelsLibraryOpen: late(h, 'isEngineModelsLibraryOpen'),
                renderEngineModelsCards: late(h, 'renderEngineModelsCards'),
                renderEngineModelsList: late(h, 'renderEngineModelsList'),
                normalizeEnginePickCatalog: late(h, 'normalizeEnginePickCatalog'),
                fillEngineModelSelect: late(h, 'fillEngineModelSelect'),
                syncEngineModelsLibraryTabSummary: late(h, 'syncEngineModelsLibraryTabSummary'),
                syncEngineModelsLibraryDlStrip: late(h, 'syncEngineModelsLibraryDlStrip'),
                syncExpertQuickModelSelects: late(h, 'syncExpertQuickModelSelects'),
                readOpusMtModelFromForm: late(h, 'readOpusMtModelFromForm'),
                readLlmMtModelFromForm: late(h, 'readLlmMtModelFromForm'),
                buildIntlAwareLlmMtFilter: late(h, 'buildIntlAwareLlmMtFilter'),
                buildIntlAwareLlmMtDisableReason: late(h, 'buildIntlAwareLlmMtDisableReason'),
                isLlmInferencePickModelId: late(h, 'isLlmInferencePickModelId'),
                readEngineBackendFromForm: late(h, 'readEngineBackendFromForm'),
                refreshEngineModels: (...a) => h.refreshEngineModels(...a),
                getIsStandaloneSettings: () => (typeof h.getIsStandaloneSettings === 'function'
                    ? !!h.getIsStandaloneSettings()
                    : !!h.isStandaloneSettings),
                ensureLogExpanded: late(h, 'ensureLogExpanded'),
                scrollMainLogPanel: late(h, 'scrollMainLogPanel'),
                updateFactoryStatusLogFromHost: late(h, 'updateFactoryStatusLogFromHost'),
                LOG_DOM_MAX: h.LOG_DOM_MAX || 100,
            }),
        );

        Object.assign(h, bindApiMethods(h.getEngineModelsCacheShell, CACHE_SHELL_METHODS, {
            hasEngineModelsCacheInMemory: (v) => !!v,
            resolveEngineModelsBrowseOnly: (v) => !!v,
            applyEngineModelsCacheSnapshot: (v) => !!v,
            loadEngineModelsCacheFromDisk: (v) => v || { ok: false, empty: true },
            persistEngineModelsCacheNow: (v) => v || { ok: false },
            ensureEngineModelsCacheApplied: (v) => !!v,
            ensureEngineModelsCatalog: (v) => v || { ok: false },
            explainEngineModelsMutateBlocked: (v) => v || '字幕任务进行中，请结束后再下载 / 删除 / 刷新模型',
            formatEngineDownloadBytes: (v) => v || '',
            formatEngineDownloadSpeed: (v) => v || '',
            formatEngineDownloadSizeLine: (v) => v || '',
        }));

        // --- missing models ---
        h.missingModelsCtx = function missingModelsCtx() {
            const profileApi = (global && global.TransubContentProfile) || {};
            const routeApi = (global && global.TransubMtTargetRoute) || {};
            const els = h.els || {};
            const state = h.state || {};
            const targetForm = settingsNormApi.normalizeSubtitleTargetFormValue
                ? settingsNormApi.normalizeSubtitleTargetFormValue(
                    els.quickTargetLangSelect?.value
                    || els.chineseSubtitleVariantSelect?.value
                    || 'simplified',
                )
                : String(els.chineseSubtitleVariantSelect?.value || 'simplified');
            const subtitleTargetLang = settingsNormApi.normalizeSubtitleTargetLang
                ? settingsNormApi.normalizeSubtitleTargetLang(targetForm, 'simplified')
                : ((global && global.TransubSubtitleTargetLang)?.targetLangFromFormValue?.(targetForm) || 'zh-Hans');
            const cached = typeof h.getCachedEngineModels === 'function'
                ? h.getCachedEngineModels()
                : h.cachedEngineModels;
            return {
                task: typeof h.readTaskFromForm === 'function' ? h.readTaskFromForm() : '',
                translateMode: typeof h.readTranslateModeFromForm === 'function' ? h.readTranslateModeFromForm() : '',
                explicitOpusMtId: typeof h.readOpusMtModelFromForm === 'function' ? h.readOpusMtModelFromForm() : '',
                formLang: els.languageSelect?.value || '',
                subtitleTargetLang,
                targetLang: subtitleTargetLang,
                selectedItems: (state.items || []).filter((i) => i?.selected !== false),
                cachedEngineModels: cached,
                asrModelId: els.engineAsrModelSelect?.value || '',
                skipAsrModels: (() => {
                    const sel = (state.items || []).filter((i) => i?.selected && i.status !== 'error');
                    return sel.length > 0 && sel.every((i) => !!(
                        i?.skipAsr || i?.shelfEntryStage || i?.shelfOptionOverrides?.skipAsr
                    ));
                })(),
                opusMtByLang: profileApi?.OPUS_MT_BY_LANG,
                opusMtByPair: routeApi?.OPUS_MT_BY_PAIR,
                normalizeSenseLang: profileApi?.normalizeSenseLang,
                isSakuraMtModelId: late(h, 'isSakuraMtModelId'),
                isLlmInferenceMtModel: (id) => !!(global && global.TransubSakuraMtCatalog)?.isLlmInferenceMtModel?.(id),
            };
        };

        h.resolveExpectedOpusMtModelIds = function resolveExpectedOpusMtModelIds() {
            if (missingModelsApi.resolveExpectedOpusMtModelIds) {
                return missingModelsApi.resolveExpectedOpusMtModelIds(h.missingModelsCtx());
            }
            return [];
        };

        h.anyCommonOpusMtInstalled = function anyCommonOpusMtInstalled() {
            const cached = typeof h.getCachedEngineModels === 'function'
                ? h.getCachedEngineModels()
                : h.cachedEngineModels;
            if (missingModelsApi.anyCommonOpusMtInstalled) {
                return missingModelsApi.anyCommonOpusMtInstalled(cached);
            }
            return false;
        };

        h.warnIfSelectedEngineModelsMissing = function warnIfSelectedEngineModelsMissing() {
            if (missingModelsApi.warnIfSelectedEngineModelsMissing) {
                return missingModelsApi.warnIfSelectedEngineModelsMissing(h.missingModelsCtx());
            }
            return '';
        };

        h.getMissingModelsPrompt = function getMissingModelsPrompt() {
            const api = resolveApi(h, 'missingModelsPromptApi', 'TransubMissingModelsPrompt');
            if (!api.createMissingModelsPrompt) return null;
            return api.createMissingModelsPrompt({
                missingModelsApi,
                engineModelsUi,
                refreshEngineModels: (...a) => h.refreshEngineModels(...a),
                ensureEngineModelsCatalog: (...a) => h.ensureEngineModelsCatalog(...a),
                getCachedEngineModels: () => (typeof h.getCachedEngineModels === 'function'
                    ? h.getCachedEngineModels()
                    : h.cachedEngineModels),
                getCachedEnginePickCatalog: () => (typeof h.getCachedEnginePickCatalog === 'function'
                    ? h.getCachedEnginePickCatalog()
                    : h.cachedEnginePickCatalog),
                appConfirm: late(h, 'appConfirm'),
                appConfirmChoice: late(h, 'appConfirmChoice'),
                resolveParamsTab: late(h, 'resolveParamsTab'),
                openAppSettings: late(h, 'openAppSettings'),
                uiTf: late(h, 'uiTf'),
                getContentProfileApi: () => (global && global.TransubContentProfile) || null,
                refreshEngineDemucsStatus: (...a) => h.refreshEngineDemucsStatus(...a),
                getSenseBaseOptions: late(h, 'getSenseBaseOptions'),
                readTranslateModeFromForm: late(h, 'readTranslateModeFromForm'),
                getAdvancedEntitled: () => (typeof h.getAdvancedEntitled === 'function'
                    ? !!h.getAdvancedEntitled()
                    : !!h.advancedEntitled),
                appendLog: late(h, 'appendLog'),
                showToast: late(h, 'showToast'),
                downloadEngineModels: (...a) => h.downloadEngineModels(...a),
                setEngineModelsFilter: late(h, 'setEngineModelsFilter'),
                renderEngineModelsCards: late(h, 'renderEngineModelsCards'),
                ensureEngineDemucs: (...a) => h.ensureEngineDemucs(...a),
            });
        };

        h.ensureRequiredModelsReadyOrPrompt = async function ensureRequiredModelsReadyOrPrompt(opts) {
            const api = h.getMissingModelsPrompt();
            if (!api?.ensureRequiredModelsReadyOrPrompt) return true;
            return api.ensureRequiredModelsReadyOrPrompt(opts);
        };

        h.collectAdoptedSenseSupportGaps = async function collectAdoptedSenseSupportGaps(selectedItems = []) {
            const api = h.getMissingModelsPrompt();
            if (!api?.collectAdoptedSenseSupportGaps) return [];
            return api.collectAdoptedSenseSupportGaps(selectedItems);
        };

        h.promptInstallSenseSupportGaps = async function promptInstallSenseSupportGaps(missing = []) {
            const api = h.getMissingModelsPrompt();
            if (!api?.promptInstallSenseSupportGaps) return 'cancel';
            return api.promptInstallSenseSupportGaps(missing);
        };

        h.installSenseSupportGaps = async function installSenseSupportGaps(missing = []) {
            const api = h.getMissingModelsPrompt();
            if (!api?.installSenseSupportGaps) return;
            return api.installSenseSupportGaps(missing);
        };

        return h;
    }

    return { install, WORKSPACE_METHODS, CACHE_SHELL_METHODS, LIBRARY_UI_METHODS };
}));
