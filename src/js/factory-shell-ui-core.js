/**
 * Factory shell chrome UI: post-task/add menus, log splitter, theme/density,
 * factory titlebar chrome, settings guide links.
 * Shell injects DOM/IPC/state via createFactoryShellUi(deps).
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubFactoryShellUi = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function factoryShellUiFactory(global) {
    /**
     * @param {object} deps shell adapters
     */
    function createFactoryShellUi(deps) {
        const d = deps || {};
        const state = d.state;
        const els = d.els || {};
        const electron = d.electron;
        const postTaskQcApi = d.postTaskQcApi || {};
        const factoryTaskUiApi = d.factoryTaskUiApi || {};
        const factoryTaskReorderApi = d.factoryTaskReorderApi || {};
        const POST_TASK_SELECT_VALUES = d.POST_TASK_SELECT_VALUES
            || new Set(postTaskQcApi.POST_TASK_ACTIONS || ['none', 'quit', 'shutdown', 'sleep', 'open_folder']);
        const POST_TASK_LABELS = d.POST_TASK_LABELS || postTaskQcApi.POST_TASK_LABELS || {
            none: '无额外操作',
            open_folder: '打开输出目录',
            sleep: '睡眠',
            quit: '退出应用',
            shutdown: '关机',
        };

        const uiTf = d.uiTf || ((s) => s);
        const appConfirm = d.appConfirm || (async () => false);
        const showToast = d.showToast || (() => {});
        const syncPostTaskExtrasUi = d.syncPostTaskExtrasUi || (() => {});
        const syncPostTaskToMain = d.syncPostTaskToMain || (async () => {});
        const setTranslateModeMenuOpen = d.setTranslateModeMenuOpen || (() => {});
        const setMtModelMenuOpen = d.setMtModelMenuOpen || (() => {});
        const setPostBatchQcFixMenuOpen = d.setPostBatchQcFixMenuOpen || (() => {});
        const setParamsModeMenuOpen = d.setParamsModeMenuOpen || (() => {});
        const setExpertExtrasMenuOpen = d.setExpertExtrasMenuOpen || (() => {});
        const setMoreMenuOpen = d.setMoreMenuOpen || (() => {});
        const setTranslateMenuOpen = d.setTranslateMenuOpen || (() => {});
        const setParamsMoreMenuOpen = d.setParamsMoreMenuOpen || (() => {});
        const setBilingualMenuOpen = d.setBilingualMenuOpen || (() => {});
        const setTranslateStyleMenuOpen = d.setTranslateStyleMenuOpen || (() => {});
        const setClearListMenuOpen = d.setClearListMenuOpen || (() => {});
        const getTranslateMenuOpen = d.getTranslateMenuOpen || (() => false);
        const getParamsMoreMenuOpen = d.getParamsMoreMenuOpen || (() => false);
        const getExpertExtrasMenuOpen = d.getExpertExtrasMenuOpen || (() => false);
        const getPostBatchQcFixMenuOpen = d.getPostBatchQcFixMenuOpen || (() => false);
        const getParamsModeMenuOpen = d.getParamsModeMenuOpen || (() => false);
        const getBilingualMenuOpen = d.getBilingualMenuOpen || (() => false);
        const getTranslateStyleMenuOpen = d.getTranslateStyleMenuOpen || (() => false);
        const addVideos = d.addVideos || (async () => {});
        const addFolder = d.addFolder || (async () => {});
        const autoAddMissingSubtitles = d.autoAddMissingSubtitles || (async () => {});
        const getAutoScanFoldersDraft = d.getAutoScanFoldersDraft || (() => []);
        const setAutoScanFoldersDraft = d.setAutoScanFoldersDraft || (() => {});
        const syncRecipeSheetUi = d.syncRecipeSheetUi || (() => {});
        const syncTaskListViewUi = d.syncTaskListViewUi || (() => {});
        const openLogDetailModal = d.openLogDetailModal || (() => {});
        const closeLogDetailModal = d.closeLogDetailModal || (() => {});
        const syncLogDetailSheetAnchor = d.syncLogDetailSheetAnchor || (() => {});
        const getIsStandaloneChrome = d.getIsStandaloneChrome || (() => !!d.isStandaloneChrome);
        const getAdvancedEntitled = d.getAdvancedEntitled || (() => !!d.advancedEntitled);
        const setFactoryTaskTab = d.setFactoryTaskTab || (() => {});
        // Desktop opens the dedicated settings window; fall back to in-page modal.
        const openAppSettings = d.openAppSettings
            || ((tab, opts) => (d.openParamsModal || (() => {}))(tab, opts));
        const setDropActive = d.setDropActive || (() => {});
        const renderList = d.renderList || (() => {});
        const setFactoryWorkspace = d.setFactoryWorkspace || (() => {});
        const openFactoryShelfWorkspace = d.openFactoryShelfWorkspace || (() => {});
        const markSettingsDirty = d.markSettingsDirty || (() => {});
        const openTransubPlayerApp = d.openTransubPlayerApp || (async () => {});
        const syncFactoryTaskTabUi = d.syncFactoryTaskTabUi || (() => {});
        const updateRecipeCapsule = d.updateRecipeCapsule || (() => {});
        const updateFactoryStatusLogFromHost = d.updateFactoryStatusLogFromHost || (() => {});
        const syncFactoryEngineStatus = d.syncFactoryEngineStatus || (() => {});
        const syncResourceUsageMonitor = d.syncResourceUsageMonitor || (() => {});
        const setRecipeSheetOpen = d.setRecipeSheetOpen || (() => {});
        const setRecipeExpert = d.setRecipeExpert || (() => {});
        const setTaskListView = d.setTaskListView || (() => {});
        const switchParamsTab = d.switchParamsTab || (() => {});
        const promptProUnlockRequired = d.promptProUnlockRequired || (async () => {});
        const openEngineModelsLibrary = d.openEngineModelsLibrary || (async () => {});

        function getPostTaskAction() {
            const action = state.postTaskAction || 'none';
            if (postTaskQcApi.normalizePostTaskAction) {
                return postTaskQcApi.normalizePostTaskAction(action);
            }
            return POST_TASK_SELECT_VALUES.has(action) ? action : 'none';
        }

        function setPostTaskAction(action) {
            let next = postTaskQcApi.normalizePostTaskAction
                ? postTaskQcApi.normalizePostTaskAction(action)
                : (POST_TASK_SELECT_VALUES.has(action) ? action : 'none');
            if (next === 'shutdown') {
                void appConfirm({
                    title: '确认关机',
                    message: '全部成功后将关机。确定选择「关机」吗？',
                    primaryLabel: '确定',
                    secondaryLabel: '取消',
                }).then((ok) => {
                    if (!ok) next = getPostTaskAction();
                    else {
                        state.postTaskAction = 'shutdown';
                        syncPostTaskMenuUi();
                        syncPostTaskExtrasUi();
                        syncPostTaskToMain();
                    }
                });
                return;
            }
            state.postTaskAction = next;
            syncPostTaskMenuUi();
            syncPostTaskExtrasUi();
            syncPostTaskToMain();
        }

        function syncPostTaskMenuUi() {
            const action = getPostTaskAction();
            const label = postTaskQcApi.postTaskActionLabel
                ? postTaskQcApi.postTaskActionLabel(action)
                : (POST_TASK_LABELS[action] || POST_TASK_LABELS.none);
            els.postTaskMenuBtn?.classList.toggle('active', action !== 'none');
            if (els.postTaskMenuLabel) {
                els.postTaskMenuLabel.textContent = action === 'none' ? '完成后' : label;
            }
            if (els.postTaskMenuBtn) {
                els.postTaskMenuBtn.title = action === 'none'
                    ? '任务完成后操作'
                    : uiTf('任务完成后：{label}', { label });
            }
            els.postTaskMenuItems?.forEach((item) => {
                const active = item.dataset.postTask === action;
                item.classList.toggle('active', active);
                item.setAttribute('aria-checked', active ? 'true' : 'false');
            });
        }

        function setPostTaskMenuOpen(open) {
            state.postTaskMenuOpen = !!open;
            els.postTaskMenu?.classList.toggle('hidden', !open);
            if (els.postTaskMenuBtn) {
                els.postTaskMenuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
            }
            if (open) {
                setAddMenuOpen(false);
                setTranslateModeMenuOpen(false);
                setMtModelMenuOpen(false);
                setPostBatchQcFixMenuOpen(false);
                setParamsModeMenuOpen(false);
                setExpertExtrasMenuOpen(false);
                setClearListMenuOpen(false);
            }
        }

        function setAddMenuOpen(open) {
            state.addMenuOpen = !!open;
            els.addMenu?.classList.toggle('hidden', !open);
            if (els.addMenuBtn) {
                els.addMenuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
            }
            if (open) {
                setPostTaskMenuOpen(false);
                setTranslateModeMenuOpen(false);
                setMtModelMenuOpen(false);
                setPostBatchQcFixMenuOpen(false);
                setParamsModeMenuOpen(false);
                setExpertExtrasMenuOpen(false);
                setClearListMenuOpen(false);
            }
        }

        function toggleAddMenu() {
            setAddMenuOpen(!state.addMenuOpen);
        }

        function getAutoScanApi() {
            return (typeof globalThis !== 'undefined' && globalThis.TransubAutoScanFolders)
                || (typeof window !== 'undefined' && window.TransubAutoScanFolders)
                || {};
        }

        function refreshAutoScanFoldersListUi() {
            const api = getAutoScanApi();
            const folders = api.normalizeAutoScanFolders
                ? api.normalizeAutoScanFolders(getAutoScanFoldersDraft())
                : (Array.isArray(getAutoScanFoldersDraft()) ? getAutoScanFoldersDraft() : []);
            setAutoScanFoldersDraft(folders);
            if (typeof api.renderAutoScanFoldersList === 'function') {
                api.renderAutoScanFoldersList(els.autoScanFoldersList, folders, {
                    onRemove: (index) => {
                        setAutoScanFoldersDraft(folders.filter((_, i) => i !== index));
                        refreshAutoScanFoldersListUi();
                    },
                });
            }
        }

        function bindAutoScanSettingsUi() {
            els.autoScanAddFolderBtn?.addEventListener('click', async () => {
                const res = await electron?.selectFolder?.({
                    title: '选择要自动扫描的目录',
                    useLastOpenDir: true,
                });
                if (!res?.ok || res.canceled || !res.path) return;
                const api = getAutoScanApi();
                setAutoScanFoldersDraft(api.normalizeAutoScanFolders
                    ? api.normalizeAutoScanFolders([...(getAutoScanFoldersDraft() || []), res.path])
                    : [...(getAutoScanFoldersDraft() || []), res.path]);
                refreshAutoScanFoldersListUi();
            });
        }
        function bindAddMenu() {
            els.addMenuBtn?.addEventListener('click', (event) => {
                event.stopPropagation();
                toggleAddMenu();
            });
            els.addMenuItems?.forEach((item) => {
                item.addEventListener('click', async (event) => {
                    event.stopPropagation();
                    setAddMenuOpen(false);
                    const action = item.dataset.addAction;
                    if (action === 'videos') await addVideos();
                    else if (action === 'folder') await addFolder();
                    else if (action === 'auto-scan') await autoAddMissingSubtitles();
                });
            });
            els.addMenu?.addEventListener('click', (event) => event.stopPropagation());
        }

        function togglePostTaskMenu() {
            setPostTaskMenuOpen(!state.postTaskMenuOpen);
        }

        function bindPostTaskMenu() {
            els.postTaskMenuBtn?.addEventListener('click', (event) => {
                event.stopPropagation();
                togglePostTaskMenu();
            });
            els.postTaskMenuItems?.forEach((item) => {
                item.addEventListener('click', (event) => {
                    event.stopPropagation();
                    setPostTaskAction(item.dataset.postTask || 'none');
                    setPostTaskMenuOpen(false);
                });
            });
            els.playSoundOnCompleteCheck?.addEventListener('change', () => {
                state.playSoundOnComplete = !!els.playSoundOnCompleteCheck.checked;
                syncPostTaskToMain();
            });
            els.playSoundOnCompleteCheck?.addEventListener('click', (event) => event.stopPropagation());
            els.postTaskMenu?.addEventListener('click', (event) => event.stopPropagation());
            document.addEventListener('click', () => {
                if (state.postTaskMenuOpen) setPostTaskMenuOpen(false);
                if (state.addMenuOpen) setAddMenuOpen(false);
                if (state.clearListMenuOpen) setClearListMenuOpen(false);
                if (state.moreMenuOpen) setMoreMenuOpen(false);
                if (getTranslateMenuOpen()) setTranslateMenuOpen(false);
                if (getParamsMoreMenuOpen()) setParamsMoreMenuOpen(false);
                if (getExpertExtrasMenuOpen()) setExpertExtrasMenuOpen(false);
                if (getPostBatchQcFixMenuOpen()) setPostBatchQcFixMenuOpen(false);
                if (getParamsModeMenuOpen()) setParamsModeMenuOpen(false);
                if (getBilingualMenuOpen()) setBilingualMenuOpen(false);
                if (getTranslateStyleMenuOpen()) setTranslateStyleMenuOpen(false);
            });
        }


        const LOG_HEIGHT_KEY = 'transub.logHeight';
        const DEFAULT_LOG_HEIGHT = 168;
        const MIN_LOG_HEIGHT = 96;
        const MIN_LIST_HEIGHT = 160;

        function readStoredLogHeight() {
            try {
                const n = Number(localStorage.getItem(LOG_HEIGHT_KEY));
                if (Number.isFinite(n) && n >= MIN_LOG_HEIGHT) return Math.round(n);
            } catch (_) { /* ignore */ }
            return DEFAULT_LOG_HEIGHT;
        }

        function writeStoredLogHeight(px) {
            try {
                localStorage.setItem(LOG_HEIGHT_KEY, String(Math.round(px)));
            } catch (_) { /* ignore */ }
        }

        function clampLogHeight(px, hostHeight) {
            const hostH = Math.max(0, Number(hostHeight) || 0);
            const maxLog = hostH > 0
                ? Math.max(MIN_LOG_HEIGHT, hostH - MIN_LIST_HEIGHT)
                : Math.max(MIN_LOG_HEIGHT, px);
            return Math.min(maxLog, Math.max(MIN_LOG_HEIGHT, Math.round(px)));
        }

        function applyLogSplitLayout() {
            const host = els.mainSplitHost;
            const log = els.logSection;
            if (!host || !log) return;
            // Factory: log lives in a modal; never pin inline split heights onto #logSection.
            if (document.body.classList.contains('factory-shell')) {
                log.style.height = '';
                log.style.flex = '';
                return;
            }
            if (document.body.classList.contains('log-collapsed')) {
                log.style.height = '';
                log.style.flex = '';
                return;
            }
            const hostH = host.getBoundingClientRect().height;
            const h = clampLogHeight(readStoredLogHeight(), hostH);
            log.style.height = `${h}px`;
            log.style.flex = '0 0 auto';
        }

        function syncLocalThemeKeys(theme) {
            const t = theme === 'dark' ? 'dark' : 'light';
            try {
                localStorage.setItem('transub.mainTheme', t);
                localStorage.setItem('transub-editor-theme', t);
            } catch (_) { /* ignore */ }
            const sel = document.getElementById('appThemeSelect')
                || document.getElementById('editorThemeSelect');
            if (sel) sel.value = t;
        }

        function applyUiPrefs() {
            let density = 'comfort';
            let logCollapsed = true;
            let mainTheme = 'light';
            const logAutoScroll = global.TransubLogAutoScroll?.readEnabled?.() !== false;
            try {
                density = localStorage.getItem('transub.density') || 'comfort';
                logCollapsed = localStorage.getItem('transub.logCollapsed') !== '0';
                mainTheme = localStorage.getItem('transub.mainTheme')
                    || localStorage.getItem('transub-editor-theme')
                    || 'light';
                state.taskListView = factoryTaskUiApi.normalizeView
                    ? factoryTaskUiApi.normalizeView(localStorage.getItem('transub.taskListView'))
                    : (localStorage.getItem('transub.taskListView') === 'table' ? 'table' : 'cards');
                state.recipeExpert = localStorage.getItem('transub.recipeExpert') === '1';
            } catch (_) { /* ignore */ }
            mainTheme = mainTheme === 'dark' ? 'dark' : 'light';
            syncLocalThemeKeys(mainTheme);
            document.body.classList.toggle('density-compact', density === 'compact');
            document.body.classList.toggle('log-collapsed', logCollapsed);
            document.body.classList.toggle('recipe-expert', !!state.recipeExpert);
            document.documentElement.classList.toggle('main-theme-dark', mainTheme === 'dark');
            try {
                document.documentElement.style.colorScheme = mainTheme === 'dark' ? 'dark' : 'light';
            } catch (_) { /* ignore */ }
            if (els.toggleDensityLabel) {
                els.toggleDensityLabel.textContent = density === 'compact' ? '舒适列表' : '紧凑列表';
            }
            if (els.toggleMainThemeLabel) {
                els.toggleMainThemeLabel.textContent = mainTheme === 'dark' ? '浅色界面' : '深色界面';
            }
            const moon = els.factoryThemeToggle?.querySelector?.('.factory-theme-icon-moon');
            const sun = els.factoryThemeToggle?.querySelector?.('.factory-theme-icon-sun');
            if (moon) moon.hidden = mainTheme === 'light';
            if (sun) sun.hidden = mainTheme === 'dark';
            if (els.factoryThemeToggle) {
                const nextLabel = mainTheme === 'dark' ? '切换到浅色' : '切换到深色';
                els.factoryThemeToggle.title = nextLabel;
                els.factoryThemeToggle.setAttribute('aria-label', nextLabel);
            }
            syncRecipeSheetUi();
            syncTaskListViewUi();
            if (els.logCollapseBtn) {
                els.logCollapseBtn.setAttribute('aria-expanded', logCollapsed ? 'false' : 'true');
            }
            if (els.logAutoScrollCheck) {
                els.logAutoScrollCheck.checked = logAutoScroll;
            }
            applyLogSplitLayout();
        }

        function scrollMainLogPanel(panel) {
            const api = global.TransubLogAutoScroll;
            if (api?.scrollPanel) {
                api.scrollPanel(panel, els.logAutoScrollCheck);
                return;
            }
            if (panel) panel.scrollTop = panel.scrollHeight;
        }

        async function hydrateAppThemeFromMain() {
            try {
                const res = await electron?.transubGetAppTheme?.();
                let theme = res?.theme === 'dark' ? 'dark' : 'light';
                if (!res?.persisted) {
                    let localDark = false;
                    try {
                        localDark = localStorage.getItem('transub.mainTheme') === 'dark'
                            || localStorage.getItem('transub-editor-theme') === 'dark';
                    } catch (_) { /* ignore */ }
                    if (localDark && theme !== 'dark') {
                        await electron?.transubSetAppTheme?.({ theme: 'dark' });
                        theme = 'dark';
                    }
                }
                syncLocalThemeKeys(theme);
                applyUiPrefs();
            } catch (_) {
                applyUiPrefs();
            }
        }

        function bindMainLogSplitter() {
            const splitter = els.mainLogSplitter;
            const host = els.mainSplitHost;
            const log = els.logSection;
            if (!splitter || !host || !log || splitter.dataset.bound === '1') return;
            splitter.dataset.bound = '1';

            const beginDrag = (clientY) => {
                if (document.body.classList.contains('log-collapsed')) {
                    ensureLogExpanded();
                }
                const startY = clientY;
                const startH = log.getBoundingClientRect().height || readStoredLogHeight();
                const hostH = host.getBoundingClientRect().height;
                splitter.classList.add('is-dragging');
                document.body.classList.add('main-log-splitting');

                const onMove = (ev) => {
                    const y = ev.touches?.[0]?.clientY ?? ev.clientY;
                    if (!Number.isFinite(y)) return;
                    // Dragging the handle upward enlarges the log pane.
                    const next = clampLogHeight(startH + (startY - y), hostH);
                    log.style.height = `${next}px`;
                    log.style.flex = '0 0 auto';
                };
                const onUp = (ev) => {
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                    window.removeEventListener('touchmove', onMove);
                    window.removeEventListener('touchend', onUp);
                    window.removeEventListener('touchcancel', onUp);
                    splitter.classList.remove('is-dragging');
                    document.body.classList.remove('main-log-splitting');
                    const y = ev?.changedTouches?.[0]?.clientY ?? ev?.clientY;
                    if (Number.isFinite(y)) {
                        const next = clampLogHeight(startH + (startY - y), host.getBoundingClientRect().height);
                        writeStoredLogHeight(next);
                        log.style.height = `${next}px`;
                    } else {
                        writeStoredLogHeight(log.getBoundingClientRect().height || startH);
                    }
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
                window.addEventListener('touchmove', onMove, { passive: false });
                window.addEventListener('touchend', onUp);
                window.addEventListener('touchcancel', onUp);
            };

            splitter.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                beginDrag(e.clientY);
            });
            splitter.addEventListener('touchstart', (e) => {
                const t = e.touches?.[0];
                if (!t) return;
                e.preventDefault();
                beginDrag(t.clientY);
            }, { passive: false });
            splitter.addEventListener('dblclick', () => {
                writeStoredLogHeight(DEFAULT_LOG_HEIGHT);
                ensureLogExpanded();
                applyLogSplitLayout();
            });
            splitter.addEventListener('keydown', (e) => {
                if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                e.preventDefault();
                ensureLogExpanded();
                const hostH = host.getBoundingClientRect().height;
                const cur = log.getBoundingClientRect().height || readStoredLogHeight();
                const step = e.shiftKey ? 48 : 16;
                const delta = e.key === 'ArrowUp' ? step : -step;
                const next = clampLogHeight(cur + delta, hostH);
                writeStoredLogHeight(next);
                applyLogSplitLayout();
            });

            window.addEventListener('resize', () => {
                if (document.body.classList.contains('log-collapsed')) return;
                applyLogSplitLayout();
            });
            if (typeof ResizeObserver === 'function') {
                const ro = new ResizeObserver(() => {
                    if (document.body.classList.contains('log-collapsed')) return;
                    if (document.body.classList.contains('main-log-splitting')) return;
                    applyLogSplitLayout();
                });
                ro.observe(host);
            }
        }

        function toggleMainTheme() {
            const next = document.documentElement.classList.contains('main-theme-dark') ? 'light' : 'dark';
            syncLocalThemeKeys(next);
            applyUiPrefs();
            void electron?.transubSetAppTheme?.({ theme: next });
        }

        function toggleDensity() {
            const next = document.body.classList.contains('density-compact') ? 'comfort' : 'compact';
            try { localStorage.setItem('transub.density', next); } catch (_) { /* ignore */ }
            applyUiPrefs();
        }

        function toggleLogCollapsed() {
            const nextCollapsed = !document.body.classList.contains('log-collapsed');
            try { localStorage.setItem('transub.logCollapsed', nextCollapsed ? '1' : '0'); } catch (_) { /* ignore */ }
            applyUiPrefs();
        }

        function ensureLogExpanded() {
            // Factory shell: latest line lives in the status bar; detail modal is user-opened only.
            if (document.body.classList.contains('factory-shell')) return;
            openLogDetailModal();
        }

        function bindFactoryShellChrome() {
            if (getIsStandaloneChrome()) return;

            els.winMinimizeBtn?.addEventListener('click', () => {
                void electron?.transubWindowMinimize?.();
            });
            els.winMaximizeBtn?.addEventListener('click', async () => {
                const res = await electron?.transubWindowToggleMaximize?.();
                if (els.winMaximizeBtn && res && typeof res.maximized === 'boolean') {
                    els.winMaximizeBtn.textContent = res.maximized ? '❐' : '□';
                    els.winMaximizeBtn.title = res.maximized ? '还原' : '最大化';
                }
            });
            els.winCloseBtn?.addEventListener('click', () => {
                void electron?.transubWindowClose?.();
            });
            electron?.onTransubWindowMaximizeChanged?.((payload) => {
                if (!els.winMaximizeBtn) return;
                const maximized = !!payload?.maximized;
                els.winMaximizeBtn.textContent = maximized ? '❐' : '□';
                els.winMaximizeBtn.title = maximized ? '还原' : '最大化';
            });
            void electron?.transubWindowIsMaximized?.().then((res) => {
                if (!els.winMaximizeBtn || !res) return;
                els.winMaximizeBtn.textContent = res.maximized ? '❐' : '□';
                els.winMaximizeBtn.title = res.maximized ? '还原' : '最大化';
            }).catch(() => {});

            els.factoryTabAll?.addEventListener('click', () => setFactoryTaskTab('all'));
            els.factoryTabActive?.addEventListener('click', () => setFactoryTaskTab('active'));
            els.factoryTabDone?.addEventListener('click', () => setFactoryTaskTab('done'));
            els.factoryTabFailed?.addEventListener('click', () => setFactoryTaskTab('failed'));
            els.factoryThemeToggle?.addEventListener('click', () => toggleMainTheme());
            els.activateProBtn?.addEventListener('click', () => {
                openAppSettings('pro');
            });
            if (els.activateProBtn) els.activateProBtn.hidden = !!getAdvancedEntitled();
            factoryTaskReorderApi.bindCardListDrag?.(els.taskCardList, {
                isEnabled: () => !state.running
                    && !state.retranslateBusy
                    && state.factoryTaskTab === 'all',
                onDragStart: () => {
                    state.taskReorderDragging = true;
                    state.dragDepth = 0;
                    setDropActive(false);
                },
                onDragEnd: () => {
                    state.taskReorderDragging = false;
                    state.dragDepth = 0;
                    setDropActive(false);
                },
                onReorder: (fromIdx, toIdx) => {
                    const next = factoryTaskReorderApi.moveItem
                        ? factoryTaskReorderApi.moveItem(state.items, fromIdx, toIdx)
                        : state.items;
                    if (next === state.items) return;
                    state.items = next;
                    renderList();
                },
            });

            els.factoryNavQueue?.addEventListener('click', () => setFactoryWorkspace('queue'));
            els.factoryNavShelf?.addEventListener('click', () => setFactoryWorkspace('shelf'));
            els.factoryNavScenes?.addEventListener('click', () => setFactoryWorkspace('scenes'));
            els.factoryNavModels?.addEventListener('click', () => setFactoryWorkspace('models'));
            els.factoryNavBurn?.addEventListener('click', () => setFactoryWorkspace('burn'));
            electron?.onTransubOpenShelfWorkspace?.((payload) => {
                openFactoryShelfWorkspace(payload || {});
            });
            els.shelfOpenAfterBatchCheck?.addEventListener('change', () => {
                markSettingsDirty(true);
            });

            els.factoryStatusLogBtn?.addEventListener('click', () => openLogDetailModal());
            els.closeLogDetailBtn?.addEventListener('click', () => closeLogDetailModal());
            document.getElementById('logSheetHandle')?.addEventListener('click', () => closeLogDetailModal());
            els.logDetailModal?.addEventListener('click', (e) => {
                if (e.target === els.logDetailModal) closeLogDetailModal();
            });
            window.addEventListener('resize', () => {
                syncLogDetailSheetAnchor();
            });
            // Escape for log sheet is handled below in the factory keydown path when modal is open.

            els.factoryOpenPlayerBtn?.addEventListener('click', () => {
                void openTransubPlayerApp();
            });

            setFactoryWorkspace('queue');
            syncFactoryTaskTabUi();
            syncRecipeSheetUi();
            syncTaskListViewUi();
            updateRecipeCapsule();
            updateFactoryStatusLogFromHost();
            syncFactoryEngineStatus();
            syncResourceUsageMonitor();

            els.recipeCapsuleBtn?.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (state.recipeExpert) return;
                setRecipeSheetOpen(!state.recipeSheetOpen);
            });
            els.recipeExpertToggle?.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                setRecipeExpert(!state.recipeExpert);
            });
            els.taskViewCardsBtn?.addEventListener('click', () => setTaskListView('cards'));
            els.taskViewTableBtn?.addEventListener('click', () => setTaskListView('table'));
            els.quickLanguageSelect?.addEventListener('change', () => updateRecipeCapsule());
            els.quickTargetLangSelect?.addEventListener('change', () => updateRecipeCapsule());
            document.addEventListener('click', (e) => {
                if (!state.recipeSheetOpen || state.recipeExpert) return;
                const t = e.target;
                if (els.recipeSheet?.contains(t) || els.recipeCapsuleBtn?.contains(t)) return;
                if (t?.closest?.('.post-task-menu')) return;
                setRecipeSheetOpen(false);
            });
        }

        function isTypingTarget(el) {
            if (!el) return false;
            const tag = String(el.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
            return !!el.isContentEditable;
        }

        function bindSettingsGuideLinks() {
            // Re-bind when settings fragment replaces #paramsModal (lazy load).
            const modal = typeof document !== 'undefined'
                ? document.getElementById('paramsModal')
                : null;
            if (!modal || modal.getAttribute('data-settings-dom') === 'pending') return;
            if (bindSettingsGuideLinks._boundModal === modal) return;
            bindSettingsGuideLinks._boundModal = modal;

            els.settingsGotoInstallBtn?.addEventListener('click', () => switchParamsTab('install'));
            els.openSetupWizardFromGuideBtn?.addEventListener('click', () => {
                void global.TransubSetupWizard?.open?.({ force: false });
            });
            els.translateModeGotoProBtn?.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!getAdvancedEntitled()) {
                    void promptProUnlockRequired({ featureLabel: '智能翻译' });
                    return;
                }
                switchParamsTab('pro-smart-translate');
            });
            els.translateModeGotoExternalByokBtn?.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                switchParamsTab('external-translate');
                setTimeout(() => {
                    document.getElementById('transubStationUrlInput')?.focus?.();
                }, 0);
            });
            els.advancedFeaturesGotoProBtn?.addEventListener('click', () => switchParamsTab('pro'));
            const bindGoto = (id, tab) => {
                document.getElementById(id)?.addEventListener('click', (e) => {
                    e.preventDefault();
                    switchParamsTab(tab);
                });
            };
            bindGoto('runtimeGotoProSmartTranslateBtn', 'pro-smart-translate');
            bindGoto('runtimeGotoProLlmBtn', 'pro-smart-translate');
            bindGoto('runtimeGotoProFilmAudioBtn', 'pro-film-audio');
            bindGoto('runtimeGotoProQcBtn', 'pro-qc-smart');
            bindGoto('processGotoProQcBtn', 'pro-qc-smart');
            bindGoto('proSmartGotoLlmBtn', 'external-translate');
            bindGoto('proFilmAudioGotoProcessBtn', 'process');
            document.getElementById('proFilmAudioGotoModelsBtn')?.addEventListener('click', (e) => {
                e.preventDefault();
                void openEngineModelsLibrary();
            });
            bindGoto('proQcGotoProcessBtn', 'process');
            bindGoto('proQcGotoProcessAsrBtn', 'process');
            bindGoto('proQcGotoLlmBtn', 'pro-reconstruct');

            // Station probe: bind on the live modal after fragment replaceWith.
            const stationTestBtn = document.getElementById('transubStationTestBtn');
            if (stationTestBtn && stationTestBtn.dataset.bound !== '1') {
                stationTestBtn.dataset.bound = '1';
                stationTestBtn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const statusEl = document.getElementById('transubStationStatus');
                    const setStatus = (text, kind = '') => {
                        if (!statusEl) return;
                        statusEl.textContent = text || '';
                        statusEl.className = kind === 'ok'
                            ? 'text-xs text-emerald-600 min-h-[1rem]'
                            : kind === 'err'
                                ? 'text-xs text-red-600 min-h-[1rem]'
                                : kind === 'busy'
                                    ? 'text-xs text-sky-600 min-h-[1rem]'
                                    : 'text-xs text-gray-500 min-h-[1rem]';
                    };
                    const url = String(document.getElementById('transubStationUrlInput')?.value || '')
                        .trim() || 'http://127.0.0.1:8787';
                    setStatus('探测中…', 'busy');
                    stationTestBtn.disabled = true;
                    try {
                        const probe = electron?.transubStationProbe;
                        if (typeof probe !== 'function') {
                            setStatus('当前环境不支持探测 Station（请完全退出后重启应用）', 'err');
                            return;
                        }
                        const res = await probe({
                            transubStationEnabled: true,
                            transubStationUrl: url,
                        });
                        if (res?.ok && res?.ready) {
                            setStatus(res.message || 'Station 已就绪', 'ok');
                        } else {
                            setStatus(res?.error || 'Station 未就绪', 'err');
                        }
                    } catch (err) {
                        setStatus(err?.message || String(err), 'err');
                    } finally {
                        stationTestBtn.disabled = false;
                    }
                });
            }
            const stationEnabled = document.getElementById('transubStationEnabledCheck');
            if (stationEnabled && stationEnabled.dataset.bound !== '1') {
                stationEnabled.dataset.bound = '1';
                stationEnabled.addEventListener('change', () => {
                    const on = !!stationEnabled.checked;
                    const fields = document.getElementById('transubStationFields');
                    const urlInput = document.getElementById('transubStationUrlInput');
                    fields?.classList.toggle('opacity-50', !on);
                    if (urlInput) urlInput.disabled = !on;
                    const testBtn = document.getElementById('transubStationTestBtn');
                    if (testBtn) testBtn.disabled = false;
                    markSettingsDirty?.(true);
                });
            }
            const stationUrl = document.getElementById('transubStationUrlInput');
            if (stationUrl && stationUrl.dataset.bound !== '1') {
                stationUrl.dataset.bound = '1';
                stationUrl.addEventListener('input', () => markSettingsDirty?.(true));
            }

            // Settings-panel banners (must bind in standalone settings window too —
            // bindMainUiExtras is main-window only).
            const openModelsLibrary = () => {
                openAppSettings('models', { openLibrary: true });
            };
            els.modelsHybridReadyBannerBtn?.addEventListener('click', (e) => {
                e.preventDefault();
                openModelsLibrary();
            });
            els.proLlmHybridReadyBannerBtn?.addEventListener('click', (e) => {
                e.preventDefault();
                openModelsLibrary();
            });
            els.smartTranslateDualReadyBtn?.addEventListener('click', (e) => {
                e.preventDefault();
                const go = els.smartTranslateDualReadyBtn.dataset.action || 'models';
                if (go === 'pro-llm' || go === 'pro-smart-translate') {
                    openAppSettings('pro-smart-translate');
                } else {
                    openModelsLibrary();
                }
            });

            const bindProLockedClick = (el, featureLabel) => {
                el?.addEventListener('click', (e) => {
                    if (getAdvancedEntitled()) return;
                    if (e.target?.closest?.('.settings-tip, .settings-tip-btn, .settings-tip-bubble')) return;
                    e.preventDefault();
                    e.stopPropagation();
                    void promptProUnlockRequired({ featureLabel });
                }, true);
            };
            bindProLockedClick(els.translateModeDialogWrap, '智能翻译');
            bindProLockedClick(els.translateModeSmartWrap, '混合翻译');
            bindProLockedClick(els.filmAudioEnhanceWrap, '影视音频增强');
            bindProLockedClick(els.filmVadPresetWrap, '影视音频增强');
            bindProLockedClick(els.retranslateModeDialogWrap, '智能翻译');
            bindProLockedClick(els.retranslateModeSmartWrap, '混合翻译');
        }


        return {
            getPostTaskAction,
            setPostTaskAction,
            syncPostTaskMenuUi,
            setPostTaskMenuOpen,
            setAddMenuOpen,
            toggleAddMenu,
            getAutoScanApi,
            refreshAutoScanFoldersListUi,
            bindAutoScanSettingsUi,
            bindAddMenu,
            togglePostTaskMenu,
            bindPostTaskMenu,
            applyLogSplitLayout,
            syncLocalThemeKeys,
            applyUiPrefs,
            scrollMainLogPanel,
            hydrateAppThemeFromMain,
            bindMainLogSplitter,
            toggleMainTheme,
            toggleDensity,
            toggleLogCollapsed,
            ensureLogExpanded,
            bindFactoryShellChrome,
            isTypingTarget,
            bindSettingsGuideLinks,
            clampLogHeight,
            readStoredLogHeight,
            writeStoredLogHeight,
        };
    }

    return { createFactoryShellUi };
}));
