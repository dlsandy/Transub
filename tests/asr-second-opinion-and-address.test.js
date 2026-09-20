const assert = require('assert');
const asr = require('../src/js/asr-second-opinion-core');

describe('asr-second-opinion-core', () => {
    it('normalizes auto/on/off and gates av_soft', () => {
        assert.strictEqual(asr.normalizeAsrSecondOpinionOption(undefined), 'off');
        assert.strictEqual(asr.normalizeAsrSecondOpinionOption('off'), 'off');
        assert.strictEqual(asr.normalizeAsrSecondOpinionOption(true), 'on');
        assert.strictEqual(asr.normalizeAsrSecondOpinionOption('auto'), 'auto');
        assert.strictEqual(asr.shouldRunAsrSecondOpinion({ asrSecondOpinion: 'off' }), false);
        assert.strictEqual(asr.shouldRunAsrSecondOpinion({
            asrSecondOpinion: 'auto',
            contentProfile: 'av_soft',
        }), true);
        assert.strictEqual(asr.shouldRunAsrSecondOpinion({
            asrSecondOpinion: 'auto',
            contentProfile: 'film',
            primaryAsr: 'sensevoice-small',
        }), false);
        assert.strictEqual(asr.shouldRunAsrSecondOpinion({
            asrSecondOpinion: 'auto',
            primaryAsr: 'anime-whisper',
        }), true);
        assert.strictEqual(asr.shouldRunAsrSecondOpinion({
            asrSecondOpinion: 'auto',
            contentProfile: 'av_soft',
            perfProfile: 'speed',
        }), false);
        assert.strictEqual(asr.shouldRunAsrSecondOpinion({
            asrSecondOpinion: 'on',
            contentProfile: 'film',
            perfProfile: 'speed',
        }), true);
        assert.strictEqual(asr.isSpeedPerfProfile({ perfProfile: 'fast' }), true);
    });

    it('picks sibling ASR and chooses richer opinion', () => {
        // Prefer safer SenseVoice over fragile CT2 kotoba/anime siblings.
        const sibling = asr.pickSecondOpinionAsrModel('anime-whisper', {
            candidates: [
                'anime-whisper',
                'kotoba-whisper-v2.0-faster',
                'qwen3-asr-1.7b-ja-anime-galgame',
                'sensevoice-small',
            ],
        });
        assert.strictEqual(sibling, 'sensevoice-small');
        const installedOnly = asr.pickSecondOpinionAsrModel('anime-whisper', {
            candidates: ['anime-whisper', 'qwen3-asr-1.7b-ja-anime-galgame', 'sensevoice-small'],
            installedIds: ['anime-whisper', 'sensevoice-small'],
        });
        assert.strictEqual(installedOnly, 'sensevoice-small');
        const noneInstalled = asr.pickSecondOpinionAsrModel('anime-whisper', {
            candidates: ['anime-whisper', 'qwen3-asr-1.7b-ja-anime-galgame'],
            installedIds: ['anime-whisper'],
        });
        assert.strictEqual(noneInstalled, '');
        const kotobaLast = asr.listSecondOpinionAsrModels('anime-whisper', {
            candidates: [
                'anime-whisper',
                'kotoba-whisper-v2.0-faster',
                'qwen3-asr-0.6b',
            ],
            installedIds: ['anime-whisper', 'kotoba-whisper-v2.0-faster', 'qwen3-asr-0.6b'],
        });
        assert.deepStrictEqual(kotobaLast[0], 'qwen3-asr-0.6b');
        assert.ok(kotobaLast.indexOf('kotoba-whisper-v2.0-faster') > 0);
        assert.strictEqual(asr.shouldReusePrimaryAsrForSecondOpinion('qwen3-asr-1.7b-ja-anime-galgame'), true);
        assert.strictEqual(asr.shouldReusePrimaryAsrForSecondOpinion('anime-whisper'), false);
        const qwenSame = asr.pickSecondOpinionAsrModel('qwen3-asr-1.7b-ja-anime-galgame', {
            candidates: [
                'qwen3-asr-1.7b-ja-anime-galgame',
                'sensevoice-small',
                'whisper-tiny',
            ],
        });
        assert.strictEqual(qwenSame, 'qwen3-asr-1.7b-ja-anime-galgame');
        const qwenOnly = asr.listSecondOpinionAsrModels('qwen3-asr-1.7b-ja', {
            candidates: ['qwen3-asr-1.7b-ja', 'sensevoice-small'],
            installedIds: ['qwen3-asr-1.7b-ja'],
        });
        assert.deepStrictEqual(qwenOnly, ['qwen3-asr-1.7b-ja']);
        assert.strictEqual(asr.shouldReusePrimaryAsrForSecondOpinion('sensevoice-small'), true);
        assert.strictEqual(asr.isFragileCt2AsrForSecondOpinion('kotoba-whisper-v2.0-faster'), true);
        const win = asr.chooseSecondOpinionWinner(
            [{ text: 'あ' }],
            [{ text: '待ってください' }],
        );
        assert.strictEqual(win.useOpinion, true);
        assert.ok(win.reason);
    });

    it('plans ranges only when enough low-confidence cues', () => {
        const cues = [
            { startMs: 0, endMs: 2000, text: 'あいうえお' },
            { startMs: 2100, endMs: 4000, text: 'かきくけこ' },
            { startMs: 5000, endMs: 7000, text: 'さしすせそ' },
        ];
        const few = asr.planAsrSecondOpinion(cues, [0], { minLowCues: 2 });
        assert.strictEqual(few.ok, false);
        const ok = asr.planAsrSecondOpinion(cues, [0, 1, 2], {
            minLowCues: 2,
            maxRanges: 2,
            minRangeMs: 500,
            buildRanges: (list, indexes) => indexes.map((idx) => ({
                startMs: list[idx].startMs,
                endMs: list[idx].endMs,
                indexes: [idx],
                durationMs: 2000,
            })),
        });
        assert.strictEqual(ok.ok, true);
        assert.ok(ok.ranges.length <= 2);
    });

    it('skips short ranges and gates risky low-confidence', () => {
        const cues = [
            { startMs: 0, endMs: 800, text: 'あ' },
            { startMs: 2000, endMs: 5000, text: '待ってくださいね' },
            { startMs: 6000, endMs: 9000, text: 'ああああああ' },
        ];
        const short = asr.shouldSkipSecondOpinionRange({
            startMs: 0, endMs: 800, durationMs: 800, indexes: [0],
        }, cues);
        assert.strictEqual(short.skip, true);
        const anns = [
            { confidence: 0.7, low: false },
            { confidence: 0.5, low: true, flags: [] },
            { confidence: 0.3, low: true, flags: ['low_logprob'] },
        ];
        const risky = asr.selectSecondOpinionIndexes(cues, [1, 2], anns);
        assert.ok(risky.includes(2));
        assert.ok(!risky.includes(1));
        const blanked = asr.blankTargetCuesForRanges(
            [
                { startMs: 1900, endMs: 5100, text: '请等一下' },
                { startMs: 8000, endMs: 9000, text: '啊啊' },
            ],
            [{ startMs: 2000, endMs: 5000 }],
        );
        assert.strictEqual(blanked.blankedCount, 1);
        assert.strictEqual(blanked.cues[0].text, '…');
    });

    it('finds hallucination indexes without low confidence', () => {
        const cues = [
            { startMs: 0, endMs: 2000, text: '待ってください' },
            { startMs: 3000, endMs: 5000, text: 'ああああああああ' },
            { startMs: 6000, endMs: 8000, text: '……' },
        ];
        const idxs = asr.findHallucinationRiskIndexes(cues, [
            { confidence: 0.9, low: false },
            { confidence: 0.8, low: false },
            { confidence: 0.7, low: false },
        ]);
        assert.ok(idxs.includes(1));
        assert.ok(idxs.includes(2));
        assert.ok(!idxs.includes(0));
        const planned = asr.planAsrSecondOpinion(cues, [], {
            minLowCues: 2,
            maxRanges: 3,
            minRangeMs: 500,
            includeTimelineGaps: false,
            annotations: [
                { confidence: 0.9, low: false },
                { confidence: 0.8, low: false },
                { confidence: 0.7, low: false },
            ],
        });
        assert.strictEqual(planned.ok, true);
        assert.ok(planned.hallucIndexes.length >= 2);
        assert.ok(planned.ranges.some((r) => r.source === 'hallucination' || r.kind === 'hallucination'));
    });

    it('plans timeline gap windows for soft/JA and skips short holes', () => {
        assert.strictEqual(asr.shouldIncludeTimelineGaps({ contentProfile: 'film' }), false);
        assert.strictEqual(asr.shouldIncludeTimelineGaps({ contentProfile: 'av_soft' }), true);
        assert.strictEqual(asr.shouldIncludeTimelineGaps({
            contentProfile: 'film',
            includeTimelineGaps: true,
        }), true);

        const cues = [
            { startMs: 0, endMs: 2000, text: 'こんにちは' },
            { startMs: 20000, endMs: 22000, text: 'またね' },
        ];
        const gaps = asr.findTimelineGapWindows(cues, 30000, {
            minGapMs: 8000,
            minRangeMs: 1200,
            maxGapWindowMs: 45000,
        });
        assert.ok(gaps.length >= 1);
        assert.ok(gaps.every((g) => g.kind === 'gap' && g.allowEmpty));

        const shortHole = asr.findTimelineGapWindows([
            { startMs: 0, endMs: 1000, text: 'あ' },
            { startMs: 2500, endMs: 3500, text: 'い' },
        ], 4000, { minGapMs: 8000 });
        assert.strictEqual(shortHole.length, 0);

        const planned = asr.planAsrSecondOpinion(cues, [], {
            minLowCues: 2,
            maxRanges: 4,
            mediaDurationMs: 30000,
            contentProfile: 'av_soft',
            minGapMs: 8000,
            minRangeMs: 1200,
            annotations: [
                { confidence: 0.9, low: false },
                { confidence: 0.9, low: false },
            ],
        });
        assert.strictEqual(planned.ok, true);
        assert.ok(planned.gapWindowCount >= 1);
        assert.ok(planned.ranges.some((r) => r.kind === 'gap'));
        const emptyOk = asr.shouldSkipSecondOpinionRange(planned.ranges.find((r) => r.kind === 'gap'), cues);
        assert.strictEqual(emptyOk.skip, false);
    });

    it('priority prefers hallucination over gaps within maxRanges', () => {
        const cues = [
            { startMs: 0, endMs: 2000, text: 'ああああああ' },
            { startMs: 3000, endMs: 5000, text: 'いいいいいい' },
            { startMs: 25000, endMs: 27000, text: '普通の対白です' },
        ];
        const planned = asr.planAsrSecondOpinion(cues, [], {
            minLowCues: 2,
            maxRanges: 2,
            mediaDurationMs: 40000,
            contentProfile: 'av_soft',
            minGapMs: 8000,
            minRangeMs: 500,
            annotations: [
                { confidence: 0.9, low: false },
                { confidence: 0.9, low: false },
                { confidence: 0.9, low: false },
            ],
        });
        assert.strictEqual(planned.ok, true);
        assert.ok(planned.ranges.some((r) => r.source === 'hallucination' || r.kind === 'hallucination'));
        assert.ok(planned.ranges.length <= 2);
        assert.ok(planned.ranges.every((r) => r.source === 'hallucination' || r.kind === 'hallucination'));
    });

    it('bandByIndex prefers red/yellow when ordering low-confidence indexes', () => {
        const cues = [
            { startMs: 0, endMs: 2000, text: '普通の一文ですよ' },
            { startMs: 2000, endMs: 4000, text: 'もう一つの対白です' },
            { startMs: 4000, endMs: 6000, text: '三番目の対白ですね' },
        ];
        const planned = asr.planAsrSecondOpinion(cues, [0, 1, 2], {
            minLowCues: 1,
            maxRanges: 2,
            minRangeMs: 500,
            annotations: [
                { confidence: 0.4, low: true, flags: ['low_score'] },
                { confidence: 0.3, low: true, flags: ['low_score'] },
                { confidence: 0.45, low: true, flags: ['low_score'] },
            ],
            bandByIndex: { 0: 'green', 1: 'red', 2: 'yellow' },
        });
        assert.strictEqual(planned.ok, true, planned.reason || 'plan failed');
        assert.ok(planned.ranges.length >= 1);
        const firstIdx = Number(planned.ranges[0]?.indexes?.[0]);
        assert.ok(firstIdx === 1 || firstIdx === 2);
    });

    it('prefers clean opinion when primary is scrap/loop', () => {
        const win = asr.chooseSecondOpinionWinner(
            [{ text: '…………' }],
            [{ text: 'ちょっと待って' }],
        );
        assert.strictEqual(win.useOpinion, true);
        assert.ok(/scrap|loop|clean/i.test(win.reason));
    });
});
