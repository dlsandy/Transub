const assert = require('assert');
const filter = require('../src/js/subtitle-editor/batch-cue-filter-plan');

describe('batch-cue-filter-plan', () => {
    const deps = {
        getCps: (c) => (c.text.length / ((c.endMs - c.startMs) / 1000)),
        getCueDurMs: (c) => c.endMs - c.startMs,
        charLen: (s) => s.length,
        lineLen: (s) => s.length,
        selectedIndex: 1,
        canSilenceSplitCue: (c) => String(c.text || '').includes(' '),
    };

    it('smart split match + preview', () => {
        const cues = [
            { startMs: 0, endMs: 1000, text: 'short' },
            { startMs: 1000, endMs: 5000, text: 'this is a very long line of text indeed' },
        ];
        assert.strictEqual(
            filter.cueMatchesSmartSplitCondition(cues[1], 1, { condition: 'chars_long', charsLong: 10 }, deps),
            true,
        );
        const matched = filter.collectSmartSplitMatches(cues, { condition: 'selected' }, deps);
        assert.deepStrictEqual(matched, [1]);

        const preview = filter.previewSmartSplitPlan(
            [1],
            cues,
            { smartMaxChars: 12, smartLineChars: 12, useCps: true },
            () => ({ cues: [{}, {}] }),
        );
        assert.strictEqual(preview.splitCount, 1);
        assert.ok(preview.summary.includes('分割'));
    });

    it('silence split + smart adjust summary', () => {
        const cues = [
            { startMs: 0, endMs: 4000, text: 'hello world' },
            { startMs: 0, endMs: 4000, text: 'nospace' },
        ];
        const matched = filter.collectSilenceSplitMatches(cues, { condition: 'all' }, deps);
        assert.deepStrictEqual(matched, [0]);

        const prev = filter.previewSilenceSplitPlan({
            matchedIndexes: matched,
            hasVideo: true,
            hasFfmpegDetectSilence: true,
            condition: { condition: 'all' },
        });
        assert.strictEqual(prev.isErr, false);

        const adj = filter.previewSmartAdjustSummary({
            affected: 3,
            overlapFixed: 1,
            cpsFixed: 2,
        });
        assert.ok(adj.summary.includes('重合'));
    });
});
