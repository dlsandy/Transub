const assert = require('assert');
const {
    selectQcSmartTargets,
    selectQcRetranscribeTargets,
    selectQcLlmSplitTargets,
    buildQcRetranscribeRanges,
    planLowConfidenceRetranscribeRanges,
    planMergedQcRetranscribeRanges,
    planPostBatchResidualHarvest,
    buildQcLlmSplitPayload,
    textsFromBreakIndices,
    parseLlmSplitResponse,
    mockLlmSplitCues,
    applyQcLlmSplitResults,
    expandIndexesWithNeighbors,
    applyQcSmartUpdates,
    selectQcSemanticIndexes,
    collectBlankEllipsisIndexes,
    mergeBlankEllipsisIssues,
    isBlankOrEllipsisZh,
    buildQcSemanticPairs,
    applyQcSemanticSuggestions,
    resolveQcSemanticPairPath,
    summarizeQcSmartPlan,
    summarizeQcRetranscribePlan,
    summarizeQcLlmSplitPlan,
    summarizeQcSemanticPlan,
    buildQcSmartReconstructOptions,
    looksLikeWeirdCueText,
    mergeWeirdTextIssues,
    QC_SMART_NOTE,
    QC_SEMANTIC_NOTE,
} = require('../src/js/subtitle-qc-smart-core');
const { scanCueIssues } = require('../src/js/subtitle-qc-core');

describe('subtitle-qc-smart', () => {
    it('selects fluency and connected targets by priority', () => {
        const issues = [
            { index: 0, types: ['overlap'], messages: ['重叠'] },
            { index: 2, types: ['fluency', 'high_cps'], messages: ['残缺'] },
            { index: 1, types: ['connected', 'high_cps'], messages: ['连续'] },
            { index: 3, types: ['fluency'], messages: ['口吃'] },
        ];
        const targets = selectQcSmartTargets(issues, { maxSmartCues: 2 });
        assert.strictEqual(targets.length, 2);
        assert.strictEqual(targets[0].index, 2);
        assert.ok(targets[0].types.includes('fluency'));
        assert.ok(targets.some((t) => t.index === 1 || t.index === 3));
    });

    it('prioritizes weird cue text for polish', () => {
        assert.ok(looksLikeWeirdCueText('请改成：你好 __GLOSS1__'));
        assert.ok(looksLikeWeirdCueText('改为符合原文语气'));
        assert.ok(!looksLikeWeirdCueText('今天天气很好。'));
        const cues = [
            { startMs: 0, endMs: 1000, text: '正常对白。' },
            { startMs: 1000, endMs: 2000, text: '系统提示：请翻译字幕 __GLOSS2__' },
        ];
        const merged = mergeWeirdTextIssues(cues, []);
        assert.ok(merged.some((it) => it.index === 1 && it.types.includes('weird')));
        const targets = selectQcSmartTargets(merged, { maxSmartCues: 4 });
        assert.ok(targets[0] && targets[0].index === 1);
        assert.ok(targets[0].types.includes('weird'));
    });

    it('expands neighbors for context window', () => {
        const expanded = expandIndexesWithNeighbors([5], 10, 1);
        assert.deepStrictEqual(expanded, [4, 5, 6]);
    });

    it('applies updates only to allowIndexes', () => {
        const cues = [
            { startMs: 0, endMs: 1000, text: 'a' },
            { startMs: 1000, endMs: 2000, text: 'b' },
            { startMs: 2000, endMs: 3000, text: 'c' },
        ];
        const { cues: next, changed, changedIndexes } = applyQcSmartUpdates(
            cues,
            [
                { index: 0, text: 'A' },
                { index: 1, text: 'B' },
                { index: 2, text: 'C' },
            ],
            { allowIndexes: [1] },
        );
        assert.strictEqual(changed, 1);
        assert.deepStrictEqual(changedIndexes, [1]);
        assert.strictEqual(next[0].text, 'a');
        assert.strictEqual(next[1].text, 'B');
        assert.strictEqual(next[2].text, 'c');
    });

    it('builds light reconstruct options with QC note', () => {
        const opts = buildQcSmartReconstructOptions({});
        assert.strictEqual(opts.intensity, 'light');
        assert.ok(opts.note.includes('通顺') || opts.note.includes('清怪') || opts.note === QC_SMART_NOTE);
        assert.ok(QC_SMART_NOTE.includes('清怪') || QC_SMART_NOTE.includes('莫名其妙'));
        assert.ok(summarizeQcSmartPlan([]).includes('无需'));
        assert.ok(summarizeQcSmartPlan([{ types: ['fluency'] }]).includes('智能润色'));
        assert.ok(summarizeQcSmartPlan([{ types: ['weird', 'fluency'] }]).includes('怪句'));
    });

    it('picks remaining fluency after rule-like scan', () => {
        const cues = [
            { startMs: 0, endMs: 2000, text: '他走向了' },
            { startMs: 2000, endMs: 4000, text: '正常对白内容。' },
        ];
        const { issues } = scanCueIssues(cues, {
            maxCps: 100,
            minSec: 0.1,
            maxSec: 60,
            checkFluency: true,
        });
        const targets = selectQcSmartTargets(issues);
        assert.ok(targets.some((t) => t.index === 0));
    });

    it('selects connected cues for retranscribe and merges adjacent ranges', () => {
        const cues = [
            { startMs: 0, endMs: 1000, text: 'a' },
            { startMs: 1000, endMs: 2500, text: '今天天气很好出去散步看看风景喝杯热茶休息一会' },
            { startMs: 2600, endMs: 4000, text: '继续聊天吃饭睡觉起床刷牙洗脸出门上班' },
            { startMs: 8000, endMs: 9500, text: '另一段远离的连续高读速文本没有标点断句词' },
            { startMs: 10000, endMs: 11000, text: 'ok' },
        ];
        const { issues } = scanCueIssues(cues, {
            maxCps: 8,
            smartMaxChars: 8,
            smartLineChars: 8,
            checkFluency: false,
            minSec: 0.1,
            maxSec: 60,
        });
        const targets = selectQcRetranscribeTargets(issues);
        assert.ok(targets.length >= 1, 'should find connected targets');
        assert.ok(targets.every((t) => t.types.includes('connected')));

        const ranges = buildQcRetranscribeRanges(
            cues,
            targets.map((t) => t.index),
            { maxRanges: 8, mergeAdjacentGapMs: 800, maxDurationSec: 45 },
        );
        assert.ok(ranges.length >= 1);
        assert.ok(ranges[0].endMs > ranges[0].startMs);
        assert.ok(summarizeQcRetranscribePlan(ranges).includes('重转写'));

        // 相邻 connected（index 1+2）应合并成一窗
        const near = targets.filter((t) => t.index === 1 || t.index === 2).map((t) => t.index);
        if (near.length >= 2) {
            const merged = buildQcRetranscribeRanges(cues, near, { mergeAdjacentGapMs: 800 });
            assert.strictEqual(merged.length, 1);
            assert.ok(merged[0].indexes.includes(1) && merged[0].indexes.includes(2));
        }
    });

    it('splits overly long retranscribe clusters', () => {
        const cues = [];
        for (let i = 0; i < 6; i += 1) {
            cues.push({
                startMs: i * 10000,
                endMs: i * 10000 + 9000,
                text: `段${i}`,
            });
        }
        const ranges = buildQcRetranscribeRanges(
            cues,
            [0, 1, 2, 3, 4, 5],
            { maxDurationSec: 20, mergeAdjacentGapMs: 2000, maxRanges: 10 },
        );
        assert.ok(ranges.length >= 2, 'long cluster should split by max duration');
        for (const r of ranges) {
            assert.ok(r.durationMs <= 20000 + 1);
        }
    });

    it('plans low-confidence ranges by merging adjacent cues', () => {
        const cues = [
            { startMs: 0, endMs: 1000, text: 'a' },
            { startMs: 1100, endMs: 2000, text: 'b' },
            { startMs: 2100, endMs: 3000, text: 'skip' },
            { startMs: 9000, endMs: 10000, text: 'c' },
        ];
        const empty = planLowConfidenceRetranscribeRanges(cues, [], {});
        assert.strictEqual(empty.rangeCount, 0);
        assert.strictEqual(empty.cueCount, 0);

        // Non-consecutive indexes: 0–1 merge by adjacency; 3 is a separate window.
        const planned = planLowConfidenceRetranscribeRanges(cues, [0, 1, 3], {
            mergeAdjacentGapMs: 800,
            maxRanges: 8,
        });
        assert.strictEqual(planned.cueCount, 3);
        assert.strictEqual(planned.rangeCount, 2);
        assert.deepStrictEqual(planned.ranges[0].indexes, [0, 1]);
        assert.deepStrictEqual(planned.ranges[1].indexes, [3]);

        const fromMeta = planLowConfidenceRetranscribeRanges(cues, [
            { low: true },
            { low: true },
            { low: false },
            { low: false },
        ]);
        assert.strictEqual(fromMeta.cueCount, 2);
        assert.strictEqual(fromMeta.rangeCount, 1);
    });

    it('merges connected + low-confidence retranscribe under one budget', () => {
        const cues = [];
        for (let i = 0; i < 8; i += 1) {
            cues.push({
                startMs: i * 2000,
                endMs: i * 2000 + 1800,
                text: `段${i}`,
            });
        }
        const issues = [
            { index: 0, types: ['connected'], messages: ['连续'] },
            { index: 1, types: ['connected', 'high_cps'], messages: ['连续'] },
        ];
        const merged = planMergedQcRetranscribeRanges(cues, issues, [5, 6, 7], {
            maxRanges: 2,
            mergeAdjacentGapMs: 400,
        });
        assert.ok(merged.ranges.length >= 1);
        assert.ok(merged.ranges.length <= 2);
        assert.ok(merged.connectedIndexes.includes(0));
        assert.ok(merged.plan.includes('连续'));
        // With maxRanges=2, connected cluster takes a slot; leftover can cover low-conf
        assert.ok(merged.lowConfidenceIndexes.includes(5));

        const harvest = planPostBatchResidualHarvest([
            { index: 2, types: ['fluency'], textPreview: '他走向了' },
            { index: 3, types: ['weird'], textPreview: '__GLOSS1__' },
            { index: 4, types: ['overlap'], textPreview: '…' },
        ], { lowConfidenceIndexes: [7] });
        assert.ok(harvest.total >= 3);
        assert.ok(harvest.fluency.includes(2));
        assert.ok(harvest.weird.includes(3));
        assert.ok(harvest.blank.includes(4));
        assert.ok(harvest.lowConfidence.includes(7));
        assert.ok(harvest.summary.includes('对照训练'));
        assert.ok(harvest.summary.includes('可补译'));
    });

    it('collects blank/ellipsis indexes and prefers them for semantic review', () => {
        assert.strictEqual(isBlankOrEllipsisZh('…'), true);
        assert.strictEqual(isBlankOrEllipsisZh('请等一下'), false);
        const targets = [
            { startMs: 0, endMs: 1000, text: '…' },
            { startMs: 2000, endMs: 3000, text: '今天天气不错' },
            { startMs: 4000, endMs: 5000, text: '...' },
        ];
        const pair = [
            { startMs: 0, endMs: 1000, text: '待ってください' },
            { startMs: 2000, endMs: 3000, text: 'いい天気' },
            { startMs: 4000, endMs: 5000, text: 'あ' }, // too short JA → skip
        ];
        const blanks = collectBlankEllipsisIndexes(targets, pair);
        assert.deepStrictEqual(blanks, [0]);
        const merged = mergeBlankEllipsisIssues(targets, [
            { index: 1, types: ['fluency'], textPreview: '今天天气不错' },
        ], { blankIndexes: blanks });
        assert.ok(merged.some((i) => i.index === 0 && i.types.includes('blank')));
        const indexes = selectQcSemanticIndexes(merged, {
            blankPreferIndexes: blanks,
            maxPairs: 10,
        });
        assert.strictEqual(indexes[0], 0);
        assert.ok(indexes.includes(1));
    });

    it('parses llm split response and applies break indices', () => {
        const text = '今天天气很好我们去公园玩然后回家吃饭';
        const texts = textsFromBreakIndices(text, [8, 16]);
        assert.ok(texts && texts.length === 3);

        const parsed = parseLlmSplitResponse(
            JSON.stringify({ splits: [{ index: 0, breakIndices: [8, 16] }] }),
            [0],
        );
        assert.strictEqual(parsed.ok, true);
        assert.strictEqual(parsed.splits[0].index, 0);

        const cues = [{ startMs: 0, endMs: 3000, text }];
        const applied = applyQcLlmSplitResults(cues, parsed.splits, {
            targetCps: 8,
            minSec: 0.3,
        });
        assert.ok(applied.splitCount >= 1);
        assert.ok(applied.cues.length >= 2);
        assert.ok(applied.added >= 1);
    });

    it('selects llm split targets and mocks break points', () => {
        const issues = [
            { index: 0, types: ['connected', 'high_cps'], textPreview: '今天天气很好出去散步看看风景' },
            { index: 1, types: ['fluency'], textPreview: '他走向了' },
        ];
        const targets = selectQcLlmSplitTargets(issues);
        assert.ok(targets.some((t) => t.index === 0));
        assert.ok(!targets.some((t) => t.index === 1));
        assert.ok(summarizeQcLlmSplitPlan(targets).includes('智能断句'));

        const cues = [
            { startMs: 0, endMs: 2000, text: '今天天气很好出去散步看看风景喝杯热茶休息一会继续聊天' },
        ];
        const payload = buildQcLlmSplitPayload(cues, targets, { smartMaxChars: 12 });
        const mocked = mockLlmSplitCues(payload);
        assert.ok(mocked.ok);
        assert.ok(mocked.splits.length >= 1);
    });

    it('builds semantic pairs and applies suggestedTarget', () => {
        const issues = [
            { index: 2, types: ['fluency'] },
            { index: 0, types: ['connected'] },
        ];
        const indexes = selectQcSemanticIndexes(issues, { preferIndexes: [0], maxPairs: 10 });
        assert.strictEqual(indexes[0], 0);
        assert.ok(indexes.includes(2));
        assert.ok(summarizeQcSemanticPlan(indexes.length).includes('语义'));
        assert.ok(QC_SEMANTIC_NOTE.length > 0);

        const cues = [
            { startMs: 0, endMs: 1000, text: '错译' },
            { startMs: 1000, endMs: 2000, text: 'ok' },
            { startMs: 2000, endMs: 3000, text: '' },
        ];
        const pairCues = [
            { startMs: 0, endMs: 1000, text: 'hello' },
            { startMs: 1000, endMs: 2000, text: 'world' },
            { startMs: 2000, endMs: 3000, text: 'missing' },
        ];
        const pairs = buildQcSemanticPairs(cues, pairCues, [0, 2]);
        assert.strictEqual(pairs.length, 2);
        assert.strictEqual(pairs[0].source, 'hello');
        assert.strictEqual(pairs[1].source, 'missing');

        const applied = applyQcSemanticSuggestions(cues, [
            { index: 0, suggestedTarget: '你好' },
            { index: 2, suggestedTarget: '漏译补全' },
            { index: 1, message: 'no fix' },
        ]);
        assert.strictEqual(applied.changed, 2);
        assert.strictEqual(applied.cues[0].text, '你好');
        assert.strictEqual(applied.cues[2].text, '漏译补全');
        assert.strictEqual(applied.cues[1].text, 'ok');
    });

    it('resolves semantic pair path only for target track', () => {
        const item = {
            sourceSubtitlePath: 'C:\\out\\a.src.srt',
            targetSubtitlePath: 'C:\\out\\a.zh.srt',
            subtitlePath: 'C:\\out\\a.zh.srt',
        };
        assert.strictEqual(
            resolveQcSemanticPairPath(item, 'C:\\out\\a.zh.srt'),
            'C:\\out\\a.src.srt',
        );
        assert.strictEqual(resolveQcSemanticPairPath(item, 'C:\\out\\a.src.srt'), '');
        assert.strictEqual(resolveQcSemanticPairPath(item, 'C:\\out\\other.srt'), '');
        assert.strictEqual(resolveQcSemanticPairPath({}, 'C:\\out\\a.zh.srt'), '');
    });
});
