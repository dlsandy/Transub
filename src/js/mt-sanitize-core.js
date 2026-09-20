/**
 * Post-MT cue sanitization: strip Gloss leaks, collapse pathological repeats,
 * unify person-name variants, and cap length explosions vs source (browser + Node).
 */
(function (global, factory) {
    const fluency = (typeof module !== 'undefined' && module.exports)
        ? require('./subtitle-fluency-core')
        : (global && global.TransubSubtitleFluency);
    let glossaryCore = null;
    try {
        glossaryCore = (typeof module !== 'undefined' && module.exports)
            ? require('./subtitle-glossary-core')
            : (global && global.TransubSubtitleGlossary);
    } catch (_) {
        glossaryCore = null;
    }
    let jaNames = null;
    try {
        jaNames = (typeof module !== 'undefined' && module.exports)
            ? require('./ja-person-names-core')
            : (global && global.TransubJaPersonNames);
    } catch (_) {
        jaNames = null;
    }
    let nsfwLex = null;
    try {
        nsfwLex = (typeof module !== 'undefined' && module.exports)
            ? require('./tone-adapt-lexicon-core')
            : (global && (global.TransubToneAdaptLexicon || global.TransubJaNsfwLexicon));
    } catch (_) {
        nsfwLex = null;
    }
    let mtOpaque = null;
    try {
        mtOpaque = (typeof module !== 'undefined' && module.exports)
            ? require('./mt-opaque-strings')
            : (global && global.TransubMtOpaque);
    } catch (_) {
        mtOpaque = null;
    }
    let lexicon = null;
    try {
        lexicon = (typeof module !== 'undefined' && module.exports)
            ? require('./mt-sanitize-lexicon')
            : (global && global.TransubMtSanitizeLexicon);
    } catch (_) {
        lexicon = null;
    }
    let targetLangCore = null;
    try {
        targetLangCore = (typeof module !== 'undefined' && module.exports)
            ? require('./subtitle-target-lang-core')
            : (global && global.TransubSubtitleTargetLang);
    } catch (_) {
        targetLangCore = null;
    }
    const api = factory(fluency, glossaryCore, jaNames, nsfwLex, mtOpaque, lexicon, targetLangCore);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubMtSanitize = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function mtSanitizeCoreFactory(fluency, glossaryCore, jaNames, nsfwLex, mtOpaque, lexicon, targetLangCore) {
    /** Engine protect placeholders + accidental "Gloss1234" / "GLOS2658克" leaks. */
    // Include bare __GLOSSE / __GLOSS12__ (optional digits / trailing __)
    const GLOSS_TOKEN_RE = /__GLOS[A-Z0-9]*|Gloss#{0,4}\d+_*/gi;
    /** Bare glossary ids the model invents without underscores (GLOS2658克 / GLOSS12 / GLOSSES2152). */
    const BARE_GLOSS_TOKEN_RE = /GLOS[\sA-Z]*\d{2,8}(?:克|[gG])?/gi;
    /** Hash-style gloss debris from llama/BPE (`_#G2643_` / `_#_`). */
    const HASH_GLOSS_TOKEN_RE = /_#G\d+_?|_#_/gi;
    /** Any double-underscore LLM/meta placeholder (e.g. __香水的代号__). */
    const GENERIC_PLACEHOLDER_RE = /__([^_\n]{1,64})__/g;
    const CHEW_SFX_CHUNK_RE = /(?:んむ|あむ|はむ|ハム|んぶ|ンブ|むにゃ|もぐ|モグ|むぐ)+[っッぅうゥウ]*/g;
    const MOAN_CHAR_CLASS_RE = /[あぁアァうぅウゥおぉオォんンっッ゛゜はひふへほハヒフヘホー〜～…・!?！？。、,\s~～〜♡♥❤]/g;

    const JA_PERSON_RE = /([一-龯ぁ-んァ-ンー]{1,6}?)(さん|くん|ちゃん|君|様|氏)/g;
    const ZH_PERSON_RE = /([\u4e00-\u9fff]{1,4})(同学|小姐|先生|桑|君|酱|酱酱|大人|老师)/g;

    const OT = mtOpaque?.T || {};
    const dCore = (b64) => (typeof mtOpaque?.d === 'function' ? mtOpaque.d(b64) : Buffer.from(b64, 'base64').toString('utf8'));
    const reCore = (b64, flags = '') => new RegExp(dCore(b64), flags);
    const OFIX = mtOpaque?.FIX || {};
    const COMMON_KEEP_TOKENS = new Set([
        '好的', '是的', '不是', '没有', '可以', '不行', '没事', '对不起', '抱歉',
        '谢谢', '再见', '加油', '真的', '当然', '怎么', '什么', '哪里', '为什么',
        '好吧', '好啦', '嗯嗯', '啊啊', '哈哈', '呵呵', '唉呀', '哎呀',
        '明白了', '知道了', '了解了', '清楚了', '辛苦了', '麻烦了', '失礼了',
        '明白', '知道', '了解', '清楚', '辛苦', '拜托', '拜托了', '请多指教',
        '原来如此', '等一下', '早上好', '早啊',
        // Lecture / discourse connectors — never treat as cast-name stems (MFYD-182)
        '那么', '首先', '只是', '也就是说', '然后', '之后', '其实', '不过', '因此',
        '于是', '总之', '另外', '此外', '接着', '后来', '而且', '并且', '如果',
        '虽然', '这次', '今天', '现在', '慢慢来', '心跳加速',
        ...(OT.aboutToCumZh ? [OT.aboutToCumZh] : []), '好舒服', '舒服吗', '好开心', '也亲亲我', '亲一下',
        '别哭', '超棒', '好纠结', '振作起来', '别捣乱', '恰皮',
        ...(OT.rodZh ? [OT.rodZh] : []),
        ...(OT.meatRodZh ? [OT.meatRodZh] : []),
        '用那种心情', '再慢一点等我', '又消失了呢',
    ]);

    /** Frequent Sakura/LN hallucination names — prefer shared lexicon when available. */
    const POLLUTION_NAME_STEMS = jaNames?.POLLUTION_NAME_STEMS || new Set([
        '佳奈', '玲奈', '莉奈', '纱奈', '沙奈', '真理', '斗碧', '绘里', '绘真',
        '杏奈', '露娜', '妮可', '绮罗', '美咲', '结衣', '爱奈', '理绪', '理子',
        '乃爱', '奏翔', '桃子', '春奈', '阳菜', '凛', '葵', '樱', '希音',
    ]);

    /**
     * Single-char trailing tokens that are almost never real sentence endings.
     * Emotional particles stay via KEEP_SINGLE_TRAILING instead.
     */
    const SINGLE_CHAR_POLLUTION = new Set([
        '月', '琉', '律', '春', '桃', '玲', '陆', '舞', '花', '葵', '樱', '凛',
        '蓝', '兰', '翼', '光', '望', '萌', '杏', '铃', '雪', '梦',
    ]);

    /** Legitimate 1-char trailing interjections (do not strip). */
    const KEEP_SINGLE_TRAILING = new Set([
        '嗯', '啊', '哦', '噢', '哈', '唔', '呃', '哼', '呀', '哟', '吧', '呢',
        '吗', '嘛', '啦', '哇', '唉', '诶', '欸', '咿', '呜', '呼', '呵',
        '嗨', '喂', '哎', '好', '哔',
    ]);

    /**
     * JA → acceptable ZH surface forms. Used to keep real cast names (トミー→汤米).
     * Prefer shared lexicon; fallback keeps a minimal set.
     * @type {{ ja: RegExp, zh: string[] }[]}
     */
    const SOURCE_NAME_HINTS = jaNames?.SOURCE_NAME_HINTS || [
        { ja: /トミー+|トミ/i, zh: ['汤米', '托米', 'tommy', 'Tommy'] },
        { ja: /マイ+|舞/, zh: ['舞'] },
        { ja: /ハナ|花/, zh: ['花', '花奈', '花菜', '华'] },
        { ja: /倉木/, zh: ['仓木'] },
        { ja: /北野/, zh: ['北野', '喜多野'] },
    ];

    /**
     * LLM echoed the chat/user prompt (or a paraphrase) into the cue.
     * Includes Sakura glossary force echoes like:
     * 「根据以下的英文描述…将它翻译成「哈…」，请勿翻译成别的词…」
     * and NSFW / faithful system-prompt echoes (first-cue classic):
     * 「你是日译中字幕翻译。按汉化组习惯…严禁净化…」
     */
    const PROMPT_LEAK_RE = /将下面的日文|将下面术语表|将下面的?[【\[]|将下面这句|只输出译文|共\s*\d+\s*行|翻译的行数|请不要超过|请勿删除|根据以下术语表|根据以下的?.{0,16}(?:描述|翻译记录|英文句子)|不要编号[、，,]?\s*不要解释|碎句与拟声|原文仅为纯语气|时可译为对应短语气词|对白有完整语义|对应短语气词|lex-\d|请勿翻译成别的词|不翻译任何注释|如果描述中含有|请在不翻译|无须复译|照译出来|同音异义词|[你我]是(?:一个)?日译中字幕翻译|汉化组习惯|严禁净化|和谐或委婉改写|禁止照抄假名|每行只译对应一行|无意义叠词循环|忠实语气模式|本块启用忠实语气|勿净化[、,，]?\s*勿拒答|按原文强度直译|译名表|移至对应句中|待翻译字幕|待翻译|我来翻译(?:这条)?字幕|我们?开始翻译|不足以进行翻译|请提供更多的(?:上下文|字幕内容)|不能继续(?:这个)?字幕|请问有什么我?(?:可以)?帮助你的|非常感谢你帮我翻译|我会按照要求进行翻译|按照要求进行翻译|以下是翻译结果/i;

    /**
     * Model echoed a glossary / 译名表 dump instead of dialogue
     * e.g. 「(译名表：按摩油：按摩油，按摩：按摩，按摩店：男士按摩店)：」
     * or a single lexicon line 「ほぐす->放松推拿 #勿译放松」 / 「メンエス->男士按摩店」
     */
    function looksLikeGlossaryDump(text) {
        const t = String(text || '').trim();
        if (!t) return false;
        if (/译名表|术语表/.test(t) && /[：:→]|翻译成中文|->/.test(t)) return true;
        // Single lexicon mapping line (Sakura force-glossary echo)
        // Single lexicon mapping line (Sakura force-glossary echo).
        // Require arrow (->/→), not bare Chinese colon (時間：三点 would false-positive).
        if (/^(?:[\u3040-\u30ffァ-ヶーA-Za-z0-9]{1,24}|[\u4e00-\u9fff]{1,12})\s*(?:→|->|⇒)\s*[\u4e00-\u9fffA-Za-z0-9]{1,24}(?:\s*[#＃][\s\S]*)?[。．，,!！?？]*$/.test(t.replace(/\s+/g, ' ').trim())) {
            return true;
        }
        // Dense A：B，C：D（or A->B）colon/arrow pairs with little else
        const compact = t.replace(/\s+/g, '');
        const pairRe = /[\u4e00-\u9fffA-Za-z0-9ぁ-んァ-ヶ]{1,16}\s*(?:：|:|→|->|⇒)\s*[\u4e00-\u9fffA-Za-z0-9ぁ-んァ-ヶ]{1,16}/g;
        const pairs = compact.match(pairRe) || [];
        if (pairs.length < 2) return false;
        const joinedLen = pairs.join('').length;
        // Mostly a list of term mappings (allow wrapping punct)
        if (joinedLen >= Math.max(8, compact.length * 0.55)) return true;
        return false;
    }

    const ZH_HONORIFIC_SUFFIX_RE = /(?:同学|小姐|先生|桑|君|酱|大人|老师)$/;

    /**
     * JA mens-esthe / soft-AV ASR mishears → correct Japanese before MT.
     * Longest-first; keep conservative (high-confidence only).
     * Non-sensitive pairs: shared/ja-asr-domain-fixes.json (+ browser fallback).
     * Sensitive adult pairs: mt-opaque-strings (merged at load).
     */
    const JA_ASR_DOMAIN_FIX_PAIRS_FALLBACK = Object.freeze([
        { from: 'ご役の方ですか', to: 'ご予約の方ですか' },
        { from: 'ご役の方です', to: 'ご予約の方です' },
        { from: 'ご役の方', to: 'ご予約の方' },
        { from: 'いかじです', to: 'いかがです' },
        { from: 'いかがですよ', to: 'いかがですか' },
        { from: 'それちまえにちゃんと', to: 'それちゃんと前も' },
        { from: 'オイルマッサジ', to: 'オイルマッサージ' },
        { from: 'リンパマッサジ', to: 'リンパマッサージ' },
        { from: 'リンパを伸ばす', to: 'リンパを流す' },
        { from: 'うつぶせにな', to: 'うつ伏せにな' },
        { from: 'あおむけにな', to: '仰向けにな' },
        { from: 'メンズエスは', to: 'メンズエステは' },
        { from: 'メンズエスに', to: 'メンズエステに' },
        { from: 'メンズエス店', to: 'メンズエステ店' },
        { from: '男性エステ', to: 'メンズエステ' },
        { from: '気長しちゃって', to: '緊張しちゃって' },
        { from: '埋め合って', to: 'お待たせして' },
        { from: '足フェンジ', to: '足フェチ' },
        { from: 'うつぶせに', to: 'うつ伏せに' },
        { from: 'あおむけに', to: '仰向けに' },
        { from: '前向けに', to: '仰向けに' },
        { from: '関東させて', to: '担当させて' },
        { from: '本日は関東', to: '本日担当' },
        { from: '関東します', to: '担当します' },
        { from: '気長して', to: '緊張して' },
        { from: '気長する', to: '緊張する' },
        { from: '気長しちゃ', to: '緊張しちゃ' },
        { from: 'メンズエス', to: 'メンズエステ' },
        { from: 'メンエステ', to: 'メンズエステ' },
        { from: 'マッサジー', to: 'マッサージ' },
        { from: 'うつぶせ', to: 'うつ伏せ' },
        { from: 'あおむけ', to: '仰向け' },
        { from: '半パン', to: '半パンツ' },
        { from: '紙パン', to: '半パンツ' },
        { from: 'トロック', to: 'トロトロ' },
        { from: 'アイル', to: 'オイル' },
        { from: 'アイユ', to: 'オイル' },
        { from: 'リムの', to: 'リンパの' },
        { from: 'はぐし', to: 'ほぐし' },
        { from: 'マッサジ', to: 'マッサージ' },
        { from: '埋め合ったら', to: 'お待たせしたら' },
        { from: '埋めあわせたら', to: 'お待たせしたら' },
        { from: '埋め合わせたら', to: 'お待たせしたら' },
        { from: 'お客様のペースが柔らかい', to: 'お客様の肌が柔らかい' },
        { from: 'お酒ございましぇん', to: '申し訳ございません' },
        { from: 'パンパンエスニャー', to: 'パンパンですねー' },
        { from: '大好きなアップで挟', to: '大好きなおっぱいで挟' },
        { from: '購入しててください', to: '興奮しててください' },
        { from: 'あいみょんのせい', to: 'オイルのせい' },
        { from: 'お手紙できますか', to: '仰向けできますか' },
        { from: 'お酒ございません', to: '申し訳ございません' },
        { from: 'はぶれていきます', to: 'ほぐれていきます' },
        { from: 'アパイタに入った', to: 'アルバイトに入った' },
        { from: 'トイレ追加します', to: 'オイル追加します' },
        { from: 'トロックになって', to: 'トロトロになって' },
        { from: 'マイクロビッキン', to: 'マイクロビキニ' },
        { from: '基礎してください', to: 'キスしてください' },
        { from: '大好きなアップル', to: '大好きなおっぱい' },
        { from: '座を抜けになって', to: 'うつ伏せになって' },
        { from: '祖父とは違います', to: '風俗とは違います' },
        { from: 'いいこねだった', to: 'いい子ねだった' },
        { from: 'いい子に捨てて', to: 'いい子にしてて' },
        { from: 'にはぐしていく', to: 'にほぐしていく' },
        { from: 'アイルたくさん', to: 'オイルたくさん' },
        { from: 'カスパイマスタ', to: 'くださいマスター' },
        { from: 'カッカリオイル', to: 'たっぷりオイル' },
        { from: 'グラブンサンド', to: 'クラブサンド' },
        { from: 'マイトに入った', to: 'バイトに入った' },
        { from: 'リンプを伸ばす', to: 'リンパを流す' },
        { from: '丹念にはぐして', to: '丹念にほぐして' },
        { from: '前向けになって', to: '仰向けになって' },
        { from: '関東いたします', to: '担当いたします' },
        { from: 'あっぱいで挟', to: 'おっぱいで挟' },
        { from: 'おかみせずに', to: 'おかまいなく' },
        { from: 'お酒ございま', to: '申し訳ございま' },
        { from: 'さんとリンパ', to: 'ちゃんとリンパ' },
        { from: 'に省していく', to: 'にほぐしていく' },
        { from: 'はぐしていく', to: 'ほぐしていく' },
        { from: 'アップルで挟', to: 'おっぱいで挟' },
        { from: 'インエス遊び', to: 'メンエス遊び' },
        { from: 'ウェルで塗る', to: 'オイルで塗る' },
        { from: 'テープリンパ', to: 'たっぷりリンパ' },
        { from: 'メインエスは', to: 'メンエスは' },
        { from: 'メスはいい子', to: 'ゲストはいい子' },
        { from: 'メスは良い子', to: 'ゲストは良い子' },
        { from: 'メンズエスタ', to: 'メンズエステ' },
        { from: 'メンズレスト', to: 'メンズエステ' },
        { from: 'リンプを流す', to: 'リンパを流す' },
        { from: '丹念に省して', to: '丹念にほぐして' },
        { from: '入れたくさん', to: 'オイルたくさん' },
        { from: '入れ足します', to: 'オイル足します' },
        { from: '張りつ舞って', to: '張りつめて' },
        { from: '本島より追加', to: 'オイルを追加' },
        { from: '誰に根もある', to: '誰にでもある' },
        { from: 'あいみょん', to: 'オイル' },
        { from: dCore('44GE44GC44Gh44KF44GE'), to: dCore('44Kk44OD44Gh44KD44GG') },
        { from: 'きもちいい', to: '気持ちいい' },
        { from: 'きもちいー', to: '気持ちいい' },
        { from: 'すごきれい', to: 'すごく綺麗' },
        { from: 'とかボリー', to: 'とかオイル' },
        { from: 'にはぐして', to: 'にほぐして' },
        { from: 'をはぐして', to: 'をほぐして' },
        { from: 'アップで挟', to: 'おっぱいで挟' },
        { from: 'キれいだよ', to: '綺麗だよ' },
        { from: 'キモチいい', to: '気持ちいい' },
        { from: 'トイレ追加', to: 'オイル追加' },
        { from: 'メインエス', to: 'メンエス' },
        { from: 'メンエース', to: 'メンエス' },
        { from: 'リムを流す', to: 'リンパを流す' },
        { from: 'ワッサージ', to: 'マッサージ' },
        { from: '免税しては', to: 'メンエスは' },
        { from: '免税して来', to: 'メンエスに来' },
        { from: '暗きハナデ', to: '倉木ハナで' },
        { from: '気持ちいー', to: '気持ちいい' },
        { from: '気長します', to: '緊張します' },
        { from: 'くらはぎ', to: 'ふくらはぎ' },
        { from: 'に省して', to: 'にほぐして' },
        { from: 'はぐして', to: 'ほぐして' },
        { from: 'はぶれて', to: 'ほぐれて' },
        { from: 'ほっぱい', to: 'おっぱい' },
        { from: 'も省して', to: 'もほぐして' },
        { from: 'わびさび', to: 'ギリギリの塩梅' },
        { from: 'を省して', to: 'をほぐして' },
        { from: 'アパイタ', to: 'アルバイト' },
        { from: 'ウェルで', to: 'オイルで' },
        { from: 'ホエルで', to: 'オイルで' },
        { from: 'ボリーを', to: 'オイルを' },
        { from: 'マビサビ', to: 'ギリギリの塩梅' },
        { from: 'メイスは', to: 'ゲストは' },
        { from: 'メスは、', to: 'ゲストは、' },
        { from: 'メースは', to: 'メンエスは' },
        { from: '免税して', to: 'メンエス' },
        { from: '前向けも', to: '仰向けも' },
        { from: '口安くね', to: 'ごゆっくりね' },
        { from: '本島より', to: 'オイルを' },
        { from: '本日関東', to: '本日担当' },
        { from: '気持いい', to: '気持ちいい' },
        { from: '紙パンツ', to: '半パンツ' },
        { from: '結衣失礼', to: 'では失礼' },
        { from: '羽織失礼', to: 'では失礼' },
        { from: '脳リンプ', to: 'リンパ' },
        { from: '蔵木さん', to: '倉木さん' },
        { from: '髪パンツ', to: '半パンツ' },
        { from: 'お正気', to: 'お仕置き' },
        { from: 'サイジ', to: 'サイズ' },
        { from: '下半戦', to: '下半身' },
        { from: '免税制', to: 'メンエス' },
        { from: '免税者', to: 'メンエス' },
        { from: '気長し', to: '緊張し' },
        { from: '肩膀を', to: '肩を' },
        { from: '蔵木様', to: '倉木さん' },
        { from: '逆反省', to: 'うつ伏せ' },
        { from: '髪パン', to: '半パン' },
        { from: '免税', to: 'メンエス' },
        { from: '歯圧', to: '指圧' },
        { from: '脂圧', to: '指圧' },
        { from: '試圧', to: '指圧' },
    ]);

    function loadBundledJaAsrDomainBasePairs() {
        if (typeof module !== 'undefined' && module.exports) {
            try {
                const fs = require('fs');
                const path = require('path');
                const filePath = path.join(__dirname, '..', '..', 'shared', 'ja-asr-domain-fixes.json');
                if (fs.existsSync(filePath)) {
                    const pairs = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    if (Array.isArray(pairs) && pairs.length) {
                        // Shared wins on duplicate `from`; keep hardcoded fallback under it.
                        const seen = new Set(
                            pairs.map((p) => String(p?.from || '')).filter(Boolean),
                        );
                        const extra = JA_ASR_DOMAIN_FIX_PAIRS_FALLBACK.filter(
                            (p) => p?.from && !seen.has(String(p.from)),
                        );
                        return [...pairs, ...extra];
                    }
                }
            } catch (_) { /* fall through */ }
        }
        return JA_ASR_DOMAIN_FIX_PAIRS_FALLBACK;
    }

    function decodeTrainedB64(b64) {
        const s = String(b64 || '');
        if (!s) return '';
        try {
            if (typeof Buffer !== 'undefined') {
                return Buffer.from(s, 'base64').toString('utf8');
            }
            if (typeof atob === 'function') {
                const bin = atob(s);
                const bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
                if (typeof TextDecoder !== 'undefined') {
                    return new TextDecoder('utf-8').decode(bytes);
                }
                return bin;
            }
        } catch (_) { /* ignore */ }
        return '';
    }

    /** Hot-loaded table from shared/mt-trained-remaps.json (train console). */
    let TRAINED_ZH_REMAPS = Object.freeze([]);
    let TRAINED_ASR_PAIRS = Object.freeze([]);

    function normalizeTrainedPack(raw) {
        const pack = raw && typeof raw === 'object' ? raw : {};
        const zhRemaps = Array.isArray(pack.zhRemaps) ? pack.zhRemaps : [];
        const asrPairs = Array.isArray(pack.asrPairs) ? pack.asrPairs : [];
        return {
            version: Number(pack.version) || 1,
            zhRemaps,
            asrPairs,
        };
    }

    function loadOfficialTrainedRemaps() {
        if (typeof module !== 'undefined' && module.exports) {
            try {
                const fs = require('fs');
                const path = require('path');
                const filePath = path.join(__dirname, '..', '..', 'shared', 'mt-trained-remaps.json');
                if (fs.existsSync(filePath)) {
                    return normalizeTrainedPack(JSON.parse(fs.readFileSync(filePath, 'utf8')));
                }
            } catch (_) { /* fall through */ }
        }
        return { version: 1, zhRemaps: [], asrPairs: [] };
    }

    function loadUserSandboxTrainedRemaps() {
        if (typeof module === 'undefined' || !module.exports) {
            return { version: 1, zhRemaps: [], asrPairs: [] };
        }
        try {
            const fs = require('fs');
            const path = require('path');
            const envPath = String(process.env.TRANSUB_MT_USER_REMAPS || '').trim();
            const rootEnv = String(process.env.TRANSUB_MT_SANDBOX_ROOT || '').trim();
            const filePath = envPath
                || path.join(rootEnv || path.join(__dirname, '..', '..'), 'mt-user-remaps.json');
            if (fs.existsSync(filePath)) {
                return normalizeTrainedPack(JSON.parse(fs.readFileSync(filePath, 'utf8')));
            }
        } catch (_) { /* fall through */ }
        return { version: 1, zhRemaps: [], asrPairs: [] };
    }

    /** Official pack + optional local sandbox layered on top. */
    function loadBundledTrainedRemaps() {
        const official = loadOfficialTrainedRemaps();
        const user = loadUserSandboxTrainedRemaps();
        return {
            version: Math.max(Number(official.version) || 1, Number(user.version) || 1),
            zhRemaps: [...official.zhRemaps, ...user.zhRemaps],
            asrPairs: [...official.asrPairs, ...user.asrPairs],
        };
    }

    function decodeTrainedZhRule(rule) {
        const jaIncludes = Array.isArray(rule.jaIncludesB64)
            ? rule.jaIncludesB64.map(decodeTrainedB64).filter(Boolean)
            : (Array.isArray(rule.jaIncludes) ? rule.jaIncludes.map(String) : []);
        const zhFrom = rule.zhFromB64 != null
            ? decodeTrainedB64(rule.zhFromB64)
            : String(rule.zhFrom || '');
        const zhTo = rule.zhToB64 != null
            ? decodeTrainedB64(rule.zhToB64)
            : String(rule.zhTo || '');
        return {
            id: String(rule.id || ''),
            enabled: rule.enabled !== false,
            mode: rule.mode === 'blank' ? 'blank' : 'replace',
            pinFinal: rule.pinFinal !== false,
            flag: String(rule.flag || 'trained_remap'),
            jaIncludes,
            zhFrom,
            zhTo,
        };
    }

    function decodeTrainedAsrPair(rule) {
        const from = rule.fromB64 != null
            ? decodeTrainedB64(rule.fromB64)
            : String(rule.from || '');
        const to = rule.toB64 != null
            ? decodeTrainedB64(rule.toB64)
            : String(rule.to || '');
        return {
            id: String(rule.id || ''),
            enabled: rule.enabled !== false,
            from,
            to,
        };
    }

    function rebuildTrainedRemaps(pack) {
        const norm = normalizeTrainedPack(pack);
        TRAINED_ZH_REMAPS = Object.freeze(norm.zhRemaps.slice());
        TRAINED_ASR_PAIRS = Object.freeze(
            norm.asrPairs
                .map(decodeTrainedAsrPair)
                .filter((p) => p.enabled && p.from && p.to)
                .map((p) => ({ from: p.from, to: p.to })),
        );
        return true;
    }

    function reloadTrainedRemaps(pack) {
        const next = pack != null ? normalizeTrainedPack(pack) : loadBundledTrainedRemaps();
        rebuildTrainedRemaps(next);
        rebuildJaAsrDomainFixes(loadBundledJaAsrDomainBasePairs());
        return {
            zhRemaps: TRAINED_ZH_REMAPS.length,
            asrPairs: TRAINED_ASR_PAIRS.length,
        };
    }

    /**
     * Apply console-trained ZH remaps.
     * @param {string} text
     * @param {string} sourceText
     * @param {{ pinFinalPass?: boolean }} [options]
     */
    function applyTrainedZhRemaps(text, sourceText = '', options = {}) {
        let cur = String(text ?? '');
        const src = String(sourceText || '');
        const pinFinalPass = options.pinFinalPass === true;
        const flags = [];
        if (!TRAINED_ZH_REMAPS.length) {
            return { text: cur, changed: false, flags };
        }
        const before = cur;
        for (const raw of TRAINED_ZH_REMAPS) {
            if (raw && raw.enabled === false) continue;
            const rule = decodeTrainedZhRule(raw || {});
            if (!rule.enabled) continue;
            if (pinFinalPass && !rule.pinFinal) continue;
            if (rule.jaIncludes.length && !rule.jaIncludes.every((j) => src.includes(j))) continue;
            if (rule.mode === 'blank') {
                if (rule.zhFrom && !cur.includes(rule.zhFrom)) continue;
                cur = '…';
                const flag = pinFinalPass ? 'trained_remap_final' : (rule.flag || 'trained_remap');
                if (!flags.includes(flag)) flags.push(flag);
                continue;
            }
            if (!rule.zhFrom || !cur.includes(rule.zhFrom)) continue;
            const next = cur.split(rule.zhFrom).join(rule.zhTo);
            if (next !== cur) {
                cur = next;
                const flag = pinFinalPass ? 'trained_remap_final' : (rule.flag || 'trained_remap');
                if (!flags.includes(flag)) flags.push(flag);
            }
        }
        return { text: cur, changed: cur !== before, flags };
    }

    function mergeJaAsrDomainFixPairs(basePairs) {
        const base = Array.isArray(basePairs) && basePairs.length
            ? basePairs
            : JA_ASR_DOMAIN_FIX_PAIRS_FALLBACK;
        const adult = (typeof mtOpaque?.getAsrAdultDomainPairs === 'function')
            ? mtOpaque.getAsrAdultDomainPairs()
            : [];
        const trained = Array.isArray(TRAINED_ASR_PAIRS) ? TRAINED_ASR_PAIRS : [];
        const seen = new Set();
        const merged = [];
        for (const p of [...base, ...adult, ...trained]) {
            const from = String(p?.from || '');
            const to = String(p?.to || '');
            if (!from || !to || seen.has(from)) continue;
            seen.add(from);
            merged.push({ from, to });
        }
        // Longest-first so overlapping mishears (e.g. 大好きなアップで挟) win.
        merged.sort((a, b) => Array.from(b.from).length - Array.from(a.from).length
            || String(a.from).localeCompare(String(b.from), 'ja'));
        return merged;
    }

    function escapeAsrFixLiteral(text) {
        return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /** @type {{ from: string, to: string }[]} */
    let JA_ASR_DOMAIN_FIX_PAIRS = Object.freeze([]);
    /** @type {{ from: RegExp, to: string }[]} */
    let JA_ASR_DOMAIN_FIXES = Object.freeze([]);

    function rebuildJaAsrDomainFixes(basePairs) {
        const merged = mergeJaAsrDomainFixPairs(basePairs).map((p) => ({
            from: String(p.from),
            to: String(p.to),
        }));
        JA_ASR_DOMAIN_FIX_PAIRS = Object.freeze(merged);
        JA_ASR_DOMAIN_FIXES = Object.freeze(
            merged.map((p) => ({
                from: new RegExp(escapeAsrFixLiteral(p.from), 'g'),
                to: p.to,
            })),
        );
        return true;
    }

    function reloadJaAsrDomainBasePairs(basePairs) {
        return rebuildJaAsrDomainFixes(basePairs);
    }

    function reloadJaAsrDomainFromBundled() {
        return rebuildJaAsrDomainFixes(loadBundledJaAsrDomainBasePairs());
    }

    rebuildTrainedRemaps(loadBundledTrainedRemaps());
    rebuildJaAsrDomainFixes(loadBundledJaAsrDomainBasePairs());

    /** Standalone mid-scene greetings Whisper often invents in soft AV. */
    const JA_FAKE_GREETING_RE = /^(?:おはようございます|おはようございま[すっ]|おはよう)[。．!！?？\s]*$/;
    const ZH_MORNING_GREETING_RE = /^(?:早上好|早安|早上好[。．!！]?|早安[。．!！]?)[。．!！?？\s]*$/;
    // Adult-aware intro hints: opaque (fallback keeps mens-esthe duty phrasing only).
    const JA_INTRO_HINT_RE = mtOpaque?.RE?.introHint
        || /本日担当|担当させて|担当いたします|メンズエ|メンエス|初めてご利用/;
    const ZH_MOAN_REFUSAL_ONLY_RE = /^(?:[哈啊嗯唔呼呵哦噢欸诶呀哟哇呜嘻呵…]|[不行可以]|[\s…·・，,。.！!？?～~─—-])+$/;

    function textLen(text) {
        return Array.from(String(text || '').replace(/\s+/g, '')).length;
    }

    function escapeRegExp(text) {
        return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function cueStartMs(cue) {
        if (cue == null || typeof cue !== 'object') return NaN;
        if (Number.isFinite(Number(cue.startMs))) return Number(cue.startMs);
        if (Number.isFinite(Number(cue.start))) {
            const s = Number(cue.start);
            return s > 1e6 ? s : Math.round(s * 1000);
        }
        return NaN;
    }

    function cueEndMs(cue) {
        if (cue == null || typeof cue !== 'object') return NaN;
        if (Number.isFinite(Number(cue.endMs))) return Number(cue.endMs);
        if (Number.isFinite(Number(cue.end))) {
            const e = Number(cue.end);
            return e > 1e6 ? e : Math.round(e * 1000);
        }
        const start = cueStartMs(cue);
        return Number.isFinite(start) ? start + 2000 : NaN;
    }

    function resolveSanitizeSourceCue(targetCue, i, cleanedSource, srcByIndex, dualCore, sourceOverlapIndex) {
        const idx = Number.isInteger(Number(targetCue?.index)) ? Number(targetCue.index) : i;
        const startMs = cueStartMs(targetCue);
        const endMs = cueEndMs(targetCue);
        if (dualCore?.findBestOverlapCue && Number.isFinite(startMs)) {
            const hit = dualCore.findBestOverlapCue(
                cleanedSource,
                startMs,
                Number.isFinite(endMs) ? endMs : startMs + 2000,
                { index: sourceOverlapIndex, maxStartGapMs: 2500 },
            );
            if (hit?.cue && hit.match !== 'none') {
                return { source: String(hit.cue.text ?? ''), srcCue: hit.cue };
            }
        }
        const source = srcByIndex.has(idx)
            ? srcByIndex.get(idx)
            : String(cleanedSource?.[i]?.text ?? '');
        const srcCue = cleanedSource?.[i] || (Number.isInteger(idx)
            ? (cleanedSource || []).find((x) => Number(x?.index) === idx)
            : null);
        return { source, srcCue };
    }

    /**
     * Fix high-confidence JA AV / mens-esthe ASR mishears (免税→メンエス etc.).
     * @param {string} text
     * @returns {{ text: string, changed: boolean, hits: string[] }}
     */
    function correctJaAsrDomainMishears(text) {
        let cur = String(text ?? '');
        if (!cur) return { text: cur, changed: false, hits: [] };
        const hits = [];
        for (const rule of JA_ASR_DOMAIN_FIXES) {
            const before = cur;
            cur = cur.replace(rule.from, rule.to);
            if (cur !== before) {
                hits.push(typeof rule.from === 'string' ? rule.from : String(rule.to));
            }
        }
        // Mid-line Whisper おはよう glued onto real dialogue (それなのにあっおはようございます)
        if (!JA_FAKE_GREETING_RE.test(cur.trim())) {
            const stripped = cur.replace(
                /(.+[\u3040-\u30ff\u4e00-\u9fff].{0,12}?)(?:あっ?|あぁ)?\s*おはようございます?[。．!！?？\s]*$/u,
                '$1',
            );
            if (stripped !== cur && String(stripped).trim().length >= 2) {
                cur = stripped.trim();
                hits.push('trailing_ohayo');
            }
        }
        return { text: cur, changed: hits.length > 0, hits };
    }

    /**
     * @param {Array<{text?:string}>} cues
     * @returns {{ cues: object[], changed: number }}
     */
    function correctJaAsrDomainMishearsInCues(cues) {
        const list = Array.isArray(cues) ? cues : [];
        let changed = 0;
        const out = list.map((c) => {
            const fixed = correctJaAsrDomainMishears(c?.text);
            if (!fixed.changed) return c;
            changed += 1;
            return { ...c, text: fixed.text };
        });
        return { cues: out, changed };
    }

    function isAvSoftContext(options = {}) {
        const profile = String(options.contentProfile || options.senseProfile || '').toLowerCase();
        if (profile === 'av_soft') return true;
        if (options.sakuraNsfwPrompt === true || options.nsfwPrompt === true) return true;
        if (options.faithfulTone === true || options.smartTranslateFaithfulTone === true) return true;
        if (options.applyNsfwLexicon === true) return true;
        const preset = String(options.presetId || options.preset || '').toLowerCase();
        return /^ja-av|av-soft|av_soft/.test(preset);
    }

    /**
     * Wet / suck / lick oral SFX in ZH (咕咚/啾/滋溜…) — not moans (哈/啊/嗯).
     * Used for av_soft cue cleanup.
     */
    const WET_ORAL_SFX_ZH_ATOM = '(?:咕咚|咕啾|扑哧|滋溜|叽噜|咕噜+|咕{2,}|啾+|滋{1,}|噜+|噗|啪|哦汁|吸吧+)';
    const WET_ORAL_SFX_JA_ATOM = '(?:ん?ちゅっ|ん?ちゅぱっ?|ん?ちゅぽっ?|ん?ちゅばっ?|ん?ちゅぶっ?|ん?ちゅぅ+|ん?ちゅる+[っッ]*'
        // ちゅくちゅく / ちゅくっ — wet suck; not bare ちゅく inside ちゅくめ舐め…
        + '|ん?(?:ちゅく){2,}[っッ]?|ん?ちゅくっ'
        + '|ん?(?:ぢゅ|ヂュ)ぅ+'
        + '|ん?チュッ|ん?チュパッ?|ん?チュバッ?|ん?チュブッ?|ん?チュゥ+'
        + '|ちゅうう+|ちゅば(?:っ|ちゅば)*|チュバ(?:ッ|チュバ)*'
        + '|ちゅ(?=[…·.…!！?？、,\\s]|$)'
        + '|ん?(?:ぢゅ|じゅ|ジュ)(?:っ|ぼっ?|ぽっ?|ぶっ?|ブッ?|ぷっ?|ぱっ?|パッ?|る+[っッ]*|ル+[ッっ]*|ぅ+|ぶ+|ブ+|(?:ば|バ){2,}|(?:ばっ|バッ))+'
        + '|ず(?:ぢゅ|じゅ)(?:ぼ|ぢゅぼ|じゅぼ)*[っッ]?'
        + '|くちゅ[うっんン]+|ぐちゅ[うっんン]+|ごく[んっンッ]+|ゴク[リッんン]+|(?:ごく){2,}[ごくっんン]*|(?:ゴク){2,}[ゴクッんン]*'
        + `|${(typeof mtOpaque?.d === 'function' ? mtOpaque.d('44GU44Gj44GP44KTfOOCtOODg+OCr+ODsw==') : '') || 'x'}`
        + '|コクン|こくん|ぺろっ?|れろっ?|んぐっ?|ぷっ|あむっ|んむっ|んむぎゅ'
        // じゅば: SFX shape only (じゅばば / じゅばっ / じゅば… / じゅばじゅば) — not じゅばんだ (PRED-890)
        + '|んにゅごっきゅ|ぶっつぅ+|ぶ{2,}[っッ]?|ブ{2,}[ッっ]?|(?:じゅば){2,}|じゅば(?:ば+|っ|ッ)+|じゅば(?=[…·.…!！?？、,\\s]|$)|(?:ジュバ){2,}|ジュバ(?:バ+|ッ|っ)+|ジュバ(?=[…·.…!！?？、,\\s]|$)|ちゅぷん?|チュプン?|ごぼっ?|ゴボッ?|ぬぷっ?)';
    const AV_MISC_SFX_JA_ONLY = /^(?:[グぐ][ルる]+[っッ]*|ブフッ?|ロー+|トゥゥ*|チラッ|ぱっ|ちょむ|チョム)[。．.!！?？…\s]*$/u;

    /** Opening BGM / hit SFX Whisper often invents as シオシオ… (≠ lexical tide-spray dialogue). */
    function isShioHitSfxOnlyJa(text = '') {
        let bare = String(text || '').trim().replace(/[!！?？…\s、,，.。]+/g, '');
        if (!bare) return false;
        // Wet prefixes / trailing hit crumbs (ぶぶシオオォォッぱ / じゅぶ…シオ…ん)
        bare = bare
            .replace(/^(?:[ぶブ]+|[じヂ]ゅ[ぶブ]*)+/u, '')
            .replace(/(?:ぱ|パ|ん|ン)+$/u, '');
        if (!bare) return false;
        if (/^(?:シ[オオォォ]+[ッっ]?)+$/.test(bare)) return true;
        if (/^(?:シオ){2,}シ?[ッっ]?$/.test(bare)) return true;
        if (/^(?:しお){2,}[っ]?$/.test(bare)) return true;
        return false;
    }

    function isWetOralSfxOnlyZh(text = '') {
        const stripped = stripWetOralSfxFromZh(text).text;
        if (String(text || '').trim() && !String(stripped || '').trim()) return true;
        const t = String(stripped || text || '').trim();
        if (!t) return Boolean(String(text || '').trim());
        if (mtOpaque?.RE?.suckLickAtomSrc?.test(t) && mtOpaque?.RE?.suckLickCharSrc?.test(t)) return true;
        if (mtOpaque?.RE?.lickOnceSrc?.test(t)) return true;
        if (/^(?:Nyu|Kyu|nyu|kyu)(?:[\s、,]+(?:Nyu|Kyu|nyu|kyu))*[!！?？…\s]*$/i.test(t)) return true;
        if (/^(?:咕噜+|噜…?噜*)[!！?？…\s]*$/u.test(String(text || '').trim())) return true;
        return false;
    }

    function isWetOralSfxOnlyJa(text = '') {
        const t = String(text || '').trim();
        if (!t) return false;
        if (AV_MISC_SFX_JA_ONLY.test(t)) return true;
        if (isShioHitSfxOnlyJa(t)) return true;
        // Wet atoms + optional short moan crumbs (じゅぶぶっ! ん / んぶっんんっ)
        const re = new RegExp(
            '^[\\s…·.•\\-—_~～。．.!！?？、,，\\[\\]()（）【】「」『』]*'
            + `(?:${WET_ORAL_SFX_JA_ATOM}[\\s、,．.…!！?？ー〜～・･]*)+`
            + '[んンぁあアッっ]*[\\s…·.!！?？]*$',
            'u',
        );
        return re.test(t);
    }

    /**
     * Normalize awkward MT breath gloss 「哈啊」→「哈…」 (はぁ / はあ).
     * Keeps 哈~~！ emphatic form; collapses repeated ellipsis after rewrite.
     */
    function normalizeBreathMoanZh(text = '') {
        const before = String(text ?? '');
        if (!/哈啊/.test(before)) return { text: before, changed: false };
        let s = before;
        s = s.replace(/哈啊(?=~~|——)/g, '哈');
        s = s.replace(/哈啊/g, '哈…');
        s = s.replace(/哈(?:…)+/g, '哈…');
        return { text: s, changed: s !== before };
    }

    /** Emphatic moan elongation: —— → ~~ (哈——！→哈~~！). */
    function normalizeEmphaticDashZh(text = '') {
        const before = String(text ?? '');
        if (!/——/.test(before)) return { text: before, changed: false };
        const s = before.replace(/——/g, '~~');
        return { text: s, changed: s !== before };
    }

    function stripWetOralSfxFromZh(text = '') {
        let s = String(text ?? '');
        if (!s) return { text: '', changed: false };
        const before = s;
        if (/^(?:咕噜+|噜…?噜*|偷瞄)[!！?？…\s]*$/u.test(s.trim())) {
            return { text: '', changed: true };
        }
        // Moan+wet compounds: keep the moan (嗯啾/嗯咕/嗯—噗 → 嗯)
        s = s.replace(/([哈啊嗯唔呼])(?:啾|咕|—?噗)/gu, '$1');
        s = s.replace(new RegExp(`(?:${WET_ORAL_SFX_ZH_ATOM})(?:[\\s、,，.。…!！?？—\\-]*)`, 'gu'), '');
        s = s.replace(/(?:啧[、,，\s]*)?(?:吸[、,，.。…\s—\-]*){2,}/gu, '');
        if (mtOpaque?.RE?.lickOnceOrPeekSrc) {
            s = s.replace(mtOpaque.RE.lickOnceOrPeekSrc, '');
        }
        if (mtOpaque?.RE?.lickOnceTailG) {
            s = s.replace(mtOpaque.RE.lickOnceTailG, '');
        }
        s = s.replace(/\b(?:Nyu|Kyu|nyu|kyu)(?:\s+(?:Nyu|Kyu|nyu|kyu))*\b/gi, '');
        s = s.replace(/[、,，]{2,}/g, '、');
        s = s.replace(/[.…]{2,}/g, '…');
        // Only trim edge punct when wet atoms were actually removed — otherwise
        // normal dialogue ending in 。 would falsely flag wet_sfx and cascade.
        if (s !== before) {
            s = s.replace(/^[、,，.。…!！?？\s—\-]+/, '');
            s = s.replace(/[、,，.。\s—\-]+$/, '');
            s = s.replace(/\s{2,}/g, ' ').trim();
        }
        if (!s) {
            const raw = String(before || '').trim();
            if (mtOpaque?.RE?.suckLickAtomSrc?.test(raw) && mtOpaque?.RE?.suckLickCharSrc?.test(raw)) {
                return { text: '', changed: true };
            }
            if (mtOpaque?.RE?.lickOnceOrPeekSrc?.test(raw)) {
                return { text: '', changed: true };
            }
            if (/^(?:Nyu|Kyu|nyu|kyu)(?:[\s、,]+(?:Nyu|Kyu|nyu|kyu))*[!！?？…\s]*$/i.test(raw)) {
                return { text: '', changed: true };
            }
        }
        return { text: s, changed: s !== before };
    }

    function stripWetOralSfxFromJa(text = '') {
        let s = String(text ?? '').trim();
        if (!s) return { text: '', changed: false };
        const before = s;
        if (isWetOralSfxOnlyJa(s)) return { text: '', changed: true };
        // Protect lexical kiss requests (ちゅーもして / チューして…)
        // and wet-sounding nickname + honorific (ちゅぷくん — PPPE-446 sample).
        const guards = [];
        s = s.replace(/(?:ちゅ[ーう]+|チュー+)も?して[よね]?っ?|キスして[よね]?っ?/g, (m) => {
            const key = `\uE000${guards.length}\uE001`;
            guards.push(m);
            return key;
        });
        s = s.replace(
            /(?:ちゅぷ|チュプ|ちゅば|チュバ)(?:くん|さん|ちゃん|君|様)/g,
            (m) => {
                const key = `\uE000${guards.length}\uE001`;
                guards.push(m);
                return key;
            },
        );
        s = s.replace(new RegExp(
            `(?:${WET_ORAL_SFX_JA_ATOM})(?!くん|さん|ちゃん|君|様)[\\s、,．.…!！?？ー〜～・･]*`,
            'gu',
        ), '');
        for (let i = 0; i < guards.length; i += 1) {
            s = s.replace(`\uE000${i}\uE001`, guards[i]);
        }
        s = s.replace(/[、,]{2,}/g, '、').replace(/[.…]{2,}/g, '…');
        s = s.replace(/^[、,．.…!！?？\s]+/, '').replace(/[、,．.\s]+$/, '').trim();
        return { text: s, changed: s !== before };
    }

    /**
     * Mid-scene Whisper おはよう hallucinations → blank ZH 早上好.
     * Require explicit AV profile / NSFW prompt — faithfulTone alone must NOT
     * wipe real greetings (and undoes short-JA fallback fills).
     */
    function shouldBlankFakeGreeting(options = {}) {
        if (options.skipFakeGreeting === true) return false;
        const profile = String(options.contentProfile || options.senseProfile || '').toLowerCase();
        if (profile === 'av_soft') return true;
        if (options.sakuraNsfwPrompt === true || options.nsfwPrompt === true) return true;
        const preset = String(options.presetId || options.preset || '').toLowerCase();
        return /^ja-av|av-soft|av_soft/.test(preset);
    }

    function isMidTimelineCue(options = {}) {
        const idx = Number(options.cueIndex);
        if (Number.isInteger(idx) && idx >= 10) return true;
        const startMs = Number(options.cueStartMs);
        if (Number.isFinite(startMs) && startMs >= 90_000) return true;
        return false;
    }

    /**
     * Source-conditioned ZH domain fixes for mens-esthe / soft AV MT failures.
     * @param {string} text
     * @param {string} sourceText
     * @param {object} [options]
     * @returns {{ text: string, changed: boolean, flags: string[] }}
     */
    function correctZhDomainMistranslations(text, sourceText = '', options = {}) {
        let cur = String(text ?? '');
        const src = String(sourceText || '');
        const flags = [];
        if (!src) return { text: cur, changed: false, flags };
        // Allow empty / ellipsis ZH through — recovery rules (おかえり, synopsis wipe) need it.

        const mark = (flag) => {
            if (!flags.includes(flag)) flags.push(flag);
        };

        // High-confidence adult semantic inversions (opaque tokens)
        if (mtOpaque?.applyAdultSemanticFixes) {
            const adult = mtOpaque.applyAdultSemanticFixes(cur, src, mark);
            if (adult.changed) cur = adult.text;
        }

        // Console-trained ZH remaps (shared/mt-trained-remaps.json) — domain pass
        {
            const trainedTable = applyTrainedZhRemaps(cur, src, { pinFinalPass: false });
            if (trainedTable.changed) {
                cur = trainedTable.text;
                for (const f of trainedTable.flags) mark(f);
            }
        }

        // OpenCC / font slip: 幺 → 么 in interrogatives / particles
        if (/[怎什那这多要]幺/.test(cur)) {
            const next = cur.replace(/怎幺/g, '怎么').replace(/什幺/g, '什么')
                .replace(/那幺/g, '那么').replace(/这幺/g, '这么')
                .replace(/多幺/g, '多么').replace(/要幺/g, '要么');
            if (next !== cur) {
                cur = next;
                mark('domain_term');
            }
        }

        // Soft spoken: Hy-MT「是关于…」→ natural「就是/是说…」(例の件 / ～なの)
        {
            let next = cur
                .replace(/是关于(?=那)/g, '就是')
                .replace(/是关于([^的]{1,16})的意思吧/g, '是说$1吧')
                .replace(/是关于([^的？?。．!]{1,16})(?=[？?。．!]|$)/g, '就是$1');
            if (next !== cur) {
                cur = next;
                mark('domain_term');
            }
        }

        // Hy-MT2: 意思決定 → 决策（勿「意思决定」）
        if (/意思決定/.test(src) && /意思决定/.test(cur)) {
            cur = cur.replace(/意思决定/g, '决策');
            mark('domain_term');
        }

        // School plot: 単位 → 学分（勿译成职场「单位」；MNGS-082 自然口语乱译）
        if (/単位/.test(src) && /单位/.test(cur)) {
            const next = cur
                .replace(/单位考试/g, '学分考试')
                .replace(/单位学分/g, '学分')
                .replace(/单位/g, '学分');
            if (next !== cur) {
                cur = next;
                mark('domain_term');
            }
        }
        // Collocation-only slips even when this cue's JA omitted 単位 (recycled / free style)
        if (/单位考试|单位考|给你单位|单位你想要|单位一下/.test(cur)) {
            const next = cur
                .replace(/单位考试/g, '学分考试')
                .replace(/单位考/g, '学分考')
                .replace(/给你单位/g, '给你学分')
                .replace(/单位你想要/g, '学分你想要')
                .replace(/单位一下/g, '学分一下');
            if (next !== cur) {
                cur = next;
                mark('domain_term');
            }
        }

        // Surname 黒 self-intro → not ethnic 黑人 (担任の黒です)
        if (
            /黑人/.test(cur)
            && /(?:担任の)?黒です|黒[くくん]|黒先生/.test(src)
            && !/黒人|ブラック|black/i.test(src)
        ) {
            const next = cur
                .replace(/那个是那个黑人/g, '我是黑')
                .replace(/那个黑人/g, '黑')
                .replace(/黑人/g, '黑');
            if (next !== cur) {
                cur = next;
                mark('domain_term');
            }
        }

        // 汚い → 好脏（勿译成「脏话」meta）
        if (/汚い/.test(src) && /脏话/.test(cur)) {
            const next = cur.replace(/脏话/g, '好脏');
            if (next !== cur) {
                cur = next;
                mark('domain_term');
            }
        }

        // オキシトシン / ASR コキシトシン → 催产素（模型乱译 奥替隆素/奥密克隆素/奥基西汀）
        if (/(?:オキシトシン|コキシトシン)/.test(src) && /奥替隆素|奥密克隆|奥基西汀|奥西托|oxytocin/i.test(cur)) {
            const next = cur
                .replace(/奥替隆素/g, '催产素')
                .replace(/奥密克隆素?/g, '催产素')
                .replace(/奥基西汀/g, '催产素')
                .replace(/奥西托辛?/g, '催产素');
            if (next !== cur) {
                cur = next;
                mark('domain_term');
            }
        }

        // Anatomy / climax hallucination guards live in mtOpaque.applyAdultSemanticFixes.
        // Foot-fetish climax ZH with no iku/ejac JA (needs remapZhFromJaSimple).
        {
            const RE = mtOpaque?.RE;
            const T = mtOpaque?.T;
            if (
                RE?.shootWantSrc?.test(cur)
                && !RE.jaHasClimaxSrc.test(src)
                && (RE.footFetishSrc.test(src) || RE.wearOrderSrc.test(src))
            ) {
                const remapped = remapZhFromJaSimple(src);
                if (remapped) {
                    cur = remapped;
                } else {
                    cur = cur
                        .replace(RE.surelyShootG, '')
                        .replace(RE.soonShootG, '')
                        .replace(RE.aboutToShootDoneG, '')
                        .replace(/\s{2,}/g, ' ')
                        .replace(/…+/g, '…')
                        .trim() || '…';
                }
                mark('domain_hallucination');
            }
        }
        if (/屁股/.test(cur) && !/(?:尻|お尻|おしり|ケツ|臀部)/.test(src)) {
            const next = cur
                .replace(/我的屁股吗/g, '我的吗')
                .replace(/的屁股/g, '的')
                .replace(/屁股/g, '');
            if (next !== cur) {
                cur = next.replace(/\s{2,}/g, ' ').replace(/吗？\s*怎/g, '吗？怎').trim();
                mark('domain_hallucination');
            }
        }

        // 綺麗 truncated / mis-glossed as 来吧 / 不过 / 好厉害
        if (/綺麗|きれい|キれい/.test(src)) {
            if (/^(?:来吧|好厉害|厉害)[。．.!！?？\s]*$/u.test(cur.trim())) {
                cur = /ミカ|美[亜亞香]/.test(src) ? '好漂亮啊' : '好漂亮';
                mark('domain_term');
            } else if (/^不过[。．.!！?？\s]*$/u.test(cur.trim()) && /でも/.test(src)) {
                cur = '不过，好漂亮';
                mark('domain_term');
            }
        }

        // Climax ASR stub glossed as 好厉害
        if (
            mtOpaque?.RE?.iachuiOrIkuChaSrc?.test(src)
            && /^(?:好厉害|厉害)[。．.!！?？\s]*$/u.test(cur.trim())
            && textLen(src) <= 12
        ) {
            cur = mtOpaque?.T?.aboutToCumPlainZh || cur;
            mark('domain_term');
        }

        // Under-translated warm tongue / multi kinship
        if (
            /あったかい/.test(src)
            && /(?:べろ|舌)/.test(src)
            && textLen(cur) <= 4
        ) {
            cur = '好温暖的舌头';
            mark('domain_term');
        }
        if (
            /お父さん/.test(src)
            && /兄さん/.test(src)
            && /あったかい/.test(src)
            && textLen(cur) <= 3
        ) {
            cur = /(?:べろ|舌)/.test(src)
                ? '爸爸…哥哥…好温暖的舌头'
                : '爸爸…哥哥…好温暖';
            mark('domain_term');
        }

        // Moan ZH collapsed to「啊」while JA is multi-はあ — remap
        if (
            /^(?:啊|啊…|啊……)[!！?？\s]*$/u.test(cur.trim())
            && /(?:はぁ|はあ|ハァ|はあっ)/.test(src)
            && (src.match(/(?:はぁ|はあ|ハァ|はあっ)/g) || []).length >= 2
        ) {
            cur = /[!！]/.test(src) ? '哈~~！' : '哈…哈…';
            mark('domain_term');
        }

        // Intro / disclaimer hallucinated into moans or inverted refusals
        if (JA_INTRO_HINT_RE.test(src) && ZH_MOAN_REFUSAL_ONLY_RE.test(cur.replace(/\s+/g, ''))) {
            cur = '';
            mark('domain_hallucination');
            return { text: cur, changed: true, flags };
        }

        // Prompt-role bleed: 「担当させていただきます」→「负责翻译」
        // (models latch onto 「日译中字幕翻译」 in the system prompt)
        if (
            /(?:本日)?担当|担当させていただきます|担当いたします|担当します/.test(src)
            && !/翻訳|通訳/.test(src)
            && /负责翻译|担当翻译|来翻译|为您翻译|给您翻译/.test(cur)
        ) {
            const next = cur
                .replace(/今天由我负责翻译/g, '今天由我负责')
                .replace(/由我来负责翻译/g, '由我来负责')
                .replace(/由我负责翻译/g, '由我负责')
                .replace(/负责翻译/g, '负责')
                .replace(/担当翻译/g, '负责')
                .replace(/来为您翻译/g, '来为您服务')
                .replace(/为您翻译/g, '为您服务')
                .replace(/给您翻译/g, '为您服务');
            if (next !== cur) {
                cur = next;
                mark('domain_term');
            }
        }

        // Keep Japanese 「本日」 / 「担当」 out of Chinese intro lines
        if (/(?:本日)?担当|担当させていただきます|担当いたします/.test(src) && !/翻訳|通訳/.test(src)) {
            let next = cur
                .replace(/本日由我负责/g, '今天由我负责')
                .replace(/本日担当的小姐/g, '今天由我负责')
                .replace(/本日担当/g, '今天负责');
            if (/(?:さつき|サツキ|皐月)/.test(src)) {
                next = next
                    .replace(/今天由我负责(?!的是|接待|皐月|沙月)/, '今天由我皐月负责')
                    .replace(/我叫作沙/g, '我叫皐月')
                    .replace(/我叫沙(?!月)/g, '我叫皐月');
            }
            if (next !== cur) {
                cur = next;
                mark('domain_term');
            }
        }

        // さつき truncated / mangled name
        if (/(?:さつき|サツキ)/.test(src) && /(?:我叫作沙|叫作沙|作沙)/.test(cur)) {
            cur = cur.replace(/我叫作沙/g, '我叫皐月').replace(/叫作沙/g, '叫皐月').replace(/作沙/g, '皐月');
            mark('domain_term');
        }

        // 泣かないで misread as「哭了」(dropped negation)
        if (/泣かないで/.test(src) && /哭了/.test(cur) && !/泣いた|泣いて/.test(src)) {
            cur = cur.replace(/别哭了/g, '别哭').replace(/哭了/g, '别哭');
            mark('domain_term');
        }
        // めっちゃいい collapsed to bare「好的」
        if (
            /めっちゃいい|すごくいい|超いい|超イイ/.test(src)
            && /^(?:好的|好)[。．.!！?？\s]*$/.test(cur.trim())
        ) {
            cur = '超棒';
            mark('domain_term');
        }

        // メイス/メス ASR → 雌性 (should be 客人/ゲスト)
        if (/(?:メイスは|メスは、|メスは良い|メスはいい|ゲストは)/.test(src) && /雌性|母畜/.test(cur)) {
            const next = cur.replace(/雌性/g, '客人').replace(/母畜/g, '客人');
            if (next !== cur) {
                cur = next;
                mark('domain_term');
            }
        }

        // 半パンツ ASR 髪パンツ → 头发内裤
        if (/(?:半パン|髪パン)/.test(src) && /头发内裤|头发裤|头发被拉/.test(cur)) {
            cur = cur
                .replace(/从头发内裤中露出/g, '从内裤边露出来')
                .replace(/头发内裤/g, '内裤')
                .replace(/头发被拉起来/g, '内裤被拉起来');
            mark('domain_term');
        }

        // 丹念にほぐす / 省して ASR → 省略
        if (/(?:ほぐ|丹念|省して)/.test(src) && /省略|节省/.test(cur) && !/省[くけ]/.test(src)) {
            cur = cur
                .replace(/在努力省略/g, '会仔细推拿')
                .replace(/努力省略/g, '仔细推拿')
                .replace(/省略/g, '推拿');
            mark('domain_term');
        }

        // メイス/ゲスト → 锤子
        if (/(?:メイス|ゲストは良い子|良い子にして)/.test(src) && /锤子/.test(cur)) {
            cur = cur.replace(/锤子/g, '客人');
            mark('domain_term');
        }

        // よく来てます → 我来了
        if (/来てます|よく来/.test(src) && /我来了/.test(cur) && !/来ました|やって来/.test(src)) {
            cur = cur.replace(/好的，我来了/g, '是的，我经常来').replace(/我来了/g, '我经常来');
            mark('domain_term');
        }

        // 歯圧/試圧/指圧 → 牙齿压 / 测压力
        if (/(?:歯圧|試圧|指圧)/.test(src) && /牙齿压|测一下压力|测压/.test(cur)) {
            cur = cur
                .replace(/牙齿压得有点强/g, '光做指压有点不够')
                .replace(/牙齿压/g, '指压')
                .replace(/测一下压力/g, '开始指压')
                .replace(/测压/g, '指压');
            mark('domain_term');
        }

        // メンエス misread/translated as duty-free
        if (/(?:メンエス|メンズエ|メンズエステ)/.test(src) || /免税/.test(src)) {
            if (/有办法免税入境/.test(cur)) {
                cur = cur.replace(/有办法免税入境/g, '经常来男士按摩');
                mark('domain_term');
            }
            if (/免税入境/.test(cur)) {
                cur = cur.replace(/免税入境/g, '男士按摩店');
                mark('domain_term');
            }
            if (/有办法免税/.test(cur)) {
                cur = cur.replace(/有办法免税/g, '经常来男士按摩');
                mark('domain_term');
            }
            if (/免税制/.test(cur)) {
                cur = cur.replace(/免税制/g, '男士按摩店的规矩');
                mark('domain_term');
            }
            if (/免税者/.test(cur)) {
                cur = cur.replace(/免税者/g, '男士按摩');
                mark('domain_term');
            }
            if (/了解免税/.test(cur)) {
                cur = cur.replace(/了解免税/g, '了解男士按摩');
                mark('domain_term');
            }
            if (/免税/.test(cur)) {
                const next = cur.replace(/免税/g, '男士按摩');
                if (next !== cur) {
                    cur = next;
                    mark('domain_term');
                }
            }
        }
        if (/メンズレスト|メンズエステ|メンズエ/.test(src) && /男性休息室/.test(cur)) {
            cur = cur.replace(/男性休息室/g, '男士按摩店');
            mark('domain_term');
        }

        // セックスレス / レスになった → model sometimes emits ASCII "RESP"
        if (/(?:セックスレス|レスになった|レスの夫婦)/.test(src) && /\bRESP\b/.test(cur)) {
            cur = cur.replace(/\bRESP\b/g, '性冷淡');
            mark('domain_term');
        }

        // オイル → 防晒油
        if (/オイル|油/.test(src) && /防晒油/.test(cur)) {
            cur = cur.replace(/防晒油/g, '按摩油');
            mark('domain_term');
        }

        // SNOS-293: アパイタ/アルバイト misread as 旺季
        if (/(?:アルバイト|アパイタ|バイトに入)/.test(src) && /旺季/.test(cur)) {
            cur = cur
                .replace(/从今天开始就是旺季了/g, '从今天开始打工了')
                .replace(/就是旺季了/g, '开始打工了')
                .replace(/旺季/g, '打工');
            mark('domain_term');
        }

        // SNOS-293: 気長します ASR → 气长了 (should be 紧张)
        if (/(?:緊張|気長)/.test(src) && /气长/.test(cur)) {
            cur = cur
                .replace(/气长了/g, '有点紧张')
                .replace(/气长/g, '紧张');
            mark('domain_term');
        }

        // SNOS-293: ごゆっくりね / 口安くね → 嘴巴放干净 / 口令不难记
        if (/(?:ごゆっくり|口安く)/.test(src) && /嘴巴放干净|嘴放干净|口令不难记/.test(cur)) {
            cur = cur
                .replace(/嘴巴放干净点[，,]?\s*好…好[！!]?/g, '请慢用，好…好！')
                .replace(/嘴巴放干净点/g, '请慢用')
                .replace(/嘴放干净/g, '请慢用')
                .replace(/口令不难记呢?好的/g, '请慢用，好的')
                .replace(/口令不难记呢?/g, '请慢用');
            mark('domain_term');
        }

        // SNOS-293: 足フェチ / フェンジ → 芬治
        if (/(?:フェチ|フェンジ)/.test(src) && /芬治/.test(cur)) {
            cur = cur.replace(/腿芬治/g, '恋足癖').replace(/芬治/g, '恋足癖');
            mark('domain_term');
        }

        // SNOS-293: 暗きハナデ / 倉木ハナ → 暗香 / 华你好
        if (/(?:倉木ハナ|暗きハナ|ハナデ)/.test(src) && /暗香|华你好/.test(cur)) {
            cur = cur
                .replace(/呃，华你好，请多指教/g, '仓木华，请多指教')
                .replace(/华你好，请多指教/g, '仓木华，请多指教')
                .replace(/华你好/g, '仓木华')
                .replace(/暗香/g, '仓木华');
            mark('domain_term');
        }

        // Truncated possessive stub:「仓木同学的，」vs 足を触っちゃった
        if (
            /触っちゃっ|触ってしまっ|触りました|触っちゃ/.test(src)
            && /足/.test(src)
            && /(?:仓木|藏木|倉木|蔵木).{0,4}的[，、,]$/.test(cur)
        ) {
            cur = /仓木|倉木|蔵木|藏木/.test(src)
                ? '仓木同学的脚，不小心碰到了'
                : '脚，不小心碰到了';
            mark('truncated_fill');
        }

        // Latin junk for katakana ASR noise (Grubn ← グラブン…)
        if (isLatinGarbageZh(cur, src, options)) {
            cur = '';
            mark('latin_garbage');
        }

        // Deterministic ASR debris JA → wipe ZH only when ZH itself looks like a
        // debris rendering. Do not erase domain remaps (嘿咻→做爱 on ああ) or
        // kept moan gloss (呼…哈) — pair-level prune still drops pure-moan JA.
        if (src && isDeterministicAsrDebrisJaForSanitize(src, cur)) {
            const zh = String(cur || '').trim();
            if (zh) {
                let wipe = false;
                try {
                    const ellipsis = (typeof require === 'function')
                        ? require('./hymt-ellipsis-policy-core')
                        : (typeof globalThis !== 'undefined' ? globalThis.TransubHyMtEllipsisPolicy : null);
                    wipe = !!ellipsis?.isAsrDebrisTranslationZh?.(zh);
                } catch { /* optional */ }
                if (!wipe && /[A-Za-z]{4,}/.test(zh) && !/[\u4e00-\u9fff]{2,}/.test(zh)) {
                    wipe = true;
                }
                if (wipe) {
                    const lex = zh.replace(
                        /[哈啊嗯唔呼呵哦噢欸诶呀哟哇呜嘻呵啦那…·・，,。.！!？?\s～~─—-]+/g,
                        '',
                    );
                    // Substantive ZH payload (domain remap / short gloss) must survive
                    if (textLen(lex) >= 1) wipe = false;
                    // Pure moan gloss (哈…哈 / 呼…哈) — keep for soft-AV; prune later
                    else if (/[哈啊嗯唔呼]/.test(zh) && !/啦啦|仰躺|阿春|[A-Za-z]{3,}/.test(zh)) {
                        wipe = false;
                    }
                }
                if (wipe) {
                    cur = '';
                    mark('asr_debris');
                }
            }
        }

        // Katakana-only ASR menu/noise transliterated into Latin+CJK mash (Killer do caca…)
        if (
            isKatakanaNoiseJa(src)
            && /[A-Za-z]{3,}/.test(cur)
            && !/(?:Another|OK|DVD|AV|NG)/i.test(cur)
        ) {
            cur = '';
            mark('latin_garbage');
        }

        // Katakana noise → pure phonetic CJK (アヤロダイミッサ → 亚莉罗大明撒)
        if (isKatakanaNoiseJa(src) && isKatakanaPhoneticZh(cur, src)) {
            cur = '';
            mark('latin_garbage');
        }

        // シオ hit SFX →「初音」/「湿哦」hallucination (opening BGM; JA has no 初音 / tide-spray cue)
        if (
            isShioHitSfxOnlyJa(src)
            && (/初音/.test(cur) || (/湿[哦喔噢奥]?/.test(cur) && !/潮|吹|出水/.test(cur)))
            && !reCore('5Yid6Z+zfOa9ruWQuXzmva7jgpI=').test(src)
        ) {
            cur = '';
            mark('domain_hallucination');
        }

        // お酒ございま ASR → 非常抱歉 duplicated
        if (/(?:申し訳|お酒ござ)/.test(src) && /非常抱歉非常抱歉/.test(cur)) {
            cur = cur.replace(/非常抱歉非常抱歉/g, '非常抱歉');
            mark('domain_term');
        }
        if (/(?:申し訳|お酒ござ)/.test(src) && /对不起对不起/.test(cur)) {
            cur = cur.replace(/对不起对不起/g, '对不起');
            mark('domain_term');
        }

        // Adult anatomy / climax / atmosphere hallucinations → mtOpaque.applyAdultSemanticFixes (above)

        // MT garble: 責め→「责」+「弄」粘成「责弄」（应为「玩弄」）
        if (/责弄/.test(cur)) {
            cur = cur.replace(/责弄/g, '玩弄');
            mark('domain_term');
        }

        // 凝ってる → 集中力
        if (/凝[って]|凝って/.test(src) && /集中力/.test(cur)) {
            cur = cur.replace(/好厉害的集中力啊?/g, '肌肉僵硬得很厉害')
                .replace(/好厉害的集中力/g, '肌肉僵硬得很厉害')
                .replace(/集中力/g, '僵硬');
            mark('domain_term');
        }

        // feel-good misread as itch (surface forms kept generic in comments)
        if (
            /気持ちい|きもちい|キモチイ/.test(src)
            && /痒/.test(cur)
            && !/痒い|かゆい|かゆ|ムズムズ/.test(src)
        ) {
            const next = cur
                .replace(/好痒了?/g, '好舒服')
                .replace(/好痒/g, '好舒服')
                .replace(/痒啊/g, '舒服啊')
                .replace(/痒[!！]/g, '舒服！')
                .replace(/很痒/g, '很舒服');
            if (next !== cur) {
                cur = next;
                mark('domain_term');
            }
        }

        // おかえり / ただいま / お帰り — including「クロちゃん、おかえり」
        {
            const srcTrim = src.trim();
            const compactLen = Array.from(srcTrim.replace(/\s/g, '')).length;
            if (/お帰り|おかえり/.test(srcTrim) && compactLen <= 16) {
                if (
                    !/欢迎回来/.test(cur)
                    || /^(?:回家了|喂)[。．!！?？\s]*$/.test(cur.trim())
                    || /^(?:啊[，,、]?\s*)+$/.test(cur.trim())
                    || /^[…·•.\s]*$/.test(cur.trim())
                ) {
                    const nick = srcTrim.match(
                        /^([ァ-ヶーぁ-ん一-龯]{1,8}?)(?:ちゃん|くん|さん)[、,，\s]*(?:おかえり|お帰り)/,
                    );
                    if (nick) {
                        let zhName = nick[1];
                        if (jaNames?.CAST_CANONICAL_ZH?.[zhName]) {
                            zhName = jaNames.CAST_CANONICAL_ZH[zhName];
                        } else if (jaNames?.resolveCanonicalZhPersonName) {
                            zhName = jaNames.resolveCanonicalZhPersonName(zhName) || zhName;
                        }
                        if (/[ぁ-んァ-ン]/.test(zhName)) {
                            cur = '欢迎回来。';
                        } else {
                            cur = `${zhName}，欢迎回来。`;
                        }
                    } else if (/^あ[ぁあ]?[、，,]?\s*/.test(srcTrim)) {
                        cur = '啊，欢迎回来。';
                    } else {
                        cur = '欢迎回来。';
                    }
                    mark('domain_term');
                }
            } else if (/^ただいま[ー〜～]*[。．!！?？\s]*$/u.test(srcTrim)) {
                if (!/我回来了|回来了/.test(cur) || /^(?:喂|回家了)[。．!！?？\s]*$/.test(cur.trim())) {
                    cur = '我回来了。';
                    mark('domain_term');
                }
            } else if (/^はーい[ー〜～]+[。．!！?？\s]*$/u.test(srcTrim)) {
                if (textLen(cur) >= 6 && !/^(?:嗯|好|来了|在|嗨)[。．!！?？…\s]*$/u.test(cur.trim())) {
                    cur = '嗯——';
                    mark('domain_term');
                }
            } else if (/^お久しぶりです[。．!！?？\s]*$/u.test(srcTrim)) {
                if (!/好久不见/.test(cur) || textLen(cur) >= 12) {
                    cur = '好久不见。';
                    mark('domain_term');
                }
            } else if (/いらっしゃい/.test(srcTrim) && textLen(srcTrim) <= 18 && !/欢迎/.test(cur)) {
                cur = /ほんと久しぶり|久しぶり/.test(srcTrim)
                    ? '真的好久不见呢，欢迎欢迎。'
                    : '欢迎。';
                mark('domain_term');
            } else if (/^お邪魔します[。．!！?？\s]*$/u.test(srcTrim) && (!/打扰|叨扰/.test(cur) || textLen(cur) >= 10)) {
                cur = '打扰了。';
                mark('domain_term');
            } else if (/予定より早くないか/.test(srcTrim) && textLen(srcTrim) <= 18 && !/早|预定/.test(cur)) {
                cur = '比预定的还早啊？';
                mark('domain_term');
            }
        }

        // Tiny JA scrap with synopsis/essay ZH (film-brief bleed into cue 0)
        if (textLen(src) > 0 && textLen(src) <= 3 && textLen(cur) >= 20) {
            cur = '';
            mark('synopsis_bleed');
            return { text: cur, changed: true, flags };
        }

        // Adult-domain training fixes (opaque tokens — see mt-opaque-strings.js)
        if (mtOpaque?.applyTrainingDomainFixes) {
            const trained = mtOpaque.applyTrainingDomainFixes(cur, src, mark);
            if (trained.changed) cur = trained.text;
        }

        // 「Xちゃん」≠「X小姐」
        if (
            /[ぁ-んァ-ン一-龯A-Za-z]{1,10}ちゃん/.test(src)
            && /小姐/.test(cur)
            && !/お嬢様|お嬢さん/.test(src)
        ) {
            const next = cur.replace(/([A-Za-z\u4e00-\u9fff]{1,12})小姐/g, '$1');
            if (next !== cur) {
                cur = next;
                mark('chan_honorific');
            }
        }

        // Model invents censorship meta for 「…」/ adult lines
        if (
            /省略或遮挡的内容|表示省略或遮挡|字幕中的模糊或被遮挡/.test(cur)
            || /省略了/.test(cur)
        ) {
            const next = cur
                .replace(/表示省略或遮挡的内容/g, '')
                .replace(/省略或遮挡的内容/g, '')
                .replace(/字幕中的模糊或被遮挡的文字/g, '')
                .replace(/省略了/g, '')
                .replace(/\s{2,}/g, ' ')
                .replace(/([，,、]){2,}/g, '$1')
                .trim();
            if (next !== cur) {
                cur = next;
                mark('meta_ellipsis');
            }
        }

        // Nickname ミッキー ≠ Disney 米老鼠
        if (/ミッキー/.test(src) && /米老鼠/.test(cur)) {
            cur = cur.replace(/米老鼠/g, '米奇');
            mark('domain_term');
        }

        // Meta “主人公” bleed (not in JA source)
        if (/主人公/.test(cur) && !/主人公/.test(src)) {
            const next = cur
                .replace(/即?主人公的前上司[，,、]*/g, '')
                .replace(/主人公的?/g, '')
                .replace(/即死者[。．.\s]*/g, '')
                .replace(/([，,、。．.]){2,}/g, '$1')
                .replace(/\s{2,}/g, ' ')
                .trim();
            if (next !== cur) {
                cur = next;
                mark('domain_term');
            }
        }

        // ひびき / 響 as bare given name — strip fansub「响小姐」
        if (/ひびき|ヒビキ|響/.test(src) && /响小姐/.test(cur) && !/お嬢様|お嬢さん/.test(src)) {
            cur = cur.replace(/响小姐/g, '响');
            mark('domain_term');
        }

        // Blanked nickname vocative (まーくん → …)
        if (
            /^まーくん[。．!！?？\s]*$/.test(src.trim())
            && /^[…·•.\s]*$/.test(cur.trim())
        ) {
            cur = '阿马';
            mark('domain_term');
        }

        // Mid-timeline fake おはよう → 早上好 (Whisper soft-AV hallucination)
        if (
            shouldBlankFakeGreeting(options)
            && isMidTimelineCue(options)
            && JA_FAKE_GREETING_RE.test(src.trim())
            && ZH_MORNING_GREETING_RE.test(cur.trim())
        ) {
            // Keep a visible placeholder so the cue is not dropped on SRT round-trip
            cur = '…';
            mark('fake_greeting');
        }

        // Inverse: bare 早上好/早安 on non-おはよう JA (MNGS-074 style-run stock spam)
        if (
            ZH_MORNING_GREETING_RE.test(cur.trim())
            && src.trim()
            && !/おはよう/.test(src)
            && looksLikeStockGlossMisattach(cur, src)
        ) {
            cur = '…';
            mark('morning_stock');
        }

        // お母さん → 母小姐
        const kin = fixKinshipHonorificMistranslations(cur, src);
        if (kin.changed) {
            cur = kin.text;
            mark('kinship');
        }

        return { text: cur, changed: flags.length > 0, flags };
    }

    function stripHonorificSuffix(token) {
        return String(token || '').replace(ZH_HONORIFIC_SUFFIX_RE, '');
    }

    function sourceJustifiesZhName(token, sourceText, options = {}) {
        if (jaNames?.sourceJustifiesZhName) {
            return jaNames.sourceJustifiesZhName(token, sourceText, options);
        }
        const src = options.loopStrippedSource != null
            ? String(options.loopStrippedSource)
            : String(sourceText || '');
        const stem = stripHonorificSuffix(token);
        if (!stem) return false;
        if (src.includes(token) || src.includes(stem)) return true;
        for (const hint of SOURCE_NAME_HINTS) {
            if (!hint.ja.test(src)) continue;
            if (hint.zh.some((z) => z === stem || z === token || stem.includes(z) || token.includes(z))) {
                return true;
            }
        }
        const refs = extractJaPersonRefs(src);
        for (const r of refs) {
            if (stem === r.stem || token === r.stem || stem.includes(r.stem) || r.stem.includes(stem)) {
                return true;
            }
        }
        return false;
    }

    const MULTI_CHAR_POLLUTION_STEMS = [...POLLUTION_NAME_STEMS]
        .filter((s) => Array.from(String(s)).length >= 2)
        .sort((a, b) => Array.from(b).length - Array.from(a).length
            || String(b).localeCompare(String(a), 'zh-CN'));

    /**
     * Drop Chinese/English commas glued to cue edges (MT leftovers like「，真的」/「蓝，」).
     * Does not touch mid-cue commas or Japanese顿号「、」.
     * @param {string} text
     * @returns {{ text: string, changed: boolean }}
     */
    function stripEdgeCommas(text) {
        const raw = String(text ?? '');
        if (!raw) return { text: '', changed: false };
        const next = raw
            .replace(/^[，,\s]+/u, '')
            .replace(/[，,\s]+$/u, '');
        return { text: next, changed: next !== raw };
    }

    /**
     * Strip Qwen / chat-model think wrappers and slash control tags from raw model text.
     * These must not become subtitle lines — a leading `/no_think` shifts a whole window by one.
     * Also strips Chinese slash-tags (`/思考` `/叙述者` `/无`) that models invent as meta labels.
     */
    function stripLlmThinkWrappers(text) {
        let s = String(text || '');
        const raw = s;
        s = s
            .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '\n')
            .replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi, '\n')
            .replace(/```thinking\b[\s\S]*?```/gi, '\n')
            .replace(/<think\b[^>]*>[\s\S]*?(?=\{|\[|\n)/gi, '\n');
        s = s
            .replace(/(^|\n)\s*<\/?redacted_thinking>\s*(?=\n|$)/gi, '\n')
            .replace(/(^|\n)\s*\/?no_think\b[^\n]*/gi, '\n')
            .replace(/(^|\n)\s*\/think\b[^\n]*/gi, '\n')
            // Whole-line short Chinese slash-tags only (/思考 /叙述者 /无 …)
            // Do not treat `/思考早上好` as a whole control line.
            .replace(/(^|\n)\s*\/[\u4e00-\u9fff]{1,4}[A-Za-z0-9_]*[^\S\n]*(?=\n|$)/g, '$1');
        s = s.replace(/\n{3,}/g, '\n\n').trim();
        return s === String(raw || '').trim() ? String(text || '').trim() : s;
    }

    /** Known Chinese slash meta tags (think / role / empty stubs). */
    const ZH_SLASH_META_TAG_RE = /(?:思考(?:过程|模式)?|不思考|结束思考|叙述者|旁白|系统|用户|助手|角色|无)/;

    /** Whole cue is only a slash meta/control tag (EN or ZH). */
    function looksLikeLlmControlLine(text) {
        const t = String(text || '').trim();
        if (!t) return false;
        if (/^\/?no_think\b/i.test(t)) return true;
        if (/^\/think\b/i.test(t)) return true;
        if (/^<\/?redacted_thinking>\s*$/i.test(t)) return true;
        if (/^<\/?think(?:ing)?>\s*$/i.test(t)) return true;
        // Short sole Chinese slash-tag: /思考 /叙述者 /无 /尼古丁 (≤4 CJK)
        // Longer glued forms like `/思考早上好` are stripped below, not blanked wholesale.
        if (/^\/[\u4e00-\u9fff]{1,4}[A-Za-z0-9_]*[\s。．.!！?？]*$/.test(t)) return true;
        if (t.length <= 32 && /no_think/i.test(t) && !/[A-Za-z\u4e00-\u9fff]{4,}/.test(t.replace(/\/?no_think/ig, ''))) {
            return true;
        }
        return false;
    }

    /**
     * Remove slash control / Chinese meta tags from a cue, keeping real dialogue.
     * Never ship `/思考` `/叙述者` `/无` or glued forms like `全然/不思考`.
     */
    function stripLlmControlTokens(text) {
        const raw = String(text ?? '');
        let next = raw;
        if (looksLikeLlmControlLine(next)) {
            return { text: '', changed: true };
        }
        next = next
            .replace(/<\/?redacted_thinking>/gi, ' ')
            .replace(/<\/?think(?:ing)?\b[^>]*>/gi, ' ')
            .replace(/(^|\s)\/?no_think\b/gi, ' ')
            .replace(/(^|\s)\/think\b/gi, ' ')
            // Known meta tags (space or glued before more dialogue): /思考早上好 → 早上好
            .replace(new RegExp(`(^|[\\s　])\\/${ZH_SLASH_META_TAG_RE.source}(?=$|[\\s　。．.!！?？,，、]|[\\u4e00-\\u9fff])`, 'g'), ' ')
            .replace(new RegExp(`^\\/${ZH_SLASH_META_TAG_RE.source}(?=$|[\\s　。．.!！?？,，、]|[\\u4e00-\\u9fff])`, 'g'), '')
            // Trailing / mid glued Chinese slash-tags: 全然/不思考 → 全然 ; 喜欢/尼古丁 → 喜欢
            .replace(/\/[\u4e00-\u9fff]{1,12}[A-Za-z0-9_]*(?=$|[\s　。．.!！?？,，、])/g, '')
            .replace(/[^\S\n]{2,}/g, ' ')
            .replace(/^[^\S\n]+|[^\S\n]+$/g, '');
        return { text: next, changed: next !== raw.trim() };
    }

    /**
     * Remove Engine/LLM glossary placeholder debris from one string.
     * @param {string} text
     * @returns {{ text: string, changed: boolean, glossHit: boolean }}
     */
    /**
     * Collapse per-character CJK spacing from engine MT (你 能 喝 → 你能喝).
     * Splits on whitespace and joins maximal runs of single-CJK tokens.
     * Keeps spaces between multi-char words (很好 但是 / 一郎 嗯哈).
     */
    function collapseSpacedCjkChars(text = '') {
        const raw = String(text ?? '');
        if (!raw || !/[\u4e00-\u9fff]\s+[\u4e00-\u9fff]/.test(raw)) return raw;
        const tokens = raw.trim().split(/\s+/);
        if (tokens.length < 2) return raw;
        const isSingleCjk = (t) => /^[\u4e00-\u9fff][。．.!！?？…·.~～]*$/u.test(t);
        const bareCjk = (t) => String(t || '').replace(/[。．.!！?？…·.~～]+$/u, '');
        const out = [];
        let i = 0;
        while (i < tokens.length) {
            if (isSingleCjk(tokens[i])) {
                let j = i;
                while (j < tokens.length && isSingleCjk(tokens[j])) j += 1;
                const run = tokens.slice(i, j);
                if (run.length >= 3) {
                    out.push(run.join(''));
                } else if (
                    run.length === 2
                    && bareCjk(run[0]) === bareCjk(run[1])
                    && /^[嗯哈啊哦噢唔呜哎喔]$/u.test(bareCjk(run[0]))
                ) {
                    // 嗯 嗯 / 哈 哈 only — do not glue 嗯 哈 (keeps nickname+moan cues stable)
                    out.push(run.join(''));
                } else {
                    out.push(...run);
                }
                i = j;
            } else {
                out.push(tokens[i]);
                i += 1;
            }
        }
        return out.join(' ');
    }

    function stripMtArtifacts(text) {
        const raw = String(text ?? '');
        let next = raw.replace(GLOSS_TOKEN_RE, '');
        next = next.replace(BARE_GLOSS_TOKEN_RE, '');
        next = next.replace(HASH_GLOSS_TOKEN_RE, '');
        const glossHit = next !== raw;
        const ctrl = stripLlmControlTokens(next);
        if (ctrl.changed) next = ctrl.text;
        // Tokenizer splits: 那_ 么 / 这_里 / 那_#_种 (hash already cleared)
        next = next.replace(/([\u4e00-\u9fff])_+\s*([\u4e00-\u9fff])/g, '$1$2');
        next = next.replace(/^\s*_+\s+/, '');
        next = next.replace(/\s+_+\s*$/, '');
        next = next.replace(/([\u4e00-\u9fff])_+(?=\s|$|[，。！？、])/g, '$1');
        // Engine MT sometimes emits per-character spaces:「你 能 喝」「啊 哦 呀」
        // Keep clause spaces (很好 但是); only collapse single-CJK runs.
        {
            const collapsed = collapseSpacedCjkChars(next);
            if (collapsed !== next) next = collapsed;
        }
        // LLM-invented placeholders: __香水的代号__ → 香水纯；__GLOS2643__ already cleared above
        next = next.replace(GENERIC_PLACEHOLDER_RE, (_, inner) => {
            const s = String(inner || '').trim();
            if (!s) return '';
            if (/^GLOSS?\d*$/i.test(s)) return '';
            // 「角色的代号 / 香水代号」→ keep the name stem, then canonical ZH
            let name = s
                .replace(/(?:的)?(?:代号|占位|占位符|code\s*name)$/iu, '')
                .trim();
            if (jaNames?.CAST_CANONICAL_ZH?.[name]) {
                name = jaNames.CAST_CANONICAL_ZH[name];
            } else if (jaNames?.resolveCanonicalZhPersonName) {
                name = jaNames.resolveCanonicalZhPersonName(name) || name;
            }
            return name || '';
        });
        // Bare leaked meta without underscores (模型有时写出「香水的代号」)
        next = next.replace(/香水的代号/g, () => (
            jaNames?.CAST_CANONICAL_ZH?.香水 || '香水纯'
        ));
        next = next.replace(/([一-龯ぁ-んァ-ン]{1,6})的代号/g, (_, name) => {
            if (jaNames?.CAST_CANONICAL_ZH?.[name]) return jaNames.CAST_CANONICAL_ZH[name];
            if (jaNames?.resolveCanonicalZhPersonName) {
                return jaNames.resolveCanonicalZhPersonName(name) || name;
            }
            return name;
        });
        // Consistency-pass meta: "うちわら小姐\n改成：うちわら小姐" / "旧译→新译"
        next = next.replace(/(?:^|\n)\s*改成[：:]\s*[^\n]*/g, '');
        next = next.replace(/^(?:改为符合原文语气|改为符合原文)[。．.！!？?]*$/u, '');
        next = next.replace(/改[為为][「『"].*?[」』"]/g, '');
        next = next.replace(/修订译文/g, '');
        if (/→/.test(next) && next.length <= 120 && !/https?:/.test(next)) {
            const parts = next.split('→').map((s) => s.trim()).filter(Boolean);
            if (parts.length === 2 && parts[0].length >= 2 && parts[1].length >= 2) {
                next = parts[1];
            }
        }
        next = next.replace(/[^\S\n]{2,}/g, ' ').replace(/^[^\S\n]+|[^\S\n]+$/g, '');
        // Orphan closing quotes with no opener (e.g. 「……。 」)
        if (!/[「『"“]/.test(next) && /[」』"”]/.test(next)) {
            next = next.replace(/[」』"”]+/g, '').replace(/[^\S\n]{2,}/g, ' ').trim();
        }
        // Collapse empty leftovers from GLOS wipe (GLOS…GLOS → …)
        if (!next.trim() && glossHit) {
            next = '…';
        } else {
            next = next.replace(/^(?:[…·・.\s]|……)+$/u, '…');
            next = next.replace(/([…·])\1+/g, '$1');
        }
        return { text: next, changed: next !== raw, glossHit: glossHit || /__/.test(raw) };
    }

    /**
     * Detect / strip Sakura (or other LLM) prompt text that leaked into the translation.
     * @param {string} text
     * @returns {{ text: string, changed: boolean, leaked: boolean }}
     */
    function looksLikePromptLeak(text) {
        const t = String(text || '');
        if (!t) return false;
        if (looksLikeLlmControlLine(t)) return true;
        if (looksLikeEnMtMetaLeak(t)) return true;
        if (looksLikeGlossaryDump(t)) return true;
        let hits = 0;
        if (/将下面的日文/.test(t)) hits += 1;
        if (/只输出译文/.test(t)) hits += 1;
        if (/共\s*\d+\s*行/.test(t)) hits += 1;
        if (/翻译的行数|请不要超过/.test(t)) hits += 2;
        if (/将下面术语表/.test(t)) hits += 2;
        if (/不要编号/.test(t)) hits += 1;
        if (/根据以下术语表/.test(t)) hits += 1;
        if (/译名表/.test(t)) hits += 2;
        if (/lex-\d/i.test(t)) hits += 1;
        if (/碎句与拟声/.test(t)) hits += 1;
        // Sakura/Hy-MT lineRule echo (FTHTD-193: truncated「原文仅为纯语气…时可译为」→ whole-track shift)
        if (/原文仅为纯语气/.test(t)) hits += 3;
        if (/时可译为对应短语气词/.test(t)) hits += 3;
        if (/对白有完整语义/.test(t) && /禁止只输出语气词|须译出完整意思/.test(t)) hits += 3;
        if (/^对应短语气词/.test(t) || (/对应短语气词/.test(t) && /对白有完整语/.test(t))) hits += 3;
        // Paraphrased glossary / force-translate meta (Sakura NSFW batch first-line leaks)
        if (/根据以下的?.{0,16}(?:英文)?描述/.test(t)) hits += 2;
        if (/根据以下的?.{0,16}翻译记录/.test(t)) hits += 2;
        if (/根据以下的?.{0,16}英文句子/.test(t)) hits += 2;
        if (/请勿翻译成别的词/.test(t)) hits += 2;
        if (/无须复译|照译出来/.test(t)) hits += 2;
        if (/同音异义词|写出第.{0,6}单词/.test(t)) hits += 2;
        if (/不翻译任何注释/.test(t)) hits += 1;
        if (/请在不翻译/.test(t)) hits += 1;
        if (/将它?翻译成[「『"'“]/.test(t)) hits += 1;
        if (/如果描述中含有/.test(t)) hits += 1;
        if (/对应关系和备注/.test(t)) hits += 1;
        // Adult-tone / faithful system prompt echoed as cue #1 (often 你→我 paraphrase)
        if (/[你我]是(?:一个)?日译中字幕翻译/.test(t)) hits += 2;
        if (/汉化组习惯|汉化组/.test(t)) hits += 2;
        if (/严禁净化/.test(t)) hits += 2;
        if (/成人向内容|成人向\/?\s*R\s*级|限制级题材|敏感题材/.test(t)) hits += 1;
        if (/和谐或委婉改写|委婉改写/.test(t)) hits += 1;
        if (/性相关与粗俗|粗俗用语|敏感描写与粗口|敏感描写/.test(t)) hits += 1;
        if (/禁止照抄假名/.test(t)) hits += 2;
        if (/每行只译对应一行|每行只输出对应/.test(t)) hits += 1;
        if (/无意义叠词循环/.test(t)) hits += 1;
        if (/禁止臆造角色名|文末乱贴人名/.test(t)) hits += 1;
        // Hy-MT2 preference-line echoes (buildSoftPreferenceLines)
        if (/专有名词(?:仅|只)使用原文/.test(t)) hits += 3;
        if (/术语表(?:中的)?译名/.test(t) && /专有名词|禁止臆造|创造角色名/.test(t)) hits += 2;
        if (/总共有?\d+行原文/.test(t)) hits += 2;
        if (/我?会逐行将其翻译(?:成|为)中文/.test(t)) hits += 3;
        if (/绝对不会随意创造角色名/.test(t)) hits += 3;
        if (/【待翻译文本】|【翻译任务】/.test(t)) hits += 3;
        if (/待翻译字幕/.test(t)) hits += 3;
        if (/(?:^|[：:\s])待翻译(?:[。.]|$)/.test(t)) hits += 3;
        // JS \b is ASCII-word only — 「待翻译 首先」has no boundary after 译
        if (/^待翻译(?:[\s　]|[。．]|$)/.test(t)) hits += 3;
        if (/行数与顺序必须与原文一致/.test(t)) hits += 2;
        if (/注意翻译的风格要严格符合【/.test(t)) hits += 2;
        if (/忠实语气模式/.test(t)) hits += 2;
        // Smart-translate chunk banner echoed as dialogue (EBWH-368)
        if (/本块启用忠实语气/.test(t)) hits += 3;
        if (/勿净化[、,，\s]*勿拒答/.test(t)) hits += 3;
        if (/按原文强度直译(?:对白)?/.test(t)) hits += 2;
        // Model-as-assistant meta about translating subtitles (not film dialogue)
        if (/我来翻译(?:这条)?字幕/.test(t)) hits += 3;
        if (/好嘞?[，,\s]*我们?开始翻译|我们?开始翻译/.test(t)) hits += 3;
        if (/不能继续(?:这个)?字幕/.test(t)) hits += 3;
        if (/不足以进行翻译/.test(t)) hits += 3;
        if (/请提供更多的(?:上下文|字幕内容)/.test(t)) hits += 2;
        if (/由于您提供的信息有限/.test(t)) hits += 3;
        if (/无法准确理解您的需求/.test(t)) hits += 3;
        if (/请提供更多细节/.test(t)) hits += 2;
        if (/我会尽力帮助您翻译/.test(t)) hits += 3;
        if (/请问有什么我?(?:可以)?帮助你的/.test(t)) hits += 3;
        if (/非常感谢你帮我翻译|谢谢你帮我翻译/.test(t)) hits += 3;
        if (/我会按照要求进行翻译|按照要求进行翻译/.test(t)) hits += 3;
        if (/以下是翻译结果/.test(t)) hits += 3;
        if (/禁止以安全政策为由拒答/.test(t)) hits += 2;
        if (/符合原文语气/.test(t)) hits += 2;
        if (/^改为/.test(t) && /原文|语气|译文|润色/.test(t)) hits += 2;
        if (/禁止医学化/.test(t)) hits += 1;
        // Dense instruction stack: rare in real dialogue, common in prompt echo
        let meta = 0;
        if (/根据以下/.test(t)) meta += 1;
        if (/请(?:在|勿|将)/.test(t)) meta += 1;
        if (/翻译成|照译|复译/.test(t)) meta += 1;
        if (/注释/.test(t)) meta += 1;
        if (/不要(?:编号|解释|翻译|空行)/.test(t)) meta += 1;
        if (/只输出/.test(t)) meta += 1;
        if (/术语表|译名表|翻译记录/.test(t)) meta += 1;
        if (/单词|同音/.test(t)) meta += 1;
        if (/严禁|禁止/.test(t) && /净化|改写|假名|臆造/.test(t)) meta += 1;
        if (/字幕翻译/.test(t)) meta += 1;
        const compactLen = Array.from(t.replace(/\s+/g, '')).length;
        if (meta >= 3 && compactLen >= 20) return true;
        if (/翻译成中文/.test(t) && /请勿删除|将下面/.test(t)) return true;
        if (/将下面的日文单词/.test(t) && /移至对应句中|不输出句尾/.test(t)) return true;
        return hits >= 2 || (/将下面的日文/.test(t) && /翻译成中文/.test(t));
    }

    function stripPromptLeak(text) {
        const raw = String(text ?? '');
        if (!looksLikePromptLeak(raw) && !PROMPT_LEAK_RE.test(raw)) {
            return { text: raw, changed: false, leaked: false };
        }
        let next = raw;
        next = next.replace(/将下面的日文[\s\S]{0,160}?翻译成中文[。.]?/g, '');
        next = next.replace(/将下面术语表[\s\S]{0,80}?翻译成中文[。.]?/g, '');
        next = next.replace(/将下面的?[【\[][】\]]?号?句子[\s\S]{0,80}?翻译成中文[。.]?/g, '');
        next = next.replace(/你?将下面这句话翻译成中文了?[。.]?/g, '');
        next = next.replace(/将下面的日文单词[\s\S]{0,120}?(?:对应句中|不输出句尾)[^。\n]{0,40}[。.]?/g, '');
        next = next.replace(/请勿删除[。.]?/g, '');
        next = next.replace(/[，,]?翻译的行数是\d+行[^。\n]{0,40}/g, '');
        next = next.replace(/请不要超过[^。\n]{0,40}/g, '');
        next = next.replace(/根据以下术语表[\s\S]{0,120}?(?:：|:)?/g, '');
        // Whole-cue lexicon dumps: ほぐす->放松推拿 #勿译放松
        if (looksLikeGlossaryDump(next)) {
            next = '';
        }
        next = next.replace(/[（(]?\s*译名表[\s\S]{0,200}?[）)]?(?:：|:)?/g, '');
        next = next.replace(/术语表[（(]?请统一使用[）)]?[\s\S]{0,120}?(?:：|:)?/g, '');
        next = next.replace(/根据以下的?.{0,16}(?:英文)?描述[^。\n]{0,200}[。.]?/g, '');
        next = next.replace(/根据以下的?.{0,16}翻译记录[^。\n]{0,120}[。.]?/g, '');
        next = next.replace(/根据以下的?.{0,16}英文句子[^。\n]{0,160}[。.]?/g, '');
        next = next.replace(/请在不翻译任何注释的情况下[^。\n]{0,120}[。.]?/g, '');
        next = next.replace(/将它?翻译成[「『"'“][^」』"'”]{1,24}[」』"'”][^。\n]{0,40}[。.]?/g, '');
        next = next.replace(/请勿翻译成别的词[。.]?/g, '');
        next = next.replace(/我将之?照译出来[^。\n]{0,40}[。.]?/g, '');
        next = next.replace(/你?无须复译[。.]?/g, '');
        next = next.replace(/如果描述中含有[^。\n]{0,80}[。.]?/g, '');
        next = next.replace(/写出第.{0,8}单词[^。\n]{0,100}[。.]?/g, '');
        next = next.replace(/共\s*\d+\s*行[。.]?/g, '');
        next = next.replace(/只输出译文[^。\n]{0,120}[。.]?/g, '');
        next = next.replace(/不要编号[、，,]?\s*不要解释[^。\n]{0,80}/g, '');
        next = next.replace(/碎句与拟声勿删并勿并行走[。.]?/g, '');
        next = next.replace(/原文仅为纯语气[^。\n]{0,120}/g, '');
        next = next.replace(/时可译为对应短语气词[^。\n]{0,80}/g, '');
        next = next.replace(/对白有完整语义[^。\n]{0,120}/g, '');
        next = next.replace(/^对应短语气词[^。\n]{0,80}/g, '');
        next = next.replace(/专有名词(?:仅|只)使用原文已出现的写法或术语表(?:中的)?译名[^。\n]{0,120}/g, '');
        next = next.replace(/禁止臆造角色名[^。\n]{0,80}/g, '');
        next = next.replace(/绝对不会随意创造角色名[^。\n]{0,80}/g, '');
        next = next.replace(/总共有?\d+行原文[^。\n]{0,80}/g, '');
        next = next.replace(/我?会逐行将其翻译(?:成|为)中文[^。\n]{0,80}/g, '');
        next = next.replace(/【待翻译文本】|【翻译任务】/g, '');
        next = next.replace(/待翻译字幕[（(][^）)]{0,40}[）)]?[：:]?/g, '');
        next = next.replace(/待翻译字幕/g, '');
        next = next.replace(/[：:]\s*待翻译[。.]?/g, '');
        next = next.replace(/(?:^|[\s　])待翻译[。.]?(?=$|[\s　])/g, '');
        next = next.replace(/^待翻译[\s　]+/g, '');
        next = next.replace(/^待翻译[。.]?$/g, '');
        next = next.replace(/lex-\d[^\s]*/gi, '');
        // Adult-tone system / faithful instruction blocks rarely leave usable dialogue
        next = next.replace(/[你我]是(?:一个)?日译中字幕翻译[^。\n]{0,80}[。.]?/g, '');
        next = next.replace(/按汉化组习惯[^。\n]{0,120}[。.]?/g, '');
        next = next.replace(/严禁净化[^。\n]{0,80}[。.]?/g, '');
        next = next.replace(/忠实语气模式[^。\n]{0,100}[。.]?/g, '');
        next = next.replace(/本块启用忠实语气[^。\n]{0,80}[。.]?/g, '');
        next = next.replace(/勿净化[、,，\s]*勿拒答[^。\n]{0,40}[。.]?/g, '');
        next = next.replace(/按原文强度直译(?:对白)?[^。\n]{0,40}[。.]?/g, '');
        next = next.replace(/好的[，,\s]*我来翻译(?:这条)?字幕[^。\n]{0,40}[。.]?/g, '');
        next = next.replace(/我来翻译(?:这条)?字幕[^。\n]{0,40}[。.]?/g, '');
        next = next.replace(/好嘞?[，,\s]*我们?开始翻译[^。\n]{0,40}[。.]?/g, '');
        next = next.replace(/我们?开始翻译[^。\n]{0,40}[。.]?/g, '');
        next = next.replace(/我不能继续(?:这个)?字幕[^。\n]{0,40}[。.]?/g, '');
        next = next.replace(/对不起[，,\s]*您提供的信息不足以进行翻译[^。\n]{0,80}[。.]?/g, '');
        next = next.replace(/不足以进行翻译[^。\n]{0,60}[。.]?/g, '');
        next = next.replace(/请提供更多的(?:上下文|字幕内容)[^。\n]{0,40}[。.]?/g, '');
        next = next.replace(/好的[，,\s]*请问有什么我?(?:可以)?帮助你的[？?]?/g, '');
        next = next.replace(/请问有什么我?(?:可以)?帮助你的[？?]?/g, '');
        next = next.replace(/非常感谢你帮我翻译[^。\n]{0,60}[。.]?/g, '');
        next = next.replace(/好的[，,\s]*我会按照要求进行翻译[^。\n]{0,40}[。.]?/g, '');
        next = next.replace(/我会按照要求进行翻译[^。\n]{0,40}[。.]?/g, '');
        next = next.replace(/按照要求进行翻译[^。\n]{0,40}[。.]?/g, '');
        next = next.replace(/以下是翻译结果[^。\n]{0,40}[。.]?/g, '');
        next = next.replace(/[^\S\n]{2,}/g, ' ').trim();
        if (
            looksLikePromptLeak(next)
            || looksLikeGlossaryDump(next)
            || /输出译文|不要解释|术语表|译名表|请勿翻译|请勿删除|不翻译任何注释|根据以下|无须复译|照译|同音异义词|第.{0,4}单词|日译中字幕翻译|汉化组|严禁净化|忠实语气模式|本块启用忠实语气|移至对应句中|待翻译字幕|我来翻译|开始翻译|不足以进行翻译|帮我翻译|按照要求进行翻译|以下是翻译结果/.test(next)
            || (Array.from(next.replace(/\s+/g, '')).length <= 4 && /[「『"'“]/.test(raw))
            // Strong paraphrase cues in the original → residual fragments are not dialogue
            || (/根据以下的?.{0,16}(?:翻译记录|英文句子|描述)/.test(raw)
                && Array.from(next.replace(/\s+/g, '')).length > 0)
            || (/[你我]是(?:一个)?日译中字幕翻译|汉化组习惯|严禁净化|忠实语气模式|本块启用忠实语气|我来翻译(?:这条)?字幕|不足以进行翻译|按照要求进行翻译|以下是翻译结果/.test(raw)
                && Array.from(next.replace(/\s+/g, '')).length > 0)
        ) {
            // Paraphrased force-translate / system-prompt echoes rarely leave usable dialogue — blank for retry
            next = '';
        }
        return { text: next, changed: next !== raw.trim(), leaked: true };
    }

    /** True when text still looks like Japanese dialogue (has hiragana/katakana). */
    function sourceLooksLikeJapanese(text) {
        const t = String(text || '');
        const kana = (t.match(/[\u3040-\u30ff]/g) || []).length;
        if (kana >= 2) return true;
        // Short JA particles / endings often carry only one kana (は / の / か…).
        if (kana >= 1 && Array.from(t).length >= 3) return true;
        return false;
    }

    /**
     * Short cue that is still mostly kana (failed MT / copy-through).
     * @param {string} text
     * @returns {boolean}
     */
    function isMostlyUntranslatedJa(text) {
        const t = String(text || '').trim();
        if (!t) return false;
        // Vocative blank-recover keeps nicknames in kana (喂，てんつー)
        if (/^喂[，,]\s*[\u3040-\u30ffー〜～\s]{2,16}$/.test(t)) return false;
        const kana = (t.match(/[\u3040-\u30ff]/g) || []).length;
        const han = (t.match(/[\u4e00-\u9fff]/g) || []).length;
        const len = Array.from(t).length;
        const script = kana + han;
        // Short cues: kana dominates Han
        if (len <= 24) return kana >= 2 && kana > han;
        // Longer kanji-heavy JA still carries enough kana to flag as untranslated
        if (script >= 8 && kana >= 4 && kana / script >= 0.2) return true;
        return kana >= 5 && kana >= Math.max(3, Math.floor(han * 0.28));
    }

    /** Hiragana JA particles / verb tails amid simplified Chinese (Hy-MT2 partial leak). */
    const JA_MIXED_PARTICLE_RE = /[\u4e00-\u9fff](?:は|が|を|に|で|の|も|て|と|から|まで|より|へ)(?=[\u4e00-\u9fff\u3040-\u30ff]|[\u3040-\u30ff]|$)/;
    const JA_MIXED_PRONOUN_RE = /^(?:俺|僕|私|彼|彼女|君|お前|あなた|わたし|ぼく|おれ|あたし)[はがをに]/;
    const JA_MIXED_VERB_TAIL_RE = /[\u4e00-\u9fff\u3040-\u30ff]*[\u4e00-\u9fff][\u3040-\u30ff]{1,6}(?:[。．.!！?？…]|$)/;

    /**
     * Hy-MT2 / Sakura sometimes kanji-simplifies but keeps JA grammar (俺は…で働く).
     * @param {string} text
     * @param {string} sourceText
     * @returns {boolean}
     */
    function looksLikeJaZhMixedLeak(text, sourceText = '') {
        const t = String(text || '').trim();
        const src = String(sourceText || '').trim();
        if (!t || !src) return false;
        if (!sourceLooksLikeJapanese(src)) return false;
        if (/^喂[，,]\s*[\u3040-\u30ffー〜～\s]{2,16}$/.test(t)) return false;
        const kana = (t.match(/[\u3040-\u30ff]/g) || []).length;
        if (kana < 1) return false;
        const han = (t.match(/[\u4e00-\u9fff]/g) || []).length;
        if (han < 2) return false;
        // Trailing katakana / name scrap (ディル / とーじさん) is kana-strip territory, not Hy-MT2 grammar leak
        // (must run before particle RE — と in とーじ would false-positive as particle)
        const trailingNameScrap = /[\u4e00-\u9fff][\u3040-\u30ffー〜～]{1,12}(?:さん|ちゃん|くん|様)?[。．.!！?？…]*$/u.test(t)
            && !/[はがをにでのもてからまでよりへ]/.test(t.replace(/[\u3040-\u30ffー〜～]{1,12}(?:さん|ちゃん|くん|様)?[。．.!！?？…]*$/u, ''));
        if (trailingNameScrap) {
            const hira = (t.match(/[\u3040-\u309f]/g) || []).length;
            const kata = (t.match(/[\u30a0-\u30ff]/g) || []).length;
            if (kata >= hira || hira <= 5) return false;
        }
        if (JA_MIXED_PRONOUN_RE.test(t)) return true;
        if (JA_MIXED_PARTICLE_RE.test(t)) return true;
        if (JA_MIXED_VERB_TAIL_RE.test(t) && /[\u3040-\u309f]/.test(t)) return true;
        const funcKana = ['は', 'が', 'を', 'に', 'で', 'の', 'も', 'て', 'と', 'く', 'る', 'す', 'た', 'だ', 'め', 'ね', 'よ', 'さ', 'か'];
        let shared = 0;
        for (const ch of funcKana) {
            if (t.includes(ch) && src.includes(ch)) shared += 1;
        }
        if (shared >= 2 && kana >= 2 && !trailingNameScrap) return true;
        return false;
    }

    /**
     * Model returned the Japanese source (or near-copy) instead of a Chinese translation.
     * Identity on already-Chinese text is NOT an echo (no-op / ZH→ZH).
     * @param {string} text
     * @param {string} sourceText
     * @returns {boolean}
     */
    function looksLikeSourceEcho(text, sourceText = '') {
        const t = String(text || '').trim();
        const src = String(sourceText || '').trim();
        if (!t) return false;
        const srcIsJa = sourceLooksLikeJapanese(src);
        const srcHasKana = /[\u3040-\u30ff]/.test(src);
        if (src) {
            const norm = (s) => s.replace(/\s+/g, '');
            if (t === src || norm(t) === norm(src)) {
                // Same string: any kana in source ⇒ failed JA→ZH echo
                if (srcHasKana) return true;
                return srcIsJa;
            }
            // Near-copy of the full Japanese source (not short ZH fragments inside JA)
            if (
                srcIsJa
                && src.length >= 8
                && t.includes(src)
                && Math.abs(Array.from(t).length - Array.from(src).length) <= 2
            ) {
                return true;
            }
            // High-overlap copy (LLM tweaked punctuation/spacing only)
            if (srcIsJa && src.length >= 10 && norm(t).length >= 8) {
                const nt = norm(t);
                const ns = norm(src);
                if (nt.includes(ns) || ns.includes(nt)) {
                    const overlap = Math.min(nt.length, ns.length)
                        / Math.max(nt.length, ns.length);
                    if (overlap >= 0.88) return true;
                }
            }
        }
        // Kana-heavy ZH is always a failed JA→ZH leak, even when source pairing is wrong.
        if (isMostlyUntranslatedJa(t)) return true;
        // Kanji-simplified but JA grammar retained (俺は…で働く).
        if (looksLikeJaZhMixedLeak(t, src)) return true;
        // Identity on already-Chinese text is NOT an echo (no-op / ZH→ZH).
        if (src && !srcIsJa && !srcHasKana) return false;
        return false;
    }

    /**
     * Clean leftover katakana prolonged-sound marks (ー) after failed name MT
     * (e.g. トミーーくん → "ー君" / "ー你没有").
     * @param {string} text
     * @returns {{ text: string, changed: boolean }}
     */
    function stripKatakanaDashDebris(text) {
        const raw = String(text ?? '');
        let next = raw;
        // ー君 / ーー君 leftovers
        next = next.replace(/ー{1,4}(?=君)/g, '');
        // Leading prolonged mark before text/punct (ー? / ー你)
        next = next.replace(/^ー{1,4}(?=[\s？?！!\u4e00-\u9fffA-Za-z])/g, '');
        // Prolonged mark stuck after spaces or punct
        next = next.replace(/(^|[\s，,。！？!?…；;：:])ー{1,4}(?=[\s\u4e00-\u9fffA-Za-z？?！!]|$)/g, '$1');
        // 嗯ー， / 啦ー醉 — prolonged mark between CJK or before CJK/punct
        next = next.replace(/([\u4e00-\u9fff])ー{1,4}(?=[\u4e00-\u9fff，,。！？!?…])/g, '$1');
        // Trailing prolonged mark after CJK word: 这样ー → 这样
        next = next.replace(/([\u4e00-\u9fff])[ー]{1,4}(?=[\s，,。！？!?…]|$)/g, '$1');
        // Trailing / doubled marks
        next = next.replace(/ー{2,}/g, '');
        next = next.replace(/[^\S\n]{2,}/g, ' ').replace(/^[^\S\n]+|[^\S\n]+$/g, '');
        return { text: next, changed: next !== raw };
    }

    function shouldStripTrailingOrphanToken(token, head, sourceText, options = {}) {
        const t = String(token || '').trim();
        if (!t) return false;
        if (!head.trim()) return false;
        if (COMMON_KEEP_TOKENS.has(t)) return false;
        // Adult dialogue fragments (把插进来 / 含住肉棒) — never treat as cast-name orphans
        if (/插|舔|摸|射|含|肉棒|鸡巴|鸡鸡|小穴|乳头|自慰|口活/.test(t)) return false;
        // Sakura kinship gloss (啊啦哥哥 / 哥哥) when JA addresses 兄ちゃん/おっちゃん — not cast-tag strip
        if (/哥哥|弟弟|姐姐|叔叔|阿姨|舅舅/.test(t)
            && /兄ちゃん|お兄ちゃん|おにいちゃん|おっちゃん|伯父|叔/.test(sourceText)) {
            return false;
        }
        if (head.includes(t)) return false;

        const allowed = options.allowedNames;
        if (allowed instanceof Set && (allowed.has(t) || allowed.has(stripHonorificSuffix(t)))) {
            return false;
        }

        const justifyOpts = options.justifyOpts || {};
        const stem = stripHonorificSuffix(t);
        const chars = Array.from(t);
        const isPollution = POLLUTION_NAME_STEMS.has(t)
            || POLLUTION_NAME_STEMS.has(stem)
            || !!jaNames?.isPollutionNameStem?.(t)
            || !!jaNames?.isPollutionNameStem?.(stem);

        // Real cast / justified name in this cue's Japanese
        if (sourceJustifiesZhName(t, sourceText, justifyOpts)) {
            if (head.includes(t) || (stem && head.includes(stem))) return false;
            const dialogue = Array.from(
                head.replace(/[\s。．.！？!?…，,、；;：:\-—·•~～'"]/g, ''),
            ).length;
            const shortIntro = dialogue <= 4 && /[。．.]$/.test(head.trim());
            // Trailing 美咲桑 / 仓木同学 on real dialogue → strip (cast-tag style)
            if (isPollution) {
                if (ZH_HONORIFIC_SUFFIX_RE.test(t)) return true;
                if (!shortIntro) return true;
                // Short intro bare name (请多指教。 汤米 / 佳奈) → keep
                return false;
            }
            // Short intro ending with 。 (e.g. 「请多指教。 汤米」) → keep
            if (shortIntro) return false;
            // Otherwise trailing-only cast tag on real dialogue → strip
            return true;
        }

        // Unjustified pollution / junk trailing tokens
        if (isPollution) return true;

        // Lone junk chars (月/琉/玲…) or any unjustified 1-char CJK name tag
        if (chars.length === 1 && /^[\u4e00-\u9fff]$/.test(t)) {
            if (KEEP_SINGLE_TRAILING.has(t)) return false;
            if (SINGLE_CHAR_POLLUTION.has(t)) return true;
            return true;
        }

        // Latin appendages (Tommy) when not justified
        if (/^[A-Za-z][A-Za-z0-9'’-]{1,15}$/.test(t)) return true;

        // Generic 2–4 CJK trailing name-like token after punct/space.
        // Do NOT strip verbal/aspect endings (明白了 / 知道了 / 辛苦了) or
        // mid-clause predicates after a comma (好的，明白了).
        // Do NOT strip after bare ellipsis (嗯……再多一点) — cast tags use 「。 名」.
        if (/^[\u4e00-\u9fff]{2,4}$/.test(t)) {
            if (/[了着过的吗呢吧啊呀嘛啦哦喔诶]$/.test(t)) return false;
            if (ZH_NAME_STEM_STOP.has(t) || COMMON_KEEP_TOKENS.has(t) || isBlockedZhNameStem(t)) {
                return false;
            }
            // Verbal / discourse tails (心跳加速 / 慢慢来 / 然后) — not cast tags
            if (/加速|上升|下降|过来|回去|起来|下来|出来|进去|慢慢|然后|之后|首先|那么|只是/.test(t)) {
                return false;
            }
            const headTrim = String(head || '').trim();
            if (/[，,、；;：:]$/.test(headTrim)) return false;
            if (/[…·]$/.test(headTrim)) return false;
            // Bare space between clauses: strip pollution / honorific cast tags, and
            // short name-like glue (「啊 米莉娜」) — but keep discourse/verbal tails
            // (MFYD-182: 「心动感 心跳加速」/「不要着急 慢慢来」).
            if (!/[。．.!！?？]$/.test(headTrim)) {
                if (isPollution || ZH_HONORIFIC_SUFFIX_RE.test(t)) return true;
                const nameStem = t.replace(/^[和跟与]/, '');
                if (
                    /^[\u4e00-\u9fff]{2,3}$/.test(nameStem)
                    && !ZH_NAME_STEM_STOP.has(nameStem)
                    && !COMMON_KEEP_TOKENS.has(nameStem)
                    && !isBlockedZhNameStem(nameStem)
                    && !/加速|上升|下降|过来|回去|起来|下来|出来|进去|慢慢|然后|之后|首先|那么|只是/.test(nameStem)
                    && !/[的了吗呢是在我你他她好不很还要会能对吧啊哦原如真次点]/.test(nameStem)
                ) {
                    return !sourceJustifiesZhName(nameStem, sourceText, justifyOpts);
                }
                return false;
            }
            return true;
        }

        // 汤米君 / 舞酱 style: strip when stem looks like pollution / unjustified
        if (stem && stem !== t && /^[\u4e00-\u9fff]{1,4}$/.test(stem)) {
            if (POLLUTION_NAME_STEMS.has(stem)) return true;
            if (!sourceJustifiesZhName(stem, sourceText, justifyOpts)) return true;
        }

        return false;
    }

    /**
     * Collapse redundant 「X的X的」 / 「上班的班的」 style echoes common in Sakura MT.
     * 上班的班的 → 上班的；朋友的朋友的 → 朋友的
     * @returns {{ text: string, changed: boolean }}
     */
    function collapseDePhraseEchoes(text) {
        let cur = String(text ?? '');
        const before = cur;
        // Full duplicate: 真琴的真琴的 → 真琴的
        cur = cur.replace(/([\u4e00-\u9fff]{1,6}的)\1/g, '$1');
        // Suffix echo: 上班的班的 → 上班的（末字 + 的 重复）
        cur = cur.replace(/([\u4e00-\u9fff]+)([\u4e00-\u9fff])的\2的/g, '$1$2的');
        // Lone 「班的」 glued after a 的-phrase when unjustified (上班的班的 already handled)
        cur = cur.replace(/的班的(?=[\u4e00-\u9fff])/g, '的');
        return { text: cur, changed: cur !== before };
    }

    /**
     * Collapse「真琴小姐…小姐」「内村小姐…小姐…小姐」honorific stutter from weak LLMs.
     * Also collapses adjacent doubles: 美羽小姐小姐 → 美羽小姐.
     */
    function collapseHonorificEchoes(text) {
        let cur = String(text ?? '');
        const before = cur;
        const honor = '同学|小姐|先生|桑|君|酱|大人|老师';
        // Name + honorific + repeated honorifics: 悠奈小姐…小姐 → 悠奈小姐
        cur = cur.replace(
            new RegExp(
                `([\\u4e00-\\u9fffぁ-んァ-ンー]{1,12})(${honor})(?:[\\s…·・.。]{0,8}\\2)+`,
                'g',
            ),
            '$1$2',
        );
        // Bare honorific stutter: 小姐…小姐…小姐 / 小姐小姐 → 小姐
        cur = cur.replace(
            new RegExp(`(${honor})(?:[\\s…·・.。]{0,8}\\1)+`, 'g'),
            '$1',
        );
        return { text: cur, changed: cur !== before };
    }

    /**
     * Strip LLM name debris: 「到的美羽小姐」「亲爱的奥小姐」when unjustified.
     */
    function stripSpuriousNamePrefixes(text, sourceText = '') {
        let cur = String(text ?? '');
        const src = String(sourceText || '');
        const before = cur;
        // 「到的X / 到的X小姐」— classic Qwen glue from だけ/敬語 misalign
        cur = cur.replace(/到的(?=[\u4e00-\u9fffぁ-んァ-ンー]{1,6}(?:小姐|先生|同学|桑|君|酱)?)/g, '');
        // お兄さん / お姉さま → must not stay as 奥小姐 / 亲爱的奥小姐
        if (/お兄|姉さん|お姉|兄さん/.test(src)) {
            cur = cur.replace(/亲爱的奥小姐/g, '哥哥');
            cur = cur.replace(/奥小姐/g, () => (/お姉|姉さん/.test(src) ? '姐姐' : '哥哥'));
            cur = cur.replace(/兄小姐/g, '哥哥');
            cur = cur.replace(/姉小姐/g, '姐姐');
        }
        return { text: cur, changed: cur !== before };
    }

    /**
     * Drop leftover JA kana glued into mostly-Chinese MT (信じたく小姐 / さあゆう小姐).
     */
    function stripResidualJaInZh(text, sourceText = '') {
        let cur = String(text ?? '');
        const before = cur;
        const zhChars = (cur.match(/[\u4e00-\u9fff]/g) || []).length;
        const jaChars = (cur.match(/[\u3040-\u30ff]/g) || []).length;
        if (!jaChars || zhChars < 1) return { text: cur, changed: false };
        // Keep short moan / onomatopoeia-only lines
        if (zhChars <= 1 && jaChars <= 4) return { text: cur, changed: false };
        // Fake-name token that contains kana (do not eat preceding pure-ZH words like 老婆)
        // さあゆう小姐 / タイみな小姐 / ゆう先生；信じたく小姐（≤2 汉字头）
        const honor = '小姐|先生|同学|桑|君|酱';
        cur = cur.replace(new RegExp(`[ぁ-んァ-ンー]{2,12}(?:${honor})`, 'g'), '');
        cur = cur.replace(new RegExp(`[\\u4e00-\\u9fff]{1,2}[ぁ-んァ-ンー]{2,10}(?:${honor})`, 'g'), '');
        // Mid-line JA island inside Chinese (…老婆さあゆう…)
        if (zhChars >= 2) {
            cur = cur.replace(/(?<=[\u4e00-\u9fff])[ぁ-んァ-ンー]{2,16}(?=[\u4e00-\u9fff])/g, '');
            cur = cur.replace(/[ぁ-んァ-ンー]{2,16}(?=[\u4e00-\u9fff]{2,})/g, '');
            cur = cur.replace(/(?<=[\u4e00-\u9fff，,、])[ぁ-んァ-ンー]{2,16}$/g, '');
            // Trailing name/honorific echo before punct: 想看とーじさん？ / 田里ひょ？
            cur = cur.replace(/(?<=[\u4e00-\u9fff，,、\s])[ぁ-んァ-ンー]{2,20}(?=[？?！!。．.…\s]*$)/g, '');
            // Leading kana crumb: んー 好起来了 / てる啊
            cur = cur.replace(/^[ぁ-んァ-ンー]{2,16}(?=[\s\u4e00-\u9fff])/g, '');
            // Bare honorific / chan leftovers in Chinese dialogue
            cur = cur.replace(/ちゃん/g, '');
            cur = cur.replace(/(?:^|[\s，,])さん(?=[\s，,？?！!。．.]|$)/g, ' ');
            cur = cur.replace(/[ァ-ヶー]{2,12}様/g, '');
            // Any remaining kana run in a mostly-Chinese line
            if ((cur.match(/[\u4e00-\u9fff]/g) || []).length >= 2) {
                cur = cur.replace(/[ぁ-んァ-ンー]{2,}/g, '');
            }
        }
        // Orphan honorific after wiping JA stem (keep「美羽小姐」; drop bare「小姐」/「的小姐」)
        cur = cur.replace(/的(?:小姐|先生|同学|桑|君|酱)(?=[\s，,、。！？!…]|$)/g, '');
        cur = cur.replace(
            /(?<![\u4e00-\u9fff])(?:小姐|先生|同学|桑|君|酱)(?=[\s，,、。！？!…]|$)/g,
            '',
        );
        // Moan kana leftover glued to ZH interjections: 啊ん → 啊
        cur = cur.replace(/([啊嗯哈呼哦噢欸诶])ん/g, '$1');
        // Single leftover ひゃ/ひょ glued to interjection
        cur = cur.replace(/([啊哇嗯哈])[ひヒ][ゃょャョ]/g, '$1');
        // Orphan 哩 after kana scrap (好痒哩ねえ → 好痒哩)
        cur = cur.replace(/哩(?=[\s，,？?！!。．.]|$)/g, '');
        // Dangling connective after wiping ちゃん (…才行，和)
        cur = cur.replace(/[，,]\s*和(?=[\s…。．.!！?？]*$)/g, '');
        cur = cur.replace(/\s{2,}/g, ' ').replace(/^[，,、\s]+|[，,、\s]+$/g, '').trim();
        // If we wiped almost everything but source was dialogue, leave empty for retry
        if (!cur && String(sourceText || '').trim()) {
            cur = '';
        }
        return { text: cur, changed: cur !== before };
    }

    /**
     * 「Xさん」is gender-neutral — strip fansub「X小姐／先生」back to the bare name.
     * Keep 小姐 only when source is お嬢様 / お嬢さん.
     */
    function normalizeZhHonorificFromJaSan(text, sourceText = '') {
        let cur = String(text ?? '');
        const src = String(sourceText || '');
        const before = cur;
        if (!cur || !src) return { text: cur, changed: false };
        if (/お嬢様|お嬢さん|嬢様/.test(src)) return { text: cur, changed: false };

        const names = new Set();
        const pushName = (stem, honorific) => {
            const s = String(stem || '').trim();
            if (!s || Array.from(s).length < 1) return;
            names.add(s);
            if (jaNames?.resolveCanonicalZhPersonName) {
                const zh = jaNames.resolveCanonicalZhPersonName(s, { honorific });
                if (zh) names.add(zh);
            }
        };

        if (jaNames?.extractJaPersonRefs) {
            for (const r of jaNames.extractJaPersonRefs(src)) {
                if (r.via !== 'honorific') continue;
                if (!/^(?:さん|ちゃん|くん|君)$/.test(String(r.honorific || ''))) continue;
                pushName(r.stem, r.honorific);
            }
        } else {
            const re = /([一-龯ぁ-んァ-ンー]{1,4})(さん|ちゃん|くん|君)/g;
            let m = re.exec(src);
            while (m) {
                pushName(m[1], m[2]);
                m = re.exec(src);
            }
        }

        for (const name of names) {
            if (/[ぁ-んァ-ン]/.test(name)) continue; // never leave kana+honorific as target
            const esc = escapeRegExp(name);
            cur = cur.replace(new RegExp(`${esc}(?:小姐|先生|同学)`, 'g'), name);
        }
        return { text: cur, changed: cur !== before };
    }

    /**
     * Kinship mistranslations: お母さん→母小姐 / 奥さん→奥小姐 / 旦那さん→旦那小姐.
     */
    function fixKinshipHonorificMistranslations(text, sourceText = '') {
        let cur = String(text ?? '');
        const src = String(sourceText || '');
        const before = cur;
        if (/お母|かあさん|母さん/.test(src) || /^お母さん/.test(src.trim())) {
            cur = cur.replace(/母小姐/g, '妈妈').replace(/妈妈小姐/g, '妈妈');
        }
        if (/お父|とうさん|父さん/.test(src) || /^お父さん/.test(src.trim())) {
            cur = cur.replace(/父小姐/g, '爸爸').replace(/爸爸小姐/g, '爸爸');
        }
        // 旦那さん = husband — never「旦那小姐」
        // If source is 奥さん but model wrote 旦那小姐, prefer 太太 (gender from source).
        if (/奥さん|おくさん/.test(src)) {
            cur = cur.replace(/旦那小姐/g, '太太');
            if (!/太太|夫人|老婆|妻子/.test(cur) && /对不起|抱歉|不好意思/.test(cur)) {
                const compact = cur.replace(/[。．.!！?？\s…·.•了啦啊呀哦喔]+/g, '');
                if (compact.length <= 8) {
                    cur = `${cur.trim().replace(/[。．.！!？?\s]+$/g, '')}太太`;
                }
            }
        }
        if (/旦那小姐/.test(cur) && (/旦那|だんな/.test(src) || !/奥さん|おくさん/.test(src))) {
            cur = cur.replace(/旦那小姐/g, '老公');
            cur = cur.replace(/(老公)(?:\s*\1)+/g, '$1');
        }
        // 奥さん = (someone's) wife — never a person name「奥小姐」
        // Also fix hallucinated 奥小姐 when source has no brother context
        if (/奥さん|おくさん/.test(src) || (/奥小姐/.test(cur) && !/お兄|お姉|姉さん|兄さん/.test(src))) {
            cur = cur.replace(/亲爱的奥小姐/g, '太太');
            cur = cur.replace(/奥小姐/g, '太太');
            cur = cur.replace(/(太太)(?:\s*\1)+/g, '$1');
            cur = cur.replace(/找太太回去找太太/g, '找太太');
            cur = cur.replace(/部长和部长和太太/g, '部长和太太');
        }
        if (/おばあちゃん|祖母/.test(src)) {
            cur = cur.replace(/祖母小姐|外婆小姐|奶奶小姐/g, (m) => m.replace(/小姐$/, ''));
        }
        if (/おじいちゃん|祖父/.test(src)) {
            cur = cur.replace(/祖父小姐|外公小姐|爷爷小姐/g, (m) => m.replace(/小姐$/, ''));
        }
        if (/お兄|兄さん/.test(src) && !/奥さん|おくさん/.test(src)) {
            cur = cur.replace(/兄小姐|奥小姐|亲爱的奥小姐/g, '哥哥');
        }
        if (/お姉|姉さん/.test(src)) {
            cur = cur.replace(/姉小姐|姐小姐/g, '姐姐');
        }
        // Standalone kinship cue
        if (/^お母さん[。．!！?？\s]*$/.test(src.trim()) && /母小姐|妈妈小姐/.test(cur)) {
            cur = cur.replace(/母小姐|妈妈小姐/g, '妈妈');
        }
        if (/^お父さん[。．!！?？\s]*$/.test(src.trim()) && /父小姐|爸爸小姐/.test(cur)) {
            cur = cur.replace(/父小姐|爸爸小姐/g, '爸爸');
        }
        return { text: cur, changed: cur !== before };
    }

    /**
     * Vocative ねえねえ + given name collapsed to 呐呐 / 喂喂 — restore the name.
     * Cue-pattern only (ねえねえ + 2–4 char name), not title-scoped.
     */
    function recoverNeeNeeGivenName(text, sourceText = '') {
        const original = String(text ?? '');
        const cur = original.trim();
        const src = String(sourceText || '').trim();
        const m = src.match(
            /^(?:ねえねえ|ねぇねぇ|ねえ、ねえ|ねぇ、ねぇ)[\s、,，]+([一-龯]{2,4}|[ァ-ヴー]{2,6}|[ぁ-ん]{2,6})[。．.!！?？\s]*$/,
        );
        if (!m) return { text: original, changed: false };
        const name = m[1];
        if (/^(?:今度|ちょっと|あなた|お願い|聞いて|見て|それ|これ|どう|なんで|何|待って|ほら|ねえ)$/.test(name)) {
            return { text: original, changed: false };
        }
        if (new RegExp(escapeRegExp(name)).test(cur)) return { text: original, changed: false };
        if (!/^(?:呐+|喂+|哎+|嘿+|嗨+)[。．.!！?？\s…·.•]*$/u.test(cur)) {
            return { text: original, changed: false };
        }
        return {
            text: `${cur.replace(/[。．.!！?？\s]+$/g, '')}${name}`,
            changed: true,
        };
    }

    /**
     * Remove mid-cue unjustified pollution stems (玲奈/真理…) and collapse name loops.
     * Single-char stems are left to trailing strip (too risky mid-sentence).
     * @param {string} text
     * @param {string} sourceText
     * @param {{ justifyOpts?: object }} [options]
     * @returns {{ text: string, changed: boolean, stripped: string[] }}
     */
    function stripUnjustifiedPollutionNames(text, sourceText, options = {}) {
        const raw = String(text ?? '');
        let cur = raw;
        const stripped = [];
        const justifyOpts = options.justifyOpts || {};
        // Only stems that actually appear — full lexicon scan is too slow on long batches
        const stems = MULTI_CHAR_POLLUTION_STEMS.filter((s) => cur.includes(s));

        for (const stem of stems) {
            const esc = escapeRegExp(stem);
            if (!sourceJustifiesZhName(stem, sourceText, justifyOpts)) {
                const re = new RegExp(
                    `${esc}(?:同学|小姐|先生|桑|君|酱|大人|老师)?`,
                    'g',
                );
                const next = cur.replace(re, '');
                if (next !== cur) {
                    stripped.push(stem);
                    cur = next;
                }
            } else {
                // Justified: collapse 玲奈玲奈 / 玲奈…玲奈 → single stem
                const reConsec = new RegExp(`(?:${esc}){2,}`, 'g');
                const reEllipsis = new RegExp(
                    `(${esc})(?:\\s*[…⋅・.。]{1,6}\\s*(?:${esc}))+`,
                    'g',
                );
                const next = cur.replace(reConsec, stem).replace(reEllipsis, '$1');
                if (next !== cur) {
                    cur = next;
                    if (!stripped.includes(`${stem}*`)) stripped.push(`${stem}*`);
                }
            }
        }

        // Unjustified single-char pollution: whole-cue or … loops only (avoid 花 in 鲜花)
        const singleStems = [...POLLUTION_NAME_STEMS]
            .filter((s) => Array.from(String(s)).length === 1 && cur.includes(s));
        for (const stem of singleStems) {
            if (sourceJustifiesZhName(stem, sourceText, justifyOpts)) continue;
            const esc = escapeRegExp(stem);
            const whole = new RegExp(`^[\\s…⋅・.。！？!?～〜\\-]*${esc}[\\s…⋅・.。！？!?～〜\\-]*$`);
            if (whole.test(cur.trim())) {
                stripped.push(stem);
                cur = '';
                continue;
            }
            const reConsec = new RegExp(`(?:${esc}){2,}`, 'g');
            const reEllipsis = new RegExp(
                `(?:${esc})(?:\\s*[…⋅・.。]{1,6}\\s*(?:${esc}))+`,
                'g',
            );
            const next = cur.replace(reConsec, '').replace(reEllipsis, '');
            if (next !== cur) {
                stripped.push(stem);
                cur = next;
            }
        }

        cur = cur
            .replace(/[^\S\n]{2,}/g, ' ')
            .replace(/^[^\S\n]+|[^\S\n]+$/g, '')
            .replace(/\s+([。．.！？!?…，,；;：:])/g, '$1');
        // Only trim ellipsis debris after we actually stripped a name —
        // otherwise dialogue that ends with 「…」loses its trailing ellipsis.
        if (stripped.length) {
            if (!/^(?:哈啊?|啊+|嗯+|唔+|呼+|呜+|哦+|噢+)[…·.。]*$/u.test(cur.trim())) {
                cur = cur.replace(/^[…⋅・.。～〜\s-]+|[…⋅・.。～〜\s-]+$/g, '');
            }
            cur = cur.trim();
            if (/^[…⋅・.\s。！？!?～〜\-'"，,]*$/.test(cur)) cur = '';
        }

        return {
            text: cur,
            changed: cur !== raw.trim(),
            stripped,
        };
    }

    /**
     * Drop trailing orphan name-like tokens not justified by the source.
     * Iterates so "……。 汤米 佳奈" / "……！ 汤米 舞" both clean up.
     * @param {string} text
     * @param {string} sourceText
     * @param {object} [options]
     * @returns {{ text: string, changed: boolean, stripped: string[] }}
     */
    function stripTrailingOrphanName(text, sourceText, options = {}) {
        let cur = String(text ?? '').trimEnd();
        const stripped = [];
        const maxRounds = Math.max(1, Math.min(6, Number(options.maxOrphanRounds) || 4));

        for (let round = 0; round < maxRounds; round += 1) {
            // space/punct + token (CJK 1–4, or Latin name, or Name+honorific)
            const m = cur.match(
                /^(.*?)([\s。！？!?…，,；;：:])\s*([\u4e00-\u9fff]{1,4}(?:同学|小姐|先生|桑|君|酱|大人|老师)?|[A-Za-z][A-Za-z0-9'’-]{1,15})$/,
            );
            if (!m) break;
            const head = `${m[1]}${m[2]}`.trimEnd();
            const token = m[3];
            if (!shouldStripTrailingOrphanToken(token, head, sourceText, options)) break;
            cur = head;
            stripped.push(token);
        }

        // note: justifyOpts may be on options for pollution mid-strip path

        const original = String(text ?? '');
        return {
            text: stripped.length ? cur : original,
            changed: stripped.length > 0 && cur !== original.trimEnd(),
            stripped,
        };
    }

    /**
     * If translation still dwarfs the source after compress, hard-cap length.
     * @param {string} text
     * @param {string} sourceText
     * @param {object} [options]
     * @returns {{ text: string, changed: boolean }}
     */
    function capPathologicalLength(text, sourceText, options = {}) {
        const raw = String(text ?? '');
        const srcLen = textLen(sourceText);
        const maxMul = Math.max(2, Number(options.maxLengthMul) || 4);
        const minCap = Math.max(24, Number(options.minCapChars) || 48);
        const maxChars = Math.max(minCap, srcLen > 0 ? Math.ceil(srcLen * maxMul) : minCap * 2);
        const chars = Array.from(raw);
        if (chars.length <= maxChars) return { text: raw, changed: false };
        let cut = chars.slice(0, maxChars).join('');
        const soft = cut.search(/[。！？!?…]\s*[^。！？!?…]{0,12}$/);
        if (soft >= Math.floor(maxChars * 0.5)) {
            cut = cut.slice(0, soft + 1);
        }
        return { text: cut.trimEnd(), changed: true };
    }

    function extractJaPersonRefs(text) {
        if (jaNames?.extractJaPersonRefs) {
            return jaNames.extractJaPersonRefs(text).map((r) => ({
                stem: r.stem,
                honorific: r.honorific || '',
                full: r.full || r.stem,
            }));
        }
        const out = [];
        const raw = String(text || '');
        JA_PERSON_RE.lastIndex = 0;
        let m = JA_PERSON_RE.exec(raw);
        while (m) {
            out.push({ stem: m[1], honorific: m[2], full: m[0] });
            m = JA_PERSON_RE.exec(raw);
        }
        return out;
    }

    function extractZhPersonRefs(text) {
        const out = [];
        const raw = String(text || '');
        ZH_PERSON_RE.lastIndex = 0;
        let m = ZH_PERSON_RE.exec(raw);
        while (m) {
            out.push({ stem: m[1], honorific: m[2], full: m[0] });
            m = ZH_PERSON_RE.exec(raw);
        }
        return out;
    }

    /**
     * Build alias→canonical replace rules from glossary / nameMap / glossaryTerms.
     * @param {object} [options]
     * @returns {{ from: string, to: string }[]}
     */
    function buildNameReplaceRules(options = {}) {
        /** @type {Map<string, string>} */
        const map = new Map();

        function add(from, to) {
            const a = String(from || '').trim();
            const b = String(to || '').trim();
            if (!a || !b || a === b) return;
            if (Array.from(a).length < 2) return;
            // Never map a longer canonical down to a shorter alias key collision
            if (map.has(a) && map.get(a) !== b) {
                // Prefer longer target (more specific canonical)
                if (Array.from(b).length <= Array.from(map.get(a)).length) return;
            }
            map.set(a, b);
        }

        const nameMap = options.nameMap && typeof options.nameMap === 'object'
            ? options.nameMap
            : null;
        if (nameMap) {
            for (const [from, to] of Object.entries(nameMap)) add(from, to);
        }

        for (const t of options.glossaryTerms || []) {
            if (!t || typeof t !== 'object') continue;
            const aliases = Array.isArray(t.aliases)
                ? t.aliases.map((x) => String(x || '').trim()).filter(Boolean)
                : [];
            const hasZhDst = !!(t.translation || t.dst || t.canonical);
            if (hasZhDst) {
                const canonical = String(t.canonical || t.translation || t.dst || '').trim();
                for (const a of aliases) add(a, canonical);
                const src = String(t.term || t.src || '').trim();
                // Chinese-only src used as another surface form of the ZH canonical
                if (src && canonical && src !== canonical && /^[\u4e00-\u9fff·・]+$/.test(src)) {
                    add(src, canonical);
                }
            } else if (t.term && aliases.length) {
                // Editor glossary style: term = canonical ZH, aliases = variants
                const canonical = String(t.term).trim();
                for (const a of aliases) add(a, canonical);
            }
        }

        // Full glossary document → alias → canonical
        if (options.glossary && glossaryCore?.normalizeGlossary) {
            const doc = glossaryCore.normalizeGlossary(options.glossary);
            for (const entry of doc.entries || []) {
                if (entry.enabled === false) continue;
                const canonical = String(entry.canonical || '').trim();
                if (!canonical) continue;
                const aliases = Array.isArray(entry.aliases) ? entry.aliases : [];
                for (const a of aliases) add(a, canonical);
            }
        }

        return [...map.entries()]
            .map(([from, to]) => ({ from, to }))
            .sort((a, b) => b.from.length - a.from.length || a.from.localeCompare(b.from, 'zh-CN'));
    }

    const ZH_NAME_STEM_STOP = new Set([
        '学长', '学姐', '前辈', '没事', '那个', '什么', '怎么', '自己', '朋友',
        '完全', '谢谢', '好的', '加油', '可爱', '化妆', '时间', '公司', '房间',
        '整个', '好烫', '好的', '不要', '等一下', '原来如此', '早上好', '早啊',
        '真的', '好厉害', '拜托了', '对不起', '失礼了',
        // Function / kinship words — never name-unify (Hy-MT invent “还有小姐”/“哥的还有”)
        '还有', '不是', '已经', '我们', '他们', '这个', '可以', '因为', '所以',
        '没有', '现在', '时候', '知道', '觉得', '出来', '进去', '起来', '下来',
        '过来', '回去', '哥哥', '弟弟', '姐姐', '妹妹', '媳妇', '妻子', '老公',
        '老婆', '夫人', '小姐', '先生', '老师', '同学', '大人',
        '哥的还有', '还有小姐', '哥的还有小姐', '哥的沙罗',
        // Lecture discourse (MFYD-182: 「那么 开始吧」must not strip 那么 as a name)
        '那么', '首先', '只是', '也就是说', '然后', '之后', '其实', '不过', '因此',
        '于是', '总之', '另外', '此外', '接着', '后来', '而且', '并且', '如果',
        '虽然', '这次', '今天', '慢慢来', '心跳加速',
    ]);

    function isBlockedZhNameStem(stem) {
        const s = String(stem || '').trim();
        if (!s) return true;
        if (ZH_NAME_STEM_STOP.has(s)) return true;
        if (STICKY_SHORT_ZH.has(s)) return true;
        if (/^(?:还有|不是|已经|真的|这个|那个|可以|因为|所以|没有|啊啊|嗯嗯|啊嗯|的好烫|好烫|好烫的好烫)$/.test(s)) {
            return true;
        }
        if (/好烫|的好烫/.test(s)) return true;
        if (/^(?:还有|不是|已经|真的|这个|那个|可以|因为|所以|没有)/.test(s)) return true;
        if (/^哥的/.test(s) && !/^哥的[\u4e00-\u9fff]{2,4}$/.test(s)) return true;
        return false;
    }

    function lexiconZhFormsForJaStem(stem) {
        const s = String(stem || '').trim();
        const out = [];
        const preferred = jaNames?.resolveCanonicalZhPersonName?.(s);
        if (preferred && /^[\u4e00-\u9fff]{2,4}$/.test(preferred)) out.push(preferred);
        const list = jaNames?.LEXICON?.byKana?.get?.(s);
        if (Array.isArray(list)) {
            for (const z of list) {
                const t = String(z || '').trim();
                if (/^[\u4e00-\u9fff]{2,4}$/.test(t)) out.push(t);
            }
        }
        return [...new Set(out)];
    }

    function extractZhGivenNameStems(zh, jaStem) {
        const text = String(zh || '');
        const stems = [];
        for (const zr of extractZhPersonRefs(text)) {
            if (zr.stem && !isBlockedZhNameStem(zr.stem)) stems.push(zr.stem);
        }
        const lead = text.match(/^[\u4e00-\u9fff]{2,3}(?=哥|也|桑|君|酱|同学|小姐|先生|老师|$|[\s，。！？、])/);
        if (lead && !isBlockedZhNameStem(lead[0])) stems.push(lead[0]);
        const preferred = lexiconZhFormsForJaStem(jaStem);
        for (const form of preferred) {
            if (text.includes(form) && !isBlockedZhNameStem(form)) stems.push(form);
        }
        return [...new Set(stems)];
    }

    function foldNameChar(ch) {
        const c = String(ch || '');
        if (c === '輝') return '辉';
        if (c === '姫' || c === '姬') return '希';
        return c;
    }

    function nameCharSet(stem, counts) {
        const chars = new Set();
        for (const z of counts.keys()) {
            for (const ch of Array.from(z)) chars.add(foldNameChar(ch));
        }
        for (const z of lexiconZhFormsForJaStem(stem)) {
            for (const ch of Array.from(z)) chars.add(foldNameChar(ch));
        }
        for (const ch of Array.from(String(stem || ''))) {
            if (/[\u4e00-\u9fff]/.test(ch)) chars.add(foldNameChar(ch));
        }
        return chars;
    }

    function absorbGivenNameClusters(map, translatedCues, sourceCues, srcByIndex) {
        /** @type {Map<string, Map<string, number>>} */
        const byStem = new Map();
        (translatedCues || []).forEach((c, i) => {
            const idx = Number.isInteger(Number(c?.index)) ? Number(c.index) : i;
            const zh = String(c?.text ?? '');
            const ja = srcByIndex.has(idx)
                ? srcByIndex.get(idx)
                : String(sourceCues?.[i]?.text ?? '');
            const jaRefs = extractJaPersonRefs(ja).filter((r) => Array.from(r.stem || '').length >= 2);
            if (!jaRefs.length) return;
            for (const jr of jaRefs) {
                if (jaNames?.isAmbiguousHiraganaForm?.(jr.stem)) continue;
                const zhStems = extractZhGivenNameStems(zh, jr.stem);
                if (!zhStems.length) continue;
                if (!byStem.has(jr.stem)) byStem.set(jr.stem, new Map());
                const counts = byStem.get(jr.stem);
                for (const zs of zhStems) {
                    counts.set(zs, (counts.get(zs) || 0) + 1);
                }
            }
        });
        const stems = [...byStem.keys()];
        for (let i = 0; i < stems.length; i += 1) {
            for (let j = i + 1; j < stems.length; j += 1) {
                const a = stems[i];
                const b = stems[j];
                if (!byStem.has(a) || !byStem.has(b)) continue;
                const kana = /[ぁ-んァ-ン]/.test(a) ? a : (/[ぁ-んァ-ン]/.test(b) ? b : '');
                if (!kana) continue;
                const other = kana === a ? b : a;
                const ca = nameCharSet(a, byStem.get(a));
                const cb = nameCharSet(b, byStem.get(b));
                let overlap = false;
                for (const ch of ca) {
                    if (cb.has(ch)) {
                        overlap = true;
                        break;
                    }
                }
                if (!overlap) continue;
                const merged = byStem.get(kana);
                for (const [form, n] of byStem.get(other)) {
                    merged.set(form, (merged.get(form) || 0) + n);
                }
                byStem.delete(other);
            }
        }
        for (const [jaStem, counts] of byStem) {
            const total = [...counts.values()].reduce((a, b) => a + b, 0);
            if (total < 2 || counts.size < 2) continue;
            const preferred = lexiconZhFormsForJaStem(jaStem);
            let canonical = '';
            for (const p of preferred) {
                if (counts.has(p)) {
                    canonical = p;
                    break;
                }
            }
            if (!canonical) {
                canonical = [...counts.entries()]
                    .sort((a, b) => b[1] - a[1]
                        || Array.from(b[0]).length - Array.from(a[0]).length
                        || a[0].localeCompare(b[0], 'zh-CN'))[0]?.[0] || '';
            }
            if (!canonical) continue;
            if (isBlockedZhNameStem(canonical)) continue;
            for (const [variant] of counts) {
                if (variant === canonical) continue;
                if (isBlockedZhNameStem(variant)) continue;
                // Avoid padding invents: 还有 → 哥的还有
                if (canonical.includes(variant) && canonical.length > variant.length + 1) {
                    const pref = lexiconZhFormsForJaStem(jaStem);
                    if (pref.length && pref.some((p) => variant === p || canonical === p)) {
                        // ok if lexicon endorses
                    } else if (!pref.includes(canonical)) {
                        continue;
                    }
                }
                map.set(variant, canonical);
            }
        }
    }

    function absorbSenpaiClusters(map, translatedCues, sourceCues, srcByIndex) {
        const counts = new Map();
        (translatedCues || []).forEach((c, i) => {
            const idx = Number.isInteger(Number(c?.index)) ? Number(c.index) : i;
            const zh = String(c?.text ?? '');
            const ja = srcByIndex.has(idx)
                ? srcByIndex.get(idx)
                : String(sourceCues?.[i]?.text ?? '');
            if (!/先輩|せんぱい|センパイ/i.test(ja)) return;
            for (const form of ['学长', '学姐', '前辈']) {
                if (zh.includes(form)) counts.set(form, (counts.get(form) || 0) + 1);
            }
        });
        if (counts.size < 2) return;
        const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'));
        const winner = ranked[0];
        const second = ranked[1];
        const total = ranked.reduce((s, [, n]) => s + n, 0);
        if (!winner || total < 4) return;
        if (winner[1] < Math.max(2 * (second?.[1] || 0), Math.ceil(total * 0.7))) return;
        for (const [form] of ranked) {
            if (form !== winner[0]) map.set(form, winner[0]);
        }
    }

    /**
     * Infer ZH name-form consistency from JA honorific co-occurrence across cue pairs.
     * Same 倉木さん → {仓木同学, 仓木小姐, 花菜小姐} ⇒ unify minority forms to majority.
     * @param {Array} translatedCues
     * @param {Array} sourceCues
     * @returns {{ from: string, to: string }[]}
     */
    function inferNameRulesFromCuePairs(translatedCues, sourceCues = []) {
        const srcByIndex = new Map();
        for (const c of sourceCues || []) {
            const idx = Number(c?.index);
            if (Number.isInteger(idx)) srcByIndex.set(idx, String(c?.text ?? ''));
        }

        /** @type {Map<string, Map<string, number>>} jaStem → (zhFull → count) */
        const byJaStem = new Map();
        /** @type {Map<string, Map<string, number>>} zhStem → (zhFull → count) */
        const byZhStem = new Map();

        function bump(root, key, form) {
            if (!root.has(key)) root.set(key, new Map());
            const m = root.get(key);
            m.set(form, (m.get(form) || 0) + 1);
        }

        (translatedCues || []).forEach((c, i) => {
            const idx = Number.isInteger(Number(c?.index)) ? Number(c.index) : i;
            const zh = String(c?.text ?? '');
            const ja = srcByIndex.has(idx)
                ? srcByIndex.get(idx)
                : String(sourceCues?.[i]?.text ?? '');
            const jaRefs = extractJaPersonRefs(ja);
            const zhRefs = extractZhPersonRefs(zh);
            for (const zr of zhRefs) bump(byZhStem, zr.stem, zr.full);
            if (!jaRefs.length || !zhRefs.length) return;
            for (const jr of jaRefs) {
                for (const zr of zhRefs) {
                    bump(byJaStem, jr.stem, zr.full);
                }
            }
        });

        /** @type {Map<string, string>} */
        const map = new Map();

        function isZhPersonFull(form) {
            const f = String(form || '');
            if (!/^[\u4e00-\u9fff]{1,4}(?:同学|小姐|先生|桑|君|酱|大人|老师)$/.test(f)) return false;
            const stem = f.replace(/(?:同学|小姐|先生|桑|君|酱|大人|老师)$/, '');
            return !isBlockedZhNameStem(stem);
        }

        function pickCanonical(countMap) {
            const ranked = [...countMap.entries()]
                .sort((a, b) => b[1] - a[1]
                    || Array.from(b[0]).length - Array.from(a[0]).length
                    || a[0].localeCompare(b[0], 'zh-CN'));
            return ranked[0]?.[0] || '';
        }

        function absorbFullPersonCluster(countMap) {
            if (!countMap || countMap.size < 2) return;
            const fullOnly = new Map();
            for (const [form, count] of countMap) {
                if (isZhPersonFull(form)) fullOnly.set(form, count);
            }
            if (fullOnly.size < 2) return;
            const canonical = pickCanonical(fullOnly);
            if (!canonical) return;
            for (const [variant] of fullOnly) {
                if (variant !== canonical) map.set(variant, canonical);
            }
        }

        for (const countMap of byJaStem.values()) absorbFullPersonCluster(countMap);
        for (const countMap of byZhStem.values()) absorbFullPersonCluster(countMap);

        absorbGivenNameClusters(map, translatedCues, sourceCues, srcByIndex);
        absorbSenpaiClusters(map, translatedCues, sourceCues, srcByIndex);

        return [...map.entries()]
            .map(([from, to]) => ({ from, to }))
            .sort((a, b) => b.from.length - a.from.length || a.from.localeCompare(b.from, 'zh-CN'));
    }

    /**
     * Apply alias→canonical name rules (longest match first).
     * @param {string} text
     * @param {{ from: string, to: string }[]} rules
     * @returns {{ text: string, changed: boolean, replacements: number }}
     */
    function applyNameConsistency(text, rules) {
        let cur = String(text ?? '');
        let replacements = 0;
        const list = Array.isArray(rules) ? rules : [];
        for (const rule of list) {
            const from = String(rule?.from || '');
            const to = String(rule?.to || '');
            if (!from || !to || from === to) continue;
            // Block function-word invents (还有→哥的还有); allow 学姐→学长 address unify.
            if (/^(?:还有|不是|已经|真的|这个|那个|可以|因为|所以|没有|哥的还有|啊啊|嗯嗯|啊嗯|的好烫|好烫|舒服吗|好舒服|好厉害)$/.test(from)) continue;
            if (/^(?:还有|不是|已经|真的|这个|那个|可以|因为|所以|没有|哥的还有|啊啊|嗯嗯|啊嗯|的好烫|好烫|舒服吗|好舒服|好厉害)$/.test(to)) continue;
            if (/好烫|的好烫/.test(from) || /好烫|的好烫/.test(to)) continue;
            if (STICKY_SHORT_ZH.has(from) || STICKY_SHORT_ZH.has(to)) continue;
            if (!cur.includes(from)) continue;
            // Skip if `from` is only a substring of an already-canonical longer form
            // that we should keep (handled by longest-first order).
            const re = new RegExp(escapeRegExp(from), 'g');
            const next = cur.replace(re, () => {
                replacements += 1;
                return to;
            });
            cur = next;
        }
        return { text: cur, changed: replacements > 0, replacements };
    }

    function collectAllowedNames(rules, glossaryTerms) {
        const allowed = new Set();
        for (const r of rules || []) {
            if (r?.to) allowed.add(String(r.to));
            if (r?.from) allowed.add(String(r.from));
        }
        for (const t of glossaryTerms || []) {
            for (const key of ['term', 'translation', 'dst', 'canonical', 'src']) {
                const v = String(t?.[key] || '').trim();
                if (v && /^[\u4e00-\u9fff·・]{2,8}$/.test(v)) allowed.add(v);
            }
            for (const a of t?.aliases || []) {
                const v = String(a || '').trim();
                if (v) allowed.add(v);
            }
        }
        return allowed;
    }

    /** Known Sakura/Opus orphan ZH lines unrelated to JA (IPZZ-745). */
    const ORPHAN_STUCK_ZH = new Set([
        '我有好好地在工作',
        '我有好好地在工作。',
    ]);
    // Long stuck NSFW template (pattern opaque)
    const ORPHAN_STUCK_ZH_RE = mtOpaque?.RE?.orphanStuckZh || /$a/;

    function jaNormKey(text) {
        return String(text || '')
            .replace(/[\s、。.!！?？~～ー…]+/g, '')
            .trim();
    }

    function zhNormKey(text) {
        return String(text || '')
            .replace(/[\s。．.!！?？~～…，,]+/g, '')
            .trim();
    }

    function remapZhFromJaSimple(ja) {
        const s = String(ja || '').trim();
        if (!s) return null;
        const adultRemap = mtOpaque?.remapAdultZhFromJa?.(s, { textLen });
        if (adultRemap != null && adultRemap !== '') return adultRemap;
        const mundaneGloss = remapMundaneHospitalOrMealJa(s);
        if (mundaneGloss) return mundaneGloss;
        const bare = s.replace(/[。．.!！]+$/g, '');
        if (/^あはは|^ははは/.test(s)) {
            if (mtOpaque?.RE?.ahahaIkuSrc?.test(s)) {
                return /[?？]/.test(s)
                    ? (mtOpaque?.T?.ahahaIkuQZh || '')
                    : (mtOpaque?.T?.ahahaIkuZh || '');
            }
            if (/気持ちいい|きもちいい|きもちいっ|きもちぃ|キモチイイ|きもち/.test(s)) {
                return mtOpaque?.T?.ahahaFeelZh || '哈哈，好舒服';
            }
            const laughRest = s.replace(/^[あははははぁァっッ、,，\s…]+/u, '');
            // Pure laugh only → 哈哈. Any leftover token (やば/やめ/エロ) falls through to remap.
            if (!laughRest || /^(?:[ぁあぃいぅうぇえぉおんっー〜～]+)$/u.test(laughRest.replace(/\s+/g, ''))) {
                return '哈哈';
            }
            // Lexical after あはは — fall through so moan-strip remap can recover.
        }
        if (/^はい$/.test(bare)) return '好的';
        // Lengthened / reduplicated affirmatives (MIKR blank-recover misses)
        if (/^はーい+$/.test(bare) || /^はあい+$/.test(bare)) return '好的';
        if (/^(?:はいはい|はーいはーい)[。．.!！?？…\s]*$/u.test(s)) return '好好';
        if (/^(?:そうそう|そうそう)[。．.!！?？…\s]*$/u.test(s)) return '对对';
        if (/^(?:すまん|すまない|ごめん|ごめんなさい|すみません)[。．.!！?？…\s]*$/u.test(s)
            && textLen(s) <= 10) {
            return /ごめん|すみません/.test(s) ? '对不起' : '抱歉';
        }
        if (/^(?:オッケー|オーケー|OK|ok|Okay|okay)[。．.!！?？…\s]*$/u.test(s)) return '好的';
        if (/^(?:ねえねえ|ねぇねぇ|ねね)[。．.!！?？…\s]*$/u.test(s)) return '喂喂';
        if (/^練習だよ[。．.!！?？…\s]*$/u.test(s)) {
            return /[?？]/.test(s) ? '是练习哦？' : '是练习哦';
        }
        if (/^お別れです[。．.!！?？…\s]*$/u.test(s) && textLen(s) <= 10) return '要分别了';
        // High-frequency blank leftovers (plan=recover but table miss → permanent「…」)
        if (textLen(s) <= 28) {
            if (/^(?:え[、,，]?\s*)?もちろん(?:だよ|です)?[。．.!！?？…\s]*$/u.test(s)) {
                return /だよ|です/.test(s) ? '当然了' : '当然';
            }
            if (/^正解[。．.!！?？…\s]*$/u.test(s)) return '答对了';
            if (/^そっか[ぁあ]?[。．.!！?？…\s]*$/u.test(s)) return '这样啊';
            if (/^どうも[。．.!！?？…\s]*$/u.test(s)) return '谢谢';
            if (/^どうだった[の]?[。．.!！?？…\s]*$/u.test(s)) {
                return /[?？]/.test(s) ? '怎么样？' : '怎么样';
            }
            if (/ありがとう/.test(s) && textLen(s) <= 22
                && !/お父さん|お父|父さん|チャッピ|ちゃっぴ|チャピ/.test(s)
                && !/(?:ちんぽ|チンポ|おちん|ちんちん|チンチン|ペニス|まんこ|おまんこ|マンコ|乳首|おっぱい)/.test(s)) {
                if (/ございま/.test(s)) return /はい/.test(s) ? '好的，谢谢' : '非常感谢';
                return /はい/.test(s) ? '好的，谢谢' : '谢谢';
            }
            if (/^(?:だよ|だね|だな)[。．.!！?？…\s]*$/u.test(s)) return '是啊';
            if (/^そうだ[よね]?[。．.!！?？…\s]*$/u.test(s)) return '对了';
            if (/^(?:はい[…·.\s]*)+はい[。．.!！?？…\s]*$/u.test(s)) return '好的…好的';
            if (/^はいよ[。．.!！?？…\s]*$/u.test(s)) return '好的';
            if (/^あ[、,，]?\s*はい[。．.!！?？…\s]*$/u.test(s)) return '啊，好的';
            if (/^全然です[。．.!！?？…\s]*$/u.test(s)) return '完全没有';
            if (/^もういいです[。．.!！?？…\s]*$/u.test(s)) return '够了';
            if (/^なんだ[よ]?[。．.!！?？…\s]*$/u.test(s)) {
                return /[?？]/.test(s) ? '什么啊？' : '什么啊';
            }
            if (/^(?:よ[、,，]?\s*)?おはよう[。．.!！?？…\s]*$/u.test(s)
                && !/ご主人|主人様|主人/.test(s)) {
                return '早啊';
            }
            if (/^(?:誰|だれ)[。．.!！?？…\s]*$/u.test(s)) {
                return /[?？]/.test(s) ? '谁？' : '谁';
            }
            if (/^(?:いえ[、,，\s]*)+いえ[。．.!！?？…\s]*$/u.test(s)
                || /^(?:いいえ[、,，\s]*)+いいえ[。．.!！?？…\s]*$/u.test(s)) {
                return '不，不是';
            }
            if (/すみません|すいません/.test(s) && /失礼/.test(s) && textLen(s) <= 24) {
                return '不好意思，失礼了';
            }
            if (/^申し訳ありません/.test(s) && textLen(s) <= 24) return '非常抱歉';
        }
        if (/^うん$/.test(bare)) return '嗯嗯';
        if (/^ええ$/.test(bare)) return '嗯嗯';
        if (/^はい[\s　]+どうぞ[。．.!！?？…\s]*$/u.test(s)) return '好的，请';
        if (/^どうぞ$/.test(bare)) return '请';
        if (/^(?:そうです|そうだよ)$/.test(bare)) return '是的';
        if (/^(?:そうですね|そうだね)$/.test(bare)) return '是啊';
        if (/^何ですか$/.test(bare)) return '什么？';
        if (/^もっと$/.test(bare)) return /[?？]/.test(s) ? '再多点？' : '再多点';
        if (/^(?:あらあら)(?:[\s　]+あらあら)?$/.test(bare)) return '哎呀';
        if (/^(?:ヤバ|やば)い?[。．.!！?？…]*$/i.test(bare)) return '糟了';
        if (/^(?:バイバイ|ばいばい)[んン]?[。．.!！?？…]*$/u.test(bare)) return '拜拜';
        if (/楽しい|たのしい/.test(s) && textLen(s) <= 18) {
            return /うん/.test(s) ? '好开心，嗯' : '好开心';
        }
        if (/ラブゾンリー|ラブゾン/.test(s) && textLen(s) <= 40) {
            return /待って/.test(s) ? '只爱一人…等一下' : '只爱一人';
        }
        // Incomplete discourse trailers — most common LLM skip class after retries
        if (textLen(s) <= 16) {
            const bareForTrail = bare
                .replace(/[…・.…!！?？\s]+$/g, '')
                .replace(/^[…・.\s]+/, '');
            // Goodbyes before stripping trailing ね (じゃあね ≠ じゃあ)
            if (/^じゃあね/.test(bareForTrail) && textLen(s) <= 10) {
                return /[…・]/.test(s) ? '再见啦……' : '再见啦';
            }
            if (/^またね/.test(bareForTrail) && textLen(s) <= 8) {
                return /[…・]/.test(s) ? '再见……' : '再见';
            }
            const stem = bareForTrail
                .replace(/[〜～]+$/g, '')
                .replace(/(?:ねー|ねえ|ね|ー)+$/u, '');
            const trail = {
                'いや': '不', 'でも': '但是', 'だから': '所以', 'じゃあ': '那就',
                'それに': '而且', 'やっぱり': '果然', 'もう': '已经', 'あの': '那个',
                'そして': '然后', 'その': '那个', 'これ': '这个', 'それでは': '那么',
                'それじゃあ': '那么', 'それじゃ': '那么',
                'さて': '那么', 'な': '呐', 'なあ': '呐', 'ねぇ': '喂', 'おい': '喂',
                'えー': '诶', 'へー': '诶', 'あれ': '咦', 'ちょ': '等一下', 'ちょっと': '等一下',
                'そうか': '是吗', 'あい': '哎', 'ふむ': '嗯', 'ふぅむ': '嗯', 'フー': '呼',
                'よかったら': '可以的话', '今まで': '至今为止', 'これから': '接下来',
                '先に': '先', 'したい': '想要',
                'じゃあね': '再见啦', 'またね': '再见', 'ありがと': '谢谢',
                'やば': '糟了', 'ヤバ': '糟了', 'すげえ': '好厉害', 'すごい': '好厉害',
                'なるほど': '原来如此', '待っ': '等一下', 'だって': '因为', 'じゃ': '那就',
                'チッ': '啧', 'うま': '真棒', 'でか': '好大',
                'どうした': '怎么了', 'どうしたの': '怎么了', 'もしかしたら': '说不定',
                'やった': '太好了', 'やったー': '太好了', 'はよ': '早啊', 'はよー': '早啊',
                'ほって': '别管了', '放って': '别管了',
                'とりあえず': '先', 'とにかく': '总之', 'つまり': '也就是说',
                '要するに': '总而言之', 'ちなみに': '顺便说一下',
            };
            if (Object.prototype.hasOwnProperty.call(trail, stem)) {
                const zh = trail[stem];
                return /[…・]/.test(s) ? `${zh}……` : zh;
            }
            // Prefixed discourse (それじゃあさ / それじゃあね / じゃあさ)
            if (/^それじゃあ/.test(stem) && textLen(s) <= 12) {
                return /[…・]/.test(s) ? '那么……' : '那么';
            }
            if (/^それじゃ$/.test(stem) || /^それじゃ[あぁ]/.test(stem)) {
                return /[…・]/.test(s) ? '那么……' : '那么';
            }
            if (/^じゃあ(?!ね)/.test(stem) && textLen(s) <= 8) {
                return /[…・]/.test(s) ? '那就……' : '那就';
            }
            if (/^どうした/.test(bare) && textLen(s) <= 12) {
                return /[?？]/.test(s) ? '怎么了？' : '怎么了';
            }
            if (/^今何時/.test(bare) && textLen(s) <= 10) return '现在几点了？';
            if (/^おはよう/.test(bare) && textLen(s) <= 16 && !/ご主人|主人様|主人/.test(s)) {
                return /ございま/.test(s) ? '早上好' : '早啊';
            }
            if (/^(?:すっごい|すごい)(?:です)?(?:ね)?$/.test(bare) && textLen(s) <= 14) {
                return '好厉害啊';
            }
            if (/^お帰り/.test(bare) && textLen(s) <= 12) {
                return /[?？]/.test(s) ? '你回来了吗？' : '欢迎回来';
            }
            if (/^手術の後$/.test(bare)) return '手术之后';
            if (/^こんな話$/.test(bare)) return '这种话';
            if (/^妻に$/.test(bare)) return '对妻子';
            if (/^気持ち\??$/.test(bare) || /^気持ち\?$/.test(s.trim())) {
                return /[?？]/.test(s) ? '舒服吗？' : '感觉';
            }
            if (/^くせ[ぇええー]+$/.test(bare)) return '好臭';
            if (/^ぐちゃぐちゃ$/.test(bare)) return '湿漉漉的';
            if (/おかえり/.test(s) && /ただいま/.test(s) && textLen(s) <= 20) {
                return '欢迎回来。我回来了';
            }
            if (/^ただいま$/.test(bare)) return '我回来了';
            if (/^私$/.test(bare)) return '我';
            if (/^私も$/.test(bare)) return '我也';
            // Name+honorific address cues only (require さん/くん — never bare 大丈夫/肉棒)
            {
                const nameHon = bare.match(/^([\u4e00-\u9fff]{2,4})(さん|くん|君|ちゃん|さま|様)$/);
                if (nameHon && textLen(s) <= 10) return nameHon[1];
            }
            if (/^ちょっと$/.test(bare) || /^ちょっと[っッ]?$/.test(bare)) return '等一下';
            if (/^あげた(?:あげた)?$/.test(bare)) return '给了';
            if (/^すすす+$/.test(bare)) return '嗯…';
            if (/^ごめんなさい$|^ごめん$/.test(bare)) return '对不起';
            // Do not invent「不好意思，拜托了」here — leave すみません+お願い for re-MT
            // (isSeverelyUnderTranslated treats bare「拜托了」as under vs apology JA).
            if (/^(?:だめ|ダメ|駄目)(?:だよ|だって|です)?$/.test(
                bare.replace(/[…・.\s]+$/g, ''),
            )) return /[…・]/.test(s) ? '不行……' : '不行';
            if (/^お願いします$/.test(bare.replace(/[…・.\s]+$/g, ''))) return '拜托了';
            if (/^お願い$/.test(bare.replace(/[…・.\s]+$/g, ''))) return '拜托';
            if (/^帰らないで$/.test(bare.replace(/[…・.\s]+$/g, ''))) return '别走';
            if (/^ほんとだよ$|^ほんとに$/.test(bare.replace(/[…・.\s]+$/g, ''))) {
                return /だよ/.test(s) ? '真的啊' : '真的';
            }
        }
        if (/^(?:はむ|ハム|んぶ|ンブ)[っッぅうゥウ]*[!！?？…。．.\s]*$/.test(s)
            || /^(?:はむ|ハム){2,}[っッ]?[!！?？…。．.\s]*$/.test(s)) {
            return '嗯嗯';
        }
        if (/^そう(?:だね|だよ|ね|よ)?$/.test(bare)) return '是啊';
        if (/^うん[、,，]\s*そう/.test(s) && textLen(s) <= 12) return '嗯，是啊';
        if (/^ねえ[、,，]?\s*あなた/.test(s) && textLen(s) <= 12) return '喂，你';
        if (/^はい[、,，]\s*失礼します/.test(s)) return '好的，失陪了';
        if (/^失礼します/.test(bare) && textLen(s) <= 10) return '失陪了';
        if (/^はい[、,，]\s*貸して/.test(s)) return '好的，借我';
        if (/もしもし/.test(s) && textLen(s) <= 12) return '喂，你好';
        if (/冗談です/.test(s) && textLen(s) <= 16) return '呵呵，开玩笑的';
        if (/^ああ[、,，]\s*わかった/.test(s)) return '啊，知道了';
        if (/^うん[、,，]\s*わかった/.test(s)) return '嗯，知道了';
        if (/^わかった[。．.!！]*$/.test(bare)) return '知道了';
        if (/わかりました/.test(s) && textLen(s) <= 16) {
            return /^はい/.test(s) ? '好的，明白了' : '明白了';
        }
        if (/ありがとう/.test(s) && /お父さん|お父|父さん/.test(s) && textLen(s) <= 20) {
            return '谢谢，爸爸';
        }
        if (/^ああ[、,，]\s*そうだ(?:な|ね|よ)?[。．.!！]*$/.test(s)) return '啊，是啊';
        if (/^いいです[、,，]?\s*ほら/.test(s) && textLen(s) <= 14) return '可以，你看';
        if (/^いいです[。．.…!！]*$/.test(bare) && textLen(s) <= 8) return '可以';
        if (/^えっと[。．.…!！]*$/.test(bare) && textLen(s) <= 8) return '那个……';
        if (/^えっと[、,，]\s*はい[。．.…!！]*$/.test(s) && textLen(s) <= 10) return '嗯，好的';
        if (/もう一番疲れてる/.test(s) && textLen(s) <= 16) {
            return /かも/.test(s) ? '可能是最累的一次了' : '是最累的一次了';
        }
        if (/^またお尻/.test(s) && textLen(s) <= 10) {
            return /[?？]/.test(s) ? '又是屁股吗？' : '又是屁股';
        }
        if (/これで最後だよ/.test(s) && textLen(s) <= 12) return '这是最后一次了…';
        if (/ちょっと[、,，]?\s*北乃/.test(s) && textLen(s) <= 12) return '等等，北乃君';
        if (/仕事中もこのこと/.test(s) && textLen(s) <= 28) {
            return /ばか考えて/.test(s) ? '工作的时候也一直在想这种事吗？' : '工作的时候也在想这个吗？';
        }
        if (/^んー[…・.]+\s*もっと/.test(s) && textLen(s) <= 12) return '嗯……再多一点';
        // 気に入っちゃ ≠ 入っちゃ (SNOS-256 false positive)
        if (/気に入っちゃ/.test(s) && textLen(s) <= 18) {
            return /じゃん/.test(s) ? '很中意嘛…' : '很中意呢…';
        }
        if (/入っちゃ/.test(s) && !/気に入っちゃ/.test(s) && textLen(s) <= 16) {
            return '啊，进去了……';
        }
        if (/これで最後/.test(s) && textLen(s) <= 12) return '这是最后一次了…';
        if (/すいません/.test(s) && /らいましちゃ|やりましちゃ/.test(s) && textLen(s) <= 24) {
            return '对不起…做过火了…';
        }
        if (/クラブサンド|グラブンサンド/.test(s) && textLen(s) <= 28) {
            return /ください|マスター|マスタ/.test(s)
                ? '俱乐部三明治……请来一份'
                : '俱乐部三明治';
        }
        if (/かしこまりました/.test(s) && textLen(s) <= 16) return '遵命';
        if (/承知しました/.test(s) && textLen(s) <= 14) return '明白了';
        if (/くそ[っつ]/.test(s) && textLen(s) <= 16) {
            return /はぁ|はあ|はあっ|ハァ/.test(s) ? '哈…，该死' : '该死';
        }
        if (/大丈夫だって/.test(s) && /気にし/.test(s) && textLen(s) <= 36) {
            return '没关系的，别在意那种事';
        }
        // Check-in / OK? (今大丈夫? / 大丈夫か?) — never manly「大丈夫」homograph
        if (/大丈夫|だいじょうぶ/.test(s) && textLen(s) <= 18) {
            if (/今|か[？?]|ですか|どう|大丈夫か|だいじょうぶか/.test(s) || /[？?]$/.test(s.trim())) {
                return /今|どう/.test(s) ? '现在还好吗？' : '没事吧？';
            }
            if (/^(?:大丈夫|だいじょうぶ)(?:です|だよ?|よ)?[。．.!！?？…\s]*$/u.test(s.trim())) {
                return '没事';
            }
        }
        if (/おはよう/.test(s) && /ご主人様|ご主人|主人様/.test(s) && textLen(s) <= 28) {
            return '早上好，主人';
        }
        if (/最初は言う/.test(s) && textLen(s) <= 18) return '啊，一开始先说';
        if (/^(?:ぐび|グビ){2,}[ぉオ]?[…。．.!！?\s]*$/.test(s)) return '嗯嗯';
        if (/^(?:フフ+|ふふ+|ウフフ+)[っッ]?[…。．.!！?\s]*$/.test(s)) return '呵呵';
        if (/あぐ[うぅウゥ]+/.test(s) && textLen(s) <= 24) return '啊……';
        if (/^ぱ[っッ]?[!！?？…。．.\s]*$/.test(s)) return '啵';
        if (/かわいい|可愛い/.test(s) && textLen(s) <= 18) {
            return /はぁ|はあ|ハァ/.test(s) ? '哈…，好可爱' : '好可爱';
        }
        if (/求めて/.test(s) && textLen(s) <= 24) return '想要我……';
        if (/もっと入れて/.test(s) && textLen(s) <= 28) {
            return /はぁ|はあ|だんなら|それなら/.test(s) ? '哈…，那就再插进来' : '再插进来';
        }
        if (/お先失礼|お疲れ様/.test(s) && /あはは|ははは/.test(s) && textLen(s) <= 36) {
            return '先走了，辛苦了，哈哈';
        }
        if (/^あ[、,，]\s*.{1,8}(?:くん|君|さん|ちゃん)[。．.!！]*$/.test(s) && textLen(s) <= 14) {
            const m = s.match(/^あ[、,，]\s*(.+?)(?:くん|君|さん|ちゃん)/);
            if (m?.[1]) {
                const honor = /ちゃん/.test(s) ? '酱' : (/さん/.test(s) ? '桑' : '君');
                return `啊，${m[1].trim()}${honor}`;
            }
        }
        if (/隊長/.test(s) && textLen(s) <= 12) {
            return /^ああ?/.test(s) ? '啊，队长' : '队长';
        }
        if (/^ねえ[、,，]\s*\S{1,12}[。．.!！]*$/.test(s) && textLen(s) <= 14) {
            // Kiss requests (ちゅーもして) handled below — do not echo JA into ZH.
            if (!/(?:ちゅ|チュー|キス)/.test(s)) {
                const m = s.match(/^ねえ[、,，]\s*(.+?)[。．.!！]*$/);
                if (m?.[1]) return `喂，${m[1].trim()}`;
            }
        }
        if (/^(?:もぐ|モグ|むぐ){2,}/.test(s) && textLen(s) <= 16 && !jaCueHasLexicalResidue(s)) {
            return '嗯嗯';
        }
        // Oral chew / muffled moans (んむぅ / あむ / むにゃ) — keep timing, not wet 咕啾
        if (
            /(?:んむ|あむ|はむ|むにゃ|むぐ|もぐ|モグ)/.test(s)
            && textLen(s) <= 28
            && !jaCueHasLexicalResidue(s)
        ) {
            const lexical = s.replace(
                /(?:んむ[ぅうゥウっッ]*|あむ[ぅうゥウっッ]*|むにゃ[ぁア]*|むぐ+|もぐ+|モグ+|[ぅうゥウっッむムんンあアぁァはぁはあハァ…・!?！？。、,\s]+)/g,
                '',
            );
            if (textLen(lexical) <= 2) {
                if (/すごい|すげ[えぇー]/.test(s)) return '嗯嗯，好厉害';
                if (/はぁ|はあ|ハァ/.test(s)) return '嗯嗯，哈…';
                return '嗯嗯';
            }
        }
        if (/^(?:[グぐ][ルる]+|[ガが][ルる]+)[っッ…。．.\s!！?？]*$/.test(s)) return '呜呜';
        if (/^(?:ジー+|じー+)[っッ…。．.!！?\s]*$/.test(s)) return '盯……';
        if (/^(?:ずきゅ|ズキュ)[っッ]?[…。．.!！?\s]*$/.test(s)) return '嗯……';
        if (/^(?:オオォ+|おぉぉ+|オー+)[っッ]*[!！?？…。．.\s]*$/.test(s)) return '哦~~！';
        if (/あひ[ゃっ]|ひゃひゃ|あひゃ/.test(s) && textLen(s) <= 24) return '啊啊';
        if (/^あひっ/.test(s) && textLen(s) <= 16) return '啊啊';
        if (/^ぽっ[!！?？…。．.\s]*$/.test(s)) return '啵';
        if (/^ぴっ[!！?？…。．.\s]*$/.test(s)) return '哔';
        if (/うれしい|嬉し[いっ]/.test(s) && textLen(s) <= 12) return '好开心';
        if (/かわいい|可愛い|カワイイ|あわいい/.test(s) && textLen(s) <= 14) {
            return /[?？]/.test(s) ? '好可爱？' : '好可爱';
        }
        if (/綺麗|きれい|キレイ|美し[いっ]/.test(s) && textLen(s) <= 14) {
            return /[?？]/.test(s) ? '好漂亮？' : '好漂亮';
        }
        if (/気持ちいい|きもちいい|きもちいっ|きもちぃ|キモチイイ|気持ちよ[くかたっ]|きもちよ[くかたっ]|気持ち良|きもちい[いっ]/.test(s)) {
            return /[?？]/.test(s) ? '舒服吗？' : '好舒服';
        }
        // Soft-AV lick requests (avoid shipping bare「舔」under-fill).
        // Do not override object-bearing cues (口も舐めてください → needs 嘴).
        if (
            /舐めて/.test(s)
            && textLen(s) <= 28
            && !/口|舌|乳首|おっぱい|胸|あそこ|おまんこ|まんこ|ちん|棒/.test(s)
        ) {
            if (/よ|ね|ください|下さい|ちょうだい/.test(s)) return '舔我嘛';
            if (/^舐めて[。．.!！?？…\s]*$/.test(s)) return '舔一下';
        }
        if (/^やめて[。．.!！]*$|^やめろ[。．.!！]*$/.test(bare) && textLen(s) <= 6) return '不要';
        if (mtOpaque?.RE?.insertBareSrc?.test(bare) && textLen(s) <= 6) {
            return mtOpaque?.T?.ireteZh || '';
        }
        // Kiss requests (ちゅーもして / チューして); bare ちゅっ wet SFX is stripped elsewhere.
        if (
            (/(?:ちゅ[ーう]+|チュー+)も?して/.test(s) || /キスして/.test(s))
            && textLen(s) <= 16
        ) {
            return /もして/.test(s) ? '也亲亲我' : '亲一下';
        }
        if (/泣かないで/.test(s) && textLen(s) <= 12) return '别哭';
        if (/^めっちゃいい|^すごくいい|^超[いイ]い/.test(s) && textLen(s) <= 12) return '超棒';
        if (/悩ましい/.test(s) && textLen(s) <= 10) return '好纠结';
        if (/元気になって/.test(s)) {
            if (/ほら/.test(s)) return '来，振作起来呀';
            if (/お兄ちゃん|おにいちゃん/.test(s)) return '哥哥，振作起来';
            return '振作起来';
        }
        if (/(?:お兄ちゃん|おにいちゃん).{0,4}いたずら/.test(s)) return '哥哥，别捣乱';
        if (/やばい/.test(s) && /重なって/.test(s)) return '糟了，叠得超级厉害';
        if (/未来行きたい/.test(s) && textLen(s) <= 14) return '可能想去未来';
        if (/気持ちいいよ/.test(s) && textLen(s) <= 12) return '好舒服呀';
        if (/ありがとう/.test(s) && /チャッピ|ちゃっぴ|チャピ/.test(s) && textLen(s) <= 20) {
            return '谢谢，恰皮';
        }
        if (/^はい[、,，]?\s*ありがとう/.test(s) && textLen(s) <= 18) {
            return '好的，谢谢';
        }
        if (/もうダメ|もうだめ/.test(s) && textLen(s) <= 10) {
            return /あ/.test(s) ? '啊，已经不行了' : '已经不行了';
        }
        if (/気持ち悪すぎる/.test(s) && textLen(s) <= 24) {
            return /かも|かもしれ/.test(s) ? '可能恶心过头了' : '恶心过头了';
        }
        if (/^ねえ[、,，]?\s*(?:ちゃっぴー|チャッピー|チャッピ)/.test(s) && textLen(s) <= 16) {
            return '喂，恰皮';
        }
        if (/^動かない[。．.!！]*$/u.test(bare) && textLen(s) <= 8) {
            return '不动';
        }
        if (/^(?:動かないで|うごかないで)[。．.!！…\s]*$/u.test(s) && textLen(s) <= 12) {
            return '别动';
        }
        if (/^(?:み[、,]?\s*)?みないで(?:ください)?[。．.!！…\s]*$/u.test(s) && textLen(s) <= 16) {
            return '请不要看';
        }
        if (/^なんですか[?？!！。．.…\s]*$/u.test(s) && textLen(s) <= 10) {
            return '什么事？';
        }
        if (/^なんだよ[?？!！。．.…\s]*$/u.test(s) && textLen(s) <= 8) {
            return '搞什么呀';
        }
        if (/^じっとしてみな[。．.!！…\s]*$/u.test(s) && textLen(s) <= 12) {
            return '给我老实待着';
        }
        if (/^ありがとう[、,，]\s*.+さん[。．.!！…\s]*$/u.test(s) && textLen(s) <= 18) {
            const m = s.match(/^ありがとう[、,，]\s*(.+?)さん/);
            if (m) return `谢谢，${m[1]}`;
        }
        if (/なにやってるんですか|何やってるんですか/.test(s) && /ダメ|だめ/.test(s) && textLen(s) <= 28) {
            return '你在干什么啊，不行的';
        }
        if (/教えてくれ/.test(s) && /わか/.test(s) && textLen(s) <= 28) {
            return '再不懂的话就来问我哦';
        }
        if (/^二人だけの秘密だよ[。．.!！…\s]*$/u.test(s) && textLen(s) <= 14) {
            return '这是只属于我们两个人的秘密哦';
        }
        if (/^結婚してるんだよ[?？!！。．.…\s]*$/u.test(s) && textLen(s) <= 14) {
            return '我可是结婚了的哦？';
        }
        if (/先生[、,，].*合ってますか/.test(s) && textLen(s) <= 20) {
            return '老师，这样对吗？';
        }
        if (/教え方が上手/.test(s) && /先生|だから/.test(s) && textLen(s) <= 24) {
            return '因为老师教得好啊';
        }
        if (/動かないで/.test(s) && /ください|下さい/.test(s) && textLen(s) <= 28) {
            return '请别动';
        }
        if (/^[はハはぁアァうぅウゥんンー〜～っッああん!！?？…。．.、，,\s♡]+$/.test(s)) {
            const haaRuns = (s.match(/[はハはぁアァ][ぁァ]?[っッ]?/g) || []).length;
            if (haaRuns >= 2 || /(?:はぁ|はあ|ハァ|はあっ)[、,\s…]*((?:はぁ|はあ|ハァ|はあっ)[、,\s…]*)+/.test(s)) {
                return /[!！]/.test(s) ? '哈~~！' : '哈…哈…';
            }
            if (/[はハ]/.test(s) && !/[あァぁあんン]/.test(s.replace(/[はハ]/g, ''))) {
                return /[!！]/.test(s) ? '哈~~！' : '哈…';
            }
            if (/[んン]/.test(s) && !/[あァぁ]/.test(s)) {
                return /[!！]/.test(s) ? '嗯~~！' : '嗯';
            }
            if (/[うぅウゥ]/.test(s) && !/[あァぁ]/.test(s)) return '呜……';
            return /[!！]/.test(s) ? '啊~~！' : '啊……';
        }
        if (/綺麗|きれい|キれい/.test(s) && textLen(s) <= 14) {
            if (/ミカ|美[亜亞香]/.test(s)) return '好漂亮啊';
            return '好漂亮';
        }
        if (/あったかい/.test(s) && /べろ|舌/.test(s) && textLen(s) <= 24) {
            return '好温暖的舌头';
        }
        if (/あったかい/.test(s) && /手/.test(s) && !/べろ|舌/.test(s) && textLen(s) <= 16) {
            return /初めて/.test(s) ? '第一次的手…好温暖' : '手好温暖';
        }
        if (/すごいよ/.test(s) && textLen(s) <= 20) {
            return '好厉害';
        }
        if (/疲れた/.test(s) && textLen(s) <= 12) {
            return /はぁ|はあ|ハァ/.test(s) ? '哈…好累' : '好累';
        }
        // Soft-AV aftergame: 疲れました + 目眩 / ぶっ倒れ (NAAC shape)
        if (
            /疲れました/.test(s)
            && /(?:目眩|めまい|ぶっ倒れ|倒れ)/.test(s)
            && textLen(s) <= 40
        ) {
            return '好累啊，头晕得都快晕过去了…哈…';
        }
        // Soft-AV self-intro: お、Nameです / Nameです
        {
            const m = s.match(/^お[、,，]?\s*([一-龥ぁ-んァ-ンー]{2,8})です[。．.!！?？\s]*$/u);
            if (m && textLen(s) <= 14) return m[1];
        }
        if (/映像で初めて着れて|初めて着れて今日は嬉し/.test(s) && textLen(s) <= 28) {
            return '第一次在视频里穿到，今天好开心';
        }
        if (/^まるでね/.test(s) && textLen(s) <= 8) {
            return '简直像…';
        }
        if (/緊張します|気長します/.test(s) && textLen(s) <= 18) {
            return /もうちょっと/.test(s) ? '有点紧张…再等一下' : '有点紧张';
        }
        if (/ごゆっくりね|口安くね/.test(s) && textLen(s) <= 16) {
            return /はい/.test(s) ? '请慢用，好…好！' : '请慢用';
        }
        if (/(?:倉木|蔵木).{0,6}足/.test(s) && /触っちゃ/.test(s) && textLen(s) <= 20) {
            return '仓木同学的脚，不小心碰到了';
        }
        if (/アルバイトに入った|アパイタに入った/.test(s) && textLen(s) <= 16) {
            return /今日から/.test(s) ? '从今天开始打工了' : '开始打工了';
        }
        if (/足好きだね/.test(s) && textLen(s) <= 12) {
            return '喜欢脚呢…';
        }
        return null;
    }

    /** Recover ZH stubs like「啊，」/「哈哈」when JA clearly carries feel-good / climax content. */
    function polishTruncatedReactiveZh(text, sourceText = '') {
        const cur = String(text || '').trim();
        const src = String(sourceText || '');
        if (!cur || !src) return { text: cur, changed: false };
        // Include spaced / ellipsis moan stubs like「哈 哈」「哈…哈…」(engine MT often inserts spaces).
        if (!/^(?:啊[啊]?[，,。．.…]*|嗯[嗯]?[，,。．.…]*|哦[，,。．.]?|哈(?:啊|[…·\s]*哈)+[，,。．.…]*|哈[啊]?[，,。．.…]*|好|好的|好厉害|哈哈[。．.!！]?|呵呵[，,。．.!！]?|喂[，,。．.]?|哥哥[，,。．.]?|来[，,。．.]?|来吧[，,。．.]?|完了[，,。．.]?|不过[，,。．.]?|谢谢[，,。．.]?|哭了|是的|啧[，,。．.]?|…+)$/.test(cur)) {
            // Trailing climax stub:「…啊，」when JA has climax cue
            if (
                /(?:啊[，,]|啊)$/.test(cur)
                && mtOpaque?.RE?.climaxStubSrc?.test(src)
                && textLen(cur) <= textLen(src) + 2
                && textLen(cur) >= 3
            ) {
                const next = cur.replace(/(?:啊[，,]|啊)$/, mtOpaque?.T?.aboutToCumPlainZh || '');
                if (next !== cur && next) return { text: next, changed: true };
            }
            return { text: cur, changed: false };
        }
        if (textLen(src) < 4) return { text: cur, changed: false };
        const remapped = remapJaPreferLexical(src);
        if (remapped != null && remapped !== cur) {
            if (/^喂[，,]/.test(remapped) && /[\u3040-\u30ff]/.test(remapped)) {
                const blankRec = mtOpaque?.recoverBlankAdultDialogue?.(src);
                if (blankRec && String(blankRec).trim() && !/[\u3040-\u30ff]/.test(blankRec)) {
                    return { text: blankRec, changed: true };
                }
            }
            return { text: remapped, changed: true };
        }
        return { text: cur, changed: false };
    }

    function polishOrphanStuckZh(text, sourceText = '') {
        const cur = String(text || '').trim();
        const src = String(sourceText || '');
        if (!cur) return { text: cur, changed: false };
        const bare = cur.replace(/[。．.]+$/g, '');
        if (ORPHAN_STUCK_ZH.has(cur) || ORPHAN_STUCK_ZH.has(bare)) {
            if (!/仕事|働|勤務|バイト/.test(src)) {
                const remapped = remapZhFromJaSimple(src);
                return { text: remapped != null ? remapped : '…', changed: true };
            }
        }
        if (ORPHAN_STUCK_ZH_RE.test(cur) || ORPHAN_STUCK_ZH_RE.test(bare)) {
            const keep = mtOpaque?.shouldKeepOrphanStuckZh
                ? mtOpaque.shouldKeepOrphanStuckZh(src)
                : false;
            if (!keep) {
                const remapped = remapZhFromJaSimple(src);
                return { text: remapped != null ? remapped : '…', changed: true };
            }
        }
        // Stuck soft-AV template glued onto unrelated JA (すっごい →「第一次…好开心」)
        if (
            /第一次/.test(cur)
            && /好开心|开心/.test(cur)
            && !/初めて|はじめて|嬉し|楽しい/.test(src)
        ) {
            const remapped = remapZhFromJaSimple(src);
            if (remapped != null && remapped !== cur) {
                return { text: remapped, changed: true };
            }
            if (/すっごい|すごい/.test(src)) {
                return { text: '好厉害啊', changed: true };
            }
        }
        // 離してください / やだ → not 「好可爱」praise stubs
        if (
            /離してください|はなしてください|離して/.test(src)
            && /^(?:好可爱|好漂亮|好美|真棒|好厉害)[…。．.!！?？\s]*$/u.test(cur)
        ) {
            return { text: /やだ|嫌/.test(src) ? '放开我，不要' : '请放开我', changed: true };
        }
        return { text: cur, changed: false };
    }

    /** JA that justifies ZH refusal / 不要. */
    function jaJustifiesRefusalZh(sourceText = '') {
        const src = String(sourceText || '');
        if (!src.trim()) return false;
        return /やめ(?:て|ろ|てください)?|やだ|いやだ|いや[っッ]!|ダメ|駄目|だめ|嫌|出さないで|中に出さ|しないで|触ら(?:ないで|ない)|見ないで|来るな|らめ/.test(src);
    }

    /**
     * Strip stuck refusal glue (…不要 / 哈哈…不要) when JA has no refusal cue.
     * Reusable across titles — pattern from soft-AV MT echo, not film-specific.
     */
    function stripUnjustifiedBuyaoGlue(text, sourceText = '') {
        let cur = String(text || '').trim();
        const src = String(sourceText || '');
        if (!cur || !/不要/.test(cur)) return { text: cur, changed: false };
        if (jaJustifiesRefusalZh(src)) return { text: cur, changed: false };

        const wholeStub = /^(?:哈+|哈哈+|啊+|嗯+|唔+)?[…·.\s，,]*不要(?:再这样了|呀|啊)?[…·.\s。．.!！?？]*$/u;
        if (
            wholeStub.test(cur)
            || /^…+不要$/u.test(cur)
            || /^不要(?:\s*呀|\s*啊)?$/u.test(cur)
            || /^不要不要$/u.test(cur)
        ) {
            const remapped = remapJaPreferLexical(src) || remapZhFromJaSimple(src);
            const next = remapped && !isEllipsisOrEmptyZh(remapped) ? remapped : '…';
            return { text: next, changed: next !== cur };
        }

        // Body + trailing unjustified 不要 (allow ？！ before ellipsis)
        const trail = cur.match(/^(.*?)([？?！!…·.\s，,]+)不要(?:再这样了|呀|啊)?$/u);
        if (trail && textLen(trail[1]) >= 2) {
            const body = trail[1].trim();
            if (!/不要/.test(body)) {
                return { text: body, changed: true };
            }
        }

        // Invented mid-cue refusal (不要在里面射… / 不要动) when JA has no refusal cue
        if (
            /不要(?:在里面)?(?:射|出)|不要动|不要不要|不要露面|不要说|请不要/.test(cur)
            && !jaJustifiesRefusalZh(src)
            && !/(?:中に|なかに)?出さ|射精|イッ/.test(src)
        ) {
            const remapped = remapJaPreferLexical(src) || remapZhFromJaSimple(src);
            if (remapped && remapped !== cur && !isEllipsisOrEmptyZh(remapped) && !/不要/.test(remapped)) {
                return { text: remapped, changed: true };
            }
            return { text: remapped && !/不要/.test(remapped) ? remapped : '…', changed: true };
        }
        return { text: cur, changed: false };
    }

    /**
     * Polarity: JA 濡れてない must not stay as affirmative 湿了.
     */
    function repairWetPolarityZh(text, sourceText = '') {
        let cur = String(text || '').trim();
        const src = String(sourceText || '');
        if (!cur || !src) return { text: cur, changed: false };
        if (!/濡れてない|ぬれてない|濡れていません/.test(src)) {
            return { text: cur, changed: false };
        }
        if (!/湿/.test(cur)) return { text: cur, changed: false };
        if (/没(?:有)?湿|不湿|不是湿|没濡/.test(cur)) return { text: cur, changed: false };
        let next = cur
            .replace(/果然还是湿了/g, '没有湿')
            .replace(/还是湿了/g, '没有湿')
            .replace(/湿了吗/g, '没湿吗')
            .replace(/湿了/g, '没湿');
        if (next === cur) {
            const remapped = remapZhFromJaSimple(src);
            if (remapped) next = remapped;
        }
        return { text: next, changed: next !== cur };
    }

    /**
     * Pro/Hy-MT sometimes drops a JA cast name /「X先生」into filler「嗯嗯」.
     * Restore when the slot is clearly a name/honorific address (reusable pattern).
     */
    function repairNnHmmNamePlaceholder(text, sourceText = '') {
        let cur = String(text || '');
        const src = String(sourceText || '');
        if (!cur || !src || !cur.includes('嗯嗯')) return { text: cur, changed: false };
        const before = cur;

        // 若嗯嗯… / 今天若嗯嗯休息 ← JA「若先生」（老师 may trail later）
        // Greedy CJK before 嗯嗯 may swallow 今天若; prefer the longest suffix that is X先生.
        cur = cur.replace(
            /([\u4e00-\u9fff]{1,4})嗯嗯/g,
            (m, name) => {
                const chars = Array.from(name);
                for (let len = chars.length; len >= 1; len -= 1) {
                    const stem = chars.slice(-len).join('');
                    if (
                        src.includes(`${stem}先生`)
                        || src.includes(`${stem}せんせい`)
                        || src.includes(`${stem}センセイ`)
                    ) {
                        return `${chars.slice(0, -len).join('')}${stem}老师`;
                    }
                }
                return m;
            },
        );
        // 「现在先别叫嗯嗯了…老师」←「その先生ってやめて」
        if (/(?:その)?先生って|その先生/.test(src) && /叫嗯嗯/.test(cur)) {
            cur = cur.replace(/叫嗯嗯了?/g, '叫老师了');
        }

        // 「若老师…老师」/「叫老师了…老师」after restore
        cur = cur.replace(/叫老师了([…·.\s]*)老师/g, '叫老师了');
        cur = cur.replace(/老师([…·.\s]*)老师/g, '老师');
        if ((cur.match(/老师/g) || []).length >= 2) {
            cur = cur.replace(/[…·.\s]+老师([。．.!！?？]*)$/u, '$1');
        }

        // 先生 already restored as 老师 — drop leftover 嗯嗯 fillers
        if (/先生/.test(src) && /老师/.test(cur) && /嗯嗯/.test(cur)) {
            cur = cur
                .replace(/嗯嗯/g, '')
                .replace(/[，,]\s*[，,]/g, '，')
                .replace(/\s{2,}/g, ' ')
                .replace(/^[，,\s]+|[，,\s]+$/g, '')
                .trim();
        }

        // 優人 / ゆうと wiped to bare「嗯嗯」in name slots
        if (/(?:優人|ゆうと|ユウト)/.test(src)) {
            let zhName = /優人/.test(src)
                ? (jaNames?.resolveCanonicalZhPersonName?.('優人') || '優人')
                : (jaNames?.resolveCanonicalZhPersonName?.('ゆうと') || '优斗');
            if (/[ぁ-んァ-ン]/.test(zhName)) zhName = /ゆうと|ユウト/.test(src) ? '优斗' : '優人';
            if (!/(?:優人|优人|优斗)/.test(cur)) {
                cur = cur
                    .replace(/就像嗯嗯(?=那样|一样|般)/g, `就像${zhName}`)
                    .replace(/喂([，,\s]*)嗯嗯/g, `喂$1${zhName}`)
                    .replace(/好了([，,\s]*)嗯嗯/g, `好了$1${zhName}`)
                    .replace(/嗯嗯([，,\s]*(?:我们走|走吧|去吧))/g, `${zhName}$1`)
                    .replace(/要走了([，,])\s*嗯嗯/g, `要走了$1${zhName}`)
                    .replace(/走吧([，,])\s*嗯嗯/g, `走吧$1${zhName}`)
                    .replace(/([，,]\s*)嗯嗯([。．.!！]?)$/g, `$1${zhName}$2`);
            }
        }

        // お父さん / パパ wiped to「嗯嗯」
        if (/(?:お父さん|おとー?さん|ととー?さん|パパ)/.test(src) && /嗯嗯/.test(cur)) {
            const lexicalAside = cur
                .replace(/嗯嗯/g, '')
                .replace(/[…·.\s，,哈啊嗯唔哦噢]+/g, '')
                .trim();
            if (!lexicalAside || textLen(lexicalAside) <= 5) {
                cur = cur.replace(/嗯嗯/g, '爸爸');
            } else if (/[，,\s]嗯嗯/.test(cur) || /嗯嗯$/.test(cur.trim())) {
                cur = cur.replace(/嗯嗯/g, '爸爸');
            }
        }

        return { text: cur, changed: cur !== before };
    }

    /**
     * Sole invented ZH name while JA is clearly お父さん / パパ address.
     */
    function repairOtousanInventedNameZh(text, sourceText = '') {
        const cur = String(text || '').trim();
        const src = String(sourceText || '').trim();
        if (!cur || !src) return { text: cur, changed: false };
        if (!/(?:お父さん|おとー?さん|ととー?さん|パパ)/.test(src)) {
            return { text: cur, changed: false };
        }
        if (/爸爸|父亲|老爸|爸[。．.!！?？…]*$/.test(cur)) {
            return { text: cur, changed: false };
        }
        const bare = cur.replace(/[。．.!！?？…\s]+$/g, '');
        const otousanHeavy = /^(?:はぁ+[…·.\s]*)?(?:お父さん|おとー?さん|ととー?さん|パパ)+(?:[…·.\sはぁああんっ!！?？]*)$/u.test(src)
            || (textLen(src) <= 12 && /(?:お父さん|おとー?さん|ととー?さん|パパ)/.test(src));
        if (!otousanHeavy) return { text: cur, changed: false };
        if (
            /^[\u4e00-\u9fff]{2,4}$/.test(bare)
            && !sourceJustifiesZhName(bare, src)
            && !COMMON_KEEP_TOKENS.has(bare)
            && !ZH_NAME_STEM_STOP.has(bare)
        ) {
            return { text: '爸爸', changed: true };
        }
        return { text: cur, changed: false };
    }

    /**
     * Drop sole / leading CJK name tags not justified by JA (e.g. 「優翔」on greetings).
     * Reusable across titles — keyed on sourceJustifiesZhName, not a fixed cast list.
     */
    function stripUnjustifiedSoleOrLeadingName(text, sourceText = '', options = {}) {
        const raw = String(text ?? '').trim();
        const src = String(sourceText || '');
        if (!raw || !src) return { text: raw, changed: false };
        const justifyOpts = options.justifyOpts || {};

        const soleBare = raw.replace(/[。．.!！?？…\s]+$/g, '');
        const lexicalRemap = remapZhFromJaSimple(src);
        if (
            lexicalRemap
            && (lexicalRemap === soleBare || lexicalRemap === raw
                || lexicalRemap.replace(/[。．.!！?？…\s]+$/g, '') === soleBare)
        ) {
            return { text: raw, changed: false };
        }
        if (
            /^[\u4e00-\u9fff]{2,4}$/.test(soleBare)
            && !ZH_NAME_STEM_STOP.has(soleBare)
            && !COMMON_KEEP_TOKENS.has(soleBare)
            && !COMMON_KEEP_TOKENS.has(raw)
            // Dialogue / predicate / anatomy / question crumbs — not cast tags
            && !/[的了吗呢是在我你他她好不很还要会能对吧啊哦原如真次点拿给射舔摸插含去出根哥姐弟叔穴棒精奶胸臀阴蒂乳就这怎什样感累热烫冷]/.test(soleBare)
            && !/怎么|什么|怎样/.test(soleBare)
            && !/^(?:小穴|肉棒|鸡巴|精液|奶子|胸部|后庭|乳头|阴蒂|老师|哥哥|姐姐|爸爸|妈妈)$/.test(soleBare)
            && !sourceJustifiesZhName(soleBare, src, justifyOpts)
            && (jaCueHasLexicalResidue(src) || textLen(src) >= 2)
            // Short JA discourse — cast-tag paste (HMN-907「朝比奈」on「あ これ」)
            && textLen(src) <= 16
        ) {
            const remapped = remapJaPreferLexical(src) || remapZhFromJaSimple(src);
            if (
                remapped != null
                && remapped !== ''
                && remapped !== soleBare
                && remapped !== raw
                && !isFillerOnlyZh(remapped)
            ) {
                return { text: remapped, changed: true };
            }
            // Keep sole cue — batch high-freq cast-name pass blanks HMN-907「朝比奈」spam.
            return { text: raw, changed: false };
        }

        // 「優翔 正文」/「優翔優翔…正文」leading cast-tag when JA has no that name
        // Skip software-credit / URL lines (字幕由 Transub…)
        if (/transub\.cc|字幕由\s*Transub|Subtitles generated by/i.test(raw)) {
            return { text: raw, changed: false };
        }
        const lead = raw.match(
            /^([\u4e00-\u9fff]{2,4})(?:(?:\s*[…·.。]{0,6}\s*|\s+)\1)*[\s…·]+(.+)$/u,
        );
        if (lead) {
            const stem = lead[1];
            const rest = String(lead[2] || '').trim();
            const restBare = rest.replace(/[。．.!！?？…\s，,]+$/g, '');
            // Skip verb/particle stems and moan-only tails (给我 吧 / 一郎 嗯 哈 / 玩意儿…啊，)
            // Also never strip clinical anatomy stems (肉棒…要射了)
            if (
                rest
                && restBare
                && textLen(restBare) >= 2
                && !/^(?:[嗯哈啊哦噢唔哎]+[\s…·，,。．.]*)+$/u.test(rest)
                && !ZH_NAME_STEM_STOP.has(stem)
                && !COMMON_KEEP_TOKENS.has(stem)
                && !/^啊/.test(stem)
                && !/[给拿来去射出好坏要能对真原次点的了吗呢棒穴鸡巴精奶胸臀阴蒂学玩意不里这]/.test(stem)
                && !sourceJustifiesZhName(stem, src, justifyOpts)
            ) {
                return { text: rest, changed: true };
            }
        }
        return { text: raw, changed: false };
    }

    function remapLongZhOnReactiveJa(text, sourceText = '') {
        const cur = String(text || '').trim();
        const src = String(sourceText || '').trim();
        if (!cur || !src) return { text: cur, changed: false };
        const zk = zhNormKey(cur);
        if (zk.length < 4) return { text: cur, changed: false };
        const remapped = remapJaPreferLexical(src);
        if (remapped == null || remapped === cur) return { text: cur, changed: false };
        // Moan / laugh-only JA with long stuck ZH
        if (
            /^[はハはぁアァうぅウゥんンー〜～っッああん!！?？…。．.、，,\s♡]+$/.test(src)
            || /^あはは|^ははは/.test(src)
        ) {
            // Prefer lexical remap; filler moan gloss OK when replacing long stuck ZH
            if (!isFillerOnlyZh(remapped) || textLen(cur) >= 8) {
                return { text: remapped, changed: true };
            }
            return { text: cur, changed: false };
        }
        // Short reactive JA (うん / あっ / はい / どう?) glued to neighbor's long ZH
        const srcLen = textLen(src);
        const zhLen = textLen(cur);
        if (
            srcLen > 0
            && srcLen <= 6
            && zhLen >= Math.max(8, srcLen * 3)
            && /^(?:うん|ええ|はい|あっ?|ん|ねえ?|ほら|そう|どう|なに|何|ってわけで)[。．.!！?？…ー〜～っッ\s]*$/u.test(src)
        ) {
            return { text: remapped, changed: true };
        }
        return { text: cur, changed: false };
    }

    /**
     * Whether a high-frequency ZH paste is still plausible for this JA
     * (keep justified cues; blank the sticky spam elsewhere).
     */
    function zhJustifiesHighFreqReuse(zhText, jaText) {
        const zh = String(zhText || '').trim();
        const ja = String(jaText || '').trim();
        if (!zh || !ja) return false;
        if (/拍清楚|拍得清楚|拍的清楚|拍好了吗|拍的好吗|拍得好吗/.test(zh)) {
            return /撮|撮影|カメラ|録画|录|写[っるり]|Vログ|動画/.test(ja);
        }
        if (/约会|后辈|上下级|翔君|公司后辈/.test(zh)) {
            return /デート|後輩|上司|部下|会社|翔/.test(ja);
        }
        if (/女性们/.test(zh) && looksLikeWomenAudiencePitchInvent(zh, ja)) {
            return false;
        }
        const bare = zh.replace(/[。．.!！?？\s…⋯~～]+$/u, '').trim();
        // Filler paste (嗯嗯×N) only OK on moan / tiny reactive JA
        if (isFillerStickyBare(bare)) {
            if (looksLikeFillerGlossMisattach(zh, ja)) return false;
            return isMoanOrSfxHeavyJa(ja)
                || (textLen(ja) <= 4 && !jaCueHasLexicalResidue(ja));
        }
        if (bare === '老师') {
            return /先生|せんせい|老師|先生方/.test(ja);
        }
        if (isBareVocativeStubZh(bare)) {
            return jaJustifiesBareVocativeZh(ja);
        }
        // Stock short glosses only justify when JA anchors match (else sticky spam).
        if (looksLikeStockGlossMisattach(zh, ja)) return false;
        if (STICKY_SHORT_ZH.has(bare) || STICKY_SHORT_ZH.has(zhNormKey(zh))) {
            return true;
        }
        // Generic: shared Han/kata stem of length ≥2 after simple variants
        const zhKey = zhNormKey(zh);
        const jaKey = jaNormKey(ja);
        if (zhKey.length >= 4 && jaKey.includes(zhKey.slice(0, 2))) return true;
        // Short reactive ZH that matches short JA gloss
        const gloss = remapZhFromJaSimple(ja);
        if (gloss && zhNormKey(gloss) === zhKey) return true;
        return false;
    }

    /** Strip software-credit lines so dialogue-only semantics can be judged. */
    function dialogueTextForAlign(text) {
        const raw = String(text || '').replace(/\r\n/g, '\n').trim();
        if (!raw) return '';
        try {
            const credit = require('./subtitle-software-credit-core');
            const split = credit.splitSoftwareCreditAndDialogue?.(raw);
            if (split?.dialogueText) return String(split.dialogueText).trim();
            if (credit.isSoftwareCreditText?.(raw)) return '';
        } catch { /* optional */ }
        return raw;
    }

    /** Filming-check ZH pasted onto non-camera JA (開场「拍清楚了吗？」sticky). */
    function looksLikeFilmingZhInvent(text, sourceText = '') {
        const t = dialogueTextForAlign(text);
        const src = dialogueTextForAlign(sourceText);
        if (!t || !src) return false;
        if (!/拍清楚|拍得清楚|拍的清楚|拍好了吗|拍的好吗|拍得好吗|拍得怎么样/.test(t)) {
            return false;
        }
        if (/撮|撮影|カメラ|録画|录|写[っるり]|Vログ|動画|ビデオ/.test(src)) return false;
        return true;
    }

    /**
     * Camera/filming JA whose ZH body is unrelated (credit\\n撮れてる → 樱呵呵).
     * Inverse of filming invent spam.
     */
    function looksLikeMissingFilmingZh(text, sourceText = '') {
        const t = dialogueTextForAlign(text);
        const src = dialogueTextForAlign(sourceText);
        if (!t || !src) return false;
        if (!/撮れて|撮[るっりた]|撮影|カメラ|録画|Vログ|動画|ビデオ/.test(src)) return false;
        if (/拍|摄|录|Vlog|vlog|相机|镜头|视频|录像/.test(t)) return false;
        // Real filming glosses sometimes omit 拍 (e.g. 「清楚了吗」); keep those.
        if (/清楚|对焦|取景|录上|录到/.test(t) && textLen(t) <= 12) return false;
        return textLen(t) >= 2;
    }

    /** Opening-plot synopsis ZH pasted onto unrelated JA (翔君/约会 bleed). */
    function looksLikeCrossCuePlotBleed(text, sourceText = '') {
        const t = dialogueTextForAlign(text);
        const src = dialogueTextForAlign(sourceText);
        if (!t || !src) return false;
        if (textLen(t) < 4) return false;
        if (!/(?:翔君|后辈|约会|上下级|公司后辈|了解翔|去约会|在意他|在意翔)/.test(t)) {
            return false;
        }
        if (/翔|後輩|デート|会社|上司|部下|先輩|気になって|気になる/.test(src)) return false;
        return true;
    }

    /**
     * MFYD-182-shaped: lecture / medical / how-to JA got practice-scene or CTA ZH
     * from a later section (same startMs after rematerialize, wrong content).
     * Reusable JA/ZH anchors — not title-gated.
     */
    function isLectureExpositoryJa(sourceText = '') {
        const src = dialogueTextForAlign(sourceText) || String(sourceText || '');
        if (!src) return false;
        return /ホルモン|医学|科学の話|科学的|分泌|視床下部|研究|データ|フェニル|PEA|Pea|オキシトシン|コキシトシン|正直に話|では、?始めましょう|なぜそうなった|どうすれば変わる|寿命なん|惚れ薬|いわば天然|正常な経過|セックスレス|レスになった|隣に座って|気持ちよくさせたいすべての男性|すべての男性に向けた話|パターンがあります|絆を支え|血中濃度|20秒のハグ|ハグで血中/.test(src);
    }

    function looksLikeLectureSceneBleed(text, sourceText = '') {
        const t = dialogueTextForAlign(text);
        const src = dialogueTextForAlign(sourceText) || String(sourceText || '');
        if (!t || !src) return false;
        if (/^…+$/.test(t) || textLen(t) < 3) return false;
        if (!isLectureExpositoryJa(src)) return false;
        // Practice / CTA / how-to scene ZH that does not belong on lecture exposition
        if (
            /我来主导|实践一下|详情请见实践|重新建立了性关系|指尖触碰|包裹住一样|透过皮肤感受到|深吻刺激|把女性当成书|有多少男性是这么想|这是一本|从中获益的书|都能从中获益/.test(t)
        ) {
            // JA that is itself the practice CTA / touch instruction / book metaphor may keep it
            if (/実践編|実践に入|実践してみ|主導|指先|手のひら|ハグ|スキンシップを|本のように|この本|著書|書籍/.test(src)) {
                return false;
            }
            return true;
        }
        return false;
    }

    /**
     * Book-blurb ZH invented onto non-book JA (MFYD-182 lecture opening).
     */
    function looksLikeBookBlurbInvent(text, sourceText = '') {
        const t = dialogueTextForAlign(text);
        const src = dialogueTextForAlign(sourceText) || String(sourceText || '');
        if (!t || !src) return false;
        if (!/这是一本|从中获益的书|都能从中获益|受益的书/.test(t)) return false;
        if (/本のように|この本|著書|書籍|一冊|本です|本が/.test(src)) return false;
        return true;
    }

    /**
     * Hormone "出る/分泌" misread as ejaculation (MFYD-182: セックスしなくても出るんです…).
     */
    function looksLikeHormoneSecreteAsEjacInvent(text, sourceText = '') {
        const t = dialogueTextForAlign(text);
        const src = dialogueTextForAlign(sourceText) || String(sourceText || '');
        if (!t || !src) return false;
        if (!/射出来|会射|射精|就会射/.test(t)) return false;
        if (!/出るんです|出てくる|分泌/.test(src)) return false;
        if (!/(?:手を繋|肩に触|ハグ|スキンシップ|オキシトシン|コキシトシン|ホルモン|血中|絆)/.test(src)) {
            return false;
        }
        // Real climax JA may keep ejaculation ZH
        if (/射精|イッ|イキ|イク|いく|出して|精液|出すよ|出ちゃう|出そう|漏ら/.test(src)) {
            return false;
        }
        return true;
    }

    /**
     * MFYD-182: marketing pitch「女性们…都希望被…满足/照顾」pasted onto lecture /
     * how-to JA that is not that slogan (often male-audience medical talk).
     */
    function looksLikeWomenAudiencePitchInvent(text, sourceText = '') {
        const t = dialogueTextForAlign(text);
        if (!t) return false;
        if (!/女性们/.test(t)) return false;
        const pitch = /女性们.{0,48}(?:无论|都希望被|我都会让|都会被你|都想被|都能让你|我真心希望)/u.test(t)
            || /女性们都想被|女性们都会被/u.test(t);
        if (!pitch) return false;
        // Credit-only / empty JA (dialogueTextForAlign strips watermark) cannot justify pitch
        const src = dialogueTextForAlign(sourceText);
        if (!src) return true;
        // JA that is literally that audience pitch / women-as-addressee slogan
        if (
            /気持ちよくさせたいすべての男性|すべての男性に向けた話|女性たち[へに]|女性のみな|皆さん女性/.test(src)
            && textLen(t) <= textLen(src) + 12
        ) {
            return false;
        }
        // Short JA cannot carry a long marketing pitch
        if (textLen(src) <= 18) return true;
        // No women-address / satisfy-women slogan anchors in JA
        if (!/女性[をへにの]|奥さん|妻たち|気持ちよくさせ|満たしてあげ/.test(src)) return true;
        // Long pitch vs JA that only mentions 女性 in passing
        if (textLen(t) >= 16 && textLen(t) >= textLen(src) + 4) return true;
        return false;
    }

    /**
     * Substantial ZH invented onto unusable Whisper JA debris — blank rather than keep.
     */
    function looksLikeAsrGarbageJaInvent(text, sourceText = '') {
        const t = dialogueTextForAlign(text);
        const src = String(sourceText || '').trim();
        if (!t || !src) return false;
        if (/^…+$/.test(t) || textLen(t) < 4) return false;
        try {
            if (!lexicon?.isAsrGarbageJa?.(src)) return false;
        } catch {
            return false;
        }
        // Post-ASR domain lines may still look "garbage" to the Whisper scorer while
        // carrying real menu/service/adult stems (SNOS-293 クラブサンド; オチンポジョブ…).
        if (/(?:クラブサンド|くださいマスター|ください|マスター|メンエス|オイル|マッサージ|仰向け|オチンポ|チンポ|おちん|ちんぽ|フェラ|マンコ|おまんこ|ペニス)/.test(src)) {
            return false;
        }
        // Honorific lemma remaps (せんぱい→前辈) are justified ZH, not invents.
        if (
            /前辈|学长|学姐/.test(t)
            && /先輩|せんぱい|センパイ/.test(src)
        ) {
            return false;
        }
        // Keep short reactive placeholders; blank content invents
        return textLen(t) >= 4;
    }

    /**
     * Strong JA↔ZH semantic markers glued onto the wrong cue (FNS-256 silent shift).
     * Reusable pattern pairs — not title-specific.
     */
    const ALIGN_SEMANTIC_CONFLICTS = [
        [/性感/, /セクシー|エロ|色っぽ|扇情/],
        [/约会/, /デート|お出かけ|出かけ/],
        [/后辈/, /後輩/],
        [/前辈|学长|学姐/, /先輩|センパイ|せんぱい/],
        [/(?:Vlog|vlog|博客)/i, /Vログ|ブイログ/],
        [/在意|关心|在乎/, /気になって|気になる|気にし/],
        [/迟到|晚了/, /遅れ|遅[いいっ]/],
        [/女友|女朋友/, /彼女/],
        [/高中/, /高校/],
        [/衣服|穿上|穿着|换好衣服|换衣服/, /お洋服|洋服|着替|着[てるいろよ]|着せ|着な|脱[いが]|服着|服を/],
        // Domestic "can't work / stay home" pasted onto unrelated short JA (VAGU opening)
        [/工作都做不了|待在家里|呆在家里|只好在家/, /仕事|家に|家で|いるわけ|家にいる|働け|できないし/],
        [/洗干净|洗一洗|去洗|洗好/, /洗[ってう]|洗い|洗濯/],
        // Lecture / how-to JA must not keep another section's ZH markers (MFYD-182)
        [/仪容|整洁感/, /身だしなみ|清潔感/],
        [/睾酮|睾丸酮/, /テストステロン|睾丸|アンドロゲン/],
        [/实践篇|实践编/, /実践編|実践に入|実践を/],
        [/有多少男性/, /どれだけいる|男性が、?日本/],
        [/我来主导|实践一下/, /主導|実践してみ|やってみ/],
        [/把女性当成书/, /本のように|書物|読み解/],
    ];

    const ALIGN_SEMANTIC_EXPECT = [
        [/セクシー/, ['性感']],
        [/デート/, ['约会']],
        [/後輩/, ['后辈']],
        [/先輩|センパイ|せんぱい/, ['前辈', '学长', '学姐']],
        [/Vログ|ブイログ/, ['Vlog', 'vlog', '博客']],
        [/気になって|気になる/, ['在意', '关心', '在乎', '想', '注意', '放不下', '着迷', '胸部', '胸', '奶']],
        [/遅れ/, ['迟到', '晚了']],
        [/彼女/, ['女友', '女朋友']],
        [/高校/, ['高中']],
        [/撮[るっりてた]|撮れて|撮影|カメラ/, ['拍', '摄', '录', '相机', '镜头']],
        [/お洋服|洋服|着替/, ['衣服', '穿', '换']],
        [/落ち[るりた]/, ['掉', '落', '摔']],
        [/お出かけ|出かけ/, ['出门', '出去']],
        [/上司|部下/, ['上司', '下属', '上下级']],
        [/洗[ってう]|洗いなさい/, ['洗']],
        [/仕事もできない|家にいるわけ/, ['工作', '家']],
        [/身だしなみ|清潔感/, ['仪容', '整洁', '清洁感', '干净']],
        [/テストステロン/, ['睾酮', '睾丸酮', '雄激素']],
        [/実践編/, ['实践篇', '实践编']],
        // GalTransl often renders セックスレス as paraphrase (性生活不和谐 / 没有性生活…).
        [/セックスレス|レスになった/, [
            '性冷淡', '无性生活', '性爱缺失', '性生活不和谐', '性生活不协调',
            '没有性生活', '性生活很少', '夫妻生活不和谐', '性生活缺失', '性生活障碍',
        ]],
    ];

    /**
     * JA markers whose ZH gloss is nearly unambiguous — missing needle ⇒ real misattach.
     * Weaker markers (気になる / 彼女 / 遅れ…) have many valid synonyms; those only
     * fire via CONFLICT invent above, not bare EXPECT miss (false 疑似错位).
     */
    const ALIGN_SEMANTIC_EXPECT_STRICT = [
        /セクシー/,
        /デート/,
        /後輩/,
        /先輩|センパイ|せんぱい/,
        /Vログ|ブイログ/,
        /撮[るっりてた]|撮れて|撮影|カメラ/,
        /テストステロン/,
        /実践編/,
        /セックスレス|レスになった/,
        /身だしなみ|清潔感/,
    ];

    /** ZH carries another cue's strong marker, or JA's strong marker is missing. */
    function looksLikeSemanticMisattach(text, sourceText = '') {
        const t = dialogueTextForAlign(text);
        const src = dialogueTextForAlign(sourceText);
        if (!t || !src) return false;
        if (/^…+$/.test(t) || textLen(t) < 2) return false;
        for (const [zhRe, jaRe] of ALIGN_SEMANTIC_CONFLICTS) {
            if (zhRe.test(t) && !jaRe.test(src)) {
                // Address-tag CONFLICT on an otherwise JA-justified anatomy body
                // (前辈…肉棒 over おちんこ) — peel later; do not blank the whole cue.
                if (
                    /前辈|学长|学姐/.test(String(zhRe))
                    && /肉棒|鸡巴|小穴|乳头/.test(t)
                    && /(?:ちんぽ|チンポ|おちん|ちんちん|ペニス|まんこ|おまんこ|乳首)/.test(src)
                ) {
                    continue;
                }
                return true;
            }
        }
        for (const [jaRe, needles] of ALIGN_SEMANTIC_EXPECT) {
            if (!jaRe.test(src)) continue;
            if (needles.some((n) => t.includes(n))) continue;
            // Short reactive JA answers may omit the marker; only flag substantive ZH.
            if (textLen(src) <= 4 && textLen(t) <= 6) continue;
            // Soft EXPECT miss (synonym gap) is not enough to blank — require a
            // strict JA marker, otherwise CONFLICT invent already covers real shifts.
            if (!ALIGN_SEMANTIC_EXPECT_STRICT.some((re) => re.test(src))) continue;
            // 先輩 + adult body: ZH may be oral/anatomy without the address gloss
            // (先輩のちんぽ→肉棒… / 先輩のフェラ→口交).
            if (
                /先輩|センパイ|せんぱい/.test(src)
                && /(?:フェラ|ちんぽ|チンポ|おちん|ペニス|まんこ)/.test(src)
                && /(?:口交|肉棒|鸡巴|舔|小穴)/.test(t)
            ) {
                continue;
            }
            // セックスレス / レスになった: accept 性生活* paraphrases, not only glossary needles.
            if (
                /セックスレス|レスになった/.test(src)
                && /性生活|性爱|性冷淡|无性/.test(t)
            ) {
                continue;
            }
            return true;
        }
        return false;
    }

    /**
     * LLM / polish collapses many cues into a short stock ZH gloss that does not
     * match the JA (EBWH-361: 「你好」×200; EBWH-366/367/368: 「要射了」「好舒服」「好厉害」 spam).
     * Legitimate short tables (こんにちは→你好, だめ→不行, 気持ちいい→好舒服) stay OK.
     */
    function looksLikeStockGlossMisattach(text, sourceText = '') {
        const t = dialogueTextForAlign(text);
        const src = dialogueTextForAlign(sourceText);
        if (!t || !src) return false;
        const bareZh = String(t)
            .replace(/[。．.!！?？\s…⋯~～]+$/u, '')
            .replace(/^[。．.!！?？\s…⋯~～]+/u, '')
            .trim();
        if (!bareZh) return false;

        if (/^(?:你好|您好)$/u.test(bareZh)) {
            if (/(?:こんにちは|こんばんは|おはよう|もしもし|いらっしゃい|初めまして|はじめまして)/.test(src)) {
                return false;
            }
            return true;
        }
        // MNGS-074: 早上好×350 pasted onto non-おはよう lines when style prompt stressed the model
        if (/^(?:早上好|早安)$/u.test(bareZh)) {
            if (/おはよう/.test(src)) {
                if (textLen(src) >= 16 && !jaMostlyCoveredByShortGloss(src)) return true;
                return false;
            }
            return true;
        }
        // Glued stock collapse (MNGS-082: 拜托了不要不行 / 真的不要不行)
        if (/^(?:真的)?拜托了不要不行$|^(?:真的)?不要不行$|^真的拜托了$/u.test(bareZh)) {
            return textLen(src) >= 4;
        }

        // Bare vocative stub pasted onto non-call-out JA (SNOS-299 collapse)
        if (isBareVocativeStubZh(bareZh)) {
            return !jaJustifiesBareVocativeZh(src);
        }

        if (!/^(?:舒服吗|好舒服|要射了|要去了|要射了吗|要去了吗|好厉害|不行|真的|什么|感觉|糟了|再多点|怎么了|好开心|拜托了|不要|好漂亮|好可爱|等一下|为什么|你看|舔|好烫|的好烫|明白了|知道了|辛苦了|请看|那个|那就|很远|哈…哈|哈…哈…|忍不住了|是啊|没事|但是|可是|所以)$/u.test(bareZh)) {
            return false;
        }
        if (bareZh === '好厉害' && /すごい|すげ[えぇー]|すご[いいっ]/.test(src)) {
            // EBWH-366: 「すごいわあ、洋楽…」long line collapsed to 好厉害
            if (textLen(src) >= 16 && !jaMostlyCoveredByShortGloss(src)) return true;
            return false;
        }
        if (bareZh === '不行' && /だめ|ダメ|駄目|やめて|やめろ|いや[だで]|らめ|ラメ/.test(src)) return false;
        if (bareZh === '不要' && /やだ|嫌|やめて|やめろ|やめ|いや[だで]|だめ|ダメ/.test(src)) return false;
        if (bareZh === '真的' && /本当|ほんと|マジ|まじで/.test(src)) {
            if (textLen(src) >= 12 && !jaMostlyCoveredByShortGloss(src)) return true;
            return false;
        }
        // EBWH-365: 那就 pasted on お礼したい / なんでもない / 舐めるんじゃ…
        if (bareZh === '那就') {
            if (/^(?:じゃあ|じゃ|それでは|それじゃ)[ぁあ]?[。．.!！?？…ー〜～っッ\s]*$/u.test(src.trim())) return false;
            if (/じゃあ|それじゃ|それでは/.test(src) && textLen(src) <= 10) return false;
            return true;
        }
        // EBWH-363: 很远 stuck on 名前 / 客套 / ツルツル lines
        if (bareZh === '很远') {
            if (/遠[いく]|遠い|遠いね|遠いよ|遠く/.test(src)) return false;
            return true;
        }
        if (bareZh === '哈…哈' || bareZh === '哈…哈…') {
            // Pure / moan-heavy JA may legitimately gloss as breath 哈…哈
            if (isMoanOrSfxHeavyJa(src)) return false;
            if (/^(?:はぁ+|はあ+|ふふ+|うふふ+|は、あぁ)[ー〜～っッ…。.．、\s]*$/u.test(src.trim())) return false;
            return textLen(src) >= 4 || jaCueHasLexicalResidue(src);
        }
        // EBWH-367 opening: 没事/但是/所以 pasted onto self-intro / workplace / 性格は
        if (bareZh === '没事') {
            if (/大丈夫|問題ない|平気|気にし(?:ない|なくて)|かまわない|大丈夫です|だいじょうぶ/.test(src)) {
                if (textLen(src) >= 14 && !jaMostlyCoveredByShortGloss(src)) return true;
                return false;
            }
            return true;
        }
        if (bareZh === '但是' || bareZh === '可是') {
            if (/^(?:でも|だけど|しかし|けど)[ぁあ]?[。．.!！?？…ー〜～っッ\s]*$/u.test(src.trim())) return false;
            if (/(?:でも|だけど|しかし)/.test(src) && textLen(src) <= 12) return false;
            return true;
        }
        if (bareZh === '所以') {
            if (/^(?:だから|それで|従って)[ぁあ]?[。．.!！?？…ー〜～っッ\s]*$/u.test(src.trim())) return false;
            if (/(?:だから|それで)/.test(src) && textLen(src) <= 12) return false;
            return true;
        }
        if (bareZh === '忍不住了') {
            if (/我慢|限界|もう無理|たまらな|堪らな|我慢できな/.test(src)) {
                if (textLen(src) >= 16 && !jaMostlyCoveredByShortGloss(src)) return true;
                return false;
            }
            return true;
        }
        if (bareZh === '是啊') {
            if (/^(?:そう|そうだ|そっか|そうね|うんそう)[ねよ]?[。．.!！?？…ー〜～っッ\s]*$/u.test(src.trim())) return false;
            if (/そっか|そうだね|そうね|そうか/.test(src) && textLen(src) <= 12) return false;
            return textLen(src) >= 8;
        }
        // EBWH-366: 要射了吗 pasted on きもち / 痛くない / あっとる
        if (bareZh === '要射了吗' || bareZh === '要去了吗') {
            if (/イキそう|いきそう|イク\s*[?？]|いく\s*[?？]|出そう|射精|イッちゃ|イキそうう/.test(src)) {
                if (textLen(src) >= 16 && !jaMostlyCoveredByShortGloss(src)) return true;
                return false;
            }
            return true;
        }
        if (bareZh === '什么' && /なに|何|なんで|どうした|どうして/.test(src)) return false;
        if (bareZh === '感觉') {
            // Bare 感觉 is under-fill for 気持ちいい?/よか? (want 舒服吗)
            if (/気持ちいか|気持ちよか|気持ちいい|きもちいい|きもちぃ|気持ちよ|きもちよ|気持ち良/.test(src)) {
                return true;
            }
            if (/気持ち|きもち|感じ|触[っつて]|触る|触り/.test(src)) {
                if (textLen(src) >= 10 && !jaMostlyCoveredByShortGloss(src)) return true;
                return false;
            }
            return textLen(src) >= 2;
        }
        if (bareZh === '糟了' && /やば|ヤバ|しまった|マジか/.test(src)) return false;
        if (bareZh === '再多点' && /もっと|もうちょっと|もう少し/.test(src)) return false;
        if (bareZh === '怎么了' && /どうした|どうして|どうな[って]|どうなっ|なに|何/.test(src)) {
            if (textLen(src) >= 14 && !jaMostlyCoveredByShortGloss(src)) return true;
            return false;
        }
        if (bareZh === '为什么' && /なんで|どうして|なぜ|なに|何/.test(src)) return false;
        if (bareZh === '好开心' && /嬉し|うれし|楽しい|たのしい|興奮/.test(src)) return false;
        if (bareZh === '拜托了' && /お願い|してください|下さい|頼[むみ]/.test(src)) {
            // Bare 拜托了 on a long multi-clause JA is still an under-fill.
            if (textLen(src) >= 16 && !jaMostlyCoveredByShortGloss(src)) return true;
            return false;
        }
        if (bareZh === '好漂亮' && /綺麗|きれい|美し|美人|きれいだ|キレイ/.test(src)) {
            if (textLen(src) >= 12 && !jaMostlyCoveredByShortGloss(src)) return true;
            return false;
        }
        if (bareZh === '好可爱' && /可愛|かわい|かわいい|カワイイ/.test(src)) {
            if (textLen(src) >= 12 && !jaMostlyCoveredByShortGloss(src)) return true;
            return false;
        }
        if (bareZh === '等一下' && /ちょっと|待[ってち]|待て|まって/.test(src)) {
            if (textLen(src) >= 12 && !jaMostlyCoveredByShortGloss(src)) return true;
            return false;
        }
        if (bareZh === '你看' && /ほら|見て|見[てて]|ごらん|ご覧/.test(src)) {
            if (textLen(src) >= 12 && !jaMostlyCoveredByShortGloss(src)) return true;
            return false;
        }
        if (bareZh === '舔' && /舐|しゃぶ|フェラ|咥/.test(src)) {
            if (textLen(src) >= 12 && !jaMostlyCoveredByShortGloss(src)) return true;
            return false;
        }
        if (bareZh === '的好烫') return true; // EYAN stuck fragment
        if (bareZh === '好烫' && /熱[いっ]|あち[いっ]|熱っ|熱く/.test(src)) {
            if (textLen(src) >= 12 && !jaMostlyCoveredByShortGloss(src)) return true;
            return false;
        }
        if (bareZh === '明白了' || bareZh === '知道了') {
            if (/わか[りるっ]|分か[りるっ]|分かった|了解|承知|納得/.test(src)) {
                if (textLen(src) >= 12 && !jaMostlyCoveredByShortGloss(src)) return true;
                return false;
            }
            return textLen(src) >= 2;
        }
        if (bareZh === '辛苦了') {
            if (/お疲れ|ご苦労|辛苦/.test(src)) {
                if (textLen(src) >= 12 && !jaMostlyCoveredByShortGloss(src)) return true;
                return false;
            }
            return textLen(src) >= 2;
        }
        if (bareZh === '请看') {
            if (/見て|ごらん|ご覧|見せて/.test(src)) {
                if (textLen(src) >= 12 && !jaMostlyCoveredByShortGloss(src)) return true;
                return false;
            }
            return textLen(src) >= 2;
        }
        if (bareZh === '那个') {
            if (/^あの|^その|えっと/.test(src) && textLen(src) <= 10) return false;
            if (/あの|その/.test(src) && jaMostlyCoveredByShortGloss(src)) return false;
            return textLen(src) >= 2;
        }
        // Feel-good: 気持ちいい / 気持ちよ[くかた] / きもちい… (not bare 気持ち as topic)
        if ((bareZh === '舒服吗' || bareZh === '好舒服')
            && /気持ちいい|きもちいい|きもちぃ|キモチ|気持ちよ|きもちよ|気持ち良|きもちい|気持ち\s*い|きもち\s*い|気持ちよか/.test(src)) {
            // Address / extra clause dropped (お兄ちゃんも気持ちいい? → bare 舒服吗)
            if (/(?:お兄ちゃん|兄ちゃん|お姉さん|お姉ちゃん|愛理|あいり)/.test(src)
                && !/(?:哥哥|姐姐|爱理|藍|蓝)/.test(bareZh)
                && textLen(src) >= 10) {
                return true;
            }
            // Long lecture / how-to pitch with 気持ちよくさせたい — not a feel-good moan gloss
            // (MFYD-182: 既婚未婚は関係ない…すべての男性に向けた話 → 好舒服)
            if (
                textLen(src) >= 16
                && !jaMostlyCoveredByShortGloss(src)
                && (
                    isLectureExpositoryJa(src)
                    || (/気持ちよくさせ/.test(src) && !/気持ちいい|きもちいい|きもちぃ/.test(src))
                )
            ) {
                return true;
            }
            return false;
        }
        if ((bareZh === '要射了' || bareZh === '要去了')
            && /イッ|イキ|イク|いく[わよね]?|いっちゃ|イっちゃ|出[しする]|出そう|出ちゃう|出る|射精|漏ら|だめ[ぇえ]?|ダメ/.test(src)) {
            if (/(?:お兄ちゃん|兄ちゃん|愛理|あいり)/.test(src)
                && !/(?:哥哥|姐姐|爱理)/.test(bareZh)
                && textLen(src) >= 12) {
                return true;
            }
            return false;
        }
        // Exact short-table gloss for this JA — not invent (unless long JA under-fill).
        const gloss = remapZhFromJaSimple(src);
        if (gloss && zhNormKey(gloss) === zhNormKey(bareZh)) {
            if (textLen(src) >= 12 && textLen(bareZh) <= 3 && !jaMostlyCoveredByShortGloss(src)) {
                return true;
            }
            return false;
        }
        try {
            const smartCore = (typeof require === 'function')
                ? require('./advanced-smart-translate-core')
                : null;
            const fb = smartCore?.fallbackShortJaCue?.(src);
            if (fb && zhNormKey(fb) === zhNormKey(bareZh)) {
                if (textLen(src) >= 12 && textLen(bareZh) <= 3 && !jaMostlyCoveredByShortGloss(src)) {
                    return true;
                }
                return false;
            }
        } catch { /* optional */ }
        return textLen(src) >= 2;
    }

    const STICKY_SHORT_ZH = new Set([
        '你好', '您好', '不行', '什么', '真的', '感觉',
        '舒服吗', '好舒服', '要射了', '要去了', '好厉害',
        '糟了', '再多点', '怎么了', '好开心', '拜托了', '不要',
        '好漂亮', '好可爱', '等一下', '为什么', '你看', '舔',
        '好烫', '的好烫', '明白了', '知道了', '辛苦了', '请看', '那个',
        // EBWH stock spam / recycle stubs
        '那就', '很远', '哈…哈', '哈…哈…', '忍不住了', '是啊',
        '要射了吗', '要去了吗', '没事', '但是', '可是', '所以',
        '早上好', '早安',
        // Filler collapse (MFYD-191「嗯嗯」×400+)
        '嗯嗯', '啊啊', '嗯', '啊', '哈', '哈…', '哦', '噢',
        '老师',
        // Vocative stubs (1-char keys skipped high-freq unstick unless sticky)
        '喂', '喂喂',
    ]);

    /**
     * JA check-in「大丈夫？」mistranslated via ZH homograph「大丈夫」(manly / blessing day).
     * Reusable across titles — not PRED-specific.
     */
    function looksLikeDaijoubuSenseMisattach(text, sourceText = '') {
        const t = dialogueTextForAlign(text);
        const src = dialogueTextForAlign(sourceText);
        if (!t || !src) return false;
        if (!/大丈夫|だいじょうぶ/.test(src)) return false;
        // ZH already check-in gloss — keep
        if (/没事|没关系|没问题|不要紧|还好吗|可以吗|行吗/.test(t)
            && !/真是个大丈夫|大丈夫的(?:早晨|早上|日子|一天|开始|好日子)/.test(t)) {
            return false;
        }
        const blessing = /真是个大丈夫|大丈夫的(?:早晨|早上|日子|一天|开始|好日子)|好个大丈夫|真男人|真是大丈夫/.test(t);
        if (!blessing) return false;
        // JA is check-in / OK form (short Q or 今大丈夫)
        const checkIn = /今.{0,6}(?:大丈夫|だいじょうぶ)|(?:大丈夫|だいじょうぶ)(?:か|ですか|っすか)|[？?]\s*$/.test(src)
            || textLen(src) <= 18;
        return checkIn;
    }

    /**
     * Opening / reactive JA buried under a paste of many unrelated stock ZH glosses
     * (VAGU/VOD:「好开心 请 那就 请多指教 失陪了 射在外面…」).
     */
    function looksLikeMultiStockGlueInvent(text, sourceText = '') {
        const t = dialogueTextForAlign(text);
        const src = dialogueTextForAlign(sourceText);
        if (!t || !src) return false;
        if (textLen(t) < 10) return false;
        const extras = ['请多指教', '失陪了', '射在外面', '对不起', '已经不行了', '果然'];
        const extraSet = new Set(extras);
        const hits = [];
        for (const stock of STICKY_SHORT_ZH) {
            if (stock.length < 2) continue;
            if (t.includes(stock)) hits.push(stock);
        }
        for (const e of extras) {
            if (t.includes(e) && !hits.includes(e)) hits.push(e);
        }
        if (hits.length < 3) return false;
        // Count only stocks that do NOT fit this JA (正当 climax/pain 不行+要射了 is OK)
        let bad = 0;
        for (const h of hits) {
            if (extraSet.has(h)) {
                if (h === '请多指教' && /よろしく|お願いします/.test(src)) continue;
                if (h === '对不起' && /ごめん|すみませ|失礼/.test(src)) continue;
                if (h === '失陪了' && /失礼|お先/.test(src)) continue;
                bad += 1;
                continue;
            }
            if (looksLikeStockGlossMisattach(h, src)) bad += 1;
            else if (isFillerStickyBare(h) && !isMoanOrSfxHeavyJa(src)
                && !/イッ|イキ|イク|いく|痛い|だめ|ダメ|あっ|んっ/.test(src)) {
                bad += 1;
            }
        }
        if (bad < 3) return false;
        if (textLen(src) <= 28 && bad >= 3) return true;
        if (bad >= 4 && textLen(t) >= textLen(src) + 8) return true;
        return bad >= 3 && textLen(t) >= textLen(src) + 4;
    }

    function isFillerStickyBare(bare = '') {
        return /^(?:嗯嗯|啊啊|嗯|啊|哈…?|哦|噢|喂+|呐+)$/u.test(String(bare || '').trim());
    }

    /** Bare vocative-call ZH surface (hey / phone-answer class). */
    function isBareVocativeStubZh(bare = '') {
        const t = String(bare || '').trim();
        return /^(?:喂+|嘿+|呐+)$/u.test(t);
    }

    /** JA that legitimately glosses to a bare vocative stub (ねえ / おい / phone). */
    function jaJustifiesBareVocativeZh(sourceText = '') {
        const src = String(sourceText || '').trim();
        if (!src) return false;
        if (/^(?:(?:ねえ)+|(?:ねぇ)+|おい+)[ー〜～っッ。．.!！?？…\s]*$/u.test(src)) return true;
        if (/もしもし/.test(src) && textLen(src) <= 12) return true;
        return false;
    }

    function isStickyShortZhKey(zk, sampleZh = '') {
        const key = String(zk || '').trim();
        if (STICKY_SHORT_ZH.has(key)) return true;
        const bare = String(sampleZh || '')
            .replace(/[。．.!！?？\s…⋯~～]+$/u, '')
            .trim();
        return STICKY_SHORT_ZH.has(bare) || isFillerStickyBare(bare);
    }

    /**
     * 嗯嗯/啊啊 pasted onto lexical dialogue (MFYD-191 collapse).
     */
    function looksLikeFillerGlossMisattach(text, sourceText = '') {
        const t = dialogueTextForAlign(text);
        const src = dialogueTextForAlign(sourceText);
        if (!t || !src) return false;
        const bareZh = String(t)
            .replace(/[。．.!！?？\s…⋯~～]+$/u, '')
            .replace(/^[。．.!！?？\s…⋯~～]+/u, '')
            .trim();
        if (!isFillerStickyBare(bareZh)) return false;
        if (isMoanOrSfxHeavyJa(src)) return false;
        // Vocative stub only OK on call-out / phone JA — not lexical dialogue
        if (isBareVocativeStubZh(bareZh)) {
            return !jaJustifiesBareVocativeZh(src);
        }
        // Short affirmative JA → 嗯嗯 is a real gloss
        if (/^(?:うん|ええ|んー+)[。．.!！?？…ー〜～っッ\s]*$/u.test(src.trim())) return false;
        // Known discourse / short-table JA must not keep filler 嗯嗯 (それじゃあ / つまり…)
        {
            let discourseZh = null;
            try {
                discourseZh = remapZhFromJaSimple(src);
            } catch { /* ignore */ }
            if (!discourseZh) {
                try {
                    const smartCore = (typeof require === 'function')
                        ? require('./advanced-smart-translate-core')
                        : null;
                    discourseZh = smartCore?.fallbackShortJaCue?.(src) || null;
                } catch { /* optional */ }
            }
            const discourseBare = String(discourseZh || '')
                .replace(/[。．.!！?？…\s~～〜]+$/g, '')
                .trim();
            // Only when the table gloss is real dialogue (不是 嗯嗯/哦 一类 filler 自身)
            if (
                discourseZh
                && discourseBare
                && !isFillerStickyBare(discourseBare)
                && discourseBare.length >= 2
            ) {
                return true;
            }
        }
        // Require clear dialogue signal — never flag moan / SFX-only JA (オオォォッ → 哦)
        if (/[一-龯]/.test(src)) return textLen(src) >= 2;
        if (
            /(?:です|ます|ない|から|けど|のに|だって|じゃ|もん|よね|かな|だろう|って|して|ある|いる|する|なる|これ|それ|あれ|どう|なに|何|帰|来|つまり|とにかく|とりあえず|ちなみ|要する)/.test(src)
            && textLen(src) >= 4
        ) {
            return true;
        }
        return false;
    }

    /**
     * Break consecutive identical ZH when Japanese sources differ (MT stuck loop).
     */
    function unstickCrossCueZh(translatedCues, sourceCues = [], options = {}) {
        const opts = options && typeof options === 'object' ? options : {};
        const inventWipe = opts.inventWipe !== false;
        const zhList = Array.isArray(translatedCues) ? translatedCues.map((c) => ({ ...c })) : [];
        const srcList = Array.isArray(sourceCues) ? sourceCues : [];
        let dualCore = null;
        let sourceOverlapIndex = null;
        try {
            dualCore = require('./dual-subtitle-core');
            if (typeof dualCore.buildOverlapIndex === 'function') {
                sourceOverlapIndex = dualCore.buildOverlapIndex(srcList);
            }
        } catch { /* optional */ }
        const srcByIndex = new Map();
        for (const c of srcList) {
            const idx = Number(c?.index);
            if (Number.isInteger(idx)) srcByIndex.set(idx, String(c?.text ?? ''));
        }
        const resolveSrc = (cue, i) => {
            const { source } = resolveSanitizeSourceCue(
                cue,
                i,
                srcList,
                srcByIndex,
                dualCore,
                sourceOverlapIndex,
            );
            return source;
        };
        let changed = 0;
        for (let i = 0; i < zhList.length; i += 1) {
            const src = resolveSrc(zhList[i], i);
            let fixed = polishOrphanStuckZh(zhList[i]?.text, src);
            if (fixed.changed) {
                zhList[i] = { ...zhList[i], text: fixed.text };
                changed += 1;
            }
            fixed = remapLongZhOnReactiveJa(zhList[i]?.text, src);
            if (fixed.changed) {
                zhList[i] = { ...zhList[i], text: fixed.text };
                changed += 1;
            }
            if (!inventWipe) continue;
            const curZh = String(zhList[i]?.text || '').trim();
            const hardInvent = looksLikeFilmingZhInvent(curZh, src)
                || looksLikeMissingFilmingZh(curZh, src)
                || looksLikeCrossCuePlotBleed(curZh, src)
                || looksLikeWomenAudiencePitchInvent(curZh, src)
                || looksLikeLectureSceneBleed(curZh, src)
                || looksLikeBookBlurbInvent(curZh, src)
                || looksLikeAdultRegisterInvented(curZh, src)
                || looksLikeStockGlossMisattach(curZh, src)
                || looksLikeFillerGlossMisattach(curZh, src)
                || looksLikeMultiStockGlueInvent(curZh, src);
            const softInvent = looksLikeSemanticMisattach(curZh, src)
                || looksLikeDaijoubuSenseMisattach(curZh, src);
            if (hardInvent || softInvent) {
                const remapped = remapZhFromJaSimple(src);
                let next;
                if (remapped != null && shortRemapAdequateForJa(remapped, src)) {
                    next = remapped;
                } else if (
                    !hardInvent
                    && softInvent
                    && textLen(src) <= 8
                    && curZh
                    && textLen(curZh) <= textLen(src) + 14
                ) {
                    // Soft EXPECT / sense miss on short JA: keep GalTransl gloss.
                    // Hard invent (filming / plot bleed / stock) still blanks.
                    next = curZh;
                } else {
                    next = '…';
                }
                if (next !== curZh) {
                    zhList[i] = { ...zhList[i], text: next };
                    changed += 1;
                }
            }
        }
        let i = 0;
        while (i < zhList.length) {
            const zk = zhNormKey(zhList[i]?.text);
            const stickyEarly = isStickyShortZhKey(zk, zhList[i]?.text);
            // 1-char vocative stubs must still enter streak unstick.
            if (!zk || (zk.length < 2 && !stickyEarly)) {
                i += 1;
                continue;
            }
            let j = i + 1;
            while (j < zhList.length && zhNormKey(zhList[j]?.text) === zk) j += 1;
            const streak = j - i;
            const sticky = stickyEarly || isStickyShortZhKey(zk, zhList[i]?.text);
            const minStreak = sticky ? 2 : (zk.length >= 6 ? 2 : 3);
            if (streak >= minStreak) {
                const jaKeys = [];
                for (let k = i; k < j; k += 1) {
                    jaKeys.push(jaNormKey(resolveSrc(zhList[k], k)));
                }
                const uniq = new Set(jaKeys.filter(Boolean));
                if (uniq.size >= Math.min(2, streak)) {
                    const firstJa = jaKeys[0] || '';
                    for (let k = i; k < j; k += 1) {
                        const ja = resolveSrc(zhList[k], k);
                        const jk = jaKeys[k - i] || '';
                        if (k === i && jk === firstJa) continue;
                        if (jk && jk === firstJa) continue;
                        if (sticky && zhJustifiesHighFreqReuse(zhList[k]?.text, ja)) continue;
                        const remapped = remapZhFromJaSimple(ja);
                        const next = (remapped != null && shortRemapAdequateForJa(remapped, ja))
                            ? remapped
                            : ((sticky || zk.length >= 4) ? '…' : zhList[k].text);
                        if (next !== zhList[k].text) {
                            zhList[k] = { ...zhList[k], text: next };
                            changed += 1;
                        }
                    }
                } else if (uniq.size === 1 && zk.length >= 6 && streak >= 2) {
                    // Same JA pasted onto Pro-split slices — keep first, blank the rest
                    for (let k = i + 1; k < j; k += 1) {
                        if (String(zhList[k].text || '').trim() === '…') continue;
                        zhList[k] = { ...zhList[k], text: '…' };
                        changed += 1;
                    }
                }
            }
            i = j;
        }

        // High-frequency identical ZH on divergent JA (non-consecutive sticky paste).
        // Consecutive unstick above misses FNS-style spam (「拍清楚了吗？」×100, streak=1).
        // Filming-check ZH: threshold 2 (even sparse paste is almost always invent).
        // Short stock glosses (你好/要射了): threshold 3 — EBWH-361 collapse.
        {
            const freq = new Map();
            for (let k = 0; k < zhList.length; k += 1) {
                const zk = zhNormKey(zhList[k]?.text);
                const sticky = isStickyShortZhKey(zk, zhList[k]?.text);
                if (!zk || (zk.length < 4 && !sticky)) continue;
                if (!freq.has(zk)) freq.set(zk, []);
                freq.get(zk).push(k);
            }
            for (const [zk, idxs] of freq.entries()) {
                const sampleZh = String(zhList[idxs[0]]?.text || '');
                const filmingSticky = /拍清楚|拍得清楚|拍的清楚|拍好了吗|拍的好吗|拍得好吗/.test(sampleZh);
                const sticky = isStickyShortZhKey(zk, sampleZh);
                const fillerSticky = isFillerStickyBare(zk)
                    || isFillerStickyBare(String(sampleZh || '').replace(/[。．.!！?？\s…⋯~～]+$/u, '').trim());
                const minCount = filmingSticky ? 2 : (fillerSticky ? 2 : (sticky ? 3 : (zk.length >= 8 ? 3 : 8)));
                if (idxs.length < minCount) continue;
                const jaKeys = idxs.map((k) => jaNormKey(resolveSrc(zhList[k], k)));
                const uniqJa = new Set(jaKeys.filter(Boolean));
                const minUniq = filmingSticky || sticky || fillerSticky || zk.length >= 8 ? 2 : 4;
                if (uniqJa.size < minUniq) continue;
                if (!filmingSticky && !sticky && uniqJa.size / idxs.length < 0.5) continue;
                // Keep justified cue(s); if none justify, blank every sticky paste.
                let keepIdx = -1;
                const zhRaw = sampleZh;
                for (const k of idxs) {
                    const ja = resolveSrc(zhList[k], k);
                    if (zhJustifiesHighFreqReuse(zhRaw, ja)) {
                        keepIdx = k;
                        break;
                    }
                }
                for (const k of idxs) {
                    if (keepIdx >= 0 && k === keepIdx) continue;
                    const ja = resolveSrc(zhList[k], k);
                    if (keepIdx >= 0 && zhJustifiesHighFreqReuse(zhRaw, ja)) continue;
                    const remapped = remapZhFromJaSimple(ja);
                    const next = (remapped != null && shortRemapAdequateForJa(remapped, ja))
                        ? remapped
                        : ((sticky || fillerSticky || zk.length >= 4) ? '…' : zhList[k].text);
                    if (next !== zhList[k].text) {
                        zhList[k] = { ...zhList[k], text: next };
                        changed += 1;
                    }
                }
            }
        }

        // High-freq cast-name paste (HMN-907「朝比奈」bare or glued:「不要朝比奈」).
        {
            const bareNameFreq = new Map();
            for (let k = 0; k < zhList.length; k += 1) {
                const raw = String(zhList[k]?.text || '').trim();
                const soleBare = raw.replace(/[。．.!！?？…\s]+$/g, '');
                if (!/^[\u4e00-\u9fff]{2,4}$/.test(soleBare)) continue;
                if (ZH_NAME_STEM_STOP.has(soleBare) || COMMON_KEEP_TOKENS.has(soleBare)) continue;
                if (/[的了吗呢是在我你他她好不很还要会能对吧啊哦原如真次点拿给射舔摸插含去出根哥姐弟叔穴棒精奶胸臀阴蒂乳就这怎什样感累热烫冷]/.test(soleBare)
                    || /怎么|什么|怎样/.test(soleBare)) {
                    continue;
                }
                if (/^(?:小穴|肉棒|鸡巴|精液|奶子|胸部|后庭|乳头|阴蒂|老师|哥哥|姐姐|爸爸|妈妈|不要|不行|真的|感觉)$/.test(soleBare)) {
                    continue;
                }
                if (!bareNameFreq.has(soleBare)) bareNameFreq.set(soleBare, 0);
                bareNameFreq.set(soleBare, bareNameFreq.get(soleBare) + 1);
            }
            const spamNames = [...bareNameFreq.entries()]
                .filter(([, n]) => n >= 3)
                .map(([name]) => name);
            for (const name of spamNames) {
                const nameRe = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
                let hitIdxs = [];
                for (let k = 0; k < zhList.length; k += 1) {
                    if (nameRe.test(String(zhList[k]?.text || ''))) hitIdxs.push(k);
                    nameRe.lastIndex = 0;
                }
                if (hitIdxs.length < 3) continue;
                const jaKeys = hitIdxs.map((k) => jaNormKey(resolveSrc(zhList[k], k)));
                const uniqJa = new Set(jaKeys.filter(Boolean));
                if (uniqJa.size < 2) continue;
                for (const k of hitIdxs) {
                    const ja = resolveSrc(zhList[k], k);
                    if (sourceJustifiesZhName(name, ja)) continue;
                    const cur = String(zhList[k].text || '');
                    nameRe.lastIndex = 0;
                    let next = cur.replace(nameRe, '')
                        .replace(/[，,\s]{2,}/g, ' ')
                        .replace(/^[，,\s…·.]+|[，,\s…·.]+$/g, '')
                        .trim();
                    nameRe.lastIndex = 0;
                    if (!next || /^[？?…·.\s]*$/.test(next)) {
                        const remapped = remapJaPreferLexical(ja) || remapZhFromJaSimple(ja);
                        next = (remapped && remapped !== name && shortRemapAdequateForJa(remapped, ja))
                            ? remapped
                            : '…';
                    } else if (looksLikeStockGlossMisattach(next, ja)
                        || isSeverelyUnderTranslated(next, ja)) {
                        const remapped = remapJaPreferLexical(ja) || remapZhFromJaSimple(ja);
                        next = (remapped
                            && !looksLikeStockGlossMisattach(remapped, ja)
                            && shortRemapAdequateForJa(remapped, ja))
                            ? remapped
                            : '…';
                    }
                    if (next !== cur) {
                        zhList[k] = { ...zhList[k], text: next };
                        changed += 1;
                    }
                }
            }
        }

        // Leading cast-tag echo from previous cue (…和米莉娜 / 和米莉娜 哈…)
        // Also strip leading unjustified name on moan JA even when prev was already cleaned.
        for (let k = 0; k < zhList.length; k += 1) {
            let curZh = String(zhList[k]?.text || '').trim();
            if (!curZh) continue;
            const src = resolveSrc(zhList[k], k);
            let tag = null;
            if (k >= 1) {
                const prev = String(zhList[k - 1]?.text || '').trim();
                const tagM = prev.match(/(?:^|[\s，,])((?:和)?[\u4e00-\u9fff]{2,4})$/u);
                if (tagM && (curZh === tagM[1]
                    || curZh.startsWith(`${tagM[1]} `)
                    || curZh.startsWith(`${tagM[1]}，`)
                    || curZh.startsWith(tagM[1]))) {
                    tag = tagM[1];
                }
            }
            if (!tag) {
                const leadM = curZh.match(/^((?:和)?[\u4e00-\u9fff]{2,4})(?=[\s，,…]|$)/u);
                if (!leadM) continue;
                // Only auto-strip leading name without prev echo when JA is moan/reactive
                if (!isMoanOrSfxHeavyJa(src) && !(textLen(src) <= 10 && !jaCueHasLexicalResidue(src))) {
                    continue;
                }
                tag = leadM[1];
            }
            const stem = tag.replace(/^和/, '');
            if (sourceJustifiesZhName(stem, src) || sourceJustifiesZhName(tag, src)) continue;
            if (!isMoanOrSfxHeavyJa(src) && textLen(src) > 8 && jaCueHasLexicalResidue(src)) continue;
            let next = curZh;
            if (curZh === tag || curZh === `${tag}…` || curZh === `${tag}。`) {
                next = remapZhFromJaSimple(src) || '…';
            } else if (curZh.startsWith(tag)) {
                next = curZh.slice(tag.length).replace(/^[\s，,]+/u, '').trim();
            }
            if (next && next !== curZh) {
                zhList[k] = { ...zhList[k], text: next };
                changed += 1;
            }
        }

        // Trailing unjustified cast glue on moan JA (脸蛋好可爱啊 和米莉娜)
        for (let k = 0; k < zhList.length; k += 1) {
            const src = resolveSrc(zhList[k], k);
            let curZh = String(zhList[k]?.text || '').trim();
            if (!curZh || !isMoanOrSfxHeavyJa(src)) continue;
            const trail = curZh.match(/^(.*?)([\s，,]+)((?:和)?[\u4e00-\u9fff]{2,4})$/u);
            if (!trail || textLen(trail[1]) < 2) continue;
            const stem = trail[3].replace(/^和/, '');
            if (sourceJustifiesZhName(stem, src) || sourceJustifiesZhName(trail[3], src)) continue;
            const next = trail[1].trim();
            if (next && next !== curZh) {
                zhList[k] = { ...zhList[k], text: next };
                changed += 1;
            }
        }

        return { cues: zhList, changed };
    }

    /**
     * High-confidence hospital / meal / greeting glosses (soft-AV openings).
     * Used when Hy-MT invents unrelated ZH on mundane JA (IPZZ-957).
     */
    function remapMundaneHospitalOrMealJa(ja) {
        const s = String(ja || '').trim();
        if (!s) return null;
        const bare = s.replace(/[。．.!！?？…\s]+$/g, '');
        // Soft-AV salon / appointment reception (WAWA-045)
        if (/ご予約の方ですか|ご役の方ですか/.test(s) && textLen(s) <= 14) {
            return /[?？]/.test(s) ? '您是预约的客人吗？' : '您是预约的客人';
        }
        {
            const m = bare.match(/^はい[、,，]\s*予約の(.+?)です$/u);
            if (m && textLen(s) <= 18) {
                return `好的，我是预约的${m[1]}。`;
            }
        }
        {
            const m = bare.match(/^担当の(.+?)[、,，]\s*お呼びお願い(?:いたします)?(?:ね)?$/u);
            if (m && textLen(s) <= 28) {
                const name = String(m[1] || '').trim();
                return name ? `负责人${name}，麻烦帮叫一下` : null;
            }
        }
        // Gym / training check-in (MILK それちゃんと前もやってますか)
        if (/ちゃんと/.test(s) && /やってますか|やってる/.test(s) && textLen(s) <= 22) {
            return /[?？]/.test(s) ? '之前也有好好做吗？' : '之前也有好好做吧';
        }
        if (/^こんにちは/.test(bare) && textLen(s) <= 10) return '你好。';
        if (/^こんばんは/.test(bare) && textLen(s) <= 10) return '晚上好。';
        if (/熱が/.test(s) && /\d+\s*度/.test(s)) {
            const m = s.match(/(\d+)\s*度/);
            return m ? `烧到大概${m[1]}度左右` : '有点发烧';
        }
        if (/症状/.test(s) && /咳/.test(s) && textLen(s) <= 40) {
            return '这两天有什么症状吗？有咳嗽吧。';
        }
        if (/^ええと\s*そうなると/.test(s) && textLen(s) <= 16) return '嗯，这样的话';
        if (/廊下になるので/.test(s) && textLen(s) <= 14) return '因为要到走廊那边';
        if (/この廊下まっすぐ/.test(s) && /案内|お願い/.test(s)) {
            return '沿着这条走廊一直走就会有人带路，请到那边。';
        }
        if (/大事な先ほど/.test(s) && textLen(s) <= 14) return '刚才那件事很重要';
        if (/ごはんの時間|ご飯の時間/.test(s)) {
            return /みなさん|皆さん/.test(s) ? '各位，开饭时间到了哟。' : '开饭时间到了。';
        }
        if (/^入れますか\s*[?？]?$/.test(bare) && textLen(s) <= 10) return '可以进来吗？';
        if (/先にご飯食べ|先にごはん食べ/.test(s) && textLen(s) <= 20) {
            return /[?？]/.test(s) ? '我们先吃饭吧？' : '我们先吃饭吧';
        }
        if (/^(?:あ\s*)?お願いします$/.test(bare) && textLen(s) <= 12) return '拜托了';
        if (/熱いのでフード|熱いのでふ[ぅう]/.test(s) && textLen(s) <= 28) {
            return '有点烫，我吹一下';
        }
        if (/お口を利かせて|お口を開けて|お口開けて/.test(s) && textLen(s) <= 18) {
            return '请张开嘴';
        }
        if (/味とか大丈夫/.test(s) && textLen(s) <= 16) {
            return /[?？]/.test(s) ? '味道没问题吗？' : '味道没问题';
        }
        if (/美味しく感じます/.test(s) && textLen(s) <= 14) return '会觉得很好吃';
        if (/タプタプして/.test(s) && textLen(s) <= 24) return '好好咀嚼的话';
        if (/この病院には/.test(s) && /看護師/.test(s) && textLen(s) <= 40) {
            return '这家医院有个在患者间挺有名的护士';
        }
        if (/^名前は\s*(.+?)さん/.test(bare) && textLen(s) <= 16) {
            const m = bare.match(/^名前は\s*(.+?)さん/);
            return m ? `名字是${m[1]}` : null;
        }
        if (/おっきく吸って|大きく吸って/.test(s) && textLen(s) <= 12) return '大口吸气';
        if (/はい\s*大きくして/.test(s) && textLen(s) <= 12) return '对，再吸大一点';
        if (/^ただいま[ー〜～]*$/.test(bare)) return '我回来了。';
        if (/^はーい[ー〜～]+$/.test(bare)) return '嗯——';
        if (/^お久しぶりです$/.test(bare)) return '好久不见。';
        if (/ほんと久しぶりね/.test(s) && /いらっしゃい/.test(s) && textLen(s) <= 20) {
            return '真的好久不见呢，欢迎欢迎。';
        }
        if (/^いらっしゃい[まー〜～]*$/.test(bare) && textLen(s) <= 10) return '欢迎。';
        if (/^お邪魔します$/.test(bare)) return '打扰了。';
        if (/やっぱ夏はそうめん/.test(s) && textLen(s) <= 16) return '夏天果然还是得吃凉面啊。';
        if (/^いいそうめんだ$/.test(bare)) return '好面啊。';
        if (/ちょっと奮発しちゃったの/.test(s) && textLen(s) <= 16) return '稍微破费了一点。';
        if (/駅まで迎えに行こうと思ったのに/.test(s) && textLen(s) <= 22) {
            return '本来想去车站接你的。';
        }
        if (/朝\s*早く起きちゃって/.test(s) && textLen(s) <= 14) return '早上起得太早了。';
        if (/久々だからさ?歩きたかった/.test(s) && textLen(s) <= 22) {
            return '而且好久没见了，想走走。';
        }
        if (/予定より早くないか/.test(s) && textLen(s) <= 16) return '比预定的还早啊？';
        if (/奏くん来たわよ|奏くん来たよ/.test(s) && textLen(s) <= 18) {
            return /あなた/.test(s) ? '你看，奏君来了哟。' : '奏君来了哟。';
        }
        if (/^あ\s*かなめくん$/.test(bare) || /^あ\s*奏くん$/.test(bare)) return '啊，奏君。';
        if (/^あ\s*沙羅さん$/.test(bare)) return '啊，沙罗小姐。';
        if (/身体で元気してたか/.test(s) && textLen(s) <= 16) {
            return /[?？]/.test(s) ? '身体还好吗？' : '身体还好吗';
        }
        if (/5年ぶりの帰郷/.test(s) && textLen(s) <= 12) return '时隔五年的归乡';
        if (/^兄さんとは\s*[?？]?$/.test(bare)) return '哥哥呢？';
        if (/いっぱいあるから/.test(s) && /遠慮せず食え/.test(s) && textLen(s) <= 28) {
            return '有很多呢，别客气尽管吃。';
        }
        if (/地味だけど/.test(s) && /真面目で優しく/.test(s) && textLen(s) <= 22) {
            return '虽然朴素，但认真又温柔';
        }
        if (/いい嫁さんを見つけた/.test(s) && textLen(s) <= 28) {
            return '真觉得哥哥娶到了好媳妇啊';
        }
        if (/立ち話もなんだから/.test(s) && /入って/.test(s) && textLen(s) <= 28) {
            return '老站着说话也不像样，进来吧？';
        }
        if (/ちょうど昼飯だから/.test(s) && /一緒に行こう|一緒に/.test(s) && textLen(s) <= 32) {
            return '正好到午饭了，一起去吧';
        }
        if (/年の離れている兄妹/.test(s) && /弟思い/.test(s) && textLen(s) <= 28) {
            return '年龄差很大的兄妹，是很疼弟弟的好哥哥';
        }
        if (/兄に嫁いできた/.test(s) && /沙羅/.test(s) && textLen(s) <= 22) {
            return '还有嫁给哥哥的沙罗小姐';
        }
        if (/ネギ落としてるよ/.test(s) && textLen(s) <= 12) return '葱掉出来了哟';
        if (/さっぱりしていいな/.test(s) && textLen(s) <= 22) {
            return /美味|おいし/.test(s) ? '清爽又好吃呢？' : '清爽真不错呢';
        }
        if (/^美味い$|^うまい$/.test(bare)) return '好吃';
        if (/^ホントに\s*[?？]?$|^本当に\s*[?？]?$/.test(bare) && textLen(s) <= 8) {
            return /[?？]/.test(s) ? '真的吗？' : '真的';
        }
        if (/ちょっと暑いな/.test(s) && textLen(s) <= 10) return '有点热啊';
        if (/どうしたの\s*[?？]?$/.test(bare) && textLen(s) <= 10) {
            return /[?？]/.test(s) ? '怎么了？' : '怎么了';
        }
        return null;
    }

    function isMundaneHospitalOrMealJa(ja) {
        const s = String(ja || '');
        if (!s.trim()) return false;
        if (/^(?:こんにちは|こんばんは|おはよう|ただいま|はーい|お久しぶりです|お邪魔します)[ー〜～。．.!！?？\s]*$/u.test(s.trim())) return true;
        if (/^はい[ー〜～。．.!！?？\s]*$/u.test(s.trim()) && textLen(s) <= 4) return true;
        if (/ごはん|ご飯|廊下|病院|看護師|症状|咳が|熱が|フード|美味しく|味とか|お口を利か|お口開け|案内|笑顔|患者|検査|薬よりも|西田さんに秘密|安心できる|そうめん|久しぶり|いらっしゃい|お邪魔|帰郷|駅まで|歩きたかった|予定より|奏くん来|かなめくん|沙羅|身体で元気|奮発|遠慮せず食え|兄さんとは|いい嫁|真面目で優しく|朝\s*早く|起きちゃって|立ち話|昼飯|弟思い|年の離れている|ネギ落|さっぱりして|ちょっと暑い|どうしたの/.test(s)) {
            return true;
        }
        if (/入れますか\s*[?？]?$/.test(s.trim())) return true;
        if (/^(?:大丈夫ですよ|あ\s*お願いします|お願いします)[。．.!！?？…\s]*$/u.test(s.trim())) return true;
        if (/名前は\s*.+さん/.test(s) && textLen(s) <= 16) return true;
        if (/ええと\s*そうなると/.test(s) && textLen(s) <= 16) return true;
        if (/大事な先ほど/.test(s) && textLen(s) <= 14) return true;
        if (/タプタプして/.test(s) && textLen(s) <= 24) return true;
        if (/おっきく吸って|大きく吸って|はい\s*大きくして/.test(s) && textLen(s) <= 14) return true;
        return false;
    }

    function zhHasMundaneContentAnchor(zh, ja) {
        const cur = String(zh || '');
        const src = String(ja || '');
        if (/熱が|\d+\s*度/.test(src) && /烧|热|度|发烧|38|体温/.test(cur)) return true;
        if (/症状|咳/.test(src) && /症状|咳|咳嗽|不舒服/.test(cur)) return true;
        if (/ごはん|ご飯/.test(src) && /饭|餐|吃|开饭|用餐/.test(cur)) return true;
        if (/廊下|案内/.test(src) && /走廊|请|这边|那边|直走|带路/.test(cur)) return true;
        if (/お口/.test(src) && /嘴|口|张开/.test(cur)) return true;
        if (/病院|看護師|患者|笑顔|安心/.test(src) && /医院|护士|患者|笑容|安心|有名|西田/.test(cur)) return true;
        if (/名前は/.test(src) && /名字|叫|是/.test(cur)) return true;
        if (/フード|ふ[ぅう]/.test(src) && /烫|热|吹/.test(cur)) return true;
        if (/美味し|味と/.test(src) && /好吃|美味|味道/.test(cur)) return true;
        if (/お願い/.test(src) && /拜托|请/.test(cur)) return true;
        if (/入れますか/.test(src) && /进来|放入|端|可以吗|要吗/.test(cur)) return true;
        if (/吸って|大きくして/.test(src) && /吸|气/.test(cur)) return true;
        if (/こんにちは/.test(src) && /你好|您好/.test(cur)) return true;
        if (/ただいま/.test(src) && /回来了|我回来/.test(cur)) return true;
        if (/お久しぶり|久しぶり/.test(src) && /好久不见|久违/.test(cur)) return true;
        if (/いらっしゃい/.test(src) && /欢迎/.test(cur)) return true;
        if (/お邪魔/.test(src) && /打扰|叨扰/.test(cur)) return true;
        if (/そうめん/.test(src) && /凉面|素面|面/.test(cur)) return true;
        if (/駅まで|迎えに行/.test(src) && /车站|去接|接你|接到|迎接/.test(cur)) return true;
        if (/早く起き|朝\s*早く/.test(src) && /早|起|醒/.test(cur)) return true;
        if (/歩きたかった/.test(src) && /走|步行|想走走|走走/.test(cur)) return true;
        if (/予定より早く/.test(src) && /早|预定|比.*早/.test(cur)) return true;
        if (/奏くん来/.test(src) && /奏君|来了/.test(cur)) return true;
        if (/かなめ/.test(src) && /奏君|奏/.test(cur) && !/湿|硬|插|吸|射|肉棒|小穴/.test(cur)) return true;
        if (/沙羅/.test(src) && /沙罗/.test(cur) && !/湿|硬|插|吸|射|肉棒|小穴/.test(cur)) return true;
        if (/元気してたか/.test(src) && /身体|还好|精神|元気/.test(cur) && !/湿|硬|插|吸|射|肉棒|小穴|最里面/.test(cur)) return true;
        if (/帰郷/.test(src) && /归乡|回乡|五年|时隔/.test(cur)) return true;
        if (/兄さんとは/.test(src) && /哥哥|兄/.test(cur)) return true;
        if (/奮発/.test(src) && /破费|奢侈|请客/.test(cur)) return true;
        if (/遠慮せず食え|いっぱいある/.test(src) && /吃|客气|很多/.test(cur) && !/吸|湿|硬/.test(cur)) return true;
        if (/真面目で優しく|地味だけど/.test(src) && /朴素|认真|温柔|老实/.test(cur) && !/触碰|舒服|湿|硬|吸|射|小穴/.test(cur)) return true;
        if (/いい嫁/.test(src) && /媳妇|嫁|好妻子|好老婆/.test(cur) && !/触碰|舒服|湿|硬|吸|射/.test(cur)) return true;
        if (/立ち話|入って/.test(src) && /站|进来|进屋|进屋吧|进来吧/.test(cur) && !/内裤|糟糕|湿|硬|吸|射/.test(cur)) return true;
        if (/昼飯|一緒に行こう/.test(src) && /午饭|一起|吃饭/.test(cur) && !/怨恨|那种事|湿|硬|吸|射/.test(cur)) return true;
        if (/弟思い|年の離れている/.test(src) && /哥哥|弟弟|兄妹|年龄/.test(cur) && !/湿|硬|吸|射|小穴/.test(cur)) return true;
        if (/ネギ落/.test(src) && /葱|掉/.test(cur)) return true;
        if (/大丈夫です/.test(src) && /没事|大丈夫|可以|没关系/.test(cur)) return true;
        if (/ええと|そうなると/.test(src) && /这样|那么|嗯/.test(cur) && textLen(cur) <= 10) return true;
        if (/先ほど|大事/.test(src) && /刚才|重要/.test(cur)) return true;
        if (/タプタプ/.test(src) && /咀嚼|嚼|好好/.test(cur)) return true;
        return false;
    }

    function isMoanOrNoiseOnlyZh(zh) {
        const t = String(zh || '').trim();
        if (!t) return true;
        if (/^(?:啊+|哈+|嗯+|唔+|嘎+|啦+|哦+)[…·.!！?？，,\s啊哈嗯唔嘎啦哦]*$/u.test(t)) return true;
        if (/嘎嘎|啦啦/.test(t) && [...t.replace(/\s/g, '')].length <= 12) return true;
        return false;
    }

    /**
     * Soft-AV Hy-MT often invents unrelated ZH on hospital/meal openings.
     * Prefer high-confidence gloss; else blank for re-MT.
     */
    function repairMundaneJaMistranslation(text, sourceText = '') {
        const raw = String(text || '');
        const cur = raw.trim();
        const src = String(sourceText || '');
        if (!cur || !isMundaneHospitalOrMealJa(src)) {
            return { text: raw, changed: false };
        }
        if (zhHasMundaneContentAnchor(cur, src) && !isMoanOrNoiseOnlyZh(cur)) {
            return { text: raw, changed: false };
        }
        const inventish = isMoanOrNoiseOnlyZh(cur)
            || /小穴|肉棒|要射|射了|含住|插进|塞哦|破破烂烂|兴奋吗|作为奖励|请多看|没感觉|脱掉外套|一直都在看着|能上来吗|我很开心|得救了所以|触碰都好舒服|内裤|糟糕了|满是怨恨|那种事|达到高潮|变硬了|用小穴/.test(cur)
            || (/凉面|素面/.test(cur) && !/そうめん|麺/.test(src))
            || (/奖励|哈哈/.test(cur) && /お願い/.test(src))
            || (/姐姐|舒服地做/.test(cur) && /先ほど|大事/.test(src));
        const gloss = remapMundaneHospitalOrMealJa(src);
        if (inventish || !zhHasMundaneContentAnchor(cur, src)) {
            if (gloss && gloss !== cur) {
                return { text: gloss, changed: true };
            }
            if (inventish && !gloss) {
                return { text: '…', changed: cur !== '…' };
            }
        }
        return { text: raw, changed: false };
    }

    /**
     * Light sanitize for non-Chinese subtitle targets (en/ja/ko…).
     * Keeps glossary/name unify + artifact strip; skips ZH-domain / opaque / blank-recover.
     */
    function sanitizeMtCueTextLight(text, sourceText = '', options = {}, layers = null) {
        const flags = ['target_lang_light'];
        const stages = options.captureStages ? {} : null;
        let cur = String(text ?? '');
        let changed = false;
        const lang = layers?.lang || options.targetLang || options.subtitleTargetLang || 'en';
        if (lang) flags.push(`tgt:${lang}`);
        const intlBucket = intlTargetBucket(lang);

        const stripped = stripMtArtifacts(cur);
        if (stripped.changed) {
            cur = stripped.text;
            changed = true;
            if (stripped.glossHit) flags.push('gloss');
        }

        const numbered = stripNumberedListMtArtifact(cur);
        if (numbered.changed) {
            cur = numbered.text;
            changed = true;
            flags.push('list_index');
        }

        if (cur && looksLikeEnMtMetaLeak(cur)) {
            cur = '';
            changed = true;
            flags.push('en_mt_meta');
        }

        const leaked = stripPromptLeak(cur);
        if (leaked.changed) {
            cur = leaked.text;
            changed = true;
            flags.push('prompt_leak');
        }

        if (cur && looksLikeSourceEcho(cur, sourceText)) {
            cur = '';
            changed = true;
            flags.push('source_echo');
        }

        // EN/KO 成片：先把可识别的 ZH 短填/高潮面本地化，再清汉文串台。
        if (cur && looksLikeHanLeakForIntlTarget(cur, lang)) {
            let localized = '';
            try {
                const fill = (typeof require === 'function')
                    ? require('./mt-short-fill-core')
                    : null;
                localized = fill?.localizeZhShortFill?.(cur, { ...options, targetLang: lang, subtitleTargetLang: lang }, sourceText) || '';
            } catch { localized = ''; }
            if (localized && !looksLikeHanLeakForIntlTarget(localized, lang)) {
                cur = localized;
                changed = true;
                flags.push('zh_short_localize');
            } else {
                const scrubbed = scrubHanLeakForIntlTarget(cur, lang);
                cur = scrubbed.text;
                changed = true;
                flags.push('zh_script_leak');
            }
        }
        // Lexical JA blanked by Han scrub / ellipsis → deterministic EN/KO short fill.
        if (
            (!cur || /^[。．.、，,\s…·•\-—_~～]+$/.test(String(cur).trim()))
            && String(sourceText || '').trim()
        ) {
            try {
                const smartCore = (typeof require === 'function')
                    ? require('./advanced-smart-translate-core')
                    : null;
                const fb = smartCore?.fallbackShortJaCue?.(sourceText, {
                    ...options,
                    targetLang: lang,
                    subtitleTargetLang: lang,
                });
                if (fb && !looksLikeHanLeakForIntlTarget(fb, lang)) {
                    cur = fb;
                    changed = true;
                    flags.push('short_ja_fallback');
                } else {
                    const recovered = recoverBlankedAdultZh(cur || '…', sourceText, {
                        ...options,
                        targetLang: lang,
                        subtitleTargetLang: lang,
                        _sanitizeLayers: layers || options._sanitizeLayers,
                    });
                    if (recovered?.changed && recovered.text
                        && !looksLikeHanLeakForIntlTarget(recovered.text, lang)) {
                        cur = recovered.text;
                        changed = true;
                        flags.push('intl_blank_recover');
                    }
                }
            } catch { /* optional */ }
        }
        // KO/JA：站点水印拉丁串（flatjapan / Flat Japan / *.com）
        if (cur && looksLikeLatinLeakForIntlTarget(cur, lang, sourceText)) {
            const scrubbed = scrubLatinLeakForIntlTarget(cur, lang, sourceText);
            cur = scrubbed.text;
            changed = true;
            flags.push('latin_site_leak');
        }
        // Latin-garbage heuristics are for ZH tracks (English debris in Chinese).
        // On EN/KO 成片 they false-positive real dialogue ("Understood", "A change?").
        if (
            cur
            && intlBucket !== 'en'
            && intlBucket !== 'ko'
            && isLatinGarbageZh(cur, sourceText, { ...options, targetLang: lang, subtitleTargetLang: lang })
        ) {
            cur = '';
            changed = true;
            flags.push('latin_garbage');
        }

        const dash = stripKatakanaDashDebris(cur);
        if (dash.changed) {
            cur = dash.text;
            changed = true;
            flags.push('kana_dash');
        }

        if (options.nameRules?.length) {
            const named = applyNameConsistency(cur, options.nameRules);
            if (named.changed) {
                cur = named.text;
                changed = true;
                flags.push('name_unify');
            }
        }

        if (fluency?.collapseSoftDoublePhrase) {
            const soft = fluency.collapseSoftDoublePhrase(cur);
            if (soft.changed) {
                cur = soft.text;
                changed = true;
                flags.push('repeat');
            }
        }

        const edge = stripEdgeCommas(cur);
        if (edge.changed) {
            cur = edge.text;
            changed = true;
            flags.push('edge_comma');
        }

        if (stages) {
            stages.afterPolish = cur;
            stages.afterDomain = cur;
            stages.afterFluency = cur;
            stages.afterRecover = cur;
            stages.final = cur;
            return { text: cur, changed, flags, stages };
        }
        return { text: cur, changed, flags };
    }

    /**
     * Bucket 成片目标语 for intl delivery gates: zh | en | ja | ko.
     */
    function intlTargetBucket(targetLang = '') {
        try {
            if (targetLangCore?.normalizeSubtitleTargetLang) {
                const n = targetLangCore.normalizeSubtitleTargetLang(targetLang)
                    || targetLangCore.resolveSubtitleTargetLang?.({
                        subtitleTargetLang: targetLang,
                        targetLang,
                    });
                if (n) {
                    if (targetLangCore.isZhSubtitleTarget?.(n)) return 'zh';
                    if (n === 'en' || String(n).startsWith('en')) return 'en';
                    if (n === 'ja') return 'ja';
                    if (n === 'ko') return 'ko';
                }
            }
        } catch { /* fall through */ }
        const lang = String(targetLang || '').toLowerCase();
        if (!lang || lang.startsWith('zh') || /hans|hant|chinese|中文/.test(lang)) return 'zh';
        if (lang === 'ja' || lang.startsWith('ja') || /日本語|japanese/.test(lang)) return 'ja';
        if (lang === 'ko' || lang.startsWith('ko') || /한국어|korean/.test(lang)) return 'ko';
        if (lang === 'en' || lang.startsWith('en') || lang === 'english') return 'en';
        return 'en';
    }

    /**
     * Wrong-script / Chinese refill on non-zh 成片 (model fell back to Chinese).
     * - en / ko: any Han
     * - ja: Chinese discourse / pure-Han without kana (kanji+kana JA kept)
     */
    function looksLikeHanLeakForIntlTarget(text, targetLang = '') {
        const t = String(text || '').trim();
        if (!t) return false;
        const bucket = intlTargetBucket(targetLang);
        if (bucket === 'zh') return false;

        const han = (t.match(/[\u4e00-\u9fff]/g) || []).length;
        if (han < 1) return false;
        const kana = (t.match(/[\u3040-\u30ff]/g) || []).length;
        const hangul = (t.match(/[\uac00-\ud7af]/g) || []).length;
        const latin = (t.match(/[A-Za-z]/g) || []).length;

        if (bucket === 'en') return true;
        if (bucket === 'ko') {
            // Any Han on Korean 成片 is Chinese refill / mix — scrub Hangul-only.
            return true;
        }
        if (bucket === 'ja') {
            if (kana >= 1) return false;
            if (/[的了吗呢吧嘛啦哟呗]/u.test(t)) return true;
            if (/^(?:不|不行|好的|但是|什么|为什么|老师|前辈|嗯+|啊+|喂|呵呵|拜托了|别走)/u.test(t)) {
                return true;
            }
            if (han >= 4 && hangul === 0) return true;
            if (
                han >= 1
                && latin === 0
                && hangul === 0
                && Array.from(t.replace(/\s/g, '')).length <= 8
                && /^(?:不行|好的|但是|什么|老师|前辈|嗯嗯|呵呵)/u.test(t)
            ) {
                return true;
            }
            return false;
        }
        return true;
    }

    /** OCR / MT site·studio watermark fragments (public brand tokens, not dialogue). */
    const LATIN_SITE_BRAND_RE = /(?:japan|jav|caribbean|heyzo|prestige|moodyz|fc2|dmm|xvideos|pornhub|onlyfans|fansly|spankbang|xhamster|avgle|javlibrary|javdb|missav|supjav|jable|njav|flatjapan|tokyohot|1pondo|carib|pacopacomama|kin8|sodcreate|ideapocket|s1no|wanz|madonna|adult|xxx|nsfw)/i;
    const DOMAIN_OR_URL_TOKEN_RE = /(?:https?:\/\/|www\.)[^\s\]）)]+|\b[a-z0-9][a-z0-9.-]{1,80}\.(?:com|net|org|cc|tv|jp|co(?:\.[a-z]{2})?)\b/i;
    const DOMAIN_OR_URL_GLOBAL_RE = /(?:https?:\/\/|www\.)[^\s\]）)]+|\b[a-z0-9][a-z0-9.-]{1,80}\.(?:com|net|org|cc|tv|jp|co(?:\.[a-z]{2})?)\b/gi;

    /** Keep real domains / URLs on KO/JA 成片 (user-requested). */
    function isKeptDomainOrUrlToken(token = '') {
        const raw = String(token || '').trim();
        if (!raw) return false;
        return DOMAIN_OR_URL_TOKEN_RE.test(raw);
    }

    function stripDomainsAndUrls(text = '') {
        return String(text || '').replace(DOMAIN_OR_URL_GLOBAL_RE, ' ');
    }

    function isPrimarilyDomainOrUrlCue(text = '') {
        const t = String(text || '').trim();
        if (!t || !DOMAIN_OR_URL_TOKEN_RE.test(t)) return false;
        const rest = stripDomainsAndUrls(t)
            .replace(/[\s[\]（）()【】./:_\-—~～]+/g, '')
            .trim();
        return !rest;
    }

    function looksLikeLatinBrandOrSiteToken(token = '') {
        const raw = String(token || '').trim();
        if (!raw) return false;
        // Domains / URLs are preserved — never treat as watermark scrap.
        if (isKeptDomainOrUrlToken(raw)) return false;
        const w = raw.replace(/[^A-Za-z]/g, '');
        if (w.length < 6) return false;
        const lower = w.toLowerCase();
        if (isCommonEnglishParticle(lower)) return false;
        if (LATIN_SITE_BRAND_RE.test(lower)) return true;
        // camelCase mash (FlatJapan) or long lowercase glue (flatjapan)
        if (/[a-z][A-Z]/.test(w) && w.length >= 8) return true;
        if (/^[a-z]{8,28}$/.test(lower)) return true;
        return false;
    }

    function looksLikeLatinBrandPhrase(text = '') {
        const t = String(text || '').trim();
        if (!t) return false;
        // Scan brand marks with domains removed so flatjapan.com does not become flatjapancom.
        const scan = stripDomainsAndUrls(t).trim();
        if (!scan) return false;
        const words = latinWordTokens(scan);
        if (!words.length) return false;
        if (words.some((w) => looksLikeLatinBrandOrSiteToken(w))) return true;
        if (words.length >= 2) {
            const joined = words.join('').toLowerCase();
            if (LATIN_SITE_BRAND_RE.test(joined)) return true;
            // Spaced studio marks: "Flat Japan" / "Tokyo Hot"
            if (
                words.every((w) => !isCommonEnglishParticle(w))
                && joined.length >= 8
                && /(?:japan|jav|hot|tube|channel|studio|official|video)/i.test(joined)
            ) {
                return true;
            }
        }
        return false;
    }

    function sourceHasProtectiveLatin(sourceText = '') {
        const src = String(sourceText || '');
        // Real bilingual JA already carrying Latin loanwords / brand → keep target Latin.
        return /[A-Za-z]{3,}/.test(src);
    }

    /**
     * Latin studio watermark leak on KO/JA 成片 (not EN dialogue).
     * Examples: flatjapan, Flat Japan, "응 flatjapan".
     * Domains / URLs (flatjapan.com, www.… ) are kept.
     */
    function looksLikeLatinLeakForIntlTarget(text, targetLang = '', sourceText = '') {
        const t = String(text || '').trim();
        if (!t) return false;
        const bucket = intlTargetBucket(targetLang);
        if (bucket !== 'ko' && bucket !== 'ja') return false;
        if (sourceHasProtectiveLatin(sourceText)) return false;
        if (isPrimarilyDomainOrUrlCue(t)) return false;

        const brandScan = stripDomainsAndUrls(t).trim();
        if (!brandScan) return false;
        if (!/[A-Za-z]{4,}/.test(brandScan)) return false;

        const hangul = (brandScan.match(/[\uac00-\ud7af]/g) || []).length;
        const kana = (brandScan.match(/[\u3040-\u30ff]/g) || []).length;
        const han = (brandScan.match(/[\u4e00-\u9fff]/g) || []).length;
        const latin = (brandScan.match(/[A-Za-z]/g) || []).length;

        if (looksLikeLatinBrandPhrase(brandScan)) {
            // Pure watermark, or brand mixed into Hangul/kana line.
            if (bucket === 'ko') return hangul === 0 || latin >= 6;
            return (kana + han) === 0 || latin >= 6;
        }

        // Pure Latin line on KO/JA with no source Latin — not Korean/Japanese dialogue.
        if (bucket === 'ko' && hangul === 0 && kana === 0 && han === 0 && latin >= 6) {
            const words = latinWordTokens(brandScan);
            if (!words.length) return false;
            if (words.every((w) => isCommonEnglishParticle(w))) return false;
            if (words.length === 1 && words[0].length >= 6) return true;
            if (words.length >= 2 && words.every((w) => !isCommonEnglishParticle(w))) return true;
        }
        if (bucket === 'ja' && kana === 0 && han === 0 && hangul === 0 && latin >= 6) {
            const words = latinWordTokens(brandScan);
            if (!words.length) return false;
            if (words.every((w) => isCommonEnglishParticle(w))) return false;
            if (words.length === 1 && words[0].length >= 6) return true;
            if (words.length >= 2 && words.every((w) => !isCommonEnglishParticle(w))) return true;
        }
        return false;
    }

    /**
     * Strip Latin studio watermarks from KO/JA 成片; keep domains/URLs; blank if nothing left.
     */
    function scrubLatinLeakForIntlTarget(text, targetLang = '', sourceText = '') {
        const raw = String(text || '');
        if (!looksLikeLatinLeakForIntlTarget(raw, targetLang, sourceText)) {
            return { text: raw, changed: false };
        }
        const bucket = intlTargetBucket(targetLang);

        // Protect domains / URLs, scrub brand scraps, then restore.
        const kept = [];
        let next = raw.replace(DOMAIN_OR_URL_GLOBAL_RE, (m) => {
            const key = `__DOM${kept.length}__`;
            kept.push(m);
            return ` ${key} `;
        });

        const hangul = (next.match(/[\uac00-\ud7af]/g) || []).length;
        const kana = (next.match(/[\u3040-\u30ff]/g) || []).length;
        const han = (next.match(/[\u4e00-\u9fff]/g) || []).length;
        const hasDom = kept.length > 0;

        if (bucket === 'ko' && hangul === 0 && !hasDom) {
            return { text: '', changed: true };
        }
        if (bucket === 'ja' && kana === 0 && han === 0 && !hasDom) {
            return { text: '', changed: true };
        }

        next = next.replace(/\b[A-Za-z][A-Za-z0-9._-]{5,}\b/g, (m) => {
            if (/^__DOM\d+__$/.test(m)) return m;
            return looksLikeLatinBrandOrSiteToken(m) ? ' ' : m;
        });

        // Spaced studio marks left behind (Flat Japan)
        const words = latinWordTokens(next.replace(/__DOM\d+__/g, ' '));
        if (words.length >= 2 && looksLikeLatinBrandPhrase(words.join(' '))) {
            for (const w of words) {
                if (!isCommonEnglishParticle(w)) {
                    next = next.replace(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), ' ');
                }
            }
        }

        for (let i = 0; i < kept.length; i += 1) {
            next = next.replace(`__DOM${i}__`, kept[i]);
        }

        next = next
            .replace(/\s{2,}/g, ' ')
            .replace(/^[\s,，.。!！?？;；:：\-—…·•]+|[\s,，.。!！?？;；:：\-—…·•]+$/g, '')
            .trim();

        if (bucket === 'ko' && !/[\uac00-\ud7af]/.test(next) && !DOMAIN_OR_URL_TOKEN_RE.test(next)) {
            return { text: '', changed: true };
        }
        if (bucket === 'ja'
            && !/[\u3040-\u30ff\u4e00-\u9fff]/.test(next)
            && !DOMAIN_OR_URL_TOKEN_RE.test(next)) {
            return { text: '', changed: true };
        }
        return { text: next, changed: next !== raw.trim() };
    }

    /**
     * Strip model list-index wrappers that leak into cue text on line-aligned EN MT.
     * Examples: `1 "Hello"`, `3 Don't drink`, `**2 **`, `**1 ** "Hi"`.
     */
    function stripNumberedListMtArtifact(text) {
        const raw = String(text ?? '').trim();
        if (!raw) return { text: '', changed: false };
        let t = raw;

        // Pure markdown / bold index markers → blank
        if (/^\*{1,2}\s*\d{1,4}\s*\*{0,2}\s*$/.test(t)) {
            return { text: '', changed: true };
        }

        // **12 ** optional quoted/plain body
        t = t.replace(/^\*{1,2}\s*\d{1,4}\s*\*{0,2}\s*/, '');

        // 1. / 1) / 1: / 1、 body
        t = t.replace(/^\d{1,4}\s*[.)\]:：、]\s*/, '');

        // 1 "body" / 1 "body (unclosed ok)
        let m = t.match(/^\d{1,4}\s+[\"“「『]([\s\S]*?)(?:[\"”」』]\s*)?$/);
        if (m) {
            t = String(m[1] || '').trim();
        } else {
            m = t.match(/^(\d{1,2})\s+(.+)$/);
            if (m) {
                const n = Number(m[1]);
                const rest = String(m[2] || '').trim();
                // Batch indexes are almost always 1–40; keep years / tallies alone.
                if (
                    Number.isInteger(n)
                    && n >= 1
                    && n <= 40
                    && rest
                    && !/^\d{3,}$/.test(rest)
                ) {
                    t = rest;
                }
            }
        }

        t = t.replace(/^[\"“「『]+|[\"”」』]+$/g, '').trim();
        if (/^\d{1,4}$/.test(t)) t = '';
        return { text: t, changed: t !== raw };
    }

    /**
     * Chatty MT preambles the model dumps instead of dialogue (EN/KO/JA).
     */
    function looksLikeEnMtMetaLeak(text) {
        const t = String(text || '').trim();
        if (!t || t.length < 10) return false;
        // English
        if (/\btranslates?\b|\btranslating\b|\btranslated\b|\btranslation\b/i.test(t)) {
            if (/into\s+english/i.test(t)) return true;
            if (/(?:japanese|ja)\s+(?:text|dialogue|subtitles?|lines?)/i.test(t)) return true;
            if (/provided\s+japanese|given\s+japanese/i.test(t)) return true;
            if (/let'?s\s+translate|i(?:'ll| will)\s+translate/i.test(t)) return true;
            if (/sure[,!]?\s+(?:here|i(?:'ll| will))/i.test(t)) return true;
            if (/^(?:okay|ok|alright|right)[,!]?\s+let'?s\b/i.test(t)) return true;
            if (/here(?:'s| is)\s+the\s+translation/i.test(t)) return true;
            if (/natural\s+spoken\s+(?:style|english)/i.test(t)) return true;
            if (/keeping\s+the\s+natural/i.test(t)) return true;
            if (/line\s+by\s+line/i.test(t)) return true;
            if (/for\s+each\s+line/i.test(t)) return true;
            if (/^i(?:'m| am)\s+not\s+going\s+to\s+translate\b/i.test(t)) return true;
            if (/\b\d+\s+lines?\b/i.test(t) && /transl/i.test(t)) return true;
        }
        // Korean
        if (/번역|번역할|번역하|영어로\s*번역|자막을\s*번역/u.test(t)) {
            if (/일본어|일본\s*텍스트|다음\s*줄|각\s*줄|자연스러운/u.test(t)) return true;
            if (/^네[,.]?\s*|알겠습니다|다음과\s*같이/u.test(t) && t.length >= 12) return true;
            if (t.length >= 16) return true;
        }
        // Japanese (meta about translating, not dialogue)
        if (/翻訳し|英訳|訳します|以下を翻訳|各行を翻訳|字幕を翻訳/u.test(t)) {
            if (/日本語|英語|自然な|口語/u.test(t) || t.length >= 16) return true;
        }
        // Chinese meta (should not appear on intl anyway)
        if (/将下面|翻译成|只输出译文|本块共\s*\d+\s*条/.test(t) && /翻译|译文/.test(t)) {
            return true;
        }
        return false;
    }

    /**
     * Final intl delivery tidy: drop list indexes, MT meta, wrong-script Chinese,
     * and KO/JA Latin site watermarks.
     */
    function finalizeIntlMtDeliveryText(text, targetLang = 'en', sourceText = '') {
        const raw = String(text ?? '');
        let cur = raw;
        let changed = false;
        const ctrl = stripLlmControlTokens(cur);
        if (ctrl.changed) {
            cur = ctrl.text;
            changed = true;
        }
        if (looksLikeLlmControlLine(cur)) {
            return { text: '', changed: true };
        }
        const numbered = stripNumberedListMtArtifact(cur);
        if (numbered.changed) {
            cur = numbered.text;
            changed = true;
        }
        if (looksLikeEnMtMetaLeak(cur) || looksLikePromptLeak(cur)) {
            return { text: '', changed: true };
        }
        if (looksLikeHanLeakForIntlTarget(cur, targetLang)) {
            const scrub = scrubHanLeakForIntlTarget(cur, targetLang);
            cur = scrub.text;
            changed = true;
        }
        if (looksLikeLatinLeakForIntlTarget(cur, targetLang, sourceText)) {
            const scrub = scrubLatinLeakForIntlTarget(cur, targetLang, sourceText);
            cur = scrub.text;
            changed = true;
        }
        if (/^\d{1,4}$/.test(String(cur || '').trim())) {
            return { text: '', changed: true };
        }
        return { text: cur, changed: changed || cur !== raw };
    }

    /**
     * Last-resort intl scrub: remove wrong-script chars; blank if nothing usable left.
     */
    function scrubHanLeakForIntlTarget(text, targetLang = '') {
        const t = String(text || '');
        if (!looksLikeHanLeakForIntlTarget(t, targetLang)) {
            return { text: t, changed: false };
        }
        const bucket = intlTargetBucket(targetLang);
        if (bucket === 'ja') {
            return { text: '', changed: true };
        }
        const stripped = t
            .replace(/[\u4e00-\u9fff]+/g, ' ')
            .replace(/[，。！？、；：""''（）【】《》]/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .replace(/^[\s,，.。!！?？;；:：\-—…·•]+|[\s,，.。!！?？;；:：\-—…·•]+$/g, '')
            .trim();
        if (bucket === 'ko') {
            if (!stripped || (!/[\uac00-\ud7af]/.test(stripped) && !/[A-Za-z]{2,}/.test(stripped))) {
                return { text: '', changed: true };
            }
            return { text: stripped, changed: stripped !== t.trim() };
        }
        if (!stripped || !/[A-Za-z]{2,}/.test(stripped)) {
            return { text: '', changed: true };
        }
        return { text: stripped, changed: stripped !== t.trim() };
    }

    /**
     * Sanitize one MT cue text against its source.
     * @param {string} text
     * @param {string} [sourceText]
     * @param {object} [options]
     * @returns {{ text: string, changed: boolean, flags: string[] }}
     */
    function sanitizeMtCueText(text, sourceText = '', options = {}) {
        const flags = [];
        const stages = options.captureStages ? {} : null;
        let cur = String(text ?? '');
        let changed = false;

        // Never mutate software-credit lines (Transub / Pro watermark).
        // Credit+dialogue packed cues (MFYD-182: credit\\n女性们…) must peel dialogue first.
        try {
            const creditCore = (typeof module !== 'undefined' && module.exports)
                ? require('./subtitle-software-credit-core')
                : (typeof globalThis !== 'undefined' ? globalThis.TransubSubtitleSoftwareCredit : null);
            const splitPacked = creditCore?.splitSoftwareCreditAndDialogue?.(cur);
            if (splitPacked?.creditText && splitPacked?.dialogueText) {
                const dlg = sanitizeMtCueText(splitPacked.dialogueText, sourceText, {
                    ...options,
                    captureStages: false,
                });
                const dlgText = String(dlg.text || '').trim();
                const inventDlg = !dlgText
                    || dlgText === '…'
                    || looksLikeWomenAudiencePitchInvent(dlgText, sourceText)
                    || looksLikeLectureSceneBleed(dlgText, sourceText)
                    || looksLikeBookBlurbInvent(dlgText, sourceText)
                    || looksLikeAdultRegisterInvented(dlgText, sourceText)
                    || looksLikeCrossCuePlotBleed(dlgText, sourceText)
                    || looksLikeStockGlossMisattach(dlgText, sourceText);
                const next = inventDlg
                    ? splitPacked.creditText
                    : `${splitPacked.creditText}\n${dlgText}`;
                const mergedFlags = ['software_credit_split', ...(dlg.flags || [])];
                if (inventDlg) mergedFlags.push('credit_dialogue_invent');
                return {
                    text: next,
                    changed: next !== String(text ?? '') || !!dlg.changed,
                    flags: mergedFlags,
                };
            }
            if (creditCore?.isSoftwareCreditText?.(cur) || (creditCore?.normalizeSoftwareCreditText && /字幕由/.test(cur) && /Transub/i.test(cur))) {
                const normalized = creditCore.normalizeSoftwareCreditText
                    ? creditCore.normalizeSoftwareCreditText(cur, { isPro: /Pro/i.test(cur) })
                    : cur;
                if (stages) {
                    stages.afterPolish = normalized;
                    stages.afterDomain = normalized;
                    stages.afterFluency = normalized;
                    stages.afterRecover = normalized;
                    stages.final = normalized;
                    return {
                        text: normalized,
                        changed: normalized !== String(text ?? ''),
                        flags: normalized !== String(text ?? '') ? ['software_credit'] : [],
                        stages,
                    };
                }
                return {
                    text: normalized,
                    changed: normalized !== String(text ?? ''),
                    flags: normalized !== String(text ?? '') ? ['software_credit'] : [],
                };
            }
        } catch { /* optional */ }

        const layers = targetLangCore?.resolveSanitizeLayers
            ? targetLangCore.resolveSanitizeLayers(options)
            : {
                lang: 'zh-Hans',
                zhDeep: true,
                jaSourceFix: true,
                stripArtifacts: true,
                nameUnify: true,
                lightFluency: true,
                zhWetSfx: true,
                zhPolish: true,
                zhDomain: true,
                zhNsfwLexicon: true,
                zhBlankRecover: true,
                zhHonorific: true,
                zhTrainedRemap: true,
            };
        const cueOptions = {
            ...options,
            targetLang: layers.lang,
            subtitleTargetLang: layers.lang,
            _sanitizeLayers: layers,
        };

        // Non-Chinese 成片: light QA only (do not run ZH opaque / domain / blank-recover).
        if (layers.zhDeep === false) {
            return sanitizeMtCueTextLight(text, sourceText, cueOptions, layers);
        }

        const loopStrippedSourceRaw = options.loopStrippedSource != null
            ? String(options.loopStrippedSource)
            : (jaNames?.stripAsrHallucinationLoops
                ? jaNames.stripAsrHallucinationLoops(sourceText).text
                : String(sourceText || ''));
        // Single-cue path must ASR-fix JA before invent / domain (batch path already does).
        let loopStrippedSource = loopStrippedSourceRaw;
        if (options.skipJaAsrDomain !== true && options._sanitizeLayers?.jaSourceFix !== false) {
            const asrFixed = correctJaAsrDomainMishears(loopStrippedSourceRaw);
            if (asrFixed.changed) {
                loopStrippedSource = asrFixed.text;
                flags.push('ja_asr_domain');
            }
        }
        const justifyOpts = { loopStrippedSource };
        const cueOpts = { ...cueOptions, justifyOpts };

        // av_soft: drop wet/suck oral SFX (咕咚/啾…); keep moans (哈/啊/嗯)
        let senseSource = String(loopStrippedSource || sourceText || '');
        if (isAvSoftContext(options) && options.stripWetOralSfx !== false) {
            const wetJa = stripWetOralSfxFromJa(senseSource);
            if (wetJa.changed) {
                senseSource = wetJa.text;
                flags.push('wet_sfx_ja');
            }
            const wetZh = stripWetOralSfxFromZh(cur);
            if (wetZh.changed) {
                cur = wetZh.text;
                changed = true;
                flags.push('wet_sfx');
            }
            // Pure wet-SFX source → blank ZH (do not recover as 咕啾)
            if (!String(senseSource || '').trim() && String(sourceText || '').trim()) {
                cur = '';
                changed = true;
                if (!flags.includes('wet_sfx')) flags.push('wet_sfx');
            }
            // Wet/shio JA → Latin mash / 湿哦 / 吸吧 phonetic halluc (opening BGM false ASR)
            if (
                String(sourceText || '').trim()
                && (isWetOralSfxOnlyJa(sourceText) || isShioHitSfxOnlyJa(sourceText))
                && (
                    /[A-Za-z]{3,}/.test(cur)
                    || (/湿[哦喔噢奥]?/.test(cur) && !/潮|吹|出水/.test(cur))
                    || /^(?:吸吧+|吧吧)[…。．.!！?\s]*$/u.test(cur.trim())
                )
            ) {
                cur = '';
                changed = true;
                if (!flags.includes('wet_sfx')) flags.push('wet_sfx');
                senseSource = '';
            }
            // Whisper/MT Latin scraps mixed into moan/dialogue ZH (any JA).
            if (lexicon?.latinSfxMixRe) {
                const stripped = lexicon.stripLatinSfxMixZh(cur);
                if (stripped.changed) {
                    cur = stripped.text;
                    changed = true;
                    flags.push('latin_garbage');
                }
            } else if (/\b(?:bump|gross|Boeh|aki|Yuk|fuck|sov)\b/i.test(cur)) {
                // Fallback if lexicon failed to load
                cur = cur.replace(/\b(?:bump|gross|Boeh|aki|Yuk(?:yuk|yo)?|fuck|sov)\b/gi, '').replace(/\s{2,}/g, ' ').trim();
                changed = true;
                flags.push('latin_garbage');
            }
            // English lemma leaks in mixed CJK / kana (already / everyone / darling…)
            if (/[\u4e00-\u9fff\u3040-\u30ff]/.test(cur)) {
                let lemma = cur;
                const srcForLemma = String(sourceText || '');
                if (/\balready\b/i.test(lemma)) {
                    lemma = lemma.replace(/\s*\balready\b\s*/gi, '已经');
                }
                if (/\beveryone\b/i.test(lemma)) {
                    lemma = lemma.replace(/\s*\beveryone\b\s*/gi, '大家');
                }
                if (/\bimpressive\b/i.test(lemma)) {
                    lemma = lemma.replace(/\s*\bimpressive\b\s*/gi, '令人佩服');
                }
                if (/\bbedroom\b/i.test(lemma)) {
                    lemma = lemma.replace(/\s*\bbedroom\b\s*/gi, '房间');
                }
                if (/\bbetter\b/i.test(lemma)) {
                    lemma = lemma.replace(/\s*\bbetter\b\s*/gi, '更好');
                }
                if (/\bpretty\b/i.test(lemma)) {
                    lemma = lemma.replace(/\s*\bpretty\b\s*/gi, '挺');
                }
                if (/\bsenpai\b/i.test(lemma)) {
                    lemma = lemma.replace(/\s*\bsenpai\b\s*/gi, '前辈');
                }
                if (/\bmore\b/i.test(lemma) && /もっと/.test(srcForLemma)) {
                    lemma = lemma.replace(/\s*\bmore\b\s*/gi, '再');
                }
                if (/\bstuff\b/i.test(lemma)) {
                    lemma = lemma.replace(/\s*\bstuff\b\s*/gi, '东西');
                }
                if (/\bpiranha\b/i.test(lemma) && /ピラニア|ピラーニャ/.test(srcForLemma)) {
                    lemma = lemma.replace(/\s*\bpiranha\b\s*/gi, '食人鱼');
                }
                // Remap justified Latin lemmas before scrap-stripping (kun/Guam)
                if (/\bkun\b/i.test(lemma) && /くん|君/.test(srcForLemma)) {
                    lemma = lemma
                        .replace(/加个\s*kun/gi, '加「君」')
                        .replace(/\s*\bkun\b\s*/gi, '「君」');
                }
                if (/\bguam\b/i.test(lemma) && /グア|グアム/.test(srcForLemma)) {
                    lemma = lemma.replace(/\s*\bguam\b\s*/gi, '关岛');
                }
                if (/\bdarling\b/i.test(lemma) && /ダーリン|だーりん/.test(srcForLemma)) {
                    lemma = lemma
                        .replace(/\s*\bdarling\b\s*/gi, '亲爱的')
                        .replace(/亲爱的[\sんンー]*$/u, '亲爱的');
                }
                if (/\bshow\b/i.test(lemma) && /見せて|見せる|見せてよ/.test(srcForLemma)) {
                    lemma = lemma.replace(/\s*\bshow\b\s*/gi, '给我看');
                }
                // Trailing / mid unjustified Latin scrap when JA has no Latin (iorene / pepinche / musan…)
                // Keep romanized given names justified by kana (ゆり→Yuri).
                if (!/[A-Za-z]{3,}/.test(srcForLemma)) {
                    const shields = [];
                    let shielded = lemma;
                    if (/\byuri\b/i.test(shielded) && /ゆり|ユリ/.test(srcForLemma)) {
                        shielded = shielded.replace(/\bYuri\b/g, () => {
                            shields.push('Yuri');
                            return `\uE010${shields.length - 1}\uE011`;
                        }).replace(/\byuri\b/gi, () => {
                            shields.push('Yuri');
                            return `\uE010${shields.length - 1}\uE011`;
                        });
                    }
                    let stripped = shielded
                        .replace(/^(?:[A-Za-zÀ-ɏ]{2,16}(?:\s+[A-Za-zÀ-ɏ]{1,16}){0,4})\s+(?=[\u4e00-\u9fff])/u, '')
                        .replace(/([\u4e00-\u9fff]+)[A-Za-zÀ-ɏ]{3,}(?=[\s，,？?！!。．.…]|$)/gu, '$1')
                        .replace(/(?:^|[\s，,])([A-Za-zÀ-ɏ][A-Za-zÀ-ɏ'’\-.]{2,24})(?=[\s，,？?！!。．.…]*$)/gu, '')
                        .replace(/\s+([A-Za-zÀ-ɏ][A-Za-zÀ-ɏ'’\-.]{3,24})(?=[\s？?！!。．.]|$)/gu, ' ')
                        .replace(/\s+([？?！!])/g, '$1')
                        .replace(/([？?！!。．])\1+/g, '$1')
                        .replace(/\s{2,}/g, ' ')
                        .trim();
                    stripped = stripped.replace(/\uE010(\d+)\uE011/g, (_, i) => shields[Number(i)] || '');
                    if (stripped !== lemma) lemma = stripped;
                }
                if (lemma !== cur) {
                    cur = lemma.replace(/\s{2,}/g, ' ').trim();
                    changed = true;
                    flags.push('latin_garbage');
                }
            }
            // Short pain scrap あいぐっ →「啊衣gross」leftover
            if (/^あいぐっ[!！?？…\s]*$/u.test(String(sourceText || '').trim()) && /gross|衣/i.test(cur)) {
                cur = '啊';
                changed = true;
                flags.push('truncated_reactive');
            }
        }

        const orphanStuck = polishOrphanStuckZh(cur, senseSource);
        if (orphanStuck.changed) {
            cur = orphanStuck.text;
            changed = true;
            flags.push('orphan_stuck_zh');
        }

        const buyaoGlue = stripUnjustifiedBuyaoGlue(cur, senseSource);
        if (buyaoGlue.changed) {
            cur = buyaoGlue.text;
            changed = true;
            flags.push('buyao_glue');
        }

        // LLM polish sometimes leaves「旧 -> 新」
        try {
            const smartCore = (typeof module !== 'undefined' && module.exports)
                ? require('./subtitle-qc-smart-core')
                : (typeof globalThis !== 'undefined' ? globalThis.TransubSubtitleQcSmart : null);
            if (smartCore?.collapseArrowEditArtifact) {
                const arrow = smartCore.collapseArrowEditArtifact(cur);
                if (arrow.changed) {
                    cur = arrow.text;
                    changed = true;
                    flags.push('arrow_edit');
                }
            }
        } catch { /* optional */ }

        const wetPolarity = repairWetPolarityZh(cur, senseSource);
        if (wetPolarity.changed) {
            cur = wetPolarity.text;
            changed = true;
            flags.push('wet_polarity');
        }

        const truncReact = polishTruncatedReactiveZh(cur, senseSource);
        if (truncReact.changed) {
            cur = truncReact.text;
            changed = true;
            flags.push('truncated_reactive');
        }
        if (stages) stages.afterPolish = cur;

        const stripped = stripMtArtifacts(cur);
        if (stripped.changed) {
            cur = stripped.text;
            changed = true;
            if (stripped.glossHit) flags.push('gloss');
        }

        // EYAN stuck gloss fragment「的好烫」/「好烫的好烫」/ glued「…好烫」pasted across cues
        {
            const beforeHot = cur;
            let hot = String(cur || '');
            const jaHasHeat = /熱[いっ]|あち[いっ]|熱っ|熱く|熱い/.test(String(senseSource || ''));
            if (/的好烫|好烫的好烫|啊啊好烫|好烫的/.test(hot)
                || (/好烫/.test(hot) && !jaHasHeat && hot !== '好烫')) {
                hot = hot
                    .replace(/好烫的好烫/g, '')
                    .replace(/啊啊好烫/g, '')
                    .replace(/好烫的/g, '')
                    .replace(/的好烫/g, '')
                    .replace(/好烫/g, '')
                    .replace(/[，,\s]{2,}/g, ' ')
                    .replace(/^[，,\s…·.]+|[，,\s…·.]+$/g, '')
                    .trim();
                if (!hot) hot = '…';
                if (hot !== beforeHot) {
                    cur = hot;
                    changed = true;
                    flags.push('stuck_hot_gloss');
                }
            }
            // After peeling unjustified「好烫」, anatomy-only leftover is invent
            const jaMoanFill = /^(?:[んンぁあぅうぇえぉお]+[っッ]?[\s　]*)+$/.test(String(senseSource || '').trim())
                || (/(?:ほら|これだ|うんって)/.test(String(senseSource || ''))
                    && !/(?:まん|おまん|穴|ちん|チン|おっぱ|胸|尻|けつ|熱)/.test(String(senseSource || '')));
            if ((/好烫/.test(beforeHot) || jaMoanFill)
                && /^(?:小穴|肉棒|鸡巴|胸部|奶子|屁股)$/u.test(String(cur || '').trim())
                && !/(?:まん|おまん|穴|ちん|チン|おっぱ|胸|尻|けつ)/.test(String(senseSource || ''))) {
                cur = '…';
                changed = true;
                flags.push('stuck_hot_gloss');
            }
        }

        const leaked = stripPromptLeak(cur);
        if (leaked.changed) {
            cur = leaked.text;
            changed = true;
            flags.push('prompt_leak');
            // Tiny residual after prompt echo is usually another hallucination — blank for retry
            if (Array.from(String(cur).replace(/\s+/g, '')).length <= 2) {
                cur = '';
            }
        }

        // Failed MT / "保留原文" leak: Japanese source echoed as translation
        if (cur && looksLikeSourceEcho(cur, sourceText)) {
            cur = '';
            changed = true;
            flags.push('source_echo');
        }
        // Literal instruction leak (model refused and wrote the meta phrase).
        if (cur && /^(?:保留原文|保持原文|原文保留|Keep\s*original|leave\s*as[- ]?is)[。．.!！?？\s]*$/iu.test(String(cur).trim())) {
            cur = '';
            changed = true;
            flags.push('keep_original_leak');
        }
        // GalTransl / Sakura「保留『残片』」wrapper — unwrap; incomplete stubs blank for JA recover.
        if (cur) {
            const keepWrap = String(cur).trim().match(/^保留[「『"“](.+?)[」』"”]$/u);
            if (keepWrap) {
                const inner = String(keepWrap[1] || '').trim();
                const srcLen = textLen(dialogueTextForAlign(sourceText) || sourceText);
                // Inner much shorter than JA / looks truncated → blank for recoverBlankedAdultZh
                if (!inner || (srcLen >= 8 && textLen(inner) <= Math.max(3, Math.floor(srcLen * 0.45)))) {
                    cur = '…';
                } else {
                    cur = inner;
                }
                changed = true;
                flags.push('keep_quote_wrap_leak');
            }
        }

        // Reception / appointment JA: force mundane remap when ZH is blank or clearly wrong
        // (ご役→ご予約 ASR + 您是哪位 / 责任编辑 invent / 保留「…」unwrap residue).
        {
            const mundSrc = loopStrippedSource || sourceText;
            if (/ご予約の方|ご役の方|予約の.+です|担当の.+お呼び/.test(String(mundSrc || ''))) {
                const mund = remapMundaneHospitalOrMealJa(mundSrc);
                const badZh = /您是哪位|责任编辑|^保留[「『"“]|我叫作将/.test(String(cur || '').trim());
                if (mund && (isEllipsisOrEmptyZh(cur) || badZh)) {
                    cur = mund;
                    changed = true;
                    flags.push('reception_remap');
                }
            }
        }

        // Marketing「女性们…满足」pasted onto unrelated JA — blank before name passes
        // strip「女性们」alone and leave the pitch body (MFYD-182).
        if (cur && looksLikeWomenAudiencePitchInvent(cur, loopStrippedSource || sourceText)) {
            cur = '';
            changed = true;
            flags.push('women_pitch_invent');
        }

        // Lecture / medical JA got practice-scene or CTA ZH (MFYD-182 section bleed).
        if (cur && looksLikeLectureSceneBleed(cur, loopStrippedSource || sourceText)) {
            cur = '';
            changed = true;
            flags.push('lecture_scene_bleed');
        }

        // Book-blurb invent onto non-book JA (MFYD-182 opening).
        if (cur && looksLikeBookBlurbInvent(cur, loopStrippedSource || sourceText)) {
            cur = '';
            changed = true;
            flags.push('book_blurb_invent');
        }

        // Hormone 出る misread as ejaculation.
        if (cur && looksLikeHormoneSecreteAsEjacInvent(cur, loopStrippedSource || sourceText)) {
            cur = '';
            changed = true;
            flags.push('hormone_secrete_ejac');
        }

        // Whisper debris JA must not keep invented ZH (re-sanitize + file postprocess).
        if (cur && looksLikeAsrGarbageJaInvent(cur, loopStrippedSource || sourceText)) {
            cur = '';
            changed = true;
            flags.push('asr_garbage_invent');
        }

        // 「大丈夫？」→ manly/blessing「真是个大丈夫的早晨」homograph invent
        if (cur && looksLikeDaijoubuSenseMisattach(cur, loopStrippedSource || sourceText)) {
            const remapped = remapZhFromJaSimple(loopStrippedSource || sourceText);
            cur = (remapped != null && shortRemapAdequateForJa(remapped, loopStrippedSource || sourceText))
                ? remapped
                : '';
            changed = true;
            flags.push('daijoubu_sense_misattach');
        }

        // Opening / reactive JA buried under multi-stock ZH collage
        if (cur && looksLikeMultiStockGlueInvent(cur, loopStrippedSource || sourceText)) {
            const remapped = remapZhFromJaSimple(loopStrippedSource || sourceText);
            cur = (remapped != null && shortRemapAdequateForJa(remapped, loopStrippedSource || sourceText))
                ? remapped
                : '';
            changed = true;
            flags.push('multi_stock_glue');
        }

        const dash = stripKatakanaDashDebris(cur);
        if (dash.changed) {
            cur = dash.text;
            changed = true;
            flags.push('kana_dash');
        }

        const orphan = stripTrailingOrphanName(cur, sourceText, cueOpts);
        if (orphan.changed) {
            cur = orphan.text;
            changed = true;
            flags.push('orphan_name');
        }

        const pollution = stripUnjustifiedPollutionNames(cur, sourceText, cueOpts);
        if (pollution.changed) {
            cur = pollution.text;
            changed = true;
            flags.push('pollution_name');
        }

        const soleName = stripUnjustifiedSoleOrLeadingName(cur, loopStrippedSource || sourceText, cueOpts);
        if (soleName.changed) {
            cur = soleName.text;
            changed = true;
            flags.push('unjustified_name');
        }

        const nnName = repairNnHmmNamePlaceholder(cur, loopStrippedSource || sourceText);
        if (nnName.changed) {
            cur = nnName.text;
            changed = true;
            flags.push('nn_name_placeholder');
        }

        const otouName = repairOtousanInventedNameZh(cur, loopStrippedSource || sourceText);
        if (otouName.changed) {
            cur = otouName.text;
            changed = true;
            flags.push('otousan_name');
        }

        const deEcho = collapseDePhraseEchoes(cur);
        if (deEcho.changed) {
            cur = deEcho.text;
            changed = true;
            flags.push('de_phrase_echo');
        }

        const honorEcho = collapseHonorificEchoes(cur);
        if (honorEcho.changed) {
            cur = honorEcho.text;
            changed = true;
            flags.push('honorific_echo');
        }

        const namePrefix = stripSpuriousNamePrefixes(cur, loopStrippedSource || sourceText);
        if (namePrefix.changed) {
            cur = namePrefix.text;
            changed = true;
            flags.push('name_prefix');
        }

        const kinship = fixKinshipHonorificMistranslations(cur, loopStrippedSource || sourceText);
        if (kinship.changed) {
            cur = kinship.text;
            changed = true;
            flags.push('kinship');
        }

        // Stretch / joint「硬く」misread as erect「硬起来」(MILK gym opening).
        // Conversely soft-AV「固くなって」must not stay as「僵硬」(erect hardness).
        {
            const stiffSrc = String(loopStrippedSource || sourceText || '');
            const erectZh = OT.erectVerbZh || '硬起来';
            if (
                stiffSrc
                && /硬く|硬い/.test(stiffSrc)
                && !/固く/.test(stiffSrc)
                && !/(?:ちん|チン|おちん|ビンビン|ガチガチ|ここが硬|きちゃ)/.test(stiffSrc)
                && (String(cur).includes(erectZh) || /^硬起来了?[。．.…]*$/u.test(String(cur).trim()))
            ) {
                if (/関節|ストレッチ|筋トレ|硬くなり|硬いです/.test(stiffSrc) || textLen(stiffSrc) <= 8) {
                    const next = /ね[?？]?$|硬いね/.test(stiffSrc) ? '好硬啊' : '变僵硬了';
                    if (next !== cur) {
                        cur = next;
                        changed = true;
                        flags.push('stiff_not_erect');
                    }
                }
            }
            if (
                /固くなって|固くなってる/.test(stiffSrc)
                && !/関節|ストレッチ|声/.test(stiffSrc)
                && /僵硬/.test(String(cur))
            ) {
                const next = /めっちゃ|すごく|超/.test(stiffSrc) ? '变得好硬了' : '变硬了';
                if (next !== cur) {
                    cur = next;
                    changed = true;
                    flags.push('erect_not_stiff');
                }
            }
            if (/声[がか]たい|声かたい/.test(stiffSrc) && /僵硬/.test(String(cur))) {
                cur = '声音好硬…';
                changed = true;
                flags.push('voice_stiff');
            }
            if (
                /硬いじゃん|まだ硬い/.test(stiffSrc)
                && !/関節|ストレッチ/.test(stiffSrc)
                && /僵硬/.test(String(cur))
            ) {
                cur = '还是挺硬的啊';
                changed = true;
                flags.push('erect_not_stiff');
            }
        }

        // Gym check-in mistranslation leftover
        {
            const gymSrc = String(loopStrippedSource || sourceText || '');
            if (/ちゃんと/.test(gymSrc) && /やってますか|やってる/.test(gymSrc)) {
                const mund = remapMundaneHospitalOrMealJa(gymSrc);
                if (mund && (/好好干吗|在好好干/.test(String(cur)) || isEllipsisOrEmptyZh(cur))) {
                    cur = mund;
                    changed = true;
                    flags.push('gym_checkin_remap');
                }
            }
        }

        // げたって ASR / geta「鞋」hallucination (NHDTC-253) — soft-AV moan residue, not footwear
        {
            const gSrc = String(loopStrippedSource || sourceText || '');
            if (/^げたって/.test(gSrc) && (/鞋|木屐|下駄/.test(String(cur)) || isEllipsisOrEmptyZh(cur))) {
                cur = '出来了…';
                changed = true;
                flags.push('geta_shoe_hallucination');
            }
        }

        const nee = recoverNeeNeeGivenName(cur, loopStrippedSource || sourceText);
        if (nee.changed) {
            cur = nee.text;
            changed = true;
            flags.push('nee_name');
        }

        // Leftover NSFW kana in ZH when source had the same form (optional; AV paths enable)
        const wantNsfwLex = options.applyNsfwLexicon === true
            || options.sakuraNsfwPrompt === true
            || options.nsfwPrompt === true
            || options.smartTranslateFaithfulTone === true
            || options.faithfulTone === true
            || String(options.contentProfile || options.senseProfile || '').toLowerCase() === 'av_soft';
        if (wantNsfwLex && nsfwLex?.applyNsfwLexiconToText) {
            const lexed = nsfwLex.applyNsfwLexiconToText(cur, sourceText);
            if (lexed.changed) {
                cur = lexed.text;
                changed = true;
                flags.push('nsfw_lexicon');
            }
        }

        // Mens-esthe / soft-AV domain mistranslations (オイル→防晒油, posture hallucinations, …)
        const domain = correctZhDomainMistranslations(cur, loopStrippedSource || sourceText, {
            ...options,
            cueIndex: options.cueIndex,
            cueStartMs: options.cueStartMs,
        });
        if (domain.changed) {
            cur = domain.text;
            changed = true;
            for (const f of domain.flags) flags.push(f);
        }

        // Hospital / meal / greeting openings: replace soft-AV invent with lexical gloss
        {
            const mundane = repairMundaneJaMistranslation(cur, loopStrippedSource || sourceText);
            if (mundane.changed) {
                cur = mundane.text;
                changed = true;
                flags.push('mundane_ja_repair');
            }
        }
        if (stages) stages.afterDomain = cur;

        const sanHonor = normalizeZhHonorificFromJaSan(cur, loopStrippedSource || sourceText);
        if (sanHonor.changed) {
            cur = sanHonor.text;
            changed = true;
            flags.push('san_honorific');
        }

        // After domain/name fixes: drop leftover JA kana islands in Chinese
        const residualJa = stripResidualJaInZh(cur, loopStrippedSource || sourceText);
        if (residualJa.changed) {
            cur = residualJa.text;
            changed = true;
            flags.push('residual_ja');
        }
        if (cur && looksLikeJaZhMixedLeak(cur, loopStrippedSource || sourceText)) {
            cur = '';
            changed = true;
            if (!flags.includes('source_echo')) flags.push('source_echo');
        }

        // Dash cleanup again after orphan strip (e.g. "ー? … 汤米" → strip name → leftover ー)
        const dash2 = stripKatakanaDashDebris(cur);
        if (dash2.changed) {
            cur = dash2.text;
            changed = true;
            if (!flags.includes('kana_dash')) flags.push('kana_dash');
        }

        // Per-cue glossary/nameMap apply (batch-level unify runs in sanitizeMtCues)
        if (options.nameRules?.length) {
            const named = applyNameConsistency(cur, options.nameRules);
            if (named.changed) {
                cur = named.text;
                changed = true;
                flags.push('name_unify');
            }
        }

        if (fluency?.compressRepetitionInText) {
            const heavy = fluency.hasHeavyRepetition?.(cur)
                || (textLen(cur) > Math.max(40, textLen(sourceText) * 2.5));
            if (heavy || options.alwaysCompress) {
                const compressed = fluency.compressRepetitionInText(cur, {
                    minRepeats: Math.max(2, Number(options.minRepeats) || 3),
                    maxPhraseLen: Math.max(1, Number(options.maxPhraseLen) || 8),
                    addExclaim: options.addExclaim === true,
                    compressSingleChar: options.compressSingleChar !== false,
                });
                if (compressed.changed) {
                    cur = compressed.text;
                    changed = true;
                    flags.push('repeat');
                }
            }
        }
        // Always collapse exact soft doubles (会融化的，会融化的) — independent of heavy gate
        if (fluency?.collapseSoftDoublePhrase) {
            const soft = fluency.collapseSoftDoublePhrase(cur);
            if (soft.changed) {
                cur = soft.text;
                changed = true;
                if (!flags.includes('repeat')) flags.push('repeat');
            }
        }
        if (stages) stages.afterFluency = cur;

        const capped = capPathologicalLength(cur, sourceText, options);
        if (capped.changed) {
            cur = capped.text;
            changed = true;
            flags.push('length_cap');
        }

        // Prefer unstripped source for recovery when wet-SFX pass emptied senseSource
        // but the raw cue still has recoverable dialogue / chew / address content.
        // Do NOT fall back when wet-SFX intentionally blanked the sense (pure ちゅっ/ごくっ).
        const recoverSrc = String(senseSource || '').trim()
            || ((flags.includes('wet_sfx') || flags.includes('wet_sfx_ja'))
                ? ''
                : String(loopStrippedSource || sourceText || '').trim());

        // Model refused / echoed JA / wrote «…» / collapsed to filler stub → recover.
        // Skip when we just wiped a prompt-leak — do not invent a short gloss from JA.
        // source_echo over a short check-in JA (大丈夫?) must not refill 没事吧; full
        // adult JA echoed as ZH should still recover (先生とセックスしたい…).
        const skipEchoRecover = flags.includes('source_echo')
            && textLen(recoverSrc) <= 10
            && /^(?:大丈夫|平気|問題ない|ごめん|すみません)[ぁあ]?[。．.!！?？\s]*$/u.test(
                String(recoverSrc || '').trim(),
            );
        let blankAdult = (recoverSrc
            && !flags.includes('prompt_leak')
            && !skipEchoRecover)
            ? recoverBlankedAdultZh(cur, recoverSrc, options)
            : { text: cur, changed: false };
        if (blankAdult.changed) {
            cur = blankAdult.text;
            changed = true;
            flags.push('blank_adult_recover');
        }

        // After name/pollution passes: restore lexical residue kept in JA after wet-SFX strip
        if (
            isAvSoftContext(options)
            && /すごいよ/.test(recoverSrc)
            && /哈(?:啊|…)?/.test(cur)
            && !/厉害|好厉/.test(cur)
        ) {
            cur = `${String(cur).trim()}，好厉害`;
            changed = true;
            flags.push('wet_sfx_recover');
        }

        // Never leave a dialogue source with a totally empty ZH (engine/post may drop the cue).
        // Prefer short-JA / moan recovery one last time before «…» placeholder.
        if (!String(cur).trim() && recoverSrc
            && !flags.includes('prompt_leak')
            && !skipEchoRecover) {
            blankAdult = recoverBlankedAdultZh('', recoverSrc, options);
            if (blankAdult.changed && String(blankAdult.text || '').trim()) {
                cur = blankAdult.text;
                changed = true;
                flags.push('blank_adult_recover');
            } else {
                cur = '…';
                changed = true;
                flags.push('empty_placeholder');
            }
        } else if (!String(cur).trim() && (flags.includes('wet_sfx') || flags.includes('prompt_leak') || skipEchoRecover)) {
            // Pure wet-SFX JA → placeholder. Mixed short dialogue that wet-stripped to empty:
            // try lexical remap before forcing … (avoids blank-retry storms on moan+word cues).
            const rawSrc = String(loopStrippedSource || sourceText || '').trim();
            if (
                flags.includes('wet_sfx')
                && rawSrc
                && !(typeof isWetOralSfxOnlyJa === 'function' && isWetOralSfxOnlyJa(rawSrc))
                && !(typeof isShioHitSfxOnlyJa === 'function' && isShioHitSfxOnlyJa(rawSrc))
            ) {
                const remapped = remapZhFromJaSimple(rawSrc);
                if (remapped != null && shortRemapAdequateForJa(remapped, rawSrc)) {
                    cur = remapped;
                    changed = true;
                    flags.push('wet_sfx_recover');
                } else if (textLen(rawSrc) <= 8) {
                    // Keep empty rather than … only when we truly have nothing; short JA
                    // still gets … so the slot is visible, but skip invent wipe elsewhere.
                    cur = '…';
                    changed = true;
                    flags.push('empty_placeholder');
                } else {
                    cur = '…';
                    changed = true;
                    flags.push('empty_placeholder');
                }
            } else {
                cur = '…';
                changed = true;
                flags.push('empty_placeholder');
            }
        }
        if (stages) stages.afterRecover = cur;

        // Re-pin console-trained remaps after fluency / blank recovery so polish cannot undo them.
        {
            const pinned = applyTrainedZhRemaps(cur, recoverSrc || senseSource || sourceText, {
                pinFinalPass: true,
            });
            if (pinned.changed) {
                cur = pinned.text;
                changed = true;
                for (const f of pinned.flags) {
                    if (!flags.includes(f)) flags.push(f);
                }
            }
        }

        // Canonical breath moan: 哈啊 → 哈… (legacy MT / glossary residue)
        {
            const breath = normalizeBreathMoanZh(cur);
            if (breath.changed) {
                cur = breath.text;
                changed = true;
                flags.push('breath_moan');
            }
        }
        // Bare「哈」over lexical JA (viewing punct stripped「哈…」or head-only det fill)
        {
            const haFix = recoverBareHaBreathZh(cur, recoverSrc || senseSource || sourceText, options);
            if (haFix.changed) {
                cur = haFix.text;
                changed = true;
                flags.push('bare_ha_recover');
            }
        }
        // Bare「舔」over object / reduplicated 舐め (ABF-383 ポテチ舐めて / 舐めて舐めて)
        {
            const lickSrc = recoverSrc || senseSource || sourceText;
            if (isUnderTranslatedLickZh(cur, lickSrc)) {
                let lickFix = recoverFillerZhFromLexicalJa('…', lickSrc);
                if (
                    (!lickFix?.changed || isUnderTranslatedLickZh(lickFix.text, lickSrc)
                        || isEllipsisOrEmptyZh(lickFix.text))
                ) {
                    try {
                        const adult = recoverBlankedAdultZh('…', lickSrc, options);
                        if (adult?.changed && adult.text) lickFix = adult;
                    } catch { /* optional */ }
                }
                if (
                    lickFix?.changed
                    && lickFix.text
                    && !isUnderTranslatedLickZh(lickFix.text, lickSrc)
                    && !isEllipsisOrEmptyZh(lickFix.text)
                ) {
                    cur = lickFix.text;
                    changed = true;
                    flags.push('under_lick_recover');
                }
            }
        }
        // Emphatic elongation: —— → ~~
        {
            const dash = normalizeEmphaticDashZh(cur);
            if (dash.changed) {
                cur = dash.text;
                changed = true;
                flags.push('emphatic_dash');
            }
        }

        // LLM sometimes appends ASCII "..." after otherwise valid ZH.
        if (/[\u4e00-\u9fff]\.{3,}\s*$/u.test(cur)) {
            const trimmed = cur.replace(/\.{3,}\s*$/u, '').trim();
            if (trimmed) {
                cur = trimmed;
                changed = true;
                flags.push('trail_ascii_ellipsis');
            }
        }

        // Final tidy: never leave leading/trailing ，/, on translated cues.
        {
            const edge = stripEdgeCommas(cur);
            if (edge.changed) {
                cur = edge.text;
                changed = true;
                flags.push('edge_comma');
            }
            if (!String(cur).trim()) {
                if (recoverSrc && !flags.includes('prompt_leak')) {
                    cur = '…';
                    changed = true;
                    if (!flags.includes('empty_placeholder')) flags.push('empty_placeholder');
                } else if (flags.includes('wet_sfx') || flags.includes('prompt_leak')) {
                    cur = '…';
                    changed = true;
                    if (!flags.includes('empty_placeholder')) flags.push('empty_placeholder');
                }
            }
        }

        // After domain/recover/pin: long dialogue still collapsed to a one-word stub → blank for re-MT.
        // Narrow gate: stock misattach / sole cast-name / ultra-short remnant only —
        // do not wipe justified short glosses (拜托了+お願い) or domain remaps (再来一点).
        {
            const underSrc = recoverSrc || senseSource || sourceText;
            const underBare = String(cur || '').replace(/[。．.!！?？…\s]+$/g, '');
            const soleNameStub = /^[\u4e00-\u9fff]{2,4}$/.test(underBare)
                && !ZH_NAME_STEM_STOP.has(underBare)
                && !COMMON_KEEP_TOKENS.has(underBare)
                && !/老师|医生|刚才|真的|什么|怎么|感觉|原来|请多|指教|口交/.test(underBare)
                && !/[的了吗呢是在我你他她好不很还要会能对吧啊哦请教指多来谢喜插舔射含棒穴精奶胸臀阴蒂乳肉鸡被给让把口]/.test(underBare)
                && !(OT.rodZh && underBare.includes(OT.rodZh))
                && !(OT.meatRodZh && underBare.includes(OT.meatRodZh))
                && !(OT.oralZh && underBare.includes(OT.oralZh))
                && (
                    // Unjustified cast-name paste
                    !sourceJustifiesZhName(underBare, underSrc)
                    // Name is in JA but ZH is only that name on a long line (真田さんこれ昨日…)
                    || (sourceJustifiesZhName(underBare, underSrc)
                        && textLen(underSrc) >= 12
                        && !jaMostlyCoveredByShortGloss(underSrc))
                );
            if (
                underSrc
                && !flags.includes('prompt_leak')
                && !isEllipsisOrEmptyZh(cur)
                && textLen(underSrc) >= 10
                && !isMoanOrSfxHeavyJa(underSrc)
                && isSeverelyUnderTranslated(cur, underSrc)
                && (
                    // Stock misattach wins even after blank_adult_recover refilled a stub
                    looksLikeStockGlossMisattach(cur, underSrc)
                    || (
                        !flags.includes('blank_adult_recover')
                        && !COMMON_KEEP_TOKENS.has(underBare)
                        && soleNameStub
                    )
                )
            ) {
                cur = '…';
                changed = true;
                flags.push('under_translate_blank');
            }
        }

        // Final gate removed: source_echo + recoverBlankedAdultZh handle JA leaks; avoid
        // forcing «…» on legitimate smart-translate greetings (fake_greeting) or recovery stubs.

        if (stages) {
            stages.final = cur;
            return { text: cur, changed, flags, stages };
        }
        return { text: cur, changed, flags };
    }

    function isEllipsisOrEmptyZh(text) {
        const t = String(text || '').trim();
        if (!t) return true;
        if (/^(?:\.\.\.|……)$/.test(t)) return true;
        if (/^[。．.、，,\s…·•\-—_~～]+$/.test(t)) return true;
        if (/^[（(]\s*省略\s*[)）]$/.test(t)) return true;
        return false;
    }

    /**
     * When MT blanks adult dialogue to «…», recover a high-confidence ZH gloss.
     * Intentional mid-scene fake おはよう blanks are left alone.
     * Non-Chinese 成片: never invent ZH / bare «…» — leave for LLM retry.
     */
    function recoverBlankedAdultZh(text, sourceText = '', options = {}) {
        const cur = String(text || '').trim();
        const src = String(sourceText || '');
        // Never invent glosses from Whisper debris JA
        if (lexicon?.isAsrGarbageJa?.(src)) {
            // Allow recover when ASR-domain / adult stems are present
            if (!/(?:クラブサンド|くださいマスター|ください|マスター|メンエス|オイル|マッサージ|仰向け|オチンポ|チンポ|おちん|ちんぽ|フェラ|マンコ|おまんこ|ペニス)/.test(src)) {
                // Keep existing substantial ZH — only refuse to invent from debris.
                if (!isEllipsisOrEmptyZh(cur) && textLen(cur) >= 4) {
                    return { text: cur, changed: false };
                }
                const next = '…';
                return { text: next, changed: cur !== next };
            }
        }
        const layers = options._sanitizeLayers
            || (targetLangCore?.resolveSanitizeLayers
                ? targetLangCore.resolveSanitizeLayers(options)
                : null);
        if (layers && (layers.zhBlankRecover === false || layers.zhDeep === false)) {
            // Intl: allow localized short-fill / adult surfaces only (never raw ZH).
            let mayZh = false;
            try {
                const policy = (typeof require === 'function')
                    ? require('./mt-delivery-policy-core')
                    : null;
                mayZh = !!(policy && policy.mayWriteZhRecovery?.(options));
            } catch { mayZh = false; }
            if (!mayZh) {
                if (!isEllipsisOrEmptyZh(cur) && !isBlankOrPunctTranslation(cur, src, options)) {
                    return { text: cur, changed: false };
                }
                if (!src.trim()) return { text: cur, changed: false, skipped: true };
                const recovered = mtOpaque?.recoverBlankAdultDialogue?.(src);
                if (recovered && !isEllipsisOrEmptyZh(recovered)) {
                    const loc = mtOpaque?.localizeRecoveredAdultSurface?.(recovered, options)
                        || (() => {
                            try {
                                return require('./mt-short-fill-core')
                                    .localizeZhShortFill(recovered, options, src);
                            } catch { return ''; }
                        })();
                    if (loc) return { text: loc, changed: true };
                }
                try {
                    const smartCore = require('./advanced-smart-translate-core');
                    const fb = smartCore?.fallbackShortJaCue?.(src, options);
                    if (fb && !isEllipsisOrEmptyZh(fb)) {
                        return { text: fb, changed: true };
                    }
                } catch { /* optional */ }
                return { text: cur, changed: false, skipped: true };
            }
        }
        try {
            const policy = (typeof require === 'function')
                ? require('./mt-delivery-policy-core')
                : (typeof globalThis !== 'undefined' ? globalThis.TransubMtDeliveryPolicy : null);
            if (policy && !policy.mayWriteZhRecovery(options)) {
                // Same intl path as layers gate above
                if (!isEllipsisOrEmptyZh(cur) && !isBlankOrPunctTranslation(cur, src, options)) {
                    return { text: cur, changed: false };
                }
                if (!src.trim()) return { text: cur, changed: false, skipped: true };
                try {
                    const smartCore = require('./advanced-smart-translate-core');
                    const fb = smartCore?.fallbackShortJaCue?.(src, options);
                    if (fb && !isEllipsisOrEmptyZh(fb)) {
                        return { text: fb, changed: true };
                    }
                } catch { /* optional */ }
                return { text: cur, changed: false, skipped: true };
            }
        } catch { /* optional */ }
        const invent = looksLikeAdultRegisterInvented(cur, src)
            || looksLikeOpeningCueInvent(cur, src)
            || looksLikeStockGlossMisattach(cur, src)
            || looksLikeFillerGlossMisattach(cur, src)
            || looksLikeWomenAudiencePitchInvent(cur, src)
            || looksLikeLectureSceneBleed(cur, src)
            || looksLikeBookBlurbInvent(cur, src)
            || looksLikeHormoneSecreteAsEjacInvent(cur, src)
            || looksLikeAsrGarbageJaInvent(cur, src)
            || looksLikeFilmingZhInvent(cur, src)
            || looksLikeMissingFilmingZh(cur, src)
            || looksLikeCrossCuePlotBleed(cur, src)
            || looksLikeSemanticMisattach(cur, src)
            || looksLikeDaijoubuSenseMisattach(cur, src)
            || looksLikeMultiStockGlueInvent(cur, src);
        if (!isEllipsisOrEmptyZh(cur) && !isBlankOrPunctTranslation(cur, src, options)) {
            return { text: cur, changed: false };
        }
        if (!src.trim()) return { text: cur, changed: false };
        // Domain/lemma already produced a substantive anatomy+action gloss — do not
        // overwrite with generic opaque stubs (舔肉棒… / 肉棒这根 → 啊这是…肉棒…).
        {
            const bareCur = cur.replace(/[。．.!！?？…\s]+$/g, '');
            if (
                /(?:舔|舐).*肉棒|肉棒.*(?:这根|喜欢|大好|好棒)/u.test(bareCur)
                && /(?:ちんぽ|チンポ|おちん|ちんちん|チンチン|ペニス|舐め|舐めて|大好き)/.test(src)
            ) {
                return { text: cur, changed: false };
            }
        }
        // Mid-scene Whisper bare おはよう hallucinations → blank ZH 早上好.
        // Keep real address greetings (…ご主人様 / お母さん).
        if (
            shouldBlankFakeGreeting(options)
            && JA_FAKE_GREETING_RE.test(src.trim())
            && !/ご主人|主人様|お母|お父|先生|さん|くん|ちゃん/.test(src)
        ) {
            return { text: invent ? '…' : cur, changed: invent };
        }
        const recovered = mtOpaque?.recoverBlankAdultDialogue?.(src);
        if (recovered && !isEllipsisOrEmptyZh(recovered)) {
            // Opaque is JA-conditioned, but still reject stock/under-fill (EBWH-366
            // お兄ちゃんも気持ちいい? → 舒服吗 collapses address).
            if (
                !looksLikeStockGlossMisattach(recovered, src)
                && !isBlankOrPunctTranslation(recovered, src, options)
            ) {
                return { text: recovered, changed: true };
            }
        }
        // Shared short-JA / moan fallback (same table as smart-translate blank sweep).
        // Trust the table: stock/semantic/under-translate guards false-blank short discourse fills
        // (んじゃ→那就 / おっと…おっと→哎呀 / 上着させてください→请让我穿上外套).
        try {
            const smartCore = (typeof require === 'function')
                ? require('./advanced-smart-translate-core')
                : null;
            const fb = smartCore?.fallbackShortJaCue?.(src, options);
            if (fb && !isEllipsisOrEmptyZh(fb) && !isBareHaBreathZh(fb)) {
                return { text: fb, changed: true };
            }
        } catch (_) { /* optional closed/open path */ }
        const remapped = remapJaPreferLexical(src);
        if (remapped && !isEllipsisOrEmptyZh(remapped) && remapped !== cur) {
            // Accept even for short JA (うん / はい) — previously required len>=6
            // Still reject address/clause collapse (お兄ちゃんも気持ちいい? → 舒服吗).
            if (
                !looksLikeStockGlossMisattach(remapped, src)
                && (!isBlankOrPunctTranslation(remapped, src, options) || textLen(src) <= 8)
            ) {
                return { text: remapped, changed: true };
            }
        }
        const mundane = remapMundaneHospitalOrMealJa(src);
        if (mundane && !isEllipsisOrEmptyZh(mundane)) {
            return { text: mundane, changed: true };
        }
        const fragments = recoverFillerZhFromLexicalJa(cur, src);
        if (fragments.changed) return fragments;
        // すごい… collapsed to moan-only ZH (do not override 気持ちいい → 好舒服)
        if (
            /すごい|すげ[えぇー]/.test(src)
            && !/気持ちいい|きもちいい|きもちいっ|きもちぃ|キモチイイ/.test(src)
            && (isEllipsisOrEmptyZh(cur) || isFillerOnlyZh(cur))
        ) {
            return { text: '好厉害', changed: true };
        }
        // Contaminated polish/QC invent on mundane JA: blank for blank-retry.
        // Stock misattach invents (address collapse etc.) must blank even when substantial.
        if (invent) {
            if (
                looksLikeStockGlossMisattach(cur, src)
                || isEllipsisOrEmptyZh(cur)
                || textLen(cur) < 3
            ) {
                return { text: '…', changed: cur !== '…' };
            }
            return { text: cur, changed: false };
        }
        return { text: cur, changed: false };
    }

    /**
     * Sanitize a list of translated cues; matches by index when sourceCues given.
     * Second pass unifies person-name variants across the whole batch.
     * @param {Array<{index?:number,text?:string}>} translatedCues
     * @param {Array<{index?:number,text?:string}>} [sourceCues]
     * @param {object} [options]
     * @returns {{ cues: object[], changed: number, flags: Record<string, number>, nameRules: object[] }}
     */
    function sanitizeMtCues(translatedCues, sourceCues = [], options = {}) {
        const layers = targetLangCore?.resolveSanitizeLayers
            ? targetLangCore.resolveSanitizeLayers(options)
            : { lang: 'zh-Hans', zhDeep: true, jaSourceFix: true };
        const opts = {
            ...options,
            targetLang: layers.lang,
            subtitleTargetLang: layers.lang,
            _sanitizeLayers: layers,
        };
        // Fix JA ASR domain mishears so justify + ZH domain rules see corrected source
        const srcFixed = opts.skipJaAsrDomain !== true && layers.jaSourceFix !== false
            ? correctJaAsrDomainMishearsInCues(sourceCues)
            : { cues: sourceCues || [], changed: 0 };
        let cleanedSource = srcFixed.cues;

        const srcByIndex = new Map();
        for (const c of cleanedSource || []) {
            const idx = Number(c?.index);
            if (Number.isInteger(idx)) srcByIndex.set(idx, String(c?.text ?? ''));
        }

        const explicitRules = buildNameReplaceRules(opts);
        const unifyNames = opts.unifyNames !== false;
        const inferred = unifyNames
            ? inferNameRulesFromCuePairs(translatedCues, cleanedSource)
            : [];
        // Explicit glossary/nameMap wins over inferred
        const mergedMap = new Map();
        for (const r of inferred) mergedMap.set(r.from, r.to);
        for (const r of explicitRules) mergedMap.set(r.from, r.to);
        const nameRules = [...mergedMap.entries()]
            .map(([from, to]) => ({ from, to }))
            .sort((a, b) => b.from.length - a.from.length || a.from.localeCompare(b.from, 'zh-CN'));

        const allowedNames = collectAllowedNames(nameRules, opts.glossaryTerms);

        let dualCore = null;
        let sourceOverlapIndex = null;
        try {
            dualCore = require('./dual-subtitle-core');
            if (typeof dualCore.buildOverlapIndex === 'function') {
                sourceOverlapIndex = dualCore.buildOverlapIndex(cleanedSource);
            }
        } catch { /* optional time-align */ }

        const flagCounts = {};
        if (srcFixed.changed) flagCounts.ja_asr_domain = srcFixed.changed;
        let changed = 0;
        let cues = (translatedCues || []).map((c, i) => {
            const idx = Number.isInteger(Number(c?.index)) ? Number(c.index) : i;
            const { source, srcCue } = resolveSanitizeSourceCue(
                c,
                i,
                cleanedSource,
                srcByIndex,
                dualCore,
                sourceOverlapIndex,
            );
            const result = sanitizeMtCueText(c?.text, source, {
                ...opts,
                nameRules,
                allowedNames,
                cueIndex: idx,
                cueStartMs: cueStartMs(c) || cueStartMs(srcCue),
            });
            if (result.changed) {
                changed += 1;
                for (const f of result.flags) {
                    flagCounts[f] = (flagCounts[f] || 0) + 1;
                }
            }
            return {
                ...c,
                index: idx,
                text: result.text,
            };
        });

        // Optional: reuse glossary-core apply for full document (covers case-sensitive etc.)
        if (opts.glossary && glossaryCore?.applyGlossaryToCues) {
            const applied = glossaryCore.applyGlossaryToCues(cues, opts.glossary);
            if (applied?.stats?.cueTouched) {
                cues = applied.cues.map((c, i) => ({
                    ...cues[i],
                    text: c.text,
                }));
                changed += applied.stats.cueTouched;
                flagCounts.name_unify = (flagCounts.name_unify || 0) + applied.stats.cueTouched;
            }
        }

        // Cross-cue stuck ZH loops (same translation pasted on different JA lines)
        if (layers.zhDeep !== false && opts.unstickCrossCueZh !== false) {
            const unstuck = unstickCrossCueZh(cues, cleanedSource, {
                inventWipe: opts.unstickInventWipe !== false,
            });
            if (unstuck.changed) {
                cues = unstuck.cues;
                changed += unstuck.changed;
                flagCounts.cross_cue_stuck = (flagCounts.cross_cue_stuck || 0) + unstuck.changed;
            }
        }

        // Default ON (same as finalize / hybrid delivery). Strict ===true used to skip prune
        // and rematerialize … back onto JA debris (NAAC ちゅく/ふせん shipped as「…」).
        const dropDebris = opts.dropAsrDebrisPairs !== false;

        // Hard-drop ASR debris / pure-moan pairs FIRST while JA↔ZH still index-aligned.
        // Doing dropUselessEllipsis before this (with preserveSourceSlots=false) shortens ZH
        // only → prune-by-index then glues the wrong ZH onto later JA (whole-track 错位).
        if (dropDebris) {
            const prunedPairs = pruneAsrDebrisCuePairs(cues, cleanedSource, {
                renumberIndexes: opts.renumberIndexes === true,
                // Keep JA↔ZH slot counts aligned (same anti-错位 contract as ellipsis drop).
                preserveSourceSlots: opts.preserveSourceSlots !== false
                    && cleanedSource.length > 0,
            });
            if (prunedPairs.dropped) {
                cues = prunedPairs.cues;
                cleanedSource = prunedPairs.sourceCues;
                changed += prunedPairs.dropped;
                flagCounts.drop_asr_debris = (flagCounts.drop_asr_debris || 0) + prunedPairs.dropped;
            }
        }

        // Drop confirmed-useless ellipsis-only ZH slots (dup blanks / empty JA / post-retry sweep).
        // Gated by「完成后清理杂音 / 幻觉短句」via mt-delivery-policy mayDropUselessEllipsis.
        let mayDropEllipsis = opts.dropUselessEllipsis !== false;
        try {
            const policy = (typeof require === 'function')
                ? require('./mt-delivery-policy-core')
                : null;
            if (policy?.mayDropUselessEllipsis) {
                mayDropEllipsis = policy.mayDropUselessEllipsis(opts);
            }
        } catch { /* keep mayDropEllipsis */ }
        if (mayDropEllipsis) {
            const pruned = dropUselessEllipsisCues(cues, cleanedSource, {
                ...opts,
                // After debris prune, keep slot counts aligned unless caller opts out.
                preserveSourceSlots: opts.preserveSourceSlots !== false
                    && cleanedSource.length > 0,
            });
            if (pruned.dropped) {
                cues = pruned.cues;
                changed += pruned.dropped;
                flagCounts.drop_useless_ellipsis = (flagCounts.drop_useless_ellipsis || 0) + pruned.dropped;
            }
            if (
                cleanedSource.length > 0
                && cues.length !== cleanedSource.length
                && opts.rematerializeOntoSource !== false
            ) {
                const laid = rematerializeTranslatedOntoSource(cleanedSource, cues, {
                    blankText: opts.blankPlaceholder != null ? opts.blankPlaceholder : '…',
                });
                if (laid.changed || laid.cues.length !== cues.length) {
                    cues = laid.cues;
                    flagCounts.rematerialize_onto_source = (flagCounts.rematerialize_onto_source || 0)
                        + (laid.changed || 1);
                }
            }
        }

        return {
            cues,
            changed,
            flags: flagCounts,
            nameRules,
            sourceCues: cleanedSource,
            jaAsrDomainChanged: srcFixed.changed,
        };
    }

    function isDeterministicAsrDebrisJaForSanitize(sourceText = '', zhText = '') {
        const src = String(sourceText || '').trim();
        if (!src) return true;
        const zh = String(zhText || '').trim();
        // Keep short breath/moan glosses that are intentional delivery (はぁ → 哈啊).
        if (/^(?:哈+|哈啊|嗯+|啊+|唔+|呵+)[啊呵嗯…·.•\s]*$/u.test(zh)) {
            return false;
        }
        try {
            if (lexicon?.isAsrGarbageJa?.(src)) return true;
        } catch { /* optional */ }
        try {
            const ellipsis = (typeof require === 'function')
                ? require('./hymt-ellipsis-policy-core')
                : (typeof globalThis !== 'undefined' ? globalThis.TransubHyMtEllipsisPolicy : null);
            if (ellipsis?.isDeterministicAsrDebrisJa?.(src)) return true;
            // Pure moan JA: only prune when ZH is already blank/filler — do not wipe 哈啊.
            if (ellipsis?.isPureMoanOrSfxJa?.(src)) {
                return isEllipsisOrEmptyZh(zh) || isFillerOnlyZh(zh);
            }
            const plan = ellipsis?.planEllipsisSlotAction?.(src, zhText || '…', {});
            if (
                plan?.action === 'delete'
                && (
                    plan.reason === 'asr_debris'
                    || plan.reason === 'pure_moan'
                    || plan.reason === 'asr_garbage'
                )
            ) {
                return true;
            }
        } catch { /* optional */ }
        // Katakana menu noise only when ZH is already blank/ellipsis (avoid wiping real loans mid-cue)
        if (isKatakanaNoiseJa(src) && isEllipsisOrEmptyZh(zhText)) return true;
        return false;
    }

    /**
     * Remove JA↔ZH pairs whose JA is deterministic ASR debris / pure moan.
     * Both lists must stay aligned; indexes are preserved unless renumberIndexes.
     */
    function pruneAsrDebrisCuePairs(translatedCues, sourceCues = [], options = {}) {
        const zhList = Array.isArray(translatedCues) ? translatedCues : [];
        const srcList = Array.isArray(sourceCues) ? sourceCues : [];
        if (!zhList.length) {
            return { cues: [], sourceCues: [], dropped: 0 };
        }
        const blankInstead = options.blankInsteadOfRemove === true
            || options.preserveSourceSlots === true;
        const keptZh = [];
        const keptJa = [];
        let dropped = 0;
        for (let i = 0; i < zhList.length; i += 1) {
            const zh = zhList[i];
            const ja = i < srcList.length ? srcList[i] : null;
            const jaText = ja != null
                ? String(ja.text ?? '')
                : String(zh?.sourceText ?? '');
            const debris = isDeterministicAsrDebrisJaForSanitize(jaText, zh?.text);
            // Also drop when policy says delete for moan/asr debris
            let drop = debris;
            if (!drop && jaText) {
                try {
                    const ellipsis = require('./hymt-ellipsis-policy-core');
                    const plan = ellipsis.planEllipsisSlotAction?.(jaText, zh?.text ?? '', {});
                    if (plan?.action === 'delete'
                        && (plan.reason === 'asr_debris' || plan.reason === 'pure_moan'
                            || plan.reason === 'asr_garbage'
                            || plan.reason === 'pure_discourse' || plan.reason === 'pure_interjection'
                            || plan.reason === 'empty_ja')) {
                        drop = true;
                    }
                } catch { /* optional */ }
            }
            // Keep intentional short moan glosses (はぁ → 哈啊) even when JA is pure moan.
            if (
                drop
                && /^(?:哈+|哈啊|嗯+|啊+|唔+|呵+)[啊呵嗯…·.•\s]*$/u.test(String(zh?.text || '').trim())
            ) {
                drop = false;
            }
            if (drop) {
                dropped += 1;
                if (blankInstead) {
                    keptZh.push({ ...zh, text: '' });
                    if (ja) keptJa.push(ja);
                }
                continue;
            }
            keptZh.push(zh);
            if (ja) keptJa.push(ja);
        }
        if (!dropped) {
            return { cues: zhList, sourceCues: srcList, dropped: 0 };
        }
        const renumber = options.renumberIndexes === true && !blankInstead;
        return {
            cues: renumber ? keptZh.map((c, i) => ({ ...c, index: i })) : keptZh,
            sourceCues: renumber ? keptJa.map((c, i) => ({ ...c, index: i })) : keptJa,
            dropped,
        };
    }

    /**
     * Remove ellipsis-only ZH cues that are confirmed useless for delivery.
     * - Always: empty/moan JA, or same JA as the previous kept cue (Pro-split dup blanks)
     * - dropAllEllipsisSlots: also drop leftover … after blank re-MT (no recoverable fill)
     * Lexical JA + unique … slots are kept for blank-retry unless dropAllEllipsisSlots.
     * Indexes are preserved by default (`renumberIndexes: true` only when the caller
     * intentionally wants contiguous 0..n-1 after a final delivery prune).
     */
    function dropUselessEllipsisCues(translatedCues, sourceCues = [], options = {}) {
        const zhList = Array.isArray(translatedCues) ? translatedCues : [];
        const srcList = Array.isArray(sourceCues) ? sourceCues : [];
        if (!zhList.length) return { cues: [], dropped: 0 };

        let dualCore = null;
        let sourceOverlapIndex = null;
        try {
            dualCore = require('./dual-subtitle-core');
            if (typeof dualCore.buildOverlapIndex === 'function') {
                sourceOverlapIndex = dualCore.buildOverlapIndex(srcList);
            }
        } catch { /* optional */ }
        const srcByIndex = new Map();
        for (const c of srcList) {
            const idx = Number(c?.index);
            if (Number.isInteger(idx)) srcByIndex.set(idx, String(c?.text ?? ''));
        }
        const resolveSrc = (cue, i) => {
            const { source } = resolveSanitizeSourceCue(
                cue,
                i,
                srcList,
                srcByIndex,
                dualCore,
                sourceOverlapIndex,
            );
            return source;
        };

        const dropAll = options.dropAllEllipsisSlots === true;
        // Opt-in: blank in place instead of deleting slots. Deleting ZH rows while JA
        // keeps them, then any positional zip, shifts later ZH onto earlier JA
        // (IPZZ-957: credit/ellipsis drops → whole-file 错位).
        const blankInstead = options.blankInsteadOfRemove === true
            || options.preserveSourceSlots === true;
        const kept = [];
        let dropped = 0;
        let prevKeptJaKey = '';

        for (let i = 0; i < zhList.length; i += 1) {
            const cue = zhList[i];
            const text = String(cue?.text ?? '').trim();
            if (!isEllipsisOrEmptyZh(text)) {
                const src = resolveSrc(cue, i);
                prevKeptJaKey = jaNormKey(src);
                kept.push(cue);
                continue;
            }

            const src = resolveSrc(cue, i);
            const jk = jaNormKey(src);
            let useless = dropAll;
            if (!useless) {
                if (!String(src || '').trim()) useless = true;
                else if (isMoanOrSfxHeavyJa(src)) useless = true;
                else if (isDeterministicAsrDebrisJaForSanitize(src, text)) useless = true;
                else if (lexicon?.isAsrGarbageJa?.(src)) useless = true;
                else if (!jaCueHasLexicalResidue(src)) useless = true;
                else if (jk && prevKeptJaKey && jk === prevKeptJaKey) useless = true;
            }
            if (useless) {
                dropped += 1;
                if (blankInstead) {
                    kept.push({ ...cue, text: '' });
                }
                continue;
            }
            prevKeptJaKey = jk;
            kept.push(cue);
        }

        if (!dropped) return { cues: zhList, dropped: 0 };

        // Default: keep original indexes. Renumbering to 0..n-1 breaks merge-by-index
        // write-back (main-window 重新翻译 / blank-retry maps) and shifts later ZH onto wrong JA.
        const renumber = options.renumberIndexes === true && !blankInstead;
        if (!renumber) return { cues: kept, dropped };
        const cues = kept.map((c, i) => ({ ...c, index: i }));
        return { cues, dropped };
    }

    /**
     * Re-lay translated texts onto the full source timeline.
     * Safe default: exact startMs 1:1; CPS fragments only when fully contained in a JA span.
     * Never use nearest-neighbor overlap (that mashed DLDSS-533 into repeated glue).
     * Index zip only when preferIndex + equal counts.
     * @param {object[]} sourceCues
     * @param {object[]} translatedCues
     * @param {{ blankText?: string, preferIndex?: boolean, fillFromSource?: boolean }} [options]
     */
    function rematerializeTranslatedOntoSource(sourceCues, translatedCues, options = {}) {
        const srcList = Array.isArray(sourceCues) ? sourceCues : [];
        const zhList = Array.isArray(translatedCues) ? translatedCues : [];
        if (!srcList.length) return { cues: zhList, changed: false };
        const blankText = options.blankText != null ? String(options.blankText) : '…';
        // Index map when requested, or when ZH has no usable timing (all startMs missing/0
        // while source is timed) — otherwise every slot becomes blankText (hybrid all-「…」).
        const zhHasTiming = zhList.some((c) => Number.isFinite(Number(c?.startMs)) && Number(c.startMs) > 0);
        const srcHasTiming = srcList.some((c) => Number.isFinite(Number(c?.startMs)) && Number(c.startMs) > 0);
        const preferIndex = options.preferIndex === true
            || (options.preferIndex !== false && srcHasTiming && !zhHasTiming && zhList.length > 0);

        if (preferIndex) {
            const byIndex = new Map();
            const byStart = new Map();
            for (const c of zhList) {
                const idx = Number(c?.index);
                if (Number.isInteger(idx)) byIndex.set(idx, String(c?.text ?? ''));
                const sm = Number(c?.startMs);
                if (Number.isFinite(sm)) byStart.set(Math.round(sm), String(c?.text ?? ''));
            }
            let changed = 0;
            const cues = srcList.map((s, i) => {
                const idx = Number.isInteger(Number(s?.index)) ? Number(s.index) : i;
                let text;
                if (byIndex.has(idx)) text = byIndex.get(idx);
                else if (byStart.has(Math.round(Number(s?.startMs) || 0))) {
                    text = byStart.get(Math.round(Number(s.startMs) || 0));
                } else {
                    text = blankText;
                    changed += 1;
                }
                return {
                    index: idx,
                    startMs: s.startMs,
                    endMs: s.endMs,
                    text,
                };
            });
            if (cues.length !== zhList.length) changed += Math.abs(cues.length - zhList.length);
            if (options.fillFromSource === true) {
                const filled = fillBlankZhSlotsFromJa(cues, srcList, { blankText });
                if (filled.filled > 0) {
                    return {
                        cues: filled.cues,
                        changed: changed + filled.filled,
                        mode: 'index',
                        filledFromSource: filled.filled,
                    };
                }
            }
            return { cues, changed, mode: 'index' };
        }

        // Group ZH by rounded startMs (exact timing match).
        const zhByStart = new Map();
        for (let zi = 0; zi < zhList.length; zi += 1) {
            const c = zhList[zi];
            const sm = Math.round(Number(c?.startMs) || 0);
            if (!zhByStart.has(sm)) zhByStart.set(sm, []);
            zhByStart.get(sm).push({ c, zi });
        }

        const usedZh = new Set();
        const bucketTexts = srcList.map(() => []);

        // Pass 1: exact startMs → 1:1 (or same-start duplicates only).
        for (let i = 0; i < srcList.length; i += 1) {
            const s0 = Math.round(Number(srcList[i]?.startMs) || 0);
            const hits = zhByStart.get(s0) || [];
            for (const { c, zi } of hits) {
                const piece = String(c?.text ?? '').trim();
                if (!piece) {
                    usedZh.add(zi);
                    continue;
                }
                bucketTexts[i].push(piece);
                usedZh.add(zi);
            }
        }

        const exactMatched = srcList.filter((s) => {
            const s0 = Math.round(Number(s?.startMs) || 0);
            return (zhByStart.get(s0) || []).length > 0;
        }).length;
        const exactRate = srcList.length ? exactMatched / srcList.length : 0;

        // Never soft-zip dialogue onto software-credit JA slots — that makes ZH head look
        // like a stolen credit cue and triggers repairOffByOneCreditShift (整轨旋转 → 全「…」).
        let isCreditJaText = null;
        try {
            const creditCore = require('./subtitle-software-credit-core');
            isCreditJaText = (text) => !!creditCore.isSoftwareCreditText?.(text);
        } catch {
            isCreditJaText = () => false;
        }
        const isCreditJaSlot = (i) => isCreditJaText(String(srcList[i]?.text ?? ''));

        // Pass 1.5: soft startMs match for empty JA buckets only.
        // Exact-only rematerialize blanks good ZH when timing drifts a few hundred ms
        // (post-hybrid wipe → 省略号风暴). Never glue orphans onto already-filled slots
        // (see rematerialize does not nearest-merge unrelated ZH).
        const NEAREST_START_MS = 900;
        for (let i = 0; i < srcList.length; i += 1) {
            if ((bucketTexts[i] || []).length) continue;
            if (isCreditJaSlot(i)) continue;
            const s0 = Math.round(Number(srcList[i]?.startMs) || 0);
            let bestZi = -1;
            let bestDist = Infinity;
            for (let zi = 0; zi < zhList.length; zi += 1) {
                if (usedZh.has(zi)) continue;
                const piece = String(zhList[zi]?.text ?? '').trim();
                if (!piece || piece === blankText || /^(?:…|\.{3}|⋯)+$/.test(piece)) continue;
                if (isCreditJaText(piece)) continue;
                const z0 = Math.round(Number(zhList[zi]?.startMs) || 0);
                const dist = Math.abs(z0 - s0);
                if (dist <= NEAREST_START_MS && dist < bestDist) {
                    bestDist = dist;
                    bestZi = zi;
                }
            }
            if (bestZi >= 0) {
                bucketTexts[i].push(String(zhList[bestZi].text).trim());
                usedZh.add(bestZi);
            }
        }

        // Equal-length / near-equal safety net: if exact+nearest still blanked a large share,
        // zip leftover good ZH onto empty JA slots (by index, then by unused pool order)
        // instead of shipping mass 「…」 into postprocess / 省略号风暴.
        {
            let blankBuckets = 0;
            for (let i = 0; i < srcList.length; i += 1) {
                if (!(bucketTexts[i] || []).length) blankBuckets += 1;
            }
            const unusedGood = [];
            for (let zi = 0; zi < zhList.length; zi += 1) {
                if (usedZh.has(zi)) continue;
                const piece = String(zhList[zi]?.text ?? '').trim();
                if (!piece || piece === blankText || /^(?:…|\.{3}|⋯)+$/.test(piece)) continue;
                if (isCreditJaText(piece)) continue;
                unusedGood.push(zi);
            }
            const nearEqual = Math.abs(srcList.length - zhList.length) <= Math.max(2, Math.ceil(srcList.length * 0.12));
            const blankHeavy = blankBuckets >= Math.ceil(srcList.length * 0.12);
            if (srcList.length >= 8 && blankHeavy && (nearEqual || unusedGood.length > 0)) {
                // Prefer same-index when lengths match and that slot's ZH is still free.
                if (srcList.length === zhList.length) {
                    for (let i = 0; i < srcList.length; i += 1) {
                        if ((bucketTexts[i] || []).length) continue;
                        if (isCreditJaSlot(i)) continue;
                        const piece = String(zhList[i]?.text ?? '').trim();
                        if (!piece || piece === blankText || /^(?:…|\.{3}|⋯)+$/.test(piece)) continue;
                        if (isCreditJaText(piece)) continue;
                        if (usedZh.has(i)) continue;
                        bucketTexts[i].push(piece);
                        usedZh.add(i);
                    }
                }
                // Drain remaining unused good ZH into still-empty JA slots in order.
                let u = 0;
                for (let i = 0; i < srcList.length && u < unusedGood.length; i += 1) {
                    if ((bucketTexts[i] || []).length) continue;
                    if (isCreditJaSlot(i)) continue;
                    while (u < unusedGood.length && usedZh.has(unusedGood[u])) u += 1;
                    if (u >= unusedGood.length) break;
                    const zi = unusedGood[u];
                    const piece = String(zhList[zi]?.text ?? '').trim();
                    u += 1;
                    if (!piece) continue;
                    bucketTexts[i].push(piece);
                    usedZh.add(zi);
                }
            }
        }

        // Pass 2 (opt-in): ZH has EXTRA cues from CPS → attach unused fragments fully
        // contained in a JA span that already has an exact-start piece.
        // Off by default — nearest/loose glue mashed DLDSS-533 opening lines.
        if (options.mergeContainedFragments === true && zhList.length > srcList.length) {
            for (let zi = 0; zi < zhList.length; zi += 1) {
                if (usedZh.has(zi)) continue;
                const c = zhList[zi];
                const z0 = Math.round(Number(c?.startMs) || 0);
                const z1 = Math.max(z0, Math.round(Number(c?.endMs) || z0));
                const zDur = Math.max(1, z1 - z0);
                const piece = String(c?.text ?? '').trim();
                if (!piece) {
                    usedZh.add(zi);
                    continue;
                }
                let bestIdx = -1;
                let bestOverlap = 0;
                for (let i = 0; i < srcList.length; i += 1) {
                    if (!(bucketTexts[i] || []).length) continue;
                    const s0 = Math.round(Number(srcList[i]?.startMs) || 0);
                    const s1 = Math.max(s0, Math.round(Number(srcList[i]?.endMs) || s0));
                    if (z0 < s0 - 40 || z1 > s1 + 40) continue;
                    const overlap = Math.max(0, Math.min(s1, z1) - Math.max(s0, z0));
                    if (overlap < zDur * 0.6) continue;
                    if (overlap > bestOverlap) {
                        bestOverlap = overlap;
                        bestIdx = i;
                    }
                }
                if (bestIdx < 0) continue;
                bucketTexts[bestIdx].push(piece);
                usedZh.add(zi);
            }
        }

        let changed = 0;
        const cues = srcList.map((s, i) => {
            const idx = Number.isInteger(Number(s?.index)) ? Number(s.index) : i;
            const parts = bucketTexts[i] || [];
            let text;
            if (parts.length) {
                const merged = [];
                for (const p of parts) {
                    if (merged.length && merged[merged.length - 1] === p) continue;
                    merged.push(p);
                }
                text = merged.join(' ').trim();
            } else {
                text = blankText;
                changed += 1;
            }
            return {
                index: idx,
                startMs: s.startMs,
                endMs: s.endMs,
                text,
            };
        });
        if (cues.length !== zhList.length) changed += Math.abs(cues.length - zhList.length);

        // Opt-in only — default off so align gates cannot invent/spam short glosses.
        if (options.fillFromSource === true) {
            const filled = fillBlankZhSlotsFromJa(cues, srcList, { blankText });
            if (filled.filled > 0) {
                return {
                    cues: filled.cues,
                    changed: changed + filled.filled,
                    mode: 'startMs',
                    filledFromSource: filled.filled,
                };
            }
        }
        return { cues, changed, mode: 'startMs', exactRate };
    }

    /**
     * Replace ellipsis/empty ZH with deterministic JA→ZH gloss when source has meaning.
     * Avoids leaving なんだよ / だめ / ありがと as permanent 「…」 after align gates.
     */
    function fillBlankZhSlotsFromJa(translatedCues, sourceCues = [], options = {}) {
        const zhList = Array.isArray(translatedCues) ? translatedCues.map((c) => ({ ...c })) : [];
        const srcList = Array.isArray(sourceCues) ? sourceCues : [];
        if (!zhList.length || !srcList.length) {
            return { cues: zhList, filled: 0 };
        }
        const blankText = options.blankText != null ? String(options.blankText) : '…';
        let dualCore = null;
        let overlapIndex = null;
        try {
            dualCore = require('./dual-subtitle-core');
            if (typeof dualCore.buildOverlapIndex === 'function') {
                overlapIndex = dualCore.buildOverlapIndex(srcList);
            }
        } catch { /* optional */ }
        const srcByIndex = new Map();
        for (const s of srcList) {
            const idx = Number(s?.index);
            if (Number.isInteger(idx)) srcByIndex.set(idx, s);
        }
        let filled = 0;
        for (let i = 0; i < zhList.length; i += 1) {
            const cur = String(zhList[i]?.text ?? '').trim();
            if (!isEllipsisOrEmptyZh(cur) && cur !== blankText) continue;

            let src = '';
            const idx = Number(zhList[i]?.index);
            if (Number.isInteger(idx) && srcByIndex.has(idx)) {
                src = String(srcByIndex.get(idx)?.text ?? '');
            } else if (i < srcList.length) {
                src = String(srcList[i]?.text ?? '');
            }
            if (!src && dualCore?.findBestOverlapCue) {
                const hit = dualCore.findBestOverlapCue(
                    srcList,
                    Number(zhList[i]?.startMs) || 0,
                    Number(zhList[i]?.endMs) || Number(zhList[i]?.startMs) || 0,
                    { maxStartGapMs: 2500, index: overlapIndex },
                );
                if (hit?.cue) src = String(hit.cue.text ?? '');
            }
            if (!String(src || '').trim()) continue;

            let next = remapJaPreferLexical(src) || remapZhFromJaSimple(src) || '';
            if (!next || isEllipsisOrEmptyZh(next) || isBareHaBreathZh(next)) {
                const recovered = recoverFillerZhFromLexicalJa('', src);
                if (recovered?.changed && recovered.text && !isBareHaBreathZh(recovered.text)) {
                    next = recovered.text;
                }
            }
            if (!next || isEllipsisOrEmptyZh(next) || isBareHaBreathZh(next)) {
                try {
                    const adult = recoverBlankedAdultZh('', src, {
                        skipFakeGreeting: true,
                        smartTranslateFaithfulTone: true,
                        faithfulTone: true,
                    });
                    if (
                        adult?.changed
                        && adult.text
                        && !isEllipsisOrEmptyZh(adult.text)
                        && !isBareHaBreathZh(adult.text)
                    ) {
                        next = adult.text;
                    }
                } catch { /* optional */ }
            }
            // Extras on full + breath-stripped JA before head-only「哈…」det fill.
            if (!next || isEllipsisOrEmptyZh(next) || isBareHaBreathZh(next)) {
                const candidates = [String(src).trim(), stripJaBreathMoans(src)].filter(Boolean);
                const extras = {
                    'なんだよ': '搞什么呀',
                    'なんだ': '什么啊',
                    'なんですか': '什么事？',
                    'なんですか?': '什么事？',
                    'なんですか？': '什么事？',
                    '動かないで': '别动',
                    'うごかないで': '别动',
                    '動かないでください': '请别动',
                    'うごかないでください': '请别动',
                    'じっとしてみな': '给我老实待着',
                    'やめやめ': '别别别',
                    'やめて': '不要',
                    'うざー': '烦死了',
                    'うざい': '烦死了',
                    'どうだ': '怎么样',
                    'どうだ?': '怎么样？',
                    'どうだ？': '怎么样？',
                    'ダメだよ': '不行的哦',
                    'だめだよ': '不行的哦',
                    'じゃね': '再见啦',
                    'くりね': '库里呢',
                    'みたい': '好像是',
                    'あれから': '从那以后',
                    'わんっ': '汪',
                    'え なんだ': '诶 什么',
                    'え? まあね': '诶？还好吧',
                    'え？ まあね': '诶？还好吧',
                    '彼女でもできた': '交到女朋友了吗',
                    '彼女でもできた?': '交到女朋友了吗？',
                    '彼女でもできた？': '交到女朋友了吗？',
                    'すごいすごい': '好厉害好厉害',
                    'ぴちゃっ': '啪唧',
                    'それでも': '即便如此',
                    '先生': '老师',
                    'うるさいな もういい': '好吵啊 够了',
                    'うるさいな': '好吵啊',
                    'もっと素敵な彼女ができるよ': '还能交到更棒的女朋友哦',
                    'またまた': '又来了',
                    'やば': '糟了',
                    'ヤバ': '糟了',
                    'サイドに': '到边上',
                    'こいつは': '这家伙',
                    'あの': '那个',
                    'どうしました': '怎么了',
                    'どうしました?': '怎么了？',
                    'どうしました？': '怎么了？',
                    '次は': '接下来',
                    'まだ': '还…',
                    'こう': '这样',
                    'なんで': '为什么',
                    'さあ': '来吧',
                    '少し': '稍微',
                    'まずは': '首先',
                    'いいですよ': '可以哦',
                    'いいです': '可以',
                    'そのままですよ': '就这样哦',
                    'そのまま行きなさい': '就这样继续',
                    'どうもですよ': '谢谢啦',
                    'そうなんですよ': '是这样的',
                    'おじさん': '叔叔',
                    'おばさん': '阿姨',
                    'おっと': '哎呀',
                    '私は': '我啊',
                    '上も': '上面也',
                    '彼と': '和他',
                    'この': '这个',
                    'んじゃ': '那就',
                    'カード': '卡片',
                    'あゆ': '小彩',
                    'ラフでは': '便装的话',
                    '上着させてください': '请让我穿上外套',
                    'この筆を使ってるんです': '我在用这支笔',
                    'んー…いいですよ': '嗯…可以哦',
                    'そう…いいですよ': '对…可以哦',
                    'うまくなりたいんでしょ': '想变厉害对吧',
                    'うまくなりたいんでしょ?': '想变厉害对吧？',
                    'うまくなりたいんでしょ？': '想变厉害对吧？',
                    'おじさんは': '叔叔',
                    'パンツ': '短裤',
                    'おおかさま': '太太',
                    'うぐぐ…おおかさま': '太太…',
                    'おっと…おっと': '哎呀…哎呀…',
                };
                for (const cand of candidates) {
                    const bare = cand
                        .replace(/[。．.!！?？…\s]+$/g, '')
                        .replace(/^[…・.\s]+/, '');
                    if (Object.prototype.hasOwnProperty.call(extras, bare)) {
                        next = extras[bare];
                        break;
                    }
                    if (/^だめ|^ダメ/.test(bare) && textLen(bare) <= 8) {
                        next = '不行';
                        break;
                    }
                    if (/^いや/.test(bare) && textLen(bare) <= 6) {
                        next = '不要';
                        break;
                    }
                    if (/うるさい/.test(bare) && textLen(bare) <= 16) {
                        next = /もういい/.test(bare) ? '好吵啊，够了' : '好吵啊';
                        break;
                    }
                }
            }
            if (!next || isEllipsisOrEmptyZh(next) || isBareHaBreathZh(next)) {
                try {
                    const ellipsisPolicy = require('./hymt-ellipsis-policy-core');
                    const det = ellipsisPolicy.deterministicEllipsisFill?.(src, options);
                    // Reject head-only breath gloss when JA still has dialogue residue.
                    // Also reject bare「舔」when JA has object / redup (ABF-383 ポテチ舐めて…).
                    if (
                        det
                        && !isEllipsisOrEmptyZh(det)
                        && !(isBareHaBreathZh(det) && isSubstantiveAfterBreathStrip(src))
                        && !isUnderTranslatedLickZh(det, src)
                    ) {
                        next = det;
                    }
                } catch { /* optional */ }
            }
            if (isBareHaBreathZh(next) && isSubstantiveAfterBreathStrip(src)) {
                const haFix = recoverBareHaBreathZh(next, src, options);
                if (haFix.changed) next = haFix.text;
            }
            if (!next || isEllipsisOrEmptyZh(next) || next === cur) continue;
            zhList[i] = { ...zhList[i], text: next };
            filled += 1;
        }
        return { cues: zhList, filled };
    }

    /**
     * JA that is mostly moans / sfx — short ZH glosses are acceptable.
     */
    function jaCueHasLexicalResidue(sourceText = '') {
        const s = String(sourceText || '').trim();
        if (!s) return false;
        if (/[一-龯]/.test(s)) return true;
        if (/(?:待っ|やめ|我慢|気持|お願い|先輩|大丈夫|本当|ほんと|だめ|ダメ|駄目|恥ずかしい|落ち着|確認|舐|しゃぶ|あったかい|らめ)/.test(s)) {
            return true;
        }
        const stripped = s
            .replace(CHEW_SFX_CHUNK_RE, '')
            .replace(MOAN_CHAR_CLASS_RE, '');
        return textLen(stripped) >= 3;
    }

    /** Drop breath/laughter runs so lexical JA under はぁはぁ/あはは can remap. */
    function stripJaBreathMoans(sourceText = '') {
        return String(sourceText || '')
            .replace(/(?:あはは+|ははは+|ふふふ+|んふふ+|ウフフ+|ひっひっ+|はひゃ+|ひゃひゃ+|はぁ+|はあっ+|はあぁ*|ハァ+|ああぁ+|あぁぁ+|あんっ+|んっ+)[っッ]*/gu, ' ')
            .replace(/[…・.…!！?？、，,]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /** Bare breath gloss 「哈」「哈…」「哈哈」over lexical JA — recover dialogue. */
    function isBareHaBreathZh(text = '') {
        const t = String(text || '').trim();
        return /^(?:哈+|哈…|哈哈|哈啊)[…·.•\s]*$/u.test(t);
    }

    /** Single-char「舔」under-fills object / reduplicated 舐め cues. */
    function isUnderTranslatedLickZh(text = '', sourceText = '') {
        const bare = String(text || '').trim().replace(/[。．.!！?？…·.•\s]+$/gu, '');
        // Only bare「舔」(not「舔舔」) is treated as under-fill.
        if (bare !== '舔') return false;
        const src = String(sourceText || '');
        if (/ポテチ|ポテト|おやつ/.test(src)) return true;
        if (/(?:舐め(?:て)?).{0,6}舐め|舐めて舐めて/.test(src)) return true;
        if (/はは|あはは|ふふ/.test(src) && /舐め/.test(src)) return true;
        // Definition / clinical explain cues (はい、女性器を舐めることです)
        if (/舐め(?:る|て)/.test(src) && textLen(src) >= 10) return true;
        return false;
    }

    function recoverBareHaBreathZh(text, sourceText = '', options = {}) {
        const cur = String(text || '').trim();
        const src = String(sourceText || '').trim();
        if (!src || !isBareHaBreathZh(cur)) {
            return { text: cur, changed: false };
        }
        // Do not re-inflate stock 哈…哈 onto lexical JA (unstick already blanked).
        if (looksLikeStockGlossMisattach(cur, src)) {
            return { text: '…', changed: cur !== '…' };
        }
        if (!jaCueHasLexicalResidue(src) && !isSubstantiveAfterBreathStrip(src)) {
            // Pure moan → keep canonical 哈… (not bare 哈 after viewing punct strip)
            const next = '哈…';
            return { text: next, changed: next !== cur };
        }
        let next = remapJaPreferLexical(src) || remapZhFromJaSimple(src) || '';
        if (!next || isEllipsisOrEmptyZh(next) || isBareHaBreathZh(next) || isFillerOnlyZh(next)) {
            const recovered = recoverFillerZhFromLexicalJa('…', src);
            if (recovered?.changed && recovered.text) next = recovered.text;
        }
        if (!next || isEllipsisOrEmptyZh(next) || isBareHaBreathZh(next)) {
            try {
                const adult = recoverBlankedAdultZh('…', src, {
                    skipFakeGreeting: true,
                    ...options,
                });
                if (adult?.changed && adult.text && !isBareHaBreathZh(adult.text)) {
                    next = adult.text;
                }
            } catch { /* optional */ }
        }
        if (!next || isEllipsisOrEmptyZh(next) || isBareHaBreathZh(next) || next === cur) {
            // Still stuck: leave ellipsis for blank-retry rather than ship bare「哈」
            return { text: '…', changed: cur !== '…' };
        }
        return { text: next, changed: next !== cur };
    }

    function isSubstantiveAfterBreathStrip(sourceText = '') {
        const stripped = stripJaBreathMoans(sourceText);
        if (!stripped) return false;
        if (jaCueHasLexicalResidue(stripped)) return true;
        return textLen(stripped) >= 2 && !/^[あぁうぅええぇおおんっー〜～]+$/u.test(stripped.replace(/\s+/g, ''));
    }

    /**
     * Prefer a non-filler remap; when ZH-bound JA is moan-prefixed, remap the remainder.
     */
    function remapJaPreferLexical(src) {
        const raw = String(src || '').trim();
        if (!raw) return null;
        const r0 = remapZhFromJaSimple(raw);
        if (r0 && !isFillerOnlyZh(r0) && !isBareHaBreathZh(r0)) return r0;
        // Pure moan / SFX: keep punctuated remap (あっ! → 啊~~！) — breath-strip drops ! and weakens to 啊……
        if (r0 && isFillerOnlyZh(r0) && isMoanOrSfxHeavyJa(raw)) return r0;
        const stripped = stripJaBreathMoans(raw);
        if (stripped && stripped !== raw) {
            const r2 = remapZhFromJaSimple(stripped);
            if (r2 && !isFillerOnlyZh(r2) && !isBareHaBreathZh(r2)) return r2;
            if (r2 && !isBareHaBreathZh(r2)) return r2;
            const filler = recoverFillerZhFromLexicalJa('…', raw);
            if (filler?.changed && filler.text && !isBareHaBreathZh(filler.text)) {
                return filler.text;
            }
        }
        return (r0 && !isBareHaBreathZh(r0)) ? r0 : null;
    }

    function recoverFillerZhFromLexicalJa(text, sourceText = '') {
        const cur = String(text || '').trim();
        const raw = String(sourceText || '').trim();
        if (!raw || (!isEllipsisOrEmptyZh(cur) && !isFillerOnlyZh(cur) && !isUnderTranslatedLickZh(cur, raw))) {
            return { text: cur, changed: false };
        }
        if (!jaCueHasLexicalResidue(raw)) return { text: cur, changed: false };
        const src = stripJaBreathMoans(raw) || raw;
        const bits = [];
        if (/らめ[ぇえ]|らめらめ|ラメラメ/.test(src)) bits.push('不行');
        if (/待って/.test(src)) bits.push('等一下');
        if (/本当に|ほんと/.test(src) && !/よろしく/.test(src)) bits.push('真的');
        if (/よろしくお願いします|よろしくお願い/.test(src)) bits.push('请多指教');
        else if (/お願い/.test(src)) bits.push('拜托了');
        if (/やめ(?:て|ろ|てください)|やだ|やだい|やめやめ/.test(src)) bits.push(/やめやめ/.test(src) ? '别别别' : '不要');
        if (/だめ|ダメ|駄目/.test(src)) bits.push('不行');
        if (/楽しい|たのしい/.test(src)) bits.push('好开心');
        if (/ヤバ|やば/.test(src)) bits.push('糟了');
        if (/またまた/.test(src)) bits.push('又来了');
        if (/こいつ/.test(src)) bits.push('这家伙');
        if (/サイド/.test(src)) bits.push('边上');
        if (/あの/.test(src) && textLen(src) <= 10) bits.push('那个');
        if (/バイバイ|ばいばい/.test(src)) bits.push('拜拜');
        if (/我慢できない/.test(src)) bits.push('忍不住了');
        if (/舐めないで|舐めない/.test(src)) bits.push('不要舔');
        else if (/ポテチ|ポテト/.test(src) && /舐め/.test(src)) {
            bits.push(/める|みて/.test(src) || /[？?]/.test(src) ? '舔薯片吗' : '舔薯片');
        }         else if (/(?:舐め(?:て)?)+.{0,4}(?:舐め)|舐めて舐めて/.test(src) || /(?:舐め(?:て)?)+.{0,4}(?:舐め)|舐めて舐めて/.test(raw)) {
            bits.push(/はは|あはは|ふふ/.test(raw) ? '舔舔啊哈哈' : '舔舔');
        } else if (/舐め/.test(src) || /舐め/.test(raw)) {
            // Prefer redup over bare「舔」when JA still has address / object residue.
            bits.push(/(?:おまえ|お前|奥|もっと|いっぱい)/.test(raw) ? '舔舔' : '舔');
        }
        if (/しゃぶ/.test(src)) bits.push('含着');
        if (/おまえ|お前/.test(src) && /も/.test(src) && textLen(src) <= 12) {
            if (!bits.length) bits.push('你也是');
        }
        if (/いや/.test(src) && /そんな/.test(src) && textLen(src) <= 14) {
            if (!bits.length) bits.push('才没有那种事');
        }
        if (/ねえ/.test(src) && /雑魚/.test(src)) bits.push('喂，也太弱了吧');
        if (/ねえ/.test(src) && /そうそう/.test(src)) bits.push('喂，对对对对');
        if (/奥/.test(src) && /好き/.test(src) && textLen(src) <= 10) bits.push('喜欢深处');
        if (/いや/.test(src) && /でも/.test(src) && /やっぱ/.test(src)) bits.push('不过果然还是');
        if (/あったかい/.test(src) && /手/.test(src) && !/べろ|舌/.test(src)) {
            bits.push(/初めて/.test(src) ? '第一次的手…好温暖' : '手好温暖');
        }
        if (/音/.test(src) && /(?:ある|する)/.test(src)) bits.push('有声音');
        const next = bits.join('').trim();
        if (!next || next === cur) return { text: cur, changed: false };
        // すみません…お願いします → 「拜托了」omits the apology; leave for re-MT.
        // Pure よろしくお願いします → 「请多指教」is fine.
        if (
            next === '拜托了'
            && textLen(raw) >= 8
            && /すみません|ごめん|失礼/.test(raw)
        ) {
            return { text: cur, changed: false };
        }
        return { text: next, changed: true };
    }

    function isMoanOrSfxHeavyJa(sourceText = '') {
        const s = String(sourceText || '').trim();
        if (!s) return false;
        if (jaCueHasLexicalResidue(s)) return false;
        if (/^[はハはぁアァうぅウゥんンー〜～っッああん!！?？…。．.、，,\s♡♥❤ク]+$/i.test(s)) return true;
        const climaxMoan = (typeof mtOpaque?.d === 'function'
            ? mtOpaque.d('44Kk44ODK3zjgqTjgq9844GE44Gj44Gh44KD44GG')
            : '') || 'x';
        let rest = s
            .replace(/[はハはぁアァうぅウゥんンー〜～っッ!！?？…。．.\s♡♥❤、，,。.]+/g, '')
            .replace(new RegExp(`(?:あんっ?|あっ|んっ|はぁ+|ふぅ+|${climaxMoan}|ちゅ[うっぷ]*|んふ|だめっ?)+`, 'gi'), '');
        const sl = textLen(s);
        return sl >= 4 && textLen(rest) <= Math.max(2, Math.floor(sl * 0.25));
    }

    /** Short mirrored JA↔ZH negation / refusal (違う違う ↔ 不对不对). */
    function isMirroredShortReplyZhJa(text = '', sourceText = '') {
        const t = String(text || '').trim().replace(/[。．.!！?？…\s]+$/g, '');
        const src = String(sourceText || '').trim().replace(/[。．.!！?？…\s]+$/g, '');
        if (!t || !src) return false;
        const pairs = [
            [/^(?:不对)+$/u, /^(?:違う|ちがう)+$/u],
            [/^(?:不行)+$/u, /^(?:だめ|ダメ|駄目|やめ|らめ|ラメ)+$/u],
            [/^(?:不要)+$/u, /^(?:やだ|いや)+$/u],
            [/^(?:不是)+$/u, /^(?:じゃない|ではない)+$/u],
            [/^(?:好的)+$/u, /^(?:はい)+$/u],
            [/^(?:嗯嗯)+$/u, /^(?:うん|ええ)+$/u],
        ];
        return pairs.some(([zhRe, jaRe]) => zhRe.test(t) && jaRe.test(src));
    }

    /**
     * ZH that is only a filler / interjection stub (嗯，/啊/请…).
     * Intentionally excludes legitimate short replies like 谢谢/是的/好的.
     */
    function isFillerOnlyZh(text = '') {
        const t = String(text || '').trim();
        if (!t) return false;
        const bare = t.replace(/[。．.、，,\s…·•\-—_~～！!？?]+/g, '');
        if (/^(?:不对|不行|不要|不是|好的|嗯嗯){2,}$/u.test(bare)) return false;
        if (/^(?:啊[，,。．.]?|嗯[，,。．.]?|哦[，,。．.]?|噢[，,。．.]?|喂[，,。．.]?|哈(?:啊|[…·\s]*哈)+[，,。．.…]*|哈[哈呵]?[。．.!！]?|呵呵[，,。．.]?|请|来|完了|不过|不对[，,。．.]?|哎呀[，,。．.]?|嗨[，,。．.]?|嘿[，,。．.]?|啧[，,。．.]?|…+)$/.test(t)) {
            return true;
        }
        if (!bare) return true;
        return /^(?:嗯+|啊+|哦+|噢+|喂+|哈+|呵+|唔+|呜+|欸+|诶+|呀+|哟+|哇+|嘻+|请|来|完了|不过|不对|哎呀|嗨|嘿)+$/.test(bare);
    }

    /**
     * True when ZH is a soft-omission vs substantive JA (caller should retry).
     * Timing-aligned short fillers like「嗯，」「请」used to pass blank checks.
     */
    /**
     * True when JA (after moan strip) is itself short — a 2–4 char ZH table hit
     * can be a complete cue. Long lines with leftover dialogue are NOT covered.
     */
    function jaMostlyCoveredByShortGloss(sourceText = '') {
        const coreLen = textLen(stripJaBreathMoans(sourceText));
        return coreLen > 0 && coreLen <= 8;
    }

    /** Short table remaps are OK for short/moan JA; long dialogue must not ship as one word. */
    function shortRemapAdequateForJa(zh, ja) {
        const t = String(zh || '').trim();
        const src = String(ja || '').trim();
        if (!t || isEllipsisOrEmptyZh(t)) return false;
        const sl = textLen(src);
        const tl = textLen(t);
        if (sl <= 8 || isMoanOrSfxHeavyJa(src) || !jaCueHasLexicalResidue(src)) return true;
        if (jaMostlyCoveredByShortGloss(src)) return true;
        const coreLen = textLen(stripJaBreathMoans(src));
        if (coreLen <= 10) return true;
        // One-word / two-char stub against a still-long lexical core → leave for re-MT
        if (tl <= 3 && coreLen >= 12) return false;
        return true;
    }

    function isSeverelyUnderTranslated(text, sourceText = '') {
        const t = String(text || '').trim();
        const src = String(sourceText || '').trim();
        if (!t || !src) return false;
        const sl = textLen(src);
        const tl = textLen(t);
        if (isMoanOrSfxHeavyJa(src)) return false;
        if (isMirroredShortReplyZhJa(t, src)) return false;
        // Short vocative / name call (あ かなめくん → 奏君？) — not an omission.
        {
            const bareZh = t.replace(/[。．.!！?？…\s]+$/g, '');
            if (
                sl <= 12
                && tl <= 6
                && /^(?:あ|あっ|ねえ|おい|ほら)?[\s　]*[\u3040-\u30ff\u4e00-\u9fff]{1,8}(?:さん|くん|君|ちゃん)?[。．.!！?？\s…]*$/u.test(src)
                && /^[\u4e00-\u9fff]{1,4}[？?！!]*$/u.test(bareZh)
            ) {
                return false;
            }
        }
        // だめ/ダメ polarity already carried by 不行 — do not blank for retry forever.
        {
            const bareZh = t.replace(/[。．.!！?？…\s]+$/g, '');
            if (
                /^(?:不行|不要)(?:了|啊|呀)?$/.test(bareZh)
                && /だめ|ダメ|駄目|やめて|出しちゃダメ/.test(src)
                && tl >= 2
            ) {
                return false;
            }
        }
        // Clinical anatomy short gloss justified by JA (おちんこ→肉棒) is complete, not omission.
        {
            const bareZh = t.replace(/[。．.!！?？…\s]+$/g, '');
            if (
                /^(?:肉棒|鸡巴|小穴|乳头|胸部|精液|口交)$/u.test(bareZh)
                && /(?:ちんぽ|チンポ|おちん|ちんちん|チンチン|ペニス|まんこ|おまんこ|乳首|おっぱい|胸|精液|射精|フェラ)/.test(src)
            ) {
                return false;
            }
            // Partial domain glosses already carrying anatomy + action / demonstrative.
            if (
                /(?:舔|舐).*肉棒|肉棒.*(?:这根|喜欢|大好|好棒)/u.test(bareZh)
                && /(?:ちんぽ|チンポ|おちん|ちんちん|チンチン|ペニス|舐め|舐めて|大好き)/.test(src)
            ) {
                return false;
            }
        }
        // Moan-only ZH vs lexical JA (including short お願い) — engine often stubs as 哈 哈.
        if (
            isFillerOnlyZh(t)
            && sourceLooksLikeJapanese(src)
            && jaCueHasLexicalResidue(src)
        ) return true;
        if (sl < 6) return false;
        // Complete feel-good gloss vs long JA — do not recover-over 好舒服 via すごい
        if (
            /^(?:好舒服|好厉害)[…。．.!！?\s]*$/u.test(t)
            && /気持ちいい|きもち|すごい/.test(src)
        ) {
            return false;
        }
        // Complete climax gloss vs moan+出る/イク JA — do not recover-over 要射了→不行 (だめ short-fill)
        // or 要去了→要射了 (blank recover male default). Domain already chose polarity.
        if (
            /^(?:要射了|要去了)[…。．.!！?\s]*$/u.test(t)
            && /イッ|イキ|イク|いく[わよね]?|いっちゃ|出[しする]|出そう|出ちゃう|出る|射精|漏ら/.test(src)
        ) {
            return false;
        }
        // Past climax JA already glossed as came/went — do not upgrade to about-to-cum
        if (
            reCore('Xig/OuWwhOS6hnzljrvkuoYpW+KApuOAgu+8ji4h77yBP1xzXSok', 'u').test(t)
            && reCore('44Kk44OD44Gf44KIfOOCpOOBo+OBoeOCg+OBhOOBvuOBl+OBn3zjgqTjg4PjgaHjgoPjgaPjgZ9844GE44Gj44Gh44KD44Gj44GffOOCpOOBo+OBoeOCg+OBo+OBnw==').test(src)
            && !reCore('44Kk44OD44Gh44KD44GGfOOCpOOBo+OBoeOCg+OBhnzjgYTjgaPjgaHjgoPjgYY=').test(src)
        ) {
            return false;
        }
        // manko + about-to-go is a complete climax gloss — do not recover-over to bare about-to-go
        if (
            reCore('XuWwj+eptCg/OuimgeWOu+S6hnzopoHlsITkuoYpW+KApuOAgu+8ji4h77yBP1xzXSok', 'u').test(t)
            && reCore('KD8644GKKT/jgb7jgpPjgZM=').test(src)
        ) {
            return false;
        }
        // らめらめ + climax already 「不要…」+ about-to-go
        if (
            /不要|不行/.test(t)
            && reCore('6KaB5Y675LqGfOimgeWwhOS6hg==').test(t)
            && /らめらめ|ラメラメ/.test(src)
        ) {
            return false;
        }
        // Pure JA interjection/greeting of similar brevity — allow short ZH.
        if (
            sl <= 8
            && /^(?:うん|ええ|はい|ああ|あっ|ねえ|はぁ|ふぅ|そう|よし)[。．!！?？\s…ー〜～]*$/i.test(src)
        ) {
            return false;
        }
        if (isFillerOnlyZh(t)) return true;
        if (looksLikeJaZhMixedLeak(t, src)) return true;
        // Glued stock collapse (MNGS-082) is always an under-fill vs real JA.
        {
            const bareGlue = t.replace(/[。．.!！?？…\s]+$/g, '');
            if (/^(?:真的)?拜托了不要不行$|^(?:真的)?不要不行$|^真的拜托了$/u.test(bareGlue)
                && textLen(src) >= 4) {
                return true;
            }
        }
        // Politeness stub covering only お願い while JA still has すみません/apology.
        {
            const bareZh = t.replace(/[。．.!！?？…\s]+$/g, '');
            if (
                /^(?:拜托了|请多指教)$/.test(bareZh)
                && sl >= 8
                && /すみません|ごめん|失礼/.test(src)
                && /お願い|よろしく/.test(src)
            ) {
                return true;
            }
        }
        // Sole CJK name tag vs real JA dialogue (優翔 on おはよう / long line)
        {
            const bareZh = t.replace(/[。．.!！?？…\s]+$/g, '');
            const lexicalRemap = remapZhFromJaSimple(src);
            const remapMatches = lexicalRemap
                && (lexicalRemap === bareZh || lexicalRemap === t
                    || lexicalRemap.replace(/[。．.!！?？…\s]+$/g, '') === bareZh);
            // Keyword table hit on a long line (可愛い→好可爱 while JA still has そうだよな…)
            // is still under-translate — only exempt when JA is mostly that gloss.
            if (remapMatches && sl >= 12 && tl <= 3 && !jaMostlyCoveredByShortGloss(src)) {
                return true;
            }
            if (
                !remapMatches
                && /^[\u4e00-\u9fff]{2,4}$/.test(bareZh)
                && !ZH_NAME_STEM_STOP.has(bareZh)
                && !COMMON_KEEP_TOKENS.has(bareZh)
                && !/[的了吗呢是在我你他她好不很还要会能对吧啊哦原如真次点]/.test(bareZh)
                && !sourceJustifiesZhName(bareZh, src)
                && (jaCueHasLexicalResidue(src) || sl >= 4)
            ) {
                return true;
            }
        }
        // Long dialogue collapsed into a tiny remnant (with or without trailing comma).
        // Exclude deterministic short remaps only when JA is mostly covered (なるほど→原来如此).
        {
            const lexicalRemap = remapZhFromJaSimple(src);
            const remapBare = lexicalRemap
                ? lexicalRemap.replace(/[。．.!！?？…\s]+$/g, '')
                : '';
            const zhBare = t.replace(/[。．.!！?？…\s]+$/g, '');
            if (remapBare && (remapBare === zhBare || lexicalRemap === t)
                && (sl < 12 || tl > 3 || jaMostlyCoveredByShortGloss(src))) {
                // Table hit that still drops address / clause (お兄ちゃんも気持ちいい? → 舒服吗？)
                // must stay severe so under_translate_blank can wipe — do not keep on punct-inflated tl.
                if (looksLikeStockGlossMisattach(t, src)) return true;
                /* keep — short JA / covered gloss */
            } else if (sl >= 10 && tl > 0 && tl <= Math.max(2, Math.floor(sl / 5))) {
                return true;
            } else if (sl >= 12 && tl > 0 && tl <= 3 && jaCueHasLexicalResidue(src)
                && !jaMostlyCoveredByShortGloss(src)) {
                return true;
            }
        }
        const tlBare = textLen(t.replace(/[，、,。．.…!！?？]+$/g, ''));
        if (
            sl >= 6
            && tlBare >= 1
            && tlBare <= Math.max(3, Math.floor(sl * 0.4))
            && /[，、,]$/.test(t)
        ) {
            return true;
        }
        return false;
    }

    /** Pure CJK phonetic dump of katakana ASR noise (no dialogue function words). */
    function isKatakanaPhoneticZh(text, sourceText = '') {
        const t = String(text || '').trim();
        if (!t || !isKatakanaNoiseJa(sourceText)) return false;
        if (!/^[\u4e00-\u9fff…·.•\-—!！?？\s]+$/u.test(t)) return false;
        if (/[的了吗呢是在我你他她请很不吗吧啊哦嗯哈]/.test(t) && textLen(t) > 6) return false;
        const n = textLen(t);
        return n >= 4 && n <= 24;
    }

    /**
     * Model emitted Latin junk (Grubn) for katakana ASR menu / noise cues.
     * Also blanks known soft-AV SFX transliterations (Boeh / aki / Yuk / bump).
     */
    function isLatinSfxAtomZh(text = '') {
        const t = String(text || '').trim();
        if (!t) return false;
        if (lexicon?.latinSfxAtomRe) {
            if (lexicon.latinSfxAtomRe('i').test(t)) return true;
            if (lexicon.latinSfxMoanAtomRe('i').test(t)) return true;
        } else if (/^(?:Boeh|aki|Yuk|bump|snot|buzz|sov)[~～\-—_!.…·.•\s]*$/i.test(t)) {
            return true;
        }
        // Hyphen latin mash (大-ima / 吧-feira) with little CJK
        if (/^[ぁ-んァ-ン一-龯]{0,2}-[A-Za-z]{2,12}[~～\-—_!.…·.•\s]*$/u.test(t)) {
            return true;
        }
        return false;
    }

    const COMMON_EN_PARTICLE_RE = /^(?:ok|okay|yes|no|hi|hey|oh|ah|please|thanks|thank|sorry|what|why|who|how|wait|stop|come|go|love|hello|bye|yeah|yep|nope|sure|fine|right|really|maybe|well|wow|damn|fuck|shit|help|look|listen|good|bad|nice|great|cool|ready|enough|again|more|less|here|there|now|then|still|just|even|also|too|very|much|many|all|some|any|never|always|already|about|after|before|because|if|when|where|while|though|although|but|and|or|so|not|don|dont|can|cant|will|wont|would|could|should|must|may|might|need|want|like|know|think|see|hear|feel|say|said|tell|ask|get|got|make|made|take|give|let|put|keep|try|use|call|find|leave|turn|start|end|open|close|run|walk|sit|stand|eat|drink|sleep|wake|kill|die|live|play|work|study|school|home|mom|dad|brother|sister|friend|baby|girl|boy|man|woman|people|time|day|night|today|tomorrow|yesterday|morning|evening|hate|miss|excuse|pardon|welcome|goodbye|goodnight|goodmorning)$/i;

    function latinWordTokens(text = '') {
        return String(text || '')
            .replace(/[!！.?？…~,，\s]+$/g, '')
            .split(/[\s,，]+/)
            .map((w) => w.replace(/[^A-Za-z']/g, ''))
            .filter((w) => w.length >= 2);
    }

    function isCommonEnglishParticle(word = '') {
        const w = String(word || '').replace(/'/g, '').toLowerCase();
        return !!(w && COMMON_EN_PARTICLE_RE.test(w));
    }

    function wantsKeepRealEnglish(options = {}) {
        try {
            if (targetLangCore?.resolveSubtitleTargetLang && targetLangCore?.isZhSubtitleTarget) {
                return !targetLangCore.isZhSubtitleTarget(targetLangCore.resolveSubtitleTargetLang(options));
            }
        } catch { /* optional */ }
        const lang = String(options.targetLang || options.subtitleTargetLang || '').trim();
        if (!lang) return false;
        return !/^zh/i.test(lang) && !/中文|hans|hant/i.test(lang);
    }

    function isLatinGarbageZh(text, sourceText = '', options = {}) {
        const t = String(text || '').trim();
        const src = String(sourceText || '');
        if (isLatinSfxAtomZh(t)) {
            // Keep real bilingual cues that already contain Latin in JA.
            if (/[A-Za-z]{3,}/.test(src)) return false;
            return true;
        }
        // Explicit phonetic dump (Phonetic: pī hē há…)
        if (/\bPhonetic\s*:/i.test(t) && !/[A-Za-z]{3,}/.test(src)) {
            return true;
        }
        // Moan + long latin mash (嗯boutelburlbububibipuuhhiizz)
        if (
            /[\u4e00-\u9fff]/.test(t)
            && /[A-Za-z]{8,}/.test(t)
            && !/[A-Za-z]{3,}/.test(src)
            && textLen(t.replace(/[A-Za-z]+/g, '')) <= 4
        ) {
            return true;
        }
        // Pinyin / accent mash with no real CJK content (Ima zhào liu le shéyo?)
        if (
            /[A-Za-z]/.test(t)
            && !/[\u4e00-\u9fff]/.test(t)
            && /[àáâãäåèéêëìíîïòóôõöùúûüýÿāēīōūǎěǐǒǔńňšžç]/i.test(t)
            && /^[A-Za-zÀ-ɏ\s.'…·.•\-—~～!?？！]+$/u.test(t)
            && textLen(t) >= 8
            && !/[A-Za-z]{3,}/.test(src)
        ) {
            return true;
        }

        const keepEn = wantsKeepRealEnglish(options);
        const latinWords = latinWordTokens(t);

        // EN/KO/JA 成片：保留正常英文，只清掉 Grubn 一类短乱码。
        if (keepEn) {
            if (/[A-Za-z]{3,}/.test(src)) return false;
            if (latinWords.length >= 3) return false;
            if (latinWords.length >= 2 && textLen(t) >= 8) return false;
            if (latinWords.length === 1 && isCommonEnglishParticle(latinWords[0])) return false;
            if (latinWords.length === 2
                && latinWords.every((w) => isCommonEnglishParticle(w) || w.length >= 3)) {
                return false;
            }
            if (
                /^[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ'’\-.]{1,16}$/u.test(t)
                && !/[\u4e00-\u9fff]/.test(t)
                && /[\u3040-\u30ff]/.test(src)
                && textLen(src) >= 4
            ) {
                return true;
            }
            // Only pure-Latin short scraps — never flag Han / mixed CJK here.
            return textLen(src) >= 4
                && latinWords.length === 1
                && textLen(t) <= 10
                && !/[\u4e00-\u9fff\u3040-\u30ff]/.test(t)
                && /^[A-Za-z]/.test(t);
        }

        // ZH 成片：日文对白上的拉丁残片 / 整句英文串台视为垃圾，便于补翻成中文。
        if (
            /^[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ'’\-.]{1,16}$/u.test(t)
            && !/[\u4e00-\u9fff]/.test(t)
            && !/[A-Za-z]{3,}/.test(src)
            && /[\u3040-\u30ff]/.test(src)
            && textLen(src) >= 4
        ) {
            return true;
        }
        if (!/^[A-Za-z][A-Za-z\s.'…·.•\-—~～!?？！,]{1,80}$/.test(t) && !/^[A-Za-z]{2,16}[!！.?？…~\s]*$/.test(t)) {
            // Mixed Latin + CJK leftovers from katakana transliteration (Hemp尼斯克)
            if (!/(?:[A-Za-z]{3,}[^A-Za-z\u4e00-\u9fff]*){1,}[\u4e00-\u9fff]/.test(t)) return false;
            if (!isKatakanaNoiseJa(sourceText)) return false;
            return true;
        }
        if (/[A-Za-z]{3,}/.test(src)) return false;
        if (/[\u4e00-\u9fff]/.test(t) && /[A-Za-z]{2,}/.test(t) && textLen(src) >= 4) {
            if (/^[A-Za-z]{2,}(?:\s+[A-Za-z]{1,12}){0,4}\s+[\u4e00-\u9fff]/.test(t)) return true;
            if (/[\u4e00-\u9fff][A-Za-z]{3,}(?:[\s，,？?！!。．.…]|$)/.test(t)) return true;
        }
        // Multi-word English on ZH target over JA is wrong-language garbage.
        if (latinWords.length >= 2 && !/[\u4e00-\u9fff]/.test(t) && /[\u3040-\u30ff]/.test(src)) {
            return true;
        }
        // Short nonsense scrap over JA (Grubn / Boeh / Hello as ZH-path leftover)
        return textLen(src) >= 4 && latinWords.length <= 1 && textLen(t) <= 24;
    }

    /** Long pure-katakana ASR debris (menu / noise), not real dialogue. */
    function isKatakanaNoiseJa(text = '') {
        const t = String(text || '').trim();
        if (!t) return false;
        const bare = t.replace(/[…·.•\-—_~～ー\s、,，.。！!？?]+/g, '');
        if (bare.length < 4) return false;
        if (!/^[\u30a0-\u30ff]+$/.test(bare)) return false;
        // Keep common short loans / adult terms
        if (/^(?:アイス|オイル|キス|ハグ|カメラ|ビデオ|パンツ|エロ|セックス|フェラ|チンポ|マンコ|ベッド|タオル)$/.test(bare)) {
            return false;
        }
        // Strip known lexical adult/SFX/service tokens; leftover short ⇒ not menu noise.
        // Substring hits inside longer junk (ヘンペニスケ) leave enough residue to stay noise.
        const lexical = [
            'ペニス', 'チンポ', 'マンコ', 'セックス', 'オイル', 'マッサージ',
            'フェラ', 'コクコク', 'ゴクゴク', 'ジュポ', 'チュパ', 'エロ', 'クリトリス',
        ];
        let rest = bare;
        for (const tok of lexical) {
            if (tok && rest.includes(tok)) rest = rest.split(tok).join('');
        }
        if (rest.length <= 2 && (bare.length - rest.length) >= 4) return false;
        // Short pure-katakana scrap (≥4) and longer menu noise (≥8)
        return bare.length >= 4;
    }

    function isBlankOrPunctTranslation(text, sourceText = '', options = {}) {
        const t = String(text || '').trim();
        if (!t) return true;
        if (/^[。．.、，,\s…·•\-—_~～]+$/.test(t)) return true;
        if (looksLikeLlmControlLine(t)) return true;
        if (looksLikePromptLeak(t)) return true;
        if (looksLikeSourceEcho(t, sourceText)) return true;
        if (isMostlyUntranslatedJa(t)) return true;

        let intlTarget = false;
        let targetLang = String(
            options.targetLang || options.subtitleTargetLang || options._sanitizeLayers?.lang || '',
        ).trim();
        try {
            if (targetLangCore?.resolveSubtitleTargetLang && targetLangCore?.isZhSubtitleTarget) {
                const lang = targetLangCore.resolveSubtitleTargetLang(options.targetLang
                    ? options
                    : { ...options, subtitleTargetLang: targetLang || options.subtitleTargetLang });
                targetLang = lang || targetLang;
                intlTarget = !targetLangCore.isZhSubtitleTarget(lang);
            } else if (targetLang) {
                intlTarget = !/^zh/i.test(targetLang) && !/中文|hans|hant/i.test(targetLang);
            }
        } catch { /* optional */ }

        if (intlTarget) {
            if (looksLikeEnMtMetaLeak(t)) return true;
            const unnumbered = stripNumberedListMtArtifact(t).text;
            if (!unnumbered || /^[。．.、，,\s…·•\-—_~～*\"“”]+$/.test(unnumbered)) return true;
            if (looksLikeHanLeakForIntlTarget(unnumbered, targetLang)) return true;
            if (looksLikeHanLeakForIntlTarget(t, targetLang)) return true;
            if (looksLikeLatinLeakForIntlTarget(t, targetLang, sourceText)) return true;
            // Skip ZH-track latin-garbage and invent heuristics on EN/KO 成片.
            return false;
        }

        if (isLatinGarbageZh(t, sourceText, options)) return true;
        // Adult register invented onto non-adult JA (polish/QC cross-cue contamination).
        if (looksLikeAdultRegisterInvented(t, sourceText)) return true;
        if (looksLikeOpeningCueInvent(t, sourceText)) return true;
        if (looksLikeFilmingZhInvent(t, sourceText)) return true;
        if (looksLikeMissingFilmingZh(t, sourceText)) return true;
        if (looksLikeCrossCuePlotBleed(t, sourceText)) return true;
        if (looksLikeWomenAudiencePitchInvent(t, sourceText)) return true;
        if (looksLikeLectureSceneBleed(t, sourceText)) return true;
        if (looksLikeBookBlurbInvent(t, sourceText)) return true;
        if (looksLikeHormoneSecreteAsEjacInvent(t, sourceText)) return true;
        if (looksLikeAsrGarbageJaInvent(t, sourceText)) return true;
        if (looksLikeSemanticMisattach(t, sourceText)) return true;
        if (looksLikeStockGlossMisattach(t, sourceText)) return true;
        if (looksLikeFillerGlossMisattach(t, sourceText)) return true;
        if (looksLikeDaijoubuSenseMisattach(t, sourceText)) return true;
        if (looksLikeMultiStockGlueInvent(t, sourceText)) return true;
        if (isSeverelyUnderTranslated(t, sourceText)) return true;
        return false;
    }

    /**
     * ZH has clear adult clinical/slang surface while JA source does not.
     * Used to blank contaminated polish/QC writes for retry.
     */
    function looksLikeAdultRegisterInvented(text, sourceText = '') {
        const t = String(text || '').trim();
        const src = String(sourceText || '').trim();
        if (!t || !src) return false;
        if (textLen(src) < 2) return false;
        // Strong clinical/slang / voyeur-practice bleed (lecture contamination).
        const adultZhStrong = /乳头|肉棒|湿漉|湿透|插进|射了|射精|射出来|会射|做爱|性爱|口交|内射|精液|小穴|鸡巴|最里面|更深入|变硬|爱抚|含住|再多吸|胸部|内裤|触碰都好|达到高潮|用小穴|动个不停|好想要|做爱的样子/;
        // Discourse climax (高潮) alone is too weak — 「现在高潮还太早了」is valid for イクには早.
        const adultZhSoft = /高潮/;
        const adultJa = /乳首|ちんぽ|チンポ|おちん|ちんちん|チンチン|ペニス|まんこ|おまんこ|マンゴ|マン汁|イッ|イキ|イク|いく|入れ|挿入|出して|射精|セックス|せっくす|SEX|エロ|ぬるぬる|舐めて|咥|中出し|犯[しす]|コクコク|フェラ|汁|カリ|おこちょ|デカチ|んぽ|奥まで|奥に|硬く|おっぱい|胸|濡れ|ぬれ|パンツ|パンティ|下着|脱が|脱い/;
        const hasAdultZh = adultZhStrong.test(t) || adultZhSoft.test(t);
        if (!hasAdultZh) return false;
        // Hormone secrete misread as ejaculation — check before adultJa exemption
        // (セックスしなくても出るんです is medical, not climax).
        if (looksLikeHormoneSecreteAsEjacInvent(t, src)) return true;
        if (adultJa.test(src)) return false;
        // Soft-AV sensation JA may legitimately carry soft clinical ZH after domain remap.
        // Bare「身体で元気」is health small-talk — do NOT exempt.
        if (/(?:気持ち|きもち|熱い|身体は|触って|舐めて|エッチ|喘|腰を|奥まで|ちん|まん|入れ|イッ|濡れ)/.test(src)) {
            return false;
        }
        // Greeting / hospital / meal / family / opening narrative JA must never keep adult ZH.
        if (/(?:ただいま|お疲れ|久し|いらっしゃい|おはよう|ごめん|失礼|お邪魔|そうめん|ご飯|天気|仕事|帰郷|駅まで|歩きたかった|朝\s*早く|起きちゃって|予定より|兄に嫁|兄さんとは|いい嫁|真面目で優しく|立ち話|昼飯|奮発|遠慮せず食え|奏くん来|かなめくん|沙羅さん|弟思い|年の離れている|ネギ落|さっぱり|ちょっと暑い|どうしたの)/.test(src)) {
            return true;
        }
        // Medical / lecture exposition JA (hormone talk, how-to intro) — blank adult paste.
        if (isLectureExpositoryJa(src) && adultZhStrong.test(t)) {
            return true;
        }
        // Soft 高潮 alone without greeting context is not invent evidence.
        if (!adultZhStrong.test(t)) return false;
        // Short pure interjection / name-call JA with long adult ZH.
        const bareSrc = src.replace(/[\s　]+/g, '');
        if (
            textLen(src) <= 10
            && textLen(t) >= 8
            && /^(?:あ+|う+|ん+|はぁ+|はい|うん|ねえ|とーとー)[ー〜～]*$/u.test(bareSrc)
        ) {
            return true;
        }
        // Health / meal / family openings (broader than the regex above).
        if (isMundaneHospitalOrMealJa(src)) return true;
        // Health small-talk misread as adult.
        if (/元気してたか/.test(src) && adultZhStrong.test(t)) return true;
        return false;
    }

    /**
     * Short greeting / opening JA got a long unrelated ZH (polish/QC cross-cue write).
     * Blank for re-MT when no deterministic gloss is available.
     */
    function looksLikeOpeningCueInvent(text, sourceText = '') {
        const t = String(text || '').trim();
        const src = String(sourceText || '').trim();
        if (!t || !src) return false;
        const sl = textLen(src);
        const tl = textLen(t);
        if (sl < 2 || sl > 28) return false;
        const openingJa = /^(?:ただいま|おかえり|お帰り|はーい|ありがとう|すみません|ごめん|失礼します|お邪魔します|お久しぶり|こんにちは|こんばんは|おはよう|いらっしゃい)/;
        const openingMid = /お久しぶり|いらっしゃい|お邪魔します|そうめん|帰郷|予定より早く|駅まで迎え|歩きたかった|朝\s*早く|起きちゃって|真面目で優しく|いい嫁|立ち話|昼飯|弟思い|ネギ落/;
        const isOpening = openingJa.test(src) || (openingMid.test(src) && sl <= 28);
        if (!isOpening) return false;
        // Bare はい is too common in adult dialogue — only short cue.
        if (/^はい[ー〜～。．.!！?？\s]*$/u.test(src) && sl <= 4 && tl >= 8) return true;
        if (/^はい/.test(src) && sl > 4) return false;
        if (zhHasMundaneContentAnchor(t, src)) return false;
        if (/我回来了|欢迎回来|好久不见|打扰了|凉面|素面|请进|回来|早上起|想走走|车站/.test(t) && tl <= sl + 8) {
            return false;
        }
        // Meal ZH stuck onto non-meal opening JA (そうめん line → 朝早く).
        if (/凉面|素面/.test(t) && !/そうめん|麺/.test(src)) return true;
        // Opening-mid JA with no topic anchors → cross-cue invent (even if length close).
        if (openingMid.test(src) && !zhHasMundaneContentAnchor(t, src) && tl >= 6) {
            return true;
        }
        // Greeting openings: require ZH clearly longer than JA.
        if (tl < Math.max(8, sl + 3)) return false;
        // Long ZH with no overlap to short opening JA → cross-cue invent.
        return tl >= Math.max(12, sl * 2);
    }

    /**
     * True when a translated cue looks pathologically broken vs its source
     * (caller may retry the batch / cue).
     */
    function isPathologicalMtText(text, sourceText = '', options = {}) {
        const t = String(text || '');
        const srcLen = textLen(sourceText);
        const tLen = textLen(t);
        if (!tLen) return false;
        if (looksLikePromptLeak(t)) return true;
        if (looksLikeSourceEcho(t, sourceText)) return true;
        let intlTarget = false;
        let targetLang = String(options.targetLang || options.subtitleTargetLang || '').trim();
        try {
            if (targetLangCore?.resolveSubtitleTargetLang && targetLangCore?.isZhSubtitleTarget) {
                const lang = targetLangCore.resolveSubtitleTargetLang(options);
                targetLang = lang || targetLang;
                intlTarget = !targetLangCore.isZhSubtitleTarget(lang);
            }
        } catch { /* optional */ }
        if (intlTarget) {
            if (looksLikeHanLeakForIntlTarget(t, targetLang)) return true;
            if (looksLikeLatinLeakForIntlTarget(t, targetLang, sourceText)) return true;
            if (isLatinGarbageZh(t, sourceText, options)) return true;
            // Skip ZH-path under-translate heuristics on EN/KO/JA 成片.
        } else {
            if (looksLikeJaZhMixedLeak(t, sourceText)) return true;
            if (isSeverelyUnderTranslated(t, sourceText)) return true;
            if (isLatinGarbageZh(t, sourceText, options)) return true;
        }
        const maxMul = Math.max(3, Number(options.pathologicalMul) || 5);
        if (srcLen > 0 && tLen > Math.max(60, srcLen * maxMul)) return true;
        if (fluency?.hasHeavyRepetition?.(t) && tLen > Math.max(30, srcLen * 2)) return true;
        if (/__GLOS[A-Z0-9]*|Gloss#{0,4}\d+_*/i.test(t)) return true;
        if (/GLOS?S?\d{2,8}/i.test(t)) return true;
        if (/_#G\d+|_#_/.test(t)) return true;
        if (/[\u4e00-\u9fff]_+[\u4e00-\u9fff]/.test(t)) return true;
        if (/__[^_\n]{1,64}__/.test(t)) return true;
        if (/改成[：:]/.test(t)) return true;
        return false;
    }

    return {
        GLOSS_TOKEN_RE,
        BARE_GLOSS_TOKEN_RE,
        HASH_GLOSS_TOKEN_RE,
        GENERIC_PLACEHOLDER_RE,
        POLLUTION_NAME_STEMS,
        stripMtArtifacts,
        collapseSpacedCjkChars,
        stripLlmThinkWrappers,
        stripLlmControlTokens,
        looksLikeLlmControlLine,
        stripEdgeCommas,
        stripPromptLeak,
        looksLikePromptLeak,
        looksLikeGlossaryDump,
        looksLikeSourceEcho,
        looksLikeJaZhMixedLeak,
        sourceLooksLikeJapanese,
        isMostlyUntranslatedJa,
        stripKatakanaDashDebris,
        stripTrailingOrphanName,
        stripUnjustifiedPollutionNames,
        stripUnjustifiedSoleOrLeadingName,
        repairNnHmmNamePlaceholder,
        repairOtousanInventedNameZh,
        collapseDePhraseEchoes,
        collapseHonorificEchoes,
        stripSpuriousNamePrefixes,
        stripResidualJaInZh,
        normalizeZhHonorificFromJaSan,
        fixKinshipHonorificMistranslations,
        recoverNeeNeeGivenName,
        sourceJustifiesZhName,
        capPathologicalLength,
        extractJaPersonRefs,
        extractZhPersonRefs,
        buildNameReplaceRules,
        inferNameRulesFromCuePairs,
        applyNameConsistency,
        sanitizeMtCueText,
        sanitizeMtCueTextLight,
        looksLikeHanLeakForIntlTarget,
        scrubHanLeakForIntlTarget,
        looksLikeLatinLeakForIntlTarget,
        scrubLatinLeakForIntlTarget,
        looksLikeLatinBrandOrSiteToken,
        intlTargetBucket,
        stripNumberedListMtArtifact,
        looksLikeEnMtMetaLeak,
        finalizeIntlMtDeliveryText,
        sanitizeMtCues,
        resolveSubtitleTargetLang: targetLangCore?.resolveSubtitleTargetLang,
        resolveSanitizeLayers: targetLangCore?.resolveSanitizeLayers,
        isZhSubtitleTarget: targetLangCore?.isZhSubtitleTarget,
        dropUselessEllipsisCues,
        pruneAsrDebrisCuePairs,
        isDeterministicAsrDebrisJaForSanitize,
        rematerializeTranslatedOntoSource,
        fillBlankZhSlotsFromJa,
        polishOrphanStuckZh,
        stripUnjustifiedBuyaoGlue,
        repairWetPolarityZh,
        repairMundaneJaMistranslation,
        remapMundaneHospitalOrMealJa,
        isMundaneHospitalOrMealJa,
        jaJustifiesRefusalZh,
        polishTruncatedReactiveZh,
        recoverBlankedAdultZh,
        jaCueHasLexicalResidue,
        unstickCrossCueZh,
        correctJaAsrDomainMishears,
        correctJaAsrDomainMishearsInCues,
        correctZhDomainMistranslations,
        applyTrainedZhRemaps,
        reloadTrainedRemaps,
        loadBundledTrainedRemaps,
        loadOfficialTrainedRemaps,
        loadUserSandboxTrainedRemaps,
        get TRAINED_ZH_REMAPS() { return TRAINED_ZH_REMAPS; },
        get TRAINED_ASR_PAIRS() { return TRAINED_ASR_PAIRS; },
        isBlankOrPunctTranslation,
        looksLikeAdultRegisterInvented,
        looksLikeOpeningCueInvent,
        looksLikeFilmingZhInvent,
        looksLikeMissingFilmingZh,
        looksLikeCrossCuePlotBleed,
        looksLikeWomenAudiencePitchInvent,
        looksLikeLectureSceneBleed,
        looksLikeBookBlurbInvent,
        looksLikeHormoneSecreteAsEjacInvent,
        isLectureExpositoryJa,
        looksLikeAsrGarbageJaInvent,
        looksLikeSemanticMisattach,
        looksLikeStockGlossMisattach,
        looksLikeFillerGlossMisattach,
        looksLikeDaijoubuSenseMisattach,
        looksLikeMultiStockGlueInvent,
        isEllipsisOrEmptyZh,
        isPathologicalMtText,
        isSeverelyUnderTranslated,
        shortRemapAdequateForJa,
        jaMostlyCoveredByShortGloss,
        isLatinGarbageZh,
        isKatakanaNoiseJa,
        isFillerOnlyZh,
        isMoanOrSfxHeavyJa,
        isAvSoftContext,
        shouldBlankFakeGreeting,
        isWetOralSfxOnlyZh,
        isWetOralSfxOnlyJa,
        isShioHitSfxOnlyJa,
        stripWetOralSfxFromZh,
        stripWetOralSfxFromJa,
        normalizeBreathMoanZh,
        isBareHaBreathZh,
        isUnderTranslatedLickZh,
        recoverBareHaBreathZh,
        stripJaBreathMoans,
        remapJaPreferLexical,
        recoverFillerZhFromLexicalJa,
        normalizeEmphaticDashZh,
        textLen,
        get JA_ASR_DOMAIN_FIXES() { return JA_ASR_DOMAIN_FIXES; },
        get JA_ASR_DOMAIN_FIX_PAIRS() { return JA_ASR_DOMAIN_FIX_PAIRS; },
        reloadJaAsrDomainBasePairs,
        reloadJaAsrDomainFromBundled,
    };
}));
