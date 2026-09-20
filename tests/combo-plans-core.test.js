const assert = require('assert');
const {
    normalizeComboPlan,
    normalizeManifest,
    filterComboPlans,
    formatComboPlanLangPair,
    requiresProForMode,
    translateModeLabel,
    collectRequiredModelIds,
    buildApplyOptionsPatch,
    emptyFilters,
} = require('../src/js/combo-plans-core.js');

describe('combo-plans-core', () => {
    const samplePlans = [
        normalizeComboPlan({
            id: 'ja-llm',
            group: 'ja',
            name: 'JA LLM',
            language: 'ja',
            subtitleTargetLang: 'zh-Hans',
            translateMode: 'llm',
            hardware: { tier: 'balanced' },
            models: ['anime-whisper'],
            options: { engineAsrModel: 'anime-whisper', device: 'cuda' },
        }),
        normalizeComboPlan({
            id: 'en-ext',
            group: 'western',
            name: 'EN External',
            language: 'en',
            subtitleTargetLang: 'zh-Hans',
            translateMode: 'external',
            hardware: { tier: 'cpu' },
            models: ['sensevoice-small'],
        }),
        normalizeComboPlan({
            id: 'ja-smart',
            group: 'ja',
            name: 'JA Smart',
            language: 'ja',
            subtitleTargetLang: 'zh-Hant',
            translateMode: 'smart',
            hardware: { tier: 'quality' },
            models: ['anime-whisper', 'sakura-1.5b'],
        }),
        normalizeComboPlan({
            id: 'ko-low',
            group: 'ko',
            name: 'KO Low',
            language: 'ko',
            subtitleTargetLang: 'zh-Hans',
            translateMode: 'llm',
            hardware: { tier: 'low' },
            models: ['sensevoice-small'],
        }),
    ];

    it('normalize infers requiresPro and rewrites options language pair', () => {
        const plan = normalizeComboPlan({
            id: 'x',
            language: 'ja',
            subtitleTargetLang: 'zh-Hans',
            translateMode: 'dialog',
            options: { language: 'en', subtitleTargetLang: 'en', translateMode: 'llm' },
        });
        assert.strictEqual(plan.requiresPro, true);
        assert.strictEqual(plan.options.language, 'ja');
        assert.strictEqual(plan.options.subtitleTargetLang, 'zh-Hans');
        assert.strictEqual(plan.options.translateMode, 'dialog');
        assert.strictEqual(requiresProForMode('smart'), true);
        assert.strictEqual(requiresProForMode('llm'), false);
        assert.ok(translateModeLabel('smart').includes('◆'));
    });

    it('formatComboPlanLangPair shows source → target', () => {
        assert.strictEqual(
            formatComboPlanLangPair({ language: 'ja', subtitleTargetLang: 'zh-Hans' }),
            '日语 → 简中',
        );
    });

    it('filterComboPlans by language alone', () => {
        const out = filterComboPlans(samplePlans, { ...emptyFilters(), language: 'ja' });
        assert.strictEqual(out.length, 2);
        assert.ok(out.every((p) => p.language === 'ja'));
    });

    it('filterComboPlans by subtitleTargetLang alone', () => {
        const out = filterComboPlans(samplePlans, { ...emptyFilters(), subtitleTargetLang: 'zh-Hant' });
        assert.strictEqual(out.length, 1);
        assert.strictEqual(out[0].id, 'ja-smart');
    });

    it('filterComboPlans by hardwareTier alone', () => {
        const out = filterComboPlans(samplePlans, { ...emptyFilters(), hardwareTier: 'cpu' });
        assert.strictEqual(out.length, 1);
        assert.strictEqual(out[0].id, 'en-ext');
    });

    it('filterComboPlans combines language + target + hardware', () => {
        const out = filterComboPlans(samplePlans, {
            language: 'ja',
            subtitleTargetLang: 'zh-Hans',
            hardwareTier: 'balanced',
            translateMode: '',
            pro: 'all',
            group: '',
        });
        assert.strictEqual(out.length, 1);
        assert.strictEqual(out[0].id, 'ja-llm');
    });

    it('filterComboPlans pro free/pro', () => {
        assert.strictEqual(
            filterComboPlans(samplePlans, { ...emptyFilters(), pro: 'pro' }).length,
            1,
        );
        assert.strictEqual(
            filterComboPlans(samplePlans, { ...emptyFilters(), pro: 'free' }).length,
            3,
        );
    });

    it('buildApplyOptionsPatch includes translate keys and activeComboPlanId', () => {
        const patch = buildApplyOptionsPatch(samplePlans[0]);
        assert.strictEqual(patch.translateMode, 'llm');
        assert.strictEqual(patch.language, 'ja');
        assert.strictEqual(patch.subtitleTargetLang, 'zh-Hans');
        assert.strictEqual(patch.activeComboPlanId, 'ja-llm');
        assert.ok(collectRequiredModelIds(samplePlans[0]).includes('anime-whisper'));
    });

    it('normalizeManifest keeps plan index fields', () => {
        const m = normalizeManifest({
            schemaVersion: 1,
            plans: [{ id: 'a', language: 'en', subtitleTargetLang: 'zh-Hans', translateMode: 'llm', hardware: { tier: 'low' } }],
        });
        assert.strictEqual(m.plans.length, 1);
        assert.strictEqual(m.plans[0].hardware.tier, 'low');
    });
});
