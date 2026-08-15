/**
 * Resolve ZH subtitle paths + interjection drop flags for engine batch postprocess.
 */
const path = require('path');

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

function resolveInterjectionDropFlags(merged = {}) {
    // Prefer three-way viewing modes; legacy boolean only when mode fields absent.
    // Legacy must stay opt-in (`=== true`) so old saves without the flag do not suddenly drop cues.
    const dropDiscourse = merged.postBatchInterjectionMode === 'clear'
        || (merged.postBatchInterjectionMode == null
            && merged.postBatchCompactPureInterjections === true);
    const dropOnomatopoeia = merged.postBatchOnomatopoeiaMode === 'clear'
        || (merged.postBatchOnomatopoeiaMode == null
            && merged.postBatchCompactPureInterjections === true);
    return {
        dropDiscourse,
        dropOnomatopoeia,
        shouldCompact: dropDiscourse || dropOnomatopoeia,
    };
}

module.exports = {
    isTranslateLikeTask,
    collectUniqueZhSubtitlePaths,
    resolveInterjectionDropFlags,
};
