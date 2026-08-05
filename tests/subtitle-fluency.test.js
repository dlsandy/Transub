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
    const { isSymbolOnlyCue, isSoundEffectCue } = require('../src/js/subtitle-fluency-core');
    assert.ok(isSymbolOnlyCue('◆ ◆ ◆ ◆ ◆ ◆'));
    assert.ok(isSoundEffectCue('◆ ◆ ◆'));
    assert.strictEqual(normalizeAsrText("All right , let ' s do this"), "All right, let's do this");
    assert.strictEqual(normalizeAsrText('and for 1 0 years'), 'and for 10 years');
    assert.strictEqual(normalizeAsrText('▁the rest'), 'the rest');
    assert.strictEqual(normalizeAsrText('greatI saved'), 'great I saved');
    assert.strictEqual(normalizeAsrText("I ' been the one"), 'I been the one');
    assert.strictEqual(normalizeAsrText("I ' m pretty"), "I'm pretty");
    assert.strictEqual(normalizeAsrText("we don ' t really"), "we don't really");
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
    assert.strictEqual(a.text, '好的…好的！');

    const b = compressRepetitionInText('太好了太好了太好了太好了太好了太好了太好');
    assert.ok(b.changed);
    assert.strictEqual(b.text, '太好了…太好了！');

    const c = compressRepetitionInText('来 这边也要 从这边过去 啊 走走走走走走走走走走');
    assert.ok(c.changed);
    assert.ok(c.text.includes('走…走！'));
    assert.ok(c.text.includes('从这边过去'));

    const d = compressRepetitionInText('啊 真好笑 哈哈哈哈哈哈哈哈');
    assert.strictEqual(d.text, '啊 真好笑 哈…哈！');

    const e = compressRepetitionInText('快点 快点 快点 快点');
    assert.strictEqual(e.text, '快点…快点！');

    const f = compressRepetitionInText('哈哈哈哈哈哈');
    assert.strictEqual(f.text, '哈…哈！');

    const g = compressRepetitionInText('好的好的');
    assert.ok(!g.changed, '少于 3 次不压缩');

    const cues = [
        { startMs: 0, endMs: 1000, text: '好的好的好的好的' },
        { startMs: 1000, endMs: 2000, text: '正常对白' },
        { startMs: 2000, endMs: 3000, text: '加油加油加油加油 快点快点快点快点' },
    ];
    const batch = compressRepetitionInCues(cues);
    assert.strictEqual(batch.stats.cueTouched, 2);
    assert.strictEqual(batch.cues[0].text, '好的…好的！');
    assert.strictEqual(batch.cues[1].text, '正常对白');
    assert.ok(batch.cues[2].text.includes('加油…加油！'));
    assert.ok(batch.cues[2].text.includes('快点…快点！'));
    assert.ok(summarizeRepetitionCompress(batch.stats).includes('压缩'));

    const scoped = compressRepetitionInCues(cues, { indexes: [1] });
    assert.strictEqual(scoped.stats.cueTouched, 0);
}

function testJaFragmentStitch() {
    const {
        stitchJaFragmentCues,
        summarizeJaStitch,
        isFragmentCue,
        endsJaBroken,
        startsJaContinuation,
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

    const mismatch = removeAlignedNoiseFromCuePairs(zh, ja.slice(0, 1));
    assert.strictEqual(mismatch.skipped, true);
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
    assert.ok(!isPureInterjectionJa('うん、大丈夫？'));
    assert.ok(!isPureInterjectionJa('いいえ'));
    assert.ok(!isPureInterjectionJa('おはよう'));
    assert.ok(isPureInterjectionZh('嗯'));
    assert.ok(isPureInterjectionZh('哈啊'));
    assert.ok(isPureInterjectionZh('…'));
    assert.ok(isPureInterjectionZh('哈啊…哈啊'));
    assert.ok(isPureInterjectionZh('哈啊♡'));
    assert.ok(isPureInterjectionZh('啊…啊'));
    assert.ok(!isPureInterjectionZh('好舒服啊'));
    assert.ok(!isPureInterjectionZh('等一下'));
    assert.ok(!isPureInterjectionZh('好厉害'));
    assert.ok(!isPureInterjectionZh('好的'));

    const ja = [
        { startMs: 0, endMs: 400, text: 'うん' },
        { startMs: 500, endMs: 1200, text: 'うん、大丈夫？' },
        { startMs: 1300, endMs: 1800, text: 'はぁ…' },
        { startMs: 1900, endMs: 2600, text: 'ちょっと待って' },
        { startMs: 2700, endMs: 3200, text: 'はぁ、はぁ' },
        { startMs: 3300, endMs: 3800, text: 'ふふっ' },
    ];
    const zh = [
        { startMs: 0, endMs: 400, text: '嗯' },
        { startMs: 500, endMs: 1200, text: '嗯，没问题吧？' },
        { startMs: 1300, endMs: 1800, text: '哈啊' },
        { startMs: 1900, endMs: 2600, text: '等一下' },
        { startMs: 2700, endMs: 3200, text: '哈啊…哈啊' },
        { startMs: 3300, endMs: 3800, text: '呵呵' },
    ];
    const dropped = dropPureInterjectionPairs(zh, ja);
    assert.strictEqual(dropped.dropped, 4);
    assert.strictEqual(dropped.zhCues.length, 2);
    assert.strictEqual(dropped.jaCues.length, 2);
    assert.strictEqual(dropped.zhCues[0].text, '嗯，没问题吧？');
    assert.strictEqual(dropped.zhCues[1].text, '等一下');
    assert.ok(summarizePureInterjectionDrop(2).includes('精简'));

    const mismatch = dropPureInterjectionPairs(zh, ja.slice(0, 2));
    assert.strictEqual(mismatch.dropped, 0);
    assert.strictEqual(mismatch.skipped, true);

    // Blank JA + filler ZH still compact.
    const blanked = dropPureInterjectionPairs(
        [{ startMs: 0, endMs: 300, text: '嗯' }, { startMs: 400, endMs: 800, text: '等一下' }],
        [{ startMs: 0, endMs: 300, text: '' }, { startMs: 400, endMs: 800, text: 'ちょっと待って' }],
    );
    assert.strictEqual(blanked.dropped, 1);
    assert.strictEqual(blanked.zhCues[0].text, '等一下');
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
    it("stitch JA ASR fragments", () => {
        testJaFragmentStitch();
    });
    it("drop pure interjection pairs", () => {
        testDropPureInterjectionPairs();
    });
    it("remove aligned noise from cue pairs", () => {
        testRemoveAlignedNoiseFromCuePairs();
    });
});
