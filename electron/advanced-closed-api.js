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

module.exports = {
    loadClosedSmartTranslateCore,
};
