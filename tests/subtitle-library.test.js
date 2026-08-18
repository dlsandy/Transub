const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const core = require('../src/js/subtitle-library-core');
const library = require('../electron/subtitle-library');

function makeTempDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeSrt(filePath, text = 'hello') {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `1\n00:00:00,000 --> 00:00:01,000\n${text}\n`, 'utf8');
}

describe('subtitle-library-core', () => {
    it('counts subtitle cues for srt and ass', () => {
        assert.strictEqual(core.countSubtitleCues('1\n00:00:00,000 --> 00:00:01,000\na\n\n2\n00:00:01,000 --> 00:00:02,000\nb\n'), 2);
        assert.strictEqual(core.countSubtitleCues('[Script Info]\nTitle: x\n\n[Events]\nDialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,hi\n'), 1);
        assert.strictEqual(core.countSubtitleCues(''), 0);
    });

    it('builds recipe with asr/mt/preset snapshot fields', () => {
        const recipe = core.buildRecipeFromOptions({
            task: 'dual',
            engineAsrModel: 'sensevoice-small',
            device: 'cuda',
            language: 'ja',
            sakuraMt: true,
            engineLlmMtModel: 'sakura-1.5b',
            presetId: 'ja-av-soft-translate',
            beamSize: 5,
        }, { presetName: '日语软向' });
        assert.strictEqual(recipe.task, 'dual');
        assert.strictEqual(recipe.asr.model, 'sensevoice-small');
        assert.strictEqual(recipe.mt.provider, 'sakura');
        assert.strictEqual(recipe.mt.model, 'sakura-1.5b');
        assert.strictEqual(recipe.presetId, 'ja-av-soft-translate');
        assert.strictEqual(recipe.presetName, '日语软向');
        assert.ok(core.formatRecipeSummary(recipe).includes('sensevoice-small'));
        assert.ok(core.formatRecipeSummary(recipe).includes('预设'));
    });

    it('records LLM inference as sakura, not opus', () => {
        const llm = core.buildRecipeFromOptions({
            task: 'translate',
            engineAsrModel: 'anime-whisper',
            translateMode: 'llm',
            engineMtModel: 'sakura-7b',
            engineLlmMtModel: 'sakura-7b',
        });
        assert.strictEqual(llm.mt.provider, 'sakura');
        assert.strictEqual(llm.mt.model, 'sakura-7b');
        assert.strictEqual(llm.mt.sakuraMt, true);
        assert.strictEqual(llm.mt.translateMode, 'llm');
        assert.strictEqual(core.recipeToRetranslateHints(llm).mode, 'llm');

        const inferred = core.buildRecipeFromOptions({
            task: 'translate',
            engineAsrModel: 'anime-whisper',
            engineMtModel: 'sakura-7b',
        });
        assert.strictEqual(inferred.mt.provider, 'sakura');
        assert.notStrictEqual(inferred.mt.provider, 'opus');

        const opus = core.buildRecipeFromOptions({
            task: 'translate',
            engineOpusMtModel: 'opus-ja-zh',
            translateMode: 'engine',
            engineLlmMtModel: 'sakura-7b',
        });
        assert.strictEqual(opus.mt.provider, 'opus');
        assert.strictEqual(opus.mt.model, 'opus-ja-zh');
    });

    it('labels Pro vs inference vs engine recipes for the library', () => {
        const smart = core.buildRecipeFromOptions({
            task: 'translate',
            engineAsrModel: 'anime-whisper',
            translateMode: 'smart',
            smartTranslate: true,
            smartTranslateModelId: 'qwen25-7b',
            presetId: 'ja-av-anime-whisper-firered',
        }, { presetName: 'Anime Whisper' });
        assert.deepStrictEqual(core.recipeLayerLabels(smart), ['Pro译', '已润色', '人名已锁']);
        const smartSummary = core.formatRecipeSummary(smart);
        assert.ok(smartSummary.startsWith('Pro译 · 已润色 · 人名已锁'));
        assert.ok(smartSummary.includes('anime-whisper'));
        assert.ok(smartSummary.includes('预设'));

        const polishOff = core.buildRecipeFromOptions({
            task: 'translate',
            translateMode: 'smart',
            smartTranslate: true,
            smartTranslatePlotPolish: false,
        });
        assert.deepStrictEqual(core.recipeLayerLabels(polishOff), ['Pro译', '人名已锁']);

        const llm = core.buildRecipeFromOptions({
            task: 'translate',
            engineAsrModel: 'anime-whisper',
            translateMode: 'llm',
            engineMtModel: 'sakura-7b',
            engineLlmMtModel: 'sakura-7b',
        });
        assert.ok(core.formatRecipeSummary(llm).startsWith('推理译'));
        assert.ok(core.formatRecipeSummary(llm).includes('sakura-7b'));
        assert.ok(!core.formatRecipeSummary(llm).includes('opus:'));

        const opusLabeled = core.buildRecipeFromOptions({
            task: 'translate',
            translateMode: 'engine',
            engineOpusMtModel: 'opus-ja-zh',
        });
        assert.ok(core.formatRecipeSummary(opusLabeled).startsWith('机器译'));
    });

    it('prunes oldest versions while protecting active', () => {
        const versions = [
            { id: 'a', createdAt: '2026-01-01T00:00:00.000Z', status: 'raw' },
            { id: 'b', createdAt: '2026-01-02T00:00:00.000Z', status: 'raw' },
            { id: 'c', createdAt: '2026-01-03T00:00:00.000Z', status: 'edited' },
            { id: 'd', createdAt: '2026-01-04T00:00:00.000Z', status: 'raw' },
        ];
        const prune = core.selectVersionsToPrune(versions, { limit: 3, activeVersionId: 'a' });
        assert.ok(prune.some((v) => v.id === 'b'));
        assert.ok(!prune.some((v) => v.id === 'a'));
        assert.strictEqual(prune.length, 1);
    });

    it('protects archived versions from prune', () => {
        const versions = [
            { id: 'a', createdAt: '2026-01-01T00:00:00.000Z', status: 'archived' },
            { id: 'b', createdAt: '2026-01-02T00:00:00.000Z', status: 'raw' },
            { id: 'c', createdAt: '2026-01-03T00:00:00.000Z', status: 'raw' },
            { id: 'd', createdAt: '2026-01-04T00:00:00.000Z', status: 'raw' },
        ];
        const prune = core.selectVersionsToPrune(versions, { limit: 2, activeVersionId: 'd' });
        assert.ok(!prune.some((v) => v.id === 'a'));
        assert.ok(!prune.some((v) => v.id === 'd'));
        assert.ok(prune.length >= 1);
    });

    it('maps recipe to retranslate hints and applies preset overlay', () => {
        const recipe = core.buildRecipeFromOptions({
            task: 'translate',
            engineAsrModel: 'sensevoice-small',
            language: 'ja',
            sakuraMt: true,
            engineLlmMtModel: 'sakura-1.5b',
            presetId: 'old',
        }, { presetName: '旧预设' });
        const hints = core.recipeToRetranslateHints(recipe);
        assert.strictEqual(hints.mode, 'llm');
        assert.strictEqual(hints.modelId, 'sakura-1.5b');
        assert.strictEqual(hints.language, 'ja');

        const smart = core.recipeToRetranslateHints({
            mt: { smartTranslate: true, provider: 'smart', model: 'qwen' },
            asr: { language: 'ja' },
        });
        assert.strictEqual(smart.mode, 'smart');

        const next = core.applyPresetToRecipe(recipe, {
            id: 'translate-quality',
            name: '翻译 · 高质量',
            options: { task: 'translate', sakuraMt: false, engineOpusMtModel: 'opus-ja-zh' },
        });
        assert.strictEqual(next.presetId, 'translate-quality');
        assert.strictEqual(next.presetName, '翻译 · 高质量');
    });

    it('diffs lines and summarizes context skips', () => {
        const diff = core.diffLines('a\nb\nc\n', 'a\nx\nc\n');
        assert.strictEqual(diff.stats.deleted, 1);
        assert.strictEqual(diff.stats.added, 1);
        const summary = core.summarizeDiffOps([
            { op: 'equal', text: '1' },
            { op: 'equal', text: '2' },
            { op: 'equal', text: '3' },
            { op: 'equal', text: '4' },
            { op: 'equal', text: '5' },
            { op: 'add', text: 'x' },
        ], { maxEqualContext: 1 });
        assert.ok(summary.some((o) => o.op === 'skip'));
        assert.ok(summary.some((o) => o.op === 'add'));
    });

    it('filters versions by recipe facets and tags', () => {
        const versions = [
            {
                id: '1',
                tags: ['对照A'],
                recipe: { presetId: 'p1', presetName: 'A', mt: { provider: 'sakura', model: 'sakura-1.5b' }, asr: { model: 'sensevoice-small' } },
            },
            {
                id: '2',
                tags: ['对照B'],
                recipe: { presetId: 'p2', presetName: 'B', mt: { provider: 'opus', model: 'opus-ja-zh' }, asr: { model: 'anime-whisper' } },
            },
        ];
        assert.ok(core.versionMatchesRecipeFilter(versions[0], { tag: '对照A' }));
        assert.ok(!core.versionMatchesRecipeFilter(versions[0], { tag: '对照B' }));
        assert.ok(core.versionMatchesRecipeFilter(versions[1], { mtModel: 'opus' }));
        assert.ok(core.versionMatchesRecipeFilter(versions[0], { presetId: 'p1' }));
        const facets = core.collectRecipeFacets(versions);
        assert.ok(facets.presets.some((p) => p.id === 'p1'));
        assert.ok(facets.tags.includes('对照B'));
        assert.ok(facets.mtModels.includes('sakura-1.5b'));
        const pair = core.findAbComparePair(versions);
        assert.ok(pair.ok);
        assert.strictEqual(pair.versionA.id, '1');
        assert.strictEqual(pair.versionB.id, '2');
    });
});

describe('subtitle-library store', () => {
    it('ingests batch outputs with recipe and enforces free prune limit', () => {
        const root = makeTempDir('transub-lib-');
        const mediaDir = makeTempDir('transub-lib-media-');
        try {
            const videoPath = path.join(mediaDir, 'demo.mp4');
            fs.writeFileSync(videoPath, 'fake');
            const src = path.join(mediaDir, 'demo.ja.srt');
            const zh = path.join(mediaDir, 'demo.zh.srt');
            writeSrt(src, 'ja1');
            writeSrt(zh, 'zh1');

            const entry = {
                id: 'job-1',
                task: 'dual',
                options: {
                    task: 'dual',
                    engineAsrModel: 'sensevoice-small',
                    sakuraMt: true,
                    engineLlmMtModel: 'sakura-1.5b',
                    presetId: 'translate-quality',
                    device: 'cpu',
                    language: 'ja',
                },
                outputs: [{
                    videoPath,
                    sourceSubtitlePath: src,
                    targetSubtitlePath: zh,
                    status: 'done',
                }],
            };

            // Force free-tier prune
            let res = library.ingestBatchHistoryEntry(entry, { root, libraryPro: false });
            assert.strictEqual(res.ok, true);
            assert.ok(res.ingested >= 2);

            // Add more ZH versions to exceed free limit (3)
            for (let i = 2; i <= 5; i += 1) {
                writeSrt(zh, `zh${i}`);
                res = library.ingestBatchHistoryEntry({
                    ...entry,
                    id: `job-${i}`,
                    outputs: [{
                        videoPath,
                        sourceSubtitlePath: src,
                        targetSubtitlePath: zh,
                        status: 'done',
                    }],
                }, { root, libraryPro: false });
                assert.strictEqual(res.ok, true);
            }

            const list = library.listMediaSummaries({ root });
            assert.strictEqual(list.ok, true);
            assert.ok(list.items.length >= 1);
            const summary = list.items[0];
            assert.ok(typeof summary.sourceVersionCount === 'number');
            assert.ok(typeof summary.targetVersionCount === 'number');
            assert.ok(typeof summary.bilingualVersionCount === 'number');
            assert.ok(summary.lastVersionAt);
            assert.ok(summary.targetVersionCount >= 1, 'list should count target versions');
            assert.ok(summary.targetCueCount >= 1, 'list should expose active target cue count');
            assert.ok(summary.preferredOpenVersionId, 'list should expose preferred open version');
            assert.ok(summary.activeRecipeSummary);
            const detail = library.getMediaDetail(summary.id, { root });
            assert.strictEqual(detail.ok, true);
            const target = detail.tracks.find((t) => t.role === 'target');
            assert.ok(target);
            assert.ok(target.versions.length <= 3, `expected <=3 versions, got ${target.versions.length}`);
            assert.ok(target.versions[0].recipeSummary);
            assert.strictEqual(summary.targetVersionCount, target.versions.length);
            const activeTarget = target.versions.find((v) => v.id === target.activeVersionId);
            assert.ok(activeTarget);
            assert.strictEqual(activeTarget.cueCount, summary.targetCueCount);

            const activeId = target.activeVersionId;
            const older = target.versions.find((v) => v.id !== activeId);
            if (older) {
                writeSrt(zh, 'should-overwrite');
                const set = library.setActiveVersion(older.id, { root, writeExport: true });
                assert.strictEqual(set.ok, true);
                const blobPath = path.join(root, 'subtitle-library', older.contentRef);
                assert.strictEqual(
                    fs.readFileSync(zh, 'utf8'),
                    fs.readFileSync(blobPath, 'utf8'),
                );
            }
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
            fs.rmSync(mediaDir, { recursive: true, force: true });
        }
    });

    it('previews version text without opening editor', () => {
        const root = makeTempDir('transub-lib-preview-');
        const mediaDir = makeTempDir('transub-lib-preview-media-');
        try {
            const videoPath = path.join(mediaDir, 'clip.mp4');
            fs.writeFileSync(videoPath, 'fake');
            const zh = path.join(mediaDir, 'clip.zh.srt');
            const lines = [];
            for (let i = 1; i <= 30; i += 1) {
                lines.push(`${i}`, `00:00:${String(i).padStart(2, '0')},000 --> 00:00:${String(i).padStart(2, '0')},500`, `line-${i}`, '');
            }
            fs.mkdirSync(path.dirname(zh), { recursive: true });
            fs.writeFileSync(zh, lines.join('\n'), 'utf8');

            const ingested = library.ingestBatchHistoryEntry({
                id: 'job-preview-1',
                task: 'translate',
                options: { task: 'translate', engineAsrModel: 'sensevoice-small' },
                outputs: [{ videoPath, subtitlePath: zh, status: 'done' }],
            }, { root, libraryPro: false });
            assert.strictEqual(ingested.ok, true);

            const list = library.listMediaSummaries({ root });
            const detail = library.getMediaDetail(list.items[0].id, { root });
            const versionId = detail.tracks[0].versions[0].id;
            const preview = library.previewVersion(versionId, { root, maxLines: 12 });
            assert.strictEqual(preview.ok, true);
            assert.ok(preview.preview.includes('line-1'));
            assert.ok(preview.truncated);
            assert.ok(preview.cueCount >= 1);
            assert.ok(preview.lineCount > 12);
            assert.ok(!preview.preview.includes('line-30'));

            const missing = library.previewVersion('nope', { root });
            assert.strictEqual(missing.ok, false);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
            fs.rmSync(mediaDir, { recursive: true, force: true });
        }
    });

    it('loads timed cues for library player without materializing export', () => {
        const root = makeTempDir('transub-lib-play-');
        const mediaDir = makeTempDir('transub-lib-play-media-');
        try {
            const videoPath = path.join(mediaDir, 'clip.mp4');
            fs.writeFileSync(videoPath, 'fake');
            const zh = path.join(mediaDir, 'clip.zh.srt');
            writeSrt(zh, 'hello-play');

            library.ingestBatchHistoryEntry({
                id: 'job-play-1',
                task: 'translate',
                options: { task: 'translate', engineAsrModel: 'sensevoice-small' },
                outputs: [{ videoPath, subtitlePath: zh, status: 'done' }],
            }, { root, libraryPro: false });

            const mediaId = library.listMediaSummaries({ root }).items[0].id;
            const detail = library.getMediaDetail(mediaId, { root });
            const versionId = detail.tracks[0].versions[0].id;
            const play = library.loadVersionPlayback(versionId, { root });
            assert.strictEqual(play.ok, true);
            assert.strictEqual(play.format, 'srt');
            assert.ok(Array.isArray(play.cues) && play.cues.length >= 1);
            assert.ok(String(play.cues[0].text || '').includes('hello-play'));
            assert.strictEqual(play.videoPath, videoPath);
            assert.strictEqual(play.mediaExists, true);
            assert.ok(Number.isFinite(play.cues[0].startMs));
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
            fs.rmSync(mediaDir, { recursive: true, force: true });
        }
    });

    it('deletes media with all tracks versions and blobs', () => {
        const root = makeTempDir('transub-lib-del-media-');
        const mediaDir = makeTempDir('transub-lib-del-media-files-');
        try {
            const videoPath = path.join(mediaDir, 'clip.mp4');
            fs.writeFileSync(videoPath, 'fake');
            const src = path.join(mediaDir, 'clip.ja.srt');
            const zh = path.join(mediaDir, 'clip.zh.srt');
            writeSrt(src, 'ja-line');
            writeSrt(zh, 'zh-line');

            const ingested = library.ingestBatchHistoryEntry({
                id: 'job-del-1',
                task: 'dual',
                options: {
                    task: 'dual',
                    engineAsrModel: 'sensevoice-small',
                    sakuraMt: true,
                    engineLlmMtModel: 'sakura-1.5b',
                },
                outputs: [{
                    videoPath,
                    sourceSubtitlePath: src,
                    targetSubtitlePath: zh,
                    status: 'done',
                }],
            }, { root, libraryPro: false });
            assert.strictEqual(ingested.ok, true);

            const listBefore = library.listMediaSummaries({ root });
            assert.ok(listBefore.items.length >= 1);
            const mediaId = listBefore.items[0].id;
            const detail = library.getMediaDetail(mediaId, { root });
            const blobRefs = [];
            for (const track of detail.tracks || []) {
                for (const v of track.versions || []) {
                    if (v.contentRef) blobRefs.push(path.join(root, 'subtitle-library', v.contentRef));
                }
            }
            assert.ok(blobRefs.length >= 1);
            for (const blob of blobRefs) assert.ok(fs.existsSync(blob));

            const deleted = library.deleteMedia(mediaId, { root, notify: false });
            assert.strictEqual(deleted.ok, true);
            assert.ok(deleted.deletedVersionCount >= 1);

            const listAfter = library.listMediaSummaries({ root });
            assert.ok(!listAfter.items.some((m) => m.id === mediaId));
            assert.strictEqual(library.getMediaDetail(mediaId, { root }).ok, false);
            for (const blob of blobRefs) assert.ok(!fs.existsSync(blob), 'blob should be GC’d');
            // Sidecar exports on disk remain
            assert.ok(fs.existsSync(src));
            assert.ok(fs.existsSync(zh));
            assert.ok(fs.existsSync(videoPath));

            const batchRoot = makeTempDir('transub-lib-del-batch-');
            const batchMedia = makeTempDir('transub-lib-del-batch-media-');
            try {
                const ids = [];
                for (let i = 0; i < 2; i += 1) {
                    const vp = path.join(batchMedia, `c${i}.mp4`);
                    const zp = path.join(batchMedia, `c${i}.zh.srt`);
                    fs.writeFileSync(vp, 'fake');
                    writeSrt(zp, `zh${i}`);
                    library.ingestBatchHistoryEntry({
                        id: `job-batch-${i}`,
                        task: 'translate',
                        options: { task: 'translate' },
                        outputs: [{ videoPath: vp, subtitlePath: zp, status: 'done' }],
                    }, { root: batchRoot, libraryPro: false });
                }
                const items = library.listMediaSummaries({ root: batchRoot }).items;
                assert.ok(items.length >= 2);
                ids.push(...items.slice(0, 2).map((m) => m.id));
                const batch = library.deleteMediaBatch(ids, { root: batchRoot });
                assert.strictEqual(batch.ok, true);
                assert.strictEqual(batch.deleted, 2);
                assert.strictEqual(library.listMediaSummaries({ root: batchRoot }).items.length, items.length - 2);
            } finally {
                fs.rmSync(batchRoot, { recursive: true, force: true });
                fs.rmSync(batchMedia, { recursive: true, force: true });
            }
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
            fs.rmSync(mediaDir, { recursive: true, force: true });
        }
    });

    it('records edited version inheriting parent recipe', () => {
        const root = makeTempDir('transub-lib-edit-');
        const mediaDir = makeTempDir('transub-lib-edit-media-');
        try {
            const videoPath = path.join(mediaDir, 'clip.mp4');
            fs.writeFileSync(videoPath, 'fake');
            const zh = path.join(mediaDir, 'clip.zh.srt');
            writeSrt(zh, 'v1');

            library.ingestBatchHistoryEntry({
                id: 'job-edit-1',
                task: 'translate',
                options: {
                    task: 'translate',
                    engineAsrModel: 'anime-whisper',
                    engineOpusMtModel: 'opus-ja-zh',
                },
                outputs: [{
                    videoPath,
                    subtitlePath: zh,
                    status: 'done',
                }],
            }, { root });

            writeSrt(zh, 'v2-edited');
            const edited = library.ingestEditedSubtitle({ subtitlePath: zh, videoPath, root });
            assert.strictEqual(edited.ok, true);
            assert.strictEqual(edited.version.status, 'edited');
            assert.ok(edited.version.parentVersionId);
            assert.strictEqual(edited.version.recipe?.asr?.model, 'anime-whisper');
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
            fs.rmSync(mediaDir, { recursive: true, force: true });
        }
    });

    it('diffs two versions and exports publish pack + corpus', () => {
        const root = makeTempDir('transub-lib-pro-');
        const mediaDir = makeTempDir('transub-lib-pro-media-');
        const packDir = makeTempDir('transub-lib-pack-');
        try {
            const videoPath = path.join(mediaDir, 'film.mp4');
            fs.writeFileSync(videoPath, 'fake');
            const src = path.join(mediaDir, 'film.ja.srt');
            const zh = path.join(mediaDir, 'film.zh.srt');
            writeSrt(src, 'ori');
            writeSrt(zh, 'line-a');

            library.ingestBatchHistoryEntry({
                id: 'job-pro-1',
                task: 'dual',
                options: { task: 'dual', engineAsrModel: 'sensevoice-small', sakuraMt: true },
                outputs: [{
                    videoPath,
                    sourceSubtitlePath: src,
                    targetSubtitlePath: zh,
                    status: 'done',
                }],
            }, { root, libraryPro: true });

            writeSrt(zh, 'line-b');
            library.ingestBatchHistoryEntry({
                id: 'job-pro-2',
                task: 'dual',
                options: { task: 'dual', engineAsrModel: 'sensevoice-small', sakuraMt: true },
                outputs: [{
                    videoPath,
                    sourceSubtitlePath: src,
                    targetSubtitlePath: zh,
                    status: 'done',
                }],
            }, { root, libraryPro: true });

            const list = library.listMediaSummaries({ root });
            const detail = library.getMediaDetail(list.items[0].id, { root });
            const target = detail.tracks.find((t) => t.role === 'target');
            assert.ok(target.versions.length >= 2);

            const a = target.versions[1].id;
            const b = target.versions[0].id;
            const diff = library.diffVersions(a, b, { root, requirePro: false });
            assert.strictEqual(diff.ok, true);
            assert.ok(diff.stats.changed >= 1);
            assert.ok(diff.ops.some((o) => o.op === 'add' || o.op === 'del'));

            const pub = library.setVersionStatus(b, 'published', { root, requirePro: false });
            assert.strictEqual(pub.ok, true);
            assert.strictEqual(pub.version.status, 'published');

            const pack = library.exportPublishPack(list.items[0].id, packDir, {
                root,
                requirePro: false,
            });
            assert.strictEqual(pack.ok, true);
            assert.ok(pack.count >= 2);
            assert.ok(fs.existsSync(path.join(packDir, 'transub-publish-manifest.json')));

            const batchDir = makeTempDir('transub-lib-pack-batch-');
            const batch = library.exportPublishPackBatch([list.items[0].id], batchDir, {
                root,
                requirePro: false,
            });
            assert.strictEqual(batch.ok, true);
            assert.strictEqual(batch.mediaCount, 1);
            assert.ok(batch.count >= 2);
            assert.ok(batch.results?.[0]?.ok);
            assert.ok(fs.existsSync(path.join(batch.results[0].dir, 'transub-publish-manifest.json')));
            fs.rmSync(batchDir, { recursive: true, force: true });

            const corpusPath = path.join(packDir, 'corpus.jsonl');
            writeSrt(zh, 'line-c-edit');
            library.ingestEditedSubtitle({ subtitlePath: zh, videoPath, root });
            const corpus = library.exportCorpusJsonl(corpusPath, { root, requirePro: false });
            assert.strictEqual(corpus.ok, true);
            assert.ok(corpus.count >= 1);
            const firstLine = fs.readFileSync(corpusPath, 'utf8').trim().split('\n')[0];
            const parsed = JSON.parse(firstLine);
            assert.ok(parsed.text);

            const prepared = library.prepareLibraryRerun(b, { root, requirePro: false });
            assert.strictEqual(prepared.ok, true);
            assert.ok(fs.existsSync(prepared.sourcePath));
            assert.strictEqual(prepared.mediaPath, videoPath);
            assert.ok(prepared.hints?.mode);

            // Simulate library retranslate write tagging 对照B
            writeSrt(zh, 'line-d-rerun');
            const tagged = library.ingestEditedSubtitle({
                subtitlePath: zh,
                videoPath,
                root,
                source: 'retranslate',
                note: '对照B',
                tags: ['对照B', 'rerun'],
                bindingSourceVersionId: prepared.sourceVersionId,
                recipe: prepared.recipe,
            });
            assert.strictEqual(tagged.ok, true);
            assert.ok(tagged.version.tags.includes('对照B'));
            const after = library.getMediaDetail(list.items[0].id, { root, tag: '对照B' });
            assert.ok(after.tracks.some((t) => t.versions.some((v) => v.tags?.includes('对照B'))));
            // Filtering display versions must not hide the A/B pair capability.
            const filteredTarget = after.tracks.find((t) => t.role === 'target');
            assert.ok(filteredTarget?.abPairAvailable, 'ab pair should ignore recipe/tag filter');
            assert.ok(filteredTarget.abVersionIdA);
            assert.ok(filteredTarget.abVersionIdB);
            const byTag = library.listMediaSummaries({ root, tag: '对照B' });
            assert.ok(byTag.items.length >= 1);
            const mtNeedle = String(prepared.recipe?.mt?.model || prepared.hints?.modelId || '').trim();
            if (mtNeedle) {
                const byMt = library.listMediaSummaries({ root, mtModel: mtNeedle });
                assert.ok(byMt.items.length >= 1);
            }

            const detailAb = library.getMediaDetail(list.items[0].id, { root });
            const targetTrack = detailAb.tracks.find((t) => t.role === 'target');
            assert.ok(targetTrack?.abPairAvailable);
            const abDiff = library.diffAbPair(targetTrack.id, { root, requirePro: false });
            assert.strictEqual(abDiff.ok, true);
            assert.ok(abDiff.abPair);
            assert.ok(abDiff.stats);

            const abExportDir = path.join(packDir, 'ab-group');
            const abExport = library.exportTaggedVersions(list.items[0].id, abExportDir, {
                root,
                tags: ['对照A', '对照B'],
                requirePro: false,
            });
            assert.strictEqual(abExport.ok, true);
            assert.ok(abExport.count >= 2);
            assert.ok(fs.existsSync(path.join(abExportDir, 'transub-tag-export-manifest.json')));
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
            fs.rmSync(mediaDir, { recursive: true, force: true });
            fs.rmSync(packDir, { recursive: true, force: true });
        }
    });

    it('sets notes, exclusive A/B tags, and prepares MT train pair', () => {
        const root = makeTempDir('transub-lib-abnote-');
        const mediaDir = makeTempDir('transub-lib-abnote-media-');
        try {
            const videoPath = path.join(mediaDir, 'pair.mp4');
            fs.writeFileSync(videoPath, 'fake');
            const src = path.join(mediaDir, 'pair.ja.srt');
            const zh = path.join(mediaDir, 'pair.zh.srt');
            writeSrt(src, 'ja');
            writeSrt(zh, 'zh-a');

            library.ingestBatchHistoryEntry({
                id: 'job-ab-1',
                task: 'dual',
                options: { task: 'dual', engineAsrModel: 'sensevoice-small', sakuraMt: true },
                outputs: [{
                    videoPath,
                    sourceSubtitlePath: src,
                    targetSubtitlePath: zh,
                    status: 'done',
                }],
            }, { root, libraryPro: true });

            writeSrt(zh, 'zh-b');
            library.ingestBatchHistoryEntry({
                id: 'job-ab-2',
                task: 'dual',
                options: { task: 'dual', engineAsrModel: 'sensevoice-small', engineOpusMtModel: 'opus-ja-zh' },
                outputs: [{
                    videoPath,
                    sourceSubtitlePath: src,
                    targetSubtitlePath: zh,
                    status: 'done',
                }],
            }, { root, libraryPro: true });

            const list = library.listMediaSummaries({ root });
            const detail = library.getMediaDetail(list.items[0].id, { root });
            const target = detail.tracks.find((t) => t.role === 'target');
            assert.ok(target.versions.length >= 2);
            const vA = target.versions[target.versions.length - 1];
            const vB = target.versions[0];

            const noteRes = library.setVersionNote(vA.id, '偏软向译法', { root });
            assert.strictEqual(noteRes.ok, true);
            assert.strictEqual(noteRes.version.note, '偏软向译法');

            const tagA = library.setVersionAbTag(vA.id, '对照A', { root, requirePro: false });
            assert.strictEqual(tagA.ok, true);
            const tagB = library.setVersionAbTag(vB.id, '对照B', { root, requirePro: false });
            assert.strictEqual(tagB.ok, true);

            // Exclusive: second 对照A moves off vA
            const tagA2 = library.setVersionAbTag(vB.id, '对照A', { root, requirePro: false });
            assert.strictEqual(tagA2.ok, true);
            const after = library.getMediaDetail(list.items[0].id, { root });
            const target2 = after.tracks.find((t) => t.role === 'target');
            const taggedA = target2.versions.filter((v) => v.tags?.includes('对照A'));
            assert.strictEqual(taggedA.length, 1);
            assert.strictEqual(taggedA[0].id, vB.id);
            assert.ok(!taggedA[0].tags.includes('对照B'));

            // Restore proper A/B for train prepare
            library.setVersionAbTag(vA.id, '对照A', { root, requirePro: false });
            library.setVersionAbTag(vB.id, '对照B', { root, requirePro: false });
            const openedB = library.openVersionPaths(vB.id, { root });
            assert.strictEqual(openedB.ok, true);
            assert.strictEqual(openedB.abPairAvailable, true);
            assert.strictEqual(openedB.abVersionIdA, vA.id);
            assert.strictEqual(openedB.abVersionIdB, vB.id);
            assert.strictEqual(openedB.library.abVersionIdA, vA.id);
            const train = library.prepareLibraryMtTrainPair(list.items[0].id, {
                root,
                requirePro: false,
            });
            assert.strictEqual(train.ok, true);
            assert.ok(fs.existsSync(train.jaPath));
            assert.ok(fs.existsSync(train.zhPath));
            assert.ok(train.hasAbPair);
            assert.ok(train.zhPathB);

            const exclusive = core.applyExclusiveAbTag(
                [{ id: 'x', tags: ['对照A', 'foo'] }, { id: 'y', tags: ['对照B'] }],
                'x',
                '对照B',
            );
            assert.ok(exclusive.ok);
            assert.deepStrictEqual(exclusive.version.tags.sort(), ['foo', '对照B'].sort());
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
            fs.rmSync(mediaDir, { recursive: true, force: true });
        }
    });

    it('associates task media by default and supports rebind / auto-link', () => {
        const root = makeTempDir('transub-lib-media-link-');
        const mediaDir = makeTempDir('transub-lib-media-link-media-');
        try {
            const videoPath = path.join(mediaDir, 'movie.mp4');
            const otherVideo = path.join(mediaDir, 'other.mp4');
            fs.writeFileSync(videoPath, 'fake');
            fs.writeFileSync(otherVideo, 'fake2');
            const src = path.join(mediaDir, 'movie.ja.srt');
            const zh = path.join(mediaDir, 'movie.zh.srt');
            writeSrt(src, 'ja');
            writeSrt(zh, 'zh');

            library.ingestBatchHistoryEntry({
                id: 'job-media-link',
                task: 'dual',
                options: { task: 'dual', language: 'ja' },
                outputs: [{
                    videoPath,
                    sourceSubtitlePath: src,
                    targetSubtitlePath: zh,
                    status: 'done',
                }],
            }, { root, libraryPro: true });

            const list = library.listMediaSummaries({ root });
            assert.strictEqual(list.items[0].mediaLinked, true);
            assert.strictEqual(list.items[0].mediaExists, true);
            assert.strictEqual(path.resolve(list.items[0].path), path.resolve(videoPath));

            const mediaId = list.items[0].id;
            const rebound = library.setMediaAssociation(mediaId, otherVideo, { root });
            assert.strictEqual(rebound.ok, true);
            assert.strictEqual(path.resolve(rebound.media.path), path.resolve(otherVideo));
            assert.strictEqual(rebound.media.id, mediaId);

            const cleared = library.setMediaAssociation(mediaId, '', { root, clear: true });
            assert.strictEqual(cleared.ok, true);
            assert.strictEqual(cleared.media.mediaLinked, false);

            const auto = library.autoLinkMediaAssociation(mediaId, { root });
            assert.strictEqual(auto.ok, true);
            assert.ok(auto.media.mediaExists);
            assert.ok(
                path.resolve(auto.media.path) === path.resolve(videoPath)
                || path.resolve(auto.media.path) === path.resolve(otherVideo),
            );

            const clash = library.setMediaAssociation(mediaId, auto.media.path, { root });
            // same media re-set same path is fine
            assert.strictEqual(clash.ok, true);

            library.setMediaAssociation(mediaId, '', { root, clear: true });
            const batch = library.autoLinkMediaBatch([mediaId], { root, onlyUnlinkedOrMissing: true });
            assert.strictEqual(batch.ok, true);
            assert.ok(batch.linked >= 1);

            const detail = library.getMediaDetail(mediaId, { root });
            const openVer = detail.tracks
                .flatMap((t) => t.versions)
                .find((v) => v.isActive)?.id;
            assert.ok(openVer);
            library.setMediaAssociation(mediaId, '', { root, clear: true });
            const opened = library.openVersionPaths(openVer, { root, autoLinkIfMissing: true });
            assert.strictEqual(opened.ok, true);
            assert.ok(opened.videoPath);
            assert.ok(opened.mediaLinkedOnOpen);
            assert.ok(fs.existsSync(opened.videoPath));

            // Stale catalog path (missing file) should also relink on open.
            const stale = path.join(mediaDir, 'missing-stale.mp4');
            library.setMediaAssociation(mediaId, otherVideo, { root });
            // Point catalog at a non-existent path without going through setMediaAssociation validation.
            const catalogPath = path.join(root, 'subtitle-library', 'catalog.json');
            const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
            const mediaRow = catalog.media.find((m) => m.id === mediaId);
            mediaRow.path = stale;
            mediaRow.pathKey = stale.toLowerCase();
            fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));
            const openedStale = library.openVersionPaths(openVer, { root, autoLinkIfMissing: true });
            assert.strictEqual(openedStale.ok, true);
            assert.ok(openedStale.mediaLinkedOnOpen, 'stale missing path should auto-relink');
            assert.ok(fs.existsSync(openedStale.videoPath));
            assert.notStrictEqual(path.resolve(openedStale.videoPath), path.resolve(stale));
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
            fs.rmSync(mediaDir, { recursive: true, force: true });
        }
    });

    it('ingests source track from transcript-keep when sidecar is missing', () => {
        const root = makeTempDir('transub-lib-keep-src-');
        const mediaDir = makeTempDir('transub-lib-keep-src-media-');
        const keepDir = makeTempDir('transub-lib-keep-src-keep-');
        try {
            const videoPath = path.join(mediaDir, 'clip.mp4');
            fs.writeFileSync(videoPath, 'fake');
            const keptSrc = path.join(keepDir, 'clip.src.srt');
            const zh = path.join(mediaDir, 'clip.zh.srt');
            writeSrt(keptSrc, 'asr-line');
            writeSrt(zh, 'zh-line');

            const res = library.ingestBatchHistoryEntry({
                id: 'job-keep-src',
                task: 'dual',
                options: {
                    task: 'dual',
                    language: 'ja',
                    transcriptKeepDir: keepDir,
                },
                outputs: [{
                    videoPath,
                    // Sidecar deleted after merge — only ZH remains for history
                    sourceSubtitlePath: '',
                    targetSubtitlePath: zh,
                    status: 'done',
                }],
            }, { root, libraryPro: true });
            assert.strictEqual(res.ok, true);
            assert.ok(res.ingested >= 2, `expected source+target ingest, got ${res.ingested}`);

            const list = library.listMediaSummaries({ root });
            assert.ok(list.items[0].sourceVersionCount >= 1);
            assert.ok(list.items[0].sourceCueCount >= 1);
            const detail = library.getMediaDetail(list.items[0].id, { root });
            const source = detail.tracks.find((t) => t.role === 'source');
            assert.ok(source, 'source/transcript track should exist');
            assert.strictEqual(core.roleLabel('source'), '转录');
            assert.ok(source.versions.some((v) => v.isActive));
            const target = detail.tracks.find((t) => t.role === 'target');
            assert.ok(target?.versions?.[0]?.bindingSourceVersionId);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
            fs.rmSync(mediaDir, { recursive: true, force: true });
            fs.rmSync(keepDir, { recursive: true, force: true });
        }
    });

    it('archives and deletes versions with blob GC', () => {
        const root = makeTempDir('transub-lib-del-');
        const mediaDir = makeTempDir('transub-lib-del-media-');
        try {
            const videoPath = path.join(mediaDir, 'gone.mp4');
            fs.writeFileSync(videoPath, 'fake');
            const zh = path.join(mediaDir, 'gone.zh.srt');
            writeSrt(zh, 'keep-me');
            library.ingestBatchHistoryEntry({
                id: 'job-del-1',
                task: 'translate',
                options: { task: 'translate' },
                outputs: [{ videoPath, subtitlePath: zh, status: 'done' }],
            }, { root, libraryPro: true });

            writeSrt(zh, 'drop-me');
            library.ingestBatchHistoryEntry({
                id: 'job-del-2',
                task: 'translate',
                options: { task: 'translate' },
                outputs: [{ videoPath, subtitlePath: zh, status: 'done' }],
            }, { root, libraryPro: true });

            const list = library.listMediaSummaries({ root });
            const detail = library.getMediaDetail(list.items[0].id, { root });
            const target = detail.tracks.find((t) => t.role === 'target');
            const active = target.versions.find((v) => v.isActive);
            const older = target.versions.find((v) => !v.isActive);
            assert.ok(active && older);

            const blocked = library.deleteVersion(active.id, { root });
            assert.strictEqual(blocked.ok, false);

            const archived = library.setVersionStatus(older.id, 'archived', { root, requirePro: false });
            assert.strictEqual(archived.ok, true);
            assert.strictEqual(archived.version.status, 'archived');

            const blobAbs = path.join(root, 'subtitle-library', older.contentRef);
            assert.ok(fs.existsSync(blobAbs));
            const deleted = library.deleteVersion(older.id, { root });
            assert.strictEqual(deleted.ok, true);
            assert.ok(!fs.existsSync(blobAbs));

            const after = library.getMediaDetail(list.items[0].id, { root });
            const target2 = after.tracks.find((t) => t.role === 'target');
            assert.ok(!target2.versions.some((v) => v.id === older.id));
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
            fs.rmSync(mediaDir, { recursive: true, force: true });
        }
    });

    it('opens version with library session and supports draft ingest without stealing active', () => {
        const root = makeTempDir('transub-lib-session-');
        const mediaDir = makeTempDir('transub-lib-session-media-');
        try {
            const videoPath = path.join(mediaDir, 'bind.mp4');
            fs.writeFileSync(videoPath, 'fake');
            const zh = path.join(mediaDir, 'bind.zh.srt');
            writeSrt(zh, 'v1');
            library.ingestBatchHistoryEntry({
                id: 'job-session-1',
                task: 'translate',
                options: { task: 'translate', engineOpusMtModel: 'opus-ja-zh' },
                outputs: [{ videoPath, subtitlePath: zh, status: 'done' }],
            }, { root, libraryPro: true });

            const list = library.listMediaSummaries({ root });
            const mediaId = list.items[0].id;
            const detail = library.getMediaDetail(mediaId, { root });
            const target = detail.tracks.find((t) => t.role === 'target');
            const activeId = target.activeVersionId;
            assert.ok(activeId);

            const opened = library.openVersionPaths(activeId, { root });
            assert.strictEqual(opened.ok, true);
            assert.strictEqual(opened.versionId, activeId);
            assert.strictEqual(opened.mediaId, mediaId);
            assert.strictEqual(opened.trackId, target.id);
            assert.ok(opened.library?.versionId);
            assert.strictEqual(opened.isActive, true);
            assert.ok(opened.recipeSummary);
            assert.strictEqual(opened.mediaLinked, true);
            assert.strictEqual(opened.mediaExists, true);
            assert.strictEqual(opened.library.mediaLinked, true);
            assert.strictEqual(opened.library.mediaExists, true);

            writeSrt(zh, 'draft-edit');
            const draft = library.ingestEditedSubtitle({
                subtitlePath: zh,
                videoPath,
                root,
                parentVersionId: activeId,
                setActive: false,
                note: '草稿',
            });
            assert.strictEqual(draft.ok, true);
            assert.ok(draft.version.parentVersionId === activeId);
            assert.notStrictEqual(draft.track.activeVersionId, draft.version.id, 'draft return track must keep prior active');
            const after = library.getMediaDetail(mediaId, { root });
            const target2 = after.tracks.find((t) => t.role === 'target');
            assert.strictEqual(target2.activeVersionId, activeId, 'draft must not steal active');
            assert.ok(target2.versions.some((v) => v.id === draft.version.id));

            // Same content as active → skip; catalog active stays prior (UI setActive must use catalog truth).
            writeSrt(zh, 'v1');
            const dup = library.ingestEditedSubtitle({
                subtitlePath: zh,
                videoPath,
                root,
                parentVersionId: activeId,
                setActive: false,
                note: '草稿',
            });
            assert.strictEqual(dup.ok, true);
            assert.ok(dup.skipped);
            assert.strictEqual(dup.track.activeVersionId, activeId);
            assert.strictEqual(dup.version.id, activeId);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
            fs.rmSync(mediaDir, { recursive: true, force: true });
        }
    });

    it('renames media title, enriches search, and exposes limit/status hints', () => {
        const root = makeTempDir('transub-lib-ux-');
        const mediaDir = makeTempDir('transub-lib-ux-media-');
        try {
            const videoPath = path.join(mediaDir, 'SSIS-999-sample.mp4');
            fs.writeFileSync(videoPath, 'fake');
            const src = path.join(mediaDir, 'SSIS-999-sample.ja.srt');
            const zh = path.join(mediaDir, 'SSIS-999-sample.zh.srt');
            writeSrt(src, 'ja');
            writeSrt(zh, 'zh');

            library.ingestBatchHistoryEntry({
                id: 'job-ux-1',
                task: 'dual',
                options: { task: 'dual', language: 'ja' },
                outputs: [{
                    videoPath,
                    sourceSubtitlePath: src,
                    targetSubtitlePath: zh,
                    status: 'done',
                }],
            }, { root, libraryPro: false });

            const list0 = library.listMediaSummaries({ root });
            const mediaId = list0.items[0].id;
            assert.ok(list0.items[0].statusHints);
            assert.strictEqual(list0.items[0].statusHints.mediaUnlinked, false);
            assert.ok(list0.items[0].canOpenPreferred);
            assert.ok(list0.items[0].maxVersionsPerTrack >= 3);

            const byCode = library.listMediaSummaries({ root, query: 'SSIS-999' });
            assert.ok(byCode.items.some((m) => m.id === mediaId), 'search should match filename stem');

            const byLang = library.listMediaSummaries({ root, query: 'ja→zh' });
            assert.ok(byLang.items.some((m) => m.id === mediaId), 'search should match lang pair');

            const renamed = library.renameMediaTitle(mediaId, '自定义片名', { root });
            assert.strictEqual(renamed.ok, true);
            assert.strictEqual(renamed.media.title, '自定义片名');
            assert.strictEqual(renamed.media.titleCustom, true);

            const byTitle = library.listMediaSummaries({ root, query: '自定义' });
            assert.ok(byTitle.items.some((m) => m.id === mediaId));

            // Rebind should keep custom title
            const other = path.join(mediaDir, 'other-clip.mp4');
            fs.writeFileSync(other, 'x');
            const set = library.setMediaAssociation(mediaId, other, { root });
            assert.strictEqual(set.ok, true);
            const afterLink = library.getMediaDetail(mediaId, { root });
            assert.strictEqual(afterLink.media.title, '自定义片名');

            const detail = library.getMediaDetail(mediaId, { root });
            const target = detail.tracks.find((t) => t.role === 'target');
            assert.ok(target.limitHint);
            assert.ok(String(target.limitHint).includes('/'));
            assert.ok(detail.media.preferredOpenVersionId);

            library.setMediaAssociation(mediaId, '', { root, clear: true });
            // Remove sidecar-guessable AV so suggest fails with actionable hint
            try { fs.unlinkSync(videoPath); } catch { /* ignore */ }
            try { fs.unlinkSync(other); } catch { /* ignore */ }
            const suggestEmpty = library.suggestMediaAssociation(mediaId, { root });
            assert.strictEqual(suggestEmpty.ok, false);
            assert.ok(suggestEmpty.canPick);
            assert.ok(suggestEmpty.hint);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
            fs.rmSync(mediaDir, { recursive: true, force: true });
        }
    });
});
