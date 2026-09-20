/**
 * Frameless main-window chrome controls (minimize / maximize / close).
 */
const { BrowserWindow } = require('electron');

function resolveTargetWindow(event, getMainWindow) {
    try {
        const fromWeb = BrowserWindow.fromWebContents(event?.sender);
        if (fromWeb && !fromWeb.isDestroyed()) return fromWeb;
    } catch (_) { /* ignore */ }
    try {
        const main = typeof getMainWindow === 'function' ? getMainWindow() : null;
        if (main && !main.isDestroyed()) return main;
    } catch (_) { /* ignore */ }
    return null;
}

function registerWindowControlsIpc(ipcMain, { getMainWindow } = {}) {
    if (!ipcMain || typeof ipcMain.handle !== 'function') return;

    ipcMain.handle('transub-window-minimize', (event) => {
        const win = resolveTargetWindow(event, getMainWindow);
        if (!win) return { ok: false };
        win.minimize();
        return { ok: true };
    });

    ipcMain.handle('transub-window-toggle-maximize', (event) => {
        const win = resolveTargetWindow(event, getMainWindow);
        if (!win) return { ok: false, maximized: false };
        if (win.isMaximized()) win.unmaximize();
        else win.maximize();
        return { ok: true, maximized: win.isMaximized() };
    });

    ipcMain.handle('transub-window-is-maximized', (event) => {
        const win = resolveTargetWindow(event, getMainWindow);
        if (!win) return { ok: false, maximized: false };
        return { ok: true, maximized: !!win.isMaximized() };
    });

    ipcMain.handle('transub-window-close', (event) => {
        const win = resolveTargetWindow(event, getMainWindow);
        if (!win) return { ok: false };
        win.close();
        return { ok: true };
    });
}

module.exports = {
    registerWindowControlsIpc,
};
