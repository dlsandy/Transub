const assert = require('assert');
const {
    extractChatMessageContent,
    supportsThinkingControls,
} = require('../electron/advanced-llm-client');

describe('advanced-llm-client', () => {
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
});
