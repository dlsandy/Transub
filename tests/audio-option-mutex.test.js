const assert = require('assert');
const {
    applyFilmEnhanceOn,
    applySensitiveOn,
    applyLightDenoiseOn,
    normalizeAudioOptionBundle,
} = require('../src/js/audio-option-mutex-core');

describe('audio-option-mutex-core', () => {
    it('applyFilmEnhanceOn clears sensitive, denoise, and filmVadPreset', () => {
        const out = applyFilmEnhanceOn({
            filmAudioEnhance: false,
            filmVadPreset: true,
            vadSensitive: true,
            audioLightDenoise: true,
            vadAggressive: true,
        });
        assert.strictEqual(out.filmAudioEnhance, true);
        assert.strictEqual(out.filmVadPreset, false);
        assert.strictEqual(out.vadSensitive, false);
        assert.strictEqual(out.audioLightDenoise, false);
    });

    it('applySensitiveOn clears enhance, filmVad, and denoise', () => {
        const out = applySensitiveOn({
            vadSensitive: false,
            filmAudioEnhance: true,
            filmVadPreset: true,
            audioLightDenoise: true,
            vadAggressive: true,
        });
        assert.strictEqual(out.vadSensitive, true);
        assert.strictEqual(out.filmAudioEnhance, false);
        assert.strictEqual(out.filmVadPreset, false);
        assert.strictEqual(out.audioLightDenoise, false);
        assert.strictEqual(out.vadAggressive, false);
    });

    it('applyLightDenoiseOn clears film enhance', () => {
        const out = applyLightDenoiseOn({
            audioLightDenoise: false,
            filmAudioEnhance: true,
        });
        assert.strictEqual(out.audioLightDenoise, true);
        assert.strictEqual(out.filmAudioEnhance, false);
    });

    it('normalize prefers film enhance over sensitive + denoise', () => {
        const out = normalizeAudioOptionBundle({
            filmAudioEnhance: true,
            vadSensitive: true,
            audioLightDenoise: true,
            filmVadPreset: true,
        });
        assert.strictEqual(out.filmAudioEnhance, true);
        assert.strictEqual(out.vadSensitive, false);
        assert.strictEqual(out.audioLightDenoise, false);
        assert.strictEqual(out.filmVadPreset, false);
    });

    it('normalize prefers sensitive when enhance is off', () => {
        const out = normalizeAudioOptionBundle({
            filmAudioEnhance: false,
            vadSensitive: true,
            audioLightDenoise: true,
            filmVadPreset: true,
            vadAggressive: true,
        });
        assert.strictEqual(out.vadSensitive, true);
        assert.strictEqual(out.audioLightDenoise, false);
        assert.strictEqual(out.filmVadPreset, false);
        assert.strictEqual(out.vadAggressive, false);
    });
});
