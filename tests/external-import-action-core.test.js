const assert = require('assert');
const core = require('../src/js/external-import-action-core');

describe('external-import-action-core', () => {
    it('normalizes external import actions', () => {
        assert.strictEqual(core.normalizeExternalImportAction('list_and_start'), 'list_and_start');
        assert.strictEqual(core.normalizeExternalImportAction('nope'), 'list_when_idle');
        assert.strictEqual(core.normalizeExternalImportAction('', 'list_only'), 'list_only');
    });

    it('passes when gpu, vram and memory are below thresholds', () => {
        const out = core.evaluateResourceIdleSample({
            memory: { usedPct: 60 },
            gpu: { utilPct: 8, memUsedMiB: 2048, memTotalMiB: 8192 },
        });
        assert.strictEqual(out.ok, true);
        assert.deepStrictEqual(out.blockers, []);
    });

    it('blocks on high gpu, vram or memory usage', () => {
        const gpuHigh = core.evaluateResourceIdleSample({
            memory: { usedPct: 50 },
            gpu: { utilPct: 40, memUsedMiB: 1024, memTotalMiB: 8192 },
        });
        assert.strictEqual(gpuHigh.ok, false);
        assert.ok(gpuHigh.blockers.some((b) => b.startsWith('GPU')));

        const vramHigh = core.evaluateResourceIdleSample({
            memory: { usedPct: 50 },
            gpu: { utilPct: 5, memUsedMiB: 7000, memTotalMiB: 8192 },
        });
        assert.strictEqual(vramHigh.ok, false);
        assert.ok(vramHigh.blockers.some((b) => b.startsWith('显存')));

        const memHigh = core.evaluateResourceIdleSample({
            memory: { usedPct: 92 },
            gpu: null,
        });
        assert.strictEqual(memHigh.ok, false);
        assert.ok(memHigh.blockers.some((b) => b.startsWith('内存')));
    });

    it('checks memory only when gpu metrics are unavailable', () => {
        const out = core.evaluateResourceIdleSample({
            memory: { usedPct: 70 },
            gpu: null,
        });
        assert.strictEqual(out.ok, true);
    });
});
