const assert = require('assert');

const {
    scanCueIssues,
    applySmartAdjustToCues,
    applyQcFixes,
    buildQcFixPlan,
    buildQcFixEstimate,
    buildQcOptionsForIssueType,
    buildQcReviewRows,
    applyQcAcceptedFixes,
    hasQcFixEffect,
    summarizeScan,
    summarizeRemaining,
    getCueCps,
    fixInvalidCueTimings,
} = require('../src/js/subtitle-qc-core');

function testScanDetectsOverlapAndCps() {
    const cues = [
        { startMs: 0, endMs: 2000, text: 'hello world' },
        { startMs: 1500, endMs: 3000, text: 'overlap next' },
        { startMs: 4000, endMs: 4200, text: 'a b c d e f g h i j' },
    ];
    const { issues, summary } = scanCueIssues(cues, { maxCps: 10, minSec: 0.5, maxSec: 10 });
    assert.ok(summary.overlap >= 1, 'should detect overlap');
    assert.ok(summary.highCps >= 1, 'should detect high cps');
    assert.ok(issues.some((i) => i.types.includes('overlap')));
    assert.ok(issues.some((i) => i.types.includes('high_cps')));
    assert.ok(summarizeScan(summary).includes('有问题'));
}

function testScanMarksConnectedHighCps() {
    // 无标点、无断句词：智能分割无法落刀，应标 connected
    const cues = [
        { startMs: 0, endMs: 300, text: '今天天气很好出去散步看看风景喝杯热茶休息一会' },
    ];
    const { summary, issues } = scanCueIssues(cues, {
        maxCps: 5,
        smartMaxChars: 8,
        smartLineChars: 8,
        checkFluency: false,
    });
    assert.strictEqual(summary.highCps, 1);
    assert.strictEqual(summary.connected, 1, `expected connected, got ${JSON.stringify(summary)}`);
    assert.strictEqual(summary.splittable, 0);
    assert.ok(issues[0].types.includes('connected'));
}

function testScanMarksPunctuatedChineseAsSplittable() {
    const cues = [
        {
            startMs: 0,
            endMs: 400,
            text: '今天天气很好，我们去公园玩。然后回家吃饭继续聊天。',
        },
    ];
    const { summary, issues } = scanCueIssues(cues, {
        maxCps: 5,
        smartMaxChars: 12,
        smartLineChars: 12,
        checkFluency: false,
    });
    assert.strictEqual(summary.highCps, 1);
    assert.ok(summary.splittable >= 1, 'punctuated Chinese should be splittable');
    assert.strictEqual(summary.connected, 0, 'should not mark as unsplittable connected');
    assert.ok(issues[0].types.includes('splittable'));
}

function testSmartAdjustFixesOverlap() {
    const cues = [
        { startMs: 0, endMs: 2000, text: 'a' },
        { startMs: 1500, endMs: 3000, text: 'b' },
    ];
    const stats = applySmartAdjustToCues(cues, {
        fixOverlap: true,
        fixCps: false,
        enforceMinDur: false,
        enforceMaxDur: false,
        gapMs: 1,
    });
    assert.ok(stats.overlapFixed >= 1);
    assert.ok(cues[1].startMs >= cues[0].endMs);
}

function testQcFixSplitsHighCpsThenAdjusts() {
    const cues = [
        {
            startMs: 0,
            endMs: 2000,
            text: 'Hello there, this is a longer line. Then another sentence goes here.',
        },
        { startMs: 1800, endMs: 2500, text: 'short' },
    ];
    const plan = buildQcFixPlan(cues, {
        fixCpsBySplit: true,
        fixCpsByExtend: true,
        fixOverlap: true,
        enforceMinDur: true,
        enforceMaxDur: true,
        maxCps: 8,
        smartMaxChars: 24,
        smartLineChars: 20,
        targetCps: 8,
        gapMs: 1,
    });
    assert.ok(plan.ok, plan.summary);
    assert.ok(plan.stats.splitCount >= 1 || plan.stats.overlapFixed >= 1 || plan.stats.cpsFixed >= 1);

    const fixed = applyQcFixes(cues, {
        fixCpsBySplit: true,
        fixCpsByExtend: true,
        fixOverlap: true,
        enforceMinDur: true,
        enforceMaxDur: true,
        maxCps: 8,
        smartMaxChars: 24,
        smartLineChars: 20,
        targetCps: 8,
        gapMs: 1,
    });
    assert.ok(fixed.cues.length >= cues.length);
    for (let i = 1; i < fixed.cues.length; i += 1) {
        assert.ok(
            fixed.cues[i].startMs >= fixed.cues[i - 1].endMs,
            `cue ${i} should not overlap previous`,
        );
    }
    // Original unchanged
    assert.strictEqual(cues.length, 2);
    assert.strictEqual(cues[1].startMs, 1800);
}

function testQcFixSplitsPunctuatedChinese() {
    const cues = [
        {
            startMs: 0,
            endMs: 800,
            text: '今天天气很好，我们去公园玩。然后回家吃饭。',
        },
    ];
    const fixed = applyQcFixes(cues, {
        fixCpsBySplit: true,
        fixCpsByExtend: true,
        fixOverlap: true,
        maxCps: 6,
        smartMaxChars: 10,
        smartLineChars: 10,
        targetCps: 6,
        gapMs: 1,
        checkFluency: false,
    });
    assert.ok(fixed.stats.splitCount >= 1, `should split punctuated Chinese: ${fixed.summary}`);
    assert.ok(fixed.cues.length >= 2);
}

function testBuildPlanRequiresSelection() {
    const cues = [{ startMs: 0, endMs: 1000, text: 'ok' }];
    const plan = buildQcFixPlan(cues, {
        fixOverlap: false,
        fixCpsBySplit: false,
        fixCpsByExtend: false,
        enforceMinDur: false,
        enforceMaxDur: false,
        fixInvalid: false,
        compressRepetition: false,
        removeNoise: false,
        removeDuplicates: false,
    });
    assert.strictEqual(plan.ok, false);
    assert.ok(plan.summary.includes('至少选择'));
}

function testGetCueCps() {
    const cps = getCueCps({ startMs: 0, endMs: 2000, text: 'abcd' });
    assert.strictEqual(cps, 2);
}

function testScanDetectsFluency() {
    const cues = [
        { startMs: 0, endMs: 2000, text: '好好好好好好好' },
        { startMs: 2000, endMs: 3000, text: '他走向了' },
    ];
    const { summary, issues } = scanCueIssues(cues, {
        fixOverlap: false,
        checkFluency: true,
        maxCps: 100,
        minSec: 0.1,
        maxSec: 60,
    });
    // 叠词条计 repetition；句末残缺计 fluency —— 不再双重刷屏
    assert.ok(summary.repetition >= 1 || summary.fluency >= 1, 'should detect fluency/repetition');
    assert.ok(issues.some((i) => i.types.includes('fluency') || i.types.includes('repetition')));
    assert.ok(summarizeScan(summary).includes('通顺度') || summarizeScan(summary).includes('叠词'));
}

function testScanDedupesRepetitionFromFluency() {
    const cues = [
        { startMs: 0, endMs: 2000, text: '好的好的好的好的好的' },
    ];
    const { summary, issues } = scanCueIssues(cues, {
        checkFluency: true,
        maxCps: 100,
        minSec: 0.1,
        maxSec: 60,
    });
    assert.strictEqual(summary.repetition, 1);
    const issue = issues[0];
    assert.ok(issue.types.includes('repetition'));
    // 可压缩叠词不应再单独刷一条通顺度（除非另有残缺等）
    assert.ok(!issue.types.includes('fluency') || issue.messages.every((m) => !/重复|口吃/.test(m)));
}

function testScanDetectsRepetition() {
    const cues = [
        { startMs: 0, endMs: 2000, text: '好的好的好的好的好的' },
        { startMs: 2000, endMs: 4000, text: '正常对白内容。' },
    ];
    const { summary, issues } = scanCueIssues(cues, {
        fixOverlap: false,
        checkFluency: true,
        maxCps: 100,
        minSec: 0.1,
        maxSec: 60,
    });
    assert.ok(summary.repetition >= 1, 'should detect compressible repetition');
    assert.ok(issues.some((i) => i.types.includes('repetition')));
    assert.ok(summarizeScan(summary).includes('叠词'));

    const repOpts = buildQcOptionsForIssueType({}, 'repetition');
    assert.ok(repOpts);
    assert.strictEqual(repOpts.compressRepetition, true);

    const plan = buildQcFixPlan(cues, { ...repOpts, issueTypeFilter: 'repetition' });
    assert.ok(plan.ok, plan.summary);
    const fixed = applyQcFixes(cues, repOpts);
    assert.ok(fixed.stats.compressRepFixed >= 1);
    assert.strictEqual(fixed.cues[0].text, '好的…好的！');
}

function testFixInvalidAndDuplicates() {
    const cues = [
        { startMs: 1000, endMs: 500, text: '坏时间轴' },
        { startMs: 2000, endMs: 3000, text: '同一句' },
        { startMs: 3000, endMs: 4000, text: '同一句' },
        { startMs: 4000, endMs: 5000, text: '啊' },
    ];
    const scanned = scanCueIssues(cues, {
        maxCps: 100,
        minSec: 0.1,
        maxSec: 60,
        checkFluency: true,
    });
    assert.ok(scanned.summary.invalid >= 1);
    assert.ok(scanned.summary.duplicate >= 1);

    const invalidOpts = buildQcOptionsForIssueType({}, 'invalid');
    assert.ok(invalidOpts);
    assert.strictEqual(invalidOpts.fixInvalid, true);

    const fluencyOpts = buildQcOptionsForIssueType({}, 'fluency');
    assert.ok(fluencyOpts, 'fluency should have safe auto-fix path');
    assert.strictEqual(fluencyOpts.compressRepetition, true);
    assert.strictEqual(fluencyOpts.removeDuplicates, true);

    const fixed = applyQcFixes(cues, {
        fixInvalid: true,
        fixOverlap: true,
        enforceMinDur: true,
        removeDuplicates: true,
        removeNoise: true,
        compressRepetition: false,
        fixCpsBySplit: false,
        fixCpsByExtend: false,
        enforceMaxDur: false,
        maxCps: 100,
        minSec: 0.1,
        maxSec: 60,
    });
    assert.ok(fixed.stats.invalidFixed >= 1 || fixed.cues[0].endMs > fixed.cues[0].startMs);
    assert.ok(fixed.stats.duplicatesRemoved >= 1 || fixed.stats.noiseRemoved >= 1);
    assert.ok(fixed.cues.every((c) => c.endMs > c.startMs));
}

function testBuildOptionsForIssueType() {
    const overlap = buildQcOptionsForIssueType({
        fixOverlap: true,
        fixCpsBySplit: true,
        fixCpsByExtend: true,
        enforceMinDur: true,
        enforceMaxDur: true,
    }, 'overlap');
    assert.ok(overlap);
    assert.strictEqual(overlap.fixOverlap, true);
    assert.strictEqual(overlap.fixCpsBySplit, false);
    assert.strictEqual(overlap.enforceMinDur, false);

    const short = buildQcOptionsForIssueType({}, 'short');
    assert.ok(short);
    assert.strictEqual(short.enforceMinDur, true);
    assert.strictEqual(short.fixOverlap, false);

    const connected = buildQcOptionsForIssueType({}, 'connected');
    assert.ok(connected);
    assert.strictEqual(connected.fixCpsByExtend, true);

    const high = buildQcOptionsForIssueType({
        fixCpsBySplit: true,
        fixCpsByExtend: false,
    }, 'high_cps');
    assert.ok(high);
    assert.strictEqual(high.fixCpsBySplit, true);
    assert.strictEqual(high.fixCpsByExtend, false);

    const plan = buildQcFixPlan([
        { startMs: 0, endMs: 2000, text: 'a' },
        { startMs: 1500, endMs: 3000, text: 'b' },
    ], overlap);
    assert.ok(plan.ok, plan.summary);
}

function testSummarizeRemaining() {
    const text = summarizeRemaining({
        total: 3,
        highCps: 1,
        fluency: 2,
        overlap: 0,
    });
    assert.ok(text.includes('仍有 3'));
    assert.ok(text.includes('读速'));
}

function testFixInvalidCueTimingsStandalone() {
    const cues = [
        { startMs: 0, endMs: 0, text: 'a' },
        { startMs: 50, endMs: 1000, text: 'b' },
    ];
    const n = fixInvalidCueTimings(cues, { minSec: 0.3, gapMs: 1 });
    assert.ok(n >= 1);
    assert.ok(cues[0].endMs > cues[0].startMs);
}

describe("subtitle-qc", () => {
    it("scan detects overlap and cps", () => {
        testScanDetectsOverlapAndCps();
    });
    it("scan marks connected high cps", () => {
        testScanMarksConnectedHighCps();
    });
    it("scan marks punctuated chinese as splittable", () => {
        testScanMarksPunctuatedChineseAsSplittable();
    });
    it("smart adjust fixes overlap", () => {
        testSmartAdjustFixesOverlap();
    });
    it("qc fix splits high cps then adjusts", () => {
        testQcFixSplitsHighCpsThenAdjusts();
    });
    it("qc fix splits punctuated chinese", () => {
        testQcFixSplitsPunctuatedChinese();
    });
    it("build plan requires selection", () => {
        testBuildPlanRequiresSelection();
    });
    it("get cue cps", () => {
        testGetCueCps();
    });
    it("scan detects fluency", () => {
        testScanDetectsFluency();
    });
    it("scan dedupes repetition from fluency", () => {
        testScanDedupesRepetitionFromFluency();
    });
    it("scan detects repetition", () => {
        testScanDetectsRepetition();
    });
    it("fix invalid and duplicates", () => {
        testFixInvalidAndDuplicates();
    });
    it("build options for issue type", () => {
        testBuildOptionsForIssueType();
    });
    it("summarize remaining", () => {
        testSummarizeRemaining();
    });
    it("fix invalid cue timings standalone", () => {
        testFixInvalidCueTimingsStandalone();
    });
    it("estimate skips dry-apply and apply returns scan", () => {
        const cues = [
            { startMs: 0, endMs: 2000, text: 'hello world' },
            { startMs: 1500, endMs: 3000, text: 'overlap next' },
        ];
        const est = buildQcFixEstimate(cues, { fixOverlap: true, maxCps: 18 });
        assert.strictEqual(est.estimateOnly, true);
        assert.ok(est.before?.summary?.overlap >= 1);
        const fixed = applyQcFixes(cues, { fixOverlap: true, maxCps: 18 });
        assert.ok(fixed.scan?.summary);
        assert.ok(Array.isArray(fixed.scan.issues));
        const plan = buildQcFixPlan(cues, { fixOverlap: true, estimateOnly: true });
        assert.strictEqual(plan.estimateOnly, true);
    });
    it("review rows allow selective accept for same-length fixes", () => {
        const before = [
            { startMs: 0, endMs: 2000, text: 'hello world' },
            { startMs: 1500, endMs: 3000, text: 'overlap next' },
            { startMs: 4000, endMs: 5000, text: 'keep me' },
        ];
        const fixed = applyQcFixes(before, { fixOverlap: true, maxCps: 18 });
        assert.ok(hasQcFixEffect(fixed.stats));
        const { rows, structural } = buildQcReviewRows(before, fixed.cues);
        assert.strictEqual(structural, false);
        assert.ok(rows.some((r) => r.changed));
        const changedIdx = rows.filter((r) => r.changed).map((r) => r.index);
        assert.ok(changedIdx.includes(0), `expected cue0 changed, got ${changedIdx}`);
        const onlyFirst = applyQcAcceptedFixes(before, fixed.cues, [
            { index: 0, text: fixed.cues[0].text },
        ]);
        assert.ok(onlyFirst);
        assert.strictEqual(onlyFirst[0].endMs, fixed.cues[0].endMs);
        assert.strictEqual(onlyFirst[1].startMs, before[1].startMs);
        assert.strictEqual(onlyFirst[2].text, 'keep me');
        assert.strictEqual(applyQcAcceptedFixes(before, fixed.cues, []), null);
    });
    it("review rows mark structural split and apply full after", () => {
        const before = [
            {
                startMs: 0,
                endMs: 400,
                text: '今天天气很好，我们去公园玩。然后回家吃饭继续聊天。',
            },
        ];
        const fixed = applyQcFixes(before, {
            fixCpsBySplit: true,
            maxCps: 5,
            smartMaxChars: 12,
            smartLineChars: 12,
            checkFluency: false,
        });
        assert.ok(fixed.cues.length > before.length, 'expected split');
        const { rows, structural } = buildQcReviewRows(before, fixed.cues);
        assert.strictEqual(structural, true);
        assert.ok(rows.some((r) => r.changed));
        const applied = applyQcAcceptedFixes(before, fixed.cues, [
            { index: 0, text: fixed.cues[0].text },
        ]);
        assert.strictEqual(applied.length, fixed.cues.length);
        assert.strictEqual(applied[0].text, fixed.cues[0].text);
    });
});
