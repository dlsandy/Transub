/**
 * Chinese subtitle variant / smart-translate allow / bilingual merge form sync.
 * Main-window 目标 chip:「原文」= 仅转写（task=transcribe）.
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
        const toQuickTargetLang = d.toQuickTargetLang || ((v) => {
            const s = String(v || '').trim();
            if (isSourceFormValue(s)) return 'source';
            if (s === 'traditional' || s === 'traditional-tw' || s === 'traditional-hk') return 'traditional';
            if (s === 'en' || s === 'ja' || s === 'ko') return s;
            return 'simplified';
        });

        function targetLangApi() {
            return (global && global.TransubSubtitleTargetLang) || null;
        }

        function isSourceFormValue(raw) {
            const api = targetLangApi();
            if (typeof api?.isSourceTargetFormValue === 'function') {
                return !!api.isSourceTargetFormValue(raw);
            }
            const v = String(raw || '').trim().toLowerCase();
            return v === 'source' || v === 'original' || v === 'transcribe';
        }

        function sourceFormValue() {
            const api = targetLangApi();
            return api?.SOURCE_TARGET_FORM_VALUE || 'source';
        }

        function readSourceLanguage() {
            const quick = resolveLiveEl(els.quickLanguageSelect, 'quickLanguageSelect');
            const hidden = resolveLiveEl(els.languageSelect, 'languageSelect');
            return String(quick?.value || hidden?.value || '').trim();
        }

        function yueZhChipSkipsMt(targetForm) {
            const api = targetLangApi();
            if (typeof api?.yueTargetSkipsMachineTranslate === 'function') {
                return !!api.yueTargetSkipsMachineTranslate(readSourceLanguage(), targetForm);
            }
            const lang = String(readSourceLanguage() || '').trim().toLowerCase();
            const isYue = lang === 'yue' || lang === 'zh-yue' || lang === 'cantonese';
            if (!isYue) return false;
            // Yue + 原文 only; 简/繁/外文 go through MT (粤→普通话等).
            return isSourceFormValue(targetForm);
        }

        function resolveLiveEl(cached, id) {
            if (typeof document === 'undefined') return cached || null;
            const live = id ? document.getElementById(id) : null;
            if (live && els && id && els[id] !== live) {
                // Refresh shell cache when settings/fragment replaceWith swapped the node.
                els[id] = live;
            }
            return live || cached || null;
        }

        /**
         * Keep 目标 chip in sync with hidden taskSelect (transcribe ↔ 原文).
         */
        function syncQuickTargetChipFromTask() {
            const targetSelect = resolveLiveEl(
                els.quickTargetLangSelect,
                'quickTargetLangSelect',
            );
            if (!targetSelect) return;
            const taskSelect = resolveLiveEl(els.taskSelect, 'taskSelect');
            let task = readTaskFromForm();
            const chipRaw = targetSelect.value;
            // If the visible 目标 chip already asks for a translate target but the
            // hidden taskSelect is still/stale transcribe, heal task — do not snap
            // the chip back to 原文.
            if (task === 'transcribe' && !isSourceFormValue(chipRaw)) {
                if (taskSelect) {
                    const cur = String(taskSelect.value || '').trim();
                    taskSelect.value = cur === 'dual' ? 'dual' : 'translate';
                }
                task = readTaskFromForm();
                if (task === 'transcribe') return;
            }
            if (task === 'transcribe') {
                targetSelect.value = sourceFormValue();
                return;
            }
            if (isSourceFormValue(targetSelect.value)) {
                const variantSelect = resolveLiveEl(
                    els.chineseSubtitleVariantSelect,
                    'chineseSubtitleVariantSelect',
                );
                targetSelect.value = toQuickTargetLang(variantSelect?.value || 'simplified');
            }
        }

        /**
         * Apply main-window 目标 chip → hidden taskSelect + 成片目标语.
         * `source` ⇒ task=transcribe（不改上次成片目标语，便于切回翻译）.
         * Yue + 简/繁 ⇒ task=translate（粤语书面→普通话；繁体再 OpenCC）.
         */
        function applyQuickTargetChipValue(raw, { syncUi = true } = {}) {
            const targetSelect = resolveLiveEl(
                els.quickTargetLangSelect,
                'quickTargetLangSelect',
            );
            const taskSelect = resolveLiveEl(els.taskSelect, 'taskSelect');
            const variantSelect = resolveLiveEl(
                els.chineseSubtitleVariantSelect,
                'chineseSubtitleVariantSelect',
            );
            const asSource = isSourceFormValue(raw);
            const chipValue = asSource ? sourceFormValue() : toQuickTargetLang(raw);
            if (targetSelect) targetSelect.value = chipValue;

            const yueNoMt = yueZhChipSkipsMt(asSource ? sourceFormValue() : chipValue);
            if (asSource || yueNoMt) {
                if (taskSelect) taskSelect.value = 'transcribe';
                if (!asSource && variantSelect) {
                    const allowed = new Set([
                        'simplified', 'traditional', 'traditional-tw', 'traditional-hk',
                    ]);
                    const next = allowed.has(String(raw || '').trim())
                        ? String(raw).trim()
                        : chipValue;
                    variantSelect.value = allowed.has(next) ? next : 'simplified';
                }
            } else {
                const cur = String(taskSelect?.value || readTaskFromForm() || '').trim();
                if (taskSelect) {
                    taskSelect.value = cur === 'dual' ? 'dual' : 'translate';
                }
                if (variantSelect) {
                    const allowed = new Set([
                        'simplified', 'traditional', 'traditional-tw', 'traditional-hk',
                        'en', 'ja', 'ko',
                    ]);
                    const next = allowed.has(String(raw || '').trim())
                        ? String(raw).trim()
                        : chipValue;
                    variantSelect.value = allowed.has(next) ? next : 'simplified';
                }
            }
            if (syncUi) syncChineseSubtitleVariantUi();
        }

        function syncChineseSubtitleVariantUi() {
            const isTranslate = !!isTranslateLikeTask(readTaskFromForm());
            const variantSelect = resolveLiveEl(
                els.chineseSubtitleVariantSelect,
                'chineseSubtitleVariantSelect',
            );
            const targetSelect = resolveLiveEl(
                els.quickTargetLangSelect,
                'quickTargetLangSelect',
            );
            const targetWrap = resolveLiveEl(
                els.quickTargetLangWrap,
                'quickTargetLangWrap',
            );
            const yueNoMt = yueZhChipSkipsMt(targetSelect?.value || sourceFormValue());
            // 目标芯片兼作「仅转写 / 翻译」开关，始终可点。
            if (targetSelect) targetSelect.disabled = false;
            targetWrap?.classList.remove('opacity-50', 'pointer-events-none');
            if (variantSelect) variantSelect.disabled = !isTranslate && !yueNoMt;
            const variantWrap = typeof document !== 'undefined'
                ? document.getElementById('chineseSubtitleVariantWrap')
                : null;
            variantWrap?.classList.toggle('opacity-50', !isTranslate && !yueNoMt);
            syncQuickTargetChipFromTask();
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
            applyQuickTargetChipValue,
            syncQuickTargetChipFromTask,
            isSourceTargetFormValue: isSourceFormValue,
        };
    }

    return { createBilingualTaskUi };
}));
