/**
 * 字幕列表窗口化：按滚动位置计算应渲染的可见索引范围
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubCueListWindow = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function cueListWindowCoreFactory() {
    const DEFAULT_ROW_HEIGHT = 36;
    const DEFAULT_OVERSCAN = 12;
    /** Below this count, full render is cheaper than bookkeeping */
    const VIRTUALIZE_THRESHOLD = 180;

    function shouldVirtualize(totalVisible, threshold = VIRTUALIZE_THRESHOLD) {
        return (Number(totalVisible) || 0) >= (Number(threshold) || VIRTUALIZE_THRESHOLD);
    }

    /**
     * @returns {{ start: number, end: number, topPad: number, bottomPad: number, rowHeight: number }}
     */
    function computeWindow({
        scrollTop = 0,
        viewportHeight = 400,
        total = 0,
        rowHeight = DEFAULT_ROW_HEIGHT,
        overscan = DEFAULT_OVERSCAN,
    } = {}) {
        const rh = Math.max(16, Number(rowHeight) || DEFAULT_ROW_HEIGHT);
        const n = Math.max(0, Math.floor(Number(total) || 0));
        const vh = Math.max(0, Number(viewportHeight) || 0);
        const st = Math.max(0, Number(scrollTop) || 0);
        const ov = Math.max(0, Math.floor(Number(overscan) || DEFAULT_OVERSCAN));

        if (!n) {
            return { start: 0, end: 0, topPad: 0, bottomPad: 0, rowHeight: rh };
        }

        const first = Math.max(0, Math.floor(st / rh) - ov);
        const visibleCount = Math.ceil(vh / rh) + ov * 2;
        const start = Math.min(n, first);
        const end = Math.min(n, start + Math.max(1, visibleCount));
        return {
            start,
            end,
            topPad: start * rh,
            bottomPad: Math.max(0, (n - end) * rh),
            rowHeight: rh,
        };
    }

    /**
     * Scroll offset that keeps `index` visible (nearest / start / center).
     * `index` is the row position in the currently filtered list (0..total-1).
     */
    function scrollTopForIndex({
        index = 0,
        total = 0,
        viewportHeight = 400,
        rowHeight = DEFAULT_ROW_HEIGHT,
        currentScrollTop = 0,
        align = 'nearest',
    } = {}) {
        const rh = Math.max(16, Number(rowHeight) || DEFAULT_ROW_HEIGHT);
        const n = Math.max(0, Math.floor(Number(total) || 0));
        const vh = Math.max(0, Number(viewportHeight) || 0);
        if (!n) return 0;
        const idx = Math.max(0, Math.min(n - 1, Math.floor(Number(index) || 0)));
        const rowTop = idx * rh;
        const rowBottom = rowTop + rh;
        let st = Math.max(0, Number(currentScrollTop) || 0);
        if (align === 'center') {
            st = rowTop - Math.max(0, (vh - rh) / 2);
        } else if (align === 'start') {
            st = rowTop;
        } else if (rowTop < st) {
            st = rowTop;
        } else if (rowBottom > st + vh) {
            st = rowBottom - vh;
        }
        const maxScroll = Math.max(0, n * rh - vh);
        return Math.max(0, Math.min(maxScroll, st));
    }

    return {
        DEFAULT_ROW_HEIGHT,
        DEFAULT_OVERSCAN,
        VIRTUALIZE_THRESHOLD,
        shouldVirtualize,
        computeWindow,
        scrollTopForIndex,
    };
}));
