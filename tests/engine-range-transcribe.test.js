'use strict';

const assert = require('assert');
const path = require('path');
const { createEngineRangeTranscribe } = require('../electron/engine-range-transcribe');

function mockHost(overrides = {}) {
    return {
        batchCancelled: false,
        batchRunning: false,
        currentJobId: '',
        appendEngineLogLine: () => {},
        buildAudioJobOptions: () => ({}),
        buildVadJobOptions: () => ({}),
        createJob: async () => ({ ok: false }),
        ensureEngineRunning: async () => ({ ok: true, baseUrl: 'http://127.0.0.1:9' }),
        friendlyEngineError: (e) => e,
        mapDeviceForEngine: (d) => d,
        mapTaskToEngineTask: (t) => t,
        mergeEngineOptions: (o) => ({ ...(o || {}) }),
        rangeAsrPolicy: {
            clampRangeWindow: ({ startMs, endMs, padMs }) => ({
                startMs: Number(startMs) || 0,
                endMs: Number(endMs) || 1000,
                padMs: Number(padMs) || 0,
                clipStartMs: Number(startMs) || 0,
                clipEndMs: Number(endMs) || 1000,
            }),
            resolveRangeAsrMtModel: () => '',
            isRetryableAsrFail: () => false,
            isEmptyAsrFail: () => false,
            remapClipCuesToTimeline: (cues) => cues,
        },
        releaseGpuMemory: async () => {},
        resolveQwenAsrBatchModeForJob: () => ({}),
        resolveRangeAsrFailoverCandidates: (primary) => [primary || 'sensevoice-small'],
        sampleJobGpuVramHint: async () => ({}),
        waitJob: async () => ({ ok: false }),
        ...overrides,
    };
}

describe('engine-range-transcribe', () => {
    it('exports createEngineRangeTranscribe', () => {
        assert.strictEqual(typeof createEngineRangeTranscribe, 'function');
    });

    it('throws without host', () => {
        assert.throws(() => createEngineRangeTranscribe(null), /host required/);
    });

    it('returns ok:false when media path is missing', async () => {
        const { transcribeRangeWithEngine } = createEngineRangeTranscribe(mockHost());
        const res = await transcribeRangeWithEngine({
            mediaPath: path.join('F:', 'Transub3', '__no_such_media__.mp4'),
            startMs: 0,
            endMs: 2000,
        });
        assert.strictEqual(res.ok, false);
        assert.match(String(res.error || ''), /媒体文件不存在/);
    });

    it('honors itemCancelled during batch and does not clear stop flags', async () => {
        const host = mockHost({
            itemCancelled: true,
            batchCancelled: true,
            batchRunning: true,
        });
        const { transcribeRangeWithEngine } = createEngineRangeTranscribe(host);
        const res = await transcribeRangeWithEngine({
            mediaPath: __filename,
            startMs: 0,
            endMs: 2000,
            allowDuringBatch: true,
        });
        assert.strictEqual(res.cancelled, true);
        assert.strictEqual(res.code, 'cancelled');
        assert.strictEqual(host.batchCancelled, true);
        assert.strictEqual(host.itemCancelled, true);
    });

    it('clears stale cancel flags for standalone editor clips', async () => {
        const host = mockHost({
            batchCancelled: true,
            itemCancelled: true,
            batchRunning: false,
            ensureEngineRunning: async () => ({ ok: false, error: 'skip' }),
        });
        const { transcribeRangeWithEngine } = createEngineRangeTranscribe(host);
        await transcribeRangeWithEngine({
            mediaPath: __filename,
            startMs: 0,
            endMs: 2000,
        });
        assert.strictEqual(host.batchCancelled, false);
        assert.strictEqual(host.itemCancelled, false);
    });
});
