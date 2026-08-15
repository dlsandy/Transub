/**
 * Shared post-ASR cue cleanup for batch-parity on range retranscribe.
 * Applies JA name-loop strip + domain mishear remap (same order as sanitizeMtSubtitlePair source prep).
 */

function cuesToMsShape(cues) {
    return (Array.isArray(cues) ? cues : []).map((c, i) => {
        const startMs = Number.isFinite(Number(c?.startMs))
            ? Math.round(Number(c.startMs))
            : (Number.isFinite(Number(c?.start)) ? Math.round(Number(c.start) * 1000) : i * 1000);
        const endMs = Number.isFinite(Number(c?.endMs))
            ? Math.round(Number(c.endMs))
            : (Number.isFinite(Number(c?.end))
                ? Math.round(Number(c.end) * 1000)
                : startMs + 1000);
        const row = {
            startMs: Math.max(0, startMs),
            endMs: Math.max(startMs + 1, endMs),
            text: String(c?.text || '').trim(),
        };
        // Preserve optional ASR meta for confidence seeding.
        for (const key of [
            'avgLogprob', 'avg_logprob', 'noSpeechProb', 'no_speech_prob',
            'confidence', 'score', 'probability', 'prob', 'meta',
        ]) {
            if (c && c[key] != null) row[key] = c[key];
        }
        return row;
    }).filter((c) => c.text);
}

/**
 * @param {object[]} cuesIn
 * @param {object} [options]
 * @param {boolean} [options.nameLoop=true]
 * @param {boolean} [options.jaAsrDomainFix=true]
 * @returns {{
 *   cues: object[],
 *   nameLoopsChanged: number,
 *   domainChanged: number,
 *   changed: number,
 *   summary: string,
 *   stages: object[],
 * }}
 */
function cleanupAsrCues(cuesIn, options = {}) {
    let cues = cuesToMsShape(cuesIn);
    let nameLoopsChanged = 0;
    let domainChanged = 0;
    const stages = [];

    if (options.nameLoop !== false) {
        try {
            const jaNames = require('../src/js/ja-person-names-core');
            if (typeof jaNames.stripAsrHallucinationLoopsInCues === 'function') {
                const cleaned = jaNames.stripAsrHallucinationLoopsInCues(cues);
                cues = cleaned.cues || cues;
                nameLoopsChanged = Number(cleaned.changed) || 0;
                if (nameLoopsChanged > 0) {
                    stages.push({
                        stage: 'name_loop',
                        total: nameLoopsChanged,
                        summary: `姓名环清理 ${nameLoopsChanged} 条`,
                    });
                }
            }
        } catch { /* optional */ }
    }

    if (options.jaAsrDomainFix !== false) {
        try {
            const mtSanitize = require('../src/js/mt-sanitize-core');
            if (typeof mtSanitize.correctJaAsrDomainMishearsInCues === 'function') {
                const domain = mtSanitize.correctJaAsrDomainMishearsInCues(cues);
                cues = domain.cues || cues;
                domainChanged = Number(domain.changed) || 0;
                if (domainChanged > 0) {
                    stages.push({
                        stage: 'desktop_domain',
                        total: domainChanged,
                        summary: `ASR领域纠错 ${domainChanged} 条`,
                    });
                }
            }
        } catch { /* optional */ }
    }

    const changed = nameLoopsChanged + domainChanged;
    const parts = [];
    if (nameLoopsChanged) parts.push(`姓名环 ${nameLoopsChanged}`);
    if (domainChanged) parts.push(`域修正 ${domainChanged}`);
    return {
        cues,
        nameLoopsChanged,
        domainChanged,
        changed,
        summary: changed ? `ASR 清理：${parts.join(' · ')}` : 'ASR 清理：无变更',
        stages,
    };
}

module.exports = {
    cuesToMsShape,
    cleanupAsrCues,
};
