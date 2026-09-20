/**
 * Batch ASR second-opinion planner (pure):
 * low-confidence + hallucination + timeline-gap windows + sibling model.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAsrSecondOpinion = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function asrSecondOpinionFactory() {
    const DEFAULT_MAX_RANGES = 6;
    const DEFAULT_MIN_LOW_CUES = 2;
    /** Skip micro clips that rarely yield usable SenseVoice/Whisper output. */
    const DEFAULT_MIN_RANGE_MS = 1200;
    /** Stricter than sidecar default (0.55): second opinion only for clearly weak ASR. */
    const DEFAULT_STRICT_LOW_THRESHOLD = 0.42;
    /** Inter-cue hole that may hide missed dialogue (soft / JA specialist). */
    const DEFAULT_MIN_GAP_MS = 8000;
    const DEFAULT_MAX_GAP_WINDOW_MS = 45000;
    const TARGET_BLANK_PLACEHOLDER = '…';

    let fluency = null;
    try {
        fluency = (typeof module !== 'undefined' && module.exports)
            ? require('./subtitle-fluency-core')
            : null;
    } catch (_) {
        fluency = null;
    }

    /**
     * Default: off. Explicit auto/on enable; false/off disables.
     * @returns {'off'|'auto'|'on'}
     */
    function normalizeAsrSecondOpinionOption(value) {
        if (value === false || value === 0) return 'off';
        const s = String(value == null ? 'off' : value).trim().toLowerCase();
        if (s === 'false' || s === '0' || s === 'off' || s === 'no') return 'off';
        if (s === 'true' || s === '1' || s === 'on' || s === 'always') return 'on';
        if (s === 'auto') return 'auto';
        return 'off';
    }

    function isSpeedPerfProfile(options = {}) {
        const v = String(options.perfProfile || '').trim().toLowerCase();
        return v === 'speed' || v === 'fast';
    }

    function shouldRunAsrSecondOpinion(options = {}) {
        const mode = normalizeAsrSecondOpinionOption(
            options.asrSecondOpinion ?? options.enabled,
        );
        if (mode === 'off') return false;
        // Speed profile skips auto extras; explicit "on" still runs.
        if (isSpeedPerfProfile(options) && mode !== 'on') return false;
        if (mode === 'on') return true;
        const profile = String(options.contentProfile || options.senseProfile || '').toLowerCase();
        if (profile === 'av_soft') return true;
        const asr = String(options.primaryAsr || options.engineAsrModel || '').toLowerCase();
        if (/anime-whisper|whisper-ja|kotoba|reazon|qwen3-asr|ja-anime|galgame/.test(asr)) {
            return true;
        }
        return false;
    }

    /**
     * Timeline gaps are soft/JA-only by default (film BGM holes false-positive easily).
     */
    function shouldIncludeTimelineGaps(options = {}) {
        if (options.includeTimelineGaps === false || options.includeTimelineGaps === 0) {
            return false;
        }
        if (options.includeTimelineGaps === true || options.includeTimelineGaps === 1) {
            return true;
        }
        const profile = String(options.contentProfile || options.senseProfile || '').toLowerCase();
        if (profile === 'av_soft') return true;
        const asr = String(options.primaryAsr || options.engineAsrModel || '').toLowerCase();
        if (/anime-whisper|whisper-ja|kotoba|reazon|qwen3-asr|ja-anime|galgame/.test(asr)) {
            return true;
        }
        return false;
    }

    function rankSecondOpinionAsrSafety(modelId) {
        const low = String(modelId || '').trim().toLowerCase();
        if (!low) return 999;
        // CT2 anime/kotoba: known ACCESS_VIOLATION after long jobs / VRAM churn — last resort.
        if (low.includes('anime-whisper') || low.includes('kotoba-whisper')) return 90;
        if (low.includes('reazon')) return 45;
        if (low.includes('whisper-ja')) return 40;
        if (low.includes('qwen3-asr')) return 25;
        if (low.includes('sensevoice') || low.includes('whisper-tiny')
            || low.includes('whisper-large') || low.includes('parakeet')
            || low.includes('cohere')) {
            return 10;
        }
        return 50;
    }

    /**
     * anime/kotoba CT2: re-running the same weights on short windows often ACCESS_VIOLATION.
     * Prefer a safer sibling. Other backends can re-decode with the primary still loaded.
     */
    function isFragileCt2AsrForSecondOpinion(modelId) {
        const low = String(modelId || '').trim().toLowerCase();
        return low.includes('anime-whisper') || low.includes('kotoba-whisper');
    }

    function shouldReusePrimaryAsrForSecondOpinion(modelId) {
        const id = String(modelId || '').trim();
        if (!id) return false;
        return !isFragileCt2AsrForSecondOpinion(id);
    }

    function listSecondOpinionAsrModels(primaryAsr, options = {}) {
        const primary = String(primaryAsr || '').trim();
        if (!primary) return [];
        let chain = Array.isArray(options.candidates) ? options.candidates.slice() : [];
        if (!chain.length && typeof options.buildCandidates === 'function') {
            try { chain = options.buildCandidates(primary) || []; } catch (_) { chain = []; }
        }
        const hasInstallFilter = Array.isArray(options.installedIds);
        const installed = hasInstallFilter
            ? new Set(options.installedIds.map((id) => String(id || '').trim().toLowerCase()).filter(Boolean))
            : null;
        const out = [];
        const seen = new Set();
        for (const raw of chain) {
            const id = String(raw || '').trim();
            if (!id) continue;
            const low = id.toLowerCase();
            if (low === primary.toLowerCase() || seen.has(low)) continue;
            if (installed && !installed.has(low)) continue;
            seen.add(low);
            out.push(id);
        }
        if (!out.length && !hasInstallFilter) {
            for (const raw of chain) {
                const id = String(raw || '').trim();
                if (!id) continue;
                const low = id.toLowerCase();
                if (low === primary.toLowerCase() || seen.has(low)) continue;
                seen.add(low);
                out.push(id);
            }
        }
        out.sort((a, b) => rankSecondOpinionAsrSafety(a) - rankSecondOpinionAsrSafety(b)
            || String(a).localeCompare(String(b)));
        const max = Number(options.maxModels);
        const cap = Number.isFinite(max) && max >= 1 ? Math.min(6, Math.round(max)) : 0;
        const siblings = cap > 0 ? out.slice(0, cap) : out;
        if (shouldReusePrimaryAsrForSecondOpinion(primary)) {
            const plow = primary.toLowerCase();
            if (!installed || installed.has(plow)) {
                const rest = siblings.filter((id) => id.toLowerCase() !== plow);
                const combined = [primary, ...rest];
                return cap > 0 ? combined.slice(0, cap) : combined;
            }
        }
        return siblings;
    }

    function pickSecondOpinionAsrModel(primaryAsr, options = {}) {
        const list = listSecondOpinionAsrModels(primaryAsr, options);
        return list[0] || '';
    }

    /**
     * Prefer second-opinion cues when primary window is empty/garbage or much shorter.
     */
    function chooseSecondOpinionWinner(primaryCues, opinionCues, options = {}) {
        const primary = (Array.isArray(primaryCues) ? primaryCues : [])
            .map((c) => ({ ...c, text: String(c?.text || '').trim() }))
            .filter((c) => c.text);
        const opinion = (Array.isArray(opinionCues) ? opinionCues : [])
            .map((c) => ({ ...c, text: String(c?.text || '').trim() }))
            .filter((c) => c.text);
        if (!opinion.length) {
            return { useOpinion: false, reason: 'opinion_empty', cues: primary };
        }
        if (!primary.length) {
            return { useOpinion: true, reason: 'primary_empty', cues: opinion };
        }
        const pChars = primary.reduce((n, c) => n + Array.from(c.text.replace(/\s+/g, '')).length, 0);
        const oChars = opinion.reduce((n, c) => n + Array.from(c.text.replace(/\s+/g, '')).length, 0);
        const pJoined = primary.map((c) => c.text).join('');
        const oJoined = opinion.map((c) => c.text).join('');
        if (pChars <= 2 && oChars >= 4) {
            return { useOpinion: true, reason: 'primary_scrap', cues: opinion };
        }
        if (isScrapOrLoopText(pJoined) && oChars >= 4 && !isScrapOrLoopText(oJoined)) {
            return { useOpinion: true, reason: 'primary_scrap_clean_opinion', cues: opinion };
        }
        if (pChars >= 2 && oChars >= Math.max(6, Math.ceil(pChars * 1.6))) {
            return { useOpinion: true, reason: 'opinion_richer', cues: opinion };
        }
        if (/(.)\1{5,}/.test(pJoined) && oChars >= 4) {
            return { useOpinion: true, reason: 'primary_loop', cues: opinion };
        }
        if (options.preferOpinion === true && oChars >= pChars) {
            return { useOpinion: true, reason: 'prefer_opinion', cues: opinion };
        }
        return { useOpinion: false, reason: 'keep_primary', cues: primary };
    }

    function isScrapOrLoopText(text) {
        const t = String(text || '').trim();
        if (!t) return true;
        const compact = t.replace(/\s+/g, '');
        if (Array.from(compact).length <= 2) return true;
        if (/(.)\1{4,}/u.test(compact)) return true;
        if (/^[….·・\-—\s]+$/u.test(t)) return true;
        return false;
    }

    function looksHallucinationOrWeird(text) {
        if (isScrapOrLoopText(text)) return true;
        try {
            // Hot path: avoid full analyzeTextFluency per cue — looksLikeWeird + scrap checks suffice.
            if (fluency?.looksLikeWeirdCueText?.(text)) return true;
        } catch (_) { /* optional */ }
        return false;
    }

    /**
     * Gate second opinion to low-confidence cues that also look product-risky.
     */
    function isSecondOpinionRiskCue(text, annotation = {}, options = {}) {
        const strict = Math.max(
            0.05,
            Math.min(0.9, Number(options.strictThreshold) || DEFAULT_STRICT_LOW_THRESHOLD),
        );
        const conf = Number(annotation?.confidence);
        const flags = Array.isArray(annotation?.flags) ? annotation.flags.map(String) : [];
        if (Number.isFinite(conf) && conf < strict) return true;
        if (!annotation?.low && !(Number.isFinite(conf) && conf < 0.55)) return false;
        if (flags.some((f) => /weird|repetition|stutter|fragment|low_logprob|low_score|hallucin|duplicate/i.test(f))) {
            return true;
        }
        return looksHallucinationOrWeird(text);
    }

    /**
     * Hallucination / loop indexes — do not require sidecar low confidence.
     */
    function findHallucinationRiskIndexes(cues, annotations, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const anns = Array.isArray(annotations) ? annotations : [];
        const out = [];
        for (let i = 0; i < list.length; i += 1) {
            const text = list[i]?.text;
            const ann = anns[i] || {};
            const flags = Array.isArray(ann.flags) ? ann.flags.map(String) : [];
            if (flags.some((f) => /hallucin|repetition|duplicate|stutter/i.test(f))) {
                out.push(i);
                continue;
            }
            if (looksHallucinationOrWeird(text)) out.push(i);
        }
        if (options.maxHallucIndexes != null) {
            const max = Math.max(0, Math.min(40, Number(options.maxHallucIndexes) || 0));
            return out.slice(0, max);
        }
        return out;
    }

    function selectSecondOpinionIndexes(cues, lowConfidenceIndexes, annotations, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const anns = Array.isArray(annotations) ? annotations : [];
        const lowIndexes = [...new Set((Array.isArray(lowConfidenceIndexes) ? lowConfidenceIndexes : [])
            .map((n) => Number(n))
            .filter((n) => Number.isInteger(n) && n >= 0 && n < list.length))]
            .sort((a, b) => a - b);
        return lowIndexes.filter((idx) => isSecondOpinionRiskCue(
            list[idx]?.text,
            anns[idx] || {},
            options,
        ));
    }

    function clampGapWindow(startMs, endMs, options = {}) {
        const minMs = Math.max(
            400,
            Math.min(5000, Number(options.minRangeMs) || DEFAULT_MIN_RANGE_MS),
        );
        const maxMs = Math.max(
            minMs,
            Math.min(120000, Number(options.maxGapWindowMs) || DEFAULT_MAX_GAP_WINDOW_MS),
        );
        let start = Math.max(0, Number(startMs) || 0);
        let end = Math.max(start + 1, Number(endMs) || start + 1);
        let dur = end - start;
        if (dur < minMs) return null;
        if (dur > maxMs) {
            // Keep the middle of the hole — dialogue often sits away from edges.
            const mid = start + dur / 2;
            start = Math.max(0, Math.round(mid - maxMs / 2));
            end = start + maxMs;
            dur = maxMs;
        }
        return {
            startMs: start,
            endMs: end,
            durationMs: dur,
            indexes: [],
            kind: 'gap',
            allowEmpty: true,
            source: 'gap',
        };
    }

    /**
     * Large inter-cue (and optional lead/trail) holes — miss-dialogue suspects.
     */
    function findTimelineGapWindows(cues, mediaDurationMs, options = {}) {
        const list = (Array.isArray(cues) ? cues : [])
            .map((c, i) => ({
                i,
                startMs: Number(c?.startMs) || 0,
                endMs: Math.max(Number(c?.startMs) || 0, Number(c?.endMs) || 0),
            }))
            .filter((c) => c.endMs > c.startMs)
            .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
        if (!list.length) return [];

        const minGap = Math.max(
            3000,
            Math.min(60000, Number(options.minGapMs) || DEFAULT_MIN_GAP_MS),
        );
        const mediaMs = Math.max(
            0,
            Number(mediaDurationMs) || list[list.length - 1].endMs,
        );
        const out = [];

        const lead = clampGapWindow(0, list[0].startMs, options);
        if (lead && list[0].startMs >= minGap) out.push(lead);

        for (let i = 0; i < list.length - 1; i += 1) {
            const gapStart = list[i].endMs;
            const gapEnd = list[i + 1].startMs;
            if (gapEnd - gapStart < minGap) continue;
            const win = clampGapWindow(gapStart, gapEnd, options);
            if (win) out.push(win);
        }

        const trailStart = list[list.length - 1].endMs;
        if (mediaMs - trailStart >= minGap) {
            const trail = clampGapWindow(trailStart, mediaMs, options);
            if (trail) out.push(trail);
        }

        const maxGaps = Math.max(0, Math.min(12, Number(options.maxGapWindows) || 4));
        return out.slice(0, maxGaps);
    }

    function shouldSkipSecondOpinionRange(range, cues, options = {}) {
        const minMs = Math.max(
            400,
            Math.min(5000, Number(options.minRangeMs) || DEFAULT_MIN_RANGE_MS),
        );
        const startMs = Number(range?.startMs) || 0;
        const endMs = Number(range?.endMs) || startMs;
        const durationMs = Number(range?.durationMs);
        const dur = Number.isFinite(durationMs) && durationMs > 0
            ? durationMs
            : Math.max(0, endMs - startMs);
        if (dur > 0 && dur < minMs) {
            return { skip: true, reason: 'too_short', durationMs: dur, minRangeMs: minMs };
        }
        const allowEmpty = range?.allowEmpty === true
            || range?.kind === 'gap'
            || range?.source === 'gap';
        const indexes = Array.isArray(range?.indexes) ? range.indexes : [];
        const list = Array.isArray(cues) ? cues : [];
        const slice = indexes.length
            ? indexes.map((i) => list[i]).filter(Boolean)
            : list.filter((c) => {
                const s = Number(c?.startMs) || 0;
                const e = Number(c?.endMs) || s;
                return s < endMs && e > startMs;
            });
        const texts = slice.map((c) => String(c?.text || '').trim()).filter(Boolean);
        if (!texts.length) {
            if (allowEmpty) {
                return { skip: false, durationMs: dur, minRangeMs: minMs, emptyGap: true };
            }
            return { skip: true, reason: 'empty_window', durationMs: dur, minRangeMs: minMs };
        }
        if (texts.every((t) => isScrapOrLoopText(t)) && dur < minMs * 1.5) {
            return { skip: true, reason: 'scrap_short', durationMs: dur, minRangeMs: minMs };
        }
        return { skip: false, durationMs: dur, minRangeMs: minMs };
    }

    function filterSecondOpinionRanges(ranges, cues, options = {}) {
        const kept = [];
        const skipped = [];
        for (const range of Array.isArray(ranges) ? ranges : []) {
            const decision = shouldSkipSecondOpinionRange(range, cues, options);
            if (decision.skip) skipped.push({ ...range, skipReason: decision.reason });
            else kept.push(range);
        }
        return { ranges: kept, skipped };
    }

    function listOverlappingCueIndexes(cues, startMs, endMs) {
        const start = Number(startMs) || 0;
        const end = Math.max(start + 1, Number(endMs) || start + 1);
        const out = [];
        (Array.isArray(cues) ? cues : []).forEach((c, i) => {
            const s = Number(c?.startMs) || 0;
            const e = Number(c?.endMs) || s;
            if (s < end && e > start) out.push(i);
        });
        return out;
    }

    function blankTargetCuesForRanges(targetCues, ranges, options = {}) {
        const placeholder = String(options.placeholder || TARGET_BLANK_PLACEHOLDER);
        const list = (Array.isArray(targetCues) ? targetCues : []).map((c) => ({ ...c }));
        const blanked = new Set();
        for (const range of Array.isArray(ranges) ? ranges : []) {
            for (const idx of listOverlappingCueIndexes(list, range.startMs, range.endMs)) {
                const cur = String(list[idx]?.text || '').trim();
                if (!cur || cur === placeholder || cur === '...' || cur === '…') continue;
                list[idx] = { ...list[idx], text: placeholder };
                blanked.add(idx);
            }
        }
        return {
            cues: list,
            blankedCount: blanked.size,
            blankedIndexes: [...blanked].sort((a, b) => a - b),
            placeholder,
        };
    }

    function rangesFromIndexes(list, indexes, options = {}) {
        const maxRanges = Math.max(1, Math.min(12, Number(options.maxRanges) || DEFAULT_MAX_RANGES));
        if (typeof options.buildRanges === 'function') {
            return options.buildRanges(list, indexes, {
                maxRanges,
                maxDurationSec: options.maxDurationSec || 45,
                mergeAdjacentGapMs: options.mergeAdjacentGapMs || 800,
            }) || [];
        }
        return indexes.slice(0, maxRanges).map((idx) => {
            const c = list[idx];
            const startMs = Number(c?.startMs) || 0;
            const endMs = Number(c?.endMs) || startMs + 1000;
            return {
                startMs,
                endMs,
                indexes: [idx],
                durationMs: Math.max(200, endMs - startMs),
                kind: 'cue',
                source: 'cue',
            };
        });
    }

    function tagRanges(ranges, source, priority) {
        return (Array.isArray(ranges) ? ranges : []).map((r) => ({
            ...r,
            source,
            kind: source,
            priority: r.priority != null ? r.priority : priority,
        }));
    }

    function mergeRangesByPriority(groups, maxRanges) {
        const capped = Math.max(1, Math.min(12, maxRanges));
        const out = [];
        const covered = [];
        const overlaps = (a, b) => a.startMs < b.endMs && b.startMs < a.endMs;
        for (const group of groups) {
            for (const range of group) {
                if (out.length >= capped) break;
                if (covered.some((c) => overlaps(c, range))) continue;
                out.push(range);
                covered.push(range);
            }
            if (out.length >= capped) break;
        }
        return out.slice(0, capped);
    }

    /**
     * @returns {{ ok: boolean, ranges: object[], lowIndexes: number[], reason?: string, maxRanges: number }}
     */
    function planAsrSecondOpinion(cues, lowConfidenceIndexes, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const maxRanges = Math.max(1, Math.min(12, Number(options.maxRanges) || DEFAULT_MAX_RANGES));
        const minLow = Math.max(1, Math.min(20, Number(options.minLowCues) || DEFAULT_MIN_LOW_CUES));
        const annotations = Array.isArray(options.annotations) ? options.annotations : null;
        const rawLow = [...new Set((Array.isArray(lowConfidenceIndexes) ? lowConfidenceIndexes : [])
            .map((n) => Number(n))
            .filter((n) => Number.isInteger(n) && n >= 0 && n < list.length))]
            .sort((a, b) => a - b);

        const hallucIndexesRaw = findHallucinationRiskIndexes(list, annotations || [], options);
        const lowIndexes = annotations
            ? selectSecondOpinionIndexes(list, rawLow, annotations, options)
            : rawLow;

        const bandByIndex = options.bandByIndex || options.cueRiskBands || null;
        const riskOnly = options.secondOpinionRiskOnly !== false && !!bandByIndex
            && typeof bandByIndex === 'object';
        const orderByBand = (indexes) => {
            if (!bandByIndex || typeof bandByIndex !== 'object') {
                return [...indexes].sort((a, b) => a - b);
            }
            const red = [];
            const yellow = [];
            const other = [];
            for (const idx of indexes) {
                const b = bandByIndex[idx] ?? bandByIndex[String(idx)];
                if (b === 'red') red.push(idx);
                else if (b === 'yellow') yellow.push(idx);
                else other.push(idx);
            }
            // Prefer risk bands; only fall back to green/other when risk set is empty.
            if (riskOnly && (red.length || yellow.length)) {
                return [
                    ...red.sort((a, b) => a - b),
                    ...yellow.sort((a, b) => a - b),
                ];
            }
            return [
                ...red.sort((a, b) => a - b),
                ...yellow.sort((a, b) => a - b),
                ...other.sort((a, b) => a - b),
            ];
        };

        const hallucIndexes = orderByBand(hallucIndexesRaw);
        const hallucSet = new Set(hallucIndexes);
        const lowOnly = orderByBand(lowIndexes.filter((i) => !hallucSet.has(i)));

        const gapWindows = shouldIncludeTimelineGaps(options)
            ? findTimelineGapWindows(list, options.mediaDurationMs, options)
            : [];

        const enoughLow = lowIndexes.length >= minLow;
        const hasHalluc = hallucIndexes.length > 0;
        const hasGaps = gapWindows.length > 0;

        if (!enoughLow && !hasHalluc && !hasGaps) {
            return {
                ok: false,
                ranges: [],
                lowIndexes,
                hallucIndexes,
                gapWindowCount: 0,
                rawLowIndexes: rawLow,
                reason: annotations && rawLow.length >= minLow
                    ? 'few_risky_low_cues'
                    : 'few_sources',
                maxRanges,
            };
        }

        // Cap windows by risk signal when bands are available (save GPU).
        let effectiveMax = maxRanges;
        if (riskOnly) {
            let redN = 0;
            let yellowN = 0;
            for (const key of Object.keys(bandByIndex)) {
                const b = bandByIndex[key];
                if (b === 'red') redN += 1;
                else if (b === 'yellow') yellowN += 1;
            }
            const riskCap = Math.max(2, Math.min(maxRanges, redN + Math.ceil(yellowN / 2) + (hasHalluc ? 1 : 0) + (hasGaps ? 1 : 0)));
            effectiveMax = Math.min(maxRanges, riskCap);
        }

        // Priority: hallucination → risky low → timeline gaps.
        const hallucRanges = tagRanges(
            rangesFromIndexes(list, hallucIndexes, { ...options, maxRanges: effectiveMax }),
            'hallucination',
            1,
        );
        const lowRanges = tagRanges(
            rangesFromIndexes(list, lowOnly, { ...options, maxRanges: effectiveMax }),
            'low_confidence',
            2,
        );
        const gapRanges = tagRanges(gapWindows, 'gap', 3);

        let ranges = mergeRangesByPriority([hallucRanges, lowRanges, gapRanges], effectiveMax);
        const filtered = filterSecondOpinionRanges(ranges, list, options);
        ranges = filtered.ranges;

        if (!ranges.length) {
            return {
                ok: false,
                ranges: [],
                lowIndexes,
                hallucIndexes,
                gapWindowCount: gapWindows.length,
                rawLowIndexes: rawLow,
                skippedRanges: filtered.skipped,
                reason: filtered.skipped.length ? 'ranges_too_short' : 'no_ranges',
                maxRanges,
            };
        }

        return {
            ok: true,
            ranges,
            lowIndexes,
            hallucIndexes,
            gapWindowCount: gapWindows.length,
            rawLowIndexes: rawLow,
            skippedRanges: filtered.skipped,
            maxRanges,
            planStats: {
                hallucCueCount: hallucIndexes.length,
                riskyLowCueCount: lowIndexes.length,
                gapWindowCount: gapWindows.length,
                scheduledRanges: ranges.length,
            },
        };
    }

    return {
        DEFAULT_MAX_RANGES,
        DEFAULT_MIN_LOW_CUES,
        DEFAULT_MIN_RANGE_MS,
        DEFAULT_STRICT_LOW_THRESHOLD,
        DEFAULT_MIN_GAP_MS,
        DEFAULT_MAX_GAP_WINDOW_MS,
        TARGET_BLANK_PLACEHOLDER,
        normalizeAsrSecondOpinionOption,
        isSpeedPerfProfile,
        shouldRunAsrSecondOpinion,
        shouldIncludeTimelineGaps,
        pickSecondOpinionAsrModel,
        listSecondOpinionAsrModels,
        rankSecondOpinionAsrSafety,
        isFragileCt2AsrForSecondOpinion,
        shouldReusePrimaryAsrForSecondOpinion,
        chooseSecondOpinionWinner,
        isScrapOrLoopText,
        isSecondOpinionRiskCue,
        findHallucinationRiskIndexes,
        findTimelineGapWindows,
        selectSecondOpinionIndexes,
        shouldSkipSecondOpinionRange,
        filterSecondOpinionRanges,
        listOverlappingCueIndexes,
        blankTargetCuesForRanges,
        planAsrSecondOpinion,
    };
}));
