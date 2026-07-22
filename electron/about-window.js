const { BrowserWindow } = require('electron');
const path = require('path');
const { resolveHtmlPath } = require('./app-paths');
const { getWindowIconOption, applyWindowIcon } = require('./icons');

/** @type {import('electron').BrowserWindow|null} */
let aboutWindow = null;

function focusAboutWindow() {
    const win = aboutWindow;
    if (!win || win.isDestroyed()) return null;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    applyWindowIcon(win);
    return win;
}

/**
 * Open (or focus) the About Transub window.
 * @param {import('electron').App} app
 * @param {{ parent?: import('electron').BrowserWindow|null }} [options]
 */
function openAboutWindow(app, { parent } = {}) {
    const existing = focusAboutWindow();
    if (existing) return { ok: true };

    const parentWin = parent && !parent.isDestroyed() ? parent : undefined;
    const win = new BrowserWindow({
        width: 420,
        height: 400,
        minWidth: 360,
        minHeight: 340,
        resizable: true,
        maximizable: false,
        title: '关于 Transub',
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

    aboutWindow = win;
    win.setMenuBarVisibility(false);
    win.removeMenu();
    applyWindowIcon(win);

    win.on('closed', () => {
        if (aboutWindow === win) aboutWindow = null;
    });

    win.loadFile(resolveHtmlPath(app, 'about.html'));

    win.once('ready-to-show', () => {
        if (win.isDestroyed()) return;
        applyWindowIcon(win);
        win.show();
        win.focus();
    });

    return { ok: true };
}

function getAboutWindow() {
    if (aboutWindow && !aboutWindow.isDestroyed()) return aboutWindow;
    return null;
}

module.exports = {
    openAboutWindow,
    getAboutWindow,
};
