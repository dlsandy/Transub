/**
 * QC silence-split runner for Node (batch / smart QC). Uses silence-split-plan + ffmpeg.
 */
'use strict';

function resolveSplitCore() {
    return require('../src/js/subtitle-split-core');
}

function resolveSilencePlan() {
    return require('../src/js/subtitle-editor/silence-split-plan');
}

function resolveQcSilenceCore() {
    return require('../src/js/subtitle-qc-silence-core');
}

function resolveDetectSilence() {
    const ffmpeg = require('./ffmpeg-bridge');
    return typeof ffmpeg.detectSilenceInRange === 'function'
        ? ffmpeg.detectSilenceInRange.bind(ffmpeg)
        : null;
}

/**
 * @param {object[]} cues
 * @param {object} options
 *   mediaPath / videoPath, maxChars / qcSilenceSplitChars, ffmpegPath, silenceDb, silenceDur,
 *   breakWords, onProgress, isCancelled, signal
 */
async function runQcSilenceSplitOnCues(cues, options = {}) {
    const qcSilence = resolveQcSilenceCore();
    const maxChars = qcSilence.clampQcSilenceSplitChars(
        options.maxChars ?? options.qcSilenceSplitChars,
    );
    if (!(maxChars > 0)) {
        return {
            cues: Array.isArray(cues) ? cues.slice() : [],
            stats: { skipped: true, reason: 'disabled', splitCount: 0, added: 0 },
        };
    }

    const mediaPath = String(options.mediaPath || options.videoPath || '').trim();
    if (!mediaPath) {
        return {
            cues: Array.isArray(cues) ? cues.slice() : [],
            stats: { skipped: true, reason: 'no_media', splitCount: 0, added: 0 },
        };
    }

    const splitApi = resolveSplitCore();
    const silencePlan = resolveSilencePlan();
    const detectSilenceInRange = resolveDetectSilence();
    if (!silencePlan?.planSilenceCueSplit || typeof detectSilenceInRange !== 'function') {
        return {
            cues: Array.isArray(cues) ? cues.slice() : [],
            stats: { skipped: true, reason: 'no_planner', splitCount: 0, added: 0 },
        };
    }

    const ffmpegPath = String(options.ffmpegPath || '').trim();
    const defaultBreakWords = Array.isArray(splitApi.DEFAULT_BREAK_WORDS)
        ? splitApi.DEFAULT_BREAK_WORDS.slice()
        : [];
    const breakWords = Array.isArray(options.breakWords) && options.breakWords.length
        ? options.breakWords
        : defaultBreakWords;
    const getBreakWords = () => breakWords;

    const deps = {
        splitApi,
        breakWords,
        getBreakWords,
        textCharCount: splitApi.textCharCount
            ? ((t) => splitApi.textCharCount(t))
            : undefined,
        planSilenceCueSplit: (cue, opts) => silencePlan.planSilenceCueSplit(cue, {
            ...opts,
            breakWords,
        }, {
            videoPath: mediaPath,
            ffmpegPath,
            splitApi,
            getBreakWords,
            isCancelled: () => {
                if (typeof options.isCancelled === 'function' && options.isCancelled()) return true;
                if (options.signal?.aborted) return true;
                return false;
            },
            detectSilence: (detectOpts) => detectSilenceInRange(
                detectOpts.path || mediaPath,
                detectOpts.startMs,
                detectOpts.endMs,
                {
                    ffmpegPathSetting: detectOpts.ffmpegPath || ffmpegPath || undefined,
                    noiseDb: detectOpts.noiseDb,
                    minSilenceSec: detectOpts.minSilenceSec,
                    minSegmentMs: detectOpts.minSegmentMs,
                },
            ),
        }),
        onProgress: options.onProgress,
        isCancelled: () => {
            if (typeof options.isCancelled === 'function' && options.isCancelled()) return true;
            if (options.signal?.aborted) return true;
            return false;
        },
    };

    const applied = await qcSilence.applyQcSilenceSplits(cues, {
        maxChars,
        silenceDb: options.silenceDb,
        silenceDur: options.silenceDur,
        padMs: options.padMs,
        breakWords,
    }, deps);

    if (applied.stats && !applied.stats.skipped && applied.stats.splitCount > 0) {
        try {
            const qc = require('../src/js/subtitle-qc-core');
            if (typeof qc.applySmartAdjustToCues === 'function') {
                qc.applySmartAdjustToCues(applied.cues, {
                    fixOverlap: options.fixOverlap !== false,
                    fixCps: false,
                    enforceMinDur: false,
                    enforceMaxDur: false,
                    gapMs: Number(options.gapMs) >= 0 ? Number(options.gapMs) : 1,
                });
            }
        } catch (_) { /* optional */ }
    }

    return applied;
}

module.exports = {
    runQcSilenceSplitOnCues,
    // re-export for callers that only need clamp
    clampQcSilenceSplitChars: (...args) => resolveQcSilenceCore().clampQcSilenceSplitChars(...args),
    summarizeQcSilenceSplit: (...args) => resolveQcSilenceCore().summarizeQcSilenceSplit(...args),
    DEFAULT_QC_SILENCE_SPLIT_CHARS: 15,
};
