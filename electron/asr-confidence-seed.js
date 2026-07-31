/**
 * After ASR job: seed .transub.json from Whisper avgLogprob / noSpeechProb.
 */
const path = require('path');
const { writeSubtitleMeta } = require('./subtitle-meta');

function seedAsrConfidenceMeta(subtitlePath, engineCues, options = {}) {
    const filePath = String(subtitlePath || '').trim();
    if (!filePath) return { ok: false, skipped: true, reason: 'no_path' };
    const list = Array.isArray(engineCues) ? engineCues : [];
    if (!list.length) return { ok: false, skipped: true, reason: 'no_cues' };

    let metaCore;
    try {
        metaCore = require('../src/js/subtitle-meta-core');
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    }
    if (typeof metaCore.buildAsrSidecarFromEngineCues !== 'function') {
        return { ok: false, error: 'meta core missing buildAsrSidecarFromEngineCues' };
    }

    const hasAsr = list.some((c) => {
        const m = c?.meta && typeof c.meta === 'object' ? c.meta : c;
        return m && (m.avgLogprob != null || m.avg_logprob != null
            || m.noSpeechProb != null || m.no_speech_prob != null);
    });
    if (!hasAsr) return { ok: true, skipped: true, reason: 'no_asr_meta' };

    const doc = metaCore.buildAsrSidecarFromEngineCues(list, {
        sourceSub: path.basename(filePath),
        lowThreshold: options.lowThreshold,
    });
    if (!doc.entries?.length) {
        return { ok: true, skipped: true, reason: 'no_scored_entries' };
    }
    const written = writeSubtitleMeta(filePath, doc);
    return {
        ok: !!written?.ok,
        path: written?.path,
        entryCount: doc.entries.length,
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
    pickEngineCuesForConfidence,
};
