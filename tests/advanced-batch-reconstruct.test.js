const assert = require('assert');
const {
    attachSourceTexts,
    mergeTextsIntoCues,
} = require('../electron/advanced-batch-reconstruct');

describe('advanced-batch-reconstruct helpers', () => {
    it('attaches source text by overlap', () => {
        const cues = [
            { index: 0, startMs: 0, endMs: 1000, text: '你好' },
            { index: 1, startMs: 2000, endMs: 3000, text: '世界' },
        ];
        const sources = [
            { startMs: 0, endMs: 1000, text: 'hello' },
            { startMs: 2000, endMs: 3000, text: 'world' },
        ];
        const out = attachSourceTexts(cues, sources);
        assert.strictEqual(out[0].sourceText, 'hello');
        assert.strictEqual(out[1].sourceText, 'world');
    });

    it('merges updates by index', () => {
        const cues = [
            { index: 0, text: 'a' },
            { index: 1, text: 'b' },
        ];
        const { cues: next, changed } = mergeTextsIntoCues(cues, [
            { index: 1, text: 'B' },
        ]);
        assert.strictEqual(changed, 1);
        assert.strictEqual(next[0].text, 'a');
        assert.strictEqual(next[1].text, 'B');
    });
});
