const assert = require('assert');
const blankPolicy = require('../src/js/blank-mt-retry-policy-core');
const qualityPolicy = require('../src/js/quality-pipeline-policy-core');
const loop = require('../src/js/post-qc-loop-plan-core');

describe('blank-mt-retry-policy slot filter + weak yield', () => {
    it('classifies moan delete as skip and lexical blank as llm', () => {
        assert.strictEqual(blankPolicy.classifyBlankSlotForLlm('はぁはぁ', '…'), 'skip');
        assert.strictEqual(blankPolicy.classifyBlankSlotForLlm('はひゅはひゅ', '…'), 'skip');
        assert.strictEqual(
            blankPolicy.classifyBlankSlotForLlm('まだ何も答えられない', '…'),
            'llm',
        );
        assert.strictEqual(
            blankPolicy.classifyBlankSlotForLlm('はぁ やめやめ', '哈'),
            'llm',
        );
        assert.strictEqual(
            blankPolicy.classifyBlankSlotForLlm('ポテチ舐めて?', '舔'),
            'llm',
        );
        // SNOS-299: vocative stub on lexical JA must LLM-retry (not det_only)
        assert.strictEqual(
            blankPolicy.classifyBlankSlotForLlm('どれぐらい緊張してるか教えてください', '喂'),
            'llm',
        );
        assert.strictEqual(
            blankPolicy.classifyBlankSlotForLlm('大学生をしてます', '喂'),
            'llm',
        );
        // Legitimate call-out gloss stays out of vocative_stub → det_only / keep path
        assert.strictEqual(
            blankPolicy.classifyBlankSlotForLlm('ねえ', '喂'),
            'det_only',
        );
        // Soft-AV breath ellipsis must NOT skip LLM (false ASR-garbage)
        assert.strictEqual(
            blankPolicy.classifyBlankSlotForLlm('だから…いっぱい締めてあげるから…', '…'),
            'llm',
        );
        assert.strictEqual(
            blankPolicy.classifyBlankSlotForLlm('はぁ…はぁ…めちゃめちゃしちゃいます…', '…'),
            'llm',
        );
        // Discourse with neighbors → recover/llm
        assert.strictEqual(
            blankPolicy.classifyBlankSlotForLlm('うん', '…', {
                prevJa: '今日は何する？',
                nextJa: '映画でも見る？',
            }),
            'llm',
        );
    });

    it('おい call-out is not pure-moan delete', () => {
        const ellipsis = require('../src/js/hymt-ellipsis-policy-core');
        assert.strictEqual(ellipsis.isPureMoanOrSfxJa('おい'), false);
        assert.notStrictEqual(
            ellipsis.planEllipsisSlotAction('おい', '喂', {}).action,
            'delete',
        );
        assert.strictEqual(
            blankPolicy.classifyBlankSlotForLlm('おい', '喂'),
            'det_only',
        );
    });

    it('filterBlankPairsForLlm drops delete-class', () => {
        const { llmPairs, skippedPairs } = blankPolicy.filterBlankPairsForLlm([
            { index: 0, sourceText: 'はぁはぁ', zhCue: { text: '…' } },
            { index: 1, sourceText: 'まだ何も答えられない', zhCue: { text: '…' } },
        ]);
        assert.ok(skippedPairs.some((p) => Number(p.index) === 0));
        assert.ok(llmPairs.some((p) => Number(p.index) === 1));
    });

    it('recoverAllEllipsis sends moan leftover … to LLM like the editor', () => {
        assert.strictEqual(
            blankPolicy.classifyBlankSlotForLlm('はぁはぁ', '…', { recoverAllEllipsis: true }),
            'llm',
        );
        const { llmPairs, skippedPairs } = blankPolicy.filterBlankPairsForLlm(
            [
                { index: 0, sourceText: 'はぁはぁ', zhCue: { text: '…' } },
                { index: 1, sourceText: 'まだ何も答えられない', zhCue: { text: '…' } },
            ],
            { recoverAllEllipsis: true },
        );
        assert.strictEqual(skippedPairs.length, 0);
        assert.strictEqual(llmPairs.length, 2);
    });

    it('inference / hybrid GalTransl skips post-batch blank retry (direct ellipsis later)', () => {
        assert.strictEqual(
            blankPolicy.isInferenceBlankDirectFinalize({ translateMode: 'llm' }),
            true,
        );
        assert.strictEqual(
            blankPolicy.isInferenceBlankDirectFinalize({ translateMode: 'smart' }),
            true,
        );
        assert.strictEqual(
            blankPolicy.shouldRunPostBatchBlankPass({ translateMode: 'llm' }),
            false,
        );
        assert.strictEqual(
            blankPolicy.shouldRunPostBatchBlankPass({ translateMode: 'smart', perfProfile: 'quality' }),
            false,
        );
        assert.strictEqual(
            blankPolicy.isInferenceBlankDirectFinalize({ perfProfile: 'speed' }),
            false,
        );
        assert.strictEqual(
            blankPolicy.isInferenceBlankDirectFinalize({ translateMode: 'dialog' }),
            false,
        );
    });

    it('weak yield fuses after soft limit', () => {
        const budget = blankPolicy.resolveBlankMtRetryBudget({
            options: { perfProfile: 'quality' },
            isZhTarget: true,
        });
        assert.strictEqual(budget.weakYieldSoftLimit, 2);
        assert.ok(budget.maxRounds <= 3);
        const soft = blankPolicy.evaluateBlankWeakYield({
            budget,
            batchSize: 64,
            roundRecovered: 1,
            lowYieldRounds: 0,
        });
        assert.strictEqual(soft.stop, false);
        assert.strictEqual(soft.continueSoft, true);
        const stop = blankPolicy.evaluateBlankWeakYield({
            budget,
            batchSize: 64,
            roundRecovered: 1,
            lowYieldRounds: soft.lowYieldRounds,
        });
        assert.strictEqual(stop.stop, true);
        assert.strictEqual(stop.reason, 'weak_yield_fuse');
    });
});

describe('post-qc loop signal gate', () => {
    it('skips when risk/blank signal is low', () => {
        const plan = loop.planPostQcLoop(
            [
                { text: 'a', startMs: 0, endMs: 1000 },
                { text: 'b', startMs: 1000, endMs: 2000 },
            ],
            [{ index: 0, types: ['fluency'], textPreview: '略怪' }],
            {
                postQcLoopMaxPasses: 1,
                pass: 0,
                bandByIndex: { 0: 'green', 1: 'green' },
                holdIndexes: [],
            },
        );
        assert.strictEqual(plan.skip, true);
        assert.strictEqual(plan.reason, 'low_signal');
    });

    it('runs when red bands present', () => {
        const plan = loop.planPostQcLoop(
            [
                { text: '源1', startMs: 0, endMs: 1000 },
                { text: '源2', startMs: 1000, endMs: 2000 },
            ],
            [{ index: 0, types: ['blank'], textPreview: '…' }],
            {
                postQcLoopMaxPasses: 1,
                pass: 0,
                bandByIndex: { 0: 'red', 1: 'green' },
                holdIndexes: [0],
            },
        );
        assert.strictEqual(plan.skip, false);
        assert.ok(plan.retranslateIndexes.includes(0));
        // Red/hold = 补译 only; do not treat as ASR failure for re-ASR windows.
        assert.strictEqual((plan.retranscribeRanges || []).length, 0, JSON.stringify(plan));
        assert.strictEqual((plan.retranscribeIndexes || []).length, 0, JSON.stringify(plan));
    });

    it('re-ASR only for low_confidence / asr_low, not red band alone', () => {
        const cues = [
            { text: '源1', startMs: 0, endMs: 1000 },
            { text: '源2', startMs: 1000, endMs: 2000 },
            { text: '源3', startMs: 2000, endMs: 3000 },
        ];
        const plan = loop.planPostQcLoop(
            cues,
            [
                { index: 0, types: ['blank'], textPreview: '…' },
                { index: 1, types: ['low_confidence'], textPreview: 'むにゃ' },
            ],
            {
                postQcLoopMaxPasses: 1,
                pass: 0,
                bandByIndex: { 0: 'red', 1: 'yellow', 2: 'green' },
                holdIndexes: [0],
            },
        );
        assert.strictEqual(plan.skip, false);
        assert.ok(plan.retranslateIndexes.includes(0));
        assert.ok(
            (plan.retranscribeIndexes || []).includes(1)
            || (plan.retranscribeRanges || []).some((r) => (r.indexes || []).includes(1)),
            JSON.stringify(plan),
        );
        assert.ok(
            !(plan.retranscribeIndexes || []).includes(0),
            `red hold must not be re-ASR: ${JSON.stringify(plan.retranscribeIndexes)}`,
        );
    });

    it('does not re-ASR ZH connected-only issues after MT delivery', () => {
        const cues = [
            { text: '很长的一句中文连续文本没有标点', startMs: 0, endMs: 4000 },
            { text: '另一句', startMs: 4000, endMs: 5000 },
        ];
        const plan = loop.planPostQcLoop(
            cues,
            [{ index: 0, types: ['connected'], textPreview: '很长的一句中文连续文本没有标点' }],
            {
                postQcLoopMaxPasses: 1,
                pass: 0,
                bandByIndex: { 0: 'yellow', 1: 'green' },
                holdIndexes: [],
                // Force signal past low_signal (issue_yellow needs yellow + issues)
                postQcLoopMinIssues: 1,
            },
        );
        assert.strictEqual(plan.skip, false, JSON.stringify(plan));
        assert.strictEqual((plan.retranscribeRanges || []).length, 0, JSON.stringify(plan));
        assert.ok(plan.retranslateIndexes.includes(0));
    });

    it('skips when blank density is already MT-exhausted', () => {
        const cues = Array.from({ length: 20 }, (_, i) => ({
            text: `c${i}`,
            startMs: i * 1000,
            endMs: (i + 1) * 1000,
        }));
        const issues = Array.from({ length: 10 }, (_, i) => ({
            index: i,
            types: ['blank'],
            textPreview: '…',
        }));
        const plan = loop.planPostQcLoop(cues, issues, {
            postQcLoopMaxPasses: 1,
            pass: 0,
            bandByIndex: {},
            holdIndexes: [],
            blankExhaustedIndexes: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
        });
        assert.strictEqual(plan.skip, true);
        assert.strictEqual(plan.reason, 'mt_exhausted');
    });

    it('resolveEffectivePostQcLoopMaxPasses is 0 on speed auto', () => {
        assert.strictEqual(qualityPolicy.resolveEffectivePostQcLoopMaxPasses({
            perfProfile: 'speed',
            qualityPipelineMode: 'auto',
            postQcLoopMaxPasses: 1,
        }), 0);
        assert.ok(qualityPolicy.resolveEffectivePostQcLoopMaxPasses({
            perfProfile: 'quality',
            qualityPipelineMode: 'auto',
            postQcLoopMaxPasses: 1,
        }) >= 1);
    });
});
