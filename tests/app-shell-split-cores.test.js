'use strict';

const assert = require('assert');
const { createPostTaskUi, LOG_LEVEL_HINTS } = require('../src/js/post-task-ui-core.js');
const { createItemQcMarkers } = require('../src/js/item-qc-markers-core.js');
const { createRuntimeOptions } = require('../src/js/runtime-options-core.js');
const { createAppMenuCoord, SIBLING_MENU_KEYS } = require('../src/js/app-menu-coord-core.js');
const { pickDeps, sessionGetters, mergeDeps } = require('../src/js/app-shell-deps-core.js');
const { createAppProgressShell } = require('../src/js/app-progress-shell-core.js');

describe('post-task-ui-core', () => {
    it('exports createPostTaskUi', () => {
        assert.strictEqual(typeof createPostTaskUi, 'function');
        assert.ok(LOG_LEVEL_HINTS.DEBUG);
    });

    it('reads sub formats and syncs batch size UI', () => {
        const els = {
            subFormatSrt: { checked: true },
            subFormatVtt: { checked: false },
            subFormatAss: { checked: true },
            subFormatLrc: { checked: false },
            deviceSelect: { value: 'cuda_batch' },
            maxBatchSizeWrap: { classList: { toggle(name, on) { this._hidden = name === 'hidden' && !on; } } },
            maxBatchSizeInput: { disabled: true },
        };
        const ui = createPostTaskUi({
            state: { pendingQueue: [], playSoundOnComplete: false, postTaskAction: 'none' },
            els,
            getPostTaskAction: () => 'none',
        });
        assert.strictEqual(ui.readSubFormatsFromForm(), 'srt,ass');
        ui.syncBatchSizeUi();
        assert.strictEqual(els.maxBatchSizeInput.disabled, false);
    });
});

describe('item-qc-markers-core', () => {
    it('exports createItemQcMarkers', () => {
        assert.strictEqual(typeof createItemQcMarkers, 'function');
    });

    it('picks subtitle path and marks QC fixed (fallback)', () => {
        const api = createItemQcMarkers({
            state: { items: [{ qcIssueCount: 2 }, { qcIssueCount: 0 }] },
        });
        assert.strictEqual(api.getSubtitlePathForItem({ targetSubtitlePath: 'a.srt' }), 'a.srt');
        assert.strictEqual(api.countQcIssues(), 1);
        const item = { status: 'done' };
        api.markItemQcFixed(item, 'fix', { written: true, summary: 'ok' });
        assert.strictEqual(item.qcFixedMode, 'fix');
        assert.strictEqual(item.qcFixedWritten, true);
        api.clearItemQcFixed(item);
        assert.strictEqual(item.qcFixedMode, '');
    });
});

describe('runtime-options-core', () => {
    it('exports createRuntimeOptions', () => {
        assert.strictEqual(typeof createRuntimeOptions, 'function');
    });

    it('merges saved + post-task + active MT', () => {
        const api = createRuntimeOptions({
            buildSavedOptionsFromForm: () => ({ task: 'translate', engineLlmMtModel: 'old' }),
            getPostTaskOptionsFromUi: () => ({ postTaskAction: 'sleep' }),
            readActiveEngineMtModelFromForm: () => 'mt-llm-1',
            readTranslateModeFromForm: () => 'llm',
            mtRouteApi: () => ({}),
            installedMtModelIds: () => [],
            isLlmInferencePickModelId: () => true,
        });
        const opts = api.buildRuntimeOptions();
        assert.strictEqual(opts.task, 'translate');
        assert.strictEqual(opts.postTaskAction, 'sleep');
        assert.strictEqual(opts.engineMtModel, 'mt-llm-1');
        assert.strictEqual(opts.engineLlmMtModel, 'mt-llm-1');
    });
});

describe('app-menu-coord-core', () => {
    it('exports createAppMenuCoord', () => {
        assert.strictEqual(typeof createAppMenuCoord, 'function');
        assert.ok(SIBLING_MENU_KEYS.includes('add'));
    });

    it('setMoreMenuOpen closes siblings; closeSiblingMenus honors except', () => {
        const closed = [];
        const track = (name) => (open) => { if (!open) closed.push(name); };
        const state = { moreMenuOpen: false };
        const els = {
            moreMenu: { classList: { toggle() {} } },
            moreMenuBtn: { setAttribute() {} },
        };
        const coord = createAppMenuCoord({
            state,
            els,
            setAddMenuOpen: track('add'),
            setPostTaskMenuOpen: track('postTask'),
            setClearListMenuOpen: track('clearList'),
            setTranslateModeMenuOpen: track('translateMode'),
            setMtModelMenuOpen: track('mt'),
            setPostBatchQcFixMenuOpen: track('qc'),
            setParamsModeMenuOpen: track('params'),
            setParamsMoreMenuOpen: track('paramsMore'),
            setExpertExtrasMenuOpen: track('expert'),
            setBilingualMenuOpen: track('bilingual'),
            setTranslateStyleMenuOpen: track('style'),
            setTranslateMenuOpen: track('translate'),
            setModelsMenuOpen: track('models'),
        });
        coord.setMoreMenuOpen(true);
        assert.strictEqual(state.moreMenuOpen, true);
        assert.ok(closed.includes('add'));
        assert.ok(closed.includes('postTask'));
        closed.length = 0;
        coord.closeSiblingMenus('add');
        assert.ok(!closed.includes('add'));
        assert.ok(closed.includes('postTask'));
    });
});

describe('app-shell-deps-core', () => {
    it('pick / sessionGetters / mergeDeps', () => {
        assert.deepStrictEqual(pickDeps({ a: 1, b: 2, c: 3 }, ['a', 'c']), { a: 1, c: 3 });
        const g = sessionGetters({ getX: () => 1, y: 2 });
        assert.strictEqual(g.getX(), 1);
        assert.strictEqual(g.y(), 2);
        assert.deepStrictEqual(mergeDeps({ a: 1 }, { b: 2 }, { a: 3 }), { a: 3, b: 2 });
    });
});

describe('app-progress-shell-core', () => {
    it('exports createAppProgressShell', () => {
        assert.strictEqual(typeof createAppProgressShell, 'function');
    });

    it('computeDisplayProgress + sticky clear + elapsed ticker', () => {
        const state = {
            running: false,
            retranslateBusy: false,
            qwenIslandBatchSticky: { x: 1 },
            elapsedTicker: null,
            activePath: null,
        };
        const shell = createAppProgressShell({
            state,
            progressDisplayApi: {
                computeDisplayProgress: () => ({ pct: 42, label: '42%' }),
            },
            formatDuration: (s) => `${s}s`,
        });
        assert.deepStrictEqual(shell.computeDisplayProgress(), { pct: 42, label: '42%' });
        shell.clearQwenIslandBatchSticky();
        assert.strictEqual(state.qwenIslandBatchSticky, null);
        assert.strictEqual(shell.formatElapsedCell({ status: 'pending' }), '—');
        assert.strictEqual(shell.mapStageProgress('save', 50), 99);
        shell.startElapsedTicker();
        assert.ok(state.elapsedTicker);
        shell.stopElapsedTicker();
        assert.strictEqual(state.elapsedTicker, null);
    });
});
