/**
 * Acoustic sentence split planner (pure).
 * After band re-listen and before second opinion:
 *   1. PCM valley near punctuation / turn punctuation
 *   2. Same-model segment boundary, soft band + CT2 Whisper only
 * Music / noisy / neutral / Qwen / speed never reach tier 2.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAcousticSentenceSplit = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function acousticSentenceSplitFactory() {
    const SOFT_MIN_DUR_MS = 4000;
    const OTHER_MIN_DUR_MS = 5500;
    const VALLEY_WINDOW_MS = 450;
    const MIN_VALLEY_DEPTH = 0.45;
    const METRONOME_SNAP_MS = 800;
    const MIN_SIDE_MS = 400;
    const MAX_PCM_CANDIDATES = 24;
    const MAX_METRONOME = 6;
    const HINT_RANK = { soft: 0, neutral: 1, noisy: 2, music: 3 };
    const BAND_PRIORITY = { music: 3, noisy: 2, soft: 1 };

    function normalizeAdapt(value) {
        if (value === false || value === 0) return 'off';
        const s = String(value == null ? 'auto' : value).trim().toLowerCase();
        if (s === 'false' || s === '0' || s === 'off' || s === 'no') return 'off';
        if (s === 'true' || s === '1' || s === 'on' || s === 'always') return 'on';
        if (s === 'auto') return 'auto';
        return 'auto';
    }

    function isSpeedProfile(options = {}) {
        const v = String(options.perfProfile || '').trim().toLowerCase();
        return v === 'speed' || v === 'fast';
    }

    /**
     * off: skip. pcm: valleys only (speed). full: valleys + soft CT2 metronome.
     */
    function resolveSentenceSplitMode(options = {}) {
        if (options.skipAcousticSentenceSplit === true || options.skipAsr === true) return 'off';
        if (normalizeAdapt(options.acousticBandAdapt) === 'off') return 'off';
        const timing = String(options.asrTiming == null ? '' : options.asrTiming).trim().toLowerCase();
        if (timing === 'off' || timing === 'false' || timing === '0' || timing === 'none') return 'off';
        if (isSpeedProfile(options)) return 'pcm';
        return 'full';
    }

    function isCt2WhisperPrimary(id) {
        const s = String(id || '').trim().toLowerCase();
        if (!s) return false;
        if (/qwen|sensevoice|parakeet|cohere|reazon|firered|nemo/.test(s)) return false;
        return s.includes('whisper') || s.includes('kotoba');
    }

    function bareText(text) {
        return String(text || '').replace(
            /[\s。．！？?!…、，,～~ー\-—「」『』（）()【】[\]・.]+/g,
            '',
        );
    }

    function isOrphanFragment(text) {
        const bare = bareText(text);
        if (!bare || bare.length <= 1) return true;
        return /^(?:うん+|はい+|ええ+|えっ+|え+|あっ+|ああ+|はぁ+|はっ+|んっ+|んん+|ふぁ+|ふっ+|ひゃ+)$/u.test(bare);
    }

    function minBareForKind(kind) {
        if (kind === 'comma' || kind === 'ellipsis') return 8;
        if (kind === 'closer') return 6;
        return 4;
    }

    /**
     * Legal text cuts. Index is the first character of the right half
     * (punctuation stays on the left).
     */
    function listLegalCuts(text) {
        const t = String(text || '');
        const cuts = [];
        const re = /\.{3}|[。．！？?!…]|[、，,]|[）)」』】]/gu;
        let match = re.exec(t);
        while (match) {
            const token = match[0];
            const index = match.index + token.length;
            let kind = 'sentence';
            if (token === '…' || token === '...') kind = 'ellipsis';
            else if (/[、，,]/.test(token)) kind = 'comma';
            else if (/[）)」』】]/.test(token)) kind = 'closer';
            const left = t.slice(0, index).trim();
            const right = t.slice(index).trim();
            const minBare = minBareForKind(kind);
            if (left && right
                && !isOrphanFragment(left)
                && !isOrphanFragment(right)
                && bareText(left).length >= minBare
                && bareText(right).length >= minBare) {
                cuts.push({ index, kind });
            }
            match = re.exec(t);
        }
        return cuts;
    }

    function cutPriorMs(cue, cutIndex, textLength) {
        const start = Number(cue?.startMs) || 0;
        const end = Number(cue?.endMs);
        const dur = end - start;
        if (!(dur > 0)) return start;
        const len = Math.max(1, Number(textLength) || 1);
        const ratio = Math.min(0.98, Math.max(0.02, Number(cutIndex) / len));
        return start + dur * ratio;
    }

    function clampSplitMs(startMs, endMs, midMs) {
        const start = Number(startMs) || 0;
        const end = Number(endMs);
        if (!(end - start >= MIN_SIDE_MS * 2)) return null;
        const mid = Math.round(Number(midMs));
        if (!Number.isFinite(mid)) return null;
        if (mid < start + MIN_SIDE_MS || mid > end - MIN_SIDE_MS) return null;
        return mid;
    }

    function cueAcousticHint(cue, bands, profile) {
        const start = Number(cue?.startMs) || 0;
        const end = Number(cue?.endMs) || start;
        const midSec = ((start + end) / 2) / 1000;
        let hint = '';
        for (const band of Array.isArray(bands) ? bands : []) {
            const h = String(band?.hint || '');
            const priority = BAND_PRIORITY[h];
            if (!priority) continue;
            const bandStart = Number(band.startSec) || 0;
            const bandEnd = Number(band.endSec) || 0;
            if (midSec >= bandStart && midSec < bandEnd) {
                if (!hint || priority > BAND_PRIORITY[hint]) hint = h;
            }
        }
        if (hint) return hint;
        if (String(profile || '').trim().toLowerCase() === 'av_soft') return 'soft';
        return 'neutral';
    }

    function minDurForHint(hint) {
        return hint === 'soft' ? SOFT_MIN_DUR_MS : OTHER_MIN_DUR_MS;
    }

    function selectPcmCandidates(cues, options = {}) {
        const mode = resolveSentenceSplitMode(options);
        if (mode === 'off') return [];
        const profile = String(options.contentProfile || options.senseProfile || '').trim().toLowerCase();
        const bands = Array.isArray(options.bands) ? options.bands : [];
        const max = Math.max(1, Math.min(48, Number(options.maxPcm) || MAX_PCM_CANDIDATES));
        const ranked = [];
        for (const cue of Array.isArray(cues) ? cues : []) {
            const text = String(cue?.text || '').trim();
            const start = Number(cue?.startMs);
            const end = Number(cue?.endMs);
            if (!text || !Number.isFinite(start) || !Number.isFinite(end)) continue;
            const hint = cueAcousticHint(cue, bands, profile);
            if (end - start < minDurForHint(hint)) continue;
            if (!listLegalCuts(text).length) continue;
            ranked.push({ cue, hint, dur: end - start });
        }
        ranked.sort((a, b) => {
            const ra = HINT_RANK[a.hint] ?? 9;
            const rb = HINT_RANK[b.hint] ?? 9;
            if (ra !== rb) return ra - rb;
            return b.dur - a.dur;
        });
        return ranked.slice(0, max).map((row) => ({
            startMs: row.cue.startMs,
            endMs: row.cue.endMs,
            text: String(row.cue.text || '').trim(),
            hint: row.hint,
        }));
    }

    function canUseMetronome(hint, options = {}) {
        if (resolveSentenceSplitMode(options) !== 'full') return false;
        if (String(hint || '') !== 'soft') return false;
        const asr = options.primaryAsr || options.engineAsrModel || options.asrModel;
        return isCt2WhisperPrimary(asr);
    }

    function choosePcmSplit(cue, samples, opts = {}) {
        const text = String(cue?.text || '');
        const cuts = listLegalCuts(text);
        if (!cuts.length) return null;
        const start = Number(cue?.startMs) || 0;
        const end = Number(cue?.endMs);
        if (!(end > start)) return null;
        const windowMs = Math.max(80, Number(opts.windowMs) || VALLEY_WINDOW_MS);
        const minDepth = Number.isFinite(Number(opts.minDepth))
            ? Number(opts.minDepth)
            : MIN_VALLEY_DEPTH;
        let best = null;
        for (const cut of cuts) {
            const prior = cutPriorMs(cue, cut.index, text.length);
            let deepest = null;
            for (const sample of Array.isArray(samples) ? samples : []) {
                const ms = Number(sample?.ms);
                const depth = Number(sample?.depth);
                if (!Number.isFinite(ms) || !Number.isFinite(depth)) continue;
                if (Math.abs(ms - prior) > windowMs) continue;
                if (!deepest || depth > deepest.depth) deepest = { ms, depth };
            }
            if (!deepest || deepest.depth < minDepth) continue;
            const mid = clampSplitMs(start, end, deepest.ms);
            if (mid == null) continue;
            if (!best || deepest.depth > best.depth) {
                best = {
                    cutIndex: cut.index,
                    midMs: mid,
                    depth: deepest.depth,
                    tier: 'pcm',
                };
            }
        }
        return best;
    }

    function chooseMetronomeSplit(cue, boundaryMsList, opts = {}) {
        const text = String(cue?.text || '');
        const cuts = listLegalCuts(text);
        if (!cuts.length) return null;
        const start = Number(cue?.startMs) || 0;
        const end = Number(cue?.endMs);
        if (!(end > start)) return null;
        const snapMs = Math.max(80, Number(opts.snapMs) || METRONOME_SNAP_MS);
        let best = null;
        for (const raw of Array.isArray(boundaryMsList) ? boundaryMsList : []) {
            const boundary = Number(raw);
            if (!Number.isFinite(boundary)) continue;
            for (const cut of cuts) {
                const prior = cutPriorMs(cue, cut.index, text.length);
                const dist = Math.abs(prior - boundary);
                if (dist > snapMs) continue;
                const mid = clampSplitMs(start, end, boundary);
                if (mid == null) continue;
                if (!best || dist < best.dist) {
                    best = {
                        cutIndex: cut.index,
                        midMs: mid,
                        dist,
                        tier: 'metronome',
                    };
                }
            }
        }
        return best;
    }

    function selectMetronomeCandidates(misses, options = {}) {
        const max = Math.max(1, Math.min(8, Number(options.maxMetronome) || MAX_METRONOME));
        return (Array.isArray(misses) ? misses : [])
            .filter((row) => canUseMetronome(row?.hint, options))
            .sort((a, b) => (Number(b.endMs) - Number(b.startMs)) - (Number(a.endMs) - Number(a.startMs)))
            .slice(0, max);
    }

    return {
        SOFT_MIN_DUR_MS,
        OTHER_MIN_DUR_MS,
        VALLEY_WINDOW_MS,
        MIN_VALLEY_DEPTH,
        METRONOME_SNAP_MS,
        MIN_SIDE_MS,
        MAX_PCM_CANDIDATES,
        MAX_METRONOME,
        resolveSentenceSplitMode,
        isCt2WhisperPrimary,
        bareText,
        isOrphanFragment,
        listLegalCuts,
        cutPriorMs,
        clampSplitMs,
        cueAcousticHint,
        selectPcmCandidates,
        canUseMetronome,
        choosePcmSplit,
        chooseMetronomeSplit,
        selectMetronomeCandidates,
    };
}));
