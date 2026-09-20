/**
 * Engine models cache + download-progress shell UI.
 * Pure cache helpers live in TransubEngineModelsCache; inject via deps.engineModelsCacheApi.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubEngineModelsCacheShell = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function engineModelsCacheShellFactory(global) {
    /**
     * @param {object} deps shell adapters
     */
    function createEngineModelsCacheShell(deps) {
        const d = deps || {};
        const els = d.els || {};
        const state = d.state || {};
        const electron = d.electron || null;
        const engineModelsCacheApi = d.engineModelsCacheApi
            || (global && global.TransubEngineModelsCache)
            || {};
        const engineModelsUi = d.engineModelsUi || {};
        const engineDlFmt = d.engineDlFmt
            || (global && global.TransubEngineDownloadFormat)
            || {};

        const getEngineModelsBrowseOnly = d.getEngineModelsBrowseOnly || (() => false);
        const setEngineModelsBrowseOnlyFlag = d.setEngineModelsBrowseOnlyFlag
            || d.setEngineModelsBrowseOnly
            || (() => {});
        const getEngineModelsBusy = d.getEngineModelsBusy || (() => false);
        const setEngineModelsBusy = d.setEngineModelsBusy || (() => {});
        const getEngineModelsBusyKind = d.getEngineModelsBusyKind || (() => null);
        const setEngineModelsBusyKind = d.setEngineModelsBusyKind || (() => {});
        const getCachedEngineModels = d.getCachedEngineModels || (() => []);
        const setCachedEngineModels = d.setCachedEngineModels || (() => {});
        const getCachedEnginePickCatalog = d.getCachedEnginePickCatalog || (() => []);
        const setCachedEnginePickCatalog = d.setCachedEnginePickCatalog || (() => {});
        const getCachedDemucsProbe = d.getCachedDemucsProbe || (() => null);
        const setCachedDemucsProbe = d.setCachedDemucsProbe || (() => {});
        const setCachedManagedLabModels = d.setCachedManagedLabModels || (() => {});
        const setEngineDownloadActiveSource = d.setEngineDownloadActiveSource || (() => {});
        const getCachedSmartTranslatePick = d.getCachedSmartTranslatePick || (() => null);
        const setCachedSmartTranslatePick = d.setCachedSmartTranslatePick || (() => {});

        const isEngineModelsLibraryOpen = d.isEngineModelsLibraryOpen || (() => false);
        const renderEngineModelsCards = d.renderEngineModelsCards || (() => {});
        const renderEngineModelsList = d.renderEngineModelsList || (() => {});
        const normalizeEnginePickCatalog = d.normalizeEnginePickCatalog || ((models) => models || []);
        const fillEngineModelSelect = d.fillEngineModelSelect || (() => {});
        const syncEngineModelsLibraryTabSummary = d.syncEngineModelsLibraryTabSummary || (() => {});
        const syncEngineModelsLibraryDlStrip = d.syncEngineModelsLibraryDlStrip || (() => {});
        const syncExpertQuickModelSelects = d.syncExpertQuickModelSelects || (() => {});
        const readOpusMtModelFromForm = d.readOpusMtModelFromForm || (() => '');
        const readLlmMtModelFromForm = d.readLlmMtModelFromForm || (() => '');
        const buildIntlAwareLlmMtFilter = d.buildIntlAwareLlmMtFilter || (() => null);
        const buildIntlAwareLlmMtDisableReason = d.buildIntlAwareLlmMtDisableReason || (() => null);
        const isLlmInferencePickModelId = d.isLlmInferencePickModelId || (() => false);
        const readEngineBackendFromForm = d.readEngineBackendFromForm || (() => '');
        const refreshEngineModels = d.refreshEngineModels || (async () => {});
        const getIsStandaloneSettings = d.getIsStandaloneSettings || (() => false);
        const ensureLogExpanded = d.ensureLogExpanded || (() => {});
        const scrollMainLogPanel = d.scrollMainLogPanel || (() => {});
        const updateFactoryStatusLogFromHost = d.updateFactoryStatusLogFromHost || (() => {});
        const LOG_DOM_MAX = Number(d.LOG_DOM_MAX) > 0 ? Number(d.LOG_DOM_MAX) : 100;

        const engineDownloadLogLines = [];
        let engineModelsCacheMeta = { savedAt: 0, fromDisk: false };
        let engineModelsCachePersistTimer = null;
        let engineModelsCacheLoadPromise = null;
        let cachedManagedCatalogSnapshot = [];
        let lastAppEngineDlProgressText = '';
        let lastAppEngineDlProgressAt = 0;

        function hasEngineModelsCacheInMemory() {
            return !!(getCachedEnginePickCatalog().length || getCachedEngineModels().length);
        }

        function getEngineModelsCacheMeta() {
            return {
                savedAt: Number(engineModelsCacheMeta.savedAt) || 0,
                fromDisk: !!engineModelsCacheMeta.fromDisk,
            };
        }

        function getCachedManagedCatalogSnapshot() {
            return cachedManagedCatalogSnapshot.slice();
        }

        function setCachedManagedCatalogSnapshot(rows) {
            cachedManagedCatalogSnapshot = Array.isArray(rows)
                ? rows.filter((m) => m && m.id)
                : [];
        }

        function syncEngineModelsCacheBanner() {
            const banner = els.engineModelsCacheBanner;
            if (!banner) return;
            const view = engineModelsCacheApi.buildModelsCacheBannerView
                ? engineModelsCacheApi.buildModelsCacheBannerView({
                    browseOnly: getEngineModelsBrowseOnly(),
                    hasCache: hasEngineModelsCacheInMemory(),
                    savedAt: engineModelsCacheMeta.savedAt,
                    fromDisk: !!engineModelsCacheMeta.fromDisk,
                })
                : { visible: false, text: '', tone: 'info' };
            banner.classList.toggle('hidden', !view.visible);
            banner.classList.toggle('is-info', view.tone === 'info');
            banner.classList.toggle('is-warn', view.tone === 'warn');
            banner.textContent = view.text || '';
        }

        function setEngineModelsBrowseOnly(on) {
            setEngineModelsBrowseOnlyFlag(!!on);
            if (els.engineRefreshModelsBtn) {
                els.engineRefreshModelsBtn.disabled = !!getEngineModelsBusy() || !!on;
                els.engineRefreshModelsBtn.title = on
                    ? '任务进行中，暂不可刷新'
                    : '刷新状态';
            }
            syncEngineModelsCacheBanner();
            if (getCachedEnginePickCatalog().length) renderEngineModelsCards();
        }

        async function resolveEngineModelsBrowseOnly() {
            let batchRunning = !!state.engineBatchRunning;
            try {
                const formUrl = String(els.engineUrlInput?.value || '').trim();
                const st = await electron?.transubComputeTaskStatus?.(
                    formUrl ? { engineUrl: formUrl } : {},
                );
                const kind = String(st?.kind || '').trim();
                const busy = !!st?.busy;
                batchRunning = !!st?.batchRunning;
                state.engineBatchRunning = batchRunning;
                state.computeBusy = busy;
                state.computeBusyLabel = busy ? String(st.label || st.kind || '').trim() : '';
                state.computeBusySince = busy
                    ? Number(st.since) || state.computeBusySince || Date.now()
                    : 0;
                state.computeBusyOwner = busy ? String(st.owner || '').trim() : '';
                state.computeBusyKind = busy ? kind : '';
            } catch (_) { /* keep local flags */ }

            // Missed job-finished IPC can leave running/retranslate stuck while engine is idle.
            if (!state.computeBusy && !batchRunning
                && (state.running || state.retranslateBusy || state.postBatchBusy)) {
                state.running = false;
                state.retranslateBusy = false;
                state.postBatchBusy = false;
                state.batchStartInFlight = false;
            }

            return !!(engineModelsCacheApi.shouldBrowseModelsFromCacheOnly
                ? engineModelsCacheApi.shouldBrowseModelsFromCacheOnly({
                    running: state.running,
                    retranslateBusy: state.retranslateBusy,
                    batchRunning,
                })
                : (state.running || state.retranslateBusy || batchRunning));
        }

        function applyEngineModelsCacheSnapshot(cache, { fromDisk = false } = {}) {
            const normalized = engineModelsCacheApi.normalizeLoadedCache
                ? engineModelsCacheApi.normalizeLoadedCache(cache)
                : {
                    ok: !!(cache?.models?.length || cache?.pickCatalog?.length),
                    empty: !(cache?.models?.length || cache?.pickCatalog?.length),
                    models: Array.isArray(cache?.models) ? cache.models : [],
                    pickCatalog: Array.isArray(cache?.pickCatalog) ? cache.pickCatalog : [],
                    managedCatalog: Array.isArray(cache?.managedCatalog) ? cache.managedCatalog : [],
                    demucsProbe: cache?.demucsProbe || null,
                    savedAt: Number(cache?.savedAt) || 0,
                };
            if (normalized.empty) return false;
            if (normalized.models.length) setCachedEngineModels(normalized.models);
            if (normalized.demucsProbe) setCachedDemucsProbe(normalized.demucsProbe);
            if (normalized.managedCatalog.length) {
                setCachedManagedCatalogSnapshot(normalized.managedCatalog);
                try {
                    setCachedManagedLabModels(normalized.managedCatalog
                        .filter((m) => m?.experimental || m?.lab || String(m?.family || '') === 'lab')
                        .map((m) => ({
                            id: m.id,
                            name: m.name,
                            fileName: m.fileName,
                            ggufUrl: m.ggufUrl || '',
                            family: 'lab',
                            familyLabel: m.familyLabel || '实验',
                            sizeHint: m.sizeHint || '',
                            sizeBytes: m.sizeBytes || 0,
                            ramHint: m.ramHint || '',
                            note: m.note || '',
                            paramBillion: Number(m.paramBillion) || 0,
                            experimental: true,
                            lab: true,
                            freePipelineTranslate: !!m.freePipelineTranslate,
                            translateOnly: !!m.translateOnly,
                        }))
                        .filter((m) => m.id && m.fileName));
                } catch (_) { /* lab cache optional */ }
                // Seed smart-translate pick from disk so translate menu paints before IPC.
                try {
                    const existing = getCachedSmartTranslatePick?.() || null;
                    if (!existing?.catalog?.length) {
                        setCachedSmartTranslatePick({
                            catalog: normalized.managedCatalog.slice(),
                            smartTranslateModelId: String(existing?.smartTranslateModelId || '').trim(),
                            smartTranslateResolvedId: String(existing?.smartTranslateResolvedId || '').trim(),
                            llmSource: String(existing?.llmSource || 'managed').trim(),
                            byokModel: String(existing?.byokModel || '').trim(),
                            byokBaseUrl: String(existing?.byokBaseUrl || '').trim(),
                            transubStationEnabled: !!existing?.transubStationEnabled,
                            transubStationUrl: String(existing?.transubStationUrl || '').trim(),
                            transubStationModel: String(existing?.transubStationModel || '').trim(),
                            fromDiskCache: true,
                        });
                    }
                } catch (_) { /* smart pick seed optional */ }
            }
            engineModelsCacheMeta = {
                savedAt: normalized.savedAt || engineModelsCacheMeta.savedAt || Date.now(),
                fromDisk: !!fromDisk,
            };
            if (normalized.pickCatalog.length) {
                setCachedEnginePickCatalog(normalized.pickCatalog.slice());
                // Avoid painting the full models grid during cold start (main-thread jank).
                if (isEngineModelsLibraryOpen()) renderEngineModelsCards();
            } else {
                setCachedEnginePickCatalog(normalizeEnginePickCatalog(normalized.models));
                if (isEngineModelsLibraryOpen()) {
                    renderEngineModelsList(normalized.models, normalized.managedCatalog);
                }
            }
            try {
                const models = getCachedEngineModels();
                const prevAsr = els.engineAsrModelSelect?.value || '';
                const prevMt = readOpusMtModelFromForm();
                const prevLlm = readLlmMtModelFromForm();
                const prevVad = els.engineVadModelSelect?.value || '';
                fillEngineModelSelect(els.engineAsrModelSelect, models, 'asr', prevAsr);
                fillEngineModelSelect(els.engineMtModelSelect, models, 'mt', prevMt, {
                    allowEmpty: true,
                    emptyLabel: '自动匹配（按源语言 · Opus）',
                    modelFilter: (m) => !isLlmInferencePickModelId(m.id)
                        && !global.TransubSakuraMtCatalog?.isNonTranslateEngineModelId?.(m.id),
                });
                fillEngineModelSelect(els.engineLlmMtModelSelect, models, 'mt', prevLlm, {
                    allowEmpty: true,
                    emptyLabel: '自动匹配（按语言 / Pro / 硬件）',
                    modelFilter: buildIntlAwareLlmMtFilter(),
                    modelDisableReason: typeof buildIntlAwareLlmMtDisableReason === 'function'
                        ? buildIntlAwareLlmMtDisableReason()
                        : undefined,
                });
                fillEngineModelSelect(els.engineVadModelSelect, models, 'vad', prevVad);
                try {
                    const hybridSync = (global && global.TransubHybridModelPickSync)
                        || (typeof globalThis !== 'undefined' ? globalThis.TransubHybridModelPickSync : null);
                    hybridSync?.syncMirrorFromPrimary?.({
                        primary: els.engineLlmMtModelSelect,
                        mirror: els.hybridSentenceMtModelSelect,
                    });
                } catch (_) { /* mirror optional during early boot */ }
                syncExpertQuickModelSelects();
            } catch (_) { /* selects optional during early boot */ }
            if (els.engineModelsSummary) {
                const age = engineModelsCacheApi.formatCacheAgeLabel
                    ? engineModelsCacheApi.formatCacheAgeLabel(engineModelsCacheMeta.savedAt)
                    : '';
                els.engineModelsSummary.textContent = age
                    ? `缓存列表 · ${age}`
                    : '缓存列表';
            }
            syncEngineModelsLibraryTabSummary();
            syncEngineModelsCacheBanner();
            return true;
        }

        async function loadEngineModelsCacheFromDisk({ apply = true } = {}) {
            if (!electron?.transubEngineModelsCacheLoad) {
                return { ok: false, empty: true };
            }
            if (!engineModelsCacheLoadPromise) {
                engineModelsCacheLoadPromise = (async () => {
                    try {
                        return await electron.transubEngineModelsCacheLoad();
                    } catch (err) {
                        return { ok: false, error: err?.message || String(err), cache: null };
                    } finally {
                        // Allow later reloads after first attempt settles.
                        setTimeout(() => { engineModelsCacheLoadPromise = null; }, 0);
                    }
                })();
            }
            const res = await engineModelsCacheLoadPromise;
            if (apply && res?.ok && res.cache) {
                applyEngineModelsCacheSnapshot(res.cache, { fromDisk: true });
            }
            return res || { ok: false, empty: true };
        }

        function schedulePersistEngineModelsCache() {
            if (!electron?.transubEngineModelsCacheSave) return;
            if (engineModelsCachePersistTimer) clearTimeout(engineModelsCachePersistTimer);
            engineModelsCachePersistTimer = setTimeout(() => {
                engineModelsCachePersistTimer = null;
                void persistEngineModelsCacheNow();
            }, 400);
        }

        async function persistEngineModelsCacheNow() {
            if (!electron?.transubEngineModelsCacheSave) return { ok: false };
            const snapshot = engineModelsCacheApi.buildPersistableSnapshot
                ? engineModelsCacheApi.buildPersistableSnapshot({
                    models: getCachedEngineModels(),
                    pickCatalog: getCachedEnginePickCatalog(),
                    managedCatalog: cachedManagedCatalogSnapshot,
                    demucsProbe: getCachedDemucsProbe(),
                    savedAt: Date.now(),
                })
                : {
                    models: getCachedEngineModels(),
                    pickCatalog: getCachedEnginePickCatalog(),
                    managedCatalog: cachedManagedCatalogSnapshot,
                    demucsProbe: getCachedDemucsProbe(),
                    savedAt: Date.now(),
                };
            if (!snapshot) return { ok: false, error: 'empty' };
            try {
                const res = await electron.transubEngineModelsCacheSave(snapshot);
                if (res?.ok) {
                    engineModelsCacheMeta = {
                        savedAt: Number(res.savedAt) || snapshot.savedAt,
                        // Keep live-vs-disk origin: only disk apply sets fromDisk true.
                        fromDisk: !!engineModelsCacheMeta.fromDisk,
                    };
                    syncEngineModelsCacheBanner();
                }
                return res || { ok: false };
            } catch (err) {
                return { ok: false, error: err?.message || String(err) };
            }
        }

        async function ensureEngineModelsCacheApplied() {
            if (hasEngineModelsCacheInMemory()) {
                if (els.engineModelsList && !els.engineModelsList.childElementCount
                    && getCachedEnginePickCatalog().length) {
                    renderEngineModelsCards();
                }
                return true;
            }
            const res = await loadEngineModelsCacheFromDisk({ apply: true });
            return !!(res?.ok && res.cache && hasEngineModelsCacheInMemory());
        }

        /**
         * Cache-first catalog access: memory → disk → live only on miss / force / missing ids.
         * @param {{
         *   force?: boolean,
         *   silent?: boolean,
         *   requiredModelIds?: string[],
         * }} [opts]
         */
        async function ensureEngineModelsCatalog({
            force = false,
            silent = true,
            requiredModelIds = [],
        } = {}) {
            if (!force) {
                await ensureEngineModelsCacheApplied();
            }
            const hasCache = hasEngineModelsCacheInMemory();
            const live = engineModelsCacheApi.shouldLiveRefreshEngineModelsCatalog
                ? engineModelsCacheApi.shouldLiveRefreshEngineModelsCatalog({
                    force,
                    hasCache,
                    requiredModelIds,
                    models: getCachedEngineModels(),
                    pickCatalog: getCachedEnginePickCatalog(),
                })
                : (!!force || !hasCache);
            if (!live) {
                if (isEngineModelsLibraryOpen() && getCachedEnginePickCatalog().length) {
                    renderEngineModelsCards();
                }
                syncEngineModelsCacheBanner();
                syncEngineModelsLibraryTabSummary();
                return {
                    ok: true,
                    fromCache: true,
                    deferred: false,
                    models: getCachedEngineModels(),
                };
            }
            const res = await refreshEngineModels({ silent });
            return {
                ...(res && typeof res === 'object' ? res : { ok: !!res }),
                fromCache: false,
            };
        }

        function explainEngineModelsMutateBlocked() {
            return '字幕任务进行中，请结束后再下载 / 删除 / 刷新模型';
        }

        async function syncEngineModelsBrowseOnlyFromTaskState() {
            const browseOnly = await resolveEngineModelsBrowseOnly();
            if (browseOnly === getEngineModelsBrowseOnly()) {
                if (browseOnly) syncEngineModelsCacheBanner();
                return;
            }
            if (browseOnly) {
                await ensureEngineModelsCacheApplied();
                setEngineModelsBrowseOnly(true);
                return;
            }
            setEngineModelsBrowseOnly(false);
            // Leaving browse-only: re-apply cache only (no auto live refresh).
            if (isEngineModelsLibraryOpen() && readEngineBackendFromForm() !== 'twai') {
                void ensureEngineModelsCatalog({ force: false, silent: true });
            }
        }

        function setEngineDownloadBusy(busy) {
            setEngineModelsBusy(!!busy);
            if (!busy) setEngineModelsBusyKind(null);
            if (els.engineManualGpuBtn) els.engineManualGpuBtn.disabled = !!busy;
            if (els.engineCancelDownloadBtn) {
                els.engineCancelDownloadBtn.disabled = !busy || getEngineModelsBusyKind() === 'delete';
            }
            if (els.engineRefreshModelsBtn) {
                els.engineRefreshModelsBtn.disabled = !!busy || getEngineModelsBrowseOnly();
            }
            if (els.engineModelsSearch) els.engineModelsSearch.disabled = !!busy;
            els.engineModelsFilters?.querySelectorAll('[data-models-filter]').forEach((btn) => {
                btn.disabled = !!busy;
            });
            els.engineModelsStatusFilters?.querySelectorAll('[data-models-status]').forEach((btn) => {
                btn.disabled = !!busy;
            });
            if (!busy) {
                setEngineDownloadActiveSource(null);
                renderEngineModelsCards();
                syncEngineModelsLibraryDlStrip();
                syncEngineModelsLibraryTabSummary();
            } else {
                els.engineModelsList?.querySelectorAll('[data-model-action]').forEach((btn) => {
                    btn.disabled = true;
                });
            }
        }

        function clearEngineDownloadLog() {
            engineDownloadLogLines.length = 0;
            if (els.engineDownloadLog) els.engineDownloadLog.textContent = '';
        }

        function resetAppEngineDlProgressLog() {
            lastAppEngineDlProgressText = '';
            lastAppEngineDlProgressAt = 0;
        }

        function markEngineModelsCacheFresh(savedAt = Date.now()) {
            engineModelsCacheMeta = {
                savedAt: Number(savedAt) || Date.now(),
                fromDisk: false,
            };
        }

        function appendEngineDownloadLog(line) {
            const text = String(line || '').trim();
            if (!text) return;
            if (engineModelsUi.pushDownloadLogLine) {
                engineModelsUi.pushDownloadLogLine(engineDownloadLogLines, text, 80);
            } else {
                engineDownloadLogLines.push(text);
                while (engineDownloadLogLines.length > 80) engineDownloadLogLines.shift();
            }
            if (els.engineDownloadLog) {
                els.engineDownloadLog.textContent = engineDownloadLogLines.join('\n');
                els.engineDownloadLog.scrollTop = els.engineDownloadLog.scrollHeight;
            }
        }

        function setEngineDownloadProgressPct(pct) {
            const clamped = engineModelsUi.clampDownloadProgressPct
                ? engineModelsUi.clampDownloadProgressPct(pct)
                : (() => {
                    const n = Number(pct);
                    const finite = Number.isFinite(n);
                    const width = finite ? Math.max(0, Math.min(100, n)) : 0;
                    return { width, finite, label: finite ? `${Math.round(width)}%` : '…' };
                })();
            if (els.engineDownloadProgressBar) {
                els.engineDownloadProgressBar.style.width = `${clamped.width}%`;
                els.engineDownloadProgressBar.classList.toggle('animate-pulse', !clamped.finite);
            }
            if (els.engineDownloadProgressPct) {
                els.engineDownloadProgressPct.textContent = clamped.label;
            }
            if (getEngineModelsBusy()) syncEngineModelsLibraryDlStrip();
        }

        function formatEngineDownloadBytes(n) {
            return engineDlFmt.formatEngineDownloadBytes
                ? engineDlFmt.formatEngineDownloadBytes(n)
                : '';
        }

        function formatEngineDownloadSpeed(bps) {
            return engineDlFmt.formatEngineDownloadSpeed
                ? engineDlFmt.formatEngineDownloadSpeed(bps)
                : '';
        }

        function formatEngineDownloadSizeLine(info = {}) {
            return engineDlFmt.formatEngineDownloadSizeLine
                ? engineDlFmt.formatEngineDownloadSizeLine(info)
                : '';
        }

        function appendAppEngineDownloadProgressLog(text, { force = false } = {}) {
            if (getIsStandaloneSettings() || !els.logHost) return;
            const line = String(text || '').trim();
            if (!line) return;
            ensureLogExpanded();
            const now = Date.now();
            const renderApi = global.TransubLogPanelRender;
            const renderer = renderApi?.getOrCreate?.(els.logHost, {
                maxLines: LOG_DOM_MAX,
                lineClass: 'log-line',
                onAfterFlush(h, meta) {
                    if (!meta?.live) return;
                    const panel = h.closest?.('.log-panel') || h;
                    scrollMainLogPanel(panel);
                },
            });
            const lastEntry = renderer?.getLastEntry?.() || null;
            const lastEl = !renderer ? els.logHost.lastElementChild : null;
            const canReuse = lastEntry?.meta?.engineDlProgress === '1'
                || lastEl?.dataset?.engineDlProgress === '1';
            const action = engineModelsUi.decideEngineDlProgressLogAction
                ? engineModelsUi.decideEngineDlProgressLogAction({
                    force,
                    line,
                    lastText: lastAppEngineDlProgressText,
                    canReuse,
                    now,
                    lastAt: lastAppEngineDlProgressAt,
                })
                : (() => {
                    if (!force && line === lastAppEngineDlProgressText && canReuse) return 'skip';
                    if (!force && !canReuse && now - lastAppEngineDlProgressAt < 1200) return 'skip';
                    if (!force && canReuse && now - lastAppEngineDlProgressAt < 400) return 'reuse';
                    if (canReuse && !force) return 'reuse';
                    return 'append';
                })();
            if (action === 'skip') return;
            const ts = new Date().toLocaleTimeString();
            const textLine = `[${ts}] ${line}`;
            if (action === 'reuse' && (lastEntry || lastEl)) {
                if (renderer) {
                    renderer.replaceLast(textLine, {
                        className: 'log-line text-gray-600',
                        meta: { engineDlProgress: '1' },
                    });
                } else if (lastEl) {
                    lastEl.textContent = textLine;
                }
                lastAppEngineDlProgressText = line;
                if (!(canReuse && !force && now - lastAppEngineDlProgressAt < 400)) {
                    lastAppEngineDlProgressAt = now;
                    if (!renderer) {
                        const panel = els.logHost.closest('.log-panel') || els.logHost;
                        scrollMainLogPanel(panel);
                    }
                }
                updateFactoryStatusLogFromHost();
                return;
            }
            lastAppEngineDlProgressText = line;
            lastAppEngineDlProgressAt = now;
            if (renderer) {
                renderer.append(textLine, {
                    className: 'log-line text-gray-600',
                    meta: { engineDlProgress: '1' },
                });
                updateFactoryStatusLogFromHost();
                return;
            }
            if (els.logHost.textContent === '日志将显示在此处…' || els.logHost.querySelector('.text-gray-400')) {
                els.logHost.innerHTML = '';
            }
            const row = document.createElement('div');
            row.className = 'log-line text-gray-600';
            row.dataset.engineDlProgress = '1';
            row.textContent = textLine;
            els.logHost.appendChild(row);
            while (els.logHost.childElementCount > LOG_DOM_MAX) {
                els.logHost.removeChild(els.logHost.firstChild);
            }
            const panel = els.logHost.closest('.log-panel') || els.logHost;
            scrollMainLogPanel(panel);
            updateFactoryStatusLogFromHost();
        }

        function setEngineDownloadDrawerOpen(open) {
            const drawer = els.engineDownloadDrawer;
            const toggle = els.engineDownloadDrawerToggle;
            if (drawer) drawer.classList.toggle('hidden', !open);
            if (toggle) {
                toggle.classList.toggle('is-open', !!open);
                toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            }
        }

        function setEngineDownloadProgressVisible(visible, detail = '') {
            els.engineDownloadProgress?.classList.toggle('hidden', !visible);
            if (!visible) {
                setEngineDownloadDrawerOpen(false);
            }
            if (els.engineDownloadProgressText) {
                els.engineDownloadProgressText.textContent = detail
                    || (visible ? '正在下载模型，可能需要数分钟…' : '');
            }
            if (visible && engineDownloadLogLines.length === 0 && detail) {
                appendEngineDownloadLog(detail);
            }
            syncEngineModelsLibraryDlStrip(detail);
        }

        return {
            hasEngineModelsCacheInMemory,
            getEngineModelsCacheMeta,
            getCachedManagedCatalogSnapshot,
            setCachedManagedCatalogSnapshot,
            syncEngineModelsCacheBanner,
            setEngineModelsBrowseOnly,
            resolveEngineModelsBrowseOnly,
            applyEngineModelsCacheSnapshot,
            loadEngineModelsCacheFromDisk,
            schedulePersistEngineModelsCache,
            persistEngineModelsCacheNow,
            ensureEngineModelsCacheApplied,
            ensureEngineModelsCatalog,
            explainEngineModelsMutateBlocked,
            syncEngineModelsBrowseOnlyFromTaskState,
            setEngineDownloadBusy,
            clearEngineDownloadLog,
            resetAppEngineDlProgressLog,
            markEngineModelsCacheFresh,
            appendEngineDownloadLog,
            setEngineDownloadProgressPct,
            formatEngineDownloadBytes,
            formatEngineDownloadSpeed,
            formatEngineDownloadSizeLine,
            appendAppEngineDownloadProgressLog,
            setEngineDownloadProgressVisible,
            setEngineDownloadDrawerOpen,
        };
    }

    return { createEngineModelsCacheShell };
}));
