const assert = require('assert');
const qc = require('../src/js/delivery-underfill-qc-core');

describe('delivery-underfill-qc-core', () => {
    it('classifies bare 哈 / under-lick / ja leak / recoverable …', () => {
        assert.strictEqual(
            qc.classifyDeliveryUnderfill('哈', 'はぁ やめやめ')?.kind,
            'bare_ha',
        );
        assert.strictEqual(
            qc.classifyDeliveryUnderfill('舔', 'ポテチ舐めて?')?.kind,
            'under_lick',
        );
        assert.strictEqual(
            qc.classifyDeliveryUnderfill('[object Object]', '久しぶりのテスト')?.kind,
            'ja_leak',
        );
        assert.strictEqual(
            qc.classifyDeliveryUnderfill('まだ何も', 'まだ何も答えられない')?.kind,
            'ja_leak',
        );
        assert.strictEqual(
            qc.classifyDeliveryUnderfill('…', 'まだ何も答えられない')?.kind,
            'ellipsis_recover',
        );
        // Pure moan「哈…」is acceptable
        assert.strictEqual(
            qc.classifyDeliveryUnderfill('哈…', 'はぁはぁ'),
            null,
        );
        assert.strictEqual(
            qc.classifyDeliveryUnderfill('早上好', 'おはようございます'),
            null,
        );
    });

    it('repairs bare 哈 and under-translated 舔 after viewing-punct style collapse', () => {
        const repaired = qc.repairDeliveryUnderfillCues(
            [
                { index: 0, startMs: 0, endMs: 1000, text: '哈' },
                { index: 1, startMs: 1000, endMs: 2000, text: '舔' },
                { index: 2, startMs: 2000, endMs: 3000, text: '好的' },
            ],
            [
                { index: 0, startMs: 0, endMs: 1000, text: 'はぁ やめやめ' },
                { index: 1, startMs: 1000, endMs: 2000, text: 'ポテチ舐めて?' },
                { index: 2, startMs: 2000, endMs: 3000, text: 'はい' },
            ],
            { skipFillBlank: true },
        );
        assert.ok(repaired.changed);
        assert.ok(repaired.stats.repaired >= 2);
        assert.ok(/别/.test(repaired.cues[0].text), repaired.cues[0].text);
        assert.ok(/薯片|舔舔/.test(repaired.cues[1].text), repaired.cues[1].text);
        assert.ok(!qc.isJaLeakZh(repaired.cues[0].text));
        assert.strictEqual(repaired.cues[2].text, '好的');
    });

    it('countDeliveryUnderfill reports remaining defects', () => {
        const stats = qc.countDeliveryUnderfill(
            [
                { index: 0, startMs: 0, endMs: 1000, text: '哈' },
                { index: 1, startMs: 1000, endMs: 2000, text: '…' },
            ],
            [
                { index: 0, startMs: 0, endMs: 1000, text: 'はぁ やめやめ' },
                { index: 1, startMs: 1000, endMs: 2000, text: 'まだ何も答えられない' },
            ],
        );
        assert.ok(stats.bareHa >= 1);
        assert.ok(stats.ellipsisRecover >= 1);
        assert.ok(stats.totalLeft >= 2);
        assert.ok(/裸哈|实义省略号/.test(qc.summarizeUnderfillStats(stats)));
    });
});
