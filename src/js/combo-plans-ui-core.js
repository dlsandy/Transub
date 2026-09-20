/**
 * Combo plans modal UI: browse, filter, confirm, download missing models, apply.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubComboPlansUi = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function comboPlansUiFactory(global) {
    function esc(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function createComboPlansUi(deps) {
        const d = deps || {};
        const electron = d.electron || (typeof global !== 'undefined' ? global.__ELECTRON__ : null);
        const els = d.els || {};
        const coreApi = d.comboPlansApi || global.TransubComboPlans || {};
        const missingApi = d.missingModelsApi || global.TransubEngineMissingModels || {};
        const formatApi = d.downloadFormatApi || global.TransubEngineDownloadFormat || {};
        const uiTf = d.uiTf || ((t, n) => {
            if (typeof global.TransubUiTf === 'function') return global.TransubUiTf(t, n);
            return String(t || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (_, k) => (n && n[k] != null ? String(n[k]) : `{${k}}`));
        });
        const uiTxDep = d.uiTx;
        const uiTx = (t) => {
            if (typeof uiTxDep === 'function') {
                const out = uiTxDep(t);
                if (out != null && String(out) !== '') return String(out);
            }
            if (typeof global.TransubI18n?.tx === 'function') {
                const out = global.TransubI18n.tx(t);
                if (out != null && String(out) !== '') return String(out);
            }
            return String(t || '');
        };
        const showToast = d.showToast || (() => {});
        const appendLog = d.appendLog || (() => {});
        const appConfirm = d.appConfirm || (async () => false);
        const getAdvancedEntitled = typeof d.getAdvancedEntitled === 'function'
            ? d.getAdvancedEntitled
            : () => !!d.advancedEntitled;
        const promptProUnlock = d.promptProUnlockRequired || (async () => {});
        const downloadEngineModels = d.downloadEngineModels || (async () => ({ ok: false }));
        const refreshEngineModels = d.refreshEngineModels || (async () => {});
        const getCachedEngineModels = d.getCachedEngineModels || (() => []);
        const applyOptionsToForm = d.applyOptionsToForm || (async () => {});
        const buildSavedOptionsFromForm = d.buildSavedOptionsFromForm || (() => ({}));
        const saveOptions = d.saveOptions || (async () => ({ ok: false }));
        const setSavedOptionsSnapshot = d.setSavedOptionsSnapshot || (() => {});
        const markSettingsDirty = d.markSettingsDirty || (() => {});
        const updateParamsSummary = d.updateParamsSummary || (() => {});
        const syncParamsModeChipUi = d.syncParamsModeChipUi || (() => {});
        const syncTranslateChipUi = d.syncTranslateChipUi || (() => {});
        const getActiveComboPlanId = d.getActiveComboPlanId || (() => '');
        const setActiveComboPlanId = d.setActiveComboPlanId || (() => {});

        let plans = [];
        let selectedId = '';
        let fullPlanCache = new Map();
        let filters = typeof coreApi.emptyFilters === 'function'
            ? coreApi.emptyFilters()
            : { language: '', subtitleTargetLang: '', hardwareTier: '', translateMode: '', pro: 'all', group: '' };
        let phase = 'browse'; // browse | downloading | ready
        let pendingPlan = null;
        let downloadUnsub = null;
        let bound = false;

        function $(id) {
            if (typeof document !== 'undefined') {
                const live = document.getElementById(id);
                if (live) return live;
            }
            return els[id] || null;
        }

        function filterRoot() {
            return $('comboPlansFilters') || $('comboPlansModal');
        }

        function readFilterValue(key, fallback) {
            const root = filterRoot();
            const active = root?.querySelector?.(`.combo-plan-filter-chip.is-active[data-filter-key="${key}"]`);
            if (active) return String(active.getAttribute('data-filter-value') || '');
            return fallback;
        }

        function readFiltersFromDom() {
            filters = {
                language: readFilterValue('language', ''),
                subtitleTargetLang: readFilterValue('subtitleTargetLang', ''),
                hardwareTier: readFilterValue('hardwareTier', ''),
                translateMode: readFilterValue('translateMode', ''),
                pro: readFilterValue('pro', 'all') || 'all',
                group: readFilterValue('group', ''),
            };
            return filters;
        }

        function setFilterChip(key, value) {
            const root = filterRoot();
            if (!root) return;
            root.querySelectorAll(`.combo-plan-filter-chip[data-filter-key="${key}"]`).forEach((btn) => {
                const on = String(btn.getAttribute('data-filter-value') || '') === String(value);
                btn.classList.toggle('is-active', on);
                btn.setAttribute('aria-pressed', on ? 'true' : 'false');
            });
        }

        function resetFiltersDom() {
            filters = coreApi.emptyFilters ? coreApi.emptyFilters() : filters;
            setFilterChip('language', '');
            setFilterChip('subtitleTargetLang', '');
            setFilterChip('hardwareTier', '');
            setFilterChip('translateMode', '');
            setFilterChip('pro', 'all');
            setFilterChip('group', '');
        }

        function syncChipLabel() {
            const labelEl = $('comboPlanChipLabel');
            if (!labelEl) return;
            const id = String(getActiveComboPlanId() || '').trim();
            if (!id) {
                labelEl.textContent = uiTx('推荐');
                return;
            }
            const hit = plans.find((p) => p.id === id) || fullPlanCache.get(id);
            labelEl.textContent = hit?.name
                ? String(hit.name).slice(0, 8)
                : id.slice(0, 10);
        }

        function filteredPlans() {
            return typeof coreApi.filterComboPlans === 'function'
                ? coreApi.filterComboPlans(plans, readFiltersFromDom())
                : plans;
        }

        function renderList() {
            const listEl = $('comboPlansList');
            const emptyEl = $('comboPlansEmpty');
            if (!listEl) return;
            const rows = filteredPlans();
            if (!rows.length) {
                listEl.innerHTML = '';
                if (emptyEl) {
                    emptyEl.hidden = false;
                    emptyEl.classList.remove('hidden');
                }
                return;
            }
            if (emptyEl) {
                emptyEl.hidden = true;
                emptyEl.classList.add('hidden');
            }
            listEl.innerHTML = rows.map((p) => {
                const pair = coreApi.formatComboPlanLangPair?.(p) || '';
                const mode = coreApi.translateModeLabel?.(p.translateMode) || p.translateMode;
                const hw = coreApi.hardwareTierLabel?.(p.hardware?.tier) || p.hardware?.tier || '';
                const proBadge = p.requiresPro
                    ? '<span class="combo-plan-pro-badge ml-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1">Pro</span>'
                    : '';
                const active = p.id === selectedId ? ' is-active ring-1 ring-violet-300 bg-violet-50/60' : '';
                return `<button type="button" class="combo-plan-card w-full text-left px-3 py-2.5 rounded-lg border border-gray-200 hover:border-violet-200 hover:bg-violet-50/40 transition${active}" data-combo-plan-id="${esc(p.id)}">
                    <div class="flex items-start justify-between gap-2">
                        <span class="text-sm font-medium text-gray-900 leading-snug">${esc(p.name)}${proBadge}</span>
                        <span class="shrink-0 text-[10px] text-gray-500">${esc(hw)}</span>
                    </div>
                    <div class="mt-1 flex flex-wrap gap-1.5 text-[11px] text-gray-600">
                        <span class="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5">${esc(pair)}</span>
                        <span class="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5">${esc(mode)}</span>
                    </div>
                    ${p.summary ? `<p class="mt-1 text-[11px] text-gray-500 line-clamp-2">${esc(p.summary)}</p>` : ''}
                </button>`;
            }).join('');
        }

        function renderDetail(plan) {
            const detailEl = $('comboPlansDetail');
            if (!detailEl) return;
            if (!plan) {
                detailEl.innerHTML = `<p class="text-sm text-gray-500">${esc(uiTx('请选择一个组合方案'))}</p>`;
                return;
            }
            const pair = coreApi.formatComboPlanLangPair?.(plan) || '';
            const mode = coreApi.translateModeLabel?.(plan.translateMode) || plan.translateMode;
            const proLine = plan.requiresPro
                ? `<p class="text-xs text-amber-700 font-medium">◆ ${esc(uiTx('需 Pro 解锁'))}</p>`
                : '';
            const models = (plan.models || []).map((m) => `<li class="text-xs text-gray-700">${esc(m)}</li>`).join('');
            detailEl.innerHTML = `
                <h4 class="text-sm font-semibold text-gray-900">${esc(plan.name)}</h4>
                ${proLine}
                <p class="text-xs text-gray-600 mt-2 leading-relaxed">${esc(plan.description || plan.summary || '')}</p>
                <dl class="mt-3 space-y-1.5 text-xs text-gray-700">
                    <div class="flex gap-2"><dt class="text-gray-500 shrink-0">方向</dt><dd>${esc(pair)}</dd></div>
                    <div class="flex gap-2"><dt class="text-gray-500 shrink-0">译法</dt><dd>${esc(mode)}</dd></div>
                    <div class="flex gap-2"><dt class="text-gray-500 shrink-0">硬件</dt><dd>${esc(plan.hardware?.label || '')}</dd></div>
                    <div class="flex gap-2"><dt class="text-gray-500 shrink-0">识别</dt><dd>${esc(plan.options?.engineAsrModel || '—')}</dd></div>
                    <div class="flex gap-2"><dt class="text-gray-500 shrink-0">翻译模型</dt><dd>${esc(plan.options?.engineLlmMtModel || uiTx('自动匹配') || '自动')}</dd></div>
                    ${coreApi.polishModelId?.(plan) ? `<div class="flex gap-2"><dt class="text-gray-500 shrink-0">润色模型</dt><dd>${esc(coreApi.polishModelId(plan))}</dd></div>` : ''}
                </dl>
                ${models ? `<p class="mt-3 text-[11px] font-medium text-gray-600">${esc(uiTx('所需模型'))}</p><ul class="mt-1 space-y-0.5 list-disc list-inside">${models}</ul>` : ''}
            `;
        }

        function setPhase(next) {
            phase = next;
            const progressWrap = $('comboPlansProgressWrap');
            const applyBtn = $('comboPlansApplyBtn');
            if (progressWrap) {
                const show = next === 'downloading';
                progressWrap.classList.toggle('hidden', !show);
                progressWrap.hidden = !show;
            }
            if (applyBtn) {
                applyBtn.disabled = next === 'downloading' || !selectedId;
                applyBtn.textContent = next === 'downloading'
                    ? uiTx('下载中…')
                    : uiTx('应用此方案');
            }
        }

        function setProgress(pct, message) {
            const bar = $('comboPlansProgressBar');
            const pctEl = $('comboPlansProgressPct');
            const textEl = $('comboPlansProgressText');
            const width = Math.max(0, Math.min(100, Number(pct) || 0));
            if (bar) bar.style.width = `${width}%`;
            if (pctEl) pctEl.textContent = Number.isFinite(Number(pct)) ? `${Math.round(width)}%` : '…';
            if (textEl) textEl.textContent = String(message || uiTx('正在下载模型…'));
        }

        async function ensureCatalog() {
            try {
                await refreshEngineModels({ silent: true });
            } catch { /* ignore */ }
            return getCachedEngineModels() || [];
        }

        async function loadPlans({ forceRefresh = true } = {}) {
            const statusEl = $('comboPlansStatus');
            if (statusEl) statusEl.textContent = uiTx('正在加载方案…');
            let res = null;
            try {
                res = forceRefresh
                    ? await electron?.comboPlansRefresh?.()
                    : await electron?.comboPlansList?.({ forceRefresh: true });
                if ((!res || res.ok === false) && electron?.comboPlansList) {
                    res = await electron.comboPlansList({ forceRefresh: true });
                }
            } catch (err) {
                if (statusEl) statusEl.textContent = err?.message || String(err);
                plans = [];
                renderList();
                return;
            }
            if (!res?.plans?.length) {
                if (statusEl) statusEl.textContent = res?.error || uiTx('未获取到组合方案');
                plans = [];
                renderList();
                return;
            }
            plans = (res.plans || [])
                .map((p) => coreApi.normalizeComboPlan?.(p) || p)
                .filter(Boolean);
            if (statusEl) {
                const src = res.source === 'cdn' ? 'CDN'
                    : res.source === 'samples' ? uiTx('本地示例')
                        : res.source === 'cache' ? uiTx('缓存')
                            : '';
                statusEl.textContent = src
                    ? uiTf('已加载 {count} 个方案（{source}）', { count: plans.length, source: src })
                    : uiTf('已加载 {count} 个方案', { count: plans.length });
                if (res.error && res.source !== 'cdn') {
                    statusEl.textContent += ` · ${res.error}`;
                }
            }
            if (!selectedId && plans[0]) selectedId = plans[0].id;
            renderList();
            if (selectedId) await selectPlan(selectedId, { silent: true });
            syncChipLabel();
        }

        async function selectPlan(id, { silent = false } = {}) {
            selectedId = String(id || '').trim();
            pendingPlan = null;
            setPhase('browse');
            renderList();
            let plan = fullPlanCache.get(selectedId);
            if (!plan) {
                const index = plans.find((p) => p.id === selectedId);
                renderDetail(index || null);
                const res = await electron?.comboPlansGet?.({ id: selectedId });
                if (res?.ok && res.plan) {
                    plan = coreApi.normalizeComboPlan?.(res.plan) || res.plan;
                    fullPlanCache.set(selectedId, plan);
                } else if (!silent && res?.error) {
                    showToast(res.error, 'warn');
                }
            }
            renderDetail(plan || plans.find((p) => p.id === selectedId) || null);
        }

        async function resolveFullPlan() {
            if (!selectedId) return null;
            let plan = fullPlanCache.get(selectedId);
            if (!plan) {
                const res = await electron?.comboPlansGet?.({ id: selectedId });
                if (res?.ok && res.plan) {
                    plan = coreApi.normalizeComboPlan?.(res.plan) || res.plan;
                    fullPlanCache.set(selectedId, plan);
                }
            }
            return plan || null;
        }

        function findMissing(plan, catalog) {
            const ids = typeof coreApi.collectRequiredModelIds === 'function'
                ? coreApi.collectRequiredModelIds(plan)
                : (plan.models || []);
            if (typeof missingApi.findMissingCatalogModels === 'function') {
                return missingApi.findMissingCatalogModels(ids, catalog) || [];
            }
            const installed = new Set(
                (catalog || []).filter((m) => m?.installed && !m?.incomplete).map((m) => String(m.id || '')),
            );
            return ids.filter((id) => id && !installed.has(id)).map((id) => ({ id }));
        }

        async function beginApplyFlow() {
            const plan = await resolveFullPlan();
            if (!plan) {
                showToast(uiTx('无法加载方案详情'), 'warn');
                return;
            }
            if (plan.requiresPro && !getAdvancedEntitled()) {
                await promptProUnlock({ featureLabel: uiTx('组合方案（智能/混合翻译）') });
                return;
            }
            const catalog = await ensureCatalog();
            const missing = findMissing(plan, catalog);
            const missingIds = missing.map((m) => String(m.id || m).trim()).filter(Boolean);
            const polishId = typeof coreApi.polishModelId === 'function'
                ? coreApi.polishModelId(plan)
                : '';
            let polishMissing = false;
            if (polishId) {
                try {
                    const status = await electron?.transubAdvancedManagedLlmStatus?.();
                    const row = (status?.catalog || []).find((m) => String(m?.id || '') === polishId);
                    polishMissing = !(row?.installed && !row?.incomplete && !row?.installError);
                } catch {
                    polishMissing = true;
                }
            }
            const downloadCount = missingIds.length + (polishMissing ? 1 : 0);
            const lines = typeof coreApi.buildConfirmSummaryLines === 'function'
                ? coreApi.buildConfirmSummaryLines(plan)
                : [plan.name];
            if (downloadCount) {
                lines.push('', uiTf('将下载缺失模型（{count}）：', { count: downloadCount }));
                lines.push(...missingIds.map((id) => `· ${id}`));
                if (polishMissing) lines.push(`· ${polishId}（润色）`);
            } else {
                lines.push('', uiTx('所需模型已就绪。'));
            }
            const ok = await appConfirm({
                title: uiTx('应用组合方案'),
                message: lines.join('\n'),
                primaryLabel: downloadCount ? uiTx('确定并下载') : uiTx('确定应用'),
                secondaryLabel: uiTx('取消'),
            });
            if (!ok) return;

            pendingPlan = { ...plan, _missing: missingIds, _polishMissing: polishMissing };
            if (!downloadCount) {
                await commitApply(plan);
                return;
            }
            setPhase('downloading');
            setProgress(0, uiTf('正在下载 {count} 个模型…', { count: downloadCount }));
            if (downloadUnsub) {
                try { downloadUnsub(); } catch { /* ignore */ }
                downloadUnsub = null;
            }
            if (missingIds.length && electron?.onEngineDownloadProgress) {
                downloadUnsub = electron.onEngineDownloadProgress((p) => {
                    if (phase !== 'downloading') return;
                    const sizeLine = formatApi.formatEngineDownloadSizeLine?.(p) || '';
                    const msg = [p.message || uiTx('下载中…'), sizeLine].filter(Boolean).join(' · ');
                    setProgress(p.pct ?? p.percent, msg);
                });
            }
            try {
                if (missingIds.length) {
                    const res = await downloadEngineModels({ modelIds: missingIds, force: false });
                    if (res?.ok === false) {
                        showToast(res.error || uiTx('模型下载失败'), 'err');
                        appendLog(res.error || '组合方案模型下载失败', 'err');
                        setPhase('browse');
                        return;
                    }
                    await ensureCatalog();
                    const still = findMissing(plan, getCachedEngineModels());
                    if (still.length) {
                        showToast(uiTf('仍缺模型：{ids}', { ids: still.map((m) => m.id || m).join('、') }), 'warn');
                        setPhase('browse');
                        return;
                    }
                }
                if (polishMissing && polishId) {
                    if (downloadUnsub) {
                        try { downloadUnsub(); } catch { /* ignore */ }
                        downloadUnsub = null;
                    }
                    if (electron?.onAdvancedManagedLlmProgress) {
                        downloadUnsub = electron.onAdvancedManagedLlmProgress((p) => {
                            if (phase !== 'downloading') return;
                            setProgress(p?.pct, p?.message || uiTx('正在下载润色模型…'));
                        });
                    }
                    setProgress(0, uiTf('正在下载润色模型 {id}…', { id: polishId }));
                    const pulled = await electron?.transubAdvancedManagedLlmPull?.({ modelId: polishId });
                    if (!pulled?.ok) {
                        showToast(pulled?.error || uiTx('润色模型下载失败'), 'err');
                        setPhase('browse');
                        return;
                    }
                }
                setProgress(100, uiTx('下载完成，正在应用…'));
                await commitApply(plan);
            } catch (err) {
                showToast(err?.message || String(err), 'err');
                setPhase('browse');
            } finally {
                if (downloadUnsub) {
                    try { downloadUnsub(); } catch { /* ignore */ }
                    downloadUnsub = null;
                }
            }
        }

        async function commitApply(planArg) {
            const plan = planArg || pendingPlan;
            if (!plan) return;
            if (plan.requiresPro && !getAdvancedEntitled()) {
                await promptProUnlock({ featureLabel: uiTx('组合方案（智能/混合翻译）') });
                return;
            }
            const patch = typeof coreApi.buildApplyOptionsPatch === 'function'
                ? coreApi.buildApplyOptionsPatch(plan)
                : { ...(plan.options || {}), activeComboPlanId: plan.id };
            const current = buildSavedOptionsFromForm() || {};
            const next = { ...current, ...patch };
            await applyOptionsToForm(next);
            setActiveComboPlanId(plan.id);
            const opts = {
                ...buildSavedOptionsFromForm(),
                ...patch,
                activeComboPlanId: plan.id,
            };
            const saveRes = await saveOptions(opts);
            const polishId = typeof coreApi.polishModelId === 'function'
                ? coreApi.polishModelId(plan)
                : '';
            if (polishId && electron?.transubAdvancedManagedLlmSelect) {
                const sel = await electron.transubAdvancedManagedLlmSelect({
                    modelId: polishId,
                    role: 'smartTranslate',
                });
                if (sel?.ok === false) {
                    showToast(sel.error || uiTx('无法选用润色模型'), 'warn');
                }
            }
            if (saveRes?.ok !== false) {
                setSavedOptionsSnapshot(opts);
                markSettingsDirty(false);
                showToast(uiTf('已应用方案「{name}」', { name: plan.name }), 'ok');
                appendLog(`已应用组合方案：${plan.name}`, 'ok');
            } else {
                markSettingsDirty(true);
                showToast(uiTx('已应用到表单，请保存设置'), 'warn');
            }
            updateParamsSummary();
            syncParamsModeChipUi();
            syncTranslateChipUi();
            syncChipLabel();
            pendingPlan = null;
            setPhase('browse');
            closeModal();
        }

        function openModal() {
            const modal = $('comboPlansModal');
            if (!modal) return;
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            modal.hidden = false;
            modal.setAttribute('aria-hidden', 'false');
            void loadPlans({ forceRefresh: true });
        }

        function closeModal() {
            const modal = $('comboPlansModal');
            if (!modal) return;
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            modal.hidden = true;
            modal.setAttribute('aria-hidden', 'true');
            if (downloadUnsub) {
                try { downloadUnsub(); } catch { /* ignore */ }
                downloadUnsub = null;
            }
            if (phase === 'downloading') setPhase('browse');
        }

        function bind() {
            if (bound || typeof document === 'undefined') return;
            bound = true;
            document.addEventListener('click', (e) => {
                const apply = e.target?.closest?.('#comboPlansApplyBtn');
                if (apply) {
                    e.preventDefault();
                    if (apply.disabled || phase === 'downloading') return;
                    apply.textContent = uiTx('准备中…') || '准备中…';
                    void beginApplyFlow().catch((err) => {
                        showToast(err?.message || String(err), 'err');
                        setPhase('browse');
                    });
                    return;
                }
                const chip = e.target?.closest?.('#comboPlanChipBtn');
                if (chip) {
                    e.preventDefault();
                    openModal();
                    return;
                }
                const btn = e.target?.closest?.('button');
                const id = btn?.id || '';
                if (id === 'comboPlansCloseBtn') {
                    e.preventDefault();
                    closeModal();
                    return;
                }
                if (id === 'comboPlansRefreshBtn') {
                    e.preventDefault();
                    void loadPlans({ forceRefresh: true });
                    return;
                }
                if (id === 'comboPlansClearFiltersBtn') {
                    e.preventDefault();
                    resetFiltersDom();
                    renderList();
                    return;
                }
                const filterChip = e.target?.closest?.('.combo-plan-filter-chip');
                if (filterChip && filterChip.closest?.('#comboPlansFilters')) {
                    e.preventDefault();
                    const key = filterChip.getAttribute('data-filter-key');
                    if (!key) return;
                    setFilterChip(key, filterChip.getAttribute('data-filter-value') || '');
                    renderList();
                    return;
                }
                const planBtn = e.target?.closest?.('[data-combo-plan-id]');
                if (planBtn && planBtn.closest?.('#comboPlansList')) {
                    void selectPlan(planBtn.getAttribute('data-combo-plan-id'));
                    return;
                }
                if (e.target?.id === 'comboPlansModal') closeModal();
            });
        }

        function syncFromOptions(options = {}) {
            if (Object.prototype.hasOwnProperty.call(options, 'activeComboPlanId')) {
                setActiveComboPlanId(String(options.activeComboPlanId || '').trim());
            }
            syncChipLabel();
        }

        return {
            bind,
            openModal,
            closeModal,
            loadPlans,
            syncChipLabel,
            syncFromOptions,
            getActiveComboPlanId,
            setActiveComboPlanId,
        };
    }

    return { createComboPlansUi };
}));
