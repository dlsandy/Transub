'use strict';

/**
 * Minimal preload for the Sanitize 训练台 window (dev-only).
 * Does not expose general file/settings APIs.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('transubTrain', {
    isElectron: true,
    getAdvancedStatus: () => ipcRenderer.invoke('transub-advanced-get-status'),
    getManagedLlmStatus: () => ipcRenderer.invoke('transub-advanced-managed-llm-status'),
    smartTranslate: (payload) => ipcRenderer.invoke('transub-advanced-smart-translate', payload || {}),
    inferSuggest: (payload) => ipcRenderer.invoke('transub-mt-train-infer-suggest', payload || {}),
    listHistoryPairs: (payload) => ipcRenderer.invoke('transub-mt-train-list-history-pairs', payload || {}),
    loadHistoryPair: (payload) => ipcRenderer.invoke('transub-mt-train-load-history-pair', payload || {}),
    loadHistoryPairs: (payload) => ipcRenderer.invoke('transub-mt-train-load-history-pairs', payload || {}),
});
