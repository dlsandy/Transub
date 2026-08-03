const assert = require('assert');
const {
    llmSourceLabel,
    llmHostHint,
    formatAdvancedLlmEngineLogLine,
    logAdvancedLlmToEngine,
    _resetAdvancedLlmLogDedup,
} = require('../electron/advanced-llm-log');

describe('advanced-llm-log', () => {
    beforeEach(() => {
        _resetAdvancedLlmLogDedup();
    });

    it('labels BYOK as 外接模型', () => {
        assert.strictEqual(llmSourceLabel('byok'), '外接模型');
        assert.strictEqual(llmSourceLabel('managed'), '软件内选模型');
    });

    it('extracts host without leaking path secrets', () => {
        assert.strictEqual(llmHostHint('https://api.openai.com/v1'), 'api.openai.com');
        assert.strictEqual(llmHostHint('http://127.0.0.1:11434/v1'), '127.0.0.1:11434');
    });

    it('formats engine log line with source and model', () => {
        const line = formatAdvancedLlmEngineLogLine(
            {
                ok: true,
                source: 'byok',
                model: 'gpt-4o-mini',
                baseUrl: 'https://api.openai.com/v1',
            },
            { feature: '智能翻译' },
        );
        assert.strictEqual(
            line,
            '[engine] 大模型 · 外接模型 · gpt-4o-mini · api.openai.com · 智能翻译',
        );
        assert.ok(!line.includes('sk-'));
    });

    it('dedups identical lines within window', () => {
        const llm = {
            ok: true,
            source: 'byok',
            model: 'qwen',
            baseUrl: 'http://127.0.0.1:8080/v1',
        };
        const a = logAdvancedLlmToEngine(llm, { feature: '智能翻译' });
        const b = logAdvancedLlmToEngine(llm, { feature: '智能翻译' });
        assert.ok(a.includes('外接模型'));
        assert.strictEqual(b, '');
        const c = logAdvancedLlmToEngine(llm, { feature: '智能翻译', force: true });
        assert.ok(c.includes('外接模型'));
    });
});
