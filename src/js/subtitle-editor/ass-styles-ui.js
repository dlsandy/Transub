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

        const markersCore = ctx.markersCore || global.TransubEditorMarkers;
        const packsCore = ctx.assStylePacksCore || global.TransubAssStylePacks;

        let editingName = 'Default';
        let draft = null;
        let bound = false;
        let activeTab = 'styles'; // styles | map | dual
        let selectedSpeakerId = '';
        let cueListStyleBound = false;

        function titleFromPath() {
            const base = basename(state.path || 'subtitle');
            return base.replace(/\.[^.]+$/, '') || 'Transub';
        }

        function getMarkersDoc() {
            if (!markersCore?.normalizeMarkersDoc) {
                return state.markers || { speakers: [], cueMarkers: {}, speakerStyleMap: {} };
            }
            if (!state.markers) state.markers = markersCore.emptyMarkersDoc();
            return markersCore.normalizeMarkersDoc(state.markers);
        }

        function persistMarkersDoc(doc) {
            state.markers = markersCore?.normalizeMarkersDoc
                ? markersCore.normalizeMarkersDoc(doc)
                : doc;
            if (typeof ctx.persistMarkers === 'function') void ctx.persistMarkers();
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
            const raw = String(tab || 'styles');
            activeTab = raw === 'dual' || raw === 'map' ? raw : 'styles';
            els.assStylesModal?.querySelectorAll('[data-ass-tab]').forEach((btn) => {
                const id = btn.getAttribute('data-ass-tab');
                btn.classList.remove('hidden');
                btn.removeAttribute('aria-hidden');
                btn.classList.toggle('active', id === activeTab);
                btn.setAttribute('aria-selected', id === activeTab ? 'true' : 'false');
            });
            els.assStylesModal?.querySelectorAll('[data-ass-tab-panel]').forEach((panel) => {
                const id = panel.getAttribute('data-ass-tab-panel');
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

        function syncAlignGrid(alignment) {
            const an = Math.min(9, Math.max(1, Number(alignment) || 2));
            if (els.assStyleAlign) els.assStyleAlign.value = String(an);
            els.assStyleAlignGrid?.querySelectorAll('[data-ass-style-align]')?.forEach((btn) => {
                const v = Number(btn.getAttribute('data-ass-style-align'));
                btn.classList.toggle('active', v === an);
            });
        }

        function updateStylePreview() {
            const textEl = els.assStylePreviewText;
            const box = els.assStylePreview;
            if (!textEl || !box) return;
            const s = draft || readFormIntoDraft();
            if (!s) return;
            const color = core.hexFromAssColour(s.primaryColour) || '#ffffff';
            const outline = core.hexFromAssColour(s.outlineColour) || '#000000';
            const size = Math.max(12, Math.min(42, Number(s.fontsize) || 48) * 0.55);
            const outlineW = Math.max(0, Number(s.outline) || 0);
            const shadow = Math.max(0, Number(s.shadow) || 0);
            const an = Math.min(9, Math.max(1, Number(s.alignment) || 2));
            const col = [1, 4, 7].includes(an) ? 'flex-start' : ([3, 6, 9].includes(an) ? 'flex-end' : 'center');
            const row = an <= 3 ? 'flex-end' : (an <= 6 ? 'center' : 'flex-start');
            textEl.textContent = s.name ? `${s.name} · 样例` : '样例字幕 Preview';
            textEl.style.color = color;
            textEl.style.fontFamily = `"${String(s.fontname || 'sans-serif').replace(/"/g, '')}", "Microsoft YaHei", sans-serif`;
            textEl.style.fontSize = `${size}px`;
            textEl.style.fontWeight = s.bold ? '700' : '400';
            textEl.style.fontStyle = s.italic ? 'italic' : 'normal';
            if (Number(s.borderStyle) === 3) {
                textEl.style.background = outline;
                textEl.style.padding = '0.15rem 0.4rem';
                textEl.style.borderRadius = '0.2rem';
                textEl.style.textShadow = 'none';
            } else {
                textEl.style.background = 'transparent';
                textEl.style.padding = '0';
                const ow = Math.max(1, outlineW);
                textEl.style.textShadow = [
                    `-${ow}px 0 ${outline}`, `${ow}px 0 ${outline}`,
                    `0 -${ow}px ${outline}`, `0 ${ow}px ${outline}`,
                    shadow ? `0 ${shadow}px ${shadow}px rgba(0,0,0,0.65)` : '',
                ].filter(Boolean).join(', ');
            }
            box.style.justifyContent = col;
            box.style.alignItems = row;
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
            syncAlignGrid(s.alignment ?? 2);
            if (els.assStyleMarginL) els.assStyleMarginL.value = String(s.marginL ?? 40);
            if (els.assStyleMarginR) els.assStyleMarginR.value = String(s.marginR ?? 40);
            if (els.assStyleMarginV) els.assStyleMarginV.value = String(s.marginV ?? 48);
            if (els.assStyleBorder) els.assStyleBorder.value = String(s.borderStyle ?? 1);
            if (els.assStyleBold) els.assStyleBold.checked = !!s.bold;
            if (els.assStyleItalic) els.assStyleItalic.checked = !!s.italic;
            updateStylePreview();
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
                borderStyle: els.assStyleBorder?.value,
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
            } else if (activeTab === 'map') {
                const markers = getMarkersDoc();
                const spCount = markers.speakers?.length || 0;
                parts.push(spCount ? `${spCount} 个说话人` : '尚未添加说话人');
                parts.push(selCount ? `已选 ${selCount} 条可指定` : '选中字幕后可指定说话人');
            } else if (fmt !== 'ass' && fmt !== 'ssa') {
                parts.push('当前不是 ASS：点「转为 ASS」可切换编辑格式，或仅「导出 ASS」写出文件');
            } else {
                parts.push('修改样式后保存即可写回 ASS');
            }
            if (activeTab === 'styles') {
                parts.push(selCount ? `已选 ${selCount} 条` : '未选字幕（可全选后套用）');
            }
            els.assStyleHint.textContent = parts.join(' · ');
            const isAss = fmt === 'ass' || fmt === 'ssa';
            if (els.assConvertBtn) {
                els.assConvertBtn.disabled = isAss;
                els.assConvertBtn.title = isAss
                    ? '当前已是 ASS'
                    : '将当前文档转为 ASS 编辑（写入样式头，保存时写 .ass）';
            }
        }

        function isAssContext() {
            const fmt = String(state.format || '').toLowerCase();
            return fmt === 'ass' || fmt === 'ssa' || !!state.showAssStyleColumn;
        }

        function syncDetailStyleSelect() {
            const wrap = els.detailAssStyleWrap;
            const select = els.detailAssStyle;
            if (!wrap || !select) return;
            const on = isAssContext();
            wrap.classList.toggle('hidden', !on);
            if (!on) return;
            const names = listStyleNames();
            const cue = state.selectedIndex >= 0 ? state.cues[state.selectedIndex] : null;
            const current = String(cue?.ass?.style || 'Default');
            const opts = names.length ? names : ['Default'];
            if (!opts.some((n) => n.toLowerCase() === current.toLowerCase())) opts.push(current);
            const prev = select.value;
            select.innerHTML = opts.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
            const want = opts.find((n) => n.toLowerCase() === current.toLowerCase()) || opts[0];
            select.value = want;
            if (prev && prev !== select.value && opts.includes(prev) && !cue) {
                select.value = prev;
            }
        }

        async function convertToAssSession() {
            const gate = await requirePro();
            if (!gate?.ok) {
                setStatus(gate?.error || '转为 ASS 需解锁 Pro', 'err');
                return null;
            }
            if (!core.convertDocumentToAss) {
                setStatus('ASS 样式模块缺少 convertDocumentToAss', 'err');
                return null;
            }
            const fmt = String(state.format || '').toLowerCase();
            if (fmt === 'ass' || fmt === 'ssa') {
                state.showAssStyleColumn = true;
                refresh();
                syncDetailStyleSelect();
                if (typeof ctx.onAssStylesChanged === 'function') ctx.onAssStylesChanged();
                setStatus('当前已是 ASS', 'info');
                return { alreadyAss: true };
            }
            if (!state.cues?.length) {
                setStatus('没有可转换的字幕', 'err');
                return null;
            }
            recordUndoBeforeChange?.('ass-convert');
            const result = core.convertDocumentToAss(state.cues, state.header, {
                title: titleFromPath(),
                format: state.format,
                path: state.path,
            });
            state.cues = result.cues;
            state.header = result.header;
            state.format = 'ass';
            state.showAssStyleColumn = true;
            if (result.pathChanged && result.path) {
                state.path = result.path;
            }
            if (els.formatBadge) els.formatBadge.textContent = 'ASS';
            setDirty(true);
            loadDraft(editingName || 'Default');
            refresh();
            syncDetailStyleSelect();
            renderCueList?.();
            renderDetailPane?.();
            if (typeof ctx.onAssStylesChanged === 'function') ctx.onAssStylesChanged();
            const pathNote = result.pathChanged ? ` · 保存路径改为 ${basename(result.path)}` : '';
            setStatus(`已转为 ASS 编辑（${result.metaFilled} 条补全 Style）${pathNote}`, 'ok');
            return result;
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
            if (els.assDualDocumentBtn) els.assDualDocumentBtn.disabled = !hasPair;
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
            if (!els.assStylePresetSelect) return;
            const builtins = core.listStylePresets ? core.listStylePresets() : [];
            const packs = packsCore?.listPacks ? packsCore.listPacks() : [];
            const cur = els.assStylePresetSelect.value || '';
            let html = '<option value="">样式预设…</option>';
            if (builtins.length) {
                html += '<optgroup label="内置">'
                    + builtins.map((p) => `<option value="builtin:${esc(p.id)}" title="${esc(p.detail || '')}">${esc(p.label)}</option>`).join('')
                    + '</optgroup>';
            }
            if (packs.length) {
                html += '<optgroup label="我的预设">'
                    + packs.map((p) => `<option value="pack:${esc(p.id)}" title="${esc(p.name)} · ${p.styles.length} 样式">★ ${esc(p.name)}</option>`).join('')
                    + '</optgroup>';
            }
            els.assStylePresetSelect.innerHTML = html;
            if (cur && [...els.assStylePresetSelect.options].some((o) => o.value === cur)) {
                els.assStylePresetSelect.value = cur;
            }
        }

        function applyUserPack(packId) {
            if (!packsCore?.getPack || !core.writeStylesToHeader) return;
            const pack = packsCore.getPack(packId);
            if (!pack) {
                setStatus('找不到该预设包', 'err');
                return;
            }
            recordUndoBeforeChange?.('ass-styles-user-pack');
            state.header = core.writeStylesToHeader(ensureHeader(), pack.styles, { title: titleFromPath() });
            if (pack.dualTemplate) {
                state.assDualTemplate = core.normalizeDualTemplate(pack.dualTemplate);
                activeTab = 'dual';
            }
            editingName = pack.styles[0]?.name || 'Default';
            loadDraft(editingName);
            setDirty(true);
            refresh();
            setStatus(`已应用我的预设「${pack.name}」`, 'ok');
        }

        function applyPreset(presetId) {
            const raw = String(presetId || '').trim();
            if (!raw) return;
            if (raw.startsWith('pack:')) {
                applyUserPack(raw.slice(5));
                return;
            }
            const id = raw.startsWith('builtin:') ? raw.slice(8) : raw;
            if (!core.applyStylePreset) return;
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

        async function saveCurrentAsPack() {
            if (!packsCore?.upsertPack || !packsCore?.createPackFromStyles) {
                setStatus('预设包模块未加载', 'err');
                return;
            }
            readFormIntoDraft();
            commitStyle({ renameFrom: editingName, silent: true });
            const styles = listStyles();
            if (!styles.length) {
                setStatus('没有可保存的样式', 'warn');
                return;
            }
            let name = '';
            if (typeof ctx.editorPrompt === 'function') {
                name = await ctx.editorPrompt('为当前样式组合命名', {
                    title: '保存为我的预设',
                    defaultValue: editingName || '我的预设',
                    okLabel: '保存',
                });
            } else {
                name = global.prompt?.('预设名称', editingName || '我的预设');
            }
            if (name == null) return;
            name = packsCore.sanitizePackName(name);
            const pack = packsCore.createPackFromStyles(name, styles, {
                dualTemplate: state.assDualTemplate || null,
            });
            const saved = packsCore.upsertPack(pack);
            if (!saved.ok) {
                setStatus(saved.error || '保存失败', 'err');
                return;
            }
            fillPresetSelect();
            setStatus(`已保存预设「${saved.pack.name}」`, 'ok');
        }

        async function deleteSelectedUserPack() {
            if (!packsCore?.deletePack) return;
            const cur = String(els.assStylePresetSelect?.value || '');
            if (!cur.startsWith('pack:')) {
                setStatus('请先在下拉里选中「我的预设」', 'warn');
                return;
            }
            const id = cur.slice(5);
            const pack = packsCore.getPack?.(id);
            const ok = ctx.editorConfirm
                ? await ctx.editorConfirm(`删除预设「${pack?.name || id}」？`, {
                    title: '删除我的预设',
                    okLabel: '删除',
                    type: 'warning',
                })
                : global.confirm('删除该预设？');
            if (!ok) return;
            const res = packsCore.deletePack(id);
            if (!res.ok) {
                setStatus(res.error || '删除失败', 'err');
                return;
            }
            fillPresetSelect();
            setStatus('已删除我的预设', 'ok');
        }

        function refresh() {
            if (!draft) loadDraft(editingName);
            setActiveTab(activeTab);
            fillPresetSelect();
            renderStyleList();
            fillForm();
            fillDualForm();
            renderSpeakerList();
            updateHint();
            syncDetailStyleSelect();
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

        async function applyDualDocumentToEditor() {
            if (!core.buildDualDocumentFromTracks) {
                setStatus('双语叠层模块未加载', 'err');
                return;
            }
            if (!(ctx.hasDualPair?.() || state.pairCues?.length)) {
                setStatus('请先挂载双语副轨', 'warn');
                return;
            }
            const gate = await requirePro();
            if (!gate?.ok) {
                setStatus(gate?.error || '双语叠层需解锁 Pro', 'err');
                return;
            }
            const tpl = readDualForm();
            const ok = ctx.editorConfirm
                ? await ctx.editorConfirm(
                    '将把当前主轨+副轨展开为 Source+ZH 双 Dialogue 文档（条数约翻倍），并切到 ASS 编辑。可撤销。继续？',
                    {
                        title: '写入双语叠层文档',
                        okLabel: '写入',
                        type: 'warning',
                    },
                )
                : global.confirm('写入双语叠层文档？条数约翻倍。');
            if (!ok) return;

            recordUndoBeforeChange?.('ass-dual-document');
            const dualApi = global.TransubDualSubtitle;
            const result = core.buildDualDocumentFromTracks(state.cues, state.pairCues, {
                title: titleFromPath(),
                primaryRole: state.dualRole || 'target',
                dualTemplate: tpl,
                headerLines: ensureHeader(),
                existingStyles: listStyles(),
                findBestOverlapCue: dualApi?.findBestOverlapCue || null,
            });
            if (!result.ok || !result.cues?.length) {
                setStatus('无法生成双语叠层', 'err');
                return;
            }
            state.cues = result.cues;
            state.header = result.header;
            state.assDualTemplate = result.template;
            state.format = 'ass';
            state.showAssStyleColumn = true;
            state.selectedIndex = result.cues.length ? 0 : -1;
            state.selectedIndices = state.selectedIndex >= 0 ? new Set([state.selectedIndex]) : new Set();
            if (els.formatBadge) els.formatBadge.textContent = 'ASS';
            if (els.cueCount) els.cueCount.textContent = `${state.cues.length} 条`;
            setDirty(true);
            loadDraft(result.targetStyle || 'ZH');
            refresh();
            renderCueList?.();
            renderDetailPane?.();
            if (typeof ctx.onAssStylesChanged === 'function') ctx.onAssStylesChanged();
            setStatus(
                `已写入双语叠层：${result.pairCount} 组 → ${result.dialogueCount} 条 Dialogue（${result.sourceStyle}/${result.targetStyle}）`,
                'ok',
            );
        }

        function renderStyleCellHtml(index, styleName) {
            const names = listStyleNames();
            const current = String(styleName || 'Default').trim() || 'Default';
            const opts = names.length ? names.slice() : ['Default'];
            if (!opts.some((n) => n.toLowerCase() === current.toLowerCase())) opts.push(current);
            return `<select class="ass-row-style-select" data-ass-row-style="${Number(index)}" title="ASS Style" aria-label="ASS Style">`
                + opts.map((n) => {
                    const sel = n.toLowerCase() === current.toLowerCase() ? ' selected' : '';
                    return `<option value="${esc(n)}"${sel}>${esc(n)}</option>`;
                }).join('')
                + '</select>';
        }

        function syncStyleCell(td, index, styleName) {
            if (!td) return;
            const current = String(styleName || 'Default').trim() || 'Default';
            let sel = td.querySelector('select[data-ass-row-style]');
            if (!sel) {
                td.innerHTML = renderStyleCellHtml(index, current);
                return;
            }
            const names = listStyleNames();
            const opts = names.length ? names.slice() : ['Default'];
            if (!opts.some((n) => n.toLowerCase() === current.toLowerCase())) opts.push(current);
            const html = opts.map((n) => {
                const selected = n.toLowerCase() === current.toLowerCase() ? ' selected' : '';
                return `<option value="${esc(n)}"${selected}>${esc(n)}</option>`;
            }).join('');
            if (sel.innerHTML !== html) sel.innerHTML = html;
            sel.value = opts.find((n) => n.toLowerCase() === current.toLowerCase()) || opts[0];
            sel.setAttribute('data-ass-row-style', String(index));
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
            const payload = getExportDocumentPayload();
            const styles = payload.styles || listStyles();
            const exportCues = payload.cues || state.cues;
            const summary = core.summarizeAssExport?.({
                assMode: 'document',
                styles,
                cueCount: exportCues.length,
            }) || `${styles.length} 个 Style · ${exportCues.length} 条`;
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
                cues: exportCues,
                styles,
                header: payload.header || ensureHeader(),
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

        function renderSpeakerList() {
            if (!els.assSpeakerList) return;
            const markers = getMarkersDoc();
            const speakers = markers.speakers || [];
            if (!selectedSpeakerId && speakers[0]) selectedSpeakerId = speakers[0].id;
            if (selectedSpeakerId && !speakers.some((s) => s.id === selectedSpeakerId)) {
                selectedSpeakerId = speakers[0]?.id || '';
            }
            if (!speakers.length) {
                els.assSpeakerList.innerHTML = '<div class="ass-style-item" style="cursor:default;color:var(--ed-muted)">暂无说话人 — 上方添加后可指定到选中字幕</div>';
                return;
            }
            const styleNames = listStyleNames();
            const map = markers.speakerStyleMap || {};
            els.assSpeakerList.innerHTML = speakers.map((sp, i) => {
                const usage = markersCore?.countSpeakerUsage
                    ? markersCore.countSpeakerUsage(state.cues, markers, sp.id)
                    : 0;
                const mapped = map[sp.id] || 'Default';
                const selected = sp.id === selectedSpeakerId ? ' is-selected' : '';
                const options = Array.from(new Set([...styleNames, mapped, `Sp${i + 1}`]));
                const opts = options.map((n) => {
                    const sel = n.toLowerCase() === String(mapped).toLowerCase() ? ' selected' : '';
                    return `<option value="${esc(n)}"${sel}>${esc(n)}</option>`;
                }).join('');
                return `<div class="ass-style-item${selected}" data-ass-speaker-id="${esc(sp.id)}" role="listitem">`
                    + `<span class="ass-style-swatch" style="background:${esc(sp.color || '#888')}"></span>`
                    + `<span class="ass-style-meta"><span class="ass-style-name">${esc(sp.name)}</span>`
                    + `<span class="ass-style-sub">${usage} 条</span></span>`
                    + `<select class="ass-speaker-style-select" data-ass-speaker-style="${esc(sp.id)}" title="映射 Style" aria-label="${esc(sp.name)} 样式">${opts}</select>`
                    + `</div>`;
            }).join('');
        }

        function addSpeaker() {
            if (!markersCore?.ensureSpeaker) {
                setStatus('说话人模块未加载', 'err');
                return;
            }
            const name = String(els.assSpeakerName?.value || '').trim();
            if (!name) {
                setStatus('请输入说话人名称', 'warn');
                els.assSpeakerName?.focus();
                return;
            }
            const result = markersCore.ensureSpeaker(getMarkersDoc(), name);
            if (result.error) {
                setStatus(result.error, 'err');
                return;
            }
            persistMarkersDoc(result.doc);
            selectedSpeakerId = result.speaker?.id || selectedSpeakerId;
            if (els.assSpeakerName) els.assSpeakerName.value = '';
            refresh();
            setStatus(result.speaker ? `已添加说话人 ${result.speaker.name}` : '已存在同名说话人', 'ok');
        }

        function assignSelectedSpeaker(clear = false) {
            if (!markersCore?.assignSpeakerToIndexes) {
                setStatus('说话人模块未加载', 'err');
                return;
            }
            let indexes = typeof getSelectedCueIndexes === 'function' ? getSelectedCueIndexes() : [];
            if (!indexes.length && state.selectedIndex >= 0) indexes = [state.selectedIndex];
            if (!indexes.length) {
                setStatus('请先选择字幕', 'warn');
                return;
            }
            const speakerId = clear ? '' : selectedSpeakerId;
            if (!clear && !speakerId) {
                setStatus('请先选择或添加说话人', 'warn');
                return;
            }
            recordUndoBeforeChange?.(clear ? 'ass-speaker-clear' : 'ass-speaker-assign');
            const result = markersCore.assignSpeakerToIndexes(getMarkersDoc(), state.cues, indexes, speakerId);
            if (result.error) {
                setStatus(result.error, 'err');
                return;
            }
            persistMarkersDoc(result.doc);
            renderCueList?.();
            renderSpeakerList();
            updateHint();
            const label = clear
                ? `已清除 ${result.changed} 条说话人`
                : `已将 ${result.changed} 条指定为说话人`;
            setStatus(label, 'ok');
        }

        async function deleteSelectedSpeaker() {
            if (!markersCore?.removeSpeaker || !selectedSpeakerId) {
                setStatus('请先选择说话人', 'warn');
                return;
            }
            const markers = getMarkersDoc();
            const sp = markers.speakers.find((s) => s.id === selectedSpeakerId);
            if (!sp) return;
            const usage = markersCore.countSpeakerUsage?.(state.cues, markers, sp.id) || 0;
            const ok = ctx.editorConfirm
                ? await ctx.editorConfirm(`删除说话人「${sp.name}」？${usage ? `（${usage} 条字幕将取消指定）` : ''}`, {
                    title: '删除说话人',
                    okLabel: '删除',
                    type: 'warning',
                })
                : global.confirm(`删除说话人「${sp.name}」？`);
            if (!ok) return;
            recordUndoBeforeChange?.('ass-speaker-delete');
            const result = markersCore.removeSpeaker(markers, sp.id);
            if (!result.removed) {
                setStatus(result.error || '删除失败', 'err');
                return;
            }
            persistMarkersDoc(result.doc);
            selectedSpeakerId = '';
            refresh();
            setStatus(`已删除说话人 ${sp.name}`, 'ok');
        }

        function updateSpeakerStyleMap(speakerId, styleName) {
            if (!markersCore?.setSpeakerStyleMap) return;
            const markers = getMarkersDoc();
            const nextMap = { ...(markers.speakerStyleMap || {}) };
            nextMap[speakerId] = core.sanitizeStyleName(styleName || 'Default');
            persistMarkersDoc(markersCore.setSpeakerStyleMap(markers, nextMap));
            renderSpeakerList();
        }

        function generateSpeakerStyles() {
            const markers = getMarkersDoc();
            const speakers = markers.speakers || [];
            if (!speakers.length) {
                setStatus('请先添加说话人', 'warn');
                return;
            }
            recordUndoBeforeChange?.('ass-speaker-gen-styles');
            const created = core.createStyleFromSpeakers(speakers);
            const merged = core.mergeSpeakerStylesIntoList(listStyles(), speakers, {
                ...(markers.speakerStyleMap || {}),
                ...created.speakerStyleMap,
            });
            state.header = core.writeStylesToHeader(ensureHeader(), merged.styles, { title: titleFromPath() });
            persistMarkersDoc(markersCore.setSpeakerStyleMap(markers, merged.speakerStyleMap));
            state.showAssStyleColumn = true;
            setDirty(true);
            refresh();
            setStatus(`已生成 ${speakers.length} 个说话人样式并写入映射`, 'ok');
        }

        function applySpeakerMapToCues() {
            const markers = getMarkersDoc();
            const speakers = markers.speakers || [];
            if (!speakers.length) {
                setStatus('请先添加说话人', 'warn');
                return;
            }
            recordUndoBeforeChange?.('ass-speaker-apply-map');
            const result = core.applySpeakerMapToCues(state.cues, {
                speakers,
                speakerStyleMap: markers.speakerStyleMap,
                cueMarkers: markers.cueMarkers,
                cueMarkerKey: markersCore.cueMarkerKey,
            });
            state.cues = result.cues;
            state.showAssStyleColumn = true;
            setDirty(true);
            renderCueList?.();
            renderDetailPane?.();
            syncDetailStyleSelect();
            if (typeof ctx.onAssStylesChanged === 'function') ctx.onAssStylesChanged();
            setStatus(result.changed ? `已按说话人映射更新 ${result.changed} 条` : '没有需要更新的字幕', result.changed ? 'ok' : 'info');
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
            const markers = getMarkersDoc();
            const speakers = markers.speakers || [];
            const speakerStyleMap = markers.speakerStyleMap || {};
            let styles = listStyles();
            let header = state.header;
            if (speakers.length && core.mergeSpeakerStylesIntoList) {
                const merged = core.mergeSpeakerStylesIntoList(styles, speakers, speakerStyleMap);
                styles = merged.styles;
                header = core.writeStylesToHeader(ensureHeader(), merged.styles, { title: titleFromPath() });
            }
            let cues = state.cues;
            if (speakers.length && core.applySpeakerMapToExportCues) {
                cues = core.applySpeakerMapToExportCues(state.cues, {
                    speakers,
                    speakerStyleMap,
                    cueMarkers: markers.cueMarkers,
                    cueMarkerKey: markersCore?.cueMarkerKey,
                });
            }
            return {
                styles,
                speakers,
                speakerStyleMap,
                header,
                cues,
            };
        }

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
                    setActiveTab(btn.getAttribute('data-ass-tab') || 'styles');
                    updateHint();
                    if (activeTab === 'map') renderSpeakerList();
                });
            });
            els.assStyleList?.addEventListener('click', (ev) => {
                const btn = ev.target?.closest?.('[data-ass-style-name]');
                if (!btn) return;
                const name = btn.getAttribute('data-ass-style-name') || 'Default';
                loadDraft(name);
                refresh();
            });
            els.assSpeakerList?.addEventListener('click', (ev) => {
                if (ev.target?.closest?.('select')) return;
                const row = ev.target?.closest?.('[data-ass-speaker-id]');
                if (!row) return;
                selectedSpeakerId = row.getAttribute('data-ass-speaker-id') || '';
                renderSpeakerList();
            });
            els.assSpeakerList?.addEventListener('change', (ev) => {
                const sel = ev.target?.closest?.('[data-ass-speaker-style]');
                if (!sel) return;
                const id = sel.getAttribute('data-ass-speaker-style');
                if (!id) return;
                selectedSpeakerId = id;
                updateSpeakerStyleMap(id, sel.value);
            });
            els.assSpeakerAddBtn?.addEventListener('click', () => addSpeaker());
            els.assSpeakerName?.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') {
                    ev.preventDefault();
                    addSpeaker();
                }
            });
            els.assSpeakerAssignBtn?.addEventListener('click', () => assignSelectedSpeaker(false));
            els.assSpeakerClearBtn?.addEventListener('click', () => assignSelectedSpeaker(true));
            els.assSpeakerDeleteBtn?.addEventListener('click', () => { void deleteSelectedSpeaker(); });
            els.assSpeakerGenStylesBtn?.addEventListener('click', () => generateSpeakerStyles());
            els.assSpeakerApplyMapBtn?.addEventListener('click', () => applySpeakerMapToCues());
            els.assStyleAddBtn?.addEventListener('click', () => addStyle());
            els.assStyleSaveBtn?.addEventListener('click', () => commitStyle({ renameFrom: editingName }));
            els.assStyleDeleteBtn?.addEventListener('click', () => { void removeStyle(); });
            els.assStyleApplyBtn?.addEventListener('click', () => applyToSelection());
            els.assStyleExportBtn?.addEventListener('click', () => { void exportDocumentAss(); });
            els.assConvertBtn?.addEventListener('click', () => { void convertToAssSession(); });
            els.assStylePresetSelect?.addEventListener('change', () => {
                const id = els.assStylePresetSelect.value;
                els.assStylePresetSelect.value = '';
                if (id) applyPreset(id);
            });
            els.assPackSaveBtn?.addEventListener('click', () => { void saveCurrentAsPack(); });
            els.assPackDeleteBtn?.addEventListener('click', () => { void deleteSelectedUserPack(); });
            els.detailAssStyle?.addEventListener('change', () => {
                if (state.detailSyncing) return;
                const name = els.detailAssStyle.value;
                if (!name) return;
                const idx = state.selectedIndex;
                if (idx < 0) {
                    setStatus('请先选择字幕', 'warn');
                    syncDetailStyleSelect();
                    return;
                }
                const applied = applyStyleByName(name, [idx]);
                setStatus(applied.changed ? `已套用样式 ${name}` : `样式已是 ${name}`, applied.changed ? 'ok' : 'info');
                syncDetailStyleSelect();
            });
            els.assDualApplyBtn?.addEventListener('click', () => applyDualTemplateToHeader());
            els.assDualDocumentBtn?.addEventListener('click', () => { void applyDualDocumentToEditor(); });
            els.assDualExportBtn?.addEventListener('click', () => { void exportDualAss(); });
            if (!cueListStyleBound && els.cueBody) {
                cueListStyleBound = true;
                els.cueBody.addEventListener('change', (ev) => {
                    const sel = ev.target?.closest?.('select[data-ass-row-style]');
                    if (!sel) return;
                    ev.stopPropagation();
                    const idx = Number(sel.getAttribute('data-ass-row-style'));
                    if (!Number.isInteger(idx) || idx < 0) return;
                    const name = sel.value;
                    const applied = applyStyleByName(name, [idx]);
                    if (applied.changed) setStatus(`#${idx + 1} → ${name}`, 'ok');
                });
                els.cueBody.addEventListener('mousedown', (ev) => {
                    if (ev.target?.closest?.('select[data-ass-row-style]')) ev.stopPropagation();
                });
                els.cueBody.addEventListener('click', (ev) => {
                    if (ev.target?.closest?.('select[data-ass-row-style]')) ev.stopPropagation();
                });
            }
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
                els.assStyleMarginL, els.assStyleMarginR, els.assStyleMarginV, els.assStyleBorder,
                els.assStyleBold, els.assStyleItalic,
            ].forEach((el) => {
                const refresh = () => {
                    readFormIntoDraft();
                    syncAlignGrid(draft?.alignment ?? els.assStyleAlign?.value);
                    updateStylePreview();
                    updateHint();
                };
                el?.addEventListener('change', refresh);
                el?.addEventListener('input', refresh);
            });
            els.assStyleAlignGrid?.addEventListener('click', (ev) => {
                const btn = ev.target?.closest?.('[data-ass-style-align]');
                if (!btn) return;
                const an = Number(btn.getAttribute('data-ass-style-align'));
                if (!Number.isFinite(an)) return;
                syncAlignGrid(an);
                readFormIntoDraft();
                updateStylePreview();
                updateHint();
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
            convertToAssSession,
            syncDetailStyleSelect,
            renderStyleCellHtml,
            syncStyleCell,
            assignSpeakerToSelection: (speakerId) => {
                if (speakerId) selectedSpeakerId = speakerId;
                assignSelectedSpeaker(false);
            },
            clearSpeakerFromSelection: () => assignSelectedSpeaker(true),
            listSpeakers: () => getMarkersDoc().speakers || [],
            openSpeakerMap: () => openModal({ tab: 'map' }),
            getExportDocumentPayload,
            getExportSpeakerPayload,
            exportDualAss,
            applyDualDocumentToEditor,
            confirmAssExport,
            summarizeExport: (opts) => (core.summarizeAssExport ? core.summarizeAssExport(opts) : ''),
        };
    }

    global.TransubEditorParts = global.TransubEditorParts || {};
    global.TransubEditorParts.installAssStylesUi = installAssStylesUi;
}(typeof globalThis !== 'undefined' ? globalThis : window));
