const assert = require('assert');
const {
    createDeferredBatchFinalize,
} = require('../electron/subtitle-batch-lifecycle');

describe('deferred batch finalize', () => {
    it('holds notify and post-task until flush', () => {
        const calls = [];
        const api = createDeferredBatchFinalize({
            notifyBatchComplete: (options, result, extra) => {
                calls.push(['notify', options.mark, result.generated, extra]);
            },
            runPostSubtitleTaskActions: (options, result) => {
                calls.push(['post', options.mark, result.generated]);
            },
        });

        api.deferBatchFinalize({ mark: 'a' }, { generated: 2, failed: 0 }, null);
        assert.deepStrictEqual(calls, []);

        const res = api.flushDeferredBatchFinalize({ summaryExtra: '仍有 1 条 QC 问题' });
        assert.strictEqual(res.ok, true);
        assert.strictEqual(res.skipped, false);
        assert.deepStrictEqual(calls, [
            ['notify', 'a', 2, '仍有 1 条 QC 问题'],
            ['post', 'a', 2],
        ]);

        const again = api.flushDeferredBatchFinalize();
        assert.strictEqual(again.skipped, true);
    });

    it('skips cancelled results', () => {
        const calls = [];
        const api = createDeferredBatchFinalize({
            notifyBatchComplete: () => calls.push('notify'),
            runPostSubtitleTaskActions: () => calls.push('post'),
        });
        api.deferBatchFinalize({}, { cancelled: true, generated: 0 }, null);
        const res = api.flushDeferredBatchFinalize();
        assert.strictEqual(res.skipped, true);
        assert.deepStrictEqual(calls, []);
    });
});
