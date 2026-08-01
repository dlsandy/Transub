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
        overwrite: false,
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
        mergeBilingualSubtitles: false,
        deleteSourcesAfterMergeBilingual: false,
        includeWords: false,
        karaokeVtt: false,
        releaseGpuAfter: null,
        postBatchCpsSplit: true,
        postBatchRemoveNoise: true,
        postBatchCompressRepetition: true,
        postBatchContextReconstruct: false,
        smartTranslate: false,
        smartTranslateFaithfulTone: true,
        sakuraNsfwPrompt: null,
        filmAudioEnhance: false,
        filmVadPreset: false,
        vadEnabled: true,
        vadSensitive: false,
        vadAggressive: false,
        audioLightDenoise: false,
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
        startupWindow: 'generator',
        autoUpdateCheckInterval: 'weekly',
        lastAutoUpdateCheckAt: '',
        autoSense: true,
        autoDeepSense: false,
        postBatchQc: true,
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
    delete merged.autoContentProfile;

    // Normalize startup window preference
    const startupRaw = String(merged.startupWindow || '').trim().toLowerCase();
    merged.startupWindow = (startupRaw === 'editor' || startupRaw === 'subtitle-editor')
        ? 'editor'
        : 'generator';

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
