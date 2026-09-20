const assert = require('assert');
const { resolveQwenAsrBatchModeForJob } = require('../electron/engine-qwen-batch');

describe('engine-qwen-batch', () => {
    it('resolveQwenAsrBatchModeForJob normalizes mode', () => {
        assert.strictEqual(
            resolveQwenAsrBatchModeForJob({ qwenAsrBatchMode: 'fast' }),
            'aggressive',
        );
    });

    it('resolveQwenAsrBatchModeForJob downgrades to conservative on speed profile', () => {
        assert.strictEqual(
            resolveQwenAsrBatchModeForJob({
                qwenAsrBatchMode: 'aggressive',
                perfProfile: 'speed',
            }),
            'conservative',
        );
    });
});
