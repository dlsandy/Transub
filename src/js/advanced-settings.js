/**
 * 设置页 · Advanced（许可 / BYOK / 软件内模型 / 模块）
 */
(function () {
    const electron = window.__ELECTRON__;
    if (!electron?.transubAdvancedGetStatus) return;

    const AFDIAN_PURCHASE_URL = 'https://afdian.com/item/41fef1a28bf211f189e252540025c377';

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
        managedRuntimeBackendWrap: () => document.getElementById('advancedManagedRuntimeBackendWrap'),
        managedRuntimeBackendSelect: () => document.getElementById('advancedManagedRuntimeBackendSelect'),
        llamaServerActionStatus: () => document.getElementById('advancedLlamaServerActionStatus'),
        llamaServerProgressWrap: () => document.getElementById('advancedLlamaServerProgressWrap'),
        llamaServerProgressBar: () => document.getElementById('advancedLlamaServerProgressBar'),
        llamaServerProgressText: () => document.getElementById('advancedLlamaServerProgressText'),
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
        tdpStatus: () => document.getElementById('tdpStatusLine'),
        tdpMeta: () => document.getElementById('tdpMetaLine'),
        tdpAction: () => document.getElementById('tdpActionStatus'),
        tdpProgressWrap: () => document.getElementById('tdpProgressWrap'),
        tdpProgressBar: () => document.getElementById('tdpProgressBar'),
        tdpProgressText: () => document.getElementById('tdpProgressText'),
        tdpCancelBtn: () => document.getElementById('tdpCancelBtn'),
        tdpCheckBtn: () => document.getElementById('tdpCheckBtn'),
        tdpUpdateBtn: () => document.getElementById('tdpUpdateBtn'),
    };

    const SCALE_CHIPS = [
        { id: 'all', label: '全部规格' },
        { id: 'light', label: '轻量 ≤7B' },
        { id: 'mid', label: '中等 8–16B' },
        { id: 'large', label: '大型 ≥17B' },
    ];

    let unsubManagedProgress = null;
    let unsubModelChanged = null;
    let unsubTdpProgress = null;
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

    /** 体验剩余：≥1 天按天；否则按小时 */
    function formatExpiryRemaining(ms) {
        const n = Math.max(0, Number(ms) || 0);
        if (n <= 0) return '已到期';
        const dayMs = 24 * 60 * 60 * 1000;
        if (n >= dayMs) return `约 ${Math.ceil(n / dayMs)} 天`;
        const hours = Math.max(1, Math.ceil(n / (60 * 60 * 1000)));
        return `约 ${hours} 小时`;
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
            else if (item.present && item.installError) {
                badges.push('<span class="engine-model-badge is-warn">文件异常</span>');
            }
            if (item.smartTranslate) badges.push('<span class="engine-model-badge is-use">智能翻译</span>');
            if (item.active) badges.push('<span class="engine-model-badge is-use">推理</span>');
            if (item.ramTight) badges.push('<span class="engine-model-badge is-warn">内存紧张</span>');
            if (item.familyLabel) badges.push(`<span class="engine-model-badge">${escapeHtml(item.familyLabel)}</span>`);
            const selected = item.active || item.smartTranslate ? ' is-selected' : '';
            const ramClass = item.ramTight ? ' is-ram-tight' : '';
            const scaleLabel = item.paramBillion ? `${item.paramBillion}B` : '';
            const disabled = catalogBusy ? ' disabled' : '';
            const installNote = (!item.installed && item.installError)
                ? `<p class="engine-model-card-note">${escapeHtml(item.installError)}</p>`
                : '';
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
                    ${installNote}
                    <div class="engine-model-card-actions">
                        <button type="button" class="btn btn-primary" data-action="use-smart" data-model-id="${escapeHtml(item.id)}"${disabled}>
                            ${item.smartTranslate ? '已用作智能翻译' : '用作智能翻译'}
                        </button>
                        <button type="button" class="btn btn-primary" data-action="use-infer" data-model-id="${escapeHtml(item.id)}"${disabled}>
                            ${item.active ? '已用作推理' : '用作 LLM 推理'}
                        </button>
                        <button type="button" class="btn" data-action="pull" data-model-id="${escapeHtml(item.id)}"${disabled}>
                            ${item.installed ? '重新下载' : (item.present ? '重新下载（修复）' : '下载')}
                        </button>
                        <button type="button" class="btn" data-action="manual" data-model-id="${escapeHtml(item.id)}"${disabled} title="浏览器下载 GGUF 后放到指定目录">
                            手动下载
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

    function applyRuntimeBackendSelect(managed) {
        const wrap = els.managedRuntimeBackendWrap();
        const select = els.managedRuntimeBackendSelect();
        if (!wrap || !select) return;
        const runtime = managed?.runtime || {};
        const choices = Array.isArray(runtime.choices) ? runtime.choices : [];
        const show = choices.length > 1;
        wrap.classList.toggle('hidden', !show);
        if (!show) return;

        const preferred = String(
            managed?.managedLlm?.runtimeId
            || runtime.preferredPackageId
            || choices[0]?.id
            || '',
        ).trim();
        // choices 已按硬件偏好排序：首项即推荐默认（NVIDIA→CUDA 13/12，否则 Vulkan）
        const hardwareDefaultId = String(choices[0]?.id || '').trim();
        const html = choices.map((c) => {
            const id = String(c.id || '').trim();
            if (!id) return '';
            const label = String(c.label || id).trim();
            const isDefault = !!hardwareDefaultId && id === hardwareDefaultId;
            const bits = [];
            if (isDefault) bits.push('默认');
            if (c.sizeHint) bits.push(String(c.sizeHint));
            const hint = bits.length ? ` · ${bits.join(' · ')}` : '';
            return `<option value="${escapeHtml(id)}">${escapeHtml(label)}${escapeHtml(hint)}</option>`;
        }).filter(Boolean).join('');
        if (html) select.innerHTML = html;
        if (preferred && [...select.options].some((o) => o.value === preferred)) {
            select.value = preferred;
        }
        select.classList.toggle('border-amber-400', !!runtime.mismatch);
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
        applyRuntimeBackendSelect(managedSnapshot);
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

    /**
     * @returns {Promise<'primary'|'secondary'|'tertiary'>}
     */
    function askConfirmChoice(options) {
        const opts = options && typeof options === 'object' ? options : { message: String(options || '') };
        const fn = (typeof globalThis !== 'undefined' && globalThis.TransubAppConfirmChoice)
            || (typeof window !== 'undefined' && window.TransubAppConfirmChoice)
            || null;
        if (typeof fn === 'function') return fn(opts);
        const ok = window.confirm(String(opts.message || opts.title || '确认？'));
        return Promise.resolve(ok ? 'primary' : 'secondary');
    }

    function buildManualGgufHint(info = {}) {
        const name = String(info.name || info.modelId || '模型').trim();
        const fileName = String(info.fileName || '').trim();
        const folder = String(info.folder || '').trim();
        const sizeHint = String(info.sizeHint || '').trim();
        const sizeLine = sizeHint ? `\n体积约 ${sizeHint}。` : '';
        return (
            `将在浏览器打开「${name}」的 GGUF 下载链接。${sizeLine}\n\n`
            + `下载完成后，请将文件保存为：\n${fileName || '（见模型卡片上的文件名）'}\n\n`
            + `并放到以下目录（文件名需完全一致）：\n${folder || '（软件目录）/advanced-llm/models'}`
        );
    }

    function buildManualRuntimeHint(info = {}) {
        const label = String(info.runtimeLabel || info.runtimeId || 'llama-server').trim();
        const sizeHint = String(info.sizeHint || '').trim();
        const archive = String(info.runtimeArchiveName || '').trim();
        const companion = String(info.runtimeCompanionArchiveName || '').trim();
        const folder = String(info.folder || '').trim();
        const sizeLine = sizeHint ? `\n体积约 ${sizeHint}。` : '';
        const files = companion
            ? `需下载两个文件：\n1) ${archive || '主程序 zip'}\n2) ${companion}`
            : `需下载：\n${archive || '运行时 zip'}`;
        return (
            `将在浏览器打开「${label}」下载链接。${sizeLine}\n\n`
            + `${files}\n\n`
            + `下载完成后请点「选择 zip 安装」，由软件解压到：\n`
            + `${folder || '（软件目录）/advanced-llm/runtime'}\n\n`
            + `也可自行解压到上述目录后点「检测」。`
        );
    }

    function currentRuntimeId() {
        return String(
            els.managedRuntimeBackendSelect()?.value
            || managedSnapshot?.managedLlm?.runtimeId
            || managedSnapshot?.runtime?.preferredPackageId
            || '',
        ).trim();
    }

    async function offerManualRuntimeAfterFailure(errorText = '') {
        const detail = String(errorText || '').trim();
        const proceed = await askConfirm({
            title: '运行时自动下载失败',
            message: (
                (detail ? `${detail}\n\n` : '')
                + '是否改为浏览器手动下载，再选择本机 zip 安装？'
            ),
            primaryLabel: '手动下载',
            secondaryLabel: '取消',
        });
        if (!proceed) return false;
        await manualDownloadRuntime();
        return true;
    }

    async function importRuntimeFromLocalZips(runtimeId) {
        const id = String(runtimeId || currentRuntimeId()).trim();
        if (!electron.transubAdvancedManagedLlmImportRuntime) {
            return { ok: false, error: '当前环境不支持从 zip 安装' };
        }
        const res = await electron.transubAdvancedManagedLlmImportRuntime({
            runtimeId: id || undefined,
        });
        if (res?.ok && res.managed) applyManagedStatus(res.managed);
        else if (res?.ok) await refreshManaged();
        return res;
    }

    async function verifyManualRuntime(info = null) {
        const runtimeId = String(info?.runtimeId || currentRuntimeId()).trim();
        const res = await electron.transubAdvancedManagedLlmVerifyManual?.({
            kind: 'runtime',
            runtimeId: runtimeId || undefined,
        });
        if (res?.ok) {
            if (res.managed) applyManagedStatus(res.managed);
            else await refreshManaged();
            return res;
        }
        return res || { ok: false, error: '未检测到本地运行时' };
    }

    async function manualDownloadRuntime() {
        if (!electron.transubAdvancedManagedLlmDownloadInfo || !electron.transubAdvancedManagedLlmOpenManual) {
            return { ok: false, error: '当前环境不支持手动下载' };
        }
        const runtimeId = currentRuntimeId();
        let infoRes;
        try {
            infoRes = await electron.transubAdvancedManagedLlmDownloadInfo({
                kind: 'runtime',
                runtimeId: runtimeId || undefined,
            });
        } catch (err) {
            return { ok: false, error: err?.message || '无法获取下载信息' };
        }
        if (!infoRes?.ok) {
            return { ok: false, error: infoRes?.error || '无法获取下载信息' };
        }
        const info = infoRes.info || {};
        await new Promise((r) => setTimeout(r, 50));
        const choice = await askConfirmChoice({
            title: '手动下载运行时',
            message: buildManualRuntimeHint(info),
            primaryLabel: '打开下载链接',
            tertiaryLabel: '选择 zip 安装',
            secondaryLabel: '取消',
        });
        if (choice === 'secondary') {
            return { ok: true, cancelled: true, message: '已取消手动下载' };
        }
        if (choice === 'tertiary') {
            const imported = await importRuntimeFromLocalZips(info.runtimeId || runtimeId);
            if (imported?.cancelled) return { ok: true, cancelled: true, message: '已取消' };
            return imported?.ok
                ? { ok: true, message: imported.message || '运行时安装完成' }
                : (imported || { ok: false, error: '从 zip 安装失败' });
        }

        try {
            // 优先官方 GitHub；镜像失败时用户可再试
            const openRes = await electron.transubAdvancedManagedLlmOpenManual({
                kind: 'runtime',
                runtimeId: info.runtimeId || runtimeId || undefined,
                which: info.needsCompanion ? 'all-official' : 'official',
            });
            if (!openRes?.ok) {
                return { ok: false, error: openRes?.error || '无法打开下载链接' };
            }
        } catch (err) {
            return { ok: false, error: err?.message || '无法打开下载链接' };
        }

        const after = await askConfirmChoice({
            title: '下载完成后',
            message: (
                `${buildManualRuntimeHint(info)}\n\n`
                + '浏览器下载完成后，请选择本机 zip 让软件自动解压安装。'
            ),
            primaryLabel: '选择 zip 安装',
            tertiaryLabel: '打开存放目录',
            secondaryLabel: '稍后检测',
        });
        if (after === 'tertiary') {
            try {
                await electron.transubAdvancedManagedLlmOpenFolder?.({ kind: 'runtime' });
            } catch (_) { /* ignore */ }
            const again = await askConfirmChoice({
                title: '手动安装运行时',
                message: '目录已打开。是否选择已下载的 zip 安装？',
                primaryLabel: '选择 zip 安装',
                tertiaryLabel: '我已解压，检测',
                secondaryLabel: '稍后',
            });
            if (again === 'primary') {
                const imported = await importRuntimeFromLocalZips(info.runtimeId || runtimeId);
                if (imported?.cancelled) return { ok: true, cancelled: true, message: '已取消' };
                return imported?.ok
                    ? { ok: true, message: imported.message || '运行时安装完成' }
                    : (imported || { ok: false, error: '从 zip 安装失败' });
            }
            if (again === 'tertiary') {
                const verified = await verifyManualRuntime(info);
                return verified?.ok
                    ? { ok: true, message: verified.message || '已检测到本地运行时' }
                    : (verified || { ok: false, error: '未检测到本地运行时' });
            }
            return { ok: true, message: '已打开下载页，稍后可点「手动下载运行时」继续' };
        }
        if (after === 'primary') {
            const imported = await importRuntimeFromLocalZips(info.runtimeId || runtimeId);
            if (imported?.cancelled) return { ok: true, cancelled: true, message: '已取消' };
            return imported?.ok
                ? { ok: true, message: imported.message || '运行时安装完成' }
                : (imported || { ok: false, error: '从 zip 安装失败' });
        }
        if (after === 'secondary') {
            const verified = await verifyManualRuntime(info);
            if (verified?.ok) {
                return { ok: true, message: verified.message || '已检测到本地运行时' };
            }
            return { ok: true, message: '已打开下载页，放入文件后请再点「手动下载运行时」检测' };
        }
        return { ok: true, message: '已打开下载页' };
    }

    async function confirmTranslateOnlyIfNeeded(item, role) {
        if (!item?.translateOnly && String(item?.family || '').toLowerCase() !== 'sakura') return true;
        if (role === 'smartTranslate') {
            await askConfirm({
                title: '不能用作智能翻译',
                message: `「${item.name || item.id}」是日→中翻译专用模型，无法完成智能翻译（需影片简要）。\n请改选 Qwen2.5 Instruct 等通用对话模型；Sakura 请用于「推理翻译」或智能翻译的句级混合。`,
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
     * @returns {Promise<boolean|null>} true 成功；false 失败；null 已取消
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
                return null;
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
            const pulled = await pullCatalogModel(modelId);
            if (pulled === false) {
                const proceed = await askConfirm({
                    title: '模型下载失败',
                    message: '应用内下载未完成。是否改为浏览器手动下载 GGUF，并按提示放到模型目录？',
                    primaryLabel: '手动下载',
                    secondaryLabel: '取消',
                });
                if (proceed) {
                    catalogBusy = false;
                    renderCatalogList();
                    await manualDownloadCatalogModel(modelId);
                }
            }
        } finally {
            catalogBusy = false;
            renderCatalogList();
        }
    }

    async function verifyManualCatalogModel(modelId, info = null) {
        const res = await electron.transubAdvancedManagedLlmVerifyManual?.({ modelId, kind: 'model' });
        if (res?.ok) {
            if (res.managed) applyManagedStatus(res.managed);
            else await refreshManaged();
            setCatalogStatus(res.message || '已检测到本地 GGUF', 'ok');
            return true;
        }
        const folder = res?.folder || info?.folder || '';
        const fileName = res?.fileName || info?.fileName || '';
        const detail = [res?.error || '未检测到有效的模型文件', fileName && folder ? `请确认 ${fileName} 已放在：${folder}` : '']
            .filter(Boolean)
            .join('\n');
        setCatalogStatus(detail, 'err');
        return false;
    }

    async function manualDownloadCatalogModel(modelId) {
        if (!modelId || catalogBusy) return;
        if (!electron.transubAdvancedManagedLlmDownloadInfo || !electron.transubAdvancedManagedLlmOpenManual) {
            setCatalogStatus('当前环境不支持手动下载', 'err');
            return;
        }
        setCatalogStatus('正在准备手动下载说明…');
        let infoRes;
        try {
            infoRes = await electron.transubAdvancedManagedLlmDownloadInfo({ modelId, kind: 'model' });
        } catch (err) {
            setCatalogStatus(err?.message || '无法获取下载信息', 'err');
            return;
        }
        if (!infoRes?.ok) {
            setCatalogStatus(infoRes?.error || '无法获取下载信息', 'err');
            return;
        }
        const info = infoRes.info || {};
        // Let the opening click settle so confirm「打开下载链接」won't receive the same mouseup.
        await new Promise((r) => setTimeout(r, 50));
        const choice = await askConfirmChoice({
            title: '手动下载 GGUF',
            message: buildManualGgufHint(info),
            primaryLabel: '打开下载链接',
            tertiaryLabel: '打开存放目录',
            secondaryLabel: '取消',
        });
        if (choice === 'secondary') {
            setCatalogStatus('已取消手动下载');
            return;
        }
        if (choice === 'tertiary') {
            try {
                const folderRes = await electron.transubAdvancedManagedLlmOpenFolder?.({ kind: 'model' });
                if (folderRes?.ok) {
                    setCatalogStatus(`已打开存放目录：${folderRes.folder || info.folder || ''}`);
                } else {
                    setCatalogStatus(folderRes?.error || '无法打开存放目录', 'err');
                }
            } catch (err) {
                setCatalogStatus(err?.message || '无法打开存放目录', 'err');
            }
            const again = await askConfirmChoice({
                title: '手动下载 GGUF',
                message: `${buildManualGgufHint(info)}\n\n目录已打开。是否继续打开下载链接？`,
                primaryLabel: '打开下载链接',
                secondaryLabel: '稍后',
            });
            if (again !== 'primary') return;
        }
        try {
            const openRes = await electron.transubAdvancedManagedLlmOpenManual({
                modelId,
                kind: 'model',
                which: 'mirror',
            });
            if (!openRes?.ok) {
                setCatalogStatus(openRes?.error || '无法打开下载链接', 'err');
                return;
            }
        } catch (err) {
            setCatalogStatus(err?.message || '无法打开下载链接', 'err');
            return;
        }
        const folder = String(info.folder || '').trim();
        const fileName = String(info.fileName || '').trim();
        setCatalogStatus(
            fileName && folder
                ? `已打开下载页。请将 ${fileName} 放到：${folder}`
                : '已打开下载页。请按提示将 GGUF 放到 advanced-llm/models 目录',
        );
        const verifyChoice = await askConfirmChoice({
            title: '检测本地文件',
            message: (
                `若已将文件放到指定目录，可立即检测是否可用。\n\n`
                + (fileName ? `文件名：${fileName}\n` : '')
                + (folder ? `目录：${folder}` : '')
            ),
            primaryLabel: '我已放入，检测',
            tertiaryLabel: '打开存放目录',
            secondaryLabel: '稍后',
        });
        if (verifyChoice === 'tertiary') {
            try {
                await electron.transubAdvancedManagedLlmOpenFolder?.({ kind: 'model' });
            } catch (_) { /* ignore */ }
            const retry = await askConfirm({
                title: '检测本地文件',
                message: '文件放好后，是否现在检测？',
                primaryLabel: '检测',
                secondaryLabel: '稍后',
            });
            if (!retry) return;
            await verifyManualCatalogModel(modelId, info);
            return;
        }
        if (verifyChoice === 'primary') {
            await verifyManualCatalogModel(modelId, info);
        }
    }

    function applyStatus(status) {
        if (!status) return;
        const entitled = !!status.entitled;
        try {
            window.TransubCore?.setAdvancedEntitled?.(entitled, status.freePipelineTranslate);
        } catch (_) { /* ignore */ }
        let line;
        if (entitled) {
            if (status.devUnlock) {
                line = '已解锁（开发模式）';
            } else if (status.isTrial && status.expiresInMs != null) {
                line = `已解锁 Pro 体验（剩余 ${formatExpiryRemaining(status.expiresInMs)}）`;
            } else {
                line = '已解锁 Pro';
            }
        } else {
            line = status.message || '未解锁';
        }
        setText(els.status(), line);
        if (els.status()) {
            let cls = 'text-sm text-gray-700 min-h-[1.25rem]';
            if (entitled) cls = 'text-sm text-emerald-700 min-h-[1.25rem]';
            else if (status.reason === 'expired' || status.expired) cls = 'text-sm text-amber-700 min-h-[1.25rem]';
            els.status().className = cls;
        }

        const parts = [];
        if (status.licenseId) parts.push(`许可 ID：${status.licenseId}`);
        if (status.isTrial) parts.push('类型：7 天体验');
        parts.push(`设备 ${status.deviceCount || 0}/${status.maxDevices || 1}`);
        if (status.deviceBound) parts.push('本机已绑定');
        if (status.isTrial && status.expiresAt && !status.expired && status.expiresInMs != null) {
            parts.push(`到期剩余 ${formatExpiryRemaining(status.expiresInMs)}`);
        }
        if (status.needsRevalidation) {
            parts.push('需联网复核');
        } else if (status.lastValidatedAt && !status.isTrial) {
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
        const unlockPitch = document.getElementById('advancedProUnlockPitch');
        if (unlockPitch) {
            unlockPitch.classList.toggle('hidden', entitled);
            unlockPitch.setAttribute('aria-hidden', entitled ? 'true' : 'false');
        }
        const buyHint = document.getElementById('advancedBuyProHint');
        if (buyHint && !entitled) {
            if (status.reason === 'expired' || status.expired) {
                buyHint.textContent = '体验已到期。可购买大版本内买断继续使用 Pro；体验包不可抵扣买断，每爱发电账号限购体验包 1 次。';
            } else {
                buyHint.textContent = '付款后填写订单号领取并激活密钥；也可粘贴许可密钥（TSUB1.…）';
            }
        }
        const moreAfdianBtn = document.getElementById('openAfdianFromSettingsBtn');
        if (moreAfdianBtn) {
            moreAfdianBtn.hidden = entitled;
            moreAfdianBtn.classList.toggle('hidden', entitled);
        }

        const byok = status.byok || {};
        if (els.provider() && byok.provider) els.provider().value = byok.provider;
        if (els.baseUrl()) els.baseUrl().value = byok.baseUrl || '';
        if (els.model()) els.model().value = byok.model || '';
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
                : (mod.message
                    ? `未加载闭源模块：${mod.message}`
                    : '使用内置语境重构。安装 `_advanced/index.js` 后可覆盖为闭源实现。'),
        );

        void refreshTdp();
    }

    /** @type {{ updateAvailable?: boolean, remote?: object, upToDate?: boolean } | null} */
    let lastTdpCheck = null;

    function applyTdpStatus(tdp, check = null) {
        if (!tdp) return;
        const ver = tdp.installedVersion || (tdp.bundledAvailable ? '内置' : '无');
        const useLine = tdp.entitled
            ? (tdp.applied ? '已热加载使用中' : '已开通 Pro，可更新并应用')
            : '开通 Pro 后可使用语言优化包';
        const remoteVer = check?.remote?.version || lastTdpCheck?.remote?.version || '';
        const updateAvailable = !!(check?.updateAvailable ?? lastTdpCheck?.updateAvailable);
        if (updateAvailable && remoteVer) {
            setText(els.tdpStatus(), `当前版本：${ver} · 可更新至 ${remoteVer} · ${useLine}`);
        } else {
            setText(els.tdpStatus(), `当前版本：${ver} · ${useLine}`);
        }
        const meta = [];
        if (tdp.source) meta.push(`来源：${tdp.source === 'cdn' ? '官方更新' : tdp.source === 'bundled' ? '安装包内置' : tdp.source}`);
        if (tdp.installedAt) meta.push(`安装于 ${String(tdp.installedAt).slice(0, 10)}`);
        const notes = String(check?.remote?.notes || lastTdpCheck?.remote?.notes || tdp.notes || '').trim();
        if (updateAvailable && notes) meta.push(`更新说明：${notes}`);
        else if (!updateAvailable && check?.upToDate) meta.push('已是最新');
        setText(els.tdpMeta(), meta.join(' · '));
        const updateBtn = els.tdpUpdateBtn();
        if (updateBtn) {
            updateBtn.disabled = false;
            updateBtn.textContent = updateAvailable && remoteVer
                ? `立即更新 · ${remoteVer}`
                : '立即更新';
            updateBtn.classList.toggle('ring-2', updateAvailable);
            updateBtn.classList.toggle('ring-violet-300', updateAvailable);
        }
        if (els.tdpCheckBtn()) els.tdpCheckBtn().disabled = false;
    }

    async function refreshTdp({ checkRemote = true } = {}) {
        if (!electron.transubTdpGetStatus) return;
        try {
            const res = await electron.transubTdpGetStatus();
            if (!res?.ok) {
                setText(els.tdpStatus(), res?.error || '无法读取优化包状态');
                return;
            }
            applyTdpStatus(res.tdp);
            if (checkRemote && electron.transubTdpCheck) {
                try {
                    const checked = await electron.transubTdpCheck();
                    if (checked?.ok) {
                        lastTdpCheck = checked;
                        applyTdpStatus(checked.local || res.tdp, checked);
                        if (checked.updateAvailable) {
                            setText(
                                els.tdpAction(),
                                `发现新版本 ${checked.remote?.version || ''}${checked.remote?.notes ? `：${checked.remote.notes}` : ''}`.trim(),
                            );
                        }
                    }
                } catch (_) { /* soft check — status already shown */ }
            }
        } catch (err) {
            setText(els.tdpStatus(), err.message || '读取失败');
        }
    }

    function setTdpProgress(p) {
        const wrap = els.tdpProgressWrap();
        const bar = els.tdpProgressBar();
        const text = els.tdpProgressText();
        const cancel = els.tdpCancelBtn();
        if (!p || p.phase === 'done' || p.phase === 'error') {
            wrap?.classList.add('hidden');
            cancel?.classList.add('hidden');
            if (bar) bar.style.width = '0%';
            return;
        }
        wrap?.classList.remove('hidden');
        cancel?.classList.remove('hidden');
        const pct = Math.max(0, Math.min(100, Number(p.percent) || 0));
        if (bar) bar.style.width = `${pct}%`;
        const phase = p.phase === 'download' ? '下载中' : p.phase === 'apply' ? '应用中' : '准备中';
        setText(text, `${phase}${p.version ? ` ${p.version}` : ''} ${pct ? `${Math.round(pct)}%` : ''}`.trim());
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
                // llama-server 在「运行环境」页，与是否选用软件内模型无关，始终刷新
                await refreshManaged();
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
        const isRuntime = String(info?.kind || '').trim() === 'runtime';
        const wrap = isRuntime
            ? (els.llamaServerProgressWrap() || els.progressWrap())
            : els.progressWrap();
        const bar = isRuntime
            ? (els.llamaServerProgressBar() || els.progressBar())
            : els.progressBar();
        const textEl = isRuntime
            ? (els.llamaServerProgressText() || els.progressText())
            : els.progressText();
        const statusEl = isRuntime ? els.llamaServerActionStatus() : null;
        if (!wrap) {
            if (info?.message && statusEl) setText(statusEl, info.message);
            return;
        }
        if (!info) {
            wrap.classList.add('hidden');
            return;
        }
        wrap.classList.remove('hidden');
        const pct = Number(info.pct);
        if (bar && Number.isFinite(pct)) {
            bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
        }
        setText(textEl, info.message || '');
        if (info.message) {
            if (isRuntime) setText(statusEl, info.message);
            else setCatalogStatus(info.message);
        }
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
            void withAction(els.actionStatus(), async () => {
                const res = await electron.transubAdvancedActivate({ licenseKey: key });
                await electron.transubTdpSync?.();
                await refreshTdp();
                return res;
            });
        });
        document.getElementById('advancedTransferBtn')?.addEventListener('click', () => {
            const key = String(els.keyInput()?.value || '').trim();
            void withAction(els.actionStatus(), async () => {
                const res = await electron.transubAdvancedTransfer({ licenseKey: key });
                await electron.transubTdpSync?.();
                await refreshTdp();
                return res;
            });
        });
        document.getElementById('advancedRevalidateBtn')?.addEventListener('click', () => {
            void withAction(els.actionStatus(), async () => {
                const res = await electron.transubAdvancedRevalidate();
                await electron.transubTdpSync?.();
                await refreshTdp();
                return res;
            });
        });
        document.getElementById('advancedDeactivateBtn')?.addEventListener('click', async () => {
            if (!(await askConfirm({ title: '清除许可', message: '确定清除本机 Pro 许可？', danger: true }))) return;
            void withAction(els.actionStatus(), async () => {
                const res = await electron.transubAdvancedDeactivate();
                await refreshTdp();
                return res;
            });
        });

        const onSourceChange = () => {
            const source = currentLlmSource();
            setLlmSourceUi(source);
            void withAction(els.byokStatus(), async () => {
                const res = await electron.transubAdvancedSaveByok({
                    llmSource: source,
                    reconstructMock: false,
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
                reconstructMock: false,
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
            if (action === 'manual') void manualDownloadCatalogModel(modelId);
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
        const runtimeStatusEl = () => (
            els.llamaServerActionStatus()
            || els.managedRuntime()
            || els.byokStatus()
        );

        document.getElementById('advancedManagedRuntimeRefreshBtn')?.addEventListener('click', () => {
            void withAction(runtimeStatusEl(), async () => {
                await refreshManaged();
                const runtime = managedSnapshot?.runtime || {};
                const detail = String(runtime.message || '').trim()
                    || (runtime.available ? 'llama-server 可用' : '尚未安装运行时');
                // 把最新状态写回主状态行；动作反馈留在 action 行
                setText(els.managedRuntime(), detail);
                return {
                    ok: true,
                    message: runtime.outdated
                        ? `已刷新 · ${detail}`
                        : `已刷新运行时状态 · ${detail}`,
                    managed: managedSnapshot || undefined,
                };
            });
        });
        document.getElementById('advancedManagedInstallRuntimeBtn')?.addEventListener('click', () => {
            void withAction(runtimeStatusEl(), async () => {
                const runtimeId = String(els.managedRuntimeBackendSelect()?.value || '').trim();
                const choice = (managedSnapshot?.runtime?.choices || [])
                    .find((c) => c.id === runtimeId);
                const sizeHint = choice?.sizeHint ? `\n体积约 ${choice.sizeHint}。` : '';
                if (choice?.backend === 'cuda' || /^win-cuda\d+-x64$/i.test(runtimeId)) {
                    const ok = await askConfirm({
                        title: '安装 CUDA 运行时',
                        message: `将下载 NVIDIA CUDA 版 llama-server（含运行库）。${sizeHint}\n\n需要较新的 NVIDIA 驱动；若安装失败可改回 Vulkan 或改用「手动下载运行时」。\n若该后端已安装且版本匹配，将跳过下载。`,
                        primaryLabel: '继续安装',
                        secondaryLabel: '取消',
                    });
                    if (!ok) return { ok: false, error: '已取消' };
                }
                const res = await electron.transubAdvancedManagedLlmInstallRuntime?.({
                    force: true,
                    runtimeId: runtimeId || undefined,
                });
                if (res?.ok) {
                    if (res.managed) applyManagedStatus(res.managed);
                    return { ok: true, message: res.message || '运行时安装完成' };
                }
                await offerManualRuntimeAfterFailure(res?.error || '运行时安装失败');
                return res || { ok: false, error: '运行时安装失败' };
            });
        });
        document.getElementById('advancedManagedManualRuntimeBtn')?.addEventListener('click', () => {
            void withAction(runtimeStatusEl(), async () => {
                const res = await manualDownloadRuntime();
                if (res?.cancelled) return { ok: true, message: res.message || '已取消' };
                return res || { ok: false, error: '手动下载失败' };
            });
        });
        document.getElementById('advancedManagedScanCudaBtn')?.addEventListener('click', () => {
            void withAction(runtimeStatusEl(), async () => {
                const runtimeId = String(els.managedRuntimeBackendSelect()?.value || '').trim();
                const scan = await electron.transubAdvancedManagedLlmScanCuda?.({
                    runtimeId: runtimeId || undefined,
                });
                if (!scan?.ok) {
                    return scan || { ok: false, error: '扫描失败' };
                }
                if (!scan.found) {
                    await askConfirm({
                        title: '未找到可复用 CUDA',
                        message: `${scan.message || '未找到齐全的 CUDA 运行库。'}\n\n将在安装 CUDA 版运行时时报官方 cudart；也可改用「手动下载运行时」。`,
                        primaryLabel: '知道了',
                        secondaryLabel: '',
                    });
                    setText(
                        els.managedRuntime(),
                        scan.message || '未找到可复用的本机 CUDA 运行库',
                    );
                    return { ok: true, message: scan.message || '未找到可复用 CUDA' };
                }

                const dirs = (scan.best?.dirs || []).slice(0, 3).join('\n') || '（见详情）';
                const extra = (scan.candidates || []).length > 1
                    ? `\n另有 ${scan.candidates.length - 1} 处候选。`
                    : '';
                const choice = await askConfirmChoice({
                    title: '找到可复用 CUDA 运行库',
                    message: `${scan.message}\n\n来源目录：\n${dirs}${extra}\n\n可立即复制到 llama-server 运行时目录（跳过后续 cudart 下载），或仅记录结果。`,
                    primaryLabel: '复用到运行时',
                    secondaryLabel: '仅查看',
                    tertiaryLabel: '',
                });
                setText(els.managedRuntime(), scan.message);

                if (choice !== 'primary') {
                    return { ok: true, message: scan.message };
                }

                const adopt = await electron.transubAdvancedManagedLlmAdoptCuda?.({
                    runtimeId: runtimeId || scan.runtimeId || undefined,
                });
                if (!adopt?.ok) {
                    return adopt || { ok: false, error: '复用失败' };
                }
                await refreshManaged();
                if (adopt.message) setText(els.managedRuntime(), adopt.message);
                return { ok: true, message: adopt.message || '已复用本机 CUDA 运行库' };
            });
        });
        els.managedRuntimeBackendSelect()?.addEventListener('change', () => {
            void withAction(runtimeStatusEl(), async () => {
                const select = els.managedRuntimeBackendSelect();
                const runtimeId = String(select?.value || '').trim();
                if (!runtimeId) return { ok: false, error: '请选择运行时后端' };
                const runtime = managedSnapshot?.runtime || {};
                const prevId = String(
                    managedSnapshot?.managedLlm?.runtimeId
                    || runtime.preferredPackageId
                    || '',
                ).trim();
                const choice = (runtime.choices || [])
                    .find((c) => c.id === runtimeId);
                const prevChoice = (runtime.choices || [])
                    .find((c) => c.id === prevId);
                const installedId = String(runtime.installedPackageId || '').trim();
                const targetAlreadyInstalled = !!(
                    installedId
                    && installedId === runtimeId
                    && runtime.available
                );

                // 目标后端已在本机安装：只改偏好，无需确认、无需再下
                if (targetAlreadyInstalled) {
                    if (runtimeId === prevId) {
                        return { ok: true, message: `已是「${choice?.label || runtimeId}」` };
                    }
                    const setRes = await electron.transubAdvancedManagedLlmSetRuntime?.({ runtimeId });
                    if (!setRes?.ok) {
                        if (prevId && select) select.value = prevId;
                        return setRes || { ok: false, error: '切换失败' };
                    }
                    if (setRes.managed) applyManagedStatus(setRes.managed);
                    else await refreshManaged();
                    return {
                        ok: true,
                        message: `已切换为「${choice?.label || runtimeId}」`,
                        managed: setRes.managed || managedSnapshot || undefined,
                    };
                }

                const sizeHint = choice?.sizeHint ? `\n体积约 ${choice.sizeHint}。` : '';
                const cudaNote = (choice?.backend === 'cuda' || /^win-cuda\d+-x64$/i.test(runtimeId))
                    ? '\n需较新的 NVIDIA 驱动；失败时可改回 Vulkan 或改用手动下载。'
                    : '';
                const confirmed = await askConfirm({
                    title: '切换 llama-server 后端',
                    message: `确定从「${prevChoice?.label || prevId || '当前'}」切换为「${choice?.label || runtimeId}」吗？\n\n确认后将自动安装/更新运行时；若目标后端已就绪则跳过下载。${sizeHint}${cudaNote}`,
                    primaryLabel: '确认切换',
                    secondaryLabel: '取消',
                });
                if (!confirmed) {
                    if (prevId && select) select.value = prevId;
                    return { ok: true, message: '已取消切换' };
                }
                const installed = await electron.transubAdvancedManagedLlmInstallRuntime?.({
                    force: true,
                    runtimeId,
                });
                if (installed?.ok) {
                    if (installed.managed) applyManagedStatus(installed.managed);
                    return {
                        ok: true,
                        message: installed.message || (installed.already
                            ? '运行时已就绪，无需重复下载'
                            : '运行时安装完成'),
                    };
                }
                // 自动安装失败：保留新偏好，引导手动下载
                try {
                    await electron.transubAdvancedManagedLlmSetRuntime?.({ runtimeId });
                } catch (_) { /* ignore */ }
                const wentManual = await offerManualRuntimeAfterFailure(
                    installed?.error || '运行时安装失败',
                );
                if (wentManual) {
                    await refreshManaged();
                    return { ok: true, message: '请按手动下载流程完成安装' };
                }
                if (prevId && select) select.value = prevId;
                try {
                    await electron.transubAdvancedManagedLlmSetRuntime?.({ runtimeId: prevId });
                    await refreshManaged();
                } catch (_) { /* ignore */ }
                return installed || { ok: false, error: '运行时安装失败' };
            });
        });
        document.getElementById('advancedManagedStopServerBtn')?.addEventListener('click', () => {
            void withAction(runtimeStatusEl(), async () => {
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
            void withAction(runtimeStatusEl(), async () => {
                setText(runtimeStatusEl(), '性能测试进行中（首次可能较慢）…');
                const res = await electron.transubAdvancedManagedLlmPerfTest?.({});
                if (res?.ok) {
                    if (res.managed) applyManagedStatus(res.managed);
                    const lines = [
                        String(res.message || '性能测试完成').trim(),
                        res.tokensPerSec != null ? `吞吐：${res.tokensPerSec} tok/s` : '',
                        res.loadMs != null ? `启动：${Math.round(Number(res.loadMs) || 0)} ms` : '',
                        res.sample ? `样例：${res.sample}` : '',
                    ].filter(Boolean);
                    const detail = lines.join('\n');
                    await askConfirm({
                        title: '性能测试结果',
                        message: detail,
                        primaryLabel: '确定',
                        hideSecondary: true,
                    });
                    return { ok: true, message: lines[0] || '性能测试完成', managed: res.managed };
                }
                const err = res?.error || '性能测试失败';
                await askConfirm({
                    title: '性能测试失败',
                    message: String(err),
                    primaryLabel: '确定',
                    hideSecondary: true,
                });
                return { ok: false, error: err };
            });
        });
        document.getElementById('advancedManagedCancelPullBtn')?.addEventListener('click', () => {
            void electron.transubAdvancedManagedLlmCancelPull?.();
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

        document.getElementById('tdpCheckBtn')?.addEventListener('click', () => {
            void withAction(els.tdpAction(), async () => {
                const res = await electron.transubTdpCheck?.();
                if (!res?.ok) return res || { ok: false, error: '检查失败' };
                lastTdpCheck = res;
                applyTdpStatus(res.local || {}, res);
                if (res.upToDate) return { ok: true, message: '已是最新' };
                if (res.updateAvailable) {
                    return {
                        ok: true,
                        message: `发现新版本 ${res.remote?.version || ''}${res.remote?.notes ? `：${res.remote.notes}` : ''}`.trim(),
                    };
                }
                return { ok: true, message: res.message || '检查完成' };
            });
        });

        document.getElementById('tdpUpdateBtn')?.addEventListener('click', () => {
            void withAction(els.tdpAction(), async () => {
                setTdpProgress({ phase: 'start', percent: 0 });
                const res = await electron.transubTdpPull?.();
                setTdpProgress(res?.ok ? { phase: 'done' } : { phase: 'error' });
                lastTdpCheck = null;
                await refreshTdp({ checkRemote: true });
                return res?.ok
                    ? { ok: true, message: res.message || '更新完成' }
                    : res || { ok: false, error: '更新失败' };
            });
        });

        document.getElementById('tdpCancelBtn')?.addEventListener('click', () => {
            void electron.transubTdpCancelPull?.();
        });

        if (!unsubManagedProgress && electron.onAdvancedManagedLlmProgress) {
            unsubManagedProgress = electron.onAdvancedManagedLlmProgress((p) => setPullProgress(p));
        }
        if (!unsubTdpProgress && electron.onTdpProgress) {
            unsubTdpProgress = electron.onTdpProgress((p) => setTdpProgress(p));
        }
        if (!unsubModelChanged && electron.onAdvancedLlmModelChanged) {
            unsubModelChanged = electron.onAdvancedLlmModelChanged(() => {
                void refreshManaged();
            });
        }

        document.querySelectorAll('.params-tab-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const tab = btn.getAttribute('data-tab');
                if (
                    tab === 'install'
                    || tab === 'pro'
                    || tab === 'pro-llm'
                    || tab === 'pro-smart-translate'
                    || tab === 'pro-film-audio'
                    || tab === 'pro-qc-smart'
                    || tab === 'pro-reconstruct'
                ) {
                    void refresh();
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
