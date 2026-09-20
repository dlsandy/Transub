/**
 * Transub 扩展功能模块
 */
(function (global) {
    const electron = global.__ELECTRON__;
    const core = () => global.TransubCore;

    function uiTf(template, vars) {
        const api = global.TransubI18n;
        if (api?.tf) return api.tf(template, vars);
        if (typeof global.TransubUiTf === 'function') return global.TransubUiTf(template, vars);
        return String(template || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (_, name) => (
            vars && Object.prototype.hasOwnProperty.call(vars, name) && vars[name] != null
                ? String(vars[name])
                : `{${name}}`
        ));
    }
    function uiTx(text) {
        return global.TransubI18n?.tx?.(text) ?? String(text || '');
    }

    function bindListenerOnce(el, type, handler, flag) {
        if (!el || typeof el.addEventListener !== 'function') return;
        const key = flag || 'featBound';
        if (el.dataset[key] === '1') return;
        el.dataset[key] = '1';
        el.addEventListener(type, handler);
    }
    function bindClickOnce(id, handler) {
        bindListenerOnce(document.getElementById(id), 'click', handler, 'featClickBound');
    }
    function bindChangeOnce(id, handler) {
        bindListenerOnce(document.getElementById(id), 'change', handler, 'featChangeBound');
    }

    async function appConfirmMsg(message, options = {}) {
        const fn = global.TransubAppConfirm;
        if (fn) return fn({ message, ...options });
        return window.confirm(message);
    }

    function appAlert(message) {
        global.TransubMainUiUx?.showToast?.(message, 'err', { duration: 8000 })
            || window.alert(message);
    }

    function scrollMainLogPanel(panel) {
        const api = global.TransubLogAutoScroll;
        const check = document.getElementById('logAutoScrollCheck');
        if (api?.scrollPanel) {
            api.scrollPanel(panel, check);
            return;
        }
        if (panel) panel.scrollTop = panel.scrollHeight;
    }

    function getInferLogRenderer(host) {
        const api = global.TransubLogPanelRender;
        if (!api?.getOrCreate || !host) return null;
        return api.getOrCreate(host, {
            maxLines: 100,
            lineClass: 'infer-log-line',
            onAfterFlush(h, meta) {
                if (!meta?.live) return;
                const panel = h.closest?.('.log-panel') || h;
                scrollMainLogPanel(panel);
            },
        });
    }

    function appendInferLog(line, tone) {
        const host = document.getElementById('inferLogHost');
        if (!host) return;
        const renderer = getInferLogRenderer(host);
        if (renderer) {
            renderer.append(line, { tone });
            return;
        }
        const placeholder = host.textContent || '';
        if (
            placeholder.includes('引擎日志将显示在此处')
            || placeholder.includes('TransWithAI日志将显示在此处')
            || placeholder.includes('infer 日志将显示在此处')
            || placeholder.includes('Transub Engine 日志将显示在此处')
        ) {
            host.textContent = '';
        }
        const row = document.createElement('div');
        const colors = {
            ok: 'text-emerald-700',
            warn: 'text-amber-700',
            err: 'text-red-700',
            info: 'text-gray-600',
        };
        row.className = `infer-log-line ${colors[tone] || colors.info}`;
        row.textContent = line;
        host.appendChild(row);
        while (host.childElementCount > 100) host.firstChild?.remove();
        const panel = host.closest('.log-panel') || host;
        scrollMainLogPanel(panel);
    }

    function activateLogTab(tab) {
        const want = tab === 'infer' ? 'infer' : 'app';
        document.querySelectorAll('.log-tab-btn').forEach((b) => {
            b.classList.toggle('active', b.dataset.logTab === want);
        });
        document.querySelectorAll('.log-panel').forEach((p) => {
            const active = p.id === (want === 'infer' ? 'logPanelInfer' : 'logPanelApp');
            p.classList.toggle('active', active);
            if (active) {
                const host = p.querySelector?.('#inferLogHost, #logHost') || p.firstElementChild;
                global.TransubLogPanelRender?.flushHost?.(host, true);
                scrollMainLogPanel(p);
            }
        });
    }

    async function openEngineRawLog() {
        const res = await electron?.transubEngineOpenLatestLog?.();
        if (res?.ok === false) {
            core()?.appendLog(res?.error || '打开引擎日志失败', 'err');
            return;
        }
        if (res?.path) core()?.appendLog(`已打开引擎日志：${res.path}`, 'info');
    }

    function bindLogTabs() {
        document.querySelectorAll('.log-tab-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                activateLogTab(btn.dataset.logTab);
            });
        });
    }

    /** @type {object[]} */
    let presetsCache = [];

    function getPresets() {
        return presetsCache.slice();
    }

    async function loadPresets() {
        const res = await electron?.transWithAiGetPresets?.();
        if (!res?.ok) return;
        const presets = Array.isArray(res.presets) ? res.presets : [];
        presetsCache = presets.slice();
        // presetSelect lives in deferred workspace-scenes fragment — still fill the
        // models-menu recognition list so「手动预设」works before opening 场景.
        const sel = document.getElementById('presetSelect');
        if (sel) {
            const current = sel.value;
            sel.innerHTML = '<option value="">— 选择预设 —</option>';
            const coreApi = global.TransubScenePresetsCore;
            const groupOrder = (coreApi && coreApi.GROUP_ORDER)
                ? coreApi.GROUP_ORDER
                : ['ja', 'ko', 'western', 'zh', 'talk', 'other'];
            const buckets = new Map();
            for (const p of presets) {
                if (!p?.id) continue;
                const group = typeof coreApi?.groupOf === 'function'
                    ? coreApi.groupOf(p)
                    : (String(p.group || (p.builtin ? 'other' : 'talk')).trim() || (p.builtin ? 'other' : 'talk'));
                if (!buckets.has(group)) buckets.set(group, []);
                buckets.get(group).push(p);
            }
            const orderedGroups = [
                ...groupOrder.filter((g) => buckets.has(g)),
                ...[...buckets.keys()].filter((g) => !groupOrder.includes(g)),
            ];
            for (const group of orderedGroups) {
                const rows = buckets.get(group) || [];
                const og = document.createElement('optgroup');
                const label = typeof coreApi?.groupLabel === 'function'
                    ? coreApi.groupLabel(group)
                    : group;
                og.label = uiTx(label);
                for (const p of rows) {
                    const opt = document.createElement('option');
                    opt.value = p.id;
                    opt.textContent = p.name + (p.builtin ? uiTx('（内置）') : '');
                    if (p.builtin) opt.dataset.builtin = '1';
                    const desc = String(p.description || '').trim();
                    if (desc) {
                        opt.title = desc;
                        opt.dataset.description = desc;
                    }
                    og.appendChild(opt);
                }
                sel.appendChild(og);
            }
            if (current && [...sel.options].some((o) => o.value === current)) {
                sel.value = current;
            }
            // Options may load after applyOptionsToForm stashed activePresetId.
            core()?.flushPendingActivePresetId?.();
            syncPresetSelectDescription();
        }
        core()?.rebuildParamsModePresetItems?.(presets, { preferActiveGroup: true });
        global.TransubScenePresetsUi?.onPresetsLoaded?.(presets);
        core()?.syncParamsModeChipUi?.();
    }

    function syncPresetSelectDescription() {
        const sel = document.getElementById('presetSelect');
        const status = document.getElementById('paramsPresetStatus');
        if (!sel || !status) return;
        // Keep error/success messages from import/export until the next selection change.
        if (status.dataset.tone === 'err' || status.dataset.tone === 'ok') return;
        const opt = sel.selectedOptions?.[0];
        const desc = String(opt?.dataset?.description || opt?.title || '').trim();
        if (sel.value && desc) {
            status.textContent = desc;
            status.className = 'scenes-preset-status text-xs text-gray-500 min-h-[1rem]';
            status.dataset.tone = 'info';
        } else if (!sel.value) {
            status.textContent = '';
            status.dataset.tone = '';
        }
    }

    /** Keys owned by task / MT chips — presets must not overwrite or persist them. */
    const PRESET_SKIP_KEYS = Object.freeze([
        'task',
        'translateMode',
        'engineMtModel',
        'engineLlmMtModel',
        'glossaryMtEnabled',
        'sakuraNsfwPrompt',
    ]);

    function optionsForApply(preset) {
        const raw = preset?.options && typeof preset.options === 'object' ? preset.options : {};
        const out = { ...raw };
        for (const key of PRESET_SKIP_KEYS) delete out[key];
        return out;
    }

    function optionsForSavePreset(fullOptions) {
        const out = fullOptions && typeof fullOptions === 'object' ? { ...fullOptions } : {};
        for (const key of PRESET_SKIP_KEYS) delete out[key];
        delete out.autoSense;
        return out;
    }

    /** @type {{ mode: string, payload: object|null }} */
    let pendingPresetSave = { mode: 'create', payload: null };

    async function ensureProForCustomPresets(label) {
        try {
            const st = await electron?.transubAdvancedGetStatus?.();
            if (st?.entitled || st?.status?.entitled || st?.devUnlock) return { ok: true };
        } catch { /* ignore */ }
        if (typeof core()?.isAdvancedEntitled === 'function' && core().isAdvancedEntitled()) {
            return { ok: true };
        }
        if (typeof global.promptProUnlockRequired === 'function') {
            try { void global.promptProUnlockRequired({ featureLabel: label || '自定义场景预设' }); } catch { /* ignore */ }
        }
        setPresetStatus(uiTx('自定义场景预设需要 Pro'), 'warn');
        return { ok: false, needPro: true };
    }

    async function applyPresetOptions(optionsPatch, { presetId = '', persist = false } = {}) {
        if (!core()?.applyOptionsToForm) return false;
        const patch = optionsForApply({ options: optionsPatch });
        const requiredIds = (typeof (global.TransubEngineMissingModels?.collectRequiredModelIdsFromOptions) === 'function')
            ? global.TransubEngineMissingModels.collectRequiredModelIdsFromOptions(patch)
            : [patch.engineAsrModel, patch.engineVadModel].map((id) => String(id || '').trim()).filter(Boolean);
        if (requiredIds.length && typeof core()?.ensureRequiredModelsReadyOrPrompt === 'function') {
            const ready = await core().ensureRequiredModelsReadyOrPrompt({
                modelIds: requiredIds,
                contextLabel: presetId
                    ? uiTf('预设「{name}」', { name: presetId })
                    : uiTx('场景预设'),
                settingsTab: 'install',
                settingsHint: uiTx('主界面 → 模型管理'),
            });
            if (!ready) return false;
        }
        const current = core().buildSavedOptionsFromForm();
        const next = { ...current, ...patch };
        if (presetId) next.activePresetId = presetId;
        await core().applyOptionsToForm(next);
        if (presetId) {
            core().applyActivePresetIdToSelect?.(presetId);
        }
        global.TransubScenePresetsUi?.refreshFromDomSelect?.();
        core().updateParamsSummary?.();
        core().syncParamsModeChipUi?.();
        core().syncTranslateChipUi?.();
        if (persist) {
            const opts = {
                ...core().buildSavedOptionsFromForm(),
                activePresetId: presetId || '',
                ...(patch.contentProfile ? { contentProfile: patch.contentProfile } : {}),
            };
            const saveRes = await electron?.transWithAiSaveOptions?.(opts);
            if (saveRes?.ok !== false) {
                core().setSavedOptionsSnapshot?.(opts);
                core().markSettingsDirty?.(false);
                return true;
            }
        }
        core().markSettingsDirty?.(true);
        return true;
    }

    async function saveCustomPresetPayload(payload = {}) {
        const gate = await ensureProForCustomPresets('保存自定义场景预设');
        if (!gate.ok) return gate;
        const name = String(payload.name || '').trim();
        if (!name) return { ok: false, error: uiTx('请输入预设名称') };
        try {
            const res = await electron?.transWithAiSavePreset?.({
                id: payload.id || undefined,
                name,
                description: String(payload.description || '').trim(),
                group: String(payload.group || 'talk').trim() || 'talk',
                options: optionsForSavePreset(payload.options || {}),
            });
            if (res?.ok) {
                await loadPresets();
                const sel = document.getElementById('presetSelect');
                if (sel && res.preset?.id) {
                    sel.value = res.preset.id;
                    global.TransubScenePresetsUi?.selectPreset?.(res.preset.id, { apply: false });
                }
                core()?.appendLog(`已保存预设：${name}`, 'ok');
                return res;
            }
            return { ok: false, error: res?.error || uiTx('保存失败') };
        } catch (err) {
            return { ok: false, error: err?.message || uiTx('保存失败') };
        }
    }

    function openPresetNameModal(opts = {}) {
        const modal = document.getElementById('presetNameModal');
        const input = document.getElementById('presetNameInput');
        const desc = document.getElementById('presetDescInput');
        const groupSel = document.getElementById('presetGroupSelect');
        const status = document.getElementById('presetNameStatus');
        const title = document.getElementById('presetNameModalTitle');
        if (!modal || !input) return;
        const mode = String(opts.mode || 'create').trim() || 'create';
        const payload = opts.payload && typeof opts.payload === 'object' ? { ...opts.payload } : null;
        pendingPresetSave = { mode, payload };
        if (title) {
            title.textContent = mode === 'copy' ? uiTx('复制为自定义预设') : uiTx('新建自定义预设');
        }
        if (status) {
            status.textContent = '';
            status.className = 'text-xs text-gray-500 min-h-[1rem]';
        }
        input.value = String(payload?.name || '').trim();
        if (desc) desc.value = String(payload?.description || '').trim();
        if (groupSel) {
            const coreApi = global.TransubScenePresetsCore;
            const raw = String(payload?.group || 'talk').trim() || 'talk';
            const g = typeof coreApi?.normalizeGroupKey === 'function'
                ? coreApi.normalizeGroupKey(raw, { builtin: false })
                : raw;
            if (![...groupSel.options].some((o) => o.value === g)) {
                const opt = document.createElement('option');
                opt.value = g;
                opt.textContent = typeof coreApi?.groupLabel === 'function'
                    ? uiTx(coreApi.groupLabel(g))
                    : g;
                groupSel.appendChild(opt);
            }
            groupSel.value = g;
        }
        modal.classList.remove('hidden');
        setTimeout(() => {
            input.focus();
            input.select?.();
        }, 0);
    }

    function closePresetNameModal() {
        document.getElementById('presetNameModal')?.classList.add('hidden');
        pendingPresetSave = { mode: 'create', payload: null };
    }

    async function confirmSavePreset() {
        const gate = await ensureProForCustomPresets('保存自定义场景预设');
        if (!gate.ok) return;
        const input = document.getElementById('presetNameInput');
        const desc = document.getElementById('presetDescInput');
        const groupSel = document.getElementById('presetGroupSelect');
        const status = document.getElementById('presetNameStatus');
        const confirmBtn = document.getElementById('presetNameConfirmBtn');
        const name = String(input?.value || '').trim();
        if (!name) {
            if (status) {
                status.textContent = uiTx('请输入预设名称');
                status.className = 'text-xs text-amber-600 min-h-[1rem]';
            }
            input?.focus();
            return;
        }
        const pending = pendingPresetSave.payload || {};
        let options = pending.options;
        if (!options || typeof options !== 'object') {
            if (!core()?.buildSavedOptionsFromForm) {
                if (status) {
                    status.textContent = uiTx('无法读取当前参数');
                    status.className = 'text-xs text-red-600 min-h-[1rem]';
                }
                return;
            }
            options = optionsForSavePreset(core().buildSavedOptionsFromForm());
        }
        if (confirmBtn) confirmBtn.disabled = true;
        if (status) {
            status.textContent = uiTx('保存中…');
            status.className = 'text-xs text-gray-400 min-h-[1rem]';
        }
        try {
            const res = await saveCustomPresetPayload({
                name,
                description: String(desc?.value || pending.description || '').trim(),
                group: String(groupSel?.value || pending.group || 'talk').trim() || 'talk',
                options,
            });
            if (res?.ok) {
                closePresetNameModal();
                setPresetStatus(uiTf('已保存预设：{name}', { name }), 'ok');
                const footer = document.getElementById('saveParamsStatus');
                if (footer) {
                    footer.textContent = uiTf('已保存预设：{name}', { name });
                    footer.className = 'text-xs text-emerald-600';
                }
            } else if (status) {
                status.textContent = res?.error || uiTx('保存失败');
                status.className = 'text-xs text-red-600 min-h-[1rem]';
            }
        } catch (err) {
            if (status) {
                status.textContent = err?.message || uiTx('保存失败');
                status.className = 'text-xs text-red-600 min-h-[1rem]';
            }
        } finally {
            if (confirmBtn) confirmBtn.disabled = false;
        }
    }

    function setPresetStatus(text, tone = '') {
        const el = document.getElementById('paramsPresetStatus');
        if (!el) return;
        el.textContent = text || '';
        el.dataset.tone = tone || '';
        const base = 'scenes-preset-status text-xs min-h-[1rem]';
        if (tone === 'ok') el.className = `${base} text-emerald-600`;
        else if (tone === 'err') el.className = `${base} text-red-600`;
        else if (tone === 'warn') el.className = `${base} text-amber-700`;
        else el.className = `${base} text-gray-500`;
    }

    async function deletePresetById(id, name) {
        const want = String(id || '').trim();
        if (!want) {
            setPresetStatus(uiTx('请先选择要删除的自定义预设'), 'warn');
            return { ok: false };
        }
        const gate = await ensureProForCustomPresets('删除自定义场景预设');
        if (!gate.ok) return gate;
        const list = await electron?.transWithAiGetPresets?.();
        const preset = (list?.presets || []).find((p) => p.id === want);
        if (preset?.builtin) {
            setPresetStatus(uiTx('内置预设不能删除'), 'warn');
            return { ok: false, error: 'builtin' };
        }
        const label = name || preset?.name || want;
        if (!(await appConfirmMsg(uiTf('确定删除预设「{name}」？', { name: label }), { title: uiTx('删除预设'), danger: true }))) {
            return { ok: false, canceled: true };
        }
        try {
            const res = await electron?.transWithAiDeletePreset?.({ id: want });
            if (res?.ok) {
                await loadPresets();
                setPresetStatus(uiTx('已删除预设'), 'ok');
                return res;
            }
            setPresetStatus(res?.error || uiTx('删除失败'), 'err');
            return { ok: false, error: res?.error };
        } catch (err) {
            setPresetStatus(err?.message || uiTx('删除失败'), 'err');
            return { ok: false, error: err?.message };
        }
    }

    async function deleteSelectedPreset() {
        const uiId = global.TransubScenePresetsUi?.getSelectedPresetId?.();
        const sel = document.getElementById('presetSelect');
        const id = String(uiId || sel?.value || '').trim();
        const opt = sel?.selectedOptions?.[0];
        return deletePresetById(id, opt?.textContent || '');
    }

    async function exportSelectedPreset() {
        const uiId = global.TransubScenePresetsUi?.getSelectedPresetId?.();
        const sel = document.getElementById('presetSelect');
        const id = String(uiId || sel?.value || '').trim();
        if (!id) {
            setPresetStatus(uiTx('请先选择要导出的预设'), 'warn');
            return;
        }
        try {
            const res = await electron?.transWithAiExportPreset?.({ id });
            if (res?.ok && !res.canceled) setPresetStatus(uiTf('已导出：{path}', { path: res.path || '' }), 'ok');
            else if (res?.canceled) setPresetStatus('');
            else setPresetStatus(res?.error || uiTx('导出失败'), 'err');
        } catch (err) {
            setPresetStatus(err?.message || uiTx('导出失败'), 'err');
        }
    }

    async function importPresetFile() {
        const gate = await ensureProForCustomPresets('导入自定义场景预设');
        if (!gate.ok) return;
        try {
            const res = await electron?.transWithAiImportPreset?.();
            if (res?.ok && !res.canceled) {
                await loadPresets();
                const sel = document.getElementById('presetSelect');
                if (sel && res.preset?.id) sel.value = res.preset.id;
                if (res.preset?.id) {
                    global.TransubScenePresetsUi?.selectPreset?.(res.preset.id, { apply: false });
                }
                setPresetStatus(uiTf('已导入预设：{name}', { name: res.preset?.name || '' }), 'ok');
            } else if (res?.canceled) {
                setPresetStatus('');
            } else {
                setPresetStatus(res?.error || uiTx('导入失败'), 'err');
            }
        } catch (err) {
            setPresetStatus(err?.message || uiTx('导入失败'), 'err');
        }
    }

    function bindPresets() {
        const saveBtn = document.getElementById('savePresetBtn');
        if (!saveBtn) return;
        if (saveBtn.dataset.presetsBound === '1') return;
        saveBtn.dataset.presetsBound = '1';
        document.getElementById('presetSelect')?.addEventListener('focus', (e) => {
            e.target.dataset.prevPresetId = e.target.value || '';
        });
        document.getElementById('presetSelect')?.addEventListener('change', (e) => {
            // Clear sticky ok/err so the description can show after picking another preset.
            const status = document.getElementById('paramsPresetStatus');
            if (status) status.dataset.tone = '';
            syncPresetSelectDescription();
            if (e.target.value) {
                const sel = e.target;
                const prev = String(sel.dataset.prevPresetId || '').trim();
                void applyPreset(sel.value).then((ok) => {
                    if (ok === false) {
                        sel.value = prev;
                        syncPresetSelectDescription();
                        return;
                    }
                    sel.dataset.prevPresetId = sel.value || '';
                });
            }
        });
        document.getElementById('savePresetBtn')?.addEventListener('click', () => {
            void (async () => {
                const gate = await ensureProForCustomPresets('新建自定义场景预设');
                if (!gate.ok) return;
                if (typeof global.TransubScenePresetsUi?.beginCreateFromCurrent === 'function') {
                    await global.TransubScenePresetsUi.beginCreateFromCurrent();
                    return;
                }
                openPresetNameModal({ mode: 'create' });
            })();
        });
        document.getElementById('copyPresetBtn')?.addEventListener('click', () => {
            void (async () => {
                const gate = await ensureProForCustomPresets('复制场景预设');
                if (!gate.ok) return;
                const id = String(global.TransubScenePresetsUi?.getSelectedPresetId?.() || document.getElementById('presetSelect')?.value || '').trim();
                if (!id) {
                    setPresetStatus(uiTx('请先选择要复制的预设'), 'warn');
                    return;
                }
                // Prefer UI path (uses draft options for custom presets).
                const ui = global.TransubScenePresetsUi;
                if (ui?.getState) {
                    const st = ui.getState();
                    const preset = (st.presets || []).find((p) => p?.id === id);
                    if (preset) {
                        const coreApi = global.TransubScenePresetsCore || {};
                        const clone = typeof coreApi.buildCustomClone === 'function'
                            ? coreApi.buildCustomClone(preset, {
                                options: (!preset.builtin && st.draftOptions) ? st.draftOptions : preset.options,
                            })
                            : {
                                name: `${preset.name || '预设'} 副本`,
                                options: preset.options || {},
                                group: preset.group || 'talk',
                                description: preset.description || '',
                            };
                        openPresetNameModal({ mode: 'copy', payload: clone });
                        return;
                    }
                }
                const list = await electron?.transWithAiGetPresets?.();
                const preset = (list?.presets || []).find((p) => p.id === id);
                if (!preset) {
                    setPresetStatus(uiTx('请先选择要复制的预设'), 'warn');
                    return;
                }
                const coreApi = global.TransubScenePresetsCore || {};
                const clone = typeof coreApi.buildCustomClone === 'function'
                    ? coreApi.buildCustomClone(preset)
                    : {
                        name: `${preset.name || '预设'} 副本`,
                        options: preset.options || {},
                        group: preset.group || 'talk',
                    };
                openPresetNameModal({ mode: 'copy', payload: clone });
            })();
        });
        document.getElementById('deletePresetBtn')?.addEventListener('click', () => {
            void deleteSelectedPreset();
        });
        document.getElementById('exportPresetBtn')?.addEventListener('click', () => {
            void exportSelectedPreset();
        });
        document.getElementById('importPresetBtn')?.addEventListener('click', () => {
            void importPresetFile();
        });
        document.getElementById('presetNameCancelBtn')?.addEventListener('click', closePresetNameModal);
        document.getElementById('presetNameConfirmBtn')?.addEventListener('click', () => {
            void confirmSavePreset();
        });
        document.getElementById('presetNameInput')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                void confirmSavePreset();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                closePresetNameModal();
            }
        });
        document.getElementById('presetNameModal')?.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) closePresetNameModal();
        });
    }

    async function applyPreset(presetId, { persist = false } = {}) {
        const res = await electron?.transWithAiGetPresets?.();
        const preset = res?.presets?.find((p) => p.id === presetId);
        if (!preset?.options || !core()?.applyOptionsToForm) return false;
        const patch = optionsForApply(preset);
        const requiredIds = (typeof (global.TransubEngineMissingModels?.collectRequiredModelIdsFromOptions) === 'function')
            ? global.TransubEngineMissingModels.collectRequiredModelIdsFromOptions(patch)
            : [patch.engineAsrModel, patch.engineVadModel].map((id) => String(id || '').trim()).filter(Boolean);
        if (requiredIds.length && typeof core()?.ensureRequiredModelsReadyOrPrompt === 'function') {
            const ready = await core().ensureRequiredModelsReadyOrPrompt({
                modelIds: requiredIds,
                contextLabel: uiTf('预设「{name}」', { name: preset.name || presetId }),
                settingsTab: 'install',
                settingsHint: uiTx('主界面 → 模型管理'),
            });
            if (!ready) return false;
        }
        const current = core().buildSavedOptionsFromForm();
        const next = { ...current, ...patch, activePresetId: presetId };
        await core().applyOptionsToForm(next);
        core().applyActivePresetIdToSelect?.(presetId);
        global.TransubScenePresetsUi?.refreshFromDomSelect?.();
        core().updateParamsSummary?.();
        core().syncParamsModeChipUi?.();
        core().syncTranslateChipUi?.();
        if (persist) {
            const opts = {
                ...core().buildSavedOptionsFromForm(),
                activePresetId: presetId,
                ...(patch.contentProfile
                    ? { contentProfile: patch.contentProfile }
                    : {}),
            };
            const saveRes = await electron?.transWithAiSaveOptions?.(opts);
            if (saveRes?.ok !== false) {
                core().setSavedOptionsSnapshot?.(opts);
                core().markSettingsDirty?.(false);
                core().setSaveParamsStatus?.(uiTf('已应用并保存预设「{name}」', { name: preset.name }), 'ok');
                core().appendLog(`已应用并保存预设：${preset.name}`, 'ok');
                core().syncParamsModeChipUi?.();
                return true;
            }
        }
        core().markSettingsDirty?.(true);
        core().setSaveParamsStatus?.(uiTf('已应用预设「{name}」，请点「保存设置」写入磁盘', { name: preset.name }), 'warn');
        core().appendLog(`已应用预设：${preset.name}（尚未保存）`, 'info');
        core().syncParamsModeChipUi?.();
        return true;
    }

    function syncOutputModeUi() {
        const mode = document.getElementById('outputModeSelect')?.value || 'same';
        const wrap = document.getElementById('outputDirWrap');
        wrap?.classList.toggle('hidden', mode !== 'custom');
    }

    async function scanFolder() {
        const res = await electron?.selectFolder?.({ title: '选择包含媒体文件的文件夹' });
        if (!res?.ok || res.canceled || !res.path) return;
        const scan = await electron?.transWithAiScanFolder?.({ folder: res.path, recursive: true });
        if (!scan?.ok) {
            core()?.appendLog(scan?.error || '扫描文件夹失败', 'err');
            return;
        }
        await core()?.addFiles(scan.files || []);
        core()?.appendLog(`从文件夹添加 ${scan.files?.length || 0} 个媒体文件`, 'info');
    }

    async function showInstallWizard() {
        // Legacy stub: GPU tip box was removed. Prefer the full setup wizard.
        if (global.TransubSetupWizard?.open) {
            return global.TransubSetupWizard.open({ force: false });
        }
    }

    function applySuggestedDevice() {
        const applyBtn = document.getElementById('applySuggestedDeviceBtn');
        const device = String(applyBtn?.dataset.device || '').trim();
        const sel = document.getElementById('deviceSelect');
        if (!device || !sel?.querySelector(`option[value="${device}"]`)) return;
        sel.value = device;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        core()?.appendLog(`已应用推荐设备：${sel.options[sel.selectedIndex]?.text || device}`, 'ok');
    }

    async function showSubtitlePreview(path) {
        const res = await electron?.transWithAiSubtitlePreview?.({ path });
        const modal = document.getElementById('previewModal');
        const content = document.getElementById('previewContent');
        if (!modal || !content) return;
        if (!res?.ok) {
            core()?.appendLog(res?.error || '预览失败', 'err');
            return;
        }
        content.textContent = res.preview + (res.truncated ? '\n\n…' : '');
        modal.classList.remove('hidden');
    }

    function bindModals() {
        const modal = document.getElementById('previewModal');
        if (!modal || modal.getAttribute('data-ui-fragment') === 'pending') return;
        if (modal.dataset.previewBound === '1') return;
        modal.dataset.previewBound = '1';
        document.getElementById('closePreviewBtn')?.addEventListener('click', () => {
            document.getElementById('previewModal')?.classList.add('hidden');
        });
        modal.addEventListener('click', (e) => {
            if (e.target.id === 'previewModal') e.currentTarget.classList.add('hidden');
        });
    }

    const OFFICIAL_SITE_URL = 'https://www.transub.cc/';
    const GITHUB_RELEASES_URL = 'https://github.com/dlsandy/Transub/releases';
    const GITCODE_RELEASES_URL = 'https://gitcode.com/AndyDai/Transub/releases';
    const AFDIAN_PURCHASE_URL = 'https://afdian.com/item/41fef1a28bf211f189e252540025c377';

    function moreStatusEl() {
        return document.getElementById('moreStatus');
    }

    function setMoreAfdianVisible(visible) {
        const btn = document.getElementById('openAfdianFromSettingsBtn');
        if (!btn) return;
        btn.hidden = !visible;
        btn.classList.toggle('hidden', !visible);
    }

    async function syncMoreAfdianVisibility() {
        try {
            const res = await electron?.transubAdvancedGetStatus?.();
            setMoreAfdianVisible(!(res?.ok && res.status?.entitled));
        } catch (_) {
            setMoreAfdianVisible(true);
        }
    }

    async function openExternalLink(url, okMessage) {
        const el = moreStatusEl();
        try {
            const res = await electron?.openExternal?.(url);
            if (res?.ok === false) {
                if (el) el.textContent = res?.error || uiTx('打开链接失败');
                return;
            }
            if (el) el.textContent = okMessage || uiTx('已在浏览器中打开');
        } catch (err) {
            if (el) el.textContent = err?.message || uiTx('打开链接失败');
        }
    }

    function formatDownloadBytes(bytes) {
        const n = Number(bytes);
        if (!Number.isFinite(n) || n < 0) return '';
        if (n < 1024) return `${Math.round(n)} B`;
        if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
        if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
        return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }

    function setUpdateDownloadProgressVisible(visible) {
        const host = document.getElementById('updateDownloadProgress');
        if (!host) return;
        host.classList.toggle('hidden', !visible);
        if (!visible) {
            const bar = document.getElementById('updateDownloadBar');
            const pctEl = document.getElementById('updateDownloadPercent');
            const detail = document.getElementById('updateDownloadDetail');
            if (bar) bar.style.width = '0%';
            if (pctEl) pctEl.textContent = '0%';
            if (detail) detail.textContent = '';
        }
    }

    function renderUpdateDownloadProgress(progress = {}, version = '') {
        const host = document.getElementById('updateDownloadProgress');
        if (!host) return;
        host.classList.remove('hidden');
        const percent = Math.max(0, Math.min(100, Number(progress.percent) || 0));
        const transferred = Number(progress.transferred) || 0;
        const total = Number(progress.total) || 0;
        const speed = Number(progress.bytesPerSecond) || 0;
        const label = document.getElementById('updateDownloadLabel');
        const pctEl = document.getElementById('updateDownloadPercent');
        const bar = document.getElementById('updateDownloadBar');
        const detail = document.getElementById('updateDownloadDetail');
        if (label) {
            label.textContent = version
                ? uiTf('正在下载 v{version}…', { version })
                : uiTx('正在下载更新…');
        }
        if (pctEl) pctEl.textContent = `${Math.round(percent)}%`;
        if (bar) bar.style.width = `${percent}%`;
        if (detail) {
            const parts = [];
            const done = formatDownloadBytes(transferred);
            const all = formatDownloadBytes(total);
            if (done && all) parts.push(`${done} / ${all}`);
            else if (done) parts.push(done);
            const rate = formatDownloadBytes(speed);
            if (rate) parts.push(`${rate}/s`);
            detail.textContent = parts.join(' · ');
        }
    }

    async function openAppUpdateWindow({ autoCheck = true } = {}) {
        if (electron?.transubOpenUpdateWindow) {
            return electron.transubOpenUpdateWindow({ autoCheck });
        }
        return null;
    }

    async function runCheckAppUpdate({ triggerBtn } = {}) {
        const opened = await openAppUpdateWindow({ autoCheck: true });
        if (opened?.ok) return;

        // Browser / non-Electron fallback: keep inline check in settings.
        const el = moreStatusEl();
        const btn = triggerBtn || document.getElementById('checkUpdateBtn');
        const toolbarBtn = document.getElementById('checkUpdateToolbarBtn');
        if (btn) btn.disabled = true;
        if (toolbarBtn) toolbarBtn.disabled = true;
        setUpdateDownloadProgressVisible(false);
        if (el) el.textContent = uiTx('正在检查更新…');
        let unsubProgress = null;
        try {
            const res = await electron?.transWithAiCheckAppUpdate?.();
            if (!res?.ok) {
                if (el) el.textContent = res?.error || uiTx('检查更新失败');
                return;
            }
            if (el) el.textContent = res.message || uiTf('当前版本 v{version}', { version: res.currentVersion });

            if (res.updateAvailable) {
                if (res.canAutoInstall && electron?.transubDownloadAppUpdate) {
                    const yes = await appConfirmMsg(
                        res.preservesEngineData || res.installKind === 'zip'
                            ? uiTf('发现新版本 v{version}。\n\n是否下载并在重启后安装？\n（优先增量更新；将保留已下载的模型、GPU/Demucs 支持库与 Advanced LLM）', { version: res.latestVersion })
                            : uiTf('发现新版本 v{version}。\n\nSetup/NSIS 已停更，是否打开发布页下载 zip 解压版？', { version: res.latestVersion }),
                        { title: uiTx('发现更新'), primaryLabel: uiTx('下载更新') },
                    );
                    if (yes) {
                        if (el) el.textContent = uiTf('正在下载 v{version}…', { version: res.latestVersion });
                        renderUpdateDownloadProgress({ percent: 0 }, res.latestVersion);
                        unsubProgress = electron.onAppUpdateDownloadProgress?.((progress) => {
                            renderUpdateDownloadProgress(progress, res.latestVersion);
                        });
                        const dl = await electron.transubDownloadAppUpdate({
                            version: res.latestVersion,
                        });
                        if (!dl?.ok) {
                            setUpdateDownloadProgressVisible(false);
                            if (el) el.textContent = dl?.error || uiTx('下载失败');
                            const open = await appConfirmMsg(uiTx('应用内下载失败，是否打开 GitHub Releases 手动下载？'), { title: uiTx('下载失败') });
                            if (open) {
                                await electron.transubOpenUpdatePage?.({
                                    url: res.downloadUrl || res.releasesUrl,
                                });
                            }
                            return;
                        }
                        renderUpdateDownloadProgress({ percent: 100 }, res.latestVersion);
                        const detail = document.getElementById('updateDownloadDetail');
                        const label = document.getElementById('updateDownloadLabel');
                        if (label) label.textContent = uiTf('v{version} 已下载完成', { version: res.latestVersion });
                        if (detail) detail.textContent = uiTx('可立即重启安装');
                        if (el) el.textContent = dl.message || uiTx('更新已下载');
                        const install = await appConfirmMsg(uiTx('更新已下载完成，是否立即重启安装？'), { title: uiTx('安装更新') });
                        if (install) {
                            await electron.transubQuitAndInstallUpdate?.();
                        }
                    }
                } else {
                    const open = await appConfirmMsg(
                        uiTf('发现新版本 v{version}。\n\n是否打开下载页面？', { version: res.latestVersion }),
                        { title: uiTx('发现更新') },
                    );
                    if (open) {
                        await electron?.transubOpenUpdatePage?.({
                            url: res.downloadUrl || res.releasesUrl,
                        });
                    }
                }
            }
        } catch (err) {
            setUpdateDownloadProgressVisible(false);
            if (el) el.textContent = err?.message || uiTx('检查更新失败');
        } finally {
            try { unsubProgress?.(); } catch { /* ignore */ }
            if (btn) btn.disabled = false;
            if (toolbarBtn) toolbarBtn.disabled = false;
        }
    }

    function bindMoreTab() {
        bindClickOnce('exportConfigBtn', async () => {
            const res = await electron?.transWithAiExportConfig?.();
            const el = moreStatusEl();
            if (res?.ok && !res.canceled && el) el.textContent = uiTf('已导出：{path}', { path: res.path });
            else if (res?.error && el) el.textContent = res.error;
        });
        bindClickOnce('importConfigBtn', async () => {
            const res = await electron?.transWithAiImportConfig?.();
            if (res?.ok && res.options) {
                core()?.applyOptionsToForm(res.options);
                core()?.markSettingsDirty?.(true);
                core()?.setSaveParamsStatus?.(uiTx('配置已导入到表单，请点「保存设置」写入磁盘'), 'warn');
                const el = moreStatusEl();
                if (el) el.textContent = uiTx('配置已导入到表单 — 请点底部「保存设置」');
            }
        });
        bindClickOnce('checkUpdateBtn', () => {
            void runCheckAppUpdate();
        });
        bindClickOnce('checkUpdateToolbarBtn', () => {
            void runCheckAppUpdate({
                triggerBtn: document.getElementById('checkUpdateToolbarBtn'),
            });
        });
        bindClickOnce('openWebsiteBtn', () => {
            void openExternalLink(OFFICIAL_SITE_URL, uiTx('已在浏览器中打开官方网站'));
        });
        bindClickOnce('openGithubReleasesBtn', () => {
            void openExternalLink(GITHUB_RELEASES_URL, uiTx('已在浏览器中打开 Github Releases'));
        });
        bindClickOnce('openGitcodeReleasesBtn', () => {
            void openExternalLink(GITCODE_RELEASES_URL, uiTx('已在浏览器中打开 GitCode Releases'));
        });
        bindClickOnce('openAfdianFromSettingsBtn', () => {
            void openExternalLink(AFDIAN_PURCHASE_URL, uiTx('已在浏览器中打开赞助页面'));
        });
        bindClickOnce('openAboutFromSettingsBtn', () => {
            void electron?.transubOpenAboutWindow?.();
        });
        bindClickOnce('openShelfBtn', () => {
            void openSubtitleShelf();
        });
        bindClickOnce('revealShelfRootBtn', () => {
            void revealShelfRoot();
        });
        void refreshShelfSettingsStatus();
        void syncMoreAfdianVisibility();
        bindClickOnce('resetSettingsBtn', async () => {
            const status = document.getElementById('resetSettingsStatus');
            if (!(await appConfirmMsg(uiTx('确定将设置重置为默认值？当前表单会被覆盖（仍需点「保存设置」才会写入磁盘）。'), { title: uiTx('重置设置'), danger: true }))) return;
            try {
                const list = await electron?.transWithAiGetPresets?.();
                const builtin = (list?.presets || []).find((p) => p.builtin && /默认|均衡|default/i.test(p.name || ''))
                    || (list?.presets || []).find((p) => p.builtin);
                if (builtin?.options) {
                    core()?.applyOptionsToForm?.(builtin.options);
                    core()?.markSettingsDirty?.(true);
                    core()?.setSaveParamsStatus?.(uiTf('已套用「{name}」，请点「保存设置」写入磁盘', { name: builtin.name }), 'warn');
                    if (status) status.textContent = uiTf('已套用内置预设「{name}」— 请点底部「保存设置」', { name: builtin.name });
                } else if (status) {
                    status.textContent = uiTx('未找到可用的内置默认预设');
                }
            } catch (err) {
                if (status) status.textContent = err?.message || uiTx('重置失败');
            }
        });
        bindClickOnce('openLatestLogBtn', async () => {
            const path = document.getElementById('installPathInput')?.value?.trim();
            const res = await electron?.transWithAiOpenLatestLog?.({ installPath: path });
            if (res?.ok === false) core()?.appendLog(res?.error || '打开日志失败', 'err');
        });
        bindClickOnce('openEngineRawLogBtn', () => {
            void openEngineRawLog();
        });
        bindClickOnce('engineOpenLogBtn', () => {
            void openEngineRawLog();
        });
        bindClickOnce('exportLogBtn', () => {
            exportActiveLogPanel();
        });
        void loadPresets();
    }

    function bindSettingsExtras() {
        bindMoreTab();
        syncOutputModeUi();
        bindChangeOnce('outputModeSelect', syncOutputModeUi);
        bindClickOnce('outputDirBrowseBtn', async () => {
            const res = await electron?.selectFolder?.({ title: '选择字幕输出目录' });
            if (res?.ok && res.path) {
                const input = document.getElementById('outputDirInput');
                if (input) input.value = res.path;
            }
        });
        bindClickOnce('applySuggestedDeviceBtn', applySuggestedDevice);
    }

    function exportActiveLogPanel() {
        const inferActive = document.getElementById('logPanelInfer')?.classList.contains('active');
        const host = inferActive
            ? document.getElementById('inferLogHost')
            : document.getElementById('logHost');
        const renderApi = global.TransubLogPanelRender;
        const buffered = host ? renderApi?.get?.(host)?.getText?.() : '';
        const text = String(buffered || host?.innerText || '').trim();
        const name = inferActive ? 'transub-engine-panel.log' : 'transub-app.log';
        try {
            const blob = new Blob([text ? `${text}\n` : ''], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = name;
            a.click();
            URL.revokeObjectURL(url);
            core()?.appendLog?.(inferActive ? '已导出完整引擎日志' : '已导出完整软件日志', 'ok');
        } catch (err) {
            core()?.appendLog?.(err?.message || '导出日志失败', 'err');
        }
    }

    

    function init() {
        if (!electron?.isDesktop) return;
        bindLogTabs();
        bindModals();
        bindSettingsExtras();
        bindPresets();
        loadPresets();
        electron.onTransWithAiInferLog?.((payload) => {
            if (payload?.line) appendInferLog(payload.line);
        });
        // Engine logs are also broadcast on transwithai-infer-log for this panel.
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-preview-sub]');
            if (!btn) return;
            e.preventDefault();
            showSubtitlePreview(btn.getAttribute('data-preview-sub'));
        });
        // 字幕编辑在独立窗口 subtitle-editor-launcher.js 中打开
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0));
    } else {
        setTimeout(init, 0);
    }

    global.addEventListener?.('transub-ui-fragment-ready', (ev) => {
        const key = ev?.detail?.key;
        if (key === 'settings-panels') bindSettingsExtras();
        if (key === 'factory-modals') bindModals();
    });

    function openScenePresets(payload = {}) {
        if (typeof global.TransubFactoryWorkspace?.openScenes === 'function'
            && document.getElementById('workspaceScenes')) {
            global.TransubFactoryWorkspace.openScenes(payload || {});
            return { ok: true };
        }
        core()?.appendLog?.(uiTx('场景预设工作区未就绪'), 'warn');
        return { ok: false, error: 'scenes workspace unavailable' };
    }

    async function openSubtitleShelf(payload = {}) {
        try {
            if (typeof global.TransubFactoryWorkspace?.openShelf === 'function'
                && document.getElementById('workspaceShelf')) {
                global.TransubFactoryWorkspace.openShelf(payload || {});
                return { ok: true };
            }
            const res = await electron?.transubOpenSubtitleShelf?.(payload || {});
            if (res?.ok === false) {
                core()?.appendLog(res?.error || '打开字幕库失败', 'err');
            }
            return res;
        } catch (err) {
            core()?.appendLog(err?.message || '打开字幕库失败', 'err');
            return { ok: false, error: err?.message || String(err) };
        }
    }

    async function refreshShelfSettingsStatus() {
        const status = document.getElementById('shelfSettingsStatus');
        try {
            const res = await electron?.transubShelfStatus?.();
            if (!status) return res;
            if (res?.ok) {
                status.textContent = res.root
                    ? uiTf('{media} 部媒体 · {trans} 条译文 · {root}', {
                        media: res.mediaCount || 0,
                        trans: res.translationCount || 0,
                        root: res.root,
                    })
                    : uiTf('{media} 部媒体 · {trans} 条译文', {
                        media: res.mediaCount || 0,
                        trans: res.translationCount || 0,
                    });
            } else {
                status.textContent = res?.error || uiTx('字幕库不可用');
            }
            return res;
        } catch (err) {
            if (status) status.textContent = err?.message || uiTx('状态失败');
            return { ok: false, error: err?.message || String(err) };
        }
    }

    async function revealShelfRoot() {
        const status = document.getElementById('shelfSettingsStatus');
        try {
            const res = await electron?.transubShelfStatus?.();
            if (!res?.ok || !res.root) {
                if (status) status.textContent = res?.error || uiTx('无法定位字幕库目录');
                return res;
            }
            await electron?.showInFolder?.(res.root);
            if (status) status.textContent = uiTf('已打开：{path}', { path: res.root });
            return res;
        } catch (err) {
            if (status) status.textContent = err?.message || uiTx('打开失败');
            return { ok: false, error: err?.message || String(err) };
        }
    }

    global.TransubFeatures = {
        loadPresets,
        getPresets,
        applyPreset,
        applyPresetOptions,
        optionsForSavePreset,
        openSavePresetModal: openPresetNameModal,
        saveCustomPresetPayload,
        deletePresetById,
        showInstallWizard,
        showSubtitlePreview,
        appendInferLog,
        activateLogTab,
        openScenePresets,
        openSubtitleShelf,
        refreshShelfSettingsStatus,
        revealShelfRoot,
        bindPresets,
        bindSettingsExtras,
        bindMoreTab,
    };
}(window));
