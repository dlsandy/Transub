const assert = require('assert');
const {
    createSenseQueue,
    evaluateSenseDrainGate,
    SENSE_CONCURRENCY_QUICK,
    SENSE_CONCURRENCY_DEEP,
} = require('../src/js/sense-queue-core');
const {
    TASK_STATUS_SORT_RANK,
    listSortValue,
    compareListSortValues,
    nextListSortState,
    sortTaskItems,
} = require('../src/js/task-list-sort-core');

describe('sense-queue-core', () => {
    it('exposes default concurrency', () => {
        assert.strictEqual(SENSE_CONCURRENCY_QUICK, 4);
        assert.strictEqual(SENSE_CONCURRENCY_DEEP, 1);
    });

    it('evaluateSenseDrainGate blocks deep while quick runs', () => {
        const gate = evaluateSenseDrainGate(
            { opts: { deep: true } },
            { senseRunning: 1, senseDeepRunning: 0 },
        );
        assert.strictEqual(gate.canStart, false);
        assert.strictEqual(gate.wantDeep, true);
    });

    it('queues jobs and respects enabled / instant', async () => {
        const ran = [];
        let idle = 0;
        const q = createSenseQueue({
            quickLimit: 2,
            deepLimit: 1,
            isEnabled: () => true,
            tryInstant: (item) => item.path === 'instant.mp4',
            runJob: async (item) => {
                ran.push(item.path);
                await new Promise((r) => setTimeout(r, 5));
            },
            onIdle: () => { idle += 1; },
        });
        assert.strictEqual(q.enqueue({ path: 'instant.mp4' }), true);
        assert.deepStrictEqual(ran, []);
        q.enqueue({ path: 'a.mp4' });
        q.enqueue({ path: 'b.mp4' });
        await new Promise((r) => setTimeout(r, 40));
        assert.ok(ran.includes('a.mp4'));
        assert.ok(ran.includes('b.mp4'));
        assert.ok(idle >= 1);
    });

    it('skips enqueue when disabled unless force', () => {
        const ran = [];
        const q = createSenseQueue({
            isEnabled: () => false,
            runJob: async (item) => { ran.push(item.path); },
        });
        assert.strictEqual(q.enqueue({ path: 'x.mp4' }), false);
        assert.strictEqual(q.enqueue({ path: 'y.mp4' }, { force: true }), true);
    });
});

describe('task-list-sort-core', () => {
    const helpers = {
        basename: (p) => String(p || '').split(/[/\\]/).pop() || '',
        itemElapsedSec: (item) => Number(item.elapsed) || 0,
    };

    it('ranks status and sorts files', () => {
        assert.strictEqual(TASK_STATUS_SORT_RANK.running, 3);
        assert.strictEqual(
            listSortValue({ path: 'Z:/B.mp4', status: 'done' }, 'status', helpers),
            TASK_STATUS_SORT_RANK.done,
        );
        const items = [
            { path: 'b.mp4', duration: 10, status: 'ready' },
            { path: 'a.mp4', duration: 30, status: 'ready' },
        ];
        const sorted = sortTaskItems(items, { key: 'file', dir: 'asc' }, helpers);
        assert.strictEqual(sorted.items[0].path, 'a.mp4');
        assert.strictEqual(sorted.changed, true);
    });

    it('compares numeric columns and toggles sort dir', () => {
        const a = { path: 'a.mp4', duration: 10 };
        const b = { path: 'b.mp4', duration: 20 };
        assert.ok(compareListSortValues(a, b, 'duration', helpers) < 0);
        assert.deepStrictEqual(nextListSortState(null, 'file'), { key: 'file', dir: 'asc' });
        assert.deepStrictEqual(
            nextListSortState({ key: 'file', dir: 'asc' }, 'file'),
            { key: 'file', dir: 'desc' },
        );
    });

    it('progress falls back to processed ratio', () => {
        const v = listSortValue(
            { path: 'a.mp4', duration: 100, processedSec: 25 },
            'progress',
            helpers,
        );
        assert.strictEqual(v, 25);
    });
});
