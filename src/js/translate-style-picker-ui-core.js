/**
 * Translate-style picker modal + toolbar chip menu helpers.
 * Shell injects DOM/state via createTranslateStylePickerUi(deps).
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubTranslateStylePickerUi = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function translateStylePickerUiFactory(global) {
    /**
     * @param {object} deps shell adapters
     */
    function createTranslateStylePickerUi(deps) {
        const d = deps || {};
        const state = d.state;
        const els = d.els || {};
        const translateStyleApi = d.translateStyleApi || {};
        const getAdvancedEntitled = d.getAdvancedEntitled || (() => false);
        const getDocument = d.getDocument
            || (() => (typeof document !== 'undefined' ? document : (global && global.document)));
        const normPath = d.normPath || ((p) => String(p || ''));
        const basename = d.basename || ((p) => String(p || '').split(/[/\\]/).pop() || '');
        const uiTf = d.uiTf || ((s) => s);
        const showToast = d.showToast || (() => {});
        const appendLog = d.appendLog || (() => {});
        const syncSelectAllCheck = d.syncSelectAllCheck || (() => {});
        const renderList = d.renderList || (() => {});
        const updateStartButton = d.updateStartButton || (() => {});
        const refreshListRow = d.refreshListRow || (() => {});
        const syncLiveBatchOverrides = d.syncLiveBatchOverrides || (async () => {});
        const getRunning = d.getRunning || (() => !!(state && state.running));
        const persistFormOptionsQuiet = d.persistFormOptionsQuiet || (async () => {});
        const updateTranslateStyleUi = d.updateTranslateStyleUi || (() => {});
        const openAppSettings = d.openAppSettings
            || ((tab, opts) => (d.openParamsModal || (() => {}))(tab, opts));
        const closeSiblingMenus = d.closeSiblingMenus || (() => {});

        let translateStyleMenuOpen = false;
        /** Chip/source-of-truth for enable; settings checkbox is a mirror. */
        let styleEnabledState = false;
        let chipEventsBound = false;
        /** Ignore settings-updated / applyOptionsToForm echoes after a local toggle. */
        let styleEnableRemoteGuardUntil = 0;
        /** Ignore a follow-up「禁用」hit from layout shift on the same gesture. */
        let styleEnableIgnoreDisableUntil = 0;
        let styleEnableUserSeq = 0;

        function resolveEl(id, cacheKey) {
            const key = cacheKey || id;
            if (els[key]) return els[key];
            const node = getDocument()?.getElementById?.(id) || null;
            if (node) els[key] = node;
            return node;
        }

        function markLocalStyleEnableGesture(nextEnabled) {
            styleEnableUserSeq += 1;
            const now = Date.now();
            styleEnableRemoteGuardUntil = now + 1200;
            if (nextEnabled) styleEnableIgnoreDisableUntil = now + 500;
            return styleEnableUserSeq;
        }

        function getTranslateStyleMenuOpen() {
            return !!translateStyleMenuOpen;
        }

        function getTranslateStyleEnabled() {
            return !!styleEnabledState;
        }

        function setTranslateStyleEnabledState(on, {
            syncDom = true,
            fromRemote = false,
            localGesture = false,
        } = {}) {
            if (localGesture) markLocalStyleEnableGesture(!!on);
            if (fromRemote && Date.now() < styleEnableRemoteGuardUntil) {
                // Keep the user's in-memory choice; only mirror the checkbox.
                if (syncDom) {
                    const check = resolveEl('translateStyleEnabledCheck');
                    if (check) check.checked = styleEnabledState;
                }
                return styleEnabledState;
            }
            const prevEnabled = styleEnabledState;
            styleEnabledState = !!on;
            if (syncDom) {
                const check = resolveEl('translateStyleEnabledCheck');
                if (check) check.checked = styleEnabledState;
            }
            if (prevEnabled !== styleEnabledState) {
                try { renderList(); } catch { /* ignore */ }
            }
            return styleEnabledState;
        }

        function readStyleEnabledFromForm() {
            // Chip memory is authoritative; keep settings checkbox mirrored to it.
            const check = resolveEl('translateStyleEnabledCheck');
            if (check && check.checked !== styleEnabledState) {
                check.checked = styleEnabledState;
            }
            return !!styleEnabledState;
        }

        function readStylePresetFromForm() {
            const select = resolveEl('translateStylePresetSelect');
            return select?.value
                || translateStyleApi.DEFAULT_PRESET
                || 'natural_spoken';
        }

        function populateTranslateStylePickerSelect(selectEl, { includeGlobal = true } = {}) {
            if (!selectEl) return;
            const entitled = !!getAdvancedEntitled();
            const prev = selectEl.value;
            selectEl.innerHTML = '';
            if (includeGlobal) {
                const globalOpt = getDocument()?.createElement?.('option')
                    || (typeof document !== 'undefined' ? document.createElement('option') : null);
                if (!globalOpt) return;
                globalOpt.value = '';
                globalOpt.textContent = '跟随全局';
                selectEl.appendChild(globalOpt);
            }
            for (const opt of (translateStyleApi.listPresetOptions?.({ entitled }) || [])) {
                const el = getDocument()?.createElement?.('option')
                    || (typeof document !== 'undefined' ? document.createElement('option') : null);
                if (!el) continue;
                el.value = opt.id;
                el.textContent = opt.proOnly ? `${opt.label}` : opt.label;
                selectEl.appendChild(el);
            }
            if (prev && [...selectEl.options].some((o) => o.value === prev)) {
                selectEl.value = prev;
            }
        }

        function resolveTranslateStyleTargets() {
            const selected = state.items.filter((i) => i?.selected);
            if (selected.length) return selected;
            if (!state.focusedTaskPath) return [];
            const focused = state.items.find((i) => normPath(i.path) === state.focusedTaskPath);
            return focused ? [focused] : [];
        }

        function syncTranslateStylePickerCustomWrap() {
            const entitled = !!getAdvancedEntitled();
            const preset = els.translateStylePickerSelect?.value || '';
            const show = entitled && preset === 'custom';
            els.translateStylePickerCustomWrap?.classList.toggle('hidden', !show);
        }

        function closeTranslateStylePickerModal() {
            const doc = getDocument();
            const modal = els.translateStylePickerModal
                || doc?.getElementById?.('translateStylePickerModal');
            if (!modal) return;
            modal.classList.add('hidden');
            modal.classList.remove('flex', 'is-open');
        }

        function openTranslateStylePickerModal() {
            const selected = resolveTranslateStyleTargets();
            if (!selected.length) {
                showToast('请先勾选要设置译文风格的任务', 'warn');
                return;
            }
            // Keep checkbox selection in sync when falling back to focused row.
            if (!state.items.some((i) => i?.selected)) {
                selected.forEach((item) => { item.selected = true; });
                syncSelectAllCheck();
                renderList();
                updateStartButton();
            }
            const doc = getDocument();
            const modal = els.translateStylePickerModal
                || doc?.getElementById?.('translateStylePickerModal');
            const selectEl = els.translateStylePickerSelect
                || doc?.getElementById?.('translateStylePickerSelect');
            const noteEl = els.translateStylePickerCustomNote
                || doc?.getElementById?.('translateStylePickerCustomNote');
            const summaryEl = els.translateStylePickerSummary
                || doc?.getElementById?.('translateStylePickerSummary');
            if (modal && !els.translateStylePickerModal) els.translateStylePickerModal = modal;
            if (selectEl && !els.translateStylePickerSelect) els.translateStylePickerSelect = selectEl;
            if (noteEl && !els.translateStylePickerCustomNote) els.translateStylePickerCustomNote = noteEl;
            if (summaryEl && !els.translateStylePickerSummary) els.translateStylePickerSummary = summaryEl;
            if (!modal) {
                showToast('译文风格面板未加载，请重启应用', 'err');
                return;
            }
            setTranslateStyleMenuOpen(false);
            populateTranslateStylePickerSelect(selectEl, { includeGlobal: true });
            const presets = selected.map((i) => (
                i.translateStylePreset == null || String(i.translateStylePreset).trim() === ''
                    ? ''
                    : String(i.translateStylePreset)
            ));
            const unique = [...new Set(presets)];
            const initialPreset = unique.length === 1 ? unique[0] : '';
            if (selectEl) {
                selectEl.value = initialPreset;
            }
            const notes = selected
                .map((i) => String(i.translateStyleCustomNote || '').trim())
                .filter(Boolean);
            const uniqueNotes = [...new Set(notes)];
            if (noteEl) {
                noteEl.value = uniqueNotes.length === 1 ? uniqueNotes[0] : '';
            }
            syncTranslateStylePickerCustomWrap();
            if (summaryEl) {
                summaryEl.textContent = selected.length > 1
                    ? uiTf('将应用到已选 {n} 个任务', { n: selected.length })
                    : uiTf('文件：{name}', { name: basename(selected[0].path) });
            }
            try { doc?.body?.appendChild?.(modal); } catch { /* ignore */ }
            modal.classList.remove('hidden');
            modal.classList.add('flex', 'is-open');
        }

        function applyTranslateStylePicker() {
            const selected = resolveTranslateStyleTargets();
            if (!selected.length) {
                closeTranslateStylePickerModal();
                return;
            }
            const entitled = !!getAdvancedEntitled();
            const rawPreset = els.translateStylePickerSelect?.value ?? '';
            const followGlobal = rawPreset === '';
            let preset = followGlobal
                ? null
                : translateStyleApi.normalizeTranslateStylePreset?.(rawPreset, { entitled })
                    || rawPreset;
            if (!followGlobal && preset === 'custom' && !entitled) {
                showToast('自定义译文风格需 Pro', 'warn');
                return;
            }
            const note = preset === 'custom'
                ? String(els.translateStylePickerCustomNote?.value || '').trim().slice(0, 200)
                : '';
            for (const item of selected) {
                if (followGlobal) {
                    delete item.translateStylePreset;
                    delete item.translateStyleCustomNote;
                    delete item.translateStyleUserSet;
                    delete item.translateStyleSenseSuggested;
                } else {
                    item.translateStylePreset = preset;
                    item.translateStyleUserSet = true;
                    delete item.translateStyleSenseSuggested;
                    if (preset === 'custom' && note) item.translateStyleCustomNote = note;
                    else delete item.translateStyleCustomNote;
                }
                refreshListRow(item);
                if (getRunning()) void syncLiveBatchOverrides(item);
            }
            closeTranslateStylePickerModal();
            const label = followGlobal
                ? '跟随全局'
                : (translateStyleApi.getPresetLabel?.(preset) || preset);
            appendLog(`已设译文风格「${label}」· ${selected.length} 项`, 'info');
        }

        function rebuildTranslateStylePresetList() {
            const list = els.translateStylePresetList
                || getDocument()?.getElementById?.('translateStylePresetList');
            if (!list) return;
            if (!els.translateStylePresetList) els.translateStylePresetList = list;
            const entitled = !!getAdvancedEntitled();
            const active = readStylePresetFromForm();
            const opts = translateStyleApi.listPresetOptions?.({ entitled }) || [];
            const existing = list.querySelectorAll?.('[data-style-preset]') || [];
            // In-place active toggle avoids destroying the clicked node mid-event
            // (which retargets the same click onto「禁用」).
            if (existing.length === opts.length) {
                let same = true;
                for (let i = 0; i < opts.length; i += 1) {
                    if (existing[i].getAttribute('data-style-preset') !== opts[i].id) {
                        same = false;
                        break;
                    }
                }
                if (same) {
                    existing.forEach((btn) => {
                        btn.classList.toggle(
                            'active',
                            btn.getAttribute('data-style-preset') === active,
                        );
                    });
                    return;
                }
            }
            const doc = getDocument();
            list.innerHTML = '';
            for (const opt of opts) {
                const btn = doc?.createElement?.('button');
                if (!btn) continue;
                btn.type = 'button';
                btn.className = `post-task-menu-item${opt.id === active ? ' active' : ''}`;
                btn.setAttribute('role', 'menuitem');
                btn.setAttribute('data-style-preset', opt.id);
                const check = doc.createElement('i');
                check.className = 'fa fa-check post-task-check';
                check.setAttribute('aria-hidden', 'true');
                const span = doc.createElement('span');
                span.textContent = opt.proOnly ? `${opt.label} ◆ Pro` : opt.label;
                btn.appendChild(check);
                btn.appendChild(span);
                list.appendChild(btn);
            }
        }

        function syncTranslateStyleMenuCustomWrap() {
            const entitled = !!getAdvancedEntitled();
            const enabled = readStyleEnabledFromForm();
            const preset = readStylePresetFromForm();
            const show = enabled && entitled && preset === 'custom';
            const wrap = els.translateStyleMenuCustomWrap
                || getDocument()?.getElementById?.('translateStyleMenuCustomWrap');
            if (wrap && !els.translateStyleMenuCustomWrap) els.translateStyleMenuCustomWrap = wrap;
            wrap?.classList.toggle('hidden', !show);
            if (wrap) wrap.hidden = !show;
            if (show && els.translateStyleMenuCustomNote && els.translateStyleCustomNoteInput) {
                if (!String(els.translateStyleMenuCustomNote.value || '').trim()) {
                    els.translateStyleMenuCustomNote.value = els.translateStyleCustomNoteInput.value || '';
                }
            }
        }

        function expandTranslateStylePresetListUi() {
            if (!getTranslateStyleEnabled()) return;
            const listWrap = resolveEl('translateStylePresetListWrap');
            listWrap?.classList.remove('hidden');
            if (listWrap) listWrap.hidden = false;
            rebuildTranslateStylePresetList();
            syncTranslateStyleMenuCustomWrap();
        }

        function scheduleTranslateStylePresetExpand() {
            const run = () => expandTranslateStylePresetListUi();
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(() => setTimeout(run, 0));
            } else {
                setTimeout(run, 0);
            }
        }

        function syncTranslateStyleChipUi({ expandPresets = true } = {}) {
            const enabled = readStyleEnabledFromForm();
            const preset = readStylePresetFromForm();
            const short = enabled
                ? (translateStyleApi.getPresetShortLabel?.(preset) || translateStyleApi.getPresetLabel?.(preset) || preset)
                : '禁用';
            const chipLabel = resolveEl('translateStyleChipLabel');
            const chipBtn = resolveEl('setTranslateStyleBtn');
            if (chipLabel) chipLabel.textContent = short;
            if (chipBtn) {
                chipBtn.title = enabled
                    ? uiTf('译文风格 · {label}', {
                        label: translateStyleApi.getPresetLabel?.(preset) || preset,
                    })
                    : '译文风格：已禁用（不强制文风）';
                chipBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
            }
            const menu = resolveEl('translateStyleMenu');
            const enableBtns = menu?.querySelectorAll?.('[data-style-enable]') || [];
            enableBtns.forEach((btn) => {
                const on = btn.getAttribute('data-style-enable') === '1';
                btn.classList.toggle('active', on ? enabled : !enabled);
            });
            const listWrap = resolveEl('translateStylePresetListWrap');
            const wasCollapsed = !!(listWrap && (listWrap.hidden || listWrap.classList?.contains?.('hidden')));
            if (!enabled) {
                listWrap?.classList.add('hidden');
                if (listWrap) listWrap.hidden = true;
                syncTranslateStyleMenuCustomWrap();
            } else if (expandPresets && wasCollapsed) {
                // Defer expand so the enabling click cannot reflow onto「禁用」.
                scheduleTranslateStylePresetExpand();
            } else if (expandPresets) {
                expandTranslateStylePresetListUi();
            }
            const presetSelect = resolveEl('translateStylePresetSelect');
            const noteInput = resolveEl('translateStyleCustomNoteInput');
            if (presetSelect) presetSelect.disabled = !enabled;
            if (noteInput) {
                noteInput.disabled = !enabled || (presetSelect?.value !== 'custom');
            }
        }

        function setTranslateStyleMenuOpen(open) {
            translateStyleMenuOpen = !!open;
            bindTranslateStyleChipEvents();
            const menu = resolveEl('translateStyleMenu');
            const chipBtn = resolveEl('setTranslateStyleBtn');
            menu?.classList.toggle('hidden', !translateStyleMenuOpen);
            chipBtn?.setAttribute(
                'aria-expanded',
                translateStyleMenuOpen ? 'true' : 'false',
            );
            if (translateStyleMenuOpen) {
                // Must except self — closeSiblingMenus includes style in SIBLING_MENU_KEYS.
                closeSiblingMenus('style');
                syncTranslateStyleChipUi();
            }
        }

        function applyTranslateStyleEnabled(enabled, { persist = true } = {}) {
            const next = !!enabled;
            const seq = markLocalStyleEnableGesture(next);
            setTranslateStyleEnabledState(next, { syncDom: true });
            try { updateTranslateStyleUi(); } catch { /* ignore */ }
            // Chip label / active state immediately; preset list expands on next frame.
            syncTranslateStyleChipUi({ expandPresets: !!next });
            if (persist) {
                void Promise.resolve(persistFormOptionsQuiet()).then(() => {
                    // Re-assert after persist — settings-updated → applyOptionsToForm can race.
                    if (seq !== styleEnableUserSeq) return;
                    setTranslateStyleEnabledState(next, { syncDom: true });
                    syncTranslateStyleChipUi({ expandPresets: !!next });
                });
            }
            if (next) {
                appendLog(`已启用译文风格「${translateStyleApi.getPresetLabel?.(readStylePresetFromForm()) || readStylePresetFromForm()}」`, 'info');
            } else {
                appendLog('已禁用译文风格', 'info');
            }
        }

        function applyTranslateStylePreset(presetId, { persist = true, keepMenuOpen = true } = {}) {
            const entitled = !!getAdvancedEntitled();
            let preset = translateStyleApi.normalizeTranslateStylePreset?.(presetId, { entitled })
                || presetId;
            if (preset === 'custom' && !entitled) {
                showToast('自定义译文风格需 Pro', 'warn');
                return;
            }
            // Selecting a preset always means style is on; guard against save/reload races
            // and against rebuild click-through onto「禁用」.
            const seq = markLocalStyleEnableGesture(true);
            setTranslateStyleEnabledState(true, { syncDom: true });
            const select = resolveEl('translateStylePresetSelect');
            if (select) select.value = preset;
            try { updateTranslateStyleUi(); } catch { /* ignore */ }
            // Update active marks without wiping the clicked node in the same turn.
            syncTranslateStyleChipUi({ expandPresets: false });
            const paintPresets = () => {
                if (!getTranslateStyleEnabled()) return;
                expandTranslateStylePresetListUi();
            };
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(() => setTimeout(paintPresets, 0));
            } else {
                setTimeout(paintPresets, 0);
            }
            if (persist) {
                void Promise.resolve(persistFormOptionsQuiet()).then(() => {
                    if (seq !== styleEnableUserSeq) return;
                    setTranslateStyleEnabledState(true, { syncDom: true });
                    if (select) select.value = preset;
                    syncTranslateStyleChipUi();
                });
            }
            if (!keepMenuOpen) setTranslateStyleMenuOpen(false);
            appendLog(`译文风格预设「${translateStyleApi.getPresetLabel?.(preset) || preset}」`, 'info');
        }

        function applyTranslateStyleMenuCustomNote({ persist = true } = {}) {
            const menuNote = resolveEl('translateStyleMenuCustomNote');
            const note = String(menuNote?.value || '').trim().slice(0, 200);
            const noteInput = resolveEl('translateStyleCustomNoteInput');
            if (noteInput) noteInput.value = note;
            if (persist) void persistFormOptionsQuiet();
        }

        function openTranslateStyleSettings() {
            setTranslateStyleMenuOpen(false);
            openAppSettings('process');
        }

        function bindTranslateStyleChipEvents() {
            if (chipEventsBound) return;
            const chipBtn = resolveEl('setTranslateStyleBtn');
            const menu = resolveEl('translateStyleMenu');
            if (!chipBtn || !menu) return;
            chipEventsBound = true;
            chipBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                setTranslateStyleMenuOpen(!getTranslateStyleMenuOpen());
            });
            menu.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                const enableBtn = event.target?.closest?.('[data-style-enable]');
                if (enableBtn && menu.contains(enableBtn)) {
                    const next = enableBtn.getAttribute('data-style-enable') === '1';
                    // Layout shift after「启用」can deliver a spurious hit on「禁用」.
                    if (!next && Date.now() < styleEnableIgnoreDisableUntil) return;
                    applyTranslateStyleEnabled(next);
                    return;
                }
                const presetBtn = event.target?.closest?.('[data-style-preset]');
                if (presetBtn && menu.contains(presetBtn)) {
                    applyTranslateStylePreset(presetBtn.getAttribute('data-style-preset') || 'natural_spoken');
                    return;
                }
                if (event.target?.closest?.('#translateStyleOpenSettingsBtn')) {
                    openTranslateStyleSettings();
                }
            });
            const menuNote = resolveEl('translateStyleMenuCustomNote');
            menuNote?.addEventListener('change', () => {
                applyTranslateStyleMenuCustomNote();
            });
            menuNote?.addEventListener('click', (event) => event.stopPropagation());
        }

        // Bind as soon as DOM nodes are available (may retry on first open).
        try { bindTranslateStyleChipEvents(); } catch { /* ignore */ }

        return {
            populateTranslateStylePickerSelect,
            resolveTranslateStyleTargets,
            openTranslateStylePickerModal,
            closeTranslateStylePickerModal,
            syncTranslateStylePickerCustomWrap,
            applyTranslateStylePicker,
            getTranslateStyleMenuOpen,
            setTranslateStyleMenuOpen,
            syncTranslateStyleChipUi,
            rebuildTranslateStylePresetList,
            applyTranslateStyleEnabled,
            applyTranslateStylePreset,
            applyTranslateStyleMenuCustomNote,
            openTranslateStyleSettings,
            getTranslateStyleEnabled,
            setTranslateStyleEnabledState,
            bindTranslateStyleChipEvents,
            readStyleEnabledFromForm,
        };
    }

    return { createTranslateStylePickerUi };
}));
