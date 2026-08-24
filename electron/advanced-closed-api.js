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

module.exports = {
    loadClosedSmartTranslateCore,
    loadClosedContextReconstructCore,
};
