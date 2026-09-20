/**
 * 字幕简繁体转换（浏览器与 Node 测试共用）
 * 基于 opencc-js（OpenCC mmseg + 地区词典）；不改时间轴。
 *
 * 简→繁默认 cn→twp（台湾字形 + 常用词，如 软件→軟體）；
 * 繁→简默认 twp→cn。可通过 options.locale 指定 tw / twp / hk / t。
 */
(function (global, factory) {
    function resolveOpenCC() {
        if (typeof module !== 'undefined' && module.exports) {
            try {
                return require('opencc-js');
            } catch (_) { /* fall through to global */ }
        }
        const g = typeof globalThis !== 'undefined' ? globalThis : global;
        return (g && g.OpenCC) || null;
    }

    const api = factory(resolveOpenCC);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSubtitleChinese = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function subtitleChineseCoreFactory(resolveOpenCC) {
    const DIRECTIONS = new Set(['s2t', 't2s']);
    const LOCALES = new Set(['twp', 'tw', 'hk', 't']);
    const DEFAULT_LOCALE = 'twp';
    const MASK_PREFIX = '\uE000p';
    const MASK_SUFFIX = '\uE001';

    /** @type {Map<string, function(string): string>} */
    const converterCache = new Map();
    let openCCLib = null;
    /** @type {Promise<object>|null} */
    let ensureOpenCCPromise = null;
    const OPENCC_VENDOR_SRC = 'vendor/opencc-js/full.js';

    function peekOpenCC() {
        if (openCCLib && typeof openCCLib.Converter === 'function') return openCCLib;
        try {
            openCCLib = typeof resolveOpenCC === 'function' ? resolveOpenCC() : resolveOpenCC;
        } catch (_) {
            openCCLib = null;
        }
        if (!openCCLib || typeof openCCLib.Converter !== 'function') {
            openCCLib = null;
            return null;
        }
        return openCCLib;
    }

    function getOpenCC() {
        const lib = peekOpenCC();
        if (!lib) {
            throw new Error('opencc-js 未加载：请确保已安装依赖，或先 await ensureOpenCC()');
        }
        return lib;
    }

    /**
     * Lazy-load OpenCC in the browser (or require in Node). Safe to call repeatedly.
     * @returns {Promise<object>}
     */
    function ensureOpenCC() {
        const existing = peekOpenCC();
        if (existing) return Promise.resolve(existing);
        if (ensureOpenCCPromise) return ensureOpenCCPromise;
        ensureOpenCCPromise = new Promise((resolve, reject) => {
            try {
                if (typeof module !== 'undefined' && module.exports) {
                    try {
                        const mod = require('opencc-js');
                        if (mod && typeof mod.Converter === 'function') {
                            openCCLib = mod;
                            resolve(mod);
                            return;
                        }
                    } catch (_) { /* fall through to script tag in renderer */ }
                }
            } catch (_) { /* ignore */ }

            const g = typeof globalThis !== 'undefined' ? globalThis : null;
            if (g && g.OpenCC && typeof g.OpenCC.Converter === 'function') {
                openCCLib = g.OpenCC;
                resolve(openCCLib);
                return;
            }
            const doc = g && g.document;
            if (!doc || typeof doc.createElement !== 'function') {
                reject(new Error('opencc-js 未加载且无法动态注入脚本'));
                return;
            }
            const prev = doc.querySelector(`script[src="${OPENCC_VENDOR_SRC}"]`)
                || doc.querySelector('script[src$="opencc-js/full.js"]');
            if (prev) {
                const finish = () => {
                    if (g.OpenCC && typeof g.OpenCC.Converter === 'function') {
                        openCCLib = g.OpenCC;
                        resolve(openCCLib);
                    } else {
                        reject(new Error('opencc-js 脚本已存在但未导出 OpenCC'));
                    }
                };
                if (g.OpenCC && typeof g.OpenCC.Converter === 'function') {
                    finish();
                    return;
                }
                prev.addEventListener('load', finish);
                prev.addEventListener('error', () => reject(new Error('opencc-js 加载失败')));
                return;
            }
            const el = doc.createElement('script');
            el.src = OPENCC_VENDOR_SRC;
            el.async = true;
            el.onload = () => {
                if (g.OpenCC && typeof g.OpenCC.Converter === 'function') {
                    openCCLib = g.OpenCC;
                    resolve(openCCLib);
                } else {
                    reject(new Error('opencc-js 加载后未导出 OpenCC'));
                }
            };
            el.onerror = () => reject(new Error('opencc-js 加载失败'));
            (doc.head || doc.documentElement || doc.body).appendChild(el);
        }).then((lib) => {
            ensureOpenCCPromise = Promise.resolve(lib);
            return lib;
        }).catch((err) => {
            ensureOpenCCPromise = null;
            throw err;
        });
        return ensureOpenCCPromise;
    }

    function normalizeDirection(direction) {
        const d = String(direction || 's2t').toLowerCase();
        return DIRECTIONS.has(d) ? d : 's2t';
    }

    function normalizeLocale(locale) {
        const loc = String(locale || DEFAULT_LOCALE).toLowerCase();
        return LOCALES.has(loc) ? loc : DEFAULT_LOCALE;
    }

    /**
     * 设置项 chineseSubtitleVariant → 规范值
     * simplified | traditional(=twp) | traditional-tw | traditional-hk
     */
    function normalizeVariant(variant) {
        const v = String(variant || '').trim().toLowerCase();
        if (v === 'traditional' || v === 'traditional-twp' || v === 'twp') return 'traditional';
        if (v === 'traditional-tw' || v === 'tw') return 'traditional-tw';
        if (v === 'traditional-hk' || v === 'hk') return 'traditional-hk';
        return 'simplified';
    }

    function isTraditionalVariant(variant) {
        return normalizeVariant(variant) !== 'simplified';
    }

    /**
     * 批量翻译后处理仅对繁体变体调用 OpenCC（简体目标跳过）。
     * simplified → t2s 供编辑器手动「繁→简」等显式转换使用。
     * @returns {{ direction: 's2t'|'t2s', locale: 'twp'|'tw'|'hk'|'t' }}
     */
    function variantToConvertOptions(variant) {
        const v = normalizeVariant(variant);
        if (v === 'traditional-tw') return { direction: 's2t', locale: 'tw' };
        if (v === 'traditional-hk') return { direction: 's2t', locale: 'hk' };
        if (v === 'traditional') return { direction: 's2t', locale: 'twp' };
        return { direction: 't2s', locale: 'twp' };
    }

    function variantLabel(variant) {
        const v = normalizeVariant(variant);
        if (v === 'traditional') return '繁体（台湾）';
        if (v === 'traditional-tw') return '繁体（台湾字形）';
        if (v === 'traditional-hk') return '繁体（香港）';
        return '简体';
    }

    function directionLabel(direction, locale) {
        const dir = normalizeDirection(direction);
        const loc = normalizeLocale(locale);
        if (dir === 't2s') {
            return loc === 'hk' ? '繁体（香港）→ 简体' : '繁体 → 简体';
        }
        if (loc === 'hk') return '简体 → 繁体（香港）';
        if (loc === 'tw') return '简体 → 繁体（台湾字形）';
        if (loc === 't') return '简体 → 繁体（OpenCC 标准）';
        return '简体 → 繁体（台湾）';
    }

    function getConverter(direction, locale) {
        const dir = normalizeDirection(direction);
        const loc = normalizeLocale(locale);
        const key = `${dir}:${loc}`;
        let conv = converterCache.get(key);
        if (conv) return conv;
        const OpenCC = getOpenCC();
        if (dir === 's2t') {
            conv = OpenCC.Converter({ from: 'cn', to: loc });
        } else {
            // 繁→简：与输出地区对齐，便于还原台湾/香港用词
            const from = loc === 't' ? 't' : loc;
            conv = OpenCC.Converter({ from, to: 'cn' });
        }
        converterCache.set(key, conv);
        return conv;
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

    function countChangedChars(before, after) {
        const a = [...String(before ?? '')];
        const b = [...String(after ?? '')];
        const n = Math.min(a.length, b.length);
        let changed = Math.abs(a.length - b.length);
        for (let i = 0; i < n; i += 1) {
            if (a[i] !== b[i]) changed += 1;
        }
        return changed;
    }

    /**
     * OpenCC twp/tw→cn maps particle 么 (U+4E48) to 幺 (U+5E7A).
     * Restore interrogative/particle forms; keep 老幺 / 幺蛾子 / 读数「幺」.
     */
    function fixMeYaoOpenCcSlip(text) {
        const raw = String(text ?? '');
        if (!raw.includes('幺')) return raw;
        return raw
            .replace(/怎幺/g, '怎么')
            .replace(/什幺/g, '什么')
            .replace(/那幺/g, '那么')
            .replace(/这幺/g, '这么')
            .replace(/多幺/g, '多么')
            .replace(/要幺/g, '要么');
    }

    /**
     * @param {string} text
     * @param {'s2t'|'t2s'} [direction]
     * @param {{ protectTerms?: string[], locale?: 'twp'|'tw'|'hk'|'t' }} [options]
     * @returns {{ text: string, changed: number }}
     */
    function convertText(text, direction = 's2t', options = {}) {
        const raw = String(text ?? '');
        if (!raw) return { text: raw, changed: 0 };
        const dir = normalizeDirection(direction);
        const locale = normalizeLocale(options.locale);
        const masked = maskProtectedTerms(raw, options.protectTerms);
        const convert = getConverter(dir, locale);
        const converted = convert(masked.text);
        let textOut = unmaskProtectedTerms(converted, masked.slots);
        if (dir === 't2s') {
            textOut = fixMeYaoOpenCcSlip(textOut);
        }
        return {
            text: textOut,
            changed: countChangedChars(raw, textOut),
        };
    }

    /**
     * @param {Array<{startMs?:number,endMs?:number,text?:string}>} cues
     * @param {{
     *   direction?: 's2t'|'t2s',
     *   locale?: 'twp'|'tw'|'hk'|'t',
     *   indexes?: number[]|null,
     *   protectTerms?: string[],
     *   stripPromptLeakage?: boolean,
     * }} [options]
     */
    function convertCues(cues, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const direction = normalizeDirection(options.direction);
        const locale = normalizeLocale(options.locale);
        const protectTerms = options.protectTerms;
        const indexSet = Array.isArray(options.indexes) && options.indexes.length
            ? new Set(options.indexes.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0))
            : null;

        const nextCues = [];
        const stats = {
            direction,
            locale,
            cueTotal: list.length,
            cueTouched: 0,
            charChanged: 0,
            cueSkipped: 0,
        };

        for (let i = 0; i < list.length; i += 1) {
            const cue = list[i] || {};
            // Preserve cue index — MT blank-retry / SRT merge keys on it.
            const base = {
                startMs: cue.startMs,
                endMs: cue.endMs,
                text: String(cue.text ?? ''),
            };
            if (cue.index !== undefined && cue.index !== null && cue.index !== '') {
                const n = Number(cue.index);
                if (Number.isInteger(n)) base.index = n;
            }
            if (indexSet && !indexSet.has(i)) {
                nextCues.push(base);
                stats.cueSkipped += 1;
                continue;
            }
            const strippedText = options.stripPromptLeakage === false
                ? base.text
                : stripTranslatePromptLeakage(base.text);
            const converted = convertText(strippedText, direction, { protectTerms, locale });
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
        const label = directionLabel(stats.direction, stats.locale);
        if (!stats.cueTouched) {
            return `无需转换（${label}）`;
        }
        return `${label}：将更新 ${stats.cueTouched} 条，约 ${stats.charChanged} 处变化`;
    }

    /**
     * LLM 句级 MT 后按用户设置归一化中文变体。
     * 简体目标：繁→简（模型偶发繁体或台湾用词）；繁体目标：不在此处理（批量后处理 s2t）。
     * @param {Array<{index?:number,startMs?:number,endMs?:number,text?:string}>} cues
     * @param {string} [variant] chineseSubtitleVariant
     * @param {{ protectTerms?: string[], stripPromptLeakage?: boolean }} [options]
     */
    function normalizeMtChineseCues(cues, variant, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const v = normalizeVariant(variant);
        if (v !== 'simplified') {
            return {
                cues: list.map((cue) => ({ ...cue })),
                stats: null,
                summary: '',
                changed: false,
            };
        }
        const convertOpts = variantToConvertOptions('simplified');
        const converted = convertCues(list, {
            direction: convertOpts.direction,
            locale: convertOpts.locale,
            protectTerms: options.protectTerms,
            stripPromptLeakage: options.stripPromptLeakage,
        });
        return {
            cues: converted.cues,
            stats: converted.stats,
            summary: converted.summary,
            changed: (converted.stats?.cueTouched || 0) > 0,
        };
    }

    return {
        DIRECTIONS: ['s2t', 't2s'],
        LOCALES: ['twp', 'tw', 'hk', 't'],
        DEFAULT_LOCALE,
        ensureOpenCC,
        peekOpenCC,
        normalizeDirection,
        normalizeLocale,
        normalizeVariant,
        isTraditionalVariant,
        variantToConvertOptions,
        variantLabel,
        directionLabel,
        stripTranslatePromptLeakage,
        ensureSpaceAfterChinesePunctuation,
        spaceAfterChinesePunctuationCues,
        convertText,
        convertCues,
        summarizeConversion,
        normalizeMtChineseCues,
    };
}));
