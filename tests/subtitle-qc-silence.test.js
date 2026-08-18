const assert = require('assert');
const silence = require('../src/js/subtitle-qc-silence-core');
const norm = require('../src/js/settings-options-normalize-core');

describe('subtitle-qc-silence-core', () => {
    it('clamps threshold (default 15, 0 disables)', () => {
        assert.strictEqual(silence.clampQcSilenceSplitChars(undefined), 15);
        assert.strictEqual(silence.clampQcSilenceSplitChars(''), 15);
        assert.strictEqual(silence.clampQcSilenceSplitChars(0), 0);
        assert.strictEqual(silence.clampQcSilenceSplitChars(12.6), 13);
        assert.strictEqual(silence.clampQcSilenceSplitChars(9999), 500);
        assert.strictEqual(norm.clampQcSilenceSplitChars(undefined), 15);
        assert.strictEqual(norm.clampQcSilenceSplitChars(0), 0);
    });

    it('selects continuous CJK over char threshold (QC audio-first)', () => {
        const cues = [
            { startMs: 0, endMs: 2000, text: '短句而已' },
            // no spaces / no punctuation — common ASR shape
            { startMs: 2000, endMs: 6000, text: '这是一段超过十五个字的中文对白内容啊真的' },
            { startMs: 6000, endMs: 6200, text: '时长不够的超长文本一二三四五六七八九十' },
        ];
        const indexes = silence.selectQcSilenceSplitIndexes(cues, { maxChars: 15 });
        assert.deepStrictEqual(indexes, [1]);
    });

    it('editor-style gate can still require text breaks', () => {
        const cues = [
            { startMs: 0, endMs: 5000, text: '这是一段没有任何断点的连续中文对白内容啊真的很长' },
        ];
        const withBreaks = silence.selectQcSilenceSplitIndexes(cues, {
            maxChars: 15,
            requireTextBreaks: true,
        }, {
            splitApi: {
                isConnectedText: () => true,
                getSilenceTextBreakIndices: () => [],
            },
        });
        assert.deepStrictEqual(withBreaks, []);
    });

    it('skips when threshold is 0', () => {
        const cues = [
            { startMs: 0, endMs: 3000, text: '这是一段很长很长很长很长很长很长的字幕' },
        ];
        assert.deepStrictEqual(silence.selectQcSilenceSplitIndexes(cues, { maxChars: 0 }), []);
    });

    it('caps ffmpeg targets to longest cues', () => {
        const cues = [];
        for (let i = 0; i < 60; i += 1) {
            const n = 16 + (i % 10);
            cues.push({
                startMs: i * 3000,
                endMs: i * 3000 + 2500,
                text: '字'.repeat(n),
            });
        }
        const picked = silence.selectQcSilenceSplitIndexes(cues, {
            maxChars: 15,
            maxTargets: 5,
        });
        assert.strictEqual(picked.length, 5);
        const lens = picked.map((i) => cues[i].text.length);
        assert.ok(lens.every((n) => n === 25));
        assert.strictEqual(silence.clampMaxQcSilenceSplitTargets(0), 48);
        assert.strictEqual(silence.clampMaxQcSilenceSplitTargets(999), 200);
    });

    it('applyQcSilenceSplits splices planned parts', async () => {
        const cues = [
            { startMs: 0, endMs: 1000, text: '短' },
            {
                startMs: 1000,
                endMs: 5000,
                text: '一二三四五六七八九十十一十二十三十四',
            },
        ];
        const applied = await silence.applyQcSilenceSplits(cues, { maxChars: 10 }, {
            canSilenceSplitCue: () => true,
            planSilenceCueSplit: async (cue) => ({
                cues: [
                    { startMs: cue.startMs, endMs: cue.startMs + 1500, text: '一二三四五六七八九十' },
                    { startMs: cue.startMs + 1501, endMs: cue.endMs, text: '十一十二十三十四' },
                ],
            }),
        });
        assert.strictEqual(applied.stats.splitCount, 1);
        assert.strictEqual(applied.stats.added, 1);
        assert.strictEqual(applied.cues.length, 3);
        assert.ok(silence.summarizeQcSilenceSplit(applied.stats).includes('静音分割'));
    });
});
