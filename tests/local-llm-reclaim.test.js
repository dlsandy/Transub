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
            if (request === './advanced-llama-server' || request.endsWith('/advanced-llama-server')) {
                return {
                    stopLlamaServer: () => {
                        llamaStops += 1;
                        return { ok: true, stopped: true };
                    },
                };
            }
            if (request === './compute-task-lock' || request.endsWith('/compute-task-lock')) {
                return {
                    getStatus: () => ({ ...lockStatus }),
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

    it('reclaimLocalLlmBeforeEngineJob stops llama and logs', () => {
        const logs = [];
        const { reclaimLocalLlmBeforeEngineJob } = require('../electron/local-llm-reclaim');
        reclaimLocalLlmBeforeEngineJob((line) => logs.push(line));
        assert.ok(llamaStops >= 1);
        assert.ok(logs.some((l) => /腾出显存/.test(l)));
    });
});
