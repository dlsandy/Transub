const assert = require('assert');
const qc = require('../src/js/per-item-qc-pipeline-core');

describe('per-item-qc-pipeline-core', () => {
    it('shouldDeferItemDone when scan or fix enabled', () => {
        assert.strictEqual(qc.shouldDeferItemDone({ qcScanEnabled: false, qcFixMode: 'none' }), false);
        assert.strictEqual(qc.shouldDeferItemDone({ qcScanEnabled: true, qcFixMode: 'none' }), true);
        assert.strictEqual(qc.shouldDeferItemDone({ qcScanEnabled: false, qcFixMode: 'smart' }), true);
    });

    it('mapQcFixProgress spans 98–100', () => {
        assert.strictEqual(qc.mapQcFixProgress(0), 98);
        assert.strictEqual(qc.mapQcFixProgress(100), 100);
        assert.strictEqual(qc.mapQcFixProgress(50), 99);
    });

    it('shouldRunQcRepairPass when fix or smart selected', () => {
        assert.strictEqual(qc.shouldRunQcRepairPass('none'), false);
        assert.strictEqual(qc.shouldRunQcRepairPass('fix'), true);
        assert.strictEqual(qc.shouldRunQcRepairPass('smart'), true);
    });

    it('resolveQcRepairMode falls back smart→fix without entitlement', () => {
        assert.strictEqual(qc.resolveQcRepairMode('smart', { smartEntitled: true }), 'smart');
        assert.strictEqual(qc.resolveQcRepairMode('smart', { smartEntitled: false }), 'fix');
        assert.strictEqual(qc.resolveQcRepairMode('fix', { smartEntitled: false }), 'fix');
    });

    it('resolveQcRepairMode downgrades smart→fix on speed profile', () => {
        assert.strictEqual(qc.resolveQcRepairMode('smart', {
            smartEntitled: true,
            perfProfile: 'speed',
        }), 'fix');
        assert.strictEqual(qc.resolveQcRepairMode('fix', { perfProfile: 'speed' }), 'fix');
        assert.strictEqual(qc.resolveQcRepairMode('none', { perfProfile: 'speed' }), 'none');
        assert.strictEqual(qc.resolveQcRepairMode('smart', {
            smartEntitled: true,
            perfProfile: 'quality',
        }), 'smart');
        assert.strictEqual(qc.isSpeedPerfProfile('fast'), true);
    });

    it('mapPostTaskProgress covers full finalize band', () => {
        assert.strictEqual(qc.mapPostTaskProgress('chinese', 100), 100);
    });

    it('qc_loop phase maps into QC band and has detail', () => {
        assert.strictEqual(qc.mapPostTaskProgress('qc_loop', 0), 98);
        assert.strictEqual(qc.postTaskPhaseDetail('qc_loop'), 'QC 闭环补译…');
    });
});
