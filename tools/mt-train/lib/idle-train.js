'use strict';

/**
 * Idle / overnight training pass: scan titles → auto-propose → save morning report.
 * Never writes rules by itself — human confirms via adopt.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '../../..');
const REPORT_DIR = path.join(ROOT, 'tmp', 'mt-train-idle');

function ensureDir() {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
}

function reportPath(name) {
    ensureDir();
    const safe = String(name || '').replace(/[^\w.\-]+/g, '_').slice(0, 120);
    return path.join(REPORT_DIR, safe);
}

function latestPointerPath() {
    return path.join(REPORT_DIR, 'latest.json');
}

/**
 * @param {object} opts
 * @param {Array<{ code: string, jaPath: string, zhPath: string }>} opts.titles
 * @param {(ja: string, zh: string, o?: object) => object} opts.scanPair
 * @param {(sanitize: object, hits: object[], o?: object) => object} opts.proposeFromHits
 * @param {object} opts.sanitize
 * @param {number} [opts.maxTitles=8]
 * @param {number} [opts.maxPerTitle=8]
 * @param {string|null} [opts.cluster] optional single-cluster queue
 * @param {string} [opts.label]
 */
function runIdlePass(opts = {}) {
    const titles = (opts.titles || []).slice(0, Math.min(24, Math.max(1, Number(opts.maxTitles) || 8)));
    const maxPerTitle = Math.min(16, Math.max(1, Number(opts.maxPerTitle) || 8));
    const scanPair = opts.scanPair;
    const proposeFromHits = opts.proposeFromHits;
    const sanitize = opts.sanitize;
    if (typeof scanPair !== 'function' || typeof proposeFromHits !== 'function' || !sanitize) {
        throw new Error('idle-train: scanPair / proposeFromHits / sanitize required');
    }

    const startedAt = new Date().toISOString();
    const titleRows = [];
    /** @type {object[]} */
    const proposals = [];
    let liveBeforeTotal = 0;
    let liveAfterEstimate = 0;

    for (let i = 0; i < titles.length; i += 1) {
        const t = titles[i];
        let scan;
        try {
            scan = scanPair(t.jaPath, t.zhPath, {
                contentProfile: opts.contentProfile || 'av_soft',
                reload: i === 0,
            });
        } catch (err) {
            titleRows.push({
                code: t.code,
                error: err.message || String(err),
                liveHitCount: -1,
            });
            continue;
        }
        liveBeforeTotal += scan.liveHitCount || 0;
        const hits = [];
        for (const c of scan.clusters || []) {
            if (String(c.cluster).startsWith('fixed:')) continue;
            if (['align_suspect', 'align_gap', 'moan_expand', 'asr_garbage'].includes(c.cluster)) continue;
            for (const s of c.samples || []) {
                hits.push({ ...s, title: t.code });
            }
        }
        const out = proposeFromHits(sanitize, hits, {
            title: t.code,
            max: maxPerTitle,
            pinFinal: true,
            corpus: hits,
            cluster: opts.cluster || undefined,
            clusterOnly: Boolean(opts.cluster),
        });
        const auto = (out.proposals || []).filter((p) => p.confidence?.level === 'auto');
        const review = (out.proposals || []).filter((p) => p.confidence?.level === 'review');
        const reject = (out.proposals || []).filter((p) => p.confidence?.level === 'reject'
            || ['skipped', 'failed'].includes(p.status));

        titleRows.push({
            code: t.code,
            jaPath: t.jaPath,
            zhPath: t.zhPath,
            liveHitCount: scan.liveHitCount,
            softHitCount: scan.softHitCount,
            liveClusterCounts: scan.summary?.liveClusterCounts || {},
            auto: auto.length,
            review: review.length,
            reject: reject.length,
            proposeCount: out.count,
        });

        for (const p of out.proposals || []) {
            if (!['ready', 'review', 'failed', 'needs_expect'].includes(p.status)
                && p.confidence?.level !== 'auto'
                && p.confidence?.level !== 'review') {
                continue;
            }
            proposals.push({
                ...p,
                title: t.code,
                jaPath: t.jaPath,
                zhPath: t.zhPath,
                // idle default: only auto accepted
                accepted: p.confidence?.level === 'auto',
                idleId: `idle_${t.code}_${p.ji}_${crypto.randomBytes(2).toString('hex')}`,
            });
        }
        liveAfterEstimate += Math.max(0, (scan.liveHitCount || 0) - auto.length);
    }

    const finishedAt = new Date().toISOString();
    const id = `report-${finishedAt.replace(/[:.]/g, '-').slice(0, 19)}`;
    const conf = {
        auto: proposals.filter((p) => p.confidence?.level === 'auto').length,
        review: proposals.filter((p) => p.confidence?.level === 'review').length,
        reject: proposals.filter((p) => p.confidence?.level === 'reject').length,
    };

    const report = {
        ok: true,
        id,
        label: opts.label || 'idle-morning',
        startedAt,
        finishedAt,
        titleCount: titles.length,
        titles: titleRows,
        liveBeforeTotal,
        liveAfterEstimate,
        confidence: conf,
        proposals,
        hint: '空闲扫描只生成候选，默认不写入。请勾选「可直接写」后点采纳；误伤/建议改项需人工确认。',
        written: false,
    };

    ensureDir();
    const file = reportPath(`${id}.json`);
    fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    fs.writeFileSync(latestPointerPath(), `${JSON.stringify({ id, path: file, finishedAt }, null, 2)}\n`, 'utf8');
    report.path = file;
    return report;
}

function listReports({ limit = 12 } = {}) {
    ensureDir();
    const files = fs.readdirSync(REPORT_DIR)
        .filter((f) => /^report-.*\.json$/i.test(f))
        .map((f) => {
            const full = path.join(REPORT_DIR, f);
            const st = fs.statSync(full);
            return { name: f, path: full, mtime: st.mtimeMs };
        })
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, Math.max(1, Number(limit) || 12));
    return files;
}

function loadReport(nameOrLatest = 'latest') {
    ensureDir();
    if (nameOrLatest === 'latest' || !nameOrLatest) {
        if (!fs.existsSync(latestPointerPath())) return null;
        const ptr = JSON.parse(fs.readFileSync(latestPointerPath(), 'utf8'));
        if (!ptr?.path || !fs.existsSync(ptr.path)) return null;
        return JSON.parse(fs.readFileSync(ptr.path, 'utf8'));
    }
    const file = path.isAbsolute(nameOrLatest)
        ? nameOrLatest
        : reportPath(nameOrLatest.endsWith('.json') ? nameOrLatest : `${nameOrLatest}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * Mark report proposals accepted by idleId, then caller applies via autoPropose.applyProposals.
 * @param {object} report
 * @param {string[]} idleIds
 */
function markAdopted(report, idleIds = []) {
    const want = new Set((idleIds || []).map(String));
    const next = { ...report, proposals: (report.proposals || []).map((p) => ({
        ...p,
        accepted: want.has(String(p.idleId)) || (want.size === 0 && p.confidence?.level === 'auto' && p.accepted),
    })) };
    return next;
}

module.exports = {
    REPORT_DIR,
    runIdlePass,
    listReports,
    loadReport,
    markAdopted,
};
