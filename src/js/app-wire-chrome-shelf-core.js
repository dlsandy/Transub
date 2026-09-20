/**
 * Chrome wire: shelf translate, retranslate modal/runner, film reconstruct, log detail.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAppWireChromeShelf = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function appWireChromeShelfFactory(global) {
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
        const { createLazyFactory } = bindApi;
        if (typeof createLazyFactory !== 'function') return h;

        const g = global;
        const settingsNormApi = h.settingsNormApi
            || (g && g.TransubSettingsOptionsNormalize)
            || {};
        const retranslatePlanApi = h.retranslatePlanApi
            || resolveApi(h, 'retranslatePlanApi', 'TransubRetranslatePlan');
        const translateStyleApi = h.translateStyleApi
            || resolveApi(h, 'translateStyleApi', 'TransubTranslateStyle');
        const factoryStatusBarApi = h.factoryStatusBarApi
            || (g && g.TransubFactoryStatusBar)
            || {};

        // --- shelf translate ---
        h.getShelfTranslateFlow = createLazyFactory(
            () => resolveApi(h, 'shelfTranslateFlowApi', 'TransubShelfTranslateFlow').createShelfTranslateFlow,
            () => ({
                state: h.state,
                els: h.els,
                electron: h.electron,
                shelfTranslateApi: resolveApi(h, 'shelfTranslateApi', 'TransubSubtitleShelfTranslate'),
                settingsNormApi,
                retranslatePlanApi,
                appendLog: late(h, 'appendLog'),
                uiTf: late(h, 'uiTf'),
                basename: late(h, 'basename'),
                showToast: late(h, 'showToast'),
                setLoading: (...a) => h.setLoading(...a),
                appConfirm: late(h, 'appConfirm'),
                ensureJobRuntimeScripts: (...a) => h.ensureJobRuntimeScripts(...a),
                findItem: (...a) => h.findItem(...a),
                setFactoryWorkspace: late(h, 'setFactoryWorkspace'),
                resolveOutputDirFromForm: late(h, 'resolveOutputDirFromForm'),
                pathDirname: (...a) => h.pathDirname(...a),
                pathJoin: (...a) => h.pathJoin(...a),
                stemNoExt: (...a) => h.stemNoExt(...a),
                normPath: late(h, 'normPath'),
                readSubFormatsFromForm: late(h, 'readSubFormatsFromForm'),
                updateStartButton: late(h, 'updateStartButton'),
                renderList: late(h, 'renderList'),
                startSubtitleGeneration: (...a) => h.startSubtitleGeneration(...a),
                runPostBatchAutoFix: late(h, 'runPostBatchAutoFix'),
                runPostBatchQcScan: late(h, 'runPostBatchQcScan'),
                runPostBatchQcAutoFixIfEnabled: late(h, 'runPostBatchQcAutoFixIfEnabled'),
                runPostBatchChineseConvert: late(h, 'runPostBatchChineseConvert'),
                refreshSubtitleShelf: () => g?.TransubSubtitleShelfUi?.refreshList?.({ keepSelection: true }),
                getSubtitleTargetLangApi: () => (g && g.TransubSubtitleTargetLang),
                getSubtitleShelfCore: () => (g && g.TransubSubtitleShelfCore),
            }),
        );
        h.openShelfTranslate = async (...args) => {
            const flow = h.getShelfTranslateFlow();
            if (!flow?.openShelfTranslate) {
                if (typeof h.appendLog === 'function') {
                    h.appendLog('字幕库翻译流程核心未加载（shelf-translate-flow）', 'err');
                }
                late(h, 'showToast')('字幕库翻译流程核心未加载', 'err');
                return { ok: false, error: 'no_module' };
            }
            return flow.openShelfTranslate(...args);
        };
        h.finishShelfTranslateRows = async (...args) => {
            const flow = h.getShelfTranslateFlow();
            if (!flow?.finishShelfTranslateRows) return;
            return flow.finishShelfTranslateRows(...args);
        };

        // --- retranslate modal + runner ---
        h.getRetranslateModalUi = createLazyFactory(
            () => resolveApi(h, 'retranslateModalUiApi', 'TransubRetranslateModalUi').createRetranslateModalUi,
            () => ({
                state: h.state,
                els: h.els,
                electron: h.electron,
                retranslatePlanApi,
                translateStyleApi,
                appendLog: late(h, 'appendLog'),
                showToast: late(h, 'showToast'),
                uiTf: late(h, 'uiTf'),
                basename: late(h, 'basename'),
                esc: late(h, 'esc'),
                stemNoExt: (...a) => h.stemNoExt(...a),
                pathDirname: (...a) => h.pathDirname(...a),
                pathJoin: (...a) => h.pathJoin(...a),
                normPath: late(h, 'normPath'),
                getAdvancedEntitled: () => entitled(h),
                getCachedEngineModels: () => (typeof h.getCachedEngineModels === 'function'
                    ? h.getCachedEngineModels()
                    : h.cachedEngineModels),
                getManagedLlmCatalogApi: late(h, 'getManagedLlmCatalogApi'),
                ensureSmartTranslatePickCache: (...a) => h.ensureSmartTranslatePickCache(...a),
                setCachedSmartTranslatePick: (v) => { h.cachedSmartTranslatePick = v; },
                isSmartTranslateCapableModel: (...a) => h.isSmartTranslateCapableModel(...a),
                resolveMtCapabilityFromForm: late(h, 'resolveMtCapabilityFromForm'),
                fillEngineModelSelect: late(h, 'fillEngineModelSelect'),
                isLlmInferencePickModelId: late(h, 'isLlmInferencePickModelId'),
                readLlmMtModelFromForm: (...a) => h.readLlmMtModelFromForm(...a),
                recommendFormMtModel: (...a) => h.recommendFormMtModel(...a),
                buildIntlAwareLlmMtFilter: late(h, 'buildIntlAwareLlmMtFilter'),
                buildIntlAwareLlmMtDisableReason: late(h, 'buildIntlAwareLlmMtDisableReason'),
                refreshEngineModels: (...a) => h.refreshEngineModels(...a),
                ensureEngineModelsCatalog: (...a) => h.ensureEngineModelsCatalog(...a),
                resolveOutputDirFromForm: late(h, 'resolveOutputDirFromForm'),
                readSubFormatsFromForm: late(h, 'readSubFormatsFromForm'),
                readSubtitleTargetLangFromForm: (...a) => h.readSubtitleTargetLangFromForm(...a),
                readTranslateModeFromForm: late(h, 'readTranslateModeFromForm'),
                getSelectedItems: (...a) => h.getSelectedItems(...a),
                setLoading: (...a) => h.setLoading(...a),
                appConfirm: late(h, 'appConfirm'),
                ensureJobRuntimeScripts: (...a) => h.ensureJobRuntimeScripts(...a),
                populateTranslateStylePickerSelect: late(h, 'populateTranslateStylePickerSelect'),
                translateStyleOptionsForItem: late(h, 'translateStyleOptionsForItem'),
                readGlobalTranslateStylePreset: late(h, 'readGlobalTranslateStylePreset'),
                getTranslateStyleEnabled: late(h, 'getTranslateStyleEnabled'),
            }),
        );
        h.callRetranslateModalUi = (method, ...args) => {
            const ui = h.getRetranslateModalUi();
            if (!ui || typeof ui[method] !== 'function') return undefined;
            return ui[method](...args);
        };
        const retranslateModalNames = [
            'resolveRetranslateDestPath', 'resolveTranscriptSourceForItem',
            'readRetranslateModeFromModal', 'readRetranslateSmartHybrid', 'readRetranslateSmartPolish',
            'seedRetranslateSmartOptionsFromSettings', 'fillRetranslateSmartModelSelect',
            'fillRetranslateHybridMtSelect', 'syncRetranslateStyleCustomWrap',
            'seedRetranslateStyleFromItems', 'readRetranslateStyleFromModal',
            'fillRetranslateModelSelect', 'syncRetranslateModalModelUi',
            'closeRetranslateModal',
        ];
        for (const name of retranslateModalNames) {
            h[name] = (...args) => h.callRetranslateModalUi(name, ...args);
        }
        h.openRetranslateModal = async (...args) => {
            const ui = h.getRetranslateModalUi();
            if (!ui?.openRetranslateModal) {
                if (typeof h.appendLog === 'function') {
                    h.appendLog('重新翻译界面核心未加载（retranslate-modal-ui）', 'err');
                }
                late(h, 'showToast')('重新翻译界面核心未加载', 'err');
                return;
            }
            return ui.openRetranslateModal(...args);
        };

        h.getRetranslateRunner = createLazyFactory(
            () => resolveApi(h, 'retranslateRunnerApi', 'TransubRetranslateRunner').createRetranslateRunner,
            () => ({
                state: h.state,
                els: h.els,
                electron: h.electron,
                appendLog: late(h, 'appendLog'),
                appendRetranslateLog: late(h, 'appendRetranslateLog'),
                uiTf: late(h, 'uiTf'),
                basename: late(h, 'basename'),
                showToast: late(h, 'showToast'),
                promptProUnlockRequired: (...a) => h.promptProUnlockRequired(...a),
                closeRetranslateModal: (...a) => h.closeRetranslateModal(...a),
                readRetranslateModeFromModal: (...a) => h.readRetranslateModeFromModal(...a),
                readRetranslateSmartHybrid: (...a) => h.readRetranslateSmartHybrid(...a),
                readRetranslateSmartPolish: (...a) => h.readRetranslateSmartPolish(...a),
                readRetranslateStyleFromModal: (...a) => h.readRetranslateStyleFromModal(...a),
                primarySubFormatFromForm: (...a) => h.primarySubFormatFromForm(...a),
                normalizeChineseSubtitleVariant: late(h, 'normalizeChineseSubtitleVariant'),
                settingsNormApi,
                retranslatePlanApi,
                translateStyleApi,
                getManagedLlmCatalogApi: late(h, 'getManagedLlmCatalogApi'),
                getAdvancedEntitled: () => entitled(h),
                getSubtitleTargetLangApi: () => (typeof window !== 'undefined' ? window.TransubSubtitleTargetLang : null)
                    || (g && g.TransubSubtitleTargetLang),
                getSoftwareCreditApi: () => (typeof window !== 'undefined' ? window.TransubSubtitleSoftwareCredit : null)
                    || (g && g.TransubSubtitleSoftwareCredit),
                updateItem: late(h, 'updateItem'),
                refreshListRow: late(h, 'refreshListRow'),
                updateStartButton: late(h, 'updateStartButton'),
                setBadge: late(h, 'setBadge'),
                ensureLogExpanded: late(h, 'ensureLogExpanded'),
                activateInferLogTab: late(h, 'activateInferLogTab'),
                resetJobProgressState: late(h, 'resetJobProgressState'),
                updateProgressUi: late(h, 'updateProgressUi'),
                renderList: late(h, 'renderList'),
                formatDuration: late(h, 'formatDuration'),
                elapsedSecSince: late(h, 'elapsedSecSince'),
                finishShelfTranslateRows: (...a) => h.finishShelfTranslateRows(...a),
            }),
        );
        h.runRetranslateFromModal = async () => {
            const runner = h.getRetranslateRunner();
            if (!runner) {
                if (typeof h.appendLog === 'function') {
                    h.appendLog('重新翻译核心未加载（retranslate-runner）', 'err');
                }
                late(h, 'showToast')('重新翻译核心未加载', 'err');
                return;
            }
            return runner.runRetranslateFromModal();
        };

        h.runFilmReconstructFromSelection = async function runFilmReconstructFromSelection(onlyItem = null) {
            if (h.state?.running || h.state?.postBatchBusy || h.state?.retranslateBusy) {
                late(h, 'showToast')('当前有任务进行中', 'warn');
                return;
            }
            if (!entitled(h)) {
                void h.promptProUnlockRequired({ featureLabel: '语境和理解重构' });
                return;
            }
            let item = onlyItem || null;
            if (!item) {
                const selected = h.getSelectedItems();
                if (!selected.length) {
                    if (typeof h.appendLog === 'function') h.appendLog('请先勾选一部要理解重构的影片', 'warn');
                    late(h, 'showToast')('请先勾选一部影片', 'warn');
                    return;
                }
                if (selected.length > 1) {
                    if (typeof h.appendLog === 'function') {
                        h.appendLog('理解重构一次只能勾选一部影片（请在字幕编辑器内操作对照确认）', 'warn');
                    }
                    late(h, 'showToast')('请只勾选一部影片再理解重构', 'warn');
                    return;
                }
                item = selected[0];
            }
            const subPath = typeof h.getSubtitlePathForItem === 'function' ? h.getSubtitlePathForItem(item) : '';
            if (!subPath) {
                if (typeof h.appendLog === 'function') h.appendLog('该条目尚无字幕可重构', 'warn');
                late(h, 'showToast')('该条目尚无字幕', 'warn');
                return;
            }
            const base = typeof h.basename === 'function' ? h.basename(subPath) : subPath;
            if (typeof h.appendLog === 'function') {
                h.appendLog(`打开字幕编辑器并启动影片理解重构：${base}`, 'info');
            }
            const ok = await g?.TransubSubtitleEditor?.openEditor?.(subPath, item.path || '', {
                action: 'film-context-reconstruct',
            });
            if (!ok) late(h, 'showToast')('无法打开字幕编辑器', 'err');
        };

        // Log detail helpers (were near factory workspace)
        h.syncLogDetailSheetAnchor = function syncLogDetailSheetAnchor() {
            const els = h.els || {};
            if (!els.logDetailModal?.classList.contains('is-open')) return;
            if (typeof document === 'undefined' || !document.body.classList.contains('factory-shell')) return;
            const anchor = els.factoryStatusLogBtn;
            if (!anchor || !factoryStatusBarApi.computeLogSheetAnchorStyle) return;
            const style = factoryStatusBarApi.computeLogSheetAnchorStyle(
                anchor.getBoundingClientRect(),
                { width: window.innerWidth, height: window.innerHeight },
            );
            if (!style) return;
            els.logDetailModal.style.setProperty('--fx-log-sheet-left', style.left);
            els.logDetailModal.style.setProperty('--fx-log-sheet-bottom', style.bottom);
            els.logDetailModal.style.setProperty('--fx-log-sheet-width', style.width);
        };

        h.openLogDetailModal = function openLogDetailModal() {
            const els = h.els || {};
            if (!els.logDetailModal) return;
            if (els.logSection) {
                els.logSection.style.height = '';
                els.logSection.style.flex = '';
            }
            els.logDetailModal.classList.add('is-open');
            h.syncLogDetailSheetAnchor();
            g?.TransubLogPanelRender?.flushAllVisible?.(document);
            g?.TransubFeatures?.activateLogTab?.('app');
            const panel = els.logHost?.closest('.log-panel') || els.logHost;
            if (panel) {
                const pin = () => late(h, 'scrollMainLogPanel')(panel);
                if (typeof requestAnimationFrame === 'function') requestAnimationFrame(pin);
                else pin();
            }
            late(h, 'updateFactoryStatusLogFromHost')();
        };

        h.closeLogDetailModal = function closeLogDetailModal() {
            const els = h.els || {};
            els.logDetailModal?.classList.remove('is-open');
            if (els.logDetailModal) {
                els.logDetailModal.style.removeProperty('--fx-log-sheet-left');
                els.logDetailModal.style.removeProperty('--fx-log-sheet-bottom');
                els.logDetailModal.style.removeProperty('--fx-log-sheet-width');
            }
        };

        return h;
    }

    return { install };
}));
