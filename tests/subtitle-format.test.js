const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    parseSubtitle,
    serializeSubtitle,
    detectFormat,
    parseTimeToMs,
    formatTimeMs,
} = require('../electron/subtitle-format');

function testDetectFormat() {
    assert.strictEqual(detectFormat('a.srt', ''), 'srt');
    assert.strictEqual(detectFormat('a.vtt', 'WEBVTT\n\n'), 'vtt');
    assert.strictEqual(detectFormat('a.lrc', '[00:01.00]hi'), 'lrc');
}

function testSrtRoundTrip() {
    const raw = `1
00:00:01,000 --> 00:00:04,000
Hello world

2
00:00:05,500 --> 00:00:08,000
Second line
`;
    const parsed = parseSubtitle(raw, 'srt');
    assert.strictEqual(parsed.format, 'srt');
    assert.strictEqual(parsed.cues.length, 2);
    assert.strictEqual(parsed.cues[0].text, 'Hello world');
    assert.strictEqual(parsed.cues[0].startMs, 1000);
    assert.strictEqual(parsed.cues[1].endMs, 8000);

    const out = serializeSubtitle(parsed);
    const again = parseSubtitle(out, 'srt');
    assert.strictEqual(again.cues.length, 2);
    assert.strictEqual(again.cues[0].text, 'Hello world');
    assert.strictEqual(again.cues[1].text, 'Second line');
}

function testVttRoundTrip() {
    const raw = `WEBVTT

00:00:01.000 --> 00:00:04.000
Line one

00:00:05.000 --> 00:00:07.500
Line two
`;
    const parsed = parseSubtitle(raw, 'vtt');
    assert.strictEqual(parsed.cues.length, 2);
    assert.strictEqual(parsed.cues[0].startMs, 1000);
    const out = serializeSubtitle(parsed);
    assert.ok(out.startsWith('WEBVTT'));
    const again = parseSubtitle(out, 'vtt');
    assert.strictEqual(again.cues[1].text, 'Line two');
}

function testLrcRoundTrip() {
    const raw = `[ti:Test]
[00:12.50]First line
[00:15.00-00:18.30]Second line
`;
    const parsed = parseSubtitle(raw, 'lrc');
    assert.strictEqual(parsed.cues.length, 2);
    assert.strictEqual(parsed.cues[0].startMs, 12500);
    assert.strictEqual(parsed.cues[1].endMs, 18300);
    const out = serializeSubtitle(parsed);
    const again = parseSubtitle(out, 'lrc');
    assert.strictEqual(again.cues.length, 2);
    assert.ok(again.cues[0].text.includes('First'));
}

function testTimeHelpers() {
    assert.strictEqual(parseTimeToMs('00:00:01,500', 'srt'), 1500);
    assert.strictEqual(parseTimeToMs('00:01.500', 'vtt'), 1500);
    assert.strictEqual(parseTimeToMs('01:02.50', 'lrc'), 62500);
    assert.strictEqual(formatTimeMs(1500, 'srt'), '00:00:01,500');
}

function testReadWriteBridge() {
    const { readSubtitleDocument, writeSubtitleDocument } = require('../electron/extensions-bridge');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-sub-'));
    const file = path.join(tmp, 'test.srt');
    const srt = `1
00:00:00,000 --> 00:00:02,000
Test cue
`;
    fs.writeFileSync(file, srt, 'utf8');
    const read = readSubtitleDocument(file);
    assert.strictEqual(read.ok, true);
    assert.strictEqual(read.cues.length, 1);
    read.cues[0].text = 'Updated cue';
    const write = writeSubtitleDocument(file, { format: 'srt', cues: read.cues, createBackup: true });
    assert.strictEqual(write.ok, true);
    assert.ok(fs.existsSync(`${file}.bak`));
    fs.unlinkSync(`${file}.bak`);
    const writeNoBackup = writeSubtitleDocument(file, { format: 'srt', cues: read.cues });
    assert.strictEqual(writeNoBackup.ok, true);
    assert.ok(!fs.existsSync(`${file}.bak`));
    const reread = fs.readFileSync(file, 'utf8');
    assert.ok(reread.includes('Updated cue'));
    fs.rmSync(tmp, { recursive: true, force: true });
}

function testGuessVideoPath() {
    const { guessVideoPathForSubtitle } = require('../electron/subtitle-utils');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-guess-'));
    const video = path.join(tmp, 'clip.mp4');
    const sub = path.join(tmp, 'clip.zh.srt');
    fs.writeFileSync(video, '', 'utf8');
    fs.writeFileSync(sub, '1\n', 'utf8');
    assert.strictEqual(guessVideoPathForSubtitle(sub), video);
    fs.rmSync(tmp, { recursive: true, force: true });
}

function run() {
    testDetectFormat();
    testSrtRoundTrip();
    testVttRoundTrip();
    testLrcRoundTrip();
    testTimeHelpers();
    testReadWriteBridge();
    testGuessVideoPath();
    console.log('subtitle-format tests: OK');
}

run();
