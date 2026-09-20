'use strict';

const assert = require('assert');
const { createEngineModelsWorkspace } = require('../src/js/engine-models-workspace-core.js');

describe('TransubEngineModelsWorkspace', () => {
    it('exports createEngineModelsWorkspace', () => {
        assert.strictEqual(typeof createEngineModelsWorkspace, 'function');
    });

    it('returns refresh/download/delete runners', () => {
        const ws = createEngineModelsWorkspace({
            electron: {},
            els: { progressLabel: { textContent: '' } },
            engineModelsUi: {},
            getCachedEngineModels: () => [],
            setCachedEngineModels: () => {},
            appendLog: () => {},
        });
        assert.strictEqual(typeof ws.refreshEngineModels, 'function');
        assert.strictEqual(typeof ws.downloadEngineModels, 'function');
        assert.strictEqual(typeof ws.deleteEngineModel, 'function');
        assert.strictEqual(typeof ws.ensureEngineTorchCuda, 'function');
    });

    it('refreshEngineModels no-ops gracefully without list IPC', async () => {
        let listed = false;
        const ws = createEngineModelsWorkspace({
            electron: {},
            els: {},
            engineModelsUi: {},
            getCachedEngineModels: () => [],
            setCachedEngineModels: () => {},
            renderEngineModelsList: () => { listed = true; },
            renderEngineModelsCards: () => {},
            appendLog: () => {},
            syncExpertQuickModelSelects: () => {},
            syncExpertExtraChipsUi: () => {},
            syncMtModelChipUi: () => {},
            syncTranslateChipUi: () => {},
            syncSmartTranslateReadinessUi: () => {},
            updateAsrRecommendChip: () => {},
            updateReadinessStrip: () => {},
            syncEngineModelsLibraryTabSummary: () => {},
            syncEngineModelsLibraryDlStrip: () => {},
            schedulePersistEngineModelsCache: () => {},
        });
        await ws.refreshEngineModels({ silent: true });
        assert.strictEqual(listed, true);
    });

    it('refreshEngineModels rebuilds task MT menu and writes smart-pick cache', async () => {
        let rebuildCount = 0;
        let chipCount = 0;
        let pick = null;
        const models = [{ id: 'sakura-x', name: 'Sakura', kind: 'mt', installed: true }];
        const catalog = [
            { id: 'qwen-local', name: 'Qwen', installed: true, translateOnly: false },
        ];
        const ws = createEngineModelsWorkspace({
            electron: {
                transubEngineListModels: async () => ({ ok: true, models }),
                transubEngineDownloadInfo: async () => ({ ok: true, info: { catalog: [] } }),
                transubAdvancedManagedLlmStatus: async () => ({
                    ok: true,
                    managed: {
                        catalog,
                        smartTranslateModelId: 'qwen-local',
                        smartTranslateResolvedId: 'qwen-local',
                        llmSource: 'managed',
                    },
                    status: { llmSource: 'managed' },
                }),
            },
            els: {},
            engineModelsUi: {
                mergeManagedInstalledIntoEngineModels: (engine, managed) => engine.concat(managed || []),
            },
            getCachedEngineModels: () => models,
            setCachedEngineModels: () => {},
            setCachedSmartTranslatePick: (v) => { pick = v; },
            rebuildTranslateMenuMtSection: () => { rebuildCount += 1; },
            syncTranslateChipUi: () => { chipCount += 1; },
            renderEngineModelsList: () => {},
            renderEngineModelsCards: () => {},
            fillEngineModelSelect: () => {},
            appendLog: () => {},
            syncExpertQuickModelSelects: () => {},
            syncExpertExtraChipsUi: () => {},
            syncMtModelChipUi: () => {},
            syncSmartTranslateReadinessUi: () => {},
            updateAsrRecommendChip: () => {},
            updateReadinessStrip: () => {},
            syncEngineModelsLibraryTabSummary: () => {},
            syncEngineModelsLibraryDlStrip: () => {},
            schedulePersistEngineModelsCache: () => {},
            markEngineModelsCacheFresh: () => {},
            syncEngineModelsCacheBanner: () => {},
            resolveEngineModelsBrowseOnly: async () => false,
            buildManagedLlmPickItems: () => [],
        });
        const res = await ws.refreshEngineModels({ silent: true });
        assert.strictEqual(res?.ok, true);
        assert.strictEqual(rebuildCount, 1);
        assert.strictEqual(chipCount, 1);
        assert.ok(pick);
        assert.strictEqual(pick.smartTranslateModelId, 'qwen-local');
        assert.strictEqual(pick.catalog?.[0]?.id, 'qwen-local');
    });

    it('soft refreshEngineStatus skips GPU IPC and keeps torch button visible', async () => {
        let gpuCalls = 0;
        let validateCalls = 0;
        const torchBtn = {
            classList: {
                _hidden: false,
                _ring: false,
                toggle(name, on) {
                    if (name === 'hidden') this._hidden = !!on;
                    if (name === 'ring-1') this._ring = !!on;
                },
                remove(name) {
                    if (name === 'hidden') this._hidden = false;
                },
                add() {},
            },
        };
        const statusEl = { textContent: '', className: '' };
        const gpuStatusEl = { textContent: '', className: '' };
        const ws = createEngineModelsWorkspace({
            electron: {
                transubEngineValidate: async () => {
                    validateCalls += 1;
                    return { ok: false, error: 'engine_not_running' };
                },
                transubEngineGpuStatus: async () => {
                    gpuCalls += 1;
                    return { ok: true, status: 'ready', torchCudaMismatch: false };
                },
            },
            els: {
                engineEnsureTorchCudaBtn: torchBtn,
                engineStatus: statusEl,
                engineGpuStatus: gpuStatusEl,
            },
            engineModelsUi: {},
            engineFormPayload: () => ({ engineAutoStart: true }),
            getCachedEngineModels: () => [],
            setCachedEngineModels: () => {},
            hasEngineModelsCacheInMemory: () => true,
            appendLog: () => {},
            setEngineStatusText: (t) => { statusEl.textContent = t; },
            updateEnvBanner: () => {},
            syncTranslateChipUi: () => {},
            updateAsrRecommendChip: () => {},
            updateReadinessStrip: () => {},
        });
        await ws.refreshEngineStatus({ soft: true });
        assert.strictEqual(validateCalls, 1);
        assert.strictEqual(gpuCalls, 0, 'soft path must not call GPU status');
        assert.ok(/待命|待检测|引擎/.test(statusEl.textContent + gpuStatusEl.textContent));
        assert.strictEqual(torchBtn.classList._hidden, false);
    });

    it('applyGpuRuntimeProbe keeps torch button visible when GPU ready', () => {
        const torchBtn = {
            classList: {
                _hidden: true,
                toggle(name, on) {
                    if (name === 'hidden') this._hidden = !!on;
                },
                remove(name) {
                    if (name === 'hidden') this._hidden = false;
                },
                add() {},
            },
        };
        const gpuStatusEl = { textContent: '', className: '' };
        const ws = createEngineModelsWorkspace({
            electron: {},
            els: {
                engineEnsureTorchCudaBtn: torchBtn,
                engineGpuStatus: gpuStatusEl,
            },
            engineModelsUi: {},
            getCachedEngineModels: () => [],
            setCachedEngineModels: () => {},
            appendLog: () => {},
        });
        ws.applyGpuRuntimeProbe({
            status: 'ready',
            hint: 'GPU 运行库已就绪',
            torchCudaMismatch: false,
            needsTorchCuda128: false,
        });
        assert.strictEqual(torchBtn.classList._hidden, false);
        ws.applyGpuRuntimeProbe({
            status: 'ready',
            hint: 'GPU 运行库已就绪',
            torchCudaMismatch: true,
            needsTorchCuda128: true,
            torchCudaSuitable: false,
        });
        assert.strictEqual(torchBtn.classList._hidden, false);
    });
});
