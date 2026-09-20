const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    keepTranscriptFiles,
    pruneTranscriptKeepDir,
    clearTranscriptKeepDir,
    resolveTranscriptSourcePaths,
    normalizeTranscriptKeepOptions,
} = require('../electron/transcript-keep');
const { buildTransWithAiOptionsFromPayload } = require('../electron/transwithai-bridge');
const { mergeTransWithAiOptions } = require('../electron/transwithai-options');

function makeTempDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('transcript keep', () => {
    it('defaults keepTranscript on with unlimited retention', () => {
        const merged = mergeTransWithAiOptions({});
        assert.strictEqual(merged.keepTranscript, true);
        assert.strictEqual(merged.transcriptKeepLimit, 0);
        assert.strictEqual(merged.transcriptKeepDays, 0);

        const normalized = buildTransWithAiOptionsFromPayload({
            keepTranscript: false,
            transcriptKeepDir: 'D:\\subs',
            transcriptKeepLimit: 12,
            transcriptKeepDays: 7,
        }, {});
        assert.strictEqual(normalized.keepTranscript, true);
        assert.strictEqual(normalized.transcriptKeepDir, 'D:\\subs');
        assert.strictEqual(normalized.transcriptKeepLimit, 0);
        assert.strictEqual(normalized.transcriptKeepDays, 0);
    });

    it('copies transcript files without pruning by limit', () => {
        const dir = makeTempDir('transub-keep-');
        const srcDir = makeTempDir('transub-src-');
        try {
            const src = path.join(srcDir, 'movie.ja.srt');
            fs.writeFileSync(src, '1\n00:00:00,000 --> 00:00:01,000\nhello\n', 'utf8');
            const kept = keepTranscriptFiles([src], {
                transcriptKeepDir: dir,
            });
            assert.strictEqual(kept.ok, true);
            assert.strictEqual(kept.kept.length, 1);
            assert.ok(fs.existsSync(path.join(dir, 'movie.transcribe.srt')));

            const src2 = path.join(srcDir, 'other.ja.srt');
            fs.writeFileSync(src2, '1\n00:00:00,000 --> 00:00:01,000\nworld\n', 'utf8');
            const first = path.join(dir, 'movie.transcribe.srt');
            const old = new Date(Date.now() - 60_000);
            fs.utimesSync(first, old, old);

            const kept2 = keepTranscriptFiles([src2], {
                transcriptKeepDir: dir,
                transcriptKeepLimit: 1,
            });
            assert.strictEqual(kept2.ok, true);
            assert.ok(fs.existsSync(path.join(dir, 'other.transcribe.srt')));
            assert.strictEqual(fs.existsSync(first), true);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
            fs.rmSync(srcDir, { recursive: true, force: true });
        }
    });

    it('does not prune by days; clear still removes cache files', () => {
        const dir = makeTempDir('transub-keep-days-');
        try {
            const a = path.join(dir, 'a.srt');
            const b = path.join(dir, 'b.srt');
            fs.writeFileSync(a, 'a', 'utf8');
            fs.writeFileSync(b, 'b', 'utf8');
            const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
            fs.utimesSync(a, old, old);

            const pruned = pruneTranscriptKeepDir(dir, {
                transcriptKeepLimit: 1,
                transcriptKeepDays: 3,
            });
            assert.strictEqual(pruned.removed, 0);
            assert.ok(fs.existsSync(a));
            assert.ok(fs.existsSync(b));

            const cleared = clearTranscriptKeepDir({ transcriptKeepDir: dir });
            assert.strictEqual(cleared.ok, true);
            assert.strictEqual(fs.existsSync(b), false);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('resolveTranscriptSourcePaths prefers source tracks', () => {
        assert.deepStrictEqual(
            resolveTranscriptSourcePaths({
                task: 'dual',
                sourceSubtitlePath: 'C:/a.ja.srt',
                subtitlePath: 'C:/a.zh.srt',
            }),
            ['C:/a.ja.srt'],
        );
        assert.deepStrictEqual(
            resolveTranscriptSourcePaths({
                task: 'transcribe',
                subtitlePath: 'C:/a.srt',
            }),
            ['C:/a.srt'],
        );
        assert.deepStrictEqual(
            resolveTranscriptSourcePaths({
                task: 'translate',
                subtitlePath: 'C:/a.zh.srt',
            }),
            [],
        );
        assert.strictEqual(normalizeTranscriptKeepOptions({}).keepTranscript, true);
    });

    it('still keeps when legacy keepTranscript false is passed', () => {
        const dir = makeTempDir('transub-keep-off-');
        const srcDir = makeTempDir('transub-src-off-');
        try {
            const src = path.join(srcDir, 'movie.srt');
            fs.writeFileSync(src, '1\n00:00:00,000 --> 00:00:01,000\nhello\n', 'utf8');
            const kept = keepTranscriptFiles([src], {
                keepTranscript: false,
                transcriptKeepDir: dir,
            });
            assert.strictEqual(kept.ok, true);
            assert.ok(kept.kept.length >= 1);
            assert.ok(fs.existsSync(path.join(dir, 'movie.transcribe.srt')));
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
            fs.rmSync(srcDir, { recursive: true, force: true });
        }
    });

    it('materializes translate_mt source cues into keep dir', () => {
        const dir = makeTempDir('transub-keep-cues-');
        try {
            const {
                keepTranscriptFromJobResult,
                engineCuesToKeepCues,
            } = require('../electron/transcript-keep');
            const cues = engineCuesToKeepCues([
                { start: 0, end: 1.5, text: 'こんにちは' },
                { start: 2, end: 3, text: '世界' },
            ]);
            assert.strictEqual(cues.length, 2);
            assert.strictEqual(cues[0].startMs, 0);
            assert.strictEqual(cues[0].endMs, 1500);

            // translate with only zh path → empty file list, must use cues
            const kept = keepTranscriptFromJobResult({
                task: 'translate',
                subtitlePath: 'C:/media/clip.zh.srt',
                sourceCues: [
                    { start: 0, end: 1, text: 'hello' },
                    { start: 1.5, end: 2.5, text: 'world' },
                ],
                mediaPath: 'C:/media/clip.mp4',
                options: {
                    keepTranscript: true,
                    transcriptKeepDir: dir,
                    transcriptKeepLimit: 50,
                    transcriptKeepDays: 0,
                },
            });
            assert.strictEqual(kept.ok, true);
            assert.strictEqual(kept.kept.length, 1);
            const dest = path.join(dir, 'clip.transcribe.srt');
            assert.ok(fs.existsSync(dest));
            const body = fs.readFileSync(dest, 'utf8');
            assert.ok(body.includes('hello'));
            assert.ok(body.includes('world'));
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('borrows timeline from target subtitle file on disk', () => {
        const dir = makeTempDir('transub-keep-zhfile-');
        const outDir = makeTempDir('transub-keep-out-');
        try {
            const { keepTranscriptFromJobResult } = require('../electron/transcript-keep');
            const zhPath = path.join(outDir, 'clip.srt');
            fs.writeFileSync(zhPath, [
                '1',
                '00:00:05,000 --> 00:00:07,500',
                '译文一',
                '',
                '2',
                '00:00:08,000 --> 00:00:10,000',
                '译文二',
                '',
            ].join('\n'), 'utf8');

            const kept = keepTranscriptFromJobResult({
                task: 'translate',
                sourceCues: [
                    { start: 0, end: 0.5, text: '原文一' },
                    { start: 0, end: 0.5, text: '原文二' },
                ],
                targetSubtitlePath: zhPath,
                mediaPath: path.join(outDir, 'clip.mp4'),
                options: {
                    keepTranscript: true,
                    transcriptKeepDir: dir,
                    transcriptKeepLimit: 50,
                    transcriptKeepDays: 0,
                },
            });
            assert.strictEqual(kept.ok, true);
            const body = fs.readFileSync(path.join(dir, 'clip.transcribe.srt'), 'utf8');
            assert.ok(body.includes('00:00:05,000 --> 00:00:07,500'));
            assert.ok(body.includes('原文一'));
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
            fs.rmSync(outDir, { recursive: true, force: true });
        }
    });

    it('prefers on-disk ZH timing over broken in-memory zhCues', () => {
        const dir = makeTempDir('transub-keep-zhpref-');
        const outDir = makeTempDir('transub-keep-zhpref-out-');
        try {
            const {
                keepTranscriptFromJobResult,
                refreshKeptTranscriptTimings,
            } = require('../electron/transcript-keep');
            const zhPath = path.join(outDir, 'clip.srt');
            fs.writeFileSync(zhPath, [
                '1',
                '00:00:05,000 --> 00:00:07,500',
                '译文一',
                '',
                '2',
                '00:00:08,000 --> 00:00:10,000',
                '译文二',
                '',
            ].join('\n'), 'utf8');
            const brokenMemZh = [
                { start: 0, end: 0.5, text: 'bad1' },
                { start: 0, end: 0.5, text: 'bad2' },
            ];
            const kept = keepTranscriptFromJobResult({
                task: 'translate',
                sourceCues: [
                    { start: 0, end: 0.5, text: '原文一' },
                    { start: 0, end: 0.5, text: '原文二' },
                ],
                zhCues: brokenMemZh,
                targetSubtitlePath: zhPath,
                subtitlePath: zhPath,
                mediaPath: path.join(outDir, 'clip.mp4'),
                options: {
                    keepTranscript: true,
                    transcriptKeepDir: dir,
                    transcriptKeepLimit: 50,
                    transcriptKeepDays: 0,
                },
            });
            assert.strictEqual(kept.ok, true);
            const body = fs.readFileSync(path.join(dir, 'clip.transcribe.srt'), 'utf8');
            assert.ok(body.includes('00:00:05,000 --> 00:00:07,500'));

            const brokenKeep = path.join(dir, 'clip2.transcribe.srt');
            fs.writeFileSync(brokenKeep, [
                '1',
                '00:00:00,000 --> 00:00:00,500',
                '原文A',
                '',
            ].join('\n'), 'utf8');
            const refreshed = refreshKeptTranscriptTimings(brokenKeep, {
                targetSubtitlePath: zhPath,
                subtitlePath: zhPath,
            });
            assert.strictEqual(refreshed.refreshed, true);
            const body2 = fs.readFileSync(brokenKeep, 'utf8');
            assert.ok(body2.includes('00:00:05,000 --> 00:00:07,500'));
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
            fs.rmSync(outDir, { recursive: true, force: true });
        }
    });

    it('borrows timeline from zh cues when source cues lack valid timing', () => {
        const dir = makeTempDir('transub-keep-timing-');
        try {
            const {
                keepTranscriptFromJobResult,
                cuesLackValidTiming,
                borrowTimingOntoSourceCues,
            } = require('../electron/transcript-keep');
            const broken = [
                { start: 0, end: 0.5, text: '今日も全然、悪気やしない' },
                { start: 0, end: 0.5, text: '量が多いのか…' },
                { start: 0, end: 0.5, text: '俺の効率が悪いのか…' },
            ];
            assert.strictEqual(cuesLackValidTiming(broken), true);
            const ref = [
                { start: 19.84, end: 24.544, text: 'zh1' },
                { start: 25.136, end: 26.624, text: 'zh2' },
                { start: 27.504, end: 29.104, text: 'zh3' },
            ];
            const fixed = borrowTimingOntoSourceCues(broken, ref);
            assert.strictEqual(fixed[0].startMs, 19840);
            assert.strictEqual(fixed[0].endMs, 24544);
            assert.strictEqual(fixed[1].startMs, 25136);

            const kept = keepTranscriptFromJobResult({
                task: 'translate',
                sourceCues: broken,
                zhCues: ref,
                mediaPath: 'C:/media/ADN-799.mp4',
                options: {
                    keepTranscript: true,
                    transcriptKeepDir: dir,
                    transcriptKeepLimit: 50,
                    transcriptKeepDays: 0,
                },
            });
            assert.strictEqual(kept.ok, true);
            const body = fs.readFileSync(path.join(dir, 'ADN-799.transcribe.srt'), 'utf8');
            assert.ok(body.includes('00:00:19,840 --> 00:00:24,544'));
            assert.ok(body.includes('今日も全然、悪気やしない'));
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('heals collapsed transcribe timing from sibling .original by text match', () => {
        const dir = makeTempDir('transub-keep-pred-heal-');
        try {
            const {
                enrichSourceCuesWithTiming,
                cuesHaveBrokenTimeline,
                borrowTimingByTextMatch,
            } = require('../electron/transcript-keep');
            const original = [
                { startMs: 14176, endMs: 17000, text: '今日は、やらしい姿と' },
                { startMs: 17632, endMs: 22000, text: 'やらしい格好のあたしをいっぱい見てほしいな' },
                { startMs: 79280, endMs: 81000, text: 'んっ…' },
                { startMs: 344464, endMs: 348000, text: 'ああ、だめ…あいちゃ…あい…' },
                { startMs: 388680, endMs: 392000, text: 'あ、いくいくいくいくいくいく…' },
            ];
            const collapsed = [
                { start: 0, end: 0.5, text: '今日は、やらしい姿と' },
                { start: 0, end: 0.5, text: 'やらしい格好のあたしをいっぱい見てほしいな' },
                { start: 0, end: 0.5, text: 'ああ、だめ…あいちゃ…あい…' },
                { start: 0, end: 0.5, text: 'あ、いくいくいくいくいくいく…' },
            ];
            assert.strictEqual(cuesHaveBrokenTimeline(collapsed), true);
            const byText = borrowTimingByTextMatch(collapsed, original);
            assert.strictEqual(byText[0].startMs, 14176);
            assert.strictEqual(byText[2].startMs, 344464);
            assert.strictEqual(byText[3].startMs, 388680);

            const origPath = path.join(dir, 'PRED-890.original.srt');
            const { serializeSubtitle } = require('../electron/subtitle-format');
            fs.writeFileSync(origPath, serializeSubtitle({
                format: 'srt',
                cues: original.map((c, i) => ({ index: i + 1, ...c })),
            }), 'utf8');
            const healed = enrichSourceCuesWithTiming(collapsed, {
                subtitlePath: path.join(dir, 'PRED-890.transcribe.srt'),
                outputDir: dir,
                mediaPath: 'C:/media/PRED-890.mp4',
            });
            assert.strictEqual(cuesHaveBrokenTimeline(healed), false);
            assert.strictEqual(healed[0].startMs, 14176);
            assert.ok(healed[3].startMs > 300000);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('restores mass t≈0 pile from healthy snapshot (NIMA-083 guard)', () => {
        const {
            cuesHaveMassZeroStartPile,
            snapshotHealthyCueTimings,
            restoreCueTimingsFromSnapshot,
            countZeroShortCues,
        } = require('../electron/transcript-keep');
        const healthy = [];
        for (let i = 0; i < 40; i += 1) {
            healthy.push({
                startMs: 30000 + i * 2000,
                endMs: 30000 + i * 2000 + 1500,
                text: `对白${i}`,
            });
        }
        const snap = snapshotHealthyCueTimings(healthy);
        assert.ok(snap.length >= 40);
        const broken = [
            { startMs: 0, endMs: 500, text: '等一下' },
            ...Array.from({ length: 20 }, (_, i) => ({
                startMs: 0,
                endMs: 500,
                text: `尾部${i}`,
            })),
            ...healthy.slice(5).map((c) => ({ ...c })),
        ];
        assert.strictEqual(cuesHaveMassZeroStartPile(broken), true);
        assert.ok(countZeroShortCues(broken) >= 8);
        const restored = restoreCueTimingsFromSnapshot(broken, snap);
        assert.strictEqual(restored.changed, true);
        assert.strictEqual(restored.mode, 'snapshot_replace');
        assert.strictEqual(cuesHaveMassZeroStartPile(restored.cues), false);
        assert.strictEqual(restored.cues[0].startMs, 30000);
    });

    it('detects stolen head dialogue at t≈0 (NAAC-style credit collapse)', () => {
        const {
            cuesHaveStolenHeadDialogue,
            cuesHaveBrokenHeadTimeline,
            restoreCueTimingsFromSnapshot,
            snapshotHealthyCueTimings,
        } = require('../electron/transcript-keep');
        const credit = '字幕は Transub Pro で生成されました [ www.transub.cc ]';
        const healthy = [
            { startMs: 13344, endMs: 15472, text: 'お、祐佳です' },
            { startMs: 16192, endMs: 18160, text: 'と、3本目になります' },
            { startMs: 21424, endMs: 28000, text: '今までがいろいろな衣装に着替えて自由にポーズを取る感じでした' },
        ];
        for (let i = 0; i < 30; i += 1) {
            healthy.push({
                startMs: 30000 + i * 2000,
                endMs: 30000 + i * 2000 + 1500,
                text: `対白${i}`,
            });
        }
        healthy.push({
            startMs: 7843724,
            endMs: 7850000,
            text: 'これからも応援よろしくお願いしまーす',
        });
        healthy.push({
            startMs: 7852624,
            endMs: 7854000,
            text: 'ばいばーい',
        });
        const snap = snapshotHealthyCueTimings(healthy);
        const broken = [
            { startMs: 0, endMs: 500, text: credit },
            { startMs: 0, endMs: 500, text: 'これからも応援よろしくお願いしまーす' },
            { startMs: 0, endMs: 2000, text: 'お、祐佳です' },
            { startMs: 0, endMs: 3000, text: 'ばいばーい' },
            { startMs: 13344, endMs: 15472, text: 'と、3本目になります' },
            ...healthy.slice(2, -2).map((c) => ({ ...c })),
        ];
        assert.strictEqual(cuesHaveStolenHeadDialogue(broken), true);
        assert.strictEqual(cuesHaveBrokenHeadTimeline(broken), true);
        const restored = restoreCueTimingsFromSnapshot(broken, snap);
        assert.strictEqual(restored.changed, true);
        assert.strictEqual(restored.mode, 'snapshot_replace');
        assert.ok(restored.cues[0].startMs >= 13000);
        assert.ok(!cuesHaveStolenHeadDialogue(restored.cues));
    });

    it('detects head content divergence from engine snapshot (off-by-one without t≈0)', () => {
        const {
            cuesHeadDivergesFromSnapshot,
            restoreCueTimingsFromSnapshot,
        } = require('../electron/transcript-keep');
        const snap = [
            { startMs: 13344, endMs: 15472, text: 'お、祐佳です' },
            { startMs: 16192, endMs: 18160, text: 'と、3本目になります' },
            { startMs: 21424, endMs: 28000, text: '今までがいろいろな衣装に着替えて自由にポーズを取る感じでした' },
            { startMs: 30736, endMs: 35736, text: '制服でもあの着るのが実はすごい好きで' },
            { startMs: 39129, endMs: 42000, text: '映像で初めて着れて今日は嬉しいです' },
            { startMs: 43680, endMs: 48680, text: '今日は初めてのその着る衣装がたくさんあって…' },
        ];
        for (let i = 0; i < 40; i += 1) {
            snap.push({
                startMs: 60000 + i * 2000,
                endMs: 60000 + i * 2000 + 1500,
                text: `対白${i}`,
            });
        }
        const shifted = [
            { startMs: 0, endMs: 500, text: '字幕は Transub Pro で生成されました [ www.transub.cc ]' },
            { startMs: 13344, endMs: 15472, text: 'と、3本目になります' },
            { startMs: 16192, endMs: 18160, text: '今までがいろいろな衣装に着替えて自由にポーズを取る感じでした' },
            { startMs: 21424, endMs: 28000, text: '制服でもあの着るのが実はすごい好きで' },
            { startMs: 30736, endMs: 35736, text: '映像で初めて着れて今日は嬉しいです' },
            { startMs: 39129, endMs: 42000, text: '今日は初めてのその着る衣装がたくさんあって…' },
            { startMs: 43680, endMs: 48680, text: 'とてもお楽しみにしてます。' },
            ...snap.slice(6).map((c) => ({ ...c })),
        ];
        assert.strictEqual(cuesHeadDivergesFromSnapshot(shifted, snap), true);
        const restored = restoreCueTimingsFromSnapshot(shifted, snap);
        assert.strictEqual(restored.changed, true);
        assert.ok(restored.cues.some((c) => /祐佳です/.test(c.text)));
    });

    it('does not prune or clear .original files in the keep dir', () => {
        const dir = makeTempDir('transub-keep-original-');
        try {
            const {
                pruneTranscriptKeepDir,
                clearTranscriptKeepDir,
            } = require('../electron/transcript-keep');
            const tr = path.join(dir, 'clip.transcribe.srt');
            const orig = path.join(dir, 'clip.original.srt');
            fs.writeFileSync(tr, 't', 'utf8');
            fs.writeFileSync(orig, 'o', 'utf8');
            const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
            fs.utimesSync(tr, old, old);
            fs.utimesSync(orig, old, old);
            pruneTranscriptKeepDir(dir, {
                transcriptKeepLimit: 0,
                transcriptKeepDays: 3,
            });
            // Unlimited retention: age/count prune is a no-op.
            assert.ok(fs.existsSync(tr));
            assert.ok(fs.existsSync(orig));
            const cleared = clearTranscriptKeepDir({ transcriptKeepDir: dir });
            assert.strictEqual(cleared.ok, true);
            assert.strictEqual(fs.existsSync(tr), false);
            assert.ok(fs.existsSync(orig));
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('detects QC-packed 500ms sequential timelines (MFYD-185 fingerprint)', () => {
        const { cuesLookQcPacked, cuesHaveBrokenTimeline, cuesLackValidTiming } = require('../electron/transcript-keep');
        const packed = [];
        for (let i = 0; i < 40; i += 1) {
            packed.push({
                startMs: i * 501,
                endMs: i * 501 + 500,
                text: `line-${i}`,
            });
        }
        assert.strictEqual(cuesLookQcPacked(packed), true);
        assert.strictEqual(cuesHaveBrokenTimeline(packed), true);
        assert.strictEqual(cuesLackValidTiming(packed), false);

        const real = [
            { startMs: 31856, endMs: 35264, text: 'a' },
            { startMs: 36832, endMs: 39648, text: 'b' },
            { startMs: 40880, endMs: 41616, text: 'c' },
        ];
        assert.strictEqual(cuesLookQcPacked(real), false);
        assert.strictEqual(cuesHaveBrokenTimeline(real), false);
    });
});
