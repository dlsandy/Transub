'use strict';

const assert = require('assert');
const {
    createTranswithAiBatchLoop,
    REQUIRED_HOST_KEYS,
} = require('../electron/transwithai-batch-loop');

function mockHost(overrides = {}) {
    return {
        jobCancelled: false,
        dualCore: {
            resolveDualSourceSuffix: () => '.ja',
            normalizeDualTargetSuffix: () => '.zh',
            mapDualPassProgress: (_i, pct) => pct,
        },
        modelCore: {
            resolvePassModelPath: (opts) => opts.modelPath || '',
        },
        broadcastProgress: () => {},
        broadcastToSubtitleTaskUi: () => {},
        resolveInferOutputDir: () => '',
        resolveDualSubtitlePaths: () => ({ complete: false }),
        resolveLocalSubtitlePath: () => null,
        runInferOnce: async () => ({ subtitlePath: '' }),
        mapInferStageProgress: () => 0,
        resolveSafePath: (p) => p,
        buildDualPassOptions: (opts) => opts,
        renameStemSubtitlesWithSuffix: () => [],
        dualTargetPathFromSource: (p) => p,
        applyPostBatchPipeline: () => {},
        setSessionPostTaskOptions: () => {},
        writeMergedBilingualSubtitleFiles: () => '',
        unlinkSubtitleFilesQuietly: () => {},
        ...overrides,
    };
}

describe('transwithai-batch-loop', () => {
    it('exports createTranswithAiBatchLoop and REQUIRED_HOST_KEYS', () => {
        assert.strictEqual(typeof createTranswithAiBatchLoop, 'function');
        assert.ok(Array.isArray(REQUIRED_HOST_KEYS));
        assert.ok(REQUIRED_HOST_KEYS.length > 5);
    });

    it('throws without host', () => {
        assert.throws(() => createTranswithAiBatchLoop(null), /host required/);
        assert.throws(() => createTranswithAiBatchLoop(undefined), /host required/);
    });

    it('rejects incomplete host', () => {
        assert.throws(
            () => createTranswithAiBatchLoop({}),
            /incomplete host/,
        );
    });

    it('exports executeSubtitleBatchLoop', () => {
        const api = createTranswithAiBatchLoop(mockHost());
        assert.strictEqual(typeof api.executeSubtitleBatchLoop, 'function');
    });

    it('empty items returns ok summary with mock host', async () => {
        const { executeSubtitleBatchLoop } = createTranswithAiBatchLoop(mockHost());
        const res = await executeSubtitleBatchLoop(
            [],
            { task: 'transcribe' },
            { path: '/tmp/twai' },
            null,
            null,
            null,
        );
        assert.strictEqual(res.ok, true);
        assert.strictEqual(res.generated, 0);
        assert.strictEqual(res.skipped, 0);
        assert.strictEqual(res.failed, 0);
        assert.strictEqual(res.total, 0);
        assert.deepStrictEqual(res.errors, []);
        assert.deepStrictEqual(res.outputs, []);
    });
});
