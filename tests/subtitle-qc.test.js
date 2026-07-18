const assert = require('assert');

const {
    scanCueIssues,
    applySmartAdjustToCues,
    applyQcFixes,
    buildQcFixPlan,
    buildQcOptionsForIssueType,
    summarizeScan,
    getCueCps,
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
    const cues = [
        { startMs: 0, endMs: 300, text: '今天天气很好我们去公园玩然后回家吃饭继续聊天' },
    ];
    const { summary, issues } = scanCueIssues(cues, { maxCps: 5, smartMaxChars: 8 });
    assert.strictEqual(summary.highCps, 1);
    assert.strictEqual(summary.connected, 1);
    assert.strictEqual(summary.splittable, 0);
    assert.ok(issues[0].types.includes('connected'));
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

function testBuildPlanRequiresSelection() {
    const cues = [{ startMs: 0, endMs: 1000, text: 'ok' }];
    const plan = buildQcFixPlan(cues, {
        fixOverlap: false,
        fixCpsBySplit: false,
        fixCpsByExtend: false,
        enforceMinDur: false,
        enforceMaxDur: false,
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
    assert.ok(summary.fluency >= 1, 'should detect fluency issues');
    assert.ok(issues.some((i) => i.types.includes('fluency')));
    assert.ok(summarizeScan(summary).includes('通顺度'));
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

    const fluency = buildQcOptionsForIssueType({}, 'fluency');
    assert.strictEqual(fluency, null);

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

describe("subtitle-qc", () => {
    it("scan detects overlap and cps", () => {
        testScanDetectsOverlapAndCps();
    });
    it("scan marks connected high cps", () => {
        testScanMarksConnectedHighCps();
    });
    it("smart adjust fixes overlap", () => {
        testSmartAdjustFixesOverlap();
    });
    it("qc fix splits high cps then adjusts", () => {
        testQcFixSplitsHighCpsThenAdjusts();
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
    it("build options for issue type", () => {
        testBuildOptionsForIssueType();
    });
});
