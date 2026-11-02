const assert = require('assert');
const split = require('../src/js/acoustic-sentence-split-core');

const TWO_SENTENCES = '今日はいい天気ですね。明日も晴れるといいです';

function cue(startMs, endMs, text) {
    return { startMs, endMs, text };
}

describe('acoustic-sentence-split-core', () => {
    it('turns acoustic off and asrTiming off into a full skip', () => {
        assert.strictEqual(split.resolveSentenceSplitMode({ acousticBandAdapt: 'off' }), 'off');
        assert.strictEqual(split.resolveSentenceSplitMode({ asrTiming: 'off' }), 'off');
        assert.strictEqual(split.resolveSentenceSplitMode({
            acousticBandAdapt: 'on',
            perfProfile: 'speed',
        }), 'pcm');
        assert.strictEqual(split.resolveSentenceSplitMode({
            acousticBandAdapt: 'auto',
            perfProfile: 'quality',
        }), 'full');
    });

    it('treats anime-whisper as CT2 and Qwen as not', () => {
        assert.strictEqual(split.isCt2WhisperPrimary('anime-whisper'), true);
        assert.strictEqual(split.isCt2WhisperPrimary('kotoba-whisper-v2.0-faster'), true);
        assert.strictEqual(split.isCt2WhisperPrimary('qwen3-asr-1.7b'), false);
        assert.strictEqual(split.isCt2WhisperPrimary('sensevoice-small'), false);
    });

    it('rejects a cut that would leave はい alone', () => {
        const cuts = split.listLegalCuts('今日は晴れている。はい');
        assert.strictEqual(cuts.length, 0);
        assert.strictEqual(split.isOrphanFragment('はい'), true);
        assert.strictEqual(split.isOrphanFragment('うん!'), true);
    });

    it('gives av_soft an implicit soft hint and lets a music band override it', () => {
        const softCue = cue(0, 8000, TWO_SENTENCES);
        assert.strictEqual(split.cueAcousticHint(softCue, [], 'av_soft'), 'soft');
        assert.strictEqual(split.cueAcousticHint(softCue, [
            { hint: 'music', startSec: 0, endSec: 30 },
        ], 'av_soft'), 'music');
    });

    it('selects long soft cues for PCM and keeps metronome off music, neutral, Qwen, and speed', () => {
        const cues = [
            cue(0, 8000, TWO_SENTENCES),
            cue(20000, 23000, TWO_SENTENCES),
            cue(40000, 48000, TWO_SENTENCES),
        ];
        const bands = [{ hint: 'music', startSec: 40, endSec: 55 }];
        const selected = split.selectPcmCandidates(cues, {
            contentProfile: 'av_soft',
            bands,
            perfProfile: 'quality',
            primaryAsr: 'anime-whisper',
        });
        assert.strictEqual(selected.length, 2);
        assert.strictEqual(selected[0].hint, 'soft');
        assert.strictEqual(selected[1].hint, 'music');
        assert.strictEqual(split.canUseMetronome('soft', {
            perfProfile: 'quality',
            primaryAsr: 'anime-whisper',
        }), true);
        assert.strictEqual(split.canUseMetronome('music', {
            perfProfile: 'quality',
            primaryAsr: 'anime-whisper',
        }), false);
        assert.strictEqual(split.canUseMetronome('neutral', {
            perfProfile: 'quality',
            primaryAsr: 'whisper-large-v3',
        }), false);
        assert.strictEqual(split.canUseMetronome('soft', {
            perfProfile: 'quality',
            primaryAsr: 'qwen3-asr-1.7b-ja-anime-galgame',
        }), false);
        assert.strictEqual(split.canUseMetronome('soft', {
            perfProfile: 'speed',
            acousticBandAdapt: 'on',
            primaryAsr: 'anime-whisper',
        }), false);
    });

    it('splits on the valley nearest the sentence mark and ignores a far boundary', () => {
        const row = cue(10000, 18000, TWO_SENTENCES);
        const cut = split.listLegalCuts(row.text)[0];
        const prior = split.cutPriorMs(row, cut.index, row.text.length);
        const plan = split.choosePcmSplit(row, [
            { ms: prior - 120, depth: 0.7 },
            { ms: prior + 2000, depth: 0.9 },
        ]);
        assert.ok(plan);
        assert.strictEqual(plan.tier, 'pcm');
        assert.strictEqual(plan.cutIndex, cut.index);
        assert.ok(Math.abs(plan.midMs - (prior - 120)) < 2);

        const shallow = split.choosePcmSplit(row, [{ ms: prior, depth: 0.2 }]);
        assert.strictEqual(shallow, null);

        const snapped = split.chooseMetronomeSplit(row, [prior + 300]);
        assert.ok(snapped);
        assert.strictEqual(snapped.tier, 'metronome');
        assert.ok(Math.abs(snapped.midMs - (prior + 300)) < 2);

        const far = split.chooseMetronomeSplit(row, [prior + 2500]);
        assert.strictEqual(far, null);
    });

    it('caps metronome misses at the soft quota', () => {
        const misses = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
            hint: 'soft',
            startMs: i * 10000,
            endMs: i * 10000 + 8000,
            text: TWO_SENTENCES,
        }));
        const picked = split.selectMetronomeCandidates(misses, {
            perfProfile: 'quality',
            primaryAsr: 'anime-whisper',
        });
        assert.strictEqual(picked.length, split.MAX_METRONOME);
    });
});
