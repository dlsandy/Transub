'use strict';

/**
 * Closed-loop training report: before/after live residual counts by cluster.
 */

/**
 * @param {object} scan scanPair result
 * @returns {{ liveHitCount: number, softHitCount: number, liveClusterCounts: Record<string, number>, at: string }}
 */
function snapshotFromScan(scan = {}) {
    return {
        liveHitCount: Number(scan.liveHitCount) || 0,
        softHitCount: Number(scan.softHitCount) || 0,
        liveClusterCounts: { ...(scan.summary?.liveClusterCounts || {}) },
        at: new Date().toISOString(),
    };
}

/**
 * @param {object|null} before
 * @param {object|null} after
 */
function diffSnapshots(before, after) {
    const b = before || { liveHitCount: 0, softHitCount: 0, liveClusterCounts: {} };
    const a = after || { liveHitCount: 0, softHitCount: 0, liveClusterCounts: {} };
    const keys = new Set([
        ...Object.keys(b.liveClusterCounts || {}),
        ...Object.keys(a.liveClusterCounts || {}),
    ]);
    const clusters = [];
    for (const k of keys) {
        const from = Number(b.liveClusterCounts?.[k]) || 0;
        const to = Number(a.liveClusterCounts?.[k]) || 0;
        if (from === to) continue;
        clusters.push({
            cluster: k,
            before: from,
            after: to,
            delta: to - from,
        });
    }
    clusters.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta) || x.cluster.localeCompare(y.cluster));
    const liveBefore = Number(b.liveHitCount) || 0;
    const liveAfter = Number(a.liveHitCount) || 0;
    return {
        liveBefore,
        liveAfter,
        liveDelta: liveAfter - liveBefore,
        softBefore: Number(b.softHitCount) || 0,
        softAfter: Number(a.softHitCount) || 0,
        clusters,
        improved: liveAfter < liveBefore,
        unchanged: liveAfter === liveBefore,
        worsened: liveAfter > liveBefore,
    };
}

/**
 * Rules that hit 0 times on the after corpus (optional lifecycle hint).
 * @param {Array<{ id?: string, payload?: object, rule?: object }>} applied
 * @param {Array<{ src: string, after?: string, dst?: string }>} corpus
 */
function zeroHitRules(applied = [], corpus = []) {
    const autoQuality = require('./auto-quality');
    const out = [];
    for (const row of applied) {
        const payload = row.payload || (row.rule ? {
            mode: row.rule.mode,
            zhFrom: row.rule.zhFrom,
            zhTo: row.rule.zhTo,
            jaAnchor: (row.rule.jaIncludes || [])[0] || '',
        } : null);
        if (!payload) continue;
        const col = autoQuality.estimateCollateral(payload, corpus, { targetJis: [] });
        if (col.totalHits === 0) {
            out.push({
                id: row.rule?.id || row.id || '',
                ji: row.ji,
                reason: '写入后语料 0 命中（可考虑停用）',
            });
        }
    }
    return out;
}

/**
 * @param {object} diff from diffSnapshots
 * @param {{ applied?: number, zeroHits?: object[], title?: string }} [meta]
 */
function formatLoopReport(diff, meta = {}) {
    const lines = [];
    const title = meta.title ? `「${meta.title}」` : '本片';
    lines.push(`闭环 ${title}：待修 ${diff.liveBefore}→${diff.liveAfter}`
        + (diff.liveDelta === 0 ? '（无变化）' : `（${diff.liveDelta > 0 ? '+' : ''}${diff.liveDelta}）`));
    if (meta.applied != null) lines.push(`写入 ${meta.applied} 条规则`);
    for (const c of (diff.clusters || []).slice(0, 12)) {
        const sign = c.delta > 0 ? '+' : '';
        lines.push(`  · ${c.cluster}: ${c.before}→${c.after} (${sign}${c.delta})`);
    }
    if (meta.zeroHits?.length) {
        lines.push(`0 命中候选 ${meta.zeroHits.length}：${meta.zeroHits.map((z) => z.id || `#${z.ji}`).join(', ')}`);
    }
    if (diff.worsened) lines.push('注意：待修上升，请复查误伤或对立意图。');
    else if (diff.improved) lines.push('待修下降，可继续发库前检查。');
    return lines.join('\n');
}

/**
 * Build full loop report from two scans + applied rules.
 */
function buildLoopReport({ beforeScan, afterScan, applied = [], title = '' } = {}) {
    const before = snapshotFromScan(beforeScan || {});
    const after = snapshotFromScan(afterScan || {});
    const diff = diffSnapshots(before, after);
    const corpus = [];
    for (const c of (afterScan?.clusters || [])) {
        for (const s of c.samples || []) corpus.push(s);
    }
    for (const f of (afterScan?.sampleFixes || [])) {
        corpus.push({
            ji: f.ji,
            src: f.src,
            dst: f.before,
            after: f.after,
        });
    }
    const zeroHits = zeroHitRules(applied, corpus);
    return {
        ok: true,
        before,
        after,
        diff,
        zeroHits,
        title: title || '',
        text: formatLoopReport(diff, {
            applied: applied.length,
            zeroHits,
            title,
        }),
    };
}

module.exports = {
    snapshotFromScan,
    diffSnapshots,
    zeroHitRules,
    formatLoopReport,
    buildLoopReport,
};
