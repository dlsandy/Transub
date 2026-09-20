'use strict';

const assert = require('assert');
const {
    createEngineDownloadJob,
    REQUIRED_HOST_KEYS,
} = require('../electron/engine-download-job');

function mockHost(overrides = {}) {
    const host = {
        getBatchRunning: () => false,
        getDownloadBusy: () => false,
        setDownloadBusy: () => {},
        getDownloadAbort: () => null,
        setDownloadAbort: () => {},
        getEngineProc: () => null,
        normalizeEngineDownloadKind: (k) => String(k || 'models'),
        broadcastEngineDownloadProgress: () => {},
        readMergedOptions: async () => ({}),
        stopEngineProcessAndPort: () => {},
        stopEngineProcess: () => {},
        sleep: async () => {},
        ensureEngineRunning: async () => ({ ok: false, error: 'engine_down' }),
        resolveEngineInstallPath: (p) => p || '',
        resolveEngineRuntimePython: () => '',
        DEFAULT_ENGINE_URL: 'http://127.0.0.1:8765',
        modelIdsNeedWhisperExtras: () => false,
        modelIdsNeedSensevoiceExtras: () => false,
        modelIdsNeedQwenExtras: () => false,
        ensureAsrWhisperOffline: async () => ({ ok: true }),
        ensureAsrSensevoiceOffline: async () => ({ ok: true }),
        ensureAsrQwen3Offline: async () => ({ ok: true }),
        ensureAudioSeparateRuntimeStream: async () => ({ ok: true }),
        getAudioSeparateRuntime: async () => ({ ok: true, data: {} }),
        ensureGpuRuntimeStream: async () => ({ ok: true }),
        getGpuRuntime: async () => ({ ok: true, data: { status: 'ready' } }),
        downloadModelsStream: async () => ({ ok: true, data: { results: [] } }),
        ...overrides,
    };
    return host;
}

describe('engine-download-job', () => {
    it('exports createEngineDownloadJob', () => {
        assert.strictEqual(typeof createEngineDownloadJob, 'function');
        assert.ok(Array.isArray(REQUIRED_HOST_KEYS));
        assert.ok(REQUIRED_HOST_KEYS.length > 5);
    });

    it('throws without host', () => {
        assert.throws(() => createEngineDownloadJob(null), /host required/);
        assert.throws(() => createEngineDownloadJob(undefined), /host required/);
    });

    it('rejects incomplete host', () => {
        assert.throws(
            () => createEngineDownloadJob({ getBatchRunning: () => false }),
            /incomplete host/,
        );
    });

    it('exports runEngineDownload function', () => {
        const { runEngineDownload } = createEngineDownloadJob(mockHost());
        assert.strictEqual(typeof runEngineDownload, 'function');
    });

    it('returns busy error when download already running', async () => {
        const { runEngineDownload } = createEngineDownloadJob(mockHost({
            getDownloadBusy: () => true,
        }));
        const res = await runEngineDownload({ kind: 'models' });
        assert.strictEqual(res.ok, false);
        assert.match(String(res.error || ''), /已有下载任务/);
    });

    it('returns busy error when batch is running', async () => {
        const { runEngineDownload } = createEngineDownloadJob(mockHost({
            getBatchRunning: () => true,
        }));
        const res = await runEngineDownload({ kind: 'models' });
        assert.strictEqual(res.ok, false);
        assert.match(String(res.error || ''), /字幕任务进行中/);
    });
});
