const assert = require('assert');
const prefer = require('../electron/advanced-runtime-prefer');

describe('advanced-runtime-prefer', () => {
    afterEach(() => {
        prefer._resetForTests();
    });

    it('prefers CUDA when nvidia-smi reports CUDA 12+', () => {
        assert.strictEqual(prefer.shouldPreferCuda12({
            vendor: 'nvidia',
            detected: true,
            cudaVersion: '12.8',
        }), true);
        assert.strictEqual(prefer.shouldPreferCuda12({
            vendor: 'nvidia',
            detected: true,
            cudaVersion: '13.0',
        }), true);
    });

    it('exposes cudaVersion in hints for catalog CUDA 12/13 default', () => {
        prefer._resetForTests({
            preferCuda: true,
            ready: true,
            gpuName: 'RTX 5090',
            cudaVersion: '13.3',
        });
        const hints = prefer.getHints();
        assert.strictEqual(hints.preferCuda, true);
        assert.strictEqual(hints.cudaVersion, '13.3');
    });

    it('does not prefer CUDA when driver CUDA is below 12', () => {
        assert.strictEqual(prefer.shouldPreferCuda12({
            vendor: 'nvidia',
            detected: true,
            cudaVersion: '11.8',
        }), false);
    });

    it('does not prefer CUDA without NVIDIA', () => {
        assert.strictEqual(prefer.shouldPreferCuda12({
            vendor: 'amd',
            detected: true,
        }), false);
        assert.strictEqual(prefer.shouldPreferCuda12({
            vendor: 'nvidia',
            detected: false,
        }), false);
    });

    it('prefers ROCm when AMD GPU is detected', () => {
        assert.strictEqual(prefer.shouldPreferRocm({
            vendor: 'amd',
            detected: true,
            gpuName: 'Radeon RX 7900 XTX',
        }), true);
        assert.strictEqual(prefer.shouldPreferRocm({
            vendor: 'nvidia',
            detected: true,
        }), false);
        const hints = prefer.applyGpuInfo({
            vendor: 'amd',
            detected: true,
            gpuName: 'Radeon RX 7800 XT',
        });
        assert.strictEqual(hints.preferRocm, true);
        assert.strictEqual(hints.preferCuda, false);
        assert.strictEqual(hints.gpuName, 'Radeon RX 7800 XT');
    });

    it('applyGpuInfo caches preferCuda and cudaVersion', () => {
        const hints = prefer.applyGpuInfo({
            vendor: 'nvidia',
            detected: true,
            gpuName: 'RTX 4070',
            cudaVersion: '12.7',
        });
        assert.strictEqual(hints.preferCuda, true);
        assert.strictEqual(hints.cudaVersion, '12.7');
        assert.strictEqual(hints.gpuName, 'RTX 4070');
        assert.strictEqual(prefer.getHints().preferCuda, true);
    });
});
