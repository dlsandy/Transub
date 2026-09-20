'use strict';

const assert = require('assert');
const { createListRemovalUi } = require('../src/js/list-removal-ui-core.js');

function makeUi(state, extra = {}) {
    return createListRemovalUi({
        state,
        renderList: () => {},
        updateStartButton: () => {},
        isProgressIdle: () => true,
        updateProgressUi: () => {},
        ux: () => ({ pushUndo() {} }),
        uiTf: (s, p) => (p && p.n != null ? s.replace('{n}', String(p.n)) : s),
        appendLog: () => {},
        ...extra,
    });
}

describe('TransubListRemovalUi', () => {
    it('exports createListRemovalUi', () => {
        assert.strictEqual(typeof createListRemovalUi, 'function');
    });

    it('clearList empties items when idle', () => {
        let rendered = 0;
        const state = {
            retranslateBusy: false,
            running: false,
            items: [{ path: 'a.mp4' }, { path: 'b.mp4' }],
        };
        const ui = createListRemovalUi({
            state,
            renderList: () => { rendered += 1; },
            updateStartButton: () => {},
            isProgressIdle: () => true,
            updateProgressUi: () => {},
            ux: () => ({ pushUndo() {} }),
            uiTf: (s, p) => s.replace('{n}', String(p.n)),
        });
        ui.clearList();
        assert.strictEqual(state.items.length, 0);
        assert.ok(rendered >= 1);
    });

    it('removeSelected skips when retranslateBusy', () => {
        const state = {
            retranslateBusy: true,
            running: false,
            items: [{ path: 'a.mp4', selected: true }],
        };
        const ui = createListRemovalUi({ state, renderList() {}, updateStartButton() {} });
        ui.removeSelected();
        assert.strictEqual(state.items.length, 1);
    });

    it('clearChecked removes only selected items', () => {
        const state = {
            retranslateBusy: false,
            running: false,
            items: [
                { path: 'a.mp4', selected: true, status: 'ready' },
                { path: 'b.mp4', selected: false, status: 'ready' },
                { path: 'c.mp4', selected: true, status: 'done' },
            ],
        };
        makeUi(state).clearChecked();
        assert.deepStrictEqual(state.items.map((i) => i.path), ['b.mp4']);
    });

    it('clearUnchecked removes only unselected items', () => {
        const state = {
            retranslateBusy: false,
            running: false,
            items: [
                { path: 'a.mp4', selected: true, status: 'ready' },
                { path: 'b.mp4', selected: false, status: 'ready' },
            ],
        };
        makeUi(state).clearUnchecked();
        assert.deepStrictEqual(state.items.map((i) => i.path), ['a.mp4']);
    });

    it('clearCompleted removes done tasks only', () => {
        const state = {
            retranslateBusy: false,
            running: false,
            items: [
                { path: 'a.mp4', status: 'done' },
                { path: 'b.mp4', status: 'failed' },
                { path: 'c.mp4', status: 'ready' },
                { path: 'd.mp4', status: 'skipped' },
            ],
        };
        makeUi(state).clearCompleted();
        assert.deepStrictEqual(state.items.map((i) => i.path), ['b.mp4', 'c.mp4', 'd.mp4']);
    });

    it('clearFailed removes failed/error/cancelled', () => {
        const state = {
            retranslateBusy: false,
            running: false,
            items: [
                { path: 'a.mp4', status: 'done' },
                { path: 'b.mp4', status: 'failed' },
                { path: 'c.mp4', status: 'error' },
                { path: 'd.mp4', status: 'cancelled' },
                { path: 'e.mp4', status: 'ready' },
            ],
        };
        makeUi(state).clearFailed();
        assert.deepStrictEqual(state.items.map((i) => i.path), ['a.mp4', 'e.mp4']);
    });

    it('clearInvalid removes missing media paths', async () => {
        const state = {
            retranslateBusy: false,
            running: false,
            items: [
                { path: 'alive.mp4', status: 'ready' },
                { path: 'gone.mp4', status: 'ready' },
                { path: 'also-gone.mp4', status: 'done' },
            ],
        };
        const ui = makeUi(state, {
            electron: {
                async transubFileExists(payload) {
                    if (Array.isArray(payload.paths)) {
                        return {
                            ok: true,
                            results: payload.paths.map((p) => ({
                                path: p,
                                exists: p === 'alive.mp4',
                            })),
                        };
                    }
                    return { ok: true, path: payload.path, exists: payload.path === 'alive.mp4' };
                },
            },
            normPath: (p) => String(p || ''),
        });
        const res = await ui.clearInvalid();
        assert.strictEqual(res.removed, 2);
        assert.deepStrictEqual(state.items.map((i) => i.path), ['alive.mp4']);
    });

    it('runClearAction dispatches invalid key', async () => {
        const state = {
            retranslateBusy: false,
            running: false,
            items: [
                { path: 'alive.mp4', status: 'ready' },
                { path: 'gone.mp4', status: 'ready' },
            ],
        };
        const ui = makeUi(state, {
            electron: {
                async transubFileExists(payload) {
                    return {
                        ok: true,
                        results: (payload.paths || []).map((p) => ({
                            path: p,
                            exists: p === 'alive.mp4',
                        })),
                    };
                },
            },
            normPath: (p) => String(p || ''),
        });
        await ui.runClearAction('invalid');
        assert.deepStrictEqual(state.items.map((i) => i.path), ['alive.mp4']);
    });

    it('runClearAction dispatches menu keys', () => {
        const state = {
            retranslateBusy: false,
            running: false,
            items: [
                { path: 'a.mp4', selected: true, status: 'done' },
                { path: 'b.mp4', selected: false, status: 'failed' },
            ],
        };
        const ui = makeUi(state);
        ui.runClearAction('done');
        assert.deepStrictEqual(state.items.map((i) => i.path), ['b.mp4']);
        ui.runClearAction('failed');
        assert.strictEqual(state.items.length, 0);
    });

    it('clearMatching keeps running items mid-batch', async () => {
        const state = {
            retranslateBusy: false,
            running: true,
            items: [
                { path: 'a.mp4', status: 'running' },
                { path: 'b.mp4', status: 'ready' },
            ],
        };
        await makeUi(state).clearList();
        assert.deepStrictEqual(state.items.map((i) => i.path), ['a.mp4']);
    });

    it('setClearListMenuOpen excepts self when closing siblings', () => {
        const state = { clearListMenuOpen: false, items: [] };
        const closed = [];
        const menu = {
            classList: {
                toggle(_cls, force) {
                    menu._hidden = force;
                },
            },
            _hidden: true,
        };
        const btn = { setAttribute() {}, dataset: {} };
        const ui = createListRemovalUi({
            state,
            els: { clearListMenu: menu, clearListBtn: btn },
            closeSiblingMenus: (except) => {
                closed.push(except);
                // Simulate real coord: closing clearList would flip the menu shut.
                if (except !== 'clearList') {
                    ui.setClearListMenuOpen(false);
                }
            },
            renderList: () => {},
            updateStartButton: () => {},
        });
        ui.setClearListMenuOpen(true);
        assert.strictEqual(state.clearListMenuOpen, true);
        assert.strictEqual(menu._hidden, false);
        assert.deepStrictEqual(closed, ['clearList']);
    });
});
