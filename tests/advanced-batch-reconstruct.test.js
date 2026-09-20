const assert = require('assert');
const {
    attachSourceTexts,
    mergeTextsIntoCues,
    createAdvancedBatchReconstruct,
} = require('../electron/advanced-batch-reconstruct');

function mockHost(overrides = {}) {
    return {
        requireFeature: () => ({ ok: true }),
        entitlement: {
            FEATURE_FILM_CONTEXT_RECONSTRUCT: 'film',
            FEATURE_CONTEXT_RECONSTRUCT: 'basic',
        },
        asPlainObject: (v) => (v && typeof v === 'object' ? { ...v } : {}),
        enrichReconstructPayloadFromSettings: (p) => p,
        readAdvancedDoc: () => ({ doc: {} }),
        clearManagedIdleStopTimer: () => {},
        resolveAdvancedLlmConfig: async () => ({ ok: true, source: 'mock' }),
        logAdvancedLlmToEngine: () => {},
        loadAdvancedModule: () => ({ loaded: false, module: {} }),
        isAppPackaged: () => false,
        allowBuiltinProAlgorithms: () => true,
        missingClosedModuleError: (label) => ({ ok: false, error: label, code: 'advanced_module_missing' }),
        mapCaughtAbortError: (err) => ({ ok: false, error: String(err?.message || err) }),
        releaseManagedLlmAfterJob: () => {},
        runContextReconstruct: async () => ({ ok: true }),
        cancelContextReconstruct: () => ({ ok: true }),
        waitForComputeLockIdle: async () => true,
        stopManagedLlmServerQuiet: () => {},
        batchAbortController: null,
        ...overrides,
    };
}

describe('advanced-batch-reconstruct helpers', () => {
    it('attaches source text by overlap', () => {
        const cues = [
            { index: 0, startMs: 0, endMs: 1000, text: '你好' },
            { index: 1, startMs: 2000, endMs: 3000, text: '世界' },
        ];
        const sources = [
            { startMs: 0, endMs: 1000, text: 'hello' },
            { startMs: 2000, endMs: 3000, text: 'world' },
        ];
        const out = attachSourceTexts(cues, sources);
        assert.strictEqual(out[0].sourceText, 'hello');
        assert.strictEqual(out[1].sourceText, 'world');
    });

    it('merges updates by index', () => {
        const cues = [
            { index: 0, text: 'a' },
            { index: 1, text: 'b' },
        ];
        const { cues: next, changed } = mergeTextsIntoCues(cues, [
            { index: 1, text: 'B' },
        ]);
        assert.strictEqual(changed, 1);
        assert.strictEqual(next[0].text, 'a');
        assert.strictEqual(next[1].text, 'B');
    });
});

describe('createAdvancedBatchReconstruct', () => {
    it('exports film/batch job APIs', () => {
        const api = createAdvancedBatchReconstruct(mockHost());
        assert.strictEqual(typeof api.runFilmContextReconstruct, 'function');
        assert.strictEqual(typeof api.runFilmContextReconstructBody, 'function');
        assert.strictEqual(typeof api.runBatchContextReconstructJob, 'function');
        assert.strictEqual(typeof api.runBatchContextReconstructJobLocked, 'function');
    });

    it('rejects incomplete host', () => {
        assert.throws(
            () => createAdvancedBatchReconstruct({}),
            /createAdvancedBatchReconstruct: host\.\w+ required/,
        );
    });

    it('returns gate failure early for batch job', async () => {
        const gate = { ok: false, error: '需要 Pro', code: 'not_entitled' };
        const { runBatchContextReconstructJob } = createAdvancedBatchReconstruct(mockHost({
            requireFeature: () => gate,
        }));
        const res = await runBatchContextReconstructJob(null, {
            files: [{ path: 'a.srt' }],
        });
        assert.strictEqual(res.ok, false);
        assert.strictEqual(res.code, 'not_entitled');
    });

    it('returns gate failure early for film body', async () => {
        const gate = { ok: false, error: '需要 Pro', code: 'not_entitled' };
        const { runFilmContextReconstructBody } = createAdvancedBatchReconstruct(mockHost({
            requireFeature: () => gate,
        }));
        const res = await runFilmContextReconstructBody({ cues: [] });
        assert.strictEqual(res.ok, false);
        assert.strictEqual(res.code, 'not_entitled');
    });

    it('returns early when files list is empty', async () => {
        const { runBatchContextReconstructJob } = createAdvancedBatchReconstruct(mockHost());
        const res = await runBatchContextReconstructJob(null, { files: [] });
        assert.strictEqual(res.ok, false);
        assert.match(String(res.error || ''), /至少一个字幕文件/);
    });
});
