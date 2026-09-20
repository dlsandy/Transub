/**
 * Chrome wire: advanced entitlement / Pro gate UI.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAppWireChromeEntitlement = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function appWireChromeEntitlementFactory(global) {
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

        h.getAdvancedEntitlementUi = createLazyFactory(
            () => resolveApi(h, 'advancedEntitlementUiApi', 'TransubAdvancedEntitlementUi').createAdvancedEntitlementUi,
            () => ({
                els: h.els,
                electron: h.electron,
                factoryChromeApi: h.factoryChromeApi || (global && global.TransubFactoryChrome) || {},
                getAdvancedEntitled: () => entitled(h),
                setAdvancedEntitledState: (v) => {
                    if (typeof h.setAdvancedEntitledState === 'function') h.setAdvancedEntitledState(v);
                    else h.advancedEntitled = !!v;
                },
                getAdvancedEntitlementKnown: () => (typeof h.getAdvancedEntitlementKnown === 'function'
                    ? !!h.getAdvancedEntitlementKnown()
                    : !!h.advancedEntitlementKnown),
                setAdvancedEntitlementKnown: (v) => {
                    if (typeof h.setAdvancedEntitlementKnown === 'function') h.setAdvancedEntitlementKnown(v);
                    else h.advancedEntitlementKnown = !!v;
                },
                getInsertSoftwareCreditIsDefault: () => (typeof h.getInsertSoftwareCreditIsDefault === 'function'
                    ? !!h.getInsertSoftwareCreditIsDefault()
                    : !!h.insertSoftwareCreditIsDefault),
                setInsertSoftwareCreditIsDefault: (v) => {
                    if (typeof h.setInsertSoftwareCreditIsDefault === 'function') h.setInsertSoftwareCreditIsDefault(v);
                    else h.insertSoftwareCreditIsDefault = !!v;
                },
                setFreePipelineTranslate: (v) => {
                    if (typeof h.setFreePipelineTranslate === 'function') h.setFreePipelineTranslate(v);
                    else h.freePipelineTranslate = v;
                },
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
                getIsStandaloneWizard: () => (typeof h.getIsStandaloneWizard === 'function'
                    ? !!h.getIsStandaloneWizard()
                    : !!h.isStandaloneWizard),
                getActiveParamsTab: () => (typeof h.getActiveParamsTab === 'function'
                    ? h.getActiveParamsTab()
                    : h.activeParamsTab),
                resolveParamsTab: late(h, 'resolveParamsTab'),
                uiTf: late(h, 'uiTf'),
                appConfirmChoice: late(h, 'appConfirmChoice'),
                setSaveParamsStatus: (...a) => h.setSaveParamsStatus(...a),
                switchParamsTab: late(h, 'switchParamsTab'),
                openAppSettings: late(h, 'openAppSettings'),
                readTranslateModeFromForm: late(h, 'readTranslateModeFromForm'),
                applyTranslateModeToForm: late(h, 'applyTranslateModeToForm'),
                isSakuraMtModelId: late(h, 'isSakuraMtModelId'),
                getPostBatchQcFixMode: late(h, 'getPostBatchQcFixMode'),
                setPostBatchQcFixMode: late(h, 'setPostBatchQcFixMode'),
                syncSmartTranslateUi: late(h, 'syncSmartTranslateUi'),
                syncAdvancedFeaturesGate: late(h, 'syncAdvancedFeaturesGate'),
                syncMtModelChipUi: late(h, 'syncMtModelChipUi'),
                syncTranslateModeChipUi: late(h, 'syncTranslateModeChipUi'),
                syncPostBatchQcFixChipUi: late(h, 'syncPostBatchQcFixChipUi'),
                updateReadinessStrip: late(h, 'updateReadinessStrip'),
                updateQcBanner: late(h, 'updateQcBanner'),
                updateTranslateStyleUi: late(h, 'updateTranslateStyleUi'),
                getCachedEnginePickCatalog: () => (typeof h.getCachedEnginePickCatalog === 'function'
                    ? h.getCachedEnginePickCatalog()
                    : h.cachedEnginePickCatalog),
                isEngineModelsLibraryOpen: late(h, 'isEngineModelsLibraryOpen'),
                refreshEngineModels: (...a) => h.refreshEngineModels(...a),
                getEngineModelsStatusFilter: late(h, 'getEngineModelsStatusFilter'),
                setEngineModelsStatusFilter: late(h, 'setEngineModelsStatusFilter'),
            }),
        );

        h.callAdvancedEntitlementUi = (method, ...args) => {
            const ui = h.getAdvancedEntitlementUi();
            if (!ui || typeof ui[method] !== 'function') return undefined;
            return ui[method](...args);
        };

        if (typeof bindCallMethods === 'function') {
            Object.assign(h, bindCallMethods(
                (method, ...args) => h.callAdvancedEntitlementUi(method, ...args),
                [
                    'applyProSoftwareCreditDefault',
                    'setAdvancedEntitled',
                    'syncEngineModelsLabGate',
                    'syncProGatedNav',
                    'syncProGatedSettingsControls',
                ],
            ));
        }

        h.isProGatedTab = function isProGatedTab(...args) {
            const ui = h.getAdvancedEntitlementUi();
            if (ui?.isProGatedTab) return ui.isProGatedTab(...args);
            const id = typeof h.resolveParamsTab === 'function' ? h.resolveParamsTab(args[0]) : String(args[0] || '');
            return id.startsWith('pro-');
        };

        h.promptProUnlockRequired = async function promptProUnlockRequired(...args) {
            const ui = h.getAdvancedEntitlementUi();
            if (ui?.promptProUnlockRequired) return ui.promptProUnlockRequired(...args);
            return false;
        };
        if (global) global.promptProUnlockRequired = (...a) => h.promptProUnlockRequired(...a);

        h.refreshAdvancedEntitlement = async function refreshAdvancedEntitlement() {
            const getEntitlement = h.electron?.transubAdvancedGetEntitlement
                || h.electron?.transubAdvancedGetStatus;
            if (!getEntitlement) {
                late(h, 'setAdvancedEntitled')(false, { ok: false });
                return;
            }
            try {
                const res = await getEntitlement();
                late(h, 'setAdvancedEntitled')(
                    !!res?.ok && !!res?.status?.entitled,
                    res?.status?.freePipelineTranslate || { ok: false },
                );
            } catch (_) {
                late(h, 'setAdvancedEntitled')(false, { ok: false });
            }
        };

        return h;
    }

    return { install };
}));
