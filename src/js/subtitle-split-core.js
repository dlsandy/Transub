/**
 * 字幕分割核心逻辑（浏览器与 Node 测试共用）
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSubtitleSplit = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function subtitleSplitCoreFactory() {
    const STRONG_PUNCT_RE = /[。！？!?…]/;
    const WEAK_PUNCT_RE = /[，、；：,;:]/;
    const CONNECTOR_WORDS = [
        '而且', '但是', '因为', '所以', '然后', '不过', '然而', '并且', '同时', '另外',
        '因此', '于是', '可是', '虽然', '如果', '那么', '或者', '以及',
        'but', 'and then', 'however', 'therefore', 'because', 'so', 'then', 'although',
    ];

    function isConnectedText(text) {
        const raw = String(text || '').trim();
        if (!raw) return false;
        return !/\s/.test(raw);
    }

    function textCharCount(text) {
        return String(text || '').replace(/\s/g, '').length;
    }

    function lineCharCount(text) {
        const lines = String(text || '').split(/\r?\n/);
        return lines.reduce((max, line) => Math.max(max, line.replace(/\s/g, '').length), 0);
    }

    function splitTextByLines(text) {
        return String(text || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    }

    function splitTextBySpaces(text) {
        return String(text || '').trim().split(/\s+/).filter(Boolean);
    }

    function findBestBreakInSlice(slice, minPos) {
        let best = -1;
        let bestScore = -1;
        for (let i = slice.length - 1; i >= minPos; i -= 1) {
            const ch = slice[i];
            let score = 0;
            if (STRONG_PUNCT_RE.test(ch)) score = 4;
            else if (WEAK_PUNCT_RE.test(ch)) score = 3;
            else if (/\s/.test(ch)) score = 2;
            if (score > bestScore) {
                bestScore = score;
                best = i;
            }
        }
        return bestScore >= 2 ? best + 1 : -1;
    }

    function findConnectorBreak(text, maxIndex) {
        let best = -1;
        const lower = String(text || '').toLowerCase();
        for (const word of CONNECTOR_WORDS) {
            const idx = lower.indexOf(word);
            if (idx < 0) continue;
            const breakAt = idx + word.length;
            if (breakAt <= 0 || breakAt > maxIndex || breakAt >= text.length) continue;
            if (breakAt > best) best = breakAt;
        }
        return best;
    }

    function splitTextByCharCount(text, maxChars) {
        const max = Math.max(2, Math.floor(Number(maxChars) || 20));
        let remaining = String(text || '').trim();
        if (isConnectedText(remaining)) return remaining ? [remaining] : [];
        const parts = [];
        while (remaining.length > max) {
            let breakAt = max;
            const slice = remaining.slice(0, max);
            const punctBreak = findBestBreakInSlice(slice, Math.floor(max * 0.4));
            if (punctBreak > 0) breakAt = punctBreak;
            const chunk = remaining.slice(0, breakAt).trim();
            if (!chunk) break;
            parts.push(chunk);
            remaining = remaining.slice(breakAt).trim();
        }
        if (remaining) parts.push(remaining);
        return parts;
    }

    function splitTextSmart(text, opts = {}) {
        const maxChars = Math.max(4, Math.floor(Number(opts.maxChars) || 20));
        const maxLineChars = Math.max(4, Math.floor(Number(opts.maxLineChars) || maxChars));
        const minChars = Math.max(2, Math.floor(Number(opts.minChars) || 4));
        let remaining = String(text || '').trim();
        if (!remaining) return [];
        if (isConnectedText(remaining)) return [remaining];

        const parts = [];
        while (remaining.length > 0) {
            if (remaining.length <= maxChars && lineCharCount(remaining) <= maxLineChars) {
                parts.push(remaining);
                break;
            }

            let limit = Math.min(maxChars, remaining.length);
            if (lineCharCount(remaining.slice(0, limit)) > maxLineChars) {
                limit = Math.min(limit, maxLineChars + 2);
            }

            const slice = remaining.slice(0, limit);
            let breakAt = -1;

            const punctBreak = findBestBreakInSlice(slice, Math.floor(limit * 0.35));
            if (punctBreak > 0) breakAt = punctBreak;

            if (breakAt < 0) {
                const connectorBreak = findConnectorBreak(remaining, limit);
                if (connectorBreak > minChars) breakAt = connectorBreak;
            }

            if (breakAt < 0 && remaining.length > maxChars) {
                breakAt = findBestBreakInSlice(remaining.slice(0, maxChars), Math.floor(maxChars * 0.35));
                if (breakAt < 0) breakAt = maxChars;
            }

            if (breakAt < 0) breakAt = limit;

            let chunk = remaining.slice(0, breakAt).trim();
            if (!chunk && remaining.length) {
                chunk = remaining.slice(0, Math.min(maxChars, remaining.length)).trim();
                breakAt = chunk.length;
            }
            if (!chunk) break;

            parts.push(chunk);
            remaining = remaining.slice(breakAt).trim();
        }

        return parts.filter(Boolean);
    }

    function splitTextIntoNParts(text, n) {
        const count = Math.max(2, Math.floor(Number(n) || 2));
        const raw = String(text || '').trim();
        if (!raw) return [];
        if (isConnectedText(raw)) return null;
        const chars = [...raw];
        if (chars.length < count) return null;
        const parts = [];
        const base = Math.floor(chars.length / count);
        let extra = chars.length % count;
        let idx = 0;
        for (let i = 0; i < count; i += 1) {
            const size = base + (extra > 0 ? 1 : 0);
            if (extra > 0) extra -= 1;
            parts.push(chars.slice(idx, idx + size).join('').trim());
            idx += size;
        }
        return parts.filter(Boolean);
    }

    function splitTextAtIndex(text, index) {
        const before = String(text || '').slice(0, index).trim();
        const after = String(text || '').slice(index).trim();
        if (!before || !after) return null;
        return [before, after];
    }

    function getWhitespaceBreakIndices(text) {
        const raw = String(text || '');
        const breaks = [];
        for (let i = 0; i < raw.length; i += 1) {
            if (!/\s/.test(raw[i])) continue;
            let end = i;
            while (end < raw.length && /\s/.test(raw[end])) end += 1;
            if (end > 0 && end < raw.length) breaks.push(end);
            i = end - 1;
        }
        return breaks;
    }

    function idealTimesForTextBreaks(startMs, endMs, text, breakIndices) {
        const raw = String(text || '').trim();
        const len = Math.max(1, raw.length);
        const totalDur = Math.max(1, endMs - startMs);
        return (breakIndices || []).map((idx) => {
            const ratio = Math.max(0, Math.min(1, idx / len));
            return Math.round(startMs + ratio * totalDur);
        });
    }

    function pickClosestValues(source, targets, count) {
        const picked = [];
        const used = new Set();
        const sortedTargets = [...targets].sort((a, b) => a - b);
        for (let n = 0; n < count; n += 1) {
            const target = sortedTargets[Math.min(n, sortedTargets.length - 1)];
            let best = null;
            let bestDist = Infinity;
            for (let i = 0; i < source.length; i += 1) {
                if (used.has(i)) continue;
                const dist = Math.abs(source[i] - target);
                if (dist < bestDist) {
                    bestDist = dist;
                    best = i;
                }
            }
            if (best == null) break;
            used.add(best);
            picked.push(source[best]);
        }
        return picked.sort((a, b) => a - b);
    }

    function alignSilenceSplitPointsToText(text, startMs, endMs, splitPointsMs) {
        const start = Math.round(Number(startMs) || 0);
        const end = Math.round(Number(endMs) || 0);
        const sorted = (splitPointsMs || [])
            .map((ms) => Math.round(Number(ms) || 0))
            .filter((ms) => ms > start && ms < end)
            .sort((a, b) => a - b);
        const wsBreaks = getWhitespaceBreakIndices(text);
        if (!wsBreaks.length || !sorted.length) return sorted;

        const idealTimes = idealTimesForTextBreaks(start, end, text, wsBreaks);
        const targetSplitCount = wsBreaks.length;

        if (sorted.length > targetSplitCount) {
            return pickClosestValues(sorted, idealTimes, targetSplitCount);
        }

        return sorted;
    }

    function redistributeBoundariesForTexts(startMs, endMs, texts) {
        const start = Math.round(Number(startMs) || 0);
        const end = Math.round(Number(endMs) || 0);
        const parts = (texts || []).map((t) => String(t || '').trim()).filter(Boolean);
        if (parts.length < 2) return null;

        const totalDur = Math.max(1, end - start);
        const totalChars = parts.reduce((sum, part) => sum + textCharCount(part), 0) || 1;
        const boundaries = [start];
        let usedChars = 0;
        for (let i = 0; i < parts.length - 1; i += 1) {
            usedChars += textCharCount(parts[i]);
            const ratio = usedChars / totalChars;
            boundaries.push(Math.round(start + ratio * totalDur));
        }
        boundaries.push(end);
        for (let i = 1; i < boundaries.length; i += 1) {
            boundaries[i] = Math.max(boundaries[i], boundaries[i - 1] + 1);
        }
        boundaries[boundaries.length - 1] = end;
        return boundaries;
    }

    function snapSplitIndexNearPunctuation(text, index, radius = 10) {
        const raw = String(text || '');
        const pos = Math.min(raw.length - 1, Math.max(1, Math.round(Number(index) || 0)));
        const start = Math.max(1, pos - radius);
        const end = Math.min(raw.length - 1, pos + radius);
        let best = pos;
        let bestScore = -1;
        let bestDist = Infinity;

        for (let i = start; i <= end; i += 1) {
            const left = raw.slice(0, i).trim();
            const right = raw.slice(i).trim();
            if (!left || !right) continue;

            const prev = raw[i - 1] || '';
            const ch = raw[i] || '';
            let score = 0;
            if (/\s/.test(prev) || /\s/.test(ch)) score = 5;
            else if (STRONG_PUNCT_RE.test(prev) || STRONG_PUNCT_RE.test(ch)) score = 4;
            else if (WEAK_PUNCT_RE.test(prev) || WEAK_PUNCT_RE.test(ch)) score = 3;
            if (score <= 0) continue;

            const dist = Math.abs(i - pos);
            if (score > bestScore || (score === bestScore && dist < bestDist)) {
                bestScore = score;
                bestDist = dist;
                best = i;
            }
        }

        if (bestScore < 0) {
            return snapSplitIndexAtWhitespace(text, pos, Math.max(radius, 16));
        }
        return best;
    }

    function snapSplitIndexAtWhitespace(text, index, radius = 16) {
        const raw = String(text || '');
        const pos = Math.min(raw.length - 1, Math.max(1, Math.round(Number(index) || 0)));
        let best = pos;
        let bestDist = Infinity;
        for (let i = 1; i < raw.length; i += 1) {
            const prev = raw[i - 1] || '';
            const ch = raw[i] || '';
            if (!/\s/.test(prev) && !/\s/.test(ch)) continue;
            const left = raw.slice(0, i).trim();
            const right = raw.slice(i).trim();
            if (!left || !right) continue;
            const dist = Math.abs(i - pos);
            if (dist > radius) continue;
            if (dist < bestDist) {
                bestDist = dist;
                best = i;
            }
        }
        return best;
    }

    function mergeTinyTextSegments(texts, boundaries, minChars = 2) {
        const parts = (texts || []).map((t) => String(t || '').trim()).filter(Boolean);
        if (parts.length < 2) {
            return { texts: parts, boundaries };
        }

        let mergedTexts = [...parts];
        let mergedBounds = [...(boundaries || [])];
        if (mergedBounds.length !== mergedTexts.length + 1) {
            mergedBounds = redistributeBoundariesForTexts(
                mergedBounds[0],
                mergedBounds[mergedBounds.length - 1],
                mergedTexts,
            ) || mergedBounds;
        }

        let changed = true;
        while (changed && mergedTexts.length >= 2) {
            changed = false;
            for (let i = 0; i < mergedTexts.length; i += 1) {
                const chars = textCharCount(mergedTexts[i]);
                if (chars >= minChars) continue;
                if (i > 0) {
                    mergedTexts[i - 1] = `${mergedTexts[i - 1]} ${mergedTexts[i]}`.replace(/\s+/g, ' ').trim();
                    mergedTexts.splice(i, 1);
                    mergedBounds.splice(i, 1);
                    changed = true;
                    break;
                }
                if (i < mergedTexts.length - 1) {
                    mergedTexts[i + 1] = `${mergedTexts[i]} ${mergedTexts[i + 1]}`.replace(/\s+/g, ' ').trim();
                    mergedTexts.splice(i, 1);
                    mergedBounds.splice(i, 1);
                    changed = true;
                    break;
                }
            }
        }
        return { texts: mergedTexts, boundaries: mergedBounds };
    }

    function buildCuesFromTexts(startMs, endMs, texts, timeMode = 'proportional', timeOpts = {}) {
        const list = (texts || []).map((t) => String(t || '').trim()).filter(Boolean);
        if (!list.length) return [];
        const end = endMs != null ? endMs : startMs + 2000;
        const totalDur = Math.max(100, end - startMs);
        if (list.length === 1) {
            return [{ startMs, endMs: end, text: list[0] }];
        }

        const minDurMs = Math.max(100, Math.round(Number(timeOpts.minDurMs) || 500));

        if (timeMode === 'equal') {
            const step = Math.floor(totalDur / list.length);
            let cur = startMs;
            return list.map((text, i) => {
                const isLast = i === list.length - 1;
                const cueEnd = isLast ? end : cur + step;
                const cue = { startMs: cur, endMs: cueEnd, text };
                cur = cueEnd;
                return cue;
            });
        }

        if (timeMode === 'cps') {
            const targetCps = Math.max(0.1, Number(timeOpts.targetCps) || 3);
            const idealDurs = list.map((text) => {
                const chars = textCharCount(text);
                return Math.max(minDurMs, Math.ceil((chars / targetCps) * 1000));
            });
            const totalIdeal = idealDurs.reduce((sum, d) => sum + d, 0);
            let cur = startMs;
            if (totalIdeal <= totalDur) {
                return list.map((text, i) => {
                    const isLast = i === list.length - 1;
                    const dur = isLast ? end - cur : idealDurs[i];
                    const cue = { startMs: cur, endMs: cur + dur, text };
                    cur += dur;
                    return cue;
                });
            }
            const scale = totalDur / totalIdeal;
            return list.map((text, i) => {
                const isLast = i === list.length - 1;
                const dur = isLast
                    ? end - cur
                    : Math.max(minDurMs, Math.round(idealDurs[i] * scale));
                const cue = { startMs: cur, endMs: cur + dur, text };
                cur += dur;
                return cue;
            });
        }

        const totalWeight = list.reduce((s, t) => s + Math.max(1, textCharCount(t)), 0);
        let cur = startMs;
        return list.map((text, i) => {
            const isLast = i === list.length - 1;
            const weight = Math.max(1, textCharCount(text));
            const dur = isLast ? end - cur : Math.max(minDurMs, Math.round(totalDur * (weight / totalWeight)));
            const cue = { startMs: cur, endMs: cur + dur, text };
            cur += dur;
            return cue;
        });
    }

    function summarizeSplitCues(cues) {
        const list = cues || [];
        if (!list.length) return { count: 0, cpsMin: null, cpsMax: null };
        const cpsValues = list.map((cue) => {
            const dur = Math.max(1, (cue.endMs ?? cue.startMs + 2000) - cue.startMs);
            const chars = textCharCount(cue.text);
            return chars ? chars / (dur / 1000) : null;
        }).filter((v) => v != null);
        if (!cpsValues.length) {
            return { count: list.length, cpsMin: null, cpsMax: null };
        }
        return {
            count: list.length,
            cpsMin: Math.min(...cpsValues),
            cpsMax: Math.max(...cpsValues),
        };
    }

    function normalizeSilenceIntervals(intervals, startMs, endMs) {
        const start = Math.round(Number(startMs) || 0);
        const end = Math.round(Number(endMs) || 0);
        return (intervals || [])
            .map((iv) => ({
                start: Math.round(Number(iv.startMs != null ? iv.startMs : (iv.startSec || 0) * 1000)),
                end: Math.round(Number(iv.endMs != null ? iv.endMs : (iv.endSec || 0) * 1000)),
            }))
            .filter((s) => s.end > s.start && s.start < end && s.end > start)
            .map((s) => ({
                start: Math.max(start, s.start),
                end: Math.min(end, s.end),
            }))
            .filter((s) => s.end > s.start)
            .sort((a, b) => a.start - b.start);
    }

    function inferSpeechStartFromSilence(startMs, endMs, intervals, options = {}) {
        const start = Math.round(Number(startMs) || 0);
        const end = Math.round(Number(endMs) || 0);
        if (end <= start) return start;

        const minDurMs = Math.max(100, Math.round(Number(options.minDurMs) || 500));
        const nearStartMs = Math.max(50, Math.round(Number(options.nearStartMs) || 200));
        const minLeadingSilenceMs = Math.max(
            100,
            Math.round(Number(options.minLeadingSilenceMs) || options.minTrailingSilenceMs || 300),
        );
        const headPadMs = Math.max(0, Math.round(Number(options.headPadMs) || 80));
        const minShiftMs = Math.max(50, Math.round(Number(options.minShiftMs) || 150));

        const silences = normalizeSilenceIntervals(intervals, start, end);
        if (!silences.length) return start;

        for (const s of silences) {
            if (start >= s.start && start < s.end) {
                const newStart = Math.min(end - minDurMs, Math.max(start, s.end - headPadMs));
                if (newStart > start) return newStart;
            }
        }

        for (const s of silences) {
            const reachesStart = s.start <= start + nearStartMs;
            const dur = s.end - s.start;
            if (reachesStart && dur >= minLeadingSilenceMs) {
                const newStart = Math.min(end - minDurMs, Math.max(start, s.end - headPadMs));
                if (newStart - start >= minShiftMs || newStart > start) return newStart;
            }
        }

        return start;
    }

    function inferSpeechEndFromSilence(startMs, endMs, intervals, options = {}) {
        const start = Math.round(Number(startMs) || 0);
        const end = Math.round(Number(endMs) || 0);
        if (end <= start) return null;

        const minDurMs = Math.max(100, Math.round(Number(options.minDurMs) || 500));
        const minTrailingSilenceMs = Math.max(100, Math.round(Number(options.minTrailingSilenceMs) || 300));
        const nearEndMs = Math.max(50, Math.round(Number(options.nearEndMs) || 200));
        const tailPadMs = Math.max(0, Math.round(Number(options.tailPadMs) || 80));
        const minShrinkMs = Math.max(50, Math.round(Number(options.minShrinkMs) || 150));

        const silences = normalizeSilenceIntervals(intervals, start, end);
        if (!silences.length) return null;

        for (const s of silences) {
            if (end > s.start && end <= s.end + nearEndMs) {
                const newEnd = Math.max(start + minDurMs, s.start + tailPadMs);
                if (newEnd < end) return Math.min(end, newEnd);
            }
        }

        let trailingStart = null;
        for (let i = silences.length - 1; i >= 0; i -= 1) {
            const s = silences[i];
            const dur = s.end - s.start;
            const reachesEnd = s.end >= end - nearEndMs;
            if (reachesEnd && dur >= minTrailingSilenceMs) {
                trailingStart = s.start;
                break;
            }
        }

        if (trailingStart == null) {
            const midpoint = start + (end - start) * 0.35;
            let bestDur = 0;
            for (const s of silences) {
                const dur = s.end - s.start;
                if (s.start >= midpoint && dur >= minTrailingSilenceMs && dur > bestDur) {
                    bestDur = dur;
                    trailingStart = s.start;
                }
            }
        }

        if (trailingStart == null) return null;

        const newEnd = Math.min(end, Math.max(start + minDurMs, trailingStart + tailPadMs));
        if (end - newEnd < minShrinkMs) return null;
        return newEnd;
    }

    function refineSilenceSplitCueTimings(cues, intervals, parentStart, parentEnd, options = {}) {
        if (!cues?.length) return cues;

        const minDurMs = Math.max(100, Math.round(Number(options.minDurMs) || 500));
        const gapMs = Math.max(0, Math.round(Number(options.gapMs) || 1));
        const silences = normalizeSilenceIntervals(intervals, parentStart, parentEnd);
        if (!silences.length) return cues;

        const refined = cues.map((c) => ({
            startMs: Math.round(Number(c.startMs) || 0),
            endMs: Math.round(Number(c.endMs) || 0),
            text: c.text,
        }));

        for (let i = 0; i < refined.length; i += 1) {
            const cue = refined[i];
            const speechStart = inferSpeechStartFromSilence(cue.startMs, cue.endMs, intervals, options);
            if (speechStart > cue.startMs) {
                cue.startMs = Math.min(speechStart, cue.endMs - minDurMs);
            }

            const speechEnd = inferSpeechEndFromSilence(cue.startMs, cue.endMs, intervals, options);
            if (speechEnd != null && speechEnd < cue.endMs) {
                cue.endMs = Math.max(speechEnd, cue.startMs + minDurMs);
            }
        }

        for (let i = 1; i < refined.length; i += 1) {
            if (refined[i].startMs < refined[i - 1].endMs + gapMs) {
                refined[i - 1].endMs = Math.max(
                    refined[i - 1].startMs + minDurMs,
                    refined[i].startMs - gapMs,
                );
            }
            if (refined[i].startMs < refined[i - 1].endMs + gapMs) {
                refined[i].startMs = refined[i - 1].endMs + gapMs;
            }
            if (refined[i].endMs <= refined[i].startMs) {
                refined[i].endMs = refined[i].startMs + minDurMs;
            }
        }

        return refined.filter((c) => c.text && c.endMs > c.startMs);
    }

    function buildCuesFromSilenceSplits(text, startMs, endMs, splitPointsMs, snapRadius = 16, intervals = null, timingOptions = {}) {
        const start = Math.round(Number(startMs) || 0);
        const end = Math.round(Number(endMs) || 0);
        const raw = String(text || '').trim();
        const sorted = alignSilenceSplitPointsToText(raw, start, end, splitPointsMs);
        if (!sorted.length) return null;

        let texts = buildTextsFromTimeBoundaries(raw, start, end, sorted, snapRadius);
        if (!texts || texts.length < 2) return null;

        let boundaries = [start, ...sorted, end];
        if (texts.length !== boundaries.length - 1) {
            boundaries = redistributeBoundariesForTexts(start, end, texts);
            if (!boundaries) return null;
        }

        const merged = mergeTinyTextSegments(texts, boundaries, 2);
        texts = merged.texts;
        boundaries = merged.boundaries;

        if (texts.length < 2 || boundaries.length !== texts.length + 1) return null;

        const cues = [];
        for (let i = 0; i < texts.length; i += 1) {
            cues.push({
                startMs: boundaries[i],
                endMs: boundaries[i + 1],
                text: texts[i],
            });
        }
        if (cues.length < 2) return null;

        if (intervals?.length) {
            const refined = refineSilenceSplitCueTimings(cues, intervals, start, end, timingOptions);
            return refined.length >= 2 ? refined : null;
        }
        return cues;
    }

    function buildTextsFromTimeBoundaries(text, startMs, endMs, splitPointsMs, snapRadius = 16) {
        const raw = String(text || '').trim();
        if (!raw) return null;

        const start = Math.round(Number(startMs) || 0);
        const end = Math.round(Number(endMs) || 0);
        const totalDur = end - start;
        if (totalDur <= 0) return null;

        const sorted = (splitPointsMs || [])
            .map((ms) => Math.round(Number(ms) || 0))
            .filter((ms) => ms > start && ms < end)
            .sort((a, b) => a - b);
        const boundaries = [start, ...sorted, end];
        if (boundaries.length < 3) return null;

        const wsBreaks = getWhitespaceBreakIndices(raw);
        const len = raw.length;
        const indices = boundaries.map((ms, i) => {
            if (i === 0) return 0;
            if (i === boundaries.length - 1) return len;
            if (wsBreaks.length === 1 && boundaries.length === 3) {
                return wsBreaks[0];
            }
            const ratio = (ms - start) / totalDur;
            return snapSplitIndexNearPunctuation(raw, Math.round(ratio * len), snapRadius);
        });

        for (let i = 1; i < indices.length; i += 1) {
            indices[i] = Math.max(indices[i], indices[i - 1] + 1);
        }
        indices[indices.length - 1] = len;

        const texts = [];
        for (let i = 0; i < indices.length - 1; i += 1) {
            const chunk = raw.slice(indices[i], indices[i + 1]).trim();
            if (chunk) texts.push(chunk);
        }
        return texts.length >= 2 ? texts : null;
    }

    return {
        isConnectedText,
        textCharCount,
        lineCharCount,
        splitTextByLines,
        splitTextBySpaces,
        splitTextByCharCount,
        splitTextSmart,
        splitTextIntoNParts,
        splitTextAtIndex,
        alignSilenceSplitPointsToText,
        normalizeSilenceIntervals,
        inferSpeechStartFromSilence,
        inferSpeechEndFromSilence,
        refineSilenceSplitCueTimings,
        getWhitespaceBreakIndices,
        snapSplitIndexNearPunctuation,
        buildCuesFromTexts,
        buildTextsFromTimeBoundaries,
        buildCuesFromSilenceSplits,
        summarizeSplitCues,
    };
}));
