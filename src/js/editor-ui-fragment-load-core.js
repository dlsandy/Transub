/**
 * Subtitle editor — ensure deferred modal markup is injected before cacheEls / bind.
 * Thin wrapper over TransubUiFragmentLoad.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubEditorUiFragments = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function editorUiFragmentLoadFactory(global) {
    function getLoader() {
        return global.TransubUiFragmentLoad
            || (typeof module !== 'undefined' && module.exports && require('./ui-fragment-load-core.js'))
            || null;
    }

    async function ensureEditorModalDom() {
        const loader = getLoader();
        if (!loader?.ensureEditorModalDom && !loader?.ensureUiFragment) {
            throw new Error('TransubUiFragmentLoad missing');
        }
        if (typeof loader.ensureEditorModalDom === 'function') {
            await loader.ensureEditorModalDom();
            return;
        }
        const keys = loader.EDITOR_MODAL_FRAGMENT_KEYS || [
            'editor-modals-drawers',
            'editor-modals-tools',
            'editor-modals-pro',
        ];
        await Promise.all(keys.map((k) => loader.ensureUiFragment(k)));
    }

    function isReady() {
        const loader = getLoader();
        if (!loader?.isReady) return false;
        const keys = loader.EDITOR_MODAL_FRAGMENT_KEYS || [
            'editor-modals-drawers',
            'editor-modals-tools',
            'editor-modals-pro',
        ];
        return keys.every((k) => loader.isReady(k));
    }

    return {
        ensureEditorModalDom,
        isReady,
    };
}));
