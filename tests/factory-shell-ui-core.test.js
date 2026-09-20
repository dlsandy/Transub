'use strict';

const assert = require('assert');
const { createFactoryShellUi } = require('../src/js/factory-shell-ui-core.js');

describe('TransubFactoryShellUi', () => {
    it('exports createFactoryShellUi', () => {
        assert.strictEqual(typeof createFactoryShellUi, 'function');
    });

    it('getPostTaskAction normalizes unknown actions to none', () => {
        const state = { postTaskAction: 'bogus' };
        const ui = createFactoryShellUi({
            state,
            els: {},
            POST_TASK_SELECT_VALUES: new Set(['none', 'quit', 'shutdown', 'sleep', 'open_folder']),
        });
        assert.strictEqual(ui.getPostTaskAction(), 'none');
        state.postTaskAction = 'quit';
        assert.strictEqual(ui.getPostTaskAction(), 'quit');
    });

    it('clampLogHeight respects min and host size', () => {
        const ui = createFactoryShellUi({ state: {}, els: {} });
        assert.strictEqual(ui.clampLogHeight(10, 1000), 96);
        assert.strictEqual(ui.clampLogHeight(500, 400), 240); // 400 - 160 min list
        assert.strictEqual(ui.clampLogHeight(200, 1000), 200);
    });

    it('isTypingTarget detects input-like elements', () => {
        const ui = createFactoryShellUi({ state: {}, els: {} });
        assert.strictEqual(ui.isTypingTarget(null), false);
        assert.strictEqual(ui.isTypingTarget({ tagName: 'INPUT' }), true);
        assert.strictEqual(ui.isTypingTarget({ tagName: 'DIV', isContentEditable: true }), true);
        assert.strictEqual(ui.isTypingTarget({ tagName: 'DIV' }), false);
    });

    it('syncPostTaskMenuUi does not throw with missing els', () => {
        const state = { postTaskAction: 'none' };
        const ui = createFactoryShellUi({
            state,
            els: {},
            POST_TASK_SELECT_VALUES: new Set(['none']),
            POST_TASK_LABELS: { none: '无额外操作' },
            uiTf: (s) => s,
        });
        assert.doesNotThrow(() => ui.syncPostTaskMenuUi());
    });

    it('activateProBtn opens Pro settings via openAppSettings', () => {
        const opened = [];
        const btn = {
            addEventListener(type, fn) {
                if (type === 'click') btn._click = fn;
            },
            hidden: false,
        };
        const prevDoc = global.document;
        const prevWin = global.window;
        const paramsModal = { id: 'paramsModal', getAttribute: () => null };
        global.document = {
            getElementById: (id) => (id === 'paramsModal' ? paramsModal : null),
            addEventListener: () => {},
        };
        global.window = {
            addEventListener: () => {},
        };
        try {
            const ui = createFactoryShellUi({
                state: {
                    running: false,
                    retranslateBusy: false,
                    factoryTaskTab: 'all',
                    items: [],
                    recipeSheetOpen: false,
                    recipeExpert: false,
                },
                els: {
                    activateProBtn: btn,
                },
                openAppSettings: (tab) => { opened.push(tab); },
                getAdvancedEntitled: () => false,
                getIsStandaloneChrome: () => false,
            });
            ui.bindFactoryShellChrome();
            assert.strictEqual(typeof btn._click, 'function');
            btn._click();
            assert.deepStrictEqual(opened, ['pro']);
            assert.strictEqual(btn.hidden, false);
        } finally {
            global.document = prevDoc;
            global.window = prevWin;
        }
    });

    it('settings hybrid banner opens models library via openAppSettings', () => {
        const opened = [];
        const btn = {
            addEventListener(type, fn) {
                if (type === 'click') btn._click = fn;
            },
        };
        const prevDoc = global.document;
        const paramsModal = { id: 'paramsModal', getAttribute: () => null };
        global.document = {
            getElementById: (id) => (id === 'paramsModal' ? paramsModal : null),
            addEventListener: () => {},
        };
        try {
            const ui = createFactoryShellUi({
                state: {},
                els: { modelsHybridReadyBannerBtn: btn },
                openAppSettings: (tab, opts) => { opened.push({ tab, opts }); },
            });
            ui.bindSettingsGuideLinks();
            assert.strictEqual(typeof btn._click, 'function');
            btn._click({ preventDefault() {} });
            assert.deepStrictEqual(opened, [{ tab: 'models', opts: { openLibrary: true } }]);
        } finally {
            global.document = prevDoc;
        }
    });
});
