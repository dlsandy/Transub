/**
 * Runtime hooks so options save can refresh tray/menus after uiLocale changes.
 */
/** @type {Set<() => void>} */
const trayRebuilders = new Set();

function registerTrayRebuilder(fn) {
    if (typeof fn === 'function') trayRebuilders.add(fn);
    return () => trayRebuilders.delete(fn);
}

function rebuildTrayMenus() {
    trayRebuilders.forEach((fn) => {
        try { fn(); } catch { /* ignore */ }
    });
}

module.exports = {
    registerTrayRebuilder,
    rebuildTrayMenus,
};
