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
    it('registers ja FireRed preset with tuned knobs', () => {
        const soft = BUILTIN_PRESETS.find((p) => p.id === 'ja-av-anime-whisper-firered');
        assert.ok(soft, 'ja FireRed preset missing');
        assert.strictEqual(soft.group, 'ja');
        assert.ok(!BUILTIN_PRESETS.some((p) => p.id === 'anime-whisper-firered'));
        assert.ok(!BUILTIN_PRESETS.some((p) => p.id === 'anime-kotoba'));
        assert.ok(!BUILTIN_PRESETS.some((p) => p.id === 'anime-ja15'));
        assert.ok(!BUILTIN_PRESETS.some((p) => p.id === 'anime-turbo'));
        assert.strictEqual(soft.options.engineAsrModel, 'anime-whisper');
        assert.strictEqual(soft.options.engineVadModel, 'firered-vad');
        assert.strictEqual(soft.options.timingAlignModel, 'firered');
        assert.strictEqual(soft.options.timingAlign, true);
        assert.strictEqual(soft.options.vadThreshold, 0.45);
        assert.strictEqual(soft.options.vadMaxSingleSegmentMs, 5000);
        assert.strictEqual(soft.options.vadSpeechPadMs, 80);
        assert.strictEqual(soft.options.vadMinSilenceDurationMs, 500);
        assert.strictEqual(soft.options.vadMinSpeechDurationMs, 220);
        assert.strictEqual(soft.options.beamSize, 1);
        assert.strictEqual(ANIME_FIRERED_VAD.timingAlignModel, 'firered');
        assert.strictEqual(ANIME_WHISPER_FIRERED_OPTIONS.engineVadModel, 'firered-vad');
    });

    it('registers Qwen Galgame + TEN in ja', () => {
        const p = BUILTIN_PRESETS.find((x) => x.id === 'ja-av-qwen3-galgame-ten');
        assert.ok(p, 'qwen galgame preset missing');
        assert.strictEqual(p.group, 'ja');
        assert.strictEqual(p.options.engineAsrModel, 'qwen3-asr-1.7b-ja-anime-galgame');
        assert.strictEqual(p.options.timingAlignModel, 'ten');
        assert.strictEqual(p.options.timingAlign, true);
        assert.strictEqual(p.options.contentProfile, 'av_soft');
        assert.strictEqual(p.options.language, 'ja');
        assert.strictEqual(p.options.engineVadModel, 'silero-vad');
        assert.strictEqual(p.options.vadThreshold, 0.45);
        assert.strictEqual(p.options.vadMaxSingleSegmentMs, 5000);
        assert.strictEqual(p.options.vadSensitive, false);
    });

    it('registers regional drama groups', () => {
        const ko = BUILTIN_PRESETS.find((p) => p.id === 'ko-sensevoice');
        const zh = BUILTIN_PRESETS.find((p) => p.id === 'zh-sensevoice');
        const west = BUILTIN_PRESETS.find((p) => p.id === 'film-audio-enhance');
        assert.strictEqual(ko.group, 'ko');
        assert.strictEqual(ko.options.language, 'ko');
        assert.strictEqual(zh.group, 'zh');
        assert.strictEqual(zh.options.language, 'zh');
        assert.strictEqual(west.group, 'western');
        assert.strictEqual(west.options.language, 'en');
    });
});
