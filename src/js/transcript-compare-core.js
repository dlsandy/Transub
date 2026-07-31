/**
 * 转录原文缓存对照：时间对齐、Diff、区间恢复（浏览器与 Node 共用）
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubTranscriptCompare = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function transcriptCompareCoreFactory() {
    function cueEndMs(cue) {
        if (!cue) return 0;
        if (cue.endMs != null && Number.isFinite(Number(cue.endMs))) return Number(cue.endMs);
        return (Number(cue.startMs) || 0) + 2000;
    }

    function overlapMs(aStart, aEnd, bStart, bEnd) {
        const start = Math.max(aStart, bStart);
        const end = Math.min(aEnd, bEnd);
        return Math.max(0, end - start);
    }

    function normalizeText(text) {
        return String(text || '').replace(/\s+/g, ' ').trim();
    }

    /**
     * Best overlap / nearest match (mirrors dual-subtitle-core.findBestOverlapCue).
     */
    function findBestOverlapCue(cues, startMs, endMs, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const start = Number(startMs) || 0;
        const end = Math.max(start, Number(endMs) || start);
        const maxStartGapMs = Number(options.maxStartGapMs);
        const gapLimit = Number.isFinite(maxStartGapMs) ? Math.max(0, maxStartGapMs) : 800;

        let best = null;
        let bestOverlap = 0;
        for (let i = 0; i < list.length; i += 1) {
            const cue = list[i];
            if (!cue) continue;
            const cStart = Number(cue.startMs) || 0;
            const cEnd = cueEndMs(cue);
            const ov = overlapMs(start, end, cStart, cEnd);
            if (ov > bestOverlap) {
                bestOverlap = ov;
                best = { cue, index: i, overlapMs: ov, match: 'overlap' };
            }
        }
        if (best) return best;

        let nearest = null;
        let nearestGap = Infinity;
        for (let i = 0; i < list.length; i += 1) {
            const cue = list[i];
            if (!cue) continue;
            const cStart = Number(cue.startMs) || 0;
            const cEnd = cueEndMs(cue);
            let gap = 0;
            if (end < cStart) gap = cStart - end;
            else if (start > cEnd) gap = start - cEnd;
            else gap = 0;
            if (gap < nearestGap) {
                nearestGap = gap;
                nearest = { cue, index: i, overlapMs: 0, match: 'nearest', gapMs: gap };
            }
        }
        if (nearest && nearest.gapMs <= gapLimit) return nearest;
        return { cue: null, index: -1, overlapMs: 0, match: 'none' };
    }

    /**
     * Diff current cues against kept/original ASR cues.
     * @returns {{ missingInCurrent: object[], onlyInCurrent: object[], textChanged: object[], stats: object }}
     */
    function diffAgainstOriginal(currentCues, originalCues, options = {}) {
        const current = Array.isArray(currentCues) ? currentCues : [];
        const original = Array.isArray(originalCues) ? originalCues : [];
        const minOverlapRatio = Math.max(0.05, Math.min(0.95, Number(options.minOverlapRatio) || 0.25));

        const matchedOrig = new Set();
        const textChanged = [];
        const onlyInCurrent = [];

        for (let i = 0; i < current.length; i += 1) {
            const cue = current[i];
            if (!cue) continue;
            const start = Number(cue.startMs) || 0;
            const end = cueEndMs(cue);
            const dur = Math.max(1, end - start);
            const hit = findBestOverlapCue(original, start, end, options);
            if (!hit.cue || hit.match === 'none') {
                onlyInCurrent.push({
                    currentIndex: i,
                    current: cue,
                    reason: 'no_original',
                });
                continue;
            }
            const ovRatio = (hit.overlapMs || 0) / dur;
            if (hit.match === 'overlap' && ovRatio < minOverlapRatio && hit.match !== 'nearest') {
                onlyInCurrent.push({
                    currentIndex: i,
                    current: cue,
                    reason: 'weak_overlap',
                });
                continue;
            }
            matchedOrig.add(hit.index);
            const curText = normalizeText(cue.text);
            const origText = normalizeText(hit.cue.text);
            if (curText !== origText) {
                textChanged.push({
                    currentIndex: i,
                    originalIndex: hit.index,
                    current: cue,
                    original: hit.cue,
                    match: hit.match,
                    overlapMs: hit.overlapMs || 0,
                });
            }
        }

        const missingInCurrent = [];
        for (let j = 0; j < original.length; j += 1) {
            if (matchedOrig.has(j)) continue;
            const orig = original[j];
            if (!orig || !normalizeText(orig.text)) continue;
            missingInCurrent.push({
                originalIndex: j,
                original: orig,
                reason: 'removed_or_unmatched',
            });
        }

        return {
            missingInCurrent,
            onlyInCurrent,
            textChanged,
            stats: {
                currentCount: current.length,
                originalCount: original.length,
                missing: missingInCurrent.length,
                onlyCurrent: onlyInCurrent.length,
                textChanged: textChanged.length,
            },
        };
    }

    /**
     * Restore original cues that fall inside [rangeStartMs, rangeEndMs]
     * and are missing (or weakly matched) in current.
     * @returns {{ cues: object[], inserted: number, replaced: number }}
     */
    function restoreRangeFromOriginal(currentCues, originalCues, rangeStartMs, rangeEndMs, options = {}) {
        const current = (Array.isArray(currentCues) ? currentCues : []).map((c) => ({ ...c }));
        const original = Array.isArray(originalCues) ? originalCues : [];
        const rStart = Math.max(0, Number(rangeStartMs) || 0);
        const rEnd = Math.max(rStart, Number(rangeEndMs) || rStart);
        const replaceWeak = options.replaceWeak !== false;
        const minOverlapRatio = Math.max(0.05, Math.min(0.95, Number(options.minOverlapRatio) || 0.35));

        let inserted = 0;
        let replaced = 0;

        const inRange = original.filter((cue) => {
            if (!cue) return false;
            const start = Number(cue.startMs) || 0;
            const end = cueEndMs(cue);
            return overlapMs(rStart, rEnd, start, end) > 0 && normalizeText(cue.text);
        });

        for (const orig of inRange) {
            const start = Number(orig.startMs) || 0;
            const end = cueEndMs(orig);
            const dur = Math.max(1, end - start);
            const hit = findBestOverlapCue(current, start, end, { maxStartGapMs: 120 });
            const ovRatio = hit.cue ? (hit.overlapMs || 0) / dur : 0;
            const weak = !hit.cue || hit.match === 'none'
                || (hit.match === 'overlap' && ovRatio < minOverlapRatio);

            if (weak) {
                current.push({
                    startMs: start,
                    endMs: end,
                    text: String(orig.text || ''),
                });
                inserted += 1;
                continue;
            }
            if (replaceWeak && normalizeText(hit.cue.text) !== normalizeText(orig.text)) {
                // Prefer restoring ASR text when current looks like noise fragment
                const curLen = normalizeText(hit.cue.text).length;
                const origLen = normalizeText(orig.text).length;
                if (curLen <= 2 || origLen >= curLen * 1.5) {
                    hit.cue.text = String(orig.text || '');
                    hit.cue.startMs = start;
                    hit.cue.endMs = end;
                    replaced += 1;
                }
            }
        }

        current.sort((a, b) => (Number(a.startMs) || 0) - (Number(b.startMs) || 0));
        current.forEach((c, i) => {
            c.index = i + 1;
        });

        return { cues: current, inserted, replaced };
    }

    /**
     * Attach sourceText from original/kept cues onto a payload list.
     */
    function attachSourceText(cues, originalCues, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const original = Array.isArray(originalCues) ? originalCues : [];
        if (!original.length) return list.map((c) => ({ ...c }));
        return list.map((cue) => {
            const start = Number(cue?.startMs) || 0;
            const end = cueEndMs(cue);
            const hit = findBestOverlapCue(original, start, end, options);
            const sourceText = String(hit?.cue?.text || '').trim();
            return {
                ...cue,
                sourceText: sourceText || String(cue.sourceText || ''),
            };
        });
    }

    function summarizeDiff(diff) {
        const s = diff?.stats || {};
        const parts = [];
        if (s.missing) parts.push(`原文多 ${s.missing} 条`);
        if (s.onlyCurrent) parts.push(`当前多 ${s.onlyCurrent} 条`);
        if (s.textChanged) parts.push(`文案不同 ${s.textChanged} 条`);
        return parts.length ? parts.join(' · ') : '与原文一致';
    }

    function daysUntilExpiry(mtimeMs, keepDays) {
        const days = Number(keepDays);
        if (!Number.isFinite(days) || days <= 0) return null;
        const mtime = Number(mtimeMs) || 0;
        if (!mtime) return null;
        const expireAt = mtime + days * 24 * 60 * 60 * 1000;
        return Math.ceil((expireAt - Date.now()) / (24 * 60 * 60 * 1000));
    }

    return {
        cueEndMs,
        overlapMs,
        normalizeText,
        findBestOverlapCue,
        diffAgainstOriginal,
        restoreRangeFromOriginal,
        attachSourceText,
        summarizeDiff,
        daysUntilExpiry,
    };
}));
