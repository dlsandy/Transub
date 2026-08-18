'use strict';

/**
 * Generate paired mocha drafts for strip↔remap opposing intents.
 * Human reviews before pasting into tests/mt-sanitize.test.js.
 */
const fs = require('fs');
const path = require('path');
const trainRoute = require('./train-route');

function esc(s) {
    return String(s ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\r?\n/g, '\\n');
}

function loadIntentIndex() {
    const intentCore = require('../../../src/js/mt-sanitize-intent-core');
    const opaque = require('../../../src/js/mt-opaque-strings');
    const intents = typeof intentCore.buildAllIntents === 'function'
        ? intentCore.buildAllIntents(opaque)
        : (intentCore.buildCanonicalIntents?.(opaque) || []);
    const byId = new Map(intents.map((i) => [i.id, i]));
    return { intentCore, opaque, intents, byId };
}

/**
 * @param {object[]} proposals wizard/auto-propose rows with payload
 * @returns {Array<{ key: string, zhSurface: string, strip: object|null, remap: object|null, proposal: object, intentIds: string[] }>}
 */
function collectOpposingGroups(proposals = []) {
    const { byId } = loadIntentIndex();
    const groups = new Map();

    for (const p of proposals || []) {
        if (!p?.payload && !p?.opposingIntent) continue;
        const hint = p.opposingIntent || trainRoute.opposingIntentHint(p.payload || {});
        if (!hint?.risk || !(hint.intents || []).length) continue;

        const intentObjs = (hint.intents || []).map((id) => byId.get(id)).filter(Boolean);
        let zhSurface = '';
        let strip = null;
        let remap = null;
        for (const it of intentObjs) {
            if (it.zhSurface) zhSurface = zhSurface || it.zhSurface;
            if (it.kind === 'strip') strip = it;
            if (it.kind === 'remap' || it.kind === 'recover') remap = remap || it;
            for (const peerId of it.pairedWith || []) {
                const peer = byId.get(peerId);
                if (!peer) continue;
                if (peer.kind === 'strip') strip = strip || peer;
                if (peer.kind === 'remap' || peer.kind === 'recover') remap = remap || peer;
                if (peer.zhSurface) zhSurface = zhSurface || peer.zhSurface;
            }
        }
        if (!zhSurface) {
            zhSurface = String(p.payload?.zhTo || p.payload?.zhFrom || '').trim();
        }
        if (!zhSurface) continue;
        const key = zhSurface;
        if (!groups.has(key)) {
            groups.set(key, {
                key,
                zhSurface,
                strip,
                remap,
                proposal: p,
                intentIds: [...new Set(hint.intents || [])],
            });
        }
    }
    return [...groups.values()];
}

function defaultStripJa(stripIntent) {
    const smoke = (stripIntent?.smokeTitles || stripIntent?.titles || [])[0] || 'STRIP';
    // Safe generic: family line with no rod cue (matches ADN-798 style)
    return {
        smoke,
        ja: 'お父さんのだからいいんですよ…そんな…',
        zh: `爸爸的就好了…那种…${stripIntent?.zhSurface || '肉棒'}…`,
    };
}

function defaultRemapPair(remapIntent, proposal) {
    const smoke = (remapIntent?.smokeTitles || remapIntent?.titles || [])[0] || 'REMAP';
    const payload = proposal?.payload || {};
    const ja = String(payload.ja || proposal?.src || '').trim()
        || 'もう俺の形になってる？';
    const zh = String(payload.zh || proposal?.dst || '').trim()
        || `已经像我的${remapIntent?.zhSurface === '肉棒' ? '阴茎' : '那个'}形状了？`;
    const expectTo = String(payload.zhTo || remapIntent?.zhSurface || '').trim();
    return { smoke, ja, zh, expectTo, zhFrom: payload.zhFrom || '' };
}

/**
 * @param {{ proposals?: object[], suiteName?: string }} opts
 * @returns {{ body: string, count: number, groups: object[], checklist: string[] }}
 */
function buildOpposingFixtureDraft(opts = {}) {
    const groups = collectOpposingGroups(opts.proposals || []);
    const suiteName = opts.suiteName
        || `mt-train opposing ${new Date().toISOString().slice(0, 10)}`;
    const checklist = [];
    const lines = [];

    lines.push('// AUTO-DRAFT opposing strip↔remap — review before pasting into tests/mt-sanitize.test.js');
    lines.push('// Also confirm src/js/mt-sanitize-intent-core.js pairedWith + fixtureRefs.');
    lines.push('// eslint-disable-next-line no-undef');
    lines.push("const assert = require('assert');");
    lines.push("const sanitize = require('../../../src/js/mt-sanitize-core.js');");
    lines.push("const opaque = require('../../../src/js/mt-opaque-strings.js');");
    lines.push('');
    lines.push(`describe(${JSON.stringify(suiteName)}, () => {`);
    lines.push("    const av = { contentProfile: 'av_soft' };");
    lines.push('');

    if (!groups.length) {
        lines.push('    it(\'placeholder — no opposing intents on selected proposals\', () => {');
        lines.push('        assert.ok(true);');
        lines.push('    });');
        lines.push('');
    }

    for (const g of groups) {
        const surface = g.zhSurface;
        const stripSide = defaultStripJa(g.strip || { zhSurface: surface });
        const remapSide = defaultRemapPair(g.remap || { zhSurface: surface }, g.proposal);
        const itName = `oppose ${surface}: strip↔remap (${(g.intentIds || []).slice(0, 2).join(' / ')})`.slice(0, 100);

        lines.push(`    it(${JSON.stringify(itName)}, () => {`);
        lines.push(`        // intents: ${(g.intentIds || []).join(', ')}`);
        if (g.strip?.jaForbidHint) lines.push(`        // strip jaForbid: ${g.strip.jaForbidHint}`);
        if (g.remap?.jaRequireHint) lines.push(`        // remap jaRequire: ${g.remap.jaRequireHint}`);
        lines.push('');
        lines.push(`        // --- strip side (smoke ${stripSide.smoke}): invented 「${surface}」 must not survive ---`);
        lines.push(`        const stripJa = '${esc(stripSide.ja)}';`);
        lines.push(`        const stripZh = '${esc(stripSide.zh)}';`);
        lines.push('        const stripped = sanitize.sanitizeMtCueText(stripZh, stripJa, av);');
        lines.push(`        assert.ok(!stripped.text.includes('${esc(surface)}'), stripped.text);`);
        lines.push('');
        lines.push(`        // --- remap side (smoke ${remapSide.smoke}): clinical → 「${surface}」 must survive ---`);
        lines.push(`        const remapJa = '${esc(remapSide.ja)}';`);
        lines.push(`        const remapZh = '${esc(remapSide.zh)}';`);
        lines.push('        const remapped = sanitize.sanitizeMtCueText(remapZh, remapJa, av);');
        if (remapSide.expectTo) {
            lines.push(`        assert.ok(remapped.text.includes('${esc(remapSide.expectTo)}'), remapped.text);`);
        } else {
            lines.push(`        assert.ok(remapped.text.includes('${esc(surface)}'), remapped.text);`);
        }
        if (remapSide.zhFrom) {
            lines.push(`        assert.ok(!remapped.text.includes('${esc(remapSide.zhFrom)}') || remapped.text.includes('${esc(remapSide.expectTo || surface)}'), remapped.text);`);
        }
        lines.push('    });');
        lines.push('');

        checklist.push(
            `intent-core: ensure pairedWith links ${(g.intentIds || []).join(' ↔ ')} for ZH「${surface}」`,
        );
        if (g.strip?.fixtureRefs?.length || g.remap?.fixtureRefs?.length) {
            checklist.push(
                `fixtureRefs already cite: ${[...(g.strip?.fixtureRefs || []), ...(g.remap?.fixtureRefs || [])].slice(0, 3).join(' | ')} — update or add this it() title`,
            );
        } else {
            checklist.push(`add fixtureRefs entry pointing at it(${JSON.stringify(itName)})`);
        }
    }

    lines.push('});');
    lines.push('');

    return {
        body: lines.join('\n'),
        count: groups.length,
        groups: groups.map((g) => ({
            zhSurface: g.zhSurface,
            intentIds: g.intentIds,
            stripId: g.strip?.id || null,
            remapId: g.remap?.id || null,
            ji: g.proposal?.ji,
        })),
        checklist,
    };
}

function writeOpposingFixtureDraft(rootDir, opts = {}) {
    const built = buildOpposingFixtureDraft(opts);
    if (opts.dryRun) {
        return { ...built, file: null, dryRun: true };
    }
    const dir = path.join(rootDir, 'tests', 'fixtures', 'mt-train-drafts');
    fs.mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(dir, `oppose-${ts}.js`);
    fs.writeFileSync(file, built.body, 'utf8');
    return { ...built, file, dryRun: false };
}

module.exports = {
    collectOpposingGroups,
    buildOpposingFixtureDraft,
    writeOpposingFixtureDraft,
};
