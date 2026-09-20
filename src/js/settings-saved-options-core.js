/**
 * Assemble persistable settings options from a form field snapshot (pure).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSettingsSavedOptions = api;
        if (global.TransubSettingsOptionsNormalize) {
            Object.assign(global.TransubSettingsOptionsNormalize, api);
        }
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function settingsSavedOptionsFactory() {
    function resolveAudioMutexApi() {
        if (typeof module !== 'undefined' && module.exports) {
            try { return require('./audio-option-mutex-core'); } catch { /* ignore */ }
        }
        return (typeof globalThis !== 'undefined' ? globalThis.TransubAudioOptionMutex : null)
            || (typeof window !== 'undefined' ? window.TransubAudioOptionMutex : null)
            || null;
    }

    function assembleSavedOptionsFromFields(fields = {}, norm = {}) {
        const clampVad = norm.clampVadMaxSingleSegmentMs
            || ((v) => {
                const maxSegText = String(v ?? '').trim();
                const maxSegRaw = maxSegText === '' ? NaN : Number(maxSegText);
                return Number.isFinite(maxSegRaw)
                    ? Math.max(5000, Math.min(60000, Math.round(maxSegRaw)))
                    : 5000;
            });
        const numOr = norm.numOrFinite || ((v, fb) => {
            const n = Number(v);
            return Number.isFinite(n) ? n : fb;
        });
        const normalizeMode = norm.normalizeTranslateMode
            || ((raw) => {
                const m = String(raw || '').trim().toLowerCase();
                if (m === 'smart' || m === 'hybrid' || m === 'advanced' || m === 'mixed') return 'smart';
                if (m === 'dialog' || m === 'smart_dialog' || m === 'llm_line' || m === 'chat') return 'dialog';
                return 'llm';
            });
        const isProMode = norm.isProTranslateMode
            || ((raw) => {
                const m = normalizeMode(raw);
                return m === 'smart' || m === 'dialog';
            });
        const resolveMt = norm.resolveEngineMtModelForPersist
            || ((mode, _opus, llm) => {
                if (isProMode(mode)) return '';
                return llm || '';
            });
        const viewingLegacyFn = norm.viewingCleanModesToLegacyFlags
            || ((punct, interj, onomato) => ({
                postBatchSimplifyViewingPunctuation: punct !== 'off',
                postBatchCompactPureInterjections: interj === 'clear' || onomato === 'clear',
            }));

        const task = String(fields.task || 'transcribe');
        const translateTask = task === 'translate' || task === 'dual';
        const translateMode = normalizeMode(fields.translateMode || 'llm');
        const opusMt = '';
        const llmMt = String(fields.engineLlmMtModel || '');
        const viewingPunct = String(fields.postBatchViewingPunctMode || 'clear');
        const viewingInterj = String(fields.postBatchInterjectionMode || 'clear');
        const viewingOnomato = String(fields.postBatchOnomatopoeiaMode || 'clear');
        const vadMaxSingleSegmentMs = clampVad(fields.vadMaxSingleSegmentMsRaw);
        const entitled = !!fields.advancedEntitled;

        const out = {
            engineBackend: String(fields.engineBackend || 'transub'),
            engineInstallPath: String(fields.engineInstallPath || ''),
            engineUrl: String(fields.engineUrl || 'http://127.0.0.1:8765').trim() || 'http://127.0.0.1:8765',
            engineHfEndpoint: fields.engineHfEndpoint != null
                ? String(fields.engineHfEndpoint).trim()
                : '',
            engineHfToken: fields.engineHfToken != null
                ? String(fields.engineHfToken).trim()
                : '',
            proxyEnabled: !!fields.proxyEnabled,
            proxyUrl: String(fields.proxyUrl || '').trim(),
            proxyBypass: String(fields.proxyBypass || '').trim()
                || 'localhost,127.0.0.1,::1,<local>',
            transubStationEnabled: !!fields.transubStationEnabled,
            transubStationUrl: (() => {
                let s = String(fields.transubStationUrl || '').trim().slice(0, 512);
                if (!s) return 'http://127.0.0.1:8787';
                if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `http://${s}`;
                try {
                    const u = new URL(s);
                    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
                        return 'http://127.0.0.1:8787';
                    }
                    let path = (u.pathname || '/').replace(/\/+$/, '') || '';
                    if (/\/v1$/i.test(path)) path = path.replace(/\/v1$/i, '');
                    if (/\/api$/i.test(path)) path = path.replace(/\/api$/i, '');
                    return (`${u.protocol}//${u.host}${path || ''}`).replace(/\/+$/, '')
                        || 'http://127.0.0.1:8787';
                } catch {
                    return 'http://127.0.0.1:8787';
                }
            })(),
            transubStationModel: String(fields.transubStationModel || '').trim().slice(0, 256),
            githubMirrorUrls: (() => {
                const text = fields.githubMirrorsText != null
                    ? String(fields.githubMirrorsText)
                    : (Array.isArray(fields.githubMirrorUrls)
                        ? fields.githubMirrorUrls.join('\n')
                        : String(fields.githubMirrorUrls || ''));
                const out = [];
                const seen = new Set();
                for (const line of text.split(/\r?\n/)) {
                    let s = String(line || '').trim().slice(0, 512);
                    if (!s) continue;
                    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
                    try {
                        const u = new URL(s);
                        if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
                        s = `${u.protocol}//${u.host}${u.pathname || '/'}`;
                        if (!s.endsWith('/')) s += '/';
                    } catch {
                        continue;
                    }
                    if (seen.has(s)) continue;
                    seen.add(s);
                    out.push(s);
                    if (out.length >= 24) break;
                }
                return out;
            })(),
            engineProfile: String(fields.engineProfile || 'balanced'),
            engineAsrModel: String(fields.engineAsrModel || 'qwen3-asr-1.7b-ja-anime-galgame'),
            engineOpusMtModel: opusMt,
            engineLlmMtModel: llmMt,
            engineMtModel: resolveMt(translateMode, opusMt, llmMt),
            translateMode,
            engineVadModel: String(fields.engineVadModel || 'silero-vad'),
            engineAutoStart: fields.engineAutoStart !== false,
            installPath: String(fields.installPath || '').trim(),
            device: String(fields.device || 'cuda'),
            task,
            overwrite: !!fields.overwrite,
            // Pref; runtime still applies merge only for dual tasks.
            mergeBilingualSubtitles: !!fields.mergeBilingualSubtitles,
            dualLineOrder: String(fields.dualLineOrder || 'target-first'),
            // Sidecar write prefs (at least one of target/source kept on).
            outputWriteTarget: (() => {
                const writeTarget = fields.outputWriteTarget !== false;
                const writeSource = fields.outputWriteSource !== false;
                return writeTarget || !writeSource;
            })(),
            outputWriteSource: fields.outputWriteSource !== false,
            targetSubtitleNaming: norm.normalizeTargetSubtitleNaming
                ? norm.normalizeTargetSubtitleNaming(fields.targetSubtitleNaming)
                : (String(fields.targetSubtitleNaming || '').trim().toLowerCase() === 'media'
                    ? 'media'
                    : 'lang'),
            insertSoftwareCredit: fields.insertSoftwareCredit !== false,
            smartTranslate: translateTask && isProMode(translateMode),
            smartTranslateFaithfulTone: translateTask && !!fields.smartTranslateFaithfulTone,
            ...(norm.normalizeTranslateStyleOptions
                ? norm.normalizeTranslateStyleOptions({
                    translateStyleEnabled: fields.translateStyleEnabled,
                    translateStylePreset: fields.translateStylePreset,
                    translateStyleCustomNote: fields.translateStyleCustomNote,
                }, { entitled })
                : {
                    translateStyleEnabled: false,
                    translateStylePreset: 'natural_spoken',
                    translateStyleCustomNote: '',
                }),
            smartTranslateHybridMt: translateMode === 'smart',
            smartTranslatePlotPolish: isProMode(translateMode) && fields.smartTranslatePlotPolish !== false,
            smartTranslateFaithfulVerify: isProMode(translateMode)
                && fields.smartTranslateFaithfulVerify !== false,
            smartTranslateAddressConsistency: isProMode(translateMode)
                && fields.smartTranslateAddressConsistency !== false,
            smartTranslatePolishSampleLimit: norm.clampPolishSampleLimit
                ? norm.clampPolishSampleLimit(fields.smartTranslatePolishSampleLimitRaw)
                : 36,
            asrSecondOpinion: norm.normalizeAsrSecondOpinion
                ? norm.normalizeAsrSecondOpinion(fields.asrSecondOpinion)
                : 'off',
            qualityPipelineMode: norm.normalizeQualityPipelineMode
                ? norm.normalizeQualityPipelineMode(fields.qualityPipelineMode)
                : 'auto',
            postQcLoopMaxPasses: norm.clampPostQcLoopMaxPasses
                ? norm.clampPostQcLoopMaxPasses(fields.postQcLoopMaxPassesRaw ?? fields.postQcLoopMaxPasses)
                : (() => {
                    const n = Number(fields.postQcLoopMaxPassesRaw ?? fields.postQcLoopMaxPasses);
                    if (!Number.isFinite(n)) return 1;
                    return Math.max(0, Math.min(2, Math.round(n)));
                })(),
            asrBadPoolDrafts: !!fields.asrBadPoolDrafts,
            asrSemanticRepair: entitled && norm.normalizeAsrSemanticRepair
                ? norm.normalizeAsrSemanticRepair(fields.asrSemanticRepair)
                : 'off',
            filmBriefSampleMode: String(fields.filmBriefSampleMode || '').trim().toLowerCase() === 'full'
                ? 'full'
                : 'auto',
            filmAudioEnhance: entitled && !!fields.filmAudioEnhance,
            filmVadPreset: entitled && !!fields.filmVadPreset && !fields.filmAudioEnhance,
            filmVadThreshold: norm.optionalFiniteNumber
                ? norm.optionalFiniteNumber(fields.filmVadThresholdRaw, { min: 0.05, max: 0.95 })
                : null,
            filmVadMinSpeechDurationMs: norm.optionalFiniteNumber
                ? norm.optionalFiniteNumber(fields.filmVadMinSpeechDurationMsRaw, { min: 50, max: 2000 })
                : null,
            filmVadMinSilenceDurationMs: norm.optionalFiniteNumber
                ? norm.optionalFiniteNumber(fields.filmVadMinSilenceDurationMsRaw, { min: 50, max: 2000 })
                : null,
            filmHallucinationSilenceThreshold: (() => {
                if (fields.filmHallucinationSilenceThresholdRaw == null
                    || String(fields.filmHallucinationSilenceThresholdRaw).trim() === '') {
                    return null;
                }
                const n = Number(fields.filmHallucinationSilenceThresholdRaw);
                if (!Number.isFinite(n)) return null;
                if (n <= 0) return 0;
                return Math.max(0.1, Math.min(30, n));
            })(),
            qcSmartLlmSplit: fields.qcSmartLlmSplit !== false,
            qcSmartRetranscribe: fields.qcSmartRetranscribe !== false,
            qcSmartSemanticReview: fields.qcSmartSemanticReview !== false,
            qcSmartIntensity: norm.normalizeQcSmartIntensity
                ? norm.normalizeQcSmartIntensity(fields.qcSmartIntensity)
                : 'light',
            qcSmartMaxRetranscribeRanges: norm.clampQcSmartMaxRetranscribeRanges
                ? norm.clampQcSmartMaxRetranscribeRanges(fields.qcSmartMaxRetranscribeRangesRaw)
                : 8,
            deleteSourcesAfterMergeBilingual: !!fields.mergeBilingualSubtitles
                && !!fields.deleteSourcesAfterMergeBilingual,
            subFormats: String(fields.subFormats || 'srt'),
            includeWords: false,
            karaokeVtt: false,
            releaseGpuAfter: fields.releaseGpuAfter === false ? false : true,
            autoCpuOnGpuBusy: !!fields.autoCpuOnGpuBusy,
            modelPath: String(fields.modelPath || ''),
            transcribeModelPath: String(fields.transcribeModelPath || ''),
            translateModelPath: String(fields.translateModelPath || ''),
            chineseSubtitleVariant: (() => {
                const form = norm.normalizeSubtitleTargetFormValue
                    ? norm.normalizeSubtitleTargetFormValue(fields.subtitleTargetForm
                        || fields.chineseSubtitleVariant
                        || 'simplified')
                    : String(fields.chineseSubtitleVariant || 'simplified');
                if (form === 'en' || form === 'ja' || form === 'ko') {
                    return 'simplified';
                }
                return String(form || 'simplified');
            })(),
            subtitleTargetLang: (() => {
                if (norm.normalizeSubtitleTargetLang) {
                    return norm.normalizeSubtitleTargetLang(
                        fields.subtitleTargetLang || fields.subtitleTargetForm || fields.chineseSubtitleVariant,
                        fields.chineseSubtitleVariant || 'simplified',
                    );
                }
                return 'zh-Hans';
            })(),
            // Keep bilingual file suffix aligned with 成片目标语 (not a separate UI control).
            dualTargetSuffix: (() => {
                let lang = 'zh-Hans';
                if (norm.normalizeSubtitleTargetLang) {
                    lang = norm.normalizeSubtitleTargetLang(
                        fields.subtitleTargetLang || fields.subtitleTargetForm || fields.chineseSubtitleVariant,
                        fields.chineseSubtitleVariant || 'simplified',
                    );
                }
                try {
                    const fill = (typeof module !== 'undefined' && module.exports)
                        ? require('./mt-short-fill-core')
                        : (typeof globalThis !== 'undefined' ? globalThis.TransubMtShortFill : null);
                    if (fill?.dualTargetSuffixFromLang) {
                        return fill.dualTargetSuffixFromLang({ subtitleTargetLang: lang });
                    }
                } catch { /* optional */ }
                if (/^en/i.test(lang)) return 'en';
                if (/^ko/i.test(lang)) return 'ko';
                if (/^ja/i.test(lang)) return 'ja';
                return 'zh-cn';
            })(),
            lastMtByTarget: (() => {
                try {
                    const route = (typeof module !== 'undefined' && module.exports)
                        ? require('./mt-target-route-core')
                        : (typeof globalThis !== 'undefined' ? globalThis.TransubMtTargetRoute : null);
                    if (route?.normalizeLastMtByTarget) {
                        return route.normalizeLastMtByTarget(fields.lastMtByTarget);
                    }
                } catch { /* optional */ }
                const raw = fields.lastMtByTarget && typeof fields.lastMtByTarget === 'object'
                    ? fields.lastMtByTarget
                    : {};
                return {
                    zh: String(raw.zh || '').trim(),
                    en: String(raw.en || '').trim(),
                    ja: String(raw.ja || '').trim(),
                    ko: String(raw.ko || '').trim(),
                };
            })(),
            glossaryPromptEnabled: !!fields.glossaryPromptEnabled,
            glossaryMtEnabled: !!fields.glossaryMtEnabled,
            logLevel: String(fields.logLevel || 'DEBUG'),
            maxBatchSize: Number(fields.maxBatchSize) || 8,
            language: String(fields.language || 'ja'),
            beamSize: Number(fields.beamSize) || 1,
            vadEnabled: fields.vadEnabled !== false,
            vadSensitive: !!fields.vadSensitive,
            vadThreshold: numOr(fields.vadThreshold, 0.45),
            vadMinSpeechDurationMs: numOr(fields.vadMinSpeechDurationMs, 180),
            vadMinSilenceDurationMs: numOr(fields.vadMinSilenceDurationMs, 500),
            vadSpeechPadMs: numOr(fields.vadSpeechPadMs, 80),
            vadMaxSingleSegmentMs,
            vadAggressive: !!fields.vadAggressive && !fields.vadSensitive,
            audioLightDenoise: !!fields.audioLightDenoise,
            perfProfile: (() => {
                const v = String(fields.perfProfile || 'quality').trim().toLowerCase();
                return v === 'speed' ? 'speed' : 'quality';
            })(),
            qwenAsrBatchMode: (() => {
                if (norm.normalizeQwenAsrBatchMode) {
                    return norm.normalizeQwenAsrBatchMode(fields.qwenAsrBatchMode);
                }
                const v = String(fields.qwenAsrBatchMode || 'auto').trim().toLowerCase();
                if (v === 'conservative' || v === 'aggressive') return v;
                return 'auto';
            })(),
            ...(fields.twaiLegacy && typeof fields.twaiLegacy === 'object' ? fields.twaiLegacy : {}),
            targetChunkDurationS: Math.round(vadMaxSingleSegmentMs / 1000),
            hallucinationSilenceThreshold: norm.clampHallucinationSilenceThreshold
                ? norm.clampHallucinationSilenceThreshold(fields.hallucinationSilenceThresholdRaw)
                : null,
            retranscribeWarmLight: !!fields.retranscribeWarmLight,
            subtitleBakMode: norm.normalizeSubtitleBakMode
                ? norm.normalizeSubtitleBakMode(fields.subtitleBakMode)
                : (['off', 'beside', 'appBackup'].includes(fields.subtitleBakMode)
                    ? fields.subtitleBakMode
                    : 'off'),
            keepTranscript: true,
            transcriptKeepDir: String(fields.transcriptKeepDir || '').trim(),
            // Always retain all kept transcripts (no count / age prune).
            transcriptKeepLimit: 0,
            transcriptKeepDays: 0,
            shelfOpenAfterBatch: !!fields.shelfOpenAfterBatch,
            trayProgressEnabled: !!fields.trayProgressEnabled,
            showTaskResourceUsage: fields.showTaskResourceUsage !== false,
            minimizeToTrayEnabled: fields.minimizeToTrayEnabled !== false,
            minimizeToTrayOnStart: !!fields.minimizeToTrayOnStart,
            trayNotifyEnabled: !!fields.trayNotifyEnabled,
            rememberLastOpenDir: fields.rememberLastOpenDir !== false,
            startupWindow: norm.normalizeStartupWindow
                ? norm.normalizeStartupWindow(fields.startupWindow)
                : (fields.startupWindow === 'editor' ? 'editor' : 'generator'),
            subtitleEditorBackend: (() => {
                const raw = String(fields.subtitleEditorBackend ?? 'auto').trim().toLowerCase();
                if (raw === 'external' || raw === 'native' || raw === 'csharp') return 'external';
                if (raw === 'electron' || raw === 'builtin' || raw === 'internal') return 'electron';
                return 'auto';
            })(),
            subtitleEditorPath: String(fields.subtitleEditorPath || '').trim(),
            uiLocale: norm.normalizeUiLocale
                ? norm.normalizeUiLocale(fields.uiLocale)
                : (['zh-Hans', 'zh-Hant-TW', 'en', 'ja', 'ko'].includes(String(fields.uiLocale || '').trim())
                    ? String(fields.uiLocale).trim()
                    : 'zh-Hans'),
            autoUpdateCheckInterval: norm.normalizeAutoUpdateCheckInterval
                ? norm.normalizeAutoUpdateCheckInterval(fields.autoUpdateCheckInterval)
                : 'off',
            activePresetId: String(fields.activePresetId || '').trim(),
            activeComboPlanId: String(fields.activeComboPlanId || '').trim(),
            mtUseForm: !!fields.mtUseForm,
            settingsUiMode: String(fields.settingsUiMode || 'standard'),
            externalImportAction: norm.normalizeExternalImportAction
                ? norm.normalizeExternalImportAction(fields.externalImportAction)
                : 'list_when_idle',
            postBatchQc: fields.postBatchQc !== false,
            postBatchQcFixMode: String(fields.postBatchQcFixMode || 'fix'),
            qcSilenceSplitChars: norm.clampQcSilenceSplitChars
                ? norm.clampQcSilenceSplitChars(fields.qcSilenceSplitCharsRaw ?? fields.qcSilenceSplitChars)
                : (() => {
                    const n = Number(fields.qcSilenceSplitCharsRaw ?? fields.qcSilenceSplitChars);
                    if (!Number.isFinite(n)) return 15;
                    return Math.max(0, Math.min(500, Math.round(n)));
                })(),
            postBatchCpsSplit: fields.postBatchCpsSplit !== false,
            postBatchRemoveNoise: fields.postBatchRemoveNoise !== false,
            postBatchCompressRepetition: fields.postBatchCompressRepetition !== false,
            postBatchViewingPunctMode: viewingPunct,
            postBatchInterjectionMode: viewingInterj,
            postBatchOnomatopoeiaMode: viewingOnomato,
            ...viewingLegacyFn(viewingPunct, viewingInterj, viewingOnomato),
            postBatchTextPresetGroupId: entitled
                ? String(fields.postBatchTextPresetGroupId || '').trim()
                : '',
            outputMode: fields.outputMode === 'custom' ? 'custom' : 'same',
            outputDir: String(fields.outputDir || ''),
            audioSuffixes: String(fields.audioSuffixes || ''),
            ffmpegPath: String(fields.ffmpegPath || ''),
            ...(norm.normalizeBurnSettingsOptions
                ? norm.normalizeBurnSettingsOptions({
                    burnContainer: fields.burnContainer,
                    burnEncoderId: fields.burnEncoderId,
                    burnAudioMode: fields.burnAudioMode,
                    burnCrf: fields.burnCrf,
                    burnResolutionId: fields.burnResolutionId,
                    burnFpsId: fields.burnFpsId,
                    burnEncodeSpeedId: fields.burnEncodeSpeedId,
                    burnOutputSuffix: fields.burnOutputSuffix,
                    burnOutputDir: fields.burnOutputDir,
                })
                : {
                    burnContainer: String(fields.burnContainer || 'mp4').toLowerCase() === 'mkv' ? 'mkv' : 'mp4',
                    burnEncoderId: String(fields.burnEncoderId || 'libx264').trim() || 'libx264',
                    burnAudioMode: String(fields.burnAudioMode || 'copy').toLowerCase() === 'aac' ? 'aac' : 'copy',
                    burnCrf: (() => {
                        const n = Math.round(Number(fields.burnCrf));
                        return Number.isFinite(n) ? Math.min(28, Math.max(14, n)) : 18;
                    })(),
                    burnResolutionId: String(fields.burnResolutionId || 'source'),
                    burnFpsId: String(fields.burnFpsId || 'source'),
                    burnEncodeSpeedId: String(fields.burnEncodeSpeedId || 'medium'),
                    burnOutputSuffix: String(fields.burnOutputSuffix || 'burned').trim() || 'burned',
                    burnOutputDir: String(fields.burnOutputDir || '').trim(),
                }),
            autoScanFolders: norm.normalizeAutoScanFolders
                ? norm.normalizeAutoScanFolders(fields.autoScanFolders)
                : (Array.isArray(fields.autoScanFolders)
                    ? fields.autoScanFolders.map((p) => String(p || '').trim()).filter(Boolean)
                    : []),
            autoScanRecursive: fields.autoScanRecursive !== false,
            wizardContentTypes: norm.normalizeWizardContentTypes
                ? norm.normalizeWizardContentTypes(fields.wizardContentTypes || fields.wizardPresetIds)
                : (Array.isArray(fields.wizardPresetIds) ? fields.wizardPresetIds.slice()
                    : (Array.isArray(fields.wizardContentTypes) ? fields.wizardContentTypes.slice() : [])),
            wizardPresetIds: norm.normalizeWizardPresetIds
                ? norm.normalizeWizardPresetIds(fields.wizardPresetIds || fields.wizardContentTypes)
                : (Array.isArray(fields.wizardPresetIds) ? fields.wizardPresetIds.slice()
                    : (Array.isArray(fields.wizardContentTypes) ? fields.wizardContentTypes.slice() : [])),
            wizardTargetLangs: norm.normalizeWizardTargetLangs
                ? norm.normalizeWizardTargetLangs(fields.wizardTargetLangs)
                : (Array.isArray(fields.wizardTargetLangs) && fields.wizardTargetLangs.length
                    ? fields.wizardTargetLangs.slice()
                    : ['zh-Hans']),
        };
        const mutex = resolveAudioMutexApi();
        if (typeof mutex?.normalizeAudioOptionBundle === 'function') {
            const n = mutex.normalizeAudioOptionBundle(out);
            out.filmAudioEnhance = !!n.filmAudioEnhance && entitled;
            out.filmVadPreset = !!n.filmVadPreset && entitled && !out.filmAudioEnhance;
            out.vadSensitive = !!n.vadSensitive;
            out.audioLightDenoise = !!n.audioLightDenoise;
            out.vadAggressive = !!n.vadAggressive && !out.vadSensitive;
        }
        return out;
    }

    return { assembleSavedOptionsFromFields };
}));
