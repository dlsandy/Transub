const assert = require('assert');
const {
    isEngineComputeKind,
    decideEngineEnsureAction,
} = require('../electron/engine-ensure-policy');

describe('engine-ensure-policy', () => {
    it('recognizes engine compute kinds', () => {
        assert.strictEqual(isEngineComputeKind('engine_batch'), true);
        assert.strictEqual(isEngineComputeKind('engine_range'), true);
        assert.strictEqual(isEngineComputeKind('advanced_smart_translate'), false);
        assert.strictEqual(isEngineComputeKind(''), false);
    });

    it('blocks kill/restart while batchRunning even if health would fail', () => {
        const d = decideEngineEnsureAction({
            batchRunning: true,
            childAlive: true,
            forceRestart: false,
        });
        assert.strictEqual(d.allowKill, false);
        assert.strictEqual(d.allowForceRestart, false);
        assert.strictEqual(d.treatAsRunning, true);
        assert.strictEqual(d.reason, 'compute_busy');
    });

    it('blocks forceRestart during engine_range lock', () => {
        const d = decideEngineEnsureAction({
            forceRestart: true,
            computeBusyKind: 'engine_range',
            childAlive: true,
        });
        assert.strictEqual(d.allowKill, false);
        assert.strictEqual(d.allowForceRestart, false);
        assert.strictEqual(d.reason, 'compute_busy_restart');
    });

    it('allows kill when idle', () => {
        const d = decideEngineEnsureAction({
            batchRunning: false,
            childAlive: true,
            forceRestart: true,
        });
        assert.strictEqual(d.allowKill, true);
        assert.strictEqual(d.allowForceRestart, true);
        assert.strictEqual(d.reason, 'idle');
    });

    it('does not treat as running when busy but child already gone', () => {
        const d = decideEngineEnsureAction({
            batchRunning: true,
            childAlive: false,
        });
        assert.strictEqual(d.allowKill, true);
        assert.strictEqual(d.allowForceRestart, true);
        assert.strictEqual(d.treatAsRunning, false);
        assert.strictEqual(d.reason, 'dead_child_respawn');
    });

    it('allows forceRestart when child died mid engine_range', () => {
        const d = decideEngineEnsureAction({
            forceRestart: true,
            computeBusyKind: 'engine_range',
            childAlive: false,
            batchRunning: true,
        });
        assert.strictEqual(d.allowForceRestart, true);
        assert.strictEqual(d.reason, 'dead_child_respawn');
    });
});
