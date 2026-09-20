/**
 * Quick extras / post-batch QC chip / sense→MT overrides / translate-style toolbar sync.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubQuickExtrasUi = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function quickExtrasUiFactory(global) {
    /**
     * @param {object} deps shell adapters
     */
    function createQuickExtrasUi(deps) {
        const d = deps || {};
        const els = d.els || {};
        const settingsNormApi = d.settingsNormApi
            || (global && global.TransubSettingsOptionsNormalize)
            || {};
        const translateStyleApi = d.translateStyleApi
            || (global && global.TransubTranslateStyle)
            || {};
        const postBatchQcFixModes = d.postBatchQcFixModes
            || new Set(['none', 'fix', 'smart']);
        const postBatchQcFixChipLabels = d.postBatchQcFixChipLabels || {
            none: '关闭',
            fix: '自动',
            smart: '智能 Pro',
        };

        const getExpertExtrasMenuOpen = d.getExpertExtrasMenuOpen || (() => false);
        const setExpertExtrasMenuOpenState = d.setExpertExtrasMenuOpenState || (() => {});
        const getPostBatchQcFixMenuOpen = d.getPostBatchQcFixMenuOpen || (() => false);
        const setPostBatchQcFixMenuOpenState = d.setPostBatchQcFixMenuOpenState || (() => {});
        const getMtUseFormState = d.getMtUseFormState || (() => false);
        const setMtUseFormState = d.setMtUseFormState || (() => {});
        const getAdvancedEntitled = d.getAdvancedEntitled || (() => false);
        const getSavedOptionsSnapshot = d.getSavedOptionsSnapshot || (() => null);
        const getCachedEngineModels = d.getCachedEngineModels || (() => []);
        const getCachedHardwareRecommend = d.getCachedHardwareRecommend || (() => null);

        const isAutoSenseEnabled = d.isAutoSenseEnabled || (() => false);
        const fillEngineModelSelect = d.fillEngineModelSelect || (() => {});
        const ensureSelectValue = d.ensureSelectValue || (() => {});
        const setPostTaskMenuOpen = d.setPostTaskMenuOpen || (() => {});
        const setAddMenuOpen = d.setAddMenuOpen || (() => {});
        const setModelsMenuOpen = d.setModelsMenuOpen || (() => {});
        const setParamsMoreMenuOpen = d.setParamsMoreMenuOpen || (() => {});
        const setTranslateMenuOpen = d.setTranslateMenuOpen || (() => {});
        const setParamsModeMenuOpen = d.setParamsModeMenuOpen || (() => {});
        const syncParamsMoreChipUi = d.syncParamsMoreChipUi || (() => {});
        const promptProUnlockRequired = d.promptProUnlockRequired || (() => {});
        const persistFormOptionsQuiet = d.persistFormOptionsQuiet || (async () => {});
        const updateParamsSummary = d.updateParamsSummary || (() => {});
        const readTranslateModeFromForm = d.readTranslateModeFromForm || (() => 'engine');
        const readTaskFromForm = d.readTaskFromForm || (() => 'dual');
        const syncProGatedSettingsControls = d.syncProGatedSettingsControls || (() => {});

        function setExpertExtrasMenuOpen(open) {
            setExpertExtrasMenuOpenState(!!open);
            els.expertDrawerBody?.classList.toggle('hidden', !open);
            els.expertDrawerToggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
            if (open) {
                syncExpertQuickModelSelects();
                syncExpertExtraChipsUi();
                syncSenseLockedExtras();
                setPostTaskMenuOpen(false);
                setAddMenuOpen(false);
                setModelsMenuOpen(false);
                setParamsMoreMenuOpen(false);
                setPostBatchQcFixMenuOpen(false);
            }
        }

        function syncSenseLockedExtras() {
            const locked = false;
            const group = els.quickAsrChipGroup
                || (typeof document !== 'undefined' ? document.getElementById('quickAsrChipGroup') : null);
            group?.classList.toggle('is-sense-locked', locked);
            group?.querySelectorAll('select, input, button').forEach((el) => {
                el.disabled = locked;
            });
            const hint = els.expertDrawerSenseHint
                || (typeof document !== 'undefined' ? document.getElementById('expertDrawerSenseHint') : null);
            if (hint) {
                hint.hidden = !locked;
                hint.classList.toggle('hidden', !locked);
            }
        }

        function syncQuickExtrasBar() {
            if (els.paramsMoreMenuWrap) {
                els.paramsMoreMenuWrap.classList.remove('hidden');
            }
            if (els.expertDrawerMenuWrap) {
                els.expertDrawerMenuWrap.classList.add('hidden');
                els.expertDrawerMenuWrap.hidden = true;
            }
            if (els.paramsExpertExtraChips) {
                els.paramsExpertExtraChips.hidden = true;
                els.paramsExpertExtraChips.classList.add('hidden');
                els.paramsExpertExtraChips.classList.remove('flex');
            }
            setExpertExtrasMenuOpenState(false);
        }

        function syncExpertQuickModelSelects() {
            const cached = getCachedEngineModels() || [];
            const asr = els.engineAsrModelSelect?.value || '';
            const vad = els.engineVadModelSelect?.value || '';
            if (els.quickAsrModelSelect) {
                fillEngineModelSelect(els.quickAsrModelSelect, cached, 'asr', asr);
            }
            if (els.quickVadModelSelect) {
                fillEngineModelSelect(els.quickVadModelSelect, cached, 'vad', vad);
            }
        }

        function syncExpertExtraChipsUi() {
            if (els.quickAsrModelSelect) {
                els.quickAsrModelSelect.value = els.engineAsrModelSelect?.value || els.quickAsrModelSelect.value;
            }
            if (els.quickVadModelSelect) {
                els.quickVadModelSelect.value = els.engineVadModelSelect?.value || els.quickVadModelSelect.value;
            }
            syncQuickAsrRecommendChip();
        }

        function syncQuickAsrRecommendChip() {
            const btn = els.quickAsrRecommendBtn;
            const api = global?.TransubAsrSettings;
            if (!btn || !api?.describeAsrRecommendChip) return;
            const hw = getCachedHardwareRecommend() || {};
            const ui = api.describeAsrRecommendChip({
                currentAsr: els.engineAsrModelSelect?.value || els.quickAsrModelSelect?.value || '',
                recommendedAsr: hw.asrModel || '',
                profile: hw.profile || '',
            });
            const show = !!ui.visible && !isAutoSenseEnabled();
            btn.hidden = !show;
            btn.classList.toggle('hidden', !show);
            if (show) {
                btn.title = ui.detail || ui.label;
                btn.dataset.recommendedAsr = ui.recommendedAsr || '';
            }
        }

        function mirrorSelectValue(fromEl, toEl) {
            if (!fromEl || !toEl) return;
            const v = String(fromEl.value || '');
            if ([...toEl.options].some((o) => o.value === v)) {
                toEl.value = v;
            } else if (v) {
                ensureSelectValue(toEl, v, { label: v, allowEmpty: false });
            }
        }

        function normalizePostBatchQcFixMode(value) {
            if (settingsNormApi.normalizePostBatchQcFixMode) {
                return settingsNormApi.normalizePostBatchQcFixMode(value);
            }
            const mode = String(value || '').trim().toLowerCase();
            return postBatchQcFixModes.has(mode) ? mode : 'none';
        }

        function normalizeViewingCleanMode(value, fallback = 'clear') {
            if (settingsNormApi.normalizeViewingCleanMode) {
                return settingsNormApi.normalizeViewingCleanMode(value, fallback);
            }
            const mode = String(value || '').trim().toLowerCase();
            if (mode === 'off' || mode === 'light' || mode === 'clear') return mode;
            return fallback === 'off' || fallback === 'light' || fallback === 'clear' ? fallback : 'clear';
        }

        function getPostBatchQcFixMode() {
            if (els.postBatchQcFixModeSelect) {
                return normalizePostBatchQcFixMode(els.postBatchQcFixModeSelect.value);
            }
            return normalizePostBatchQcFixMode(getSavedOptionsSnapshot()?.postBatchQcFixMode);
        }

        function postBatchQcFixModeLabel(mode) {
            return postBatchQcFixChipLabels[mode] || postBatchQcFixChipLabels.none;
        }

        function setPostBatchQcFixMenuOpen(open) {
            setPostBatchQcFixMenuOpenState(!!open);
            if (els.postBatchQcFixMenu) {
                els.postBatchQcFixMenu.classList.remove('hidden');
            }
            if (open) {
                setPostTaskMenuOpen(false);
                setAddMenuOpen(false);
                setTranslateMenuOpen(false);
                setParamsModeMenuOpen(false);
                setParamsMoreMenuOpen(true);
            }
        }

        function syncPostBatchQcFixChipUi() {
            const mode = getPostBatchQcFixMode();
            if (els.postBatchQcFixLabel) {
                els.postBatchQcFixLabel.textContent = postBatchQcFixModeLabel(mode);
            }
            els.postBatchQcFixMenu?.querySelectorAll('[data-qc-fix-mode]').forEach((item) => {
                const active = item.dataset.qcFixMode === mode;
                item.classList.toggle('active', active);
                item.setAttribute('aria-checked', active ? 'true' : 'false');
            });
            if (els.postBatchQcFixModeSelect && els.postBatchQcFixModeSelect.value !== mode) {
                els.postBatchQcFixModeSelect.value = mode;
            }
            syncParamsMoreChipUi();
        }

        async function setPostBatchQcFixMode(nextMode, { fromUser = false, persist = true } = {}) {
            let mode = normalizePostBatchQcFixMode(nextMode);
            if (mode === 'smart' && !getAdvancedEntitled()) {
                if (fromUser) {
                    void promptProUnlockRequired({ featureLabel: 'QC 智能修复' });
                }
                mode = 'fix';
            }
            if (els.postBatchQcFixModeSelect) {
                els.postBatchQcFixModeSelect.value = mode;
            }
            syncPostBatchQcFixChipUi();
            if (persist && fromUser) {
                await persistFormOptionsQuiet();
                updateParamsSummary();
            }
        }

        function shouldFollowSenseForMt() {
            return false;
        }

        function setMtUseForm(on, { persist = false } = {}) {
            setMtUseFormState(!!on);
            if (persist) void persistFormOptionsQuiet();
        }

        /** Legacy sense overrides hook — auto-sense removed; always undefined. */
        function senseOverridesForJob() {
            return undefined;
        }

        function translateStyleOptionsForItem(item) {
            const snap = getSavedOptionsSnapshot();
            const enabled = translateStyleApi.normalizeTranslateStyleEnabled?.(
                snap?.translateStyleEnabled ?? els.translateStyleEnabledCheck?.checked,
            );
            const resolved = translateStyleApi.resolveEffectiveTranslateStyle?.({
                enabled,
                globalPreset: snap?.translateStylePreset
                    || els.translateStylePresetSelect?.value,
                globalNote: snap?.translateStyleCustomNote
                    || els.translateStyleCustomNoteInput?.value,
                itemPreset: item?.translateStylePreset,
                itemNote: item?.translateStyleCustomNote,
                entitled: getAdvancedEntitled(),
            }) || {
                enabled: false,
                preset: translateStyleApi.DEFAULT_PRESET || 'natural_spoken',
                customNote: '',
            };
            return {
                translateStyleEnabled: !!resolved.enabled,
                translateStylePreset: resolved.preset,
                translateStyleCustomNote: resolved.customNote,
            };
        }

        function optionOverridesForJob(item) {
            const ov = {};
            const sense = senseOverridesForJob(item);
            if (sense) Object.assign(ov, sense);
            const style = translateStyleOptionsForItem(item);
            if (style && Object.prototype.hasOwnProperty.call(style, 'translateStyleEnabled')) {
                ov.translateStyleEnabled = !!style.translateStyleEnabled;
            }
            if (style?.translateStylePreset) {
                ov.translateStylePreset = style.translateStylePreset;
                if (style.translateStyleCustomNote) {
                    ov.translateStyleCustomNote = style.translateStyleCustomNote;
                }
            }
            const shelfOv = item?.shelfOptionOverrides && typeof item.shelfOptionOverrides === 'object'
                ? item.shelfOptionOverrides
                : null;
            if (shelfOv) Object.assign(ov, shelfOv);
            else if (item?.skipAsr || item?.shelfEntryStage || item?.fromShelf) {
                if (item.skipAsr || item.shelfEntryStage) ov.skipAsr = true;
                if (item.skipAsr || item.shelfEntryStage) ov.overwrite = true;
                if (item.skipAsr || item.shelfEntryStage) ov.task = 'translate';
                const src = String(item.sourceSubtitlePath || item.shelfSourceSubtitlePath || '').trim();
                if (src) ov.shelfSourceSubtitlePath = src;
                if (item.shelfEntryStage) ov.shelfEntryStage = item.shelfEntryStage;
                if (item.shelfSourceSlot) ov.shelfSourceSlot = item.shelfSourceSlot;
            }
            return Object.keys(ov).length ? ov : undefined;
        }

        function readGlobalTranslateStylePreset() {
            const fromSaved = getSavedOptionsSnapshot()?.translateStylePreset;
            if (fromSaved) return fromSaved;
            return els.translateStylePresetSelect?.value || translateStyleApi.DEFAULT_PRESET || 'natural_spoken';
        }

        function updateTranslateStyleUi() {
            const entitled = !!getAdvancedEntitled();
            const enabled = typeof d.getTranslateStyleEnabled === 'function'
                ? !!d.getTranslateStyleEnabled()
                : !!els.translateStyleEnabledCheck?.checked;
            if (els.translateStyleEnabledCheck && els.translateStyleEnabledCheck.checked !== enabled) {
                els.translateStyleEnabledCheck.checked = enabled;
            }
            const customOpt = els.translateStyleCustomOption;
            if (customOpt) {
                customOpt.hidden = !entitled;
                customOpt.disabled = !entitled;
            }
            const preset = els.translateStylePresetSelect?.value || 'natural_spoken';
            const showCustom = entitled && enabled && preset === 'custom';
            els.translateStyleCustomWrap?.classList.toggle('hidden', !showCustom);
            if (els.translateStyleCustomWrap) {
                els.translateStyleCustomWrap.dataset.proSetting = '1';
            }
            if (els.translateStyleCustomNoteInput) {
                els.translateStyleCustomNoteInput.dataset.proSetting = '1';
            }
            if (els.translateStylePresetSelect) {
                els.translateStylePresetSelect.disabled = !enabled;
            }
            if (els.translateStyleCustomNoteInput) {
                els.translateStyleCustomNoteInput.disabled = !enabled || preset !== 'custom';
            }
            if (!entitled && preset === 'custom' && els.translateStylePresetSelect) {
                els.translateStylePresetSelect.value = translateStyleApi.DEFAULT_PRESET || 'natural_spoken';
                els.translateStyleCustomWrap?.classList.add('hidden');
            }
            syncProGatedSettingsControls();
            if (typeof d.syncTranslateStyleChipUi === 'function') {
                d.syncTranslateStyleChipUi();
            }
        }

        return {
            setExpertExtrasMenuOpen,
            syncSenseLockedExtras,
            syncQuickExtrasBar,
            syncExpertQuickModelSelects,
            syncExpertExtraChipsUi,
            syncQuickAsrRecommendChip,
            mirrorSelectValue,
            normalizePostBatchQcFixMode,
            normalizeViewingCleanMode,
            getPostBatchQcFixMode,
            postBatchQcFixModeLabel,
            setPostBatchQcFixMenuOpen,
            syncPostBatchQcFixChipUi,
            setPostBatchQcFixMode,
            shouldFollowSenseForMt,
            setMtUseForm,
            senseOverridesForJob,
            optionOverridesForJob,
            readGlobalTranslateStylePreset,
            translateStyleOptionsForItem,
            updateTranslateStyleUi,
            getExpertExtrasMenuOpen,
            getPostBatchQcFixMenuOpen,
        };
    }

    return { createQuickExtrasUi };
}));
