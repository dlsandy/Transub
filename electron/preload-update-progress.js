const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('__UPDATE_PROGRESS__', {
    getStatus: () => ipcRenderer.invoke('transub-zip-update-progress-get'),
    onStatus: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const handler = (_event, payload) => {
            try { callback(payload); } catch { /* ignore */ }
        };
        ipcRenderer.on('transub-zip-update-status', handler);
        return () => ipcRenderer.removeListener('transub-zip-update-status', handler);
    },
});
