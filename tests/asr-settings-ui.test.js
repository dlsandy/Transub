const assert = require('assert');
const asrSettings = require('../src/js/asr-settings-core');
const saved = require('../src/js/settings-saved-options-core');
const { mergeTransWithAiOptions } = require('../electron/transwithai-options');
const { buildTransWithAiOptionsFromPayload } = require('../electron/transwithai-bridge');

describe('asr settings UI wiring', () => {
    it('normalizes perfProfile', () => {
        assert.strictEqual(asrSettings.normalizePerfProfile('speed'), 'speed');
        assert.strictEqual(asrSettings.normalizePerfProfile('balanced'), 'quality');
        const n = asrSettings.normalizeAsrExtraOptions({
            autoSuggestSpeakers: 1,
            speakerCount: '3',
            perfProfile: 'fast',
        });
        assert.strictEqual(n.autoSuggestSpeakers, undefined);
        assert.strictEqual(n.speakerCount, undefined);
        assert.strictEqual(n.perfProfile, 'speed');
    });

    it('describeAsrRecommendChip hides when same model', () => {
        const hidden = asrSettings.describeAsrRecommendChip({
            currentAsr: 'sensevoice-small',
            recommendedAsr: 'sensevoice-small',
            profile: 'balanced',
        });
        assert.strictEqual(hidden.visible, false);
        const shown = asrSettings.describeAsrRecommendChip({
            currentAsr: 'sensevoice-small',
            recommendedAsr: 'whisper-large-v3-turbo',
            profile: 'quality',
        });
        assert.ok(shown.visible);
        assert.ok(shown.label.includes('whisper-large-v3-turbo'));
    });

    it('persist path keeps perfProfile', () => {
        const assembled = saved.assembleSavedOptionsFromFields({
            task: 'transcribe',
            autoSuggestSpeakers: true,
            speakerCount: 4,
            perfProfile: 'speed',
            audioLightDenoise: true,
        });
        assert.strictEqual(assembled.autoSuggestSpeakers, undefined);
        assert.strictEqual(assembled.speakerCount, undefined);
        assert.strictEqual(assembled.perfProfile, 'speed');

        const merged = mergeTransWithAiOptions({
            autoSuggestSpeakers: true,
            speakerCount: 5,
            perfProfile: 'speed',
        });
        assert.strictEqual(merged.autoSuggestSpeakers, true);
        assert.strictEqual(merged.speakerCount, 5);
        assert.strictEqual(merged.perfProfile, 'speed');

        const normalized = buildTransWithAiOptionsFromPayload({
            autoSuggestSpeakers: true,
            speakerCount: 6,
            perfProfile: 'speed',
            task: 'transcribe',
        }, {});
        assert.strictEqual(normalized.autoSuggestSpeakers, true);
        assert.strictEqual(normalized.speakerCount, 6);
        assert.strictEqual(normalized.perfProfile, 'speed');
    });

    it('applyHardwareAsrRecommend respects specialists and installs', () => {
        const keep = asrSettings.applyHardwareAsrRecommend(
            { engineAsrModel: 'whisper-ja-1.5b' },
            { recommendedAsr: 'whisper-large-v3-turbo', installedModels: ['whisper-ja-1.5b', 'whisper-large-v3-turbo'] },
        );
        assert.strictEqual(keep.changed, false);
        assert.strictEqual(keep.overrides.engineAsrModel, 'whisper-ja-1.5b');

        const skipMissing = asrSettings.applyHardwareAsrRecommend(
            { engineAsrModel: 'sensevoice-small' },
            { recommendedAsr: 'whisper-large-v3-turbo', installedModels: ['sensevoice-small'] },
        );
        assert.strictEqual(skipMissing.changed, false);

        const applied = asrSettings.applyHardwareAsrRecommend(
            { engineAsrModel: 'sensevoice-small' },
            {
                recommendedAsr: 'whisper-large-v3-turbo',
                profile: 'quality',
                installedModels: [
                    { id: 'sensevoice-small', installed: true },
                    { id: 'whisper-large-v3-turbo', installed: true },
                ],
            },
        );
        assert.strictEqual(applied.changed, true);
        assert.strictEqual(applied.overrides.engineAsrModel, 'whisper-large-v3-turbo');
    });
});
