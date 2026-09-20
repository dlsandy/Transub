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

    it('batch retranslate text condition matches equals / ellipsis family', () => {
        const cues = [
            { startMs: 0, endMs: 1000, text: '你好' },
            { startMs: 1000, endMs: 2000, text: '…' },
            { startMs: 2000, endMs: 3000, text: '...' },
            { startMs: 3000, endMs: 4000, text: '' },
            { startMs: 4000, endMs: 5000, text: '说…话' },
        ];
        const matched = filter.collectRetranslateTextMatches(cues, {
            pattern: '...',
            matchMode: 'equals',
        });
        assert.deepStrictEqual(matched, [1, 2, 3]);

        const contains = filter.collectRetranslateTextMatches(cues, {
            pattern: '…',
            matchMode: 'contains',
        });
        assert.deepStrictEqual(contains, [1, 4]);

        const preview = filter.previewBatchRetranslatePlan({
            matchedIndexes: matched,
            pattern: '...',
            engine: 'llm',
        });
        assert.strictEqual(preview.isErr, false);
        assert.strictEqual(preview.matched, 3);
        assert.ok(preview.summary.includes('推理翻译'));
    });

    it('batch delete plan applies indexes and remaps selection', () => {
        const cues = [
            { text: 'a' },
            { text: '…' },
            { text: 'b' },
            { text: '...' },
        ];
        const matched = filter.collectRetranslateTextMatches(cues, { pattern: '…', matchMode: 'equals' });
        assert.deepStrictEqual(matched, [1, 3]);
        const preview = filter.previewBatchDeletePlan({
            matchedIndexes: matched,
            pattern: '…',
            totalCues: cues.length,
        });
        assert.strictEqual(preview.isErr, false);
        assert.strictEqual(preview.remaining, 2);
        assert.ok(preview.summary.includes('删除'));

        const applied = filter.applyDeleteCueIndexes(cues, matched);
        assert.strictEqual(applied.removed, 2);
        assert.deepStrictEqual(applied.cues.map((c) => c.text), ['a', 'b']);
        assert.strictEqual(filter.nextSelectedIndexAfterDelete(1, matched, 2), 1);
        assert.strictEqual(filter.nextSelectedIndexAfterDelete(2, matched, 2), 1);
    });
});
