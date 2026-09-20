/**
 * Main-window app / engine log auto-scroll preference.
 * Default on; persisted in localStorage (UI chrome, not settings.json).
 */
(function (global) {
    const STORAGE_KEY = 'transub.logAutoScroll';

    function readEnabled() {
        try {
            return localStorage.getItem(STORAGE_KEY) !== '0';
        } catch (_) {
            return true;
        }
    }

    function writeEnabled(on) {
        try {
            localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
        } catch (_) { /* ignore */ }
    }

    function isEnabled(checkboxEl) {
        if (checkboxEl && typeof checkboxEl.checked === 'boolean') return !!checkboxEl.checked;
        return readEnabled();
    }

    function scheduleFrame(fn) {
        if (typeof requestAnimationFrame === 'function') {
            return requestAnimationFrame(fn);
        }
        return setTimeout(fn, 16);
    }

    /**
     * Resolve the last rendered log line inside a `.log-panel` (or a host node).
     * @param {Element} panel
     * @returns {Element|null}
     */
    function resolveLastLogLine(panel) {
        if (!panel || !panel.querySelector) return panel?.lastElementChild || null;
        const host = panel.querySelector('#logHost, #inferLogHost')
            || (panel.id === 'logHost' || panel.id === 'inferLogHost' ? panel : null)
            || panel;
        return host.lastElementChild || host;
    }

    /**
     * Pin the scrollport to the latest line. Prefer scrollIntoView so browsers
     * lay out content-visibility / deferred rows before measuring; always also
     * assign scrollTop so the panel itself (not only ancestors) settles at end.
     * @param {Element} panel
     */
    function applyScrollToBottom(panel) {
        if (!panel) return;
        const last = resolveLastLogLine(panel);
        if (last && typeof last.scrollIntoView === 'function') {
            try {
                last.scrollIntoView({ block: 'end', inline: 'nearest', behavior: 'auto' });
            } catch (_) {
                try {
                    last.scrollIntoView(false);
                } catch (__) { /* ignore */ }
            }
        }
        try {
            panel.scrollTop = panel.scrollHeight;
        } catch (_) { /* ignore */ }
    }

    function scrollPanel(panel, checkboxEl) {
        if (!panel || !isEnabled(checkboxEl)) return;
        applyScrollToBottom(panel);
        // Opening the sheet / rAF-flushed DOM / content-visibility estimates can
        // leave scrollHeight stale in the same turn — settle once more next frame.
        scheduleFrame(() => {
            if (!isEnabled(checkboxEl)) return;
            applyScrollToBottom(panel);
        });
    }

    const api = {
        STORAGE_KEY,
        readEnabled,
        writeEnabled,
        isEnabled,
        resolveLastLogLine,
        applyScrollToBottom,
        scrollPanel,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    global.TransubLogAutoScroll = api;
}(typeof window !== 'undefined' ? window : globalThis));
