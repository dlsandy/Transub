const assert = require('assert');
const api = require('../src/js/translate-mode-byok-policy-core');

describe('translate-mode-byok-policy-core', () => {
    it('normalizes external aliases', () => {
        assert.strictEqual(api.normalizeTranslateMode('byok'), 'external');
        assert.strictEqual(api.normalizeTranslateMode('openai'), 'external');
        assert.strictEqual(api.isExternalTranslateMode('external'), true);
        assert.strictEqual(api.isExternalTranslateMode('llm'), false);
    });

    it('prefers BYOK sentence MT only for external', () => {
        const byok = { baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen' };
        assert.strictEqual(api.shouldPreferByokSentenceMt({ translateMode: 'external', byok }), true);
        assert.strictEqual(api.shouldPreferByokSentenceMt({ translateMode: 'llm', byok }), false);
        assert.strictEqual(api.shouldPreferByokSentenceMt({ translateMode: 'smart', byok }), false);
        assert.strictEqual(api.resolveProChatLlmSource(), 'managed');
    });

    it('migrates legacy llmSource=byok modes to external', () => {
        const mig = api.migrateTranslateModeFromLegacyByok({
            translateMode: 'dialog',
            llmSource: 'byok',
            byokReady: true,
        });
        assert.strictEqual(mig.migrated, true);
        assert.strictEqual(mig.translateMode, 'external');
        const skip = api.migrateTranslateModeFromLegacyByok({
            translateMode: 'llm',
            llmSource: 'managed',
            byokReady: true,
        });
        assert.strictEqual(skip.migrated, false);
        assert.strictEqual(skip.translateMode, 'llm');
    });
});
