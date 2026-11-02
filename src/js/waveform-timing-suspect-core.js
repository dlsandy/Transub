/**
 * Waveform energy → subtitle timing suspect labels (pure; no ffmpeg).
 * Primary detector for timing QC; Laya may only Score-rank already-flagged cues.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubWaveformTimingSuspect = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function waveformTimingSuspectFactory() {
    const DEFAULT_SAMPLE_RATE = 16000;
    const DEFAULT_PRE_MS = 600;
    const DEFAULT_POST_MS = 600;
    const DEFAULT_MAX_CANDIDATES = 64;
    const ISSUE_TYPE = 'timing_waveform';

    function clampInt(value, min, max, fallback) {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.min(max, Math.max(min, Math.round(n)));
    }

    function textCharLen(text) {
        return Array.from(String(text || '').replace(/\s+/g, '')).length;
    }

    function cueEndMs(cue) {
        if (cue?.endMs != null && Number.isFinite(Number(cue.endMs))) return Number(cue.endMs);
        return (Number(cue?.startMs) || 0) + 2000;
    }

    function cueCps(cue) {
        const start = Number(cue?.startMs) || 0;
        const end = cueEndMs(cue);
        const durSec = Math.max(0.05, (end - start) / 1000);
        return textCharLen(cue?.text) / durSec;
    }

    function rmsOf(int16, from, to) {
        const a = Math.max(0, from | 0);
        const b = Math.min(int16.length, to | 0);
        if (b <= a) return 0;
        let sum = 0;
        for (let i = a; i < b; i += 1) {
            const v = int16[i] / 32768;
            sum += v * v;
        }
        return Math.sqrt(sum / (b - a));
    }

    function frameRmsSeries(int16, sampleRate = DEFAULT_SAMPLE_RATE, hopMs = 20) {
        const hop = Math.max(1, Math.round((Number(hopMs) || 20) / 1000 * sampleRate));
        const out = [];
        for (let i = 0; i + hop <= int16.length; i += hop) {
            out.push({ i, rms: rmsOf(int16, i, i + hop) });
        }
        return out;
    }

    function median(arr) {
        if (!arr?.length) return 0;
        const s = [...arr].sort((a, b) => a - b);
        return s[Math.floor(s.length / 2)];
    }

    /**
     * Analyze one cue against a PCM window that includes pre/post pads.
     * @param {{ startMs?: number, endMs?: number, text?: string, index?: number }} cue
     * @param {Int16Array|ArrayLike<number>} pcm
     * @param {{ sampleRate?: number, preMs?: number, postMs?: number }} [opts]
     */
    function analyzeCuePcm(cue, pcm, opts = {}) {
        const sampleRate = clampInt(opts.sampleRate, 8000, 48000, DEFAULT_SAMPLE_RATE);
        const preMs = clampInt(opts.preMs, 100, 2000, DEFAULT_PRE_MS);
        const postMs = clampInt(opts.postMs, 100, 2000, DEFAULT_POST_MS);
        const int16 = pcm instanceof Int16Array
            ? pcm
            : new Int16Array(pcm?.buffer || pcm || []);
        const startMs = Number(cue?.startMs) || 0;
        const endMs = cueEndMs(cue);
        const durMs = Math.max(1, endMs - startMs);
        const chars = textCharLen(cue?.text);
        const cps = chars / Math.max(0.05, durMs / 1000);

        const preSamples = Math.round((preMs / 1000) * sampleRate);
        const bodySamples = Math.round((durMs / 1000) * sampleRate);
        const bodyStart = Math.min(int16.length, preSamples);
        const bodyEnd = Math.min(int16.length, preSamples + bodySamples);
        const postStart = bodyEnd;

        const rmsBody = rmsOf(int16, bodyStart, bodyEnd);
        const rmsPre = rmsOf(int16, 0, bodyStart);
        const rmsPost = rmsOf(int16, postStart, int16.length);
        const edgePre = rmsOf(
            int16,
            Math.max(0, bodyStart - Math.round(0.15 * sampleRate)),
            bodyStart,
        );
        const edgePost = rmsOf(
            int16,
            bodyEnd,
            Math.min(int16.length, bodyEnd + Math.round(0.15 * sampleRate)),
        );

        const series = frameRmsSeries(int16, sampleRate);
        const bodyFrames = series.filter((f) => f.i >= bodyStart && f.i < bodyEnd);
        const bodyMed = median(bodyFrames.map((f) => f.rms));
        const silenceThr = Math.max(0.01, bodyMed * 0.35);
        const nearStart = bodyFrames.slice(0, Math.min(8, bodyFrames.length));
        const nearEnd = bodyFrames.slice(Math.max(0, bodyFrames.length - 8));
        const startValley = nearStart.length ? Math.min(...nearStart.map((f) => f.rms)) : 0;
        const endValley = nearEnd.length ? Math.min(...nearEnd.map((f) => f.rms)) : 0;

        const spillStart = rmsBody > 1e-6 ? edgePre / rmsBody : 99;
        const spillEnd = rmsBody > 1e-6 ? edgePost / rmsBody : 99;
        const ratioPre = rmsBody > 1e-6 ? rmsPre / rmsBody : 99;
        const ratioPost = rmsBody > 1e-6 ? rmsPost / rmsBody : 99;

        let label = 'ok';
        const reasons = [];
        if (rmsBody < 0.012 && chars >= 3) {
            label = 'hard';
            reasons.push('body_quiet');
        }
        if (spillStart > 0.85 && ratioPre > 0.7) {
            label = label === 'hard' ? 'hard' : 'soft';
            reasons.push('start_spill');
        }
        if (spillEnd > 0.85 && ratioPost > 0.7) {
            label = label === 'hard' ? 'hard' : 'soft';
            reasons.push('end_spill');
        }
        if (cps > 14 && durMs < 2500) {
            label = label === 'ok' ? 'soft' : label;
            reasons.push('high_cps');
        }
        if (durMs < 280 && chars >= 4) {
            label = 'hard';
            reasons.push('too_short');
        }
        if (startValley > silenceThr * 1.8 && spillStart > 0.6) {
            label = label === 'ok' ? 'soft' : label;
            reasons.push('start_not_in_valley');
        }
        if (endValley > silenceThr * 1.8 && spillEnd > 0.6) {
            label = label === 'ok' ? 'soft' : label;
            reasons.push('end_not_in_valley');
        }
        if (!reasons.length) reasons.push('clean');

        const index = Number.isInteger(Number(cue?.index)) ? Number(cue.index) : -1;
        return {
            index,
            startMs,
            endMs,
            durMs,
            text: String(cue?.text || '').slice(0, 120),
            chars,
            cps: Number(cps.toFixed(2)),
            rmsBody: Number(rmsBody.toFixed(4)),
            rmsPre: Number(rmsPre.toFixed(4)),
            rmsPost: Number(rmsPost.toFixed(4)),
            spillStart: Number(spillStart.toFixed(3)),
            spillEnd: Number(spillEnd.toFixed(3)),
            ratioPre: Number(ratioPre.toFixed(3)),
            ratioPost: Number(ratioPost.toFixed(3)),
            silenceThr: Number(silenceThr.toFixed(4)),
            label,
            reasons,
            severity: severityOfLabel(label, reasons, spillStart, spillEnd),
        };
    }

    function severityOfLabel(label, reasons, spillStart, spillEnd) {
        let n = label === 'hard' ? 2 : (label === 'soft' ? 1 : 0);
        if ((reasons || []).includes('body_quiet')) n += 1;
        if ((reasons || []).includes('too_short')) n += 1;
        n += Math.min(2, Math.floor((((Number(spillStart) || 0) + (Number(spillEnd) || 0)) / 2) * 2));
        return n;
    }

    /**
     * Cheap preselect before ffmpeg: prefer structural QC hits + extreme CPS/dur.
     */
    function pickWaveformCandidates(cues, issues, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const max = clampInt(options.maxCandidates, 4, 120, DEFAULT_MAX_CANDIDATES);
        const issueBoost = new Map();
        for (const issue of Array.isArray(issues) ? issues : []) {
            const idx = Number(issue?.index);
            if (!Number.isInteger(idx) || idx < 0 || idx >= list.length) continue;
            const types = Array.isArray(issue.types) ? issue.types : [];
            let boost = Number(issueBoost.get(idx) || 0);
            if (types.includes('high_cps')) boost += 3;
            if (types.includes('short')) boost += 3;
            if (types.includes('long')) boost += 2;
            if (types.includes('connected')) boost += 2;
            if (types.includes('overlap')) boost += 2;
            if (types.includes('splittable')) boost += 1;
            issueBoost.set(idx, boost);
        }
        const scored = [];
        let creditApi = null;
        try {
            creditApi = (typeof module !== 'undefined' && module.exports)
                ? require('./subtitle-software-credit-core')
                : (typeof globalThis !== 'undefined' ? globalThis.TransubSubtitleSoftwareCredit : null);
        } catch { /* optional */ }
        for (let i = 0; i < list.length; i += 1) {
            const cue = list[i];
            const text = String(cue?.text || '').trim();
            if (!text) continue;
            if (creditApi?.isSoftwareCreditText?.(text)) continue;
            const dur = Math.max(1, cueEndMs(cue) - (Number(cue.startMs) || 0));
            const chars = textCharLen(text);
            const cps = chars / Math.max(0.05, dur / 1000);
            let score = Number(issueBoost.get(i) || 0);
            if (cps > 12) score += 2;
            if (cps > 9 && chars >= 6) score += 1;
            if (cps < 2 && chars >= 4) score += 1;
            if (dur < 350 && chars >= 3) score += 2;
            if (dur < 500 && chars >= 8) score += 1;
            if (dur > 8000) score += 1;
            if (dur > 5500 && chars >= 10) score += 1;
            // Soft include: longer spoken lines are worth an energy check even without CPS flags.
            if (score <= 0 && chars >= 10 && dur >= 800 && dur <= 7000) score += 1;
            if (score <= 0) continue;
            scored.push({ index: i, score, cps, durMs: dur });
        }
        scored.sort((a, b) => b.score - a.score || a.index - b.index);
        return scored.slice(0, max).map((row) => ({
            ...list[row.index],
            index: row.index,
            _preScore: row.score,
        }));
    }

    function suspectsFromAnalyses(analyses) {
        return (Array.isArray(analyses) ? analyses : [])
            .filter((a) => a && (a.label === 'soft' || a.label === 'hard'));
    }

    function toQcIssues(suspects) {
        return (Array.isArray(suspects) ? suspects : []).map((s) => ({
            index: Number(s.index),
            types: [ISSUE_TYPE, s.label === 'hard' ? 'timing_waveform_hard' : 'timing_waveform_soft'],
            messages: [
                s.label === 'hard' ? '波形计时可疑（强）' : '波形计时可疑（弱）',
                ...(Array.isArray(s.reasons) ? s.reasons.filter((r) => r !== 'clean') : []),
            ],
            severity: s.label === 'hard' ? 'warn' : 'info',
            autoFixable: false,
            timingWaveform: {
                label: s.label,
                reasons: s.reasons,
                severity: s.severity,
                spillStart: s.spillStart,
                spillEnd: s.spillEnd,
                cps: s.cps,
                rmsBody: s.rmsBody,
            },
        })).filter((x) => Number.isInteger(x.index) && x.index >= 0);
    }

    function mergeWaveformIssues(existingIssues, suspects) {
        const base = Array.isArray(existingIssues) ? existingIssues.slice() : [];
        const byIdx = new Map();
        for (const issue of base) {
            const idx = Number(issue?.index);
            if (!Number.isInteger(idx)) continue;
            byIdx.set(idx, issue);
        }
        for (const issue of toQcIssues(suspects)) {
            const prev = byIdx.get(issue.index);
            if (!prev) {
                base.push(issue);
                byIdx.set(issue.index, issue);
                continue;
            }
            const types = new Set([
                ...(Array.isArray(prev.types) ? prev.types : []),
                ...issue.types,
            ]);
            const messages = [
                ...(Array.isArray(prev.messages) ? prev.messages : []),
                ...issue.messages.filter((m) => !(prev.messages || []).includes(m)),
            ];
            const merged = {
                ...prev,
                types: [...types],
                messages,
                timingWaveform: issue.timingWaveform,
            };
            const pos = base.indexOf(prev);
            if (pos >= 0) base[pos] = merged;
            byIdx.set(issue.index, merged);
        }
        return base;
    }

    /** Heuristic order before/without Laya Score. */
    function orderSuspectIndexes(suspects) {
        return [...(Array.isArray(suspects) ? suspects : [])]
            .sort((a, b) => (Number(b.severity) || 0) - (Number(a.severity) || 0)
                || (Number(a.index) || 0) - (Number(b.index) || 0))
            .map((s) => Number(s.index))
            .filter((n) => Number.isInteger(n) && n >= 0);
    }

    function featureBlurbForLaya(row) {
        return [
            `text: ${String(row?.text || '').slice(0, 80)}`,
            `durMs=${row?.durMs} chars=${row?.chars} cps=${row?.cps}`,
            `rmsBody=${row?.rmsBody} rmsPre=${row?.rmsPre} rmsPost=${row?.rmsPost}`,
            `spillStart=${row?.spillStart} spillEnd=${row?.spillEnd}`,
            `ratioPre=${row?.ratioPre} ratioPost=${row?.ratioPost}`,
        ].join('\n');
    }

    /**
     * Find speech onset/offset inside a padded PCM window (absolute cue times).
     * @returns {{ speechStartMs: number, speechEndMs: number, thr: number }|null}
     */
    function findSpeechBoundsInPcm(pcm, cue, opts = {}) {
        const sampleRate = clampInt(opts.sampleRate, 8000, 48000, DEFAULT_SAMPLE_RATE);
        const preMs = clampInt(opts.preMs, 100, 2000, DEFAULT_PRE_MS);
        const postMs = clampInt(opts.postMs, 100, 2000, DEFAULT_POST_MS);
        const int16 = pcm instanceof Int16Array
            ? pcm
            : new Int16Array(pcm?.buffer || pcm || []);
        if (int16.length < sampleRate * 0.05) return null;

        const cueStart = Number(cue?.startMs) || 0;
        const cueEnd = cueEndMs(cue);
        const windowStartMs = cueStart - preMs;
        const series = frameRmsSeries(int16, sampleRate, 20);
        if (series.length < 4) return null;

        const bodyStart = Math.round((preMs / 1000) * sampleRate);
        const bodyEnd = Math.min(
            int16.length,
            bodyStart + Math.round(((cueEnd - cueStart) / 1000) * sampleRate),
        );
        const bodyFrames = series.filter((f) => f.i >= bodyStart && f.i < bodyEnd);
        const bodyMed = median(bodyFrames.map((f) => f.rms));
        const thr = Math.max(0.012, bodyMed * (Number(opts.silenceThrFactor) || 0.42));

        // ASR tighten: ignore pre/post pad energy so soft-AV neighbors cannot
        // pull the start earlier than the cue's own island.
        const search = opts.searchBodyOnly
            ? series.filter((f) => f.i >= bodyStart && f.i < bodyEnd)
            : series;
        let first = -1;
        let last = -1;
        for (const f of search) {
            if (f.rms >= thr) {
                if (first < 0) first = f.i;
                last = f.i;
            }
        }
        if (first < 0 || last < first) return null;

        const hop = Math.max(1, Math.round(0.02 * sampleRate));
        const speechStartMs = windowStartMs + (first / sampleRate) * 1000;
        const speechEndMs = windowStartMs + ((last + hop) / sampleRate) * 1000;
        return {
            speechStartMs: Math.round(speechStartMs),
            speechEndMs: Math.round(speechEndMs),
            thr: Number(thr.toFixed(4)),
            bodyMed: Number(bodyMed.toFixed(4)),
        };
    }

    /**
     * Propose edge snap from waveform energy (pads included in pcm).
     * Only snaps when spill/quiet-edge evidence exists unless force=true.
     */
    function proposeEdgeSnap(cue, pcm, opts = {}) {
        const cueStart = Math.round(Number(cue?.startMs) || 0);
        const cueEnd = Math.max(cueStart + 1, Math.round(cueEndMs(cue)));
        const analysis = opts.analysis || analyzeCuePcm(cue, pcm, opts);
        const reasons = analysis?.reasons || [];
        const wantStart = opts.force
            || reasons.includes('start_spill')
            || reasons.includes('start_not_in_valley')
            || (analysis?.spillStart || 0) > 0.75;
        const wantEnd = opts.force
            || reasons.includes('end_spill')
            || reasons.includes('end_not_in_valley')
            || (analysis?.spillEnd || 0) > 0.75;
        if (!wantStart && !wantEnd) {
            return {
                index: analysis?.index ?? Number(cue?.index),
                startMs: cueStart,
                endMs: cueEnd,
                changed: false,
                reason: 'no_spill',
            };
        }

        const bounds = findSpeechBoundsInPcm(pcm, cue, {
            ...opts,
            searchBodyOnly: opts.searchBodyOnly === true || opts.tightenOnly === true,
        });
        if (!bounds) {
            return {
                index: analysis?.index ?? Number(cue?.index),
                startMs: cueStart,
                endMs: cueEnd,
                changed: false,
                reason: 'no_speech',
            };
        }

        const headPadMs = clampInt(opts.headPadMs, 0, 200, 60);
        const tailPadMs = clampInt(opts.tailPadMs, 0, 200, 80);
        const minDurMs = clampInt(opts.minDurMs, 120, 5000, 320);
        const minShiftMs = clampInt(opts.minShiftMs, 20, 500, 45);
        const maxShiftMs = clampInt(opts.maxShiftMs, 100, 3000, 1200);
        const preMs = clampInt(opts.preMs, 100, 2000, DEFAULT_PRE_MS);
        const postMs = clampInt(opts.postMs, 100, 2000, DEFAULT_POST_MS);

        let newStart = cueStart;
        let newEnd = cueEnd;
        if (wantStart) {
            newStart = bounds.speechStartMs - headPadMs;
        }
        if (wantEnd) {
            newEnd = bounds.speechEndMs + tailPadMs;
        }

        // Stay inside extract window and neighbor limits when provided.
        const windowStart = cueStart - preMs;
        const windowEnd = cueEnd + postMs;
        const prevLimit = opts.prevLimitMs != null ? Number(opts.prevLimitMs) : windowStart;
        const nextLimit = opts.nextLimitMs != null ? Number(opts.nextLimitMs) : windowEnd;
        newStart = Math.max(windowStart, prevLimit, Math.round(newStart));
        newEnd = Math.min(windowEnd, nextLimit, Math.round(newEnd));

        // Do not jump wildly; clamp deltas.
        if (Math.abs(newStart - cueStart) > maxShiftMs) {
            newStart = cueStart + Math.sign(newStart - cueStart) * maxShiftMs;
        }
        if (Math.abs(newEnd - cueEnd) > maxShiftMs) {
            newEnd = cueEnd + Math.sign(newEnd - cueEnd) * maxShiftMs;
        }

        if (newEnd - newStart < minDurMs) {
            return {
                index: analysis?.index ?? Number(cue?.index),
                startMs: cueStart,
                endMs: cueEnd,
                changed: false,
                reason: 'too_short',
            };
        }

        const startDelta = newStart - cueStart;
        const endDelta = newEnd - cueEnd;
        if (Math.abs(startDelta) < minShiftMs && Math.abs(endDelta) < minShiftMs) {
            return {
                index: analysis?.index ?? Number(cue?.index),
                startMs: cueStart,
                endMs: cueEnd,
                changed: false,
                reason: 'unchanged',
            };
        }

        return {
            index: analysis?.index ?? Number(cue?.index),
            startMs: newStart,
            endMs: newEnd,
            changed: true,
            reason: 'energy_bounds',
            startDelta,
            endDelta,
            thr: bounds.thr,
            analysisLabel: analysis?.label,
        };
    }

    /**
     * Relative valley depth at absolute time (1 = deep quiet, 0 = as loud as body).
     */
    function valleyDepthAtMs(pcm, absMs, cue, opts = {}) {
        const sampleRate = clampInt(opts.sampleRate, 8000, 48000, DEFAULT_SAMPLE_RATE);
        const preMs = clampInt(opts.preMs, 100, 2000, DEFAULT_PRE_MS);
        const int16 = pcm instanceof Int16Array
            ? pcm
            : new Int16Array(pcm?.buffer || pcm || []);
        const cueStart = Number(cue?.startMs) || 0;
        const windowStartMs = cueStart - preMs;
        const relMs = Number(absMs) - windowStartMs;
        if (relMs < 0 || !int16.length) return 0;
        const center = Math.round((relMs / 1000) * sampleRate);
        const half = Math.round(0.04 * sampleRate);
        const local = rmsOf(int16, center - half, center + half);
        const analysis = opts.analysis || analyzeCuePcm(cue, int16, opts);
        const body = Math.max(1e-6, Number(analysis.rmsBody) || 1e-6);
        const ratio = local / body;
        return Math.max(0, Math.min(1, 1 - ratio));
    }

    /**
     * Re-score silence/LLM split candidate points: prefer deep mid-cue valleys.
     * @returns {number[]} points sorted by score desc then time
     */
    function rankSplitPointsByValley(pointsMs, cue, pcm, opts = {}) {
        const list = (Array.isArray(pointsMs) ? pointsMs : [])
            .map((n) => Math.round(Number(n) || 0))
            .filter((n) => n > 0);
        if (!list.length) return [];
        const cueStart = Number(cue?.startMs) || 0;
        const cueEnd = cueEndMs(cue);
        const dur = Math.max(1, cueEnd - cueStart);
        const scored = list.map((ms) => {
            const depth = valleyDepthAtMs(pcm, ms, cue, opts);
            const pos = (ms - cueStart) / dur;
            // Prefer mid-cue valleys (0.25–0.75).
            const midBoost = pos >= 0.22 && pos <= 0.78 ? 0.15 : 0;
            return { ms, score: depth + midBoost };
        });
        scored.sort((a, b) => b.score - a.score || a.ms - b.ms);
        const minDepth = Number(opts.minValleyDepth);
        const filtered = Number.isFinite(minDepth)
            ? scored.filter((s) => s.score >= minDepth)
            : scored;
        return (filtered.length ? filtered : scored).map((s) => s.ms);
    }

    /**
     * Apply snaps to cue list with neighbor non-overlap.
     */
    function applyEdgeSnapsToCues(cues, snaps, opts = {}) {
        const list = (Array.isArray(cues) ? cues : []).map((c) => ({ ...c }));
        const gapMs = clampInt(opts.gapMs, 0, 50, 1);
        const byIdx = new Map();
        for (const s of Array.isArray(snaps) ? snaps : []) {
            if (!s?.changed) continue;
            const idx = Number(s.index);
            if (!Number.isInteger(idx) || idx < 0 || idx >= list.length) continue;
            byIdx.set(idx, s);
        }
        let changed = 0;
        for (const [idx, snap] of byIdx.entries()) {
            const prev = idx > 0 ? list[idx - 1] : null;
            const next = idx < list.length - 1 ? list[idx + 1] : null;
            let startMs = Math.round(Number(snap.startMs) || 0);
            let endMs = Math.round(Number(snap.endMs) || 0);
            if (prev) {
                const prevEnd = cueEndMs(prev);
                startMs = Math.max(startMs, prevEnd + gapMs);
            }
            if (next) {
                const nextStart = Number(next.startMs) || 0;
                endMs = Math.min(endMs, nextStart - gapMs);
            }
            if (endMs - startMs < 120) continue;
            const before = list[idx];
            if (Math.round(Number(before.startMs)) === startMs
                && Math.round(cueEndMs(before)) === endMs) {
                continue;
            }
            list[idx] = { ...before, startMs, endMs };
            changed += 1;
        }
        return { cues: list, changed };
    }

    return {
        ISSUE_TYPE,
        DEFAULT_SAMPLE_RATE,
        DEFAULT_PRE_MS,
        DEFAULT_POST_MS,
        DEFAULT_MAX_CANDIDATES,
        textCharLen,
        cueEndMs,
        cueCps,
        rmsOf,
        frameRmsSeries,
        analyzeCuePcm,
        severityOfLabel,
        pickWaveformCandidates,
        suspectsFromAnalyses,
        toQcIssues,
        mergeWaveformIssues,
        orderSuspectIndexes,
        featureBlurbForLaya,
        findSpeechBoundsInPcm,
        proposeEdgeSnap,
        valleyDepthAtMs,
        rankSplitPointsByValley,
        applyEdgeSnapsToCues,
    };
}));
