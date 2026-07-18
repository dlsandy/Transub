const { contextBridge, ipcRenderer, webUtils } = require('electron');

function buildMediaUrl(filePath) {
    const p = String(filePath || '').trim();
    if (!p) return '';
    return `transub-media://video?path=${encodeURIComponent(p)}`;
}

contextBridge.exposeInMainWorld('__ELECTRON__', {
    isDesktop: true,
    platform: process.platform,
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
    ffmpegValidate: (payload) => ipcRenderer.invoke('ffmpeg-validate', payload || {}),
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
    transWithAiGenerateSubtitles: (payload) => ipcRenderer.invoke('transwithai-generate-subtitles', payload || {}),
    transWithAiGetOptions: (payload) => ipcRenderer.invoke('transwithai-get-options', payload || {}),
    transWithAiSaveOptions: (payload) => ipcRenderer.invoke('transwithai-save-options', payload || {}),
    transWithAiSetPostTask: (payload) => ipcRenderer.invoke('transwithai-set-post-task', payload || {}),
    transWithAiGetPendingFiles: () => ipcRenderer.invoke('transwithai-get-pending-files'),
    transWithAiSelectVideos: (options) => ipcRenderer.invoke('transwithai-select-videos', options || {}),
    transWithAiScanFolder: (payload) => ipcRenderer.invoke('transwithai-scan-folder', payload || {}),
    transWithAiCheckSubtitles: (payload) => ipcRenderer.invoke('transwithai-check-subtitles', payload || {}),
    transWithAiGetPresets: () => ipcRenderer.invoke('transwithai-get-presets'),
    transWithAiSavePreset: (payload) => ipcRenderer.invoke('transwithai-save-preset', payload || {}),
    transWithAiDeletePreset: (payload) => ipcRenderer.invoke('transwithai-delete-preset', payload || {}),
    transWithAiGetTaskHistory: () => ipcRenderer.invoke('transwithai-get-task-history'),
    transWithAiDetectGpu: () => ipcRenderer.invoke('transwithai-detect-gpu'),
    transWithAiSubtitlePreview: (payload) => ipcRenderer.invoke('transwithai-subtitle-preview', payload || {}),
    transubReadSubtitle: (payload) => ipcRenderer.invoke('transub-read-subtitle', payload || {}),
    transubWriteSubtitle: (payload) => ipcRenderer.invoke('transub-write-subtitle', payload || {}),
    transubScanSubtitleQc: (payload) => ipcRenderer.invoke('transub-scan-subtitle-qc', payload || {}),
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
    transubOpenSettings: (payload) => ipcRenderer.invoke('transub-open-settings', payload || {}),
    transubConsumePendingOpenParams: () => ipcRenderer.invoke('transub-consume-pending-open-params'),
    transubEditorRefocus: () => ipcRenderer.invoke('transub-editor-refocus'),
    transubEditorConfirm: (payload) => ipcRenderer.invoke('transub-editor-confirm', payload || {}),
    onOpenParams: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const handler = (_event, payload) => callback(payload);
        ipcRenderer.on('transub-open-params', handler);
        return () => ipcRenderer.removeListener('transub-open-params', handler);
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
    transubDownloadAppUpdate: () => ipcRenderer.invoke('transub-download-app-update'),
    transubQuitAndInstallUpdate: () => ipcRenderer.invoke('transub-quit-and-install-update'),
    transubOpenUpdatePage: (payload) => ipcRenderer.invoke('transub-open-update-page', payload || {}),
    onAppUpdateDownloadProgress: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const handler = (_event, progress) => callback(progress);
        ipcRenderer.on('transub-app-update-progress', handler);
        return () => ipcRenderer.removeListener('transub-app-update-progress', handler);
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
