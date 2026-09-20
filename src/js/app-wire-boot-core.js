/**
 * Domain wire: events binder / app init / live-batch rehydrate / boot helpers.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAppWireBoot = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function appWireBootFactory(global) {
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

    /**
     * @param {object} host
     * @returns {object} host
     */
    function install(host) {
        const h = host || {};
        const { createLazyFactory } = getBindApi();
        if (typeof createLazyFactory !== 'function') return h;

        h.getAppEventsBinder = createLazyFactory(
            () => resolveApi(h, 'appEventsBinderApi', 'TransubAppEventsBinder').createAppEventsBinder,
            () => ({
                electron: h.electron,
                els: h.els,
                state: h.state,
                audioMutexApi: h.audioMutexApi || (global && global.TransubAudioMutex) || {},
                GITHUB_ISSUES_URL: h.GITHUB_ISSUES_URL,
                getIsStandaloneSettings: () => (typeof h.getIsStandaloneSettings === 'function'
                    ? !!h.getIsStandaloneSettings()
                    : !!h.isStandaloneSettings),
                getAdvancedEntitled: () => (typeof h.getAdvancedEntitled === 'function'
                    ? !!h.getAdvancedEntitled()
                    : !!h.advancedEntitled),
                getSettingsFormDirty: () => (typeof h.getSettingsFormDirty === 'function'
                    ? !!h.getSettingsFormDirty()
                    : !!h.settingsFormDirty),
                getEngineDownloadActiveSource: () => (typeof h.getEngineDownloadActiveSource === 'function'
                    ? h.getEngineDownloadActiveSource()
                    : h.engineDownloadActiveSource),
                getEngineModelsBrowseOnly: () => (typeof h.getEngineModelsBrowseOnly === 'function'
                    ? !!h.getEngineModelsBrowseOnly()
                    : !!h.engineModelsBrowseOnly),
                getEngineModelsBusy: () => (typeof h.getEngineModelsBusy === 'function'
                    ? !!h.getEngineModelsBusy()
                    : !!h.engineModelsBusy),
                getCachedEngineModels: () => (typeof h.getCachedEngineModels === 'function'
                    ? h.getCachedEngineModels()
                    : h.cachedEngineModels),
                getCachedHardwareRecommend: () => (typeof h.getCachedHardwareRecommend === 'function'
                    ? h.getCachedHardwareRecommend()
                    : h.cachedHardwareRecommend),
                setAsrRecommendDismissedKey: (v) => {
                    if (typeof h.setAsrRecommendDismissedKey === 'function') h.setAsrRecommendDismissedKey(v);
                    else h.asrRecommendDismissedKey = v;
                },
                setSavedOptionsSnapshot: (v) => {
                    if (typeof h.setSavedOptionsSnapshot === 'function') h.setSavedOptionsSnapshot(v);
                    else h.savedOptionsSnapshot = v;
                },
                setInsertSoftwareCreditIsDefault: (v) => {
                    if (typeof h.setInsertSoftwareCreditIsDefault === 'function') {
                        h.setInsertSoftwareCreditIsDefault(v);
                    } else h.insertSoftwareCreditIsDefault = v;
                },
                bindAutoScanSettingsUi: late(h, 'bindAutoScanSettingsUi'),
                bindListActions: late(h, 'bindListActions'),
                setupDragDrop: late(h, 'setupDragDrop'),
                bindPostTaskMenu: late(h, 'bindPostTaskMenu'),
                bindAddMenu: late(h, 'bindAddMenu'),
                bindMainUiExtras: late(h, 'bindMainUiExtras'),
                bindClearListMenu: late(h, 'bindClearListMenu'),
                ensureJobRuntimeScripts: late(h, 'ensureJobRuntimeScripts'),
                startSubtitleGeneration: (...a) => h.startSubtitleGeneration(...a),
                openTranslateStylePickerModal: late(h, 'openTranslateStylePickerModal'),
                setTranslateStyleMenuOpen: late(h, 'setTranslateStyleMenuOpen'),
                getTranslateStyleMenuOpen: late(h, 'getTranslateStyleMenuOpen'),
                applyTranslateStyleEnabled: late(h, 'applyTranslateStyleEnabled'),
                applyTranslateStylePreset: late(h, 'applyTranslateStylePreset'),
                applyTranslateStyleMenuCustomNote: late(h, 'applyTranslateStyleMenuCustomNote'),
                openTranslateStyleSettings: late(h, 'openTranslateStyleSettings'),
                syncTranslateStyleChipUi: late(h, 'syncTranslateStyleChipUi'),
                setTranslateStyleEnabledState: late(h, 'setTranslateStyleEnabledState'),
                bindTranslateStyleChipEvents: late(h, 'bindTranslateStyleChipEvents'),
                bindComboPlansUi: late(h, 'bindComboPlansUi'),
                closeRetranslateModal: late(h, 'closeRetranslateModal'),
                runRetranslateFromModal: late(h, 'runRetranslateFromModal'),
                syncRetranslateModalModelUi: late(h, 'syncRetranslateModalModelUi'),
                renderList: late(h, 'renderList'),
                updateStartButton: late(h, 'updateStartButton'),
                focusTaskFromSelection: late(h, 'focusTaskFromSelection'),
                applyTaskSelection: late(h, 'applyTaskSelection'),
                toggleTaskSelectAll: late(h, 'toggleTaskSelectAll'),
                applyUiPrefs: late(h, 'applyUiPrefs'),
                hydrateAppThemeFromMain: late(h, 'hydrateAppThemeFromMain'),
                syncLocalThemeKeys: late(h, 'syncLocalThemeKeys'),
                saveParamsSettings: late(h, 'saveParamsSettings'),
                bindResourceUsageSetting: late(h, 'bindResourceUsageSetting'),
                syncResourceUsageMonitor: late(h, 'syncResourceUsageMonitor'),
                showToast: late(h, 'showToast'),
                openAppSettings: late(h, 'openAppSettings'),
                closeParamsModal: late(h, 'closeParamsModal'),
                bindSettingsTips: late(h, 'bindSettingsTips'),
                bindSettingsSearch: late(h, 'bindSettingsSearch'),
                bindSettingsGuideLinks: late(h, 'bindSettingsGuideLinks'),
                closeAllSettingsTips: late(h, 'closeAllSettingsTips'),
                switchParamsTab: late(h, 'switchParamsTab'),
                persistFormOptionsQuiet: late(h, 'persistFormOptionsQuiet'),
                openParamsModal: late(h, 'openParamsModal'),
                openEngineModelsLibrary: late(h, 'openEngineModelsLibrary'),
                applyOptionsToForm: late(h, 'applyOptionsToForm'),
                buildSavedOptionsFromForm: late(h, 'buildSavedOptionsFromForm'),
                markSettingsDirty: late(h, 'markSettingsDirty'),
                updateParamsSummary: late(h, 'updateParamsSummary'),
                testInstall: late(h, 'testInstall'),
                checkTransWithAiEngineUpdate: late(h, 'checkTransWithAiEngineUpdate'),
                browseInstallPath: late(h, 'browseInstallPath'),
                syncEngineBackendUi: late(h, 'syncEngineBackendUi'),
                updateEnvBanner: late(h, 'updateEnvBanner'),
                readEngineBackendFromForm: late(h, 'readEngineBackendFromForm'),
                refreshEngineModels: (...a) => h.refreshEngineModels(...a),
                ensureEngineModelsCatalog: (...a) => h.ensureEngineModelsCatalog(...a),
                refreshEngineStatus: (...a) => h.refreshEngineStatus(...a),
                setEngineStatusText: late(h, 'setEngineStatusText'),
                uiTf: late(h, 'uiTf'),
                getEngineEnvUi: late(h, 'getEngineEnvUi'),
                setNetworkHfStatus: late(h, 'setNetworkHfStatus'),
                setNetworkGithubMirrorStatus: late(h, 'setNetworkGithubMirrorStatus'),
                readProxyOptionsFromForm: late(h, 'readProxyOptionsFromForm'),
                syncProxySettingsUi: late(h, 'syncProxySettingsUi'),
                setProxyTestStatus: late(h, 'setProxyTestStatus'),
                syncTransubStationSettingsUi: late(h, 'syncTransubStationSettingsUi'),
                setTransubStationStatus: late(h, 'setTransubStationStatus'),
                appendLog: late(h, 'appendLog'),
                showEngineTestResultDialog: (...a) => h.showEngineTestResultDialog(...a),
                appendEngineDownloadLog: late(h, 'appendEngineDownloadLog'),
                setEngineDownloadProgressVisible: late(h, 'setEngineDownloadProgressVisible'),
                setEngineModelsFilter: late(h, 'setEngineModelsFilter'),
                setEngineModelsStatusFilter: late(h, 'setEngineModelsStatusFilter'),
                setEngineDownloadDrawerOpen: late(h, 'setEngineDownloadDrawerOpen'),
                setEngineModelsSearchQuery: late(h, 'setEngineModelsSearchQuery'),
                renderEngineModelsCards: late(h, 'renderEngineModelsCards'),
                bindEngineModelsLabUi: late(h, 'bindEngineModelsLabUi'),
                explainEngineModelsMutateBlocked: late(h, 'explainEngineModelsMutateBlocked'),
                downloadEngineModels: (...a) => h.downloadEngineModels(...a),
                deleteEngineModel: (...a) => h.deleteEngineModel(...a),
                manualManagedLlmDownload: (...a) => h.manualManagedLlmDownload(...a),
                manualEngineHubModelDownload: (...a) => h.manualEngineHubModelDownload(...a),
                ensureEngineGpuSupport: (...a) => h.ensureEngineGpuSupport(...a),
                ensureEngineTorchCuda: (...a) => h.ensureEngineTorchCuda(...a),
                scanAndReuseEngineCuda: (...a) => h.scanAndReuseEngineCuda(...a),
                setEngineGpuStatusText: (...a) => h.setEngineGpuStatusText(...a),
                appConfirm: late(h, 'appConfirm'),
                manualEngineDownloadInstall: (...a) => h.manualEngineDownloadInstall(...a),
                formatEngineDownloadSizeLine: late(h, 'formatEngineDownloadSizeLine'),
                setEngineDownloadProgressPct: late(h, 'setEngineDownloadProgressPct'),
                appendAppEngineDownloadProgressLog: late(h, 'appendAppEngineDownloadProgressLog'),
                refreshEngineGpuStatus: (...a) => h.refreshEngineGpuStatus(...a),
                refreshEngineDemucsStatus: (...a) => h.refreshEngineDemucsStatus(...a),
                resolveEngineModelsBrowseOnly: late(h, 'resolveEngineModelsBrowseOnly'),
                setEngineModelsBrowseOnly: late(h, 'setEngineModelsBrowseOnly'),
                closeEngineModelsLibrary: late(h, 'closeEngineModelsLibrary'),
                isEngineModelsLibraryOpen: late(h, 'isEngineModelsLibraryOpen'),
                browseSettingsBurnOutputDir: late(h, 'browseSettingsBurnOutputDir'),
                clearSettingsBurnOutputDir: late(h, 'clearSettingsBurnOutputDir'),
                syncBatchSizeUi: late(h, 'syncBatchSizeUi'),
                syncDeviceOptionsForMode: late(h, 'syncDeviceOptionsForMode'),
                syncExpertCustomHints: late(h, 'syncExpertCustomHints'),
                syncMtModelChipUi: late(h, 'syncMtModelChipUi'),
                updateQwenAsrBatchHint: late(h, 'updateQwenAsrBatchHint'),
                syncLogLevelHint: late(h, 'syncLogLevelHint'),
                syncChineseSubtitleVariantUi: late(h, 'syncChineseSubtitleVariantUi'),
                syncMergeBilingualUi: late(h, 'syncMergeBilingualUi'),
                syncBilingualChipUi: late(h, 'syncBilingualChipUi'),
                readTaskFromForm: late(h, 'readTaskFromForm'),
                setBilingualMenuOpen: late(h, 'setBilingualMenuOpen'),
                getBilingualMenuOpen: late(h, 'getBilingualMenuOpen'),
                applyBilingualChipToFormAndPersist: late(h, 'applyBilingualChipToFormAndPersist'),
                syncSmartTranslateUi: late(h, 'syncSmartTranslateUi'),
                updateModelSelectHint: late(h, 'updateModelSelectHint'),
                updateTranslateStyleUi: late(h, 'updateTranslateStyleUi'),
                syncTranslateStylePickerCustomWrap: late(h, 'syncTranslateStylePickerCustomWrap'),
                closeTranslateStylePickerModal: late(h, 'closeTranslateStylePickerModal'),
                applyTranslateStylePicker: late(h, 'applyTranslateStylePicker'),
                syncRetranslateStyleCustomWrap: late(h, 'syncRetranslateStyleCustomWrap'),
                syncHybridMtUi: late(h, 'syncHybridMtUi'),
                syncTranslateChipUi: late(h, 'syncTranslateChipUi'),
                updateReadinessStrip: late(h, 'updateReadinessStrip'),
                syncSmartTranslateReadinessUi: late(h, 'syncSmartTranslateReadinessUi'),
                setModelPathOnForm: late(h, 'setModelPathOnForm'),
                applyAutoDetectedModelsFromCache: late(h, 'applyAutoDetectedModelsFromCache'),
                syncModelSelectToPath: late(h, 'syncModelSelectToPath'),
                readModelPathFromForm: late(h, 'readModelPathFromForm'),
                browseModelPath: late(h, 'browseModelPath'),
                refreshModelSelects: late(h, 'refreshModelSelects'),
                setSaveParamsStatus: late(h, 'setSaveParamsStatus'),
                mirrorSelectValue: late(h, 'mirrorSelectValue'),
                syncExpertExtraChipsUi: late(h, 'syncExpertExtraChipsUi'),
                updateAsrWindowTip: late(h, 'updateAsrWindowTip'),
                adoptManualAsrFromUserChange: late(h, 'adoptManualAsrFromUserChange'),
                maybePromptTorchCudaOnAsrSelect: (...a) => h.maybePromptTorchCudaOnAsrSelect(...a),
                updateAsrRecommendChip: late(h, 'updateAsrRecommendChip'),
                applyAsrRecommendFromChip: late(h, 'applyAsrRecommendFromChip'),
                syncQuickAsrRecommendChip: late(h, 'syncQuickAsrRecommendChip'),
                refreshSubtitleEditorPathHint: late(h, 'refreshSubtitleEditorPathHint'),
                syncPostTaskToMain: late(h, 'syncPostTaskToMain'),
                stopTask: late(h, 'stopTask'),
                bindJobEventListeners: late(h, 'bindJobEventListeners'),
            }),
        );

        h.bindEvents = function bindEvents() {
            const binder = h.getAppEventsBinder();
            if (!binder?.bindEvents) return;
            return binder.bindEvents();
        };

        h.runBackgroundStartupChecks = async function runBackgroundStartupChecks() {
            const schedule = (global && global.requestIdleCallback)
                || ((cb) => setTimeout(() => cb({ didTimeout: false }), 2200));
            schedule(async () => {
                try {
                    if (typeof h.refreshFfmpegStatus === 'function') {
                        await h.refreshFfmpegStatus({ quick: true, persist: false });
                    }
                } catch (_) { /* ignore */ }
                try {
                    const backend = typeof h.readEngineBackendFromForm === 'function'
                        ? h.readEngineBackendFromForm()
                        : 'engine';
                    await Promise.all([
                        backend === 'twai'
                            ? (typeof h.refreshInstallStatus === 'function'
                                ? h.refreshInstallStatus({ quick: true })
                                : Promise.resolve())
                            : (typeof h.refreshEngineStatus === 'function'
                                ? h.refreshEngineStatus({ soft: true })
                                : Promise.resolve()),
                        typeof h.refreshFfmpegStatus === 'function'
                            ? h.refreshFfmpegStatus({ quick: false, persist: false })
                            : Promise.resolve(),
                    ]);
                } catch (_) { /* ignore */ }
            }, { timeout: 4000 });
        };

        h.fillAppVersionLabel = async function fillAppVersionLabel() {
            const els = h.els || {};
            if (!els.appVersionLabel) return;
            let ver = '';
            if (typeof h.electron?.getAppVersion === 'function') {
                try {
                    const res = await h.electron.getAppVersion();
                    ver = String(res?.version || '').trim();
                } catch (_) { /* ignore */ }
            }
            ver = ver.replace(/^v/i, '');
            els.appVersionLabel.textContent = ver ? `v${ver}` : '';
        };

        h.getLiveBatchRehydrate = createLazyFactory(
            () => resolveApi(h, 'liveBatchRehydrateApi', 'TransubLiveBatchRehydrate').createLiveBatchRehydrate,
            () => ({
                state: h.state,
                electron: h.electron,
                normPath: late(h, 'normPath'),
                renderList: late(h, 'renderList'),
                updateProgressUi: late(h, 'updateProgressUi'),
                updateStartButton: late(h, 'updateStartButton'),
                setBadge: late(h, 'setBadge'),
                startElapsedTicker: late(h, 'startElapsedTicker'),
                syncEngineModelsBrowseOnlyFromTaskState: late(h, 'syncEngineModelsBrowseOnlyFromTaskState'),
                appendLog: late(h, 'appendLog'),
                getIsStandaloneChrome: () => (typeof h.getIsStandaloneChrome === 'function'
                    ? !!h.getIsStandaloneChrome()
                    : !!h.isStandaloneChrome),
            }),
        );

        h.getAppInit = createLazyFactory(
            () => resolveApi(h, 'appInitApi', 'TransubAppInit').createAppInit,
            () => ({
                state: h.state,
                els: h.els,
                electron: h.electron,
                pageQuery: h.pageQuery,
                getIsStandaloneSettings: () => (typeof h.getIsStandaloneSettings === 'function'
                    ? !!h.getIsStandaloneSettings()
                    : !!h.isStandaloneSettings),
                getIsStandaloneWizard: () => (typeof h.getIsStandaloneWizard === 'function'
                    ? !!h.getIsStandaloneWizard()
                    : !!h.isStandaloneWizard),
                getIsStandaloneChrome: () => (typeof h.getIsStandaloneChrome === 'function'
                    ? !!h.getIsStandaloneChrome()
                    : !!h.isStandaloneChrome),
                getInitialSettingsTab: () => (typeof h.getInitialSettingsTab === 'function'
                    ? h.getInitialSettingsTab()
                    : h.initialSettingsTab),
                getInitialOpenModelsLibrary: () => (typeof h.getInitialOpenModelsLibrary === 'function'
                    ? !!h.getInitialOpenModelsLibrary()
                    : !!h.initialOpenModelsLibrary),
                appendLog: late(h, 'appendLog'),
                cacheEls: late(h, 'cacheEls'),
                syncQuickExtrasBar: late(h, 'syncQuickExtrasBar'),
                fillAppVersionLabel: (...a) => h.fillAppVersionLabel(...a),
                bindEvents: (...a) => h.bindEvents(...a),
                bindFactoryShellChrome: late(h, 'bindFactoryShellChrome'),
                syncDeviceOptionsForMode: late(h, 'syncDeviceOptionsForMode'),
                syncExpertCustomHints: late(h, 'syncExpertCustomHints'),
                setBadge: late(h, 'setBadge'),
                syncBatchSizeUi: late(h, 'syncBatchSizeUi'),
                syncLogLevelHint: late(h, 'syncLogLevelHint'),
                syncChineseSubtitleVariantUi: late(h, 'syncChineseSubtitleVariantUi'),
                syncPostTaskMenuUi: late(h, 'syncPostTaskMenuUi'),
                syncPostTaskExtrasUi: late(h, 'syncPostTaskExtrasUi'),
                resetPostTaskSelect: late(h, 'resetPostTaskSelect'),
                renderList: late(h, 'renderList'),
                updateStartButton: late(h, 'updateStartButton'),
                rehydrateFromLiveBatchIfNeeded: async () => {
                    const api = h.getLiveBatchRehydrate();
                    if (!api?.rehydrateFromLiveBatchIfNeeded) return false;
                    return api.rehydrateFromLiveBatchIfNeeded();
                },
                isDesktop: late(h, 'isDesktop'),
                warnMissingRendererCores: late(h, 'warnMissingRendererCores'),
                setLoading: late(h, 'setLoading'),
                applyOptionsToForm: late(h, 'applyOptionsToForm'),
                buildSavedOptionsFromForm: late(h, 'buildSavedOptionsFromForm'),
                setSavedOptionsSnapshot: (opts) => {
                    if (typeof h.setSavedOptionsSnapshot === 'function') h.setSavedOptionsSnapshot(opts);
                    else h.savedOptionsSnapshot = opts && typeof opts === 'object' ? opts : null;
                },
                updateParamsSummary: late(h, 'updateParamsSummary'),
                syncResourceUsageMonitor: late(h, 'syncResourceUsageMonitor'),
                ensureEngineInstallPathFilled: late(h, 'ensureEngineInstallPathFilled'),
                loadEngineModelsCacheFromDisk: late(h, 'loadEngineModelsCacheFromDisk'),
                readEngineBackendFromForm: late(h, 'readEngineBackendFromForm'),
                refreshInstallStatus: late(h, 'refreshInstallStatus'),
                refreshEngineStatus: (...a) => h.refreshEngineStatus(...a),
                ensureSettingsShellReady: late(h, 'ensureSettingsShellReady'),
                loadDeferredGroup: late(h, 'loadDeferredGroup'),
                refreshAdvancedEntitlement: late(h, 'refreshAdvancedEntitlement'),
                openParamsModal: late(h, 'openParamsModal'),
                openEngineModelsLibrary: late(h, 'openEngineModelsLibrary'),
                flushPendingActivePresetId: late(h, 'flushPendingActivePresetId'),
                syncPostTaskToMain: late(h, 'syncPostTaskToMain'),
                runBackgroundStartupChecks: (...a) => h.runBackgroundStartupChecks(...a),
                consumeExternalImportFiles: late(h, 'consumeExternalImportFiles'),
                openAppSettings: late(h, 'openAppSettings'),
            }),
        );

        h.init = async function init() {
            const boot = h.getAppInit();
            if (boot?.init) return boot.init();
            console.error('[init] TransubAppInit missing');
            try {
                const els = h.els || {};
                const overlay = els.loadingOverlay
                    || (typeof document !== 'undefined' ? document.getElementById('loadingOverlay') : null);
                if (overlay) {
                    overlay.classList.add('hidden');
                    overlay.classList.remove('flex', 'is-open');
                    overlay.style.display = 'none';
                }
            } catch { /* ignore */ }
        };

        return h;
    }

    return { install };
}));
