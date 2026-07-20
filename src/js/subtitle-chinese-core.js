/**
 * 字幕简繁体转换（浏览器与 Node 测试共用）
 * 基于 OpenCC 字符表 + 短语表；不改时间轴。
 */
(function (global, factory) {
    const dict = (typeof module !== 'undefined' && module.exports)
        ? require('./subtitle-chinese-dict')
        : (global && global.TransubSubtitleChineseDict);
    const api = factory(dict);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSubtitleChinese = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function subtitleChineseCoreFactory(dict) {
    if (!dict?.S2T_FROM || !dict?.S2T_TO || !dict?.T2S_FROM || !dict?.T2S_TO) {
        throw new Error('subtitle-chinese-dict.js must load before subtitle-chinese-core.js');
    }

    const DIRECTIONS = new Set(['s2t', 't2s']);
    const MASK_PREFIX = '\uE000p';
    const MASK_SUFFIX = '\uE001';

    let s2tMap = null;
    let t2sMap = null;
    let s2tPhrases = null;
    let t2sPhrases = null;

    function buildMap(fromStr, toStr) {
        const from = [...fromStr];
        const to = [...toStr];
        const map = new Map();
        const n = Math.min(from.length, to.length);
        for (let i = 0; i < n; i += 1) {
            if (from[i] !== to[i]) map.set(from[i], to[i]);
        }
        return map;
    }

    function getPhrases(direction) {
        if (direction === 's2t') {
            if (!s2tPhrases) s2tPhrases = Array.isArray(dict.S2T_PHRASES) ? dict.S2T_PHRASES : [];
            return s2tPhrases;
        }
        if (!t2sPhrases) t2sPhrases = Array.isArray(dict.T2S_PHRASES) ? dict.T2S_PHRASES : [];
        return t2sPhrases;
    }

    function getMap(direction) {
        if (direction === 's2t') {
            if (!s2tMap) s2tMap = buildMap(dict.S2T_FROM, dict.S2T_TO);
            return s2tMap;
        }
        if (!t2sMap) t2sMap = buildMap(dict.T2S_FROM, dict.T2S_TO);
        return t2sMap;
    }

    function normalizeDirection(direction) {
        const d = String(direction || 's2t').toLowerCase();
        return DIRECTIONS.has(d) ? d : 's2t';
    }

    function directionLabel(direction) {
        return normalizeDirection(direction) === 't2s' ? '繁体 → 简体' : '简体 → 繁体';
    }

    /** 移除旧版 initial_prompt 简繁提示被 Whisper 复述进字幕的片段 */
    function stripTranslatePromptLeakage(text) {
        let out = String(text ?? '');
        if (!out) return out;
        out = out.replace(/请使用简体中文输出[。.…]*/g, '');
        out = out.replace(/請使用繁體中文輸出[。.…]*/g, '');
        out = out.replace(/(?:^|[\s，,、；;])?(?:简体中文|繁体中文|繁體中文)(?:[。.…]|[\s，,、；;]|$)/g, ' ');
        return out.replace(/\s{2,}/g, ' ').trim();
    }

    /**
     * 中文句号 / 问号 / 感叹号后补空格（已有空白则不重复；行末不补）。
     * 便于后续 CPS 拆句识别句界。
     */
    function ensureSpaceAfterChinesePunctuation(text) {
        const raw = String(text ?? '');
        if (!raw) return raw;
        return raw.replace(/([。？！])(?!\s|$)/g, '$1 ');
    }

    function spaceAfterChinesePunctuationCues(cues) {
        const list = Array.isArray(cues) ? cues : [];
        const nextCues = [];
        let cueTouched = 0;
        let punctSpaced = 0;
        for (const cue of list) {
            const base = {
                startMs: cue?.startMs,
                endMs: cue?.endMs,
                text: String(cue?.text ?? ''),
            };
            const textOut = ensureSpaceAfterChinesePunctuation(base.text);
            if (textOut !== base.text) {
                cueTouched += 1;
                punctSpaced += [...textOut].length - [...base.text].length;
                nextCues.push({ ...base, text: textOut });
            } else {
                nextCues.push(base);
            }
        }
        const stats = { cueTotal: list.length, cueTouched, punctSpaced };
        return {
            cues: nextCues,
            stats,
            summary: cueTouched
                ? `句读后空格：更新 ${cueTouched} 条（+${punctSpaced} 空格）`
                : '句读后空格：无需修改',
        };
    }

    function normalizeProtectTerms(protectTerms) {
        if (!Array.isArray(protectTerms) || !protectTerms.length) return [];
        const seen = new Set();
        const out = [];
        for (const raw of protectTerms) {
            const term = String(raw || '').trim();
            if (!term) continue;
            const key = term.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(term);
        }
        return out.sort((a, b) => b.length - a.length || a.localeCompare(b, 'zh-CN'));
    }

    function maskProtectedTerms(text, protectTerms) {
        const terms = normalizeProtectTerms(protectTerms);
        if (!terms.length) return { text: String(text ?? ''), slots: [] };
        const slots = [];
        let out = String(text ?? '');
        for (const term of terms) {
            if (!term || !out.includes(term)) continue;
            const parts = out.split(term);
            if (parts.length <= 1) continue;
            out = parts.reduce((acc, part, idx) => {
                if (idx === 0) return part;
                const slotId = slots.length;
                slots.push(term);
                return `${acc}${MASK_PREFIX}${slotId.toString(36)}${MASK_SUFFIX}${part}`;
            }, '');
        }
        return { text: out, slots };
    }

    function unmaskProtectedTerms(text, slots) {
        let out = String(text ?? '');
        for (let i = 0; i < slots.length; i += 1) {
            const token = `${MASK_PREFIX}${i.toString(36)}${MASK_SUFFIX}`;
            out = out.split(token).join(slots[i]);
        }
        return out;
    }

    function applyPhrases(text, phrases) {
        const raw = String(text ?? '');
        if (!raw || !phrases?.length) return { text: raw, changed: 0 };
        let changed = 0;
        let out = '';
        let i = 0;
        while (i < raw.length) {
            let matched = false;
            for (const pair of phrases) {
                const from = pair?.[0];
                const to = pair?.[1];
                if (!from || to == null) continue;
                if (!raw.startsWith(from, i)) continue;
                out += to;
                if (from !== to) changed += [...from].length;
                i += from.length;
                matched = true;
                break;
            }
            if (!matched) {
                out += raw[i];
                i += 1;
            }
        }
        return { text: out, changed };
    }

    function applyCharMap(text, map) {
        const raw = String(text ?? '');
        if (!raw) return { text: raw, changed: 0 };
        let changed = 0;
        let out = '';
        for (const ch of raw) {
            const next = map.get(ch);
            if (next != null) {
                out += next;
                changed += 1;
            } else {
                out += ch;
            }
        }
        return { text: out, changed };
    }

    /**
     * @returns {{ text: string, changed: number }}
     */
    function convertText(text, direction = 's2t', options = {}) {
        const raw = String(text ?? '');
        if (!raw) return { text: raw, changed: 0 };
        const dir = normalizeDirection(direction);
        const masked = maskProtectedTerms(raw, options.protectTerms);
        const phraseResult = applyPhrases(masked.text, getPhrases(dir));
        const charResult = applyCharMap(phraseResult.text, getMap(dir));
        const textOut = unmaskProtectedTerms(charResult.text, masked.slots);
        return {
            text: textOut,
            changed: phraseResult.changed + charResult.changed,
        };
    }

    /**
     * @param {Array<{startMs?:number,endMs?:number,text?:string}>} cues
     * @param {{ direction?: 's2t'|'t2s', indexes?: number[]|null, protectTerms?: string[] }} [options]
     *   indexes: 仅转换这些下标；缺省/空则转换全部
     */
    function convertCues(cues, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const direction = normalizeDirection(options.direction);
        const protectTerms = options.protectTerms;
        const indexSet = Array.isArray(options.indexes) && options.indexes.length
            ? new Set(options.indexes.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0))
            : null;

        const nextCues = [];
        const stats = {
            direction,
            cueTotal: list.length,
            cueTouched: 0,
            charChanged: 0,
            cueSkipped: 0,
        };

        for (let i = 0; i < list.length; i += 1) {
            const cue = list[i] || {};
            const base = {
                startMs: cue.startMs,
                endMs: cue.endMs,
                text: String(cue.text ?? ''),
            };
            if (indexSet && !indexSet.has(i)) {
                nextCues.push(base);
                stats.cueSkipped += 1;
                continue;
            }
            const strippedText = options.stripPromptLeakage === false
                ? base.text
                : stripTranslatePromptLeakage(base.text);
            const converted = convertText(strippedText, direction, { protectTerms });
            const textOut = converted.text;
            const leakageStripped = strippedText !== base.text;
            if (leakageStripped || converted.changed > 0) {
                if (textOut !== base.text) {
                    stats.cueTouched += 1;
                    stats.charChanged += converted.changed + (leakageStripped ? 1 : 0);
                }
                nextCues.push({ ...base, text: textOut });
            } else {
                nextCues.push(base);
            }
        }

        return {
            cues: nextCues,
            stats,
            summary: summarizeConversion(stats),
        };
    }

    function summarizeConversion(stats) {
        if (!stats) return '—';
        if (!stats.cueTouched) {
            return `无需转换（${directionLabel(stats.direction)}）`;
        }
        return `${directionLabel(stats.direction)}：将更新 ${stats.cueTouched} 条，替换 ${stats.charChanged} 个字符`;
    }

    return {
        DIRECTIONS: ['s2t', 't2s'],
        normalizeDirection,
        directionLabel,
        stripTranslatePromptLeakage,
        ensureSpaceAfterChinesePunctuation,
        spaceAfterChinesePunctuationCues,
        convertText,
        convertCues,
        summarizeConversion,
    };
}));
