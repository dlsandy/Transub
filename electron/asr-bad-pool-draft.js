/**
 * Append ASR bad-pool draft cards (tmp/) for human confirm → D01 / opaque.
 * Never gates runtime; title is provenance only.
 */
'use strict';

const fs = require('fs');
const path = require('path');

function resolveBadPoolDir(rootHint) {
    try {
        const { getWritableRoot } = require('./app-paths');
        const root = rootHint || getWritableRoot();
        return path.join(root, 'tmp', 'asr-bad-pool');
    } catch (_) {
        return path.join(process.cwd(), 'tmp', 'asr-bad-pool');
    }
}

function monthStamp(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

function clipText(s, max = 160) {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    if (t.length <= max) return t;
    return `${t.slice(0, max)}…`;
}

/**
 * Build draft cards when second opinion replaced a scrap/loop primary window.
 * @returns {object[]}
 */
function buildSecondOpinionBadDrafts(input = {}) {
    const primary = Array.isArray(input.primaryCues) ? input.primaryCues : [];
    const opinion = Array.isArray(input.opinionCues) ? input.opinionCues : [];
    const pText = primary.map((c) => String(c?.text || '').trim()).filter(Boolean).join(' ');
    const oText = opinion.map((c) => String(c?.text || '').trim()).filter(Boolean).join(' ');
    if (!oText || oText === pText) return [];

    let isScrap = false;
    try {
        const core = require('../src/js/asr-second-opinion-core');
        isScrap = !pText || core.isScrapOrLoopText(pText);
    } catch (_) {
        isScrap = !pText || pText.length <= 2 || /(.)\1{4,}/u.test(pText);
    }
    if (!isScrap && pText && oText.length < Math.max(6, Math.ceil(pText.length * 1.2))) {
        return [];
    }

    const kind = !pText || /^(…|\.\.\.|·|・|\s)+$/u.test(pText) || /(.)\1{4,}/u.test(pText)
        ? (/(.)\1{4,}/u.test(pText) ? 'loop' : 'hallucination')
        : 'mishear';

    return [{
        id: `so-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ja_wrong: clipText(pText || '（空）'),
        ja_right: clipText(oText),
        kind,
        profile: String(input.contentProfile || input.senseProfile || 'av_soft'),
        asr_model: String(input.primaryAsr || ''),
        opinion_model: String(input.opinionAsr || ''),
        title: String(input.title || path.basename(String(input.mediaPath || '')) || 'provenance-only'),
        adult: false,
        status: 'open',
        rule_target: 'none',
        source: 'asr-second-opinion',
        reason: String(input.reason || ''),
        time_ms: {
            start: Number(input.startMs) || 0,
            end: Number(input.endMs) || 0,
        },
        notes: 'Auto draft from ASR second-opinion accept — confirm before D01',
    }];
}

/**
 * Append JSONL drafts under tmp/asr-bad-pool/.
 * @returns {{ ok: boolean, path?: string, appended?: number, error?: string, skipped?: boolean }}
 */
function appendAsrBadPoolDrafts(drafts, options = {}) {
    const list = (Array.isArray(drafts) ? drafts : []).filter((d) => d && d.ja_right);
    if (!list.length) return { ok: true, skipped: true, appended: 0 };
    if (options.enabled === false) return { ok: true, skipped: true, appended: 0, reason: 'disabled' };

    try {
        const dir = resolveBadPoolDir(options.root);
        fs.mkdirSync(dir, { recursive: true });
        const suffix = String(options.suffix || 'second-opinion').replace(/[^\w.-]/g, '') || 'draft';
        const filePath = path.join(dir, `${monthStamp()}.${suffix}.jsonl`);
        const lines = list.map((d) => JSON.stringify(d)).join('\n') + '\n';
        fs.appendFileSync(filePath, lines, 'utf8');
        return { ok: true, path: filePath, appended: list.length, dir };
    } catch (err) {
        return { ok: false, error: err?.message || String(err), appended: 0 };
    }
}

/**
 * Summarize local JSONL drafts (open cards only).
 * @returns {{ ok: boolean, total: number, open: number, byKind: object, files: string[], samples: object[] }}
 */
function summarizeBadPoolJsonl(options = {}) {
    const dir = resolveBadPoolDir(options.root);
    if (!fs.existsSync(dir)) {
        return { ok: true, total: 0, open: 0, byKind: {}, files: [], samples: [] };
    }
    const files = fs.readdirSync(dir)
        .filter((f) => f.endsWith('.jsonl'))
        .map((f) => path.join(dir, f))
        .sort();
    const byKind = {};
    const samples = [];
    let total = 0;
    let open = 0;
    for (const filePath of files) {
        let raw = '';
        try { raw = fs.readFileSync(filePath, 'utf8'); } catch { continue; }
        for (const line of raw.split(/\r?\n/)) {
            const t = line.trim();
            if (!t) continue;
            let row;
            try { row = JSON.parse(t); } catch { continue; }
            total += 1;
            const kind = String(row.kind || 'other');
            byKind[kind] = (byKind[kind] || 0) + 1;
            if (String(row.status || 'open') === 'open') {
                open += 1;
                if (samples.length < (Number(options.sampleLimit) || 12)) {
                    samples.push({
                        file: path.basename(filePath),
                        ja_wrong: row.ja_wrong,
                        ja_right: row.ja_right,
                        kind: row.kind,
                        profile: row.profile,
                    });
                }
            }
        }
    }
    return { ok: true, total, open, byKind, files: files.map((f) => path.basename(f)), samples, dir };
}

module.exports = {
    resolveBadPoolDir,
    buildSecondOpinionBadDrafts,
    appendAsrBadPoolDrafts,
    summarizeBadPoolJsonl,
    monthStamp,
};
