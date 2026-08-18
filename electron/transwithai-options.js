/**
 * Lightweight TransWithAI options helpers (no dual-core / no job runners).
 * Used by cold-start get-options IPC without loading the full bridge.
 */

const path = require('path');

const { DEFAULT_AUDIO_SUFFIXES } = require('../src/js/media-extensions-core');

const DEFAULT_INSTALL_PATH = 'F:\\UltraTools\\TransWithAI';
const AUDIO_SUFFIXES = DEFAULT_AUDIO_SUFFIXES;

const POST_TASK_OPTION_KEYS = new Set([
    'closeWindowOnComplete',
    'postTaskAction',
    'quitAppOnComplete',
    'shutdownOnComplete',
    'shutdownDelaySec',
    'openOutputFolderOnComplete',
    'sleepOnComplete',
    'playSoundOnComplete',
    'lastOutputDir',
]);

const DEFAULT_SESSION_POST_TASK = {
    closeWindowOnComplete: false,
    postTaskAction: 'none',
    quitAppOnComplete: false,
    shutdownOnComplete: false,
    shutdownDelaySec: 60,
    openOutputFolderOnComplete: false,
    sleepOnComplete: false,
    playSoundOnComplete: false,
    lastOutputDir: '',
};

function stripPostTaskFields(options = {}) {
    const out = { ...options };
    POST_TASK_OPTION_KEYS.forEach((key) => { delete out[key]; });
    return out;
}

function inferPostTaskAction(options = {}) {
    const action = String(options.postTaskAction || '').trim();
    if (['shutdown', 'quit', 'none', 'open_folder', 'sleep'].includes(action)) return action;
    if (options.sleepOnComplete) return 'sleep';
    if (options.openOutputFolderOnComplete) return 'open_folder';
    if (options.shutdownOnComplete) return 'shutdown';
    if (options.quitAppOnComplete) return 'quit';
    return 'none';
}

function normalizePostTaskOptions(options = {}) {
    const postTaskAction = inferPostTaskAction(options);
    return {
        postTaskAction,
        closeWindowOnComplete: !!options.closeWindowOnComplete,
        quitAppOnComplete: postTaskAction === 'quit' || postTaskAction === 'shutdown',
        shutdownOnComplete: postTaskAction === 'shutdown',
        shutdownDelaySec: Math.max(0, Math.min(600, Number(options.shutdownDelaySec) || 60)),
        // Derive strictly from action — do not OR legacy flags or sticky session values linger.
        openOutputFolderOnComplete: postTaskAction === 'open_folder',
        sleepOnComplete: postTaskAction === 'sleep',
        playSoundOnComplete: !!options.playSoundOnComplete,
        lastOutputDir: String(options.lastOutputDir || '').trim(),
    };
}

function mergeTransWithAiOptions(input = {}) {
    const { mergeEngineOptions } = require('./engine-options');
    const withEngine = mergeEngineOptions(input);
    const merged = {
        installPath: DEFAULT_INSTALL_PATH,
        device: 'cuda',
        task: 'translate',
        overwrite: true,
        closeWindowOnComplete: false,
        postTaskAction: 'none',
        quitAppOnComplete: false,
        shutdownOnComplete: false,
        shutdownDelaySec: 60,
        subFormats: 'srt',
        modelPath: '',
        transcribeModelPath: '',
        translateModelPath: '',
        logLevel: 'DEBUG',
        mergeSegments: true,
        mergeMaxGapMs: 500,
        mergeMaxDurationMs: 15000,
        maxBatchSize: 8,
        beamSize: 5,
        language: 'auto',
        vadThreshold: 0.5,
        vadMinSpeechDurationMs: 300,
        vadMinSilenceDurationMs: 100,
        vadSpeechPadMs: 200,
        maxInitialTimestamp: 30,
        repetitionPenalty: 1.1,
        noSpeechThreshold: 0.6,
        logProbThreshold: -1,
        compressionRatioThreshold: 2.4,
        hallucinationSilenceThreshold: null,
        glossaryPromptEnabled: false,
        glossaryMtEnabled: true,
        chineseSubtitleVariant: 'simplified',
        dualTargetSuffix: 'zh',
        dualPrimaryTrack: 'target',
        dualDisplayMode: 'both',
        // Match settings UI default: 译文在上，原文在下
        dualLineOrder: 'target-first',
        // Pref; runtime jobs still apply merge only when task === dual.
        mergeBilingualSubtitles: true,
        deleteSourcesAfterMergeBilingual: false,
        includeWords: false,
        karaokeVtt: false,
        releaseGpuAfter: true,
        // Pre-wizard / missing-key default: 推理翻译
        translateMode: 'llm',
        postBatchCpsSplit: true,
        postBatchRemoveNoise: true,
        postBatchCompressRepetition: true,
        // 观影文本精简三档：off | light | clear（默认清除）
        postBatchViewingPunctMode: 'clear',
        postBatchInterjectionMode: 'clear',
        postBatchOnomatopoeiaMode: 'clear',
        // 兼容旧布尔（merge 时会迁移到 *Mode）
        postBatchSimplifyViewingPunctuation: true,
        postBatchCompactPureInterjections: true,
        postBatchContextReconstruct: false,
        smartTranslate: false,
        smartTranslateFaithfulTone: true,
        smartTranslateHybridMt: true,
        smartTranslatePlotPolish: true,
        smartTranslateFaithfulVerify: true,
        smartTranslateAddressConsistency: true,
        smartTranslatePolishSampleLimit: 36,
        /** auto: av_soft / JA specialist only; on/off force */
        asrSecondOpinion: 'auto',
        sakuraNsfwPrompt: null,
        filmAudioEnhance: false,
        filmVadPreset: false,
        filmVadThreshold: null,
        filmVadMinSpeechDurationMs: null,
        filmVadMinSilenceDurationMs: null,
        filmHallucinationSilenceThreshold: null,
        neuralDiarize: false,
        vadEnabled: true,
        vadSensitive: false,
        vadAggressive: false,
        audioLightDenoise: false,
        autoSuggestSpeakers: false,
        speakerCount: 2,
        perfProfile: 'quality',
        vadMaxSingleSegmentMs: 30000,
        smartSplitWithVad: true,
        targetChunkDurationS: 30,
        retranscribeWarmLight: false,
        subtitleBakMode: 'off',
        keepTranscript: true,
        transcriptKeepDir: '',
        transcriptKeepLimit: 200,
        transcriptKeepDays: 90,
        trayProgressEnabled: true,
        showTaskResourceUsage: true,
        minimizeToTrayEnabled: true,
        minimizeToTrayOnStart: false,
        trayNotifyEnabled: false,
        rememberLastOpenDir: true,
        lastOpenDir: '',
        startupWindow: 'generator',
        uiLocale: 'zh-Hans',
        autoUpdateCheckInterval: 'weekly',
        lastAutoUpdateCheckAt: '',
        autoSense: true,
        activePresetId: '',
        mtUseForm: false,
        autoDeepSense: false,
        postBatchQc: true,
        postBatchQcFixMode: 'smart',
        /** QC 修复：字数超过此值则尝试静音分割（0=关闭）。默认 15。 */
        qcSilenceSplitChars: 15,
        qcSmartLlmSplit: true,
        qcSmartRetranscribe: true,
        qcSmartSemanticReview: true,
        qcSmartIntensity: 'light',
        qcSmartMaxRetranscribeRanges: 8,
        libraryOpenAfterBatch: false,
        outputDir: '',
        outputMode: 'same',
        audioSuffixes: AUDIO_SUFFIXES,
        ffmpegPath: '',
        settingsUiMode: 'standard',
        proxyEnabled: false,
        proxyUrl: '',
        proxyBypass: 'localhost,127.0.0.1,::1,<local>',
        ...withEngine,
    };
    try {
        const { normalizeProxyOptions } = require('./proxy-settings');
        Object.assign(merged, normalizeProxyOptions(merged));
    } catch { /* ignore */ }
    // Migrate legacy TWAI chunk duration → Engine max single segment when new key absent.
    if ((input.vadMaxSingleSegmentMs == null || input.vadMaxSingleSegmentMs === '')
        && input.targetChunkDurationS != null && input.targetChunkDurationS !== '') {
        const sec = Number(input.targetChunkDurationS);
        if (Number.isFinite(sec) && sec > 0) {
            merged.vadMaxSingleSegmentMs = Math.max(5000, Math.min(60000, Math.round(sec * 1000)));
        }
    } else if (input.vadMaxSingleSegmentMs != null && input.vadMaxSingleSegmentMs !== '') {
        const n = Number(input.vadMaxSingleSegmentMs);
        if (Number.isFinite(n)) {
            merged.vadMaxSingleSegmentMs = Math.max(5000, Math.min(60000, Math.round(n)));
        }
    }
    // Migrate legacy「开始前自动匹配」→「自动感知」
    if (Object.prototype.hasOwnProperty.call(input, 'autoContentProfile')
        && !Object.prototype.hasOwnProperty.call(input, 'autoSense')) {
        merged.autoSense = input.autoContentProfile !== false;
    } else if (Object.prototype.hasOwnProperty.call(input, 'autoSense')) {
        merged.autoSense = input.autoSense !== false;
    }
    {
        const pid = String(merged.activePresetId || '').trim();
        merged.activePresetId = merged.autoSense ? '' : pid;
    }
    merged.audioLightDenoise = !!merged.audioLightDenoise;
    merged.autoSuggestSpeakers = !!merged.autoSuggestSpeakers;
    {
        const n = Math.floor(Number(merged.speakerCount));
        merged.speakerCount = Number.isFinite(n) ? Math.max(2, Math.min(8, n)) : 2;
    }
    {
        const v = String(merged.perfProfile || 'quality').trim().toLowerCase();
        merged.perfProfile = v === 'speed' ? 'speed' : 'quality';
    }
    delete merged.autoContentProfile;

    // 观影精简三档：优先 *Mode；否则从旧布尔迁移（true→light / clear 由缺省，false→off）
    const normClean = (raw, fallback) => {
        const v = String(raw ?? '').trim().toLowerCase();
        if (v === 'off' || v === 'none') return 'off';
        if (v === 'light' || v === 'mild' || v === 'soft') return 'light';
        if (v === 'clear' || v === 'remove' || v === 'drop' || v === 'full') return 'clear';
        return fallback;
    };
    if (Object.prototype.hasOwnProperty.call(input, 'postBatchViewingPunctMode')) {
        merged.postBatchViewingPunctMode = normClean(input.postBatchViewingPunctMode, 'clear');
    } else if (Object.prototype.hasOwnProperty.call(input, 'postBatchSimplifyViewingPunctuation')) {
        merged.postBatchViewingPunctMode = input.postBatchSimplifyViewingPunctuation === false ? 'off' : 'light';
    } else {
        merged.postBatchViewingPunctMode = normClean(merged.postBatchViewingPunctMode, 'clear');
    }
    if (Object.prototype.hasOwnProperty.call(input, 'postBatchInterjectionMode')) {
        merged.postBatchInterjectionMode = normClean(input.postBatchInterjectionMode, 'clear');
    } else if (Object.prototype.hasOwnProperty.call(input, 'postBatchCompactPureInterjections')) {
        merged.postBatchInterjectionMode = input.postBatchCompactPureInterjections === false ? 'off' : 'clear';
    } else {
        merged.postBatchInterjectionMode = normClean(merged.postBatchInterjectionMode, 'clear');
    }
    if (Object.prototype.hasOwnProperty.call(input, 'postBatchOnomatopoeiaMode')) {
        merged.postBatchOnomatopoeiaMode = normClean(input.postBatchOnomatopoeiaMode, 'clear');
    } else if (Object.prototype.hasOwnProperty.call(input, 'postBatchCompactPureInterjections')
        && !Object.prototype.hasOwnProperty.call(input, 'postBatchOnomatopoeiaMode')) {
        // 旧「精简纯语气词」同时覆盖拟声
        merged.postBatchOnomatopoeiaMode = input.postBatchCompactPureInterjections === false ? 'off' : 'clear';
    } else {
        merged.postBatchOnomatopoeiaMode = normClean(merged.postBatchOnomatopoeiaMode, 'clear');
    }
    // 同步派生布尔，供尚未改完的调用方
    merged.postBatchSimplifyViewingPunctuation = merged.postBatchViewingPunctMode !== 'off';
    merged.postBatchCompactPureInterjections = merged.postBatchInterjectionMode === 'clear'
        || merged.postBatchOnomatopoeiaMode === 'clear';

    // Normalize startup window preference
    const startupRaw = String(merged.startupWindow || '').trim().toLowerCase();
    merged.startupWindow = (startupRaw === 'editor' || startupRaw === 'subtitle-editor')
        ? 'editor'
        : 'generator';

    // Normalize UI locale (interface language; independent of chineseSubtitleVariant)
    try {
        const { normalizeUiLocale } = require('../src/js/i18n-core');
        merged.uiLocale = normalizeUiLocale(merged.uiLocale);
    } catch {
        const raw = String(merged.uiLocale || '').trim();
        merged.uiLocale = raw === 'zh-Hant-TW' ? 'zh-Hant-TW' : 'zh-Hans';
    }

    // Normalize auto update check frequency
    try {
        const { normalizeAutoUpdateCheckInterval } = require('./auto-update-check');
        merged.autoUpdateCheckInterval = normalizeAutoUpdateCheckInterval(merged.autoUpdateCheckInterval);
    } catch {
        const raw = String(merged.autoUpdateCheckInterval || '').trim().toLowerCase();
        merged.autoUpdateCheckInterval = ['off', 'daily', 'weekly', 'monthly'].includes(raw)
            ? raw
            : 'weekly';
    }
    merged.lastAutoUpdateCheckAt = String(merged.lastAutoUpdateCheckAt || '').trim();
    merged.rememberLastOpenDir = merged.rememberLastOpenDir !== false;
    merged.lastOpenDir = String(merged.lastOpenDir || '').trim();

    merged.smartTranslateHybridMt = merged.smartTranslateHybridMt !== false;
    merged.smartTranslatePlotPolish = merged.smartTranslatePlotPolish !== false;
    merged.smartTranslateFaithfulVerify = merged.smartTranslateFaithfulVerify !== false;
    merged.smartTranslateAddressConsistency = merged.smartTranslateAddressConsistency !== false;
    {
        const raw = merged.asrSecondOpinion;
        if (raw === false || raw === 0) merged.asrSecondOpinion = 'off';
        else if (raw === true || raw === 1) merged.asrSecondOpinion = 'on';
        else {
            const s = String(raw == null ? 'auto' : raw).trim().toLowerCase();
            if (s === 'false' || s === '0' || s === 'off' || s === 'no') merged.asrSecondOpinion = 'off';
            else if (s === 'true' || s === '1' || s === 'on' || s === 'always') merged.asrSecondOpinion = 'on';
            else merged.asrSecondOpinion = 'auto';
        }
    }
    {
        const n = Number(merged.smartTranslatePolishSampleLimit);
        merged.smartTranslatePolishSampleLimit = Number.isFinite(n)
            ? Math.max(4, Math.min(36, Math.round(n)))
            : 36;
    }
    const optFilmNum = (raw, min, max) => {
        if (raw == null || String(raw).trim() === '') return null;
        const n = Number(raw);
        if (!Number.isFinite(n)) return null;
        return Math.max(min, Math.min(max, n));
    };
    merged.filmVadThreshold = optFilmNum(merged.filmVadThreshold, 0.05, 0.95);
    merged.filmVadMinSpeechDurationMs = (() => {
        const n = optFilmNum(merged.filmVadMinSpeechDurationMs, 50, 2000);
        return n == null ? null : Math.round(n);
    })();
    merged.filmVadMinSilenceDurationMs = (() => {
        const n = optFilmNum(merged.filmVadMinSilenceDurationMs, 50, 2000);
        return n == null ? null : Math.round(n);
    })();
    if (merged.filmHallucinationSilenceThreshold === 0 || merged.filmHallucinationSilenceThreshold === '0') {
        merged.filmHallucinationSilenceThreshold = 0;
    } else {
        const h = optFilmNum(merged.filmHallucinationSilenceThreshold, 0.1, 30);
        merged.filmHallucinationSilenceThreshold = h;
    }
    merged.qcSmartLlmSplit = merged.qcSmartLlmSplit !== false;
    merged.qcSmartRetranscribe = merged.qcSmartRetranscribe !== false;
    merged.qcSmartSemanticReview = merged.qcSmartSemanticReview !== false;
    {
        const v = String(merged.qcSmartIntensity || '').trim().toLowerCase();
        merged.qcSmartIntensity = (v === 'medium' || v === 'strong') ? v : 'light';
    }
    {
        const n = Number(merged.qcSmartMaxRetranscribeRanges);
        merged.qcSmartMaxRetranscribeRanges = Number.isFinite(n)
            ? Math.max(1, Math.min(24, Math.round(n)))
            : 8;
    }
    merged.libraryOpenAfterBatch = !!merged.libraryOpenAfterBatch;

    return {
        ...merged,
        ...normalizePostTaskOptions(merged),
    };
}

function normalizeInstallPath(input) {
    return path.resolve(String(input || DEFAULT_INSTALL_PATH).trim() || DEFAULT_INSTALL_PATH);
}

module.exports = {
    DEFAULT_INSTALL_PATH,
    AUDIO_SUFFIXES,
    POST_TASK_OPTION_KEYS,
    DEFAULT_SESSION_POST_TASK,
    stripPostTaskFields,
    inferPostTaskAction,
    normalizePostTaskOptions,
    mergeTransWithAiOptions,
    normalizeInstallPath,
};
