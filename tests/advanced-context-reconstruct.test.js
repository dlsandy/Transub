const assert = require('assert');
const core = require('../src/js/advanced-context-reconstruct-core');

describe('advanced-context-reconstruct-core', () => {
    it('chunks with overlap', () => {
        const cues = Array.from({ length: 25 }, (_, i) => ({
            index: i,
            text: `t${i}`,
        }));
        const chunks = core.chunkCues(cues, { windowCues: 10, overlapCues: 2 });
        assert.ok(chunks.length >= 3);
        assert.strictEqual(chunks[0].cues.length, 10);
        assert.strictEqual(chunks[1].cues[0].index, 8);
        assert.strictEqual(chunks[1].overlapFromPrev, 2);
    });

    it('builds messages and parses JSON response', () => {
        const cues = [
            { index: 0, text: '你好', sourceText: 'こんにちは' },
            { index: 1, text: '世界' },
        ];
        const messages = core.buildChatMessages(cues, {
            glossaryTerms: [{ term: '主角', aliases: ['男主'] }],
        });
        assert.strictEqual(messages.length, 2);
        assert.ok(messages[0].content.includes('JSON'));
        assert.ok(messages[1].content.includes('主角'));

        const parsed = core.parseModelResponse(
            '```json\n{"cues":[{"index":0,"text":"你好啊"},{"index":1,"text":"世界啊"}]}\n```',
            [0, 1],
        );
        assert.strictEqual(parsed.ok, true);
        assert.strictEqual(parsed.cues[0].text, '你好啊');
        assert.deepStrictEqual(parsed.incomplete, []);
    });

    it('strips think blocks and returns snippet on parse failure', () => {
        const withThink = core.parseModelResponse(
            '<think>先想一想</think>\n{"cues":[{"index":0,"text":"译好了"}]}',
            [0],
        );
        assert.strictEqual(withThink.ok, true);
        assert.strictEqual(withThink.cues[0].text, '译好了');

        const bad = core.parseModelResponse('これは日本語のままです\n第二行', [0, 1]);
        assert.strictEqual(bad.ok, false);
        assert.ok(bad.snippet);
        assert.ok(String(bad.snippet).includes('日本語') || String(bad.error).includes('JSON'));
    });

    it('recovers truncated cues JSON and strips untagged reasoning prose', () => {
        const truncated = core.parseModelResponse(
            '{"cues":[{"index":0,"text":"你好"},{"index":1,"text":"世界"},{"index":2,"text":"',
            [0, 1, 2],
        );
        assert.strictEqual(truncated.ok, true);
        assert.strictEqual(truncated.cues[0].text, '你好');
        assert.strictEqual(truncated.cues[1].text, '世界');
        assert.ok(truncated.incomplete.includes(2));

        const prose = core.parseModelResponse(
            '好的，我现在需要处理用户提供的影视字幕翻译任务。首先分析要求。\n'
            + '{"cues":[{"index":5,"text":"请多指教。"},{"index":6,"text":"好的。"}]}',
            [5, 6],
        );
        assert.strictEqual(prose.ok, true);
        assert.strictEqual(prose.cues[0].text, '请多指教。');

        const bareArr = core.parseModelResponse(
            '[ {"index": 68, "text": "是的" }, { "index": 69, "text": "哦" }, { "index": 70,',
            [68, 69, 70],
        );
        assert.strictEqual(bareArr.ok, true);
        assert.strictEqual(bareArr.cues.find((c) => c.index === 68)?.text, '是的');
        assert.ok(bareArr.incomplete.includes(70));

        const ndjson = core.parseModelResponse(
            '{ "index": 200, "text": "紧张吗？是的" } { "index": 201, "text": "感觉有点热" }',
            [200, 201],
        );
        assert.strictEqual(ndjson.ok, true);
        assert.strictEqual(ndjson.cues[0].text, '紧张吗？是的');
        assert.strictEqual(ndjson.cues[1].text, '感觉有点热');
    });

    it('reports incomplete indexes and merges updates', () => {
        const parsed = core.parseModelResponse(
            '{"cues":[{"index":1,"text":"仅一条"}]}',
            [0, 1],
        );
        assert.strictEqual(parsed.ok, true);
        assert.deepStrictEqual(parsed.incomplete, [0]);

        const merged = core.mergeCueUpdates([
            [{ index: 0, text: 'a' }, { index: 1, text: 'b' }],
            [{ index: 1, text: 'b2' }, { index: 2, text: 'c' }],
        ]);
        assert.deepStrictEqual(merged, [
            { index: 0, text: 'a' },
            { index: 1, text: 'b2' },
            { index: 2, text: 'c' },
        ]);
    });

    it('mock reconstruct trims whitespace', () => {
        const out = core.mockReconstructCues([
            { index: 3, text: '  你好  \n\n\n  世界  ' },
        ]);
        assert.strictEqual(out[0].index, 3);
        assert.ok(!out[0].text.startsWith(' '));
        assert.ok(!/\n{3}/.test(out[0].text));
    });
});
