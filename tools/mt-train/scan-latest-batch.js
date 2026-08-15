#!/usr/bin/env node
/**
 * Scan the latest TransubEngine completed batch (NEW titles only).
 * Uses adult-anchor scan policy + recover coverage metrics.
 *
 * Usage:
 *   node tools/mt-train/scan-latest-batch.js
 *   node tools/mt-train/scan-latest-batch.js --since=2026-08-12T10:00:00Z
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { parseSrt, alignCues, extractTitleCode } = require('./lib/srt');
const { getSanitize } = require('./lib/scan');
const autoPropose = require('./lib/auto-propose');
const policy = require('./lib/scan-policy');

const root = path.join(__dirname, '..', '..');
const histPath = path.join(root, 'transub-task-history.json');
const logPath = path.join(process.env.LOCALAPPDATA || '', 'TransubEngine', 'latest.log');

function codeFrom(p) {
    const base = path.basename(String(p || ''));
    return extractTitleCode(base)
        || base.replace(/\.src\.srt$/i, '').replace(/\.srt$/i, '').replace(/\.mp4$/i, '').replace(/\.H265$/i, '');
}

function readLogStems() {
    if (!logPath || !fs.existsSync(logPath)) return [];
    const log = fs.readFileSync(logPath, 'utf8');
    const stems = [];
    for (const line of log.split(/\r?\n/)) {
        const m = line.match(/#(\d+)\/(\d+)\s+完成\s+([^\s·]+)\s*·\s*完成/);
        if (m) {
            stems.push({
                n: Number(m[1]),
                total: Number(m[2]),
                stem: m[3].replace(/\.mp4$/i, ''),
            });
        }
    }
    return stems;
}

function latestBatchFocus(stems) {
    if (!stems.length) return new Set();
    const total = stems[stems.length - 1].total;
    const batch = stems.filter((s) => s.total === total);
    const focus = new Set();
    for (const s of batch) {
        const code = extractTitleCode(s.stem) || s.stem.replace(/^4k688\.com@/i, '');
        const short = String(code).match(/[A-Z]{2,6}-\d+/i)?.[0]?.toUpperCase();
        if (short) focus.add(short);
    }
    return focus;
}

function collectPairs(focus) {
    const hist = JSON.parse(fs.readFileSync(histPath, 'utf8'));
    const byCode = new Map();
    for (const e of (hist.entries || [])) {
        for (const o of (e.outputs || [])) {
            if (o.status !== 'done') continue;
            const ja = o.sourceSubtitlePath;
            const zh = o.targetSubtitlePath || o.subtitlePath;
            if (!ja || !zh || !fs.existsSync(ja) || !fs.existsSync(zh)) continue;
            const code = codeFrom(ja) || codeFrom(o.videoPath);
            const short = String(code).match(/[A-Z]{2,6}-\d+/i)?.[0]?.toUpperCase() || String(code).toUpperCase();
            if (focus.size && ![...focus].some((w) => short.includes(w) || String(o.videoPath || '').toUpperCase().includes(w))) {
                continue;
            }
            const mtime = Math.max(fs.statSync(ja).mtimeMs, fs.statSync(zh).mtimeMs);
            const prev = byCode.get(short);
            if (!prev || mtime >= prev.mtime) {
                byCode.set(short, { code: short, jaPath: ja, zhPath: zh, mtime });
            }
        }
    }
    return [...byCode.values()].sort((a, b) => b.mtime - a.mtime);
}

function main() {
    const stems = readLogStems();
    const focus = latestBatchFocus(stems);
    const sinceArg = process.argv.find((a) => a.startsWith('--since='));
    const tag = `batch-engine-latest-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;

    console.log('TAG', tag);
    console.log('logBatch', [...focus].join(', ') || '(none)');

    let pairs = collectPairs(focus);
    if (sinceArg) {
        const cut = Date.parse(sinceArg.slice('--since='.length));
        pairs = pairs.filter((p) => p.mtime >= cut);
    }
    console.log('pairs', pairs.length, pairs.map((p) => p.code).join(', '));

    const sanitize = getSanitize(true);
    const byCluster = {};
    const buckets = {
        latin_left: [],
        clinical_left: [],
        soft_go: [],
        invent_rod: [],
        ja_echo: [],
        under_formable: [],
        heixiu: [],
        source_echo_re_mt: [],
        asr_garbage: [],
        align_gap: [],
        noise_skipped: 0,
    };
    const allRows = [];

    function push(b, row) {
        if (!buckets[b]) return;
        if (Array.isArray(buckets[b]) && buckets[b].length < 120) buckets[b].push(row);
    }

    for (const p of pairs) {
        let scan;
        try {
            scan = require('./lib/scan').scanPair(p.jaPath, p.zhPath, { reload: false });
        } catch (e) {
            console.log('scan fail', p.code, e.message);
            continue;
        }
        for (const c of (scan.clusters || [])) {
            if (!autoPropose.HOT.has(c.cluster)) continue;
            for (const s of (c.samples || [])) {
                (byCluster[c.cluster] = byCluster[c.cluster] || []).push({
                    code: p.code, ji: s.ji, src: s.src, dst: s.dst, after: s.after, cluster: c.cluster,
                });
            }
        }

        const ja = parseSrt(p.jaPath);
        const zh = parseSrt(p.zhPath);
        const aligned = alignCues(ja, zh, 700, { mode: 'dp', includeGaps: true });
        const gapN = aligned.filter((x) => x.alignGap).length;
        console.log(p.code, 'ja', ja.length, 'zh', zh.length, 'aligned', aligned.length, 'gaps', gapN);

        for (const pair of aligned) {
            const src = String(pair.src || '');
            const dst = String(pair.dst || '');
            if (!src && !dst) continue;
            if (pair.alignGap) {
                buckets.align_gap = buckets.align_gap || [];
                if (buckets.align_gap.length < 40) {
                    buckets.align_gap.push({
                        code: p.code, i: (pair.ji ?? 0) + 1, src, dst: '', after: '', alignGap: true,
                    });
                }
                buckets.noise_skipped += 1;
                continue;
            }
            const out = sanitize.sanitizeMtCueText(dst, src, {
                contentProfile: 'av_soft',
                cueIndex: pair.ji ?? 0,
            });
            const after = String(out.text || '');
            const row = {
                code: p.code,
                i: (pair.ji ?? 0) + 1,
                src,
                dst,
                after,
                flags: out.flags,
                residualClass: policy.classifyRow({ src, dst, after, flags: out.flags }),
            };
            allRows.push(row);

            const bucket = policy.bucketResidual(row);
            if (!bucket) {
                buckets.noise_skipped += 1;
                continue;
            }
            push(bucket, row);
        }
    }

    const coverage = policy.recoverCoverage(allRows);
    const ranked = policy.rankResiduals(allRows).slice(0, 40);
    const summary = {
        tag,
        focus: [...focus],
        pairCount: pairs.length,
        bucketCounts: Object.fromEntries(
            Object.entries(buckets).map(([k, v]) => [k, Array.isArray(v) ? v.length : v]),
        ),
        clusters: Object.fromEntries(Object.entries(byCluster).map(([k, v]) => [k, v.length])),
        recoverCoverage: coverage,
        residualClassCounts: allRows.reduce((acc, r) => {
            acc[r.residualClass] = (acc[r.residualClass] || 0) + 1;
            return acc;
        }, {}),
        topResidualScores: ranked.map((r) => ({
            code: r.code,
            i: r.i,
            score: r.score,
            cls: r.cls,
            polarity: r.polarity,
            missing: r.cover?.missing,
            src: r.src,
            after: r.after,
        })),
    };

    const outPath = path.join(root, 'tmp', `mt-${tag}-scan.json`);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify({ summary, byCluster, buckets, ranked: ranked.slice(0, 25) }, null, 2));
    console.log(JSON.stringify(summary, null, 2));
    console.log('wrote', outPath);
    console.log(
        `recoverCoverage adultShort=${coverage.adultShort} recovered=${coverage.recovered}`
        + ` unrecovered=${coverage.unrecovered} rate=${(coverage.rate * 100).toFixed(1)}%`
        + ` sufficient=${coverage.sufficient || 0}`,
    );
    if (ranked.length) {
        console.log('topScores', ranked.slice(0, 5).map((r) => `${r.score}:${r.cls}:${r.src.slice(0, 18)}`).join(' | '));
    }
}

if (require.main === module) {
    main();
}

module.exports = { main, latestBatchFocus, readLogStems };
