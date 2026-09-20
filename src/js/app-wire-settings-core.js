/**
 * Domain wire: settings form apply / engine env / burn / modal / runtime options.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAppWireSettings = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function appWireSettingsFactory(global) {
    function getBindApi() {
        return (global && global.TransubAppApiBind)
            || (typeof require === 'function' ? require('./app-api-bind-core.js') : null)
            || {};
    }

    function getShellDeps() {
        return (global && global.TransubAppShellDeps)
            || (typeof require === 'function' ? require('./app-shell-deps-core.js') : null)
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

    const ENGINE_ENV_METHODS = [
        'getFfmpegPathFromForm',
        'formatTransWithAiStatusText',
        'refreshInstallStatus',
        'testInstall',
        'browseFfmpegPath',
        'browseFfmpegFolder',
        'refreshFfmpegStatus',
        'checkTransWithAiEngineUpdate',
        'browseInstallPath',
        'saveParamsSettings',
    ];

    const SETTINGS_MODAL_METHODS = [
        'switchParamsTab',
        'syncSettingsNavGroups',
        'filterSettingsNav',
        'bindSettingsSearch',
        'openAppSettings',
        'closeParamsModal',
        'closeAllSettingsTips',
        'bindSettingsTips',
        'closeStandaloneSettingsWindow',
    ];

    /**
     * @param {object} host
     * @returns {object} host
     */
    function install(host) {
        const h = host || {};
        const { bindApiMethods, bindCallMethods, createLazyFactory } = getBindApi();
        const { mergeDeps } = getShellDeps();
        if (typeof createLazyFactory !== 'function') return h;

        const settingsNormApi = h.settingsNormApi
            || (global && global.TransubSettingsOptionsNormalize)
            || {};
        const savedOptionsApi = h.savedOptionsApi
            || (global && global.TransubSettingsSavedOptions)
            || settingsNormApi
            || {};

        // --- settings form apply ---
        h.getSettingsFormApply = createLazyFactory(
            () => resolveApi(h, 'settingsFormApplyApi', 'TransubSettingsFormApply').createSettingsFormApply,
            () => {
                const bag = {
                    els: h.els,
                    settingsNormApi,
                    savedOptionsApi,
                    translateStyleApi: h.translateStyleApi || (global && global.TransubTranslateStyle) || {},
                    externalImportApi: h.externalImportApi || (global && global.TransubExternalImportAction) || {},
                    DEFAULT_AUDIO_SUFFIXES: h.DEFAULT_AUDIO_SUFFIXES,
                    stashTwaiLegacyFromOptions: late(h, 'stashTwaiLegacyFromOptions'),
                    ensureEngineInstallPathFilled: late(h, 'ensureEngineInstallPathFilled'),
                    syncProxySettingsUi: late(h, 'syncProxySettingsUi'),
                    syncTransubStationSettingsUi: late(h, 'syncTransubStationSettingsUi'),
                    ensureSelectValue: late(h, 'ensureSelectValue'),
                    isLlmInferencePickModelId: late(h, 'isLlmInferencePickModelId'),
                    syncEngineBackendUi: late(h, 'syncEngineBackendUi'),
                    applyDualLineOrderToForm: late(h, 'applyDualLineOrderToForm'),
                    updateTranslateStyleUi: late(h, 'updateTranslateStyleUi'),
                    getTranslateStyleEnabled: () => {
                        try {
                            const ui = typeof h.getTranslateStylePickerUi === 'function'
                                ? h.getTranslateStylePickerUi()
                                : null;
                            if (ui?.getTranslateStyleEnabled) return !!ui.getTranslateStyleEnabled();
                        } catch { /* ignore */ }
                        return !!h.els?.translateStyleEnabledCheck?.checked;
                    },
                    setTranslateStyleEnabledState: (on, opts) => {
                        try {
                            return h.getTranslateStylePickerUi()?.setTranslateStyleEnabledState?.(on, opts);
                        } catch { /* ignore */ }
                        if (h.els?.translateStyleEnabledCheck) {
                            h.els.translateStyleEnabledCheck.checked = !!on;
                        }
                        return !!on;
                    },
                    applySubFormatsToForm: late(h, 'applySubFormatsToForm'),
                    toQuickTargetLang: late(h, 'toQuickTargetLang'),
                    mtRouteApi: typeof h.mtRouteApi === 'function' ? h.mtRouteApi : () => h.mtRouteApi || {},
                    getTranslateModeUi: late(h, 'getTranslateModeUi'),
                    readSubtitleTargetLangFromForm: late(h, 'readSubtitleTargetLangFromForm'),
                    applyBurnSettingsToForm: late(h, 'applyBurnSettingsToForm'),
                    syncLogLevelHint: late(h, 'syncLogLevelHint'),
                    syncExpertExtraChipsUi: late(h, 'syncExpertExtraChipsUi'),
                    getAutoScanApi: late(h, 'getAutoScanApi'),
                    refreshAutoScanFoldersListUi: late(h, 'refreshAutoScanFoldersListUi'),
                    refreshSubtitleEditorPathHint: late(h, 'refreshSubtitleEditorPathHint'),
                    setPostBatchQcFixMode: late(h, 'setPostBatchQcFixMode'),
                    applyActivePresetIdToSelect: late(h, 'applyActivePresetIdToSelect'),
                    syncQuickExtrasBar: late(h, 'syncQuickExtrasBar'),
                    normalizeViewingCleanMode: late(h, 'normalizeViewingCleanMode'),
                    refreshPostBatchTextPresetSelect: (...a) => h.refreshPostBatchTextPresetSelect(...a),
                    syncDeviceOptionsForMode: late(h, 'syncDeviceOptionsForMode'),
                    syncBatchSizeUi: late(h, 'syncBatchSizeUi'),
                    syncExpertCustomHints: late(h, 'syncExpertCustomHints'),
                    syncTranslateModeFromOptions: late(h, 'syncTranslateModeFromOptions'),
                    applyMtTargetCapabilityToForm: late(h, 'applyMtTargetCapabilityToForm'),
                    syncChineseSubtitleVariantUi: late(h, 'syncChineseSubtitleVariantUi'),
                    refreshModelSelects: late(h, 'refreshModelSelects'),
                    syncParamsModeChipUi: late(h, 'syncParamsModeChipUi'),
                    updateParamsSummary: late(h, 'updateParamsSummary'),
                    updateAsrWindowTip: late(h, 'updateAsrWindowTip'),
                    updateQwenAsrBatchHint: late(h, 'updateQwenAsrBatchHint'),
                    readTaskFromForm: late(h, 'readTaskFromForm'),
                    readTranslateModeFromForm: late(h, 'readTranslateModeFromForm'),
                    readEngineBackendFromForm: late(h, 'readEngineBackendFromForm'),
                    engineInstallPathForSave: late(h, 'engineInstallPathForSave'),
                    readLlmMtModelFromForm: late(h, 'readLlmMtModelFromForm'),
                    readDualLineOrderFromForm: late(h, 'readDualLineOrderFromForm'),
                    readSubFormatsFromForm: late(h, 'readSubFormatsFromForm'),
                    readModelPathFromForm: late(h, 'readModelPathFromForm'),
                    normalizeChineseSubtitleVariant: late(h, 'normalizeChineseSubtitleVariant'),
                    readTwaiLegacyOptions: late(h, 'readTwaiLegacyOptions'),
                    getActiveParamsPresetId: late(h, 'getActiveParamsPresetId'),
                    getActiveComboPlanId: late(h, 'getActiveComboPlanId'),
                    setActiveComboPlanId: late(h, 'setActiveComboPlanId'),
                    syncComboPlanChipFromOptions: late(h, 'syncComboPlanChipFromOptions'),
                    getPostBatchQcFixMode: late(h, 'getPostBatchQcFixMode'),
                    resolveOutputDirFromForm: late(h, 'resolveOutputDirFromForm'),
                    getAdvancedEntitled: () => (typeof h.getAdvancedEntitled === 'function'
                        ? !!h.getAdvancedEntitled()
                        : !!h.advancedEntitled),
                    getSavedOptionsSnapshot: () => (typeof h.getSavedOptionsSnapshot === 'function'
                        ? h.getSavedOptionsSnapshot()
                        : h.savedOptionsSnapshot),
                    getMtUseFormState: () => (typeof h.getMtUseFormState === 'function'
                        ? h.getMtUseFormState()
                        : !!h.mtUseFormState),
                    setMtUseFormState: (on) => {
                        if (typeof h.setMtUseFormState === 'function') h.setMtUseFormState(on);
                        else h.mtUseFormState = !!on;
                    },
                    getAutoScanFoldersDraft: () => (typeof h.getAutoScanFoldersDraft === 'function'
                        ? h.getAutoScanFoldersDraft()
                        : h.autoScanFoldersDraft),
                    setAutoScanFoldersDraft: (folders) => {
                        if (typeof h.setAutoScanFoldersDraft === 'function') h.setAutoScanFoldersDraft(folders);
                        else h.autoScanFoldersDraft = folders;
                    },
                    setInsertSoftwareCreditIsDefault: (v) => {
                        if (typeof h.setInsertSoftwareCreditIsDefault === 'function') {
                            h.setInsertSoftwareCreditIsDefault(v);
                        } else h.insertSoftwareCreditIsDefault = !!v;
                    },
                };
                return typeof mergeDeps === 'function' ? mergeDeps({}, bag) : bag;
            },
        );

        h.applyOptionsToForm = async function applyOptionsToForm(...args) {
            const api = h.getSettingsFormApply();
            if (!api?.applyOptionsToForm) {
                console.warn('[Transub] settings-form-apply-core 未加载');
                return;
            }
            return api.applyOptionsToForm(...args);
        };

        h.buildSavedOptionsFromForm = function buildSavedOptionsFromForm(...args) {
            const api = h.getSettingsFormApply();
            if (!api?.buildSavedOptionsFromForm) {
                throw new Error('settings-form-apply-core 未加载，无法保存设置');
            }
            return api.buildSavedOptionsFromForm(...args);
        };

        // --- engine env UI ---
        h.getEngineEnvUi = createLazyFactory(
            () => resolveApi(h, 'engineEnvUiApi', 'TransubEngineEnvUi').createEngineEnvUi,
            () => ({
                els: h.els,
                electron: h.electron,
                uiTf: late(h, 'uiTf'),
                appendLog: late(h, 'appendLog'),
                appConfirm: late(h, 'appConfirm'),
                isDesktop: late(h, 'isDesktop'),
                setSaveParamsStatus: late(h, 'setSaveParamsStatus'),
                switchParamsTab: late(h, 'switchParamsTab'),
                readTaskFromForm: late(h, 'readTaskFromForm'),
                readEngineBackendFromForm: late(h, 'readEngineBackendFromForm'),
                canUseSmartTranslateUi: late(h, 'canUseSmartTranslateUi'),
                isSakuraMtModelId: late(h, 'isSakuraMtModelId'),
                applyTranslateModeToForm: late(h, 'applyTranslateModeToForm'),
                buildSavedOptionsFromForm: (...a) => h.buildSavedOptionsFromForm(...a),
                markSettingsDirty: late(h, 'markSettingsDirty'),
                updateParamsSummary: late(h, 'updateParamsSummary'),
                closeStandaloneSettingsWindow: late(h, 'closeStandaloneSettingsWindow'),
                closeParamsModal: late(h, 'closeParamsModal'),
                refreshModelSelects: late(h, 'refreshModelSelects'),
                updateEmptyStateUi: late(h, 'updateEmptyStateUi'),
                syncFactoryEngineStatus: late(h, 'syncFactoryEngineStatus'),
                updateReadinessStrip: late(h, 'updateReadinessStrip'),
                getSavedOptionsSnapshot: () => (typeof h.getSavedOptionsSnapshot === 'function'
                    ? h.getSavedOptionsSnapshot()
                    : h.savedOptionsSnapshot),
                setSavedOptionsSnapshot: (v) => {
                    if (typeof h.setSavedOptionsSnapshot === 'function') h.setSavedOptionsSnapshot(v);
                    else h.savedOptionsSnapshot = v;
                },
                getIsStandaloneSettings: () => (typeof h.getIsStandaloneSettings === 'function'
                    ? !!h.getIsStandaloneSettings()
                    : !!h.isStandaloneSettings),
                getAdvancedEntitled: () => (typeof h.getAdvancedEntitled === 'function'
                    ? !!h.getAdvancedEntitled()
                    : !!h.advancedEntitled),
                getCachedGpuRuntimeProbe: () => (typeof h.getCachedGpuRuntimeProbe === 'function'
                    ? h.getCachedGpuRuntimeProbe()
                    : h.cachedGpuRuntimeProbe),
                getEngineModelsUi: () => h.engineModelsUi || (global && global.TransubEngineModelsUi) || {},
            }),
        );

        h.callEngineEnvUi = function callEngineEnvUi(method, ...args) {
            const api = h.getEngineEnvUi();
            if (!api || typeof api[method] !== 'function') {
                console.warn('[Transub] engine-env-ui-core 未加载:', method);
                return undefined;
            }
            return api[method](...args);
        };

        for (const name of ENGINE_ENV_METHODS) {
            if (name === 'getFfmpegPathFromForm' || name === 'formatTransWithAiStatusText') {
                h[name] = (...args) => h.callEngineEnvUi(name, ...args) || (name === 'getFfmpegPathFromForm' ? '' : '');
            } else {
                h[name] = (...args) => h.callEngineEnvUi(name, ...args);
            }
        }

        // --- burn settings ---
        h.getBurnSettingsUi = createLazyFactory(
            () => resolveApi(h, 'burnSettingsUiApi', 'TransubBurnSettingsUi').createBurnSettingsUi,
            () => ({
                els: h.els,
                electron: h.electron,
                settingsNormApi,
                getAdvancedEntitled: () => (typeof h.getAdvancedEntitled === 'function'
                    ? !!h.getAdvancedEntitled()
                    : !!h.advancedEntitled),
                markSettingsDirty: late(h, 'markSettingsDirty'),
                setSaveParamsStatus: late(h, 'setSaveParamsStatus'),
            }),
        );

        Object.assign(h, bindApiMethods(h.getBurnSettingsUi, [
            'applyBurnSettingsToForm',
            'refreshSettingsBurnEncoderSelect',
            'browseSettingsBurnOutputDir',
            'clearSettingsBurnOutputDir',
        ]));

        // --- runtime options (P1 core) ---
        const runtimeApi = (global && global.TransubRuntimeOptions)
            || (typeof require === 'function' ? require('./runtime-options-core.js') : null)
            || {};
        if (typeof runtimeApi.createRuntimeOptions === 'function') {
            const runtime = runtimeApi.createRuntimeOptions({
                buildSavedOptionsFromForm: (...a) => h.buildSavedOptionsFromForm(...a),
                getPostTaskOptionsFromUi: late(h, 'getPostTaskOptionsFromUi'),
                readActiveEngineMtModelFromForm: late(h, 'readActiveEngineMtModelFromForm'),
                readTranslateModeFromForm: late(h, 'readTranslateModeFromForm'),
                mtRouteApi: typeof h.mtRouteApi === 'function' ? h.mtRouteApi : () => h.mtRouteApi || {},
                installedMtModelIds: late(h, 'installedMtModelIds'),
                isLlmInferencePickModelId: late(h, 'isLlmInferencePickModelId'),
            });
            h.buildRuntimeOptions = (...a) => runtime.buildRuntimeOptions(...a);
            h.getRuntimeOptionsApi = () => runtime;
        }

        // --- settings modal ---
        h.getSettingsModalUi = createLazyFactory(
            () => resolveApi(h, 'settingsModalUiApi', 'TransubSettingsModalUi').createSettingsModalUi,
            () => ({
                els: h.els,
                electron: h.electron,
                getActiveParamsTab: () => (typeof h.getActiveParamsTab === 'function'
                    ? h.getActiveParamsTab()
                    : h.activeParamsTab),
                setActiveParamsTab: (v) => {
                    if (typeof h.setActiveParamsTab === 'function') h.setActiveParamsTab(v);
                    else h.activeParamsTab = v;
                },
                getAdvancedEntitled: () => (typeof h.getAdvancedEntitled === 'function'
                    ? !!h.getAdvancedEntitled()
                    : !!h.advancedEntitled),
                getIsStandaloneSettings: () => (typeof h.getIsStandaloneSettings === 'function'
                    ? !!h.getIsStandaloneSettings()
                    : !!h.isStandaloneSettings),
                getIsStandaloneWizard: () => (typeof h.getIsStandaloneWizard === 'function'
                    ? !!h.getIsStandaloneWizard()
                    : !!h.isStandaloneWizard),
                getIsStandaloneChrome: () => (typeof h.getIsStandaloneChrome === 'function'
                    ? !!h.getIsStandaloneChrome()
                    : !!h.isStandaloneChrome),
                getSettingsFormDirty: () => (typeof h.getSettingsFormDirty === 'function'
                    ? !!h.getSettingsFormDirty()
                    : !!h.settingsFormDirty),
                getSavedOptionsSnapshot: () => (typeof h.getSavedOptionsSnapshot === 'function'
                    ? h.getSavedOptionsSnapshot()
                    : h.savedOptionsSnapshot),
                setSavedOptionsSnapshot: (opts) => {
                    if (typeof h.setSavedOptionsSnapshot === 'function') h.setSavedOptionsSnapshot(opts);
                    else h.savedOptionsSnapshot = opts && typeof opts === 'object' ? opts : null;
                },
                isProGatedTab: late(h, 'isProGatedTab'),
                PRO_GATED_TAB_TITLES: (h.advancedEntitlementUiApi
                    || (global && global.TransubAdvancedEntitlementUi)
                    || {}).PRO_GATED_TAB_TITLES || {},
                promptProUnlockRequired: late(h, 'promptProUnlockRequired'),
                ensureSettingsFeatureScripts: late(h, 'ensureSettingsFeatureScripts'),
                ensureSettingsShellReady: late(h, 'ensureSettingsShellReady'),
                readEngineBackendFromForm: late(h, 'readEngineBackendFromForm'),
                ensureEngineModelsCacheApplied: late(h, 'ensureEngineModelsCacheApplied'),
                refreshEngineStatus: (...a) => h.refreshEngineStatus(...a),
                isDesktop: late(h, 'isDesktop'),
                setPostTaskMenuOpen: late(h, 'setPostTaskMenuOpen'),
                setAddMenuOpen: late(h, 'setAddMenuOpen'),
                reloadSavedOptionsIntoForm: late(h, 'reloadSavedOptionsIntoForm'),
                buildSavedOptionsFromForm: (...a) => h.buildSavedOptionsFromForm(...a),
                markSettingsDirty: late(h, 'markSettingsDirty'),
                setSaveParamsStatus: late(h, 'setSaveParamsStatus'),
                refreshAdvancedEntitlement: late(h, 'refreshAdvancedEntitlement'),
                refreshSettingsBurnEncoderSelect: late(h, 'refreshSettingsBurnEncoderSelect'),
                refreshSenseMemoryStatus: late(h, 'refreshSenseMemoryStatus'),
                refreshPostBatchTextPresetSelect: (...a) => h.refreshPostBatchTextPresetSelect(...a),
                openEngineModelsLibrary: late(h, 'openEngineModelsLibrary'),
                closeEngineModelsLibrary: late(h, 'closeEngineModelsLibrary'),
                applyOptionsToForm: (...a) => h.applyOptionsToForm(...a),
            }),
        );

        h.callSettingsModalUi = function callSettingsModalUi(method, ...args) {
            const api = h.getSettingsModalUi();
            if (!api || typeof api[method] !== 'function') return undefined;
            return api[method](...args);
        };

        h.resolveParamsTab = function resolveParamsTab(...args) {
            const api = h.getSettingsModalUi();
            if (api?.resolveParamsTab) return api.resolveParamsTab(...args);
            const raw = String(args[0] || '').trim();
            return raw || 'runtime';
        };

        if (typeof bindCallMethods === 'function') {
            Object.assign(h, bindCallMethods((method, ...args) => h.callSettingsModalUi(method, ...args), SETTINGS_MODAL_METHODS));
        }

        h.openParamsModal = async function openParamsModal(...args) {
            const api = h.getSettingsModalUi();
            if (!api?.openParamsModal) {
                console.warn('[Transub] settings-modal-ui-core 未加载');
                return;
            }
            return api.openParamsModal(...args);
        };

        h.refreshPostBatchTextPresetSelect = async function refreshPostBatchTextPresetSelect(selectedId) {
            const els = h.els || {};
            if (!els.postBatchTextPresetGroupSelect) return;
            const want = String(
                selectedId != null ? selectedId : (els.postBatchTextPresetGroupSelect.value || ''),
            ).trim();
            let groups = [];
            try {
                const res = await h.electron?.transubGetTextPresets?.();
                if (res?.ok && Array.isArray(res.presetsDoc?.groups)) {
                    groups = res.presetsDoc.groups;
                }
            } catch { /* ignore */ }
            const sel = els.postBatchTextPresetGroupSelect;
            sel.innerHTML = '<option value="">无</option>';
            groups.forEach((g) => {
                const opt = document.createElement('option');
                opt.value = String(g.id || '');
                opt.textContent = String(g.name || g.id || '未命名');
                sel.appendChild(opt);
            });
            sel.value = want && groups.some((g) => g.id === want) ? want : '';
        };

        return h;
    }

    return { install, ENGINE_ENV_METHODS, SETTINGS_MODAL_METHODS };
}));
