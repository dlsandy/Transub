/**
 * @vitest-environment node
 */
const assert = require('assert');
const Module = require('module');

describe('local-llm-reclaim', () => {
    const originalLoad = Module._load;
    let llamaStops;
    let cancelAdvanced;
    let cancelSakura;
    let lockStatus;

    function clearCaches() {
        for (const key of Object.keys(require.cache)) {
            if (/[\\/]electron[\\/](local-llm-reclaim|advanced-llama-server|advanced-bridge|sakura-translate|compute-task-lock)\.js$/.test(key)) {
                delete require.cache[key];
            }
        }
    }

    beforeEach(() => {
        llamaStops = 0;
        cancelAdvanced = 0;
        cancelSakura = 0;
        lockStatus = { busy: false };
        clearCaches();
        Module._load = function patched(request, parent, isMain) {
            if (request === './compute-task-lock' || request.endsWith('/compute-task-lock')) {
                return {
                    getStatus: () => ({ ...lockStatus }),
                    getLocalStatus: () => ({ ...lockStatus }),
                };
            }
            if (request === './advanced-llama-server' || request.endsWith('/advanced-llama-server')) {
                return {
                    stopLlamaServer: () => {
                        llamaStops += 1;
                        return { ok: true, stopped: true };
                    },
                    stopLlamaServerAsync: async () => {
                        llamaStops += 1;
                        return { ok: true, stopped: true };
                    },
                };
            }
            if (request === './advanced-bridge' || request.endsWith('/advanced-bridge')) {
                return {
                    cancelContextReconstruct: () => {
                        cancelAdvanced += 1;
                        return { ok: true, cancelled: true };
                    },
                };
            }
            if (request === './sakura-translate' || request.endsWith('/sakura-translate')) {
                return {
                    cancelSakuraTranslate: () => {
                        cancelSakura += 1;
                        return { ok: true, cancelled: true };
                    },
                };
            }
            return originalLoad(request, parent, isMain);
        };
    });

    afterEach(() => {
        Module._load = originalLoad;
        clearCaches();
    });

    it('reclaimLocalLlmWhenEditorsGone stops idle llama', () => {
        const { reclaimLocalLlmWhenEditorsGone } = require('../electron/local-llm-reclaim');
        const res = reclaimLocalLlmWhenEditorsGone();
        assert.strictEqual(res.action, 'idle');
        assert.ok(llamaStops >= 1);
        assert.strictEqual(cancelAdvanced, 0);
    });

    it('reclaimLocalLlmWhenEditorsGone cancels editor-owned jobs', () => {
        lockStatus = { busy: true, kind: 'advanced_smart_translate' };
        const { reclaimLocalLlmWhenEditorsGone } = require('../electron/local-llm-reclaim');
        const res = reclaimLocalLlmWhenEditorsGone();
        assert.strictEqual(res.action, 'cancelled');
        assert.ok(cancelAdvanced >= 1);
        assert.ok(cancelSakura >= 1);
        assert.ok(llamaStops >= 1);
    });

    it('reclaimLocalLlmWhenEditorsGone skips when engine holds lock', () => {
        lockStatus = { busy: true, kind: 'engine_batch' };
        const { reclaimLocalLlmWhenEditorsGone } = require('../electron/local-llm-reclaim');
        const res = reclaimLocalLlmWhenEditorsGone();
        assert.strictEqual(res.action, 'skipped');
        assert.strictEqual(llamaStops, 0);
        assert.strictEqual(cancelAdvanced, 0);
    });

    it('reclaimLocalLlmBeforeEngineJob stops llama and logs', async () => {
        const logs = [];
        const { reclaimLocalLlmBeforeEngineJob } = require('../electron/local-llm-reclaim');
        await reclaimLocalLlmBeforeEngineJob((line) => logs.push(line));
        assert.ok(llamaStops >= 1);
        assert.ok(logs.some((l) => /腾出显存/.test(l)));
    });

    it('reclaimComputeBeforeBatchItem stops desktop llama and optionally engine GPU', async () => {
        let stopLlmCalls = 0;
        let releaseGpuCalls = 0;
        const logs = [];
        const prevLoad = Module._load;
        Module._load = function patched(request, parent, isMain) {
            if (request === './engine-llm-client' || request.endsWith('/engine-llm-client')) {
                return {
                    stopLlm: async () => {
                        stopLlmCalls += 1;
                        return { ok: true, data: { ok: true, stopped: true } };
                    },
                };
            }
            if (request === './engine-client' || request.endsWith('/engine-client')) {
                return {
                    releaseGpuMemory: async () => {
                        releaseGpuCalls += 1;
                        return { ok: true };
                    },
                };
            }
            return prevLoad(request, parent, isMain);
        };
        try {
            const { reclaimComputeBeforeBatchItem } = require('../electron/local-llm-reclaim');
            const res = await reclaimComputeBeforeBatchItem((line) => logs.push(line), {
                baseUrl: 'http://127.0.0.1:8765',
                releaseEngineGpu: true,
                reason: 'pre_demucs_batch_item',
            });
            assert.strictEqual(res.ok, true);
            assert.ok(llamaStops >= 1);
            assert.strictEqual(stopLlmCalls, 1);
            assert.strictEqual(releaseGpuCalls, 1);
            assert.strictEqual(res.engineLlmStopped, true);
            assert.strictEqual(res.gpuReleased, true);
        } finally {
            Module._load = prevLoad;
        }
    });

    it('reclaimComputeBeforeBatchItem can skip engine GPU release', async () => {
        let releaseGpuCalls = 0;
        const prevLoad = Module._load;
        Module._load = function patched(request, parent, isMain) {
            if (request === './engine-llm-client' || request.endsWith('/engine-llm-client')) {
                return {
                    stopLlm: async () => ({ ok: true, data: { ok: true, stopped: false } }),
                };
            }
            if (request === './engine-client' || request.endsWith('/engine-client')) {
                return {
                    releaseGpuMemory: async () => {
                        releaseGpuCalls += 1;
                        return { ok: true };
                    },
                };
            }
            return prevLoad(request, parent, isMain);
        };
        try {
            const { reclaimComputeBeforeBatchItem } = require('../electron/local-llm-reclaim');
            await reclaimComputeBeforeBatchItem(null, {
                baseUrl: 'http://127.0.0.1:8765',
                releaseEngineGpu: false,
            });
            assert.strictEqual(releaseGpuCalls, 0);
        } finally {
            Module._load = prevLoad;
        }
    });

    it('reclaimLocalLlmWhenEditorsGoneAsync stops idle llama without sync path', async () => {
        const { reclaimLocalLlmWhenEditorsGoneAsync } = require('../electron/local-llm-reclaim');
        const res = await reclaimLocalLlmWhenEditorsGoneAsync();
        assert.strictEqual(res.action, 'idle');
        assert.ok(llamaStops >= 1);
    });
});
