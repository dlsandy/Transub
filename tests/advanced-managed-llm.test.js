const assert = require('assert');
const catalog = require('../src/js/advanced-managed-llm-catalog-core');
const entitlement = require('../src/js/advanced-entitlement-core');

describe('advanced-managed-llm-catalog-core', () => {
    it('lists curated GGUF models', () => {
        const list = catalog.listCatalog();
        assert.ok(list.length >= 8);
        assert.ok(list.every((m) => m.id && m.fileName && m.ggufUrl && m.name && m.family));
        assert.ok(list.some((m) => m.recommended));
        assert.ok(catalog.findCatalogEntry('qwen25-7b'));
        assert.ok(catalog.findCatalogEntry('Qwen2.5-7B-Instruct-Q4_K_M.gguf'));
        assert.ok(catalog.findCatalogEntry('qwen25-3b'));
        assert.ok(catalog.findCatalogEntry('qwen25-1.5b'));
        assert.ok(catalog.findCatalogEntry('qwen3-4b'));
        assert.ok(catalog.findCatalogEntry('qwen3-8b'));
        assert.ok(catalog.findCatalogEntry('qwen3-4b-thinking'));
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
        assert.ok(list.length >= 30);
        const families = catalog.listFamilies();
        assert.ok(families.length >= 4);
        assert.ok(families.every((f) => f.id && f.label));
        assert.ok(families.some((f) => f.id === 'sakura'));
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
        assert.ok(catalog.isProScaleModel('qwen3-4b-thinking'));
        assert.ok(catalog.isProScaleModel('deepseek-r1-7b'));
        assert.ok(catalog.isProScaleModel('qwen25-72b'));
        assert.ok(!catalog.isProScaleModel('qwen25-7b'));
        assert.ok(!catalog.isProScaleModel('sakura-1.5b'));
        assert.ok(!catalog.isProScaleModel('qwen3-4b'));
        const freeList = catalog.listCatalogVisible({ entitled: false });
        assert.ok(freeList.every((m) => !catalog.isProScaleModel(m)));
        assert.ok(freeList.some((m) => m.id === 'qwen25-7b'));
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
        assert.ok(pkg.url.includes(catalog.LLAMA_CPP_TAG));
        assert.ok(pkg.exeName.includes('llama-server'));
        assert.strictEqual(pkg.archive, 'zip');
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
        });
        assert.strictEqual(m.activeModelId, 'qwen25-7b');
        assert.strictEqual(m.smartTranslateModelId, 'sakura-1.5b');
        // Sakura is translate-only: resolve falls back to chat-capable activeModelId when present
        assert.strictEqual(
            catalog.resolveSmartTranslateModelId(m),
            'qwen25-7b',
        );
        assert.strictEqual(
            catalog.resolveSmartTranslateModelId({ activeModelId: 'qwen25-7b', smartTranslateModelId: '' }),
            'qwen25-7b',
        );
        assert.strictEqual(
            catalog.resolveSmartTranslateModelId({
                activeModelId: 'sakura-7b',
                smartTranslateModelId: 'sakura-1.5b',
            }),
            'sakura-1.5b',
        );
        const choice = catalog.resolveSmartTranslateModelChoice({
            activeModelId: 'qwen25-7b',
            smartTranslateModelId: 'sakura-7b',
        });
        assert.strictEqual(choice.modelId, 'qwen25-7b');
        assert.strictEqual(choice.fallbackFrom, 'sakura-7b');
        const blockSmart = catalog.getSmartTranslateModelBlock('sakura-7b');
        assert.ok(blockSmart);
        assert.strictEqual(blockSmart.code, 'model_translate_only');
        assert.ok(String(blockSmart.error).includes('智能翻译'));
        assert.strictEqual(catalog.getSmartTranslateModelBlock('qwen25-7b'), null);
        assert.deepStrictEqual(m.pulledIds, ['qwen25-7b']);
        assert.strictEqual(m.serverPort, 39281);
        assert.strictEqual(m.nGpuLayers, 99);
    });

    it('marks free pipeline translate whitelist ≤7B', () => {
        assert.strictEqual(catalog.FREE_PIPELINE_TRANSLATE_MAX_B, 7);
        assert.ok(catalog.isFreePipelineTranslateModel('qwen25-3b'));
        assert.ok(catalog.isFreePipelineTranslateModel('qwen25-7b'));
        assert.ok(catalog.isFreePipelineTranslateModel('qwen25-1.5b'));
        assert.ok(catalog.isFreePipelineTranslateModel('qwen3-4b'));
        assert.ok(catalog.isFreePipelineTranslateModel('sakura-1.5b'));
        assert.ok(catalog.isFreePipelineTranslateModel('phi35-mini'));
        assert.ok(catalog.isFreePipelineTranslateModel('phi4-mini'));
        assert.ok(!catalog.isFreePipelineTranslateModel('qwen25-14b'));
        assert.ok(!catalog.isFreePipelineTranslateModel('qwen3-8b'));
        assert.ok(!catalog.isFreePipelineTranslateModel('qwen3-4b-thinking'));
        assert.ok(!catalog.isFreePipelineTranslateModel('llama31-8b'));
        assert.ok(!catalog.isFreePipelineTranslateModel('deepseek-r1-7b'));
        assert.ok(!catalog.isFreePipelineTranslateModel('qwen25-coder-7b'));
        const free = catalog.listFreePipelineTranslateModels();
        assert.ok(free.length >= 8);
        assert.ok(free.every((m) => m.freePipelineTranslate === true && m.paramBillion <= 7));
    });

    it('marks Sakura as translate-only and blocks reconstruct', () => {
        assert.ok(catalog.isTranslateOnlyModel('sakura-1.5b'));
        assert.ok(catalog.isTranslateOnlyModel('sakura-7b'));
        assert.ok(catalog.isTranslateOnlyModel('Sakura-7B-Qwen2.5'));
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
