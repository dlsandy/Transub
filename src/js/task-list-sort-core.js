/**
 * Task list column sort helpers for the main batch window.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubTaskListSort = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function taskListSortFactory() {
    const TASK_STATUS_SORT_RANK = Object.freeze({
        pending: 0,
        probing: 1,
        ready: 2,
        running: 3,
        done: 4,
        skipped: 5,
        cancelled: 6,
        failed: 7,
        error: 8,
    });

    /**
     * @param {object} item
     * @param {string} key
     * @param {{
     *   basename?: (p: string) => string,
     *   itemElapsedSec?: (item: object) => number,
     *   statusRank?: Record<string, number>,
     * }} [helpers]
     */
    function listSortValue(item, key, helpers = {}) {
        const basename = helpers.basename
            || ((p) => String(p || '').split(/[/\\]/).pop() || '');
        const itemElapsedSec = helpers.itemElapsedSec
            || (() => 0);
        const rank = helpers.statusRank || TASK_STATUS_SORT_RANK;
        switch (key) {
            case 'file':
                return basename(item?.path).toLocaleLowerCase('zh-CN');
            case 'duration':
                return Number(item?.duration) || 0;
            case 'elapsed':
                return itemElapsedSec(item);
            case 'progress': {
                const pct = Number(item?.progress);
                if (Number.isFinite(pct)) return pct;
                const total = Number(item?.duration) || Number(item?.processedTotalSec) || 0;
                const processed = Number(item?.processedSec) || 0;
                if (total > 0 && processed > 0) return (processed / total) * 100;
                return processed > 0 ? 100 : 0;
            }
            case 'status':
                return rank[item?.status] ?? 50;
            case 'qc': {
                if (item?.qcError) return -1;
                if (!Number.isFinite(Number(item?.qcIssueCount))) return -2;
                return Number(item.qcIssueCount) || 0;
            }
            default:
                return '';
        }
    }

    function compareListSortValues(a, b, key, helpers = {}) {
        const va = listSortValue(a, key, helpers);
        const vb = listSortValue(b, key, helpers);
        if (typeof va === 'number' && typeof vb === 'number') {
            return va - vb;
        }
        return String(va).localeCompare(String(vb), 'zh-CN', { numeric: true, sensitivity: 'base' });
    }

    /** Toggle asc/desc when clicking the same column header. */
    function nextListSortState(current, key) {
        const cur = current && typeof current === 'object' ? current : null;
        const dir = (cur && cur.key === key && cur.dir === 'asc') ? 'desc' : 'asc';
        return { key, dir };
    }

    /**
     * Sort a copy of items; returns whether order changed vs previous reference order.
     * @returns {{ items: object[], changed: boolean, prev: object[] }}
     */
    function sortTaskItems(items, sort, helpers = {}) {
        const list = Array.isArray(items) ? items.slice() : [];
        const prev = list.slice();
        if (!sort?.key || list.length < 2) {
            return { items: list, changed: false, prev };
        }
        const basename = helpers.basename
            || ((p) => String(p || '').split(/[/\\]/).pop() || '');
        const mult = sort.dir === 'asc' ? 1 : -1;
        const key = sort.key;
        list.sort((a, b) => {
            const cmp = compareListSortValues(a, b, key, helpers);
            if (cmp !== 0) return cmp * mult;
            return basename(a.path).localeCompare(basename(b.path), 'zh-CN');
        });
        let changed = false;
        for (let i = 0; i < prev.length; i += 1) {
            if (prev[i] !== list[i]) {
                changed = true;
                break;
            }
        }
        return { items: list, changed, prev };
    }

    return {
        TASK_STATUS_SORT_RANK,
        listSortValue,
        compareListSortValues,
        nextListSortState,
        sortTaskItems,
    };
}));
