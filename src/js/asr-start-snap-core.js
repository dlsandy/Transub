/**
 * Post-ASR cheap start/edge snap planner (pure).
 * Targets soft-AV island padding: long wall-clock cues with sparse text.
 * Energy bounds come from waveform-timing-suspect; this module only selects
 * who to snap and with which clamp policy.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAsrStartSnap = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function asrStartSnapFactory() {
    const DEFAULT_MAX_SNAPS = 48;
    const SOFT_MIN_DUR_MS = 2800;
    const HARD_MIN_DUR_MS = 4000;
    const LOW_CPS = 3.6;
    const VERY_LOW_CPS = 2.2;

    function normalizeMode(value) {
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

    function isSoftProfile(options = {}) {
        const p = String(options.contentProfile || options.senseProfile || '').trim().toLowerCase();
        return p === 'av_soft' || p === 'soft';
    }

    /**
     * auto → quality soft-AV (or explicit on). asrTiming=off kills it.
     */
    function shouldRunAsrStartSnap(options = {}) {
        if (options.skipAsrStartSnap === true || options.skipAsr === true) return false;
        const timing = String(options.asrTiming == null ? '' : options.asrTiming).trim().toLowerCase();
        if (timing === 'off' || timing === 'false' || timing === '0' || timing === 'none') return false;
        const mode = normalizeMode(options.asrStartSnap ?? options.asrEdgeSnap);
        if (mode === 'off') return false;
        if (mode === 'on') return true;
        if (isSpeedProfile(options)) return false;
        return isSoftProfile(options);
    }

    function cueEndMs(cue) {
        if (cue?.endMs != null && Number.isFinite(Number(cue.endMs))) return Number(cue.endMs);
        return (Number(cue?.startMs) || 0) + 2000;
    }

    function textCharLen(text) {
        return Array.from(String(text || '').replace(/\s+/g, '')).length;
    }

    function cueCps(cue) {
        const start = Number(cue?.startMs) || 0;
        const end = cueEndMs(cue);
        const durSec = Math.max(0.05, (end - start) / 1000);
        return textCharLen(cue?.text) / durSec;
    }

    function isPunctOrMoanHeavy(text) {
        const t = String(text || '').replace(/\s+/g, '');
        if (!t) return true;
        const bare = t.replace(/[。．！？?!…、，,～~ー\-—「」『』（）()【】[\]・.…]/g, '');
        if (!bare) return true;
        return /^(?:うん+|はい+|ええ+|えっ+|え+|あっ+|ああ+|はぁ+|はっ+|んっ+|んん+|ふぁ+|ふっ+|ひゃ+|ん+)+$/u.test(bare);
    }

    /**
     * Soft density: long island + sparse text → likely VAD pad around real speech.
     */
    function isSparseTimingCue(cue, options = {}) {
        const soft = isSoftProfile(options);
        const start = Number(cue?.startMs) || 0;
        const end = cueEndMs(cue);
        const dur = end - start;
        const minDur = soft ? SOFT_MIN_DUR_MS : HARD_MIN_DUR_MS;
        if (!(dur >= minDur)) return false;
        const chars = textCharLen(cue?.text);
        if (chars < 1) return false;
        // Pure moan islands: still snap edges (pad around breaths), but lower priority.
        const cps = chars / Math.max(0.05, dur / 1000);
        if (cps <= VERY_LOW_CPS) return true;
        if (cps <= LOW_CPS && chars <= 18) return true;
        if (soft && dur >= 5000 && cps <= LOW_CPS + 0.8) return true;
        return false;
    }

    function candidateScore(cue, options = {}) {
        const dur = cueEndMs(cue) - (Number(cue?.startMs) || 0);
        const cps = cueCps(cue);
        const soft = isSoftProfile(options);
        let score = Math.min(40, dur / 200) + Math.max(0, (LOW_CPS - cps) * 12);
        if (soft) score += 8;
        if (isPunctOrMoanHeavy(cue?.text)) score -= 6;
        return score;
    }

    /**
     * @returns {Array<{ index: number, startMs: number, endMs: number, text: string, cps: number, score: number }>}
     */
    function selectStartSnapCandidates(cues, options = {}) {
        if (!shouldRunAsrStartSnap(options)) return [];
        const max = Math.max(4, Math.min(80, Number(options.maxStartSnaps) || DEFAULT_MAX_SNAPS));
        const list = Array.isArray(cues) ? cues : [];
        const ranked = [];
        for (let i = 0; i < list.length; i += 1) {
            const cue = list[i];
            if (!isSparseTimingCue(cue, options)) continue;
            ranked.push({
                index: Number.isInteger(Number(cue?.index)) ? Number(cue.index) : i,
                startMs: Number(cue.startMs) || 0,
                endMs: cueEndMs(cue),
                text: String(cue.text || '').trim(),
                cps: Number(cueCps(cue).toFixed(2)),
                score: candidateScore(cue, options),
            });
        }
        ranked.sort((a, b) => b.score - a.score || b.endMs - b.startMs - (a.endMs - a.startMs));
        return ranked.slice(0, max);
    }

    /**
     * Soft-AV ASR snap clamps: tighten inside the island only (no expand).
     */
    function resolveSnapClampOptions(options = {}) {
        const soft = isSoftProfile(options);
        return {
            force: true,
            tightenOnly: true,
            searchBodyOnly: true,
            headPadMs: soft ? 30 : 50,
            tailPadMs: soft ? 80 : 70,
            minDurMs: soft ? 280 : 320,
            minShiftMs: 60,
            maxShiftMs: soft ? 2800 : 1400,
            preMs: soft ? 800 : 600,
            postMs: soft ? 800 : 600,
            silenceThrFactor: soft ? 0.38 : 0.42,
        };
    }

    /**
     * Keep only tighten deltas: start later and/or end earlier.
     * Expanding into neighbor pads made soft-AV CPS worse on SORA-657.
     */
    function filterSnapForAsr(snap, cue, opts = {}) {
        if (!snap?.changed) {
            return snap || {
                changed: false,
                startMs: Number(cue?.startMs) || 0,
                endMs: cueEndMs(cue),
                reason: 'no_snap',
            };
        }
        const start = Number(cue?.startMs) || 0;
        const end = cueEndMs(cue);
        const minShift = Math.max(20, Number(opts.minShiftMs) || 60);
        const minDur = Math.max(120, Number(opts.minDurMs) || 280);
        let newStart = Number(snap.startMs);
        let newEnd = Number(snap.endMs);
        if (!Number.isFinite(newStart)) newStart = start;
        if (!Number.isFinite(newEnd)) newEnd = end;

        // Never expand outside the original cue (tiny pad allowance).
        if (newStart < start) newStart = start;
        if (newEnd > end) newEnd = end;
        if (opts.startOnly === true) newEnd = end;

        // Drop microscopic moves.
        if (newStart - start < minShift) newStart = start;
        if (end - newEnd < minShift) newEnd = end;

        if (newEnd - newStart < minDur) {
            return {
                ...snap,
                startMs: start,
                endMs: end,
                changed: false,
                reason: 'too_short',
            };
        }
        if (newStart === start && newEnd === end) {
            return {
                ...snap,
                startMs: start,
                endMs: end,
                changed: false,
                reason: 'unchanged',
            };
        }
        // Require net tighten (duration must not grow).
        if ((newEnd - newStart) > (end - start)) {
            return {
                ...snap,
                startMs: start,
                endMs: end,
                changed: false,
                reason: 'expand_rejected',
            };
        }
        return {
            ...snap,
            startMs: newStart,
            endMs: newEnd,
            changed: true,
            startDelta: newStart - start,
            endDelta: newEnd - end,
            reason: 'energy_tighten',
        };
    }

    return {
        DEFAULT_MAX_SNAPS,
        SOFT_MIN_DUR_MS,
        HARD_MIN_DUR_MS,
        LOW_CPS,
        VERY_LOW_CPS,
        normalizeMode,
        shouldRunAsrStartSnap,
        isSoftProfile,
        isSpeedProfile,
        textCharLen,
        cueEndMs,
        cueCps,
        isPunctOrMoanHeavy,
        isSparseTimingCue,
        selectStartSnapCandidates,
        resolveSnapClampOptions,
        filterSnapForAsr,
    };
}));
