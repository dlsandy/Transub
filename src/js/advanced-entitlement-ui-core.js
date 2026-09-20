/**
 * Pro entitlement chrome UI: badge/title, gated nav/settings, lab gate, unlock prompt.
 * Shell injects DOM/IPC/state via createAdvancedEntitlementUi(deps).
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAdvancedEntitlementUi = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function advancedEntitlementUiFactory(global) {
    /** Keep in sync with advanced-settings.js AFDIAN_PURCHASE_URL. */
    const AFDIAN_PRO_PURCHASE_URL = 'https://afdian.com/item/41fef1a28bf211f189e252540025c377';

    const PRO_GATED_TAB_TITLES = Object.freeze({
        'pro-smart-translate': '智能翻译',
        'pro-film-audio': '影视音频增强',
        'pro-qc-smart': '智能修复',
        'pro-reconstruct': '语境和理解重构',
    });

    /**
     * @param {object} deps shell adapters
     */
    function createAdvancedEntitlementUi(deps) {
        const d = deps || {};
        const els = d.els || {};
        const electron = d.electron;
        const factoryChromeApi = d.factoryChromeApi || {};

        const getAdvancedEntitled = typeof d.getAdvancedEntitled === 'function'
            ? d.getAdvancedEntitled
            : () => !!d.advancedEntitled;
        const setAdvancedEntitledState = d.setAdvancedEntitledState
            || ((v) => { d.advancedEntitled = !!v; });
        const getAdvancedEntitlementKnown = d.getAdvancedEntitlementKnown
            || (() => !!d.advancedEntitlementKnown);
        const setAdvancedEntitlementKnown = d.setAdvancedEntitlementKnown
            || ((v) => { d.advancedEntitlementKnown = !!v; });
        const getInsertSoftwareCreditIsDefault = d.getInsertSoftwareCreditIsDefault
            || (() => !!d.insertSoftwareCreditIsDefault);
        const setInsertSoftwareCreditIsDefault = d.setInsertSoftwareCreditIsDefault
            || ((v) => { d.insertSoftwareCreditIsDefault = !!v; });
        const setFreePipelineTranslate = d.setFreePipelineTranslate
            || ((v) => { d.freePipelineTranslate = v; });
        const getSavedOptionsSnapshot = d.getSavedOptionsSnapshot || (() => null);
        const setSavedOptionsSnapshot = d.setSavedOptionsSnapshot || (() => {});

        const getIsStandaloneSettings = d.getIsStandaloneSettings
            || (() => !!d.isStandaloneSettings);
        const getIsStandaloneWizard = d.getIsStandaloneWizard
            || (() => !!d.isStandaloneWizard);
        const getActiveParamsTab = d.getActiveParamsTab || (() => 'runtime');
        const resolveParamsTab = d.resolveParamsTab || ((tabId) => {
            const raw = String(tabId || '').trim();
            return raw || 'runtime';
        });

        const uiTf = d.uiTf || ((s) => s);
        const appConfirmChoice = d.appConfirmChoice || (async () => 'secondary');
        const setSaveParamsStatus = d.setSaveParamsStatus || (() => {});
        const switchParamsTab = d.switchParamsTab || (() => {});
        // Prefer dedicated settings window on desktop; fall back to in-page tab switch.
        const openAppSettings = d.openAppSettings
            || ((tab, opts) => switchParamsTab(tab, opts || {}));
        const readTranslateModeFromForm = d.readTranslateModeFromForm || (() => 'llm');
        const applyTranslateModeToForm = d.applyTranslateModeToForm || (() => {});
        const isSakuraMtModelId = d.isSakuraMtModelId || (() => false);
        const getPostBatchQcFixMode = d.getPostBatchQcFixMode || (() => 'off');
        const setPostBatchQcFixMode = d.setPostBatchQcFixMode || (async () => {});
        const syncSmartTranslateUi = d.syncSmartTranslateUi || (() => {});
        const syncAdvancedFeaturesGate = d.syncAdvancedFeaturesGate || (() => {});
        const syncMtModelChipUi = d.syncMtModelChipUi || (() => {});
        const syncTranslateModeChipUi = d.syncTranslateModeChipUi || (() => {});
        const syncPostBatchQcFixChipUi = d.syncPostBatchQcFixChipUi || (() => {});
        const updateReadinessStrip = d.updateReadinessStrip || (() => {});
        const updateQcBanner = d.updateQcBanner || (() => {});
        const updateTranslateStyleUi = d.updateTranslateStyleUi || (() => {});
        const getCachedEnginePickCatalog = d.getCachedEnginePickCatalog || (() => []);
        const isEngineModelsLibraryOpen = d.isEngineModelsLibraryOpen || (() => false);
        const refreshEngineModels = d.refreshEngineModels || (async () => {});
        const getEngineModelsStatusFilter = d.getEngineModelsStatusFilter || (() => 'all');
        const setEngineModelsStatusFilter = d.setEngineModelsStatusFilter || (() => {});
        const purchaseUrl = String(d.afdianProPurchaseUrl || AFDIAN_PRO_PURCHASE_URL).trim()
            || AFDIAN_PRO_PURCHASE_URL;

        function applyProSoftwareCreditDefault({ persist = false } = {}) {
            setInsertSoftwareCreditIsDefault(false);
            if (!els.insertSoftwareCreditCheck) return;
            const alreadyOff = !els.insertSoftwareCreditCheck.checked;
            if (!alreadyOff) {
                els.insertSoftwareCreditCheck.checked = false;
            }
            try {
                const snap = getSavedOptionsSnapshot();
                setSavedOptionsSnapshot({
                    ...(snap && typeof snap === 'object' ? snap : {}),
                    insertSoftwareCredit: false,
                });
            } catch (_) { /* ignore */ }
            if (persist) {
                void electron?.transWithAiSaveOptions?.({ insertSoftwareCredit: false }).catch(() => {});
            }
        }

        function setAdvancedEntitled(entitled, freeInfo) {
            const prevEntitled = getAdvancedEntitled();
            const wasKnown = getAdvancedEntitlementKnown();
            setAdvancedEntitledState(!!entitled);
            setFreePipelineTranslate((freeInfo && typeof freeInfo === 'object')
                ? {
                    ok: !!freeInfo.ok,
                    modelId: String(freeInfo.modelId || ''),
                    message: String(freeInfo.message || ''),
                    reason: String(freeInfo.reason || ''),
                }
                : { ok: false });
            try {
                if (!getIsStandaloneSettings() && !getIsStandaloneWizard()) {
                    const title = factoryChromeApi.productWindowTitle
                        ? factoryChromeApi.productWindowTitle(getAdvancedEntitled())
                        : 'Transub 字幕工厂';
                    if (typeof document !== 'undefined') document.title = title;
                    if (els.factoryTitleBarLabel) {
                        els.factoryTitleBarLabel.textContent = factoryChromeApi.PRODUCT_SHORT_NAME || '字幕工厂';
                    }
                    if (els.appBrandName) {
                        els.appBrandName.textContent = factoryChromeApi.PRODUCT_SHORT_NAME || '字幕工厂';
                    }
                    if (els.factoryProBadge) {
                        els.factoryProBadge.hidden = !getAdvancedEntitled();
                    }
                    if (els.activateProBtn) {
                        els.activateProBtn.hidden = !!getAdvancedEntitled();
                    }
                }
            } catch (_) { /* ignore */ }
            // After status is known, drop Advanced-only flags so free users are not stuck
            // with disabled-but-checked boxes that block save / fail every batch file.
            if (!getAdvancedEntitled()) {
                if (els.filmAudioEnhanceCheck) els.filmAudioEnhanceCheck.checked = false;
                if (els.filmVadPresetCheck) els.filmVadPresetCheck.checked = false;
                if (readTranslateModeFromForm() === 'smart' || els.smartTranslateCheck?.checked) {
                    const llmId = String(els.engineLlmMtModelSelect?.value || '').trim();
                    const fallback = (isSakuraMtModelId(llmId)
                        || global.TransubSakuraMtCatalog?.isLlmInferenceMtModel?.(llmId))
                        ? 'llm'
                        : 'engine';
                    applyTranslateModeToForm(fallback);
                }
                if (getPostBatchQcFixMode() === 'smart') {
                    void setPostBatchQcFixMode('fix', { fromUser: false, persist: false });
                }
            }
            // Pro default: software credit off. Unlock always clears prior free check.
            if (getAdvancedEntitled()) {
                const unlockedNow = wasKnown && !prevEntitled;
                const firstResolveAlreadyPro = !wasKnown;
                if (unlockedNow || (firstResolveAlreadyPro && getInsertSoftwareCreditIsDefault())) {
                    applyProSoftwareCreditDefault({ persist: true });
                }
            }
            setAdvancedEntitlementKnown(true);
            syncSmartTranslateUi();
            syncAdvancedFeaturesGate();
            syncMtModelChipUi();
            syncProGatedNav();
            syncTranslateModeChipUi();
            syncPostBatchQcFixChipUi();
            syncEngineModelsLabGate();
            updateReadinessStrip();
            updateQcBanner();
            // Pro unlock changes which LLM models appear in「模型 → LLM推理翻译」.
            // Only live-refresh when models workspace is open — avoid spawning the engine on cold start.
            const catalog = getCachedEnginePickCatalog();
            if (Array.isArray(catalog) && catalog.length && isEngineModelsLibraryOpen()) {
                void refreshEngineModels({ silent: true });
            }
            updateTranslateStyleUi();
            try { global.TransubScenePresetsUi?.onProEntitlementChanged?.(); } catch (_) { /* ignore */ }
        }

        function syncEngineModelsLabGate() {
            const entitled = getAdvancedEntitled();
            const btn = els.engineModelsLabBtn;
            if (btn) {
                btn.classList.toggle('is-pro-locked', !entitled);
                btn.title = entitled
                    ? '实验室（Pro）：添加任意 llama 兼容 GGUF'
                    : '实验室为 Pro 功能，解锁后可用';
                btn.setAttribute('aria-label', entitled ? '实验室' : '实验室（需解锁 Pro）');
            }
            const experimentalChip = els.engineModelsStatusFilters
                ?.querySelector?.('[data-models-status="experimental"]');
            if (experimentalChip) {
                experimentalChip.disabled = !entitled;
                experimentalChip.title = entitled ? '' : '实验筛选项需解锁 Pro';
                if (!entitled && getEngineModelsStatusFilter() === 'experimental') {
                    setEngineModelsStatusFilter('all');
                }
            }
            if (!entitled) {
                const modal = els.engineModelsLabModal
                    || (typeof document !== 'undefined'
                        ? document.getElementById('engineModelsLabModal')
                        : null);
                if (modal && !modal.classList.contains('hidden')) {
                    modal.classList.add('hidden');
                    modal.hidden = true;
                    modal.setAttribute('aria-hidden', 'true');
                }
            }
        }

        function isProGatedTab(tabId) {
            const id = resolveParamsTab(tabId);
            return id.startsWith('pro-');
        }

        async function promptProUnlockRequired({ featureLabel = '' } = {}) {
            const label = String(featureLabel || '').trim() || '该功能';
            setSaveParamsStatus('需先解锁 Pro 功能', 'warn');
            const action = await appConfirmChoice({
                title: '需要解锁 Pro',
                message: uiTf('「{label}」需先解锁 Pro 功能。可前往爱发电购买本大版本买断，付款后在「Pro许可」页用订单号领取并激活。', { label }),
                primaryLabel: '去解锁 Pro',
                secondaryLabel: '取消',
                tertiaryLabel: '打开许可页',
                type: 'question',
            });
            if (action === 'primary') {
                try {
                    await electron?.openExternal?.(purchaseUrl);
                } catch (_) { /* ignore */ }
                openAppSettings('pro');
                return true;
            }
            if (action === 'tertiary') {
                openAppSettings('pro');
                return true;
            }
            return false;
        }

        function syncProGatedNav() {
            const entitled = getAdvancedEntitled();
            els.paramsTabBtns?.forEach((btn) => {
                const gated = btn.getAttribute('data-pro-gated') === '1' || isProGatedTab(btn.dataset.tab);
                const locked = gated && !entitled;
                btn.classList.toggle('is-pro-locked', locked);
                btn.setAttribute('aria-disabled', locked ? 'true' : 'false');
                if (gated) {
                    const baseTitle = PRO_GATED_TAB_TITLES[btn.dataset.tab]
                        || String(btn.title || '').replace(/（需解锁 Pro）$/, '')
                        || 'Pro 功能';
                    btn.title = locked ? `${baseTitle}（需解锁 Pro）` : baseTitle;
                }
            });
            if (isProGatedTab(getActiveParamsTab()) && !entitled) {
                switchParamsTab('pro', { fromGate: true });
            }
            syncProGatedSettingsControls();
        }

        /** Disable Pro-only controls that live outside gated tabs. */
        function syncProGatedSettingsControls() {
            if (typeof document === 'undefined') return;
            const locked = !getAdvancedEntitled();
            document.querySelectorAll('[data-pro-setting]').forEach((el) => {
                if (typeof HTMLElement !== 'undefined' && !(el instanceof HTMLElement)) return;
                if (!el || typeof el !== 'object') return;
                const interactive = (typeof el.matches === 'function'
                    && el.matches('input, select, button, textarea'))
                    ? el
                    : (typeof el.querySelector === 'function'
                        ? el.querySelector('input, select, button, textarea')
                        : null);
                if (typeof HTMLInputElement !== 'undefined'
                    && (interactive instanceof HTMLInputElement
                        || interactive instanceof HTMLSelectElement
                        || interactive instanceof HTMLButtonElement
                        || interactive instanceof HTMLTextAreaElement)) {
                    interactive.disabled = locked || interactive.dataset.forceDisabled === '1';
                } else if (interactive && 'disabled' in interactive) {
                    interactive.disabled = locked || interactive.dataset?.forceDisabled === '1';
                }
                if (typeof el.classList?.toggle === 'function') {
                    el.classList.toggle('opacity-50', locked);
                    el.classList.toggle('pointer-events-none', locked);
                }
                if (locked) {
                    el.title = el.dataset?.proLockTitle || '需解锁 Pro 后可用';
                } else if (el.dataset?.proLockTitle) {
                    if (typeof el.removeAttribute === 'function') el.removeAttribute('title');
                    else delete el.title;
                }
            });
        }

        return {
            applyProSoftwareCreditDefault,
            setAdvancedEntitled,
            syncEngineModelsLabGate,
            isProGatedTab,
            promptProUnlockRequired,
            syncProGatedNav,
            syncProGatedSettingsControls,
            PRO_GATED_TAB_TITLES,
            AFDIAN_PRO_PURCHASE_URL: purchaseUrl,
        };
    }

    return {
        createAdvancedEntitlementUi,
        PRO_GATED_TAB_TITLES,
        AFDIAN_PRO_PURCHASE_URL,
    };
}));
