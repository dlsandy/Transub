const { app, BrowserWindow, Tray, Menu, dialog } = require('electron');
const path = require('path');
const { resolveHtmlPath } = require('./app-paths');
const { getTrayIcon, getAppIcon } = require('./icons');
const { isSubtitleJobRunning, stopSubtitleJobs } = require('./transwithai-bridge');
const { sendNotification } = require('./notifications');

function createWindowManager({ getAppRoot, getUserDataPath }) {
    let mainWindow = null;
    let tray = null;
    let trayHintShown = false;
    let isQuitting = false;

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
        if (isSubtitleJobRunning()) return;
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
        tray.setToolTip('Transub 字幕生成');

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
            if (!isSubtitleJobRunning()) return;

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
                stopSubtitleJobs();
                win.destroy();
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

        setupTray();
        const icon = getAppIcon();
        mainWindow = new BrowserWindow({
            width: 1080,
            height: 720,
            minWidth: 760,
            minHeight: 520,
            title: 'Transub',
            icon: icon.isEmpty() ? undefined : icon,
            autoHideMenuBar: true,
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: true,
            },
            show: !options.startMinimizedToTray,
        });

        mainWindow.setMenuBarVisibility(false);
        mainWindow.removeMenu();

        mainWindow.loadFile(resolveHtmlPath(app, 'index.html'));
        attachTrayBehavior(mainWindow);

        mainWindow.on('closed', () => {
            mainWindow = null;
        });

        if (options.startMinimizedToTray) {
            mainWindow.once('ready-to-show', () => {
                hideToTray();
                maybeShowTrayHint();
            });
        }

        return mainWindow;
    }

    function sendToRenderer(channel, payload) {
        if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return false;
        mainWindow.webContents.send(channel, payload);
        return true;
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
        quitApp,
        isQuitting: () => isQuitting,
        setQuitting: (v) => { isQuitting = !!v; },
    };
}

module.exports = {
    createWindowManager,
};
