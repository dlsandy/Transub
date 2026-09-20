/**
 * Pre-MT QC gate: timing/structure on source + risk bands → holdIndexes (do not translate).
 * Does not use fluency/weird as hard gate.
 */
(function (global, factory) {
    const qcCore = (typeof module !== 'undefined' && module.exports)
        ? require('./subtitle-qc-core')
        : (global && global.TransubSubtitleQc);
    const bandCore = (typeof module !== 'undefined' && module.exports)
        ? require('./cue-risk-band-core')
        : (global && global.TransubCueRiskBand);
    const api = factory(qcCore, bandCore);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubPreMtQcGate = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function preMtQcGateFactory(qcCore, bandCore) {
    const HARD_QC_TYPES = new Set(['invalid', 'overlap', 'short', 'long', 'duplicate']);

    function toEngineLikeCues(cues) {
        return (Array.isArray(cues) ? cues : []).map((c, i) => {
            let startMs = Number(c?.startMs);
            let endMs = Number(c?.endMs);
            if (!Number.isFinite(startMs)) {
                const s = Number(c?.start ?? c?.startSec);
                startMs = Number.isFinite(s) ? Math.round(s * 1000) : 0;
            }
            if (!Number.isFinite(endMs)) {
                const e = Number(c?.end ?? c?.endSec);
                endMs = Number.isFinite(e) ? Math.round(e * 1000) : startMs + 1000;
            }
            return {
                ...c,
                index: Number.isInteger(Number(c?.index)) ? Number(c.index) : i,
                startMs,
                endMs,
                text: String(c?.text ?? c?.sourceText ?? ''),
            };
        });
    }

    /**
     * @param {object[]} cues - source cues
     * @param {object} [options]
     * @param {object} [options.bandResult] - from bandCues; computed if missing + annotations
     * @param {object|array} [options.annotations]
     * @returns {{
     *   allowMt: boolean,
     *   holdIndexes: number[],
     *   softWarnings: string[],
     *   bandSummary: object,
     *   structureIssueCount: number,
     *   reason: string,
     * }}
     */
    function evaluatePreMtQcGate(cues, options = {}) {
        const list = toEngineLikeCues(cues);
        const softWarnings = [];
        let bandResult = options.bandResult;
        if (!bandResult && bandCore?.bandCues) {
            bandResult = bandCore.bandCues(list, options.annotations, options);
        }
        const redIndexes = [...(bandResult?.redIndexes || [])];
        const yellowIndexes = [...(bandResult?.yellowIndexes || [])];
        const bandSummary = bandResult?.summary || {
            green: 0,
            yellow: yellowIndexes.length,
            red: redIndexes.length,
            total: list.length,
        };

        const hold = new Set(redIndexes.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0));

        let structureIssueCount = 0;
        if (qcCore?.scanCueIssues && list.length) {
            const scanned = qcCore.scanCueIssues(list, {
                ...(options.qcOptions || {}),
                // Soft: skip fluency/weird as hard holds
                checkFluency: false,
                checkWeird: false,
            });
            const issues = Array.isArray(scanned?.issues) ? scanned.issues
                : (Array.isArray(scanned) ? scanned : []);
            for (const issue of issues) {
                const idx = Number(issue?.index);
                if (!Number.isInteger(idx) || idx < 0) continue;
                const types = Array.isArray(issue.types) ? issue.types : [];
                const hard = types.some((t) => HARD_QC_TYPES.has(String(t)));
                if (hard) {
                    structureIssueCount += 1;
                    // Structural mess on a cue → hold rather than refuse whole film
                    if (types.includes('invalid') || types.includes('duplicate')) {
                        hold.add(idx);
                    } else {
                        softWarnings.push(`structure:${types.join('+')}@${idx}`);
                    }
                }
            }
        }

        if (yellowIndexes.length) {
            softWarnings.push(`yellow_cues:${yellowIndexes.length}`);
        }
        if (redIndexes.length) {
            softWarnings.push(`red_hold:${redIndexes.length}`);
        }

        const holdIndexes = [...hold].sort((a, b) => a - b);
        // Refuse entire MT only when almost nothing is usable
        const usable = list.length - holdIndexes.length;
        const allowMt = list.length === 0 || usable > 0;
        let reason = 'ok';
        if (!list.length) reason = 'empty_source';
        else if (!allowMt) reason = 'all_held';
        else if (holdIndexes.length) reason = 'partial_hold';

        return {
            allowMt,
            holdIndexes,
            softWarnings,
            bandSummary,
            structureIssueCount,
            reason,
        };
    }

    return {
        HARD_QC_TYPES,
        toEngineLikeCues,
        evaluatePreMtQcGate,
    };
}));
