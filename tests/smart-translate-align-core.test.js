const assert = require('assert');
const align = require('../src/js/smart-translate-align-core');
const sanitize = require('../src/js/mt-sanitize-core');

function cue(index, startMs, text, endMs = startMs + 1000) {
    return { index, startMs, endMs, text };
}

describe('smart-translate-align-core', () => {
    it('measures early index↔start break with high start-set overlap', () => {
        const ja = [];
        const zh = [];
        for (let i = 0; i < 40; i += 1) {
            ja.push(cue(i, i * 1000, `JA${i}`));
        }
        // First 10 index-aligned; then ZH order rotates so index i gets start of i+5
        for (let i = 0; i < 40; i += 1) {
            const srcIdx = i < 10 ? i : ((i + 5) % 40);
            zh.push(cue(i, ja[srcIdx].startMs, `ZH@${srcIdx}`));
        }
        const m = align.measureIndexStartAlignment(ja, zh);
        assert.ok(m.firstBreak >= 0 && m.firstBreak <= 12, `firstBreak=${m.firstBreak}`);
        assert.ok(m.startOverlapRate >= 0.9, `overlap=${m.startOverlapRate}`);
        assert.ok(m.sameRate < 0.9, `sameRate=${m.sameRate}`);
        assert.strictEqual(align.shouldRealignByStartMs(m), true);
    });

    it('does not realign when index starts already match', () => {
        const ja = [];
        const zh = [];
        for (let i = 0; i < 40; i += 1) {
            ja.push(cue(i, i * 1000, `JA${i}`));
            zh.push(cue(i, i * 1000, `ZH${i}`));
        }
        assert.strictEqual(align.shouldRealignByStartMs(ja, zh), false);
        const out = align.realignTranslatedCuesByStartMs(ja, zh);
        assert.strictEqual(out.changed, false);
        assert.strictEqual(out.cues[5].text, 'ZH5');
    });

    it('realigns EBWH-style drift so index i text matches start of JA i', () => {
        const ja = [];
        for (let i = 0; i < 36; i += 1) {
            ja.push(cue(i, 10000 + i * 800, `源${i}`));
        }
        // Same (start→text) pairs, but array order rotates after cue 8 (index≠start pairing).
        const aligned = ja.map((c, i) => cue(i, c.startMs, `译${i}`, c.endMs));
        const rotated = [...aligned.slice(0, 8), ...aligned.slice(11), ...aligned.slice(8, 11)];
        const zhWrongIndex = rotated.map((c, i) => ({ ...c, index: i }));
        assert.ok(align.shouldRealignByStartMs(ja, zhWrongIndex));
        const out = align.realignTranslatedCuesByStartMs(ja, zhWrongIndex);
        assert.ok(out.changed);
        assert.strictEqual(out.cues[10].startMs, ja[10].startMs);
        assert.strictEqual(out.cues[10].text, '译10');
        assert.strictEqual(out.cues[20].text, '译20');
        const m2 = align.measureIndexStartAlignment(ja, out.cues);
        assert.ok(m2.sameRate >= 0.95, `post sameRate=${m2.sameRate}`);
    });

    it('realigns late mid-track drift (EBWH-367 style)', () => {
        const ja = [];
        for (let i = 0; i < 80; i += 1) {
            ja.push(cue(i, 5000 + i * 700, `源${i}`));
        }
        const aligned = ja.map((c, i) => cue(i, c.startMs, `译${i}`, c.endMs));
        // First 50 index-aligned; then rotate tail so sameRate drops without early break
        const rotated = [...aligned.slice(0, 50), ...aligned.slice(53), ...aligned.slice(50, 53)];
        const zhWrong = rotated.map((c, i) => ({ ...c, index: i }));
        const m = align.measureIndexStartAlignment(ja, zhWrong);
        assert.ok(m.firstBreak > 40, `firstBreak=${m.firstBreak}`);
        assert.ok(m.sameRate < 0.72, `sameRate=${m.sameRate}`);
        assert.ok(m.startOverlapRate >= 0.9);
        assert.strictEqual(align.shouldRealignByStartMs(m), true);
        const out = align.realignTranslatedCuesByStartMs(ja, zhWrong);
        assert.ok(out.changed);
        assert.strictEqual(out.cues[55].text, '译55');
        assert.ok(align.measureIndexStartAlignment(ja, out.cues).sameRate >= 0.95);
    });
});

describe('EBWH-366 stock / mid recycle', () => {
    it('rejects 要射了吗 / bare 感觉 / long 好厉害 (EBWH-366)', () => {
        assert.ok(sanitize.looksLikeStockGlossMisattach('要射了吗？', 'きもち…はぁ…'));
        assert.ok(sanitize.looksLikeStockGlossMisattach('要射了吗？', '痛くない?'));
        assert.ok(sanitize.looksLikeStockGlossMisattach('要射了吗？', 'あっとる?'));
        assert.ok(!sanitize.looksLikeStockGlossMisattach('要射了吗？', 'あー…イキそう…?'));

        assert.ok(sanitize.looksLikeStockGlossMisattach('感觉', '気持ちよか?'));
        assert.ok(sanitize.looksLikeStockGlossMisattach('感觉', '気持ちいい?'));

        assert.ok(sanitize.looksLikeStockGlossMisattach(
            '好厉害',
            'え、止めちゃったけど…あ、すごいわあ、洋楽はいりゅだけすごや。',
        ));
        assert.ok(!sanitize.looksLikeStockGlossMisattach('好厉害', 'すごいよこれ'));

        assert.ok(sanitize.looksLikeStockGlossMisattach('舒服吗？', 'お兄ちゃんも気持ちいい?'));
        assert.ok(!sanitize.looksLikeStockGlossMisattach('舒服吗？', '気持ちいい?'));
        const blanked = sanitize.sanitizeMtCueText('舒服吗？', 'お兄ちゃんも気持ちいい?', {
            contentProfile: 'av_soft',
            skipJaAsrDomain: true,
        });
        assert.ok(!/^舒服吗/.test(String(blanked.text || '').trim()), blanked.text);
        const kept = sanitize.sanitizeMtCueText('舒服吗？', '気持ちいい?', {
            contentProfile: 'av_soft',
            skipJaAsrDomain: true,
        });
        assert.ok(/舒服吗/.test(String(kept.text || '')), kept.text);
    });

    it('recycles mid-length EBWH-366 paste phrases (len 6–7)', () => {
        const recycle = require('../src/js/smart-translate-recycle-guard-core');
        const phrase = '啊啊 感觉好 哈';
        const cues = [
            { index: 0, text: phrase, sourceText: 'ああぁ…気持ち、いい…はぁ…' },
            { index: 1, text: phrase, sourceText: 'あっ、ああっ、いくぅぅ…' },
            { index: 2, text: phrase, sourceText: 'はぁ…んんっみぃちゃん…' },
        ];
        const out = recycle.scrubRecycledTranslations(cues);
        assert.ok(out.scrubbed >= 2, `scrubbed=${out.scrubbed}`);
        assert.strictEqual(out.cues[0].text, phrase);
        assert.strictEqual(out.cues[1].text, '');
        assert.strictEqual(out.cues[2].text, '');
    });
});

describe('EBWH-367 opening discourse stock', () => {
    it('rejects 没事/但是/所以 on unrelated JA', () => {
        assert.ok(sanitize.looksLikeStockGlossMisattach('没事', '私は、しおりなゆいといいます'));
        assert.ok(!sanitize.looksLikeStockGlossMisattach('没事', '大丈夫です'));
        assert.ok(sanitize.looksLikeStockGlossMisattach('但是', '人望庁の小商店で'));
        assert.ok(!sanitize.looksLikeStockGlossMisattach('但是', 'でも…'));
        assert.ok(sanitize.looksLikeStockGlossMisattach('所以', '性格は…'));
        assert.ok(!sanitize.looksLikeStockGlossMisattach('所以', 'だから'));
        const blanked = sanitize.sanitizeMtCueText('没事', '私は、しおりなゆいといいます', {
            contentProfile: 'av_soft',
            skipJaAsrDomain: true,
        });
        assert.ok(!/没事/.test(String(blanked.text || '')), blanked.text);
    });
});

describe('MNGS-074 morning stock spam', () => {
    it('rejects 早上好 on non-おはよう JA and keeps real greetings', () => {
        assert.ok(sanitize.looksLikeStockGlossMisattach('早上好', '条件書いた通りさ'));
        assert.ok(sanitize.looksLikeStockGlossMisattach('早上好', 'クパールしてます'));
        assert.ok(sanitize.looksLikeStockGlossMisattach('早上好', 'パンツをずらして…'));
        assert.ok(!sanitize.looksLikeStockGlossMisattach('早上好', 'おはようございまーす。'));
        assert.ok(!sanitize.looksLikeStockGlossMisattach('早上好', 'おはよう'));

        const blanked = sanitize.sanitizeMtCueText('早上好', '条件書いた通りさ', {
            contentProfile: 'av_soft',
            skipJaAsrDomain: true,
        });
        assert.ok(!/早上好/.test(String(blanked.text || '')), blanked.text);

        const kept = sanitize.sanitizeMtCueText('早上好', 'おはようございまーす。', {
            contentProfile: 'av_soft',
            skipJaAsrDomain: true,
            cueIndex: 0,
            cueStartMs: 1000,
        });
        assert.ok(/早上好/.test(String(kept.text || '')), kept.text);
    });

    it('unsticks repeated 早上好 across divergent JA', () => {
        const zh = [
            { index: 0, text: '早上好' },
            { index: 1, text: '早上好' },
            { index: 2, text: '早上好' },
            { index: 3, text: '早上好' },
            { index: 4, text: '现在进去也行吗？是的' },
        ];
        const ja = [
            { index: 0, text: 'おはようございまーす。' },
            { index: 1, text: '条件書いた通りさ' },
            { index: 2, text: 'クパールしてます' },
            { index: 3, text: 'どうなっちゃうの?' },
            { index: 4, text: '今入っても大丈夫ですか? はい。' },
        ];
        const out = sanitize.sanitizeMtCues(zh, ja, {
            dropUselessEllipsis: false,
            rematerializeOntoSource: false,
            skipJaAsrDomain: true,
            contentProfile: 'av_soft',
        });
        const morning = out.cues.filter((c) => String(c.text || '').trim() === '早上好').length;
        assert.ok(morning <= 1, `早上好 kept=${morning} ${JSON.stringify(out.cues.map((c) => c.text))}`);
    });
});

describe('MNGS-082 school domain / glued stock', () => {
    it('maps 単位→学分 and 黒です→not 黑人; blanks glued stock', () => {
        const credit = sanitize.sanitizeMtCueText('嗯 单位你想要吗？', 'んー、単位くれる気になっいやいや', {
            contentProfile: 'av_soft',
            skipJaAsrDomain: true,
        });
        assert.ok(/学分/.test(credit.text) && !/单位/.test(credit.text), credit.text);

        const kuro = sanitize.sanitizeMtCueText('啊 不 不 那个是那个黑人', 'あ、いえいえ、あの担任の黒です。', {
            contentProfile: 'av_soft',
            skipJaAsrDomain: true,
        });
        assert.ok(!/黑人/.test(kuro.text), kuro.text);

        const dirty = sanitize.sanitizeMtCueText('脏话', '汚いって…', {
            contentProfile: 'av_soft',
            skipJaAsrDomain: true,
        });
        assert.ok(/好脏|脏/.test(dirty.text) && !/脏话/.test(dirty.text), dirty.text);

        assert.ok(sanitize.looksLikeStockGlossMisattach('拜托了不要不行', 'ちゃんと…ちょっと何して…?'));
        const glued = sanitize.sanitizeMtCueText('拜托了不要不行', 'ちゃんと…ちょっと何して…?', {
            contentProfile: 'av_soft',
            skipJaAsrDomain: true,
        });
        assert.ok(!/拜托了不要不行/.test(String(glued.text || '')), glued.text);
    });
});

describe('MFYD-182 women-pitch invent / oxytocin / 待翻译', () => {
    it('blanks 女性们 marketing pitch on lecture JA', () => {
        assert.ok(sanitize.looksLikeWomenAudiencePitchInvent(
            '女性们 无论你们是谁 都希望被我好好地满足',
            '今日は医学的に正直に話します',
        ));
        assert.ok(sanitize.looksLikeWomenAudiencePitchInvent(
            '女性们都会被你真正地好好满足',
            '手を置いてみたり',
        ));
        const blanked = sanitize.sanitizeMtCueText(
            '女性们 无论你们是谁 都希望被我好好地满足',
            '今日は医学的に正直に話します',
            { contentProfile: 'av_soft', skipJaAsrDomain: true },
        );
        assert.ok(!/女性们|都希望被|好好地满足/.test(String(blanked.text || '')), blanked.text);
        const shortPitch = sanitize.sanitizeMtCueText(
            '女性们都会被你真正地好好满足',
            '手を置いてみたり',
            { contentProfile: 'av_soft', skipJaAsrDomain: true },
        );
        assert.ok(!/女性们/.test(String(shortPitch.text || '')), shortPitch.text);
    });

    it('blanks lecture←practice scene bleed and RESP domain slip', () => {
        assert.ok(sanitize.isLectureExpositoryJa('フェニルエチルアミンというホルモンが原因です'));
        assert.ok(sanitize.looksLikeLectureSceneBleed(
            '这次就由我来主导吧 就来实践一下吧',
            'フェニルエチルアミンというホルモンが原因です不安や緊張があるときに多く分泌される',
        ));
        assert.ok(sanitize.looksLikeLectureSceneBleed(
            '详情请见实践篇 好',
            'なぜそうなったのか、どうすれば変わるのかを、医学科学的に正直に話します',
        ));
        assert.ok(sanitize.looksLikeLectureSceneBleed(
            '把女性当成书',
            '女性を本当に気持ちよくさせたいすべての男性に向けた話です。',
        ));
        assert.ok(sanitize.looksLikeAdultRegisterInvented(
            '好想看看她们俩做爱的样子啊哈 嗯 那个',
            'あなたたちは正常な経過を辿っているだけ好きなんです',
        ));
        assert.ok(sanitize.looksLikeStockGlossMisattach(
            '好舒服',
            '既婚未婚は関係ない女性を本当に気持ちよくさせたいすべての男性に向けた話です',
        ));
        assert.ok(sanitize.looksLikeBookBlurbInvent(
            '这是一本无论已婚未婚 只要是真心想让女性舒服起来的男性都能从中获益的书',
            '悩んでいるのに誰にも言えない。',
        ));
        assert.ok(sanitize.looksLikeHormoneSecreteAsEjacInvent(
            '就算不做爱也会射出来啊 只是牵个手 只是碰碰肩膀而已',
            'セックスしなくても出るんです手を繋ぐだけ、肩に触れるだけで',
        ));
        assert.ok(sanitize.looksLikeAdultRegisterInvented(
            '就算不做爱也会射出来啊 只是牵个手 只是碰碰肩膀而已',
            'セックスしなくても出るんです手を繋ぐだけ、肩に触れるだけで',
        ));
        // Discourse connectors must not be stripped as cast names
        const start = sanitize.sanitizeMtCueText('那么 开始吧', 'では、始めましょうか', {
            contentProfile: 'av_soft', skipJaAsrDomain: true,
        });
        assert.ok(/那么/.test(start.text), start.text);
        const first = sanitize.sanitizeMtCueText(
            '首先 我想告诉你的是 你没有任何错',
            'まず最初にあなたにお伝えしたいことはあなたは何も悪くないということです',
            { contentProfile: 'av_soft', skipJaAsrDomain: true },
        );
        assert.ok(/首先/.test(first.text), first.text);
        const meaning = sanitize.sanitizeMtCueText(
            '也就是说 很多夫妻在结婚三四年之后渐渐冷淡 并不是因为爱情冷却了',
            'つまり、結婚生活3、4年目ににしてなんとなく減ったという夫婦が多いのは愛情が冷めたからじゃない',
            { contentProfile: 'av_soft', skipJaAsrDomain: true },
        );
        assert.ok(/也就是说/.test(meaning.text), meaning.text);
        const orphanKeep = sanitize.stripTrailingOrphanName(
            'Pea 恋爱初期的那种心动感 心跳加速',
            'Pea…恋愛初期のあのドキドキ感シ心拍数が上がって',
        );
        assert.ok(/心跳加速/.test(orphanKeep.text), orphanKeep.text);
        assert.ok(sanitize.looksLikeSemanticMisattach(
            '对仪容仪表和整洁感的不满不断累积',
            '今、隣',
        ));
        const bleed = sanitize.sanitizeMtCueText(
            '这次就由我来主导吧 就来实践一下吧',
            'フェニルエチルアミンというホルモンが原因です不安や緊張があるときに多く分泌される',
            { contentProfile: 'av_soft', skipJaAsrDomain: true },
        );
        assert.ok(!/我来主导|实践一下/.test(String(bleed.text || '')), bleed.text);
        const resp = sanitize.sanitizeMtCueText(
            '成为RESP的夫妻有三个共通点',
            'レスになった夫婦に共通する三つのパターンがあります',
            { contentProfile: 'av_soft', skipJaAsrDomain: true },
        );
        assert.ok(/性冷淡/.test(resp.text) && !/\bRESP\b/.test(resp.text), resp.text);
    });

    it('peels invent off software-credit packed cue', () => {
        const packed = '字幕由 Transub Pro 生成 [ www.transub.cc ]\n女性们都会被你真正地好好地满足';
        const out = sanitize.sanitizeMtCueText(packed, '字幕は Transub Pro で生成されました', {
            contentProfile: 'av_soft',
            skipJaAsrDomain: true,
        });
        assert.ok(/字幕由 Transub/.test(out.text), out.text);
        assert.ok(!/女性们/.test(out.text), out.text);
    });

    it('strips 待翻译 prefix and fixes オキシトシン', () => {
        assert.ok(sanitize.looksLikePromptLeak('待翻译 首先'));
        const leak = sanitize.sanitizeMtCueText('待翻译 首先', 'まず最初に');
        assert.ok(leak.flags.includes('prompt_leak'));
        const oxy = sanitize.sanitizeMtCueText(
            '分的按摩会使女性体内的奥替隆素硬度统计有变化',
            '15分のマッサージで女性の身体の中のオキシトシン心の硬度が統計的に有',
            { contentProfile: 'av_soft', skipJaAsrDomain: true },
        );
        assert.ok(/催产素/.test(oxy.text) && !/奥替隆素/.test(oxy.text), oxy.text);
    });
});

describe('MFYD-186 asr-garbage invent / assistant meta', () => {
    it('flags unusable Whisper JA and blanks invent ZH', () => {
        const lex = require('../src/js/mt-sanitize-lexicon');
        const core = require('../src/js/advanced-smart-translate-core');
        assert.ok(lex.isAsrGarbageJa('まつかなかがしゃらぶでーふのひだと聞いてきました'));
        // Soft-AV breath ellipsis must stay recoverable (not false ASR-garbage)
        assert.ok(!lex.isAsrGarbageJa('だから…いっぱい締めてあげるから…'));
        assert.strictEqual(
            core.tryPrefillJaCue('まつかなかがしゃらぶでーふのひだと聞いてきました'),
            '…',
        );
        assert.ok(sanitize.looksLikeAsrGarbageJaInvent(
            '听说这里的厕所里有个家伙在舔自己',
            'まつかなかがしゃらぶでーふのひだと聞いてきました',
        ));
        const blanked = sanitize.sanitizeMtCueText(
            '听说这里的厕所里有个家伙在舔自己',
            'まつかなかがしゃらぶでーふのひだと聞いてきました',
            { contentProfile: 'av_soft', skipJaAsrDomain: true },
        );
        assert.ok(!/厕所/.test(String(blanked.text || '')), blanked.text);
    });

    it('prunes true Whisper garbage pairs instead of shipping …', () => {
        const zh = [
            { index: 0, text: '请多指教' },
            { index: 1, text: '…' },
            { index: 2, text: '听说这里的厕所里有个家伙在舔自己' },
            { index: 3, text: '好的' },
        ];
        const ja = [
            { index: 0, text: 'よろしくお願いします。' },
            { index: 1, text: 'まつかなかがしゃらぶでーふのひだと聞いてきました' },
            { index: 2, text: 'まつかなかがしゃらぶでーふのひだと聞いてきました' },
            { index: 3, text: 'わかりました' },
        ];
        const pruned = sanitize.pruneAsrDebrisCuePairs(zh, ja, { renumberIndexes: false });
        assert.ok(pruned.dropped >= 2, `dropped=${pruned.dropped}`);
        assert.ok(!pruned.cues.some((c) => /厕所|…/.test(String(c.text || ''))), pruned.cues);
        assert.strictEqual(
            require('../src/js/hymt-ellipsis-policy-core').planEllipsisSlotAction(
                'まつかなかがしゃらぶでーふのひだと聞いてきました',
                '…',
            ).reason,
            'asr_garbage',
        );
    });

    it('blanks assistant meta refusal as prompt leak', () => {
        const meta = '非常抱歉 由于您提供的信息有限 我无法准确理解您的需求 如果您能提供更多细节 例如字幕的内容 上下文等 我会尽力帮助您翻译';
        assert.ok(sanitize.looksLikePromptLeak(meta));
        const out = sanitize.sanitizeMtCueText(meta, 'んんっふぁいふぁいして…ひえ変態で…');
        assert.ok(out.flags.includes('prompt_leak') || !/信息有限/.test(out.text), out);
    });
});

describe('EBWH stock gloss misattach', () => {
    it('rejects 很远 / 那就 / 哈…哈 on unrelated JA', () => {
        assert.ok(sanitize.looksLikeStockGlossMisattach('很远', 'お名前は？'));
        assert.ok(sanitize.looksLikeStockGlossMisattach('很远', 'ツルツルしてる'));
        assert.ok(!sanitize.looksLikeStockGlossMisattach('很远', '遠いね'));

        assert.ok(sanitize.looksLikeStockGlossMisattach('那就', 'お礼したいんです'));
        assert.ok(sanitize.looksLikeStockGlossMisattach('那就', 'なんでもない'));
        assert.ok(!sanitize.looksLikeStockGlossMisattach('那就', 'じゃあ…'));
        assert.ok(!sanitize.looksLikeStockGlossMisattach('那就', 'それじゃ'));

        assert.ok(sanitize.looksLikeStockGlossMisattach('哈…哈', '名前教えて'));
        assert.ok(!sanitize.looksLikeStockGlossMisattach('哈…哈', 'はぁ…'));

        assert.ok(sanitize.looksLikeStockGlossMisattach('是啊', '今日は天気がいいですね、どこか行きませんか'));
        assert.ok(!sanitize.looksLikeStockGlossMisattach('是啊', 'そうだね'));
    });

    it('unsticks repeated 很远 / 那就 across divergent JA', () => {
        const zh = [
            { index: 0, text: '很远' },
            { index: 1, text: '很远' },
            { index: 2, text: '那就' },
            { index: 3, text: '那就' },
            { index: 4, text: '那就' },
        ];
        const ja = [
            { index: 0, text: 'お名前は？' },
            { index: 1, text: 'よろしくお願いします' },
            { index: 2, text: 'お礼したいんです' },
            { index: 3, text: 'なんでもないよ' },
            { index: 4, text: '舐めるんじゃないよ' },
        ];
        const out = sanitize.sanitizeMtCues(zh, ja, {
            dropUselessEllipsis: false,
            rematerializeOntoSource: false,
            skipJaAsrDomain: true,
        });
        const far = out.cues.filter((c) => /很远/.test(String(c.text || ''))).length;
        const naja = out.cues.filter((c) => /^那就/.test(String(c.text || '').trim())).length;
        assert.ok(far <= 1, `很远 kept=${far} ${JSON.stringify(out.cues.map((c) => c.text))}`);
        assert.ok(naja <= 1, `那就 kept=${naja} ${JSON.stringify(out.cues.map((c) => c.text))}`);
    });
});
