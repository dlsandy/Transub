/**
 * Main-window UI extras: menus, QC banner, language chips, shortcuts keydown, etc.
 * Shell injects DOM/state/IPC via createMainUiExtras(deps).
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubMainUiExtras = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function mainUiExtrasFactory(global) {
    function isTypingTarget(el) {
        if (!el) return false;
        const tag = String(el.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
        return !!el.isContentEditable;
    }

    /**
     * @param {object} deps shell adapters
     */
    function createMainUiExtras(deps) {
        const d = deps || {};
        const state = d.state;
        const els = d.els || {};
        const electron = d.electron;
        const getDocument = d.getDocument
            || (() => (typeof document !== 'undefined' ? document : (global && global.document)));
        const getWindow = d.getWindow
            || (() => (typeof window !== 'undefined' ? window : (global && global.window)));
        const getGlobal = d.getGlobal || (() => global);
        const EventCtor = d.Event
            || (typeof Event !== 'undefined' ? Event : (global && global.Event));
        const typingCheck = d.isTypingTarget || isTypingTarget;

        const bindMainLogSplitter = d.bindMainLogSplitter || (() => {});
        const setMoreMenuOpen = d.setMoreMenuOpen || (() => {});
        const toggleDensity = d.toggleDensity || (() => {});
        const toggleMainTheme = d.toggleMainTheme || (() => {});
        const openCliCommandModal = d.openCliCommandModal || (() => {});
        const refreshCliCommandPreview = d.refreshCliCommandPreview || (() => {});
        const closeCliCommandModal = d.closeCliCommandModal || (() => {});
        const showToast = d.showToast || (() => {});
        const addVideos = d.addVideos || (() => {});
        const addFolder = d.addFolder || (() => {});
        const autoAddMissingSubtitles = d.autoAddMissingSubtitles || (() => {});
        const updateQcBanner = d.updateQcBanner || (() => {});
        const runPostBatchQcFix = d.runPostBatchQcFix || (() => {});
        const runPostBatchQcSmartFix = d.runPostBatchQcSmartFix || (() => {});
        const openFirstQcIssueItem = d.openFirstQcIssueItem || (() => {});
        const openAppSettings = d.openAppSettings || (() => {});
        const ux = d.ux || (() => null);
        const getModelsMenuOpen = d.getModelsMenuOpen || (() => false);
        const setModelsMenuOpen = d.setModelsMenuOpen || (() => {});
        const toggleModelsChip = d.toggleModelsChip || ((slot) => {
            setModelsMenuOpen(!getModelsMenuOpen(), { slot });
        });
        const setModelsPickSlot = d.setModelsPickSlot || (() => {});
        const setQuickTranslateMode = d.setQuickTranslateMode || (() => {});
        const setTranslateMtPickMode = d.setTranslateMtPickMode || (() => {});
        const setExternalTranslateSource = d.setExternalTranslateSource || (() => {});
        const getParamsMoreMenuOpen = d.getParamsMoreMenuOpen || (() => false);
        const setParamsMoreMenuOpen = d.setParamsMoreMenuOpen || (() => {});
        const adoptManualAsrFromUserChange = d.adoptManualAsrFromUserChange || (() => {});
        const persistFormOptionsQuiet = d.persistFormOptionsQuiet || (() => {});
        const getCachedHardwareRecommend = d.getCachedHardwareRecommend || (() => null);
        const applyAsrRecommendFromChip = d.applyAsrRecommendFromChip || (() => {});
        const syncExpertExtraChipsUi = d.syncExpertExtraChipsUi || (() => {});
        const setPostBatchQcFixMenuOpen = d.setPostBatchQcFixMenuOpen || (() => {});
        const setPostBatchQcFixMode = d.setPostBatchQcFixMode || (() => {});
        const setParamsModeMenuOpen = d.setParamsModeMenuOpen || (() => {});
        const setParamsModeAsrPickMode = d.setParamsModeAsrPickMode || (() => {});
        const selectParamsModeAsrManual = d.selectParamsModeAsrManual || (() => {});
        const selectParamsModePresetsBrowse = d.selectParamsModePresetsBrowse || (() => {});
        const selectParamsModeCustom = d.selectParamsModeCustom || (() => {});
        const selectParamsModePreset = d.selectParamsModePreset || (() => {});
        const markSettingsDirty = d.markSettingsDirty || (() => {});
        const setSaveParamsStatus = d.setSaveParamsStatus || (() => {});
        const getExternalImportAction = d.getExternalImportAction || (() => '');
        const resetExternalImportIdle = d.resetExternalImportIdle || (() => {});
        const applyTranslateModeToForm = d.applyTranslateModeToForm || (() => {});
        const updateModelSelectHint = d.updateModelSelectHint || (() => {});
        const getTranslateModeUi = d.getTranslateModeUi || (() => null);
        const syncMtModelChipUi = d.syncMtModelChipUi || (() => {});
        const updateReadinessStrip = d.updateReadinessStrip || (() => {});
        const rememberCurrentMtForTarget = d.rememberCurrentMtForTarget || (() => {});
        const toggleLogCollapsed = d.toggleLogCollapsed || (() => {});
        const scrollMainLogPanel = d.scrollMainLogPanel || (() => {});
        const updateFactoryStatusLogFromHost = d.updateFactoryStatusLogFromHost || (() => {});
        const appendLog = d.appendLog || (() => {});
        const applyMtTargetCapabilityToForm = d.applyMtTargetCapabilityToForm || (() => {});
        const updateParamsSummary = d.updateParamsSummary || (() => {});
        const syncParamsMoreChipUi = d.syncParamsMoreChipUi || (() => {});
        const toQuickTargetLang = d.toQuickTargetLang || ((v) => String(v || 'simplified'));
        const readTranslateModeFromForm = d.readTranslateModeFromForm || (() => '');
        const getIsStandaloneSettings = d.getIsStandaloneSettings || (() => false);
        const setAddMenuOpen = d.setAddMenuOpen || (() => {});
        const ensureJobRuntimeScripts = d.ensureJobRuntimeScripts || (() => Promise.resolve());
        const startSubtitleGeneration = d.startSubtitleGeneration || (() => {});
        const closeLogDetailModal = d.closeLogDetailModal || (() => {});
        const closeRetranslateModal = d.closeRetranslateModal || (() => {});
        const closeTaskColContextMenu = d.closeTaskColContextMenu || (() => {});
        const closeTaskRowContextMenu = d.closeTaskRowContextMenu || (() => {});
        const stopTask = d.stopTask || (() => {});
        const syncSelectAllCheck = d.syncSelectAllCheck || (() => {});
        const renderList = d.renderList || (() => {});
        const updateStartButton = d.updateStartButton || (() => {});
        const removeSelected = d.removeSelected || (() => {});
        const toggleTaskSelectAll = d.toggleTaskSelectAll || (() => {
            if (!state?.items?.length) return;
            const allSelected = state.items.every((i) => i.selected);
            state.items.forEach((i) => { i.selected = !allSelected; });
            syncSelectAllCheck();
            renderList();
            updateStartButton();
        });

        function bindMainUiExtras() {
            const doc = getDocument();
            const g = getGlobal();
            bindMainLogSplitter();
            els.moreMenuBtn?.addEventListener('click', (event) => {
                event.stopPropagation();
                setMoreMenuOpen(!state.moreMenuOpen);
            });
            els.moreMenu?.addEventListener('click', (event) => {
                const item = event.target.closest('[role="menuitem"]');
                if (item) setMoreMenuOpen(false);
                event.stopPropagation();
            });
            els.toggleDensityBtn?.addEventListener('click', () => {
                toggleDensity();
                setMoreMenuOpen(false);
            });
            els.openAboutBtn?.addEventListener('click', () => {
                setMoreMenuOpen(false);
                void electron?.transubOpenAboutWindow?.();
            });
            els.openCliCommandMenuBtn?.addEventListener('click', () => {
                setMoreMenuOpen(false);
                void openCliCommandModal();
            });
            els.openSetupWizardMoreMenuBtn?.addEventListener('click', () => {
                setMoreMenuOpen(false);
                void getGlobal()?.TransubSetupWizard?.open?.({ force: false });
            });
            doc?.querySelectorAll?.('input[name="cliCommandKind"]')?.forEach((input) => {
                input.addEventListener('change', () => {
                    void refreshCliCommandPreview();
                });
            });
            els.closeCliCommandBtn?.addEventListener('click', () => closeCliCommandModal());
            els.closeCliCommandBtn2?.addEventListener('click', () => closeCliCommandModal());
            els.cliCommandModal?.addEventListener('click', (event) => {
                if (event.target === els.cliCommandModal) closeCliCommandModal();
            });
            els.copyCliCommandBtn?.addEventListener('click', async () => {
                const text = String(els.cliCommandText?.value || '').trim();
                if (!text) {
                    showToast('没有可复制的内容', 'warn');
                    return;
                }
                try {
                    await (getWindow()?.navigator?.clipboard?.writeText?.(text)
                        || global?.navigator?.clipboard?.writeText?.(text));
                    showToast('命令已复制到剪贴板', 'ok');
                } catch (err) {
                    showToast(err?.message || '复制失败', 'err');
                }
            });
            els.emptyAddVideosBtn?.addEventListener('click', () => addVideos());
            els.emptyAddFolderBtn?.addEventListener('click', () => addFolder());
            els.emptyAutoScanBtn?.addEventListener('click', () => { void autoAddMissingSubtitles(); });
            els.qcBannerDismissBtn?.addEventListener('click', () => {
                state.qcBannerDismissed = true;
                updateQcBanner();
            });
            els.qcBannerFixBtn?.addEventListener('click', () => {
                void runPostBatchQcFix();
            });
            els.qcBannerSmartFixBtn?.addEventListener('click', () => {
                void runPostBatchQcSmartFix();
            });
            els.qcBannerViewBtn?.addEventListener('click', () => {
                openFirstQcIssueItem();
            });
            els.emptyStateWizardBtn?.addEventListener('click', () => {
                void g.TransubSetupWizard?.open?.({ force: false });
            });
            els.emptyStateEnvBtn?.addEventListener('click', () => {
                openAppSettings('install');
            });
            els.readinessStripAction?.addEventListener('click', () => {
                const action = els.readinessStripAction.dataset.action || 'install';
                if (action === 'wizard') openAppSettings('install', { wizard: true });
                else if (action === 'runtime') openAppSettings('runtime');
                else if (action === 'pro') openAppSettings('pro');
                else if (action === 'models') openAppSettings('models', { openLibrary: true });
                else if (action === 'pro-llm' || action === 'pro-smart-translate') {
                    openAppSettings('pro-smart-translate');
                }
                else openAppSettings('install');
            });
            els.toggleMainThemeBtn?.addEventListener('click', () => {
                toggleMainTheme();
                setMoreMenuOpen(false);
            });
            els.openShortcutsMenuBtn?.addEventListener('click', () => {
                setMoreMenuOpen(false);
                ux()?.openShortcutsModal?.();
            });
            els.envBannerBtn?.addEventListener('click', () => {
                openAppSettings('install');
            });
            els.envBannerWizardBtn?.addEventListener('click', () => {
                openAppSettings('install', { wizard: true });
            });
            els.asrChipBtn?.addEventListener('click', (event) => {
                event.stopPropagation();
                toggleModelsChip('asr');
            });
            els.mtChipBtn?.addEventListener('click', (event) => {
                event.stopPropagation();
                toggleModelsChip('mt');
            });
            els.modelsChipBtn?.addEventListener('click', (event) => {
                event.stopPropagation();
                toggleModelsChip('asr');
            });
            const closeModelsPick = (event) => {
                event?.stopPropagation?.();
                setModelsMenuOpen(false);
            };
            els.modelsPickCloseBtn?.addEventListener('click', closeModelsPick);
            els.modelsPickDoneBtn?.addEventListener('click', closeModelsPick);
            const bindModelsSlot = (el, slot) => {
                el?.addEventListener('click', (event) => {
                    event.stopPropagation();
                    setModelsPickSlot(slot, { force: true });
                });
            };
            bindModelsSlot(els.modelsPickSlotAsr, 'asr');
            bindModelsSlot(els.modelsPickSlotMt, 'mt');
            els.translateMenu?.querySelectorAll('[data-translate-mode]').forEach((item) => {
                item.addEventListener('click', (event) => {
                    event.stopPropagation();
                    // Keep models menu open so user can also pick recognition.
                    setQuickTranslateMode(item.dataset.translateMode || 'llm');
                });
            });
            els.translateMtAutoBtn?.addEventListener('click', (event) => {
                event.stopPropagation();
                void setTranslateMtPickMode('auto');
            });
            els.translateMtManualBtn?.addEventListener('click', (event) => {
                event.stopPropagation();
                void setTranslateMtPickMode('manual');
            });
            els.translateExternalStationBtn?.addEventListener('click', (event) => {
                event.stopPropagation();
                void (async () => {
                    await setExternalTranslateSource('station');
                    try { getTranslateModeUi()?.rebuildTranslateMenuMtSection?.(); } catch (_) { /* ignore */ }
                })();
            });
            els.translateExternalByokBtn?.addEventListener('click', (event) => {
                event.stopPropagation();
                void (async () => {
                    await setExternalTranslateSource('byok');
                    try { getTranslateModeUi()?.rebuildTranslateMenuMtSection?.(); } catch (_) { /* ignore */ }
                })();
            });
            els.translateMenu?.addEventListener('click', (event) => event.stopPropagation());
            els.paramsMoreBtn?.addEventListener('click', (event) => {
                event.stopPropagation();
                setParamsMoreMenuOpen(!getParamsMoreMenuOpen());
            });
            els.paramsMoreMenu?.addEventListener('click', (event) => event.stopPropagation());
            // Expert drawer chip removed from main UI; keep listeners as no-ops if DOM absent.
            els.quickAsrModelSelect?.addEventListener('change', () => {
                if (!els.engineAsrModelSelect) return;
                els.engineAsrModelSelect.value = els.quickAsrModelSelect.value;
                if (EventCtor) {
                    els.engineAsrModelSelect.dispatchEvent(new EventCtor('change'));
                }
                adoptManualAsrFromUserChange({ persist: true });
            });
            els.quickVadModelSelect?.addEventListener('change', () => {
                if (!els.engineVadModelSelect) return;
                els.engineVadModelSelect.value = els.quickVadModelSelect.value;
                if (EventCtor) {
                    els.engineVadModelSelect.dispatchEvent(new EventCtor('change'));
                }
                void persistFormOptionsQuiet();
            });
            els.quickAsrRecommendBtn?.addEventListener('click', () => {
                const id = String(
                    els.quickAsrRecommendBtn?.dataset?.recommendedAsr
                    || getCachedHardwareRecommend()?.asrModel
                    || '',
                ).trim();
                if (!id) return;
                if (els.asrRecommendChip) els.asrRecommendChip.dataset.recommendedAsr = id;
                applyAsrRecommendFromChip();
                syncExpertExtraChipsUi();
            });
            els.postBatchQcFixMenu?.querySelectorAll('[data-qc-fix-mode]').forEach((item) => {
                item.addEventListener('click', (event) => {
                    event.stopPropagation();
                    setPostBatchQcFixMenuOpen(false);
                    setParamsMoreMenuOpen(false);
                    void setPostBatchQcFixMode(item.dataset.qcFixMode || 'none', { fromUser: true });
                });
            });
            els.postBatchQcFixMenu?.addEventListener('click', (event) => event.stopPropagation());
            els.paramsModeBtn?.addEventListener('click', (event) => {
                event.stopPropagation();
                toggleModelsChip('asr');
            });
            // Single handler for recognition column (must receive bubbles from #paramsModeMenu).
            els.modelsMenu?.addEventListener('click', (event) => {
                const root = els.modelsMenu;
                if (!root) return;
                if (event.target?.closest?.('[data-models-pick-dismiss]')) {
                    setModelsMenuOpen(false);
                    event.stopPropagation();
                    return;
                }
                event.stopPropagation();
                const asrPick = event.target?.closest?.('[data-asr-pick]');
                if (asrPick && root.contains(asrPick)) {
                    void setParamsModeAsrPickMode(asrPick.getAttribute('data-asr-pick'));
                    return;
                }
                const asrModel = event.target?.closest?.('[data-asr-model]');
                if (asrModel && root.contains(asrModel)) {
                    const id = String(asrModel.getAttribute('data-asr-model') || '').trim();
                    if (id) {
                        void selectParamsModeAsrManual(id, { persist: true });
                    }
                    return;
                }
                const item = event.target?.closest?.('[data-params-mode], [data-preset-id]');
                if (!item || !root.contains(item)) return;
                const mode = item.getAttribute('data-params-mode');
                const presetId = item.getAttribute('data-preset-id');
                if (mode === 'presets') {
                    selectParamsModePresetsBrowse({ persist: true });
                    return;
                }
                if (mode === 'custom') {
                    selectParamsModeCustom({ persist: true });
                    return;
                }
                if (mode === 'open-settings') {
                    setParamsModeMenuOpen(false);
                    openAppSettings('params');
                    return;
                }
                if (presetId) {
                    void selectParamsModePreset(presetId, { persist: true });
                }
            });
            els.postBatchQcFixModeSelect?.addEventListener('change', () => {
                void setPostBatchQcFixMode(els.postBatchQcFixModeSelect.value || 'none', {
                    fromUser: true,
                    persist: false,
                });
                markSettingsDirty(true);
                setSaveParamsStatus('有未保存更改', 'warn');
            });
            els.externalImportActionSelect?.addEventListener('change', () => {
                if (getExternalImportAction() !== 'list_when_idle') {
                    state.externalImportIdlePending = false;
                    resetExternalImportIdle();
                }
                markSettingsDirty(true);
                setSaveParamsStatus('有未保存更改', 'warn');
            });
            ['translateModeEngine', 'translateModeSakura', 'translateModeExternal', 'translateModeDialog', 'translateModeSmart'].forEach((id) => {
                els[id]?.addEventListener('change', () => {
                    if (!els[id]?.checked) return;
                    applyTranslateModeToForm(els[id].value, { fromUser: true });
                    markSettingsDirty(true);
                    setSaveParamsStatus('有未保存更改', 'warn');
                    updateModelSelectHint();
                });
            });
            els.engineMtModelSelect?.addEventListener('change', () => {
                if (getTranslateModeUi()?.isSyncingTranslateMode?.()) return;
                markSettingsDirty(true);
                setSaveParamsStatus('有未保存更改', 'warn');
                syncMtModelChipUi();
                updateReadinessStrip();
            });
            els.engineLlmMtModelSelect?.addEventListener('change', () => {
                if (getTranslateModeUi()?.isSyncingTranslateMode?.()) return;
                getTranslateModeUi()?.syncHybridSentenceMtMirror?.();
                rememberCurrentMtForTarget();
                markSettingsDirty(true);
                setSaveParamsStatus('有未保存更改', 'warn');
                syncMtModelChipUi();
                updateReadinessStrip();
            });
            els.hybridSentenceMtModelSelect?.addEventListener('change', () => {
                if (getTranslateModeUi()?.isSyncingTranslateMode?.()) return;
                getTranslateModeUi()?.syncPrimaryLlmMtFromHybridMirror?.();
                rememberCurrentMtForTarget();
                markSettingsDirty(true);
                setSaveParamsStatus('有未保存更改', 'warn');
                syncMtModelChipUi();
                updateReadinessStrip();
            });
            els.logCollapseBtn?.addEventListener('click', toggleLogCollapsed);
            els.logAutoScrollCheck?.addEventListener('change', () => {
                const on = !!els.logAutoScrollCheck.checked;
                g.TransubLogAutoScroll?.writeEnabled?.(on);
                if (on) {
                    const active = doc?.querySelector?.('#logSection .log-panel.active');
                    const host = active?.querySelector?.('#logHost, #inferLogHost')
                        || active?.firstElementChild
                        || null;
                    if (host) g.TransubLogPanelRender?.flushHost?.(host, true);
                    scrollMainLogPanel(active);
                }
            });
            els.clearLogBtn?.addEventListener('click', () => {
                const active = doc?.querySelector?.('#logSection .log-panel.active');
                const host = active?.querySelector?.('#logHost, #inferLogHost')
                    || els.logHost
                    || null;
                const renderApi = g.TransubLogPanelRender;
                const renderer = host ? renderApi?.get?.(host) : null;
                if (renderer) {
                    renderer.clear('<span class="text-gray-400">日志已清空</span>');
                } else if (host) {
                    host.innerHTML = '<span class="text-gray-400">日志已清空</span>';
                }
                updateFactoryStatusLogFromHost();
            });
            els.copyLogBtn?.addEventListener('click', async () => {
                const active = doc?.querySelector?.('#logSection .log-panel.active');
                const host = active?.querySelector?.('#logHost, #inferLogHost')
                    || els.logHost
                    || null;
                const renderApi = g.TransubLogPanelRender;
                const buffered = host ? renderApi?.get?.(host)?.getText?.() : '';
                const text = buffered || host?.innerText || '';
                try {
                    await (getWindow()?.navigator?.clipboard?.writeText?.(text)
                        || global?.navigator?.clipboard?.writeText?.(text));
                    appendLog('已复制完整日志', 'ok');
                } catch (_) {
                    appendLog('复制日志失败', 'err');
                }
            });
            els.quickLanguageSelect?.addEventListener('change', () => {
                if (els.languageSelect) {
                    els.languageSelect.value = els.quickLanguageSelect.value;
                }
                applyMtTargetCapabilityToForm({ toast: true, refreshSelect: true });
                updateParamsSummary();
                syncMtModelChipUi();
                syncParamsMoreChipUi();
                void persistFormOptionsQuiet();
            });
            els.quickTargetLangSelect?.addEventListener('change', () => {
                if (els.chineseSubtitleVariantSelect) {
                    const raw = els.quickTargetLangSelect.value || 'simplified';
                    els.chineseSubtitleVariantSelect.value = toQuickTargetLang(raw);
                }
                applyMtTargetCapabilityToForm({ toast: true, refreshSelect: true });
                syncParamsMoreChipUi();
                updateParamsSummary();
                syncMtModelChipUi();
                try {
                    applyTranslateModeToForm(readTranslateModeFromForm(), { fromUser: false });
                } catch { /* ignore */ }
                void persistFormOptionsQuiet();
            });
            els.chineseSubtitleVariantSelect?.addEventListener('change', () => {
                if (els.quickTargetLangSelect) {
                    els.quickTargetLangSelect.value = toQuickTargetLang(
                        els.chineseSubtitleVariantSelect.value || 'simplified',
                    );
                }
                applyMtTargetCapabilityToForm({ toast: true, refreshSelect: true });
                syncParamsMoreChipUi();
                updateParamsSummary();
                syncMtModelChipUi();
                try {
                    applyTranslateModeToForm(readTranslateModeFromForm(), { fromUser: false });
                } catch { /* ignore */ }
            });
            els.languageSelect?.addEventListener('change', () => {
                applyMtTargetCapabilityToForm({ toast: true, refreshSelect: true });
                updateParamsSummary();
                syncMtModelChipUi();
                syncParamsMoreChipUi();
            });
            doc?.addEventListener?.('keydown', (event) => {
                if (getIsStandaloneSettings()) return;
                if (!els.paramsModal?.classList.contains('hidden')) return;
                if (typingCheck(event.target)) return;
                const key = event.key;
                if ((key === 'a' || key === 'A') && !event.ctrlKey && !event.metaKey && !event.altKey) {
                    event.preventDefault();
                    setAddMenuOpen(true);
                    return;
                }
                if (key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.altKey) {
                    // Always invoke Start: blocked state uses aria-disabled (still clickable)
                    // so Enter can toast / force-release stale compute locks.
                    event.preventDefault();
                    void ensureJobRuntimeScripts().then(() => startSubtitleGeneration());
                    return;
                }
                if (key === 'Escape') {
                    if (getModelsMenuOpen()) {
                        event.preventDefault();
                        setModelsMenuOpen(false);
                        return;
                    }
                    if (els.logDetailModal?.classList.contains('is-open')) {
                        event.preventDefault();
                        closeLogDetailModal();
                        return;
                    }
                    if (els.retranslateModal && !els.retranslateModal.classList.contains('hidden')) {
                        event.preventDefault();
                        closeRetranslateModal();
                        return;
                    }
                    if (els.taskColContextMenu && !els.taskColContextMenu.classList.contains('hidden')) {
                        event.preventDefault();
                        closeTaskColContextMenu();
                        return;
                    }
                    if (els.taskRowContextMenu && !els.taskRowContextMenu.classList.contains('hidden')) {
                        event.preventDefault();
                        closeTaskRowContextMenu();
                        return;
                    }
                    if (state.running || state.retranslateBusy) {
                        event.preventDefault();
                        stopTask();
                    }
                    return;
                }
                if ((key === '?' || (key === '/' && event.shiftKey)) && !event.ctrlKey && !event.metaKey) {
                    event.preventDefault();
                    ux()?.openShortcutsModal?.();
                    return;
                }
                if ((key === 'a' || key === 'A') && (event.ctrlKey || event.metaKey)) {
                    event.preventDefault();
                    if (els.selectAllItemsBtn?.disabled || els.selectAllCheck?.disabled) return;
                    toggleTaskSelectAll();
                    return;
                }
                if ((key === 'Delete' || key === 'Backspace') && !event.ctrlKey && !event.metaKey) {
                    if (state.retranslateBusy) return;
                    if (state.items.some((i) => i.selected)) {
                        event.preventDefault();
                        removeSelected();
                    }
                }
            });
        }

        return { bindMainUiExtras };
    }

    return {
        createMainUiExtras,
        isTypingTarget,
    };
}));
