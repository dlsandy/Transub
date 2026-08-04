const { app, BrowserWindow, Tray, Menu, dialog, screen, powerMonitor } = require('electron');
const fs = require('fs');
const path = require('path');
const { resolveHtmlPath, getWritableRoot } = require('./app-paths');
const { getTrayIcon, getWindowIconOption, applyWindowIcon } = require('./icons');
const { sendNotification } = require('./notifications');
const { attachUiZoom } = require('./ui-zoom');
const { clampInt } = require('./shared-utils');
const { hasActiveTask, getActiveTaskLabel, stopActiveJobs } = require('./active-task-guard');

const DEFAULT_TRAY_TOOLTIP = 'Transub 字幕生成';
const WINDOW_STATE_FILE = 'window-state.json';
const DEFAULT_WINDOW = Object.freeze({
    width: 1680,
    height: 1200,
    // Keep header / 添加·开始 / 常用设置 chips on one row (avoid flex-wrap).
    minWidth: 1100,
    minHeight: 640,
});
const SAVE_STATE_DEBOUNCE_MS = 400;
/** Treat resume / unlock within this window as a GPU-surface stale event. */
const POWER_RESUME_STALE_MS = 120_000;

function getWindowStatePath() {
    return path.join(getWritableRoot(), WINDOW_STATE_FILE);
}

function boundsOverlapWorkArea(bounds, workArea) {
    return bounds.x < workArea.x + workArea.width
        && bounds.x + bounds.width > workArea.x
        && bounds.y < workArea.y + workArea.height
        && bounds.y + bounds.height > workArea.y;
}

function sanitizeWindowState(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const width = clampInt(raw.width, DEFAULT_WINDOW.width, DEFAULT_WINDOW.minWidth, 10000);
    const height = clampInt(raw.height, DEFAULT_WINDOW.height, DEFAULT_WINDOW.minHeight, 10000);
    const hasPos = Number.isFinite(Number(raw.x)) && Number.isFinite(Number(raw.y));
    const state = {
        width,
        height,
        isMaximized: !!raw.isMaximized,
    };
    if (hasPos) {
        state.x = Math.round(Number(raw.x));
        state.y = Math.round(Number(raw.y));
        const visible = screen.getAllDisplays().some((d) => boundsOverlapWorkArea(state, d.workArea));
        if (!visible) {
            delete state.x;
            delete state.y;
        }
    }
    return state;
}

function loadWindowState() {
    try {
        const filePath = getWindowStatePath();
        if (!fs.existsSync(filePath)) return null;
        return sanitizeWindowState(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    } catch (err) {
        console.warn('[window-manager] 读取窗口状态失败:', err.message);
        return null;
    }
}

function writeWindowState(state) {
    try {
        const filePath = getWindowStatePath();
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    } catch (err) {
        console.warn('[window-manager] 保存窗口状态失败:', err.message);
    }
}

function captureWindowState(win) {
    if (!win || win.isDestroyed()) return null;
    const isMaximized = win.isMaximized();
    const bounds = (isMaximized && typeof win.getNormalBounds === 'function')
        ? win.getNormalBounds()
        : win.getBounds();
    return sanitizeWindowState({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        isMaximized,
    });
}

function createWindowManager({ getAppRoot, getUserDataPath }) {
    let mainWindow = null;
    let tray = null;
    let trayHintShown = false;
    let isQuitting = false;
    let trayProgressEnabled = false;
    /** When true, clicking minimize hides the main window to the system tray. */
    let minimizeToTrayEnabled = true;
    /** @type {string} */
    let downloadTrayTip = '';
    let saveStateTimer = null;
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
    /** Long tray hide / GPU-busy sessions need more delayed compositor kicks. */
    const LONG_TRAY_HIDE_MS = 30_000;

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
            // System sleep / hibernate wake.
            powerMonitor.on('resume', onPowerResume);
            // Lock screen often accompanies 息屏; unlock alone can leave a blank surface.
            powerMonitor.on('unlock-screen', onPowerResume);
        } catch (_) { /* ignore */ }
        try {
            // Monitor off/on or DPI change may not fire powerMonitor resume.
            // Only flag next tray restore — do not paint-kick a visible window here.
            screen.on('display-metrics-changed', () => {
                if (mainHiddenToTray) {
                    markMainCompositorStale({ extended: true, wakeIfVisible: false });
                }
            });
        } catch (_) { /* ignore */ }
    }

    function hideToTray() {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        // Re-entering hide while already tray-hidden re-runs opacity→restore→hide
        // and often freezes WebContents until a strong compositor wake on show.
        // Spurious minimize from closing settings/editor commonly hits this path.
        if (mainHiddenToTray) {
            mainNeedsRepaintOnShow = true;
            try { mainWindow.setSkipTaskbar(true); } catch (_) { /* ignore */ }
            try {
                if (mainWindow.isVisible()) mainWindow.hide();
            } catch (_) { /* ignore */ }
            return;
        }
        // On Windows the minimize event fires after the shrink animation starts;
        // zero opacity so that frame never paints before hide/skipTaskbar.
        try {
            if (process.platform === 'win32' && typeof mainWindow.setOpacity === 'function') {
                mainWindow.setOpacity(0);
            }
        } catch (_) { /* ignore */ }
        // Critical on Windows: minimize→hide can leave the HWND minimized while
        // hidden. Later show() then paints chrome but WebContents stays frozen
        // (stale UI, no clicks) even though the main process keeps running.
        // Restore while opacity is 0 so clearing minimize does not flash.
        try {
            if (mainWindow.isMinimized()) mainWindow.restore();
        } catch (_) { /* ignore */ }
        try { mainWindow.setSkipTaskbar(true); } catch (_) { /* ignore */ }
        try { mainWindow.hide(); } catch (_) { /* ignore */ }
        mainHiddenToTray = true;
        mainHiddenToTrayAt = Date.now();
        try {
            if (typeof mainWindow.setOpacity === 'function') mainWindow.setOpacity(1);
        } catch (_) { /* ignore */ }
    }

    function isMainVisiblyOpen() {
        if (!mainWindow || mainWindow.isDestroyed()) return false;
        try {
            return mainWindow.isVisible() && !mainWindow.isMinimized();
        } catch (_) {
            return false;
        }
    }

    /**
     * Wake Chromium/DWM after tray hide or spurious minimize→restore. Without
     * this, the main window can stay visibly open but paint only backgroundColor,
     * or accept no clicks while the backend keeps running.
     * Never call setSize/setBounds here: on Windows, getBounds→setBounds (and
     * setSize ±1px) often fails to round-trip frame/DPI, so closing settings
     * grew the main window by a pixel each time.
     */
    function forceMainWindowRepaint({ strong = false, _retry = 0 } = {}) {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        try {
            // Windows can report not-visible/minimized for a tick after show();
            // reschedule instead of silently skipping the compositor wake.
            if (mainWindow.isMinimized() || !mainWindow.isVisible()) {
                if (_retry < 8) {
                    setTimeout(() => forceMainWindowRepaint({ strong, _retry: _retry + 1 }), 40);
                }
                return;
            }
            if (typeof mainWindow.setOpacity === 'function') {
                if (strong && process.platform === 'win32') {
                    // Brief opacity flicker wakes DWM without changing outer size.
                    try { mainWindow.setOpacity(0.99); } catch (_) { /* ignore */ }
                }
                mainWindow.setOpacity(1);
            }
            // After 息屏, toggling the DWM shadow forces a surface recreate without
            // the setSize ±1 growth bug on mixed-DPI setups.
            if (strong && process.platform === 'win32' && typeof mainWindow.setHasShadow === 'function') {
                try {
                    const shadowed = typeof mainWindow.hasShadow === 'function'
                        ? !!mainWindow.hasShadow()
                        : true;
                    mainWindow.setHasShadow(false);
                    mainWindow.setHasShadow(shadowed);
                } catch (_) { /* ignore */ }
            }
            const wc = mainWindow.webContents;
            if (wc && !wc.isDestroyed()) {
                if (typeof wc.invalidate === 'function') wc.invalidate();
                try { wc.focus(); } catch (_) { /* ignore */ }
                // Remeasure layouts / kick compositor without changing outer size.
                // translateZ(0) forces a layer rebuild after GPU context loss on wake.
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
        // Delayed passes: restore/show and GPU wake can finish a tick later on Windows,
        // especially while an ASR/MT/download task is holding the GPU.
        // Stronger schedule after tray restore / secondary-window churn.
        // Extended: long tray hide / display sleep often drops the Chromium backing store.
        // Extra-late passes: monitor power-on can lag behind the tray click by seconds.
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
        if (!mainWindow || mainWindow.isDestroyed()) return false;
        try {
            if (mainHiddenToTray) return true;
            if (mainWindow.isMinimized()) return true;
            if (!mainWindow.isVisible()) return true;
        } catch (_) { /* ignore */ }
        return false;
    }

    /**
     * Undo hide-to-tray / native minimize. Always clear skipTaskbar first:
     * restore() can make the window visible while leaving skipTaskbar true
     * (on-screen window, taskbar already in tray).
     * Always call show() — after minimize→hide, isVisible() can lie on Windows.
     */
    function revealMainWindowChrome() {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        try {
            const fromTray = mainHiddenToTray;
            const hiddenForMs = fromTray && mainHiddenToTrayAt
                ? (Date.now() - mainHiddenToTrayAt)
                : 0;
            const recentPowerResume = lastPowerResumeAt > 0
                && (Date.now() - lastPowerResumeAt) < POWER_RESUME_STALE_MS;
            // Plain tray restore must use the strong wake too — after a long hide
            // (or GPU-bound ASR/MT) the weak [50,200] schedule often leaves a
            // blank #f9fafb client area with native chrome only.
            // 息屏 while hidden often invalidates the GPU surface without a long
            // wall-clock hide; always use the extended schedule when restoring
            // from tray, or when power/display events marked the compositor stale.
            const strongRepaint = mainNeedsRepaintOnShow || fromTray || recentPowerResume;
            const extendedRepaint = mainNeedsExtendedRepaintOnShow
                || fromTray
                || recentPowerResume
                || (hiddenForMs >= LONG_TRAY_HIDE_MS);
            mainNeedsRepaintOnShow = false;
            mainNeedsExtendedRepaintOnShow = false;
            if (typeof mainWindow.setOpacity === 'function') mainWindow.setOpacity(1);
            mainWindow.setSkipTaskbar(false);
            mainHiddenToTray = false;
            mainHiddenToTrayAt = 0;
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            if (typeof mainWindow.setOpacity === 'function') mainWindow.setOpacity(1);
            scheduleMainWindowRepaint({
                strong: strongRepaint || extendedRepaint,
                extended: extendedRepaint,
            });
        } catch (_) { /* ignore */ }
    }

    function restoreMainIfHiddenBySpuriousMinimize() {
        if (!isSuppressMinimizeToTrayActive()) return;
        if (!mainVisibleWhenSuppressArmed) return;
        // Settings/editor close always arms suppress; only restore when main was
        // actually yanked (tray/minimize). Otherwise a no-op path used to resize
        // the main window via the old setSize nudge.
        if (!mainNeedsSpuriousMinimizeUndo()) {
            forceMainWindowRepaint();
            return;
        }
        revealMainWindowChrome();
    }

    function attachSecondaryWindowMinimizeGuardTo(child) {
        if (!child || child.isDestroyed()) return;
        // Never attach to the main window: its own minimize would run the
        // "recover from secondary minimize" path and bounce hide-to-tray.
        try {
            if (mainWindow && !mainWindow.isDestroyed() && child.id === mainWindow.id) return;
        } catch (_) { /* ignore */ }
        // Avoid stacking duplicate listeners if the same window is visited twice.
        if (child.__transubMinimizeGuardAttached) return;
        child.__transubMinimizeGuardAttached = true;

        const armIfSecondary = () => {
            try {
                if (!mainWindow || mainWindow.isDestroyed()) return;
                if (child.id === mainWindow.id) return;
                beginSuppressMinimizeToTray();
            } catch (_) { /* ignore */ }
        };
        const recoverFromSecondaryMinimize = () => {
            armIfSecondary();
            // Minimize of a sibling can blank the main surface even when main
            // never reaches hide-to-tray (visible chrome, empty content).
            // Do not pull the main window out of an intentional tray hide,
            // and do not act outside the suppress window (snapshot stays sticky).
            setTimeout(() => {
                if (!mainWindow || mainWindow.isDestroyed()) return;
                if (!isSuppressMinimizeToTrayActive()) return;
                if (mainHiddenToTray && !mainVisibleWhenSuppressArmed) {
                    // Leave tray alone, but wake hard on the next tray restore.
                    mainNeedsRepaintOnShow = true;
                    return;
                }
                if (mainVisibleWhenSuppressArmed && mainNeedsSpuriousMinimizeUndo()) {
                    revealMainWindowChrome();
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
            // Defer one tick so createMainWindow can assign `mainWindow` before
            // we decide whether this child is the main window.
            setImmediate(() => attachSecondaryWindowMinimizeGuardTo(child));
        });
        // Editor-first startup may open secondary windows before the main window;
        // cover those that already exist when the guard is installed.
        try {
            for (const win of BrowserWindow.getAllWindows()) {
                attachSecondaryWindowMinimizeGuardTo(win);
            }
        } catch (_) { /* ignore */ }
    }

    function showMainWindow() {
        if (!mainWindow || mainWindow.isDestroyed()) {
            createMainWindow();
            return mainWindow;
        }
        revealMainWindowChrome();
        applyWindowIcon(mainWindow);
        const focusMain = () => {
            if (!mainWindow || mainWindow.isDestroyed()) return;
            try {
                if (typeof mainWindow.setOpacity === 'function') mainWindow.setOpacity(1);
                if (mainWindow.isMinimized()) mainWindow.restore();
                if (!mainWindow.isVisible()) mainWindow.show();
                mainWindow.focus();
                if (typeof mainWindow.moveTop === 'function') mainWindow.moveTop();
                mainWindow.webContents?.focus?.();
            } catch (_) { /* ignore */ }
        };
        focusMain();
        // Tray restore under a heavy task often needs a delayed focus/compositor kick.
        setTimeout(focusMain, 40);
        setTimeout(() => {
            focusMain();
            forceMainWindowRepaint({ strong: true });
        }, 160);
        setTimeout(() => {
            focusMain();
            forceMainWindowRepaint({ strong: true });
        }, 600);
        applyWindowIcon(mainWindow);
        return mainWindow;
    }

    function closeMainWindow() {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        if (hasActiveTask()) return;
        mainWindow.close();
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
     * 下载中心托盘提示（字幕任务进度开启时不覆盖）
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
            if (isQuitting) return;
            if (!hasActiveTask()) return;

            event.preventDefault();
            if (closeConfirmPending) return;
            closeConfirmPending = true;
            try {
                const label = getActiveTaskLabel();
                const { response } = await dialog.showMessageBox(win, {
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
                    // 取消：归还焦点，避免主窗口输入框失焦
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
            if (isQuitting) return;
            if (!minimizeToTrayEnabled) return;
            event.preventDefault();

            const token = ++minimizeHideToken;
            // User title-bar / taskbar minimize: always honor hide-to-tray even if
            // settings/editor/etc. still exist (including minimized siblings).
            let focusedNow = false;
            try { focusedNow = !win.isDestroyed() && win.isFocused(); } catch (_) { /* ignore */ }
            const userInitiated = mainHadUserFocus || focusedNow;
            // Snapshot before hideToTray — distinguish intentional tray from this event.
            const wasHiddenToTray = mainHiddenToTray;
            const shouldUndoAsSpurious = () => {
                if (userInitiated) return false;
                // Only undo while suppress is armed (sibling close/minimize).
                // Counting any sibling BrowserWindow blocked hide-to-tray whenever
                // an editor/settings window existed — even if already minimized —
                // and restore() could leave the window on-screen with skipTaskbar.
                return Date.now() < suppressMinimizeToTrayUntil;
            };
            const settleMinimizeToTray = () => {
                if (token !== minimizeHideToken) return;
                if (isQuitting || !win || win.isDestroyed()) return;
                // Secondary-window close may arm suppress a tick after this event (Windows quirk).
                if (shouldUndoAsSpurious()) {
                    if (!wasHiddenToTray) revealMainWindowChrome();
                    else mainNeedsRepaintOnShow = true;
                    return;
                }
                maybeShowTrayHint();
            };

            if (shouldUndoAsSpurious()) {
                settleMinimizeToTray();
                return;
            }
            // Already in tray: do not re-run hideToTray (freezes WebContents).
            // Common when closing settings mid-download while main sits in the tray.
            if (wasHiddenToTray || mainHiddenToTray) {
                mainNeedsRepaintOnShow = true;
                setTimeout(settleMinimizeToTray, 80);
                return;
            }
            // Hide immediately: waiting lets Windows play the minimize-to-taskbar
            // animation first (visible flash), then hide-to-tray. Re-check shortly
            // in case a secondary close arms suppress a tick late.
            hideToTray();
            setTimeout(settleMinimizeToTray, 80);
        });
    }

    function saveMainWindowState() {
        if (saveStateTimer) {
            clearTimeout(saveStateTimer);
            saveStateTimer = null;
        }
        const state = captureWindowState(mainWindow);
        if (state) writeWindowState(state);
    }

    function scheduleSaveMainWindowState() {
        if (saveStateTimer) clearTimeout(saveStateTimer);
        saveStateTimer = setTimeout(() => {
            saveStateTimer = null;
            saveMainWindowState();
        }, SAVE_STATE_DEBOUNCE_MS);
    }

    function attachWindowStatePersistence(win) {
        const persistSoon = () => scheduleSaveMainWindowState();
        win.on('resize', persistSoon);
        win.on('move', persistSoon);
        win.on('maximize', persistSoon);
        win.on('unmaximize', persistSoon);
        win.on('close', () => {
            saveMainWindowState();
        });
    }

    function setMainWindowTitle(title) {
        const next = String(title || '').trim() || 'Transub';
        if (!mainWindow || mainWindow.isDestroyed()) return;
        try {
            mainWindow.setTitle(next);
        } catch (_) { /* ignore */ }
    }

    function refreshProductTitle() {
        let title = 'Transub';
        try {
            const { getProductWindowTitle } = require('./advanced-bridge');
            if (typeof getProductWindowTitle === 'function') {
                title = getProductWindowTitle() || 'Transub';
            }
        } catch (_) { /* advanced bridge not ready */ }
        setMainWindowTitle(title);
    }

    function createMainWindow(options = {}) {
        attachPowerResumeRepaintGuard();
        if (mainWindow && !mainWindow.isDestroyed()) {
            if (options.startMinimizedToTray) hideToTray();
            else showMainWindow();
            return mainWindow;
        }

        const saved = loadWindowState();
        const winOpts = {
            width: saved?.width || DEFAULT_WINDOW.width,
            height: saved?.height || DEFAULT_WINDOW.height,
            minWidth: DEFAULT_WINDOW.minWidth,
            minHeight: DEFAULT_WINDOW.minHeight,
            title: 'Transub',
            icon: getWindowIconOption(),
            autoHideMenuBar: true,
            backgroundColor: '#f9fafb',
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: true,
                // Keep progress UI alive while hidden to tray during long ASR/MT jobs.
                // Default throttling can leave the surface frozen after restore.
                backgroundThrottling: false,
            },
            show: false,
        };
        if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) {
            winOpts.x = saved.x;
            winOpts.y = saved.y;
        }

        mainWindow = new BrowserWindow(winOpts);
        try {
            mainWindow.webContents?.setBackgroundThrottling?.(false);
        } catch (_) { /* ignore */ }
        attachUiZoom(mainWindow);
        attachOwnedWindowMinimizeGuard();

        mainWindow.setMenuBarVisibility(false);
        mainWindow.removeMenu();
        applyWindowIcon(mainWindow);
        refreshProductTitle();

        const shouldMaximize = !!saved?.isMaximized;

        let revealed = false;
        const reveal = () => {
            if (revealed || !mainWindow || mainWindow.isDestroyed()) return;
            revealed = true;
            applyWindowIcon(mainWindow);
            if (options.startMinimizedToTray) {
                hideToTray();
                maybeShowTrayHint();
                return;
            }
            if (!mainWindow.isVisible()) mainWindow.show();
            // Maximize after show so Windows taskbar keeps the window icon, not the host exe icon
            if (shouldMaximize && !mainWindow.isMaximized()) mainWindow.maximize();
            applyWindowIcon(mainWindow);
        };

        const indexHtml = resolveHtmlPath(app, 'index.html');
        const splashHtml = resolveHtmlPath(app, 'splash.html');
        const useSplash = !options.startMinimizedToTray && fs.existsSync(splashHtml);

        if (useSplash) {
            // Tiny splash paints first so the user sees "loading" instead of a blank gap.
            let mainQueued = false;
            const showThenLoadMain = () => {
                reveal();
                if (mainQueued || !mainWindow || mainWindow.isDestroyed()) return;
                mainQueued = true;
                mainWindow.loadFile(indexHtml);
            };
            mainWindow.loadFile(splashHtml);
            mainWindow.once('ready-to-show', showThenLoadMain);
            setTimeout(showThenLoadMain, 280);
        } else {
            mainWindow.loadFile(indexHtml);
            mainWindow.once('ready-to-show', reveal);
            setTimeout(reveal, 450);
        }

        // Page <title> can override BrowserWindow title on navigation — re-apply Pro title.
        mainWindow.webContents.on('did-finish-load', () => {
            refreshProductTitle();
        });

        attachTrayBehavior(mainWindow);
        attachWindowStatePersistence(mainWindow);

        mainWindow.on('closed', () => {
            if (saveStateTimer) {
                clearTimeout(saveStateTimer);
                saveStateTimer = null;
            }
            mainWindow = null;
        });

        // Tray can wait until the window is about to appear
        setTimeout(() => {
            try { setupTray(); } catch (_) { /* ignore */ }
        }, 0);

        return mainWindow;
    }

    function sendToRenderer(channel, payload) {
        if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return false;
        mainWindow.webContents.send(channel, payload);
        return true;
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

    function quitApp() {
        isQuitting = true;
        if (tray) {
            tray.destroy();
            tray = null;
        }
        app.quit();
    }

    /**
     * Tray / explicit quit: confirm when a compute task is still running.
     * Programmatic quit after completed batches should call quitApp() directly.
     */
    async function confirmQuitApp() {
        if (isQuitting) {
            quitApp();
            return;
        }
        if (!hasActiveTask()) {
            quitApp();
            return;
        }
        const parent = (mainWindow && !mainWindow.isDestroyed())
            ? mainWindow
            : BrowserWindow.getFocusedWindow();
        const label = getActiveTaskLabel();
        const opts = {
            type: 'warning',
            buttons: ['取消', '停止并退出'],
            defaultId: 0,
            cancelId: 0,
            title: '任务进行中',
            message: `${label}仍在运行`,
            detail: '退出将中断正在运行的操作。确定要停止任务并退出吗？',
        };
        const { response } = parent
            ? await dialog.showMessageBox(parent, opts)
            : await dialog.showMessageBox(opts);
        if (response === 1) {
            stopActiveJobs();
            quitApp();
        } else if (parent && !parent.isDestroyed()) {
            try {
                parent.show();
                parent.focus();
                parent.webContents?.focus?.();
            } catch (_) { /* ignore */ }
        }
    }

    return {
        createMainWindow,
        showMainWindow,
        closeMainWindow,
        getMainWindow: () => mainWindow,
        sendToRenderer,
        setupTray,
        updateTrayProgress,
        clearTrayProgress,
        setTrayProgressEnabled,
        setMinimizeToTrayEnabled,
        setDownloadTrayTip,
        quitApp,
        confirmQuitApp,
        setMainWindowTitle,
        refreshProductTitle,
        isQuitting: () => isQuitting,
        setQuitting: (v) => { isQuitting = !!v; },
        /** Arm suppress before a secondary window closes (Windows spurious minimize). */
        beginSuppressMinimizeToTray,
        /** After a secondary window closes: keep suppress and undo a spurious hide-to-tray. */
        restoreMainAfterSecondaryWindowClosed: () => {
            beginSuppressMinimizeToTray();
            restoreMainIfHiddenBySpuriousMinimize();
        },
    };
}

module.exports = {
    createWindowManager,
};
