const assert = require('assert');
const policy = require('../src/js/hymt-ellipsis-policy-core');

describe('hymt-ellipsis-policy-core', () => {
    it('deletes pure moan/SFX with ellipsis ZH', () => {
        const a = policy.planEllipsisSlotAction('はぁ はぁ', '…');
        assert.strictEqual(a.action, 'delete');
        assert.strictEqual(a.reason, 'pure_moan');
        const b = policy.planEllipsisSlotAction('ちゅーちゅー', '…');
        assert.strictEqual(b.action, 'delete');
    });

    it('deletes pure discourse without bridge neighbors', () => {
        const a = policy.planEllipsisSlotAction('うん', '…', {
            prevJa: 'はぁ',
            nextJa: 'あぁん',
        });
        assert.strictEqual(a.action, 'delete', a.reason);
    });

    it('keeps/recovers discourse with bridge value', () => {
        const a = policy.planEllipsisSlotAction('なに', '…', {
            prevJa: '検査室に行ってください',
            nextJa: 'わかりました',
        });
        assert.strictEqual(a.action, 'recover');
        assert.match(a.reason, /bridge|lexical/);

        const b = policy.planEllipsisSlotAction('うん', '…', {
            prevJa: '検査室に行ってください',
            nextJa: 'わかりました',
        });
        assert.strictEqual(b.action, 'recover');
        assert.strictEqual(b.reason, 'discourse_bridge');
    });

    it('recovers lexical blanks including sensei / loanwords', () => {
        assert.strictEqual(policy.planEllipsisSlotAction('せんせー', '…').action, 'recover');
        assert.strictEqual(
            policy.planEllipsisSlotAction('まだ何も答えられないんでここに触られると ごめんなさい', '…').action,
            'recover',
        );
        assert.strictEqual(
            policy.planEllipsisSlotAction('ブレインストーン・インターフェース', '…').action,
            'recover',
        );
    });

    it('deterministic fills common shorts', () => {
        assert.strictEqual(policy.deterministicEllipsisFill('せんせー'), '老师');
        assert.strictEqual(policy.deterministicEllipsisFill('なに'), '什么');
        assert.strictEqual(policy.deterministicEllipsisFill('すごー'), '好厉害');
        assert.strictEqual(policy.deterministicEllipsisFill('アイス'), '冰淇淋');
    });

    it('planCueListActions separates delete vs recover', () => {
        const zh = [
            { index: 1, text: '…' },
            { index: 2, text: '…' },
            { index: 3, text: '…' },
        ];
        const ja = [
            { index: 1, text: 'はぁはぁ' },
            { index: 2, text: 'せんせー' },
            { index: 3, text: 'なに' },
        ];
        const { deletes, recovers } = policy.planCueListActions(zh, ja);
        assert.ok(deletes.includes(0));
        assert.ok(recovers.includes(1));
        assert.ok(recovers.includes(2));
    });

    it('recovers short lexical JA that must not be misclassified as moan', () => {
        for (const ja of ['マジでマジで', 'ごめんね', 'いけるよ', 'もちろん', 'それは', 'でしょ?', 'なんか', 'おひゃいませー']) {
            assert.strictEqual(
                policy.isPureMoanOrSfxJa(ja),
                false,
                `false moan: ${ja}`,
            );
            assert.strictEqual(
                policy.planEllipsisSlotAction(ja, '…').action,
                'recover',
                `recover: ${ja}`,
            );
        }
    });

    it('still deletes true moan/SFX', () => {
        for (const ja of ['はぁはぁ', 'ちゅーちゅー', 'ああ', 'んっんっ']) {
            assert.strictEqual(policy.isPureMoanOrSfxJa(ja), true, ja);
            assert.strictEqual(policy.planEllipsisSlotAction(ja, '…').action, 'delete', ja);
        }
    });
});
