const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const compare = require('../src/js/transcript-compare-core');
const markers = require('../src/js/editor-markers-core');
const checklist = require('../src/js/export-checklist-core');

describe('transcript-compare-core', () => {
    it('diffs missing / changed / only-current cues', () => {
        const current = [
            { startMs: 0, endMs: 1000, text: '你好' },
            { startMs: 2000, endMs: 3000, text: '世界改了' },
            { startMs: 9000, endMs: 10000, text: '仅当前' },
        ];
        const original = [
            { startMs: 0, endMs: 1000, text: '你好' },
            { startMs: 2000, endMs: 3000, text: '世界' },
            { startMs: 3500, endMs: 4500, text: '被删了' },
        ];
        const diff = compare.diffAgainstOriginal(current, original, { maxStartGapMs: 200 });
        assert.strictEqual(diff.stats.textChanged, 1);
        assert.strictEqual(diff.stats.missing, 1);
        assert.ok(diff.stats.onlyCurrent >= 1);
        assert.ok(compare.summarizeDiff(diff).includes('原文多'));
    });

    it('restores missing cues in a time range', () => {
        const current = [
            { startMs: 0, endMs: 1000, text: 'a' },
        ];
        const original = [
            { startMs: 0, endMs: 1000, text: 'a' },
            { startMs: 1500, endMs: 2500, text: 'restored' },
        ];
        const res = compare.restoreRangeFromOriginal(current, original, 1000, 3000);
        assert.strictEqual(res.inserted, 1);
        assert.strictEqual(res.cues.length, 2);
        assert.ok(res.cues.some((c) => c.text === 'restored'));
    });

    it('attaches sourceText from original', () => {
        const cues = [{ index: 0, startMs: 100, endMs: 900, text: '译' }];
        const original = [{ startMs: 0, endMs: 1000, text: '原文' }];
        const attached = compare.attachSourceText(cues, original);
        assert.strictEqual(attached[0].sourceText, '原文');
    });
});

describe('editor-markers-core', () => {
    it('manages bookmarks and A-B loop', () => {
        let doc = markers.emptyMarkersDoc();
        const up = markers.upsertBookmark(doc, 1200, '开场');
        doc = up.doc;
        assert.strictEqual(doc.bookmarks.length, 1);
        doc = markers.setAbLoop(doc, 1000, 5000, true);
        assert.strictEqual(doc.abLoop.aMs, 1000);
        assert.strictEqual(markers.abLoopSeekTarget(doc.abLoop, 5000, 4990), 1000);
        assert.strictEqual(markers.abLoopSeekTarget(doc.abLoop, 2000, 1900), null);
    });

    it('removes bookmarks covering selected cues', () => {
        let doc = markers.emptyMarkersDoc();
        doc = markers.upsertBookmark(doc, 500, 'a').doc;
        doc = markers.upsertBookmark(doc, 2500, 'b').doc;
        const cues = [
            { startMs: 0, endMs: 1000, text: 'one' },
            { startMs: 2000, endMs: 3000, text: 'two' },
        ];
        const covering = markers.bookmarksCoveringIndexes(cues, doc, [0], { padMs: 0 });
        assert.strictEqual(covering.length, 1);
        assert.strictEqual(covering[0].timeMs, 500);
        const removed = markers.removeBookmarksCoveringIndexes(cues, doc, [0], { padMs: 0 });
        assert.strictEqual(removed.removed, 1);
        assert.strictEqual(removed.doc.bookmarks.length, 1);
        assert.strictEqual(removed.doc.bookmarks[0].timeMs, 2500);
    });

    it('tracks speakers and review status', () => {
        let doc = markers.emptyMarkersDoc();
        const sp = markers.ensureSpeaker(doc, '男主');
        doc = sp.doc;
        const key = markers.cueMarkerKey({ startMs: 100 }, 0);
        doc = markers.setCueMarker(doc, key, {
            speakerId: sp.speaker.id,
            reviewStatus: 'edited',
        });
        assert.strictEqual(markers.getCueMarker(doc, key).reviewStatus, 'edited');
        assert.deepStrictEqual(
            markers.filterIndexesBySpeaker([{ startMs: 100 }], doc, sp.speaker.id),
            [0],
        );
        const renamed = markers.renameSpeaker(doc, sp.speaker.id, '主角');
        doc = renamed.doc;
        assert.strictEqual(renamed.speaker.name, '主角');
        assert.strictEqual(markers.getCueMarker(doc, key).speakerId, sp.speaker.id);
        const clash = markers.renameSpeaker(doc, sp.speaker.id, '主角');
        assert.ok(clash.unchanged);
        markers.ensureSpeaker(doc, '女主');
        doc = markers.ensureSpeaker(doc, '女主').doc;
        const bad = markers.renameSpeaker(doc, sp.speaker.id, '女主');
        assert.ok(!bad.speaker);
        assert.ok(bad.error);
        doc = markers.upsertBookmark(doc, 150, '点').doc;
        assert.deepStrictEqual(
            markers.filterIndexesByBookmarks(
                [{ startMs: 100, endMs: 200, text: 'a' }, { startMs: 500, endMs: 600, text: 'b' }],
                doc,
            ),
            [0],
        );
    });
});

describe('export-checklist-core', () => {
    it('flags empty and overlap', () => {
        const report = checklist.buildExportChecklist({
            cues: [
                { startMs: 0, endMs: 1000, text: '' },
                { startMs: 800, endMs: 1800, text: 'hi' },
            ],
            hasVideo: false,
            lowConfCount: 2,
        });
        assert.ok(report.warnCount >= 1);
        assert.ok(report.items.some((i) => i.id === 'empty' && i.count === 1));
        assert.ok(report.items.some((i) => i.id === 'overlap' && i.count >= 1));
    });

    it('summarizes review and bookmarks across all cues (no speaker checklist)', () => {
        const report = checklist.buildExportChecklist({
            cues: [
                { startMs: 0, endMs: 1000, text: 'a' },
                { startMs: 1100, endMs: 2000, text: 'b' },
                { startMs: 2100, endMs: 3000, text: 'c' },
            ],
            hasVideo: true,
            markersDoc: {
                version: 1,
                bookmarks: [{ id: 'bm1', timeMs: 500, label: '' }],
                speakers: [{ id: 'spk_1', name: 'A' }],
                cueMarkers: {
                    '0:0': { reviewStatus: 'approved', speakerId: 'spk_1' },
                    '1:1100': { reviewStatus: 'edited' },
                },
            },
        });
        const review = report.items.find((i) => i.id === 'review');
        assert.ok(review);
        assert.strictEqual(review.count, 2); // edited + unseen
        assert.match(review.detail, /通过 1/);
        assert.match(review.detail, /未看 1/);
        assert.ok(report.items.some((i) => i.id === 'bookmarks' && i.count === 1));
        assert.ok(!report.items.some((i) => i.id === 'speakers'));
    });

    it('adds Pro extras for semantic review and ASS', () => {
        const report = checklist.buildExportChecklist({
            cues: [
                { startMs: 0, endMs: 1000, text: 'a' },
                { startMs: 1100, endMs: 2000, text: 'b' },
            ],
            hasDualPair: true,
            proExtras: true,
            assExportAvailable: true,
            hasAssDualPair: true,
            lastSemanticReview: {
                ok: true,
                issues: [{ index: 0, type: 'omission', message: '漏译' }],
                summary: '1 处问题',
            },
            markersDoc: {
                speakers: [{ id: 'spk_1', name: 'A' }],
                cueMarkers: {
                    '0:0': { reviewStatus: 'unseen' },
                    '1:1100': { reviewStatus: 'unseen' },
                },
            },
        });
        const review = report.items.find((i) => i.id === 'review');
        assert.strictEqual(review.severity, 'warn');
        const sem = report.items.find((i) => i.id === 'semantic_review');
        assert.ok(sem);
        assert.strictEqual(sem.severity, 'warn');
        assert.strictEqual(sem.count, 1);
        assert.ok(report.items.some((i) => i.id === 'ass_styles'));
        assert.ok(report.items.some((i) => i.id === 'ass_dual'));
        assert.ok(!report.items.some((i) => i.id === 'speakers'));
    });
});

describe('transcript-keep find + pin', () => {
    it('finds kept transcript by stem and respects soft pin', () => {
        const keep = require('../electron/transcript-keep');
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-keep-'));
        const file = path.join(dir, 'movie.src.srt');
        fs.writeFileSync(file, '1\n00:00:00,000 --> 00:00:01,000\nhello\n', 'utf8');
        const found = keep.findKeptTranscript({
            stem: 'movie',
            options: { transcriptKeepDir: dir, transcriptKeepDays: 90 },
        });
        assert.strictEqual(found.found, true);
        assert.strictEqual(path.resolve(found.path), path.resolve(file));

        keep.pinKeptTranscript(file, { hard: false });
        // Age the file beyond keep days
        const old = Date.now() - 100 * 24 * 60 * 60 * 1000;
        fs.utimesSync(file, new Date(old), new Date(old));
        const pruned = keep.pruneTranscriptKeepDir(dir, {
            transcriptKeepDir: dir,
            transcriptKeepDays: 90,
            transcriptKeepLimit: 200,
        });
        assert.ok(pruned.skippedPinned >= 1);
        assert.ok(fs.existsSync(file));
        keep.unpinKeptTranscript(file, { hard: false });
        try {
            fs.rmSync(dir, { recursive: true, force: true });
        } catch { /* ignore */ }
    });

    it('matches subtitles by video basename only (same-name), prefers .src over fuzzy', () => {
        const keep = require('../electron/transcript-keep');
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-keep-same-'));
        try {
            const src = path.join(dir, 'SQTE-704.src.srt');
            const zh = path.join(dir, 'SQTE-704.zh.srt');
            const other = path.join(dir, 'prefix-SQTE-704-extra.srt');
            fs.writeFileSync(src, '1\n00:00:00,000 --> 00:00:01,000\nja\n', 'utf8');
            fs.writeFileSync(zh, '1\n00:00:00,000 --> 00:00:01,000\nzh\n', 'utf8');
            fs.writeFileSync(other, '1\n00:00:00,000 --> 00:00:01,000\nx\n', 'utf8');

            const found = keep.findKeptTranscript({
                videoPath: 'D:\\media\\SQTE-704.mp4',
                options: { transcriptKeepDir: dir, transcriptKeepDays: 90 },
            });
            assert.strictEqual(found.found, true);
            assert.strictEqual(path.resolve(found.path), path.resolve(src));

            const miss = keep.findKeptTranscript({
                videoPath: 'D:\\media\\OTHER-999.mp4',
                options: { transcriptKeepDir: dir, transcriptKeepDays: 90 },
            });
            assert.strictEqual(miss.found, false);
        } finally {
            try {
                fs.rmSync(dir, { recursive: true, force: true });
            } catch { /* ignore */ }
        }
    });
});
