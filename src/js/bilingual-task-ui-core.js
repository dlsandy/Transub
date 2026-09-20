/**
 * Chinese subtitle variant / smart-translate allow / bilingual merge form sync.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubBilingualTaskUi = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function bilingualTaskUiFactory(global) {
    /**
     * @param {object} deps shell adapters
     */
    function createBilingualTaskUi(deps) {
        const d = deps || {};
        const els = d.els || {};
        const isTranslateLikeTask = d.isTranslateLikeTask || ((task) => {
            const t = String(task || '');
            return t === 'translate' || t === 'dual';
        });
        const readTaskFromForm = d.readTaskFromForm || (() => 'dual');
        const readTranslateModeFromForm = d.readTranslateModeFromForm || (() => 'engine');
        const canUseSmartTranslateUi = d.canUseSmartTranslateUi || (() => false);
        const getIsSyncingTranslateMode = d.getIsSyncingTranslateMode || (() => false);
        const applyTranslateModeToForm = d.applyTranslateModeToForm || (() => {});
        const syncFaithfulToneUi = d.syncFaithfulToneUi || (() => {});
        const syncHybridMtUi = d.syncHybridMtUi || (() => {});
        const syncAdvancedFeaturesGate = d.syncAdvancedFeaturesGate || (() => {});
        const syncBilingualChipUi = d.syncBilingualChipUi || (() => {});
        const updateModelSelectHint = d.updateModelSelectHint || (() => {});

        function syncChineseSubtitleVariantUi() {
            const isTranslate = isTranslateLikeTask(readTaskFromForm());
            if (els.chineseSubtitleVariantSelect) {
                els.chineseSubtitleVariantSelect.disabled = !isTranslate;
            }
            if (els.quickTargetLangSelect) {
                els.quickTargetLangSelect.disabled = !isTranslate;
            }
            const wrap = typeof document !== 'undefined'
                ? document.getElementById('chineseSubtitleVariantWrap')
                : null;
            wrap?.classList.toggle('opacity-50', !isTranslate);
            els.quickTargetLangWrap?.classList.toggle('opacity-50', !isTranslate);
            els.quickTargetLangWrap?.classList.toggle('pointer-events-none', !isTranslate);
            syncMergeBilingualUi();
            syncSmartTranslateUi();
            updateModelSelectHint();
        }

        function syncSmartTranslateUi() {
            const task = readTaskFromForm();
            const allow = task === 'translate' || task === 'dual';
            els.translateModeFieldset?.classList.toggle('opacity-50', !allow);
            els.translateModeFieldset?.classList.toggle('pointer-events-none', !allow);

            if (els.translateModeEngine) els.translateModeEngine.disabled = !allow;
            if (els.translateModeSakura) els.translateModeSakura.disabled = !allow;
            if (els.translateModeDialog) els.translateModeDialog.disabled = !allow || !canUseSmartTranslateUi();
            if (els.translateModeSmart) els.translateModeSmart.disabled = !allow || !canUseSmartTranslateUi();

            if (!allow) {
                if (els.smartTranslateCheck) els.smartTranslateCheck.checked = false;
                if (!getIsSyncingTranslateMode()) {
                    applyTranslateModeToForm('engine');
                } else {
                    syncFaithfulToneUi(false);
                    syncHybridMtUi();
                    syncAdvancedFeaturesGate();
                }
                return;
            }

            // Keep dependent controls in sync with the current radios. Do not re-derive mode
            // from smartTranslateCheck alone — that raced with HTML defaults (机器翻译) during
            // applyOptionsToForm and wiped a just-loaded 推理/智能 selection.
            if (!getIsSyncingTranslateMode()) {
                applyTranslateModeToForm(readTranslateModeFromForm());
            } else {
                syncFaithfulToneUi(allow);
                syncHybridMtUi();
                syncAdvancedFeaturesGate();
            }
        }

        function readDualLineOrderFromForm() {
            const raw = els.mergeBilingualOrderSelect?.value || 'translation-first';
            const Dual = global && global.TransubDualSubtitle;
            if (typeof Dual?.normalizeDualLineOrder === 'function') {
                return Dual.normalizeDualLineOrder(raw);
            }
            if (raw === 'source-first' || raw === 'source') return 'source-first';
            return 'target-first';
        }

        function applyDualLineOrderToForm(value) {
            if (!els.mergeBilingualOrderSelect) return;
            const Dual = global && global.TransubDualSubtitle;
            const order = typeof Dual?.normalizeDualLineOrder === 'function'
                ? Dual.normalizeDualLineOrder(value)
                : (value === 'source-first' || value === 'source' ? 'source-first' : 'target-first');
            // UI uses translation-first / source-first; runtime stores target-first / source-first.
            els.mergeBilingualOrderSelect.value = order === 'source-first'
                ? 'source-first'
                : 'translation-first';
        }

        function syncMergeBilingualUi() {
            const isDual = readTaskFromForm() === 'dual';
            if (els.mergeBilingualCheck) els.mergeBilingualCheck.disabled = !isDual;
            if (els.mergeBilingualWrap) {
                els.mergeBilingualWrap.classList.toggle('hidden', !isDual);
                els.mergeBilingualWrap.classList.toggle('opacity-50', !isDual);
            }
            const mergeOn = isDual && !!els.mergeBilingualCheck?.checked;
            if (els.mergeBilingualOrderSelect) els.mergeBilingualOrderSelect.disabled = !mergeOn;
            if (els.mergeBilingualOrderWrap) {
                els.mergeBilingualOrderWrap.classList.toggle('hidden', !isDual);
                els.mergeBilingualOrderWrap.classList.toggle('opacity-50', !mergeOn);
            }
            if (els.deleteSourcesAfterMergeCheck) {
                els.deleteSourcesAfterMergeCheck.disabled = !mergeOn;
                if (!mergeOn) els.deleteSourcesAfterMergeCheck.checked = false;
            }
            if (els.deleteSourcesAfterMergeWrap) {
                els.deleteSourcesAfterMergeWrap.classList.toggle('hidden', !isDual);
                els.deleteSourcesAfterMergeWrap.classList.toggle('opacity-50', !mergeOn);
            }
            syncBilingualChipUi();
        }

        return {
            syncChineseSubtitleVariantUi,
            syncSmartTranslateUi,
            readDualLineOrderFromForm,
            applyDualLineOrderToForm,
            syncMergeBilingualUi,
        };
    }

    return { createBilingualTaskUi };
}));
