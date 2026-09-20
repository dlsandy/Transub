const assert = require('assert');
const paths = require('../src/js/item-posttask-paths-core');
const progress = require('../src/js/per-item-qc-pipeline-core');
const handoff = require('../electron/engine-item-posttask-handoff');

describe('item-posttask-paths-core', () => {
    it('collectPostBatchPaths dedupes target + bilingual', () => {
        const list = paths.collectPostBatchPaths({
            targetSubtitlePath: 'a.zh.srt',
            bilingualSubtitlePath: 'a.srt',
        });
        assert.deepStrictEqual(list, ['a.zh.srt', 'a.srt']);
    });

    it('resolveQcSemanticPairPath prefers JA sidecar for ZH fix path', () => {
        const pair = paths.resolveQcSemanticPairPath({
            sourceSubtitlePath: 'a.ja.srt',
            targetSubtitlePath: 'a.zh.srt',
        }, 'a.zh.srt');
        assert.strictEqual(pair, 'a.ja.srt');
    });
});

describe('per-item posttask progress', () => {
    it('maps polish/qc/finalize bands inside 95–100', () => {
        assert.strictEqual(progress.mapPostTaskProgress('polish', 0), 95);
        assert.strictEqual(progress.mapPostTaskProgress('polish', 100), 98);
        assert.ok(progress.mapPostTaskProgress('qc', 50) >= 98);
        assert.strictEqual(progress.mapPostTaskProgress('preset', 100), 100);
    });

    it('shouldRunItemPostTask when any step enabled', () => {
        assert.strictEqual(progress.shouldRunItemPostTask({ hasSubtitle: true }), false);
        assert.strictEqual(progress.shouldRunItemPostTask({
            hasSubtitle: true,
            qcScanEnabled: true,
        }), true);
        assert.strictEqual(progress.shouldRunItemPostTask({
            hasSubtitle: true,
            chineseVariant: 'traditional',
        }), true);
        assert.strictEqual(progress.shouldRunItemPostTask({
            hasSubtitle: true,
            insertSoftwareCredit: true,
        }), true);
    });
});

describe('engine-item-posttask-handoff', () => {
    it('buildItemRecord copies output paths', () => {
        const item = handoff.buildItemRecord({
            subtitlePath: 'out.srt',
            sourceSubtitlePath: 'out.ja.srt',
            bilingualSubtitlePath: 'dual.srt',
        }, 'video.mp4');
        assert.strictEqual(item.path, 'video.mp4');
        assert.strictEqual(item.subtitlePath, 'out.srt');
        assert.strictEqual(item.bilingualSubtitlePath, 'dual.srt');
    });

    it('scanDocIssueCount uses post-batch defaults (not legacy fluency-off)', () => {
        const touching = [
            { startMs: 0, endMs: 2000, text: 'first line ok' },
            { startMs: 2000, endMs: 4000, text: 'second line ok' },
        ];
        const doc = { ok: true, cues: touching };
        const legacyOff = handoff.scanDocIssueCount(doc, { checkFluency: false, gapMs: 0 });
        const aligned = handoff.scanDocIssueCount(doc);
        assert.strictEqual(legacyOff, 0);
        assert.ok(aligned >= 1);
    });

    it('shouldSkipFakeGreetingForMt when smart translate enabled', () => {
        assert.strictEqual(handoff.shouldSkipFakeGreetingForMt({ smartTranslate: true }), true);
        assert.strictEqual(handoff.shouldSkipFakeGreetingForMt({ translateMode: 'smart' }), true);
        assert.strictEqual(handoff.shouldSkipFakeGreetingForMt({ contentProfile: 'av_soft' }), false);
    });

    it('resolveCreditLangForPath uses source language for 原文 track', () => {
        const item = {
            sourceSubtitlePath: 'F:/out/a.ja.srt',
            bilingualSubtitlePath: 'F:/out/a.dual.srt',
            subtitlePath: 'F:/out/a.zh.srt',
        };
        assert.strictEqual(
            handoff.resolveCreditLangForPath('F:/out/a.ja.srt', item, { language: 'ja' }),
            'ja',
        );
        assert.strictEqual(
            handoff.resolveCreditLangForPath('F:/out/a.ja.srt', item, { language: 'ko' }),
            'ko',
        );
        assert.strictEqual(
            handoff.resolveCreditLangForPath('F:/out/a.ja.srt', item, { language: 'en' }),
            'en',
        );
        assert.strictEqual(
            handoff.resolveCreditLangForPath('F:/out/a.zh.srt', item, { language: 'ja' }),
            'zh',
        );
        assert.strictEqual(
            handoff.resolveCreditLangForPath('F:/out/a.dual.srt', item, {
                language: 'ja',
                mergeBilingualSubtitles: true,
            }),
            'bilingual',
        );
        assert.strictEqual(
            handoff.resolveCreditLangForPath('F:/out/clip.ko.srt', {}, { language: 'auto' }),
            'ko',
        );
        // Shelf 原文 sidecar is not item.sourceSubtitlePath — still JA watermark.
        assert.strictEqual(
            handoff.resolveCreditLangForPath(
                'F:/Transub3/subtitles/clip.original.srt',
                item,
                { language: 'ja' },
            ),
            'ja',
        );
        assert.strictEqual(
            handoff.isSourceTrackSubtitlePath('F:/Transub3/subtitles/clip.original.srt', item),
            true,
        );
        assert.strictEqual(
            handoff.isSourceTrackSubtitlePath('F:/Transub3/subtitles/clip.transcribe.srt', {}),
            true,
        );
    });

    it('runItemPostTaskHandoff returns cancelled when shouldStop', async () => {
        const res = await handoff.runItemPostTaskHandoff({
            mediaPath: 'video.mp4',
            outPaths: { subtitlePath: 'a.zh.srt', sourceSubtitlePath: 'a.ja.srt' },
            options: { task: 'translate' },
            shouldStop: () => true,
        });
        assert.strictEqual(res.cancelled, true);
        assert.strictEqual(res.code, 'cancelled');
    });

    it('runItemPostTaskHandoff returns cancelled when abort signal aborted', async () => {
        const ctrl = new AbortController();
        ctrl.abort();
        const res = await handoff.runItemPostTaskHandoff({
            mediaPath: 'video.mp4',
            outPaths: { subtitlePath: 'a.zh.srt' },
            signal: ctrl.signal,
        });
        assert.strictEqual(res.cancelled, true);
    });
});
