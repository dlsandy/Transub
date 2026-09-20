'use strict';

const assert = require('assert');
const {
    createAppEventsBinder,
    bindEvents,
} = require('../src/js/app-events-binder-core.js');

describe('TransubAppEventsBinder', () => {
    it('exports createAppEventsBinder and bindEvents', () => {
        assert.strictEqual(typeof createAppEventsBinder, 'function');
        assert.strictEqual(typeof bindEvents, 'function');
    });

    it('bindEvents no-ops without electron', () => {
        const binder = createAppEventsBinder({
            electron: null,
            els: {},
            state: { items: [] },
        });
        assert.doesNotThrow(() => binder.bindEvents());
    });

    it('bindQueueAndToolbarEvents registers select-all toggle and clear menu', () => {
        const listeners = [];
        const mkEl = () => ({
            addEventListener: (type, fn) => { listeners.push([type, fn]); },
        });
        const els = {
            selectAllItemsBtn: mkEl(),
            clearListBtn: mkEl(),
            startBtn: mkEl(),
        };
        let autoScan = 0;
        let clearMenuBound = 0;
        const binder = createAppEventsBinder({
            electron: {},
            els,
            state: { items: [] },
            getIsStandaloneSettings: () => false,
            bindAutoScanSettingsUi: () => { autoScan += 1; },
            bindListActions: () => {},
            setupDragDrop: () => {},
            bindPostTaskMenu: () => {},
            bindAddMenu: () => {},
            bindMainUiExtras: () => {},
            bindClearListMenu: () => { clearMenuBound += 1; },
        });
        binder.bindQueueAndToolbarEvents();
        assert.strictEqual(autoScan, 1);
        assert.strictEqual(clearMenuBound, 1);
        assert.ok(listeners.some(([t]) => t === 'click'));
    });

    it('bindEngineInstallAndModelsEvents refreshes models on managed LLM change', async () => {
        let modelChangedHandler = null;
        let refreshCalls = 0;
        let retranslateSync = 0;
        const prevDocument = global.document;
        const prevWindow = global.window;
        global.document = {
            addEventListener: () => {},
            querySelectorAll: () => [],
            getElementById: () => null,
        };
        global.window = {
            addEventListener: () => {},
        };
        try {
            const binder = createAppEventsBinder({
                electron: {
                    onAdvancedLlmModelChanged: (fn) => {
                        modelChangedHandler = fn;
                        return () => {};
                    },
                },
                els: {},
                state: { items: [] },
                getEngineDownloadActiveSource: () => '',
                refreshEngineModels: async () => { refreshCalls += 1; },
                syncRetranslateModalModelUi: () => { retranslateSync += 1; },
            });
            binder.bindEngineInstallAndModelsEvents();
            assert.strictEqual(typeof modelChangedHandler, 'function');
            modelChangedHandler({ deletedModelId: 'x' });
            await new Promise((r) => setTimeout(r, 0));
            assert.strictEqual(refreshCalls, 1);
            assert.strictEqual(retranslateSync, 1);
        } finally {
            global.document = prevDocument;
            global.window = prevWindow;
        }
    });

    it('models refresh keeps fa-refresh icon markup after click', async () => {
        const listeners = [];
        const icon = {
            classList: {
                _set: new Set(['fa', 'fa-refresh']),
                add(name) { this._set.add(name); },
                remove(name) { this._set.delete(name); },
                contains(name) { return this._set.has(name); },
            },
        };
        const markup = '<i class="fa fa-refresh" aria-hidden="true"></i><span class="sr-only">刷新</span>';
        const btn = {
            disabled: false,
            innerHTML: markup,
            textContent: '刷新',
            querySelector: (sel) => (sel === 'i.fa' ? icon : null),
            addEventListener: (type, fn) => { listeners.push([type, fn]); },
        };
        const panel = {
            dataset: {},
            getAttribute: () => null,
        };
        const prevDocument = global.document;
        const prevWindow = global.window;
        global.document = { addEventListener: () => {}, querySelectorAll: () => [], getElementById: () => null };
        global.window = { addEventListener: () => {} };
        try {
            const binder = createAppEventsBinder({
                electron: {},
                els: {
                    workspaceModels: panel,
                    engineRefreshModelsBtn: btn,
                    engineModelsList: { addEventListener: () => {} },
                },
                state: { items: [] },
                getEngineModelsBrowseOnly: () => false,
                resolveEngineModelsBrowseOnly: async () => false,
                setEngineModelsBrowseOnly: () => {},
                showToast: () => {},
                explainEngineModelsMutateBlocked: () => '',
                refreshEngineModels: async () => ({ ok: true, models: [{ installed: true }, { installed: false }] }),
                getCachedEngineModels: () => [],
                uiTf: (s, vars) => s.replace('{installed}', vars.installed).replace('{total}', vars.total),
                appendLog: () => {},
                setEngineStatusText: () => {},
                appConfirm: async () => {},
                getEngineModelsBusy: () => false,
            });
            binder.bindModelsWorkspaceEvents();
            const click = listeners.find(([t]) => t === 'click')?.[1];
            assert.strictEqual(typeof click, 'function');
            await click();
            assert.strictEqual(btn.innerHTML, markup);
            assert.ok(!icon.classList.contains('fa-spin'));
            assert.strictEqual(btn.disabled, false);
        } finally {
            global.document = prevDocument;
            global.window = prevWindow;
        }
    });

    it('bindGithubMirrorSettingsEvents delegates 测速 click after settings fragment inject', async () => {
        const prevDocument = global.document;
        const prevWindow = global.window;
        const status = { textContent: '', className: '' };
        const input = { value: 'https://g.blfrp.cn/' };
        const testBtn = { id: 'githubMirrorsTestBtn', disabled: false };
        const nodes = {
            githubMirrorsInput: input,
            githubMirrorsTestBtn: testBtn,
            networkGithubMirrorStatus: status,
            proxyEnabledCheck: { checked: false },
            proxyUrlInput: { value: '' },
            proxyBypassInput: { value: '' },
        };
        let clickHandler = null;
        let probePayload = null;
        global.document = {
            getElementById: (id) => nodes[id] || null,
            addEventListener: (type, fn) => {
                if (type === 'click') clickHandler = fn;
            },
        };
        global.window = { addEventListener: () => {} };
        try {
            const binder = createAppEventsBinder({
                electron: {
                    transubTestGithubMirrors: async (payload) => {
                        probePayload = payload;
                        return {
                            ok: true,
                            message: '测速完成 · 最快 g.blfrp.cn（12 ms）',
                            results: [{ message: 'g.blfrp.cn 可用（12 ms）' }],
                        };
                    },
                },
                els: {},
                state: { items: [] },
                setNetworkGithubMirrorStatus: () => {},
                markSettingsDirty: () => {},
            });
            binder.bindGithubMirrorSettingsEvents();
            assert.strictEqual(typeof clickHandler, 'function');
            clickHandler({
                target: {
                    closest: (sel) => (sel === '#githubMirrorsTestBtn' ? testBtn : null),
                },
                preventDefault() {},
                stopPropagation() {},
            });
            await new Promise((r) => setTimeout(r, 0));
            assert.ok(probePayload);
            assert.strictEqual(probePayload.includeOfficial, true);
            assert.ok(String(probePayload.mirrors).includes('g.blfrp.cn'));
            assert.ok(String(status.textContent).includes('测速完成'));
            assert.strictEqual(testBtn.disabled, false);
        } finally {
            global.document = prevDocument;
            global.window = prevWindow;
        }
    });
});
