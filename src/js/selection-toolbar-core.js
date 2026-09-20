/**
 * Main-window selection toolbar visibility (pure).
 * Pro / editor actions stay out of the way until the list selection makes them useful.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSelectionToolbar = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function selectionToolbarFactory() {
    /**
     * @param {{
     *   itemCount?: number,
     *   selectedCount?: number,
     *   singleHasSubtitle?: boolean,
     * }} input
     * @returns {{
     *   showEditor: boolean,
     *   showRetranslate: boolean,
     *   showReconstruct: boolean,
     *   showTranslateStyle: boolean,
     *   showProActions: boolean,
     * }}
     * showRetranslate / showReconstruct / showProActions are always false
     * (toolbar buttons removed; use row context menu).
     */
    function computeSelectionToolbarVisibility(input = {}) {
        const selectedCount = Math.max(0, Number(input.selectedCount) || 0);
        const showTranslateStyle = selectedCount >= 1;
        return {
            // Editor / library stay in the command bar even with an empty list.
            showEditor: true,
            // Toolbar 理解重构 / 重新翻译 removed — use row context menu instead.
            showRetranslate: false,
            showReconstruct: false,
            showTranslateStyle,
            showProActions: false,
        };
    }

    return { computeSelectionToolbarVisibility };
}));
