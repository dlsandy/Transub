'use strict';

const assert = require('assert');
const {
    createEngineModelsCacheShell,
} = require('../src/js/engine-models-cache-shell-core.js');
const engineModelsCacheApi = require('../src/js/engine-models-cache-core.js');

describe('TransubEngineModelsCacheShell', () => {
    it('exports createEngineModelsCacheShell', () => {
        assert.strictEqual(typeof createEngineModelsCacheShell, 'function');
    });

    it('factory + load/apply smoke with mocks', async () => {
        let models = [];
        let pickCatalog = [];
        let demucsProbe = null;
        let browseOnly = false;
        let busy = false;
        let busyKind = null;
        let activeSource = 'engine';
        let cardsRendered = 0;
        const cachePayload = {
            models: [{ id: 'asr-a', kind: 'asr', installed: true }],
            pickCatalog: [{ id: 'asr-a', kind: 'asr', installed: true, label: 'ASR A' }],
            demucsProbe: { ready: true },
            savedAt: Date.now() - 60_000,
        };

        const banner = {
            classList: { toggle() {} },
            textContent: '',
        };

        const shell = createEngineModelsCacheShell({
            els: {
                engineModelsCacheBanner: banner,
                engineModelsSummary: { textContent: '' },
                engineModelsList: { childElementCount: 0, querySelectorAll: () => [] },
                engineModelsFilters: null,
                engineModelsStatusFilters: null,
                engineRefreshModelsBtn: { disabled: false, title: '' },
            },
            state: { running: false, retranslateBusy: false, computeBusy: false },
            electron: {
                transubEngineModelsCacheLoad: async () => ({ ok: true, cache: cachePayload }),
                transubEngineModelsCacheSave: async (snap) => ({ ok: true, savedAt: snap.savedAt }),
            },
            engineModelsCacheApi,
            engineModelsUi: {},
            engineDlFmt: {
                formatEngineDownloadBytes: () => '1 B',
                formatEngineDownloadSpeed: () => '1 B/s',
                formatEngineDownloadSizeLine: () => '1 B',
            },
            getEngineModelsBrowseOnly: () => browseOnly,
            setEngineModelsBrowseOnlyFlag: (v) => { browseOnly = !!v; },
            getEngineModelsBusy: () => busy,
            setEngineModelsBusy: (v) => { busy = !!v; },
            getEngineModelsBusyKind: () => busyKind,
            setEngineModelsBusyKind: (v) => { busyKind = v; },
            getCachedEngineModels: () => models,
            setCachedEngineModels: (v) => { models = Array.isArray(v) ? v : []; },
            getCachedEnginePickCatalog: () => pickCatalog,
            setCachedEnginePickCatalog: (v) => { pickCatalog = Array.isArray(v) ? v : []; },
            getCachedDemucsProbe: () => demucsProbe,
            setCachedDemucsProbe: (v) => { demucsProbe = v || null; },
            setEngineDownloadActiveSource: (v) => { activeSource = v; },
            isEngineModelsLibraryOpen: () => false,
            renderEngineModelsCards: () => { cardsRendered += 1; },
            renderEngineModelsList: () => {},
            normalizeEnginePickCatalog: (m) => (Array.isArray(m) ? m : []),
            fillEngineModelSelect: () => {},
            syncEngineModelsLibraryTabSummary: () => {},
            syncEngineModelsLibraryDlStrip: () => {},
            syncExpertQuickModelSelects: () => {},
        });

        assert.strictEqual(typeof shell.loadEngineModelsCacheFromDisk, 'function');
        assert.strictEqual(typeof shell.applyEngineModelsCacheSnapshot, 'function');
        assert.strictEqual(typeof shell.setEngineDownloadBusy, 'function');
        assert.strictEqual(shell.hasEngineModelsCacheInMemory(), false);

        const res = await shell.loadEngineModelsCacheFromDisk({ apply: true });
        assert.strictEqual(res.ok, true);
        assert.strictEqual(shell.hasEngineModelsCacheInMemory(), true);
        assert.strictEqual(models.length, 1);
        assert.strictEqual(pickCatalog.length, 1);
        assert.ok(demucsProbe && demucsProbe.ready);

        shell.setEngineModelsBrowseOnly(true);
        assert.strictEqual(browseOnly, true);
        assert.ok(String(banner.textContent).includes('任务进行中'));

        shell.setEngineDownloadBusy(true);
        assert.strictEqual(busy, true);
        shell.setEngineDownloadBusy(false);
        assert.strictEqual(busy, false);
        assert.strictEqual(busyKind, null);
        assert.strictEqual(activeSource, null);
        assert.ok(cardsRendered >= 1);

        assert.strictEqual(shell.formatEngineDownloadBytes(1), '1 B');
        assert.strictEqual(shell.explainEngineModelsMutateBlocked().includes('任务进行中'), true);
    });

    it('applyEngineModelsCacheSnapshot seeds smart-translate pick from managedCatalog', () => {
        let models = [];
        let pickCatalog = [];
        let smartPick = null;
        const shell = createEngineModelsCacheShell({
            els: {
                engineModelsCacheBanner: { classList: { toggle() {} }, textContent: '' },
                engineModelsSummary: { textContent: '' },
            },
            state: {},
            engineModelsCacheApi,
            getCachedEngineModels: () => models,
            setCachedEngineModels: (v) => { models = Array.isArray(v) ? v : []; },
            getCachedEnginePickCatalog: () => pickCatalog,
            setCachedEnginePickCatalog: (v) => { pickCatalog = Array.isArray(v) ? v : []; },
            getCachedDemucsProbe: () => null,
            setCachedDemucsProbe: () => {},
            getCachedSmartTranslatePick: () => smartPick,
            setCachedSmartTranslatePick: (v) => { smartPick = v; },
            fillEngineModelSelect: () => {},
            syncExpertQuickModelSelects: () => {},
            syncEngineModelsLibraryTabSummary: () => {},
            isEngineModelsLibraryOpen: () => false,
        });

        const ok = shell.applyEngineModelsCacheSnapshot({
            models: [{ id: 'sakura-1.5b', kind: 'mt', installed: true }],
            pickCatalog: [{ id: 'sakura-1.5b', kind: 'mt', installed: true }],
            managedCatalog: [
                { id: 'qwen3-8b', name: 'Qwen', installed: true, group: 'llm' },
            ],
            savedAt: Date.now(),
        }, { fromDisk: true });

        assert.strictEqual(ok, true);
        assert.ok(Array.isArray(smartPick?.catalog));
        assert.strictEqual(smartPick.catalog[0].id, 'qwen3-8b');
        assert.strictEqual(smartPick.fromDiskCache, true);
        assert.strictEqual(shell.getCachedManagedCatalogSnapshot()[0].id, 'qwen3-8b');
    });

    it('ensureEngineModelsCatalog uses cache unless force or missing ids', async () => {
        let models = [{ id: 'asr-a', kind: 'asr', installed: true }];
        let pickCatalog = [{ id: 'asr-a', kind: 'asr', installed: true, label: 'ASR A' }];
        let liveCalls = 0;
        const shell = createEngineModelsCacheShell({
            els: {
                engineModelsCacheBanner: { classList: { toggle() {} }, textContent: '' },
                engineModelsSummary: { textContent: '' },
                engineModelsList: { childElementCount: 1, querySelectorAll: () => [] },
            },
            state: {},
            electron: {
                transubEngineModelsCacheLoad: async () => ({ ok: false, empty: true }),
            },
            engineModelsCacheApi,
            getCachedEngineModels: () => models,
            setCachedEngineModels: (v) => { models = Array.isArray(v) ? v : []; },
            getCachedEnginePickCatalog: () => pickCatalog,
            setCachedEnginePickCatalog: (v) => { pickCatalog = Array.isArray(v) ? v : []; },
            getCachedDemucsProbe: () => null,
            setCachedDemucsProbe: () => {},
            refreshEngineModels: async () => {
                liveCalls += 1;
                return { ok: true, models };
            },
            isEngineModelsLibraryOpen: () => false,
            renderEngineModelsCards: () => {},
            syncEngineModelsLibraryTabSummary: () => {},
        });

        const hit = await shell.ensureEngineModelsCatalog({ silent: true });
        assert.strictEqual(hit.fromCache, true);
        assert.strictEqual(liveCalls, 0);

        const missId = await shell.ensureEngineModelsCatalog({
            silent: true,
            requiredModelIds: ['asr-a', 'missing-x'],
        });
        assert.strictEqual(missId.fromCache, false);
        assert.strictEqual(liveCalls, 1);

        const forced = await shell.ensureEngineModelsCatalog({ force: true, silent: true });
        assert.strictEqual(forced.fromCache, false);
        assert.strictEqual(liveCalls, 2);
    });
});
