/**
 * Long-track MT policy: align-audit budgets, chunk timeout bumps, half-window plans.
 * Keeps wall-clock bounded on 2.5h+ / high-cue jobs without changing model families.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubMtLongTrackPolicy = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function mtLongTrackPolicyFactory() {
    /** Soft long: start capping align retries / bump chunk timeout. */
    const LONG_CUE_SOFT = 600;
    /** Very long: tighter align-retry budget. */
    const LONG_CUE_HARD = 1500;
    const LONG_SPAN_SOFT_MS = Math.round(2.5 * 3600 * 1000);
    const LONG_SPAN_HARD_MS = 4 * 3600 * 1000;

    const ALIGN_AUDIT_MAX_DEFAULT = 64;
    const ALIGN_AUDIT_MAX_LONG = 24;
    const ALIGN_AUDIT_MAX_VERY_LONG = 12;

    const CHUNK_TIMEOUT_DEFAULT_MS = 60000;
    const CHUNK_TIMEOUT_LONG_MS = 120000;
    const CHUNK_TIMEOUT_EXTERNAL_MS = 180000;

    const HALF_WINDOW_MIN = 1;

    function resolveTrackSpanMs(cues) {
        const list = Array.isArray(cues) ? cues : [];
        let min = Infinity;
        let max = -Infinity;
        for (const c of list) {
            const s = Number(c?.startMs);
            const e = Number(c?.endMs);
            if (Number.isFinite(s)) min = Math.min(min, s);
            if (Number.isFinite(e)) max = Math.max(max, e);
            else if (Number.isFinite(s)) max = Math.max(max, s);
        }
        if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return 0;
        return Math.max(0, Math.round(max - min));
    }

    function isLongTrack({ cueCount = 0, spanMs = 0 } = {}) {
        const n = Math.max(0, Math.round(Number(cueCount) || 0));
        const span = Math.max(0, Math.round(Number(spanMs) || 0));
        return n >= LONG_CUE_SOFT || span >= LONG_SPAN_SOFT_MS;
    }

    function isVeryLongTrack({ cueCount = 0, spanMs = 0 } = {}) {
        const n = Math.max(0, Math.round(Number(cueCount) || 0));
        const span = Math.max(0, Math.round(Number(spanMs) || 0));
        return n >= LONG_CUE_HARD || span >= LONG_SPAN_HARD_MS;
    }

    /**
     * Final whole-track 对位审计: still run on long films, but cap LLM re-MT count.
     * @returns {{ run: boolean, maxRetries: number, reason: string, cueCount: number, spanMs: number }}
     */
    function resolveAlignAuditBudget(input = {}) {
        if (input.skipAlignAudit || input.blankRetry) {
            return {
                run: false,
                maxRetries: 0,
                reason: input.blankRetry ? 'blank_retry' : 'skip',
                cueCount: 0,
                spanMs: 0,
            };
        }
        const cues = Array.isArray(input.cues) ? input.cues : null;
        const cueCount = Math.max(
            0,
            Math.round(Number(input.cueCount) || (cues ? cues.length : 0) || 0),
        );
        const spanMs = Math.max(
            0,
            Math.round(Number(input.spanMs) || (cues ? resolveTrackSpanMs(cues) : 0) || 0),
        );
        if (cueCount < 3) {
            return { run: false, maxRetries: 0, reason: 'too_short', cueCount, spanMs };
        }

        let maxRetries = ALIGN_AUDIT_MAX_DEFAULT;
        let reason = 'default';
        if (isVeryLongTrack({ cueCount, spanMs })) {
            maxRetries = ALIGN_AUDIT_MAX_VERY_LONG;
            reason = 'very_long_track';
        } else if (isLongTrack({ cueCount, spanMs })) {
            maxRetries = ALIGN_AUDIT_MAX_LONG;
            reason = 'long_track';
        }
        if (Number.isFinite(Number(input.maxRetriesOverride))) {
            maxRetries = Math.max(0, Math.round(Number(input.maxRetriesOverride)));
            reason = 'override';
        }
        return { run: true, maxRetries, reason, cueCount, spanMs };
    }

    /**
     * Cap a misaligned-index list to the audit budget (stable order preserved).
     * @param {number[]} indexes
     * @param {{ maxRetries?: number }} budget
     */
    function capAlignAuditIndexes(indexes, budget = {}) {
        const list = (Array.isArray(indexes) ? indexes : [])
            .map((n) => Number(n))
            .filter((n) => Number.isInteger(n));
        const max = Number.isFinite(Number(budget.maxRetries))
            ? Math.max(0, Math.round(Number(budget.maxRetries)))
            : ALIGN_AUDIT_MAX_DEFAULT;
        if (list.length <= max) {
            return { indexes: list, truncated: false, dropped: 0 };
        }
        return {
            indexes: list.slice(0, max),
            truncated: true,
            dropped: list.length - max,
        };
    }

    /**
     * Per-chunk HTTP timeout: long tracks get more headroom before half-window recovery.
     */
    function resolveLongTrackChunkTimeoutMs(input = {}) {
        const explicit = Number(input.timeoutMs);
        if (Number.isFinite(explicit) && explicit > 0) {
            return Math.max(15000, Math.min(300000, Math.round(explicit)));
        }
        if (input.engineExternalMt || input.murasaki) {
            return CHUNK_TIMEOUT_EXTERNAL_MS;
        }
        const cueCount = Math.max(0, Math.round(Number(input.cueCount) || 0));
        const spanMs = Math.max(0, Math.round(Number(input.spanMs) || 0));
        if (isLongTrack({ cueCount, spanMs })) {
            return CHUNK_TIMEOUT_LONG_MS;
        }
        return CHUNK_TIMEOUT_DEFAULT_MS;
    }

    /**
     * Non-overlapping half-window slices (Sakura `chunkCues` shape: cue[][]).
     * @param {Array} cues
     * @param {{ halfMin?: number, chunkCuesFn?: function }} [options]
     * @returns {Array[]}
     */
    function planHalfWindowSlices(cues, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const halfMin = Math.max(1, Math.round(Number(options.halfMin) || HALF_WINDOW_MIN));
        if (list.length <= halfMin) return list.length ? [list] : [];
        const half = Math.max(halfMin, Math.ceil(list.length / 2));
        if (typeof options.chunkCuesFn === 'function') {
            return options.chunkCuesFn(list, { windowLines: half });
        }
        const out = [];
        for (let i = 0; i < list.length; i += half) {
            out.push(list.slice(i, i + half));
        }
        return out;
    }

    /** True when a failed multi-cue chunk should attempt half-window / per-cue recovery. */
    function shouldAttemptChunkSplitRecovery(chunkCues, options = {}) {
        const list = Array.isArray(chunkCues) ? chunkCues : [];
        const halfMin = Math.max(1, Math.round(Number(options.halfMin) || HALF_WINDOW_MIN));
        if (list.length <= halfMin) return false;
        if (options.aborted) return false;
        return true;
    }

    return {
        LONG_CUE_SOFT,
        LONG_CUE_HARD,
        LONG_SPAN_SOFT_MS,
        LONG_SPAN_HARD_MS,
        ALIGN_AUDIT_MAX_DEFAULT,
        ALIGN_AUDIT_MAX_LONG,
        ALIGN_AUDIT_MAX_VERY_LONG,
        CHUNK_TIMEOUT_DEFAULT_MS,
        CHUNK_TIMEOUT_LONG_MS,
        CHUNK_TIMEOUT_EXTERNAL_MS,
        HALF_WINDOW_MIN,
        resolveTrackSpanMs,
        isLongTrack,
        isVeryLongTrack,
        resolveAlignAuditBudget,
        capAlignAuditIndexes,
        resolveLongTrackChunkTimeoutMs,
        planHalfWindowSlices,
        shouldAttemptChunkSplitRecovery,
    };
}));
