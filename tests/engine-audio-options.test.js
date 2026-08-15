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
        assert.strictEqual(resolveMaxSingleSegmentMs({ vadMaxSingleSegmentMs: 1000 }), 5000);
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
