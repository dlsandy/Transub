'use strict';

const assert = require('assert');
const { createEngineBatchLoop } = require('../electron/engine-batch-loop');

function mockHost(overrides = {}) {
    return {
        batchCancelled: false,
        batchRunning: false,
        currentJobId: '',
        batchMtAbortController: null,
        engineUiWindowManager: null,
        ensureEngineRunning: async () => ({ ok: false, error: 'engine_down', code: 'engine_down' }),
        appendEngineLogLine: () => {},
        batchMtPlan: {
            buildSanitizedFileMergedList: () => [],
            resolveBatchMtPlan: () => ({
                batchWantsSmart: false,
                batchWantsSakura: false,
                sakuraModelId: '',
            }),
        },
        batchPostprocessPlan: {},
        abortBatchMtAdapter: () => {},
        appendAsrRunToDetail: () => {},
        attachCheckpointResumeHint: () => {},
        batchRecovery: {},
        buildAudioJobOptions: () => ({}),
        buildCancelledItemResult: () => ({}),
        buildEngineJobFlags: () => ({}),
        buildExternalMtJobFields: () => ({}),
        buildFailedItemResult: () => ({}),
        buildSkippedItemResult: () => ({}),
        buildVadJobOptions: () => ({}),
        createJob: async () => ({}),
        emitToSubtitleUi: () => {},
        engineBatchHistory: {},
        extractOutputPaths: () => ({}),
        findEngineBundledFfmpeg: () => '',
        formatDomainFixLogLine: () => '',
        friendlyEngineError: (e) => e,
        getHealth: async () => ({}),
        getJobCheckpoint: async () => ({}),
        getTranslateProgressSession: () => ({}),
        interpretWaitJobResult: () => ({}),
        isQwenAsrModelId: () => false,
        mapDeviceForEngine: (d) => d,
        mapTaskToEngineTask: (t) => t,
        mergeSenseOverrides: (a) => a,
        mergeTranslateStyleOverrides: (a) => a,
        progressFieldsFromWaitEvent: () => null,
        reclaimLocalComputeAfterEngineBatch: () => {},
        recordEngineBatchHistory: () => {},
        releaseGpuMemory: async () => {},
        remapBridgeProgress: (_t, p) => p,
        resetTranslateProgressSession: () => {},
        resolveAsrFailoverCandidates: () => [],
        resolveEngineSubFormats: () => ['srt'],
        resolveExternalMtAdapterCall: () => ({}),
        resolveFileMtPlan: () => ({}),
        resolveQwenAsrBatchModeForJob: () => ({}),
        resolveReleaseGpuAfterForBatchItem: () => false,
        runEngineJobWithAsrFailover: async () => ({}),
        sampleJobGpuVramHint: () => null,
        sanitizeBatchEngineSseProgress: (x) => x,
        sanitizeSakuraMtForLanguage: (x) => x,
        sendProgress: () => {},
        shouldReleaseGpuAfterQwenBatch: () => false,
        softenTranslateProgressFields: (x) => x,
        startEngineMtAdapter: () => ({ stop() {} }),
        summarizeAsrRunMeta: () => ({}),
        summarizeDomainFixChanges: () => '',
        usesExternalMt: () => false,
        waitJob: async () => ({}),
        ...overrides,
    };
}

describe('engine-batch-loop', () => {
    it('exports createEngineBatchLoop', () => {
        assert.strictEqual(typeof createEngineBatchLoop, 'function');
    });

    it('throws without host', () => {
        assert.throws(() => createEngineBatchLoop(null), /host required/);
    });

    it('returns ensure failure when engine cannot start', async () => {
        const host = mockHost();
        const { runEngineBatchLocked } = createEngineBatchLoop(host);
        const res = await runEngineBatchLocked({
            list: [{ path: 'a.mp4' }],
            paths: ['a.mp4'],
            merged: {},
            invokeSender: null,
        });
        assert.strictEqual(res.ok, false);
        assert.strictEqual(res.code, 'engine_down');
        assert.strictEqual(host.batchRunning, false);
    });
});
