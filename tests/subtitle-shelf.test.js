const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const core = require('../src/js/subtitle-shelf-core');
const shelf = require('../electron/subtitle-shelf');

describe('subtitle-shelf-core', () => {
    it('mediaIdFromPath is stable and case-insensitive on Windows paths', () => {
        const a = core.mediaIdFromPath('C:\\Videos\\Film.mkv');
        const b = core.mediaIdFromPath('c:/Videos/Film.mkv');
        assert.ok(a.startsWith('media_'));
        assert.strictEqual(a, b);
        assert.notStrictEqual(a, core.mediaIdFromPath('C:\\Videos\\Other.mkv'));
    });

    it('langLabel and langCodeFromOptions', () => {
        assert.strictEqual(core.langLabel('zh-Hans'), '简体中文');
        assert.strictEqual(core.langLabel('zh-Hant'), '繁体中文');
        assert.strictEqual(core.langLabel('en'), '英语');
        assert.strictEqual(core.langLabel('ja'), '日语');
        assert.strictEqual(core.langLabel('ko'), '韩语');
        assert.strictEqual(core.langCodeFromOptions({ chineseSubtitleVariant: 'simplified' }), 'zh-Hans');
        assert.strictEqual(core.langCodeFromOptions({ chineseSubtitleVariant: 'traditional' }), 'zh-Hant');
        assert.strictEqual(core.langCodeFromOptions({ nonChineseTarget: 'en' }), 'en');
        assert.strictEqual(core.langCodeFromOptions({ translateTarget: 'ja' }), 'ja');
        assert.strictEqual(core.sourceLangFromOptions({ language: 'ja' }), 'ja');
        assert.strictEqual(core.sourceLangFromOptions({ language: 'auto' }), 'source');
    });

    it('buildOriginalSidecarPath defaults under software subtitles dir', () => {
        const p = core.buildOriginalSidecarPath('D:\\Media\\show.mkv', '.srt', 'D:\\App\\subtitles');
        assert.ok(p.replace(/\\/g, '/').endsWith('App/subtitles/show.original.srt'));
        const p2 = core.buildTranscribeKeepPath('D:\\Media\\show.mkv', 'srt', 'D:\\App\\subtitles');
        assert.ok(p2.replace(/\\/g, '/').endsWith('App/subtitles/show.transcribe.srt'));
        // Without subtitlesDir, falls back beside media (legacy / caller omitted dir)
        const p3 = core.buildOriginalSidecarPath('D:\\Media\\show.mkv');
        assert.ok(p3.replace(/\\/g, '/').endsWith('Media/show.original.srt'));
    });

    it('normalizeIndex drops empty / marks broken without original', () => {
        const idx = core.normalizeIndex({
            version: 1,
            media: {
                a: { id: 'a', mediaPath: 'x.mkv', title: 'x', original: { path: 'x.original.srt' } },
                b: { id: 'b', mediaPath: 'y.mkv', title: 'y' },
            },
        });
        assert.ok(idx.media.a);
        assert.strictEqual(idx.media.a.broken, undefined);
        assert.ok(idx.media.b);
        assert.strictEqual(idx.media.b.broken, true);
    });

    it('inferLangFromFilename', () => {
        assert.strictEqual(core.inferLangFromFilename('a.zh-Hans.srt'), 'zh-Hans');
        assert.strictEqual(core.inferLangFromFilename('a.original.srt'), 'original');
        assert.strictEqual(core.inferLangFromFilename('a.en.srt'), 'en');
    });

    it('filterShelfItems and countShelfFilters', () => {
        const items = [
            {
                id: '1',
                translationCount: 2,
                translationLabels: ['简体中文', '英语'],
                translationLangs: ['zh-Hans', 'en'],
                mediaExists: true,
                hasTranscript: true,
                hasOriginal: true,
            },
            {
                id: '2',
                translationCount: 0,
                translationLabels: [],
                translationLangs: [],
                mediaExists: false,
                hasTranscript: false,
                hasOriginal: true,
            },
            {
                id: '3',
                translationCount: 1,
                translationLabels: ['日语'],
                translationLangs: ['ja'],
                mediaExists: false,
                hasTranscript: true,
                hasOriginal: false,
            },
        ];
        assert.strictEqual(core.filterShelfItems(items, 'all').length, 3);
        assert.strictEqual(core.filterShelfItems(items, 'translated').length, 2);
        assert.strictEqual(core.filterShelfItems(items, 'missing').length, 2);
        assert.strictEqual(core.filterShelfItems(items, 'all', 'transcript').length, 2);
        assert.strictEqual(core.filterShelfItems(items, 'all', 'original').length, 2);
        assert.strictEqual(core.filterShelfItems(items, 'all', 'zh-Hans').length, 1);
        assert.strictEqual(core.filterShelfItems(items, 'all', 'en').length, 1);
        assert.strictEqual(core.filterShelfItems(items, 'all', 'ja').length, 1);
        assert.strictEqual(core.filterShelfItems(items, 'all', 'ko').length, 0);
        assert.strictEqual(core.filterShelfItems(items, 'missing', 'transcript').length, 1);
        const counts = core.countShelfFilters(items);
        assert.deepStrictEqual(counts, { all: 3, translated: 2, missing: 2 });
        assert.deepStrictEqual(core.countShelfSecondaryFilters(items, 'all'), {
            all: 3,
            transcript: 2,
            original: 2,
            'zh-Hans': 1,
            'zh-Hant': 0,
            en: 1,
            ko: 0,
            ja: 1,
        });
        assert.strictEqual(core.normalizeShelfSecondary('zh-hans'), 'zh-Hans');
        assert.strictEqual(core.normalizeShelfSecondary('no_translation'), 'all');
    });

    it('buildShelfSlotTabs and formatCueTime / truncatePreviewCues', () => {
        const tabs = core.buildShelfSlotTabs({
            transcript: { path: 'a.transcribe.srt', exists: true },
            original: { path: 'a.original.srt', exists: true },
            translations: [
                { lang: 'zh-Hans', label: '简体中文', path: 'a.zh.srt', exists: true },
                { lang: 'en', label: '英语', path: 'a.en.srt', exists: false },
            ],
        });
        assert.strictEqual(tabs[0].id, 'transcript');
        assert.strictEqual(tabs[1].id, 'original');
        assert.strictEqual(tabs[2].id, 'tr:zh-Hans');
        assert.strictEqual(tabs[3].label, '译文 · 英语');
        assert.strictEqual(core.formatCueTime(65000), '01:05');
        assert.strictEqual(core.formatCueTime(3661000), '1:01:01');
        const many = Array.from({ length: 5 }, (_, i) => ({ startMs: i * 1000, text: String(i) }));
        const cut = core.truncatePreviewCues(many, 3);
        assert.strictEqual(cut.cues.length, 3);
        assert.strictEqual(cut.cueCount, 5);
        assert.strictEqual(cut.truncated, true);
        assert.strictEqual(core.previewKey('m1', 'translation', 'en'), 'm1|translation|en');
        assert.strictEqual(core.clampShelfDetailWidth(100), 280);
        assert.strictEqual(core.clampShelfDetailWidth(900, 800), 800 - 240 - 6);
        assert.strictEqual(core.clampShelfDetailWidth(400, 800), 400);
    });

    it('buildShelfSlotTabs includes empty translation placeholder', () => {
        const tabs = core.buildShelfSlotTabs({
            transcript: null,
            original: { path: 'x.original.srt' },
            translations: [],
        });
        assert.ok(tabs.some((t) => t.id === 'tr:empty'));
    });
});

describe('subtitle-shelf store', () => {
    /** @type {string} */
    let tmp;

    beforeEach(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-shelf-'));
    });

    afterEach(() => {
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    function writeFile(rel, body) {
        const full = path.join(tmp, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, body, 'utf8');
        return full;
    }

    it('ASR-only ingest creates transcript + original copy; re-ASR keeps original content', () => {
        const video = writeFile('clip.mp4', 'video');
        const asr1 = writeFile('clip.srt', 'ASR v1');
        const keepOpts = {
            language: 'ja',
            task: 'asr',
            keepTranscript: false,
        };
        const r1 = shelf.ingestBatchHistoryEntry({
            options: keepOpts,
            outputs: [{
                videoPath: video,
                subtitlePath: asr1,
                status: 'done',
            }],
        }, { root: tmp });
        assert.strictEqual(r1.ok, true);
        assert.strictEqual(r1.ingested, 1);

        const list = shelf.listMediaSummaries({ root: tmp });
        assert.strictEqual(list.items.length, 1);
        const id = list.items[0].id;
        const detail1 = shelf.getMediaDetail(id, { root: tmp });
        assert.ok(detail1.media.transcript?.path);
        assert.ok(detail1.media.original?.path);
        assert.ok(detail1.media.original.path.includes('.original.'));
        assert.ok(detail1.media.original.path.replace(/\\/g, '/').includes('/subtitles/'));
        assert.strictEqual(fs.readFileSync(detail1.media.original.path, 'utf8'), 'ASR v1');
        const originalPath = detail1.media.original.path;

        const asr2 = writeFile('clip.srt', 'ASR v2');
        const r2 = shelf.ingestBatchHistoryEntry({
            options: keepOpts,
            outputs: [{
                videoPath: video,
                subtitlePath: asr2,
                status: 'done',
            }],
        }, { root: tmp });
        assert.strictEqual(r2.ingested, 1);
        const detail2 = shelf.getMediaDetail(id, { root: tmp });
        assert.strictEqual(detail2.media.original.path, originalPath);
        assert.strictEqual(fs.readFileSync(detail2.media.original.path, 'utf8'), 'ASR v1');
        assert.strictEqual(fs.readFileSync(detail2.media.transcript.path, 'utf8'), 'ASR v2');
    });

    it('translation upsert by lang; reject empty', () => {
        const video = writeFile('movie.mkv', 'v');
        const src = writeFile('movie.src.srt', 'JA');
        const zh = writeFile('movie.zh.srt', 'ZH');
        const r = shelf.ingestBatchHistoryEntry({
            options: { language: 'ja', chineseSubtitleVariant: 'simplified', task: 'translate' },
            outputs: [{
                videoPath: video,
                sourceSubtitlePath: src,
                targetSubtitlePath: zh,
                status: 'done',
            }],
        }, { root: tmp });
        assert.strictEqual(r.ingested, 1);
        const list = shelf.listMediaSummaries({ root: tmp });
        assert.ok(list.items[0].translationLabels.includes('简体中文'));

        const en = writeFile('movie.en.srt', 'EN');
        shelf.ingestBatchHistoryEntry({
            options: { language: 'ja', nonChineseTarget: 'en', translateTarget: 'en', task: 'translate' },
            outputs: [{
                videoPath: video,
                sourceSubtitlePath: src,
                targetSubtitlePath: en,
                status: 'done',
            }],
        }, { root: tmp });
        const detail = shelf.getMediaDetail(list.items[0].id, { root: tmp });
        assert.strictEqual(detail.media.translations.length, 2);

        const empty = shelf.ingestBatchHistoryEntry({
            options: {},
            outputs: [{ videoPath: writeFile('empty.mp4', 'x'), status: 'done' }],
        }, { root: tmp });
        assert.strictEqual(empty.ingested, 0);
        assert.ok(empty.skipped >= 1);
    });

    it('list / get / delete', () => {
        const video = writeFile('a.mp4', 'v');
        const asr = writeFile('a.srt', 't');
        shelf.ingestBatchHistoryEntry({
            options: { language: 'en' },
            outputs: [{ videoPath: video, subtitlePath: asr, status: 'generated' }],
        }, { root: tmp });
        const list = shelf.listMediaSummaries({ query: 'a', root: tmp });
        assert.strictEqual(list.items.length, 1);
        const id = list.items[0].id;
        assert.ok(shelf.getMediaDetail(id, { root: tmp }).ok);
        assert.ok(shelf.deleteMedia(id, { root: tmp }).ok);
        assert.strictEqual(shelf.listMediaSummaries({ root: tmp }).items.length, 0);
        // original remains under software subtitles/
        assert.ok(fs.existsSync(path.join(tmp, 'subtitles', 'a.original.srt')));
    });

    it('listMediaSummariesAsync sets mediaExists without heal-on-list', async () => {
        const video = writeFile('alive.mp4', 'v');
        const asr = writeFile('alive.srt', 't');
        shelf.ingestBatchHistoryEntry({
            options: { language: 'ja' },
            outputs: [{ videoPath: video, subtitlePath: asr, status: 'done' }],
        }, { root: tmp });
        const gone = path.join(tmp, 'gone.mp4');
        // Index entry with missing media file (no heal rewrite on list).
        const index = shelf.loadIndex(tmp);
        const ghostId = 'media_ghost_test';
        index.media[ghostId] = {
            id: ghostId,
            mediaPath: gone,
            title: 'ghost',
            original: { path: path.join(tmp, 'subtitles', 'ghost.original.srt'), lang: 'ja' },
            transcript: { path: asr, lang: 'ja' },
            translations: [],
            updatedAt: new Date().toISOString(),
        };
        fs.mkdirSync(path.join(tmp, 'subtitles'), { recursive: true });
        fs.writeFileSync(index.media[ghostId].original.path, 'orig');
        shelf.saveIndex(index, tmp);

        const listed = await shelf.listMediaSummariesAsync({ root: tmp });
        assert.strictEqual(listed.ok, true);
        const alive = listed.items.find((it) => it.mediaPath === video);
        const ghost = listed.items.find((it) => it.id === ghostId);
        assert.ok(alive);
        assert.strictEqual(alive.mediaExists, true);
        assert.ok(ghost);
        assert.strictEqual(ghost.mediaExists, false);
        // List must not have created the missing media file or rewritten via ensureOriginal.
        assert.ok(!fs.existsSync(gone));
    });

    it('previewSlot returns truncated cues', () => {
        const video = writeFile('prev.mp4', 'v');
        const body = Array.from({ length: 5 }, (_, i) => {
            const n = i + 1;
            const pad = String(n).padStart(2, '0');
            return `${n}\n00:00:${pad},000 --> 00:00:${pad},500\ncue ${n}\n`;
        }).join('\n');
        const asr = writeFile('prev.srt', body);
        shelf.ingestBatchHistoryEntry({
            options: { language: 'ja' },
            outputs: [{ videoPath: video, subtitlePath: asr, status: 'done' }],
        }, { root: tmp });
        const id = shelf.listMediaSummaries({ root: tmp }).items[0].id;
        const preview = shelf.previewSlot({ mediaId: id, slot: 'original', root: tmp, limit: 3 });
        assert.strictEqual(preview.ok, true);
        assert.strictEqual(preview.cues.length, 3);
        assert.strictEqual(preview.cueCount, 5);
        assert.strictEqual(preview.truncated, true);
        assert.ok(String(preview.cues[0].text).includes('cue'));
    });

    it('deleteTranslation and status', () => {
        const video = writeFile('b.mp4', 'v');
        const src = writeFile('b.src.srt', 's');
        const zh = writeFile('b.zh.srt', 'z');
        shelf.ingestBatchHistoryEntry({
            options: { chineseSubtitleVariant: 'simplified' },
            outputs: [{
                videoPath: video,
                sourceSubtitlePath: src,
                targetSubtitlePath: zh,
                status: 'done',
            }],
        }, { root: tmp });
        const id = shelf.listMediaSummaries({ root: tmp }).items[0].id;
        assert.ok(shelf.deleteTranslation(id, 'zh-Hans', { root: tmp }).ok);
        const detail = shelf.getMediaDetail(id, { root: tmp });
        assert.strictEqual(detail.media.translations.length, 0);
        const st = shelf.getShelfStatus(tmp);
        assert.strictEqual(st.ok, true);
        assert.strictEqual(st.mediaCount, 1);
        assert.strictEqual(st.translationCount, 0);
    });

    it('registerTranslation upserts lang path', () => {
        const video = writeFile('reg.mp4', 'v');
        const asr = writeFile('reg.srt', 'ja');
        shelf.ingestBatchHistoryEntry({
            options: { language: 'ja' },
            outputs: [{ videoPath: video, subtitlePath: asr, status: 'done' }],
        }, { root: tmp });
        const id = shelf.listMediaSummaries({ root: tmp }).items[0].id;
        const zh = writeFile('reg.zh-Hans.srt', 'zh');
        const reg = shelf.registerTranslation(id, zh, { chineseSubtitleVariant: 'simplified' }, { root: tmp });
        assert.strictEqual(reg.ok, true);
        const detail = shelf.getMediaDetail(id, { root: tmp });
        assert.strictEqual(detail.media.translations.length, 1);
        assert.strictEqual(detail.media.translations[0].lang, 'zh-Hans');
        assert.ok(detail.media.translations[0].path.includes('reg.zh-Hans.srt'));
    });

    it('pipeline stages: transcript → original → translation', () => {
        const video = writeFile('pipe.mp4', 'v');
        const asr = writeFile('pipe.transcribe.srt', 'ASR');
        const opts = { language: 'ja', chineseSubtitleVariant: 'simplified', task: 'dual' };

        const t = shelf.ingestPipelineTranscript({
            mediaPath: video,
            transcriptPath: asr,
            options: opts,
        }, { root: tmp });
        assert.strictEqual(t.ok, true);
        assert.strictEqual(t.stage, 'transcript');
        const id = t.mediaId;
        const idxAfterTranscript = shelf.loadIndex(tmp);
        assert.ok(idxAfterTranscript.media[id]?.transcript?.path);
        assert.ok(!idxAfterTranscript.media[id]?.original?.path);

        const o = shelf.ingestPipelineOriginal({
            mediaPath: video,
            transcriptPath: asr,
            options: opts,
        }, { root: tmp });
        assert.strictEqual(o.ok, true);
        assert.strictEqual(o.stage, 'original');
        const listed = shelf.listMediaSummaries({ root: tmp });
        assert.strictEqual(listed.items.length, 1);
        assert.strictEqual(listed.items[0].id, id);
        const d1 = shelf.getMediaDetail(id, { root: tmp });
        assert.ok(d1.media.transcript?.path);
        assert.ok(d1.media.original?.path.includes('.original.'));
        assert.strictEqual(fs.readFileSync(d1.media.original.path, 'utf8'), 'ASR');

        const zh = writeFile('pipe.zh-Hans.srt', 'ZH');
        const tr = shelf.ingestPipelineTranslation({
            mediaPath: video,
            translationPath: zh,
            options: opts,
        }, { root: tmp });
        assert.strictEqual(tr.ok, true);
        assert.strictEqual(tr.stage, 'translation');
        const d2 = shelf.getMediaDetail(id, { root: tmp });
        assert.strictEqual(d2.media.translations.length, 1);
        assert.strictEqual(d2.media.translations[0].lang, 'zh-Hans');

        // Re-ASR updates transcript only
        const asr2 = writeFile('pipe.transcribe.srt', 'ASR2');
        shelf.ingestPipelineTranscript({
            mediaPath: video,
            transcriptPath: asr2,
            options: opts,
        }, { root: tmp });
        shelf.ingestPipelineOriginal({
            mediaPath: video,
            transcriptPath: asr2,
            options: opts,
        }, { root: tmp });
        const d3 = shelf.getMediaDetail(id, { root: tmp });
        assert.strictEqual(fs.readFileSync(d3.media.transcript.path, 'utf8'), 'ASR2');
        assert.strictEqual(fs.readFileSync(d3.media.original.path, 'utf8'), 'ASR');

        assert.strictEqual(
            shelf.resolveOriginalSubtitlePath(video, opts, { root: tmp }),
            path.resolve(d3.media.original.path),
        );
    });
});

describe('subtitle-shelf-pipeline-ingest', () => {
    const pipeline = require('../electron/subtitle-shelf-pipeline-ingest');

    it('resolveSourcePath prefers explicit then outPaths then keep', () => {
        assert.strictEqual(
            pipeline.resolveSourcePath({ transcriptPath: 'a.srt', keptSourcePath: 'b.srt' }),
            'a.srt',
        );
        assert.strictEqual(
            pipeline.resolveSourcePath({
                outPaths: { sourceSubtitlePath: 'src.srt' },
                keptSourcePath: 'keep.srt',
            }),
            'src.srt',
        );
        assert.strictEqual(
            pipeline.resolveSourcePath({ keptSourcePath: 'keep.srt' }),
            'keep.srt',
        );
    });

    it('saveShelfSourceSlotsBeforeMt registers transcript + original before MT', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-shelf-premt-'));
        const video = path.join(dir, 'clip.mp4');
        const asr = path.join(dir, 'clip.transcribe.srt');
        fs.writeFileSync(video, 'v');
        fs.writeFileSync(asr, '1\n00:00:00,000 --> 00:00:01,000\nja\n');
        const opts = {
            language: 'ja',
            chineseSubtitleVariant: 'simplified',
            task: 'dual',
            transcriptKeepDir: dir,
            subtitlesDir: dir,
        };
        const saved = pipeline.saveShelfSourceSlotsBeforeMt({
            mediaPath: video,
            outPaths: { sourceSubtitlePath: asr },
            options: opts,
            root: dir,
        });
        assert.strictEqual(saved.ok, true);
        assert.strictEqual(saved.transcript?.ok, true);
        assert.strictEqual(saved.original?.ok, true);
        const listed = shelf.listMediaSummaries({ root: dir });
        assert.strictEqual(listed.items.length, 1);
        assert.ok(listed.items[0].originalPath || listed.items[0].hasOriginal);
        const detail = shelf.getMediaDetail(listed.items[0].id, { root: dir });
        assert.ok(detail.media.transcript?.path);
        assert.ok(detail.media.original?.path);
        assert.ok(!detail.media.translations?.length);
        fs.rmSync(dir, { recursive: true, force: true });
    });
});

describe('subtitle-shelf-translate-core', () => {
    const tx = require('../src/js/subtitle-shelf-translate-core');

    it('resolves original / transcript slots', () => {
        const media = {
            id: 'm1',
            mediaPath: 'D:/a.mp4',
            title: 'a',
            transcript: { path: 'D:/a.transcribe.srt', exists: true },
            original: { path: 'D:/a.original.srt', exists: true },
            translations: [{ lang: 'zh-Hans', path: 'D:/a.srt' }],
        };
        assert.strictEqual(tx.normalizeSourceSlot('transcript'), 'transcript');
        assert.strictEqual(tx.sourceSlotLabel('original'), '原文');
        const orig = tx.resolveShelfSourceSlot(media, 'original');
        assert.strictEqual(orig.ok, true);
        assert.strictEqual(orig.path, 'D:/a.original.srt');
        const missing = tx.resolveShelfSourceSlot({ ...media, transcript: null }, 'transcript');
        assert.strictEqual(missing.ok, false);
    });

    it('maps shelf slots to subtitle-task entry stages', () => {
        const fromOriginal = tx.resolveShelfTranslateEntry('original');
        assert.strictEqual(fromOriginal.ok, true);
        assert.strictEqual(fromOriginal.entryStage, 'translate');
        assert.strictEqual(fromOriginal.pipelineFloor, 3);
        assert.strictEqual(fromOriginal.skipAsr, true);
        const fromTranscript = tx.resolveShelfTranslateEntry('transcript');
        assert.strictEqual(fromTranscript.entryStage, 'repair');
        assert.strictEqual(fromTranscript.pipelineFloor, 2);
        assert.strictEqual(fromTranscript.runSemanticRepair, true);
    });

    it('builds plan row preferring existing translation dest', () => {
        const media = {
            id: 'm2',
            mediaPath: 'D:/film.mkv',
            title: 'film',
            transcript: { path: 'D:/film.transcribe.srt', exists: true, lang: 'ja' },
            original: { path: 'D:/film.original.srt', exists: true, lang: 'ja' },
            translations: [{ lang: 'zh-Hans', path: 'D:/out/film.srt' }],
        };
        const row = tx.buildShelfTranslatePlanRow(media, 'original', { langCode: 'zh-Hans' });
        assert.strictEqual(row.ok, true);
        assert.strictEqual(row.fromShelf, true);
        assert.strictEqual(row.sourceKind, 'shelf-original');
        assert.strictEqual(row.destPath, 'D:/out/film.srt');
        assert.strictEqual(row.item.shelfMediaId, 'm2');
        assert.strictEqual(row.sourceLanguage, 'ja');
        assert.strictEqual(row.entryStage, 'translate');
        assert.strictEqual(row.pipelineFloor, 3);
        assert.strictEqual(row.item.skipAsr, true);
        const ov = tx.buildShelfTranslateOptionOverrides(row);
        assert.strictEqual(ov.skipAsr, true);
        assert.strictEqual(ov.overwrite, true);
        assert.strictEqual(ov.shelfEntryStage, 'translate');
        assert.strictEqual(ov.shelfSourceSubtitlePath, 'D:/film.original.srt');
        assert.strictEqual(ov.language, 'ja');
    });

    it('transcript plan enters at repair', () => {
        const media = {
            id: 'm2b',
            mediaPath: 'D:/film.mkv',
            transcript: { path: 'D:/film.transcribe.srt', exists: true, lang: 'ja' },
            original: { path: 'D:/film.original.srt', exists: true, lang: 'ja' },
            translations: [],
        };
        const row = tx.buildShelfTranslatePlanRow(media, 'transcript', { langCode: 'zh-Hans' });
        assert.strictEqual(row.ok, true);
        assert.strictEqual(row.entryStage, 'repair');
        assert.strictEqual(row.pipelineFloor, 2);
        const ov = tx.buildShelfTranslateOptionOverrides(row);
        assert.strictEqual(ov.shelfEntryStage, 'repair');
        assert.strictEqual(ov.runSemanticRepair, true);
    });

    it('mergeShelfBatchOverrides restores skipAsr after sense-only merge', () => {
        const ov = tx.buildShelfTranslateOptionOverrides({
            sourcePath: 'D:/a.original.srt',
            sourceSlot: 'original',
            sourceLanguage: 'ja',
        });
        // Simulate batch loop: sense merge drops non-owned keys.
        const afterSense = { task: 'translate', language: 'auto', engineAsrModel: 'x' };
        const restored = tx.mergeShelfBatchOverrides(afterSense, ov);
        assert.strictEqual(restored.skipAsr, true);
        assert.strictEqual(restored.overwrite, true);
        assert.strictEqual(restored.shelfEntryStage, 'translate');
        assert.strictEqual(restored.shelfSourceSubtitlePath, 'D:/a.original.srt');
        assert.strictEqual(restored.language, 'ja');
        // Non-shelf overrides must not inject keys.
        const plain = tx.mergeShelfBatchOverrides(afterSense, { engineMtModel: 'sakura-1.5b' });
        assert.strictEqual(plain.skipAsr, undefined);
        assert.strictEqual(plain.engineAsrModel, 'x');
    });

    it('never overwrites source path as dest', () => {
        const media = {
            id: 'm3',
            mediaPath: 'D:/x.mp4',
            original: { path: 'D:/x.srt', exists: true, lang: 'ja' },
            translations: [{ lang: 'zh-Hans', path: 'D:/x.srt' }],
        };
        const dest = tx.resolveShelfTranslateDestPath(media, 'D:/x.srt', { langCode: 'zh-Hans' });
        assert.notStrictEqual(dest.replace(/\\/g, '/').toLowerCase(), 'd:/x.srt');
        assert.ok(/zh-cn/i.test(dest));
    });

    it('resolves source language and chinese heuristic', () => {
        assert.strictEqual(tx.resolveShelfSourceLanguage({
            original: { lang: 'source' },
        }, 'original', 'auto'), 'ja');
        assert.strictEqual(tx.resolveShelfSourceLanguage({
            original: { lang: 'ja' },
        }, 'original', 'en'), 'ja');
        const zhCues = Array.from({ length: 30 }, (_, i) => ({ text: `这是中文台词${i}测试内容` }));
        assert.strictEqual(tx.cuesLookPrimarilyChinese(zhCues), true);
        const jaCues = Array.from({ length: 30 }, (_, i) => ({ text: `これは日本語のセリフ${i}です` }));
        assert.strictEqual(tx.cuesLookPrimarilyChinese(jaCues), false);
    });
});
