/**
 * Factory main-shell task tabs: 所有 / 进行中 / 已完成 / 失败.
 * 已完成 = status === 'done';
 * 失败 = failed | error | cancelled;
 * 进行中 = everything else;
 * 所有 = no status filter.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubFactoryTaskTab = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function factoryTaskTabFactory() {
    const TAB_ALL = 'all';
    const TAB_ACTIVE = 'active';
    const TAB_DONE = 'done';
    const TAB_FAILED = 'failed';

    function normalizeTab(tab) {
        if (tab === TAB_ACTIVE || tab === TAB_DONE || tab === TAB_FAILED) return tab;
        return TAB_ALL;
    }

    /** @param {string} status */
    function classifyTaskTab(status) {
        const s = String(status || '');
        if (s === 'done') return TAB_DONE;
        if (s === 'failed' || s === 'error' || s === 'cancelled') return TAB_FAILED;
        return TAB_ACTIVE;
    }

    /** @param {{ status?: string } | null | undefined} item */
    function itemMatchesTab(item, tab) {
        const want = normalizeTab(tab);
        if (want === TAB_ALL) return true;
        return classifyTaskTab(item?.status) === want;
    }

    /**
     * @param {Array<{ status?: string }>} items
     * @param {string} tab
     * @returns {number[]} original indices matching tab
     */
    function filterIndicesForTab(items, tab) {
        const list = Array.isArray(items) ? items : [];
        const want = normalizeTab(tab);
        const out = [];
        for (let i = 0; i < list.length; i += 1) {
            if (want === TAB_ALL || classifyTaskTab(list[i]?.status) === want) out.push(i);
        }
        return out;
    }

    /**
     * @param {Array<{ status?: string }>} items
     * @param {string} tab
     */
    function filterItemsForTab(items, tab) {
        const list = Array.isArray(items) ? items : [];
        return filterIndicesForTab(list, tab).map((i) => list[i]);
    }

    /** @param {Array<{ status?: string }>} items */
    function countTabs(items) {
        const list = Array.isArray(items) ? items : [];
        let active = 0;
        let done = 0;
        let failed = 0;
        let running = 0;
        for (let i = 0; i < list.length; i += 1) {
            const st = String(list[i]?.status || '');
            if (st === 'running') running += 1;
            const bucket = classifyTaskTab(st);
            if (bucket === TAB_DONE) done += 1;
            else if (bucket === TAB_FAILED) failed += 1;
            else active += 1;
        }
        return {
            all: list.length,
            active,
            done,
            failed,
            running,
            total: list.length,
        };
    }

    /**
     * @param {{
     *   total?: number,
     *   running?: number,
     *   engineLabel?: string,
     * }} [input]
     */
    function buildTabsSummary(input = {}) {
        const total = Math.max(0, Number(input.total) || 0);
        const running = Math.max(0, Number(input.running) || 0);
        const engine = String(input.engineLabel || '就绪').trim() || '就绪';
        return `${total} 个任务 · ${running} 运行中 · Engine ${engine}`;
    }

    return {
        TAB_ALL,
        TAB_ACTIVE,
        TAB_DONE,
        TAB_FAILED,
        normalizeTab,
        classifyTaskTab,
        itemMatchesTab,
        filterIndicesForTab,
        filterItemsForTab,
        countTabs,
        buildTabsSummary,
    };
}));
