/**
 * Chrome wire: shell helpers, deferred loaders, warnMissingRendererCores,
 * compute busy / start block reason.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAppWireChromeShell = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function appWireChromeShellFactory(global) {
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
        const { getBindApi, late } = utils;
        const bindApi = typeof getBindApi === 'function' ? getBindApi() : {};
        const { createLazyFactory } = bindApi;
        if (typeof createLazyFactory !== 'function') return h;

        const settingsNormApi = h.settingsNormApi
            || (global && global.TransubSettingsOptionsNormalize)
            || {};
        const translateChipApi = h.translateChipApi
            || (global && global.TransubTranslateModeChip)
            || {};
        const startReadinessApi = h.startReadinessApi
            || (global && global.TransubStartReadiness)
            || {};
        const factoryStatusBarApi = h.factoryStatusBarApi
            || (global && global.TransubFactoryStatusBar)
            || {};
        const pathUtils = h.pathUtils || (global && global.TransubAppPathUtils) || {};
        const retranslatePlanApi = h.retranslatePlanApi
            || (typeof utils.resolveApi === 'function'
                ? utils.resolveApi(h, 'retranslatePlanApi', 'TransubRetranslatePlan')
                : ((global && global.TransubRetranslatePlan) || {}));
        const TRANSLATE_MODE_CHIP_LABELS = h.TRANSLATE_MODE_CHIP_LABELS
            || translateChipApi.TRANSLATE_MODE_CHIP_LABELS
            || { llm: '推理', external: '外部', dialog: '智能', smart: '混合' };

        // ---------- shell helpers ----------
        h.markSettingsDirty = function markSettingsDirty(dirty = true) {
            const els = h.els || {};
            if (typeof h.setSettingsFormDirty === 'function') h.setSettingsFormDirty(!!dirty);
            else h.settingsFormDirty = !!dirty;
            const dirtyFlag = typeof h.getSettingsFormDirty === 'function'
                ? !!h.getSettingsFormDirty()
                : !!h.settingsFormDirty;
            const standalone = typeof h.getIsStandaloneSettings === 'function'
                ? !!h.getIsStandaloneSettings()
                : !!h.isStandaloneSettings;
            els.settingsDirtyBadge?.classList.toggle('hidden', !dirtyFlag);
            els.headerSettingsDirtyBadge?.classList.toggle('hidden', !dirtyFlag || standalone);
            if (els.cancelParamsBtn) {
                els.cancelParamsBtn.textContent = dirtyFlag ? '取消' : '关闭';
            }
        };

        h.setSaveParamsStatus = function setSaveParamsStatus(text, tone = '') {
            const els = h.els || {};
            if (!els.saveParamsStatus) return;
            els.saveParamsStatus.textContent = text || '';
            if (tone === 'ok') els.saveParamsStatus.className = 'text-xs text-emerald-600';
            else if (tone === 'err') els.saveParamsStatus.className = 'text-xs text-red-600';
            else if (tone === 'warn') els.saveParamsStatus.className = 'text-xs text-amber-700';
            else els.saveParamsStatus.className = 'text-xs text-gray-500';
        };

        h.cacheEls = function cacheEls() {
            const appDomIdsApi = h.appDomIdsApi || (global && global.TransubAppDomIds) || {};
            if (typeof appDomIdsApi.cacheAppDomElements === 'function') {
                appDomIdsApi.cacheAppDomElements(h.els, typeof document !== 'undefined' ? document : null);
                return;
            }
            if (typeof document === 'undefined') return;
            ['loadingOverlay', 'loadingMessage', 'fileListBody', 'startBtn', 'stopBtn']
                .forEach((id) => { h.els[id] = document.getElementById(id); });
        };

        h.setLoading = function setLoading(show, message) {
            const els = h.els || {};
            const state = h.state || {};
            const overlay = els.loadingOverlay
                || (typeof document !== 'undefined' ? document.getElementById('loadingOverlay') : null);
            if (overlay && !els.loadingOverlay) els.loadingOverlay = overlay;
            if (!overlay) return;
            state.loadingDepth = Math.max(0, (state.loadingDepth || 0) + (show ? 1 : -1));
            const visible = state.loadingDepth > 0;
            if (visible) {
                overlay.classList.add('flex', 'is-open');
                overlay.classList.remove('hidden');
                overlay.style.display = 'flex';
            } else {
                overlay.classList.add('hidden');
                overlay.classList.remove('flex', 'is-open');
                overlay.style.display = 'none';
            }
            if (message) {
                const msgEl = els.loadingMessage
                    || (typeof document !== 'undefined' ? document.getElementById('loadingMessage') : null);
                if (msgEl) {
                    els.loadingMessage = msgEl;
                    msgEl.textContent = message;
                }
            }
        };

        h.updateLoadingMessage = function updateLoadingMessage(message) {
            if (message && h.els?.loadingMessage) h.els.loadingMessage.textContent = message;
        };

        h.syncFactoryEngineStatus = function syncFactoryEngineStatus() {
            const els = h.els || {};
            const state = h.state || {};
            const envVisible = !!(els.envBanner && !els.envBanner.classList.contains('hidden'));
            const st = factoryStatusBarApi.resolveEngineStatus
                ? factoryStatusBarApi.resolveEngineStatus({
                    running: !!state.running,
                    envBannerVisible: envVisible,
                })
                : { key: 'ready', label: '就绪' };
            const key = String(st.key || '');
            const label = st.label || '就绪';
            const prev = state._factoryEngineStatusKey;
            if (els.factoryEngineLabel && (prev !== key || els.factoryEngineLabel.textContent !== label)) {
                els.factoryEngineLabel.textContent = label;
            }
            if (els.factoryEngineDot) {
                els.factoryEngineDot.classList.toggle('is-busy', key === 'busy');
                els.factoryEngineDot.classList.toggle('is-offline', key === 'offline');
            }
            if (prev !== key) {
                state._factoryEngineStatusKey = key;
                if (els.factoryTaskSummary) late(h, 'syncFactoryTaskTabUi')();
            }
        };

        h.findItem = function findItem(filePath) {
            const key = typeof h.normPath === 'function' ? h.normPath(filePath) : String(filePath || '');
            return (h.state?.items || []).find((i) => (
                (typeof h.normPath === 'function' ? h.normPath(i.path) : String(i.path || '')) === key
            ));
        };

        h.getSelectedItems = () => (h.state?.items || []).filter((i) => i.selected && i.status !== 'error');

        h.readTaskFromForm = function readTaskFromForm() {
            const els = h.els || {};
            const v = String(els.taskSelect?.value || els.quickTaskSelect?.value || 'translate').trim();
            if (v === 'transcribe' || v === 'dual' || v === 'translate') return v;
            return 'translate';
        };

        h.taskLabelOf = (task) => {
            if (task === 'transcribe') return '原语言';
            if (task === 'dual') return '双语';
            return '翻译';
        };
        h.isTranslateLikeTask = (task) => task === 'translate' || task === 'dual';

        h.toQuickTargetLang = function toQuickTargetLang(v) {
            const s = String(v || '').trim();
            if (s === 'traditional' || s === 'traditional-tw' || s === 'traditional-hk') return 'traditional';
            if (s === 'en' || s === 'ja' || s === 'ko') return s;
            return 'simplified';
        };

        h.readEngineBackendFromForm = function readEngineBackendFromForm() {
            const selectEl = h.els?.engineBackendSelect;
            const rawSelect = selectEl ? String(selectEl.value || '').trim().toLowerCase() : '';
            if (rawSelect === 'twai' || rawSelect === 'transwithai') return 'twai';
            if (rawSelect === 'transub') return 'transub';
            const snap = typeof h.getSavedOptionsSnapshot === 'function'
                ? h.getSavedOptionsSnapshot()
                : h.savedOptionsSnapshot;
            const fromSaved = String(snap?.engineBackend || '').trim().toLowerCase();
            if (fromSaved === 'twai' || fromSaved === 'transwithai') return 'twai';
            return 'transub';
        };

        h.pathDirname = function pathDirname(filePath) {
            if (pathUtils.pathDirname) return pathUtils.pathDirname(filePath);
            const p = String(filePath || '');
            const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'));
            return i >= 0 ? p.slice(0, i) : '';
        };

        h.pathJoin = function pathJoin(dir, name) {
            if (pathUtils.pathJoin) return pathUtils.pathJoin(dir, name);
            const d = String(dir || '');
            const n = String(name || '');
            if (!d) return n;
            const sep = d.includes('/') && !d.includes('\\') ? '/' : '\\';
            return d.endsWith('/') || d.endsWith('\\') ? `${d}${n}` : `${d}${sep}${n}`;
        };

        h.stemNoExt = function stemNoExt(filePath) {
            if (pathUtils.stemNoExt) return pathUtils.stemNoExt(filePath);
            const base = typeof h.basename === 'function' ? h.basename(filePath) : String(filePath || '');
            const dot = base.lastIndexOf('.');
            return dot > 0 ? base.slice(0, dot) : base;
        };

        h.primarySubFormatFromForm = function primarySubFormatFromForm() {
            if (retranslatePlanApi.primarySubFormatFromList && typeof h.readSubFormatsFromForm === 'function') {
                return retranslatePlanApi.primarySubFormatFromList(h.readSubFormatsFromForm());
            }
            return 'srt';
        };

        h.syncDeviceOptionsForMode = () => {};
        h.syncExpertCustomHints = () => { h.els?.transcribeExpertCustomHint?.classList.add('hidden'); };
        h.hasExpertCustomizations = () => false;
        h.nearlyEqual = (a, b, eps = 1e-6) => Math.abs(Number(a) - Number(b)) <= eps;

        if (!h.TWAI_LEGACY_OPTION_DEFAULTS) {
            h.TWAI_LEGACY_OPTION_DEFAULTS = {
                maxInitialTimestamp: 30,
                repetitionPenalty: 1.1,
                noSpeechThreshold: 0.6,
                logProbThreshold: -1,
                compressionRatioThreshold: 2.4,
                smartSplitWithVad: true,
                targetChunkDurationS: 30,
                mergeSegments: true,
                mergeMaxGapMs: 500,
                mergeMaxDurationMs: 15000,
            };
        }
        if (!h.twaiLegacyOptions) h.twaiLegacyOptions = { ...h.TWAI_LEGACY_OPTION_DEFAULTS };
        h.stashTwaiLegacyFromOptions = function stashTwaiLegacyFromOptions(options = {}) {
            const next = { ...h.TWAI_LEGACY_OPTION_DEFAULTS, ...h.twaiLegacyOptions };
            for (const key of Object.keys(h.TWAI_LEGACY_OPTION_DEFAULTS)) {
                if (options[key] !== undefined) next[key] = options[key];
            }
            h.twaiLegacyOptions = next;
        };
        h.readTwaiLegacyOptions = () => ({ ...h.TWAI_LEGACY_OPTION_DEFAULTS, ...h.twaiLegacyOptions });

        h.translateModeLabel = function translateModeLabel(mode) {
            if (translateChipApi.translateModeLabel) return translateChipApi.translateModeLabel(mode);
            return TRANSLATE_MODE_CHIP_LABELS[mode] || TRANSLATE_MODE_CHIP_LABELS.engine || mode;
        };

        // ---------- deferred loaders ----------
        h.loadDeferredGroup = async function loadDeferredGroup(name) {
            const api = global && global.TransubDeferredScriptLoad;
            if (!api?.loadGroup) return;
            await api.loadGroup(name);
        };

        h.ensureSettingsShellReady = async function ensureSettingsShellReady() {
            const loader = global && global.TransubSettingsDomLoad;
            const pending = typeof document !== 'undefined'
                && document.getElementById('paramsModal')?.getAttribute('data-settings-dom') === 'pending';
            if (pending && !loader?.ensureSettingsDom) {
                throw new Error('缺少 TransubSettingsDomLoad，无法加载设置面板');
            }
            if (loader?.ensureSettingsDom) await loader.ensureSettingsDom();
            h.cacheEls();
            try {
                // Must rebind after #paramsModal replaceWith — els/cache alone is not enough.
                h.getAppEventsBinder?.()?.bindTransubStationSettingsEvents?.();
                h.getAppEventsBinder?.()?.bindGithubMirrorSettingsEvents?.();
            } catch (err) {
                console.warn('[Transub] bind settings fragment events failed:', err?.message || err);
            }
            try {
                h.getSettingsModalUi?.()?.invalidateSettingsSearchIndex?.();
                h.getSettingsModalUi?.()?.bindSettingsSearch?.();
                h.getSettingsModalUi?.()?.bindSettingsTips?.();
                late(h, 'bindSettingsGuideLinks')();
            } catch (_) { /* ignore */ }
            if (!h.els?.engineInstallPathInput) {
                throw new Error('设置面板缺少引擎路径控件');
            }
        };

        h.ensureFactoryWorkspaceScripts = async function ensureFactoryWorkspaceScripts(id) {
            const fragKey = (global && global.TransubUiFragmentLoad)?.workspaceFragmentKey?.(id) || '';
            if (fragKey && (global && global.TransubUiFragmentLoad)?.ensureUiFragment) {
                await global.TransubUiFragmentLoad.ensureUiFragment(fragKey);
                h.cacheEls();
                if (id === 'models') {
                    try { h.getAppEventsBinder?.()?.bindModelsWorkspaceEvents?.(); } catch (_) { /* ignore */ }
                    try { late(h, 'bindEngineModelsLabUi')(); } catch (_) { /* ignore */ }
                }
                if (id === 'scenes') {
                    try { global.TransubFeatures?.bindPresets?.(); } catch (_) { /* ignore */ }
                }
            }
            if (id === 'models') await h.loadDeferredGroup('catalogs');
        };

        h.ensureJobRuntimeScripts = async function ensureJobRuntimeScripts() {
            try {
                await h.loadDeferredGroup('catalogs');
                await h.loadDeferredGroup('smartTranslate');
                await h.loadDeferredGroup('qwenAsr');
            } catch { /* ignore */ }
        };

        h.ensureSettingsFeatureScripts = async function ensureSettingsFeatureScripts(tabId) {
            await h.loadDeferredGroup('advancedSettings');
            const tab = String(tabId || '');
            if (tab === 'auto-scan' || tab.startsWith('pro')) {
                await h.loadDeferredGroup('catalogs');
            }
        };

        // ---------- warnMissingRendererCores ----------
        h.warnMissingRendererCores = function warnMissingRendererCores({ includeDeferred = false } = {}) {
            const inferProgress = h.inferProgress || (global && global.TransubInferStageProgress) || {};
            const savedOptionsApi = h.savedOptionsApi
                || (global && global.TransubSettingsSavedOptions)
                || settingsNormApi;
            const missingModelsApi = h.missingModelsApi || (global && global.TransubEngineMissingModels) || {};
            const checks = [
                ['TransubStartReadiness', !!startReadinessApi.computeStartBlockReason],
                ['TransubSettingsSavedOptions', !!(savedOptionsApi.assembleSavedOptionsFromFields
                    || settingsNormApi.assembleSavedOptionsFromFields)],
                ['TransubSettingsDomLoad', !!(global && global.TransubSettingsDomLoad?.ensureSettingsDom)],
                ['TransubUiFragmentLoad', !!(global && global.TransubUiFragmentLoad?.ensureUiFragment)],
                ['TransubInferStageProgress', !!inferProgress.applyVideoProgressPayload],
                ['TransubEngineMissingModels', !!missingModelsApi.resolveExpectedOpusMtModelIds],
                ['TransubComboPlans', !!(global && global.TransubComboPlans?.filterComboPlans)],
                ['TransubComboPlansUi', !!(global && global.TransubComboPlansUi?.createComboPlansUi)],
                ['TransubPostTaskUi', !!(global && global.TransubPostTaskUi?.createPostTaskUi)],
                ['TransubItemQcMarkers', !!(global && global.TransubItemQcMarkers?.createItemQcMarkers)],
                ['TransubRuntimeOptions', !!(global && global.TransubRuntimeOptions?.createRuntimeOptions)],
                ['TransubAppProgressShell', !!(global && global.TransubAppProgressShell?.createAppProgressShell)],
                ['TransubAppMenuCoord', !!(global && global.TransubAppMenuCoord?.createAppMenuCoord)],
                ['TransubAppShellDeps', !!(global && global.TransubAppShellDeps?.mergeDeps)],
            ];
            if (includeDeferred) {
                const names = [
                    ['TransubSmartTranslateReadiness', 'TransubSmartTranslateReadiness', 'assessSmartTranslateReadiness'],
                    ['TransubTranslateModeUi', 'TransubTranslateModeUi', 'createTranslateModeUi'],
                    ['TransubTranslateExternalPick', 'TransubTranslateExternalPick', 'createTranslateExternalPick'],
                    ['TransubPostBatchAutofixPlan', 'TransubPostBatchAutofixPlan', 'planPostBatchAutofixFlags'],
                    ['TransubPostBatchRunner', 'TransubPostBatchRunner', 'createPostBatchRunner'],
                    ['TransubBatchJobProgress', 'TransubBatchJobProgress', 'createBatchJobProgress'],
                    ['TransubBatchStartRunner', 'TransubBatchStartRunner', 'createBatchStartRunner'],
                    ['TransubRetranslatePlan', 'TransubRetranslatePlan', 'computeRetranslateOverallPct'],
                    ['TransubRetranslateRunner', 'TransubRetranslateRunner', 'createRetranslateRunner'],
                    ['TransubRetranslateModalUi', 'TransubRetranslateModalUi', 'createRetranslateModalUi'],
                    ['TransubFactoryTaskListUi', 'TransubFactoryTaskListUi', 'createFactoryTaskListUi'],
                    ['TransubPlayerLaunchUi', 'TransubPlayerLaunchUi', 'createPlayerLaunchUi'],
                    ['TransubFactoryShellUi', 'TransubFactoryShellUi', 'createFactoryShellUi'],
                    ['TransubFactoryWorkspaceNav', 'TransubFactoryWorkspaceNav', 'createFactoryWorkspaceNav'],
                    ['TransubTranslateStylePickerUi', 'TransubTranslateStylePickerUi', 'createTranslateStylePickerUi'],
                    ['TransubListRemovalUi', 'TransubListRemovalUi', 'createListRemovalUi'],
                    ['TransubAppEventsBinder', 'TransubAppEventsBinder', 'createAppEventsBinder'],
                    ['TransubAdvancedEntitlementUi', 'TransubAdvancedEntitlementUi', 'createAdvancedEntitlementUi'],
                    ['TransubTaskListActionsUi', 'TransubTaskListActionsUi', 'createTaskListActionsUi'],
                    ['TransubMissingModelsPrompt', 'TransubMissingModelsPrompt', 'createMissingModelsPrompt'],
                    ['TransubEngineModelsWorkspace', 'TransubEngineModelsWorkspace', 'createEngineModelsWorkspace'],
                    ['TransubEngineModelsLibraryUi', 'TransubEngineModelsLibraryUi', 'createEngineModelsLibraryUi'],
                    ['TransubEngineModelsLabUi', 'TransubEngineModelsLabUi', 'createEngineModelsLabUi'],
                    ['TransubEngineModelsCacheShell', 'TransubEngineModelsCacheShell', 'createEngineModelsCacheShell'],
                    ['TransubParamsModeUi', 'TransubParamsModeUi', 'createParamsModeUi'],
                    ['TransubResourceUsageUi', 'TransubResourceUsageUi', 'createResourceUsageUi'],
                    ['TransubMainUiExtras', 'TransubMainUiExtras', 'createMainUiExtras'],
                    ['TransubQuickToolbarChipsUi', 'TransubQuickToolbarChipsUi', 'createQuickToolbarChipsUi'],
                    ['TransubMediaIntake', 'TransubMediaIntake', 'createMediaIntake'],
                    ['TransubShelfTranslateFlow', 'TransubShelfTranslateFlow', 'createShelfTranslateFlow'],
                    ['TransubSettingsFormApply', 'TransubSettingsFormApply', 'createSettingsFormApply'],
                    ['TransubSettingsModalUi', 'TransubSettingsModalUi', 'createSettingsModalUi'],
                    ['TransubEngineEnvUi', 'TransubEngineEnvUi', 'createEngineEnvUi'],
                    ['TransubBurnSettingsUi', 'TransubBurnSettingsUi', 'createBurnSettingsUi'],
                    ['TransubJobSessionControl', 'TransubJobSessionControl', 'createJobSessionControl'],
                    ['TransubFactoryStatusChips', 'TransubFactoryStatusChips', 'createFactoryStatusChips'],
                    ['TransubQuickExtrasUi', 'TransubQuickExtrasUi', 'createQuickExtrasUi'],
                    ['TransubBilingualTaskUi', 'TransubBilingualTaskUi', 'createBilingualTaskUi'],
                    ['TransubTwaiModelSelectUi', 'TransubTwaiModelSelectUi', 'createTwaiModelSelectUi'],
                    ['TransubCliCommandUi', 'TransubCliCommandUi', 'createCliCommandUi'],
                    ['TransubStartReadinessUi', 'TransubStartReadinessUi', 'createStartReadinessUi'],
                    ['TransubAppInit', 'TransubAppInit', 'createAppInit'],
                    ['TransubLiveBatchRehydrate', 'TransubLiveBatchRehydrate', 'createLiveBatchRehydrate'],
                    ['TransubAppWireUtils', 'TransubAppWireUtils', 'getBindApi'],
                    ['TransubAppWireChromeShell', 'TransubAppWireChromeShell', 'install'],
                    ['TransubAppWireChromeEntitlement', 'TransubAppWireChromeEntitlement', 'install'],
                    ['TransubAppWireChromeTranslate', 'TransubAppWireChromeTranslate', 'install'],
                    ['TransubAppWireChromeToolbar', 'TransubAppWireChromeToolbar', 'install'],
                    ['TransubAppWireChromeSession', 'TransubAppWireChromeSession', 'install'],
                    ['TransubAppWireChromeIntake', 'TransubAppWireChromeIntake', 'install'],
                    ['TransubAppWireChromeShelf', 'TransubAppWireChromeShelf', 'install'],
                    ['TransubAppWireChrome', 'TransubAppWireChrome', 'install'],
                    ['TransubAppWireFactoryUi', 'TransubAppWireFactoryUi', 'install'],
                    ['TransubAppWireSettings', 'TransubAppWireSettings', 'install'],
                    ['TransubAppWireEngineModels', 'TransubAppWireEngineModels', 'install'],
                    ['TransubAppWireBatch', 'TransubAppWireBatch', 'install'],
                    ['TransubAppWireBoot', 'TransubAppWireBoot', 'install'],
                ];
                for (const [label, gname, prop] of names) {
                    const mod = global && global[gname];
                    checks.push([label, !!(mod && mod[prop])]);
                }
            }
            const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
            if (!missing.length) return;
            const msg = `界面核心未加载：${missing.join('、')}（请重启或重装）`;
            console.warn('[Transub]', msg);
            const standaloneChrome = typeof h.getIsStandaloneChrome === 'function'
                ? !!h.getIsStandaloneChrome()
                : !!h.isStandaloneChrome;
            if (!standaloneChrome && typeof h.appendLog === 'function') h.appendLog(msg, 'err');
        };

        h.computeStartBlockReason = function computeStartBlockReason() {
            if (startReadinessApi.computeStartBlockReason) {
                return startReadinessApi.computeStartBlockReason({
                    running: !!h.state?.running,
                    postBatchBusy: !!h.state?.postBatchBusy,
                    retranslateBusy: !!h.state?.retranslateBusy,
                    batchStartInFlight: !!h.state?.batchStartInFlight,
                    computeBusy: !!h.state?.computeBusy,
                    computeBusyLabel: h.state?.computeBusyLabel,
                    items: h.state?.items,
                });
            }
            return '界面核心未加载，请重启应用';
        };

        h.syncComputeBusyFromMain = async function syncComputeBusyFromMain(opts = {}) {
            if (!h.electron?.transubComputeTaskStatus) return h.state?.computeBusy;
            try {
                const payload = {};
                const explicitUrl = String(opts.engineUrl || '').trim();
                if (explicitUrl) payload.engineUrl = explicitUrl;
                else {
                    const formUrl = String(h.els?.engineUrlInput?.value || '').trim();
                    if (formUrl) payload.engineUrl = formUrl;
                }
                const st = await h.electron.transubComputeTaskStatus(payload);
                const busy = !!st?.busy;
                h.state.computeBusy = busy;
                h.state.computeBusyLabel = busy ? String(st.label || st.kind || '').trim() : '';
                h.state.computeBusySince = busy ? Number(st.since) || h.state.computeBusySince || Date.now() : 0;
                h.state.computeBusyOwner = busy ? String(st.owner || '').trim() : '';
                h.state.computeBusyKind = busy ? String(st.kind || '').trim() : '';
                h.state.engineBatchRunning = !!st?.batchRunning;
                late(h, 'updateComputeBusyStrip')();
                return busy;
            } catch {
                return h.state?.computeBusy;
            }
        };

        return h;
    }

    return { install };
}));
