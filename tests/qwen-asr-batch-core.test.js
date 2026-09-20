const assert = require('assert');
const batch = require('../src/js/qwen-asr-batch-core');

describe('qwen-asr-batch-core', () => {
    it('normalizeQwenAsrBatchMode', () => {
        assert.strictEqual(batch.normalizeQwenAsrBatchMode(undefined), 'auto');
        assert.strictEqual(batch.normalizeQwenAsrBatchMode('aggressive'), 'aggressive');
        assert.strictEqual(batch.normalizeQwenAsrBatchMode('fast'), 'aggressive');
        assert.strictEqual(batch.normalizeQwenAsrBatchMode('conservative'), 'conservative');
        assert.strictEqual(batch.normalizeQwenAsrBatchMode('safe'), 'conservative');
    });

    it('describeQwenAsrBatchMode hides for non-Qwen ASR', () => {
        const tip = batch.describeQwenAsrBatchMode({ engineAsrModel: 'anime-whisper' });
        assert.strictEqual(tip.visible, false);
    });

    it('describeQwenAsrBatchMode shows caps for 1.7B', () => {
        const tip = batch.describeQwenAsrBatchMode({
            engineAsrModel: 'qwen3-asr-1.7b-ja-anime-galgame',
            qwenAsrBatchMode: 'aggressive',
            gpuFreeMiB: 16000,
            gpuTotalMiB: 16384,
        });
        assert.strictEqual(tip.visible, true);
        assert.ok(tip.detail.includes('16'));
    });

    it('resolveIslandBatchSize honors session OOM cap', () => {
        const n = batch.resolveIslandBatchSize({
            asrModelId: 'qwen3-asr-1.7b-ja',
            qwenAsrBatchMode: 'aggressive',
            gpuFreeMiB: 16000,
            gpuTotalMiB: 16384,
            sessionCap: 6,
        });
        assert.strictEqual(n, 6);
    });

    it('formatQwenAsrBatchHintText notes speed profile downgrade', () => {
        const hint = batch.formatQwenAsrBatchHintText({
            engineAsrModel: 'qwen3-asr-1.7b-ja',
            qwenAsrBatchMode: 'aggressive',
            perfProfile: 'speed',
            gpuFreeMiB: 16000,
            gpuTotalMiB: 16384,
        });
        assert.strictEqual(hint.visible, true);
        assert.ok(hint.text.includes('保守'));
        assert.ok(hint.text.includes('转写偏好=速度'));
    });
});
