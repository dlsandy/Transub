const assert = require('assert');

/**
 * Mirrors sakura-translate chunk aggregation salvage policy.
 */
function aggregateChunkResults(chunkResults, { failBudgetRatio = 0.05, minFailBudget = 2 } = {}) {
    const failedChunks = [];
    const updates = [];
    for (const res of chunkResults) {
        if (!res?.ok) {
            failedChunks.push(res);
            continue;
        }
        updates.push(...(res.chunkUpdates || []));
    }
    const successChunks = chunkResults.length - failedChunks.length;
    if (!failedChunks.length) {
        return { ok: true, updates, failedChunks: [], salvaged: false };
    }
    const firstFail = failedChunks.find((r) => r?.code === 'cancelled') || failedChunks[0];
    if (firstFail?.code === 'cancelled') {
        return { ok: false, error: '已取消', code: 'cancelled', updates, failedChunks };
    }
    const failBudget = Math.max(minFailBudget, Math.ceil(chunkResults.length * failBudgetRatio));
    const salvageOk = successChunks > 0 && failedChunks.length <= failBudget;
    if (!salvageOk) {
        return {
            ok: false,
            error: firstFail?.error || '分块失败',
            code: firstFail?.code || 'chunk_failed',
            updates,
            failedChunks,
            successChunks,
        };
    }
    return {
        ok: true,
        updates,
        failedChunks,
        salvaged: true,
        successChunks,
    };
}

describe('sakura chunk salvage policy', () => {
    it('salvages near-complete runs like 1223/1231', () => {
        const results = [];
        for (let i = 0; i < 1223; i += 1) {
            results.push({ ok: true, chunkUpdates: [{ index: i, text: `t${i}` }] });
        }
        for (let i = 1223; i < 1231; i += 1) {
            results.push({ ok: false, error: '请求超时', code: 'timeout', cueCount: 1 });
        }
        const agg = aggregateChunkResults(results);
        assert.strictEqual(agg.ok, true);
        assert.strictEqual(agg.salvaged, true);
        assert.strictEqual(agg.updates.length, 1223);
        assert.strictEqual(agg.failedChunks.length, 8);
    });

    it('hard-fails when too many chunks fail', () => {
        const results = [
            { ok: true, chunkUpdates: [{ index: 0, text: 'a' }] },
            { ok: false, error: 'boom' },
            { ok: false, error: 'boom' },
            { ok: false, error: 'boom' },
        ];
        const agg = aggregateChunkResults(results);
        assert.strictEqual(agg.ok, false);
        assert.ok(agg.updates.length === 1);
    });

    it('propagates cancel', () => {
        const agg = aggregateChunkResults([
            { ok: true, chunkUpdates: [{ index: 0, text: 'a' }] },
            { ok: false, code: 'cancelled', error: '已取消' },
        ]);
        assert.strictEqual(agg.ok, false);
        assert.strictEqual(agg.code, 'cancelled');
    });
});

module.exports = { aggregateChunkResults };
