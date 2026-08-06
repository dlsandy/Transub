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
    const api = factory(fluency, glossaryCore, jaNames, nsfwLex, mtOpaque);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubMtSanitize = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function mtSanitizeCoreFactory(fluency, glossaryCore, jaNames, nsfwLex, mtOpaque) {
    /** Engine protect placeholders + accidental "Gloss1234" / "GLOS2658克" leaks. */
    const GLOSS_TOKEN_RE = /__GLOSS\d*__|__GLOS\d*__|Gloss#{0,4}\d+_*/gi;
    /** Bare glossary ids the model invents without underscores (GLOS2658克 / GLOSS12 / GLOSSES2152). */
    const BARE_GLOSS_TOKEN_RE = /GLOS[A-Z]*\d{2,8}(?:克|[gG])?/gi;
    /** Any double-underscore LLM/meta placeholder (e.g. __香水的代号__). */
    const GENERIC_PLACEHOLDER_RE = /__([^_\n]{1,64})__/g;

    const JA_PERSON_RE = /([一-龯ぁ-んァ-ンー]{1,6}?)(さん|くん|ちゃん|君|様|氏)/g;
    const ZH_PERSON_RE = /([\u4e00-\u9fff]{1,4})(同学|小姐|先生|桑|君|酱|酱酱|大人|老师)/g;

    const OT = mtOpaque?.T || {};
    const OFIX = mtOpaque?.FIX || {};
    const COMMON_KEEP_TOKENS = new Set([
        '好的', '是的', '不是', '没有', '可以', '不行', '没事', '对不起', '抱歉',
        '谢谢', '再见', '加油', '真的', '当然', '怎么', '什么', '哪里', '为什么',
        '好吧', '好啦', '嗯嗯', '啊啊', '哈哈', '呵呵', '唉呀', '哎呀',
        '明白了', '知道了', '了解了', '清楚了', '辛苦了', '麻烦了', '失礼了',
        '明白', '知道', '了解', '清楚', '辛苦', '拜托', '拜托了',
        '要去了', '好舒服', '舒服吗', '好开心', '也亲亲我', '亲一下',
        '别哭', '超棒', '好纠结', '振作起来', '别捣乱', '恰皮',
        ...(OT.rodZh ? [OT.rodZh] : []),
        ...(OT.meatRodZh ? [OT.meatRodZh] : []),
        '用那种心情', '再慢一点等我', '又消失了呢',
    ]);

    /** Frequent Sakura/LN hallucination names — prefer shared lexicon when available. */
    const POLLUTION_NAME_STEMS = jaNames?.POLLUTION_NAME_STEMS || new Set([
        '佳奈', '玲奈', '莉奈', '纱奈', '沙奈', '真理', '斗碧', '绘里', '绘真',
        '杏奈', '露娜', '妮可', '绮罗', '美咲', '结衣', '爱奈', '理绪', '理子',
        '乃爱', '奏翔', '桃子', '春奈', '阳菜', '凛', '葵', '樱',
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
     * 「根据以下的英文描述…将它翻译成「哈啊」，请勿翻译成别的词…」
     * and NSFW / faithful system-prompt echoes (first-cue classic):
     * 「你是日译中字幕翻译。按汉化组习惯…严禁净化…」
     */
    const PROMPT_LEAK_RE = /将下面的日文|将下面术语表|将下面的?[【\[]|将下面这句|只输出译文|共\s*\d+\s*行|翻译的行数|请不要超过|请勿删除|根据以下术语表|根据以下的?.{0,16}(?:描述|翻译记录|英文句子)|不要编号[、，,]?\s*不要解释|碎句与拟声|lex-\d|请勿翻译成别的词|不翻译任何注释|如果描述中含有|请在不翻译|无须复译|照译出来|同音异义词|[你我]是(?:一个)?日译中字幕翻译|汉化组习惯|严禁净化|和谐或委婉改写|禁止照抄假名|每行只译对应一行|无意义叠词循环|忠实语气模式|译名表|移至对应句中/i;

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
        { from: 'いあちゅい', to: 'イッちゃう' },
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
                    if (Array.isArray(pairs) && pairs.length) return pairs;
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

    function loadBundledTrainedRemaps() {
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
    const WET_ORAL_SFX_ZH_ATOM = '(?:咕咚|咕啾|扑哧|滋溜|叽噜|咕噜+|咕{2,}|啾+|滋{1,}|噜+|噗|啪)';
    const WET_ORAL_SFX_JA_ATOM = '(?:ん?ちゅっ|ん?ちゅぱっ?|ん?ちゅぽっ?|ん?ちゅばっ?|ん?ちゅぅ+|ん?ちゅる+[っッ]*'
        + '|ん?(?:ぢゅ|ヂュ)ぅ+'
        + '|ちゅうう+|ん?チュッ|ん?チュパッ?|ん?チュバッ?|ん?チュゥ+'
        + '|ちゅば(?:っ|ちゅば)*|チュバ(?:ッ|チュバ)*'
        + '|ちゅ(?=[…·.…!！?？、,\\s]|$)'
        + '|ん?(?:ぢゅ|じゅ|ジュ)(?:っ|ぼっ?|ぽっ?|ぶっ?|ブッ?|ぷっ?|ぱっ?|パッ?|る+[っッ]*|ぅ+|ぶ+|ブ+|ば+|バ+)+'
        + '|ず(?:ぢゅ|じゅ)(?:ぼ|ぢゅぼ|じゅぼ)*[っッ]?'
        + '|くちゅ[うっんン]+|ぐちゅ[うっんン]+|ごく[んっンッ]+|ゴク[リッんン]+'
        + `|${(typeof mtOpaque?.d === 'function' ? mtOpaque.d('44GU44Gj44GP44KTfOOCtOODg+OCr+ODsw==') : '') || 'x'}`
        + '|コクン|こくん|ぺろっ?|れろっ?|んぐっ?|ぷっ|あむっ|んむっ|んむぎゅ'
        + '|んにゅごっきゅ|ぶっつぅ+|ぶ{2,}[っッ]?|ブ{2,}[ッっ]?|じゅば[ばっッ]*|ジュバ[バッっ]*|ちゅぷん?|チュプン?|ごぼっ?|ゴボッ?|ぬぷっ?)';
    const AV_MISC_SFX_JA_ONLY = /^(?:[グぐ][ルる]+[っッ]*|ブフッ?|ロー+|トゥゥ*|チラッ|ぱっ|ちょむ|チョム)[。．.!！?？…\s]*$/u;

    /** Opening BGM / hit SFX Whisper often invents as シオシオ… (≠ lexical 潮吹き dialogue). */
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
        const guards = [];
        s = s.replace(/(?:ちゅ[ーう]+|チュー+)も?して[よね]?っ?|キスして[よね]?っ?/g, (m) => {
            const key = `\uE000${guards.length}\uE001`;
            guards.push(m);
            return key;
        });
        s = s.replace(new RegExp(`(?:${WET_ORAL_SFX_JA_ATOM})[\\s、,．.…!！?？ー〜～・･]*`, 'gu'), '');
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
        if (/屁股/.test(cur) && !/(?:尻|お尻|ケツ|臀部)/.test(src)) {
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
            cur = /[!！]/.test(src) ? '哈啊——！' : '哈啊、哈啊';
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
        if (isLatinGarbageZh(cur, src)) {
            cur = '';
            mark('latin_garbage');
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

        // シオ hit SFX →「初音」/「湿哦」hallucination (opening BGM; JA has no 初音/潮吹き cue)
        if (
            isShioHitSfxOnlyJa(src)
            && (/初音/.test(cur) || (/湿[哦喔噢奥]?/.test(cur) && !/潮|吹|出水/.test(cur)))
            && !/初音|潮吹|潮を/.test(src)
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
            } else if (/^ただいま[。．!！?？\s]*$/.test(srcTrim)) {
                if (!/我回来了|回来了/.test(cur) || /^(?:喂|回家了)[。．!！?？\s]*$/.test(cur.trim())) {
                    cur = '我回来了。';
                    mark('domain_term');
                }
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
     * Remove Engine/LLM glossary placeholder debris from one string.
     * @param {string} text
     * @returns {{ text: string, changed: boolean, glossHit: boolean }}
     */
    function stripMtArtifacts(text) {
        const raw = String(text ?? '');
        let next = raw.replace(GLOSS_TOKEN_RE, '');
        next = next.replace(BARE_GLOSS_TOKEN_RE, '');
        const glossHit = next !== raw;
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
        if (/成人向内容|成人向\/?\s*R\s*级/.test(t)) hits += 1;
        if (/和谐或委婉改写|委婉改写/.test(t)) hits += 1;
        if (/性相关与粗俗|粗俗用语/.test(t)) hits += 1;
        if (/禁止照抄假名/.test(t)) hits += 2;
        if (/每行只译对应一行|每行只输出对应/.test(t)) hits += 1;
        if (/无意义叠词循环/.test(t)) hits += 1;
        if (/禁止臆造角色名|文末乱贴人名/.test(t)) hits += 1;
        if (/忠实语气模式/.test(t)) hits += 2;
        if (/禁止以安全政策为由拒答/.test(t)) hits += 2;
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
        next = next.replace(/lex-\d[^\s]*/gi, '');
        // Adult-tone system / faithful instruction blocks rarely leave usable dialogue
        next = next.replace(/[你我]是(?:一个)?日译中字幕翻译[^。\n]{0,80}[。.]?/g, '');
        next = next.replace(/按汉化组习惯[^。\n]{0,120}[。.]?/g, '');
        next = next.replace(/严禁净化[^。\n]{0,80}[。.]?/g, '');
        next = next.replace(/忠实语气模式[^。\n]{0,100}[。.]?/g, '');
        next = next.replace(/[^\S\n]{2,}/g, ' ').trim();
        if (
            looksLikePromptLeak(next)
            || looksLikeGlossaryDump(next)
            || /输出译文|不要解释|术语表|译名表|请勿翻译|请勿删除|不翻译任何注释|根据以下|无须复译|照译|同音异义词|第.{0,4}单词|日译中字幕翻译|汉化组|严禁净化|忠实语气模式|移至对应句中/.test(next)
            || (Array.from(next.replace(/\s+/g, '')).length <= 4 && /[「『"'“]/.test(raw))
            // Strong paraphrase cues in the original → residual fragments are not dialogue
            || (/根据以下的?.{0,16}(?:翻译记录|英文句子|描述)/.test(raw)
                && Array.from(next.replace(/\s+/g, '')).length > 0)
            || (/[你我]是(?:一个)?日译中字幕翻译|汉化组习惯|严禁净化|忠实语气模式/.test(raw)
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
        return (t.match(/[\u3040-\u30ff]/g) || []).length >= 2;
    }

    /**
     * Short cue that is still mostly kana (failed MT / copy-through).
     * @param {string} text
     * @returns {boolean}
     */
    function isMostlyUntranslatedJa(text) {
        const t = String(text || '').trim();
        if (!t) return false;
        const kana = (t.match(/[\u3040-\u30ff]/g) || []).length;
        const han = (t.match(/[\u4e00-\u9fff]/g) || []).length;
        const len = Array.from(t).length;
        // Short cues: kana dominates Han
        if (len <= 24) return kana >= 2 && kana > han;
        // Longer cues: kana-heavy relative to Han (pure JA copy-through)
        return kana >= 6 && kana >= Math.max(4, Math.floor(han * 0.35));
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
        if (src) {
            const norm = (s) => s.replace(/\s+/g, '');
            if (t === src || norm(t) === norm(src)) {
                // Same string: only failed JA→ZH when source is Japanese
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
        }
        // Kana-heavy output only counts as failed MT when translating from Japanese
        if (src && !srcIsJa) return false;
        return isMostlyUntranslatedJa(t);
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
            const headTrim = String(head || '').trim();
            if (/[，,、；;：:]$/.test(headTrim)) return false;
            if (/[…·]$/.test(headTrim)) return false;
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
        }
        // Orphan honorific after wiping JA stem (keep「美羽小姐」; drop bare「小姐」/「的小姐」)
        cur = cur.replace(/的(?:小姐|先生|同学|桑|君|酱)(?=[\s，,、。！？!…]|$)/g, '');
        cur = cur.replace(
            /(?<![\u4e00-\u9fff])(?:小姐|先生|同学|桑|君|酱)(?=[\s，,、。！？!…]|$)/g,
            '',
        );
        // Moan kana leftover glued to ZH interjections: 啊ん → 啊
        cur = cur.replace(/([啊嗯哈呼哦噢欸诶])ん/g, '$1');
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
            return /^[\u4e00-\u9fff]{1,4}(?:同学|小姐|先生|桑|君|酱|大人|老师)$/.test(String(form || ''));
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
            return '哈哈';
        }
        if (/^はい$/.test(bare)) return '好的';
        if (/^うん$/.test(bare)) return '嗯嗯';
        if (/^ええ$/.test(bare)) return '嗯嗯';
        // Incomplete discourse trailers — most common LLM skip class after retries
        if (textLen(s) <= 14) {
            const stem = bare
                .replace(/[…・.…!！?？\s]+$/g, '')
                .replace(/^[…・.\s]+/, '')
                .replace(/[〜～]+$/g, '');
            const trail = {
                'いや': '不', 'でも': '但是', 'だから': '所以', 'じゃあ': '那就',
                'それに': '而且', 'やっぱり': '果然', 'もう': '已经', 'あの': '那个',
                'そして': '然后', 'その': '那个', 'これ': '这个', 'それでは': '那么',
                'さて': '那么', 'な': '呐', 'なあ': '呐', 'ねぇ': '喂', 'おい': '喂',
                'えー': '诶', 'へー': '诶', 'あれ': '咦', 'ちょ': '等一下',
                'そうか': '是吗', 'あい': '哎', 'ふむ': '嗯', 'ふぅむ': '嗯', 'フー': '呼',
                'よかったら': '可以的话', '今まで': '至今为止', 'これから': '接下来',
                '先に': '先', 'したい': '想要',
                'じゃあね': '再见啦', 'またね': '再见', 'ありがと': '谢谢',
                'やば': '糟了', 'ヤバ': '糟了', 'すげえ': '好厉害', 'すごい': '好厉害',
                'なるほど': '原来如此', '待っ': '等一下', 'だって': '因为', 'じゃ': '那就',
                'チッ': '啧', 'うま': '真棒', 'でか': '好大',
            };
            if (Object.prototype.hasOwnProperty.call(trail, stem)) {
                const zh = trail[stem];
                return /[…・]/.test(s) ? `${zh}……` : zh;
            }
            if (/^(?:だめ|ダメ|駄目)(?:だよ|だって|です)?$/.test(
                bare.replace(/[…・.\s]+$/g, ''),
            )) return /[…・]/.test(s) ? '不行……' : '不行';
            if (/^お願いします$/.test(bare.replace(/[…・.\s]+$/g, ''))) return '拜托了';
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
            return /はぁ|はあ|はあっ|ハァ/.test(s) ? '哈啊，该死' : '该死';
        }
        if (/大丈夫だって/.test(s) && /気にし/.test(s) && textLen(s) <= 36) {
            return '没关系的，别在意那种事';
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
            return /はぁ|はあ|ハァ/.test(s) ? '哈啊，好可爱' : '好可爱';
        }
        if (/求めて/.test(s) && textLen(s) <= 24) return '想要我……';
        if (/もっと入れて/.test(s) && textLen(s) <= 28) {
            return /はぁ|はあ|だんなら|それなら/.test(s) ? '哈啊，那就再插进来' : '再插进来';
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
        if (/^(?:もぐ|モグ|むぐ){2,}/.test(s) && textLen(s) <= 16) return '嗯嗯';
        // Oral chew / muffled moans (んむぅ / あむ / むにゃ) — keep timing, not wet 咕啾
        if (
            /(?:んむ|あむ|むにゃ|むぐ|もぐ|モグ)/.test(s)
            && textLen(s) <= 28
        ) {
            const lexical = s.replace(
                /(?:んむ[ぅうゥウっッ]*|あむ[ぅうゥウっッ]*|むにゃ[ぁア]*|むぐ+|もぐ+|モグ+|[ぅうゥウっッむムんンあアぁァはぁはあハァ…・!?！？。、,\s]+)/g,
                '',
            );
            if (textLen(lexical) <= 2) {
                if (/すごい|すげ[えぇー]/.test(s)) return '嗯嗯，好厉害';
                if (/はぁ|はあ|ハァ/.test(s)) return '嗯嗯，哈啊';
                return '嗯嗯';
            }
        }
        if (/^(?:[グぐ][ルる]+|[ガが][ルる]+)[っッ…。．.\s!！?？]*$/.test(s)) return '呜呜';
        if (/^(?:ジー+|じー+)[っッ…。．.!！?\s]*$/.test(s)) return '盯……';
        if (/^(?:ずきゅ|ズキュ)[っッ]?[…。．.!！?\s]*$/.test(s)) return '嗯……';
        if (/^(?:オオォ+|おぉぉ+|オー+)[っッ]*[!！?？…。．.\s]*$/.test(s)) return '哦——！';
        if (/あひ[ゃっ]|ひゃひゃ|あひゃ/.test(s) && textLen(s) <= 24) return '啊啊';
        if (/^あひっ/.test(s) && textLen(s) <= 16) return '啊啊';
        if (/^ぽっ[!！?？…。．.\s]*$/.test(s)) return '啵';
        if (/^ぴっ[!！?？…。．.\s]*$/.test(s)) return '哔';
        if (/うれしい|嬉し[いっ]/.test(s) && textLen(s) <= 12) return '好开心';
        if (/気持ちいい|きもちいい|きもちいっ|きもちぃ|キモチイイ/.test(s)) {
            return /[?？]/.test(s) ? '舒服吗？' : '好舒服';
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
        if (/^[はハはぁアァうぅウゥんンー〜～っッああん!！?？…。．.、，,\s♡]+$/.test(s)) {
            const haaRuns = (s.match(/[はハはぁアァ][ぁァ]?[っッ]?/g) || []).length;
            if (haaRuns >= 2 || /(?:はぁ|はあ|ハァ|はあっ)[、,\s…]*((?:はぁ|はあ|ハァ|はあっ)[、,\s…]*)+/.test(s)) {
                return /[!！]/.test(s) ? '哈啊——！' : '哈啊、哈啊';
            }
            if (/[はハ]/.test(s) && !/[あァぁあんン]/.test(s.replace(/[はハ]/g, ''))) {
                return /[!！]/.test(s) ? '哈——！' : '哈啊';
            }
            if (/[んン]/.test(s) && !/[あァぁ]/.test(s)) {
                return /[!！]/.test(s) ? '嗯——！' : '嗯';
            }
            if (/[うぅウゥ]/.test(s) && !/[あァぁ]/.test(s)) return '呜……';
            return /[!！]/.test(s) ? '啊——！' : '啊……';
        }
        if (/綺麗|きれい|キれい/.test(s) && textLen(s) <= 14) {
            if (/ミカ|美[亜亞香]/.test(s)) return '好漂亮啊';
            return '好漂亮';
        }
        if (/あったかい/.test(s) && /べろ|舌/.test(s) && textLen(s) <= 24) {
            return '好温暖的舌头';
        }
        if (/すごいよ/.test(s) && textLen(s) <= 20) {
            return '好厉害';
        }
        if (/疲れた/.test(s) && textLen(s) <= 12) {
            return /はぁ|はあ|ハァ/.test(s) ? '哈啊…好累' : '好累';
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
        if (!/^(?:啊[啊]?[，,。．.…]*|嗯[嗯]?[，,。．.…]*|哦[，,。．.]?|哈[啊]?[，,。．.…]*|好|好的|好厉害|哈哈[。．.!！]?|呵呵[，,。．.]?|喂[，,。．.]?|哥哥[，,。．.]?|来[，,。．.]?|来吧[，,。．.]?|完了[，,。．.]?|不过[，,。．.]?|谢谢[，,。．.]?|哭了|是的|啧[，,。．.]?|…+)$/.test(cur)) {
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
        const remapped = remapZhFromJaSimple(src);
        if (remapped == null || remapped === cur) return { text: cur, changed: false };
        return { text: remapped, changed: true };
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
        return { text: cur, changed: false };
    }

    function remapLongZhOnReactiveJa(text, sourceText = '') {
        const cur = String(text || '').trim();
        const src = String(sourceText || '').trim();
        if (!cur || !src) return { text: cur, changed: false };
        const zk = zhNormKey(cur);
        if (zk.length < 6) return { text: cur, changed: false };
        const remapped = remapZhFromJaSimple(src);
        if (remapped == null) return { text: cur, changed: false };
        if (
            /^[はハはぁアァうぅウゥんンー〜～っッああん!！?？…。．.、，,\s♡]+$/.test(src)
            || /^あはは|^ははは/.test(src)
        ) {
            return { text: remapped, changed: remapped !== cur };
        }
        return { text: cur, changed: false };
    }

    /**
     * Break consecutive identical ZH when Japanese sources differ (MT stuck loop).
     */
    function unstickCrossCueZh(translatedCues, sourceCues = []) {
        const zhList = Array.isArray(translatedCues) ? translatedCues.map((c) => ({ ...c })) : [];
        const srcList = Array.isArray(sourceCues) ? sourceCues : [];
        let changed = 0;
        for (let i = 0; i < zhList.length; i += 1) {
            const src = String(srcList[i]?.text ?? '');
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
        }
        let i = 0;
        while (i < zhList.length) {
            const zk = zhNormKey(zhList[i]?.text);
            if (!zk || zk.length < 2) {
                i += 1;
                continue;
            }
            let j = i + 1;
            while (j < zhList.length && zhNormKey(zhList[j]?.text) === zk) j += 1;
            const streak = j - i;
            const minStreak = zk.length >= 6 ? 2 : 3;
            if (streak >= minStreak) {
                const jaKeys = [];
                for (let k = i; k < j; k += 1) {
                    jaKeys.push(jaNormKey(srcList[k]?.text));
                }
                const uniq = new Set(jaKeys.filter(Boolean));
                if (uniq.size >= Math.min(2, streak)) {
                    const firstJa = jaKeys[0] || '';
                    for (let k = i; k < j; k += 1) {
                        const ja = String(srcList[k]?.text ?? '');
                        const jk = jaKeys[k - i] || '';
                        if (k === i && jk === firstJa) continue;
                        if (jk && jk === firstJa) continue;
                        const remapped = remapZhFromJaSimple(ja);
                        const next = remapped != null ? remapped : (zk.length >= 4 ? '…' : zhList[k].text);
                        if (next !== zhList[k].text) {
                            zhList[k] = { ...zhList[k], text: next };
                            changed += 1;
                        }
                    }
                }
            }
            i = j;
        }
        return { cues: zhList, changed };
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
        const loopStrippedSource = options.loopStrippedSource != null
            ? String(options.loopStrippedSource)
            : (jaNames?.stripAsrHallucinationLoops
                ? jaNames.stripAsrHallucinationLoops(sourceText).text
                : String(sourceText || ''));
        const justifyOpts = { loopStrippedSource };
        const cueOpts = { ...options, justifyOpts };

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
            // Wet/shio JA → Latin mash / 湿哦 phonetic halluc (opening BGM false ASR)
            if (
                String(sourceText || '').trim()
                && (isWetOralSfxOnlyJa(sourceText) || isShioHitSfxOnlyJa(sourceText))
                && (
                    /[A-Za-z]{3,}/.test(cur)
                    || (/湿[哦喔噢奥]?/.test(cur) && !/潮|吹|出水/.test(cur))
                )
            ) {
                cur = '';
                changed = true;
                if (!flags.includes('wet_sfx')) flags.push('wet_sfx');
                senseSource = '';
            }
            // んぶっ / ちゅぷ / あいぐっ → Whisper/MT inserts English scraps
            if (
                /んぶっ|んブッ|ぶっん|ちゅぷ|チュプ|あいぐっ/.test(String(sourceText || ''))
                && /\b(?:bump|gross|pun)\b/i.test(cur)
            ) {
                cur = cur.replace(/\b(?:bump|gross|pun)\b/gi, '')
                    .replace(/吃(?=[…·.\s]|$)/g, '')
                    .replace(/\s{2,}/g, ' ')
                    .replace(/[，,]{2,}/g, '，')
                    .trim();
                changed = true;
                flags.push('wet_sfx');
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

        const residualJa = stripResidualJaInZh(cur, loopStrippedSource || sourceText);
        if (residualJa.changed) {
            cur = residualJa.text;
            changed = true;
            flags.push('residual_ja');
        }

        const kinship = fixKinshipHonorificMistranslations(cur, loopStrippedSource || sourceText);
        if (kinship.changed) {
            cur = kinship.text;
            changed = true;
            flags.push('kinship');
        }

        const sanHonor = normalizeZhHonorificFromJaSan(cur, loopStrippedSource || sourceText);
        if (sanHonor.changed) {
            cur = sanHonor.text;
            changed = true;
            flags.push('san_honorific');
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
        if (stages) stages.afterDomain = cur;

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
        let blankAdult = (recoverSrc && !flags.includes('prompt_leak'))
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
            && /哈啊/.test(cur)
            && !/厉害|好厉/.test(cur)
        ) {
            cur = `${String(cur).trim()}，好厉害`;
            changed = true;
            flags.push('wet_sfx_recover');
        }

        // Never leave a dialogue source with a totally empty ZH (engine/post may drop the cue).
        // Prefer short-JA / moan recovery one last time before «…» placeholder.
        if (!String(cur).trim() && recoverSrc && !flags.includes('prompt_leak')) {
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
        } else if (!String(cur).trim() && (flags.includes('wet_sfx') || flags.includes('prompt_leak'))) {
            cur = '…';
            changed = true;
            flags.push('empty_placeholder');
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
     */
    function recoverBlankedAdultZh(text, sourceText = '', options = {}) {
        const cur = String(text || '').trim();
        const src = String(sourceText || '');
        if (!isEllipsisOrEmptyZh(cur) && !isBlankOrPunctTranslation(cur, src)) {
            return { text: cur, changed: false };
        }
        if (!src.trim()) return { text: cur, changed: false };
        // Mid-scene Whisper bare おはよう hallucinations → blank ZH 早上好.
        // Keep real address greetings (…ご主人様 / お母さん).
        if (
            shouldBlankFakeGreeting(options)
            && JA_FAKE_GREETING_RE.test(src.trim())
            && !/ご主人|主人様|お母|お父|先生|さん|くん|ちゃん/.test(src)
        ) {
            return { text: cur, changed: false };
        }
        const recovered = mtOpaque?.recoverBlankAdultDialogue?.(src);
        if (recovered && !isEllipsisOrEmptyZh(recovered)) {
            return { text: recovered, changed: true };
        }
        // Shared short-JA / moan fallback (same table as smart-translate blank sweep)
        try {
            const smartCore = (typeof require === 'function')
                ? require('./advanced-smart-translate-core')
                : null;
            const fb = smartCore?.fallbackShortJaCue?.(src);
            if (fb && !isEllipsisOrEmptyZh(fb) && !isBlankOrPunctTranslation(fb, src)) {
                return { text: fb, changed: true };
            }
        } catch (_) { /* optional closed/open path */ }
        const remapped = remapZhFromJaSimple(src);
        if (remapped && !isEllipsisOrEmptyZh(remapped) && remapped !== cur) {
            // Accept even for short JA (うん / はい) — previously required len>=6
            if (!isBlankOrPunctTranslation(remapped, src) || textLen(src) <= 8) {
                return { text: remapped, changed: true };
            }
        }
        // すごい… collapsed to moan-only ZH
        if (/すごい|すげ[えぇー]/.test(src) && (isEllipsisOrEmptyZh(cur) || isFillerOnlyZh(cur))) {
            return { text: '好厉害', changed: true };
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
        // Fix JA ASR domain mishears so justify + ZH domain rules see corrected source
        const srcFixed = options.skipJaAsrDomain !== true
            ? correctJaAsrDomainMishearsInCues(sourceCues)
            : { cues: sourceCues || [], changed: 0 };
        const cleanedSource = srcFixed.cues;

        const srcByIndex = new Map();
        for (const c of cleanedSource || []) {
            const idx = Number(c?.index);
            if (Number.isInteger(idx)) srcByIndex.set(idx, String(c?.text ?? ''));
        }

        const explicitRules = buildNameReplaceRules(options);
        const unifyNames = options.unifyNames !== false;
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

        const allowedNames = collectAllowedNames(nameRules, options.glossaryTerms);

        const flagCounts = {};
        if (srcFixed.changed) flagCounts.ja_asr_domain = srcFixed.changed;
        let changed = 0;
        let cues = (translatedCues || []).map((c, i) => {
            const idx = Number.isInteger(Number(c?.index)) ? Number(c.index) : i;
            const source = srcByIndex.has(idx)
                ? srcByIndex.get(idx)
                : String(cleanedSource?.[i]?.text ?? '');
            const srcCue = cleanedSource?.[i] || (Number.isInteger(idx)
                ? (cleanedSource || []).find((x) => Number(x?.index) === idx)
                : null);
            const result = sanitizeMtCueText(c?.text, source, {
                ...options,
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
        if (options.glossary && glossaryCore?.applyGlossaryToCues) {
            const applied = glossaryCore.applyGlossaryToCues(cues, options.glossary);
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
        if (options.unstickCrossCueZh !== false) {
            const unstuck = unstickCrossCueZh(cues, cleanedSource);
            if (unstuck.changed) {
                cues = unstuck.cues;
                changed += unstuck.changed;
                flagCounts.cross_cue_stuck = (flagCounts.cross_cue_stuck || 0) + unstuck.changed;
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

    /**
     * JA that is mostly moans / sfx — short ZH glosses are acceptable.
     */
    function isMoanOrSfxHeavyJa(sourceText = '') {
        const s = String(sourceText || '').trim();
        if (!s) return false;
        if (/^[はハはぁアァうぅウゥんンー〜～っッああん!！?？…。．.\s♡♥❤ク]+$/i.test(s)) return true;
        const climaxMoan = (typeof mtOpaque?.d === 'function'
            ? mtOpaque.d('44Kk44ODK3zjgqTjgq9844GE44Gj44Gh44KD44GG')
            : '') || 'x';
        let rest = s
            .replace(/[はハはぁアァうぅウゥんンー〜～っッ!！?？…。．.\s♡♥❤、，,。.]+/g, '')
            .replace(new RegExp(`(?:あんっ?|あっ|んっ|はぁ+|ふぅ+|${climaxMoan}|ちゅ[うっぷ]*|んふ|だめっ?)+`, 'gi'), '');
        const sl = textLen(s);
        return sl >= 4 && textLen(rest) <= Math.max(2, Math.floor(sl * 0.25));
    }

    /**
     * ZH that is only a filler / interjection stub (嗯，/啊/请…).
     * Intentionally excludes legitimate short replies like 谢谢/是的/好的.
     */
    function isFillerOnlyZh(text = '') {
        const t = String(text || '').trim();
        if (!t) return false;
        if (/^(?:啊[，,。．.]?|嗯[，,。．.]?|哦[，,。．.]?|噢[，,。．.]?|喂[，,。．.]?|哈[哈呵]?[。．.!！]?|呵呵[，,。．.]?|请|来|完了|不过|不对[，,。．.]?|哎呀[，,。．.]?|嗨[，,。．.]?|嘿[，,。．.]?|啧[，,。．.]?|…+)$/.test(t)) {
            return true;
        }
        const bare = t.replace(/[。．.、，,\s…·•\-—_~～！!？?]+/g, '');
        if (!bare) return true;
        return /^(?:嗯+|啊+|哦+|噢+|喂+|哈+|呵+|唔+|呜+|欸+|诶+|呀+|哟+|哇+|嘻+|请|来|完了|不过|不对|哎呀|嗨|嘿)+$/.test(bare);
    }

    /**
     * True when ZH is a soft-omission vs substantive JA (caller should retry).
     * Timing-aligned short fillers like「嗯，」「请」used to pass blank checks.
     */
    function isSeverelyUnderTranslated(text, sourceText = '') {
        const t = String(text || '').trim();
        const src = String(sourceText || '').trim();
        if (!t || !src) return false;
        const sl = textLen(src);
        const tl = textLen(t);
        if (sl < 6) return false;
        if (isMoanOrSfxHeavyJa(src)) return false;
        // Pure JA interjection/greeting of similar brevity — allow short ZH.
        if (
            sl <= 8
            && /^(?:うん|ええ|はい|ああ|あっ|ねえ|はぁ|ふぅ|そう|よし)[。．!！?？\s…ー〜～]*$/i.test(src)
        ) {
            return false;
        }
        if (isFillerOnlyZh(t)) return true;
        // Long dialogue collapsed into a tiny remnant (with or without trailing comma).
        if (sl >= 10 && tl > 0 && tl < Math.max(2, Math.floor(sl / 5))) return true;
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
     */
    function isLatinGarbageZh(text, sourceText = '') {
        const t = String(text || '').trim();
        if (!/^[A-Za-z][A-Za-z\s.'…·.•\-—]{1,40}$/.test(t) && !/^[A-Za-z]{2,16}[!！.?？…\s]*$/.test(t)) {
            // Mixed Latin + CJK leftovers from katakana transliteration (Hemp尼斯克)
            if (!/(?:[A-Za-z]{3,}[^A-Za-z\u4e00-\u9fff]*){1,}[\u4e00-\u9fff]/.test(t)) return false;
            if (!isKatakanaNoiseJa(sourceText)) return false;
            return true;
        }
        const src = String(sourceText || '');
        if (/[A-Za-z]{3,}/.test(src)) return false;
        return textLen(src) >= 4;
    }

    /** Long pure-katakana ASR debris (menu / noise), not real dialogue. */
    function isKatakanaNoiseJa(text = '') {
        const t = String(text || '').trim();
        if (!t) return false;
        const bare = t.replace(/[…·.•\-—_~～ー\s、,，.。！!？?]+/g, '');
        if (bare.length < 6) return false;
        if (!/^[\u30a0-\u30ff]+$/.test(bare)) return false;
        // Real short katakana words (コーヒー/オイル) are usually ≤6; noise runs longer.
        return bare.length >= 8;
    }

    function isBlankOrPunctTranslation(text, sourceText = '') {
        const t = String(text || '').trim();
        if (!t) return true;
        if (/^[。．.、，,\s…·•\-—_~～]+$/.test(t)) return true;
        if (looksLikePromptLeak(t)) return true;
        if (looksLikeSourceEcho(t, sourceText)) return true;
        if (isMostlyUntranslatedJa(t)) return true;
        if (isLatinGarbageZh(t, sourceText)) return true;
        if (isSeverelyUnderTranslated(t, sourceText)) return true;
        return false;
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
        if (isSeverelyUnderTranslated(t, sourceText)) return true;
        if (isLatinGarbageZh(t, sourceText)) return true;
        const maxMul = Math.max(3, Number(options.pathologicalMul) || 5);
        if (srcLen > 0 && tLen > Math.max(60, srcLen * maxMul)) return true;
        if (fluency?.hasHeavyRepetition?.(t) && tLen > Math.max(30, srcLen * 2)) return true;
        if (/__GLOSS\d*__|__GLOS\d*__|Gloss#{0,4}\d+_*/i.test(t)) return true;
        if (/GLOS?S?\d{2,8}/i.test(t)) return true;
        if (/__[^_\n]{1,64}__/.test(t)) return true;
        if (/改成[：:]/.test(t)) return true;
        return false;
    }

    return {
        GLOSS_TOKEN_RE,
        BARE_GLOSS_TOKEN_RE,
        GENERIC_PLACEHOLDER_RE,
        POLLUTION_NAME_STEMS,
        stripMtArtifacts,
        stripEdgeCommas,
        stripPromptLeak,
        looksLikePromptLeak,
        looksLikeGlossaryDump,
        looksLikeSourceEcho,
        sourceLooksLikeJapanese,
        isMostlyUntranslatedJa,
        stripKatakanaDashDebris,
        stripTrailingOrphanName,
        stripUnjustifiedPollutionNames,
        collapseDePhraseEchoes,
        collapseHonorificEchoes,
        stripSpuriousNamePrefixes,
        stripResidualJaInZh,
        normalizeZhHonorificFromJaSan,
        fixKinshipHonorificMistranslations,
        sourceJustifiesZhName,
        capPathologicalLength,
        extractJaPersonRefs,
        extractZhPersonRefs,
        buildNameReplaceRules,
        inferNameRulesFromCuePairs,
        applyNameConsistency,
        sanitizeMtCueText,
        sanitizeMtCues,
        polishOrphanStuckZh,
        polishTruncatedReactiveZh,
        recoverBlankedAdultZh,
        unstickCrossCueZh,
        correctJaAsrDomainMishears,
        correctJaAsrDomainMishearsInCues,
        correctZhDomainMistranslations,
        applyTrainedZhRemaps,
        reloadTrainedRemaps,
        loadBundledTrainedRemaps,
        get TRAINED_ZH_REMAPS() { return TRAINED_ZH_REMAPS; },
        get TRAINED_ASR_PAIRS() { return TRAINED_ASR_PAIRS; },
        isBlankOrPunctTranslation,
        isEllipsisOrEmptyZh,
        isPathologicalMtText,
        isSeverelyUnderTranslated,
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
        textLen,
        get JA_ASR_DOMAIN_FIXES() { return JA_ASR_DOMAIN_FIXES; },
        get JA_ASR_DOMAIN_FIX_PAIRS() { return JA_ASR_DOMAIN_FIX_PAIRS; },
        reloadJaAsrDomainBasePairs,
        reloadJaAsrDomainFromBundled,
    };
}));
