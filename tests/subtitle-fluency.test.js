const assert = require('assert');

const {
    analyzeTextFluency,
    scanFluencyIssues,
    summarizeFluencyScan,
    hasHeavyRepetition,
    endsWithDangling,
    isFragmentCue,
} = require('../src/js/subtitle-fluency-core');

function testRepetitionAndStutter() {
    assert.ok(hasHeavyRepetition('哈哈哈哈哈哈哈哈'));
    const stutter = analyzeTextFluency('我我我不知道');
    assert.ok(stutter.flags.includes('stutter') || stutter.flags.includes('repetition'));
}

function testDanglingAndFragment() {
    assert.ok(endsWithDangling('他走向了'));
    assert.ok(endsWithDangling('I went to'));
    assert.ok(isFragmentCue('的'));
    assert.ok(isFragmentCue('and'));
    // Short kana crumbs / orphan tails stay fragments
    assert.ok(isFragmentCue('ぇ'));
    assert.ok(isFragmentCue('ちゅ'));
    assert.ok(isFragmentCue('だだだ'));
    assert.ok(isFragmentCue('から'));
    assert.ok(isFragmentCue('しい'));
    // Lexical hiragana nouns must not be wiped as pure-kana crumbs (MARR food cue)
    assert.ok(!isFragmentCue('こんにゃく'));
    const ok = analyzeTextFluency('你好吗');
    assert.ok(!ok.flags.includes('dangling'), '语气词结尾不算残缺');
}

function testNoPunctLong() {
    const long = '今天天气很好我们去公园玩然后回家吃饭继续聊天讨论工作';
    const analysis = analyzeTextFluency(long);
    assert.ok(analysis.flags.includes('no_punct'));
}

function testScanSummary() {
    const cues = [
        { startMs: 0, endMs: 1000, text: '好好好好好好' },
        { startMs: 1000, endMs: 2000, text: '的' },
        { startMs: 2000, endMs: 3000, text: '正常字幕内容。' },
        { startMs: 3000, endMs: 4000, text: '正常字幕内容。' },
    ];
    const { issues, summary } = scanFluencyIssues(cues);
    assert.ok(summary.total >= 2);
    assert.ok(issues.some((i) => i.types.includes('repetition') || i.types.includes('stutter')));
    assert.ok(issues.some((i) => i.types.includes('fragment')));
    assert.ok(issues.some((i) => i.types.includes('duplicate')));
    assert.ok(summarizeFluencyScan(summary).includes('通顺度'));
}

function testRemoveNoise() {
    const {
        isSoundEffectCue,
        removeNoiseFromCues,
        summarizeNoiseRemoval,
    } = require('../src/js/subtitle-fluency-core');

    assert.ok(isSoundEffectCue('[音乐]'));
    assert.ok(isSoundEffectCue('掌声'));
    assert.ok(isSoundEffectCue('♪♪'));

    const cues = [
        { startMs: 0, endMs: 500, text: '' },
        { startMs: 500, endMs: 1000, text: '呃' },
        { startMs: 1000, endMs: 1500, text: '[Music]' },
        { startMs: 1500, endMs: 2000, text: '你好世界' },
        { startMs: 2000, endMs: 2500, text: '你好世界' },
        { startMs: 2500, endMs: 3000, text: '……' },
    ];
    const basic = removeNoiseFromCues(cues, { removeDuplicates: false });
    assert.strictEqual(basic.stats.empty, 1);
    assert.strictEqual(basic.stats.fragment, 1);
    assert.ok(basic.stats.soundEffect >= 1);
    assert.ok(basic.stats.symbolOnly + basic.stats.soundEffect >= 2);
    assert.strictEqual(basic.stats.kept, 2);
    assert.ok(summarizeNoiseRemoval(basic.stats).includes('删除'));

    const withDup = removeNoiseFromCues(cues, { removeDuplicates: true });
    assert.strictEqual(withDup.stats.duplicate, 1);
    assert.strictEqual(withDup.stats.kept, 1);
    assert.strictEqual(withDup.cues[0].text, '你好世界');

    const blanked = removeNoiseFromCues(cues, {
        removeDuplicates: true,
        blankInsteadOfRemove: true,
    });
    assert.strictEqual(blanked.cues.length, cues.length, 'translate track must keep cue count');
    assert.ok(blanked.stats.blanked >= 1);
    assert.ok(blanked.cues.every((c) => String(c.text || '').trim()));
}

function testTranslationTrackKeepsShortInterjectionsWhenBlanking() {
    const { removeNoiseFromCues } = require('../src/js/subtitle-fluency-core');
    const cues = [
        { startMs: 0, endMs: 400, text: '嗯嗯' },
        { startMs: 500, endMs: 900, text: '好的。' },
        { startMs: 1000, endMs: 1400, text: '哈啊' },
        { startMs: 1500, endMs: 2000, text: '这是一句正常对白。' },
        { startMs: 2100, endMs: 2500, text: '嗯' },
    ];
    const blanked = removeNoiseFromCues(cues, {
        removeDuplicates: false,
        blankInsteadOfRemove: true,
        // Post-batch enables this — must not wipe soft-AV / prefill moans.
        removeHallucinations: true,
    });
    assert.strictEqual(blanked.cues.length, cues.length);
    assert.strictEqual(blanked.cues[0].text, '嗯嗯');
    assert.strictEqual(blanked.cues[1].text, '好的。');
    assert.strictEqual(blanked.cues[2].text, '哈啊');
    // bare 嗯 is still noise, but must keep the timing slot
    assert.ok(String(blanked.cues[4].text || '').trim());
    assert.notStrictEqual(blanked.cues[0].text, '…');
    assert.notStrictEqual(blanked.cues[2].text, '…');
}

function testHallucinationCleanup() {
    const {
        isHallucinationCue,
        removeNoiseFromCues,
        normalizeAsrText,
    } = require('../src/js/subtitle-fluency-core');
    assert.ok(isHallucinationCue({ startMs: 0, endMs: 500, text: '完毕' }));
    assert.ok(isHallucinationCue({ startMs: 0, endMs: 800, text: '○○○○○' }));
    assert.ok(isHallucinationCue({ startMs: 0, endMs: 900, text: '本集' }));
    assert.ok(isHallucinationCue({ startMs: 0, endMs: 900, text: '舞は人名です。' }));
    assert.ok(isHallucinationCue({ startMs: 0, endMs: 900, text: 'iz磨吉平洋' }));
    assert.ok(isHallucinationCue({ startMs: 0, endMs: 900, text: '寂寞笑' }));
    assert.ok(isHallucinationCue({ startMs: 0, endMs: 350, text: '.' }));
    assert.ok(isHallucinationCue({ startMs: 0, endMs: 1600, text: 'おわり' }));
    assert.ok(isHallucinationCue({ startMs: 0, endMs: 1600, text: 'ユーモア' }));
    assert.ok(isHallucinationCue({ startMs: 0, endMs: 1500, text: '◆ ◆ ◆ ◆ ◆ ◆' }));
    // Short JA dialogue must survive (EBWH-361 綺麗 / ほら / でも / ここ)
    assert.ok(!isHallucinationCue({ startMs: 0, endMs: 600, text: '綺麗' }));
    assert.ok(!isHallucinationCue({ startMs: 0, endMs: 600, text: 'ほら' }));
    assert.ok(!isHallucinationCue({ startMs: 0, endMs: 600, text: 'でも' }));
    assert.ok(!isHallucinationCue({ startMs: 0, endMs: 600, text: 'ここ' }));
    // 2-mora ASR crumbs still drop
    assert.ok(isHallucinationCue({ startMs: 0, endMs: 500, text: 'すご' }));
    assert.ok(isHallucinationCue({ startMs: 0, endMs: 500, text: 'しよ' }));
    // Framed lexical triple-rep is not Whisper debris (PRED-898)
    assert.ok(!isHallucinationCue({ startMs: 0, endMs: 1200, text: 'ああ、いるいるいる' }));
    // Pure token×3 still counts as heavy-rep hallucination
    assert.ok(isHallucinationCue({ startMs: 0, endMs: 900, text: 'イキイキイキ' }));
    // Software credit must not be treated as URL hallucination
    assert.ok(!isHallucinationCue({
        startMs: 0,
        endMs: 2000,
        text: '字幕由 Transub Pro 生成 [ www.transub.cc ]',
    }));
    assert.ok(!require('../src/js/subtitle-fluency-core').looksLikeWeirdCueText(
        '字幕由 Transub Pro 生成 [ www.transub.cc ]',
    ));
    const { isSymbolOnlyCue, isSoundEffectCue } = require('../src/js/subtitle-fluency-core');
    assert.ok(isSymbolOnlyCue('◆ ◆ ◆ ◆ ◆ ◆'));
    assert.ok(isSymbolOnlyCue('}'));
    assert.ok(isSymbolOnlyCue('＋'));
    assert.ok(isSoundEffectCue('◆ ◆ ◆'));
    assert.strictEqual(normalizeAsrText("All right , let ' s do this"), "All right, let's do this");
    assert.strictEqual(normalizeAsrText('and for 1 0 years'), 'and for 10 years');
    assert.strictEqual(normalizeAsrText('▁the rest'), 'the rest');
    assert.strictEqual(normalizeAsrText('greatI saved'), 'great I saved');
    assert.strictEqual(normalizeAsrText("I ' been the one"), 'I been the one');
    assert.strictEqual(normalizeAsrText("I ' m pretty"), "I'm pretty");
    assert.strictEqual(normalizeAsrText("we don ' t really"), "we don't really");
    const {
        stripAsrDecorativeTrailingEllipsis,
        stripAsrDecorativeTrailingEllipsisInCues,
    } = require('../src/js/subtitle-fluency-core');
    assert.strictEqual(stripAsrDecorativeTrailingEllipsis('時給もなかなかいいし…'), '時給もなかなかいいし');
    assert.strictEqual(stripAsrDecorativeTrailingEllipsis('wait...'), 'wait');
    assert.strictEqual(
        stripAsrDecorativeTrailingEllipsis('そんなことないけど…ホント?'),
        'そんなことないけど…ホント?',
    );
    assert.strictEqual(stripAsrDecorativeTrailingEllipsis('…'), '…');
    assert.strictEqual(stripAsrDecorativeTrailingEllipsis('んんっ…!'), 'んんっ!');
    const ellBatch = stripAsrDecorativeTrailingEllipsisInCues([
        { startMs: 0, endMs: 1000, text: '私、友達が少ないから…' },
        { startMs: 1000, endMs: 2000, text: '主婦の方と友達になれたらいいな' },
    ]);
    assert.strictEqual(ellBatch.changed, 1);
    assert.strictEqual(ellBatch.cues[0].text, '私、友達が少ないから');
    assert.strictEqual(ellBatch.cues[1].text, '主婦の方と友達になれたらいいな');
    const keepMid = stripAsrDecorativeTrailingEllipsisInCues([
        { startMs: 0, endMs: 1000, text: 'でも…静かにできない?' },
    ]);
    assert.strictEqual(keepMid.changed, 0);
    assert.strictEqual(keepMid.cues[0].text, 'でも…静かにできない?');
    const keepTurn = stripAsrDecorativeTrailingEllipsisInCues([
        { startMs: 0, endMs: 1000, text: 'そんなことないけど…' },
        { startMs: 1050, endMs: 1800, text: 'ホント?' },
    ]);
    assert.strictEqual(keepTurn.changed, 0);
    assert.strictEqual(keepTurn.cues[0].text, 'そんなことないけど…');
    const cues = [
        { startMs: 0, endMs: 500, text: '完毕' },
        { startMs: 1000, endMs: 3000, text: '正常对白内容。' },
        { startMs: 3000, endMs: 3350, text: '.' },
        { startMs: 4000, endMs: 5000, text: "I ' m pretty" },
    ];
    const cleaned = removeNoiseFromCues(cues, {
        removeEmpty: false,
        removeFragments: false,
        removeSoundEffects: false,
        removeSymbolOnly: false,
        removeHallucinations: true,
    });
    assert.ok(cleaned.stats.hallucination >= 2);
    assert.ok(cleaned.cues.some((c) => c.text === "I'm pretty"));
}

function testCompressRepetition() {
    const {
        compressRepetitionInText,
        compressRepetitionInCues,
        summarizeRepetitionCompress,
    } = require('../src/js/subtitle-fluency-core');

    const a = compressRepetitionInText('好的好的好的好的好的好的好的好的');
    assert.ok(a.changed);
    assert.strictEqual(a.text, '好的好的！');

    const b = compressRepetitionInText('太好了太好了太好了太好了太好了太好了太好');
    assert.ok(b.changed);
    assert.strictEqual(b.text, '太好了太好了！');

    const c = compressRepetitionInText('来 这边也要 从这边过去 啊 走走走走走走走走走走');
    assert.ok(c.changed);
    assert.ok(c.text.includes('走走！'));
    assert.ok(c.text.includes('从这边过去'));

    const d = compressRepetitionInText('啊 真好笑 哈哈哈哈哈哈哈哈');
    assert.strictEqual(d.text, '啊 真好笑 哈哈！');

    const e = compressRepetitionInText('快点 快点 快点 快点');
    assert.strictEqual(e.text, '快点快点！');

    const f = compressRepetitionInText('哈哈哈哈哈哈');
    assert.strictEqual(f.text, '哈哈！');

    const g = compressRepetitionInText('好的好的');
    assert.ok(!g.changed, '少于 3 次不压缩');

    // URL / software-credit: never compress www → ww！
    const credit = '字幕由 Transub Pro 生成 [ www.transub.cc ]';
    const creditCmp = compressRepetitionInText(credit);
    assert.ok(!creditCmp.changed, creditCmp.text);
    assert.strictEqual(creditCmp.text, credit);
    const wwwOnly = compressRepetitionInText('www.example.com');
    assert.ok(!wwwOnly.changed, wwwOnly.text);

    // English: do not treat short particle + longer word as stacked repetition
    for (const sample of [
        'so sorry',
        'I am so sorry',
        'to tomorrow',
        'no nobody',
        'but butter',
        'then strength',
        'or order',
        'color or order',
        'lor or order',
        'in inside',
        'at attack',
        'on only',
        'me message',
        'be because',
    ]) {
        const bad = compressRepetitionInText(sample, {
            minRepeats: 2,
            compressSingleChar: true,
            addExclaim: true,
        });
        assert.strictEqual(bad.text, sample, `must keep intact: ${sample} → ${bad.text}`);
    }
    // Intentional spaced doubles still compress
    const orOr = compressRepetitionInText('or or or or', {
        minRepeats: 2,
        compressSingleChar: true,
        addExclaim: true,
    });
    assert.ok(orOr.changed, orOr.text);
    assert.ok(!/！rder|o！r/.test(orOr.text), orOr.text);

    const haHa = compressRepetitionInText('ha ha ha ha', {
        minRepeats: 2,
        compressSingleChar: true,
        addExclaim: true,
    });
    assert.ok(haHa.changed, haHa.text);
    assert.ok(/ha/i.test(haHa.text));

    const {
        collapseSoftDoublePhrase,
    } = require('../src/js/subtitle-fluency-core');
    const softA = collapseSoftDoublePhrase('会融化的，会融化的');
    assert.ok(softA.changed);
    assert.strictEqual(softA.text, '会融化的');
    const softB = collapseSoftDoublePhrase('亏了光理亏了光理');
    assert.ok(softB.changed);
    assert.strictEqual(softB.text, '亏了光理');
    const softMid = collapseSoftDoublePhrase('她真的是个非常亏了光理亏了光理呢');
    assert.ok(softMid.changed);
    assert.strictEqual(softMid.text, '她真的是个非常亏了光理呢');
    const softName = collapseSoftDoublePhrase('风户濑吉风户濑吉酱？');
    assert.ok(softName.changed);
    assert.strictEqual(softName.text, '风户濑吉酱？');
    const softKeep = collapseSoftDoublePhrase('好的好的');
    assert.ok(!softKeep.changed, 'exactly two 好的 without sep stays for compress path');

    const legacy = compressRepetitionInText('好的…好的！');
    assert.ok(legacy.changed);
    assert.strictEqual(legacy.text, '好的好的！');

    const cues = [
        { startMs: 0, endMs: 1000, text: '好的好的好的好的' },
        { startMs: 1000, endMs: 2000, text: '正常对白' },
        { startMs: 2000, endMs: 3000, text: '加油加油加油加油 快点快点快点快点' },
    ];
    const batch = compressRepetitionInCues(cues);
    assert.strictEqual(batch.stats.cueTouched, 2);
    assert.strictEqual(batch.cues[0].text, '好的好的！');
    assert.strictEqual(batch.cues[1].text, '正常对白');
    assert.ok(batch.cues[2].text.includes('加油加油！'));
    assert.ok(batch.cues[2].text.includes('快点快点！'));
    assert.ok(summarizeRepetitionCompress(batch.stats).includes('压缩'));

    const scoped = compressRepetitionInCues(cues, { indexes: [1] });
    assert.strictEqual(scoped.stats.cueTouched, 0);
}

function testSimplifyViewingPunctuation() {
    const {
        simplifyViewingPunctuationInText,
        simplifyViewingPunctuationInCues,
    } = require('../src/js/subtitle-fluency-core');

    const a = simplifyViewingPunctuationInText('你好，世界。真的吗？太棒了！！');
    assert.ok(a.changed);
    assert.strictEqual(a.text, '你好 世界 真的吗？太棒了！');

    const clear = simplifyViewingPunctuationInText('你好，世界。真的吗？太棒了！！', { level: 'clear' });
    assert.ok(clear.changed);
    assert.strictEqual(clear.text, '你好 世界 真的吗？太棒了');

    const b = simplifyViewingPunctuationInText('版本 3.14—测试、完成');
    assert.ok(b.changed);
    assert.strictEqual(b.text, '版本 3.14 测试 完成');

    const ell = simplifyViewingPunctuationInText('等等…好的');
    assert.ok(ell.changed);
    assert.strictEqual(ell.text, '等等 好的');

    // Pure MT blank stubs must survive clear/light (otherwise SRT round-trip drops cues).
    const stub = simplifyViewingPunctuationInText('…', { level: 'clear' });
    assert.strictEqual(stub.text, '…');
    const stubBatch = simplifyViewingPunctuationInCues([
        { startMs: 0, endMs: 1000, text: '…' },
        { startMs: 1000, endMs: 2000, text: '……' },
        { startMs: 2000, endMs: 3000, text: '走吧。' },
    ], { level: 'clear' });
    assert.strictEqual(stubBatch.cues[0].text, '…');
    assert.strictEqual(stubBatch.cues[1].text, '…');
    assert.strictEqual(stubBatch.cues[2].text, '走吧');

    const c = simplifyViewingPunctuationInText('什么？');
    assert.ok(!c.changed);

    const off = simplifyViewingPunctuationInText('你好。', { level: 'off' });
    assert.ok(!off.changed);

    // Software credit URL dots must survive viewing punctuation cleanup
    const credit = '字幕由 Transub Pro 生成 [ www.transub.cc ]';
    const creditView = simplifyViewingPunctuationInText(credit, { level: 'light' });
    assert.ok(!creditView.changed, creditView.text);
    assert.strictEqual(creditView.text, credit);

    const batch = simplifyViewingPunctuationInCues([
        { startMs: 0, endMs: 1000, text: '走吧。' },
        { startMs: 1000, endMs: 2000, text: '好的' },
    ]);
    assert.strictEqual(batch.stats.cueTouched, 1);
    assert.strictEqual(batch.cues[0].text, '走吧');
    assert.strictEqual(batch.cues[1].text, '好的');

    // Tone-stretch ~~ must survive viewing punct (not rewrite to …).
    const tilde = simplifyViewingPunctuationInText('~~', { level: 'light' });
    assert.strictEqual(tilde.text, '~~');
}

function testStripTrailingZhSentencePeriod() {
    const {
        stripTrailingZhSentencePeriod,
        stripTrailingZhSentencePeriodInCues,
        normalizeBlankMtPlaceholder,
    } = require('../src/js/subtitle-fluency-core');

    assert.strictEqual(stripTrailingZhSentencePeriod('我回来了。'), '我回来了');
    assert.strictEqual(stripTrailingZhSentencePeriod('可以吗？'), '可以吗？');
    assert.strictEqual(stripTrailingZhSentencePeriod('太棒了！'), '太棒了！');
    assert.strictEqual(normalizeBlankMtPlaceholder('~~'), '~~');
    assert.strictEqual(normalizeBlankMtPlaceholder('～～'), '～～');

    const batch = stripTrailingZhSentencePeriodInCues([
        { index: 0, text: '走吧。' },
        { index: 1, text: '~~' },
        { index: 2, text: '好的吗？' },
        { index: 3, text: '字幕由 Transub Pro 生成 [ www.transub.cc ]' },
    ]);
    assert.ok(batch.stats.cueTouched >= 1);
    assert.strictEqual(batch.cues[0].text, '走吧');
    assert.strictEqual(batch.cues[1].text, '~~');
    assert.strictEqual(batch.cues[2].text, '好的吗？');
    assert.ok(batch.cues[3].text.includes('www.transub.cc'));
}

function testAsrEchoDedupe() {
    const {
        isAsrEchoPair,
        dedupeAsrEchoCues,
        summarizeAsrEchoDedupe,
    } = require('../src/js/subtitle-fluency-core');

    assert.ok(isAsrEchoPair('つまり、この勃起は…', 'この勃起は…'));
    assert.ok(isAsrEchoPair('奥さん見てたら、こんなに…', 'こんなに…'));
    assert.ok(isAsrEchoPair('やまんできない…!', 'ああ、やまんできない…!'));
    assert.ok(!isAsrEchoPair('気持ちいい…', '旦那とどっちが気持ちいい?'));
    assert.ok(!isAsrEchoPair('よかった。', 'よかったら、一緒に'));

    const out = dedupeAsrEchoCues([
        { startMs: 373398, endMs: 374509, text: 'つまり、この勃起は…' },
        { startMs: 375048, endMs: 376368, text: 'この勃起は…' },
        { startMs: 377414, endMs: 378644, text: '奥さんの勃起だよ…' },
    ]);
    assert.strictEqual(out.removed, 1);
    assert.deepStrictEqual(out.cues.map((c) => c.text), [
        'つまり、この勃起は…',
        '奥さんの勃起だよ…',
    ]);
    assert.ok(summarizeAsrEchoDedupe(out.stats).includes('回声'));

    // Short reactive exact echo across >4s (気持ちいい｜気持ちいい?)
    const reactive = dedupeAsrEchoCues([
        { startMs: 0, endMs: 800, text: '気持ちいい' },
        { startMs: 6000, endMs: 6800, text: '気持ちいい?' },
        { startMs: 9000, endMs: 9600, text: 'だめ' },
        { startMs: 15000, endMs: 15600, text: 'だめ' },
    ]);
    assert.strictEqual(reactive.removed, 2, JSON.stringify(reactive));
    assert.strictEqual(reactive.cues.length, 2);
    assert.ok(/気持ちいい/.test(reactive.cues[0].text), reactive.cues[0].text);
    assert.strictEqual(String(reactive.cues[1].text).trim(), 'だめ');
    // Bare ん stacks must not wide-gap dedupe
    const nn = dedupeAsrEchoCues([
        { startMs: 0, endMs: 200, text: 'ん' },
        { startMs: 8000, endMs: 8200, text: 'ん' },
    ]);
    assert.strictEqual(nn.removed, 0, JSON.stringify(nn));
}

function testJaFragmentStitch() {
    const {
        stitchJaFragmentCues,
        summarizeJaStitch,
        isFragmentCue,
        endsJaBroken,
        startsJaContinuation,
        endsJaPrenominalIncomplete,
        startsJaNounContinuation,
        shouldStitchJaFragmentPair,
        stitchAlignedJaZhFragmentPairs,
    } = require('../src/js/subtitle-fluency-core');

    assert.ok(endsJaBroken('あはは恥ずかしいのいやちょっと恥ずかしいっす恥ずかしいご'));
    assert.ok(startsJaContinuation('めんなさい恥ずかしいのあいやああちょっとああ'));
    assert.ok(isFragmentCue('しい'));

    const cues = [
        { startMs: 0, endMs: 1000, text: '少しだけ見せていやちょっと待ってほしいんですよちょっと少' },
        { startMs: 1000, endMs: 2500, text: 'しだけいやちょっと待ってください少しならいいでしょ' },
        { startMs: 2500, endMs: 4000, text: 'あはは恥ずかしいのいやちょっと恥ずかしいっす恥ずかしいご' },
        { startMs: 4000, endMs: 5500, text: 'めんなさい恥ずかしいのあいやああちょっとああ' },
        { startMs: 6000, endMs: 7000, text: 'ああ入った入ったあそこあそ' },
        { startMs: 8750, endMs: 9500, text: 'こで気持ちいい' },
        { startMs: 10000, endMs: 10500, text: require('../src/js/mt-opaque-strings').d('44Gh44KT44Gh44KT44OT44Oz44OT44Oz44Gg44Gt5ayJ') },
        { startMs: 12600, endMs: 12800, text: 'しい' },
        { startMs: 15000, endMs: 16000, text: '普通の台詞です。' },
        { startMs: 16000, endMs: 16500, text: 'うん…' },
    ];
    const stitched = stitchJaFragmentCues(cues);
    assert.ok(stitched.mergedPairs >= 3, JSON.stringify(stitched.stats));
    assert.ok(stitched.cues.some((c) => String(c.text).includes('ごめんなさい')));
    assert.ok(stitched.cues.some((c) => String(c.text).includes('あそこで気持ちいい')));
    assert.ok(stitched.cues.some((c) => String(c.text).includes('嬉しい')));
    // Do not glue a normal sentence onto a following うん
    assert.ok(stitched.cues.some((c) => String(c.text).trim() === 'うん…'));
    assert.ok(summarizeJaStitch(stitched.stats).includes('拼接'));
}

function testMarrAsrFragmentFalsePositiveGuard() {
    const {
        isFragmentCue,
        shouldStitchJaFragmentPair,
        stitchJaFragmentCues,
        removeNoiseFromCues,
    } = require('../src/js/subtitle-fluency-core');
    const { isPureMoanOrSfxJa, isDeterministicAsrDebrisJa } = require('../src/js/hymt-ellipsis-policy-core');

    assert.ok(!isFragmentCue('こんにゃく'));
    assert.ok(!isPureMoanOrSfxJa('こんにゃく'), 'food noun must not match んにゃ moan scrap');
    assert.ok(!isDeterministicAsrDebrisJa('こんにゃく'));
    assert.ok(shouldStitchJaFragmentPair('から', 'みが好きです', 40));
    assert.ok(shouldStitchJaFragmentPair('たぶん名物のじゃ', 'こんにゃく', 40));
    assert.ok(shouldStitchJaFragmentPair('こんにゃく', '味噌田楽です。', 40));

    const cues = [
        { startMs: 5040846, endMs: 5042868, text: 'たぶん名物のじゃ' },
        { startMs: 5042908, endMs: 5043992, text: 'こんにゃく' },
        { startMs: 5044032, endMs: 5046204, text: '味噌田楽です。' },
        { startMs: 5280872, endMs: 5283800, text: '私はレバーというけど' },
        { startMs: 5284508, endMs: 5285062, text: 'から' },
        { startMs: 5285102, endMs: 5286726, text: 'みが好きです' },
        { startMs: 6000000, endMs: 6001500, text: 'ちゅ' },
        { startMs: 6002000, endMs: 6003500, text: 'だだだ' },
    ];
    const stitched = stitchJaFragmentCues(cues, { phraseStitch: true });
    assert.ok(
        stitched.cues.some((c) => String(c.text).includes('からみが好き')),
        JSON.stringify(stitched.cues.map((c) => c.text)),
    );
    assert.ok(
        stitched.cues.some((c) => /名物のじゃこんにゃく味噌田楽です/.test(String(c.text))),
        '名物のじゃ＋こんにゃく＋味噌田楽 must stitch: ' + JSON.stringify(stitched.cues.map((c) => c.text)),
    );
    const cleaned = removeNoiseFromCues(stitched.cues, {
        removeEmpty: true,
        removeFragments: true,
        removeSoundEffects: true,
        removeSymbolOnly: true,
        removeHallucinations: true,
    });
    assert.ok(
        cleaned.cues.some((c) => String(c.text).includes('こんにゃく')),
        'lexical こんにゃく must survive noise drop',
    );
    assert.ok(
        cleaned.cues.some((c) => String(c.text).includes('からみが好き')),
        'orphan から must stitch before drop',
    );
    assert.ok(!cleaned.cues.some((c) => String(c.text).trim() === 'ちゅ'));
    assert.ok(!cleaned.cues.some((c) => String(c.text).trim() === 'だだだ'));
}

function testJaPhrasePrenominalStitch() {
    const {
        endsJaPrenominalIncomplete,
        startsJaNounContinuation,
        shouldStitchJaFragmentPair,
        stitchJaFragmentCues,
        stitchAlignedJaZhFragmentPairs,
    } = require('../src/js/subtitle-fluency-core');

    assert.ok(endsJaPrenominalIncomplete('今日はお父さんが好きな'));
    assert.ok(endsJaPrenominalIncomplete('好きな'));
    assert.ok(startsJaNounContinuation('サバの味噌煮とローストビーフです'));
    assert.ok(shouldStitchJaFragmentPair(
        '今日はお父さんが好きな',
        'サバの味噌煮とローストビーフです',
        200,
    ));
    // Terminal い-adjective + food: do NOT stitch (false-merge risk)
    assert.ok(!endsJaPrenominalIncomplete('たまらない'));
    assert.ok(!shouldStitchJaFragmentPair('たまらない', '美味い', 100));
    // Turn opening after prenominal: do NOT stitch
    assert.ok(!shouldStitchJaFragmentPair('好きな', 'いや違うよ', 100));
    // Sentence-final 「…るな」must NOT count as 連体な
    assert.ok(!endsJaPrenominalIncomplete('痛みに染みるな'));
    assert.ok(!shouldStitchJaFragmentPair('痛みに染みるな', 'マジ、なんなんだよ', 200));
    // Verbal nominalizer 「してるの」must NOT stitch onto next clause
    assert.ok(!endsJaPrenominalIncomplete('浮気してるの'));
    assert.ok(!shouldStitchJaFragmentPair('浮気してるの', '気付いてないんだでも思ってる?', 40));
    // Good prenominal の / demonstrative
    assert.ok(endsJaPrenominalIncomplete('ここの'));
    assert.ok(shouldStitchJaFragmentPair('ここの', '川のところで取れるんだって', 20));
    assert.ok(endsJaPrenominalIncomplete('みたいな'));
    assert.ok(shouldStitchJaFragmentPair('みたいな', '言ってた優香が…', 90));
    // Orphan connective tail + continuation (辛みが好き split as から｜みが好き)
    assert.ok(shouldStitchJaFragmentPair('から', 'みが好きです', 40));
    assert.ok(!shouldStitchJaFragmentPair('から', 'うん…', 40), 'do not glue orphan onto turn opener');
    // Multi-mora hiragana noun head after prenominal
    assert.ok(startsJaNounContinuation('こんにゃく'));
    assert.ok(!startsJaNounContinuation('うん'));

    // Line-wrap ellipsis: incomplete stem… + continuation → merge
    const {
        endsAsrEllipsisLineWrap,
        startsAsrEllipsisWrapContinuation,
        joinAsrCueTexts,
    } = require('../src/js/subtitle-fluency-core');
    assert.ok(endsAsrEllipsisLineWrap('こちらの…'));
    assert.ok(endsAsrEllipsisLineWrap('情報を外に漏らした場合…'));
    assert.ok(endsAsrEllipsisLineWrap('時給もなかなかいいし…'));
    assert.ok(!endsAsrEllipsisLineWrap('お待たせいたしました…'), 'decorative complete');
    assert.ok(startsAsrEllipsisWrapContinuation('雇用契約書。'));
    assert.ok(!startsAsrEllipsisWrapContinuation('まあ、好きにしろよ'));
    assert.ok(!startsAsrEllipsisWrapContinuation('ホント?'));
    assert.ok(shouldStitchJaFragmentPair('こちらの…', '雇用契約書。', 80));
    assert.ok(shouldStitchJaFragmentPair('情報を外に漏らした場合…', '損害賠償を請求する場合が', 120));
    assert.ok(!shouldStitchJaFragmentPair('んて思って…', 'まあ、好きにしろよ', 100));
    assert.ok(!shouldStitchJaFragmentPair('そんなことないけど…', 'ホント?', 60));
    assert.ok(!shouldStitchJaFragmentPair('お待たせいたしました…', '弊社はデータ入力', 80));
    assert.strictEqual(joinAsrCueTexts('こちらの…', '雇用契約書。'), 'こちらの雇用契約書。');

    const wrapJa = [
        { startMs: 0, endMs: 1000, text: 'こちらの…' },
        { startMs: 1050, endMs: 2200, text: '雇用契約書。' },
        { startMs: 3000, endMs: 4000, text: 'そんなことないけど…' },
        { startMs: 4050, endMs: 4800, text: 'ホント?' },
        { startMs: 6000, endMs: 7000, text: 'お待たせいたしました…' },
        { startMs: 7100, endMs: 8500, text: '弊社はデータ入力です' },
    ];
    const wrapStitched = stitchJaFragmentCues(wrapJa);
    assert.ok(wrapStitched.cues.some((c) => String(c.text) === 'こちらの雇用契約書。'));
    assert.ok(wrapStitched.cues.some((c) => String(c.text).trim() === 'そんなことないけど…'));
    assert.ok(wrapStitched.cues.some((c) => String(c.text).trim() === 'ホント?'));
    assert.ok(wrapStitched.cues.some((c) => String(c.text).trim() === 'お待たせいたしました…'));

    const ja = [
        { startMs: 0, endMs: 1200, text: '今日はお父さんが好きな' },
        { startMs: 1300, endMs: 3200, text: 'サバの味噌煮とローストビーフです' },
        { startMs: 4000, endMs: 4800, text: 'この' },
        { startMs: 4900, endMs: 5600, text: '嫁さん' },
        { startMs: 7000, endMs: 7800, text: 'たまらない' },
        { startMs: 7900, endMs: 8600, text: '美味い' },
    ];
    const stitched = stitchJaFragmentCues(ja);
    assert.ok(stitched.mergedPairs >= 2, JSON.stringify(stitched.stats));
    assert.ok(stitched.stats.phraseMerged >= 2, JSON.stringify(stitched.stats));
    assert.ok(stitched.cues.some((c) => String(c.text).includes('好きなサバの味噌煮')));
    assert.ok(stitched.cues.some((c) => String(c.text).includes('この嫁さん')));
    assert.ok(stitched.cues.some((c) => String(c.text).trim() === 'たまらない'));
    assert.ok(stitched.cues.some((c) => String(c.text).trim() === '美味い'));

    const zh = [
        { startMs: 0, endMs: 1200, text: '今天是爸爸喜欢的' },
        { startMs: 1300, endMs: 3200, text: '青花鱼味噌煮和烤牛肉' },
        { startMs: 4000, endMs: 4800, text: '这' },
        { startMs: 4900, endMs: 5600, text: '位太太' },
        { startMs: 7000, endMs: 7800, text: '受不了' },
        { startMs: 7900, endMs: 8600, text: '真好吃' },
    ];
    const paired = stitchAlignedJaZhFragmentPairs(zh, ja);
    assert.strictEqual(paired.zhCues.length, paired.jaCues.length);
    assert.ok(paired.mergedPairs >= 2);
    assert.ok(paired.zhCues.some((c) => String(c.text).includes('喜欢的青花鱼')));
    assert.ok(paired.zhCues.some((c) => String(c.text).includes('这位太太')));
    assert.ok(paired.zhCues.some((c) => String(c.text).trim() === '受不了'));

    // Orphan ZH particle cue attaches to previous
    // ZH-only prenominal when JA is already one cue (MARR 爱喝酒的｜青豆腐)
    const {
        shouldAttachZhTrailingParticle,
        shouldStitchZhPrenominalPair,
        stitchZhPrenominalCues,
        endsZhPrenominalIncomplete,
        startsZhNounContinuation,
        isFragmentCue,
    } = require('../src/js/subtitle-fluency-core');
    assert.ok(shouldAttachZhTrailingParticle('就在不久前才介绍过', '吗', 80));
    assert.ok(!shouldAttachZhTrailingParticle('好的', '吗', 80));
    const zhParts = stitchZhPrenominalCues([
        { startMs: 0, endMs: 1000, text: '就在不久前才介绍过' },
        { startMs: 1050, endMs: 1200, text: '吗' },
        { startMs: 2000, endMs: 2500, text: '嗯' },
    ]);
    assert.ok(zhParts.mergedPairs >= 1);
    assert.ok(zhParts.cues.some((c) => String(c.text) === '就在不久前才介绍过吗'));

    // Count mismatch: rematerialize ZH by time over JA merge spans
    const zhShort = [
        { startMs: 0, endMs: 1200, text: '今天是爸爸喜欢的' },
        { startMs: 1300, endMs: 3200, text: '青花鱼味噌煮和烤牛肉' },
        { startMs: 7000, endMs: 7800, text: '受不了' },
    ];
    const jaLong = [
        { startMs: 0, endMs: 1200, text: '今日はお父さんが好きな' },
        { startMs: 1300, endMs: 3200, text: 'サバの味噌煮とローストビーフです' },
        { startMs: 4000, endMs: 4500, text: 'そうか' },
        { startMs: 7000, endMs: 7800, text: 'たまらない' },
    ];
    const remat = stitchAlignedJaZhFragmentPairs(zhShort, jaLong);
    assert.ok(!remat.skipped || remat.reason === 'count_mismatch_rematerialized');
    assert.ok(remat.mergedPairs >= 1);
    assert.ok(remat.jaCues.some((c) => String(c.text).includes('好きなサバ')));
    assert.ok(remat.zhCues.some((c) => String(c.text).includes('喜欢的青花鱼')));

    assert.ok(endsZhPrenominalIncomplete('呐，爱喝酒的'));
    assert.ok(startsZhNounContinuation('青豆腐'));
    assert.ok(!endsZhPrenominalIncomplete('是的'));
    assert.ok(!startsZhNounContinuation('感觉很可疑'));
    // Clause openers after attributive「…的」must not stitch (ATID-649 的容我)
    assert.ok(!startsZhNounContinuation('容我向各位介绍'));
    assert.ok(!startsZhNounContinuation('请放心吧'));
    assert.ok(!shouldStitchZhPrenominalPair(
        '小崎喜欢的',
        '容我向各位介绍一位可爱的女孩。',
        80,
    ));
    const zhOnly = stitchZhPrenominalCues([
        { startMs: 0, endMs: 1000, text: '呐，爱喝酒的' },
        { startMs: 1200, endMs: 2000, text: '青豆腐' },
        { startMs: 3000, endMs: 4000, text: '奈绪做的' },
        { startMs: 4050, endMs: 5000, text: '呐，味噌煮青花鱼好好吃啊。' },
    ]);
    assert.ok(zhOnly.mergedPairs >= 1);
    assert.ok(zhOnly.cues.some((c) => String(c.text).includes('爱喝酒的青豆腐')));
    assert.ok(zhOnly.cues.some((c) => String(c.text).trim() === '奈绪做的'));
    assert.ok(isFragmentCue('なさい'));
    assert.ok(isFragmentCue('吧'));
}

function testRemoveAlignedNoiseFromCuePairs() {
    const {
        removeAlignedNoiseFromCuePairs,
        summarizeNoiseRemoval,
    } = require('../src/js/subtitle-fluency-core');

    const ja = [
        { startMs: 0, endMs: 400, text: 'うん' }, // may stay (not ZH fragment rules)
        { startMs: 500, endMs: 900, text: '完毕' },
        { startMs: 1000, endMs: 1600, text: '大丈夫？' },
        { startMs: 1700, endMs: 2100, text: '[音楽]' },
    ];
    const zh = [
        { startMs: 0, endMs: 400, text: '嗯' }, // fragment → drop both
        { startMs: 500, endMs: 900, text: '好的' }, // JA hallucination → drop both
        { startMs: 1000, endMs: 1600, text: '没问题吧？' },
        { startMs: 1700, endMs: 2100, text: '…' }, // symbol / JA SFX → drop both
    ];
    const cleaned = removeAlignedNoiseFromCuePairs(zh, ja, {
        removeHallucinations: true,
        removeDuplicates: false,
    });
    assert.ok(cleaned.stats.removed >= 2);
    assert.strictEqual(cleaned.zhCues.length, cleaned.jaCues.length);
    assert.ok(cleaned.zhCues.some((c) => c.text.includes('没问题')));
    assert.ok(!cleaned.zhCues.some((c) => c.text === '嗯'));
    assert.ok(!cleaned.jaCues.some((c) => c.text === '完毕'));
    assert.ok(summarizeNoiseRemoval(cleaned.stats).includes('删除'));

    // Length mismatch: time-align instead of skip (never ZH-only removeEmpty).
    const mismatch = removeAlignedNoiseFromCuePairs(zh, ja.slice(0, 1));
    assert.ok(!mismatch.skipped, 'length mismatch should time-align, not skip');
    assert.strictEqual(mismatch.stats?.alignedBy, 'time');

    // Blank ZH + real JA dialogue must stay (under-translation), equal length.
    const under = removeAlignedNoiseFromCuePairs(
        [
            { startMs: 0, endMs: 800, text: '' },
            { startMs: 900, endMs: 1600, text: '…' },
            { startMs: 1700, endMs: 2400, text: '嗯' },
        ],
        [
            { startMs: 0, endMs: 800, text: '今日はよろしくお願いします' },
            { startMs: 900, endMs: 1600, text: 'ちょっと待ってください' },
            { startMs: 1700, endMs: 2400, text: 'うん' },
        ],
        { removeHallucinations: true },
    );
    assert.ok(under.jaCues.some((c) => c.text.includes('よろしく')));
    assert.ok(under.jaCues.some((c) => c.text.includes('待って')));
    assert.strictEqual(under.zhCues.length, under.jaCues.length);
    // 嗯/うん filler pair still removed together
    assert.ok(!under.zhCues.some((c) => c.text === '嗯'));
    assert.ok(!under.jaCues.some((c) => c.text === 'うん'));

    // ZH collapsed to a laugh/filler must not delete real JA dialogue.
    const laugh = removeAlignedNoiseFromCuePairs(
        [
            { startMs: 0, endMs: 3900, text: '哈哈' },
            { startMs: 4000, endMs: 4800, text: '嗯' },
        ],
        [
            { startMs: 0, endMs: 3900, text: 'あははは そんなことないいくつだの?' },
            { startMs: 4000, endMs: 4800, text: '今日はよろしくお願いします' },
        ],
        { removeHallucinations: true },
    );
    assert.ok(laugh.jaCues.some((c) => c.text.includes('そんなことない')));
    assert.ok(laugh.jaCues.some((c) => c.text.includes('よろしく')));
    assert.strictEqual(laugh.zhCues.length, laugh.jaCues.length);
}

function testDropPureInterjectionPairs() {
    const {
        isPureInterjectionJa,
        isPureInterjectionZh,
        dropPureInterjectionPairs,
        summarizePureInterjectionDrop,
    } = require('../src/js/subtitle-fluency-core');

    assert.ok(isPureInterjectionJa('うん'));
    assert.ok(isPureInterjectionJa('はぁ…'));
    assert.ok(isPureInterjectionJa('はぁ、はぁ'));
    assert.ok(isPureInterjectionJa('あっ、あっ'));
    assert.ok(isPureInterjectionJa('うん、うん'));
    assert.ok(isPureInterjectionJa('えっ'));
    assert.ok(isPureInterjectionJa('え？'));
    assert.ok(isPureInterjectionJa('くぅ'));
    assert.ok(isPureInterjectionJa('ふふっ'));
    assert.ok(isPureInterjectionJa('うふふ'));
    assert.ok(isPureInterjectionJa('んっ…んっ'));
    assert.ok(isPureInterjectionJa('はぁ♡'));
    // Soft-AV shelf: sokuon stacks often split with 、 (was miss: token class lacked っ / んんっ).
    assert.ok(isPureInterjectionJa('んっ、んんっ…'));
    assert.ok(isPureInterjectionJa('あっ、ああっ!'));
    assert.ok(isPureInterjectionJa('はぁっ、はぁっ'));
    assert.ok(isPureInterjectionJa('あんっ、あんっ'));
    assert.ok(isPureInterjectionJa('あ、ああっ!'));
    assert.ok(isPureInterjectionJa('んんっ'));
    assert.ok(isPureInterjectionJa('ああっ'));
    assert.ok(isPureInterjectionJa('はぁっ'));
    assert.ok(isPureInterjectionJa('ほらっほらっ'));
    assert.ok(isPureInterjectionJa('あらら'));
    assert.ok(isPureInterjectionJa('はい'));
    assert.ok(isPureInterjectionJa('そう'));
    assert.ok(isPureInterjectionJa('よしよし'));
    assert.ok(isPureInterjectionJa('あ゛っ'));
    assert.ok(isPureInterjectionJa('えっと'));
    assert.ok(!isPureInterjectionJa('うん、大丈夫？'));
    assert.ok(!isPureInterjectionJa('いいえ'));
    assert.ok(!isPureInterjectionJa('おはよう'));
    assert.ok(!isPureInterjectionJa('いい'));
    assert.ok(!isPureInterjectionJa('あっ…いい'));
    assert.ok(!isPureInterjectionJa('あっ、いい'));
    assert.ok(!isPureInterjectionJa('そうです'));
    assert.ok(isPureInterjectionZh('嗯'));
    assert.ok(isPureInterjectionZh('哈啊'));
    assert.ok(isPureInterjectionZh('…'));
    assert.ok(isPureInterjectionZh('哈啊…哈啊'));
    assert.ok(isPureInterjectionZh('哈啊♡'));
    assert.ok(isPureInterjectionZh('啊…啊'));
    assert.ok(isPureInterjectionZh('好的'));
    assert.ok(isPureInterjectionZh('是啊'));
    assert.ok(isPureInterjectionZh('对'));
    assert.ok(isPureInterjectionZh('嗯，好的'));
    assert.ok(isPureInterjectionZh('嗯嗯哈啊'));
    assert.ok(isPureInterjectionZh('嗯唔嗯嗯'));
    assert.ok(isPureInterjectionZh('唔嗯'));
    assert.ok(isPureInterjectionZh('Boeh~'));
    assert.ok(isPureInterjectionJa('んぶっ'));
    assert.ok(!isPureInterjectionZh('好舒服啊'));
    assert.ok(!isPureInterjectionZh('等一下'));
    assert.ok(!isPureInterjectionZh('好厉害'));
    assert.ok(!isPureInterjectionZh('好的，明白了'));

    const ja = [
        { startMs: 0, endMs: 400, text: 'うん' },
        { startMs: 500, endMs: 1200, text: 'うん、大丈夫？' },
        { startMs: 1300, endMs: 1800, text: 'はぁ…' },
        { startMs: 1900, endMs: 2600, text: 'ちょっと待って' },
        { startMs: 2700, endMs: 3200, text: 'はぁ、はぁ' },
        { startMs: 3300, endMs: 3800, text: 'ふふっ' },
        { startMs: 3900, endMs: 4300, text: 'はい' },
        { startMs: 4400, endMs: 4800, text: 'そう' },
        { startMs: 4900, endMs: 5400, text: 'あっ…いい' },
    ];
    const zh = [
        { startMs: 0, endMs: 400, text: '嗯' },
        { startMs: 500, endMs: 1200, text: '嗯，没问题吧？' },
        { startMs: 1300, endMs: 1800, text: '哈啊' },
        { startMs: 1900, endMs: 2600, text: '等一下' },
        { startMs: 2700, endMs: 3200, text: '哈啊…哈啊' },
        { startMs: 3300, endMs: 3800, text: '呵呵' },
        { startMs: 3900, endMs: 4300, text: '好的' },
        { startMs: 4400, endMs: 4800, text: '是啊' },
        { startMs: 4900, endMs: 5400, text: '啊……' },
    ];
    const dropped = dropPureInterjectionPairs(zh, ja);
    // Classic fillers + はい/そう; leading うん needs BOTH dialogue neighbors (≤2s bridge) — drop.
    // あっ…いい kept (semantic いい)
    assert.strictEqual(dropped.dropped, 6);
    assert.strictEqual(dropped.zhCues.length, 3);
    assert.strictEqual(dropped.jaCues.length, 3);
    assert.ok(dropped.zhCues.some((c) => /没问题/.test(c.text)));
    assert.ok(dropped.zhCues.some((c) => c.text === '等一下'));
    assert.ok(!dropped.jaCues.some((c) => c.text === 'うん'));
    assert.ok(dropped.jaCues.some((c) => /いい/.test(c.text)));
    assert.ok(summarizePureInterjectionDrop(2).includes('清除'));

    // Mid-dialogue はい within 2s → keep and gloss 是的
    const bridge = dropPureInterjectionPairs(
        [
            { startMs: 0, endMs: 1000, text: '可以吗？' },
            { startMs: 1100, endMs: 1400, text: '好的' },
            { startMs: 1600, endMs: 2200, text: '那就拜托了' },
        ],
        [
            { startMs: 0, endMs: 1000, text: 'これでいいですか' },
            { startMs: 1100, endMs: 1400, text: 'はい' },
            { startMs: 1600, endMs: 2200, text: 'お願いします' },
        ],
    );
    assert.strictEqual(bridge.dropped, 0);
    assert.strictEqual(bridge.zhCues[1].text, '是的');

    const timed = dropPureInterjectionPairs(
        [{ startMs: 0, endMs: 2200, text: '哈啊' }],
        [{ startMs: 0, endMs: 2200, text: 'はぁ…' }],
    );
    assert.strictEqual(timed.dropped, 1);
    assert.strictEqual(timed.zhCues.length, 0);

    assert.ok(isPureInterjectionJa('ロキロキロ'));
    assert.ok(isPureInterjectionJa('ローコロー'));
    assert.ok(isPureInterjectionJa('ザァッ'));
    assert.ok(!isPureInterjectionJa('オイル'));
    assert.ok(!isPureInterjectionJa('コーヒー'));
    assert.ok(isPureInterjectionZh('咯吱咯吱'));
    const kataSfx = dropPureInterjectionPairs(
        [{ startMs: 0, endMs: 800, text: '罗科罗' }],
        [{ startMs: 0, endMs: 800, text: 'ローコロー' }],
    );
    assert.strictEqual(kataSfx.dropped, 1);
    const oilKeep = dropPureInterjectionPairs(
        [{ startMs: 0, endMs: 800, text: '精油' }],
        [{ startMs: 0, endMs: 800, text: 'オイル' }],
    );
    assert.strictEqual(oilKeep.dropped, 0);

    // Mismatched counts: clear by time overlap (not skip)
    const mismatch = dropPureInterjectionPairs(
        [
            { startMs: 0, endMs: 400, text: '嗯嗯哈啊' },
            { startMs: 500, endMs: 1200, text: '等一下' },
            { startMs: 2000, endMs: 2400, text: 'Boeh~' },
        ],
        [
            { startMs: 0, endMs: 350, text: 'はぁ' },
            { startMs: 360, endMs: 450, text: 'んっ' },
            { startMs: 500, endMs: 1200, text: 'ちょっと待って' },
            { startMs: 2000, endMs: 2300, text: 'んぶっ' },
        ],
    );
    assert.ok(!mismatch.skipped, 'mismatch should not skip');
    assert.ok(mismatch.dropped >= 2, mismatch.dropped);
    assert.ok(mismatch.zhCues.some((c) => c.text === '等一下'));
    assert.ok(!mismatch.zhCues.some((c) => c.text === '嗯嗯哈啊'));
    assert.ok(!mismatch.zhCues.some((c) => /Boeh/i.test(c.text)));

    // Blank JA + filler ZH still compact.
    const blanked = dropPureInterjectionPairs(
        [{ startMs: 0, endMs: 300, text: '嗯' }, { startMs: 400, endMs: 800, text: '等一下' }],
        [{ startMs: 0, endMs: 300, text: '' }, { startMs: 400, endMs: 800, text: 'ちょっと待って' }],
    );
    assert.strictEqual(blanked.dropped, 1);
    assert.strictEqual(blanked.zhCues[0].text, '等一下');

    const { dropPureFillerBilingualCues } = require('../src/js/subtitle-fluency-core');
    const bi = dropPureFillerBilingualCues([
        { startMs: 0, endMs: 400, text: '嗯\nうん' },
        { startMs: 500, endMs: 1200, text: '等一下\nちょっと待って' },
        { startMs: 1300, endMs: 1800, text: '哈啊\nはぁ' },
    ], { dropDiscourse: true, dropOnomatopoeia: true });
    assert.strictEqual(bi.dropped, 2);
    assert.strictEqual(bi.cues.length, 1);
    assert.strictEqual(bi.cues[0].text, '等一下\nちょっと待って');
}

function testPreserveSubstantiveDialogue() {
    const {
        dropPureInterjectionPairs,
        removeNoiseFromCues,
        shouldPreserveSubstantiveDialogueCue,
        isHallucinationCue,
    } = require('../src/js/subtitle-fluency-core');

    const jaCue = { startMs: 10000, endMs: 11500, text: 'だめ、やめて' };
    const zhCue = { startMs: 10000, endMs: 11500, text: '不要，停下' };
    assert.ok(shouldPreserveSubstantiveDialogueCue(jaCue, jaCue.text));
    assert.ok(shouldPreserveSubstantiveDialogueCue(zhCue, zhCue.text));

    const kept = dropPureInterjectionPairs([zhCue], [jaCue]);
    assert.strictEqual(kept.dropped, 0);
    assert.strictEqual(kept.zhCues.length, 1);
    assert.strictEqual(kept.jaCues.length, 1);

    const moanJa = { startMs: 0, endMs: 2200, text: 'はぁ…' };
    const moanZh = { startMs: 0, endMs: 2200, text: '哈啊' };
    const moanDrop = dropPureInterjectionPairs([moanZh], [moanJa]);
    assert.strictEqual(moanDrop.dropped, 1);

    const noise = removeNoiseFromCues([jaCue], {
        removeHallucinations: true,
        removeFragments: true,
    });
    assert.strictEqual(noise.stats.removed, 0);
    assert.strictEqual(noise.cues.length, 1);

    assert.ok(!isHallucinationCue({ startMs: 10000, endMs: 11500, text: '不要' }));
}

function testIntlFillerClearByLanguage() {
    const {
        isPureDiscourseEn,
        isPureOnomatopoeiaEn,
        isPureInterjectionEn,
        isPureDiscourseKo,
        isPureOnomatopoeiaKo,
        isPureInterjectionKo,
        isPureDiscourseJa,
        isPureOnomatopoeiaJa,
        isPureDiscourseZh,
        isPureOnomatopoeiaZh,
        isPureInterjectionForLang,
        softenPureFillerInCues,
        dropPureInterjectionPairs,
        normalizeFillerLang,
    } = require('../src/js/subtitle-fluency-core');

    assert.strictEqual(normalizeFillerLang('en-US'), 'en');
    assert.strictEqual(normalizeFillerLang('ko'), 'ko');
    assert.strictEqual(normalizeFillerLang('zh-Hans'), 'zh');

    assert.ok(isPureDiscourseEn('Okay'));
    assert.ok(isPureDiscourseEn('yeah'));
    assert.ok(isPureDiscourseEn('mm-hmm'));
    assert.ok(isPureOnomatopoeiaEn('haha'));
    assert.ok(isPureOnomatopoeiaEn('bang'));
    assert.ok(isPureOnomatopoeiaEn('ugh'));
    assert.ok(isPureInterjectionEn('oh'));
    assert.ok(!isPureInterjectionEn('sorry'));
    assert.ok(!isPureInterjectionEn('Wait a second'));
    assert.ok(!isPureDiscourseEn('hello'));

    assert.ok(isPureDiscourseKo('응'));
    assert.ok(isPureDiscourseKo('네'));
    assert.ok(isPureDiscourseKo('그래'));
    assert.ok(isPureOnomatopoeiaKo('하하하'));
    assert.ok(isPureOnomatopoeiaKo('쿵'));
    assert.ok(isPureInterjectionKo('어'));
    assert.ok(!isPureInterjectionKo('미안해'));
    assert.ok(!isPureInterjectionKo('잠깐만'));

    assert.ok(isPureDiscourseJa('そっか'));
    assert.ok(isPureDiscourseJa('まあ'));
    assert.ok(isPureOnomatopoeiaJa('きゃっ'));
    assert.ok(isPureOnomatopoeiaJa('どきどき'));
    assert.ok(isPureDiscourseZh('唉'));
    assert.ok(isPureDiscourseZh('好吧'));
    assert.ok(isPureOnomatopoeiaZh('砰'));
    assert.ok(isPureOnomatopoeiaZh('嘿嘿'));

    assert.ok(isPureInterjectionForLang('Okay.', 'en'));
    assert.ok(isPureInterjectionForLang('응응', 'ko'));

    const enSoft = softenPureFillerInCues(
        [{ startMs: 0, endMs: 800, text: 'hahahaha' }],
        { kind: 'onomatopoeia', lang: 'en' },
    );
    assert.ok(enSoft.stats.cueTouched >= 1);
    assert.ok(/ha/i.test(enSoft.cues[0].text));
    assert.ok(enSoft.cues[0].text.length < 'hahahaha'.length);

    const enDrop = dropPureInterjectionPairs(
        [
            { startMs: 0, endMs: 400, text: 'Okay' },
            { startMs: 500, endMs: 1200, text: 'Wait a second' },
            { startMs: 1300, endMs: 1800, text: 'haha' },
            { startMs: 1900, endMs: 2400, text: 'bang' },
        ],
        [
            { startMs: 0, endMs: 400, text: 'はい' },
            { startMs: 500, endMs: 1200, text: 'ちょっと待って' },
            { startMs: 1300, endMs: 1800, text: 'あはは' },
            { startMs: 1900, endMs: 2400, text: 'ドンッ' },
        ],
        { targetLang: 'en', sourceLang: 'ja' },
    );
    // Discourse bridge may keep leading ack before real dialogue; moan/SFX pairs must clear.
    assert.ok(enDrop.dropped >= 2);
    assert.ok(enDrop.zhCues.some((c) => /Wait/.test(c.text)));
    assert.ok(!enDrop.zhCues.some((c) => /^haha$/i.test(c.text)));
    assert.ok(!enDrop.zhCues.some((c) => /^bang$/i.test(c.text)));

    const koDrop = dropPureInterjectionPairs(
        [
            { startMs: 0, endMs: 400, text: '네' },
            { startMs: 500, endMs: 1200, text: '잠깐만' },
            { startMs: 1300, endMs: 1800, text: '하하' },
            { startMs: 1900, endMs: 2400, text: '쿵' },
        ],
        [
            { startMs: 0, endMs: 400, text: 'はい' },
            { startMs: 500, endMs: 1200, text: 'ちょっと待って' },
            { startMs: 1300, endMs: 1800, text: 'あはは' },
            { startMs: 1900, endMs: 2400, text: 'ドンッ' },
        ],
        { targetLang: 'ko', sourceLang: 'ja' },
    );
    assert.ok(koDrop.dropped >= 2);
    assert.ok(koDrop.zhCues.some((c) => /잠깐/.test(c.text)));
    assert.ok(!koDrop.zhCues.some((c) => c.text === '하하'));
    assert.ok(!koDrop.zhCues.some((c) => c.text === '쿵'));
}

describe("subtitle-fluency", () => {
    it("repetition and stutter", () => {
        testRepetitionAndStutter();
    });
    it("dangling and fragment", () => {
        testDanglingAndFragment();
    });
    it("no punct long", () => {
        testNoPunctLong();
    });
    it("scan summary", () => {
        testScanSummary();
    });
    it("remove noise", () => {
        testRemoveNoise();
    });
    it("blank short interjections on translate tracks", () => {
        testTranslationTrackKeepsShortInterjectionsWhenBlanking();
    });
    it("hallucination cleanup", () => {
        testHallucinationCleanup();
    });
    it("compress repetition", () => {
        testCompressRepetition();
    });
    it("simplify viewing punctuation", () => {
        testSimplifyViewingPunctuation();
    });
    it("strips trailing ZH sentence periods and normalizes ~~ blanks", () => {
        testStripTrailingZhSentencePeriod();
    });
    it("dedupe ASR echo leftovers", () => {
        testAsrEchoDedupe();
    });
    it("stitch JA ASR fragments", () => {
        testJaFragmentStitch();
        testJaPhrasePrenominalStitch();
    });
    it("keeps lexical kana / stitches orphan から (MARR ASR false-pos)", () => {
        testMarrAsrFragmentFalsePositiveGuard();
    });
    it("drop pure interjection pairs", () => {
        testDropPureInterjectionPairs();
    });
    it("clears fillers by language features", () => {
        testIntlFillerClearByLanguage();
    });
    it("remove aligned noise from cue pairs", () => {
        testRemoveAlignedNoiseFromCuePairs();
    });
    it("preserves substantive dialogue from filler/noise cleanup", () => {
        testPreserveSubstantiveDialogue();
    });
});
