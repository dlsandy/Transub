/**
 * Titlebar badge: show upgrade icon after the version label when a newer build is known.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAppUpdateBadge = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function appUpdateBadgeFactory() {
    /**
     * @param {{
     *   getButtonEl: () => HTMLElement|null|undefined,
     *   openUpdateWindow: (opts?: { autoCheck?: boolean }) => unknown,
     *   onAvailable?: (cb: (payload: object) => void) => (() => void)|void,
     *   getAvailability?: () => Promise<object|null|undefined>|object|null|undefined,
     * }} deps
     */
    function createAppUpdateBadge(deps) {
        const d = deps || {};
        let bound = false;

        function applyNotice(payload) {
            const btn = typeof d.getButtonEl === 'function' ? d.getButtonEl() : null;
            if (!btn) return;
            const available = !!payload?.updateAvailable;
            const latest = String(payload?.latestVersion || '').trim().replace(/^v/i, '');
            btn.hidden = !available;
            btn.classList.toggle('hidden', !available);
            btn.setAttribute('aria-hidden', available ? 'false' : 'true');
            if (available && latest) {
                const label = `发现新版本 v${latest}`;
                btn.title = label;
                btn.setAttribute('aria-label', `${label}，打开更新中心`);
            } else {
                btn.title = '发现新版本';
                btn.setAttribute('aria-label', '发现新版本，打开更新中心');
            }
        }

        function bind() {
            if (bound) return;
            bound = true;
            const btn = typeof d.getButtonEl === 'function' ? d.getButtonEl() : null;
            if (btn && !btn.dataset.updateBadgeBound) {
                btn.dataset.updateBadgeBound = '1';
                btn.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    try {
                        void d.openUpdateWindow?.({ autoCheck: true });
                    } catch { /* ignore */ }
                });
            }
            if (typeof d.onAvailable === 'function') {
                d.onAvailable((payload) => applyNotice(payload || {}));
            }
            try {
                const pending = typeof d.getAvailability === 'function' ? d.getAvailability() : null;
                if (pending && typeof pending.then === 'function') {
                    void pending.then((res) => applyNotice(res || {})).catch(() => {});
                } else if (pending) {
                    applyNotice(pending);
                }
            } catch { /* ignore */ }
        }

        return {
            bind,
            applyNotice,
        };
    }

    return {
        createAppUpdateBadge,
    };
}));
