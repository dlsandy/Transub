const assert = require('assert');
const bar = require('../src/js/factory-status-bar-core');

describe('factory-status-bar-core', () => {
    it('summarizeLatestLogLine strips time and truncates', () => {
        const s = bar.summarizeLatestLogLine('[09:54:12] 任务 film_a.mkv 进入翻译阶段', 20);
        assert.strictEqual(s.time, '09:54:12');
        assert.ok(s.body.length <= 20);
        assert.ok(s.full.includes('film_a'));
    });

    it('summarizeLatestLogLine empty', () => {
        assert.deepStrictEqual(bar.summarizeLatestLogLine(''), { time: '', body: '', full: '' });
        assert.deepStrictEqual(bar.summarizeLatestLogLine('   '), { time: '', body: '', full: '' });
    });

    it('resolveEngineStatus', () => {
        assert.strictEqual(bar.resolveEngineStatus({ running: true }).key, 'busy');
        assert.strictEqual(bar.resolveEngineStatus({ envBannerVisible: true }).key, 'offline');
        assert.strictEqual(bar.resolveEngineStatus({}).key, 'ready');
    });

    it('buildResourceChips from sample', () => {
        const chips = bar.buildResourceChips({
            cpuPct: 28,
            memory: { usedBytes: 6.2 * (1024 ** 3), totalBytes: 16 * (1024 ** 3), usedPct: 39 },
            gpu: { utilPct: 12, memUsedMiB: 3100, memTotalMiB: 8192 },
        });
        assert.deepStrictEqual(chips.map((c) => c.id), ['cpu', 'mem', 'gpu', 'vram']);
        assert.strictEqual(chips[0].value, '28%');
    });

    it('buildResourceChips always placeholders GPU/VRAM when undetected', () => {
        const chips = bar.buildResourceChips({
            cpuPct: 5,
            memory: { usedBytes: 4 * (1024 ** 3), totalBytes: 16 * (1024 ** 3), usedPct: 25 },
            gpu: null,
        });
        assert.deepStrictEqual(chips.map((c) => c.id), ['cpu', 'mem', 'gpu', 'vram']);
        const gpu = chips.find((c) => c.id === 'gpu');
        const vram = chips.find((c) => c.id === 'vram');
        assert.strictEqual(gpu.value, '—');
        assert.strictEqual(gpu.pct, null);
        assert.strictEqual(vram.value, '—');
        assert.strictEqual(vram.pct, null);
    });

    it('buildResourceChips reserves GPU/VRAM placeholders with no sample', () => {
        const chips = bar.buildResourceChips(null);
        assert.deepStrictEqual(chips.map((c) => c.id), ['gpu', 'vram']);
        assert.strictEqual(chips[0].value, '—');
        assert.strictEqual(chips[1].value, '—');
    });

    it('computeLogSheetAnchorStyle anchors sheet to status log', () => {
        assert.strictEqual(bar.computeLogSheetAnchorStyle(null, { height: 800 }), null);
        const style = bar.computeLogSheetAnchorStyle(
            { left: 82, top: 746, width: 600, height: 34, bottom: 780 },
            { width: 1280, height: 800 },
        );
        assert.deepStrictEqual(style, {
            left: '82px',
            width: '600px',
            bottom: '20px',
        });
    });
});
