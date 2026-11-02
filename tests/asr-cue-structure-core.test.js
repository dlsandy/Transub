const assert = require('assert');
const structure = require('../src/js/asr-cue-structure-core');
const { cleanupAsrCues } = require('../electron/asr-cue-cleanup');

describe('asr-cue-structure-core', () => {
    it('strips later-sentence prefix bleed from previous cue', () => {
        const overlap = structure.findPrevSuffixBleedOverlap(
            '待ってくださいこんにちは',
            'こんにちは、元気？',
        );
        assert.strictEqual(overlap, 'こんにちは');

        const out = structure.stripPrevNeighborPrefixBleed([
            { startMs: 1000, endMs: 2200, text: '待ってくださいこんにちは' },
            { startMs: 2300, endMs: 3600, text: 'こんにちは、元気？' },
            { startMs: 5000, endMs: 6000, text: '普通の台詞です。' },
        ]);
        assert.strictEqual(out.stripped, 1);
        assert.strictEqual(out.cues[0].text, '待ってください');
        assert.strictEqual(out.cues[1].text, 'こんにちは、元気？');
        assert.strictEqual(out.cues[0].startMs, 1000);
        assert.strictEqual(out.cues[0].endMs, 2200);
    });

    it('does not strip shared short words that are whole next turns', () => {
        const out = structure.stripPrevNeighborPrefixBleed([
            { startMs: 0, endMs: 800, text: '気持ちいい…' },
            { startMs: 900, endMs: 2200, text: '旦那とどっちが気持ちいい?' },
        ]);
        assert.strictEqual(out.stripped, 0);
        assert.strictEqual(out.cues.length, 2);
    });

    it('merges incomplete same-clause JA neighbors across tiny gaps', () => {
        assert.ok(structure.looksIncompleteJaClause('今日は'));
        assert.ok(structure.looksIncompleteJaClause('行くから'));
        assert.ok(structure.looksIncompleteJaClause('最近'));
        assert.ok(structure.looksIncompleteJaClause('今日'));
        assert.ok(!structure.looksIncompleteJaClause('田さん'));
        assert.ok(!structure.looksIncompleteJaClause('スさん'));
        assert.ok(!structure.looksNewJaTurnStart('いい天気だね'));
        assert.ok(structure.looksNewJaTurnStart('うん…'));
        assert.ok(!structure.looksNewJaTurnStart('何日か経って'));
        assert.ok(structure.looksNewJaTurnStart('何？'));
        assert.ok(!structure.looksNewJaTurnStart('やったんです', '三人で'));
        assert.ok(structure.looksNewJaTurnStart('やった', 'だめだ…'));

        const out = structure.mergeIncompleteJaNeighborCues([
            { startMs: 0, endMs: 500, text: '今日は' },
            { startMs: 560, endMs: 1400, text: 'いい天気だね' },
            { startMs: 2000, endMs: 2500, text: '行くから' },
            { startMs: 2580, endMs: 3200, text: '先に帰るね' },
            { startMs: 4000, endMs: 4500, text: 'わかった。' },
            { startMs: 4550, endMs: 5000, text: 'うん…' },
            { startMs: 6000, endMs: 6300, text: '最近' },
            { startMs: 6380, endMs: 7200, text: '誘ってくれる人がいないですね' },
            { startMs: 8000, endMs: 8300, text: '今日' },
            { startMs: 8380, endMs: 9000, text: '疲れてるみたい' },
        ]);
        assert.ok(out.mergedPairs >= 4, JSON.stringify(out.stats));
        const texts = out.cues.map((c) => c.text);
        assert.ok(texts.some((t) => t.includes('今日は') && t.includes('いい天気')));
        assert.ok(texts.some((t) => t.includes('行くから') && t.includes('先に帰る')));
        assert.ok(texts.some((t) => /最近/.test(t) && /誘って/.test(t)), texts);
        assert.ok(texts.some((t) => /今日/.test(t) && /疲れ/.test(t)), texts);
        // Do not glue finished sentence onto うん turn
        assert.ok(texts.some((t) => String(t).trim() === 'うん…' || String(t).trim() === 'うん'));

        // Bare orphan connective (から｜みが好き) merges forward
        assert.ok(structure.looksIncompleteJaClause('から'));
        const kara = structure.mergeIncompleteJaNeighborCues([
            { startMs: 0, endMs: 500, text: 'から' },
            { startMs: 540, endMs: 1600, text: 'みが好きです' },
        ]);
        assert.strictEqual(kara.mergedPairs, 1);
        assert.strictEqual(kara.cues[0].text, 'からみが好きです');
    });

    it('splits overlong neighbor-greet + thanks weld', () => {
        const welded = 'あ、お隣の愛実です。この前はありがとうございました';
        const idx = structure.findJaMultiClauseSplitIndex(welded, { minBareChars: 20 });
        assert.ok(idx > 0, `idx=${idx}`);
        const out = structure.splitOverlongJaMultiClauseCues([
            { startMs: 1000, endMs: 5000, text: welded },
        ], { minBareChars: 20 });
        assert.strictEqual(out.splitCount, 1);
        assert.strictEqual(out.cues.length, 2);
        assert.ok(/お隣|愛実/.test(out.cues[0].text), out.cues[0].text);
        assert.ok(/ありがとう/.test(out.cues[1].text), out.cues[1].text);
        assert.ok(out.cues[0].endMs < out.cues[1].endMs);
    });

    it('does not treat あと/あたし as あ turn-starts', () => {
        assert.ok(!structure.looksNewJaTurnStart('あとはこの仕事は結構体力も使う'));
        assert.ok(!structure.looksNewJaTurnStart('あたしデカチンとエッチしてみたい'));
        assert.ok(structure.looksNewJaTurnStart('あ、いいね'));
        assert.ok(structure.looksNewJaTurnStart('あっ、やば'));
        assert.ok(structure.looksSoftDiscourseOpener('あとはピラティス'));
        assert.ok(structure.looksSoftDiscourseOpener('あの、細すぎても'));
        assert.ok(structure.looksSoftDiscourseOpener('そんなこと'));
    });

    it('merges wider-gap particle hangs and soft determiner continuations', () => {
        // Default gap raised: 今日は｜いい… across ~500ms
        assert.ok(structure.shouldMergeIncompleteJaNeighbors(
            '今日は',
            'いい天気だね',
            500,
        ));
        // Soft その after particle hang (was new-clause hard stop)
        assert.ok(structure.shouldMergeIncompleteJaNeighbors(
            '今日は',
            'その千万の話じゃなくて',
            400,
        ));
        // Contrastive そんな after bare し list = new turn (do not glue)
        assert.ok(!structure.shouldMergeIncompleteJaNeighbors(
            '時給もなかなかいいし',
            'そんなことないけど…ホント?',
            40,
        ));
        // Contrastive そんな after strong て may continue
        assert.ok(structure.shouldMergeIncompleteJaNeighbors(
            '気にしていて',
            'そんなに気にしなくてもいいよ',
            80,
        ));
        // Strong て hang allows ~900ms
        assert.ok(structure.shouldMergeIncompleteJaNeighbors(
            '刺激がなくて',
            '刺激が増えてきた',
            900,
        ));
        // Real turn stop still blocked
        assert.ok(!structure.shouldMergeIncompleteJaNeighbors(
            'わかった',
            'うん…',
            80,
        ));
        assert.ok(!structure.shouldMergeIncompleteJaNeighbors(
            '行くから',
            'はいすぐ行きます',
            40,
        ));
        // Name honorific must not glue into next turn via false ん-hang
        assert.ok(!structure.shouldMergeIncompleteJaNeighbors(
            '田さん',
            'そんなこと言わないで',
            40,
        ));
        // Continuative で + やったん (ellipsis-wrap list must not fire without … prev)
        const trio = structure.mergeIncompleteJaNeighborCues([
            { startMs: 0, endMs: 800, text: '三人で' },
            { startMs: 840, endMs: 1600, text: 'やったんです' },
        ]);
        assert.strictEqual(trio.mergedPairs, 1, JSON.stringify(trio.stats));
        assert.ok(/三人でやった/.test(trio.cues[0].text), trio.cues[0].text);
    });

    it('merges interview mid-word / continuative cuts and mid-word joins', () => {
        assert.ok(structure.looksLikelyMidWordSplit(
            '身体についてはとても気を遣っていて女性',
            '手らしく',
        ));
        // Shelf mid-mora: ど｜どの / いっ｜いっぱい / に｜について
        assert.ok(structure.looksMoraPrefixContinuation('この距離でど', 'どのくらいまで映ってる'));
        assert.ok(structure.looksLikelyMidWordSplit('この距離でど', 'どのくらいまで映ってるんですかこれって?'));
        assert.ok(structure.looksLikelyMidWordSplit(
            'まだまだ時間はよっぽどいっ',
            'いっぱいしてくれるんでしょ?',
        ));
        assert.ok(structure.looksLikelyMidWordSplit(
            'それでは新規取引案件の売り上げ予測に',
            'について、説明します。',
        ));
        // Verb-stem cut: 舐め｜したことない
        assert.ok(structure.looksLikelyMidWordSplit('ふふっ、舐め', 'したことないんだもんね'));
        assert.ok(structure.shouldMergeIncompleteJaNeighbors(
            'ふふっ、舐め',
            'したことないんだもんね',
            40,
        ));
        assert.ok(structure.looksIncompleteJaClause('こんなに'));
        // Do not glue trunc onto うん turn
        assert.ok(!structure.shouldMergeIncompleteJaNeighbors(
            '私の膣内に熱いのぶち込',
            'うん、いいわね…',
            40,
        ));
        // Do not glue reaction echoes
        assert.ok(!structure.looksMoraPrefixContinuation('伝えた方がいい', 'いいんじゃない'));
        assert.ok(!structure.shouldMergeIncompleteJaNeighbors(
            'でも、伝えた方がいい',
            'いいんじゃない?',
            40,
        ));
        assert.ok(structure.looksIncompleteJaClause('初めて約'));
        assert.ok(structure.looksIncompleteJaClause('海外旅行が元々好きだ'));
        assert.ok(!structure.looksIncompleteJaClause('あ、いいね'));
        assert.ok(!structure.shouldMergeIncompleteJaNeighbors(
            'あ、いいね',
            'ごちそうさまで、お疲れお疲れ!',
            40,
        ));
        assert.ok(structure.looksJaForwardContinuation('だったのでワクワクの方が強かったかもしれないです'));
        assert.ok(structure.looksStrongContinuativeIncomplete('朝起きたら必ずストレッチは行っていて'));

        const out = structure.mergeIncompleteJaNeighborCues([
            { startMs: 0, endMs: 800, text: '身体についてはとても気を遣っていて女性' },
            { startMs: 840, endMs: 1200, text: '手らしく' },
            { startMs: 2000, endMs: 2400, text: '初めて約' },
            { startMs: 2440, endMs: 3200, text: '一年が経ちます' },
            { startMs: 4000, endMs: 4800, text: '海外旅行が元々好きだ' },
            { startMs: 4840, endMs: 6000, text: 'だったのでワクワクの方が強かったかもしれないです' },
            { startMs: 7000, endMs: 8200, text: '朝起きたら必ずストレッチは行っていて' },
            { startMs: 8240, endMs: 9800, text: 'あとはこの仕事は結構体力も使うのでピラティスの教室' },
            { startMs: 11000, endMs: 11600, text: 'L.Aだったらもしかしたら、はじ' },
            { startMs: 11640, endMs: 12400, text: '止めてなかったかもしれないです' },
            { startMs: 13000, endMs: 13400, text: 'この距離でど' },
            { startMs: 13440, endMs: 14200, text: 'どのくらいまで映ってるんですかこれって?' },
            { startMs: 15000, endMs: 15600, text: 'それでは新規取引案件の売り上げ予測に' },
            { startMs: 15640, endMs: 16400, text: 'について、説明します。' },
            { startMs: 17000, endMs: 17500, text: 'はぁ…まだまだ時間はよっぽどいっ' },
            { startMs: 17540, endMs: 18200, text: 'いっぱいしてくれるんでしょ?' },
        ]);
        assert.ok(out.mergedPairs >= 8, JSON.stringify(out.stats));
        const texts = out.cues.map((c) => c.text);
        assert.ok(texts.some((t) => /女性らしく/.test(t)), texts);
        assert.ok(texts.some((t) => /初めて約一年/.test(t)), texts);
        assert.ok(texts.some((t) => /好きだだったので/.test(t) || /好きだったので/.test(t)), texts);
        assert.ok(texts.some((t) => /行っていてあと/.test(t)), texts);
        assert.ok(texts.some((t) => /始めてなかった/.test(t)), texts);
        assert.ok(texts.some((t) => /この距離でどのくらい/.test(t) && !/どど/.test(t)), texts);
        assert.ok(texts.some((t) => /予測について/.test(t)), texts);
        assert.ok(texts.some((t) => /よっぽどいっぱい/.test(t) && !/いっいっ/.test(t)), texts);
    });

    it('splits long monologue on ので/けど without requiring period', () => {
        const mono = '主にポルノがメインで活動させていただいてるんですけどと水着のアンバサダーだったり';
        const idx = structure.findJaMultiClauseSplitIndex(mono, { minBareChars: 24 });
        assert.ok(idx > 0, `idx=${idx} text=${mono}`);
        const out = structure.splitOverlongJaMultiClauseCues([
            { startMs: 0, endMs: 7600, text: mono },
        ]);
        assert.ok(out.splitCount >= 1, out);
        assert.ok(out.cues.length >= 2);
        assert.ok(/んですけど/.test(out.cues[0].text), out.cues[0].text);
    });

    it('cleanupAsrCues runs bleed strip then incomplete merge', () => {
        const out = cleanupAsrCues([
            { startMs: 0, endMs: 1200, text: 'ちょっと待ってこんにちは' },
            { startMs: 1300, endMs: 2400, text: 'こんにちは元気？' },
            { startMs: 3000, endMs: 3400, text: 'それで' },
            { startMs: 3480, endMs: 4200, text: '決めよう' },
        ], {
            nameLoop: false,
            jaAsrDomainFix: false,
            dedupeAsrEchoes: false,
            stitchJaFragments: false,
            stripAsrTrailingEllipsis: false,
        });
        assert.ok(out.prevBleedStripped >= 1, out);
        assert.ok(out.cues[0].text.includes('ちょっと待って'));
        assert.ok(!out.cues[0].text.includes('こんにちは'));
        assert.ok(out.incompleteMerged >= 1 || out.cues.some((c) => /それで.*決め/.test(c.text)), out);
    });
});
