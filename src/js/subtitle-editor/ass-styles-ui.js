/**
 * ASS 样式面板（Pro）— 右侧 drawer
 */
(function (global) {
    function installAssStylesUi(ctx) {
        if (!ctx?.state || !ctx?.els) {
            throw new Error('installAssStylesUi(ctx): ctx.state, ctx.els required');
        }
        const core = ctx.assStylesCore || global.TransubAssStyles;
        if (!core) throw new Error('installAssStylesUi: TransubAssStyles required');

        const {
            state,
            els,
            electron,
            setStatus,
            showEditorModal,
            hideEditorModal,
            recordUndoBeforeChange,
            setDirty,
            renderCueList,
            renderDetailPane,
            getSelectedCueIndexes,
            esc,
            basename,
        } = ctx;

        let editingName = 'Default';
        let draft = null;
        let bound = false;
        let activeTab = 'styles'; // styles | dual

        function titleFromPath() {
            const base = basename(state.path || 'subtitle');
            return base.replace(/\.[^.]+$/, '') || 'Transub';
        }

        function getDualTemplate() {
            if (!state.assDualTemplate) {
                const order = typeof ctx.loadDualLineOrder === 'function'
                    ? ctx.loadDualLineOrder()
                    : (state.dualLineOrder || 'target-first');
                state.assDualTemplate = core.normalizeDualTemplate({ lineOrder: order });
            }
            return core.normalizeDualTemplate(state.assDualTemplate);
        }

        function setActiveTab(tab) {
            // Legacy "map" (speaker map) tab redirected to styles
            activeTab = tab === 'dual' ? 'dual' : 'styles';
            els.assStylesModal?.querySelectorAll('[data-ass-tab]').forEach((btn) => {
                const id = btn.getAttribute('data-ass-tab');
                if (id === 'map') {
                    btn.classList.add('hidden');
                    btn.setAttribute('aria-hidden', 'true');
                    return;
                }
                btn.classList.toggle('active', id === activeTab);
                btn.setAttribute('aria-selected', id === activeTab ? 'true' : 'false');
            });
            els.assStylesModal?.querySelectorAll('[data-ass-tab-panel]').forEach((panel) => {
                const id = panel.getAttribute('data-ass-tab-panel');
                if (id === 'map') {
                    panel.classList.add('hidden');
                    return;
                }
                panel.classList.toggle('hidden', id !== activeTab);
            });
        }

        function ensureHeader() {
            state.header = core.ensureAssHeader(state.header, titleFromPath());
            return state.header;
        }

        function listStyles() {
            ensureHeader();
            return core.parseStylesFromHeader(state.header).styles;
        }

        function loadDraft(name) {
            const styles = listStyles();
            const found = styles.find((s) => s.name.toLowerCase() === String(name || '').toLowerCase())
                || styles[0]
                || core.cloneStyle(core.DEFAULT_STYLE);
            editingName = found.name;
            draft = core.cloneStyle(found);
            return draft;
        }

        function fillForm() {
            if (!draft) loadDraft(editingName);
            const s = draft;
            if (els.assStyleName) els.assStyleName.value = s.name || '';
            if (els.assStyleFont) els.assStyleFont.value = s.fontname || '';
            if (els.assStyleSize) els.assStyleSize.value = String(s.fontsize ?? 48);
            if (els.assStylePrimary) els.assStylePrimary.value = core.hexFromAssColour(s.primaryColour);
            if (els.assStyleOutline) els.assStyleOutline.value = core.hexFromAssColour(s.outlineColour);
            if (els.assStyleBack) els.assStyleBack.value = core.hexFromAssColour(s.backColour);
            if (els.assStyleOutlineWidth) els.assStyleOutlineWidth.value = String(s.outline ?? 2);
            if (els.assStyleShadow) els.assStyleShadow.value = String(s.shadow ?? 1);
            if (els.assStyleAlign) els.assStyleAlign.value = String(s.alignment ?? 2);
            if (els.assStyleMarginL) els.assStyleMarginL.value = String(s.marginL ?? 40);
            if (els.assStyleMarginR) els.assStyleMarginR.value = String(s.marginR ?? 40);
            if (els.assStyleMarginV) els.assStyleMarginV.value = String(s.marginV ?? 48);
            if (els.assStyleBold) els.assStyleBold.checked = !!s.bold;
            if (els.assStyleItalic) els.assStyleItalic.checked = !!s.italic;
        }

        function readFormIntoDraft() {
            if (!draft) draft = core.cloneStyle(core.DEFAULT_STYLE);
            draft = core.normalizeStyle({
                ...draft,
                name: els.assStyleName?.value || draft.name,
                fontname: els.assStyleFont?.value || draft.fontname,
                fontsize: els.assStyleSize?.value,
                primaryColour: els.assStylePrimary?.value,
                outlineColour: els.assStyleOutline?.value,
                backColour: els.assStyleBack?.value,
                outline: els.assStyleOutlineWidth?.value,
                shadow: els.assStyleShadow?.value,
                alignment: els.assStyleAlign?.value,
                marginL: els.assStyleMarginL?.value,
                marginR: els.assStyleMarginR?.value,
                marginV: els.assStyleMarginV?.value,
                bold: els.assStyleBold?.checked ? -1 : 0,
                italic: els.assStyleItalic?.checked ? -1 : 0,
            });
            return draft;
        }

        function renderStyleList() {
            if (!els.assStyleList) return;
            const styles = listStyles();
            if (!styles.length) {
                els.assStyleList.innerHTML = '<div class="ass-style-item" style="cursor:default;color:var(--ed-muted)">暂无样式</div>';
                return;
            }
            els.assStyleList.innerHTML = styles.map((s) => {
                const active = s.name.toLowerCase() === String(editingName || '').toLowerCase() ? ' active' : '';
                const swatch = esc(core.hexFromAssColour(s.primaryColour));
                const usage = core.countStyleUsage(state.cues, s.name);
                return `<button type="button" class="ass-style-item${active}" data-ass-style-name="${esc(s.name)}" role="listitem">`
                    + `<span class="ass-style-swatch" style="background:${swatch}"></span>`
                    + `<span class="ass-style-meta"><span class="ass-style-name">${esc(s.name)}</span>`
                    + `<span class="ass-style-sub">${esc(s.fontname)} · ${esc(String(s.fontsize))} · ${usage} 条</span></span>`
                    + `</button>`;
            }).join('');
        }

        function updateHint() {
            if (!els.assStyleHint) return;
            const fmt = String(state.format || 'srt').toLowerCase();
            const sel = typeof getSelectedCueIndexes === 'function' ? getSelectedCueIndexes() : [];
            const selCount = Array.isArray(sel) ? sel.length : 0;
            const parts = [];
            if (activeTab === 'dual') {
                parts.push(ctx.hasDualPair?.() || (state.pairCues?.length) ? '已挂副轨' : '需先挂载双语副轨');
                parts.push('导出为 Source+ZH 双 Dialogue（与引擎 ass-dual 一致）');
            } else if (fmt !== 'ass' && fmt !== 'ssa') {
                parts.push('当前不是 ASS：样式保存在文档头，需「导出 ASS」或另存为 .ass 才会写入文件');
            } else {
                parts.push('修改样式后保存即可写回 ASS');
            }
            if (activeTab === 'styles') {
                parts.push(selCount ? `已选 ${selCount} 条` : '未选字幕（可全选后套用）');
            }
            els.assStyleHint.textContent = parts.join(' · ');
        }

        function fillDualForm() {
            const tpl = getDualTemplate();
            if (els.assDualPreset) els.assDualPreset.value = tpl.preset;
            if (els.assDualLineOrder) els.assDualLineOrder.value = tpl.lineOrder;
            if (els.assDualSourceStyle) fillStyleSelect(els.assDualSourceStyle, tpl.sourceStyle, ['Source']);
            if (els.assDualTargetStyle) fillStyleSelect(els.assDualTargetStyle, tpl.targetStyle, ['ZH', 'Default']);
            if (els.assDualMarginGap) els.assDualMarginGap.value = String(tpl.marginGap);
            const hasPair = !!(ctx.hasDualPair?.() || state.pairCues?.length);
            if (els.assDualExportBtn) els.assDualExportBtn.disabled = !hasPair;
        }

        function fillStyleSelect(selectEl, preferred, extras = []) {
            const styles = listStyles();
            const names = new Set(styles.map((s) => s.name));
            extras.forEach((n) => names.add(n));
            selectEl.innerHTML = [...names].map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
            if (preferred && [...selectEl.options].some((o) => o.value === preferred)) {
                selectEl.value = preferred;
            }
        }

        function readDualForm() {
            const tpl = core.normalizeDualTemplate({
                preset: els.assDualPreset?.value,
                lineOrder: els.assDualLineOrder?.value,
                sourceStyle: els.assDualSourceStyle?.value,
                targetStyle: els.assDualTargetStyle?.value,
                marginGap: els.assDualMarginGap?.value,
            });
            state.assDualTemplate = tpl;
            return tpl;
        }

        function fillPresetSelect() {
            if (!els.assStylePresetSelect || !core.listStylePresets) return;
            const presets = core.listStylePresets();
            const cur = els.assStylePresetSelect.value || '';
            els.assStylePresetSelect.innerHTML = '<option value="">样式预设…</option>'
                + presets.map((p) => `<option value="${esc(p.id)}" title="${esc(p.detail || '')}">${esc(p.label)}</option>`).join('');
            if (cur && [...els.assStylePresetSelect.options].some((o) => o.value === cur)) {
                els.assStylePresetSelect.value = cur;
            }
        }

        function refresh() {
            if (!draft) loadDraft(editingName);
            setActiveTab(activeTab);
            fillPresetSelect();
            renderStyleList();
            fillForm();
            fillDualForm();
            updateHint();
            if (typeof ctx.onAssStylesChanged === 'function') ctx.onAssStylesChanged();
        }

        async function requirePro() {
            if (!electron?.transubAdvancedRequireFeature) return { ok: true };
            const primary = await electron.transubAdvancedRequireFeature({ featureId: 'assStyleExport' });
            if (primary?.ok) return primary;
            const fallback = await electron.transubAdvancedRequireFeature({ featureId: 'contextReconstruct' });
            return fallback?.ok ? fallback : (fallback || primary || { ok: false, error: 'ASS 样式需解锁 Pro' });
        }

        async function openModal(opts = {}) {
            const gate = await requirePro();
            if (!gate?.ok) {
                setStatus(gate?.error || 'ASS 样式需解锁 Pro', 'err');
                return;
            }
            state.showAssStyleColumn = true;
            ensureHeader();
            loadDraft(editingName || 'Default');
            if (opts.tab) activeTab = opts.tab;
            refresh();
            showEditorModal(els.assStylesModal, els.assStyleName || els.assStyleFont);
            if (typeof ctx.onAssStylesChanged === 'function') ctx.onAssStylesChanged();
        }

        function closeModal() {
            hideEditorModal(els.assStylesModal);
        }

        function commitStyle({ renameFrom, recordUndo = true, silent = false } = {}) {
            readFormIntoDraft();
            const next = core.normalizeStyle(draft);
            if (recordUndo) recordUndoBeforeChange?.('ass-styles');
            ensureHeader();
            if (renameFrom && renameFrom.toLowerCase() !== next.name.toLowerCase()) {
                const renamed = core.renameStyleInHeader(state.header, renameFrom, next.name, { title: titleFromPath() });
                state.header = renamed.header;
                if (renamed.renamed) {
                    const applied = core.applyStyleToCues(
                        state.cues,
                        state.cues.map((_, i) => i).filter((i) => {
                            const st = String(state.cues[i]?.ass?.style || 'Default');
                            return st.toLowerCase() === renameFrom.toLowerCase();
                        }),
                        next.name,
                    );
                    state.cues = applied.cues;
                }
                editingName = next.name;
            }
            state.header = core.upsertStyleInHeader(state.header, next, { title: titleFromPath() });
            editingName = next.name;
            draft = core.cloneStyle(next);
            setDirty(true);
            renderCueList?.();
            renderDetailPane?.();
            refresh();
            if (!silent) setStatus(`已保存样式 ${next.name}`, 'ok');
            return next;
        }

        function addStyle() {
            const styles = listStyles();
            const name = core.uniqueStyleName(styles.map((s) => s.name), 'Style');
            recordUndoBeforeChange?.('ass-styles-add');
            const created = core.normalizeStyle({ ...core.DEFAULT_STYLE, name });
            state.header = core.upsertStyleInHeader(ensureHeader(), created, { title: titleFromPath() });
            editingName = name;
            draft = core.cloneStyle(created);
            setDirty(true);
            refresh();
            setStatus(`已新建样式 ${name}`, 'ok');
        }

        async function removeStyle() {
            const name = editingName || draft?.name || '';
            if (!name || name.toLowerCase() === 'default') {
                setStatus('不能删除 Default 样式', 'warn');
                return;
            }
            const usage = core.countStyleUsage(state.cues, name);
            if (usage > 0) {
                const ok = ctx.editorConfirm
                    ? await ctx.editorConfirm(`样式「${name}」被 ${usage} 条字幕引用，删除后将改回 Default。继续？`, {
                        title: '删除 ASS 样式',
                        okLabel: '删除',
                        type: 'warning',
                    })
                    : global.confirm(`样式「${name}」被 ${usage} 条字幕引用，删除后将改回 Default。继续？`);
                if (!ok) return;
            }
            recordUndoBeforeChange?.('ass-styles-delete');
            const result = core.deleteStyleFromHeader(ensureHeader(), name, { title: titleFromPath() });
            if (!result.deleted) {
                setStatus(result.error || '删除失败', 'err');
                return;
            }
            state.header = result.header;
            if (usage > 0) {
                const indexes = state.cues.map((_, i) => i).filter((i) => {
                    const st = String(state.cues[i]?.ass?.style || 'Default');
                    return st.toLowerCase() === name.toLowerCase();
                });
                const applied = core.applyStyleToCues(state.cues, indexes, 'Default');
                state.cues = applied.cues;
            }
            editingName = 'Default';
            loadDraft('Default');
            setDirty(true);
            renderCueList?.();
            renderDetailPane?.();
            refresh();
            setStatus(`已删除样式 ${name}`, 'ok');
        }

        function applyToSelection() {
            readFormIntoDraft();
            let indexes = typeof getSelectedCueIndexes === 'function' ? getSelectedCueIndexes() : [];
            if (!indexes.length && state.selectedIndex >= 0) indexes = [state.selectedIndex];
            if (!indexes.length) {
                setStatus('请先选择要套用的字幕', 'warn');
                return;
            }
            recordUndoBeforeChange?.('ass-styles-apply');
            // Persist form edits first so applied name exists in header.
            const saved = commitStyle({ renameFrom: editingName, recordUndo: false, silent: true });
            const applied = core.applyStyleToCues(state.cues, indexes, saved.name);
            state.cues = applied.cues;
            setDirty(true);
            renderCueList?.();
            renderDetailPane?.();
            refresh();
            setStatus(`已将 ${applied.changed} 条套用为 ${saved.name}`, 'ok');
        }

        function applyPreset(presetId) {
            const id = String(presetId || '').trim();
            if (!id || !core.applyStylePreset) return;
            recordUndoBeforeChange?.('ass-styles-preset');
            const result = core.applyStylePreset(ensureHeader(), id, { title: titleFromPath() });
            if (!result.ok) {
                setStatus(result.error || '应用预设失败', 'err');
                return;
            }
            state.header = result.header;
            if (result.dualTemplate) {
                state.assDualTemplate = result.dualTemplate;
            }
            editingName = result.styles?.[0]?.name || 'Default';
            loadDraft(editingName);
            setDirty(true);
            if (result.dualTemplate) activeTab = 'dual';
            refresh();
            setStatus(`已应用预设「${result.label}」`, 'ok');
        }

        async function confirmAssExport(summary, title) {
            if (!ctx.editorConfirm) return true;
            return ctx.editorConfirm(`即将导出 ASS。\n${summary || ''}`, {
                title: title || '导出 ASS',
                okLabel: '导出',
                cancelLabel: '取消',
                type: 'question',
            });
        }

        function applyDualTemplateToHeader() {
            const tpl = readDualForm();
            recordUndoBeforeChange?.('ass-styles-dual');
            const ensured = core.ensureDualTemplateStyles(listStyles(), tpl);
            state.header = core.writeStylesToHeader(ensureHeader(), ensured.styles, { title: titleFromPath() });
            setDirty(true);
            refresh();
            setStatus(`已写入双语样式 ${ensured.sourceStyle} / ${ensured.targetStyle}`, 'ok');
            return ensured;
        }

        async function exportDocumentAss() {
            if (!electron?.transubExportSubtitle) {
                setStatus('当前环境不支持导出', 'err');
                return;
            }
            const gate = await requirePro();
            if (!gate?.ok) {
                setStatus(gate?.error || '导出 ASS 需解锁 Pro', 'err');
                return;
            }
            readFormIntoDraft();
            commitStyle({ renameFrom: editingName, silent: true });
            if (!state.cues.length) {
                setStatus('没有可导出的字幕', 'err');
                return;
            }
            const styles = listStyles();
            const summary = core.summarizeAssExport?.({
                assMode: 'document',
                styles,
                cueCount: state.cues.length,
            }) || `${styles.length} 个 Style · ${state.cues.length} 条`;
            if (!(await confirmAssExport(summary, '导出 ASS（当前样式）'))) return;
            const stem = basename(state.path || 'subtitle.srt').replace(/\.[^.]+$/, '') || 'subtitle';
            let defaultName = `${stem}.ass`;
            if (state.path) {
                const dir = String(state.path).replace(/[/\\][^/\\]+$/, '');
                const sep = state.path.includes('\\') ? '\\' : '/';
                defaultName = `${dir}${sep}${stem}.ass`;
            }
            const res = await electron.transubExportSubtitle({
                title: '导出 ASS（当前样式）',
                defaultName,
                format: 'ass',
                assMode: 'document',
                cues: state.cues,
                header: ensureHeader(),
            });
            if (res?.canceled) return;
            if (!res?.ok) {
                setStatus(res?.error || 'ASS 导出失败', 'err');
                return;
            }
            setStatus(`已导出 ASS：${basename(res.path)}`, 'ok');
        }

        async function exportDualAss() {
            if (!electron?.transubExportSubtitle) {
                setStatus('当前环境不支持导出', 'err');
                return;
            }
            if (!(ctx.hasDualPair?.() || state.pairCues?.length)) {
                setStatus('请先挂载双语副轨', 'warn');
                return;
            }
            const gate = await requirePro();
            if (!gate?.ok) {
                setStatus(gate?.error || '导出双语 ASS 需解锁 Pro', 'err');
                return;
            }
            applyDualTemplateToHeader();
            const tpl = getDualTemplate();
            const summary = core.summarizeAssExport?.({
                assMode: 'dual',
                lineOrder: tpl.lineOrder,
                cueCount: state.cues.length,
            }) || `双语 · ${state.cues.length} 条`;
            if (!(await confirmAssExport(summary, '导出双语 ASS'))) return;
            const stem = basename(state.path || 'subtitle.srt').replace(/\.[^.]+$/, '') || 'subtitle';
            let defaultName = `${stem}.dual.ass`;
            if (state.path) {
                const dir = String(state.path).replace(/[/\\][^/\\]+$/, '');
                const sep = state.path.includes('\\') ? '\\' : '/';
                defaultName = `${dir}${sep}${stem}.dual.ass`;
            }
            const res = await electron.transubExportSubtitle({
                title: '导出双语 ASS',
                defaultName,
                format: 'ass',
                assMode: 'dual',
                cues: state.cues,
                pairCues: state.pairCues,
                primaryRole: state.dualRole || 'target',
                lineOrder: tpl.lineOrder,
                dualTemplate: tpl,
                sourceStyle: tpl.sourceStyle,
                targetStyle: tpl.targetStyle,
                marginGap: tpl.marginGap,
            });
            if (res?.canceled) return;
            if (!res?.ok) {
                setStatus(res?.error || '双语 ASS 导出失败', 'err');
                return;
            }
            setStatus(`已导出双语 ASS：${basename(res.path)}`, 'ok');
        }

        function listStyleNames() {
            return listStyles().map((s) => s.name);
        }

        function applyStyleByName(styleName, indexes) {
            ensureHeader();
            const name = core.sanitizeStyleName(styleName);
            const styles = listStyles();
            if (!styles.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
                state.header = core.upsertStyleInHeader(state.header, { ...core.DEFAULT_STYLE, name }, { title: titleFromPath() });
            }
            let idxs = indexes;
            if (!Array.isArray(idxs) || !idxs.length) {
                idxs = typeof getSelectedCueIndexes === 'function' ? getSelectedCueIndexes() : [];
                if (!idxs.length && state.selectedIndex >= 0) idxs = [state.selectedIndex];
            }
            if (!idxs.length) return { changed: 0, styleName: name };
            recordUndoBeforeChange?.('ass-styles-apply');
            const applied = core.applyStyleToCues(state.cues, idxs, name);
            state.cues = applied.cues;
            state.showAssStyleColumn = true;
            setDirty(true);
            renderCueList?.();
            renderDetailPane?.();
            if (typeof ctx.onAssStylesChanged === 'function') ctx.onAssStylesChanged();
            return applied;
        }

        function getExportDocumentPayload() {
            ensureHeader();
            const styles = listStyles();
            return {
                styles,
                speakers: [],
                speakerStyleMap: {},
                header: state.header,
            };
        }

        /** @deprecated Speaker export removed; returns document styles only. */
        function getExportSpeakerPayload() {
            return getExportDocumentPayload();
        }

        function bindUi() {
            if (bound) return;
            bound = true;
            els.assStylesBtn?.addEventListener('click', () => { void openModal(); });
            els.assStylesModal?.querySelectorAll('[data-ass-styles-dismiss]').forEach((el) => {
                el.addEventListener('click', () => closeModal());
            });
            els.assStylesModal?.querySelectorAll('[data-ass-tab]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const raw = btn.getAttribute('data-ass-tab') || 'styles';
                    setActiveTab(raw === 'map' ? 'styles' : raw);
                    updateHint();
                });
            });
            els.assStyleList?.addEventListener('click', (ev) => {
                const btn = ev.target?.closest?.('[data-ass-style-name]');
                if (!btn) return;
                const name = btn.getAttribute('data-ass-style-name') || 'Default';
                loadDraft(name);
                refresh();
            });
            els.assStyleAddBtn?.addEventListener('click', () => addStyle());
            els.assStyleSaveBtn?.addEventListener('click', () => commitStyle({ renameFrom: editingName }));
            els.assStyleDeleteBtn?.addEventListener('click', () => { void removeStyle(); });
            els.assStyleApplyBtn?.addEventListener('click', () => applyToSelection());
            els.assStyleExportBtn?.addEventListener('click', () => { void exportDocumentAss(); });
            els.assStylePresetSelect?.addEventListener('change', () => {
                const id = els.assStylePresetSelect.value;
                els.assStylePresetSelect.value = '';
                if (id) applyPreset(id);
            });
            els.assDualApplyBtn?.addEventListener('click', () => applyDualTemplateToHeader());
            els.assDualExportBtn?.addEventListener('click', () => { void exportDualAss(); });
            [
                els.assDualPreset, els.assDualLineOrder, els.assDualSourceStyle,
                els.assDualTargetStyle, els.assDualMarginGap,
            ].forEach((el) => {
                el?.addEventListener('change', () => {
                    if (el === els.assDualPreset) {
                        const preset = els.assDualPreset.value;
                        if (preset === 'source-top' && els.assDualLineOrder) {
                            els.assDualLineOrder.value = 'source-first';
                        } else if (preset === 'watch' && els.assDualLineOrder) {
                            els.assDualLineOrder.value = 'target-first';
                        }
                    }
                    readDualForm();
                    updateHint();
                });
            });
            [
                els.assStyleName, els.assStyleFont, els.assStyleSize, els.assStylePrimary, els.assStyleOutline,
                els.assStyleBack, els.assStyleOutlineWidth, els.assStyleShadow, els.assStyleAlign,
                els.assStyleMarginL, els.assStyleMarginR, els.assStyleMarginV, els.assStyleBold, els.assStyleItalic,
            ].forEach((el) => {
                el?.addEventListener('change', () => {
                    readFormIntoDraft();
                    updateHint();
                });
            });
        }

        return {
            bindUi,
            openModal,
            closeModal,
            refresh,
            ensureHeader,
            listStyleNames,
            applyStyleByName,
            getExportDocumentPayload,
            getExportSpeakerPayload,
            exportDualAss,
            confirmAssExport,
            summarizeExport: (opts) => (core.summarizeAssExport ? core.summarizeAssExport(opts) : ''),
        };
    }

    global.TransubEditorParts = global.TransubEditorParts || {};
    global.TransubEditorParts.installAssStylesUi = installAssStylesUi;
}(typeof globalThis !== 'undefined' ? globalThis : window));
