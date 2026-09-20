/**
 * Factory chrome menu open/close coordination.
 * Shell injects per-menu setters via createAppMenuCoord(deps).
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAppMenuCoord = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function appMenuCoordFactory(global) {
    /** Canonical sibling menu keys closed by closeSiblingMenus. */
    const SIBLING_MENU_KEYS = [
        'add',
        'postTask',
        'more',
        'clearList',
        'translate',
        'translateMode',
        'mt',
        'qc',
        'params',
        'paramsMore',
        'expert',
        'bilingual',
        'style',
        'models',
    ];

    /**
     * @param {object} deps shell adapters — menu open setters + state/els for more menu
     */
    function createAppMenuCoord(deps) {
        const d = deps || {};
        const state = d.state || {};
        const els = d.els || {};

        const setters = {
            add: d.setAddMenuOpen || (() => {}),
            postTask: d.setPostTaskMenuOpen || (() => {}),
            more: null, // wired below after setMoreMenuOpen defined
            clearList: d.setClearListMenuOpen || (() => {}),
            translate: d.setTranslateMenuOpen || (() => {}),
            translateMode: d.setTranslateModeMenuOpen || (() => {}),
            mt: d.setMtModelMenuOpen || (() => {}),
            qc: d.setPostBatchQcFixMenuOpen || (() => {}),
            params: d.setParamsModeMenuOpen || (() => {}),
            paramsMore: d.setParamsMoreMenuOpen || (() => {}),
            expert: d.setExpertExtrasMenuOpen || (() => {}),
            bilingual: d.setBilingualMenuOpen || (() => {}),
            style: d.setTranslateStyleMenuOpen || (() => {}),
            models: d.setModelsMenuOpen || (() => {}),
        };

        /**
         * Close all sibling factory menus except optional key(s).
         * Callers that are opening a menu MUST pass that menu's key as `except`
         * (e.g. closeSiblingMenus('clearList')), or the open will immediately
         * re-close itself — clearList / style keys are in SIBLING_MENU_KEYS.
         * @param {string|string[]|null} [except] menu key(s) to leave alone
         */
        function closeSiblingMenus(except) {
            const skip = new Set(
                except == null
                    ? []
                    : (Array.isArray(except) ? except : [except]).map(String),
            );
            for (const key of SIBLING_MENU_KEYS) {
                if (skip.has(key)) continue;
                const fn = setters[key];
                if (typeof fn === 'function') fn(false);
            }
        }

        function setMoreMenuOpen(open) {
            state.moreMenuOpen = !!open;
            els.moreMenu?.classList.toggle('hidden', !open);
            if (els.moreMenuBtn) {
                els.moreMenuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
            }
            if (open) {
                closeSiblingMenus('more');
            }
        }

        setters.more = d.setMoreMenuOpen || setMoreMenuOpen;

        return {
            SIBLING_MENU_KEYS,
            setMoreMenuOpen,
            closeSiblingMenus,
        };
    }

    return { createAppMenuCoord, SIBLING_MENU_KEYS };
}));
