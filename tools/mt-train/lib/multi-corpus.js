'use strict';

/**
 * Build a multi-title cue corpus for cross-film collateral estimates.
 */
const { estimateCollateral } = require('./auto-quality');

/**
 * @param {Array<{ code: string, jaPath: string, zhPath: string }>} titles
 * @param {(ja: string, zh: string, o?: object) => object} scanPair
 * @param {{
 *   maxTitles?: number,
 *   maxCues?: number,
 *   excludeCode?: string,
 *   contentProfile?: string,
 * }} [opts]
 */
function buildMultiTitleCorpus(titles, scanPair, opts = {}) {
    const maxTitles = Math.min(24, Math.max(1, Number(opts.maxTitles) || 8));
    const maxCues = Math.min(8000, Math.max(200, Number(opts.maxCues) || 2500));
    const exclude = String(opts.excludeCode || '').trim().toUpperCase();
    const list = (Array.isArray(titles) ? titles : [])
        .filter((t) => t && t.jaPath && t.zhPath)
        .filter((t) => !exclude || String(t.code || '').toUpperCase() !== exclude)
        .slice(0, maxTitles);

    /** @type {Array<{ code: string, cues: object[] }>} */
    const byTitle = [];
    /** @type {object[]} */
    const flat = [];
    let cueCount = 0;

    for (let i = 0; i < list.length; i += 1) {
        if (cueCount >= maxCues) break;
        const t = list[i];
        let scan;
        try {
            scan = scanPair(t.jaPath, t.zhPath, {
                contentProfile: opts.contentProfile || 'av_soft',
                reload: i === 0 && opts.reload !== false,
            });
        } catch (_) {
            continue;
        }
        const cues = [];
        for (const c of scan.clusters || []) {
            for (const s of c.samples || []) {
                const row = {
                    ...s,
                    title: t.code,
                    code: t.code,
                    ji: `${t.code}:${s.ji}`,
                };
                cues.push(row);
                flat.push(row);
                cueCount += 1;
                if (cueCount >= maxCues) break;
            }
            if (cueCount >= maxCues) break;
        }
        // also include sampleFixes so stable cues participate in collateral
        for (const f of scan.sampleFixes || []) {
            if (cueCount >= maxCues) break;
            const row = {
                ji: `${t.code}:fix:${f.ji}`,
                src: f.src,
                dst: f.before,
                after: f.after,
                title: t.code,
                code: t.code,
            };
            cues.push(row);
            flat.push(row);
            cueCount += 1;
        }
        byTitle.push({ code: t.code, cues, liveHitCount: scan.liveHitCount || 0 });
    }

    return {
        byTitle,
        corpus: flat,
        titleCount: byTitle.length,
        cueCount: flat.length,
        codes: byTitle.map((t) => t.code),
    };
}

/**
 * Cross-title collateral: how many cues / titles a rule would change outside the training film.
 * @param {object} payload
 * @param {{ byTitle?: Array<{ code: string, cues: object[] }>, corpus?: object[] }} multi
 */
function estimateCrossTitleCollateral(payload, multi = {}) {
    const byTitle = Array.isArray(multi.byTitle) ? multi.byTitle : [];
    if (!byTitle.length && Array.isArray(multi.corpus) && multi.corpus.length) {
        // flat corpus without title buckets — treat as one bucket
        const col = estimateCollateral(payload, multi.corpus, { targetJis: [] });
        const corpusSize = multi.corpus.length;
        const ratio = corpusSize ? col.totalHits / corpusSize : 0;
        return {
            titleCount: 0,
            titlesHit: col.totalHits > 0 ? 1 : 0,
            totalHits: col.totalHits,
            corpusSize,
            ratio,
            perTitle: [],
            risky: ratio > 0.08 || col.totalHits > 40,
        };
    }

    let totalHits = 0;
    let corpusSize = 0;
    let titlesHit = 0;
    const perTitle = [];
    for (const t of byTitle) {
        const cues = t.cues || [];
        corpusSize += cues.length;
        const col = estimateCollateral(payload, cues, { targetJis: [] });
        if (col.totalHits > 0) {
            titlesHit += 1;
            totalHits += col.totalHits;
            perTitle.push({ code: t.code, hits: col.totalHits });
        }
    }
    perTitle.sort((a, b) => b.hits - a.hits);
    const ratio = corpusSize ? totalHits / corpusSize : 0;
    // High absolute hits or high ratio across films → likely over-broad
    const risky = totalHits > 25 || ratio > 0.06 || (titlesHit >= 4 && totalHits > 12);
    return {
        titleCount: byTitle.length,
        titlesHit,
        totalHits,
        corpusSize,
        ratio,
        perTitle: perTitle.slice(0, 8),
        risky,
    };
}

module.exports = {
    buildMultiTitleCorpus,
    estimateCrossTitleCollateral,
};
