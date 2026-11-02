const assert = require('assert');
const policy = require('../src/js/mt-long-track-policy-core');
const { recoverSakuraChunkAfterFailure } = require('../electron/sakura-chunk-resilient');

describe('mt-long-track-policy', () => {
    it('resolveTrackSpanMs uses start/end extremes', () => {
        const span = policy.resolveTrackSpanMs([
            { index: 0, startMs: 1000, endMs: 2000 },
            { index: 1, startMs: 9_000_000, endMs: 9_001_000 },
        ]);
        assert.strictEqual(span, 9_000_000);
    });

    it('classify 2.5h+ span as long track', () => {
        assert.strictEqual(
            policy.isLongTrack({ cueCount: 100, spanMs: policy.LONG_SPAN_SOFT_MS }),
            true,
        );
        assert.strictEqual(
            policy.isLongTrack({ cueCount: 100, spanMs: policy.LONG_SPAN_SOFT_MS - 1 }),
            false,
        );
        assert.strictEqual(
            policy.isVeryLongTrack({ cueCount: policy.LONG_CUE_HARD, spanMs: 0 }),
            true,
        );
    });

    it('align audit budget caps long / very-long tracks', () => {
        const short = policy.resolveAlignAuditBudget({ cueCount: 40, spanMs: 60_000 });
        assert.strictEqual(short.run, true);
        assert.strictEqual(short.maxRetries, policy.ALIGN_AUDIT_MAX_DEFAULT);

        const long = policy.resolveAlignAuditBudget({
            cueCount: 100,
            spanMs: policy.LONG_SPAN_SOFT_MS,
        });
        assert.strictEqual(long.reason, 'long_track');
        assert.strictEqual(long.maxRetries, policy.ALIGN_AUDIT_MAX_LONG);

        const very = policy.resolveAlignAuditBudget({ cueCount: policy.LONG_CUE_HARD });
        assert.strictEqual(very.reason, 'very_long_track');
        assert.strictEqual(very.maxRetries, policy.ALIGN_AUDIT_MAX_VERY_LONG);

        const skip = policy.resolveAlignAuditBudget({
            cueCount: 900,
            skipAlignAudit: true,
        });
        assert.strictEqual(skip.run, false);
    });

    it('capAlignAuditIndexes truncates stably', () => {
        const capped = policy.capAlignAuditIndexes([1, 2, 3, 4, 5], { maxRetries: 3 });
        assert.deepStrictEqual(capped.indexes, [1, 2, 3]);
        assert.strictEqual(capped.truncated, true);
        assert.strictEqual(capped.dropped, 2);
    });

    it('long-track chunk timeout bumps to 120s (not external)', () => {
        assert.strictEqual(
            policy.resolveLongTrackChunkTimeoutMs({ cueCount: 50, spanMs: 0 }),
            policy.CHUNK_TIMEOUT_DEFAULT_MS,
        );
        assert.strictEqual(
            policy.resolveLongTrackChunkTimeoutMs({
                cueCount: 50,
                spanMs: policy.LONG_SPAN_SOFT_MS,
            }),
            policy.CHUNK_TIMEOUT_LONG_MS,
        );
        assert.strictEqual(
            policy.resolveLongTrackChunkTimeoutMs({ engineExternalMt: true }),
            policy.CHUNK_TIMEOUT_EXTERNAL_MS,
        );
        assert.strictEqual(
            policy.resolveLongTrackChunkTimeoutMs({ timeoutMs: 45000 }),
            45000,
        );
    });

    it('planHalfWindowSlices splits non-overlapping', () => {
        const cues = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ index: i, text: `t${i}` }));
        const slices = policy.planHalfWindowSlices(cues);
        assert.strictEqual(slices.length, 2);
        assert.strictEqual(slices[0].length, 4);
        assert.strictEqual(slices[1].length, 4);
        assert.strictEqual(
            policy.shouldAttemptChunkSplitRecovery(cues),
            true,
        );
        assert.strictEqual(
            policy.shouldAttemptChunkSplitRecovery([{ index: 0, text: 'a' }]),
            false,
        );
    });
});

describe('recoverSakuraChunkAfterFailure', () => {
    it('half-window recovers a timed-out multi-cue chunk', async () => {
        const cues = [0, 1, 2, 3].map((i) => ({ index: i, text: `ja${i}` }));
        let calls = 0;
        const translateCueBatch = async (batch) => {
            calls += 1;
            // First full-chunk attempts are not used here — recovery starts at half.
            if (batch.length >= 4) {
                return { ok: false, error: '超时', code: 'timeout', cues: [] };
            }
            return {
                ok: true,
                cues: batch.map((c) => ({ index: c.index, text: `zh${c.index}` })),
            };
        };
        const out = await recoverSakuraChunkAfterFailure({
            chunkCues: cues,
            batchCtx: {},
            translateCueBatch,
            priorBatch: { ok: false, error: '超时', code: 'timeout', cues: [] },
        });
        assert.strictEqual(out.ok, true);
        assert.strictEqual(out.recovered, true);
        assert.strictEqual(out.cues.length, 4);
        assert.ok(out.cues.every((c) => String(c.text).startsWith('zh')));
        assert.ok(calls >= 2);
    });

    it('falls back to per-cue when half-window also fails', async () => {
        const cues = [10, 11, 12, 13].map((i) => ({ index: i, text: `ja${i}` }));
        const translateCueBatch = async (batch) => {
            if (batch.length > 1) {
                return { ok: false, error: '超时', code: 'timeout', cues: [] };
            }
            return {
                ok: true,
                cues: [{ index: batch[0].index, text: `one-${batch[0].index}` }],
            };
        };
        const out = await recoverSakuraChunkAfterFailure({
            chunkCues: cues,
            batchCtx: {},
            translateCueBatch,
            priorBatch: { ok: false, error: '超时', code: 'timeout' },
        });
        assert.strictEqual(out.ok, true);
        assert.strictEqual(out.cues.filter((c) => c.text).length, 4);
    });
});
