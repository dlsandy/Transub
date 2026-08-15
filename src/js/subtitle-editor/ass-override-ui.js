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
        } = ctx;

        let bound = false;

        function isAssContext() {
            const fmt = String(state.format || '').toLowerCase();
            return fmt === 'ass' || fmt === 'ssa' || !!state.showAssStyleColumn;
        }

        function syncToolbarVisibility() {
            const on = isAssContext();
            els.assOverrideBar?.classList.toggle('hidden', !on);
            els.assPreviewBadge?.classList.toggle('hidden', !on);
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

        function lookupStyle(styleName) {
            if (!stylesCore?.parseStylesFromHeader) return null;
            const header = Array.isArray(state.header) ? state.header : [];
            const styles = stylesCore.parseStylesFromHeader(header).styles || [];
            const want = String(styleName || 'Default').toLowerCase();
            return styles.find((s) => String(s.name || '').toLowerCase() === want) || styles[0] || null;
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

            wrap.classList.add('ass-approx-preview');
            wrap.setAttribute('data-an', String(align.an));
            wrap.classList.toggle('ass-align-top', align.row === 'top');
            wrap.classList.toggle('ass-align-middle', align.row === 'middle');
            wrap.classList.toggle('ass-align-bottom', align.row === 'bottom');
            wrap.classList.toggle('ass-align-left', align.col === 'left');
            wrap.classList.toggle('ass-align-center', align.col === 'center');
            wrap.classList.toggle('ass-align-right', align.col === 'right');

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

            if (badge) {
                badge.classList.remove('hidden');
                badge.classList.remove('is-jassub');
                badge.textContent = '近似预览';
                badge.title = 'CSS 近似预览（非 libass）。颜色/对齐/字号按 Style 与 {\\an} 等常见 override 估算。';
            }
            return { used: true, preview };
        }

        function resetOverlayStyles() {
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
                    }
                });
            });
            syncToolbarVisibility();
        }

        return {
            bindUi,
            syncToolbarVisibility,
            applyPreviewToOverlay,
            resetOverlayStyles,
            isAssContext,
        };
    }

    global.TransubEditorParts = global.TransubEditorParts || {};
    global.TransubEditorParts.installAssOverrideUi = installAssOverrideUi;
}(typeof globalThis !== 'undefined' ? globalThis : window));
