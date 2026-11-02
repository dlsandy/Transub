/**
 * Resolve ZH subtitle paths + interjection drop flags for engine batch postprocess.
 */
const path = require('path');
const softViewing = (() => {
    try { return require('../src/js/av-soft-viewing-policy-core'); } catch { return null; }
})();

function isTranslateLikeTask(task, engineTask) {
    return task === 'translate' || task === 'dual'
        || engineTask === 'translate' || engineTask === 'dual' || engineTask === 'translate_mt';
}

/**
 * @param {{
 *   sourceSubtitlePath?: string,
 *   targetSubtitlePath?: string,
 *   subtitlePath?: string,
 * }} outPaths
 * @param {{ resolve?: Function, existsSync?: Function }} deps
 */
function collectUniqueZhSubtitlePaths(outPaths = {}, deps = {}) {
    const resolve = deps.resolve || path.resolve;
    const existsSync = deps.existsSync || (() => true);
    const srcResolved = outPaths.sourceSubtitlePath
        ? resolve(String(outPaths.sourceSubtitlePath))
        : '';
    const zhCandidates = [
        outPaths.targetSubtitlePath,
        outPaths.subtitlePath,
    ].filter(Boolean);
    return [...new Set(zhCandidates.map((p) => resolve(String(p))))]
        .filter((subPath) => {
            if (!/\.(srt|vtt|lrc)$/i.test(subPath)) return false;
            if (srcResolved && subPath === srcResolved) return false;
            return existsSync(subPath);
        });
}

/**
 * Honor UI post-batch interjection / onomatopoeia modes.
 * Soft-AV (`av_soft`) pins both to clear for watchability (SFX off-screen)
 * unless `avSoftViewingRespectUserModes` is set.
 *
 * @param {object} [merged]
 * @returns {{
 *   dropDiscourse: boolean,
 *   dropOnomatopoeia: boolean,
 *   shouldCompact: boolean,
 *   softAvSkipped: false,
 * }}
 */
function resolveInterjectionDropFlags(merged = {}) {
    // Prefer three-way viewing modes; legacy boolean only when mode fields absent.
    // Legacy must stay opt-in (`=== true`) so old saves without the flag do not suddenly drop cues.
    let interjectionMode = merged.postBatchInterjectionMode == null
        ? (merged.postBatchCompactPureInterjections === true ? 'clear' : null)
        : String(merged.postBatchInterjectionMode).trim().toLowerCase();
    let onomatopoeiaMode = merged.postBatchOnomatopoeiaMode == null
        ? (merged.postBatchCompactPureInterjections === true ? 'clear' : null)
        : String(merged.postBatchOnomatopoeiaMode).trim().toLowerCase();
    if (softViewing?.resolveAvSoftViewingCleanMode) {
        if (interjectionMode === 'off' || interjectionMode === 'light' || interjectionMode === 'clear') {
            interjectionMode = softViewing.resolveAvSoftViewingCleanMode(merged, interjectionMode);
        } else if (softViewing.isAvSoftJob?.(merged)) {
            interjectionMode = softViewing.resolveAvSoftViewingCleanMode(merged, 'clear');
        }
        if (onomatopoeiaMode === 'off' || onomatopoeiaMode === 'light' || onomatopoeiaMode === 'clear') {
            onomatopoeiaMode = softViewing.resolveAvSoftViewingCleanMode(merged, onomatopoeiaMode);
        } else if (softViewing.isAvSoftJob?.(merged)) {
            onomatopoeiaMode = softViewing.resolveAvSoftViewingCleanMode(merged, 'clear');
        }
    }
    const dropDiscourse = interjectionMode === 'clear';
    const dropOnomatopoeia = onomatopoeiaMode === 'clear';
    return {
        dropDiscourse,
        dropOnomatopoeia,
        shouldCompact: dropDiscourse || dropOnomatopoeia,
        // Kept for callers; soft no longer skips compact — it forces clear instead.
        softAvSkipped: false,
    };
}

module.exports = {
    isTranslateLikeTask,
    collectUniqueZhSubtitlePaths,
    resolveInterjectionDropFlags,
};
