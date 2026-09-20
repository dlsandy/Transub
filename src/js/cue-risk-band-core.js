/**
 * Cue risk banding: green / yellow / red from ASR confidence + SO risk heuristics.
 */
(function (global, factory) {
    const soCore = (typeof module !== 'undefined' && module.exports)
        ? require('./asr-second-opinion-core')
        : (global && global.TransubAsrSecondOpinion);
    const api = factory(soCore);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubCueRiskBand = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function cueRiskBandFactory(soCore) {
    const BAND_GREEN = 'green';
    const BAND_YELLOW = 'yellow';
    const BAND_RED = 'red';

    /** Below this → red when also risky / halluc / empty. */
    const RED_CONF_THRESHOLD = 0.35;
    /** Below this (or sidecar low) → at least yellow. */
    const YELLOW_CONF_THRESHOLD = 0.55;

    function annotationForIndex(annotations, index) {
        if (!annotations) return {};
        if (Array.isArray(annotations)) return annotations[index] || {};
        if (typeof annotations.get === 'function') {
            return annotations.get(index) || annotations.get(String(index)) || {};
        }
        if (Object.prototype.hasOwnProperty.call(annotations, index)) return annotations[index] || {};
        if (Object.prototype.hasOwnProperty.call(annotations, String(index))) {
            return annotations[String(index)] || {};
        }
        return {};
    }

    function resolveConfidence(ann, cue) {
        const fromAnn = Number(ann?.confidence);
        if (Number.isFinite(fromAnn)) return fromAnn;
        const fromCue = Number(cue?.confidence ?? cue?.asrConfidence ?? cue?.meta?.confidence);
        return Number.isFinite(fromCue) ? fromCue : null;
    }

    function hasHallucFlags(ann) {
        const flags = Array.isArray(ann?.flags) ? ann.flags.map(String) : [];
        return flags.some((f) => /hallucin|repetition|duplicate|stutter/i.test(f));
    }

    /**
     * @returns {{ band: 'green'|'yellow'|'red', reasons: string[], confidence: number|null, index: number }}
     */
    function bandCueAtIndex(cues, index, annotations, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const cue = list[index] || {};
        const ann = annotationForIndex(annotations, index);
        const text = String(cue?.text ?? cue?.sourceText ?? '').trim();
        const conf = resolveConfidence(ann, cue);
        const reasons = [];
        const redConf = Math.max(0.05, Math.min(0.9, Number(options.redConfThreshold) || RED_CONF_THRESHOLD));
        const yellowConf = Math.max(
            redConf,
            Math.min(0.95, Number(options.yellowConfThreshold) || YELLOW_CONF_THRESHOLD),
        );

        const hallucFlag = hasHallucFlags(ann);
        const scrap = !!soCore?.isScrapOrLoopText?.(text);
        if (hallucFlag) reasons.push('halluc_flag');
        if (scrap) reasons.push('scrap_or_loop');

        const empty = !text;
        if (empty) reasons.push('empty');

        const veryLow = Number.isFinite(conf) && conf < redConf;
        const low = ann?.low === true
            || (Number.isFinite(conf) && conf < yellowConf);
        if (veryLow) reasons.push('very_low_conf');
        else if (low) reasons.push('low_conf');

        const riskCue = !!soCore?.isSecondOpinionRiskCue?.(text, ann, options);
        // Red: empty, scrap/halluc, or very-low + risk
        if (empty || hallucFlag || scrap || (veryLow && riskCue)) {
            if (!reasons.length) reasons.push('red');
            return {
                band: BAND_RED,
                reasons: [...new Set(reasons)],
                confidence: conf,
                index,
            };
        }

        if (low || (riskCue && Number.isFinite(conf) && conf < 0.65)) {
            if (!reasons.includes('low_conf') && !reasons.includes('risk')) reasons.push('risk');
            return {
                band: BAND_YELLOW,
                reasons: [...new Set(reasons.length ? reasons : ['yellow'])],
                confidence: conf,
                index,
            };
        }

        return {
            band: BAND_GREEN,
            reasons: [],
            confidence: conf,
            index,
        };
    }

    /**
     * @returns {{
     *   bands: Array<{ band: string, reasons: string[], confidence: number|null, index: number }>,
     *   byIndex: Record<number, string>,
     *   summary: { green: number, yellow: number, red: number, total: number },
     *   redIndexes: number[],
     *   yellowIndexes: number[],
     * }}
     */
    function bandCues(cues, annotations, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const bands = [];
        const byIndex = {};
        const summary = { green: 0, yellow: 0, red: 0, total: list.length };
        const redIndexes = [];
        const yellowIndexes = [];
        for (let i = 0; i < list.length; i += 1) {
            const row = bandCueAtIndex(list, i, annotations, options);
            bands.push(row);
            byIndex[i] = row.band;
            if (row.band === BAND_RED) {
                summary.red += 1;
                redIndexes.push(i);
            } else if (row.band === BAND_YELLOW) {
                summary.yellow += 1;
                yellowIndexes.push(i);
            } else {
                summary.green += 1;
            }
        }
        return { bands, byIndex, summary, redIndexes, yellowIndexes };
    }

    /**
     * Prefer red then yellow indexes when filling a capped SO quota.
     * @returns {number[]}
     */
    function prioritizeIndexesByBand(indexes, bandByIndex, maxCount) {
        const max = Math.max(0, Math.min(500, Number(maxCount) || 0));
        const list = [...new Set((Array.isArray(indexes) ? indexes : [])
            .map((n) => Number(n))
            .filter((n) => Number.isInteger(n) && n >= 0))];
        const red = [];
        const yellow = [];
        const other = [];
        for (const idx of list) {
            const b = bandByIndex?.[idx] ?? bandByIndex?.[String(idx)];
            if (b === BAND_RED) red.push(idx);
            else if (b === BAND_YELLOW) yellow.push(idx);
            else other.push(idx);
        }
        const ordered = [...red.sort((a, b) => a - b), ...yellow.sort((a, b) => a - b), ...other.sort((a, b) => a - b)];
        return max > 0 ? ordered.slice(0, max) : ordered;
    }

    return {
        BAND_GREEN,
        BAND_YELLOW,
        BAND_RED,
        RED_CONF_THRESHOLD,
        YELLOW_CONF_THRESHOLD,
        bandCueAtIndex,
        bandCues,
        prioritizeIndexesByBand,
    };
}));
