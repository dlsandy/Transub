const assert = require('assert');
const progress = require('../src/js/qwen-asr-progress-core');

describe('qwen-asr-progress-core', () => {
    it('parseBatchFromDetail reads island plan line', () => {
        const p = progress.parseBatchFromDetail(
            'TEN 人声帧 120 段 · 批 12 (aggressive) | Qwen3-ASR',
        );
        assert.strictEqual(p.batch, 12);
        assert.strictEqual(p.mode, 'aggressive');
        assert.strictEqual(p.tag, '批 12 (aggressive)');
    });

    it('applyProgressDetail sticks batch tag on frame ticks', () => {
        const plan = progress.applyProgressDetail(
            'TEN 人声帧 80 段 · 批 8 (auto) | Qwen3-ASR',
            null,
        );
        assert.ok(plan.sticky);
        const tick = progress.applyProgressDetail('TEN 1–8/80 · 00:45', plan.sticky);
        assert.ok(tick.detail.includes('批 8 (auto)'));
    });

    it('does not stick non-Qwen progress lines', () => {
        const out = progress.applyProgressDetail('分窗 2/10 · 00:30', null);
        assert.strictEqual(out.sticky, null);
        assert.strictEqual(out.detail, '分窗 2/10 · 00:30');
    });
});
