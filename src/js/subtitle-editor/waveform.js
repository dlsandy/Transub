/**
 * Timeline waveform paint + zoom detail helpers (no DOM/state ownership).
 */
(function (global) {
    const OVERVIEW_PEAKS_PER_SEC = 60;
    const OVERVIEW_MAX_PEAKS = 36000;
    const DETAIL_MAX_PEAKS_PER_SEC = 400;
    const DETAIL_MIN_PEAKS_PER_SEC = 80;
    const DETAIL_GRID_MS = 250;
    /** Prefer detail when overview yields fewer than this many peaks per CSS pixel. */
    const DETAIL_PX_COVERAGE = 0.85;

    function samplePeak(peaks, indexF) {
        if (!peaks?.length) return 0;
        const maxI = peaks.length - 1;
        // Outside the envelope is silence. Clamping used to repeat the last
        // peak across the rest of the timeline (a flat bar).
        if (indexF < 0 || indexF > maxI) return 0;
        const i0 = Math.floor(indexF);
        const i1 = Math.min(maxI, i0 + 1);
        const t = indexF - i0;
        const a = peaks[i0] || 0;
        const b = peaks[i1] || 0;
        return a + (b - a) * t;
    }

    function peakMaxInRange(peaks, startF, endF) {
        if (!peaks?.length) return 0;
        const maxI = peaks.length - 1;
        if (endF < 0 || startF > maxI) return 0;
        const lo = Math.max(0, startF);
        const hi = Math.min(maxI, endF);
        if (hi - lo <= 1) {
            return Math.max(samplePeak(peaks, lo), samplePeak(peaks, hi));
        }
        const start = Math.max(0, Math.floor(lo));
        const end = Math.min(peaks.length, Math.ceil(hi));
        let peak = 0;
        for (let i = start; i < end; i += 1) {
            const v = peaks[i] || 0;
            if (v > peak) peak = v;
        }
        return peak;
    }

    /**
     * Choose overview vs detail peaks for the current view.
     * @returns {{ peaks: number[], startMs: number, durationMs: number } | null}
     */
    function resolvePeaksForView({ overview, detail, viewStartMs, viewEndMs, mediaDurationMs }) {
        const mediaMs = Math.max(1, Number(mediaDurationMs) || 1);
        const v0 = Math.max(0, Number(viewStartMs) || 0);
        const v1 = Math.max(v0 + 1, Number(viewEndMs) || (v0 + 1));
        if (detailCoversView(detail, v0, v1)) {
            const startMs = Math.max(0, Number(detail.startMs) || 0);
            const endMs = Math.max(startMs + 1, Number(detail.endMs) || (startMs + 1));
            return {
                peaks: detail.peaks,
                startMs,
                durationMs: endMs - startMs,
            };
        }
        if (!Array.isArray(overview?.peaks) || !overview.peaks.length) return null;
        const durationMs = Math.max(
            1,
            Number(overview.durationMs) > 0
                ? Number(overview.durationMs)
                : mediaMs,
        );
        return {
            peaks: overview.peaks,
            startMs: 0,
            durationMs,
        };
    }

    function detailCoversView(detail, viewStartMs, viewEndMs) {
        if (!detail || !Array.isArray(detail.peaks) || !detail.peaks.length) return false;
        const startMs = Number(detail.startMs);
        const endMs = Number(detail.endMs);
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return false;
        return startMs <= viewStartMs + 1 && endMs >= viewEndMs - 1;
    }

    function shouldLoadDetailPeaks({
        peaksLength,
        mediaDurationMs,
        viewStartMs,
        viewEndMs,
        widthPx,
        detail,
    }) {
        const width = Math.max(0, Math.floor(Number(widthPx) || 0));
        if (width < 8) return false;
        const mediaMs = Math.max(1, Number(mediaDurationMs) || 1);
        const v0 = Math.max(0, Number(viewStartMs) || 0);
        const v1 = Math.max(v0 + 1, Number(viewEndMs) || (v0 + 1));
        if (detailCoversView(detail, v0, v1)) return false;
        const peaks = Math.max(0, Number(peaksLength) || 0);
        if (peaks < 8) return false;
        const viewMs = v1 - v0;
        const peaksInView = peaks * (viewMs / mediaMs);
        return peaksInView < width * DETAIL_PX_COVERAGE;
    }

    /**
     * Whole-file envelope. Density drops on long media so every second is
     * represented inside OVERVIEW_MAX_PEAKS (no tail cut-off).
     */
    function buildOverviewRequest({ mediaDurationMs } = {}) {
        const mediaMs = Math.max(0, Number(mediaDurationMs) || 0);
        const mediaSec = mediaMs / 1000;
        let peaksPerSec = OVERVIEW_PEAKS_PER_SEC;
        if (mediaSec > 1) {
            const fit = Math.floor(OVERVIEW_MAX_PEAKS / mediaSec);
            peaksPerSec = Math.min(OVERVIEW_PEAKS_PER_SEC, Math.max(5, fit));
        }
        return {
            startSec: 0,
            durationSec: mediaSec > 1 ? mediaSec : 0,
            peaksPerSec,
            maxPeaks: OVERVIEW_MAX_PEAKS,
            cacheKey: `${Math.round(mediaMs)}|${peaksPerSec}`,
        };
    }

    /**
     * Store an overview extract. When the decoded span matches the media
     * duration, snap to the media span so the playhead and waveform share a clock.
     */
    function assignOverview(waveform, result, mediaDurationMs) {
        if (!waveform) return;
        const peaks = Array.isArray(result?.peaks) ? result.peaks : [];
        const extractedMs = Math.max(0, Number(result?.durationSec) || 0) * 1000;
        const mediaMs = Math.max(0, Number(mediaDurationMs) || 0);
        let durationMs = extractedMs || mediaMs || 1;
        if (!result?.truncated && mediaMs > 0 && extractedMs > 0) {
            const ratio = extractedMs / mediaMs;
            if (ratio > 0.985 && ratio < 1.015) durationMs = mediaMs;
        }
        waveform.peaks = peaks;
        waveform.durationSec = durationMs / 1000;
        waveform.startMs = Math.max(0, Math.round((Number(result?.startSec) || 0) * 1000));
        const peakMax = Number(result?.peakMax);
        waveform.normRef = Number.isFinite(peakMax) && peakMax > 1 ? peakMax : 0;
        waveform.truncated = !!result?.truncated;
        waveform.detail = null;
    }

    function buildDetailRequest({
        viewStartMs,
        viewEndMs,
        mediaDurationMs,
        widthPx,
    }) {
        const mediaMs = Math.max(1, Number(mediaDurationMs) || 1);
        const v0 = Math.max(0, Number(viewStartMs) || 0);
        const v1 = Math.min(mediaMs, Math.max(v0 + 1, Number(viewEndMs) || (v0 + 1)));
        const viewMs = Math.max(1, v1 - v0);
        const width = Math.max(8, Math.floor(Number(widthPx) || 8));
        const padMs = Math.max(viewMs * 0.75, 1500);
        let startMs = Math.max(0, v0 - padMs);
        let endMs = Math.min(mediaMs, v1 + padMs);
        startMs = Math.floor(startMs / DETAIL_GRID_MS) * DETAIL_GRID_MS;
        endMs = Math.min(mediaMs, Math.ceil(endMs / DETAIL_GRID_MS) * DETAIL_GRID_MS);
        if (endMs <= startMs) endMs = Math.min(mediaMs, startMs + Math.max(viewMs, DETAIL_GRID_MS));
        const durationSec = Math.max(0.05, (endMs - startMs) / 1000);
        const viewScale = (endMs - startMs) / viewMs;
        const targetPeaks = Math.ceil(width * viewScale * 1.25);
        const peaksPerSec = Math.min(
            DETAIL_MAX_PEAKS_PER_SEC,
            Math.max(DETAIL_MIN_PEAKS_PER_SEC, Math.ceil(targetPeaks / durationSec)),
        );
        const maxPeaks = Math.min(48000, Math.max(targetPeaks, Math.ceil(peaksPerSec * durationSec)));
        return {
            startSec: startMs / 1000,
            durationSec,
            peaksPerSec,
            maxPeaks,
            startMs,
            endMs,
            cacheKey: `${startMs}|${endMs}|${peaksPerSec}|${width}`,
        };
    }

    /**
     * Paint peaks into a canvas sized for the track CSS box.
     */
    function paintWaveformCanvas({
        canvas,
        peaks,
        peaksStartMs = 0,
        peaksDurationMs,
        viewStartMs,
        viewEndMs,
        cssWidth,
        cssHeight,
        devicePixelRatio,
        fillStyle = 'rgba(148, 163, 184, 0.9)',
    } = {}) {
        if (!canvas) return false;
        const ctx = canvas.getContext?.('2d');
        if (!ctx) return false;

        const a = Math.floor(Number(cssWidth) || 0);
        const o = Math.floor(Number(cssHeight) || 0);
        // A zero box happens during layout. Writing a 1px inline size sticks
        // and the next paints keep sampling a single column (a flat bar).
        if (a < 2 || o < 2) return false;
        if (canvas.style) {
            if (canvas.style.width) canvas.style.width = '';
            if (canvas.style.height) canvas.style.height = '';
        }
        const dpr = Math.max(1, Math.min(3, Number(devicePixelRatio) || 1));
        const bufW = Math.floor(a * dpr);
        const bufH = Math.floor(o * dpr);
        const sizeChanged = canvas.width !== bufW || canvas.height !== bufH;
        if (sizeChanged) {
            canvas.width = bufW;
            canvas.height = bufH;
        }
        // Always re-apply transform: assigning width/height resets it.
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, a, o);

        if (!Array.isArray(peaks) || !peaks.length) return true;

        const p0 = Math.max(0, Number(peaksStartMs) || 0);
        const pDur = Math.max(1, Number(peaksDurationMs) || 1);
        const v0 = Math.max(0, Number(viewStartMs) || 0);
        const v1 = Math.max(v0 + 1, Number(viewEndMs) || (v0 + 1));
        const viewDur = v1 - v0;

        // Peak indices covering the visible window (may be partial if detail window).
        const startRatio = (v0 - p0) / pDur;
        const endRatio = (v1 - p0) / pDur;
        const idx0 = startRatio * peaks.length;
        const idx1 = endRatio * peaks.length;
        const span = Math.max(1e-6, idx1 - idx0);
        const midY = o / 2;
        const amp = o * 0.45;

        ctx.fillStyle = fillStyle;
        for (let x = 0; x < a; x += 1) {
            const f0 = idx0 + (x / a) * span;
            const f1 = idx0 + ((x + 1) / a) * span;
            const W = peakMaxInRange(peaks, f0, f1);
            const h = Math.max(1, W * amp);
            ctx.fillRect(x, midY - h, 1, h * 2);
        }
        return true;
    }

    /**
     * Editor paint + debounced detail fetch. Session state stays on the shell.
     */
    function createWaveformView(deps) {
        let timer = 0;
        let gen = 0;
        let busy = false;
        let pending = false;

        function mediaDurationMs() {
            return Math.max(0, Number(deps.getMediaDurationMs?.()) || 0);
        }

        function viewBox() {
            const track = deps.getTrack?.();
            const rect = track?.getBoundingClientRect?.();
            return {
                width: Math.max(0, Math.floor(rect?.width || 0)),
                height: Math.max(0, Math.floor(rect?.height || 0)),
            };
        }

        function paint() {
            const canvas = deps.getCanvas?.();
            const wf = deps.getWaveform?.() || {};
            const tl = deps.getTimeline?.() || {};
            const box = viewBox();
            const durationMs = Math.max(
                1,
                (Number(wf.durationSec) > 0 ? Number(wf.durationSec) * 1000 : 0)
                    || mediaDurationMs()
                    || Number(tl.durationMs)
                    || 1,
            );
            const resolved = resolvePeaksForView({
                overview: {
                    peaks: wf.peaks,
                    startMs: Number(wf.startMs) || 0,
                    durationMs,
                },
                detail: wf.detail,
                viewStartMs: tl.viewStartMs,
                viewEndMs: tl.viewEndMs,
                mediaDurationMs: Math.max(1, mediaDurationMs() || Number(tl.durationMs) || durationMs),
            });
            paintWaveformCanvas({
                canvas,
                peaks: resolved?.peaks,
                peaksStartMs: resolved?.startMs || 0,
                peaksDurationMs: resolved?.durationMs || durationMs,
                viewStartMs: tl.viewStartMs,
                viewEndMs: tl.viewEndMs,
                cssWidth: box.width,
                cssHeight: box.height,
                devicePixelRatio: deps.getDpr?.() || 1,
            });
        }

        async function loadDetailOnce() {
            if (!deps.canExtract?.() || !deps.extract) return;
            const wf = deps.getWaveform?.();
            const tl = deps.getTimeline?.();
            if (!wf || !tl || !Array.isArray(wf.peaks) || wf.peaks.length < 8) return;
            const box = viewBox();
            const mediaMs = Math.max(1, mediaDurationMs() || Number(tl.durationMs) || 1);
            if (!shouldLoadDetailPeaks({
                peaksLength: wf.peaks.length,
                mediaDurationMs: mediaMs,
                viewStartMs: tl.viewStartMs,
                viewEndMs: tl.viewEndMs,
                widthPx: box.width,
                detail: wf.detail,
            })) return;
            const req = buildDetailRequest({
                viewStartMs: tl.viewStartMs,
                viewEndMs: tl.viewEndMs,
                mediaDurationMs: mediaMs,
                widthPx: box.width,
            });
            if (wf.detail?.cacheKey === req.cacheKey) return;
            const my = ++gen;
            const path = deps.getVideoPath?.() || '';
            const normRef = Number(wf.normRef) > 1 ? Number(wf.normRef) : 0;
            let res;
            try {
                res = await deps.extract({ ...req, normRef });
            } catch {
                return;
            }
            if (my !== gen || (deps.getVideoPath?.() || '') !== path) return;
            if (!res?.ok || !Array.isArray(res.peaks) || res.peaks.length < 8) return;
            const startMs = req.startMs;
            const requestedMs = Math.max(1, req.endMs - req.startMs);
            const decodedMs = Math.max(0, (Number(res.durationSec) || 0) * 1000);
            let durMs = decodedMs || requestedMs;
            if (!res.truncated && decodedMs > 0) {
                const ratio = decodedMs / requestedMs;
                if (ratio > 0.9 && ratio < 1.1) durMs = requestedMs;
            }
            wf.detail = {
                peaks: res.peaks,
                startMs,
                endMs: startMs + durMs,
                cacheKey: req.cacheKey,
            };
            if (!detailCoversView(wf.detail, tl.viewStartMs, tl.viewEndMs)) return;
            paint();
        }

        async function loadDetail() {
            if (busy) {
                pending = true;
                return;
            }
            busy = true;
            try {
                do {
                    pending = false;
                    await loadDetailOnce();
                } while (pending);
            } finally {
                busy = false;
            }
        }

        function syncDetail() {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                timer = 0;
                void loadDetail();
            }, 220);
        }

        function invalidateDetail() {
            gen += 1;
            pending = false;
            if (timer) {
                clearTimeout(timer);
                timer = 0;
            }
            const wf = deps.getWaveform?.();
            if (wf) wf.detail = null;
        }

        return {
            paint,
            syncDetail,
            invalidateDetail,
            mediaDurationMs,
        };
    }

    const api = {
        OVERVIEW_PEAKS_PER_SEC,
        OVERVIEW_MAX_PEAKS,
        DETAIL_MAX_PEAKS_PER_SEC,
        samplePeak,
        peakMaxInRange,
        resolvePeaksForView,
        detailCoversView,
        shouldLoadDetailPeaks,
        buildOverviewRequest,
        assignOverview,
        buildDetailRequest,
        paintWaveformCanvas,
        createWaveformView,
    };

    const parts = global.TransubEditorParts || {};
    parts.waveform = api;
    global.TransubEditorParts = parts;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global));
