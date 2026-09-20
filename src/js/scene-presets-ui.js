/**
 * Scene presets UI — Dock workspace (shelf-like cards + editable detail).
 */
(function (global) {
    const core = global.TransubScenePresetsCore || {};
    const electron = global.__ELECTRON__;

    const FILTER_KEY = 'transub.scenes.filter';
    const SECONDARY_KEY = 'transub.scenes.secondaryFilter';
    const DETAIL_WIDTH_KEY = 'transub.scenes.detailWidth';

    const state = {
        presets: [],
        selectedId: '',
        activeId: '',
        query: '',
        filter: core.FILTER_ALL || 'all',
        secondary: core.SECONDARY_BUILTIN || 'builtin',
        detailWidth: core.DEFAULT_DETAIL_WIDTH || 420,
        bound: false,
        splitterBound: false,
        proEntitled: false,
        draftDirty: false,
        draftMeta: { name: '', description: '', group: 'talk' },
        draftOptions: null,
    };

    function $(id) {
        return document.getElementById(id);
    }

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function uiTx(s) {
        try {
            if (typeof global.TransubUiTx === 'function') return global.TransubUiTx(s);
            if (global.TransubI18n?.tx) return global.TransubI18n.tx(s);
        } catch { /* ignore */ }
        return String(s || '');
    }

    function uiTf(tpl, vars) {
        try {
            if (typeof global.TransubUiTf === 'function') return global.TransubUiTf(tpl, vars);
            if (global.TransubI18n?.tf) return global.TransubI18n.tf(tpl, vars);
        } catch { /* ignore */ }
        return String(tpl || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (_, k) => (
            vars && Object.prototype.hasOwnProperty.call(vars, k) && vars[k] != null
                ? String(vars[k])
                : `{${k}}`
        ));
    }

    function readStored(key, fallback) {
        try {
            const v = localStorage.getItem(key);
            return v == null || v === '' ? fallback : v;
        } catch {
            return fallback;
        }
    }

    function writeStored(key, value) {
        try {
            localStorage.setItem(key, String(value));
        } catch { /* ignore */ }
    }

    function setStatusLine(text) {
        const el = $('scenesStatusLine');
        if (el) el.textContent = text || '';
    }

    function setDetailStatus(text, tone = '') {
        const el = $('paramsPresetStatus');
        if (!el) return;
        el.textContent = text || '';
        el.dataset.tone = tone || '';
        const base = 'scenes-preset-status text-xs min-h-[1rem]';
        if (tone === 'ok') el.className = `${base} text-emerald-600`;
        else if (tone === 'err') el.className = `${base} text-red-600`;
        else if (tone === 'warn') el.className = `${base} text-amber-700`;
        else el.className = `${base} text-gray-500`;
    }

    function filteredList() {
        if (typeof core.filterPresets === 'function') {
            return core.filterPresets(state.presets, state.filter, state.secondary, state.query);
        }
        return state.presets.slice();
    }

    function findPreset(id) {
        const want = String(id || '').trim();
        return state.presets.find((p) => p?.id === want) || null;
    }

    function readActivePresetId() {
        const sel = $('presetSelect');
        return String(sel?.value || state.activeId || '').trim();
    }

    function isProEntitled() {
        if (typeof global.TransubCore?.isAdvancedEntitled === 'function') {
            return !!global.TransubCore.isAdvancedEntitled();
        }
        return !!state.proEntitled;
    }

    async function refreshProEntitled() {
        try {
            const st = await electron?.transubAdvancedGetStatus?.();
            state.proEntitled = !!(st?.entitled || st?.status?.entitled || st?.devUnlock);
        } catch {
            state.proEntitled = false;
        }
        if (typeof global.TransubCore?.isAdvancedEntitled === 'function') {
            state.proEntitled = !!global.TransubCore.isAdvancedEntitled() || state.proEntitled;
        }
        return state.proEntitled;
    }

    function promptPro(label) {
        if (typeof global.promptProUnlockRequired === 'function') {
            try { void global.promptProUnlockRequired({ featureLabel: label || '自定义场景预设' }); } catch { /* ignore */ }
        }
    }

    async function ensureProForCustom(label) {
        await refreshProEntitled();
        if (isProEntitled()) return { ok: true };
        promptPro(label || '自定义场景预设');
        setDetailStatus(uiTx('自定义场景预设需要 Pro'), 'warn');
        return { ok: false, needPro: true };
    }

    function syncFilterCounts() {
        const counts = typeof core.countByGroup === 'function'
            ? core.countByGroup(state.presets)
            : { all: state.presets.length };
        const set = (id, n) => {
            const el = $(id);
            if (el) el.textContent = String(n || 0);
        };
        set('scenesTabAllCount', counts.all || 0);
        document.querySelectorAll('[data-scenes-filter-count]').forEach((el) => {
            const g = el.getAttribute('data-scenes-filter-count');
            el.textContent = String(counts[g] || 0);
        });
        const sec = typeof core.countSecondary === 'function'
            ? core.countSecondary(state.presets, state.filter)
            : { builtin: counts.all || 0, custom: 0 };
        set('scenesSecBuiltinCount', sec.builtin || 0);
        set('scenesSecCustomCount', sec.custom || 0);
    }

    function syncFilterTabsUi() {
        document.querySelectorAll('[data-scenes-filter]').forEach((btn) => {
            const on = btn.getAttribute('data-scenes-filter') === state.filter;
            btn.classList.toggle('is-active', on);
            btn.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        document.querySelectorAll('[data-scenes-secondary]').forEach((btn) => {
            const on = btn.getAttribute('data-scenes-secondary') === state.secondary;
            btn.classList.toggle('is-on', on);
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    }

    function ensureGroupTabs() {
        const host = $('scenesFilterTabs');
        if (!host || typeof core.orderedGroupKeys !== 'function') return;
        const tools = host.querySelector('.shelf-tabs-tools');
        const keys = core.orderedGroupKeys(state.presets);
        host.querySelectorAll('[data-scenes-filter]:not([data-scenes-filter="all"])').forEach((el) => el.remove());
        for (const g of keys) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.setAttribute('role', 'tab');
            btn.className = 'factory-task-tab';
            btn.setAttribute('data-scenes-filter', g);
            btn.setAttribute('aria-selected', 'false');
            const label = typeof core.groupLabel === 'function' ? core.groupLabel(g) : g;
            btn.innerHTML = `${escapeHtml(uiTx(label))}<span class="factory-task-tab-count" data-scenes-filter-count="${escapeHtml(g)}">0</span>`;
            if (tools) host.insertBefore(btn, tools);
            else host.appendChild(btn);
        }
        if (state.filter !== 'all' && !keys.includes(state.filter)) {
            state.filter = 'all';
            writeStored(FILTER_KEY, state.filter);
        }
    }

    function applyDetailWidth(width) {
        const body = $('scenesBody');
        const detail = $('scenesDetail');
        const hostW = body?.clientWidth || 0;
        const next = typeof core.clampDetailWidth === 'function'
            ? core.clampDetailWidth(width, hostW)
            : Math.max(280, Number(width) || 420);
        state.detailWidth = next;
        if (detail) detail.style.setProperty('--shelf-detail-width', `${next}px`);
        return next;
    }

    function persistDetailWidth(width) {
        const next = applyDetailWidth(width);
        writeStored(DETAIL_WIDTH_KEY, String(next));
    }

    function bindSplitter() {
        if (state.splitterBound) return;
        const body = $('scenesBody');
        const splitter = $('scenesDetailSplitter');
        if (!body || !splitter) return;
        state.splitterBound = true;
        let dragging = false;
        let startX = 0;
        let startW = 0;

        const onMove = (ev) => {
            if (!dragging) return;
            const dx = startX - (ev.clientX || 0);
            persistDetailWidth(startW + dx);
        };
        const onUp = () => {
            if (!dragging) return;
            dragging = false;
            body.classList.remove('is-splitting');
            splitter.classList.remove('is-dragging');
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
        splitter.addEventListener('pointerdown', (ev) => {
            if (ev.button != null && ev.button !== 0) return;
            dragging = true;
            startX = ev.clientX || 0;
            startW = state.detailWidth;
            body.classList.add('is-splitting');
            splitter.classList.add('is-dragging');
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
            try { splitter.setPointerCapture?.(ev.pointerId); } catch { /* ignore */ }
        });
        splitter.addEventListener('keydown', (ev) => {
            if (ev.key === 'ArrowLeft') {
                ev.preventDefault();
                persistDetailWidth(state.detailWidth + 16);
            } else if (ev.key === 'ArrowRight') {
                ev.preventDefault();
                persistDetailWidth(state.detailWidth - 16);
            }
        });
    }

    function setPresetSelectValue(id, { dispatch = true } = {}) {
        const sel = $('presetSelect');
        if (!sel) return false;
        const want = String(id || '').trim();
        const has = [...sel.options].some((o) => o.value === want);
        if (want && !has) return false;
        if (sel.value === want) {
            if (dispatch && want) sel.dispatchEvent(new Event('change'));
            return true;
        }
        sel.dataset.prevPresetId = sel.value || '';
        sel.value = want;
        if (dispatch) sel.dispatchEvent(new Event('change'));
        return true;
    }

    function resetDraftFromPreset(preset) {
        const p = preset || null;
        state.draftDirty = false;
        state.draftMeta = {
            name: String(p?.name || '').trim(),
            description: String(p?.description || p?.sceneBlurb || '').trim(),
            group: (typeof core.groupOf === 'function' ? core.groupOf(p) : (p?.group || 'talk')) || 'talk',
        };
        state.draftOptions = typeof core.sanitizePresetOptions === 'function'
            ? core.sanitizePresetOptions(p?.options || {})
            : { ...(p?.options || {}) };
    }

    function collectModelOptions(kind, currentValue) {
        const selId = kind === 'vad' ? 'engineVadModelSelect' : 'engineAsrModelSelect';
        const sel = $(selId);
        const seen = new Set();
        const rows = [];
        const push = (value, label) => {
            const v = String(value || '').trim();
            if (!v || seen.has(v)) return;
            seen.add(v);
            rows.push({ value: v, label: String(label || v).trim() || v });
        };
        if (sel) {
            [...sel.options].forEach((o) => {
                if (!o.value) return;
                push(o.value, o.textContent);
            });
        }
        push(currentValue, currentValue);
        return rows;
    }

    function readDraftFieldValuesFromDom() {
        const host = $('scenesDetailBody');
        if (!host) return {};
        const values = {};
        host.querySelectorAll('[data-scenes-opt]').forEach((el) => {
            const key = el.getAttribute('data-scenes-opt');
            if (!key) return;
            if (el.type === 'checkbox') values[key] = !!el.checked;
            else values[key] = el.value;
        });
        return values;
    }

    function readDraftMetaFromDom() {
        const host = $('scenesDetailBody');
        if (!host) return { ...state.draftMeta };
        const name = host.querySelector('[data-scenes-meta="name"]')?.value;
        const description = host.querySelector('[data-scenes-meta="description"]')?.value;
        const group = host.querySelector('[data-scenes-meta="group"]')?.value;
        return {
            name: name != null ? String(name) : state.draftMeta.name,
            description: description != null ? String(description) : state.draftMeta.description,
            group: group != null ? String(group) : state.draftMeta.group,
        };
    }

    function syncDraftFromDom() {
        const preset = findPreset(state.selectedId);
        if (!preset || preset.builtin) return state.draftOptions;
        state.draftMeta = readDraftMetaFromDom();
        const base = state.draftOptions || preset.options || {};
        state.draftOptions = typeof core.mergeEditableOptions === 'function'
            ? core.mergeEditableOptions(base, readDraftFieldValuesFromDom())
            : { ...base, ...readDraftFieldValuesFromDom() };
        return state.draftOptions;
    }

    function markDraftDirty() {
        const preset = findPreset(state.selectedId);
        if (!preset || preset.builtin || !isProEntitled()) return;
        state.draftDirty = true;
        const saveBtn = $('scenesDetailBody')?.querySelector('[data-scenes-act="save"]');
        if (saveBtn) saveBtn.disabled = false;
        const dirty = $('scenesDetailBody')?.querySelector('[data-scenes-dirty]');
        if (dirty) dirty.hidden = false;
    }

    function renderOptionField(field, options, { editable }) {
        const value = typeof core.optionFieldValue === 'function'
            ? core.optionFieldValue(options, field)
            : (options?.[field.key] ?? '');
        const disabled = editable ? '' : ' disabled';
        const id = `scenesOpt_${field.key}`;
        if (field.type === 'checkbox') {
            return `
                <label class="scenes-opt-check">
                    <input type="checkbox" id="${id}" data-scenes-opt="${escapeHtml(field.key)}" ${value ? 'checked' : ''}${disabled}>
                    <span>${escapeHtml(uiTx(field.label))}</span>
                </label>`;
        }
        let control = '';
        if (field.type === 'select' || field.type === 'model-select') {
            const choices = field.type === 'model-select'
                ? collectModelOptions(field.modelKind, value)
                : (field.options || []);
            const optsHtml = choices.map((o) => {
                const v = String(o.value ?? '');
                const selected = String(value) === v ? ' selected' : '';
                return `<option value="${escapeHtml(v)}"${selected}>${escapeHtml(uiTx(o.label || v))}</option>`;
            }).join('');
            const extra = value && !choices.some((o) => String(o.value) === String(value))
                ? `<option value="${escapeHtml(String(value))}" selected>${escapeHtml(String(value))}</option>`
                : '';
            control = `<select id="${id}" class="scenes-opt-input" data-scenes-opt="${escapeHtml(field.key)}"${disabled}>${extra}${optsHtml}</select>`;
        } else if (field.type === 'number') {
            const attrs = [
                field.min != null ? `min="${field.min}"` : '',
                field.max != null ? `max="${field.max}"` : '',
                field.step != null ? `step="${field.step}"` : '',
                field.emptyOk ? 'placeholder="留空 = 关闭"' : '',
            ].filter(Boolean).join(' ');
            control = `<input type="number" id="${id}" class="scenes-opt-input" data-scenes-opt="${escapeHtml(field.key)}" value="${escapeHtml(value === '' || value == null ? '' : String(value))}" ${attrs}${disabled}>`;
        } else {
            control = `<input type="text" id="${id}" class="scenes-opt-input" data-scenes-opt="${escapeHtml(field.key)}" value="${escapeHtml(String(value ?? ''))}"${disabled}>`;
        }
        return `
            <label class="scenes-opt-field">
                <span class="scenes-opt-label">${escapeHtml(uiTx(field.label))}</span>
                ${control}
            </label>`;
    }

    function renderOptionsEditor(options, { editable }) {
        const fields = core.EDITABLE_OPTION_FIELDS || [];
        const checks = fields.filter((f) => f.type === 'checkbox');
        const others = fields.filter((f) => f.type !== 'checkbox');
        return `
            <div class="scenes-opt-editor ${editable ? 'is-editable' : 'is-readonly'}">
                <div class="scenes-opt-grid">
                    ${others.map((f) => renderOptionField(f, options, { editable })).join('')}
                </div>
                <div class="scenes-opt-checks">
                    ${checks.map((f) => renderOptionField(f, options, { editable })).join('')}
                </div>
            </div>`;
    }

    function renderMetaEditor(preset, { editable }) {
        if (!editable) {
            const desc = String(preset.description || preset.sceneBlurb || '').trim();
            return `<p class="scenes-detail-desc">${escapeHtml(desc || uiTx('暂无说明'))}</p>`;
        }
        const groups = (core.GROUP_ORDER || ['talk']).map((g) => {
            const selected = state.draftMeta.group === g ? ' selected' : '';
            const label = typeof core.groupLabel === 'function' ? core.groupLabel(g) : g;
            return `<option value="${escapeHtml(g)}"${selected}>${escapeHtml(uiTx(label))}</option>`;
        }).join('');
        return `
            <div class="scenes-meta-editor">
                <label class="scenes-opt-field">
                    <span class="scenes-opt-label">${escapeHtml(uiTx('名称'))}</span>
                    <input type="text" class="scenes-opt-input" data-scenes-meta="name" maxlength="64" value="${escapeHtml(state.draftMeta.name)}">
                </label>
                <label class="scenes-opt-field">
                    <span class="scenes-opt-label">${escapeHtml(uiTx('分组'))}</span>
                    <select class="scenes-opt-input" data-scenes-meta="group">${groups}</select>
                </label>
                <label class="scenes-opt-field scenes-opt-field-span">
                    <span class="scenes-opt-label">${escapeHtml(uiTx('说明'))}</span>
                    <textarea class="scenes-opt-input scenes-opt-textarea" data-scenes-meta="description" rows="2" maxlength="240">${escapeHtml(state.draftMeta.description)}</textarea>
                </label>
            </div>`;
    }

    function syncManageToolsUi() {
        const pro = isProEntitled();
        const selected = findPreset(state.selectedId);
        const custom = !!(selected && !selected.builtin);
        // Keep 新建/复制/导入 clickable so non-Pro users still get the unlock prompt.
        const setBtn = (id, enabled, title) => {
            const btn = $(id);
            if (!btn) return;
            btn.disabled = !enabled;
            if (title) btn.title = title;
        };
        setBtn(
            'savePresetBtn',
            true,
            pro ? uiTx('将当前识别参数保存为自定义预设（Pro）') : uiTx('自定义场景预设需要 Pro'),
        );
        setBtn(
            'copyPresetBtn',
            true,
            !selected
                ? uiTx('请先选择要复制的预设')
                : (pro ? uiTx('从选中预设复制为自定义（Pro）') : uiTx('自定义场景预设需要 Pro')),
        );
        setBtn(
            'importPresetBtn',
            true,
            pro ? uiTx('导入预设文件（Pro）') : uiTx('导入自定义预设需要 Pro'),
        );
        setBtn(
            'deletePresetBtn',
            pro && custom,
            !pro
                ? uiTx('自定义场景预设需要 Pro')
                : (!selected
                    ? uiTx('请先选择要删除的自定义预设')
                    : (custom ? uiTx('删除自定义预设（Pro）') : uiTx('内置预设不能删除'))),
        );
        const emptySave = $('scenesEmptySaveBtn');
        if (emptySave) emptySave.disabled = false;
    }

    function selectPreset(id, { apply = true } = {}) {
        const next = String(id || '').trim();
        state.selectedId = next;
        const preset = findPreset(next);
        resetDraftFromPreset(preset);
        if (apply && next) {
            setPresetSelectValue(next, { dispatch: true });
            state.activeId = next;
        }
        renderList();
        renderDetail();
        syncManageToolsUi();
    }

    function renderList() {
        const host = $('scenesCardList');
        const empty = $('scenesEmptyState');
        const body = $('scenesBody');
        if (!host) return;
        const items = filteredList();
        const hasAny = state.presets.length > 0;
        empty?.classList.toggle('hidden', hasAny);
        if (!items.length) {
            host.innerHTML = hasAny
                ? `<div class="shelf-detail-empty">${escapeHtml(uiTx('当前筛选无预设'))}</div>`
                : '';
        } else {
            const activeId = readActivePresetId();
            host.innerHTML = items.map((p) => {
                const id = String(p.id || '');
                const selected = id === state.selectedId;
                const applied = id === activeId;
                const title = typeof core.displayTitle === 'function' ? core.displayTitle(p) : (p.name || id);
                const blurb = typeof core.displayBlurb === 'function' ? core.displayBlurb(p) : (p.description || '');
                const group = typeof core.groupOf === 'function' ? core.groupOf(p) : (p.group || '');
                const cls = [
                    'shelf-card',
                    selected ? 'is-active' : '',
                    applied ? 'has-translation' : '',
                ].filter(Boolean).join(' ');
                const side = applied
                    ? escapeHtml(uiTx('使用中'))
                    : (p.builtin ? escapeHtml(uiTx('内置')) : escapeHtml(uiTx('自定义')));
                return `
                    <button type="button" class="${cls}" data-id="${escapeHtml(id)}" aria-selected="${selected ? 'true' : 'false'}">
                        <span class="shelf-card-stripe" aria-hidden="true"></span>
                        <span class="shelf-card-main">
                            <div class="shelf-card-title">${escapeHtml(title)}</div>
                            <div class="shelf-card-meta">
                                <span class="shelf-chip">${escapeHtml(uiTx(typeof core.groupLabel === 'function' ? core.groupLabel(group) : group))}</span>
                                ${blurb ? `<span class="shelf-meta">${escapeHtml(blurb)}</span>` : ''}
                            </div>
                        </span>
                        <span class="shelf-card-side">${side}</span>
                    </button>`;
            }).join('');
            host.querySelectorAll('.shelf-card').forEach((btn) => {
                btn.addEventListener('click', () => {
                    selectPreset(btn.getAttribute('data-id') || '', { apply: false });
                });
            });
        }

        const showDetail = !!state.selectedId || !!readActivePresetId();
        body?.classList.toggle('is-detail-open', showDetail);
        const n = items.length;
        const activeName = (() => {
            const p = findPreset(readActivePresetId());
            if (!p) return '';
            return typeof core.displayTitle === 'function' ? core.displayTitle(p) : (p.name || p.id);
        })();
        setStatusLine(activeName
            ? uiTf('{count} 项 · 当前：{name}', { count: n, name: activeName })
            : uiTf('{count} 项场景预设', { count: n }));
    }

    function renderDetail() {
        const host = $('scenesDetailBody');
        const detail = $('scenesDetail');
        if (!host || !detail) return;
        const id = state.selectedId || readActivePresetId();
        const preset = findPreset(id);
        if (!preset) {
            detail.setAttribute('data-empty', 'true');
            host.innerHTML = `<div class="shelf-detail-empty">${escapeHtml(uiTx('选择左侧场景查看说明并应用。'))}</div>`;
            syncManageToolsUi();
            return;
        }
        if (state.selectedId !== preset.id) state.selectedId = preset.id;
        if (!state.draftDirty) {
            resetDraftFromPreset(preset);
        } else if (!state.draftOptions) {
            resetDraftFromPreset(preset);
        }

        detail.setAttribute('data-empty', 'false');
        const title = typeof core.displayTitle === 'function' ? core.displayTitle(preset) : (preset.name || preset.id);
        const group = typeof core.groupOf === 'function' ? core.groupOf(preset) : (preset.group || '');
        const applied = readActivePresetId() === preset.id;
        const builtin = !!preset.builtin;
        const pro = isProEntitled();
        const editable = !builtin && pro;
        const options = state.draftOptions || preset.options || {};

        const readonlyHint = builtin
            ? `<p class="scenes-readonly-hint">${escapeHtml(uiTx('内置预设不可编辑或删除。可复制为自定义预设后调整。'))}</p>`
            : (!pro
                ? `<p class="scenes-readonly-hint">${escapeHtml(uiTx('编辑与保存自定义预设需要 Pro。'))}</p>`
                : '');

        host.innerHTML = `
            <div class="shelf-detail-head">
                <div class="min-w-0 flex-1">
                    <p class="shelf-detail-title" title="${escapeHtml(title)}">${escapeHtml(title)}${
                        applied ? ` <span class="shelf-flag" style="color:var(--fx-accent)">${escapeHtml(uiTx('使用中'))}</span>` : ''
                    }${state.draftDirty ? ` <span class="shelf-flag" data-scenes-dirty style="color:var(--fx-warn,#b45309)">${escapeHtml(uiTx('未保存'))}</span>` : ' <span data-scenes-dirty hidden></span>'}</p>
                    <div class="shelf-card-meta mt-1">
                        <span class="shelf-chip">${escapeHtml(uiTx(typeof core.groupLabel === 'function' ? core.groupLabel(group) : group))}</span>
                        ${builtin
                            ? `<span class="shelf-meta">${escapeHtml(uiTx('内置预设'))}</span>`
                            : `<span class="shelf-meta">${escapeHtml(uiTx('自定义预设'))}</span>`}
                    </div>
                </div>
            </div>
            <div class="scenes-detail-scroll">
                ${readonlyHint}
                ${renderMetaEditor(preset, { editable })}
                ${renderOptionsEditor(options, { editable })}
            </div>
            <div class="shelf-slot-toolbar scenes-detail-toolbar">
                <button type="button" class="factory-empty-primary" data-scenes-act="apply" ${applied && !state.draftDirty ? 'disabled' : ''}>
                    <i class="fa fa-check mr-1" aria-hidden="true"></i>${escapeHtml(applied && !state.draftDirty ? uiTx('已应用') : uiTx('应用此预设'))}
                </button>
                ${editable ? `
                <button type="button" class="factory-empty-secondary" data-scenes-act="save" ${state.draftDirty ? '' : 'disabled'}>
                    <i class="fa fa-save mr-1" aria-hidden="true"></i>${escapeHtml(uiTx('保存修改'))}
                </button>` : ''}
                <button type="button" class="factory-empty-secondary" data-scenes-act="copy" title="${escapeHtml(uiTx('复制为自定义预设（Pro）'))}">
                    <i class="fa fa-copy mr-1" aria-hidden="true"></i>${escapeHtml(uiTx('复制'))}<span class="settings-adv-mark ml-1" aria-hidden="true">◆</span>
                </button>
                ${editable ? `
                <button type="button" class="factory-empty-secondary scenes-btn-danger" data-scenes-act="delete">
                    <i class="fa fa-trash mr-1" aria-hidden="true"></i>${escapeHtml(uiTx('删除'))}
                </button>` : ''}
            </div>`;

        host.querySelector('[data-scenes-act="apply"]')?.addEventListener('click', () => {
            void applyCurrentDetail();
        });
        host.querySelector('[data-scenes-act="save"]')?.addEventListener('click', () => {
            void saveCurrentDetail();
        });
        host.querySelector('[data-scenes-act="copy"]')?.addEventListener('click', () => {
            void copyCurrentDetail();
        });
        host.querySelector('[data-scenes-act="delete"]')?.addEventListener('click', () => {
            void deleteCurrentDetail();
        });
        if (editable) {
            host.querySelectorAll('[data-scenes-opt], [data-scenes-meta]').forEach((el) => {
                el.addEventListener('input', () => markDraftDirty());
                el.addEventListener('change', () => markDraftDirty());
            });
        }
        syncManageToolsUi();
    }

    async function applyCurrentDetail() {
        const preset = findPreset(state.selectedId);
        if (!preset) return;
        if (!preset.builtin && isProEntitled()) syncDraftFromDom();
        const options = (!preset.builtin && state.draftOptions)
            ? state.draftOptions
            : preset.options;
        const features = global.TransubFeatures;
        if (typeof features?.applyPresetOptions === 'function') {
            const ok = await features.applyPresetOptions(options, {
                presetId: preset.id,
                persist: false,
            });
            if (ok === false) {
                setDetailStatus(uiTx('应用失败'), 'err');
                return;
            }
        } else {
            selectPreset(preset.id, { apply: true });
        }
        state.activeId = preset.id;
        const sel = $('presetSelect');
        if (sel) {
            const has = [...sel.options].some((o) => o.value === preset.id);
            if (has) sel.value = preset.id;
        }
        setDetailStatus(uiTf('已应用「{name}」', { name: preset.name || preset.id }), 'ok');
        renderList();
        renderDetail();
    }

    async function saveCurrentDetail() {
        const gate = await ensureProForCustom('保存自定义场景预设');
        if (!gate.ok) return;
        const preset = findPreset(state.selectedId);
        if (!preset || preset.builtin) {
            setDetailStatus(uiTx('内置预设不能编辑'), 'warn');
            return;
        }
        syncDraftFromDom();
        const name = String(state.draftMeta.name || '').trim();
        if (!name) {
            setDetailStatus(uiTx('请输入预设名称'), 'warn');
            return;
        }
        const features = global.TransubFeatures;
        if (typeof features?.saveCustomPresetPayload !== 'function') {
            setDetailStatus(uiTx('保存模块未就绪'), 'err');
            return;
        }
        const res = await features.saveCustomPresetPayload({
            id: preset.id,
            name,
            description: state.draftMeta.description,
            group: state.draftMeta.group,
            options: state.draftOptions,
        });
        if (res?.ok) {
            state.draftDirty = false;
            setDetailStatus(uiTf('已保存「{name}」', { name }), 'ok');
            if (res.preset?.id) state.selectedId = res.preset.id;
        } else {
            setDetailStatus(res?.error || uiTx('保存失败'), 'err');
        }
    }

    async function copyCurrentDetail() {
        const gate = await ensureProForCustom('复制场景预设');
        if (!gate.ok) return;
        const preset = findPreset(state.selectedId);
        if (!preset) {
            setDetailStatus(uiTx('请先选择要复制的预设'), 'warn');
            return;
        }
        if (!preset.builtin && isProEntitled()) syncDraftFromDom();
        const clone = typeof core.buildCustomClone === 'function'
            ? core.buildCustomClone(preset, {
                options: (!preset.builtin && state.draftOptions) ? state.draftOptions : preset.options,
                name: typeof core.defaultCopyName === 'function'
                    ? core.defaultCopyName(preset.name)
                    : `${preset.name || '预设'} 副本`,
                description: state.draftMeta.description || preset.description || '',
                group: state.draftMeta.group || preset.group || 'talk',
            })
            : {
                name: `${preset.name || '预设'} 副本`,
                options: preset.options || {},
                group: 'talk',
            };
        if (typeof global.TransubFeatures?.openSavePresetModal !== 'function') {
            setDetailStatus(uiTx('保存模块未就绪'), 'err');
            return;
        }
        global.TransubFeatures.openSavePresetModal({
            mode: 'copy',
            payload: clone,
        });
    }

    async function deleteCurrentDetail() {
        const gate = await ensureProForCustom('删除自定义场景预设');
        if (!gate.ok) return;
        const preset = findPreset(state.selectedId);
        if (!preset || preset.builtin) {
            setDetailStatus(uiTx('内置预设不能删除'), 'warn');
            return;
        }
        await global.TransubFeatures?.deletePresetById?.(preset.id, preset.name);
    }

    function syncActiveFromSelect() {
        state.activeId = readActivePresetId();
        if (!state.selectedId && state.activeId) {
            state.selectedId = state.activeId;
            resetDraftFromPreset(findPreset(state.selectedId));
        }
        renderList();
        renderDetail();
        syncManageToolsUi();
    }

    function setPresets(presets) {
        state.presets = Array.isArray(presets) ? presets.filter((p) => p?.id) : [];
        ensureGroupTabs();
        syncFilterCounts();
        syncFilterTabsUi();
        const active = readActivePresetId();
        state.activeId = active;
        if (active && state.presets.some((p) => p.id === active)) {
            if (!state.selectedId) {
                state.selectedId = active;
                resetDraftFromPreset(findPreset(active));
            }
        } else if (state.selectedId && !state.presets.some((p) => p.id === state.selectedId)) {
            state.selectedId = '';
            state.draftOptions = null;
            state.draftDirty = false;
        } else if (state.selectedId) {
            const p = findPreset(state.selectedId);
            if (p && !state.draftDirty) resetDraftFromPreset(p);
        }
        renderList();
        renderDetail();
        syncManageToolsUi();
    }

    function onPresetsLoaded(presets) {
        setPresets(presets);
    }

    function refreshFromDomSelect() {
        syncActiveFromSelect();
    }

    function bind() {
        if (state.bound) return;
        // Defer until workspace fragment is injected.
        if (!$('scenesFilterTabs') || !$('scenesCardList')) return;
        state.bound = true;
        state.filter = typeof core.normalizeFilter === 'function'
            ? core.normalizeFilter(readStored(FILTER_KEY, core.FILTER_ALL || 'all'))
            : (readStored(FILTER_KEY, 'all') || 'all');
        state.secondary = typeof core.normalizeSecondary === 'function'
            ? core.normalizeSecondary(readStored(SECONDARY_KEY, core.SECONDARY_BUILTIN || 'builtin'))
            : (readStored(SECONDARY_KEY, 'builtin') || 'builtin');
        writeStored(FILTER_KEY, state.filter);
        writeStored(SECONDARY_KEY, state.secondary);
        const storedW = Number(readStored(DETAIL_WIDTH_KEY, String(core.DEFAULT_DETAIL_WIDTH || 420)));
        applyDetailWidth(storedW);
        bindSplitter();
        void refreshProEntitled().then(() => syncManageToolsUi());

        $('scenesFilterTabs')?.addEventListener('click', (ev) => {
            const btn = ev.target?.closest?.('[data-scenes-filter]');
            if (!btn) return;
            const next = btn.getAttribute('data-scenes-filter') || 'all';
            if (next === state.filter) return;
            state.filter = next;
            writeStored(FILTER_KEY, state.filter);
            syncFilterTabsUi();
            syncFilterCounts();
            renderList();
        });
        $('scenesSecondaryFilters')?.addEventListener('click', (ev) => {
            const btn = ev.target?.closest?.('[data-scenes-secondary]');
            if (!btn) return;
            const next = typeof core.normalizeSecondary === 'function'
                ? core.normalizeSecondary(btn.getAttribute('data-scenes-secondary'))
                : (btn.getAttribute('data-scenes-secondary') || 'builtin');
            if (next === state.secondary) return;
            state.secondary = next;
            writeStored(SECONDARY_KEY, state.secondary);
            syncFilterTabsUi();
            renderList();
        });
        $('scenesSearch')?.addEventListener('input', (ev) => {
            state.query = String(ev.target?.value || '');
            renderList();
        });
        $('scenesRefreshBtn')?.addEventListener('click', () => {
            void global.TransubFeatures?.loadPresets?.();
            void refreshProEntitled().then(() => {
                renderDetail();
                syncManageToolsUi();
            });
        });
        $('scenesEmptySaveBtn')?.addEventListener('click', () => {
            void beginCreateFromCurrent();
        });
        // Toolbar「复制」is wired in features.js (opens name modal). Detail「复制」uses copyCurrentDetail.

        $('presetSelect')?.addEventListener('change', () => {
            syncActiveFromSelect();
        });
    }

    async function beginCreateFromCurrent() {
        const gate = await ensureProForCustom('新建自定义场景预设');
        if (!gate.ok) return;
        const options = typeof global.TransubFeatures?.optionsForSavePreset === 'function'
            && typeof global.TransubCore?.buildSavedOptionsFromForm === 'function'
            ? global.TransubFeatures.optionsForSavePreset(global.TransubCore.buildSavedOptionsFromForm())
            : (typeof core.sanitizePresetOptions === 'function'
                ? core.sanitizePresetOptions(global.TransubCore?.buildSavedOptionsFromForm?.() || {})
                : {});
        global.TransubFeatures?.openSavePresetModal?.({
            mode: 'create',
            payload: {
                name: '',
                description: '',
                group: 'talk',
                options,
            },
        });
    }

    function onWorkspaceShow(opts = {}) {
        bind();
        void refreshProEntitled().then(() => {
            ensureGroupTabs();
            syncFilterCounts();
            syncFilterTabsUi();
            syncManageToolsUi();
            const focusId = String(opts.presetId || opts.focusId || '').trim();
            if (focusId) {
                state.selectedId = focusId;
                resetDraftFromPreset(findPreset(focusId));
                if (opts.apply !== false) selectPreset(focusId, { apply: true });
                else {
                    renderList();
                    renderDetail();
                }
            } else {
                syncActiveFromSelect();
            }
            if (!state.presets.length) {
                void global.TransubFeatures?.loadPresets?.();
            }
        });
    }

    function onWorkspaceHide() {
        /* keep draft in memory */
    }

    function onProEntitlementChanged() {
        void refreshProEntitled().then(() => {
            renderDetail();
            syncManageToolsUi();
        });
    }

    global.TransubScenePresetsUi = {
        bind,
        setPresets,
        onPresetsLoaded,
        refreshFromDomSelect,
        syncActiveFromSelect,
        onWorkspaceShow,
        onWorkspaceHide,
        selectPreset,
        beginCreateFromCurrent,
        onProEntitlementChanged,
        getSelectedPresetId: () => state.selectedId,
        getState: () => ({ ...state, presets: state.presets.slice(), draftOptions: state.draftOptions ? { ...state.draftOptions } : null }),
    };
}(typeof globalThis !== 'undefined' ? globalThis : window));
