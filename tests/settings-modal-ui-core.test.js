'use strict';

const assert = require('assert');
const {
    createSettingsModalUi,
    PARAMS_TAB_ALIASES,
} = require('../src/js/settings-modal-ui-core.js');

describe('TransubSettingsModalUi', () => {
    it('exports createSettingsModalUi and PARAMS_TAB_ALIASES', () => {
        assert.strictEqual(typeof createSettingsModalUi, 'function');
        assert.ok(PARAMS_TAB_ALIASES && typeof PARAMS_TAB_ALIASES === 'object');
        assert.strictEqual(PARAMS_TAB_ALIASES.models, 'install');
        assert.strictEqual(PARAMS_TAB_ALIASES.ffmpeg, 'install');
        assert.strictEqual(PARAMS_TAB_ALIASES.runtime, 'runtime');
        assert.strictEqual(PARAMS_TAB_ALIASES.notify, 'runtime');
        assert.strictEqual(PARAMS_TAB_ALIASES['任务栏与通知'], 'runtime');
        assert.strictEqual(PARAMS_TAB_ALIASES.performance, 'process');
        assert.strictEqual(PARAMS_TAB_ALIASES['硬件'], 'process');
        assert.strictEqual(PARAMS_TAB_ALIASES.history, 'output');
        assert.strictEqual(PARAMS_TAB_ALIASES['转录保留'], 'output');
        assert.strictEqual(PARAMS_TAB_ALIASES.byok, 'external-translate');
        assert.strictEqual(PARAMS_TAB_ALIASES['外部翻译'], 'external-translate');
        assert.strictEqual(PARAMS_TAB_ALIASES.station, 'external-translate');
        assert.strictEqual(PARAMS_TAB_ALIASES.burn, 'burn');
        assert.strictEqual(PARAMS_TAB_ALIASES['字幕烧录'], 'burn');
        assert.strictEqual(PARAMS_TAB_ALIASES['auto-scan'], 'auto-scan');
        assert.strictEqual(PARAMS_TAB_ALIASES['扫描目录'], 'auto-scan');
    });

    it('setEnvOverviewChip and setEnvGpuActionsEnabled update DOM', () => {
        const {
            setEnvOverviewChip,
            setEnvGpuActionsEnabled,
        } = require('../src/js/settings-modal-ui-core.js');
        const chip = {
            setAttribute(name, value) { this[name === 'data-state' ? 'dataState' : name] = value; },
            getAttribute() { return ''; },
            dataset: {},
        };
        const stateEl = { textContent: '' };
        const btn = {
            dataset: { baseTitle: '安装 GPU' },
            disabled: true,
            setAttribute(name, value) { this[`_${name}`] = value; },
            removeAttribute(name) { delete this[`_${name}`]; },
            getAttribute() { return this._title || ''; },
        };
        const prevDoc = global.document;
        global.document = {
            getElementById(id) {
                if (id === 'settingsEnvChipGpu') return chip;
                if (id === 'settingsEnvChipGpuState') return stateEl;
                return null;
            },
            querySelectorAll(sel) {
                return sel.includes('data-requires-engine') ? [btn] : [];
            },
        };
        try {
            setEnvOverviewChip('gpu', { state: 'warn', label: '需安装 GPU 支持' });
            assert.strictEqual(chip.dataState, 'warn');
            assert.strictEqual(stateEl.textContent, '需安装 GPU 支持');
            setEnvGpuActionsEnabled(true);
            assert.strictEqual(btn.disabled, false);
            assert.strictEqual(btn._title, '安装 GPU');
            setEnvGpuActionsEnabled(false);
            assert.strictEqual(btn.disabled, true);
            assert.ok(String(btn._title).includes('Transub引擎'));
        } finally {
            global.document = prevDoc;
        }
    });

    it('resolveParamsTab maps aliases and defaults', () => {
        const api = createSettingsModalUi({});
        assert.strictEqual(api.resolveParamsTab(''), 'runtime');
        assert.strictEqual(api.resolveParamsTab('models'), 'install');
        assert.strictEqual(api.resolveParamsTab('pro-llm'), 'pro-smart-translate');
        assert.strictEqual(api.resolveParamsTab('未知面板'), '未知面板');
    });

    it('switchParamsTab updates active tab and button classes', () => {
        let active = 'runtime';
        const btnRuntime = {
            dataset: { tab: 'runtime' },
            classList: {
                _c: new Set(['active']),
                toggle(name, on) {
                    if (on) this._c.add(name);
                    else this._c.delete(name);
                },
            },
            setAttribute() {},
        };
        const btnInstall = {
            dataset: { tab: 'install' },
            classList: {
                _c: new Set(),
                toggle(name, on) {
                    if (on) this._c.add(name);
                    else this._c.delete(name);
                },
            },
            setAttribute() {},
        };
        const panelRuntime = {
            dataset: { tabPanel: 'runtime' },
            classList: {
                _c: new Set(['active']),
                toggle(name, on) {
                    if (on) this._c.add(name);
                    else this._c.delete(name);
                },
            },
        };
        const panelInstall = {
            dataset: { tabPanel: 'install' },
            classList: {
                _c: new Set(),
                toggle(name, on) {
                    if (on) this._c.add(name);
                    else this._c.delete(name);
                },
            },
        };
        const api = createSettingsModalUi({
            els: {
                paramsTabBtns: [btnRuntime, btnInstall],
                paramsTabPanels: [panelRuntime, panelInstall],
            },
            getActiveParamsTab: () => active,
            setActiveParamsTab: (v) => { active = v; },
            getAdvancedEntitled: () => true,
            isProGatedTab: () => false,
            ensureSettingsFeatureScripts: async () => {},
            readEngineBackendFromForm: () => 'twai',
        });
        api.switchParamsTab('models');
        assert.strictEqual(active, 'install');
        assert.ok(btnInstall.classList._c.has('active'));
        assert.ok(!btnRuntime.classList._c.has('active'));
        assert.ok(panelInstall.classList._c.has('active'));
        assert.ok(!panelRuntime.classList._c.has('active'));
    });

    it('openAppSettings opens desktop settings window when available', () => {
        const calls = [];
        const api = createSettingsModalUi({
            electron: {
                transubOpenSettings: (opts) => { calls.push(opts); },
            },
            getIsStandaloneSettings: () => false,
            getIsStandaloneWizard: () => false,
            getIsStandaloneChrome: () => false,
            isDesktop: () => true,
        });
        api.openAppSettings('output', { openLibrary: false });
        assert.deepStrictEqual(calls, [{ tab: 'output', openLibrary: false }]);
    });

    it('openParamsModal switches tab before slow option reload completes', async () => {
        let active = 'runtime';
        let resolveReload;
        const reloadPromise = new Promise((resolve) => { resolveReload = resolve; });
        const btnBurn = {
            dataset: { tab: 'burn' },
            classList: {
                _c: new Set(),
                toggle(name, on) {
                    if (on) this._c.add(name);
                    else this._c.delete(name);
                },
            },
            setAttribute() {},
        };
        const btnRuntime = {
            dataset: { tab: 'runtime' },
            classList: {
                _c: new Set(['active']),
                toggle(name, on) {
                    if (on) this._c.add(name);
                    else this._c.delete(name);
                },
            },
            setAttribute() {},
        };
        const panelBurn = {
            dataset: { tabPanel: 'burn' },
            classList: {
                _c: new Set(),
                toggle(name, on) {
                    if (on) this._c.add(name);
                    else this._c.delete(name);
                },
            },
        };
        const panelRuntime = {
            dataset: { tabPanel: 'runtime' },
            classList: {
                _c: new Set(['active']),
                toggle(name, on) {
                    if (on) this._c.add(name);
                    else this._c.delete(name);
                },
            },
        };
        const modal = {
            classList: {
                _c: new Set(['hidden']),
                remove(n) { this._c.delete(n); },
                add(n) { this._c.add(n); },
            },
        };
        const doc = {
            querySelectorAll(sel) {
                if (sel === '.params-tab-btn') return [btnRuntime, btnBurn];
                if (sel === '.params-tab-panel') return [panelRuntime, panelBurn];
                return [];
            },
            getElementById(id) {
                if (id === 'paramsModal') return modal;
                return null;
            },
        };
        const api = createSettingsModalUi({
            els: {
                paramsModal: modal,
                paramsTabBtns: [btnRuntime, btnBurn],
                paramsTabPanels: [panelRuntime, panelBurn],
            },
            getDocument: () => doc,
            getActiveParamsTab: () => active,
            setActiveParamsTab: (v) => { active = v; },
            getAdvancedEntitled: () => true,
            getIsStandaloneSettings: () => true,
            getSettingsFormDirty: () => false,
            isProGatedTab: () => false,
            ensureSettingsShellReady: async () => {},
            ensureSettingsFeatureScripts: async () => {},
            reloadSavedOptionsIntoForm: () => reloadPromise,
            refreshAdvancedEntitlement: async () => {},
            refreshSettingsBurnEncoderSelect: async () => {},
            refreshSenseMemoryStatus: () => {},
            markSettingsDirty: () => {},
            setSaveParamsStatus: () => {},
            setSavedOptionsSnapshot: () => {},
            buildSavedOptionsFromForm: () => ({}),
        });
        const openDone = api.openParamsModal('burn');
        // Allow microtasks through ensureSettingsShellReady → early switch
        await Promise.resolve();
        await Promise.resolve();
        assert.strictEqual(active, 'burn');
        assert.ok(btnBurn.classList._c.has('active'));
        assert.ok(panelBurn.classList._c.has('active'));
        assert.ok(!modal.classList._c.has('hidden'));
        resolveReload(null);
        await openDone;
        assert.strictEqual(active, 'burn');
    });

    it('openParamsModal still switches when option reload throws', async () => {
        let active = 'runtime';
        const btn = {
            dataset: { tab: 'output' },
            classList: { _c: new Set(), toggle(name, on) { if (on) this._c.add(name); else this._c.delete(name); } },
            setAttribute() {},
        };
        const panel = {
            dataset: { tabPanel: 'output' },
            classList: { _c: new Set(), toggle(name, on) { if (on) this._c.add(name); else this._c.delete(name); } },
        };
        const modal = {
            classList: { _c: new Set(['hidden']), remove(n) { this._c.delete(n); }, add(n) { this._c.add(n); } },
        };
        const doc = {
            querySelectorAll(sel) {
                if (sel === '.params-tab-btn') return [btn];
                if (sel === '.params-tab-panel') return [panel];
                return [];
            },
            getElementById(id) { return id === 'paramsModal' ? modal : null; },
        };
        const api = createSettingsModalUi({
            els: { paramsModal: modal, paramsTabBtns: [btn], paramsTabPanels: [panel] },
            getDocument: () => doc,
            getActiveParamsTab: () => active,
            setActiveParamsTab: (v) => { active = v; },
            getAdvancedEntitled: () => false,
            getIsStandaloneSettings: () => true,
            getSettingsFormDirty: () => false,
            isProGatedTab: () => false,
            ensureSettingsShellReady: async () => {},
            ensureSettingsFeatureScripts: async () => {},
            reloadSavedOptionsIntoForm: async () => { throw new Error('ipc down'); },
            refreshAdvancedEntitlement: async () => {},
            refreshSettingsBurnEncoderSelect: async () => {},
            refreshSenseMemoryStatus: () => {},
            markSettingsDirty: () => {},
            setSaveParamsStatus: () => {},
            setSavedOptionsSnapshot: () => {},
            buildSavedOptionsFromForm: () => ({}),
        });
        await api.openParamsModal('output');
        assert.strictEqual(active, 'output');
        assert.ok(panel.classList._c.has('active'));
    });

    it('filterSettingsNav hides non-matching tabs', () => {
        const groups = [];
        const mkBtn = (tab, text) => ({
            dataset: { tab },
            textContent: text,
            title: text,
            classList: {
                _c: new Set(),
                contains(name) { return this._c.has(name); },
                add(name) { this._c.add(name); },
                remove(name) { this._c.delete(name); },
                toggle(name, on) {
                    if (on) this._c.add(name);
                    else this._c.delete(name);
                },
            },
            getAttribute(name) { return name === 'title' ? this.title : null; },
            setAttribute() {},
        });
        const mkPanel = (tab, search) => ({
            dataset: { tabPanel: tab, settingsSearch: search },
            textContent: search,
            querySelectorAll() { return []; },
            classList: {
                _c: new Set(),
                toggle(name, on) {
                    if (on) this._c.add(name);
                    else this._c.delete(name);
                },
            },
        });
        const btns = [mkBtn('runtime', '常规'), mkBtn('install', '运行环境')];
        const panels = [mkPanel('runtime', '常规 语言'), mkPanel('install', '运行环境 ffmpeg')];
        let active = 'runtime';
        const doc = {
            getElementById(id) {
                if (id === 'settingsSearchEmpty') {
                    return {
                        classList: {
                            _c: new Set(['hidden']),
                            add(n) { this._c.add(n); },
                            toggle(n, on) {
                                if (on) this._c.add(n);
                                else this._c.delete(n);
                            },
                        },
                    };
                }
                return null;
            },
            querySelectorAll(sel) {
                if (sel === '[data-settings-nav-group]') return groups;
                return [];
            },
        };
        const api = createSettingsModalUi({
            els: { paramsTabBtns: btns, paramsTabPanels: panels },
            getDocument: () => doc,
            getActiveParamsTab: () => active,
            setActiveParamsTab: (v) => { active = v; },
            getAdvancedEntitled: () => true,
            isProGatedTab: () => false,
            ensureSettingsFeatureScripts: async () => {},
            readEngineBackendFromForm: () => 'twai',
        });
        api.filterSettingsNav('ffmpeg');
        assert.ok(btns[0].classList._c.has('settings-nav-hidden'));
        assert.ok(!btns[1].classList._c.has('settings-nav-hidden'));
        assert.strictEqual(active, 'install');
    });

    it('closeParamsModal hides modal and clears tips', () => {
        const tips = [];
        const modal = {
            classList: {
                _c: new Set(),
                add(n) { this._c.add(n); },
            },
        };
        let dirtyMarked = null;
        let status = 'x';
        const api = createSettingsModalUi({
            els: { paramsModal: modal },
            getDocument: () => ({
                querySelectorAll(sel) {
                    if (sel === '.settings-tip.is-open') return tips;
                    return [];
                },
            }),
            getIsStandaloneSettings: () => false,
            getIsStandaloneWizard: () => false,
            getSavedOptionsSnapshot: () => null,
            closeEngineModelsLibrary: () => {},
            markSettingsDirty: (v) => { dirtyMarked = v; },
            setSaveParamsStatus: (v) => { status = v; },
        });
        api.closeParamsModal(false);
        assert.ok(modal.classList._c.has('hidden'));
        assert.strictEqual(dirtyMarked, false);
        assert.strictEqual(status, '');
    });
});
