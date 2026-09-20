/**
 * Retranslate modal UI (open/close, mode/style/model selects, transcript source).
 * Shell injects DOM/state via createRetranslateModalUi(deps).
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubRetranslateModalUi = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function retranslateModalUiFactory(global) {
    /**
     * @param {object} deps shell adapters
     */
    function createRetranslateModalUi(deps) {
        const d = deps || {};
        const state = d.state;
        const els = d.els;
        const electron = d.electron;
        const retranslatePlanApi = d.retranslatePlanApi || {};
        const translateStyleApi = d.translateStyleApi || {};
        const appendLog = d.appendLog || (() => {});
        const showToast = d.showToast || (() => {});
        const uiTf = d.uiTf || ((s) => s);
        const basename = d.basename || ((p) => String(p || '').split(/[/\\]/).pop() || '');
        const esc = d.esc || ((s) => String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;'));
        const stemNoExt = d.stemNoExt || ((p) => {
            const base = basename(p);
            const i = base.lastIndexOf('.');
            return i > 0 ? base.slice(0, i) : base;
        });
        const pathDirname = d.pathDirname || (() => '');
        const pathJoin = d.pathJoin || ((dir, name) => `${dir}/${name}`);
        const normPath = d.normPath || ((p) => String(p || ''));
        const getAdvancedEntitled = d.getAdvancedEntitled || (() => false);
        const getCachedEngineModels = d.getCachedEngineModels || (() => []);
        const getManagedLlmCatalogApi = d.getManagedLlmCatalogApi || (() => null);
        const ensureSmartTranslatePickCache = d.ensureSmartTranslatePickCache || (async () => null);
        const setCachedSmartTranslatePick = d.setCachedSmartTranslatePick || (() => {});
        const isSmartTranslateCapableModel = d.isSmartTranslateCapableModel || (() => false);
        const resolveMtCapabilityFromForm = d.resolveMtCapabilityFromForm || (() => ({}));
        const fillEngineModelSelect = d.fillEngineModelSelect || (() => {});
        const isLlmInferencePickModelId = d.isLlmInferencePickModelId || (() => true);
        const readLlmMtModelFromForm = d.readLlmMtModelFromForm || (() => '');
        const recommendFormMtModel = d.recommendFormMtModel || (() => ({}));
        const buildIntlAwareLlmMtFilter = d.buildIntlAwareLlmMtFilter || (() => null);
        const buildIntlAwareLlmMtDisableReason = d.buildIntlAwareLlmMtDisableReason || (() => null);
        const refreshEngineModels = d.refreshEngineModels || (async () => {});
        const ensureEngineModelsCatalog = d.ensureEngineModelsCatalog
            || (async (opts = {}) => {
                if (opts.force) return refreshEngineModels({ silent: opts.silent !== false });
                const cached = getCachedEngineModels() || [];
                if (cached.length) return { ok: true, fromCache: true, models: cached };
                return refreshEngineModels({ silent: opts.silent !== false });
            });
        const resolveOutputDirFromForm = d.resolveOutputDirFromForm || (() => '');
        const readSubFormatsFromForm = d.readSubFormatsFromForm || (() => []);
        const readSubtitleTargetLangFromForm = d.readSubtitleTargetLangFromForm || (() => '');
        const readTranslateModeFromForm = d.readTranslateModeFromForm || (() => 'llm');
        const getSelectedItems = d.getSelectedItems || (() => []);
        const setLoading = d.setLoading || (() => {});
        const appConfirm = d.appConfirm || (async () => true);
        const ensureJobRuntimeScripts = d.ensureJobRuntimeScripts || (async () => {});
        const populateTranslateStylePickerSelect = d.populateTranslateStylePickerSelect || (() => {});
        const translateStyleOptionsForItem = d.translateStyleOptionsForItem || (() => ({}));
        const readGlobalTranslateStylePreset = d.readGlobalTranslateStylePreset || (() => 'natural_spoken');
        const getTranslateStyleEnabled = d.getTranslateStyleEnabled || (() => false);

        function resolveRetranslateDestPath(item, sourcePath) {
            if (retranslatePlanApi.resolveRetranslateDestPath) {
                return retranslatePlanApi.resolveRetranslateDestPath(item, sourcePath, {
                    resolveOutputDir: resolveOutputDirFromForm,
                    pathDirname,
                    pathJoin,
                    stemNoExt,
                    normPath,
                    subFormats: readSubFormatsFromForm(),
                    subtitleTargetLang: readSubtitleTargetLangFromForm(),
                });
            }
            return String(item?.targetSubtitlePath || item?.subtitlePath || '').trim();
        }

        /**
         * Retranslate source = same-name transcript in the keep dir (`subtitles/`).
         * Match by video basename stem only (e.g. SQTE-704.mp4 → SQTE-704.transcribe.srt).
         */
        async function resolveTranscriptSourceForItem(item) {
            const videoPath = String(item?.path || '').trim();
            if (!videoPath || !electron?.transubFindKeptTranscript) {
                return { ok: false, found: false };
            }
            try {
                const kept = await electron.transubFindKeptTranscript({ videoPath });
                if (!(kept?.ok && kept.found && kept.path)) {
                    return {
                        ok: false,
                        found: false,
                        dir: kept?.dir || '',
                        stem: kept?.stem || stemNoExt(videoPath),
                    };
                }
                const doc = await electron?.transubReadSubtitle?.({ path: kept.path });
                if (doc?.ok && Array.isArray(doc.cues) && doc.cues.some((c) => String(c?.text || '').trim())) {
                    return {
                        ok: true,
                        path: kept.path,
                        kind: 'kept',
                        cues: doc.cues,
                        format: doc.format,
                        daysLeft: kept.daysLeft,
                        dir: kept.dir,
                        stem: kept.stem,
                    };
                }
                return {
                    ok: false,
                    found: false,
                    path: kept.path,
                    dir: kept.dir,
                    stem: kept.stem,
                    error: doc?.error || '转录字幕为空或无法读取',
                };
            } catch (err) {
                return { ok: false, found: false, error: err?.message || String(err) };
            }
        }

        function readRetranslateModeFromModal() {
            if (els.retranslateModeSmart?.checked) return 'smart';
            if (els.retranslateModeDialog?.checked) return 'dialog';
            if (els.retranslateModeExternal?.checked) return 'external';
            return 'llm';
        }

        function readRetranslateSmartHybrid() {
            return els.retranslateSmartHybridCheck?.checked !== false;
        }

        function readRetranslateSmartPolish() {
            return els.retranslateSmartPolishCheck?.checked !== false;
        }

        function seedRetranslateSmartOptionsFromSettings() {
            const cap = resolveMtCapabilityFromForm();
            if (els.retranslateSmartHybridCheck) {
                els.retranslateSmartHybridCheck.checked = !!cap.allowHybridMt;
                els.retranslateSmartHybridCheck.disabled = !cap.allowHybridMt;
            }
            if (els.retranslateSmartPolishCheck) {
                els.retranslateSmartPolishCheck.checked = els.smartTranslatePolishCheck
                    ? els.smartTranslatePolishCheck.checked !== false
                    : true;
            }
        }

        function fillRetranslateSmartModelSelect(pick, { allowEmpty = false } = {}) {
            const selectEl = els.retranslateModelSelect;
            if (!selectEl) return;
            const catalog = retranslatePlanApi.filterSmartTranslateCatalog
                ? retranslatePlanApi.filterSmartTranslateCatalog(pick?.catalog, getManagedLlmCatalogApi())
                : (Array.isArray(pick?.catalog) ? pick.catalog : [])
                    .filter((item) => item?.installed && isSmartTranslateCapableModel(item));
            const want = String(pick?.smartTranslateModelId || '').trim();
            const opts = [];
            if (allowEmpty) {
                opts.push('<option value="">自动（设置 / 已下载优先）</option>');
            }
            if (!catalog.length && !allowEmpty) {
                opts.push('<option value="">（暂无已下载的润色模型）</option>');
            } else {
                for (const item of catalog) {
                    const id = String(item.id || '');
                    if (!id) continue;
                    const label = retranslatePlanApi.formatSmartTranslateModelLabel
                        ? retranslatePlanApi.formatSmartTranslateModelLabel(item, getManagedLlmCatalogApi())
                        : (() => {
                            const bits = [];
                            if (item.proScale) bits.push('Pro');
                            if (item.paramBillion) bits.push(`${item.paramBillion}B`);
                            return bits.length
                                ? `${item.name || id}（${bits.join(' · ')}）`
                                : (item.name || id);
                        })();
                    const sel = !allowEmpty && id === want ? ' selected' : '';
                    opts.push(`<option value="${esc(id)}"${sel}>${esc(label)}</option>`);
                }
                if (want && !catalog.some((m) => String(m.id) === want)) {
                    opts.push(`<option value="${esc(want)}">${esc(want)}（未下载或不可用于智能翻译润色）</option>`);
                }
            }
            selectEl.innerHTML = opts.join('');
            if (want && [...selectEl.options].some((o) => o.value === want)) {
                selectEl.value = want;
            } else if (allowEmpty) {
                selectEl.value = '';
            } else if (catalog[0]?.id) {
                selectEl.value = catalog[0].id;
            } else {
                selectEl.value = '';
            }
        }

        function fillRetranslateHybridMtSelect() {
            const selectEl = els.retranslateHybridMtSelect;
            if (!selectEl) return;
            const hybridCore = global.TransubSmartTranslateHybrid || null;
            const isSentenceSpecialist = (id) => {
                const s = String(id || '').trim();
                if (!s) return false;
                if (hybridCore?.isTranslateOnlyLike?.(s)) return true;
                try {
                    if (global.TransubSakuraMtCatalog?.isSakuraMtModel?.(s)) return true;
                } catch (_) { /* ignore */ }
                return false;
            };
            const rawPrefer = String(
                selectEl.value
                || els.engineLlmMtModelSelect?.value
                || readLlmMtModelFromForm()
                || '',
            ).trim();
            // Pre-fill only specialist MT. 星火/Qwen 若写入句级槽，运行时会降级对话按行，
            // 不应在打开对话框时被当成「自动 GalTransl」的默认值带进来。
            const prefer = isSentenceSpecialist(rawPrefer) ? rawPrefer : '';
            fillEngineModelSelect(selectEl, getCachedEngineModels(), 'mt', prefer, {
                allowEmpty: true,
                emptyLabel: '自动匹配（专训推理模型）',
                modelFilter: (m) => isLlmInferencePickModelId(m.id),
            });
        }

        function syncRetranslateStyleCustomWrap() {
            const entitled = !!getAdvancedEntitled();
            const enabled = !!els.retranslateStyleEnabledCheck?.checked;
            const preset = els.retranslateStyleSelect?.value || 'natural_spoken';
            if (els.retranslateStyleSelect) els.retranslateStyleSelect.disabled = !enabled;
            if (els.retranslateStylePresetWrap) {
                els.retranslateStylePresetWrap.classList.toggle('opacity-50', !enabled);
            }
            const show = enabled && entitled && preset === 'custom';
            els.retranslateStyleCustomWrap?.classList.toggle('hidden', !show);
            if (els.retranslateStyleCustomNote) {
                els.retranslateStyleCustomNote.disabled = !show;
            }
            if (!entitled && preset === 'custom' && els.retranslateStyleSelect) {
                els.retranslateStyleSelect.value = translateStyleApi.DEFAULT_PRESET || 'natural_spoken';
                els.retranslateStyleCustomWrap?.classList.add('hidden');
            }
        }

        function seedRetranslateStyleFromItems(items = []) {
            populateTranslateStylePickerSelect(els.retranslateStyleSelect, { includeGlobal: false });
            const list = Array.isArray(items) ? items.filter(Boolean) : [];
            const resolvedList = list.map((item) => translateStyleOptionsForItem(item) || {});
            const enabledFlags = [...new Set(resolvedList.map((r) => !!r.translateStyleEnabled))];
            const initialEnabled = enabledFlags.length === 1
                ? enabledFlags[0]
                : !!getTranslateStyleEnabled();
            if (els.retranslateStyleEnabledCheck) {
                els.retranslateStyleEnabledCheck.checked = initialEnabled;
            }
            const presets = [...new Set(resolvedList.map((r) => r.translateStylePreset).filter(Boolean))];
            const initial = presets.length === 1
                ? presets[0]
                : (readGlobalTranslateStylePreset() || translateStyleApi.DEFAULT_PRESET || 'natural_spoken');
            if (els.retranslateStyleSelect) {
                const has = [...els.retranslateStyleSelect.options].some((o) => o.value === initial);
                els.retranslateStyleSelect.value = has
                    ? initial
                    : (translateStyleApi.DEFAULT_PRESET || 'natural_spoken');
            }
            const notes = [...new Set(
                resolvedList
                    .map((r) => String(r.translateStyleCustomNote || '').trim())
                    .filter(Boolean),
            )];
            if (els.retranslateStyleCustomNote) {
                els.retranslateStyleCustomNote.value = notes.length === 1 ? notes[0] : '';
            }
            syncRetranslateStyleCustomWrap();
        }

        function readRetranslateStyleFromModal() {
            const enabledNorm = translateStyleApi.normalizeTranslateStyleEnabled;
            const enabled = typeof enabledNorm === 'function'
                ? !!enabledNorm(els.retranslateStyleEnabledCheck?.checked)
                : !!els.retranslateStyleEnabledCheck?.checked;
            const preset = translateStyleApi.normalizeTranslateStylePreset?.(
                els.retranslateStyleSelect?.value,
                { entitled: !!getAdvancedEntitled() },
            ) || els.retranslateStyleSelect?.value || 'natural_spoken';
            const note = enabled && preset === 'custom'
                ? String(els.retranslateStyleCustomNote?.value || '').trim().slice(0, 200)
                : '';
            return {
                translateStyleEnabled: enabled,
                translateStylePreset: preset,
                translateStyleCustomNote: note,
            };
        }

        function fillRetranslateModelSelect(mode) {
            const selectEl = els.retranslateModelSelect;
            if (!selectEl) return;
            if (mode === 'smart' || mode === 'dialog') {
                const allowEmpty = mode === 'smart' && readRetranslateSmartHybrid();
                void ensureSmartTranslatePickCache().then((pick) => {
                    fillRetranslateSmartModelSelect(pick, { allowEmpty });
                });
                return;
            }
            const cap = resolveMtCapabilityFromForm();
            const rec = recommendFormMtModel({ translateMode: 'llm' });
            const cur = String(
                els.engineLlmMtModelSelect?.value
                || readLlmMtModelFromForm()
                || rec.preferId
                || rec.defaultAutoFallbackId
                || cap.defaultAutoFallbackId
                || '',
            ).trim();
            fillEngineModelSelect(selectEl, getCachedEngineModels(), 'mt', cur, {
                allowEmpty: false,
                modelFilter: buildIntlAwareLlmMtFilter(),
                modelDisableReason: typeof buildIntlAwareLlmMtDisableReason === 'function'
                    ? buildIntlAwareLlmMtDisableReason()
                    : undefined,
            });
        }

        function syncRetranslateModalModelUi() {
            const mode = readRetranslateModeFromModal();
            const smartLocked = !getAdvancedEntitled();
            if (els.retranslateModeSmartWrap) {
                els.retranslateModeSmartWrap.classList.toggle('is-disabled', smartLocked);
                if (els.retranslateModeSmart) els.retranslateModeSmart.disabled = smartLocked;
            }
            if (els.retranslateModeDialogWrap) {
                els.retranslateModeDialogWrap.classList.toggle('is-disabled', smartLocked);
                if (els.retranslateModeDialog) els.retranslateModeDialog.disabled = smartLocked;
            }
            els.retranslateSmartOptions?.classList.add('hidden');
            els.retranslateHybridMtWrap?.classList.add('hidden');
            if (mode === 'external') {
                els.retranslateModelWrap?.classList.add('hidden');
                if (els.retranslateModelHint) {
                    els.retranslateModelHint.textContent = '外部翻译：使用「设置 → 外部翻译」中的 Station 或外接 API（BYOK）。';
                }
                return;
            }
            if (mode === 'dialog') {
                const polishOn = readRetranslateSmartPolish();
                if (!smartLocked) {
                    els.retranslateSmartOptions?.classList.remove('hidden');
                    // Hide hybrid sentence blurb for dialog; keep polish checkbox.
                    if (els.retranslateSmartHybridWrap) {
                        els.retranslateSmartHybridWrap.classList.add('hidden');
                    }
                    if (els.retranslateSmartSchemeHint) {
                        els.retranslateSmartSchemeHint.textContent = polishOn
                            ? '智能翻译：对话模型按行 + 剧情贴合润色（同一模型）。'
                            : '智能翻译：对话模型按行（贴合润色已关）。';
                    }
                }
                els.retranslateHybridMtWrap?.classList.add('hidden');
                els.retranslateModelWrap?.classList.remove('hidden');
                if (els.retranslateModelLabel) {
                    els.retranslateModelLabel.textContent = polishOn
                        ? '润色模型（按行 + 润色）'
                        : '润色模型（按行）';
                }
                if (els.retranslateModelHint) {
                    els.retranslateModelHint.textContent = smartLocked
                        ? '智能翻译为 Pro 专属，请先激活 Pro。'
                        : '智能翻译：对话模型按行；可勾选剧情贴合润色与忠实复核。';
                }
                if (!smartLocked) {
                    void ensureSmartTranslatePickCache().then((pick) => {
                        if (readRetranslateModeFromModal() !== 'dialog') return;
                        fillRetranslateSmartModelSelect(pick, { allowEmpty: false });
                    });
                }
                return;
            }
            if (mode === 'smart') {
                if (els.retranslateSmartHybridWrap) {
                    els.retranslateSmartHybridWrap.classList.remove('hidden');
                }
                const cap = resolveMtCapabilityFromForm();
                if (!cap.allowHybridMt && els.retranslateSmartHybridCheck) {
                    els.retranslateSmartHybridCheck.checked = false;
                    els.retranslateSmartHybridCheck.disabled = true;
                } else if (els.retranslateSmartHybridCheck) {
                    els.retranslateSmartHybridCheck.disabled = false;
                }
                const hybridOn = !!cap.allowHybridMt && readRetranslateSmartHybrid();
                const polishOn = readRetranslateSmartPolish();
                const ui = retranslatePlanApi.buildRetranslateSmartUiState
                    ? retranslatePlanApi.buildRetranslateSmartUiState({
                        hybridOn,
                        polishOn,
                        smartLocked,
                    })
                    : {
                        showSmartOptions: !smartLocked,
                        showHybridMt: !smartLocked && hybridOn,
                        showDialogModel: !smartLocked && (!hybridOn || polishOn),
                        dialogLabel: '对话模型（剧情贴合润色）',
                        schemeHint: '',
                        modelHint: smartLocked
                            ? '混合翻译为 Pro 专属，请先激活 Pro。'
                            : '',
                        allowEmptyDialog: hybridOn,
                    };
                if (!cap.allowHybridMt && ui) {
                    ui.showHybridMt = false;
                    if (!ui.schemeHint) {
                        ui.schemeHint = cap.hybridDisableReason
                            || `成片 ${cap.targetLanguageLabel || '非中文'}：句级混合不可用，由对话模型直译。`;
                    }
                }
                if (ui.showSmartOptions) {
                    els.retranslateSmartOptions?.classList.remove('hidden');
                }
                if (els.retranslateSmartSchemeHint && ui.schemeHint) {
                    els.retranslateSmartSchemeHint.textContent = ui.schemeHint;
                }
                if (ui.showHybridMt) {
                    els.retranslateHybridMtWrap?.classList.remove('hidden');
                    const fillHybrid = () => {
                        if (readRetranslateModeFromModal() !== 'smart') return;
                        fillRetranslateHybridMtSelect();
                    };
                    if (!getCachedEngineModels().length) {
                        void ensureEngineModelsCatalog({ silent: true }).then(fillHybrid);
                    } else {
                        fillHybrid();
                    }
                }
                if (ui.showDialogModel) {
                    els.retranslateModelWrap?.classList.remove('hidden');
                    if (els.retranslateModelLabel) {
                        els.retranslateModelLabel.textContent = ui.dialogLabel || '对话模型（剧情贴合润色）';
                    }
                    void ensureSmartTranslatePickCache().then((pick) => {
                        if (readRetranslateModeFromModal() !== 'smart') return;
                        fillRetranslateSmartModelSelect(pick, {
                            allowEmpty: !!ui.allowEmptyDialog,
                        });
                    });
                } else {
                    els.retranslateModelWrap?.classList.add('hidden');
                }
                if (els.retranslateModelHint) {
                    els.retranslateModelHint.textContent = ui.modelHint || '';
                }
                return;
            }
            els.retranslateModelWrap?.classList.remove('hidden');
            if (els.retranslateModelLabel) {
                els.retranslateModelLabel.textContent = '推理翻译模型';
            }
            if (!getCachedEngineModels().length) {
                void ensureEngineModelsCatalog({ silent: true }).then(() => fillRetranslateModelSelect(mode));
            } else {
                fillRetranslateModelSelect(mode === 'engine' ? 'llm' : mode);
            }
            if (els.retranslateModelHint) {
                els.retranslateModelHint.textContent = '本地 LLM 推理翻译。仅列出已下载项。';
            }
        }

        function closeRetranslateModal() {
            els.retranslateModal?.classList.add('hidden');
            els.retranslateModal?.classList.remove('flex');
            state.retranslatePlan = null;
            state.retranslateFromShelf = false;
        }

        async function openRetranslateModal() {
            await ensureJobRuntimeScripts();
            if (state.running || state.postBatchBusy || state.retranslateBusy) {
                showToast('当前有任务进行中', 'warn');
                return;
            }
            state.retranslateFromShelf = false;
            const selected = getSelectedItems();
            if (!selected.length) {
                appendLog('请先勾选要重新翻译的条目', 'warn');
                showToast('请先勾选要重新翻译的条目', 'warn');
                return;
            }
            setLoading(true, '正在检查转录字幕…');
            const ready = [];
            const missing = [];
            try {
                for (const item of selected) {
                    const src = await resolveTranscriptSourceForItem(item);
                    if (src?.ok && src.path) {
                        ready.push({
                            item,
                            sourcePath: src.path,
                            destPath: resolveRetranslateDestPath(item, src.path),
                            sourceKind: src.kind || 'source',
                            cues: src.cues,
                            format: src.format || 'srt',
                        });
                    } else {
                        missing.push(item);
                    }
                }
            } finally {
                setLoading(false);
            }
            if (!ready.length) {
                const names = missing.slice(0, 4).map((i) => basename(i.path)).join('、');
                const more = missing.length > 4 ? uiTf(' 等 {count} 项', { count: missing.length }) : '';
                await appConfirm({
                    title: '无可用转录字幕',
                    message: uiTf('勾选的 {count} 项均未在「转录字幕」目录找到与影片同名的原文（如 SQTE-704.mp4 → SQTE-704.transcribe.srt）。\n\n{list}\n\n请先完成一次听写/翻译并开启「保存转录字幕」，或将同名转录字幕放入该目录。', {
                        count: selected.length,
                        list: `${names}${more}`,
                    }),
                    primaryLabel: '知道了',
                    hideSecondary: true,
                });
                return;
            }
            state.retranslatePlan = ready;
            if (els.retranslateModalSummary) {
                els.retranslateModalSummary.textContent = uiTf('将对 {count} 项使用已有转录字幕重新翻译（跳过语音识别）。', {
                    count: ready.length,
                });
            }
            if (els.retranslateModalMissing) {
                if (missing.length) {
                    const names = missing.slice(0, 6).map((i) => basename(i.path)).join('、');
                    const more = missing.length > 6 ? uiTf(' 等 {count} 项', { count: missing.length }) : '';
                    els.retranslateModalMissing.textContent = uiTf('将跳过无转录字幕的 {count} 项：{list}', {
                        count: missing.length,
                        list: `${names}${more}`,
                    });
                    els.retranslateModalMissing.classList.remove('hidden');
                } else {
                    els.retranslateModalMissing.textContent = '';
                    els.retranslateModalMissing.classList.add('hidden');
                }
            }
            const mode = readTranslateModeFromForm();
            const advancedEntitled = !!getAdvancedEntitled();
            if (els.retranslateModeEngine) els.retranslateModeEngine.checked = false;
            const isProMode = mode === 'smart' || mode === 'dialog';
            const isExternal = mode === 'external' || mode === 'byok';
            if (els.retranslateModeLlm) els.retranslateModeLlm.checked = !isProMode && !isExternal;
            if (els.retranslateModeExternal) {
                els.retranslateModeExternal.checked = isExternal;
            }
            if (els.retranslateModeDialog) {
                els.retranslateModeDialog.checked = mode === 'dialog' && advancedEntitled;
            }
            if (els.retranslateModeSmart) {
                els.retranslateModeSmart.checked = mode === 'smart' && advancedEntitled;
            }
            if (isProMode && !advancedEntitled && els.retranslateModeLlm) {
                els.retranslateModeLlm.checked = true;
                if (els.retranslateModeExternal) els.retranslateModeExternal.checked = false;
                if (els.retranslateModeDialog) els.retranslateModeDialog.checked = false;
                if (els.retranslateModeSmart) els.retranslateModeSmart.checked = false;
            }
            seedRetranslateSmartOptionsFromSettings();
            setCachedSmartTranslatePick(null);
            syncRetranslateModalModelUi();
            seedRetranslateStyleFromItems(ready.map((r) => r.item));
            appendLog(
                missing.length
                    ? uiTf('已准备重新翻译：{ready} 项可执行，{missing} 项缺转录字幕', { ready: ready.length, missing: missing.length })
                    : uiTf('已准备重新翻译：{ready} 项（跳过听写）', { ready: ready.length }),
                'info',
            );
            els.retranslateModal?.classList.remove('hidden');
            els.retranslateModal?.classList.add('flex');
            try {
                const doc = typeof document !== 'undefined' ? document : (global && global.document);
                doc?.body?.appendChild?.(els.retranslateModal);
            } catch { /* ignore */ }
            setTimeout(() => {
                try { els.retranslateConfirmBtn?.focus?.({ preventScroll: true }); } catch { /* ignore */ }
            }, 80);
        }

        return {
            resolveRetranslateDestPath,
            resolveTranscriptSourceForItem,
            readRetranslateModeFromModal,
            readRetranslateSmartHybrid,
            readRetranslateSmartPolish,
            seedRetranslateSmartOptionsFromSettings,
            fillRetranslateSmartModelSelect,
            fillRetranslateHybridMtSelect,
            syncRetranslateStyleCustomWrap,
            seedRetranslateStyleFromItems,
            readRetranslateStyleFromModal,
            fillRetranslateModelSelect,
            syncRetranslateModalModelUi,
            closeRetranslateModal,
            openRetranslateModal,
        };
    }

    return { createRetranslateModalUi };
}));
