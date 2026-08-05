const { BrowserWindow } = require('electron');
const path = require('path');
const { resolveHtmlPath } = require('./app-paths');
const { getWindowIconOption, applyWindowIcon } = require('./icons');
const { asString } = require('./ipc-validate');
const { attachUiZoom } = require('./ui-zoom');

/** @type {import('electron').BrowserWindow|null} */
let settingsWindow = null;

/** @type {{ tab: string|null, wizard: boolean, forceWizard: boolean }} */
let pendingSettingsOpen = {
    tab: null,
    wizard: false,
    forceWizard: false,
};

function resolveTab(tab) {
    return asString(tab, 64).trim() || 'runtime';
}

function setPendingOpen({ tab, wizard, forceWizard } = {}) {
    pendingSettingsOpen = {
        tab: resolveTab(tab),
        wizard: !!wizard,
        forceWizard: !!forceWizard,
    };
}

function sendOpenParams(win, { tab, wizard, forceWizard } = {}) {
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
    win.webContents.send('transub-open-params', {
        tab: resolveTab(tab),
        wizard: !!wizard,
        forceWizard: !!forceWizard,
    });
}

function focusSettingsWindow({ tab, wizard, forceWizard } = {}) {
    const win = settingsWindow;
    if (!win || win.isDestroyed()) return null;
    setPendingOpen({ tab, wizard, forceWizard });
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    applyWindowIcon(win);
    const payload = {
        tab: pendingSettingsOpen.tab,
        wizard: pendingSettingsOpen.wizard,
        forceWizard: pendingSettingsOpen.forceWizard,
    };
    const send = () => sendOpenParams(win, payload);
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
 * @param {{ tab?: string, parent?: import('electron').BrowserWindow|null, checkUpdate?: boolean, wizard?: boolean, forceWizard?: boolean }} [options]
 */
function openSettingsWindow(app, { tab, parent: _parent, checkUpdate, wizard, forceWizard } = {}) {
    if (checkUpdate) {
        const { openUpdateWindow } = require('./update-window');
        return openUpdateWindow(app, { parent: _parent, autoCheck: true });
    }

    const resolved = resolveTab(tab);
    setPendingOpen({ tab: resolved, wizard, forceWizard });

    const existing = focusSettingsWindow({
        tab: resolved,
        wizard,
        forceWizard,
    });
    if (existing) {
        return { ok: true };
    }

    // Intentionally no `parent`: on Windows, closing an owned child often minimizes
    // the owner, and the main window treats minimize as hide-to-tray.
    let backgroundColor = '#f9fafb';
    try {
        const { getAppTheme, MAIN_BG } = require('./app-theme');
        backgroundColor = MAIN_BG[getAppTheme()] || backgroundColor;
    } catch (_) { /* ignore */ }
    const win = new BrowserWindow({
        width: 1120,
        height: 820,
        minWidth: 800,
        minHeight: 600,
        title: wizard ? 'Transub 设置向导' : 'Transub 设置',
        icon: getWindowIconOption(),
        autoHideMenuBar: true,
        backgroundColor,
        show: false,
        modal: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    settingsWindow = win;
    attachUiZoom(win);
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
    if (wizard) query.set('wizard', '1');
    if (forceWizard) query.set('forceWizard', '1');

    win.loadFile(resolveHtmlPath(app, 'index.html'), { search: query.toString() });

    win.once('ready-to-show', () => {
        if (win.isDestroyed()) return;
        applyWindowIcon(win);
        win.show();
        win.focus();
        sendOpenParams(win, {
            tab: resolved,
            wizard: !!wizard,
            forceWizard: !!forceWizard,
        });
        setTimeout(() => sendOpenParams(win, {
            tab: resolved,
            wizard: !!wizard,
            forceWizard: !!forceWizard,
        }), 150);
    });

    return { ok: true };
}

function consumePendingSettingsTab() {
    const tab = pendingSettingsOpen.tab;
    const wizard = pendingSettingsOpen.wizard;
    const forceWizard = pendingSettingsOpen.forceWizard;
    pendingSettingsOpen = { tab: null, wizard: false, forceWizard: false };
    return tab || null;
}

function consumePendingSettingsOpen() {
    const pending = { ...pendingSettingsOpen };
    pendingSettingsOpen = { tab: null, wizard: false, forceWizard: false };
    return {
        tab: pending.tab || null,
        wizard: !!pending.wizard,
        forceWizard: !!pending.forceWizard,
    };
}

function getSettingsWindow() {
    if (settingsWindow && !settingsWindow.isDestroyed()) return settingsWindow;
    return null;
}

module.exports = {
    openSettingsWindow,
    consumePendingSettingsTab,
    consumePendingSettingsOpen,
    getSettingsWindow,
};
