/**
 * 字幕编辑器 — 模态框与焦点恢复
 */
(function (global) {
    function installModals(ctx) {
        if (!ctx?.state || !ctx?.els) {
            throw new Error('installModals(ctx): ctx.state, ctx.els required');
        }

        const electron = global.__ELECTRON__;

        function isElementFocusable(el) {
            if (!el || typeof el.focus !== 'function') return false;
            if (el.disabled) return false;
            if (el.closest('.editor-modal:not(.hidden)')) return false;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            return true;
        }

        function clearStaleFocus() {
            const active = document.activeElement;
            if (!active || active === document.body) return;
            if (active.closest?.('.editor-modal.hidden, .editor-modal:not(.hidden)')) {
                if (typeof active.blur === 'function') active.blur();
            }
        }

        function pickEditorFocusTarget() {
            const { state, els } = ctx;
            if (state.selectedIndex >= 0 && isElementFocusable(els.detailText)) {
                return els.detailText;
            }
            if (isElementFocusable(els.detailStart)) return els.detailStart;
            if (isElementFocusable(els.detailPane)) return els.detailPane;
            if (isElementFocusable(els.listWrap)) return els.listWrap;
            return null;
        }

        function applyEditorFocus() {
            if (typeof window.focus === 'function') window.focus();
            const target = pickEditorFocusTarget();
            if (!target) return;
            try {
                target.focus({ preventScroll: true });
            } catch (_) {
                target.focus();
            }
        }

        function restoreEditorFocus() {
            clearStaleFocus();
            // 多拍几次：原生对话框 / 模态关闭后 Windows 焦点常延迟归还
            setTimeout(() => {
                clearStaleFocus();
                requestAnimationFrame(applyEditorFocus);
            }, 0);
            setTimeout(() => {
                clearStaleFocus();
                applyEditorFocus();
            }, 50);
            setTimeout(() => {
                clearStaleFocus();
                applyEditorFocus();
            }, 160);
        }

        function requestOsRefocus() {
            if (electron?.transubEditorRefocus) {
                void electron.transubEditorRefocus().catch(() => {});
            }
            restoreEditorFocus();
        }

        function releaseFocusFromModal(modalEl) {
            const active = document.activeElement;
            if (active && modalEl?.contains(active) && typeof active.blur === 'function') {
                active.blur();
            }
        }

        /**
         * 确认对话框。优先走主进程 MessageBox（避免 window.confirm 在 Windows 上抢走焦点后无法输入）。
         * @returns {Promise<boolean>}
         */
        async function editorConfirm(message, options = {}) {
            const text = String(message || '').trim() || '确定？';
            if (electron?.transubEditorConfirm) {
                try {
                    const res = await electron.transubEditorConfirm({
                        message: text,
                        detail: options.detail || '',
                        title: options.title || '确认',
                        okLabel: options.okLabel || '确定',
                        cancelLabel: options.cancelLabel || '取消',
                        type: options.type || 'question',
                    });
                    restoreEditorFocus();
                    return !!res?.confirmed;
                } catch (_) {
                    // fall through to sync confirm
                }
            }
            const ok = window.confirm(text);
            requestOsRefocus();
            return ok;
        }

        function showEditorModal(modalEl, focusEl) {
            if (!modalEl) return;
            modalEl.classList.remove('hidden');
            modalEl.removeAttribute('inert');
            const focusTarget = focusEl || modalEl.querySelector('input:not([disabled]), button, textarea');
            requestAnimationFrame(() => {
                if (isElementFocusable(focusTarget)) {
                    try {
                        focusTarget.focus({ preventScroll: true });
                    } catch (_) {
                        focusTarget.focus();
                    }
                }
            });
        }

        function hideEditorModal(modalEl) {
            if (!modalEl) return;
            releaseFocusFromModal(modalEl);
            modalEl.classList.add('hidden');
            modalEl.setAttribute('inert', '');
            // 模态「取消」后同样需要向 OS 索回焦点，否则编辑框可能点不进去
            requestOsRefocus();
        }

        ctx.isElementFocusable = isElementFocusable;
        ctx.clearStaleFocus = clearStaleFocus;
        ctx.pickEditorFocusTarget = pickEditorFocusTarget;
        ctx.restoreEditorFocus = restoreEditorFocus;
        ctx.requestOsRefocus = requestOsRefocus;
        ctx.releaseFocusFromModal = releaseFocusFromModal;
        ctx.editorConfirm = editorConfirm;
        ctx.showEditorModal = showEditorModal;
        ctx.hideEditorModal = hideEditorModal;

        return ctx;
    }

    global.TransubEditorParts = global.TransubEditorParts || {};
    global.TransubEditorParts.installModals = installModals;
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this));
