const assert = require('assert');
const blankRetry = require('../electron/engine-blank-mt-retry');

describe('engine-blank-mt-retry', () => {
    it('collectBlankRetranslatePairs finds ellipsis and JA leaks', () => {
        const ja = [
            { index: 1, startMs: 0, endMs: 2000, text: 'うちの会社さ' },
            { index: 2, startMs: 2000, endMs: 4000, text: 'おはようございます' },
        ];
        const zh = [
            { index: 1, startMs: 0, endMs: 2000, text: '…' },
            { index: 2, startMs: 2000, endMs: 4000, text: '早上好' },
        ];
        const { pairs } = blankRetry.collectBlankRetranslatePairs(zh, ja);
        assert.strictEqual(pairs.length, 1);
        assert.strictEqual(pairs[0].index, 1);
        assert.strictEqual(pairs[0].sourceText, 'うちの会社さ');
    });

    it('collectBlankRetranslatePairs includes Hy-MT quality misses when enabled', () => {
        const ja = [
            { index: 1, startMs: 0, endMs: 2000, text: 'うん' },
            { index: 2, startMs: 2000, endMs: 4000, text: 'おはようございます' },
        ];
        const zh = [
            {
                index: 1,
                startMs: 0,
                endMs: 2000,
                text: '检查室里发生的一切都是我的错，请原谅老师和同学们',
            },
            { index: 2, startMs: 2000, endMs: 4000, text: '早上好' },
        ];
        const without = blankRetry.collectBlankRetranslatePairs(zh, ja);
        assert.strictEqual(without.pairs.length, 0);
        const withQ = blankRetry.collectBlankRetranslatePairs(zh, ja, { includeHyMtQuality: true });
        assert.ok(withQ.pairs.length >= 1);
        assert.strictEqual(withQ.pairs[0].index, 1);
        assert.ok(Array.isArray(withQ.pairs[0].qualityReasons));
        assert.ok(withQ.pairs[0].qualityReasons.length);
    });

    it('blankRetryCollectOptions enables quality for Hy-MT models', () => {
        assert.strictEqual(
            blankRetry.blankRetryCollectOptions({ hybridMtModelId: 'hy-mt2-7b' }).includeHyMtQuality,
            true,
        );
        assert.strictEqual(
            blankRetry.blankRetryCollectOptions({ engineMtModel: 'opus-mt-ja-zh' }).includeHyMtQuality,
            false,
        );
        assert.strictEqual(
            blankRetry.blankRetryCollectOptions({
                hybridMtModelId: 'hy-mt2-7b',
                subtitleTargetLang: 'en',
            }).includeHyMtQuality,
            false,
        );
    });

    it('resolveBlankRetryMtMode prefers smart translate', () => {
        assert.strictEqual(blankRetry.resolveBlankRetryMtMode({ smartTranslate: true }), 'smart');
        assert.strictEqual(blankRetry.resolveBlankRetryMtMode({ translateMode: 'smart' }), 'smart');
        assert.strictEqual(blankRetry.resolveBlankRetryMtMode({ translateMode: 'dialog' }), 'smart');
        assert.strictEqual(blankRetry.resolveBlankRetryMtMode({ engineMtModel: 'opus-mt-ja-zh' }), 'sakura');
        assert.strictEqual(blankRetry.resolveBlankRetryMtMode({ engineLlmMtModel: 'hy-mt2-7b' }), 'sakura');
    });

    it('dialog blank retry prefers sentence specialist when hybrid/smart id is set', () => {
        assert.strictEqual(blankRetry.isDialogBlankRetry({ translateMode: 'dialog' }), true);
        assert.strictEqual(blankRetry.isDialogBlankRetry({ translateMode: 'smart' }), false);
        // Lite/hybrid sentence id wins even if translateMode still says dialog.
        assert.strictEqual(
            blankRetry.shouldPreferSakuraBlankRetry({
                translateMode: 'dialog',
                smartTranslate: true,
                hybridMtModelId: 'hy-mt2-7b',
                engineLlmMtModel: 'sakura-galtransl-7b',
            }),
            true,
        );
        assert.strictEqual(
            blankRetry.shouldPreferSakuraBlankRetry({
                translateMode: 'dialog',
                smartTranslate: true,
                smartTranslateModelId: 'sakura-galtransl-7b-q6k',
            }),
            true,
        );
        // Pure dialog with only a leftover engine Sakura id must stay on chat path.
        assert.strictEqual(
            blankRetry.shouldPreferSakuraBlankRetry({
                translateMode: 'dialog',
                smartTranslate: true,
                engineLlmMtModel: 'sakura-galtransl-7b',
            }),
            false,
        );
        assert.strictEqual(
            blankRetry.shouldPreferSakuraBlankRetry({
                translateMode: 'smart',
                smartTranslate: true,
                hybridMtModelId: 'hy-mt2-7b',
            }),
            true,
        );
    });

    it('seedBlankRetrySentenceModelFromManaged reads nested readAdvancedDoc().doc', () => {
        // Without options.hybrid/smart id, seed must unwrap { doc: { managedLlm } }.
        const seeded = blankRetry.seedBlankRetrySentenceModelFromManaged({
            translateMode: 'dialog',
            smartTranslate: true,
        });
        // If Advanced settings have GalTransl as smartTranslateModelId, seed injects it.
        // When absent in this test env, function is still callable and returns an object.
        assert.ok(seeded && typeof seeded === 'object');
        if (seeded.smartTranslateModelId || seeded.hybridMtModelId) {
            assert.strictEqual(
                blankRetry.shouldPreferSakuraBlankRetry(seeded),
                true,
            );
        }
    });

    it('blank retry prefers direct Hy-MT/Sakura over smart polish path', () => {
        assert.strictEqual(blankRetry.canBlankRetryViaSakura('hy-mt2-7b'), true);
        assert.strictEqual(blankRetry.canBlankRetryViaSakura('opus-mt-ja-zh'), false);
        assert.strictEqual(
            blankRetry.resolveBlankRetryLlmModelId({
                smartTranslate: true,
                hybridMtModelId: 'hy-mt2-7b',
                engineLlmMtModel: 'qwen25-7b',
            }),
            'hy-mt2-7b',
        );
        assert.strictEqual(
            blankRetry.resolveBlankRetryLlmModelId({
                smartTranslateModelId: 'sakura-galtransl-7b-q6k',
                engineLlmMtModel: 'qwen25-7b',
            }),
            'sakura-galtransl-7b-q6k',
        );
    });

    it('GalTransl/Sakura blank retry uses editor-parity neighbor JA window', () => {
        const gal = blankRetry.resolveEditorParitySakuraBlankOpts('sakura-galtransl-7b-q6k', 24);
        assert.strictEqual(gal.editorParity, true);
        assert.strictEqual(gal.windowLines, 8);
        assert.strictEqual(gal._blankRetry, false);
        assert.strictEqual(gal._skipBlankRetry, true);
        assert.strictEqual(gal.hyMtMinimalPrompt, false);
        const one = blankRetry.resolveEditorParitySakuraBlankOpts('sakura-galtransl-7b', 1);
        assert.strictEqual(one.windowLines, 8);
        const hy = blankRetry.resolveEditorParitySakuraBlankOpts('hy-mt2-7b', 12);
        assert.strictEqual(hy.editorParity, false);
        assert.strictEqual(hy.windowLines, 1);
        assert.strictEqual(hy._blankRetry, true);
    });

    it('clusterBlankPairsIntoJaWindows packs nearby blanks and splits far indexes', () => {
        const ja = Array.from({ length: 30 }, (_, i) => ({
            index: i,
            startMs: i * 1000,
            endMs: i * 1000 + 900,
            text: `ja-${i}`,
        }));
        const nearby = blankRetry.clusterBlankPairsIntoJaWindows(
            [
                { index: 4, sourceText: 'ja-4', zhCue: { startMs: 4000, endMs: 4900 } },
                { index: 6, sourceText: 'ja-6', zhCue: { startMs: 6000, endMs: 6900 } },
            ],
            ja,
            8,
        );
        assert.strictEqual(nearby.length, 1);
        assert.strictEqual(nearby[0].cues.length, 8);
        assert.ok(nearby[0].cues.some((c) => Number(c.index) === 4));
        assert.ok(nearby[0].cues.some((c) => Number(c.index) === 6));
        assert.ok(nearby[0].cues.some((c) => Number(c.index) === 5), 'contiguous neighbor JA');
        const far = blankRetry.clusterBlankPairsIntoJaWindows(
            [
                { index: 1, sourceText: 'ja-1', zhCue: {} },
                { index: 25, sourceText: 'ja-25', zhCue: {} },
            ],
            ja,
            8,
        );
        assert.strictEqual(far.length, 2);
        assert.ok(far[0].cues.length <= 8);
        assert.ok(far[1].cues.length <= 8);
        assert.ok(!far[0].cues.some((c) => Number(c.index) === 25));
    });

    it('mergeRetranslatedCues accepts real ZH when prior slot was literal ellipsis', () => {
        const mtSanitize = require('../src/js/mt-sanitize-core');
        const zhCues = [{ index: 1, startMs: 0, endMs: 2000, text: '…' }];
        const sourcePairs = [{ index: 1, sourceText: 'うちの会社さ', zhCue: zhCues[0] }];
        const merged = blankRetry.mergeRetranslatedCues(
            zhCues,
            [{ index: 1, text: '我们公司啊' }],
            sourcePairs,
            mtSanitize,
            { contentProfile: 'av_soft', skipFakeGreeting: true },
        );
        assert.strictEqual(merged.changed, 1);
        assert.strictEqual(merged.cues[0].text, '我们公司啊');
    });

    it('blank retry chat model skips GalTransl and does not use reconstruct activeModelId', () => {
        assert.strictEqual(
            blankRetry.resolveBlankRetryChatModelId({
                blankRetryChatModelId: 'qwen25-7b',
                smartTranslateModelId: 'sakura-galtransl-7b-q6k',
            }),
            'qwen25-7b',
        );
        assert.strictEqual(
            blankRetry.resolveBlankRetryChatModelId({
                smartTranslateModelId: 'qwen25-7b',
                engineLlmMtModel: 'sakura-galtransl-7b-q6k',
            }),
            'qwen25-7b',
        );
        assert.notStrictEqual(
            blankRetry.resolveBlankRetryChatModelId({
                activeModelId: 'qwen25-7b',
                engineLlmMtModel: 'sakura-galtransl-7b-q6k',
            }),
            'qwen25-7b',
            'must not use reconstruct activeModelId from options',
        );
        assert.strictEqual(
            blankRetry.resolveBlankRetryChatModelId({
                activeModelId: 'sakura-galtransl-7b-q6k',
            }) === 'sakura-galtransl-7b-q6k',
            false,
            'must not return GalTransl as chat model (empty or managed chat fallback OK)',
        );
    });

    it('mergeRetranslatedCues falls back to lexical recovery when MT still stubs', () => {
        const mtSanitize = require('../src/js/mt-sanitize-core');
        const zhCues = [{ index: 5, startMs: 1000, endMs: 3000, text: '哈 哈' }];
        const sourcePairs = [{ index: 5, sourceText: 'はぁ はぁ 楽しいうん', zhCue: zhCues[0] }];
        const merged = blankRetry.mergeRetranslatedCues(
            zhCues,
            [{ index: 5, text: '哈 哈' }],
            sourcePairs,
            mtSanitize,
            { contentProfile: 'av_soft', skipFakeGreeting: true },
        );
        assert.ok(merged?.cues?.[0]?.text?.includes('好开心'), merged?.cues?.[0]?.text);
    });

    it('mergeRetranslatedCues rejects Han fill for English target', () => {
        const mtSanitize = require('../src/js/mt-sanitize-core');
        const cues = [{ index: 1, startMs: 0, endMs: 1000, text: '…' }];
        const pairs = [{ index: 1, sourceText: 'でも', zhCue: cues[0] }];
        const merged = blankRetry.mergeRetranslatedCues(
            cues,
            [{ index: 1, text: '但是' }],
            pairs,
            mtSanitize,
            { subtitleTargetLang: 'en', targetLang: 'en' },
        );
        assert.strictEqual(merged.changed, 0);
        assert.strictEqual(merged.cues[0].text, '…');
    });

    it('mergeRetranslatedCues clears prior Han when English retry fails', () => {
        const mtSanitize = require('../src/js/mt-sanitize-core');
        const cues = [{ index: 1, startMs: 0, endMs: 1000, text: '好开心' }];
        const pairs = [{ index: 1, sourceText: '嬉しいうん', zhCue: cues[0] }];
        const merged = blankRetry.mergeRetranslatedCues(
            cues,
            [{ index: 1, text: '不行' }],
            pairs,
            mtSanitize,
            { subtitleTargetLang: 'en', targetLang: 'en' },
        );
        assert.ok(merged.changed >= 1);
        assert.strictEqual(merged.cues[0].text, '…');
    });

    it('collectBlankRetranslatePairs queues Han leak for English target', () => {
        const ja = [{ index: 1, startMs: 0, endMs: 2000, text: 'でも' }];
        const en = [{ index: 1, startMs: 0, endMs: 2000, text: '但是' }];
        const { pairs } = blankRetry.collectBlankRetranslatePairs(en, ja, {
            subtitleTargetLang: 'en',
            targetLang: 'en',
        });
        assert.strictEqual(pairs.length, 1);
        assert.strictEqual(pairs[0].index, 1);
    });

    it('resolveBlankMtRetryBudget tightens under speed profile', () => {
        const quality = blankRetry.resolveBlankMtRetryBudget({
            options: { perfProfile: 'quality' },
            isZhTarget: true,
        });
        assert.strictEqual(quality.maxRounds, 3);
        assert.strictEqual(quality.maxCuesPerRound, 128);
        assert.strictEqual(quality.allowPerCueFallback, true);
        assert.strictEqual(quality.maxPerCueFallback, 8);
        assert.strictEqual(quality.perCueOnlyAfterPartialRecover, true);
        assert.strictEqual(quality.windowLines, 1);
        assert.strictEqual(quality.hyMtBlankRetryBatch, 4);
        assert.strictEqual(quality.runEarlyBlankPass, false);

        const speed = blankRetry.resolveBlankMtRetryBudget({
            options: { perfProfile: 'speed' },
            isZhTarget: true,
        });
        assert.strictEqual(speed.maxRounds, 2);
        assert.strictEqual(speed.maxCuesPerRound, 64);
        assert.strictEqual(speed.allowPerCueFallback, false);
        assert.strictEqual(speed.maxPerCueFallback, 0);
        assert.strictEqual(speed.windowLines, 1);
        assert.strictEqual(speed.hyMtBlankRetryBatch, 1);
        assert.strictEqual(speed.stallRoundsLimit, 1);
        assert.strictEqual(speed.runEarlyBlankPass, false);
        assert.strictEqual(speed.runPostBatchBlankPass, true);
        assert.strictEqual(blankRetry.shouldRunEarlyBlankPass({ perfProfile: 'speed' }), false);
        assert.strictEqual(blankRetry.shouldRunEarlyBlankPass({ perfProfile: 'quality' }), false);
        assert.strictEqual(
            blankRetry.shouldSkipPostBatchBlankPass({ earlyLeft: 0, options: { perfProfile: 'quality' } }),
            true,
        );
        assert.strictEqual(
            blankRetry.shouldSkipPostBatchBlankPass({ earlyLeft: null, options: { perfProfile: 'quality' } }),
            false,
        );
        assert.deepStrictEqual(
            blankRetry.resolveSkipLlmBlankIndexes({ blankExhaustedIndexes: [3, 1, 3] }, [2]),
            [3, 1, 2],
        );
        assert.strictEqual(blankRetry.isSubstantialBlankSource('こんにちは世界'), true);
        assert.strictEqual(blankRetry.isSubstantialBlankSource('うん'), false);
        assert.strictEqual(blankRetry.isSubstantialBlankSource('…'), false);
    });

    it('explicit maxRounds caps dialogMode floor (QC loop must stay at 1)', () => {
        const policy = require('../src/js/blank-mt-retry-policy-core');
        const capped = policy.resolveBlankMtRetryBudget({
            options: {
                perfProfile: 'quality',
                translateMode: 'dialog',
                blankMtRetryMaxRounds: 1,
            },
            isZhTarget: true,
            maxRounds: 1,
        });
        assert.strictEqual(capped.maxRounds, 1);
        const dialogDefault = policy.resolveBlankMtRetryBudget({
            options: { perfProfile: 'quality', translateMode: 'dialog' },
            isZhTarget: true,
        });
        assert.ok(dialogDefault.maxRounds >= 4);
    });

    it('forceRetranslateOnly keeps QC loop pairs to planned indexes', () => {
        const ja = [
            { index: 1, startMs: 0, endMs: 1000, text: '明日は学校に行きます' },
            { index: 2, startMs: 1000, endMs: 2000, text: 'こんにちは、今日もよろしく' },
            { index: 3, startMs: 2000, endMs: 3000, text: 'また明日ね' },
        ];
        const zh = [
            { index: 1, startMs: 0, endMs: 1000, text: '……' },
            { index: 2, startMs: 1000, endMs: 2000, text: '你好，今天也请多关照。' },
            { index: 3, startMs: 2000, endMs: 3000, text: '' },
        ];
        const all = blankRetry.collectBlankRetranslatePairs(zh, ja, {
            forceRetranslateIndexes: [2],
        });
        assert.ok(all.pairs.some((p) => Number(p.index) === 1));
        assert.ok(all.pairs.some((p) => Number(p.index) === 2));
        assert.ok(all.pairs.some((p) => Number(p.index) === 3));
        const only = blankRetry.collectBlankRetranslatePairs(zh, ja, {
            forceRetranslateIndexes: [2],
            forceRetranslateOnly: true,
        });
        assert.deepStrictEqual(only.pairs.map((p) => Number(p.index)), [2]);
    });

    it('collectBlankRetranslatePairs uses index fallback when timing does not overlap', () => {
        const ja = [
            { index: 7, startMs: 0, endMs: 1000, text: '明日は学校に行きます' },
        ];
        const zh = [
            { index: 7, startMs: 90000, endMs: 91000, text: '……' },
        ];
        const { pairs } = blankRetry.collectBlankRetranslatePairs(zh, ja);
        assert.strictEqual(pairs.length, 1);
        assert.strictEqual(pairs[0].index, 7);
        assert.ok(pairs[0].sourceText.includes('学校'));
    });

    it('final blank pass ignores exhausted indexes so leftovers can retry', () => {
        const skipped = blankRetry.resolveSkipLlmBlankIndexes({
            blankExhaustedIndexes: [1, 2, 3],
            blankMtSkipLlmIndexes: [1, 2, 3],
            blankMtFinalPass: true,
            perfProfile: 'quality',
        });
        assert.deepStrictEqual(skipped, []);
        const budget = blankRetry.resolveBlankMtRetryBudget({
            options: { blankMtFinalPass: true, perfProfile: 'quality' },
            isZhTarget: true,
        });
        assert.strictEqual(budget.ignoreExhaustedIndexes, true);
        assert.ok(budget.maxRounds >= 4, `final pass rounds ${budget.maxRounds}`);
        assert.ok(budget.maxCuesPerRound >= 64, `final pass cues ${budget.maxCuesPerRound}`);
        assert.ok(budget.weakYieldSoftLimit >= 5);
        assert.ok(budget.weakYieldMinRatio <= 0.02);
        const massWipe = blankRetry.resolveBlankMtRetryBudget({
            options: {
                blankMtFinalPass: true,
                perfProfile: 'quality',
                blankHintCount: 98,
            },
            isZhTarget: true,
            blankHintCount: 98,
        });
        assert.ok(massWipe.maxRounds <= 2, `mass-wipe rounds ${massWipe.maxRounds}`);
        assert.ok(massWipe.maxCuesPerRound <= 24, `mass-wipe cues ${massWipe.maxCuesPerRound}`);
        assert.strictEqual(massWipe.windowLines, 1);
        assert.strictEqual(massWipe.weakYieldSoftLimit, 1);
        assert.ok(massWipe.weakYieldMinRatio >= 0.08);

        // Post-batch mass leftovers (not only finalPass) also fuse after one weak round.
        const postBatchMass = blankRetry.resolveBlankMtRetryBudget({
            options: { perfProfile: 'quality', blankHintCount: 63 },
            isZhTarget: true,
            blankHintCount: 63,
        });
        assert.strictEqual(postBatchMass.windowLines, 1);
        assert.strictEqual(postBatchMass.weakYieldSoftLimit, 1);
        assert.strictEqual(postBatchMass.stallRoundsLimit, 1);
        assert.ok(postBatchMass.maxRounds <= 2);
        const weak = blankRetry.evaluateBlankWeakYield({
            budget: postBatchMass,
            batchSize: 48,
            roundRecovered: 1,
            lowYieldRounds: 0,
        });
        assert.strictEqual(weak.stop, true);
        assert.strictEqual(weak.reason, 'weak_yield_fuse');

        const mid = blankRetry.resolveSkipLlmBlankIndexes({
            blankExhaustedIndexes: [9],
            perfProfile: 'quality',
        });
        assert.deepStrictEqual(mid, [9]);
    });
});
