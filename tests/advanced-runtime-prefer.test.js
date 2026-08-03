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
