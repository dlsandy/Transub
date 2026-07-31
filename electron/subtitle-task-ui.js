/**
 * Shared subtitle-task UI helpers for engine + TWAI batch bridges.
 */

function getMainWebContents(windowManager) {
    const win = windowManager?.getMainWindow?.();
    if (!win || win.isDestroyed()) return null;
    const wc = win.webContents;
    if (!wc || wc.isDestroyed()) return null;
    return wc;
}

function isSameWebContents(a, b) {
    if (!a || !b || a.isDestroyed() || b.isDestroyed()) return false;
    return a.id === b.id;
}

function waitForWebContentsReady(webContents, { timeoutMs = 5000 } = {}) {
    if (!webContents || webContents.isDestroyed()) {
        return Promise.resolve(false);
    }
    if (!webContents.isLoading()) {
        return Promise.resolve(true);
    }
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(true), Math.max(0, Number(timeoutMs) || 5000));
        webContents.once('did-finish-load', () => {
            clearTimeout(timer);
            resolve(true);
        });
    });
}

function notifySubtitleTask(windowManager, channel, payload) {
    if (!windowManager?.sendToRenderer) return false;
    return windowManager.sendToRenderer(channel, payload);
}

function broadcastToSubtitleTaskUi(windowManager, invokeSender, channel, payload) {
    notifySubtitleTask(windowManager, channel, payload);
    if (!invokeSender || invokeSender.isDestroyed()) return;
    const mainWc = getMainWebContents(windowManager);
    if (mainWc && isSameWebContents(invokeSender, mainWc)) return;
    try {
        invokeSender.send(channel, payload);
    } catch { /* ignore */ }
}

/**
 * Ensure main window exists (optionally minimized) and wait for renderer ready.
 */
async function notifySubtitleTaskJobStart(windowManager, payload, {
    minimizeToTray = true,
    invokeSender = null,
} = {}) {
    try {
        if (minimizeToTray && windowManager?.createMainWindow) {
            windowManager.createMainWindow({ startMinimizedToTray: true });
        }
    } catch { /* ignore */ }
    const wc = getMainWebContents(windowManager);
    if (wc) await waitForWebContentsReady(wc);
    broadcastToSubtitleTaskUi(
        windowManager,
        invokeSender,
        'subtitle-task-job-start',
        payload,
    );
}

module.exports = {
    getMainWebContents,
    isSameWebContents,
    waitForWebContentsReady,
    notifySubtitleTask,
    broadcastToSubtitleTaskUi,
    notifySubtitleTaskJobStart,
};
