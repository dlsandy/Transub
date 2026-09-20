const assert = require('assert');
const tab = require('../src/js/factory-task-tab-core');

describe('factory-task-tab-core', () => {
    it('normalizeTab defaults to all', () => {
        assert.strictEqual(tab.normalizeTab('all'), 'all');
        assert.strictEqual(tab.normalizeTab('done'), 'done');
        assert.strictEqual(tab.normalizeTab('active'), 'active');
        assert.strictEqual(tab.normalizeTab('failed'), 'failed');
        assert.strictEqual(tab.normalizeTab(''), 'all');
        assert.strictEqual(tab.normalizeTab(null), 'all');
    });

    it('classifyTaskTab: done / failed / active', () => {
        assert.strictEqual(tab.classifyTaskTab('done'), 'done');
        for (const s of ['failed', 'error', 'cancelled']) {
            assert.strictEqual(tab.classifyTaskTab(s), 'failed');
        }
        for (const s of ['pending', 'ready', 'running', 'skipped', 'probing', '']) {
            assert.strictEqual(tab.classifyTaskTab(s), 'active');
        }
    });

    it('itemMatchesTab / filter / count', () => {
        const items = [
            { status: 'running' },
            { status: 'done' },
            { status: 'failed' },
            { status: 'done' },
            { status: 'pending' },
            { status: 'error' },
        ];
        assert.strictEqual(tab.itemMatchesTab(items[0], 'active'), true);
        assert.strictEqual(tab.itemMatchesTab(items[1], 'done'), true);
        assert.strictEqual(tab.itemMatchesTab(items[2], 'failed'), true);
        assert.strictEqual(tab.itemMatchesTab(items[1], 'all'), true);
        assert.deepStrictEqual(tab.filterIndicesForTab(items, 'done'), [1, 3]);
        assert.deepStrictEqual(tab.filterIndicesForTab(items, 'failed'), [2, 5]);
        assert.deepStrictEqual(tab.filterIndicesForTab(items, 'all'), [0, 1, 2, 3, 4, 5]);
        assert.deepStrictEqual(
            tab.filterItemsForTab(items, 'active').map((i) => i.status),
            ['running', 'pending'],
        );
        assert.deepStrictEqual(tab.countTabs(items), {
            all: 6,
            active: 2,
            done: 2,
            failed: 2,
            running: 1,
            total: 6,
        });
    });

    it('buildTabsSummary', () => {
        assert.strictEqual(
            tab.buildTabsSummary({ total: 12, running: 1, engineLabel: '就绪' }),
            '12 个任务 · 1 运行中 · Engine 就绪',
        );
    });
});
