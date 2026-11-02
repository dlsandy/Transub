/**
 * Cap display duration for filler / pure-moan cues.
 * Soft-AV ASR often leaves「ん、ん」islands at 4–8s; ZH becomes「嗯」and hangs on screen.
 * Pure helpers — shorten endMs only; never extend; keep gap before next cue.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubCueDurationCap = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function cueDurationCapFactory() {
    const DEFAULT_FILLER_MAX_MS = 2200;
    const DEFAULT_MOAN_MAX_MS = 2500;
    const DEFAULT_SHORT_TEXT_MAX_MS = 2800;
    const MIN_DUR_MS = 200;

    function loadSanitize() {
        try {
            return (typeof module !== 'undefined' && module.exports)
                ? require('./mt-sanitize-core')
                : (global && global.TransubMtSanitize);
        } catch {
            return null;
        }
    }

    function loadEllipsisPolicy() {
        try {
            return (typeof module !== 'undefined' && module.exports)
                ? require('./hymt-ellipsis-policy-core')
                : (global && global.TransubHyMtEllipsisPolicy);
        } catch {
            return null;
        }
    }

    function loadFluency() {
        try {
            return (typeof module !== 'undefined' && module.exports)
                ? require('./subtitle-fluency-core')
                : (global && global.TransubSubtitleFluency);
        } catch {
            return null;
        }
    }

    function cueDurMs(cue) {
        const s = Number(cue?.startMs);
        const e = cue?.endMs != null ? Number(cue.endMs) : s;
        if (!Number.isFinite(s) || !Number.isFinite(e)) return 0;
        return Math.max(0, e - s);
    }

    function bareTextLen(text) {
        return Array.from(String(text || '').replace(/[\s　。．.!！?？…·.•\-—_~～、，,・]+/g, '')).length;
    }

    function isBlankOrEllipsisZh(text) {
        const t = String(text || '').trim();
        return !t || /^(?:\.\.\.|……|…)+$/.test(t);
    }

    /**
     * @returns {number|null} max allowed duration ms, or null if no cap
     */
    function resolveCueDurationCapMs(zhText, jaText, options = {}) {
        const sanitize = loadSanitize();
        const policy = loadEllipsisPolicy();
        const fluency = loadFluency();
        const zh = String(zhText || '').trim();
        const ja = String(jaText || '').trim();
        const fillerMax = Math.max(MIN_DUR_MS, Number(options.fillerMaxMs) || DEFAULT_FILLER_MAX_MS);
        const moanMax = Math.max(MIN_DUR_MS, Number(options.moanMaxMs) || DEFAULT_MOAN_MAX_MS);
        const shortMax = Math.max(MIN_DUR_MS, Number(options.shortTextMaxMs) || DEFAULT_SHORT_TEXT_MAX_MS);

        const zhFiller = !!zh && (
            isBlankOrEllipsisZh(zh)
            || !!sanitize?.isFillerOnlyZh?.(zh)
            || /^(?:嗯+|啊+|哦+|哈+|呵+)[…·.\s啊嗯哦哈呵]*$/u.test(zh)
        );
        const jaMoan = !!(
            (ja && policy?.isPureMoanOrSfxJa?.(ja))
            || (ja && fluency?.isPureInterjectionJa?.(ja))
            || (ja && /^(?:ん[、,，.…\sんｎン]*)+$/u.test(ja.replace(/[ー〜～っッ]/g, '')))
        );

        if (zhFiller || jaMoan) {
            return Math.min(fillerMax, moanMax);
        }

        // Soft-AV reactive stubs (好舒服 / 好厉害…) often inherit 3–5s ASR islands.
        // Cap even when JA is lexical — the ZH surface itself is too short to justify a long hold.
        if (
            zh
            && /^(?:好舒服|好厉害|好开心|不要|不行|啊哈|嗯嗯)[…·.。．]*$/u.test(zh)
        ) {
            return shortMax;
        }

        // Ultra-short surface (≤2 chars) without JA lexical residue — soft cap
        const chars = bareTextLen(zh || ja);
        if (zh && chars > 0 && chars <= 2) {
            const lexical = !!(sanitize?.jaCueHasLexicalResidue?.(ja) || /[一-龯]/.test(ja));
            if (!lexical) return shortMax;
        }
        return null;
    }

    /**
     * Cap aligned ZH (+ optional JA) cue durations.
     * @returns {{ cues: object[], sourceCues: object[], capped: number, changed: boolean }}
     */
    function capFillerMoanCueDurations(zhCues, jaCues = [], options = {}) {
        const zhList = Array.isArray(zhCues) ? zhCues.map((c) => ({ ...c })) : [];
        const jaList = Array.isArray(jaCues) ? jaCues.map((c) => ({ ...c })) : [];
        const jaByStart = new Map();
        for (const j of jaList) {
            const s = Math.round(Number(j?.startMs) || 0);
            if (!jaByStart.has(s)) jaByStart.set(s, j);
        }
        let capped = 0;

        for (let i = 0; i < zhList.length; i += 1) {
            const z = zhList[i];
            const startMs = Number(z?.startMs);
            if (!Number.isFinite(startMs)) continue;
            const endMs = z?.endMs != null ? Number(z.endMs) : startMs;
            const dur = Math.max(0, endMs - startMs);
            if (dur <= MIN_DUR_MS) continue;

            let jaText = '';
            const hit = jaByStart.get(Math.round(startMs));
            if (hit) jaText = String(hit.text || '');
            else if (i < jaList.length && Math.abs((Number(jaList[i]?.startMs) || 0) - startMs) <= 120) {
                jaText = String(jaList[i]?.text || '');
            }

            const cap = resolveCueDurationCapMs(z?.text, jaText, options);
            if (cap == null || dur <= cap) continue;

            let nextEnd = startMs + cap;
            // Do not collide into following cue
            if (i + 1 < zhList.length) {
                const ns = Number(zhList[i + 1]?.startMs);
                if (Number.isFinite(ns) && ns > startMs) {
                    nextEnd = Math.min(nextEnd, ns - 20);
                }
            }
            nextEnd = Math.max(startMs + MIN_DUR_MS, nextEnd);
            if (nextEnd >= endMs) continue;

            zhList[i] = { ...z, endMs: nextEnd };
            capped += 1;

            // Keep JA bilingual timing in sync when same start
            if (hit && Number(hit.endMs) > nextEnd) {
                const ji = jaList.indexOf(hit);
                if (ji >= 0) {
                    jaList[ji] = { ...hit, endMs: nextEnd };
                }
            } else if (
                i < jaList.length
                && Math.abs((Number(jaList[i]?.startMs) || 0) - startMs) <= 120
                && Number(jaList[i]?.endMs) > nextEnd
            ) {
                jaList[i] = { ...jaList[i], endMs: nextEnd };
            }
        }

        // Also cap JA-only moan islands that have no ZH twin (rare after rematerialize)
        for (let i = 0; i < jaList.length; i += 1) {
            const j = jaList[i];
            const startMs = Number(j?.startMs);
            const endMs = j?.endMs != null ? Number(j.endMs) : startMs;
            const dur = Math.max(0, endMs - startMs);
            if (!Number.isFinite(startMs) || dur <= MIN_DUR_MS) continue;
            const cap = resolveCueDurationCapMs('', j?.text, options);
            if (cap == null || dur <= cap) continue;
            let nextEnd = startMs + cap;
            if (i + 1 < jaList.length) {
                const ns = Number(jaList[i + 1]?.startMs);
                if (Number.isFinite(ns) && ns > startMs) nextEnd = Math.min(nextEnd, ns - 20);
            }
            nextEnd = Math.max(startMs + MIN_DUR_MS, nextEnd);
            if (nextEnd >= endMs) continue;
            jaList[i] = { ...j, endMs: nextEnd };
            capped += 1;
        }

        return {
            cues: zhList,
            sourceCues: jaList,
            capped,
            changed: capped > 0,
        };
    }

    return {
        DEFAULT_FILLER_MAX_MS,
        DEFAULT_MOAN_MAX_MS,
        DEFAULT_SHORT_TEXT_MAX_MS,
        resolveCueDurationCapMs,
        capFillerMoanCueDurations,
    };
}));
