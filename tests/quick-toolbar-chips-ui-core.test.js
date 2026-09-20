'use strict';

const assert = require('assert');
const { createQuickToolbarChipsUi } = require('../src/js/quick-toolbar-chips-ui-core.js');

function makeEl(extra = {}) {
    return {
        classList: {
            toggle() {},
            add() {},
            remove() {},
            contains() { return false; },
        },
        setAttribute() {},
        querySelectorAll() { return []; },
        textContent: '',
        title: '',
        value: '',
        checked: false,
        hidden: false,
        disabled: false,
        options: [],
        ...extra,
    };
}

describe('TransubQuickToolbarChipsUi', () => {
    it('exports createQuickToolbarChipsUi', () => {
        assert.strictEqual(typeof createQuickToolbarChipsUi, 'function');
    });

    it('menu open state + syncModelsChipLabel smoke', () => {
        const modelsChipLabel = makeEl();
        const asrChipLabel = makeEl();
        const mtChipLabel = makeEl();
        const asrChipBtn = makeEl();
        const mtChipBtn = makeEl();
        const modelsChipBtn = makeEl();
        const modelsMenu = makeEl();
        const live = makeEl();
        const fullAsr = '按「影视对白」识别：清晰对白优先';
        const fullMt = '已指定 sakura-14b-qwen3xxx';
        const ui = createQuickToolbarChipsUi({
            els: {
                modelsChipLabel,
                asrChipLabel,
                mtChipLabel,
                asrChipBtn,
                mtChipBtn,
                modelsChipBtn,
                modelsMenu,
                modelsPickLiveSummary: live,
                quickTranslateLabel: makeEl({ textContent: '推理 · Sakura14' }),
                paramsModeLabel: makeEl({ textContent: '影视对…' }),
                paramsModeBtn: makeEl({ title: fullAsr }),
                quickTranslateBtn: makeEl({ title: fullMt }),
            },
            readTaskFromForm: () => 'translate',
            readTranslateModeFromForm: () => 'llm',
            isAutoSenseEnabled: () => true,
            setPostTaskMenuOpen: () => {},
            setAddMenuOpen: () => {},
            setPostBatchQcFixMenuOpen: () => {},
            setExpertExtrasMenuOpen: () => {},
            loadDeferredGroup: async () => {},
            rebuildTranslateMenuMtSection: () => {},
            rebuildParamsModeAsrSection: () => {},
            rebuildParamsModePresetItems: () => {},
            getParamsModeUi: () => ({ getParamsModePresetCache: () => [] }),
        });

        assert.strictEqual(ui.getModelsMenuOpen(), false);
        ui.syncModelsChipLabel();
        assert.strictEqual(asrChipLabel.textContent, '自定义');
        assert.strictEqual(mtChipLabel.textContent, '推理');
        assert.strictEqual(modelsChipLabel.textContent, '推理 · 自定义');
        assert.strictEqual(asrChipBtn.title, fullAsr);
        assert.strictEqual(mtChipBtn.title, fullMt);
        assert.strictEqual(live.textContent, `当前识别：${fullAsr}`);

        const presetAsrLabel = makeEl();
        const presetUi = createQuickToolbarChipsUi({
            els: {
                asrChipLabel: presetAsrLabel,
                mtChipLabel: makeEl(),
                modelsChipLabel: makeEl(),
                asrChipBtn: makeEl(),
                mtChipBtn: makeEl(),
                modelsPickLiveSummary: makeEl(),
                paramsModeBtn: makeEl({ title: fullAsr }),
                quickTranslateBtn: makeEl({ title: fullMt }),
            },
            readTaskFromForm: () => 'translate',
            readTranslateModeFromForm: () => 'llm',
            getActiveParamsPresetId: () => 'film',
            getActiveParamsPresetName: () => '影视对白',
            setPostTaskMenuOpen: () => {},
            setAddMenuOpen: () => {},
            setPostBatchQcFixMenuOpen: () => {},
            setExpertExtrasMenuOpen: () => {},
            loadDeferredGroup: async () => {},
        });
        presetUi.syncModelsChipLabel();
        assert.strictEqual(presetUi.shortSenseModelsSummary(), '预设');
        assert.strictEqual(presetAsrLabel.textContent, '预设');

        ui.setModelsPickSlot('mt', { force: true });
        ui.syncModelsChipLabel();
        assert.strictEqual(live.textContent, `当前模式：${fullMt}`);

        ui.toggleModelsChip('asr');
        assert.strictEqual(ui.getModelsMenuOpen(), true);
        ui.toggleModelsChip('mt');
        assert.strictEqual(ui.getModelsMenuOpen(), true);
        ui.toggleModelsChip('mt');
        assert.strictEqual(ui.getModelsMenuOpen(), false);

        ui.setModelsMenuOpen(true, { slot: 'asr' });
        assert.strictEqual(ui.getModelsMenuOpen(), true);
        assert.strictEqual(ui.getTranslateMenuOpen(), true);
        assert.strictEqual(ui.getParamsModeMenuOpen(), true);

        ui.setParamsMoreMenuOpen(true);
        assert.strictEqual(ui.getParamsMoreMenuOpen(), true);
        assert.strictEqual(ui.getModelsMenuOpen(), false);

        const dualUi = createQuickToolbarChipsUi({
            els: {
                bilingualChipWrap: makeEl(),
                bilingualChipBtn: makeEl(),
                bilingualMenu: makeEl(),
                bilingualChipLabel: makeEl(),
                mergeBilingualCheck: makeEl({ checked: false }),
            },
            readTaskFromForm: () => 'dual',
            readDualLineOrderFromForm: () => 'target-first',
            setPostTaskMenuOpen: () => {},
            setAddMenuOpen: () => {},
            setPostBatchQcFixMenuOpen: () => {},
            setExpertExtrasMenuOpen: () => {},
            loadDeferredGroup: async () => {},
        });
        dualUi.setBilingualMenuOpen(true);
        assert.strictEqual(dualUi.getBilingualMenuOpen(), true);
        assert.strictEqual(dualUi.getParamsMoreMenuOpen(), false);
    });

    it('positionModelsPopover anchors to the left edge (opens right)', () => {
        const style = {};
        const menu = makeEl({
            style,
            classList: {
                add(name) { this._added = name; },
                remove() {},
                toggle() {},
                contains() { return false; },
            },
        });
        const asrChipBtn = makeEl({
            getBoundingClientRect: () => ({
                left: 120, right: 200, top: 40, bottom: 70, width: 80, height: 30,
            }),
        });
        const ui = createQuickToolbarChipsUi({
            els: {
                modelsMenu: menu,
                asrChipBtn,
                mtChipBtn: makeEl(),
                modelsChipBtn: makeEl(),
            },
            getDocument: () => ({
                getElementById: () => null,
                defaultView: { innerWidth: 1280, innerHeight: 800 },
            }),
            readTaskFromForm: () => 'translate',
            setPostTaskMenuOpen: () => {},
            setAddMenuOpen: () => {},
            setPostBatchQcFixMenuOpen: () => {},
            setExpertExtrasMenuOpen: () => {},
            loadDeferredGroup: async () => {},
            rebuildTranslateMenuMtSection: () => {},
            rebuildParamsModeAsrSection: () => {},
            rebuildParamsModePresetItems: () => {},
            getParamsModeUi: () => ({ getParamsModePresetCache: () => [] }),
        });
        ui.setModelsMenuOpen(true, { slot: 'asr' });
        assert.strictEqual(style.left, '120px');
        assert.strictEqual(style.right, 'auto');
    });

    it('opening models menu loads smart-translate cache for dialog mode', async () => {
        let ensureCalls = 0;
        let rebuildAfterCache = 0;
        let cached = null;
        const ui = createQuickToolbarChipsUi({
            els: {
                modelsChipLabel: makeEl(),
                modelsChipBtn: makeEl(),
                modelsMenu: makeEl(),
                quickTranslateBtn: makeEl(),
                paramsModeBtn: makeEl(),
            },
            readTaskFromForm: () => 'translate',
            readTranslateModeFromForm: () => 'dialog',
            isAutoSenseEnabled: () => false,
            getCachedSmartTranslatePick: () => cached,
            ensureSmartTranslatePickCache: async ({ force } = {}) => {
                ensureCalls += 1;
                cached = {
                    catalog: [{ id: 'qwen3-8b', installed: true }],
                    smartTranslateModelId: 'qwen3-8b',
                    fromDiskCache: !force,
                };
                return cached;
            },
            ensureEngineModelsCacheApplied: async () => true,
            hasEngineModelsCacheInMemory: () => false,
            getCachedEngineModels: () => [],
            setPostTaskMenuOpen: () => {},
            setAddMenuOpen: () => {},
            setPostBatchQcFixMenuOpen: () => {},
            setExpertExtrasMenuOpen: () => {},
            setParamsMoreMenuOpen: () => {},
            setBilingualMenuOpen: () => {},
            setTranslateStyleMenuOpen: () => {},
            loadDeferredGroup: async () => {
                await new Promise((r) => setTimeout(r, 30));
            },
            rebuildTranslateMenuMtSection: () => {
                if (ensureCalls > 0) rebuildAfterCache += 1;
            },
            rebuildParamsModeAsrSection: () => {},
            rebuildParamsModePresetItems: () => {},
            getParamsModeUi: () => ({ getParamsModePresetCache: () => [{ id: 'p1' }] }),
            syncModelsMenuDetailUi: () => {},
        });

        ui.setModelsMenuOpen(true);
        await new Promise((r) => setTimeout(r, 10));
        assert.ok(ensureCalls >= 1, 'dialog mode must refresh managed LLM catalog');
        assert.ok(rebuildAfterCache >= 1, 'must repaint MT section after catalog load');
        assert.strictEqual(ui.isModelsCatalogLoading(), false);
    });

    it('opening models menu paints from persisted cache without waiting for deferred catalogs', async () => {
        let deferredStarted = false;
        let deferredDone = false;
        let paintWhileDeferredPending = 0;
        const cached = {
            catalog: [{ id: 'qwen3-8b', installed: true, name: 'Qwen' }],
            smartTranslateModelId: '',
            fromDiskCache: true,
        };
        const ui = createQuickToolbarChipsUi({
            els: {
                modelsChipLabel: makeEl(),
                modelsChipBtn: makeEl(),
                modelsMenu: makeEl(),
                quickTranslateBtn: makeEl(),
                paramsModeBtn: makeEl(),
            },
            readTaskFromForm: () => 'translate',
            readTranslateModeFromForm: () => 'dialog',
            getCachedSmartTranslatePick: () => cached,
            ensureSmartTranslatePickCache: async () => cached,
            ensureEngineModelsCacheApplied: async () => true,
            hasEngineModelsCacheInMemory: () => true,
            getCachedEngineModels: () => [{ id: 'sakura-1.5b', kind: 'mt', installed: true }],
            setPostTaskMenuOpen: () => {},
            setAddMenuOpen: () => {},
            setPostBatchQcFixMenuOpen: () => {},
            setExpertExtrasMenuOpen: () => {},
            setParamsMoreMenuOpen: () => {},
            setBilingualMenuOpen: () => {},
            setTranslateStyleMenuOpen: () => {},
            loadDeferredGroup: async () => {
                deferredStarted = true;
                await new Promise((r) => setTimeout(r, 40));
                deferredDone = true;
            },
            rebuildTranslateMenuMtSection: () => {
                if (deferredStarted && !deferredDone) paintWhileDeferredPending += 1;
            },
            rebuildParamsModeAsrSection: () => {},
            rebuildParamsModePresetItems: () => {},
            getParamsModeUi: () => ({ getParamsModePresetCache: () => [{ id: 'p1' }] }),
        });

        ui.setModelsMenuOpen(true);
        await new Promise((r) => setTimeout(r, 5));
        assert.ok(paintWhileDeferredPending >= 1, 'must paint before deferred catalogs finish');
        assert.strictEqual(ui.isModelsCatalogLoading(), false);
    });

    it('shows loading state when opening with empty persisted catalog', async () => {
        let resolveEnsure;
        const ensurePromise = new Promise((r) => { resolveEnsure = r; });
        let sawLoading = false;
        const ui = createQuickToolbarChipsUi({
            els: {
                modelsChipLabel: makeEl(),
                modelsChipBtn: makeEl(),
                modelsMenu: makeEl(),
                quickTranslateBtn: makeEl(),
                paramsModeBtn: makeEl(),
            },
            readTaskFromForm: () => 'translate',
            readTranslateModeFromForm: () => 'llm',
            getCachedSmartTranslatePick: () => null,
            ensureSmartTranslatePickCache: async () => null,
            ensureEngineModelsCacheApplied: async () => false,
            ensureEngineModelsCatalog: async () => {
                await ensurePromise;
                return { ok: true };
            },
            hasEngineModelsCacheInMemory: () => false,
            getCachedEngineModels: () => [],
            setPostTaskMenuOpen: () => {},
            setAddMenuOpen: () => {},
            setPostBatchQcFixMenuOpen: () => {},
            setExpertExtrasMenuOpen: () => {},
            setParamsMoreMenuOpen: () => {},
            setBilingualMenuOpen: () => {},
            setTranslateStyleMenuOpen: () => {},
            loadDeferredGroup: async () => {},
            rebuildTranslateMenuMtSection: () => {
                if (ui.isModelsCatalogLoading()) sawLoading = true;
            },
            rebuildParamsModeAsrSection: () => {},
            rebuildParamsModePresetItems: () => {},
            getParamsModeUi: () => ({ getParamsModePresetCache: () => [] }),
        });

        ui.setModelsMenuOpen(true);
        await new Promise((r) => setTimeout(r, 5));
        assert.ok(sawLoading || ui.isModelsCatalogLoading(), 'empty cache must show loading');
        resolveEnsure({ ok: true });
        await new Promise((r) => setTimeout(r, 5));
        assert.strictEqual(ui.isModelsCatalogLoading(), false);
    });

    it('opening models menu loads presets when recognition cache is empty', async () => {
        let loadCalls = 0;
        let rebuildWithPresets = 0;
        let cache = [];
        const ui = createQuickToolbarChipsUi({
            els: {
                modelsChipLabel: makeEl(),
                modelsChipBtn: makeEl(),
                modelsMenu: makeEl(),
                quickTranslateBtn: makeEl(),
                paramsModeBtn: makeEl(),
            },
            readTaskFromForm: () => 'translate',
            readTranslateModeFromForm: () => 'llm',
            isAutoSenseEnabled: () => false,
            setPostTaskMenuOpen: () => {},
            setAddMenuOpen: () => {},
            setPostBatchQcFixMenuOpen: () => {},
            setExpertExtrasMenuOpen: () => {},
            setParamsMoreMenuOpen: () => {},
            setBilingualMenuOpen: () => {},
            setTranslateStyleMenuOpen: () => {},
            loadDeferredGroup: async () => {},
            loadPresets: async () => {
                loadCalls += 1;
                cache = [{ id: 'ja-av-qwen3-galgame-ten', group: 'ja', name: 'demo' }];
            },
            rebuildTranslateMenuMtSection: () => {},
            rebuildParamsModeAsrSection: () => {},
            rebuildParamsModePresetItems: (list) => {
                if (Array.isArray(list) && list.length) rebuildWithPresets += 1;
            },
            getParamsModeUi: () => ({ getParamsModePresetCache: () => cache.slice() }),
            syncModelsMenuDetailUi: () => {},
        });

        ui.setModelsMenuOpen(true);
        await new Promise((r) => setTimeout(r, 0));
        assert.ok(loadCalls >= 1, 'empty cache must trigger loadPresets');
        assert.ok(rebuildWithPresets >= 1, 'must rebuild recognition preset list after load');
    });

    it('updateParamsSummary writes paramsSummary', () => {
        const paramsSummary = makeEl();
        const ui = createQuickToolbarChipsUi({
            els: {
                paramsSummary,
                deviceSelect: makeEl({ value: 'cuda' }),
                overwriteCheck: makeEl({ checked: false }),
                mergeBilingualCheck: makeEl({ checked: false }),
            },
            deviceLabels: { cuda: 'GPU' },
            readTaskFromForm: () => 'translate',
            taskLabelOf: () => '翻译',
            readSubFormatsFromForm: () => 'srt,ass',
            readModelPathFromForm: () => '',
            getPostBatchQcFixMode: () => 'none',
            postBatchQcFixModeLabel: () => '无',
            updateEnvBanner: () => {},
            updateAutoSenseUi: () => {},
            syncTranslateModeChipUi: () => {},
            syncMtModelChipUi: () => {},
            syncPostBatchQcFixChipUi: () => {},
            updateReadinessStrip: () => {},
            updateRecipeCapsule: () => {},
        });
        ui.updateParamsSummary();
        assert.ok(paramsSummary.textContent.includes('GPU'));
        assert.ok(paramsSummary.textContent.includes('翻译'));
        assert.ok(paramsSummary.textContent.includes('srt/ass'));
    });
});
