/**
 * Start-button readiness UI: hint title, stale compute-lock release, retry failed.
 * Pure block-reason helpers live in TransubStartReadiness.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubStartReadinessUi = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function startReadinessUiFactory(global) {
    /**
     * @param {object} deps shell adapters
     */
    function createStartReadinessUi(deps) {
        const d = deps || {};
        const state = d.state;
        const els = d.els || {};
        const electron = d.electron;
        const startReadinessApi = d.startReadinessApi
            || (global && global.TransubStartReadiness)
            || {};
        const computeStartBlockReason = d.computeStartBlockReason || (() => '');
        const syncComputeBusyFromMain = d.syncComputeBusyFromMain || (async () => !!state?.computeBusy);
        const updateStartButton = d.updateStartButton || (() => {});
        const updateStopButton = d.updateStopButton || (() => {});
        const renderList = d.renderList || (() => {});
        const showToast = d.showToast || (() => {});
        const uiTf = d.uiTf || ((s) => s);

        function updateStartHint() {
            const reason = computeStartBlockReason();
            if (!els.startBtn) return;
            els.startBtn.title = reason || '开始执行选中条目';
            // Prefer class/aria from updateStartButton; keep in sync if hint runs alone.
            const blocked = !!reason || els.startBtn.classList.contains('is-blocked');
            els.startBtn.setAttribute('aria-disabled', blocked ? 'true' : 'false');
        }

        async function clearStaleComputeBusyIfNeeded(opts = {}) {
            const busy = await syncComputeBusyFromMain(opts);
            const batchRunning = !!state.engineBatchRunning;
            if (startReadinessApi.shouldClearStuckSubtitleTaskFlags
                ? startReadinessApi.shouldClearStuckSubtitleTaskFlags({
                    running: state.running,
                    postBatchBusy: state.postBatchBusy,
                    retranslateBusy: state.retranslateBusy,
                    computeBusy: busy,
                    batchRunning,
                })
                : ((state.running || state.postBatchBusy || state.retranslateBusy)
                    && !busy && !batchRunning)) {
                state.running = false;
                state.postBatchBusy = false;
                state.retranslateBusy = false;
                state.batchStartInFlight = false;
                updateStartButton();
                updateStopButton();
                renderList();
            }
            const shouldClear = startReadinessApi.shouldForceReleaseStaleComputeLock
                ? startReadinessApi.shouldForceReleaseStaleComputeLock({
                    computeBusy: busy || !!state.computeBusy,
                    running: state.running,
                    postBatchBusy: state.postBatchBusy,
                    retranslateBusy: state.retranslateBusy,
                })
                : ((busy || state.computeBusy) && !state.running && !state.postBatchBusy && !state.retranslateBusy);
            if (!shouldClear) {
                updateStartButton();
                return {
                    cleared: false,
                    busy: !!(busy || state.computeBusy),
                    label: state.computeBusyLabel,
                };
            }
            if (!electron?.transubComputeTaskForceRelease) {
                return { cleared: false, busy: true, label: state.computeBusyLabel };
            }
            try {
                const res = await electron.transubComputeTaskForceRelease();
                state.computeBusy = false;
                state.computeBusyLabel = '';
                state.computeBusySince = 0;
                state.computeBusyOwner = '';
                state.computeBusyKind = '';
                updateStartButton();
                updateStopButton();
                return {
                    cleared: !!res?.released || !!res?.ok,
                    busy: false,
                    before: res?.before || null,
                };
            } catch (err) {
                return {
                    cleared: false,
                    busy: true,
                    label: state.computeBusyLabel,
                    error: err?.message || String(err),
                };
            }
        }

        function retryAllFailedItems() {
            if (state.running) return;
            const failed = state.items.filter((i) => i.status === 'failed' || i.status === 'error');
            if (!failed.length) return;
            failed.forEach((item) => {
                item.status = 'ready';
                item.progress = 0;
                item.detail = '';
                item.error = '';
                item.selected = true;
            });
            renderList();
            updateStartButton();
            showToast(uiTf('已选中 {count} 个失败条目，可点击开始重试', { count: failed.length }), 'info');
        }

        return {
            updateStartHint,
            clearStaleComputeBusyIfNeeded,
            retryAllFailedItems,
        };
    }

    return { createStartReadinessUi };
}));
