/**
 * Shared post-batch subtitle cleanup (noise / hallucination / CPS / repetition).
 * Used by Transub engine and TWAI backends so the same settings produce the same cleanup.
 */

const fs = require('fs');
const path = require('path');

/**
 * @param {string[]} subtitlePaths
 * @param {object} options - batch/runtime options with postBatch* flags
 * @param {{ onProgress?: (info: object) => void, onLog?: (line: string) => void }} [hooks]
 */
function applyPostBatchPipeline(subtitlePaths, options = {}, hooks = {}) {
    const doNoise = options.postBatchRemoveNoise !== false;
    const doCompressRep = options.postBatchCompressRepetition !== false;
    const doCps = options.postBatchCpsSplit === true;
    if (!doNoise && !doCompressRep && !doCps) {
        return { ok: true, skipped: true, processed: [] };
    }

    const { applySubtitlePostprocess } = require('./extensions-bridge');
    const targets = (Array.isArray(subtitlePaths) ? subtitlePaths : [subtitlePaths])
        .filter(Boolean)
        .map((p) => path.resolve(String(p)))
        .filter((subPath) => /\.(srt|vtt|lrc)$/i.test(subPath));
    const unique = [...new Set(targets)];
    const processed = [];

    for (const subPath of unique) {
        if (!fs.existsSync(subPath)) continue;
        hooks.onProgress?.({
            detail: doNoise ? '后处理：清理杂音/幻觉…' : '后处理字幕…',
            path: subPath,
        });
        try {
            // Source/JA tracks may drop Whisper junk cues. Translation tracks must keep
            // the same cue count as the timeline — blank noise instead of deleting.
            const base = path.basename(subPath);
            const isSourceTrack = /\.src\.|_src\.|\.source\./i.test(base)
                || /[.\\_-]ja(?:\.|$)/i.test(base);
            const pp = applySubtitlePostprocess(subPath, {
                cpsSplit: doCps,
                removeNoise: doNoise,
                removeHallucinations: doNoise,
                compressRepetition: doCompressRep,
                // Consecutive identical moans are valid on ZH; only dedupe JA source.
                removeDuplicates: doNoise && isSourceTrack,
                blankInsteadOfRemove: doNoise && !isSourceTrack,
                fixOverlap: true,
                enforceMaxDur: true,
            });
            processed.push({ path: subPath, result: pp });
            if (pp?.ok && (pp.noise?.stats || pp.jaStitch?.stats || pp.jaAsrDomain?.changed)) {
                const bits = [];
                if (pp.jaStitch?.summary) bits.push(pp.jaStitch.summary);
                if (pp.noise?.summary) bits.push(pp.noise.summary);
                if (pp.jaAsrDomain?.summary) bits.push(pp.jaAsrDomain.summary);
                hooks.onLog?.(
                    `后处理 ${path.basename(subPath)} · ${bits.join(' · ') || '完成'}`,
                );
            }
        } catch (err) {
            hooks.onLog?.(`后处理跳过：${err.message || err}`);
        }
    }

    return { ok: true, skipped: false, processed };
}

module.exports = {
    applyPostBatchPipeline,
};
