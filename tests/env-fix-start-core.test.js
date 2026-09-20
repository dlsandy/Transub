const assert = require('assert');
const api = require('../src/js/env-fix-start-core.js');

describe('env-fix-start-core', () => {
    it('buildFixStartSummary prefers manual-first wording', () => {
        const msg = api.buildFixStartSummary({
            steps: [{ id: 'gpuRuntime', label: '下载 GPU 支持' }],
            manualHints: [{ id: 'ffmpeg', label: 'FFmpeg' }],
        });
        assert.ok(msg.includes('下载 GPU 支持'));
        assert.ok(msg.includes('FFmpeg'));
        assert.ok(/手动|拖入|成功率/.test(msg));
    });

    it('isWhlPath recognizes wheel filenames', () => {
        assert.strictEqual(api.isWhlPath('a.whl'), true);
        assert.strictEqual(api.isWhlPath('C:\\x\\onnxruntime_gpu-1.21.1.whl'), true);
        assert.strictEqual(api.isWhlPath('readme.txt'), false);
    });

    it('pathsFromWhlDataTransfer uses file.path and filters non-whl', () => {
        const dt = {
            items: null,
            files: [
                { path: 'C:\\tmp\\a.whl', name: 'a.whl' },
                { path: 'C:\\tmp\\b.txt', name: 'b.txt' },
                { path: 'C:\\tmp\\a.whl', name: 'a.whl' },
            ],
        };
        const paths = api.pathsFromWhlDataTransfer(dt, null);
        assert.deepStrictEqual(paths, ['C:\\tmp\\a.whl']);
    });

    it('createEnvFixStartModal returns open/close API', () => {
        const modal = api.createEnvFixStartModal({
            $: () => null,
            electron: {},
        });
        assert.strictEqual(typeof modal.open, 'function');
        assert.strictEqual(typeof modal.close, 'function');
    });

    it('createWhlDropController exposes ingest/getPaths and env-check ids', () => {
        assert.ok(api.ENV_CHECK_WHL_IDS.zone);
        assert.ok(api.ENV_CHECK_WHL_IDS.panel);
        const drop = api.createWhlDropController({
            $: () => null,
            electron: {},
            ids: api.ENV_CHECK_WHL_IDS,
        });
        assert.strictEqual(typeof drop.bindOnce, 'function');
        assert.strictEqual(typeof drop.ingestPaths, 'function');
        assert.strictEqual(typeof drop.setPanelVisible, 'function');
        assert.deepStrictEqual(drop.getPaths(), []);
    });
});
