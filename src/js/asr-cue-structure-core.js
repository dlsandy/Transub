/**
 * Deterministic ASR cue structure fixes (axis-preserving).
 * 1) Strip next-sentence prefix bleed stuck on the previous cue.
 * 2) Merge incomplete same-clause JA fragments across tiny gaps.
 * Does not change start/end except taking the union when merging.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAsrCueStructure = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function asrCueStructureFactory() {
    const PUNCT_RE = /[\s\u3000、。！？!?…・·.,，．｡『』「」"'“”‘’（）()【】[\]~～ー−\-♪♫♡♥❤]+/g;

    /**
     * Soft-AV / dialogue turn openings — never glue previous cue onto these.
     * Do NOT use bare `あっ?` (matches あと/あたし/あの…).
     * `何` must not match 何日/何の — shelf false turn-stops.
     */
    const JA_TURN_START_RE = /^(?:いや|いいえ|うん|ええ|はい|あぁ+|あっ(?:[、,…!！]|$)|あ[、,…!！]|はぁ+|へえ|ねえ|ほら|そうだ|でも|だって|じゃあ|えっ|なに|何(?:[？?！!…、，]|だ|です|よ|を|が|も|より|な|$)|誰|おい|じゃあね)/;

    /** Only when previous cue ends with ellipsis (hesitation wrap) — not mid-clause やったん. */
    const JA_ELLIPSIS_WRAP_TURN_RE = /^(?:まあ|まぁ|あのー?|えっと+|えーと+|えー+|その|これ|あれ|ホント|本当|やっ|大丈夫|よし|わぁ|わあ|くすっ|こちょ)/;

    /** New clause / greeting — do not glue previous incomplete fragment. */
    const JA_NEW_CLAUSE_START_RE = /^(?:こんにちは|こんばんは|おはよう|さようなら|ありがとう|ごめん|すみません|失礼|そんな|こんな|あんな|あの|この|その|これ|それ|あれ|だけど|そして|しかし|もっとも|ちなみに|ところで)/;

    /**
     * Soft discourse / determiner openers that often continue the same monologue
     * after particle hang or て/ので (今日は｜その… / 行っていて｜あとは…).
     * Contrastive そんな/こんな only continue after strong て/ので/から — not bare し.
     */
    const JA_SOFT_DISCOURSE_OPENER_RE = /^(?:あの|この|その|あと)/;
    const JA_SOFT_CONTRASTIVE_OPENER_RE = /^(?:そんな|こんな|あんな)/;

    /** Name honorifics — trailing ん must not count as particle hang (田さん). */
    const JA_NAME_HONORIFIC_END_RE = /(?:さん|くん|ちゃん|たん|さま|様)$/u;

    const DEFAULT_INCOMPLETE_MERGE_GAP_MS = 720;
    const STRONG_INCOMPLETE_MERGE_GAP_MS = 1000;

    const JA_MID_CLAUSE_END_RE = /(?:けど|けれど|のに|ので|から|し|ば|たら|なら|ながら|って|ては|ても|と|で|て|に|を|は|が|の|も|へ|や|か|っ|ン|ん)$/u;

    const JA_SENTENCE_FINAL_RE = /(?:です|ます|でした|ました|だよ|だね|だな|かな|かも|でしょう|でしょ|よね|わよ|ぞ|ぜ|ください|下さい)$/;

    /** Next cue continues the prior clause (だったので / らしく / 一年が…). */
    const JA_FORWARD_CONTINUATION_RE = /^(?:だった|です(?:ね|よ|か|が|けど|し)?|ます(?:が|し|ね|よ)?|まして|させて|止めて|めて|手?らしく|一年|会の|行ける|してい|してる|という|もらえ|いただけ|させていただ)/;

    function bareAsrText(text) {
        return String(text || '').replace(PUNCT_RE, '');
    }

    function isJaScriptHeavy(text) {
        const t = String(text || '').replace(/\s+/g, '');
        if (!t) return false;
        const ja = (t.match(/[\u3040-\u30ff々ー]/g) || []).length;
        return ja >= 2 && ja / Math.max(1, t.length) >= 0.45;
    }

    function endsWithJaEllipsis(text) {
        return /(?:\.\.\.|……|…|･･･|⋯)\s*$/u.test(String(text || '').trim());
    }

    /**
     * @param {string} text next cue
     * @param {string} [prevText] previous cue — gates ellipsis-wrap turn list
     */
    function looksNewJaTurnStart(text, prevText) {
        const t = String(text || '').trim().replace(/\s+/g, '');
        if (!t) return false;
        if (JA_TURN_START_RE.test(t)) return true;
        if (endsWithJaEllipsis(prevText) && JA_ELLIPSIS_WRAP_TURN_RE.test(t)) return true;
        if (JA_NEW_CLAUSE_START_RE.test(t)) return true;
        return false;
    }

    function looksSoftDiscourseOpener(text) {
        const t = String(text || '').trim().replace(/\s+/g, '');
        return !!t && (JA_SOFT_DISCOURSE_OPENER_RE.test(t) || JA_SOFT_CONTRASTIVE_OPENER_RE.test(t));
    }

    function looksSoftDeterminerOpener(text) {
        const t = String(text || '').trim().replace(/\s+/g, '');
        return !!t && JA_SOFT_DISCOURSE_OPENER_RE.test(t);
    }

    function looksSoftContrastiveOpener(text) {
        const t = String(text || '').trim().replace(/\s+/g, '');
        return !!t && JA_SOFT_CONTRASTIVE_OPENER_RE.test(t);
    }

    function looksJaForwardContinuation(text) {
        const t = String(text || '').trim().replace(/\s+/g, '');
        return !!t && JA_FORWARD_CONTINUATION_RE.test(t);
    }

    /**
     * Mid-word / mid-mora ASR cut:
     * - kanji stem + short hiragana/known suffix (女性｜手らしく / 知り合い｜会の方)
     * - mora resume (この距離でど｜どのくらい / よっぽどいっ｜いっぱい)
     * - long particle hang into について (売り上げ予測に｜について)
     */
    function looksLikelyMidWordSplit(aText, bText) {
        const a = bareAsrText(aText);
        const b = bareAsrText(bText);
        if (!a || !b || a.length < 2 || b.length < 2) return false;
        if (JA_FORWARD_CONTINUATION_RE.test(b)) return true;
        // Long clause + に｜について / と｜いうと (particle hang beyond ≤10 gate)
        if (
            a.length >= 6
            && (
                (/(?:に)$/u.test(a) && /^(?:ついて|対して|よって|とって)/u.test(b))
                || (/(?:と)$/u.test(a) && /^(?:いう|思って|して)/u.test(b))
            )
        ) {
            return true;
        }
        // Verb-stem cut: 舐め｜したことない / 見｜ミスして (kanji or kanji+1 hira stem)
        if (
            a.length >= 2
            && /(?:[\u4e00-\u9fff]|[\u4e00-\u9fff][\u3040-\u309f])$/u.test(a)
            && /^(?:した|して|しない|します|して[るた]|しろ|せよ|しな|しよ|ミス)/u.test(b)
        ) {
            return true;
        }
        // Keep short-next gate for kanji→kana crumbs only
        if (b.length <= 12) {
            if (/[\u4e00-\u9fff]$/u.test(a) && /^[\u3040-\u309fー]{2,8}$/u.test(b)) return true;
            if (/[\u4e00-\u9fff]$/u.test(a) && /^会の/u.test(b)) return true;
        }
        if (looksMoraPrefixContinuation(a, b)) return true;
        return false;
    }

    /**
     * Prev ends with a whitelisted mora stem that restarts next cue
     * (ど｜どの / いっ｜いっぱい / に｜ついて). Avoids よ｜よね、そんな｜なん echo glues.
     */
    function looksMoraPrefixContinuation(aBare, bBare) {
        const a = bareAsrText(aBare);
        const b = bareAsrText(bBare);
        if (a.length < 3 || b.length < 3) return false;
        if (JA_SENTENCE_FINAL_RE.test(a)) return false;
        // 2-mora: いっ｜いっぱい (not いいっ｜いっぱい feel-good cut)
        if (/いっ$/u.test(a) && !/いいっ?$/u.test(a) && /^いっぱい/u.test(b)) return true;
        // 1-mora determiner / postposition resumes (not ですけど｜どの…)
        if (
            /ど$/u.test(a)
            && !/(?:けど|など)$/u.test(a)
            && /^どの/u.test(b)
        ) {
            return true;
        }
        // こ｜この only after case particle (距離でこ…); bare なんこ scrap skipped
        if (
            /こ$/u.test(a)
            && /^(?:この|これ|こんな)/u.test(b)
            && /(?:で|は|が|を|に|と|の)こ$/u.test(a)
        ) {
            return true;
        }
        // そ｜その — short discourse tail or particle hang
        if (
            /そ$/u.test(a)
            && /^(?:その|それ|そんな)/u.test(b)
            && (a.length <= 6 || /(?:で|は|が|を|に|と|の)そ$/u.test(a))
        ) {
            return true;
        }
        if (/に$/u.test(a) && /^(?:について|に対して)/u.test(b)) return true;
        if (/と$/u.test(a) && /^(?:という|と思って|として)/u.test(b)) return true;
        return false;
    }

    /** Continuative / connective hang that should merge even across soft あの/あと openers. */
    function looksStrongContinuativeIncomplete(text) {
        const t = String(text || '').trim();
        if (!t || /[。！？!?]$/.test(t)) return false;
        const plain = t.replace(/\s+/g, '').replace(/(?:\.\.\.|……|…|･･･|⋯)+\s*$/u, '');
        if (!plain || plain.length < 4) return false;
        if (JA_SENTENCE_FINAL_RE.test(plain)
            && !/(?:ですし|ますし|だし|けど|けれど|のに|ので|から|て|で)$/.test(plain)) {
            return false;
        }
        return /(?:て|で|いて|いで|ので|から|けど|けれど|って|たり|ながら|ては|ても)$/u.test(plain);
    }

    function looksIncompleteJaClause(text) {
        const t = String(text || '').trim();
        if (!t || /[。！？!?]$/.test(t)) return false;
        const plain = t.replace(/\s+/g, '').replace(/(?:\.\.\.|……|…|･･･|⋯)+\s*$/u, '');
        if (!plain || plain.length < 2) return false;
        if (JA_SENTENCE_FINAL_RE.test(plain)
            && !/(?:ですし|ますし|だし|けど|けれど|のに|ので|から|て|で)$/.test(plain)) {
            return false;
        }
        // Strong incompleteness only (avoid gluing finished shorts like 気持ちいい).
        if (/(?:こんなに|そんなに|あんなに|この|その|あの|どの|好きな|みたいな)$/.test(plain)) {
            return true;
        }
        // Bare connective / word-tail orphan left as its own cue (から｜みが好き).
        if (/^(?:から|って|ので|けど|しい|こで|なさい)$/u.test(plain)) return true;
        if (/(?:けど|けれど|のに|ので|から|たら|なら|ながら|って|ては|ても|し)$/u.test(plain)
            && plain.length >= 3) {
            return true;
        }
        // Continuative て/で hang — any length (interview monologues).
        if (/(?:て|で|いて|いで)$/u.test(plain) && plain.length >= 3) return true;
        // Mid-word / short stem orphans (not reaction shorts like いいね / やだ).
        if (
            /^(?:はじ|初めて約|約|ただ|元々|もともと|知り合い|女性)$/u.test(plain)
            || (plain.length <= 3 && /[\u4e00-\u9fff]$/u.test(plain)
                && !/(?:なぁ|なあ|ねえ|ねー|だよ|だね|かな|かも|いいね)$/u.test(plain))
        ) {
            return true;
        }
        // Case/topic particle hang (今日は / これが) — require short openers.
        // Exclude name honorifics: 田さん / スさん end in ん but are complete vocatives.
        if (/(?:は|が|を|に|と|で|の|も|へ|や|か|っ|ン|ん)$/u.test(plain)
            && plain.length >= 2
            && plain.length <= 10
            && !JA_NAME_HONORIFIC_END_RE.test(plain)) {
            return true;
        }
        // Trailing だ / と cut before continuation (好きだ｜だったので / というと｜…).
        if (/(?:だ|と)$/u.test(plain) && plain.length >= 3 && plain.length <= 28) {
            return true;
        }
        // Bare temporal openers (最近 / 今日) cut alone before the rest of the turn.
        if (/^(?:最近|今日|昨日|明日|今朝|今夜|今|さっき|この前|このあいだ|元々|もともと|ただ)$/u.test(plain)) {
            return true;
        }
        return false;
    }

    /**
     * Longest bare suffix of prev that is a prefix of next (bleed onto earlier cue).
     * @returns {string} bare overlap (empty if none)
     */
    function findPrevSuffixBleedOverlap(prevText, nextText, options = {}) {
        const a = bareAsrText(prevText);
        const b = bareAsrText(nextText);
        if (!a || !b) return '';
        const minLen = Math.max(3, Math.min(12, Number(options.minOverlap) || 4));
        const maxLen = Math.min(a.length - 1, b.length, Math.max(minLen, Number(options.maxOverlap) || 24));
        if (maxLen < minLen) return '';
        for (let len = maxLen; len >= minLen; len -= 1) {
            const suf = a.slice(a.length - len);
            if (!b.startsWith(suf)) continue;
            // Entire next cue is a tail leftover of prev → leave for echo dedupe.
            if (len === b.length && a.length > b.length && a.endsWith(b)) continue;
            // Avoid stripping when the whole next cue is a short shared word only
            // and prev is barely longer (ambiguous).
            if (len === b.length && a.length - len <= 2) continue;
            return suf;
        }
        return '';
    }

    /**
     * Remove trailing display chars until `removeBareLen` bare characters are gone.
     */
    function stripTrailingBareLength(text, removeBareLen) {
        let t = String(text || '');
        let removed = 0;
        const need = Math.max(0, Number(removeBareLen) || 0);
        while (t && removed < need) {
            const m = t.match(/([\s\u3000、。！？!?…・·.,，．｡『』「」"'“”‘’（）()【】[\]~～ー−\-♪♫♡♥❤]+|.)$/u);
            if (!m) break;
            const piece = m[1];
            t = t.slice(0, -piece.length);
            const barePiece = bareAsrText(piece);
            if (barePiece) removed += barePiece.length;
        }
        return t.replace(/(?:\.\.\.|……|…|･･･|⋯)+\s*$/u, '').trim();
    }

    /**
     * When later-cue text starts with a suffix stuck on the earlier cue, strip that
     * suffix from the earlier cue. Timestamps untouched.
     */
    function stripPrevNeighborPrefixBleed(cues, options = {}) {
        const list = Array.isArray(cues) ? cues.map((c) => ({ ...c })) : [];
        const maxGapMs = Math.max(0, Math.min(8000, Number(options.maxGapMs) || 2500));
        let stripped = 0;
        for (let i = 0; i < list.length - 1; i += 1) {
            const cur = list[i];
            const next = list[i + 1];
            const aEnd = Number(cur?.endMs);
            const bStart = Number(next?.startMs);
            const gap = Number.isFinite(aEnd) && Number.isFinite(bStart) ? bStart - aEnd : 0;
            if (!Number.isFinite(gap) || gap < -80 || gap > maxGapMs) continue;
            const overlap = findPrevSuffixBleedOverlap(cur?.text, next?.text, options);
            if (!overlap) continue;
            const before = String(cur.text || '').trim();
            const after = stripTrailingBareLength(before, overlap.length);
            if (!after || after === before || bareAsrText(after).length < 1) continue;
            // Require real shortening of bare text
            if (bareAsrText(after).length >= bareAsrText(before).length) continue;
            cur.text = after;
            stripped += 1;
        }
        return {
            cues: list,
            stripped,
            stats: { before: cues?.length || 0, after: list.length, stripped },
        };
    }

    function resolveIncompleteMergeMaxGapMs(options = {}, strong = false) {
        if (Object.prototype.hasOwnProperty.call(options, 'maxGapMs')
            && Number.isFinite(Number(options.maxGapMs))) {
            return Math.max(0, Math.min(1200, Number(options.maxGapMs)));
        }
        const base = strong ? STRONG_INCOMPLETE_MERGE_GAP_MS : DEFAULT_INCOMPLETE_MERGE_GAP_MS;
        return Math.max(0, Math.min(1200, base));
    }

    function shouldMergeIncompleteJaNeighbors(aText, bText, gapMs, options = {}) {
        const at = String(aText || '').trim();
        const bt = String(bText || '').trim();
        if (!at || !bt) return false;
        if (/[。！？!?]$/.test(at)) return false;
        if (!isJaScriptHeavy(at) && !isJaScriptHeavy(bt)) return false;

        const strongCont = looksStrongContinuativeIncomplete(at);
        const forward = looksJaForwardContinuation(bt);
        const midWord = looksLikelyMidWordSplit(at, bt);
        const incomplete = looksIncompleteJaClause(at) || midWord;
        if (!incomplete && !forward) return false;

        const strongBridge = strongCont || midWord || forward;
        const maxGapMs = resolveIncompleteMergeMaxGapMs(options, strongBridge);
        const gap = Number(gapMs);
        if (!Number.isFinite(gap) || gap < -50 || gap > maxGapMs) return false;

        // Soft determiner openers after particle/continuative hang = same monologue.
        // Contrastive そんな/こんな only after strong て/ので/から (not trailing し lists).
        // Keep hard turn stops (うん/はい/じゃあ/いや…) blocked.
        const aBareForSoft = bareAsrText(at);
        const softContinue = !JA_NAME_HONORIFIC_END_RE.test(aBareForSoft) && (
            (looksSoftDeterminerOpener(bt) && (strongCont || incomplete))
            || (looksSoftContrastiveOpener(bt) && strongCont)
        );
        if (looksNewJaTurnStart(bt, at) && !softContinue) return false;

        // Forward continuation still needs a non-final previous cue.
        if ((forward || midWord) && !incomplete && /[。！？!?]$/.test(at)) return false;

        // Tiny particle-only prev + already-final next → leave as separate reaction.
        // Exception: orphan connective / word-tail cues (から｜みが好きです) must still glue.
        const bPlain = bt.replace(/\s+/g, '').replace(/(?:\.\.\.|……|…|･･･|⋯)+\s*$/u, '');
        const aBare = bareAsrText(at);
        if (
            JA_SENTENCE_FINAL_RE.test(bPlain)
            && aBare.length <= 2
            && !/^(?:から|って|ので|けど|しい|こで|なさい)$/u.test(aBare)
            && !forward
        ) {
            return false;
        }
        return true;
    }

    function joinCueTexts(aText, bText) {
        const left = String(aText || '').trim()
            .replace(/(?:\.\.\.|……|…|･･･|⋯)+\s*$/u, '');
        let right = String(bText || '').trim()
            .replace(/^(?:\.\.\.|……|…|･･･|⋯)+\s*/u, '');
        // Mid-word ASR: はじ｜止めて… → 始めて…
        if (/はじ$/u.test(left) && /^止めて/u.test(right)) {
            return `${left.slice(0, -2)}始めて${right.slice(3)}`;
        }
        // Mid-word ASR: 女性｜手らしく → 女性らしく
        if (/女性$/u.test(left) && /^手らしく/u.test(right)) {
            return `${left}${right.slice(1)}`;
        }
        // Mora resume dedupe: ど｜どのくらい → どのくらい (not どどの…)
        const leftBare = bareAsrText(left);
        const rightBare = bareAsrText(right);
        if (looksMoraPrefixContinuation(leftBare, rightBare)) {
            for (const n of [2, 1]) {
                if (leftBare.length <= n) continue;
                const suf = leftBare.slice(-n);
                if (!/^[\u3040-\u309fァ-ンー]+$/u.test(suf)) continue;
                if (!rightBare.startsWith(suf)) continue;
                // Strip matching trailing kana (and trailing punct) from display left
                let trimmed = left;
                let removed = 0;
                while (trimmed && removed < n) {
                    const m = trimmed.match(/([\s\u3000、。！？!?…・·.,，．｡『』「」"'“”‘’（）()【】[\]~～ー−\-♪♫♡♥❤]+|.)$/u);
                    if (!m) break;
                    const piece = m[1];
                    trimmed = trimmed.slice(0, -piece.length);
                    if (bareAsrText(piece)) removed += bareAsrText(piece).length;
                }
                return `${trimmed}${right}`;
            }
        }
        return `${left}${right}`;
    }

    /**
     * Merge incomplete same-clause JA neighbors across tiny gaps (union timeline).
     */
    function mergeIncompleteJaNeighborCues(cues, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const maxMergedDurMs = Math.max(2000, Math.min(20000, Number(options.maxMergedDurMs) || 10000));
        const maxMergedChars = Math.max(20, Math.min(160, Number(options.maxMergedChars) || 96));
        const out = [];
        let mergedPairs = 0;
        let i = 0;
        while (i < list.length) {
            const cur = {
                ...list[i],
                startMs: list[i]?.startMs,
                endMs: list[i]?.endMs,
                text: list[i]?.text,
            };
            let j = i + 1;
            while (j < list.length) {
                const next = list[j];
                const aEnd = Number(cur.endMs);
                const bStart = Number(next?.startMs);
                const gap = Number.isFinite(aEnd) && Number.isFinite(bStart)
                    ? bStart - aEnd
                    : 0;
                const at = String(cur.text || '').trim();
                const bt = String(next?.text || '').trim();
                if (!shouldMergeIncompleteJaNeighbors(at, bt, gap, options)) break;
                const nextEnd = Number(next?.endMs);
                const mergedEnd = Number.isFinite(nextEnd) ? nextEnd : cur.endMs;
                const mergedDur = Number.isFinite(Number(cur.startMs)) && Number.isFinite(Number(mergedEnd))
                    ? Number(mergedEnd) - Number(cur.startMs)
                    : 0;
                const mergedText = joinCueTexts(at, bt);
                if (mergedDur > maxMergedDurMs) break;
                if (bareAsrText(mergedText).length > maxMergedChars) break;
                cur.text = mergedText;
                cur.endMs = mergedEnd;
                mergedPairs += 1;
                j += 1;
            }
            out.push(cur);
            i = Math.max(j, i + 1);
        }
        return {
            cues: out,
            mergedPairs,
            stats: {
                before: list.length,
                after: out.length,
                mergedPairs,
            },
        };
    }

    function summarizePrevBleedStrip(stats) {
        if (!stats?.stripped) return '无需剥离前句窜入';
        return `剥离前句窜入后缀 ${stats.stripped} 处`;
    }

    function summarizeIncompleteMerge(stats) {
        if (!stats?.mergedPairs) return '无需合并碎句';
        return `合并未完成句 ${stats.mergedPairs} 处（${stats.before}→${stats.after} 条）`;
    }

    /**
     * Best character index to split an overlong multi-clause JA cue (start of right half).
     * Conservative: only when both sides stay substantial and a clear turn/clause break exists.
     * @returns {number} index into display text, or -1
     */
    function findJaMultiClauseSplitIndex(text, options = {}) {
        const t = String(text || '').trim();
        const minBare = Math.max(18, Math.min(80, Number(options.minBareChars) || 30));
        const bare = bareAsrText(t);
        if (bare.length < minBare || !isJaScriptHeavy(t)) return -1;

        const candidates = [];
        const pushMatch = (re) => {
            const m = t.match(re);
            if (!m || m.index == null) return;
            const rightStart = m.index + m[1].length;
            const left = t.slice(0, rightStart).trim();
            const right = t.slice(rightStart).trim();
            const lb = bareAsrText(left).length;
            const rb = bareAsrText(right).length;
            if (lb < 6 || rb < 6) return;
            if (lb + rb < minBare) return;
            candidates.push({ index: rightStart, score: Math.min(lb, rb) * 2 + (lb > 10 && rb > 10 ? 8 : 0) });
        };

        // Neighbor greet + thanks welded: 「あ、お隣の…です。」+「この前はありがとう…」
        pushMatch(/^(.+?(?:お隣|隣の).{0,36}?(?:です|ます|だ)[。．!！]?)\s*((?:この前は|先日は|いつも)?(?:あっ?[、,]?\s*)?ありがとう.+)$/u);
        // Clause closer then new soft turn (あ/あの/すみません/ありがとう…)
        pushMatch(/^(.+?(?:です|ます|でした|ました|だよ|だね|たね|わよ|ね|よ)[。．!！?？、,，]?\s*)((?:あっ?[、,]?\s*|あの[、,]?\s*|あ+[、,]\s*|この前は|先日は)?(?:ありがとう|すみません|失礼|こんにちは|こんばんは|おはよう|お隣|隣の).+)$/u);
        // Mid-string 「て、/で、/んで」 then substantial continuation with new opener feel
        pushMatch(/^(.{10,}?(?:んで|て|で)[、,，]\s*)((?:あっ?|あの|でも|それで|そして|あと|それから).{6,})$/u);
        // Interview / long monologue: ので / けど / んですけど then another clause (no 。 required)
        pushMatch(/^(.{10,}?(?:んですけど|んだけど|なので|なので、|ので|けど|けれど)[、,，]?\s*)((?!っ)[\u3040-\u30ff\u4e00-\u9fff「（(].{8,})$/u);
        // Mid 、 with both halves substantial (独白 enumeration)
        pushMatch(/^(.{14,}?[、,，]\s*)(.{14,})$/u);
        // Mid sentence punctuation — keep closer with left half
        pushMatch(/^(.{12,}?[。．!！])\s*(.{12,})$/u);

        if (!candidates.length) return -1;
        candidates.sort((a, b) => b.score - a.score);
        return candidates[0].index;
    }

    /**
     * Split overlong multi-clause JA cues so MT sees natural turns (axis split by bare ratio).
     */
    function splitOverlongJaMultiClauseCues(cues, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const out = [];
        let splitCount = 0;
        const minDurMs = Math.max(3000, Math.min(20000, Number(options.minDurMs) || 5500));
        for (const c of list) {
            const text = String(c?.text || '').trim();
            const startMs = Number(c?.startMs);
            const endMs = Number(c?.endMs);
            const dur = Number.isFinite(startMs) && Number.isFinite(endMs) ? endMs - startMs : 0;
            const splitOpts = { ...options };
            // Long wall-clock cues: allow slightly shorter bare halves to split.
            if (dur >= minDurMs && splitOpts.minBareChars == null) {
                splitOpts.minBareChars = 24;
            }
            const idx = findJaMultiClauseSplitIndex(text, splitOpts);
            if (idx < 0) {
                out.push({ ...c });
                continue;
            }
            const left = text.slice(0, idx).trim();
            const right = text.slice(idx).trim();
            if (!left || !right) {
                out.push({ ...c });
                continue;
            }
            const bareTotal = Math.max(1, bareAsrText(text).length);
            const ratio = bareAsrText(left).length / bareTotal;
            let mid = Number.isFinite(startMs) && Number.isFinite(endMs)
                ? Math.round(startMs + (endMs - startMs) * ratio)
                : startMs;
            if (Number.isFinite(startMs) && Number.isFinite(endMs)) {
                mid = Math.max(startMs + 1, Math.min(endMs - 1, mid));
            }
            out.push({
                ...c,
                text: left,
                endMs: Number.isFinite(mid) ? mid : c.endMs,
            });
            out.push({
                ...c,
                text: right,
                startMs: Number.isFinite(mid) ? mid : c.startMs,
                endMs: c.endMs,
            });
            splitCount += 1;
        }
        return {
            cues: out,
            splitCount,
            stats: {
                before: list.length,
                after: out.length,
                splitCount,
            },
        };
    }

    function summarizeOverlongSplit(stats) {
        if (!stats?.splitCount) return '无需拆分长句';
        return `拆分过长多义句 ${stats.splitCount} 处（${stats.before}→${stats.after} 条）`;
    }

    return {
        bareAsrText,
        looksIncompleteJaClause,
        looksStrongContinuativeIncomplete,
        looksJaForwardContinuation,
        looksLikelyMidWordSplit,
        looksMoraPrefixContinuation,
        looksSoftDiscourseOpener,
        looksNewJaTurnStart,
        findPrevSuffixBleedOverlap,
        stripTrailingBareLength,
        stripPrevNeighborPrefixBleed,
        shouldMergeIncompleteJaNeighbors,
        mergeIncompleteJaNeighborCues,
        findJaMultiClauseSplitIndex,
        splitOverlongJaMultiClauseCues,
        summarizePrevBleedStrip,
        summarizeIncompleteMerge,
        summarizeOverlongSplit,
    };
}));
