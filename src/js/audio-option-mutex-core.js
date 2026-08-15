/**
 * Bidirectional mutex for film enhance / sensitive VAD / light denoise.
 * Pure helpers for settings UI, persist, and job payload normalization.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAudioOptionMutex = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function audioOptionMutexFactory() {
    function copyOpts(opts = {}) {
        return opts && typeof opts === 'object' ? { ...opts } : {};
    }

    /**
     * User turned on film audio enhance (Demucs + film VAD).
     * Clears sensitive WhisperSeg, light denoise, and film-VAD-only.
     */
    function applyFilmEnhanceOn(opts = {}) {
        const out = copyOpts(opts);
        out.filmAudioEnhance = true;
        out.filmVadPreset = false;
        out.vadSensitive = false;
        out.audioLightDenoise = false;
        return out;
    }

    /**
     * User turned on sensitive VAD (WhisperSeg).
     * Clears film enhance / film-VAD-only / light denoise.
     */
    function applySensitiveOn(opts = {}) {
        const out = copyOpts(opts);
        out.vadSensitive = true;
        out.filmAudioEnhance = false;
        out.filmVadPreset = false;
        out.audioLightDenoise = false;
        out.vadAggressive = false;
        return out;
    }

    /**
     * User turned on light denoise. Incompatible with Demucs enhance.
     */
    function applyLightDenoiseOn(opts = {}) {
        const out = copyOpts(opts);
        out.audioLightDenoise = true;
        out.filmAudioEnhance = false;
        return out;
    }

    /**
     * Persist / batch start: resolve conflicting flags.
     * Priority: filmAudioEnhance > vadSensitive > others.
     */
    function normalizeAudioOptionBundle(opts = {}) {
        const out = copyOpts(opts);
        if (out.filmAudioEnhance) {
            out.filmVadPreset = false;
            out.vadSensitive = false;
            out.audioLightDenoise = false;
            return out;
        }
        if (out.vadSensitive) {
            out.filmAudioEnhance = false;
            out.filmVadPreset = false;
            out.audioLightDenoise = false;
            out.vadAggressive = false;
            return out;
        }
        if (out.filmVadPreset) {
            out.filmAudioEnhance = false;
        }
        return out;
    }

    return {
        applyFilmEnhanceOn,
        applySensitiveOn,
        applyLightDenoiseOn,
        normalizeAudioOptionBundle,
    };
}));
