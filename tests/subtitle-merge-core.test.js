const {
    canMergeSelectedIndexes,
    planMergeSelectedCues,
    applyMergeSelectedCues,
    dedupeJoinCueTexts,
} = require('../src/js/subtitle-merge-core.js');

describe('subtitle-merge-core', () => {
    const cues = () => ([
        { startMs: 0, endMs: 1000, text: 'A' },
        { startMs: 1000, endMs: 2500, text: 'B' },
        { startMs: 2500, endMs: 4000, text: 'C' },
        { startMs: 4000, endMs: 5000, text: 'D' },
    ]);

    it('requires at least two consecutive indexes', () => {
        expect(canMergeSelectedIndexes([0], 4)).toBe(false);
        expect(canMergeSelectedIndexes([0, 2], 4)).toBe(false);
        expect(canMergeSelectedIndexes([0, 1], 4)).toBe(true);
        expect(canMergeSelectedIndexes(['1', '2'], 4)).toBe(true);
    });

    it('merges text and keeps first start + last end', () => {
        const plan = planMergeSelectedCues(cues(), [0, 1, 2]);
        expect(plan.error).toBeUndefined();
        expect(plan.cues).toHaveLength(2);
        expect(plan.cues[0]).toMatchObject({
            startMs: 0,
            endMs: 4000,
            text: 'A\nB\nC',
        });
        expect(plan.cues[1]).toMatchObject({ text: 'D' });
        expect(plan.removedCount).toBe(2);
        expect(plan.deleteCount).toBe(3);
    });

    it('applyMergeSelectedCues deletes merged-away rows in place', () => {
        const list = cues();
        const result = applyMergeSelectedCues(list, [1, 2]);
        expect(result.error).toBeUndefined();
        expect(list).toBe(result.cues);
        expect(list).toHaveLength(3);
        expect(list.map((c) => c.text)).toEqual(['A', 'B\nC', 'D']);
        expect(list[1].endMs).toBe(4000);
    });

    it('preserves extra fields from the first cue', () => {
        const withAss = [
            { startMs: 0, endMs: 1000, text: 'A', ass: { style: 'Main' } },
            { startMs: 1000, endMs: 2000, text: 'B', ass: { style: 'Alt' } },
        ];
        applyMergeSelectedCues(withAss, [0, 1]);
        expect(withAss).toHaveLength(1);
        expect(withAss[0].ass).toEqual({ style: 'Main' });
    });

    it('dedupeJoinCueTexts drops exact and prefix-subset duplicates', () => {
        expect(dedupeJoinCueTexts(['会融化的', '会融化的'])).toBe('会融化的');
        expect(dedupeJoinCueTexts(['脸蛋好可爱', '脸蛋好可爱啊'])).toBe('脸蛋好可爱啊');
        expect(dedupeJoinCueTexts(['完整一句啊', '完整一句'])).toBe('完整一句啊');
        expect(dedupeJoinCueTexts(['甲', '乙'], ' ')).toBe('甲 乙');
    });

    it('merge drops duplicate identical lines', () => {
        const list = [
            { startMs: 0, endMs: 1000, text: '会融化的' },
            { startMs: 1000, endMs: 2000, text: '会融化的' },
            { startMs: 2000, endMs: 3000, text: '下一句' },
        ];
        const plan = planMergeSelectedCues(list, [0, 1]);
        expect(plan.cues[0].text).toBe('会融化的');
        expect(plan.cues[1].text).toBe('下一句');
    });
});
