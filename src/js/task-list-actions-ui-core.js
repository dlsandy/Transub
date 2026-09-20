/**
 * Task list table actions UI: column sort/fit, row+col context menus, list click/dblclick.
 * Shell injects DOM/state/IPC via createTaskListActionsUi(deps).
 * (FactoryTaskListUi owns renderList / row builders.)
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubTaskListActionsUi = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function taskListActionsUiFactory(global) {
    const DEFAULT_TASK_TABLE_COLS = Object.freeze([
        { key: 'check', sortable: false, min: 28, max: 48, pad: 8 },
        { key: 'file', sortable: true, min: 96, max: 2400, pad: 16 },
        { key: 'duration', sortable: true, min: 40, max: 160, pad: 16 },
        { key: 'elapsed', sortable: true, min: 40, max: 160, pad: 16 },
        { key: 'progress', sortable: true, min: 64, max: 240, pad: 16 },
        { key: 'status', sortable: true, min: 120, max: 960, pad: 16 },
        { key: 'qc', sortable: true, min: 36, max: 100, pad: 8 },
        { key: 'actions', sortable: false, min: 72, max: 220, pad: 8 },
    ]);

    const DEFAULT_STATUS_SORT_RANK = Object.freeze({
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
     * @param {object} deps shell adapters
     */
    function createTaskListActionsUi(deps) {
        const d = deps || {};
        const state = d.state;
        const els = d.els || {};
        const electron = d.electron;
        const taskListSortApi = d.taskListSortApi || {};
        const liveBatchQueueApi = d.liveBatchQueueApi || {};
        const expandedErrorRows = d.expandedErrorRows || new Set();
        const TASK_TABLE_COLS = d.TASK_TABLE_COLS || DEFAULT_TASK_TABLE_COLS;
        const TASK_STATUS_SORT_RANK = d.TASK_STATUS_SORT_RANK
            || taskListSortApi.TASK_STATUS_SORT_RANK
            || DEFAULT_STATUS_SORT_RANK;
        const taskColumnWidths = d.taskColumnWidths || Object.create(null);
        const basename = d.basename || ((p) => String(p || '').split(/[/\\]/).pop() || '');
        const itemElapsedSec = d.itemElapsedSec || (() => 0);
        const getAdvancedEntitled = d.getAdvancedEntitled || (() => false);
        const getDocument = d.getDocument
            || (() => (typeof document !== 'undefined' ? document : (global && global.document)));
        const getWindow = d.getWindow
            || (() => (typeof window !== 'undefined' ? window : (global && global.window)));

        const renderList = d.renderList || (() => {});
        const syncSelectAllCheck = d.syncSelectAllCheck || (() => {});
        const updateStartButton = d.updateStartButton || (() => {});
        const setFocusedTaskPath = d.setFocusedTaskPath || (() => {});
        const refreshListRowByIndex = d.refreshListRowByIndex || (() => {});
        const getSubtitlePathForItem = d.getSubtitlePathForItem || (() => '');
        const getPostBatchPathsForItem = d.getPostBatchPathsForItem || (() => []);
        const showPathForItem = d.showPathForItem || (() => '');
        const openItemEditor = d.openItemEditor || (() => {});
        const openRetranslateModal = d.openRetranslateModal || (() => {});
        const runFilmReconstructFromSelection = d.runFilmReconstructFromSelection || (() => {});
        const runPostBatchQcFix = d.runPostBatchQcFix || (() => {});
        const runPostBatchQcSmartFix = d.runPostBatchQcSmartFix || (() => {});
        const retrySingleItem = d.retrySingleItem || (() => {});
        const executeSingleItem = d.executeSingleItem || (() => {});
        const resumeSingleItem = d.resumeSingleItem || (() => {});
        const exportItemDiagnostics = d.exportItemDiagnostics || (() => {});
        const openItemInFolder = d.openItemInFolder || (() => {});
        const openTranslateStylePickerModal = d.openTranslateStylePickerModal || (() => {});
        const applyBatchRecoveryAction = d.applyBatchRecoveryAction || (() => {});
        const openItemInPlayer = d.openItemInPlayer || (() => {});
        const stopTask = d.stopTask || (() => {});
        const stopSingleItem = d.stopSingleItem || ((idx) => stopTask());
        const removeSingleItem = d.removeSingleItem || (() => {});
        const setPostTaskMenuOpen = d.setPostTaskMenuOpen || (() => {});
        const setAddMenuOpen = d.setAddMenuOpen || (() => {});
        const setMoreMenuOpen = d.setMoreMenuOpen || (() => {});
        const setTranslateModeMenuOpen = d.setTranslateModeMenuOpen || (() => {});
        const setPostBatchQcFixMenuOpen = d.setPostBatchQcFixMenuOpen || (() => {});

        let taskRowContextIdx = -1;
        let taskColContextKey = '';

        function taskColMeta(key) {
            return TASK_TABLE_COLS.find((c) => c.key === key) || null;
        }

        function syncTaskTableSortHeaders() {
            const head = els.taskTableHead;
            if (!head) return;
            const sort = state.listSort;
            head.querySelectorAll('th[data-sort-key]').forEach((th) => {
                const key = th.getAttribute('data-sort-key') || '';
                const active = !!(sort && sort.key === key);
                th.classList.toggle('is-sort-asc', active && sort.dir === 'asc');
                th.classList.toggle('is-sort-desc', active && sort.dir === 'desc');
                const label = (th.textContent || '').replace(/\s+/g, ' ').trim().replace(/[▲▼↕]/g, '').trim();
                const baseTitle = th.getAttribute('data-base-title') || th.getAttribute('title') || label;
                if (!th.getAttribute('data-base-title')) th.setAttribute('data-base-title', baseTitle);
                if (active) {
                    th.setAttribute('aria-sort', sort.dir === 'asc' ? 'ascending' : 'descending');
                    th.title = `${baseTitle}（${sort.dir === 'asc' ? '升序' : '降序'}，再点切换）`;
                } else {
                    th.removeAttribute('aria-sort');
                    th.title = baseTitle;
                }
            });
        }

        function measureTaskColumnFitWidth(colKey) {
            const meta = taskColMeta(colKey);
            const table = els.subtitleTaskTable;
            const doc = getDocument();
            if (!meta || !table || !doc) return meta?.min || 64;
            const colIdx = TASK_TABLE_COLS.findIndex((c) => c.key === colKey);
            const targets = [];
            table.querySelectorAll('tr').forEach((tr) => {
                const cell = tr.children[colIdx];
                if (cell) targets.push(cell);
            });
            if (!targets.length) return meta.min;

            const probe = doc.createElement('div');
            probe.setAttribute('aria-hidden', 'true');
            probe.style.cssText = [
                'position:absolute',
                'left:-99999px',
                'top:0',
                'visibility:hidden',
                'height:auto',
                'width:max-content',
                'max-width:none',
                'white-space:nowrap',
                'display:inline-block',
                'pointer-events:none',
                'box-sizing:border-box',
            ].join(';');
            doc.body.appendChild(probe);

            let max = 0;
            targets.forEach((cell) => {
                const cs = getComputedStyle(cell);
                probe.style.font = cs.font;
                probe.style.letterSpacing = cs.letterSpacing;
                probe.style.paddingLeft = cs.paddingLeft;
                probe.style.paddingRight = cs.paddingRight;
                const clone = cell.cloneNode(true);
                if (cell.tagName === 'TH') {
                    clone.querySelectorAll('.task-col-sort-ind').forEach((n) => n.remove());
                }
                // Flatten flex/block layout so content width is measurable
                clone.querySelectorAll('*').forEach((n) => {
                    if (!(n instanceof HTMLElement)) return;
                    n.style.maxWidth = 'none';
                    n.style.width = 'auto';
                    n.style.overflow = 'visible';
                    n.style.textOverflow = 'clip';
                    n.style.whiteSpace = 'nowrap';
                    if (n.classList.contains('file-cell-main')
                        || n.classList.contains('row-actions')
                        || n.classList.contains('qc-cell')
                        || n.classList.contains('row-mini-progress')) {
                        n.style.display = 'inline-flex';
                    } else if (n.tagName !== 'BUTTON' && n.tagName !== 'INPUT' && n.tagName !== 'SPAN'
                        && n.tagName !== 'I' && n.tagName !== 'A') {
                        n.style.display = 'inline';
                    }
                });
                probe.innerHTML = '';
                while (clone.firstChild) probe.appendChild(clone.firstChild);
                max = Math.max(max, Math.ceil(probe.getBoundingClientRect().width));
            });
            probe.remove();
            return Math.max(meta.min, Math.min(meta.max, max + (meta.pad || 0)));
        }

        function applyTaskColumnWidths() {
            const group = els.taskTableColgroup;
            const table = els.subtitleTaskTable;
            if (!group) return;
            let sum = 0;
            let fittedCount = 0;
            group.querySelectorAll('col[data-col]').forEach((col) => {
                const key = col.getAttribute('data-col') || '';
                const px = taskColumnWidths[key];
                if (Number.isFinite(px) && px > 0) {
                    col.style.width = `${Math.round(px)}px`;
                    sum += px;
                    fittedCount += 1;
                } else {
                    col.style.width = '';
                }
            });
            if (!table) return;
            // After fitting every column, size the table to content (scroll if needed)
            if (fittedCount === TASK_TABLE_COLS.length && sum > 0) {
                const hostW = els.listScroll?.clientWidth || 0;
                table.style.width = `${Math.max(Math.round(sum), hostW || 0)}px`;
                table.style.minWidth = `${Math.round(sum)}px`;
            } else if (fittedCount > 0) {
                table.style.width = '100%';
                table.style.minWidth = '';
            } else {
                table.style.width = '';
                table.style.minWidth = '';
            }
        }

        function remapExpandedErrorRows(prevItems) {
            if (!expandedErrorRows.size) return;
            const next = new Set();
            for (const oldIdx of expandedErrorRows) {
                const item = prevItems[oldIdx];
                if (!item) continue;
                const newIdx = state.items.indexOf(item);
                if (newIdx >= 0) next.add(newIdx);
            }
            expandedErrorRows.clear();
            for (const i of next) expandedErrorRows.add(i);
        }

        function listSortHelpers() {
            return {
                basename,
                itemElapsedSec,
                statusRank: TASK_STATUS_SORT_RANK,
            };
        }

        function listSortValue(item, key) {
            if (taskListSortApi.listSortValue) {
                return taskListSortApi.listSortValue(item, key, listSortHelpers());
            }
            switch (key) {
                case 'file':
                    return basename(item.path).toLocaleLowerCase('zh-CN');
                case 'duration':
                    return Number(item.duration) || 0;
                case 'elapsed':
                    return itemElapsedSec(item);
                case 'progress': {
                    const pct = Number(item.progress);
                    if (Number.isFinite(pct)) return pct;
                    const total = Number(item.duration) || Number(item.processedTotalSec) || 0;
                    const processed = Number(item.processedSec) || 0;
                    if (total > 0 && processed > 0) return (processed / total) * 100;
                    return processed > 0 ? 100 : 0;
                }
                case 'status':
                    return TASK_STATUS_SORT_RANK[item.status] ?? 50;
                case 'qc': {
                    if (item.qcError) return -1;
                    if (!Number.isFinite(Number(item.qcIssueCount))) return -2;
                    return Number(item.qcIssueCount) || 0;
                }
                default:
                    return '';
            }
        }

        function compareListSortValues(a, b, key) {
            if (taskListSortApi.compareListSortValues) {
                return taskListSortApi.compareListSortValues(a, b, key, listSortHelpers());
            }
            const va = listSortValue(a, key);
            const vb = listSortValue(b, key);
            if (typeof va === 'number' && typeof vb === 'number') {
                return va - vb;
            }
            return String(va).localeCompare(String(vb), 'zh-CN', { numeric: true, sensitivity: 'base' });
        }

        function sortTaskListBy(key) {
            if (!taskColMeta(key)?.sortable) return;
            state.listSort = taskListSortApi.nextListSortState
                ? taskListSortApi.nextListSortState(state.listSort, key)
                : {
                    key,
                    dir: (state.listSort && state.listSort.key === key && state.listSort.dir === 'asc')
                        ? 'desc'
                        : 'asc',
                };
            renderList();
        }

        function applyListSortInPlace() {
            const sort = state.listSort;
            if (!sort?.key || !taskColMeta(sort.key)?.sortable) return;
            if (state.items.length < 2) return;
            if (taskListSortApi.sortTaskItems) {
                const result = taskListSortApi.sortTaskItems(state.items, sort, listSortHelpers());
                state.items = result.items;
                if (result.changed) remapExpandedErrorRows(result.prev);
                return;
            }
            const prev = state.items.slice();
            const mult = sort.dir === 'asc' ? 1 : -1;
            const key = sort.key;
            state.items.sort((a, b) => {
                const cmp = compareListSortValues(a, b, key);
                if (cmp !== 0) return cmp * mult;
                return basename(a.path).localeCompare(basename(b.path), 'zh-CN');
            });
            let changed = false;
            for (let i = 0; i < prev.length; i += 1) {
                if (prev[i] !== state.items[i]) {
                    changed = true;
                    break;
                }
            }
            if (changed) remapExpandedErrorRows(prev);
        }

        function autoFitTaskColumn(colKey) {
            if (!taskColMeta(colKey)) return;
            taskColumnWidths[colKey] = measureTaskColumnFitWidth(colKey);
            applyTaskColumnWidths();
        }

        function autoFitAllTaskColumns() {
            TASK_TABLE_COLS.forEach((c) => {
                taskColumnWidths[c.key] = measureTaskColumnFitWidth(c.key);
            });
            applyTaskColumnWidths();
        }

        function closeTaskColContextMenu() {
            taskColContextKey = '';
            if (!els.taskColContextMenu) return;
            els.taskColContextMenu.classList.add('hidden');
            els.taskColContextMenu.style.left = '';
            els.taskColContextMenu.style.top = '';
        }

        function isTaskColContextMenuOpen() {
            return !!(els.taskColContextMenu && !els.taskColContextMenu.classList.contains('hidden'));
        }

        function showTaskColContextMenu(colKey, clientX, clientY) {
            const menu = els.taskColContextMenu;
            if (!menu || !taskColMeta(colKey)) return;
            closeTaskRowContextMenu();
            setPostTaskMenuOpen(false);
            setAddMenuOpen(false);
            setMoreMenuOpen(false);
            setTranslateModeMenuOpen(false);
            setPostBatchQcFixMenuOpen(false);
            taskColContextKey = colKey;
            const fitOne = menu.querySelector('[data-task-col-ctx="fit-one"]');
            if (fitOne) {
                const label = fitOne.querySelector('span');
                if (label) label.textContent = '将列调整为合适的大小';
                fitOne.disabled = false;
            }
            menu.classList.remove('hidden');
            try { getDocument()?.body?.appendChild(menu); } catch { /* ignore */ }
            const win = getWindow() || {};
            const pad = 8;
            const mw = menu.offsetWidth || 220;
            const mh = menu.offsetHeight || 80;
            const vw = win.innerWidth || 800;
            const vh = win.innerHeight || 600;
            let left = Number(clientX) || 0;
            let top = Number(clientY) || 0;
            if (left + mw + pad > vw) left = Math.max(pad, vw - mw - pad);
            if (top + mh + pad > vh) top = Math.max(pad, vh - mh - pad);
            if (left < pad) left = pad;
            if (top < pad) top = pad;
            menu.style.left = `${left}px`;
            menu.style.top = `${top}px`;
        }

        function runTaskColContextAction(action) {
            const colKey = taskColContextKey;
            closeTaskColContextMenu();
            if (action === 'fit-one' && colKey) autoFitTaskColumn(colKey);
            else if (action === 'fit-all') autoFitAllTaskColumns();
        }

        function bindTaskTableColumns() {
            const head = els.taskTableHead;
            if (!head || head.dataset.colBound) return;
            head.dataset.colBound = '1';

            head.addEventListener('click', (e) => {
                if (e.target.closest('input, button, a, label')) return;
                const th = e.target.closest('th[data-sort-key]');
                if (!th || !head.contains(th)) return;
                e.preventDefault();
                const key = th.getAttribute('data-sort-key') || '';
                if (key) sortTaskListBy(key);
            });

            const onHeaderContextMenu = (e) => {
                const th = e.target.closest('th[data-col]');
                if (!th || !head.contains(th)) return;
                if (e.target.closest('input, textarea, select')) return;
                e.preventDefault();
                e.stopPropagation();
                const colKey = th.getAttribute('data-col') || '';
                if (!colKey) return;
                showTaskColContextMenu(colKey, e.clientX, e.clientY);
            };
            head.addEventListener('contextmenu', onHeaderContextMenu);

            // Also allow right-click on body cells to auto-fit that column (Excel-like),
            // but only when not on a task row action — row menu takes priority on rows.
            // Header-only is enough per product ask; keep header path only.

            els.taskColContextMenu?.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-task-col-ctx]');
                if (!btn || btn.disabled) return;
                e.preventDefault();
                e.stopPropagation();
                runTaskColContextAction(btn.getAttribute('data-task-col-ctx'));
            });
            els.taskColContextMenu?.addEventListener('contextmenu', (e) => {
                e.preventDefault();
            });
            const doc = getDocument();
            const win = getWindow();
            doc?.addEventListener('click', (e) => {
                if (!isTaskColContextMenuOpen()) return;
                if (els.taskColContextMenu.contains(e.target)) return;
                closeTaskColContextMenu();
            }, true);
            doc?.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && isTaskColContextMenuOpen()) {
                    e.preventDefault();
                    e.stopPropagation();
                    closeTaskColContextMenu();
                }
            }, true);
            els.listScroll?.addEventListener('scroll', () => {
                if (isTaskColContextMenuOpen()) closeTaskColContextMenu();
            }, { passive: true });
            win?.addEventListener('resize', () => {
                if (isTaskColContextMenuOpen()) closeTaskColContextMenu();
            });

            // Ensure default col widths apply once DOM is ready
            applyTaskColumnWidths();
            syncTaskTableSortHeaders();
        }

        function closeTaskRowContextMenu() {
            taskRowContextIdx = -1;
            if (!els.taskRowContextMenu) return;
            els.taskRowContextMenu.classList.add('hidden');
            els.taskRowContextMenu.style.left = '';
            els.taskRowContextMenu.style.top = '';
        }

        function isTaskRowContextMenuOpen() {
            return !!(els.taskRowContextMenu && !els.taskRowContextMenu.classList.contains('hidden'));
        }

        /** If the row is not already selected, select only that row (keeps multi-select when right-clicking a selected row). */
        function ensureContextRowSelected(idx) {
            const item = state.items[idx];
            if (!item) return null;
            if (!item.selected) {
                state.items.forEach((it, i) => { it.selected = i === idx; });
                syncSelectAllCheck();
                renderList();
                updateStartButton();
            }
            setFocusedTaskPath(item.path);
            return state.items[idx] || item;
        }

        function openItemBurn(item) {
            if (!item) return;
            const videoPath = String(item.path || '').trim();
            if (!videoPath) return;
            const open = global.TransubFactoryWorkspace?.openBurn;
            if (typeof open !== 'function') return;
            open({
                videoPath,
                subtitlePath: String(getSubtitlePathForItem(item) || '').trim(),
                bilingualSubtitlePath: String(item.bilingualSubtitlePath || '').trim(),
                sourceSubtitlePath: String(item.sourceSubtitlePath || '').trim(),
                path: videoPath,
            });
        }

        function syncTaskRowContextMenuState(idx) {
            const menu = els.taskRowContextMenu;
            if (!menu) return;
            const item = state.items[idx];
            if (!item) {
                closeTaskRowContextMenu();
                return;
            }
            const advancedEntitled = !!getAdvancedEntitled();
            const subPath = getSubtitlePathForItem(item);
            const canEdit = !!subPath;
            const busy = state.running || state.postBatchBusy || state.retranslateBusy;
            const canRetranslate = !busy;
            const canReconstruct = !busy && !!getSubtitlePathForItem(item);
            const canQcFix = !state.running && !state.qcFixing
                && item.status !== 'done' && item.status !== 'skipped'
                && Number(item.qcIssueCount) > 0
                && getPostBatchPathsForItem(item).length > 0;
            const canQcSmart = canQcFix && advancedEntitled && !!electron?.transubAdvancedQcSmartFix;
            const canRetry = (item.status === 'failed' || item.status === 'error') && !state.running;
            const canShowFolder = !!showPathForItem(item);
            const canBurn = !!String(item.path || '').trim()
                && (item.status === 'done' || item.status === 'skipped');
            const canPlay = !!String(item.path || '').trim();
            const canRemove = liveBatchQueueApi.canRemoveTaskItem
                ? liveBatchQueueApi.canRemoveTaskItem(item, {
                    running: !!state.running,
                    retranslateBusy: !!state.retranslateBusy,
                })
                : (!state.retranslateBusy && !(state.running && item.status === 'running'));

            const setEnabled = (action, enabled) => {
                const btn = menu.querySelector(`[data-task-ctx="${action}"]`);
                if (btn) btn.disabled = !enabled;
            };
            setEnabled('edit', canEdit);
            setEnabled('play', canPlay);
            setEnabled('retranslate', canRetranslate);
            setEnabled('reconstruct', canReconstruct);
            setEnabled('qc-fix', canQcFix);
            setEnabled('qc-smart-fix', canQcSmart);
            setEnabled('retry', canRetry);
            setEnabled('show-folder', canShowFolder);
            setEnabled('burn', canBurn);
            setEnabled('translate-style', !state.running && !state.retranslateBusy);
            setEnabled('remove', canRemove);
        }

        function showTaskRowContextMenu(idx, clientX, clientY) {
            const menu = els.taskRowContextMenu;
            if (!menu || !state.items[idx]) return;
            taskRowContextIdx = idx;
            closeTaskColContextMenu();
            setPostTaskMenuOpen(false);
            setAddMenuOpen(false);
            setMoreMenuOpen(false);
            setTranslateModeMenuOpen(false);
            setPostBatchQcFixMenuOpen(false);
            ensureContextRowSelected(idx);
            syncTaskRowContextMenuState(idx);
            menu.classList.remove('hidden');
            try { getDocument()?.body?.appendChild(menu); } catch { /* ignore */ }
            const win = getWindow() || {};
            const pad = 8;
            const mw = menu.offsetWidth || 200;
            const mh = menu.offsetHeight || 280;
            const vw = win.innerWidth || 800;
            const vh = win.innerHeight || 600;
            let left = Number(clientX) || 0;
            let top = Number(clientY) || 0;
            if (left + mw + pad > vw) left = Math.max(pad, vw - mw - pad);
            if (top + mh + pad > vh) top = Math.max(pad, vh - mh - pad);
            if (left < pad) left = pad;
            if (top < pad) top = pad;
            menu.style.left = `${left}px`;
            menu.style.top = `${top}px`;
        }

        function runTaskRowContextAction(action) {
            const idx = taskRowContextIdx;
            const item = state.items[idx];
            closeTaskRowContextMenu();
            if (!item || idx < 0) return;
            switch (action) {
                case 'play':
                    openItemInPlayer(item);
                    break;
                case 'edit':
                    openItemEditor(item);
                    break;
                case 'retranslate':
                    ensureContextRowSelected(idx);
                    void openRetranslateModal();
                    break;
                case 'reconstruct':
                    // Force single selection — editor film reconstruct is one title at a time.
                    state.items.forEach((it, i) => { it.selected = i === idx; });
                    syncSelectAllCheck();
                    renderList();
                    updateStartButton();
                    void runFilmReconstructFromSelection(state.items[idx]);
                    break;
                case 'qc-fix':
                    void runPostBatchQcFix(item);
                    break;
                case 'qc-smart-fix':
                    void runPostBatchQcSmartFix(item);
                    break;
                case 'retry':
                    retrySingleItem(idx);
                    break;
                case 'resume':
                    void resumeSingleItem(idx);
                    break;
                case 'export-diagnostics':
                    void exportItemDiagnostics(idx);
                    break;
                case 'show-folder':
                    void openItemInFolder(item);
                    break;
                case 'burn':
                    openItemBurn(item);
                    break;
                case 'translate-style':
                    ensureContextRowSelected(idx);
                    openTranslateStylePickerModal();
                    break;
                case 'remove':
                    removeSingleItem(idx);
                    break;
                default:
                    break;
            }
        }

        function bindTaskRowContextMenu() {
            const bindHost = (host) => {
                if (!host || host.dataset.ctxBound === '1') return;
                host.dataset.ctxBound = '1';
                host.addEventListener('contextmenu', (e) => {
                    const row = e.target.closest('[data-idx]');
                    if (!row || !host.contains(row)) return;
                    if (e.target.closest('input, textarea, select')) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const idx = Number(row.dataset.idx);
                    if (!Number.isFinite(idx) || !state.items[idx]) return;
                    showTaskRowContextMenu(idx, e.clientX, e.clientY);
                });
            };
            bindHost(els.fileListBody);
            bindHost(els.taskCardList);
            if (els.taskRowContextMenu?.dataset.ctxMenuBound === '1') return;
            if (els.taskRowContextMenu) els.taskRowContextMenu.dataset.ctxMenuBound = '1';
            els.taskRowContextMenu?.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-task-ctx]');
                if (!btn || btn.disabled) return;
                e.preventDefault();
                e.stopPropagation();
                runTaskRowContextAction(btn.getAttribute('data-task-ctx'));
            });
            els.taskRowContextMenu?.addEventListener('contextmenu', (e) => {
                e.preventDefault();
            });
            const doc = getDocument();
            const win = getWindow();
            doc?.addEventListener('click', (e) => {
                if (!isTaskRowContextMenuOpen()) return;
                if (els.taskRowContextMenu.contains(e.target)) return;
                closeTaskRowContextMenu();
            }, true);
            doc?.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && isTaskRowContextMenuOpen()) {
                    e.preventDefault();
                    e.stopPropagation();
                    closeTaskRowContextMenu();
                }
            }, true);
            els.listScroll?.addEventListener('scroll', () => {
                if (isTaskRowContextMenuOpen()) closeTaskRowContextMenu();
                if (isTaskColContextMenuOpen()) closeTaskColContextMenu();
            }, { passive: true });
            win?.addEventListener('resize', () => {
                if (isTaskRowContextMenuOpen()) closeTaskRowContextMenu();
                if (isTaskColContextMenuOpen()) closeTaskColContextMenu();
            });
        }

        function bindListActions() {
            const hosts = [els.fileListBody, els.taskCardList, els.taskStation].filter(Boolean);
            if (!hosts.length) return;
            bindTaskTableColumns();
            bindTaskRowContextMenu();
            const onListClick = (e) => {
                const focusRow = e.target.closest('[data-idx]');
                if (focusRow && !e.target.closest('input[type="checkbox"]')) {
                    const focusItem = state.items[Number(focusRow.dataset.idx)];
                    if (focusItem) setFocusedTaskPath(focusItem.path);
                }
                const batchRecoverBtn = e.target.closest('[data-batch-recover]');
                if (batchRecoverBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    applyBatchRecoveryAction(
                        batchRecoverBtn.getAttribute('data-batch-recover'),
                        Number(batchRecoverBtn.getAttribute('data-batch-recover-idx')),
                    );
                    return;
                }
                const executeBtn = e.target.closest('[data-execute-idx]');
                if (executeBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    executeSingleItem(Number(executeBtn.dataset.executeIdx));
                    return;
                }
                const burnBtn = e.target.closest('[data-burn-idx]');
                if (burnBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    openItemBurn(state.items[Number(burnBtn.dataset.burnIdx)]);
                    return;
                }
                const styleBtn = e.target.closest('[data-translate-style-idx]');
                if (styleBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    const idx = Number(styleBtn.dataset.translateStyleIdx);
                    if (!Number.isFinite(idx) || !state.items[idx]) return;
                    if (state.retranslateBusy) return;
                    // Per-row control targets that item only (toolbar chip still batch-sets).
                    state.items.forEach((it, i) => { it.selected = i === idx; });
                    syncSelectAllCheck();
                    setFocusedTaskPath(state.items[idx].path);
                    renderList();
                    updateStartButton();
                    openTranslateStylePickerModal();
                    return;
                }
                const moreBtn = e.target.closest('[data-more-idx]');
                if (moreBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    const idx = Number(moreBtn.dataset.moreIdx);
                    if (!Number.isFinite(idx) || !state.items[idx]) return;
                    const rect = moreBtn.getBoundingClientRect();
                    showTaskRowContextMenu(idx, rect.left, rect.bottom + 4);
                    return;
                }
                const stopBtn = e.target.closest('[data-stop-idx]');
                if (stopBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    void stopSingleItem(Number(stopBtn.dataset.stopIdx));
                    return;
                }
                const removeBtn = e.target.closest('[data-remove-idx]');
                if (removeBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    removeSingleItem(Number(removeBtn.dataset.removeIdx));
                    return;
                }
                const retryBtn = e.target.closest('[data-retry-idx]');
                if (retryBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    retrySingleItem(Number(retryBtn.dataset.retryIdx));
                    return;
                }
                const resumeBtn = e.target.closest('[data-resume-idx]');
                if (resumeBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    void resumeSingleItem(Number(resumeBtn.dataset.resumeIdx));
                    return;
                }
                const diagBtn = e.target.closest('[data-diag-idx]');
                if (diagBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    void exportItemDiagnostics(Number(diagBtn.dataset.diagIdx));
                    return;
                }
                const errToggle = e.target.closest('[data-error-toggle]');
                if (errToggle) {
                    e.preventDefault();
                    e.stopPropagation();
                    const idx = Number(errToggle.dataset.errorToggle);
                    if (expandedErrorRows.has(idx)) expandedErrorRows.delete(idx);
                    else expandedErrorRows.add(idx);
                    refreshListRowByIndex(idx);
                    return;
                }
                const qcFixRowBtn = e.target.closest('[data-qc-fix]');
                if (qcFixRowBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    void runPostBatchQcFix(state.items[Number(qcFixRowBtn.dataset.qcFix)]);
                    return;
                }
                const qcSmartFixRowBtn = e.target.closest('[data-qc-smart-fix]');
                if (qcSmartFixRowBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    void runPostBatchQcSmartFix(state.items[Number(qcSmartFixRowBtn.dataset.qcSmartFix)]);
                    return;
                }
                const openEditorBtn = e.target.closest('[data-open-editor]');
                if (openEditorBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    openItemEditor(state.items[Number(openEditorBtn.dataset.openEditor)]);
                    return;
                }
                const editSubBtn = e.target.closest('[data-edit-sub]');
                if (editSubBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    const sub = editSubBtn.getAttribute('data-edit-sub') || '';
                    const video = editSubBtn.getAttribute('data-edit-video') || '';
                    global.TransubSubtitleEditor?.openEditor?.(sub, video);
                    return;
                }
                const qcBtn = e.target.closest('[data-qc-open]');
                if (qcBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    openItemEditor(state.items[Number(qcBtn.dataset.qcOpen)]);
                    return;
                }
                const btn = e.target.closest('[data-show-folder]');
                if (!btn || btn.disabled) return;
                e.preventDefault();
                e.stopPropagation();
                const idx = Number(btn.dataset.idx);
                const item = state.items[idx];
                if (item) {
                    openItemInFolder(item);
                    return;
                }
                const path = btn.getAttribute('data-show-folder');
                if (path) {
                    electron?.showInFolder?.(path);
                }
            };
            const onListDblClick = (e) => {
                if (e.target.closest('input,button,a,select,label')) return;
                const row = e.target.closest('[data-idx]');
                if (!row) return;
                openItemEditor(state.items[Number(row.dataset.idx)]);
            };
            hosts.forEach((host) => {
                if (host.dataset.actionsBound === '1') return;
                host.dataset.actionsBound = '1';
                host.addEventListener('click', onListClick);
                host.addEventListener('dblclick', onListDblClick);
            });
        }

        return {
            taskColMeta,
            syncTaskTableSortHeaders,
            applyTaskColumnWidths,
            applyListSortInPlace,
            sortTaskListBy,
            autoFitTaskColumn,
            autoFitAllTaskColumns,
            closeTaskColContextMenu,
            closeTaskRowContextMenu,
            isTaskColContextMenuOpen,
            isTaskRowContextMenuOpen,
            showTaskColContextMenu,
            showTaskRowContextMenu,
            bindTaskTableColumns,
            bindTaskRowContextMenu,
            bindListActions,
        };
    }

    return {
        createTaskListActionsUi,
        DEFAULT_TASK_TABLE_COLS,
        DEFAULT_STATUS_SORT_RANK,
    };
}));
