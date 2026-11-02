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

    let echoRemoved = 0;
    let stitchMerged = 0;
    let prevBleedStripped = 0;
    let incompleteMerged = 0;
    try {
        const structure = require('../src/js/asr-cue-structure-core');
        // Later-sentence prefix stuck on earlier cue — strip before echo dedupe/merge.
        if (options.stripPrevPrefixBleed !== false
            && typeof structure.stripPrevNeighborPrefixBleed === 'function') {
            const bled = structure.stripPrevNeighborPrefixBleed(cues, {
                maxGapMs: options.prevBleedMaxGapMs,
                minOverlap: options.prevBleedMinOverlap,
                maxOverlap: options.prevBleedMaxOverlap,
            });
            if (bled.stripped > 0) {
                cues = bled.cues || cues;
                prevBleedStripped = Number(bled.stripped) || 0;
                stages.push({
                    stage: 'prev_prefix_bleed',
                    total: prevBleedStripped,
                    summary: structure.summarizePrevBleedStrip?.(bled.stats)
                        || `剥离前句窜入 ${prevBleedStripped}`,
                });
            }
        }
    } catch { /* optional */ }

    try {
        const fluency = require('../src/js/subtitle-fluency-core');
        // Drop leftover ASR echoes before mid-phrase stitch (この勃起は… after つまり、この勃起は…).
        if (options.dedupeAsrEchoes !== false && typeof fluency.dedupeAsrEchoCues === 'function') {
            const deduped = fluency.dedupeAsrEchoCues(cues, {
                maxGapMs: options.asrEchoMaxGapMs,
                shortReactiveMaxGapMs: options.asrEchoShortReactiveMaxGapMs,
            });
            if (deduped.removed > 0) {
                cues = deduped.cues || cues;
                echoRemoved = Number(deduped.removed) || 0;
                stages.push({
                    stage: 'asr_echo',
                    total: echoRemoved,
                    summary: fluency.summarizeAsrEchoDedupe?.(deduped.stats)
                        || `去除回声重复 ${echoRemoved}`,
                });
            }
        }
        if (options.stitchJaFragments !== false && typeof fluency.stitchJaFragmentCues === 'function') {
            const stitched = fluency.stitchJaFragmentCues(cues, {
                maxGapMs: options.jaStitchMaxGapMs,
                wideGapMs: options.jaStitchWideGapMs,
                phraseGapMs: options.jaStitchPhraseGapMs,
                maxMergedDurMs: options.jaStitchMaxMergedDurMs,
                phraseStitch: options.phraseStitch !== false,
            });
            if (stitched.mergedPairs > 0) {
                cues = stitched.cues || cues;
                stitchMerged = Number(stitched.mergedPairs) || 0;
                stages.push({
                    stage: 'ja_stitch',
                    total: stitchMerged,
                    summary: fluency.summarizeJaStitch?.(stitched.stats) || `拼接日语断词 ${stitchMerged}`,
                });
            }
        }
    } catch { /* optional */ }

    let overlongSplit = 0;
    try {
        const structure = require('../src/js/asr-cue-structure-core');
        // Same-clause short JA fragments that stitch rules missed (tight gap only).
        if (options.mergeIncompleteJa !== false
            && typeof structure.mergeIncompleteJaNeighborCues === 'function') {
            const merged = structure.mergeIncompleteJaNeighborCues(cues, {
                maxGapMs: options.incompleteJaMaxGapMs,
                maxMergedDurMs: options.incompleteJaMaxMergedDurMs,
                maxMergedChars: options.incompleteJaMaxMergedChars,
            });
            if (merged.mergedPairs > 0) {
                cues = merged.cues || cues;
                incompleteMerged = Number(merged.mergedPairs) || 0;
                stages.push({
                    stage: 'incomplete_ja_merge',
                    total: incompleteMerged,
                    summary: structure.summarizeIncompleteMerge?.(merged.stats)
                        || `合并未完成句 ${incompleteMerged}`,
                });
            }
        }
        // After merge/stitch: split welded multi-turn JA so MT sees natural clauses.
        if (options.splitOverlongJa !== false
            && typeof structure.splitOverlongJaMultiClauseCues === 'function') {
            const split = structure.splitOverlongJaMultiClauseCues(cues, {
                minBareChars: options.overlongJaMinBareChars,
            });
            if (split.splitCount > 0) {
                cues = split.cues || cues;
                overlongSplit = Number(split.splitCount) || 0;
                stages.push({
                    stage: 'overlong_ja_split',
                    total: overlongSplit,
                    summary: structure.summarizeOverlongSplit?.(split.stats)
                        || `拆分过长多义句 ${overlongSplit}`,
                });
            }
        }
    } catch { /* optional */ }

    let trailingEllipsisStripped = 0;
    if (options.stripAsrTrailingEllipsis !== false) {
        try {
            const fluency = require('../src/js/subtitle-fluency-core');
            if (typeof fluency.stripAsrDecorativeTrailingEllipsisInCues === 'function') {
                const stripped = fluency.stripAsrDecorativeTrailingEllipsisInCues(cues);
                if (stripped.changed > 0) {
                    cues = stripped.cues || cues;
                    trailingEllipsisStripped = Number(stripped.changed) || 0;
                    stages.push({
                        stage: 'trailing_ellipsis',
                        total: trailingEllipsisStripped,
                        summary: `去除句尾装饰省略号 ${trailingEllipsisStripped} 条`,
                    });
                }
            }
        } catch { /* optional */ }
    }

    const changed = nameLoopsChanged + domainChanged + echoRemoved + stitchMerged
        + trailingEllipsisStripped + prevBleedStripped + incompleteMerged + overlongSplit;
    const parts = [];
    if (nameLoopsChanged) parts.push(`姓名环 ${nameLoopsChanged}`);
    if (domainChanged) parts.push(`域修正 ${domainChanged}`);
    if (prevBleedStripped) parts.push(`前句窜入 ${prevBleedStripped}`);
    if (echoRemoved) parts.push(`回声 ${echoRemoved}`);
    if (stitchMerged) parts.push(`断词拼接 ${stitchMerged}`);
    if (incompleteMerged) parts.push(`碎句合并 ${incompleteMerged}`);
    if (overlongSplit) parts.push(`长句拆分 ${overlongSplit}`);
    if (trailingEllipsisStripped) parts.push(`句尾省略号 ${trailingEllipsisStripped}`);
    return {
        cues,
        nameLoopsChanged,
        domainChanged,
        echoRemoved,
        stitchMerged,
        prevBleedStripped,
        incompleteMerged,
        overlongSplit,
        trailingEllipsisStripped,
        changed,
        summary: changed ? `ASR 清理：${parts.join(' · ')}` : 'ASR 清理：无变更',
        stages,
    };
}

module.exports = {
    cuesToMsShape,
    cleanupAsrCues,
};
