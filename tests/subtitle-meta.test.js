const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
    scoreCueConfidence,
    annotateCuesConfidence,
    mergeConfidenceAnnotations,
    buildSidecarDocument,
    summarizeLowConfidence,
    cueFingerprint,
    collectOverlappingCueIndices,
    replaceCuesInTimeRange,
} = require('../src/js/subtitle-meta-core');

const {
    metaPathForSubtitle,
    legacyMetaPathForSubtitle,
    readSubtitleMeta,
    writeSubtitleMeta,
} = require('../electron/subtitle-meta');

function assertInProjectTemp(metaPath) {
    const normalized = String(metaPath || '').replace(/\\/g, '/');
    assert.ok(normalized.includes('/temp/'), `expected project temp path, got: ${metaPath}`);
    assert.ok(normalized.endsWith('.transub.json'));
}

function testScoresEmptyAndHighCps() {
    const cues = [
        { startMs: 0, endMs: 1000, text: '' },
        { startMs: 2000, endMs: 2200, text: 'a b c d e f g h i j k l' },
        { startMs: 3000, endMs: 5000, text: 'normal line here' },
    ];
    const scored = annotateCuesConfidence(cues, { maxCps: 8 });
    assert.ok(scored[0].low);
    assert.ok(scored[0].flags.includes('empty'));
    assert.ok(scored[1].low);
    assert.ok(scored[1].flags.includes('high_cps'));
    assert.ok(!scored[2].low || scored[2].confidence > scored[1].confidence);
}

function testConfirmedSidecarOverrides() {
    const cues = [
        { startMs: 0, endMs: 500, text: 'aaaaaaaaaaaa' },
    ];
    const heuristic = annotateCuesConfidence(cues, { maxCps: 5 });
    assert.ok(heuristic[0].low);

    const sidecar = buildSidecarDocument(cues, [{
        confidence: 1,
        flags: ['confirmed'],
        source: 'confirmed',
        confirmed: true,
        fingerprint: cueFingerprint(cues[0]),
    }]);
    const merged = mergeConfidenceAnnotations(cues, sidecar, { maxCps: 5 });
    assert.strictEqual(merged[0].low, false);
    assert.strictEqual(merged[0].source, 'confirmed');
}

function testRepetitionFlag() {
    const cue = { startMs: 0, endMs: 2000, text: '哈哈哈哈哈哈哈哈' };
    const scored = scoreCueConfidence(cue, 0, [cue], {});
    assert.ok(scored.flags.includes('repetition') || scored.low);
}

function testSidecarRoundtrip() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-meta-'));
    const subPath = path.join(dir, 'demo.srt');
    fs.writeFileSync(subPath, '1\n00:00:00,000 --> 00:00:01,000\nhello\n', 'utf8');
    const metaPath = metaPathForSubtitle(subPath);
    assertInProjectTemp(metaPath);
    assert.strictEqual(path.basename(metaPath), 'demo.transub.json');

    const write = writeSubtitleMeta(subPath, {
        version: 1,
        entries: [{ index: 0, startMs: 0, endMs: 1000, text: 'hello', confidence: 0.9, source: 'retranscribe' }],
    });
    assert.ok(write.ok);
    assert.ok(fs.existsSync(write.path));
    assertInProjectTemp(write.path);
    const read = readSubtitleMeta(subPath);
    assert.ok(read.ok);
    assert.ok(read.exists);
    assert.strictEqual(read.meta.entries[0].text, 'hello');

    fs.rmSync(dir, { recursive: true, force: true });
    try {
        if (write.path && fs.existsSync(write.path)) fs.unlinkSync(write.path);
    } catch (_) { /* ignore */ }
}

function testLegacyMetaFallback() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-meta-legacy-'));
    const subPath = path.join(dir, 'legacy.srt');
    fs.writeFileSync(subPath, '1\n00:00:00,000 --> 00:00:01,000\nold\n', 'utf8');
    const legacyPath = legacyMetaPathForSubtitle(subPath);
    fs.writeFileSync(legacyPath, JSON.stringify({
        version: 1,
        entries: [{ index: 0, text: 'from-legacy' }],
    }), 'utf8');

    const read = readSubtitleMeta(subPath);
    assert.ok(read.ok);
    assert.ok(read.exists);
    assert.strictEqual(read.meta.entries[0].text, 'from-legacy');
    assert.strictEqual(path.resolve(read.path), path.resolve(legacyPath));

    fs.rmSync(dir, { recursive: true, force: true });
}

function testSummarize() {
    const summary = summarizeLowConfidence([
        { low: true },
        { low: false },
        { low: true },
    ]);
    assert.strictEqual(summary.low, 2);
    assert.ok(summary.summary.includes('2'));
}

function testReplaceCuesInTimeRange() {
    const cues = [
        { startMs: 0, endMs: 1000, text: 'a' },
        { startMs: 1000, endMs: 3000, text: 'b' },
        { startMs: 3000, endMs: 4000, text: 'c' },
        { startMs: 5000, endMs: 6000, text: 'd' },
    ];
    const overlap = collectOverlappingCueIndices(cues, 1500, 3500);
    assert.deepStrictEqual(overlap, [1, 2]);

    const replaced = replaceCuesInTimeRange(
        cues,
        1500,
        3500,
        [
            { startMs: 1500, endMs: 2500, text: 'new1' },
            { startMs: 2500, endMs: 3500, text: 'new2' },
        ],
    );
    assert.strictEqual(replaced.replaced, 2);
    assert.strictEqual(replaced.cues.length, 4);
    assert.strictEqual(replaced.cues[1].text, 'new1');
    assert.strictEqual(replaced.cues[2].text, 'new2');
    assert.strictEqual(replaced.cues[3].text, 'd');
}

function main() {
    testScoresEmptyAndHighCps();
    testConfirmedSidecarOverrides();
    testRepetitionFlag();
    testSidecarRoundtrip();
    testLegacyMetaFallback();
    testSummarize();
    testReplaceCuesInTimeRange();
    console.log('subtitle-meta.test.js: all passed');
}

main();
