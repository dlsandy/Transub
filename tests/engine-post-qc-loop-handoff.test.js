const assert = require('assert');
const { runPostQcLoopHandoff } = require('../electron/engine-post-qc-loop-handoff');

describe('engine-post-qc-loop-handoff cancel', () => {
    it('returns cancelled before planning when shouldStop', async () => {
        const res = await runPostQcLoopHandoff({
            shouldStop: () => true,
            options: { qualityPipelineMode: 'on', perfProfile: 'quality' },
            item: { targetSubtitlePath: 'a.zh.srt' },
        });
        assert.strictEqual(res.cancelled, true);
        assert.strictEqual(res.code, 'cancelled');
    });

    it('returns cancelled when abort signal is aborted', async () => {
        const ctrl = new AbortController();
        ctrl.abort();
        const res = await runPostQcLoopHandoff({
            signal: ctrl.signal,
            options: { qualityPipelineMode: 'on' },
        });
        assert.strictEqual(res.cancelled, true);
    });
});
