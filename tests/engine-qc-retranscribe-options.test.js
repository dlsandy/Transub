const assert = require('assert');
const {
    pickQcRetranscribeSource,
    buildQcRetranscribeEngineOptions,
    resolveQcRetranscribeEngineContext,
} = require('../electron/engine-qc-retranscribe-options');

describe('engine-qc-retranscribe-options', () => {
    it('prefers batch primaryAsr over saved defaults', () => {
        const { options, primaryAsr } = buildQcRetranscribeEngineOptions({
            primaryAsr: 'qwen3-asr-1.7b-ja-anime-galgame',
            language: 'ja',
            contentProfile: 'av-soft',
            _batchMode: true,
        });
        assert.equal(primaryAsr, 'qwen3-asr-1.7b-ja-anime-galgame');
        assert.equal(options.engineAsrModel, 'qwen3-asr-1.7b-ja-anime-galgame');
        assert.equal(options.language, 'ja');
        assert.equal(options.contentProfile, 'av-soft');
        assert.equal(options.task, 'transcribe');
        assert.equal(options.mergeSegments, false);
        assert.equal(options.releaseGpuAfter, false);
    });

    it('keeps GPU loaded only during batch burst retranscribe', () => {
        const burst = buildQcRetranscribeEngineOptions({
            engineAsrModel: 'anime-whisper',
            _batchMode: true,
        });
        assert.equal(burst.options.releaseGpuAfter, false);

        const manual = buildQcRetranscribeEngineOptions({
            engineAsrModel: 'anime-whisper',
        });
        assert.equal(manual.options.releaseGpuAfter, true);
    });

    it('pickQcRetranscribeSource reads nested engineOptions', () => {
        const picked = pickQcRetranscribeSource({
            engineOptions: {
                engineAsrModel: 'whisper-ja-1.5b',
                beamSize: 8,
                qwenAsrBatchMode: 'aggressive',
                perfProfile: 'speed',
                unrelated: 'skip-me',
            },
        });
        assert.equal(picked.engineAsrModel, 'whisper-ja-1.5b');
        assert.equal(picked.beamSize, 8);
        assert.equal(picked.qwenAsrBatchMode, 'aggressive');
        assert.equal(picked.perfProfile, 'speed');
        assert.equal(picked.unrelated, undefined);
    });

    it('resolveQcRetranscribeEngineContext reuses prebuilt engineOptions', () => {
        const ctx = resolveQcRetranscribeEngineContext({
            engineOptions: {
                engineAsrModel: 'qwen3-asr-1.7b-ja-anime-galgame',
                language: 'ja',
                releaseGpuAfter: false,
            },
            primaryAsr: 'qwen3-asr-1.7b-ja-anime-galgame',
            _batchMode: true,
        });
        assert.equal(ctx.primaryAsr, 'qwen3-asr-1.7b-ja-anime-galgame');
        assert.equal(ctx.options.engineAsrModel, 'qwen3-asr-1.7b-ja-anime-galgame');
        assert.equal(ctx.burstMode, true);
        assert.equal(ctx.options.releaseGpuAfter, false);
    });
});
