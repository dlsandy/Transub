'use strict';

const assert = require('assert');
const lexicon = require('../src/js/mt-sanitize-lexicon');
const policy = require('../tools/mt-train/lib/scan-policy');
const { alignCues, alignCuesDp, alignCuesGreedy } = require('../tools/mt-train/lib/srt');

describe('mt-sanitize algo (lexicon / align / score)', () => {
    it('classifies climax polarity prefer_go vs prefer_shoot', () => {
        assert.strictEqual(lexicon.classifyClimaxPolarity('おまんこいっちゃう…'), 'prefer_go');
        assert.strictEqual(lexicon.classifyClimaxPolarity('せんせい、乳首でイキます…'), 'prefer_go');
        assert.strictEqual(lexicon.classifyClimaxPolarity('あ、イッちゃいそうよ。'), 'prefer_go');
        assert.strictEqual(lexicon.classifyClimaxPolarity('イクイク…ッッ!'), 'prefer_shoot');
        assert.strictEqual(lexicon.classifyClimaxPolarity('中に出して'), 'prefer_shoot');
        assert.strictEqual(lexicon.classifyClimaxPolarity('こんにちは'), 'abstain');
        assert.strictEqual(lexicon.classifyClimaxPolarity('らめらめっ…イクイクイクイクイク…'), 'prefer_go');
        assert.strictEqual(lexicon.classifyClimaxPolarity('はぁっんんっダメイッちゃったわぁ…'), 'prefer_go');
        assert.strictEqual(lexicon.classifyClimaxPolarity('ダメディッチャ…イッちゃイッちゃ…ダメダメ…'), 'prefer_go');
        assert.strictEqual(lexicon.classifyClimaxPolarity('やめろ、もっとイッちゃう…'), 'prefer_go');
        assert.strictEqual(lexicon.classifyClimaxPolarity('明日出してくれ…いっく…'), 'prefer_shoot');
    });

    it('zh sufficiency treats short climax gloss as enough', () => {
        assert.ok(lexicon.isZhSufficientForJa('イクイク…ッッ!', '要射了'));
        assert.ok(lexicon.isZhSufficientForJa('ちくび舐めなめ…', '舔乳头…'));
        assert.ok(!lexicon.isZhSufficientForJa('立ったまま入れて…', '站着做'));
        assert.ok(lexicon.isZhSufficientForJa('立ったまま入れて…', '站着插进来…'));
    });

    it('marks ASR garbage and skips score', () => {
        assert.ok(lexicon.isAsrGarbageJa('先生こんらの、ちょっと…'));
        const scored = lexicon.residualScore({
            src: '先生こんらの、ちょっと…',
            dst: '老师',
            after: '老师',
        });
        assert.strictEqual(scored.cls, 'asr_garbage');
        assert.strictEqual(scored.score, 0);
    });

    it('under_stub only when anchors missing', () => {
        assert.strictEqual(
            lexicon.classifyResidual('イクイク…ッッ!', '射射！', '要射了', ['domain_term']),
            'reusable_semantic',
        );
        assert.strictEqual(
            lexicon.classifyResidual('触ってあげるから', '给你开发', '给你开发', []),
            'under_stub',
        );
        assert.ok(policy.isTrainableUnder({
            src: '触ってあげるから',
            dst: '给你开发',
            after: '给你开发',
        }));
        assert.ok(!policy.isTrainableUnder({
            src: 'イクイク…ッッ!',
            dst: '射射！',
            after: '要射了',
            flags: ['domain_term'],
        }));
    });

    it('soft_go respects prefer_go polarity', () => {
        assert.strictEqual(
            policy.bucketResidual({
                src: 'あ、イッちゃいそうよ。',
                dst: '啊 要射了',
                after: '啊 要去了',
            }),
            null,
        );
    });

    it('matchStubRules indexes by JA features', () => {
        const hit = lexicon.matchStubRules([
            {
                id: 'a',
                needs: ['sensei'],
                match: () => true,
                ok: () => '老师',
            },
            {
                id: 'b',
                needs: ['rod'],
                match: () => true,
                ok: () => '肉棒',
            },
        ], 'x', '先生どうする');
        assert.strictEqual(hit.id, 'a');
        assert.strictEqual(hit.text, '老师');
    });

    it('alignCues DP emits gaps for unmatched JA', () => {
        const ja = [
            { start: 0, text: 'A', time: 'a' },
            { start: 5000, text: 'B', time: 'b' },
            { start: 10000, text: 'C', time: 'c' },
        ];
        const zh = [
            { start: 0, text: '甲' },
            { start: 10000, text: '丙' },
        ];
        const greedy = alignCuesGreedy(ja, zh, 1200);
        assert.ok(greedy.some((p) => p.alignGap && p.src === 'B'));
        const dp = alignCuesDp(ja, zh, 1200);
        assert.strictEqual(dp.filter((p) => !p.alignGap).length, 2);
        assert.ok(dp.some((p) => p.alignGap && p.src === 'B'));
        const noGaps = alignCues(ja, zh, 1200, { mode: 'dp', includeGaps: false });
        assert.ok(noGaps.every((p) => !p.alignGap));
    });

    it('rankResiduals prefers high-reuse under stubs', () => {
        const ranked = policy.rankResiduals([
            { code: 'X', i: 1, src: 'こんにちは', dst: '你好', after: '你好' },
            { code: 'X', i: 2, src: '触ってあげるから', dst: '给你开发', after: '给你开发' },
            { code: 'X', i: 3, src: 'イクイク…ッッ!', dst: '射射！', after: '要射了', flags: ['domain_term'] },
        ]);
        assert.ok(ranked.length >= 1);
        assert.ok(ranked[0].src.includes('触って'));
        assert.ok(ranked[0].score > 0);
    });
});
