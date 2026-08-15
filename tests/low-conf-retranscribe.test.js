const assert = require('assert');
require('../src/js/subtitle-qc-smart-core');
const { installLowConfRetranscribe } = require('../src/js/subtitle-editor/low-conf-retranscribe');

describe('low-conf-retranscribe editor part', () => {
    it('plans merged ranges from cueMeta.low', () => {
        const state = {
            videoPath: 'x.mp4',
            cues: [
                { startMs: 0, endMs: 1000, text: 'a' },
                { startMs: 1100, endMs: 2000, text: 'b' },
                { startMs: 5000, endMs: 6000, text: 'c' },
            ],
            cueMeta: [{ low: true }, { low: true }, { low: false }],
        };
        const api = installLowConfRetranscribe({
            state,
            els: {},
            setStatus: () => {},
        });
        const indexes = api.collectLowConfIndexes(50);
        assert.deepStrictEqual(indexes, [0, 1]);
        const planned = api.planRanges(indexes);
        assert.strictEqual(planned.cueCount, 2);
        assert.strictEqual(planned.rangeCount, 1);
    });
});
