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
}

function main() {
    testRepetitionAndStutter();
    testDanglingAndFragment();
    testNoPunctLong();
    testScanSummary();
    testRemoveNoise();
    console.log('subtitle-fluency.test.js: all passed');
}

main();
