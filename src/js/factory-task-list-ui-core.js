/**
 * Factory task list UI: empty state, focus, row/card build & bind, recipe/view/tab sync, renderList.
 * Shell injects DOM/state/IPC via createFactoryTaskListUi(deps).
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubFactoryTaskListUi = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function factoryTaskListUiFactory(global) {
    /**
     * @param {object} deps shell adapters
     */
    function createFactoryTaskListUi(deps) {
        const d = deps || {};
        const state = d.state;
        const els = d.els || {};
        const electron = d.electron;
        const factoryTaskTabApi = d.factoryTaskTabApi || {};
        const factoryTaskUiApi = d.factoryTaskUiApi || {};
        const taskListRowApi = d.taskListRowApi || {};
        const liveBatchQueueApi = d.liveBatchQueueApi || {};
        const translateStyleApi = d.translateStyleApi || {};
        const etaApi = d.etaApi || null;
        const expandedErrorRows = d.expandedErrorRows || new Set();
        const esc = d.esc || ((s) => String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;'));
        const basename = d.basename || ((p) => String(p || '').split(/[/\\]/).pop() || '');
        const normPath = d.normPath || ((p) => String(p || ''));
        const formatDuration = d.formatDuration || (() => '');
        const appendLog = d.appendLog || (() => {});
        const showToast = d.showToast || (() => {});
        const uiTf = d.uiTf || ((s) => s);
        const getAdvancedEntitled = d.getAdvancedEntitled || (() => false);
        const getSavedOptionsSnapshot = d.getSavedOptionsSnapshot || (() => null);
        const readTranslateModeFromForm = d.readTranslateModeFromForm || (() => 'llm');
        const readTaskFromForm = d.readTaskFromForm || (() => 'translate');
        const readGlobalTranslateStylePreset = d.readGlobalTranslateStylePreset || (() => 'natural_spoken');
        const getTranslateStyleEnabled = d.getTranslateStyleEnabled || (() => false);
        const readDualLineOrderFromForm = d.readDualLineOrderFromForm || (() => '');
        const shortTranslateModelsSummary = d.shortTranslateModelsSummary || (() => '');
        const showPathForItem = d.showPathForItem || (() => '');
        const getSubtitlePathForItem = d.getSubtitlePathForItem || (() => '');
        const getPostBatchPathsForItem = d.getPostBatchPathsForItem || (() => []);
        const formatElapsedCell = d.formatElapsedCell || (() => '');
        const formatProcessedCell = d.formatProcessedCell || (() => '');
        const computeEtaSec = d.computeEtaSec || (() => NaN);
        const buildRuntimeOptions = d.buildRuntimeOptions || (() => ({}));
        const startSubtitleGeneration = d.startSubtitleGeneration || (() => {});
        const appendItemsToLiveBatch = d.appendItemsToLiveBatch || (async () => {});
        const removeItemsFromList = d.removeItemsFromList || (() => {});
        const getSelectedItems = d.getSelectedItems || (() => []);
        const updateStartButton = d.updateStartButton || (() => {});
        const updateAutoSenseUi = d.updateAutoSenseUi || (() => {});
        const updateProgressUi = d.updateProgressUi || (() => {});
        const updateQcBanner = d.updateQcBanner || (() => {});
        const updateContentProfileUi = d.updateContentProfileUi || (() => {});
        const applyListSortInPlace = d.applyListSortInPlace || (() => {});
        const syncTaskTableSortHeaders = d.syncTaskTableSortHeaders || (() => {});
        const applyTaskColumnWidths = d.applyTaskColumnWidths || (() => {});
        const getDocument = d.getDocument || (() => (typeof document !== 'undefined' ? document : (global && global.document)));
        const getContentProfileApi = d.getContentProfileApi
            || (() => (global && global.TransubContentProfile) || null);
        const getDualSubtitleApi = d.getDualSubtitleApi
            || (() => (global && global.TransubDualSubtitle) || null);

        /** Last recipe capsule text — avoid re-reading the whole form on every row tick. */
        let cachedRecipeLine = '';

        function updateEmptyStateUi() {
            const hasItems = state.items.length > 0;
            const tabIndices = factoryTaskTabApi.filterIndicesForTab
                ? factoryTaskTabApi.filterIndicesForTab(state.items, state.factoryTaskTab)
                : state.items.map((_, i) => i);
            const tabHasRows = tabIndices.length > 0;
            const showGlobalEmpty = !hasItems;
            els.emptyState?.classList.toggle('hidden', !showGlobalEmpty);
            syncTaskListViewUi();
            const envVisible = els.envBanner && !els.envBanner.classList.contains('hidden');
            els.emptyStateEnvHint?.classList.toggle('hidden', hasItems || !envVisible);
            if (!hasItems) {
                state.focusedTaskPath = '';
                syncFocusedTaskRowHighlight();
                if (els.taskStation) {
                    els.taskStation.classList.add('hidden');
                    els.taskStation.innerHTML = '';
                }
            }
            // Soft empty for current tab (items exist but none in this tab).
            let tabEmpty = els.factoryTabEmptyHint;
            const doc = getDocument();
            if (!tabEmpty && els.dropZone && doc) {
                tabEmpty = doc.createElement('div');
                tabEmpty.id = 'factoryTabEmptyHint';
                tabEmpty.className = 'hidden absolute inset-0 z-[4] flex items-center justify-center text-sm text-gray-400 pointer-events-none';
                els.dropZone.appendChild(tabEmpty);
                els.factoryTabEmptyHint = tabEmpty;
            }
            if (tabEmpty) {
                const tab = state.factoryTaskTab;
                tabEmpty.textContent = tab === 'done'
                    ? '暂无已顺利完成的任务 · 可到字幕库查看'
                    : (tab === 'active' ? '当前没有进行中的任务' : '暂无任务');
                tabEmpty.classList.toggle('hidden', showGlobalEmpty || tabHasRows);
            }
        }

        function syncFocusedTaskRowHighlight() {
            const want = normPath(state.focusedTaskPath);
            els.fileListBody?.querySelectorAll('tr.task-row').forEach((row) => {
                const path = String(row.dataset.path || '');
                row.classList.toggle('is-focused', !!want && path === want);
            });
            els.taskCardList?.querySelectorAll('.task-card').forEach((card) => {
                const path = String(card.dataset.path || '');
                card.classList.toggle('is-focused', !!want && path === want);
            });
        }

        function setFocusedTaskPath(filePath) {
            const next = normPath(filePath);
            if (!next) {
                state.focusedTaskPath = '';
                syncFocusedTaskRowHighlight();
                return;
            }
            state.focusedTaskPath = next;
            syncFocusedTaskRowHighlight();
        }

        function focusTaskFromSelection() {
            const selected = state.items.filter((i) => i.selected);
            if (selected.length === 1) {
                setFocusedTaskPath(selected[0].path);
                return;
            }
            if (state.focusedTaskPath) {
                const still = state.items.some((i) => normPath(i.path) === state.focusedTaskPath);
                if (still) {
                    syncFocusedTaskRowHighlight();
                    return;
                }
            }
            setFocusedTaskPath('');
        }

        async function openItemInFolder(item) {
            const target = showPathForItem(item);
            if (!target) return;
            const res = await electron?.showInFolder?.(target);
            if (res?.ok === false && res?.error) {
                appendLog(res.error, 'err');
            }
        }

        function openItemEditor(item) {
            if (!item) return;
            const subPath = getSubtitlePathForItem(item);
            if (!subPath) {
                appendLog('该条目尚无字幕可编辑', 'warn');
                return;
            }
            global.TransubSubtitleEditor?.openEditor?.(subPath, item.path || '');
        }

        function retrySingleItem(idx) {
            if (state.running) return;
            const item = state.items[idx];
            if (!item || (item.status !== 'failed' && item.status !== 'error')) return;
            item.status = 'ready';
            item.progress = 0;
            item.processedSec = 0;
            item.processedTotalSec = 0;
            item.detail = '';
            item.error = '';
            item.recovery = null;
            item.selected = true;
            state.items.forEach((it, i) => {
                if (i !== idx) it.selected = false;
            });
            renderList();
            updateStartButton();
            appendLog(`正在重试「${basename(item.path)}」…`, 'info');
            showToast('正在重试本条…', 'ok');
            void startSubtitleGeneration();
        }

        function prepareItemForExecute(item) {
            if (!item) return;
            const status = String(item.status || '');
            if (status === 'failed' || status === 'cancelled' || status === 'error'
                || status === 'done' || status === 'skipped') {
                item.status = 'ready';
                item.progress = 0;
                item.processedSec = 0;
                item.processedTotalSec = 0;
                item.detail = '';
                item.error = '';
                item.recovery = null;
            }
        }

        function executeSingleItem(idx) {
            const item = state.items[idx];
            if (!item?.path) {
                showToast('请先选择要执行的媒体', 'warn');
                return;
            }
            if (state.retranslateBusy || state.postBatchBusy) {
                showToast('当前有其他任务占用，请稍后再试', 'warn');
                return;
            }
            if (String(item.status || '') === 'running') {
                showToast('本条任务正在执行', 'warn');
                return;
            }

            state.items.forEach((it, i) => { it.selected = i === idx; });
            setFocusedTaskPath(item.path);

            if (state.running) {
                prepareItemForExecute(item);
                renderList();
                updateStartButton();
                appendLog(`已加入队列「${basename(item.path)}」…`, 'info');
                showToast('已加入当前任务队列', 'ok');
                void appendItemsToLiveBatch([item]);
                return;
            }

            prepareItemForExecute(item);
            renderList();
            updateStartButton();
            appendLog(`正在执行「${basename(item.path)}」…`, 'info');
            showToast('正在执行本条…', 'ok');
            void startSubtitleGeneration();
        }

        async function resumeSingleItem(idx) {
            if (state.running) return;
            const item = state.items[idx];
            if (!item?.resumable || !item.resumeFromJobId) {
                showToast('没有可继续的进度', 'warn');
                return;
            }
            if (!electron?.transubEngineResumeJob) {
                showToast('当前环境不支持从原文继续', 'warn');
                return;
            }
            item.status = 'running';
            item.detail = '从原文继续翻译…';
            renderList();
            appendLog(`从原文继续翻译：${basename(item.path)} ← ${item.resumeFromJobId}`, 'info');
            try {
                const res = await electron.transubEngineResumeJob({
                    jobId: item.resumeFromJobId,
                    mediaPath: item.path,
                    options: buildRuntimeOptions(),
                });
                if (!res?.ok) {
                    item.status = 'failed';
                    item.detail = res?.error || '从原文继续翻译失败';
                    item.error = item.detail;
                    appendLog(`从原文继续翻译失败：${item.detail}`, 'err');
                    showToast(item.detail, 'err');
                } else {
                    item.status = 'done';
                    item.progress = 100;
                    item.detail = '从原文继续翻译完成';
                    item.subtitlePath = res.subtitlePath || item.subtitlePath;
                    item.sourceSubtitlePath = res.sourceSubtitlePath || item.sourceSubtitlePath;
                    item.targetSubtitlePath = res.targetSubtitlePath || item.targetSubtitlePath;
                    item.bilingualSubtitlePath = res.bilingualSubtitlePath || item.bilingualSubtitlePath;
                    item.resumable = false;
                    item.resumeFromJobId = '';
                    appendLog(`从原文继续翻译完成：${basename(item.path)}`, 'ok');
                    showToast('从原文继续翻译完成', 'ok');
                }
            } catch (err) {
                item.status = 'failed';
                item.detail = err?.message || String(err);
                item.error = item.detail;
                appendLog(`从原文继续翻译异常：${item.detail}`, 'err');
            }
            renderList();
            updateStartButton();
            updateProgressUi();
        }

        async function exportItemDiagnostics(idx) {
            const item = state.items[idx];
            if (!item || !electron?.transubEngineExportDiagnostics) return;
            const res = await electron.transubEngineExportDiagnostics({
                jobId: item.resumeFromJobId || '',
                mediaPath: item.path,
                options: buildRuntimeOptions(),
                logLines: (() => {
                    const renderApi = global.TransubLogPanelRender;
                    const buffered = els.logHost ? renderApi?.get?.(els.logHost)?.getText?.() : '';
                    const raw = buffered || els.logHost?.innerText || '';
                    return raw ? String(raw).split(/\r?\n/).slice(-120) : [];
                })(),
            });
            if (res?.ok) {
                appendLog(`已导出诊断包：${res.dir}`, 'ok');
                showToast(uiTf('诊断包：{dir}', { dir: res.dir }), 'ok');
            } else {
                showToast(res?.error || '导出失败', 'err');
            }
        }

        function buildListRowSharedCtx() {
            const translateMode = readTranslateModeFromForm();
            const task = readTaskFromForm();
            const savedOptionsSnapshot = getSavedOptionsSnapshot();
            return {
                esc,
                basename,
                normPath,
                formatDuration,
                running: !!state.running,
                qcFixing: !!state.qcFixing,
                advancedEntitled: !!getAdvancedEntitled(),
                hasSmartQcFix: !!electron?.transubAdvancedQcSmartFix,
                globalPreset: readGlobalTranslateStylePreset(),
                globalNote: String(
                    savedOptionsSnapshot?.translateStyleCustomNote
                    || els.translateStyleCustomNoteInput?.value
                    || '',
                ).trim(),
                styleApi: translateStyleApi,
                styleEnabled: !!getTranslateStyleEnabled(),
                translateMode,
                task,
                profileApi: getContentProfileApi(),
            };
        }

        function buildListRowHtml(item, idx, sharedCtx) {
            if (taskListRowApi.buildListRowHtml) {
                const ctx = sharedCtx || buildListRowSharedCtx();
                const revealPath = showPathForItem(item);
                const subPath = getSubtitlePathForItem(item);
                return taskListRowApi.buildListRowHtml(item, idx, {
                    esc: ctx.esc,
                    basename: ctx.basename,
                    normPath: ctx.normPath,
                    formatDuration: ctx.formatDuration,
                    revealPath,
                    subPath,
                    running: ctx.running,
                    qcFixing: ctx.qcFixing,
                    advancedEntitled: ctx.advancedEntitled,
                    hasSmartQcFix: ctx.hasSmartQcFix,
                    errorExpanded: expandedErrorRows.has(idx),
                    elapsed: formatElapsedCell(item),
                    processed: formatProcessedCell(item),
                    canPostBatch: getPostBatchPathsForItem(item).length > 0,
                    canRemove: liveBatchQueueApi.canRemoveTaskItem
                        ? liveBatchQueueApi.canRemoveTaskItem(item, {
                            running: !!state.running,
                            retranslateBusy: !!state.retranslateBusy,
                        })
                        : (!state.retranslateBusy && !(state.running && item.status === 'running')),
                    canStop: item.status === 'running' && !!state.running && !state.retranslateBusy,
                    globalPreset: ctx.globalPreset,
                    globalNote: ctx.globalNote,
                    styleApi: ctx.styleApi,
                    styleEnabled: ctx.styleEnabled !== false,
                });
            }
            return '';
        }

        function bindListRowEvents(scope) {
            const root = scope || els.fileListBody;
            if (!root) return;
            root.querySelectorAll('[data-row-check]').forEach((cb) => {
                if (cb.dataset.bound === '1') return;
                cb.dataset.bound = '1';
                cb.addEventListener('change', () => {
                    const row = cb.closest('[data-idx]');
                    const idx = Number(row?.dataset.idx);
                    if (state.items[idx]) state.items[idx].selected = cb.checked;
                    syncSelectAllCheck();
                    updateStartButton();
                    updateAutoSenseUi();
                    if (cb.checked && state.items[idx]) {
                        setFocusedTaskPath(state.items[idx].path);
                    } else {
                        focusTaskFromSelection();
                    }
                });
            });
        }

        function isCardsView() {
            const view = factoryTaskUiApi.normalizeView
                ? factoryTaskUiApi.normalizeView(state.taskListView)
                : (state.taskListView === 'table' ? 'table' : 'cards');
            return view === 'cards';
        }

        /**
         * In-place progress/detail patch for a running row/card (no innerHTML rebuild).
         * Returns false when structure must change (status flip, missing hooks).
         */
        function patchLightRunningDom(root, item, kind) {
            if (!root || !item || String(item.status || '') !== 'running') return false;
            if (String(root.getAttribute('data-status') || '') !== 'running') return false;
            const pct = Math.max(0, Math.min(100, Number(item.progress) || 0));
            const pctRounded = Math.round(pct);
            const detail = String(item.detail || item.error || '').trim();
            const elapsed = formatElapsedCell(item);
            if (kind === 'card') {
                const bar = root.querySelector('.task-card-prog-bar')
                    || root.querySelector('.task-card-prog > i');
                const progLabel = root.querySelector('.task-card-progress');
                const detailEl = root.querySelector('.task-card-run-detail');
                const etaEl = root.querySelector('.task-card-run-eta');
                const elapsedEl = root.querySelector('.task-card-elapsed');
                if (!bar || !progLabel) return false;
                bar.style.width = `${pctRounded}%`;
                const progWrap = root.querySelector('.task-card-prog');
                if (progWrap) progWrap.title = `${pctRounded}%`;
                progLabel.textContent = `${pctRounded}%`;
                if (detailEl) detailEl.textContent = detail || '进行中';
                const eta = formatStationEta(item);
                if (etaEl) {
                    etaEl.textContent = eta ? `剩余时间${eta}` : '';
                    etaEl.classList.toggle('hidden', !eta);
                }
                if (elapsedEl && elapsed && elapsed !== '—') {
                    elapsedEl.textContent = `耗时 ${elapsed}`;
                }
                if (factoryTaskUiApi.resolvePipelineIndex && factoryTaskUiApi.PIPELINE) {
                    const pipeIdx = factoryTaskUiApi.resolvePipelineIndex(item);
                    const dots = root.querySelectorAll('.task-pipe-dot');
                    dots.forEach((dot, i) => {
                        dot.classList.toggle('is-on', i <= pipeIdx);
                    });
                    const steps = root.querySelectorAll('.task-pipe-step');
                    steps.forEach((node, i) => {
                        node.classList.toggle('is-done', i < pipeIdx);
                        node.classList.toggle('is-current', i === pipeIdx);
                    });
                    const segs = root.querySelectorAll('.task-pipe-seg');
                    segs.forEach((seg, i) => {
                        const isFlow = pipeIdx > 0 ? i === pipeIdx - 1 : i === 0;
                        seg.classList.toggle('is-flow', isFlow);
                        seg.classList.toggle('is-done', !isFlow && i < pipeIdx);
                    });
                }
                return true;
            }
            // table row
            const elapsedTd = root.querySelector('.col-elapsed');
            if (elapsedTd) {
                elapsedTd.textContent = elapsed || '—';
                if (elapsed && elapsed !== '—') elapsedTd.title = `已用 ${elapsed}`;
            }
            const live = root.querySelector('.row-progress-live');
            if (!live) return false;
            const bar = live.querySelector('.row-mini-progress-bar')
                || live.querySelector('.row-mini-progress > span');
            const hint = live.querySelector('.row-progress-hint');
            if (!bar || !hint) return false;
            bar.style.width = `${pct}%`;
            const stageShort = ({
                starting: '启动', denoise: '降噪', separate: '分离', vad: 'VAD',
                model: '加载', transcribe: '原文', source_cleanup: '清洗',
                semantic_repair: '语义', pre_mt_qc: '门闸', translate: '翻译',
                cleanup: '润色', qc_fix: 'QC', qc_loop: '闭环', save: '保存',
            })[item.stage] || '';
            hint.textContent = stageShort ? `${stageShort} · ${pctRounded}%` : `${pctRounded}%`;
            const titleDetail = detail || `已用 ${elapsed}`;
            live.title = titleDetail;
            const detailEl = root.querySelector('.col-status .cell-ellipsis');
            if (detailEl && detail) {
                detailEl.textContent = detail;
                detailEl.title = detail;
            }
            return true;
        }

        function replaceActiveListNode(idx, item, sharedCtx) {
            const doc = getDocument();
            if (!doc) return false;
            let patched = false;
            if (isCardsView()) {
                const card = els.taskCardList?.querySelector(`.task-card[data-idx="${idx}"]`);
                if (card && els.taskCardList) {
                    const pos = card.querySelector('.task-card-pos')?.textContent || '';
                    const wrap = doc.createElement('div');
                    wrap.innerHTML = buildListCardHtml(item, idx, sharedCtx, pos).trim();
                    const nextCard = wrap.firstElementChild;
                    if (nextCard) {
                        card.replaceWith(nextCard);
                        bindListRowEvents(nextCard);
                        patched = true;
                    }
                }
            } else {
                const row = els.fileListBody?.querySelector(`tr[data-idx="${idx}"]`);
                if (row && els.fileListBody) {
                    const tmp = doc.createElement('tbody');
                    tmp.innerHTML = buildListRowHtml(item, idx, sharedCtx).trim();
                    const next = tmp.firstElementChild;
                    if (next) {
                        row.replaceWith(next);
                        bindListRowEvents(next);
                        patched = true;
                    }
                }
            }
            return patched;
        }

        function refreshListRowByIndex(idx, opts = {}) {
            if (idx < 0 || idx >= state.items.length) return false;
            const item = state.items[idx];
            const light = opts.light === true;
            if (light) {
                const cards = isCardsView();
                const root = cards
                    ? els.taskCardList?.querySelector(`.task-card[data-idx="${idx}"]`)
                    : els.fileListBody?.querySelector(`tr[data-idx="${idx}"]`);
                if (root && patchLightRunningDom(root, item, cards ? 'card' : 'row')) {
                    updateTaskStation();
                    syncFocusedTaskRowHighlight();
                    return true;
                }
            }
            const sharedCtx = buildListRowSharedCtx();
            const patched = replaceActiveListNode(idx, item, sharedCtx);
            updateTaskStation();
            // Progress ticks: skip recipe/QC banner work (expensive form reads + item scans).
            if (!light) {
                updateRecipeCapsule();
                updateQcBanner();
            }
            // In-place row patch skips renderList, which is the only other path that
            // refreshes tab counts. A finished item would otherwise leave 「完成」 at 0
            // until the user clicks another tab.
            const leavesCurrentTab = typeof factoryTaskTabApi.itemMatchesTab === 'function'
                && !factoryTaskTabApi.itemMatchesTab(item, state.factoryTaskTab);
            if (!patched || leavesCurrentTab) {
                renderList();
                return true;
            }
            if (!light) syncFactoryTaskTabUi();
            syncFocusedTaskRowHighlight();
            return true;
        }

        function refreshListRow(item, opts = {}) {
            if (!item) return false;
            const idx = state.items.indexOf(item);
            if (idx < 0) {
                const byPath = state.items.findIndex((it) => normPath(it.path) === normPath(item.path));
                if (byPath < 0) return false;
                return refreshListRowByIndex(byPath, opts);
            }
            return refreshListRowByIndex(idx, opts);
        }

        function syncSelectAllCheck() {
            const n = state.items.length;
            const selectedCount = state.items.filter((i) => i.selected).length;
            const st = taskListRowApi.computeSelectAllState
                ? taskListRowApi.computeSelectAllState(state.items)
                : {
                    checked: n > 0 && selectedCount === n,
                    indeterminate: selectedCount > 0 && selectedCount < n,
                };
            if (els.selectAllCheck) {
                els.selectAllCheck.checked = st.checked;
                els.selectAllCheck.indeterminate = st.indeterminate;
                if (!state.retranslateBusy) els.selectAllCheck.disabled = n === 0;
            }
            const btn = els.selectAllItemsBtn;
            if (btn) {
                const desc = taskListRowApi.describeSelectAllToolbar
                    ? taskListRowApi.describeSelectAllToolbar(st)
                    : {
                        iconClass: st.checked ? 'fa fa-check-square' : (st.indeterminate ? 'fa fa-minus-square-o' : 'fa fa-square-o'),
                        title: st.checked ? '取消全选 (Ctrl+A)' : '全选 (Ctrl+A)',
                        ariaLabel: st.checked ? '取消全选' : '全选',
                        ariaChecked: st.checked ? 'true' : (st.indeterminate ? 'mixed' : 'false'),
                    };
                const icon = btn.querySelector?.('i.fa');
                const sr = btn.querySelector?.('.sr-only');
                btn.title = uiTf(desc.title);
                btn.setAttribute('aria-label', uiTf(desc.ariaLabel));
                btn.setAttribute('aria-checked', desc.ariaChecked);
                btn.removeAttribute('aria-pressed');
                btn.classList.toggle('is-partial', desc.ariaChecked === 'mixed');
                btn.classList.toggle('is-all-selected', desc.ariaChecked === 'true');
                if (!state.retranslateBusy) btn.disabled = n === 0;
                if (icon) icon.className = desc.iconClass;
                if (sr) sr.textContent = uiTf(desc.ariaLabel);
            }
        }

        function applyTaskSelection(selected) {
            const on = !!selected;
            state.items.forEach((i) => { i.selected = on; });
            renderList();
            updateStartButton();
            focusTaskFromSelection();
        }

        function toggleTaskSelectAll() {
            if (!state.items.length || state.retranslateBusy) return;
            const allSelected = state.items.every((i) => i.selected);
            applyTaskSelection(!allSelected);
        }

        function syncRecipeSheetUi() {
            const expert = !!state.recipeExpert;
            const open = expert || !!state.recipeSheetOpen;
            const doc = getDocument();
            doc?.body?.classList.toggle('recipe-expert', expert);
            if (els.recipeSheet) {
                els.recipeSheet.classList.toggle('hidden', !open);
                if (open) els.recipeSheet.removeAttribute('hidden');
                else els.recipeSheet.setAttribute('hidden', '');
            }
            if (els.recipeCapsuleBtn) {
                els.recipeCapsuleBtn.classList.toggle('is-open', open && !expert);
                els.recipeCapsuleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
            }
            if (els.recipeExpertToggle) {
                els.recipeExpertToggle.classList.toggle('is-active', expert);
                els.recipeExpertToggle.setAttribute('aria-pressed', expert ? 'true' : 'false');
                els.recipeExpertToggle.title = expert
                    ? '关闭专家模式（收起参数条）'
                    : '始终展开参数条（专家）';
            }
        }

        function setRecipeSheetOpen(open) {
            state.recipeSheetOpen = !!open;
            syncRecipeSheetUi();
        }

        function setRecipeExpert(on) {
            state.recipeExpert = !!on;
            try {
                if (typeof localStorage !== 'undefined') {
                    localStorage.setItem('transub.recipeExpert', state.recipeExpert ? '1' : '0');
                }
            } catch (_) { /* ignore */ }
            if (state.recipeExpert) state.recipeSheetOpen = true;
            syncRecipeSheetUi();
        }

        function syncTaskListViewUi() {
            const view = factoryTaskUiApi.normalizeView
                ? factoryTaskUiApi.normalizeView(state.taskListView)
                : (state.taskListView === 'table' ? 'table' : 'cards');
            state.taskListView = view;
            const isCards = view === 'cards';
            els.taskViewCardsBtn?.classList.toggle('is-active', isCards);
            els.taskViewTableBtn?.classList.toggle('is-active', !isCards);
            els.taskViewCardsBtn?.setAttribute('aria-pressed', isCards ? 'true' : 'false');
            els.taskViewTableBtn?.setAttribute('aria-pressed', !isCards ? 'true' : 'false');
            const hasItems = state.items.length > 0;
            if (els.taskCardList) {
                els.taskCardList.classList.toggle('hidden', !hasItems || !isCards);
            }
            if (els.listScroll) {
                els.listScroll.classList.toggle('hidden', !hasItems || isCards);
            }
        }

        function setTaskListView(view) {
            const next = factoryTaskUiApi.normalizeView
                ? factoryTaskUiApi.normalizeView(view)
                : (view === 'table' ? 'table' : 'cards');
            if (state.taskListView === next) {
                syncTaskListViewUi();
                return;
            }
            state.taskListView = next;
            try {
                if (typeof localStorage !== 'undefined') {
                    localStorage.setItem('transub.taskListView', next);
                }
            } catch (_) { /* ignore */ }
            // Toggle visibility first so the target pane is shown, then refresh both panes.
            syncTaskListViewUi();
            renderList();
            updateTaskStation();
        }

        function updateRecipeCapsule() {
            if (!els.recipeCapsuleSummary && !els.recipeCapsuleBtn) return cachedRecipeLine || '';
            const task = readTaskFromForm();
            const language = els.quickLanguageSelect?.value || 'auto';
            const targetLang = els.quickTargetLangSelect?.value || 'simplified';
            const translateLabel = shortTranslateModelsSummary() || els.quickTranslateLabel?.textContent || '';
            const paramsLabel = els.paramsModeLabel?.textContent || '';
            const qcLabel = els.paramsMoreLabel?.textContent
                || els.postBatchQcFixLabel?.textContent
                || '';
            const dualApi = getDualSubtitleApi();
            const bilingualLabel = dualApi?.summarizeBilingualRecipe
                ? dualApi.summarizeBilingualRecipe({
                    task,
                    merge: task === 'dual' && !!els.mergeBilingualCheck?.checked,
                    lineOrder: readDualLineOrderFromForm(),
                    deleteSources: !!els.deleteSourcesAfterMergeCheck?.checked,
                })
                : '';
            const summary = factoryTaskUiApi.buildRecipeSummary
                ? factoryTaskUiApi.buildRecipeSummary({
                    task,
                    language,
                    targetLang,
                    translateLabel,
                    bilingualLabel,
                    senseLabel: paramsLabel,
                    qcLabel,
                })
                : [task, language, translateLabel, bilingualLabel, paramsLabel].filter(Boolean).join(' · ');
            cachedRecipeLine = summary;
            if (els.recipeCapsuleSummary) els.recipeCapsuleSummary.textContent = summary;
            if (els.recipeCapsuleBtn) els.recipeCapsuleBtn.title = `参数：${summary}`;
            return summary;
        }

        function formatStationEta(item) {
            if (!item || item.status !== 'running') return '';
            try {
                const etaSec = computeEtaSec();
                if (Number.isFinite(etaSec) && etaSec > 0 && etaApi?.formatEtaCompact) {
                    return etaApi.formatEtaCompact(etaSec);
                }
            } catch { /* ignore */ }
            return '';
        }

        function updateTaskStation() {
            // Station panel removed: pipeline / ETA / detail live on the running task card.
            if (!els.taskStation) return null;
            els.taskStation.classList.add('hidden');
            els.taskStation.innerHTML = '';
            return null;
        }

        function buildListCardHtml(item, idx, sharedCtx, queuePos) {
            if (!factoryTaskUiApi.buildCardHtml) return '';
            const ctx = sharedCtx || buildListRowSharedCtx();
            const isRunning = item.status === 'running';
            const canRemove = liveBatchQueueApi.canRemoveTaskItem
                ? liveBatchQueueApi.canRemoveTaskItem(item, {
                    running: !!state.running,
                    retranslateBusy: !!state.retranslateBusy,
                })
                : (!state.retranslateBusy && !(state.running && isRunning));
            const canStop = isRunning && !!state.running && !state.retranslateBusy;
            const styleBadgeHtml = taskListRowApi.buildStyleBadgeHtml
                ? taskListRowApi.buildStyleBadgeHtml(item, {
                    esc: ctx.esc,
                    globalPreset: ctx.globalPreset,
                    globalNote: ctx.globalNote,
                    styleApi: ctx.styleApi,
                    styleEnabled: ctx.styleEnabled !== false,
                    idx,
                })
                : '';
            return factoryTaskUiApi.buildCardHtml(item, idx, {
                esc: ctx.esc,
                basename: ctx.basename,
                formatDuration: ctx.formatDuration,
                running: ctx.running,
                queuePos,
                subPath: getSubtitlePathForItem(item),
                revealPath: showPathForItem(item),
                elapsed: formatElapsedCell(item),
                processed: formatProcessedCell(item),
                eta: isRunning ? formatStationEta(item) : '',
                recipeLine: isRunning ? (cachedRecipeLine || updateRecipeCapsule() || '') : '',
                canRemove,
                canStop,
                statusMetaFn: taskListRowApi.statusMeta,
                styleBadgeHtml,
            });
        }

        function removeSingleItem(idx) {
            if (state.retranslateBusy) return;
            const item = state.items[idx];
            if (!item) return;
            const canRemove = liveBatchQueueApi.canRemoveTaskItem
                ? liveBatchQueueApi.canRemoveTaskItem(item, {
                    running: !!state.running,
                    retranslateBusy: !!state.retranslateBusy,
                })
                : !(state.running && item.status === 'running');
            if (!canRemove) {
                if (state.running && item.status === 'running') {
                    appendLog('进行中的任务无法移除，可先停止或等待完成', 'warn');
                }
                return;
            }
            void removeItemsFromList([item]);
        }

        function syncFactoryTaskTabUi() {
            const tab = factoryTaskTabApi.normalizeTab
                ? factoryTaskTabApi.normalizeTab(state.factoryTaskTab)
                : (state.factoryTaskTab === 'done'
                    || state.factoryTaskTab === 'active'
                    || state.factoryTaskTab === 'failed'
                    ? state.factoryTaskTab
                    : 'all');
            state.factoryTaskTab = tab;
            const counts = factoryTaskTabApi.countTabs
                ? factoryTaskTabApi.countTabs(state.items)
                : { all: 0, active: 0, done: 0, failed: 0, running: 0 };
            if (els.factoryTabAllCount) els.factoryTabAllCount.textContent = String(counts.all ?? counts.total ?? 0);
            if (els.factoryTabActiveCount) els.factoryTabActiveCount.textContent = String(counts.active);
            if (els.factoryTabDoneCount) els.factoryTabDoneCount.textContent = String(counts.done);
            if (els.factoryTabFailedCount) els.factoryTabFailedCount.textContent = String(counts.failed ?? 0);
            const syncTabBtn = (el, key) => {
                if (!el) return;
                el.classList.toggle('is-active', tab === key);
                el.setAttribute('aria-selected', tab === key ? 'true' : 'false');
            };
            syncTabBtn(els.factoryTabAll, 'all');
            syncTabBtn(els.factoryTabActive, 'active');
            syncTabBtn(els.factoryTabDone, 'done');
            syncTabBtn(els.factoryTabFailed, 'failed');
            if (els.factoryTaskSummary && factoryTaskTabApi.buildTabsSummary) {
                const engineLabel = els.factoryEngineLabel?.textContent || '就绪';
                els.factoryTaskSummary.textContent = factoryTaskTabApi.buildTabsSummary({
                    total: counts.total ?? counts.all ?? 0,
                    running: counts.running ?? 0,
                    engineLabel,
                });
            }
        }

        function setFactoryTaskTab(tab) {
            const next = factoryTaskTabApi.normalizeTab
                ? factoryTaskTabApi.normalizeTab(tab)
                : (tab === 'done' || tab === 'active' || tab === 'failed' ? tab : 'all');
            if (state.factoryTaskTab === next) {
                syncFactoryTaskTabUi();
                return;
            }
            state.factoryTaskTab = next;
            renderList();
        }

        function pickFactoryHandoffItem() {
            const selected = getSelectedItems();
            const withSub = selected.find((it) => getSubtitlePathForItem(it));
            if (withSub) return withSub;
            if (selected[0]) return selected[0];
            const doneWithSub = state.items.find((it) => it.status === 'done' && getSubtitlePathForItem(it));
            if (doneWithSub) return doneWithSub;
            return state.items.find((it) => it.status === 'done') || null;
        }

        function openItemInPlayer(item) {
            if (!item?.path) {
                showToast('请先选择要播放的媒体', 'warn');
                return;
            }
            const sub = getSubtitlePathForItem(item) || '';
            const q = new URLSearchParams();
            q.set('media', item.path);
            if (sub) q.set('sub', sub);
            const url = `transub://open?${q.toString()}`;
            void (electron?.openExternal?.(url) || electron?.openPath?.(item.path));
        }

        function renderList() {
            if (!els.fileListBody && !els.taskCardList) return;
            applyListSortInPlace();
            syncFactoryTaskTabUi();
            updateRecipeCapsule();
            updateTaskStation();
            if (!state.items.length) {
                if (els.fileListBody) els.fileListBody.innerHTML = '';
                if (els.taskCardList) els.taskCardList.innerHTML = '';
                syncTaskTableSortHeaders();
                applyTaskColumnWidths();
                updateEmptyStateUi();
                updateQcBanner();
                updateContentProfileUi();
                updateStartButton();
                syncSelectAllCheck();
                return;
            }

            const sharedCtx = buildListRowSharedCtx();
            const indices = factoryTaskTabApi.filterIndicesForTab
                ? factoryTaskTabApi.filterIndicesForTab(state.items, state.factoryTaskTab)
                : state.items.map((_, i) => i);
            // Keep running item in the queue list too — station is a highlight, not a move.
            // Filtering it out caused the task to "vanish" when switching card/table views.
            // Only build the visible view (cards XOR table) to cut progress-tick DOM cost ~50%.
            const cards = isCardsView();
            syncTaskListViewUi();
            if (cards) {
                if (els.fileListBody) els.fileListBody.innerHTML = '';
                if (els.taskCardList) {
                    const cardHtml = indices.map((idx, n) => buildListCardHtml(
                        state.items[idx],
                        idx,
                        sharedCtx,
                        `#${n + 1}`,
                    ));
                    els.taskCardList.innerHTML = cardHtml.join('');
                    bindListRowEvents(els.taskCardList);
                }
            } else {
                if (els.taskCardList) els.taskCardList.innerHTML = '';
                if (els.fileListBody) {
                    const rows = indices.map((idx) => buildListRowHtml(state.items[idx], idx, sharedCtx));
                    els.fileListBody.innerHTML = rows.join('');
                    bindListRowEvents(els.fileListBody);
                }
            }
            syncTaskTableSortHeaders();
            applyTaskColumnWidths();
            updateEmptyStateUi();
            updateQcBanner();
            updateStartButton();
            updateContentProfileUi();
            syncSelectAllCheck();
            if (state.focusedTaskPath) {
                const still = state.items.some((i) => normPath(i.path) === state.focusedTaskPath);
                if (still) syncFocusedTaskRowHighlight();
                else setFocusedTaskPath('');
            }
        }

        return {
            updateEmptyStateUi,
            syncFocusedTaskRowHighlight,
            setFocusedTaskPath,
            focusTaskFromSelection,
            applyTaskSelection,
            toggleTaskSelectAll,
            openItemInFolder,
            openItemEditor,
            retrySingleItem,
            executeSingleItem,
            resumeSingleItem,
            exportItemDiagnostics,
            buildListRowSharedCtx,
            buildListRowHtml,
            bindListRowEvents,
            refreshListRowByIndex,
            refreshListRow,
            syncSelectAllCheck,
            syncRecipeSheetUi,
            setRecipeSheetOpen,
            setRecipeExpert,
            syncTaskListViewUi,
            setTaskListView,
            updateRecipeCapsule,
            formatStationEta,
            updateTaskStation,
            buildListCardHtml,
            removeSingleItem,
            syncFactoryTaskTabUi,
            setFactoryTaskTab,
            pickFactoryHandoffItem,
            openItemInPlayer,
            renderList,
        };
    }

    return { createFactoryTaskListUi };
}));
