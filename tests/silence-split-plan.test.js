const assert = require('assert');
const split = require('../src/js/subtitle-split-core');
const silence = require('../src/js/subtitle-editor/silence-split-plan');

describe('silence-split-plan', () => {
    it('buildSilenceDetectPasses relaxes thresholds', () => {
        const passes = silence.buildSilenceDetectPasses(-30, 0.12, 2000);
        assert.ok(passes.length >= 3);
        assert.ok(passes[0].noise <= passes[passes.length - 1].noise
            || passes[passes.length - 1].noise === -22);
    });

    it('guards empty / short / no video', async () => {
        const noVideo = await silence.planSilenceCueSplit(
            { startMs: 0, endMs: 2000, text: 'hello world' },
            {},
            { splitApi: split, videoPath: '' },
        );
        assert.ok(noVideo.error);

        const empty = await silence.planSilenceCueSplit(
            { startMs: 0, endMs: 2000, text: '  ' },
            {},
            { splitApi: split, videoPath: 'a.mp4', detectSilence: async () => ({ ok: false }) },
        );
        assert.ok(empty.error);

        const short = await silence.planSilenceCueSplit(
            { startMs: 0, endMs: 100, text: 'hello world' },
            {},
            { splitApi: split, videoPath: 'a.mp4', detectSilence: async () => ({ ok: false }) },
        );
        assert.ok(short.error.includes('过短'));
    });

    it('multi-pass detect then build cues', async () => {
        let calls = 0;
        const result = await silence.planSilenceCueSplit(
            { startMs: 0, endMs: 4000, text: 'hello world foo bar' },
            { silenceDb: -30, silenceDur: 0.12 },
            {
                splitApi: split,
                videoPath: 'a.mp4',
                getBreakWords: () => [],
                detectSilence: async () => {
                    calls += 1;
                    if (calls === 1) return { ok: false, error: 'pass1' };
                    return {
                        ok: true,
                        intervals: [{ startMs: 1800, endMs: 2200 }],
                        splitPointsMs: [2000],
                    };
                },
            },
        );
        assert.ok(!result.error, result.error);
        assert.ok(result.cues.length >= 2);
        assert.ok(result.meta.splitCount >= 1);
        assert.ok(calls >= 2);
    });

    it('cancel mid-loop', async () => {
        let n = 0;
        const result = await silence.planSilenceCueSplit(
            { startMs: 0, endMs: 4000, text: 'hello world' },
            {},
            {
                splitApi: split,
                videoPath: 'a.mp4',
                isCancelled: () => (++n) > 1,
                detectSilence: async () => ({ ok: false, error: 'x' }),
            },
        );
        assert.strictEqual(result.cancelled, true);
    });
});
