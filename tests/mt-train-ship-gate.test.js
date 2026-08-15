'use strict';

const assert = require('assert');
const shipGate = require('../tools/mt-train/lib/ship-gate');
const { buildReport } = require('../tools/mt-sanitize-conflict-report');

describe('mt-train ship-gate', () => {
    it('buildReport returns ok flag and counts', () => {
        const report = buildReport();
        assert.ok(report && typeof report === 'object');
        assert.strictEqual(typeof report.ok, 'boolean');
        assert.strictEqual(report.ok, report.highSeverity === 0);
        assert.ok(Number.isFinite(report.conflictCount));
        assert.ok(Number.isFinite(report.warningCount));
    });

    it('runConflictStep mirrors buildReport ok', () => {
        const lines = [];
        const step = shipGate.runConflictStep((line) => lines.push(line));
        assert.strictEqual(step.ok, !!(step.report && step.report.ok));
        assert.ok(lines.some((l) => /conflicts=/.test(l)));
        assert.ok(step.summary);
    });
});
