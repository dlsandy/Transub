'use strict';

const assert = require('assert');
const { createFactoryTaskListUi } = require('../src/js/factory-task-list-ui-core.js');
const factoryTaskTabApi = require('../src/js/factory-task-tab-core.js');

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

describe('TransubFactoryTaskListUi', () => {
    it('exports createFactoryTaskListUi', () => {
        assert.strictEqual(typeof createFactoryTaskListUi, 'function');
    });

    it('renderList with empty items does not throw', () => {
        const fileListBody = {
            innerHTML: 'x',
            querySelectorAll: () => [],
        };
        const taskCardList = {
            innerHTML: 'y',
            classList: makeClassList(),
            querySelectorAll: () => [],
        };
        const emptyState = { classList: makeClassList() };
        const selectAllCheck = { checked: false, indeterminate: false };
        const state = {
            items: [],
            factoryTaskTab: 'all',
            taskListView: 'cards',
            focusedTaskPath: '',
            recipeExpert: false,
            recipeSheetOpen: false,
            running: false,
            qcFixing: false,
            retranslateBusy: false,
        };
        const ui = createFactoryTaskListUi({
            state,
            els: {
                fileListBody,
                taskCardList,
                emptyState,
                selectAllCheck,
                listScroll: { classList: makeClassList() },
            },
            applyListSortInPlace: () => {},
            syncTaskTableSortHeaders: () => {},
            applyTaskColumnWidths: () => {},
            updateQcBanner: () => {},
            updateContentProfileUi: () => {},
            updateStartButton: () => {},
        });

        assert.doesNotThrow(() => ui.renderList());
        assert.strictEqual(fileListBody.innerHTML, '');
        assert.strictEqual(taskCardList.innerHTML, '');
    });

    it('renderList builds only the active view', () => {
        let cardBuilds = 0;
        let rowBuilds = 0;
        const fileListBody = {
            innerHTML: '',
            querySelectorAll: () => [],
            querySelector: () => null,
        };
        const taskCardList = {
            innerHTML: '',
            classList: makeClassList(),
            querySelectorAll: () => [],
            querySelector: () => null,
        };
        const state = {
            items: [
                { path: 'a.mp4', status: 'ready', selected: true },
                { path: 'b.mp4', status: 'ready', selected: false },
            ],
            factoryTaskTab: 'all',
            taskListView: 'cards',
            focusedTaskPath: '',
            recipeExpert: false,
            recipeSheetOpen: false,
            running: false,
            qcFixing: false,
            retranslateBusy: false,
        };
        const ui = createFactoryTaskListUi({
            state,
            els: {
                fileListBody,
                taskCardList,
                emptyState: { classList: makeClassList(['hidden']) },
                selectAllCheck: { checked: false, indeterminate: false },
                listScroll: { classList: makeClassList(['hidden']) },
                taskViewCardsBtn: { classList: makeClassList(), setAttribute: () => {} },
                taskViewTableBtn: { classList: makeClassList(), setAttribute: () => {} },
            },
            factoryTaskUiApi: {
                normalizeView: (v) => (v === 'table' ? 'table' : 'cards'),
                buildCardHtml: () => {
                    cardBuilds += 1;
                    return '<div class="task-card" data-idx="0"></div>';
                },
            },
            factoryTaskTabApi: {
                normalizeTab: (t) => t || 'all',
                filterIndicesForTab: (items) => items.map((_, i) => i),
                countTabs: (items) => ({ all: items.length, active: 0, done: 0, failed: 0, running: 0 }),
            },
            taskListRowApi: {
                buildListRowHtml: () => {
                    rowBuilds += 1;
                    return '<tr data-idx="0"></tr>';
                },
            },
            applyListSortInPlace: () => {},
            syncTaskTableSortHeaders: () => {},
            applyTaskColumnWidths: () => {},
            updateQcBanner: () => {},
            updateContentProfileUi: () => {},
            updateStartButton: () => {},
            updateRecipeCapsule: () => '',
            updateEmptyStateUi: () => {},
            getDocument: () => ({
                createElement: () => ({ innerHTML: '', firstElementChild: null }),
                body: { classList: makeClassList() },
            }),
        });

        ui.renderList();
        assert.ok(cardBuilds >= 2);
        assert.strictEqual(rowBuilds, 0);
        assert.strictEqual(fileListBody.innerHTML, '');

        state.taskListView = 'table';
        cardBuilds = 0;
        rowBuilds = 0;
        ui.renderList();
        assert.ok(rowBuilds >= 2);
        assert.strictEqual(cardBuilds, 0);
        assert.strictEqual(taskCardList.innerHTML, '');
    });

    it('executeSingleItem starts only the clicked item when idle', () => {
        const started = [];
        const state = {
            items: [
                { path: 'a.mp4', status: 'ready', selected: true },
                { path: 'b.mp4', status: 'ready', selected: true },
            ],
            factoryTaskTab: 'all',
            taskListView: 'cards',
            focusedTaskPath: '',
            recipeExpert: false,
            recipeSheetOpen: false,
            running: false,
            postBatchBusy: false,
            qcFixing: false,
            retranslateBusy: false,
        };
        const ui = createFactoryTaskListUi({
            state,
            els: {
                fileListBody: { innerHTML: '', querySelectorAll: () => [] },
                taskCardList: { innerHTML: '', classList: makeClassList(), querySelectorAll: () => [] },
                emptyState: { classList: makeClassList(['hidden']) },
                selectAllCheck: { checked: false, indeterminate: false },
                listScroll: { classList: makeClassList(['hidden']) },
            },
            factoryTaskUiApi: {
                normalizeView: () => 'cards',
                buildCardHtml: () => '<div></div>',
            },
            factoryTaskTabApi: {
                normalizeTab: (t) => t || 'all',
                filterIndicesForTab: (items) => items.map((_, i) => i),
                countTabs: (items) => ({ all: items.length, active: 0, done: 0, failed: 0, running: 0 }),
            },
            applyListSortInPlace: () => {},
            syncTaskTableSortHeaders: () => {},
            applyTaskColumnWidths: () => {},
            updateQcBanner: () => {},
            updateContentProfileUi: () => {},
            updateStartButton: () => {},
            startSubtitleGeneration: () => { started.push('start'); },
            appendItemsToLiveBatch: async () => { started.push('append'); },
            showToast: () => {},
            appendLog: () => {},
            basename: (p) => String(p).split(/[/\\]/).pop(),
        });

        ui.executeSingleItem(1);
        assert.strictEqual(state.items[0].selected, false);
        assert.strictEqual(state.items[1].selected, true);
        assert.deepStrictEqual(started, ['start']);
    });

    it('executeSingleItem appends to live batch when a run is active', async () => {
        const appended = [];
        const state = {
            items: [
                { path: 'a.mp4', status: 'running', selected: true },
                { path: 'b.mp4', status: 'ready', selected: false },
            ],
            factoryTaskTab: 'all',
            taskListView: 'cards',
            focusedTaskPath: '',
            recipeExpert: false,
            recipeSheetOpen: false,
            running: true,
            postBatchBusy: false,
            qcFixing: false,
            retranslateBusy: false,
        };
        const ui = createFactoryTaskListUi({
            state,
            els: {
                fileListBody: { innerHTML: '', querySelectorAll: () => [] },
                taskCardList: { innerHTML: '', classList: makeClassList(), querySelectorAll: () => [] },
                emptyState: { classList: makeClassList(['hidden']) },
                selectAllCheck: { checked: false, indeterminate: false },
                listScroll: { classList: makeClassList(['hidden']) },
            },
            factoryTaskUiApi: {
                normalizeView: () => 'cards',
                buildCardHtml: () => '<div></div>',
            },
            factoryTaskTabApi: {
                normalizeTab: (t) => t || 'all',
                filterIndicesForTab: (items) => items.map((_, i) => i),
                countTabs: (items) => ({ all: items.length, active: 1, done: 0, failed: 0, running: 1 }),
            },
            applyListSortInPlace: () => {},
            syncTaskTableSortHeaders: () => {},
            applyTaskColumnWidths: () => {},
            updateQcBanner: () => {},
            updateContentProfileUi: () => {},
            updateStartButton: () => {},
            startSubtitleGeneration: () => { appended.push('start'); },
            appendItemsToLiveBatch: async (items) => {
                appended.push(...items.map((i) => i.path));
            },
            showToast: () => {},
            appendLog: () => {},
            basename: (p) => String(p).split(/[/\\]/).pop(),
        });

        ui.executeSingleItem(1);
        assert.strictEqual(state.items[1].selected, true);
        assert.deepStrictEqual(appended, ['b.mp4']);
    });

    it('refreshListRow updates the completed tab count without a full tab switch', () => {
        const doneCount = { textContent: '0' };
        const card = {
            querySelector: () => null,
            querySelectorAll: () => [],
            replaceWith() {},
            dataset: {},
            classList: makeClassList(),
        };
        const tabBtn = () => ({ classList: makeClassList(), setAttribute() {} });
        const state = {
            items: [
                { path: 'a.mp4', status: 'done', selected: false },
                { path: 'b.mp4', status: 'running', selected: false },
            ],
            factoryTaskTab: 'all',
            taskListView: 'cards',
            focusedTaskPath: '',
            recipeExpert: false,
            recipeSheetOpen: false,
            running: true,
            qcFixing: false,
            retranslateBusy: false,
        };
        const ui = createFactoryTaskListUi({
            state,
            els: {
                fileListBody: {
                    innerHTML: '',
                    querySelectorAll: () => [],
                    querySelector: () => null,
                },
                taskCardList: {
                    innerHTML: '',
                    classList: makeClassList(),
                    querySelector: (sel) => (String(sel).includes('data-idx="0"') ? card : null),
                    querySelectorAll: () => [],
                },
                emptyState: { classList: makeClassList(['hidden']) },
                selectAllCheck: { checked: false, indeterminate: false },
                listScroll: { classList: makeClassList(['hidden']) },
                factoryTabAllCount: { textContent: '0' },
                factoryTabActiveCount: { textContent: '0' },
                factoryTabDoneCount: doneCount,
                factoryTabFailedCount: { textContent: '0' },
                factoryTabAll: { ...tabBtn(), classList: makeClassList(['is-active']) },
                factoryTabActive: tabBtn(),
                factoryTabDone: tabBtn(),
                factoryTabFailed: tabBtn(),
            },
            factoryTaskUiApi: {
                normalizeView: () => 'cards',
                buildCardHtml: () => '<div class="task-card" data-idx="0"></div>',
            },
            factoryTaskTabApi,
            taskListRowApi: { statusMeta: () => ({}) },
            applyListSortInPlace: () => {},
            syncTaskTableSortHeaders: () => {},
            applyTaskColumnWidths: () => {},
            updateQcBanner: () => {},
            updateContentProfileUi: () => {},
            updateStartButton: () => {},
            getDocument: () => ({
                createElement: () => ({
                    innerHTML: '',
                    firstElementChild: {
                        querySelectorAll: () => [],
                        querySelector: () => null,
                        classList: makeClassList(),
                        dataset: {},
                    },
                }),
            }),
        });

        const ok = ui.refreshListRow(state.items[0], { light: false });
        assert.strictEqual(ok, true);
        assert.strictEqual(doneCount.textContent, '1');
    });
});
