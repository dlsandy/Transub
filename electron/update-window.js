const { BrowserWindow } = require('electron');
const path = require('path');
const { resolveHtmlPath } = require('./app-paths');
const { getWindowIconOption, applyWindowIcon } = require('./icons');

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
function openUpdateWindow(app, { parent, autoCheck = true } = {}) {
    const existing = focusUpdateWindow();
    if (existing) {
        if (autoCheck) {
            existing.webContents.send('transub-update-window-check');
        }
        return { ok: true };
    }

    const parentWin = parent && !parent.isDestroyed() ? parent : undefined;
    const win = new BrowserWindow({
        width: 440,
        height: 360,
        minWidth: 380,
        minHeight: 300,
        resizable: true,
        maximizable: false,
        title: '检查更新',
        icon: getWindowIconOption(),
        autoHideMenuBar: true,
        backgroundColor: '#f9fafb',
        show: false,
        parent: parentWin,
        modal: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    updateWindow = win;
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
