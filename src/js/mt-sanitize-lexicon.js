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
        { zh: 'くり', ja: reFromB64('44GP44KKfOOCr+ODqg==') },
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
        rod: reFromB64('44GK44Gh44KTfOOCquODgeODs3zjgaHjgpPjgb1844OB44Oz44OdfOOBoeOCk+OBoeOCk3zjg4Hjg7Pjg4Hjg7N844GK44GY44KTfOOBiuOBk+OBoeOCh3woPzwhW+OCreODg+ODg10p44OB44OzfCg/Ol58W17jgYrjgqrjgq1dKeOBoeOCkw=='),
        sensei: /先生|せんせい|センセ/,
        nipple: reFromB64('5Lmz6aaWfOOBoeOBj+OBsw=='),
        tip: /先っぽ|先っちょ/,
        dashite: reFromB64('5Ye644GX44GmfOWHuuOBleOCjHzlh7rjgaHjgoN844Gn44Gh44KD'),
        irete: reFromB64('5YWl44KMfOaMv+WFpXzmjL8='),
        lick: reFromB64('6IiQfOODleOCp+ODqQ=='),
        kiss: /キス/,
        touch: /触って|さわって/,
        iku: reFromB64('KD88IVvjg5Djg7RdKeOCpFvjgq/jg4PjgaPjgY1dfOOBhOOBo+OBoeOCg3zjgqTjgq18KD88IVvooYxdKeOBhOOBjw=='),
        rame: /らめ|ラメ/,
        choudai: /ちょうだい|頂戴/,
        yoro: /よろしく/,
        etchi: reFromB64('44Ko44OD44OBfOOCqOODrXzoibLjgaPjgb0='),
        fella: reFromB64('44OV44Kn44Op'),
        first: /初めて/,
        oppai: reFromB64('44GK44Gj44Gx44GE'),
        look: /見て|ほら/,
        kimochi: /気持|キモチ|気にも/,
        dame: /だめ|ダメ|駄目|いや/,
    });

    /**
     * JA anchor → expected ZH cover (for sufficiency / under detection).
     * @type {ReadonlyArray<{ id: string, ja: RegExp, zh: RegExp }>}
     */
    const ANCHOR_COVER = Object.freeze([
        { id: 'nipple', ja: reFromB64('5Lmz6aaWfOOBoeOBj+OBsw=='), zh: reFromB64('5Lmz5aS0fOWltuWktHzkubPpppY=') },
        {
            id: 'rod',
            ja: reFromB64('44GK44Gh44KTfOOBoeOCk+OBvXzjgaHjgpPjgaHjgpN844Kq44OB44OzfOODgeODs+ODnXzjgYrjgZjjgpPjgb1844GK44GT44Gh44KHfOOCpOODgeODouODhHzjg4fjgqvjg4Hjg7N844Oa44OL44K5fOOBiuOBoVvil4vjgIfil69cKl3jgaHjgpN844GhW+KXi+OAh+KXr1wqXeOCkw=='),
            zh: reFromB64('6IKJ5qOSfOm4oeW3tHzpuKHpuKF85qOSfOmYs+WFtw=='),
            skipJa: reFromB64('44Kt44OD44OB44OzfOOCreODo+ODg+ODgXzjg5Tjg7Pjg4F844Op44Oz44OBfOOCouODs+ODgXzjgrnjgqTjg4Pjg4F844Kt44OD44OB44Oz44Od44O844OrfOOBiuOBoeOCk+OBseOBhHzjgYrjgaHjgpPjga7kubPpppY='),
        },
        { id: 'manko', ja: reFromB64('44G+44KT44GTfOOBiuOBvuOCk+OBkw=='), zh: reFromB64('5bCP56m0fOeptHzpmLTllIc=') },
        {
            id: 'dashite',
            ja: reFromB64('5Ye644GX44GmfOWHuuOBleOCjHzlsITnsr585Ye644GX44G+44GZfOWHuuOBl+OBpuOCiw=='),
            zh: reFromB64('5bCEfOWHuueyvnznsr7mtrJ85bCE5Ye65p2lfOWPr+S7peWwhHzpnLLlh7rmnaV85Y+j5rC0fOeIsea2snzlhoXlsIR85Ye65p2l5LqGfOmcsuWHunzmjo/lh7p85ou/5Ye65p2lfOWwhOeyvnzlsITkuoZ85bCE5Ye6'),
            skipJa: reFromB64('57WQ5p6cfOaIkOe4vnznrZTjgYh85a6/6aGMfOiqsumhjHzlo7Dlh7rjgZfjgaZ85aOw44KS5Ye6fOWjsOWHuuOBleOCjHzlmZvjgb/lh7p8KD8644GCKT/jgbnjgo1844OZ44Ot5Ye6fOacneOBlOmjr3zmnJ3jgZTjga/jgpN844GK6Iy25Ye6fOiIjOWHunzov73jgYTlh7p85oq95Ye6fOWRvOOBs+WHunzjgqTjg6njgqTjg6l85oCS44KJ44KMfOawl+aMgeOBoeOCkuWHunzlpaXnvql85oCd44GE5Ye6fOaJi+WHuuOBl+OBpnzmiYvjgpLlh7p85omL5Ly444GwfOiFleOCguWHunzlvJXjgY3lh7p85omV44GE5Ye6fOm8u+ihgHzjg4/jg6njg5njg6l855Wz5YWI6LypfOOCqOODkeODvOODhnzlvqnnv5J85LiA5b+c5Ye644GX44GmfOaxl+WHuuOBl+OBpnzmnKzkurrlh7rjgZfjgaZ85pWZ44GI5LuY44GN5Ye6fOeqgeOBjeWHuuOBl+OBpnznqoHjgY3lh7rjgZXjgox856qB44GN5Ye644GXfOi7iuWHuuOBl+OBpnzlj6Plh7rjgZfjgaZ844GK5Y+j5Ye644GX44GmfOi2s+WHuuOBleOCjHzotrPjgpLlh7p85o+Q5Ye644GX44GmfOWHuuOBl+OBpuOBj+OCi3zjgrvjg6zjg5bmhJ/lh7p85oSf5Ye644GX44Gm44KLfOabuOOBjeWHuuOBl+OBpnzjgoLjgY3lh7rjgZfjgaZ85oWO44GMfOefpeOCiuOBpOOBjeWHunzllovjgYTlh7p86Kmx44GX44Gq44GM44KJ5Ye6fOS4gOeUn+aEj+awl3znlJ/mhI/msJfjgat844Kx44OE5Ye644GX44GmfOOCseODhOWHunzjgYrlsLvjgpLlh7p844GK5bC75Ye644GX44GmfOiFsOWHuuOBl+OBpnzluIzmnJvjgpLlh7p86KaL5Ye644GX44GmfOWQjeWJjeWHunzmiYvntJnlh7p86Z+z5Ye644GX44GmfOmfs+OCkuWHunzjgYrjgaPjgbHjgYTlh7p86LW05Lu7fOWxiuOBkeOBp+OBjXzjgYrlsYrjgZF855qG44GV44KT44Gr44GK5bGKfOOChOOCi+awl+WHunznm67jgpLlh7rjgZfjgaZ855uu44KS5Ye6fOWPjeecgeOBl+WHunzku7LplpPjgarjgpPjgYvlh7rjgZfjgaZ85Ye644GX44Gm44KE44KTfOawl+iyoOOBhOWHunzplovjgY3lh7rjgZfjgaZ85aC05omA44KS5Ye644GmfOaKnOOBkeWHuuOBl+OBpnzmiYvjgaTjgY3lh7rjgZfjgaZ85omL44Gk44GN5Ye6'),
        },
        {
            id: 'irete',
            ja: reFromB64('5YWl44KMfOaMv+WFpXzmjL/jgow='),
            zh: /插|进|入|深|塞|放/,
            skipJa: reFromB64('44K344Oj44Ov44O8fOmiqOWRgnzjgYrpoqjlkYJ86Kaq44GrfOaWh+WMlnzlhaXjgoznial85YWl44KM44KL44Gq44KIfOWPl+OBkeWFpeOCjHzjg5DjgqTjg4jlhaXjgox844K744OD44OI44KS5YWl44KMfOWFpeOCjOOBvuOBmXzkurrjga7lhaXjgozjgot85YWl44KM44Gm44GP44KM44Gq44GE44Gu44GtfOWrgeWFpeOCjHzlq4HlhaV85omL44Gr5YWl44KMfOODkOOCpOOCr3zjgqTjg6Tjg5vjg7N86Z+z5YWl44KMfOOBiOOBguWFpeOCjHzjgqjjgqLlhaXjgox85omL5YWl44KMfOWKoOeCueawtHzmsLTlhaXjgox85Yqb5YWl44KM44KLfOWKm+OCkuWFpeOCjHzlipvlhaXjgox85beu44GX5YWl44KMfOaMv+WFpeW/heimgeOBquOBi+OBo+OBn3zlhaXjgozjgbLjgoPjgpN86YCj57Wh5YWl44KMfOaWreOCinzohbDlhaXjgox844GK6YWS5YWl44KMfOmFkuWFpeOCjHzjg6njgqTjg7N86YOo6aGe5YWl44KMfOWkp+WtpnzkuInmtYF86Kqw44Gn44KC5YWl44KM44KLfOeUs+OBl+WFpeOCjHzkuovmoYh844OR44K644Or44Gu5YWl44KMfOODkeOCuuODq+OBp+OBgnzniLbjgaHjgoPjgpPjgahccyrlhaXjgozjgZ/jgok='),
        },
        { id: 'lick', ja: reFromB64('6IiQfOODleOCp+ODqQ=='), zh: reFromB64('6IiUfOWQq3zlj6PkuqR85Y+j54KufOWQuQ==') },
        {
            id: 'kiss',
            ja: /キス/,
            zh: /亲|吻/,
            skipJa: /エキス|キステックス|ゴキスキ|キスタロー|ニッチャ/,
        },
        { id: 'sensei', ja: /先生|せんせい|センセ/, zh: /老师|先生|医生/ },
        // 先头 = wrong soft gloss (not sufficient); remap to 前端 in opaque
        { id: 'tip', ja: /先っぽ|先っちょ/, zh: reFromB64('5YmN56uvfOm+n+WktHzpobbnq6985YWI56uvfOWJjemdonzlsJbnq68=') },
        {
                id: 'iku',
            ja: reFromB64('KD88IVvjg5Djg7Tjg6FdKeOCpFvjgq/jg4PjgaNdfOOBhOOBo+OBoeOCg3zjgqTjgq0='),
            zh: reFromB64('5bCE5LqGfOWOu+S6hnzopoHlsIR86KaB5Y67fOmrmOa9rnzlh7rmnaV86KaB5p2lfOW/jeS4jeS9j3zlj6/ku6XkuoblkJd85oiR5Y67fOWGjeWOu3zkuI3og73ljrt85bCE5b6XfOWwhOi/h3zopoHms4R85Y675ZCnfOS4jeaDs+WOu3zlsITkuIDmrKF85bCE5LiA'),
            skipJa: reFromB64('44OQ44Kk44KvfOOCpOODg+ODj+ODs3zjgqTjg4Pjg4Hjg43jg7x844GE44Gj44Gh44KD44GL44KPfOOBhOOBo+OBoeOCg+ael3zjgYTjgaPjgaHjgoPjgYQkfOOBhOOBoeOBjeOCjOOBhHzjgYTjgaPjgaHjgoPjgpPjgYTjgaPjgaHjgoN844GE44Gj44Gh44KD44KT44GE44Gh44KDfOOBhOOBo+OBoeOCg+OCk3zjgqTjgq3jgaHjgoPjgpN844K044Kt44Ol44Kk44KkfOOCuOODo+ODnuOCpOOCr3zjgrDjg7zjgrjjg6Pjg7PjgrHjg7N844GC44Gh44KF44KC55ay44KMfOOCpOOCpOOCpOOCreODiOOCouODq3zjgYTjgaPjgaHjgoPlpKfkuot844GE44Gj44Gh44KD44KT44GT44GqfOOBhOOBo+OBoeOCg+OCk+ODreODvOOCt+ODp+ODs3zjgq/jgqTjg4Pjg4R844Kk44OD44Go5byVfOOCueOCpOODg+ODgXzkuK3ooYzjgY185Lul5aSW44GE44Gj44Gh44KDfOOBk+OCk+OBquOCguOCk+OBp+OBhOOBo+OBoeOCg+OBhnzjgYTjgaPjgaHjgoPjgYbjgoR844Op44Kk44KvfExJS0V844K544Oq44O8fOODnuOCpOOCr3zjgYTjgaPjgaHjgoPjgYTjgb7jgZfjgod844GE44Gj44Gh44KD44GE44G+44GX44KH44GGfOS8neOBiOOBpuOBhOOBo+OBoeOCg3zli5XjgYTjgabjgYTjgaPjgaHjgoN85o6l5a6iLnswLDEwfeOBhOOBo+OBoeOCg3zjgYTjgaPjgaHjgoPjgarjgZXjgZ3jgYZ844Kv44Kk44OD44K/44O8fOODhOOCpOODg+OCv+ODvHxUd2l0dGVyfOebruOBjOOBhOOBo+OBoeOCg+OBhnznm67jgYzjgYTjgaPjgaHjgoN844Oi44K244Kk44Kv44Gn6KaL44KMfOimi+OCjOOBn+OCieimi+OCjHzpu5njgaPjgabjgYTjgaPjgaHjgoN844Kk44OD44OB44Gq5aWzfOOCteOCpOOCr+ODq3zjg6zjg7Pjgr/jgrXjgqTjgq/jg6t844Oq44K144Kk44Kv44OrfOODkOOCpOOCr+ODrOODs+ODiA=='),
        },
        { id: 'touch', ja: /触って/, zh: /摸|触|碰/ },
        { id: 'rame', ja: /らめ[ぇえ]|らめらめ|やめね|やめて/, zh: /不行|不要|别|别停|碍事/, skipJa: reFromB64('44K544Kr44O844OIfOOBo+OBt+OBq+OCg3zpgqrprZTjgaHjgoXjgYZ844Oe44K444Gn44K544Kr44O844OI') },
        // 射 alone must not cover ちょうだい (e.g. 手ぇちょうだい → 把手给我)
        { id: 'choudai', ja: /ちょうだい/, zh: /给|求|嘴里|口里|口中/, skipJa: /逃げられ|逃げて.{0,8}ちょうだい|助けて.{0,8}ちょうだい/ },
    ]);

    /** Known ASR garble shapes — skip training (source noise). */
    const ASR_GARBAGE_JA = reFromB64('44GT44KT44KJfOOCjOOCk+OBvXzjgZXjgY3jgaPjgbp844Gh44GP44Gz44KDfOOCpOOCpOODgeOCr+ODqHzjgqTjg7Pjg5fjg6vjg6B844Oo44Oy44KkfOOBuuOBj+KApnzjgaLjgoPjgYTjgYN844O044Kj44OM44OrfOODleOCo+OCquODs3zjg57jg4PjgrXjg7N844OV44Kp44O844GK44G+44KT44GTfOOCreODpeODvOODlOODvHzjgrjjg6fjg5bjg63jg5njg61844Kk44OD44OB44ON44O8fOOCpOODg+ODj+ODs+ODgOODg+ODgXzjgrXjg7PjgrPjg7Pjgrvjgqp844Ki44Oz44Kz44Os44Kk44Oz44OdfOOBhOOBo+OBoeOCg+OCk+OBhOOBo+OBoeOCg3zjgrnjg4jjgqTjgq3jgaTjgY9844OB44Ki44Os44CB44Oh44Kk44Kt44Oz44KwfOOCtOOCreODpeOCpOOCpOOCq+ODi+OCt+OCt+ODo+OCpOOCrXzjgqrjg4Hjg7Pjg4rjg4vjgr3jg4rjgqTjg4HjgrfjgrN844KE44Gj44Gx44GE44Gz44KT44Gt5YWI55Sf44Gn44Gq44KT44GL5q+O5ZuefOOBlOOBjeOCheOCk+OBoeOCk3zlhaXjgozjgbLjgoPjgpN85Y+j55uu44GM5YWl44KMfOOBoeOCk+OBoeOCiuOBkOOCinzjgorjgZDjgorjgZfjgabjgol844KJ44KB44GH44Gj44G344Gr44KDfOOBo+OBt+OBq+OCg+OBo+OBtw==');

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
        if (reFromB64('44GK44Gh44KT44Gu5Lmz6aaW').test(s) && !reFromB64('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBvXzjg4Hjg7Pjg51844OH44Kr44OB44Oz').test(s)) return false;
        if (RE?.dekachinSrc?.test?.(s)) return true;
        // Prefer lookbehind-aware ROD_JA_EXTRA over opaque jaHasRodSrc (bare チン → ディッチンコ FP)
        if (ROD_JA_EXTRA.test(s)) return true;
        // Censored / ASR-truncated rod scraps
        if (reFromB64('44GhW+KXi+OAh+KXrypd44GTfOODs+ODnXzjgq3jg7PjgaFb44Oz44KTXXzjgaHjgpNb4peL44CH4pevKl0=').test(s)) return true;
        if (RE?.jaHasRodSrc?.test?.(s)) {
            if (reFromB64('44OH44Kj44OD44OB44OzfOOCreODg+ODgeODs3zjgrnjgqTjg4Pjg4F844Kt44Oj44OD44OBfOODlOODs+ODgXzjg6njg7Pjg4F844Ki44Oz44OBfOOCteODs+ODieOCpOODg+ODgQ==').test(s)) return false;
            return true;
        }
        return false;
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
                // Do not unskip 「sounyuu not needed」apology via bare sounyuu lemma
                const sexualUnskip = reFromB64('KD865Lit44Gr5Ye6fOWkluOBq+WHunznsr7mtrJ844K244O844Oh44OzfOWwhOeyvnzkuK3lh7rjgZd85Ye644GX44Gm44KC44GE44GEfOaMv+WFpSg/IeW/heimgeOBquOBi+OBo+OBnyl85oy/44KM44GmfOOBiuOBvuOCk+OBk+OBq+WHuik=').test(s);
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
        // Climax-only cues: short about-to-cum / about-to-go is enough
        if (
            cover.present.every((id) => id === 'iku' || id === 'rame')
            && reFromB64('6KaB5bCE5LqGfOimgeWOu+S6hnzlsITkuoZ85Y675LqG').test(z)
        ) {
            return true;
        }
        // Sensei+nipple climax recovered stub
        if (/老师/.test(z) && reFromB64('5Lmz5aS0').test(z) && reFromB64('5Y675LqGfOWwhOS6hg==').test(z)) return true;
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
        if (reFromB64('5bCE57K+fOWHuuOBl+OBpnzlh7rjgZXjgox844K244O844Oh44OzfOeyvua2sg==').test(s)) male += 3;
        // Bare イクイク stack is male-leaning, but らめ/だめ resist overrides (baby だめ + climax)
        if (reFromB64('44Kk44KvKD8644Kk44KvKSt844Kk44Kv44Kk44Kv').test(s) && !rameResist && !/(?:だめ|ダメ)/.test(s)) male += 2;
        if (reFromB64('KD8644GKKT/jgb7jgpPjgZMuezAsMTJ9KD8644Kk44ODfOOBhOOBo+OBoeOCg3zjgqTjgaN844Kk44KtKQ==').test(s)) female += 4;
        if (reFromB64('KD8644Kk44ODfOOBhOOBo+OBoeOCg3zjgqTjgaMpLnswLDEyfSg/OuOBiik/44G+44KT44GT').test(s)) female += 4;
        if (reFromB64('44G+44KT44GT44GE44Gj').test(s)) female += 4;
        if (reFromB64('KD865Lmz6aaWfOOBoeOBj+OBsykuezAsMTJ9KD8644Kk44KtfOOCpOODg3zjgYTjgaPjgaHjgoN844GE44GPKQ==').test(s)) female += 3;
        if (reFromB64('KD8644Kk44KtfOOCpOODg3zjgYTjgaPjgaHjgoMpLnswLDEyfSg/OuS5s+mmlnzjgaHjgY/jgbMp').test(s)) female += 3;
        // Bare nipple cue without male shoot → prefer_go (soft→shoot must not flip)
        if (reFromB64('5Lmz6aaWfOOBoeOBj+OBsw==').test(s) && !reFromB64('5bCE57K+fOWHuuOBl+OBpnzlh7rjgZXjgox844K244O844Oh44Oz').test(s)) female += 2;
        if (reFromB64('44Kk44OD44Gh44KD44GE44Gd44GG44KIfOOCpOOBo+OBoeOCg+OBhOOBneOBhuOCiHzjgYTjgaPjgaHjgoPjgYTjgZ3jgYbjgoh844GE44GN44Gd44GG44KIfOOCpOODg+OBoeOCg+OBhOOBvuOBmeOBi3zjgYTjgaPjgaHjgoPjgYTjgb7jgZnjgYs=').test(s)) female += 3;
        // らめ／らめらめ + climax → female resist (including イクイク stacks)
        if (rameResist && reFromB64('44Kk44KvfOOCpOODg3zjgqTjgaN844GE44Gj44Gh44KDfOOCpOOCrXzjgYTjgY8=').test(s)) female += 3;
        // dame + climax / ASR dame-ditcha — female resist
        if (
            (
                reFromB64('44OA44OhP+OCpOODg+OBoeOCg+OBhnzjgaDjgoHjgqTjg4PjgaHjgoPjgYZ844OA44Oh44Kk44OD44Gh44KD44GGfCg/OuOBoOOCgXzjg4Djg6EpW+OAgSxcc10q44Kk44OD44Gh44KD44GG').test(s)
                || reFromB64('44OA44OhP+OCpOODg+OBoeOCg+OBo+OBn3zjgaDjgoHjgqTjg4PjgaHjgoPjgaPjgZ9844Kk44OD44Gh44KD44Gj44Gf44KP').test(s)
                || reFromB64('KD8644Gg44KBfOODgOODoSkuezAsNH0oPzrjg4fjgqPjg4Pjg4Hjg6N844Kk44OD44Gh44KDKQ==').test(s)
            )
            && !reFromB64('5Ye644GX44GmfOWwhOeyvg==').test(s)
        ) {
            female += 2;
        }
        if (/やめね|やめてね|やめないで|やめろ/.test(s) && reFromB64('44Kk44OD44Gh44KD44GGfOOBhOOBo+OBoeOCg+OBhnzjgqTjgaPjgaHjgoPjgYY=').test(s)) female += 2;
        if (/やめ/.test(s) && reFromB64('44Kk44OD44Gh44KD44GE44Gd44GGfOOCpOOBo+OBoeOCg+OBhOOBneOBhnzjgYTjgaPjgaHjgoPjgYTjgZ3jgYY=').test(s) && !reFromB64('5Ye644GX44GmfOWwhOeyvg==').test(s)) female += 2;
        // climax + dame command/reason — resist after climax cue
        if (reFromB64('KD8644Kk44OD44Gh44KDfOOBhOOBo+OBoeOCgykuezAsMTJ9KD8644Gg44KBfOODgOODoSk=').test(s) && !reFromB64('5Ye644GX44GmfOWwhOeyvg==').test(s)) female += 2;
        // Anal climax without ejac JA → prefer_go
        if (reFromB64('44Ki44OK44OrLnswLDEwfSg/OuOCpOODg+OBoeOCg3zjgqTjg4PjgaZ844Kk44KvKQ==').test(s) && !reFromB64('5Ye644GX44GmfOWwhOeyvg==').test(s)) female += 2;
        if (/わた[し]|あたし/.test(s) && reFromB64('44Kk44ODfOOBhOOBjXzjgqTjgq1844GE44Gj44Gh44KD').test(s)) female += 1;
        if (/やめ/.test(s) && reFromB64('44Kk44OD44Gh44KD44GE44G+44GX44GffOOCpOODg+OBn+OCiA==').test(s) && !reFromB64('5Ye644GX44GmfOWwhOeyvg==').test(s)) female += 2;
        if (reFromB64('44GK5bC7LnswLDE2feOCpOOCr+OBk+OBqOOBquOCiuOBn+OBj+OBquOBhA==').test(s) && !reFromB64('5Ye644GX44GmfOWwhOeyvg==').test(s)) female += 2;
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
        if (polarity === CLIMAX_POLARITY.prefer_go && reFromB64('6KaB5bCE5LqGfOWwhOS6hg==').test(after) && !reFromB64('5Ye644GX44GmfOWwhOeyvg==').test(src)) {
            conflictRisk = 0.55;
            reuse = Math.max(reuse, 80);
        }
        if (polarity === CLIMAX_POLARITY.prefer_shoot && reFromB64('6KaB5Y675LqGfOWOu+S6hg==').test(after) && !reFromB64('44G+44KT44GTfOS5s+mmlnzjgaHjgY/jgbM=').test(src)) {
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
