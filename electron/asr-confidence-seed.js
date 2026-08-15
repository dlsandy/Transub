/**
 * After ASR job: seed .transub.json from Whisper avgLogprob / backend scores / heuristic.
 */
const path = require('path');
const { readSubtitleMeta, writeSubtitleMeta } = require('./subtitle-meta');

function cueHasAsrScoreMeta(c) {
    const m = c?.meta && typeof c.meta === 'object' ? c.meta : c;
    if (!m || typeof m !== 'object') return false;
    return m.avgLogprob != null || m.avg_logprob != null
        || m.noSpeechProb != null || m.no_speech_prob != null
        || m.confidence != null || m.score != null
        || m.probability != null || m.prob != null;
}

function loadMetaCore() {
    try {
        return require('../src/js/subtitle-meta-core');
    } catch (err) {
        return { error: err };
    }
}

function seedAsrConfidenceMeta(subtitlePath, engineCues, options = {}) {
    const filePath = String(subtitlePath || '').trim();
    if (!filePath) return { ok: false, skipped: true, reason: 'no_path' };
    const list = Array.isArray(engineCues) ? engineCues : [];
    if (!list.length) return { ok: false, skipped: true, reason: 'no_cues' };

    const metaCore = loadMetaCore();
    if (metaCore.error) {
        return { ok: false, error: metaCore.error.message || String(metaCore.error) };
    }
    if (typeof metaCore.buildAsrSidecarFromEngineCues !== 'function') {
        return { ok: false, error: 'meta core missing buildAsrSidecarFromEngineCues' };
    }

    const hasAsr = list.some((c) => cueHasAsrScoreMeta(c));
    const allowHeuristic = options.allowHeuristic !== false;
    if (!hasAsr && !allowHeuristic) {
        return { ok: true, skipped: true, reason: 'no_asr_meta' };
    }

    const doc = metaCore.buildAsrSidecarFromEngineCues(list, {
        sourceSub: path.basename(filePath),
        lowThreshold: options.lowThreshold,
        allowHeuristic,
    });
    if (!doc.entries?.length) {
        return { ok: true, skipped: true, reason: 'no_scored_entries' };
    }
    const written = writeSubtitleMeta(filePath, doc);
    return {
        ok: !!written?.ok,
        path: written?.path,
        entryCount: doc.entries.length,
        heuristic: !hasAsr,
        error: written?.error,
    };
}

/**
 * Merge confidence for a replaced time range into an existing sidecar (range retranscribe).
 */
function mergeRangeAsrConfidenceMeta(subtitlePath, engineCues, options = {}) {
    const filePath = String(subtitlePath || '').trim();
    if (!filePath) return { ok: false, skipped: true, reason: 'no_path' };
    const list = Array.isArray(engineCues) ? engineCues : [];
    if (!list.length) return { ok: false, skipped: true, reason: 'no_cues' };

    const metaCore = loadMetaCore();
    if (metaCore.error) {
        return { ok: false, error: metaCore.error.message || String(metaCore.error) };
    }
    if (typeof metaCore.mergeRangeAsrConfidenceFromCues !== 'function') {
        return { ok: false, error: 'meta core missing mergeRangeAsrConfidenceFromCues' };
    }

    const hasAsr = list.some((c) => cueHasAsrScoreMeta(c));
    const allowHeuristic = options.allowHeuristic !== false;
    if (!hasAsr && !allowHeuristic) {
        return { ok: true, skipped: true, reason: 'no_asr_meta' };
    }

    const existingDoc = readSubtitleMeta(filePath);
    const existing = existingDoc?.ok && existingDoc.meta ? existingDoc.meta : null;
    const meta = metaCore.mergeRangeAsrConfidenceFromCues(existing, list, {
        startMs: options.startMs,
        endMs: options.endMs,
        sourceSub: options.sourceSub || path.basename(filePath),
        lowThreshold: options.lowThreshold,
        allowHeuristic,
    });
    if (!meta.entries?.length) {
        return { ok: true, skipped: true, reason: 'no_scored_entries' };
    }
    const written = writeSubtitleMeta(filePath, meta);
    return {
        ok: !!written?.ok,
        path: written?.path,
        entryCount: meta.entries.length,
        merged: true,
        heuristic: !hasAsr,
        error: written?.error,
    };
}

/**
 * Pick best cue list from engine job result for ASR seeding.
 */
function pickEngineCuesForConfidence(result) {
    const cues = result?.cues;
    if (!cues) return [];
    if (Array.isArray(cues)) return cues;
    if (Array.isArray(cues.source) && cues.source.length) return cues.source;
    if (Array.isArray(cues.target) && cues.target.length) return cues.target;
    return [];
}

module.exports = {
    seedAsrConfidenceMeta,
    mergeRangeAsrConfidenceMeta,
    pickEngineCuesForConfidence,
    cueHasAsrScoreMeta,
};
