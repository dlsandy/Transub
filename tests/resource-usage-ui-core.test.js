const assert = require('assert');
const ui = require('../src/js/resource-usage-ui-core');
const bar = require('../src/js/factory-status-bar-core');

describe('resource-usage-ui-core', () => {
    it('exports factory and pure helpers', () => {
        assert.strictEqual(typeof ui.createResourceUsageUi, 'function');
        assert.strictEqual(typeof ui.factoryEscHtml, 'function');
        assert.strictEqual(typeof ui.buildFactoryResourceChipsHtml, 'function');
        assert.strictEqual(ui.RESOURCE_USAGE_INTERVAL_MS, 5000);
    });

    it('factoryEscHtml escapes HTML', () => {
        assert.strictEqual(ui.factoryEscHtml('a&b<c>"d'), 'a&amp;b&lt;c&gt;&quot;d');
        assert.strictEqual(ui.factoryEscHtml(null), '');
    });

    it('buildFactoryResourceChipsHtml shows placeholder when empty', () => {
        const html = ui.buildFactoryResourceChipsHtml([]);
        assert.ok(html.includes('资源采样中'));
    });

    it('buildFactoryResourceChipsHtml renders chips with meter', () => {
        const sample = { cpuPct: 42, memory: { usedBytes: 4e9, totalBytes: 8e9, usedPct: 50 } };
        const chips = bar.buildResourceChips(sample);
        const html = ui.buildFactoryResourceChipsHtml(chips);
        assert.ok(html.includes('factory-resource-chip'));
        assert.ok(html.includes('CPU'));
        assert.ok(html.includes('42%'));
        assert.ok(html.includes('factory-resource-meter'));
        assert.ok(html.includes('width:42%'));
    });

    it('createResourceUsageUi syncResourceUsageMonitor respects setting', async () => {
        const state = {
            running: false,
            resourceUsageTicker: null,
            resourceUsageInFlight: false,
        };
        const label = {
            textContent: 'old',
            classList: { add() {}, remove() {} },
            removeAttribute() {},
        };
        const els = {
            showTaskResourceUsageCheck: { checked: false },
            resourceUsageLabel: label,
            factoryStatusBar: {},
        };
        const api = ui.createResourceUsageUi({
            state,
            els,
            electron: {},
            getSavedOptionsSnapshot: () => ({ showTaskResourceUsage: false }),
        });
        api.syncResourceUsageMonitor();
        assert.strictEqual(state.resourceUsageTicker, null);
        assert.strictEqual(label.textContent, '');
    });

    it('createResourceUsageUi starts ticker when factory status bar present', async () => {
        const state = {
            running: false,
            resourceUsageTicker: null,
            resourceUsageInFlight: false,
            _resourceGpuTick: 0,
        };
        let ipcCalls = 0;
        let lastOpts = null;
        const els = {
            showTaskResourceUsageCheck: { checked: true },
            factoryStatusBar: {},
            factoryResourceChips: { innerHTML: '' },
        };
        const api = ui.createResourceUsageUi({
            state,
            els,
            electron: {
                transubGetSystemResources: async (opts) => {
                    ipcCalls += 1;
                    lastOpts = opts;
                    return { text: 'CPU 1%', cpuPct: 1 };
                },
            },
            factoryStatusBarApi: bar,
            syncFactoryEngineStatus: () => {},
        });
        api.syncResourceUsageMonitor();
        assert.ok(state.resourceUsageTicker);
        await new Promise((r) => setTimeout(r, 20));
        assert.ok(ipcCalls >= 1);
        // First idle poll includes GPU; subsequent idle polls alternate.
        assert.strictEqual(lastOpts?.includeGpu, true);
        assert.strictEqual(state.resourceUsageIntervalMs, ui.RESOURCE_USAGE_IDLE_INTERVAL_MS);
        api.stopResourceUsageMonitor();
        assert.strictEqual(state.resourceUsageTicker, null);
    });

    it('idle polls alternate includeGpu like running (keep last GPU chips)', async () => {
        const state = {
            running: false,
            resourceUsageTicker: null,
            resourceUsageInFlight: false,
            _resourceGpuTick: 0,
        };
        const optsLog = [];
        const els = {
            showTaskResourceUsageCheck: { checked: true },
            factoryStatusBar: {},
            factoryResourceChips: { innerHTML: '' },
            resourceUsageLabel: {
                textContent: '',
                classList: { add() {}, remove() {} },
                removeAttribute() {},
                title: '',
            },
        };
        const api = ui.createResourceUsageUi({
            state,
            els,
            electron: {
                transubGetSystemResources: async (opts) => {
                    optsLog.push(!!opts?.includeGpu);
                    return {
                        text: 'CPU 2% · GPU 10%',
                        cpuPct: 2,
                        ...(opts?.includeGpu
                            ? { gpu: { utilPct: 10, memUsedMiB: 1000, memTotalMiB: 8192 } }
                            : {}),
                    };
                },
            },
            factoryStatusBarApi: bar,
            syncFactoryEngineStatus: () => {},
        });
        await api.refreshResourceUsageLabel();
        await api.refreshResourceUsageLabel();
        assert.deepStrictEqual(optsLog, [true, false]);
        assert.ok(String(els.factoryResourceChips.innerHTML).includes('GPU'));
        assert.ok(String(els.factoryResourceChips.innerHTML).includes('显存'));
        api.stopResourceUsageMonitor();
    });

    it('idle refresh requests GPU on first poll for status chips', async () => {
        const state = {
            running: false,
            resourceUsageTicker: null,
            resourceUsageInFlight: false,
            _resourceGpuTick: 0,
        };
        let lastOpts = null;
        const els = {
            showTaskResourceUsageCheck: { checked: true },
            factoryStatusBar: {},
            factoryResourceChips: { innerHTML: '' },
            resourceUsageLabel: {
                textContent: '',
                classList: { add() {}, remove() {} },
                removeAttribute() {},
                title: '',
            },
        };
        const api = ui.createResourceUsageUi({
            state,
            els,
            electron: {
                transubGetSystemResources: async (opts) => {
                    lastOpts = opts;
                    return {
                        text: 'CPU 2% · GPU 10%',
                        cpuPct: 2,
                        gpu: { utilPct: 10, memUsedMiB: 1000, memTotalMiB: 8192 },
                    };
                },
            },
            factoryStatusBarApi: bar,
            syncFactoryEngineStatus: () => {},
        });
        await api.refreshResourceUsageLabel();
        assert.strictEqual(lastOpts?.includeGpu, true);
        assert.ok(String(els.factoryResourceChips.innerHTML).includes('GPU'));
        assert.ok(String(els.factoryResourceChips.innerHTML).includes('显存'));
        api.stopResourceUsageMonitor();
    });

    it('running polls alternate includeGpu to cut nvidia-smi load', async () => {
        const state = {
            running: true,
            resourceUsageTicker: null,
            resourceUsageInFlight: false,
            factoryResourceSample: {
                gpu: { utilPct: 40, memUsedMiB: 2000, memTotalMiB: 8192 },
            },
        };
        const optsLog = [];
        const els = {
            showTaskResourceUsageCheck: { checked: true },
            factoryStatusBar: {},
            factoryResourceChips: { innerHTML: '' },
            resourceUsageLabel: {
                textContent: '',
                classList: { add() {}, remove() {} },
                removeAttribute() {},
                title: '',
            },
        };
        const api = ui.createResourceUsageUi({
            state,
            els,
            electron: {
                transubGetSystemResources: async (opts) => {
                    optsLog.push(!!opts?.includeGpu);
                    return {
                        text: 'CPU 3% · GPU 40%',
                        cpuPct: 3,
                        ...(opts?.includeGpu
                            ? { gpu: { utilPct: 55, memUsedMiB: 2100, memTotalMiB: 8192 } }
                            : {}),
                    };
                },
            },
            factoryStatusBarApi: bar,
            syncFactoryEngineStatus: () => {},
        });
        await api.refreshResourceUsageLabel();
        await api.refreshResourceUsageLabel();
        assert.deepStrictEqual(optsLog, [true, false]);
        assert.ok(String(els.factoryResourceChips.innerHTML).includes('GPU'));
        assert.ok(String(els.factoryResourceChips.innerHTML).includes('显存'));
        assert.ok(String(els.factoryResourceChips.innerHTML).includes('55%') || String(els.factoryResourceChips.innerHTML).includes('40%'));
        api.stopResourceUsageMonitor();
    });

    it('keeps last GPU chips when a later poll misses gpu', async () => {
        const state = {
            running: false,
            resourceUsageTicker: null,
            resourceUsageInFlight: false,
        };
        let n = 0;
        const els = {
            showTaskResourceUsageCheck: { checked: true },
            factoryStatusBar: {},
            factoryResourceChips: { innerHTML: '' },
            resourceUsageLabel: {
                textContent: '',
                classList: { add() {}, remove() {} },
                removeAttribute() {},
                title: '',
            },
        };
        const api = ui.createResourceUsageUi({
            state,
            els,
            electron: {
                transubGetSystemResources: async () => {
                    n += 1;
                    if (n === 1) {
                        return {
                            text: 'CPU 2% · GPU 33%',
                            cpuPct: 2,
                            gpu: { utilPct: 33, memUsedMiB: 1000, memTotalMiB: 8192 },
                        };
                    }
                    return { text: 'CPU 4%', cpuPct: 4, gpu: null };
                },
            },
            factoryStatusBarApi: bar,
            syncFactoryEngineStatus: () => {},
        });
        await api.refreshResourceUsageLabel();
        await api.refreshResourceUsageLabel();
        assert.ok(String(els.factoryResourceChips.innerHTML).includes('33%'));
        assert.ok(String(els.factoryResourceChips.innerHTML).includes('显存'));
        assert.ok(!String(els.factoryResourceChips.innerHTML).includes('>CPU</span><span class="val">—'));
        api.stopResourceUsageMonitor();
    });

    it('keeps last AMD VRAM chips when a later poll misses gpu', async () => {
        const state = {
            running: true,
            resourceUsageTicker: null,
            resourceUsageInFlight: false,
            _resourceGpuTick: 0,
        };
        let n = 0;
        const els = {
            showTaskResourceUsageCheck: { checked: true },
            factoryStatusBar: {},
            factoryResourceChips: { innerHTML: '' },
            resourceUsageLabel: {
                textContent: '',
                classList: { add() {}, remove() {} },
                removeAttribute() {},
                title: '',
            },
        };
        const api = ui.createResourceUsageUi({
            state,
            els,
            electron: {
                transubGetSystemResources: async (opts) => {
                    n += 1;
                    if (opts?.includeGpu && n === 1) {
                        return {
                            text: 'CPU 2% · GPU AMD · 显存 —/16.0 GB',
                            cpuPct: 2,
                            gpu: {
                                vendor: 'amd',
                                utilPct: null,
                                memUsedMiB: null,
                                memTotalMiB: 16384,
                            },
                        };
                    }
                    return { text: 'CPU 4%', cpuPct: 4, gpu: null };
                },
            },
            factoryStatusBarApi: bar,
            syncFactoryEngineStatus: () => {},
        });
        await api.refreshResourceUsageLabel();
        await api.refreshResourceUsageLabel();
        assert.ok(String(els.factoryResourceChips.innerHTML).includes('AMD'));
        assert.ok(String(els.factoryResourceChips.innerHTML).includes('16.0'));
        assert.ok(String(els.resourceUsageLabel.textContent).includes('显存'));
        api.stopResourceUsageMonitor();
    });
});

