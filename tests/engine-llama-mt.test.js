const assert = require('assert');
const {
    canUseEngineLlamaMt,
    buildLlamaMtJobFields,
} = require('../electron/engine-llama-mt');

describe('engine-llama-mt', () => {
    it('allows free 推理翻译 catalog ids and rejects Hy-MT / TranslateGemma', () => {
        assert.strictEqual(canUseEngineLlamaMt('sakura-1.5b'), true);
        assert.strictEqual(canUseEngineLlamaMt('galtransl-v3'), true);
        assert.strictEqual(canUseEngineLlamaMt('hymt2-qwen3'), false);
        assert.strictEqual(canUseEngineLlamaMt('translategemma-4b'), false);
        assert.strictEqual(canUseEngineLlamaMt(''), false);
    });

    it('buildLlamaMtJobFields returns structured error when model missing', () => {
        const res = buildLlamaMtJobFields({ modelId: 'sakura-1.5b-not-installed-xyz' });
        assert.strictEqual(res.ok, false);
        assert.ok(res.code === 'unknown_model' || res.code === 'model_not_installed');
    });
});
