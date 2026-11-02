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
        .replace(/\.transcribe$/i, '')
        .replace(/\.original$/i, '')
        .replace(/\.ja$/i, '')
        .replace(/_ja$/i, '')
        .replace(/\.zh$/i, '')
        .replace(/_zh$/i, '')
        .replace(/\.zh-Hans$/i, '')
        .replace(/\.zh-Hant$/i, '')
        .replace(/\.zh-cn$/i, '')
        .replace(/\.zh-tw$/i, '');
    // Also strip trailing dual-target suffix tokens when not a source track.
    if (!isSourceTrack(filePath)) {
        stem = stem.replace(/\.(?:zh|chs|cht|cn|tw|zh-cn|zh-tw)$/i, '');
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
 * Build isSourceTrack: basename markers + explicit JA paths + ASR-only batches.
 * Custom keep dirs often write plain `Stem.srt` without `.ja.` / `.transcribe.` —
 * those must still get stitchJaFragments / JA noise deletion.
 *
 * @param {object} options
 * @param {(p: string) => boolean} [isSourceSubtitleTrack]
 * @returns {(p: string) => boolean}
 */
function buildPostBatchIsSourceTrack(options = {}, isSourceSubtitleTrack = null) {
    const explicit = new Set();
    const pushPath = (raw) => {
        const s = String(raw || '').trim();
        if (!s) return;
        try {
            explicit.add(path.resolve(s));
        } catch {
            /* ignore */
        }
    };
    pushPath(options.sourceSubtitlePath);
    if (Array.isArray(options.jaSourcePaths)) {
        for (const p of options.jaSourcePaths) pushPath(p);
    }
    const task = String(options.engineTask || options.task || '').trim().toLowerCase();
    // ASR-only: every listed subtitle is JA source (no ZH yet).
    const asrOnly = task === 'transcribe' || task === 'asr';

    return (subPath) => {
        const resolved = (() => {
            try {
                return path.resolve(String(subPath || ''));
            } catch {
                return '';
            }
        })();
        if (resolved && explicit.has(resolved)) return true;
        if (typeof isSourceSubtitleTrack === 'function' && isSourceSubtitleTrack(subPath)) {
            return true;
        }
        const base = path.basename(String(subPath || ''));
        if (/\.src\.|_src\.|\.source\./i.test(base)
            || /\.transcribe\./i.test(base)
            || /_transcribe\./i.test(base)
            || /\.original\./i.test(base)
            || /_original\./i.test(base)
            || /[.\\_-]ja(?:\.|$)/i.test(base)) {
            return true;
        }
        return asrOnly;
    };
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
        let mode;
        const v = String(options.postBatchInterjectionMode ?? '').trim().toLowerCase();
        if (v === 'off' || v === 'light' || v === 'clear') mode = v;
        else mode = options.postBatchCompactPureInterjections === false ? 'off' : 'clear';
        try {
            const soft = require('../src/js/av-soft-viewing-policy-core');
            return soft.resolveAvSoftViewingCleanMode(options, mode);
        } catch {
            return mode;
        }
    })();
    const onomatopoeiaMode = (() => {
        let mode;
        const v = String(options.postBatchOnomatopoeiaMode ?? '').trim().toLowerCase();
        if (v === 'off' || v === 'light' || v === 'clear') mode = v;
        else mode = options.postBatchCompactPureInterjections === false ? 'off' : 'clear';
        try {
            const soft = require('../src/js/av-soft-viewing-policy-core');
            return soft.resolveAvSoftViewingCleanMode(options, mode);
        } catch {
            return mode;
        }
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

    const isSourceTrack = buildPostBatchIsSourceTrack(options, isSourceSubtitleTrack);

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

    const pairNoiseOpts = (() => {
        let slotCore;
        try {
            slotCore = require('../src/js/mt-subtitle-slot-core');
        } catch {
            slotCore = null;
        }
        const base = slotCore?.buildSourceTrackNoiseOptions
            ? slotCore.buildSourceTrackNoiseOptions({
                removeEmpty: true,
                removeFragments: true,
                removeSoundEffects: true,
                removeSymbolOnly: true,
                removeDuplicates: true,
                removeHallucinations: true,
            })
            : {
                removeEmpty: true,
                removeFragments: true,
                removeSoundEffects: true,
                removeSymbolOnly: true,
                removeDuplicates: true,
                removeHallucinations: true,
            };
        return { ...base, backupMode: 'off' };
    })();

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

    // Explicit JA path from engine (e.g. *.transcribe.srt) when stem pairing is thin.
    const explicitSource = String(options.sourceSubtitlePath || '').trim();

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
            let pairedSource = '';
            if (!sourceTrack) {
                pairedSource = resolveSourceForTarget(sourcesByStem, subPath, isSourceTrack)
                    || (explicitSource && fs.existsSync(explicitSource) ? path.resolve(explicitSource) : '');
                if (
                    pairedSource
                    && path.resolve(pairedSource) === path.resolve(subPath)
                ) {
                    pairedSource = '';
                }
            }
            // Paired ZH must not CPS-split alone — count drift → index 错位 (DLDSS-533).
            const allowZhCps = doCps && (sourceTrack || !pairedSource);
            const pp = applySubtitlePostprocess(subPath, {
                cpsSplit: allowZhCps,
                // Skip noise when this file was already handled by paired deletion.
                removeNoise: doNoise && !alreadyPairedNoise,
                removeHallucinations: doNoise && !alreadyPairedNoise,
                compressRepetition: doCompressRep,
                viewingPunctMode,
                simplifyViewingPunctuation: doViewingPunct,
                softenDiscourseFillers: doSoftenDiscourse,
                softenOnomatopoeiaFillers: doSoftenOnomatopoeia,
                // 清除档：行内剥「唉，啊…」等前置/夹杂语气，保留句末「好棒啊」
                stripInlineFillers: doBilingualClear,
                stripInlineDiscourse: interjectionMode === 'clear',
                stripInlineOnomatopoeia: onomatopoeiaMode === 'clear',
                dropBilingualPureFillers: doBilingualClear,
                dropBilingualDiscourse: interjectionMode === 'clear',
                dropBilingualOnomatopoeia: onomatopoeiaMode === 'clear',
                removeDuplicates: doNoise && !alreadyPairedNoise && sourceTrack,
                blankInsteadOfRemove: false,
                stitchJaFragments: sourceTrack && !alreadyPairedNoise,
                // Preserve ASR start times; overlap trim-only is safer for dense dialogue.
                fixOverlap: false,
                enforceMaxDur: true,
                minSplitDurMs: 2800,
            });
            processed.push({ path: subPath, result: pp });

            if (!sourceTrack && pairedSource) {
                try {
                    const { rematerializeSubtitlePairFiles } = require('./mt-pair-rematerialize');
                    const laid = rematerializeSubtitlePairFiles(subPath, pairedSource, {
                        backupMode: 'off',
                        onlyWhenCountDiffers: true,
                    });
                    if (laid?.written) {
                        hooks.onLog?.(
                            `后处理 ${path.basename(subPath)} · 已按原文时间轴重铺译文 `
                            + `(${laid.beforeCount}→${laid.afterCount})`,
                        );
                        pp.rematerialize = laid;
                    }
                } catch (err) {
                    hooks.onLog?.(`译文重铺跳过：${err.message || err}`);
                }
            }

            if (pp?.ok && (pp.noise?.stats || pp.jaStitch?.stats || pp.jaAsrDomain?.changed
                || pp.trailingEllipsis?.changed || pp.written || pp.rematerialize?.written)) {
                const bits = [];
                if (pp.jaStitch?.summary) bits.push(pp.jaStitch.summary);
                if (pp.trailingEllipsis?.summary) bits.push(pp.trailingEllipsis.summary);
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
                if (pp.inlineFillerStrip?.summary
                    && (pp.inlineFillerStrip.stats?.cueTouched || pp.inlineFillerStrip.stats?.dropped)) {
                    bits.push(pp.inlineFillerStrip.summary);
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
    buildPostBatchIsSourceTrack,
};
