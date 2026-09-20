const assert = require('assert');
const ready = require('../src/js/smart-translate-readiness-core');

describe('smart-translate-readiness-core', () => {
    it('assess full hybrid when sentence + chat ready', () => {
        const a = ready.assessSmartTranslateReadiness({
            task: 'translate',
            translateMode: 'smart',
            advancedEntitled: true,
            hybridAllowed: true,
            hybridEnabled: true,
            polishEnabled: true,
            chatReady: true,
            chatLabel: 'Qwen2.5 7B',
            preferredHybridId: '',
            hybridInstalledIds: ['sakura-1.5b', 'qwen25-7b'],
        });
        assert.strictEqual(a.level, 'full');
        assert.strictEqual(a.tone, 'ok');
        assert.ok(a.sentenceReady);
        assert.ok(a.stripPart.includes('混合'));
        assert.strictEqual(a.preflight, null);
    });

    it('assess chat_degraded when only chat model installed', () => {
        const a = ready.assessSmartTranslateReadiness({
            task: 'translate',
            translateMode: 'smart',
            advancedEntitled: true,
            hybridAllowed: true,
            hybridEnabled: true,
            chatReady: true,
            hybridInstalledIds: ['qwen25-7b'],
        });
        assert.strictEqual(a.level, 'chat_degraded');
        assert.strictEqual(a.tone, 'warn');
        assert.strictEqual(a.preflight?.kind, 'chat_degraded');
        assert.ok(a.bannerText.includes('混合翻译'));
        assert.strictEqual(a.action?.action, 'models');
    });

    it('assess missing_both blocks start', () => {
        const a = ready.assessSmartTranslateReadiness({
            task: 'dual',
            translateMode: 'smart',
            advancedEntitled: true,
            hybridAllowed: true,
            hybridEnabled: true,
            chatReady: false,
            hybridInstalledIds: [],
        });
        assert.strictEqual(a.level, 'missing_both');
        assert.strictEqual(a.preflight?.block, true);
    });

    it('assess sentence_only warns when polish on', () => {
        const a = ready.assessSmartTranslateReadiness({
            task: 'translate',
            translateMode: 'smart',
            advancedEntitled: true,
            hybridAllowed: true,
            hybridEnabled: true,
            polishEnabled: true,
            chatReady: false,
            hybridInstalledIds: ['sakura-galtransl-7b'],
        });
        assert.strictEqual(a.level, 'sentence_only');
        assert.strictEqual(a.tone, 'warn');
        assert.strictEqual(a.preflight?.kind, 'sentence_only');
    });

    it('not applicable for free / non-smart', () => {
        assert.strictEqual(ready.assessSmartTranslateReadiness({
            task: 'translate',
            translateMode: 'smart',
            advancedEntitled: false,
            chatReady: true,
            hybridInstalledIds: ['sakura-1.5b'],
        }).applicable, false);
        assert.strictEqual(ready.assessSmartTranslateReadiness({
            task: 'translate',
            translateMode: 'llm',
            advancedEntitled: true,
            chatReady: true,
            hybridInstalledIds: ['sakura-1.5b'],
        }).applicable, false);
    });

    it('dialog mode is applicable chat-only (not hybrid degrade)', () => {
        const a = ready.assessSmartTranslateReadiness({
            task: 'translate',
            translateMode: 'dialog',
            advancedEntitled: true,
            hybridAllowed: true,
            hybridEnabled: true,
            polishEnabled: true,
            chatReady: true,
            chatLabel: 'Qwen2.5 7B',
            hybridInstalledIds: ['sakura-1.5b'],
        });
        assert.strictEqual(a.applicable, true);
        assert.strictEqual(a.hybridWanted, false);
        assert.strictEqual(a.level, 'dialog_chat_ok');
        assert.strictEqual(a.tone, 'ok');
        assert.ok(a.stripPart.includes('智能'));
        assert.strictEqual(a.preflight, null);

        const missing = ready.assessSmartTranslateReadiness({
            task: 'translate',
            translateMode: 'dialog',
            advancedEntitled: true,
            chatReady: false,
            hybridInstalledIds: [],
        });
        assert.strictEqual(missing.level, 'missing_chat');
        assert.ok(missing.bannerText.includes('智能翻译'));
        assert.strictEqual(missing.preflight?.block, true);
    });

    it('assess chat_degraded when preferred sentence model is general LLM', () => {
        const a = ready.assessSmartTranslateReadiness({
            task: 'translate',
            translateMode: 'smart',
            advancedEntitled: true,
            hybridAllowed: true,
            hybridEnabled: true,
            chatReady: true,
            chatLabel: 'Spark X2.5 4B',
            preferredHybridId: 'spark-x25-4b',
            // Specialist is installed — must still degrade, never pretend GalTransl will run.
            hybridInstalledIds: ['sakura-galtransl-7b-q6k', 'spark-x25-4b'],
        });
        assert.strictEqual(a.level, 'chat_degraded');
        assert.strictEqual(a.tone, 'warn');
        assert.strictEqual(a.sentenceReady, false);
        assert.strictEqual(a.hybridModelId, '');
        assert.ok(a.bannerText.includes('spark-x25-4b') || a.bannerText.includes('通用模型'));
        assert.ok(a.bannerText.includes('GalTransl'));
        assert.strictEqual(a.preflight?.kind, 'chat_degraded');
    });

    it('formatHybridSkipProgressMessage marks degrade', () => {
        assert.ok(ready.formatHybridSkipProgressMessage('no_model').includes('降级'));
        assert.ok(ready.formatHybridSkipProgressMessage('not_ja').includes('非日语'));
        assert.ok(ready.formatHybridSkipProgressMessage('not_translate_only').includes('通用模型'));
    });

    it('formatSmartTranslateModeTag', () => {
        assert.ok(ready.formatSmartTranslateModeTag({ hybridUsed: true }).includes('混合'));
        assert.ok(ready.formatSmartTranslateModeTag({ dialogMode: true }).includes('智能'));
        assert.ok(ready.formatSmartTranslateModeTag({
            hybridUsed: false,
            hybridSkipReason: 'no_model',
        }).includes('降级'));
    });

    it('recommendWizardMtPair Pro 更准 recommends sakura + chat', () => {
        const pair = ready.recommendWizardMtPair({
            task: 'translate',
            translatePref: 'sakura',
            language: 'ja',
            advancedEntitled: true,
            sakuraId: 'sakura-1.5b',
            chatId: 'qwen25-7b',
        });
        assert.deepStrictEqual(pair, ['sakura-1.5b', 'qwen25-7b']);
        const free = ready.recommendWizardMtPair({
            task: 'translate',
            translatePref: 'sakura',
            language: 'ja',
            advancedEntitled: false,
        });
        assert.deepStrictEqual(free, ['sakura-1.5b']);
    });
});
