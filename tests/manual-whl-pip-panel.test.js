const assert = require('assert');
const api = require('../src/js/manual-whl-pip-panel-core.js');

describe('manual-whl pip panel', () => {
    it('merges pipCommand and empty ROCm items without dropping the command', () => {
        const merged = api.mergeManualDownloadInfoParts([
            {
                info: {
                    kind: 'torch-rocm',
                    folder: 'C:\\\\app\\\\transub-engine\\\\runtime',
                    engineInstallPath: 'C:\\\\app\\\\transub-engine',
                    pipCommand: '"C:\\\\py.exe" -m pip install torch',
                    wheelHint: '用 pip',
                    items: [],
                    runtimePythonMissing: false,
                },
            },
        ], { kindList: ['torch-rocm'], kindLabel: () => 'ROCm' });
        assert.strictEqual(merged.kind, 'torch-rocm');
        assert.ok(merged.pipCommand.includes('pip install torch'));
        assert.strictEqual(merged.items.length, 0);
        const status = api.resolveManualCatalogStatus(merged, { loading: false });
        assert.match(status.message, /无直链|pip/);
        assert.strictEqual(status.tone, 'warn');
        assert.match(api.emptyPackageListMessage(merged), /pip|ROCm|无独立/i);
    });

    it('joins pip commands from multiple kinds and flags missing runtime python', () => {
        const merged = api.mergeManualDownloadInfoParts([
            {
                info: {
                    kind: 'sensevoice',
                    pipCommand: 'python -m pip install funasr',
                    items: [{ id: 'a', defaultUrl: 'https://example.com/a.whl' }],
                },
            },
            {
                info: {
                    kind: 'torch-rocm',
                    pipCommand: 'python -m pip install torch+rocm',
                    items: [],
                    runtimePythonMissing: true,
                    runtimePythonExpected: 'D:\\\\Transub\\\\transub-engine\\\\runtime\\\\python.exe',
                    engineInstallPath: 'D:\\\\Transub\\\\transub-engine',
                },
            },
        ], { kindList: ['sensevoice', 'torch-rocm'], kindLabel: (k) => k });
        assert.strictEqual(merged.kind, 'bundle');
        assert.ok(merged.pipCommand.includes('funasr'));
        assert.ok(merged.pipCommand.includes('torch+rocm'));
        assert.strictEqual(merged.items.length, 1);
        assert.strictEqual(merged.runtimePythonMissing, true);
        const banner = api.buildMissingRuntimePythonBanner(merged);
        assert.match(banner, /python\.exe/);
        assert.match(banner, /Transub/);
        const status = api.resolveManualCatalogStatus(merged, { loading: false });
        assert.strictEqual(status.tone, 'err');
    });

    it('withTimeout rejects after deadline', async () => {
        await assert.rejects(
            () => api.withTimeout(new Promise(() => {}), 40, '下载清单超时'),
            /下载清单超时/,
        );
    });

    it('expectedRuntimePythonPath joins install root', () => {
        assert.ok(api.expectedRuntimePythonPath('C:\\\\App\\\\transub-engine').endsWith('python.exe'));
        assert.match(api.expectedRuntimePythonPath(''), /runtime/);
    });
});
