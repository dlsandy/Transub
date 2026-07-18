const { app, BrowserWindow, Tray, Menu, dialog } = require('electron');
const path = require('path');
const { resolveHtmlPath } = require('./app-paths');
const { getTrayIcon, getWindowIconOption, applyWindowIcon } = require('./icons');
const { sendNotification } = require('./notifications');

function jobHelpers() {
    return require('./transwithai-bridge');
}

const DEFAULT_TRAY_TOOLTIP = 'Transub 字幕生成';

function createWindowManager({ getAppRoot, getUserDataPath }) {
    let mainWindow = null;
    let tray = null;
    let trayHintShown = false;
    let isQuitting = false;
    let trayProgressEnabled = true;

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

    function createMainWindow(options = {}) {
        if (mainWindow && !mainWindow.isDestroyed()) {
            if (options.startMinimizedToTray) hideToTray();
            else showMainWindow();
            return mainWindow;
        }

        mainWindow = new BrowserWindow({
            width: 1080,
            height: 720,
            minWidth: 760,
            minHeight: 520,
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
        });

        mainWindow.setMenuBarVisibility(false);
        mainWindow.removeMenu();
        applyWindowIcon(mainWindow);

        mainWindow.loadFile(resolveHtmlPath(app, 'index.html'));
        attachTrayBehavior(mainWindow);

        mainWindow.on('closed', () => {
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
        trayProgressEnabled = enabled !== false;
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
