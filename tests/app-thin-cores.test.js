'use strict';

const assert = require('assert');
const {
    APP_ELEMENT_IDS,
    cacheAppDomElements,
} = require('../src/js/app-dom-ids-core.js');
const {
    bindApiMethods,
    bindCallMethods,
    createLazyFactory,
    bindModuleMethods,
    bindModuleMethodsWithLog,
    installLazyModule,
} = require('../src/js/app-api-bind-core.js');
const {
    isSakuraMtModelId,
    createManagedLlmPickState,
} = require('../src/js/managed-llm-pick-core.js');
const {
    applyBatchRecoveryAction,
} = require('../src/js/batch-recovery-core.js');
const {
    runAutoAddMissingSubtitles,
    normalizeAutoScanFolders,
} = require('../src/js/auto-scan-folders-core.js');

describe('app-dom-ids-core', () => {
    it('exposes a large frozen id list', () => {
        assert.ok(APP_ELEMENT_IDS.length > 400);
        assert.ok(Object.isFrozen(APP_ELEMENT_IDS));
        assert.ok(APP_ELEMENT_IDS.includes('startBtn'));
    });

    it('cacheAppDomElements fills els and query groups', () => {
        const store = new Map([
            ['startBtn', { id: 'startBtn' }],
            ['stopBtn', { id: 'stopBtn' }],
        ]);
        const doc = {
            getElementById: (id) => store.get(id) || null,
            querySelectorAll: (sel) => {
                if (sel === '.params-tab-btn') return [{}, {}];
                if (sel === '.params-tab-panel') return [{}];
                if (sel === '#postTaskMenu .post-task-menu-item') return [];
                if (sel === '[data-add-action]') return [{}, {}, {}];
                return [];
            },
        };
        const els = {};
        cacheAppDomElements(els, doc);
        assert.strictEqual(els.startBtn.id, 'startBtn');
        assert.strictEqual(els.loadingOverlay, null);
        assert.strictEqual(els.paramsTabBtns.length, 2);
        assert.strictEqual(els.addMenuItems.length, 3);
    });
});

describe('app-api-bind-core', () => {
    it('bindApiMethods forwards and coerces', () => {
        const api = {
            ping: (x) => `pong:${x}`,
            flag: () => 1,
        };
        const bound = bindApiMethods(() => api, ['ping', 'flag', 'missing'], {
            flag: (v) => !!v,
        });
        assert.strictEqual(bound.ping('a'), 'pong:a');
        assert.strictEqual(bound.flag(), true);
        assert.strictEqual(bound.missing(), undefined);
    });

    it('bindApiMethods coerces async results without truthy-Promise bug', async () => {
        const api = {
            async idle() { return false; },
            async busy() { return true; },
        };
        const bound = bindApiMethods(() => api, ['idle', 'busy'], {
            idle: (v) => !!v,
            busy: (v) => !!v,
        });
        // Regression: coerce used to run on the Promise itself (!!promise === true).
        assert.strictEqual(await bound.idle(), false);
        assert.strictEqual(await bound.busy(), true);
    });

    it('bindCallMethods uses callFn(name, ...args)', () => {
        const calls = [];
        const callFn = (name, ...args) => {
            calls.push([name, ...args]);
            return name === 'list' ? null : 42;
        };
        const bound = bindCallMethods(callFn, ['run', 'list'], {
            list: (v) => v || [],
        });
        assert.strictEqual(bound.run(1, 2), 42);
        assert.deepStrictEqual(bound.list(), []);
        assert.deepStrictEqual(calls[0], ['run', 1, 2]);
    });

    it('bindCallMethods coerces thenables', async () => {
        const callFn = async (name) => (name === 'idle' ? false : true);
        const bound = bindCallMethods(callFn, ['idle', 'busy'], {
            idle: (v) => !!v,
            busy: (v) => !!v,
        });
        assert.strictEqual(await bound.idle(), false);
        assert.strictEqual(await bound.busy(), true);
    });

    it('createLazyFactory caches create*(deps)', () => {
        let creates = 0;
        const get = createLazyFactory(
            () => (deps) => {
                creates += 1;
                return { n: deps.n, creates };
            },
            () => ({ n: 7 }),
        );
        const a = get();
        const b = get();
        assert.strictEqual(a, b);
        assert.strictEqual(a.n, 7);
        assert.strictEqual(creates, 1);
    });

    it('bindModuleMethodsWithLog warns once when module missing', () => {
        const logs = [];
        const bound = bindModuleMethodsWithLog(() => null, ['refresh'], {
            missingMessage: 'missing-core',
            appendLog: (m, t) => logs.push([m, t]),
        });
        bound.refresh();
        bound.refresh();
        assert.deepStrictEqual(logs, [['missing-core', 'err']]);
    });

    it('installLazyModule assigns getter + methods on host', () => {
        const host = {
            appendLog() {},
            demoApi: {
                createDemo: (deps) => ({
                    ping: () => `ok:${deps.x}`,
                }),
            },
        };
        installLazyModule(host, {
            apiKey: 'demoApi',
            createName: 'createDemo',
            getDeps: () => ({ x: 1 }),
            methodNames: ['ping'],
            missingMessage: 'no-demo',
        });
        assert.strictEqual(typeof host.getDemo, 'function');
        assert.strictEqual(host.ping(), 'ok:1');
    });
});

describe('managed-llm-pick-core', () => {
    it('detects sakura ids and keeps lab cache', () => {
        assert.strictEqual(isSakuraMtModelId('sakura-1.5b'), true);
        assert.strictEqual(isSakuraMtModelId(''), false);
        const st = createManagedLlmPickState();
        st.setCachedManagedLabModels([{ id: 'lab-x' }]);
        assert.deepStrictEqual(st.getCachedManagedLabModels(), [{ id: 'lab-x' }]);
        assert.strictEqual(typeof st.findManagedLlmCatalogEntry, 'function');
    });
});

describe('batch-recovery applyBatchRecoveryAction', () => {
    it('retries item and switches device', () => {
        const retries = [];
        const toasts = [];
        const deviceSelect = { value: 'cuda', dispatchEvent() { /* noop */ } };
        applyBatchRecoveryAction('retry-item', 0, {
            items: [{}],
            retrySingleItem: (i) => retries.push(i),
        });
        assert.deepStrictEqual(retries, [0]);

        applyBatchRecoveryAction('switch-device-cpu', 1, {
            items: [{}, {}],
            els: { deviceSelect },
            retrySingleItem: (i) => retries.push(i),
            markSettingsDirty: () => {},
            persistFormOptionsQuiet: () => {},
            showToast: (m) => toasts.push(m),
            appendLog: () => {},
        });
        assert.strictEqual(deviceSelect.value, 'cpu');
        assert.ok(retries.includes(1));
        assert.ok(toasts.length);
    });
});

describe('auto-scan runAutoAddMissingSubtitles', () => {
    it('opens settings when no folders configured', async () => {
        const logs = [];
        const opened = [];
        await runAutoAddMissingSubtitles({
            getFoldersDraft: () => [],
            getSavedOptionsSnapshot: () => ({ autoScanFolders: [] }),
            appendLog: (m) => logs.push(m),
            showToast: () => {},
            openAppSettings: (tab) => opened.push(tab),
        });
        assert.ok(logs[0].includes('扫描目录'));
        assert.deepStrictEqual(opened, ['auto-scan']);
        assert.deepStrictEqual(normalizeAutoScanFolders(['a', 'a', '']), ['a']);
    });
});
