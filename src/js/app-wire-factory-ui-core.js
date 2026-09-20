/**
 * Domain wire: factory shell / task list / workspace nav / list removal /
 * task-list actions + P1 progress / post-task / QC markers / menu coord.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAppWireFactoryUi = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function appWireFactoryUiFactory(global) {
    function getBindApi() {
        return (global && global.TransubAppApiBind)
            || (typeof require === 'function' ? require('./app-api-bind-core.js') : null)
            || {};
    }

    function resolveModule(name, requirePath) {
        if (global && global[name]) return global[name];
        if (typeof require === 'function' && requirePath) {
            try { return require(requirePath); } catch (_) { /* ignore */ }
        }
        return {};
    }

    function resolveApi(host, hostKey, globalName) {
        if (host && host[hostKey]) return host[hostKey];
        return (global && global[globalName]) || {};
    }

    function late(host, name) {
        return (...args) => {
            const fn = host[name];
            return typeof fn === 'function' ? fn(...args) : undefined;
        };
    }

    const FACTORY_SHELL_METHODS = [
        'getPostTaskAction',
        'setPostTaskAction',
        'syncPostTaskMenuUi',
        'setPostTaskMenuOpen',
        'setAddMenuOpen',
        'toggleAddMenu',
        'getAutoScanApi',
        'refreshAutoScanFoldersListUi',
        'bindAutoScanSettingsUi',
        'bindAddMenu',
        'togglePostTaskMenu',
        'bindPostTaskMenu',
        'applyLogSplitLayout',
        'syncLocalThemeKeys',
        'applyUiPrefs',
        'scrollMainLogPanel',
        'hydrateAppThemeFromMain',
        'bindMainLogSplitter',
        'toggleMainTheme',
        'toggleDensity',
        'toggleLogCollapsed',
        'ensureLogExpanded',
        'bindFactoryShellChrome',
        'isTypingTarget',
        'bindSettingsGuideLinks',
    ];

    const FACTORY_TASK_LIST_METHODS = [
        'updateEmptyStateUi',
        'syncFocusedTaskRowHighlight',
        'setFocusedTaskPath',
        'focusTaskFromSelection',
        'applyTaskSelection',
        'toggleTaskSelectAll',
        'openItemInFolder',
        'openItemEditor',
        'retrySingleItem',
        'executeSingleItem',
        'resumeSingleItem',
        'exportItemDiagnostics',
        'buildListRowSharedCtx',
        'buildListRowHtml',
        'bindListRowEvents',
        'refreshListRowByIndex',
        'refreshListRow',
        'syncSelectAllCheck',
        'syncRecipeSheetUi',
        'setRecipeSheetOpen',
        'setRecipeExpert',
        'syncTaskListViewUi',
        'setTaskListView',
        'updateRecipeCapsule',
        'formatStationEta',
        'updateTaskStation',
        'buildListCardHtml',
        'removeSingleItem',
        'syncFactoryTaskTabUi',
        'setFactoryTaskTab',
        'pickFactoryHandoffItem',
        'openItemInPlayer',
    ];

    const FACTORY_WORKSPACE_NAV_METHODS = [
        'setFactoryWorkspace',
        'openFactoryScenesWorkspace',
        'openFactoryShelfWorkspace',
        'openFactoryModelsWorkspace',
        'openFactoryBurnWorkspace',
        'pickBurnHandoffFromQueue',
        'pickBurnHandoffBatchFromQueue',
    ];

    const LIST_REMOVAL_METHODS = [
        'removeSelected',
        'clearList',
        'clearChecked',
        'clearUnchecked',
        'clearCompleted',
        'clearFailed',
        'clearInvalid',
        'setClearListMenuOpen',
        'bindClearListMenu',
        'removeItemsFromList',
    ];

    const PROGRESS_SHELL_METHODS = [
        'stageLabel',
        'formatListRunningDetail',
        'formatRunningProgressLabel',
        'clearQwenIslandBatchSticky',
        'enrichProgressDetail',
        'formatJobProgressLabel',
        'effectiveItemProgress',
        'computeDisplayProgress',
        'mapStageProgress',
        'elapsedSecSince',
        'itemElapsedSec',
        'formatElapsedCell',
        'formatProcessedCell',
        'bumpProgress',
        'isPreTranscribeStage',
        'startElapsedTicker',
        'stopElapsedTicker',
    ];

    const POST_TASK_UI_METHODS = [
        'getPostTaskOptionsFromUi',
        'resolveOutputDirFromForm',
        'syncPostTaskExtrasUi',
        'updateQueueBadge',
        'resetPostTaskSelect',
        'syncPostTaskToMain',
        'readSubFormatsFromForm',
        'applySubFormatsToForm',
        'syncLogLevelHint',
        'syncBatchSizeUi',
    ];

    const ITEM_QC_METHODS = [
        'getSubtitlePathForItem',
        'getPostBatchPathsForItem',
        'resolveQcSemanticPairPathForItem',
        'showPathForItem',
        'statusMeta',
        'countQcIssues',
        'markItemQcFixed',
        'clearItemQcFixed',
        'qcFixedTagHtml',
    ];

    /**
     * @param {object} host
     * @returns {object} host
     */
    function install(host) {
        const h = host || {};
        const { bindApiMethods, bindCallMethods, createLazyFactory } = getBindApi();
        if (typeof createLazyFactory !== 'function') return h;

        const postTaskQcApi = h.postTaskQcApi || (global && global.TransubPostTaskQcUi) || {};
        const POST_TASK_SELECT_VALUES = h.POST_TASK_SELECT_VALUES
            || new Set(postTaskQcApi.POST_TASK_ACTIONS || ['none', 'quit', 'shutdown', 'sleep', 'open_folder']);
        const POST_TASK_LABELS = h.POST_TASK_LABELS || postTaskQcApi.POST_TASK_LABELS || {
            none: '无额外操作',
            open_folder: '打开输出目录',
            sleep: '睡眠',
            quit: '退出应用',
            shutdown: '关机',
        };

        // --- P1: progress shell ---
        const progressMod = resolveModule('TransubAppProgressShell', './app-progress-shell-core.js');
        h.getAppProgressShell = createLazyFactory(
            () => progressMod.createAppProgressShell,
            () => ({
                state: h.state,
                progressDisplayApi: h.progressDisplayApi || (global && global.TransubProgressDisplay) || {},
                inferProgress: h.inferProgress || (global && global.TransubInferStageProgress) || {},
                STAGE_LABELS: h.STAGE_LABELS,
                stageRank: late(h, 'stageRank'),
                scrubProgressDetail: late(h, 'scrubProgressDetail'),
                formatDuration: late(h, 'formatDuration'),
                readTaskFromForm: late(h, 'readTaskFromForm'),
                updateProgressUi: late(h, 'updateProgressUi'),
                refreshListRow: late(h, 'refreshListRow'),
                findItem: late(h, 'findItem'),
                // Do NOT pass late(h, 'isPreTranscribeStage'): that method is bound onto
                // host from this same shell and would recurse until stack overflow,
                // leaving every item stuck at「排队」while the engine still runs.
            }),
        );
        Object.assign(h, bindApiMethods(h.getAppProgressShell, PROGRESS_SHELL_METHODS));

        // --- P1: post-task UI ---
        const postTaskMod = resolveModule('TransubPostTaskUi', './post-task-ui-core.js');
        h.getPostTaskUi = createLazyFactory(
            () => postTaskMod.createPostTaskUi,
            () => ({
                state: h.state,
                els: h.els,
                electron: h.electron,
                postTaskQcApi,
                getPostTaskAction: late(h, 'getPostTaskAction'),
                setPostTaskMenuOpen: late(h, 'setPostTaskMenuOpen'),
                syncPostTaskMenuUi: late(h, 'syncPostTaskMenuUi'),
                uiTf: late(h, 'uiTf'),
            }),
        );
        Object.assign(h, bindApiMethods(h.getPostTaskUi, POST_TASK_UI_METHODS));

        // --- P1: item QC markers ---
        const qcMod = resolveModule('TransubItemQcMarkers', './item-qc-markers-core.js');
        h.getItemQcMarkers = createLazyFactory(
            () => qcMod.createItemQcMarkers,
            () => ({
                state: h.state,
                itemPosttaskPathsApi: h.itemPosttaskPathsApi
                    || (global && global.TransubItemPosttaskPaths)
                    || {},
                postTaskQcApi,
                taskListRowApi: h.taskListRowApi || (global && global.TransubTaskListRow) || {},
                factoryTaskUiApi: h.factoryTaskUiApi || (global && global.TransubFactoryTaskUi) || {},
                esc: late(h, 'esc'),
            }),
        );
        Object.assign(h, bindApiMethods(h.getItemQcMarkers, ITEM_QC_METHODS));

        // --- P1: menu coord ---
        const menuMod = resolveModule('TransubAppMenuCoord', './app-menu-coord-core.js');
        h.getAppMenuCoord = createLazyFactory(
            () => menuMod.createAppMenuCoord,
            () => ({
                state: h.state,
                els: h.els,
                setAddMenuOpen: late(h, 'setAddMenuOpen'),
                setPostTaskMenuOpen: late(h, 'setPostTaskMenuOpen'),
                setClearListMenuOpen: late(h, 'setClearListMenuOpen'),
                setTranslateMenuOpen: late(h, 'setTranslateMenuOpen'),
                setTranslateModeMenuOpen: late(h, 'setTranslateModeMenuOpen'),
                setMtModelMenuOpen: late(h, 'setMtModelMenuOpen'),
                setPostBatchQcFixMenuOpen: late(h, 'setPostBatchQcFixMenuOpen'),
                setParamsModeMenuOpen: late(h, 'setParamsModeMenuOpen'),
                setParamsMoreMenuOpen: late(h, 'setParamsMoreMenuOpen'),
                setExpertExtrasMenuOpen: late(h, 'setExpertExtrasMenuOpen'),
                setBilingualMenuOpen: late(h, 'setBilingualMenuOpen'),
                setTranslateStyleMenuOpen: late(h, 'setTranslateStyleMenuOpen'),
                setModelsMenuOpen: late(h, 'setModelsMenuOpen'),
            }),
        );
        Object.assign(h, bindApiMethods(h.getAppMenuCoord, ['setMoreMenuOpen', 'closeSiblingMenus']));

        // --- Transub Player dock launch ---
        h.getPlayerLaunchUi = createLazyFactory(
            () => resolveApi(h, 'playerLaunchUiApi', 'TransubPlayerLaunchUi').createPlayerLaunchUi,
            () => ({
                electron: h.electron,
                appConfirm: late(h, 'appConfirm'),
                showToast: late(h, 'showToast'),
                uiTf: late(h, 'uiTf'),
            }),
        );
        h.openTransubPlayerApp = (...args) => {
            const ui = h.getPlayerLaunchUi();
            return ui?.openPlayerApp?.(...args);
        };

        // --- factory shell ---
        h.getFactoryShellUi = createLazyFactory(
            () => resolveApi(h, 'factoryShellUiApi', 'TransubFactoryShellUi').createFactoryShellUi,
            () => ({
                state: h.state,
                els: h.els,
                electron: h.electron,
                postTaskQcApi,
                factoryTaskUiApi: h.factoryTaskUiApi || (global && global.TransubFactoryTaskUi) || {},
                factoryTaskReorderApi: h.factoryTaskReorderApi
                    || (global && global.TransubFactoryTaskReorder)
                    || {},
                POST_TASK_SELECT_VALUES,
                POST_TASK_LABELS,
                uiTf: late(h, 'uiTf'),
                appConfirm: late(h, 'appConfirm'),
                showToast: late(h, 'showToast'),
                syncPostTaskExtrasUi: late(h, 'syncPostTaskExtrasUi'),
                syncPostTaskToMain: late(h, 'syncPostTaskToMain'),
                setTranslateModeMenuOpen: late(h, 'setTranslateModeMenuOpen'),
                setMtModelMenuOpen: late(h, 'setMtModelMenuOpen'),
                setPostBatchQcFixMenuOpen: late(h, 'setPostBatchQcFixMenuOpen'),
                setParamsModeMenuOpen: late(h, 'setParamsModeMenuOpen'),
                setExpertExtrasMenuOpen: late(h, 'setExpertExtrasMenuOpen'),
                setMoreMenuOpen: late(h, 'setMoreMenuOpen'),
                setTranslateMenuOpen: late(h, 'setTranslateMenuOpen'),
                setParamsMoreMenuOpen: late(h, 'setParamsMoreMenuOpen'),
                setBilingualMenuOpen: late(h, 'setBilingualMenuOpen'),
                setTranslateStyleMenuOpen: late(h, 'setTranslateStyleMenuOpen'),
                getTranslateMenuOpen: late(h, 'getTranslateMenuOpen'),
                getParamsMoreMenuOpen: late(h, 'getParamsMoreMenuOpen'),
                getExpertExtrasMenuOpen: () => (typeof h.getExpertExtrasMenuOpen === 'function'
                    ? h.getExpertExtrasMenuOpen()
                    : !!h.expertExtrasMenuOpen),
                getPostBatchQcFixMenuOpen: () => (typeof h.getPostBatchQcFixMenuOpen === 'function'
                    ? h.getPostBatchQcFixMenuOpen()
                    : !!h.postBatchQcFixMenuOpen),
                getParamsModeMenuOpen: late(h, 'getParamsModeMenuOpen'),
                getBilingualMenuOpen: late(h, 'getBilingualMenuOpen'),
                getTranslateStyleMenuOpen: late(h, 'getTranslateStyleMenuOpen'),
                setClearListMenuOpen: late(h, 'setClearListMenuOpen'),
                addVideos: late(h, 'addVideos'),
                addFolder: late(h, 'addFolder'),
                autoAddMissingSubtitles: late(h, 'autoAddMissingSubtitles'),
                getAutoScanFoldersDraft: () => (typeof h.getAutoScanFoldersDraft === 'function'
                    ? h.getAutoScanFoldersDraft()
                    : h.autoScanFoldersDraft),
                setAutoScanFoldersDraft: (folders) => {
                    if (typeof h.setAutoScanFoldersDraft === 'function') h.setAutoScanFoldersDraft(folders);
                    else h.autoScanFoldersDraft = folders;
                },
                syncRecipeSheetUi: late(h, 'syncRecipeSheetUi'),
                syncTaskListViewUi: late(h, 'syncTaskListViewUi'),
                openLogDetailModal: late(h, 'openLogDetailModal'),
                closeLogDetailModal: late(h, 'closeLogDetailModal'),
                syncLogDetailSheetAnchor: late(h, 'syncLogDetailSheetAnchor'),
                getIsStandaloneChrome: () => (typeof h.getIsStandaloneChrome === 'function'
                    ? !!h.getIsStandaloneChrome()
                    : !!h.isStandaloneChrome),
                getAdvancedEntitled: () => (typeof h.getAdvancedEntitled === 'function'
                    ? !!h.getAdvancedEntitled()
                    : !!h.advancedEntitled),
                setFactoryTaskTab: late(h, 'setFactoryTaskTab'),
                openAppSettings: late(h, 'openAppSettings'),
                setDropActive: late(h, 'setDropActive'),
                renderList: late(h, 'renderList'),
                setFactoryWorkspace: late(h, 'setFactoryWorkspace'),
                openFactoryShelfWorkspace: late(h, 'openFactoryShelfWorkspace'),
                markSettingsDirty: late(h, 'markSettingsDirty'),
                openTransubPlayerApp: late(h, 'openTransubPlayerApp'),
                syncFactoryTaskTabUi: late(h, 'syncFactoryTaskTabUi'),
                updateRecipeCapsule: late(h, 'updateRecipeCapsule'),
                updateFactoryStatusLogFromHost: late(h, 'updateFactoryStatusLogFromHost'),
                syncFactoryEngineStatus: late(h, 'syncFactoryEngineStatus'),
                syncResourceUsageMonitor: late(h, 'syncResourceUsageMonitor'),
                setRecipeSheetOpen: late(h, 'setRecipeSheetOpen'),
                setRecipeExpert: late(h, 'setRecipeExpert'),
                setTaskListView: late(h, 'setTaskListView'),
                switchParamsTab: late(h, 'switchParamsTab'),
                promptProUnlockRequired: late(h, 'promptProUnlockRequired'),
                openEngineModelsLibrary: late(h, 'openEngineModelsLibrary'),
            }),
        );

        h.callFactoryShellUi = (method, ...args) => {
            const ui = h.getFactoryShellUi();
            if (!ui || typeof ui[method] !== 'function') return undefined;
            return ui[method](...args);
        };

        if (typeof bindCallMethods === 'function') {
            Object.assign(h, bindCallMethods(
                (method, ...args) => h.callFactoryShellUi(method, ...args),
                FACTORY_SHELL_METHODS,
                {
                    getPostTaskAction: (v) => v ?? 'none',
                    getAutoScanApi: (v) => v || {},
                    isTypingTarget: (v) => !!v,
                },
            ));
        }

        // --- factory task list ---
        h.getFactoryTaskListUi = createLazyFactory(
            () => resolveApi(h, 'factoryTaskListUiApi', 'TransubFactoryTaskListUi').createFactoryTaskListUi,
            () => ({
                state: h.state,
                els: h.els,
                electron: h.electron,
                factoryTaskTabApi: h.factoryTaskTabApi || (global && global.TransubFactoryTaskTab) || {},
                factoryTaskUiApi: h.factoryTaskUiApi || (global && global.TransubFactoryTaskUi) || {},
                taskListRowApi: h.taskListRowApi || (global && global.TransubTaskListRow) || {},
                liveBatchQueueApi: h.liveBatchQueueApi || (global && global.TransubLiveBatchQueue) || {},
                translateStyleApi: h.translateStyleApi || (global && global.TransubTranslateStyle) || {},
                etaApi: h.etaApi || (global && global.TransubEta) || {},
                expandedErrorRows: h.expandedErrorRows || new Set(),
                esc: late(h, 'esc'),
                basename: late(h, 'basename'),
                normPath: late(h, 'normPath'),
                formatDuration: late(h, 'formatDuration'),
                appendLog: late(h, 'appendLog'),
                showToast: late(h, 'showToast'),
                uiTf: late(h, 'uiTf'),
                getAdvancedEntitled: () => (typeof h.getAdvancedEntitled === 'function'
                    ? !!h.getAdvancedEntitled()
                    : !!h.advancedEntitled),
                getSavedOptionsSnapshot: () => (typeof h.getSavedOptionsSnapshot === 'function'
                    ? h.getSavedOptionsSnapshot()
                    : h.savedOptionsSnapshot),
                readTranslateModeFromForm: late(h, 'readTranslateModeFromForm'),
                readTaskFromForm: late(h, 'readTaskFromForm'),
                readGlobalTranslateStylePreset: late(h, 'readGlobalTranslateStylePreset'),
                getTranslateStyleEnabled: late(h, 'getTranslateStyleEnabled'),
                readDualLineOrderFromForm: late(h, 'readDualLineOrderFromForm'),
                shortTranslateModelsSummary: late(h, 'shortTranslateModelsSummary'),
                showPathForItem: late(h, 'showPathForItem'),
                getSubtitlePathForItem: late(h, 'getSubtitlePathForItem'),
                getPostBatchPathsForItem: late(h, 'getPostBatchPathsForItem'),
                formatElapsedCell: late(h, 'formatElapsedCell'),
                formatProcessedCell: late(h, 'formatProcessedCell'),
                computeEtaSec: late(h, 'computeEtaSec'),
                buildRuntimeOptions: late(h, 'buildRuntimeOptions'),
                startSubtitleGeneration: (...a) => h.startSubtitleGeneration(...a),
                appendItemsToLiveBatch: late(h, 'appendItemsToLiveBatch'),
                removeItemsFromList: late(h, 'removeItemsFromList'),
                getSelectedItems: late(h, 'getSelectedItems'),
                updateStartButton: late(h, 'updateStartButton'),
                updateProgressUi: late(h, 'updateProgressUi'),
                updateQcBanner: late(h, 'updateQcBanner'),
                updateContentProfileUi: late(h, 'updateContentProfileUi'),
                applyListSortInPlace: late(h, 'applyListSortInPlace'),
                syncTaskTableSortHeaders: late(h, 'syncTaskTableSortHeaders'),
                applyTaskColumnWidths: late(h, 'applyTaskColumnWidths'),
                getContentProfileApi: () => (global && global.TransubContentProfile) || null,
                getDualSubtitleApi: () => (global && global.TransubDualSubtitle) || null,
            }),
        );

        h.callFactoryTaskListUi = (method, ...args) => {
            const ui = h.getFactoryTaskListUi();
            if (!ui || typeof ui[method] !== 'function') return undefined;
            return ui[method](...args);
        };

        if (typeof bindCallMethods === 'function') {
            Object.assign(h, bindCallMethods(
                (method, ...args) => h.callFactoryTaskListUi(method, ...args),
                FACTORY_TASK_LIST_METHODS,
                {
                    buildListRowSharedCtx: (v) => v || {},
                    buildListRowHtml: (v) => v || '',
                    formatStationEta: (v) => v || '',
                    buildListCardHtml: (v) => v || '',
                },
            ));
        }

        h.renderList = (...args) => h.callFactoryTaskListUi('renderList', ...args);

        // --- workspace nav ---
        h.getFactoryWorkspaceNav = createLazyFactory(
            () => resolveApi(h, 'factoryWorkspaceNavApi', 'TransubFactoryWorkspaceNav').createFactoryWorkspaceNav,
            () => {
                const nav = {
                    state: h.state,
                    factoryChromeApi: h.factoryChromeApi || (global && global.TransubFactoryChrome) || {},
                    ensureFactoryWorkspaceScripts: late(h, 'ensureFactoryWorkspaceScripts'),
                    onFactoryModelsWorkspaceShow: late(h, 'onFactoryModelsWorkspaceShow'),
                    onFactoryModelsWorkspaceHide: late(h, 'onFactoryModelsWorkspaceHide'),
                    pickFactoryHandoffItem: late(h, 'pickFactoryHandoffItem'),
                    getSubtitlePathForItem: late(h, 'getSubtitlePathForItem'),
                    getSelectedItems: late(h, 'getSelectedItems'),
                    openShelfTranslate: (...a) => h.openShelfTranslate?.(...a),
                    openAppSettings: (...a) => h.openAppSettings?.(...a),
                };
                return nav;
            },
        );

        // Wrap to call install() once like app.js
        const _getNav = h.getFactoryWorkspaceNav;
        let _navInstalled = false;
        h.getFactoryWorkspaceNav = () => {
            const nav = _getNav();
            if (nav && !_navInstalled) {
                nav.install?.();
                _navInstalled = true;
            }
            return nav;
        };

        h.callFactoryWorkspaceNav = (method, ...args) => {
            const nav = h.getFactoryWorkspaceNav();
            if (!nav || typeof nav[method] !== 'function') return undefined;
            return nav[method](...args);
        };

        if (typeof bindCallMethods === 'function') {
            Object.assign(h, bindCallMethods(
                (method, ...args) => h.callFactoryWorkspaceNav(method, ...args),
                FACTORY_WORKSPACE_NAV_METHODS,
                {
                    pickBurnHandoffFromQueue: (v) => v || null,
                    pickBurnHandoffBatchFromQueue: (v) => v || [],
                },
            ));
        }

        // --- list removal ---
        h.getListRemovalUi = createLazyFactory(
            () => resolveApi(h, 'listRemovalUiApi', 'TransubListRemovalUi').createListRemovalUi,
            () => ({
                state: h.state,
                els: h.els,
                electron: h.electron,
                liveBatchQueueApi: h.liveBatchQueueApi || (global && global.TransubLiveBatchQueue) || {},
                normPath: late(h, 'normPath'),
                uiTf: late(h, 'uiTf'),
                appendLog: late(h, 'appendLog'),
                renderList: late(h, 'renderList'),
                updateStartButton: late(h, 'updateStartButton'),
                isProgressIdle: late(h, 'isProgressIdle'),
                updateProgressUi: late(h, 'updateProgressUi'),
                ux: typeof h.ux === 'function' ? h.ux : () => h.ux,
                appendItemsToLiveBatch: late(h, 'appendItemsToLiveBatch'),
                closeSiblingMenus: (...a) => {
                    if (typeof h.closeSiblingMenus === 'function') return h.closeSiblingMenus(...a);
                    late(h, 'setAddMenuOpen')(false);
                    late(h, 'setPostTaskMenuOpen')(false);
                    late(h, 'setMoreMenuOpen')(false);
                    late(h, 'setTranslateModeMenuOpen')(false);
                    late(h, 'setMtModelMenuOpen')(false);
                    late(h, 'setPostBatchQcFixMenuOpen')(false);
                    late(h, 'setParamsModeMenuOpen')(false);
                    late(h, 'setExpertExtrasMenuOpen')(false);
                    late(h, 'setTranslateMenuOpen')(false);
                    late(h, 'setParamsMoreMenuOpen')(false);
                    late(h, 'setBilingualMenuOpen')(false);
                    late(h, 'setTranslateStyleMenuOpen')(false);
                    return undefined;
                },
            }),
        );

        h.callListRemovalUi = (method, ...args) => {
            const ui = h.getListRemovalUi();
            if (!ui || typeof ui[method] !== 'function') return undefined;
            return ui[method](...args);
        };

        if (typeof bindCallMethods === 'function') {
            Object.assign(h, bindCallMethods(
                (method, ...args) => h.callListRemovalUi(method, ...args),
                LIST_REMOVAL_METHODS,
            ));
        }

        // --- task list actions ---
        h.getTaskListActionsUi = createLazyFactory(
            () => resolveApi(h, 'taskListActionsUiApi', 'TransubTaskListActionsUi').createTaskListActionsUi,
            () => ({
                state: h.state,
                els: h.els,
                electron: h.electron,
                taskListSortApi: h.taskListSortApi || (global && global.TransubTaskListSort) || {},
                liveBatchQueueApi: h.liveBatchQueueApi || (global && global.TransubLiveBatchQueue) || {},
                expandedErrorRows: h.expandedErrorRows || new Set(),
                basename: late(h, 'basename'),
                itemElapsedSec: late(h, 'itemElapsedSec'),
                getAdvancedEntitled: () => (typeof h.getAdvancedEntitled === 'function'
                    ? !!h.getAdvancedEntitled()
                    : !!h.advancedEntitled),
                renderList: late(h, 'renderList'),
                syncSelectAllCheck: late(h, 'syncSelectAllCheck'),
                updateStartButton: late(h, 'updateStartButton'),
                setFocusedTaskPath: late(h, 'setFocusedTaskPath'),
                refreshListRowByIndex: late(h, 'refreshListRowByIndex'),
                getSubtitlePathForItem: late(h, 'getSubtitlePathForItem'),
                getPostBatchPathsForItem: late(h, 'getPostBatchPathsForItem'),
                showPathForItem: late(h, 'showPathForItem'),
                openItemEditor: late(h, 'openItemEditor'),
                openRetranslateModal: late(h, 'openRetranslateModal'),
                runFilmReconstructFromSelection: late(h, 'runFilmReconstructFromSelection'),
                runPostBatchQcFix: late(h, 'runPostBatchQcFix'),
                runPostBatchQcSmartFix: late(h, 'runPostBatchQcSmartFix'),
                retrySingleItem: late(h, 'retrySingleItem'),
                executeSingleItem: late(h, 'executeSingleItem'),
                resumeSingleItem: late(h, 'resumeSingleItem'),
                exportItemDiagnostics: late(h, 'exportItemDiagnostics'),
                openItemInFolder: late(h, 'openItemInFolder'),
                openTranslateStylePickerModal: late(h, 'openTranslateStylePickerModal'),
                applyBatchRecoveryAction: late(h, 'applyBatchRecoveryAction'),
                openItemInPlayer: late(h, 'openItemInPlayer'),
                stopTask: late(h, 'stopTask'),
                stopSingleItem: late(h, 'stopSingleItem'),
                removeSingleItem: late(h, 'removeSingleItem'),
                setPostTaskMenuOpen: late(h, 'setPostTaskMenuOpen'),
                setAddMenuOpen: late(h, 'setAddMenuOpen'),
                setMoreMenuOpen: late(h, 'setMoreMenuOpen'),
                setTranslateModeMenuOpen: late(h, 'setTranslateModeMenuOpen'),
                setPostBatchQcFixMenuOpen: late(h, 'setPostBatchQcFixMenuOpen'),
            }),
        );

        h.callTaskListActionsUi = (method, ...args) => {
            const ui = h.getTaskListActionsUi();
            if (!ui || typeof ui[method] !== 'function') return undefined;
            return ui[method](...args);
        };

        h.syncTaskTableSortHeaders = (...a) => h.callTaskListActionsUi('syncTaskTableSortHeaders', ...a);
        h.applyTaskColumnWidths = (...a) => h.callTaskListActionsUi('applyTaskColumnWidths', ...a);
        h.applyListSortInPlace = (...a) => h.callTaskListActionsUi('applyListSortInPlace', ...a);
        h.closeTaskColContextMenu = (...a) => h.callTaskListActionsUi('closeTaskColContextMenu', ...a);
        h.closeTaskRowContextMenu = (...a) => h.callTaskListActionsUi('closeTaskRowContextMenu', ...a);
        h.bindListActions = (...args) => {
            const ui = h.getTaskListActionsUi();
            if (!ui?.bindListActions) {
                if (typeof h.appendLog === 'function') {
                    h.appendLog('任务列表操作界面核心未加载（task-list-actions-ui）', 'err');
                }
                return;
            }
            return ui.bindListActions(...args);
        };

        return h;
    }

    return {
        install,
        FACTORY_SHELL_METHODS,
        FACTORY_TASK_LIST_METHODS,
        FACTORY_WORKSPACE_NAV_METHODS,
        LIST_REMOVAL_METHODS,
        PROGRESS_SHELL_METHODS,
        POST_TASK_UI_METHODS,
        ITEM_QC_METHODS,
    };
}));
