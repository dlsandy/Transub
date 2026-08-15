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
     *   showProActions: boolean,
     * }}
     */
    function computeSelectionToolbarVisibility(input = {}) {
        const selectedCount = Math.max(0, Number(input.selectedCount) || 0);
        const singleHasSubtitle = !!input.singleHasSubtitle;
        const showRetranslate = selectedCount >= 1;
        const showReconstruct = selectedCount === 1 && singleHasSubtitle;
        return {
            // Editor / library stay in the command bar even with an empty list.
            showEditor: true,
            showRetranslate,
            showReconstruct,
            showProActions: showRetranslate || showReconstruct,
        };
    }

    return { computeSelectionToolbarVisibility };
}));
