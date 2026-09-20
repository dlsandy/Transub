const assert = require('assert');
const {
    extractChatMessageContent,
    supportsThinkingControls,
    formatLlmNetworkError,
    mergeCatalogChatDefaults,
} = require('../electron/advanced-llm-client');

describe('advanced-llm-client', () => {
    it('formats opaque fetch failed for BYOK / local LLM', () => {
        const opaque = new Error('fetch failed');
        opaque.cause = { message: 'fetch failed' };
        assert.match(
            formatLlmNetworkError(opaque, { baseUrl: 'https://api.openai.com/v1' }),
            /无法连接大模型接口/,
        );

        const refused = new Error('fetch failed');
        refused.cause = { code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 127.0.0.1:8080' };
        assert.match(
            formatLlmNetworkError(refused, { baseUrl: 'http://127.0.0.1:8080/v1' }),
            /连接被拒绝/,
        );

        const reset = new Error('fetch failed');
        reset.cause = { code: 'ECONNRESET', message: 'read ECONNRESET' };
        assert.match(
            formatLlmNetworkError(reset, { baseUrl: 'http://127.0.0.1:39281/v1' }),
            /本地模型服务/,
        );
        assert.match(
            formatLlmNetworkError(reset, { baseUrl: 'http://127.0.0.1:39281/v1' }),
            /显存|上下文/,
        );
    });

    it('detects local / qwen3 endpoints for thinking controls', () => {
        assert.strictEqual(supportsThinkingControls('http://127.0.0.1:8080/v1', 'qwen3-1.7b'), true);
        assert.strictEqual(supportsThinkingControls('http://localhost:11434/v1', 'llama'), true);
        assert.strictEqual(supportsThinkingControls('https://api.openai.com/v1', 'gpt-4o-mini'), false);
        assert.strictEqual(supportsThinkingControls('https://api.openai.com/v1', 'qwen3-8b'), true);
    });

    it('ignores reasoning_content when ignoreReasoning is set', () => {
        const msg = {
            role: 'assistant',
            content: '',
            reasoning_content: '好的，我现在需要处理用户提供的影视字幕翻译任务……',
        };
        assert.strictEqual(extractChatMessageContent(msg), msg.reasoning_content);
        assert.strictEqual(extractChatMessageContent(msg, { ignoreReasoning: true }), '');
        assert.strictEqual(
            extractChatMessageContent({
                content: '{"cues":[]}',
                reasoning_content: 'think…',
            }, { ignoreReasoning: true }),
            '{"cues":[]}',
        );
    });

    it('applyCatalogSampling overrides temps from Huihui chatDefaults', () => {
        const line = mergeCatalogChatDefaults({
            modelId: 'qwen3-8b-abliterated',
            temperature: 0.05,
            frequency_penalty: 0.3,
            applyCatalogSampling: true,
            samplingRole: 'line',
        });
        assert.strictEqual(line.temperature, 0.15);
        assert.strictEqual(line.topP, 0.8);
        assert.strictEqual(line.repeatPenalty, 1.08);
        assert.strictEqual(line.frequencyPenalty, 0.12);
        assert.strictEqual(line.frequency_penalty, undefined);

        const polish = mergeCatalogChatDefaults({
            modelId: 'qwen3-8b-abliterated-q5',
            temperature: 0.05,
            applyCatalogSampling: true,
            samplingRole: 'polish',
        });
        assert.strictEqual(polish.temperature, 0.23);
        assert.strictEqual(polish.frequencyPenalty, 0.12);

        const fillOnly = mergeCatalogChatDefaults({
            modelId: 'qwen3-8b-abliterated',
            temperature: 0.05,
        });
        assert.strictEqual(fillOnly.temperature, 0.05);
    });
});
