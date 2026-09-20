const assert = require('assert');
const {
    resolveReleaseGpuAfterForBatchItem,
    shouldReleaseGpuAfterQwenBatch,
} = require('../electron/engine-release-gpu-policy');

describe('engine-release-gpu-policy', () => {
    it('honors explicit releaseGpuAfter for Qwen batch', () => {
        assert.strictEqual(
            resolveReleaseGpuAfterForBatchItem(
                { releaseGpuAfter: true, engineAsrModel: 'qwen3-asr-1.7b-ja' },
                { batchItemCount: 3, sakuraOrSmart: false },
            ),
            true,
        );
    });

    it('auto null releases GPU between multi-file batch items', () => {
        assert.strictEqual(
            resolveReleaseGpuAfterForBatchItem(
                { releaseGpuAfter: null, engineAsrModel: 'qwen3-asr-0.6b' },
                { batchItemCount: 2, sakuraOrSmart: false },
            ),
            true,
        );
        assert.strictEqual(
            resolveReleaseGpuAfterForBatchItem(
                { releaseGpuAfter: null, engineAsrModel: 'anime-whisper' },
                { batchItemCount: 4, sakuraOrSmart: false },
            ),
            true,
        );
        assert.strictEqual(
            resolveReleaseGpuAfterForBatchItem(
                { releaseGpuAfter: null, engineAsrModel: 'sensevoice-small' },
                { batchItemCount: 3, sakuraOrSmart: false },
            ),
            true,
        );
    });

    it('auto null still holds GPU for single-file batch', () => {
        assert.strictEqual(
            resolveReleaseGpuAfterForBatchItem(
                { releaseGpuAfter: null, engineAsrModel: 'qwen3-asr-1.7b-ja' },
                { batchItemCount: 1, sakuraOrSmart: false },
            ),
            false,
        );
    });

    it('explicit false keeps GPU warm across multi-file batch', () => {
        assert.strictEqual(
            resolveReleaseGpuAfterForBatchItem(
                { releaseGpuAfter: false, engineAsrModel: 'qwen3-asr-1.7b-ja' },
                { batchItemCount: 4, sakuraOrSmart: false },
            ),
            false,
        );
    });

    it('Sakura/smart auto still releases GPU', () => {
        assert.strictEqual(
            resolveReleaseGpuAfterForBatchItem(
                { releaseGpuAfter: null, engineAsrModel: 'qwen3-asr-1.7b-ja' },
                { batchItemCount: 3, sakuraOrSmart: true },
            ),
            true,
        );
    });

    it('shouldReleaseGpuAfterQwenBatch only after auto-held multi Qwen batch', () => {
        assert.strictEqual(
            shouldReleaseGpuAfterQwenBatch(
                { releaseGpuAfter: null, engineAsrModel: 'qwen3-asr-1.7b-ja' },
                { batchItemCount: 2, primaryAsr: 'qwen3-asr-1.7b-ja' },
            ),
            true,
        );
        assert.strictEqual(
            shouldReleaseGpuAfterQwenBatch(
                { releaseGpuAfter: true, engineAsrModel: 'qwen3-asr-1.7b-ja' },
                { batchItemCount: 2 },
            ),
            false,
        );
        assert.strictEqual(
            shouldReleaseGpuAfterQwenBatch(
                { releaseGpuAfter: null, engineAsrModel: 'anime-whisper' },
                { batchItemCount: 2, primaryAsr: 'anime-whisper' },
            ),
            false,
        );
    });

    it('shouldReleaseGpuAfterBatch releases unless keep-warm false', () => {
        const {
            shouldReleaseGpuAfterBatch,
        } = require('../electron/engine-release-gpu-policy');
        assert.strictEqual(shouldReleaseGpuAfterBatch({ releaseGpuAfter: false }), false);
        assert.strictEqual(shouldReleaseGpuAfterBatch({ releaseGpuAfter: true }), true);
        assert.strictEqual(shouldReleaseGpuAfterBatch({ releaseGpuAfter: null }), true);
        assert.strictEqual(shouldReleaseGpuAfterBatch({}), true);
    });
});
