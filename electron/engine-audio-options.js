/**
 * Build Engine job `vad` / `audio` payloads from saved Transub options.
 * Free: VAD knobs + light denoise + aggressive / sensitive slice.
 * Advanced: filmAudioEnhance (vocal sep + film VAD) — gated by caller.
 */

function numOr(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function isFreeDefault(value, freeDefault) {
    return value == null || value === '' || Number(value) === freeDefault;
}

function normalizeVadModelId(value, fallback = 'fsmn-vad') {
    try {
        return require('./engine-options').normalizeVadModelId(value, fallback);
    } catch {
        const raw = String(value || '').trim();
        if (!raw) return fallback;
        const lower = raw.toLowerCase();
        if (lower === 'silero' || lower === 'silero_vad') return 'silero-vad';
        return raw;
    }
}

/**
 * Resolve max single segment ms for the Engine vad payload.
 * Prefer explicit vadMaxSingleSegmentMs; fall back to legacy targetChunkDurationS * 1000.
 * Returns null when neither is set so the Engine can apply aggressive/film defaults.
 * @param {object} merged
 * @returns {number|null}
 */
function resolveMaxSingleSegmentMs(merged = {}) {
    if (merged.vadMaxSingleSegmentMs != null && merged.vadMaxSingleSegmentMs !== '') {
        const n = Number(merged.vadMaxSingleSegmentMs);
        if (Number.isFinite(n)) {
            return Math.max(5000, Math.min(60000, Math.round(n)));
        }
    }
    if (merged.targetChunkDurationS != null && merged.targetChunkDurationS !== '') {
        const sec = Number(merged.targetChunkDurationS);
        if (Number.isFinite(sec) && sec > 0) {
            return Math.max(5000, Math.min(60000, Math.round(sec * 1000)));
        }
    }
    return null;
}

/**
 * @param {object} merged saved options
 * @returns {{ model: string, enabled: boolean, threshold: number, minSpeechMs: number, minSilenceMs: number, speechPadMs: number, aggressive: boolean, sensitive: boolean, filmPreset: boolean, maxSingleSegmentMs?: number, hallucinationSilenceThreshold?: number }}
 */
function buildVadJobOptions(merged = {}) {
    const lang = String(merged.language || '').trim().toLowerCase();
    const asr = String(merged.engineAsrModel || '').trim().toLowerCase();
    const task = String(merged.task || '').trim().toLowerCase();
    const isJa = lang.startsWith('ja') || lang === 'japanese' || lang === 'jp';
    const isWhisper = asr.includes('whisper');
    const vadModelRaw = normalizeVadModelId(merged.engineVadModel, '').toLowerCase();
    // Silero / FireRed are deliberate WhisperSeg opt-outs (island timing / Silero filter).
    // fsmn-vad is the SenseVoice default and should not block JA Whisper translate
    // from using WhisperSeg.
    const explicitNonSeg = (
        vadModelRaw === 'silero-vad'
        || vadModelRaw === 'firered-vad'
        || vadModelRaw.includes('firered')
    ) && !merged.vadSensitive;

    // filmAudioEnhance (Demucs) or filmVadPreset (VAD numbers only) both apply film defaults.
    // Demucs must not stack with WhisperSeg (sensitive).
    const filmEnhance = !!merged.filmAudioEnhance;
    const film = filmEnhance || !!merged.filmVadPreset;

    // JA Whisper translate/dual: default WhisperSeg (sensitive) unless user picked Silero/FSMN.
    let sensitive = !!merged.vadSensitive;
    if (
        isJa
        && isWhisper
        && (task === 'translate' || task === 'dual' || vadModelRaw === 'whisperseg-asmr')
        && !explicitNonSeg
        && !filmEnhance
    ) {
        sensitive = true;
    }
    // WhisperSeg is Whisper-only; SenseVoice must stay on fsmn-vad.
    if (!isWhisper) {
        sensitive = false;
    }
    if (filmEnhance) {
        sensitive = false;
    }

    const aggressive = !!merged.vadAggressive && !sensitive;
    let threshold = numOr(merged.vadThreshold, 0.5);
    let minSpeechMs = numOr(merged.vadMinSpeechDurationMs, 300);
    let minSilenceMs = numOr(merged.vadMinSilenceDurationMs, 100);
    let speechPadMs = numOr(merged.vadSpeechPadMs, 200);

    // Apply preset defaults only when UI still holds free medium defaults.
    // Never hard-floor explicit lower values (soft dialogue / moans).
    if (film) {
        // Explicit film overrides from settings → Pro → 影视音频增强
        if (merged.filmVadThreshold != null && merged.filmVadThreshold !== '') {
            const t = Number(merged.filmVadThreshold);
            if (Number.isFinite(t)) threshold = Math.max(0.05, Math.min(0.95, t));
        } else if (isFreeDefault(merged.vadThreshold, 0.5)) {
            threshold = 0.55;
        }
        if (merged.filmVadMinSpeechDurationMs != null && merged.filmVadMinSpeechDurationMs !== '') {
            const ms = Number(merged.filmVadMinSpeechDurationMs);
            if (Number.isFinite(ms)) minSpeechMs = Math.max(50, Math.min(2000, Math.round(ms)));
        } else if (isFreeDefault(merged.vadMinSpeechDurationMs, 300)) {
            minSpeechMs = 350;
        }
        if (merged.filmVadMinSilenceDurationMs != null && merged.filmVadMinSilenceDurationMs !== '') {
            const ms = Number(merged.filmVadMinSilenceDurationMs);
            if (Number.isFinite(ms)) minSilenceMs = Math.max(50, Math.min(2000, Math.round(ms)));
        } else if (isFreeDefault(merged.vadMinSilenceDurationMs, 100)) {
            minSilenceMs = 280;
        }
        if (isFreeDefault(merged.vadSpeechPadMs, 200)) speechPadMs = 200;
    } else if (sensitive) {
        // Match Engine WhisperSeg PRESETS["sensitive"] (JA AV soft-scene recall).
        if (isFreeDefault(merged.vadThreshold, 0.5)) threshold = 0.18;
        if (isFreeDefault(merged.vadMinSpeechDurationMs, 300)) minSpeechMs = 60;
        // Longer silence before ending an island — fewer micro-cuts on soft dialogue.
        if (isFreeDefault(merged.vadMinSilenceDurationMs, 100)) minSilenceMs = 140;
        if (isFreeDefault(merged.vadSpeechPadMs, 200)) speechPadMs = 350;
    } else if (aggressive) {
        if (isFreeDefault(merged.vadThreshold, 0.5)) threshold = 0.6;
        if (isFreeDefault(merged.vadMinSpeechDurationMs, 300)) minSpeechMs = 350;
        if (isFreeDefault(merged.vadMinSilenceDurationMs, 100)) minSilenceMs = 150;
        if (isFreeDefault(merged.vadSpeechPadMs, 200)) speechPadMs = 180;
    }

    let vadModel = normalizeVadModelId(merged.engineVadModel, 'fsmn-vad');
    // Sensitive Whisper path → WhisperSeg ASMR.
    if (sensitive) {
        vadModel = 'whisperseg-asmr';
    } else if (!isWhisper) {
        // FunASR only loads fsmn-vad. Silero is faster-whisper built-in; WhisperSeg is ONNX.
        const vadL = vadModel.toLowerCase();
        if (
            vadL === 'whisperseg-asmr'
            || vadL.includes('whisperseg')
            || vadL === 'silero-vad'
            || vadL.includes('firered')
        ) {
            vadModel = 'fsmn-vad';
        }
    }

    const out = {
        model: vadModel,
        enabled: merged.vadEnabled !== false,
        threshold,
        minSpeechMs,
        minSilenceMs,
        speechPadMs,
        sensitive: sensitive,
        aggressive: aggressive && !film && !sensitive,
        filmPreset: film,
    };

    const maxSingle = resolveMaxSingleSegmentMs(merged);
    // Omit free default (30s) under aggressive/film so Engine can apply 20s / 15s.
    // Sensitive keeps 30s engine default — omit when still at free default.
    if (maxSingle != null && !((aggressive || film) && maxSingle === 30000)) {
        out.maxSingleSegmentMs = maxSingle;
    }

    const halluRaw = merged.hallucinationSilenceThreshold;
    if (halluRaw != null && halluRaw !== '') {
        const hallu = Number(halluRaw);
        if (Number.isFinite(hallu) && hallu > 0) {
            out.hallucinationSilenceThreshold = Math.max(0.1, Math.min(30, hallu));
        }
    } else if (film) {
        const filmHallu = merged.filmHallucinationSilenceThreshold;
        if (filmHallu === 0 || filmHallu === '0') {
            // explicit off
        } else if (filmHallu != null && filmHallu !== '') {
            const n = Number(filmHallu);
            if (Number.isFinite(n) && n > 0) {
                out.hallucinationSilenceThreshold = Math.max(0.1, Math.min(30, n));
            } else {
                out.hallucinationSilenceThreshold = 2;
            }
        } else {
            // Default film silence skip — music beds invent "." / filler cues.
            out.hallucinationSilenceThreshold = 2;
        }
    }

    return out;
}

/**
 * @param {object} merged
 * @param {{ entitled?: boolean }} [gate]
 * @returns {{ denoise: string, separate: boolean, filmAudioEnhance: boolean, filmPreset: boolean }}
 */
function buildAudioJobOptions(merged = {}, gate = {}) {
    const entitled = gate.entitled !== false;
    const filmEnhance = !!merged.filmAudioEnhance && entitled;
    // Demucs path: never stack light denoise (desktop mutex + job fallback).
    const denoise = filmEnhance ? 'off' : (merged.audioLightDenoise ? 'light' : 'off');
    // Advanced: film VAD numbers without Demucs (honored when enhance is off)
    const filmVadOnly = !!merged.filmVadPreset && entitled && !filmEnhance;
    return {
        denoise,
        separate: filmEnhance,
        filmAudioEnhance: filmEnhance,
        filmPreset: filmEnhance || filmVadOnly,
    };
}

module.exports = {
    buildVadJobOptions,
    buildAudioJobOptions,
    resolveMaxSingleSegmentMs,
};
