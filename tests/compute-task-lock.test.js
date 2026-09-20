const assert = require('assert');
const lock = require('../electron/compute-task-lock');

function reset() {
    lock.forceRelease();
}

describe('compute-task-lock', () => {
    afterEach(() => {
        reset();
    });

    it('acquires, blocks concurrent holders, and releases by token', () => {
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
    });

    it('runWithComputeLockUnlessNested skips when nested flags are set', async () => {
        const nested = await lock.runWithComputeLockUnlessNested(
            { kind: 'advanced_smart_translate', owner: 'Advanced', source: 'nested' },
            { _batchMode: true },
            async () => ({ ok: true, nested: true }),
        );
        assert.deepStrictEqual(nested, { ok: true, nested: true });
        assert.strictEqual(lock.isBusy(), false);
    });

    it('runWithComputeLock blocks re-entry and always releases on throw', async () => {
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
        assert.ok(rejected instanceof Error);
        assert.strictEqual(lock.isBusy(), false);

        const held = lock.tryAcquire({ kind: 'engine_range', owner: '字幕编辑器' });
        assert.strictEqual(held.ok, true);
        const busyRes = await lock.runWithComputeLock(
            { kind: 'advanced_reconstruct', owner: 'Advanced' },
            async () => ({ ok: true }),
        );
        assert.strictEqual(busyRes.ok, false);
        assert.strictEqual(busyRes.code, 'compute_busy');
        lock.release(held.token);
    });

    it('forceRelease reports released when only a pinned engine URL exists', () => {
        lock.__resetEngineLockCacheForTests?.();
        lock.setEngineLockBaseUrl('http://127.0.0.1:9');
        const res = lock.forceRelease();
        assert.strictEqual(res.ok, true);
        assert.strictEqual(res.released, true);
        lock.__resetEngineLockCacheForTests?.();
    });

    it('getStatus trusts local holder without remote probe', () => {
        lock.__resetEngineLockCacheForTests?.();
        // Pin a dead URL — if getStatus still probed, this would hang or fail oddly.
        lock.setEngineLockBaseUrl('http://127.0.0.1:9');
        const a = lock.tryAcquire({ kind: 'engine_batch', owner: '引擎', forceLocal: true });
        assert.strictEqual(a.ok, true);
        const t0 = Date.now();
        const st = lock.getStatus();
        assert.ok(Date.now() - t0 < 200);
        assert.strictEqual(st.busy, true);
        assert.strictEqual(st.kind, 'engine_batch');
        lock.release(a.token);
        lock.__resetEngineLockCacheForTests?.();
    });

    it('getLocalStatus never probes a pinned engine URL', () => {
        lock.__resetEngineLockCacheForTests?.();
        lock.setEngineLockBaseUrl('http://127.0.0.1:9');
        assert.deepStrictEqual(lock.getLocalStatus(), { busy: false });
        const a = lock.tryAcquire({ kind: 'sakura_translate', owner: 'Sakura', forceLocal: true });
        assert.strictEqual(a.ok, true);
        const t0 = Date.now();
        const st = lock.getLocalStatus();
        assert.ok(Date.now() - t0 < 50);
        assert.strictEqual(st.busy, true);
        assert.strictEqual(st.kind, 'sakura_translate');
        lock.release(a.token);
        lock.__resetEngineLockCacheForTests?.();
    });
});
