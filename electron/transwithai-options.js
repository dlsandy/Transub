/**
 * Lightweight TransWithAI options helpers (no dual-core / no job runners).
 * Used by cold-start get-options IPC without loading the full bridge.
 */

const path = require('path');

const DEFAULT_INSTALL_PATH = 'F:\\UltraTools\\TransWithAI';
const AUDIO_SUFFIXES = 'mp3,wav,flac,m4a,aac,ogg,wma,mp4,mkv,avi,mov,webm,flv,wmv';

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
        openOutputFolderOnComplete: postTaskAction === 'open_folder' || !!options.openOutputFolderOnComplete,
        sleepOnComplete: postTaskAction === 'sleep' || !!options.sleepOnComplete,
        playSoundOnComplete: !!options.playSoundOnComplete,
        lastOutputDir: String(options.lastOutputDir || '').trim(),
    };
}

function mergeTransWithAiOptions(input = {}) {
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
        glossaryPromptEnabled: true,
        chineseSubtitleVariant: 'simplified',
        dualTargetSuffix: 'zh',
        dualPrimaryTrack: 'target',
        dualDisplayMode: 'both',
        mergeBilingualSubtitles: false,
        deleteSourcesAfterMergeBilingual: false,
        postBatchCpsSplit: true,
        postBatchRemoveNoise: true,
        postBatchCompressRepetition: true,
        smartSplitWithVad: true,
        targetChunkDurationS: 30,
        retranscribeWarmLight: false,
        subtitleBakMode: 'off',
        trayProgressEnabled: true,
        minimizeToTrayOnStart: false,
        trayNotifyEnabled: false,
        postBatchQc: true,
        outputDir: '',
        outputMode: 'same',
        audioSuffixes: AUDIO_SUFFIXES,
        ffmpegPath: '',
        settingsUiMode: 'standard',
        ...input,
    };
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
