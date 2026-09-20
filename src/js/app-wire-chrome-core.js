/**
 * Domain wire facade: chrome install delegates to focused sub-installers.
 * app.js still calls only TransubAppWireChrome.install(host).
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAppWireChrome = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function appWireChromeFactory(global) {
    function resolveInstaller(globalName, requirePath) {
        if (global && global[globalName]) return global[globalName];
        if (typeof require === 'function') {
            try { return require(requirePath); } catch (_) { /* ignore */ }
        }
        return {};
    }

    /**
     * @param {object} host
     * @returns {object} host
     */
    function install(host) {
        const h = host || {};
        resolveInstaller('TransubAppWireChromeShell', './app-wire-chrome-shell-core.js').install?.(h);
        resolveInstaller('TransubAppWireChromeEntitlement', './app-wire-chrome-entitlement-core.js').install?.(h);
        resolveInstaller('TransubAppWireChromeTranslate', './app-wire-chrome-translate-core.js').install?.(h);
        resolveInstaller('TransubAppWireChromeToolbar', './app-wire-chrome-toolbar-core.js').install?.(h);
        resolveInstaller('TransubAppWireChromeSession', './app-wire-chrome-session-core.js').install?.(h);
        resolveInstaller('TransubAppWireChromeIntake', './app-wire-chrome-intake-core.js').install?.(h);
        resolveInstaller('TransubAppWireChromeShelf', './app-wire-chrome-shelf-core.js').install?.(h);
        return h;
    }

    return { install };
}));
