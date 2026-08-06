'use strict';

const fs = require('fs');
const path = require('path');

function esc(s) {
    return String(s ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\r?\n/g, '\\n');
}

/**
 * Build a paste-ready mocha draft from selected hits.
 * @param {{ hits: Array<{src:string,dst:string,after?:string,issues?:string[],title?:string,note?:string}>, suiteName?: string }} opts
 */
function buildPoisonDraft(opts = {}) {
    const hits = Array.isArray(opts.hits) ? opts.hits : [];
    const suiteName = opts.suiteName || `mt-train draft ${new Date().toISOString().slice(0, 10)}`;
    const lines = [];
    lines.push('// AUTO-DRAFT from tools/mt-train — review before pasting into tests/mt-sanitize.test.js');
    lines.push('// eslint-disable-next-line no-undef');
    lines.push("const assert = require('assert');");
    lines.push("const sanitize = require('../../../src/js/mt-sanitize-core.js');");
    lines.push('');
    lines.push(`describe(${JSON.stringify(suiteName)}, () => {`);
    lines.push("    const av = { contentProfile: 'av_soft' };");
    lines.push('');

    hits.forEach((hit, i) => {
        const code = hit.title || 'hit';
        const primary = (Array.isArray(hit.issues) && hit.issues[0]) || hit.note || 'residual';
        const ji = hit.ji != null ? `#${hit.ji}` : `#${i + 1}`;
        const issues = Array.isArray(hit.issues) ? hit.issues.join(',') : String(hit.note || '');
        const itName = `${code} ${ji} ${primary}`.slice(0, 80);
        lines.push(`    it(${JSON.stringify(itName)}, () => {`);
        lines.push(`        // issues: ${issues || 'n/a'}`);
        if (hit.asr) lines.push(`        // ASR: ${esc(hit.asr)}`);
        lines.push(`        const ja = '${esc(hit.src || hit.ja)}';`);
        lines.push(`        const zh = '${esc(hit.dst || hit.zh)}';`);
        lines.push('        const r = sanitize.sanitizeMtCueText(zh, ja, av);');
        if (hit.expect) {
            lines.push(`        assert.ok(${JSON.stringify(hit.expect)}.test(r.text), r.text);`);
        } else if (issues.includes('prompt_leak') || issues.includes('sfx_halluc') || issues.includes('latin')) {
            lines.push("        assert.ok(r.text === '' || r.text === '…', r.text);");
        } else if (issues.includes('iku_shoot')) {
            lines.push('        assert.ok(!/射精/.test(r.text) || /射精/.test(ja), r.text);');
        } else if (issues.includes('dechau_out')) {
            lines.push('        assert.ok(!/要出来了|又要出来了/.test(r.text), r.text);');
            lines.push('        assert.ok(/要射|射了/.test(r.text), r.text);');
        } else if (issues.includes('kimochi_stub')) {
            lines.push('        assert.ok(/舒服/.test(r.text), r.text);');
        } else {
            lines.push('        // TODO: tighten assertion after reviewing sanitize output');
            lines.push(`        // after scan: ${esc(hit.after || '')}`);
            lines.push('        assert.ok(r.changed || r.text !== zh, r.text);');
        }
        lines.push('    });');
        lines.push('');
    });

    lines.push('});');
    lines.push('');
    return lines.join('\n');
}

function writePoisonDraft(rootDir, opts = {}) {
    const dir = path.join(rootDir, 'tests', 'fixtures', 'mt-train-drafts');
    fs.mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(dir, `draft-${ts}.js`);
    const body = buildPoisonDraft(opts);
    if (opts.dryRun) {
        return { file: null, body, count: (opts.hits || []).length, dryRun: true };
    }
    fs.writeFileSync(file, body, 'utf8');
    return { file, body, count: (opts.hits || []).length, dryRun: false };
}

function listPoisonDrafts(rootDir, { limit = 12 } = {}) {
    const dir = path.join(rootDir, 'tests', 'fixtures', 'mt-train-drafts');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
        .filter((n) => /^draft-.*\.js$/i.test(n))
        .map((name) => {
            const file = path.join(dir, name);
            const st = fs.statSync(file);
            return {
                name,
                file,
                mtime: st.mtimeMs,
                mtimeIso: st.mtime.toISOString(),
                bytes: st.size,
            };
        })
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, limit);
}

module.exports = {
    buildPoisonDraft,
    writePoisonDraft,
    listPoisonDrafts,
};
