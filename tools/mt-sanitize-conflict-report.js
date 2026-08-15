#!/usr/bin/env node
/**
 * Conflict report for MT sanitize / opaque / ASR domain.
 *
 * Layers:
 * 1) Declarative intents (mt-sanitize-intent-core) — strip↔remap pairs, ASR↔ZH, fixture refs
 * 2) FIX key-name heuristics — catch undeclared opposing OkZh / strip* keys
 *
 * Exit 0 = no high-severity conflicts; 1 = conflicts found; 2 = tool error.
 * See docs/mt-sanitize.md and .cursor/rules/mt-sanitize-anti-regression.mdc
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outPath = path.join(root, 'tmp', 'mt-sanitize-conflict-report.json');
const intentCore = require('../src/js/mt-sanitize-intent-core');

/**
 * True strip/hallucination removers — not blank*OkZh recovery fills.
 * @param {string} key
 */
function isStripLikeFixKey(key) {
    const k = String(key || '');
    if (!k) return false;
    // blankFooOkZh means "blank JA → fill ZH", not strip.
    if (/OkZh$/i.test(k)) return false;
    if (/^blank/i.test(k) && /Ok/i.test(k)) return false;
    return /strip|halluc|remove|clear|drop|delete/i.test(k);
}

/**
 * Clinical / recovery remaps that intentionally keep a ZH form.
 * @param {string} key
 */
function isRemapLikeFixKey(key) {
    const k = String(key || '');
    if (!k) return false;
    if (isStripLikeFixKey(k)) return false;
    return /OkZh$/i.test(k) || /remap|clinical|rod|meat/i.test(k);
}

function analyzeFixConflicts(FIX = {}) {
    const conflicts = [];
    const warnings = [];
    /** @type {Map<string, string[]>} */
    const zhToFixKeys = new Map();
    for (const [key, val] of Object.entries(FIX)) {
        const zh = String(val || '').trim();
        if (!zh || zh.length < 2) continue;
        if (!zhToFixKeys.has(zh)) zhToFixKeys.set(zh, []);
        zhToFixKeys.get(zh).push(key);
    }

    for (const [zh, keys] of zhToFixKeys) {
        if (keys.length < 2) continue;
        const stripish = keys.filter(isStripLikeFixKey);
        const remapish = keys.filter(isRemapLikeFixKey);
        if (stripish.length && remapish.length) {
            conflicts.push({
                kind: 'strip_vs_remap_same_zh',
                severity: 'high',
                zh,
                a: stripish,
                b: remapish,
                note: 'Same ZH string appears under strip-like and remap-like FIX keys — declare intents + lock both fixtures',
            });
        } else if (keys.length >= 4) {
            warnings.push({
                kind: 'shared_zh_many_keys',
                severity: 'low',
                zh,
                keys,
                note: 'Multiple FIX keys share the same ZH (often synonymous OkZh recoveries — not a conflict)',
            });
        } else if (remapish.length >= 2 && stripish.length === 0 && keys.length >= 2) {
            warnings.push({
                kind: 'shared_okzh_synonyms',
                severity: 'info',
                zh,
                keys: remapish,
                note: 'Several OkZh keys recover to the same phrase — expected synonym, not strip vs remap',
            });
        }
    }

    return { conflicts, warnings, zhToFixKeys };
}

/**
 * Build conflict report object (no I/O).
 * @param {{ testSource?: string }} [opts]
 * @returns {{
 *   generatedAt: string,
 *   conflictCount: number,
 *   warningCount: number,
 *   highSeverity: number,
 *   opposingPairCount: number,
 *   conflicts: object[],
 *   warnings: object[],
 *   opposingPairs: object[],
 *   ok: boolean,
 * }}
 */
/**
 * Runtime polarity / opposing-surface probes (sanitize live).
 * Catches 射了↔要去了 and パンパン↔肉棒 regressions beyond FIX key heuristics.
 */
function analyzePolarityProbes() {
    const sanitize = require('../src/js/mt-sanitize-core');
    const av = { contentProfile: 'av_soft' };
    const conflicts = [];
    const warnings = [];

    const probes = [
        {
            id: 'female.manko.go',
            zh: '要射了',
            ja: 'おまんこいっちゃう…',
            expect: (t) => /去了/.test(t) && !/要射了/.test(t),
            severity: 'high',
            note: 'Female manko climax must not stay male 要射了',
        },
        {
            id: 'sensei.nipple.go',
            zh: '老师',
            ja: 'せんせい、乳首でイキます…',
            expect: (t) => /去了|乳头/.test(t) && !/要射了/.test(t) && !/^老师$/.test(t.trim()),
            severity: 'high',
            note: 'Teacher + nipple iku stub should recover female-leaning gloss',
        },
        {
            id: 'male.iku.shoot',
            zh: '…',
            ja: 'イクッ!',
            expect: (t) => /射了|要射/.test(t),
            severity: 'high',
            note: 'Bare male iku blank recover should prefer 射了',
        },
        {
            id: 'panpan.no.rod',
            zh: '竟然变成了老公的鸡鸡棒棒了 哈',
            ja: 'っちゃった…はぁ…パンパン…',
            expect: (t) => !/鸡鸡|肉棒/.test(t),
            severity: 'high',
            note: 'パンパン must not invent rod ZH',
        },
        {
            id: 'chikubi.not.chicken',
            zh: '是鸡鸡吗？',
            ja: 'ちくび?',
            expect: (t) => /乳头/.test(t) && !/鸡鸡/.test(t),
            severity: 'high',
            note: 'ちくび ≠ 鸡鸡',
        },
        {
            id: 'clinical.rod.keep',
            zh: '男性生殖器好大',
            ja: 'デカチンすごい',
            expect: (t) => /肉棒|大/.test(t),
            severity: 'high',
            note: 'Clinical/dekachin remap to 肉棒 must survive',
        },
    ];

    for (const p of probes) {
        let out;
        try {
            out = sanitize.sanitizeMtCueText(p.zh, p.ja, av);
        } catch (err) {
            warnings.push({
                kind: 'polarity_probe_error',
                severity: 'low',
                id: p.id,
                note: String(err && err.message || err),
            });
            continue;
        }
        if (!p.expect(String(out.text || ''))) {
            conflicts.push({
                kind: 'polarity_probe_fail',
                severity: p.severity || 'high',
                id: p.id,
                zh: p.zh,
                ja: p.ja,
                after: out.text,
                note: p.note,
            });
        }
    }

    return { conflicts, warnings };
}

function buildReport(opts = {}) {
    const opaque = require('../src/js/mt-opaque-strings');
    const FIX = opaque.FIX || {};

    const testPath = path.join(root, 'tests', 'mt-sanitize.test.js');
    let testSource = opts.testSource;
    if (testSource == null) {
        try {
            testSource = fs.readFileSync(testPath, 'utf8');
        } catch (_) {
            testSource = '';
        }
    }

    const intentResult = intentCore.analyzeIntents({ opaque, testSource });
    const { conflicts: fixConflicts, warnings: fixWarnings } = analyzeFixConflicts(FIX);
    const opposingPairs = intentCore.listOpposingPairs(intentResult.intents);
    const polarity = analyzePolarityProbes();

    const conflicts = [...intentResult.conflicts, ...fixConflicts, ...polarity.conflicts];
    const warnings = [...intentResult.warnings, ...fixWarnings, ...polarity.warnings];

    const high = conflicts.filter((c) => c.severity === 'high');
    return {
        generatedAt: new Date().toISOString(),
        conflictCount: conflicts.length,
        warningCount: warnings.length,
        highSeverity: high.length,
        opposingPairCount: opposingPairs.length,
        polarityProbeFails: polarity.conflicts.length,
        polarityProbeRan: true,
        conflicts,
        warnings,
        opposingPairs,
        ok: high.length === 0,
    };
}

/**
 * Write report JSON and set process.exitCode.
 * @param {{ writeFile?: boolean, testSource?: string }} [opts]
 */
function main(opts = {}) {
    const writeFile = opts.writeFile !== false;
    const report = buildReport(opts);

    if (writeFile) {
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
        console.log(`Wrote ${outPath}`);
    }
    console.log(
        `conflicts=${report.conflictCount} warnings=${report.warningCount}`
        + ` high=${report.highSeverity} opposingPairs=${report.opposingPairCount}`,
    );
    if (report.highSeverity) {
        for (const c of report.conflicts.filter((x) => x.severity === 'high')) {
            console.log(`  [high] ${c.kind}: ${String(c.zh || c.fixtureRef || '').slice(0, 40)} …`);
        }
        process.exitCode = 1;
        return report;
    }
    process.exitCode = 0;
    return report;
}

module.exports = {
    isStripLikeFixKey,
    isRemapLikeFixKey,
    analyzeFixConflicts,
    analyzePolarityProbes,
    buildReport,
    main,
    outPath,
    intentCore,
};

if (require.main === module) {
    try {
        main();
    } catch (err) {
        console.error(err);
        process.exitCode = 2;
    }
}
