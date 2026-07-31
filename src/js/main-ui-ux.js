/**
 * Transub main window UX — toast, confirm, batch summary, undo.
 */
(function (global) {
    const TOAST_MS = { ok: 3200, info: 4000, warn: 5500, err: 7000 };
    let toastHost = null;
    let confirmEl = null;
    let confirmTitle = null;
    let confirmMessage = null;
    let confirmPrimary = null;
    let confirmSecondary = null;
    let confirmTertiary = null;
    let confirmResolve = null;
    let batchSummaryEl = null;
    let batchSummaryTitle = null;
    let batchSummaryBody = null;
    let batchSummaryPrimary = null;
    let batchSummarySecondary = null;
    let batchSummaryResolve = null;
    let shortcutsEl = null;
    let undoEntry = null;
    let undoTimer = null;

    function ensureHosts() {
        toastHost = document.getElementById('toastHost');
        confirmEl = document.getElementById('appConfirmModal');
        confirmTitle = document.getElementById('appConfirmTitle');
        confirmMessage = document.getElementById('appConfirmMessage');
        confirmPrimary = document.getElementById('appConfirmPrimaryBtn');
        confirmSecondary = document.getElementById('appConfirmSecondaryBtn');
        confirmTertiary = document.getElementById('appConfirmTertiaryBtn');
        batchSummaryEl = document.getElementById('batchSummaryModal');
        batchSummaryTitle = document.getElementById('batchSummaryTitle');
        batchSummaryBody = document.getElementById('batchSummaryBody');
        batchSummaryPrimary = document.getElementById('batchSummaryPrimaryBtn');
        batchSummarySecondary = document.getElementById('batchSummarySecondaryBtn');
        shortcutsEl = document.getElementById('shortcutsModal');
    }

    function toneClass(tone) {
        if (tone === 'ok') return 'toast-ok';
        if (tone === 'warn') return 'toast-warn';
        if (tone === 'err') return 'toast-err';
        return 'toast-info';
    }

    function showToast(message, tone = 'info', options = {}) {
        ensureHosts();
        if (!toastHost || !message) return null;
        const row = document.createElement('div');
        row.className = `toast-item ${toneClass(tone)}`;
        row.setAttribute('role', tone === 'err' ? 'alert' : 'status');

        const text = document.createElement('span');
        text.className = 'toast-text';
        text.textContent = String(message);
        row.appendChild(text);

        if (options.actionLabel && typeof options.onAction === 'function') {
            const action = document.createElement('button');
            action.type = 'button';
            action.className = 'toast-action';
            action.textContent = options.actionLabel;
            action.addEventListener('click', (event) => {
                event.stopPropagation();
                options.onAction();
                row.remove();
            });
            row.appendChild(action);
        }

        toastHost.appendChild(row);
        const duration = Number(options.duration) || TOAST_MS[tone] || TOAST_MS.info;
        const timer = setTimeout(() => {
            row.classList.add('toast-out');
            setTimeout(() => row.remove(), 220);
        }, duration);
        row.addEventListener('click', () => {
            clearTimeout(timer);
            row.classList.add('toast-out');
            setTimeout(() => row.remove(), 220);
        });
        return row;
    }

    function closeConfirm(result) {
        if (!confirmEl) return;
        confirmEl.classList.add('hidden');
        confirmEl.classList.remove('flex');
        // Absorb the confirming click so it cannot fall through onto buttons
        // underneath (system-check「重新检测 / 完成 / 一键修复」).
        const prevPe = document.body.style.pointerEvents;
        document.body.style.pointerEvents = 'none';
        setTimeout(() => {
            try { document.body.style.pointerEvents = prevPe || ''; } catch (_) { /* ignore */ }
        }, 280);
        const resolve = confirmResolve;
        confirmResolve = null;
        if (resolve) resolve(result);
    }

    function bindConfirmOnce() {
        if (confirmEl?.dataset.bound === '1') return;
        if (!confirmEl) return;
        confirmEl.dataset.bound = '1';
        confirmPrimary?.addEventListener('click', () => closeConfirm('primary'));
        confirmSecondary?.addEventListener('click', () => closeConfirm('secondary'));
        confirmTertiary?.addEventListener('click', () => closeConfirm('tertiary'));
        confirmEl.addEventListener('click', (event) => {
            if (event.target === confirmEl) closeConfirm('secondary');
        });
        document.addEventListener('keydown', (event) => {
            if (confirmEl?.classList.contains('hidden')) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                closeConfirm('secondary');
            }
        });
    }

    /**
     * @returns {Promise<'primary'|'secondary'|'tertiary'>}
     */
    function confirmDialog(options = {}) {
        ensureHosts();
        bindConfirmOnce();
        if (!confirmEl) {
            const fallback = window.confirm(String(options.message || options.title || '确认？'));
            return Promise.resolve(fallback ? 'primary' : 'secondary');
        }
        if (confirmResolve) closeConfirm('secondary');

        const title = String(options.title || '确认');
        const message = String(options.message || '');
        confirmTitle.textContent = title;
        confirmMessage.textContent = message;

        confirmPrimary.textContent = options.primaryLabel || '确定';
        confirmSecondary.textContent = options.secondaryLabel || '取消';
        confirmPrimary.className = options.danger
            ? 'px-4 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 text-white'
            : 'px-4 py-2 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-700 text-white';

        if (options.tertiaryLabel) {
            confirmTertiary.textContent = options.tertiaryLabel;
            confirmTertiary.classList.remove('hidden');
        } else {
            confirmTertiary.classList.add('hidden');
        }

        confirmEl.classList.remove('hidden');
        confirmEl.classList.add('flex');
        // Keep confirm above fullscreen overlays (e.g. setup wizard at z=200).
        confirmEl.style.zIndex = '5000';
        try {
            // Always re-parent to body so settings-standalone / nested stacking cannot hide it.
            document.body.appendChild(confirmEl);
        } catch (_) { /* ignore */ }

        return new Promise((resolve) => {
            confirmResolve = resolve;
            // Defer focus so the same click/mouseup that opened the dialog cannot hit「确定」.
            setTimeout(() => {
                try {
                    if (confirmEl && !confirmEl.classList.contains('hidden')) {
                        confirmPrimary?.focus?.({ preventScroll: true });
                    }
                } catch (_) { /* ignore */ }
            }, 80);
        });
    }

    async function confirmYesNo(message, options = {}) {
        const result = await confirmDialog({
            title: options.title || '确认',
            message,
            primaryLabel: options.okLabel || '确定',
            secondaryLabel: options.cancelLabel || '取消',
            danger: !!options.danger,
        });
        return result === 'primary';
    }

    function closeBatchSummary(action) {
        if (!batchSummaryEl) return;
        batchSummaryEl.classList.add('hidden');
        batchSummaryEl.classList.remove('flex');
        const resolve = batchSummaryResolve;
        batchSummaryResolve = null;
        if (resolve) resolve(action);
    }

    function bindBatchSummaryOnce() {
        if (batchSummaryEl?.dataset.bound === '1') return;
        if (!batchSummaryEl) return;
        batchSummaryEl.dataset.bound = '1';
        batchSummaryPrimary?.addEventListener('click', () => closeBatchSummary('primary'));
        batchSummarySecondary?.addEventListener('click', () => closeBatchSummary('secondary'));
        batchSummaryEl.addEventListener('click', (event) => {
            if (event.target === batchSummaryEl) closeBatchSummary('secondary');
        });
    }

    function showBatchSummary(options = {}) {
        ensureHosts();
        bindBatchSummaryOnce();
        if (!batchSummaryEl) {
            showToast(options.summaryText || '任务已完成', options.failed > 0 ? 'warn' : 'ok');
            return Promise.resolve('secondary');
        }
        batchSummaryTitle.textContent = options.title || '任务完成';
        batchSummaryBody.textContent = options.summaryText || '';
        batchSummaryPrimary.textContent = options.primaryLabel || '确定';
        batchSummarySecondary.textContent = options.secondaryLabel || '关闭';
        batchSummaryPrimary.classList.toggle('hidden', !options.onPrimary);
        batchSummaryEl.classList.remove('hidden');
        batchSummaryEl.classList.add('flex');
        return new Promise((resolve) => {
            batchSummaryResolve = resolve;
        });
    }

    function openShortcutsModal() {
        ensureHosts();
        if (!shortcutsEl) return;
        shortcutsEl.classList.remove('hidden');
        shortcutsEl.classList.add('flex');
    }

    function closeShortcutsModal() {
        if (!shortcutsEl) return;
        shortcutsEl.classList.add('hidden');
        shortcutsEl.classList.remove('flex');
    }

    function bindShortcutsOnce() {
        if (shortcutsEl?.dataset.bound === '1') return;
        if (!shortcutsEl) return;
        shortcutsEl.dataset.bound = '1';
        document.getElementById('closeShortcutsBtn')?.addEventListener('click', closeShortcutsModal);
        document.getElementById('closeShortcutsBtn2')?.addEventListener('click', closeShortcutsModal);
        shortcutsEl.addEventListener('click', (event) => {
            if (event.target === shortcutsEl) closeShortcutsModal();
        });
    }

    function pushUndo(label, restoreFn, ms = 8000) {
        if (undoTimer) clearTimeout(undoTimer);
        undoEntry = { label, restoreFn };
        showToast(label, 'info', {
            duration: ms,
            actionLabel: '撤销',
            onAction: () => {
                if (undoEntry?.restoreFn) {
                    undoEntry.restoreFn();
                    undoEntry = null;
                    if (undoTimer) clearTimeout(undoTimer);
                    showToast('已撤销', 'ok', { duration: 2000 });
                }
            },
        });
        undoTimer = setTimeout(() => {
            undoEntry = null;
            undoTimer = null;
        }, ms);
    }

    function init() {
        ensureHosts();
        bindConfirmOnce();
        bindBatchSummaryOnce();
        bindShortcutsOnce();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.TransubMainUiUx = {
        showToast,
        confirmDialog,
        confirmYesNo,
        showBatchSummary,
        openShortcutsModal,
        closeShortcutsModal,
        pushUndo,
    };
}(typeof window !== 'undefined' ? window : globalThis));
