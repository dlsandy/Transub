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
 * Basename stem for JA↔ZH pairing (no directory).
 * Engine often writes JA under transcript-keep and ZH next to the video — different
 * folders must still pair, otherwise ZH-only removeEmpty orphans JA cues.
 *
 * @param {string} filePath
 * @param {(p: string) => boolean} isSourceTrack
 */
function stemKeyForPairing(filePath, isSourceTrack) {
    const base = path.basename(String(filePath || ''));
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
    return String(stem || '').toLowerCase();
}

/**
 * Pick JA source for a ZH target: prefer same directory, else first stem match.
 * @param {Map<string, string[]>} sourcesByStem
 * @param {string} zhPath
 * @param {(p: string) => boolean} isSourceTrack
 * @returns {string}
 */
function resolveSourceForTarget(sourcesByStem, zhPath, isSourceTrack) {
    const stem = stemKeyForPairing(zhPath, isSourceTrack);
    const candidates = sourcesByStem.get(stem) || [];
    if (!candidates.length) return '';
    const zhDir = path.dirname(path.resolve(String(zhPath || '')));
    const sameDir = candidates.find(
        (p) => path.dirname(path.resolve(String(p || ''))) === zhDir,
    );
    return sameDir || candidates[0] || '';
}

/**
 * @param {string[]} subtitlePaths
 * @param {object} options - batch/runtime options with postBatch* flags
 * @param {{ onProgress?: (info: object) => void, onLog?: (line: string) => void }} [hooks]
 */
function applyPostBatchPipeline(subtitlePaths, options = {}, hooks = {}) {
    const doNoise = options.postBatchRemoveNoise !== false;
    const doCompressRep = options.postBatchCompressRepetition !== false;
    const viewingPunctMode = (() => {
        const raw = options.postBatchViewingPunctMode;
        const v = String(raw ?? '').trim().toLowerCase();
        if (v === 'off' || v === 'light' || v === 'clear') return v;
        if (options.postBatchSimplifyViewingPunctuation === false) return 'off';
        if (options.postBatchSimplifyViewingPunctuation === true) return 'light';
        return 'clear';
    })();
    const interjectionMode = (() => {
        const v = String(options.postBatchInterjectionMode ?? '').trim().toLowerCase();
        if (v === 'off' || v === 'light' || v === 'clear') return v;
        return options.postBatchCompactPureInterjections === false ? 'off' : 'clear';
    })();
    const onomatopoeiaMode = (() => {
        const v = String(options.postBatchOnomatopoeiaMode ?? '').trim().toLowerCase();
        if (v === 'off' || v === 'light' || v === 'clear') return v;
        return options.postBatchCompactPureInterjections === false ? 'off' : 'clear';
    })();
    const doViewingPunct = viewingPunctMode !== 'off';
    const doSoftenDiscourse = interjectionMode === 'light';
    const doSoftenOnomatopoeia = onomatopoeiaMode === 'light';
    const doBilingualClear = interjectionMode === 'clear' || onomatopoeiaMode === 'clear';
    const doCps = options.postBatchCpsSplit === true;
    if (!doNoise && !doCompressRep && !doCps && !doViewingPunct
        && !doSoftenDiscourse && !doSoftenOnomatopoeia && !doBilingualClear) {
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

    /** @type {Map<string, string[]>} */
    const sourcesByStem = new Map();
    for (const src of sources) {
        const stem = stemKeyForPairing(src, isSourceTrack);
        if (!stem) continue;
        const list = sourcesByStem.get(stem) || [];
        list.push(src);
        sourcesByStem.set(stem, list);
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

    const memorySourceCues = Array.isArray(options.sourceCues) ? options.sourceCues : null;

    // 1) Paired JA↔ZH noise deletion (true delete, keep counts aligned).
    if (doNoise && typeof removeNoiseFromSubtitlePair === 'function') {
        for (const zhPath of nonSources) {
            let srcPath = resolveSourceForTarget(sourcesByStem, zhPath, isSourceTrack);
            if (srcPath && !fs.existsSync(srcPath)) srcPath = '';
            const pairOpts = { ...pairNoiseOpts };
            if (!srcPath && memorySourceCues?.length) {
                pairOpts.sourceCues = memorySourceCues;
            } else if (!srcPath) {
                continue;
            }
            hooks.onProgress?.({
                detail: '后处理：成对清理杂音/幻觉…',
                path: zhPath,
            });
            try {
                const pairRes = removeNoiseFromSubtitlePair(zhPath, srcPath, pairOpts);
                processed.push({
                    path: zhPath,
                    sourcePath: srcPath || undefined,
                    result: pairRes,
                    paired: true,
                    memorySource: !srcPath,
                });
                if (pairRes?.ok && !pairRes.skipped) {
                    done.add(zhPath);
                    if (srcPath) done.add(srcPath);
                    if (pairRes.removed || pairRes.written) {
                        hooks.onLog?.(
                            `后处理 ${path.basename(zhPath)}`
                            + (srcPath ? ` ↔ ${path.basename(srcPath)}` : ' ↔ (内存原文)')
                            + ` · ${pairRes.summary || '成对清噪完成'}`,
                        );
                    }
                } else if (pairRes?.ok && (srcPath || memorySourceCues?.length)) {
                    // Pair resolved (incl. 0 removals). Mark ZH done so unpaired
                    // removeEmpty never runs against a translated track.
                    done.add(zhPath);
                    if (srcPath) done.add(srcPath);
                }
            } catch (err) {
                hooks.onLog?.(`成对清噪跳过：${err.message || err}`);
            }
        }
    }

    // 2) Per-file CPS / compress / leftover noise (delete, never blank to …).
    for (const subPath of unique) {
        if (done.has(subPath) && !doCps && !doCompressRep && !doViewingPunct
            && !doSoftenDiscourse && !doSoftenOnomatopoeia && !doBilingualClear) continue;
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
                viewingPunctMode,
                simplifyViewingPunctuation: doViewingPunct,
                softenDiscourseFillers: doSoftenDiscourse,
                softenOnomatopoeiaFillers: doSoftenOnomatopoeia,
                dropBilingualPureFillers: doBilingualClear,
                dropBilingualDiscourse: interjectionMode === 'clear',
                dropBilingualOnomatopoeia: onomatopoeiaMode === 'clear',
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
                if (pp.viewingPunct?.summary && pp.viewingPunct.stats?.cueTouched) {
                    bits.push(pp.viewingPunct.summary);
                }
                if (pp.fillerSoften?.summary && pp.fillerSoften.stats?.cueTouched) {
                    bits.push(pp.fillerSoften.summary);
                }
                if (pp.bilingualFillerDrop?.summary && pp.bilingualFillerDrop.dropped) {
                    bits.push(pp.bilingualFillerDrop.summary);
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
    resolveSourceForTarget,
};
