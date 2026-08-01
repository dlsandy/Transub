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
    const api = factory(fluency, glossaryCore, jaNames, nsfwLex);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubMtSanitize = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function mtSanitizeCoreFactory(fluency, glossaryCore, jaNames, nsfwLex) {
    /** Engine protect placeholders + accidental "Gloss1234" / "GLOS2658克" leaks. */
    const GLOSS_TOKEN_RE = /__GLOSS\d*__|__GLOS\d*__|Gloss#{0,4}\d+_*/gi;
    /** Bare glossary ids the model invents without underscores (GLOS2658克 / GLOSS12). */
    const BARE_GLOSS_TOKEN_RE = /GLOS?S?\d{2,8}(?:克|[gG])?/gi;
    /** Any double-underscore LLM/meta placeholder (e.g. __香水的代号__). */
    const GENERIC_PLACEHOLDER_RE = /__([^_\n]{1,64})__/g;

    const JA_PERSON_RE = /([一-龯ぁ-んァ-ンー]{1,6}?)(さん|くん|ちゃん|君|様|氏)/g;
    const ZH_PERSON_RE = /([\u4e00-\u9fff]{1,4})(同学|小姐|先生|桑|君|酱|酱酱|大人|老师)/g;

    const COMMON_KEEP_TOKENS = new Set([
        '好的', '是的', '不是', '没有', '可以', '不行', '没事', '对不起', '抱歉',
        '谢谢', '再见', '加油', '真的', '当然', '怎么', '什么', '哪里', '为什么',
        '好吧', '好啦', '嗯嗯', '啊啊', '哈哈', '呵呵', '唉呀', '哎呀',
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
        '吗', '嘛', '啦', '哇', '唉', '诶', '欸', '啾', '咿', '呜', '呼', '呵',
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
    const PROMPT_LEAK_RE = /将下面的日文|将下面术语表|只输出译文|共\s*\d+\s*行|翻译的行数|请不要超过|根据以下术语表|根据以下的?.{0,16}(?:描述|翻译记录|英文句子)|不要编号[、，,]?\s*不要解释|碎句与拟声|lex-\d|请勿翻译成别的词|不翻译任何注释|如果描述中含有|请在不翻译|无须复译|照译出来|同音异义词|[你我]是(?:一个)?日译中字幕翻译|汉化组习惯|严禁净化|和谐或委婉改写|禁止照抄假名|每行只译对应一行|无意义叠词循环|忠实语气模式|译名表/i;

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
     * JA AV / メンエス ASR mishears → correct Japanese before MT.
     * Longest-first; keep conservative (high-confidence only).
     * SSOT string pairs live in shared/ja-asr-domain-fixes.json (Node loads; browser uses fallback).
     */
    const JA_ASR_DOMAIN_FIX_PAIRS_FALLBACK = Object.freeze([
        { from: '免税しては', to: 'メンエスは' },
        { from: '免税して来', to: 'メンエスに来' },
        { from: '免税して', to: 'メンエス' },
        { from: '免税者', to: 'メンエス' },
        { from: '免税制', to: 'メンエス' },
        { from: '免税', to: 'メンエス' },
        { from: 'メンズレスト', to: 'メンズエステ' },
        { from: 'メンズエスタ', to: 'メンズエステ' },
        { from: 'メンエース', to: 'メンエス' },
        { from: 'メースは', to: 'メンエスは' },
        { from: 'メインエスは', to: 'メンエスは' },
        { from: 'メインエス', to: 'メンエス' },
        { from: 'インエス遊び', to: 'メンエス遊び' },
        { from: '髪パンツ', to: '半パンツ' },
        { from: '紙パンツ', to: '半パンツ' },
        { from: '髪パン', to: '半パン' },
        { from: '丹念に省して', to: '丹念にほぐして' },
        { from: '丹念にはぐして', to: '丹念にほぐして' },
        { from: 'に省していく', to: 'にほぐしていく' },
        { from: 'に省して', to: 'にほぐして' },
        { from: 'を省して', to: 'をほぐして' },
        { from: 'も省して', to: 'もほぐして' },
        { from: 'にはぐしていく', to: 'にほぐしていく' },
        { from: 'にはぐして', to: 'にほぐして' },
        { from: 'をはぐして', to: 'をほぐして' },
        { from: 'はぐしていく', to: 'ほぐしていく' },
        { from: 'はぐして', to: 'ほぐして' },
        { from: 'はぶれていきます', to: 'ほぐれていきます' },
        { from: 'はぶれて', to: 'ほぐれて' },
        { from: 'メイスは', to: 'ゲストは' },
        { from: 'メスは、', to: 'ゲストは、' },
        { from: 'メスは良い子', to: 'ゲストは良い子' },
        { from: 'メスはいい子', to: 'ゲストはいい子' },
        { from: 'とかボリー', to: 'とかオイル' },
        { from: 'ボリーを', to: 'オイルを' },
        { from: 'トイレ追加します', to: 'オイル追加します' },
        { from: 'トイレ追加', to: 'オイル追加' },
        { from: '入れ足します', to: 'オイル足します' },
        { from: '入れたくさん', to: 'オイルたくさん' },
        { from: 'カッカリオイル', to: 'たっぷりオイル' },
        { from: 'ホエルで', to: 'オイルで' },
        { from: 'ウェルで塗る', to: 'オイルで塗る' },
        { from: 'ウェルで', to: 'オイルで' },
        { from: '歯圧', to: '指圧' },
        { from: '試圧', to: '指圧' },
        { from: '脂圧', to: '指圧' },
        { from: 'リムを流す', to: 'リンパを流す' },
        { from: 'リンプを伸ばす', to: 'リンパを流す' },
        { from: 'リンプを流す', to: 'リンパを流す' },
        { from: '脳リンプ', to: 'リンパ' },
        { from: 'テープリンパ', to: 'たっぷりリンパ' },
        { from: 'さんとリンパ', to: 'ちゃんとリンパ' },
        { from: 'くらはぎ', to: 'ふくらはぎ' },
        { from: 'パンパンエスニャー', to: 'パンパンですねー' },
        { from: '本島より追加', to: 'オイルを追加' },
        { from: '本島より', to: 'オイルを' },
        { from: 'アイルたくさん', to: 'オイルたくさん' },
        { from: 'あいみょんのせい', to: 'オイルのせい' },
        { from: 'あいみょん', to: 'オイル' },
        { from: '大好きなアップル', to: '大好きなおっぱい' },
        { from: '大好きなアップで挟', to: '大好きなおっぱいで挟' },
        { from: 'アップルで挟', to: 'おっぱいで挟' },
        { from: 'アップで挟', to: 'おっぱいで挟' },
        { from: 'あっぱいで挟', to: 'おっぱいで挟' },
        { from: 'ほっぱい', to: 'おっぱい' },
        { from: 'お手紙できますか', to: '仰向けできますか' },
        { from: '前向けになって', to: '仰向けになって' },
        { from: '前向けも', to: '仰向けも' },
        { from: '座を抜けになって', to: 'うつ伏せになって' },
        { from: '逆反省', to: 'うつ伏せ' },
        { from: 'おかみせずに', to: 'おかまいなく' },
        { from: '羽織失礼', to: 'では失礼' },
        { from: '結衣失礼', to: 'では失礼' },
        { from: 'マビサビ', to: 'ギリギリの塩梅' },
        { from: 'わびさび', to: 'ギリギリの塩梅' },
        { from: '関東いたします', to: '担当いたします' },
        { from: '本日関東', to: '本日担当' },
        { from: 'いい子に捨てて', to: 'いい子にしてて' },
        { from: 'いいこねだった', to: 'いい子ねだった' },
        { from: '下半戦', to: '下半身' },
        { from: '肩膀を', to: '肩を' },
        { from: 'トロックになって', to: 'トロトロになって' },
        { from: 'マイクロビッキン', to: 'マイクロビキニ' },
        { from: 'お正気', to: 'お仕置き' },
        { from: 'お客様のペースが柔らかい', to: 'お客様の肌が柔らかい' },
        { from: '祖父とは違います', to: '風俗とは違います' },
        { from: '購入しててください', to: '興奮しててください' },
    ]);

    function loadJaAsrDomainFixPairs() {
        if (typeof module !== 'undefined' && module.exports) {
            try {
                const path = require('path');
                const pairs = require(path.join(__dirname, '..', '..', 'shared', 'ja-asr-domain-fixes.json'));
                if (Array.isArray(pairs) && pairs.length) return pairs;
            } catch (_) { /* fall through */ }
        }
        return JA_ASR_DOMAIN_FIX_PAIRS_FALLBACK;
    }

    const JA_ASR_DOMAIN_FIX_PAIRS = Object.freeze(loadJaAsrDomainFixPairs().map((p) => ({
        from: String(p.from),
        to: String(p.to),
    })));

    function escapeAsrFixLiteral(text) {
        return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /** @type {{ from: RegExp, to: string }[]} */
    const JA_ASR_DOMAIN_FIXES = Object.freeze(
        JA_ASR_DOMAIN_FIX_PAIRS.map((p) => ({
            from: new RegExp(escapeAsrFixLiteral(p.from), 'g'),
            to: p.to,
        })),
    );

    /** Standalone mid-scene greetings Whisper often invents in soft AV. */
    const JA_FAKE_GREETING_RE = /^(?:おはようございます|おはようございま[すっ]|おはよう)[。．!！?？\s]*$/;
    const ZH_MORNING_GREETING_RE = /^(?:早上好|早安|早上好[。．!！]?|早安[。．!！]?)[。．!！?？\s]*$/;
    const JA_ORGASM_HINT_RE = /イッ|イキ|絶頂|オーガズム|高潮|射精|出ちゃ|出そう|イっ/;
    const JA_GENITAL_HINT_RE = /まんこ|おまんこ|まんまん|おまん|ちんちん|おちん|ちんぽ|チンコ|ペニス|穴/;
    const JA_INTRO_HINT_RE = /本日担当|担当させて|担当いたします|メンズエ|メンエス|初めてご利用|風俗ではありません|性的なサービス/;
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
        if (!cur || !src) return { text: cur, changed: false, flags };

        const mark = (flag) => {
            if (!flags.includes(flag)) flags.push(flag);
        };

        // High-confidence semantic inversions / disclaimer collapses (before blanking)
        if (/性的なサービスはできません|性的サービスはできません/.test(src) && /放过|不会放过/.test(cur)) {
            cur = '不能提供性服务，';
            mark('domain_term');
        }
        if (/風俗ではありません/.test(src)
            && (/^(?:不可以…?)+$/.test(cur.replace(/\s+/g, '')) || /放过/.test(cur))) {
            cur = '这里不是风俗店。';
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

        // おむけ / 仰向け → sexual organ hallucination
        if (/(?:おむけ|仰向け)/.test(src) && !JA_GENITAL_HINT_RE.test(src) && /小穴/.test(cur)) {
            cur = cur.replace(/小穴/g, '仰躺');
            mark('domain_term');
        }

        // ほぐす / はぐす → 高潮 (massage loosen ≠ orgasm)
        if (/(?:ほぐ|はぐして|はぐして|はぐしていく)/.test(src) && /高潮/.test(cur) && !JA_ORGASM_HINT_RE.test(src)) {
            cur = cur.replace(/保持着高潮/g, '认真推拿')
                .replace(/高潮/g, '放松');
            mark('domain_term');
        }

        // 凝ってる → 集中力
        if (/凝[って]|凝って/.test(src) && /集中力/.test(cur)) {
            cur = cur.replace(/好厉害的集中力啊?/g, '肌肉僵硬得很厉害')
                .replace(/好厉害的集中力/g, '肌肉僵硬得很厉害')
                .replace(/集中力/g, '僵硬');
            mark('domain_term');
        }

        // メンエスはわびさび / ギリギリ → sex-atmosphere hallucination
        if (/(?:メンエース|メンエス).{0,12}(?:わびさび|塩梅|ギリギリ)/.test(src)
            || /わびさび|ギリギリの塩梅/.test(src)) {
            if (/做爱是需要气氛|需要气氛/.test(cur)) {
                cur = '男士按摩讲究的是分寸感哦';
                mark('domain_term');
            }
        }

        // アップル ASR leftover → 苹果 when source is breast context
        if (/アップル|おっぱい/.test(src) && /苹果/.test(cur) && !/林檎|りんご/.test(src)) {
            cur = cur.replace(/苹果/g, '奶子');
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
        // Consistency-pass meta: "うちわら小姐\n改成：うちわら小姐"
        next = next.replace(/(?:^|\n)\s*改成[：:]\s*[^\n]*/g, '');
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
            || /输出译文|不要解释|术语表|译名表|请勿翻译|不翻译任何注释|根据以下|无须复译|照译|同音异义词|第.{0,4}单词|日译中字幕翻译|汉化组|严禁净化|忠实语气模式/.test(next)
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

        // Generic 2–4 CJK trailing name-like token after punct/space
        if (/^[\u4e00-\u9fff]{2,4}$/.test(t)) return true;

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
     */
    function collapseHonorificEchoes(text) {
        let cur = String(text ?? '');
        const before = cur;
        const honor = '同学|小姐|先生|桑|君|酱|大人|老师';
        // Name + honorific + repeated honorifics: 悠奈小姐…小姐 → 悠奈小姐
        cur = cur.replace(
            new RegExp(
                `([\\u4e00-\\u9fffぁ-んァ-ンー]{1,12})(${honor})(?:[\\s…·・.。]{1,8}\\2)+`,
                'g',
            ),
            '$1$2',
        );
        // Bare honorific stutter: 小姐…小姐…小姐 → 小姐
        cur = cur.replace(
            new RegExp(`(${honor})(?:[\\s…·・.。]{1,8}\\1)+`, 'g'),
            '$1',
        );
        return { text: cur, changed: cur !== before };
    }

    /**
     * Kinship mistranslations: お母さん → 母小姐 / 父小姐.
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
        if (/おばあちゃん|祖母/.test(src)) {
            cur = cur.replace(/祖母小姐|外婆小姐|奶奶小姐/g, (m) => m.replace(/小姐$/, ''));
        }
        if (/おじいちゃん|祖父/.test(src)) {
            cur = cur.replace(/祖父小姐|外公小姐|爷爷小姐/g, (m) => m.replace(/小姐$/, ''));
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
            .replace(/\s+([。．.！？!?…，,；;：:])/g, '$1')
            .replace(/^[…⋅・.。～〜\s-]+|[…⋅・.。～〜\s-]+$/g, '')
            .trim();
        if (/^[…⋅・.\s。！？!?～〜\-'"，,]*$/.test(cur)) cur = '';

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
    // Long stuck NSFW template pasted onto unrelated moans / laughs
    const ORPHAN_STUCK_ZH_RE = /^哥哥的肉棒好舒服[，,]?嗯?啊*！?$/;

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
        const bare = s.replace(/[。．.!！]+$/g, '');
        if (/^あはは|^ははは/.test(s)) return '哈哈';
        if (/^はい$/.test(bare)) return '好的';
        if (/^うん$/.test(bare)) return '嗯';
        if (/気持ちいい/.test(s)) return /[?？]/.test(s) ? '舒服吗？' : '好舒服';
        if (/^[はハはぁアァうぅウゥんンー〜～っッああん!！?？…。．.\s♡]+$/.test(s)) {
            if (/[はハ]/.test(s) && !/[あァぁあんン]/.test(s.replace(/[はハ]/g, ''))) {
                return /[!！]/.test(s) ? '哈——！' : '哈啊';
            }
            if (/[んン]/.test(s) && !/[あァぁ]/.test(s)) {
                return /[!！]/.test(s) ? '嗯——！' : '嗯';
            }
            if (/[うぅウゥ]/.test(s) && !/[あァぁ]/.test(s)) return '呜……';
            return /[!！]/.test(s) ? '啊——！' : '啊……';
        }
        return null;
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
            // Keep only when JA actually mentions penis / feeling good
            if (!/お?ちん|ちんぽ|ちんこ|肉棒|気持ちいい|きもちいい/.test(src)) {
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
            /^[はハはぁアァうぅウゥんンー〜～っッああん!！?？…。．.\s♡]+$/.test(src)
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
        let cur = String(text ?? '');
        let changed = false;
        const loopStrippedSource = options.loopStrippedSource != null
            ? String(options.loopStrippedSource)
            : (jaNames?.stripAsrHallucinationLoops
                ? jaNames.stripAsrHallucinationLoops(sourceText).text
                : String(sourceText || ''));
        const justifyOpts = { loopStrippedSource };
        const cueOpts = { ...options, justifyOpts };

        const orphanStuck = polishOrphanStuckZh(cur, loopStrippedSource || sourceText);
        if (orphanStuck.changed) {
            cur = orphanStuck.text;
            changed = true;
            flags.push('orphan_stuck_zh');
        }

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

        const kinship = fixKinshipHonorificMistranslations(cur, loopStrippedSource || sourceText);
        if (kinship.changed) {
            cur = kinship.text;
            changed = true;
            flags.push('kinship');
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

        // Mens-esthe / soft-AV domain mistranslations (オイル→防晒油, おむけ→小穴, …)
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

        const capped = capPathologicalLength(cur, sourceText, options);
        if (capped.changed) {
            cur = capped.text;
            changed = true;
            flags.push('length_cap');
        }

        // Never leave a dialogue source with a totally empty ZH (engine/post may drop the cue)
        if (!String(cur).trim() && String(sourceText || '').trim()) {
            cur = '…';
            changed = true;
            flags.push('empty_placeholder');
        }

        return { text: cur, changed, flags };
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

    function isBlankOrPunctTranslation(text, sourceText = '') {
        const t = String(text || '').trim();
        if (!t) return true;
        if (/^[。．.、，,\s…·•\-—_~～]+$/.test(t)) return true;
        if (looksLikePromptLeak(t)) return true;
        if (looksLikeSourceEcho(t, sourceText)) return true;
        if (isMostlyUntranslatedJa(t)) return true;
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
        unstickCrossCueZh,
        correctJaAsrDomainMishears,
        correctJaAsrDomainMishearsInCues,
        correctZhDomainMistranslations,
        isBlankOrPunctTranslation,
        isPathologicalMtText,
        isAvSoftContext,
        shouldBlankFakeGreeting,
        textLen,
        JA_ASR_DOMAIN_FIXES,
        JA_ASR_DOMAIN_FIX_PAIRS,
    };
}));
