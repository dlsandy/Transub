const { refocusWindow } = require('./window-focus');

/** @type {import('electron').BrowserWindow|null} */
let shelfWindow = null;

function focusSubtitleShelfWindow() {
    const win = shelfWindow;
    if (!win || win.isDestroyed()) return null;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    return win;
}

function resolveWindowManager() {
    try {
        return require('./main').windowManager || null;
    } catch {
        return null;
    }
}

/**
 * Open subtitle shelf in the main factory content area (same as 产线 / 交接).
 * @param {import('electron').App} _app
 * @param {{ mediaId?: string, mediaPath?: string, parent?: import('electron').BrowserWindow|null }} [options]
 */
function openSubtitleShelfWindow(_app, { mediaId = '', mediaPath = '', parent: _parent } = {}) {
    // Prefer embedded workspace; close any legacy standalone shelf window.
    closeSubtitleShelfWindow();

    const wm = resolveWindowManager();
    if (!wm) {
        return { ok: false, error: '主窗口不可用' };
    }

    let win = typeof wm.getMainWindow === 'function' ? wm.getMainWindow() : null;
    if (!win || win.isDestroyed()) {
        try {
            win = typeof wm.createMainWindow === 'function' ? wm.createMainWindow() : null;
        } catch (err) {
            return { ok: false, error: err?.message || String(err) };
        }
    }
    if (!win || win.isDestroyed()) {
        return { ok: false, error: '无法打开主窗口' };
    }

    try {
        if (typeof wm.showMainWindow === 'function') wm.showMainWindow();
        else refocusWindow(win, { notifyRenderer: false });
    } catch { /* ignore */ }

    const payload = {
        mediaId: String(mediaId || '').trim(),
        mediaPath: String(mediaPath || '').trim(),
    };
    const send = () => {
        try {
            if (typeof wm.sendToRenderer === 'function') {
                wm.sendToRenderer('transub-open-shelf-workspace', payload);
            } else if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
                win.webContents.send('transub-open-shelf-workspace', payload);
            }
        } catch { /* ignore */ }
    };

    if (win.webContents.isLoadingMainFrame()) {
        win.webContents.once('did-finish-load', send);
    } else {
        send();
    }

    return { ok: true };
}

function closeSubtitleShelfWindow() {
    const win = shelfWindow;
    shelfWindow = null;
    if (win && !win.isDestroyed()) {
        try { win.close(); } catch { /* ignore */ }
    }
}

function getSubtitleShelfWindow() {
    if (shelfWindow && !shelfWindow.isDestroyed()) return shelfWindow;
    return null;
}

function notifyShelfCatalogChanged(payload = {}) {
    const body = payload || {};
    try {
        const wm = resolveWindowManager();
        if (wm && typeof wm.sendToRenderer === 'function') {
            wm.sendToRenderer('transub-shelf-catalog-changed', body);
        }
    } catch { /* ignore */ }

    const win = getSubtitleShelfWindow();
    if (!win) return;
    try {
        win.webContents.send('transub-shelf-catalog-changed', body);
    } catch { /* ignore */ }
}

module.exports = {
    openSubtitleShelfWindow,
    closeSubtitleShelfWindow,
    getSubtitleShelfWindow,
    notifyShelfCatalogChanged,
    focusSubtitleShelfWindow,
};
