const { BrowserWindow } = require('electron');
const path = require('path');
const { resolveHtmlPath } = require('./app-paths');
const { getWindowIconOption, applyWindowIcon } = require('./icons');
const { attachUiZoom } = require('./ui-zoom');

/** @type {import('electron').BrowserWindow|null} */
let updateWindow = null;

function focusUpdateWindow() {
    const win = updateWindow;
    if (!win || win.isDestroyed()) return null;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    applyWindowIcon(win);
    return win;
}

/**
 * Open (or focus) the dedicated app-update window.
 * @param {import('electron').App} app
 * @param {{ parent?: import('electron').BrowserWindow|null, autoCheck?: boolean }} [options]
 */
function openUpdateWindow(app, { parent: _parent, autoCheck = true } = {}) {
    const existing = focusUpdateWindow();
    if (existing) {
        if (autoCheck) {
            existing.webContents.send('transub-update-window-check');
        }
        return { ok: true };
    }

    let backgroundColor = '#f9fafb';
    try {
        const { getAppTheme, MAIN_BG } = require('./app-theme');
        backgroundColor = MAIN_BG[getAppTheme()] || backgroundColor;
    } catch (_) { /* ignore */ }
    const win = new BrowserWindow({
        width: 500,
        height: 560,
        minWidth: 420,
        minHeight: 380,
        resizable: true,
        maximizable: false,
        title: '检查更新',
        icon: getWindowIconOption(),
        autoHideMenuBar: true,
        backgroundColor,
        show: false,
        // Intentionally no `parent`: on Windows, closing an owned child often
        // minimizes the owner, and the main window treats minimize as hide-to-tray.
        modal: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    updateWindow = win;
    attachUiZoom(win);
    win.setMenuBarVisibility(false);
    win.removeMenu();
    applyWindowIcon(win);

    win.on('closed', () => {
        if (updateWindow === win) updateWindow = null;
    });

    const query = new URLSearchParams();
    if (autoCheck) query.set('autoCheck', '1');

    win.loadFile(resolveHtmlPath(app, 'update.html'), {
        search: query.toString() || undefined,
    });

    win.once('ready-to-show', () => {
        if (win.isDestroyed()) return;
        applyWindowIcon(win);
        win.show();
        win.focus();
        if (autoCheck) {
            setTimeout(() => {
                if (!win.isDestroyed()) win.webContents.send('transub-update-window-check');
            }, 200);
        }
    });

    return { ok: true };
}

function getUpdateWindow() {
    if (updateWindow && !updateWindow.isDestroyed()) return updateWindow;
    return null;
}

module.exports = {
    openUpdateWindow,
    getUpdateWindow,
};
