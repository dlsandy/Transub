const assert = require('assert');
const catalog = require('../src/js/advanced-managed-llm-catalog-core');
const entitlement = require('../src/js/advanced-entitlement-core');

describe('advanced-managed-llm-catalog-core', () => {
    it('lists curated GGUF models', () => {
        const list = catalog.listCatalog();
        assert.ok(list.length >= 8);
        assert.ok(list.every((m) => m.id && m.fileName && m.name && m.family && (m.ggufUrl || m.localOnly)));
        assert.ok(list.some((m) => m.recommended));
        assert.ok(catalog.findCatalogEntry('qwen25-7b'));
        assert.ok(catalog.findCatalogEntry('Qwen2.5-7B-Instruct-Q4_K_M.gguf'));
        assert.ok(catalog.findCatalogEntry('qwen25-3b'));
        assert.ok(catalog.findCatalogEntry('qwen25-1.5b'));
        assert.ok(catalog.findCatalogEntry('qwen3-4b'));
        assert.ok(catalog.findCatalogEntry('qwen3-8b'));
        assert.ok(catalog.findCatalogEntry('qwen3-4b-thinking'));
        assert.ok(catalog.findCatalogEntry('qwen3-4b-abliterated'));
        assert.ok(catalog.findCatalogEntry('qwen3-8b-abliterated'));
        assert.ok(catalog.findCatalogEntry('qwen3-8b-abliterated-q5'));
        assert.ok(catalog.findCatalogEntry('qwen3-14b-abliterated'));
        assert.ok(catalog.findCatalogEntry('qwen35-2b-abliterated'));
        assert.ok(catalog.findCatalogEntry('qwen35-4b-abliterated'));
        assert.ok(catalog.findCatalogEntry('qwen35-9b-abliterated'));
        assert.ok(catalog.findCatalogEntry('qwen35-9b-abliterated-q5'));
        assert.ok(catalog.findCatalogEntry('qwen3-30b-a3b-abliterated'));
        assert.ok(catalog.findCatalogEntry('qwen35-35b-a3b-abliterated'));
        assert.ok(catalog.findCatalogEntry('qwen35-4b'));
        assert.ok(catalog.findCatalogEntry('qwen35-4b-uncensored-aggressive'));
        assert.ok(catalog.findCatalogEntry('qwen35-9b-uncensored-aggressive'));
        assert.ok(catalog.findCatalogEntry('gemma4-e2b-abliterated'));
        assert.ok(catalog.findCatalogEntry('gemma4-e4b-abliterated'));
        assert.ok(catalog.findCatalogEntry('gemma4-12b-abliterated'));
        assert.ok(catalog.findCatalogEntry('gemma4-26b-a4b-abliterated'));
        assert.ok(catalog.findCatalogEntry('Huihui-gemma-4-E4B-it-abliterated.Q4_K_M.gguf'));
        assert.ok(catalog.findCatalogEntry('Huihui-gemma-4-12B-it-abliterated.Q4_K_M.gguf'));
        assert.ok(catalog.findCatalogEntry('glm47-flash-heretic'));
        assert.ok(catalog.findCatalogEntry('Qwen_Qwen3.5-4B-Q4_K_M.gguf'));
        assert.ok(catalog.findCatalogEntry('Qwen3.5-4B-Uncensored-HauhauCS-Aggressive-Q4_K_M.gguf'));
        assert.ok(catalog.findCatalogEntry('Qwen3.5-9B-Uncensored-HauhauCS-Aggressive-Q4_K_M.gguf'));
        assert.ok(catalog.findCatalogEntry('glm-4.7-flash-heretic.Q4_K_M.gguf'));
        assert.ok(catalog.findCatalogEntry('Huihui-Qwen3-8B-abliterated-v2.Q4_K_M.gguf'));
        assert.ok(catalog.findCatalogEntry('Huihui-Qwen3-8B-abliterated-v2.Q5_K_M.gguf'));
        assert.ok(catalog.findCatalogEntry('Huihui-Qwen3.5-9B-abliterated.Q5_K_M.gguf'));
        assert.ok(catalog.findCatalogEntry('Huihui-Qwen3-30B-A3B-Instruct-2507-abliterated.Q4_K_M.gguf'));
        const qwen35u4 = catalog.findCatalogEntry('qwen35-4b-uncensored-aggressive');
        assert.strictEqual(qwen35u4?.family, 'qwen');
        assert.strictEqual(qwen35u4?.freePipelineTranslate, true);
        assert.strictEqual(catalog.resolveChatDefaults(qwen35u4)?.disableThinking, true);
        const qwen35u9 = catalog.findCatalogEntry('qwen35-9b-uncensored-aggressive');
        assert.strictEqual(qwen35u9?.paramBillion, 9);
        assert.ok(catalog.isProScaleModel('qwen35-9b-uncensored-aggressive'));
        const glmHeretic = catalog.findCatalogEntry('glm47-flash-heretic');
        assert.strictEqual(glmHeretic?.family, 'glm');
        assert.strictEqual(glmHeretic?.moe, true);
        assert.strictEqual(glmHeretic?.activeParamBillion, 3);
        assert.ok(catalog.isProScaleModel('glm47-flash-heretic'));
        assert.ok(!catalog.isProScaleModel('qwen35-4b-uncensored-aggressive'));
        const huihui8 = catalog.resolveChatDefaults(catalog.findCatalogEntry('qwen3-8b-abliterated'));
        assert.strictEqual(huihui8?.disableThinking, true);
        assert.strictEqual(huihui8?.temperature, 0.15);
        assert.strictEqual(huihui8?.polishTemperature, 0.23);
        assert.strictEqual(huihui8?.topP, 0.8);
        assert.strictEqual(huihui8?.repeatPenalty, 1.08);
        assert.strictEqual(huihui8?.frequencyPenalty, 0.12);
        const huihui4 = catalog.resolveChatDefaults(catalog.findCatalogEntry('qwen3-4b-abliterated'));
        assert.strictEqual(huihui4?.temperature, 0.14);
        assert.strictEqual(huihui4?.frequencyPenalty, 0.12);
        const huihui14 = catalog.resolveChatDefaults(catalog.findCatalogEntry('qwen3-14b-abliterated'));
        assert.strictEqual(huihui14?.temperature, 0.16);
        assert.strictEqual(huihui14?.polishTemperature, 0.24);
        assert.strictEqual(catalog.findCatalogEntry('qwen3-8b-abliterated-q5')?.recommended, true);
        assert.strictEqual(catalog.findCatalogEntry('qwen35-9b-abliterated-q5')?.recommended, true);
        assert.ok(!catalog.isProScaleModel('qwen35-2b-abliterated'));
        assert.ok(!catalog.isProScaleModel('qwen35-4b-abliterated'));
        assert.ok(catalog.isProScaleModel('qwen35-9b-abliterated'));
        assert.ok(catalog.isProScaleModel('qwen3-30b-a3b-abliterated'));
        assert.strictEqual(catalog.findCatalogEntry('qwen3-30b-a3b-abliterated')?.moe, true);
        assert.strictEqual(catalog.findCatalogEntry('qwen35-35b-a3b-abliterated')?.activeParamBillion, 3);
        assert.ok(!catalog.isProScaleModel('gemma4-e2b-abliterated'));
        assert.ok(!catalog.isProScaleModel('gemma4-e4b-abliterated'));
        assert.ok(catalog.isProScaleModel('gemma4-12b-abliterated'));
        assert.ok(catalog.isProScaleModel('gemma4-26b-a4b-abliterated'));
        assert.strictEqual(catalog.findCatalogEntry('gemma4-26b-a4b-abliterated')?.moe, true);
        assert.strictEqual(catalog.findCatalogEntry('gemma4-26b-a4b-abliterated')?.activeParamBillion, 4);
        assert.strictEqual(catalog.resolveChatDefaults(catalog.findCatalogEntry('gemma4-e4b-abliterated'))?.disableThinking, true);
        assert.ok(catalog.findCatalogEntry('qwen3-32b'));
        assert.ok(catalog.findCatalogEntry('qwen25-72b'));
        assert.ok(catalog.findCatalogEntry('gemma3-4b'));
        assert.ok(catalog.findCatalogEntry('gemma3-27b'));
        assert.ok(catalog.findCatalogEntry('phi4-mini'));
        assert.ok(catalog.findCatalogEntry('deepseek-r1-7b'));
        assert.ok(catalog.findCatalogEntry('deepseek-r1-32b'));
        assert.ok(catalog.findCatalogEntry('llama33-70b'));
        assert.ok(catalog.findCatalogEntry('sakura-1.5b'));
        assert.ok(catalog.findCatalogEntry('sakura-7b'));
        assert.ok(catalog.findCatalogEntry('translategemma-4b'));
        assert.ok(catalog.findCatalogEntry('translategemma-4-sub-e4b'));
        assert.ok(catalog.findCatalogEntry('translategemma-12b'));
        assert.ok(catalog.findCatalogEntry('translategemma-27b'));
        assert.ok(catalog.findCatalogEntry('hunyuan-mt-chimera-7b-abliterated'));
        assert.ok(catalog.findCatalogEntry('hunyuan-mt-7b-abliterated'));
        assert.ok(catalog.findCatalogEntry('hy-mt15-1.8b-abliterated'));
        assert.ok(catalog.findCatalogEntry('hy-mt15-7b-abliterated'));
        const tg4 = catalog.findCatalogEntry('translategemma-4b');
        assert.strictEqual(tg4.family, 'translategemma');
        assert.strictEqual(tg4.translateOnly, true);
        assert.strictEqual(tg4.llamaJinja, true);
        assert.strictEqual(tg4.freePipelineTranslate, true);
        const tgSub = catalog.findCatalogEntry('translategemma-4-sub-e4b');
        assert.strictEqual(tgSub.family, 'translategemma');
        assert.strictEqual(tgSub.translateOnly, true);
        assert.strictEqual(tgSub.freePipelineTranslate, true);
        assert.strictEqual(tgSub.fileName, 'translate_gemma4_sub-E4B-Q4_K_XL.gguf');
        const chimera = catalog.findCatalogEntry('hunyuan-mt-chimera-7b-abliterated');
        assert.strictEqual(chimera.family, 'hunyuan');
        assert.strictEqual(chimera.translateOnly, true);
        assert.strictEqual(chimera.freePipelineTranslate, true);
        const hunyuanAblit = catalog.findCatalogEntry('hunyuan-mt-7b-abliterated');
        assert.strictEqual(hunyuanAblit.family, 'hunyuan');
        assert.strictEqual(hunyuanAblit.translateOnly, true);
        assert.strictEqual(hunyuanAblit.freePipelineTranslate, true);
        const hyMt15 = catalog.findCatalogEntry('hy-mt15-7b-abliterated');
        assert.strictEqual(hyMt15.family, 'hunyuan');
        assert.strictEqual(hyMt15.translateOnly, true);
        assert.strictEqual(catalog.findCatalogEntry('translategemma-12b').freePipelineTranslate, false);
        assert.ok(catalog.isTranslateOnlyModel('translategemma-4b'));
        assert.ok(catalog.isTranslateOnlyModel('translategemma-4-sub-e4b'));
        assert.ok(catalog.isTranslateOnlyModel('hunyuan-mt-chimera-7b-abliterated'));
        assert.ok(catalog.isTranslateOnlyModel('hunyuan-mt-7b-abliterated'));
        assert.ok(catalog.isTranslateOnlyModel('hy-mt15-1.8b-abliterated'));
        assert.strictEqual(catalog.isProScaleModel('translategemma-12b'), false);
        assert.ok(catalog.findCatalogEntry('ornith-15-35b-ymq-m'));
        assert.ok(catalog.findCatalogEntry('ornith-15-35b-ablit-apex-compact'));
        assert.ok(catalog.findCatalogEntry('Ornith-1.5-35B-Uncensored-YMQ-M.gguf'));
        assert.ok(catalog.findCatalogEntry('Ornith-1.5-35B-A3B-Abliterated-MTPv2-APEX-I-Compact-v2D-lite.gguf'));
        assert.ok(!catalog.findCatalogEntry('ornith-35b-heretic-apex-compact'));
        assert.ok(catalog.findCatalogEntry('spark-x25-1.7b'));
        assert.ok(catalog.findCatalogEntry('spark-x25-4b'));
        assert.ok(catalog.findCatalogEntry('Spark-X2.5-4B-Q4_K_M.gguf'));
        const spark17 = catalog.findCatalogEntry('spark-x25-1.7b');
        assert.strictEqual(spark17.family, 'spark');
        assert.strictEqual(spark17.paramBillion, 1.7);
        assert.strictEqual(spark17.freePipelineTranslate, true);
        assert.strictEqual(catalog.resolveChatDefaults(spark17)?.disableThinking, true);
        const spark4 = catalog.findCatalogEntry('spark-x25-4b');
        assert.strictEqual(spark4.draftModelId, 'spark-x25-1.7b');
        assert.strictEqual(catalog.resolveChatDefaults(spark4)?.disableThinking, true);
        const ornith = catalog.findCatalogEntry('ornith-15-35b-ymq-m');
        assert.strictEqual(ornith.family, 'ornith');
        assert.strictEqual(ornith.moe, true);
        assert.strictEqual(ornith.llamaServer?.specType, 'draft-mtp');
        assert.strictEqual(ornith.llamaServer?.cacheTypeV, 'q4_0');
        assert.strictEqual(catalog.resolveChatDefaults(ornith)?.temperature, 0.1);
        const ablit = catalog.findCatalogEntry('ornith-15-35b-ablit-apex-compact');
        assert.strictEqual(ablit.moe, true);
        assert.strictEqual(ablit.llamaServer?.nCpuMoe, 14);
        assert.ok(list.length >= 30);
        const families = catalog.listFamilies();
        assert.ok(families.length >= 4);
        assert.ok(families.every((f) => f.id && f.label));
        assert.ok(families.some((f) => f.id === 'sakura'));
        assert.ok(families.some((f) => f.id === 'ornith'));
        assert.ok(families.some((f) => f.id === 'spark'));
        const sakura = catalog.findCatalogEntry('sakura-1.5b');
        assert.strictEqual(sakura.family, 'sakura');
        assert.ok(String(sakura.note || '').includes('日'));
        // Shared with sakura-mt-catalog-core — file/url must not drift.
        const freeSakura = require('../src/js/sakura-mt-catalog-core').findCatalogEntry('sakura-1.5b');
        assert.strictEqual(sakura.fileName, freeSakura.fileName);
        assert.strictEqual(sakura.ggufUrl, freeSakura.ggufUrl);
        assert.strictEqual(sakura.sizeBytes, freeSakura.sizeBytes);
    });

    it('hides Pro-scale models until entitled', () => {
        assert.ok(catalog.isProScaleModel('qwen25-14b'));
        assert.ok(catalog.isProScaleModel('qwen3-8b'));
        assert.ok(catalog.isProScaleModel('qwen3-8b-abliterated'));
        assert.ok(catalog.isProScaleModel('qwen3-8b-abliterated-q5'));
        assert.ok(catalog.isProScaleModel('qwen3-14b-abliterated'));
        assert.ok(!catalog.isProScaleModel('qwen3-4b-abliterated'));
        assert.ok(catalog.isProScaleModel('qwen3-4b-thinking'));
        assert.ok(catalog.isProScaleModel('deepseek-r1-7b'));
        assert.ok(catalog.isProScaleModel('qwen25-72b'));
        assert.ok(catalog.isProScaleModel('ornith-15-35b-ymq-m'));
        assert.ok(catalog.isProScaleModel('ornith-15-35b-ablit-apex-compact'));
        assert.ok(!catalog.isProScaleModel('qwen25-7b'));
        assert.ok(!catalog.isProScaleModel('sakura-1.5b'));
        assert.ok(!catalog.isProScaleModel('qwen3-4b'));
        assert.ok(!catalog.isProScaleModel('spark-x25-1.7b'));
        assert.ok(!catalog.isProScaleModel('spark-x25-4b'));
        const freeList = catalog.listCatalogVisible({ entitled: false });
        assert.ok(freeList.every((m) => !catalog.isProScaleModel(m)));
        assert.ok(freeList.some((m) => m.id === 'qwen25-7b'));
        assert.ok(freeList.some((m) => m.id === 'spark-x25-4b'));
        assert.ok(!freeList.some((m) => m.id === 'qwen25-14b'));
        assert.ok(!freeList.some((m) => m.id === 'qwen25-72b'));
        const proList = catalog.listCatalogVisible({ entitled: true });
        assert.strictEqual(proList.length, catalog.listCatalog().length);
        assert.ok(proList.some((m) => m.id === 'qwen25-72b'));
        assert.ok(proList.some((m) => m.scaleTier === 'large' || m.scaleTier === 'mid'));
        const keep = catalog.listCatalogVisible({
            entitled: false,
            alwaysIncludeIds: ['qwen25-14b'],
        });
        assert.ok(keep.some((m) => m.id === 'qwen25-14b'));
        assert.strictEqual(catalog.getModelScaleTier('qwen25-7b'), 'light');
        assert.strictEqual(catalog.getModelScaleTier('qwen3-8b'), 'mid');
        assert.strictEqual(catalog.getModelScaleTier('qwen25-72b'), 'large');
    });

    it('exposes pinned llama.cpp runtime package for win32-x64', () => {
        const pkg = catalog.getRuntimePackage('win32', 'x64');
        assert.ok(pkg);
        assert.strictEqual(pkg.id, 'win-vulkan-x64');
        assert.ok(pkg.url.includes(catalog.LLAMA_CPP_TAG));
        assert.ok(pkg.url.includes('vulkan'));
        assert.ok(pkg.exeName.includes('llama-server'));
        assert.strictEqual(pkg.archive, 'zip');
    });

    it('rewrites runtime package URLs to another llama.cpp tag', () => {
        assert.strictEqual(catalog.normalizeLlamaCppTag('b10999'), 'b10999');
        assert.strictEqual(catalog.normalizeLlamaCppTag('v1.2.3-b10999'), 'b10999');
        assert.strictEqual(catalog.normalizeLlamaCppTag('v0.4.0'), '');
        const base = catalog.getRuntimePackage('win32', 'x64', 'win-cuda12-x64');
        assert.ok(base);
        const next = catalog.rewriteRuntimePackageTag(base, 'b10999');
        assert.ok(next);
        assert.strictEqual(next.tag, 'b10999');
        assert.ok(next.url.includes('/download/b10999/'));
        assert.ok(next.url.includes('llama-b10999-'));
        assert.ok(!next.url.includes(catalog.LLAMA_CPP_TAG));
        assert.ok(String(next.companionUrl || '').includes('/download/b10999/'));
        assert.ok(String(next.companionUrl || '').includes('cudart'));
        const same = catalog.rewriteRuntimePackageTag(base, catalog.LLAMA_CPP_TAG);
        assert.strictEqual(same.url, base.url);
        assert.strictEqual(same.companionUrl, base.companionUrl);
        // Semver stub must not rewrite into llama-v0.4.0-bin-… (404)
        const stub = catalog.rewriteRuntimePackageTag(base, 'v0.4.0');
        assert.strictEqual(stub.url, base.url);
        assert.strictEqual(stub.tag, base.tag || catalog.LLAMA_CPP_TAG);
    });

    it('allows selecting CUDA 12/13 runtime on win32-x64', () => {
        const choices = catalog.listRuntimePackages('win32', 'x64');
        assert.ok(choices.some((p) => p.id === 'win-vulkan-x64'));
        assert.ok(choices.some((p) => p.id === 'win-cuda12-x64'));
        assert.ok(choices.some((p) => p.id === 'win-cuda13-x64'));
        assert.ok(choices.some((p) => p.id === 'win-rocm-x64'));
        const cuda12 = catalog.getRuntimePackage('win32', 'x64', 'win-cuda12-x64');
        assert.ok(cuda12);
        assert.strictEqual(cuda12.backend, 'cuda');
        assert.ok(cuda12.url.includes('cuda-12.4'));
        assert.ok(String(cuda12.companionUrl || '').includes('cudart-llama-bin-win-cuda-12.4'));
        const cuda13 = catalog.getRuntimePackage('win32', 'x64', 'win-cuda13-x64');
        assert.ok(cuda13);
        assert.strictEqual(cuda13.backend, 'cuda');
        assert.ok(cuda13.url.includes('cuda-13.4'));
        assert.ok(String(cuda13.companionUrl || '').includes('cudart-llama-bin-win-cuda-13.4'));
        const rocm = catalog.getRuntimePackage('win32', 'x64', 'win-rocm-x64');
        assert.ok(rocm);
        assert.strictEqual(rocm.backend, 'rocm');
        assert.ok(rocm.url.includes('rocm-10.0'));
        assert.strictEqual(catalog.normalizeRuntimeId('win-cuda12-x64', 'win32', 'x64'), 'win-cuda12-x64');
        assert.strictEqual(catalog.normalizeRuntimeId('win-cuda13-x64', 'win32', 'x64'), 'win-cuda13-x64');
        assert.strictEqual(catalog.normalizeRuntimeId('win-rocm-x64', 'win32', 'x64'), 'win-rocm-x64');
        assert.strictEqual(catalog.normalizeRuntimeId('', 'win32', 'x64'), 'win-vulkan-x64');
        assert.strictEqual(catalog.normalizeRuntimeId('nope', 'win32', 'x64'), 'win-vulkan-x64');
        // NVIDIA 机器：空偏好默认 CUDA 12；驱动 CUDA 13+ 时默认 CUDA 13
        assert.strictEqual(
            catalog.normalizeRuntimeId('', 'win32', 'x64', { preferCuda: true }),
            'win-cuda12-x64',
        );
        assert.strictEqual(
            catalog.getDefaultRuntimeId('win32', 'x64', { preferCuda: true }),
            'win-cuda12-x64',
        );
        assert.strictEqual(
            catalog.normalizeManagedLlm({}, { preferCuda: true }).runtimeId,
            'win-cuda12-x64',
        );
        assert.strictEqual(
            catalog.normalizeRuntimeId('', 'win32', 'x64', { preferCuda: true, cudaVersion: '13.3' }),
            'win-cuda13-x64',
        );
        assert.strictEqual(
            catalog.getDefaultRuntimeId('win32', 'x64', { preferCuda: true, cudaVersion: '12.8' }),
            'win-cuda12-x64',
        );
        assert.strictEqual(
            catalog.normalizeManagedLlm({}, { preferCuda: true, cudaVersion: '13.0' }).runtimeId,
            'win-cuda13-x64',
        );
        // AMD：默认 ROCm
        assert.strictEqual(
            catalog.normalizeRuntimeId('', 'win32', 'x64', { preferRocm: true }),
            'win-rocm-x64',
        );
        assert.strictEqual(
            catalog.getDefaultRuntimeId('win32', 'x64', { preferRocm: true }),
            'win-rocm-x64',
        );
        assert.strictEqual(
            catalog.normalizeManagedLlm({}, { preferRocm: true }).runtimeId,
            'win-rocm-x64',
        );
        const rocmFirst = catalog.listRuntimePackages('win32', 'x64', { preferRocm: true });
        assert.strictEqual(rocmFirst[0]?.id, 'win-rocm-x64');
        // 已显式选 Vulkan 时不因 preferCuda 覆盖
        assert.strictEqual(
            catalog.normalizeManagedLlm({ runtimeId: 'win-vulkan-x64' }, { preferCuda: true, cudaVersion: '13.3' }).runtimeId,
            'win-vulkan-x64',
        );
        const cuda12First = catalog.listRuntimePackages('win32', 'x64', { preferCuda: true });
        assert.strictEqual(cuda12First[0]?.id, 'win-cuda12-x64');
        const cuda13First = catalog.listRuntimePackages('win32', 'x64', {
            preferCuda: true,
            cudaVersion: '13.3',
        });
        assert.strictEqual(cuda13First[0]?.id, 'win-cuda13-x64');
        // CUDA id is not valid on macOS — fall back to platform default
        assert.strictEqual(catalog.normalizeRuntimeId('win-cuda12-x64', 'darwin', 'arm64'), 'macos-arm64');
        assert.strictEqual(catalog.normalizeRuntimeId('win-cuda13-x64', 'darwin', 'arm64'), 'macos-arm64');
        assert.strictEqual(catalog.normalizeRuntimeId('win-rocm-x64', 'darwin', 'arm64'), 'macos-arm64');
        // Linux：Vulkan / ROCm 可选
        const linuxChoices = catalog.listRuntimePackages('linux', 'x64');
        assert.ok(linuxChoices.some((p) => p.id === 'ubuntu-vulkan-x64'));
        assert.ok(linuxChoices.some((p) => p.id === 'ubuntu-rocm-x64'));
        assert.strictEqual(
            catalog.normalizeRuntimeId('', 'linux', 'x64', { preferRocm: true }),
            'ubuntu-rocm-x64',
        );
    });

    it('normalizes managed llm and source', () => {
        assert.strictEqual(catalog.normalizeLlmSource('managed'), 'managed');
        assert.strictEqual(catalog.normalizeLlmSource('byok'), 'byok');
        assert.strictEqual(catalog.normalizeLlmSource(''), 'byok');
        const m = catalog.normalizeManagedLlm({
            activeModelId: 'qwen25-7b',
            smartTranslateModelId: 'sakura-1.5b',
            pulledIds: ['qwen25-7b', '', 'qwen25-7b'],
            serverPort: 39281,
            nGpuLayers: 99,
            runtimeId: 'win-cuda12-x64',
        });
        assert.strictEqual(m.activeModelId, 'qwen25-7b');
        // Translate-only cannot occupy the smart/dialog polish slot.
        assert.strictEqual(m.smartTranslateModelId, '');
        assert.strictEqual(
            catalog.resolveDraftModelEntry('qwen25-7b')?.id,
            'qwen25-1.5b',
        );
        if (process.platform === 'win32' && process.arch === 'x64') {
            assert.strictEqual(m.runtimeId, 'win-cuda12-x64');
        }
        // Cleared translate-only smart → empty (no fallback to reconstruct activeModelId).
        assert.strictEqual(
            catalog.resolveSmartTranslateModelId(m),
            '',
        );
        assert.strictEqual(
            catalog.resolveSmartTranslateModelId({ activeModelId: 'qwen25-7b', smartTranslateModelId: '' }),
            '',
        );
        assert.strictEqual(
            catalog.resolveSmartTranslateModelId({
                activeModelId: 'sakura-7b',
                smartTranslateModelId: 'sakura-1.5b',
            }),
            '',
        );
        assert.strictEqual(
            catalog.resolveSmartTranslateModelId({
                activeModelId: 'qwen25-7b',
                smartTranslateModelId: 'qwen25-14b',
            }),
            'qwen25-14b',
        );
        const choice = catalog.resolveSmartTranslateModelChoice({
            activeModelId: 'qwen25-7b',
            smartTranslateModelId: 'sakura-7b',
        });
        assert.strictEqual(choice.modelId, '');
        assert.strictEqual(choice.requestedId, '');
        assert.ok(catalog.getSmartTranslateModelBlock('sakura-7b')?.ok === false);
        assert.ok(catalog.getSmartTranslateModelBlock('hunyuan-mt-chimera-7b-abliterated')?.ok === false);
        assert.ok(catalog.getSmartTranslateModelBlock('translategemma-4-sub-e4b')?.ok === false);
        assert.ok(catalog.getSmartTranslateModelBlock('sakura-galtransl-7b-q6k')?.ok === false);
        assert.ok(catalog.getSmartTranslateModelBlock('hy-mt2-7b')?.ok === false);
        assert.strictEqual(catalog.getSmartTranslateModelBlock('qwen25-7b'), null);
        assert.ok(catalog.isSmartTranslateLiteModel('sakura-7b'));
        assert.ok(catalog.getReconstructModelBlock('sakura-7b'));
        assert.strictEqual(catalog.getReconstructModelBlock('qwen25-7b'), null);
        assert.strictEqual(catalog.pickHybridBriefModelId({
            requestedId: 'qwen25-7b',
            installedIds: ['qwen25-7b', 'qwen25-1.5b', 'sakura-7b'],
        }), 'qwen25-1.5b');
        assert.strictEqual(catalog.pickHybridBriefModelId({
            requestedId: 'qwen25-3b',
            installedIds: ['qwen25-3b', 'qwen25-1.5b'],
        }), 'qwen25-3b');
        assert.strictEqual(catalog.pickHybridBriefModelId({
            requestedId: 'qwen25-7b',
            installedIds: ['qwen25-7b', 'sakura-1.5b'],
        }), 'qwen25-7b');
        assert.strictEqual(catalog.pickInstalledSmartTranslateModelId({
            requestedId: 'qwen25-7b',
            installedIds: ['qwen25-7b', 'qwen25-1.5b'],
        }), 'qwen25-7b');
        assert.strictEqual(catalog.pickInstalledSmartTranslateModelId({
            requestedId: 'qwen25-14b',
            installedIds: ['qwen25-1.5b', 'qwen25-7b', 'sakura-7b'],
        }), 'qwen25-7b');
        assert.strictEqual(catalog.pickInstalledSmartTranslateModelId({
            requestedId: 'qwen25-7b',
            installedIds: ['sakura-7b'],
        }), 'qwen25-7b');
        // Sentence-MT picker may keep explicit lite ids when they are installed.
        assert.strictEqual(catalog.pickInstalledSmartTranslateModelId({
            requestedId: 'sakura-7b',
            installedIds: ['sakura-7b', 'qwen25-7b'],
        }), 'sakura-7b');
        assert.strictEqual(catalog.pickInstalledSmartTranslateModelId({
            requestedId: 'hunyuan-mt-chimera-7b-abliterated',
            installedIds: ['hunyuan-mt-chimera-7b-abliterated', 'qwen25-7b'],
        }), 'hunyuan-mt-chimera-7b-abliterated');
        // Chat path: remap all translate-only families to Instruct.
        assert.strictEqual(catalog.pickInstalledSmartTranslateModelId({
            requestedId: 'sakura-galtransl-7b-q6k',
            installedIds: ['qwen25-7b', 'qwen25-1.5b'],
            forChat: true,
        }), 'qwen25-7b');
        assert.strictEqual(catalog.pickInstalledSmartTranslateModelId({
            requestedId: 'hy-mt2-7b',
            installedIds: ['qwen25-7b', 'hy-mt2-7b'],
            forChat: true,
        }), 'qwen25-7b');
        assert.strictEqual(catalog.pickInstalledSmartTranslateModelId({
            requestedId: 'translategemma-4-sub-e4b',
            installedIds: ['qwen25-7b', 'translategemma-4-sub-e4b'],
            forChat: true,
        }), 'qwen25-7b');
        // Chat-only installed list + lite request → remap (not echo lite).
        assert.strictEqual(catalog.pickInstalledSmartTranslateModelId({
            requestedId: 'sakura-7b',
            installedIds: ['qwen25-7b'],
        }), 'qwen25-7b');
        assert.deepStrictEqual(m.pulledIds, ['qwen25-7b']);
        assert.strictEqual(m.serverPort, 39281);
        assert.strictEqual(m.nGpuLayers, 99);
        assert.deepStrictEqual(m.labModels, []);
    });

    it('normalizes laboratory GGUF models into managed llm', () => {
        const entry = catalog.normalizeLabModelEntry({
            name: 'Custom Qwen',
            ggufUrl: 'https://example.com/models/Foo-Q4_K_M.gguf',
            paramBillion: 7,
        });
        assert.ok(entry);
        assert.strictEqual(entry.fileName, 'Foo-Q4_K_M.gguf');
        assert.ok(entry.id.startsWith('lab-'));
        assert.strictEqual(entry.experimental, true);
        assert.strictEqual(entry.familyLabel, '实验');
        const managed = catalog.normalizeManagedLlm({
            labModels: [entry, { fileName: 'bad.txt' }, entry],
        });
        assert.strictEqual(managed.labModels.length, 1);
        assert.strictEqual(managed.labModels[0].id, entry.id);
        const found = catalog.findCatalogEntry(entry.id, { labModels: managed.labModels });
        assert.ok(found);
        assert.strictEqual(found.fileName, 'Foo-Q4_K_M.gguf');
        const locked = catalog.listCatalogVisible({
            entitled: false,
            labModels: managed.labModels,
        });
        assert.ok(!locked.some((m) => m.id === entry.id));
        const visible = catalog.listCatalogVisible({
            entitled: true,
            labModels: managed.labModels,
        });
        assert.ok(visible.some((m) => m.id === entry.id && m.experimental));
        const fromBlob = catalog.normalizeLabModelEntry({
            ggufUrl: 'https://huggingface.co/org/repo/blob/main/Model-Q4_K_M.gguf',
        });
        assert.ok(fromBlob);
        assert.ok(fromBlob.ggufUrl.includes('/resolve/main/'));
        assert.ok(!fromBlob.ggufUrl.includes('/blob/'));
    });

    it('marks free pipeline translate whitelist (≤7B, plus Sakura/GalTransl any size)', () => {
        assert.strictEqual(catalog.FREE_PIPELINE_TRANSLATE_MAX_B, 7);
        assert.ok(catalog.isFreePipelineTranslateModel('qwen25-3b'));
        assert.ok(catalog.isFreePipelineTranslateModel('qwen25-7b'));
        assert.ok(catalog.isFreePipelineTranslateModel('qwen25-1.5b'));
        assert.ok(catalog.isFreePipelineTranslateModel('qwen3-4b'));
        assert.ok(catalog.isFreePipelineTranslateModel('sakura-1.5b'));
        assert.ok(catalog.isFreePipelineTranslateModel('sakura-galtransl-7b'));
        assert.ok(catalog.isFreePipelineTranslateModel('sakura-galtransl-7b-q6k'));
        assert.ok(catalog.isFreePipelineTranslateModel('sakura-galtransl-v4-4b'));
        assert.ok(catalog.isFreePipelineTranslateModel('sakura-14b'));
        assert.ok(catalog.isFreePipelineTranslateModel('sakura-14b-q4km'));
        assert.ok(catalog.isFreePipelineTranslateModel('sakura-14b-q6k'));
        assert.ok(catalog.isFreePipelineTranslateModel('sakura-14b-qwen3'));
        assert.ok(catalog.isFreePipelineTranslateModel('sakura-8b-qwen3'));
        assert.ok(catalog.isFreePipelineTranslateModel('sakura-galtransl-14b'));
        assert.ok(catalog.isFreePipelineTranslateModel('sakura-galtransl-14b-q4km'));
        assert.ok(catalog.isFreePipelineTranslateModel('sakura-galtransl-14b-q6k'));
        assert.strictEqual(catalog.findCatalogEntry('sakura-galtransl-v4-4b').paramBillion, 4);
        assert.strictEqual(catalog.findCatalogEntry('sakura-galtransl-14b').paramBillion, 14);
        assert.ok(catalog.isFreePipelineTranslateModel('phi35-mini'));
        assert.ok(catalog.isFreePipelineTranslateModel('phi4-mini'));
        assert.ok(!catalog.isFreePipelineTranslateModel('qwen25-14b'));
        assert.ok(!catalog.isFreePipelineTranslateModel('qwen3-8b'));
        assert.ok(!catalog.isFreePipelineTranslateModel('qwen3-4b-thinking'));
        assert.ok(!catalog.isFreePipelineTranslateModel('llama31-8b'));
        assert.ok(!catalog.isFreePipelineTranslateModel('deepseek-r1-7b'));
        assert.ok(!catalog.isFreePipelineTranslateModel('qwen25-coder-7b'));
        assert.ok(!catalog.isFreePipelineTranslateModel('translategemma-12b'));
        const free = catalog.listFreePipelineTranslateModels();
        assert.ok(free.length >= 8);
        assert.ok(free.every((m) => m.freePipelineTranslate === true));
        assert.ok(free.every((m) => (
            m.paramBillion <= 7
            || /galtransl/i.test(m.id)
            || /^sakura-/i.test(m.id)
        )));
        assert.ok(!free.some((m) => /^transub-ja/i.test(m.id)));
        assert.ok(!catalog.isProScaleModel('sakura-14b'));
        assert.ok(!catalog.isProScaleModel('sakura-galtransl-14b-q6k'));
    });

    it('remaps retired transub-ja ids in normalizeManagedLlm', () => {
        const n = catalog.normalizeManagedLlm({
            activeModelId: 'transub-ja-1.5b-q4km',
            smartTranslateModelId: 'transub-ja-1.5b-f16',
            pulledIds: ['transub-ja-1.5b-q4km', 'sakura-1.5b'],
        });
        assert.strictEqual(n.activeModelId, 'sakura-1.5b');
        assert.strictEqual(n.smartTranslateModelId, '');
        assert.deepStrictEqual(n.pulledIds, ['sakura-1.5b']);
    });

    it('marks Sakura as translate-only and blocks reconstruct', () => {
        assert.ok(catalog.isTranslateOnlyModel('sakura-1.5b'));
        assert.ok(catalog.isTranslateOnlyModel('sakura-7b'));
        assert.ok(catalog.isTranslateOnlyModel('Sakura-7B-Qwen2.5'));
        assert.ok(catalog.isTranslateOnlyModel('sakura-galtransl-7b-q6k'));
        assert.ok(catalog.isTranslateOnlyModel('hy-mt2-7b'));
        assert.ok(!catalog.isTranslateOnlyModel('qwen25-7b'));
        assert.ok(!catalog.supportsAdvancedReconstruct('sakura-1.5b'));
        assert.ok(catalog.supportsAdvancedReconstruct('qwen25-7b'));
        const block = catalog.getReconstructModelBlock('sakura-1.5b');
        assert.ok(block);
        assert.strictEqual(block.code, 'model_translate_only');
        assert.ok(String(block.error).includes('翻译专用'));
        assert.strictEqual(catalog.getReconstructModelBlock('qwen25-14b'), null);
        const sakura = catalog.findCatalogEntry('sakura-1.5b');
        assert.strictEqual(sakura.translateOnly, true);
    });
});

describe('advanced-entitlement-core llm source', () => {
    it('persists llmSource and managedLlm in doc normalize', () => {
        const doc = entitlement.normalizeAdvancedDoc({
            llmSource: 'managed',
            managedLlm: { activeModelId: 'qwen25-14b', serverPort: 40000 },
            byok: { provider: 'openai', baseUrl: 'http://x', model: 'm' },
        });
        assert.strictEqual(doc.llmSource, 'managed');
        assert.strictEqual(doc.managedLlm.activeModelId, 'qwen25-14b');
        assert.strictEqual(doc.managedLlm.smartTranslateModelId, '');
        assert.strictEqual(doc.managedLlm.serverPort, 40000);
        assert.strictEqual(doc.byok.model, 'm');
        const empty = entitlement.emptyAdvancedDoc();
        assert.strictEqual(empty.llmSource, 'byok');
        assert.ok(empty.managedLlm);
        assert.ok(empty.managedLlm.serverPort);
    });
});

describe('advanced-managed-llm buildManagedStatus', () => {
    it('keeps explicit empty smartTranslateModelId without resolving to active', () => {
        const managedApi = require('../electron/advanced-managed-llm');
        const status = managedApi.buildManagedStatus({
            llmSource: 'managed',
            managedLlm: {
                activeModelId: 'qwen25-7b',
                smartTranslateModelId: '',
            },
        }, { entitled: true });
        assert.strictEqual(status.smartTranslateModelId, '');
        assert.strictEqual(status.smartTranslateResolvedId, '');
        assert.strictEqual(status.smartTranslateModel, null);
        assert.strictEqual(status.activeModelId, 'qwen25-7b');
    });
});
