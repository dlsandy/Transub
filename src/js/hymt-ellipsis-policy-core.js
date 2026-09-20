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
        return /(?:あきまっ|いきまっ|イキまっ|いきそっ|イキそっ|まきもち|はひもつ|あたんつ|あやふぅ|あやま|ちょこまね|ちゅきら|やれよし|うごち|あーめ|あきゅ[っツん]?|よぶして|むちぇ|テストせしろ)/.test(b);
    }

    /**
     * Real dialogue / climax anchors — never pure-moan / ASR-debris delete.
     * Keep イク/あげて/こと; do not use bare いき (collides with いきまっ scrap).
     */
    function hasLexicalDialogueAnchorJa(b) {
        if (!b || isKnownAsrMoraScrapJa(b)) return false;
        // やめ covers やめて / やめやめ / やめろ — after moan-strip leftover 「やめやめ」
        // is length 4 and must not fall through moan-dominated ASR-debris delete.
        return /(?:イク|イッ|イく|い[くク]|あげて|やめ|こと|さま|なんで|ひゃんで|なに|何|好き|気持ち|きもち|エッチ|ちょっと|ダメ|だめ|みたい|こっち|しちゃ|ぐしょ|リラックス|でしょ|なんか|それは|もちろん|いける|ごめん|マジ|どう|先生|せんせ|かなり|はい|ください|ます|です|した|して|すご|そう)/.test(b);
    }

    /** Strip moan/breath tokens without eating lexical prefixes (あ in あげて / ひゃ in ひゃんで). */
    function stripMoanBreathJa(b) {
        return String(b || '')
            .replace(/(?:あぁ+|ああ+|はぁ+|はあ+|ひゃぁ+|ひゃっ|うっ+|うわ+|あっ+|んっ+|んん+|ふふ+|へへ+|きゅっ?)+/gu, '')
            .replace(/[ー〜～っッ]/g, '');
    }

    /** Pure breath / moan / SFX (喘息·拟声) — always delete when ZH blank or filler. */
    function isPureMoanOrSfxJa(text) {
        const fluency = loadFluency();
        const t = String(text || '').trim();
        if (!t) return false;
        // Discourse particles are never moans (うん/はい bridge recover must stay available).
        if (fluency?.isPureDiscourseJa?.(t)) return false;
        // Vocative call-outs (おい / ねえ) — never treat as moan via お+/え+ scraps.
        {
            const call = bareJa(t);
            if (/^(?:おい|おーい|ねえ+|ねぇ+|ほら|ちょっと)[っッ]*$/u.test(call)) return false;
        }
        const b0 = bareJa(t);
        if (hasLexicalDialogueAnchorJa(b0)) return false;
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
        // Cough / startle / chew scraps (こほっ / あわっ / あぐあぐ / あやぁ)
        {
            const compact = t.replace(/[\s　、，,]+/g, '');
            if (/^(?:こほっ?|ゴホッ?){1,4}$/u.test(compact)) return true;
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
        // Multi-token moan scraps joined after space strip (んにゃぁんぁぁ)
        if (
            b.length <= 18
            && !/[一-龥々]/.test(b)
            && /(?:んにゃ|にゃぁ|にゅぅ|んぁ+|ちくぅ|ひぐ|あうわ)/.test(b)
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
        if (b.length <= 16) {
            const withoutMoan = stripMoanBreathJa(b);
            if (
                withoutMoan.length <= 2
                && /あぁ|ああ|はぁ|ひゃ|うっ|あっ|んっ/.test(b)
                && !/(?:なに|何|でも|先生|せんせ|ごめん|もちろん|いける|それは|なんか|でしょ|された|おしり|マジ)/.test(b)
                && !/(?:れ|よ|ね|か|の|は|を|が|も|し|る|た|て|な|ま|じ|ご|で)/.test(withoutMoan)
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
        if (fluency?.shouldPreserveSubstantiveDialogueCue?.(null, t)) return true;
        if (fluency?.isPureInterjectionJa?.(t)) return false;
        if (isPureMoanOrSfxJa(t)) return false;
        const b = bareJa(t);
        if (/[一-龥々]/.test(b)) return true;
        if (/[ァ-ヴー]{3,}/.test(b)) return true;
        return b.length >= 6;
    }

    /**
     * Discourse fillers worth keeping for continuity (user rule).
     * Examples: なに/ねえ/はい/うん between real lines; address forms.
     */
    function hasContextBridgeValue(jaText, prevJa, nextJa) {
        const t = String(jaText || '').trim();
        const b = bareJa(t);
        if (!b) return false;
        // Address / call-out / question — always bridge
        if (/(?:せんせ|先生|先輩|ちゃん|くん|さん|様)/.test(t)) return true;
        if (/^(?:なに|何|なんで|なぜ|どうして)/.test(b)) return true;
        if (/^(?:ねえ+|ねぇ+|おい|ほら|ちょっと)/.test(b)) return true;
        if (/^(?:でも|だって|じゃあ|それで|つまり)/.test(b)) return true;
        if (/^(?:すご[いうー～ー]*|やば+|最高)/.test(b)) return true;
        // Affirmation / soft answer only when neighbors are substantive dialogue
        const prevSub = isSubstantiveJa(prevJa);
        const nextSub = isSubstantiveJa(nextJa);
        if (/^(?:はい+|ええ+|うん+|ううん+|そう|よし+)/.test(b)) {
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

        // 1) Deterministic ASR debris / pure moan / SFX → delete (never ship … or garbage ZH)
        if (isDeterministicAsrDebrisJa(ja)) {
            return { action: 'delete', reason: isPureMoanOrSfxJa(ja) ? 'pure_moan' : 'asr_debris' };
        }
        if (isPureMoanOrSfxJa(ja) && (blank || fillerZh || isAsrDebrisTranslationZh(zh))) {
            return { action: 'delete', reason: 'pure_moan' };
        }

        // Ultra-short ASR tail / particle crumbs — no recoverable dialogue surface.
        if (blank || fillerZh) {
            const crumb = bareJa(ja);
            if (
                crumb.length <= 2
                && /^(?:だ|です|ます|でした|ました|ちは|はん|ぶ+|かたん)$/u.test(crumb)
            ) {
                return { action: 'delete', reason: 'asr_crumb' };
            }
        }

        // 2) Pure discourse → delete unless context bridge; recover if kept but blank
        if (isPureDiscourseJa(ja) && (blank || fillerZh)) {
            if (hasContextBridgeValue(ja, ctx.prevJa, ctx.nextJa)) {
                return blank
                    ? { action: 'recover', reason: 'discourse_bridge' }
                    : { action: 'keep', reason: 'discourse_bridge' };
            }
            return { action: 'delete', reason: 'pure_discourse' };
        }

        // Other pure interjection union (fluency) with blank ZH → delete
        const fluency = loadFluency();
        if (fluency?.isPureInterjectionJa?.(ja) && (blank || fillerZh)) {
            if (hasContextBridgeValue(ja, ctx.prevJa, ctx.nextJa)) {
                return blank
                    ? { action: 'recover', reason: 'interjection_bridge' }
                    : { action: 'keep', reason: 'interjection_bridge' };
            }
            return { action: 'delete', reason: 'pure_interjection' };
        }

        // 3) Lexical / substantive with … → must recover
        if (blank) {
            return { action: 'recover', reason: 'lexical_blank' };
        }
        return { action: 'keep', reason: 'ok' };
    }

    /**
     * Deterministic short fills when model returns … (no LLM).
     * @returns {string|null}
     */
    function deterministicEllipsisFill(jaText, targetOpts = {}) {
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
            [/^(?:せんせー+|せんせ+|先生ー*)$/u, '老师'],
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
            [/^(?:すみません)+$/u, '对不起'],
            [/^(?:おひゃいませ|いらっしゃいませ)[ー〜～]*$/u, '欢迎光临'],
            [/^(?:お客様|お客さま|おきゃくさま)[？?]*$/u, '客人'],
            [/^(?:クレジットカード)(?:して|で|を)?[ー〜～]*$/u, '用信用卡'],
            [/^(?:正解)$/u, '答对了'],
            [/^(?:そっか)[ぁあ]?$/u, '这样啊'],
            [/^(?:どうも)$/u, '谢谢'],
            [/^(?:どうだった)[の]?[？?]*$/u, '怎么样'],
            [/^(?:なんだ)[よ]?[？?]*$/u, '什么啊'],
            [/^(?:誰|だれ)[？?]*$/u, '谁'],
            [/^(?:全然です)$/u, '完全没有'],
            [/^(?:もういいです)$/u, '够了'],
            [/^(?:はいよ)$/u, '好的'],
            [/^(?:そうだ)[よね]?$/u, '对了'],
            [/^(?:だよ|だね|だな)$/u, '是啊'],
            [/^(?:え[、,]?\s*)?もちろん(?:だよ|です)?$/u, '当然'],
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
            const prevJa = i > 0 ? jaList[i - 1]?.text : '';
            const nextJa = i + 1 < n ? jaList[i + 1]?.text : '';
            const plan = planEllipsisSlotAction(jaList[i]?.text, zhList[i]?.text, { prevJa, nextJa });
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
    function shouldKeepDiscourseForContext(jaText, prevJa, nextJa) {
        if (!isPureDiscourseJa(jaText) && !loadFluency()?.isPureInterjectionJa?.(jaText)) {
            return false;
        }
        if (isPureMoanOrSfxJa(jaText) && !hasContextBridgeValue(jaText, prevJa, nextJa)) {
            return false;
        }
        return hasContextBridgeValue(jaText, prevJa, nextJa);
    }

    return {
        isBlankZh,
        isPureMoanOrSfxJa,
        isDeterministicAsrDebrisJa,
        isAsrDebrisTranslationZh,
        isPureDiscourseJa,
        isPureFillerZh,
        isSubstantiveJa,
        hasContextBridgeValue,
        planEllipsisSlotAction,
        deterministicEllipsisFill,
        planCueListActions,
        summarizePlanStats,
        shouldSkipRecoverForDelete,
        shouldKeepDiscourseForContext,
    };
}));
