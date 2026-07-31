const assert = require('assert');
const {
    formatResourceUsageText,
    formatGiBFromBytes,
    formatGiBFromMiB,
    parseNvidiaCsvLine,
    _resetSystemResourcesStateForTests,
} = require('../electron/system-resources');
const { mergeTransWithAiOptions } = require('../electron/transwithai-options');

describe('system-resources', () => {
    beforeEach(() => {
        _resetSystemResourcesStateForTests();
    });

    it('parses nvidia-smi csv lines', () => {
        const parsed = parseNvidiaCsvLine('87, 6123, 8192');
        assert.deepStrictEqual(parsed, {
            utilPct: 87,
            memUsedMiB: 6123,
            memTotalMiB: 8192,
        });
        assert.strictEqual(parseNvidiaCsvLine(''), null);
        assert.strictEqual(parseNvidiaCsvLine('x, y, z'), null);
    });

    it('formats gib helpers', () => {
        assert.strictEqual(formatGiBFromBytes(8 * 1024 ** 3), '8.0');
        assert.strictEqual(formatGiBFromMiB(8192), '8.0');
        assert.strictEqual(formatGiBFromMiB(6144), '6.0');
    });

    it('formats status text parts', () => {
        const text = formatResourceUsageText({
            cpuPct: 42,
            memory: {
                usedBytes: 9.2 * 1024 ** 3,
                totalBytes: 16 * 1024 ** 3,
            },
            gpu: {
                utilPct: 91,
                memUsedMiB: 5800,
                memTotalMiB: 8192,
            },
        });
        assert.ok(text.includes('CPU 42%'));
        assert.ok(text.includes('内存'));
        assert.ok(text.includes('GPU 91%'));
        assert.ok(text.includes('显存'));
    });

    it('omits gpu when absent', () => {
        const text = formatResourceUsageText({
            cpuPct: 10,
            memory: { usedBytes: 1024 ** 3, totalBytes: 8 * 1024 ** 3 },
            gpu: null,
        });
        assert.ok(text.includes('CPU 10%'));
        assert.ok(!text.includes('GPU'));
    });
});

describe('showTaskResourceUsage option', () => {
    it('defaults to enabled', () => {
        const opts = mergeTransWithAiOptions({});
        assert.strictEqual(opts.showTaskResourceUsage, true);
    });

    it('preserves explicit false', () => {
        const opts = mergeTransWithAiOptions({ showTaskResourceUsage: false });
        assert.strictEqual(opts.showTaskResourceUsage, false);
    });
});
