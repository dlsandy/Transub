const assert = require('assert');
const dual = require('../src/js/dual-subtitle-core');
const { pickPreferredSidecar } = require('../electron/subtitle-utils');
const { normalizeTransWithAiRuntimeOptions } = require('../electron/transwithai-bridge');

describe('dual-subtitle-core', () => {
    it('resolves source suffix and avoids zh/zh collision', () => {
        assert.strictEqual(dual.resolveDualSourceSuffix('ja'), 'ja');
        assert.strictEqual(dual.resolveDualSourceSuffix('en'), 'en');
        assert.strictEqual(dual.resolveDualSourceSuffix('auto'), 'source');
        assert.strictEqual(dual.resolveDualSourceSuffix('zh'), 'source');
        assert.strictEqual(dual.resolveDualSourceSuffix('zh', 'zh'), 'source');
    });

    it('infers dual role and pair suffix', () => {
        const src = dual.inferDualRole('demo.ja', 'demo', { sourceSuffix: 'ja', targetSuffix: 'zh' });
        assert.strictEqual(src.role, 'source');
        assert.strictEqual(src.pairSuffix, 'zh');

        const tgt = dual.inferDualRole('demo.zh', 'demo', { sourceSuffix: 'ja', targetSuffix: 'zh' });
        assert.strictEqual(tgt.role, 'target');
        assert.strictEqual(tgt.pairSuffix, 'ja');
    });

    it('finds best overlap cue', () => {
        const cues = [
            { startMs: 0, endMs: 1000, text: 'a' },
            { startMs: 900, endMs: 2000, text: 'b' },
            { startMs: 3000, endMs: 4000, text: 'c' },
        ];
        const hit = dual.findBestOverlapCue(cues, 950, 1500);
        assert.strictEqual(hit.cue.text, 'b');
        assert.ok(hit.overlapMs > 0);
        assert.strictEqual(hit.match, 'overlap');

        const near = dual.findBestOverlapCue(cues, 2500, 2800);
        assert.strictEqual(near.cue.text, 'c');
        assert.strictEqual(near.match, 'nearest');

        const miss = dual.findBestOverlapCue(cues, 2500, 2800, { maxStartGapMs: 100 });
        assert.strictEqual(miss.cue, null);
        assert.strictEqual(miss.match, 'none');
    });

    it('lists pair suffix candidates for zh primary', () => {
        const fromTarget = dual.listPairSuffixCandidates('target', 'source');
        assert.deepStrictEqual(fromTarget, ['source', 'ja', 'en']);
        const fromJaPreferred = dual.listPairSuffixCandidates('target', 'ja');
        assert.strictEqual(fromJaPreferred[0], 'ja');
        assert.ok(fromJaPreferred.includes('source'));
    });

    it('finds complementary sidecar among language-tagged files', () => {
        const hit = dual.findComplementarySidecarPath(
            'D:/v/demo.zh.srt',
            'demo',
            [
                { path: 'D:/v/demo.zh.srt', editable: true },
                { path: 'D:/v/demo.ja.srt', editable: true },
            ],
            { primaryRole: 'target', preferredPairSuffix: 'source' },
        );
        assert.ok(String(hit).toLowerCase().endsWith('demo.ja.srt'));
    });

    it('composes overlay text by display mode', () => {
        const both = dual.composeDualOverlayText({
            primaryText: '你好',
            pairedText: 'Hello',
            primaryRole: 'target',
            displayMode: 'both',
        });
        assert.strictEqual(both.sourceText, 'Hello');
        assert.strictEqual(both.targetText, '你好');
        assert.strictEqual(both.visible, true);

        const onlySrc = dual.composeDualOverlayText({
            primaryText: '你好',
            pairedText: 'Hello',
            primaryRole: 'target',
            displayMode: 'source',
        });
        assert.strictEqual(onlySrc.targetText, '');
        assert.strictEqual(onlySrc.sourceText, 'Hello');
    });

    it('maps dual pass progress', () => {
        assert.strictEqual(dual.mapDualPassProgress(0, 0), 0);
        assert.strictEqual(dual.mapDualPassProgress(0, 100), 48);
        assert.strictEqual(dual.mapDualPassProgress(1, 0), 50);
        assert.strictEqual(dual.mapDualPassProgress(1, 100), 98);
    });

    it('builds merged bilingual cues', () => {
        const primary = [
            { startMs: 0, endMs: 1000, text: '你好' },
            { startMs: 2000, endMs: 3000, text: '世界' },
        ];
        const pair = [
            { startMs: 0, endMs: 1100, text: 'Hello' },
            { startMs: 1900, endMs: 3100, text: 'World' },
        ];
        const merged = dual.buildMergedDualCues(primary, pair, { primaryRole: 'target' });
        assert.strictEqual(merged.length, 2);
        assert.strictEqual(merged[0].text, 'Hello\n你好');
        assert.strictEqual(merged[1].text, 'World\n世界');
        assert.strictEqual(dual.suggestMergedExportName('D:/x/demo.zh.srt'), 'demo.bilingual.srt');
        assert.strictEqual(
            dual.suggestMergedExportName('D:/x/demo.zh.srt', { asVideoName: true }),
            'demo.srt',
        );

        const targetFirst = dual.buildMergedDualCues(primary, pair, {
            primaryRole: 'target',
            order: 'target-first',
        });
        assert.strictEqual(targetFirst[0].text, '你好\nHello');
    });

    it('normalizes line order and composes overlay top/bottom', () => {
        assert.strictEqual(dual.normalizeDualLineOrder('target-first'), 'target-first');
        assert.strictEqual(dual.normalizeDualLineOrder('target'), 'target-first');
        assert.strictEqual(dual.normalizeDualLineOrder(''), 'source-first');

        const composed = dual.composeDualOverlayText({
            primaryText: '你好',
            pairedText: 'Hello',
            primaryRole: 'target',
            displayMode: 'both',
            lineOrder: 'target-first',
        });
        assert.strictEqual(composed.topText, '你好');
        assert.strictEqual(composed.bottomText, 'Hello');
        assert.strictEqual(composed.sourceText, 'Hello');
        assert.strictEqual(composed.targetText, '你好');
    });
});

describe('normalize dual task options', () => {
    it('accepts dual task and dual display defaults', () => {
        const opts = normalizeTransWithAiRuntimeOptions({ task: 'dual', language: 'ja' });
        assert.strictEqual(opts.task, 'dual');
        assert.strictEqual(opts.dualTargetSuffix, 'zh');
        assert.strictEqual(opts.dualPrimaryTrack, 'target');
        assert.strictEqual(opts.dualDisplayMode, 'both');
        assert.strictEqual(opts.mergeBilingualSubtitles, false);
        assert.strictEqual(opts.deleteSourcesAfterMergeBilingual, false);
    });

    it('enables merge bilingual only for dual task', () => {
        const dual = normalizeTransWithAiRuntimeOptions({
            task: 'dual',
            mergeBilingualSubtitles: true,
        });
        assert.strictEqual(dual.mergeBilingualSubtitles, true);
        assert.strictEqual(dual.deleteSourcesAfterMergeBilingual, false);
        const translate = normalizeTransWithAiRuntimeOptions({
            task: 'translate',
            mergeBilingualSubtitles: true,
            deleteSourcesAfterMergeBilingual: true,
        });
        assert.strictEqual(translate.mergeBilingualSubtitles, false);
        assert.strictEqual(translate.deleteSourcesAfterMergeBilingual, false);
    });

    it('enables delete sources after merge only when merge bilingual is on', () => {
        const withDelete = normalizeTransWithAiRuntimeOptions({
            task: 'dual',
            mergeBilingualSubtitles: true,
            deleteSourcesAfterMergeBilingual: true,
        });
        assert.strictEqual(withDelete.deleteSourcesAfterMergeBilingual, true);
        const withoutMerge = normalizeTransWithAiRuntimeOptions({
            task: 'dual',
            mergeBilingualSubtitles: false,
            deleteSourcesAfterMergeBilingual: true,
        });
        assert.strictEqual(withoutMerge.deleteSourcesAfterMergeBilingual, false);
    });
});

describe('pickPreferredSidecar', () => {
    it('prefers zh target over ja source when both exist', () => {
        const picked = pickPreferredSidecar([
            'D:/v/demo.ja.srt',
            'D:/v/demo.zh.srt',
        ]);
        assert.ok(String(picked).toLowerCase().endsWith('demo.zh.srt'));
    });
});
