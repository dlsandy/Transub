const assert = require('assert');
const { createAdvancedQcSmartFix } = require('../electron/advanced-qc-smart-fix');
const { createAdvancedSmartTranslateJob } = require('../electron/advanced-smart-translate-job');

describe('advanced-qc-smart-fix factory', () => {
    it('exports createAdvancedQcSmartFix with job APIs', () => {
        const api = createAdvancedQcSmartFix({
            requireQcSmartFix: () => ({ ok: true }),
            releaseManagedLlmAfterJob: () => {},
            runContextReconstructBody: async () => ({ ok: true }),
            runBilingualSemanticReviewBody: async () => ({ ok: true }),
        });
        assert.strictEqual(typeof api.runQcSmartFix, 'function');
        assert.strictEqual(typeof api.sendQcSmartProgress, 'function');
        assert.strictEqual(typeof api.runQcLlmSplitRequest, 'function');
        assert.strictEqual(typeof api.prepareQcSmartFixState, 'function');
        assert.strictEqual(typeof api.finishQcSmartFixWithLlm, 'function');
        assert.strictEqual(typeof api.healSoftwareCreditCues, 'function');
    });

    it('runQcSmartFix returns gate failure without calling prepare', async () => {
        let prepareCalled = false;
        const api = createAdvancedQcSmartFix({
            requireQcSmartFix: () => ({ ok: false, error: '需解锁 Pro', code: 'not_entitled' }),
            releaseManagedLlmAfterJob: () => {},
            runContextReconstructBody: async () => {
                prepareCalled = true;
                return { ok: true };
            },
            runBilingualSemanticReviewBody: async () => ({ ok: true }),
        });
        const res = await api.runQcSmartFix({ path: 'x.srt' });
        assert.strictEqual(res.ok, false);
        assert.strictEqual(res.code, 'not_entitled');
        assert.strictEqual(prepareCalled, false);
    });

    it('rejects incomplete host', () => {
        assert.throws(
            () => createAdvancedQcSmartFix({}),
            /requireQcSmartFix required/,
        );
    });
});

describe('advanced-smart-translate-job factory', () => {
    it('exports createAdvancedSmartTranslateJob with job APIs', () => {
        const api = createAdvancedSmartTranslateJob({
            requireSmartTranslate: () => ({ ok: true }),
            releaseManagedLlmAfterJob: () => {},
            loadAdvancedModule: () => ({ loaded: false }),
            allowBuiltinProAlgorithms: () => false,
            missingClosedModuleError: () => ({ ok: false, code: 'advanced_module_missing' }),
            mapCaughtAbortError: () => ({ ok: false, cancelled: true }),
        });
        assert.strictEqual(typeof api.runSmartTranslate, 'function');
        assert.strictEqual(typeof api.runSmartTranslateBody, 'function');
    });

    it('runSmartTranslateBody returns gate failure', async () => {
        const api = createAdvancedSmartTranslateJob({
            requireSmartTranslate: () => ({ ok: false, error: '需解锁 Pro', code: 'not_entitled' }),
            releaseManagedLlmAfterJob: () => {},
            loadAdvancedModule: () => ({ loaded: false }),
            allowBuiltinProAlgorithms: () => true,
            missingClosedModuleError: () => ({ ok: false }),
            mapCaughtAbortError: (e) => ({ ok: false, error: String(e) }),
        });
        const res = await api.runSmartTranslateBody({ cues: [] });
        assert.strictEqual(res.ok, false);
        assert.strictEqual(res.code, 'not_entitled');
    });
});

describe('shouldDegradeHybridChunkOnlyToChat', () => {
    const {
        shouldDegradeHybridChunkOnlyToChat,
        resolveChatCapableSmartChoice,
    } = require('../electron/advanced-smart-translate-job');

    it('degrades positional_misalign under chunk-only', () => {
        assert.strictEqual(
            shouldDegradeHybridChunkOnlyToChat(
                { ok: false, code: 'sakura_misaligned', error: '混合句级不可用：positional_misalign:8' },
                { _hybridChunkOnly: true },
            ),
            true,
        );
    });

    it('skips when already chat path or success', () => {
        assert.strictEqual(
            shouldDegradeHybridChunkOnlyToChat(
                { ok: false, code: 'sakura_misaligned' },
                { _hybridChunkOnly: false },
            ),
            false,
        );
        assert.strictEqual(
            shouldDegradeHybridChunkOnlyToChat(
                { ok: true, cues: [] },
                { _hybridChunkOnly: true },
            ),
            false,
        );
        assert.strictEqual(
            shouldDegradeHybridChunkOnlyToChat(
                { ok: false, code: 'cancelled' },
                { _hybridChunkOnly: true },
            ),
            false,
        );
    });

    it('resolveChatCapableSmartChoice never falls back to reconstruct activeModelId', () => {
        for (const lite of [
            'sakura-galtransl-7b-q6k',
            'sakura-7b',
            'hy-mt2-7b',
            'translategemma-4-sub-e4b',
            'hunyuan-mt-chimera-7b-abliterated',
        ]) {
            const choice = resolveChatCapableSmartChoice({
                activeModelId: 'qwen25-7b',
                smartTranslateModelId: lite,
            });
            assert.strictEqual(choice.modelId, '', lite);
            assert.strictEqual(choice.fallbackFrom, 'translate_only_chat_remap', lite);
        }
        const emptySmart = resolveChatCapableSmartChoice({
            activeModelId: 'qwen25-7b',
            smartTranslateModelId: '',
        });
        assert.strictEqual(emptySmart.modelId, '');
        assert.strictEqual(emptySmart.fallbackFrom, '');
        const bothLite = resolveChatCapableSmartChoice({
            activeModelId: 'sakura-7b',
            smartTranslateModelId: 'hy-mt2-7b',
        });
        assert.strictEqual(bothLite.modelId, '');
        assert.strictEqual(bothLite.fallbackFrom, 'translate_only_chat_remap');
        const polishOk = resolveChatCapableSmartChoice({
            activeModelId: 'qwen25-14b',
            smartTranslateModelId: 'qwen25-7b',
        });
        assert.strictEqual(polishOk.modelId, 'qwen25-7b');
    });
});