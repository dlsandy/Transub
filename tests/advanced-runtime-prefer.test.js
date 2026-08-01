const assert = require('assert');
const prefer = require('../electron/advanced-runtime-prefer');

describe('advanced-runtime-prefer', () => {
    afterEach(() => {
        prefer._resetForTests();
    });

    it('prefers CUDA 12 when nvidia-smi reports CUDA 12+', () => {
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

    it('exposes cached hints after reset/apply via refresh mock state', () => {
        prefer._resetForTests({ preferCuda: true, ready: true, gpuName: 'RTX 3060', cudaVersion: '12.6' });
        const hints = prefer.getHints();
        assert.strictEqual(hints.preferCuda, true);
        assert.strictEqual(hints.ready, true);
        assert.strictEqual(hints.gpuName, 'RTX 3060');
    });
});
