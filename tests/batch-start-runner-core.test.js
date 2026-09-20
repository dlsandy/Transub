'use strict';

const assert = require('assert');
const { createBatchStartRunner } = require('../src/js/batch-start-runner-core.js');

describe('TransubBatchStartRunner', () => {
    it('exports createBatchStartRunner', () => {
        assert.strictEqual(typeof createBatchStartRunner, 'function');
    });

    it('early returns when computeStartBlockReason returns a string', async () => {
        const logs = [];
        const toasts = [];
        let generateCalled = 0;
        const runner = createBatchStartRunner({
            state: {
                computeBusy: false,
                running: false,
                postBatchBusy: false,
                retranslateBusy: false,
            },
            els: {},
            electron: {
                transubEngineGenerateSubtitles: async () => {
                    generateCalled += 1;
                    return { ok: true };
                },
            },
            gates: {
                computeStartBlockReason: () => '任务进行中',
                getSelectedItems: () => [{ path: 'a.mp4', status: 'ready' }],
            },
            options: {
                buildRuntimeOptions: () => ({ engineBackend: 'transub' }),
                getSettingsFormDirty: () => false,
            },
            engine: {
                refreshEngineStatus: async () => ({ ok: true }),
            },
            ui: {
                appendLog: (msg, level) => { logs.push({ msg, level }); },
                showToast: (msg, level) => { toasts.push({ msg, level }); },
                updateStartButton: () => {},
                dismissLoadingOverlay: () => {},
                ensureJobRuntimeScripts: async () => {},
                resetExternalImportIdle: () => {},
            },
        });
        await runner.startSubtitleGeneration();
        assert.ok(logs.some((l) => l.msg === '任务进行中' && l.level === 'warn'));
        assert.ok(toasts.some((t) => t.msg === '任务进行中'));
        assert.strictEqual(generateCalled, 0);
    });

    it('early returns when getSelectedItems returns []', async () => {
        const logs = [];
        let generateCalled = 0;
        const runner = createBatchStartRunner({
            state: {
                computeBusy: false,
                running: false,
                postBatchBusy: false,
                retranslateBusy: false,
            },
            els: {},
            electron: {
                transubEngineGenerateSubtitles: async () => {
                    generateCalled += 1;
                    return { ok: true };
                },
            },
            gates: {
                computeStartBlockReason: () => null,
                getSelectedItems: () => [],
            },
            options: {
                buildRuntimeOptions: () => ({ engineBackend: 'transub' }),
                getSettingsFormDirty: () => false,
            },
            engine: {
                refreshEngineStatus: async () => ({ ok: true }),
            },
            ui: {
                appendLog: (msg, level) => { logs.push({ msg, level }); },
                showToast: () => {},
                dismissLoadingOverlay: () => {},
                ensureJobRuntimeScripts: async () => {},
                resetExternalImportIdle: () => {},
            },
        });
        await runner.startSubtitleGeneration();
        assert.ok(logs.some((l) => String(l.msg).includes('请至少选择一个有效视频') && l.level === 'warn'));
        assert.strictEqual(generateCalled, 0);
    });

    it('shows engine-starting overlay while validating engine, and marks batchStartInFlight', async () => {
        const loading = [];
        let updateStartCount = 0;
        const state = {
            computeBusy: false,
            running: false,
            postBatchBusy: false,
            retranslateBusy: false,
            batchStartInFlight: false,
            lastContentProfile: null,
        };
        let resolveValidate;
        const validatePromise = new Promise((resolve) => { resolveValidate = resolve; });
        const runner = createBatchStartRunner({
            state,
            els: {},
            electron: {
                transubEngineGenerateSubtitles: async () => ({ ok: false, error: 'stop-after-validate' }),
            },
            gates: {
                computeStartBlockReason: () => null,
                getSelectedItems: () => [{ path: 'a.mp4', status: 'ready' }],
                isAutoSenseEnabled: () => false,
                warnIfSelectedEngineModelsMissing: () => '',
                ensureMtSelectionValidBeforeStart: async () => true,
                ensureSmartTranslateReadinessBeforeStart: async () => true,
                promptTorchCudaMismatchBeforeBatch: async () => true,
            },
            options: {
                buildRuntimeOptions: () => ({ engineBackend: 'transub', engineAsrModel: 'sensevoice-small', engineProfile: 'balanced' }),
                getSettingsFormDirty: () => false,
                reloadSavedOptionsIntoForm: async () => null,
                optionOverridesForJob: () => undefined,
            },
            engine: {
                refreshEngineStatus: async () => {
                    await validatePromise;
                    return { ok: true };
                },
                refreshEtaRateFromHistory: async () => {},
                getCachedEngineModels: () => [{ id: 'sensevoice-small', installed: true }],
                getCachedGpuRuntimeProbe: () => ({ ok: true }),
            },
            ui: {
                appendLog: () => {},
                showToast: () => {},
                uiTf: (s) => s,
                setBadge: () => {},
                updateStartButton: () => { updateStartCount += 1; },
                renderList: () => {},
                updateAutoSenseUi: () => {},
                openAppSettings: () => {},
                dismissLoadingOverlay: () => { loading.push('dismiss'); },
                setLoading: (show, message) => { loading.push({ show, message }); },
                ensureLogExpanded: () => {},
                ensureJobRuntimeScripts: async () => {},
                resetExternalImportIdle: () => {},
            },
        });
        const done = runner.startSubtitleGeneration();
        await new Promise((r) => setImmediate(r));
        assert.strictEqual(state.batchStartInFlight, true);
        assert.ok(updateStartCount >= 1);
        assert.ok(loading.some((e) => e && e.show === true && String(e.message).includes('引擎启动中')));
        resolveValidate({ ok: true });
        await done;
        assert.ok(loading.some((e) => e && e.show === false));
    });

    it('toasts when clearing a stale compute lock before start', async () => {
        const logs = [];
        const toasts = [];
        let generateCalled = 0;
        const state = {
            computeBusy: true,
            running: false,
            postBatchBusy: false,
            retranslateBusy: false,
        };
        const runner = createBatchStartRunner({
            state,
            els: {},
            electron: {
                transubEngineGenerateSubtitles: async () => {
                    generateCalled += 1;
                    return { ok: true };
                },
            },
            gates: {
                computeStartBlockReason: () => (state.computeBusy ? '已有任务正在运行' : '请先添加媒体文件'),
                clearStaleComputeBusyIfNeeded: async () => {
                    state.computeBusy = false;
                    return { cleared: true, before: { label: '编辑器重转写' } };
                },
                getSelectedItems: () => [],
            },
            options: {
                buildRuntimeOptions: () => ({ engineBackend: 'transub' }),
                getSettingsFormDirty: () => false,
            },
            engine: {
                refreshEngineStatus: async () => ({ ok: true }),
            },
            ui: {
                appendLog: (msg, level) => { logs.push({ msg, level }); },
                showToast: (msg, level) => { toasts.push({ msg, level }); },
                updateStartButton: () => {},
                dismissLoadingOverlay: () => {},
                ensureJobRuntimeScripts: async () => {},
                resetExternalImportIdle: () => {},
            },
        });
        await runner.startSubtitleGeneration();
        assert.ok(logs.some((l) => String(l.msg).includes('编辑器重转写')));
        assert.ok(toasts.some((t) => String(t.msg).includes('编辑器重转写')));
        assert.strictEqual(generateCalled, 0);
    });
});
