/**
 * Pro smart-translate plot polish: after Sakura/GalTransl sentence MT,
 * constrained LLM edits that keep meaning but fit cast / scene / spoken tone.
 * Pure helpers (no network).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSmartTranslatePolish = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function smartTranslatePolishCoreFactory() {
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

        // Soft prior: mid-file dialogue gets a little weight so sample is not only head
        if (Number(options.cueIndex) >= 0) score += 0.01;

        return score;
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
            // Skip pure moan / SFX-like tiny lines
            if (src.length <= 2 && zh.length <= 3) continue;
            const score = scoreCueForPlotPolish(src, zh, {
                glossaryTerms: options.glossaryTerms,
                filmBrief: options.filmBrief,
                cueIndex: i,
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
            '你是影视字幕润色助手。下面已有专训模型的中文译文草稿。',
            `任务：在${target}下做「语意不变」的剧情贴合润色，让语句更像片中角色在说，而不是重新翻译。`,
            '允许：统一人名/敬称/称呼；顺一下口语节奏；同一角色语气前后一致；去掉明显机器腔。',
            '禁止：改变事实与意图；加戏或脑补剧情；合并/拆分条目；把有内容的条目改空；发明新译名或「××小姐」类乱称呼。',
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
            const prev = String(prevByIndex?.get?.(idx) ?? prevByIndex?.[idx] ?? '').trim();
            if (!prev) return false;
            if (prev === next) return false;
            const pl = textCharLen(prev);
            const nl = textCharLen(next);
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
        scoreCueForPlotPolish,
        selectCuesForPlotPolish,
        buildPlotPolishMessages,
        filterPlotPolishUpdates,
        formatNamesBlock,
    };
}));
