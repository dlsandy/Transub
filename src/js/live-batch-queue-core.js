/**
 * Pure helpers for mid-run task list add/remove (main window).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubLiveBatchQueue = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function liveBatchQueueFactory() {
    /**
     * @param {object} item
     * @param {{ running?: boolean, retranslateBusy?: boolean }} [opts]
     */
    function canRemoveTaskItem(item, opts = {}) {
        if (opts.retranslateBusy) return false;
        if (!item) return false;
        if (opts.running && String(item.status || '') === 'running') return false;
        return true;
    }

    /**
     * @param {object[]} items
     * @param {{ running?: boolean, retranslateBusy?: boolean }} [opts]
     * @returns {{ removable: object[], blocked: object[] }}
     */
    function partitionSelectedForRemove(items, opts = {}) {
        const list = Array.isArray(items) ? items : [];
        const removable = [];
        const blocked = [];
        for (const item of list) {
            if (!item?.selected) continue;
            if (canRemoveTaskItem(item, opts)) removable.push(item);
            else blocked.push(item);
        }
        return { removable, blocked };
    }

    /**
     * Paths that still need a live-batch skip (upcoming / not finished).
     * @param {object[]} items
     * @param {(p: string) => string} [normPath]
     */
    function pathsNeedingBatchSkip(items, normPath) {
        const norm = typeof normPath === 'function'
            ? normPath
            : (p) => String(p || '').trim().toLowerCase();
        const out = [];
        const seen = new Set();
        for (const item of Array.isArray(items) ? items : []) {
            const status = String(item?.status || '');
            if (status === 'done' || status === 'skipped' || status === 'cancelled'
                || status === 'failed' || status === 'error' || status === 'running') {
                continue;
            }
            const p = String(item?.path || '').trim();
            if (!p) continue;
            const key = norm(p);
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(p);
        }
        return out;
    }

    /**
     * Build append payload rows for the main-process live batch.
     * @param {object[]} items
     * @param {(item: object) => object|undefined} [senseOverridesForJob]
     */
    function buildAppendPayloadItems(items, senseOverridesForJob) {
        const list = Array.isArray(items) ? items : [];
        return list.map((item) => ({
            fullPath: String(item?.path || '').trim(),
            durationSec: Math.max(0, Number(item?.duration) || 0),
            optionOverrides: typeof senseOverridesForJob === 'function'
                ? senseOverridesForJob(item)
                : undefined,
        })).filter((row) => row.fullPath);
    }

    return {
        canRemoveTaskItem,
        partitionSelectedForRemove,
        pathsNeedingBatchSkip,
        buildAppendPayloadItems,
    };
}));
