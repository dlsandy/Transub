const assert = require('assert');

describe('engine-gpu-vram-hint', () => {
    afterEach(() => {
        delete require.cache[require.resolve('../electron/system-resources')];
        delete require.cache[require.resolve('../electron/engine-gpu-vram-hint')];
    });

    it('sampleJobGpuVramHint returns empty on cpu device', async () => {
        const { sampleJobGpuVramHint } = require('../electron/engine-gpu-vram-hint');
        const hint = await sampleJobGpuVramHint({ device: 'cpu' });
        assert.deepStrictEqual(hint, {});
    });

    it('sampleJobGpuVramHint maps nvidia-smi sample', async () => {
        const resourcesPath = require.resolve('../electron/system-resources');
        require.cache[resourcesPath] = {
            id: resourcesPath,
            filename: resourcesPath,
            loaded: true,
            exports: {
                sampleGpu: async () => ({
                    memTotalMiB: 16384,
                    memUsedMiB: 4096,
                }),
            },
        };
        const { sampleJobGpuVramHint } = require('../electron/engine-gpu-vram-hint');
        const hint = await sampleJobGpuVramHint({ device: 'cuda' });
        assert.strictEqual(hint.gpuTotalMiB, 16384);
        assert.strictEqual(hint.gpuFreeMiB, 12288);
    });
});
