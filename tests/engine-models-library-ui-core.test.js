'use strict';

const assert = require('assert');
const { createEngineModelsLibraryUi } = require('../src/js/engine-models-library-ui-core.js');

describe('TransubEngineModelsLibraryUi', () => {
    it('exports createEngineModelsLibraryUi', () => {
        assert.strictEqual(typeof createEngineModelsLibraryUi, 'function');
    });

    it('factory + render with empty catalog does not throw', () => {
        let pickCatalog = [];
        const listEl = { innerHTML: 'x', childElementCount: 0 };
        const els = {
            engineModelsList: listEl,
            engineModelsSummary: { textContent: '' },
            engineModelsSelectedHint: { textContent: '', classList: { remove() {} } },
            engineModelsLibraryTabSummary: { textContent: '' },
            engineModelsTabAllCount: { textContent: '' },
            engineModelsTabInstalledCount: { textContent: '' },
            engineModelsTabAvailableCount: { textContent: '' },
            engineModelsTabRecommendedCount: { textContent: '' },
            engineModelsTabIncompleteCount: { textContent: '' },
            engineModelsTabExperimentalCount: { textContent: '' },
            engineModelsTabAsrCount: { textContent: '' },
            engineModelsTabVadCount: { textContent: '' },
            engineModelsTabLlmCount: { textContent: '' },
            engineModelsTabSeparateCount: { textContent: '' },
            engineModelsFilters: null,
            engineModelsStatusFilters: null,
            engineModelsLoading: { classList: { toggle() {} }, setAttribute() {} },
        };
        const ui = createEngineModelsLibraryUi({
            els,
            state: { factoryWorkspace: 'queue' },
            engineModelsUi: {},
            esc: (s) => String(s ?? ''),
            uiTf: (s) => s,
            getCachedEnginePickCatalog: () => pickCatalog,
            setCachedEnginePickCatalog: (v) => { pickCatalog = Array.isArray(v) ? v : []; },
            getEngineModelsBusy: () => false,
            getEngineModelsBrowseOnly: () => false,
            getIsStandaloneSettings: () => false,
            getAdvancedEntitled: () => false,
        });

        assert.strictEqual(typeof ui.renderEngineModelsCards, 'function');
        assert.strictEqual(typeof ui.renderEngineModelsList, 'function');
        assert.strictEqual(typeof ui.openEngineModelsLibrary, 'function');
        assert.strictEqual(typeof ui.fillEngineModelSelect, 'function');
        assert.doesNotThrow(() => ui.renderEngineModelsCards());
        assert.ok(String(listEl.innerHTML).includes('暂无模型目录'));
        assert.doesNotThrow(() => ui.renderEngineModelsList([]));
        assert.strictEqual(pickCatalog.length, 0);
    });

    it('onFactoryModelsWorkspaceShow clears stale compute lock before browse-only', async () => {
        let cleared = 0;
        let browseCalls = 0;
        let ensureCalls = 0;
        let ensureForce = null;
        const toasts = [];
        const els = {
            engineModelsPanel: null,
            engineModelsLoading: { classList: { toggle() {} }, setAttribute() {} },
            engineModelsSummary: { textContent: '' },
            engineModelsLibraryDlStrip: { classList: { toggle() {} } },
            engineModelsLibraryTabSummary: { textContent: '' },
            engineModelsSelectedHint: { textContent: '', classList: { remove() {} } },
            engineModelsSearch: { focus() {} },
            engineModelsTabAllCount: { textContent: '' },
            engineModelsTabInstalledCount: { textContent: '' },
            engineModelsTabAvailableCount: { textContent: '' },
            engineModelsTabRecommendedCount: { textContent: '' },
            engineModelsTabIncompleteCount: { textContent: '' },
            engineModelsTabExperimentalCount: { textContent: '' },
            engineModelsTabAsrCount: { textContent: '' },
            engineModelsTabVadCount: { textContent: '' },
            engineModelsTabLlmCount: { textContent: '' },
            engineModelsTabSeparateCount: { textContent: '' },
            engineModelsFilters: null,
            engineModelsStatusFilters: null,
        };
        const ui = createEngineModelsLibraryUi({
            els,
            state: { factoryWorkspace: 'models' },
            engineModelsUi: {
                formatModelsSummary: () => '',
                countPickCatalogByStatus: () => ({}),
                countPickCatalogByGroup: () => ({}),
            },
            esc: (s) => String(s ?? ''),
            uiTf: (s, p) => (p?.label ? s.replace('{label}', p.label) : s),
            readEngineBackendFromForm: () => 'transub',
            clearStaleComputeBusyIfNeeded: async () => {
                cleared += 1;
                return { cleared: true, before: { label: '引擎区间重转写' } };
            },
            syncComputeBusyFromMain: async () => false,
            resolveEngineModelsBrowseOnly: async () => {
                browseCalls += 1;
                return false;
            },
            ensureEngineModelsCatalog: async (opts = {}) => {
                ensureCalls += 1;
                ensureForce = !!opts.force;
                return { ok: true, fromCache: !opts.force };
            },
            markEngineModelsRefreshed: () => {},
            showToast: (m) => { toasts.push(m); },
            appendLog: () => {},
            getCachedEnginePickCatalog: () => [],
            getEngineModelsBusy: () => false,
            getEngineModelsBrowseOnly: () => false,
            setEngineModelsBrowseOnly: () => {},
            hasEngineModelsCacheInMemory: () => false,
            getIsStandaloneSettings: () => false,
            getAdvancedEntitled: () => false,
        });
        await ui.onFactoryModelsWorkspaceShow({ refresh: true });
        assert.strictEqual(cleared, 1);
        assert.strictEqual(browseCalls, 1);
        assert.strictEqual(ensureCalls, 1);
        assert.strictEqual(ensureForce, true);
        assert.ok(toasts.some((t) => String(t).includes('引擎区间重转写')));

        ensureCalls = 0;
        ensureForce = null;
        await ui.onFactoryModelsWorkspaceShow({});
        assert.strictEqual(ensureCalls, 1);
        assert.strictEqual(ensureForce, false);
    });
});
