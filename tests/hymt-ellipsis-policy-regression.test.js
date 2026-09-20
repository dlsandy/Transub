/**
 * Regression fixtures for Hy-MT2 ellipsis / filler policy.
 * Keep ~20–30 reusable JA/ZH patterns — not title-locked.
 */
const assert = require('assert');
const policy = require('../src/js/hymt-ellipsis-policy-core');
const hymt = require('../src/js/hymt-translate-core');

/** @type {{ ja: string, zh: string, expect: 'delete'|'recover'|'keep', note?: string, prev?: string, next?: string }[]} */
const FIXTURES = [
    // Pure moan / SFX → delete
    { ja: 'はぁ はぁ', zh: '…', expect: 'delete', note: 'breath' },
    { ja: 'あぁん', zh: '…', expect: 'delete', note: 'moan' },
    { ja: 'ちゅーちゅー', zh: '…', expect: 'delete', note: 'kiss sfx' },
    { ja: 'んにゃぁ んぁぁ', zh: '…', expect: 'delete', note: 'moan scrap' },
    { ja: 'ひぐぅぅっ', zh: '…', expect: 'delete', note: 'gasp' },
    { ja: 'がはっ', zh: '…', expect: 'delete', note: 'impact' },
    { ja: 'す', zh: '…', expect: 'recover', note: 'short scrap → recover (avoid false-moan on soft dialogue)' },
    // Pure discourse without bridge → delete
    { ja: 'うん', zh: '…', expect: 'delete', prev: 'はぁ', next: 'あぁん', note: 'isolated うん' },
    { ja: 'はい', zh: '嗯', expect: 'delete', prev: 'ふふっ', next: 'そう', note: 'isolated はい' },
    // Discourse with bridge → recover/keep
    {
        ja: 'うん',
        zh: '…',
        expect: 'recover',
        prev: '検査室に行ってください',
        next: 'わかりました',
        note: 'bridge うん',
    },
    {
        ja: 'なに',
        zh: '…',
        expect: 'recover',
        prev: '先生が呼んでる',
        next: '今行く',
        note: 'question',
    },
    { ja: 'せんせー', zh: '…', expect: 'recover', note: 'address' },
    { ja: 'ねえ', zh: '…', expect: 'recover', prev: 'ちょっと', next: '聞いて', note: 'call-out' },
    // Lexical blanks → recover
    { ja: 'まだ何も答えられないんでここに触られると ごめんなさい', zh: '…', expect: 'recover', note: 'long' },
    { ja: 'ブレインストーン・インターフェース', zh: '…', expect: 'recover', note: 'loanword' },
    { ja: 'アイス', zh: '…', expect: 'recover', note: 'ice cream' },
    { ja: 'すごー', zh: '…', expect: 'recover', note: 'amazing' },
    { ja: 'かわいそう', zh: '…', expect: 'recover', note: 'pity' },
    { ja: 'ミセリオ・ドゥーヴ', zh: '…', expect: 'recover', note: 'name' },
    { ja: 'おはようございます', zh: '早上好', expect: 'keep', note: 'faithful' },
    { ja: '大丈夫だよ', zh: '没事的', expect: 'keep', note: 'faithful short' },
    { ja: 'はぁ やめやめ', zh: '…', expect: 'recover', note: 'breath+stop lexical' },
    { ja: 'はひゅはひゅ', zh: '…', expect: 'delete', note: 'asr breath scrap' },
    { ja: 'あひゅ', zh: '…', expect: 'delete', note: 'asr gasp scrap' },
    { ja: 'うごち', zh: '…', expect: 'delete', note: 'asr scrap' },
    { ja: 'あーめ', zh: '…', expect: 'delete', note: 'asr scrap ame' },
    // Deterministic ASR debris (katakana / mora soup) → delete even if ZH filled
    { ja: 'スタイケン', zh: '…', expect: 'delete', note: 'katakana scrap' },
    { ja: 'ちゅきら', zh: '…', expect: 'delete', note: 'mora scrap' },
    { ja: 'ちょこまね', zh: '乱译', expect: 'delete', note: 'mora scrap with junk ZH' },
    { ja: 'あっ ああっ んっ あきまっ', zh: '…', expect: 'delete', note: 'climax asr scrap' },
    { ja: 'あたんつ はぁはぁ ああ', zh: '… 啦啦啦', expect: 'delete', note: 'asr scrap translated' },
    { ja: 'おっきい', zh: '…', expect: 'recover', note: 'real short adj' },
    { ja: 'どうですか?', zh: '…', expect: 'recover', note: 'real question' },
    // Must NOT false-delete real short dialogue / wet SFX with meaning
    { ja: 'ちょっと', zh: '等一下', expect: 'keep', note: 'real ちょっと' },
    { ja: 'リラックスできた', zh: '放松下来了', expect: 'keep', note: 'real relax' },
    { ja: 'しちゃおうかな', zh: '要不要做呢', expect: 'keep', note: 'real volitional' },
    { ja: 'ぐしょぐしょ', zh: '湿漉漉的', expect: 'keep', note: 'wet sfx lexical' },
    { ja: 'ダメ じゃ', zh: '不行啊', expect: 'keep', note: 'real dame' },
    { ja: 'はい かなり ふふっ', zh: '嗯 相当…呵呵', expect: 'keep', note: 'lexical+laugh' },
    { ja: 'みたいなこっちも', zh: '这边也是', expect: 'keep', note: 'real fragment' },
    { ja: 'なんで?', zh: '为什么？', expect: 'keep', note: 'real why' },
    { ja: 'あ イク', zh: '要去了', expect: 'keep', note: 'climax lexical' },
    { ja: 'あイク はぁああっはぁああっ', zh: '要去了', expect: 'keep', note: 'climax+breath' },
    { ja: 'んんっ はぁはぁ あげて はぁんんっ', zh: '抬起来', expect: 'keep', note: 'あげて lexical' },
    { ja: 'ああ こと?', zh: '什么事？', expect: 'keep', note: 'こと lexical' },
    { ja: 'ああ すご', zh: '好厉害', expect: 'keep', note: 'すご lexical' },
    { ja: 'はぁ そう んんっ', zh: '是啊', expect: 'keep', note: 'そう lexical' },
    { ja: 'ああそう', zh: '啊是这样', expect: 'keep', note: 'ああそう' },
    { ja: 'あっ イくイくイくイくっ', zh: '要去了', expect: 'keep', note: 'イく climax' },
    // Translated moan may still delete when both filler
    { ja: 'はぁ…', zh: '哈啊', expect: 'delete', note: 'translated moan' },
];

describe('hymt-ellipsis-policy regression', () => {
    it('covers fixture matrix (delete / recover / keep)', () => {
        assert.ok(FIXTURES.length >= 20, `need ≥20 fixtures, got ${FIXTURES.length}`);
        const fails = [];
        for (const f of FIXTURES) {
            const plan = policy.planEllipsisSlotAction(f.ja, f.zh, {
                prevJa: f.prev || '',
                nextJa: f.next || '',
            });
            if (plan.action !== f.expect) {
                fails.push(`${f.note || f.ja}: got ${plan.action}/${plan.reason}, want ${f.expect}`);
            }
        }
        assert.strictEqual(fails.length, 0, fails.join('\n'));
    });

    it('deterministic fills cover common recover shorts', () => {
        assert.strictEqual(policy.deterministicEllipsisFill('せんせー'), '老师');
        assert.strictEqual(policy.deterministicEllipsisFill('なに'), '什么');
        assert.strictEqual(policy.deterministicEllipsisFill('アイス'), '冰淇淋');
        assert.strictEqual(policy.deterministicEllipsisFill('かわいそう'), '好可怜');
        assert.ok(policy.deterministicEllipsisFill('ブレインストーン・インターフェース'));
    });

    it('summarizePlanStats labels moan vs discourse vs bridge', () => {
        const zh = [
            { index: 1, text: '…' },
            { index: 2, text: '…' },
            { index: 3, text: '…' },
            { index: 4, text: '早上好' },
        ];
        const ja = [
            { index: 1, text: 'はぁはぁ' },
            { index: 2, text: 'うん' },
            { index: 3, text: 'せんせー' },
            { index: 4, text: 'おはようございます' },
        ];
        // Give うん isolated neighbors so it deletes
        const { plans } = policy.planCueListActions(
            zh,
            [
                ja[0],
                { ...ja[1], text: 'うん' },
                ja[2],
                ja[3],
            ],
        );
        // Re-plan うん with moan neighbors via direct plans
        const p0 = policy.planEllipsisSlotAction('はぁはぁ', '…');
        const p1 = policy.planEllipsisSlotAction('うん', '…', { prevJa: 'はぁ', nextJa: 'あぁん' });
        const p2 = policy.planEllipsisSlotAction('せんせー', '…');
        const p3 = policy.planEllipsisSlotAction('おはようございます', '早上好');
        const stats = policy.summarizePlanStats([
            { action: p0.action, reason: p0.reason },
            { action: p1.action, reason: p1.reason },
            { action: p2.action, reason: p2.reason },
            { action: p3.action, reason: p3.reason },
        ]);
        assert.ok(stats.deleteByReason.pure_moan >= 1);
        assert.ok(stats.deleteByReason.pure_discourse >= 1 || stats.deleted >= 2);
        assert.ok(stats.recover >= 1);
        assert.match(stats.summaryLine, /喘息|语气|待补/);
        void plans;
    });

    it('hard-fail prompt lines appear on ellipsis retry', () => {
        const msgs = hymt.buildHyMtChatMessages(
            [{ index: 0, text: 'まだ答えられない' }],
            {
                contentProfile: 'av_soft',
                hyMtMinimalPrompt: true,
                _blankRetry: true,
                _ellipsisHardFail: true,
                _ellipsisHardFailLong: true,
                nsfwLexicon: false,
                avGlossary: false,
                avActorGlossary: false,
            },
        );
        assert.match(msgs[0].content, /省略号/);
        assert.match(msgs[0].content, /严禁|禁止/);
    });
});
