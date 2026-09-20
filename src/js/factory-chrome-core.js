/**
 * Factory shell chrome helpers (workspace nav ids / product display names).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubFactoryChrome = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function factoryChromeFactory() {
    const WORKSPACE_QUEUE = 'queue';
    const WORKSPACE_SCENES = 'scenes';
    const WORKSPACE_SHELF = 'shelf';
    const WORKSPACE_MODELS = 'models';
    const WORKSPACE_BURN = 'burn';
    const PRODUCT_DISPLAY_NAME = 'Transub 字幕工厂';
    const PRODUCT_SHORT_NAME = '字幕工厂';

    function normalizeWorkspace(id) {
        const key = String(id || '').trim().toLowerCase();
        if (key === WORKSPACE_SCENES || key === 'scene' || key === 'scene-presets' || key === 'presets') {
            return WORKSPACE_SCENES;
        }
        if (key === WORKSPACE_SHELF || key === 'library' || key === 'subtitle-library') {
            return WORKSPACE_SHELF;
        }
        if (key === WORKSPACE_MODELS || key === 'model' || key === 'model-mgmt' || key === 'models-library') {
            return WORKSPACE_MODELS;
        }
        if (key === WORKSPACE_BURN || key === 'burnin' || key === 'burn-in' || key === 'hardsub') {
            return WORKSPACE_BURN;
        }
        return WORKSPACE_QUEUE;
    }

    /**
     * @param {boolean} entitled
     * @returns {string} window / document title (Pro is a badge, not a product rename)
     */
    function productWindowTitle(_entitled) {
        return PRODUCT_DISPLAY_NAME;
    }

    return {
        WORKSPACE_QUEUE,
        WORKSPACE_SCENES,
        WORKSPACE_SHELF,
        WORKSPACE_MODELS,
        WORKSPACE_BURN,
        PRODUCT_DISPLAY_NAME,
        PRODUCT_SHORT_NAME,
        normalizeWorkspace,
        productWindowTitle,
    };
}));
