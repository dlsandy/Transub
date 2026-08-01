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
    assert.strictEqual(detectFormat('a.ass', ''), 'ass');
    assert.strictEqual(detectFormat('a.ssa', ''), 'ass');
    assert.strictEqual(detectFormat('a.txt', '[Script Info]\nTitle: x\n'), 'ass');
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
    assert.strictEqual(parseTimeToMs('0:00:01.50', 'ass'), 1500);
    assert.strictEqual(formatTimeMs(1500, 'srt'), '00:00:01,500');
    assert.strictEqual(formatTimeMs(1500, 'ass'), '0:00:01.50');
}

function testAssRoundTrip() {
    const raw = `[Script Info]
Title: Demo
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,40,40,48,1
Style: Source,Arial,40,&H00AAAAAA,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,40,40,112,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,Hello{\\an8} world
Dialogue: 0,0:00:05.00,0:00:08.50,Source,Bob,0,0,0,,Line two\\Nsecond
`;
    const parsed = parseSubtitle(raw, 'ass');
    assert.strictEqual(parsed.format, 'ass');
    assert.strictEqual(parsed.cues.length, 2);
    assert.strictEqual(parsed.cues[0].startMs, 1000);
    assert.strictEqual(parsed.cues[0].endMs, 4000);
    assert.strictEqual(parsed.cues[0].text, 'Hello{\\an8} world');
    assert.strictEqual(parsed.cues[1].text, 'Line two\nsecond');
    assert.strictEqual(parsed.cues[1].ass.style, 'Source');
    assert.strictEqual(parsed.cues[1].ass.name, 'Bob');
    assert.ok(parsed.header.some((l) => /Style: Source/.test(l)));

    const out = serializeSubtitle(parsed);
    assert.ok(out.includes('[Script Info]'));
    assert.ok(out.includes('Style: Source'));
    assert.ok(out.includes('Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,Hello{\\an8} world'));
    assert.ok(out.includes('Line two\\Nsecond'));
    const again = parseSubtitle(out, 'ass');
    assert.strictEqual(again.cues.length, 2);
    assert.strictEqual(again.cues[1].text, 'Line two\nsecond');
    assert.strictEqual(again.cues[1].ass.style, 'Source');
}

function testReadWriteAssBridge() {
    const { readSubtitleDocument, writeSubtitleDocument } = require('../electron/extensions-bridge');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-ass-'));
    const file = path.join(tmp, 'clip.ass');
    const ass = `[Script Info]
Title: Clip
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,40,40,48,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:02.00,Default,,0,0,0,,Test cue
`;
    fs.writeFileSync(file, ass, 'utf8');
    const read = readSubtitleDocument(file);
    assert.strictEqual(read.ok, true, read.error);
    assert.strictEqual(read.format, 'ass');
    assert.strictEqual(read.cues.length, 1);
    read.cues[0].text = 'Updated cue';
    const write = writeSubtitleDocument(file, {
        format: 'ass',
        cues: read.cues,
        header: read.header,
        createBackup: false,
    });
    assert.strictEqual(write.ok, true, write.error);
    const reread = fs.readFileSync(file, 'utf8');
    assert.ok(reread.includes('Updated cue'));
    assert.ok(reread.includes('[V4+ Styles]'));
    fs.rmSync(tmp, { recursive: true, force: true });
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

    const writeBeside = writeSubtitleDocument(file, {
        format: 'srt', cues: read.cues, backupMode: 'beside',
    });
    assert.strictEqual(writeBeside.ok, true);
    assert.strictEqual(writeBeside.backupPath, `${file}.bak`);
    assert.ok(fs.existsSync(`${file}.bak`));
    fs.unlinkSync(`${file}.bak`);

    const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-bak-root-'));
    const prevPortable = process.env.PORTABLE_EXECUTABLE_DIR;
    process.env.PORTABLE_EXECUTABLE_DIR = appRoot;
    try {
        const writeApp = writeSubtitleDocument(file, {
            format: 'srt', cues: read.cues, backupMode: 'appBackup',
        });
        assert.strictEqual(writeApp.ok, true);
        const expected = path.join(appRoot, 'backup', `${path.basename(file)}.bak`);
        assert.strictEqual(writeApp.backupPath, expected);
        assert.ok(fs.existsSync(expected));
        assert.ok(!fs.existsSync(`${file}.bak`));
    } finally {
        if (prevPortable == null) delete process.env.PORTABLE_EXECUTABLE_DIR;
        else process.env.PORTABLE_EXECUTABLE_DIR = prevPortable;
        fs.rmSync(appRoot, { recursive: true, force: true });
    }

    const writeOff = writeSubtitleDocument(file, {
        format: 'srt', cues: read.cues, backupMode: 'off',
    });
    assert.strictEqual(writeOff.ok, true);
    assert.ok(!writeOff.backupPath);
    assert.ok(!fs.existsSync(`${file}.bak`));

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

function testGuessAudioPath() {
    const { guessVideoPathForSubtitle } = require('../electron/subtitle-utils');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-guess-audio-'));
    const audio = path.join(tmp, 'podcast.mp3');
    const sub = path.join(tmp, 'podcast.srt');
    fs.writeFileSync(audio, '', 'utf8');
    fs.writeFileSync(sub, '1\n', 'utf8');
    assert.strictEqual(guessVideoPathForSubtitle(sub), audio);
    fs.rmSync(tmp, { recursive: true, force: true });
}

function testGuessVideoMultiDotStem() {
    const { guessVideoPathForSubtitle, mediaStemCandidatesFromSubtitle } = require('../electron/subtitle-utils');
    assert.deepStrictEqual(
        mediaStemCandidatesFromSubtitle('Show.Name.S01E01.zh'),
        ['Show.Name.S01E01.zh', 'Show.Name.S01E01'],
    );
    assert.deepStrictEqual(
        mediaStemCandidatesFromSubtitle('movie.src'),
        ['movie.src', 'movie'],
    );
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-guess-multidot-'));
    const video = path.join(tmp, 'Show.Name.S01E01.mkv');
    const sub = path.join(tmp, 'Show.Name.S01E01.zh.srt');
    fs.writeFileSync(video, '', 'utf8');
    fs.writeFileSync(sub, '1\n', 'utf8');
    assert.strictEqual(guessVideoPathForSubtitle(sub), video);
    // Exact same basename
    const video2 = path.join(tmp, 'same.mp4');
    const sub2 = path.join(tmp, 'same.srt');
    fs.writeFileSync(video2, '', 'utf8');
    fs.writeFileSync(sub2, '1\n', 'utf8');
    assert.strictEqual(guessVideoPathForSubtitle(sub2), video2);
    fs.rmSync(tmp, { recursive: true, force: true });
}

describe("subtitle-format", () => {
    it("detect format", () => {
        testDetectFormat();
    });
    it("srt round trip", () => {
        testSrtRoundTrip();
    });
    it("vtt round trip", () => {
        testVttRoundTrip();
    });
    it("lrc round trip", () => {
        testLrcRoundTrip();
    });
    it("ass round trip", () => {
        testAssRoundTrip();
    });
    it("time helpers", () => {
        testTimeHelpers();
    });
    it("read write bridge", () => {
        testReadWriteBridge();
    });
    it("read write ass bridge", () => {
        testReadWriteAssBridge();
    });
    it("guess video path", () => {
        testGuessVideoPath();
    });
    it("guess audio path", () => {
        testGuessAudioPath();
    });
    it("guess video multi-dot stem", () => {
        testGuessVideoMultiDotStem();
    });
});
