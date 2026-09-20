/**
 * Chrome wire: resource usage, main UI extras, quick toolbar chips, TWAI model select.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAppWireChromeToolbar = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function appWireChromeToolbarFactory(global) {
    function wireUtils() {
        return (global && global.TransubAppWireUtils)
            || (typeof require === 'function' ? require('./app-wire-utils-core.js') : null)
            || {};
    }

    /**
     * @param {object} host
     * @returns {object} host
     */
    function install(host) {
        const h = host || {};
        const utils = wireUtils();
        const { getBindApi, resolveApi, late, entitled } = utils;
        const bindApi = typeof getBindApi === 'function' ? getBindApi() : {};
        const { bindCallMethods, createLazyFactory } = bindApi;
        if (typeof createLazyFactory !== 'function') return h;

        const g = global;
        const factoryStatusBarApi = h.factoryStatusBarApi
            || (g && g.TransubFactoryStatusBar)
            || {};
        const startReadinessApi = h.startReadinessApi
            || (g && g.TransubStartReadiness)
            || {};
        const modelApi = h.modelApi || resolveApi(h, 'modelApi', 'TransubTransWithAiModels');
        const DEVICE_LABELS = h.DEVICE_LABELS || {
            cuda: 'GPU', auto: '自动', amd: 'GPU AMD', cpu: 'CPU',
            cuda_low_vram: 'GPU 低显存', cuda_batch: 'GPU 批处理', modal: 'Modal 云端',
        };

        // --- resource usage ---
        h.getResourceUsageUi = createLazyFactory(
            () => resolveApi(h, 'resourceUsageUiApi', 'TransubResourceUsageUi').createResourceUsageUi,
            () => ({
                state: h.state,
                els: h.els,
                electron: h.electron,
                factoryStatusBarApi,
                getSavedOptionsSnapshot: () => (typeof h.getSavedOptionsSnapshot === 'function'
                    ? h.getSavedOptionsSnapshot()
                    : h.savedOptionsSnapshot),
                syncFactoryEngineStatus: (...a) => h.syncFactoryEngineStatus(...a),
                markSettingsDirty: (...a) => h.markSettingsDirty(...a),
                uiTf: late(h, 'uiTf'),
            }),
        );
        h.syncResourceUsageMonitor = () => h.getResourceUsageUi()?.syncResourceUsageMonitor?.();
        h.bindResourceUsageSetting = () => h.getResourceUsageUi()?.bindResourceUsageSetting?.();

        // --- main UI extras ---
        h.getMainUiExtras = createLazyFactory(
            () => resolveApi(h, 'mainUiExtrasApi', 'TransubMainUiExtras').createMainUiExtras,
            () => ({
                state: h.state,
                els: h.els,
                electron: h.electron,
                bindMainLogSplitter: late(h, 'bindMainLogSplitter'),
                setMoreMenuOpen: late(h, 'setMoreMenuOpen'),
                toggleDensity: late(h, 'toggleDensity'),
                toggleMainTheme: late(h, 'toggleMainTheme'),
                openCliCommandModal: late(h, 'openCliCommandModal'),
                refreshCliCommandPreview: late(h, 'refreshCliCommandPreview'),
                closeCliCommandModal: late(h, 'closeCliCommandModal'),
                showToast: late(h, 'showToast'),
                addVideos: (...a) => h.addVideos(...a),
                addFolder: (...a) => h.addFolder(...a),
                autoAddMissingSubtitles: (...a) => h.autoAddMissingSubtitles(...a),
                updateQcBanner: late(h, 'updateQcBanner'),
                runPostBatchQcFix: late(h, 'runPostBatchQcFix'),
                runPostBatchQcSmartFix: late(h, 'runPostBatchQcSmartFix'),
                openFirstQcIssueItem: (...a) => h.openFirstQcIssueItem(...a),
                openAppSettings: late(h, 'openAppSettings'),
                ux: typeof h.ux === 'function' ? h.ux : () => h.ux,
                getModelsMenuOpen: late(h, 'getModelsMenuOpen'),
                setModelsMenuOpen: late(h, 'setModelsMenuOpen'),
                toggleModelsChip: late(h, 'toggleModelsChip'),
                setModelsPickSlot: late(h, 'setModelsPickSlot'),
                setQuickTranslateMode: late(h, 'setQuickTranslateMode'),
                setTranslateMtPickMode: late(h, 'setTranslateMtPickMode'),
                setExternalTranslateSource: late(h, 'setExternalTranslateSource'),
                getParamsMoreMenuOpen: late(h, 'getParamsMoreMenuOpen'),
                setParamsMoreMenuOpen: late(h, 'setParamsMoreMenuOpen'),
                adoptManualAsrFromUserChange: late(h, 'adoptManualAsrFromUserChange'),
                persistFormOptionsQuiet: late(h, 'persistFormOptionsQuiet'),
                getCachedHardwareRecommend: () => (typeof h.getCachedHardwareRecommend === 'function'
                    ? h.getCachedHardwareRecommend()
                    : h.cachedHardwareRecommend),
                applyAsrRecommendFromChip: late(h, 'applyAsrRecommendFromChip'),
                syncExpertExtraChipsUi: late(h, 'syncExpertExtraChipsUi'),
                setPostBatchQcFixMenuOpen: late(h, 'setPostBatchQcFixMenuOpen'),
                setPostBatchQcFixMode: late(h, 'setPostBatchQcFixMode'),
                setParamsModeMenuOpen: late(h, 'setParamsModeMenuOpen'),
                setParamsModeAsrPickMode: late(h, 'setParamsModeAsrPickMode'),
                selectParamsModeAsrManual: late(h, 'selectParamsModeAsrManual'),
                selectParamsModePresetsBrowse: late(h, 'selectParamsModePresetsBrowse'),
                selectParamsModeCustom: late(h, 'selectParamsModeCustom'),
                selectParamsModePreset: late(h, 'selectParamsModePreset'),
                markSettingsDirty: (...a) => h.markSettingsDirty(...a),
                setSaveParamsStatus: (...a) => h.setSaveParamsStatus(...a),
                getExternalImportAction: (...a) => h.getExternalImportAction(...a),
                resetExternalImportIdle: (...a) => h.resetExternalImportIdle(...a),
                applyTranslateModeToForm: late(h, 'applyTranslateModeToForm'),
                updateModelSelectHint: late(h, 'updateModelSelectHint'),
                getTranslateModeUi: (...a) => h.getTranslateModeUi(...a),
                syncMtModelChipUi: late(h, 'syncMtModelChipUi'),
                updateReadinessStrip: late(h, 'updateReadinessStrip'),
                rememberCurrentMtForTarget: late(h, 'rememberCurrentMtForTarget'),
                toggleLogCollapsed: late(h, 'toggleLogCollapsed'),
                scrollMainLogPanel: late(h, 'scrollMainLogPanel'),
                updateFactoryStatusLogFromHost: late(h, 'updateFactoryStatusLogFromHost'),
                setAddMenuOpen: late(h, 'setAddMenuOpen'),
                syncSelectAllCheck: late(h, 'syncSelectAllCheck'),
                renderList: late(h, 'renderList'),
                updateStartButton: late(h, 'updateStartButton'),
                removeSelected: late(h, 'removeSelected'),
                toggleTaskSelectAll: late(h, 'toggleTaskSelectAll'),
            }),
        );
        h.bindMainUiExtras = function bindMainUiExtras() {
            const api = h.getMainUiExtras();
            if (!api?.bindMainUiExtras) {
                if (typeof h.appendLog === 'function') {
                    h.appendLog('主界面附加绑定未加载（main-ui-extras）', 'err');
                }
                return;
            }
            return api.bindMainUiExtras();
        };

        // --- quick toolbar chips ---
        h.getQuickToolbarChipsUi = createLazyFactory(
            () => resolveApi(h, 'quickToolbarChipsUiApi', 'TransubQuickToolbarChipsUi').createQuickToolbarChipsUi,
            () => ({
                els: h.els,
                startReadinessApi,
                deviceLabels: DEVICE_LABELS,
                modelApi,
                uiTf: late(h, 'uiTf'),
                readTaskFromForm: (...a) => h.readTaskFromForm(...a),
                readTranslateModeFromForm: late(h, 'readTranslateModeFromForm'),
                taskLabelOf: (...a) => h.taskLabelOf(...a),
                readSubFormatsFromForm: late(h, 'readSubFormatsFromForm'),
                readModelPathFromForm: late(h, 'readModelPathFromForm'),
                toQuickTargetLang: (...a) => h.toQuickTargetLang(...a),
                readDualLineOrderFromForm: late(h, 'readDualLineOrderFromForm'),
                readLlmMtModelFromForm: (...a) => h.readLlmMtModelFromForm(...a),
                isMtModelAutoSelected: late(h, 'isMtModelAutoSelected'),
                getCachedSmartTranslatePick: () => h.cachedSmartTranslatePick,
                getTranslateModeUi: (...a) => h.getTranslateModeUi(...a),
                getParamsModeUi: late(h, 'getParamsModeUi'),
                getActiveParamsPresetId: late(h, 'getActiveParamsPresetId'),
                getActiveParamsPresetName: late(h, 'getActiveParamsPresetName'),
                resolveParamsModeAsrLabel: late(h, 'resolveParamsModeAsrLabel'),
                rebuildParamsModePresetItems: late(h, 'rebuildParamsModePresetItems'),
                rebuildParamsModeAsrSection: late(h, 'rebuildParamsModeAsrSection'),
                rebuildTranslateMenuMtSection: late(h, 'rebuildTranslateMenuMtSection'),
                ensureSmartTranslatePickCache: (...a) => h.ensureSmartTranslatePickCache(...a),
                ensureEngineModelsCacheApplied: (...a) => h.ensureEngineModelsCacheApplied(...a),
                ensureEngineModelsCatalog: (...a) => h.ensureEngineModelsCatalog(...a),
                hasEngineModelsCacheInMemory: (...a) => (typeof h.hasEngineModelsCacheInMemory === 'function'
                    ? h.hasEngineModelsCacheInMemory(...a)
                    : false),
                getCachedEngineModels: () => (typeof h.getCachedEngineModels === 'function'
                    ? h.getCachedEngineModels()
                    : h.cachedEngineModels),
                loadDeferredGroup: (...a) => h.loadDeferredGroup(...a),
                loadPresets: () => g?.TransubFeatures?.loadPresets?.(),
                getPostBatchQcFixMode: late(h, 'getPostBatchQcFixMode'),
                postBatchQcFixModeLabel: late(h, 'postBatchQcFixModeLabel'),
                persistFormOptionsQuiet: late(h, 'persistFormOptionsQuiet'),
                syncMergeBilingualUi: late(h, 'syncMergeBilingualUi'),
                setPostTaskMenuOpen: late(h, 'setPostTaskMenuOpen'),
                setAddMenuOpen: late(h, 'setAddMenuOpen'),
                setPostBatchQcFixMenuOpen: late(h, 'setPostBatchQcFixMenuOpen'),
                setExpertExtrasMenuOpen: late(h, 'setExpertExtrasMenuOpen'),
                setTranslateStyleMenuOpen: late(h, 'setTranslateStyleMenuOpen'),
                updateEnvBanner: late(h, 'updateEnvBanner'),
                syncTranslateModeChipUi: late(h, 'syncTranslateModeChipUi'),
                syncMtModelChipUi: late(h, 'syncMtModelChipUi'),
                syncPostBatchQcFixChipUi: late(h, 'syncPostBatchQcFixChipUi'),
                syncTranslateStyleChipUi: () => {
                    try { h.getTranslateStylePickerUi?.()?.syncTranslateStyleChipUi?.(); } catch { /* ignore */ }
                },
                updateReadinessStrip: late(h, 'updateReadinessStrip'),
                updateRecipeCapsule: late(h, 'updateRecipeCapsule'),
                getDualSubtitleApi: () => (g && g.TransubDualSubtitle) || null,
            }),
        );
        h.callQuickToolbarChipsUi = (method, ...args) => {
            const ui = h.getQuickToolbarChipsUi();
            if (!ui || typeof ui[method] !== 'function') return undefined;
            return ui[method](...args);
        };
        h.getModelsMenuOpen = () => !!h.callQuickToolbarChipsUi('getModelsMenuOpen');
        h.getTranslateMenuOpen = () => !!h.callQuickToolbarChipsUi('getTranslateMenuOpen');
        h.getParamsMoreMenuOpen = () => !!h.callQuickToolbarChipsUi('getParamsMoreMenuOpen');
        h.getBilingualMenuOpen = () => !!h.callQuickToolbarChipsUi('getBilingualMenuOpen');
        h.getParamsModeMenuOpen = () => !!h.callQuickToolbarChipsUi('getParamsModeMenuOpen');
        h.isModelsCatalogLoading = () => !!h.callQuickToolbarChipsUi('isModelsCatalogLoading');

        h.getParamsModeUi = createLazyFactory(
            () => resolveApi(h, 'paramsModeUiApi', 'TransubParamsModeUi').createParamsModeUi,
            () => ({
                state: h.state,
                els: h.els,
                startReadinessApi,
                getCachedEngineModels: () => (typeof h.getCachedEngineModels === 'function'
                    ? h.getCachedEngineModels()
                    : h.cachedEngineModels),
                getSavedOptionsSnapshot: () => (typeof h.getSavedOptionsSnapshot === 'function'
                    ? h.getSavedOptionsSnapshot()
                    : h.savedOptionsSnapshot),
                getMtUseForm: () => (typeof h.getMtUseForm === 'function'
                    ? h.getMtUseForm()
                    : !!h.mtUseFormState),
                formatEngineModelOptionLabel: late(h, 'formatEngineModelOptionLabel'),
                ensureSelectValue: late(h, 'ensureSelectValue'),
                mirrorSelectValue: late(h, 'mirrorSelectValue'),
                persistFormOptionsQuiet: late(h, 'persistFormOptionsQuiet'),
                setMtUseForm: late(h, 'setMtUseForm'),
                syncTranslateChipUi: late(h, 'syncTranslateChipUi'),
                syncModelsMenuDetailUi: late(h, 'syncModelsMenuDetailUi'),
                syncModelsChipLabel: late(h, 'syncModelsChipLabel'),
                updateRecipeCapsule: late(h, 'updateRecipeCapsule'),
                updateStartButton: late(h, 'updateStartButton'),
                isModelsCatalogLoading: () => !!h.isModelsCatalogLoading?.(),
                renderList: late(h, 'renderList'),
                showToast: late(h, 'showToast'),
                uiTf: late(h, 'uiTf'),
                setModelsMenuOpen: late(h, 'setModelsMenuOpen'),
                readTaskFromForm: (...a) => h.readTaskFromForm(...a),
                setFactoryWorkspace: late(h, 'setFactoryWorkspace'),
                setParamsModeMenuOpen: late(h, 'setParamsModeMenuOpen'),
            }),
        );
        h.callParamsModeUi = (method, ...args) => {
            const ui = h.getParamsModeUi();
            if (!ui || typeof ui[method] !== 'function') return undefined;
            return ui[method](...args);
        };
        if (typeof bindCallMethods === 'function') {
            Object.assign(h, bindCallMethods(
                (method, ...args) => h.callParamsModeUi(method, ...args),
                [
                    'isAutoSenseEnabled', 'getActiveParamsPresetId', 'getActiveParamsPresetName',
                    'applyActivePresetIdToSelect', 'flushPendingActivePresetId', 'setParamsModeMenuOpen',
                    'resolveParamsModeAsrLabel', 'rebuildParamsModeAsrSection', 'setParamsModeAsrPickMode',
                    'selectParamsModeAsrManual', 'adoptManualAsrFromUserChange', 'rebuildParamsModePresetItems',
                    'syncParamsModeChipUi', 'selectParamsModePresetsBrowse', 'selectParamsModeCustom',
                    'selectParamsModePreset',
                ],
                {
                    isAutoSenseEnabled: (v) => !!v,
                    getActiveParamsPresetId: (v) => v || '',
                    getActiveParamsPresetName: (v) => v || '',
                },
            ));
        }

        if (typeof bindCallMethods === 'function') {
            Object.assign(h, bindCallMethods(
                (method, ...args) => h.callQuickToolbarChipsUi(method, ...args),
                [
                    'shortTranslateModelsSummary', 'syncModelsChipLabel',
                    'syncModelsMenuDetailUi', 'positionModelsPopover', 'syncBilingualChipUi', 'setBilingualMenuOpen',
                    'applyBilingualChipToFormAndPersist', 'setModelsMenuOpen', 'setTranslateMenuOpen',
                    'setTranslateModeMenuOpen', 'setMtModelMenuOpen', 'setParamsMoreMenuOpen',
                    'syncParamsMoreChipUi', 'updateParamsSummary', 'setModelsPickSlot',
                    'toggleModelsChip',
                ],
                {
                    shortTranslateModelsSummary: (v) => v || '',
                },
            ));
        }

        // --- TWAI model select ---
        h.getTwaiModelSelectUi = createLazyFactory(
            () => resolveApi(h, 'twaiModelSelectUiApi', 'TransubTwaiModelSelectUi').createTwaiModelSelectUi,
            () => ({
                els: h.els,
                electron: h.electron,
                modelApi,
                esc: late(h, 'esc'),
                uiTf: late(h, 'uiTf'),
                appendLog: late(h, 'appendLog'),
                readTaskFromForm: (...a) => h.readTaskFromForm(...a),
                getAdvancedEntitled: () => entitled(h),
                updateParamsSummary: late(h, 'updateParamsSummary'),
                getCachedModelItems: () => (typeof h.getCachedModelItems === 'function'
                    ? h.getCachedModelItems()
                    : h.cachedModelItems),
                setCachedModelItems: (items) => {
                    if (typeof h.setCachedModelItems === 'function') h.setCachedModelItems(items);
                    else h.cachedModelItems = Array.isArray(items) ? items : [];
                },
            }),
        );
        h.callTwaiModelSelectUi = (method, ...args) => {
            const ui = h.getTwaiModelSelectUi();
            if (!ui || typeof ui[method] !== 'function') return undefined;
            return ui[method](...args);
        };
        if (typeof bindCallMethods === 'function') {
            Object.assign(h, bindCallMethods(
                (method, ...args) => h.callTwaiModelSelectUi(method, ...args),
                [
                    'kindBadge', 'readModelPathFromForm', 'syncModelSelectToPath', 'setModelPathOnForm',
                    'fillModelSelect', 'refreshModelSelects', 'applyAutoDetectedModelsFromCache',
                    'browseModelPath', 'updateModelSelectHint',
                ],
                {
                    kindBadge: (v) => v || '其他',
                    readModelPathFromForm: (v) => v || '',
                },
            ));
        }

        if (h.activeComboPlanId == null) h.activeComboPlanId = '';
        h.getActiveComboPlanId = () => String(h.activeComboPlanId || '').trim();
        h.setActiveComboPlanId = (id) => {
            h.activeComboPlanId = String(id || '').trim();
        };
        h.getComboPlansUi = createLazyFactory(
            () => resolveApi(h, 'comboPlansUiApi', 'TransubComboPlansUi').createComboPlansUi,
            () => ({
                els: h.els,
                electron: h.electron,
                comboPlansApi: (g && g.TransubComboPlans) || {},
                missingModelsApi: (g && g.TransubEngineMissingModels) || {},
                downloadFormatApi: (g && g.TransubEngineDownloadFormat) || {},
                uiTf: late(h, 'uiTf'),
                uiTx: (t) => {
                    if (typeof h.uiTx === 'function') return h.uiTx(t);
                    if (typeof g?.TransubI18n?.tx === 'function') return g.TransubI18n.tx(t);
                    return String(t || '');
                },
                showToast: late(h, 'showToast'),
                appendLog: late(h, 'appendLog'),
                appConfirm: late(h, 'appConfirm'),
                getAdvancedEntitled: () => entitled(h),
                promptProUnlockRequired: late(h, 'promptProUnlockRequired'),
                downloadEngineModels: (...a) => h.downloadEngineModels?.(...a),
                refreshEngineModels: (...a) => h.refreshEngineModels?.(...a),
                getCachedEngineModels: () => (typeof h.getCachedEngineModels === 'function'
                    ? h.getCachedEngineModels()
                    : h.cachedEngineModels),
                applyOptionsToForm: (...a) => h.applyOptionsToForm(...a),
                buildSavedOptionsFromForm: (...a) => h.buildSavedOptionsFromForm(...a),
                saveOptions: async (opts) => h.electron?.transWithAiSaveOptions?.(opts),
                setSavedOptionsSnapshot: late(h, 'setSavedOptionsSnapshot'),
                markSettingsDirty: late(h, 'markSettingsDirty'),
                updateParamsSummary: late(h, 'updateParamsSummary'),
                syncParamsModeChipUi: late(h, 'syncParamsModeChipUi'),
                syncTranslateChipUi: late(h, 'syncTranslateChipUi'),
                getActiveComboPlanId: () => h.getActiveComboPlanId(),
                setActiveComboPlanId: (id) => h.setActiveComboPlanId(id),
            }),
        );
        h.bindComboPlansUi = () => h.getComboPlansUi()?.bind?.();
        h.syncComboPlanChipFromOptions = (options) => h.getComboPlansUi()?.syncFromOptions?.(options);

        return h;
    }

    return { install };
}));
