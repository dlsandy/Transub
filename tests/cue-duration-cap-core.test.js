const assert = require('assert');
const cap = require('../src/js/cue-duration-cap-core');
const finalize = require('../src/js/smart-translate-delivery-finalize-core');

describe('cue-duration-cap-core', () => {
    it('caps long filler「嗯」inherited from ん、ん islands', () => {
        const zh = [
            { index: 1, startMs: 0, endMs: 7470, text: '嗯' },
            { index: 2, startMs: 10000, endMs: 11200, text: '请多指教' },
        ];
        const ja = [
            { index: 1, startMs: 0, endMs: 7470, text: 'ん、ん' },
            { index: 2, startMs: 10000, endMs: 11200, text: 'よろしくお願いします。' },
        ];
        const out = cap.capFillerMoanCueDurations(zh, ja);
        assert.ok(out.changed);
        assert.ok(out.capped >= 1);
        const d0 = Number(out.cues[0].endMs) - Number(out.cues[0].startMs);
        assert.ok(d0 <= cap.DEFAULT_FILLER_MAX_MS + 1, `dur=${d0}`);
        assert.ok(d0 >= 200);
        // Lexical cue untouched
        assert.strictEqual(out.cues[1].endMs, 11200);
    });

    it('soft-caps short reactive stubs like「好舒服」', () => {
        const zh = [{ index: 1, startMs: 0, endMs: 4720, text: '好舒服' }];
        const ja = [{ index: 1, startMs: 0, endMs: 4720, text: 'はぁ…気持ちいい…' }];
        const out = cap.capFillerMoanCueDurations(zh, ja);
        assert.ok(out.changed);
        const d0 = Number(out.cues[0].endMs) - Number(out.cues[0].startMs);
        assert.ok(d0 <= cap.DEFAULT_SHORT_TEXT_MAX_MS + 1, `dur=${d0}`);
    });

    it('does not cap normal dialogue', () => {
        const zh = [{ index: 1, startMs: 0, endMs: 4000, text: '青梅竹马哪有什么体贴不体贴的啊。' }];
        const ja = [{ index: 1, startMs: 0, endMs: 4000, text: '幼馴染に優しさとかないでしょ。' }];
        const out = cap.capFillerMoanCueDurations(zh, ja);
        assert.ok(!out.changed);
        assert.strictEqual(out.cues[0].endMs, 4000);
    });
});

describe('finalizeDeliveryCues duration cap', () => {
    it('applies filler duration cap in delivery finalize', () => {
        const ja = [
            { index: 0, startMs: 0, endMs: 2000, text: '字幕は Transub Pro で生成されました' },
            { index: 1, startMs: 5000, endMs: 12470, text: 'ん、ん' },
            { index: 2, startMs: 15000, endMs: 17000, text: 'わかりました' },
        ];
        const zh = [
            { index: 0, startMs: 0, endMs: 2000, text: '字幕由 Transub Pro 生成' },
            { index: 1, startMs: 5000, endMs: 12470, text: '嗯' },
            { index: 2, startMs: 15000, endMs: 17000, text: '明白了' },
        ];
        // Keep the filler pair: pruneDebris would drop ん、ん→「嗯」before the cap runs.
        const out = finalize.finalizeDeliveryCues(ja, zh, {
            blankText: '…',
            pruneDebris: false,
        });
        assert.ok(out.durationCapped >= 1, out.flags);
        const hmm = out.cues.find((c) => String(c.text).trim() === '嗯');
        assert.ok(hmm);
        const d = Number(hmm.endMs) - Number(hmm.startMs);
        assert.ok(d <= 2500, `dur=${d}`);
    });
});
