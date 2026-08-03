/**
 * @vitest-environment node
 */
const assert = require('assert');
const Module = require('module');

describe('local compute cleanup on stop/cancel', () => {
    const originalLoad = Module._load;
    let llamaStops;
    let engineStops;

    beforeEach(() => {
        llamaStops = 0;
        engineStops = 0;
        // Fresh require graph for each case.
        for (const key of Object.keys(require.cache)) {
            if (/[\\/]electron[\\/](active-task-guard|advanced-bridge|advanced-llama-server|engine-bridge|sakura-translate)\.js$/.test(key)) {
                delete require.cache[key];
            }
        }
        Module._load = function patched(request, parent, isMain) {
            if (request === './advanced-llama-server' || request.endsWith('/advanced-llama-server')) {
                return {
                    stopLlamaServer: () => { llamaStops += 1; },
                    scheduleIdleStop: () => {},
                    clearIdleStopTimer: () => {},
                };
            }
            return originalLoad(request, parent, isMain);
        };
    });

    afterEach(() => {
        Module._load = originalLoad;
        for (const key of Object.keys(require.cache)) {
            if (/[\\/]electron[\\/](active-task-guard|advanced-bridge|advanced-llama-server|engine-bridge|sakura-translate)\.js$/.test(key)) {
                delete require.cache[key];
            }
        }
    });

    it('stopActiveJobs stops llama-server', () => {
        const guard = require('../electron/active-task-guard');
        // stub engine/twai/sakura to avoid side effects
        const enginePath = require.resolve('../electron/engine-bridge');
        require.cache[enginePath] = {
            id: enginePath,
            filename: enginePath,
            loaded: true,
            exports: {
                stopEngineJobs: () => { engineStops += 1; },
            },
        };
        const twaiPath = require.resolve('../electron/transwithai-bridge');
        require.cache[twaiPath] = {
            id: twaiPath,
            filename: twaiPath,
            loaded: true,
            exports: {
                stopSubtitleJobs: () => {},
                isSubtitleJobRunning: () => false,
            },
        };
        const advPath = require.resolve('../electron/advanced-bridge');
        require.cache[advPath] = {
            id: advPath,
            filename: advPath,
            loaded: true,
            exports: {
                cancelContextReconstruct: () => ({ ok: true, cancelled: true }),
            },
        };
        const sakuraPath = require.resolve('../electron/sakura-translate');
        require.cache[sakuraPath] = {
            id: sakuraPath,
            filename: sakuraPath,
            loaded: true,
            exports: {
                cancelSakuraTranslate: () => ({ ok: true, cancelled: false }),
            },
        };

        // Re-require guard after stubs
        delete require.cache[require.resolve('../electron/active-task-guard')];
        const fresh = require('../electron/active-task-guard');
        fresh.stopActiveJobs();
        assert.ok(engineStops >= 1, 'expected engine stop');
        assert.ok(llamaStops >= 1, 'expected llama stop');
    });

    it('cancelContextReconstruct stops managed llama-server', () => {
        const advanced = require('../electron/advanced-bridge');
        const res = advanced.cancelContextReconstruct();
        assert.strictEqual(res.ok, true);
        assert.ok(llamaStops >= 1, `expected llama stop, got ${llamaStops}`);
    });
});
