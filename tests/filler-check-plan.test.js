const assert = require('assert');
const plan = require('../src/js/subtitle-editor/filler-check-plan');
const {
    stripInlineFillersInText,
    isPureInterjectionJa,
} = require('../src/js/subtitle-fluency-core');

describe('filler-check-plan', () => {
    it('collects multilingual discourse and onomatopoeia cues', () => {
        const cues = [
            { startMs: 0, endMs: 500, text: 'うん' },
            { startMs: 500, endMs: 1000, text: 'はぁ…' },
            { startMs: 1000, endMs: 1500, text: '嗯' },
            { startMs: 1500, endMs: 2000, text: '哈啊' },
            { startMs: 2000, endMs: 2500, text: 'um' },
            { startMs: 2500, endMs: 3000, text: 'haha' },
            { startMs: 3000, endMs: 3500, text: '네' },
            { startMs: 3500, endMs: 4000, text: 'ㅋㅋ' },
            { startMs: 4000, endMs: 5000, text: '今天天气很好' },
            { startMs: 5000, endMs: 6000, text: 'うん、大丈夫？' },
        ];
        const matches = plan.collectFillerMatches(cues, {
            checkDiscourse: true,
            checkOnomatopoeia: true,
            langMode: 'auto',
        });
        const indexes = matches.map((m) => m.index);
        assert.ok(indexes.includes(0));
        assert.ok(indexes.includes(1));
        assert.ok(indexes.includes(2));
        assert.ok(indexes.includes(3));
        assert.ok(indexes.includes(4));
        assert.ok(indexes.includes(5));
        assert.ok(indexes.includes(6));
        assert.ok(indexes.includes(7));
        assert.ok(!indexes.includes(8));
        assert.ok(!indexes.includes(9), 'mixed cue not matched unless includeInline');
        const preview = plan.previewFillerCheckPlan({
            matches,
            checkDiscourse: true,
            checkOnomatopoeia: true,
            totalCues: cues.length,
        });
        assert.strictEqual(preview.isErr, false);
        assert.ok(preview.matched >= 8);
        assert.match(preview.summary, /匹配/);
    });

    it('can restrict to discourse only', () => {
        const cues = [
            { startMs: 0, endMs: 500, text: 'うん' },
            { startMs: 500, endMs: 1000, text: 'はぁ…' },
            { startMs: 1000, endMs: 1500, text: '正常对白内容' },
        ];
        const matches = plan.collectFillerMatches(cues, {
            checkDiscourse: true,
            checkOnomatopoeia: false,
            langMode: 'auto',
        });
        assert.ok(matches.some((m) => m.index === 0 && m.kind === 'discourse'));
        assert.ok(!matches.some((m) => m.index === 1));
    });

    it('includeInline strips fillers and keeps dialogue', () => {
        assert.ok(!isPureInterjectionJa('うん、大丈夫？'));
        const stripped = stripInlineFillersInText('うん、大丈夫？', {
            checkDiscourse: true,
            checkOnomatopoeia: true,
            lang: 'ja',
        });
        assert.strictEqual(stripped.changed, true);
        assert.strictEqual(stripped.pure, false);
        assert.match(stripped.text, /大丈夫/);
        assert.ok(!/うん/.test(stripped.text));

        const glued = stripInlineFillersInText('嗯我知道了', {
            checkDiscourse: true,
            checkOnomatopoeia: true,
            lang: 'zh',
        });
        assert.strictEqual(glued.changed, true);
        assert.strictEqual(glued.pure, false);
        assert.match(glued.text, /我知道了/);

        const cues = [
            { startMs: 0, endMs: 500, text: 'うん' },
            { startMs: 500, endMs: 1500, text: 'うん、大丈夫？' },
            { startMs: 1500, endMs: 2500, text: '嗯，我知道了' },
            { startMs: 2500, endMs: 3500, text: 'Um, I think so.' },
            { startMs: 3500, endMs: 4500, text: '今天天气很好' },
        ];
        const matches = plan.collectFillerMatches(cues, {
            checkDiscourse: true,
            checkOnomatopoeia: true,
            includeInline: true,
            langMode: 'auto',
        });
        assert.ok(matches.some((m) => m.index === 0 && m.action === 'delete'));
        const mixedJa = matches.find((m) => m.index === 1);
        assert.ok(mixedJa);
        assert.strictEqual(mixedJa.action, 'strip');
        assert.match(mixedJa.nextText, /大丈夫/);
        const mixedZh = matches.find((m) => m.index === 2);
        assert.ok(mixedZh);
        assert.strictEqual(mixedZh.action, 'strip');
        assert.match(mixedZh.nextText, /我知道了/);
        assert.ok(!matches.some((m) => m.index === 4));

        const applied = plan.applyFillerMatches(cues, matches);
        assert.ok(applied.removed >= 1);
        assert.ok(applied.stripped >= 2);
        assert.ok(applied.cues.some((c) => /大丈夫/.test(c.text)));
        assert.ok(applied.cues.some((c) => /我知道了/.test(c.text)));
        assert.ok(!applied.cues.some((c) => c.text === 'うん'));
    });

    it('applies delete indexes and remaps selection', () => {
        const cues = [
            { text: 'a' },
            { text: 'b' },
            { text: 'c' },
            { text: 'd' },
        ];
        const applied = plan.applyDeleteCueIndexes(cues, [1, 3]);
        assert.strictEqual(applied.removed, 2);
        assert.strictEqual(applied.kept, 2);
        assert.deepStrictEqual(applied.cues.map((c) => c.text), ['a', 'c']);
        assert.strictEqual(
            plan.nextSelectedIndexAfterDelete(1, applied.removedIndexes, applied.cues.length),
            1,
        );
    });

    it('errors when no kind selected', () => {
        const preview = plan.previewFillerCheckPlan({
            matches: [],
            checkDiscourse: false,
            checkOnomatopoeia: false,
        });
        assert.strictEqual(preview.isErr, true);
    });
});
