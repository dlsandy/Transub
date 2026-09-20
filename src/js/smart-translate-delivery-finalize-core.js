/**
 * Delivery finalize: JA timeline is source of truth.
 * Cull orphan ZH, realign by startMs, recycle-scrub, prune ASR garbage, det-fill blanks.
 * Pure helpers (no disk I/O) — electron postprocess writes the result.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSmartTranslateDeliveryFinalize = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function deliveryFinalizeFactory() {
    function loadAlign() {
        try {
            return require('./smart-translate-align-core');
        } catch {
            return null;
        }
    }

    function loadSanitize() {
        try {
            return require('./mt-sanitize-core');
        } catch {
            return null;
        }
    }

    function loadRecycle() {
        try {
            return require('./smart-translate-recycle-guard-core');
        } catch {
            return null;
        }
    }

    /**
     * @param {object[]} sourceCues JA
     * @param {object[]} translatedCues ZH
     * @param {{ blankText?: string, pruneDebris?: boolean, scrubRecycle?: boolean, fillBlank?: boolean }} [options]
     * @returns {{
     *   cues: object[],
     *   sourceCues: object[],
     *   changed: boolean,
     *   rematerialized: number,
     *   realigned: number,
     *   scrubbed: number,
     *   pruned: number,
     *   filled: number,
     *   measure: object|null,
     *   gateOk: boolean,
     *   flags: object,
     * }}
     */
    function finalizeDeliveryCues(sourceCues, translatedCues, options = {}) {
        const srcIn = Array.isArray(sourceCues) ? sourceCues : [];
        let zhIn = Array.isArray(translatedCues) ? translatedCues : [];
        const blankText = options.blankText != null ? String(options.blankText) : '…';
        const flags = {};
        let rematerialized = 0;
        let realigned = 0;
        let scrubbed = 0;
        let pruned = 0;
        let filled = 0;
        let srcOut = srcIn.map((c) => ({ ...c }));
        let zhOut = zhIn.map((c) => ({ ...c }));

        const sanitize = loadSanitize();
        const align = loadAlign();
        const recycle = loadRecycle();

        // 1) Rematerialize onto JA timeline when counts differ or starts badly drift.
        //    Skip mild drift when index↔start already agree — rematerialize + blankText「…」
        //    was wiping hybrid GalTransl tracks after JA debris prune.
        try {
            const measure0 = align?.measureIndexStartAlignment?.(srcOut, zhOut) || null;
            const countDiff = Math.abs(zhOut.length - srcOut.length) >= 1;
            const badlyDrifted = measure0
                && measure0.total >= 8
                && measure0.sameRate < 0.72
                && measure0.startOverlapRate >= 0.55;
            const driftFlag = align?.shouldRealignByStartMs?.(measure0 || srcOut, zhOut) === true;
            const drift = badlyDrifted || (driftFlag && (!measure0 || measure0.sameRate < 0.85));
            if (
                sanitize?.rematerializeTranslatedOntoSource
                && srcOut.length
                && (countDiff || drift || options.forceRematerialize === true)
            ) {
                const laid = sanitize.rematerializeTranslatedOntoSource(srcOut, zhOut, {
                    blankText,
                    preferIndex: false,
                    fillFromSource: false,
                    mergeContainedFragments: false,
                });
                if (Array.isArray(laid?.cues) && laid.cues.length) {
                    const before = zhOut.length;
                    const blankOf = (list) => (Array.isArray(list) ? list : []).filter((c) => {
                        const t = String(c?.text ?? '').trim();
                        return !t || t === blankText || /^(?:…|\.{3}|⋯)+$/.test(t);
                    }).length;
                    const blanksBefore = blankOf(zhOut);
                    const blanksAfter = blankOf(laid.cues);
                    const minted = blanksAfter - blanksBefore;
                    // Abort rematerialize if it would mint mass 「…」 (credit soft-zip / drift).
                    if (
                        laid.cues.length >= 8
                        && minted > Math.ceil(laid.cues.length * 0.25)
                        && blanksAfter / laid.cues.length > 0.35
                    ) {
                        flags.rematerialize_aborted = minted;
                    } else {
                        zhOut = laid.cues;
                        const laidChanged = Number(laid.changed);
                        if (Number.isFinite(laidChanged) && laidChanged > 0) {
                            rematerialized = laidChanged;
                        } else if (before !== zhOut.length) {
                            rematerialized = Math.abs(before - zhOut.length);
                        } else {
                            rematerialized = 0;
                        }
                        flags.rematerialize = rematerialized;
                        flags.rematerializeMode = laid.mode || 'startMs';
                    }
                }
            }
        } catch { /* optional */ }

        // 2) Explicit realign helper (attaches timing when ZH lacked it)
        try {
            if (align?.realignIfNeeded) {
                const laid = align.realignIfNeeded(srcOut, zhOut, { blankText });
                if (laid?.changed && Array.isArray(laid.cues)) {
                    zhOut = laid.cues;
                    realigned = Number(laid.realigned) || laid.cues.length;
                    flags.realign = realigned;
                }
            } else if (align?.realignTranslatedCuesByStartMs) {
                const laid = align.realignTranslatedCuesByStartMs(srcOut, zhOut, { blankText });
                if (laid?.changed && Array.isArray(laid.cues)) {
                    zhOut = laid.cues;
                    realigned = Number(laid.realigned) || laid.cues.length;
                    flags.realign = realigned;
                }
            }
        } catch { /* optional */ }

        // 3) Recycle scrub — but never mass-blank a hybrid track into 「…」.
        //    If scrub would clear >20% of cues, keep originals (blank recover cannot
        //    faithfully restore GalTransl sentence MT).
        if (options.scrubRecycle !== false && recycle?.scrubTrackRecycledTranslations) {
            try {
                const scrub = recycle.scrubTrackRecycledTranslations(zhOut, srcOut, { blankText });
                const scrubN = Number(scrub.scrubbed) || 0;
                const totalN = Math.max(1, zhOut.length);
                // Mass-blank guard for large hybrid tracks; small queues may scrub 1–2 cues
                // even when that is >20% (e.g. 1/3 recycle paste).
                const scrubRatio = scrubN / totalN;
                if (scrubN > 0 && (scrubRatio <= 0.2 || (scrubN <= 2 && scrubRatio <= 0.5))) {
                    zhOut = scrub.cues;
                    scrubbed = scrubN;
                    flags.recycle_scrub = scrubbed;
                } else if (scrubN > 0) {
                    flags.recycle_scrub_skipped = scrubN;
                }
            } catch { /* optional */ }
        }

        // 4) Hard-drop Whisper garbage / moan pairs (both lists)
        if (options.pruneDebris !== false && sanitize?.pruneAsrDebrisCuePairs) {
            try {
                const prunedPairs = sanitize.pruneAsrDebrisCuePairs(zhOut, srcOut, {
                    renumberIndexes: false,
                    // Blank in place by default so JA timeline length stays stable.
                    preserveSourceSlots: options.preserveSourceSlots !== false,
                });
                if (prunedPairs.dropped > 0) {
                    zhOut = prunedPairs.cues;
                    if (Array.isArray(prunedPairs.sourceCues) && prunedPairs.sourceCues.length) {
                        srcOut = prunedPairs.sourceCues;
                    }
                    pruned = prunedPairs.dropped;
                    flags.prune_debris = pruned;
                }
            } catch { /* optional */ }
        }

        // 5) Deterministic blank fill (LLM blank-retry runs separately in engine)
        if (options.fillBlank !== false && sanitize?.fillBlankZhSlotsFromJa) {
            try {
                const fill = sanitize.fillBlankZhSlotsFromJa(zhOut, srcOut, { blankText });
                if (fill.filled > 0) {
                    zhOut = fill.cues;
                    filled = fill.filled;
                    flags.fill_blank = filled;
                }
            } catch { /* optional */ }
        }

        const measure = align?.measureIndexStartAlignment?.(srcOut, zhOut) || null;
        const gateOk = !measure
            || measure.total < 24
            || measure.sameRate >= 0.85
            || measure.startOverlapRate < 0.5;
        flags.gateOk = gateOk;
        if (measure) {
            flags.sameRate = measure.sameRate;
            flags.startOverlapRate = measure.startOverlapRate;
            flags.firstBreak = measure.firstBreak;
        }

        const changed = rematerialized > 0 || realigned > 0 || scrubbed > 0 || pruned > 0 || filled > 0
            || zhOut.length !== zhIn.length;
        return {
            cues: zhOut,
            sourceCues: srcOut,
            changed,
            rematerialized,
            realigned,
            scrubbed,
            pruned,
            filled,
            measure,
            gateOk,
            flags,
        };
    }

    return {
        finalizeDeliveryCues,
    };
}));
