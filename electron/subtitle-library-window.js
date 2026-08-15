/**
 * Standalone Subtitle Library BrowserWindow.
 */
const { BrowserWindow } = require('electron');
const path = require('path');
const { resolveHtmlPath } = require('./app-paths');
const { getWindowIconOption, applyWindowIcon } = require('./icons');
const { attachUiZoom } = require('./ui-zoom');
const {
    loadWindowState,
    writeWindowState,
    captureWindowState,
    SAVE_STATE_DEBOUNCE_MS,
} = require('./window-state');

const LIBRARY_WINDOW_STATE_KEY = 'subtitle-library';
const LIBRARY_WINDOW_DEFAULTS = Object.freeze({
    width: 1100,
    height: 760,
    minWidth: 780,
    minHeight: 520,
});

/** @type {import('electron').BrowserWindow|null} */
let libraryWindow = null;
let saveStateTimer = null;

function focusLibraryWindow() {
    const win = libraryWindow;
    if (!win || win.isDestroyed()) return null;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    applyWindowIcon(win);
    return win;
}

function saveLibraryWindowState() {
    const win = libraryWindow;
    if (!win || win.isDestroyed()) return;
    const state = captureWindowState(win, LIBRARY_WINDOW_DEFAULTS);
    if (state) writeWindowState(state, LIBRARY_WINDOW_STATE_KEY);
}

function scheduleSaveLibraryWindowState() {
    if (saveStateTimer) clearTimeout(saveStateTimer);
    saveStateTimer = setTimeout(() => {
        saveStateTimer = null;
        saveLibraryWindowState();
    }, SAVE_STATE_DEBOUNCE_MS);
}

function attachLibraryWindowState(win) {
    const persistSoon = () => scheduleSaveLibraryWindowState();
    win.on('resize', persistSoon);
    win.on('move', persistSoon);
    win.on('maximize', persistSoon);
    win.on('unmaximize', persistSoon);
    win.on('close', () => {
        saveLibraryWindowState();
    });
}

function normalizeMediaPathKey(filePath) {
    return String(filePath || '').replace(/\\/g, '/').trim().toLowerCase();
}

function resolveFocusMediaId({ mediaId, mediaPath, versionId } = {}) {
    let catalog = null;
    const loadCat = () => {
        if (catalog) return catalog;
        try {
            const { loadCatalog } = require('./subtitle-library');
            catalog = loadCatalog() || { media: [], tracks: [], versions: [] };
        } catch {
            catalog = { media: [], tracks: [], versions: [] };
        }
        return catalog;
    };
    const mediaExists = (id) => {
        const want = String(id || '').trim();
        if (!want) return false;
        return (loadCat().media || []).some((m) => m.id === want);
    };

    const id = String(mediaId || '').trim();
    if (id && mediaExists(id)) return id;

    const filePath = String(mediaPath || '').trim();
    if (filePath) {
        const key = normalizeMediaPathKey(filePath);
        const byPath = (loadCat().media || []).find(
            (m) => normalizeMediaPathKey(m.path) === key,
        );
        if (byPath?.id) return byPath.id;
        try {
            const core = require('../src/js/subtitle-library-core');
            const fromPath = core.mediaIdFromPath(filePath) || '';
            if (fromPath && mediaExists(fromPath)) return fromPath;
        } catch { /* ignore */ }
    }
    const vid = String(versionId || '').trim();
    if (!vid) return '';
    try {
        const cat = loadCat();
        const version = (cat.versions || []).find((v) => v.id === vid);
        if (!version) return '';
        const track = (cat.tracks || []).find((t) => t.id === version.trackId);
        const mid = String(track?.mediaId || '').trim();
        return mediaExists(mid) ? mid : '';
    } catch {
        return '';
    }
}

/**
 * @param {import('electron').App} app
 * @param {{ parent?: import('electron').BrowserWindow|null, mediaId?: string, mediaPath?: string }} [options]
 */
function openSubtitleLibraryWindow(app, {
    parent: _parent,
    mediaId,
    mediaPath,
    versionId,
} = {}) {
    const focusVersionId = String(versionId || '').trim();
    const wantFocus = !!(String(mediaId || '').trim() || String(mediaPath || '').trim() || focusVersionId);
    const focusId = resolveFocusMediaId({ mediaId, mediaPath, versionId: focusVersionId });
    const existing = focusLibraryWindow();
    if (existing) {
        if (focusId || focusVersionId || wantFocus) {
            try {
                existing.webContents.send('transub-library-focus-media', {
                    mediaId: focusId,
                    versionId: focusVersionId,
                    missing: wantFocus && !focusId,
                    mediaPath: String(mediaPath || '').trim(),
                });
            } catch { /* ignore */ }
        }
        return { ok: true };
    }

    let backgroundColor = '#f9fafb';
    try {
        const { getAppTheme, MAIN_BG } = require('./app-theme');
        backgroundColor = MAIN_BG[getAppTheme()] || backgroundColor;
    } catch { /* ignore */ }

    const saved = loadWindowState(LIBRARY_WINDOW_STATE_KEY, LIBRARY_WINDOW_DEFAULTS);
    const win = new BrowserWindow({
        width: saved?.width || LIBRARY_WINDOW_DEFAULTS.width,
        height: saved?.height || LIBRARY_WINDOW_DEFAULTS.height,
        minWidth: LIBRARY_WINDOW_DEFAULTS.minWidth,
        minHeight: LIBRARY_WINDOW_DEFAULTS.minHeight,
        x: Number.isFinite(saved?.x) ? saved.x : undefined,
        y: Number.isFinite(saved?.y) ? saved.y : undefined,
        title: '字幕库 — Transub',
        icon: getWindowIconOption(),
        autoHideMenuBar: true,
        backgroundColor,
        show: false,
        // No parent: avoid minimizing main window on Windows when child closes.
        modal: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    libraryWindow = win;
    attachUiZoom(win);
    attachLibraryWindowState(win);
    win.setMenuBarVisibility(false);
    win.removeMenu();
    applyWindowIcon(win);

    win.on('closed', () => {
        if (libraryWindow === win) libraryWindow = null;
    });

    const query = new URLSearchParams();
    if (focusId) query.set('mediaId', String(focusId));
    if (focusVersionId) query.set('versionId', focusVersionId);
    if (wantFocus && !focusId) query.set('missing', '1');
    win.loadFile(resolveHtmlPath(app, 'subtitle-library.html'), {
        search: query.toString() || undefined,
    });

    win.once('ready-to-show', () => {
        if (win.isDestroyed()) return;
        applyWindowIcon(win);
        if (saved?.isMaximized) {
            try { win.maximize(); } catch { /* ignore */ }
        }
        win.show();
        win.focus();
    });

    return { ok: true };
}

function getSubtitleLibraryWindow() {
    if (libraryWindow && !libraryWindow.isDestroyed()) return libraryWindow;
    return null;
}

function closeSubtitleLibraryWindow() {
    const win = getSubtitleLibraryWindow();
    if (win) {
        try { win.close(); } catch { /* ignore */ }
    }
}

/**
 * Forward a prepared retranslate payload to the main generator window.
 * @param {{ windowManager?: object }} deps
 * @param {object} payload
 */
function startLibraryRetranslateOnMain(deps, payload = {}) {
    const windowManager = deps?.windowManager;
    if (!windowManager?.showMainWindow && !windowManager?.getMainWindow) {
        return { ok: false, error: '无法打开字幕生成器' };
    }
    try {
        if (typeof windowManager.showMainWindow === 'function') {
            windowManager.showMainWindow();
        }
        const main = typeof windowManager.getMainWindow === 'function'
            ? windowManager.getMainWindow()
            : null;
        const win = main && !main.isDestroyed?.() ? main : null;
        if (!win?.webContents || win.webContents.isDestroyed()) {
            return { ok: false, error: '主窗口不可用' };
        }
        win.webContents.send('transub-library-start-retranslate', payload || {});
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    }
}

/**
 * Notify open library window that catalog changed (ingest / edit / etc.).
 * @param {{ reason?: string, mediaIds?: string[], ingested?: number }} [payload]
 */
function notifySubtitleLibraryCatalogChanged(payload = {}) {
    const win = getSubtitleLibraryWindow();
    if (!win?.webContents || win.webContents.isDestroyed()) return false;
    try {
        win.webContents.send('transub-library-catalog-changed', payload || {});
        return true;
    } catch {
        return false;
    }
}

module.exports = {
    openSubtitleLibraryWindow,
    getSubtitleLibraryWindow,
    closeSubtitleLibraryWindow,
    startLibraryRetranslateOnMain,
    notifySubtitleLibraryCatalogChanged,
};
