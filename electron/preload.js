const { contextBridge, ipcRenderer, webUtils } = require('electron');

function buildMediaUrl(filePath) {
    const p = String(filePath || '').trim();
    if (!p) return '';
    return `transub-media://video?path=${encodeURIComponent(p)}`;
}

contextBridge.exposeInMainWorld('__ELECTRON__', {
    isDesktop: true,
    platform: process.platform,
    getAppVersion: () => ipcRenderer.invoke('transub-get-app-version'),
    transubGetAppTheme: () => ipcRenderer.invoke('transub-get-app-theme'),
    transubSetAppTheme: (payload) => ipcRenderer.invoke('transub-set-app-theme', payload || {}),
    onAppThemeChanged: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const handler = (_event, payload) => callback(payload);
        ipcRenderer.on('transub-app-theme-changed', handler);
        return () => ipcRenderer.removeListener('transub-app-theme-changed', handler);
    },
    getPathForFile: (file) => {
        try {
            if (!file) return '';
            return webUtils.getPathForFile(file) || '';
        } catch (_) {
            return '';
        }
    },
    selectFolder: (options) => ipcRenderer.invoke('electron-select-folder', options || {}),
    openExternal: (url) => ipcRenderer.invoke('transwithai-open-external', url || ''),
    showInFolder: (filePath) => ipcRenderer.invoke('transwithai-show-in-folder', filePath || ''),
    openPath: (filePath) => ipcRenderer.invoke('transwithai-open-path', filePath || ''),
    ffmpegProbe: (payload) => ipcRenderer.invoke('ffmpeg-probe', payload || {}),
    ffmpegProbeAcoustic: (payload) => ipcRenderer.invoke('ffmpeg-probe-acoustic', payload || {}),
    transubSenseMemoryLookup: (payload) => ipcRenderer.invoke('transub-sense-memory-lookup', payload || {}),
    transubSenseMemoryRecord: (payload) => ipcRenderer.invoke('transub-sense-memory-record', payload || {}),
    transubSenseMemoryStats: () => ipcRenderer.invoke('transub-sense-memory-stats'),
    transubSenseMemoryClear: () => ipcRenderer.invoke('transub-sense-memory-clear'),
    ffmpegValidate: (payload) => ipcRenderer.invoke('ffmpeg-validate', payload || {}),
    transubEnvCheck: (payload) => ipcRenderer.invoke('transub-env-check', payload || {}),
    ffmpegDetectSilence: (payload = {}) => ipcRenderer.invoke('ffmpeg-detect-silence', {
        path: payload.path || '',
        startMs: Number(payload.startMs) || 0,
        endMs: Number(payload.endMs) || 0,
        durationMs: Number(payload.durationMs) || 0,
        noiseDb: payload.noiseDb,
        minSilenceSec: payload.minSilenceSec,
        minSegmentMs: payload.minSegmentMs,
        ffmpegPath: payload.ffmpegPath || '',
    }),
    ffmpegCancel: () => ipcRenderer.invoke('ffmpeg-cancel'),
    ffmpegExtractWaveform: (payload = {}) => ipcRenderer.invoke('ffmpeg-extract-waveform', {
        path: payload.path || '',
        peaksPerSec: payload.peaksPerSec,
        maxPeaks: payload.maxPeaks,
        ffmpegPath: payload.ffmpegPath || '',
    }),
    selectFfmpeg: (options) => ipcRenderer.invoke('electron-select-ffmpeg', options || {}),
    transWithAiValidate: (payload) => ipcRenderer.invoke('transwithai-validate', payload || {}),
    transWithAiCheckEngineUpdate: (payload) => ipcRenderer.invoke('transwithai-check-engine-update', payload || {}),
    transWithAiGenerateSubtitles: (payload) => ipcRenderer.invoke('transwithai-generate-subtitles', payload || {}),
    transubEngineValidate: (payload) => ipcRenderer.invoke('transub-engine-validate', payload || {}),
    transubEngineBundledPath: () => ipcRenderer.invoke('transub-engine-bundled-path'),
    transubEngineListModels: (payload) => ipcRenderer.invoke('transub-engine-list-models', payload || {}),
    transubEngineRecommend: (payload) => ipcRenderer.invoke('transub-engine-recommend', payload || {}),
    transubEngineDetectLanguage: (payload) => ipcRenderer.invoke('transub-engine-detect-language', payload || {}),
    transubEngineDownloadModels: (payload) => ipcRenderer.invoke('transub-engine-download-models', payload || {}),
    transubEngineGpuStatus: (payload) => ipcRenderer.invoke('transub-engine-gpu-status', payload || {}),
    transubEngineAsrWhisperStatus: (payload) => ipcRenderer.invoke('transub-engine-asr-whisper-status', payload || {}),
    transubEngineEnsureGpu: (payload) => ipcRenderer.invoke('transub-engine-ensure-gpu', payload || {}),
    transubEngineAudioSeparateStatus: (payload) => ipcRenderer.invoke('transub-engine-audio-separate-status', payload || {}),
    transubEngineOpenDownload: (payload) => ipcRenderer.invoke('transub-engine-open-download', payload || {}),
    transubEngineRunDownload: (payload) => ipcRenderer.invoke('transub-engine-run-download', payload || {}),
    transubEngineCancelDownload: () => ipcRenderer.invoke('transub-engine-cancel-download'),
    transubEngineDownloadInfo: (payload) => ipcRenderer.invoke('transub-engine-download-info', payload || {}),
    transubEngineOpenManualUrl: (payload) => ipcRenderer.invoke('transub-engine-open-manual-url', payload || {}),
    transubEngineOpenDownloadFolder: (payload) => ipcRenderer.invoke('transub-engine-open-download-folder', payload || {}),
    transubEnginePickWhl: (payload) => ipcRenderer.invoke('transub-engine-pick-whl', payload || {}),
    transubEngineInstallLocalWheels: (payload) => ipcRenderer.invoke('transub-engine-install-local-wheels', payload || {}),
    onEngineDownloadProgress: (callback) => {
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on('transub-engine-download-progress', listener);
        return () => ipcRenderer.removeListener('transub-engine-download-progress', listener);
    },
    transubEngineGenerateSubtitles: (payload) => ipcRenderer.invoke('transub-engine-generate-subtitles', payload || {}),
    transubLiveBatchAppend: (payload) => ipcRenderer.invoke('transub-live-batch-append', payload || {}),
    transubLiveBatchSkip: (payload) => ipcRenderer.invoke('transub-live-batch-skip', payload || {}),
    transubLiveBatchUpdateOverrides: (payload) => ipcRenderer.invoke('transub-live-batch-update-overrides', payload || {}),
    transubEngineTranslateCues: (payload) => ipcRenderer.invoke('transub-engine-translate-cues', payload || {}),
    onEngineTranslateProgress: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const handler = (_event, progress) => callback(progress);
        ipcRenderer.on('transub-engine-translate-progress', handler);
        return () => ipcRenderer.removeListener('transub-engine-translate-progress', handler);
    },
    transubEngineCancel: () => ipcRenderer.invoke('transub-engine-cancel'),
    transubEngineResumeJob: (payload) => ipcRenderer.invoke('transub-engine-resume-job', payload || {}),
    transubEngineJobCheckpoint: (payload) => ipcRenderer.invoke('transub-engine-job-checkpoint', payload || {}),
    transubEngineExportDiagnostics: (payload) => ipcRenderer.invoke('transub-engine-export-diagnostics', payload || {}),
    transubEngineOpenLatestLog: () => ipcRenderer.invoke('transub-engine-open-latest-log'),
    transubEngineGetLogPath: () => ipcRenderer.invoke('transub-engine-get-log-path'),
    transubEngineSaveOptions: (payload) => ipcRenderer.invoke('transub-engine-save-options', payload || {}),
    transubGenerateSubtitles: (payload) => ipcRenderer.invoke('transub-generate-subtitles', payload || {}),
    transubComputeTaskStatus: () => ipcRenderer.invoke('transub-compute-task-status'),
    transubComputeTaskForceRelease: () => ipcRenderer.invoke('transub-compute-task-force-release'),
    transubComputeTaskCancel: () => ipcRenderer.invoke('transub-compute-task-cancel'),
    onTransubComputeTaskChanged: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const handler = (_event, payload) => callback(payload);
        ipcRenderer.on('transub-compute-task-changed', handler);
        return () => ipcRenderer.removeListener('transub-compute-task-changed', handler);
    },
    onTransubEngineProgress: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const handler = (_event, progress) => callback(progress);
        ipcRenderer.on('transub-engine-progress', handler);
        return () => ipcRenderer.removeListener('transub-engine-progress', handler);
    },
    onTransubEngineInferLog: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const handler = (_event, payload) => callback(payload);
        ipcRenderer.on('transub-engine-infer-log', handler);
        return () => ipcRenderer.removeListener('transub-engine-infer-log', handler);
    },
    transWithAiGetOptions: (payload) => ipcRenderer.invoke('transwithai-get-options', payload || {}),
    transubHasSettingsFile: () => ipcRenderer.invoke('transub-has-settings-file'),
    transubGetSystemResources: (payload) => ipcRenderer.invoke('transub-get-system-resources', payload || {}),
    transubGetUiZoom: () => ipcRenderer.invoke('transub-get-ui-zoom'),
    transubSetUiZoom: (payload) => ipcRenderer.invoke('transub-set-ui-zoom', payload || {}),
    transWithAiSaveOptions: (payload) => ipcRenderer.invoke('transwithai-save-options', payload || {}),
    transubTestProxy: (payload) => ipcRenderer.invoke('transub-test-proxy', payload || {}),
    transubTestHfEndpoint: (payload) => ipcRenderer.invoke('transub-test-hf-endpoint', payload || {}),
    transWithAiSetPostTask: (payload) => ipcRenderer.invoke('transwithai-set-post-task', payload || {}),
    transubBatchFinalize: (payload) => ipcRenderer.invoke('transub-batch-finalize', payload || {}),
    transWithAiGetPendingFiles: () => ipcRenderer.invoke('transwithai-get-pending-files'),
    transWithAiSelectVideos: (options) => ipcRenderer.invoke('transwithai-select-videos', options || {}),
    transWithAiScanFolder: (payload) => ipcRenderer.invoke('transwithai-scan-folder', payload || {}),
    transWithAiCheckSubtitles: (payload) => ipcRenderer.invoke('transwithai-check-subtitles', payload || {}),
    transWithAiGetPresets: () => ipcRenderer.invoke('transwithai-get-presets'),
    transWithAiSavePreset: (payload) => ipcRenderer.invoke('transwithai-save-preset', payload || {}),
    transWithAiDeletePreset: (payload) => ipcRenderer.invoke('transwithai-delete-preset', payload || {}),
    transWithAiExportPreset: (payload) => ipcRenderer.invoke('transwithai-export-preset', payload || {}),
    transWithAiImportPreset: () => ipcRenderer.invoke('transwithai-import-preset'),
    transWithAiGetTaskHistory: () => ipcRenderer.invoke('transwithai-get-task-history'),
    transWithAiClearTaskHistory: () => ipcRenderer.invoke('transwithai-clear-task-history'),
    transubLibraryStatus: () => ipcRenderer.invoke('transub-library-status'),
    transubLibraryList: (payload) => ipcRenderer.invoke('transub-library-list', payload || {}),
    transubLibraryGetMedia: (payload) => ipcRenderer.invoke('transub-library-get-media', payload || {}),
    transubLibrarySetActive: (payload) => ipcRenderer.invoke('transub-library-set-active', payload || {}),
    transubLibraryOpenVersion: (payload) => ipcRenderer.invoke('transub-library-open-version', payload || {}),
    transubLibraryPreviewVersion: (payload) => ipcRenderer.invoke('transub-library-preview-version', payload || {}),
    transubLibraryLoadVersionCues: (payload) => ipcRenderer.invoke('transub-library-load-version-cues', payload || {}),
    transubLibraryDiff: (payload) => ipcRenderer.invoke('transub-library-diff', payload || {}),
    transubLibrarySetStatus: (payload) => ipcRenderer.invoke('transub-library-set-status', payload || {}),
    transubLibraryDeleteVersion: (payload) => ipcRenderer.invoke('transub-library-delete-version', payload || {}),
    transubLibraryDeleteMedia: (payload) => ipcRenderer.invoke('transub-library-delete-media', payload || {}),
    transubLibrarySetNote: (payload) => ipcRenderer.invoke('transub-library-set-note', payload || {}),
    transubLibrarySetAbTag: (payload) => ipcRenderer.invoke('transub-library-set-ab-tag', payload || {}),
    transubLibraryPrepareMtTrain: (payload) => ipcRenderer.invoke('transub-library-prepare-mt-train', payload || {}),
    transubLibraryStartMtTrain: (payload) => ipcRenderer.invoke('transub-library-start-mt-train', payload || {}),
    transubLibraryExportPack: (payload) => ipcRenderer.invoke('transub-library-export-pack', payload || {}),
    transubLibraryExportTags: (payload) => ipcRenderer.invoke('transub-library-export-tags', payload || {}),
    transubLibraryExportCorpus: (payload) => ipcRenderer.invoke('transub-library-export-corpus', payload || {}),
    transubLibraryPrepareRerun: (payload) => ipcRenderer.invoke('transub-library-prepare-rerun', payload || {}),
    transubLibrarySetMediaPath: (payload) => ipcRenderer.invoke('transub-library-set-media-path', payload || {}),
    transubLibraryRenameMedia: (payload) => ipcRenderer.invoke('transub-library-rename-media', payload || {}),
    transubLibrarySuggestMedia: (payload) => ipcRenderer.invoke('transub-library-suggest-media', payload || {}),
    transubLibraryAutoLinkMedia: (payload) => ipcRenderer.invoke('transub-library-auto-link-media', payload || {}),
    transubLibraryAutoLinkMediaBatch: (payload) => ipcRenderer.invoke('transub-library-auto-link-media-batch', payload || {}),
    transubClearTranscriptCache: (payload) => ipcRenderer.invoke('transub-clear-transcript-cache', payload || {}),
    transubFindKeptTranscript: (payload) => ipcRenderer.invoke('transub-find-kept-transcript', payload || {}),
    transubPinKeptTranscript: (payload) => ipcRenderer.invoke('transub-pin-kept-transcript', payload || {}),
    transubGetEditorHistory: () => ipcRenderer.invoke('transub-get-editor-history'),
    transubAppendEditorHistory: (payload) => ipcRenderer.invoke('transub-append-editor-history', payload || {}),
    transubClearEditorHistory: () => ipcRenderer.invoke('transub-clear-editor-history'),
    transubFileExists: (payload) => ipcRenderer.invoke('transub-file-exists', payload || {}),
    transWithAiDetectGpu: () => ipcRenderer.invoke('transwithai-detect-gpu'),
    transWithAiSubtitlePreview: (payload) => ipcRenderer.invoke('transwithai-subtitle-preview', payload || {}),
    transubReadSubtitle: (payload) => ipcRenderer.invoke('transub-read-subtitle', payload || {}),
    transubWriteSubtitle: (payload) => ipcRenderer.invoke('transub-write-subtitle', payload || {}),
    transubExportSubtitle: (payload) => ipcRenderer.invoke('transub-export-subtitle', payload || {}),
    transubPickSaveSubtitle: (payload) => ipcRenderer.invoke('transub-pick-save-subtitle', payload || {}),
    transubListSystemFonts: () => ipcRenderer.invoke('transub-list-system-fonts'),
    transubDeleteSubtitleFiles: (payload) => ipcRenderer.invoke('transub-delete-subtitle-files', payload || {}),
    transubScanSubtitleQc: (payload) => ipcRenderer.invoke('transub-scan-subtitle-qc', payload || {}),
    transubApplySubtitlePostprocess: (payload) => ipcRenderer.invoke('transub-apply-subtitle-postprocess', payload || {}),
    transubQcSilenceSplit: (payload) => ipcRenderer.invoke('transub-qc-silence-split', payload || {}),
    transubCompactPureInterjections: (payload) => ipcRenderer.invoke('transub-compact-pure-interjections', payload || {}),
    transubMergeBilingualSubtitles: (payload) => ipcRenderer.invoke('transub-merge-bilingual-subtitles', payload || {}),
    transubRemoveNoisePair: (payload) => ipcRenderer.invoke('transub-remove-noise-pair', payload || {}),
    transWithAiListModels: (payload) => ipcRenderer.invoke('transwithai-list-models', payload || {}),
    transWithAiValidateModel: (payload) => ipcRenderer.invoke('transwithai-validate-model', payload || {}),
    transubCopySubtitleAs: (payload) => ipcRenderer.invoke('transub-copy-subtitle-as', payload || {}),
    transubTrialCompare: (payload) => ipcRenderer.invoke('transub-trial-compare', payload || {}),
    onTransubTrialCompareProgress: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const handler = (_event, progress) => callback(progress);
        ipcRenderer.on('transub-trial-compare-progress', handler);
        return () => ipcRenderer.removeListener('transub-trial-compare-progress', handler);
    },
    transubReadSubtitleDraft: (payload) => ipcRenderer.invoke('transub-read-subtitle-draft', payload || {}),
    transubWriteSubtitleDraft: (payload) => ipcRenderer.invoke('transub-write-subtitle-draft', payload || {}),
    transubClearSubtitleDraft: (payload) => ipcRenderer.invoke('transub-clear-subtitle-draft', payload || {}),
    transubCheckSubtitleDraft: (payload) => ipcRenderer.invoke('transub-check-subtitle-draft', payload || {}),
    transubReadSubtitleMeta: (payload) => ipcRenderer.invoke('transub-read-subtitle-meta', payload || {}),
    transubWriteSubtitleMeta: (payload) => ipcRenderer.invoke('transub-write-subtitle-meta', payload || {}),
    transubGetGlossary: (payload) => ipcRenderer.invoke('transub-get-glossary', payload || {}),
    transubSaveGlossary: (payload) => ipcRenderer.invoke('transub-save-glossary', payload || {}),
    transubExportGlossary: () => ipcRenderer.invoke('transub-export-glossary'),
    transubImportGlossary: () => ipcRenderer.invoke('transub-import-glossary'),
    transubGetTextPresets: () => ipcRenderer.invoke('transub-get-text-presets'),
    transubSaveTextPresets: (payload) => ipcRenderer.invoke('transub-save-text-presets', payload || {}),
    transubExportTextPresets: () => ipcRenderer.invoke('transub-export-text-presets'),
    transubImportTextPresets: () => ipcRenderer.invoke('transub-import-text-presets'),
    transubGetEditorWorkflows: () => ipcRenderer.invoke('transub-get-editor-workflows'),
    transubSaveEditorWorkflows: (payload) => ipcRenderer.invoke('transub-save-editor-workflows', payload || {}),
    transubExportEditorWorkflows: () => ipcRenderer.invoke('transub-export-editor-workflows'),
    transubImportEditorWorkflows: () => ipcRenderer.invoke('transub-import-editor-workflows'),
    transubTranscribeRange: (payload) => ipcRenderer.invoke('transub-transcribe-range', payload || {}),
    onTransubRetranscribeProgress: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const handler = (_event, progress) => callback(progress);
        ipcRenderer.on('transub-retranscribe-progress', handler);
        return () => ipcRenderer.removeListener('transub-retranscribe-progress', handler);
    },
    transubListSubtitleSidecars: (payload) => ipcRenderer.invoke('transub-list-subtitle-sidecars', payload || {}),
    transubSelectSubtitle: (options) => ipcRenderer.invoke('transub-select-subtitle', options || {}),
    transubSelectEditorVideo: (payload) => ipcRenderer.invoke('transub-select-editor-video', payload || {}),
    transubGuessVideoForSubtitle: (payload) => ipcRenderer.invoke('transub-guess-video-for-subtitle', payload || {}),
    transubOpenSubtitleEditor: (payload) => ipcRenderer.invoke('transub-open-subtitle-editor', payload || {}),
    transubEditorRegisterPath: (payload) => ipcRenderer.invoke('transub-editor-register-path', payload || {}),
    transubOpenSettings: (payload) => ipcRenderer.invoke('transub-open-settings', payload || {}),
    transubOpenSetupWizard: (payload) => ipcRenderer.invoke('transub-open-setup-wizard', payload || {}),
    transubOpenUpdateWindow: (payload) => ipcRenderer.invoke('transub-open-update-window', payload || {}),
    transubOpenAboutWindow: (payload) => ipcRenderer.invoke('transub-open-about-window', payload || {}),
    transubOpenSubtitleLibrary: (payload) => ipcRenderer.invoke('transub-open-subtitle-library', payload || {}),
    transubLibraryStartRetranslate: (payload) => ipcRenderer.invoke('transub-library-start-retranslate', payload || {}),
    onTransubLibraryStartRetranslate: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const handler = (_event, payload) => callback(payload);
        ipcRenderer.on('transub-library-start-retranslate', handler);
        return () => ipcRenderer.removeListener('transub-library-start-retranslate', handler);
    },
    onTransubLibraryFocusMedia: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const handler = (_event, payload) => callback(payload);
        ipcRenderer.on('transub-library-focus-media', handler);
        return () => ipcRenderer.removeListener('transub-library-focus-media', handler);
    },
    onTransubLibraryCatalogChanged: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const handler = (_event, payload) => callback(payload);
        ipcRenderer.on('transub-library-catalog-changed', handler);
        return () => ipcRenderer.removeListener('transub-library-catalog-changed', handler);
    },
    onTransubLibraryMediaUpdated: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const handler = (_event, payload) => callback(payload);
        ipcRenderer.on('transub-library-media-updated', handler);
        return () => ipcRenderer.removeListener('transub-library-media-updated', handler);
    },
    transubOpenMtTrain: (payload) => ipcRenderer.invoke('transub-open-mt-train', payload || {}),
    transubMtTrainAccess: () => ipcRenderer.invoke('transub-mt-train-access'),
    transubIsDevBuild: () => ipcRenderer.invoke('transub-is-dev-build'),
    transubUploadSubtitleCat: (payload) => ipcRenderer.invoke('transub-upload-subtitlecat', payload || {}),
    transubShowMainWindow: (payload) => ipcRenderer.invoke('transub-show-main-window', payload || {}),
    transubConsumePendingOpenParams: () => ipcRenderer.invoke('transub-consume-pending-open-params'),
    transubConsumePendingSetupWizard: () => ipcRenderer.invoke('transub-consume-pending-setup-wizard'),
    transubEditorRefocus: () => ipcRenderer.invoke('transub-editor-refocus'),
    transubEditorSyncMenuState: (payload) => ipcRenderer.invoke('transub-editor-sync-menu', payload || {}),
    transubEditorConfirm: (payload) => ipcRenderer.invoke('transub-editor-confirm', payload || {}),
    onOpenParams: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const handler = (_event, payload) => callback(payload);
        ipcRenderer.on('transub-open-params', handler);
        return () => ipcRenderer.removeListener('transub-open-params', handler);
    },
    onOpenSetupWizard: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const handler = (_event, payload) => callback(payload);
        ipcRenderer.on('transub-open-setup-wizard', handler);
        return () => ipcRenderer.removeListener('transub-open-setup-wizard', handler);
    },
    onUpdateWindowCheck: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const handler = () => callback();
        ipcRenderer.on('transub-update-window-check', handler);
        return () => ipcRenderer.removeListener('transub-update-window-check', handler);
    },
    onSettingsUpdated: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const handler = (_event, payload) => callback(payload);
        ipcRenderer.on('transub-settings-updated', handler);
        return () => ipcRenderer.removeListener('transub-settings-updated', handler);
    },
    getMediaUrl: (filePath) => {
        try {
            return buildMediaUrl(filePath);
        } catch (_) {
            return '';
        }
    },
    transubResolveMediaUrl: (payload) => ipcRenderer.invoke('transub-resolve-media-url', payload || {}),
    transWithAiOpenLatestLog: (payload) => ipcRenderer.invoke('transwithai-open-latest-log', payload || {}),
    transWithAiExportConfig: () => ipcRenderer.invoke('transwithai-export-config'),
    transWithAiImportConfig: () => ipcRenderer.invoke('transwithai-import-config'),
    transWithAiCheckAppUpdate: () => ipcRenderer.invoke('transwithai-check-app-update'),
    transubDownloadAppUpdate: (payload) => ipcRenderer.invoke('transub-download-app-update', payload || {}),
    transubQuitAndInstallUpdate: () => ipcRenderer.invoke('transub-quit-and-install-update'),
    transubOpenUpdatePage: (payload) => ipcRenderer.invoke('transub-open-update-page', payload || {}),
    onAppUpdateDownloadProgress: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const handler = (_event, progress) => callback(progress);
        ipcRenderer.on('transub-app-update-progress', handler);
        return () => ipcRenderer.removeListener('transub-app-update-progress', handler);
    },
    transubAdvancedGetStatus: () => ipcRenderer.invoke('transub-advanced-get-status'),
    transubAdvancedActivate: (payload) => ipcRenderer.invoke('transub-advanced-activate', payload || {}),
    transubAdvancedTransfer: (payload) => ipcRenderer.invoke('transub-advanced-transfer', payload || {}),
    transubAdvancedRedeemAfdian: (payload) => ipcRenderer.invoke('transub-advanced-redeem-afdian', payload || {}),
    transubAdvancedRevalidate: () => ipcRenderer.invoke('transub-advanced-revalidate'),
    transubAdvancedDeactivate: () => ipcRenderer.invoke('transub-advanced-deactivate'),
    transubAdvancedSaveByok: (payload) => ipcRenderer.invoke('transub-advanced-save-byok', payload || {}),
    transubAdvancedClearByokKey: () => ipcRenderer.invoke('transub-advanced-clear-byok-key'),
    transubAdvancedManagedLlmStatus: () => ipcRenderer.invoke('transub-advanced-managed-llm-status'),
    transubAdvancedManagedLlmSelect: (payload) => ipcRenderer.invoke('transub-advanced-managed-llm-select', payload || {}),
    transubAdvancedManagedLlmOpenPick: (payload) => ipcRenderer.invoke('transub-advanced-managed-llm-open-pick', payload || {}),
    transubAdvancedManagedLlmOpenDownload: (payload) => ipcRenderer.invoke('transub-advanced-managed-llm-open-download', payload || {}),
    transubAdvancedManagedLlmDownloadInfo: (payload) => ipcRenderer.invoke('transub-advanced-managed-llm-download-info', payload || {}),
    transubAdvancedManagedLlmOpenManual: (payload) => ipcRenderer.invoke('transub-advanced-managed-llm-open-manual', payload || {}),
    transubAdvancedManagedLlmOpenFolder: (payload) => ipcRenderer.invoke('transub-advanced-managed-llm-open-folder', payload || {}),
    transubAdvancedManagedLlmVerifyManual: (payload) => ipcRenderer.invoke('transub-advanced-managed-llm-verify-manual', payload || {}),
    transubAdvancedManagedLlmPull: (payload) => ipcRenderer.invoke('transub-advanced-managed-llm-pull', payload || {}),
    transubAdvancedManagedLlmInstallRuntime: (payload) => ipcRenderer.invoke('transub-advanced-managed-llm-install-runtime', payload || {}),
    transubAdvancedManagedLlmSetRuntime: (payload) => ipcRenderer.invoke('transub-advanced-managed-llm-set-runtime', payload || {}),
    transubAdvancedManagedLlmImportRuntime: (payload) => ipcRenderer.invoke('transub-advanced-managed-llm-import-runtime', payload || {}),
    transubAdvancedManagedLlmCancelPull: () => ipcRenderer.invoke('transub-advanced-managed-llm-cancel-pull'),
    transubAdvancedManagedLlmStopServer: () => ipcRenderer.invoke('transub-advanced-managed-llm-stop-server'),
    transubAdvancedManagedLlmPerfTest: (payload) => ipcRenderer.invoke('transub-advanced-managed-llm-perf-test', payload || {}),
    transubAdvancedOpenOllamaDownload: () => ipcRenderer.invoke('transub-advanced-open-ollama-download'),
    onAdvancedManagedLlmProgress: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on('transub-advanced-managed-llm-progress', listener);
        return () => ipcRenderer.removeListener('transub-advanced-managed-llm-progress', listener);
    },
    onAdvancedLlmPickRefresh: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on('transub-advanced-llm-pick-refresh', listener);
        return () => ipcRenderer.removeListener('transub-advanced-llm-pick-refresh', listener);
    },
    onAdvancedLlmModelChanged: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on('transub-advanced-llm-model-changed', listener);
        return () => ipcRenderer.removeListener('transub-advanced-llm-model-changed', listener);
    },
    transubAdvancedRequireFeature: (payload) => ipcRenderer.invoke('transub-advanced-require-feature', payload || {}),
    transubAdvancedQcSmartFix: (payload) => ipcRenderer.invoke('transub-advanced-qc-smart-fix', payload || {}),
    transubAdvancedQcLlmSplit: (payload) => ipcRenderer.invoke('transub-advanced-qc-llm-split', payload || {}),
    transubAdvancedContextReconstruct: (payload) => ipcRenderer.invoke('transub-advanced-context-reconstruct', payload || {}),
    transubAdvancedFilmContextReconstruct: (payload) => ipcRenderer.invoke('transub-advanced-film-context-reconstruct', payload || {}),
    transubAdvancedSmartTranslate: (payload) => ipcRenderer.invoke('transub-advanced-smart-translate', payload || {}),
    transubAdvancedBilingualSemanticReview: (payload) => ipcRenderer.invoke('transub-advanced-bilingual-semantic-review', payload || {}),
    transubAdvancedBatchContextReconstruct: (payload) => ipcRenderer.invoke('transub-advanced-batch-context-reconstruct', payload || {}),
    transubAdvancedCancelBatchContextReconstruct: () => ipcRenderer.invoke('transub-advanced-cancel-batch-context-reconstruct'),
    transubAdvancedCancelContextReconstruct: () => ipcRenderer.invoke('transub-advanced-cancel-context-reconstruct'),
    transubSakuraStatus: (payload) => ipcRenderer.invoke('transub-sakura-status', payload || {}),
    transubSakuraTranslate: (payload) => ipcRenderer.invoke('transub-sakura-translate', payload || {}),
    transubSakuraCancelTranslate: () => ipcRenderer.invoke('transub-sakura-cancel-translate'),
    onSakuraTranslateProgress: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const handler = (_event, progress) => callback(progress);
        ipcRenderer.on('transub-sakura-translate-progress', handler);
        return () => ipcRenderer.removeListener('transub-sakura-translate-progress', handler);
    },
    onAdvancedBatchProgress: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const handler = (_event, progress) => callback(progress);
        ipcRenderer.on('transub-advanced-batch-progress', handler);
        return () => ipcRenderer.removeListener('transub-advanced-batch-progress', handler);
    },
    onAdvancedReconstructProgress: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const handler = (_event, progress) => callback(progress);
        ipcRenderer.on('transub-advanced-reconstruct-progress', handler);
        return () => ipcRenderer.removeListener('transub-advanced-reconstruct-progress', handler);
    },
    transubAdvancedTestByok: (payload) => ipcRenderer.invoke('transub-advanced-test-byok', payload || {}),
    transubAdvancedReloadModule: () => ipcRenderer.invoke('transub-advanced-reload-module'),
    transubTdpGetStatus: () => ipcRenderer.invoke('transub-tdp-get-status'),
    transubTdpCheck: () => ipcRenderer.invoke('transub-tdp-check'),
    transubTdpPull: () => ipcRenderer.invoke('transub-tdp-pull'),
    transubTdpCancelPull: () => ipcRenderer.invoke('transub-tdp-cancel-pull'),
    transubTdpSync: () => ipcRenderer.invoke('transub-tdp-sync'),
    onTdpProgress: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const handler = (_event, progress) => callback(progress);
        ipcRenderer.on('transub-tdp-progress', handler);
        return () => ipcRenderer.removeListener('transub-tdp-progress', handler);
    },
    transWithAiCancel: () => ipcRenderer.invoke('transwithai-cancel'),
    onTransWithAiProgress: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const handler = (_event, progress) => callback(progress);
        ipcRenderer.on('transwithai-progress', handler);
        return () => ipcRenderer.removeListener('transwithai-progress', handler);
    },
    onTransWithAiInferLog: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const handler = (_event, payload) => callback(payload);
        ipcRenderer.on('transwithai-infer-log', handler);
        return () => ipcRenderer.removeListener('transwithai-infer-log', handler);
    },
    onSubtitleTaskJobStart: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const handler = (_event, payload) => callback(payload);
        ipcRenderer.on('subtitle-task-job-start', handler);
        return () => ipcRenderer.removeListener('subtitle-task-job-start', handler);
    },
    onSubtitleEditorInit: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const handler = (_event, payload) => callback(payload);
        ipcRenderer.on('subtitle-editor-init', handler);
        return () => ipcRenderer.removeListener('subtitle-editor-init', handler);
    },
    onSubtitleEditorMenuAction: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const handler = (_event, payload) => callback(payload);
        ipcRenderer.on('subtitle-editor-menu-action', handler);
        return () => ipcRenderer.removeListener('subtitle-editor-menu-action', handler);
    },
    onSubtitleEditorRefocus: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const handler = () => callback();
        ipcRenderer.on('subtitle-editor-refocus', handler);
        return () => ipcRenderer.removeListener('subtitle-editor-refocus', handler);
    },
    onSubtitleTaskJobFinished: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const handler = (_event, payload) => callback(payload);
        ipcRenderer.on('subtitle-task-job-finished', handler);
        return () => ipcRenderer.removeListener('subtitle-task-job-finished', handler);
    },
});
