/**
 * Translate mode + MT / smart-translate quick-bar UI (form sync, chips, readiness strip).
 * Shell injects DOM/IPC/state via createTranslateModeUi(deps).
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubTranslateModeUi = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function translateModeUiFactory(global) {
    function createTranslateModeUi(deps) {
        const d = deps || {};
        const els = d.els || {};
        const electron = d.electron;
        const settingsNormApi = d.settingsNormApi || {};
        const smartTranslateReadinessApi = d.smartTranslateReadinessApi || {};
        const translateChipApi = d.translateChipApi || {};
        const retranslatePlanApi = d.retranslatePlanApi || {};
        const engineModelsUi = d.engineModelsUi || {};
        const startReadinessApi = d.startReadinessApi || {};

        const getAdvancedEntitled = typeof d.getAdvancedEntitled === 'function'
            ? d.getAdvancedEntitled
            : () => !!d.advancedEntitled;
        const getCachedEngineModels = d.getCachedEngineModels || (() => []);
        const getCachedHardwareRecommend = d.getCachedHardwareRecommend || (() => null);
        const getCachedBundledEnginePath = d.getCachedBundledEnginePath || (() => '');
        const getCachedSmartTranslatePick = d.getCachedSmartTranslatePick || (() => null);
        const setCachedSmartTranslatePick = d.setCachedSmartTranslatePick || (() => {});
        const isModelsCatalogLoading = d.isModelsCatalogLoading || (() => false);
        const getState = d.getState || (() => d.state || { items: [] });
        const getIsStandaloneSettings = d.getIsStandaloneSettings
            || (() => !!d.isStandaloneSettings);

        const appendLog = d.appendLog || (() => {});
        const showToast = d.showToast || (() => {});
        const appConfirmChoice = d.appConfirmChoice || (async () => 'secondary');
        const openAppSettings = d.openAppSettings || (() => {});
        const markSettingsDirty = d.markSettingsDirty || (() => {});
        const persistFormOptionsQuiet = d.persistFormOptionsQuiet || (async () => {});
        const renderList = d.renderList || (() => {});
        const uiTf = d.uiTf || ((s) => s);
        const uiTx = d.uiTx || ((text) => (
            global.TransubI18n?.tx?.(text) ?? String(text || '')
        ));
        const fillEngineModelSelect = d.fillEngineModelSelect || (() => {});
        const ensureSelectValue = d.ensureSelectValue || (() => {});
        const hybridPickSync = d.hybridPickSync
            || global.TransubHybridModelPickSync
            || (typeof require === 'function'
                ? (() => { try { return require('./hybrid-model-pick-sync-core'); } catch { return null; } })()
                : null);
        const findManagedLlmCatalogEntry = d.findManagedLlmCatalogEntry || (() => null);
        const getManagedLlmCatalogApi = d.getManagedLlmCatalogApi || (() => null);
        const isLlmInferencePickModelId = d.isLlmInferencePickModelId || (() => false);
        const readTranslateModeFromForm = d.readTranslateModeFromForm || (() => 'llm');
        const setTranslateModeRadios = d.setTranslateModeRadios || (() => {});
        const readTaskFromForm = d.readTaskFromForm || (() => 'translate');
        const promptProUnlockRequired = d.promptProUnlockRequired || (async () => {});
        const syncExpertExtraChipsUi = d.syncExpertExtraChipsUi || (() => {});
        const ensureSmartTranslatePickCache = d.ensureSmartTranslatePickCache || (async () => null);
        const isSmartTranslateCapableModel = d.isSmartTranslateCapableModel || (() => false);
        const formatEngineModelOptionLabel = d.formatEngineModelOptionLabel || ((m) => m?.id || '');
        const shouldFollowSenseForMt = d.shouldFollowSenseForMt || (() => false);
        const isAutoSenseEnabled = d.isAutoSenseEnabled || (() => false);
        const setMtUseForm = d.setMtUseForm || (() => {});
        const setTranslateMenuOpen = d.setTranslateMenuOpen || (() => {});
        const syncModelsMenuDetailUi = d.syncModelsMenuDetailUi || (() => {});
        const syncModelsChipLabel = d.syncModelsChipLabel || (() => {});
        const positionModelsPopover = d.positionModelsPopover || (() => {});
        const updateRecipeCapsule = d.updateRecipeCapsule || (() => {});
        const translateModeLabel = d.translateModeLabel || ((m) => String(m || ''));
        const setSaveParamsStatus = d.setSaveParamsStatus || (() => {});
        const syncParamsModeChipUi = d.syncParamsModeChipUi || (() => {});
        const updateParamsSummary = d.updateParamsSummary || (() => {});
        const updateModelSelectHint = d.updateModelSelectHint || (() => {});
        const ensureRequiredModelsReadyOrPrompt = d.ensureRequiredModelsReadyOrPrompt
            || (async () => true);
        const taskLabelOf = d.taskLabelOf || ((t) => String(t || ''));
        const readEngineBackendFromForm = d.readEngineBackendFromForm || (() => 'engine');
        const getContentProfileApi = d.getContentProfileApi
            || (() => (global && global.TransubContentProfile) || null);
        const syncTransubStationSettingsUi = d.syncTransubStationSettingsUi || (() => {});

        let syncingTranslateMode = false;
        /** @type {{ zh: string, en: string, ja: string, ko: string }} */
        let lastMtByTargetState = { zh: '', en: '', ja: '', ko: '' };
        let prevSubtitleTargetLangForMt = '';
        let translateMtManualBrowse = false;
        let externalPickApi = null;

        function getExternalPick() {
            if (externalPickApi) return externalPickApi;
            const factory = (global && global.TransubTranslateExternalPick)
                || (typeof require === 'function'
                    ? (() => { try { return require('./translate-external-pick-core'); } catch { return null; } })()
                    : null);
            if (!factory?.createTranslateExternalPick) {
                externalPickApi = null;
                return null;
            }
            externalPickApi = factory.createTranslateExternalPick({
                els,
                electron,
                showToast,
                openAppSettings,
                persistFormOptionsQuiet,
                syncTransubStationSettingsUi,
                markSettingsDirty,
                setSaveParamsStatus,
                getCachedSmartTranslatePick,
                ensureSmartTranslatePickCache,
                syncModelsMenuDetailUi,
                syncTranslateChipUi: () => syncTranslateChipUi(),
                updateReadinessStrip: () => updateReadinessStrip(),
            });
            return externalPickApi;
        }

        function getLastMtByTargetState() { return lastMtByTargetState; }
        function setLastMtByTargetState(v) {
            lastMtByTargetState = v && typeof v === 'object'
                ? v
                : { zh: '', en: '', ja: '', ko: '' };
        }
        function getPrevSubtitleTargetLangForMt() { return prevSubtitleTargetLangForMt; }
        function setPrevSubtitleTargetLangForMt(v) { prevSubtitleTargetLangForMt = String(v || ''); }
        function getTranslateMtManualBrowse() { return !!translateMtManualBrowse; }
        function isSyncingTranslateMode() { return !!syncingTranslateMode; }

        /** @returns {'smart'|'dialog'|'external'|'llm'} */
        function normalizeTranslateModeLocal(raw) {
            if (settingsNormApi.normalizeTranslateMode) {
                return settingsNormApi.normalizeTranslateMode(raw);
            }
            const m = String(raw || '').trim().toLowerCase();
            if (m === 'external' || m === 'byok' || m === 'external_mt' || m === 'openai') return 'external';
            if (m === 'smart' || m === 'hybrid' || m === 'advanced' || m === 'mixed') return 'smart';
            if (m === 'dialog' || m === 'smart_dialog' || m === 'llm_line' || m === 'chat') return 'dialog';
            return 'llm';
        }

        function isExternalTranslateModeLocal(raw) {
            if (settingsNormApi.isExternalTranslateMode) return settingsNormApi.isExternalTranslateMode(raw);
            return normalizeTranslateModeLocal(raw) === 'external';
        }

        /** Pro paths: 智能翻译 (dialog) or 混合翻译 (smart). */
        function isProTranslateModeLocal(raw) {
            if (settingsNormApi.isProTranslateMode) return settingsNormApi.isProTranslateMode(raw);
            const m = normalizeTranslateModeLocal(raw);
            return m === 'smart' || m === 'dialog';
        }

        function canUseSmartTranslateUi() {
            return !!getAdvancedEntitled();
        }

        function syncFaithfulToneUi(translateOn) {
            // Faithful tone is free for all translate/dual tasks (not Advanced-gated).
            const faithfulOk = !!translateOn;
            if (els.smartTranslateFaithfulCheck) {
                els.smartTranslateFaithfulCheck.disabled = !faithfulOk;
                if (!translateOn) els.smartTranslateFaithfulCheck.checked = false;
            }
            if (els.smartTranslateFaithfulWrap) {
                els.smartTranslateFaithfulWrap.classList.toggle('opacity-50', !faithfulOk);
                els.smartTranslateFaithfulWrap.classList.toggle('pointer-events-none', !faithfulOk);
            }
            syncExpertExtraChipsUi();
        }

        function mtRouteApi() {
            return global.TransubMtTargetRoute || {};
        }

        function formSyncApi() {
            return global.TransubMtTargetFormSync || {};
        }

        function readSubtitleTargetLangFromForm() {
            const targetForm = settingsNormApi.normalizeSubtitleTargetFormValue
                ? settingsNormApi.normalizeSubtitleTargetFormValue(
                    els.quickTargetLangSelect?.value
                    || els.chineseSubtitleVariantSelect?.value
                    || 'simplified',
                )
                : String(
                    els.quickTargetLangSelect?.value
                    || els.chineseSubtitleVariantSelect?.value
                    || 'simplified',
                ).trim() || 'simplified';
            return settingsNormApi.normalizeSubtitleTargetLang
                ? settingsNormApi.normalizeSubtitleTargetLang(targetForm, 'simplified')
                : (global.TransubSubtitleTargetLang?.targetLangFromFormValue?.(targetForm) || 'zh-Hans');
        }

        function resolveMtCapabilityFromForm(extra = {}) {
            const api = mtRouteApi();
            const bag = {
                subtitleTargetLang: readSubtitleTargetLangFromForm(),
                targetLang: readSubtitleTargetLangFromForm(),
                language: els.languageSelect?.value || els.quickLanguageSelect?.value || 'auto',
                translateMode: readTranslateModeFromForm(),
                smartTranslate: !!els.smartTranslateCheck?.checked,
                lastMtByTarget: lastMtByTargetState,
                ...extra,
            };
            if (typeof api.resolveMtCapability === 'function') {
                return api.resolveMtCapability(bag);
            }
            return {
                isZhTarget: true,
                allowHybridMt: true,
                allowSakuraModels: true,
                targetLanguageLabel: '简体中文',
                hybridDisableReason: '',
                sakuraDisableReason: '',
                defaultAutoFallbackId: 'sakura-1.5b',
            };
        }

        function installedMtModelIds() {
            return (getCachedEngineModels() || [])
                .filter((m) => m && m.installed && m.id)
                .map((m) => String(m.id));
        }

        function rememberCurrentMtForTarget() {
            const api = mtRouteApi();
            const id = readLlmMtModelFromForm();
            if (!id || !api.rememberLastMtForTarget) return;
            lastMtByTargetState = api.rememberLastMtForTarget(
                lastMtByTargetState,
                readSubtitleTargetLangFromForm(),
                id,
            );
        }

        function applyMtTargetCapabilityToForm({ toast = true, refreshSelect = true } = {}) {
            const sync = formSyncApi();
            if (!sync.syncFormAfterTargetLangChange) {
                syncHybridMtUi();
                return null;
            }
            const nextTarget = readSubtitleTargetLangFromForm();
            const rec = recommendFormMtModel({ translateMode: readTranslateModeFromForm() });
            const result = sync.syncFormAfterTargetLangChange({
                prevTargetLang: prevSubtitleTargetLangForMt || nextTarget,
                nextTargetLang: nextTarget,
                language: els.languageSelect?.value || els.quickLanguageSelect?.value || 'auto',
                currentModelId: readLlmMtModelFromForm(),
                lastMtByTarget: lastMtByTargetState,
                hybridOn: els.smartTranslateHybridCheck?.checked !== false,
                translateMode: readTranslateModeFromForm(),
                installedIds: installedMtModelIds(),
                recommendId: rec.preferId || rec.id || '',
            });
            lastMtByTargetState = result.lastMtByTarget || lastMtByTargetState;
            prevSubtitleTargetLangForMt = nextTarget;
            if (result.forceHybridOff && els.smartTranslateHybridCheck) {
                els.smartTranslateHybridCheck.checked = false;
            }
            if (result.modelChanged) {
                ensureSelectValue(els.engineLlmMtModelSelect, result.engineLlmMtModel || '', {
                    label: result.engineLlmMtModel || uiTx('自动'),
                    allowEmpty: true,
                });
                if (els.engineLlmMtModelSelect) {
                    els.engineLlmMtModelSelect.value = result.engineLlmMtModel || '';
                }
            }
            if (result.llmHint) setLlmMtHintText(uiTx(result.llmHint));
            if (els.smartTranslateHybridHint && result.hybridHint) {
                els.smartTranslateHybridHint.textContent = uiTx(result.hybridHint);
            }
            syncHybridMtUi();
            if (refreshSelect) {
                // Re-filter dropdown without full model refresh when catalog already loaded
                try {
                    if (getCachedEngineModels()?.length) {
                        const prevLlm = readLlmMtModelFromForm();
                        fillEngineModelSelect(els.engineLlmMtModelSelect, getCachedEngineModels(), 'mt', prevLlm, {
                            allowEmpty: true,
                            emptyLabel: uiTx('自动匹配（按语言 / Pro / 硬件）'),
                            modelFilter: buildIntlAwareLlmMtFilter(),
                            modelDisableReason: buildIntlAwareLlmMtDisableReason(),
                        });
                    }
                } catch { /* ignore */ }
            }
            syncHybridSentenceMtMirror();
            try { rebuildTranslateMenuMtSection(); } catch { /* ignore */ }
            try { syncTranslateChipUi(); } catch { /* ignore */ }
            if (toast && result.toast) {
                showToast(result.toast, 'info');
                appendLog(result.toast, 'info');
            }
            return result;
        }

        function buildIntlAwareLlmMtFilter() {
            const base = (m) => {
                if (global.TransubSakuraMtCatalog?.isNonTranslateEngineModelId?.(m.id)) return false;
                if (!isLlmInferencePickModelId(m.id)) return false;
                if (getAdvancedEntitled()) return true;
                if (m.proScale) return false;
                const entry = findManagedLlmCatalogEntry(m.id);
                if (entry && getManagedLlmCatalogApi()?.isProScaleModel?.(entry)) return false;
                return true;
            };
            const sync = formSyncApi();
            if (sync.buildLlmMtModelFilter) {
                return sync.buildLlmMtModelFilter({
                    subtitleTargetLang: readSubtitleTargetLangFromForm(),
                    language: els.languageSelect?.value || els.quickLanguageSelect?.value || 'auto',
                }, base);
            }
            return base;
        }

        function buildIntlAwareLlmMtDisableReason() {
            const sync = formSyncApi();
            const opts = {
                subtitleTargetLang: readSubtitleTargetLangFromForm(),
                language: els.languageSelect?.value || els.quickLanguageSelect?.value || 'auto',
            };
            if (sync.buildLlmMtModelDisableReason) {
                return sync.buildLlmMtModelDisableReason(opts);
            }
            return (m) => {
                const id = typeof m === 'string' ? m : m?.id;
                const api = mtRouteApi();
                if (!api?.isMtModelAllowedForTarget) return '';
                return api.isMtModelAllowedForTarget(id, opts)
                    ? ''
                    : (api.mtModelBlockReasonForTarget?.(id, opts) || '当前成片目标语不可用');
            };
        }

        async function ensureMtSelectionValidBeforeStart() {
            const api = mtRouteApi();
            if (!api.validateMtSelectionForTarget) return true;
            const mode = readTranslateModeFromForm();
            const task = readTaskFromForm();
            if (task !== 'translate' && task !== 'dual') return true;
            const bag = {
                subtitleTargetLang: readSubtitleTargetLangFromForm(),
                language: els.languageSelect?.value || els.quickLanguageSelect?.value || 'auto',
                translateMode: mode,
                smartTranslate: isProTranslateModeLocal(mode),
                smartTranslateHybridMt: mode === 'smart'
                    && (els.smartTranslateHybridCheck?.checked !== false),
                engineLlmMtModel: readLlmMtModelFromForm(),
                engineMtModel: readLlmMtModelFromForm(),
                lastMtByTarget: lastMtByTargetState,
                task,
            };
            const rec = recommendFormMtModel({ translateMode: mode });
            const gate = api.validateMtSelectionForTarget(bag, {
                installedIds: installedMtModelIds(),
                preferId: rec.preferId || rec.id || '',
                requireInstalledGeneral: !isProTranslateModeLocal(mode)
                    && !isExternalTranslateModeLocal(mode)
                    && !isSentenceMtByokReady(),
            });
            if (gate.ok && !Object.keys(gate.fixes || {}).length) return true;

            if (gate.fixes?.smartTranslateHybridMt === false && els.smartTranslateHybridCheck) {
                els.smartTranslateHybridCheck.checked = false;
            }
            const suggested = String(gate.suggestedModelId || gate.fixes?.engineLlmMtModel || '').trim();
            const cur = readLlmMtModelFromForm();
            const hasModelFix = !!(gate.fixes
                && Object.prototype.hasOwnProperty.call(gate.fixes, 'engineLlmMtModel'));
            const needsModelFix = hasModelFix && suggested !== cur;

            if (needsModelFix) {
                const msg = gate.message
                    || uiTx('当前翻译模型与成片目标语不匹配。');
                if (suggested) {
                    const choice = await appConfirmChoice({
                        title: uiTx('翻译模型与成片目标语不匹配'),
                        message: `${msg}\n\n${uiTf('是否改用推荐模型「{id}」并继续？', { id: suggested })}`,
                        primaryLabel: uiTx('改用并继续'),
                        secondaryLabel: uiTx('取消'),
                        tertiaryLabel: uiTx('仍用当前（不推荐）'),
                    });
                    if (choice === 'secondary') return false;
                    if (choice === 'primary') {
                        ensureSelectValue(els.engineLlmMtModelSelect, suggested, {
                            label: suggested,
                            allowEmpty: true,
                        });
                        if (els.engineLlmMtModelSelect) els.engineLlmMtModelSelect.value = suggested;
                        rememberCurrentMtForTarget();
                        appendLog(uiTf('已按成片目标语改用模型 {id}', { id: suggested }), 'info');
                    }
                } else {
                    const choice = await appConfirmChoice({
                        title: uiTx('翻译配置需调整'),
                        message: `${msg}\n\n${uiTx('请安装通用推理模型（Qwen 等）或改用智能/混合翻译。')}`,
                        primaryLabel: uiTx('去模型管理'),
                        secondaryLabel: uiTx('取消'),
                    });
                    if (choice === 'primary') {
                        openAppSettings('models', { openLibrary: true });
                    }
                    return false;
                }
            } else if (gate.fixes?.smartTranslateHybridMt === false) {
                appendLog(gate.message || uiTx('已关闭句级混合（当前成片目标语不支持）'), 'info');
            } else if (!gate.ok && gate.message) {
                showToast(gate.message, 'warn');
                appendLog(gate.message, 'warn');
            }
            syncHybridMtUi();
            syncMtModelChipUi();
            return true;
        }

        function isSentenceMtByokReady() {
            const pick = getCachedSmartTranslatePick() || {};
            if (els.transubStationEnabledCheck?.checked
                || !!pick.transubStationEnabled) {
                const url = String(
                    els.transubStationUrlInput?.value
                    || pick.transubStationUrl
                    || '',
                ).trim();
                return !!url;
            }
            const model = String(pick.byokModel || '').trim();
            const baseUrl = String(pick.byokBaseUrl || '').trim();
            // Credentials may remain while Pro llmSource is forced to managed.
            return !!(model && baseUrl);
        }

        function sentenceMtByokHintSuffix() {
            if (!isExternalTranslateModeLocal(readTranslateModeFromForm())) return '';
            const stationOn = !!(els.transubStationEnabledCheck?.checked
                || getCachedSmartTranslatePick()?.transubStationEnabled);
            if (stationOn) {
                if (!isSentenceMtByokReady()) return uiTx('请先配置 Transub Station');
                return uiTx('Transub Station 已启用');
            }
            if (!isSentenceMtByokReady()) return uiTx('请先配置外接 API（BYOK）或 Transub Station');
            const model = String(getCachedSmartTranslatePick()?.byokModel || '').trim();
            return model ? uiTf('外接 BYOK：{model}', { model }) : uiTx('外接 BYOK 已配置');
        }

        function syncExternalByokSectionUi(mode) {
            const external = isExternalTranslateModeLocal(mode);
            // BYOK / Station live on settings tab「外部翻译」; only toggle the mode hint.
            els.externalByokInlineHint?.classList.toggle('hidden', !external);
        }

        function isSmartTranslateChatReady() {
            // Pro chat/polish never use BYOK after external-mode split.
            const installed = listInstalledSmartTranslateModels();
            if (installed.length) return true;
            const resolved = String(
                getCachedSmartTranslatePick()?.smartTranslateResolvedId
                || getCachedSmartTranslatePick()?.smartTranslateModelId
                || '',
            ).trim();
            if (!resolved) return false;
            return installed.some((m) => m.id === resolved)
                || !!(getCachedSmartTranslatePick()?.catalog || []).find((c) => (
                    String(c?.id || '') === resolved && c?.installed && isSmartTranslateCapableModel(c)
                ));
        }

        function setLlmMtHintText(text) {
            const base = String(text || '');
            const byokSuffix = sentenceMtByokHintSuffix();
            const t = byokSuffix
                ? (base ? `${base} ${byokSuffix}` : byokSuffix)
                : base;
            if (els.engineLlmMtModelHint) els.engineLlmMtModelHint.textContent = t;
            if (els.hybridSentenceMtModelHint) els.hybridSentenceMtModelHint.textContent = t;
        }

        function syncHybridSentenceMtMirror() {
            if (!hybridPickSync?.syncMirrorFromPrimary) return;
            hybridPickSync.syncMirrorFromPrimary({
                primary: els.engineLlmMtModelSelect,
                mirror: els.hybridSentenceMtModelSelect,
            });
        }

        function syncPrimaryLlmMtFromHybridMirror() {
            if (!hybridPickSync?.syncPrimaryFromMirror) return false;
            return hybridPickSync.syncPrimaryFromMirror({
                primary: els.engineLlmMtModelSelect,
                mirror: els.hybridSentenceMtModelSelect,
            });
        }

        function smartTranslateChatLabel() {
            const id = String(
                getCachedSmartTranslatePick()?.smartTranslateResolvedId
                || getCachedSmartTranslatePick()?.smartTranslateModelId
                || '',
            ).trim();
            if (id) {
                const hit = listInstalledSmartTranslateModels().find((m) => m.id === id);
                return hit?.name || id;
            }
            const first = listInstalledSmartTranslateModels()[0];
            return first ? (first.name || first.id) : '';
        }

        function collectSmartTranslateReadiness() {
            if (!smartTranslateReadinessApi.assessSmartTranslateReadiness) {
                return null;
            }
            const mode = readTranslateModeFromForm();
            const isDialog = mode === 'dialog';
            const cap = resolveMtCapabilityFromForm();
            return smartTranslateReadinessApi.assessSmartTranslateReadiness({
                task: readTaskFromForm(),
                translateMode: mode,
                advancedEntitled: getAdvancedEntitled(),
                hybridAllowed: isDialog ? false : !!cap.allowHybridMt,
                hybridEnabled: isDialog ? false : (els.smartTranslateHybridCheck?.checked !== false),
                polishEnabled: els.smartTranslatePolishCheck?.checked !== false,
                chatReady: isSmartTranslateChatReady(),
                chatLabel: smartTranslateChatLabel(),
                preferredHybridId: isDialog ? '' : readLlmMtModelFromForm(),
                hybridInstalledIds: installedMtModelIds(),
            });
        }

        function syncSmartTranslateReadinessUi() {
            const assess = collectSmartTranslateReadiness();
            const showBanners = !!(assess?.applicable && assess.tone === 'warn' && assess.bannerText);

            if (els.smartTranslateSentenceSlot) {
                els.smartTranslateSentenceSlot.textContent = assess?.dualSlots?.sentence?.label
                    || uiTx('翻译模型：—');
            }
            if (els.smartTranslateChatSlot) {
                els.smartTranslateChatSlot.textContent = assess?.dualSlots?.chat?.label
                    || uiTx('润色模型：—');
            }
            if (els.smartTranslateDualReadyHint) {
                els.smartTranslateDualReadyHint.textContent = assess?.applicable
                    ? (assess.bannerText || (assess.level === 'full'
                        ? uiTx('两套模型已就绪：翻译 + 剧情贴合润色。')
                        : (assess.level === 'chat_only_ok' || assess.level === 'dialog_chat_ok'
                            ? uiTx('智能翻译：对话模型按行已就绪。')
                            : '')))
                    : (getAdvancedEntitled()
                        ? uiTx('当前未选智能/混合翻译，或任务不做翻译。')
                        : uiTx('解锁 Pro 后可使用智能翻译或混合翻译。'));
            }
            if (els.smartTranslateDualReadyBtn) {
                const act = assess?.action?.action || '';
                const showBtn = !!(assess?.applicable && assess.action);
                els.smartTranslateDualReadyBtn.classList.toggle('hidden', !showBtn);
                els.smartTranslateDualReadyBtn.textContent = assess?.action?.label || uiTx('去补齐模型');
                els.smartTranslateDualReadyBtn.dataset.action = act || 'models';
            }
            if (els.smartTranslateDualReady) {
                els.smartTranslateDualReady.classList.toggle(
                    'border-amber-200',
                    !!(assess?.applicable && assess.tone === 'warn'),
                );
                els.smartTranslateDualReady.classList.toggle(
                    'bg-amber-50',
                    !!(assess?.applicable && assess.tone === 'warn'),
                );
            }

            if (els.modelsHybridReadyBanner && els.modelsHybridReadyBannerText) {
                const show = showBanners && (
                    assess.level === 'chat_degraded'
                    || assess.level === 'missing_both'
                    || assess.level === 'sentence_only'
                );
                els.modelsHybridReadyBanner.classList.toggle('hidden', !show);
                if (show) els.modelsHybridReadyBannerText.textContent = assess.bannerText;
            }
            if (els.proLlmHybridReadyBanner && els.proLlmHybridReadyBannerText) {
                const show = showBanners && (
                    assess.level === 'chat_degraded'
                    || assess.level === 'missing_both'
                    || assess.level === 'hybrid_off_chat'
                );
                els.proLlmHybridReadyBanner.classList.toggle('hidden', !show);
                if (show) els.proLlmHybridReadyBannerText.textContent = assess.bannerText;
            }

            if (els.translateModeHint && assess?.applicable) {
                if (assess.level === 'full') {
                    els.translateModeHint.textContent = uiTx('混合翻译（翻译 + 剧情贴合润色）：补欠译、锁人名、纠错译。');
                } else if (assess.level === 'chat_degraded') {
                    els.translateModeHint.textContent = uiTx('⚠ 缺专训模型：混合翻译将降级为对话模型按行翻（更慢且质量易下降）。');
                } else if (assess.level === 'sentence_only') {
                    els.translateModeHint.textContent = uiTx('翻译模型就绪；未配置润色模型时润色会跳过。');
                } else if (assess.level === 'missing_both' || assess.level === 'missing_chat'
                    || assess.level === 'hybrid_off_no_chat') {
                    els.translateModeHint.textContent = uiTx('⚠ 智能/混合翻译模型未就绪，请先补齐。');
                } else if (assess.level === 'dialog_chat_ok' || assess.level === 'chat_only_ok') {
                    els.translateModeHint.textContent = uiTx('智能翻译：对话模型按行（Pro）。');
                } else if (assess.level === 'hybrid_off_chat') {
                    els.translateModeHint.textContent = uiTx('混合翻译：翻译步骤不适用，对话模型按行。日语→中文请下载专训推理模型（Sakura/GalTransl 等）。');
                }
            }
        }

        async function ensureSmartTranslateReadinessBeforeStart() {
            try {
                await ensureSmartTranslatePickCache({ force: false });
            } catch (_) { /* ignore */ }
            const assess = collectSmartTranslateReadiness();
            if (!assess?.applicable || !assess.preflight) return true;
            const pf = assess.preflight;
            const sessionKey = `transub.smartReady.${pf.kind}`;
            if (!pf.block) {
                try {
                    if (sessionStorage.getItem(sessionKey) === '1') return true;
                } catch (_) { /* ignore */ }
            }
            const choice = await appConfirmChoice({
                title: pf.title,
                message: pf.message,
                primaryLabel: pf.primaryLabel,
                secondaryLabel: pf.secondaryLabel,
                tertiaryLabel: pf.tertiaryLabel || '',
            });
            if (choice === 'secondary') return false;
            if (choice === 'primary') {
                const go = pf.primaryAction || 'models';
                if (go === 'pro-llm' || go === 'pro-smart-translate') {
                    openAppSettings('pro-smart-translate');
                } else {
                    openAppSettings('models', { openLibrary: true });
                }
                return false;
            }
            // tertiary
            if (pf.tertiaryAction === 'pro-llm' || pf.tertiaryAction === 'pro-smart-translate') {
                openAppSettings('pro-smart-translate');
                return false;
            }
            if (pf.block) {
                const goPro = pf.primaryAction === 'pro-llm' || pf.primaryAction === 'pro-smart-translate';
                openAppSettings(goPro ? 'pro-smart-translate' : 'models', {
                    openLibrary: !goPro,
                });
                return false;
            }
            try { sessionStorage.setItem(sessionKey, '1'); } catch (_) { /* ignore */ }
            appendLog(
                pf.kind === 'chat_degraded'
                    ? uiTx('已确认以降级模式继续混合翻译（仅对话模型按行）')
                    : uiTx('已确认在模型未齐备时继续智能/混合翻译'),
                'warn',
            );
            return true;
        }

        function syncHybridMtUi() {
            // Hybrid sentence prefs: 混合翻译 only. Polish/verify: both Pro modes.
            const mode = readTranslateModeFromForm();
            const isHybridMode = mode === 'smart';
            const isDialogMode = mode === 'dialog';
            const proOk = canUseSmartTranslateUi() && (isHybridMode || isDialogMode);
            const cap = resolveMtCapabilityFromForm();
            const hybridAllowed = canUseSmartTranslateUi() && isHybridMode && !!cap.allowHybridMt;
            if (els.smartTranslateHybridCheck) {
                els.smartTranslateHybridCheck.disabled = !hybridAllowed;
                if (isDialogMode || !hybridAllowed) {
                    els.smartTranslateHybridCheck.checked = false;
                } else {
                    // Prefer on whenever hybrid is allowed; only force off when inapplicable.
                    els.smartTranslateHybridCheck.checked = true;
                }
            }
            if (els.smartTranslateHybridWrap) {
                els.smartTranslateHybridWrap.classList.toggle('opacity-50', !hybridAllowed);
                els.smartTranslateHybridWrap.classList.toggle('pointer-events-none', !hybridAllowed);
            }
            const hybridHint = isDialogMode
                ? uiTx('智能翻译：对话模型按行（Pro）；可选剧情贴合润色与忠实复核（同一对话模型）。')
                : (formSyncApi().buildHybridHint?.(cap)
                    || cap.hybridDisableReason
                    || '');
            if (els.smartTranslateHybridHint && hybridHint) {
                els.smartTranslateHybridHint.textContent = uiTx(hybridHint);
            }
            if (els.smartTranslatePolishCheck) {
                els.smartTranslatePolishCheck.disabled = !proOk;
            }
            if (els.smartTranslatePolishWrap) {
                els.smartTranslatePolishWrap.classList.toggle('opacity-50', !proOk);
                els.smartTranslatePolishWrap.classList.toggle('pointer-events-none', !proOk);
            }
            if (els.smartTranslateVerifyCheck) {
                els.smartTranslateVerifyCheck.disabled = !proOk;
            }
            if (els.smartTranslateVerifyWrap) {
                els.smartTranslateVerifyWrap.classList.toggle('opacity-50', !proOk);
                els.smartTranslateVerifyWrap.classList.toggle('pointer-events-none', !proOk);
            }
            if (els.smartTranslateAddressCheck) {
                els.smartTranslateAddressCheck.disabled = !proOk;
            }
            if (els.smartTranslateAddressWrap) {
                els.smartTranslateAddressWrap.classList.toggle('opacity-50', !proOk);
                els.smartTranslateAddressWrap.classList.toggle('pointer-events-none', !proOk);
            }
            if (els.smartTranslatePolishLimitInput) {
                els.smartTranslatePolishLimitInput.disabled = !proOk;
            }
            if (els.smartTranslatePolishLimitWrap) {
                els.smartTranslatePolishLimitWrap.classList.toggle('opacity-50', !proOk);
                els.smartTranslatePolishLimitWrap.classList.toggle('pointer-events-none', !proOk);
            }
            syncSmartTranslateReadinessUi();
        }

        function syncAdvancedFeaturesGate() {
            const locked = !getAdvancedEntitled();
            const smartLocked = !canUseSmartTranslateUi();
            els.advancedFeaturesLockHint?.classList.toggle('hidden', !locked);
            if (els.filmAudioEnhanceWrap) {
                els.filmAudioEnhanceWrap.classList.toggle('opacity-50', locked);
                // Keep clickable so locked users get the unlock prompt.
                els.filmAudioEnhanceWrap.classList.remove('pointer-events-none');
            }
            if (els.filmAudioEnhanceCheck) {
                els.filmAudioEnhanceCheck.disabled = locked;
            }
            if (els.filmVadPresetWrap) {
                els.filmVadPresetWrap.classList.toggle('opacity-50', locked);
                els.filmVadPresetWrap.classList.remove('pointer-events-none');
            }
            if (els.filmVadPresetCheck) {
                els.filmVadPresetCheck.disabled = locked;
            }
            if (els.translateModeSmartWrap) {
                els.translateModeSmartWrap.classList.toggle('is-disabled', smartLocked);
            }
            if (els.translateModeDialogWrap) {
                els.translateModeDialogWrap.classList.toggle('is-disabled', smartLocked);
            }
            els.translateModeGotoProBtn?.classList.toggle('hidden', !smartLocked);
        }

        function applyTranslateModeToForm(mode, { fromUser = false } = {}) {
            if (syncingTranslateMode) return;
            syncingTranslateMode = true;
            try {
                const task = readTaskFromForm();
                const allowTranslate = task === 'translate' || task === 'dual';
                let next = normalizeTranslateModeLocal(mode);
                if (!allowTranslate) next = 'llm';
                if (isProTranslateModeLocal(next) && !canUseSmartTranslateUi()) {
                    if (fromUser) {
                        void promptProUnlockRequired({
                            featureLabel: next === 'dialog' ? uiTx('智能翻译') : uiTx('混合翻译'),
                        });
                    }
                    next = 'llm';
                }

                setTranslateModeRadios(next);
                if (els.smartTranslateCheck) {
                    els.smartTranslateCheck.checked = isProTranslateModeLocal(next);
                }

                if (els.engineLlmMtModelSelect && next === 'llm') {
                    // Keep empty as「智能选择」; only seed a concrete id when user had none and
                    // the select has no auto option yet (legacy). Prefer leaving '' when allowEmpty.
                    const cur = els.engineLlmMtModelSelect.value || '';
                    if (!String(cur).trim()) {
                        const hasAuto = [...(els.engineLlmMtModelSelect.options || [])]
                            .some((o) => o.value === '');
                        if (!hasAuto) {
                            const cap = resolveMtCapabilityFromForm();
                            const rec = recommendFormMtModel({ translateMode: 'llm' });
                            const fallback = [...(els.engineLlmMtModelSelect.options || [])]
                                .map((o) => o.value)
                                .find((v) => v)
                                || rec.preferId
                                || rec.defaultAutoFallbackId
                                || cap.defaultAutoFallbackId
                                || '';
                            if (fallback) els.engineLlmMtModelSelect.value = fallback;
                        }
                    }
                }

                const cap = resolveMtCapabilityFromForm();
                const hybridOn = next === 'smart'
                    && !!cap.allowHybridMt
                    && (els.smartTranslateHybridCheck?.checked !== false);
                const llmPickDisabled = !allowTranslate
                    || next === 'dialog'
                    || next === 'external'
                    || (next === 'smart' && !hybridOn);
                syncExternalByokSectionUi(next);
                if (els.engineMtModelSelect) {
                    els.engineMtModelSelect.disabled = true;
                    els.engineMtModelSelect.value = '';
                }
                if (els.engineLlmMtModelSelect) els.engineLlmMtModelSelect.disabled = llmPickDisabled;
                els.engineMtModelWrap?.classList.add('hidden');
                els.engineLlmMtModelWrap?.classList.add('hidden');
                els.hybridSentenceMtModelWrap?.classList.toggle('opacity-50', llmPickDisabled);
                if (els.hybridSentenceMtModelSelect) {
                    els.hybridSentenceMtModelSelect.disabled = llmPickDisabled;
                }
                if (els.engineMtModelHint) {
                    els.engineMtModelHint.textContent = uiTx('机器翻译（Opus）已移除，请使用推理翻译或智能/混合翻译。');
                }
                {
                    const sync = formSyncApi();
                    if (!allowTranslate) {
                        setLlmMtHintText(uiTx('当前为「原语言」任务，不使用推理翻译模型。'));
                    } else if (sync.buildLlmMtHint) {
                        setLlmMtHintText(uiTx(sync.buildLlmMtHint(cap, next)));
                    } else if (next === 'smart' && hybridOn) {
                        setLlmMtHintText(uiTx('混合翻译：翻译用此推理模型（专训如 Sakura / GalTransl）；可留空自动选用。'));
                    } else if (next === 'external') {
                        setLlmMtHintText(uiTx(isSentenceMtByokReady()
                            ? '外部翻译：使用 Transub Station 或已保存的外接 API（不跑本地 GGUF）。'
                            : '外部翻译：请到「设置 → 外部翻译」配置 Station 或 BYOK。'));
                    } else if (next === 'dialog') {
                        setLlmMtHintText(uiTx('智能翻译：对话模型按行翻译（Pro）；翻译槽不适用。'));
                    } else if (next === 'smart') {
                        setLlmMtHintText(uiTx('混合翻译：由 Pro 对话模型按行翻译（专训翻译不适用）。人名本地统一。'));
                    } else {
                        setLlmMtHintText(cap.allowSakuraModels
                            ? uiTx('本地 LLM 推理翻译（专训 / Qwen 等）：可留空启用自动匹配。')
                            : uiTf('成片 {lang}：请用通用推理模型；专训日→中模型已禁用。', {
                                lang: cap.targetLanguageLabel || uiTx('非中文'),
                            }));
                    }
                }
                if (els.translateModeHint) {
                    if (!allowTranslate) {
                        els.translateModeHint.textContent = uiTx('「原语言」任务不翻译，上方选项暂时无效。');
                    } else if (isProTranslateModeLocal(next) && !canUseSmartTranslateUi()) {
                        els.translateModeHint.textContent = next === 'dialog'
                            ? uiTx('智能翻译为 Pro 专属，请先激活 Pro。')
                            : uiTx('混合翻译为 Pro 专属，请先激活 Pro。');
                    } else if (next === 'external') {
                        els.translateModeHint.textContent = uiTx(isSentenceMtByokReady()
                            ? '外部翻译：Station 或外接 API 句级译中（无 Pro 润色/复核）。'
                            : '外部翻译：请到「设置 → 外部翻译」配置 Station 或 BYOK。');
                    } else if (next === 'dialog') {
                        els.translateModeHint.textContent = els.smartTranslatePolishCheck?.checked !== false
                            ? uiTx('智能翻译：对话模型按行 + 剧情贴合润色（Pro）。')
                            : uiTx('智能翻译：对话模型按行（贴合润色已关）。');
                    } else if (next === 'smart' && hybridOn && els.smartTranslatePolishCheck?.checked !== false) {
                        els.translateModeHint.textContent = uiTx('混合翻译（翻译 + 剧情贴合润色）：补欠译、锁人名、纠错译。');
                    } else if (next === 'smart' && hybridOn) {
                        els.translateModeHint.textContent = uiTx('混合翻译（翻译；贴合润色已关）。');
                    } else if (next === 'smart') {
                        els.translateModeHint.textContent = uiTx('混合翻译：翻译步骤不适用时由对话模型按行。');
                    } else {
                        els.translateModeHint.textContent = '';
                    }
                }
            } finally {
                syncingTranslateMode = false;
            }
            // Faithful + lock UI only (avoid re-entering translate mode sync)
            const task = readTaskFromForm();
            const allow = task === 'translate' || task === 'dual';
            syncFaithfulToneUi(allow);
            syncHybridMtUi();
            syncAdvancedFeaturesGate();
            syncHybridSentenceMtMirror();
            syncTranslateModeChipUi();
            syncMtModelChipUi();
            syncExpertExtraChipsUi();
            updateReadinessStrip();
            // Magic wand tips show effective MT (Sakura vs 智能翻译); refresh when mode changes.
            if (fromUser && !getIsStandaloneSettings() && getState().items.some((i) => (
                i?.sense?.status === 'done' || i?.sense?.status === 'error'
            ))) {
                renderList();
            }
        }

        function readOpusMtModelFromForm() {
            // Opus-MT removed; keep helper returning '' for callers that still pass opusId.
            return '';
        }

        function readLlmMtModelFromForm() {
            // Empty =「智能选择」; resolve at readActive / job start.
            return String(els.engineLlmMtModelSelect?.value || '').trim();
        }

        function parseVramGbHint() {
            const cachedMb = Number(getCachedHardwareRecommend()?.vramMb || 0);
            if (cachedMb > 0) return cachedMb / 1024;
            const text = String(els.engineGpuStatus?.textContent || '');
            const m = text.match(/(\d+(?:\.\d+)?)\s*GB/i);
            if (!m) return undefined;
            const n = Number(m[1]);
            return Number.isFinite(n) ? n : undefined;
        }

        function recommendMtContext(extra = {}) {
            const targetForm = settingsNormApi.normalizeSubtitleTargetFormValue
                ? settingsNormApi.normalizeSubtitleTargetFormValue(
                    els.quickTargetLangSelect?.value
                    || els.chineseSubtitleVariantSelect?.value
                    || 'simplified',
                )
                : String(els.chineseSubtitleVariantSelect?.value || 'simplified');
            const subtitleTargetLang = settingsNormApi.normalizeSubtitleTargetLang
                ? settingsNormApi.normalizeSubtitleTargetLang(targetForm, 'simplified')
                : (global.TransubSubtitleTargetLang?.targetLangFromFormValue?.(targetForm) || 'zh-Hans');
            return {
                translateMode: readTranslateModeFromForm(),
                language: els.languageSelect?.value || els.quickLanguageSelect?.value || 'auto',
                device: els.deviceSelect?.value || 'cuda',
                vramGb: parseVramGbHint(),
                hwProfile: getCachedHardwareRecommend()?.profile || '',
                advancedEntitled: getAdvancedEntitled(),
                installedModels: getCachedEngineModels(),
                subtitleTargetLang,
                targetLang: subtitleTargetLang,
                chineseSubtitleVariant: (targetForm === 'en' || targetForm === 'ja' || targetForm === 'ko')
                    ? 'simplified'
                    : targetForm,
                ...extra,
            };
        }

        function recommendFormMtModel(extra = {}) {
            const api = getContentProfileApi();
            if (typeof api?.recommendFormMtModel === 'function') {
                return api.recommendFormMtModel(recommendMtContext(extra));
            }
            return { id: '', preferId: '', reason: '', mode: readTranslateModeFromForm() };
        }

        function shortMtModelChipLabel(modelId, { auto = false } = {}) {
            if (translateChipApi.shortMtModelChipLabel) {
                return translateChipApi.shortMtModelChipLabel(modelId, { auto });
            }
            if (auto || !modelId) return uiTx('自动');
            return String(modelId || '').trim() || uiTx('自动');
        }

        function readActiveEngineMtModelFromForm() {
            const mode = readTranslateModeFromForm();
            if (isProTranslateModeLocal(mode)) return '';
            if (mode === 'llm' || mode === 'sakura') {
                const picked = readLlmMtModelFromForm();
                if (picked) return picked;
                const rec = recommendFormMtModel({ translateMode: 'llm' });
                const cap = resolveMtCapabilityFromForm();
                return String(
                    rec.id || rec.preferId || rec.defaultAutoFallbackId || cap.defaultAutoFallbackId || '',
                ).trim();
            }
            return readOpusMtModelFromForm();
        }

        function isMtModelAutoSelected() {
            const mode = readTranslateModeFromForm();
            if (mode === 'dialog') {
                return !String(getCachedSmartTranslatePick()?.smartTranslateModelId || '').trim();
            }
            if (mode === 'smart') {
                if (els.smartTranslateHybridCheck?.checked !== false) {
                    return !readLlmMtModelFromForm();
                }
                return !String(getCachedSmartTranslatePick()?.smartTranslateModelId || '').trim();
            }
            if (mode === 'llm' || mode === 'sakura') return !readLlmMtModelFromForm();
            return !readOpusMtModelFromForm();
        }

        function listInstalledMtModelsForMode(mode) {
            const models = Array.isArray(getCachedEngineModels()) ? getCachedEngineModels() : [];
            const wantLlm = mode === 'llm' || mode === 'sakura';
            const nonMtKinds = new Set(['asr', 'vad', 'demucs', 'separate']);
            return models.filter((m) => {
                if (!m?.installed || m?.incomplete) return false;
                const id = String(m.id || '').trim();
                if (!id) return false;
                const kind = String(m.kind || '').toLowerCase();
                // Never list ASR/VAD/separation under the translate model picker.
                if (nonMtKinds.has(kind)) return false;
                if (global.TransubSakuraMtCatalog?.isNonTranslateEngineModelId?.(id)) return false;
                const isLlm = isLlmInferencePickModelId(id);
                if (wantLlm) {
                    if (!isLlm) return false;
                    const kindOk = engineModelsUi.matchesEngineSelectKind
                        ? engineModelsUi.matchesEngineSelectKind(kind, 'mt')
                        : (!kind || kind === 'mt' || kind === 'llm');
                    if (kind && !kindOk) return false;
                    if (!getAdvancedEntitled()) {
                        const entry = findManagedLlmCatalogEntry(id);
                        if (entry && getManagedLlmCatalogApi()?.isProScaleModel?.(entry)) return false;
                        if (m.proScale) return false;
                    }
                    return true;
                }
                if (isLlm) return false;
                return kind === 'mt';
            });
        }

        function listInstalledSmartTranslateModels() {
            const catalog = retranslatePlanApi.filterSmartTranslateCatalog
                ? retranslatePlanApi.filterSmartTranslateCatalog(
                    getCachedSmartTranslatePick()?.catalog,
                    getManagedLlmCatalogApi(),
                )
                : (Array.isArray(getCachedSmartTranslatePick()?.catalog)
                    ? getCachedSmartTranslatePick().catalog.filter((item) => item?.installed
                        && isSmartTranslateCapableModel(item))
                    : []);
            return catalog.map((item) => ({
                id: String(item.id || '').trim(),
                name: retranslatePlanApi.formatSmartTranslateModelLabel
                    ? retranslatePlanApi.formatSmartTranslateModelLabel(item, getManagedLlmCatalogApi())
                    : (item.name || item.id),
                installed: true,
                paramBillion: item.paramBillion,
                proScale: item.proScale,
                family: item.family,
                promptFamily: item.promptFamily,
                translateOnly: !!item.translateOnly,
            })).filter((m) => {
                if (!m.id) return false;
                if (retranslatePlanApi.isSmartTranslateLiteModel?.(m, getManagedLlmCatalogApi())) {
                    return false;
                }
                return true;
            });
        }

        function rebuildTranslateMenuMtSection() {
            const doc = typeof document !== 'undefined' ? document : null;
            const host = els.translateMtModelList || doc?.getElementById('translateMtModelList');
            const listWrap = els.translateMtModelListWrap || doc?.getElementById('translateMtModelListWrap');
            const section = els.translateMtSection || doc?.getElementById('translateMtSection');
            const sectionLabel = els.translateMtSectionLabel || doc?.getElementById('translateMtSectionLabel');
            const autoBtn = els.translateMtAutoBtn || doc?.getElementById('translateMtAutoBtn');
            const manualBtn = els.translateMtManualBtn || doc?.getElementById('translateMtManualBtn');
            const autoDesc = els.translateMtAutoDesc || doc?.getElementById('translateMtAutoDesc');
            const polishSection = els.translatePolishSection || doc?.getElementById('translatePolishSection');
            const polishHost = els.translatePolishModelList || doc?.getElementById('translatePolishModelList');
            const polishListWrap = els.translatePolishModelListWrap
                || doc?.getElementById('translatePolishModelListWrap');
            const task = readTaskFromForm();
            const allow = task === 'translate' || task === 'dual';
            const mode = allow ? readTranslateModeFromForm() : 'engine';
            const externalMode = allow && isExternalTranslateModeLocal(mode);
            const smartHybrid = mode === 'smart'
                && (els.smartTranslateHybridCheck?.checked !== false);
            const dialogMode = mode === 'dialog';
            const smartDialog = dialogMode || (mode === 'smart' && !smartHybrid);
            const auto = isMtModelAutoSelected();
            // Popover: always paint the model list; 「自动」is the first row (no auto/manual layer).
            const showManual = allow && !externalMode;
            const activeId = mode === 'smart' || dialogMode
                ? (smartHybrid
                    ? readLlmMtModelFromForm()
                    : String(getCachedSmartTranslatePick()?.smartTranslateModelId || '').trim())
                : (mode === 'llm' || mode === 'sakura'
                    ? readLlmMtModelFromForm()
                    : readOpusMtModelFromForm());
            const polishActiveId = String(getCachedSmartTranslatePick()?.smartTranslateModelId || '').trim();

            if (auto && !translateMtManualBrowse && !(smartHybrid && polishActiveId)) {
                translateMtManualBrowse = false;
            }

            section?.classList.toggle('hidden', !allow);
            section?.classList.remove('is-collapsed');
            if (externalMode) {
                const pick = getExternalPick();
                if (pick?.paintExternalMtSection) {
                    pick.paintExternalMtSection({
                        host,
                        listWrap,
                        mtPickSwitch: els.translateMtPickSwitch,
                        sectionLabel,
                        allow: true,
                    });
                    polishSection?.classList.add('hidden');
                    if (polishSection) polishSection.hidden = true;
                    section?.classList.remove('is-hybrid-dual');
                    try { positionModelsPopover(); } catch { /* ignore */ }
                    syncModelsMenuDetailUi();
                    return;
                }
            } else {
                getExternalPick()?.hideSourceSwitch?.();
            }
            if (els.translateMtPickSwitch) {
                els.translateMtPickSwitch.classList.add('hidden');
                els.translateMtPickSwitch.hidden = true;
                els.translateMtPickSwitch.setAttribute('aria-hidden', 'true');
            }
            if (sectionLabel) {
                if (smartHybrid) sectionLabel.textContent = uiTx('翻译模型');
                else if (smartDialog) sectionLabel.textContent = uiTx('对话模型');
                else sectionLabel.textContent = uiTx('模型');
                sectionLabel.hidden = !allow;
                sectionLabel.classList.toggle('hidden', !allow);
            }
            const polishLabel = els.translatePolishSectionLabel
                || doc?.getElementById('translatePolishSectionLabel');
            if (polishLabel) polishLabel.textContent = uiTx('润色模型');
            section?.classList.toggle('is-hybrid-dual', !!(allow && smartHybrid && showManual));
            try { positionModelsPopover(); } catch { /* ignore */ }
            if (autoBtn) {
                autoBtn.classList.toggle('is-active', allow && auto && !activeId);
                autoBtn.setAttribute('aria-pressed', (allow && auto && !activeId) ? 'true' : 'false');
            }
            if (manualBtn) {
                manualBtn.classList.toggle('is-active', !!(allow && (!auto || activeId)));
                manualBtn.setAttribute('aria-pressed', (allow && (!auto || activeId)) ? 'true' : 'false');
            }
            if (autoDesc) {
                autoDesc.textContent = '';
                autoDesc.hidden = true;
                autoDesc.classList.add('hidden');
            }
            if (els.translateMtAutoHint) {
                els.translateMtAutoHint.textContent = '';
                els.translateMtAutoHint.hidden = true;
                els.translateMtAutoHint.classList.add('hidden');
            }
            if (listWrap) {
                listWrap.classList.toggle('hidden', !showManual);
            }
            polishSection?.classList.toggle('hidden', !(allow && smartHybrid && showManual));
            if (polishSection) polishSection.hidden = !(allow && smartHybrid && showManual);
            if (polishListWrap) {
                polishListWrap.classList.toggle('hidden', !(allow && smartHybrid && showManual));
            }

            if (host) {
                host.innerHTML = '';
                if (showManual) {
                    const list = smartDialog
                        ? listInstalledSmartTranslateModels()
                        : listInstalledMtModelsForMode(smartHybrid ? 'llm' : mode);
                    const autoRow = document.createElement('button');
                    autoRow.type = 'button';
                    autoRow.className = 'post-task-menu-item';
                    autoRow.dataset.mtModel = '__auto__';
                    autoRow.setAttribute('role', 'menuitem');
                    if (!activeId) autoRow.classList.add('active');
                    autoRow.innerHTML = `<i class="fa fa-check post-task-check" aria-hidden="true"></i><span>${uiTx('自动（按语言 / 硬件）')}</span>`;
                    autoRow.addEventListener('click', (event) => {
                        event.stopPropagation();
                        void setQuickMtModel('__auto__');
                    });
                    host.appendChild(autoRow);
                    if (!list.length) {
                        const row = document.createElement('p');
                        row.className = 'post-task-menu-hint px-1 py-1 border-0 mb-0';
                        row.setAttribute('aria-live', 'polite');
                        if (isModelsCatalogLoading()) {
                            row.textContent = uiTx('正在加载模型数据…');
                        } else {
                            row.textContent = smartDialog
                                ? uiTx('暂无已下载的对话模型 · 请到设置 → Pro → 智能翻译')
                                : uiTx('暂无已下载模型 · 请到主界面 → 模型管理下载');
                        }
                        host.appendChild(row);
                    } else {
                        const disableReasonOf = buildIntlAwareLlmMtDisableReason();
                        for (const model of list) {
                            const id = String(model.id || '').trim();
                            if (!id) continue;
                            const blockReason = smartDialog
                                ? ''
                                : String(disableReasonOf(model) || '').trim();
                            const btn = document.createElement('button');
                            btn.type = 'button';
                            btn.className = 'post-task-menu-item';
                            btn.dataset.mtModel = id;
                            btn.setAttribute('role', 'menuitem');
                            if (activeId && id === activeId) btn.classList.add('active');
                            btn.innerHTML = '<i class="fa fa-check post-task-check" aria-hidden="true"></i><span></span>';
                            const label = smartDialog
                                ? (model.name || id)
                                : (formatEngineModelOptionLabel(model) || id);
                            btn.querySelector('span').textContent = blockReason
                                ? `${label}${uiTx('（不可用）')}`
                                : label;
                            if (blockReason) {
                                btn.disabled = true;
                                btn.classList.add('is-disabled', 'opacity-50');
                                btn.title = blockReason;
                                btn.setAttribute('aria-disabled', 'true');
                            } else {
                                btn.addEventListener('click', (event) => {
                                    event.stopPropagation();
                                    // Keep popover open so ASR / other slot can be adjusted.
                                    void setQuickMtModel(id);
                                });
                            }
                            host.appendChild(btn);
                        }
                    }
                }
            }

            if (polishHost) {
                polishHost.innerHTML = '';
                if (allow && smartHybrid && showManual) {
                    const polishList = listInstalledSmartTranslateModels();
                    const autoRow = document.createElement('button');
                    autoRow.type = 'button';
                    autoRow.className = 'post-task-menu-item';
                    autoRow.dataset.polishModel = '__auto__';
                    autoRow.setAttribute('role', 'menuitem');
                    if (!polishActiveId) autoRow.classList.add('active');
                    autoRow.innerHTML = `<i class="fa fa-check post-task-check" aria-hidden="true"></i><span>${uiTx('（尚未选用）')}</span>`;
                    autoRow.addEventListener('click', (event) => {
                        event.stopPropagation();
                        void setQuickPolishModel('__auto__');
                    });
                    polishHost.appendChild(autoRow);
                    if (!polishList.length) {
                        const row = document.createElement('p');
                        row.className = 'post-task-menu-hint px-1 py-1 border-0 mb-0';
                        row.setAttribute('aria-live', 'polite');
                        row.textContent = isModelsCatalogLoading()
                            ? uiTx('正在加载模型数据…')
                            : uiTx('暂无已下载对话模型 · 设置 → Pro → 智能翻译');
                        polishHost.appendChild(row);
                    } else {
                        for (const model of polishList) {
                            const id = String(model.id || '').trim();
                            if (!id) continue;
                            const btn = document.createElement('button');
                            btn.type = 'button';
                            btn.className = 'post-task-menu-item';
                            btn.dataset.polishModel = id;
                            btn.setAttribute('role', 'menuitem');
                            if (polishActiveId && id === polishActiveId) btn.classList.add('active');
                            btn.innerHTML = '<i class="fa fa-check post-task-check" aria-hidden="true"></i><span></span>';
                            btn.querySelector('span').textContent = model.name || id;
                            btn.addEventListener('click', (event) => {
                                event.stopPropagation();
                                void setQuickPolishModel(id);
                            });
                            polishHost.appendChild(btn);
                        }
                    }
                }
            }
            syncModelsMenuDetailUi();
        }

        async function setQuickPolishModel(modelId) {
            const task = readTaskFromForm();
            if (task !== 'translate' && task !== 'dual') return;
            if (readTranslateModeFromForm() !== 'smart') return;
            const raw = String(modelId || '').trim();
            const auto = !raw || raw === '__auto__';
            translateMtManualBrowse = true;
            if (auto) {
                const res = await electron?.transubAdvancedSaveByok?.({
                    llmSource: 'managed',
                    smartTranslateModelId: '',
                });
                if (res && res.ok === false) {
                    showToast(res.error || uiTx('无法清除润色模型'), 'warn');
                    return;
                }
                setCachedSmartTranslatePick(null);
                await ensureSmartTranslatePickCache({ force: true });
                showToast(uiTx('已清除润色模型（混合翻译润色将跳过，不会改用推理模型）'), 'ok');
            } else {
                const pick = await ensureSmartTranslatePickCache({ force: !getCachedSmartTranslatePick() });
                const ready = await ensureRequiredModelsReadyOrPrompt({
                    modelIds: [raw],
                    contextLabel: uiTf('润色模型「{raw}」', { raw }),
                    catalog: Array.isArray(pick?.catalog) ? pick.catalog : [],
                    settingsTab: 'pro-smart-translate',
                    settingsHint: uiTx('设置 → Pro → 智能翻译'),
                });
                if (!ready) return;
                const res = await electron?.transubAdvancedManagedLlmSelect?.({
                    modelId: raw,
                    role: 'smartTranslate',
                });
                if (!res?.ok) {
                    showToast(res?.error || uiTx('无法选用润色模型'), 'warn');
                    return;
                }
                setCachedSmartTranslatePick(null);
                await ensureSmartTranslatePickCache({ force: true });
                if (els.advancedSmartTranslateModelSelect) {
                    ensureSelectValue(els.advancedSmartTranslateModelSelect, raw, {
                        label: raw,
                        allowEmpty: true,
                    });
                    els.advancedSmartTranslateModelSelect.value = raw;
                }
                showToast(uiTf('已指定润色模型：{name}', { name: raw }), 'ok');
            }
            syncTranslateChipUi();
            syncHybridSentenceMtMirror();
            updateReadinessStrip();
        }

        async function setTranslateMtPickMode(pick) {
            const next = String(pick || '').trim() === 'manual' ? 'manual' : 'auto';
            if (next === 'auto') {
                translateMtManualBrowse = false;
                await setQuickMtModel('__auto__');
                // Global「自动」clears polish pick too (hybrid dual-slot).
                // Dialog path already cleared smartTranslateModelId inside setQuickMtModel.
                if (readTranslateModeFromForm() === 'smart') {
                    const res = await electron?.transubAdvancedSaveByok?.({
                        llmSource: 'managed',
                        smartTranslateModelId: '',
                    });
                    if (!(res && res.ok === false)) {
                        setCachedSmartTranslatePick(null);
                        await ensureSmartTranslatePickCache({ force: true });
                    }
                }
                rebuildTranslateMenuMtSection();
                syncTranslateChipUi();
                return;
            }
            translateMtManualBrowse = true;
            // Persist mtUseForm so restart keeps「表单选型」而非继续跟随感知。
            setMtUseForm(true, { persist: true });
            const mode = readTranslateModeFromForm();
            // Dialog / hybrid chat lists come from managed LLM catalog — load before paint
            // so「手动」does not flash empty / fall back to「自动」before cache arrives.
            if (mode === 'smart' || mode === 'dialog') {
                await ensureSmartTranslatePickCache({
                    force: !getCachedSmartTranslatePick()?.catalog?.length,
                });
            }
            rebuildTranslateMenuMtSection();
            syncTranslateChipUi();
        }

        function syncTranslateChipUi() {
            const task = readTaskFromForm();
            const allow = task === 'translate' || task === 'dual';
            const mode = allow ? readTranslateModeFromForm() : 'engine';
            const followSense = false;
            const auto = isMtModelAutoSelected();
            let label = '—';
            let title = uiTx('翻译方式和模型');
            if (translateChipApi.buildTranslateChipViewModel) {
                const smartHybrid = mode === 'smart'
                    && (els.smartTranslateHybridCheck?.checked !== false);
                const rec = (allow && auto && !followSense
                    && (mode === 'llm' || mode === 'sakura' || smartHybrid || mode === 'dialog'))
                    ? recommendFormMtModel({
                        translateMode: smartHybrid ? 'llm' : mode,
                    })
                    : {};
                const vm = translateChipApi.buildTranslateChipViewModel({
                    task,
                    mode,
                    followSense,
                    auto,
                    autoSenseEnabled: false,
                    recommend: rec,
                    opusId: readOpusMtModelFromForm(),
                    llmId: readLlmMtModelFromForm(),
                    smartId: String(getCachedSmartTranslatePick()?.smartTranslateModelId || '').trim(),
                    hybridMt: mode === 'smart'
                        ? (els.smartTranslateHybridCheck
                            ? !!els.smartTranslateHybridCheck.checked
                            : true)
                        : false,
                    plotPolish: (mode === 'smart' || mode === 'dialog')
                        ? (els.smartTranslatePolishCheck
                            ? !!els.smartTranslatePolishCheck.checked
                            : true)
                        : false,
                });
                label = vm.label;
                title = vm.title;
            } else if (allow) {
                label = translateModeLabel(mode);
            }
            if (els.quickTranslateLabel) els.quickTranslateLabel.textContent = label;
            if (els.quickTranslateBtn) els.quickTranslateBtn.title = title;
            els.translateMenuWrap?.classList.toggle('opacity-50', !allow);
            els.translateMenuWrap?.classList.toggle('pointer-events-none', !allow);
            els.translateMenu?.querySelectorAll('[data-translate-mode]').forEach((item) => {
                const on = item.dataset.translateMode === mode;
                item.classList.toggle('active', on);
                item.setAttribute('aria-checked', on ? 'true' : 'false');
            });
            rebuildTranslateMenuMtSection();
            syncModelsChipLabel();
            updateRecipeCapsule();
        }

        function syncTranslateModeChipUi() { syncTranslateChipUi(); }
        function syncMtModelChipUi() { syncTranslateChipUi(); }

        function ensureMtSelectAllowsEmpty(selectEl, emptyLabel) {
            if (!selectEl) return;
            if ([...selectEl.options].some((o) => o.value === '')) return;
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = emptyLabel || '自动匹配';
            selectEl.insertBefore(opt, selectEl.firstChild);
        }

        async function setQuickMtModel(modelId) {
            const task = readTaskFromForm();
            if (task !== 'translate' && task !== 'dual') return;
            const mode = readTranslateModeFromForm();
            const raw = String(modelId || '').trim();
            const emptyLlmLabel = uiTx('自动匹配（按语言 / Pro / 硬件）');
            const emptyOpusLabel = uiTx('自动匹配（按源语言 · Opus）');
            const smartHybrid = mode === 'smart'
                && (els.smartTranslateHybridCheck?.checked !== false);
            const smartDialog = mode === 'dialog' || (mode === 'smart' && !smartHybrid);

            if (raw === '__sense__' || raw === '__auto__') {
                translateMtManualBrowse = false;
                setMtUseForm(true, { persist: false });
                if (smartDialog) {
                    const res = await electron?.transubAdvancedSaveByok?.({
                        llmSource: 'managed',
                        smartTranslateModelId: '',
                    });
                    if (res && res.ok === false) {
                        showToast(res.error || uiTx('无法切换为自动'), 'warn');
                        return;
                    }
                    setCachedSmartTranslatePick(null);
                    await ensureSmartTranslatePickCache({ force: true });
                    showToast(
                        mode === 'dialog' ? uiTx('智能翻译改回自动选对话模型') : uiTx('混合翻译改回自动选对话模型'),
                        'ok',
                    );
                } else {
                    ensureMtSelectAllowsEmpty(els.engineLlmMtModelSelect, emptyLlmLabel);
                    ensureMtSelectAllowsEmpty(els.engineMtModelSelect, emptyOpusLabel);
                    if (els.engineLlmMtModelSelect) els.engineLlmMtModelSelect.value = '';
                    if (!smartHybrid && els.engineMtModelSelect) els.engineMtModelSelect.value = '';
                    showToast(
                        mode === 'smart'
                            ? uiTx('混合翻译改回自动选翻译模型')
                            : uiTx('翻译改回自动选模型'),
                        'ok',
                    );
                }
            } else {
                const auto = !raw;
                translateMtManualBrowse = auto ? false : translateMtManualBrowse;
                setMtUseForm(true, { persist: false });
                if (smartDialog) {
                    if (auto) {
                        const res = await electron?.transubAdvancedSaveByok?.({
                            llmSource: 'managed',
                            smartTranslateModelId: '',
                        });
                        if (res && res.ok === false) {
                            showToast(res.error || uiTx('无法切换为自动'), 'warn');
                            return;
                        }
                        setCachedSmartTranslatePick(null);
                        await ensureSmartTranslatePickCache({ force: true });
                        showToast(
                            mode === 'dialog' ? uiTx('智能翻译改回自动选对话模型') : uiTx('混合翻译改回自动选对话模型'),
                            'ok',
                        );
                    } else {
                        const pick = await ensureSmartTranslatePickCache({ force: !getCachedSmartTranslatePick() });
                        const ready = await ensureRequiredModelsReadyOrPrompt({
                            modelIds: [raw],
                            contextLabel: uiTf('对话模型「{raw}」', { raw }),
                            catalog: Array.isArray(pick?.catalog) ? pick.catalog : [],
                            settingsTab: 'pro-smart-translate',
                            settingsHint: uiTx('设置 → Pro → 智能翻译'),
                        });
                        if (!ready) return;
                        const res = await electron?.transubAdvancedManagedLlmSelect?.({
                            modelId: raw,
                            role: 'smartTranslate',
                        });
                        if (!res?.ok) {
                            showToast(res?.error || uiTx('无法选用润色模型'), 'warn');
                            return;
                        }
                        setCachedSmartTranslatePick(null);
                        await ensureSmartTranslatePickCache({ force: true });
                        showToast(uiTf('已指定对话模型：{name}', { name: raw }), 'ok');
                    }
                } else if (mode === 'llm' || mode === 'sakura' || smartHybrid) {
                    if (!auto) {
                        const blockReason = String(buildIntlAwareLlmMtDisableReason()({ id: raw }) || '').trim();
                        if (blockReason) {
                            showToast(blockReason, 'warn');
                            appendLog(blockReason, 'warn');
                            return;
                        }
                        const ready = await ensureRequiredModelsReadyOrPrompt({
                            modelIds: [raw],
                            contextLabel: mode === 'smart'
                                ? uiTf('翻译模型「{raw}」', { raw })
                                : uiTf('翻译模型「{raw}」', { raw }),
                        });
                        if (!ready) return;
                    }
                    ensureMtSelectAllowsEmpty(els.engineLlmMtModelSelect, emptyLlmLabel);
                    if (els.engineLlmMtModelSelect) {
                        els.engineLlmMtModelSelect.value = auto ? '' : raw;
                        if (!auto && els.engineLlmMtModelSelect.value !== raw) {
                            ensureSelectValue(els.engineLlmMtModelSelect, raw, { label: raw, allowEmpty: true });
                        }
                    }
                    syncHybridSentenceMtMirror();
                    if (auto) {
                        showToast(mode === 'smart' ? uiTx('混合翻译改回自动选翻译模型') : uiTx('翻译改回自动选模型'), 'ok');
                    } else if (mode === 'smart') {
                        showToast(uiTf('已指定翻译模型：{name}', { name: raw }), 'ok');
                    }
                } else {
                    if (!auto) {
                        const ready = await ensureRequiredModelsReadyOrPrompt({
                            modelIds: [raw],
                            contextLabel: uiTf('翻译模型「{raw}」', { raw }),
                        });
                        if (!ready) return;
                    }
                    ensureMtSelectAllowsEmpty(els.engineMtModelSelect, emptyOpusLabel);
                    if (els.engineMtModelSelect) {
                        els.engineMtModelSelect.value = auto ? '' : raw;
                        if (!auto && els.engineMtModelSelect.value !== raw) {
                            ensureSelectValue(els.engineMtModelSelect, raw, { label: raw, allowEmpty: true });
                        }
                    }
                    if (auto) {
                        showToast(uiTx('翻译改回自动选模型'), 'ok');
                    }
                }
            }
            markSettingsDirty(true);
            setSaveParamsStatus(uiTx('有未保存更改'), 'warn');
            syncTranslateChipUi();
            syncParamsModeChipUi();
            updateReadinessStrip();
            await persistFormOptionsQuiet();
            // Re-assert after persist in case a normalize/reload path raced.
            if (!raw || raw === '__auto__' || raw === '__sense__') {
                if (mode === 'llm' || mode === 'sakura' || smartHybrid) {
                    ensureMtSelectAllowsEmpty(els.engineLlmMtModelSelect, emptyLlmLabel);
                    if (els.engineLlmMtModelSelect) els.engineLlmMtModelSelect.value = '';
                } else if (!smartDialog) {
                    ensureMtSelectAllowsEmpty(els.engineMtModelSelect, emptyOpusLabel);
                    if (els.engineMtModelSelect) els.engineMtModelSelect.value = '';
                }
                syncTranslateChipUi();
            }
            updateParamsSummary();
        }

        async function setQuickTranslateMode(mode) {
            const task = readTaskFromForm();
            if (task !== 'translate' && task !== 'dual') return;
            applyTranslateModeToForm(mode, { fromUser: true });
            markSettingsDirty(true);
            setSaveParamsStatus(uiTx('有未保存更改'), 'warn');
            syncTranslateChipUi();
            updateReadinessStrip();
            updateModelSelectHint();
            await persistFormOptionsQuiet();
            updateParamsSummary();
        }

        function updateReadinessStrip() {
            if (!els.readinessStrip || getIsStandaloneSettings()) return;
            const backend = readEngineBackendFromForm();
            const task = readTaskFromForm();
            const mode = readTranslateModeFromForm();
            const enginePath = String(els.engineInstallPathInput?.value || '').trim()
                || String(getCachedBundledEnginePath() || '').trim();
            const engineOk = backend === 'twai'
                ? !!String(els.installPathInput?.value || '').trim()
                : !!enginePath || !!els.engineStatus?.className?.includes('emerald');
            let llmPreferId = '';
            if ((mode === 'llm' || mode === 'sakura')
                && mode !== 'external'
                && !(els.engineLlmMtModelSelect?.value || '')) {
                const rec = recommendFormMtModel({ translateMode: 'llm' });
                llmPreferId = rec.preferId || rec.id || '';
            }
            const smartReady = isProTranslateModeLocal(mode) ? collectSmartTranslateReadiness() : null;
            const byokReady = isExternalTranslateModeLocal(mode) && isSentenceMtByokReady();
            const byokModel = String(getCachedSmartTranslatePick()?.byokModel || '').trim();
            const vm = startReadinessApi.buildReadinessStripViewModel
                ? startReadinessApi.buildReadinessStripViewModel({
                    backend,
                    task,
                    taskLabel: taskLabelOf(task),
                    mode,
                    modeLabel: translateModeLabel(mode),
                    asrLabel: els.engineAsrModelSelect?.value || '默认 ASR',
                    engineOk,
                    advancedEntitled: getAdvancedEntitled(),
                    opusMtId: els.engineMtModelSelect?.value || '',
                    llmMtId: els.engineLlmMtModelSelect?.value || '',
                    llmPreferId,
                    sentenceMtByok: byokReady,
                    sentenceMtByokLabel: byokReady
                        ? (byokModel ? `推理 BYOK · ${byokModel}` : '推理 BYOK')
                        : '',
                    smartStripPart: smartReady?.stripPart || '',
                    smartTone: smartReady?.tone || 'ok',
                    smartAction: smartReady?.action || null,
                })
                : { text: '界面核心未加载，请重启应用', tone: 'warn', action: null };
            els.readinessStripText.textContent = vm.text;
            els.readinessStrip.classList.remove('hidden', 'is-warn', 'is-ok');
            if (vm.tone === 'warn') {
                els.readinessStrip.classList.add('is-warn');
            } else {
                els.readinessStrip.classList.add('is-ok');
            }
            if (els.readinessStripAction && vm.action) {
                els.readinessStripAction.classList.remove('hidden');
                els.readinessStripAction.textContent = vm.action.label;
                els.readinessStripAction.dataset.action = vm.action.action;
                delete els.readinessStripAction.dataset.recommendedAsr;
            } else {
                els.readinessStripAction?.classList.add('hidden');
            }
        }

        return {
            canUseSmartTranslateUi,
            syncFaithfulToneUi,
            mtRouteApi,
            formSyncApi,
            readSubtitleTargetLangFromForm,
            resolveMtCapabilityFromForm,
            installedMtModelIds,
            rememberCurrentMtForTarget,
            applyMtTargetCapabilityToForm,
            buildIntlAwareLlmMtFilter,
            buildIntlAwareLlmMtDisableReason,
            ensureMtSelectionValidBeforeStart,
            isSmartTranslateChatReady,
            smartTranslateChatLabel,
            collectSmartTranslateReadiness,
            syncSmartTranslateReadinessUi,
            ensureSmartTranslateReadinessBeforeStart,
            syncHybridMtUi,
            syncAdvancedFeaturesGate,
            applyTranslateModeToForm,
            readOpusMtModelFromForm,
            readLlmMtModelFromForm,
            parseVramGbHint,
            recommendMtContext,
            recommendFormMtModel,
            shortMtModelChipLabel,
            readActiveEngineMtModelFromForm,
            isMtModelAutoSelected,
            listInstalledMtModelsForMode,
            listInstalledSmartTranslateModels,
            rebuildTranslateMenuMtSection,
            setTranslateMtPickMode,
            syncTranslateChipUi,
            syncTranslateModeChipUi,
            syncMtModelChipUi,
            ensureMtSelectAllowsEmpty,
            setQuickMtModel,
            setQuickPolishModel,
            setQuickTranslateMode,
            setExternalTranslateSource: (...a) => getExternalPick()?.setExternalTranslateSource?.(...a),
            selectExternalStationModel: (...a) => getExternalPick()?.selectExternalStationModel?.(...a),
            updateReadinessStrip,
            syncHybridSentenceMtMirror,
            syncPrimaryLlmMtFromHybridMirror,
            getLastMtByTargetState,
            setLastMtByTargetState,
            getPrevSubtitleTargetLangForMt,
            setPrevSubtitleTargetLangForMt,
            getTranslateMtManualBrowse,
            isSyncingTranslateMode,
        };
    }

    return { createTranslateModeUi };
}));
