const assert = require('assert');
const {
    rematerializeCuesIfNeeded,
    rematerializeCuesOntoSource,
} = require('../electron/mt-pair-rematerialize');

describe('mt-pair-rematerialize dead timeline', () => {
    it('positionally lays QC-packed ZH onto real JA times', () => {
        const ja = [
            { index: 0, startMs: 31856, endMs: 35264, text: 'コンビニ' },
            { index: 1, startMs: 36832, endMs: 39648, text: 'お客さん' },
            { index: 2, startMs: 40880, endMs: 41616, text: 'だけど' },
        ];
        const zhPacked = [
            { index: 0, startMs: 0, endMs: 500, text: '便利店' },
            { index: 1, startMs: 501, endMs: 1001, text: '客人' },
        ];
        for (let i = 2; i < 20; i += 1) {
            zhPacked.push({
                index: i,
                startMs: i * 501,
                endMs: i * 501 + 500,
                text: `重复${i}`,
            });
        }
        const laid = rematerializeCuesIfNeeded(zhPacked, ja);
        assert.strictEqual(laid.rematerialized, true);
        assert.strictEqual(laid.mode, 'positional-dead-timeline');
        assert.strictEqual(laid.cues.length, 3);
        assert.strictEqual(laid.cues[0].startMs, 31856);
        assert.strictEqual(laid.cues[0].text, '便利店');
        assert.strictEqual(laid.cues[1].startMs, 36832);
        assert.strictEqual(laid.cues[1].text, '客人');
        assert.strictEqual(laid.cues[2].startMs, 40880);
        assert.strictEqual(laid.cues[2].text, '重复2');
    });

    it('does not force positional when both tracks have real times', () => {
        const ja = [
            { index: 0, startMs: 1000, endMs: 2000, text: 'あ' },
            { index: 1, startMs: 3000, endMs: 4000, text: 'い' },
        ];
        const zh = [
            { index: 0, startMs: 1000, endMs: 2000, text: '啊' },
            { index: 1, startMs: 3000, endMs: 4000, text: '哎' },
        ];
        const laid = rematerializeCuesIfNeeded(zh, ja);
        assert.strictEqual(laid.rematerialized, false);
        assert.strictEqual(laid.cues[0].text, '啊');
    });

    it('preferPositional option zips by list order', () => {
        const ja = [
            { startMs: 10000, endMs: 11000, text: 'ja1' },
            { startMs: 20000, endMs: 21000, text: 'ja2' },
        ];
        const zh = [
            { startMs: 0, endMs: 500, text: 'zh1' },
            { startMs: 501, endMs: 1001, text: 'zh2' },
        ];
        const laid = rematerializeCuesOntoSource(ja, zh, { preferPositional: true });
        assert.strictEqual(laid.mode, 'positional-dead-timeline');
        assert.strictEqual(laid.cues[0].startMs, 10000);
        assert.strictEqual(laid.cues[0].text, 'zh1');
        assert.strictEqual(laid.cues[1].startMs, 20000);
        assert.strictEqual(laid.cues[1].text, 'zh2');
    });
});
