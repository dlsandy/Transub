const assert = require('assert');
const lock = require('../electron/compute-task-lock');

function reset() {
    lock.forceRelease();
}

assert.strictEqual(lock.isBusy(), false);
assert.deepStrictEqual(lock.getStatus(), { busy: false });

const a = lock.tryAcquire({ kind: 'engine_batch', owner: '引擎', source: 'test-a' });
assert.strictEqual(a.ok, true);
assert.ok(a.token);
assert.strictEqual(lock.isBusy(), true);
assert.strictEqual(lock.getStatus().kind, 'engine_batch');
assert.match(lock.formatBusyError(), /引擎字幕任务/);

const b = lock.tryAcquire({ kind: 'advanced_smart_translate', owner: 'Advanced' });
assert.strictEqual(b.ok, false);
assert.strictEqual(b.code, 'compute_busy');
assert.match(b.error, /引擎字幕任务/);

assert.strictEqual(lock.release('wrong-token').ok, false);
assert.strictEqual(lock.release(a.token).ok, true);
assert.strictEqual(lock.isBusy(), false);

assert.strictEqual(lock.shouldSkipComputeLock({ _batchMode: true }), true);
assert.strictEqual(lock.shouldSkipComputeLock({ _engineExternalMt: true }), true);
assert.strictEqual(lock.shouldSkipComputeLock({ _skipComputeLock: true }), true);
assert.strictEqual(lock.shouldSkipComputeLock({}), false);

(async () => {
    reset();
    const nested = await lock.runWithComputeLockUnlessNested(
        { kind: 'advanced_smart_translate', owner: 'Advanced', source: 'nested' },
        { _batchMode: true },
        async () => ({ ok: true, nested: true }),
    );
    assert.deepStrictEqual(nested, { ok: true, nested: true });
    assert.strictEqual(lock.isBusy(), false);

    const first = await lock.runWithComputeLock(
        { kind: 'engine_batch', owner: '引擎', source: 'outer' },
        async () => {
            const blocked = await lock.runWithComputeLock(
                { kind: 'sakura_translate', owner: 'Sakura', source: 'inner' },
                async () => ({ ok: true }),
            );
            assert.strictEqual(blocked.ok, false);
            assert.strictEqual(blocked.code, 'compute_busy');
            return { ok: true, blocked: true };
        },
    );
    assert.strictEqual(first.ok, true);
    assert.strictEqual(lock.isBusy(), false);

    const rejected = await lock.runWithComputeLock(
        { kind: 'twai_range', owner: '字幕编辑器' },
        async () => {
            throw new Error('boom');
        },
    ).catch((err) => err);
    // runWithComputeLock does not catch — caller handles; ensure released
    assert.ok(rejected instanceof Error);
    assert.strictEqual(lock.isBusy(), false);

    // Re-run with try/finally semantics via helper that returns error objects
    const held = lock.tryAcquire({ kind: 'engine_range', owner: '字幕编辑器' });
    assert.strictEqual(held.ok, true);
    const busyRes = await lock.runWithComputeLock(
        { kind: 'advanced_reconstruct', owner: 'Advanced' },
        async () => ({ ok: true }),
    );
    assert.strictEqual(busyRes.ok, false);
    assert.strictEqual(busyRes.code, 'compute_busy');
    lock.release(held.token);

    console.log('compute-task-lock.test.js: ok');
})().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
