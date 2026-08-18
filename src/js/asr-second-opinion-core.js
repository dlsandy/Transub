/**
 * Batch ASR second-opinion planner (pure): low-confidence windows + sibling model.
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
     * Default: auto (av_soft / JA specialist). Explicit false/off disables.
     * @returns {'off'|'auto'|'on'}
     */
    function normalizeAsrSecondOpinionOption(value) {
        if (value === false || value === 0) return 'off';
        const s = String(value == null ? 'auto' : value).trim().toLowerCase();
        if (s === 'false' || s === '0' || s === 'off' || s === 'no') return 'off';
        if (s === 'true' || s === '1' || s === 'on' || s === 'always') return 'on';
        return 'auto';
    }

    function shouldRunAsrSecondOpinion(options = {}) {
        const mode = normalizeAsrSecondOpinionOption(
            options.asrSecondOpinion ?? options.enabled,
        );
        if (mode === 'off') return false;
        if (mode === 'on') return true;
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
        if (Number.isFinite(max) && max >= 1) return out.slice(0, Math.min(6, Math.round(max)));
        return out;
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
        if (pChars <= 2 && oChars >= 4) {
            return { useOpinion: true, reason: 'primary_scrap', cues: opinion };
        }
        if (pChars >= 2 && oChars >= Math.max(6, Math.ceil(pChars * 1.6))) {
            return { useOpinion: true, reason: 'opinion_richer', cues: opinion };
        }
        const pJoined = primary.map((c) => c.text).join('');
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
        if (isScrapOrLoopText(text)) return true;
        try {
            if (fluency?.looksLikeWeirdCueText?.(text)) return true;
            if (fluency?.analyzeTextFluency) {
                const flu = fluency.analyzeTextFluency(String(text || ''), { checkWeird: true });
                const ff = flu?.flags || [];
                if (ff.some((f) => f === 'weird' || f === 'stutter' || f === 'repetition' || f === 'fragment')) {
                    return true;
                }
            }
        } catch (_) { /* optional */ }
        return false;
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
        const lowIndexes = annotations
            ? selectSecondOpinionIndexes(list, rawLow, annotations, options)
            : rawLow;
        if (lowIndexes.length < minLow) {
            return {
                ok: false,
                ranges: [],
                lowIndexes,
                rawLowIndexes: rawLow,
                reason: annotations && rawLow.length >= minLow
                    ? 'few_risky_low_cues'
                    : 'few_low_cues',
                maxRanges,
            };
        }
        let ranges = [];
        if (typeof options.buildRanges === 'function') {
            ranges = options.buildRanges(list, lowIndexes, {
                maxRanges,
                maxDurationSec: options.maxDurationSec || 45,
                mergeAdjacentGapMs: options.mergeAdjacentGapMs || 800,
            }) || [];
        } else {
            ranges = lowIndexes.slice(0, maxRanges).map((idx) => {
                const c = list[idx];
                const startMs = Number(c?.startMs) || 0;
                const endMs = Number(c?.endMs) || startMs + 1000;
                return {
                    startMs,
                    endMs,
                    indexes: [idx],
                    durationMs: Math.max(200, endMs - startMs),
                };
            });
        }
        ranges = (Array.isArray(ranges) ? ranges : []).slice(0, maxRanges);
        const filtered = filterSecondOpinionRanges(ranges, list, options);
        ranges = filtered.ranges;
        if (!ranges.length) {
            return {
                ok: false,
                ranges: [],
                lowIndexes,
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
            rawLowIndexes: rawLow,
            skippedRanges: filtered.skipped,
            maxRanges,
        };
    }

    return {
        DEFAULT_MAX_RANGES,
        DEFAULT_MIN_LOW_CUES,
        DEFAULT_MIN_RANGE_MS,
        DEFAULT_STRICT_LOW_THRESHOLD,
        TARGET_BLANK_PLACEHOLDER,
        normalizeAsrSecondOpinionOption,
        shouldRunAsrSecondOpinion,
        pickSecondOpinionAsrModel,
        listSecondOpinionAsrModels,
        rankSecondOpinionAsrSafety,
        chooseSecondOpinionWinner,
        isScrapOrLoopText,
        isSecondOpinionRiskCue,
        selectSecondOpinionIndexes,
        shouldSkipSecondOpinionRange,
        filterSecondOpinionRanges,
        listOverlappingCueIndexes,
        blankTargetCuesForRanges,
        planAsrSecondOpinion,
    };
}));
