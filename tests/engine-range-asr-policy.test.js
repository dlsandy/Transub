const assert = require('assert');
const policy = require('../electron/engine-range-asr-policy');

describe('engine-range-asr-policy', () => {
    it('clamps window and pad', () => {
        const w = policy.clampRangeWindow({ startMs: 1000, endMs: 1050, padMs: 5000 });
        assert.strictEqual(w.endMs, 1200);
        assert.strictEqual(w.padMs, 2000);
        assert.strictEqual(w.clipStartMs, 0);
        assert.strictEqual(w.clipEndMs, 3200);
    });

    it('normalizes opus cues and strips llm mt', () => {
        const cues = policy.normalizeOpusTextCues([
            { index: 1, text: ' hi ', startMs: 1000, endMs: 2000 },
            { text: '  ' },
        ]);
        assert.strictEqual(cues.length, 1);
        assert.strictEqual(cues[0].start, 1);
        assert.strictEqual(cues[0].text, 'hi');

        const mt = policy.resolveNativeOpusMtModel(
            { engineOpusMtModel: 'opus-mt-ja-zh', engineMtModel: 'sakura-1.5b' },
            { mtModel: 'sakura-1.5b' },
            {
                isSakuraMtModel: (id) => /sakura/i.test(id),
                isLlmInferenceMtModel: () => false,
            },
        );
        assert.strictEqual(mt, '');
        assert.strictEqual(
            policy.resolveRangeAsrMtModel(
                { engineOpusMtModel: 'opus-mt-ja-zh', engineMtModel: 'sakura-1.5b', smartTranslate: true },
                {
                    isSakuraMtModel: (id) => /sakura/i.test(id),
                    isLlmInferenceMtModel: () => false,
                },
            ),
            null,
        );
    });

    it('builds ASR candidates and classifies fails', () => {
        assert.deepStrictEqual(
            policy.buildRangeAsrCandidates('sensevoice-small'),
            ['sensevoice-small', 'whisper-tiny'],
        );
        const tiny = policy.buildRangeAsrCandidates('whisper-tiny');
        assert.strictEqual(tiny[0], 'whisper-tiny');
        assert.ok(tiny.includes('sensevoice-small'));
        const ja = policy.buildBatchAsrCandidates('whisper-ja-1.5b');
        assert.ok(ja.indexOf('reazonspeech-k2') < ja.indexOf('sensevoice-small'));
        const cohere = policy.buildBatchAsrCandidates('cohere-transcribe-03-2026');
        assert.deepStrictEqual(cohere, [
            'cohere-transcribe-03-2026',
            'parakeet-tdt-0.6b-v2',
            'sensevoice-small',
            'whisper-tiny',
            'whisper-large-v3-turbo',
        ]);
        const anime = policy.buildBatchAsrCandidates('anime-whisper');
        assert.ok(anime.includes('qwen3-asr-1.7b-ja-anime-galgame'));
        assert.ok(anime.indexOf('qwen3-asr-1.7b-ja-anime-galgame') < anime.indexOf('sensevoice-small'));
        const qwenBatch = policy.buildBatchAsrCandidates('qwen3-asr-0.6b');
        assert.ok(qwenBatch.includes('qwen3-asr-1.7b-ja-anime-galgame'));
        assert.ok(qwenBatch.includes('qwen3-asr-1.7b'));
        assert.ok(!qwenBatch.includes('qwen3-asr-1.7b-ja'));
        assert.ok(qwenBatch.indexOf('whisper-ja-1.5b') < qwenBatch.indexOf('sensevoice-small'));
        const qwenRange = policy.buildRangeRetranscribeAsrCandidates('qwen3-asr-0.6b');
        assert.deepStrictEqual(qwenRange, [
            'qwen3-asr-0.6b',
            'sensevoice-small',
            'whisper-tiny',
        ]);
        assert.ok(qwenRange.length <= policy.RANGE_RETRANSCRIBE_FAILOVER_MAX);
        assert.strictEqual(policy.isEmptyAsrFail({ code: 'ASR_EMPTY' }), true);
        assert.strictEqual(policy.isRetryableAsrFail({ error: 'model not found' }), true);
        assert.strictEqual(policy.isRetryableAsrFail({ error: 'cuda oom' }), false);
    });

    it('caps full-file ASR failover under speed profile', () => {
        const full = policy.buildBatchAsrCandidates('sensevoice-small');
        assert.ok(full.length >= 3);
        const speed = policy.buildBatchAsrCandidates('sensevoice-small', { perfProfile: 'speed' });
        assert.deepStrictEqual(speed, ['sensevoice-small', 'whisper-tiny']);
        assert.strictEqual(speed.length, policy.BATCH_ASR_FAILOVER_SPEED_MAX);
        const animeSpeed = policy.buildBatchAsrCandidates('anime-whisper', { perfProfile: 'fast' });
        assert.strictEqual(animeSpeed.length, 2);
        assert.strictEqual(animeSpeed[0], 'anime-whisper');
        const quality = policy.buildBatchAsrCandidates('anime-whisper', { perfProfile: 'quality' });
        assert.strictEqual(quality.length, policy.BATCH_ASR_FAILOVER_QUALITY_MAX);
        assert.strictEqual(quality[0], 'anime-whisper');
        assert.ok(quality.length < full.length || full.length <= policy.BATCH_ASR_FAILOVER_QUALITY_MAX);
        assert.deepStrictEqual(
            policy.limitBatchAsrFailoverChain(full, { maxCandidates: 1 }),
            ['sensevoice-small'],
        );
        assert.strictEqual(policy.BATCH_ASR_EMPTY_STREAK_STOP, 2);
    });

    it('filters failover candidates to installed ids (keeps primary)', () => {
        const full = policy.buildBatchAsrCandidates('anime-whisper');
        const filtered = policy.filterAsrCandidatesByInstalled(
            full,
            ['anime-whisper', 'sensevoice-small', 'whisper-tiny'],
            { primaryAsr: 'anime-whisper' },
        );
        assert.deepStrictEqual(filtered, ['anime-whisper', 'sensevoice-small', 'whisper-tiny']);
        assert.ok(!filtered.includes('qwen3-asr-1.7b-ja-anime-galgame'));
        const noFilter = policy.filterAsrCandidatesByInstalled(full, null, {
            primaryAsr: 'anime-whisper',
        });
        assert.deepStrictEqual(noFilter, full);
        const onlyPrimary = policy.filterAsrCandidatesByInstalled(
            full,
            [],
            { primaryAsr: 'anime-whisper' },
        );
        assert.deepStrictEqual(onlyPrimary, ['anime-whisper']);
    });

    it('remaps clip cues to timeline', () => {
        const cues = policy.remapClipCuesToTimeline([
            { startMs: 100, endMs: 500, text: 'a' },
            { startMs: 600, text: 'b' },
            { startMs: 0, endMs: 1, text: '  ' },
        ], 10000);
        assert.strictEqual(cues.length, 2);
        assert.strictEqual(cues[0].startMs, 10100);
        assert.strictEqual(cues[1].endMs, 11600);
    });
});
