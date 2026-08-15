const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
    isStripLikeFixKey,
    isRemapLikeFixKey,
    analyzeFixConflicts,
    buildReport,
} = require('../tools/mt-sanitize-conflict-report');

describe('mt-sanitize-conflict-report tool', () => {
    it('classifies OkZh / blank*Ok as remap, not strip', () => {
        assert.strictEqual(isStripLikeFixKey('blankIkuOkZh'), false);
        assert.strictEqual(isRemapLikeFixKey('blankIkuOkZh'), true);
        assert.strictEqual(isStripLikeFixKey('stripMeatRodHallucZh'), true);
        assert.strictEqual(isRemapLikeFixKey('meatRodClinicalRemapZh'), true);
    });

    it('does not flag synonym OkZh sharing as high conflict', () => {
        const { conflicts, warnings } = analyzeFixConflicts({
            blankIkuOkZh: '要射了',
            blankDashIkuOkZh: '要射了',
            anotherIkuOkZh: '要射了',
        });
        assert.strictEqual(conflicts.length, 0);
        assert.ok(warnings.some((w) => w.kind === 'shared_okzh_synonyms'));
    });

    it('flags real strip vs remap on same ZH as high', () => {
        const { conflicts } = analyzeFixConflicts({
            stripFooHalluc: '肉棒',
            meatRodClinicalOkZh: '肉棒',
        });
        assert.strictEqual(conflicts.length, 1);
        assert.strictEqual(conflicts[0].severity, 'high');
        assert.strictEqual(conflicts[0].kind, 'strip_vs_remap_same_zh');
    });

    it('buildReport includes opposingPairs and passes with no high', () => {
        const report = buildReport();
        assert.strictEqual(report.ok, true);
        assert.strictEqual(report.highSeverity, 0);
        assert.ok(report.opposingPairCount >= 1);
        assert.ok(Array.isArray(report.opposingPairs));
        assert.ok(report.opposingPairs.some((p) =>
            String(p.a).includes('meatRod') || String(p.b).includes('meatRod')));
        assert.ok(Array.isArray(report.warnings));
        assert.ok(report.warnings.some((w) => w.kind === 'declared_opposing_pair'));
    });

    it('runs and writes a JSON report with exit 0 (no high)', () => {
        const script = path.join(__dirname, '..', 'tools', 'mt-sanitize-conflict-report.js');
        const out = path.join(__dirname, '..', 'tmp', 'mt-sanitize-conflict-report.json');
        const res = spawnSync(process.execPath, [script], {
            cwd: path.join(__dirname, '..'),
            encoding: 'utf8',
        });
        assert.strictEqual(res.status, 0, `expected exit 0, got ${res.status}: ${res.stderr || res.stdout}`);
        assert.ok(fs.existsSync(out), 'report file missing');
        const report = JSON.parse(fs.readFileSync(out, 'utf8'));
        assert.ok(typeof report.conflictCount === 'number');
        assert.strictEqual(report.highSeverity, 0);
        assert.ok(typeof report.opposingPairCount === 'number');
        assert.ok(Array.isArray(report.conflicts));
        assert.ok(Array.isArray(report.warnings));
        assert.ok(Array.isArray(report.opposingPairs));
    });
});
