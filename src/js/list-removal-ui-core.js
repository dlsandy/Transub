/**
 * Task list removal UI: removeSelected, clearList variants, removeItemsFromList.
 * Shell injects state/IPC via createListRemovalUi(deps).
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubListRemovalUi = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function listRemovalUiFactory() {
    const FAILED_STATUSES = new Set(['failed', 'error', 'cancelled']);
    const CLEAR_HOVER_CLOSE_MS = 180;

    /**
     * @param {object} deps shell adapters
     */
    function createListRemovalUi(deps) {
        const d = deps || {};
        const state = d.state;
        const electron = d.electron;
        const liveBatchQueueApi = d.liveBatchQueueApi || {};
        const normPath = d.normPath || ((p) => String(p || ''));
        const uiTf = d.uiTf || ((s) => s);
        const appendLog = d.appendLog || (() => {});
        const renderList = d.renderList || (() => {});
        const updateStartButton = d.updateStartButton || (() => {});
        const isProgressIdle = d.isProgressIdle || (() => true);
        const updateProgressUi = d.updateProgressUi || (() => {});
        const ux = d.ux || (() => null);
        const appendItemsToLiveBatch = d.appendItemsToLiveBatch || (async () => {});
        const closeSiblingMenus = d.closeSiblingMenus || (() => {});

        let clearMenuHoverTimer = 0;

        async function removeItemsFromList(removed, { blockedRunning = false } = {}) {
            const list = Array.isArray(removed) ? removed : [];
            if (!list.length) return;
            if (state.running) {
                const needSkip = liveBatchQueueApi.pathsNeedingBatchSkip
                    ? liveBatchQueueApi.pathsNeedingBatchSkip(list, normPath)
                    : list
                        .filter((i) => !['done', 'skipped', 'cancelled', 'failed', 'error', 'running']
                            .includes(String(i.status || '')))
                        .map((i) => i.path);
                if (needSkip.length) {
                    try {
                        const res = await electron?.transubLiveBatchSkip?.({ paths: needSkip });
                        if (res?.ok === false && res?.code !== 'no_batch') {
                            appendLog(`从批次移除失败：${res?.error || '未知错误'}`, 'warn');
                        }
                    } catch (err) {
                        appendLog(`从批次移除失败：${err?.message || err}`, 'warn');
                    }
                }
            }
            const removeKeys = new Set(list.map((i) => normPath(i.path)));
            const snapshot = list.map((i) => ({ ...i, sense: i.sense ? { ...i.sense } : undefined }));
            state.items = state.items.filter((i) => !removeKeys.has(normPath(i.path)));
            renderList();
            updateStartButton();
            if (isProgressIdle()) updateProgressUi({ force: true });
            const note = blockedRunning
                ? uiTf('已移除 {n} 项（进行中的任务已保留）', { n: list.length })
                : uiTf('已移除 {n} 项', { n: list.length });
            ux()?.pushUndo?.(note, () => {
                state.items.push(...snapshot);
                renderList();
                updateStartButton();
                if (state.running) {
                    const requeue = snapshot.filter((i) => {
                        const s = String(i.status || '');
                        return !['done', 'skipped', 'cancelled', 'failed', 'error', 'running']
                            .includes(s);
                    });
                    if (requeue.length) void appendItemsToLiveBatch(requeue);
                }
            });
            if (blockedRunning) appendLog(note, 'info');
        }

        function removeSelected() {
            if (state.retranslateBusy) return;
            const partition = liveBatchQueueApi.partitionSelectedForRemove
                ? liveBatchQueueApi.partitionSelectedForRemove(state.items, {
                    running: !!state.running,
                    retranslateBusy: !!state.retranslateBusy,
                })
                : {
                    removable: state.items.filter((i) => i.selected
                        && !(state.running && i.status === 'running')),
                    blocked: [],
                };
            const removed = partition.removable || [];
            if (!removed.length) {
                if (state.running && (partition.blocked || []).length) {
                    appendLog('进行中的任务无法移除，可先停止或等待完成', 'warn');
                }
                return;
            }
            void removeItemsFromList(removed, {
                blockedRunning: (partition.blocked || []).length > 0,
            });
        }

        function clearMatching(predicate, { emptyWarn } = {}) {
            if (state.retranslateBusy) return Promise.resolve();
            if (!state.items.length) return Promise.resolve();
            const match = typeof predicate === 'function'
                ? state.items.filter((item) => predicate(item))
                : [];
            if (!match.length) {
                if (emptyWarn) appendLog(emptyWarn, 'info');
                return Promise.resolve();
            }
            if (state.running) {
                const removable = match.filter((i) => i.status !== 'running');
                const blocked = match.length - removable.length;
                if (!removable.length) {
                    appendLog('进行中的任务无法清空，可先停止或等待完成', 'warn');
                    return Promise.resolve();
                }
                return removeItemsFromList(removable, { blockedRunning: blocked > 0 });
            }
            return removeItemsFromList(match);
        }

        function clearList() {
            if (state.retranslateBusy) return;
            if (!state.items.length) return;
            if (state.running) {
                return clearMatching(() => true);
            }
            const snapshot = state.items.map((i) => ({ ...i, sense: i.sense ? { ...i.sense } : undefined }));
            state.items = [];
            renderList();
            updateStartButton();
            if (isProgressIdle()) updateProgressUi({ force: true });
            ux()?.pushUndo?.(uiTf('已清空 {n} 项', { n: snapshot.length }), () => {
                state.items = snapshot;
                renderList();
                updateStartButton();
                if (isProgressIdle()) updateProgressUi({ force: true });
            });
        }

        function clearChecked() {
            return clearMatching((i) => !!i.selected, { emptyWarn: '没有已勾选的任务' });
        }

        function clearUnchecked() {
            return clearMatching((i) => !i.selected, { emptyWarn: '没有未勾选的任务' });
        }

        function clearCompleted() {
            return clearMatching((i) => String(i.status || '') === 'done', {
                emptyWarn: '没有已完成的任务',
            });
        }

        function clearFailed() {
            return clearMatching((i) => FAILED_STATUSES.has(String(i.status || '')), {
                emptyWarn: '没有已失败的任务',
            });
        }

        /**
         * Resolve which queue items point at missing/renamed media paths.
         * Uses batch `transubFileExists({ paths })` when available; falls back to per-path checks.
         * @returns {Promise<object[]>}
         */
        async function collectInvalidItems() {
            const items = Array.isArray(state.items) ? state.items : [];
            if (!items.length) return [];
            const check = electron?.transubFileExists;
            if (typeof check !== 'function') {
                appendLog('无法检测失效文件：文件存在检查不可用', 'warn');
                return [];
            }

            const emptyPathItems = [];
            const withPath = [];
            for (const item of items) {
                const p = String(item?.path || '').trim();
                if (!p) emptyPathItems.push(item);
                else withPath.push(item);
            }

            const missing = [];
            try {
                const paths = withPath.map((item) => String(item.path || '').trim());
                const batch = await check({ paths });
                if (batch?.ok && Array.isArray(batch.results) && batch.results.length === paths.length) {
                    for (let i = 0; i < withPath.length; i += 1) {
                        if (batch.results[i]?.exists === false) missing.push(withPath[i]);
                    }
                } else {
                    const flags = await Promise.all(withPath.map(async (item) => {
                        try {
                            const res = await check({ path: item.path });
                            return res?.ok && res.exists === false;
                        } catch (_err) {
                            return false;
                        }
                    }));
                    for (let i = 0; i < withPath.length; i += 1) {
                        if (flags[i]) missing.push(withPath[i]);
                    }
                }
            } catch (err) {
                appendLog(`检测失效文件失败：${err?.message || err}`, 'warn');
                return emptyPathItems.slice();
            }
            return emptyPathItems.concat(missing);
        }

        /**
         * Remove queue items whose media file no longer exists (e.g. renamed/moved).
         * @param {{ silentEmpty?: boolean }} [opts]
         * @returns {Promise<{ removed: number }>}
         */
        async function clearInvalid(opts = {}) {
            const silentEmpty = !!opts.silentEmpty;
            if (state.retranslateBusy) return { removed: 0 };
            if (!state.items.length) {
                if (!silentEmpty) appendLog('没有已失效的文件', 'info');
                return { removed: 0 };
            }
            const invalid = await collectInvalidItems();
            if (!invalid.length) {
                if (!silentEmpty) appendLog('没有已失效的文件', 'info');
                return { removed: 0 };
            }
            const keys = new Set(invalid.map((i) => normPath(i.path)));
            const before = state.items.length;
            await clearMatching((i) => keys.has(normPath(i.path)));
            return { removed: Math.max(0, before - state.items.length) };
        }

        function runClearAction(action) {
            const key = String(action || '').trim();
            if (key === 'all') return clearList();
            if (key === 'checked') return clearChecked();
            if (key === 'unchecked') return clearUnchecked();
            if (key === 'done') return clearCompleted();
            if (key === 'failed') return clearFailed();
            if (key === 'invalid') return clearInvalid();
            return undefined;
        }

        function setClearListMenuOpen(open) {
            const next = !!open;
            state.clearListMenuOpen = next;
            const els = d.els || {};
            els.clearListMenu?.classList.toggle('hidden', !next);
            if (els.clearListBtn) {
                els.clearListBtn.setAttribute('aria-expanded', next ? 'true' : 'false');
            }
            // Must except self — closeSiblingMenus includes clearList in SIBLING_MENU_KEYS.
            if (next) closeSiblingMenus('clearList');
        }

        function clearClearMenuHoverTimer() {
            if (clearMenuHoverTimer) {
                clearTimeout(clearMenuHoverTimer);
                clearMenuHoverTimer = 0;
            }
        }

        function scheduleClearMenuClose() {
            clearClearMenuHoverTimer();
            clearMenuHoverTimer = setTimeout(() => {
                clearMenuHoverTimer = 0;
                setClearListMenuOpen(false);
            }, CLEAR_HOVER_CLOSE_MS);
        }

        function bindClearListMenu() {
            const els = d.els || {};
            if (!els.clearListBtn || els.clearListBtn.dataset.clearMenuBound === '1') return;
            els.clearListBtn.dataset.clearMenuBound = '1';

            els.clearListBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                if (els.clearListBtn.disabled) return;
                setClearListMenuOpen(!state.clearListMenuOpen);
            });

            const wrap = els.clearListMenuWrap;
            if (wrap) {
                wrap.addEventListener('mouseenter', () => {
                    if (els.clearListBtn?.disabled) return;
                    clearClearMenuHoverTimer();
                    setClearListMenuOpen(true);
                });
                wrap.addEventListener('mouseleave', () => {
                    scheduleClearMenuClose();
                });
            }

            const items = Array.isArray(els.clearListMenuItems)
                ? els.clearListMenuItems
                : Array.from(els.clearListMenu?.querySelectorAll('[data-clear-action]') || []);
            items.forEach((item) => {
                item.addEventListener('click', (event) => {
                    event.stopPropagation();
                    setClearListMenuOpen(false);
                    runClearAction(item.dataset.clearAction);
                });
            });
            els.clearListMenu?.addEventListener('click', (event) => event.stopPropagation());

            const doc = typeof document !== 'undefined' ? document : null;
            doc?.addEventListener('click', () => {
                if (state.clearListMenuOpen) setClearListMenuOpen(false);
            });
            doc?.addEventListener('keydown', (event) => {
                if (event.key === 'Escape' && state.clearListMenuOpen) {
                    setClearListMenuOpen(false);
                }
            });
        }

        return {
            removeSelected,
            clearList,
            clearChecked,
            clearUnchecked,
            clearCompleted,
            clearFailed,
            clearInvalid,
            collectInvalidItems,
            clearMatching,
            runClearAction,
            setClearListMenuOpen,
            bindClearListMenu,
            removeItemsFromList,
            FAILED_STATUSES,
        };
    }

    return { createListRemovalUi, FAILED_STATUSES };
}));
