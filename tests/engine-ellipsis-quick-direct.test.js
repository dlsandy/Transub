const assert = require('assert');
const {
    mergeFilledCues,
    filterSubstantiveLexicalTodo,
    EXTRA_SUBSTANTIVE_ROUNDS,
} = require('../electron/engine-ellipsis-quick-direct');
const policy = require('../src/js/hymt-ellipsis-policy-core');

describe('engine-ellipsis-quick-direct', () => {
    it('keeps one extra substantive ellipsis round for neighbor-fill recovery', () => {
        assert.strictEqual(EXTRA_SUBSTANTIVE_ROUNDS, 1);
    });

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

    it('filterSubstantiveLexicalTodo keeps clear dialogue and drops scraps', () => {
        const todo = [
            { index: 1, text: '気にすることないよ' },
            { index: 2, text: 'す' },
            { index: 3, text: 'だし…' },
            { index: 4, text: 'お世話になっております。' },
        ];
        const kept = filterSubstantiveLexicalTodo(todo, policy);
        const texts = kept.map((c) => c.text);
        assert.ok(texts.includes('気にすることないよ'));
        assert.ok(texts.includes('お世話になっております。'));
        assert.ok(!texts.includes('す'));
        assert.ok(!texts.includes('だし…'));
    });
});
