/**
 * Push Pro entitlement changes to every renderer.
 * Settings is a separate window; its local TransubCore update does not reach the main window.
 */
function broadcastAdvancedEntitlementChanged(status) {
    let BrowserWindow;
    try {
        ({ BrowserWindow } = require('electron'));
    } catch (_) {
        return;
    }
    const free = status?.freePipelineTranslate;
    const payload = {
        entitled: !!status?.entitled,
        freePipelineTranslate: (free && typeof free === 'object')
            ? {
                ok: !!free.ok,
                modelId: String(free.modelId || ''),
                message: String(free.message || ''),
                reason: String(free.reason || ''),
            }
            : { ok: false },
    };
    try {
        for (const win of BrowserWindow.getAllWindows()) {
            if (!win || win.isDestroyed() || win.webContents?.isDestroyed?.()) continue;
            try {
                win.webContents.send('transub-advanced-entitlement-changed', payload);
            } catch (_) { /* ignore */ }
        }
    } catch (_) { /* ignore */ }
}

module.exports = {
    broadcastAdvancedEntitlementChanged,
};
