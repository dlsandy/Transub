'use strict';

const path = require('path');
const { parseSrt, alignCues, textLen } = require('./srt');
const { classifyIssues, clusterHits } = require('./clusters');

const SANITIZE_PATH = path.resolve(__dirname, '../../../src/js/mt-sanitize-core.js');
const OPAQUE_PATH = path.resolve(__dirname, '../../../src/js/mt-opaque-strings.js');

/** Drop cached sanitize modules so training edits apply without restarting the server. */
function reloadSanitize() {
    try { delete require.cache[require.resolve(OPAQUE_PATH)]; } catch (_) { /* ignore */ }
    try { delete require.cache[require.resolve(SANITIZE_PATH)]; } catch (_) { /* ignore */ }
    // mt-sanitize-core may pull other local deps; clear siblings under src/js that are cached
    for (const key of Object.keys(require.cache)) {
        if (key.includes(`${path.sep}src${path.sep}js${path.sep}`) && /mt-|ja-names|fluency|advanced-smart/.test(key)) {
            delete require.cache[key];
        }
    }
    return require(SANITIZE_PATH);
}

function getSanitize(reload = false) {
    if (reload) return reloadSanitize();
    try {
        return require(SANITIZE_PATH);
    } catch (_) {
        return reloadSanitize();
    }
}

/**
 * Time-align JA/ZH SRTs, run sanitize, cluster residuals.
 * @param {object} [options]
 * @param {boolean} [options.reload=true] hot-reload sanitize modules
 * @param {number} [options.maxSampleFixes=40]
 * @param {number} [options.maxHitsPerCluster=60]
 */
function scanPair(jaPath, zhPath, options = {}) {
    const tolMs = Number(options.tolMs) > 0 ? Number(options.tolMs) : 1200;
    const contentProfile = options.contentProfile || 'av_soft';
    const reload = options.reload !== false;
    const maxSampleFixes = Number(options.maxSampleFixes) > 0 ? Number(options.maxSampleFixes) : 40;
    const sanitize = getSanitize(reload);

    const ja = parseSrt(jaPath);
    const zh = parseSrt(zhPath);
    const pairs = alignCues(ja, zh, tolMs);

    let changed = 0;
    let asrChanged = 0;
    const hits = [];
    const sampleFixes = [];

    for (const p of pairs) {
        const asr = sanitize.correctJaAsrDomainMishears(p.src);
        const senseSrc = asr.changed ? asr.text : p.src;
        if (asr.changed) asrChanged += 1;

        // Domain fixes see ASR-corrected JA (same as batch sanitize path)
        const r = sanitize.sanitizeMtCueText(p.dst, senseSrc, { contentProfile });
        if (r.text !== p.dst) {
            changed += 1;
            if (sampleFixes.length < maxSampleFixes) {
                sampleFixes.push({
                    ji: p.ji,
                    src: p.src,
                    asr: asr.changed ? asr.text : undefined,
                    before: p.dst,
                    after: r.text,
                    flags: r.flags,
                });
            }
        }

        const issuesAfter = classifyIssues(senseSrc, p.dst, r.text);
        const issuesBefore = classifyIssues(senseSrc, p.dst, p.dst);
        if (
            !issuesAfter.includes('align_suspect')
            && textLen(p.src) <= 5
            && textLen(r.text) >= 12
            && /^[ぁ-んァ-ン…・っッ!！?？\s]+$/u.test(p.src)
            && !r.flags.includes('wet_sfx')
        ) {
            issuesAfter.push('moan_expand');
        }

        let issues = issuesAfter.slice();
        if (!issues.length && issuesBefore.length) {
            const fixed = issuesBefore.filter((k) => k !== 'align_suspect' && k !== 'moan_expand');
            if (fixed.length && r.text !== p.dst) {
                issues = fixed.map((k) => `fixed:${k}`);
            }
        }

        if (issues.length) {
            hits.push({
                ji: p.ji,
                zi: p.zi,
                d: p.d,
                time: p.time,
                src: p.src,
                asr: asr.changed ? asr.text : undefined,
                dst: p.dst,
                after: r.text,
                flags: r.flags,
                issues,
                changed: r.text !== p.dst,
            });
        }
    }

    const clusters = clusterHits(hits, {
        maxPerCluster: Number(options.maxHitsPerCluster) > 0 ? Number(options.maxHitsPerCluster) : 60,
    });
    const liveClusters = clusters.filter(
        (c) => c.cluster !== 'align_suspect'
            && c.cluster !== 'moan_expand'
            && !String(c.cluster).startsWith('fixed:'),
    );
    const softClusters = clusters.filter(
        (c) => c.cluster === 'align_suspect'
            || c.cluster === 'moan_expand'
            || String(c.cluster).startsWith('fixed:'),
    );

    return {
        jaPath,
        zhPath,
        jaCount: ja.length,
        zhCount: zh.length,
        aligned: pairs.length,
        changed,
        asrChanged,
        hitCount: hits.length,
        liveHitCount: liveClusters.reduce((n, c) => n + c.n, 0),
        softHitCount: softClusters.reduce((n, c) => n + c.n, 0),
        clusters,
        highConfidenceCount: liveClusters.reduce((n, c) => n + c.n, 0),
        sampleFixes,
        reloaded: reload,
        summary: {
            tolMs,
            contentProfile,
            clusterCounts: Object.fromEntries(clusters.map((c) => [c.cluster, c.n])),
            liveClusterCounts: Object.fromEntries(liveClusters.map((c) => [c.cluster, c.n])),
        },
    };
}

/**
 * Scan multiple title pairs; returns compact per-title summaries + optional top live samples.
 */
function scanBatch(titles, options = {}) {
    const limit = Number(options.limit) > 0 ? Number(options.limit) : titles.length;
    const list = titles.slice(0, limit);
    const results = [];
    const aggregate = {};

    list.forEach((t, idx) => {
        // Only full-reload on first title to keep batch reasonably fast
        const scan = scanPair(t.jaPath, t.zhPath, {
            ...options,
            reload: idx === 0 && options.reload !== false,
        });
        for (const [k, n] of Object.entries(scan.summary.liveClusterCounts || {})) {
            aggregate[k] = (aggregate[k] || 0) + n;
        }
        const topLive = (scan.clusters || [])
            .filter((c) => !String(c.cluster).startsWith('fixed:')
                && c.cluster !== 'align_suspect'
                && c.cluster !== 'moan_expand')
            .flatMap((c) => c.samples.slice(0, 2).map((s) => ({
                code: t.code,
                cluster: c.cluster,
                ji: s.ji,
                src: s.src,
                dst: s.dst,
                after: s.after,
            })))
            .slice(0, 6);

        results.push({
            code: t.code,
            jaPath: t.jaPath,
            zhPath: t.zhPath,
            aligned: scan.aligned,
            changed: scan.changed,
            asrChanged: scan.asrChanged,
            liveHitCount: scan.liveHitCount,
            softHitCount: scan.softHitCount,
            live: scan.summary.liveClusterCounts,
            fixed: Object.fromEntries(
                (scan.clusters || [])
                    .filter((c) => String(c.cluster).startsWith('fixed:'))
                    .map((c) => [c.cluster, c.n]),
            ),
            topLive,
        });
    });

    results.sort((a, b) => b.liveHitCount - a.liveHitCount || b.changed - a.changed);
    return {
        count: results.length,
        aggregateLive: aggregate,
        titles: results,
    };
}

module.exports = {
    scanPair,
    scanBatch,
    reloadSanitize,
    getSanitize,
    get sanitize() {
        return getSanitize(false);
    },
};
