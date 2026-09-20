/**
 * Detect JA/ZH index vs startMs drift and realign translations onto source timeline.
 * EBWH-365/363: starts still match as a set, but index order drifts after ~20–50 cues.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSmartTranslateAlign = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function smartTranslateAlignFactory() {
    function loadCreditCore() {
        try {
            return (typeof module !== 'undefined' && module.exports)
                ? require('./subtitle-software-credit-core')
                : (typeof globalThis !== 'undefined' ? globalThis.TransubSubtitleSoftwareCredit : null);
        } catch {
            return null;
        }
    }

    function loadSanitize() {
        try {
            return (typeof module !== 'undefined' && module.exports)
                ? require('./mt-sanitize-core')
                : (typeof globalThis !== 'undefined' ? globalThis.TransubMtSanitize : null);
        } catch {
            return null;
        }
    }

    function isCreditCue(c) {
        const credit = loadCreditCore();
        const t = String(c?.text ?? '');
        if (credit?.isSoftwareCreditText?.(t)) return true;
        return /Transub|字幕由|字幕は/.test(t);
    }

    function stripCreditHead(cues) {
        const list = Array.isArray(cues) ? cues : [];
        if (!list.length) return list;
        if (isCreditCue(list[0])) return list.slice(1);
        return list;
    }

    function cueStartMs(c) {
        const n = Number(c?.startMs);
        if (Number.isFinite(n)) return Math.round(n);
        return 0;
    }

    /**
     * @returns {{
     *   total: number,
     *   same: number,
     *   sameRate: number,
     *   firstBreak: number,
     *   startOverlap: number,
     *   startOverlapRate: number,
     *   jaCount: number,
     *   zhCount: number,
     * }}
     */
    function measureIndexStartAlignment(sourceCues, translatedCues) {
        const ja = stripCreditHead(sourceCues);
        const zh = stripCreditHead(translatedCues);
        const n = Math.min(ja.length, zh.length);
        let same = 0;
        let firstBreak = -1;
        for (let i = 0; i < n; i += 1) {
            const js = cueStartMs(ja[i]);
            const zs = cueStartMs(zh[i]);
            if (js === zs) {
                same += 1;
            } else if (firstBreak < 0) {
                firstBreak = i;
            }
        }
        const jaStarts = new Set(ja.map((c) => cueStartMs(c)));
        const zhStarts = new Set(zh.map((c) => cueStartMs(c)));
        let overlap = 0;
        for (const s of zhStarts) {
            if (jaStarts.has(s)) overlap += 1;
        }
        const zhTimed = [...zhStarts].filter((s) => s > 0).length || zhStarts.size;
        return {
            total: n,
            same,
            sameRate: n ? same / n : 1,
            firstBreak,
            startOverlap: overlap,
            startOverlapRate: zhTimed ? overlap / Math.max(1, zhStarts.size) : 0,
            jaCount: ja.length,
            zhCount: zh.length,
        };
    }

    /**
     * EBWH-style: high start-set overlap but index pairing breaks early and never recovers.
     */
    function shouldRealignByStartMs(measureOrSource, translatedCues) {
        const m = (measureOrSource && typeof measureOrSource === 'object' && 'sameRate' in measureOrSource)
            ? measureOrSource
            : measureIndexStartAlignment(measureOrSource, translatedCues);
        if (!m || m.total < 24) return false;
        if (m.startOverlapRate < 0.72) return false;
        if (m.sameRate >= 0.92) return false;
        const earlyBreak = m.firstBreak >= 0
            && m.firstBreak <= Math.max(18, Math.floor(m.total * 0.12));
        if (earlyBreak && m.sameRate < 0.9) return true;
        if (m.sameRate < 0.72 && m.startOverlapRate >= 0.85) return true;
        // Mid/late index break with collapsed same-rate (MFYD-186 ~cue 467+)
        if (
            m.firstBreak >= 0
            && m.sameRate < 0.55
            && m.startOverlapRate >= 0.9
            && m.total >= 48
        ) {
            return true;
        }
        return false;
    }

    /**
     * Copy source timing onto translated cues when ZH lacks timing, then realign if needed.
     * Online smart-translate historically dropped startMs — restore before gate.
     * When ZH already carries a timeline (file sanitize), keep those starts so drift is visible.
     */
    function realignIfNeeded(sourceCues, translatedCues, options = {}) {
        const srcList = Array.isArray(sourceCues) ? sourceCues : [];
        const zhIn = Array.isArray(translatedCues) ? translatedCues : [];
        const byIndex = new Map();
        for (const c of zhIn) {
            const idx = Number.isInteger(Number(c?.index)) ? Number(c.index) : null;
            if (idx != null) byIndex.set(idx, c);
        }
        const zhTimed = zhIn.filter((c) => {
            const n = Number(c?.startMs);
            return Number.isFinite(n) && n > 0;
        }).length;
        const zhHasTimeline = zhTimed >= Math.min(24, Math.max(8, Math.floor(srcList.length * 0.4)));

        const withTiming = srcList.map((s, i) => {
            const idx = Number.isInteger(Number(s?.index)) ? Number(s.index) : i;
            const hit = byIndex.has(idx) ? byIndex.get(idx) : zhIn[i];
            const hitStart = Number(hit?.startMs);
            const keepZhStart = zhHasTimeline && Number.isFinite(hitStart);
            return {
                ...(hit && typeof hit === 'object' ? hit : {}),
                index: idx,
                startMs: keepZhStart ? hitStart : s.startMs,
                endMs: keepZhStart && Number.isFinite(Number(hit?.endMs)) ? hit.endMs : s.endMs,
                text: hit != null ? String(hit.text ?? '') : '',
            };
        });
        return realignTranslatedCuesByStartMs(srcList, withTiming, options);
    }

    /**
     * Rebuild ZH in JA order by exact startMs (then fall back to rematerialize helper).
     * @returns {{ cues: object[], changed: boolean, realigned: number, measure: object, mode?: string }}
     */
    function realignTranslatedCuesByStartMs(sourceCues, translatedCues, options = {}) {
        const srcList = Array.isArray(sourceCues) ? sourceCues : [];
        const zhList = Array.isArray(translatedCues) ? translatedCues : [];
        const measure = measureIndexStartAlignment(srcList, zhList);
        const force = options.force === true;
        if (!force && !shouldRealignByStartMs(measure)) {
            return {
                cues: zhList.map((c) => ({ ...c })),
                changed: false,
                realigned: 0,
                measure,
            };
        }

        const sanitize = loadSanitize();
        if (sanitize?.rematerializeTranslatedOntoSource) {
            const laid = sanitize.rematerializeTranslatedOntoSource(srcList, zhList, {
                blankText: options.blankText != null ? String(options.blankText) : '',
                preferIndex: false,
                fillFromSource: options.fillFromSource === true,
                mergeContainedFragments: false,
            });
            // Count how many index slots actually moved text vs prior index pairing
            let realigned = 0;
            const prevByIndex = new Map();
            for (let i = 0; i < zhList.length; i += 1) {
                const idx = Number.isInteger(Number(zhList[i]?.index)) ? Number(zhList[i].index) : i;
                prevByIndex.set(idx, String(zhList[i]?.text ?? ''));
            }
            for (let i = 0; i < (laid.cues || []).length; i += 1) {
                const c = laid.cues[i];
                const idx = Number.isInteger(Number(c?.index)) ? Number(c.index) : i;
                const prev = prevByIndex.has(idx)
                    ? prevByIndex.get(idx)
                    : String(zhList[i]?.text ?? '');
                if (String(c?.text ?? '') !== prev) realigned += 1;
            }
            return {
                cues: laid.cues || zhList,
                changed: realigned > 0 || !!laid.changed,
                realigned: realigned || Number(laid.changed) || 0,
                measure,
                mode: laid.mode || 'startMs',
            };
        }

        // Fallback local exact-start map
        const byStart = new Map();
        for (const c of zhList) {
            const sm = cueStartMs(c);
            const text = String(c?.text ?? '');
            if (!byStart.has(sm) || (text.trim() && !String(byStart.get(sm) || '').trim())) {
                byStart.set(sm, text);
            }
        }
        const blankText = options.blankText != null ? String(options.blankText) : '';
        let realigned = 0;
        const cues = srcList.map((s, i) => {
            const idx = Number.isInteger(Number(s?.index)) ? Number(s.index) : i;
            const sm = cueStartMs(s);
            const text = byStart.has(sm) ? byStart.get(sm) : blankText;
            const prev = String(zhList[i]?.text ?? '');
            if (text !== prev) realigned += 1;
            return {
                index: idx,
                startMs: s.startMs,
                endMs: s.endMs,
                text,
            };
        });
        return {
            cues,
            changed: realigned > 0,
            realigned,
            measure,
            mode: 'startMs-local',
        };
    }

    return {
        isCreditCue,
        stripCreditHead,
        measureIndexStartAlignment,
        shouldRealignByStartMs,
        realignTranslatedCuesByStartMs,
        realignIfNeeded,
    };
}));
