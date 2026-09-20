/**
 * Quick toolbar chips/menus: models, params-more, bilingual (+ params summary).
 * Shell injects DOM/state via createQuickToolbarChipsUi(deps).
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubQuickToolbarChipsUi = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function quickToolbarChipsUiFactory(global) {
    /**
     * @param {object} deps shell adapters
     */
    function createQuickToolbarChipsUi(deps) {
        const d = deps || {};
        const els = d.els || {};
        const startReadinessApi = d.startReadinessApi || {};
        const deviceLabels = d.deviceLabels || {};
        const modelApi = d.modelApi || null;

        const getDocument = d.getDocument
            || (() => (global && global.document) || null);
        const uiTf = d.uiTf || ((s) => s);
        const readTaskFromForm = d.readTaskFromForm || (() => 'translate');
        const readTranslateModeFromForm = d.readTranslateModeFromForm || (() => 'llm');
        const taskLabelOf = d.taskLabelOf || ((t) => String(t || ''));
        const readSubFormatsFromForm = d.readSubFormatsFromForm || (() => 'srt');
        const readModelPathFromForm = d.readModelPathFromForm || (() => '');
        const toQuickTargetLang = d.toQuickTargetLang || ((v) => String(v || 'simplified'));
        const readDualLineOrderFromForm = d.readDualLineOrderFromForm || (() => 'target-first');
        const readLlmMtModelFromForm = d.readLlmMtModelFromForm || (() => '');
        const isMtModelAutoSelected = d.isMtModelAutoSelected || (() => false);
        const getCachedSmartTranslatePick = d.getCachedSmartTranslatePick || (() => null);
        const getTranslateModeUi = d.getTranslateModeUi || (() => null);
        const getParamsModeUi = d.getParamsModeUi || (() => null);
        const isAutoSenseEnabled = d.isAutoSenseEnabled || (() => false);
        const getActiveParamsPresetId = d.getActiveParamsPresetId || (() => '');
        const getActiveParamsPresetName = d.getActiveParamsPresetName || (() => '');
        const resolveParamsModeAsrLabel = d.resolveParamsModeAsrLabel || (() => '');
        const rebuildParamsModePresetItems = d.rebuildParamsModePresetItems || (() => {});
        const rebuildParamsModeAsrSection = d.rebuildParamsModeAsrSection || (() => {});
        const rebuildTranslateMenuMtSection = d.rebuildTranslateMenuMtSection || (() => {});
        const ensureSmartTranslatePickCache = d.ensureSmartTranslatePickCache || (async () => null);
        const ensureEngineModelsCacheApplied = d.ensureEngineModelsCacheApplied || (async () => false);
        const ensureEngineModelsCatalog = d.ensureEngineModelsCatalog || (async () => ({}));
        const hasEngineModelsCacheInMemory = d.hasEngineModelsCacheInMemory || (() => false);
        const getCachedEngineModels = d.getCachedEngineModels || (() => []);
        const loadDeferredGroup = d.loadDeferredGroup || (async () => {});
        const loadPresets = d.loadPresets
            || (() => (global && global.TransubFeatures?.loadPresets?.()) || Promise.resolve());
        const getPostBatchQcFixMode = d.getPostBatchQcFixMode || (() => 'none');
        const postBatchQcFixModeLabel = d.postBatchQcFixModeLabel || ((m) => String(m || ''));
        const persistFormOptionsQuiet = d.persistFormOptionsQuiet || (async () => {});
        const syncMergeBilingualUi = d.syncMergeBilingualUi || (() => {});
        const setPostTaskMenuOpen = d.setPostTaskMenuOpen || (() => {});
        const setAddMenuOpen = d.setAddMenuOpen || (() => {});
        const setPostBatchQcFixMenuOpen = d.setPostBatchQcFixMenuOpen || (() => {});
        const setExpertExtrasMenuOpen = d.setExpertExtrasMenuOpen || (() => {});
        const setTranslateStyleMenuOpen = d.setTranslateStyleMenuOpen || (() => {});
        const updateEnvBanner = d.updateEnvBanner || (() => {});
        const updateAutoSenseUi = d.updateAutoSenseUi || (() => {});
        const syncTranslateModeChipUi = d.syncTranslateModeChipUi || (() => {});
        const syncMtModelChipUi = d.syncMtModelChipUi || (() => {});
        const syncPostBatchQcFixChipUi = d.syncPostBatchQcFixChipUi || (() => {});
        const syncTranslateStyleChipUi = d.syncTranslateStyleChipUi || (() => {});
        const updateReadinessStrip = d.updateReadinessStrip || (() => {});
        const updateRecipeCapsule = d.updateRecipeCapsule || (() => {});
        const getDualSubtitleApi = d.getDualSubtitleApi
            || (() => (global && global.TransubDualSubtitle) || null);

        let modelsMenuOpen = false;
        let translateMenuOpen = false;
        let paramsMoreMenuOpen = false;
        let bilingualMenuOpen = false;
        let paramsModeMenuOpen = false;
        let modelsPickSlot = 'asr';
        let modelsCatalogUiLoading = false;

        function getModelsMenuOpen() { return !!modelsMenuOpen; }
        function getTranslateMenuOpen() { return !!translateMenuOpen; }
        function getParamsMoreMenuOpen() { return !!paramsMoreMenuOpen; }
        function getBilingualMenuOpen() { return !!bilingualMenuOpen; }
        function getParamsModeMenuOpen() { return !!paramsModeMenuOpen; }
        function isModelsCatalogLoading() { return !!modelsCatalogUiLoading; }
        function setModelsCatalogLoading(on) { modelsCatalogUiLoading = !!on; }

        function shortTranslateModelsSummary() {
            const task = readTaskFromForm();
            if (task !== 'translate' && task !== 'dual') return '';
            const mode = readTranslateModeFromForm();
            if (mode === 'smart') return '混合';
            if (mode === 'dialog') return '智能';
            if (mode === 'external') return '外部';
            if (mode === 'llm' || mode === 'sakura') return '推理';
            return '翻译';
        }

        function allowTranslateChip() {
            const task = readTaskFromForm();
            return task === 'translate' || task === 'dual';
        }

        function asrChipEl() {
            return els.asrChipBtn || getDocument()?.getElementById?.('asrChipBtn') || els.modelsChipBtn;
        }

        function mtChipEl() {
            return els.mtChipBtn || getDocument()?.getElementById?.('mtChipBtn');
        }

        function shortSenseModelsSummary() {
            const presetId = String(getActiveParamsPresetId() || '').trim();
            const presetName = String(getActiveParamsPresetName() || '').trim();
            return (presetId || presetName) ? '预设' : '自定义';
        }

        function syncModelsChipLabel() {
            const allowMt = allowTranslateChip();
            const t = shortTranslateModelsSummary() || (allowMt ? '翻译' : '');
            const s = shortSenseModelsSummary();
            const parts = [t, s].filter(Boolean);
            if (els.modelsChipLabel) els.modelsChipLabel.textContent = parts.join(' · ') || '模型';
            const asrLabel = els.asrChipLabel || getDocument()?.getElementById?.('asrChipLabel');
            const mtLabel = els.mtChipLabel || getDocument()?.getElementById?.('mtChipLabel');
            if (asrLabel) asrLabel.textContent = s || '识别';
            if (mtLabel) mtLabel.textContent = t || '翻译';
            // Prefer full titles from hidden sync hosts (chip labels stay short).
            const detailS = String(
                els.paramsModeBtn?.title
                || els.paramsModeLabel?.textContent
                || '',
            ).trim();
            const detailT = String(
                els.quickTranslateBtn?.title
                || els.quickTranslateLabel?.textContent
                || '',
            ).trim();
            const asrChip = asrChipEl();
            const mtChip = mtChipEl();
            if (asrChip) {
                asrChip.title = detailS && detailS !== '—' ? detailS : '识别场景与 ASR 模型';
            }
            if (mtChip) {
                mtChip.title = detailT && detailT !== '—' ? detailT : '翻译方式与模型';
                mtChip.hidden = !allowMt;
                mtChip.classList?.toggle?.('hidden', !allowMt);
                mtChip.setAttribute?.('aria-disabled', allowMt ? 'false' : 'true');
            }
            const live = els.modelsPickLiveSummary
                || getDocument()?.getElementById?.('modelsPickLiveSummary');
            if (live) {
                const slotName = modelsPickSlot === 'mt' ? '模式' : '识别';
                const current = modelsPickSlot === 'mt'
                    ? (detailT && detailT !== '—' ? detailT : t)
                    : (detailS && detailS !== '—' ? detailS : s);
                live.textContent = current
                    ? `当前${slotName}：${current}`
                    : '点选即生效；不确定时选「自动」。';
            }
        }

        function setModelsPickSlot(slot, { force = false } = {}) {
            const doc = getDocument();
            const task = readTaskFromForm();
            const allowMt = task === 'translate' || task === 'dual';
            let next = String(slot || '').trim() === 'mt' ? 'mt' : 'asr';
            if (next === 'mt' && !allowMt) next = 'asr';
            if (!force && modelsPickSlot === next) {
                // Still refresh active classes when opening.
            }
            modelsPickSlot = next;
            const asrSlot = els.modelsPickSlotAsr || doc?.getElementById?.('modelsPickSlotAsr');
            const mtSlot = els.modelsPickSlotMt || doc?.getElementById?.('modelsPickSlotMt');
            const asrPane = els.modelsPickAsrPane || doc?.getElementById?.('modelsPickAsrPane');
            const mtPane = els.modelsPickMtPane || doc?.getElementById?.('modelsPickMtPane');
            const asrOn = next === 'asr';
            asrSlot?.classList.toggle('is-active', asrOn);
            mtSlot?.classList.toggle('is-active', !asrOn);
            asrSlot?.setAttribute('aria-selected', asrOn ? 'true' : 'false');
            mtSlot?.setAttribute('aria-selected', asrOn ? 'false' : 'true');
            asrPane?.classList.toggle('is-active', asrOn);
            mtPane?.classList.toggle('is-active', !asrOn);
            if (asrPane) asrPane.hidden = !asrOn;
            if (mtPane) mtPane.hidden = asrOn;
            if (mtSlot) {
                mtSlot.disabled = !allowMt;
                mtSlot.setAttribute('aria-disabled', allowMt ? 'false' : 'true');
            }
            const title = els.modelsPickTitle || doc?.getElementById?.('modelsPickTitle');
            if (title) title.textContent = asrOn ? '识别' : '翻译';
            asrChipEl()?.setAttribute?.('aria-expanded', modelsMenuOpen && asrOn ? 'true' : 'false');
            mtChipEl()?.setAttribute?.('aria-expanded', modelsMenuOpen && !asrOn ? 'true' : 'false');
            els.modelsChipBtn?.setAttribute?.('aria-expanded', modelsMenuOpen && asrOn ? 'true' : 'false');
        }

        function positionModelsPopover() {
            const doc = getDocument();
            const menu = els.modelsMenu || doc?.getElementById?.('modelsMenu');
            const chip = modelsPickSlot === 'mt' ? (mtChipEl() || asrChipEl()) : asrChipEl();
            if (!menu || !chip || typeof chip.getBoundingClientRect !== 'function') return;
            try {
                const rect = chip.getBoundingClientRect();
                const hybridDual = modelsPickSlot === 'mt'
                    && !!(doc?.getElementById?.('translateMtSection')?.classList?.contains('is-hybrid-dual')
                        || els.translateMtSection?.classList?.contains('is-hybrid-dual'));
                const maxRem = hybridDual ? 34 : 26;
                const width = Math.min(maxRem * 16, Math.max(280, (doc?.defaultView?.innerWidth || 1280) - 20));
                const viewW = doc?.defaultView?.innerWidth || 1280;
                const viewH = doc?.defaultView?.innerHeight || 800;
                // Open to the right of the chip (left-aligned), clamp into viewport.
                let left = rect.left;
                if (left + width > viewW - 10) left = Math.max(10, viewW - width - 10);
                if (left < 10) left = 10;
                let top = rect.bottom + 6;
                const approxH = Math.min(32 * 16, viewH - 72);
                if (top + approxH > viewH - 12 && rect.top > approxH + 12) {
                    top = Math.max(12, rect.top - approxH - 6);
                }
                menu.classList.add('is-fixed-anchor');
                menu.style.position = 'fixed';
                menu.style.top = `${Math.round(top)}px`;
                menu.style.left = `${Math.round(left)}px`;
                menu.style.right = 'auto';
                menu.style.width = `${Math.round(width)}px`;
            } catch { /* jsdom */ }
        }

        function clearModelsPopoverPosition() {
            const menu = els.modelsMenu || getDocument()?.getElementById?.('modelsMenu');
            if (!menu) return;
            menu.classList.remove('is-fixed-anchor');
            try {
                menu.style.position = '';
                menu.style.top = '';
                menu.style.left = '';
                menu.style.right = '';
                menu.style.width = '';
            } catch { /* ignore */ }
        }

        function syncModelsMenuDetailUi() {
            const doc = getDocument();
            const mtCell = els.translateMtSection
                || doc?.getElementById?.('translateMtSection');
            const mtSummary = els.modelsMenuMtSummary
                || doc?.getElementById?.('modelsMenuMtSummary');
            const asrSummary = els.modelsMenuAsrSummary
                || doc?.getElementById?.('modelsMenuAsrSummary');
            const grid = els.modelsPickGrid
                || doc?.getElementById?.('modelsPickGrid');
            const mtIdle = els.modelsPickMtIdle
                || doc?.getElementById?.('modelsPickMtIdle');

            const task = readTaskFromForm();
            const allowMt = task === 'translate' || task === 'dual';
            grid?.classList.toggle('is-mt-disabled', !allowMt);
            if (mtIdle) {
                mtIdle.hidden = !!allowMt;
                mtIdle.classList.toggle('hidden', !!allowMt);
            }
            if (!allowMt && modelsPickSlot === 'mt') {
                setModelsPickSlot('asr', { force: true });
            } else {
                setModelsPickSlot(modelsPickSlot, { force: true });
            }
            const mtAuto = isMtModelAutoSelected() && !getTranslateModeUi()?.getTranslateMtManualBrowse?.();
            const presetId = String(getActiveParamsPresetId() || '').trim();

            if (mtSummary) {
                if (!allowMt) {
                    mtSummary.textContent = '当前任务不翻译';
                } else if (readTranslateModeFromForm() === 'external') {
                    const stationOn = !!(els.transubStationEnabledCheck?.checked
                        || getCachedSmartTranslatePick()?.transubStationEnabled);
                    if (stationOn) {
                        const model = String(
                            els.transubStationModelInput?.value
                            || getCachedSmartTranslatePick()?.transubStationModel
                            || '',
                        ).trim();
                        mtSummary.textContent = model
                            ? `Station · ${model}`
                            : 'Transub Station';
                    } else {
                        const model = String(getCachedSmartTranslatePick()?.byokModel || '').trim();
                        mtSummary.textContent = model
                            ? `外接 API · ${model}`
                            : '外接 API';
                    }
                } else if (mtAuto) {
                    const mode = readTranslateModeFromForm();
                    const hybrid = mode === 'smart'
                        && (els.smartTranslateHybridCheck?.checked !== false);
                    const polishId = String(getCachedSmartTranslatePick()?.smartTranslateModelId || '').trim();
                    if (hybrid && polishId) {
                        mtSummary.textContent = `翻译自动 · 润色 ${polishId}`;
                    } else {
                        mtSummary.textContent = hybrid
                            ? '翻译 / 润色均可自动'
                            : '自动匹配翻译 / 对话模型';
                    }
                } else {
                    const mode = readTranslateModeFromForm();
                    const hybrid = mode === 'smart'
                        && (els.smartTranslateHybridCheck?.checked !== false);
                    const pick = getCachedSmartTranslatePick();
                    const polishId = String(pick?.smartTranslateModelId || '').trim();
                    if (mode === 'dialog'
                        || (mode === 'smart' && els.smartTranslateHybridCheck?.checked === false)) {
                        mtSummary.textContent = polishId
                            ? `对话 ${polishId}`
                            : '手动选择对话模型';
                    } else if (hybrid) {
                        const sentenceId = readLlmMtModelFromForm();
                        const sPart = sentenceId ? `翻译 ${sentenceId}` : '翻译自动';
                        const pPart = polishId ? `润色 ${polishId}` : '润色自动';
                        mtSummary.textContent = `${sPart} · ${pPart}`;
                    } else {
                        const id = readLlmMtModelFromForm();
                        mtSummary.textContent = id
                            ? `已指定 ${id}`
                            : '手动选择已下载模型';
                    }
                }
            }
            // Popover always shows the model list (auto is the first row); never collapse.
            mtCell?.classList.remove('is-collapsed');

            if (asrSummary) {
                if (presetId) {
                    const name = String(getActiveParamsPresetName() || presetId).trim();
                    asrSummary.textContent = `预设「${name}」`;
                } else {
                    const asr = String(resolveParamsModeAsrLabel() || '').trim();
                    asrSummary.textContent = asr ? `手动 ASR：${asr}` : '手动指定识别模型';
                }
            }
        }

        function syncBilingualChipUi() {
            const isDual = readTaskFromForm() === 'dual';
            const mergeOn = isDual && !!els.mergeBilingualCheck?.checked;
            if (els.bilingualChipWrap) {
                els.bilingualChipWrap.hidden = !isDual;
                els.bilingualChipWrap.classList.toggle('hidden', !isDual);
            }
            if (!isDual && bilingualMenuOpen) setBilingualMenuOpen(false);

            // Mirror settings → quick chip controls
            if (els.quickMergeBilingualCheck) {
                els.quickMergeBilingualCheck.checked = !!els.mergeBilingualCheck?.checked;
                els.quickMergeBilingualCheck.disabled = !isDual;
            }
            if (els.quickMergeBilingualOrderSelect && els.mergeBilingualOrderSelect) {
                els.quickMergeBilingualOrderSelect.value = els.mergeBilingualOrderSelect.value || 'translation-first';
                els.quickMergeBilingualOrderSelect.disabled = !mergeOn;
            }
            if (els.quickMergeBilingualOrderWrap) {
                els.quickMergeBilingualOrderWrap.classList.toggle('opacity-50', !mergeOn);
                els.quickMergeBilingualOrderWrap.classList.toggle('pointer-events-none', !mergeOn);
            }
            if (els.quickDeleteSourcesAfterMergeCheck) {
                els.quickDeleteSourcesAfterMergeCheck.checked = !!els.deleteSourcesAfterMergeCheck?.checked;
                els.quickDeleteSourcesAfterMergeCheck.disabled = !mergeOn;
            }
            if (els.quickDeleteSourcesAfterMergeWrap) {
                els.quickDeleteSourcesAfterMergeWrap.classList.toggle('opacity-50', !mergeOn);
                els.quickDeleteSourcesAfterMergeWrap.classList.toggle('pointer-events-none', !mergeOn);
            }

            const dualApi = getDualSubtitleApi();
            const label = dualApi?.summarizeBilingualChip
                ? dualApi.summarizeBilingualChip({
                    task: isDual ? 'dual' : readTaskFromForm(),
                    merge: mergeOn,
                    lineOrder: readDualLineOrderFromForm(),
                    deleteSources: mergeOn && !!els.deleteSourcesAfterMergeCheck?.checked,
                })
                : (mergeOn ? '合并' : '不合并');
            if (els.bilingualChipLabel) els.bilingualChipLabel.textContent = label;
            if (els.bilingualChipBtn) {
                els.bilingualChipBtn.title = isDual
                    ? `双语字幕：${label}`
                    : '双语字幕设置（请先在设置 → 常规将任务类型设为双语）';
            }
        }

        function setBilingualMenuOpen(open) {
            bilingualMenuOpen = !!open;
            els.bilingualMenu?.classList.toggle('hidden', !open);
            els.bilingualChipBtn?.setAttribute('aria-expanded', open ? 'true' : 'false');
            if (open) {
                syncBilingualChipUi();
                setPostTaskMenuOpen(false);
                setAddMenuOpen(false);
                setModelsMenuOpen(false);
                setParamsMoreMenuOpen(false);
                setPostBatchQcFixMenuOpen(false);
                setExpertExtrasMenuOpen(false);
                setTranslateStyleMenuOpen(false);
            }
        }

        function applyBilingualChipToFormAndPersist() {
            if (els.mergeBilingualCheck && els.quickMergeBilingualCheck) {
                els.mergeBilingualCheck.checked = !!els.quickMergeBilingualCheck.checked;
            }
            if (els.mergeBilingualOrderSelect && els.quickMergeBilingualOrderSelect) {
                els.mergeBilingualOrderSelect.value = els.quickMergeBilingualOrderSelect.value || 'translation-first';
            }
            if (els.deleteSourcesAfterMergeCheck && els.quickDeleteSourcesAfterMergeCheck) {
                els.deleteSourcesAfterMergeCheck.checked = !!els.quickDeleteSourcesAfterMergeCheck.checked;
            }
            syncMergeBilingualUi();
            updateParamsSummary();
            void persistFormOptionsQuiet();
        }

        function setModelsMenuOpen(open, opts) {
            const next = !!open;
            modelsMenuOpen = next;
            translateMenuOpen = next;
            paramsModeMenuOpen = next;
            const doc = getDocument();
            els.modelsMenu?.classList.toggle('hidden', !next);
            els.modelsMenu?.setAttribute('aria-hidden', next ? 'false' : 'true');
            els.quickTranslateBtn?.setAttribute('aria-expanded', next ? 'true' : 'false');
            els.paramsModeBtn?.setAttribute('aria-expanded', next ? 'true' : 'false');
            doc?.body?.classList.toggle('models-pick-open', next);
            if (!next) {
                asrChipEl()?.setAttribute?.('aria-expanded', 'false');
                mtChipEl()?.setAttribute?.('aria-expanded', 'false');
                els.modelsChipBtn?.setAttribute?.('aria-expanded', 'false');
                setModelsCatalogLoading(false);
                clearModelsPopoverPosition();
                return;
            }
            const slot = String(opts?.slot || modelsPickSlot || 'asr').trim() === 'mt' ? 'mt' : 'asr';
            setModelsPickSlot(slot, { force: true });
            positionModelsPopover();
            // Keep popover under the chip wrap (fixed coords); do not reparent to body.
            const paintMenu = () => {
                rebuildTranslateMenuMtSection();
                positionModelsPopover();
                const presetCache = getParamsModeUi()?.getParamsModePresetCache?.() || [];
                if (presetCache.length) {
                    rebuildParamsModePresetItems(presetCache, { preferActiveGroup: true });
                }
                rebuildParamsModeAsrSection();
                syncModelsMenuDetailUi();
                setPostTaskMenuOpen(false);
                setAddMenuOpen(false);
                setParamsMoreMenuOpen(false);
                setPostBatchQcFixMenuOpen(false);
                setExpertExtrasMenuOpen(false);
                setBilingualMenuOpen(false);
                setTranslateStyleMenuOpen(false);
                const focusEl = els.modelsPickCloseBtn
                    || els.modelsMenu?.querySelector?.('.models-pick-panel');
                try { focusEl?.focus?.(); } catch { /* ignore */ }
            };
            const modeNeedsSmartCatalog = () => {
                const mode = readTranslateModeFromForm();
                return mode === 'smart' || mode === 'dialog';
            };
            const hasPersistedCatalogForMode = () => {
                if (modeNeedsSmartCatalog()) {
                    return !!(getCachedSmartTranslatePick()?.catalog?.length);
                }
                return !!(hasEngineModelsCacheInMemory()
                    || (Array.isArray(getCachedEngineModels()) && getCachedEngineModels().length));
            };
            // Paint immediately from whatever is already in memory — do not wait on deferred scripts.
            if (!hasPersistedCatalogForMode()) setModelsCatalogLoading(true);
            paintMenu();

            void (async () => {
                try {
                    await ensureEngineModelsCacheApplied();
                } catch { /* ignore */ }
                try {
                    await ensureSmartTranslatePickCache({ force: false });
                } catch { /* ignore */ }
                if (!modelsMenuOpen) return;
                if (hasPersistedCatalogForMode()) {
                    setModelsCatalogLoading(false);
                    paintMenu();
                } else {
                    setModelsCatalogLoading(true);
                    paintMenu();
                    try {
                        if (modeNeedsSmartCatalog()) {
                            await ensureSmartTranslatePickCache({ force: true });
                        } else {
                            await ensureEngineModelsCatalog({ silent: true });
                        }
                    } catch { /* ignore */ }
                    if (!modelsMenuOpen) return;
                    setModelsCatalogLoading(false);
                    paintMenu();
                }
                // Soft live refresh for smart/dialog after first paint (selection ids / install flags).
                if (modeNeedsSmartCatalog() && getCachedSmartTranslatePick()?.fromDiskCache) {
                    void ensureSmartTranslatePickCache({ force: true }).then(() => {
                        if (!modelsMenuOpen) return;
                        paintMenu();
                    }).catch(() => {});
                }
            })();

            // Catalog helpers (Sakura / managed LLM labels) — refresh labels when ready, non-blocking.
            void loadDeferredGroup('catalogs').then(() => {
                if (!modelsMenuOpen) return;
                paintMenu();
            }).catch(() => {});

            const presetCache = getParamsModeUi()?.getParamsModePresetCache?.() || [];
            if (!presetCache.length) {
                void Promise.resolve(loadPresets()).then(() => {
                    if (!modelsMenuOpen) return;
                    const list = getParamsModeUi()?.getParamsModePresetCache?.() || [];
                    if (list.length) {
                        rebuildParamsModePresetItems(list, { preferActiveGroup: true });
                    }
                    rebuildParamsModeAsrSection();
                    syncModelsMenuDetailUi();
                }).catch(() => {});
            }
        }

        function setTranslateMenuOpen(open) {
            setModelsMenuOpen(open, { slot: 'mt' });
        }

        function toggleModelsChip(slot) {
            const next = String(slot || '').trim() === 'mt' ? 'mt' : 'asr';
            if (modelsMenuOpen && modelsPickSlot === next) {
                setModelsMenuOpen(false);
                return;
            }
            setModelsMenuOpen(true, { slot: next });
        }

        // Back-compat aliases for older call sites.
        function setTranslateModeMenuOpen(open) { setTranslateMenuOpen(open); }
        function setMtModelMenuOpen(open) { setTranslateMenuOpen(open); }

        function setParamsMoreMenuOpen(open) {
            paramsMoreMenuOpen = !!open;
            els.paramsMoreMenu?.classList.toggle('hidden', !open);
            els.paramsMoreBtn?.setAttribute('aria-expanded', open ? 'true' : 'false');
            if (open) {
                syncParamsMoreChipUi();
                setPostTaskMenuOpen(false);
                setAddMenuOpen(false);
                setModelsMenuOpen(false);
                setPostBatchQcFixMenuOpen(false);
                setExpertExtrasMenuOpen(false);
                setBilingualMenuOpen(false);
                setTranslateStyleMenuOpen(false);
            }
        }

        function syncParamsMoreChipUi() {
            const qc = getPostBatchQcFixMode();
            const label = postBatchQcFixModeLabel(qc);
            if (els.paramsMoreLabel) els.paramsMoreLabel.textContent = label;
            if (els.paramsMoreBtn) {
                els.paramsMoreBtn.title = uiTf('QC修复 · {label}', { label });
            }
            updateRecipeCapsule();
        }

        function updateParamsSummary() {
            const device = els.deviceSelect?.value || 'cuda';
            const deviceLabel = deviceLabels[device] || device;
            const task = readTaskFromForm();
            const taskLabel = taskLabelOf(task);
            const overwriteLabel = els.overwriteCheck?.checked ? ' · 覆盖' : '';
            const mergeBiLabel = task === 'dual' && els.mergeBilingualCheck?.checked
                ? (els.deleteSourcesAfterMergeCheck?.checked ? ' · 合并双语并删原轨' : ' · 合并双语')
                : '';
            const formatLabel = readSubFormatsFromForm().replace(/,/g, '/');
            let modelLabel = '';
            if (modelApi) {
                if (task === 'dual') {
                    modelLabel = ` · ${modelApi.modelLabelFromPath(readModelPathFromForm('transcribe'))}→${modelApi.modelLabelFromPath(readModelPathFromForm('translate'))}`;
                } else if (task === 'transcribe') {
                    modelLabel = ` · ${modelApi.modelLabelFromPath(readModelPathFromForm('transcribe'))}`;
                } else {
                    modelLabel = ` · ${modelApi.modelLabelFromPath(readModelPathFromForm('translate'))}`;
                }
            }
            const summary = `${deviceLabel} · ${taskLabel}${modelLabel} · ${formatLabel}${overwriteLabel}${mergeBiLabel}`;
            if (els.paramsSummary) els.paramsSummary.textContent = summary;
            if (els.quickLanguageSelect && els.languageSelect) {
                els.quickLanguageSelect.value = els.languageSelect.value || 'auto';
            }
            if (els.quickTargetLangSelect && els.chineseSubtitleVariantSelect) {
                els.quickTargetLangSelect.value = toQuickTargetLang(
                    els.chineseSubtitleVariantSelect.value || 'simplified',
                );
            }
            if (els.quickFormatLabel) {
                els.quickFormatLabel.textContent = formatLabel || 'srt';
            }
            syncParamsMoreChipUi();
            syncBilingualChipUi();
            syncTranslateStyleChipUi();
            updateEnvBanner();
            updateAutoSenseUi();
            syncTranslateModeChipUi();
            syncMtModelChipUi();
            syncPostBatchQcFixChipUi();
            updateReadinessStrip();
            updateRecipeCapsule();
        }

        return {
            getModelsMenuOpen,
            getTranslateMenuOpen,
            getParamsMoreMenuOpen,
            getBilingualMenuOpen,
            getParamsModeMenuOpen,
            isModelsCatalogLoading,
            shortTranslateModelsSummary,
            shortSenseModelsSummary,
            syncModelsChipLabel,
            syncModelsMenuDetailUi,
            positionModelsPopover,
            setModelsPickSlot,
            toggleModelsChip,
            syncBilingualChipUi,
            setBilingualMenuOpen,
            applyBilingualChipToFormAndPersist,
            setModelsMenuOpen,
            setTranslateMenuOpen,
            setTranslateModeMenuOpen,
            setMtModelMenuOpen,
            setParamsMoreMenuOpen,
            syncParamsMoreChipUi,
            updateParamsSummary,
        };
    }

    return { createQuickToolbarChipsUi };
}));
