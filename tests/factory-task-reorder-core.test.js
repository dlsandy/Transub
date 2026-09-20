const assert = require('assert');
const reorder = require('../src/js/factory-task-reorder-core');

describe('factory-task-reorder-core', () => {
    it('moveItem reorders without mutating source', () => {
        const src = ['a', 'b', 'c', 'd'];
        assert.deepStrictEqual(reorder.moveItem(src, 0, 2), ['b', 'c', 'a', 'd']);
        assert.deepStrictEqual(reorder.moveItem(src, 3, 0), ['d', 'a', 'b', 'c']);
        assert.deepStrictEqual(reorder.moveItem(src, 1, 1), ['a', 'b', 'c', 'd']);
        assert.deepStrictEqual(src, ['a', 'b', 'c', 'd']);
    });

    it('moveItem ignores bad indices', () => {
        assert.deepStrictEqual(reorder.moveItem(['a', 'b'], -1, 0), ['a', 'b']);
        assert.deepStrictEqual(reorder.moveItem(['a', 'b'], 9, 0), ['a', 'b']);
    });

    it('isTaskReorderDrag detects custom MIME', () => {
        assert.strictEqual(reorder.isTaskReorderDrag(null), false);
        assert.strictEqual(
            reorder.isTaskReorderDrag({ types: ['text/plain'] }),
            false,
        );
        assert.strictEqual(
            reorder.isTaskReorderDrag({ types: [reorder.TASK_REORDER_MIME, 'text/plain'] }),
            true,
        );
    });

    it('bindCardListDrag lets external file drops bubble (no stopPropagation)', () => {
        const listeners = Object.create(null);
        const listEl = {
            dataset: {},
            contains() { return true; },
            querySelectorAll() { return []; },
            addEventListener(type, fn) {
                (listeners[type] || (listeners[type] = [])).push(fn);
            },
        };
        reorder.bindCardListDrag(listEl, {});
        assert.ok(listeners.drop && listeners.drop.length === 1);

        let stopped = false;
        let prevented = false;
        listeners.drop[0]({
            preventDefault() { prevented = true; },
            stopPropagation() { stopped = true; },
        });
        assert.strictEqual(stopped, false, 'external drop must bubble to media intake');
        assert.strictEqual(prevented, false);
    });
});
