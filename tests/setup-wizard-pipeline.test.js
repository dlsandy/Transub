const assert = require('assert');
const goals = require('../src/js/setup-wizard-goals-core.js');

describe('resolveWizardPipeline', () => {
    it('exports resolveWizardPipeline', () => {
        assert.equal(typeof goals.resolveWizardPipeline, 'function');
    });

    it('free JA/auto → Sakura llm, not smart', () => {
        const pipe = goals.resolveWizardPipeline({
            profile: 'balanced',
            language: 'ja',
            task: 'translate',
            variant: 'simplified',
            advancedEntitled: false,
        });
        assert.strictEqual(pipe.task, 'translate');
        assert.strictEqual(pipe.variant, 'simplified');
        assert.strictEqual(pipe.subtitleTargetLang, 'zh-Hans');
        assert.ok(pipe.mtModels.some((id) => /^sakura-/i.test(id)));
        assert.strictEqual(pipe.smartTranslate, false);
        assert.strictEqual(pipe.translateMode, 'llm');
        assert.ok(pipe.asrModels.length);
        assert.ok(pipe.vadModels.length);
    });

    it('Pro JA → Sakura + chat enables smart', () => {
        const pipe = goals.resolveWizardPipeline({
            profile: 'balanced',
            language: 'auto',
            task: 'translate',
            advancedEntitled: true,
        });
        assert.ok(pipe.mtModels.some((id) => /^sakura-/i.test(id)));
        const hasManaged = pipe.mtModels.some((id) => goals.isManagedLlmModelId(id));
        if (hasManaged) {
            assert.strictEqual(pipe.smartTranslate, true);
            assert.strictEqual(pipe.translateMode, 'smart');
        } else {
            // Catalog may be empty in unit test — still not smart without chat pair.
            assert.strictEqual(pipe.smartTranslate, false);
        }
    });

    it('non-JA → managed LLM llm path, not smart', () => {
        const pipe = goals.resolveWizardPipeline({
            profile: 'balanced',
            language: 'en',
            task: 'translate',
            advancedEntitled: false,
        });
        assert.ok(!pipe.mtModels.some((id) => /^sakura-/i.test(id)));
        assert.strictEqual(pipe.smartTranslate, false);
        assert.strictEqual(pipe.translateMode, 'llm');
        assert.ok(pipe.mtModels.length >= 1);
    });

    it('quality JA prefers whisper-ja when no explicit asr', () => {
        const pipe = goals.resolveWizardPipeline({
            profile: 'quality',
            language: 'ja',
            task: 'translate',
            advancedEntitled: false,
        });
        assert.ok(
            pipe.asrModels.some((id) => id === 'whisper-ja-1.5b' || id === 'anime-whisper'),
            `unexpected asr ${pipe.asrModels.join(',')}`,
        );
    });

    it('Sakura selection gates Whisper-JA into asr list', () => {
        const pipe = goals.resolveWizardPipeline({
            profile: 'balanced',
            language: 'ja',
            task: 'translate',
            mtModels: ['sakura-1.5b'],
            asrModels: ['sensevoice-small'],
            advancedEntitled: false,
        });
        assert.ok(goals.asrListHasWhisperJa(pipe.asrModels));
    });

    it('explicit empty mtModels is honored (no default translators)', () => {
        const pipe = goals.resolveWizardPipeline({
            profile: 'balanced',
            language: 'ja',
            task: 'translate',
            asrModels: ['sensevoice-small'],
            mtModels: [],
            advancedEntitled: false,
        });
        assert.deepStrictEqual(pipe.mtModels, []);
        assert.ok(pipe.asrModels.includes('sensevoice-small'));
    });

    it('omitted mtModels still gets defaults', () => {
        const pipe = goals.resolveWizardPipeline({
            profile: 'balanced',
            language: 'ja',
            task: 'translate',
            asrModels: ['sensevoice-small'],
            advancedEntitled: false,
        });
        assert.ok(pipe.mtModels.length >= 1);
    });

    it('has no network step and no translatePref UI dependency', () => {
        const steps = require('../src/js/setup-wizard-steps-core.js');
        assert.ok(!steps.STEPS.includes('network'));
        const pipe = goals.resolveWizardPipeline({ language: 'ja', profile: 'balanced' });
        assert.ok(pipe.translatePref === 'sakura' || pipe.translatePref === 'engine');
    });
});
