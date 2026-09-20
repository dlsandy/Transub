/**
 * Burn style presets modal UI — free builtins (观影白字 / 大字号观影) + Pro full catalog.
 */
(function (global) {
    const presets = global.TransubSubtitleBurnStylePresets || {};
    const electron = global.__ELECTRON__;

    let hostApi = null;
    let open = false;
    let editingId = '';
    let draft = null;
    let bound = false;
    let proEntitled = false;
    let systemFonts = [];
    let systemFontsLoading = null;

    const FALLBACK_FONTS = [
        'Microsoft YaHei',
        '微软雅黑',
        'SimHei',
        'Source Han Sans SC',
        'Noto Sans CJK SC',
        'Arial',
        'Arial Unicode MS',
    ];

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

    function setStatus(text, kind) {
        const el = $('burnStylePresetStatus');
        if (!el) return;
        el.textContent = text || '';
        el.classList.toggle('is-error', kind === 'error');
        el.classList.toggle('is-ok', kind === 'ok');
    }

    function ensureDraft() {
        if (!draft && presets.defaultBurnStyle) {
            draft = presets.normalizeBurnStyle(presets.defaultBurnStyle());
        } else if (draft && presets.normalizeBurnStyle) {
            draft = presets.normalizeBurnStyle(draft);
        }
        return draft;
    }

    function fillSelect(el, options, value) {
        if (!el) return;
        el.innerHTML = (options || []).map((o) => (
            `<option value="${escapeHtml(o.id)}">${escapeHtml(o.label)}</option>`
        )).join('');
        if (value != null) el.value = String(value);
    }

    function fontOptionList(preferred = []) {
        const preferredList = (Array.isArray(preferred) ? preferred : [])
            .map((n) => String(n || '').trim())
            .filter(Boolean);
        const base = systemFonts.length ? systemFonts : FALLBACK_FONTS;
        const seen = new Set();
        const out = [];
        const push = (name) => {
            const n = String(name || '').trim();
            if (!n) return;
            const key = n.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            out.push(n);
        };
        preferredList.forEach(push);
        FALLBACK_FONTS.forEach(push);
        base.forEach(push);
        return out;
    }

    function fillFontSelect(el, currentValue) {
        if (!el) return;
        const current = String(currentValue || '').trim();
        const fonts = fontOptionList(current ? [current] : []);
        el.innerHTML = fonts.map((name) => (
            `<option value="${escapeHtml(name)}" style="font-family:'${escapeHtml(name).replace(/'/g, '')}',sans-serif">${escapeHtml(name)}</option>`
        )).join('');
        if (current) el.value = current;
        else if (fonts[0]) el.value = fonts[0];
    }

    async function ensureSystemFonts() {
        if (systemFonts.length) return systemFonts;
        if (systemFontsLoading) return systemFontsLoading;
        systemFontsLoading = (async () => {
            let fonts = [];
            try {
                if (electron?.transubListSystemFonts) {
                    const res = await electron.transubListSystemFonts();
                    if (res?.ok && Array.isArray(res.fonts)) fonts = res.fonts;
                }
            } catch (_) { /* ignore */ }
            if (!fonts.length && typeof document !== 'undefined' && typeof document.fonts?.values === 'function') {
                try {
                    for (const face of document.fonts.values()) {
                        const family = String(face.family || '').replace(/["']/g, '').trim();
                        if (family) fonts.push(family);
                    }
                } catch (_) { /* ignore */ }
            }
            systemFonts = Array.from(new Set(
                fonts.map((n) => String(n || '').trim()).filter(Boolean),
            )).sort((a, b) => a.localeCompare(b, 'zh-CN'));
            return systemFonts;
        })().finally(() => {
            systemFontsLoading = null;
        });
        return systemFontsLoading;
    }

    function isEditableSession() {
        if (proEntitled) return true;
        return false;
    }

    function syncEditorEditable() {
        const editable = isEditableSession();
        const form = $('burnStylePresetsModal')?.querySelector('.factory-burn-style-form');
        if (form) {
            form.classList.toggle('is-readonly', !editable);
            form.querySelectorAll('input, select, textarea').forEach((el) => {
                if (el.id === 'burnStylePresetName' && !editable) {
                    el.readOnly = true;
                    el.disabled = false;
                    return;
                }
                el.disabled = !editable;
            });
        }
        const newBtn = $('burnStylePresetNewBtn');
        const saveBtn = $('burnStylePresetSaveBtn');
        const delBtn = $('burnStylePresetDeleteBtn');
        if (newBtn) newBtn.disabled = !editable;
        if (saveBtn) saveBtn.disabled = !editable;
        if (delBtn) delBtn.disabled = !editable || !editingId || !!presets.getPreset?.(editingId)?.builtin;
        const sourceFields = $('burnStyleSourceFields');
        if (sourceFields && editable) {
            sourceFields.classList.toggle('is-disabled', !ensureDraft()?.enableSource);
        }
    }

    function syncFormFromDraft() {
        const s = ensureDraft();
        if (!s) return;

        const set = (id, val) => {
            const el = $(id);
            if (!el) return;
            if (el.type === 'checkbox') el.checked = !!val;
            else el.value = val != null ? String(val) : '';
        };

        set('burnStyleEnableSource', s.enableSource);
        set('burnStyleMarginV', s.marginV);
        set('burnStyleMarginL', s.marginL);
        set('burnStyleMarginR', s.marginR);
        set('burnStyleLineGap', s.lineGap);
        set('burnStyleLineOrder', s.lineOrder);
        fillSelect($('burnStyleAlign'), presets.ALIGN_OPTIONS || [], s.alignment);
        fillSelect($('burnStyleTargetBorder'), presets.BORDER_STYLE_OPTIONS || [], s.target.borderStyle);
        fillSelect($('burnStyleSourceBorder'), presets.BORDER_STYLE_OPTIONS || [], s.source.borderStyle);

        const t = s.target;
        const o = s.source;
        fillFontSelect($('burnStyleTargetFont'), t.fontName);
        set('burnStyleTargetSize', t.fontSize);
        set('burnStyleTargetColor', t.primaryColor);
        set('burnStyleTargetShadow', t.shadow);
        set('burnStyleTargetShadowColor', t.shadowColor);
        set('burnStyleTargetOutline', t.outline);
        set('burnStyleTargetOutlineColor', t.outlineColor);
        set('burnStyleTargetOutlineAlpha', t.outlineAlpha);
        set('burnStyleTargetBold', t.bold);
        set('burnStyleTargetItalic', t.italic);

        fillFontSelect($('burnStyleSourceFont'), o.fontName);
        set('burnStyleSourceSize', o.fontSize);
        set('burnStyleSourceColor', o.primaryColor);
        set('burnStyleSourceShadow', o.shadow);
        set('burnStyleSourceShadowColor', o.shadowColor);
        set('burnStyleSourceOutline', o.outline);
        set('burnStyleSourceOutlineColor', o.outlineColor);
        set('burnStyleSourceOutlineAlpha', o.outlineAlpha);
        set('burnStyleSourceBold', o.bold);
        set('burnStyleSourceItalic', o.italic);

        const sourceFields = $('burnStyleSourceFields');
        if (sourceFields) sourceFields.classList.toggle('is-disabled', !s.enableSource);

        syncEditorEditable();
        updatePreview();
    }

    function readFormToDraft() {
        if (!isEditableSession()) {
            return ensureDraft();
        }
        const get = (id) => $(id);
        const num = (id, fallback) => {
            const v = Number(get(id)?.value);
            return Number.isFinite(v) ? v : fallback;
        };
        const checked = (id) => !!get(id)?.checked;
        draft = presets.normalizeBurnStyle({
            enableSource: checked('burnStyleEnableSource'),
            marginV: num('burnStyleMarginV', 40),
            marginL: num('burnStyleMarginL', 40),
            marginR: num('burnStyleMarginR', 40),
            lineGap: num('burnStyleLineGap', 28),
            alignment: num('burnStyleAlign', 2),
            lineOrder: get('burnStyleLineOrder')?.value || 'target-first',
            target: {
                fontName: get('burnStyleTargetFont')?.value,
                fontSize: num('burnStyleTargetSize', 22),
                primaryColor: get('burnStyleTargetColor')?.value,
                shadow: num('burnStyleTargetShadow', 0),
                shadowColor: get('burnStyleTargetShadowColor')?.value,
                borderStyle: num('burnStyleTargetBorder', 1),
                outline: num('burnStyleTargetOutline', 2),
                outlineColor: get('burnStyleTargetOutlineColor')?.value,
                outlineAlpha: num('burnStyleTargetOutlineAlpha', 100),
                bold: checked('burnStyleTargetBold'),
                italic: checked('burnStyleTargetItalic'),
            },
            source: {
                fontName: get('burnStyleSourceFont')?.value,
                fontSize: num('burnStyleSourceSize', 16),
                primaryColor: get('burnStyleSourceColor')?.value,
                shadow: num('burnStyleSourceShadow', 0),
                shadowColor: get('burnStyleSourceShadowColor')?.value,
                borderStyle: num('burnStyleSourceBorder', 1),
                outline: num('burnStyleSourceOutline', 1),
                outlineColor: get('burnStyleSourceOutlineColor')?.value,
                outlineAlpha: num('burnStyleSourceOutlineAlpha', 100),
                bold: checked('burnStyleSourceBold'),
                italic: checked('burnStyleSourceItalic'),
            },
        });
        return draft;
    }

    function updatePreview() {
        const s = ensureDraft();
        const box = $('burnStylePreviewBox');
        const targetEl = $('burnStylePreviewTarget');
        const sourceEl = $('burnStylePreviewSource');
        if (!box || !s) return;
        const t = s.target;
        const o = s.source;
        const shadowCss = (line) => {
            if (!line.shadow) return 'none';
            const a = Math.max(0.25, Math.min(0.85, 0.35 + line.shadow * 0.08));
            const hex = String(line.shadowColor || '#000000').replace('#', '');
            if (!/^[0-9a-fA-F]{6}$/.test(hex)) return `1px 1px ${line.shadow}px rgba(0,0,0,${a})`;
            const r = parseInt(hex.slice(0, 2), 16);
            const g = parseInt(hex.slice(2, 4), 16);
            const b = parseInt(hex.slice(4, 6), 16);
            return `1px 1px ${Math.max(1, line.shadow)}px rgba(${r},${g},${b},${a})`;
        };
        const applyLine = (el, line) => {
            if (!el) return;
            el.style.fontFamily = `"${line.fontName}", "Microsoft YaHei", sans-serif`;
            el.style.fontSize = `${Math.max(12, Math.min(36, line.fontSize))}px`;
            el.style.color = line.primaryColor;
            el.style.fontWeight = line.bold ? '700' : '500';
            el.style.fontStyle = line.italic ? 'italic' : 'normal';
            el.style.textShadow = shadowCss(line);
            el.style.webkitTextStroke = line.outline > 0
                ? `${Math.min(2, line.outline * 0.35)}px ${line.outlineColor}`
                : '0';
            if (line.borderStyle === 3) {
                el.style.background = 'rgba(0,0,0,0.72)';
                el.style.padding = '0.15em 0.45em';
                el.style.borderRadius = '2px';
            } else {
                el.style.background = 'transparent';
                el.style.padding = '0';
            }
        };
        applyLine(targetEl, t);
        applyLine(sourceEl, o);
        if (sourceEl) sourceEl.classList.toggle('hidden', !s.enableSource);
        const alignMap = {
            1: 'flex-start', 2: 'center', 3: 'flex-end',
            4: 'flex-start', 5: 'center', 6: 'flex-end',
            7: 'flex-start', 8: 'center', 9: 'flex-end',
        };
        const vMap = {
            1: 'flex-end', 2: 'flex-end', 3: 'flex-end',
            4: 'center', 5: 'center', 6: 'center',
            7: 'flex-start', 8: 'flex-start', 9: 'flex-start',
        };
        box.style.justifyContent = alignMap[s.alignment] || 'center';
        box.style.alignItems = vMap[s.alignment] || 'flex-end';
        const stack = $('burnStylePreviewStack');
        if (stack) {
            stack.style.gap = `${Math.max(2, Math.round(s.lineGap / 6))}px`;
            stack.style.flexDirection = s.lineOrder === 'source-first' ? 'column' : 'column-reverse';
        }
        const hint = $('burnStylePresetHint');
        if (hint && presets.summarizeStyle) {
            hint.textContent = presets.summarizeStyle(s);
        }
    }

    function renderList() {
        const list = $('burnStylePresetList');
        if (!list || !presets.listAllPresets) return;
        const all = presets.listAllPresets();
        const active = editingId || '';
        list.innerHTML = all.map((p) => {
            const selected = p.id === active ? ' is-selected' : '';
            const gate = presets.canUsePreset
                ? presets.canUsePreset(p.id, { proEntitled })
                : { ok: !!proEntitled || p.free };
            const locked = !gate.ok;
            const mark = p.builtin
                ? (p.free
                    ? '<span class="burn-style-preset-builtin">免费</span>'
                    : '<span class="burn-style-preset-builtin is-pro">Pro</span>')
                : '<span class="burn-style-preset-builtin">自定义</span>';
            const lockCls = locked ? ' is-locked' : '';
            return `<button type="button" class="burn-style-preset-item${selected}${lockCls}" data-preset-id="${escapeHtml(p.id)}" data-locked="${locked ? '1' : '0'}" role="option" aria-selected="${p.id === active ? 'true' : 'false'}">
                <span class="burn-style-preset-item-name">${escapeHtml(p.name)}${mark}</span>
                <span class="burn-style-preset-item-detail">${escapeHtml(p.detail || (presets.summarizeStyle ? presets.summarizeStyle(p.style) : ''))}</span>
            </button>`;
        }).join('');
    }

    function promptPro(label) {
        if (typeof global.promptProUnlockRequired === 'function') {
            try { void global.promptProUnlockRequired({ featureLabel: label || '烧录样式预设' }); } catch (_) { /* ignore */ }
        }
    }

    async function refreshProEntitled() {
        try {
            const st = await electron?.transubAdvancedGetStatus?.();
            proEntitled = !!(st?.entitled || st?.status?.entitled || st?.devUnlock);
        } catch (_) {
            proEntitled = !!hostApi?.isProEntitled?.();
        }
        if (typeof hostApi?.isProEntitled === 'function') {
            proEntitled = !!hostApi.isProEntitled() || proEntitled;
        }
        return proEntitled;
    }

    function loadPreset(id) {
        const pack = presets.getPreset?.(id);
        if (!pack) {
            setStatus('找不到该预设', 'error');
            return;
        }
        const gate = presets.canUsePreset
            ? presets.canUsePreset(pack.id, { proEntitled })
            : { ok: !!proEntitled || pack.free };
        if (!gate.ok) {
            setStatus(gate.error || '该预设需要 Pro', 'error');
            if (gate.needPro) promptPro(pack.name);
            return;
        }
        editingId = pack.id;
        draft = presets.normalizeBurnStyle(pack.style);
        const nameEl = $('burnStylePresetName');
        if (nameEl) nameEl.value = pack.builtin ? pack.name : pack.name;
        syncFormFromDraft();
        renderList();
        setStatus(
            pack.free
                ? `已载入免费「${pack.name}」`
                : (pack.builtin ? `已载入内置「${pack.name}」` : `已载入「${pack.name}」`),
            'ok',
        );
    }

    async function ensureProForEdit() {
        if (proEntitled) return { ok: true };
        if (!electron?.transubAdvancedRequireFeature) {
            return { ok: false, error: '编辑/自定义样式需要 Pro', needPro: true };
        }
        const res = await electron.transubAdvancedRequireFeature({ featureId: 'assStyleExport' });
        if (res?.ok) {
            proEntitled = true;
            return { ok: true };
        }
        return {
            ok: false,
            error: res?.error || res?.message || '编辑/自定义样式需要 Pro',
            needPro: true,
        };
    }

    function newDraftFromCurrent() {
        void (async () => {
            const gate = await ensureProForEdit();
            if (!gate.ok) {
                setStatus(gate.error, 'error');
                if (gate.needPro) promptPro('自定义烧录样式');
                return;
            }
            editingId = '';
            const fromHost = hostApi?.getBurnStyle?.();
            draft = presets.normalizeBurnStyle(fromHost || presets.defaultBurnStyle?.());
            const nameEl = $('burnStylePresetName');
            if (nameEl) nameEl.value = '我的样式';
            syncFormFromDraft();
            renderList();
            setStatus('新建自定义预设', 'ok');
        })();
    }

    function applyToBurn() {
        if (isEditableSession()) readFormToDraft();
        else ensureDraft();
        const applyId = editingId || '';
        if (applyId) {
            const gate = presets.canUsePreset
                ? presets.canUsePreset(applyId, { proEntitled })
                : { ok: true };
            if (!gate.ok) {
                setStatus(gate.error || '该预设需要 Pro', 'error');
                if (gate.needPro) promptPro('烧录样式预设');
                return;
            }
        } else if (!proEntitled) {
            setStatus('免费用户请选择「观影白字」或「大字号观影」后应用', 'error');
            return;
        }
        const pack = applyId ? presets.getPreset?.(applyId) : null;
        const styleSource = pack?.style || draft;
        const basic = presets.toBasicStyle?.(styleSource) || styleSource;
        if (typeof hostApi?.applyBurnStyle === 'function') {
            hostApi.applyBurnStyle(basic, {
                presetId: applyId || '',
                presetName: pack?.name || $('burnStylePresetName')?.value || '',
            });
        }
        setStatus('已应用到烧录参数', 'ok');
        closeModal();
    }

    function saveCustom() {
        void (async () => {
            const gate = await ensureProForEdit();
            if (!gate.ok) {
                setStatus(gate.error, 'error');
                if (gate.needPro) promptPro('保存烧录样式');
                return;
            }
            readFormToDraft();
            const name = $('burnStylePresetName')?.value || '我的样式';
            const existing = editingId ? presets.getPreset?.(editingId) : null;
            if (existing?.builtin) {
                const created = presets.upsertCustomPreset?.({
                    name,
                    detail: presets.summarizeStyle?.(draft) || '',
                    style: draft,
                });
                if (!created?.ok) {
                    setStatus(created?.error || '保存失败', 'error');
                    return;
                }
                editingId = created.preset.id;
                setStatus(`已另存为「${created.preset.name}」`, 'ok');
                renderList();
                syncEditorEditable();
                return;
            }
            const res = presets.upsertCustomPreset?.({
                id: editingId || undefined,
                name,
                detail: presets.summarizeStyle?.(draft) || '',
                style: draft,
                createdAt: existing?.createdAt,
            });
            if (!res?.ok) {
                setStatus(res?.error || '保存失败', 'error');
                return;
            }
            editingId = res.preset.id;
            setStatus(`已保存「${res.preset.name}」`, 'ok');
            renderList();
            syncEditorEditable();
        })();
    }

    function deleteCustom() {
        void (async () => {
            const gate = await ensureProForEdit();
            if (!gate.ok) {
                setStatus(gate.error, 'error');
                if (gate.needPro) promptPro('删除烧录样式');
                return;
            }
            if (!editingId) return;
            const pack = presets.getPreset?.(editingId);
            if (!pack || pack.builtin) {
                setStatus('不能删除内置预设', 'error');
                return;
            }
            if (!window.confirm(`确定删除自定义预设「${pack.name}」？`)) return;
            const res = presets.deleteCustomPreset?.(editingId);
            if (!res?.ok) {
                setStatus(res?.error || '删除失败', 'error');
                return;
            }
            setStatus('已删除', 'ok');
            const free = presets.defaultFreePreset?.() || presets.getBuiltin?.('watch-white');
            if (free) loadPreset(free.id);
            else {
                editingId = '';
                draft = presets.normalizeBurnStyle(presets.defaultBurnStyle?.());
                syncFormFromDraft();
                renderList();
            }
        })();
    }

    function openModal() {
        void (async () => {
            await refreshProEntitled();
            await ensureSystemFonts();
            const modal = $('burnStylePresetsModal');
            if (!modal) return;
            open = true;
            modal.classList.remove('hidden');
            modal.hidden = false;
            const fromHost = hostApi?.getBurnStyle?.();
            const activeId = hostApi?.getActivePresetId?.() || '';
            const canActive = activeId && presets.canUsePreset
                ? presets.canUsePreset(activeId, { proEntitled }).ok
                : !!activeId;
            if (activeId && canActive && presets.getPreset?.(activeId)) {
                loadPreset(activeId);
            } else {
                const free = presets.defaultFreePreset?.() || presets.getBuiltin?.('watch-white');
                if (free && (!proEntitled || !fromHost)) {
                    loadPreset(free.id);
                } else {
                    editingId = '';
                    draft = presets.normalizeBurnStyle(fromHost || free?.style || presets.defaultBurnStyle?.());
                    const nameEl = $('burnStylePresetName');
                    if (nameEl && !nameEl.value) nameEl.value = free?.name || '当前样式';
                    syncFormFromDraft();
                    renderList();
                }
            }
            if (!proEntitled) {
                setStatus('免费可用观影白字 / 大字号观影；编辑与其它预设需 Pro', 'ok');
            } else {
                setStatus(systemFonts.length ? `已加载本机字体 ${systemFonts.length} 个` : '');
            }
        })();
    }

    function closeModal() {
        const modal = $('burnStylePresetsModal');
        if (modal) {
            modal.classList.add('hidden');
            modal.hidden = true;
        }
        open = false;
    }

    function bind() {
        if (bound) return;
        // Workspace burn DOM is a lazy fragment — do not mark bound until chip/modal exist,
        // otherwise click handlers never attach and the preset chip appears dead.
        if (!$('burnStylePresetsBtn') || !$('burnStylePresetsModal')) return;
        bound = true;

        $('burnStylePresetsBtn')?.addEventListener('click', () => openModal());
        $('burnStylePresetsCloseBtn')?.addEventListener('click', () => closeModal());
        $('burnStylePresetsCancelBtn')?.addEventListener('click', () => closeModal());
        $('burnStylePresetsModal')?.addEventListener('click', (ev) => {
            if (ev.target === $('burnStylePresetsModal')) closeModal();
        });
        $('burnStylePresetApplyBtn')?.addEventListener('click', () => applyToBurn());
        $('burnStylePresetSaveBtn')?.addEventListener('click', () => saveCustom());
        $('burnStylePresetNewBtn')?.addEventListener('click', () => newDraftFromCurrent());
        $('burnStylePresetDeleteBtn')?.addEventListener('click', () => deleteCustom());

        $('burnStylePresetList')?.addEventListener('click', (ev) => {
            const btn = ev.target?.closest?.('[data-preset-id]');
            if (!btn) return;
            loadPreset(btn.getAttribute('data-preset-id'));
        });

        const liveIds = [
            'burnStyleEnableSource', 'burnStyleMarginV', 'burnStyleMarginL', 'burnStyleMarginR',
            'burnStyleLineGap', 'burnStyleAlign', 'burnStyleLineOrder',
            'burnStyleTargetFont', 'burnStyleTargetSize', 'burnStyleTargetColor',
            'burnStyleTargetShadow', 'burnStyleTargetShadowColor', 'burnStyleTargetBorder',
            'burnStyleTargetOutline', 'burnStyleTargetOutlineColor', 'burnStyleTargetOutlineAlpha',
            'burnStyleTargetBold', 'burnStyleTargetItalic',
            'burnStyleSourceFont', 'burnStyleSourceSize', 'burnStyleSourceColor',
            'burnStyleSourceShadow', 'burnStyleSourceShadowColor', 'burnStyleSourceBorder',
            'burnStyleSourceOutline', 'burnStyleSourceOutlineColor', 'burnStyleSourceOutlineAlpha',
            'burnStyleSourceBold', 'burnStyleSourceItalic',
        ];
        liveIds.forEach((id) => {
            const el = $(id);
            if (!el) return;
            const evName = el.type === 'checkbox' || el.tagName === 'SELECT' || el.type === 'color' ? 'change' : 'input';
            el.addEventListener(evName, () => {
                if (!isEditableSession()) return;
                readFormToDraft();
                const sourceFields = $('burnStyleSourceFields');
                if (sourceFields) sourceFields.classList.toggle('is-disabled', !draft.enableSource);
                updatePreview();
            });
        });

        document.addEventListener('keydown', (ev) => {
            if (!open) return;
            if (ev.key === 'Escape') closeModal();
        });
    }

    function init(api) {
        hostApi = api || {};
        bind();
    }

    global.TransubSubtitleBurnStylePresetsUi = {
        init,
        open: openModal,
        close: closeModal,
        isOpen: () => open,
        isBound: () => bound,
        setProEntitled: (v) => { proEntitled = !!v; },
    };
}(typeof globalThis !== 'undefined' ? globalThis : window));
