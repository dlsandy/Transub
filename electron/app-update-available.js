/**
 * Remember / broadcast “app update available” so the main titlebar can show a badge.
 */

/** @type {{ updateAvailable: boolean, latestVersion: string, currentVersion: string }|null} */
let lastNotice = null;

function getElectron() {
    try {
        return require('electron');
    } catch {
        return null;
    }
}

/**
 * @param {{ ok?: boolean, updateAvailable?: boolean, latestVersion?: string, currentVersion?: string }|null|undefined} result
 */
function rememberAppUpdateCheckResult(result) {
    if (!result || result.ok === false) return lastNotice;
    const updateAvailable = !!result.updateAvailable;
    lastNotice = {
        updateAvailable,
        latestVersion: updateAvailable ? String(result.latestVersion || '').trim() : '',
        currentVersion: String(result.currentVersion || '').trim(),
    };
    broadcastAppUpdateAvailable(lastNotice);
    return lastNotice;
}

/**
 * @param {{ updateAvailable?: boolean, latestVersion?: string, currentVersion?: string }|null|undefined} [payload]
 */
function broadcastAppUpdateAvailable(payload) {
    const notice = payload && typeof payload === 'object'
        ? {
            updateAvailable: !!payload.updateAvailable,
            latestVersion: String(payload.latestVersion || '').trim(),
            currentVersion: String(payload.currentVersion || '').trim(),
        }
        : (lastNotice || { updateAvailable: false, latestVersion: '', currentVersion: '' });

    const BrowserWindow = getElectron()?.BrowserWindow;
    if (!BrowserWindow) return;
    try {
        for (const win of BrowserWindow.getAllWindows()) {
            if (!win || win.isDestroyed() || win.webContents?.isDestroyed?.()) continue;
            try {
                win.webContents.send('transub-app-update-available', notice);
            } catch { /* ignore */ }
        }
    } catch { /* ignore */ }
}

function getAppUpdateAvailability() {
    return lastNotice || { updateAvailable: false, latestVersion: '', currentVersion: '' };
}

module.exports = {
    rememberAppUpdateCheckResult,
    broadcastAppUpdateAvailable,
    getAppUpdateAvailability,
};
