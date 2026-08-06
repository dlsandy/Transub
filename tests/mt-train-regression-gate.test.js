'use strict';

const assert = require('assert');
const train = require('../tools/mt-train/lib/train.js');
const regressionGate = require('../tools/mt-train/lib/regression-gate.js');
const sanitize = require('../src/js/mt-sanitize-core.js');

describe('mt-train forceShortestFragment + regression gate', () => {
    it('forceShortestFragment extracts local slice', () => {
        const frag = train.forceShortestFragment({
            dirty: '欸嘿嘿，太好了大家的情绪都好high',
            expect: '欸嘿嘿，太好了大家的情绪都挺高的',
        });
        assert.ok(!frag.unusable);
        assert.ok(frag.zhFrom.length < 12);
        assert.ok(frag.zhFrom.includes('high') || frag.zhTo.includes('挺高'));
    });

    it('forceShortestFragment rejects whole-sentence rewrite', () => {
        const frag = train.forceShortestFragment({
            dirty: 'Let\'s go...Let\'s go',
            expect: '让我们去...让我们去',
            zhFrom: 'Let\'s go...Let\'s go',
            zhTo: '让我们去...让我们去',
        });
        assert.strictEqual(frag.unusable, true);
    });

    it('narrowJaAnchor prefers repeated token over whole cue', () => {
        const ja = 'よかった、よかった...えへへよかった';
        const anchor = train.narrowJaAnchor(ja, { maxLen: 14 });
        assert.strictEqual(anchor, 'よかった');
        assert.strictEqual(train.isLowReuseAnchor(ja, ja), true);
        assert.strictEqual(train.isLowReuseAnchor(anchor, ja), false);
    });

    it('regression gate blocks mostly-whole zhFrom', () => {
        const gate = regressionGate.runRegressionGate(sanitize, {
            mode: 'replace',
            zh: 'abcdefghijklmnop',
            zhFrom: 'abcdefghijklmnop',
            zhTo: 'ABCDEFGHIJKLMNOP',
            jaAnchor: 'テスト長いアンカーです',
            expect: 'ABCDEFGHIJKLMNOP',
        }, { corpus: [] });
        assert.strictEqual(gate.ok, false);
        assert.ok(gate.lowReuse || gate.blocked);
    });

    it('regression gate blocks long JA anchors', () => {
        const ja = 'よかった、よかった...えへへよかった';
        const gate = regressionGate.runRegressionGate(sanitize, {
            mode: 'blank',
            zh: '太好了，太好了...欸嘿嘿，太好了...大家',
            zhFrom: '太好了，太好了...欸嘿嘿，太好了...大家',
            jaAnchor: ja,
            ja,
            expect: '…',
        }, { corpus: [] });
        assert.strictEqual(gate.ok, false);
        assert.ok(gate.longAnchor || gate.lowReuse);
    });

    it('regression gate flags high collateral extras', () => {
        const payload = {
            mode: 'replace',
            jaAnchor: 'イッちゃう',
            zhFrom: '射了',
            zhTo: '去了',
            zh: '要射了',
            expect: '要射了',
            ja: 'イッちゃうよ',
        };
        const corpus = [
            { ji: 1, src: 'イッちゃう', dst: '要射了', after: '要射了', issues: ['iku_shoot'] },
            { ji: 2, src: 'イッて', dst: '射了啊', after: '射了あ', issues: [] },
            { ji: 3, src: 'イッた', dst: '射了', after: '射了', issues: ['fixed:iku_shoot'] },
            { ji: 4, src: 'イッちゃうよ', dst: '射了呢', after: '射了呢', issues: [] },
            { ji: 5, src: 'ダイッ', dst: '射了呀', after: '射了呀', issues: [] },
        ];
        const gate = regressionGate.runRegressionGate(sanitize, payload, {
            corpus,
            targetJis: ['1'],
        });
        assert.ok(gate.collateral);
        assert.ok(gate.collateral.extra >= 1);
    });
});
