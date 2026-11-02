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
        assert.strictEqual(b.fill, '嗯');
    });

    it('timed mid-dialogue うん/はい → 嗯/是的 within 2s', () => {
        const un = policy.planEllipsisSlotAction('うん', '…', {
            prevJa: '検査室に行ってください',
            nextJa: 'わかりました',
            prevEndMs: 1000,
            cueStartMs: 1200,
            cueEndMs: 1500,
            nextStartMs: 1800,
        });
        assert.strictEqual(un.action, 'recover');
        assert.strictEqual(un.reason, 'dialogue_ack_timed');
        assert.strictEqual(un.fill, '嗯');

        const hai = policy.planEllipsisSlotAction('はい', '好的', {
            prevJa: 'これでいいですか',
            nextJa: 'お願いします',
            prevEndMs: 2000,
            cueStartMs: 2100,
            cueEndMs: 2400,
            nextStartMs: 2600,
        });
        assert.strictEqual(hai.reason, 'dialogue_ack_timed');
        assert.strictEqual(hai.fill, '是的');

        // >2s gap → delete blank うん
        const wide = policy.planEllipsisSlotAction('うん', '…', {
            prevJa: '検査室に行ってください',
            nextJa: 'わかりました',
            prevEndMs: 1000,
            cueStartMs: 4000,
            cueEndMs: 4200,
            nextStartMs: 4500,
        });
        assert.strictEqual(wide.action, 'delete', wide.reason);

        const ja = [
            { text: '検査室に行ってください', startMs: 0, endMs: 1000 },
            { text: 'はい', startMs: 1100, endMs: 1400 },
            { text: 'わかりました', startMs: 1600, endMs: 2200 },
        ];
        const zh = [
            { text: '请去检查室', startMs: 0, endMs: 1000 },
            { text: '好的', startMs: 1100, endMs: 1400 },
            { text: '明白了', startMs: 1600, endMs: 2200 },
        ];
        const applied = policy.applyDialogueBridgeAckFills(zh, ja);
        assert.strictEqual(applied.filled, 1);
        assert.strictEqual(applied.cues[1].text, '是的');
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

    it('det-fills spoken dialogue that Hy-MT often blanks to …', () => {
        assert.strictEqual(policy.deterministicEllipsisFill('どうかしましたか?'), '怎么了');
        assert.strictEqual(policy.deterministicEllipsisFill('素敵ですよ'), '真漂亮');
        assert.strictEqual(policy.deterministicEllipsisFill('じゃあ服ちょっとあげますね。'), '那我稍微掀一下衣服哦');
        assert.strictEqual(policy.deterministicEllipsisFill('けど、ああ'), '但是，啊');
        assert.strictEqual(policy.deterministicEllipsisFill('ちょっと、恥ずかしいです'), '有点害羞');
        assert.strictEqual(policy.deterministicEllipsisFill('分かった'), '知道了');
        assert.strictEqual(policy.deterministicEllipsisFill('やめないで'), '别停');
        assert.strictEqual(policy.deterministicEllipsisFill('何してるの?'), '在做什么？');
        assert.strictEqual(policy.deterministicEllipsisFill('楽しみだよ'), '好期待');
        assert.strictEqual(policy.deterministicEllipsisFill('はぁ…よかった'), '太好了');
        assert.strictEqual(policy.planEllipsisSlotAction('けど、ああ', '…').action, 'recover');
        assert.strictEqual(policy.planEllipsisSlotAction('はぁ…よかった', '…').action, 'recover');
        assert.strictEqual(policy.planEllipsisSlotAction('ブラジャー', '…').action, 'recover');
        assert.strictEqual(policy.isPureMoanOrSfxJa('けど、ああ'), false);
        assert.strictEqual(policy.isPureMoanOrSfxJa('へー'), false);
        assert.strictEqual(policy.planEllipsisSlotAction('バイバイ', '…').action, 'recover');
    });

    it('deletes pure ん/んん breath instead of shipping 嗯', () => {
        for (const ja of ['ん、んん…', 'んん…んん', 'ん…ん…ん', 'すん', 'うんんん…んん']) {
            const plan = policy.planEllipsisSlotAction(ja, '…');
            assert.strictEqual(plan.action, 'delete', `${ja} => ${plan.action}/${plan.reason}`);
            assert.ok(policy.isPureMoanOrSfxJa(ja), ja);
        }
        // Dialogue ack うん must not be classified as moan
        assert.strictEqual(policy.isPureMoanOrSfxJa('うん'), false);
        assert.strictEqual(policy.isPureMoanOrSfxJa('うんうん'), false);
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
        for (const ja of [
            'マジでマジで',
            'ごめんね',
            'いけるよ',
            'もちろん',
            'それは',
            'でしょ?',
            'なんか',
            'おひゃいませー',
            'こんにゃく',
        ]) {
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
        for (const ja of ['はぁはぁ', 'ちゅーちゅー', 'ああ', 'んっんっ', 'んにゃぁんぁぁ']) {
            assert.strictEqual(policy.isPureMoanOrSfxJa(ja), true, ja);
            assert.strictEqual(policy.planEllipsisSlotAction(ja, '…').action, 'delete', ja);
        }
    });

    it('deletes cough/sniff/effort scraps instead of lexical recover', () => {
        for (const ja of [
            'すんすん…',
            'よいしょ…',
            'ちゅむっ',
            'ごほん…ごほん…',
            'げほっ、げほっ…',
            'ビヨン…ふふふ',
        ]) {
            assert.strictEqual(
                policy.planEllipsisSlotAction(ja, '…').action,
                'delete',
                ja,
            );
        }
    });

    it('deletes lone particle crumbs that used to false-hit substantive markers', () => {
        for (const ja of ['って', 'から', 'らって']) {
            const plan = policy.planEllipsisSlotAction(ja, '…');
            assert.strictEqual(plan.action, 'delete', `${ja} → ${plan.reason}`);
        }
    });

    it('deletes soft-AV mora mash scraps (NIMA-085 class)', () => {
        for (const ja of ['ちくりゅんんぅぅっ!', 'はひんち', 'おっとら…', 'あらかひ…', 'はちぇー…', 'あさりこ', 'みすひん', 'あい、あいみぃ、あいみぃ…']) {
            const plan = policy.planEllipsisSlotAction(ja, '…');
            assert.strictEqual(plan.action, 'delete', `${ja} → ${plan.reason}`);
        }
    });

    it('fills soft-AV nickname / short discourse blanks', () => {
        assert.strictEqual(policy.deterministicEllipsisFill('まこちゃん'), '真子酱');
        assert.strictEqual(policy.deterministicEllipsisFill('赤ちゃん'), '宝宝');
        assert.strictEqual(policy.deterministicEllipsisFill('なんスか'), '什么啊');
        assert.strictEqual(policy.deterministicEllipsisFill('おいで'), '过来');
        assert.strictEqual(policy.deterministicEllipsisFill('足で'), '用脚');
        assert.strictEqual(policy.deterministicEllipsisFill('おやおや'), '哎呀呀');
        assert.strictEqual(policy.deterministicEllipsisFill('やって'), '做吧');
        assert.strictEqual(policy.deterministicEllipsisFill('こっちは…'), '这边');
        assert.ok(/舔/.test(policy.deterministicEllipsisFill('ぺるぺるしちゃうね…んっ') || ''));
    });

    it('fills short deictics / ほらほら instead of shipping …', () => {
        assert.strictEqual(policy.deterministicEllipsisFill('それ'), '那个');
        assert.strictEqual(policy.deterministicEllipsisFill('これ'), '这个');
        assert.strictEqual(policy.deterministicEllipsisFill('ほらほら'), '你看');
        assert.strictEqual(policy.deterministicEllipsisFill('まあまあ'), '还好啦');
        assert.strictEqual(policy.deterministicEllipsisFill('好き'), '喜欢');
        assert.strictEqual(policy.deterministicEllipsisFill('好き?'), '喜欢吗？');
        assert.strictEqual(policy.deterministicEllipsisFill('恥ずかしい?'), '害羞吗？');
        assert.strictEqual(policy.deterministicEllipsisFill('ゆっくり…'), '慢慢地');
        assert.strictEqual(policy.deterministicEllipsisFill('ないです'), '没有');
        assert.strictEqual(policy.deterministicEllipsisFill('すいません'), '抱歉');
        assert.strictEqual(policy.deterministicEllipsisFill('これは…'), '这是');
        assert.strictEqual(policy.deterministicEllipsisFill('おしまい'), '结束了');
        assert.strictEqual(policy.deterministicEllipsisFill('どうです?'), '怎么样？');
        assert.strictEqual(policy.deterministicEllipsisFill('どうかした?'), '怎么了？');
        assert.strictEqual(policy.deterministicEllipsisFill('スマホ…'), '手机');
        assert.strictEqual(policy.deterministicEllipsisFill('しゅごい'), '好厉害');
        assert.strictEqual(policy.deterministicEllipsisFill('ってほら'), '你看');
        assert.strictEqual(policy.deterministicEllipsisFill('ごちそうさま。'), '多谢款待');
        assert.strictEqual(policy.deterministicEllipsisFill('マジ…'), '真的假的');
        assert.strictEqual(policy.deterministicEllipsisFill('ひどい…'), '好过分');
        assert.strictEqual(policy.deterministicEllipsisFill('あそこは…'), '那里');
        assert.strictEqual(policy.deterministicEllipsisFill('やったぁ…'), '太好了');
        assert.strictEqual(policy.deterministicEllipsisFill('うれしー…'), '好开心');
        assert.strictEqual(policy.deterministicEllipsisFill('嘘…'), '骗人');
        assert.strictEqual(policy.deterministicEllipsisFill('え、そうだよ'), '对啊');
        assert.strictEqual(policy.deterministicEllipsisFill('誕生日だよ。'), '是生日哦');
        assert.strictEqual(policy.deterministicEllipsisFill('マンゴー'), '芒果');
        assert.strictEqual(policy.deterministicEllipsisFill('ちょちょ'), '等等');
        const bareFill = (ja) => String(policy.deterministicEllipsisFill(ja) || '').replace(/[。．.]+$/g, '');
        assert.ok(/太好了/.test(bareFill('よかったです')), bareFill('よかったです'));
        assert.ok(/太好了/.test(bareFill('ああ、よかったです')), bareFill('ああ、よかったです'));
        assert.ok(/慢走|一路顺风/.test(bareFill('いってらっしゃい')), bareFill('いってらっしゃい'));
        assert.ok(/我出门了|我走了/.test(bareFill('行ってきまーす')), bareFill('行ってきまーす'));
    });

    it('deletes honorific/predicate crumbs and wet ASR mash', () => {
        for (const ja of ['します', 'さん', 'ちゃん', 'ですけど…', 'ぐちゅぐ', 'はひゃひきひ', 'んちゅうき。', 'ガタ', 'はちはち', 'はいって…', 'ひっく、ひっく、ひっく…', 'コホン', 'じゅぶっ', 'あめちもち…', 'ビンター…', 'うん、から', 'ずるずる…', 'ってばってばって…']) {
            assert.strictEqual(
                policy.planEllipsisSlotAction(ja, '…').action,
                'delete',
                ja,
            );
        }
    });
});
