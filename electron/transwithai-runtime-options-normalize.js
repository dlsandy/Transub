/**
 * TWAI runtime options normalization (pure) — feature-frozen path, structure-only extract.
 * Persistence whitelist: normalizeTransWithAiRuntimeOptions return keys.
 */
'use strict';

const dualCore = require('../src/js/dual-subtitle-core');
const {
    AUDIO_SUFFIXES,
    normalizePostTaskOptions,
    mergeTransWithAiOptions,
    normalizeInstallPath,
} = require('./transwithai-options');

const VALID_DEVICES = new Set(['cuda', 'cpu', 'auto', 'cuda_low_vram', 'cuda_batch', 'amd', 'modal']);
const VALID_LOG_LEVELS = new Set(['DEBUG', 'INFO', 'WARNING', 'ERROR']);
const VALID_LANGUAGES = new Set(['auto', 'ja', 'zh', 'en']);
const VALID_TASKS = new Set(['translate', 'transcribe', 'dual']);

function normalizeTask(value) {
    const task = String(value || '').trim().toLowerCase();
    return VALID_TASKS.has(task) ? task : 'translate';
}

function normalizeSubFormats(value) {
    const parts = String(value || '')
        .split(/[,;\s]+/)
        .map((part) => part.trim().toLowerCase())
        .filter((part) => ['srt', 'vtt', 'lrc', 'ass', 'ass-dual'].includes(part));
    const unique = [...new Set(parts)];
    return unique.length ? unique.join(',') : 'srt';
}

function normalizeAudioSuffixes(value) {
    const parts = String(value || AUDIO_SUFFIXES)
        .split(/[,;\s]+/)
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean);
    return parts.length ? [...new Set(parts)].join(',') : AUDIO_SUFFIXES;
}

function normalizeTransWithAiRuntimeOptions(options = {}) {
    const merged = mergeTransWithAiOptions(options);
    const language = String(merged.language || 'auto').trim().toLowerCase();
    return {
        // Transub Engine fields — must survive save/load (settings form uses these)
        engineBackend: merged.engineBackend === 'twai' ? 'twai' : 'transub',
        engineInstallPath: String(merged.engineInstallPath || '').trim(),
        engineUrl: String(merged.engineUrl || '').trim().replace(/\/+$/, ''),
        engineHfEndpoint: String(merged.engineHfEndpoint || '').trim().replace(/\/+$/, ''),
        engineHfToken: String(merged.engineHfToken || '').trim(),
        ...(() => {
            try {
                const { normalizeProxyOptions } = require('./proxy-settings');
                return normalizeProxyOptions(merged);
            } catch {
                return {
                    proxyEnabled: !!merged.proxyEnabled,
                    proxyUrl: String(merged.proxyUrl || '').trim(),
                    proxyBypass: String(merged.proxyBypass || '').trim(),
                };
            }
        })(),
        githubMirrorUrls: (() => {
            try {
                const {
                    normalizeGithubMirrorPrefixes,
                    migrateLegacyGithubMirrorDefaults,
                    DEFAULT_GITHUB_MIRROR_PREFIXES,
                } = require('./github-mirrors');
                if (Object.prototype.hasOwnProperty.call(merged, 'githubMirrorUrls')) {
                    return migrateLegacyGithubMirrorDefaults(
                        normalizeGithubMirrorPrefixes(
                            Array.isArray(merged.githubMirrorUrls)
                                ? merged.githubMirrorUrls
                                : String(merged.githubMirrorUrls || '').split(/\r?\n/),
                        ),
                    );
                }
                return DEFAULT_GITHUB_MIRROR_PREFIXES.slice();
            } catch {
                return ['https://g.blfrp.cn/', 'https://gh-proxy.com/', 'https://gh.nxnow.top/', 'https://ghproxy.net/'];
            }
        })(),
        ...(() => {
            try {
                const { normalizeStationOptions } = require('./transub-station-client');
                return normalizeStationOptions(merged);
            } catch {
                return {
                    transubStationEnabled: !!merged.transubStationEnabled,
                    transubStationUrl: String(merged.transubStationUrl || 'http://127.0.0.1:8787').trim()
                        || 'http://127.0.0.1:8787',
                    transubStationModel: String(merged.transubStationModel || '').trim().slice(0, 256),
                };
            }
        })(),
        engineProfile: String(merged.engineProfile || 'balanced').trim() || 'balanced',
        engineAsrModel: String(merged.engineAsrModel || 'sensevoice-small').trim(),
        engineMtModel: (() => {
            const id = String(merged.engineMtModel || '').trim();
            if (/^opus[-_]?mt[-_]/i.test(id) || id.includes('opus-mt-')) return '';
            return id;
        })(),
        // Opus-MT removed — keep empty for backward-compat keys only
        engineOpusMtModel: '',
        // Empty = form「智能选择」; do not coerce to sakura-1.5b.
        engineLlmMtModel: (() => {
            const raw = Object.prototype.hasOwnProperty.call(merged, 'engineLlmMtModel')
                ? String(merged.engineLlmMtModel || '').trim()
                : 'sakura-1.5b';
            if (/^transub-ja/i.test(raw)) return 'sakura-1.5b';
            return raw;
        })(),
        // Explicit 翻译方式 (llm|smart). Prefer this on load over inferring from engineMtModel.
        translateMode: (() => {
            try {
                const catalog = require('../src/js/sakura-mt-catalog-core');
                return catalog.resolveTranslateModeFromOptions(merged);
            } catch {
                if (merged.smartTranslate) return 'smart';
                return 'llm';
            }
        })(),
        engineVadModel: String(merged.engineVadModel || 'fsmn-vad').trim(),
        engineAutoStart: merged.engineAutoStart !== false,
        installPath: normalizeInstallPath(merged.installPath),
        device: VALID_DEVICES.has(merged.device) ? merged.device : 'cuda',
        task: normalizeTask(merged.task),
        overwrite: !!merged.overwrite,
        closeWindowOnComplete: !!merged.closeWindowOnComplete,
        subFormats: normalizeSubFormats(merged.subFormats),
        modelPath: String(merged.modelPath || '').trim(),
        transcribeModelPath: String(merged.transcribeModelPath || '').trim(),
        translateModelPath: String(merged.translateModelPath || '').trim(),
        logLevel: VALID_LOG_LEVELS.has(String(merged.logLevel || '').toUpperCase())
            ? String(merged.logLevel).toUpperCase()
            : 'DEBUG',
        mergeSegments: merged.mergeSegments !== false,
        mergeMaxGapMs: Math.max(0, Math.min(60000, Number(merged.mergeMaxGapMs) || 500)),
        mergeMaxDurationMs: Math.max(1000, Math.min(600000, Number(merged.mergeMaxDurationMs) || 15000)),
        maxBatchSize: Math.max(1, Math.min(32, Number(merged.maxBatchSize) || 8)),
        beamSize: Math.max(1, Math.min(20, Number(merged.beamSize) || 5)),
        language: VALID_LANGUAGES.has(language) ? language : 'auto',
        vadThreshold: Math.max(0.1, Math.min(0.9, Number(merged.vadThreshold) || 0.5)),
        vadMinSpeechDurationMs: Math.max(0, Math.min(5000, (() => {
            const n = Number(merged.vadMinSpeechDurationMs);
            return Number.isFinite(n) ? n : 300;
        })())),
        vadMinSilenceDurationMs: Math.max(0, Math.min(5000, (() => {
            const n = Number(merged.vadMinSilenceDurationMs);
            return Number.isFinite(n) ? n : 100;
        })())),
        vadSpeechPadMs: Math.max(0, Math.min(2000, (() => {
            const n = Number(merged.vadSpeechPadMs);
            return Number.isFinite(n) ? n : 200;
        })())),
        maxInitialTimestamp: Math.max(0, Math.min(60, Number(merged.maxInitialTimestamp) || 30)),
        repetitionPenalty: Math.max(1, Math.min(2, Number(merged.repetitionPenalty) || 1.1)),
        noSpeechThreshold: Math.max(0.1, Math.min(1, Number(merged.noSpeechThreshold) || 0.6)),
        logProbThreshold: Math.max(-5, Math.min(0, Number(merged.logProbThreshold) || -1)),
        compressionRatioThreshold: Math.max(1, Math.min(10, Number(merged.compressionRatioThreshold) || 2.4)),
        hallucinationSilenceThreshold: (() => {
            if (merged.hallucinationSilenceThreshold == null || merged.hallucinationSilenceThreshold === '') {
                return null;
            }
            const n = Number(merged.hallucinationSilenceThreshold);
            if (!Number.isFinite(n) || n <= 0) return null;
            return Math.max(0.1, Math.min(30, n));
        })(),
        glossaryPromptEnabled: merged.glossaryPromptEnabled !== false,
        glossaryMtEnabled: merged.glossaryMtEnabled !== false,
        chineseSubtitleVariant: (() => {
            try {
                const chinese = require('../src/js/subtitle-chinese-core');
                if (typeof chinese.normalizeVariant === 'function') {
                    return chinese.normalizeVariant(merged.chineseSubtitleVariant);
                }
            } catch { /* optional */ }
            const v = String(merged.chineseSubtitleVariant || '').trim().toLowerCase();
            if (v === 'traditional' || v === 'traditional-twp' || v === 'twp') return 'traditional';
            if (v === 'traditional-tw' || v === 'tw') return 'traditional-tw';
            if (v === 'traditional-hk' || v === 'hk') return 'traditional-hk';
            return 'simplified';
        })(),
        subtitleTargetLang: (() => {
            try {
                const tgt = require('../src/js/subtitle-target-lang-core');
                let raw = merged.subtitleTargetLang;
                if (
                    (raw == null || String(raw).trim() === '' || String(raw).trim() === 'zh-Hans')
                    && merged.chineseSubtitleVariant
                    && String(merged.chineseSubtitleVariant).trim()
                    && String(merged.chineseSubtitleVariant).trim().toLowerCase() !== 'simplified'
                ) {
                    // Prefer explicit non-default variant when target lang was defaulted
                    const fromVariant = tgt.targetLangFromFormValue(merged.chineseSubtitleVariant);
                    if (fromVariant) raw = fromVariant;
                }
                return tgt.normalizePersistedSubtitleTargetLang(
                    raw,
                    merged.chineseSubtitleVariant || 'simplified',
                );
            } catch {
                const raw = String(merged.subtitleTargetLang || '').trim();
                const known = ['zh-Hans', 'zh-Hant', 'zh-Hant-TW', 'zh-Hant-HK', 'en', 'ja', 'ko'];
                return known.includes(raw) ? raw : 'zh-Hans';
            }
        })(),
        lastMtByTarget: (() => {
            try {
                const mtRoute = require('../src/js/mt-target-route-core');
                return mtRoute.normalizeLastMtByTarget(merged.lastMtByTarget);
            } catch {
                const raw = merged.lastMtByTarget && typeof merged.lastMtByTarget === 'object'
                    ? merged.lastMtByTarget
                    : {};
                return {
                    zh: String(raw.zh || '').trim(),
                    en: String(raw.en || '').trim(),
                    ja: String(raw.ja || '').trim(),
                    ko: String(raw.ko || '').trim(),
                };
            }
        })(),
        dualTargetSuffix: (() => {
            // Prefer 成片目标语 so EN/KO dual files are not stuck as *.zh.*
            try {
                const fill = require('../src/js/mt-short-fill-core');
                const tgt = require('../src/js/subtitle-target-lang-core');
                const lang = tgt.resolveSubtitleTargetLang?.(merged)
                    || String(merged.subtitleTargetLang || merged.targetLang || '').trim();
                if (lang && fill?.dualTargetSuffixFromLang) {
                    return dualCore.normalizeDualTargetSuffix(
                        fill.dualTargetSuffixFromLang({ subtitleTargetLang: lang }),
                    );
                }
            } catch { /* fall through */ }
            return dualCore.normalizeDualTargetSuffix(merged.dualTargetSuffix);
        })(),
        dualPrimaryTrack: dualCore.normalizeDualPrimaryTrack(merged.dualPrimaryTrack),
        dualDisplayMode: dualCore.normalizeDualDisplayMode(merged.dualDisplayMode),
        // Empty / missing → target-first (settings default 译文在上); editor preview may use source-first separately.
        dualLineOrder: (() => {
            const raw = merged.dualLineOrder;
            if (raw == null || String(raw).trim() === '') return 'target-first';
            return dualCore.normalizeDualLineOrder(raw);
        })(),
        // Persist user preference; engine/TWAI job paths still require task === dual.
        mergeBilingualSubtitles: !!merged.mergeBilingualSubtitles,
        deleteSourcesAfterMergeBilingual: !!merged.deleteSourcesAfterMergeBilingual
            && !!merged.mergeBilingualSubtitles,
        outputWriteTarget: (() => {
            const writeTarget = merged.outputWriteTarget !== false;
            const writeSource = merged.outputWriteSource !== false;
            return writeTarget || !writeSource;
        })(),
        outputWriteSource: merged.outputWriteSource !== false,
        targetSubtitleNaming: (() => {
            try {
                const dual = require('../src/js/dual-subtitle-core');
                return dual.normalizeTargetSubtitleNaming(merged.targetSubtitleNaming);
            } catch {
                const raw = String(merged.targetSubtitleNaming || '').trim().toLowerCase();
                return (raw === 'media' || raw === 'same' || raw === 'video') ? 'media' : 'lang';
            }
        })(),
        insertSoftwareCredit: merged.insertSoftwareCredit !== false,
        includeWords: !!merged.includeWords,
        karaokeVtt: !!merged.karaokeVtt,
        releaseGpuAfter: (() => {
            if (merged.releaseGpuAfter == null || merged.releaseGpuAfter === '') return null;
            return !!merged.releaseGpuAfter;
        })(),
        autoCpuOnGpuBusy: !!merged.autoCpuOnGpuBusy,
        postBatchCpsSplit: merged.postBatchCpsSplit !== false,
        postBatchRemoveNoise: merged.postBatchRemoveNoise !== false,
        postBatchCompressRepetition: merged.postBatchCompressRepetition !== false,
        postBatchViewingPunctMode: merged.postBatchViewingPunctMode,
        postBatchInterjectionMode: merged.postBatchInterjectionMode,
        postBatchOnomatopoeiaMode: merged.postBatchOnomatopoeiaMode,
        postBatchSimplifyViewingPunctuation: merged.postBatchViewingPunctMode !== 'off',
        postBatchCompactPureInterjections: merged.postBatchInterjectionMode === 'clear'
            || merged.postBatchOnomatopoeiaMode === 'clear',
        postBatchTextPresetGroupId: String(merged.postBatchTextPresetGroupId || '').trim(),
        postBatchContextReconstruct: !!merged.postBatchContextReconstruct,
        smartTranslate: !!merged.smartTranslate,
        // Faithful tone applies to all translate modes (engine / sakura / smart); only needs translate|dual.
        smartTranslateFaithfulTone: !!merged.smartTranslateFaithfulTone
            && (normalizeTask(merged.task) === 'translate' || normalizeTask(merged.task) === 'dual'),
        translateStyleEnabled: (() => {
            try {
                const { normalizeTranslateStyleOptions } = require('../src/js/translate-style-core');
                return !!normalizeTranslateStyleOptions(merged).translateStyleEnabled;
            } catch {
                return false;
            }
        })(),
        translateStylePreset: (() => {
            try {
                const { normalizeTranslateStyleOptions } = require('../src/js/translate-style-core');
                return normalizeTranslateStyleOptions(merged).translateStylePreset;
            } catch {
                return 'natural_spoken';
            }
        })(),
        translateStyleCustomNote: (() => {
            try {
                const { normalizeTranslateStyleOptions } = require('../src/js/translate-style-core');
                return normalizeTranslateStyleOptions(merged).translateStyleCustomNote;
            } catch {
                return '';
            }
        })(),
        // Pro 智能翻译：句级专训为默认路径（不再作为可关开关持久化）。
        smartTranslateHybridMt: true,
        smartTranslatePlotPolish: merged.smartTranslatePlotPolish !== false,
        smartTranslateFaithfulVerify: merged.smartTranslateFaithfulVerify !== false,
        smartTranslateAddressConsistency: merged.smartTranslateAddressConsistency !== false,
        asrSecondOpinion: (() => {
            const raw = merged.asrSecondOpinion;
            if (raw === false || raw === 0) return 'off';
            if (raw === true || raw === 1) return 'on';
            const s = String(raw == null ? 'auto' : raw).trim().toLowerCase();
            if (s === 'false' || s === '0' || s === 'off' || s === 'no') return 'off';
            if (s === 'true' || s === '1' || s === 'on' || s === 'always') return 'on';
            return 'auto';
        })(),
        qualityPipelineMode: (() => {
            try {
                const { normalizeQualityPipelineMode } = require('../src/js/quality-pipeline-policy-core');
                return normalizeQualityPipelineMode(merged.qualityPipelineMode);
            } catch {
                const v = String(merged.qualityPipelineMode == null ? 'auto' : merged.qualityPipelineMode)
                    .trim().toLowerCase();
                if (v === 'on' || v === 'true' || v === '1' || v === 'always') return 'on';
                if (v === 'off' || v === 'false' || v === '0' || v === 'no') return 'off';
                return 'auto';
            }
        })(),
        postQcLoopMaxPasses: (() => {
            try {
                const { clampPostQcLoopMaxPasses } = require('../src/js/quality-pipeline-policy-core');
                return clampPostQcLoopMaxPasses(merged.postQcLoopMaxPasses);
            } catch {
                const n = Number(merged.postQcLoopMaxPasses);
                if (!Number.isFinite(n)) return 1;
                return Math.max(0, Math.min(2, Math.round(n)));
            }
        })(),
        asrBadPoolDrafts: merged.asrBadPoolDrafts !== false,
        asrSemanticRepair: (() => {
            const raw = merged.asrSemanticRepair;
            if (raw === false || raw === 0) return 'off';
            const s = String(raw == null ? 'auto' : raw).trim().toLowerCase();
            if (s === 'false' || s === '0' || s === 'off' || s === 'no') return 'off';
            if (s === 'thorough' || s === 'full' || s === 'all' || s === 'on' || s === 'true' || s === '1') {
                return 'thorough';
            }
            return 'auto';
        })(),
        filmBriefSampleMode: String(merged.filmBriefSampleMode || 'auto').trim().toLowerCase() === 'full'
            ? 'full'
            : 'auto',
        smartTranslatePolishSampleLimit: (() => {
            const n = Number(merged.smartTranslatePolishSampleLimit);
            return Number.isFinite(n) ? Math.max(4, Math.min(36, Math.round(n))) : 36;
        })(),
        // null = auto (AV sense / preset / faithful); true/false = force
        sakuraNsfwPrompt: (() => {
            if (merged.sakuraNsfwPrompt === true || merged.sakuraNsfwPrompt === false) {
                return merged.sakuraNsfwPrompt;
            }
            return null;
        })(),
        filmAudioEnhance: !!merged.filmAudioEnhance,
        filmVadPreset: !!merged.filmVadPreset && !merged.filmAudioEnhance,
        filmVadThreshold: merged.filmVadThreshold ?? null,
        filmVadMinSpeechDurationMs: merged.filmVadMinSpeechDurationMs ?? null,
        filmVadMinSilenceDurationMs: merged.filmVadMinSilenceDurationMs ?? null,
        filmHallucinationSilenceThreshold: merged.filmHallucinationSilenceThreshold ?? null,
        neuralDiarize: !!merged.neuralDiarize,
        vadEnabled: merged.vadEnabled !== false,
        vadSensitive: !!merged.vadSensitive,
        vadAggressive: !!merged.vadAggressive && !merged.vadSensitive,
        audioLightDenoise: !!merged.audioLightDenoise,
        autoSuggestSpeakers: !!merged.autoSuggestSpeakers,
        speakerCount: (() => {
            const n = Math.floor(Number(merged.speakerCount));
            return Number.isFinite(n) ? Math.max(2, Math.min(8, n)) : 2;
        })(),
        perfProfile: String(merged.perfProfile || 'quality').trim().toLowerCase() === 'speed'
            ? 'speed'
            : 'quality',
        qwenAsrBatchMode: (() => {
            try {
                const { normalizeQwenAsrBatchMode } = require('../src/js/qwen-asr-batch-core');
                return normalizeQwenAsrBatchMode(merged.qwenAsrBatchMode);
            } catch {
                const v = String(merged.qwenAsrBatchMode || 'auto').trim().toLowerCase();
                if (v === 'conservative' || v === 'aggressive') return v;
                return 'auto';
            }
        })(),
        vadMaxSingleSegmentMs: (() => {
            const n = Number(merged.vadMaxSingleSegmentMs);
            if (Number.isFinite(n) && n > 0) {
                return Math.max(5000, Math.min(60000, Math.round(n)));
            }
            const sec = Number(merged.targetChunkDurationS);
            if (Number.isFinite(sec) && sec > 0) {
                return Math.max(5000, Math.min(60000, Math.round(sec * 1000)));
            }
            return 30000;
        })(),
        smartSplitWithVad: merged.smartSplitWithVad !== false,
        targetChunkDurationS: Math.max(5, Math.min(30, Number(merged.targetChunkDurationS) || 30)),
        retranscribeWarmLight: !!merged.retranscribeWarmLight,
        subtitleBakMode: ['off', 'beside', 'appBackup'].includes(String(merged.subtitleBakMode || '').trim())
            ? String(merged.subtitleBakMode).trim()
            : 'off',
        keepTranscript: true,
        transcriptKeepDir: String(merged.transcriptKeepDir || '').trim(),
        transcriptKeepLimit: 0,
        transcriptKeepDays: 0,
        shelfOpenAfterBatch: !!merged.shelfOpenAfterBatch,
        trayProgressEnabled: merged.trayProgressEnabled !== false,
        showTaskResourceUsage: merged.showTaskResourceUsage !== false,
        minimizeToTrayEnabled: merged.minimizeToTrayEnabled !== false,
        minimizeToTrayOnStart: !!merged.minimizeToTrayOnStart,
        trayNotifyEnabled: !!merged.trayNotifyEnabled,
        rememberLastOpenDir: merged.rememberLastOpenDir !== false,
        lastOpenDir: String(merged.lastOpenDir || '').trim(),
        autoScanFolders: (() => {
            const list = Array.isArray(merged.autoScanFolders) ? merged.autoScanFolders : [];
            const out = [];
            const seen = new Set();
            for (const entry of list) {
                const folder = String(entry || '').trim();
                if (!folder) continue;
                const key = process.platform === 'win32'
                    ? folder.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
                    : folder.replace(/\\/g, '/').replace(/\/+$/, '');
                if (seen.has(key)) continue;
                seen.add(key);
                out.push(folder);
            }
            return out;
        })(),
        autoScanRecursive: merged.autoScanRecursive !== false,
        wizardContentTypes: (() => {
            try {
                const { normalizeWizardContentTypes } = require('../src/js/settings-options-normalize-core');
                return normalizeWizardContentTypes(merged.wizardContentTypes || merged.wizardPresetIds);
            } catch {
                return Array.isArray(merged.wizardPresetIds)
                    ? merged.wizardPresetIds.slice()
                    : (Array.isArray(merged.wizardContentTypes) ? merged.wizardContentTypes.slice() : []);
            }
        })(),
        wizardPresetIds: (() => {
            try {
                const { normalizeWizardPresetIds } = require('../src/js/settings-options-normalize-core');
                return normalizeWizardPresetIds(merged.wizardPresetIds || merged.wizardContentTypes);
            } catch {
                return Array.isArray(merged.wizardPresetIds)
                    ? merged.wizardPresetIds.slice()
                    : (Array.isArray(merged.wizardContentTypes) ? merged.wizardContentTypes.slice() : []);
            }
        })(),
        wizardTargetLangs: (() => {
            try {
                const { normalizeWizardTargetLangs } = require('../src/js/settings-options-normalize-core');
                return normalizeWizardTargetLangs(merged.wizardTargetLangs);
            } catch {
                const list = Array.isArray(merged.wizardTargetLangs) ? merged.wizardTargetLangs : [];
                return list.length ? list.slice() : ['zh-Hans'];
            }
        })(),
        startupWindow: (() => {
            const raw = String(merged.startupWindow || '').trim().toLowerCase();
            return (raw === 'editor' || raw === 'subtitle-editor') ? 'editor' : 'generator';
        })(),
        subtitleEditorBackend: (() => {
            const raw = String(merged.subtitleEditorBackend ?? 'auto').trim().toLowerCase();
            if (raw === 'external' || raw === 'native' || raw === 'csharp') return 'external';
            if (raw === 'electron' || raw === 'builtin' || raw === 'internal') return 'electron';
            return 'auto';
        })(),
        subtitleEditorPath: String(merged.subtitleEditorPath || '').trim(),
        uiLocale: (() => {
            try {
                const { normalizeUiLocale } = require('../src/js/i18n-core');
                return normalizeUiLocale(merged.uiLocale);
            } catch {
                const raw = String(merged.uiLocale || '').trim();
                const known = ['zh-Hans', 'zh-Hant-TW', 'en', 'ja', 'ko'];
                return known.includes(raw) ? raw : 'zh-Hans';
            }
        })(),
        autoUpdateCheckInterval: (() => {
            try {
                const { normalizeAutoUpdateCheckInterval } = require('./auto-update-check');
                return normalizeAutoUpdateCheckInterval(merged.autoUpdateCheckInterval);
            } catch {
                const raw = String(merged.autoUpdateCheckInterval || '').trim().toLowerCase();
                return ['off', 'daily', 'weekly', 'monthly'].includes(raw) ? raw : 'weekly';
            }
        })(),
        lastAutoUpdateCheckAt: String(merged.lastAutoUpdateCheckAt || '').trim(),
        postBatchQc: merged.postBatchQc !== false,
        postBatchQcFixMode: (() => {
            const raw = String(merged.postBatchQcFixMode || '').trim().toLowerCase();
            return (raw === 'fix' || raw === 'smart') ? raw : 'none';
        })(),
        qcSilenceSplitChars: (() => {
            try {
                const { clampQcSilenceSplitChars } = require('../src/js/settings-options-normalize-core');
                return clampQcSilenceSplitChars(merged.qcSilenceSplitChars);
            } catch {
                const n = Number(merged.qcSilenceSplitChars);
                if (!Number.isFinite(n)) return 15;
                return Math.max(0, Math.min(500, Math.round(n)));
            }
        })(),
        qcSmartLlmSplit: merged.qcSmartLlmSplit !== false,
        qcSmartRetranscribe: merged.qcSmartRetranscribe !== false,
        qcSmartSemanticReview: merged.qcSmartSemanticReview !== false,
        qcSmartIntensity: (() => {
            const v = String(merged.qcSmartIntensity || '').trim().toLowerCase();
            return (v === 'medium' || v === 'strong') ? v : 'light';
        })(),
        qcSmartMaxRetranscribeRanges: (() => {
            const n = Number(merged.qcSmartMaxRetranscribeRanges);
            return Number.isFinite(n) ? Math.max(1, Math.min(24, Math.round(n))) : 8;
        })(),
        activePresetId: String(merged.activePresetId || '').trim(),
        activeComboPlanId: String(merged.activeComboPlanId || '').trim(),
        mtUseForm: !!merged.mtUseForm,
        externalImportAction: (() => {
            try {
                const { normalizeExternalImportAction } = require('../src/js/external-import-action-core');
                return normalizeExternalImportAction(merged.externalImportAction);
            } catch {
                const raw = String(merged.externalImportAction || '').trim().toLowerCase();
                if (raw === 'list_only' || raw === 'list_and_start' || raw === 'list_when_idle') return raw;
                return 'list_when_idle';
            }
        })(),
        outputDir: String(merged.outputDir || '').trim(),
        outputMode: merged.outputMode === 'custom' ? 'custom' : 'same',
        audioSuffixes: normalizeAudioSuffixes(merged.audioSuffixes),
        ffmpegPath: String(merged.ffmpegPath || '').trim(),
        ...(() => {
            try {
                const burn = require('../src/js/subtitle-burn-core');
                return burn.normalizeBurnSettingsOptions(merged);
            } catch {
                return {
                    burnContainer: merged.burnContainer === 'mkv' ? 'mkv' : 'mp4',
                    burnEncoderId: String(merged.burnEncoderId || 'libx264').trim() || 'libx264',
                    burnAudioMode: merged.burnAudioMode === 'aac' ? 'aac' : 'copy',
                    burnCrf: Math.min(28, Math.max(14, Math.round(Number(merged.burnCrf)) || 18)),
                    burnResolutionId: String(merged.burnResolutionId || 'source'),
                    burnFpsId: String(merged.burnFpsId || 'source'),
                    burnEncodeSpeedId: String(merged.burnEncodeSpeedId || 'medium'),
                    burnOutputSuffix: String(merged.burnOutputSuffix || 'burned').trim() || 'burned',
                    burnOutputDir: String(merged.burnOutputDir || '').trim(),
                };
            }
        })(),
        settingsUiMode: String(merged.settingsUiMode || '').trim() === 'expert' ? 'expert' : 'standard',
        ...normalizePostTaskOptions(merged),
    };
}

module.exports = {
    normalizeTransWithAiRuntimeOptions,
};
