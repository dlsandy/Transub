const assert = require('assert');
const detect = require('../src/js/setup-wizard-detect-core.js');

describe('setup-wizard prepare next gate', () => {
    it('blocks next while llama-server is only a warning', () => {
        const result = {
            ok: true,
            fix: { fixable: true, ensureLlamaRuntime: true },
            items: [
                { id: 'engine', status: 'ok', label: 'Transub Engine' },
                { id: 'llamaServerRuntime', status: 'warn', label: 'llama-server 运行时' },
            ],
        };
        assert.strictEqual(detect.isPrepareEnvComplete(result), false);
        assert.ok(detect.listPrepareBlockers(result).some((it) => it.id === 'llamaServerRuntime'));
    });

    it('blocks next while GPU runtime is only a warning', () => {
        const result = {
            ok: true,
            fix: { fixable: true, ensureGpu: true },
            items: [
                { id: 'engine', status: 'ok', label: 'Transub Engine' },
                { id: 'gpuRuntime', status: 'warn', label: 'GPU 运行时' },
                { id: 'llamaServerRuntime', status: 'ok', label: 'llama-server 运行时' },
            ],
        };
        assert.strictEqual(detect.isPrepareEnvComplete(result), false);
        assert.ok(detect.listPrepareBlockers(result).some((it) => it.id === 'gpuRuntime'));
    });

    it('allows next only when gated items are ok and nothing is auto-fixable', () => {
        const result = {
            ok: true,
            fix: { fixable: false },
            items: [
                { id: 'installPath', status: 'ok' },
                { id: 'ffmpeg', status: 'ok' },
                { id: 'vcRedist', status: 'ok' },
                { id: 'engine', status: 'ok' },
                { id: 'gpuRuntime', status: 'ok' },
                { id: 'llamaServerRuntime', status: 'ok' },
                { id: 'torchEngineStartup', status: 'ok' },
                { id: 'gpu', status: 'ok' },
            ],
        };
        assert.strictEqual(detect.isPrepareEnvComplete(result), true);
    });

    it('blocks next when PyTorch engine startup probe fails', () => {
        const result = {
            ok: false,
            fix: { fixable: true, ensureTorchCuda: true },
            items: [
                { id: 'engine', status: 'ok' },
                { id: 'gpuRuntime', status: 'ok' },
                { id: 'llamaServerRuntime', status: 'ok' },
                {
                    id: 'torchEngineStartup',
                    status: 'fail',
                    label: 'PyTorch 引擎启动探测',
                    detail: 'WinError 1114',
                },
            ],
        };
        assert.strictEqual(detect.isPrepareEnvComplete(result), false);
        assert.ok(detect.listPrepareBlockers(result).some((it) => it.id === 'torchEngineStartup'));
    });

    it('does not treat missing result as complete', () => {
        assert.strictEqual(detect.isPrepareEnvComplete(null), false);
    });
});
