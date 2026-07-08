const { app, ipcMain } = require('electron');
const { getAppRoot } = require('./app-paths');
const { createDeferredBridgeSetup } = require('./bridge-registry');
const { setupTransWithAiBridge, setPendingFilesForWindow } = require('./transwithai-bridge');
const { setupExtensionsBridge } = require('./extensions-bridge');
const { createWindowManager } = require('./window-manager');
const { registerSubtitleEditorWindowRoutes } = require('./subtitle-editor-window');
const { registerMediaScheme, registerMediaProtocolHandler } = require('./media-protocol');
const { getAppIcon } = require('./icons');

registerMediaScheme();

// Avoid "Unable to move the cache / Gpu Cache Creation failed" on Windows when
// Chromium rotates shader cache directories under a locked userData folder.
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
    return;
}

app.setName('Transub');
if (process.platform === 'win32') {
    app.setAppUserModelId('Transub');
}

function getUserDataPath() {
    return app.getPath('userData');
}

function parseCliFiles() {
    const files = [];
    for (const arg of process.argv.slice(1)) {
        if (arg.startsWith('--files=')) {
            const raw = arg.slice('--files='.length);
            raw.split('|').forEach((p) => {
                const trimmed = String(p || '').trim();
                if (trimmed) files.push(trimmed);
            });
        }
    }
    return files;
}

const deferredBridges = createDeferredBridgeSetup(ipcMain);
const windowManager = createWindowManager({
    getAppRoot: () => getAppRoot(app),
    getUserDataPath,
});

deferredBridges.installLazyRoutes({
    'electron-select-folder': 'transwithai',
    'transwithai-validate': 'transwithai',
    'transwithai-generate-subtitles': 'transwithai',
    'transwithai-cancel': 'transwithai',
    'transwithai-get-options': 'transwithai',
    'transwithai-save-options': 'transwithai',
    'transwithai-set-post-task': 'transwithai',
    'transwithai-get-pending-files': 'transwithai',
    'transwithai-select-videos': 'transwithai',
    'transwithai-show-in-folder': 'transwithai',
    'transwithai-open-external': 'transwithai',
    'ffmpeg-probe': 'extensions',
    'ffmpeg-validate': 'extensions',
    'electron-select-ffmpeg': 'extensions',
    'transwithai-scan-folder': 'extensions',
    'transwithai-check-subtitles': 'extensions',
    'transwithai-get-presets': 'extensions',
    'transwithai-save-preset': 'extensions',
    'transwithai-delete-preset': 'extensions',
    'transwithai-get-task-history': 'extensions',
    'transwithai-detect-gpu': 'extensions',
    'transwithai-subtitle-preview': 'extensions',
    'transub-read-subtitle': 'extensions',
    'transub-write-subtitle': 'extensions',
    'transub-list-subtitle-sidecars': 'extensions',
    'transub-select-subtitle': 'extensions',
    'transub-select-editor-video': 'extensions',
    'transub-guess-video-for-subtitle': 'extensions',
    'transub-resolve-media-url': 'extensions',
    'transub-open-subtitle-editor': 'editorWindow',
    'transwithai-open-latest-log': 'extensions',
    'transwithai-export-config': 'extensions',
    'transwithai-import-config': 'extensions',
    'transwithai-check-app-update': 'extensions',
    'transwithai-open-path': 'extensions',
});

deferredBridges.defer('extensions', (api) => {
    setupExtensionsBridge(api, {
        getAppRoot: () => getAppRoot(app),
    });
});

deferredBridges.defer('editorWindow', (api) => {
    registerSubtitleEditorWindowRoutes(api.register, app);
});

deferredBridges.defer('transwithai', (api) => {
    setupTransWithAiBridge(api, {
        getUserDataPath,
        getAppRoot: () => getAppRoot(app),
        windowManager,
    });
});

app.on('second-instance', (_event, commandLine) => {
    const cliFiles = [];
    for (const arg of commandLine.slice(1)) {
        if (arg.startsWith('--files=')) {
            const raw = arg.slice('--files='.length);
            raw.split('|').forEach((p) => {
                const trimmed = String(p || '').trim();
                if (trimmed) cliFiles.push(trimmed);
            });
        }
    }
    if (cliFiles.length) setPendingFilesForWindow(cliFiles);
    windowManager.showMainWindow();
});

app.whenReady().then(() => {
    registerMediaProtocolHandler();
    try {
        deferredBridges.ensure('editorWindow');
    } catch (err) {
        console.warn('[main] editorWindow bridge init failed:', err.message || err);
    }

    const appIcon = getAppIcon();
    if (!appIcon.isEmpty() && process.platform === 'darwin' && app.dock) {
        app.dock.setIcon(appIcon);
    }

    const cliFiles = parseCliFiles();
    if (cliFiles.length) setPendingFilesForWindow(cliFiles);

    windowManager.createMainWindow();
    windowManager.setupTray();

    app.on('activate', () => {
        windowManager.showMainWindow();
    });
});

app.on('window-all-closed', () => {
    if (windowManager.isQuitting()) return;
    if (process.platform !== 'darwin') {
        windowManager.quitApp();
    }
});

app.on('before-quit', () => {
    windowManager.setQuitting(true);
    try {
        const { closeAllSubtitleEditorWindows } = require('./subtitle-editor-window');
        closeAllSubtitleEditorWindows();
    } catch { /* ignore */ }
    try {
        const { stopSubtitleJobs } = require('./transwithai-bridge');
        stopSubtitleJobs();
    } catch { /* ignore */ }
});

module.exports = {
    getUserDataPath,
    windowManager,
};
