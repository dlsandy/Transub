const assert = require('assert');
const lock = require('../electron/compute-task-lock');
const {
    hasActiveTask,
    getActiveTaskLabel,
} = require('../electron/active-task-guard');

describe('active-task-guard', () => {
    beforeEach(() => {
        lock.forceRelease();
    });

    afterEach(() => {
        lock.forceRelease();
    });

    it('reports idle when no compute lock', () => {
        assert.strictEqual(hasActiveTask(), false);
        assert.strictEqual(getActiveTaskLabel(), '任务');
    });

    it('follows compute lock kind labels', () => {
        const a = lock.tryAcquire({ kind: 'engine_batch', owner: '引擎', source: 'close-guard' });
        assert.strictEqual(a.ok, true);
        assert.strictEqual(hasActiveTask(), true);
        assert.strictEqual(getActiveTaskLabel(), '引擎字幕任务');
        lock.release(a.token);
        assert.strictEqual(hasActiveTask(), false);

        const b = lock.tryAcquire({ kind: 'advanced_reconstruct', owner: 'Advanced' });
        assert.strictEqual(b.ok, true);
        assert.strictEqual(hasActiveTask(), true);
        assert.strictEqual(getActiveTaskLabel(), '语境重构');
        lock.release(b.token);
    });
});
