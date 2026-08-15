/**
 * Advanced 软件内模型选择窗口（独立窗口 UI）
 */
(function () {
    'use strict';

    const electron = globalThis.__ELECTRON__;
    if (!electron?.transubAdvancedManagedLlmStatus) return;

    /** @type {object|null} */
    let managed = null;
    let familyFilter = 'all';
    let scaleFilter = 'all';
    let searchQuery = '';
    let busy = false;

    const SCALE_CHIPS = [
        { id: 'all', label: '全部规格' },
        { id: 'light', label: '轻量 ≤7B' },
        { id: 'mid', label: '中等 8–16B' },
        { id: 'large', label: '大型 ≥17B' },
    ];

    const els = {
        search: () => document.getElementById('pickSearch'),
        filters: () => document.getElementById('pickFilters'),
        scaleFilters: () => document.getElementById('pickScaleFilters'),
        proHint: () => document.getElementById('pickProHint'),
        subtitle: () => document.getElementById('pickSubtitle'),
        count: () => document.getElementById('pickCount'),
        list: () => document.getElementById('pickList'),
        status: () => document.getElementById('pickStatus'),
        refresh: () => document.getElementById('pickRefreshBtn'),
        close: () => document.getElementById('pickCloseBtn'),
    };

    function setStatus(text, kind = '') {
        const el = els.status();
        if (!el) return;
        el.textContent = text || '';
        el.classList.remove('is-ok', 'is-err');
        if (kind) el.classList.add(`is-${kind}`);
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

    function collectFamilies(items) {
        const map = new Map();
        for (const item of items) {
            const id = String(item.family || 'other');
            if (map.has(id)) continue;
            map.set(id, item.familyLabel || id);
        }
        return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
    }

    function filteredItems() {
        const items = Array.isArray(managed?.catalog) ? managed.catalog.slice() : [];
        items.sort((a, b) => {
            if (!!b.recommended !== !!a.recommended) return b.recommended ? 1 : -1;
            if (!!b.active !== !!a.active) return b.active ? 1 : -1;
            if (!!b.installed !== !!a.installed) return b.installed ? 1 : -1;
            const ba = Number(a.paramBillion) || 0;
            const bb = Number(b.paramBillion) || 0;
            if (ba !== bb) return ba - bb;
            return String(a.name || '').localeCompare(String(b.name || ''), 'zh');
        });
        const q = searchQuery.trim().toLowerCase();
        const entitled = !!managed?.entitled;
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
                item.name,
                item.fileName,
                item.id,
                item.family,
                item.familyLabel,
                item.note,
                item.ollamaTag,
            ].map((x) => String(x || '').toLowerCase()).join(' ');
            return hay.includes(q);
        });
    }

    function renderFilters() {
        const host = els.filters();
        if (!host) return;
        const families = collectFamilies(managed?.catalog || []);
        const chips = [
            { id: 'all', label: '全部' },
            ...families,
            { id: 'installed', label: '已下载' },
        ];
        host.innerHTML = chips.map((c) => {
            const on = familyFilter === c.id ? ' is-on' : '';
            return `<button type="button" class="chip${on}" data-family="${escapeHtml(c.id)}">${escapeHtml(c.label)}</button>`;
        }).join('');

        const scaleHost = els.scaleFilters();
        const entitled = !!managed?.entitled;
        if (scaleHost) {
            scaleHost.hidden = !entitled;
            if (entitled) {
                scaleHost.innerHTML = SCALE_CHIPS.map((c) => {
                    const on = scaleFilter === c.id ? ' is-on' : '';
                    return `<button type="button" class="chip is-pro${on}" data-scale="${escapeHtml(c.id)}">${escapeHtml(c.label)}</button>`;
                }).join('');
            } else {
                scaleHost.innerHTML = '';
                scaleFilter = 'all';
            }
        }

        const hint = els.proHint();
        if (hint) {
            const full = Number(managed?.catalogFullCount) || 0;
            const visible = Number(managed?.catalogVisibleCount) || (managed?.catalog?.length || 0);
            if (!entitled && full > visible) {
                hint.hidden = false;
                hint.innerHTML = `当前显示轻量档 <strong>${visible}</strong> 个模型。解锁 <strong>Pro</strong> 后可浏览全部 <strong>${full}</strong> 个规格（含 8B–72B 与推理专用）。`;
            } else if (entitled) {
                hint.hidden = false;
                hint.innerHTML = `Pro 已解锁 · 目录 <strong>${visible}</strong> 个模型，可按规格筛选轻量 / 中等 / 大型。`;
            } else {
                hint.hidden = true;
                hint.textContent = '';
            }
        }

        const sub = els.subtitle();
        if (sub) {
            sub.textContent = entitled
                ? 'Pro：下载各规格推理模型，由 Transub 自带 llama-server 推理'
                : '未解锁 Pro：可浏览轻量模型；智能翻译 / 更大规格需开通 Pro';
        }
    }

    function renderList() {
        const list = els.list();
        if (!list) return;
        const items = filteredItems();
        if (els.count()) {
            const total = managed?.catalog?.length || 0;
            const full = Number(managed?.catalogFullCount) || total;
            if (items.length === total && total === full) {
                els.count().textContent = `共 ${total} 个模型`;
            } else if (items.length === total && full > total) {
                els.count().textContent = `显示 ${total} / 全目录 ${full}`;
            } else {
                els.count().textContent = `显示 ${items.length} / ${total}`;
            }
        }
        if (!items.length) {
            list.innerHTML = '<div class="empty">没有匹配的模型</div>';
            return;
        }
        list.innerHTML = items.map((item) => {
            const badges = [];
            if (item.recommended) badges.push('<span class="badge is-rec">推荐</span>');
            if (item.translateOnly) badges.push('<span class="badge is-warn">仅译中</span>');
            else if (item.freePipelineTranslate) badges.push('<span class="badge is-free">轻量</span>');
            if (item.proScale) badges.push('<span class="badge is-pro">Pro</span>');
            if (item.installed) badges.push('<span class="badge is-ok">已下载</span>');
            if (item.active) badges.push('<span class="badge is-use">使用中</span>');
            if (item.ramTight) badges.push('<span class="badge is-warn">内存紧张</span>');
            if (item.familyLabel) badges.push(`<span class="badge">${escapeHtml(item.familyLabel)}</span>`);
            const activeClass = item.active ? ' is-active' : '';
            const ramClass = item.ramTight ? ' is-ram-tight' : '';
            const scaleLabel = item.paramBillion ? `${item.paramBillion}B` : '';
            return `
                <article class="card${activeClass}${ramClass}" data-model-id="${escapeHtml(item.id)}">
                    <div class="card-top">
                        <div>
                            <div class="card-title">${escapeHtml(item.name)}${scaleLabel ? ` <span class="card-sub">· ${escapeHtml(scaleLabel)}</span>` : ''}</div>
                            <div class="card-sub">${escapeHtml(item.fileName || item.id)} · ${escapeHtml(item.sizeHint || '')} · ${escapeHtml(item.ramHint || '')}</div>
                        </div>
                        <div class="badges">${badges.join('')}</div>
                    </div>
                    <p class="card-note">${escapeHtml(item.note || '')}</p>
                    <div class="card-actions">
                        <button type="button" class="btn btn-primary" data-action="select" data-model-id="${escapeHtml(item.id)}" ${busy ? 'disabled' : ''}>
                            ${item.active ? '已选用' : '选用'}
                        </button>
                        <button type="button" class="btn" data-action="pull" data-model-id="${escapeHtml(item.id)}" ${busy ? 'disabled' : ''}>
                            ${item.installed ? '重新下载' : '下载'}
                        </button>
                    </div>
                </article>
            `;
        }).join('');
    }

    function render() {
        renderFilters();
        renderList();
    }

    async function refresh() {
        setStatus('读取模型状态…');
        try {
            const res = await electron.transubAdvancedManagedLlmStatus();
            if (!res?.ok) {
                setStatus(res?.error || '无法读取状态', 'err');
                return;
            }
            managed = res.managed || null;
            const systemMemoryGb = Number(managed?.systemMemoryGb) || 0;
            if (Array.isArray(managed?.catalog)) {
                managed.catalog = managed.catalog.map((item) => ({
                    ...item,
                    ramTight: isRamTightForModel(item, systemMemoryGb),
                }));
            }
            render();
            const active = managed?.activeModel?.name || managed?.activeModelId || '';
            const memHint = systemMemoryGb ? ` · 系统内存约 ${systemMemoryGb} GB` : '';
            setStatus(active ? `当前选用：${active}${memHint}` : `尚未选用模型${memHint}`, active ? 'ok' : '');
        } catch (err) {
            setStatus(err.message || '读取失败', 'err');
        }
    }

    async function selectModel(modelId) {
        if (!modelId || busy) return;
        const item = (managed?.catalog || []).find((m) => m.id === modelId);
        if (item?.translateOnly || String(item?.family || '').toLowerCase() === 'sakura') {
            const ok = window.confirm(
                `「${item.name || modelId}」是日→中翻译专用模型。\n\n`
                + '可用于「推理翻译」（Sakura 行对齐），但不能用作智能翻译，也无法做语境/影片理解重构。\n'
                + '智能翻译请改选 Qwen2.5 Instruct 等通用对话模型。\n\n'
                + '仍要设为 LLM 推理模型吗？',
            );
            if (!ok) return;
        }
        busy = true;
        renderList();
        setStatus('正在选用…');
        try {
            const res = await electron.transubAdvancedManagedLlmSelect({ modelId });
            if (res?.ok) {
                managed = res.managed || managed;
                render();
                const warn = item?.translateOnly
                    ? '（仅译中：语境/影片理解请另选通用模型）'
                    : '';
                setStatus(`${res.message || '已选用'}${warn}`, item?.translateOnly ? '' : 'ok');
            } else {
                setStatus(res?.error || '选用失败', 'err');
            }
        } catch (err) {
            setStatus(err.message || '选用失败', 'err');
        } finally {
            busy = false;
            renderList();
        }
    }

    async function downloadModel(modelId) {
        if (!modelId || busy) return;
        busy = true;
        setStatus('正在下载模型…');
        renderList();
        try {
            const res = await electron.transubAdvancedManagedLlmPull?.({ modelId });
            if (res?.ok) {
                setStatus(res.message || '模型下载完成', 'ok');
                await refresh();
            } else if (res?.cancelled) {
                setStatus(res.error || '已取消下载', 'warn');
            } else {
                setStatus(res?.error || '模型下载失败', 'err');
            }
        } catch (err) {
            setStatus(err.message || '模型下载失败', 'err');
        } finally {
            busy = false;
            renderList();
        }
    }

    function bind() {
        els.search()?.addEventListener('input', (ev) => {
            searchQuery = String(ev.target?.value || '');
            renderList();
        });
        els.filters()?.addEventListener('click', (ev) => {
            const btn = ev.target?.closest?.('[data-family]');
            if (!btn) return;
            familyFilter = btn.getAttribute('data-family') || 'all';
            render();
        });
        els.scaleFilters()?.addEventListener('click', (ev) => {
            const btn = ev.target?.closest?.('[data-scale]');
            if (!btn) return;
            scaleFilter = btn.getAttribute('data-scale') || 'all';
            render();
        });
        els.list()?.addEventListener('click', (ev) => {
            const btn = ev.target?.closest?.('[data-action]');
            if (!btn) return;
            const action = btn.getAttribute('data-action');
            const modelId = btn.getAttribute('data-model-id');
            if (action === 'select') void selectModel(modelId);
            if (action === 'pull') void downloadModel(modelId);
        });
        els.refresh()?.addEventListener('click', () => { void refresh(); });
        els.close()?.addEventListener('click', () => window.close());

        electron.onAdvancedLlmPickRefresh?.((payload) => {
            if (payload?.reason === 'focus') void refresh();
        });
        electron.onAdvancedLlmModelChanged?.(() => { void refresh(); });
        electron.onAdvancedManagedLlmProgress?.((info) => {
            if (info?.phase === 'done' || info?.phase === 'cancelled') void refresh();
        });
    }

    bind();
    void refresh();
}());
