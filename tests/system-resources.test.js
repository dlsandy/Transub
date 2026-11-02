const assert = require('assert');
const {
    formatResourceUsageText,
    formatGiBFromBytes,
    formatGiBFromMiB,
    parseNvidiaCsvLine,
    parseAdapterRamBytes,
    resolveAmdVramBytes,
    ADAPTER_RAM_UINT32_CAP_BYTES,
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
        assert.deepStrictEqual(parseNvidiaCsvLine('19 %, 7587 MiB, 10240 MiB'), {
            utilPct: 19,
            memUsedMiB: 7587,
            memTotalMiB: 10240,
        });
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

    it('formats amd total-vram without used', () => {
        const text = formatResourceUsageText({
            cpuPct: 12,
            memory: { usedBytes: 8 * 1024 ** 3, totalBytes: 32 * 1024 ** 3 },
            gpu: {
                vendor: 'amd',
                utilPct: null,
                memUsedMiB: null,
                memTotalMiB: 16384,
            },
        });
        assert.ok(text.includes('GPU AMD'));
        assert.ok(text.includes('显存 —/16.0 GB'));
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

    it('resolveAmdVramBytes prefers registry over capped AdapterRAM', () => {
        const capped = ADAPTER_RAM_UINT32_CAP_BYTES; // ~4 GiB uint32 max
        const real = 16 * 1024 * 1024 * 1024;
        assert.strictEqual(resolveAmdVramBytes(real, capped), real);
        assert.strictEqual(resolveAmdVramBytes(null, capped), capped);
        assert.strictEqual(parseAdapterRamBytes(-1048576), 4293918720);
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
