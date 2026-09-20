/**
 * Chrome wire: start readiness, job session control, factory status chips,
 * plus extra engine-env binds not covered by settings wire.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAppWireChromeSession = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function appWireChromeSessionFactory(global) {
    function wireUtils() {
        return (global && global.TransubAppWireUtils)
            || (typeof require === 'function' ? require('./app-wire-utils-core.js') : null)
            || {};
    }

    /**
     * @param {object} host
     * @returns {object} host
     */
    function install(host) {
        const h = host || {};
        const utils = wireUtils();
        const { getBindApi, resolveApi, late, entitled } = utils;
        const bindApi = typeof getBindApi === 'function' ? getBindApi() : {};
        const { bindApiMethods, bindCallMethods, createLazyFactory } = bindApi;
        if (typeof createLazyFactory !== 'function') return h;

        const g = global;
        const startReadinessApi = h.startReadinessApi
            || (g && g.TransubStartReadiness)
            || {};
        const factoryStatusBarApi = h.factoryStatusBarApi
            || (g && g.TransubFactoryStatusBar)
            || {};
        const computeBusyUiApi = h.computeBusyUiApi
            || (g && g.TransubComputeBusyUi)
            || {};
        const postTaskQcApi = h.postTaskQcApi
            || (g && g.TransubPostTaskQcUi)
            || {};

        // --- start readiness ---
        h.getStartReadinessUi = createLazyFactory(
            () => resolveApi(h, 'startReadinessUiApi', 'TransubStartReadinessUi').createStartReadinessUi,
            () => ({
                state: h.state,
                els: h.els,
                electron: h.electron,
                startReadinessApi,
                computeStartBlockReason: (...a) => h.computeStartBlockReason(...a),
                syncComputeBusyFromMain: (...a) => h.syncComputeBusyFromMain(...a),
                updateStartButton: late(h, 'updateStartButton'),
                updateStopButton: late(h, 'updateStopButton'),
                renderList: late(h, 'renderList'),
                showToast: late(h, 'showToast'),
                uiTf: late(h, 'uiTf'),
            }),
        );
        h.callStartReadinessUi = (method, ...args) => {
            const ui = h.getStartReadinessUi();
            if (!ui || typeof ui[method] !== 'function') return undefined;
            return ui[method](...args);
        };
        h.clearStaleComputeBusyIfNeeded = async (...args) => (
            h.callStartReadinessUi('clearStaleComputeBusyIfNeeded', ...args)
            ?? { cleared: false, busy: !!h.state?.computeBusy, label: h.state?.computeBusyLabel }
        );
        h.updateStartHint = (...args) => h.callStartReadinessUi('updateStartHint', ...args);
        h.retryAllFailedItems = (...args) => h.callStartReadinessUi('retryAllFailedItems', ...args);
        h.openFirstQcIssueItem = function openFirstQcIssueItem() {
            const idx = (h.state?.items || []).findIndex((i) => Number(i.qcIssueCount) > 0);
            if (idx < 0) return;
            late(h, 'openItemEditor')(h.state.items[idx]);
        };

        // --- job session ---
        h.getJobSessionControl = createLazyFactory(
            () => resolveApi(h, 'jobSessionControlApi', 'TransubJobSessionControl').createJobSessionControl,
            () => ({
                state: h.state,
                els: h.els,
                electron: h.electron,
                factoryStatusBarApi,
                computeBusyUiApi,
                logDomMax: h.LOG_DOM_MAX || 100,
                getIsStandaloneSettings: () => (typeof h.getIsStandaloneSettings === 'function'
                    ? !!h.getIsStandaloneSettings()
                    : !!h.isStandaloneSettings),
                scrollMainLogPanel: late(h, 'scrollMainLogPanel'),
                showToast: late(h, 'showToast'),
                computeStartBlockReason: (...a) => h.computeStartBlockReason(...a),
                updateStartHint: (...a) => h.updateStartHint(...a),
                uiTf: late(h, 'uiTf'),
                appConfirm: late(h, 'appConfirm'),
                ensureLogExpanded: late(h, 'ensureLogExpanded'),
                readEngineBackendFromForm: (...a) => h.readEngineBackendFromForm(...a),
                syncComputeBusyFromMain: (...a) => h.syncComputeBusyFromMain(...a),
                clearStaleComputeBusyIfNeeded: (...a) => h.clearStaleComputeBusyIfNeeded(...a),
                syncEngineModelsBrowseOnlyFromTaskState: late(h, 'syncEngineModelsBrowseOnlyFromTaskState'),
                onJobStart: late(h, 'onJobStart'),
                onProgress: late(h, 'onProgress'),
                onJobFinished: late(h, 'onJobFinished'),
                syncFocusedTaskRowHighlight: late(h, 'syncFocusedTaskRowHighlight'),
                basename: late(h, 'basename'),
            }),
        );
        Object.assign(h, bindApiMethods(h.getJobSessionControl, [
            'setBadge', 'updateFactoryStatusLogFromHost', 'appendLog', 'appendRetranslateLog',
            'activateAppLogTab', 'activateInferLogTab', 'updateStartButton', 'syncSelectionToolbarActions',
            'updateStopButton', 'updateComputeBusyStrip', 'updateAsrWindowTip', 'updateQwenAsrBatchHint',
            'cancelComputeBusyTask', 'stopTask', 'stopSingleItem', 'bindJobEventListeners',
        ]));

        // --- factory status chips ---
        h.getFactoryStatusChips = createLazyFactory(
            () => resolveApi(h, 'factoryStatusChipsApi', 'TransubFactoryStatusChips').createFactoryStatusChips,
            () => ({
                els: h.els,
                state: h.state,
                electron: h.electron,
                postTaskQcApi,
                countQcIssues: late(h, 'countQcIssues'),
                getAdvancedEntitled: () => entitled(h),
                readEngineBackendFromForm: (...a) => h.readEngineBackendFromForm(...a),
                getAsrRecommendDismissedKey: () => (typeof h.getAsrRecommendDismissedKey === 'function'
                    ? h.getAsrRecommendDismissedKey()
                    : h.asrRecommendDismissedKey),
                setAsrRecommendDismissedKey: (v) => {
                    if (typeof h.setAsrRecommendDismissedKey === 'function') h.setAsrRecommendDismissedKey(v);
                    else h.asrRecommendDismissedKey = v;
                },
                getCachedHardwareRecommend: () => (typeof h.getCachedHardwareRecommend === 'function'
                    ? h.getCachedHardwareRecommend()
                    : h.cachedHardwareRecommend),
                syncQuickAsrRecommendChip: late(h, 'syncQuickAsrRecommendChip'),
                updateReadinessStrip: late(h, 'updateReadinessStrip'),
                ensureSelectValue: late(h, 'ensureSelectValue'),
                appendLog: late(h, 'appendLog'),
                showToast: late(h, 'showToast'),
                uiTf: late(h, 'uiTf'),
                markSettingsDirty: (...a) => h.markSettingsDirty(...a),
            }),
        );
        Object.assign(h, bindApiMethods(h.getFactoryStatusChips, [
            'updateQcBanner',
            'syncEngineBackendUi',
            'updateAsrRecommendChip',
            'applyAsrRecommendFromChip',
        ]));

        // Extra engine-env binds not covered by settings wire
        if (typeof h.callEngineEnvUi === 'function' && typeof bindCallMethods === 'function') {
            Object.assign(h, bindCallMethods(
                (method, ...args) => h.callEngineEnvUi(method, ...args),
                [
                    'syncProxySettingsUi', 'setProxyTestStatus', 'setNetworkHfStatus',
                    'syncTransubStationSettingsUi', 'setTransubStationStatus',
                    'setNetworkGithubMirrorStatus', 'readProxyOptionsFromForm', 'sameFsPath',
                    'ensureBundledEnginePathCached', 'ensureEngineInstallPathFilled',
                    'engineInstallPathForSave', 'updateEnvBanner', 'engineFormPayload',
                    'formatEngineDownloadError', 'setEngineStatusText',
                ],
                {
                    readProxyOptionsFromForm: (v) => v || {
                        proxyEnabled: false,
                        proxyUrl: '',
                        proxyBypass: 'localhost,127.0.0.1,::1,<local>',
                    },
                    sameFsPath: (v) => !!v,
                    ensureBundledEnginePathCached: (v) => v || '',
                    ensureEngineInstallPathFilled: (v) => v || '',
                    engineInstallPathForSave: (v) => v || '',
                    engineFormPayload: (v) => v || {},
                    formatEngineDownloadError: (v) => v || '',
                },
            ));
        }

        return h;
    }

    return { install };
}));
