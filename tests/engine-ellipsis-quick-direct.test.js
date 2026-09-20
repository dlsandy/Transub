const assert = require('assert');
const { mergeFilledCues } = require('../electron/engine-ellipsis-quick-direct');

describe('engine-ellipsis-quick-direct', () => {
    it('merges only non-ellipsis fills by index', () => {
        const zh = [
            { index: 1, text: '…' },
            { index: 2, text: '你好' },
            { index: 3, text: '…' },
        ];
        const isBlank = (t) => /^(?:\.\.\.|……|…)+$/.test(String(t || '').trim()) || !String(t || '').trim();
        const { cues, filled } = mergeFilledCues(
            zh,
            [
                { index: 1, text: '我们公司啊' },
                { index: 2, text: '被覆盖' },
                { index: 3, text: '…' },
            ],
            isBlank,
        );
        assert.strictEqual(filled, 2);
        assert.strictEqual(cues[0].text, '我们公司啊');
        assert.strictEqual(cues[1].text, '被覆盖');
        assert.strictEqual(cues[2].text, '…');
    });
});
