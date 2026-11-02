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

    it('emits a concrete error message when download throws', async () => {
        const events = [];
        let abort = { signal: { aborted: false, addEventListener() {}, removeEventListener() {} } };
        const { runEngineDownload } = createEngineDownloadJob(mockHost({
            broadcastEngineDownloadProgress: (info) => events.push(info),
            getDownloadAbort: () => abort,
            setDownloadAbort: (v) => { abort = v || abort; },
            readMergedOptions: async () => {
                throw undefined; // eslint-disable-line no-throw-literal
            },
        }));
        const res = await runEngineDownload({ kind: 'models', modelIds: ['qwen3-asr-1.7b'] });
        assert.strictEqual(res.ok, false);
        assert.ok(res.error && res.error !== 'undefined', res.error);
        const errEv = events.find((e) => e.phase === 'error');
        assert.ok(errEv);
        assert.ok(errEv.message && errEv.message !== 'undefined', errEv.message);
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

    it('returns cancelled when abort fires before the download starts', async () => {
        let ctrl = null;
        let downloaded = false;
        const { runEngineDownload } = createEngineDownloadJob(mockHost({
            setDownloadAbort: (v) => { ctrl = v; },
            getDownloadAbort: () => ctrl,
            readMergedOptions: async () => {
                ctrl.abort();
                return {};
            },
            downloadModelsStream: async () => {
                downloaded = true;
                return { ok: true, data: { results: [] } };
            },
        }));
        const res = await runEngineDownload({ kind: 'models', modelIds: ['whisper-tiny'] });
        assert.strictEqual(res.cancelled, true);
        assert.strictEqual(downloaded, false);
    });

    it('fails closed when deferred CUDA torch restart fails after Demucs ensure', async () => {
        let abort = { signal: { aborted: false, addEventListener() {}, removeEventListener() {} } };
        const events = [];
        let ensureCalls = 0;
        const { runEngineDownload } = createEngineDownloadJob(mockHost({
            broadcastEngineDownloadProgress: (info) => events.push(info),
            getDownloadAbort: () => abort,
            setDownloadAbort: (v) => { abort = v || abort; },
            resolveEngineRuntimePython: () => 'C:\\fake\\python.exe',
            ensureEngineRunning: async () => {
                ensureCalls += 1;
                if (ensureCalls === 1) return { ok: true, baseUrl: 'http://127.0.0.1:8765' };
                return {
                    ok: false,
                    error: '强制重启失败：引擎端口仍被占用',
                    code: 'force_restart_port_busy',
                };
            },
            ensureAudioSeparateRuntimeStream: async () => ({
                ok: true,
                data: {
                    ok: true,
                    restartRequired: true,
                    deferred: true,
                    code: 'TORCH_CUDA_DEFERRED',
                    message: '已下载 CUDA PyTorch，将在引擎重启后冷安装',
                },
            }),
        }));
        const res = await runEngineDownload({ kind: 'demucs', force: true });
        assert.strictEqual(res.ok, false);
        assert.match(String(res.error || ''), /冷安装|重启失败|补齐 CUDA/);
        assert.ok(events.some((e) => e.phase === 'error'));
        assert.ok(events.some((e) => e.suggestManual === true));
        assert.strictEqual(res.suggestManual, true);
        assert.ok(ensureCalls >= 2);
        assert.ok(events.some((e) => e.pct === 92 && /冷安装|92%|勿/.test(String(e.message || ''))));
    });

    it('cold-restarts when GPU ensure reports deferred torch under ok:false', async () => {
        let abort = { signal: { aborted: false, addEventListener() {}, removeEventListener() {} } };
        const events = [];
        let ensureCalls = 0;
        let stopped = 0;
        const { runEngineDownload } = createEngineDownloadJob(mockHost({
            broadcastEngineDownloadProgress: (info) => events.push(info),
            getDownloadAbort: () => abort,
            setDownloadAbort: (v) => { abort = v || abort; },
            getEngineProc: () => ({ pid: 1 }),
            stopEngineProcess: () => { stopped += 1; },
            ensureEngineRunning: async () => {
                ensureCalls += 1;
                if (ensureCalls === 1) return { ok: true, baseUrl: 'http://127.0.0.1:8765' };
                return { ok: false, error: '健康检查超时', code: 'engine_starting' };
            },
            ensureGpuRuntimeStream: async () => ({
                ok: false,
                error: 'CUDA PyTorch 未就绪',
                data: {
                    ok: false,
                    message: 'CUDA PyTorch 未就绪：将在引擎重启后冷安装',
                    torchCuda: {
                        ok: true,
                        deferred: true,
                        restartRequired: true,
                        code: 'TORCH_CUDA_DEFERRED',
                    },
                },
            }),
        }));
        const res = await runEngineDownload({ kind: 'gpu', force: true });
        assert.strictEqual(res.ok, false);
        assert.ok(stopped >= 1, 'should stop engine for cold install');
        assert.ok(ensureCalls >= 2, 'should retry ensure after deferred torch');
        assert.ok(events.some((e) => e.phase === 'error' && e.suggestManual));
        assert.match(String(res.error || ''), /冷安装|重启|手动修复/);
    });

    it('passes extrasPreflighted after cold Qwen extras so live engine skips in-process pip', async () => {
        let abort = { signal: { aborted: false, addEventListener() {}, removeEventListener() {} } };
        const bodies = [];
        let qwenOffline = 0;
        const { runEngineDownload } = createEngineDownloadJob(mockHost({
            getDownloadAbort: () => abort,
            setDownloadAbort: (v) => { abort = v || abort; },
            resolveEngineRuntimePython: () => 'C:\\fake\\python.exe',
            modelIdsNeedQwenExtras: (ids) => (ids || []).some((id) => String(id).includes('qwen3')),
            ensureAsrQwen3Offline: async () => {
                qwenOffline += 1;
                return { ok: true, skipped: true, reason: 'already_satisfied' };
            },
            ensureEngineRunning: async () => ({ ok: true, baseUrl: 'http://127.0.0.1:8765' }),
            downloadModelsStream: async (_url, body) => {
                bodies.push(body);
                return {
                    ok: true,
                    data: { results: [{ id: 'qwen3-asr-1.7b-ja-anime-galgame', ok: true }] },
                };
            },
        }));
        const res = await runEngineDownload({
            kind: 'models',
            modelIds: ['qwen3-asr-1.7b-ja-anime-galgame'],
        });
        assert.strictEqual(res.ok, true);
        assert.strictEqual(qwenOffline, 1);
        assert.strictEqual(bodies.length, 1);
        assert.strictEqual(bodies[0].extrasPreflighted, true);
        assert.deepStrictEqual(bodies[0].modelIds, ['qwen3-asr-1.7b-ja-anime-galgame']);
    });

    it('soft-continues Hub download when cold Qwen extras report process lock', async () => {
        let abort = { signal: { aborted: false, addEventListener() {}, removeEventListener() {} } };
        const events = [];
        const bodies = [];
        let qwenOffline = 0;
        const { runEngineDownload } = createEngineDownloadJob(mockHost({
            getDownloadAbort: () => abort,
            setDownloadAbort: (v) => { abort = v || abort; },
            broadcastEngineDownloadProgress: (info) => events.push(info),
            resolveEngineRuntimePython: () => 'C:\\fake\\python.exe',
            modelIdsNeedQwenExtras: (ids) => (ids || []).some((id) => String(id).includes('qwen3')),
            ensureAsrQwen3Offline: async () => {
                qwenOffline += 1;
                return {
                    ok: false,
                    code: 'EXTRAS_LOCKED_IN_PROCESS',
                    error: 'Qwen3-ASR 运行库已加载于当前引擎进程，无法原地重装',
                    message: 'Qwen3-ASR 运行库已加载于当前引擎进程，无法原地重装',
                };
            },
            ensureEngineRunning: async () => ({ ok: true, baseUrl: 'http://127.0.0.1:8765' }),
            downloadModelsStream: async (_url, body) => {
                bodies.push(body);
                return {
                    ok: true,
                    data: { results: [{ id: 'qwen3-asr-1.7b-ja-anime-galgame', ok: true }] },
                };
            },
        }));
        const res = await runEngineDownload({
            kind: 'models',
            modelIds: ['qwen3-asr-1.7b-ja-anime-galgame'],
        });
        assert.strictEqual(res.ok, true, JSON.stringify(res));
        // runOfflineExtras retries once on EXTRAS_LOCKED before soft-continue.
        assert.ok(qwenOffline >= 1, `expected offline ensure, got ${qwenOffline}`);
        assert.strictEqual(bodies.length, 1);
        assert.strictEqual(bodies[0].extrasPreflighted, true);
        assert.ok(
            events.some((e) => /继续下载模型权重|运行库暂未原地装好/i.test(String(e.message || ''))),
            JSON.stringify(events.map((e) => e.message).slice(0, 8)),
        );
    });

    it('cold-retries model download when live engine reports extras lock', async () => {
        let abort = { signal: { aborted: false, addEventListener() {}, removeEventListener() {} } };
        const bodies = [];
        let downloadCalls = 0;
        let stopped = 0;
        let qwenOffline = 0;
        const { runEngineDownload } = createEngineDownloadJob(mockHost({
            getDownloadAbort: () => abort,
            setDownloadAbort: (v) => { abort = v || abort; },
            resolveEngineRuntimePython: () => 'C:\\fake\\python.exe',
            modelIdsNeedQwenExtras: (ids) => (ids || []).some((id) => String(id).includes('qwen3')),
            stopEngineProcessAndPort: () => { stopped += 1; },
            ensureAsrQwen3Offline: async () => {
                qwenOffline += 1;
                return { ok: true, skipped: true };
            },
            ensureEngineRunning: async () => ({ ok: true, baseUrl: 'http://127.0.0.1:8765' }),
            downloadModelsStream: async (_url, body) => {
                downloadCalls += 1;
                bodies.push(body);
                if (downloadCalls === 1) {
                    return {
                        ok: false,
                        error: 'Qwen3-ASR 运行库已加载于当前引擎进程，无法原地重装',
                        data: { code: 'EXTRAS_LOCKED_IN_PROCESS' },
                    };
                }
                return {
                    ok: true,
                    data: { results: [{ id: 'qwen3-asr-1.7b-ja-anime-galgame', ok: true }] },
                };
            },
        }));
        const res = await runEngineDownload({
            kind: 'models',
            modelIds: ['qwen3-asr-1.7b-ja-anime-galgame'],
        });
        assert.strictEqual(res.ok, true);
        assert.ok(qwenOffline >= 2, `expected cold re-ensure, got ${qwenOffline}`);
        assert.ok(stopped >= 1);
        assert.strictEqual(downloadCalls, 2);
        assert.strictEqual(bodies[1].extrasPreflighted, true);
    });

    it('maps kind torch-cuda onto the GPU ensure path', async () => {
        let abort = { signal: { aborted: false, addEventListener() {}, removeEventListener() {} } };
        let gpuCalls = 0;
        let modelCalls = 0;
        const { runEngineDownload } = createEngineDownloadJob(mockHost({
            getDownloadAbort: () => abort,
            setDownloadAbort: (v) => { abort = v || abort; },
            ensureEngineRunning: async () => ({ ok: true, baseUrl: 'http://127.0.0.1:8765' }),
            ensureGpuRuntimeStream: async () => {
                gpuCalls += 1;
                return { ok: true, data: { ok: true, message: 'GPU 支持已就绪' } };
            },
            getGpuRuntime: async () => ({ ok: true, data: { hint: 'ready' } }),
            downloadModelsStream: async () => {
                modelCalls += 1;
                return { ok: true, data: { results: [] } };
            },
        }));
        const res = await runEngineDownload({ kind: 'torch-cuda', force: true });
        assert.strictEqual(res.ok, true);
        assert.strictEqual(gpuCalls, 1);
        assert.strictEqual(modelCalls, 0);
    });

    it('fails closed when GPU restart fails while CUDA torch cold-install is pending', async () => {
        const fs = require('fs');
        const os = require('os');
        const path = require('path');
        const markerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-pending-torch-'));
        const marker = path.join(markerDir, 'pending-torch-cuda-install.json');
        fs.writeFileSync(marker, JSON.stringify({ wheelPaths: [] }), 'utf8');
        const prev = process.env.TRANSUB_ENGINE_DATA;
        process.env.TRANSUB_ENGINE_DATA = markerDir;
        // Marker lives under wheel-cache/; recreate layout expected by ensure-running.
        const wheelCache = path.join(markerDir, 'wheel-cache');
        fs.mkdirSync(wheelCache, { recursive: true });
        fs.renameSync(marker, path.join(wheelCache, 'pending-torch-cuda-install.json'));
        try {
            let abort = { signal: { aborted: false, addEventListener() {}, removeEventListener() {} } };
            const events = [];
            let ensureCalls = 0;
            const { runEngineDownload } = createEngineDownloadJob(mockHost({
                broadcastEngineDownloadProgress: (info) => events.push(info),
                getDownloadAbort: () => abort,
                setDownloadAbort: (v) => { abort = v || abort; },
                ensureEngineRunning: async () => {
                    ensureCalls += 1;
                    if (ensureCalls === 1) return { ok: true, baseUrl: 'http://127.0.0.1:8765' };
                    return { ok: false, error: '健康检查超时', code: 'engine_starting' };
                },
                ensureGpuRuntimeStream: async () => ({
                    ok: true,
                    data: { ok: true, message: 'GPU 支持已安装' },
                }),
            }));
            const res = await runEngineDownload({ kind: 'gpu', force: true });
            assert.strictEqual(res.ok, false);
            assert.match(String(res.error || ''), /冷安装|重启|手动修复/);
            assert.ok(events.some((e) => e.phase === 'error' && e.suggestManual));
        } finally {
            if (prev == null) delete process.env.TRANSUB_ENGINE_DATA;
            else process.env.TRANSUB_ENGINE_DATA = prev;
            try {
                fs.rmSync(markerDir, { recursive: true, force: true });
            } catch { /* ignore */ }
        }
    });
});
