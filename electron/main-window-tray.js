const { app, BrowserWindow, Tray, Menu, screen, powerMonitor } = require('electron');
const { getTrayIcon, applyWindowIcon } = require('./icons');
const { sendNotification } = require('./notifications');
const { hasActiveTask, getActiveTaskLabel, stopActiveJobs } = require('./active-task-guard');

const DEFAULT_TRAY_TOOLTIP = 'Transub 字幕生成';
/** Treat resume / unlock within this window as a GPU-surface stale event. */
const POWER_RESUME_STALE_MS = 120_000;
/** Off-screen park position so an opacity-0 window cannot steal clicks. */
const SOFT_PARK_POS = Object.freeze({ x: -32000, y: -32000 });
const USE_SOFT_PARK = process.platform === 'win32';
/** Second setBounds delay for long-hide compositor wake (cross event-loop). */
const SOFT_UNPARK_STEP2_MS = 150;
/** How often to nudge the parked HWND so Chromium keeps a live frame. */
const SOFT_PARK_KEEPALIVE_MS = 40_000;

/**
 * Tray hide/show, soft-park (Windows), compositor wake, and secondary-window
 * minimize guards for the main BrowserWindow.
 *
 * @param {{
 *   getMainWindow: () => import('electron').BrowserWindow | null,
 *   isQuitting: () => boolean,
 *   ensureMainWindow: () => import('electron').BrowserWindow | null,
 *   confirmQuitApp: () => void | Promise<void>,
 *   dialogShowMessageBox: (win: import('electron').BrowserWindow, opts: object) => Promise<{ response: number }>,
 * }} deps
 */
function createMainWindowTray(deps) {
    const {
        getMainWindow,
        isQuitting,
        ensureMainWindow,
        confirmQuitApp,
        dialogShowMessageBox,
    } = deps;

    let tray = null;
    let trayHintShown = false;
    let trayProgressEnabled = false;
    /** When true, clicking minimize hides the main window to the system tray. */
    let minimizeToTrayEnabled = true;
    /** @type {string} */
    let downloadTrayTip = '';

    /**
     * Windows: closing OR minimizing another BrowserWindow (owned child OR
     * sibling like the subtitle editor) can spuriously fire the main window's
     * `minimize`, which we map to hide-to-tray + skipTaskbar — looks like the
     * app quit. A quick restore after that spurious minimize can also leave the
     * main surface blank (native chrome + backgroundColor only) until a
     * compositor nudge.
     */
    let suppressMinimizeToTrayUntil = 0;
    let secondaryWindowMinimizeGuardAttached = false;
    /** Snapshot: only restore if main was visible when suppress was first armed. */
    let mainVisibleWhenSuppressArmed = false;
    /** True after intentional hide-to-tray until the main window is shown again. */
    let mainHiddenToTray = false;
    /**
     * Secondary close/minimize while main is already in the tray can freeze the
     * Chromium surface (opacity dance / compositor). Mark so the next show path
     * uses a stronger wake instead of leaving chrome + backgroundColor only.
     */
    let mainNeedsRepaintOnShow = false;
    /**
     * Display sleep / OS resume / lock-screen while the main HWND is hidden often
     * drops the Chromium/DWM backing store. Next show needs the longest wake
     * schedule — not only after LONG_TRAY_HIDE_MS.
     */
    let mainNeedsExtendedRepaintOnShow = false;
    /** Timestamp of last powerMonitor resume / unlock-screen (0 = never). */
    let lastPowerResumeAt = 0;
    let powerResumeRepaintGuardAttached = false;
    /** Timestamp when main was last intentionally hidden to tray (0 = not hidden). */
    let mainHiddenToTrayAt = 0;
    let mainRepaintTimer = null;
    /**
     * After hide-to-tray, re-enable Chromium background throttling so FrameEvictor
     * does not cull frames while `disable_hidden` is stuck (Electron #42378).
     * Cleared on reveal; never call setBackgroundThrottling(false) while hidden
     * (Electron #50250). Soft-park on Windows avoids hide() entirely, but we still
     * throttle while parked to save CPU.
     */
    let trayThrottleTimer = null;
    /** Soft-park surface keep-alive (periodic ±1px nudge while off-screen). */
    let softParkKeepAliveTimer = null;
    /** Deferred second step of soft-unpark two-phase bounds restore. */
    let softUnparkStep2Timer = null;
    /** Long tray hide / GPU-busy sessions need more delayed compositor kicks. */
    const LONG_TRAY_HIDE_MS = 30_000;
    /**
     * Delay before re-enabling throttling while hard-hidden (macOS/Linux).
     * Do NOT use this on Windows soft-park — re-throttling while parked lets
     * FrameEvictor cull the surface during long ASR/MT tasks.
     */
    const TRAY_THROTTLE_ENABLE_MS = 1500;

    /** True while hideToTray is mid park/hide (suppress show/focus side effects). */
    let hideToTrayInProgress = false;

    /**
     * Saved geometry while soft-parked on Windows (null when not parked).
     * @type {{ x: number, y: number, width: number, height: number, isMaximized: boolean } | null}
     */
    let softParkSnapshot = null;
    /** One blank-surface reload per reveal cycle. */
    let blankReloadArmed = false;
    /** Hidden duration snapshot for blank-recovery heuristics on reveal. */
    let lastRevealHiddenForMs = 0;

    function mainWindow() {
        return getMainWindow();
    }

    function setMainBackgroundThrottling(enabled) {
        const win = mainWindow();
        if (!win || win.isDestroyed()) return;
        try {
            win.webContents?.setBackgroundThrottling?.(!!enabled);
        } catch (_) { /* ignore */ }
    }

    function clearTrayThrottleTimer() {
        if (!trayThrottleTimer) return;
        clearTimeout(trayThrottleTimer);
        trayThrottleTimer = null;
    }

    function clearSoftParkKeepAlive() {
        if (!softParkKeepAliveTimer) return;
        clearInterval(softParkKeepAliveTimer);
        softParkKeepAliveTimer = null;
    }

    function clearSoftUnparkStep2() {
        if (!softUnparkStep2Timer) return;
        clearTimeout(softUnparkStep2Timer);
        softUnparkStep2Timer = null;
    }

    /**
     * Hard-hide only (macOS / Linux): re-enable throttling shortly after hide so
     * FrameEvictor does not desync when backgroundThrottling was left disabled
     * (Electron #42378 / #50250). Never schedule this on Windows soft-park.
     */
    function scheduleTrayBackgroundThrottling() {
        if (USE_SOFT_PARK) return;
        clearTrayThrottleTimer();
        trayThrottleTimer = setTimeout(() => {
            trayThrottleTimer = null;
            if (!mainHiddenToTray || !mainWindow() || mainWindow().isDestroyed()) return;
            setMainBackgroundThrottling(true);
        }, TRAY_THROTTLE_ENABLE_MS);
    }

    /**
     * Long ASR/MT while soft-parked: Chromium still evicts frames for an
     * opacity-0 off-screen HWND. A tiny bounds nudge at the park position keeps
     * DelegatedFrameHost alive without flashing on-screen.
     */
    function softParkSurfaceNudge(win) {
        if (!USE_SOFT_PARK || !win || win.isDestroyed() || !mainHiddenToTray) return;
        try {
            const w = Math.max(100, softParkSnapshot?.width || win.getBounds().width || 1100);
            const h = Math.max(100, softParkSnapshot?.height || win.getBounds().height || 640);
            win.setBounds({
                x: SOFT_PARK_POS.x,
                y: SOFT_PARK_POS.y,
                width: w,
                height: Math.max(100, h - 1),
            });
            setTimeout(() => {
                if (!mainHiddenToTray || !win || win.isDestroyed()) return;
                try {
                    win.setBounds({
                        x: SOFT_PARK_POS.x,
                        y: SOFT_PARK_POS.y,
                        width: w,
                        height: h,
                    });
                } catch (_) { /* ignore */ }
                try { win.webContents?.invalidate?.(); } catch (_) { /* ignore */ }
            }, 40);
        } catch (_) { /* ignore */ }
    }

    function scheduleSoftParkKeepAlive() {
        if (!USE_SOFT_PARK) return;
        clearSoftParkKeepAlive();
        softParkKeepAliveTimer = setInterval(() => {
            const win = mainWindow();
            if (!mainHiddenToTray || !win || win.isDestroyed()) {
                clearSoftParkKeepAlive();
                return;
            }
            softParkSurfaceNudge(win);
        }, SOFT_PARK_KEEPALIVE_MS);
        if (typeof softParkKeepAliveTimer.unref === 'function') {
            softParkKeepAliveTimer.unref();
        }
    }

    function isMainVisiblyOpen() {
        const win = mainWindow();
        if (!win || win.isDestroyed()) return false;
        // Soft-park keeps isVisible() true — tray flag is the source of truth.
        if (mainHiddenToTray) return false;
        try {
            return win.isVisible() && !win.isMinimized();
        } catch (_) {
            return false;
        }
    }

    function markMainCompositorStale({ extended = true, wakeIfVisible = false } = {}) {
        mainNeedsRepaintOnShow = true;
        if (extended) mainNeedsExtendedRepaintOnShow = true;
        // Only wake immediately when asked (power resume / unlock). display-metrics
        // fires often (taskbar, DPI) and must not flicker a visible window.
        if (wakeIfVisible && isMainVisiblyOpen()) {
            scheduleMainWindowRepaint({ strong: true, extended: true });
        }
    }

    function attachPowerResumeRepaintGuard() {
        if (powerResumeRepaintGuardAttached) return;
        powerResumeRepaintGuardAttached = true;
        const onPowerResume = () => {
            lastPowerResumeAt = Date.now();
            markMainCompositorStale({ extended: true, wakeIfVisible: true });
        };
        try {
            powerMonitor.on('resume', onPowerResume);
            powerMonitor.on('unlock-screen', onPowerResume);
        } catch (_) { /* ignore */ }
        try {
            screen.on('display-metrics-changed', () => {
                if (mainHiddenToTray) {
                    markMainCompositorStale({ extended: true, wakeIfVisible: false });
                }
            });
        } catch (_) { /* ignore */ }
    }

    /**
     * Windows: keep the HWND "shown" to Chromium (no BrowserWindow.hide) so
     * FrameEvictor does not cull the backing store. Park off-screen with opacity 0.
     * Keep backgroundThrottling disabled for the whole park — re-enabling it for
     * long GPU-busy tasks is what blanks the client on restore.
     */
    function softParkMainWindow(win) {
        if (!win || win.isDestroyed()) return;
        clearSoftUnparkStep2();
        try {
            if (typeof win.setOpacity === 'function') win.setOpacity(0);
        } catch (_) { /* ignore */ }
        try {
            if (win.isMinimized()) win.restore();
        } catch (_) { /* ignore */ }

        const isMaximized = !!win.isMaximized();
        let bounds;
        try {
            bounds = (isMaximized && typeof win.getNormalBounds === 'function')
                ? win.getNormalBounds()
                : win.getBounds();
        } catch (_) {
            bounds = { x: 100, y: 100, width: 1100, height: 640 };
        }
        softParkSnapshot = {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
            isMaximized,
        };

        try {
            if (isMaximized) win.unmaximize();
        } catch (_) { /* ignore */ }
        try { win.setSkipTaskbar(true); } catch (_) { /* ignore */ }
        try {
            if (typeof win.setIgnoreMouseEvents === 'function') {
                win.setIgnoreMouseEvents(true);
            }
        } catch (_) { /* ignore */ }
        try {
            win.setBounds({
                x: SOFT_PARK_POS.x,
                y: SOFT_PARK_POS.y,
                width: Math.max(100, softParkSnapshot.width),
                height: Math.max(100, softParkSnapshot.height),
            });
        } catch (_) {
            try { win.setPosition(SOFT_PARK_POS.x, SOFT_PARK_POS.y); } catch (_) { /* ignore */ }
        }
        // Ensure Chromium still treats the window as shown (never hide on win32).
        try {
            if (!win.isVisible()) win.showInactive();
        } catch (_) {
            try { win.show(); } catch (_) { /* ignore */ }
        }
        setMainBackgroundThrottling(false);
    }

    /**
     * Restore soft-parked geometry with a two-step bounds change across event-loop
     * turns. After a long park a single setBounds often does not submit a fresh
     * frame (same class of bug as WebContentsView long-hide blanks).
     */
    function softUnparkMainWindow(win, options = {}) {
        if (!win || win.isDestroyed()) return;
        const activate = options.activate !== false;
        clearSoftParkKeepAlive();
        clearSoftUnparkStep2();
        const snap = softParkSnapshot;
        softParkSnapshot = null;
        try {
            if (typeof win.setIgnoreMouseEvents === 'function') {
                win.setIgnoreMouseEvents(false);
            }
        } catch (_) { /* ignore */ }
        try { win.setSkipTaskbar(false); } catch (_) { /* ignore */ }

        const applyFinalBounds = () => {
            if (!win || win.isDestroyed() || mainHiddenToTray) return;
            if (snap) {
                try {
                    win.setBounds({
                        x: snap.x,
                        y: snap.y,
                        width: snap.width,
                        height: snap.height,
                    });
                } catch (_) { /* ignore */ }
            }
            if (snap?.isMaximized) {
                try {
                    if (!win.isMaximized()) win.maximize();
                } catch (_) { /* ignore */ }
            }
            forceMainWindowRepaint({ strong: true });
        };

        if (snap) {
            // Step 1: on-screen at height-1 so Chromium registers a real resize.
            try {
                win.setBounds({
                    x: snap.x,
                    y: snap.y,
                    width: snap.width,
                    height: Math.max(100, snap.height - 1),
                });
            } catch (_) { /* ignore */ }
        }
        try {
            if (typeof win.setOpacity === 'function') win.setOpacity(1);
        } catch (_) { /* ignore */ }
        try {
            if (win.isMinimized()) win.restore();
        } catch (_) { /* ignore */ }
        try {
            if (activate) win.show();
            else if (typeof win.showInactive === 'function') win.showInactive();
            else win.show();
        } catch (_) { /* ignore */ }

        // Step 2: final bounds on a later turn — required after long eviction.
        softUnparkStep2Timer = setTimeout(() => {
            softUnparkStep2Timer = null;
            applyFinalBounds();
        }, SOFT_UNPARK_STEP2_MS);
    }

    /** Classic hide path for non-Windows (macOS / Linux). */
    function hardHideMainWindow(win) {
        try {
            if (process.platform !== 'darwin' && typeof win.setOpacity === 'function') {
                win.setOpacity(0);
            }
        } catch (_) { /* ignore */ }
        try {
            if (win.isMinimized()) win.restore();
        } catch (_) { /* ignore */ }
        try { win.setSkipTaskbar(true); } catch (_) { /* ignore */ }
        try { win.hide(); } catch (_) { /* ignore */ }
        try {
            if (typeof win.setOpacity === 'function') win.setOpacity(1);
        } catch (_) { /* ignore */ }
    }

    function ensureSoftParked(win) {
        if (!USE_SOFT_PARK || !win || win.isDestroyed()) return;
        try { win.setSkipTaskbar(true); } catch (_) { /* ignore */ }
        try {
            if (typeof win.setOpacity === 'function') win.setOpacity(0);
        } catch (_) { /* ignore */ }
        try {
            if (typeof win.setIgnoreMouseEvents === 'function') {
                win.setIgnoreMouseEvents(true);
            }
        } catch (_) { /* ignore */ }
        // Re-park if something moved the window back on-screen.
        try {
            const b = win.getBounds();
            if (b.x > -10000 || b.y > -10000) {
                if (!softParkSnapshot) {
                    softParkSnapshot = {
                        x: b.x,
                        y: b.y,
                        width: b.width,
                        height: b.height,
                        isMaximized: !!win.isMaximized(),
                    };
                }
                win.setBounds({
                    x: SOFT_PARK_POS.x,
                    y: SOFT_PARK_POS.y,
                    width: Math.max(100, softParkSnapshot.width || b.width),
                    height: Math.max(100, softParkSnapshot.height || b.height),
                });
            }
        } catch (_) { /* ignore */ }
        try {
            if (win.isVisible()) { /* keep shown */ }
            else win.showInactive();
        } catch (_) { /* ignore */ }
    }

    function hideToTray() {
        const win = mainWindow();
        if (!win || win.isDestroyed()) return;
        // Re-entering hide while already tray-hidden must not re-run park/hide
        // dances (freezes WebContents). Spurious minimize from settings/editor
        // commonly hits this path.
        if (mainHiddenToTray) {
            mainNeedsRepaintOnShow = true;
            if (USE_SOFT_PARK) {
                ensureSoftParked(win);
                setMainBackgroundThrottling(false);
                scheduleSoftParkKeepAlive();
            } else {
                try { win.setSkipTaskbar(true); } catch (_) { /* ignore */ }
                try {
                    if (win.isVisible()) win.hide();
                } catch (_) { /* ignore */ }
                scheduleTrayBackgroundThrottling();
            }
            return;
        }
        hideToTrayInProgress = true;
        try {
            // Set flag before park/hide so move/resize persistence does not
            // capture soft-park off-screen coordinates.
            mainHiddenToTray = true;
            mainHiddenToTrayAt = Date.now();
            blankReloadArmed = true;
            if (USE_SOFT_PARK) {
                softParkMainWindow(win);
                scheduleSoftParkKeepAlive();
            } else {
                hardHideMainWindow(win);
                scheduleTrayBackgroundThrottling();
            }
        } finally {
            hideToTrayInProgress = false;
        }
    }

    /**
     * Wake Chromium/DWM after tray hide or spurious minimize→restore. Without
     * this, the main window can stay visibly open but paint only backgroundColor,
     * or accept no clicks while the backend keeps running.
     * Never call setSize/setBounds here: on Windows, getBounds→setBounds (and
     * setSize ±1px) often fails to round-trip frame/DPI, so closing settings
     * grew the main window by a pixel each time.
     *
     * Do not steal OS focus from secondary windows (subtitle library / editor /
     * settings). Focusing main webContents while the user is in the library is
     * what makes the main window “mysteriously pop up”.
     */
    function forceMainWindowRepaint({ strong = false, _retry = 0 } = {}) {
        const win = mainWindow();
        if (!win || win.isDestroyed()) return;
        try {
            if (mainHiddenToTray) return;
            // Windows can report not-visible/minimized for a tick after show();
            // reschedule instead of silently skipping the compositor wake.
            if (win.isMinimized() || !win.isVisible()) {
                if (_retry < 8) {
                    setTimeout(() => forceMainWindowRepaint({ strong, _retry: _retry + 1 }), 40);
                }
                return;
            }
            if (typeof win.setOpacity === 'function') {
                if (strong && process.platform === 'win32') {
                    try { win.setOpacity(0.99); } catch (_) { /* ignore */ }
                }
                win.setOpacity(1);
            }
            if (strong && process.platform === 'win32' && typeof win.setHasShadow === 'function') {
                try {
                    const shadowed = typeof win.hasShadow === 'function'
                        ? !!win.hasShadow()
                        : true;
                    win.setHasShadow(false);
                    win.setHasShadow(shadowed);
                } catch (_) { /* ignore */ }
            }
            const wc = win.webContents;
            if (wc && !wc.isDestroyed()) {
                if (strong && typeof wc.setBackgroundThrottling === 'function') {
                    try {
                        wc.setBackgroundThrottling(true);
                        wc.setBackgroundThrottling(false);
                    } catch (_) { /* ignore */ }
                }
                if (typeof wc.invalidate === 'function') wc.invalidate();
                let mainFocused = false;
                try { mainFocused = win.isFocused(); } catch (_) { /* ignore */ }
                if (mainFocused) {
                    try { wc.focus(); } catch (_) { /* ignore */ }
                }
                void wc.executeJavaScript(
                    `(() => {
                        try {
                            const root = document.documentElement;
                            if (root) {
                                const prev = root.style.transform;
                                root.style.transform = 'translateZ(0)';
                                void root.offsetHeight;
                                root.style.transform = prev;
                            }
                        } catch (_) { /* ignore */ }
                        window.dispatchEvent(new Event('resize'));
                    })();`,
                    true,
                ).catch(() => {});
            }
        } catch (_) { /* ignore */ }
    }

    function scheduleMainWindowRepaint({ strong = false, extended = false } = {}) {
        forceMainWindowRepaint({ strong });
        if (mainRepaintTimer) clearTimeout(mainRepaintTimer);
        const passes = extended
            ? [40, 120, 280, 520, 900, 1600, 2800, 4500]
            : (strong ? [40, 120, 280, 520] : [50, 200]);
        let i = 0;
        const runNext = () => {
            mainRepaintTimer = null;
            forceMainWindowRepaint({ strong: strong || extended });
            i += 1;
            if (i < passes.length) {
                mainRepaintTimer = setTimeout(runNext, passes[i] - (passes[i - 1] || 0));
            }
        };
        mainRepaintTimer = setTimeout(runNext, passes[0]);
    }

    /**
     * Last-resort recovery when the client area is still blank after soft-unpark
     * / compositor wakes. DOM layout alone is a weak signal (FrameEvictor blanks
     * leave a healthy DOM — Electron #42378). Prefer verifying chrome (opacity /
     * on-screen bounds) and a second two-step nudge; reload only when those fail
     * or the DOM probe finds an empty shell.
     */
    function ensureMainSurfaceAlive() {
        const win = mainWindow();
        if (!win || win.isDestroyed() || mainHiddenToTray) return;
        if (!blankReloadArmed) return;
        const wc = win.webContents;
        if (!wc || wc.isDestroyed()) return;
        const hiddenForMs = lastRevealHiddenForMs;

        const chromeLooksParkedOrInvisible = () => {
            try {
                if (typeof win.getOpacity === 'function' && win.getOpacity() < 0.95) {
                    return true;
                }
                const b = win.getBounds();
                if (b.x < -10000 || b.y < -10000) return true;
                if (!win.isVisible() || win.isMinimized()) return true;
            } catch (_) {
                return true;
            }
            return false;
        };

        const forceTwoStepNudge = () => {
            if (!blankReloadArmed || mainHiddenToTray || win.isDestroyed()) return;
            try {
                if (typeof win.setOpacity === 'function') win.setOpacity(1);
                win.setSkipTaskbar(false);
                const b = (win.isMaximized() && typeof win.getNormalBounds === 'function')
                    ? win.getNormalBounds()
                    : win.getBounds();
                const target = {
                    x: Math.max(-5000, b.x),
                    y: Math.max(-5000, b.y),
                    width: Math.max(100, b.width),
                    height: Math.max(100, b.height),
                };
                // If still soft-parked off-screen, snap back via display work area.
                if (target.x < -10000 || target.y < -10000) {
                    try {
                        const { getPrimaryDisplay } = screen;
                        const wa = getPrimaryDisplay()?.workArea
                            || { x: 80, y: 80, width: 1100, height: 700 };
                        target.x = wa.x + 40;
                        target.y = wa.y + 40;
                        target.width = Math.min(target.width, wa.width - 80);
                        target.height = Math.min(target.height, wa.height - 80);
                    } catch (_) {
                        target.x = 80;
                        target.y = 80;
                    }
                }
                win.setBounds({
                    ...target,
                    height: Math.max(100, target.height - 1),
                });
                setTimeout(() => {
                    if (mainHiddenToTray || win.isDestroyed()) return;
                    try { win.setBounds(target); } catch (_) { /* ignore */ }
                    try { win.show(); } catch (_) { /* ignore */ }
                    forceMainWindowRepaint({ strong: true });
                }, SOFT_UNPARK_STEP2_MS);
            } catch (_) { /* ignore */ }
        };

        const reloadOnce = (reason) => {
            if (!blankReloadArmed) return;
            blankReloadArmed = false;
            console.warn(`[main-window-tray] blank surface after tray restore (${reason}) — reloading renderer once`);
            try { wc.reload(); } catch (_) { /* ignore */ }
        };

        const checkAndMaybeReload = () => {
            if (!blankReloadArmed) return;
            if (!win || win.isDestroyed() || mainHiddenToTray) return;
            if (wc.isDestroyed() || wc.isLoading()) return;

            if (chromeLooksParkedOrInvisible()) {
                forceTwoStepNudge();
                // Give the nudge a tick, then reload if chrome is still wrong.
                setTimeout(() => {
                    if (!blankReloadArmed || mainHiddenToTray || win.isDestroyed()) return;
                    if (chromeLooksParkedOrInvisible()) {
                        reloadOnce('chrome-still-parked');
                        return;
                    }
                    blankReloadArmed = false;
                }, SOFT_UNPARK_STEP2_MS + 80);
                return;
            }

            void wc.executeJavaScript(
                `(() => {
                    const el = document.querySelector('.app-header')
                        || document.querySelector('#filePanel')
                        || document.body?.firstElementChild;
                    if (!el) return false;
                    const r = el.getBoundingClientRect();
                    if (r.width <= 10 || r.height <= 10) return false;
                    const text = (document.body && document.body.innerText) || '';
                    return text.replace(/\\s+/g, '').length > 8;
                })();`,
                true,
            ).then((ok) => {
                if (!blankReloadArmed) return;
                if (ok) {
                    blankReloadArmed = false;
                    return;
                }
                reloadOnce(hiddenForMs >= LONG_TRAY_HIDE_MS ? 'empty-dom-after-long-park' : 'empty-dom');
            }).catch(() => {
                blankReloadArmed = false;
            });
        };

        // After soft-unpark step2 (~150ms) + paint, nudge again for long hides.
        const nudgeAt = hiddenForMs >= LONG_TRAY_HIDE_MS ? 400 : 280;
        setTimeout(forceTwoStepNudge, nudgeAt);
        setTimeout(checkAndMaybeReload, nudgeAt + 400);
        setTimeout(checkAndMaybeReload, nudgeAt + 1000);
    }

    function beginSuppressMinimizeToTray(ms = 800) {
        const now = Date.now();
        if (now >= suppressMinimizeToTrayUntil) {
            mainVisibleWhenSuppressArmed = isMainVisiblyOpen();
        }
        suppressMinimizeToTrayUntil = Math.max(suppressMinimizeToTrayUntil, now + ms);
    }

    function isSuppressMinimizeToTrayActive() {
        return Date.now() < suppressMinimizeToTrayUntil;
    }

    function mainNeedsSpuriousMinimizeUndo() {
        const win = mainWindow();
        if (!win || win.isDestroyed()) return false;
        try {
            if (mainHiddenToTray) return true;
            if (win.isMinimized()) return true;
            if (!USE_SOFT_PARK && !win.isVisible()) return true;
        } catch (_) { /* ignore */ }
        return false;
    }

    /**
     * Undo hide-to-tray / native minimize. Always clear skipTaskbar first:
     * restore() can make the window visible while leaving skipTaskbar true
     * (on-screen window, taskbar already in tray).
     * Always call show() — after minimize→hide, isVisible() can lie on Windows.
     *
     * @param {{ activate?: boolean }} [options]
     *   activate=false → show without taking OS focus (secondary windows stay on top).
     */
    function revealMainWindowChrome(options = {}) {
        const activate = options.activate !== false;
        const win = mainWindow();
        if (!win || win.isDestroyed()) return;
        try {
            const fromTray = mainHiddenToTray;
            const hiddenForMs = fromTray && mainHiddenToTrayAt
                ? (Date.now() - mainHiddenToTrayAt)
                : 0;
            lastRevealHiddenForMs = hiddenForMs;
            const recentPowerResume = lastPowerResumeAt > 0
                && (Date.now() - lastPowerResumeAt) < POWER_RESUME_STALE_MS;
            const strongRepaint = mainNeedsRepaintOnShow || fromTray || recentPowerResume;
            const extendedRepaint = mainNeedsExtendedRepaintOnShow
                || fromTray
                || recentPowerResume
                || (hiddenForMs >= LONG_TRAY_HIDE_MS);
            mainNeedsRepaintOnShow = false;
            mainNeedsExtendedRepaintOnShow = false;
            clearTrayThrottleTimer();
            clearSoftParkKeepAlive();

            mainHiddenToTray = false;
            mainHiddenToTrayAt = 0;

            if (USE_SOFT_PARK && (fromTray || softParkSnapshot)) {
                softUnparkMainWindow(win, { activate });
            } else {
                clearSoftUnparkStep2();
                if (typeof win.setOpacity === 'function') win.setOpacity(1);
                win.setSkipTaskbar(false);
                if (win.isMinimized()) win.restore();
                if (activate) {
                    win.show();
                } else if (typeof win.showInactive === 'function') {
                    win.showInactive();
                } else {
                    win.show();
                }
                if (typeof win.setOpacity === 'function') win.setOpacity(1);
            }

            // Only disable throttling after the HWND is visibly open (#50250 / #42378).
            setMainBackgroundThrottling(false);
            scheduleMainWindowRepaint({
                strong: strongRepaint || extendedRepaint,
                extended: extendedRepaint,
            });
            if (fromTray) ensureMainSurfaceAlive();
            else blankReloadArmed = false;
        } catch (_) { /* ignore */ }
    }

    function anotherTransubWindowFocused() {
        try {
            const win = mainWindow();
            if (!win || win.isDestroyed()) return false;
            const focused = BrowserWindow.getFocusedWindow();
            if (focused && !focused.isDestroyed() && focused.id !== win.id) return true;
            // Dialog / shell handoff: focus may be null briefly; still treat other
            // visible secondaries as owning the session.
            for (const other of BrowserWindow.getAllWindows()) {
                if (!other || other.isDestroyed() || other.id === win.id) continue;
                try {
                    if (other.isVisible() && !other.isMinimized() && other.isFocused()) return true;
                } catch (_) { /* ignore */ }
            }
        } catch (_) { /* ignore */ }
        return false;
    }

    function restoreMainIfHiddenBySpuriousMinimize() {
        if (!isSuppressMinimizeToTrayActive()) return;
        if (!mainVisibleWhenSuppressArmed) return;
        const keepSecondaryFocus = anotherTransubWindowFocused();
        if (!mainNeedsSpuriousMinimizeUndo()) {
            forceMainWindowRepaint();
            return;
        }
        revealMainWindowChrome({ activate: !keepSecondaryFocus });
    }

    function attachSecondaryWindowMinimizeGuardTo(child) {
        if (!child || child.isDestroyed()) return;
        try {
            const win = mainWindow();
            if (win && !win.isDestroyed() && child.id === win.id) return;
        } catch (_) { /* ignore */ }
        if (child.__transubMinimizeGuardAttached) return;
        child.__transubMinimizeGuardAttached = true;

        const armIfSecondary = () => {
            try {
                const win = mainWindow();
                if (!win || win.isDestroyed()) return;
                if (child.id === win.id) return;
                beginSuppressMinimizeToTray();
            } catch (_) { /* ignore */ }
        };
        const recoverFromSecondaryMinimize = () => {
            armIfSecondary();
            setTimeout(() => {
                const win = mainWindow();
                if (!win || win.isDestroyed()) return;
                if (!isSuppressMinimizeToTrayActive()) return;
                if (mainHiddenToTray && !mainVisibleWhenSuppressArmed) {
                    mainNeedsRepaintOnShow = true;
                    return;
                }
                if (mainVisibleWhenSuppressArmed && mainNeedsSpuriousMinimizeUndo()) {
                    revealMainWindowChrome({ activate: !anotherTransubWindowFocused() });
                    return;
                }
                forceMainWindowRepaint();
            }, 0);
        };
        child.on('close', armIfSecondary);
        child.on('minimize', recoverFromSecondaryMinimize);
        child.on('closed', () => {
            if (mainHiddenToTray && !mainVisibleWhenSuppressArmed) {
                mainNeedsRepaintOnShow = true;
            }
            if (isSuppressMinimizeToTrayActive()) {
                restoreMainIfHiddenBySpuriousMinimize();
            }
        });
    }

    function attachOwnedWindowMinimizeGuard() {
        if (secondaryWindowMinimizeGuardAttached) return;
        secondaryWindowMinimizeGuardAttached = true;
        app.on('browser-window-created', (_event, child) => {
            setImmediate(() => attachSecondaryWindowMinimizeGuardTo(child));
        });
        try {
            for (const win of BrowserWindow.getAllWindows()) {
                attachSecondaryWindowMinimizeGuardTo(win);
            }
        } catch (_) { /* ignore */ }
    }

    function showMainWindow() {
        let win = mainWindow();
        if (!win || win.isDestroyed()) {
            win = ensureMainWindow();
            return win;
        }
        revealMainWindowChrome();
        applyWindowIcon(win);
        const focusMain = () => {
            const w = mainWindow();
            if (!w || w.isDestroyed()) return;
            try {
                if (typeof w.setOpacity === 'function') w.setOpacity(1);
                if (w.isMinimized()) w.restore();
                if (!w.isVisible()) w.show();
                w.focus();
                if (typeof w.moveTop === 'function') w.moveTop();
                w.webContents?.focus?.();
            } catch (_) { /* ignore */ }
        };
        focusMain();
        setTimeout(focusMain, 40);
        setTimeout(() => {
            focusMain();
            forceMainWindowRepaint({ strong: true });
        }, 160);
        setTimeout(() => {
            focusMain();
            forceMainWindowRepaint({ strong: true });
        }, 600);
        applyWindowIcon(win);
        return win;
    }

    function maybeShowTrayHint() {
        if (trayHintShown || !tray) return;
        sendNotification('任务已在后台运行，双击托盘图标可查看进度。');
        trayHintShown = true;
    }

    function applyTrayTooltip() {
        if (!tray) return;
        try {
            if (trayProgressEnabled) return;
            tray.setToolTip(downloadTrayTip || DEFAULT_TRAY_TOOLTIP);
        } catch (_) { /* ignore */ }
    }

    /**
     * @param {string} tip
     */
    function setDownloadTrayTip(tip) {
        downloadTrayTip = String(tip || '').trim();
        if (!tray) {
            try { setupTray(); } catch (_) { /* ignore */ }
        }
        applyTrayTooltip();
    }

    function setupTray() {
        if (tray) return;
        const icon = getTrayIcon();
        if (icon.isEmpty()) return;

        tray = new Tray(icon);
        tray.setToolTip(downloadTrayTip || DEFAULT_TRAY_TOOLTIP);

        const contextMenu = Menu.buildFromTemplate([
            { label: '显示任务窗口', click: () => showMainWindow() },
            {
                label: '字幕编辑器',
                click: () => {
                    try {
                        const { openSubtitleEditorOrPick } = require('./subtitle-editor-window');
                        void openSubtitleEditorOrPick(app);
                    } catch (_) { /* ignore */ }
                },
            },
            {
                label: '设置',
                click: () => {
                    try {
                        const { openSettingsWindow } = require('./settings-window');
                        openSettingsWindow(app);
                    } catch (_) { /* ignore */ }
                },
            },
            { type: 'separator' },
            { label: '退出', click: () => { void confirmQuitApp(); } },
        ]);
        tray.setContextMenu(contextMenu);
        tray.on('double-click', () => showMainWindow());
        tray.on('click', () => {
            if (process.platform === 'win32') showMainWindow();
        });
    }

    function attachTrayBehavior(win) {
        let minimizeHideToken = 0;
        let closeConfirmPending = false;
        /**
         * Track whether the main window recently held focus. Windows can fire a
         * spurious main `minimize` when a sibling (editor/settings) minimizes or
         * closes; that path almost never has main focus. A real title-bar /
         * taskbar minimize keeps focus until the event runs (blur is deferred).
         */
        let mainHadUserFocus = false;
        let mainBlurClearTimer = null;
        win.on('focus', () => {
            if (mainBlurClearTimer) {
                clearTimeout(mainBlurClearTimer);
                mainBlurClearTimer = null;
            }
            mainHadUserFocus = true;
            if (hideToTrayInProgress || mainHiddenToTray) return;
            if (isMainVisiblyOpen()) {
                setMainBackgroundThrottling(false);
                if (mainNeedsRepaintOnShow || mainNeedsExtendedRepaintOnShow) {
                    mainNeedsRepaintOnShow = false;
                    mainNeedsExtendedRepaintOnShow = false;
                    scheduleMainWindowRepaint({ strong: true, extended: true });
                }
            }
        });
        win.on('show', () => {
            if (hideToTrayInProgress || mainHiddenToTray) return;
            clearTrayThrottleTimer();
            setMainBackgroundThrottling(false);
        });
        win.on('blur', () => {
            if (mainBlurClearTimer) clearTimeout(mainBlurClearTimer);
            mainBlurClearTimer = setTimeout(() => {
                mainBlurClearTimer = null;
                try {
                    mainHadUserFocus = !win.isDestroyed() && win.isFocused();
                } catch (_) {
                    mainHadUserFocus = false;
                }
            }, 50);
        });

        win.on('close', async (event) => {
            if (isQuitting()) return;
            // Secondary-window close / theme retheme can deliver a real WM_CLOSE
            // to main. Without an active task the default path would destroy main
            // → window-all-closed → force quit. Block that while suppress is armed.
            if (isSuppressMinimizeToTrayActive() && mainVisibleWhenSuppressArmed) {
                event.preventDefault();
                setImmediate(() => {
                    if (isQuitting() || win.isDestroyed()) return;
                    revealMainWindowChrome();
                });
                return;
            }
            if (!hasActiveTask()) return;

            event.preventDefault();
            if (closeConfirmPending) return;
            closeConfirmPending = true;
            try {
                const label = getActiveTaskLabel();
                const { response } = await dialogShowMessageBox(win, {
                    type: 'warning',
                    buttons: ['取消', '后台继续', '停止并关闭'],
                    defaultId: 0,
                    cancelId: 0,
                    title: '任务进行中',
                    message: `${label}仍在运行`,
                    detail: '关闭将中断正在运行的操作。可选择后台继续（托盘查看进度），或停止任务并关闭窗口。',
                });
                if (response === 1) {
                    hideToTray();
                    maybeShowTrayHint();
                } else if (response === 2) {
                    stopActiveJobs();
                    win.destroy();
                } else {
                    try {
                        win.show();
                        win.focus();
                        win.webContents?.focus?.();
                    } catch (_) { /* ignore */ }
                }
            } finally {
                closeConfirmPending = false;
            }
        });

        win.on('minimize', (event) => {
            if (isQuitting()) return;
            if (!minimizeToTrayEnabled) return;
            event.preventDefault();

            const token = ++minimizeHideToken;
            let focusedNow = false;
            try { focusedNow = !win.isDestroyed() && win.isFocused(); } catch (_) { /* ignore */ }
            const userInitiated = mainHadUserFocus || focusedNow;
            const wasHiddenToTray = mainHiddenToTray;
            const shouldUndoAsSpurious = () => {
                if (Date.now() >= suppressMinimizeToTrayUntil) return false;
                // Secondary close / nativeTheme retheme often focuses main first.
                // That must not count as a user title-bar minimize while suppress
                // is armed for a main window that was visibly open.
                if (mainVisibleWhenSuppressArmed) return true;
                return !userInitiated;
            };
            const settleMinimizeToTray = () => {
                if (token !== minimizeHideToken) return;
                if (isQuitting() || !win || win.isDestroyed()) return;
                if (shouldUndoAsSpurious()) {
                    if (!wasHiddenToTray) {
                        revealMainWindowChrome({ activate: !anotherTransubWindowFocused() });
                    } else {
                        mainNeedsRepaintOnShow = true;
                    }
                    return;
                }
                maybeShowTrayHint();
            };

            if (shouldUndoAsSpurious()) {
                settleMinimizeToTray();
                return;
            }
            // Already in tray: do not re-run hideToTray (freezes WebContents).
            if (wasHiddenToTray || mainHiddenToTray) {
                mainNeedsRepaintOnShow = true;
                if (USE_SOFT_PARK) ensureSoftParked(win);
                setTimeout(settleMinimizeToTray, 80);
                return;
            }
            hideToTray();
            setTimeout(settleMinimizeToTray, 80);
        });
    }

    function setTrayProgressEnabled(enabled) {
        trayProgressEnabled = !!enabled;
        if (!trayProgressEnabled) applyTrayTooltip();
    }

    function setMinimizeToTrayEnabled(enabled) {
        minimizeToTrayEnabled = enabled !== false;
    }

    function updateTrayProgress(payload = {}) {
        if (!trayProgressEnabled) return;
        if (!tray) {
            try { setupTray(); } catch (_) { /* ignore */ }
        }
        if (!tray) return;
        try {
            const { buildTrayTooltip } = require('../src/js/eta-core');
            const tip = buildTrayTooltip(payload);
            tray.setToolTip(tip || DEFAULT_TRAY_TOOLTIP);
        } catch {
            const i = Number(payload.index) || 0;
            const t = Number(payload.total) || 0;
            const pct = Number(payload.batchPct);
            let tip = DEFAULT_TRAY_TOOLTIP;
            if (t > 0 && i > 0) tip += ` · 第 ${i}/${t}`;
            if (Number.isFinite(pct)) tip += ` · ${Math.round(pct)}%`;
            if (payload.etaText) tip += ` · 剩余 ${payload.etaText}`;
            tray.setToolTip(tip);
        }
    }

    function clearTrayProgress() {
        if (!tray) return;
        applyTrayTooltip();
    }

    function destroyTray() {
        if (tray) {
            tray.destroy();
            tray = null;
        }
    }

    function onMainWindowClosed() {
        clearTrayThrottleTimer();
        clearSoftParkKeepAlive();
        clearSoftUnparkStep2();
        if (mainRepaintTimer) {
            clearTimeout(mainRepaintTimer);
            mainRepaintTimer = null;
        }
        mainHiddenToTray = false;
        mainHiddenToTrayAt = 0;
        softParkSnapshot = null;
        blankReloadArmed = false;
        lastRevealHiddenForMs = 0;
    }

    function setMainBackgroundThrottlingVisible(enabled) {
        setMainBackgroundThrottling(enabled);
    }

    return {
        hideToTray,
        showMainWindow,
        revealMainWindowChrome,
        maybeShowTrayHint,
        setupTray,
        destroyTray,
        attachTrayBehavior,
        attachOwnedWindowMinimizeGuard,
        attachPowerResumeRepaintGuard,
        setTrayProgressEnabled,
        setMinimizeToTrayEnabled,
        setDownloadTrayTip,
        updateTrayProgress,
        clearTrayProgress,
        beginSuppressMinimizeToTray,
        isSuppressMinimizeToTrayActive,
        restoreMainAfterSecondaryWindowClosed: () => {
            beginSuppressMinimizeToTray();
            restoreMainIfHiddenBySpuriousMinimize();
        },
        onMainWindowClosed,
        setMainBackgroundThrottling: setMainBackgroundThrottlingVisible,
        isMainHiddenToTray: () => mainHiddenToTray,
        isMainVisiblyOpen,
        /** @internal test/helper */
        _softParkSnapshot: () => softParkSnapshot,
    };
}

module.exports = {
    createMainWindowTray,
    USE_SOFT_PARK,
    SOFT_PARK_POS,
    SOFT_UNPARK_STEP2_MS,
    SOFT_PARK_KEEPALIVE_MS,
    DEFAULT_TRAY_TOOLTIP,
};
