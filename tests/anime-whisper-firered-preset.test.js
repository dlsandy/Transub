/**
 * Built-in Anime Whisper + FireRed presets.
 */
'use strict';

const assert = require('assert');
const {
    BUILTIN_PRESETS,
    ANIME_FIRERED_VAD,
    ANIME_WHISPER_FIRERED_OPTIONS,
} = require('../electron/presets-data');

describe('anime-whisper firered presets', () => {
    it('registers soft + anime FireRed variants with tuned knobs', () => {
        const soft = BUILTIN_PRESETS.find((p) => p.id === 'ja-av-anime-whisper-firered');
        const anime = BUILTIN_PRESETS.find((p) => p.id === 'anime-whisper-firered');
        assert.ok(soft, 'soft preset missing');
        assert.ok(anime, 'anime preset missing');
        assert.strictEqual(soft.group, '软声');
        assert.strictEqual(anime.group, '动漫');
        for (const p of [soft, anime]) {
            assert.strictEqual(p.options.engineAsrModel, 'anime-whisper');
            assert.strictEqual(p.options.engineVadModel, 'firered-vad');
            assert.strictEqual(p.options.timingAlignModel, 'firered');
            assert.strictEqual(p.options.timingAlign, true);
            assert.strictEqual(p.options.vadThreshold, 0.45);
            assert.strictEqual(p.options.vadMaxSingleSegmentMs, 5000);
            assert.strictEqual(p.options.vadSpeechPadMs, 80);
            assert.strictEqual(p.options.vadMinSilenceDurationMs, 500);
            assert.strictEqual(p.options.vadMinSpeechDurationMs, 220);
            assert.strictEqual(p.options.beamSize, 1);
        }
        assert.strictEqual(ANIME_FIRERED_VAD.timingAlignModel, 'firered');
        assert.strictEqual(ANIME_WHISPER_FIRERED_OPTIONS.engineVadModel, 'firered-vad');
    });

    it('keeps TEN Anime Whisper as scene primary', () => {
        const tenSoft = BUILTIN_PRESETS.find((p) => p.id === 'ja-av-anime-whisper-translate');
        const tenAnime = BUILTIN_PRESETS.find((p) => p.id === 'anime-whisper-translate');
        assert.strictEqual(tenSoft.scenePrimary, true);
        assert.strictEqual(tenAnime.scenePrimary, true);
        assert.strictEqual(tenSoft.options.timingAlignModel, 'ten');
        const fr = BUILTIN_PRESETS.find((p) => p.id === 'ja-av-anime-whisper-firered');
        assert.ok(!fr.scenePrimary);
    });

    it('registers Qwen Galgame + TEN in 软声', () => {
        const p = BUILTIN_PRESETS.find((x) => x.id === 'ja-av-qwen3-galgame-ten');
        assert.ok(p, 'qwen galgame preset missing');
        assert.strictEqual(p.group, '软声');
        assert.ok(!p.scenePrimary);
        assert.strictEqual(p.options.engineAsrModel, 'qwen3-asr-1.7b-ja-anime-galgame');
        assert.strictEqual(p.options.timingAlignModel, 'ten');
        assert.strictEqual(p.options.timingAlign, true);
        assert.strictEqual(p.options.contentProfile, 'av_soft');
        assert.strictEqual(p.options.language, 'ja');
        assert.strictEqual(p.options.engineVadModel, 'silero-vad');
        assert.strictEqual(p.options.vadThreshold, 0.45);
        assert.strictEqual(p.options.vadMaxSingleSegmentMs, 5000);
        assert.strictEqual(p.options.vadSensitive, false);
        const tenSoft = BUILTIN_PRESETS.find((x) => x.id === 'ja-av-anime-whisper-translate');
        assert.strictEqual(tenSoft.scenePrimary, true);
    });
});
