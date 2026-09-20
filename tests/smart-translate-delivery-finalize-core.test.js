const assert = require('assert');
const finalize = require('../src/js/smart-translate-delivery-finalize-core');
const align = require('../src/js/smart-translate-align-core');
const ellipsis = require('../src/js/hymt-ellipsis-policy-core');

describe('smart-translate-delivery-finalize-core', () => {
    it('culls orphan ZH and realigns onto JA timeline', () => {
        const ja = [
            { index: 0, startMs: 0, endMs: 2000, text: '字幕は Transub Pro で生成されました' },
            { index: 1, startMs: 10000, endMs: 12000, text: 'よろしくお願いします。' },
            { index: 2, startMs: 20000, endMs: 22000, text: '次の方、どうぞ。' },
            { index: 3, startMs: 30000, endMs: 32000, text: 'はい、わかりました。' },
        ];
        // ZH has drifted index pairing + an orphan start not on JA
        const zh = [
            { index: 0, startMs: 0, endMs: 2000, text: '字幕由 Transub Pro 生成' },
            { index: 1, startMs: 15000, endMs: 16000, text: '孤儿句不应保留' },
            { index: 2, startMs: 10000, endMs: 12000, text: '请多指教' },
            { index: 3, startMs: 30000, endMs: 32000, text: '好的，明白了' },
            { index: 4, startMs: 20000, endMs: 22000, text: '下一位，请' },
        ];
        const before = align.measureIndexStartAlignment(ja, zh);
        assert.ok(before.sameRate < 0.75, `sameRate=${before.sameRate}`);

        const out = finalize.finalizeDeliveryCues(ja, zh, { blankText: '…' });
        assert.strictEqual(out.cues.length, ja.length);
        assert.ok(out.changed);
        assert.ok(out.rematerialized > 0 || out.realigned > 0);
        const after = align.measureIndexStartAlignment(ja, out.cues);
        assert.ok(after.sameRate >= 0.99, `after sameRate=${after.sameRate}`);
        assert.ok(out.gateOk);
        assert.ok(!out.cues.some((c) => /孤儿/.test(String(c.text || ''))));
        const byStart = new Map(out.cues.map((c) => [c.startMs, c.text]));
        assert.strictEqual(byStart.get(10000), '请多指教');
        assert.strictEqual(byStart.get(20000), '下一位，请');
    });

    it('scrubs recycled long ZH after realign', () => {
        const phrase = '听说这里的厕所里有个家伙在舔自己';
        const ja = [
            { index: 0, startMs: 0, endMs: 1000, text: 'まつかなかがしゃらぶでーふのひだと聞いてきました' },
            { index: 1, startMs: 2000, endMs: 3000, text: 'Sよりよーよりもう…ちょっとここ勘弁しませんか?' },
            { index: 2, startMs: 4000, endMs: 5000, text: 'わかりました' },
        ];
        const zh = [
            { index: 0, startMs: 0, endMs: 1000, text: phrase },
            { index: 1, startMs: 2000, endMs: 3000, text: `而且 ${phrase} 好的` },
            { index: 2, startMs: 4000, endMs: 5000, text: '好的' },
        ];
        const out = finalize.finalizeDeliveryCues(ja, zh, { blankText: '…' });
        // cue0 is asr_garbage → pruned; glue recycle on remaining
        assert.ok(out.pruned >= 1 || out.scrubbed >= 1, out.flags);
        assert.ok(!out.cues.some((c) => /厕所/.test(String(c.text || ''))), out.cues);
    });
});

describe('moan-heavy ellipsis delete', () => {
    it('deletes はひゃ breath scraps instead of lexical recover', () => {
        assert.strictEqual(
            ellipsis.planEllipsisSlotAction('はひゃ、はひゃ…', '…').action,
            'delete',
        );
        assert.strictEqual(
            ellipsis.planEllipsisSlotAction('んっ、んんっ、んっあふっ…', '…').action,
            'delete',
        );
        // Still recover real dialogue with moan wrappers
        assert.strictEqual(
            ellipsis.planEllipsisSlotAction('大きくなったよ…はぁ…はぁ…', '…').action,
            'recover',
        );
    });
});
