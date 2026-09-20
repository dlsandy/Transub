'use strict';

const assert = require('assert');
const {
    createSettingsFormApply,
} = require('../src/js/settings-form-apply-core.js');
const saved = require('../src/js/settings-saved-options-core.js');
const norm = require('../src/js/settings-options-normalize-core.js');

function installMinimalDocument() {
    if (typeof global.document !== 'undefined' && global.document?.getElementById) return;
    global.document = {
        getElementById: () => null,
    };
}

describe('TransubSettingsFormApply', () => {
    it('exports createSettingsFormApply', () => {
        assert.strictEqual(typeof createSettingsFormApply, 'function');
    });

    it('buildSavedOptionsFromForm with minimal mock els/state returns object', () => {
        installMinimalDocument();
        let mtUse = false;
        let folders = [];
        let insertDefault = false;
        const els = {
            engineUrlInput: { value: 'http://127.0.0.1:8765' },
            engineHfEndpointInput: { value: 'https://hf-mirror.com' },
            engineHfTokenInput: { value: '' },
            proxyEnabledCheck: { checked: false },
            proxyUrlInput: { value: '' },
            proxyBypassInput: { value: '' },
            engineProfileSelect: { value: 'balanced' },
            engineAsrModelSelect: { value: 'sensevoice-small' },
            engineVadModelSelect: { value: 'fsmn-vad' },
            engineAutoStartCheck: { checked: true },
            deviceSelect: { value: 'cuda' },
            overwriteCheck: { checked: false },
            mergeBilingualCheck: { checked: false },
            insertSoftwareCreditCheck: { checked: true },
            smartTranslateCheck: { checked: false },
            smartTranslateFaithfulCheck: { checked: false },
            translateStylePresetSelect: { value: 'natural_spoken' },
            translateStyleCustomNoteInput: { value: '' },
            chineseSubtitleVariantSelect: { value: 'simplified' },
            logLevelSelect: { value: 'DEBUG' },
            maxBatchSizeInput: { value: '8' },
            languageSelect: { value: 'auto' },
            beamSizeInput: { value: '5' },
            vadEnabledCheck: { checked: true },
            transcriptKeepDirInput: { value: '' },
            trayProgressCheck: { checked: true },
            showTaskResourceUsageCheck: { checked: true },
            rememberLastOpenDirCheck: { checked: true },
            minimizeToTrayCheck: { checked: true },
            subtitleEditorBackendSelect: { value: 'auto' },
            subtitleEditorPathInput: { value: '' },
            uiLocaleSelect: { value: 'zh-Hans' },
            postBatchQcCheck: { checked: true },
            postBatchCpsSplitCheck: { checked: true },
            postBatchRemoveNoiseCheck: { checked: true },
            postBatchCompressRepCheck: { checked: true },
            audioSuffixesInput: { value: '' },
            autoScanRecursiveCheck: { checked: true },
        };
        const api = createSettingsFormApply({
            els,
            settingsNormApi: norm,
            savedOptionsApi: saved,
            DEFAULT_AUDIO_SUFFIXES: 'mp3,wav',
            readTaskFromForm: () => 'translate',
            readTranslateModeFromForm: () => 'engine',
            readEngineBackendFromForm: () => 'transub',
            engineInstallPathForSave: () => '',
            readLlmMtModelFromForm: () => '',
            readDualLineOrderFromForm: () => 'target-first',
            readSubFormatsFromForm: () => ['srt'],
            readModelPathFromForm: () => '',
            normalizeChineseSubtitleVariant: (v) => v || 'simplified',
            readTwaiLegacyOptions: () => ({}),
            isAutoSenseEnabled: () => true,
            getActiveParamsPresetId: () => '',
            getPostBatchQcFixMode: () => 'smart',
            resolveOutputDirFromForm: () => '',
            normalizeViewingCleanMode: (v, fb = 'clear') => {
                const s = String(v || '').trim().toLowerCase();
                return (s === 'off' || s === 'light' || s === 'clear') ? s : fb;
            },
            mtRouteApi: () => ({}),
            getTranslateModeUi: () => null,
            getAdvancedEntitled: () => false,
            getSavedOptionsSnapshot: () => null,
            getMtUseFormState: () => mtUse,
            setMtUseFormState: (on) => { mtUse = !!on; },
            getAutoScanFoldersDraft: () => folders,
            setAutoScanFoldersDraft: (next) => { folders = next; },
            setInsertSoftwareCreditIsDefault: (v) => { insertDefault = !!v; },
            stashTwaiLegacyFromOptions: () => {},
        });
        const out = api.buildSavedOptionsFromForm();
        assert.ok(out && typeof out === 'object');
        assert.strictEqual(out.task, 'translate');
        assert.strictEqual(out.engineBackend, 'transub');
        assert.strictEqual(out.device, 'cuda');
        assert.strictEqual(typeof insertDefault, 'boolean');
        void insertDefault;
    });
});
