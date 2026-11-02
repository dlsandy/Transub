/**
 * Cross-mode smoke for the SAN-494 mega-glue failure class.
 * Covers rematerialize / delivery-finalize / waveform-snap / basic QC paths.
 */
const assert = require('assert');
const {
    rematerializeTranslatedOntoSource,
} = require('../src/js/mt-sanitize-core');
const {
    rematerializeCuesOntoSource,
    rematerializeCuesIfNeeded,
} = require('../electron/mt-pair-rematerialize');
const finalize = require('../src/js/smart-translate-delivery-finalize-core');
const { snapsLookCatastrophic } = require('../electron/qc-waveform-timing');
const keep = require('../electron/transcript-keep');
const {
    applySmartAdjustToCues,
    cuesNeedDestructiveTimingGuard,
} = require('../src/js/subtitle-qc-core');

function makeTimedPair(n, { zhStartOffset = 0 } = {}) {
    const ja = [];
    const zh = [];
    for (let i = 0; i < n; i += 1) {
        const start = 2000 + i * 1500;
        ja.push({
            index: i,
            startMs: start,
            endMs: start + 900,
            text: `JA${i}`,
        });
        zh.push({
            index: i,
            startMs: start + zhStartOffset,
            endMs: start + zhStartOffset + 900,
            text: `译${i}`,
        });
    }
    return { ja, zh };
}

function makeCollapsedPair(n) {
    const ja = [];
    const zh = [];
    for (let i = 0; i < n; i += 1) {
        ja.push({ index: i, startMs: 0, endMs: 500, text: `JA${i}` });
        zh.push({ index: i, startMs: 0, endMs: 500, text: `译${i}` });
    }
    return { ja, zh };
}

function assertNoMegaGlue(cues, label) {
    const list = Array.isArray(cues) ? cues : [];
    assert.ok(list.length >= 8, `${label}: expected >=8 cues`);
    const tallies = new Map();
    for (const c of list) {
        const t = String(c?.text ?? '').trim();
        if (t.length < 40) continue;
        tallies.set(t, (tallies.get(t) || 0) + 1);
    }
    for (const [text, n] of tallies) {
        assert.ok(
            n < Math.ceil(list.length * 0.35),
            `${label}: glued broadcast n=${n}/${list.length} text=${text.slice(0, 48)}`,
        );
    }
    for (const c of list) {
        const t = String(c?.text ?? '');
        assert.ok(
            !/译0\s+译1\s+译2/.test(t),
            `${label}: found concatenated pile in ${t.slice(0, 60)}`,
        );
    }
}

describe('cross-mode rematerialize / QC glue smoke', () => {
    it('mode: healthy startMs overlap keeps 1:1 texts', () => {
        const { ja, zh } = makeTimedPair(16);
        const laid = rematerializeTranslatedOntoSource(ja, zh, { preferIndex: false });
        assert.strictEqual(laid.mode, 'startMs');
        assert.strictEqual(laid.cues[0].text, '译0');
        assert.strictEqual(laid.cues[7].text, '译7');
        assertNoMegaGlue(laid.cues, 'healthy-startMs');
    });

    it('mode: preferIndex on healthy pair', () => {
        const { ja, zh } = makeTimedPair(16);
        const laid = rematerializeTranslatedOntoSource(ja, zh, { preferIndex: true });
        assert.strictEqual(laid.mode, 'index');
        assert.strictEqual(laid.cues[3].text, '译3');
        assertNoMegaGlue(laid.cues, 'preferIndex');
    });

    it('mode: preferPositional dead ZH onto healthy JA', () => {
        const { ja } = makeTimedPair(16);
        const zh = ja.map((c, i) => ({
            index: i,
            startMs: 0,
            endMs: 500,
            text: `译${i}`,
        }));
        assert.strictEqual(keep.cuesHaveBrokenTimeline(zh), true);
        assert.strictEqual(keep.cuesHaveBrokenTimeline(ja), false);
        const laid = rematerializeCuesOntoSource(ja, zh, { preferPositional: true });
        assert.strictEqual(laid.mode, 'positional-dead-timeline');
        assert.strictEqual(laid.cues[0].startMs, ja[0].startMs);
        assert.strictEqual(laid.cues[0].text, '译0');
        assert.strictEqual(laid.cues[15].text, '译15');
        assertNoMegaGlue(laid.cues, 'positional');
    });

    it('mode: rematerializeCuesIfNeeded auto-rescues dead ZH', () => {
        const { ja } = makeTimedPair(16);
        const zh = ja.map((c, i) => ({
            index: i,
            startMs: i * 501,
            endMs: i * 501 + 500,
            text: `译${i}`,
        }));
        const laid = rematerializeCuesIfNeeded(zh, ja);
        assert.strictEqual(laid.rematerialized, true);
        assert.strictEqual(laid.mode, 'positional-dead-timeline');
        assert.strictEqual(laid.cues[2].startMs, ja[2].startMs);
        assert.strictEqual(laid.cues[2].text, '译2');
        assertNoMegaGlue(laid.cues, 'ifNeeded');
    });

    it('mode: collapsed both axes must not mega-glue (SAN-494 class)', () => {
        const { ja, zh } = makeCollapsedPair(24);
        const viaSanitize = rematerializeTranslatedOntoSource(ja, zh, { preferIndex: false });
        assertNoMegaGlue(viaSanitize.cues, 'collapsed-sanitize');
        assert.ok(new Set(viaSanitize.cues.map((c) => c.text)).size >= 20);

        const viaPair = rematerializeCuesOntoSource(ja, zh, { preferPositional: false });
        // Dead ZH forces positional inside pair helper.
        assert.strictEqual(viaPair.mode, 'positional-dead-timeline');
        assertNoMegaGlue(viaPair.cues, 'collapsed-pair');
        assert.strictEqual(viaPair.cues[0].text, '译0');
        assert.strictEqual(viaPair.cues[5].text, '译5');
    });

    it('mode: CPS extras still join onto one JA slot', () => {
        const ja = [
            { index: 0, startMs: 1000, endMs: 3000, text: 'あいう' },
            { index: 1, startMs: 5000, endMs: 6000, text: 'えお' },
            { index: 2, startMs: 8000, endMs: 9000, text: 'かき' },
            { index: 3, startMs: 10000, endMs: 11000, text: 'くけ' },
            { index: 4, startMs: 12000, endMs: 13000, text: 'こ' },
            { index: 5, startMs: 14000, endMs: 15000, text: 'さ' },
            { index: 6, startMs: 16000, endMs: 17000, text: 'し' },
            { index: 7, startMs: 18000, endMs: 19000, text: 'す' },
        ];
        const zh = [
            { index: 0, startMs: 1000, endMs: 1800, text: '啊' },
            { index: 1, startMs: 1000, endMs: 2800, text: '咦呜' },
            { index: 2, startMs: 5000, endMs: 5800, text: '诶哦' },
            { index: 3, startMs: 8000, endMs: 8800, text: '咔叽' },
            { index: 4, startMs: 10000, endMs: 10800, text: '库ケ' },
            { index: 5, startMs: 12000, endMs: 12800, text: '抠' },
            { index: 6, startMs: 14000, endMs: 14800, text: '撒' },
            { index: 7, startMs: 16000, endMs: 16800, text: '吸' },
            { index: 8, startMs: 18000, endMs: 18800, text: '苏' },
        ];
        const laid = rematerializeTranslatedOntoSource(ja, zh, { preferIndex: false });
        assert.strictEqual(laid.cues[0].text.trim(), '啊 咦呜');
        assert.strictEqual(laid.cues[1].text.trim(), '诶哦');
    });

    it('mode: delivery finalize healthy realign does not glue', () => {
        const ja = [
            { index: 0, startMs: 0, endMs: 2000, text: '字幕は Transub Pro で生成されました' },
            { index: 1, startMs: 10000, endMs: 12000, text: 'よろしくお願いします。' },
            { index: 2, startMs: 20000, endMs: 22000, text: '次の方、どうぞ。' },
            { index: 3, startMs: 30000, endMs: 32000, text: 'はい、わかりました。' },
            { index: 4, startMs: 40000, endMs: 42000, text: 'それじゃあ。' },
            { index: 5, startMs: 50000, endMs: 52000, text: 'またね。' },
            { index: 6, startMs: 60000, endMs: 62000, text: 'お疲れ。' },
            { index: 7, startMs: 70000, endMs: 72000, text: '行こう。' },
        ];
        const zh = [
            { index: 0, startMs: 0, endMs: 2000, text: '字幕由 Transub Pro 生成' },
            { index: 1, startMs: 15000, endMs: 16000, text: '孤儿句不应保留' },
            { index: 2, startMs: 10000, endMs: 12000, text: '请多指教' },
            { index: 3, startMs: 30000, endMs: 32000, text: '好的，明白了' },
            { index: 4, startMs: 20000, endMs: 22000, text: '下一位，请' },
            { index: 5, startMs: 40000, endMs: 42000, text: '那就这样' },
            { index: 6, startMs: 50000, endMs: 52000, text: '再见' },
            { index: 7, startMs: 60000, endMs: 62000, text: '辛苦了' },
            { index: 8, startMs: 70000, endMs: 72000, text: '走吧' },
        ];
        const out = finalize.finalizeDeliveryCues(ja, zh, { blankText: '…' });
        assert.strictEqual(out.cues.length, ja.length);
        assertNoMegaGlue(out.cues, 'delivery-healthy');
        assert.ok(!out.cues.some((c) => /孤儿/.test(String(c.text || ''))));
    });

    it('mode: delivery finalize aborts collapsed broadcast', () => {
        const { ja, zh } = makeCollapsedPair(20);
        // Force a would-be rematerialize via countDiff
        zh.push({ index: 99, startMs: 0, endMs: 500, text: '多余' });
        const out = finalize.finalizeDeliveryCues(ja, zh, { blankText: '…' });
        assertNoMegaGlue(out.cues, 'delivery-collapsed');
        // PreferIndex path or abort — never stamp one long string on most cues.
        const longDup = out.cues.filter((c) => String(c.text || '').length > 80);
        const tallies = new Map();
        for (const c of longDup) {
            const t = String(c.text).trim();
            tallies.set(t, (tallies.get(t) || 0) + 1);
        }
        for (const n of tallies.values()) {
            assert.ok(n < Math.ceil(out.cues.length * 0.35));
        }
    });

    it('mode: waveform snap catastrophic on same-start collapse', () => {
        const before = makeTimedPair(20).ja;
        const after = before.map((c) => ({ ...c, startMs: 0, endMs: 500 }));
        assert.strictEqual(snapsLookCatastrophic(before, after, 10), true);
        assert.strictEqual(snapsLookCatastrophic(before, before, 10), false);
        assert.strictEqual(snapsLookCatastrophic(before, after, 0), false);
    });

    it('mode: basic QC skips inventing packed timeline on collapsed track', () => {
        const { zh } = makeCollapsedPair(20);
        assert.strictEqual(keep.cuesHaveBrokenTimeline(zh), true);
        assert.strictEqual(cuesNeedDestructiveTimingGuard(zh), true);
        const copy = zh.map((c) => ({ ...c }));
        const stats = applySmartAdjustToCues(copy, {
            fixOverlap: true,
            enforceMinDur: true,
            skipBrokenTimelineTimingFix: true,
            gapMs: 1,
            minDurMs: 500,
        });
        assert.ok(stats.timingFixSkipped === true || copy.every((c) => c.startMs === 0));
        // Must not unpack into gapMs=1 chain across the whole track.
        let gap1 = 0;
        for (let i = 1; i < copy.length; i += 1) {
            if (copy[i].startMs - copy[i - 1].endMs === 1) gap1 += 1;
        }
        assert.ok(gap1 < Math.ceil(copy.length * 0.5), `unexpected packed chain gap1=${gap1}`);
    });

    it('mode: mild start drift still rematerializes without glue', () => {
        const { ja, zh } = makeTimedPair(16, { zhStartOffset: 120 });
        const laid = rematerializeTranslatedOntoSource(ja, zh, { preferIndex: false });
        assertNoMegaGlue(laid.cues, 'mild-drift');
        // Nearest / exact path should keep individual short texts
        const uniq = new Set(laid.cues.map((c) => String(c.text || '').trim()).filter(Boolean));
        assert.ok(uniq.size >= 12, `uniq=${uniq.size}`);
    });

    it('mode: SAN-494 scale collapsed pile stays 1:1', () => {
        const n = 1059;
        const { ja, zh } = makeCollapsedPair(n);
        const laid = rematerializeTranslatedOntoSource(ja, zh, { preferIndex: false });
        assert.strictEqual(laid.cues.length, n);
        assert.strictEqual(laid.cues[0].text, '译0');
        assert.strictEqual(laid.cues[500].text, '译500');
        assert.strictEqual(laid.cues[n - 1].text, `译${n - 1}`);
        const uniq = new Set(laid.cues.map((c) => c.text));
        assert.strictEqual(uniq.size, n);
        const mega = laid.cues.filter((c) => String(c.text).length > 80).length;
        assert.strictEqual(mega, 0);
    });

    it('mode: delivery finalize + healthy JA rescues dead ZH without glue', () => {
        const { ja } = makeTimedPair(24);
        const zh = ja.map((c, i) => ({
            index: i,
            startMs: 0,
            endMs: 500,
            text: `译${i}`,
        }));
        const out = finalize.finalizeDeliveryCues(ja, zh, {
            blankText: '…',
            forceRematerialize: true,
            pruneDebris: false,
        });
        assertNoMegaGlue(out.cues, 'finalize-rescue');
        assert.ok(out.cues.length >= 20);
        // Times should come from JA when rematerialize/index ran
        const timed = out.cues.filter((c) => Number(c.startMs) > 0).length;
        assert.ok(timed >= 16, `timed=${timed}`);
    });
});
