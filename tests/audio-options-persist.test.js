const assert = require('assert');
const { buildTransWithAiOptionsFromPayload } = require('../electron/transwithai-bridge');
const { mergeTransWithAiOptions } = require('../electron/transwithai-options');

describe('film audio / free audio options persistence', () => {
    it('mergeTransWithAiOptions keeps film/audio flags from input', () => {
        const merged = mergeTransWithAiOptions({
            filmAudioEnhance: true,
            vadAggressive: true,
            audioLightDenoise: true,
            smartTranslate: true,
        });
        assert.strictEqual(merged.filmAudioEnhance, true);
        assert.strictEqual(merged.vadAggressive, true);
        assert.strictEqual(merged.audioLightDenoise, true);
        assert.strictEqual(merged.smartTranslate, true);
    });

    it('normalize/save path preserves filmAudioEnhance and free audio toggles', () => {
        const normalized = buildTransWithAiOptionsFromPayload({
            filmAudioEnhance: true,
            vadAggressive: true,
            audioLightDenoise: true,
            smartTranslate: true,
            smartTranslateFaithfulTone: true,
            task: 'translate',
        }, {});
        assert.strictEqual(normalized.filmAudioEnhance, true);
        assert.strictEqual(normalized.vadAggressive, true);
        assert.strictEqual(normalized.audioLightDenoise, true);
        assert.strictEqual(normalized.smartTranslate, true);
        assert.strictEqual(normalized.smartTranslateFaithfulTone, true);
    });

    it('keeps faithful tone for all translate modes even when smart translate is off', () => {
        const normalized = buildTransWithAiOptionsFromPayload({
            smartTranslate: false,
            smartTranslateFaithfulTone: true,
            task: 'translate',
        }, {});
        assert.strictEqual(normalized.smartTranslateFaithfulTone, true);
    });

    it('clears faithful tone for transcribe-only task', () => {
        const normalized = buildTransWithAiOptionsFromPayload({
            smartTranslate: false,
            smartTranslateFaithfulTone: true,
            task: 'transcribe',
        }, {});
        assert.strictEqual(normalized.smartTranslateFaithfulTone, false);
    });

    it('defaults vadEnabled and migrates targetChunkDurationS to vadMaxSingleSegmentMs', () => {
        const merged = mergeTransWithAiOptions({ targetChunkDurationS: 20 });
        assert.strictEqual(merged.vadEnabled, true);
        assert.strictEqual(merged.vadMaxSingleSegmentMs, 20000);

        const normalized = buildTransWithAiOptionsFromPayload({
            vadEnabled: false,
            vadMaxSingleSegmentMs: 18000,
            vadSensitive: true,
            vadAggressive: true,
        }, {});
        assert.strictEqual(normalized.vadEnabled, false);
        assert.strictEqual(normalized.vadMaxSingleSegmentMs, 18000);
        assert.strictEqual(normalized.vadSensitive, true);
        assert.strictEqual(normalized.vadAggressive, false);
    });

    it('preserves engine extras (filmVadPreset, glossaryMt, words/karaoke)', () => {
        const normalized = buildTransWithAiOptionsFromPayload({
            filmVadPreset: true,
            neuralDiarize: true,
            glossaryMtEnabled: false,
            includeWords: true,
            karaokeVtt: true,
            releaseGpuAfter: true,
            hallucinationSilenceThreshold: 2,
            subFormats: 'srt,ass',
            task: 'dual',
            mergeBilingualSubtitles: true,
        }, {});
        assert.strictEqual(normalized.filmVadPreset, true);
        assert.strictEqual(normalized.filmAudioEnhance, false);
        assert.strictEqual(normalized.neuralDiarize, true);
        assert.strictEqual(normalized.glossaryMtEnabled, false);
        assert.strictEqual(normalized.includeWords, true);
        assert.strictEqual(normalized.karaokeVtt, true);
        assert.strictEqual(normalized.releaseGpuAfter, true);
        assert.strictEqual(normalized.hallucinationSilenceThreshold, 2);
        assert.ok(String(normalized.subFormats).includes('ass'));
        assert.strictEqual(normalized.mergeBilingualSubtitles, true);
    });

    it('preserves autoDeepSense default off and explicit on', () => {
        const off = buildTransWithAiOptionsFromPayload({}, {});
        assert.strictEqual(off.autoDeepSense, false);
        const on = buildTransWithAiOptionsFromPayload({ autoDeepSense: true }, { autoDeepSense: false });
        assert.strictEqual(on.autoDeepSense, true);
    });

    it('preserves environment model slots and autoSense through normalize/save', () => {
        const normalized = buildTransWithAiOptionsFromPayload({
            engineAsrModel: 'whisper-large-v3-turbo',
            engineVadModel: 'silero-vad',
            engineOpusMtModel: 'opus-mt-ja-zh',
            engineLlmMtModel: 'sakura-7b',
            engineMtModel: '',
            smartTranslate: true,
            task: 'translate',
            autoSense: false,
            activePresetId: 'ja-av-anime-whisper-translate',
            engineProfile: 'quality',
            engineHfEndpoint: '',
        }, {
            engineAsrModel: 'sensevoice-small',
            engineOpusMtModel: '',
            engineLlmMtModel: 'sakura-1.5b',
            autoSense: true,
            activePresetId: '',
        });
        assert.strictEqual(normalized.engineAsrModel, 'whisper-large-v3-turbo');
        assert.strictEqual(normalized.engineVadModel, 'silero-vad');
        assert.strictEqual(normalized.engineOpusMtModel, 'opus-mt-ja-zh');
        assert.strictEqual(normalized.engineLlmMtModel, 'sakura-7b');
        assert.strictEqual(normalized.engineMtModel, '');
        assert.strictEqual(normalized.autoSense, false);
        assert.strictEqual(normalized.activePresetId, 'ja-av-anime-whisper-translate');
        assert.strictEqual(normalized.engineProfile, 'quality');
        assert.strictEqual(normalized.engineHfEndpoint, '');
    });

    it('clears activePresetId when autoSense is on', () => {
        const normalized = buildTransWithAiOptionsFromPayload({
            autoSense: true,
            activePresetId: 'ja-av-anime-whisper-translate',
        }, {});
        assert.strictEqual(normalized.autoSense, true);
        assert.strictEqual(normalized.activePresetId, '');
    });

    it('migrates legacy silero VAD alias to silero-vad on save', () => {
        const normalized = buildTransWithAiOptionsFromPayload({
            engineVadModel: 'silero',
        }, {});
        assert.strictEqual(normalized.engineVadModel, 'silero-vad');
    });

    it('migrates autoContentProfile to autoSense', () => {
        const { mergeTransWithAiOptions } = require('../electron/transwithai-options');
        const migrated = mergeTransWithAiOptions({ autoContentProfile: false });
        assert.strictEqual(migrated.autoSense, false);
        assert.strictEqual(migrated.autoContentProfile, undefined);
    });

    it('keeps empty Opus MT (auto-by-language) without wiping LLM slot', () => {
        const normalized = buildTransWithAiOptionsFromPayload({
            engineOpusMtModel: '',
            engineLlmMtModel: 'sakura-7b',
            engineMtModel: 'sakura-7b',
            smartTranslate: false,
            task: 'translate',
        }, {});
        assert.strictEqual(normalized.engineOpusMtModel, '');
        assert.strictEqual(normalized.engineLlmMtModel, 'sakura-7b');
        assert.strictEqual(normalized.engineMtModel, 'sakura-7b');
    });

    it('preserves empty LLM MT as 智能选择 (does not coerce to sakura-1.5b)', () => {
        const normalized = buildTransWithAiOptionsFromPayload({
            translateMode: 'llm',
            engineLlmMtModel: '',
            engineOpusMtModel: '',
            engineMtModel: '',
            smartTranslate: false,
            task: 'translate',
        }, {
            engineLlmMtModel: 'sakura-1.5b',
            engineMtModel: 'sakura-1.5b',
        });
        assert.strictEqual(normalized.engineLlmMtModel, '');
        assert.strictEqual(normalized.engineMtModel, '');
        assert.strictEqual(normalized.translateMode, 'llm');

        const roundTrip = buildTransWithAiOptionsFromPayload(normalized, {});
        assert.strictEqual(roundTrip.engineLlmMtModel, '');
        assert.strictEqual(roundTrip.translateMode, 'llm');
    });

    it('persists mtUseForm (form MT while sense can stay on)', () => {
        const on = buildTransWithAiOptionsFromPayload({ mtUseForm: true, autoSense: true }, {});
        assert.strictEqual(on.mtUseForm, true);
        assert.strictEqual(on.autoSense, true);
        const off = buildTransWithAiOptionsFromPayload({ mtUseForm: false }, { mtUseForm: true });
        assert.strictEqual(off.mtUseForm, false);
        const def = buildTransWithAiOptionsFromPayload({}, {});
        assert.strictEqual(def.mtUseForm, false);
    });

    it('persists settingsUiMode standard/expert for workspace (legacy field; UI no longer switches)', () => {
        const expert = buildTransWithAiOptionsFromPayload({ settingsUiMode: 'expert' }, {});
        assert.strictEqual(expert.settingsUiMode, 'expert');
        const standard = buildTransWithAiOptionsFromPayload({ settingsUiMode: 'standard' }, { settingsUiMode: 'expert' });
        assert.strictEqual(standard.settingsUiMode, 'standard');
        const def = buildTransWithAiOptionsFromPayload({}, {});
        assert.strictEqual(def.settingsUiMode, 'standard');
        const junk = buildTransWithAiOptionsFromPayload({ settingsUiMode: 'nope' }, {});
        assert.strictEqual(junk.settingsUiMode, 'standard');
    });

    it('persists explicit translateMode through normalize/save round-trip', () => {
        const llm = buildTransWithAiOptionsFromPayload({
            translateMode: 'llm',
            engineMtModel: 'sakura-1.5b',
            engineLlmMtModel: 'sakura-1.5b',
            engineOpusMtModel: '',
            smartTranslate: false,
            task: 'translate',
        }, {
            translateMode: 'engine',
            engineMtModel: '',
            smartTranslate: false,
        });
        assert.strictEqual(llm.translateMode, 'llm');
        assert.strictEqual(llm.engineMtModel, 'sakura-1.5b');
        assert.strictEqual(llm.smartTranslate, false);

        const engine = buildTransWithAiOptionsFromPayload({
            translateMode: 'engine',
            engineMtModel: '',
            engineLlmMtModel: 'sakura-1.5b',
            engineOpusMtModel: '',
            smartTranslate: false,
            task: 'translate',
        }, {
            translateMode: 'llm',
            engineMtModel: 'sakura-1.5b',
        });
        assert.strictEqual(engine.translateMode, 'engine');
        assert.strictEqual(engine.engineMtModel, '');
        assert.strictEqual(engine.engineLlmMtModel, 'sakura-1.5b');

        const smart = buildTransWithAiOptionsFromPayload({
            translateMode: 'smart',
            engineMtModel: '',
            smartTranslate: true,
            task: 'translate',
        }, {});
        assert.strictEqual(smart.translateMode, 'smart');
        assert.strictEqual(smart.smartTranslate, true);
    });

    it('preserves valid VAD timing zero values (not coerced to defaults)', () => {
        const normalized = buildTransWithAiOptionsFromPayload({
            vadMinSpeechDurationMs: 0,
            vadMinSilenceDurationMs: 0,
            vadSpeechPadMs: 0,
            vadThreshold: 0.5,
        }, {});
        assert.strictEqual(normalized.vadMinSpeechDurationMs, 0);
        assert.strictEqual(normalized.vadMinSilenceDurationMs, 0);
        assert.strictEqual(normalized.vadSpeechPadMs, 0);
    });
});
