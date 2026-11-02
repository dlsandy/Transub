const assert = require('assert');
const {
    isIntelArcGpuName,
    suggestedDeviceForInfo,
    buildFriendlyRecommendation,
} = require('../electron/gpu-detect');

describe('gpu-detect Intel Arc', () => {
    it('recognizes Arc discrete / branded names', () => {
        assert.strictEqual(isIntelArcGpuName('Intel(R) Arc(TM) A770 Graphics'), true);
        assert.strictEqual(isIntelArcGpuName('Intel Arc B580'), true);
        assert.strictEqual(isIntelArcGpuName('Intel(R) Arc(TM) Graphics'), true);
        assert.strictEqual(isIntelArcGpuName('Intel Arc A750'), true);
    });

    it('rejects plain UHD / Iris without Arc', () => {
        assert.strictEqual(isIntelArcGpuName('Intel(R) UHD Graphics 770'), false);
        assert.strictEqual(isIntelArcGpuName('Intel(R) Iris(R) Xe Graphics'), false);
        assert.strictEqual(isIntelArcGpuName('Intel(R) HD Graphics 630'), false);
        assert.strictEqual(isIntelArcGpuName('NVIDIA GeForce RTX 4070'), false);
    });

    it('suggests intel device for Engine ASR/Demucs XPU on Arc', () => {
        assert.strictEqual(suggestedDeviceForInfo({
            vendor: 'intel',
            detected: true,
            gpuName: 'Intel Arc A770',
        }), 'intel');
    });

    it('friendly recommendation mentions SYCL LLM and XPU ASR', () => {
        const text = buildFriendlyRecommendation({
            vendor: 'intel',
            detected: true,
            gpuName: 'Intel Arc A770',
        });
        assert.match(text, /Intel Arc/);
        assert.match(text, /SYCL/);
        assert.match(text, /XPU/);
        assert.match(text, /Whisper/);
    });
});
