/**
 * Pro smart-translate plot polish: after Sakura/GalTransl sentence MT,
 * constrained LLM edits that keep watchability (recover undertranslation,
 * lock names/先輩, fix invented facts) without inventing plot.
 * Pure helpers (no network).
 */
(function (global, factory) {
    let fluency = null;
    let mtSanitize = null;
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
    const api = factory(fluency, mtSanitize);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSmartTranslatePolish = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function smartTranslatePolishCoreFactory(fluency, mtSanitize) {
    const POLISH_SAMPLE_LIMIT = 36;
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
     * Pick high-risk source+zh pairs for polish (paired rows).
     * @returns {Array<{ index: number, sourceText: string, text: string, score: number }>}
     */
    function selectCuesForPlotPolish(sourceCues, translatedCues, options = {}) {
        const limit = Math.max(
            POLISH_MIN_SAMPLE,
            Math.min(POLISH_SAMPLE_LIMIT, Number(options.limit) || POLISH_SAMPLE_LIMIT),
        );
        const srcList = Array.isArray(sourceCues) ? sourceCues : [];
        const byZh = new Map(
            (translatedCues || []).map((c) => [Number(c.index), String(c.text ?? '')]),
        );
        const scored = [];
        for (let i = 0; i < srcList.length; i += 1) {
            const c = srcList[i];
            const idx = Number(c?.index);
            if (!Number.isInteger(idx)) continue;
            const src = String(c.text || c.sourceText || '').trim();
            const zh = String(byZh.get(idx) ?? '').trim();
            if (!src || !zh) continue;
            // Skip pure moan / SFX-like tiny lines (keep filler ZH if JA still has words)
            if (src.length <= 2 && zh.length <= 3 && !jaHasLexicalResidue(src)) continue;
            const qcFromMap = lookupByIndex(options.qcTypesByIndex, idx);
            const confFromMap = lookupByIndex(options.confidenceByIndex, idx);
            const score = scoreCueForPlotPolish(src, zh, {
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
            });
            scored.push({
                index: idx,
                sourceText: src,
                text: zh,
                score,
            });
        }
        scored.sort((a, b) => b.score - a.score || a.index - b.index);
        const high = scored.filter((r) => r.score >= 2);
        // Prefer high-risk rows; if few, still polish them (even 1–3) so Pro value shows.
        let pick;
        if (high.length >= 1) {
            pick = high.slice(0, limit);
        } else if (scored.length >= POLISH_MIN_SAMPLE) {
            pick = scored.slice(0, Math.min(limit, Math.max(POLISH_MIN_SAMPLE, Math.floor(scored.length * 0.2))));
        } else {
            pick = [];
        }
        return pick.sort((a, b) => a.index - b.index);
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
            if (src && dst && src !== dst) push(dst, `原文：${src}`);
            else if (dst) push(dst, '人名');
            else if (src) push(src, '人名');
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
    } = {}) {
        const list = Array.isArray(pairs) ? pairs : [];
        const target = targetLanguage || '简体中文';
        const system = [
            '你是影视字幕剧情贴合润色助手，不是改写编剧。下面已有专训模型的中文译文草稿。',
            `目标语言：${target}。只改抽样条目，让字幕可看，而不是另起炉灶重译全片。`,
            '允许：',
            '1）欠译补回：草稿把仍有实词的原文压成「嗯/啊」等语气词时，按原文补成可看的对白；',
            '2）称呼统一：同一部里「先輩」只对应一种（学长/学姐/前辈，以简要与片中多数为准）；人名与简要一致；',
            '3）纠错：明显事实错译（职务、动作、专名）按原文改回；',
            '4）去机器腔、顺口，不改变意图。',
            '禁止：编造原文没有的情节、人物关系或对白；不要为文采加戏；合并/拆分条目；把有内容的条目改空；发明「××小姐」类乱称呼。',
            '禁止：净化、和谐、医学化改写限制级题材或粗口内容（须忠实保留）。',
            '只返回需要修改的条目；无需改动的 index 不要输出。',
            '只输出 JSON：{"cues":[{"index":0,"text":"润色后译文"}, ...]}；若无需修改则返回 {"cues":[]}。',
            '禁止思考过程；直接输出 JSON。',
        ];
        if (faithfulTone) {
            system.push('本片需忠实语气：保留亲密/喘息/拟声与不当语言，勿净化。');
        }
        const userLines = [];
        const names = formatNamesBlock(filmBrief, glossaryTerms);
        if (names) {
            userLines.push(names);
            userLines.push('');
        }
        const toneHint = String(tone || filmBrief?.tone || '').trim();
        if (toneHint) {
            userLines.push(`对白语气：${toneHint}`);
            userLines.push('');
        }
        userLines.push('待润色（含原文 + 译文草稿）：');
        userLines.push(JSON.stringify(list.map((p) => ({
            index: p.index,
            source: p.sourceText || p.source || '',
            text: p.text,
        })), null, 2));
        userLines.push('/no_think');
        return [
            { role: 'system', content: system.join('\n') },
            { role: 'user', content: userLines.join('\n') },
        ];
    }

    /**
     * Reject polish edits that drift too far from the Sakura draft.
     */
    function filterPlotPolishUpdates(updates, prevByIndex, options = {}) {
        const maxGrow = Number(options.maxGrow) || 1.85;
        const minKeep = Number(options.minKeep) || 0.45;
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
            const pl = textCharLen(prev);
            const nl = textCharLen(next);
            // Filler-only drafts may grow into real dialogue; cap runaway invention.
            if (isFillerOnlyZh(prev)) {
                return nl >= 2 && nl <= 40;
            }
            if (pl >= 4) {
                if (nl > Math.max(12, Math.ceil(pl * maxGrow))) return false;
                if (nl < Math.max(1, Math.floor(pl * minKeep))) return false;
            }
            // Too many new CJK chars vs draft → likely rewrite, not polish
            if (pl >= 6) {
                let shared = 0;
                const prevSet = new Set(Array.from(prev));
                for (const ch of Array.from(next)) {
                    if (prevSet.has(ch)) shared += 1;
                }
                if (shared / Math.max(nl, 1) < 0.35) return false;
            }
            return true;
        });
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
        scoreCueForPlotPolish,
        selectCuesForPlotPolish,
        buildPlotPolishMessages,
        filterPlotPolishUpdates,
        formatNamesBlock,
    };
}));
