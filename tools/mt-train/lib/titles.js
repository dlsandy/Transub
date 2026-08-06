'use strict';

const path = require('path');
const { listSrtFiles, extractTitleCode } = require('./srt');

/**
 * Pair JA (.src.srt under jaRoot) with ZH (under zhRoot) by title code.
 * @param {object} [opts]
 * @param {number} [opts.limit=40]
 * @param {string} [opts.q] filter by code / filename
 * @returns {Array<object>}
 */
function listPairedTitles(jaRoot, zhRoot, opts = {}) {
    return collectTitlePairs(jaRoot, zhRoot, opts).titles;
}

/**
 * Same as listPairedTitles plus pairing stats.
 */
function collectTitlePairs(jaRoot, zhRoot, opts = {}) {
    const limit = Number(opts.limit) > 0 ? Number(opts.limit) : 40;
    const q = String(opts.q || '').trim().toLowerCase();
    const jaFiles = listSrtFiles(jaRoot).filter((f) => /\.src\.srt$/i.test(f.name) && f.code);
    const zhFiles = listSrtFiles(zhRoot).filter((f) => f.code && !/\.src\.srt$/i.test(f.name));

    const zhByCode = new Map();
    for (const z of zhFiles) {
        const prev = zhByCode.get(z.code);
        if (!prev || z.mtime > prev.mtime) zhByCode.set(z.code, z);
    }

    const pairs = [];
    let unpairedJa = 0;
    for (const j of jaFiles) {
        const z = zhByCode.get(j.code);
        if (!z) {
            unpairedJa += 1;
            continue;
        }
        pairs.push({
            code: j.code,
            jaPath: j.path,
            zhPath: z.path,
            jaName: j.name,
            zhName: z.name,
            mtime: Math.max(j.mtime, z.mtime),
            jaMtime: j.mtime,
            zhMtime: z.mtime,
        });
    }
    pairs.sort((a, b) => b.mtime - a.mtime);

    const filtered = q
        ? pairs.filter((p) =>
            p.code.toLowerCase().includes(q)
            || p.jaName.toLowerCase().includes(q)
            || p.zhName.toLowerCase().includes(q))
        : pairs;

    const titles = filtered.slice(0, limit).map((p) => ({
        ...p,
        mtimeIso: new Date(p.mtime).toISOString(),
    }));
    return {
        titles,
        totalPaired: pairs.length,
        matched: filtered.length,
        unpairedJa,
    };
}

function resolveUnderRoots(filePath, roots) {
    const resolved = path.resolve(filePath);
    const ok = roots.some((root) => {
        const r = path.resolve(root);
        return resolved === r || resolved.startsWith(r + path.sep);
    });
    return ok ? resolved : null;
}

module.exports = {
    listPairedTitles,
    collectTitlePairs,
    resolveUnderRoots,
    extractTitleCode,
};
