const { app, ipcMain } = require('electron');
const path = require('path');
const { getAppRoot, getWritableRoot, migrateLegacyUserDataFiles } = require('./app-paths');
const { createDeferredBridgeSetup } = require('./bridge-registry');
const { createWindowManager } = require('./window-manager');
const { registerMediaScheme, registerMediaProtocolHandler } = require('./media-protocol');
const { isEditableSubtitleFile } = require('./subtitle-utils');
const { loadSettings, hasSettingsFile } = require('./settings-data');
const {
    mergeTransWithAiOptions,
    stripPostTaskFields,
} = require('./transwithai-options');

// Zip-update progress UI (must run before single-instance lock / normal boot).
const {
    parseZipUpdateProgressArg,
    runZipUpdateProgressUi,
} = require('./zip-update-progress-window');
const zipUpdateProgressPath = parseZipUpdateProgressArg();
if (zipUpdateProgressPath) {
    runZipUpdateProgressUi(app, zipUpdateProgressPath);
    return;
}

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

// Avoid "Unable to move the cache / Reverse Cache Creation failed" on Windows when
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

/** Writable app data (settings / TWAI config cache) — software directory, not AppData. */
function getUserDataPath() {
    return getWritableRoot();
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

function resolveStartupWindowPref(options = {}) {
    const raw = String(options?.startupWindow || '').trim().toLowerCase();
    return (raw === 'editor' || raw === 'subtitle-editor') ? 'editor' : 'generator';
}

let editorOnlyMode = isEditorOnlyArgv(process.argv.slice(1));

function warmEditorBridges() {
    try {
        deferredBridges.ensure('editorWindow');
    } catch (err) {
        console.warn('[main] editorWindow bridge init failed:', err.message || err);
    }
}

/** Heavy bridges: schedule after first paint so editor window can show sooner. */
function warmEditorHeavyBridges() {
    try {
        deferredBridges.ensure('extensions');
    } catch (err) {
        console.warn('[main] extensions bridge init failed:', err.message || err);
    }
    try {
        deferredBridges.ensure('transwithai');
    } catch (err) {
        console.warn('[main] transwithai bridge init failed:', err.message || err);
    }
}

function scheduleWarmEditorHeavyBridges() {
    setTimeout(() => {
        try {
            warmEditorHeavyBridges();
        } catch (_) { /* ignore */ }
    }, 0);
}

function openCliSubtitleEditor(editRequest) {
    if (!editRequest?.subPath) return;
    warmEditorBridges();
    scheduleWarmEditorHeavyBridges();
    const { createSubtitleEditorWindow } = require('./subtitle-editor-window');
    createSubtitleEditorWindow(app, editRequest);
}

const deferredBridges = createDeferredBridgeSetup(ipcMain);
const windowManager = createWindowManager({
    getAppRoot: () => getAppRoot(app),
    getUserDataPath,
});

const appTheme = require('./app-theme');
appTheme.linkSuppressMinimizeToTray((ms) => {
    try { windowManager.beginSuppressMinimizeToTray?.(ms); } catch (_) { /* ignore */ }
});
appTheme.registerAppThemeIpc(ipcMain);

// Cold-start IPC: answer without loading heavy bridges (extensions / full transwithai).
ipcMain.handle('transub-get-app-version', async () => {
    try {
        let version = '';
        try {
            version = String(app.getVersion() || '').trim();
        } catch { /* fall through */ }
        if (!version) {
            version = String(require(path.join(__dirname, '..', 'package.json')).version || '');
        }
        return { ok: true, version };
    } catch (err) {
        return { ok: false, error: err.message || String(err), version: '' };
    }
});

ipcMain.handle('transwithai-get-options', async (_event, payload = {}) => {
    try {
        const options = mergeTransWithAiOptions({
            ...stripPostTaskFields(loadSettings(() => getAppRoot(app)).options || {}),
            ...stripPostTaskFields(payload || {}),
        });
        return { ok: true, options };
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    }
});

ipcMain.handle('transub-has-settings-file', async () => {
    try {
        return { ok: true, exists: !!hasSettingsFile(() => getAppRoot(app)) };
    } catch (err) {
        return { ok: false, exists: false, error: err.message || String(err) };
    }
});

ipcMain.handle('transub-get-system-resources', async (_event, payload = {}) => {
    try {
        const { sampleSystemResources } = require('./system-resources');
        const includeGpu = payload?.includeGpu !== false;
        return await sampleSystemResources({ includeGpu });
    } catch (err) {
        return { ok: false, error: err.message || String(err), text: '' };
    }
});

ipcMain.handle('transub-get-ui-zoom', async () => {
    try {
        const { getUiZoomPref, resolveZoomFactor, loadUiZoomPref } = require('./ui-zoom');
        const { screen } = require('electron');
        const pref = getUiZoomPref();
        let factor = 1;
        try {
            const display = screen.getPrimaryDisplay();
            factor = resolveZoomFactor(loadUiZoomPref(), display);
        } catch { /* ignore */ }
        return { ok: true, uiZoom: pref, factor };
    } catch (err) {
        return { ok: false, error: err.message || String(err), uiZoom: 'auto', factor: 1 };
    }
});

ipcMain.handle('transub-set-ui-zoom', async (_event, payload = {}) => {
    try {
        const { setUiZoomPref, resolveZoomFactor } = require('./ui-zoom');
        const { screen } = require('electron');
        const pref = setUiZoomPref(payload?.uiZoom);
        let factor = 1;
        try {
            factor = resolveZoomFactor(pref, screen.getPrimaryDisplay());
        } catch { /* ignore */ }
        return { ok: true, uiZoom: pref, factor };
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    }
});

deferredBridges.installLazyRoutes({
    'electron-select-folder': 'transwithai',
    'transwithai-validate': 'transwithai',
    'transwithai-check-engine-update': 'transwithai',
    'transwithai-generate-subtitles': 'transwithai',
    'transwithai-cancel': 'transwithai',
    'transub-engine-validate': 'engine',
    'transub-engine-bundled-path': 'engine',
    'transub-engine-list-models': 'engine',
    'transub-engine-recommend': 'engine',
    'transub-engine-detect-language': 'engine',
    'transub-engine-download-models': 'engine',
    'transub-engine-gpu-status': 'engine',
    'transub-engine-asr-whisper-status': 'engine',
    'transub-engine-ensure-gpu': 'engine',
    'transub-engine-audio-separate-status': 'engine',
    'transub-engine-open-download': 'engine',
    'transub-engine-run-download': 'engine',
    'transub-engine-cancel-download': 'engine',
    'transub-engine-download-info': 'engine',
    'transub-engine-open-manual-url': 'engine',
    'transub-engine-open-download-folder': 'engine',
    'transub-engine-pick-whl': 'engine',
    'transub-engine-install-local-wheels': 'engine',
    'transub-engine-generate-subtitles': 'engine',
    'transub-engine-translate-cues': 'engine',
    'transub-engine-cancel': 'engine',
    'transub-engine-open-latest-log': 'engine',
    'transub-engine-get-log-path': 'engine',
    'transub-engine-save-options': 'engine',
    'transub-generate-subtitles': 'engine',
    'transub-compute-task-status': 'engine',
    'transub-transcribe-range': 'engine',
    'transub-read-subtitle-meta': 'extensions',
    'transub-write-subtitle-meta': 'extensions',
    'transub-get-glossary': 'extensions',
    'transub-save-glossary': 'extensions',
    'transub-export-glossary': 'extensions',
    'transub-import-glossary': 'extensions',
    'transub-get-text-presets': 'extensions',
    'transub-save-text-presets': 'extensions',
    'transub-export-text-presets': 'extensions',
    'transub-import-text-presets': 'extensions',
    'transub-get-editor-workflows': 'extensions',
    'transub-save-editor-workflows': 'extensions',
    'transub-export-editor-workflows': 'extensions',
    'transub-import-editor-workflows': 'extensions',
    'transwithai-save-options': 'transwithai',
    'transub-test-proxy': 'transwithai',
    'transub-test-hf-endpoint': 'transwithai',
    'transwithai-set-post-task': 'transwithai',
    'transub-batch-finalize': 'transwithai',
    'transwithai-get-pending-files': 'transwithai',
    'transwithai-select-videos': 'transwithai',
    'transwithai-show-in-folder': 'transwithai',
    'transwithai-open-external': 'transwithai',
    'ffmpeg-probe': 'extensions',
    'ffmpeg-probe-acoustic': 'extensions',
    'transub-sense-memory-lookup': 'extensions',
    'transub-sense-memory-record': 'extensions',
    'transub-sense-memory-stats': 'extensions',
    'transub-sense-memory-clear': 'extensions',
    'ffmpeg-validate': 'extensions',
    'transub-env-check': 'extensions',
    'ffmpeg-detect-silence': 'extensions',
    'ffmpeg-cancel': 'extensions',
    'ffmpeg-extract-waveform': 'extensions',
    'electron-select-ffmpeg': 'extensions',
    'transwithai-scan-folder': 'extensions',
    'transwithai-check-subtitles': 'extensions',
    'transwithai-get-presets': 'extensions',
    'transwithai-save-preset': 'extensions',
    'transwithai-delete-preset': 'extensions',
    'transwithai-export-preset': 'extensions',
    'transwithai-import-preset': 'extensions',
    'transwithai-get-task-history': 'extensions',
    'transwithai-clear-task-history': 'extensions',
    'transub-clear-transcript-cache': 'extensions',
    'transub-find-kept-transcript': 'extensions',
    'transub-pin-kept-transcript': 'extensions',
    'transub-get-editor-history': 'extensions',
    'transub-append-editor-history': 'extensions',
    'transub-clear-editor-history': 'extensions',
    'transub-file-exists': 'extensions',
    'transwithai-detect-gpu': 'extensions',
    'transwithai-subtitle-preview': 'extensions',
    'transub-read-subtitle': 'extensions',
    'transub-write-subtitle': 'extensions',
    'transub-export-subtitle': 'extensions',
    'transub-delete-subtitle-files': 'extensions',
    'transub-scan-subtitle-qc': 'extensions',
    'transub-apply-subtitle-postprocess': 'extensions',
    'transwithai-list-models': 'extensions',
    'transwithai-validate-model': 'extensions',
    'transub-copy-subtitle-as': 'extensions',
    'transub-trial-compare': 'transwithai',
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
    'transub-editor-register-path': 'editorWindow',
    'transub-open-settings': 'editorWindow',
    'transub-open-setup-wizard': 'editorWindow',
    'transub-open-update-window': 'editorWindow',
    'transub-open-about-window': 'editorWindow',
    'transub-show-main-window': 'editorWindow',
    'transub-consume-pending-open-params': 'editorWindow',
    'transub-consume-pending-setup-wizard': 'editorWindow',
    'transub-editor-refocus': 'editorWindow',
    'transub-editor-confirm': 'editorWindow',
    'transub-editor-sync-menu': 'editorWindow',
    'transwithai-open-latest-log': 'extensions',
    'transwithai-export-config': 'extensions',
    'transwithai-import-config': 'extensions',
    'transwithai-check-app-update': 'extensions',
    'transub-download-app-update': 'extensions',
    'transub-quit-and-install-update': 'extensions',
    'transub-open-update-page': 'extensions',
    'transwithai-open-path': 'extensions',
    'transub-advanced-get-status': 'advanced',
    'transub-advanced-activate': 'advanced',
    'transub-advanced-transfer': 'advanced',
    'transub-advanced-redeem-afdian': 'advanced',
    'transub-advanced-revalidate': 'advanced',
    'transub-advanced-deactivate': 'advanced',
    'transub-advanced-save-byok': 'advanced',
    'transub-advanced-clear-byok-key': 'advanced',
    'transub-advanced-managed-llm-status': 'advanced',
    'transub-advanced-managed-llm-select': 'advanced',
    'transub-advanced-managed-llm-open-pick': 'advanced',
    'transub-advanced-managed-llm-open-download': 'advanced',
    'transub-advanced-managed-llm-download-info': 'advanced',
    'transub-advanced-managed-llm-open-manual': 'advanced',
    'transub-advanced-managed-llm-open-folder': 'advanced',
    'transub-advanced-managed-llm-verify-manual': 'advanced',
    'transub-advanced-managed-llm-pull': 'advanced',
    'transub-advanced-managed-llm-install-runtime': 'advanced',
    'transub-advanced-managed-llm-set-runtime': 'advanced',
    'transub-advanced-managed-llm-import-runtime': 'advanced',
    'transub-advanced-managed-llm-cancel-pull': 'advanced',
    'transub-advanced-managed-llm-stop-server': 'advanced',
    'transub-advanced-managed-llm-perf-test': 'advanced',
    'transub-advanced-open-ollama-download': 'advanced',
    'transub-advanced-require-feature': 'advanced',
    'transub-advanced-qc-smart-fix': 'advanced',
    'transub-advanced-qc-llm-split': 'advanced',
    'transub-advanced-context-reconstruct': 'advanced',
    'transub-advanced-film-context-reconstruct': 'advanced',
    'transub-advanced-smart-translate': 'advanced',
    'transub-advanced-bilingual-semantic-review': 'advanced',
    'transub-advanced-batch-context-reconstruct': 'advanced',
    'transub-advanced-cancel-batch-context-reconstruct': 'advanced',
    'transub-advanced-cancel-context-reconstruct': 'advanced',
    'transub-advanced-test-byok': 'advanced',
    'transub-advanced-reload-module': 'advanced',
    'transub-tdp-get-status': 'advanced',
    'transub-tdp-check': 'advanced',
    'transub-tdp-pull': 'advanced',
    'transub-tdp-cancel-pull': 'advanced',
    'transub-tdp-sync': 'advanced',
    'transub-sakura-status': 'engine',
    'transub-sakura-translate': 'engine',
    'transub-sakura-cancel-translate': 'engine',
});

deferredBridges.defer('advanced', (api) => {
    const { setupAdvancedBridge } = require('./advanced-bridge');
    setupAdvancedBridge(api, { windowManager });
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
        warmBridges: () => {
            warmEditorBridges();
            scheduleWarmEditorHeavyBridges();
        },
        windowManager,
    });
});

deferredBridges.defer('engine', (api) => {
    const { setupEngineBridge } = require('./engine-bridge');
    setupEngineBridge(api, {
        getAppRoot: () => getAppRoot(app),
        windowManager,
        ensureBridge: (name) => deferredBridges.ensure(name),
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
    // Apply nativeTheme before any BrowserWindow so title bars match on first paint.
    try { appTheme.initAppTheme(); } catch (err) {
        console.warn('[main] initAppTheme failed:', err?.message || err);
    }
    // 尽早探测 NVIDIA，供 llama-server 默认选 CUDA 13/12（无独显则仍为 Vulkan）
    try {
        require('./advanced-runtime-prefer').refreshPreferCuda().catch(() => {});
    } catch (_) { /* ignore */ }
    const cliEdit = parseCliEditSubtitle();
    const cliFiles = parseCliFiles();
    if (cliFiles.length) setPendingFilesForWindow(cliFiles);

    let preferEditorStartup = false;
    if (!editorOnlyMode && !cliEdit && !cliFiles.length) {
        try {
            const loaded = loadSettings(() => getAppRoot(app));
            preferEditorStartup = resolveStartupWindowPref(loaded?.options || {}) === 'editor';
        } catch (err) {
            console.warn('[main] read startupWindow failed:', err.message || err);
        }
    }

    if (editorOnlyMode || preferEditorStartup) {
        if (preferEditorStartup) editorOnlyMode = true;
        warmEditorBridges();
        if (cliEdit) {
            openCliSubtitleEditor(cliEdit);
        } else {
            const { openSubtitleEditorOrPick } = require('./subtitle-editor-window');
            openSubtitleEditorOrPick(app);
        }
        scheduleWarmEditorHeavyBridges();
    } else if (cliEdit) {
        openCliSubtitleEditor(cliEdit);
        windowManager.createMainWindow({ startMinimizedToTray: true });
    } else {
        // Main window path: bridges load on first IPC (validate / generate / …)
        windowManager.createMainWindow();
    }

    // Migrate after window creation is scheduled so first paint is not blocked.
    setImmediate(() => {
        try {
            migrateLegacyUserDataFiles();
            const loaded = loadSettings(() => getAppRoot(app));
            try {
                windowManager.setMinimizeToTrayEnabled?.(loaded?.options?.minimizeToTrayEnabled !== false);
            } catch { /* ignore */ }
            try {
                const { applyProxyFromSettings } = require('./proxy-settings');
                const { session } = require('electron');
                void applyProxyFromSettings(loaded?.options || {}, { session: session.defaultSession });
            } catch (err) {
                console.warn('[main] proxy apply failed:', err.message || err);
            }
            try {
                const { scheduleAutoUpdateChecks } = require('./auto-update-check');
                scheduleAutoUpdateChecks(app, {
                    getAppRoot: () => getAppRoot(app),
                    getParentWindow: () => windowManager.getMainWindow?.() || null,
                });
            } catch (err) {
                console.warn('[main] auto update schedule failed:', err.message || err);
            }
        } catch (err) {
            console.warn('[main] user data migration failed:', err.message || err);
        }
    });
});
app.on('window-all-closed', () => {
    if (windowManager.isQuitting()) return;
    // Spurious last-window close (seen when a dark editor flipped nativeTheme)
    // must not force-quit while the tray is still alive — recreate main instead.
    try {
        if (typeof windowManager.isSuppressMinimizeToTrayActive === 'function'
            && windowManager.isSuppressMinimizeToTrayActive()) {
            setImmediate(() => {
                try {
                    if (windowManager.isQuitting()) return;
                    windowManager.createMainWindow();
                } catch (_) { /* ignore */ }
            });
            return;
        }
    } catch (_) { /* ignore */ }
    // Windows-only app: always quit when all windows close
    windowManager.quitApp();
});

app.on('before-quit', () => {
    windowManager.setQuitting(true);
    try {
        const { stopAutoUpdateChecks } = require('./auto-update-check');
        stopAutoUpdateChecks();
    } catch { /* ignore */ }
    try {
        const { closeAllSubtitleEditorWindows } = require('./subtitle-editor-window');
        closeAllSubtitleEditorWindows();
    } catch { /* ignore */ }
    try {
        const { stopSubtitleJobs } = require('./transwithai-bridge');
        stopSubtitleJobs();
    } catch { /* ignore */ }
    try {
        const { stopEngineJobs } = require('./engine-bridge');
        stopEngineJobs();
    } catch { /* ignore */ }
    try {
        const { stopLlamaServer } = require('./advanced-llama-server');
        stopLlamaServer();
    } catch { /* ignore */ }
    try {
        const { forceRelease } = require('./compute-task-lock');
        forceRelease();
    } catch { /* ignore */ }
});

module.exports = {
    getUserDataPath,
    windowManager,
};
