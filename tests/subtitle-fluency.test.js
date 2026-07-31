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
        { startMs: 10000, endMs: 10500, text: 'ちんちんビンビンだね嬉' },
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
    it("hallucination cleanup", () => {
        testHallucinationCleanup();
    });
    it("compress repetition", () => {
        testCompressRepetition();
    });
    it("stitch JA ASR fragments", () => {
        testJaFragmentStitch();
    });
});
