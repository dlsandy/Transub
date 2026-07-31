/**
 * 设置页 · Advanced（许可 / BYOK / 软件内模型 / 模块）
 */
(function () {
    const electron = window.__ELECTRON__;
    if (!electron?.transubAdvancedGetStatus) return;

    const AFDIAN_PURCHASE_URL = 'https://afdian.com/a/transub';

    const els = {
        status: () => document.getElementById('advancedLicenseStatus'),
        meta: () => document.getElementById('advancedLicenseMeta'),
        purchaseBlock: () => document.getElementById('advancedPurchaseActivateBlock'),
        orderInput: () => document.getElementById('advancedAfdianOrderInput'),
        keyInput: () => document.getElementById('advancedLicenseKeyInput'),
        actionStatus: () => document.getElementById('advancedLicenseActionStatus'),
        byokStatus: () => document.getElementById('advancedByokActionStatus'),
        byokHint: () => document.getElementById('advancedByokKeyHint'),
        moduleStatus: () => document.getElementById('advancedModuleStatus'),
        provider: () => document.getElementById('advancedByokProviderSelect'),
        baseUrl: () => document.getElementById('advancedByokBaseUrlInput'),
        model: () => document.getElementById('advancedByokModelInput'),
        apiKey: () => document.getElementById('advancedByokApiKeyInput'),
        byokPanel: () => document.getElementById('advancedByokPanel'),
        managedPanel: () => document.getElementById('advancedManagedPanel'),
        sourceByok: () => document.getElementById('advancedLlmSourceByok'),
        sourceManaged: () => document.getElementById('advancedLlmSourceManaged'),
        managedRuntime: () => document.getElementById('advancedManagedRuntimeStatus'),
        smartTranslateSelect: () => document.getElementById('advancedSmartTranslateModelSelect'),
        inferenceSelect: () => document.getElementById('advancedInferenceModelSelect'),
        catalogSearch: () => document.getElementById('advancedManagedSearch'),
        catalogFilters: () => document.getElementById('advancedManagedFilters'),
        catalogScaleFilters: () => document.getElementById('advancedManagedScaleFilters'),
        catalogProHint: () => document.getElementById('advancedManagedProHint'),
        catalogCount: () => document.getElementById('advancedManagedCount'),
        catalogList: () => document.getElementById('advancedManagedList'),
        catalogStatus: () => document.getElementById('advancedManagedCatalogStatus'),
        progressWrap: () => document.getElementById('advancedManagedProgressWrap'),
        progressBar: () => document.getElementById('advancedManagedProgressBar'),
        progressText: () => document.getElementById('advancedManagedProgressText'),
    };

    const SCALE_CHIPS = [
        { id: 'all', label: '全部规格' },
        { id: 'light', label: '轻量 ≤7B' },
        { id: 'mid', label: '中等 8–16B' },
        { id: 'large', label: '大型 ≥17B' },
    ];

    let unsubManagedProgress = null;
    let unsubModelChanged = null;
    let syncingModelSelects = false;
    /** @type {object|null} */
    let managedSnapshot = null;
    let familyFilter = 'all';
    let scaleFilter = 'all';
    let searchQuery = '';
    let catalogBusy = false;

    function setText(el, text) {
        if (el) el.textContent = text || '';
    }

    function formatDays(ms) {
        const n = Math.max(0, Number(ms) || 0);
        if (n <= 0) return '0';
        return String(Math.ceil(n / (24 * 60 * 60 * 1000)));
    }

    function currentLlmSource() {
        if (els.sourceManaged()?.checked) return 'managed';
        return 'byok';
    }

    function setLlmSourceUi(source) {
        const managed = source === 'managed';
        if (els.sourceByok()) els.sourceByok().checked = !managed;
        if (els.sourceManaged()) els.sourceManaged().checked = managed;
        els.byokPanel()?.classList.toggle('hidden', managed);
        els.managedPanel()?.classList.toggle('hidden', !managed);
    }

    function modelOptionLabel(item) {
        const name = item?.name || item?.id || '';
        const bits = [];
        if (item?.translateOnly) bits.push('仅译中');
        if (item?.proScale) bits.push('Pro');
        return bits.length ? `${name}（${bits.join(' · ')}）` : name;
    }

    function fillManagedModelSelect(selectEl, managed, selectedId, {
        preferReconstruct = false,
        disableTranslateOnly = false,
    } = {}) {
        if (!selectEl) return;
        const catalog = (Array.isArray(managed?.catalog) ? managed.catalog : [])
            .filter((item) => item?.id && item.installed);
        catalog.sort((a, b) => {
            if (preferReconstruct || disableTranslateOnly) {
                const ar = a.translateOnly ? 1 : 0;
                const br = b.translateOnly ? 1 : 0;
                if (ar !== br) return ar - br;
            }
            return String(a.name || a.id).localeCompare(String(b.name || b.id), 'zh');
        });
        const want = String(selectedId || '').trim();
        const prev = selectEl.value;
        selectEl.innerHTML = '';
        const empty = document.createElement('option');
        empty.value = '';
        empty.textContent = catalog.length ? '（尚未选用）' : '（暂无已下载模型，请先在下方目录下载）';
        selectEl.appendChild(empty);
        for (const item of catalog) {
            const opt = document.createElement('option');
            opt.value = item.id;
            opt.textContent = modelOptionLabel(item);
            if (disableTranslateOnly && item.translateOnly) {
                opt.disabled = true;
                opt.textContent = `${modelOptionLabel(item)} · 不可用于智能翻译`;
            }
            selectEl.appendChild(opt);
        }
        // 当前选用若尚未下载，仍显示一项以免下拉空白，但不列入可选下载目录外的其它未装模型
        if (want && ![...selectEl.options].some((o) => o.value === want)) {
            const orphanMeta = (managed?.catalog || []).find((m) => m.id === want);
            const orphan = document.createElement('option');
            orphan.value = want;
            orphan.textContent = orphanMeta
                ? `${modelOptionLabel(orphanMeta)}（未下载）`
                : `${want}（未下载）`;
            selectEl.appendChild(orphan);
        }
        const next = want || prev || '';
        if (next && [...selectEl.options].some((o) => o.value === next)) {
            selectEl.value = next;
        } else {
            selectEl.value = '';
        }
    }

    function renderModelSelects(managed) {
        syncingModelSelects = true;
        try {
            const smartId = managed?.smartTranslateModelId
                || managed?.smartTranslateModel?.id
                || managed?.activeModelId
                || '';
            const inferId = managed?.activeModelId || managed?.activeModel?.id || '';
            fillManagedModelSelect(els.smartTranslateSelect(), managed, smartId, {
                preferReconstruct: true,
                disableTranslateOnly: true,
            });
            fillManagedModelSelect(els.inferenceSelect(), managed, inferId, { preferReconstruct: true });
        } finally {
            syncingModelSelects = false;
        }
    }

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function parseMinRamGbFromHint(ramHint) {
        const s = String(ramHint || '');
        const m = s.match(/(?:≥|>=)\s*(\d+(?:\.\d+)?)\s*GB/i);
        if (m) return Number(m[1]) || 0;
        const m2 = s.match(/(\d+(?:\.\d+)?)\s*GB/i);
        return m2 ? (Number(m2[1]) || 0) : 0;
    }

    function isRamTightForModel(item, systemMemoryGb) {
        const sys = Number(systemMemoryGb) || 0;
        const minGb = parseMinRamGbFromHint(item?.ramHint);
        if (!minGb || !sys) return false;
        const available = Math.max(0, sys - 2);
        return minGb > available || minGb > sys * 0.7;
    }

    function enrichManagedCatalog(managed) {
        if (!managed || !Array.isArray(managed.catalog)) return managed;
        const systemMemoryGb = Number(managed.systemMemoryGb) || 0;
        return {
            ...managed,
            catalog: managed.catalog.map((item) => ({
                ...item,
                ramTight: isRamTightForModel(item, systemMemoryGb),
            })),
        };
    }

    function collectFamilies(items) {
        const map = new Map();
        for (const item of items) {
            const id = String(item.family || 'other');
            if (map.has(id)) continue;
            map.set(id, item.familyLabel || id);
        }
        return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
    }

    function filteredCatalogItems() {
        const items = Array.isArray(managedSnapshot?.catalog) ? managedSnapshot.catalog.slice() : [];
        items.sort((a, b) => {
            if (!!b.recommended !== !!a.recommended) return b.recommended ? 1 : -1;
            if (!!b.active !== !!a.active) return b.active ? 1 : -1;
            if (!!b.smartTranslate !== !!a.smartTranslate) return b.smartTranslate ? 1 : -1;
            if (!!b.installed !== !!a.installed) return b.installed ? 1 : -1;
            const ba = Number(a.paramBillion) || 0;
            const bb = Number(b.paramBillion) || 0;
            if (ba !== bb) return ba - bb;
            return String(a.name || '').localeCompare(String(b.name || ''), 'zh');
        });
        const q = searchQuery.trim().toLowerCase();
        const entitled = !!managedSnapshot?.entitled;
        return items.filter((item) => {
            if (familyFilter === 'installed') {
                if (!item.installed) return false;
            } else if (familyFilter !== 'all' && String(item.family || '') !== familyFilter) {
                return false;
            }
            if (entitled && scaleFilter !== 'all') {
                const tier = String(item.scaleTier || '');
                if (tier !== scaleFilter) return false;
            }
            if (!q) return true;
            const hay = [
                item.name, item.fileName, item.id, item.family, item.familyLabel, item.note, item.ollamaTag,
            ].map((x) => String(x || '').toLowerCase()).join(' ');
            return hay.includes(q);
        });
    }

    function setCatalogStatus(text, kind = '') {
        const el = els.catalogStatus();
        if (!el) return;
        el.textContent = text || '';
        el.classList.remove('is-ok', 'is-err');
        if (kind) el.classList.add(`is-${kind}`);
    }

    function renderCatalogFilters() {
        const host = els.catalogFilters();
        if (!host) return;
        const families = collectFamilies(managedSnapshot?.catalog || []);
        const chips = [
            { id: 'all', label: '全部' },
            ...families,
            { id: 'installed', label: '已下载' },
        ];
        host.innerHTML = chips.map((c) => {
            const on = familyFilter === c.id ? ' is-on' : '';
            return `<button type="button" class="engine-model-chip${on}" data-family="${escapeHtml(c.id)}">${escapeHtml(c.label)}</button>`;
        }).join('');

        const scaleHost = els.catalogScaleFilters();
        const entitled = !!managedSnapshot?.entitled;
        if (scaleHost) {
            scaleHost.hidden = !entitled;
            if (entitled) {
                scaleHost.innerHTML = SCALE_CHIPS.map((c) => {
                    const on = scaleFilter === c.id ? ' is-on' : '';
                    return `<button type="button" class="engine-model-chip is-pro${on}" data-scale="${escapeHtml(c.id)}">${escapeHtml(c.label)}</button>`;
                }).join('');
            } else {
                scaleHost.innerHTML = '';
                scaleFilter = 'all';
            }
        }

        const hint = els.catalogProHint();
        if (hint) {
            const full = Number(managedSnapshot?.catalogFullCount) || 0;
            const visible = Number(managedSnapshot?.catalogVisibleCount) || (managedSnapshot?.catalog?.length || 0);
            if (!entitled && full > visible) {
                hint.hidden = false;
                hint.innerHTML = `当前显示 <strong>${visible}</strong> 个基础规格。解锁 <strong>Pro</strong> 后可浏览全部 <strong>${full}</strong> 个规格。`;
            } else if (entitled) {
                hint.hidden = false;
                hint.innerHTML = `Pro 已解锁 · 目录 <strong>${visible}</strong> 个模型，可按规格筛选。`;
            } else {
                hint.hidden = true;
                hint.textContent = '';
            }
        }
    }

    function renderCatalogList() {
        const list = els.catalogList();
        if (!list) return;
        const items = filteredCatalogItems();
        if (els.catalogCount()) {
            const total = managedSnapshot?.catalog?.length || 0;
            const full = Number(managedSnapshot?.catalogFullCount) || total;
            if (items.length === total && total === full) {
                els.catalogCount().textContent = `共 ${total} 个模型`;
            } else if (items.length === total && full > total) {
                els.catalogCount().textContent = `显示 ${total} / 全目录 ${full}`;
            } else {
                els.catalogCount().textContent = `显示 ${items.length} / ${total}`;
            }
        }
        if (!items.length) {
            list.innerHTML = '<div class="engine-model-empty">没有匹配的模型</div>';
            return;
        }
        list.innerHTML = items.map((item) => {
            const badges = [];
            if (item.recommended) badges.push('<span class="engine-model-badge is-rec">推荐</span>');
            if (item.translateOnly) badges.push('<span class="engine-model-badge is-warn">仅译中</span>');
            if (item.proScale) badges.push('<span class="engine-model-badge is-pro">Pro</span>');
            if (item.installed) badges.push('<span class="engine-model-badge is-ok">已下载</span>');
            if (item.smartTranslate) badges.push('<span class="engine-model-badge is-use">智能翻译</span>');
            if (item.active) badges.push('<span class="engine-model-badge is-use">推理</span>');
            if (item.ramTight) badges.push('<span class="engine-model-badge is-warn">内存紧张</span>');
            if (item.familyLabel) badges.push(`<span class="engine-model-badge">${escapeHtml(item.familyLabel)}</span>`);
            const selected = item.active || item.smartTranslate ? ' is-selected' : '';
            const ramClass = item.ramTight ? ' is-ram-tight' : '';
            const scaleLabel = item.paramBillion ? `${item.paramBillion}B` : '';
            const disabled = catalogBusy ? ' disabled' : '';
            return `
                <article class="engine-model-card${selected}${ramClass}" data-model-id="${escapeHtml(item.id)}">
                    <div class="engine-model-card-top">
                        <div>
                            <div class="engine-model-card-title">${escapeHtml(item.name)}${scaleLabel ? ` <span class="engine-model-card-sub">· ${escapeHtml(scaleLabel)}</span>` : ''}</div>
                            <div class="engine-model-card-sub">${escapeHtml(item.fileName || item.id)} · ${escapeHtml(item.sizeHint || '')} · ${escapeHtml(item.ramHint || '')}</div>
                        </div>
                        <div class="engine-model-card-badges">${badges.join('')}</div>
                    </div>
                    ${item.note ? `<p class="engine-model-card-note">${escapeHtml(item.note)}</p>` : ''}
                    <div class="engine-model-card-actions">
                        <button type="button" class="btn btn-primary" data-action="use-smart" data-model-id="${escapeHtml(item.id)}"${disabled}>
                            ${item.smartTranslate ? '已用作智能翻译' : '用作智能翻译'}
                        </button>
                        <button type="button" class="btn btn-primary" data-action="use-infer" data-model-id="${escapeHtml(item.id)}"${disabled}>
                            ${item.active ? '已用作推理' : '用作 LLM 推理'}
                        </button>
                        <button type="button" class="btn" data-action="pull" data-model-id="${escapeHtml(item.id)}"${disabled}>
                            ${item.installed ? '重新下载' : '下载'}
                        </button>
                    </div>
                </article>
            `;
        }).join('');
    }

    function renderCatalog() {
        renderCatalogFilters();
        renderCatalogList();
    }

    function applyManagedStatus(managed) {
        if (!managed) return;
        managedSnapshot = enrichManagedCatalog(managed);
        const runtime = managedSnapshot.runtime || {};
        setText(
            els.managedRuntime(),
            runtime.available
                ? (runtime.message || 'llama-server 可用')
                : (runtime.message || '尚未安装运行时。请先点击「安装 / 更新运行时」。'),
        );
        renderModelSelects(managedSnapshot);
        renderCatalog();
    }

    function askConfirm(options) {
        const opts = options && typeof options === 'object' ? options : { message: String(options || '') };
        const fn = (typeof globalThis !== 'undefined' && globalThis.TransubAppConfirm)
            || (typeof window !== 'undefined' && window.TransubAppConfirm)
            || null;
        if (typeof fn === 'function') return fn(opts);
        return Promise.resolve(window.confirm(String(opts.message || opts.title || '确认？')));
    }

    async function confirmTranslateOnlyIfNeeded(item, role) {
        if (!item?.translateOnly && String(item?.family || '').toLowerCase() !== 'sakura') return true;
        if (role === 'smartTranslate') {
            await askConfirm({
                title: '不能用作智能翻译',
                message: `「${item.name || item.id}」是日→中翻译专用模型，无法完成智能翻译（需影片简要与 JSON）。\n请改选 Qwen2.5 Instruct 等通用对话模型；Sakura 请用于「推理翻译」。`,
                primaryLabel: '知道了',
            });
            return false;
        }
        return askConfirm({
            title: '翻译专用模型',
            message: `「${item.name || item.id}」是日→中翻译专用模型，无法做语境重构或影片理解重构。\n若要做影片理解，请改选 Qwen2.5 Instruct 等通用对话模型。\n\n仍要用作 LLM 推理吗？`,
        });
    }

    async function confirmDownloadIfNeeded(item) {
        if (!item || item.installed) return true;
        const name = item.name || item.id;
        return askConfirm({
            title: '下载模型',
            message: `「${name}」尚未下载到本机。\n是否先下载，完成后再选用？`,
            primaryLabel: '下载并选用',
        });
    }

    /**
     * @returns {Promise<boolean>}
     */
    async function pullCatalogModel(modelId, { statusPrefix = '正在下载模型…' } = {}) {
        setCatalogStatus(statusPrefix);
        renderCatalogList();
        try {
            const res = await electron.transubAdvancedManagedLlmPull?.({ modelId });
            if (res?.ok) {
                setCatalogStatus(res.message || '模型下载完成', 'ok');
                await refreshManaged();
                return true;
            }
            if (res?.cancelled) {
                setCatalogStatus(res.error || '已取消下载');
                return false;
            }
            setCatalogStatus(res?.error || '模型下载失败', 'err');
            return false;
        } catch (err) {
            setCatalogStatus(err.message || '模型下载失败', 'err');
            return false;
        }
    }

    async function selectCatalogModel(modelId, role) {
        if (!modelId || catalogBusy) return;
        let item = (managedSnapshot?.catalog || []).find((m) => m.id === modelId);
        // Let the opening click settle so confirm「确定」won't receive the same mouseup.
        await new Promise((r) => setTimeout(r, 50));
        if (!(await confirmTranslateOnlyIfNeeded(item, role))) return;
        if (!(await confirmDownloadIfNeeded(item))) {
            setCatalogStatus('已取消选用');
            return;
        }

        catalogBusy = true;
        renderCatalogList();
        try {
            const needDownload = !!(item && !item.installed);
            if (needDownload) {
                const pulled = await pullCatalogModel(modelId, {
                    statusPrefix: `正在下载「${item.name || modelId}」…`,
                });
                if (!pulled) return;
                item = (managedSnapshot?.catalog || []).find((m) => m.id === modelId) || item;
                if (!item?.installed) {
                    setCatalogStatus('下载后仍未检测到模型文件，请刷新目录后重试', 'err');
                    return;
                }
            }

            setCatalogStatus('正在选用…');
            const res = await electron.transubAdvancedManagedLlmSelect?.({ modelId, role });
            if (res?.ok) {
                if (res.managed) applyManagedStatus(res.managed);
                else await refreshManaged();
                setCatalogStatus(res.message || '已选用', item?.translateOnly && role !== 'smartTranslate' ? '' : 'ok');
            } else {
                setCatalogStatus(res?.error || '选用失败', 'err');
            }
        } catch (err) {
            setCatalogStatus(err.message || '选用失败', 'err');
        } finally {
            catalogBusy = false;
            renderCatalogList();
        }
    }

    async function downloadCatalogModel(modelId) {
        if (!modelId || catalogBusy) return;
        catalogBusy = true;
        renderCatalogList();
        try {
            await pullCatalogModel(modelId);
        } finally {
            catalogBusy = false;
            renderCatalogList();
        }
    }

    function applyStatus(status) {
        if (!status) return;
        const entitled = !!status.entitled;
        try {
            window.TransubCore?.setAdvancedEntitled?.(entitled, status.freePipelineTranslate);
        } catch (_) { /* ignore */ }
        const line = entitled
            ? (status.devUnlock ? '已解锁（开发模式）' : '已解锁 Pro')
            : (status.message || '未解锁');
        setText(els.status(), line);
        if (els.status()) {
            els.status().className = entitled
                ? 'text-sm text-emerald-700 min-h-[1.25rem]'
                : 'text-sm text-gray-700 min-h-[1.25rem]';
        }

        const parts = [];
        if (status.licenseId) parts.push(`许可 ID：${status.licenseId}`);
        parts.push(`设备 ${status.deviceCount || 0}/${status.maxDevices || 1}`);
        if (status.deviceBound) parts.push('本机已绑定');
        if (status.needsRevalidation) {
            parts.push('需联网复核');
        } else if (status.lastValidatedAt) {
            parts.push(`复核剩余约 ${formatDays(status.revalidateInMs)} 天`);
        }
        if (!status.canTransfer && status.transferRetryInMs) {
            parts.push(`换机冷却约 ${formatDays(status.transferRetryInMs)} 天`);
        }
        setText(els.meta(), parts.join(' · '));

        const purchaseBlock = els.purchaseBlock();
        if (purchaseBlock) {
            purchaseBlock.classList.toggle('hidden', entitled);
            purchaseBlock.setAttribute('aria-hidden', entitled ? 'true' : 'false');
        }

        const byok = status.byok || {};
        if (els.provider() && byok.provider) els.provider().value = byok.provider;
        if (els.baseUrl()) els.baseUrl().value = byok.baseUrl || '';
        if (els.model()) els.model().value = byok.model || '';
        const mockCheck = document.getElementById('advancedReconstructMockCheck');
        if (mockCheck) mockCheck.checked = !!status.reconstructMock;
        if (els.byokHint()) {
            setText(
                els.byokHint(),
                byok.hasApiKey
                    ? `已保存密钥${status.byokKeyHint ? `（${status.byokKeyHint}）` : ''}`
                    : '尚未保存 API Key',
            );
        }

        setLlmSourceUi(status.llmSource === 'managed' ? 'managed' : 'byok');

        const mod = status.module || {};
        setText(
            els.moduleStatus(),
            mod.loaded
                ? `已加载闭源模块：${mod.name || 'Pro Module'}${mod.version ? ` v${mod.version}` : ''}`
                : '使用内置语境重构。安装 `_advanced/index.js` 后可覆盖为闭源实现。',
        );
    }

    async function refreshManaged() {
        if (!electron.transubAdvancedManagedLlmStatus) return;
        try {
            const res = await electron.transubAdvancedManagedLlmStatus();
            if (res?.ok) {
                if (res.status) applyStatus(res.status);
                applyManagedStatus(res.managed);
            } else {
                setText(els.managedRuntime(), res?.error || '无法读取本机模型状态');
            }
        } catch (err) {
            setText(els.managedRuntime(), err.message || '读取失败');
        }
    }

    async function refresh() {
        try {
            const res = await electron.transubAdvancedGetStatus();
            if (res?.ok) {
                applyStatus(res.status);
                if (res.status?.llmSource === 'managed') await refreshManaged();
            } else {
                setText(els.status(), res?.error || '无法读取许可状态');
            }
        } catch (err) {
            setText(els.status(), err.message || '读取失败');
        }
    }

    async function withAction(statusEl, fn) {
        setText(statusEl, '处理中…');
        try {
            const res = await fn();
            if (res?.ok) {
                if (res.status) applyStatus(res.status);
                else await refresh();
                if (res.managed) applyManagedStatus(res.managed);
                setText(statusEl, res.message || '完成');
            } else {
                setText(statusEl, res?.error || '失败');
                if (res?.status) applyStatus(res.status);
                if (res?.managed) applyManagedStatus(res.managed);
            }
        } catch (err) {
            setText(statusEl, err.message || '失败');
        }
    }

    function setPullProgress(info) {
        const wrap = els.progressWrap();
        if (!wrap) return;
        if (!info) {
            wrap.classList.add('hidden');
            return;
        }
        wrap.classList.remove('hidden');
        const pct = Number(info.pct);
        if (els.progressBar() && Number.isFinite(pct)) {
            els.progressBar().style.width = `${Math.max(0, Math.min(100, pct))}%`;
        }
        setText(els.progressText(), info.message || '');
        if (info.message) setCatalogStatus(info.message);
        if (info.phase === 'done' || info.phase === 'cancelled') {
            setTimeout(() => wrap.classList.add('hidden'), 1200);
            void refreshManaged();
        }
    }

    function bind() {
        document.getElementById('advancedBuyProBtn')?.addEventListener('click', async () => {
            try {
                const res = await electron.openExternal?.(AFDIAN_PURCHASE_URL);
                if (res && res.ok === false) {
                    setText(els.actionStatus(), res.error || '无法打开爱发电页面');
                }
            } catch (err) {
                setText(els.actionStatus(), err.message || '无法打开爱发电页面');
            }
        });
        document.getElementById('advancedRedeemAfdianBtn')?.addEventListener('click', () => {
            const outTradeNo = String(els.orderInput()?.value || '').trim();
            void withAction(els.actionStatus(), async () => {
                if (!electron.transubAdvancedRedeemAfdian) {
                    return { ok: false, error: '当前版本不支持订单号领取' };
                }
                const res = await electron.transubAdvancedRedeemAfdian({ outTradeNo });
                if (res?.ok && res.licenseKey && els.keyInput()) {
                    els.keyInput().value = res.licenseKey;
                }
                return res;
            });
        });
        document.getElementById('advancedActivateBtn')?.addEventListener('click', () => {
            const key = String(els.keyInput()?.value || '').trim();
            void withAction(els.actionStatus(), () => electron.transubAdvancedActivate({ licenseKey: key }));
        });
        document.getElementById('advancedTransferBtn')?.addEventListener('click', () => {
            const key = String(els.keyInput()?.value || '').trim();
            void withAction(els.actionStatus(), () => electron.transubAdvancedTransfer({ licenseKey: key }));
        });
        document.getElementById('advancedRevalidateBtn')?.addEventListener('click', () => {
            void withAction(els.actionStatus(), () => electron.transubAdvancedRevalidate());
        });
        document.getElementById('advancedDeactivateBtn')?.addEventListener('click', async () => {
            if (!(await askConfirm({ title: '清除许可', message: '确定清除本机 Pro 许可？', danger: true }))) return;
            void withAction(els.actionStatus(), () => electron.transubAdvancedDeactivate());
        });

        const onSourceChange = () => {
            const source = currentLlmSource();
            setLlmSourceUi(source);
            void withAction(els.byokStatus(), async () => {
                const res = await electron.transubAdvancedSaveByok({
                    llmSource: source,
                    reconstructMock: !!document.getElementById('advancedReconstructMockCheck')?.checked,
                });
                if (res?.ok && source === 'managed') await refreshManaged();
                return res?.ok
                    ? { ...res, message: source === 'managed' ? '已切换为软件内选模型' : '已切换为外接模型' }
                    : res;
            });
        };
        els.sourceByok()?.addEventListener('change', onSourceChange);
        els.sourceManaged()?.addEventListener('change', onSourceChange);

        document.getElementById('advancedSaveByokBtn')?.addEventListener('click', () => {
            const payload = {
                llmSource: 'byok',
                provider: els.provider()?.value || 'openai',
                baseUrl: els.baseUrl()?.value || '',
                model: els.model()?.value || '',
                reconstructMock: !!document.getElementById('advancedReconstructMockCheck')?.checked,
            };
            const apiKey = String(els.apiKey()?.value || '').trim();
            if (apiKey) payload.apiKey = apiKey;
            void withAction(els.byokStatus(), async () => {
                const res = await electron.transubAdvancedSaveByok(payload);
                if (res?.ok && els.apiKey()) els.apiKey().value = '';
                return res;
            });
        });
        document.getElementById('advancedTestByokBtn')?.addEventListener('click', () => {
            const apiKeyTyped = String(els.apiKey()?.value || '').trim();
            const payload = {
                llmSource: 'byok',
                baseUrl: els.baseUrl()?.value || '',
                model: els.model()?.value || '',
            };
            if (apiKeyTyped) payload.apiKey = apiKeyTyped;
            void withAction(els.byokStatus(), async () => {
                const res = await electron.transubAdvancedTestByok(payload);
                if (res?.ok) return { ok: true, message: res.message || '连接成功' };
                return { ok: false, error: res?.error || '连接失败' };
            });
        });
        document.getElementById('advancedClearByokKeyBtn')?.addEventListener('click', () => {
            void withAction(els.byokStatus(), async () => {
                const res = await electron.transubAdvancedClearByokKey();
                if (els.apiKey()) els.apiKey().value = '';
                return res;
            });
        });

        const onManagedModelSelect = (role) => (ev) => {
            if (syncingModelSelects) return;
            const modelId = String(ev.target?.value || '').trim();
            if (!modelId) {
                void withAction(els.byokStatus(), async () => {
                    const patch = role === 'smartTranslate'
                        ? { llmSource: 'managed', smartTranslateModelId: '' }
                        : { llmSource: 'managed', activeModelId: '' };
                    const res = await electron.transubAdvancedSaveByok(patch);
                    if (res?.ok) await refreshManaged();
                    return res?.ok
                        ? { ...res, message: role === 'smartTranslate' ? '已清除智能翻译模型' : '已清除 LLM 推理模型' }
                        : res;
                });
                return;
            }
            void withAction(els.byokStatus(), async () => {
                const res = await electron.transubAdvancedManagedLlmSelect?.({ modelId, role });
                if (res?.ok && res.managed) applyManagedStatus(res.managed);
                else if (res?.ok) await refreshManaged();
                return res;
            });
        };
        els.smartTranslateSelect()?.addEventListener('change', onManagedModelSelect('smartTranslate'));
        els.inferenceSelect()?.addEventListener('change', onManagedModelSelect('inference'));

        els.catalogSearch()?.addEventListener('input', (ev) => {
            searchQuery = String(ev.target?.value || '');
            renderCatalogList();
        });
        els.catalogFilters()?.addEventListener('click', (ev) => {
            const btn = ev.target?.closest?.('[data-family]');
            if (!btn) return;
            familyFilter = btn.getAttribute('data-family') || 'all';
            renderCatalog();
        });
        els.catalogScaleFilters()?.addEventListener('click', (ev) => {
            const btn = ev.target?.closest?.('[data-scale]');
            if (!btn) return;
            scaleFilter = btn.getAttribute('data-scale') || 'all';
            renderCatalog();
        });
        els.catalogList()?.addEventListener('click', (ev) => {
            const btn = ev.target?.closest?.('[data-action]');
            if (!btn || !els.catalogList()?.contains(btn)) return;
            const action = btn.getAttribute('data-action');
            const modelId = btn.getAttribute('data-model-id');
            if (action === 'use-smart') void selectCatalogModel(modelId, 'smartTranslate');
            if (action === 'use-infer') void selectCatalogModel(modelId, 'inference');
            if (action === 'pull') void downloadCatalogModel(modelId);
        });
        document.getElementById('advancedManagedCatalogRefreshBtn')?.addEventListener('click', () => {
            void withAction(els.byokStatus(), async () => {
                await refreshManaged();
                return { ok: true, message: '已刷新目录' };
            });
        });
        document.getElementById('advancedManagedRefreshBtn')?.addEventListener('click', () => {
            void withAction(els.byokStatus(), async () => {
                await refreshManaged();
                return { ok: true, message: '已刷新' };
            });
        });
        document.getElementById('advancedManagedInstallRuntimeBtn')?.addEventListener('click', () => {
            void withAction(els.byokStatus(), async () => {
                const res = await electron.transubAdvancedManagedLlmInstallRuntime?.({ force: true });
                if (res?.ok) {
                    if (res.managed) applyManagedStatus(res.managed);
                    return { ok: true, message: res.message || '运行时安装完成' };
                }
                return res || { ok: false, error: '运行时安装失败' };
            });
        });
        document.getElementById('advancedManagedStopServerBtn')?.addEventListener('click', () => {
            void withAction(els.byokStatus(), async () => {
                const res = await electron.transubAdvancedManagedLlmStopServer?.();
                if (res?.ok) await refreshManaged();
                return res?.ok
                    ? { ok: true, message: res.stopped ? '已停止本地服务' : '本地服务未在运行', managed: res.managed }
                    : res;
            });
        });
        document.getElementById('advancedTestManagedBtn')?.addEventListener('click', () => {
            void withAction(els.byokStatus(), async () => {
                const res = await electron.transubAdvancedTestByok({ llmSource: 'managed' });
                if (res?.ok) return { ok: true, message: res.message || '连接成功' };
                return { ok: false, error: res?.error || '连接失败' };
            });
        });
        document.getElementById('advancedManagedPerfTestBtn')?.addEventListener('click', () => {
            void withAction(els.byokStatus(), async () => {
                setText(els.byokStatus(), '性能测试进行中（首次可能较慢）…');
                const res = await electron.transubAdvancedManagedLlmPerfTest?.({});
                if (res?.ok) {
                    if (res.managed) applyManagedStatus(res.managed);
                    const detail = [
                        res.message,
                        res.sample ? `样例：${res.sample}` : '',
                    ].filter(Boolean).join(' · ');
                    return { ok: true, message: detail };
                }
                return { ok: false, error: res?.error || '性能测试失败' };
            });
        });
        document.getElementById('advancedManagedCancelPullBtn')?.addEventListener('click', () => {
            void electron.transubAdvancedManagedLlmCancelPull?.();
        });

        document.getElementById('advancedReconstructMockCheck')?.addEventListener('change', (ev) => {
            const checked = !!ev.target?.checked;
            void withAction(els.byokStatus(), () => electron.transubAdvancedSaveByok({
                llmSource: currentLlmSource(),
                reconstructMock: checked,
            }));
        });

        document.getElementById('advancedReloadModuleBtn')?.addEventListener('click', () => {
            void withAction(els.moduleStatus(), async () => {
                const res = await electron.transubAdvancedReloadModule();
                await refresh();
                return res?.ok
                    ? { ok: true, message: res.module?.loaded ? '模块已加载' : '仍未找到模块' }
                    : res;
            });
        });

        if (!unsubManagedProgress && electron.onAdvancedManagedLlmProgress) {
            unsubManagedProgress = electron.onAdvancedManagedLlmProgress((p) => setPullProgress(p));
        }
        if (!unsubModelChanged && electron.onAdvancedLlmModelChanged) {
            unsubModelChanged = electron.onAdvancedLlmModelChanged(() => {
                if (currentLlmSource() === 'managed') void refreshManaged();
            });
        }

        document.querySelectorAll('.params-tab-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const tab = btn.getAttribute('data-tab');
                if (tab === 'pro' || tab === 'pro-llm' || tab === 'pro-reconstruct') {
                    void refresh().then(() => {
                        if ((tab === 'pro-llm' || tab === 'pro') && currentLlmSource() === 'managed') {
                            void refreshManaged();
                        }
                    });
                }
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            bind();
            void refresh();
        });
    } else {
        bind();
        void refresh();
    }
}());
