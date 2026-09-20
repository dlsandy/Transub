'use strict';

const assert = require('assert');
const { createAppInit } = require('../src/js/app-init-core.js');

describe('TransubAppInit', () => {
    it('exports createAppInit', () => {
        assert.strictEqual(typeof createAppInit, 'function');
    });

    it('init loads options and clears boot overlay', async () => {
        const calls = [];
        const state = { loadingDepth: 0 };
        const overlay = {
            classList: {
                add(name) { calls.push(`add:${name}`); },
                remove(name) { calls.push(`remove:${name}`); },
            },
        };
        const els = { loadingOverlay: overlay };
        let saved = null;
        const boot = createAppInit({
            state,
            els,
            electron: {
                async transWithAiGetOptions() {
                    return { options: { task: 'translate' } };
                },
            },
            pageQuery: new URLSearchParams(''),
            getIsStandaloneSettings: () => false,
            getIsStandaloneWizard: () => false,
            getIsStandaloneChrome: () => false,
            isDesktop: () => true,
            cacheEls: () => calls.push('cacheEls'),
            syncQuickExtrasBar: () => {},
            fillAppVersionLabel: async () => {},
            bindEvents: () => calls.push('bindEvents'),
            bindFactoryShellChrome: () => {},
            syncDeviceOptionsForMode: () => {},
            syncExpertCustomHints: () => {},
            setBadge: () => {},
            syncBatchSizeUi: () => {},
            syncLogLevelHint: () => {},
            syncChineseSubtitleVariantUi: () => {},
            syncPostTaskMenuUi: () => {},
            syncPostTaskExtrasUi: () => {},
            resetPostTaskSelect: () => {},
            renderList: () => {},
            updateStartButton: () => {},
            warnMissingRendererCores: () => {},
            setLoading: (on) => calls.push(`loading:${on}`),
            applyOptionsToForm: async () => calls.push('applyOptions'),
            buildSavedOptionsFromForm: () => ({ task: 'translate' }),
            setSavedOptionsSnapshot: (o) => { saved = o; },
            updateParamsSummary: () => {},
            syncResourceUsageMonitor: () => {},
            loadEngineModelsCacheFromDisk: async () => {},
            readEngineBackendFromForm: () => 'engine',
            refreshEngineStatus: async () => {},
            ensureSettingsShellReady: async () => {},
            loadDeferredGroup: async () => {},
            refreshAdvancedEntitlement: async () => {},
            flushPendingActivePresetId: () => {},
            syncPostTaskToMain: async () => {},
            runBackgroundStartupChecks: async () => {},
            consumeExternalImportFiles: async () => {},
            openAppSettings: () => {},
        });
        await boot.init();
        assert.ok(calls.includes('cacheEls'));
        assert.ok(calls.includes('bindEvents'));
        assert.ok(calls.includes('applyOptions'));
        assert.deepStrictEqual(saved, { task: 'translate' });
        assert.strictEqual(state.loadingDepth, 0);
        assert.ok(calls.includes('add:hidden'));
    });

    it('finishBootOverlay always clears boot mask even when loadingDepth > 0', () => {
        const calls = [];
        const state = { loadingDepth: 1 };
        const overlay = {
            classList: {
                add(name) { calls.push(`add:${name}`); },
                remove(name) { calls.push(`remove:${name}`); },
            },
            style: {},
        };
        const boot = createAppInit({
            state,
            els: { loadingOverlay: overlay },
            pageQuery: new URLSearchParams(''),
            getIsStandaloneSettings: () => false,
            getIsStandaloneWizard: () => false,
            getIsStandaloneChrome: () => false,
        });
        boot.finishBootOverlay();
        assert.strictEqual(state.loadingDepth, 1);
        assert.ok(calls.includes('add:hidden'));
        assert.strictEqual(overlay.style.display, 'none');
    });

    it('standalone chrome keeps boot overlay until after paint', async () => {
        const calls = [];
        const overlay = {
            classList: {
                add(name) { calls.push(`add:${name}`); },
                remove(name) { calls.push(`remove:${name}`); },
            },
            style: { display: 'flex' },
        };
        const els = {
            loadingOverlay: overlay,
            loadingMessage: { textContent: '' },
        };
        const prevRaf = global.requestAnimationFrame;
        global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
        const boot = createAppInit({
            state: { loadingDepth: 0 },
            els,
            electron: {
                async transWithAiGetOptions() { return { options: { task: 'translate' } }; },
                async transubConsumePendingOpenParams() { return { tab: 'runtime' }; },
            },
            pageQuery: new URLSearchParams('standaloneSettings=1'),
            getIsStandaloneSettings: () => true,
            getIsStandaloneWizard: () => false,
            getIsStandaloneChrome: () => true,
            isDesktop: () => true,
            cacheEls: () => {},
            syncQuickExtrasBar: () => {},
            fillAppVersionLabel: async () => {},
            bindEvents: () => {},
            bindFactoryShellChrome: () => {},
            syncDeviceOptionsForMode: () => {},
            syncExpertCustomHints: () => {},
            setBadge: () => {},
            syncBatchSizeUi: () => {},
            syncLogLevelHint: () => {},
            syncChineseSubtitleVariantUi: () => {},
            warnMissingRendererCores: () => {},
            setLoading: () => {},
            applyOptionsToForm: async () => {},
            buildSavedOptionsFromForm: () => ({}),
            setSavedOptionsSnapshot: () => {},
            updateParamsSummary: () => {},
            syncResourceUsageMonitor: () => {},
            loadEngineModelsCacheFromDisk: async () => {},
            readEngineBackendFromForm: () => 'engine',
            refreshEngineStatus: async () => {},
            ensureSettingsShellReady: async () => {},
            loadDeferredGroup: async () => {},
            refreshAdvancedEntitlement: async () => {},
            openParamsModal: (tab) => calls.push(`open:${tab}`),
            openEngineModelsLibrary: async () => {},
        });
        try {
            await boot.init();
            assert.ok(calls.includes('open:runtime'));
            assert.ok(!calls.includes('add:hidden'), 'overlay should stay until after paint');
            await new Promise((r) => setTimeout(r, 30));
            assert.ok(calls.includes('add:hidden'));
            assert.strictEqual(overlay.style.display, 'none');
        } finally {
            global.requestAnimationFrame = prevRaf;
        }
    });
});
