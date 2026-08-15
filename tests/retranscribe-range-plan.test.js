const assert = require('assert');
const plan = require('../src/js/subtitle-editor/retranscribe-range-plan');

describe('retranscribe-range-plan', () => {
    it('abort helpers', () => {
        assert.ok(plan.friendlyJobAbortMessage('Aborted').includes('中止'));
        assert.strictEqual(plan.isJobAbortResult({ cancelled: true }), true);
        assert.strictEqual(plan.isJobAbortResult({ error: 'ok' }), false);
    });

    it('plans duration / full media windows', () => {
        const dur = plan.planDurationWindow({
            durationSec: 10,
            padMs: 350,
            startMode: 'selected',
            selectedStartMs: 5000,
            playheadMs: 100,
        });
        assert.strictEqual(dur.startMs, 5000);
        assert.strictEqual(dur.endMs, 15000);

        const full = plan.planFullMediaWindow({
            padMs: 400,
            videoDurationMs: 0,
            cueEndMsList: [1000, 9000],
        });
        assert.strictEqual(full.startMs, 0);
        assert.strictEqual(full.endMs, 9000);
        assert.strictEqual(full.padMs, 400);
    });

    it('preview / progress / collect / splice', () => {
        const suffix = plan.resolveRetranscribeWriteSuffix({ writeAs: 'target', hasDual: true });
        assert.ok(suffix.includes('译文'));
        const text = plan.buildRetranscribeDurPreviewText({
            startLabel: '0:00',
            endLabel: '0:10',
            durationSec: 10,
            overlapCount: 2,
            writeSuffix: suffix,
        });
        assert.ok(text.includes('替换重合的 2 条'));

        const ui = plan.mapRetranscribeProgressUi(
            { stage: 'model', message: '加载模型中' },
            { dualPass: false, task: 'transcribe', fallbackTitle: '重转写' },
        );
        assert.strictEqual(ui.title, '加载模型');

        const sources = plan.collectSourceCuesForRange({
            mode: 'range',
            startMs: 0,
            endMs: 2000,
            cues: [
                { startMs: 0, endMs: 1000, text: 'a' },
                { startMs: 3000, endMs: 4000, text: 'b' },
            ],
            getEndMs: (c) => c.endMs,
        });
        assert.strictEqual(sources.length, 1);

        const list = [
            { startMs: 0, endMs: 1000, text: 'old' },
            { startMs: 2000, endMs: 3000, text: 'keep' },
        ];
        const spliced = plan.spliceCuesForRetranscribe(list, 0, 1500, [
            { startMs: 0, endMs: 1200, text: 'new' },
        ], {
            mode: 'range',
            replaceCuesInTimeRange: (cues, start, end, next) => ({
                cues: [...next, cues[1]],
                insertAt: 0,
                replaced: 1,
            }),
        });
        assert.strictEqual(spliced.replacedCount, 1);
        assert.strictEqual(list[0].text, 'new');
    });
});
