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

    it('applyOptionsToForm keeps film enhance toggles when keys are omitted', async () => {
        installMinimalDocument();
        const filmAudioEnhanceCheck = { checked: true };
        const enhanceForVadOnlyCheck = { checked: true, disabled: false };
        const filmVadPresetCheck = { checked: false };
        const api = createSettingsFormApply({
            els: {
                filmAudioEnhanceCheck,
                enhanceForVadOnlyCheck,
                filmVadPresetCheck,
            },
            settingsNormApi: norm,
            savedOptionsApi: saved,
            DEFAULT_AUDIO_SUFFIXES: 'mp3,wav',
            readTaskFromForm: () => 'transcribe',
            readTranslateModeFromForm: () => 'engine',
            readEngineBackendFromForm: () => 'transub',
            engineInstallPathForSave: () => '',
            readLlmMtModelFromForm: () => '',
            readDualLineOrderFromForm: () => 'target-first',
            readSubFormatsFromForm: () => ['srt'],
            readModelPathFromForm: () => '',
            normalizeChineseSubtitleVariant: (v) => v || 'simplified',
            getAdvancedEntitled: () => true,
            getInsertSoftwareCreditDefault: () => false,
            getAutoScanFoldersDraft: () => [],
            setAutoScanFoldersDraft: () => {},
            getTranslateStyleEnabled: () => false,
            stashTwaiLegacyFromOptions: () => {},
            ensureEngineInstallPathFilled: async () => {},
            syncProxySettingsUi: () => {},
            syncTransubStationSettingsUi: () => {},
            ensureSelectValue: () => {},
            syncEngineBackendUi: () => {},
            applyDualLineOrderToForm: () => {},
            updateTranslateStyleUi: () => {},
            applySubFormatsToForm: () => {},
            applyBurnSettingsToForm: () => {},
            syncLogLevelHint: () => {},
            syncExpertExtraChipsUi: () => {},
            refreshAutoScanFoldersListUi: () => {},
            refreshSubtitleEditorPathHint: async () => {},
            setPostBatchQcFixMode: () => {},
            applyActivePresetIdToSelect: () => {},
            syncQuickExtrasBar: () => {},
        });
        await api.applyOptionsToForm({ language: 'ja', filmVadPreset: true }, { applyUiMode: false });
        assert.strictEqual(filmAudioEnhanceCheck.checked, true);
        assert.strictEqual(enhanceForVadOnlyCheck.checked, true);
        assert.strictEqual(enhanceForVadOnlyCheck.disabled, false);
        // film enhance stays on → film VAD checkbox stays off (mutex)
        assert.strictEqual(filmVadPresetCheck.checked, false);
    });

    it('yue + stale transcribe + 简/繁 chip heals to translate; 原文 stays 原文', async () => {
        installMinimalDocument();
        globalThis.TransubSubtitleTargetLang = require('../src/js/subtitle-target-lang-core.js');
        const quickTargetLangSelect = { value: 'source' };
        const chineseSubtitleVariantSelect = { value: 'simplified' };
        const taskSelect = { value: 'transcribe' };
        const baseDeps = {
            settingsNormApi: norm,
            savedOptionsApi: saved,
            DEFAULT_AUDIO_SUFFIXES: 'mp3,wav',
            readTaskFromForm: () => String(taskSelect.value || 'transcribe'),
            readTranslateModeFromForm: () => 'engine',
            readEngineBackendFromForm: () => 'transub',
            engineInstallPathForSave: () => '',
            readLlmMtModelFromForm: () => '',
            readDualLineOrderFromForm: () => 'target-first',
            readSubFormatsFromForm: () => ['srt'],
            readModelPathFromForm: () => '',
            normalizeChineseSubtitleVariant: (v) => v || 'simplified',
            toQuickTargetLang: (v) => String(v || 'simplified'),
            getAdvancedEntitled: () => false,
            getInsertSoftwareCreditDefault: () => false,
            getAutoScanFoldersDraft: () => [],
            setAutoScanFoldersDraft: () => {},
            getTranslateStyleEnabled: () => false,
            stashTwaiLegacyFromOptions: () => {},
            ensureEngineInstallPathFilled: async () => {},
            syncProxySettingsUi: () => {},
            syncTransubStationSettingsUi: () => {},
            ensureSelectValue: () => {},
            syncEngineBackendUi: () => {},
            applyDualLineOrderToForm: () => {},
            updateTranslateStyleUi: () => {},
            applySubFormatsToForm: () => {},
            applyBurnSettingsToForm: () => {},
            syncLogLevelHint: () => {},
            syncExpertExtraChipsUi: () => {},
            refreshAutoScanFoldersListUi: () => {},
            refreshSubtitleEditorPathHint: async () => {},
            setPostBatchQcFixMode: () => {},
            applyActivePresetIdToSelect: () => {},
            syncQuickExtrasBar: () => {},
        };
        const api = createSettingsFormApply({
            ...baseDeps,
            els: { quickTargetLangSelect, chineseSubtitleVariantSelect, taskSelect },
        });
        await api.applyOptionsToForm({
            language: 'yue',
            task: 'transcribe',
            chineseSubtitleVariant: 'simplified',
            subtitleTargetChip: 'simplified',
            subtitleTargetLang: 'zh-Hans',
        }, { applyUiMode: false });
        assert.strictEqual(quickTargetLangSelect.value, 'simplified');
        assert.strictEqual(taskSelect.value, 'translate');

        await api.applyOptionsToForm({
            language: 'yue',
            task: 'transcribe',
            chineseSubtitleVariant: 'simplified',
            subtitleTargetChip: 'source',
            subtitleTargetLang: 'zh-Hans',
        }, { applyUiMode: false });
        assert.strictEqual(quickTargetLangSelect.value, 'source');
        assert.strictEqual(taskSelect.value, 'transcribe');

        chineseSubtitleVariantSelect.value = 'traditional';
        await api.applyOptionsToForm({
            language: 'yue',
            task: 'transcribe',
            chineseSubtitleVariant: 'traditional',
            subtitleTargetChip: 'traditional',
            subtitleTargetLang: 'zh-Hant',
        }, { applyUiMode: false });
        assert.strictEqual(quickTargetLangSelect.value, 'traditional');
        assert.strictEqual(taskSelect.value, 'translate');

        // Legacy: no chip key → 原文
        await api.applyOptionsToForm({
            language: 'yue',
            task: 'transcribe',
            chineseSubtitleVariant: 'simplified',
            subtitleTargetLang: 'zh-Hans',
        }, { applyUiMode: false });
        assert.strictEqual(quickTargetLangSelect.value, 'source');
    });
});
