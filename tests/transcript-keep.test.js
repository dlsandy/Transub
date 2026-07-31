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
    it('defaults keepTranscript on and preserves custom dir/limit/days', () => {
        const merged = mergeTransWithAiOptions({});
        assert.strictEqual(merged.keepTranscript, true);
        assert.strictEqual(merged.transcriptKeepLimit, 200);
        assert.strictEqual(merged.transcriptKeepDays, 90);

        const normalized = buildTransWithAiOptionsFromPayload({
            keepTranscript: false,
            transcriptKeepDir: 'D:\\subs',
            transcriptKeepLimit: 12,
            transcriptKeepDays: 7,
        }, {});
        assert.strictEqual(normalized.keepTranscript, false);
        assert.strictEqual(normalized.transcriptKeepDir, 'D:\\subs');
        assert.strictEqual(normalized.transcriptKeepLimit, 12);
        assert.strictEqual(normalized.transcriptKeepDays, 7);
    });

    it('copies transcript files and prunes by limit', () => {
        const dir = makeTempDir('transub-keep-');
        const srcDir = makeTempDir('transub-src-');
        try {
            const src = path.join(srcDir, 'movie.ja.srt');
            fs.writeFileSync(src, '1\n00:00:00,000 --> 00:00:01,000\nhello\n', 'utf8');
            const kept = keepTranscriptFiles([src], {
                keepTranscript: true,
                transcriptKeepDir: dir,
                transcriptKeepLimit: 1,
                transcriptKeepDays: 0,
            });
            assert.strictEqual(kept.ok, true);
            assert.strictEqual(kept.kept.length, 1);
            assert.ok(fs.existsSync(path.join(dir, 'movie.ja.srt')));

            const src2 = path.join(srcDir, 'other.ja.srt');
            fs.writeFileSync(src2, '1\n00:00:00,000 --> 00:00:01,000\nworld\n', 'utf8');
            // Age the first file so it is pruned as older.
            const first = path.join(dir, 'movie.ja.srt');
            const old = new Date(Date.now() - 60_000);
            fs.utimesSync(first, old, old);

            const kept2 = keepTranscriptFiles([src2], {
                keepTranscript: true,
                transcriptKeepDir: dir,
                transcriptKeepLimit: 1,
                transcriptKeepDays: 0,
            });
            assert.strictEqual(kept2.ok, true);
            assert.ok(fs.existsSync(path.join(dir, 'other.ja.srt')));
            assert.strictEqual(fs.existsSync(first), false);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
            fs.rmSync(srcDir, { recursive: true, force: true });
        }
    });

    it('prunes by days and clear removes all', () => {
        const dir = makeTempDir('transub-keep-days-');
        try {
            const a = path.join(dir, 'a.srt');
            const b = path.join(dir, 'b.srt');
            fs.writeFileSync(a, 'a', 'utf8');
            fs.writeFileSync(b, 'b', 'utf8');
            const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
            fs.utimesSync(a, old, old);

            const pruned = pruneTranscriptKeepDir(dir, {
                transcriptKeepLimit: 0,
                transcriptKeepDays: 3,
            });
            assert.ok(pruned.removed >= 1);
            assert.strictEqual(fs.existsSync(a), false);
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

    it('skips when keepTranscript is false', () => {
        const dir = makeTempDir('transub-keep-off-');
        const srcDir = makeTempDir('transub-src-off-');
        try {
            const src = path.join(srcDir, 'movie.srt');
            fs.writeFileSync(src, 'x', 'utf8');
            const kept = keepTranscriptFiles([src], {
                keepTranscript: false,
                transcriptKeepDir: dir,
            });
            assert.strictEqual(kept.skipped, true);
            assert.strictEqual(fs.readdirSync(dir).length, 0);
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
            const dest = path.join(dir, 'clip.src.srt');
            assert.ok(fs.existsSync(dest));
            const body = fs.readFileSync(dest, 'utf8');
            assert.ok(body.includes('hello'));
            assert.ok(body.includes('world'));
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});
