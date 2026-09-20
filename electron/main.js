const { app, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { getAppRoot, getWritableRoot, migrateLegacyUserDataFiles } = require('./app-paths');

// Layer local MT sandbox remaps on official pack (sanitize / engine paths).
(() => {
    try {
        const writable = getWritableRoot();
        if (!process.env.TRANSUB_MT_SANDBOX_ROOT) {
            process.env.TRANSUB_MT_SANDBOX_ROOT = writable;
        }
        if (!process.env.TRANSUB_MT_USER_REMAPS) {
            process.env.TRANSUB_MT_USER_REMAPS = path.join(writable, 'mt-user-remaps.json');
        }
    } catch (_) { /* ignore */ }
})();

const { createDeferredBridgeSetup } = require('./bridge-registry');
const { createWindowManager } = require('./window-manager');
const { registerMediaScheme, registerMediaProtocolHandler } = require('./media-protocol');
const { isEditableSubtitleFile, MEDIA_EXTENSIONS } = require('./subtitle-utils');
const {
    parsePlayerProtocolArgv,
    registerPlayerProtocolClient,
} = require('./player-protocol');
const { prepareQueueHandoff } = require('./player-handoff');
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

try {
    require('./i18n-install').installI18nDialogHooks();
} catch (err) {
    console.warn('[main] i18n dialog hooks skipped:', err?.message || err);
}

/** @type {string[]} */
let earlyPendingFiles = [];
let transwithaiBridgeLoaded = false;

function setPendingFilesForWindow(files, { keepHandoffOptions = false } = {}) {
    const list = Array.isArray(files) ? files.filter(Boolean) : [];
    earlyPendingFiles = list;
    if (!keepHandoffOptions) {
        try {
            require('./player-handoff').setPendingHandoffOptions(null, null);
        } catch (_) { /* ignore */ }
    }
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
// Intentionally omit SpareRendererForSitePerProcess — faster cold start / lower baseline RAM.
const enableFeatures = [];
if (process.platform === 'win32') {
    enableFeatures.push(
        'PlatformHEVCDecoderSupport',
        'D3D11VideoDecoder',
        'UseMediaFoundationForMediaPlayback',
    );
}
if (enableFeatures.length) {
    app.commandLine.appendSwitch('enable-features', enableFeatures.join(','));
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
    return;
}

app.setName('Transub 字幕工厂');
if (process.platform === 'win32') {
    // Must match package.json build.appId so Windows taskbar/shortcuts use Transub icon
    app.setAppUserModelId('com.transub.app');
}

try {
    registerPlayerProtocolClient();
} catch (err) {
    console.warn('[main] protocol register skipped:', err?.message || err);
}

/** Writable app data (settings / TWAI config cache) — software directory, not AppData. */
function getUserDataPath() {
    return getWritableRoot();
}

function parseCliFiles(argv = process.argv.slice(1)) {
    const files = [];
    const seen = new Set();
    const push = (p) => {
        const trimmed = String(p || '').trim();
        if (!trimmed) return;
        const key = trimmed.replace(/\\/g, '/').toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        files.push(trimmed);
    };
    for (const arg of argv) {
        if (arg.startsWith('--files=')) {
            const raw = arg.slice('--files='.length);
            raw.split('|').forEach(push);
            continue;
        }
        // Bare media path (e.g. from Transub Player / shell open) — not --edit-sub.
        if (arg.startsWith('-')) continue;
        if (isEditableSubtitleFile(arg)) continue;
        try {
            const ext = path.extname(arg).replace(/^\./, '').toLowerCase();
            if (MEDIA_EXTENSIONS.includes(ext)) push(arg);
        } catch (_) { /* ignore */ }
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
    const proto = parsePlayerProtocolArgv(argv);
    if (proto?.mode === 'edit') return true;
    return Boolean(parseCliEditSubtitle(argv));
}

/**
 * Apply Player handoff URL / argv. Returns which path was taken.
 * @returns {'edit'|'queue'|'open'|null}
 */
function applyPlayerProtocolHandoff(handoff) {
    if (!handoff) return null;
    if (handoff.mode === 'shelf' || handoff.mode === 'library') {
        try {
            const { openSubtitleShelfWindow } = require('./subtitle-shelf-window');
            openSubtitleShelfWindow(app, {
                mediaPath: handoff.media || '',
            });
        } catch (err) {
            console.warn('[player-handoff] shelf open failed:', err?.message || err);
        }
        return 'shelf';
    }
    if (handoff.mode === 'edit' && handoff.sub) {
        let playerHandoff = null;
        try {
            const { enrichPlayerHandoff, buildPlayerHandoffEditorSession } = require('./player-handoff');
            const { meta } = enrichPlayerHandoff(handoff);
            playerHandoff = buildPlayerHandoffEditorSession(meta);
        } catch (err) {
            console.warn('[player-handoff] editor session failed:', err?.message || err);
        }
        openCliSubtitleEditor({
            subPath: handoff.sub,
            videoPath: handoff.media || '',
            mediaPath: handoff.media || '',
            sourceLanguage: handoff.src || playerHandoff?.sourceLanguage || '',
            translateTarget: handoff.tgt || playerHandoff?.translateTarget || '',
            contentProfile: handoff.profile || playerHandoff?.contentProfile || '',
            chineseSubtitleVariant: playerHandoff?.chineseSubtitleVariant || '',
            from: handoff.from || 'player',
            ...(playerHandoff ? { playerHandoff } : {}),
        });
        return 'edit';
    }
    if (handoff.mode === 'queue' && handoff.media) {
        try {
            prepareQueueHandoff(handoff);
        } catch (err) {
            console.warn('[player-handoff] prepare failed:', err?.message || err);
        }
        setPendingFilesForWindow([handoff.media], { keepHandoffOptions: true });
        try {
            windowManager.sendToRenderer('transub-cli-files-pending', { count: 1 });
        } catch (_) { /* ignore */ }
        return 'queue';
    }
    return 'open';
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
    if (!editRequest?.subPath && !editRequest?.welcome) return;
    warmEditorBridges();
    scheduleWarmEditorHeavyBridges();
    const launch = require('./editor-external-launch');
    const { loadSettings } = require('./settings-data');
    const { mergeTransWithAiOptions } = require('./transwithai-options');
    let options = {};
    try {
        options = mergeTransWithAiOptions(loadSettings(() => getAppRoot(app)).options || {});
    } catch (_) { /* ignore */ }

    const result = launch.openSubtitleEditorPreferExternal(
        {
            subPath: editRequest.subPath,
            videoPath: editRequest.videoPath || editRequest.mediaPath || '',
            mediaPath: editRequest.mediaPath || editRequest.videoPath || '',
            sourceLanguage: editRequest.sourceLanguage || editRequest.src || '',
            translateTarget: editRequest.translateTarget || editRequest.tgt || '',
            contentProfile: editRequest.contentProfile || editRequest.profile || '',
            chineseSubtitleVariant: editRequest.chineseSubtitleVariant || '',
            manifestPath: editRequest.manifestPath || '',
            from: editRequest.from || 'transub',
            playerHandoff: editRequest.playerHandoff,
            welcome: !!editRequest.welcome && !editRequest.subPath,
        },
        {
            getOptions: () => options,
            getAppRoot: () => getAppRoot(app),
            electronFallback: (payload) => {
                const { createSubtitleEditorWindow } = require('./subtitle-editor-window');
                createSubtitleEditorWindow(app, {
                    subPath: payload.subPath,
                    videoPath: payload.videoPath || payload.mediaPath,
                    playerHandoff: payload.playerHandoff,
                });
                return { path: payload.subPath || '' };
            },
        },
    );
    return result;
}

const deferredBridges = createDeferredBridgeSetup(ipcMain);
const windowManager = createWindowManager({
    getAppRoot: () => getAppRoot(app),
    getUserDataPath,
});

try {
    const { registerWindowControlsIpc } = require('./window-controls');
    registerWindowControlsIpc(ipcMain, {
        getMainWindow: () => windowManager.getMainWindow(),
    });
} catch (_) { /* optional */ }

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
        try {
            require('./i18n').initFromOptions(options);
        } catch { /* optional */ }
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

ipcMain.handle('transub-get-cli-launcher', async () => {
    try {
        const path = require('path');
        const { getInstallRoot, getProjectRoot } = require('./app-paths');
        const installRoot = getInstallRoot();
        const projectRoot = getProjectRoot();
        const packaged = !!app.isPackaged;
        if (packaged) {
            const transubExe = process.platform === 'win32'
                ? path.join(installRoot, 'transub.exe')
                : process.execPath;
            return {
                ok: true,
                packaged: true,
                transubExe,
                installRoot,
                projectRoot,
            };
        }
        return {
            ok: true,
            packaged: false,
            transubExe: process.platform === 'win32'
                ? 'D:\\Transub\\transub.exe'
                : '',
            installRoot,
            projectRoot,
        };
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
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

// Cold entitlement — does not load advanced-bridge / TDP / managed catalog.
ipcMain.handle('transub-advanced-get-entitlement', async () => {
    try {
        const { getEntitlementStatusCold } = require('./advanced-status-cold');
        return getEntitlementStatusCold();
    } catch (err) {
        return { ok: false, error: err?.message || String(err), status: { entitled: false } };
    }
});

// Cold bundled engine path — used to fill settings before engine-bridge loads.
ipcMain.handle('transub-engine-bundled-path', async () => {
    try {
        const {
            getBundledEnginePath,
            getBundledEnginePathIfPresent,
            isValidEngineRoot,
        } = require('./app-paths');
        const bundled = getBundledEnginePath();
        const present = isValidEngineRoot(bundled);
        return {
            ok: true,
            path: bundled,
            present,
            resolved: present ? bundled : getBundledEnginePathIfPresent(),
        };
    } catch (err) {
        return { ok: false, error: err?.message || String(err) };
    }
});

// Cold model-list cache — browse during engine jobs without touching the process.
ipcMain.handle('transub-engine-models-cache-load', async () => {
    try {
        return require('./engine-models-cache').loadCache();
    } catch (err) {
        return { ok: false, error: err?.message || String(err), cache: null };
    }
});
ipcMain.handle('transub-engine-models-cache-save', async (_event, payload = {}) => {
    try {
        return require('./engine-models-cache').saveCache(payload || {});
    } catch (err) {
        return { ok: false, error: err?.message || String(err) };
    }
});

// Cold UI fragment read — file:// fetch is blocked by Chromium CORS.
const UI_FRAGMENT_ALLOWLIST = new Set([
    'settings-panels.fragment.html',
    'workspace-scenes.fragment.html',
    'workspace-shelf.fragment.html',
    'workspace-models.fragment.html',
    'workspace-burn.fragment.html',
    'setup-wizard.fragment.html',
    'factory-modals.fragment.html',
    'editor-modals-drawers.fragment.html',
    'editor-modals-tools.fragment.html',
    'editor-modals-pro.fragment.html',
]);
ipcMain.handle('transub-read-ui-fragment', async (_event, payload = {}) => {
    try {
        const name = String(payload?.name || payload?.file || '').trim().replace(/\\/g, '/');
        const base = path.basename(name);
        if (!UI_FRAGMENT_ALLOWLIST.has(base) || name.includes('..') || name.includes('/')) {
            return { ok: false, error: 'fragment not allowed' };
        }
        const filePath = path.join(getAppRoot(app), base);
        let html;
        try {
            html = await fs.promises.readFile(filePath, 'utf8');
        } catch (err) {
            if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) {
                return { ok: false, error: `fragment missing: ${base}` };
            }
            throw err;
        }
        return { ok: true, name: base, html };
    } catch (err) {
        return { ok: false, error: err?.message || String(err) };
    }
});

deferredBridges.installLazyRoutes({
    'electron-select-folder': 'transwithai',
    'transwithai-validate': 'transwithai',
    'transwithai-check-engine-update': 'transwithai',
    'transwithai-generate-subtitles': 'transwithai',
    'transwithai-cancel': 'transwithai',
    'transwithai-cancel-current': 'transwithai',
    'transub-live-batch-append': 'liveBatch',
    'transub-live-batch-skip': 'liveBatch',
    'transub-live-batch-update-overrides': 'liveBatch',
    'transub-live-batch-snapshot': 'liveBatch',
    'transub-engine-validate': 'engine',
    'transub-engine-list-models': 'engine',
    'transub-engine-delete-models': 'engine',
    'transub-engine-recommend': 'engine',
    'transub-engine-detect-language': 'engine',
    'transub-engine-download-models': 'engine',
    'transub-engine-gpu-status': 'engine',
    'transub-engine-scan-cuda': 'engine',
    'transub-engine-adopt-cuda': 'engine',
    'transub-engine-pick-cuda-root': 'engine',
    'transub-engine-asr-whisper-status': 'engine',
    'transub-engine-ensure-gpu': 'engine',
    'transub-engine-audio-separate-status': 'engine',
    'transub-engine-open-download': 'engine',
    'transub-engine-run-download': 'engine',
    'transub-engine-cancel-download': 'engine',
    'transub-engine-download-info': 'engine',
    'transub-engine-open-manual-url': 'engine',
    'transub-engine-open-thunder-urls': 'engine',
    'transub-engine-open-download-tool': 'engine',
    'transub-engine-open-download-folder': 'engine',
    'transub-engine-pick-whl': 'engine',
    'transub-engine-validate-whl': 'engine',
    'transub-engine-install-local-wheels': 'engine',
    'transub-engine-generate-subtitles': 'engine',
    'transub-engine-translate-cues': 'engine',
    'transub-engine-cancel': 'engine',
    'transub-engine-cancel-current': 'engine',
    'transub-engine-resume-job': 'engine',
    'transub-engine-job-checkpoint': 'engine',
    'transub-engine-export-diagnostics': 'engine',
    'transub-engine-open-latest-log': 'engine',
    'transub-engine-get-log-path': 'engine',
    'transub-engine-save-options': 'engine',
    'transub-generate-subtitles': 'engine',
    'transub-compute-task-status': 'engine',
    'transub-compute-task-force-release': 'engine',
    'transub-compute-task-cancel': 'engine',
    'transub-transcribe-range': 'engine',
    'transub-read-subtitle-meta': 'extensions',
    'transub-write-subtitle-meta': 'extensions',
    'transub-get-glossary': 'extensions',
    'transub-save-glossary': 'extensions',
    'transub-export-glossary': 'extensions',
    'transub-import-glossary': 'extensions',
    'transub-import-anilist-glossary': 'extensions',
    'transub-import-bad-pool-glossary': 'extensions',
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
    'transub-station-probe': 'transwithai',
    'transub-station-fetch-config': 'transwithai',
    'transub-station-list-models': 'transwithai',
    'transub-station-select-model': 'transwithai',
    'transub-test-hf-endpoint': 'transwithai',
    'transub-pick-hf-endpoint': 'transwithai',
    'transub-test-github-mirrors': 'transwithai',
    'transwithai-set-post-task': 'transwithai',
    'transub-batch-finalize': 'transwithai',
    'transwithai-get-pending-files': 'transwithai',
    'transwithai-select-videos': 'transwithai',
    'transwithai-show-in-folder': 'transwithai',
    'transwithai-open-external': 'transwithai',
    'ffmpeg-probe': 'extensions',
    'ffmpeg-probe-acoustic': 'extensions',
    'ffmpeg-validate': 'extensions',
    'transub-env-check': 'extensions',
    'ffmpeg-detect-silence': 'extensions',
    'ffmpeg-cancel': 'extensions',
    'ffmpeg-burn-hardsub': 'extensions',
    'ffmpeg-burn-preview-clip': 'extensions',
    'ffmpeg-burn-delete-preview': 'extensions',
    'ffmpeg-burn-list-encoders': 'extensions',
    'ffmpeg-burn-read-text': 'extensions',
    'ffmpeg-burn-select-output': 'extensions',
    'ffmpeg-extract-waveform': 'extensions',
    'electron-select-ffmpeg': 'extensions',
    'transwithai-scan-folder': 'extensions',
    'transwithai-auto-scan-folders': 'extensions',
    'transwithai-check-subtitles': 'extensions',
    'transwithai-get-presets': 'extensions',
    'transwithai-save-preset': 'extensions',
    'transwithai-delete-preset': 'extensions',
    'transwithai-export-preset': 'extensions',
    'transwithai-import-preset': 'extensions',
    'combo-plans-list': 'extensions',
    'combo-plans-get': 'extensions',
    'combo-plans-refresh': 'extensions',
    'transwithai-get-task-history': 'extensions',
    'transwithai-clear-task-history': 'extensions',
    'transub-clear-transcript-cache': 'extensions',
    'transub-shelf-status': 'extensions',
    'transub-shelf-list': 'extensions',
    'transub-shelf-get-media': 'extensions',
    'transub-shelf-delete-media': 'extensions',
    'transub-shelf-delete-translation': 'extensions',
    'transub-shelf-register-translation': 'extensions',
    'transub-shelf-set-media-path': 'extensions',
    'transub-shelf-rename-media': 'extensions',
    'transub-shelf-open-slot': 'extensions',
    'transub-shelf-preview-slot': 'extensions',
    'transub-shelf-scan-media': 'extensions',
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
    'transub-pick-save-subtitle': 'extensions',
    'transub-delete-subtitle-files': 'extensions',
    'transub-scan-subtitle-qc': 'extensions',
    'transub-apply-subtitle-postprocess': 'extensions',
    'transub-insert-text-preset-group': 'extensions',
    'transub-qc-silence-split': 'extensions',
    'transub-compact-pure-interjections': 'extensions',
    'transub-merge-bilingual-subtitles': 'extensions',
    'transub-remove-noise-pair': 'extensions',
    'transub-list-system-fonts': 'extensions',
    'transwithai-list-models': 'extensions',
    'transwithai-validate-model': 'extensions',
    'transub-copy-subtitle-as': 'extensions',
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
    'transub-open-player': 'playerLaunch',
    'transub-resolve-player': 'playerLaunch',
    'transub-resolve-external-editor': 'editorWindow',
    'transub-editor-register-path': 'editorWindow',
    'transub-open-settings': 'editorWindow',
    'transub-open-setup-wizard': 'editorWindow',
    'transub-open-update-window': 'editorWindow',
    'transub-open-about-window': 'editorWindow',
    'transub-open-subtitle-shelf': 'editorWindow',
    'transub-is-dev-build': 'editorWindow',
    'transub-upload-subtitlecat': 'editorWindow',
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
    'transub-advanced-managed-llm-scan-cuda': 'advanced',
    'transub-advanced-managed-llm-adopt-cuda': 'advanced',
    'transub-advanced-managed-llm-set-runtime': 'advanced',
    'transub-advanced-managed-llm-import-runtime': 'advanced',
    'transub-advanced-managed-llm-cancel-pull': 'advanced',
    'transub-advanced-managed-llm-lab-add': 'advanced',
    'transub-advanced-managed-llm-lab-remove': 'advanced',
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

deferredBridges.defer('playerLaunch', (api) => {
    const { registerPlayerLaunchRoutes } = require('./player-external-launch');
    registerPlayerLaunchRoutes(api.register, {
        getAppRoot: () => getAppRoot(app),
    });
});

deferredBridges.defer('liveBatch', (api) => {
    const { setupLiveBatchBridge } = require('./live-batch-bridge');
    setupLiveBatchBridge(api);
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
    const proto = parsePlayerProtocolArgv(cliArgs);
    if (proto) {
        const kind = applyPlayerProtocolHandoff(proto);
        if (kind === 'edit') return;
        if (editorOnlyMode) {
            editorOnlyMode = false;
            windowManager.createMainWindow();
            windowManager.setupTray();
            return;
        }
        windowManager.showMainWindow();
        return;
    }

    const cliEdit = parseCliEditSubtitle(cliArgs);
    if (cliEdit) {
        openCliSubtitleEditor(cliEdit);
        return;
    }

    const cliFiles = parseCliFiles(cliArgs);
    if (cliFiles.length) {
        setPendingFilesForWindow(cliFiles);
        try {
            windowManager.sendToRenderer('transub-cli-files-pending', { count: cliFiles.length });
        } catch (_) { /* ignore */ }
    }

    if (editorOnlyMode) {
        editorOnlyMode = false;
        windowManager.createMainWindow();
        windowManager.setupTray();
        return;
    }

    windowManager.showMainWindow();
});

// macOS / some Windows deep-link paths
app.on('open-url', (event, url) => {
    try { event.preventDefault(); } catch (_) { /* ignore */ }
    const proto = parsePlayerProtocolArgv([url]);
    if (!proto) return;
    const kind = applyPlayerProtocolHandoff(proto);
    if (kind === 'edit') return;
    try { windowManager.showMainWindow(); } catch (_) { /* ignore */ }
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
    const cliProto = parsePlayerProtocolArgv();
    const cliEdit = cliProto?.mode === 'edit'
        ? { subPath: cliProto.sub, videoPath: cliProto.media || '' }
        : parseCliEditSubtitle();
    const cliFiles = cliProto?.mode === 'queue' && cliProto.media
        ? [cliProto.media]
        : parseCliFiles();
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

    if (process.argv.slice(1).some((a) => a === '--open-shelf' || a === '--shelf')) {
        try {
            const { openSubtitleShelfWindow } = require('./subtitle-shelf-window');
            openSubtitleShelfWindow(app, {});
        } catch (err) {
            console.warn('[main] --open-shelf failed:', err?.message || err);
        }
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
                const { startEditorFactoryServer } = require('./editor-factory-server');
                void startEditorFactoryServer().then((r) => {
                    if (r?.ok) console.log('[factory] Editor RPC at', r.baseUrl);
                    else console.warn('[factory] start failed:', r?.error || 'unknown');
                }).catch((err) => {
                    console.warn('[factory] start failed:', err?.message || err);
                });
            } catch (err) {
                console.warn('[factory] load failed:', err?.message || err);
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
        // Warm MT sanitize / opaque tables after first paint so the first
        // translate job does not pay the large sync require on the critical path.
        setTimeout(() => {
            try {
                require('../src/js/mt-sanitize-core');
            } catch (err) {
                console.warn('[main] mt-sanitize warm failed:', err?.message || err);
            }
        }, 1500);
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
        const { stopEditorFactoryServer } = require('./editor-factory-server');
        void stopEditorFactoryServer();
    } catch { /* ignore */ }
    try {
        const { stopAutoUpdateChecks } = require('./auto-update-check');
        stopAutoUpdateChecks();
    } catch { /* ignore */ }
    try {
        const { closeAllSubtitleEditorWindows } = require('./subtitle-editor-window');
        closeAllSubtitleEditorWindows();
    } catch { /* ignore */ }
    try {
        const { closeSubtitleShelfWindow } = require('./subtitle-shelf-window');
        closeSubtitleShelfWindow();
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
