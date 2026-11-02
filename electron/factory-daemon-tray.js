/**
 * Minimal tray for --factory-daemon (no main BrowserWindow).
 */
const { Tray, Menu, app } = require('electron');
const { getTrayIcon } = require('./icons');

/** @type {import('electron').Tray | null} */
let tray = null;

/**
 * @param {{
 *   onOpenMain?: () => void,
 *   onQuit?: () => void,
 * }} hooks
 */
function setupFactoryDaemonTray(hooks = {}) {
    destroyFactoryDaemonTray();
    try {
        tray = new Tray(getTrayIcon());
    } catch (err) {
        console.warn('[factory-daemon] tray icon failed:', err?.message || err);
        return null;
    }
    tray.setToolTip('Transub 引擎（后台）');
    const rebuild = () => {
        const menu = Menu.buildFromTemplate([
            {
                label: '打开主界面',
                click: () => {
                    try { hooks.onOpenMain?.(); } catch (_) { /* ignore */ }
                },
            },
            { type: 'separator' },
            {
                label: '退出引擎',
                click: () => {
                    try {
                        if (typeof hooks.onQuit === 'function') hooks.onQuit();
                        else app.quit();
                    } catch (_) {
                        app.quit();
                    }
                },
            },
        ]);
        tray.setContextMenu(menu);
    };
    rebuild();
    tray.on('double-click', () => {
        try { hooks.onOpenMain?.(); } catch (_) { /* ignore */ }
    });
    return tray;
}

function destroyFactoryDaemonTray() {
    if (!tray) return;
    try { tray.destroy(); } catch (_) { /* ignore */ }
    tray = null;
}

module.exports = {
    setupFactoryDaemonTray,
    destroyFactoryDaemonTray,
};
