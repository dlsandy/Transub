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

    it('positional zip skips leading ZH ellipsis so dialogue is not one cue late', () => {
        const ja = Array.from({ length: 12 }, (_, i) => ({
            index: i,
            startMs: 2000 + i * 1500,
            endMs: 2900 + i * 1500,
            text: i === 0 ? 'あー彼女教え…' : `JA${i}`,
        }));
        const zh = [
            { startMs: 0, endMs: 0, text: '…' },
            { startMs: 0, endMs: 0, text: '啊 想让她教我' },
            ...Array.from({ length: 10 }, (_, i) => ({
                startMs: 0,
                endMs: 0,
                text: `译${i + 1}`,
            })),
        ];
        const laid = rematerializeCuesOntoSource(ja, zh, { preferPositional: true });
        assert.strictEqual(laid.zhSkip, 1);
        assert.strictEqual(laid.cues[0].startMs, 2000);
        assert.strictEqual(laid.cues[0].text, '啊 想让她教我');
        assert.strictEqual(laid.cues[1].text, '译1');
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

describe('mt-sanitize rematerialize same-start pile', () => {
    const { rematerializeTranslatedOntoSource } = require('../src/js/mt-sanitize-core');

    it('does not broadcast every ZH line onto every same-start JA slot', () => {
        const n = 20;
        const ja = Array.from({ length: n }, (_, i) => ({
            index: i,
            startMs: 0,
            endMs: 500,
            text: `JA${i}`,
        }));
        const zh = Array.from({ length: n }, (_, i) => ({
            index: i,
            startMs: 0,
            endMs: 500,
            text: `译${i}`,
        }));
        const laid = rematerializeTranslatedOntoSource(ja, zh, { preferIndex: false });
        assert.ok(laid.cues.length >= n);
        const uniq = new Set(laid.cues.map((c) => String(c.text || '').trim()));
        assert.ok(uniq.size >= n - 1, `expected ~${n} unique texts, got ${uniq.size}`);
        for (const c of laid.cues) {
            assert.ok(
                !String(c.text).includes('译0 译1 译2'),
                `mega-glued text: ${String(c.text).slice(0, 80)}`,
            );
        }
        assert.strictEqual(laid.cues[0].text.trim(), '译0');
        assert.strictEqual(laid.cues[1].text.trim(), '译1');
    });

    it('still joins CPS extras onto a single JA at the same start', () => {
        const ja = [
            { index: 0, startMs: 1000, endMs: 3000, text: 'あいう' },
            { index: 1, startMs: 5000, endMs: 6000, text: 'えお' },
        ];
        const zh = [
            { index: 0, startMs: 1000, endMs: 1800, text: '啊' },
            { index: 1, startMs: 1000, endMs: 2800, text: '咦呜' },
            { index: 2, startMs: 5000, endMs: 5800, text: '诶哦' },
        ];
        const laid = rematerializeTranslatedOntoSource(ja, zh, { preferIndex: false });
        assert.strictEqual(laid.cues[0].text.trim(), '啊 咦呜');
        assert.strictEqual(laid.cues[1].text.trim(), '诶哦');
    });
});
