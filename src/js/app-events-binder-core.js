/**
 * App event binder: registers main-window DOM/IPC listeners.
 * Shell injects adapters via createAppEventsBinder(deps); call binder.bindEvents().
 * Internals split into thematic binds (>400 LOC register body).
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAppEventsBinder = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function appEventsBinderFactory(global) {
    /**
     * @param {object} deps shell adapters (closures + helpers)
     */
    function createAppEventsBinder(deps) {
        const d = deps || {};
        const electron = d.electron;
        const els = d.els || {};
        const state = d.state;
        const audioMutexApi = d.audioMutexApi || {};
        const GITHUB_ISSUES_URL = d.GITHUB_ISSUES_URL
            || 'https://github.com/dlsandy/Transub/issues/new';
        const getIsStandaloneSettings = typeof d.getIsStandaloneSettings === 'function'
            ? d.getIsStandaloneSettings
            : () => !!d.isStandaloneSettings;
        const getAdvancedEntitled = typeof d.getAdvancedEntitled === 'function'
            ? d.getAdvancedEntitled
            : () => !!d.advancedEntitled;
        const getSettingsFormDirty = typeof d.getSettingsFormDirty === 'function'
            ? d.getSettingsFormDirty
            : () => !!d.settingsFormDirty;
        const getEngineDownloadActiveSource = typeof d.getEngineDownloadActiveSource === 'function'
            ? d.getEngineDownloadActiveSource
            : () => d.engineDownloadActiveSource;
        const getEngineModelsBrowseOnly = typeof d.getEngineModelsBrowseOnly === 'function'
            ? d.getEngineModelsBrowseOnly
            : () => !!d.engineModelsBrowseOnly;
        const getEngineModelsBusy = typeof d.getEngineModelsBusy === 'function'
            ? d.getEngineModelsBusy
            : () => !!d.engineModelsBusy;
        const getCachedEngineModels = typeof d.getCachedEngineModels === 'function'
            ? d.getCachedEngineModels
            : () => d.cachedEngineModels || [];
        const getCachedHardwareRecommend = typeof d.getCachedHardwareRecommend === 'function'
            ? d.getCachedHardwareRecommend
            : () => d.cachedHardwareRecommend;
        const setAsrRecommendDismissedKey = typeof d.setAsrRecommendDismissedKey === 'function'
            ? d.setAsrRecommendDismissedKey
            : () => {};
        const setSavedOptionsSnapshot = typeof d.setSavedOptionsSnapshot === 'function'
            ? d.setSavedOptionsSnapshot
            : () => {};
        const setInsertSoftwareCreditIsDefault = typeof d.setInsertSoftwareCreditIsDefault === 'function'
            ? d.setInsertSoftwareCreditIsDefault
            : () => {};
        const bindAutoScanSettingsUi = typeof d.bindAutoScanSettingsUi === 'function' ? d.bindAutoScanSettingsUi : () => {};
        const bindListActions = typeof d.bindListActions === 'function' ? d.bindListActions : () => {};
        const setupDragDrop = typeof d.setupDragDrop === 'function' ? d.setupDragDrop : () => {};
        const bindPostTaskMenu = typeof d.bindPostTaskMenu === 'function' ? d.bindPostTaskMenu : () => {};
        const bindAddMenu = typeof d.bindAddMenu === 'function' ? d.bindAddMenu : () => {};
        const bindMainUiExtras = typeof d.bindMainUiExtras === 'function' ? d.bindMainUiExtras : () => {};
        const bindClearListMenu = typeof d.bindClearListMenu === 'function' ? d.bindClearListMenu : () => {};
        const ensureJobRuntimeScripts = typeof d.ensureJobRuntimeScripts === 'function' ? d.ensureJobRuntimeScripts : () => {};
        const startSubtitleGeneration = typeof d.startSubtitleGeneration === 'function' ? d.startSubtitleGeneration : () => {};
        const openTranslateStylePickerModal = typeof d.openTranslateStylePickerModal === 'function' ? d.openTranslateStylePickerModal : () => {};
        const setTranslateStyleMenuOpen = typeof d.setTranslateStyleMenuOpen === 'function' ? d.setTranslateStyleMenuOpen : () => {};
        const getTranslateStyleMenuOpen = typeof d.getTranslateStyleMenuOpen === 'function' ? d.getTranslateStyleMenuOpen : (() => false);
        const applyTranslateStyleEnabled = typeof d.applyTranslateStyleEnabled === 'function' ? d.applyTranslateStyleEnabled : () => {};
        const applyTranslateStylePreset = typeof d.applyTranslateStylePreset === 'function' ? d.applyTranslateStylePreset : () => {};
        const applyTranslateStyleMenuCustomNote = typeof d.applyTranslateStyleMenuCustomNote === 'function' ? d.applyTranslateStyleMenuCustomNote : () => {};
        const openTranslateStyleSettings = typeof d.openTranslateStyleSettings === 'function' ? d.openTranslateStyleSettings : () => {};
        const syncTranslateStyleChipUi = typeof d.syncTranslateStyleChipUi === 'function' ? d.syncTranslateStyleChipUi : () => {};
        const setTranslateStyleEnabledState = typeof d.setTranslateStyleEnabledState === 'function' ? d.setTranslateStyleEnabledState : () => {};
        const bindTranslateStyleChipEvents = typeof d.bindTranslateStyleChipEvents === 'function' ? d.bindTranslateStyleChipEvents : () => {};
        const closeRetranslateModal = typeof d.closeRetranslateModal === 'function' ? d.closeRetranslateModal : () => {};
        const runRetranslateFromModal = typeof d.runRetranslateFromModal === 'function' ? d.runRetranslateFromModal : () => {};
        const syncRetranslateModalModelUi = typeof d.syncRetranslateModalModelUi === 'function' ? d.syncRetranslateModalModelUi : () => {};
        const renderList = typeof d.renderList === 'function' ? d.renderList : () => {};
        const updateStartButton = typeof d.updateStartButton === 'function' ? d.updateStartButton : () => {};
        const focusTaskFromSelection = typeof d.focusTaskFromSelection === 'function' ? d.focusTaskFromSelection : () => {};
        const applyTaskSelection = typeof d.applyTaskSelection === 'function'
            ? d.applyTaskSelection
            : ((selected) => {
                const on = !!selected;
                state.items.forEach((i) => { i.selected = on; });
                renderList();
                updateStartButton();
                focusTaskFromSelection();
            });
        const toggleTaskSelectAll = typeof d.toggleTaskSelectAll === 'function'
            ? d.toggleTaskSelectAll
            : (() => {
                if (!state.items.length) return;
                const allSelected = state.items.every((i) => i.selected);
                applyTaskSelection(!allSelected);
            });
        const applyUiPrefs = typeof d.applyUiPrefs === 'function' ? d.applyUiPrefs : () => {};
        const hydrateAppThemeFromMain = typeof d.hydrateAppThemeFromMain === 'function' ? d.hydrateAppThemeFromMain : () => {};
        const syncLocalThemeKeys = typeof d.syncLocalThemeKeys === 'function' ? d.syncLocalThemeKeys : () => {};
        const saveParamsSettings = typeof d.saveParamsSettings === 'function' ? d.saveParamsSettings : () => {};
        const bindResourceUsageSetting = typeof d.bindResourceUsageSetting === 'function' ? d.bindResourceUsageSetting : () => {};
        const syncResourceUsageMonitor = typeof d.syncResourceUsageMonitor === 'function' ? d.syncResourceUsageMonitor : () => {};
        const showToast = typeof d.showToast === 'function' ? d.showToast : () => {};
        const openAppSettings = typeof d.openAppSettings === 'function' ? d.openAppSettings : () => {};
        const closeParamsModal = typeof d.closeParamsModal === 'function' ? d.closeParamsModal : () => {};
        const bindSettingsTips = typeof d.bindSettingsTips === 'function' ? d.bindSettingsTips : () => {};
        const bindSettingsSearch = typeof d.bindSettingsSearch === 'function' ? d.bindSettingsSearch : () => {};
        const bindSettingsGuideLinks = typeof d.bindSettingsGuideLinks === 'function' ? d.bindSettingsGuideLinks : () => {};
        const closeAllSettingsTips = typeof d.closeAllSettingsTips === 'function' ? d.closeAllSettingsTips : () => {};
        const switchParamsTab = typeof d.switchParamsTab === 'function' ? d.switchParamsTab : () => {};
        const persistFormOptionsQuiet = typeof d.persistFormOptionsQuiet === 'function' ? d.persistFormOptionsQuiet : () => {};
        const openParamsModal = typeof d.openParamsModal === 'function' ? d.openParamsModal : () => {};
        const openEngineModelsLibrary = typeof d.openEngineModelsLibrary === 'function' ? d.openEngineModelsLibrary : () => {};
        const applyOptionsToForm = typeof d.applyOptionsToForm === 'function' ? d.applyOptionsToForm : () => {};
        const buildSavedOptionsFromForm = typeof d.buildSavedOptionsFromForm === 'function' ? d.buildSavedOptionsFromForm : (() => ({}));
        const markSettingsDirty = typeof d.markSettingsDirty === 'function' ? d.markSettingsDirty : () => {};
        const updateParamsSummary = typeof d.updateParamsSummary === 'function' ? d.updateParamsSummary : () => {};
        const testInstall = typeof d.testInstall === 'function' ? d.testInstall : () => {};
        const checkTransWithAiEngineUpdate = typeof d.checkTransWithAiEngineUpdate === 'function' ? d.checkTransWithAiEngineUpdate : () => {};
        const browseInstallPath = typeof d.browseInstallPath === 'function' ? d.browseInstallPath : () => {};
        const syncEngineBackendUi = typeof d.syncEngineBackendUi === 'function' ? d.syncEngineBackendUi : () => {};
        const updateEnvBanner = typeof d.updateEnvBanner === 'function' ? d.updateEnvBanner : () => {};
        const readEngineBackendFromForm = typeof d.readEngineBackendFromForm === 'function' ? d.readEngineBackendFromForm : (() => '');
        const refreshEngineModels = typeof d.refreshEngineModels === 'function' ? d.refreshEngineModels : () => {};
        const ensureEngineModelsCatalog = typeof d.ensureEngineModelsCatalog === 'function'
            ? d.ensureEngineModelsCatalog
            : (async (opts = {}) => refreshEngineModels({
                silent: opts.silent !== false,
            }));
        const refreshEngineStatus = typeof d.refreshEngineStatus === 'function' ? d.refreshEngineStatus : () => {};
        const setEngineStatusText = typeof d.setEngineStatusText === 'function' ? d.setEngineStatusText : () => {};
        const uiTf = typeof d.uiTf === 'function' ? d.uiTf : ((s) => s);
        const getEngineEnvUi = typeof d.getEngineEnvUi === 'function' ? d.getEngineEnvUi : (() => null);
        const setNetworkHfStatus = typeof d.setNetworkHfStatus === 'function' ? d.setNetworkHfStatus : () => {};
        const setNetworkGithubMirrorStatus = typeof d.setNetworkGithubMirrorStatus === 'function'
            ? d.setNetworkGithubMirrorStatus
            : () => {};
        const readProxyOptionsFromForm = typeof d.readProxyOptionsFromForm === 'function' ? d.readProxyOptionsFromForm : () => {};
        const syncProxySettingsUi = typeof d.syncProxySettingsUi === 'function' ? d.syncProxySettingsUi : () => {};
        const setProxyTestStatus = typeof d.setProxyTestStatus === 'function' ? d.setProxyTestStatus : () => {};
        const syncTransubStationSettingsUi = typeof d.syncTransubStationSettingsUi === 'function'
            ? d.syncTransubStationSettingsUi
            : () => {};
        const setTransubStationStatus = typeof d.setTransubStationStatus === 'function'
            ? d.setTransubStationStatus
            : () => {};
        const appendLog = typeof d.appendLog === 'function' ? d.appendLog : () => {};
        const showEngineTestResultDialog = typeof d.showEngineTestResultDialog === 'function' ? d.showEngineTestResultDialog : () => {};
        const appendEngineDownloadLog = typeof d.appendEngineDownloadLog === 'function' ? d.appendEngineDownloadLog : () => {};
        const setEngineDownloadProgressVisible = typeof d.setEngineDownloadProgressVisible === 'function' ? d.setEngineDownloadProgressVisible : () => {};
        const setEngineModelsFilter = typeof d.setEngineModelsFilter === 'function' ? d.setEngineModelsFilter : () => {};
        const setEngineModelsStatusFilter = typeof d.setEngineModelsStatusFilter === 'function' ? d.setEngineModelsStatusFilter : () => {};
        const setEngineDownloadDrawerOpen = typeof d.setEngineDownloadDrawerOpen === 'function' ? d.setEngineDownloadDrawerOpen : () => {};
        const setEngineModelsSearchQuery = typeof d.setEngineModelsSearchQuery === 'function' ? d.setEngineModelsSearchQuery : () => {};
        const renderEngineModelsCards = typeof d.renderEngineModelsCards === 'function' ? d.renderEngineModelsCards : () => {};
        const bindEngineModelsLabUi = typeof d.bindEngineModelsLabUi === 'function' ? d.bindEngineModelsLabUi : () => {};
        const explainEngineModelsMutateBlocked = typeof d.explainEngineModelsMutateBlocked === 'function' ? d.explainEngineModelsMutateBlocked : (() => '');
        const downloadEngineModels = typeof d.downloadEngineModels === 'function' ? d.downloadEngineModels : () => {};
        const deleteEngineModel = typeof d.deleteEngineModel === 'function' ? d.deleteEngineModel : () => {};
        const manualManagedLlmDownload = typeof d.manualManagedLlmDownload === 'function' ? d.manualManagedLlmDownload : () => {};
        const manualEngineHubModelDownload = typeof d.manualEngineHubModelDownload === 'function' ? d.manualEngineHubModelDownload : () => {};
        const ensureEngineGpuSupport = typeof d.ensureEngineGpuSupport === 'function' ? d.ensureEngineGpuSupport : () => {};
        const ensureEngineTorchCuda = typeof d.ensureEngineTorchCuda === 'function' ? d.ensureEngineTorchCuda : () => {};
        const scanAndReuseEngineCuda = typeof d.scanAndReuseEngineCuda === 'function' ? d.scanAndReuseEngineCuda : () => {};
        const setEngineGpuStatusText = typeof d.setEngineGpuStatusText === 'function' ? d.setEngineGpuStatusText : () => {};
        const appConfirm = typeof d.appConfirm === 'function' ? d.appConfirm : (async () => false);
        const manualEngineDownloadInstall = typeof d.manualEngineDownloadInstall === 'function' ? d.manualEngineDownloadInstall : () => {};
        const formatEngineDownloadSizeLine = typeof d.formatEngineDownloadSizeLine === 'function' ? d.formatEngineDownloadSizeLine : (() => '');
        const setEngineDownloadProgressPct = typeof d.setEngineDownloadProgressPct === 'function' ? d.setEngineDownloadProgressPct : () => {};
        const appendAppEngineDownloadProgressLog = typeof d.appendAppEngineDownloadProgressLog === 'function' ? d.appendAppEngineDownloadProgressLog : () => {};
        const refreshEngineGpuStatus = typeof d.refreshEngineGpuStatus === 'function' ? d.refreshEngineGpuStatus : () => {};
        const refreshEngineDemucsStatus = typeof d.refreshEngineDemucsStatus === 'function' ? d.refreshEngineDemucsStatus : () => {};
        const resolveEngineModelsBrowseOnly = typeof d.resolveEngineModelsBrowseOnly === 'function' ? d.resolveEngineModelsBrowseOnly : () => {};
        const setEngineModelsBrowseOnly = typeof d.setEngineModelsBrowseOnly === 'function' ? d.setEngineModelsBrowseOnly : () => {};
        const closeEngineModelsLibrary = typeof d.closeEngineModelsLibrary === 'function' ? d.closeEngineModelsLibrary : () => {};
        const isEngineModelsLibraryOpen = typeof d.isEngineModelsLibraryOpen === 'function' ? d.isEngineModelsLibraryOpen : (() => false);
        const browseSettingsBurnOutputDir = typeof d.browseSettingsBurnOutputDir === 'function' ? d.browseSettingsBurnOutputDir : () => {};
        const clearSettingsBurnOutputDir = typeof d.clearSettingsBurnOutputDir === 'function' ? d.clearSettingsBurnOutputDir : () => {};
        const syncBatchSizeUi = typeof d.syncBatchSizeUi === 'function' ? d.syncBatchSizeUi : () => {};
        const syncDeviceOptionsForMode = typeof d.syncDeviceOptionsForMode === 'function' ? d.syncDeviceOptionsForMode : () => {};
        const syncExpertCustomHints = typeof d.syncExpertCustomHints === 'function' ? d.syncExpertCustomHints : () => {};
        const syncMtModelChipUi = typeof d.syncMtModelChipUi === 'function' ? d.syncMtModelChipUi : () => {};
        const updateQwenAsrBatchHint = typeof d.updateQwenAsrBatchHint === 'function' ? d.updateQwenAsrBatchHint : () => {};
        const syncLogLevelHint = typeof d.syncLogLevelHint === 'function' ? d.syncLogLevelHint : () => {};
        const syncChineseSubtitleVariantUi = typeof d.syncChineseSubtitleVariantUi === 'function' ? d.syncChineseSubtitleVariantUi : () => {};
        const syncMergeBilingualUi = typeof d.syncMergeBilingualUi === 'function' ? d.syncMergeBilingualUi : () => {};
        const syncBilingualChipUi = typeof d.syncBilingualChipUi === 'function' ? d.syncBilingualChipUi : () => {};
        const readTaskFromForm = typeof d.readTaskFromForm === 'function' ? d.readTaskFromForm : (() => '');
        const setBilingualMenuOpen = typeof d.setBilingualMenuOpen === 'function' ? d.setBilingualMenuOpen : () => {};
        const getBilingualMenuOpen = typeof d.getBilingualMenuOpen === 'function' ? d.getBilingualMenuOpen : (() => false);
        const applyBilingualChipToFormAndPersist = typeof d.applyBilingualChipToFormAndPersist === 'function' ? d.applyBilingualChipToFormAndPersist : () => {};
        const syncSmartTranslateUi = typeof d.syncSmartTranslateUi === 'function' ? d.syncSmartTranslateUi : () => {};
        const updateModelSelectHint = typeof d.updateModelSelectHint === 'function' ? d.updateModelSelectHint : () => {};
        const updateTranslateStyleUi = typeof d.updateTranslateStyleUi === 'function' ? d.updateTranslateStyleUi : () => {};
        const syncTranslateStylePickerCustomWrap = typeof d.syncTranslateStylePickerCustomWrap === 'function' ? d.syncTranslateStylePickerCustomWrap : () => {};
        const closeTranslateStylePickerModal = typeof d.closeTranslateStylePickerModal === 'function' ? d.closeTranslateStylePickerModal : () => {};
        const applyTranslateStylePicker = typeof d.applyTranslateStylePicker === 'function' ? d.applyTranslateStylePicker : () => {};
        const syncRetranslateStyleCustomWrap = typeof d.syncRetranslateStyleCustomWrap === 'function' ? d.syncRetranslateStyleCustomWrap : () => {};
        const syncHybridMtUi = typeof d.syncHybridMtUi === 'function' ? d.syncHybridMtUi : () => {};
        const syncTranslateChipUi = typeof d.syncTranslateChipUi === 'function' ? d.syncTranslateChipUi : () => {};
        const updateReadinessStrip = typeof d.updateReadinessStrip === 'function' ? d.updateReadinessStrip : () => {};
        const syncSmartTranslateReadinessUi = typeof d.syncSmartTranslateReadinessUi === 'function' ? d.syncSmartTranslateReadinessUi : () => {};
        const setModelPathOnForm = typeof d.setModelPathOnForm === 'function' ? d.setModelPathOnForm : () => {};
        const applyAutoDetectedModelsFromCache = typeof d.applyAutoDetectedModelsFromCache === 'function' ? d.applyAutoDetectedModelsFromCache : () => {};
        const syncModelSelectToPath = typeof d.syncModelSelectToPath === 'function' ? d.syncModelSelectToPath : () => {};
        const readModelPathFromForm = typeof d.readModelPathFromForm === 'function' ? d.readModelPathFromForm : (() => '');
        const browseModelPath = typeof d.browseModelPath === 'function' ? d.browseModelPath : () => {};
        const refreshModelSelects = typeof d.refreshModelSelects === 'function' ? d.refreshModelSelects : () => {};
        const setSaveParamsStatus = typeof d.setSaveParamsStatus === 'function' ? d.setSaveParamsStatus : () => {};
        const mirrorSelectValue = typeof d.mirrorSelectValue === 'function' ? d.mirrorSelectValue : () => {};
        const syncExpertExtraChipsUi = typeof d.syncExpertExtraChipsUi === 'function' ? d.syncExpertExtraChipsUi : () => {};
        const updateAsrWindowTip = typeof d.updateAsrWindowTip === 'function' ? d.updateAsrWindowTip : () => {};
        const adoptManualAsrFromUserChange = typeof d.adoptManualAsrFromUserChange === 'function' ? d.adoptManualAsrFromUserChange : () => {};
        const maybePromptTorchCudaOnAsrSelect = typeof d.maybePromptTorchCudaOnAsrSelect === 'function' ? d.maybePromptTorchCudaOnAsrSelect : () => {};
        const updateAsrRecommendChip = typeof d.updateAsrRecommendChip === 'function' ? d.updateAsrRecommendChip : () => {};
        const applyAsrRecommendFromChip = typeof d.applyAsrRecommendFromChip === 'function' ? d.applyAsrRecommendFromChip : () => {};
        const syncQuickAsrRecommendChip = typeof d.syncQuickAsrRecommendChip === 'function' ? d.syncQuickAsrRecommendChip : () => {};
        const refreshSubtitleEditorPathHint = typeof d.refreshSubtitleEditorPathHint === 'function' ? d.refreshSubtitleEditorPathHint : () => {};
        const syncPostTaskToMain = typeof d.syncPostTaskToMain === 'function' ? d.syncPostTaskToMain : () => {};
        const stopTask = typeof d.stopTask === 'function' ? d.stopTask : () => {};
        const bindJobEventListeners = typeof d.bindJobEventListeners === 'function' ? d.bindJobEventListeners : () => {};

        function bindQueueAndToolbarEvents() {
            bindAutoScanSettingsUi();
            if (!getIsStandaloneSettings()) {
                bindListActions();
                setupDragDrop();
                bindPostTaskMenu();
                bindAddMenu();
                bindMainUiExtras();
                els.selectAllItemsBtn?.addEventListener('click', () => {
                    toggleTaskSelectAll();
                });
                bindClearListMenu();
                els.startBtn?.addEventListener('click', () => {
                    void ensureJobRuntimeScripts().then(() => startSubtitleGeneration());
                });
                // Style chip menu: owned by translate-style-picker-ui-core.bindTranslateStyleChipEvents
                bindTranslateStyleChipEvents();
                try { d.bindComboPlansUi?.(); } catch { /* ignore */ }
                els.retranslateCancelBtn?.addEventListener('click', () => closeRetranslateModal());
                els.retranslateConfirmBtn?.addEventListener('click', () => {
                    void runRetranslateFromModal();
                });
                els.retranslateModal?.addEventListener('click', (event) => {
                    if (event.target === els.retranslateModal) closeRetranslateModal();
                });
                [
                    els.retranslateModeEngine,
                    els.retranslateModeLlm,
                    els.retranslateModeDialog,
                    els.retranslateModeSmart,
                ].forEach((radio) => {
                    radio?.addEventListener('change', () => syncRetranslateModalModelUi());
                });
                els.retranslateSmartHybridCheck?.addEventListener('change', () => {
                    syncRetranslateModalModelUi();
                });
                els.retranslateSmartPolishCheck?.addEventListener('change', () => {
                    syncRetranslateModalModelUi();
                });
                els.selectAllCheck?.addEventListener('change', () => {
                    applyTaskSelection(!!els.selectAllCheck.checked);
                });
            }
        }

        function bindThemeAndParamsShellEvents() {
            applyUiPrefs();
            void hydrateAppThemeFromMain();
            try {
                electron?.onAppThemeChanged?.((payload) => {
                    const theme = payload?.theme === 'dark' ? 'dark' : 'light';
                    syncLocalThemeKeys(theme);
                    applyUiPrefs();
                });
            } catch (_) { /* ignore */ }
            els.saveParamsBtn?.addEventListener('click', () => {
                void saveParamsSettings({ closeAfter: false });
            });
            els.saveAndCloseParamsBtn?.addEventListener('click', () => {
                void saveParamsSettings({ closeAfter: true });
            });
            bindResourceUsageSetting();
            syncResourceUsageMonitor();
            els.openFeedbackBtn?.addEventListener('click', () => {
                void (async () => {
                    try {
                        const res = await electron?.openExternal?.(GITHUB_ISSUES_URL);
                        if (res?.ok === false) {
                            showToast(res?.error || '无法打开反馈页面', 'err');
                            return;
                        }
                        showToast('已在浏览器中打开 GitHub Issues', 'ok');
                    } catch (err) {
                        showToast(err?.message || '无法打开反馈页面', 'err');
                    }
                })();
            });
            els.openParamsBtn?.addEventListener('click', () => {
                openAppSettings('runtime');
            });
            els.openParamsTitlebarBtn?.addEventListener('click', () => {
                openAppSettings('runtime');
            });
            els.closeParamsBtn?.addEventListener('click', () => closeParamsModal(getSettingsFormDirty()));
            els.cancelParamsBtn?.addEventListener('click', () => closeParamsModal(getSettingsFormDirty()));
            els.paramsModal?.addEventListener('click', (event) => {
                if (getIsStandaloneSettings()) return;
                if (event.target === els.paramsModal) closeParamsModal(getSettingsFormDirty());
            });
            bindSettingsTips();
            bindSettingsSearch();
            bindSettingsGuideLinks();
            // Document delegation survives #paramsModal replaceWith on fragment load.
            if (!bindThemeAndParamsShellEvents._paramsTabDelegated) {
                bindThemeAndParamsShellEvents._paramsTabDelegated = true;
                document.addEventListener('click', (event) => {
                    const btn = event.target?.closest?.('.params-tab-btn');
                    if (!btn || btn.disabled) return;
                    const modal = document.getElementById('paramsModal');
                    if (!modal || !modal.contains(btn)) return;
                    if (modal.getAttribute('data-settings-dom') === 'pending') return;
                    const tab = String(btn.dataset.tab || '').trim();
                    if (!tab) return;
                    closeAllSettingsTips();
                    switchParamsTab(tab);
                });
            }
            const densityCheck = document.getElementById('settingsDensityCompactCheck');
            if (densityCheck && densityCheck.dataset.bound !== '1') {
                densityCheck.dataset.bound = '1';
                try {
                    densityCheck.checked = localStorage.getItem('transub.density') === 'compact';
                } catch (_) { /* ignore */ }
                densityCheck.addEventListener('change', () => {
                    const next = densityCheck.checked ? 'compact' : 'comfort';
                    try { localStorage.setItem('transub.density', next); } catch (_) { /* ignore */ }
                    document.body.classList.toggle('density-compact', next === 'compact');
                    if (els.toggleDensityLabel) {
                        els.toggleDensityLabel.textContent = next === 'compact' ? '舒适列表' : '紧凑列表';
                    }
                });
            }
            const uiZoomSelect = document.getElementById('settingsUiZoomSelect');
            if (uiZoomSelect && uiZoomSelect.dataset.bound !== '1') {
                uiZoomSelect.dataset.bound = '1';
                const syncUiZoomSelect = async () => {
                    if (!electron?.transubGetUiZoom) return;
                    try {
                        const res = await electron.transubGetUiZoom();
                        if (!res?.ok) return;
                        const v = res.uiZoom;
                        const asStr = v === 'auto' || v == null ? 'auto' : String(v);
                        if ([...uiZoomSelect.options].some((o) => o.value === asStr)) {
                            uiZoomSelect.value = asStr;
                        } else {
                            uiZoomSelect.value = 'auto';
                        }
                    } catch (_) { /* ignore */ }
                };
                void syncUiZoomSelect();
                uiZoomSelect.addEventListener('change', () => {
                    const raw = String(uiZoomSelect.value || 'auto');
                    const uiZoom = raw === 'auto' ? 'auto' : Number(raw);
                    void electron?.transubSetUiZoom?.({ uiZoom });
                });
            }
            if (els.uiLocaleSelect && els.uiLocaleSelect.dataset.bound !== '1') {
                els.uiLocaleSelect.dataset.bound = '1';
                els.uiLocaleSelect.addEventListener('change', () => {
                    const next = window.TransubI18n?.normalizeUiLocale?.(els.uiLocaleSelect.value)
                        || String(els.uiLocaleSelect.value || 'zh-Hans');
                    els.uiLocaleSelect.value = next;
                    void Promise.resolve(window.TransubI18n?.setLocale?.(next, { apply: true, persist: true }))
                        .then(() => persistFormOptionsQuiet());
                });
            }
            electron?.onOpenParams?.((payload) => {
                const tab = String(payload?.tab || 'runtime').trim() || 'runtime';
                const openLibrary = !!payload?.openLibrary;
                if (!getIsStandaloneSettings()) {
                    openAppSettings(tab, {
                        wizard: !!payload?.wizard,
                        forceWizard: !!payload?.forceWizard,
                        openLibrary,
                    });
                    void electron?.transubConsumePendingOpenParams?.();
                    return;
                }
                void (async () => {
                    try {
                        await openParamsModal(tab);
                    } catch (err) {
                        console.warn('[Transub] openParamsModal from IPC failed:', err?.message || err);
                    } finally {
                        // Consume only after apply so a missed switch can still recover via pending/URL.
                        void electron?.transubConsumePendingOpenParams?.();
                    }
                    if (openLibrary) {
                        void openEngineModelsLibrary();
                    }
                    if (payload?.wizard) {
                        // Explicit wizard open from main → force; avoid confirm swallowing the UI.
                        const force = payload.forceWizard !== false;
                        const open = () => global.TransubSetupWizard?.open?.({ force });
                        if (!open()) {
                            setTimeout(() => open(), 80);
                            setTimeout(() => open(), 200);
                        }
                    }
                })();
            });
            electron?.onSettingsUpdated?.((payload) => {
                const options = payload?.options;
                if (!options || typeof options !== 'object') return;
                if (getIsStandaloneSettings() && getSettingsFormDirty()) return;
                void (async () => {
                    await applyOptionsToForm(options);
                    setSavedOptionsSnapshot(buildSavedOptionsFromForm());
                    markSettingsDirty(false);
                    updateParamsSummary();
                    syncResourceUsageMonitor();
                    try {
                        if (options.burnCrf != null || options.burnEncoderId != null
                            || options.burnContainer != null) {
                            global.TransubSubtitleBurnUi?.applyEncodeSettings?.(options);
                        } else {
                            global.TransubSubtitleBurnUi?.reloadEncodeSettings?.();
                        }
                    } catch (_) { /* ignore */ }
                })();
            });
            document.addEventListener('keydown', (event) => {
                if (event.key !== 'Escape' || els.paramsModal?.classList.contains('hidden')) return;
                const setupWizard = document.getElementById('setupWizardModal');
                if (setupWizard && !setupWizard.classList.contains('hidden')) return;
                const presetNameModal = document.getElementById('presetNameModal');
                if (presetNameModal && !presetNameModal.classList.contains('hidden')) {
                    presetNameModal.classList.add('hidden');
                    event.preventDefault();
                    return;
                }
                closeParamsModal(getSettingsFormDirty());
            });
        }

        function bindModelsWorkspaceEvents() {
            const panel = els.workspaceModels
                || (typeof document !== 'undefined' ? document.getElementById('workspaceModels') : null);
            if (!panel || panel.getAttribute('data-ui-fragment') === 'pending') return;
            if (panel.dataset.modelsEventsBound === '1') return;
            panel.dataset.modelsEventsBound = '1';

            els.engineCancelDownloadBtn?.addEventListener('click', () => {
                if (getEngineDownloadActiveSource() === 'managed') {
                    void electron?.transubAdvancedManagedLlmCancelPull?.();
                } else {
                    void electron?.transubEngineCancelDownload?.();
                }
                appendEngineDownloadLog('已请求取消');
                setEngineDownloadProgressVisible(true, '正在取消…');
            });
            els.engineModelsFilters?.querySelectorAll('[data-models-filter]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    setEngineModelsFilter(btn.getAttribute('data-models-filter') || 'all');
                });
            });
            els.engineModelsStatusFilters?.querySelectorAll('[data-models-status]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    setEngineModelsStatusFilter(btn.getAttribute('data-models-status') || 'all');
                });
            });
            els.engineDownloadDrawerToggle?.addEventListener('click', () => {
                const open = !els.engineDownloadDrawer || els.engineDownloadDrawer.classList.contains('hidden');
                setEngineDownloadDrawerOpen(open);
            });
            els.engineModelsSearch?.addEventListener('input', () => {
                setEngineModelsSearchQuery(String(els.engineModelsSearch.value || ''));
                renderEngineModelsCards();
            });
            bindEngineModelsLabUi();
            els.engineModelsList?.addEventListener('click', (event) => {
                const btn = event.target.closest?.('[data-model-action]');
                if (!btn || !els.engineModelsList.contains(btn)) return;
                const action = btn.getAttribute('data-model-action');
                if (action === 'refresh-empty') {
                    void refreshEngineModels({ silent: false });
                    return;
                }
                if (getEngineModelsBrowseOnly() && (action === 'download' || action === 'delete')) {
                    showToast(explainEngineModelsMutateBlocked(), 'warn');
                    return;
                }
                const id = String(btn.getAttribute('data-model-id') || '').trim();
                if (!id) return;
                if (action === 'download') {
                    void downloadEngineModels({ modelIds: [id] });
                } else if (action === 'delete') {
                    void deleteEngineModel(id);
                } else if (action === 'manual') {
                    void manualManagedLlmDownload(id);
                } else if (action === 'manual-hub') {
                    void manualEngineHubModelDownload(id);
                }
            });
            els.engineRefreshModelsBtn?.addEventListener('click', async () => {
                const btn = els.engineRefreshModelsBtn;
                if (getEngineModelsBrowseOnly() || await resolveEngineModelsBrowseOnly()) {
                    setEngineModelsBrowseOnly(true);
                    showToast(explainEngineModelsMutateBlocked(), 'warn');
                    return;
                }
                // Keep icon markup — textContent would wipe <i class="fa fa-refresh"> and leave bare「刷新」.
                const icon = btn?.querySelector?.('i.fa') || null;
                if (btn) {
                    btn.disabled = true;
                    if (icon) icon.classList.add('fa-spin');
                }
                try {
                    const res = await refreshEngineModels({ silent: false });
                    if (res?.deferred) {
                        showToast(explainEngineModelsMutateBlocked(), 'warn');
                        return;
                    }
                    if (res?.ok || getCachedEngineModels().length) {
                        const list = res.models || getCachedEngineModels();
                        const installed = list.filter((m) => m.installed).length;
                        const total = list.length;
                        const msg = uiTf('模型状态已刷新：已安装 {installed} / {total}', { installed, total });
                        appendLog(msg, 'ok');
                        setEngineStatusText(msg, 'ok');
                        await appConfirm({
                            title: '模型状态',
                            message: msg,
                            primaryLabel: '确定',
                            hideSecondary: true,
                        });
                    } else {
                        const err = res?.error || '刷新模型状态失败';
                        appendLog(err, 'err');
                        await appConfirm({
                            title: '刷新失败',
                            message: err,
                            primaryLabel: '确定',
                            hideSecondary: true,
                            danger: true,
                        });
                    }
                } finally {
                    if (icon) icon.classList.remove('fa-spin');
                    if (btn) {
                        btn.disabled = !!getEngineModelsBusy() || getEngineModelsBrowseOnly();
                    }
                }
            });
        }

        function setTransubStationStatusText(text, kind = '') {
            const statusEl = (typeof document !== 'undefined'
                ? document.getElementById('transubStationStatus')
                : null)
                || els.transubStationStatus
                || null;
            if (statusEl) {
                els.transubStationStatus = statusEl;
                statusEl.textContent = text || '';
                statusEl.className = kind === 'ok'
                    ? 'text-xs text-emerald-600 min-h-[1rem]'
                    : kind === 'err'
                        ? 'text-xs text-red-600 min-h-[1rem]'
                        : kind === 'busy'
                            ? 'text-xs text-sky-600 min-h-[1rem]'
                            : 'text-xs text-gray-500 min-h-[1rem]';
            }
            try { setTransubStationStatus(text, kind); } catch (_) { /* ignore */ }
        }

        function bindTransubStationSettingsEvents() {
            const doc = typeof document !== 'undefined' ? document : null;
            if (!doc) return;

            // Always refresh live refs after lazy settings fragment inject.
            const enabledCheck = doc.getElementById('transubStationEnabledCheck');
            const urlInput = doc.getElementById('transubStationUrlInput');
            const testBtn = doc.getElementById('transubStationTestBtn');
            const fields = doc.getElementById('transubStationFields');
            const statusEl = doc.getElementById('transubStationStatus');
            if (enabledCheck) els.transubStationEnabledCheck = enabledCheck;
            if (urlInput) els.transubStationUrlInput = urlInput;
            if (testBtn) els.transubStationTestBtn = testBtn;
            if (fields) els.transubStationFields = fields;
            if (statusEl) els.transubStationStatus = statusEl;

            if (enabledCheck && enabledCheck.dataset.bound !== '1') {
                enabledCheck.dataset.bound = '1';
                enabledCheck.addEventListener('change', () => {
                    syncTransubStationSettingsUi();
                    markSettingsDirty(true);
                });
            }
            if (urlInput && urlInput.dataset.bound !== '1') {
                urlInput.dataset.bound = '1';
                urlInput.addEventListener('input', () => markSettingsDirty(true));
            }

            // Document delegation survives #paramsModal replaceWith on fragment load.
            if (!bindTransubStationSettingsEvents._delegated) {
                bindTransubStationSettingsEvents._delegated = true;
                doc.addEventListener('click', (event) => {
                    const btn = event.target?.closest?.('#transubStationTestBtn');
                    if (!btn) return;
                    event.preventDefault();
                    event.stopPropagation();
                    void (async () => {
                        const url = String(
                            document.getElementById('transubStationUrlInput')?.value
                            || els.transubStationUrlInput?.value
                            || '',
                        ).trim() || 'http://127.0.0.1:8787';
                        const payload = {
                            transubStationEnabled: true,
                            transubStationUrl: url,
                        };
                        setTransubStationStatusText('探测中…', 'busy');
                        btn.disabled = true;
                        try {
                            const probe = electron?.transubStationProbe;
                            if (typeof probe !== 'function') {
                                setTransubStationStatusText(
                                    '当前环境不支持探测 Station（请完全退出后重启应用）',
                                    'err',
                                );
                                return;
                            }
                            const res = await probe(payload);
                            if (res?.ok && res?.ready) {
                                setTransubStationStatusText(res.message || 'Station 已就绪', 'ok');
                            } else {
                                setTransubStationStatusText(res?.error || 'Station 未就绪', 'err');
                            }
                        } catch (err) {
                            setTransubStationStatusText(err?.message || String(err), 'err');
                        } finally {
                            btn.disabled = false;
                            try { syncTransubStationSettingsUi(); } catch (_) { /* ignore */ }
                        }
                    })();
                });
            }

            try { syncTransubStationSettingsUi(); } catch (_) { /* ignore */ }
        }

        const DEFAULT_GITHUB_MIRRORS_TEXT = [
            'https://g.blfrp.cn/',
            'https://gh-proxy.com/',
            'https://gh.nxnow.top/',
            'https://ghproxy.net/',
        ].join('\n');

        function liveEl(id, cacheKey) {
            const found = (typeof document !== 'undefined' ? document.getElementById(id) : null)
                || els[cacheKey]
                || null;
            if (found && cacheKey) els[cacheKey] = found;
            return found;
        }

        function setGithubMirrorStatusText(text, kind = '') {
            const statusEl = liveEl('networkGithubMirrorStatus', 'networkGithubMirrorStatus');
            if (statusEl) {
                statusEl.textContent = text || '';
                statusEl.className = kind === 'ok'
                    ? 'text-xs text-emerald-600 min-h-[1rem] whitespace-pre-wrap basis-full'
                    : kind === 'err'
                        ? 'text-xs text-red-600 min-h-[1rem] whitespace-pre-wrap basis-full'
                        : kind === 'busy'
                            ? 'text-xs text-sky-600 min-h-[1rem] whitespace-pre-wrap basis-full'
                            : 'text-xs text-gray-500 min-h-[1rem] whitespace-pre-wrap basis-full';
            }
            try { setNetworkGithubMirrorStatus(text, kind); } catch (_) { /* ignore */ }
        }

        function readLiveProxyOptionsFromForm() {
            return {
                proxyEnabled: !!liveEl('proxyEnabledCheck', 'proxyEnabledCheck')?.checked,
                proxyUrl: String(liveEl('proxyUrlInput', 'proxyUrlInput')?.value || '').trim(),
                proxyBypass: String(liveEl('proxyBypassInput', 'proxyBypassInput')?.value || '').trim()
                    || 'localhost,127.0.0.1,::1,<local>',
            };
        }

        async function runGithubMirrorSpeedTest(btn) {
            if (btn?.disabled) return;
            const input = liveEl('githubMirrorsInput', 'githubMirrorsInput');
            const payload = {
                mirrors: String(input?.value || ''),
                includeOfficial: true,
                ...readLiveProxyOptionsFromForm(),
            };
            setGithubMirrorStatusText('测速中…', 'busy');
            if (btn) btn.disabled = true;
            try {
                const probe = electron?.transubTestGithubMirrors;
                if (typeof probe !== 'function') {
                    setGithubMirrorStatusText('当前环境不支持测速（请完全退出后重启应用）', 'err');
                    return;
                }
                const res = await probe(payload);
                if (!res) {
                    setGithubMirrorStatusText('当前环境不支持测速', 'err');
                    return;
                }
                const lines = Array.isArray(res.results)
                    ? res.results.map((r) => r.message || `${r.label}: ${r.ok ? 'ok' : (r.error || '失败')}`)
                    : [];
                const summary = res.message || (res.ok ? '测速完成' : (res.error || '测速失败'));
                setGithubMirrorStatusText(
                    [summary, ...lines].filter(Boolean).join('\n'),
                    res.ok ? 'ok' : 'err',
                );
            } catch (err) {
                setGithubMirrorStatusText(err?.message || String(err), 'err');
            } finally {
                if (btn) btn.disabled = false;
            }
        }

        function bindGithubMirrorSettingsEvents() {
            const doc = typeof document !== 'undefined' ? document : null;
            if (!doc) return;

            liveEl('githubMirrorsInput', 'githubMirrorsInput');
            liveEl('githubMirrorsPresetBtn', 'githubMirrorsPresetBtn');
            liveEl('githubMirrorsClearBtn', 'githubMirrorsClearBtn');
            liveEl('githubMirrorsTestBtn', 'githubMirrorsTestBtn');
            liveEl('networkGithubMirrorStatus', 'networkGithubMirrorStatus');

            // Document delegation survives #paramsModal replaceWith on fragment load.
            if (!bindGithubMirrorSettingsEvents._delegated) {
                bindGithubMirrorSettingsEvents._delegated = true;
                doc.addEventListener('click', (event) => {
                    const presetBtn = event.target?.closest?.('#githubMirrorsPresetBtn');
                    if (presetBtn) {
                        event.preventDefault();
                        const input = liveEl('githubMirrorsInput', 'githubMirrorsInput');
                        if (input) input.value = DEFAULT_GITHUB_MIRRORS_TEXT;
                        markSettingsDirty(true);
                        setGithubMirrorStatusText('已填入默认 GitHub 镜像，请保存设置后生效', 'ok');
                        return;
                    }
                    const clearBtn = event.target?.closest?.('#githubMirrorsClearBtn');
                    if (clearBtn) {
                        event.preventDefault();
                        const input = liveEl('githubMirrorsInput', 'githubMirrorsInput');
                        if (input) input.value = '';
                        markSettingsDirty(true);
                        setGithubMirrorStatusText('已清空镜像列表（将直连 GitHub 官方），请保存设置后生效', 'ok');
                        return;
                    }
                    const testBtn = event.target?.closest?.('#githubMirrorsTestBtn');
                    if (!testBtn) return;
                    event.preventDefault();
                    event.stopPropagation();
                    void runGithubMirrorSpeedTest(testBtn);
                });
            }
        }

        function bindEngineInstallAndModelsEvents() {
            els.installTestBtn?.addEventListener('click', testInstall);
            els.installCheckUpdateBtn?.addEventListener('click', () => {
                void checkTransWithAiEngineUpdate();
            });
            els.installBrowseBtn?.addEventListener('click', browseInstallPath);
            els.engineBackendSelect?.addEventListener('change', () => {
                syncEngineBackendUi();
                updateEnvBanner();
                if (readEngineBackendFromForm() !== 'twai') {
                    void ensureEngineModelsCatalog({ silent: true });
                }
            });
            els.engineInstallBrowseBtn?.addEventListener('click', async () => {
                const res = await electron?.selectFolder?.({ title: '选择 Transub Engine 目录' });
                if (res?.ok && !res.canceled && res.path && els.engineInstallPathInput) {
                    els.engineInstallPathInput.value = res.path;
                    await refreshEngineStatus();
                }
            });
            els.engineInstallUseBundledBtn?.addEventListener('click', async () => {
                let res = null;
                try {
                    res = await electron?.transubEngineBundledPath?.();
                } catch (err) {
                    setEngineStatusText(err?.message || '无法读取内置引擎路径', 'err');
                    return;
                }
                if (!res?.ok || !res.path) {
                    setEngineStatusText(res?.error || '未找到内置引擎目录（transub-engine）', 'err');
                    return;
                }
                if (!res.present) {
                    setEngineStatusText(
                        uiTf('未找到内置引擎目录：{path}（需含 ENGINE_ROOT 或 runtime\\python.exe）', { path: res.path }),
                        'err',
                    );
                    return;
                }
                getEngineEnvUi()?.setCachedBundledEnginePath?.(String(res.path));
                const bundled = getEngineEnvUi()?.getCachedBundledEnginePath?.() || String(res.path);
                if (els.engineInstallPathInput) {
                    els.engineInstallPathInput.value = bundled;
                    els.engineInstallPathInput.placeholder = bundled;
                }
                markSettingsDirty(true);
                setSaveParamsStatus('有未保存更改', 'warn');
                await refreshEngineStatus();
            });
            els.engineHfMirrorPresetBtn?.addEventListener('click', () => {
                if (els.engineHfEndpointInput) els.engineHfEndpointInput.value = 'https://hf-mirror.com';
                setNetworkHfStatus('已填入国内镜像 https://hf-mirror.com，请保存设置后重新下载', 'ok');
            });
            els.engineHfOfficialPresetBtn?.addEventListener('click', () => {
                if (els.engineHfEndpointInput) els.engineHfEndpointInput.value = '';
                setNetworkHfStatus('已改为直连官方 Hugging Face，请保存设置后重试', 'ok');
            });
            els.engineHfTestBtn?.addEventListener('click', async () => {
                const payload = {
                    hfEndpoint: els.engineHfEndpointInput?.value?.trim() || '',
                    ...readProxyOptionsFromForm(),
                };
                setNetworkHfStatus('测试中…', 'busy');
                if (els.engineHfTestBtn) els.engineHfTestBtn.disabled = true;
                try {
                    const res = await electron?.transubTestHfEndpoint?.(payload);
                    if (res?.ok) {
                        setNetworkHfStatus(res.message || '连接成功', 'ok');
                    } else {
                        setNetworkHfStatus(res?.error || '连接失败', 'err');
                    }
                } catch (err) {
                    setNetworkHfStatus(err?.message || String(err), 'err');
                } finally {
                    if (els.engineHfTestBtn) els.engineHfTestBtn.disabled = false;
                }
            });
            els.proxyEnabledCheck?.addEventListener('change', () => {
                syncProxySettingsUi();
            });
            bindTransubStationSettingsEvents();
            bindGithubMirrorSettingsEvents();
            els.proxyTestBtn?.addEventListener('click', async () => {
                const payload = readProxyOptionsFromForm();
                setProxyTestStatus('测试中…', 'busy');
                if (els.proxyTestBtn) els.proxyTestBtn.disabled = true;
                try {
                    const res = await electron?.transubTestProxy?.(payload);
                    if (res?.ok) {
                        setProxyTestStatus(res.message || '连接成功', 'ok');
                    } else {
                        setProxyTestStatus(res?.error || '连接失败', 'err');
                    }
                } catch (err) {
                    setProxyTestStatus(err?.message || String(err), 'err');
                } finally {
                    if (els.proxyTestBtn) els.proxyTestBtn.disabled = false;
                    syncProxySettingsUi();
                }
            });
            els.engineTestBtn?.addEventListener('click', async () => {
                const btn = els.engineTestBtn;
                const prevLabel = btn?.textContent || '检测引擎';
                if (btn) {
                    btn.disabled = true;
                    btn.textContent = '检测中…';
                }
                try {
                    const res = await refreshEngineStatus();
                    if (res?.ok) {
                        appendLog(els.engineStatus?.textContent || '引擎就绪', 'ok');
                    } else {
                        appendLog(res?.error || '引擎未就绪', 'err');
                    }
                    await showEngineTestResultDialog(res);
                } finally {
                    if (btn) {
                        btn.disabled = false;
                        btn.textContent = prevLabel;
                    }
                }
            });
            bindModelsWorkspaceEvents();
            els.engineEnsureGpuBtn?.addEventListener('click', () => {
                void ensureEngineGpuSupport({ force: false });
            });
            els.engineEnsureTorchCudaBtn?.addEventListener('click', () => {
                void ensureEngineTorchCuda({ force: true, silent: false });
            });
            (typeof window !== 'undefined' ? window : global)?.addEventListener?.('transub:ensure-torch-cuda', () => {
                openAppSettings('install');
                try {
                    global.TransubSettingsModalUi?.scrollToEnvSection?.('settingsEnvSectionGpu');
                } catch (_) { /* ignore */ }
                void ensureEngineTorchCuda({ force: true, silent: false });
            });
            els.engineScanCudaBtn?.addEventListener('click', () => {
                void scanAndReuseEngineCuda();
            });
            els.enginePickCudaRootBtn?.addEventListener('click', () => {
                void (async () => {
                    if (!electron?.transubEnginePickCudaRoot) {
                        appendLog('当前环境不支持选择 CUDA 目录', 'err');
                        return;
                    }
                    const res = await electron.transubEnginePickCudaRoot({});
                    if (res?.cancelled) return;
                    if (!res?.ok) {
                        appendLog(res?.error || '选择 CUDA 目录失败', 'err');
                        setEngineGpuStatusText(res?.error || '选择失败', 'err');
                        return;
                    }
                    appendLog(res.message || '已加入 CUDA 扫描目录', 'ok');
                    setEngineGpuStatusText(res.message || '已加入扫描目录', 'ok');
                    const again = global.TransubAppConfirm
                        ? await global.TransubAppConfirm({
                            title: '扫描复用',
                            message: '目录已加入。是否立即扫描并复用到引擎？',
                            primaryLabel: '立即扫描',
                            secondaryLabel: '稍后',
                        })
                        : false;
                    if (again) void scanAndReuseEngineCuda();
                })();
            });
            els.engineManualGpuBtn?.addEventListener('click', () => {
                void manualEngineDownloadInstall({ kinds: ['gpu'] });
            });
            if (electron?.onAdvancedManagedLlmProgress) {
                electron.onAdvancedManagedLlmProgress((p) => {
                    if (!p || getEngineDownloadActiveSource() !== 'managed') return;
                    const phase = String(p.phase || '');
                    const msg = String(p.message || '').trim();
                    const sizeLine = formatEngineDownloadSizeLine(p);
                    const sizeAlreadyInMsg = !!(sizeLine && msg && /\/\s*[\d.]+\s*(B|KB|MB|GB)/i.test(msg));
                    const displayMsg = msg && sizeLine && !sizeAlreadyInMsg
                        ? `${msg} · ${sizeLine}`
                        : (msg || sizeLine);
                    if (Number.isFinite(Number(p.pct ?? p.percent))) {
                        setEngineDownloadProgressPct(p.pct ?? p.percent);
                    }
                    if (displayMsg) {
                        setEngineDownloadProgressVisible(true, displayMsg);
                        if (msg) appendEngineDownloadLog(msg);
                        if (phase === 'done') {
                            setEngineDownloadProgressPct(100);
                            // Pull finished in model library — refresh task MT/ASR picks.
                            void refreshEngineModels({ silent: true });
                        } else if (phase === 'progress' || phase === 'start') {
                            appendAppEngineDownloadProgressLog(displayMsg, { force: phase === 'start' });
                            setEngineStatusText(displayMsg, 'busy');
                        }
                    }
                });
            }
            // Managed LLM install/delete/role change from settings or other windows.
            if (electron?.onAdvancedLlmModelChanged) {
                electron.onAdvancedLlmModelChanged(() => {
                    void refreshEngineModels({ silent: true });
                    try { syncRetranslateModalModelUi(); } catch (_) { /* ignore */ }
                });
            }
            if (electron?.onEngineDownloadProgress) {
                electron.onEngineDownloadProgress((p) => {
                    if (!p) return;
                    const phase = String(p.phase || '');
                    const msg = String(p.message || '').trim();
                    const sizeLine = formatEngineDownloadSizeLine(p);
                    const sizeAlreadyInMsg = !!(sizeLine && msg && /\/\s*[\d.]+\s*(B|KB|MB|GB)/i.test(msg));
                    const displayMsg = msg && sizeLine && !sizeAlreadyInMsg
                        ? `${msg} · ${sizeLine}`
                        : (msg || sizeLine);
                    if (Number.isFinite(Number(p.pct ?? p.percent))) {
                        setEngineDownloadProgressPct(p.pct ?? p.percent);
                    }
                    if (displayMsg && (phase === 'progress' || phase === 'done' || phase === 'error' || phase === 'cancelled' || phase === 'start')) {
                        setEngineDownloadProgressVisible(true, displayMsg);
                        // Log message text only (size ticks live on the progress line).
                        if (msg) appendEngineDownloadLog(msg);
                        if (phase === 'done') {
                            appendLog(msg || displayMsg, 'ok');
                            setEngineStatusText(msg || displayMsg, 'ok');
                            setEngineDownloadProgressPct(100);
                            void refreshEngineModels({ silent: true });
                            void refreshEngineGpuStatus({ silent: true });
                            void refreshEngineDemucsStatus({ silent: true });
                        } else if (phase === 'error' || phase === 'cancelled') {
                            appendLog(msg || displayMsg, phase === 'cancelled' ? 'warn' : 'err');
                            setEngineStatusText(msg || displayMsg, phase === 'cancelled' ? 'warn' : 'err');
                            void refreshEngineDemucsStatus({ silent: true });
                        } else if (phase === 'progress' || phase === 'start') {
                            appendAppEngineDownloadProgressLog(displayMsg, { force: phase === 'start' });
                            setEngineStatusText(displayMsg, 'busy');
                        }
                    } else if (sizeLine && phase === 'progress') {
                        setEngineDownloadProgressVisible(true, sizeLine);
                        appendAppEngineDownloadProgressLog(sizeLine);
                        setEngineStatusText(sizeLine, 'busy');
                    }
                });
            }
            els.closeEngineModelsLibraryBtn?.addEventListener('click', () => {
                closeEngineModelsLibrary();
            });
            els.engineModelsLibraryModal?.addEventListener('click', (event) => {
                if (event.target === els.engineModelsLibraryModal) closeEngineModelsLibrary();
            });
            document.addEventListener('keydown', (event) => {
                if (event.key !== 'Escape') return;
                if (!getIsStandaloneSettings()) return;
                if (!isEngineModelsLibraryOpen()) return;
                event.preventDefault();
                event.stopPropagation();
                closeEngineModelsLibrary();
            }, true);
        }

        function bindFormParamAndStyleEvents() {
            els.settingsBurnOutputDirBrowseBtn?.addEventListener('click', () => {
                void browseSettingsBurnOutputDir();
            });
            els.settingsBurnOutputDirClearBtn?.addEventListener('click', () => {
                clearSettingsBurnOutputDir();
            });
            els.settingsBurnEncoderSelect?.addEventListener('change', () => {
                const id = els.settingsBurnEncoderSelect?.value;
                const burn = global.TransubSubtitleBurnCore || {};
                const preset = burn.getEncoderPreset?.(id);
                if (preset?.pro && !getAdvancedEntitled()) {
                    els.settingsBurnEncoderSelect.value = 'libx264';
                    try {
                        global.promptProUnlockRequired?.({ featureLabel: '硬件编码' });
                    } catch (_) { /* ignore */ }
                }
            });
            els.deviceSelect?.addEventListener('change', () => {
                syncBatchSizeUi();
                syncDeviceOptionsForMode();
                syncExpertCustomHints();
                updateParamsSummary();
                syncMtModelChipUi();
                void updateQwenAsrBatchHint();
            });
            els.logLevelSelect?.addEventListener('change', () => {
                syncLogLevelHint();
                syncExpertCustomHints();
            });
            els.taskSelect?.addEventListener('change', () => {
                syncChineseSubtitleVariantUi();
                updateParamsSummary();
            });
            els.mergeBilingualCheck?.addEventListener('change', () => {
                syncMergeBilingualUi();
                updateParamsSummary();
            });
            els.mergeBilingualOrderSelect?.addEventListener('change', () => {
                syncBilingualChipUi();
                updateParamsSummary();
            });
            els.deleteSourcesAfterMergeCheck?.addEventListener('change', () => {
                syncBilingualChipUi();
                updateParamsSummary();
            });
            els.bilingualChipBtn?.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (readTaskFromForm() !== 'dual') {
                    showToast('请先在设置 → 常规将任务类型设为「双语」', 'info');
                    return;
                }
                setBilingualMenuOpen(!getBilingualMenuOpen());
            });
            els.bilingualMenu?.addEventListener('click', (event) => event.stopPropagation());
            els.quickMergeBilingualCheck?.addEventListener('change', () => {
                applyBilingualChipToFormAndPersist();
            });
            els.quickMergeBilingualOrderSelect?.addEventListener('change', () => {
                applyBilingualChipToFormAndPersist();
            });
            els.quickDeleteSourcesAfterMergeCheck?.addEventListener('change', () => {
                applyBilingualChipToFormAndPersist();
            });
            els.bilingualOpenOutputSettingsBtn?.addEventListener('click', () => {
                setBilingualMenuOpen(false);
                openAppSettings('output');
            });
            els.filmAudioEnhanceCheck?.addEventListener('change', () => {
                if (els.filmAudioEnhanceCheck?.checked) {
                    const n = audioMutexApi.applyFilmEnhanceOn
                        ? audioMutexApi.applyFilmEnhanceOn({
                            filmAudioEnhance: true,
                            filmVadPreset: !!els.filmVadPresetCheck?.checked,
                            vadSensitive: !!els.vadSensitiveCheck?.checked,
                            audioLightDenoise: !!els.audioLightDenoiseCheck?.checked,
                        })
                        : {
                            filmVadPreset: false,
                            vadSensitive: false,
                            audioLightDenoise: false,
                        };
                    if (els.filmVadPresetCheck) els.filmVadPresetCheck.checked = !!n.filmVadPreset;
                    if (els.vadSensitiveCheck) els.vadSensitiveCheck.checked = !!n.vadSensitive;
                    if (els.quickVadSensitiveCheck) {
                        els.quickVadSensitiveCheck.checked = !!n.vadSensitive;
                    }
                    if (els.audioLightDenoiseCheck) {
                        els.audioLightDenoiseCheck.checked = !!n.audioLightDenoise;
                    }
                }
                updateParamsSummary();
            });
            els.filmVadPresetCheck?.addEventListener('change', () => {
                if (els.filmVadPresetCheck?.checked && els.filmAudioEnhanceCheck) {
                    els.filmAudioEnhanceCheck.checked = false;
                }
                updateParamsSummary();
            });
            els.audioLightDenoiseCheck?.addEventListener('change', () => {
                if (els.audioLightDenoiseCheck?.checked) {
                    const n = audioMutexApi.applyLightDenoiseOn
                        ? audioMutexApi.applyLightDenoiseOn({
                            audioLightDenoise: true,
                            filmAudioEnhance: !!els.filmAudioEnhanceCheck?.checked,
                        })
                        : { filmAudioEnhance: false };
                    if (els.filmAudioEnhanceCheck) {
                        els.filmAudioEnhanceCheck.checked = !!n.filmAudioEnhance;
                    }
                }
                updateParamsSummary();
            });
            els.smartTranslateCheck?.addEventListener('change', () => {
                syncSmartTranslateUi();
                updateModelSelectHint();
                updateParamsSummary();
            });
            els.smartTranslateFaithfulCheck?.addEventListener('change', () => {
                if (els.quickFaithfulCheck) {
                    els.quickFaithfulCheck.checked = !!els.smartTranslateFaithfulCheck.checked;
                }
                updateParamsSummary();
            });
            els.translateStyleEnabledCheck?.addEventListener('change', () => {
                setTranslateStyleEnabledState(!!els.translateStyleEnabledCheck.checked, {
                    syncDom: false,
                    localGesture: true,
                });
                updateTranslateStyleUi();
                syncTranslateStyleChipUi();
                markSettingsDirty();
                updateParamsSummary();
            });
            els.translateStylePresetSelect?.addEventListener('change', () => {
                updateTranslateStyleUi();
                syncTranslateStyleChipUi();
                markSettingsDirty();
                updateParamsSummary();
            });
            els.translateStyleCustomNoteInput?.addEventListener('input', () => {
                if (els.translateStyleMenuCustomNote) {
                    els.translateStyleMenuCustomNote.value = els.translateStyleCustomNoteInput.value || '';
                }
                markSettingsDirty();
            });
            els.translateStylePickerSelect?.addEventListener('change', syncTranslateStylePickerCustomWrap);
            els.translateStylePickerCancelBtn?.addEventListener('click', closeTranslateStylePickerModal);
            els.translateStylePickerConfirmBtn?.addEventListener('click', applyTranslateStylePicker);
            els.translateStylePickerModal?.addEventListener('click', (e) => {
                if (e.target === els.translateStylePickerModal) closeTranslateStylePickerModal();
            });
            els.retranslateStyleEnabledCheck?.addEventListener('change', syncRetranslateStyleCustomWrap);
            els.retranslateStyleSelect?.addEventListener('change', syncRetranslateStyleCustomWrap);
            els.smartTranslateHybridCheck?.addEventListener('change', () => {
                syncHybridMtUi();
                syncTranslateChipUi();
                updateModelSelectHint();
                updateParamsSummary();
                updateReadinessStrip();
            });
            els.smartTranslatePolishCheck?.addEventListener('change', () => {
                syncSmartTranslateReadinessUi();
                syncTranslateChipUi();
                updateParamsSummary();
                updateReadinessStrip();
            });
            els.transcribeModelSelect?.addEventListener('change', () => {
                setModelPathOnForm('transcribe', els.transcribeModelSelect.value, { syncSelect: false });
                applyAutoDetectedModelsFromCache();
                updateModelSelectHint();
                updateParamsSummary();
            });
            els.translateModelSelect?.addEventListener('change', () => {
                setModelPathOnForm('translate', els.translateModelSelect.value, { syncSelect: false });
                applyAutoDetectedModelsFromCache();
                updateModelSelectHint();
                updateParamsSummary();
            });
            els.transcribeModelPathInput?.addEventListener('change', () => {
                syncModelSelectToPath('transcribe', readModelPathFromForm('transcribe'));
                updateModelSelectHint();
                updateParamsSummary();
            });
            els.translateModelPathInput?.addEventListener('change', () => {
                syncModelSelectToPath('translate', readModelPathFromForm('translate'));
                updateModelSelectHint();
                updateParamsSummary();
            });
            els.transcribeModelBrowseBtn?.addEventListener('click', () => {
                void browseModelPath('transcribe');
            });
            els.translateModelBrowseBtn?.addEventListener('click', () => {
                void browseModelPath('translate');
            });
            els.installPathInput?.addEventListener('change', () => {
                void refreshModelSelects(buildSavedOptionsFromForm());
            });
            els.overwriteCheck?.addEventListener('change', updateParamsSummary);
            const syncOutputTrackNamingFromForm = () => {
                const targetOn = els.outputWriteTargetCheck ? !!els.outputWriteTargetCheck.checked : true;
                const sourceOn = els.outputWriteSourceCheck ? !!els.outputWriteSourceCheck.checked : true;
                if (!targetOn && !sourceOn && els.outputWriteTargetCheck) {
                    els.outputWriteTargetCheck.checked = true;
                }
                const allowNaming = els.outputWriteTargetCheck ? !!els.outputWriteTargetCheck.checked : true;
                if (els.targetSubtitleNamingSelect) els.targetSubtitleNamingSelect.disabled = !allowNaming;
                els.targetSubtitleNamingWrap?.classList.toggle('opacity-50', !allowNaming);
                els.targetSubtitleNamingWrap?.classList.toggle('pointer-events-none', !allowNaming);
            };
            els.outputWriteTargetCheck?.addEventListener('change', () => {
                syncOutputTrackNamingFromForm();
                markSettingsDirty(true);
                updateParamsSummary();
            });
            els.outputWriteSourceCheck?.addEventListener('change', () => {
                syncOutputTrackNamingFromForm();
                markSettingsDirty(true);
                updateParamsSummary();
            });
            els.targetSubtitleNamingSelect?.addEventListener('change', () => {
                markSettingsDirty(true);
                updateParamsSummary();
            });
            els.insertSoftwareCreditCheck?.addEventListener('change', () => {
                setInsertSoftwareCreditIsDefault(false);
                markSettingsDirty(true);
                updateParamsSummary();
            });
            ['subFormatSrt', 'subFormatVtt', 'subFormatAss', 'subFormatLrc'].forEach((id) => {
                els[id]?.addEventListener('change', updateParamsSummary);
            });
            els.vadEnabledCheck?.addEventListener('change', syncExpertCustomHints);
            els.vadSensitiveCheck?.addEventListener('change', () => {
                if (els.vadSensitiveCheck?.checked && els.vadAggressiveCheck) {
                    els.vadAggressiveCheck.checked = false;
                }
                if (els.vadSensitiveCheck?.checked && els.engineVadModelSelect) {
                    els.engineVadModelSelect.value = 'whisperseg-asmr';
                    // WhisperSeg only works with Whisper ASR (not SenseVoice / FunASR).
                    const asrNow = String(els.engineAsrModelSelect?.value || '').toLowerCase();
                    if (els.engineAsrModelSelect && !asrNow.includes('whisper')) {
                        const prefer = [...els.engineAsrModelSelect.options].some((o) => o.value === 'whisper-large-v3-turbo')
                            ? 'whisper-large-v3-turbo'
                            : ([...els.engineAsrModelSelect.options].find((o) => String(o.value).includes('whisper'))?.value || '');
                        if (prefer) {
                            els.engineAsrModelSelect.value = prefer;
                            appendLog(`灵敏检出：ASR 已从 SenseVoice 切换为 ${prefer}（WhisperSeg 仅支持 Whisper）`, 'info');
                        }
                    }
                    // Align expert knobs with Engine WhisperSeg sensitive preset (JA AV soft recall).
                    if (els.vadThresholdInput) els.vadThresholdInput.value = '0.18';
                    if (els.vadMinSpeechDurationInput) els.vadMinSpeechDurationInput.value = '60';
                    if (els.vadMinSilenceDurationInput) els.vadMinSilenceDurationInput.value = '140';
                    if (els.vadSpeechPadInput) els.vadSpeechPadInput.value = '350';
                    if (els.hallucinationSilenceInput && !String(els.hallucinationSilenceInput.value || '').trim()) {
                        els.hallucinationSilenceInput.value = '4';
                    }
                    if (els.audioLightDenoiseCheck) els.audioLightDenoiseCheck.checked = false;
                    if (els.filmAudioEnhanceCheck) els.filmAudioEnhanceCheck.checked = false;
                    if (els.filmVadPresetCheck) els.filmVadPresetCheck.checked = false;
                    if (audioMutexApi.applySensitiveOn) {
                        const n = audioMutexApi.applySensitiveOn({
                            vadSensitive: true,
                            filmAudioEnhance: true,
                            filmVadPreset: true,
                            audioLightDenoise: true,
                        });
                        if (els.filmAudioEnhanceCheck) {
                            els.filmAudioEnhanceCheck.checked = !!n.filmAudioEnhance;
                        }
                        if (els.filmVadPresetCheck) els.filmVadPresetCheck.checked = !!n.filmVadPreset;
                        if (els.audioLightDenoiseCheck) {
                            els.audioLightDenoiseCheck.checked = !!n.audioLightDenoise;
                        }
                    }
                    setSaveParamsStatus('灵敏检出：Whisper ASR + whisperseg-asmr（请确认两者已下载）', 'warn');
                    appendLog('灵敏检出：VAD 已切换为 whisperseg-asmr，请确认模型已下载', 'info');
                }
                if (els.quickVadSensitiveCheck) {
                    els.quickVadSensitiveCheck.checked = !!els.vadSensitiveCheck?.checked;
                }
                mirrorSelectValue(els.engineAsrModelSelect, els.quickAsrModelSelect);
                mirrorSelectValue(els.engineVadModelSelect, els.quickVadModelSelect);
                syncExpertCustomHints();
                syncExpertExtraChipsUi();
            });
            els.engineAsrModelSelect?.addEventListener('change', () => {
                updateAsrWindowTip();
                void updateQwenAsrBatchHint();
                const asr = String(els.engineAsrModelSelect?.value || '').toLowerCase();
                if (!asr.includes('whisper')) {
                    if (els.vadSensitiveCheck?.checked) {
                        els.vadSensitiveCheck.checked = false;
                    }
                    const vadNow = String(els.engineVadModelSelect?.value || '').toLowerCase();
                    if (
                        els.engineVadModelSelect
                        && (
                            vadNow.includes('whisperseg')
                            || vadNow === 'silero-vad'
                            || vadNow === 'silero'
                        )
                    ) {
                        els.engineVadModelSelect.value = 'fsmn-vad';
                        setSaveParamsStatus('SenseVoice 仅支持 fsmn-vad，已自动切换', 'warn');
                        appendLog('ASR 为 SenseVoice：VAD 已改回 fsmn-vad（Silero/WhisperSeg 仅支持 Whisper）', 'info');
                    }
                }
                mirrorSelectValue(els.engineAsrModelSelect, els.quickAsrModelSelect);
                mirrorSelectValue(els.engineVadModelSelect, els.quickVadModelSelect);
                if (els.quickVadSensitiveCheck) {
                    els.quickVadSensitiveCheck.checked = !!els.vadSensitiveCheck?.checked;
                }
                syncExpertCustomHints();
                syncExpertExtraChipsUi();
                // Settings / recommend / quick-ASR may change the model while a preset chip is shown.
                adoptManualAsrFromUserChange({ persist: false });
                void maybePromptTorchCudaOnAsrSelect(String(els.engineAsrModelSelect?.value || '').trim());
            });
            els.qwenAsrBatchModeSelect?.addEventListener('change', () => {
                void updateQwenAsrBatchHint();
            });
            els.perfProfileSelect?.addEventListener('change', () => {
                void updateQwenAsrBatchHint();
            });
            els.vadAggressiveCheck?.addEventListener('change', () => {
                if (els.vadAggressiveCheck?.checked && els.vadSensitiveCheck) {
                    els.vadSensitiveCheck.checked = false;
                }
                if (els.quickVadSensitiveCheck) {
                    els.quickVadSensitiveCheck.checked = !!els.vadSensitiveCheck?.checked;
                }
                syncExpertCustomHints();
                syncExpertExtraChipsUi();
            });
            els.engineVadModelSelect?.addEventListener('change', () => {
                mirrorSelectValue(els.engineVadModelSelect, els.quickVadModelSelect);
                syncExpertExtraChipsUi();
            });
            els.glossaryMtCheck?.addEventListener('change', () => {
                if (els.quickGlossaryMtCheck) {
                    els.quickGlossaryMtCheck.checked = !!els.glossaryMtCheck.checked;
                }
                syncExpertExtraChipsUi();
            });
            const markDirtyFromParamsEvent = (event) => {
                const t = event.target;
                if (!(t instanceof HTMLElement)) return;
                if (t.closest('#presetNameModal')) return;
                if (t.id === 'presetSelect') return;
                markSettingsDirty(true);
                if (els.saveParamsStatus && !/保存中|已保存失败/.test(els.saveParamsStatus.textContent || '')) {
                    setSaveParamsStatus('有未保存更改', 'warn');
                }
            };
            els.paramsModal?.addEventListener('change', (event) => {
                const t = event.target;
                if (!(t instanceof HTMLElement)) return;
                markDirtyFromParamsEvent(event);
                if (t.id === 'engineAsrModelSelect' || t.id === 'engineProfileSelect') {
                    updateAsrRecommendChip();
                }
                if (t.closest('[data-settings-level="expert"]') || t.id === 'audioSuffixesInput'
                    || t.id === 'retranscribeWarmLightCheck' || t.id === 'logLevelSelect'
                    || t.id === 'maxBatchSizeInput') {
                    syncExpertCustomHints();
                }
            });
            els.asrRecommendApplyBtn?.addEventListener('click', () => applyAsrRecommendFromChip());
            els.asrRecommendDismissBtn?.addEventListener('click', () => {
                const id = String(els.asrRecommendChip?.dataset?.recommendedAsr || '').trim();
                const profile = String(getCachedHardwareRecommend()?.profile || '').trim();
                setAsrRecommendDismissedKey(`${id}|${profile}`);
                if (els.asrRecommendChip) {
                    els.asrRecommendChip.classList.add('hidden');
                    els.asrRecommendChip.hidden = true;
                }
                syncQuickAsrRecommendChip();
            });
            updateAsrRecommendChip();
            els.paramsModal?.addEventListener('input', (event) => {
                const t = event.target;
                if (!(t instanceof HTMLElement)) return;
                markDirtyFromParamsEvent(event);
                if (t.closest('[data-settings-level="expert"]') || t.id === 'audioSuffixesInput'
                    || t.id === 'maxBatchSizeInput') {
                    syncExpertCustomHints();
                }
            });
            els.subtitleEditorBackendSelect?.addEventListener('change', () => {
                void refreshSubtitleEditorPathHint();
            });
            els.subtitleEditorPathBrowseBtn?.addEventListener('click', async () => {
                try {
                    const res = await electron?.transubPickExternalEditor?.();
                    if (!res?.ok || res.canceled || !res.path) return;
                    if (els.subtitleEditorPathInput) els.subtitleEditorPathInput.value = res.path;
                    if (els.subtitleEditorBackendSelect) els.subtitleEditorBackendSelect.value = 'external';
                    markSettingsDirty(true);
                    setSaveParamsStatus('有未保存更改', 'warn');
                    void refreshSubtitleEditorPathHint();
                } catch (err) {
                    setSaveParamsStatus(err?.message || '选择失败', 'err');
                }
            });
            els.subtitleEditorPathProbeBtn?.addEventListener('click', () => {
                void refreshSubtitleEditorPathHint();
            });
        }

        function bindEditorAndRuntimeEvents() {
            if (!getIsStandaloneSettings()) {
                els.shutdownDelayInput?.addEventListener('change', syncPostTaskToMain);
                els.shutdownDelayInput?.addEventListener('click', (event) => event.stopPropagation());
                els.stopBtn?.addEventListener('click', stopTask);
                els.openSubtitleFileBtn?.addEventListener('click', () => {
                    global.TransubSubtitleEditor?.openWelcome?.();
                });
                document.addEventListener('click', (e) => {
                    const btn = e.target.closest('[data-edit-sub]');
                    if (!btn) return;
                    e.preventDefault();
                    global.TransubSubtitleEditor?.openEditor?.(
                        btn.getAttribute('data-edit-sub'),
                        btn.getAttribute('data-edit-video') || '',
                    );
                });
                bindJobEventListeners();
            }

            // External Editor (Rust) writeback stamp → toast on main / settings windows.
            electron?.onEditorWriteback?.((payload) => {
                const sub = String(payload?.subPath || '').trim();
                const name = sub ? sub.replace(/^.*[/\\]/, '') : '';
                const msg = name
                    ? `外部编辑器已保存：${name}`
                    : '外部编辑器已保存字幕';
                showToast(msg, 'ok');
                try {
                    global.TransubShelf?.refresh?.({ silent: true });
                } catch (_) { /* optional */ }
                try {
                    global.TransubSubtitleLibrary?.refresh?.({ silent: true });
                } catch (_) { /* optional */ }
            });
        }

        function bindEvents() {
            // Settings-fragment buttons use document delegation and must bind
            // even if other desktop-only handlers are skipped.
            try { bindTransubStationSettingsEvents(); } catch (_) { /* ignore */ }
            try { bindGithubMirrorSettingsEvents(); } catch (_) { /* ignore */ }
            if (!electron) return;
            bindQueueAndToolbarEvents();
            bindThemeAndParamsShellEvents();
            bindEngineInstallAndModelsEvents();
            bindFormParamAndStyleEvents();
            bindEditorAndRuntimeEvents();
        }

        return {
            bindEvents,
            bindQueueAndToolbarEvents,
            bindThemeAndParamsShellEvents,
            bindModelsWorkspaceEvents,
            bindEngineInstallAndModelsEvents,
            bindTransubStationSettingsEvents,
            bindGithubMirrorSettingsEvents,
            bindFormParamAndStyleEvents,
            bindEditorAndRuntimeEvents,
        };
    }

    function bindEvents(deps) {
        return createAppEventsBinder(deps).bindEvents();
    }

    return { createAppEventsBinder, bindEvents };
}));
