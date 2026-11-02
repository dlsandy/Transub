/**
 * Scene-acoustic band planner (pure):
 * slide windows → hysteresis bands → VAD/denoise patches → relisten accept rules.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAcousticBand = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function acousticBandFactory() {
    const HINTS = Object.freeze(['music', 'soft', 'noisy', 'neutral']);
    const DEFAULT_WINDOW_SEC = 12;
    const DEFAULT_HOP_SEC = 40;
    const DEFAULT_MAX_WINDOWS = 18;
    const DEFAULT_MIN_BAND_SEC = 20;
    const DEFAULT_MAX_RELISTEN = 4;
    const DEFAULT_OVERLAP_SEC = 1.5;
    const SOFT_TEN_THRESHOLD = 0.35;
    const SOFT_FIRERED_THRESHOLD = 0.30;

    function normalizeAcousticBandAdaptOption(value) {
        if (value === false || value === 0) return 'off';
        const s = String(value == null ? 'auto' : value).trim().toLowerCase();
        if (s === 'false' || s === '0' || s === 'off' || s === 'no') return 'off';
        if (s === 'true' || s === '1' || s === 'on' || s === 'always') return 'on';
        if (s === 'auto') return 'auto';
        return 'auto';
    }

    function isSpeedPerfProfile(options = {}) {
        const v = String(options.perfProfile || '').trim().toLowerCase();
        return v === 'speed' || v === 'fast';
    }

    function shouldRunAcousticBandAdapt(options = {}) {
        const mode = normalizeAcousticBandAdaptOption(
            options.acousticBandAdapt ?? options.enabled,
        );
        if (mode === 'off') return false;
        if (isSpeedPerfProfile(options) && mode !== 'on') return false;
        if (options.skipAsr || options.shelfEntryStage) return false;
        return true;
    }

    function hintFromProbe(probe = {}) {
        if (!probe || typeof probe !== 'object') return 'neutral';
        if (probe.hint && HINTS.includes(String(probe.hint))) return String(probe.hint);
        if (probe.musicLikely) return 'music';
        if (probe.softSparse) return 'soft';
        if (probe.noisyFloor) return 'noisy';
        return 'neutral';
    }

    /**
     * Build sliding probe starts across a media duration.
     * @returns {Array<{ startSec: number, durationSec: number }>}
     */
    function planProbeWindows(input = {}) {
        const durationSec = Math.max(0, Number(input.durationSec) || 0);
        const windowSec = Math.max(4, Math.min(20, Number(input.windowSec) || DEFAULT_WINDOW_SEC));
        const hopSec = Math.max(windowSec, Number(input.hopSec) || DEFAULT_HOP_SEC);
        const maxWindows = Math.max(1, Math.min(40, Number(input.maxWindows) || DEFAULT_MAX_WINDOWS));
        let introSkip = Number(input.introSkipSec);
        if (!Number.isFinite(introSkip)) {
            if (durationSec <= 0) introSkip = 60;
            else if (durationSec < 60) introSkip = Math.min(durationSec * 0.35, Math.max(0, durationSec - windowSec));
            else introSkip = Math.min(180, Math.max(60, durationSec * 0.08));
        }
        introSkip = Math.max(0, introSkip);

        if (durationSec > 0 && durationSec < windowSec + 2) {
            return [{ startSec: 0, durationSec: Math.max(4, durationSec) }];
        }

        const maxStart = durationSec > 0
            ? Math.max(0, durationSec - windowSec - 0.25)
            : introSkip + hopSec * (maxWindows - 1);
        const start0 = Math.min(introSkip, maxStart);
        // Spread across the whole runtime when the film is long (fixed hop would stall in act 1).
        const span = Math.max(0, maxStart - start0);
        const adaptiveHop = span > 0 && maxWindows > 1
            ? Math.max(hopSec, span / (maxWindows - 1))
            : hopSec;
        const windows = [];
        let t = start0;
        for (let i = 0; i < maxWindows && t <= maxStart + 0.01; i += 1) {
            windows.push({
                startSec: Math.round(t * 10) / 10,
                durationSec: windowSec,
            });
            t += adaptiveHop;
        }
        if (!windows.length) {
            windows.push({ startSec: 0, durationSec: windowSec });
        }
        return windows;
    }

    /**
     * Merge consecutive same-hint windows with one-window hysteresis.
     * @param {Array<{ startSec: number, durationSec: number, hint?: string }>} windows
     */
    function mergeWindowsToBands(windows = [], opts = {}) {
        const minBandSec = Math.max(8, Number(opts.minBandSec) || DEFAULT_MIN_BAND_SEC);
        const list = (Array.isArray(windows) ? windows : [])
            .map((w) => ({
                startSec: Math.max(0, Number(w.startSec) || 0),
                durationSec: Math.max(1, Number(w.durationSec) || DEFAULT_WINDOW_SEC),
                hint: hintFromProbe(w),
            }))
            .filter((w) => HINTS.includes(w.hint))
            .sort((a, b) => a.startSec - b.startSec);
        if (!list.length) return [];

        const raw = [];
        let cur = {
            hint: list[0].hint,
            startSec: list[0].startSec,
            endSec: list[0].startSec + list[0].durationSec,
            windowCount: 1,
        };
        for (let i = 1; i < list.length; i += 1) {
            const w = list[i];
            const end = w.startSec + w.durationSec;
            if (w.hint === cur.hint) {
                cur.endSec = Math.max(cur.endSec, end);
                cur.windowCount += 1;
                continue;
            }
            // One-window hysteresis: single flip inside a longer run stays on previous hint
            // when neighbors agree (handled by not splitting until stable).
            const next = list[i + 1];
            if (next && next.hint === cur.hint && w.hint !== cur.hint) {
                cur.endSec = Math.max(cur.endSec, end);
                cur.windowCount += 1;
                continue;
            }
            raw.push(cur);
            cur = {
                hint: w.hint,
                startSec: w.startSec,
                endSec: end,
                windowCount: 1,
            };
        }
        raw.push(cur);

        return raw
            .map((b) => ({
                hint: b.hint,
                startSec: Math.round(b.startSec * 10) / 10,
                endSec: Math.round(b.endSec * 10) / 10,
                durationSec: Math.round((b.endSec - b.startSec) * 10) / 10,
                windowCount: b.windowCount,
            }))
            .filter((b) => b.durationSec >= minBandSec && b.hint !== 'neutral');
    }

    function isIslandVad(vadModel) {
        const id = String(vadModel || '').trim().toLowerCase();
        return id.includes('ten') || id.includes('firered');
    }

    /**
     * Map acoustic hint → option patch for range re-listen / whole-file nudge.
     */
    function resolveBandPatch(hint, baseOptions = {}) {
        const h = String(hint || 'neutral').toLowerCase();
        const out = {};
        const notes = [];
        const vadId = String(baseOptions.engineVadModel || '').trim().toLowerCase();
        const profile = String(
            baseOptions.contentProfile || baseOptions.senseProfile || '',
        ).trim().toLowerCase();

        if (h === 'soft') {
            out.audioLightDenoise = false;
            out.filmAudioEnhance = false;
            if (vadId.includes('ten')) {
                out.vadThreshold = SOFT_TEN_THRESHOLD;
                notes.push('软声带 → TEN 0.35');
            } else if (vadId.includes('firered')) {
                out.vadThreshold = SOFT_FIRERED_THRESHOLD;
                notes.push('软声带 → FireRed 0.30');
            } else if (profile === 'av_soft' || !vadId || vadId.includes('silero')) {
                // Prefer TEN soft recipe numbers when island VAD unavailable.
                out.vadThreshold = SOFT_TEN_THRESHOLD;
                out.vadMinSpeechDurationMs = 120;
                out.vadMinSilenceDurationMs = 280;
                out.vadSpeechPadMs = 120;
                out.vadMaxSingleSegmentMs = 4000;
                out.hallucinationSilenceThreshold = 0;
                notes.push('软声带 → 软对白 VAD 数字');
            }
            return { hint: h, overrides: out, notes };
        }

        if (h === 'music') {
            out.filmAudioEnhance = false;
            out.audioLightDenoise = true;
            const thr = Number(baseOptions.vadThreshold);
            out.vadThreshold = Number.isFinite(thr) ? Math.max(thr, 0.55) : 0.55;
            const minSpeech = Number(baseOptions.vadMinSpeechDurationMs);
            out.vadMinSpeechDurationMs = Number.isFinite(minSpeech)
                ? Math.max(minSpeech, 280)
                : 280;
            const minSil = Number(baseOptions.vadMinSilenceDurationMs);
            out.vadMinSilenceDurationMs = Number.isFinite(minSil)
                ? Math.max(minSil, 250)
                : 250;
            if (baseOptions.hallucinationSilenceThreshold == null
                || baseOptions.hallucinationSilenceThreshold === '') {
                out.hallucinationSilenceThreshold = 2;
            }
            notes.push('配乐带 → 收紧 VAD + 轻度降噪');
            return { hint: h, overrides: out, notes };
        }

        if (h === 'noisy') {
            out.audioLightDenoise = true;
            if (profile !== 'av_soft' && !isIslandVad(vadId)) {
                const thr = Number(baseOptions.vadThreshold);
                out.vadThreshold = Number.isFinite(thr) ? Math.max(thr, 0.52) : 0.52;
            }
            notes.push('底噪带 → 轻度降噪');
            return { hint: h, overrides: out, notes };
        }

        return { hint: 'neutral', overrides: out, notes };
    }

    /**
     * Pick bands that differ from the whole-file primary hint for range re-listen.
     */
    function selectRelistenBands(bands = [], input = {}) {
        const primaryHint = String(input.primaryHint || 'neutral').toLowerCase();
        const maxBands = Math.max(1, Math.min(8, Number(input.maxBands) || DEFAULT_MAX_RELISTEN));
        const overlapSec = Math.max(0, Number(input.overlapSec) || DEFAULT_OVERLAP_SEC);
        const list = (Array.isArray(bands) ? bands : [])
            .filter((b) => b && b.hint && b.hint !== 'neutral' && b.hint !== primaryHint)
            .map((b) => {
                const startSec = Math.max(0, Number(b.startSec) || 0);
                const endSec = Math.max(startSec + 1, Number(b.endSec) || startSec + (Number(b.durationSec) || 0));
                return {
                    ...b,
                    startSec: Math.max(0, startSec - overlapSec),
                    endSec: endSec + overlapSec,
                    durationSec: (endSec + overlapSec) - Math.max(0, startSec - overlapSec),
                };
            })
            // Prefer soft recall, then noisy, then music
            .sort((a, b) => {
                const rank = { soft: 0, noisy: 1, music: 2 };
                const ra = rank[a.hint] ?? 9;
                const rb = rank[b.hint] ?? 9;
                if (ra !== rb) return ra - rb;
                return (b.durationSec || 0) - (a.durationSec || 0);
            })
            .slice(0, maxBands);
        return list;
    }

    function cueTextLen(cues) {
        return (Array.isArray(cues) ? cues : [])
            .map((c) => String(c?.text || '').replace(/\s+/g, ''))
            .join('')
            .replace(/[.…。．・…]+/g, '');
    }

    function isPunctOnlyText(text) {
        const t = String(text || '').replace(/\s+/g, '');
        return !t || /^[.…。．・…!！?？~～\-—]+$/.test(t);
    }

    /**
     * Accept band re-listen when it recovers speech the primary pass missed.
     */
    function shouldAcceptBandRelisten(primarySlice, bandCues, hint) {
        const h = String(hint || '').toLowerCase();
        const primary = Array.isArray(primarySlice) ? primarySlice : [];
        const band = Array.isArray(bandCues) ? bandCues : [];
        const bandText = cueTextLen(band);
        if (!bandText || isPunctOnlyText(band.map((c) => c.text).join(''))) return false;
        const primaryText = cueTextLen(primary);
        if (!primaryText) return true;
        if (h === 'soft') {
            return band.length > primary.length
                || bandText.length >= Math.ceil(primaryText.length * 1.12);
        }
        if (h === 'music' || h === 'noisy') {
            const primaryPunct = primary.filter((c) => isPunctOnlyText(c.text)).length;
            const bandPunct = band.filter((c) => isPunctOnlyText(c.text)).length;
            if (bandPunct < primaryPunct && bandText.length >= primaryText.length * 0.75) {
                return true;
            }
            return bandText.length >= primaryText.length * 0.9
                && bandPunct <= primaryPunct + 1;
        }
        return bandText.length > primaryText.length;
    }

    function summarizeBands(bands = []) {
        const counts = { music: 0, soft: 0, noisy: 0, neutral: 0 };
        for (const b of bands) {
            const h = String(b?.hint || 'neutral');
            if (counts[h] != null) counts[h] += 1;
            else counts.neutral += 1;
        }
        return counts;
    }

    return {
        HINTS,
        SOFT_TEN_THRESHOLD,
        SOFT_FIRERED_THRESHOLD,
        DEFAULT_WINDOW_SEC,
        DEFAULT_HOP_SEC,
        DEFAULT_MAX_WINDOWS,
        DEFAULT_MIN_BAND_SEC,
        DEFAULT_MAX_RELISTEN,
        normalizeAcousticBandAdaptOption,
        shouldRunAcousticBandAdapt,
        hintFromProbe,
        planProbeWindows,
        mergeWindowsToBands,
        resolveBandPatch,
        selectRelistenBands,
        shouldAcceptBandRelisten,
        summarizeBands,
        isIslandVad,
    };
}));
