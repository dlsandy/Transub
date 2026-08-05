/**
 * Shared post-batch subtitle cleanup (noise / hallucination / CPS / repetition).
 * Used by Transub engine and TWAI backends so the same settings produce the same cleanup.
 *
 * Noise is deleted (not blanked to 「…」). When a JA source + ZH target pair is present
 * and cue counts match, noisy indexes are removed from both tracks together to keep
 * JA↔ZH alignment.
 */

const fs = require('fs');
const path = require('path');

/**
 * @param {string} filePath
 * @param {(p: string) => boolean} isSourceTrack
 */
function stemKeyForPairing(filePath, isSourceTrack) {
    const base = path.basename(String(filePath || ''));
    const dir = path.dirname(path.resolve(String(filePath || '')));
    let stem = base.replace(/\.(srt|vtt|lrc)$/i, '');
    stem = stem
        .replace(/\.src\.partial$/i, '')
        .replace(/\.src$/i, '')
        .replace(/_src$/i, '')
        .replace(/\.source$/i, '')
        .replace(/\.ja$/i, '')
        .replace(/_ja$/i, '')
        .replace(/\.zh$/i, '')
        .replace(/_zh$/i, '')
        .replace(/\.zh-Hans$/i, '')
        .replace(/\.zh-Hant$/i, '');
    // Also strip trailing dual-target suffix tokens when not a source track.
    if (!isSourceTrack(filePath)) {
        stem = stem.replace(/\.(?:zh|chs|cht|cn|tw)$/i, '');
    }
    return `${dir}::${stem.toLowerCase()}`;
}

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

    const {
        applySubtitlePostprocess,
        isSourceSubtitleTrack,
        removeNoiseFromSubtitlePair,
    } = require('./extensions-bridge');
    const targets = (Array.isArray(subtitlePaths) ? subtitlePaths : [subtitlePaths])
        .filter(Boolean)
        .map((p) => path.resolve(String(p)))
        .filter((subPath) => /\.(srt|vtt|lrc)$/i.test(subPath));
    const unique = [...new Set(targets)].filter((subPath) => fs.existsSync(subPath));
    const processed = [];
    const done = new Set();

    const isSourceTrack = (subPath) => (typeof isSourceSubtitleTrack === 'function'
        ? isSourceSubtitleTrack(subPath)
        : (/\.src\.|_src\.|\.source\./i.test(path.basename(subPath))
            || /[.\\_-]ja(?:\.|$)/i.test(path.basename(subPath))));

    const sources = unique.filter((p) => isSourceTrack(p));
    const nonSources = unique.filter((p) => !isSourceTrack(p));

    /** @type {Map<string, string>} */
    const sourceByStem = new Map();
    for (const src of sources) {
        sourceByStem.set(stemKeyForPairing(src, isSourceTrack), src);
    }

    const pairNoiseOpts = {
        removeEmpty: true,
        removeFragments: true,
        removeSoundEffects: true,
        removeSymbolOnly: true,
        removeDuplicates: true,
        removeHallucinations: true,
        backupMode: 'off',
    };

    // 1) Paired JA↔ZH noise deletion (true delete, keep counts aligned).
    if (doNoise && typeof removeNoiseFromSubtitlePair === 'function') {
        for (const zhPath of nonSources) {
            const srcPath = sourceByStem.get(stemKeyForPairing(zhPath, isSourceTrack));
            if (!srcPath || !fs.existsSync(srcPath)) continue;
            hooks.onProgress?.({
                detail: '后处理：成对清理杂音/幻觉…',
                path: zhPath,
            });
            try {
                const pairRes = removeNoiseFromSubtitlePair(zhPath, srcPath, pairNoiseOpts);
                processed.push({ path: zhPath, sourcePath: srcPath, result: pairRes, paired: true });
                if (pairRes?.ok && !pairRes.skipped) {
                    done.add(zhPath);
                    done.add(srcPath);
                    if (pairRes.removed || pairRes.written) {
                        hooks.onLog?.(
                            `后处理 ${path.basename(zhPath)}`
                            + ` ↔ ${path.basename(srcPath)} · ${pairRes.summary || '成对清噪完成'}`,
                        );
                    }
                }
            } catch (err) {
                hooks.onLog?.(`成对清噪跳过：${err.message || err}`);
            }
        }
    }

    // 2) Per-file CPS / compress / leftover noise (delete, never blank to …).
    for (const subPath of unique) {
        if (done.has(subPath) && !doCps && !doCompressRep) continue;
        const alreadyPairedNoise = done.has(subPath);
        hooks.onProgress?.({
            detail: doNoise && !alreadyPairedNoise ? '后处理：清理杂音/幻觉…' : '后处理字幕…',
            path: subPath,
        });
        try {
            const sourceTrack = isSourceTrack(subPath);
            const pp = applySubtitlePostprocess(subPath, {
                cpsSplit: doCps,
                // Skip noise when this file was already handled by paired deletion.
                removeNoise: doNoise && !alreadyPairedNoise,
                removeHallucinations: doNoise && !alreadyPairedNoise,
                compressRepetition: doCompressRep,
                removeDuplicates: doNoise && !alreadyPairedNoise && sourceTrack,
                blankInsteadOfRemove: false,
                stitchJaFragments: sourceTrack && !alreadyPairedNoise,
                fixOverlap: true,
                enforceMaxDur: true,
            });
            processed.push({ path: subPath, result: pp });
            if (pp?.ok && (pp.noise?.stats || pp.jaStitch?.stats || pp.jaAsrDomain?.changed || pp.written)) {
                const bits = [];
                if (pp.jaStitch?.summary) bits.push(pp.jaStitch.summary);
                if (pp.noise?.summary) bits.push(pp.noise.summary);
                if (pp.jaAsrDomain?.summary) bits.push(pp.jaAsrDomain.summary);
                if (pp.cpsSplit?.summary) bits.push(pp.cpsSplit.summary);
                if (pp.compressRep?.summary && pp.compressRep.stats?.cueTouched) {
                    bits.push(pp.compressRep.summary.replace(/^将/, '已'));
                }
                if (bits.length) {
                    hooks.onLog?.(
                        `后处理 ${path.basename(subPath)} · ${bits.join(' · ') || '完成'}`,
                    );
                }
            }
        } catch (err) {
            hooks.onLog?.(`后处理跳过：${err.message || err}`);
        }
    }

    return { ok: true, skipped: false, processed };
}

module.exports = {
    applyPostBatchPipeline,
    stemKeyForPairing,
};
