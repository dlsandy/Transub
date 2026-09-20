'use strict';

const assert = require('assert');
const {
    createTaskListActionsUi,
    DEFAULT_TASK_TABLE_COLS,
    DEFAULT_STATUS_SORT_RANK,
} = require('../src/js/task-list-actions-ui-core.js');

function makeClassList(initial = []) {
    const set = new Set(initial);
    return {
        add(...names) { names.forEach((n) => set.add(n)); },
        remove(...names) { names.forEach((n) => set.delete(n)); },
        toggle(name, force) {
            if (force === true) set.add(name);
            else if (force === false) set.delete(name);
            else if (set.has(name)) set.delete(name);
            else set.add(name);
            return set.has(name);
        },
        contains(name) { return set.has(name); },
    };
}

describe('TransubTaskListActionsUi', () => {
    it('exports createTaskListActionsUi', () => {
        assert.strictEqual(typeof createTaskListActionsUi, 'function');
        assert.ok(Array.isArray(DEFAULT_TASK_TABLE_COLS));
        assert.strictEqual(typeof DEFAULT_STATUS_SORT_RANK, 'object');
    });

    it('applyListSortInPlace sorts by file asc without throwing', () => {
        const a = { path: 'Z:/b.mp4', status: 'ready' };
        const b = { path: 'Z:/a.mp4', status: 'ready' };
        const state = {
            items: [a, b],
            listSort: { key: 'file', dir: 'asc' },
        };
        const ui = createTaskListActionsUi({
            state,
            els: {},
            basename: (p) => String(p || '').split(/[/\\]/).pop() || '',
            itemElapsedSec: () => 0,
        });

        assert.doesNotThrow(() => ui.applyListSortInPlace());
        assert.strictEqual(state.items[0], b);
        assert.strictEqual(state.items[1], a);
    });

    it('closeTaskColContextMenu hides menu', () => {
        const taskColContextMenu = {
            classList: makeClassList(),
            style: { left: '10px', top: '20px' },
        };
        const ui = createTaskListActionsUi({
            state: { items: [], listSort: null },
            els: { taskColContextMenu },
        });
        ui.closeTaskColContextMenu();
        assert.ok(taskColContextMenu.classList.contains('hidden'));
        assert.strictEqual(taskColContextMenu.style.left, '');
        assert.strictEqual(taskColContextMenu.style.top, '');
    });

    it('data-burn-idx click opens factory burn workspace', () => {
        const calls = [];
        global.TransubFactoryWorkspace = {
            openBurn: (payload) => { calls.push(payload); },
        };
        const listeners = [];
        const host = {
            dataset: {},
            addEventListener: (type, fn) => { listeners.push({ type, fn }); },
            contains: () => true,
        };
        const item = {
            path: 'Z:/done.mp4',
            status: 'done',
            targetSubtitlePath: 'Z:/done.zh.srt',
            bilingualSubtitlePath: 'Z:/done.dual.srt',
            sourceSubtitlePath: 'Z:/done.ja.srt',
        };
        const ui = createTaskListActionsUi({
            state: { items: [item], listSort: null },
            els: { taskCardList: host },
            getSubtitlePathForItem: (it) => it.targetSubtitlePath || '',
            setFocusedTaskPath: () => {},
            setPostTaskMenuOpen: () => {},
            setAddMenuOpen: () => {},
            setMoreMenuOpen: () => {},
            setTranslateModeMenuOpen: () => {},
            setPostBatchQcFixMenuOpen: () => {},
        });
        ui.bindListActions();
        const click = listeners.find((l) => l.type === 'click');
        assert.ok(click);
        const burnEl = { dataset: { burnIdx: '0' } };
        click.fn({
            target: {
                closest: (sel) => {
                    if (sel === '[data-idx]') return { dataset: { idx: '0' } };
                    if (sel === '[data-burn-idx]') return burnEl;
                    return null;
                },
            },
            preventDefault: () => {},
            stopPropagation: () => {},
        });
        assert.strictEqual(calls.length, 1);
        assert.deepStrictEqual(calls[0], {
            videoPath: 'Z:/done.mp4',
            subtitlePath: 'Z:/done.zh.srt',
            bilingualSubtitlePath: 'Z:/done.dual.srt',
            sourceSubtitlePath: 'Z:/done.ja.srt',
            path: 'Z:/done.mp4',
        });
        delete global.TransubFactoryWorkspace;
    });
});
