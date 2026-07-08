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
    transubListSubtitleSidecars: (payload) => ipcRenderer.invoke('transub-list-subtitle-sidecars', payload || {}),
    transubSelectSubtitle: (options) => ipcRenderer.invoke('transub-select-subtitle', options || {}),
    transubSelectEditorVideo: (payload) => ipcRenderer.invoke('transub-select-editor-video', payload || {}),
    transubGuessVideoForSubtitle: (payload) => ipcRenderer.invoke('transub-guess-video-for-subtitle', payload || {}),
    transubOpenSubtitleEditor: (payload) => ipcRenderer.invoke('transub-open-subtitle-editor', payload || {}),
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
    onSubtitleTaskJobFinished: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const handler = (_event, payload) => callback(payload);
        ipcRenderer.on('subtitle-task-job-finished', handler);
        return () => ipcRenderer.removeListener('subtitle-task-job-finished', handler);
    },
});
