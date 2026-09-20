/**
 * Lazy-load settings #paramsModal markup — thin wrapper over TransubUiFragmentLoad.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSettingsDomLoad = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function settingsDomLoadFactory(global) {
    function getLoader() {
        return global.TransubUiFragmentLoad
            || (typeof module !== 'undefined' && module.exports && require('./ui-fragment-load-core.js'))
            || null;
    }

    async function ensureSettingsDom() {
        const loader = getLoader();
        if (!loader?.ensureUiFragment) {
            throw new Error('TransubUiFragmentLoad missing');
        }
        await loader.ensureUiFragment('settings-panels');
        return global.document?.getElementById?.('paramsModal') || null;
    }

    function isReady() {
        const loader = getLoader();
        if (loader?.isReady) return loader.isReady('settings-panels');
        const modal = global.document?.getElementById?.('paramsModal');
        return !!(modal && modal.getAttribute('data-settings-dom') !== 'pending'
            && modal.getAttribute('data-ui-fragment') !== 'pending');
    }

    return {
        ensureSettingsDom,
        isReady,
    };
}));
