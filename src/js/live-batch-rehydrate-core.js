/**
 * Rehydrate main-window task list from live-batch snapshot after renderer restart
 * (e.g. tray blank-surface reload) while the main-process batch is still running.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubLiveBatchRehydrate = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function liveBatchRehydrateFactory() {
    /**
     * @param {string} p
     * @returns {string}
     */
    function defaultNormPath(p) {
        return String(p || '').trim().toLowerCase();
    }

    /**
     * @param {{
     *   active?: boolean,
     *   paths?: string[],
     *   current?: string,
     *   currentIndex1?: number,
     *   total?: number,
     *   skipped?: string[],
     * }|null|undefined} snapshot
     * @param {{ items?: object[] }|null|undefined} state
     * @returns {boolean}
     */
    function shouldRehydrateFromSnapshot(snapshot, state) {
        if (!snapshot || !snapshot.active) return false;
        const paths = Array.isArray(snapshot.paths) ? snapshot.paths.filter(Boolean) : [];
        if (!paths.length) return false;
        const items = Array.isArray(state?.items) ? state.items : [];
        return items.length === 0;
    }

    /**
     * Build UI rows from a live-batch snapshot (paths only — progress patches arrive later).
     * @param {{
     *   paths?: string[],
     *   current?: string,
     *   skipped?: string[],
     * }} snapshot
     * @param {{ normPath?: (p: string) => string, normKey?: (p: string) => string }} [opts]
     * @returns {object[]}
     */
    function buildItemsFromLiveBatchSnapshot(snapshot, opts = {}) {
        const norm = typeof opts.normPath === 'function'
            ? opts.normPath
            : (typeof opts.normKey === 'function' ? opts.normKey : defaultNormPath);
        const paths = Array.isArray(snapshot?.paths) ? snapshot.paths.filter(Boolean) : [];
        const currentKey = norm(snapshot?.current || '');
        const skipped = new Set(
            (Array.isArray(snapshot?.skipped) ? snapshot.skipped : []).map((k) => norm(k)),
        );
        return paths.map((fullPath) => {
            const key = norm(fullPath);
            if (skipped.has(key)) {
                return {
                    path: fullPath,
                    selected: false,
                    status: 'skipped',
                    progress: 100,
                    processedSec: 0,
                    processedTotalSec: 0,
                    detail: '已跳过',
                    duration: 0,
                };
            }
            const isCurrent = currentKey && key === currentKey;
            return {
                path: fullPath,
                selected: !isCurrent,
                status: isCurrent ? 'running' : 'pending',
                progress: isCurrent ? 1 : 0,
                processedSec: 0,
                processedTotalSec: 0,
                detail: isCurrent ? '进行中…' : '等待中',
                duration: 0,
                ...(isCurrent ? { startedAt: Date.now(), stage: 'starting' } : {}),
            };
        });
    }

    /**
     * Apply snapshot onto renderer state. Returns true when items were restored.
     * @param {object} state
     * @param {object} snapshot
     * @param {{ normPath?: (p: string) => string }} [opts]
     * @returns {boolean}
     */
    function applyLiveBatchSnapshotToState(state, snapshot, opts = {}) {
        if (!state || !shouldRehydrateFromSnapshot(snapshot, state)) return false;
        const items = buildItemsFromLiveBatchSnapshot(snapshot, opts);
        if (!items.length) return false;
        state.items = items;
        state.running = true;
        state.total = Number(snapshot.total) || items.length;
        state.index = Math.max(0, Number(snapshot.currentIndex1) || 0);
        state.activePath = String(snapshot.current || '').trim();
        if (!state.jobStartedAt) state.jobStartedAt = Date.now();
        return true;
    }

    /**
     * @param {object} deps
     */
    function createLiveBatchRehydrate(deps) {
        const d = deps || {};
        const state = d.state;
        const electron = d.electron;
        const normPath = d.normPath || defaultNormPath;
        const renderList = d.renderList || (() => {});
        const updateProgressUi = d.updateProgressUi || (() => {});
        const updateStartButton = d.updateStartButton || (() => {});
        const setBadge = d.setBadge || (() => {});
        const startElapsedTicker = d.startElapsedTicker || (() => {});
        const syncEngineModelsBrowseOnlyFromTaskState = d.syncEngineModelsBrowseOnlyFromTaskState
            || (() => {});
        const appendLog = d.appendLog || (() => {});
        const getIsStandaloneChrome = d.getIsStandaloneChrome || (() => false);

        /**
         * Fetch live-batch snapshot and restore empty task list if main still has a batch.
         * @returns {Promise<boolean>}
         */
        async function rehydrateFromLiveBatchIfNeeded() {
            if (getIsStandaloneChrome()) return false;
            if (!state || (Array.isArray(state.items) && state.items.length > 0)) return false;
            if (typeof electron?.transubLiveBatchSnapshot !== 'function') return false;
            let snap;
            try {
                snap = await electron.transubLiveBatchSnapshot();
            } catch (_) {
                return false;
            }
            if (!snap?.ok && !snap?.active) return false;
            const applied = applyLiveBatchSnapshotToState(state, snap, { normPath });
            if (!applied) return false;
            try { syncEngineModelsBrowseOnlyFromTaskState(); } catch (_) { /* ignore */ }
            setBadge('运行中', 'running');
            renderList();
            updateProgressUi({ force: true });
            updateStartButton();
            startElapsedTicker();
            appendLog(
                `已从后台批次恢复任务列表（${state.total} 项）`,
                'info',
            );
            return true;
        }

        return {
            rehydrateFromLiveBatchIfNeeded,
            shouldRehydrateFromSnapshot,
            buildItemsFromLiveBatchSnapshot,
            applyLiveBatchSnapshotToState,
        };
    }

    return {
        shouldRehydrateFromSnapshot,
        buildItemsFromLiveBatchSnapshot,
        applyLiveBatchSnapshotToState,
        createLiveBatchRehydrate,
    };
}));
