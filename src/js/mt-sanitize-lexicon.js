/**
 * Shared MT sanitize lexicon — Latin SFX, kana scraps, rod JA extras, scan anchors.
 * Used by mt-sanitize-core, mt-opaque-strings, and training scan tooling.
 * Keep adult ZH literals out of this file when possible (use opaque.T at call sites).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubMtSanitizeLexicon = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function mtSanitizeLexiconFactory() {
    function d(b64) {
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
        } catch (_) {
            return '';
        }
        return '';
    }

    function reFromB64(b64, flags = '') {
        const pat = d(b64);
        if (!pat) return /$a/;
        try {
            return new RegExp(pat, flags);
        } catch (_) {
            return /$a/;
        }
    }

    /** Alternation for known Latin SFX / scrap tokens (no surrounding \\b). */
    const LATIN_SFX_ALT = String.raw`bump|gross|pun|Boeh|aki|Yuk(?:yuk|yo)?|hamu|hinin|Breath|breath|Hic|hic|Chu|chu|urg|hya|Ank|ank|mun|huh|Yoshun|umm|Ngh|Chew|fair|hiro|slur|phah|whee|nnn|hij|forth|addle|Cheat|hug|sakase|bang|hen|hit|nyo|Oman|fuck|die|hu|han|het|chaseon|snot|buzz|sov|hin|DESTA|horarin|buz|_?killchan|_?adj`;

    /** Extra mix-strip patterns beyond token list. */
    const LATIN_SFX_MIX_EXTRA = String.raw`hya\s*ma|-san\b|\bchu(?:\s+chu)+\b|_hihi\b|-[A-Za-z]{2,12}\b`;

    /** Latin tokens that may stay when JA has matching kana/loan (romanized names, etc.). */
    const JUSTIFIED_LATIN_KEEP = Object.freeze([
        { zh: /\bYuri\b/i, ja: /ゆり|ユリ/ },
        { zh: /\bdarling\b/i, ja: /ダーリン|だーりん/ },
        { zh: /\bshow\b/i, ja: /見せて|見せる|見せてよ/ },
        { zh: /\bguam\b/i, ja: /グア|グアム/ },
        { zh: /\bkun\b/i, ja: /くん|君/ },
        { zh: /\bsenpai\b/i, ja: /せんぱい|先輩|センパイ/ },
        { zh: /\bpiranha\b/i, ja: /ピラニア|ピラーニャ/ },
    ]);

    /**
     * Hallucinated kana scraps in ZH with no JA justification.
     * @type {ReadonlyArray<{ zh: string, ja: RegExp }>}
     */
    const KANA_SCRAP_PAIRS = Object.freeze([
        { zh: 'りね', ja: /りね|リネ|りんね|リンネ/ },
        { zh: 'ちゃま', ja: /ちゃま|チャマ/ },
        { zh: 'すやま', ja: /すやま|スヤマ|巣山/ },
        { zh: 'あゆうこ', ja: /あゆうこ|アユウコ|鮎子|歩子/ },
        { zh: 'ディル', ja: /ディル|ディルド/ },
        { zh: 'んろ', ja: /んろ/ },
        { zh: 'げー', ja: /げー|ゲー/ },
        { zh: 'くり', ja: /くり|クリ/ },
        { zh: 'ひゃ', ja: /ひゃ|ヒャ/ },
        { zh: 'ひょ', ja: /ひょ|ヒョ/ },
        { zh: 'ねえ', ja: /ねえ|ネエ/ },
        { zh: 'ほな', ja: /ほな|ホナ/ },
        { zh: 'んー', ja: /んー|ンー/ },
        { zh: 'てる', ja: /てる|テル/ },
    ]);

    /** Extra / standalone rod JA (also used when opaque RE is unavailable). */
    const ROD_JA_EXTRA = reFromB64('44GK44GT44Gh44KHfOOBiuOBoeOCk+OBoeOCh3zjgYrjgZjjgpPjgb1844GK44GY44KT44Gh44KTfOOBiuOBoeOCk+OBk3zjgYrjgaHjgpN844Kq44OB44OzfOOBoeOCk+OBvXzjg4Hjg7Pjg51844Gh44KT44Gh44KTfOODgeODs+ODgeODs3zjgqTjg4Hjg6Ljg4R844Kr44OB44OzfOWHuuOBi+OBoXzjg5rjg4vjgrl844GK44GhW+KXi+OAh+KXrypd44Gh44KTfOOBoVvil4vjgIfil68qXeOCk3woPzwhW+OCreODg+ODg10p44OB44OzfCg/Ol58W17jgYrjgqrjgq1dKeOBoeOCk3znq78=');

    /**
     * Adult JA anchors for training scan (under_formable / recover coverage).
     * Mild dialogue without these is noise for sanitize training.
     */
    const ADULT_JA_ANCHOR = reFromB64('44GK44Gh44KTfOOCquODgeODs3zjgaHjgpPjgb1844OB44Oz44OdfOOBoeOCk+OBoeOCk3zjg4Hjg7Pjg4Hjg7N844Oa44OL44K5fOOBiuOBoVvil4vjgIfil68qXeOBoeOCk3zjgaFb4peL44CH4pevKl3jgpN85Lmz6aaWfOOBoeOBj+OBs3zoiJB844OV44Kn44OpfCg/PCFb44OQ44O0XSnjgqRb44Kv44OD44GNXXzjgYTjgaPjgaHjgoN844Kk44KtfOOBvuOCk+OBk3zjgYrjgb7jgpPjgZN85oy/5YWlfOWFpeOCjHzlsITnsr585Ye644GX44GmfOWHuuOBleOCjHzjgq3jgrl844Ko44OD44OBfOOBm+OCk+OBm+OBhHzlhYjnlJ985YWI44Gj44G9fOWFiOOBo+OBoeOCh3zjg5Hjg7Pjg5Hjg7N844KJ44KBfOOChOOCgeOBrXzlhoXlr4Z85a+G552AfOinpuOBo+OBpnzjgaHjgofjgYbjgaDjgYR8KD88IVvjgq3jg4Pjg4NdKeODgeODs3woPzpefFte44GK44Kq44KtXSnjgaHjgpM=');

    /** Residual class for scan bucketing (tooling). */
    const RESIDUAL_CLASS = Object.freeze({
        reusable_semantic: 'reusable_semantic',
        under_stub: 'under_stub',
        source_echo_re_mt: 'source_echo_re_mt',
        latin_scrap: 'latin_scrap',
        ja_echo: 'ja_echo',
        asr_garbage: 'asr_garbage',
        sufficient: 'sufficient',
        noise: 'noise',
    });

    /** Climax polarity labels. */
    const CLIMAX_POLARITY = Object.freeze({
        prefer_go: 'prefer_go',
        prefer_shoot: 'prefer_shoot',
        abstain: 'abstain',
    });

    /** JA feature keys for stub inverted matching. */
    const JA_FEAT = Object.freeze({
        rod: /おちん|オチン|ちんぽ|チンポ|ちんちん|チンチン|おじん|おこちょ|(?<![キッッ])チン|(?:^|[^おオキ])ちん/,
        sensei: /先生|せんせい|センセ/,
        nipple: /乳首|ちくび/,
        tip: /先っぽ|先っちょ/,
        dashite: /出して|出され|出ちゃ|でちゃ/,
        irete: /入れ|挿入|挿/,
        lick: /舐|フェラ/,
        kiss: /キス/,
        touch: /触って|さわって/,
        iku: /(?<![バヴ])イ[クッき]|いっちゃ|イキ|(?<![行])いく/,
        rame: /らめ|ラメ/,
        choudai: /ちょうだい|頂戴/,
        yoro: /よろしく/,
        etchi: reFromB64('44Ko44OD44OBfOOCqOODrXzoibLjgaPjgb0='),
        fella: /フェラ/,
        first: /初めて/,
        oppai: /おっぱい/,
        look: /見て|ほら/,
        kimochi: /気持|キモチ|気にも/,
        dame: /だめ|ダメ|駄目|いや/,
    });

    /**
     * JA anchor → expected ZH cover (for sufficiency / under detection).
     * @type {ReadonlyArray<{ id: string, ja: RegExp, zh: RegExp }>}
     */
    const ANCHOR_COVER = Object.freeze([
        { id: 'nipple', ja: /乳首|ちくび/, zh: reFromB64('5Lmz5aS0fOWltuWktHzkubPpppY=') },
        {
            id: 'rod',
            ja: reFromB64('44GK44Gh44KTfOOBoeOCk+OBvXzjgaHjgpPjgaHjgpN844Kq44OB44OzfOODgeODs+ODnXzjgYrjgZjjgpPjgb1844GK44GT44Gh44KHfOOCpOODgeODouODhHzjg4fjgqvjg4Hjg7N844Oa44OL44K5fOOBiuOBoVvil4vjgIfil69cKl3jgaHjgpN844GhW+KXi+OAh+KXr1wqXeOCkw=='),
            zh: reFromB64('6IKJ5qOSfOm4oeW3tHzpuKHpuKF85qOSfOmYs+WFtw=='),
            skipJa: /キッチン|キャッチ|ピンチ|ランチ|アンチ|スイッチ|キッチンポール|おちんぱい/,
        },
        { id: 'manko', ja: reFromB64('44G+44KT44GTfOOBiuOBvuOCk+OBkw=='), zh: reFromB64('5bCP56m0fOeptHzpmLTllIc=') },
        {
            id: 'dashite',
            ja: /出して|出され|射精|出します|出してる/,
            zh: reFromB64('5bCEfOWHuueyvnznsr7mtrJ85bCE5Ye65p2lfOWPr+S7peWwhHzpnLLlh7rmnaV85Y+j5rC0fOeIsea2snzlhoXlsIR85Ye65p2l5LqGfOmcsuWHug=='),
            skipJa: /結果|成績|答え|宿題|課題|声出して|声を出|噛み出|(?:あ)?べろ|ベロ出|朝ご飯|朝ごはん|お茶出|舌出|追い出|抽出|呼び出|イライラ|怒られ|気持ちを出|奥義|思い出|手出して|手を出|手伸ば|腕も出|引き出|払い出|鼻血|ハラベラ|畳先輩|エパーテ/,
        },
        {
            id: 'irete',
            ja: /入れ|挿入|挿れ/,
            zh: /插|进|入|深|塞|放/,
            skipJa: /シャワー|風呂|お風呂|親に|文化|入れ物|入れるなよ|受け入れ|バイト入れ|セットを入れ|入れます|人の入れる|入れてくれないのね|嫁入れ|嫁入|手に入れ|バイク/,
        },
        { id: 'lick', ja: /舐|フェラ/, zh: reFromB64('6IiUfOWQq3zlj6PkuqR85Y+j54KufOWQuQ==') },
        {
            id: 'kiss',
            ja: /キス/,
            zh: /亲|吻/,
            skipJa: /エキス|キステックス|ゴキスキ|キスタロー|ニッチャ/,
        },
        { id: 'sensei', ja: /先生|せんせい|センセ/, zh: /老师|先生|医生/ },
        // 先头 = wrong soft gloss (not sufficient); remap to 前端 in opaque
        { id: 'tip', ja: /先っぽ|先っちょ/, zh: /前端|龟头|顶端|先端|前面|尖端/ },
        {
            id: 'iku',
            ja: /(?<![バヴ])イ[クッ]|いっちゃ|イキ/,
            zh: /射了|去了|要射|要去|高潮|出来|要来|忍不住|可以了吗|我去|再去|不能去|射得|射过|要泄/,
            skipJa: /バイク|イッハン|イッチネー|いっちゃかわ|いっちゃ林|いっちゃい$|いちきれい|いっちゃんいっちゃ|イキちゃん|ゴキュイイ|ジャマイク|グージャンケン|あちゅも疲れ/,
        },
        { id: 'touch', ja: /触って/, zh: /摸|触|碰/ },
        { id: 'rame', ja: /らめ[ぇえ]|らめらめ|やめね|やめて/, zh: /不行|不要|别|别停|碍事/ },
        // 射 alone must not cover ちょうだい (e.g. 手ぇちょうだい → 把手给我)
        { id: 'choudai', ja: /ちょうだい/, zh: /给|求/ },
    ]);

    /** Known ASR garble shapes — skip training (source noise). */
    const ASR_GARBAGE_JA = /こんら|れんぽ|さきっぺ|ちくびゃ|イイチクヨ|インプルム|ヨヲイ|ぺく…|ぢゃいぃ|ヴィヌル|フィオン|マッサン|フォーおまんこ|キューピー|ジョブロベロ|イッチネー|イッハンダッチ|サンコンセオ|アンコレインポ|いっちゃんいっちゃ|ストイキつく|チアレ、メイキング|ゴキュイイカニシシャイキ|オチンナニソナイチシコ|やっぱいびんね先生でなんか毎回/;

    function textLen(s) {
        return [...String(s || '').replace(/\s/g, '')].length;
    }

    function latinSfxMixRe(flags = 'i') {
        return new RegExp(String.raw`\b(?:${LATIN_SFX_ALT})\b|${LATIN_SFX_MIX_EXTRA}`, flags);
    }

    function latinSfxTokenRe(flags = 'gi') {
        return new RegExp(String.raw`\b(?:${LATIN_SFX_ALT})\b`, flags);
    }

    function latinSfxAtomRe(flags = 'i') {
        return new RegExp(String.raw`^(?:${LATIN_SFX_ALT})[~～\-—_!.…·.•\s]*$`, flags);
    }

    function latinSfxMoanAtomRe(flags = 'i') {
        return new RegExp(
            String.raw`^(?:[哈啊嗯唔呼]+[~～…·.•\s]*)?(?:${LATIN_SFX_ALT})[~～\-—_!.…·.•\s]*$`,
            flags,
        );
    }

    /**
     * @param {string} src
     * @param {{ dekachinSrc?: RegExp, jaHasRodSrc?: RegExp }|null} [RE]
     */
    function jaHasRodCue(src, RE = null) {
        const s = String(src || '');
        if (RE?.dekachinSrc?.test?.(s)) return true;
        if (RE?.jaHasRodSrc?.test?.(s)) return true;
        return ROD_JA_EXTRA.test(s);
    }

    function isAdultJaAnchor(src = '') {
        return ADULT_JA_ANCHOR.test(String(src || ''));
    }

    function isJustifiedLatinLeak(zh = '', src = '') {
        const t = String(zh || '');
        const s = String(src || '');
        for (const row of JUSTIFIED_LATIN_KEEP) {
            if (row.zh.test(t) && row.ja.test(s)) return true;
        }
        return false;
    }

    function isAsrGarbageJa(src = '') {
        const s = String(src || '');
        if (!s) return false;
        if (ASR_GARBAGE_JA.test(s)) return true;
        // Heavy katakana mash with almost no content kanji / known adult lemma
        const kata = (s.match(/[\u30a0-\u30ff]/g) || []).length;
        const kanji = (s.match(/[\u4e00-\u9fff]/g) || []).length;
        if (kata >= 10 && kanji === 0 && !isAdultJaAnchor(s) && /[ァ-ヺ]{4,}/.test(s)) {
            return true;
        }
        return false;
    }

    /**
     * Extract JA feature set for stub indexing.
     * @returns {Set<string>}
     */
    function extractJaFeatures(src = '') {
        const s = String(src || '');
        const bits = new Set(['any']);
        for (const [k, re] of Object.entries(JA_FEAT)) {
            if (re.test(s)) bits.add(k);
        }
        return bits;
    }

    /**
     * @returns {{ present: string[], covered: string[], missing: string[], rate: number }}
     */
    function zhCoverJaAnchors(src = '', zh = '') {
        const s = String(src || '');
        const z = String(zh || '');
        const present = [];
        const covered = [];
        const missing = [];
        for (const row of ANCHOR_COVER) {
            if (!row.ja.test(s)) continue;
            // skipJa wins unless clearly sexual ejaculation / insertion (not べろいっぱい出 / ご飯出してくれ)
            if (row.skipJa && row.skipJa.test(s)) {
                const sexualUnskip = /(?:中に出|外に出|精液|ザーメン|射精|中出し|出してもいい|挿入|挿れて|おまんこに出)/.test(s);
                if (!sexualUnskip) continue;
            }
            present.push(row.id);
            if (row.zh.test(z)) covered.push(row.id);
            else missing.push(row.id);
        }
        return {
            present,
            covered,
            missing,
            rate: present.length ? covered.length / present.length : 1,
        };
    }

    /**
     * True when ZH already carries enough of the JA adult intent (not under-translated).
     */
    function isZhSufficientForJa(src = '', zh = '', flags = []) {
        const s = String(src || '');
        const z = String(zh || '');
        if (!s.trim()) return true;
        if (isAsrGarbageJa(s)) return true;
        const cover = zhCoverJaAnchors(s, z);
        if (cover.present.length === 0) {
            return textLen(z) >= 2 || !isAdultJaAnchor(s);
        }
        if (cover.missing.length === 0) return true;
        if (cover.rate >= 0.67 && textLen(z) >= 4) return true;
        // Climax-only cues: short 要射了 / 要去了 is enough
        if (
            cover.present.every((id) => id === 'iku' || id === 'rame')
            && /要射了|要去了|射了|去了/.test(z)
        ) {
            return true;
        }
        // Sensei+nipple climax recovered stub
        if (/老师/.test(z) && /乳头/.test(z) && /去了|射了/.test(z)) return true;
        if (Array.isArray(flags) && flags.some((f) => /blank_adult_recover/.test(f)) && textLen(z) >= 3) {
            return cover.rate >= 0.5;
        }
        return false;
    }

    /**
     * Female/male climax polarity for soft→射 gating.
     * @returns {'prefer_go'|'prefer_shoot'|'abstain'}
     */
    function classifyClimaxPolarity(src = '') {
        const s = String(src || '');
        let female = 0;
        let male = 0;
        const rameResist = /らめらめ|ラメラメ|らめ[ぇえにェ]|ラメェ/.test(s);
        if (/射精|出して|出され|ザーメン|精液/.test(s)) male += 3;
        // Bare イクイク stack is male-leaning, but らめ/だめ resist overrides (baby だめ + climax)
        if (/イク(?:イク)+|イクイク/.test(s) && !rameResist && !/(?:だめ|ダメ)/.test(s)) male += 2;
        if (/(?:お)?まんこ.{0,12}(?:イッ|いっちゃ|イっ|イキ)/.test(s)) female += 4;
        if (/(?:イッ|いっちゃ|イっ).{0,12}(?:お)?まんこ/.test(s)) female += 4;
        if (/まんこいっ/.test(s)) female += 4;
        if (/(?:乳首|ちくび).{0,12}(?:イキ|イッ|いっちゃ|いく)/.test(s)) female += 3;
        if (/(?:イキ|イッ|いっちゃ).{0,12}(?:乳首|ちくび)/.test(s)) female += 3;
        if (/イッちゃいそうよ|イっちゃいそうよ|いっちゃいそうよ|いきそうよ|イッちゃいますか|いっちゃいますか/.test(s)) female += 3;
        // らめ／らめらめ + climax → female resist (including イクイク stacks)
        if (rameResist && /イク|イッ|いっちゃ|イキ|いく/.test(s)) female += 3;
        // ダメイッちゃう / ダメイッちゃった / ASR ダメディッチャ — female resist
        if (
            (
                /ダメ?イッちゃう|だめイッちゃう|ダメイッちゃう|(?:だめ|ダメ)[、,\s]*イッちゃう/.test(s)
                || /ダメ?イッちゃった|だめイッちゃった|イッちゃったわ/.test(s)
                || /(?:だめ|ダメ).{0,4}(?:ディッチャ|イッちゃ)/.test(s)
            )
            && !/出して|射精/.test(s)
        ) {
            female += 2;
        }
        if (/やめね|やめてね|やめないで|やめろ/.test(s) && /イッちゃう|いっちゃう|イっちゃう/.test(s)) female += 2;
        if (/わた[し]|あたし/.test(s) && /イッ|いき|イキ/.test(s)) female += 1;
        if (female >= 2 && female > male) return CLIMAX_POLARITY.prefer_go;
        if (male >= 2 && male > female) return CLIMAX_POLARITY.prefer_shoot;
        if (female > 0 && male === 0) return CLIMAX_POLARITY.prefer_go;
        if (male > 0 && female === 0) return CLIMAX_POLARITY.prefer_shoot;
        return CLIMAX_POLARITY.abstain;
    }

    /**
     * Strip known Latin SFX mix from ZH (av_soft path).
     * @returns {{ text: string, changed: boolean }}
     */
    function stripLatinSfxMixZh(text = '') {
        const before = String(text ?? '');
        if (!latinSfxMixRe('i').test(before)) {
            return { text: before, changed: false };
        }
        let cur = before
            .replace(/hya\s*ma/gi, '')
            .replace(/\bchu(?:\s+chu)+\b/gi, '')
            .replace(latinSfxTokenRe('gi'), '')
            .replace(/_?killchan\b/gi, '')
            .replace(/_?adj\b/gi, '')
            .replace(/_hihi\b/gi, '')
            .replace(/-san\b/gi, '')
            .replace(/-([A-Za-z]{2,12})\b/gi, '')
            .replace(/吃(?=[…·.\s]|$)/g, '')
            .replace(/\s{2,}/g, ' ')
            .replace(/\s+([、，,])/g, '$1')
            .replace(/[，,]{2,}/g, '，')
            .replace(/[、，,]+\s*(?=[…·.]|$)/g, '')
            .replace(/^[、，,\s]+|[、，,\s]+$/g, '')
            .replace(/(?:\s*…\s*){2,}/g, '…')
            .trim();
        return { text: cur, changed: cur !== before };
    }

    /**
     * Apply kana scrap + orphan ちゃん stripping.
     * @returns {{ text: string, changed: boolean }}
     */
    function applyKanaScrapsZh(text = '', sourceText = '') {
        const src = String(sourceText || '');
        let next = String(text ?? '');
        let scraped = false;
        const zhCount = (next.match(/[\u4e00-\u9fff]/g) || []).length;
        for (const { zh, ja } of KANA_SCRAP_PAIRS) {
            // Always strip from mostly-Chinese lines; otherwise only when unjustified
            if (next.includes(zh) && (zhCount >= 2 || !ja.test(src))) {
                next = next.split(zh).join('');
                scraped = true;
            }
        }
        if (/(?:^|[\s，,])ちゃん(?:[\s，,？?！!。．.]|$)/u.test(next) && (!/ちゃん/.test(src) || zhCount >= 2)) {
            next = next
                .replace(/^[\s，,]*ちゃん[\s，,？?！!。．.]*/u, '')
                .replace(/[\s，,]+ちゃん(?=[\s，,？?！!。．.]|$)/gu, ' ')
                .replace(/ちゃん(?=[\s，,？?！!。．.]|$)/gu, '');
            scraped = true;
        }
        if (!scraped) return { text: String(text ?? ''), changed: false };
        next = next
            .replace(/\s{2,}/g, ' ')
            .replace(/\s+([？?！!])/g, '$1')
            .replace(/哩(?=[\s，,？?！!。．.]|$)/g, '')
            .replace(/^[，,\s]+|[，,\s]+$/g, '')
            .trim();
        const before = String(text ?? '');
        return { text: next || before, changed: next !== before && Boolean(next || before) };
    }

    /**
     * Classify a residual cue for training priority (anchor-sufficiency aware).
     */
    function classifyResidual(src, dst, after, flags = []) {
        const s = String(src || '');
        const a = String(after || '');
        const fl = Array.isArray(flags) ? flags : [];
        if (isAsrGarbageJa(s)) return RESIDUAL_CLASS.asr_garbage;
        if (fl.some((f) => /source_echo/.test(f)) || (/[\u3040-\u30ff]{4,}/.test(a) && !/[\u4e00-\u9fff]/.test(a))) {
            return RESIDUAL_CLASS.source_echo_re_mt;
        }
        if (/[A-Za-zÀ-ɏ]{3,}/.test(a) && !isJustifiedLatinLeak(a, s)) {
            return RESIDUAL_CLASS.latin_scrap;
        }
        if (/[\u3040-\u30ff]{2,}/.test(a) && /[\u4e00-\u9fff]/.test(a)) {
            return RESIDUAL_CLASS.ja_echo;
        }
        if (isAdultJaAnchor(s) && isZhSufficientForJa(s, a, fl)) {
            if (fl.some((f) => /domain_term|domain_hallucination|blank_adult/.test(f))) {
                return RESIDUAL_CLASS.reusable_semantic;
            }
            return RESIDUAL_CLASS.sufficient;
        }
        const afterLen = textLen(a);
        const srcLen = textLen(s);
        if (isAdultJaAnchor(s) && !isZhSufficientForJa(s, a, fl) && (afterLen <= 6 || srcLen >= 8)) {
            const cover = zhCoverJaAnchors(s, a);
            if (cover.missing.length > 0 || afterLen <= 4) {
                return RESIDUAL_CLASS.under_stub;
            }
        }
        if (isAdultJaAnchor(s) && fl.some((f) => /domain_term|domain_hallucination|blank_adult/.test(f))) {
            return RESIDUAL_CLASS.reusable_semantic;
        }
        return RESIDUAL_CLASS.noise;
    }

    /**
     * Unified residual score for training queues.
     * score = reuse × (1 - conflictRisk) × freqBoost
     * @returns {{ score: number, cls: string, reuse: number, conflictRisk: number, skip?: string, cover?: object, polarity?: string }}
     */
    function residualScore(row = {}, opts = {}) {
        const src = String(row.src || '');
        const dst = String(row.dst || '');
        const after = String(row.after || '');
        const flags = row.flags || [];
        const batchFreq = Math.max(1, Number(opts.batchFreq) || 1);
        const cls = classifyResidual(src, dst, after, flags);
        const polarity = classifyClimaxPolarity(src);
        const cover = zhCoverJaAnchors(src, after);

        if (cls === RESIDUAL_CLASS.asr_garbage) {
            return { score: 0, cls, reuse: 0, conflictRisk: 0, skip: 'asr_garbage', cover, polarity };
        }
        if (cls === RESIDUAL_CLASS.noise || cls === RESIDUAL_CLASS.sufficient) {
            return { score: 0, cls, reuse: 0, conflictRisk: 0, skip: cls, cover, polarity };
        }

        let reuse = 40;
        if (cls === RESIDUAL_CLASS.under_stub) reuse = 85;
        else if (cls === RESIDUAL_CLASS.latin_scrap) reuse = 75;
        else if (cls === RESIDUAL_CLASS.ja_echo) reuse = 70;
        else if (cls === RESIDUAL_CLASS.source_echo_re_mt) reuse = 90;
        else if (cls === RESIDUAL_CLASS.reusable_semantic) reuse = 55;

        let conflictRisk = 0.1;
        if (polarity === CLIMAX_POLARITY.prefer_go && /要射了|射了/.test(after) && !/出して|射精/.test(src)) {
            conflictRisk = 0.55;
            reuse = Math.max(reuse, 80);
        }
        if (polarity === CLIMAX_POLARITY.prefer_shoot && /要去了|去了/.test(after) && !/まんこ|乳首|ちくび/.test(src)) {
            conflictRisk = 0.45;
        }
        if (reFromB64('6IKJ5qOSfOm4oem4oQ==').test(after) && !jaHasRodCue(src)) {
            conflictRisk = Math.max(conflictRisk, 0.6);
            reuse = Math.max(reuse, 80);
        }

        const freqBoost = Math.min(2.5, 1 + Math.log2(batchFreq));
        const score = Math.round(reuse * (1 - conflictRisk) * freqBoost * 10) / 10;
        return { score, cls, reuse, conflictRisk, cover, polarity };
    }

    /**
     * Build need→rules inverted index; match stubs by JA features then predicate.
     * Index is cached per rules array identity (WeakMap) so hot paths do not rebuild.
     * @param {Array<{ id: string, needs?: string[], match: Function, ok: Function }>} rules
     * @param {string} cur
     * @param {string} src
     * @returns {{ id: string, text: string }|null}
     */
    const stubRuleIndexCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

    function buildStubRuleIndex(rules) {
        const index = new Map();
        for (const rule of rules) {
            const needs = (rule.needs && rule.needs.length) ? rule.needs : ['any'];
            for (const n of needs) {
                if (!index.has(n)) index.set(n, []);
                index.get(n).push(rule);
            }
        }
        return index;
    }

    function matchStubRules(rules, cur, src) {
        const list = Array.isArray(rules) ? rules : [];
        if (!list.length) return null;
        const feats = extractJaFeatures(src);
        let index = stubRuleIndexCache ? stubRuleIndexCache.get(list) : null;
        if (!index) {
            index = buildStubRuleIndex(list);
            if (stubRuleIndexCache) {
                try { stubRuleIndexCache.set(list, index); } catch (_) { /* non-weakable */ }
            }
        }
        const candidates = [];
        const seen = new Set();
        for (const f of feats) {
            for (const rule of (index.get(f) || [])) {
                if (seen.has(rule.id)) continue;
                seen.add(rule.id);
                const needs = (rule.needs && rule.needs.length) ? rule.needs : ['any'];
                if (needs.every((n) => feats.has(n))) candidates.push(rule);
            }
        }
        for (const rule of candidates) {
            const matched = typeof rule.match !== 'function'
                ? false
                : (rule.match.length === 0 ? rule.match() : rule.match(cur, src));
            if (!matched) continue;
            const text = typeof rule.ok !== 'function'
                ? ''
                : (rule.ok.length === 0 ? rule.ok() : rule.ok(cur, src));
            return { id: rule.id, text };
        }
        return null;
    }

    return {
        LATIN_SFX_ALT,
        LATIN_SFX_MIX_EXTRA,
        JUSTIFIED_LATIN_KEEP,
        KANA_SCRAP_PAIRS,
        ROD_JA_EXTRA,
        ADULT_JA_ANCHOR,
        ANCHOR_COVER,
        ASR_GARBAGE_JA,
        JA_FEAT,
        RESIDUAL_CLASS,
        CLIMAX_POLARITY,
        textLen,
        latinSfxMixRe,
        latinSfxTokenRe,
        latinSfxAtomRe,
        latinSfxMoanAtomRe,
        jaHasRodCue,
        isAdultJaAnchor,
        isJustifiedLatinLeak,
        isAsrGarbageJa,
        extractJaFeatures,
        zhCoverJaAnchors,
        isZhSufficientForJa,
        classifyClimaxPolarity,
        stripLatinSfxMixZh,
        applyKanaScrapsZh,
        classifyResidual,
        residualScore,
        matchStubRules,
    };
}));
