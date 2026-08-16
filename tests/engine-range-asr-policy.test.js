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
        assert.strictEqual(mt, 'opus-mt-ja-zh');
    });

    it('builds ASR candidates and classifies fails', () => {
        assert.deepStrictEqual(
            policy.buildRangeAsrCandidates('sensevoice-small'),
            ['sensevoice-small', 'whisper-tiny', 'whisper-large-v3-turbo'],
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
        const qwen = policy.buildBatchAsrCandidates('qwen3-asr-0.6b');
        assert.ok(qwen.includes('qwen3-asr-1.7b-ja-anime-galgame'));
        assert.ok(qwen.includes('qwen3-asr-1.7b-ja'));
        assert.ok(qwen.indexOf('whisper-ja-1.5b') < qwen.indexOf('sensevoice-small'));
        assert.strictEqual(policy.isEmptyAsrFail({ code: 'ASR_EMPTY' }), true);
        assert.strictEqual(policy.isRetryableAsrFail({ error: 'model not found' }), true);
        assert.strictEqual(policy.isRetryableAsrFail({ error: 'cuda oom' }), false);
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
