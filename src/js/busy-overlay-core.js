/**
 * Full-screen busy overlay for media probe / short blocking work.
 * Separate from #loadingOverlay so boot/dismissLoadingOverlay cannot clobber it.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubBusyOverlay = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function busyOverlayFactory() {
    const OVERLAY_ID = 'transubBusyOverlay';
    const MESSAGE_ID = 'transubBusyOverlayMessage';

    const SHOW_STYLE = [
        'position:fixed',
        'inset:0',
        'z-index:99999',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'background:rgba(15,18,22,0.58)',
        'visibility:visible',
        'opacity:1',
        'pointer-events:auto',
    ].join(';');

    function getDocument() {
        return typeof document !== 'undefined' ? document : null;
    }

    function ensureOverlay(doc) {
        let el = doc.getElementById(OVERLAY_ID);
        if (el) return el;
        el = doc.createElement('div');
        el.id = OVERLAY_ID;
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        el.setAttribute('aria-busy', 'true');
        el.innerHTML = [
            '<div style="min-width:14rem;max-width:22rem;margin:1rem;padding:1.5rem 1.75rem;',
            'border-radius:14px;border:1px solid rgba(255,255,255,0.12);',
            'background:#1c1a1b;color:#f3efef;box-shadow:0 14px 40px rgba(0,0,0,0.35);',
            'text-align:center">',
            '<div style="width:1.75rem;height:1.75rem;margin:0 auto 0.85rem;border:2px solid rgba(255,255,255,0.2);',
            'border-top-color:#e85a6a;border-radius:999px;animation:transubBusySpin 0.7s linear infinite"></div>',
            `<p id="${MESSAGE_ID}" style="margin:0;font-size:0.875rem;font-weight:600">请稍候…</p>`,
            '</div>',
        ].join('');
        if (!doc.getElementById('transubBusyOverlayKeyframes')) {
            const style = doc.createElement('style');
            style.id = 'transubBusyOverlayKeyframes';
            style.textContent = '@keyframes transubBusySpin{to{transform:rotate(360deg)}}';
            doc.head.appendChild(style);
        }
        doc.body.appendChild(el);
        return el;
    }

    function showBusyOverlay(message) {
        const doc = getDocument();
        if (!doc?.body) return null;
        const el = ensureOverlay(doc);
        const msg = doc.getElementById(MESSAGE_ID);
        if (msg && message) msg.textContent = String(message);
        el.style.cssText = SHOW_STYLE;
        if (typeof el.style.setProperty === 'function') {
            el.style.setProperty('display', 'flex', 'important');
            el.style.setProperty('opacity', '1', 'important');
            el.style.setProperty('visibility', 'visible', 'important');
            el.style.setProperty('z-index', '99999', 'important');
        } else {
            el.style.display = 'flex';
            el.style.opacity = '1';
            el.style.visibility = 'visible';
        }
        el.setAttribute('aria-busy', 'true');
        // Keep as last body child so sibling stacking cannot bury it.
        if (el.parentNode === doc.body) doc.body.appendChild(el);
        void el.offsetHeight;
        return el;
    }

    function updateBusyOverlayMessage(message) {
        const doc = getDocument();
        const msg = doc?.getElementById(MESSAGE_ID);
        if (msg && message) msg.textContent = String(message);
    }

    /**
     * Show overlay and wait for a compositor turn.
     * After native file dialogs, a single short timer often is not enough on Electron/Windows —
     * paint is deferred until the invoking async stack settles, which made the mask flash
     * only after probing finished.
     */
    async function showBusyOverlayAndWait(message, options = {}) {
        const settleMs = Math.max(0, Number(options.settleMs));
        const waitMs = Number.isFinite(settleMs) ? settleMs : 120;
        const el = showBusyOverlay(message);
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (el) void el.offsetHeight;
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        return el;
    }

    function hideBusyOverlay() {
        const doc = getDocument();
        const el = doc?.getElementById(OVERLAY_ID);
        if (!el) return;
        el.style.cssText = 'display:none;pointer-events:none;visibility:hidden';
        el.setAttribute('aria-busy', 'false');
    }

    function isBusyOverlayVisible() {
        const doc = getDocument();
        const el = doc?.getElementById(OVERLAY_ID);
        if (!el) return false;
        const css = String(el.style?.cssText || '');
        if (/display\s*:\s*none/i.test(css) || el.style.display === 'none') return false;
        return /display\s*:\s*flex/i.test(css) || el.style.display === 'flex';
    }

    return {
        OVERLAY_ID,
        showBusyOverlay,
        showBusyOverlayAndWait,
        updateBusyOverlayMessage,
        hideBusyOverlay,
        isBusyOverlayVisible,
    };
}));
