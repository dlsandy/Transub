/**
 * 时间轴拖拽磁吸：播放头 / 相邻字幕边界 / 可选静音边
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubTimelineMagnet = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function timelineMagnetCoreFactory() {
    const DEFAULT_THRESHOLD_MS = 80;

    function cueEndMs(cue) {
        if (!cue) return 0;
        if (cue.endMs != null && Number.isFinite(Number(cue.endMs))) return Number(cue.endMs);
        return (Number(cue.startMs) || 0) + 2000;
    }

    /**
     * Collect snap targets for dragging cue at idx.
     */
    function collectSnapTargets(cues, idx, {
        playheadMs = null,
        silenceEdges = null,
        includeNeighbors = true,
    } = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const targets = [];
        if (Number.isFinite(Number(playheadMs))) {
            targets.push({ ms: Math.max(0, Math.round(playheadMs)), kind: 'playhead' });
        }
        if (includeNeighbors) {
            const prev = idx > 0 ? list[idx - 1] : null;
            const next = idx < list.length - 1 ? list[idx + 1] : null;
            if (prev) {
                targets.push({ ms: Math.round(Number(prev.startMs) || 0), kind: 'neighbor-start' });
                targets.push({ ms: Math.round(cueEndMs(prev)), kind: 'neighbor-end' });
            }
            if (next) {
                targets.push({ ms: Math.round(Number(next.startMs) || 0), kind: 'neighbor-start' });
                targets.push({ ms: Math.round(cueEndMs(next)), kind: 'neighbor-end' });
            }
        }
        const edges = Array.isArray(silenceEdges) ? silenceEdges : [];
        for (const edge of edges) {
            const ms = Number(edge?.ms ?? edge);
            if (Number.isFinite(ms)) {
                targets.push({ ms: Math.max(0, Math.round(ms)), kind: 'silence' });
            }
        }
        return targets;
    }

    function nearestSnap(ms, targets, thresholdMs = DEFAULT_THRESHOLD_MS) {
        const value = Math.round(Number(ms) || 0);
        const thr = Math.max(1, Number(thresholdMs) || DEFAULT_THRESHOLD_MS);
        let best = null;
        for (const t of targets || []) {
            const dist = Math.abs(t.ms - value);
            if (dist <= thr && (!best || dist < best.dist)) {
                best = { ...t, dist };
            }
        }
        return best;
    }

    /**
     * Snap a dragged cue timing.
     * @param {'move'|'start'|'end'} mode
     */
    function snapDragTiming({
        mode = 'move',
        startMs,
        endMs,
        originStart,
        originEnd,
        targets = [],
        thresholdMs = DEFAULT_THRESHOLD_MS,
        minDurMs = 100,
    } = {}) {
        const minDur = Math.max(1, Number(minDurMs) || 100);
        let start = Math.max(0, Math.round(Number(startMs) || 0));
        let end = Math.max(start + minDur, Math.round(Number(endMs) || start + minDur));
        let snapped = null;

        if (mode === 'start') {
            const hit = nearestSnap(start, targets, thresholdMs);
            if (hit) {
                start = Math.min(end - minDur, hit.ms);
                snapped = { edge: 'start', ...hit };
            }
        } else if (mode === 'end') {
            const hit = nearestSnap(end, targets, thresholdMs);
            if (hit) {
                end = Math.max(start + minDur, hit.ms);
                snapped = { edge: 'end', ...hit };
            }
        } else {
            // move: try snap start or end, keep duration
            const dur = Math.max(minDur, Math.round((Number(originEnd) || end) - (Number(originStart) || start)));
            const hitStart = nearestSnap(start, targets, thresholdMs);
            const hitEnd = nearestSnap(end, targets, thresholdMs);
            let hit = null;
            if (hitStart && hitEnd) hit = hitStart.dist <= hitEnd.dist ? hitStart : hitEnd;
            else hit = hitStart || hitEnd;
            if (hit) {
                if (hit === hitStart || (hitStart && hit.ms === hitStart.ms && hit.kind === hitStart.kind)) {
                    start = Math.max(0, hit.ms);
                    end = start + dur;
                    snapped = { edge: 'start', ...hit };
                } else {
                    end = Math.max(dur, hit.ms);
                    start = Math.max(0, end - dur);
                    snapped = { edge: 'end', ...hit };
                }
            }
        }
        return { startMs: start, endMs: end, snapped };
    }

    /**
     * Convert silence intervals [{startMs,endMs}] to edge list.
     */
    function silenceIntervalsToEdges(intervals, {
        viewStartMs = 0,
        viewEndMs = Infinity,
        maxEdges = 80,
    } = {}) {
        const list = Array.isArray(intervals) ? intervals : [];
        const out = [];
        const v0 = Number(viewStartMs) || 0;
        const v1 = Number.isFinite(Number(viewEndMs)) ? Number(viewEndMs) : Infinity;
        for (const it of list) {
            const a = Math.round(Number(it.startMs ?? it.start) || 0);
            const b = Math.round(Number(it.endMs ?? it.end) || 0);
            if (a >= v0 && a <= v1) out.push({ ms: a, kind: 'silence' });
            if (b >= v0 && b <= v1) out.push({ ms: b, kind: 'silence' });
            if (out.length >= maxEdges) break;
        }
        return out;
    }

    /**
     * Threshold scales with zoom: tighter when zoomed in.
     */
    function thresholdForViewSpan(viewSpanMs, {
        baseMs = DEFAULT_THRESHOLD_MS,
        pxThreshold = 8,
        trackWidthPx = 800,
    } = {}) {
        const span = Math.max(1, Number(viewSpanMs) || 1);
        const w = Math.max(1, Number(trackWidthPx) || 800);
        const fromPx = Math.round((Number(pxThreshold) || 8) / w * span);
        return Math.max(24, Math.min(160, Math.max(Number(baseMs) || DEFAULT_THRESHOLD_MS, fromPx)));
    }

    return {
        DEFAULT_THRESHOLD_MS,
        cueEndMs,
        collectSnapTargets,
        nearestSnap,
        snapDragTiming,
        silenceIntervalsToEdges,
        thresholdForViewSpan,
    };
}));
