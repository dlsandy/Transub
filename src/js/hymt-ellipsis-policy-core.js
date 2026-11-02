/**
 * Hy-MT2 ellipsis / filler slot policy (pure).
 * - Pure moan/breath/onomatopoeia → delete cue pair
 * - Pure discourse → delete unless context-bridge value (then recover if ZH is …)
 * - Lexical JA with ZH … → recover (never ship …)
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubHyMtEllipsisPolicy = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function hymtEllipsisPolicyFactory() {
    function loadFluency() {
        try {
            return (typeof module !== 'undefined' && module.exports)
                ? require('./subtitle-fluency-core')
                : (global && global.TransubSubtitleFluency);
        } catch (_) {
            return null;
        }
    }

    function loadSanitize() {
        try {
            return (typeof module !== 'undefined' && module.exports)
                ? require('./mt-sanitize-core')
                : (global && global.TransubMtSanitize);
        } catch (_) {
            return null;
        }
    }

    function isBlankZh(text) {
        const t = String(text || '').trim();
        if (!t) return true;
        return /^(?:\.\.\.|……|…)+$/.test(t);
    }

    function bareJa(text) {
        return String(text || '')
            .trim()
            .replace(/[\s　]+/g, '')
            .replace(/[。．.!！?？…·.•\-—_~～ー、，,・♡♥❤♪☆★]+/g, '');
    }

    /** Known ASR mora scraps — win over lexical-looking leftovers. */
    function isKnownAsrMoraScrapJa(b) {
        return /(?:あきまっ|いきまっ|イキまっ|いきそっ|イキそっ|まきもち|はひもつ|はひぃも|あたんつ|あやふぅ|あやま|ちょこまね|ちゅきら|やれよし|うごち|あーめ|あきゅ[っツん]?|よぶして|むちぇ|ゆほっち|ひょひょ|ぷぁんぷ|らふらふ|わふわふ|おずおず|おきおき|おどおど|ごじゃす|そんよぉ|まひゅまひゅ|スカイネル|みさみさ|かかかた|おまじかし|しょれらしゃ|もちゅくし|テストせしろ|ずうごご|しゅるかし|じゃにゅよ|しょしょ|こひこひこ|れーちんば|ひぐぐっ|ひぐひぐっ|ごぷごぷ|うしゅう|おらひだ|やふやふ|ひたひた|らぁらぁ|なんなさなさな|ちまく|ひりょかさい)/.test(b);
    }

    /**
     * Short hiragana soup with no morphology / anchors — Whisper debris that used to
     * count as substantive (≥4 kana) and ship as bare「…」forever.
     */
    function isLikelyShortKanaMashJa(text) {
        const softBare = String(text || '')
            .replace(/[\s　]+/g, '')
            .replace(/[。．.!！?？…·.•\-—_~～、，,・♡♥❤♪☆★]+/g, '');
        if (softBare.length < 4 || softBare.length > 6) return false;
        if (!/^[ぁ-んー]+$/u.test(softBare)) return false;
        if (isKnownAsrMoraScrapJa(softBare)) return true;
        if (/(?:です|ます|だよ|だね|たい|ない|から|けど|ので|ですか|ましょう|こんにちは|ありがとう|りがとう)/u.test(softBare)) {
            return false;
        }
        if (hasLexicalDialogueAnchorJa(softBare)) return false;
        // Known fillable redup / trunc — not mash
        if (/^(?:どこどこ|そんなそんな|みくみく|ふるふる|いぐいぐ|ちょいちょい|こんにち|りがとう|そだよ)$/u.test(softBare)) {
            return false;
        }
        return true;
    }

    /** Moan / stutter scraps that soft_keep used to ship as perpetual「…」. */
    function isLikelyMoanStutterScrapJa(text) {
        const t = String(text || '').trim();
        if (!t) return false;
        const softBare = t
            .replace(/[\s　]+/g, '')
            .replace(/[。．.!！?？…·.•\-—_~～、，,・♡♥❤♪☆★]+/g, '');
        if (!softBare || softBare.length > 14) return false;
        if (/[一-龥]/.test(softBare)) return false;
        if (hasLexicalDialogueAnchorJa(bareJa(t))) return false;
        if (/(?:です|ます|だよ|だね|たい|ない|から|けど)/u.test(softBare)) return false;
        // Pure elongated vowels / っ stutter
        if (/^[ぁあゃゅょぅぇぉっッンんー]+$/u.test(softBare)) return true;
        if (/^(?:っ[…·.\s]*){2,}/u.test(t) && softBare.length <= 14) return true;
        if (/^(.)\1{3,}$/u.test(softBare)) return true; // ここここ
        if (/^(?:めっ|ごっ|やっ|やぁ|やぁ|ひゅい|ふにゃ|らら|はらぁ|みふ|ごく|ぐぅ|ひゃら|あめ){1,4}$/u.test(softBare)) {
            return true;
        }
        // めっ、めっ / ごっ、ごっ / ゆう、ゆう / やぁぁ…や
        if (/^(?:([ぁ-んァ-ン]{1,3})[っッ]?[、,，…·.\s]*){1,4}\1?[っッ]?$/u.test(t)
            && softBare.length <= 10
            && !/(?:なに|どこ|それ|これ|あれ|うん|はい)/u.test(softBare)) {
            return true;
        }
        return false;
    }

    /**
     * Real dialogue / climax anchors — never pure-moan / ASR-debris delete.
     * Keep イク/あげて/こと; do not use bare いき (collides with いきまっ scrap).
     */
    function hasLexicalDialogueAnchorJa(b) {
        if (!b || isKnownAsrMoraScrapJa(b)) return false;
        // やめ covers やめて / やめやめ / やめろ — after moan-strip leftover 「やめやめ」
        // is length 4 and must not fall through moan-dominated ASR-debris delete.
        // Avoid bare して/はい/すご — they false-hit scraps (はいし / そうて) and lone te-crumbs.
        return /(?:イク|イッ|イく|い[くク]|あげて|やめ|こと|さま|なんで|ひゃんで|なに|何|好き|気持ち|きもち|エッチ|ちょっと|ダメ|だめ|みたい|こっち[へにをは]?|しちゃ|ぐしょ|リラックス|でしょ|なんか|それは|もちろん|いける|ごめん|マジ|どう|先生|せんせ|かなり|ください|ます|です|した|してくださ|してくれ|してよ|すご[いうー～イ]?|スゴ[イい]?|よかった|あったか[いい]|温か[いい]|暖かか|セクシー|ブラジャー|スパイシー|楽しみ|最高|知った|いやらし|ほれ|けど|でも|だって|じゃあ|素敵|恥ずかし|はずかし|どうかし|あげます|服)/.test(b)
            || /(?:^|[^ぁ-んァ-ン一-龥])はい(?:$|[^ぁ-んァ-ン一-龥])/.test(b)
            || /(?:^|[^ぁ-んァ-ン一-龥])そう(?:$|[^ぁ-んァ-ン一-龥])/.test(b)
            || /[ぁ-んァ-ン一-龥a-zA-Z]{1,8}ちゃん/.test(b);
    }

    /** Strip moan/breath tokens without eating lexical prefixes (あ in あげて / ひゃ in ひゃんで). */
    function stripMoanBreathJa(b) {
        return String(b || '')
            .replace(/(?:あぁ+|ああ+|はぁ+|はあ+|ひゃぁ+|ひゃっ|うっ+|うわ+|あっ+|んっ+|んん+|ふふ+|へへ+|きゅっ?)+/gu, '')
            .replace(/[ー〜～っッ]/g, '');
    }

    /**
     * Pure ん/んん breath (not dialogue うん/うんうん).
     * Resurrecting these as「嗯」floods soft-AV 成片 (YUJ-071: 40×嗯).
     */
    function isBreathNOnlyJa(text) {
        const compact = String(text || '').replace(/[\s　、，,]+/g, '');
        if (!compact) return false;
        // Bare discourse acks stay non-moan (bridge recover).
        if (/^(?:うん|うんうん|ううん)[ー〜～っッ…·.]*$/u.test(compact)) return false;
        if (/^(?:ん+|ン+)[っッー〜～…·.]*$/u.test(compact)) return true;
        if (/^(?:ん[っッ]?[…·.]*){2,}$/u.test(compact)) return true;
        if (/^(?:ん[、,，]?)+ん+[っッ…·.]*$/u.test(compact)) return true;
        // うんんん…んん / うん…んん… — breath pile, not ack
        if (/^うんん+/u.test(compact) || /^うん[んン]{2,}/u.test(compact)) return true;
        if (/^うん[っッー〜～…·.]+ん/u.test(compact)) return true;
        if (/^(?:すん|んしょ)[っッー〜～…·.]*$/u.test(compact)) return true;
        return false;
    }

    /** Det-fill that is only 嗯/哈/啊 — must not resurrect breath blanks. */
    function isFillerOnlyDetFillZh(hit) {
        const t = String(hit || '').trim();
        if (!t || t === '…') return true;
        const core = t
            .replace(/[哈啊嗯哦诶呜呵唉哎喔呼嘻]+/gu, '')
            .replace(/[…·.•\-—_~～\s！!？?。．.、，,]+/gu, '');
        return Array.from(core).length < 1;
    }

    /** Pure breath / moan / SFX (喘息·拟声) — always delete when ZH blank or filler. */
    function isPureMoanOrSfxJa(text) {
        const fluency = loadFluency();
        const t = String(text || '').trim();
        if (!t) return false;
        // Discourse particles are never moans (うん/はい bridge recover must stay available).
        if (fluency?.isPureDiscourseJa?.(t) && !isBreathNOnlyJa(t)) return false;
        if (isBreathNOnlyJa(t)) return true;
        // Vocative call-outs (おい / ねえ) — never treat as moan via お+/え+ scraps.
        {
            const call = bareJa(t);
            if (/^(?:おい|おーい|ねえ+|ねぇ+|ほら|ちょっと)[っッ]*$/u.test(call)) return false;
        }
        const b0 = bareJa(t);
        // Redup ASR scraps before lexical-anchor short-circuit (そう matches そうしそうし)
        {
            const compact = t.replace(/[\s　、，,]+/g, '');
            if (/^(?:わり){2,}[っッー〜～…\.]*$/u.test(compact)) return true;
            if (/^(?:そうし){2,}[っッー〜～…\.]*$/u.test(compact)) return true;
            if (/^(?:そ){3,}[っッー〜～…\.]*$/u.test(compact) && compact.length <= 12) return true;
        }
        if (hasLexicalDialogueAnchorJa(b0)) return false;
        // Lexical loans / discourse reactions misclassified as ono — keep recover/det-fill path.
        // Note: bareJa strips ー, so match reactions on compact raw (へー → bare へ).
        {
            const compactReact = t.replace(/[\s　、，,]+/g, '');
            if (/^(?:バイバイ|ばいばい|ティッシュ)[ー〜～っッ]*$/u.test(b0)
                || /^(?:バイバイ|ばいばい|ティッシュ)[ー〜～っッ]*$/u.test(compactReact)) {
                return false;
            }
            if (/^(?:へー+|ふーん+)$/u.test(compactReact) || /^(?:へ|ふん)$/u.test(b0)) {
                return false;
            }
            // うん/うんうん ack — fluency often marks as ono; keep discourse delete/bridge path.
            if (/^(?:うん|うんうん|ううん)[ー〜～っッ…·.]*$/u.test(compactReact)) {
                return false;
            }
        }
        if (fluency?.isPureOnomatopoeiaJa?.(t)) return true;
        if (fluency?.isKatakanaSfxBurst?.(t)) return true;
        const b = b0;
        if (!b || b.length > 24) return false;
        if (/[一-龥々]/.test(b)) return false;
        // Kiss / wet oral SFX often missed by fluency ono classifier
        // Include ちゅくちゅく / ちゅくっ (wet suck), not bare ちゅく inside dialogue.
        if (/^(?:ちゅ[ー〜～っッく]*|んちゅ|じゅる*|ぬぷ*|くちゅ+|ちゅくっ)+$/u.test(b)) return true;
        if (/^(?:ちゅく){2,}[っッ]?$/u.test(b)) return true;
        // Wet swallow / gulp SFX (ごくごく / ゴクゴク) — delete blank ZH, never ship「…」
        if (/^(?:ごく|ゴク){2,}[ごくゴクっッんン…·.\s]*$/u.test(b) || /^(?:ごく|ゴク){2,}[ごくゴクっッんン…·.\s]*$/u.test(String(text || '').replace(/[\s　]+/g, ''))) return true;
        // Cough / startle / chew scraps (こほっ / げほっ / ごほん / あわっ / あぐあぐ / あやぁ)
        {
            const compact = t.replace(/[\s　、，,]+/g, '');
            if (/^(?:こほっ?|ゴホッ?|げほっ?|ゲホッ?|ごほん+|ゴホン+){1,4}[…\.]*$/u.test(compact)) return true;
            if (/^(?:(?:こほっ?|ゴホッ?|げほっ?|ゲホッ?|ごほん+|ゴホン+)[…\.]*){2,}$/u.test(compact)) return true;
            // Effort / sniff / spring-SFX (よいしょ / すんすん / ちゅむっ / ビヨン)
            if (/^(?:よいしょ+|よっこいしょ+|すんすん+|すーん+|ちゅむっ?|ビヨン+|びよん+)[ー〜～っッふフ…\.]*$/u.test(compact)) {
                return true;
            }
            if (/^ビヨン[ー〜～っッ…\.]*ふふ+/u.test(compact) || /^びよん[ー〜～っッ…\.]*ふふ+/u.test(compact)) {
                return true;
            }
            // Wet / breath ASR mash left as mid-kana “lexical” blanks (ぐちゅぐ / はひゃひきひ / んちゅうき)
            if (/^(?:ぐちゅぐ|ぐちゅ+|んごちごち|はひゃひきひ|んちゅうき|うじうじ|ぎゅぎゅ)[っッー〜～…\.]*$/u.test(compact)) {
                return true;
            }
            if (/^(?:うぐっ[っッー〜～…\.・]*)+$/u.test(compact)) {
                return true;
            }
            // Lone thud / chirp / sob / cough scraps
            if (/^(?:ガタ|はちはち|ほんせぇ|ほんせえ|コホン|こほん|ごほん|ゴホン)[っッー〜～…\.]*$/u.test(compact)) {
                return true;
            }
            if (/^(?:(?:ひっく|ヒック)[、,]?\s*){2,}[ひっくヒック…\.]*$/u.test(compact)) {
                return true;
            }
            if (/^(?:(?:んくっ|ンクッ)[、,]?\s*){2,}[んくっンクッ…\.]*$/u.test(compact)) {
                return true;
            }
            if (/^(?:(?:こほん|コホン|ごほん|ゴホン)[、,]?\s*){1,4}[こほんコホンごほんゴホンっッ。．.…]*$/u.test(compact)) {
                return true;
            }
            if (/^(?:こ[、,]?\s*)?(?:こほん|コホン)(?:[、,]?\s*(?:こほん|コホン))*[っッ。．.…]*$/u.test(compact)) {
                return true;
            }
            if (/^(?:そらー[…\.]*){2,}$/u.test(compact) || /^(?:そらー)[…\.]*$/u.test(compact)) {
                return true;
            }
            // Soft-AV ASR mora mash from latest SAME/MNGS shelf batch
            if (/^(?:あたん|あた[、,]?\s*あたん|あめちもち|もひこぉ|くったぁ|やっはひっ|こえらす|あきもん|ときのん|らめすがい|はげーん|じゅぶっ|らぬなちゅた|おらたん|あきんてー|またはっ|そらー|ビンター|うでうで|あぶそっ|うさじっぱい|メホラ|こんじょま|なんこ|めぐめぐり|ちぇっち|ひんせー|ええもー|あやあや)[っッー〜～…\.]*$/u.test(compact)) {
                return true;
            }
            // Soft-AV phonetic mash (NIMA-085 shelf: ちくりゅ / はひんち / はちぇー / あさりこ)
            if (/^(?:ちくりゅ[んンぅう]*|はひんち|おっとら|あらかひ|はちぇー?|あさりこ|みすひん|はぁー?ま)[っッー〜～!！…\.]*$/u.test(compact)) {
                return true;
            }
            if (/^(?:あい[、,]?\s*)?(?:あいみぃ+)(?:[、,]?\s*あいみぃ+)*[っッー〜～!！…\.]*$/u.test(compact)) {
                return true;
            }
            // Soft-AV ASR redup scrap (わりわりわり)
            if (/^(?:わり){2,}[っッー〜～…\.]*$/u.test(compact)) {
                return true;
            }
            // Soft-AV redup scrap (そうし、そうし、そうし / そそそ)
            if (/^(?:そうし[、,]?){2,}[っッー〜～…\.]*$/u.test(compact)) {
                return true;
            }
            if (/^(?:そ){3,}[っッー〜～…\.]*$/u.test(compact) && compact.length <= 12) {
                return true;
            }
            if (/^(?:ずるずる|うるうる)[っッー〜～…\.]*$/u.test(compact)) {
                return true;
            }
            if (/^(?:ってば){2,}[ってば…\.]*$/u.test(compact)) {
                return true;
            }
            if (/^(?:うん[、,]?\s*から|お[、,]?\s*おやぁ+|おぉ?やぁ+|やぁ[、,]?\s*やぁ+|やぁやぁ+|うわ[、,]?\s*うわ|おまえ[、,]?\s*お|からぁ+)[っッー〜～…\.]*$/u.test(compact)) {
                return true;
            }
            if (/^(?:あんな[、,]?\s*あんさ|おお[、,]?\s*ひみっ)$/u.test(compact)) {
                return true;
            }
            if (/^(?:ぶ[、,]?\s*)?ぶーっ[!！]*$/u.test(compact)) {
                return true;
            }
            if (/^(?:はひゃ|あひゃ|ひゃん?){2,}[ぁあぃいぅうぇえぉおー〜～っッはぁんき…\.]*$/u.test(compact)) {
                return true;
            }
            if (/^(?:あわ+|あわっ|あわわ+|あぐ+|あぐあぐ+|あやぁ*|あゃぁ*)[っッー〜～…·.]*$/u.test(compact)) return true;
            if (/^(?:あそ|き|ぷ|わ|んち|わふ|ぱいこ|んぜ|いえじゃ|むちぇ)[っッー〜～。．.…·.?？]*$/u.test(compact)) return true;
            if (/^(?:ごほ|ゴホ|けほ|ケホ|ごぼ|ゴボ){1,6}[ごほゴホけほケホごぼゴボっッー〜～…·.]*$/u.test(compact)) return true;
            if (/^(?:ぶっ|ぶん|ごしゅるる|こしゅ|れるっ)[っッー〜～…·.]*$/u.test(compact)) return true;
            if (/れるっ/.test(compact) && compact.length <= 24 && !/[一-龥]/.test(compact)) return true;
            if (/こしゅ/.test(compact) && compact.length <= 20 && !/[一-龥かきくけこさしすせそ]{3,}/.test(compact.replace(/こしゅ|はぁ|んぅ|んっ/g,''))) return true;
            if (/^(?:っ|う|あ|も)[っうあも…·.\s]*$/u.test(compact) && compact.length <= 12) return true;
            if (/このまわしでさ/.test(compact)) return true;
            if (/もう一本本を読みたい|一本本を読み/.test(compact)) return true;
            if (/^(?:あつこ|よぶして)[…·.\sんンっ]*$/u.test(compact)) return true;
            if (/むちぇ/.test(compact) && compact.length <= 12) return true;
            if (/テストせしろ/.test(compact)) return true;
            if (/よぶして/.test(compact) && compact.length <= 20) return true;
        }
        // ASR breath scraps (はひゅはひゅ / あひゅ / あーめ) — delete, never ship「…」or「哈」
        // Keep long vowel ー for scrap ids (bareJa strips ー → あめ would false-hit candy).
        {
            const compact = t.replace(/[\s　]+/g, '');
            if (/^(?:はひゅ|あひゅ|ひゅん?|ひゅ)+$/u.test(b) || /^(?:はひゅ|あひゅ|ひゅん?|ひゅ)+$/u.test(compact)) return true;
            if (/^(?:あーめ|あひゅ|うごち)$/u.test(compact)) return true;
        }
        // Repeated short mora SFX (ちゅーちゅー / んっんっ) — not greetings that merely contain ひゃ.
        // Require moan-like units only; 「はぁやめやめ」must NOT match via embedded はぁ.
        if (
            b.length <= 12
            && /ちゅ|んっ|はぁ|うっ|ぐっ|ふふ|へへ|ひゅ/.test(b)
            && !/(?:やめ|なに|何|でも|先生|せんせ|ごめん|もちろん|いける|それは|なんか|でしょ|された|おしり|マジ|舐め|エッチ)/.test(b)
        ) {
            const moanRep = /^(?:(?:ちゅ|んっ|はぁ|はあ|うっ|ぐっ|ふふ|へへ|ひゅ|あ+|ん+)[ー〜～っッ]*){2,6}$/u.test(b);
            if (moanRep) return true;
            if (
                /^(?:[ぁ-んァ-ン]{1,2}[ー〜～っッ]*){2,6}$/u.test(b)
                && /^(?:ちゅ|んっ|はぁ|はあ|うっ|ぐっ|ふふ|へへ|ひゅ)/.test(b)
                && !/[やよゆいえおかきくけこさしすせそたちつてとなにぬねのまみむめもらりるれろわを]/.test(
                    b.replace(/(?:ちゅ|んっ|はぁ|はあ|うっ|ぐっ|ふふ|へへ|ひゅ|あ+|ん+|ー|〜|～|っ|ッ)+/gu, ''),
                )
            ) {
                return true;
            }
        }
        // Long katakana loanword / name — not moan
        if (/[ァ-ヴー]{3,}/.test(b) && !/[ッっ]/.test(b) && b.length >= 3) {
            if (!/^(?:ハッ|ハァ|フッ|フウ|ヒャ|ウワ|ア+[ッっ]?)+$/.test(b)) return false;
        }
        if (/^(?:ん+|っ+|あぁ*|ああ+|はぁ+|はあ+|ひゃ+|うっ*|うわ+|ぐ+|うぐ+|ず+|ふ+|え+|お+|や+ぁ*|あっ+|にゅ+|ん?にゃ+|ぐあっ*|がはっ*|わあっ*|あぐ+)[ぁあぃいぅうぇえぉおー〜～っッ]*$/u.test(b)) {
            return true;
        }
        // Multi-token moan scraps (んにゃぁんぁぁ). Must be whole-cue — never substring
        // false-hit lexical food/nouns that merely contain んにゃ (こんにゃく).
        if (
            b.length <= 18
            && !/[一-龥々]/.test(b)
            && /^(?:んにゃ|にゃぁ|にゅぅ|んぁ+|ちくぅ|ひぐ|あうわ)[ぁあぃいぅうぇえぉおー〜～っッん]*$/u.test(b)
            && !/(?:なに|何|でも|先生|せんせ|ごめん|もちろん|いける|それは|なんか|でしょ|された|おしり|マジ)/.test(b)
        ) {
            return true;
        }
        // Tiny vowel/n/tsu scraps only (あ / ん / うっ). Never arbitrary 3–4 kana lexical words
        // (ごめんね/それは/いけるよ/もちろん) — those were false-moan → skipped blank-retry → shipped 「…」.
        if (
            b.length <= 2
            && /^[ぁあぃいぅうぇえぉおんっァアィイゥウェエォオンッー〜～っッ]+$/u.test(b)
        ) {
            return true;
        }
        // ASR climax / wet scraps glued onto moan tokens (あきまっ / いきそっ / はひもつ)
        if (
            b.length <= 18
            && !/[一-龥々]/.test(b)
            && /(?:あきまっ|いきまっ|イキまっ|いきそっ|イキそっ|はひもつ|きもち[よよろ]|まきもち)/.test(b)
            && /(?:あっ|ああ|はぁ|んっ|んん)/.test(b)
        ) {
            return true;
        }
        // Isolated ASR mora scraps (ちゅきら / あきゅっ / あたんつ / あやふぅ / ちょこまね)
        if (
            b.length >= 3
            && b.length <= 10
            && !/[一-龥々]/.test(b)
            && /^(?:ちゅきら|ちょこまね|あやま|あやふぅ|あきゅ[っツ]?|あたんつ|やれよし|うごち|あーめ|はひゅ+|あひゅ+|ひゅん?)$/u.test(b)
        ) {
            return true;
        }
        // Moan-heavy mixed with at most one leftover mora — leftover must not look lexical.
        // 「けど、ああ」/「でも、あぁ」keep conjunction residue — never pure-moan delete.
        if (b.length <= 16) {
            const withoutMoan = stripMoanBreathJa(b);
            if (/^(?:けど|でも|だって|じゃあ|それ|これ|あれ)$/u.test(withoutMoan)) {
                return false;
            }
            if (
                withoutMoan.length <= 2
                && /あぁ|ああ|はぁ|ひゃ|うっ|あっ|んっ/.test(b)
                && !/(?:なに|何|でも|先生|せんせ|ごめん|もちろん|いける|それは|なんか|でしょ|された|おしり|マジ|けど)/.test(b)
                && !/(?:れ|よ|ね|か|の|は|を|が|も|し|る|た|て|な|ま|じ|ご|で|け)/.test(withoutMoan)
            ) {
                return true;
            }
        }
        // Repeated short mora bursts (ちゅーちゅー / んんん) — unit itself must be moan-like.
        // Lexical repeats like マジでマジで / いけるいける must NOT match.
        if (b.length >= 4 && b.length <= 16) {
            const core = b.replace(/[ー〜～っッ]+/g, '');
            const rep = core.match(/^([ぁ-んァ-ン]{1,3})\1+$/u);
            if (rep) {
                const unit = rep[1];
                if (
                    /^(?:ん+|あ+|ぅ+|う+|ぇ+|え+|ぉ+|お+|は+|ひゃ|ちゅ|にゅ|ふ+|ぐ+)$/u.test(unit)
                    || (/^[あぁうぅええぇおおんっ]+$/u.test(unit) && unit.length <= 2)
                ) {
                    return true;
                }
            }
        }
        return false;
    }

    function isPureDiscourseJa(text) {
        const fluency = loadFluency();
        return !!fluency?.isPureDiscourseJa?.(String(text || '').trim());
    }

    /**
     * Deterministic ASR debris / noise — never ship as subtitle (delete pair).
     * Broader than pure moan: katakana menu scrap, mora soup, known ASR shapes.
     * Must NOT catch real short dialogue (おっきい / どうですか / イク / アイス).
     */
    function isDeterministicAsrDebrisJa(text) {
        const raw = String(text || '').trim();
        if (!raw) return true;
        const b = bareJa(raw);
        if (!b) return true;

        // Redup ASR scraps before lexical-anchor short-circuit
        {
            const compact = raw.replace(/[\s　、，,]+/g, '');
            if (/^(?:わり){2,}[っッー〜～…\.]*$/u.test(compact)) return true;
            if (/^(?:そうし){2,}[っッー〜～…\.]*$/u.test(compact)) return true;
            if (/^(?:そ){3,}[っッー〜～…\.]*$/u.test(compact) && compact.length <= 12) return true;
        }

        // Lexical / climax anchors first — never debris (fixes あ+イク / あげて eaten by moan strip)
        if (hasLexicalDialogueAnchorJa(b)) return false;

        // Pure moan/SFX — do not let interjection heuristics exempt them
        if (isPureMoanOrSfxJa(raw)) return true;

        // Real short dialogue / climax / size / common loans — never debris
        if (/(?:おっきい|大き[いい]|ちいさ|すごい|やばい|どうです|どうな[って]|どうした|早くして|やめて|イク|イッ|いきそう|気持ち|きもち|エッチ|好き|ください|ます|です|した|して|ない|から|けど|でしょ|なんか|それは|もちろん|いける|ごめん|マジ|ちょっと|リラックス|ぐしょ|しちゃ|ダメ|だめ|みたい|こっち|なんで|なに|何|アイス|オイル|キス|ハグ|カメラ|ビデオ|ミータン|おはよう|こんにちは|ありがとう|いらっしゃいませ|おひゃい|かなり|はい)/.test(b)) {
            return false;
        }
        // Katakana names / long loans with nakaguro stay recoverable
        if (/[・･]/.test(raw) && /^[\u30a0-\u30ff・･ー\s　]+$/.test(raw)) {
            return false;
        }
        if (isPureDiscourseJa(raw) || loadFluency()?.isPureInterjectionJa?.(raw)) {
            return false;
        }

        // Pure katakana scrap only (スタイケン); long loans/names stay recoverable
        if (/^[\u30a0-\u30ff]+$/.test(b) && b.length >= 4 && b.length <= 8) {
            return true;
        }

        // Explicit ASR scrap shapes (reusable JA patterns — not title-locked)
        if (
            b.length <= 16
            && !/[一-龥々]/.test(b)
            && /^(?:ちゅきら|ちょこまね|あやま|あやふぅ|あきゅ[っツ]?|あたんつ|やれよし|うごち|あーめ|はひゅ+|あひゅ+|ひゅん?|あきまっ|いきまっ|はひもつ|まきもち)(?:[ぁあぃいぅうぇえぉおー〜～っッはぁん]*)$/u.test(b)
        ) {
            return true;
        }
        // Soft-AV phonetic mash / cough-moan scraps (MILK よぶして / テストせしろ / むちぇ)
        if (/よぶして|テストせしろ|むちぇ|とらにいき|おしあろ|ごしゅるる|一本本を読み/.test(b) && b.length <= 40) return true;
        // Soft-AV mora mash leftovers (NIMA-085) — delete, never ship「…」
        if (
            b.length <= 16
            && !/[一-龥々]/.test(b)
            && /^(?:ちくりゅ[んンぅう]*|はひんち|おっとら|あらかひ|はちぇー?|あさりこ|みすひん|はぁー?ま)[っッー〜～!！]*$/u.test(b)
        ) {
            return true;
        }
        {
            const compact = raw.replace(/[\s　]+/g, '');
            if (/^(?:あい[、,]?\s*)?(?:あいみぃ+)(?:[、,]?\s*あいみぃ+)*[っッー〜～!！…\.]*$/u.test(compact)) {
                return true;
            }
            if (/^(?:わり){2,}[っッー〜～!！…\.]*$/u.test(compact)) {
                return true;
            }
            // Soft-AV redup scrap (そうし、そうし、そうし / そそそ)
            if (/^(?:そうし[、,]?){2,}[っッー〜～!！…\.]*$/u.test(compact)) {
                return true;
            }
            if (/^(?:そ){3,}[っッー〜～!！…\.]*$/u.test(compact) && compact.length <= 12) {
                return true;
            }
        }

        // Moan-dominated line: after stripping moan/breath, almost nothing lexical remains
        if (
            b.length >= 4
            && b.length <= 24
            && !/[一-龥々]/.test(b)
            && /(?:あっ|ああ|はぁ|んっ|んん|ひゃ|ひゅ|あふ)/.test(b)
            && !hasLexicalDialogueAnchorJa(b)
        ) {
            const withoutMoan = stripMoanBreathJa(b);
            if (withoutMoan.length <= 4) return true;
        }
        // Repeated soft-AV breath scraps (はひゃ…) — delete, do not burn blank-LLM
        if (/^(?:はひゃ|あひゃ|ひゃん?|あふっ?)+[ぁあぃいぅうぇえぉおー〜～っッはぁん…\.]*$/u.test(b)) {
            return true;
        }

        return false;
    }

    /** ZH that is only a phonetic / placeholder rendering of ASR debris. */
    function isAsrDebrisTranslationZh(text = '') {
        const t = String(text || '').trim();
        if (!t) return true;
        if (isBlankZh(t)) return true;
        if (isPureFillerZh(t)) return true;
        // 「… 啦啦啦」/ repeated 啦 / nonsense breath
        if (/啦啦|哈…哈|仰躺|阿春つ/.test(t)) return true;
        if (/^(?:啊+|嗯+|哦+|哈+|呵+){1,6}[…·.\s]*$/u.test(t)) return true;
        return false;
    }

    function isPureFillerZh(text) {
        const fluency = loadFluency();
        const t = String(text || '').trim();
        if (isBlankZh(t)) return true;
        return !!fluency?.isPureInterjectionZh?.(t);
    }

    function isSubstantiveJa(text) {
        const fluency = loadFluency();
        const t = String(text || '').trim();
        if (!t || isBlankZh(t)) return false;
        // Known ASR mora mash must never count as dialogue (else bare「…」recovers forever).
        if (isKnownAsrMoraScrapJa(bareJa(t)) || isKnownAsrMoraScrapJa(t.replace(/[\s　、，,]+/g, ''))) {
            return false;
        }
        if (isLikelyShortKanaMashJa(t)) return false;
        if (isLikelyMoanStutterScrapJa(t)) return false;
        if (fluency?.shouldPreserveSubstantiveDialogueCue?.(null, t)) return true;
        // Moan-wrapped lexical anchors (はぁ そう んんっ / ああ すご) stay substantive.
        // Bare そう/はい alone stay discourse (bridge neighbor must not inflate).
        {
            const b0 = bareJa(t);
            if (hasLexicalDialogueAnchorJa(b0) && !isKnownAsrMoraScrapJa(b0)) {
                const stripped = stripMoanBreathJa(b0);
                if (stripped && stripped.length >= 2) {
                    if (/^(?:そう|はい+|うん+|ええ+|ううん+|よし+)$/u.test(stripped)) {
                        if (b0.length >= stripped.length + 2) return true;
                    } else {
                        return true;
                    }
                }
            }
        }
        if (fluency?.isPureInterjectionJa?.(t)) return false;
        if (isPureMoanOrSfxJa(t)) return false;
        // ASR mash / debris must not count as dialogue (else delivery keeps bare「…」).
        if (isDeterministicAsrDebrisJa(t)) return false;
        // Soft bare keeps っ inside おっきい (bareJa strips っ and would under-count).
        const softBare = t
            .replace(/[\s　]+/g, '')
            .replace(/[。．.!！?？…·.•\-—_~～、，,・♡♥❤♪☆★]+/g, '');
        if (/[一-龥々]/.test(softBare)) return true;
        // Katakana loans OK (アイス); reject pure mash already caught as debris above.
        if (/[ァ-ヴー]{2,}/.test(softBare) && hasLexicalDialogueAnchorJa(bareJa(t))) return true;
        if (/[ァ-ヴー]{3,}/.test(softBare) && softBare.length <= 12
            && !/(?:ッ|っ){2,}|[ンん]{2,}/.test(softBare)) {
            // Common short loans (オイル/キス) without mora-mash shape
            if (/^(?:アイス|オイル|キス|ハグ|カメラ|ビデオ|ティッシュ|ブラジャー|セクシー)$/u.test(softBare)) {
                return true;
            }
        }
        if (softBare.length >= 4 && !/^[\u30a0-\u30ffー]+$/.test(softBare)) return true;
        const b = bareJa(t);
        return b.length >= 6 && !/^[\u30a0-\u30ffー]+$/.test(b);
    }

    /** Max neighbor gap for mid-dialogue うん/はい → 嗯/是的 (user rule). */
    const DIALOGUE_ACK_MAX_GAP_MS = 2000;

    function isBareUnHaiJa(text) {
        const b = bareJa(text);
        return /^(?:うん+|ううん+|はい+)$/u.test(b);
    }

    function dialogueAckZhForJa(jaText) {
        const b = bareJa(jaText);
        if (/^(?:うん+|ううん+)$/u.test(b)) return '嗯';
        if (/^はい+$/u.test(b)) return '是的';
        return '';
    }

    function cueMs(cue, key) {
        if (cue == null || typeof cue !== 'object') return NaN;
        const n = Number(cue[key]);
        return Number.isFinite(n) ? n : NaN;
    }

    /**
     * Both adjacent gaps (prev→cue, cue→next) must be within 2s.
     * @returns {boolean|null} null when timing unavailable
     */
    function neighborGapsWithinMs(ctx = {}, maxGapMs = DIALOGUE_ACK_MAX_GAP_MS) {
        const prevEnd = Number(ctx.prevEndMs);
        const nextStart = Number(ctx.nextStartMs);
        const cueStart = Number(ctx.cueStartMs);
        const cueEnd = Number(ctx.cueEndMs);
        const maxGap = Number.isFinite(Number(maxGapMs)) ? Number(maxGapMs) : DIALOGUE_ACK_MAX_GAP_MS;
        if (
            Number.isFinite(prevEnd)
            && Number.isFinite(cueStart)
            && Number.isFinite(cueEnd)
            && Number.isFinite(nextStart)
        ) {
            const g1 = cueStart - prevEnd;
            const g2 = nextStart - cueEnd;
            // Allow tiny overlap; reject if either side opens a >2s hole.
            return g1 >= -80 && g1 <= maxGap && g2 >= -80 && g2 <= maxGap;
        }
        if (Number.isFinite(prevEnd) && Number.isFinite(nextStart)) {
            // Coarse: whole window from prev end to next start (incl. short ack cue).
            return (nextStart - prevEnd) <= maxGap + 600;
        }
        return null;
    }

    /**
     * うん/はい between two substantive dialogue cues within 2s → keep & gloss 嗯/是的.
     */
    function isTightDialogueAckBridge(jaText, ctx = {}) {
        if (!isBareUnHaiJa(jaText)) return false;
        if (!isSubstantiveJa(ctx.prevJa) || !isSubstantiveJa(ctx.nextJa)) return false;
        return neighborGapsWithinMs(ctx) === true;
    }

    /**
     * Discourse fillers worth keeping for continuity (user rule).
     * Examples: なに/ねえ/はい/うん between real lines; address forms.
     */
    function hasContextBridgeValue(jaText, prevJa, nextJa, ctx = {}) {
        const t = String(jaText || '').trim();
        const b = bareJa(t);
        if (!b) return false;
        // Address / call-out / question — always bridge (not bare さん/ちゃん honorific crumbs)
        if (/(?:せんせ|先生|先輩|様)/.test(t)) return true;
        {
            const nameHonor = bareJa(t);
            if (
                nameHonor.length >= 3
                && /(?:ちゃん|くん|さん)$/u.test(nameHonor)
                && !/^(?:ちゃん|くん|さん)$/u.test(nameHonor)
            ) {
                return true;
            }
        }
        if (/^(?:なに|何|なんで|なぜ|どうして)/.test(b)) return true;
        if (/^(?:ねえ+|ねぇ+|おい|ほら|ちょっと)/.test(b)) return true;
        if (/^(?:でも|だって|じゃあ|それで|つまり)/.test(b)) return true;
        if (/^(?:すご[いうー～ー]*|やば+|最高)/.test(b)) return true;
        const prevSub = isSubstantiveJa(prevJa);
        const nextSub = isSubstantiveJa(nextJa);
        // うん/はい: require BOTH dialogue neighbors; prefer ≤2s when timing exists.
        if (/^(?:はい+|うん+|ううん+)$/u.test(b)) {
            if (!(prevSub && nextSub)) return false;
            const gaps = neighborGapsWithinMs({
                prevEndMs: ctx.prevEndMs,
                nextStartMs: ctx.nextStartMs,
                cueStartMs: ctx.cueStartMs,
                cueEndMs: ctx.cueEndMs,
            });
            if (gaps === false) return false;
            return true;
        }
        // Soft affirmations: either neighbor substantive
        if (/^(?:ええ+|そう|よし+)/.test(b)) {
            return prevSub || nextSub;
        }
        if (isPureDiscourseJa(t)) {
            // Isolated discourse surrounded by fillers → no bridge value
            return prevSub || nextSub;
        }
        return false;
    }

    /**
     * @returns {{ action: 'delete'|'recover'|'keep', reason: string }}
     */
    function planEllipsisSlotAction(jaText, zhText, ctx = {}) {
        const ja = String(jaText || '').trim();
        const zh = String(zhText || '').trim();
        const blank = isBlankZh(zh);
        const fillerZh = isPureFillerZh(zh);

        if (!ja) {
            if (blank || fillerZh) return { action: 'delete', reason: 'empty_ja' };
            return { action: 'keep', reason: 'no_ja' };
        }

        // Whisper structural garbage (grafted kana mash) — delete pair, never ship …/invent
        try {
            const lex = (typeof require === 'function') ? require('./mt-sanitize-lexicon') : null;
            if (lex?.isAsrGarbageJa?.(ja)) {
                return { action: 'delete', reason: 'asr_garbage' };
            }
        } catch (_) { /* optional */ }

        // Catalogued mora scraps (ゆほっち / はひぃも) with blank ZH → drop, do not LLM-recover.
        if (
            (blank || fillerZh)
            && (isKnownAsrMoraScrapJa(bareJa(ja))
                || isKnownAsrMoraScrapJa(ja.replace(/[\s　、，,]+/g, '')))
        ) {
            return { action: 'delete', reason: 'asr_scrap' };
        }

        // 1) Deterministic ASR debris / pure moan / SFX → delete (never ship … or garbage ZH)
        // Lexical det-fill only (はぁ…よかった → 太好了). Reject filler glosses (哈…/啊啊/嗯嗯).
        if (isDeterministicAsrDebrisJa(ja) || (isPureMoanOrSfxJa(ja) && (blank || fillerZh || isAsrDebrisTranslationZh(zh)))) {
            const isLexicalFillZh = (hit) => {
                const t = String(hit || '').trim();
                if (!t || t === '…') return false;
                const core = t
                    .replace(/[哈啊嗯哦诶呜呵唉哎喔呼嘻]+/gu, '')
                    .replace(/[…·.•\-—_~～\s！!？?。．.、，,]+/gu, '');
                return Array.from(core).length >= 1;
            };
            const tryFill = (raw) => {
                const hit = deterministicEllipsisFill(raw, ctx.targetOpts || {});
                return isLexicalFillZh(hit) ? hit : null;
            };
            let debrisFill = tryFill(ja);
            if (!debrisFill) {
                const stripped = stripMoanBreathJa(bareJa(ja))
                    .replace(/^[…·.•\-—_~～\s、，,]+/u, '')
                    .trim();
                if (stripped && stripped !== bareJa(ja)) debrisFill = tryFill(stripped);
            }
            if (!debrisFill) {
                const softRaw = String(ja)
                    .replace(/^(?:[ぁあはぁはあひゃうっうわあっんんふふへへ]+[っッー〜～…·.\s、，,]*)+/u, '')
                    .trim();
                if (softRaw && softRaw !== ja) debrisFill = tryFill(softRaw);
            }
            if (debrisFill) {
                // Already have a real ZH gloss (是啊 / 好厉害) — keep. Only recover blank/breath ZH.
                const zhLexicalCore = String(zh || '')
                    .trim()
                    .replace(/[哈啊嗯哦诶呜呵唉哎喔呼嘻]+/gu, '')
                    .replace(/[…·.•\-—_~～\s！!？?。．.、，,]+/gu, '');
                if (!blank && Array.from(zhLexicalCore).length >= 1) {
                    return { action: 'keep', reason: 'lexical_zh' };
                }
                return {
                    action: 'recover',
                    reason: isPureMoanOrSfxJa(ja) ? 'det_fill_moan_override' : 'det_fill_debris_override',
                    fill: debrisFill,
                };
            }
            if (isDeterministicAsrDebrisJa(ja)) {
                return { action: 'delete', reason: isPureMoanOrSfxJa(ja) ? 'pure_moan' : 'asr_debris' };
            }
            return { action: 'delete', reason: 'pure_moan' };
        }

        // Lexical-anchor JA already has a real ZH gloss (是啊 / 要去了) — keep even if ZH
        // looks like an interjection filler. Prevents 「はぁ そう んんっ」→ delete over-blank.
        // Bare はい/うん with filler ZH still delete (isolated discourse).
        {
            const bJa = bareJa(ja);
            const strippedLex = stripMoanBreathJa(bJa);
            const moanWrappedAffirm = /^(?:そう|よし+)$/u.test(strippedLex)
                && bJa.length >= strippedLex.length + 2;
            if (
                !blank
                && !isBlankZh(zh)
                && !/啦啦|哈…哈|仰躺|阿春つ/.test(zh)
                && strippedLex.length >= 2
                && hasLexicalDialogueAnchorJa(bJa)
                && !isDeterministicAsrDebrisJa(ja)
                && (
                    moanWrappedAffirm
                    || !/^(?:そう|はい+|うん+|ええ+|ううん+|よし+)$/u.test(strippedLex)
                )
            ) {
                return { action: 'keep', reason: 'lexical_zh' };
            }
        }

        // Ultra-short ASR tail / particle crumbs — no recoverable dialogue surface.
        if (blank || fillerZh) {
            const crumb = bareJa(ja);
            const softBare = ja
                .replace(/[\s　]+/g, '')
                .replace(/[。．.!！?？…·.•\-—_~～、，,・♡♥❤♪☆★]+/g, '');
            if (
                crumb.length <= 2
                && /^(?:だ|です|ます|でした|ました|ちは|はん|ぶ+|かたん|す|し|て|に|の|を|が|は|も|と|か|よ|ね|な|わ|ぞ|ぜ|さ|って|から)$/u.test(crumb)
            ) {
                return { action: 'delete', reason: 'asr_crumb' };
            }
            // Lone conjugation / particle scraps even when softBare keeps っ (らって / なって)
            if (
                softBare.length > 0
                && softBare.length <= 4
                && !/[一-龥々]/.test(softBare)
                && /^(?:って|から|ので|けど|てる|らって|なって|だし|ですし)$/u.test(softBare)
                && !hasContextBridgeValue(ja, ctx.prevJa, ctx.nextJa)
            ) {
                return { action: 'delete', reason: 'asr_crumb' };
            }
            // Honorific / predicate scraps alone (します / さん / ですけど) — no recoverable surface.
            if (
                !hasContextBridgeValue(ja, ctx.prevJa, ctx.nextJa)
                && /^(?:します|しました|さん|ちゃん|くん|ですけど|ですけ|方です|はいって|うんから|からぁ)[ー〜～っッ…\.]*$/u.test(softBare)
            ) {
                return { action: 'delete', reason: 'asr_crumb' };
            }
            // Lone thud / scrap katakana (ガタ / はちはち) and ASR mash (ほんせぇ)
            if (
                !hasContextBridgeValue(ja, ctx.prevJa, ctx.nextJa)
                && /^(?:ガタ|はちはち|ほんせぇ|ほんせえ)[ー〜～っッ…\.]*$/u.test(softBare)
            ) {
                return { action: 'delete', reason: 'asr_scrap' };
            }
            // Short kana-only scraps (≤3 after punct strip) → det-fill, else soft-keep (≥2) for blank-retry.
            // ≥4 hiragana (おっきい / でだって) stays recoverable via isSubstantiveJa.
            if (
                !isSubstantiveJa(ja)
                && !hasContextBridgeValue(ja, ctx.prevJa, ctx.nextJa)
                && softBare.length > 0
                && softBare.length <= 3
                && !/[一-龥々]/.test(softBare)
                && /^[\u3040-\u30ffー]+$/.test(softBare)
                && !/^(?:ママ|パパ|そこ|ここ|なに|何|だめ|ダメ)$/u.test(softBare)
            ) {
                // Stock 嗯/好的 must not resurrect isolated bare うん/はい (no bridge).
                const fill = deterministicEllipsisFill(ja, ctx.targetOpts || {});
                if (
                    fill
                    && fill !== '…'
                    && !isBareUnHaiJa(ja)
                    && !isFillerOnlyDetFillZh(fill)
                ) {
                    return { action: 'recover', reason: 'det_fill_short', fill };
                }
                if (
                    softBare.length >= 2
                    && !isBareUnHaiJa(ja)
                    && !isBreathNOnlyJa(ja)
                    && !isPureMoanOrSfxJa(ja)
                    && !isDeterministicAsrDebrisJa(ja)
                ) {
                    return { action: 'recover', reason: 'soft_keep_blank' };
                }
                return { action: 'delete', reason: 'asr_scrap' };
            }
            // Blank ZH but JA is not substantive dialogue → try det-fill before delete
            if (!isSubstantiveJa(ja) && !hasContextBridgeValue(ja, ctx.prevJa, ctx.nextJa)) {
                const fill = deterministicEllipsisFill(ja, ctx.targetOpts || {});
                if (fill && fill !== '…' && !isFillerOnlyDetFillZh(fill)) {
                    return { action: 'recover', reason: 'det_fill_non_substantive', fill };
                }
                // Mash / moan stutter → delete (do not soft-keep perpetual「…」)
                if (isLikelyShortKanaMashJa(ja) || isKnownAsrMoraScrapJa(bareJa(ja))) {
                    return { action: 'delete', reason: 'asr_kana_mash' };
                }
                if (isLikelyMoanStutterScrapJa(ja)) {
                    return { action: 'delete', reason: 'moan_stutter_scrap' };
                }
                if (
                    !isPureDiscourseJa(ja)
                    && !loadFluency()?.isPureInterjectionJa?.(ja)
                    && !isPureMoanOrSfxJa(ja)
                    && !isDeterministicAsrDebrisJa(ja)
                ) {
                    const soft = softBare || ja.replace(/[\s　]+/g, '').replace(/[。．.!！?？…·.•\-—_~～、，,・]+/g, '');
                    if (soft.length >= 2) {
                        return { action: 'recover', reason: 'soft_keep_blank' };
                    }
                }
                return { action: 'delete', reason: 'non_substantive_blank' };
            }
        }

        // 2) Pure discourse → delete unless context bridge; recover if kept but blank
        if (isPureDiscourseJa(ja) && (blank || fillerZh || isBareUnHaiJa(ja))) {
            if (isTightDialogueAckBridge(ja, ctx)) {
                const fill = dialogueAckZhForJa(ja);
                return {
                    action: blank || fillerZh || (fill && zh !== fill) ? 'recover' : 'keep',
                    reason: 'dialogue_ack_timed',
                    fill,
                };
            }
            if (hasContextBridgeValue(ja, ctx.prevJa, ctx.nextJa, ctx)) {
                const fill = isBareUnHaiJa(ja) ? dialogueAckZhForJa(ja) : '';
                return blank || fillerZh
                    ? { action: 'recover', reason: 'discourse_bridge', fill: fill || undefined }
                    : { action: 'keep', reason: 'discourse_bridge', fill: fill || undefined };
            }
            if (isBareUnHaiJa(ja) && (blank || fillerZh)) {
                return { action: 'delete', reason: 'pure_discourse' };
            }
            if (blank || fillerZh) {
                const discFill = deterministicEllipsisFill(ja, ctx.targetOpts || {});
                if (discFill && discFill !== '…') {
                    return { action: 'recover', reason: 'det_fill_discourse', fill: discFill };
                }
                return { action: 'delete', reason: 'pure_discourse' };
            }
        }

        // Other pure interjection union (fluency) with blank ZH → delete
        const fluency = loadFluency();
        if (fluency?.isPureInterjectionJa?.(ja) && (blank || fillerZh)) {
            if (isTightDialogueAckBridge(ja, ctx)) {
                const fill = dialogueAckZhForJa(ja);
                return {
                    action: 'recover',
                    reason: 'dialogue_ack_timed',
                    fill,
                };
            }
            if (hasContextBridgeValue(ja, ctx.prevJa, ctx.nextJa, ctx)) {
                return blank
                    ? { action: 'recover', reason: 'interjection_bridge' }
                    : { action: 'keep', reason: 'interjection_bridge' };
            }
            const interFill = deterministicEllipsisFill(ja, ctx.targetOpts || {});
            if (interFill && interFill !== '…') {
                return { action: 'recover', reason: 'det_fill_interjection', fill: interFill };
            }
            return { action: 'delete', reason: 'pure_interjection' };
        }

        // 3) Lexical / substantive with … → must recover (never ship bare「…」when JA is scrap)
        if (blank) {
            if (!isSubstantiveJa(ja)) {
                if (isTightDialogueAckBridge(ja, ctx)) {
                    return {
                        action: 'recover',
                        reason: 'dialogue_ack_timed',
                        fill: dialogueAckZhForJa(ja),
                    };
                }
                if (hasContextBridgeValue(ja, ctx.prevJa, ctx.nextJa, ctx)) {
                    return {
                        action: 'recover',
                        reason: 'discourse_bridge',
                        fill: isBareUnHaiJa(ja) ? dialogueAckZhForJa(ja) : undefined,
                    };
                }
                if (!isPureDiscourseJa(ja) && !loadFluency()?.isPureInterjectionJa?.(ja)) {
                    const fill = deterministicEllipsisFill(ja, ctx.targetOpts || {});
                    if (fill && fill !== '…') {
                        return { action: 'recover', reason: 'det_fill_blank' };
                    }
                    // Prefer recover over hard-delete when JA has ≥2 kana (cleaning over-blank).
                    // Exception: short kana mash → delete (never ship perpetual「…」).
                    const softBare = ja
                        .replace(/[\s　]+/g, '')
                        .replace(/[。．.!！?？…·.•\-—_~～、，,・♡♥❤♪☆★]+/g, '');
                    if (isLikelyShortKanaMashJa(ja) || isKnownAsrMoraScrapJa(bareJa(ja))) {
                        return { action: 'delete', reason: 'asr_kana_mash' };
                    }
                    if (isLikelyMoanStutterScrapJa(ja)) {
                        return { action: 'delete', reason: 'moan_stutter_scrap' };
                    }
                    if (softBare.length >= 2 && !isPureMoanOrSfxJa(ja) && !isDeterministicAsrDebrisJa(ja)) {
                        return { action: 'recover', reason: 'soft_keep_blank' };
                    }
                }
                return { action: 'delete', reason: 'non_substantive_blank' };
            }
            if (isLikelyMoanStutterScrapJa(ja)) {
                return { action: 'delete', reason: 'moan_stutter_scrap' };
            }
            return { action: 'recover', reason: 'lexical_blank' };
        }
        return { action: 'keep', reason: 'ok' };
    }

    /**
     * Deterministic short fills when model returns … (no LLM).
     * @returns {string|null}
     */
    /** Det-fills must not re-mint decorative trailing「…」(观影 clear / LTX style). */
    function stripTrailingDetEllipsis(zh) {
        const t = String(zh || '').trim();
        if (!t) return t;
        if (/^(?:\.\.\.|……|…)+$/.test(t)) return t;
        const stripped = t.replace(/[…⋯]+$/u, '').replace(/\.{3,}$/u, '').trim();
        return stripped || t;
    }

    function deterministicEllipsisFill(jaText, targetOpts = {}) {
        const hit = deterministicEllipsisFillInner(jaText, targetOpts);
        return hit ? stripTrailingDetEllipsis(hit) : hit;
    }

    function deterministicEllipsisFillInner(jaText, targetOpts = {}) {
        const src = String(jaText || '').trim();
        if (!src) return null;
        try {
            const smart = (typeof require === 'function')
                ? require('./advanced-smart-translate-core')
                : null;
            const hit = smart?.fallbackShortJaCue?.(src, targetOpts);
            if (hit && hit !== '…') return hit;
        } catch { /* optional */ }
        const b = bareJa(src);
        const map = [
            [/^(?:せんせー+|せんせ[ぇええー]*|先生ー*|センセ[ーェえぇ]*)$/u, '老师'],
            [/^(?:ちょっと)$/u, '等等'],
            [/^(?:ちょっと待[ったて]+)$/u, '等一下'],
            [/^(?:やです|やだ)$/u, '不要'],
            [/^(?:おかしいです)(?:よ)?$/u, '好奇怪'],
            [/^(?:飲み込みました)$/u, '咽下去了'],
            [/^(?:ここから近いところです)$/u, '离这里很近'],
            [/^(?:秘密です)$/u, '是秘密'],
            [/^(?:ステキです|素敵です)(?:よ)?$/u, '真漂亮'],
            [/^(?:特別だよ)$/u, '很特别哦'],
            [/^(?:重たいです)$/u, '好重'],
            [/^(?:いい声です)$/u, '声音真好听'],
            [/^(?:素晴らしいです)$/u, '太棒了'],
            [/^(?:苦しいの)[？?]*$/u, '难受吗'],
            [/^(?:まだです)[？?]*$/u, '还没'],
            [/^(?:業務終了です)$/u, '下班了'],
            [/^(?:始めよ[ー〜～]*)$/u, '开始吧'],
            [/^(?:と[、,，]?\s*)?ありがと[ー〜～]*$/u, '谢谢'],
            [/^(?:手伝いしただけです)$/u, '只是帮忙而已'],
            [/^(?:そこです)$/u, '就是那里'],
            [/^(?:痛かったです)$/u, '好痛'],
            [/^(?:大変だよ)$/u, '糟了'],
            [/^(?:動きたいです)$/u, '想动起来'],
            [/^(?:犯罪だよ)$/u, '这是犯罪啊'],
            [/^(?:暴力です)$/u, '这是暴力'],
            [/^(?:努力です)$/u, '是努力'],
            // Truncated polite / food (JERA-055 class)
            [/りがとうございます/u, '谢谢'],
            [/^(?:よろし)?ようございます$/u, '您好'],
            [/^(?:美味しいです)$/u, '好吃'],
            [/^(?:美味しかったです)$/u, '很好吃'],
            [/^(?:熱いです)(?:よ)?$/u, '好烫'],
            [/^(?:熱くなっちゃう)$/u, '要热起来了'],
            [/^(?:本当です)$/u, '是真的'],
            [/^(?:苦いです)$/u, '好苦'],
            [/^(?:く[、,，]?\s*)?邪魔です$/u, '碍事'],
            [/^(?:素敵な感じです)$/u, '感觉真棒'],
            [/^(?:素敵なお尻です)$/u, '屁股真漂亮'],
            [/^(?:こんな[、,，]?\s*)?こんな感じです(?:よ)?$/u, '就是这种感觉'],
            [/^(?:ちょっとそうです)$/u, '差不多是这样'],
            [/^(?:お互いそうですよ)$/u, '彼此彼此'],
            [/^(?:情けですよ)$/u, '真可怜啊'],
            [/^(?:車)$/u, '车'],
            [/^(?:せっかく)$/u, '难得'],
            [/^(?:まっすぐ)$/u, '笔直'],
            [/^(?:ってか)$/u, '话说'],
            [/^(?:奥)[？?]*$/u, '里面'],
            [/^(?:気になっちゃいます)[？?]*$/u, '会在意吗'],
            [/^(?:全然素敵じゃないですよ)$/u, '一点也不棒啊'],
            [/^(?:藍)$/u, '蓝'],
            [/^(?:先輩ー*)$/u, '前辈'],
            [/^(?:なに|何)[？?！!]*$/u, '什么'],
            [/^(?:なんで|なぜ)[？?！!]*$/u, '为什么'],
            [/^(?:すご[いうー～ー]*)$/u, '好厉害'],
            [/^(?:アイス)$/u, '冰淇淋'],
            [/^(?:まま|ママ)$/u, '妈妈'],
            [/^(?:パパ)$/u, '爸爸'],
            [/^(?:はい+)[ー〜～っッ]*$/u, '好的'],
            [/^(?:うん+)[ー〜～っッ]*$/u, '嗯'],
            [/^(?:ええ+)[ー〜～っッ]*$/u, '嗯'],
            [/^(?:ねえ+|ねぇ+)[ー〜～っッ]*$/u, '喂'],
            [/^(?:ほら)[ー〜～っッ]*$/u, '你看'],
            [/^(?:ほらほら)[ー〜～っッ…\.]*$/u, '你看'],
            [/^(?:まあまあ)[ー〜～っッ…\.]*$/u, '还好啦'],
            [/^(?:それ)[ー〜～っッ…\.？?]*$/u, '那个'],
            [/^(?:これ)[ー〜～っッ…\.？?]*$/u, '这个'],
            [/^(?:あれ)[ー〜～っッ…\.？?]*$/u, '那个'],
            [/^(?:これは)[ー〜～っッ…\.？?]*$/u, '这是'],
            [/^(?:それは)[ー〜～っッ…\.？?]*$/u, '那个啊'],
            [/^(?:好き)[ぃいィ]?[ー〜～っッ…\.？?]*$/u, '喜欢'],
            [/^(?:恥ずかしい|はずかしい)(?:です)?[か]?[ー〜～っッ…\.？?]*$/u, '好害羞'],
            [/^(?:ちょっと[、,，]?\s*)?(?:恥ずかしい|はずかしい)(?:です)?(?:よ|ね)?[ー〜～っッ…\.？?]*$/u, '有点害羞'],
            [/^(?:素敵)(?:です)?(?:よ|ね|わ)?[ー〜～っッ…\.！!]*$/u, '真漂亮'],
            [/^(?:ゆっくり)[ー〜～っッ…\.]*$/u, '慢慢地'],
            [/^(?:ないです)(?:よ)?[ー〜～っッ…\.]*$/u, '没有'],
            [/^(?:すいません|すみません)[ー〜～っッ…\.]*$/u, '抱歉'],
            [/^(?:おしまい|終わり)(?:です)?[ー〜～っッ…\.]*$/u, '结束了'],
            [/^(?:おっきい|大きい)[ー〜～っッ…\.]*$/u, '好大'],
            [/^(?:あいつ)[ー〜～っッ…\.]*$/u, '那家伙'],
            [/^(?:動いて)[ー〜～っッ…\.]*$/u, '动起来'],
            [/^(?:なんとなく)[ー〜～っッ…\.]*$/u, '总觉得'],
            [/^(?:どういう)[ー〜～っッ…\.？?]*$/u, '怎么回事'],
            [/^(?:ふらふら)[ー〜～っッ…\.]*$/u, '晕乎乎的'],
            [/^(?:さぁ+|さあ+)(?:さぁ+|さあ+)?[ー〜～っッ…\.]*$/u, '来吧'],
            [/^(?:どうです)[か]?[？?]*$/u, '怎么样'],
            [/^(?:どうかした)(?:ん)?(?:です)?[か]?[？?]*$/u, '怎么了'],
            [/^(?:どうかしました)(?:か)?[？?]*$/u, '怎么了'],
            [/^(?:けど|でも)[、,，]?\s*(?:ああ+|あぁ+|あっ)[ー〜～っッ…\.]*$/u, '但是，啊'],
            [/^(?:じゃあ)?服(?:を)?ちょっとあげます(?:ね|よ)?[。．.!！]*$/u, '那我稍微掀一下衣服哦'],
            [/^(?:服)(?:を)?ちょっとあげます(?:ね|よ)?[。．.!！]*$/u, '稍微掀一下衣服哦'],
            [/^(?:あれは)$/u, '那是'],
            [/^(?:上手です)(?:よ)?[ー〜～っッ…\.]*$/u, '很棒'],
            [/^(?:最高です)(?:よ)?[ー〜～っッ…\.]*$/u, '太棒了'],
            [/^(?:お尻)[ー〜～っッ…\.]*$/u, '屁股'],
            [/^(?:スマホ)[ー〜～っッ…\.]*$/u, '手机'],
            [/^(?:くすぐったい)$/u, '好痒'],
            [/^(?:まだだよ)[ー〜～っッ…\.]*$/u, '还没呢'],
            [/^(?:いいだよ|いいよ)$/u, '可以哦'],
            [/^(?:暇だわ)[ー〜～っッ…\.]*$/u, '好闲啊'],
            [/^(?:しゅごい|しゅご)$/u, '好厉害'],
            [/^(?:おっちゃん)$/u, '大叔'],
            [/^(?:コラ|こら)$/u, '喂'],
            [/^(?:ってほら|ほらって)$/u, '你看'],
            [/^(?:ごちそうさま)$/u, '多谢款待'],
            [/^(?:マジ)(?:で)?[ー〜～っッ…\.]*$/u, '真的假的'],
            [/^(?:あそこ)(?:は|が|を|に)?[ー〜～っッ…\.]*$/u, '那里'],
            [/^(?:ひどい)[ー〜～っッ…\.]*$/u, '好过分'],
            [/^(?:ボケ|ぼけ)$/u, '笨蛋'],
            [/^(?:けなげだよ)$/u, '真懂事呢'],
            [/^(?:言わないでください)$/u, '请别说'],
            [/^(?:うそ)[っッ]?[ー〜～…\.]*$/u, '骗人'],
            [/^(?:アート)[？?]*$/u, '艺术'],
            [/^(?:こんばん)$/u, '晚上好'],
            [/^(?:なので)[ー〜～っッ…\.]*$/u, '所以'],
            [/^(?:初めてです)(?:よ)?[ー〜～っッ…\.]*$/u, '是第一次'],
            [/^(?:難しいです)(?:よ)?[ー〜～っッ…\.]*$/u, '很难'],
            [/^(?:おい)[ー〜～っッ]*$/u, '喂'],
            [/^(?:ひな|陽菜)$/u, '雏'],
            [/^(?:でも)$/u, '但是'],
            [/^(?:んんん*でも|ん+でも)$/u, '但是'],
            [/^(?:ヘンナックス)$/u, '亨纳克斯'],
            [/^(?:ブレインストーン[・･]?インターフェース)$/u, '脑机接口'],
            [/^(?:竹打ち)$/u, '竹打'],
            [/^(?:かわいそう)$/u, '好可怜'],
            [/^(?:あんた)$/u, '你'],
            [/^(?:アスム)$/u, '阿斯姆'],
            [/^(?:ミセリオ[・･]?ドゥーヴ)$/u, '米塞里奥·杜夫'],
            [/^(?:ごめんね*|ごめんなさい)$/u, '抱歉'],
            [/^(?:もちろん)$/u, '当然'],
            [/^(?:マジで)+$/u, '真的假的'],
            [/^(?:いけるよ?)$/u, '可以的'],
            [/^(?:それは)$/u, '那个啊'],
            [/^(?:なんか)$/u, '怎么说呢'],
            [/^(?:でしょ)[？?]*$/u, '对吧'],
            [/^(?:どうなの)[？?]*$/u, '怎么样'],
            [/^(?:大丈夫)(?:です|だよ?|？|\?)*$/u, '没事'],
            [/^(?:元気)(?:です|だよ?|？|\?)*$/u, '还好'],
            [/^(?:されたい)$/u, '想被那样'],
            [/^(?:おしり)$/u, '屁股'],
            [/^(?:ありがとう)(?:ございます)?$/u, '谢谢'],
            [/^(?:どうも[、,，]?\s*おはよう(?:ございます)?)$/u, '早上好'],
            [/^(?:どうも)$/u, '谢谢'],
            [/^(?:すみません)+$/u, '对不起'],
            [/^(?:おひゃいませ|いらっしゃいませ)[ー〜～]*$/u, '欢迎光临'],
            // Prefer 慢走 (matches SHORT_JA_FALLBACK); domain remap still fixes 欢迎光临 drift.
            [/^(?:いってらっしゃい)[ー〜～]*$/u, '慢走'],
            [/^(?:行って(?:きまーす|きます|きまー|きま))[。．!！ー〜～]*$/u, '我出门了'],
            [/^(?:お客様|お客さま|おきゃくさま)[？?]*$/u, '客人'],
            [/^(?:ここですよ|ここです|ここだよ|ここだ)$/u, '在这里哦'],
            [/^(?:クレジットカード)(?:して|で|を)?[ー〜～]*$/u, '用信用卡'],
            [/^(?:正解)$/u, '答对了'],
            [/^(?:そっか)[ぁあ]?$/u, '这样啊'],
            [/^(?:どうだった)[の]?[？?]*$/u, '怎么样'],
            [/^(?:なんだ)[よ]?[？?]*$/u, '什么啊'],
            [/^(?:誰|だれ)[？?]*$/u, '谁'],
            [/^(?:全然です)$/u, '完全没有'],
            [/^(?:もういいです)$/u, '够了'],
            [/^(?:はいよ)$/u, '好的'],
            [/^(?:そうだ)[よね]?$/u, '对了'],
            [/^(?:だよ|だね|だな)$/u, '是啊'],
            [/^(?:え[、,]?\s*)?もちろん(?:だよ|です)?$/u, '当然'],
            [/^(?:なん[スす]か)[？?]*$/u, '什么啊'],
            [/^(?:おいで)[ー〜～っッ…\.]*$/u, '过来'],
            [/^(?:足で)[？?…\.]*$/u, '用脚'],
            [/^(?:おやおや)[ー〜～っッ…\.]*$/u, '哎呀呀'],
            [/^(?:やって)[ー〜～っッ…\.]*$/u, '做吧'],
            [/^(?:こっちは)[ー〜～っッ…\.]*$/u, '这边'],
            [/^(?:あれさ)[ー〜～っッ…\.]*$/u, '那个啊'],
            [/^(?:あーんして)[ー〜～っッ…\.]*$/u, '张嘴'],
            [/^(?:やだ)[ー〜～っッ…\.]*$/u, '不要'],
            [/^(?:う+っ[、,]?\s+)やだ[ー〜～っッ…\.]*$/u, '呜，不要'],
            [/^(?:赤ちゃん)[っッ!！…\.]*$/u, '宝宝'],
            [/^(?:まこっ?ちゃん)(?:の)?[ー〜～っッ…\.]*$/u, '真子酱'],
            [/^(?:あ+[ぁあ]*[、,]?\s*)まこっ?ちゃん(?:の)?[ー〜～っッ…\.]*$/u, '啊，真子酱'],
            [/^(?:ん+っ?[、,]?\s*)まこっ?ちゃん(?:の)?[ー〜～っッ…\.]*$/u, '真子酱'],
            [/ぺるぺる.*(?:しちゃう|ちゃう)/u, '要舔个痛快了哦'],
            [/^ぺるぺる[ー〜～っッ…\.]*$/u, '舔舔'],
            // Relief / soft AV shorts (Hy-MT often blanks or leaves …)
            [/^(?:ああ[、,，]?\s*)?よかったです$/u, '太好了'],
            [/^(?:よかった)(?:です|ね|なぁ?|な)$/u, '太好了'],
            [/^(?:ああ[、,，]?\s*)よかった$/u, '啊，太好了'],
            [/^(?:わかりました)$/u, '我知道了'],
            [/^(?:かしこまりました)$/u, '好的'],
            [/^(?:失礼します)$/u, '失礼了'],
            [/^(?:おじゃまします)$/u, '打扰了'],
            [/^(?:いってきます|行ってきます)$/u, '我出门了'],
            [/^(?:顔です)$/u, '脸'],
            [/^(?:今日あれですよ)$/u, '今天是那个哦'],
        ];
        for (const [re, zh] of map) {
            if (!(re.test(b) || re.test(src))) continue;
            try {
                const fill = require('./mt-short-fill-core');
                const loc = fill.localizeZhShortFill(zh, targetOpts, src);
                if (loc) return loc;
                if (fill.isZhLang?.(fill.resolveTargetLang?.(targetOpts))) return zh;
                return null;
            } catch {
                return zh;
            }
        }
        // うさぁ ああっあんた → keep address
        if (/あんた/.test(src) && isBlankLikeOnlyMoanAside(src, 'あんた')) {
            try {
                const fill = require('./mt-short-fill-core');
                const loc = fill.localizeZhShortFill('你啊', targetOpts, src);
                if (loc) return loc;
                if (fill.isZhLang?.(fill.resolveTargetLang?.(targetOpts))) return '你啊';
                return null;
            } catch {
                return '你啊';
            }
        }
        // Strip trailing moan from loanword+moan (ヘンナックス ハァッ) —
        // ONLY when the remainder is still non-lexical. Never return head-only「哈…」
        // for「はぁ やめやめ / はぁぁ エッチ」(ABF-383 bare「哈」regression).
        const head = src.split(/[\s　]+/)[0];
        if (head && head !== src) {
            const rest = src.slice(head.length).trim();
            const restBare = bareJa(rest);
            const restLexical = restBare.length >= 2 && !isPureMoanOrSfxJa(rest);
            if (!restLexical) {
                const headFill = deterministicEllipsisFill(head, targetOpts);
                if (headFill) return headFill;
            }
        }
        // Mixed moan + lexical: prefer sanitize recover on full cue / stripped remainder.
        try {
            const sanitize = loadSanitize();
            if (sanitize?.remapJaPreferLexical) {
                const lex = sanitize.remapJaPreferLexical(src);
                if (lex && !isBlankZh(lex) && !/^(?:哈+|哈…)+$/.test(String(lex).trim())) {
                    return String(lex);
                }
            }
            if (sanitize?.recoverFillerZhFromLexicalJa) {
                const hit = sanitize.recoverFillerZhFromLexicalJa('…', src);
                if (hit?.changed && hit.text && !isBlankZh(hit.text)
                    && !/^(?:哈+|哈…)+$/.test(String(hit.text).trim())) {
                    return String(hit.text);
                }
            }
            if (sanitize?.recoverBlankedAdultZh) {
                const hit = sanitize.recoverBlankedAdultZh('…', src, {
                    skipFakeGreeting: true,
                    ...(targetOpts && typeof targetOpts === 'object' ? targetOpts : {}),
                });
                if (hit?.changed && hit.text && !isBlankZh(hit.text)
                    && !/^(?:哈+|哈…)+$/.test(String(hit.text).trim())) {
                    return String(hit.text);
                }
            }
        } catch (_) { /* optional */ }
        return null;
    }

    function isBlankLikeOnlyMoanAside(src, keepToken) {
        const rest = String(src || '').replace(keepToken, '').replace(/[\s　]+/g, '');
        return !rest || isPureMoanOrSfxJa(rest);
    }

    function buildNeighborCtx(jaList, i) {
        const prev = i > 0 ? jaList[i - 1] : null;
        const next = i + 1 < jaList.length ? jaList[i + 1] : null;
        const cur = jaList[i];
        return {
            prevJa: prev?.text || '',
            nextJa: next?.text || '',
            prevEndMs: cueMs(prev, 'endMs'),
            nextStartMs: cueMs(next, 'startMs'),
            cueStartMs: cueMs(cur, 'startMs'),
            cueEndMs: cueMs(cur, 'endMs'),
        };
    }

    /**
     * Plan actions for aligned cue lists (same length preferred).
     * @returns {{ deletes: number[], recovers: number[], plans: object[] }}
     */
    function planCueListActions(zhCues, jaCues) {
        const zhList = Array.isArray(zhCues) ? zhCues : [];
        const jaList = Array.isArray(jaCues) ? jaCues : [];
        const n = Math.min(zhList.length, jaList.length);
        const deletes = [];
        const recovers = [];
        const plans = [];
        for (let i = 0; i < n; i += 1) {
            const ctx = buildNeighborCtx(jaList, i);
            const plan = planEllipsisSlotAction(jaList[i]?.text, zhList[i]?.text, ctx);
            const idx = Number.isInteger(Number(zhList[i]?.index))
                ? Number(zhList[i].index)
                : i;
            plans.push({ i, index: idx, ...plan });
            if (plan.action === 'delete') deletes.push(i);
            else if (plan.action === 'recover') recovers.push(i);
        }
        // Also recover blank ZH when lengths match only on ZH side leftover — handled by caller time-align.
        return { deletes, recovers, plans };
    }

    /**
     * Clean mid-dialogue うん/はい (≤2s between substantive neighbors) → 嗯/是的.
     * Also glosses when both neighbors are substantive and timing is unknown.
     */
    function applyDialogueBridgeAckFills(zhCues, jaCues) {
        const zhList = Array.isArray(zhCues) ? zhCues.map((c) => ({ ...c })) : [];
        const jaList = Array.isArray(jaCues) ? jaCues : [];
        const n = Math.min(zhList.length, jaList.length);
        let filled = 0;
        for (let i = 0; i < n; i += 1) {
            const ja = String(jaList[i]?.text || '').trim();
            if (!isBareUnHaiJa(ja)) continue;
            const ctx = buildNeighborCtx(jaList, i);
            const timed = isTightDialogueAckBridge(ja, ctx);
            const textBridge = hasContextBridgeValue(ja, ctx.prevJa, ctx.nextJa, ctx);
            if (!timed && !textBridge) continue;
            const fill = dialogueAckZhForJa(ja);
            if (!fill) continue;
            if (String(zhList[i]?.text || '').trim() === fill) continue;
            zhList[i] = { ...zhList[i], text: fill };
            filled += 1;
        }
        return { cues: zhList, filled, changed: filled > 0 };
    }

    /**
     * @returns {{
     *   deleteByReason: Record<string, number>,
     *   recover: number,
     *   keepBridge: number,
     *   deleted: number,
     *   summaryLine: string,
     * }}
     */
    function summarizePlanStats(plans = []) {
        const deleteByReason = {};
        let recover = 0;
        let keepBridge = 0;
        for (const p of plans || []) {
            if (p.action === 'delete') {
                const r = String(p.reason || 'other');
                deleteByReason[r] = (deleteByReason[r] || 0) + 1;
            } else if (p.action === 'recover') {
                recover += 1;
            } else if (/bridge/.test(String(p.reason || ''))) {
                keepBridge += 1;
            }
        }
        const moan = (deleteByReason.pure_moan || 0);
        const asr = (deleteByReason.asr_debris || 0);
        const disc = (deleteByReason.pure_discourse || 0)
            + (deleteByReason.pure_interjection || 0)
            + (deleteByReason.empty_ja || 0);
        const deleted = Object.values(deleteByReason).reduce((a, b) => a + b, 0);
        const parts = [];
        if (moan) parts.push(`喘息/拟声 ${moan}`);
        if (asr) parts.push(`ASR碎片 ${asr}`);
        if (disc) parts.push(`无衔接语气 ${disc}`);
        if (keepBridge) parts.push(`保留衔接 ${keepBridge}`);
        if (recover) parts.push(`待补实义 ${recover}`);
        return {
            deleteByReason,
            recover,
            keepBridge,
            deleted,
            summaryLine: parts.length ? parts.join(' · ') : '无需删改',
        };
    }

    /**
     * Whether blank-retry / quality-retry should skip this JA (will be deleted).
     */
    function shouldSkipRecoverForDelete(jaText, zhText, ctx = {}) {
        return planEllipsisSlotAction(jaText, zhText, ctx).action === 'delete';
    }

    /**
     * Whether dropPureInterjection should keep this discourse pair (context bridge).
     */
    function shouldKeepDiscourseForContext(jaText, prevJa, nextJa, ctx = {}) {
        if (!isPureDiscourseJa(jaText) && !loadFluency()?.isPureInterjectionJa?.(jaText)) {
            return false;
        }
        const bridgeCtx = {
            prevJa,
            nextJa,
            prevEndMs: ctx.prevEndMs,
            nextStartMs: ctx.nextStartMs,
            cueStartMs: ctx.cueStartMs,
            cueEndMs: ctx.cueEndMs,
        };
        if (isTightDialogueAckBridge(jaText, bridgeCtx)) return true;
        if (isPureMoanOrSfxJa(jaText) && !hasContextBridgeValue(jaText, prevJa, nextJa, bridgeCtx)) {
            return false;
        }
        return hasContextBridgeValue(jaText, prevJa, nextJa, bridgeCtx);
    }

    return {
        DIALOGUE_ACK_MAX_GAP_MS,
        isBlankZh,
        isPureMoanOrSfxJa,
        isDeterministicAsrDebrisJa,
        isAsrDebrisTranslationZh,
        isPureDiscourseJa,
        isPureFillerZh,
        isSubstantiveJa,
        isLikelyShortKanaMashJa,
        isLikelyMoanStutterScrapJa,
        isKnownAsrMoraScrapJa,
        isBareUnHaiJa,
        dialogueAckZhForJa,
        isTightDialogueAckBridge,
        neighborGapsWithinMs,
        hasContextBridgeValue,
        planEllipsisSlotAction,
        deterministicEllipsisFill,
        planCueListActions,
        applyDialogueBridgeAckFills,
        summarizePlanStats,
        shouldSkipRecoverForDelete,
        shouldKeepDiscourseForContext,
    };
}));
