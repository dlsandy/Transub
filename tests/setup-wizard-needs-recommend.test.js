const assert = require('assert');
const needs = require('../src/js/setup-wizard-needs-core.js');
const recommend = require('../src/js/setup-wizard-model-recommend-core.js');

describe('setup-wizard-needs-core presets', () => {
    const samplePresets = [
        {
            id: 'ja-av-anime-whisper-firered',
            group: 'ja',
            name: 'Anime Whisper',
            builtin: true,
            options: { language: 'ja', engineAsrModel: 'anime-whisper', contentProfile: 'av_soft' },
        },
        {
            id: 'film-sensevoice',
            group: 'western',
            name: 'SenseVoice Small',
            builtin: true,
            options: { engineAsrModel: 'sensevoice-small', contentProfile: 'film', language: 'en' },
        },
        {
            id: 'film-audio-enhance',
            group: 'western',
            name: 'Whisper + Demucs',
            builtin: true,
            options: {
                engineAsrModel: 'whisper-large-v3-turbo',
                filmAudioEnhance: true,
                contentProfile: 'film',
                language: 'en',
            },
        },
        {
            id: 'custom-x',
            group: 'talk',
            name: 'Custom',
            builtin: false,
            options: { engineAsrModel: 'sensevoice-small' },
        },
    ];

    it('lists only builtin presets and groups them', () => {
        const builtins = needs.listBuiltinPresets(samplePresets);
        assert.strictEqual(builtins.length, 3);
        const groups = needs.groupPresets(samplePresets);
        assert.ok(groups.some((g) => g.group === 'ja'));
        assert.ok(groups.some((g) => g.group === 'western'));
        assert.ok(!groups.some((g) => g.presets.some((p) => p.id === 'custom-x')));
        assert.strictEqual(groups.find((g) => g.group === 'ja').label, '日剧/动漫');
    });

    it('resolveNeedsFromPresets maps language and primary id', () => {
        const byId = new Map(samplePresets.map((p) => [p.id, p]));
        const mapped = needs.resolveNeedsFromPresets(
            ['ja-av-anime-whisper-firered', 'film-sensevoice'],
            ['zh-Hans', 'en'],
            byId,
        );
        // Mixed source languages → auto
        assert.strictEqual(mapped.language, 'auto');
        assert.strictEqual(mapped.primaryPresetId, 'ja-av-anime-whisper-firered');
        assert.deepStrictEqual(mapped.presetIds, [
            'ja-av-anime-whisper-firered',
            'film-sensevoice',
        ]);
        assert.strictEqual(mapped.subtitleTargetLang, 'zh-Hans');

        const jaOnly = needs.resolveNeedsFromPresets(
            ['ja-av-anime-whisper-firered'],
            ['zh-Hans'],
            byId,
        );
        assert.strictEqual(jaOnly.language, 'ja');
    });

    it('collectModelsFromPresets unions ASR and demucs', () => {
        const items = needs.collectModelsFromPresets([
            samplePresets[0],
            samplePresets[2],
        ]);
        const ids = items.map((x) => x.id);
        assert.ok(ids.includes('anime-whisper'));
        assert.ok(ids.includes('whisper-large-v3-turbo'));
        assert.ok(ids.includes('demucs'));
        assert.ok(items.every((x) => x.required));
    });

    it('loadPresetCatalog uses electron.transWithAiGetPresets', async () => {
        const api = needs.createSetupWizardNeeds({
            $: () => null,
            getState: () => ({}),
            electron: {
                transWithAiGetPresets: async () => ({ ok: true, presets: samplePresets }),
            },
        });
        const catalog = await api.loadPresetCatalog();
        assert.strictEqual(catalog.length, 3);
        assert.ok(catalog.every((p) => p.builtin !== false));
    });

    it('groupPresets order matches tab categories', () => {
        const groups = needs.groupPresets(samplePresets);
        assert.deepStrictEqual(groups.map((g) => g.group), ['ja', 'western']);
        assert.strictEqual(groups[0].presets.length, 1);
        assert.strictEqual(groups[1].presets.length, 2);
    });
});

describe('setup-wizard-model-recommend-core from presets', () => {
    it('locks required ASR and does not recommend MT', () => {
        const plan = recommend.buildModelRecommendations({
            needs: {
                language: 'ja',
                targetLangs: ['zh-Hans'],
                selectedPresets: [{
                    id: 'ja-av-anime-whisper-firered',
                    name: 'Anime Whisper',
                    options: { engineAsrModel: 'anime-whisper', language: 'ja' },
                }],
            },
            recommend: { ok: true, vramGb: 8, device: 'cuda', gpuOk: true, profile: 'balanced' },
            goalsApi: {
                defaultMtSelection: () => ['sakura-1.5b'],
                ASR_OPTIONS: [],
            },
            needsApi: {
                collectModelsFromPresets: needs.collectModelsFromPresets,
            },
        });
        const asr = plan.items.find((x) => x.id === 'anime-whisper');
        assert.ok(asr);
        assert.strictEqual(asr.required, true);
        assert.strictEqual(asr.disabled, true);
        assert.strictEqual(asr.checked, true);
        assert.ok(!plan.items.some((x) => x.kind === 'mt'));
        assert.deepStrictEqual(plan.mtModels, []);
    });
});
