const assert = require('assert');
const {
    canUseEngineLlamaMt,
    buildLlamaEnsureBody,
    buildLlamaMtJobFields,
} = require('../electron/engine-llama-mt');

describe('engine-llama-mt', () => {
    it('allows free 推理翻译 catalog ids and rejects Hy-MT / Index / TranslateGemma', () => {
        assert.strictEqual(canUseEngineLlamaMt('sakura-1.5b'), true);
        assert.strictEqual(canUseEngineLlamaMt('galtransl-v3'), true);
        assert.strictEqual(canUseEngineLlamaMt('hymt2-qwen3'), false);
        assert.strictEqual(canUseEngineLlamaMt('index-translate-35b-a3b-mini'), false);
        assert.strictEqual(canUseEngineLlamaMt('translategemma-4b'), false);
        assert.strictEqual(canUseEngineLlamaMt(''), false);
    });

    it('buildLlamaMtJobFields returns structured error when model missing', () => {
        const res = buildLlamaMtJobFields({ modelId: 'sakura-1.5b-not-installed-xyz' });
        assert.strictEqual(res.ok, false);
        assert.ok(res.code === 'unknown_model' || res.code === 'model_not_installed');
    });

    it('buildLlamaEnsureBody clamps -ngl from GPU hints when model is installed', () => {
        const res = buildLlamaEnsureBody({
            modelId: 'index-translate-35b-a3b-mini',
            gpuFreeMiB: 7200,
            gpuTotalMiB: 8192,
        });
        // Index is desktop-adapter-only; ensure may still build for shared spawn helpers.
        if (res.ok === false && (res.code === 'unknown_model' || res.code === 'model_not_installed' || res.code === 'exe_missing')) {
            return;
        }
        if (!res.ok) {
            assert.fail(`unexpected ensure failure: ${res.code || res.error}`);
        }
        const nglIdx = res.ensure.args.indexOf('-ngl');
        assert.ok(nglIdx >= 0);
        const ngl = Number(res.ensure.args[nglIdx + 1]);
        assert.ok(ngl <= 40, `expected VRAM-aware ngl≤40, got ${ngl}`);
        assert.strictEqual(res.ensure.nGpuLayers, ngl);
    });
});
