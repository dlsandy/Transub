const assert = require('assert');
const path = require('path');
const {
    shouldRehydrateFromSnapshot,
    buildItemsFromLiveBatchSnapshot,
    applyLiveBatchSnapshotToState,
    createLiveBatchRehydrate,
} = require('../src/js/live-batch-rehydrate-core');

describe('live-batch-rehydrate-core', () => {
    const a = path.resolve('a.mp4');
    const b = path.resolve('b.mp4');

    it('shouldRehydrate only when active batch and empty items', () => {
        assert.strictEqual(shouldRehydrateFromSnapshot(null, { items: [] }), false);
        assert.strictEqual(shouldRehydrateFromSnapshot({ active: false, paths: [a] }, { items: [] }), false);
        assert.strictEqual(shouldRehydrateFromSnapshot({ active: true, paths: [] }, { items: [] }), false);
        assert.strictEqual(
            shouldRehydrateFromSnapshot({ active: true, paths: [a] }, { items: [{ path: a }] }),
            false,
        );
        assert.strictEqual(
            shouldRehydrateFromSnapshot({ active: true, paths: [a] }, { items: [] }),
            true,
        );
    });

    it('builds pending/running/skipped rows from snapshot', () => {
        const items = buildItemsFromLiveBatchSnapshot({
            paths: [a, b],
            current: a,
            skipped: [b],
        }, {
            normPath: (p) => String(p || '').trim().toLowerCase(),
        });
        assert.strictEqual(items.length, 2);
        assert.strictEqual(items[0].status, 'running');
        assert.strictEqual(items[0].path, a);
        assert.strictEqual(items[1].status, 'skipped');
    });

    it('applyLiveBatchSnapshotToState restores empty list', () => {
        const state = { items: [], running: false, total: 0, index: 0, activePath: '' };
        const ok = applyLiveBatchSnapshotToState(state, {
            active: true,
            paths: [a, b],
            current: b,
            currentIndex1: 2,
            total: 2,
            skipped: [],
        });
        assert.strictEqual(ok, true);
        assert.strictEqual(state.running, true);
        assert.strictEqual(state.items.length, 2);
        assert.strictEqual(state.items[1].status, 'running');
        assert.strictEqual(state.activePath, b);
        assert.strictEqual(state.index, 2);
    });

    it('createLiveBatchRehydrate fetches snapshot and restores UI hooks', async () => {
        const state = { items: [], running: false, total: 0 };
        let rendered = 0;
        const api = createLiveBatchRehydrate({
            state,
            electron: {
                transubLiveBatchSnapshot: async () => ({
                    ok: true,
                    active: true,
                    paths: [a],
                    current: a,
                    currentIndex1: 1,
                    total: 1,
                    skipped: [],
                }),
            },
            renderList: () => { rendered += 1; },
            updateProgressUi: () => {},
            updateStartButton: () => {},
            setBadge: () => {},
            startElapsedTicker: () => {},
            appendLog: () => {},
        });
        const ok = await api.rehydrateFromLiveBatchIfNeeded();
        assert.strictEqual(ok, true);
        assert.strictEqual(state.items.length, 1);
        assert.strictEqual(rendered, 1);
    });
});
