/**
 * Engine models library panel UI: open/close, filters, cards, select fill, pick-catalog glue.
 * Orchestration (refresh/download/delete) stays in engine-models-workspace-core; inject via deps.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubEngineModelsLibraryUi = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function engineModelsLibraryUiFactory(global) {
    /**
     * @param {object} deps shell adapters
     */
    function createEngineModelsLibraryUi(deps) {
        const d = deps || {};
        const els = d.els || {};
        const state = d.state || {};
        const engineModelsUi = d.engineModelsUi || {};
        const esc = d.esc || ((s) => String(s == null ? '' : s));
        const uiTf = d.uiTf || ((s) => s);
        const navigatorRef = d.navigator || (typeof navigator !== 'undefined' ? navigator : { deviceMemory: 0 });

        const getIsStandaloneSettings = d.getIsStandaloneSettings || (() => false);
        const getAdvancedEntitled = typeof d.getAdvancedEntitled === 'function'
            ? d.getAdvancedEntitled
            : () => !!d.advancedEntitled;
        const getEngineModelsBusy = d.getEngineModelsBusy || (() => false);
        const getEngineModelsBusyKind = d.getEngineModelsBusyKind || (() => null);
        const getEngineModelsBrowseOnly = d.getEngineModelsBrowseOnly || (() => false);
        const getCachedEnginePickCatalog = d.getCachedEnginePickCatalog || (() => []);
        const setCachedEnginePickCatalog = d.setCachedEnginePickCatalog || (() => {});
        const setCachedManagedLabModels = d.setCachedManagedLabModels || (() => {});
        const getCachedDemucsProbe = d.getCachedDemucsProbe || (() => null);
        const ENGINE_DEMUCS_MODEL_ID = d.ENGINE_DEMUCS_MODEL_ID || d.demucsModelId || 'demucs';

        const setFactoryWorkspace = d.setFactoryWorkspace || (() => {});
        const openParamsModal = d.openParamsModal || (async () => {});
        const switchParamsTab = d.switchParamsTab || (() => {});
        const readEngineBackendFromForm = d.readEngineBackendFromForm || (() => '');
        const refreshEngineStatus = d.refreshEngineStatus || (async () => {});
        const ensureEngineModelsCatalog = d.ensureEngineModelsCatalog || (async () => ({ ok: false }));
        const resolveEngineModelsBrowseOnly = d.resolveEngineModelsBrowseOnly || (async () => false);
        const ensureEngineModelsCacheApplied = d.ensureEngineModelsCacheApplied || (async () => {});
        const setEngineModelsBrowseOnly = d.setEngineModelsBrowseOnly || (() => {});
        const hasEngineModelsCacheInMemory = d.hasEngineModelsCacheInMemory || (() => false);
        const syncEngineModelsCacheBanner = d.syncEngineModelsCacheBanner || (() => {});
        const clearStaleComputeBusyIfNeeded = d.clearStaleComputeBusyIfNeeded
            || (async () => ({ cleared: false }));
        const syncComputeBusyFromMain = d.syncComputeBusyFromMain || (async () => false);
        const appendLog = d.appendLog || (() => {});
        const showToast = d.showToast || (() => {});
        const isSakuraMtModelId = d.isSakuraMtModelId || (() => false);
        const findManagedLlmCatalogEntry = d.findManagedLlmCatalogEntry || (() => null);
        const getManagedLlmCatalogApi = d.getManagedLlmCatalogApi || (() => null);
        const isManagedLlmDownloadId = d.isManagedLlmDownloadId || (() => false);
        const canManualEngineHubDownload = d.canManualEngineHubDownload || (() => false);
        const explainEngineModelsMutateBlocked = d.explainEngineModelsMutateBlocked || (() => '');
        const markEngineModelsRefreshed = d.markEngineModelsRefreshed || (() => {});
        const documentRef = d.document || (typeof document !== 'undefined' ? document : null);
        const getHardwareBudget = typeof d.getHardwareBudget === 'function'
            ? d.getHardwareBudget
            : () => {
                try {
                    const n = Number(navigatorRef.deviceMemory);
                    return {
                        systemMemoryGb: Number.isFinite(n) && n > 0 ? n : 0,
                        vramGb: 0,
                    };
                } catch (_) {
                    return { systemMemoryGb: 0, vramGb: 0 };
                }
            };

        let engineModelsFilter = 'all';
        let engineModelsStatusFilter = 'all';
        let engineModelsSearchQuery = '';

        function getEngineModelsFilter() { return engineModelsFilter; }
        function getEngineModelsStatusFilter() { return engineModelsStatusFilter; }
        function getEngineModelsSearchQuery() { return engineModelsSearchQuery; }
        function setEngineModelsSearchQuery(next) {
            engineModelsSearchQuery = String(next || '');
        }

function engineModelsLibraryBusyHint() {
    return getEngineModelsBusyKind() === 'delete' ? '删除进行中' : '下载进行中';
}

function setEngineModelsLoadingVisible(visible) {
    const el = els.engineModelsLoading;
    if (!el) return;
    el.classList.toggle('hidden', !visible);
    el.setAttribute('aria-busy', visible ? 'true' : 'false');
}

function isEngineModelsLibraryOpen() {
    if (getIsStandaloneSettings()) {
        return !!els.engineModelsLibraryModal && !els.engineModelsLibraryModal.classList.contains('hidden');
    }
    return state.factoryWorkspace === 'models';
}

function mountEngineModelsPanel(target) {
    const panel = els.engineModelsPanel;
    if (!panel) return;
    const host = target === 'modal'
        ? els.engineModelsLibraryModalHost
        : els.engineModelsPanelHost;
    if (!host) return;
    if (panel.parentElement !== host) host.appendChild(panel);
}

function syncEngineModelsLibraryDlStrip(detail = '') {
    const strip = els.engineModelsLibraryDlStrip;
    const textEl = els.engineModelsLibraryDlStripText;
    if (!strip) return;
    const show = !!getEngineModelsBusy() && !isEngineModelsLibraryOpen();
    strip.classList.toggle('hidden', !show);
    if (!show || !textEl) return;
    const pct = String(els.engineDownloadProgressPct?.textContent || '').trim();
    const fallback = getEngineModelsBusyKind() === 'delete' ? '正在删除模型…' : '正在下载模型…';
    const msg = String(detail || els.engineDownloadProgressText?.textContent || '').trim()
        || fallback;
    textEl.textContent = pct && pct !== '0%' && pct !== '…'
        ? `${msg}（${pct}）· 可再次打开模型库查看详情`
        : `${msg} · 可再次打开模型库查看详情`;
}

function syncEngineModelsLibraryTabSummary() {
    if (!els.engineModelsLibraryTabSummary) return;
    const total = getCachedEnginePickCatalog().length;
    if (!total) {
        els.engineModelsLibraryTabSummary.textContent = getEngineModelsBusy()
            ? (getEngineModelsBusyKind() === 'delete'
                ? '正在删除模型…'
                : '正在下载模型…可打开模型库查看进度')
            : '打开模型库可查看本机已装与可下载项';
        return;
    }
    const installed = getCachedEnginePickCatalog().filter((m) => m?.installed && !m?.incomplete).length;
    const base = installed
        ? uiTf('已安装 {installed} / 共 {total} 个模型', { installed, total })
        : uiTf('共 {total} 个模型（尚未标记已安装）', { total });
    els.engineModelsLibraryTabSummary.textContent = getEngineModelsBusy()
        ? uiTf('{base} · {hint}', { base, hint: engineModelsLibraryBusyHint() })
        : uiTf('{base} · 点「打开模型库」浏览下载', { base });
}

async function openEngineModelsLibrary(opts = {}) {
    // Opt-in live refresh only (`refresh: true`). Default is cache-first.
    const forceRefresh = opts.refresh === true || opts.forceRefresh === true;

    if (!getIsStandaloneSettings()) {
        setFactoryWorkspace('models', { refresh: forceRefresh });
        return;
    }

    const modal = els.engineModelsLibraryModal;
    if (!modal) return;
    mountEngineModelsPanel('modal');
    // Ensure settings shell is visible when opening from main recovery paths.
    if (els.paramsModal?.classList.contains('hidden')) {
        await openParamsModal('install');
    } else {
        switchParamsTab('install');
    }
    modal.classList.remove('hidden');
    syncEngineModelsLibraryDlStrip();
    if (readEngineBackendFromForm() !== 'twai') {
        setEngineModelsLoadingVisible(true);
        markEngineModelsRefreshed();
        try {
            await ensureEngineModelsCatalog({
                force: forceRefresh,
                silent: !forceRefresh,
            });
        } finally {
            setEngineModelsLoadingVisible(false);
        }
    } else {
        setEngineModelsLoadingVisible(false);
        syncEngineModelsLibraryTabSummary();
        syncEngineModelPickSummary();
    }
    try { els.engineModelsSearch?.focus?.(); } catch (_) { /* ignore */ }
}

function closeEngineModelsLibrary() {
    if (!getIsStandaloneSettings()) {
        // Main window uses the models workspace; do not leave it when settings closes.
        return;
    }
    els.engineModelsLibraryModal?.classList.add('hidden');
    mountEngineModelsPanel('workspace');
    syncEngineModelsLibraryDlStrip();
    syncEngineModelsLibraryTabSummary();
}

async function onFactoryModelsWorkspaceShow(opts = {}) {
    mountEngineModelsPanel('workspace');
    syncEngineModelsLibraryDlStrip();
    // Opt-in live refresh only (`refresh: true`). Default is cache-first.
    const forceRefresh = opts.refresh === true || opts.forceRefresh === true;
    if (readEngineBackendFromForm() !== 'twai') {
        // Drop orphaned compute locks / stuck UI flags before deciding browse-only.
        // Always pin a probe URL (form or default) so engine-side leftovers are visible
        // even before ensureEngineRunning has run in this session.
        try {
            const formUrl = String(els.engineUrlInput?.value || '').trim();
            const probeUrl = formUrl || 'http://127.0.0.1:8765';
            const cleared = await clearStaleComputeBusyIfNeeded({ engineUrl: probeUrl });
            if (cleared?.cleared) {
                const msg = cleared.before?.label
                    ? uiTf('已清除卡住的算力锁（{label}）', { label: cleared.before.label })
                    : '已清除卡住的算力锁';
                appendLog(msg, 'warn');
                showToast(msg, 'warn');
            } else {
                await syncComputeBusyFromMain({ engineUrl: probeUrl });
            }
        } catch (_) { /* ignore */ }
        const browseOnly = await resolveEngineModelsBrowseOnly();
        if (browseOnly) {
            setEngineModelsLoadingVisible(false);
            await ensureEngineModelsCacheApplied();
            setEngineModelsBrowseOnly(true);
            if (els.engineModelsSummary && !hasEngineModelsCacheInMemory()) {
                els.engineModelsSummary.textContent = '任务进行中，暂无缓存列表';
            }
            syncEngineModelsLibraryTabSummary();
            syncEngineModelPickSummary();
        } else {
            // Clear sticky browse-only from a prior task / orphaned lock before catalog ensure.
            setEngineModelsBrowseOnly(false);
            setEngineModelsLoadingVisible(true);
            markEngineModelsRefreshed();
            try {
                await ensureEngineModelsCatalog({
                    force: forceRefresh,
                    silent: !forceRefresh,
                });
            } finally {
                setEngineModelsLoadingVisible(false);
            }
        }
    } else {
        setEngineModelsLoadingVisible(false);
        syncEngineModelsLibraryTabSummary();
        syncEngineModelPickSummary();
        syncEngineModelsCacheBanner();
    }
    try { els.engineModelsSearch?.focus?.(); } catch (_) { /* ignore */ }
}

function onFactoryModelsWorkspaceHide() {
    syncEngineModelsLibraryDlStrip();
    syncEngineModelsLibraryTabSummary();
}

function filteredEnginePickItems() {
    if (engineModelsUi.filterAndSortEnginePickItems) {
        return engineModelsUi.filterAndSortEnginePickItems(getCachedEnginePickCatalog(), {
            group: engineModelsFilter,
            status: engineModelsStatusFilter,
            query: engineModelsSearchQuery,
        });
    }
    return getCachedEnginePickCatalog().slice();
}

function syncEngineModelPickSummary() {
    const total = getCachedEnginePickCatalog().length;
    const visible = filteredEnginePickItems().length;
    if (els.engineModelsSummary) {
        els.engineModelsSummary.textContent = engineModelsUi.formatModelsSummary
            ? engineModelsUi.formatModelsSummary({ total, visible })
            : (!total ? '检测引擎后显示' : (visible === total
                ? uiTf('共 {total} 个模型', { total })
                : uiTf('显示 {visible} / {total}', { visible, total })));
    }
    syncEngineModelsFilterCounts();
    syncEngineModelsLibraryTabSummary();
    if (els.engineModelsSelectedHint) {
        const llmCount = getCachedEnginePickCatalog().filter((m) => m.group === 'llm').length;
        const llmHint = llmCount
            ? (getAdvancedEntitled()
                ? uiTf('LLM 推理翻译 {n} 个（含 Pro）', { n: llmCount })
                : uiTf('LLM 推理翻译 {n} 个（轻量档；解锁 Pro 可浏览全部）', { n: llmCount }))
            : '';
        els.engineModelsSelectedHint.textContent = llmHint
            ? uiTf('点卡片「下载」获取模型 · {llmHint} · 选用请在「设置 → 运行环境」中指定', { llmHint })
            : '点卡片「下载」获取模型 · 选用请在「设置 → 运行环境」中指定';
        els.engineModelsSelectedHint.classList.remove('is-ok');
    }
}

function setEngineModelsFilter(next) {
    engineModelsFilter = engineModelsUi.normalizeModelsGroupFilter
        ? engineModelsUi.normalizeModelsGroupFilter(next)
        : (['all', 'asr', 'vad', 'llm', 'separate'].includes(String(next || ''))
            ? String(next)
            : 'all');
    els.engineModelsFilters?.querySelectorAll('[data-models-filter]').forEach((btn) => {
        const active = btn.getAttribute('data-models-filter') === engineModelsFilter;
        btn.classList.toggle('is-active', active);
        btn.classList.toggle('is-on', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    renderEngineModelsCards();
}

function setEngineModelsStatusFilter(next) {
    const want = String(next || 'all');
    // Toggle off when clicking the active status chip.
    const normalized = engineModelsUi.normalizeModelsStatusFilter
        ? engineModelsUi.normalizeModelsStatusFilter(want)
        : (['all', 'installed', 'available', 'recommended', 'incomplete', 'experimental'].includes(want) ? want : 'all');
    engineModelsStatusFilter = (normalized !== 'all' && normalized === engineModelsStatusFilter)
        ? 'all'
        : normalized;
    els.engineModelsStatusFilters?.querySelectorAll('[data-models-status]').forEach((btn) => {
        const active = btn.getAttribute('data-models-status') === engineModelsStatusFilter;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    renderEngineModelsCards();
}

function syncEngineModelsFilterCounts() {
    const counts = engineModelsUi.countModelsByFilter
        ? engineModelsUi.countModelsByFilter(getCachedEnginePickCatalog(), {
            group: engineModelsFilter,
            status: engineModelsStatusFilter,
        })
        : {
            all: 0, installed: 0, available: 0, recommended: 0, incomplete: 0, experimental: 0,
            asr: 0, vad: 0, llm: 0, separate: 0,
        };
    const map = {
        all: els.engineModelsTabAllCount,
        installed: els.engineModelsTabInstalledCount,
        available: els.engineModelsTabAvailableCount,
        recommended: els.engineModelsTabRecommendedCount,
        incomplete: els.engineModelsTabIncompleteCount,
        experimental: els.engineModelsTabExperimentalCount,
        asr: els.engineModelsTabAsrCount,
        vad: els.engineModelsTabVadCount,
        llm: els.engineModelsTabLlmCount,
        separate: els.engineModelsTabSeparateCount,
    };
    Object.keys(map).forEach((key) => {
        if (map[key]) map[key].textContent = String(counts[key] || 0);
    });
}

function engineModelKindLabel(kind) {
    return engineModelsUi.engineModelKindLabel
        ? engineModelsUi.engineModelKindLabel(kind)
        : String(kind || '').toUpperCase() || '模型';
}

function formatEngineModelOptionLabel(model) {
    return engineModelsUi.formatEngineModelOptionLabel
        ? engineModelsUi.formatEngineModelOptionLabel(model)
        : (String(model?.name || model?.id || '').trim() || 'unknown');
}

/** Ensure <select> can hold a saved id even before the catalog is loaded. */
function ensureSelectValue(selectEl, value, { label = '', allowEmpty = false } = {}) {
    if (!selectEl) return;
    const want = String(value || '');
    if (!want) {
        if (allowEmpty) selectEl.value = '';
        return;
    }
        if (![...selectEl.options].some((o) => o.value === want)) {
            const opt = (documentRef || document).createElement('option');
            opt.value = want;
            opt.textContent = label || want;
            selectEl.appendChild(opt);
        }
    selectEl.value = want;
}

function fillEngineModelSelect(selectEl, models, kind, selectedId, {
    allowEmpty = false,
    emptyLabel = '自动（按源语言）',
    modelFilter = null,
    modelDisableReason = null,
} = {}) {
    if (!selectEl) return;
    if (engineModelsUi.buildInstalledModelSelectOptionsHtml) {
        const built = engineModelsUi.buildInstalledModelSelectOptionsHtml({
            models,
            kind,
            selectedId,
            allowEmpty,
            emptyLabel,
            esc,
            formatLabel: formatEngineModelOptionLabel,
            modelFilter,
            modelDisableReason,
        });
        selectEl.innerHTML = built.html;
        const want = built.want;
        if (want && [...selectEl.options].some((o) => o.value === want && !o.disabled)) {
            selectEl.value = want;
        } else if (allowEmpty) {
            selectEl.value = '';
        } else if (selectEl.options.length) {
            const firstEnabled = [...selectEl.options].find((o) => !o.disabled && o.value);
            selectEl.value = firstEnabled ? firstEnabled.value : '';
        }
        return;
    }
    selectEl.innerHTML = '';
}

function pickCatalogDeps() {
    const catalogApi = getManagedLlmCatalogApi();
    return {
        demucsModelId: ENGINE_DEMUCS_MODEL_ID,
        isSakuraMtModelId,
        findManagedLlmCatalogEntry,
        isProScaleModel: (entry) => !!catalogApi?.isProScaleModel?.(entry),
        entitled: getAdvancedEntitled(),
        listCatalogVisible: catalogApi?.listCatalogVisible
            ? (opts) => catalogApi.listCatalogVisible(opts)
            : undefined,
    };
}

function normalizeEnginePickCatalog(models) {
    if (engineModelsUi.normalizeEnginePickCatalog) {
        return engineModelsUi.normalizeEnginePickCatalog(models, pickCatalogDeps());
    }
    return [];
}

function buildManagedLlmPickItems(statusCatalog = null) {
    if (engineModelsUi.buildManagedLlmPickItems) {
        return engineModelsUi.buildManagedLlmPickItems(statusCatalog, pickCatalogDeps());
    }
    return [];
}

function mergeManagedLlmIntoPickCatalog(engineItems, managedItems) {
    if (engineModelsUi.mergeManagedLlmIntoPickCatalog) {
        return engineModelsUi.mergeManagedLlmIntoPickCatalog(engineItems, managedItems);
    }
    return Array.isArray(engineItems) ? engineItems.slice() : [];
}

function buildDemucsPickItem(probe = getCachedDemucsProbe()) {
    if (engineModelsUi.buildDemucsPickItem) {
        return engineModelsUi.buildDemucsPickItem(probe, ENGINE_DEMUCS_MODEL_ID);
    }
    return { id: ENGINE_DEMUCS_MODEL_ID, name: 'Demucs', kind: 'demucs', group: 'separate' };
}

function mergeDemucsPickItem(items) {
    if (engineModelsUi.mergeDemucsPickItem) {
        return engineModelsUi.mergeDemucsPickItem(items, getCachedDemucsProbe(), ENGINE_DEMUCS_MODEL_ID);
    }
    const list = Array.isArray(items) ? items.slice() : [];
    list.push(buildDemucsPickItem());
    return list;
}

function engineModelGroupLabel(group) {
    if (engineModelsUi.engineModelGroupLabel) {
        return engineModelsUi.engineModelGroupLabel(group);
    }
    return engineModelKindLabel(group);
}

function renderEngineModelsList(models, managedStatusCatalog = null) {
    if (Array.isArray(managedStatusCatalog)) {
        setCachedManagedLabModels(managedStatusCatalog
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
    }
    const normalized = normalizeEnginePickCatalog(models);
    const managedItems = buildManagedLlmPickItems(managedStatusCatalog);
    const merged = mergeManagedLlmIntoPickCatalog(normalized, managedItems);
    const items = merged.length ? mergeDemucsPickItem(merged) : [];
    setCachedEnginePickCatalog(items);
    renderEngineModelsCards();
}

function renderEngineModelsCards() {
    const listEl = els.engineModelsList;
    if (!listEl) return;
    const items = filteredEnginePickItems();
    if (!getCachedEnginePickCatalog().length) {
        listEl.innerHTML = `
            <div class="factory-empty-state engine-model-empty-state">
                <div class="factory-empty-icon" aria-hidden="true"><i class="fa fa-cube"></i></div>
                <div>
                    <p class="text-sm font-medium">${getEngineModelsBrowseOnly() ? '暂无缓存模型目录' : '暂无模型目录'}</p>
                    <p class="text-xs mt-1 factory-empty-hint">${getEngineModelsBrowseOnly()
                        ? '任务进行中无法探测引擎；请结束后再刷新。'
                        : '请先在「运行环境」检测引擎，再点右上角刷新。'}</p>
                </div>
                ${getEngineModelsBrowseOnly() ? '' : `<div class="flex flex-wrap items-center justify-center gap-2">
                    <button type="button" class="factory-empty-primary" data-model-action="refresh-empty">
                        <i class="fa fa-refresh mr-1"></i>刷新状态
                    </button>
                </div>`}
            </div>`;
        syncEngineModelPickSummary();
        return;
    }
    if (!items.length) {
        listEl.innerHTML = `
            <div class="factory-empty-state engine-model-empty-state">
                <div class="factory-empty-icon" aria-hidden="true"><i class="fa fa-search"></i></div>
                <div>
                    <p class="text-sm font-medium">没有匹配的模型</p>
                    <p class="text-xs mt-1 factory-empty-hint">试试其它分类，或清空搜索关键词。</p>
                </div>
            </div>`;
        syncEngineModelPickSummary();
        return;
    }
    const hwBudget = (() => {
        try {
            const raw = getHardwareBudget() || {};
            const sys = Number(raw.systemMemoryGb);
            const vram = Number(raw.vramGb);
            const fromNav = (() => {
                try {
                    const n = Number(navigatorRef.deviceMemory);
                    return Number.isFinite(n) && n > 0 ? n : 0;
                } catch (_) {
                    return 0;
                }
            })();
            return {
                systemMemoryGb: (Number.isFinite(sys) && sys > 0 ? sys : fromNav) || 0,
                vramGb: Number.isFinite(vram) && vram > 0 ? vram : 0,
            };
        } catch (_) {
            return { systemMemoryGb: 0, vramGb: 0 };
        }
    })();
    listEl.innerHTML = items.map((item) => {
        const badges = [];
        const ramHint = String(item.ramHint || '').trim()
            || (engineModelsUi.resolvePickItemRamHint
                ? engineModelsUi.resolvePickItemRamHint(item)
                : '');
        const fit = engineModelsUi.classifyHardwareFit
            ? engineModelsUi.classifyHardwareFit({ ...item, ramHint }, hwBudget)
            : { level: 'unknown', label: '', badgeClass: '', cardClass: '' };
        if (item.recommended) badges.push('<span class="engine-model-badge is-rec">推荐</span>');
        if (item.id === 'whisperseg-asmr') badges.push('<span class="engine-model-badge is-rec">必装</span>');
        if (item.experimental || item.lab || item.source === 'lab') {
            badges.push('<span class="engine-model-badge is-lab">实验</span>');
        }
        if (item.translateOnly) badges.push('<span class="engine-model-badge is-warn">仅译中</span>');
        else if (item.freePipelineTranslate) badges.push('<span class="engine-model-badge is-ok">轻量</span>');
        if (item.proScale) badges.push('<span class="engine-model-badge is-use">Pro</span>');
        if (item.shipped && item.installed) badges.push('<span class="engine-model-badge is-ok">内置</span>');
        else if (item.installed) badges.push('<span class="engine-model-badge is-ok">已下载</span>');
        else if (item.incomplete) badges.push('<span class="engine-model-badge is-warn">不完整</span>');
        badges.push(`<span class="engine-model-badge">${esc(engineModelGroupLabel(item.group))}</span>`);
        if (item.familyLabel && item.group === 'llm') {
            badges.push(`<span class="engine-model-badge">${esc(item.familyLabel)}</span>`);
        }
        const fitBadge = (fit.label && fit.badgeClass)
            ? `<span class="engine-model-badge engine-model-fit-inline ${fit.badgeClass}" title="相对本机内存/显存：${esc(fit.label)}">${esc(fit.label)}</span>`
            : '';
        const subParts = [item.id, item.sizeHint];
        if (item.paramBillion) subParts.push(`${item.paramBillion}B`);
        const sub = subParts.filter(Boolean).join(' · ');
        const managedManual = item.source === 'managed'
            || item.source === 'sakura'
            || item.source === 'lab'
            || isManagedLlmDownloadId(item.id, item.source);
        const hubManual = !managedManual && canManualEngineHubDownload(item);
        const showDelete = engineModelsUi.canShowDeleteButtonForPickItem
            ? engineModelsUi.canShowDeleteButtonForPickItem(item, { demucsModelId: ENGINE_DEMUCS_MODEL_ID })
            : ((item.installed || item.incomplete) && !item.shipped && item.id !== ENGINE_DEMUCS_MODEL_ID);
        const mutateBlocked = getEngineModelsBusy() || getEngineModelsBrowseOnly();
        const mutateTitle = getEngineModelsBrowseOnly() ? explainEngineModelsMutateBlocked() : '';
        const cardFitClass = fit.cardClass ? ` ${fit.cardClass}` : '';
        return `
            <article class="engine-model-card${cardFitClass}" data-model-id="${esc(item.id)}" data-installed="${item.installed ? '1' : '0'}" data-source="${esc(item.source || 'engine')}" data-fit="${esc(fit.level || 'unknown')}">
                <div class="engine-model-card-top">
                    <div>
                        <div class="engine-model-card-title-row">
                            <div class="engine-model-card-title">${esc(item.name || item.id)}</div>
                            ${fitBadge}
                        </div>
                        <div class="engine-model-card-sub">${esc(sub)}</div>
                        ${ramHint ? `<div class="engine-model-card-ram">${esc(ramHint)}</div>` : ''}
                    </div>
                    <div class="engine-model-card-badges">${badges.join('')}</div>
                </div>
                ${item.note ? `<p class="engine-model-card-note">${esc(item.note)}</p>` : ''}
                <div class="engine-model-card-actions">
                    <div class="engine-model-card-actions-main">
                        <button type="button" class="btn btn-primary" data-model-action="download" data-model-id="${esc(item.id)}" ${mutateBlocked ? 'disabled' : ''} title="${esc(mutateTitle)}">
                            ${item.id === ENGINE_DEMUCS_MODEL_ID && item.incomplete
                                ? '补齐 CUDA PyTorch'
                                : (item.installed ? '重新下载' : '下载')}
                        </button>
                        ${managedManual
                            ? `<button type="button" class="btn" data-model-action="manual" data-model-id="${esc(item.id)}" ${getEngineModelsBusy() ? 'disabled' : ''} title="浏览器下载 GGUF 后放到指定目录">手动下载</button>`
                            : (hubManual
                                ? `<button type="button" class="btn" data-model-action="manual-hub" data-model-id="${esc(item.id)}" ${getEngineModelsBusy() ? 'disabled' : ''} title="浏览器打开仓库页，按说明放到引擎 models 目录">手动下载</button>`
                                : '')}
                    </div>
                    ${showDelete
                        ? `<button type="button" class="btn btn-danger" data-model-action="delete" data-model-id="${esc(item.id)}" ${mutateBlocked ? 'disabled' : ''} title="${esc(mutateTitle || '删除本机已下载文件')}">删除</button>`
                        : ''}
                </div>
            </article>`;
    }).join('');
    syncEngineModelPickSummary();
}

        return {
            setEngineModelsLoadingVisible,
            isEngineModelsLibraryOpen,
            mountEngineModelsPanel,
            syncEngineModelsLibraryDlStrip,
            syncEngineModelsLibraryTabSummary,
            openEngineModelsLibrary,
            closeEngineModelsLibrary,
            onFactoryModelsWorkspaceShow,
            onFactoryModelsWorkspaceHide,
            filteredEnginePickItems,
            syncEngineModelPickSummary,
            setEngineModelsFilter,
            setEngineModelsStatusFilter,
            setEngineModelsSearchQuery,
            getEngineModelsFilter,
            getEngineModelsStatusFilter,
            getEngineModelsSearchQuery,
            syncEngineModelsFilterCounts,
            engineModelKindLabel,
            formatEngineModelOptionLabel,
            ensureSelectValue,
            fillEngineModelSelect,
            pickCatalogDeps,
            normalizeEnginePickCatalog,
            buildManagedLlmPickItems,
            mergeManagedLlmIntoPickCatalog,
            buildDemucsPickItem,
            mergeDemucsPickItem,
            engineModelGroupLabel,
            renderEngineModelsList,
            renderEngineModelsCards,
        };
    }

    return { createEngineModelsLibraryUi };
}));
