'use strict';

const assert = require('assert');
const { createEngineEnvUi } = require('../src/js/engine-env-ui-core.js');

describe('TransubEngineEnvUi', () => {
    it('exports createEngineEnvUi', () => {
        assert.strictEqual(typeof createEngineEnvUi, 'function');
    });

    it('syncProxySettingsUi / readProxyOptionsFromForm / updateEnvBanner smoke', () => {
        const els = {
            proxyEnabledCheck: { checked: true },
            proxySettingsFields: { classList: { toggle() {} } },
            proxyUrlInput: { value: 'http://127.0.0.1:7890', disabled: false },
            proxyBypassInput: { value: 'localhost', disabled: false },
            proxyTestBtn: { disabled: false },
            envBanner: { classList: { toggle() {} } },
            installPathInput: { value: '' },
            engineInstallPathInput: { value: 'C:/engine' },
            engineStatus: { className: 'text-xs text-gray-500' },
        };
        const ui = createEngineEnvUi({
            els,
            electron: {},
            readEngineBackendFromForm: () => 'transub',
            updateEmptyStateUi: () => {},
            syncFactoryEngineStatus: () => {},
        });

        assert.strictEqual(typeof ui.syncProxySettingsUi, 'function');
        assert.doesNotThrow(() => ui.syncProxySettingsUi());
        const proxy = ui.readProxyOptionsFromForm();
        assert.strictEqual(proxy.proxyEnabled, true);
        assert.strictEqual(proxy.proxyUrl, 'http://127.0.0.1:7890');
        assert.doesNotThrow(() => ui.updateEnvBanner());
        assert.strictEqual(ui.engineInstallPathForSave(), 'C:/engine');
        assert.strictEqual(typeof ui.saveParamsSettings, 'function');
        assert.strictEqual(typeof ui.setEngineStatusText, 'function');
    });

    it('sameFsPath normalizes separators', () => {
        const ui = createEngineEnvUi({ els: {} });
        assert.strictEqual(ui.sameFsPath('C:\\Foo\\Bar', 'C:/Foo/Bar'), true);
        assert.strictEqual(ui.sameFsPath('C:\\Foo', 'D:\\Foo'), false);
    });

    it('saveParamsSettings accepts empty path when bundled engine is available', async () => {
        const switched = [];
        const status = [];
        const els = {
            engineInstallPathInput: { value: '' },
            saveParamsBtn: { disabled: false },
            saveAndCloseParamsBtn: { disabled: false },
        };
        const ui = createEngineEnvUi({
            els,
            electron: {
                transubEngineBundledPath: async () => ({ ok: true, path: 'C:/bundled/transub-engine' }),
                transWithAiSaveOptions: async () => ({ ok: true }),
            },
            isDesktop: () => true,
            readEngineBackendFromForm: () => 'transub',
            readTaskFromForm: () => 'translate',
            buildSavedOptionsFromForm: () => ({ engineBackend: 'transub' }),
            setSaveParamsStatus: (t) => { status.push(t); },
            switchParamsTab: (tab) => { switched.push(tab); },
            markSettingsDirty: () => {},
            updateParamsSummary: () => {},
            appendLog: () => {},
            updateEmptyStateUi: () => {},
            syncFactoryEngineStatus: () => {},
            updateReadinessStrip: () => {},
            setSavedOptionsSnapshot: () => {},
            getIsStandaloneSettings: () => false,
            canUseSmartTranslateUi: () => true,
            getAdvancedEntitled: () => true,
        });

        await ui.saveParamsSettings({ closeAfter: false });
        assert.deepStrictEqual(switched, []);
        assert.ok(status.includes('已保存') || status.includes('保存中…'));
        assert.strictEqual(els.engineInstallPathInput.value, 'C:/bundled/transub-engine');
    });

    it('saveParamsSettings switches to install only when no engine path exists', async () => {
        const switched = [];
        const els = {
            engineInstallPathInput: { value: '' },
            saveParamsBtn: { disabled: false },
            saveAndCloseParamsBtn: { disabled: false },
        };
        const ui = createEngineEnvUi({
            els,
            electron: {
                transubEngineBundledPath: async () => ({ ok: false }),
                transWithAiSaveOptions: async () => ({ ok: true }),
            },
            isDesktop: () => true,
            readEngineBackendFromForm: () => 'transub',
            setSaveParamsStatus: () => {},
            switchParamsTab: (tab) => { switched.push(tab); },
            appendLog: () => {},
            updateEmptyStateUi: () => {},
            syncFactoryEngineStatus: () => {},
            updateReadinessStrip: () => {},
        });

        await ui.saveParamsSettings({ closeAfter: false });
        assert.deepStrictEqual(switched, ['install']);
    });
});
