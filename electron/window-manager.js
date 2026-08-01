const { app, BrowserWindow, Tray, Menu, dialog, screen } = require('electron');
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
    minWidth: 760,
    minHeight: 520,
});
const SAVE_STATE_DEBOUNCE_MS = 400;

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
    let mainRepaintTimer = null;

    function hideToTray() {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        // On Windows the minimize event fires after the shrink animation starts;
        // zero opacity so that frame never paints before hide/skipTaskbar.
        try {
            if (process.platform === 'win32' && typeof mainWindow.setOpacity === 'function') {
                mainWindow.setOpacity(0);
            }
        } catch (_) { /* ignore */ }
        mainWindow.setSkipTaskbar(true);
        mainWindow.hide();
        try {
            if (process.platform === 'win32' && typeof mainWindow.setOpacity === 'function') {
                mainWindow.setOpacity(1);
            }
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
     * Wake Chromium/DWM after a spurious minimize→restore. Without this, the
     * main window can stay visibly open but paint only backgroundColor.
     */
    function forceMainWindowRepaint() {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        try {
            const wc = mainWindow.webContents;
            if (wc && !wc.isDestroyed() && typeof wc.invalidate === 'function') {
                wc.invalidate();
            }
        } catch (_) { /* ignore */ }
        try {
            if (mainWindow.isMinimized() || !mainWindow.isVisible()) return;
            if (mainWindow.isMaximized()) {
                const bounds = mainWindow.getBounds();
                mainWindow.setBounds(bounds);
            } else {
                const [w, h] = mainWindow.getSize();
                if (w > 1 && h > 1) {
                    mainWindow.setSize(w, h + 1);
                    mainWindow.setSize(w, h);
                }
            }
        } catch (_) { /* ignore */ }
    }

    function scheduleMainWindowRepaint() {
        forceMainWindowRepaint();
        if (mainRepaintTimer) clearTimeout(mainRepaintTimer);
        // Second pass: restore/show can finish a tick later on Windows.
        mainRepaintTimer = setTimeout(() => {
            mainRepaintTimer = null;
            forceMainWindowRepaint();
        }, 50);
    }

    function beginSuppressMinimizeToTray(ms = 800) {
        const now = Date.now();
        if (now >= suppressMinimizeToTrayUntil) {
            mainVisibleWhenSuppressArmed = isMainVisiblyOpen();
        }
        suppressMinimizeToTrayUntil = Math.max(suppressMinimizeToTrayUntil, now + ms);
    }

    function restoreMainIfHiddenBySpuriousMinimize() {
        if (!mainVisibleWhenSuppressArmed) return;
        if (!mainWindow || mainWindow.isDestroyed()) return;
        try {
            if (typeof mainWindow.setOpacity === 'function') mainWindow.setOpacity(1);
            if (mainWindow.isMinimized()) mainWindow.restore();
            if (!mainWindow.isVisible()) {
                mainWindow.setSkipTaskbar(false);
                mainWindow.show();
            }
            scheduleMainWindowRepaint();
        } catch (_) { /* ignore */ }
    }

    function attachSecondaryWindowMinimizeGuardTo(child) {
        if (!child || child.isDestroyed()) return;
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
            setTimeout(() => {
                if (!mainWindow || mainWindow.isDestroyed()) return;
                try {
                    if (mainWindow.isMinimized()) mainWindow.restore();
                    if (!mainWindow.isVisible() && mainVisibleWhenSuppressArmed) {
                        mainWindow.setSkipTaskbar(false);
                        mainWindow.show();
                    }
                } catch (_) { /* ignore */ }
                scheduleMainWindowRepaint();
            }, 0);
        };
        child.on('close', armIfSecondary);
        child.on('minimize', recoverFromSecondaryMinimize);
        child.on('closed', () => {
            if (Date.now() < suppressMinimizeToTrayUntil) {
                restoreMainIfHiddenBySpuriousMinimize();
            }
        });
    }

    function attachOwnedWindowMinimizeGuard() {
        if (secondaryWindowMinimizeGuardAttached) return;
        secondaryWindowMinimizeGuardAttached = true;
        app.on('browser-window-created', (_event, child) => {
            attachSecondaryWindowMinimizeGuardTo(child);
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
        try {
            if (typeof mainWindow.setOpacity === 'function') mainWindow.setOpacity(1);
        } catch (_) { /* ignore */ }
        mainWindow.setSkipTaskbar(false);
        applyWindowIcon(mainWindow);
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        applyWindowIcon(mainWindow);
        mainWindow.focus();
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
            const secondaryWindowsOpen = () => {
                try {
                    return BrowserWindow.getAllWindows().some(
                        (w) => w && !w.isDestroyed() && w.id !== win.id
                    );
                } catch (_) {
                    return false;
                }
            };
            const undoSpuriousMinimize = () => {
                try {
                    if (typeof win.setOpacity === 'function') win.setOpacity(1);
                    if (win.isMinimized()) win.restore();
                    if (!win.isVisible()) {
                        win.setSkipTaskbar(false);
                        win.show();
                    }
                    // Spurious minimize from editor minimize often leaves a blank surface.
                    scheduleMainWindowRepaint();
                } catch (_) { /* ignore */ }
            };
            const settleMinimizeToTray = () => {
                if (token !== minimizeHideToken) return;
                if (isQuitting || !win || win.isDestroyed()) return;
                // Secondary-window close may arm suppress a tick after this event (Windows quirk).
                if (Date.now() < suppressMinimizeToTrayUntil || secondaryWindowsOpen()) {
                    // Prefer full restore when another window still exists; snapshot gate
                    // only applies to post-close suppress cleanup.
                    if (secondaryWindowsOpen()) undoSpuriousMinimize();
                    else restoreMainIfHiddenBySpuriousMinimize();
                    return;
                }
                maybeShowTrayHint();
            };

            if (Date.now() < suppressMinimizeToTrayUntil || secondaryWindowsOpen()) {
                settleMinimizeToTray();
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
            },
            show: false,
        };
        if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) {
            winOpts.x = saved.x;
            winOpts.y = saved.y;
        }

        mainWindow = new BrowserWindow(winOpts);
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
