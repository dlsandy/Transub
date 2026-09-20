/**
 * Main-window / standalone chrome boot sequence.
 * Shell injects DOM/IPC/state via createAppInit(deps).
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAppInit = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function appInitFactory(global) {
    /**
     * @param {object} deps shell adapters
     */
    function createAppInit(deps) {
        const d = deps || {};
        const state = d.state;
        const els = d.els || {};
        const electron = d.electron;
        const pageQuery = d.pageQuery || new URLSearchParams();

        const getIsStandaloneSettings = d.getIsStandaloneSettings || (() => false);
        const getIsStandaloneWizard = d.getIsStandaloneWizard || (() => false);
        const getIsStandaloneChrome = d.getIsStandaloneChrome || (() => false);
        const getInitialSettingsTab = d.getInitialSettingsTab || (() => 'runtime');
        const getInitialOpenModelsLibrary = d.getInitialOpenModelsLibrary || (() => false);

        const appendLog = d.appendLog || (() => {});
        const cacheEls = d.cacheEls || (() => {});
        const syncQuickExtrasBar = d.syncQuickExtrasBar || (() => {});
        const fillAppVersionLabel = d.fillAppVersionLabel || (async () => {});
        const bindEvents = d.bindEvents || (() => {});
        const bindFactoryShellChrome = d.bindFactoryShellChrome || (() => {});
        const syncDeviceOptionsForMode = d.syncDeviceOptionsForMode || (() => {});
        const syncExpertCustomHints = d.syncExpertCustomHints || (() => {});
        const setBadge = d.setBadge || (() => {});
        const syncBatchSizeUi = d.syncBatchSizeUi || (() => {});
        const syncLogLevelHint = d.syncLogLevelHint || (() => {});
        const syncChineseSubtitleVariantUi = d.syncChineseSubtitleVariantUi || (() => {});
        const syncPostTaskMenuUi = d.syncPostTaskMenuUi || (() => {});
        const syncPostTaskExtrasUi = d.syncPostTaskExtrasUi || (() => {});
        const resetPostTaskSelect = d.resetPostTaskSelect || (() => {});
        const renderList = d.renderList || (() => {});
        const updateStartButton = d.updateStartButton || (() => {});
        const rehydrateFromLiveBatchIfNeeded = d.rehydrateFromLiveBatchIfNeeded
            || (async () => false);
        const isDesktop = d.isDesktop || (() => true);
        const warnMissingRendererCores = d.warnMissingRendererCores || (() => {});
        const setLoading = d.setLoading || (() => {});
        const applyOptionsToForm = d.applyOptionsToForm || (async () => {});
        const buildSavedOptionsFromForm = d.buildSavedOptionsFromForm || (() => ({}));
        const setSavedOptionsSnapshot = d.setSavedOptionsSnapshot || (() => {});
        const updateParamsSummary = d.updateParamsSummary || (() => {});
        const syncResourceUsageMonitor = d.syncResourceUsageMonitor || (() => {});
        const ensureEngineInstallPathFilled = d.ensureEngineInstallPathFilled || (async () => {});
        const loadEngineModelsCacheFromDisk = d.loadEngineModelsCacheFromDisk || (async () => {});
        const readEngineBackendFromForm = d.readEngineBackendFromForm || (() => 'engine');
        const refreshInstallStatus = d.refreshInstallStatus || (async () => {});
        const refreshEngineStatus = d.refreshEngineStatus || (async () => {});
        const ensureSettingsShellReady = d.ensureSettingsShellReady || (async () => {});
        const ensureFactoryChromeDom = d.ensureFactoryChromeDom || (async () => {
            const loader = global.TransubUiFragmentLoad;
            if (!loader?.ensureFactoryChromeDom && !loader?.ensureUiFragment) return;
            if (typeof loader.ensureFactoryChromeDom === 'function') {
                await loader.ensureFactoryChromeDom();
                return;
            }
            await Promise.all([
                loader.ensureUiFragment('factory-modals'),
                loader.ensureUiFragment('setup-wizard'),
            ]);
        });
        const loadDeferredGroup = d.loadDeferredGroup || (async () => {});
        const refreshAdvancedEntitlement = d.refreshAdvancedEntitlement || (async () => {});
        const openParamsModal = d.openParamsModal || (() => {});
        const openEngineModelsLibrary = d.openEngineModelsLibrary || (async () => {});
        const flushPendingActivePresetId = d.flushPendingActivePresetId || (() => {});
        const syncPostTaskToMain = d.syncPostTaskToMain || (async () => {});
        const runBackgroundStartupChecks = d.runBackgroundStartupChecks || (async () => {});
        const consumeExternalImportFiles = d.consumeExternalImportFiles || (async () => {});
        const openAppSettings = d.openAppSettings || (() => {});

        function finishBootOverlay() {
            try {
                // Always clear the HTML boot mask. In-flight probe / import uses
                // #transubBusyOverlay (busy-overlay-core), not loadingDepth on #loadingOverlay.
                const overlay = els.loadingOverlay
                    || (typeof document !== 'undefined' ? document.getElementById('loadingOverlay') : null);
                if (overlay) {
                    overlay.classList.add('hidden');
                    overlay.classList.remove('flex', 'is-open');
                    overlay.style.display = 'none';
                }
            } catch { /* ignore */ }
        }

        function finishBootOverlayAfterPaint() {
            const schedule = (cb) => {
                try {
                    if (typeof globalThis !== 'undefined'
                        && typeof globalThis.requestAnimationFrame === 'function') {
                        globalThis.requestAnimationFrame(cb);
                        return;
                    }
                } catch { /* ignore */ }
                setTimeout(cb, 16);
            };
            schedule(() => schedule(finishBootOverlay));
        }

        function ensureStandaloneBootOverlay(message) {
            try {
                const overlay = els.loadingOverlay
                    || (typeof document !== 'undefined' ? document.getElementById('loadingOverlay') : null);
                if (!overlay) return;
                overlay.classList.add('flex', 'is-open');
                overlay.classList.remove('hidden');
                overlay.style.display = 'flex';
                if (message) {
                    const msgEl = els.loadingMessage
                        || (typeof document !== 'undefined' ? document.getElementById('loadingMessage') : null);
                    if (msgEl) msgEl.textContent = message;
                }
            } catch { /* ignore */ }
        }

        function openSetupWizardWithRetry({ force }) {
            const open = () => {
                if (global.TransubSetupWizard?.open) {
                    void global.TransubSetupWizard.open({ force: !!force });
                    return true;
                }
                return false;
            };
            if (!open()) {
                let n = 0;
                const timer = setInterval(() => {
                    n += 1;
                    if (open() || n >= 40) clearInterval(timer);
                }, 50);
            }
        }

        async function init() {
            // Always clear the HTML-default boot overlay, even if early wiring throws.
            try {
                const isStandaloneSettings = getIsStandaloneSettings();
                const isStandaloneWizard = getIsStandaloneWizard();
                const isStandaloneChrome = getIsStandaloneChrome();

                if (isStandaloneSettings) {
                    try {
                        if (typeof document !== 'undefined' && document.documentElement) {
                            document.documentElement.classList.add('settings-standalone');
                        }
                        if (typeof document !== 'undefined' && document.title != null) {
                            document.title = '字幕工厂 设置';
                        }
                    } catch { /* ignore */ }
                    ensureStandaloneBootOverlay('正在打开设置…');
                } else if (isStandaloneWizard) {
                    try {
                        if (typeof document !== 'undefined' && document.documentElement) {
                            document.documentElement.classList.add('wizard-standalone');
                        }
                        if (typeof document !== 'undefined' && document.title != null) {
                            document.title = '字幕工厂 设置向导';
                        }
                    } catch { /* ignore */ }
                    ensureStandaloneBootOverlay('正在打开设置向导…');
                }

                try {
                    await global.TransubI18n?.ensureReady?.();
                } catch { /* ignore */ }
                {
                    const settled = await Promise.allSettled([
                        ensureSettingsShellReady(),
                        ensureFactoryChromeDom(),
                    ]);
                    for (const r of settled) {
                        if (r.status !== 'rejected') continue;
                        const err = r.reason;
                        console.warn('[init] settings/chrome DOM load failed:', err?.message || err);
                        if (!isStandaloneChrome) {
                            appendLog(`设置面板加载失败：${err?.message || err}`, 'err');
                        }
                    }
                }

                cacheEls();
                syncQuickExtrasBar();
                void fillAppVersionLabel();
                bindEvents();
                bindFactoryShellChrome();
                syncDeviceOptionsForMode();
                syncExpertCustomHints();
                if (!isStandaloneChrome) {
                    setBadge('空闲', 'idle');
                }
                syncBatchSizeUi();
                syncLogLevelHint();
                syncChineseSubtitleVariantUi();
                if (!isStandaloneChrome) {
                    syncPostTaskMenuUi();
                    syncPostTaskExtrasUi();
                    resetPostTaskSelect();
                    renderList();
                    updateStartButton();
                }

                if (!isDesktop()) {
                    if (!isStandaloneChrome) appendLog('需在桌面版中使用', 'err');
                    return;
                }

                warnMissingRendererCores();

                // Reveal chrome before heavy form apply so first paint is not blocked
                // by hundreds of settings controls (main window only).
                if (!isStandaloneChrome) {
                    setLoading(false);
                    finishBootOverlay();
                } else {
                    setLoading(true, isStandaloneWizard ? '正在打开设置向导…' : '正在加载配置…');
                    ensureStandaloneBootOverlay(
                        isStandaloneWizard ? '正在打开设置向导…' : '正在加载配置…',
                    );
                }
                try {
                    const optsRes = await electron?.transWithAiGetOptions?.();
                    if (optsRes?.options) {
                        await applyOptionsToForm(optsRes.options);
                        setSavedOptionsSnapshot(buildSavedOptionsFromForm());
                        updateParamsSummary();
                        syncResourceUsageMonitor();
                    } else {
                        await ensureEngineInstallPathFilled();
                    }
                    if (!isStandaloneChrome) {
                        resetPostTaskSelect();
                    }
                } catch (err) {
                    console.warn('[init] load options failed:', err?.message || err);
                    if (!isStandaloneChrome) {
                        appendLog(`加载配置失败：${err?.message || err}`, 'err');
                    }
                } finally {
                    setLoading(false);
                    if (isStandaloneChrome) {
                        ensureStandaloneBootOverlay(
                            isStandaloneWizard ? '正在打开设置向导…' : '正在加载配置…',
                        );
                    }
                }
                // Warm model catalog from disk so UI chips work without spawning the engine.
                void loadEngineModelsCacheFromDisk({ apply: true }).catch(() => {});
                // Soft probe only (no spawn / no models+GPU list). Live catalog refresh is
                // cache-first: miss / manual refresh / CRUD only (see ensureEngineModelsCatalog).
                void (async () => {
                    try {
                        if (readEngineBackendFromForm() === 'twai') {
                            await refreshInstallStatus({ quick: true });
                        } else {
                            await refreshEngineStatus({ soft: true });
                        }
                    } catch { /* ignore */ }
                })();

                if (isStandaloneWizard) {
                    const pending = await electron?.transubConsumePendingSetupWizard?.().catch(() => null);
                    const force = pending?.forceWizard !== false
                        && pageQuery.get('forceWizard') !== '0';
                    openSetupWizardWithRetry({ force: !!force });
                    return;
                }

                if (isStandaloneSettings) {
                    await loadDeferredGroup('catalogs');
                    await refreshAdvancedEntitlement();
                    const pendingParams = await electron?.transubConsumePendingOpenParams?.().catch(() => null);
                    const tab = pendingParams?.tab || getInitialSettingsTab() || 'runtime';
                    await openParamsModal(tab);
                    if (pendingParams?.openLibrary || getInitialOpenModelsLibrary()) {
                        void openEngineModelsLibrary();
                    }
                    void global.TransubFeatures?.loadPresets?.();
                    const wantWizard = !!pendingParams?.wizard
                        || pageQuery.get('wizard') === '1';
                    if (wantWizard) {
                        // Legacy: settings window opened with wizard=1 — prefer dedicated wizard if available.
                        if (electron?.transubOpenSetupWizard) {
                            void electron.transubOpenSetupWizard({
                                forceWizard: pendingParams?.forceWizard !== false
                                    && pageQuery.get('forceWizard') !== '0',
                            });
                            try { global.close(); } catch (_) { /* ignore */ }
                            return;
                        }
                        const force = pendingParams?.forceWizard !== false
                            && pageQuery.get('forceWizard') !== '0';
                        openSetupWizardWithRetry({ force: !!force });
                    }
                    return;
                }

                // Main window: entitlement + presets after first interactive frame.
                void (async () => {
                    try {
                        await refreshAdvancedEntitlement();
                    } catch { /* ignore */ }
                    try {
                        await loadDeferredGroup('catalogs');
                        await loadDeferredGroup('smartTranslate');
                        await global.TransubFeatures?.loadPresets?.();
                        flushPendingActivePresetId();
                        warnMissingRendererCores({ includeDeferred: true });
                    } catch { /* ignore */ }
                    try {
                        await syncPostTaskToMain();
                    } catch { /* ignore */ }
                    try {
                        global.TransubAnimeWhisperPresetTip?.maybeShow?.({
                            getVersion: async () => {
                                try {
                                    return await electron?.getAppVersion?.();
                                } catch (_) {
                                    return { version: '' };
                                }
                            },
                        });
                    } catch { /* ignore */ }
                })();

                void runBackgroundStartupChecks();

                try {
                    electron?.onTransubCliFilesPending?.(() => {
                        void consumeExternalImportFiles();
                    });
                } catch (_) { /* ignore */ }

                void consumeExternalImportFiles();

                try {
                    await rehydrateFromLiveBatchIfNeeded();
                } catch (_) { /* ignore */ }

                try {
                    const pendingParams = await electron?.transubConsumePendingOpenParams?.();
                    if (pendingParams?.tab || pendingParams?.wizard) {
                        openAppSettings(pendingParams.tab || 'runtime', {
                            wizard: !!pendingParams.wizard,
                            forceWizard: !!pendingParams.forceWizard,
                        });
                    }
                } catch (_) { /* ignore */ }
            } catch (err) {
                console.error('[init] boot failed:', err);
                try {
                    if (!getIsStandaloneChrome()) appendLog(`启动失败：${err?.message || err}`, 'err');
                } catch { /* ignore */ }
            } finally {
                if (getIsStandaloneChrome()) finishBootOverlayAfterPaint();
                else finishBootOverlay();
            }
        }

        return { init, finishBootOverlay };
    }

    return { createAppInit };
}));
