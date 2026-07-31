const { BrowserWindow } = require('electron');
const path = require('path');
const { resolveHtmlPath } = require('./app-paths');
const { getWindowIconOption, applyWindowIcon } = require('./icons');
const { attachUiZoom } = require('./ui-zoom');

/** @type {import('electron').BrowserWindow|null} */
let setupWizardWindow = null;

/** @type {{ forceWizard: boolean }} */
let pendingWizardOpen = {
    forceWizard: true,
};

function focusSetupWizardWindow({ forceWizard } = {}) {
    const win = setupWizardWindow;
    if (!win || win.isDestroyed()) return null;
    pendingWizardOpen = { forceWizard: forceWizard !== false };
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    applyWindowIcon(win);
    const send = () => {
        if (win.isDestroyed() || win.webContents.isDestroyed()) return;
        win.webContents.send('transub-open-setup-wizard', {
            forceWizard: pendingWizardOpen.forceWizard,
        });
    };
    if (win.webContents.isLoading()) {
        win.webContents.once('did-finish-load', () => setTimeout(send, 80));
    } else {
        send();
        setTimeout(send, 120);
    }
    return win;
}

/**
 * Open (or focus) the dedicated setup-wizard BrowserWindow.
 * @param {import('electron').App} app
 * @param {{ parent?: import('electron').BrowserWindow|null, forceWizard?: boolean }} [options]
 */
function openSetupWizardWindow(app, { forceWizard } = {}) {
    pendingWizardOpen = { forceWizard: forceWizard !== false };

    const existing = focusSetupWizardWindow({ forceWizard: pendingWizardOpen.forceWizard });
    if (existing) return { ok: true };

    // Intentionally no `parent`: on Windows, closing an owned child often minimizes
    // the owner, and the main window treats minimize as hide-to-tray.
    const win = new BrowserWindow({
        width: 760,
        height: 860,
        minWidth: 680,
        minHeight: 720,
        title: 'Transub 设置向导',
        icon: getWindowIconOption(),
        autoHideMenuBar: true,
        backgroundColor: '#f9fafb',
        show: false,
        modal: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    setupWizardWindow = win;
    attachUiZoom(win);
    win.setMenuBarVisibility(false);
    win.removeMenu();
    applyWindowIcon(win);

    win.on('closed', () => {
        if (setupWizardWindow === win) setupWizardWindow = null;
    });

    const query = new URLSearchParams({
        standaloneWizard: '1',
        forceWizard: pendingWizardOpen.forceWizard ? '1' : '0',
    });
    win.loadFile(resolveHtmlPath(app, 'index.html'), { search: query.toString() });

    win.once('ready-to-show', () => {
        if (win.isDestroyed()) return;
        applyWindowIcon(win);
        win.show();
        win.focus();
        win.webContents.send('transub-open-setup-wizard', {
            forceWizard: pendingWizardOpen.forceWizard,
        });
        setTimeout(() => {
            if (win.isDestroyed() || win.webContents.isDestroyed()) return;
            win.webContents.send('transub-open-setup-wizard', {
                forceWizard: pendingWizardOpen.forceWizard,
            });
        }, 150);
    });

    return { ok: true };
}

function consumePendingSetupWizardOpen() {
    const pending = { ...pendingWizardOpen };
    pendingWizardOpen = { forceWizard: true };
    return {
        forceWizard: pending.forceWizard !== false,
    };
}

function getSetupWizardWindow() {
    if (setupWizardWindow && !setupWizardWindow.isDestroyed()) return setupWizardWindow;
    return null;
}

module.exports = {
    openSetupWizardWindow,
    consumePendingSetupWizardOpen,
    getSetupWizardWindow,
};
