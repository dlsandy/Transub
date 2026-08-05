const { app, BrowserWindow, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { resolveHtmlPath } = require('./app-paths');
const { getWindowIconOption, applyWindowIcon } = require('./icons');
const { attachUiZoom } = require('./ui-zoom');
const { hasActiveTask, getActiveTaskLabel, stopActiveJobs } = require('./active-task-guard');
const {
    DEFAULT_WINDOW,
    SAVE_STATE_DEBOUNCE_MS,
    loadWindowState,
    writeWindowState,
    captureWindowState,
    sanitizeWindowState,
} = require('./window-state');
const { createMainWindowTray } = require('./main-window-tray');

function createWindowManager({ getAppRoot: _getAppRoot, getUserDataPath: _getUserDataPath }) {
    let mainWindow = null;
    let isQuitting = false;
    let saveStateTimer = null;

    const tray = createMainWindowTray({
        getMainWindow: () => mainWindow,
        isQuitting: () => isQuitting,
        ensureMainWindow: () => createMainWindow(),
        confirmQuitApp: () => confirmQuitApp(),
        dialogShowMessageBox: (win, opts) => dialog.showMessageBox(win, opts),
    });

    function showMainWindow() {
        return tray.showMainWindow();
    }

    function closeMainWindow() {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        if (hasActiveTask()) return;
        mainWindow.close();
    }

    function saveMainWindowState() {
        if (saveStateTimer) {
            clearTimeout(saveStateTimer);
            saveStateTimer = null;
        }
        // Soft-park parks off-screen — persist the pre-park snapshot instead.
        if (tray.isMainHiddenToTray()) {
            const snap = typeof tray._softParkSnapshot === 'function'
                ? tray._softParkSnapshot()
                : null;
            if (snap) {
                const state = sanitizeWindowState({
                    x: snap.x,
                    y: snap.y,
                    width: snap.width,
                    height: snap.height,
                    isMaximized: !!snap.isMaximized,
                });
                if (state) writeWindowState(state);
            }
            return;
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
        tray.attachPowerResumeRepaintGuard();
        if (mainWindow && !mainWindow.isDestroyed()) {
            if (options.startMinimizedToTray) tray.hideToTray();
            else showMainWindow();
            return mainWindow;
        }

        const saved = loadWindowState();
        let backgroundColor = '#f9fafb';
        try {
            const { getAppTheme, MAIN_BG } = require('./app-theme');
            backgroundColor = MAIN_BG[getAppTheme()] || backgroundColor;
        } catch (_) { /* ignore */ }
        const winOpts = {
            width: saved?.width || DEFAULT_WINDOW.width,
            height: saved?.height || DEFAULT_WINDOW.height,
            minWidth: DEFAULT_WINDOW.minWidth,
            minHeight: DEFAULT_WINDOW.minHeight,
            title: 'Transub',
            icon: getWindowIconOption(),
            autoHideMenuBar: true,
            backgroundColor,
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: true,
                // Prefer default throttling at create time. Permanently disabling
                // it before the first show (or while tray-hidden) desyncs
                // FrameEvictor and blanks the client after restore (Electron
                // #42378 / #50250). We disable throttling only while visible.
                backgroundThrottling: true,
            },
            show: false,
        };
        if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) {
            winOpts.x = saved.x;
            winOpts.y = saved.y;
        }

        mainWindow = new BrowserWindow(winOpts);
        attachUiZoom(mainWindow);
        tray.attachOwnedWindowMinimizeGuard();

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
                tray.hideToTray();
                tray.maybeShowTrayHint();
                return;
            }
            if (!mainWindow.isVisible()) mainWindow.show();
            tray.setMainBackgroundThrottling(false);
            if (shouldMaximize && !mainWindow.isMaximized()) mainWindow.maximize();
            applyWindowIcon(mainWindow);
        };

        const indexHtml = resolveHtmlPath(app, 'index.html');
        const splashHtml = resolveHtmlPath(app, 'splash.html');
        const useSplash = !options.startMinimizedToTray && fs.existsSync(splashHtml);

        if (useSplash) {
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

        mainWindow.webContents.on('did-finish-load', () => {
            refreshProductTitle();
        });

        tray.attachTrayBehavior(mainWindow);
        attachWindowStatePersistence(mainWindow);

        mainWindow.on('closed', () => {
            if (saveStateTimer) {
                clearTimeout(saveStateTimer);
                saveStateTimer = null;
            }
            tray.onMainWindowClosed();
            mainWindow = null;
        });

        setTimeout(() => {
            try { tray.setupTray(); } catch (_) { /* ignore */ }
        }, 0);

        return mainWindow;
    }

    function sendToRenderer(channel, payload) {
        if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return false;
        mainWindow.webContents.send(channel, payload);
        return true;
    }

    function quitApp() {
        isQuitting = true;
        tray.destroyTray();
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
        setupTray: () => tray.setupTray(),
        updateTrayProgress: (payload) => tray.updateTrayProgress(payload),
        clearTrayProgress: () => tray.clearTrayProgress(),
        setTrayProgressEnabled: (enabled) => tray.setTrayProgressEnabled(enabled),
        setMinimizeToTrayEnabled: (enabled) => tray.setMinimizeToTrayEnabled(enabled),
        setDownloadTrayTip: (tip) => tray.setDownloadTrayTip(tip),
        quitApp,
        confirmQuitApp,
        setMainWindowTitle,
        refreshProductTitle,
        isQuitting: () => isQuitting,
        setQuitting: (v) => { isQuitting = !!v; },
        beginSuppressMinimizeToTray: (ms) => tray.beginSuppressMinimizeToTray(ms),
        isSuppressMinimizeToTrayActive: () => tray.isSuppressMinimizeToTrayActive(),
        restoreMainAfterSecondaryWindowClosed: () => tray.restoreMainAfterSecondaryWindowClosed(),
        isMainHiddenToTray: () => tray.isMainHiddenToTray(),
    };
}

module.exports = {
    createWindowManager,
};
