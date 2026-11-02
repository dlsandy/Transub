/**
 * Pro smart-translate plot polish: after Sakura/GalTransl sentence MT,
 * constrained LLM edits that keep watchability (recover undertranslation,
 * lock names/先輩, fix invented facts) without inventing plot.
 * Pure helpers (no network).
 */
(function (global, factory) {
    let fluency = null;
    let mtSanitize = null;
    let emotionStyle = null;
    let splitCore = null;
    try {
        fluency = (typeof module !== 'undefined' && module.exports)
            ? require('./subtitle-fluency-core')
            : (global && global.TransubSubtitleFluency);
    } catch (_) {
        fluency = null;
    }
    try {
        mtSanitize = (typeof module !== 'undefined' && module.exports)
            ? require('./mt-sanitize-core')
            : (global && global.TransubMtSanitize);
    } catch (_) {
        mtSanitize = null;
    }
    try {
        emotionStyle = (typeof module !== 'undefined' && module.exports)
            ? require('./sensevoice-emotion-mt-style-core')
            : (global && global.TransubSensevoiceEmotionMtStyle);
    } catch (_) {
        emotionStyle = null;
    }
    try {
        splitCore = (typeof module !== 'undefined' && module.exports)
            ? require('./subtitle-split-core')
            : (global && global.TransubSubtitleSplit);
    } catch (_) {
        splitCore = null;
    }
    const api = factory(fluency, mtSanitize, emotionStyle, splitCore);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSmartTranslatePolish = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function smartTranslatePolishCoreFactory(fluency, mtSanitize, emotionStyle, splitCore) {
    /** Soft-AV films often have 1k+ cues; 36 made polish feel "not engaged". */
    const POLISH_SAMPLE_LIMIT = 96;
    const POLISH_MIN_SAMPLE = 4;

    /**
     * Default ON. Only explicit false/off disables.
     * @param {*} value
     * @returns {boolean}
     */
    function normalizePlotPolishOption(value) {
        if (value === false || value === 0) return false;
        const s = String(value == null ? '' : value).trim().toLowerCase();
        if (s === 'false' || s === '0' || s === 'off' || s === 'no') return false;
        return true;
    }

    function textCharLen(text) {
        return Array.from(String(text || '').replace(/\s+/g, '')).length;
    }

    function isFillerOnlyZh(text) {
        if (typeof mtSanitize?.isFillerOnlyZh === 'function') {
            return !!mtSanitize.isFillerOnlyZh(text);
        }
        const t = String(text || '').trim();
        if (!t) return false;
        const bare = t.replace(/[。．.、，,\s…·•\-—_~～！!？?]+/g, '');
        if (!bare) return true;
        return /^(?:嗯+|啊+|哦+|噢+|喂+|哈+|呵+|唔+|呜+|欸+|诶+|呀+|哟+|哇+|嘻+|请|来|完了|不过|不对|哎呀|嗨|嘿)+$/.test(bare);
    }

    function jaHasLexicalResidue(srcText) {
        if (typeof mtSanitize?.jaCueHasLexicalResidue === 'function') {
            return !!mtSanitize.jaCueHasLexicalResidue(srcText);
        }
        const s = String(srcText || '').trim();
        if (!s) return false;
        if (/[一-龯]/.test(s)) return true;
        if (/(?:待っ|やめ|我慢|気持|お願い|先輩|大丈夫|本当|ほんと|だめ|ダメ|駄目)/.test(s)) {
            return true;
        }
        const stripped = s.replace(/[ぁぃぅぇぉっゃゅょゎんァィゥェォッャュョヮンー〜～はハはぁアァうぅウゥ!！?？…。．.\s♡♥❤]+/g, '');
        return stripped.length >= 3;
    }

    /**
     * Reusable MT hallucination shapes (not title-specific).
     * Hang-up / job title / stop→vehicle / 卵→卵子.
     */
    function looksLikeInventedFact(srcText, zhText) {
        const src = String(srcText || '').trim();
        const zh = String(zhText || '').trim();
        if (!src || !zh) return false;
        if (/挂了/.test(zh) && !/(?:切|電話|切れ|切っ|切る|かけ)/.test(src)) return true;
        if (/社长/.test(zh) && /部長/.test(src) && !/社長/.test(src)) return true;
        if (/部长/.test(zh) && /社長/.test(src) && !/部長/.test(src)) return true;
        if (/(?:船|电车|列车)/.test(zh) && /止ま/.test(src)
            && !/(?:船|舟|フェリー|電車|列車|バス)/.test(src)) {
            return true;
        }
        if (/卵子/.test(zh) && /(?:卵|たまご)/.test(src) && !/卵子/.test(src)) return true;
        return false;
    }

    /**
     * Plot-polish invent: long thriller/medical/corporate ZH on short spoken JA
     * with no matching JA lemmas (SAME-250-style contamination).
     */
    function looksLikePlotTopicInvent(srcText, zhText) {
        const src = String(srcText || '').trim();
        const zh = String(zhText || '').trim();
        if (!src || !zh) return false;
        const sl = textCharLen(src);
        const zl = textCharLen(zh);
        if (sl < 2 || zl < 10) return false;
        // Heavy plot lexicon never licensed by short dialogue JA.
        const inventZh = /制药|药企|实验体|生物武器|监测员|外部资金|融资|神经传递|猎奇杀人|决策费用|停止拍照|可以住宿|尚未获得批准/;
        const inventJaOk = /(?:薬|製薬|実験|脳|武器|兵器|殺人|資金|神経|モニター|融資|承認|宿泊|撮影|写真)/;
        if (inventZh.test(zh) && !inventJaOk.test(src) && (sl <= 36 || zl >= sl * 2)) {
            return true;
        }
        // Short spoken JA ballooned into long unrelated narration.
        if (
            sl <= 20
            && zl >= Math.max(18, Math.ceil(sl * 2.8))
            && !jaHasLexicalResidue(src)
        ) {
            return true;
        }
        if (
            sl <= 24
            && zl >= Math.max(22, Math.ceil(sl * 3))
            && /^(?:ここ|どこ|私は|すいません|すみません|先輩|おい|ほら|なに|何|うん|はい)/.test(
                src.replace(/[\s　]+/g, ''),
            )
            && !/(?:哪里|哪儿|这里|我是|我呢|我？|抱歉|对不起|前辈|喂|你看|什么|嗯|好的)/.test(zh)
        ) {
            return true;
        }
        return false;
    }

    function glossaryNameSet(glossaryTerms) {
        const allowed = new Set();
        for (const t of glossaryTerms || []) {
            const src = String(t.term || t.src || '').trim();
            const dst = String(t.translation || t.dst || '').trim();
            if (src) allowed.add(src);
            if (dst) allowed.add(dst);
            for (const a of t.aliases || []) {
                const v = String(a || '').trim();
                if (v) allowed.add(v);
            }
        }
        return allowed;
    }

    function briefNameSet(filmBrief) {
        const out = new Set();
        const chars = filmBrief?.characters || [];
        for (const c of chars) {
            const n = String(c?.name || '').trim();
            if (n) out.add(n);
        }
        for (const t of filmBrief?.terms || []) {
            const term = String(t?.term || '').trim();
            const meaning = String(t?.meaning || '').trim();
            if (term) out.add(term);
            if (meaning) out.add(meaning);
        }
        return out;
    }

    function normalizeQcTypes(raw) {
        if (Array.isArray(raw)) {
            return raw.map((t) => String(t || '').trim().toLowerCase()).filter(Boolean);
        }
        if (raw && typeof raw === 'object' && Array.isArray(raw.types)) {
            return normalizeQcTypes(raw.types);
        }
        const s = String(raw || '').trim().toLowerCase();
        return s ? [s] : [];
    }

    function resolveAsrConfidence(options = {}) {
        const direct = Number(options.asrConfidence ?? options.confidence);
        if (Number.isFinite(direct)) return Math.max(0, Math.min(1, direct));
        return null;
    }

    /**
     * Extra polish urgency from QC / ASR / sanitize / fluency product signals.
     */
    function productRiskBonus(srcText, zhText, options = {}) {
        let bonus = 0;
        const types = normalizeQcTypes(options.qcTypes || options.qc);
        if (types.includes('weird')) bonus += 4;
        if (types.includes('fluency')) bonus += 3;
        if (types.includes('connected') || types.includes('high_cps')) bonus += 1;

        if (options.asrLow === true || options.lowConfidence === true) bonus += 3;
        const conf = resolveAsrConfidence(options);
        if (conf != null) {
            if (conf < 0.45) bonus += 3;
            else if (conf < 0.6) bonus += 1.5;
        }

        if (options.blankRecovered || options.sanitizeBlankRecover || options.blankRecover) {
            bonus += 2;
        }
        if (options.sanitizeResidual || options.residualHot) bonus += 2;

        const band = String(options.band || options.riskBand || '').trim().toLowerCase();
        if (band === 'yellow') bonus += 3;
        if (band === 'red') bonus += 1;

        const zh = String(zhText || '').trim();
        if (zh) {
            if (fluency?.looksLikeWeirdCueText?.(zh)) bonus += 4;
            else if (fluency?.analyzeTextFluency) {
                const flu = fluency.analyzeTextFluency(zh, { checkWeird: true });
                const flags = flu?.flags || [];
                if (flags.includes('weird')) bonus += 4;
                else if (flags.some((f) => f === 'incomplete' || f === 'stutter' || f === 'repetition')) {
                    bonus += 2;
                }
            }
            // Truncated / ellipsis-heavy ZH while JA has substance
            const src = String(srcText || '').trim();
            if (src.length >= 6 && (/^[…\.]{1,}$/.test(zh) || zh === '…' || zh === '...')) {
                bonus += 3;
            }
        }
        return bonus;
    }

    function bareNeighborText(text) {
        if (typeof fluency?.bareAsrEchoText === 'function') {
            return fluency.bareAsrEchoText(text);
        }
        return String(text || '')
            .replace(/[\s\u3000、。！？!?…・·\.\,，．｡『』「」"'“”‘’（）()【】\[\]~～ー−\-♪♫]+/g, '');
    }

    function sharedPrefixLen(a, b) {
        const x = String(a || '');
        const y = String(b || '');
        const lim = Math.min(x.length, y.length);
        let i = 0;
        while (i < lim && x[i] === y[i]) i += 1;
        return i;
    }

    /**
     * Neighbor echo / 窜句 / paraphrase-bleed risk between adjacent cues.
     * Reuses ASR echo heuristics when available (JA tail leftover + ZH echo).
     * @returns {{ score: number, reasons: string[] }}
     */
    function scoreNeighborCueBleed(prevSrc, prevZh, curSrc, curZh) {
        const ps = String(prevSrc || '').trim();
        const pz = String(prevZh || '').trim();
        const cs = String(curSrc || '').trim();
        const cz = String(curZh || '').trim();
        if (!ps || !cs || !pz || !cz) return { score: 0, reasons: [] };

        const reasons = [];
        let score = 0;
        const jaEcho = typeof fluency?.isAsrEchoPair === 'function'
            ? fluency.isAsrEchoPair(ps, cs)
            : false;
        const zhEcho = typeof fluency?.isAsrEchoPair === 'function'
            ? fluency.isAsrEchoPair(pz, cz)
            : false;
        if (jaEcho) {
            score += 8;
            reasons.push('ja_echo');
        }
        if (zhEcho) {
            score += 7;
            reasons.push('zh_echo');
        }

        // Shared ZH prefix while JA diverges (GalTransl-style neighbor paraphrase bleed).
        const zhPref = sharedPrefixLen(pz, cz);
        if (zhPref >= 8 && pz.length >= 8 && cz.length >= 8) {
            const jaPrevBare = bareNeighborText(ps);
            const jaCurBare = bareNeighborText(cs);
            const jaPref = sharedPrefixLen(jaPrevBare, jaCurBare);
            if (jaPrevBare && jaCurBare && jaPrevBare !== jaCurBare && jaPref < 8) {
                score += 6;
                reasons.push('zh_prefix_bleed');
            }
        }

        // Current ZH contains previous ZH while JA is only a short tail / divergent line.
        const pzBare = bareNeighborText(pz);
        const czBare = bareNeighborText(cz);
        if (
            pzBare.length >= 6
            && czBare.length > pzBare.length + 1
            && czBare.includes(pzBare)
            && !bareNeighborText(cs).includes(bareNeighborText(ps).slice(-Math.min(6, bareNeighborText(ps).length)))
        ) {
            // prev glued into next ZH without JA support for that chunk
            const csBare = bareNeighborText(cs);
            const psBare = bareNeighborText(ps);
            if (csBare !== psBare && !(psBare && csBare && psBare.endsWith(csBare))) {
                score += 5;
                reasons.push('zh_prev_in_next');
            }
        }

        // Exact / near-exact ZH duplicate on non-identical JA (same sentence in two cues).
        if (
            pzBare.length >= 4
            && czBare.length >= 4
            && (pzBare === czBare || (pzBare.length >= 6 && (pzBare.includes(czBare) || czBare.includes(pzBare))))
        ) {
            const psBare = bareNeighborText(ps);
            const csBare = bareNeighborText(cs);
            if (psBare && csBare && psBare !== csBare) {
                score += 5;
                reasons.push('zh_dup_divergent_ja');
            }
        }

        return { score, reasons: [...new Set(reasons)] };
    }

    /**
     * Detect one cue packing two speakers / two turns (ASR island merge).
     * Conservative: long enough + clear turn boundary signals.
     * @returns {{ score: number, reasons: string[] }}
     */
    function scoreMultiSpeakerMix(srcText, zhText) {
        const src = String(srcText || '').trim();
        const zh = String(zhText || '').trim();
        if (!src || textCharLen(src) < 12) return { score: 0, reasons: [] };

        const reasons = [];
        let score = 0;
        const ja = src.replace(/\s+/g, '');
        const cn = zh.replace(/\s+/g, '');

        // Quoted dialogue then more spoken text outside the quote.
        if (/「[^」]{2,}」/.test(src) && /」[^「」]{2,}/.test(src)) {
            score += 7;
            reasons.push('ja_quote_tail');
        }
        if (/“[^”]{2,}”/.test(zh) && /”[^\u201c\u201d“”]{2,}/.test(zh)) {
            score += 5;
            reasons.push('zh_quote_tail');
        }

        // Two strong clause ends mid-cue (。！？) then another substantive clause.
        // Prefer the earliest mid-cue break that leaves both halves long enough
        // (using the final 。 often leaves an empty tail when the cue ends with 。).
        const jaEnds = [...ja.matchAll(/[。！？!?]/g)];
        let jaBreak = null;
        for (const m of jaEnds) {
            const at = m.index;
            const head = ja.slice(0, at + 1);
            const tail = ja.slice(at + 1);
            if (textCharLen(head) >= 5 && textCharLen(tail) >= 5) {
                jaBreak = { head, tail };
                break;
            }
        }
        if (jaBreak) {
            score += 5;
            reasons.push('ja_mid_sentence_break');
            const { head, tail } = jaBreak;
            // Vocative / address switch across the break.
            const headAddr = /(?:さん|くん|ちゃん|さま|様|先輩|お前|あなた|君|先生)/.test(head);
            const tailAddr = /(?:さん|くん|ちゃん|さま|様|先輩|お前|あなた|君|先生|ねえ|あの)/.test(tail);
            if (headAddr && tailAddr) {
                score += 3;
                reasons.push('ja_address_switch');
            }
            // Question then assertion (or reverse) across speakers.
            if (/[？?]$/.test(head) && /[。！!]/.test(tail)) {
                score += 2;
                reasons.push('ja_q_then_statement');
            }
        }

        // ZH: two sentence ends with both halves substantive.
        const zhEnds = [...cn.matchAll(/[。！？!?]/g)];
        if (textCharLen(zh) >= 14) {
            for (const m of zhEnds) {
                const head = cn.slice(0, m.index + 1);
                const tail = cn.slice(m.index + 1);
                if (textCharLen(head) >= 5 && textCharLen(tail) >= 5) {
                    score += 4;
                    reasons.push('zh_mid_sentence_break');
                    break;
                }
            }
        }

        // Em-dash / long ellipsis bridging two turns.
        if (/(?:——|──|\.{3}|…{2,}).{4,}/.test(ja) && textCharLen(ja) >= 16) {
            score += 3;
            reasons.push('ja_dash_bridge');
        }

        // Two quote blocks in one cue (A「…」B「…」 / repeated 「」).
        const jaQuotes = [...src.matchAll(/「[^」]{2,}」/g)];
        if (jaQuotes.length >= 2) {
            score += 6;
            reasons.push('ja_multi_quote');
        }

        // Comma / 、 / て／で mid-cue turn without 。！？ (spoken glue).
        if (!jaBreak && textCharLen(ja) >= 16) {
            const softBreaks = [...ja.matchAll(/[、，]|てね[。…]?|けど[。…]?|から[。…]?/g)];
            for (const m of softBreaks) {
                const at = m.index + m[0].length - 1;
                const head = ja.slice(0, at + 1);
                const tail = ja.slice(at + 1);
                if (textCharLen(head) < 6 || textCharLen(tail) < 6) continue;
                const headAddr = /(?:さん|くん|ちゃん|さま|様|先輩|お前|あなた|君|先生)/.test(head);
                const tailTurn = /^(?:ねえ|あの|ちょっと|ほら|はい|うん|ええ|あっ|えっ)/.test(tail)
                    || /(?:さん|くん|ちゃん|さま|様|先輩|お前|あなた|君|先生)/.test(tail);
                if (headAddr && tailTurn) {
                    score += 5;
                    reasons.push('ja_soft_turn_break');
                    break;
                }
                // Clause particle then new vocative / interjection.
                if (/[、，]$/.test(head) && /^(?:ねえ|あのね|ちょっと|ほら)/.test(tail)) {
                    score += 5;
                    reasons.push('ja_soft_turn_break');
                    break;
                }
            }
        }

        // Sentence-final よ／ね／わ／ぞ then more speech (speaker handoff without 。).
        if (!reasons.includes('ja_mid_sentence_break') && textCharLen(ja) >= 14) {
            const m = ja.match(/^(.{5,}?[よねわぞさ])([^よねわぞさ]{5,})$/u);
            if (m) {
                const head = m[1];
                const tail = m[2];
                if (/[ぁ-んァ-ヶ一-龥]/.test(tail[0] || '')) {
                    score += 4;
                    reasons.push('ja_particle_handoff');
                    if (/(?:さん|くん|ちゃん|さま|様|先輩|お前|あなた|君)/.test(head)
                        && /(?:さん|くん|ちゃん|さま|様|先輩|お前|あなた|君|ねえ|あの)/.test(tail)) {
                        score += 2;
                        reasons.push('ja_address_switch');
                    }
                }
            }
        }

        return { score, reasons: [...new Set(reasons)] };
    }

    /**
     * Score how much a cue needs plot-fitting polish (higher = more urgent).
     */
    function scoreCueForPlotPolish(srcText, zhText, options = {}) {
        const src = String(srcText || '').trim();
        const zh = String(zhText || '').trim();
        if (!src || !zh) return 0;
        let score = 0;
        const names = glossaryNameSet(options.glossaryTerms);
        for (const n of briefNameSet(options.filmBrief)) names.add(n);

        // JA honorific present but ZH lost person cue / used generic 小姐 incorrectly
        if (/(?:さん|くん|ちゃん|さま|様)/u.test(src)) {
            score += 2;
            if (/小姐|先生(?!们)/.test(zh) && names.size) {
                let hit = false;
                for (const n of names) {
                    if (n.length >= 2 && zh.includes(n)) { hit = true; break; }
                }
                if (!hit) score += 4;
            }
        }

        // Glossary dst missing from ZH while JA has src stem
        for (const t of options.glossaryTerms || []) {
            const ja = String(t.term || t.src || '').trim();
            const dst = String(t.translation || t.dst || '').trim();
            if (!ja || !dst || ja === dst) continue;
            const stem = ja.replace(/(?:さん|くん|ちゃん|さま|様|君)$/u, '');
            if (stem.length >= 2 && src.includes(stem) && !zh.includes(dst) && !zh.includes(stem)) {
                score += 5;
            }
        }

        // Stiff / report-like ZH on short spoken JA
        if (src.length <= 24 && /(进行了|发生了|表示|说道|感到了)/.test(zh)) score += 3;
        if (/^[\u4e00-\u9fff]{8,}$/u.test(zh) && /[、，]/.test(zh) === false && src.length <= 16) {
            score += 1;
        }

        // Length skew vs JA (possible machine merge / over-literal)
        const sl = textCharLen(src);
        const zl = textCharLen(zh);
        if (sl >= 4 && zl > Math.max(24, Math.ceil(sl * 3.2))) score += 2;
        if (sl >= 8 && zl > 0 && zl < Math.max(2, Math.floor(sl / 4))) score += 2;

        // Draft collapsed real JA into filler-only ZH
        if (isFillerOnlyZh(zh) && jaHasLexicalResidue(src)) score += 7;

        // 先輩 present but ZH lost the address
        if (/先輩/.test(src) && !/学长|学姐|前辈/.test(zh)) score += 3;

        if (looksLikeInventedFact(src, zh)) score += 6;

        score += productRiskBonus(src, zh, options);

        // Neighbor echo / 窜句 / paraphrase bleed (hybrid polish priority).
        const neighborBonus = Number(options.neighborBleedScore);
        if (Number.isFinite(neighborBonus) && neighborBonus > 0) {
            score += neighborBonus;
        }

        // Multi-speaker / two-turn packed into one cue.
        const mixBonus = Number(options.multiSpeakerScore);
        if (Number.isFinite(mixBonus) && mixBonus > 0) {
            score += mixBonus;
        } else {
            const mix = scoreMultiSpeakerMix(src, zh);
            if (mix.score >= 5) score += mix.score;
        }

        // hint+polish: prefer windows with non-neutral SenseVoice emotion
        if (options.preferEmotionPolish) {
            const emo = String(options.emotion || '').trim().toUpperCase();
            if (emo && emo !== 'NEUTRAL' && emo !== 'EMO_UNKNOWN') score += 2.5;
        }

        // Soft prior: mid-file dialogue gets a little weight so sample is not only head
        if (Number(options.cueIndex) >= 0) score += 0.01;

        return score;
    }

    function lookupByIndex(map, idx) {
        if (!map) return undefined;
        if (typeof map.get === 'function') {
            if (map.has(idx)) return map.get(idx);
            if (map.has(String(idx))) return map.get(String(idx));
            return undefined;
        }
        if (Object.prototype.hasOwnProperty.call(map, idx)) return map[idx];
        if (Object.prototype.hasOwnProperty.call(map, String(idx))) return map[String(idx)];
        return undefined;
    }

    /**
     * Raise polish sample budget when many neighbor echo/窜句 pairs are present
     * (hybrid path needs polish LLM to clean residual ASR bleed that survived MT).
     */
    function suggestPolishSampleLimit(sourceCues, translatedCues, options = {}) {
        const baseRaw = Number(options.limit);
        const base = Number.isFinite(baseRaw)
            ? Math.max(POLISH_MIN_SAMPLE, Math.min(POLISH_SAMPLE_LIMIT, Math.round(baseRaw)))
            : POLISH_SAMPLE_LIMIT;
        const srcList = Array.isArray(sourceCues) ? sourceCues : [];
        const byZh = new Map(
            (translatedCues || []).map((c) => [Number(c.index), String(c.text ?? '')]),
        );
        let bleedPairs = 0;
        let mixHits = 0;
        for (let i = 0; i < srcList.length; i += 1) {
            const cur = srcList[i];
            const curIdx = Number(cur?.index);
            if (!Number.isInteger(curIdx)) continue;
            const curSrc = String(cur.text || cur.sourceText || '').trim();
            const curZh = String(byZh.get(curIdx) ?? '').trim();
            if (scoreMultiSpeakerMix(curSrc, curZh).score >= 5) mixHits += 1;
            if (i < 1) continue;
            const prev = srcList[i - 1];
            const prevIdx = Number(prev?.index);
            if (!Number.isInteger(prevIdx)) continue;
            const bleed = scoreNeighborCueBleed(
                String(prev.text || prev.sourceText || '').trim(),
                String(byZh.get(prevIdx) ?? '').trim(),
                curSrc,
                curZh,
            );
            if (bleed.score >= 5) bleedPairs += 1;
        }
        if (bleedPairs < 4 && mixHits < 3) return base;
        // Reserve room: ~2 cues per bleed edge / mix hit, capped.
        const boosted = Math.min(
            POLISH_SAMPLE_LIMIT,
            Math.max(base, 56, Math.min(96, 40 + bleedPairs * 2 + mixHits * 2)),
        );
        return boosted;
    }

    /**
     * Pick high-risk source+zh pairs for polish (paired rows).
     * Neighbor echo / 窜句 pairs are force-preferred so hybrid polish can fix them.
     * @returns {Array<{ index: number, sourceText: string, text: string, score: number, neighborReasons?: string[], prevSource?: string, prevText?: string, nextSource?: string, nextText?: string }>}
     */
    function selectCuesForPlotPolish(sourceCues, translatedCues, options = {}) {
        const limit = Math.max(
            POLISH_MIN_SAMPLE,
            Math.min(
                POLISH_SAMPLE_LIMIT,
                Number(options.limit)
                    || suggestPolishSampleLimit(sourceCues, translatedCues, options)
                    || POLISH_SAMPLE_LIMIT,
            ),
        );
        const srcList = Array.isArray(sourceCues) ? sourceCues : [];
        const byZh = new Map(
            (translatedCues || []).map((c) => [Number(c.index), String(c.text ?? '')]),
        );
        // Precompute neighbor bleed bonuses in list order.
        const neighborByListPos = new Map();
        for (let i = 1; i < srcList.length; i += 1) {
            const prev = srcList[i - 1];
            const cur = srcList[i];
            const prevIdx = Number(prev?.index);
            const curIdx = Number(cur?.index);
            if (!Number.isInteger(prevIdx) || !Number.isInteger(curIdx)) continue;
            const prevSrc = String(prev.text || prev.sourceText || '').trim();
            const curSrc = String(cur.text || cur.sourceText || '').trim();
            const prevZh = String(byZh.get(prevIdx) ?? '').trim();
            const curZh = String(byZh.get(curIdx) ?? '').trim();
            const bleed = scoreNeighborCueBleed(prevSrc, prevZh, curSrc, curZh);
            if (bleed.score < 5) continue;
            for (const [pos, half] of [[i - 1, bleed.score], [i, bleed.score]]) {
                const prevHit = neighborByListPos.get(pos) || { score: 0, reasons: [] };
                prevHit.score = Math.max(prevHit.score, half);
                prevHit.reasons = [...new Set([...(prevHit.reasons || []), ...bleed.reasons])];
                neighborByListPos.set(pos, prevHit);
            }
        }

        const scored = [];
        for (let i = 0; i < srcList.length; i += 1) {
            const c = srcList[i];
            const idx = Number(c?.index);
            if (!Number.isInteger(idx)) continue;
            const src = String(c.text || c.sourceText || '').trim();
            const zh = String(byZh.get(idx) ?? '').trim();
            if (!src || !zh) continue;
            const bandFromMap = lookupByIndex(options.bandByIndex, idx);
            const band = String(bandFromMap || c.band || c.riskBand || '').trim().toLowerCase();
            // Red holds that never got MT this round: skip empty placeholders here.
            // After QC-loop / blank-MT fills them, callers re-run polish with
            // preferFilledHoldIndexes so those slots get a second polish pass.
            const preferFilled = options.preferFilledHoldIndexes instanceof Set
                ? options.preferFilledHoldIndexes
                : new Set(
                    (Array.isArray(options.preferFilledHoldIndexes) ? options.preferFilledHoldIndexes : [])
                        .map((n) => Number(n))
                        .filter((n) => Number.isInteger(n)),
                );
            if (
                band === 'red'
                && (!zh || zh === '…' || zh === '...' || /^[….\s]+$/.test(zh))
                && !preferFilled.has(idx)
            ) {
                continue;
            }
            // Skip pure moan / SFX-like tiny lines (keep filler ZH if JA still has words)
            if (src.length <= 2 && zh.length <= 3 && !jaHasLexicalResidue(src)) continue;
            const qcFromMap = lookupByIndex(options.qcTypesByIndex, idx);
            const confFromMap = lookupByIndex(options.confidenceByIndex, idx);
            const preferEmotionPolish = emotionStyle?.shouldPreferEmotionForPolish
                ? emotionStyle.shouldPreferEmotionForPolish(options)
                : (String(options.sensevoiceEmotionMtStyle || '').toLowerCase() === 'hint+polish'
                    && String(options.sensevoiceRichTags || 'sidecar') !== 'off');
            const neighbor = neighborByListPos.get(i) || { score: 0, reasons: [] };
            const mix = scoreMultiSpeakerMix(src, zh);
            let score = scoreCueForPlotPolish(src, zh, {
                glossaryTerms: options.glossaryTerms,
                filmBrief: options.filmBrief,
                cueIndex: i,
                qcTypes: qcFromMap || c.qcTypes || c.qc,
                asrConfidence: confFromMap ?? c.asrConfidence ?? c.confidence,
                asrLow: c.asrLow ?? c.lowConfidence ?? lookupByIndex(options.asrLowByIndex, idx),
                blankRecovered: c.blankRecovered || lookupByIndex(options.blankRecoveredByIndex, idx),
                sanitizeBlankRecover: c.sanitizeBlankRecover,
                sanitizeResidual: c.sanitizeResidual || lookupByIndex(options.residualByIndex, idx),
                residualHot: c.residualHot,
                band,
                preferEmotionPolish,
                emotion: c.emotion || lookupByIndex(options.emotionByIndex, idx),
                neighborBleedScore: neighbor.score,
                multiSpeakerScore: mix.score,
            });
            // Prefer cues that were red-holds / blank and got filled by QC loop / blank-MT.
            if (preferFilled.has(idx) || c.blankRecovered || lookupByIndex(options.blankRecoveredByIndex, idx)) {
                score = Math.max(score, 12);
            }
            const row = {
                index: idx,
                sourceText: src,
                text: zh,
                score,
                emotion: c.emotion || lookupByIndex(options.emotionByIndex, idx) || null,
                neighborReasons: neighbor.reasons?.length ? neighbor.reasons : undefined,
                neighborBleedScore: neighbor.score || 0,
                multiSpeakerScore: mix.score || 0,
                multiSpeakerReasons: mix.reasons?.length ? mix.reasons : undefined,
            };
            // Attach adjacent context so polish LLM can un-bleed.
            if (i > 0) {
                const p = srcList[i - 1];
                const pIdx = Number(p?.index);
                if (Number.isInteger(pIdx)) {
                    row.prevSource = String(p.text || p.sourceText || '').trim();
                    row.prevText = String(byZh.get(pIdx) ?? '').trim();
                }
            }
            if (i + 1 < srcList.length) {
                const n = srcList[i + 1];
                const nIdx = Number(n?.index);
                if (Number.isInteger(nIdx)) {
                    row.nextSource = String(n.text || n.sourceText || '').trim();
                    row.nextText = String(byZh.get(nIdx) ?? '').trim();
                }
            }
            scored.push(row);
        }
        scored.sort((a, b) => b.score - a.score || a.index - b.index);

        // Force-prefer neighbor bleed/echo + multi-speaker mix, then fill by score.
        const forced = scored.filter((r) => (r.neighborBleedScore || 0) >= 5
            || (r.multiSpeakerScore || 0) >= 5);
        const forcedCap = Math.min(limit, Math.max(12, Math.floor(limit * 0.55)));
        const pickMap = new Map();
        for (const r of forced.slice(0, forcedCap)) pickMap.set(r.index, r);
        const high = scored.filter((r) => r.score >= 2);
        const pool = high.length >= 1 ? high : (
            scored.length >= POLISH_MIN_SAMPLE
                ? scored.slice(0, Math.max(POLISH_MIN_SAMPLE, Math.floor(scored.length * 0.2)))
                : []
        );
        for (const r of pool) {
            if (pickMap.size >= limit) break;
            if (!pickMap.has(r.index)) pickMap.set(r.index, r);
        }
        // If still empty but we have forced leftovers beyond cap, keep at least those.
        if (!pickMap.size && forced.length) {
            for (const r of forced.slice(0, Math.min(limit, forced.length))) {
                pickMap.set(r.index, r);
            }
        }
        return [...pickMap.values()].sort((a, b) => a.index - b.index);
    }

    function formatNamesBlock(filmBrief, glossaryTerms) {
        const lines = [];
        const seen = new Set();
        const push = (name, note) => {
            const n = String(name || '').trim();
            if (!n || seen.has(n)) return;
            seen.add(n);
            lines.push(note ? `- ${n}（${note}）` : `- ${n}`);
        };
        for (const c of filmBrief?.characters || []) {
            push(c?.name, c?.role || c?.notes || '');
        }
        for (const t of glossaryTerms || []) {
            const src = String(t.term || t.src || '').trim();
            const dst = String(t.translation || t.dst || '').trim();
            const note = String(t.note || t.info || '').trim();
            const roleTag = t.role === 'character' ? '角色' : '人名';
            if (src && dst && src !== dst) push(dst, note ? `${note}；原文：${src}` : `原文：${src}`);
            else if (dst) push(dst, note || roleTag);
            else if (src) push(src, note || roleTag);
        }
        return lines.length ? `人物/专名（须沿用，禁止发明）：\n${lines.slice(0, 24).join('\n')}` : '';
    }

    /**
     * Build chat messages for plot polish. Model returns only changed cues as JSON.
     */
    function buildPlotPolishMessages({
        pairs,
        filmBrief,
        glossaryTerms,
        targetLanguage,
        faithfulTone,
        tone,
        translateStylePreset,
        translateStyleCustomNote,
        modelId,
        smartTranslateModelId,
        model,
        sensevoiceEmotionMtStyle,
        sensevoiceRichTags,
        emotionByIndex,
    } = {}) {
        const list = Array.isArray(pairs) ? pairs : [];
        const target = targetLanguage || '简体中文';
        const system = [
            `你是影视字幕剧情贴合润色助手，不是改写编剧。下面已有专训/句级模型的${target}译文草稿。`,
            `目标语言：${target}。只改抽样条目里确有问题的地方；译文须贴近原文语义与草稿用词，忠实还原原意，禁止另起一种翻译腔或为顺口改意。`,
            /中文/.test(target) || /^zh/i.test(target)
                ? '允许（仅下列）：'
                : `允许（仅下列）；输出必须保持${target}，禁止改成中文：`,
            '1）欠译补回：草稿把仍有实词的原文压成「嗯/啊」等语气词时，按原文补成可看的对白；',
            '2）称呼统一：同一部里「先輩」只对应一种（学长/学姐/前辈，以简要与片中多数为准）；人名与简要一致；',
            '3）纠错：明显事实错译（职务、动作、专名）按原文改回；',
            '4）极小通顺修补：仅改明显病句/错字，保留草稿句式、语域与口语风格。',
            '5）邻条回声 / 窜句（优先修）：payload 可能带 prevSource/prevText、nextSource/nextText。',
            '   · 本条原文只是上条尾部回声（如「この勃起は…」接在「つまり、この勃起は…」后）→ 译文只保留本条原文对应的短译，去掉上句整段内容；',
            '   · 本条译文把上一句内容粘进来、或与邻条近重复而原文并不相同 → 按本条原文改准，删掉窜入的邻句译文；',
            '   · 相邻两条原文近重复时，信息更完整的一条保留完整译，另一条改成贴合其原文的短译（可「…」），禁止两条同译。',
            '6）多人混句拆分（仅 flags 含 multi_speaker / ja_mid_sentence_break 等时）：一条字幕里两个人的话或两个话轮焊在一起时，必须拆开。',
            '   · 输出 split 数组（2～3 段），每段含 source（日文切片）与 text（对应译文）；不要只改 text 却仍挤在一条。',
            '   · 按话轮边界切（句末。！？、引号「」闭合后、称呼切换），禁止把同一人的半句话拆碎。',
            '   · 各段 source 拼接应覆盖原 source 语义（可去多余标点），禁止发明原句没有的对白。',
            '禁止：同义整句换写、为「更好看/更顺口」改文风、把口语改成旁白腔或另一种翻译风格。',
            '禁止：编造原文没有的情节、人物关系或对白；不要为文采加戏；把无关条目合并；把有内容的条目改空；发明「××小姐」类乱称呼。',
            '禁止：净化、和谐、医学化改写限制级题材或粗口内容（须忠实保留）。',
            '草稿已通顺且无欠译/错译/邻条窜句/多人混句时，不要输出该 index。',
            '只返回需要修改的条目；无需改动的 index 不要输出。',
            '只输出 JSON：{"cues":[{"index":0,"text":"润色后译文"}, {"index":1,"split":[{"source":"日文1","text":"译文1"},{"source":"日文2","text":"译文2"}]}, ...]}；若无需修改则返回 {"cues":[]}。',
            '禁止思考过程；直接输出 JSON。',
        ];
        if (faithfulTone) {
            system.push('本片需忠实语气：保留亲密/喘息/拟声与不当语言，勿净化。');
        }
        try {
            const huihui = (typeof module !== 'undefined' && module.exports)
                ? require('./huihui-qwen3-profile-core')
                : (global && global.TransubHuihuiQwen3Profile);
            const addon = huihui?.getHuihuiPromptAddon?.(
                modelId || smartTranslateModelId || model,
                'polish',
            );
            if (addon) system.push(addon);
        } catch (_) { /* optional */ }
        const userLines = [];
        const names = formatNamesBlock(filmBrief, glossaryTerms);
        if (names) {
            userLines.push(names);
            userLines.push('');
        }
        const styleCore = (typeof module !== 'undefined' && module.exports)
            ? (() => { try { return require('./translate-style-core'); } catch { return null; } })()
            : (global && global.TransubTranslateStyle);
        const styleHint = styleCore?.buildPolishStyleHint
            ? styleCore.buildPolishStyleHint({
                translateStylePreset,
                translateStyleCustomNote,
            })
            : '';
        if (styleHint) {
            userLines.push(styleHint);
            userLines.push('');
        }
        const toneHint = String(tone || filmBrief?.tone || '').trim();
        if (toneHint) {
            userLines.push(`对白语气：${toneHint}`);
            userLines.push('');
        }
        try {
            if (emotionStyle?.buildEmotionMtStyleBlock) {
                const emoCues = list.map((p) => ({
                    text: p.sourceText || p.source || '',
                    emotion: p.emotion || lookupByIndex(emotionByIndex, p.index),
                }));
                const emoBlock = emotionStyle.buildEmotionMtStyleBlock(emoCues, {
                    sensevoiceEmotionMtStyle,
                    sensevoiceRichTags,
                });
                if (emoBlock) {
                    userLines.push(emoBlock);
                    userLines.push('');
                }
            }
        } catch (_) { /* optional */ }
        const bleedN = list.filter((p) => (p.neighborBleedScore || 0) >= 5
            || (Array.isArray(p.neighborReasons) && p.neighborReasons.length)).length;
        const mixN = list.filter((p) => (p.multiSpeakerScore || 0) >= 5
            || (Array.isArray(p.multiSpeakerReasons) && p.multiSpeakerReasons.length)).length;
        if (bleedN > 0) {
            userLines.push(
                `本批含 ${bleedN} 条邻条回声/窜句嫌疑：请对照 prev/next 字段优先按规则 5 修正，勿整句换写无关条目。`,
            );
            userLines.push('');
        }
        if (mixN > 0) {
            userLines.push(
                `本批含 ${mixN} 条多人/双话轮混句嫌疑：请用 split 按规则 6 拆开，勿继续挤在一条。`,
            );
            userLines.push('');
        }
        userLines.push('待润色（含原文 + 译文草稿；邻条/混句嫌疑带 flags 与 prev/next）：');
        userLines.push(JSON.stringify(list.map((p) => {
            const row = {
                index: p.index,
                source: p.sourceText || p.source || '',
                text: p.text,
            };
            if (p.prevSource || p.prevText) {
                row.prevSource = p.prevSource || '';
                row.prevText = p.prevText || '';
            }
            if (p.nextSource || p.nextText) {
                row.nextSource = p.nextSource || '';
                row.nextText = p.nextText || '';
            }
            const flags = [
                ...(Array.isArray(p.neighborReasons) ? p.neighborReasons : []),
                ...(Array.isArray(p.multiSpeakerReasons) ? p.multiSpeakerReasons : []),
            ];
            if ((p.multiSpeakerScore || 0) >= 5 && !flags.includes('multi_speaker')) {
                flags.push('multi_speaker');
            }
            if (flags.length) row.flags = [...new Set(flags)];
            return row;
        }), null, 2));
        userLines.push('/no_think');
        return [
            { role: 'system', content: system.join('\n') },
            { role: 'user', content: userLines.join('\n') },
        ];
    }

    /**
     * Shared CJK/char overlap ratio vs draft (0–1). Low = style rewrite / retranslation.
     */
    function draftOverlapRatio(prev, next) {
        const p = String(prev || '');
        const n = String(next || '');
        if (!p || !n) return 0;
        const prevSet = new Set(Array.from(p));
        let shared = 0;
        for (const ch of Array.from(n)) {
            if (prevSet.has(ch)) shared += 1;
        }
        return shared / Math.max(Array.from(n).length, 1);
    }

    /**
     * Reject polish edits that drift too far from the Sakura draft.
     * @param {Array<{index:number,text:string}>} updates
     * @param {Map|object} prevByIndex
     * @param {{ maxGrow?: number, minKeep?: number, minOverlap?: number, sourceByIndex?: Map|object }} [options]
     */
    function filterPlotPolishUpdates(updates, prevByIndex, options = {}) {
        const maxGrow = Number(options.maxGrow) || 1.55;
        const minKeep = Number(options.minKeep) || 0.5;
        const minOverlap = Number(options.minOverlap);
        const overlapFloor = Number.isFinite(minOverlap) ? minOverlap : 0.5;
        const sourceByIndex = options.sourceByIndex || null;
        const echoBleedByIndex = options.echoBleedByIndex || null;
        const adultZhRe = /乳头|肉棒|湿漉|湿透|插进|射了|射精|高潮|做爱|性爱|口交|舔弄|内射|最里面|更深入|变硬|爱抚|胸部|再多吸/;
        const adultJaRe = /乳首|ちん|まん|ペニス|イッ|イキ|イク|いく|挿入|入れ|射精|セックス|せっくす|ぬるぬる|舐めて|咥|犯[しす]|おっぱい|奥まで|硬く|濡れ/;
        return (updates || []).filter((u) => {
            const idx = Number(u?.index);
            const next = String(u?.text ?? '').trim();
            if (!Number.isInteger(idx) || !next) return false;
            if (/__[^_\n]{1,64}__/.test(next)) return false;
            if (/的代号/.test(next)) return false;
            if (fluency?.looksLikeWeirdCueText?.(next)) return false;
            if (/符合原文语气|^改为/.test(next)) return false;
            const prev = String(prevByIndex?.get?.(idx) ?? prevByIndex?.[idx] ?? '').trim();
            if (!prev) return false;
            if (prev === next) return false;
            const src = sourceByIndex
                ? String(lookupByIndex(sourceByIndex, idx) ?? '').trim()
                : '';
            const echoBleed = !!(
                lookupByIndex(echoBleedByIndex, idx)
                || (Array.isArray(u?.neighborReasons) && u.neighborReasons.length)
                || Number(u?.neighborBleedScore) >= 5
            );
            // Soft-AV contamination: adult ZH pasted onto non-adult JA (JUFE-625 greetings).
            if (src && adultZhRe.test(next) && !adultJaRe.test(src) && !adultZhRe.test(prev)) {
                return false;
            }
            // Plot invent: long thriller/medical ZH on short spoken JA (SAME-250).
            if (src && looksLikePlotTopicInvent(src, next)) {
                return false;
            }
            if (src && looksLikeInventedFact(src, next)) {
                return false;
            }
            // Opening/family/meal JA must not receive adult polish invent.
            if (
                src
                && adultZhRe.test(next)
                && !adultJaRe.test(src)
                && /(?:ただいま|おかえり|はーい|お久しぶり|こんにちは|お邪魔|いらっしゃい|帰郷|兄に嫁|兄さん|いい嫁|真面目|そうめん|奮発|遠慮せず食え|奏くん来|駅まで|予定より|朝\s*早く|元気してたか)/.test(src)
            ) {
                return false;
            }
            // Opening/greeting JA must not grow into long unrelated dialogue.
            if (
                src
                && textCharLen(src) <= 20
                && /^(?:ただいま|おかえり|はーい|はい|お久しぶり|こんにちは|お邪魔|いらっしゃい)/.test(src.trim())
                && textCharLen(next) >= Math.max(10, textCharLen(src) + 4)
                && !/回来了|欢迎|你好|好久不见|打扰|嗯|好的|来了/.test(next)
            ) {
                return false;
            }
            const pl = textCharLen(prev);
            const nl = textCharLen(next);
            // Filler-only drafts may grow into real dialogue; cap runaway invention.
            if (isFillerOnlyZh(prev)) {
                if (nl < 2 || nl > 40) return false;
                // Growing filler into long unrelated adult/dialogue without JA support → reject.
                if (src && nl >= 10 && adultZhRe.test(next) && !adultJaRe.test(src)) return false;
                if (src && nl >= 12 && draftOverlapRatio(prev, next) < 0.15 && !jaHasLexicalResidue(src)) {
                    return false;
                }
                return true;
            }
            // Echo/窜句 fix often shortens a wrongly-glued draft → allow shrink + lower overlap.
            const growCap = echoBleed ? Math.max(maxGrow, 1.85) : maxGrow;
            const keepFloor = echoBleed ? Math.min(minKeep, 0.22) : minKeep;
            const overlapNeed = echoBleed ? Math.min(overlapFloor, 0.28) : overlapFloor;
            if (pl >= 4) {
                if (nl > Math.max(12, Math.ceil(pl * growCap))) return false;
                if (nl < Math.max(1, Math.floor(pl * keepFloor))) return false;
            }
            // Too many new chars vs draft → style rewrite / full retranslation
            if (pl >= 6) {
                if (draftOverlapRatio(prev, next) < overlapNeed) return false;
            }
            return true;
        });
    }

    /**
     * Split polish LLM updates: direct keep / Laya soft band / hard drop.
     * Soft = passes relaxed length/overlap but not hard filter, OR substantial hard-keeps.
     */
    function classifyPlotPolishUpdates(updates, prevByIndex, options = {}) {
        let pipe = null;
        try {
            pipe = require('./jev-laya-pipeline-core');
        } catch {
            pipe = null;
        }
        const hardOk = filterPlotPolishUpdates(updates, prevByIndex, options);
        const softOk = filterPlotPolishUpdates(updates, prevByIndex, {
            ...options,
            maxGrow: Number(options.layaSoftMaxGrow) || 2.05,
            minKeep: Number(options.layaSoftMinKeep) || 0.38,
            minOverlap: Number(options.layaSoftMinOverlap) || 0.32,
        });
        const hardKey = new Set(hardOk.map((u) => `${Number(u.index)}::${String(u.text ?? '').trim()}`));
        const softKey = new Set(softOk.map((u) => `${Number(u.index)}::${String(u.text ?? '').trim()}`));
        const keep = [];
        const soft = [];
        const hardDrop = [];
        const seen = new Set();
        for (const u of updates || []) {
            const idx = Number(u?.index);
            const next = String(u?.text ?? '').trim();
            if (!Number.isInteger(idx) || !next) continue;
            const key = `${idx}::${next}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const prev = String(prevByIndex?.get?.(idx) ?? prevByIndex?.[idx] ?? '').trim();
            if (hardKey.has(key)) {
                const kind = pipe?.classifyPolishUpdateKind
                    ? pipe.classifyPolishUpdateKind(prev, next, options)
                    : 'keep';
                if (kind === 'soft') {
                    soft.push({ index: idx, text: next, before: prev, after: next, id: `p${idx}` });
                } else {
                    keep.push({ index: idx, text: next });
                }
                continue;
            }
            if (softKey.has(key)) {
                soft.push({
                    index: idx,
                    text: next,
                    before: prev,
                    after: next,
                    id: `p${idx}`,
                    softReject: true,
                });
                continue;
            }
            hardDrop.push({ index: idx, text: next });
        }
        return { keep, soft, hardDrop };
    }

    function tryParseJsonObject(raw) {
        const s = String(raw || '').trim();
        if (!s) return null;
        try {
            return JSON.parse(s);
        } catch {
            const start = s.indexOf('{');
            const end = s.lastIndexOf('}');
            if (start >= 0 && end > start) {
                try {
                    return JSON.parse(s.slice(start, end + 1));
                } catch {
                    return null;
                }
            }
            return null;
        }
    }

    /**
     * Parse polish LLM JSON into text updates + multi-speaker splits.
     * @returns {{ updates: Array<{index:number,text:string}>, splits: Array<{index:number,parts:Array<{source:string,text:string}>}> }}
     */
    function parsePlotPolishOps(content, expectedIndexes = []) {
        const expected = new Set(
            (expectedIndexes || []).map((n) => Number(n)).filter((n) => Number.isInteger(n)),
        );
        let raw = String(content || '').trim();
        try {
            if (mtSanitize?.stripLlmThinkWrappers) {
                raw = mtSanitize.stripLlmThinkWrappers(raw);
            }
        } catch { /* optional */ }
        const parsed = tryParseJsonObject(raw);
        const rows = Array.isArray(parsed?.cues) ? parsed.cues : [];
        const updates = [];
        const splits = [];
        for (const row of rows) {
            const idx = Number(row?.index);
            if (!Number.isInteger(idx)) continue;
            if (expected.size && !expected.has(idx)) continue;
            const splitRaw = row?.split || row?.parts || row?.texts;
            if (Array.isArray(splitRaw) && splitRaw.length >= 2) {
                const parts = [];
                for (const p of splitRaw.slice(0, 3)) {
                    if (p && typeof p === 'object') {
                        const source = String(p.source || p.src || p.ja || '').trim();
                        const text = String(p.text || p.zh || p.translation || '').trim();
                        if (source || text) parts.push({ source, text });
                    } else if (typeof p === 'string' && p.trim()) {
                        parts.push({ source: '', text: p.trim() });
                    }
                }
                if (parts.length >= 2) {
                    splits.push({ index: idx, parts });
                    continue;
                }
            }
            const text = String(row?.text ?? '').trim();
            if (text) updates.push({ index: idx, text });
        }
        return { updates, splits };
    }

    function validateMultiSpeakerSplit(srcText, parts) {
        const src = String(srcText || '').trim();
        const list = Array.isArray(parts) ? parts : [];
        if (!src || list.length < 2 || list.length > 3) return false;
        const sources = list.map((p) => String(p?.source || '').trim()).filter(Boolean);
        const texts = list.map((p) => String(p?.text || '').trim()).filter(Boolean);
        if (texts.length < 2) return false;
        // Prefer explicit JA slices; if missing, allow ZH-only and fill JA later.
        if (sources.length >= 2) {
            const joined = sources.join('');
            const srcBare = bareNeighborText(src);
            const joinBare = bareNeighborText(joined);
            if (srcBare.length >= 8 && joinBare.length >= 6) {
                const overlap = draftOverlapRatio(srcBare, joinBare);
                if (overlap < 0.45 && !srcBare.includes(joinBare.slice(0, Math.min(6, joinBare.length)))) {
                    return false;
                }
            }
            if (sources.some((s) => textCharLen(s) < 2)) return false;
        }
        if (texts.some((t) => textCharLen(t) < 1)) return false;
        return true;
    }

    /**
     * Proportionally fill missing JA slices from the full source by ZH part weights.
     */
    function fillMissingSourceParts(srcText, parts) {
        const src = String(srcText || '');
        const list = (parts || []).map((p) => ({
            source: String(p?.source || '').trim(),
            text: String(p?.text || '').trim(),
        }));
        if (list.every((p) => p.source)) return list;
        const weights = list.map((p) => Math.max(1, textCharLen(p.text) || textCharLen(p.source) || 1));
        const totalW = weights.reduce((a, b) => a + b, 0) || 1;
        const chars = Array.from(src);
        if (chars.length < 2) return list;
        let cursor = 0;
        return list.map((p, i) => {
            if (p.source) {
                cursor = Math.min(chars.length, cursor + Array.from(p.source).length);
                return p;
            }
            const take = i === list.length - 1
                ? chars.length - cursor
                : Math.max(1, Math.round((weights[i] / totalW) * chars.length));
            const slice = chars.slice(cursor, Math.min(chars.length, cursor + take)).join('');
            cursor = Math.min(chars.length, cursor + take);
            return { source: slice.trim() || p.text, text: p.text };
        });
    }

    function buildTimedParts(startMs, endMs, texts, options = {}) {
        const start = Math.round(Number(startMs) || 0);
        const end = Math.max(start + 1, Math.round(Number(endMs) || (start + 1000)));
        const minDurMs = Math.max(200, Math.round(Number(options.minDurMs) || 400));
        let built = null;
        if (typeof splitCore?.buildCuesFromTexts === 'function') {
            built = splitCore.buildCuesFromTexts(start, end, texts, 'proportional', {
                minDurMs,
            });
            if (!Array.isArray(built) || built.length !== (texts || []).length) built = null;
        }
        if (!built) {
            const parts = (texts || []).map((t) => String(t || '').trim()).filter(Boolean);
            if (!parts.length) return [];
            const total = parts.reduce((s, t) => s + Math.max(1, textCharLen(t)), 0) || 1;
            const out = [];
            let cur = start;
            let used = 0;
            for (let i = 0; i < parts.length; i += 1) {
                used += Math.max(1, textCharLen(parts[i]));
                const cueEnd = i === parts.length - 1
                    ? end
                    : Math.max(cur + minDurMs, Math.round(start + (used / total) * (end - start)));
                out.push({ startMs: cur, endMs: Math.min(end, cueEnd), text: parts[i] });
                cur = out[out.length - 1].endMs;
            }
            if (out.length) out[out.length - 1].endMs = end;
            built = out;
        }
        const intervals = options.silenceIntervals || options.intervals || null;
        if (intervals && Array.isArray(intervals) && intervals.length
            && typeof splitCore?.applySilenceEdgeBoundaries === 'function') {
            try {
                const refined = splitCore.applySilenceEdgeBoundaries(
                    built,
                    intervals,
                    start,
                    end,
                    { minDurMs },
                );
                if (Array.isArray(refined) && refined.length === built.length) {
                    built = refined.map((c, i) => ({
                        startMs: c.startMs,
                        endMs: c.endMs,
                        text: built[i].text,
                    }));
                }
            } catch { /* keep proportional */ }
        }
        return built;
    }

    /**
     * Apply multi-speaker splits to JA+ZH cue lists (same expanded length / timing).
     * @returns {{ sourceCues: object[], cues: object[], splitCount: number, replacedIndexes: number[] }}
     */
    function applyPlotPolishSplits(sourceCues, translatedCues, splits, options = {}) {
        const srcList = Array.isArray(sourceCues) ? sourceCues : [];
        const zhList = Array.isArray(translatedCues) ? translatedCues : [];
        const zhByIndex = new Map(
            zhList.map((c) => [Number(c.index), String(c.text ?? '')]),
        );
        const splitByIndex = new Map();
        for (const s of splits || []) {
            const idx = Number(s?.index);
            if (!Number.isInteger(idx) || !Array.isArray(s.parts) || s.parts.length < 2) continue;
            splitByIndex.set(idx, s.parts);
        }
        if (!splitByIndex.size) {
            return {
                sourceCues: srcList.map((c, i) => ({
                    ...c,
                    index: Number.isInteger(Number(c.index)) ? Number(c.index) : i,
                    text: String(c.text ?? ''),
                })),
                cues: srcList.map((c, i) => {
                    const idx = Number.isInteger(Number(c.index)) ? Number(c.index) : i;
                    return {
                        index: idx,
                        startMs: c.startMs,
                        endMs: c.endMs,
                        text: zhByIndex.has(idx) ? zhByIndex.get(idx) : '',
                    };
                }),
                splitCount: 0,
                replacedIndexes: [],
            };
        }

        const outSrc = [];
        const outZh = [];
        const replacedIndexes = [];
        const splitPartIndexes = [];
        const parentZhByNewIndex = new Map();
        let splitCount = 0;
        for (let i = 0; i < srcList.length; i += 1) {
            const src = srcList[i];
            const idx = Number.isInteger(Number(src?.index)) ? Number(src.index) : i;
            const srcText = String(src?.text || src?.sourceText || '').trim();
            const zhText = zhByIndex.has(idx) ? String(zhByIndex.get(idx) || '').trim() : '';
            const rawParts = splitByIndex.get(idx);
            if (!rawParts || !validateMultiSpeakerSplit(srcText, rawParts)) {
                outSrc.push({
                    ...src,
                    index: idx,
                    text: srcText,
                });
                outZh.push({
                    index: idx,
                    startMs: src?.startMs,
                    endMs: src?.endMs,
                    text: zhText,
                });
                continue;
            }
            const parts = fillMissingSourceParts(srcText, rawParts);
            const jaTexts = parts.map((p) => p.source);
            const zhTexts = parts.map((p) => p.text);
            if (jaTexts.length !== zhTexts.length || jaTexts.length < 2) {
                outSrc.push({ ...src, index: idx, text: srcText });
                outZh.push({ index: idx, startMs: src?.startMs, endMs: src?.endMs, text: zhText });
                continue;
            }
            const startMs = Number.isFinite(Number(src?.startMs))
                ? Number(src.startMs)
                : (Number.isFinite(Number(src?.start)) ? Math.round(Number(src.start) * 1000) : i * 1000);
            const endMs = Number.isFinite(Number(src?.endMs))
                ? Number(src.endMs)
                : (Number.isFinite(Number(src?.end))
                    ? Math.round(Number(src.end) * 1000)
                    : startMs + Math.max(1000, textCharLen(srcText) * 120));
            const silenceLookup = options.silenceByIndex || options.silenceIntervalsByIndex || null;
            const silenceIntervals = silenceLookup
                ? (lookupByIndex(silenceLookup, idx) || null)
                : (options.silenceIntervals || null);
            // Time from JA part weights; copy the same cuts onto ZH (keeps tracks aligned).
            const jaBuilt = buildTimedParts(startMs, endMs, jaTexts, {
                minDurMs: options.minDurMs,
                silenceIntervals,
            });
            if (jaBuilt.length < 2 || jaBuilt.length !== zhTexts.length) {
                outSrc.push({ ...src, index: idx, text: srcText });
                outZh.push({ index: idx, startMs, endMs, text: zhText });
                continue;
            }
            for (let k = 0; k < jaBuilt.length; k += 1) {
                const newIdx = outSrc.length;
                outSrc.push({
                    ...src,
                    index: newIdx,
                    startMs: jaBuilt[k].startMs,
                    endMs: jaBuilt[k].endMs,
                    text: jaBuilt[k].text,
                });
                outZh.push({
                    index: newIdx,
                    startMs: jaBuilt[k].startMs,
                    endMs: jaBuilt[k].endMs,
                    text: zhTexts[k],
                });
                splitPartIndexes.push(newIdx);
                parentZhByNewIndex.set(newIdx, zhText);
            }
            splitCount += 1;
            replacedIndexes.push(idx);
        }
        // Renumber densely after expansion.
        const sourceOut = outSrc.map((c, i) => ({ ...c, index: i }));
        const zhOut = outZh.map((c, i) => ({ ...c, index: i }));
        return {
            sourceCues: sourceOut,
            cues: zhOut,
            splitCount,
            replacedIndexes,
            splitPartIndexes,
            parentZhByNewIndex,
            expandDelta: sourceOut.length - srcList.length,
        };
    }

    return {
        POLISH_SAMPLE_LIMIT,
        POLISH_MIN_SAMPLE,
        normalizePlotPolishOption,
        textCharLen,
        isFillerOnlyZh,
        jaHasLexicalResidue,
        looksLikeInventedFact,
        productRiskBonus,
        scoreNeighborCueBleed,
        scoreMultiSpeakerMix,
        suggestPolishSampleLimit,
        scoreCueForPlotPolish,
        selectCuesForPlotPolish,
        buildPlotPolishMessages,
        draftOverlapRatio,
        filterPlotPolishUpdates,
        classifyPlotPolishUpdates,
        parsePlotPolishOps,
        validateMultiSpeakerSplit,
        applyPlotPolishSplits,
        formatNamesBlock,
        looksLikePlotTopicInvent,
    };
}));
