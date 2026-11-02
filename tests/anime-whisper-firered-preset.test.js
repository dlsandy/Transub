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
        assert.strictEqual(soft.options.vadThreshold, 0.30);
        assert.strictEqual(soft.options.vadMaxSingleSegmentMs, 4000);
        assert.strictEqual(soft.options.vadSpeechPadMs, 120);
        assert.strictEqual(soft.options.vadMinSilenceDurationMs, 280);
        assert.strictEqual(soft.options.vadMinSpeechDurationMs, 120);
        assert.strictEqual(soft.options.filmAudioEnhance, undefined);
        assert.strictEqual(soft.options.enhanceForVadOnly, undefined);
        assert.strictEqual(soft.options.beamSize, 1);
        assert.strictEqual(ANIME_FIRERED_VAD.timingAlignModel, 'firered');
        assert.strictEqual(ANIME_WHISPER_FIRERED_OPTIONS.engineVadModel, 'firered-vad');
    });

    it('registers Qwen Galgame + TEN islands in ja', () => {
        const p = BUILTIN_PRESETS.find((x) => x.id === 'ja-av-qwen3-galgame-ten');
        assert.ok(p, 'qwen galgame preset missing');
        assert.strictEqual(p.group, 'ja');
        assert.strictEqual(p.options.engineAsrModel, 'qwen3-asr-1.7b-ja-anime-galgame');
        assert.strictEqual(p.options.timingAlignModel, 'ten');
        assert.strictEqual(p.options.timingAlign, true);
        assert.strictEqual(p.options.contentProfile, 'av_soft');
        assert.strictEqual(p.options.language, 'ja');
        assert.strictEqual(p.options.engineVadModel, 'ten-vad');
        assert.strictEqual(p.options.vadThreshold, 0.35);
        assert.strictEqual(p.options.vadMaxSingleSegmentMs, 4000);
        assert.strictEqual(p.options.vadMinSpeechDurationMs, 120);
        assert.strictEqual(p.options.vadSpeechPadMs, 120);
        assert.strictEqual(p.options.vadSensitive, false);
        assert.strictEqual(p.options.asrSecondOpinion, 'auto');
        assert.strictEqual(p.options.filmAudioEnhance, undefined);
        assert.strictEqual(p.options.enhanceForVadOnly, undefined);
        assert.ok(String(p.description || '').includes('TEN'));
    });

    it('registers Qwen Galgame TEN + ForcedAligner in ja', () => {
        const {
            QWEN_GALGAME_FIRERED_ALIGN_OPTIONS,
        } = require('../electron/presets-data');
        const p = BUILTIN_PRESETS.find((x) => x.id === 'ja-av-qwen3-galgame-firered-align');
        assert.ok(p, 'qwen galgame firered-align preset missing');
        assert.strictEqual(p.group, 'ja');
        assert.strictEqual(p.options.engineAsrModel, 'qwen3-asr-1.7b-ja-anime-galgame');
        // ForcedAligner preset shares FireRed islands with the main Galgame preset.
        assert.strictEqual(p.options.engineVadModel, 'firered-vad');
        assert.strictEqual(p.options.timingAlignModel, 'qwen3-forced-aligner-0.6b');
        assert.strictEqual(p.options.timingAlign, true);
        assert.strictEqual(p.options.contentProfile, 'av_soft');
        assert.strictEqual(p.options.language, 'ja');
        assert.strictEqual(p.options.vadThreshold, 0.30);
        assert.strictEqual(p.options.vadMaxSingleSegmentMs, 4000);
        assert.strictEqual(p.options.vadMinSpeechDurationMs, 120);
        assert.strictEqual(p.options.vadSpeechPadMs, 120);
        assert.strictEqual(p.options.asrSecondOpinion, 'auto');
        assert.strictEqual(p.options.filmAudioEnhance, undefined);
        assert.strictEqual(p.options.enhanceForVadOnly, undefined);
        assert.strictEqual(
            QWEN_GALGAME_FIRERED_ALIGN_OPTIONS.timingAlignModel,
            'qwen3-forced-aligner-0.6b',
        );
        assert.strictEqual(QWEN_GALGAME_FIRERED_ALIGN_OPTIONS.engineVadModel, 'firered-vad');
        assert.ok(String(p.description || '').includes('FireRed'));
    });

    it('registers Whisper JA soft-translate with FireRed islands', () => {
        const p = BUILTIN_PRESETS.find((x) => x.id === 'ja-av-soft-translate');
        assert.ok(p, 'soft-translate preset missing');
        assert.strictEqual(p.group, 'ja');
        assert.strictEqual(p.options.engineAsrModel, 'whisper-ja-1.5b');
        assert.strictEqual(p.options.engineVadModel, 'firered-vad');
        assert.strictEqual(p.options.timingAlignModel, 'firered');
        assert.strictEqual(p.options.timingAlign, true);
        assert.strictEqual(p.options.vadThreshold, 0.30);
        assert.strictEqual(p.options.vadSpeechPadMs, 120);
        assert.strictEqual(p.options.vadMaxSingleSegmentMs, 4000);
        assert.strictEqual(p.options.beamSize, 5);
        assert.ok(String(p.description || '').includes('FireRed'));
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

    it('registers Cantonese Qwen3-ASR preset under 华语片', () => {
        const p = BUILTIN_PRESETS.find((x) => x.id === 'zh-yue-qwen3');
        assert.ok(p);
        assert.strictEqual(p.group, 'zh');
        assert.strictEqual(p.options.language, 'yue');
        assert.strictEqual(p.options.engineAsrModel, 'qwen3-asr-1.7b');
        assert.strictEqual(p.options.contentProfile, 'film');
        assert.strictEqual(p.options.engineVadModel, 'firered-vad');
        assert.strictEqual(p.options.timingAlign, true);
        assert.strictEqual(p.options.timingAlignModel, 'qwen3-forced-aligner-0.6b');
        assert.strictEqual(p.options.audioLightDenoise, true);
        assert.ok(String(p.name || '').includes('粤语'));
    });

    it('registers Cantonese song Qwen3-ASR preset under 华语片', () => {
        const p = BUILTIN_PRESETS.find((x) => x.id === 'zh-yue-qwen3-song');
        assert.ok(p);
        assert.strictEqual(p.group, 'zh');
        assert.strictEqual(p.options.language, 'yue');
        assert.strictEqual(p.options.engineAsrModel, 'qwen3-asr-1.7b');
        assert.strictEqual(p.options.engineVadModel, 'firered-vad');
        // Songs use ForcedAligner + singing merge/stretch (wider gap_break).
        assert.strictEqual(p.options.timingAlignModel, 'qwen3-forced-aligner-0.6b');
        assert.strictEqual(p.options.engineVadModel, 'firered-vad');
        assert.strictEqual(p.options.singingKaraoke, true);
        assert.strictEqual(p.options.vadThreshold, 0.45);
        assert.strictEqual(p.options.audioLightDenoise, false);
        assert.strictEqual(p.options.filmAudioEnhance, undefined);
        assert.ok(String(p.name || '').includes('歌曲'));
        assert.ok(
            String(p.description || '').includes('ForcedAligner')
            || String(p.description || '').includes('卡拉OK'),
        );
    });
});
