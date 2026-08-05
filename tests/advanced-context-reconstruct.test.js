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

    it('detects merged neighbors and shifted cascade misalignment', () => {
        const originals = [
            { index: 17, text: '十年前，妈妈再婚了…' },
            { index: 18, text: '现在爸爸带来的继妹香' },
            { index: 19, text: '很沉默，不知道在想什么。' },
            { index: 20, text: '呐，小智。' },
            { index: 21, text: '补习班要上到什么时候？' },
            { index: 22, text: '到晚上七点。' },
        ];
        // 模型把 17+18+19 并入 17，后续顺移（对齐用户截图场景）
        const rewritten = [
            {
                index: 17,
                text: '十年前，妈妈再婚了…现在爸爸带来的继妹香很沉默，不知道在想什么。',
            },
            { index: 18, text: '呐，小智。' },
            { index: 19, text: '补习班要上到什么时候？' },
            { index: 20, text: '到晚上七点。' },
            { index: 21, text: '到晚上七点。' },
            { index: 22, text: '到晚上七点。' },
        ];
        const issues = core.detectCueAlignmentIssues(originals, rewritten);
        assert.ok(issues.merges.length >= 1, 'should detect merge at 17');
        assert.ok(issues.merges.some((m) => m.index === 17));
        assert.ok(issues.badIndexes.includes(17));
        assert.ok(issues.badIndexes.includes(18) || issues.shifts.some((s) => s.index === 18));
        assert.ok(issues.severe);

        const repaired = core.revertAlignmentIssueUpdates(originals, rewritten, issues);
        const byIdx = new Map(repaired.map((c) => [c.index, c.text]));
        assert.strictEqual(byIdx.get(17), originals[0].text);
        assert.strictEqual(byIdx.get(18), originals[1].text);
        assert.strictEqual(byIdx.get(19), originals[2].text);
    });

    it('detects second merge cluster mid-scene (dress-up cascade)', () => {
        const originals = [
            { index: 26, text: '从一二年前开始，就连打扮和化妆也变得讲究了呢。' },
            { index: 27, text: '意识到我们没有血缘关系的这个时期' },
            { index: 28, text: '我也开始注意起她了。' },
            { index: 29, text: '你在睡什么觉？' },
        ];
        const rewritten = [
            {
                index: 26,
                text: '从一二年前开始，就连打扮和化妆也变得讲究了呢。意识到我们没有血缘关系的这个时期我也开始注意起她了。',
            },
            { index: 27, text: '你在睡什么觉？' },
            { index: 28, text: '你在睡什么觉？' },
            { index: 29, text: '你在睡什么觉？' },
        ];
        const issues = core.detectCueAlignmentIssues(originals, rewritten);
        assert.ok(issues.merges.some((m) => m.index === 26));
        assert.ok(issues.severe);
        const repaired = core.revertAlignmentIssueUpdates(originals, rewritten, {
            ...issues,
            badIndexes: originals.map((c) => c.index),
        });
        assert.strictEqual(repaired.find((c) => c.index === 26).text, originals[0].text);
        assert.strictEqual(repaired.find((c) => c.index === 27).text, originals[1].text);
    });

    it('does not flag normal light rewrites as merges', () => {
        const originals = [
            { index: 0, text: '十年前，妈妈再婚了…' },
            { index: 1, text: '现在爸爸带来的继妹香' },
            { index: 2, text: '很沉默，不知道在想什么。' },
        ];
        const rewritten = [
            { index: 0, text: '十年前，妈妈再婚了。' },
            { index: 1, text: '现在爸爸带来的继妹香，' },
            { index: 2, text: '很沉默，不知道在想些什么。' },
        ];
        const issues = core.detectCueAlignmentIssues(originals, rewritten);
        assert.deepStrictEqual(issues.merges, []);
        assert.deepStrictEqual(issues.shifts, []);
        assert.deepStrictEqual(issues.badIndexes, []);
        assert.strictEqual(issues.severe, false);
    });

    it('mentions anti-merge one-to-one rules in prompts', () => {
        const msgs = core.buildChatMessages([
            { index: 0, text: '你好' },
            { index: 1, text: '世界' },
        ]);
        assert.ok(msgs[0].content.includes('禁止把邻条') || msgs[0].content.includes('一对一'));
        assert.ok(msgs[1].content.includes('恰好 2 条'));
    });
});
