const assert = require('assert');
const plan = require('../src/js/subtitle-editor/audio-snap-duration-plan');

describe('audio-snap-duration-plan', () => {
    it('eligibility thresholds', () => {
        const dur = (c) => c.endMs - c.startMs;
        assert.strictEqual(plan.isEligibleForSmartDuration({ startMs: 0, endMs: 500 }, dur), false);
        assert.strictEqual(plan.isEligibleForSmartDuration({ startMs: 0, endMs: 600 }, dur), true);
        assert.strictEqual(plan.isEligibleForAudioSnap({ startMs: 0, endMs: 250 }, dur), false);
        assert.strictEqual(plan.isEligibleForAudioSnap({ startMs: 0, endMs: 300 }, dur), true);
    });

    it('clampEndMsAvoidOverlap respects next cue and allowNextClamp', () => {
        const cues = [
            { startMs: 0, endMs: 1000 },
            { startMs: 2000, endMs: 3000 },
        ];
        assert.strictEqual(
            plan.clampEndMsAvoidOverlap(cues[0], 0, 2500, cues, { gapMs: 1, minDurMs: 500 }),
            1999,
        );
        assert.strictEqual(
            plan.clampEndMsAvoidOverlap(cues[0], 0, 2500, cues, {
                gapMs: 1,
                minDurMs: 500,
                allowNextClamp: false,
            }),
            2500,
        );
        assert.strictEqual(
            plan.clampEndMsAvoidOverlap(cues[0], 0, 100, cues, { minDurMs: 500 }),
            500,
        );
    });

    it('cueMatchesBatchDurCondition covers common filters', () => {
        const cue = { startMs: 0, endMs: 2000, text: 'hello world' };
        assert.strictEqual(plan.cueMatchesBatchDurCondition(cue, 0, { condition: 'all' }), true);
        assert.strictEqual(
            plan.cueMatchesBatchDurCondition(cue, 0, { condition: 'shorter', shorterSec: 3 }),
            true,
        );
        assert.strictEqual(
            plan.cueMatchesBatchDurCondition(cue, 0, { condition: 'text_contains', textKeyword: 'world' }),
            true,
        );
        assert.strictEqual(
            plan.cueMatchesBatchDurCondition(cue, 1, { condition: 'selected' }, {
                selectedIndexes: [1],
            }),
            true,
        );
    });

    it('planSmartDurationFromSilence guards and adjusts', async () => {
        const noVideo = await plan.planSmartDurationFromSilence(
            { startMs: 0, endMs: 2000 },
            {},
            { videoPath: '', splitApi: {} },
        );
        assert.ok(noVideo.error);

        const result = await plan.planSmartDurationFromSilence(
            { startMs: 0, endMs: 1000 },
            { minShiftMs: 40, padMs: 1500 },
            {
                videoPath: 'a.mp4',
                cues: [{ startMs: 0, endMs: 1000 }, { startMs: 5000, endMs: 6000 }],
                cueIndex: 0,
                splitApi: {
                    snapCueTimingFromSilenceIntervals: () => ({
                        region: { endMs: 1800 },
                        changed: true,
                        endMs: 1800,
                    }),
                },
                detectSilence: async () => ({
                    ok: true,
                    intervals: [{ startMs: 1900, endMs: 2100 }],
                }),
            },
        );
        assert.ok(!result.error, result.error);
        assert.ok(result.newEndMs > 1000);
    });
});
