const assert = require('assert');
const live = require('../src/js/live-batch-queue-core');

describe('live-batch-queue-core', () => {
    it('blocks remove of the running item while batch is active', () => {
        assert.strictEqual(
            live.canRemoveTaskItem({ status: 'running' }, { running: true }),
            false,
        );
        assert.strictEqual(
            live.canRemoveTaskItem({ status: 'ready' }, { running: true }),
            true,
        );
        assert.strictEqual(
            live.canRemoveTaskItem({ status: 'done' }, { running: true }),
            true,
        );
        assert.strictEqual(
            live.canRemoveTaskItem({ status: 'ready' }, { retranslateBusy: true }),
            false,
        );
    });

    it('partitions selected rows for remove', () => {
        const items = [
            { path: 'a', selected: true, status: 'running' },
            { path: 'b', selected: true, status: 'ready' },
            { path: 'c', selected: false, status: 'ready' },
        ];
        const part = live.partitionSelectedForRemove(items, { running: true });
        assert.deepStrictEqual(part.removable.map((i) => i.path), ['b']);
        assert.deepStrictEqual(part.blocked.map((i) => i.path), ['a']);
    });

    it('only skips upcoming batch paths', () => {
        const paths = live.pathsNeedingBatchSkip([
            { path: 'a', status: 'ready' },
            { path: 'b', status: 'done' },
            { path: 'c', status: 'running' },
            { path: 'd', status: 'pending' },
            { path: 'e', status: 'failed' },
        ]);
        assert.deepStrictEqual(paths, ['a', 'd']);
    });

    it('builds append payload rows', () => {
        const rows = live.buildAppendPayloadItems(
            [{ path: 'F:/x.mp4', duration: 12.5 }],
            () => ({ language: 'ja' }),
        );
        assert.deepStrictEqual(rows, [{
            fullPath: 'F:/x.mp4',
            durationSec: 12.5,
            optionOverrides: { language: 'ja' },
        }]);
    });
});
