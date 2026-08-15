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
                    : 30000;
            });
        const numOr = norm.numOrFinite || ((v, fb) => {
            const n = Number(v);
            return Number.isFinite(n) ? n : fb;
        });
        const resolveMt = norm.resolveEngineMtModelForPersist
            || ((mode, opus, llm) => {
                if (mode === 'smart') return '';
                if (mode === 'llm' || mode === 'sakura') return llm || '';
                return opus || '';
            });
        const viewingLegacyFn = norm.viewingCleanModesToLegacyFlags
            || ((punct, interj, onomato) => ({
                postBatchSimplifyViewingPunctuation: punct !== 'off',
                postBatchCompactPureInterjections: interj === 'clear' || onomato === 'clear',
            }));

        const task = String(fields.task || 'transcribe');
        const translateTask = task === 'translate' || task === 'dual';
        const translateMode = String(fields.translateMode || 'llm');
        const opusMt = String(fields.engineOpusMtModel || '');
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
                : 'https://hf-mirror.com',
            proxyEnabled: !!fields.proxyEnabled,
            proxyUrl: String(fields.proxyUrl || '').trim(),
            proxyBypass: String(fields.proxyBypass || '').trim()
                || 'localhost,127.0.0.1,::1,<local>',
            engineProfile: String(fields.engineProfile || 'balanced'),
            engineAsrModel: String(fields.engineAsrModel || 'sensevoice-small'),
            engineOpusMtModel: opusMt,
            engineLlmMtModel: llmMt,
            engineMtModel: resolveMt(translateMode, opusMt, llmMt),
            translateMode,
            engineVadModel: String(fields.engineVadModel || 'fsmn-vad'),
            engineAutoStart: fields.engineAutoStart !== false,
            installPath: String(fields.installPath || '').trim(),
            device: String(fields.device || 'cuda'),
            task,
            overwrite: !!fields.overwrite,
            // Pref; runtime still applies merge only for dual tasks.
            mergeBilingualSubtitles: !!fields.mergeBilingualSubtitles,
            dualLineOrder: String(fields.dualLineOrder || 'ja-zh'),
            smartTranslate: translateTask && !!fields.smartTranslate,
            smartTranslateFaithfulTone: translateTask && !!fields.smartTranslateFaithfulTone,
            smartTranslateHybridMt: fields.smartTranslateHybridMt !== false,
            smartTranslatePlotPolish: fields.smartTranslatePlotPolish !== false,
            smartTranslatePolishSampleLimit: norm.clampPolishSampleLimit
                ? norm.clampPolishSampleLimit(fields.smartTranslatePolishSampleLimitRaw)
                : 36,
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
            libraryOpenAfterBatch: !!fields.libraryOpenAfterBatch,
            deleteSourcesAfterMergeBilingual: !!fields.mergeBilingualSubtitles
                && !!fields.deleteSourcesAfterMergeBilingual,
            subFormats: String(fields.subFormats || 'srt'),
            includeWords: false,
            karaokeVtt: false,
            releaseGpuAfter: fields.releaseGpuAfter === true ? true
                : (fields.releaseGpuAfter === false ? false : null),
            modelPath: String(fields.modelPath || ''),
            transcribeModelPath: String(fields.transcribeModelPath || ''),
            translateModelPath: String(fields.translateModelPath || ''),
            chineseSubtitleVariant: String(fields.chineseSubtitleVariant || 'simplified'),
            glossaryPromptEnabled: false,
            glossaryMtEnabled: fields.glossaryMtEnabled !== false,
            logLevel: String(fields.logLevel || 'DEBUG'),
            maxBatchSize: Number(fields.maxBatchSize) || 8,
            language: String(fields.language || 'auto'),
            beamSize: Number(fields.beamSize) || 5,
            vadEnabled: fields.vadEnabled !== false,
            vadSensitive: !!fields.vadSensitive,
            vadThreshold: numOr(fields.vadThreshold, 0.5),
            vadMinSpeechDurationMs: numOr(fields.vadMinSpeechDurationMs, 300),
            vadMinSilenceDurationMs: numOr(fields.vadMinSilenceDurationMs, 100),
            vadSpeechPadMs: numOr(fields.vadSpeechPadMs, 200),
            vadMaxSingleSegmentMs,
            vadAggressive: !!fields.vadAggressive && !fields.vadSensitive,
            audioLightDenoise: !!fields.audioLightDenoise,
            perfProfile: (() => {
                const v = String(fields.perfProfile || 'quality').trim().toLowerCase();
                return v === 'speed' ? 'speed' : 'quality';
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
            keepTranscript: fields.keepTranscript !== false,
            transcriptKeepDir: String(fields.transcriptKeepDir || '').trim(),
            transcriptKeepLimit: norm.clampTranscriptKeepLimit
                ? norm.clampTranscriptKeepLimit(fields.transcriptKeepLimitRaw)
                : 200,
            transcriptKeepDays: norm.clampTranscriptKeepDays
                ? norm.clampTranscriptKeepDays(fields.transcriptKeepDaysRaw)
                : 90,
            trayProgressEnabled: fields.trayProgressEnabled !== false,
            showTaskResourceUsage: fields.showTaskResourceUsage !== false,
            minimizeToTrayEnabled: fields.minimizeToTrayEnabled !== false,
            minimizeToTrayOnStart: !!fields.minimizeToTrayOnStart,
            trayNotifyEnabled: !!fields.trayNotifyEnabled,
            rememberLastOpenDir: fields.rememberLastOpenDir !== false,
            startupWindow: norm.normalizeStartupWindow
                ? norm.normalizeStartupWindow(fields.startupWindow)
                : (fields.startupWindow === 'editor' ? 'editor' : 'generator'),
            autoUpdateCheckInterval: norm.normalizeAutoUpdateCheckInterval
                ? norm.normalizeAutoUpdateCheckInterval(fields.autoUpdateCheckInterval)
                : 'weekly',
            autoSense: !!fields.autoSense,
            activePresetId: String(fields.activePresetId || '').trim(),
            mtUseForm: !!fields.mtUseForm,
            settingsUiMode: String(fields.settingsUiMode || 'standard'),
            autoDeepSense: !!fields.autoDeepSense,
            postBatchQc: fields.postBatchQc !== false,
            postBatchQcFixMode: String(fields.postBatchQcFixMode || 'smart'),
            postBatchCpsSplit: fields.postBatchCpsSplit !== false,
            postBatchRemoveNoise: fields.postBatchRemoveNoise !== false,
            postBatchCompressRepetition: fields.postBatchCompressRepetition !== false,
            postBatchViewingPunctMode: viewingPunct,
            postBatchInterjectionMode: viewingInterj,
            postBatchOnomatopoeiaMode: viewingOnomato,
            ...viewingLegacyFn(viewingPunct, viewingInterj, viewingOnomato),
            outputMode: fields.outputMode === 'custom' ? 'custom' : 'same',
            outputDir: String(fields.outputDir || ''),
            audioSuffixes: String(fields.audioSuffixes || ''),
            ffmpegPath: String(fields.ffmpegPath || ''),
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
