const { app, ipcMain } = require('electron');
const { getAppRoot, migrateLegacyUserDataFiles } = require('./app-paths');
const { createDeferredBridgeSetup } = require('./bridge-registry');
const { createWindowManager } = require('./window-manager');
const { registerMediaScheme, registerMediaProtocolHandler } = require('./media-protocol');
const { isEditableSubtitleFile } = require('./subtitle-utils');
const { loadSettings } = require('./settings-data');
registerMediaScheme();

/** @type {string[]} */
let earlyPendingFiles = [];
let transwithaiBridgeLoaded = false;

function setPendingFilesForWindow(files) {
    const list = Array.isArray(files) ? files.filter(Boolean) : [];
    earlyPendingFiles = list;
    // Avoid eager-loading the heavy bridge just to stash CLI paths
    if (transwithaiBridgeLoaded) {
        require('./transwithai-bridge').setPendingFilesForWindow(list);
        earlyPendingFiles = [];
    }
}

// Avoid "Unable to move the cache / Gpu Cache Creation failed" on Windows when
// Chromium rotates shader cache directories under a locked userData folder.
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

// Prefer OS / GPU hardware video decode (H.264, HEVC on Windows 10+).
if (process.platform === 'win32') {
    app.commandLine.appendSwitch(
        'enable-features',
        'PlatformHEVCDecoderSupport,D3D11VideoDecoder,UseMediaFoundationForMediaPlayback',
    );
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
    return;
}

app.setName('Transub');
if (process.platform === 'win32') {
    // Must match package.json build.appId so Windows taskbar/shortcuts use Transub icon
    app.setAppUserModelId('com.transub.app');
}

function getUserDataPath() {
    return app.getPath('userData');
}

function parseCliFiles(argv = process.argv.slice(1)) {
    const files = [];
    for (const arg of argv) {
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

function parseCliEditSubtitle(argv = process.argv.slice(1)) {
    let subPath = '';
    let videoPath = '';
    for (const arg of argv) {
        if (arg.startsWith('--edit-sub=')) {
            subPath = String(arg.slice('--edit-sub='.length) || '').trim();
        } else if (arg.startsWith('--edit-video=')) {
            videoPath = String(arg.slice('--edit-video='.length) || '').trim();
        }
    }
    if (!subPath) {
        for (const arg of argv) {
            if (arg.startsWith('-')) continue;
            const trimmed = String(arg || '').trim();
            if (trimmed && isEditableSubtitleFile(trimmed)) {
                subPath = trimmed;
                break;
            }
        }
    }
    return subPath ? { subPath, videoPath } : null;
}

function isEditorOnlyArgv(argv = process.argv.slice(1)) {
    if (argv.some((arg) => arg === '--subtitle-editor-only' || arg === '--editor-only')) {
        return true;
    }
    return Boolean(parseCliEditSubtitle(argv));
}

let editorOnlyMode = isEditorOnlyArgv(process.argv.slice(1));

function warmEditorBridges() {
    try {
        deferredBridges.ensure('editorWindow');
    } catch (err) {
        console.warn('[main] editorWindow bridge init failed:', err.message || err);
    }
    // 预热字幕读/写与媒体探测桥，避免首开文档时冷加载造成长时间无反馈
    try {
        deferredBridges.ensure('extensions');
    } catch (err) {
        console.warn('[main] extensions bridge init failed:', err.message || err);
    }
}

function openCliSubtitleEditor(editRequest) {
    if (!editRequest?.subPath) return;
    warmEditorBridges();
    const { createSubtitleEditorWindow } = require('./subtitle-editor-window');
    createSubtitleEditorWindow(app, editRequest);
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
    'transub-transcribe-range': 'transwithai',
    'transwithai-get-options': 'transwithai',
    'transub-read-subtitle-meta': 'extensions',
    'transub-write-subtitle-meta': 'extensions',
    'transub-get-glossary': 'extensions',
    'transub-save-glossary': 'extensions',
    'transub-export-glossary': 'extensions',
    'transub-import-glossary': 'extensions',
    'transwithai-save-options': 'transwithai',
    'transwithai-set-post-task': 'transwithai',
    'transwithai-get-pending-files': 'transwithai',
    'transwithai-select-videos': 'transwithai',
    'transwithai-show-in-folder': 'transwithai',
    'transwithai-open-external': 'transwithai',
    'ffmpeg-probe': 'extensions',
    'ffmpeg-validate': 'extensions',
    'ffmpeg-detect-silence': 'extensions',
    'ffmpeg-cancel': 'extensions',
    'ffmpeg-extract-waveform': 'extensions',
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
    'transub-scan-subtitle-qc': 'extensions',
    'transub-read-subtitle-draft': 'extensions',
    'transub-write-subtitle-draft': 'extensions',
    'transub-clear-subtitle-draft': 'extensions',
    'transub-check-subtitle-draft': 'extensions',
    'transub-list-subtitle-sidecars': 'extensions',
    'transub-select-subtitle': 'extensions',
    'transub-select-editor-video': 'extensions',
    'transub-guess-video-for-subtitle': 'extensions',
    'transub-resolve-media-url': 'extensions',
    'transub-open-subtitle-editor': 'editorWindow',
    'transub-open-settings': 'editorWindow',
    'transub-consume-pending-open-params': 'editorWindow',
    'transub-editor-refocus': 'editorWindow',
    'transub-editor-confirm': 'editorWindow',
    'transwithai-open-latest-log': 'extensions',
    'transwithai-export-config': 'extensions',
    'transwithai-import-config': 'extensions',
    'transwithai-check-app-update': 'extensions',
    'transub-download-app-update': 'extensions',
    'transub-quit-and-install-update': 'extensions',
    'transub-open-update-page': 'extensions',
    'transwithai-open-path': 'extensions',
});

deferredBridges.defer('extensions', (api) => {
    const { setupExtensionsBridge } = require('./extensions-bridge');
    setupExtensionsBridge(api, {
        getAppRoot: () => getAppRoot(app),
    });
});

deferredBridges.defer('editorWindow', (api) => {
    const { registerSubtitleEditorWindowRoutes } = require('./subtitle-editor-window');
    registerSubtitleEditorWindowRoutes(api.register, app, {
        warmBridges: warmEditorBridges,
        windowManager,
    });
});

deferredBridges.defer('transwithai', (api) => {
    const {
        setupTransWithAiBridge,
        setPendingFilesForWindow: applyPendingFiles,
    } = require('./transwithai-bridge');
    if (earlyPendingFiles.length) {
        applyPendingFiles(earlyPendingFiles);
        earlyPendingFiles = [];
    }
    transwithaiBridgeLoaded = true;
    setupTransWithAiBridge(api, {
        getUserDataPath,
        getAppRoot: () => getAppRoot(app),
        windowManager,
    });
});

app.on('second-instance', (_event, commandLine) => {
    const cliArgs = commandLine.slice(1);
    const cliEdit = parseCliEditSubtitle(cliArgs);
    if (cliEdit) {
        openCliSubtitleEditor(cliEdit);
        return;
    }

    const cliFiles = parseCliFiles(cliArgs);
    if (cliFiles.length) setPendingFilesForWindow(cliFiles);

    if (editorOnlyMode) {
        editorOnlyMode = false;
        windowManager.createMainWindow();
        windowManager.setupTray();
        return;
    }

    windowManager.showMainWindow();
});

app.whenReady().then(() => {
    registerMediaProtocolHandler();
    try {
        migrateLegacyUserDataFiles();
        // Touch settings early so install-dir → userData migration runs before bridges.
        loadSettings(() => getAppRoot(app));
    } catch (err) {
        console.warn('[main] user data migration failed:', err.message || err);
    }
    const cliEdit = parseCliEditSubtitle();
    const cliFiles = parseCliFiles();
    if (cliFiles.length) setPendingFilesForWindow(cliFiles);

    if (editorOnlyMode) {
        warmEditorBridges();
        if (cliEdit) {
            openCliSubtitleEditor(cliEdit);
        } else {
            const { openSubtitleEditorOrPick } = require('./subtitle-editor-window');
            openSubtitleEditorOrPick(app);
        }
    } else if (cliEdit) {
        openCliSubtitleEditor(cliEdit);
        windowManager.createMainWindow({ startMinimizedToTray: true });
    } else {
        // Main window path: bridges load on first IPC (getOptions / validates)
        windowManager.createMainWindow();
    }
});

app.on('window-all-closed', () => {
    if (windowManager.isQuitting()) return;
    // Windows-only app: always quit when all windows close
    windowManager.quitApp();
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
