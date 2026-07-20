const { BrowserWindow } = require('electron');
const path = require('path');
const { resolveHtmlPath } = require('./app-paths');
const { getWindowIconOption, applyWindowIcon } = require('./icons');
const { asString } = require('./ipc-validate');

/** @type {import('electron').BrowserWindow|null} */
let settingsWindow = null;

/** @type {string|null} */
let pendingSettingsTab = null;

function resolveTab(tab) {
    return asString(tab, 64).trim() || 'runtime';
}

function sendOpenTab(win, tab) {
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
    win.webContents.send('transub-open-params', { tab });
}

function focusSettingsWindow(tab) {
    const win = settingsWindow;
    if (!win || win.isDestroyed()) return null;
    const resolved = resolveTab(tab);
    pendingSettingsTab = resolved;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    applyWindowIcon(win);
    const send = () => sendOpenTab(win, resolved);
    if (win.webContents.isLoading()) {
        win.webContents.once('did-finish-load', () => setTimeout(send, 80));
    } else {
        send();
        setTimeout(send, 120);
    }
    return win;
}

/**
 * Open (or focus) the standalone settings window without showing the main task window.
 * @param {import('electron').App} app
 * @param {{ tab?: string, parent?: import('electron').BrowserWindow|null, checkUpdate?: boolean }} [options]
 */
function openSettingsWindow(app, { tab, parent, checkUpdate } = {}) {
    const resolved = resolveTab(tab);
    pendingSettingsTab = resolved;

    const existing = focusSettingsWindow(resolved);
    if (existing) {
        if (checkUpdate) {
            existing.webContents.send('transub-settings-check-update');
        }
        return { ok: true };
    }

    const parentWin = parent && !parent.isDestroyed() ? parent : undefined;
    const win = new BrowserWindow({
        width: 720,
        height: 640,
        minWidth: 560,
        minHeight: 420,
        title: 'Transub 设置',
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

    settingsWindow = win;
    win.setMenuBarVisibility(false);
    win.removeMenu();
    applyWindowIcon(win);

    win.on('closed', () => {
        if (settingsWindow === win) settingsWindow = null;
    });

    const query = new URLSearchParams({
        standaloneSettings: '1',
        tab: resolved,
    });
    if (checkUpdate) query.set('checkUpdate', '1');

    win.loadFile(resolveHtmlPath(app, 'index.html'), { search: query.toString() });

    win.once('ready-to-show', () => {
        if (win.isDestroyed()) return;
        applyWindowIcon(win);
        win.show();
        win.focus();
        sendOpenTab(win, resolved);
        setTimeout(() => sendOpenTab(win, resolved), 150);
        if (checkUpdate) {
            setTimeout(() => {
                if (!win.isDestroyed()) win.webContents.send('transub-settings-check-update');
            }, 400);
        }
    });

    return { ok: true };
}

function consumePendingSettingsTab() {
    const tab = pendingSettingsTab;
    pendingSettingsTab = null;
    return tab || null;
}

function getSettingsWindow() {
    if (settingsWindow && !settingsWindow.isDestroyed()) return settingsWindow;
    return null;
}

module.exports = {
    openSettingsWindow,
    consumePendingSettingsTab,
    getSettingsWindow,
};
