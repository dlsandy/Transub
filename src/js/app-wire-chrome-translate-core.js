/**
 * Chrome wire: translate mode / MT route / bilingual / quick extras / style picker.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAppWireChromeTranslate = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function appWireChromeTranslateFactory(global) {
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
        const { bindApiMethods, bindCallMethods, createLazyFactory } = bindApi;
        if (typeof createLazyFactory !== 'function') return h;

        const g = global;
        const settingsNormApi = h.settingsNormApi
            || (g && g.TransubSettingsOptionsNormalize)
            || {};
        const translateChipApi = h.translateChipApi
            || (g && g.TransubTranslateModeChip)
            || {};
        const startReadinessApi = h.startReadinessApi
            || (g && g.TransubStartReadiness)
            || {};
        const retranslatePlanApi = h.retranslatePlanApi
            || resolveApi(h, 'retranslatePlanApi', 'TransubRetranslatePlan');
        const translateStyleApi = h.translateStyleApi
            || resolveApi(h, 'translateStyleApi', 'TransubTranslateStyle');
        const POST_BATCH_QC_FIX_MODES = h.POST_BATCH_QC_FIX_MODES || new Set(['none', 'fix', 'smart']);
        const POST_BATCH_QC_FIX_CHIP_LABELS = h.POST_BATCH_QC_FIX_CHIP_LABELS || {
            none: '关闭', fix: '自动', smart: '智能 Pro',
        };

        // --- translate mode UI ---
        h.getTranslateModeUi = createLazyFactory(
            () => resolveApi(h, 'translateModeUiApi', 'TransubTranslateModeUi').createTranslateModeUi,
            () => ({
                els: h.els,
                electron: h.electron,
                settingsNormApi,
                smartTranslateReadinessApi: resolveApi(h, 'smartTranslateReadinessApi', 'TransubSmartTranslateReadiness'),
                translateChipApi,
                retranslatePlanApi,
                engineModelsUi: h.engineModelsUi || (g && g.TransubEngineModelsUi) || {},
                startReadinessApi,
                getAdvancedEntitled: () => entitled(h),
                getCachedEngineModels: () => (typeof h.getCachedEngineModels === 'function'
                    ? h.getCachedEngineModels()
                    : h.cachedEngineModels),
                getCachedHardwareRecommend: () => (typeof h.getCachedHardwareRecommend === 'function'
                    ? h.getCachedHardwareRecommend()
                    : h.cachedHardwareRecommend),
                getCachedBundledEnginePath: () => h.getEngineEnvUi?.()?.getCachedBundledEnginePath?.() || '',
                getCachedSmartTranslatePick: () => (typeof h.getCachedSmartTranslatePick === 'function'
                    ? h.getCachedSmartTranslatePick()
                    : h.cachedSmartTranslatePick),
                setCachedSmartTranslatePick: (v) => {
                    if (typeof h.setCachedSmartTranslatePick === 'function') h.setCachedSmartTranslatePick(v);
                    else h.cachedSmartTranslatePick = v;
                },
                getState: () => h.state,
                getIsStandaloneSettings: () => (typeof h.getIsStandaloneSettings === 'function'
                    ? !!h.getIsStandaloneSettings()
                    : !!h.isStandaloneSettings),
                appendLog: late(h, 'appendLog'),
                showToast: late(h, 'showToast'),
                appConfirmChoice: late(h, 'appConfirmChoice'),
                openAppSettings: late(h, 'openAppSettings'),
                markSettingsDirty: (...a) => h.markSettingsDirty(...a),
                persistFormOptionsQuiet: late(h, 'persistFormOptionsQuiet'),
                renderList: late(h, 'renderList'),
                uiTf: late(h, 'uiTf'),
                fillEngineModelSelect: late(h, 'fillEngineModelSelect'),
                ensureSelectValue: late(h, 'ensureSelectValue'),
                findManagedLlmCatalogEntry: late(h, 'findManagedLlmCatalogEntry'),
                getManagedLlmCatalogApi: late(h, 'getManagedLlmCatalogApi'),
                isLlmInferencePickModelId: late(h, 'isLlmInferencePickModelId'),
                readTranslateModeFromForm: late(h, 'readTranslateModeFromForm'),
                setTranslateModeRadios: late(h, 'setTranslateModeRadios'),
                readTaskFromForm: (...a) => h.readTaskFromForm(...a),
                promptProUnlockRequired: (...a) => h.promptProUnlockRequired(...a),
                syncExpertExtraChipsUi: late(h, 'syncExpertExtraChipsUi'),
                ensureSmartTranslatePickCache: (...a) => h.ensureSmartTranslatePickCache(...a),
                isModelsCatalogLoading: () => !!h.isModelsCatalogLoading?.(),
                isSmartTranslateCapableModel: (...a) => h.isSmartTranslateCapableModel(...a),
                formatEngineModelOptionLabel: late(h, 'formatEngineModelOptionLabel'),
                setMtUseForm: late(h, 'setMtUseForm'),
                setTranslateMenuOpen: late(h, 'setTranslateMenuOpen'),
                syncModelsMenuDetailUi: late(h, 'syncModelsMenuDetailUi'),
                syncModelsChipLabel: late(h, 'syncModelsChipLabel'),
                positionModelsPopover: late(h, 'positionModelsPopover'),
                updateRecipeCapsule: late(h, 'updateRecipeCapsule'),
                translateModeLabel: (...a) => h.translateModeLabel(...a),
                setSaveParamsStatus: (...a) => h.setSaveParamsStatus(...a),
                syncParamsModeChipUi: late(h, 'syncParamsModeChipUi'),
                updateParamsSummary: late(h, 'updateParamsSummary'),
                updateModelSelectHint: late(h, 'updateModelSelectHint'),
                ensureRequiredModelsReadyOrPrompt: (...a) => h.ensureRequiredModelsReadyOrPrompt(...a),
                taskLabelOf: (...a) => h.taskLabelOf(...a),
                readEngineBackendFromForm: (...a) => h.readEngineBackendFromForm(...a),
                getContentProfileApi: () => (g && g.TransubContentProfile) || null,
                syncTransubStationSettingsUi: late(h, 'syncTransubStationSettingsUi'),
            }),
        );

        h.callTranslateModeUi = (method, ...args) => {
            const ui = h.getTranslateModeUi();
            if (!ui || typeof ui[method] !== 'function') return undefined;
            return ui[method](...args);
        };

        if (typeof bindCallMethods === 'function') {
            Object.assign(h, bindCallMethods(
                (method, ...args) => h.callTranslateModeUi(method, ...args),
                [
                    'canUseSmartTranslateUi', 'syncFaithfulToneUi', 'resolveMtCapabilityFromForm',
                    'installedMtModelIds', 'rememberCurrentMtForTarget', 'applyMtTargetCapabilityToForm',
                    'buildIntlAwareLlmMtFilter', 'buildIntlAwareLlmMtDisableReason',
                    'isSmartTranslateChatReady', 'smartTranslateChatLabel',
                    'collectSmartTranslateReadiness', 'syncSmartTranslateReadinessUi', 'syncHybridMtUi',
                    'syncAdvancedFeaturesGate', 'applyTranslateModeToForm', 'readOpusMtModelFromForm',
                    'parseVramGbHint', 'recommendMtContext', 'shortMtModelChipLabel',
                    'readActiveEngineMtModelFromForm', 'isMtModelAutoSelected',
                    'syncTranslateChipUi', 'syncTranslateModeChipUi', 'syncMtModelChipUi',
                    'rebuildTranslateMenuMtSection', 'updateReadinessStrip',
                    // Models-pick modal: toolbar extras call these via late(h, …)
                    'setQuickTranslateMode', 'setTranslateMtPickMode',
                    'setQuickMtModel', 'setQuickPolishModel',
                    'setExternalTranslateSource', 'selectExternalStationModel',
                ],
                {
                    canUseSmartTranslateUi: (v) => !!v,
                    installedMtModelIds: (v) => v || [],
                    isSmartTranslateChatReady: (v) => !!v,
                    smartTranslateChatLabel: (v) => v || '',
                    readOpusMtModelFromForm: (v) => v || '',
                    recommendMtContext: (v) => v || {},
                    shortMtModelChipLabel: (v) => v || '自动',
                    readActiveEngineMtModelFromForm: (v) => v || '',
                    isMtModelAutoSelected: (v) => !!v,
                },
            ));
        }

        h.mtRouteApi = function mtRouteApi() {
            const ui = h.getTranslateModeUi();
            if (ui && typeof ui.mtRouteApi === 'function') return ui.mtRouteApi();
            return (typeof window !== 'undefined' ? window.TransubMtTargetRoute : null)
                || (g && g.TransubMtTargetRoute)
                || {};
        };
        h.formSyncApi = function formSyncApi() {
            const ui = h.getTranslateModeUi();
            if (ui && typeof ui.formSyncApi === 'function') return ui.formSyncApi();
            return (typeof window !== 'undefined' ? window.TransubMtTargetFormSync : null)
                || (g && g.TransubMtTargetFormSync)
                || {};
        };
        h.readSubtitleTargetLangFromForm = (...args) => (
            h.callTranslateModeUi('readSubtitleTargetLangFromForm', ...args)
            || ((g && g.TransubSubtitleTargetLang)?.targetLangFromFormValue?.('simplified') || 'zh-Hans')
        );
        h.ensureMtSelectionValidBeforeStart = async (...args) => {
            const ui = h.getTranslateModeUi();
            if (!ui?.ensureMtSelectionValidBeforeStart) return true;
            return ui.ensureMtSelectionValidBeforeStart(...args);
        };
        h.ensureSmartTranslateReadinessBeforeStart = async (...args) => {
            const ui = h.getTranslateModeUi();
            if (!ui?.ensureSmartTranslateReadinessBeforeStart) return true;
            return ui.ensureSmartTranslateReadinessBeforeStart(...args);
        };
        h.readLlmMtModelFromForm = (...args) => {
            const v = h.callTranslateModeUi('readLlmMtModelFromForm', ...args);
            if (v != null) return v;
            return String(h.els?.engineLlmMtModelSelect?.value || '').trim();
        };
        h.recommendFormMtModel = (...args) => (
            h.callTranslateModeUi('recommendFormMtModel', ...args)
            || {
                id: '',
                preferId: '',
                reason: '',
                mode: typeof h.readTranslateModeFromForm === 'function' ? h.readTranslateModeFromForm() : '',
            }
        );
        h.syncTranslateModeFromOptions = function syncTranslateModeFromOptions(options = {}) {
            const catalog = (g && (g.TransubSakuraMtCatalog || g.SakuraMtCatalog)) || {};
            if (typeof catalog.resolveTranslateModeFromOptions === 'function') {
                late(h, 'applyTranslateModeToForm')(catalog.resolveTranslateModeFromOptions(options));
                return;
            }
            if (options.translateMode != null && String(options.translateMode).trim() !== '') {
                late(h, 'applyTranslateModeToForm')(options.translateMode);
                return;
            }
            if (options.smartTranslate) late(h, 'applyTranslateModeToForm')('smart');
            else late(h, 'applyTranslateModeToForm')('llm');
        };

        h.isSmartTranslateCapableModel = function isSmartTranslateCapableModel(item) {
            if (retranslatePlanApi.isSmartTranslateCapableModel) {
                return retranslatePlanApi.isSmartTranslateCapableModel(
                    item,
                    typeof h.getManagedLlmCatalogApi === 'function' ? h.getManagedLlmCatalogApi() : null,
                );
            }
            return !!item?.id && !item.translateOnly;
        };

        h.ensureSmartTranslatePickCache = async function ensureSmartTranslatePickCache({ force = false } = {}) {
            if (!force && h.cachedSmartTranslatePick?.catalog?.length) {
                return h.cachedSmartTranslatePick;
            }
            const stationBits = () => ({
                transubStationEnabled: !!(
                    h.getSavedOptionsSnapshot?.()?.transubStationEnabled
                    || h.els?.transubStationEnabledCheck?.checked
                ),
                transubStationUrl: String(
                    h.els?.transubStationUrlInput?.value
                    || h.getSavedOptionsSnapshot?.()?.transubStationUrl
                    || '',
                ).trim(),
                transubStationModel: String(
                    h.els?.transubStationModelInput?.value
                    || h.getSavedOptionsSnapshot?.()?.transubStationModel
                    || '',
                ).trim(),
            });
            // Prefer disk/memory managed catalog so translate menu paints without waiting on IPC.
            if (!force || !h.cachedSmartTranslatePick?.catalog?.length) {
                try {
                    if (typeof h.ensureEngineModelsCacheApplied === 'function'
                        && !(typeof h.hasEngineModelsCacheInMemory === 'function'
                            && h.hasEngineModelsCacheInMemory()
                            && (h.getCachedManagedCatalogSnapshot?.()?.length || 0) > 0)) {
                        await h.ensureEngineModelsCacheApplied();
                    }
                } catch { /* disk warm optional */ }
                const snap = typeof h.getCachedManagedCatalogSnapshot === 'function'
                    ? h.getCachedManagedCatalogSnapshot()
                    : [];
                if (Array.isArray(snap) && snap.length && !h.cachedSmartTranslatePick?.catalog?.length) {
                    const existing = h.cachedSmartTranslatePick || {};
                    h.cachedSmartTranslatePick = {
                        catalog: snap.slice(),
                        smartTranslateModelId: String(
                            existing.smartTranslateModelId
                            || h.els?.advancedSmartTranslateModelSelect?.value
                            || '',
                        ).trim(),
                        smartTranslateResolvedId: String(existing.smartTranslateResolvedId || '').trim(),
                        llmSource: String(existing.llmSource || 'managed').trim(),
                        byokModel: String(existing.byokModel || '').trim(),
                        byokBaseUrl: String(existing.byokBaseUrl || '').trim(),
                        ...stationBits(),
                        fromDiskCache: true,
                    };
                    if (!force) return h.cachedSmartTranslatePick;
                } else if (!force && h.cachedSmartTranslatePick?.catalog?.length) {
                    return h.cachedSmartTranslatePick;
                }
            }
            try {
                const res = await h.electron?.transubAdvancedManagedLlmStatus?.();
                const managed = res?.managed || null;
                h.cachedSmartTranslatePick = {
                    catalog: Array.isArray(managed?.catalog) ? managed.catalog : [],
                    smartTranslateModelId: String(managed?.smartTranslateModelId || '').trim(),
                    smartTranslateResolvedId: String(
                        managed?.smartTranslateResolvedId
                        || managed?.smartTranslateModel?.id
                        || '',
                    ).trim(),
                    llmSource: String(managed?.llmSource || res?.status?.llmSource || '').trim(),
                    byokModel: String(res?.status?.byok?.model || '').trim(),
                    byokBaseUrl: String(res?.status?.byok?.baseUrl || '').trim(),
                    ...stationBits(),
                };
            } catch {
                if (!h.cachedSmartTranslatePick?.catalog?.length) {
                    h.cachedSmartTranslatePick = {
                        catalog: [],
                        smartTranslateModelId: '',
                        smartTranslateResolvedId: '',
                        llmSource: '',
                        byokModel: '',
                        byokBaseUrl: '',
                        ...stationBits(),
                    };
                }
            }
            return h.cachedSmartTranslatePick;
        };
        h.getCachedSmartTranslatePick = () => h.cachedSmartTranslatePick;
        h.setCachedSmartTranslatePick = (v) => { h.cachedSmartTranslatePick = v; };

        // --- bilingual task ---
        h.getBilingualTaskUi = createLazyFactory(
            () => resolveApi(h, 'bilingualTaskUiApi', 'TransubBilingualTaskUi').createBilingualTaskUi,
            () => ({
                els: h.els,
                isTranslateLikeTask: (...a) => h.isTranslateLikeTask(...a),
                readTaskFromForm: (...a) => h.readTaskFromForm(...a),
                readTranslateModeFromForm: late(h, 'readTranslateModeFromForm'),
                canUseSmartTranslateUi: late(h, 'canUseSmartTranslateUi'),
                getIsSyncingTranslateMode: () => !!h.getTranslateModeUi?.()?.isSyncingTranslateMode?.(),
                applyTranslateModeToForm: late(h, 'applyTranslateModeToForm'),
                syncFaithfulToneUi: late(h, 'syncFaithfulToneUi'),
                syncHybridMtUi: late(h, 'syncHybridMtUi'),
                syncAdvancedFeaturesGate: late(h, 'syncAdvancedFeaturesGate'),
                syncBilingualChipUi: late(h, 'syncBilingualChipUi'),
                updateModelSelectHint: late(h, 'updateModelSelectHint'),
            }),
        );
        Object.assign(h, bindApiMethods(h.getBilingualTaskUi, [
            'syncChineseSubtitleVariantUi',
            'syncSmartTranslateUi',
            'readDualLineOrderFromForm',
            'applyDualLineOrderToForm',
            'syncMergeBilingualUi',
        ], {
            readDualLineOrderFromForm: (v) => v || 'target-first',
        }));

        // --- quick extras ---
        h.getQuickExtrasUi = createLazyFactory(
            () => resolveApi(h, 'quickExtrasUiApi', 'TransubQuickExtrasUi').createQuickExtrasUi,
            () => ({
                els: h.els,
                settingsNormApi,
                translateStyleApi,
                postBatchQcFixModes: POST_BATCH_QC_FIX_MODES,
                postBatchQcFixChipLabels: POST_BATCH_QC_FIX_CHIP_LABELS,
                getExpertExtrasMenuOpen: () => (typeof h.getExpertExtrasMenuOpen === 'function'
                    ? !!h.getExpertExtrasMenuOpen()
                    : !!h.expertExtrasMenuOpen),
                setExpertExtrasMenuOpenState: (v) => {
                    if (typeof h.setExpertExtrasMenuOpenState === 'function') h.setExpertExtrasMenuOpenState(v);
                    else h.expertExtrasMenuOpen = !!v;
                },
                getPostBatchQcFixMenuOpen: () => (typeof h.getPostBatchQcFixMenuOpen === 'function'
                    ? !!h.getPostBatchQcFixMenuOpen()
                    : !!h.postBatchQcFixMenuOpen),
                setPostBatchQcFixMenuOpenState: (v) => {
                    if (typeof h.setPostBatchQcFixMenuOpenState === 'function') h.setPostBatchQcFixMenuOpenState(v);
                    else h.postBatchQcFixMenuOpen = !!v;
                },
                getMtUseFormState: () => (typeof h.getMtUseFormState === 'function'
                    ? !!h.getMtUseFormState()
                    : !!h.mtUseFormState),
                setMtUseFormState: (v) => {
                    if (typeof h.setMtUseFormState === 'function') h.setMtUseFormState(v);
                    else h.mtUseFormState = !!v;
                },
                getAdvancedEntitled: () => entitled(h),
                getSavedOptionsSnapshot: () => (typeof h.getSavedOptionsSnapshot === 'function'
                    ? h.getSavedOptionsSnapshot()
                    : h.savedOptionsSnapshot),
                getCachedEngineModels: () => (typeof h.getCachedEngineModels === 'function'
                    ? h.getCachedEngineModels()
                    : h.cachedEngineModels),
                getCachedHardwareRecommend: () => (typeof h.getCachedHardwareRecommend === 'function'
                    ? h.getCachedHardwareRecommend()
                    : h.cachedHardwareRecommend),
                fillEngineModelSelect: late(h, 'fillEngineModelSelect'),
                ensureSelectValue: late(h, 'ensureSelectValue'),
                setPostTaskMenuOpen: late(h, 'setPostTaskMenuOpen'),
                setAddMenuOpen: late(h, 'setAddMenuOpen'),
                setModelsMenuOpen: late(h, 'setModelsMenuOpen'),
                setParamsMoreMenuOpen: late(h, 'setParamsMoreMenuOpen'),
                setTranslateMenuOpen: late(h, 'setTranslateMenuOpen'),
                setParamsModeMenuOpen: late(h, 'setParamsModeMenuOpen'),
                syncParamsMoreChipUi: late(h, 'syncParamsMoreChipUi'),
                promptProUnlockRequired: (...a) => h.promptProUnlockRequired(...a),
                persistFormOptionsQuiet: late(h, 'persistFormOptionsQuiet'),
                updateParamsSummary: late(h, 'updateParamsSummary'),
                readTranslateModeFromForm: late(h, 'readTranslateModeFromForm'),
                readTaskFromForm: (...a) => h.readTaskFromForm(...a),
                syncProGatedSettingsControls: late(h, 'syncProGatedSettingsControls'),
                syncTranslateStyleChipUi: () => {
                    try { h.getTranslateStylePickerUi?.()?.syncTranslateStyleChipUi?.(); } catch { /* ignore */ }
                },
                getTranslateStyleEnabled: () => {
                    try {
                        const ui = h.getTranslateStylePickerUi?.();
                        if (ui?.getTranslateStyleEnabled) return !!ui.getTranslateStyleEnabled();
                    } catch { /* ignore */ }
                    return !!h.els?.translateStyleEnabledCheck?.checked;
                },
            }),
        );
        Object.assign(h, bindApiMethods(h.getQuickExtrasUi, [
            'setExpertExtrasMenuOpen', 'syncQuickExtrasBar',
            'syncExpertQuickModelSelects', 'syncExpertExtraChipsUi', 'syncQuickAsrRecommendChip',
            'mirrorSelectValue', 'normalizePostBatchQcFixMode', 'normalizeViewingCleanMode',
            'getPostBatchQcFixMode', 'postBatchQcFixModeLabel', 'setPostBatchQcFixMenuOpen',
            'syncPostBatchQcFixChipUi', 'setPostBatchQcFixMode',
            'setMtUseForm', 'optionOverridesForJob',
            'readGlobalTranslateStylePreset', 'translateStyleOptionsForItem', 'updateTranslateStyleUi',
        ]));

        // --- translate style picker ---
        h.getTranslateStylePickerUi = createLazyFactory(
            () => resolveApi(h, 'translateStylePickerUiApi', 'TransubTranslateStylePickerUi').createTranslateStylePickerUi,
            () => ({
                state: h.state,
                els: h.els,
                translateStyleApi,
                getAdvancedEntitled: () => entitled(h),
                normPath: late(h, 'normPath'),
                basename: late(h, 'basename'),
                uiTf: late(h, 'uiTf'),
                showToast: late(h, 'showToast'),
                appendLog: late(h, 'appendLog'),
                syncSelectAllCheck: late(h, 'syncSelectAllCheck'),
                renderList: late(h, 'renderList'),
                updateStartButton: late(h, 'updateStartButton'),
                refreshListRow: late(h, 'refreshListRow'),
                syncLiveBatchOverrides: late(h, 'syncLiveBatchOverrides'),
                getRunning: () => !!h.state?.running,
                persistFormOptionsQuiet: late(h, 'persistFormOptionsQuiet'),
                updateTranslateStyleUi: () => late(h, 'updateTranslateStyleUi')(),
                openAppSettings: late(h, 'openAppSettings'),
                closeSiblingMenus: (...a) => {
                    if (typeof h.closeSiblingMenus === 'function') return h.closeSiblingMenus(...a);
                    late(h, 'setModelsMenuOpen')(false);
                    late(h, 'setParamsMoreMenuOpen')(false);
                    late(h, 'setBilingualMenuOpen')(false);
                    late(h, 'setPostBatchQcFixMenuOpen')(false);
                    late(h, 'setExpertExtrasMenuOpen')(false);
                    late(h, 'setPostTaskMenuOpen')(false);
                    late(h, 'setAddMenuOpen')(false);
                    return undefined;
                },
            }),
        );
        h.callTranslateStylePickerUi = (method, ...args) => {
            const ui = h.getTranslateStylePickerUi();
            if (!ui || typeof ui[method] !== 'function') return undefined;
            return ui[method](...args);
        };
        if (typeof bindCallMethods === 'function') {
            Object.assign(h, bindCallMethods(
                (method, ...args) => h.callTranslateStylePickerUi(method, ...args),
                [
                    'populateTranslateStylePickerSelect', 'resolveTranslateStyleTargets',
                    'openTranslateStylePickerModal', 'closeTranslateStylePickerModal',
                    'syncTranslateStylePickerCustomWrap', 'applyTranslateStylePicker',
                    'getTranslateStyleMenuOpen', 'setTranslateStyleMenuOpen', 'syncTranslateStyleChipUi',
                    'rebuildTranslateStylePresetList', 'applyTranslateStyleEnabled',
                    'applyTranslateStylePreset', 'applyTranslateStyleMenuCustomNote',
                    'openTranslateStyleSettings', 'getTranslateStyleEnabled',
                    'setTranslateStyleEnabledState', 'bindTranslateStyleChipEvents',
                ],
                {
                    resolveTranslateStyleTargets: (v) => v || [],
                    getTranslateStyleMenuOpen: (v) => !!v,
                    getTranslateStyleEnabled: (v) => !!v,
                },
            ));
        }

        return h;
    }

    return { install };
}));
