'use strict';

const assert = require('assert');
const spoken = require('../src/js/mt-spoken-short-fill-zh-core');
const policy = require('../src/js/hymt-ellipsis-policy-core');
const sanitize = require('../src/js/mt-sanitize-core');

describe('mt-spoken-short-fill-zh-core', () => {
    it('fills reusable spoken stems and te/naide families', () => {
        assert.strictEqual(spoken.fillSpokenShortJaZh('分かった'), '知道了');
        assert.strictEqual(spoken.fillSpokenShortJaZh('何してるの?'), '在做什么？');
        assert.strictEqual(spoken.fillSpokenShortJaZh('やめないで'), '别停');
        assert.strictEqual(spoken.fillSpokenShortJaZh('見てて'), '看着');
        assert.strictEqual(spoken.fillSpokenShortJaZh('触って'), '摸摸');
        assert.strictEqual(spoken.fillSpokenShortJaZh('大好き'), '最喜欢');
        assert.strictEqual(spoken.fillSpokenShortJaZh('いいですね'), '真好啊');
        assert.strictEqual(spoken.fillSpokenShortJaZh('優しくして'), '温柔一点');
        assert.strictEqual(spoken.fillSpokenShortJaZh('気にしないで'), '别在意');
        assert.strictEqual(spoken.fillSpokenShortJaZh('バイバイ'), '拜拜');
        assert.strictEqual(spoken.fillSpokenShortJaZh('楽しみだよ'), '好期待');
        assert.strictEqual(spoken.fillSpokenShortJaZh('最高だよ'), '太棒了');
        assert.strictEqual(spoken.fillSpokenShortJaZh('はぁ…よかった'), '太好了');
        assert.strictEqual(spoken.fillSpokenShortJaZh('ふふ、スパイシーだ'), '好辣');
        assert.strictEqual(spoken.fillSpokenShortJaZh('ラナちゃん'), 'ラナ酱');
        assert.strictEqual(spoken.fillSpokenShortJaZh('あの、はいっ…'), '那个，好');
        assert.ok(/姐姐/.test(spoken.fillSpokenShortJaZh('ああ…あねちゃ') || ''));
        // SY-228 hesitation blanks — must not ship bare「…」
        assert.strictEqual(spoken.fillSpokenShortJaZh('ちょ、ちょっと…'), '等等');
        assert.strictEqual(spoken.fillSpokenShortJaZh('ちょっと待った…'), '等一下');
        assert.strictEqual(spoken.fillSpokenShortJaZh('やです'), '不要');
        assert.strictEqual(spoken.fillSpokenShortJaZh('おかしいですよ'), '太奇怪了');
        assert.strictEqual(spoken.fillSpokenShortJaZh('飲み込みました'), '咽下去了');
        assert.strictEqual(spoken.fillSpokenShortJaZh('せんせぇ'), '老师');
        assert.strictEqual(spoken.fillSpokenShortJaZh('ここから近いところです。'), '离这里很近');
        assert.strictEqual(spoken.fillSpokenShortJaZh('秘密です'), '是秘密');
        assert.strictEqual(spoken.fillSpokenShortJaZh('ステキです。'), '真漂亮');
        assert.strictEqual(spoken.fillSpokenShortJaZh('苦しいの?'), '难受吗？');
        assert.strictEqual(spoken.fillSpokenShortJaZh('業務終了です'), '下班了');
        assert.strictEqual(spoken.fillSpokenShortJaZh('始めよー。'), '开始吧');
        assert.strictEqual(spoken.fillSpokenShortJaZh('りがとうございます。'), '谢谢');
        assert.strictEqual(spoken.fillSpokenShortJaZh('ようございます'), '您好');
        assert.strictEqual(spoken.fillSpokenShortJaZh('美味しいです'), '好吃');
        assert.strictEqual(spoken.fillSpokenShortJaZh('熱いですよ'), '好烫');
        // Soft-AV ASR trunc kinship / short spoken (DANDYA-045 class)
        assert.strictEqual(spoken.fillSpokenShortJaZh('お父さ'), '爸爸');
        assert.strictEqual(spoken.fillSpokenShortJaZh('お母さ'), '妈妈');
        assert.strictEqual(spoken.fillSpokenShortJaZh('おねえさ'), '姐姐');
        assert.strictEqual(spoken.fillSpokenShortJaZh('姉さ'), '姐姐');
        assert.strictEqual(spoken.fillSpokenShortJaZh('僕'), '我');
        assert.strictEqual(spoken.fillSpokenShortJaZh('こたろー'), '小太郎');
        assert.strictEqual(spoken.fillSpokenShortJaZh('ごちそうさまです'), '多谢款待');
        assert.strictEqual(spoken.fillSpokenShortJaZh('見てない見てない'), '没看没看');
        assert.strictEqual(spoken.fillSpokenShortJaZh('はいちゃ'), '进去了');
        assert.strictEqual(spoken.fillSpokenShortJaZh('熱くて…ムチムチ'), '又烫又肉感');
        // JERA-class productive / trunc — must not ship bare「…」
        assert.strictEqual(spoken.fillSpokenShortJaZh('りがとう'), '谢谢');
        assert.strictEqual(spoken.fillSpokenShortJaZh('こんにち'), '你好');
        assert.strictEqual(spoken.fillSpokenShortJaZh('触りたいです'), '想摸');
        assert.strictEqual(spoken.fillSpokenShortJaZh('全然いいです'), '完全可以');
        assert.strictEqual(spoken.fillSpokenShortJaZh('どこどこ'), '哪里哪里');
        assert.strictEqual(policy.planEllipsisSlotAction('ずうごご', '…').action, 'delete');
        // Soft-AV discourse / kinship trunc batch
        assert.strictEqual(spoken.fillSpokenShortJaZh('奥さ'), '太太');
        assert.strictEqual(spoken.fillSpokenShortJaZh('まだまだだよ'), '还早呢');
        assert.strictEqual(spoken.fillSpokenShortJaZh('どうぞどうぞー'), '请请');
        assert.strictEqual(spoken.fillSpokenShortJaZh('よろしくま'), '请多指教');
        assert.ok(/不要/.test(spoken.fillSpokenShortJaZh('らめ…らめ…らめ…') || ''));
        assert.strictEqual(policy.planEllipsisSlotAction('めっ、めっ', '…').action, 'delete');
        // DLDSS-class shorts / ASR slip
        assert.strictEqual(spoken.fillSpokenShortJaZh('生活です'), '是生活');
        assert.strictEqual(spoken.fillSpokenShortJaZh('ぎ、ギラックスしすぎです'), '太放松了');
        assert.strictEqual(spoken.fillSpokenShortJaZh('痛い痛い…'), '好痛好痛');
        assert.strictEqual(spoken.fillSpokenShortJaZh('弟'), '弟弟');
        assert.strictEqual(spoken.fillSpokenShortJaZh('れだよ'), '就是这样');
        assert.strictEqual(spoken.fillSpokenShortJaZh('着きましたー'), '到了');
        assert.strictEqual(spoken.fillSpokenShortJaZh('してないしてない'), '没有没有');
        assert.strictEqual(spoken.fillSpokenShortJaZh('撮って撮って'), '拍啊拍啊');
        {
            const opaque = require('../src/js/mt-opaque-strings');
            assert.strictEqual(spoken.fillSpokenShortJaZh(opaque.T.ochinchinJa.slice(0, -1)), opaque.T.rodZh);
            assert.strictEqual(spoken.fillSpokenShortJaZh(opaque.T.peeJa), opaque.T.peeZh);
            assert.strictEqual(
                spoken.fillSpokenShortJaZh(`${opaque.T.seishiSlangJa}${opaque.T.seishiSlangJa}`),
                opaque.T.semenZh,
            );
            assert.ok(String(spoken.fillSpokenShortJaZh(`ボクくんの${opaque.T.seishiSlangJa}…`) || '').includes(opaque.T.semenZh));
        }
    });

    it('wires into ellipsis det-fill and final tidy (no bare …)', () => {
        const samples = [
            ['分かった', '知道了'],
            ['やめないで', '别停'],
            ['見て', '看'],
            ['いこう', '走吧'],
            ['そっか', '这样啊'],
            ['へー', '诶'],
            ['ちょ、ちょっと…', '等等'],
            ['やです', '不要'],
            ['せんせぇ', '老师'],
            ['おかしいですよ', '太奇怪了'],
        ];
        for (const [ja, zh] of samples) {
            assert.strictEqual(policy.deterministicEllipsisFill(ja), zh);
            const plan = policy.planEllipsisSlotAction(ja, '…');
            assert.strictEqual(plan.action, 'recover');
            const tidy = sanitize.sanitizeMtCueText('…', ja, { finalTidy: true });
            assert.ok(tidy?.text && tidy.text !== '…', `${ja} still …`);
            assert.ok(!/^[…·.•\s]*$/.test(tidy.text), `${ja} empty tidy`);
        }
    });

    it('does not hard-delete short recoverable loans / reactions', () => {
        for (const ja of ['バイバイ', 'ティッシュ', 'へー', 'ふーん', 'イク', 'たぶん']) {
            const plan = policy.planEllipsisSlotAction(ja, '…');
            assert.strictEqual(plan.action, 'recover', ja);
        }
    });
});
