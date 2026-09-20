/**
 * Cross-cue ZH recycle guard: same long translation pasted onto divergent JA.
 * Pure helpers (no network). Used by smart-translate online scrub + tests.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSmartTranslateRecycleGuard = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function smartTranslateRecycleGuardFactory() {
    /** Min compacted ZH length to treat as a recyclable paste (EBWH-366 mid phrases ≥6). */
    const MIN_LONG_KEY_LEN = 6;
    /** Contained prior phrase must be at least this long (MFYD-186 glue pastes). */
    const MIN_CONTAIN_KEY_LEN = 10;
    /** ≥N distinct prior long keys inside one ZH → multi-fragment recycle glue. */
    const MIN_GLUE_PRIOR_HITS = 2;
    /** Shared compact prefix length for near-paraphrase recycle (VAGU opening spam). */
    const MIN_PREFIX_RECYCLE_LEN = 10;
    /** Shared-prefix / shorter-key ratio to treat as same paste family. */
    const MIN_PREFIX_RECYCLE_RATIO = 0.68;

    function compactZhKey(text) {
        return String(text || '')
            .replace(/[\s　]+/g, '')
            .replace(/[。．.!！?？…⋯~～、，,]+$/gu, '')
            .replace(/^[。．.!！?？…⋯~～、，,]+/gu, '')
            .trim();
    }

    function compactJaKey(text) {
        return String(text || '')
            .replace(/[\s　]+/g, '')
            .replace(/[。．.!！?？…⋯~～、，,]+$/gu, '')
            .trim();
    }

    /**
     * Short sticky stock / ellipsis — left to mt-sanitize unstick, not this guard.
     */
    function isShortOrStockKey(key) {
        const k = String(key || '');
        if (!k) return true;
        if (/^…+$/.test(k) || k === '...') return true;
        if (k.length < MIN_LONG_KEY_LEN) return true;
        if (/^(?:好厉害|好舒服|舒服吗|糟了|那就|不行|真的|太好了|什么|好开心|要射了|要去了|要射了吗|要去了吗|感觉|舔|好可爱|拜托了|不要|好漂亮|等一下|为什么|你看|明白了|知道了|很远|是啊)$/u.test(k)) {
            return true;
        }
        return false;
    }

    /**
     * Short name-card spam still recycles across divergent JA (哦佑佳 / 我佑佳 / 哦 佑佳).
     * These are often below MIN_LONG_KEY_LEN so the long-paste path would ignore them.
     */
    function isNameCardSpamKey(key) {
        const k = String(key || '').replace(/\s+/g, '');
        if (!k || k.length < 2 || k.length > 10) return false;
        const NAME_CARD_TAIL_OK = /^(?:好的|没事|对了|这样|真的|可以|不是|什么|怎么|那个|这个|然后|所以|但是|可是|就是|还是|已经|现在|今天|明天|加油|开始|结束|过来|过去|回来|出去|进来|等等|一下|一点|一些|你们|我们|大家|自己)$/u;
        const interject = k.match(/^(?:哦|啊|嗯|嘿|喂|哎|诶|喔|你好)([\u4e00-\u9fffA-Za-zー]{1,8})$/u);
        if (interject && !NAME_CARD_TAIL_OK.test(interject[1])) return true;
        const wo = k.match(/^我([\u4e00-\u9fffA-Za-zー]{1,8})$/u);
        if (
            wo
            && !NAME_CARD_TAIL_OK.test(wo[1])
            && !/^(?:是|叫|们|的|看|想|要|说|会|来)/u.test(wo[1])
        ) {
            return true;
        }
        return false;
    }

    function isLongRecycleCandidate(text) {
        const key = compactZhKey(text);
        if (isNameCardSpamKey(key)) return true;
        return !isShortOrStockKey(key);
    }

    function sharedPrefixLen(a, b) {
        const left = String(a || '');
        const right = String(b || '');
        const n = Math.min(left.length, right.length);
        let i = 0;
        while (i < n && left[i] === right[i]) i += 1;
        return i;
    }

    /**
     * Near-paraphrase of a prior long ZH (same stem, slight ending tweak) on divergent JA.
     */
    function looksLikePrefixFamilyRecycle(zhKey, seen, jaKey) {
        if (!zhKey || zhKey.length < MIN_PREFIX_RECYCLE_LEN || !jaKey) return false;
        for (const [priorKey, jaSet] of seen.entries()) {
            if (!priorKey || priorKey.length < MIN_PREFIX_RECYCLE_LEN) continue;
            if (priorKey === zhKey) continue;
            if (!jaSet || !jaSet.size || jaSet.has(jaKey)) continue;
            const pref = sharedPrefixLen(zhKey, priorKey);
            if (pref < MIN_PREFIX_RECYCLE_LEN) continue;
            const shorter = Math.min(zhKey.length, priorKey.length);
            if (pref / shorter >= MIN_PREFIX_RECYCLE_RATIO) return true;
        }
        return false;
    }

    /**
     * @param {Map<string, Set<string>>} seen  zhKey → set of jaKeys already paired
     */
    function rememberSeen(seen, zhKey, jaKey) {
        let set = seen.get(zhKey);
        if (!set) {
            set = new Set();
            seen.set(zhKey, set);
        }
        if (jaKey) set.add(jaKey);
        else if (!set.size) set.add('');
        return set;
    }

    /**
     * Scrub recycled long ZH onto divergent JA. First occurrence kept.
     * @param {Array<{index:number,text?:string,sourceText?:string,source?:string}>} cues
     * @param {Map<string, Set<string>>} [seenMap] mutable across chunks
     * @param {{ sourceByIndex?: Map|object, blankText?: string }} [options]
     * @returns {{ cues: Array, scrubbedIndexes: number[], scrubbed: number, seen: Map }}
     */
    function scrubRecycledTranslations(cues, seenMap = null, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const seen = seenMap instanceof Map ? seenMap : new Map();
        const blankText = options.blankText != null ? String(options.blankText) : '';
        const srcMap = options.sourceByIndex;
        const getSrc = (c) => {
            const idx = Number(c?.index);
            if (srcMap?.get) {
                const v = srcMap.get(idx);
                if (v != null) return String(v);
            } else if (srcMap && Number.isInteger(idx) && srcMap[idx] != null) {
                return String(srcMap[idx]);
            }
            return String(c?.sourceText ?? c?.source ?? '');
        };

        const scrubbedIndexes = [];
        const out = list.map((c) => {
            const idx = Number(c?.index);
            const text = String(c?.text ?? '');
            if (!isLongRecycleCandidate(text)) {
                return { ...c, text };
            }
            const zhKey = compactZhKey(text);
            const jaKey = compactJaKey(getSrc(c));
            const priorJa = seen.get(zhKey);
            if (priorJa && priorJa.size) {
                // Same ZH already paired with a different JA → regurgitated paste
                if (jaKey && !priorJa.has(jaKey)) {
                    scrubbedIndexes.push(idx);
                    rememberSeen(seen, zhKey, jaKey);
                    return { ...c, text: blankText };
                }
                // Same ZH+JA again: keep (split slices / true repeat)
                rememberSeen(seen, zhKey, jaKey);
                return { ...c, text };
            }

            // Containment / glue: later cue embeds one or more earlier long ZH phrases
            // on divergent JA (exact-key miss when fragments are concatenated).
            if (jaKey && zhKey.length >= MIN_CONTAIN_KEY_LEN) {
                let containHits = 0;
                let containedForeign = false;
                for (const [priorKey, jaSet] of seen.entries()) {
                    if (!priorKey || priorKey.length < MIN_CONTAIN_KEY_LEN) continue;
                    if (priorKey === zhKey) continue;
                    if (!zhKey.includes(priorKey)) continue;
                    containHits += 1;
                    if (jaSet && jaSet.size && !jaSet.has(jaKey)) {
                        containedForeign = true;
                    }
                }
                if (containedForeign || containHits >= MIN_GLUE_PRIOR_HITS) {
                    scrubbedIndexes.push(idx);
                    rememberSeen(seen, zhKey, jaKey);
                    return { ...c, text: blankText };
                }
            }

            // Near-paraphrase family (same long stem, tweaked ending) on divergent JA
            if (looksLikePrefixFamilyRecycle(zhKey, seen, jaKey)) {
                scrubbedIndexes.push(idx);
                rememberSeen(seen, zhKey, jaKey);
                return { ...c, text: blankText };
            }

            rememberSeen(seen, zhKey, jaKey);
            return { ...c, text };
        });

        return {
            cues: out,
            scrubbedIndexes: scrubbedIndexes.filter((n) => Number.isInteger(n)),
            scrubbed: scrubbedIndexes.length,
            seen,
        };
    }

    /**
     * Whole-track pass: build seen from scratch in cue order.
     */
    function scrubTrackRecycledTranslations(translatedCues, sourceCues = [], options = {}) {
        const srcByIndex = new Map();
        for (const c of (Array.isArray(sourceCues) ? sourceCues : [])) {
            const idx = Number(c?.index);
            if (Number.isInteger(idx)) srcByIndex.set(idx, String(c?.text ?? ''));
        }
        const srcList = Array.isArray(sourceCues) ? sourceCues : [];
        const paired = (Array.isArray(translatedCues) ? translatedCues : []).map((c, i) => ({
            ...c,
            sourceText: srcByIndex.has(Number(c?.index))
                ? srcByIndex.get(Number(c.index))
                : String(srcList[i]?.text ?? c?.sourceText ?? ''),
        }));
        return scrubRecycledTranslations(paired, new Map(), {
            ...options,
            sourceByIndex: srcByIndex.size ? srcByIndex : undefined,
        });
    }

    return {
        MIN_LONG_KEY_LEN,
        MIN_CONTAIN_KEY_LEN,
        MIN_GLUE_PRIOR_HITS,
        MIN_PREFIX_RECYCLE_LEN,
        MIN_PREFIX_RECYCLE_RATIO,
        compactZhKey,
        compactJaKey,
        isLongRecycleCandidate,
        isNameCardSpamKey,
        sharedPrefixLen,
        scrubRecycledTranslations,
        scrubTrackRecycledTranslations,
    };
}));
