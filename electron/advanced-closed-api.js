/**
 * Resolve closed Pro smart-translate helpers.
 * Unpackaged: gitignored `advanced-smart-translate-core.js`.
 * Packaged: `_advanced` blob `helpers` (asar never contains those sources).
 */
function loadClosedSmartTranslateCore() {
    try {
        return require('../src/js/advanced-smart-translate-core');
    } catch (_) { /* packaged / missing closed sources */ }
    try {
        const { loadAdvancedModule } = require('./advanced-module-loader');
        const res = loadAdvancedModule();
        const helpers = res?.module?.helpers;
        if (helpers && typeof helpers === 'object') return helpers;
        const mod = res?.module;
        if (mod && typeof mod.partitionDeterministicCues === 'function') return mod;
    } catch (_) { /* optional */ }
    return null;
}

/**
 * Resolve closed Pro context-reconstruct helpers (chunking + JSON parse).
 * Unpackaged: gitignored `advanced-context-reconstruct-core.js`.
 * Packaged: `_advanced` blob `helpers` / `contextReconstructCore`.
 */
function loadClosedContextReconstructCore() {
    try {
        return require('../src/js/advanced-context-reconstruct-core');
    } catch (_) { /* packaged / missing closed sources */ }
    try {
        const { loadAdvancedModule } = require('./advanced-module-loader');
        const res = loadAdvancedModule();
        const mod = res?.module;
        const dedicated = mod?.contextReconstructCore;
        if (dedicated && typeof dedicated.chunkCues === 'function') return dedicated;
        const helpers = mod?.helpers;
        if (helpers && typeof helpers.chunkCues === 'function') return helpers;
        if (mod && typeof mod.chunkCues === 'function') return mod;
    } catch (_) { /* optional */ }
    return null;
}

/**
 * Resolve closed Hy-MT2 30B Heretic APEX catalog (Mini / Compact / Quality).
 * Unpackaged: gitignored `hy-mt2-30b-heretic-catalog-core.js`.
 * Packaged: `_advanced` blob `helpers` / `hyMt230bHereticCatalog`.
 */
function loadClosedHyMt230bHereticCatalog() {
    try {
        return require('../src/js/hy-mt2-30b-heretic-catalog-core');
    } catch (_) { /* packaged / missing closed sources */ }
    try {
        const { loadAdvancedModule } = require('./advanced-module-loader');
        const res = loadAdvancedModule();
        const mod = res?.module;
        const dedicated = mod?.hyMt230bHereticCatalog;
        if (dedicated && typeof dedicated.listCatalogEntries === 'function') return dedicated;
        const helpers = mod?.helpers;
        if (helpers && typeof helpers.listHyMt230bHereticCatalogEntries === 'function') {
            return {
                listCatalogEntries: (...args) => helpers.listHyMt230bHereticCatalogEntries(...args),
                findCatalogEntry: (...args) => (
                    typeof helpers.findHyMt230bHereticCatalogEntry === 'function'
                        ? helpers.findHyMt230bHereticCatalogEntry(...args)
                        : null
                ),
                CATALOG: helpers.listHyMt230bHereticCatalogEntries(),
            };
        }
    } catch (_) { /* optional */ }
    return null;
}

/** Install global so renderer / sakura UMD soft-merge can see proprietary rows. */
function installClosedHyMt230bHereticCatalogGlobal() {
    const api = loadClosedHyMt230bHereticCatalog();
    if (api && typeof globalThis !== 'undefined') {
        globalThis.TransubHyMt230bHereticCatalog = api;
    }
    return api;
}

module.exports = {
    loadClosedSmartTranslateCore,
    loadClosedContextReconstructCore,
    loadClosedHyMt230bHereticCatalog,
    installClosedHyMt230bHereticCatalogGlobal,
};
