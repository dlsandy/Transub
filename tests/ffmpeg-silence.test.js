const assert = require('assert');

const {
    parseSilenceDetectLog,
    clampSilenceIntervals,
    silenceMidpointsToMs,
    resolveFfmpegForExecution,
    findBundledFfprobePath,
} = require('../electron/ffmpeg-bridge');

const {
    buildCuesFromSilenceSplits,
    buildTextsFromTimeBoundaries,
    inferSpeechEndFromSilence,
    inferSpeechStartFromSilence,
    refineSilenceSplitCueTimings,
    buildSpeechRegionsFromSilence,
    snapCueTimingFromSilenceIntervals,
} = require('../src/js/subtitle-split-core');

function testParseSilenceDetectLog() {
    const stderr = `
[silencedetect @ 000] silence_start: 0.42
[silencedetect @ 000] silence_end: 1.10 | silence_duration: 0.68
[silencedetect @ 000] silence_start: 2.00
[silencedetect @ 000] silence_end: 2.55 | silence_duration: 0.55
`;
    const intervals = parseSilenceDetectLog(stderr, 10);
    assert.strictEqual(intervals.length, 2);
    assert.ok(Math.abs(intervals[0].startSec - 10.42) < 0.001);
    assert.ok(Math.abs(intervals[1].endSec - 12.55) < 0.001);
}

function testParseSilenceDetectLogTrailingEof() {
    const stderr = `
[silencedetect @ 000] silence_start: 1.20
[silencedetect @ 000] silence_end: 1.80 | silence_duration: 0.60
[silencedetect @ 000] silence_start: 3.40
`;
    const intervals = parseSilenceDetectLog(stderr, 5, 10);
    assert.strictEqual(intervals.length, 2);
    assert.ok(Math.abs(intervals[0].startSec - 6.2) < 0.001);
    assert.ok(Math.abs(intervals[1].startSec - 8.4) < 0.001);
    assert.ok(Math.abs(intervals[1].endSec - 10) < 0.001);
}

function testSilenceMidpointsNearEdgeShortCue() {
    // 1.5s cue: pause near start used to be discarded by fixed 400ms edge margin
    const intervals = [{ startSec: 10.25, endSec: 10.55 }];
    const points = silenceMidpointsToMs(intervals, 10000, 11500, 400);
    assert.ok(points.length >= 1, `expected split near early pause, got ${JSON.stringify(points)}`);
}

function testSilenceMidpointsToMs() {
    const intervals = [
        { startSec: 10.4, endSec: 11.0 },
        { startSec: 12.0, endSec: 12.6 },
    ];
    const points = silenceMidpointsToMs(intervals, 10000, 15000, 400);
    assert.strictEqual(points.length, 2);
    assert.ok(points[0] > 10400 && points[0] < 11100);
}

function testBuildTextsFromTimeBoundaries() {
    const texts = buildTextsFromTimeBoundaries(
        '今天天气很好，我们去公园玩。然后回家吃饭。',
        0,
        6000,
        [2500, 4500],
    );
    assert.ok(texts && texts.length >= 2);
    assert.ok(texts.join('').includes('今天'));
}

function testBuildCuesFromSilenceSplits() {
    const cues = buildCuesFromSilenceSplits(
        'Hello，world! More text here.',
        1000,
        5000,
        [2500, 3800],
    );
    assert.ok(cues && cues.length >= 2);
    assert.strictEqual(cues[0].startMs, 1000);
    assert.strictEqual(cues[cues.length - 1].endMs, 5000);
    assert.ok(cues.every((cue) => cue.text && cue.endMs > cue.startMs));
}

function testBuildCuesFromSilenceSplitsWhitespace() {
    const text = '结婚了四年 生完孩子之后就开始做这些事';
    const startMs = 0;
    const endMs = 10000;
    // 模拟检测到两个静音点，容易把文本切成三段
    const splitPoints = [3200, 6800];

    const cues = buildCuesFromSilenceSplits(text, startMs, endMs, splitPoints);
    assert.ok(cues && cues.length === 2, `expected 2 cues, got ${cues && cues.length}`);
    assert.strictEqual(cues[0].text, '结婚了四年');
    assert.strictEqual(cues[1].text, '生完孩子之后就开始做这些事');
    assert.strictEqual(cues[0].startMs, startMs);
    assert.strictEqual(cues[1].endMs, endMs);
}

function testInferSpeechEndFromSilence() {
    const startMs = 279030;
    const endMs = 289089;
    const intervals = [
        { startMs: 283020, endMs: 289089 },
    ];
    const newEnd = inferSpeechEndFromSilence(startMs, endMs, intervals, {
        minDurMs: 500,
        minTrailingSilenceMs: 300,
        tailPadMs: 80,
        minShrinkMs: 150,
    });
    assert.ok(newEnd != null, 'expected speech end from trailing silence');
    assert.ok(newEnd < endMs, 'should shorten cue end');
    assert.ok(newEnd >= startMs + 4000 && newEnd <= startMs + 4500,
        `expected ~4s speech, got ${((newEnd - startMs) / 1000).toFixed(3)}s`);
}

function testInferSpeechEndFromSilenceNoTrailing() {
    const newEnd = inferSpeechEndFromSilence(0, 5000, [
        { startMs: 1200, endMs: 1800 },
    ]);
    assert.strictEqual(newEnd, null);
}

function testInferSpeechStartFromSilence() {
    const startMs = 10000;
    const endMs = 15000;
    const intervals = [
        { startMs: 10000, endMs: 10400 },
    ];
    const newStart = inferSpeechStartFromSilence(startMs, endMs, intervals, {
        minDurMs: 500,
        minLeadingSilenceMs: 300,
        headPadMs: 80,
        minShiftMs: 150,
    });
    assert.ok(newStart > startMs, 'should skip leading silence');
    assert.ok(newStart >= 10320 && newStart <= 10400, `expected near silence end, got ${newStart}`);
}

function testRefineSilenceSplitCueTimings() {
    const parentStart = 0;
    const parentEnd = 10000;
    const intervals = [
        { startMs: 4800, endMs: 5200 },
        { startMs: 9200, endMs: 10000 },
    ];
    const cues = [
        { startMs: 0, endMs: 5000, text: '结婚了四年' },
        { startMs: 5000, endMs: 10000, text: '生完孩子之后就开始做这些事' },
    ];
    const refined = refineSilenceSplitCueTimings(cues, intervals, parentStart, parentEnd, {
        minDurMs: 500,
        minTrailingSilenceMs: 300,
        minLeadingSilenceMs: 300,
        tailPadMs: 80,
        headPadMs: 80,
        gapMs: 1,
    });
    assert.strictEqual(refined.length, 2);
    assert.ok(refined[0].startMs < 500, `first cue should start near speech, got ${refined[0].startMs}`);
    assert.ok(refined[0].endMs <= 4880, `first cue should end before silence, got ${refined[0].endMs}`);
    assert.ok(refined[1].startMs >= 5120, `second cue should start after silence, got ${refined[1].startMs}`);
    assert.ok(refined[1].endMs <= 9280, `second cue should trim trailing silence, got ${refined[1].endMs}`);
}

function testBuildCuesFromSilenceSplitsWithIntervals() {
    const text = '结婚了四年 生完孩子之后就开始做这些事';
    const startMs = 0;
    const endMs = 10000;
    const splitPoints = [5000];
    const intervals = [
        { startMs: 4800, endMs: 5200 },
        { startMs: 9200, endMs: 10000 },
    ];
    const cues = buildCuesFromSilenceSplits(
        text,
        startMs,
        endMs,
        splitPoints,
        16,
        intervals,
        {
            minDurMs: 500,
            minTrailingSilenceMs: 300,
            minLeadingSilenceMs: 300,
        },
    );
    assert.ok(cues && cues.length === 2);
    assert.strictEqual(cues[0].text, '结婚了四年');
    assert.strictEqual(cues[1].text, '生完孩子之后就开始做这些事');
    assert.ok(cues[0].endMs <= 4880);
    assert.ok(cues[1].startMs >= 5120);
    assert.ok(cues[1].endMs <= 9280);
}

function testResolveFfmpegForExecutionMissingCustomPath() {
    const result = resolveFfmpegForExecution('C:\\\\Definitely\\\\Missing\\\\ffmpeg-folder');
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /未在指定路径找到 ffmpeg/);
}

function testResolveBundledFfmpegFromInternal() {
    const result = resolveFfmpegForExecution('');
    if (!result.bundled) {
        console.log('skip: no bundled _internal/bin/ffmpeg.exe present');
        return;
    }
    assert.strictEqual(result.ok, true);
    assert.match(result.path.replace(/\\/g, '/'), /_internal\/bin\/ffmpeg(\.exe)?$/i);
    assert.ok(require('fs').existsSync(result.path));

    const probe = findBundledFfprobePath();
    assert.ok(probe);
    assert.match(probe.replace(/\\/g, '/'), /_internal\/bin\/ffprobe(\.exe)?$/i);
}

function testSnapCueTimingFromSilenceIntervals() {
    // 窗内：静音0-0.5s，语音0.5-4.0s，静音4.0-6.0s；字幕原始偏宽 0-5.5s
    const result = snapCueTimingFromSilenceIntervals(0, 5500, [
        { startMs: 0, endMs: 500 },
        { startMs: 4000, endMs: 6000 },
    ], {
        windowStartMs: 0,
        windowEndMs: 6000,
        headPadMs: 80,
        tailPadMs: 80,
        minDurMs: 500,
        minShiftMs: 80,
        allowExtend: true,
    });
    assert.ok(result.changed, 'should snap to speech');
    assert.ok(result.startMs >= 400 && result.startMs <= 500, `start near speech onset, got ${result.startMs}`);
    assert.ok(result.endMs >= 4000 && result.endMs <= 4180, `end near speech offset, got ${result.endMs}`);

    const regions = buildSpeechRegionsFromSilence(0, 6000, [
        { startMs: 0, endMs: 500 },
        { startMs: 4000, endMs: 6000 },
    ], 200);
    assert.strictEqual(regions.length, 1);
    assert.strictEqual(regions[0].startMs, 500);
    assert.strictEqual(regions[0].endMs, 4000);
}

function testSnapCueTimingNoSpeechKeepsOriginal() {
    const result = snapCueTimingFromSilenceIntervals(1000, 2000, [
        { startMs: 1000, endMs: 2000 },
    ], {
        windowStartMs: 1000,
        windowEndMs: 2000,
        minSpeechMs: 200,
    });
    assert.strictEqual(result.changed, false);
    assert.strictEqual(result.startMs, 1000);
    assert.strictEqual(result.endMs, 2000);
}

describe("ffmpeg-silence", () => {
    it("parse silence detect log", () => {
        testParseSilenceDetectLog();
    });
    it("parse silence detect log trailing eof", () => {
        testParseSilenceDetectLogTrailingEof();
    });
    it("silence midpoints near edge short cue", () => {
        testSilenceMidpointsNearEdgeShortCue();
    });
    it("silence midpoints to ms", () => {
        testSilenceMidpointsToMs();
    });
    it("build texts from time boundaries", () => {
        testBuildTextsFromTimeBoundaries();
    });
    it("build cues from silence splits", () => {
        testBuildCuesFromSilenceSplits();
    });
    it("build cues from silence splits whitespace", () => {
        testBuildCuesFromSilenceSplitsWhitespace();
    });
    it("infer speech end from silence", () => {
        testInferSpeechEndFromSilence();
    });
    it("infer speech end from silence no trailing", () => {
        testInferSpeechEndFromSilenceNoTrailing();
    });
    it("infer speech start from silence", () => {
        testInferSpeechStartFromSilence();
    });
    it("refine silence split cue timings", () => {
        testRefineSilenceSplitCueTimings();
    });
    it("build cues from silence splits with intervals", () => {
        testBuildCuesFromSilenceSplitsWithIntervals();
    });
    it("resolve ffmpeg for execution missing custom path", () => {
        testResolveFfmpegForExecutionMissingCustomPath();
    });
    it("resolve bundled ffmpeg from internal", () => {
        testResolveBundledFfmpegFromInternal();
    });
    it("snap cue timing from silence intervals", () => {
        testSnapCueTimingFromSilenceIntervals();
    });
    it("snap cue timing no speech keeps original", () => {
        testSnapCueTimingNoSpeechKeepsOriginal();
    });
});
