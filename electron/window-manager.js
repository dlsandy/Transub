const { app, BrowserWindow, Tray, Menu, dialog, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const { resolveHtmlPath, getWritableRoot } = require('./app-paths');
const { getTrayIcon, getWindowIconOption, applyWindowIcon } = require('./icons');
const { sendNotification } = require('./notifications');

function jobHelpers() {
    return require('./transwithai-bridge');
}

const DEFAULT_TRAY_TOOLTIP = 'Transub 字幕生成';
const WINDOW_STATE_FILE = 'window-state.json';
const DEFAULT_WINDOW = Object.freeze({
    width: 1080,
    height: 720,
    minWidth: 760,
    minHeight: 520,
});
const SAVE_STATE_DEBOUNCE_MS = 400;

function getWindowStatePath() {
    return path.join(getWritableRoot(), WINDOW_STATE_FILE);
}

function clampInt(value, fallback, min, max) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
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
    let saveStateTimer = null;

    function hideToTray() {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.setSkipTaskbar(true);
        mainWindow.hide();
    }

    function showMainWindow() {
        if (!mainWindow || mainWindow.isDestroyed()) {
            createMainWindow();
            return mainWindow;
        }
        mainWindow.setSkipTaskbar(false);
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
        return mainWindow;
    }

    function closeMainWindow() {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        if (jobHelpers().isSubtitleJobRunning()) return;
        mainWindow.close();
    }

    function maybeShowTrayHint() {
        if (trayHintShown || !tray) return;
        sendNotification('任务已在后台运行，双击托盘图标可查看进度。');
        trayHintShown = true;
    }

    function setupTray() {
        if (tray) return;
        const icon = getTrayIcon();
        if (icon.isEmpty()) return;

        tray = new Tray(icon);
        tray.setToolTip(DEFAULT_TRAY_TOOLTIP);

        const contextMenu = Menu.buildFromTemplate([
            { label: '显示任务窗口', click: () => showMainWindow() },
            { type: 'separator' },
            { label: '退出', click: () => quitApp() },
        ]);
        tray.setContextMenu(contextMenu);
        tray.on('double-click', () => showMainWindow());
        tray.on('click', () => {
            if (process.platform === 'win32') showMainWindow();
        });
    }

    function attachTrayBehavior(win) {
        win.on('close', async (event) => {
            if (isQuitting) return;
            if (!jobHelpers().isSubtitleJobRunning()) return;

            event.preventDefault();
            const { response } = await dialog.showMessageBox(win, {
                type: 'warning',
                buttons: ['取消', '后台继续', '停止并关闭'],
                defaultId: 0,
                cancelId: 0,
                title: '字幕任务进行中',
                message: '字幕生成任务仍在后台运行',
                detail: '可选择后台继续（托盘查看进度），或停止任务并关闭窗口。',
            });
            if (response === 1) {
                hideToTray();
                maybeShowTrayHint();
            } else if (response === 2) {
                jobHelpers().stopSubtitleJobs();
                win.destroy();
            } else {
                // 取消：归还焦点，避免主窗口输入框失焦
                try {
                    win.show();
                    win.focus();
                    win.webContents?.focus?.();
                } catch (_) { /* ignore */ }
            }
        });

        win.on('minimize', (event) => {
            if (isQuitting) return;
            event.preventDefault();
            hideToTray();
            maybeShowTrayHint();
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

        mainWindow.setMenuBarVisibility(false);
        mainWindow.removeMenu();
        applyWindowIcon(mainWindow);

        if (saved?.isMaximized) {
            mainWindow.maximize();
        }

        mainWindow.loadFile(resolveHtmlPath(app, 'index.html'));
        attachTrayBehavior(mainWindow);
        attachWindowStatePersistence(mainWindow);

        mainWindow.on('closed', () => {
            if (saveStateTimer) {
                clearTimeout(saveStateTimer);
                saveStateTimer = null;
            }
            mainWindow = null;
        });

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
        };

        mainWindow.once('ready-to-show', reveal);
        // Fallback if ready-to-show is missed on some Windows GPU paths
        setTimeout(reveal, 800);

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
        if (!trayProgressEnabled) clearTrayProgress();
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
        try { tray.setToolTip(DEFAULT_TRAY_TOOLTIP); } catch (_) { /* ignore */ }
    }

    function quitApp() {
        isQuitting = true;
        if (tray) {
            tray.destroy();
            tray = null;
        }
        app.quit();
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
        quitApp,
        isQuitting: () => isQuitting,
        setQuitting: (v) => { isQuitting = !!v; },
    };
}

module.exports = {
    createWindowManager,
};
