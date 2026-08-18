const assert = require('assert');
const asr = require('../src/js/asr-second-opinion-core');

describe('asr-second-opinion-core', () => {
    it('normalizes auto/on/off and gates av_soft', () => {
        assert.strictEqual(asr.normalizeAsrSecondOpinionOption(undefined), 'auto');
        assert.strictEqual(asr.normalizeAsrSecondOpinionOption('off'), 'off');
        assert.strictEqual(asr.normalizeAsrSecondOpinionOption(true), 'on');
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
});
