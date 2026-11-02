const assert = require('assert');
const { registerEngineModelsIpc } = require('../electron/engine-models-ipc');
const { registerEngineRuntimeIpc } = require('../electron/engine-runtime-ipc');
const { registerEngineDownloadIpc } = require('../electron/engine-download-ipc');
const { registerEngineBatchIpc } = require('../electron/engine-batch-ipc');
const { registerEngineOptionsIpc } = require('../electron/engine-options-ipc');
const { registerEngineComputeIpc } = require('../electron/engine-compute-ipc');
const { registerExtensionsSystemFontsIpc } = require('../electron/extensions-system-fonts');

describe('engine-bridge IPC extracts', () => {
    it('registers model/runtime/download/batch/options/compute channels', () => {
        const channels = new Set();
        const register = (ch) => { channels.add(ch); };
        const s = {
            engineProc: null,
            engineBaseUrl: 'http://127.0.0.1:8765',
            batchCancelled: false,
            itemCancelled: false,
            batchRunning: false,
            currentJobId: '',
            batchMtAbortController: null,
            itemWorkAbortController: null,
            downloadAbort: null,
            downloadBusy: false,
            opusTextAbortController: null,
        };
        const h = {
            readMergedOptions: async () => ({}),
            ensureEngineRunning: async () => ({ ok: false, error: 'noop' }),
            getCapabilities: async () => ({}),
            listModels: async () => ({}),
            omitRetiredEngineModels: (x) => x,
            deleteModels: async () => ({}),
            recommendModels: async () => ({}),
            detectLanguage: async () => ({}),
            translateCuesWithEngineOpus: async () => ({ ok: false }),
            downloadModels: async () => ({}),
            getGpuRuntime: async () => ({}),
            scanSystemCuda: async () => ({}),
            adoptSystemCuda: async () => ({}),
            getAsrWhisperRuntime: async () => ({}),
            getAudioSeparateRuntime: async () => ({}),
            ensureGpuRuntime: async () => ({}),
            sleep: async () => {},
            stopEngineProcess: () => {},
            stopEngineProcessAndPort: () => {},
            broadcastEngineDownloadProgress: () => {},
            getEngineDownloadJob: () => ({ runEngineDownload: async () => ({ ok: false }) }),
            syncEngineSessionPostTask: () => {},
            runEngineBatch: async () => ({ ok: false }),
            abortBatchMtAdapter: () => {},
            cancelJob: async () => ({}),
            appendEngineLogLine: () => {},
            getJobCheckpoint: async () => ({}),
            resumeJob: async () => ({}),
            waitJob: async () => ({}),
            usesExternalMt: () => false,
            mapTaskToEngineTask: (t) => t,
            mergeSenseOverrides: (x) => x,
            sanitizeSakuraMtForLanguage: (x) => x,
            batchMtPlan: { resolveBatchMtAdapterLaunch: () => ({}) },
            startEngineMtAdapter: async () => ({}),
            progressFieldsFromWaitEvent: () => null,
            sanitizeBatchEngineSseProgress: (x) => x,
            softenTranslateProgressFields: (x) => x,
            getTranslateProgressSession: () => ({}),
            sendProgress: () => {},
            friendlyEngineError: (e) => e,
            extractOutputPaths: () => ({}),
            resumeEngineJobAndWait: async () => ({ ok: false }),
            exportAsrDiagnosticsPack: () => ({ ok: false }),
            getEngineLogPath: () => '',
            openEngineLatestLog: () => ({ ok: false }),
            buildEngineDownloadInfo: async () => ({}),
            getEngineModelsRoot: () => '',
            resolveEngineInstallPath: (p) => p,
            resolveEngineRuntimePython: () => '',
            registerLocalWhlIpc: () => {},
            loadSettings: () => ({ options: {} }),
            saveSettings: () => {},
            mergeTransWithAiOptions: (x) => x,
            mergeEngineOptions: (x) => x,
            stripPostTaskFields: (x) => x,
            getAppRoot: () => process.cwd(),
            transcribeRangeWithEngine: async () => ({ ok: false }),
            deferredEnsureTwai: () => {},
            fs: require('fs'),
            path: require('path'),
        };
        const host = { s, h };
        registerEngineModelsIpc(register, host);
        registerEngineRuntimeIpc(register, host);
        registerEngineDownloadIpc(register, host);
        registerEngineBatchIpc(register, host);
        registerEngineOptionsIpc(register, host);
        registerEngineComputeIpc(register, {
            getEngineProc: () => null,
            getEngineBaseUrl: () => '',
            isBatchRunning: () => false,
            stopEngineJobs: () => {},
        });
        registerExtensionsSystemFontsIpc(register);

        assert.ok(channels.has('transub-engine-validate'));
        assert.ok(channels.has('transub-engine-list-models'));
        assert.ok(channels.has('transub-engine-gpu-status'));
        assert.ok(channels.has('transub-engine-run-download'));
        assert.ok(channels.has('transub-engine-generate-subtitles'));
        assert.ok(channels.has('transub-transcribe-range'));
        assert.ok(channels.has('transub-compute-task-status'));
        assert.ok(channels.has('transub-list-system-fonts'));
        assert.ok(channels.size >= 25);
    });
});
