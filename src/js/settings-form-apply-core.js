/**
 * Settings form apply / read: options → DOM and DOM → saved options object.
 * Shell injects DOM/state helpers via createSettingsFormApply(deps).
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSettingsFormApply = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function settingsFormApplyFactory(global) {
    /**
     * @param {object} deps shell adapters
     */
    function createSettingsFormApply(deps) {
        const d = deps || {};
        const els = d.els || {};
        const settingsNormApi = d.settingsNormApi || {};
        const savedOptionsApi = d.savedOptionsApi || settingsNormApi || {};
        const translateStyleApi = d.translateStyleApi || {};
        const externalImportApi = d.externalImportApi || {};
        const DEFAULT_AUDIO_SUFFIXES = d.DEFAULT_AUDIO_SUFFIXES || '';

        const stashTwaiLegacyFromOptions = d.stashTwaiLegacyFromOptions || (() => {});
        const ensureEngineInstallPathFilled = d.ensureEngineInstallPathFilled || (async () => {});
        const syncProxySettingsUi = d.syncProxySettingsUi || (() => {});
        const syncTransubStationSettingsUi = d.syncTransubStationSettingsUi || (() => {});
        const ensureSelectValue = d.ensureSelectValue || (() => {});
        const isLlmInferencePickModelId = d.isLlmInferencePickModelId || (() => false);
        const syncEngineBackendUi = d.syncEngineBackendUi || (() => {});
        const applyDualLineOrderToForm = d.applyDualLineOrderToForm || (() => {});
        const updateTranslateStyleUi = d.updateTranslateStyleUi || (() => {});
        const applySubFormatsToForm = d.applySubFormatsToForm || (() => {});
        const toQuickTargetLang = d.toQuickTargetLang || ((v) => v);
        const mtRouteApi = d.mtRouteApi || (() => ({}));
        const getTranslateModeUi = d.getTranslateModeUi || (() => null);
        const readSubtitleTargetLangFromForm = d.readSubtitleTargetLangFromForm || (() => '');
        const applyBurnSettingsToForm = d.applyBurnSettingsToForm || (() => {});
        const syncLogLevelHint = d.syncLogLevelHint || (() => {});
        const syncExpertExtraChipsUi = d.syncExpertExtraChipsUi || (() => {});
        const getAutoScanApi = d.getAutoScanApi || (() => ({}));
        const refreshAutoScanFoldersListUi = d.refreshAutoScanFoldersListUi || (() => {});
        const refreshSubtitleEditorPathHint = d.refreshSubtitleEditorPathHint || (async () => {});
        const setPostBatchQcFixMode = d.setPostBatchQcFixMode || (() => {});
        const applyActivePresetIdToSelect = d.applyActivePresetIdToSelect || (() => {});
        const syncQuickExtrasBar = d.syncQuickExtrasBar || (() => {});
        const normalizeViewingCleanMode = d.normalizeViewingCleanMode
            || ((value, fallback = 'clear') => {
                const v = String(value || '').trim().toLowerCase();
                if (v === 'off' || v === 'light' || v === 'clear') return v;
                return fallback;
            });
        const refreshPostBatchTextPresetSelect = d.refreshPostBatchTextPresetSelect || (async () => {});
        const syncDeviceOptionsForMode = d.syncDeviceOptionsForMode || (() => {});
        const syncBatchSizeUi = d.syncBatchSizeUi || (() => {});
        const syncExpertCustomHints = d.syncExpertCustomHints || (() => {});
        const syncTranslateModeFromOptions = d.syncTranslateModeFromOptions || (() => {});
        const applyMtTargetCapabilityToForm = d.applyMtTargetCapabilityToForm || (() => {});
        const syncChineseSubtitleVariantUi = d.syncChineseSubtitleVariantUi || (() => {});
        const refreshModelSelects = d.refreshModelSelects || (async () => {});
        const syncParamsModeChipUi = d.syncParamsModeChipUi || (() => {});
        const updateParamsSummary = d.updateParamsSummary || (() => {});
        const updateAsrWindowTip = d.updateAsrWindowTip || (() => {});
        const updateQwenAsrBatchHint = d.updateQwenAsrBatchHint || (async () => {});

        function syncOutputTrackNamingUi() {
            const writeTarget = els.outputWriteTargetCheck
                ? !!els.outputWriteTargetCheck.checked
                : true;
            const writeSource = els.outputWriteSourceCheck
                ? !!els.outputWriteSourceCheck.checked
                : true;
            if (!writeTarget && !writeSource && els.outputWriteTargetCheck) {
                els.outputWriteTargetCheck.checked = true;
            }
            const allowNaming = els.outputWriteTargetCheck
                ? !!els.outputWriteTargetCheck.checked
                : true;
            if (els.targetSubtitleNamingSelect) {
                els.targetSubtitleNamingSelect.disabled = !allowNaming;
            }
            els.targetSubtitleNamingWrap?.classList.toggle('opacity-50', !allowNaming);
            els.targetSubtitleNamingWrap?.classList.toggle('pointer-events-none', !allowNaming);
        }

        const readTaskFromForm = d.readTaskFromForm || (() => 'translate');
        const readTranslateModeFromForm = d.readTranslateModeFromForm || (() => 'engine');
        const readEngineBackendFromForm = d.readEngineBackendFromForm || (() => 'transub');
        const engineInstallPathForSave = d.engineInstallPathForSave || (() => '');
        const readLlmMtModelFromForm = d.readLlmMtModelFromForm || (() => '');
        const readDualLineOrderFromForm = d.readDualLineOrderFromForm || (() => 'target-first');
        const readSubFormatsFromForm = d.readSubFormatsFromForm || (() => []);
        const readModelPathFromForm = d.readModelPathFromForm || (() => '');
        const normalizeChineseSubtitleVariant = d.normalizeChineseSubtitleVariant || ((v) => v);
        const readTwaiLegacyOptions = d.readTwaiLegacyOptions || (() => ({}));
        const getActiveParamsPresetId = d.getActiveParamsPresetId || (() => '');
        const getActiveComboPlanId = d.getActiveComboPlanId || (() => '');
        const setActiveComboPlanId = d.setActiveComboPlanId || (() => {});
        const syncComboPlanChipFromOptions = d.syncComboPlanChipFromOptions || (() => {});
        const getPostBatchQcFixMode = d.getPostBatchQcFixMode || (() => 'smart');
        const resolveOutputDirFromForm = d.resolveOutputDirFromForm || (() => '');

        const getAdvancedEntitled = typeof d.getAdvancedEntitled === 'function'
            ? d.getAdvancedEntitled
            : () => !!d.advancedEntitled;
        const getSavedOptionsSnapshot = d.getSavedOptionsSnapshot || (() => null);
        const getMtUseFormState = d.getMtUseFormState
            || d.getMtUseForm
            || (() => false);
        const setMtUseFormState = d.setMtUseFormState
            || d.setMtUseForm
            || (() => {});
        const getAutoScanFoldersDraft = d.getAutoScanFoldersDraft || (() => []);
        const setAutoScanFoldersDraft = d.setAutoScanFoldersDraft || (() => {});
        let wizardContentTypesDraft = [];
        let wizardTargetLangsDraft = ['zh-Hans'];
        const getWizardContentTypesDraft = d.getWizardContentTypesDraft
            || (() => wizardContentTypesDraft.slice());
        const setWizardContentTypesDraft = d.setWizardContentTypesDraft
            || ((v) => {
                wizardContentTypesDraft = Array.isArray(v) ? v.slice() : [];
            });
        const getWizardTargetLangsDraft = d.getWizardTargetLangsDraft
            || (() => wizardTargetLangsDraft.slice());
        const setWizardTargetLangsDraft = d.setWizardTargetLangsDraft
            || ((v) => {
                wizardTargetLangsDraft = Array.isArray(v) && v.length ? v.slice() : ['zh-Hans'];
            });
        const setInsertSoftwareCreditIsDefault = d.setInsertSoftwareCreditIsDefault || (() => {});

        function readTwaiLegacyOptionsFromSnapshot() {
            return readTwaiLegacyOptions();
        }

        async function applyOptionsToForm(options = {}, { applyUiMode = true } = {}) {
            void applyUiMode;
            stashTwaiLegacyFromOptions(options);
            if (els.engineBackendSelect) {
                els.engineBackendSelect.value = options.engineBackend === 'twai' ? 'twai' : 'transub';
            }
            if (els.engineInstallPathInput && options.engineInstallPath != null) {
                els.engineInstallPathInput.value = options.engineInstallPath;
            }
            // Await bundled-path refill before any renderList (e.g. setAutoSenseEnabled),
            // otherwise empty-state env hint sticks after the banner is later hidden.
            await ensureEngineInstallPathFilled();
            if (els.engineUrlInput && options.engineUrl != null) {
                els.engineUrlInput.value = options.engineUrl;
            }
            if (els.engineHfEndpointInput && options.engineHfEndpoint != null) {
                els.engineHfEndpointInput.value = options.engineHfEndpoint;
            }
            if (els.engineHfTokenInput && options.engineHfToken != null) {
                els.engineHfTokenInput.value = options.engineHfToken;
            }
            if (els.proxyEnabledCheck) {
                els.proxyEnabledCheck.checked = !!options.proxyEnabled;
            }
            if (els.proxyUrlInput) {
                els.proxyUrlInput.value = options.proxyUrl != null ? options.proxyUrl : '';
            }
            if (els.proxyBypassInput) {
                els.proxyBypassInput.value = options.proxyBypass != null && String(options.proxyBypass).trim()
                    ? options.proxyBypass
                    : 'localhost,127.0.0.1,::1,<local>';
            }
            {
                const stationEnabledEl = (typeof document !== 'undefined'
                    ? document.getElementById('transubStationEnabledCheck')
                    : null)
                    || els.transubStationEnabledCheck;
                const stationUrlEl = (typeof document !== 'undefined'
                    ? document.getElementById('transubStationUrlInput')
                    : null)
                    || els.transubStationUrlInput;
                const stationModelEl = (typeof document !== 'undefined'
                    ? document.getElementById('transubStationModelInput')
                    : null)
                    || els.transubStationModelInput;
                if (stationEnabledEl) {
                    els.transubStationEnabledCheck = stationEnabledEl;
                    stationEnabledEl.checked = !!options.transubStationEnabled;
                }
                if (stationUrlEl) {
                    els.transubStationUrlInput = stationUrlEl;
                    stationUrlEl.value = options.transubStationUrl != null
                        && String(options.transubStationUrl).trim()
                        ? String(options.transubStationUrl).trim()
                        : 'http://127.0.0.1:8787';
                }
                if (stationModelEl) {
                    els.transubStationModelInput = stationModelEl;
                    stationModelEl.value = String(options.transubStationModel || '').trim();
                }
            }
            syncTransubStationSettingsUi();
            if (els.githubMirrorsInput) {
                const list = Array.isArray(options.githubMirrorUrls)
                    ? options.githubMirrorUrls
                    : (options.githubMirrorUrls != null
                        ? String(options.githubMirrorUrls).split(/\r?\n/)
                        : ['https://g.blfrp.cn/', 'https://gh-proxy.com/', 'https://gh.nxnow.top/', 'https://ghproxy.net/']);
                els.githubMirrorsInput.value = list
                    .map((u) => String(u || '').trim())
                    .filter(Boolean)
                    .join('\n');
            }
            syncProxySettingsUi();
            if (els.engineProfileSelect && options.engineProfile) {
                els.engineProfileSelect.value = options.engineProfile;
            }
            if (els.engineAsrModelSelect && options.engineAsrModel) {
                ensureSelectValue(els.engineAsrModelSelect, options.engineAsrModel, {
                    label: `${options.engineAsrModel}`,
                });
            }
            {
                const activeMt = options.engineMtModel != null ? String(options.engineMtModel || '') : '';
                const activeIsLlm = isLlmInferencePickModelId(activeMt)
                    && !/^opus[-_]?mt/i.test(activeMt);
                const llmMt = options.engineLlmMtModel != null
                    ? String(options.engineLlmMtModel || '')
                    : (activeIsLlm ? activeMt : '');
                if (els.engineMtModelSelect) els.engineMtModelSelect.value = '';
                ensureSelectValue(els.engineLlmMtModelSelect, llmMt, {
                    label: llmMt ? `${llmMt}` : '',
                    allowEmpty: true,
                });
            }
            if (els.engineVadModelSelect && options.engineVadModel) {
                ensureSelectValue(els.engineVadModelSelect, options.engineVadModel, {
                    label: `${options.engineVadModel}`,
                });
            }
            if (els.engineAutoStartCheck) {
                els.engineAutoStartCheck.checked = options.engineAutoStart !== false;
            }
            syncEngineBackendUi();
            if (els.installPathInput && options.installPath) {
                els.installPathInput.value = options.installPath;
            }
            if (els.deviceSelect && options.device) {
                els.deviceSelect.value = options.device;
            }
            if (els.taskSelect) {
                const task = options.task === 'transcribe' || options.task === 'dual'
                    ? options.task
                    : 'translate';
                els.taskSelect.value = task;
            }
            if (els.overwriteCheck) {
                els.overwriteCheck.checked = !!options.overwrite;
            }
            if (els.outputWriteTargetCheck) {
                els.outputWriteTargetCheck.checked = options.outputWriteTarget !== false;
            }
            if (els.outputWriteSourceCheck) {
                els.outputWriteSourceCheck.checked = options.outputWriteSource !== false;
            }
            if (els.targetSubtitleNamingSelect) {
                const naming = String(options.targetSubtitleNaming || 'lang').trim().toLowerCase();
                els.targetSubtitleNamingSelect.value = naming === 'media' ? 'media' : 'lang';
            }
            syncOutputTrackNamingUi();
            if (els.mergeBilingualCheck) {
                els.mergeBilingualCheck.checked = !!options.mergeBilingualSubtitles;
            }
            if (els.insertSoftwareCreditCheck) {
                els.insertSoftwareCreditCheck.checked = options.insertSoftwareCredit !== false;
            }
            setInsertSoftwareCreditIsDefault(!!options.insertSoftwareCreditIsDefault);
            applyDualLineOrderToForm(options.dualLineOrder || 'target-first');
            if (els.smartTranslateCheck) {
                els.smartTranslateCheck.checked = !!options.smartTranslate;
            }
            if (els.smartTranslateFaithfulCheck) {
                const task = options.task === 'transcribe' || options.task === 'dual'
                    ? options.task
                    : 'translate';
                els.smartTranslateFaithfulCheck.checked = (task === 'translate' || task === 'dual')
                    && !!options.smartTranslateFaithfulTone;
            }
            if (els.translateStyleEnabledCheck) {
                const enabledNorm = translateStyleApi.normalizeTranslateStyleEnabled;
                const enabled = typeof enabledNorm === 'function'
                    ? !!enabledNorm(options.translateStyleEnabled)
                    : !!(options.translateStyleEnabled === true
                        || options.translateStyleEnabled === 1
                        || options.translateStyleEnabled === '1'
                        || options.translateStyleEnabled === 'true'
                        || options.translateStyleEnabled === 'on');
                if (typeof d.setTranslateStyleEnabledState === 'function') {
                    d.setTranslateStyleEnabledState(enabled, { syncDom: true, fromRemote: true });
                } else {
                    els.translateStyleEnabledCheck.checked = enabled;
                }
            } else if (typeof d.setTranslateStyleEnabledState === 'function') {
                const enabledNorm = translateStyleApi.normalizeTranslateStyleEnabled;
                const enabled = typeof enabledNorm === 'function'
                    ? !!enabledNorm(options.translateStyleEnabled)
                    : !!options.translateStyleEnabled;
                d.setTranslateStyleEnabledState(enabled, { syncDom: true, fromRemote: true });
            }
            if (els.translateStylePresetSelect) {
                const preset = translateStyleApi.normalizeTranslateStylePreset?.(
                    options.translateStylePreset,
                    { entitled: getAdvancedEntitled() },
                ) || options.translateStylePreset || 'natural_spoken';
                els.translateStylePresetSelect.value = preset;
            }
            if (els.translateStyleCustomNoteInput) {
                els.translateStyleCustomNoteInput.value = String(options.translateStyleCustomNote || '');
            }
            if (els.translateStyleMenuCustomNote) {
                els.translateStyleMenuCustomNote.value = String(options.translateStyleCustomNote || '');
            }
            updateTranslateStyleUi();
            if (els.smartTranslateHybridCheck) {
                // Pro 智能翻译 always prefers sentence MT; capability sync may uncheck for display.
                els.smartTranslateHybridCheck.checked = true;
            }
            if (els.smartTranslatePolishCheck) {
                els.smartTranslatePolishCheck.checked = options.smartTranslatePlotPolish !== false;
            }
            if (els.smartTranslateVerifyCheck) {
                els.smartTranslateVerifyCheck.checked = options.smartTranslateFaithfulVerify !== false;
            }
            if (els.smartTranslateAddressCheck) {
                els.smartTranslateAddressCheck.checked = options.smartTranslateAddressConsistency !== false;
            }
            if (els.smartTranslatePolishLimitInput) {
                const lim = Number(options.smartTranslatePolishSampleLimit);
                els.smartTranslatePolishLimitInput.value = String(
                    Number.isFinite(lim) ? Math.max(4, Math.min(36, Math.round(lim))) : 36,
                );
            }
            if (els.asrSecondOpinionSelect) {
                const mode = settingsNormApi.normalizeAsrSecondOpinion
                    ? settingsNormApi.normalizeAsrSecondOpinion(options.asrSecondOpinion)
                    : (String(options.asrSecondOpinion || 'auto').toLowerCase() === 'off' ? 'off'
                        : (String(options.asrSecondOpinion || '').toLowerCase() === 'on' ? 'on' : 'auto'));
                els.asrSecondOpinionSelect.value = mode;
            }
            if (els.qualityPipelineModeSelect) {
                const mode = settingsNormApi.normalizeQualityPipelineMode
                    ? settingsNormApi.normalizeQualityPipelineMode(options.qualityPipelineMode)
                    : (String(options.qualityPipelineMode || 'auto').toLowerCase() === 'off' ? 'off'
                        : (String(options.qualityPipelineMode || '').toLowerCase() === 'on' ? 'on' : 'auto'));
                els.qualityPipelineModeSelect.value = mode;
            }
            if (els.postQcLoopMaxPassesInput) {
                const n = settingsNormApi.clampPostQcLoopMaxPasses
                    ? settingsNormApi.clampPostQcLoopMaxPasses(options.postQcLoopMaxPasses)
                    : Math.max(0, Math.min(2, Math.round(Number(options.postQcLoopMaxPasses) || 1)));
                els.postQcLoopMaxPassesInput.value = String(n);
            }
            if (els.asrBadPoolDraftsCheck) {
                els.asrBadPoolDraftsCheck.checked = options.asrBadPoolDrafts !== false;
            }
            if (els.asrSemanticRepairSelect) {
                const mode = settingsNormApi.normalizeAsrSemanticRepair
                    ? settingsNormApi.normalizeAsrSemanticRepair(options.asrSemanticRepair)
                    : (String(options.asrSemanticRepair || 'auto').toLowerCase() === 'off' ? 'off'
                        : (String(options.asrSemanticRepair || '').toLowerCase() === 'thorough' ? 'thorough' : 'auto'));
                els.asrSemanticRepairSelect.value = mode;
            }
            {
                const briefSel = document.getElementById('reconstructBriefSampleModeSelect')
                    || els.reconstructBriefSampleModeSelect;
                const mode = options.filmBriefSampleMode === 'full' ? 'full' : 'auto';
                if (briefSel) briefSel.value = mode;
                // Keep localStorage reconstruct prefs aligned (main window UI); editor reads options via IPC.
                try {
                    const key = 'transub-editor-reconstruct-prefs';
                    const raw = JSON.parse(localStorage.getItem(key) || '{}') || {};
                    if (raw.briefSampleMode !== mode) {
                        raw.briefSampleMode = mode;
                        localStorage.setItem(key, JSON.stringify(raw));
                    }
                } catch (_) { /* ignore */ }
            }
            if (els.filmAudioEnhanceCheck) {
                els.filmAudioEnhanceCheck.checked = !!options.filmAudioEnhance;
            }
            if (els.filmVadPresetCheck) {
                els.filmVadPresetCheck.checked = !!options.filmVadPreset && !options.filmAudioEnhance;
            }
            const setOptNum = (el, value) => {
                if (!el) return;
                el.value = value == null || value === '' ? '' : String(value);
            };
            setOptNum(els.filmVadThresholdInput, options.filmVadThreshold);
            setOptNum(els.filmVadMinSpeechInput, options.filmVadMinSpeechDurationMs);
            setOptNum(els.filmVadMinSilenceInput, options.filmVadMinSilenceDurationMs);
            setOptNum(els.filmHallucinationSilenceInput, options.filmHallucinationSilenceThreshold);
            if (els.qcSmartLlmSplitCheck) {
                els.qcSmartLlmSplitCheck.checked = options.qcSmartLlmSplit !== false;
            }
            if (els.qcSmartRetranscribeCheck) {
                els.qcSmartRetranscribeCheck.checked = options.qcSmartRetranscribe !== false;
            }
            if (els.qcSmartSemanticReviewCheck) {
                els.qcSmartSemanticReviewCheck.checked = options.qcSmartSemanticReview !== false;
            }
            if (els.qcSmartIntensitySelect) {
                const v = String(options.qcSmartIntensity || 'light').toLowerCase();
                els.qcSmartIntensitySelect.value = (v === 'medium' || v === 'strong') ? v : 'light';
            }
            if (els.qcSmartMaxRetranscribeInput) {
                const n = Number(options.qcSmartMaxRetranscribeRanges);
                els.qcSmartMaxRetranscribeInput.value = String(
                    Number.isFinite(n) ? Math.max(1, Math.min(24, Math.round(n))) : 8,
                );
            }
            if (els.deleteSourcesAfterMergeCheck) {
                els.deleteSourcesAfterMergeCheck.checked = !!options.mergeBilingualSubtitles
                    && !!options.deleteSourcesAfterMergeBilingual;
            }
            applySubFormatsToForm(options.subFormats);
            if (els.releaseGpuAfterCheck) {
                // null = auto (unchecked in UI means use default sakura/smart behavior)
                els.releaseGpuAfterCheck.checked = options.releaseGpuAfter === true;
            }
            if (els.autoCpuOnGpuBusyCheck) {
                els.autoCpuOnGpuBusyCheck.checked = !!options.autoCpuOnGpuBusy;
            }
            if (els.chineseSubtitleVariantSelect) {
                const tgtApi = window.TransubSubtitleTargetLang;
                const formFromTarget = options.subtitleTargetLang && tgtApi?.formValueFromTargetLang
                    ? tgtApi.formValueFromTargetLang(options.subtitleTargetLang)
                    : '';
                const cv = String(formFromTarget || options.chineseSubtitleVariant || 'simplified');
                const allowed = new Set([
                    'simplified', 'traditional', 'traditional-tw', 'traditional-hk',
                    'en', 'ja', 'ko',
                ]);
                const next = allowed.has(cv) ? cv : 'simplified';
                els.chineseSubtitleVariantSelect.value = next;
                if (els.quickTargetLangSelect) els.quickTargetLangSelect.value = toQuickTargetLang(next);
            }
            if (options.lastMtByTarget && mtRouteApi().normalizeLastMtByTarget) {
                getTranslateModeUi()?.setLastMtByTargetState?.(
                    mtRouteApi().normalizeLastMtByTarget(options.lastMtByTarget),
                );
            }
            getTranslateModeUi()?.setPrevSubtitleTargetLangForMt?.(readSubtitleTargetLangFromForm());
            if (els.glossaryMtCheck) {
                els.glossaryMtCheck.checked = !!options.glossaryMtEnabled;
            }
            if (els.glossaryPromptCheck) {
                els.glossaryPromptCheck.checked = options.glossaryPromptEnabled !== false;
            }
            if (els.outputModeSelect) {
                els.outputModeSelect.value = options.outputMode === 'custom' || options.outputDir ? 'custom' : 'same';
            }
            if (els.outputDirInput && options.outputDir != null) {
                els.outputDirInput.value = options.outputDir;
            }
            if (els.audioSuffixesInput && options.audioSuffixes) {
                els.audioSuffixesInput.value = options.audioSuffixes;
            }
            if (els.ffmpegPathInput && options.ffmpegPath != null) {
                els.ffmpegPathInput.value = options.ffmpegPath;
            }
            applyBurnSettingsToForm(options);
            els.outputDirWrap?.classList.toggle('hidden', (els.outputModeSelect?.value || 'same') !== 'custom');
            if (els.logLevelSelect && options.logLevel) {
                els.logLevelSelect.value = String(options.logLevel).toUpperCase();
            }
            syncLogLevelHint();
            if (els.maxBatchSizeInput && options.maxBatchSize != null) {
                els.maxBatchSizeInput.value = String(options.maxBatchSize);
            }
            if (els.languageSelect && options.language) {
                const lang = String(options.language).trim().toLowerCase();
                const supported = ['auto', 'ja', 'zh', 'yue', 'ko', 'en'];
                // Ignore exotic tags (nn/de/…) so the form never sticks on garbage ISO codes.
                if (supported.includes(lang)
                    && [...els.languageSelect.options].some((o) => o.value === lang)) {
                    els.languageSelect.value = lang;
                }
            }
            if (els.beamSizeInput && options.beamSize != null) {
                els.beamSizeInput.value = String(options.beamSize);
            }
            if (els.vadEnabledCheck) {
                els.vadEnabledCheck.checked = options.vadEnabled !== false;
            }
            if (els.vadSensitiveCheck) {
                els.vadSensitiveCheck.checked = !!options.vadSensitive;
            }
            if (els.vadThresholdInput && options.vadThreshold != null) {
                els.vadThresholdInput.value = String(options.vadThreshold);
            }
            if (els.vadMinSpeechDurationInput && options.vadMinSpeechDurationMs != null) {
                els.vadMinSpeechDurationInput.value = String(options.vadMinSpeechDurationMs);
            }
            if (els.vadMinSilenceDurationInput && options.vadMinSilenceDurationMs != null) {
                els.vadMinSilenceDurationInput.value = String(options.vadMinSilenceDurationMs);
            }
            if (els.vadSpeechPadInput && options.vadSpeechPadMs != null) {
                els.vadSpeechPadInput.value = String(options.vadSpeechPadMs);
            }
            if (els.vadMaxSingleSegmentInput) {
                let maxSeg = options.vadMaxSingleSegmentMs;
                if (maxSeg == null && options.targetChunkDurationS != null) {
                    const sec = Number(options.targetChunkDurationS);
                    if (Number.isFinite(sec) && sec > 0) maxSeg = Math.round(sec * 1000);
                }
                if (maxSeg != null) els.vadMaxSingleSegmentInput.value = String(maxSeg);
            }
            if (els.hallucinationSilenceInput) {
                const hallu = options.hallucinationSilenceThreshold;
                els.hallucinationSilenceInput.value = (hallu != null && hallu !== '' && Number(hallu) > 0)
                    ? String(hallu)
                    : '';
            }
            if (els.vadAggressiveCheck) {
                els.vadAggressiveCheck.checked = !!options.vadAggressive && !options.vadSensitive;
            }
            if (els.audioLightDenoiseCheck) {
                els.audioLightDenoiseCheck.checked = !!options.audioLightDenoise;
            }
            if (els.perfProfileSelect) {
                els.perfProfileSelect.value = String(options.perfProfile || 'quality') === 'speed'
                    ? 'speed'
                    : 'quality';
            }
            if (els.qwenAsrBatchModeSelect) {
                const qwenBatch = (typeof TransubQwenAsrBatch !== 'undefined' && TransubQwenAsrBatch.normalizeQwenAsrBatchMode)
                    ? TransubQwenAsrBatch.normalizeQwenAsrBatchMode(options.qwenAsrBatchMode)
                    : (() => {
                        const v = String(options.qwenAsrBatchMode || 'auto').trim().toLowerCase();
                        if (v === 'conservative' || v === 'aggressive') return v;
                        return 'auto';
                    })();
                els.qwenAsrBatchModeSelect.value = qwenBatch;
            }
            syncExpertExtraChipsUi();
            if (els.retranscribeWarmLightCheck) {
                els.retranscribeWarmLightCheck.checked = !!options.retranscribeWarmLight;
            }
            if (els.subtitleBakModeSelect) {
                const bakMode = String(options.subtitleBakMode || 'off').trim();
                els.subtitleBakModeSelect.value = ['off', 'beside', 'appBackup'].includes(bakMode)
                    ? bakMode
                    : 'off';
            }
            if (els.transcriptKeepDirInput && options.transcriptKeepDir != null) {
                els.transcriptKeepDirInput.value = options.transcriptKeepDir;
            }
            if (els.shelfOpenAfterBatchCheck) {
                els.shelfOpenAfterBatchCheck.checked = !!options.shelfOpenAfterBatch;
            }
            if (els.trayProgressCheck) {
                els.trayProgressCheck.checked = !!options.trayProgressEnabled;
            }
            if (els.showTaskResourceUsageCheck) {
                els.showTaskResourceUsageCheck.checked = options.showTaskResourceUsage !== false;
            }
            if (els.rememberLastOpenDirCheck) {
                els.rememberLastOpenDirCheck.checked = options.rememberLastOpenDir !== false;
            }
            {
                const api = getAutoScanApi();
                setAutoScanFoldersDraft(api.normalizeAutoScanFolders
                    ? api.normalizeAutoScanFolders(options.autoScanFolders)
                    : (Array.isArray(options.autoScanFolders) ? options.autoScanFolders.slice() : []));
                refreshAutoScanFoldersListUi();
                if (els.autoScanRecursiveCheck) {
                    els.autoScanRecursiveCheck.checked = options.autoScanRecursive !== false;
                }
            }
            {
                const norm = settingsNormApi;
                setWizardContentTypesDraft(norm.normalizeWizardContentTypes
                    ? norm.normalizeWizardContentTypes(options.wizardPresetIds || options.wizardContentTypes)
                    : (Array.isArray(options.wizardPresetIds) ? options.wizardPresetIds.slice()
                        : (Array.isArray(options.wizardContentTypes) ? options.wizardContentTypes.slice() : [])));
                setWizardTargetLangsDraft(norm.normalizeWizardTargetLangs
                    ? norm.normalizeWizardTargetLangs(options.wizardTargetLangs)
                    : (Array.isArray(options.wizardTargetLangs) && options.wizardTargetLangs.length
                        ? options.wizardTargetLangs.slice()
                        : ['zh-Hans']));
            }
            if (els.minimizeToTrayCheck) {
                els.minimizeToTrayCheck.checked = options.minimizeToTrayEnabled !== false;
            }
            if (els.minimizeToTrayOnStartCheck) {
                els.minimizeToTrayOnStartCheck.checked = !!options.minimizeToTrayOnStart;
            }
            if (els.trayNotifyCheck) {
                els.trayNotifyCheck.checked = !!options.trayNotifyEnabled;
            }
            if (els.startupWindowSelect) {
                const startup = String(options.startupWindow || '').trim().toLowerCase();
                els.startupWindowSelect.value = (startup === 'editor' || startup === 'subtitle-editor')
                    ? 'editor'
                    : 'generator';
            }
            if (els.subtitleEditorBackendSelect) {
                const backend = String(options.subtitleEditorBackend || '').trim().toLowerCase();
                if (backend === 'external') els.subtitleEditorBackendSelect.value = 'external';
                else if (backend === 'auto') els.subtitleEditorBackendSelect.value = 'auto';
                else els.subtitleEditorBackendSelect.value = 'electron';
            }
            if (els.subtitleEditorPathInput && options.subtitleEditorPath != null) {
                els.subtitleEditorPathInput.value = String(options.subtitleEditorPath || '');
            }
            void refreshSubtitleEditorPathHint();
            if (els.uiLocaleSelect) {
                const nextLocale = (window.TransubI18n?.normalizeUiLocale
                    || ((v) => String(v || '').trim() || 'zh-Hans'))(
                    options.uiLocale,
                );
                window.TransubI18n?.fillUiLocaleSelect?.(els.uiLocaleSelect, { selected: nextLocale });
                els.uiLocaleSelect.value = nextLocale;
                await window.TransubI18n?.setLocale?.(nextLocale, { apply: true, persist: true });
            }
            if (els.autoUpdateCheckIntervalSelect) {
                const interval = String(options.autoUpdateCheckInterval || 'weekly').trim().toLowerCase();
                els.autoUpdateCheckIntervalSelect.value = ['off', 'daily', 'weekly', 'monthly'].includes(interval)
                    ? interval
                    : 'weekly';
            }
            if (els.postBatchQcCheck) {
                els.postBatchQcCheck.checked = options.postBatchQc !== false;
            }
            void setPostBatchQcFixMode(options.postBatchQcFixMode || 'smart', { persist: false });
            if (els.externalImportActionSelect) {
                els.externalImportActionSelect.value = externalImportApi.normalizeExternalImportAction
                    ? externalImportApi.normalizeExternalImportAction(options.externalImportAction)
                    : (options.externalImportAction || externalImportApi.DEFAULT_EXTERNAL_IMPORT_ACTION || 'list_when_idle');
            }
            setMtUseFormState(!!options.mtUseForm);
            if (Object.prototype.hasOwnProperty.call(options, 'activePresetId')) {
                applyActivePresetIdToSelect(options.activePresetId || '');
            }
            if (Object.prototype.hasOwnProperty.call(options, 'activeComboPlanId')) {
                setActiveComboPlanId(options.activeComboPlanId || '');
                syncComboPlanChipFromOptions(options);
            }
            syncQuickExtrasBar();
            if (els.postBatchCpsSplitCheck) {
                els.postBatchCpsSplitCheck.checked = options.postBatchCpsSplit !== false;
            }
            if (els.qcSilenceSplitCharsInput) {
                const n = Number(options.qcSilenceSplitChars);
                els.qcSilenceSplitCharsInput.value = String(
                    Number.isFinite(n) ? Math.max(0, Math.min(500, Math.round(n))) : 15,
                );
            }
            if (els.postBatchRemoveNoiseCheck) {
                els.postBatchRemoveNoiseCheck.checked = options.postBatchRemoveNoise !== false;
            }
            if (els.postBatchCompressRepCheck) {
                els.postBatchCompressRepCheck.checked = options.postBatchCompressRepetition !== false;
            }
            if (els.postBatchViewingPunctModeSelect) {
                els.postBatchViewingPunctModeSelect.value = normalizeViewingCleanMode(
                    options.postBatchViewingPunctMode,
                    options.postBatchSimplifyViewingPunctuation === false ? 'off' : 'clear',
                );
            }
            if (els.postBatchInterjectionModeSelect) {
                els.postBatchInterjectionModeSelect.value = normalizeViewingCleanMode(
                    options.postBatchInterjectionMode,
                    options.postBatchCompactPureInterjections === false ? 'off' : 'clear',
                );
            }
            if (els.postBatchOnomatopoeiaModeSelect) {
                els.postBatchOnomatopoeiaModeSelect.value = normalizeViewingCleanMode(
                    options.postBatchOnomatopoeiaMode,
                    options.postBatchCompactPureInterjections === false ? 'off' : 'clear',
                );
            }
            await refreshPostBatchTextPresetSelect(options.postBatchTextPresetGroupId || '');
            syncDeviceOptionsForMode();
            syncBatchSizeUi();
            syncExpertCustomHints();
            // Apply 翻译方式 from options BEFORE Chinese-variant / smart-UI sync, which
            // re-reads radios (HTML default is 机器翻译) and would otherwise clobber llm/smart.
            syncTranslateModeFromOptions(options);
            applyMtTargetCapabilityToForm({ toast: false, refreshSelect: false });
            syncChineseSubtitleVariantUi();
            void refreshModelSelects(options);
            syncExpertExtraChipsUi();
            syncParamsModeChipUi();
            updateParamsSummary();
            updateAsrWindowTip();
            void updateQwenAsrBatchHint();
        }

        function buildSavedOptionsFromForm() {
            const task = readTaskFromForm();
            const translateMode = readTranslateModeFromForm();
            const viewingPunct = els.postBatchViewingPunctModeSelect
                ? normalizeViewingCleanMode(els.postBatchViewingPunctModeSelect.value, 'clear')
                : 'clear';
            const viewingInterj = els.postBatchInterjectionModeSelect
                ? normalizeViewingCleanMode(els.postBatchInterjectionModeSelect.value, 'clear')
                : 'clear';
            const viewingOnomato = els.postBatchOnomatopoeiaModeSelect
                ? normalizeViewingCleanMode(els.postBatchOnomatopoeiaModeSelect.value, 'clear')
                : 'clear';
            const assemble = savedOptionsApi.assembleSavedOptionsFromFields
                || settingsNormApi.assembleSavedOptionsFromFields;
            if (!assemble) {
                throw new Error('settings-saved-options-core 未加载，无法保存设置');
            }
            const built = assemble({
                    engineBackend: readEngineBackendFromForm(),
                    engineInstallPath: engineInstallPathForSave(),
                    engineUrl: els.engineUrlInput?.value.trim() || 'http://127.0.0.1:8765',
                    engineHfEndpoint: els.engineHfEndpointInput?.value?.trim() ?? 'https://hf-mirror.com',
                    engineHfToken: els.engineHfTokenInput?.value?.trim() ?? '',
                    proxyEnabled: !!els.proxyEnabledCheck?.checked,
                    proxyUrl: els.proxyUrlInput?.value?.trim() || '',
                    proxyBypass: els.proxyBypassInput?.value?.trim() || '',
                    transubStationEnabled: !!(
                        (typeof document !== 'undefined'
                            ? document.getElementById('transubStationEnabledCheck')
                            : null)
                        || els.transubStationEnabledCheck
                    )?.checked,
                    transubStationUrl: String(
                        ((typeof document !== 'undefined'
                            ? document.getElementById('transubStationUrlInput')
                            : null)
                            || els.transubStationUrlInput
                        )?.value || '',
                    ).trim() || 'http://127.0.0.1:8787',
                    transubStationModel: String(
                        ((typeof document !== 'undefined'
                            ? document.getElementById('transubStationModelInput')
                            : null)
                            || els.transubStationModelInput
                        )?.value || '',
                    ).trim(),
                    githubMirrorsText: els.githubMirrorsInput?.value ?? '',
                    engineProfile: els.engineProfileSelect?.value || 'balanced',
                    engineAsrModel: els.engineAsrModelSelect?.value || 'sensevoice-small',
                    engineOpusMtModel: '',
                    engineLlmMtModel: readLlmMtModelFromForm(),
                    translateMode,
                    engineVadModel: els.engineVadModelSelect?.value || 'fsmn-vad',
                    engineAutoStart: els.engineAutoStartCheck ? !!els.engineAutoStartCheck.checked : true,
                    // TWAI path UI removed; keep snapshot so old twai configs are not wiped on save.
                    // Same for ffmpegPath / maxBatchSize (UI removed; whitelist keys stay for now).
                    installPath: els.installPathInput
                        ? (els.installPathInput.value.trim() || '')
                        : String(getSavedOptionsSnapshot()?.installPath || '').trim(),
                    device: els.deviceSelect?.value || 'cuda',
                    task,
                    overwrite: !!els.overwriteCheck?.checked,
                    outputWriteTarget: els.outputWriteTargetCheck
                        ? !!els.outputWriteTargetCheck.checked
                        : true,
                    outputWriteSource: els.outputWriteSourceCheck
                        ? !!els.outputWriteSourceCheck.checked
                        : true,
                    targetSubtitleNaming: els.targetSubtitleNamingSelect?.value || 'lang',
                    mergeBilingualSubtitles: !!els.mergeBilingualCheck?.checked,
                    insertSoftwareCredit: els.insertSoftwareCreditCheck
                        ? !!els.insertSoftwareCreditCheck.checked
                        : true,
                    dualLineOrder: readDualLineOrderFromForm(),
                    smartTranslate: !!els.smartTranslateCheck?.checked,
                    smartTranslateFaithfulTone: !!els.smartTranslateFaithfulCheck?.checked,
                    translateStyleEnabled: typeof d.getTranslateStyleEnabled === 'function'
                        ? !!d.getTranslateStyleEnabled()
                        : !!els.translateStyleEnabledCheck?.checked,
                    translateStylePreset: els.translateStylePresetSelect?.value || 'natural_spoken',
                    translateStyleCustomNote: els.translateStyleCustomNoteInput?.value || '',
                    // Hybrid sentence MT is the Pro 智能翻译 path (not a user toggle).
                    // Persist preference on; runtime / capability may still skip JA→ZH-incompatible jobs.
                    smartTranslateHybridMt: true,
                    smartTranslatePlotPolish: els.smartTranslatePolishCheck
                        ? !!els.smartTranslatePolishCheck.checked
                        : true,
                    smartTranslateFaithfulVerify: els.smartTranslateVerifyCheck
                        ? !!els.smartTranslateVerifyCheck.checked
                        : true,
                    smartTranslateAddressConsistency: els.smartTranslateAddressCheck
                        ? !!els.smartTranslateAddressCheck.checked
                        : true,
                    smartTranslatePolishSampleLimitRaw: els.smartTranslatePolishLimitInput?.value,
                    asrSecondOpinion: els.asrSecondOpinionSelect?.value || 'auto',
                    qualityPipelineMode: els.qualityPipelineModeSelect?.value || 'auto',
                    postQcLoopMaxPassesRaw: els.postQcLoopMaxPassesInput?.value,
                    asrBadPoolDrafts: els.asrBadPoolDraftsCheck ? !!els.asrBadPoolDraftsCheck.checked : true,
                    asrSemanticRepair: els.asrSemanticRepairSelect?.value || 'auto',
                    filmBriefSampleMode: document.getElementById('reconstructBriefSampleModeSelect')?.value
                        || els.reconstructBriefSampleModeSelect?.value,
                    advancedEntitled: getAdvancedEntitled(),
                    filmAudioEnhance: !!els.filmAudioEnhanceCheck?.checked,
                    filmVadPreset: !!els.filmVadPresetCheck?.checked,
                    filmVadThresholdRaw: els.filmVadThresholdInput?.value,
                    filmVadMinSpeechDurationMsRaw: els.filmVadMinSpeechInput?.value,
                    filmVadMinSilenceDurationMsRaw: els.filmVadMinSilenceInput?.value,
                    filmHallucinationSilenceThresholdRaw: els.filmHallucinationSilenceInput?.value,
                    qcSmartLlmSplit: els.qcSmartLlmSplitCheck ? !!els.qcSmartLlmSplitCheck.checked : true,
                    qcSmartRetranscribe: els.qcSmartRetranscribeCheck
                        ? !!els.qcSmartRetranscribeCheck.checked
                        : true,
                    qcSmartSemanticReview: els.qcSmartSemanticReviewCheck
                        ? !!els.qcSmartSemanticReviewCheck.checked
                        : true,
                    qcSmartIntensity: els.qcSmartIntensitySelect?.value || 'light',
                    qcSmartMaxRetranscribeRangesRaw: els.qcSmartMaxRetranscribeInput?.value,
                    deleteSourcesAfterMergeBilingual: !!els.deleteSourcesAfterMergeCheck?.checked,
                    subFormats: readSubFormatsFromForm(),
                    releaseGpuAfter: els.releaseGpuAfterCheck?.checked ? true : null,
                    autoCpuOnGpuBusy: !!els.autoCpuOnGpuBusyCheck?.checked,
                    modelPath: readModelPathFromForm('translate') || readModelPathFromForm('transcribe') || '',
                    transcribeModelPath: readModelPathFromForm('transcribe'),
                    translateModelPath: readModelPathFromForm('translate'),
                    chineseSubtitleVariant: (() => {
                        const form = settingsNormApi.normalizeSubtitleTargetFormValue
                            ? settingsNormApi.normalizeSubtitleTargetFormValue(
                                els.chineseSubtitleVariantSelect?.value || 'simplified',
                            )
                            : String(els.chineseSubtitleVariantSelect?.value || 'simplified');
                        if (form === 'en' || form === 'ja' || form === 'ko') return 'simplified';
                        return normalizeChineseSubtitleVariant(form);
                    })(),
                    subtitleTargetForm: settingsNormApi.normalizeSubtitleTargetFormValue
                        ? settingsNormApi.normalizeSubtitleTargetFormValue(
                            els.chineseSubtitleVariantSelect?.value
                            || els.quickTargetLangSelect?.value
                            || 'simplified',
                        )
                        : String(els.chineseSubtitleVariantSelect?.value || 'simplified'),
                    subtitleTargetLang: settingsNormApi.normalizeSubtitleTargetLang
                        ? settingsNormApi.normalizeSubtitleTargetLang(
                            els.chineseSubtitleVariantSelect?.value
                            || els.quickTargetLangSelect?.value
                            || 'simplified',
                            els.chineseSubtitleVariantSelect?.value || 'simplified',
                        )
                        : 'zh-Hans',
                    lastMtByTarget: mtRouteApi().normalizeLastMtByTarget
                        ? mtRouteApi().normalizeLastMtByTarget(
                            getTranslateModeUi()?.getLastMtByTargetState?.() || {},
                        )
                        : (getTranslateModeUi()?.getLastMtByTargetState?.() || {}),
                    glossaryMtEnabled: els.glossaryMtCheck
                        ? !!els.glossaryMtCheck.checked
                        : !!els.quickGlossaryMtCheck?.checked,
                    glossaryPromptEnabled: els.glossaryPromptCheck ? !!els.glossaryPromptCheck.checked : true,
                    logLevel: els.logLevelSelect?.value || 'DEBUG',
                    maxBatchSize: Number(els.maxBatchSizeInput?.value) || 8,
                    language: els.languageSelect?.value || 'auto',
                    beamSize: Number(els.beamSizeInput?.value) || 5,
                    vadEnabled: els.vadEnabledCheck ? !!els.vadEnabledCheck.checked : true,
                    vadSensitive: !!els.vadSensitiveCheck?.checked,
                    vadThreshold: els.vadThresholdInput?.value,
                    vadMinSpeechDurationMs: els.vadMinSpeechDurationInput?.value,
                    vadMinSilenceDurationMs: els.vadMinSilenceDurationInput?.value,
                    vadSpeechPadMs: els.vadSpeechPadInput?.value,
                    vadMaxSingleSegmentMsRaw: els.vadMaxSingleSegmentInput?.value,
                    vadAggressive: !!els.vadAggressiveCheck?.checked,
                    audioLightDenoise: !!els.audioLightDenoiseCheck?.checked,
                    perfProfile: els.perfProfileSelect?.value || 'quality',
                    qwenAsrBatchMode: els.qwenAsrBatchModeSelect?.value || 'auto',
                    twaiLegacy: readTwaiLegacyOptionsFromSnapshot(),
                    hallucinationSilenceThresholdRaw: els.hallucinationSilenceInput?.value,
                    retranscribeWarmLight: !!els.retranscribeWarmLightCheck?.checked,
                    subtitleBakMode: els.subtitleBakModeSelect?.value,
                    keepTranscript: true,
                    transcriptKeepDir: els.transcriptKeepDirInput?.value.trim() || '',
                    shelfOpenAfterBatch: !!els.shelfOpenAfterBatchCheck?.checked,
                    trayProgressEnabled: els.trayProgressCheck ? !!els.trayProgressCheck.checked : true,
                    showTaskResourceUsage: els.showTaskResourceUsageCheck
                        ? !!els.showTaskResourceUsageCheck.checked
                        : true,
                    rememberLastOpenDir: els.rememberLastOpenDirCheck
                        ? !!els.rememberLastOpenDirCheck.checked
                        : true,
                    minimizeToTrayEnabled: els.minimizeToTrayCheck ? !!els.minimizeToTrayCheck.checked : true,
                    minimizeToTrayOnStart: !!els.minimizeToTrayOnStartCheck?.checked,
                    trayNotifyEnabled: !!els.trayNotifyCheck?.checked,
                    startupWindow: els.startupWindowSelect?.value,
                    subtitleEditorBackend: els.subtitleEditorBackendSelect?.value || 'auto',
                    subtitleEditorPath: els.subtitleEditorPathInput?.value?.trim() || '',
                    uiLocale: els.uiLocaleSelect?.value
                        || window.TransubI18n?.getLocale?.()
                        || 'zh-Hans',
                    autoUpdateCheckInterval: els.autoUpdateCheckIntervalSelect?.value,
                    activePresetId: getActiveParamsPresetId(),
                    activeComboPlanId: getActiveComboPlanId(),
                    mtUseForm: !!getMtUseFormState(),
                    settingsUiMode: 'standard',
                    externalImportAction: els.externalImportActionSelect?.value,
                    postBatchQc: els.postBatchQcCheck ? !!els.postBatchQcCheck.checked : true,
                    postBatchQcFixMode: getPostBatchQcFixMode(),
                    qcSilenceSplitCharsRaw: els.qcSilenceSplitCharsInput?.value,
                    postBatchCpsSplit: els.postBatchCpsSplitCheck ? !!els.postBatchCpsSplitCheck.checked : true,
                    postBatchRemoveNoise: els.postBatchRemoveNoiseCheck ? !!els.postBatchRemoveNoiseCheck.checked : true,
                    postBatchCompressRepetition: els.postBatchCompressRepCheck ? !!els.postBatchCompressRepCheck.checked : true,
                    postBatchViewingPunctMode: viewingPunct,
                    postBatchInterjectionMode: viewingInterj,
                    postBatchOnomatopoeiaMode: viewingOnomato,
                    postBatchTextPresetGroupId: els.postBatchTextPresetGroupSelect?.value || '',
                    outputMode: els.outputModeSelect?.value,
                    outputDir: resolveOutputDirFromForm(),
                    audioSuffixes: els.audioSuffixesInput?.value.trim() || DEFAULT_AUDIO_SUFFIXES,
                    ffmpegPath: els.ffmpegPathInput
                        ? (els.ffmpegPathInput.value.trim() || '')
                        : (getSavedOptionsSnapshot()?.ffmpegPath || ''),
                    burnContainer: els.settingsBurnContainerSelect?.value,
                    burnEncoderId: els.settingsBurnEncoderSelect?.value,
                    burnAudioMode: els.settingsBurnAudioModeSelect?.value,
                    burnCrf: els.settingsBurnCrf?.value,
                    burnResolutionId: els.settingsBurnResolutionSelect?.value,
                    burnFpsId: els.settingsBurnFpsSelect?.value,
                    burnEncodeSpeedId: els.settingsBurnEncodeSpeedSelect?.value,
                    burnOutputSuffix: els.settingsBurnOutputSuffix?.value,
                    burnOutputDir: els.settingsBurnOutputDirInput?.value?.trim() || '',
                    autoScanFolders: getAutoScanFoldersDraft(),
                    autoScanRecursive: els.autoScanRecursiveCheck
                        ? !!els.autoScanRecursiveCheck.checked
                        : true,
                    wizardContentTypes: getWizardContentTypesDraft(),
                    wizardPresetIds: getWizardContentTypesDraft(),
                    wizardTargetLangs: getWizardTargetLangsDraft(),
                }, settingsNormApi);
            stashTwaiLegacyFromOptions(built);
            return built;
        }
        return {
            applyOptionsToForm,
            buildSavedOptionsFromForm,
            syncOutputTrackNamingUi,
        };
    }

    return { createSettingsFormApply };
}));
