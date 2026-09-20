#!/usr/bin/env node
/**
 * Verify AGENTS.md, .cursor/rules/*.mdc, and docs/ discipline sections stay aligned.
 * Local-only paths — not published to public GitHub.
 *
 * Usage: node tools/check-agent-rules-consistency.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const issues = [];

/** Active Cursor rules (stale filenames must not appear in docs). */
const EXPECTED_RULE_FILES = [
    '.cursor/rules/no-monolith-growth.mdc',
    '.cursor/rules/mt-sanitize-training.mdc',
    '.cursor/rules/pro-closed-source-boundary.mdc',
    '.cursor/rules/settings-persistence.mdc',
];

const STALE_RULE_FILES = [
    '.cursor/rules/mt-sanitize-anti-regression.mdc',
    '.cursor/rules/nsfw-opaque-required.mdc',
    '.cursor/rules/tdp-after-training.mdc',
];

const MONOLITH_SHELL_FILES = [
    'src/js/app.js',
    'src/js/subtitle-editor.js',
    'electron/engine-bridge.js',
    'electron/extensions-bridge.js',
    'electron/advanced-bridge.js',
    'electron/transwithai-bridge.js',
];

/** Soft physical-line ceilings — keep in sync with no-monolith-growth.mdc / AGENTS.md / architecture.md */
const MONOLITH_SOFT_MAX_LINES = {
    'src/js/app.js': 5400,
    'src/js/subtitle-editor.js': 9200,
    'electron/engine-bridge.js': 1850,
    'electron/extensions-bridge.js': 1400,
    'electron/advanced-bridge.js': 900,
    'electron/transwithai-bridge.js': 1950,
};

function countPhysicalLines(rel) {
    const text = read(rel);
    if (text == null) return null;
    if (text.length === 0) return 0;
    // Match Measure-Object -Line / typical editor line counts (split on \n).
    return text.split(/\n/).length;
}
function warn(msg) {
    console.log(` WARN ${msg}`);
}

function fail(msg) {
    issues.push(msg);
    console.log(` FAIL ${msg}`);
}

function ok(msg) {
    console.log(`  OK  ${msg}`);
}

function read(rel) {
    const p = path.join(root, rel);
    if (!fs.existsSync(p)) return null;
    return fs.readFileSync(p, 'utf8');
}

function extractBacktickPaths(text) {
    const out = new Set();
    const re = /`((?:src|electron)\/[^`\s]+)`/g;
    let m;
    while ((m = re.exec(text)) !== null) out.add(m[1].replace(/\\/g, '/'));
    return out;
}

console.log('Agent rules / docs consistency\n');

// 1) Expected rule files exist; stale rule files absent
for (const rel of EXPECTED_RULE_FILES) {
    if (fs.existsSync(path.join(root, rel))) ok(`rule present: ${rel}`);
    else fail(`missing expected rule: ${rel}`);
}
for (const rel of STALE_RULE_FILES) {
    if (fs.existsSync(path.join(root, rel))) fail(`stale rule still present (remove or merge): ${rel}`);
    else ok(`stale rule absent: ${rel}`);
}

// 2) AGENTS.md lists all expected rules; no stale names
const agents = read('AGENTS.md');
if (!agents) {
    fail('AGENTS.md missing');
} else {
    for (const rel of EXPECTED_RULE_FILES) {
        const name = path.basename(rel);
        if (agents.includes(name)) ok(`AGENTS.md references ${name}`);
        else fail(`AGENTS.md missing reference to ${name}`);
    }
    for (const rel of STALE_RULE_FILES) {
        const name = path.basename(rel);
        if (agents.includes(name) && !agents.includes('已并入')) {
            // allow mention in "merged into" context
            if (/已并入|formerly|merged/i.test(agents) && agents.includes(name)) {
                ok(`AGENTS.md mentions stale ${name} only as merged`);
            }
        }
    }
    for (const stale of ['mt-sanitize-anti-regression.mdc', 'nsfw-opaque-required.mdc', 'tdp-after-training.mdc']) {
        if (agents.includes(stale) && agents.includes('已并入')) ok(`AGENTS.md documents merge of ${stale}`);
    }
    if (agents.includes('npm run check:agent-rules')) ok('AGENTS.md lists check:agent-rules');
    else fail('AGENTS.md missing npm run check:agent-rules');
}

// 3) docs/architecture.md — related rules section
const arch = read('docs/architecture.md');
if (!arch) {
    warn('docs/architecture.md missing — skip doc cross-check (local-only tree)');
} else {
    if (arch.includes('mt-sanitize-training.mdc')) ok('architecture.md references mt-sanitize-training.mdc');
    else fail('architecture.md missing mt-sanitize-training.mdc');
    if (arch.includes('no-monolith-growth.mdc')) ok('architecture.md references no-monolith-growth.mdc');
    else fail('architecture.md missing no-monolith-growth.mdc');
    if (arch.includes('pro-closed-source-boundary.mdc')) ok('architecture.md references pro-closed-source-boundary.mdc');
    else fail('architecture.md missing pro-closed-source-boundary.mdc');
    if (arch.includes('settings-persistence.mdc')) ok('architecture.md references settings-persistence.mdc');
    else fail('architecture.md missing settings-persistence.mdc');
    for (const stale of STALE_RULE_FILES) {
        if (arch.includes(path.basename(stale))) fail(`architecture.md still references stale ${stale}`);
    }
}

// 4) docs/mt-sanitize.md — merged rule name
const mtDoc = read('docs/mt-sanitize.md');
if (!mtDoc) {
    warn('docs/mt-sanitize.md missing — skip doc cross-check');
} else {
    if (mtDoc.includes('mt-sanitize-training.mdc')) ok('mt-sanitize.md references mt-sanitize-training.mdc');
    else fail('mt-sanitize.md missing mt-sanitize-training.mdc');
    for (const stale of STALE_RULE_FILES) {
        if (mtDoc.includes(path.basename(stale))) fail(`mt-sanitize.md still references stale ${stale}`);
    }
}

// 5) Monolith list: no-monolith-growth.mdc vs AGENTS.md
const monoRule = read('.cursor/rules/no-monolith-growth.mdc');
if (!monoRule) {
    fail('no-monolith-growth.mdc missing');
} else {
    const ruleMonoliths = extractBacktickPaths(monoRule);
    for (const f of MONOLITH_SHELL_FILES) {
        if (!ruleMonoliths.has(f)) fail(`no-monolith-growth.mdc missing monolith path ${f}`);
    }
    if (agents) {
        for (const f of MONOLITH_SHELL_FILES) {
            if (!agents.includes(f)) fail(`AGENTS.md missing monolith path ${f}`);
        }
        ok('AGENTS.md monolith list matches no-monolith-growth.mdc');
    }
    ok('no-monolith-growth.mdc lists all expected monolith shells');
    if (!monoRule.includes('Soft LOC ceilings')) fail('no-monolith-growth.mdc missing Soft LOC ceilings section');
    else ok('no-monolith-growth.mdc documents Soft LOC ceilings');
    if (!monoRule.includes('5400')) fail('no-monolith-growth.mdc missing app.js soft max 5400');
    if (!monoRule.includes('create*')) fail('no-monolith-growth.mdc missing create*(deps) pattern');
    if (!monoRule.includes('warnMissingRendererCores')) {
        fail('no-monolith-growth.mdc missing warnMissingRendererCores registration note');
    } else {
        ok('no-monolith-growth.mdc documents core registration checklist');
    }
}

// 5b) Soft LOC ceilings on monolith shells
for (const f of MONOLITH_SHELL_FILES) {
    const max = MONOLITH_SOFT_MAX_LINES[f];
    const lines = countPhysicalLines(f);
    if (lines == null) {
        fail(`monolith shell missing: ${f}`);
        continue;
    }
    if (typeof max !== 'number') {
        fail(`MONOLITH_SOFT_MAX_LINES missing entry for ${f}`);
        continue;
    }
    if (lines > max) {
        fail(
            `monolith soft LOC ceiling: ${f} has ${lines} lines > max ${max} `
            + '(extract to *-core.js / electron helper before growing further; '
            + 'see .cursor/rules/no-monolith-growth.mdc)',
        );
    } else {
        ok(`monolith soft LOC ok: ${f} ${lines}/${max}`);
    }
}

// 5c) Docs / AGENTS mention soft ceilings
if (agents && agents.includes('5400') && agents.includes('软行数上限')) {
    ok('AGENTS.md documents monolith soft LOC ceilings');
} else if (agents) {
    fail('AGENTS.md missing soft LOC ceiling summary (5400 / 软行数上限)');
}
if (arch && arch.includes('5400') && arch.includes('软行数上限')) {
    ok('architecture.md documents monolith soft LOC ceilings');
} else if (arch) {
    fail('architecture.md missing soft LOC ceiling summary (5400 / 软行数上限)');
}
// 6) pro-closed-source-boundary ↔ proprietary-paths NEVER_GIT_TRACK (Pro subset)
const { NEVER_GIT_TRACK, PROPRIETARY_ALGORITHM_SOURCES } = require('./proprietary-paths');
const proRule = read('.cursor/rules/pro-closed-source-boundary.mdc');
if (!proRule) {
    fail('pro-closed-source-boundary.mdc missing');
} else {
    if (proRule.includes('tools/proprietary-paths.js')) ok('pro rule points to proprietary-paths.js');
    else fail('pro-closed-source-boundary.mdc missing proprietary-paths.js reference');
    for (const rel of PROPRIETARY_ALGORITHM_SOURCES.slice(0, 3)) {
        if (proRule.includes('NEVER_GIT_TRACK') || proRule.includes('proprietary-paths')) break;
    }
    const missingFromNever = PROPRIETARY_ALGORITHM_SOURCES.filter((rel) => !NEVER_GIT_TRACK.includes(rel));
    if (missingFromNever.length) {
        fail(`proprietary-paths: algorithm sources not in NEVER_GIT_TRACK: ${missingFromNever.join(', ')}`);
    } else {
        ok('all PROPRIETARY_ALGORITHM_SOURCES in NEVER_GIT_TRACK');
    }
}

// 7) AGENTS.md local-only paths ⊆ NEVER_GIT_TRACK
const localPaths = ['docs/', '.cursor/', 'tmp/', 'AGENTS.md', 'shared/'];
if (agents) {
    for (const p of localPaths) {
        if (!agents.includes(p.replace(/\/$/, '')) && !agents.includes(p)) {
            fail(`AGENTS.md should mention local path ${p}`);
        }
    }
    ok('AGENTS.md documents local-only paths');
}
for (const p of ['docs/', '.cursor/', 'tmp/', 'shared/']) {
    if (!NEVER_GIT_TRACK.includes(p)) fail(`NEVER_GIT_TRACK missing ${p}`);
}
if (!NEVER_GIT_TRACK.includes('AGENTS.md')) fail('NEVER_GIT_TRACK missing AGENTS.md');
else ok('NEVER_GIT_TRACK includes AGENTS.md');

// 8) Settings round-trip: assembleSavedOptionsFromFields keys ⊆ normalizeTransWithAiRuntimeOptions
try {
    const settingsNormCore = require('../src/js/settings-options-normalize-core');
    const { assembleSavedOptionsFromFields } = require('../src/js/settings-saved-options-core');
    const { normalizeTransWithAiRuntimeOptions } = require('../electron/transwithai-bridge');
    const form = assembleSavedOptionsFromFields({
        task: 'translate',
        translateMode: 'llm',
        advancedEntitled: true,
    }, settingsNormCore);
    const normalized = normalizeTransWithAiRuntimeOptions(form);
    const missing = Object.keys(form).filter(
        (key) => !Object.prototype.hasOwnProperty.call(normalized, key),
    );
    if (missing.length) {
        fail(
            `settings persistence: normalizeTransWithAiRuntimeOptions drops keys: ${missing.join(', ')} `
            + '(see .cursor/rules/settings-persistence.mdc)',
        );
    } else {
        ok('settings round-trip: all assembleSavedOptionsFromFields keys survive normalize');
    }
} catch (err) {
    fail(`settings persistence check failed: ${err.message || err}`);
}

console.log('\n---');
if (issues.length) {
    console.log(`FAILED with ${issues.length} issue(s)`);
    process.exit(1);
}
console.log('PASSED agent rules consistency');
process.exit(0);
