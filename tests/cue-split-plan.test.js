const assert = require('assert');
const split = require('../src/js/subtitle-split-core');
const plan = require('../src/js/subtitle-editor/cue-split-plan');

describe('cue-split-plan', () => {
    const deps = {
        splitApi: split,
        getEndMs: (c) => c.endMs,
        getTargetCps: () => 3,
        getBreakWords: () => ['。', '、'],
    };

    it('splits by lines / spaces', () => {
        const cue = { startMs: 0, endMs: 4000, text: '你好\n世界' };
        const lines = plan.planCueSplit('lines', cue, {}, deps);
        assert.ok(!lines.error);
        assert.strictEqual(lines.cues.length, 2);

        const spaces = plan.planCueSplit(
            'spaces',
            { startMs: 0, endMs: 4000, text: 'hello world' },
            {},
            deps,
        );
        assert.ok(!spaces.error);
        assert.strictEqual(spaces.cues.length, 2);
    });

    it('count mode and empty guard', () => {
        const empty = plan.planCueSplit('count', { startMs: 0, endMs: 1000, text: '  ' }, { count: 2 }, deps);
        assert.ok(empty.error);

        const ok = plan.planCueSplit(
            'count',
            { startMs: 0, endMs: 4000, text: 'one two three four five six' },
            { count: 2 },
            deps,
        );
        assert.ok(!ok.error, ok.error);
        assert.ok(ok.cues.length >= 2);
    });

    it('cursor and playhead', () => {
        const cue = { startMs: 0, endMs: 4000, text: 'ABCDEFGH' };
        const cur = plan.planCueSplit('cursor', cue, {}, {
            ...deps,
            getCursorIndex: () => 4,
        });
        assert.ok(!cur.error);
        assert.strictEqual(cur.cues.length, 2);

        const ph = plan.planCueSplit('playhead', cue, {}, {
            ...deps,
            hasVideo: true,
            getPlayheadMs: () => 2000,
        });
        assert.ok(!ph.error);
        assert.strictEqual(ph.cues[0].endMs, 2000);
    });

    it('connectedSplitGuard for silence', () => {
        const msg = plan.connectedSplitGuard('chars', '連続書きのテキストですよ', split, () => []);
        assert.ok(msg);
    });
});
