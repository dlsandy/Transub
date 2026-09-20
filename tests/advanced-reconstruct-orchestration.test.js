const assert = require('assert');
const {
    createAdvancedReconstructOrchestration,
} = require('../electron/advanced-reconstruct-orchestration');

function mockHost(overrides = {}) {
    return {
        requireFeature: () => ({ ok: true }),
        entitlement: {
            FEATURE_CONTEXT_RECONSTRUCT: 'basic',
            FEATURE_BILINGUAL_SEMANTIC_REVIEW: 'semantic',
        },
        asPlainObject: (v) => (v && typeof v === 'object' ? { ...v } : {}),
        asString: (v, max = 256) => String(v ?? '').slice(0, max),
        enrichReconstructPayloadFromSettings: (p) => p,
        readAdvancedDoc: () => ({ doc: {} }),
        resolveAdvancedLlmConfig: async () => ({ ok: true, source: 'mock' }),
        logAdvancedLlmToEngine: () => {},
        loadAdvancedModule: () => ({ loaded: false, module: {} }),
        allowBuiltinProAlgorithms: () => true,
        missingClosedModuleError: (label) => ({ ok: false, error: label, code: 'advanced_module_missing' }),
        mapCaughtAbortError: (err) => ({ ok: false, error: String(err?.message || err) }),
        releaseManagedLlmAfterJob: () => {},
        ...overrides,
    };
}

describe('createAdvancedReconstructOrchestration', () => {
    it('exports the four orchestration APIs', () => {
        const api = createAdvancedReconstructOrchestration(mockHost());
        assert.strictEqual(typeof api.runContextReconstruct, 'function');
        assert.strictEqual(typeof api.runContextReconstructBody, 'function');
        assert.strictEqual(typeof api.runBilingualSemanticReview, 'function');
        assert.strictEqual(typeof api.runBilingualSemanticReviewBody, 'function');
    });

    it('rejects incomplete host', () => {
        assert.throws(
            () => createAdvancedReconstructOrchestration({}),
            /createAdvancedReconstructOrchestration: host\.\w+ required/,
        );
    });

    it('returns gate failure early for reconstruct body', async () => {
        const gate = { ok: false, error: '需要 Pro', code: 'not_entitled' };
        const { runContextReconstructBody } = createAdvancedReconstructOrchestration(mockHost({
            requireFeature: () => gate,
        }));
        const res = await runContextReconstructBody({ cues: [] });
        assert.strictEqual(res.ok, false);
        assert.strictEqual(res.code, 'not_entitled');
    });

    it('returns gate failure early for semantic review body', async () => {
        const gate = { ok: false, error: '需要 Pro', code: 'not_entitled' };
        const { runBilingualSemanticReviewBody } = createAdvancedReconstructOrchestration(mockHost({
            requireFeature: () => gate,
        }));
        const res = await runBilingualSemanticReviewBody({ cues: [] });
        assert.strictEqual(res.ok, false);
        assert.strictEqual(res.code, 'not_entitled');
    });

    it('dry-run reconstruct body returns ok via builtin mock', async () => {
        const { runContextReconstructBody } = createAdvancedReconstructOrchestration(mockHost());
        const res = await runContextReconstructBody({
            dryRun: true,
            cues: [
                { index: 0, startMs: 0, endMs: 1000, text: 'hello' },
            ],
        });
        assert.strictEqual(res.ok, true);
        assert.ok(res.via === 'mock' || res.via === 'builtin' || res.mock === true);
    });

    it('returns missing-module error when builtins disallowed', async () => {
        const { runContextReconstructBody } = createAdvancedReconstructOrchestration(mockHost({
            allowBuiltinProAlgorithms: () => false,
            loadAdvancedModule: () => ({ loaded: false, error: 'no module' }),
        }));
        const res = await runContextReconstructBody({ dryRun: true, cues: [] });
        assert.strictEqual(res.ok, false);
        assert.strictEqual(res.code, 'advanced_module_missing');
    });
});
