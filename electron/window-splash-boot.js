const fs = require('fs');

/**
 * Reveal a BrowserWindow once, then optionally load the real page after a splash.
 * Mirrors the main-window pattern in window-manager.js so secondary windows feel
 * responsive instead of sitting blank while index.html boots.
 *
 * @param {import('electron').BrowserWindow} win
 * @param {{
 *   splashHtml?: string,
 *   mainHtml: string,
 *   mainSearch?: string,
 *   splashSearch?: string,
 *   splashRevealMs?: number,
 *   fallbackRevealMs?: number,
 *   onReveal?: () => void,
 *   onMainLoaded?: () => void,
 * }} opts
 */
function attachSplashThenLoad(win, opts = {}) {
    const splashHtml = String(opts.splashHtml || '');
    const mainHtml = String(opts.mainHtml || '');
    const mainSearch = String(opts.mainSearch || '');
    const splashSearch = String(opts.splashSearch || '');
    const splashRevealMs = Number.isFinite(opts.splashRevealMs) ? opts.splashRevealMs : 280;
    const fallbackRevealMs = Number.isFinite(opts.fallbackRevealMs) ? opts.fallbackRevealMs : 450;
    const onReveal = typeof opts.onReveal === 'function' ? opts.onReveal : null;
    const onMainLoaded = typeof opts.onMainLoaded === 'function' ? opts.onMainLoaded : null;

    let revealed = false;
    const reveal = () => {
        if (revealed || !win || win.isDestroyed()) return;
        revealed = true;
        if (onReveal) onReveal();
        else {
            if (!win.isVisible()) win.show();
            try { win.focus(); } catch (_) { /* ignore */ }
        }
    };

    const loadMain = () => {
        if (!win || win.isDestroyed() || !mainHtml) return;
        const loadOpts = mainSearch ? { search: mainSearch } : undefined;
        void win.loadFile(mainHtml, loadOpts);
    };

    if (onMainLoaded) {
        win.webContents.on('did-finish-load', () => {
            if (win.isDestroyed() || win.webContents.isDestroyed()) return;
            // Ignore the splash document; only notify after the real page loads.
            try {
                const url = String(win.webContents.getURL() || '');
                if (splashHtml && /splash\.html(?:\?|#|$)/i.test(url)) return;
            } catch (_) { /* ignore */ }
            onMainLoaded();
        });
    }

    const useSplash = !!(splashHtml && mainHtml && fs.existsSync(splashHtml));
    if (useSplash) {
        let mainQueued = false;
        const showThenLoadMain = () => {
            reveal();
            if (mainQueued || !win || win.isDestroyed()) return;
            mainQueued = true;
            loadMain();
        };
        void win.loadFile(splashHtml, splashSearch ? { search: splashSearch } : undefined);
        win.once('ready-to-show', showThenLoadMain);
        setTimeout(showThenLoadMain, splashRevealMs);
        return { reveal, usedSplash: true };
    }

    void win.loadFile(mainHtml, mainSearch ? { search: mainSearch } : undefined);
    win.once('ready-to-show', reveal);
    setTimeout(reveal, fallbackRevealMs);
    return { reveal, usedSplash: false };
}

module.exports = {
    attachSplashThenLoad,
};
