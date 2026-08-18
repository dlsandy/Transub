'use strict';

/**
 * Collect JA/ZH pairs from Transub task history (engine / TWAI jobs).
 * Shared by Electron bridge and mt-train HTTP server.
 */
const fs = require('fs');
const path = require('path');

/**
 * @param {object[]} entries task-history entries
 * @param {{
 *   resolveJaPath?: (output: object, zhPath: string) => string,
 *   fileExists?: (p: string) => boolean,
 *   maxPairs?: number,
 * }} [opts]
 */
function collectHistorySubtitlePairs(entries, opts = {}) {
    const maxPairs = Math.min(80, Math.max(1, Number(opts.maxPairs) || 40));
    const fileExists = typeof opts.fileExists === 'function'
        ? opts.fileExists
        : (p) => {
            try { return !!(p && fs.existsSync(p)); } catch (_) { return false; }
        };
    const resolveJaPath = typeof opts.resolveJaPath === 'function'
        ? opts.resolveJaPath
        : (output) => String(output?.sourceSubtitlePath || '').trim();

    const pairs = [];
    const list = Array.isArray(entries) ? entries : [];
    for (const entry of list) {
        if (pairs.length >= maxPairs) break;
        const outputs = Array.isArray(entry?.outputs) ? entry.outputs : [];
        outputs.forEach((output, outputIndex) => {
            if (pairs.length >= maxPairs) return;
            const status = String(output?.status || 'done').trim().toLowerCase();
            if (status && status !== 'done' && status !== 'skipped') return;

            const zhPath = String(
                output?.targetSubtitlePath
                || output?.subtitlePath
                || '',
            ).trim();
            if (!zhPath) return;

            const jaPath = String(resolveJaPath(output, zhPath) || '').trim();
            if (!jaPath) return;

            const videoPath = String(output?.videoPath || '').trim();
            const title = path.basename(videoPath || zhPath, path.extname(videoPath || zhPath))
                .replace(/\.src$/i, '')
                .replace(/\.(ja|zh|chs|cht|cn|jpn|jp)$/i, '');
            if (!fileExists(jaPath) || !fileExists(zhPath)) return;

            pairs.push({
                id: `${String(entry.id || 'job')}::${outputIndex}`,
                jobId: String(entry.id || ''),
                finishedAt: entry.finishedAt || entry.startedAt || '',
                task: String(entry.task || entry.options?.task || ''),
                title: title || path.basename(zhPath),
                videoPath,
                jaPath,
                zhPath,
                jaExists: true,
                zhExists: true,
                source: 'task-history',
            });
        });
    }
    return pairs;
}

/**
 * Resolve JA path: explicit source → sibling .src.srt → jaRoot by title code.
 */
function resolveJaPathWithFallbacks(output, zhPath, opts = {}) {
    const source = String(output?.sourceSubtitlePath || '').trim();
    if (source && fs.existsSync(source)) return source;

    const zh = String(zhPath || output?.subtitlePath || '').trim();
    if (zh) {
        const dir = path.dirname(zh);
        const base = path.basename(zh, path.extname(zh));
        const sibling = path.join(dir, `${base}.src.srt`);
        if (fs.existsSync(sibling)) return sibling;
        const stem = base.replace(/\.(zh|chs|cht|cn)$/i, '');
        const sibling2 = path.join(dir, `${stem}.src.srt`);
        if (fs.existsSync(sibling2)) return sibling2;
    }

    if (typeof opts.findKept === 'function') {
        try {
            const kept = opts.findKept(output, zh);
            if (kept && fs.existsSync(kept)) return kept;
        } catch (_) { /* ignore */ }
    }

    const jaRoot = opts.jaRoot;
    if (jaRoot && zh) {
        try {
            const { extractTitleCode } = require('./srt');
            const code = extractTitleCode(path.basename(zh));
            if (code) {
                const files = fs.readdirSync(jaRoot);
                const hit = files.find((f) => extractTitleCode(f) === code && /\.src\.srt$/i.test(f));
                if (hit) {
                    const full = path.join(jaRoot, hit);
                    if (fs.existsSync(full)) return full;
                }
            }
        } catch (_) { /* ignore */ }
    }
    return '';
}

/**
 * Load pairs from on-disk task history.
 * @param {{
 *   historyPath?: string,
 *   jaRoot?: string,
 *   maxPairs?: number,
 *   findKept?: Function,
 * }} [opts]
 */
function listPairsFromTaskHistoryFile(opts = {}) {
    let historyPath = opts.historyPath;
    if (!historyPath) {
        try {
            const { getWritableRoot } = require('../../electron/app-paths');
            historyPath = path.join(getWritableRoot(), 'transub-task-history.json');
        } catch (_) {
            historyPath = path.join(path.resolve(__dirname, '../../..'), 'transub-task-history.json');
        }
    }
    let entries = [];
    try {
        if (fs.existsSync(historyPath)) {
            const parsed = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
            entries = Array.isArray(parsed.entries) ? parsed.entries : [];
        }
    } catch (_) {
        entries = [];
    }

    const pairs = collectHistorySubtitlePairs(entries, {
        maxPairs: opts.maxPairs || 40,
        fileExists: (p) => {
            try { return !!(p && fs.existsSync(p)); } catch (_) { return false; }
        },
        resolveJaPath: (output, zhPath) => resolveJaPathWithFallbacks(output, zhPath, {
            jaRoot: opts.jaRoot,
            findKept: opts.findKept,
        }),
    });

    return {
        ok: true,
        pairs,
        total: pairs.length,
        historyPath,
        entryCount: entries.length,
    };
}

module.exports = {
    collectHistorySubtitlePairs,
    resolveJaPathWithFallbacks,
    listPairsFromTaskHistoryFile,
};
