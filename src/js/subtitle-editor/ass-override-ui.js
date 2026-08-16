/**
 * ASS override 工具条 + 近似预览刷新
 */
(function (global) {
    function installAssOverrideUi(ctx) {
        if (!ctx?.state || !ctx?.els) {
            throw new Error('installAssOverrideUi(ctx): ctx.state, ctx.els required');
        }
        const core = ctx.assOverrideCore || global.TransubAssOverride;
        const stylesCore = ctx.assStylesCore || global.TransubAssStyles;
        if (!core) throw new Error('installAssOverrideUi: TransubAssOverride required');

        const {
            state,
            els,
            setStatus,
            recordUndoBeforeChange,
            setDirty,
            syncDetailToCue,
            renderCueList,
            renderDetailPane,
            refreshOverlay,
            getSelectedCueIndexes,
        } = ctx;

        let bound = false;
        let lastEffectPresetId = '';

        function isAssContext() {
            const fmt = String(state.format || '').toLowerCase();
            return fmt === 'ass' || fmt === 'ssa' || !!state.showAssStyleColumn;
        }

        function isPixelPreviewActive() {
            try {
                return !!ctx.isPixelPreviewActive?.();
            } catch {
                return false;
            }
        }

        function playRes() {
            const header = Array.isArray(state.header) ? state.header : [];
            let x = 1920;
            let y = 1080;
            for (const line of header) {
                const s = String(line || '');
                const mx = s.match(/^PlayResX:\s*(\d+)/i);
                if (mx) x = Number(mx[1]) || x;
                const my = s.match(/^PlayResY:\s*(\d+)/i);
                if (my) y = Number(my[1]) || y;
            }
            return { playResX: x, playResY: y };
        }

        function cueDurationMs(cue) {
            if (!cue) return 2000;
            const start = Number(cue.startMs) || 0;
            const end = cue.endMs != null && Number.isFinite(Number(cue.endMs))
                ? Number(cue.endMs)
                : start + 2000;
            return Math.max(0, Math.round(end - start));
        }

        function fillEffectPresetSelect() {
            if (!els.assEffectPreset || !core.listEffectPresets) return;
            const presets = core.listEffectPresets();
            const cur = els.assEffectPreset.value || '';
            els.assEffectPreset.innerHTML = '<option value="">特效…</option>'
                + presets.map((p) => `<option value="${escAttr(p.id)}" title="${escAttr(p.detail || '')}">${escAttr(p.label)}</option>`).join('');
            if (cur && [...els.assEffectPreset.options].some((o) => o.value === cur)) {
                els.assEffectPreset.value = cur;
            }
        }

        function fillDialogueEffectSelect(preferred) {
            if (!els.detailAssEffect || !core.listDialogueEffectPresets) return;
            const presets = core.listDialogueEffectPresets();
            const want = core.normalizeDialogueEffect(preferred);
            const names = new Set(presets.map((p) => p.id));
            if (want) names.add(want);
            els.detailAssEffect.innerHTML = [...names].map((id) => {
                const hit = presets.find((p) => p.id === id);
                const label = hit?.label || id;
                return `<option value="${escAttr(id)}">${escAttr(label)}</option>`;
            }).join('');
            if (want && [...els.detailAssEffect.options].some((o) => o.value === want)) {
                els.detailAssEffect.value = want;
            } else {
                els.detailAssEffect.value = '';
            }
        }

        function escAttr(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/"/g, '&quot;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        }

        function syncToolbarVisibility() {
            const on = isAssContext();
            els.assOverrideBar?.classList.toggle('hidden', !on);
            // Don't unhide/overwrite badge while JASSUB owns the pixel preview.
            if (!on) {
                els.assPreviewBadge?.classList.add('hidden');
            } else if (!isPixelPreviewActive()) {
                els.assPreviewBadge?.classList.remove('hidden');
            }
            if (on) {
                fillEffectPresetSelect();
                syncOverrideControls();
            }
        }

        function getTextarea() {
            return els.detailText || null;
        }

        function commitText(nextText, caretOrRange) {
            const ta = getTextarea();
            if (!ta) return;
            recordUndoBeforeChange?.('ass-override');
            ta.value = nextText;
            if (caretOrRange && typeof caretOrRange === 'object') {
                const a = caretOrRange.selectionStart ?? caretOrRange.caret ?? nextText.length;
                const b = caretOrRange.selectionEnd ?? a;
                try {
                    ta.focus();
                    ta.setSelectionRange(a, b);
                } catch { /* ignore */ }
            } else if (typeof caretOrRange === 'number') {
                try {
                    ta.focus();
                    ta.setSelectionRange(caretOrRange, caretOrRange);
                } catch { /* ignore */ }
            }
            syncDetailToCue?.();
            setDirty?.(true);
            renderDetailPane?.();
            renderCueList?.({ listOnly: true, reuseMeta: true });
            refreshOverlay?.(true);
            ctx.onOverrideCommitted?.({ reason: 'ass-override' });
        }

        function applyAn(n) {
            const ta = getTextarea();
            if (!ta) return;
            const next = core.setLeadingOverride(ta.value, `an${n}`);
            commitText(next, 0);
            setStatus(`已设置 {\\an${n}}`, 'ok');
        }

        function toggleBold() {
            const ta = getTextarea();
            if (!ta) return;
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            if (start !== end) {
                const wrapped = core.wrapSelectionWithOverride(ta.value, start, end, 'b1', 'b0');
                commitText(wrapped.text, wrapped);
                setStatus('已对选区加粗 {\\b1}…{\\b0}', 'ok');
                return;
            }
            const next = core.toggleLeadingBoolOverride(ta.value, 'b', 'b1');
            commitText(next, start);
            setStatus('已切换粗体 override', 'ok');
        }

        function toggleItalic() {
            const ta = getTextarea();
            if (!ta) return;
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            if (start !== end) {
                const wrapped = core.wrapSelectionWithOverride(ta.value, start, end, 'i1', 'i0');
                commitText(wrapped.text, wrapped);
                setStatus('已对选区斜体 {\\i1}…{\\i0}', 'ok');
                return;
            }
            const next = core.toggleLeadingBoolOverride(ta.value, 'i', 'i1');
            commitText(next, start);
            setStatus('已切换斜体 override', 'ok');
        }

        function insertN() {
            const ta = getTextarea();
            if (!ta) return;
            const res = core.insertSoftBreak(ta.value, ta.selectionStart, ta.selectionEnd);
            commitText(res.text, res.caret);
            setStatus('已插入软换行 \\N', 'ok');
        }

        function applyColour(hex) {
            const ta = getTextarea();
            if (!ta) return;
            const cmd = core.colourOverrideCommand?.(hex, stylesCore);
            if (!cmd) {
                setStatus('无法生成颜色标签', 'err');
                return;
            }
            const next = core.setLeadingOverride(ta.value, cmd);
            commitText(next, ta.selectionStart);
            setStatus(`已设置 {\\${cmd}}`, 'ok');
        }

        function applyFontSize(deltaOrValue, absolute = false) {
            const ta = getTextarea();
            if (!ta) return;
            const inline = core.parseInlineOverrides(ta.value);
            const styleObj = lookupStyle(state.cues?.[state.selectedIndex]?.ass?.style || 'Default');
            const base = Number(inline.fontsize != null ? inline.fontsize : (styleObj?.fontsize || 48)) || 48;
            const nextSize = absolute
                ? Math.max(8, Math.min(200, Math.round(Number(deltaOrValue) || base)))
                : Math.max(8, Math.min(200, Math.round(base + Number(deltaOrValue || 0))));
            const cmd = core.fontsizeOverrideCommand?.(nextSize);
            if (!cmd) return;
            const next = core.setLeadingOverride(ta.value, cmd);
            commitText(next, ta.selectionStart);
            if (els.assOverrideFs) els.assOverrideFs.value = String(nextSize);
            setStatus(`已设置 {\\${cmd}}`, 'ok');
        }

        function syncOverrideControls() {
            if (!isAssContext()) return;
            const ta = getTextarea();
            const cue = state.selectedIndex >= 0 ? state.cues[state.selectedIndex] : null;
            const text = ta?.value ?? cue?.text ?? '';
            const inline = core.parseInlineOverrides(text);
            const styleObj = lookupStyle(cue?.ass?.style || 'Default');
            if (els.assOverrideColour && stylesCore?.hexFromAssColour) {
                const colour = inline.primaryColour || styleObj?.primaryColour;
                if (colour) els.assOverrideColour.value = stylesCore.hexFromAssColour(colour);
            }
            if (els.assOverrideFs) {
                const size = inline.fontsize != null ? inline.fontsize : (styleObj?.fontsize || 48);
                els.assOverrideFs.value = String(Math.round(Number(size) || 48));
            }
            fillDialogueEffectSelect(cue?.ass?.effect || '');
        }

        function applyEffectPresetId(presetId, { toSelection = false } = {}) {
            const id = String(presetId || '').trim();
            if (!id || !core.applyEffectPreset) return;
            lastEffectPresetId = id;
            const resOpts = { ...playRes() };

            if (toSelection && core.applyEffectPresetToCues) {
                let indexes = typeof getSelectedCueIndexes === 'function' ? getSelectedCueIndexes() : [];
                if (!indexes.length && state.selectedIndex >= 0) indexes = [state.selectedIndex];
                if (!indexes.length) {
                    setStatus('请先选择字幕', 'warn');
                    return;
                }
                recordUndoBeforeChange?.('ass-effect-batch');
                syncDetailToCue?.();
                const applied = core.applyEffectPresetToCues(state.cues, indexes, id, resOpts);
                state.cues = applied.cues;
                setDirty?.(true);
                renderCueList?.({ listOnly: true, reuseMeta: true });
                renderDetailPane?.();
                refreshOverlay?.(true);
                ctx.onOverrideCommitted?.({ reason: 'ass-effect-batch', changed: applied.changed });
                setStatus(applied.changed
                    ? `已对 ${applied.changed} 条应用「${applied.label || id}」`
                    : '选中字幕无需更改', applied.changed ? 'ok' : 'info');
                return;
            }

            const ta = getTextarea();
            if (!ta) return;
            const cue = state.selectedIndex >= 0 ? state.cues[state.selectedIndex] : null;
            const result = core.applyEffectPreset(ta.value, id, {
                ...resOpts,
                cueDurationMs: cueDurationMs(cue),
            });
            if (!result.ok) {
                setStatus(result.error || '应用特效失败', 'err');
                return;
            }
            commitText(result.text, ta.selectionStart);
            setStatus(result.cleared
                ? `已清除特效标签`
                : `已应用「${result.label}」{\\${result.command}}`, 'ok');
        }

        function commitDialogueEffect(value) {
            const idx = state.selectedIndex;
            if (idx < 0 || idx >= state.cues.length) return;
            const cue = state.cues[idx];
            const nextEffect = core.normalizeDialogueEffect(value);
            const prev = String(cue?.ass?.effect || '');
            if (prev === nextEffect) return;
            recordUndoBeforeChange?.('ass-dialogue-effect');
            const ass = cue.ass && typeof cue.ass === 'object' ? { ...cue.ass } : {
                layer: '0', style: 'Default', name: '', marginL: '0', marginR: '0', marginV: '0', effect: '',
            };
            ass.effect = nextEffect;
            state.cues[idx] = { ...cue, ass };
            setDirty?.(true);
            renderCueList?.({ listOnly: true, reuseMeta: true });
            refreshOverlay?.(true);
            ctx.onOverrideCommitted?.({ reason: 'ass-dialogue-effect', index: idx });
            setStatus(nextEffect ? `Effect = ${nextEffect}` : '已清除 Dialogue Effect', 'ok');
        }

        function lookupStyle(styleName) {
            if (!stylesCore?.parseStylesFromHeader) return null;
            const header = Array.isArray(state.header) ? state.header : [];
            const styles = stylesCore.parseStylesFromHeader(header).styles || [];
            const want = String(styleName || 'Default').toLowerCase();
            return styles.find((s) => String(s.name || '').toLowerCase() === want) || styles[0] || null;
        }

        function clearOverlayGeometry(wrap) {
            const el = wrap || els.videoSubtitle;
            if (!el) return;
            el.classList.remove('ass-pos-dragging', 'ass-pos-placed');
            el.style.left = '';
            el.style.right = '';
            el.style.top = '';
            el.style.bottom = '';
            el.style.transform = '';
            el.style.alignItems = '';
        }

        /**
         * Apply approximate CSS to overlay elements for primary (and optional source) text.
         */
        function applyPreviewToOverlay({ primaryText, sourceText, primaryCue }) {
            const badge = els.assPreviewBadge;
            const wrap = els.videoSubtitle;
            const primaryEl = els.videoSubtitleText;
            const sourceEl = els.videoSubtitleSource;
            if (!wrap || !primaryEl) return { used: false };

            // Shared overlay node — always drop leftover drag/pos geometry first.
            clearOverlayGeometry(wrap);

            if (!isAssContext()) {
                wrap.classList.remove('ass-approx-preview');
                wrap.removeAttribute('data-an');
                primaryEl.removeAttribute('style');
                sourceEl?.removeAttribute('style');
                badge?.classList.add('hidden');
                return { used: false };
            }

            const styleName = primaryCue?.ass?.style || 'Default';
            const styleObj = lookupStyle(styleName);
            const preview = core.resolvePreviewStyle(styleObj, primaryText, { stylesCore });
            const align = core.alignmentToCss(preview.alignment);
            const inline = core.parseInlineOverrides?.(primaryText || '') || {};

            wrap.classList.add('ass-approx-preview');
            wrap.setAttribute('data-an', String(align.an));
            wrap.classList.toggle('ass-align-top', align.row === 'top');
            wrap.classList.toggle('ass-align-middle', align.row === 'middle');
            wrap.classList.toggle('ass-align-bottom', align.row === 'bottom');
            wrap.classList.toggle('ass-align-left', align.col === 'left');
            wrap.classList.toggle('ass-align-center', align.col === 'center');
            wrap.classList.toggle('ass-align-right', align.col === 'right');

            // Per-cue {\pos} — only this overlay instance; never bake into Style.
            if (inline.posX != null && inline.posY != null && core.playResToClientPoint && els.video) {
                let playResX = 1920;
                let playResY = 1080;
                if (core.parsePlayResFromHeader) {
                    const pr = core.parsePlayResFromHeader(state.header, 1920, 1080);
                    playResX = pr.playResX;
                    playResY = pr.playResY;
                }
                const pt = core.playResToClientPoint(inline.posX, inline.posY, els.video, playResX, playResY);
                const frame = els.videoFrame?.getBoundingClientRect?.();
                if (pt && frame) {
                    wrap.classList.add('ass-pos-placed');
                    wrap.classList.remove(
                        'ass-align-top', 'ass-align-middle', 'ass-align-bottom',
                        'ass-align-left', 'ass-align-center', 'ass-align-right',
                    );
                    wrap.style.left = `${pt.clientX - frame.left}px`;
                    wrap.style.top = `${pt.clientY - frame.top}px`;
                    wrap.style.right = 'auto';
                    wrap.style.bottom = 'auto';
                    wrap.style.transform = 'translate(-50%, -50%)';
                    wrap.style.alignItems = 'center';
                }
            }

            primaryEl.style.color = preview.color;
            primaryEl.style.fontFamily = preview.fontFamily;
            primaryEl.style.fontSize = `${preview.fontSizePx}px`;
            primaryEl.style.fontWeight = String(preview.fontWeight);
            primaryEl.style.fontStyle = preview.fontStyle;
            primaryEl.textContent = preview.displayText;

            if (sourceEl && sourceText) {
                const srcStyle = lookupStyle('Source') || styleObj;
                const srcPreview = core.resolvePreviewStyle(srcStyle, sourceText, { stylesCore });
                sourceEl.style.color = srcPreview.color;
                sourceEl.style.fontFamily = srcPreview.fontFamily;
                sourceEl.style.fontSize = `${Math.max(12, srcPreview.fontSizePx - 4)}px`;
                sourceEl.style.fontWeight = String(srcPreview.fontWeight);
                sourceEl.style.fontStyle = srcPreview.fontStyle;
                sourceEl.textContent = srcPreview.displayText;
            } else if (sourceEl) {
                sourceEl.removeAttribute('style');
            }

            if (badge && !isPixelPreviewActive()) {
                badge.classList.remove('hidden');
                badge.classList.remove('is-jassub');
                badge.textContent = '近似预览';
                badge.title = 'CSS 近似预览（非 libass）。颜色/对齐/字号按 Style 与 {\\an}/{\\pos} 等常见 override 估算。';
            }
            return { used: true, preview };
        }

        function resetOverlayStyles() {
            clearOverlayGeometry(els.videoSubtitle);
            els.videoSubtitle?.classList.remove(
                'ass-approx-preview',
                'ass-align-top', 'ass-align-middle', 'ass-align-bottom',
                'ass-align-left', 'ass-align-center', 'ass-align-right',
            );
            els.videoSubtitle?.removeAttribute('data-an');
            els.videoSubtitleText?.removeAttribute('style');
            els.videoSubtitleSource?.removeAttribute('style');
            els.assPreviewBadge?.classList.add('hidden');
        }

        function bindUi() {
            if (bound) return;
            bound = true;
            els.assOverrideBar?.querySelectorAll('[data-ass-ov]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const action = btn.getAttribute('data-ass-ov');
                    if (action === 'an') {
                        applyAn(Number(btn.getAttribute('data-an')) || 2);
                        return;
                    }
                    if (action === 'b') {
                        toggleBold();
                        return;
                    }
                    if (action === 'i') {
                        toggleItalic();
                        return;
                    }
                    if (action === 'n') {
                        insertN();
                        return;
                    }
                    if (action === 'fs-dec') {
                        applyFontSize(-2);
                        return;
                    }
                    if (action === 'fs-inc') {
                        applyFontSize(2);
                        return;
                    }
                    if (action === 'fx-sel') {
                        const id = lastEffectPresetId || els.assEffectPreset?.value;
                        if (!id) {
                            setStatus('请先选择特效', 'warn');
                            return;
                        }
                        applyEffectPresetId(id, { toSelection: true });
                    }
                });
            });
            els.assOverrideAn?.addEventListener('change', () => {
                const raw = els.assOverrideAn.value;
                if (!raw) return;
                const an = Number(raw);
                els.assOverrideAn.value = '';
                if (Number.isFinite(an) && an >= 1 && an <= 9) applyAn(an);
            });
            els.assOverrideColour?.addEventListener('change', () => {
                applyColour(els.assOverrideColour.value);
            });
            els.assOverrideFs?.addEventListener('change', () => {
                applyFontSize(els.assOverrideFs.value, true);
            });
            els.assEffectPreset?.addEventListener('change', () => {
                const id = els.assEffectPreset.value;
                if (!id) return;
                lastEffectPresetId = id;
                applyEffectPresetId(id, { toSelection: false });
                els.assEffectPreset.value = '';
            });
            els.detailAssEffect?.addEventListener('change', () => {
                if (state.detailSyncing) return;
                commitDialogueEffect(els.detailAssEffect.value);
            });
            syncToolbarVisibility();
        }

        return {
            bindUi,
            syncToolbarVisibility,
            syncOverrideControls,
            applyEffectPresetId,
            applyPreviewToOverlay,
            resetOverlayStyles,
            isAssContext,
        };
    }

    global.TransubEditorParts = global.TransubEditorParts || {};
    global.TransubEditorParts.installAssOverrideUi = installAssOverrideUi;
}(typeof globalThis !== 'undefined' ? globalThis : window));
