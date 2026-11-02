const assert = require('assert');
const {
    buildVadJobOptions,
    buildAudioJobOptions,
    resolveMaxSingleSegmentMs,
} = require('../electron/engine-audio-options');

describe('engine-audio-options', () => {
    it('builds free medium VAD defaults', () => {
        const vad = buildVadJobOptions({});
        assert.strictEqual(vad.enabled, true);
        assert.strictEqual(vad.threshold, 0.5);
        assert.strictEqual(vad.aggressive, false);
        assert.strictEqual(vad.sensitive, false);
        assert.strictEqual(vad.filmPreset, false);
        assert.strictEqual(vad.model, 'fsmn-vad');
        assert.strictEqual(vad.maxSingleSegmentMs, undefined);
    });

    it('applies free aggressive preset when threshold left at default', () => {
        const vad = buildVadJobOptions({ vadAggressive: true, vadThreshold: 0.5 });
        assert.strictEqual(vad.aggressive, true);
        assert.strictEqual(vad.threshold, 0.6);
        assert.ok(vad.minSpeechMs >= 300);
        assert.strictEqual(vad.maxSingleSegmentMs, undefined);
    });

    it('applies sensitive preset and clears aggressive', () => {
        const vad = buildVadJobOptions({
            engineAsrModel: 'whisper-large-v3-turbo',
            vadSensitive: true,
            vadAggressive: true,
            vadThreshold: 0.5,
        });
        assert.strictEqual(vad.sensitive, true);
        assert.strictEqual(vad.aggressive, false);
        assert.strictEqual(vad.threshold, 0.18);
        assert.strictEqual(vad.minSpeechMs, 60);
        assert.strictEqual(vad.minSilenceMs, 140);
        assert.strictEqual(vad.speechPadMs, 350);
        assert.strictEqual(vad.model, 'whisperseg-asmr');
    });

    it('forces sensitive off under film enhance (no WhisperSeg + Demucs)', () => {
        const vad = buildVadJobOptions({
            engineAsrModel: 'whisper-large-v3-turbo',
            filmAudioEnhance: true,
            vadSensitive: true,
            vadThreshold: 0.5,
        });
        assert.strictEqual(vad.filmPreset, true);
        assert.strictEqual(vad.sensitive, false);
        assert.strictEqual(vad.aggressive, false);
        assert.notStrictEqual(vad.model, 'whisperseg-asmr');
    });

    it('forces denoise off when film enhance is entitled', () => {
        const audio = buildAudioJobOptions({
            filmAudioEnhance: true,
            audioLightDenoise: true,
        }, { entitled: true });
        assert.strictEqual(audio.separate, true);
        assert.strictEqual(audio.denoise, 'off');
        assert.strictEqual(audio.filmDemucsAutoSplitMinutes, 150);
        assert.strictEqual(audio.filmDemucsChunkMinutes, 60);
    });

    it('passes film Demucs chunk settings into audio job', () => {
        const audio = buildAudioJobOptions({
            filmAudioEnhance: true,
            filmDemucsAutoSplitMinutes: 180,
            filmDemucsChunkMinutes: 90,
        }, { entitled: true });
        assert.strictEqual(audio.filmDemucsAutoSplitMinutes, 180);
        assert.strictEqual(audio.filmDemucsChunkMinutes, 90);
    });

    it('keeps explicit threshold with aggressive', () => {
        const vad = buildVadJobOptions({ vadAggressive: true, vadThreshold: 0.55 });
        assert.strictEqual(vad.threshold, 0.55);
    });

    it('marks film preset with tightened VAD defaults', () => {
        const vad = buildVadJobOptions({
            filmAudioEnhance: true,
            vadAggressive: true,
            vadThreshold: 0.5,
        });
        assert.strictEqual(vad.filmPreset, true);
        assert.strictEqual(vad.aggressive, false);
        assert.strictEqual(vad.threshold, 0.55);
        assert.strictEqual(vad.minSpeechMs, 350);
        assert.strictEqual(vad.minSilenceMs, 280);
        assert.strictEqual(vad.hallucinationSilenceThreshold, 2);
    });

    it('honors explicit low threshold under film enhance', () => {
        const vad = buildVadJobOptions({
            filmAudioEnhance: true,
            vadThreshold: 0.4,
        });
        assert.strictEqual(vad.threshold, 0.4);
    });

    it('enhanceForVadOnly keeps soft-AV VAD (no filmPreset / hallu=2)', () => {
        const vad = buildVadJobOptions({
            filmAudioEnhance: true,
            enhanceForVadOnly: true,
            contentProfile: 'av_soft',
            vadThreshold: 0.32,
            vadMinSpeechDurationMs: 120,
            vadMinSilenceDurationMs: 350,
            vadSpeechPadMs: 120,
            hallucinationSilenceThreshold: 0,
            engineVadModel: 'silero-vad',
            engineAsrModel: 'qwen3-asr-1.7b-ja-anime-galgame',
            language: 'ja',
        });
        assert.strictEqual(vad.filmPreset, false);
        assert.strictEqual(vad.threshold, 0.32);
        assert.strictEqual(vad.minSpeechMs, 120);
        assert.strictEqual(vad.minSilenceMs, 350);
        assert.strictEqual(vad.speechPadMs, 120);
        assert.strictEqual(vad.hallucinationSilenceThreshold, 0);
        assert.strictEqual(vad.sensitive, false);
    });

    it('full Demucs→ASR still applies film VAD defaults', () => {
        const vad = buildVadJobOptions({
            filmAudioEnhance: true,
            enhanceForVadOnly: false,
            vadThreshold: 0.5,
        });
        assert.strictEqual(vad.filmPreset, true);
        assert.strictEqual(vad.threshold, 0.55);
        assert.strictEqual(vad.hallucinationSilenceThreshold, 2);
    });

    it('builds free denoise audio options', () => {
        const audio = buildAudioJobOptions({ audioLightDenoise: true });
        assert.strictEqual(audio.denoise, 'light');
        assert.strictEqual(audio.filmAudioEnhance, false);
        assert.strictEqual(audio.separate, false);
    });

    it('gates film audio enhance behind entitlement', () => {
        const blocked = buildAudioJobOptions({ filmAudioEnhance: true }, { entitled: false });
        assert.strictEqual(blocked.filmAudioEnhance, false);
        assert.strictEqual(blocked.separate, false);

        const ok = buildAudioJobOptions({ filmAudioEnhance: true }, { entitled: true });
        assert.strictEqual(ok.filmAudioEnhance, true);
        assert.strictEqual(ok.separate, true);
        assert.strictEqual(ok.filmPreset, true);
    });

    it('passes enhanceForVadOnly when film enhance is entitled', () => {
        const audio = buildAudioJobOptions({
            filmAudioEnhance: true,
            enhanceForVadOnly: true,
        }, { entitled: true });
        assert.strictEqual(audio.separate, true);
        assert.strictEqual(audio.enhanceForVadOnly, true);

        const off = buildAudioJobOptions({
            filmAudioEnhance: true,
            enhanceForVadOnly: false,
        }, { entitled: true });
        assert.strictEqual(off.enhanceForVadOnly, false);

        const blocked = buildAudioJobOptions({
            filmAudioEnhance: false,
            enhanceForVadOnly: true,
        }, { entitled: true });
        assert.strictEqual(blocked.enhanceForVadOnly, false);
        assert.strictEqual(blocked.separate, false);
    });

    it('gates enhanceForVadOnly behind entitlement with film enhance', () => {
        const blocked = buildAudioJobOptions({
            filmAudioEnhance: true,
            enhanceForVadOnly: true,
        }, { entitled: false });
        assert.strictEqual(blocked.filmAudioEnhance, false);
        assert.strictEqual(blocked.enhanceForVadOnly, false);
        assert.strictEqual(blocked.separate, false);
    });

    it('does not set diarize on audio options', () => {
        const off = buildAudioJobOptions({ neuralDiarize: true }, { entitled: true });
        assert.strictEqual(off.diarize, undefined);
        const on = buildAudioJobOptions({}, { entitled: true });
        assert.strictEqual(on.diarize, undefined);
    });

    it('supports film VAD preset without Demucs', () => {
        const audio = buildAudioJobOptions({ filmVadPreset: true }, { entitled: true });
        assert.strictEqual(audio.filmPreset, true);
        assert.strictEqual(audio.separate, false);
        assert.strictEqual(audio.filmAudioEnhance, false);

        const vad = buildVadJobOptions({ filmVadPreset: true, vadThreshold: 0.5 });
        assert.strictEqual(vad.filmPreset, true);
        assert.strictEqual(vad.minSpeechMs, 350);
        assert.strictEqual(vad.minSilenceMs, 280);
    });

    it('film enhance wins over filmVadPreset for audio.separate', () => {
        const audio = buildAudioJobOptions({
            filmAudioEnhance: true,
            filmVadPreset: true,
        }, { entitled: true });
        assert.strictEqual(audio.separate, true);
        assert.strictEqual(audio.filmAudioEnhance, true);
    });

    it('honors vadEnabled false', () => {
        const vad = buildVadJobOptions({ vadEnabled: false });
        assert.strictEqual(vad.enabled, false);
    });

    it('keeps VAD enabled by default even when smartSplitWithVad is false', () => {
        const vad = buildVadJobOptions({ smartSplitWithVad: false });
        assert.strictEqual(vad.enabled, true);
    });

    it('passes explicit vadMaxSingleSegmentMs', () => {
        const vad = buildVadJobOptions({ vadMaxSingleSegmentMs: 18000 });
        assert.strictEqual(vad.maxSingleSegmentMs, 18000);
    });

    it('clamps vadMaxSingleSegmentMs to engine range', () => {
        assert.strictEqual(resolveMaxSingleSegmentMs({ vadMaxSingleSegmentMs: 1000 }), 3000);
        assert.strictEqual(resolveMaxSingleSegmentMs({ vadMaxSingleSegmentMs: 90000 }), 60000);
    });

    it('migrates legacy targetChunkDurationS when max segment absent', () => {
        const vad = buildVadJobOptions({ targetChunkDurationS: 20 });
        assert.strictEqual(vad.maxSingleSegmentMs, 20000);
        assert.strictEqual(resolveMaxSingleSegmentMs({ targetChunkDurationS: 25 }), 25000);
    });

    it('omits free default max segment under aggressive so engine can use 20s', () => {
        const vad = buildVadJobOptions({
            vadAggressive: true,
            vadMaxSingleSegmentMs: 30000,
        });
        assert.strictEqual(vad.maxSingleSegmentMs, undefined);
    });

    it('keeps custom max segment under aggressive', () => {
        const vad = buildVadJobOptions({
            vadAggressive: true,
            vadMaxSingleSegmentMs: 12000,
        });
        assert.strictEqual(vad.maxSingleSegmentMs, 12000);
    });

    it('passes optional hallucinationSilenceThreshold when set', () => {
        const vad = buildVadJobOptions({ hallucinationSilenceThreshold: 1.5 });
        assert.strictEqual(vad.hallucinationSilenceThreshold, 1.5);
        const off = buildVadJobOptions({});
        assert.strictEqual(off.hallucinationSilenceThreshold, undefined);
    });

    it('JA Whisper translate defaults to WhisperSeg unless Silero/FSMN chosen', () => {
        const vad = buildVadJobOptions({
            language: 'ja',
            engineAsrModel: 'whisper-large-v3-turbo',
            task: 'translate',
            engineVadModel: 'fsmn-vad',
        });
        assert.strictEqual(vad.sensitive, true);
        assert.strictEqual(vad.model, 'whisperseg-asmr');
        assert.strictEqual(vad.threshold, 0.18);
        assert.strictEqual(vad.minSilenceMs, 140);
    });

    it('JA Whisper translate keeps explicit Silero when sensitive off', () => {
        const vad = buildVadJobOptions({
            language: 'ja',
            engineAsrModel: 'whisper-large-v3-turbo',
            task: 'translate',
            engineVadModel: 'silero-vad',
            vadSensitive: false,
        });
        assert.strictEqual(vad.sensitive, false);
        assert.strictEqual(vad.model, 'silero-vad');
    });

    it('JA Whisper translate keeps explicit FireRed when sensitive off', () => {
        const vad = buildVadJobOptions({
            language: 'ja',
            engineAsrModel: 'anime-whisper',
            task: 'translate',
            engineVadModel: 'firered-vad',
            vadSensitive: false,
            vadThreshold: 0.45,
            vadMaxSingleSegmentMs: 5000,
            vadSpeechPadMs: 80,
            vadMinSilenceDurationMs: 500,
            vadMinSpeechDurationMs: 220,
        });
        assert.strictEqual(vad.sensitive, false);
        assert.strictEqual(vad.model, 'firered-vad');
        assert.strictEqual(vad.threshold, 0.45);
        assert.strictEqual(vad.maxSingleSegmentMs, 5000);
        assert.strictEqual(vad.speechPadMs, 80);
        assert.strictEqual(vad.minSilenceMs, 500);
        assert.strictEqual(vad.minSpeechMs, 220);
    });

    it('legacy silero alias normalizes to silero-vad for Whisper', () => {
        const vad = buildVadJobOptions({
            language: 'ja',
            engineAsrModel: 'anime-whisper',
            task: 'translate',
            engineVadModel: 'silero',
            vadSensitive: false,
        });
        assert.strictEqual(vad.sensitive, false);
        assert.strictEqual(vad.model, 'silero-vad');
    });

    it('SenseVoice never sends whisperseg even when sensitive is checked', () => {
        const vad = buildVadJobOptions({
            engineAsrModel: 'sensevoice-small',
            engineVadModel: 'whisperseg-asmr',
            vadSensitive: true,
            vadThreshold: 0.5,
        });
        assert.strictEqual(vad.sensitive, false);
        assert.strictEqual(vad.model, 'fsmn-vad');
        assert.strictEqual(vad.threshold, 0.5);
    });

    it('Qwen keeps FireRed VAD (not remapped to fsmn)', () => {
        const vad = buildVadJobOptions({
            language: 'yue',
            engineAsrModel: 'qwen3-asr-1.7b',
            engineVadModel: 'firered-vad',
            vadThreshold: 0.45,
            vadMinSpeechDurationMs: 250,
            vadMinSilenceDurationMs: 350,
            vadSpeechPadMs: 160,
            vadMaxSingleSegmentMs: 7500,
            timingAlignModel: 'qwen3-forced-aligner-0.6b',
            singingKaraoke: true,
        });
        assert.strictEqual(vad.model, 'firered-vad');
        assert.strictEqual(vad.threshold, 0.45);
        assert.strictEqual(vad.minSpeechMs, 250);
        assert.strictEqual(vad.minSilenceMs, 350);
        assert.strictEqual(vad.speechPadMs, 160);
        assert.strictEqual(vad.maxSingleSegmentMs, 7500);
    });

    it('Qwen keeps TEN VAD (not remapped to fsmn)', () => {
        const vad = buildVadJobOptions({
            language: 'ja',
            engineAsrModel: 'qwen3-asr-1.7b-ja-anime-galgame',
            engineVadModel: 'ten-vad',
            vadThreshold: 0.30,
        });
        assert.strictEqual(vad.model, 'ten-vad');
    });

    it('SenseVoice remaps TEN VAD to fsmn-vad', () => {
        const vad = buildVadJobOptions({
            engineAsrModel: 'sensevoice-small',
            engineVadModel: 'ten-vad',
            vadSensitive: false,
        });
        assert.strictEqual(vad.model, 'fsmn-vad');
        assert.strictEqual(vad.sensitive, false);
    });

    it('SenseVoice remaps Silero VAD to fsmn-vad', () => {
        const vad = buildVadJobOptions({
            engineAsrModel: 'sensevoice-small',
            engineVadModel: 'silero-vad',
            vadSensitive: false,
        });
        assert.strictEqual(vad.model, 'fsmn-vad');
        assert.strictEqual(vad.sensitive, false);
    });
});
