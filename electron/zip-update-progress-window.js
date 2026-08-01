/**
 * Standalone progress UI for zip updates (survives main app quit).
 * Launch: Transub.exe --zip-update-progress=<statusJsonPath>
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { BrowserWindow, ipcMain } = require('electron');
const { resolveHtmlPath } = require('./app-paths');
const { getWindowIconOption, applyWindowIcon } = require('./icons');
const { readZipUpdateStatus } = require('./zip-update-status');

const POLL_MS = 350;
/** Exit only if status file stops updating for this long (large installs can take minutes). */
const STALL_EXIT_MS = 12 * 60 * 1000;

/**
 * @param {import('electron').App} app
 * @param {string} statusPath
 */
function runZipUpdateProgressUi(app, statusPath) {
    const resolvedStatus = path.resolve(String(statusPath || '').trim());
    if (!resolvedStatus) {
        app.quit();
        return;
    }

    // Isolate Chromium profile from the quitting main instance.
    try {
        const tmpUserData = path.join(os.tmpdir(), `transub-update-ui-${process.pid}`);
        fs.mkdirSync(tmpUserData, { recursive: true });
        app.setPath('userData', tmpUserData);
    } catch { /* ignore */ }

    app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
    app.setName('Transub 升级');
    if (process.platform === 'win32') {
        try {
            app.setAppUserModelId('com.transub.app.update');
        } catch { /* ignore */ }
    }

    /** @type {import('electron').BrowserWindow|null} */
    let win = null;
    /** @type {NodeJS.Timeout|null} */
    let pollTimer = null;
    let lastPhase = '';
    let terminalAt = 0;

    function stopPolling() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    function pushStatus() {
        if (!win || win.isDestroyed()) return;
        const status = readZipUpdateStatus(resolvedStatus) || {
            phase: 'waiting',
            message: '正在准备升级…',
            percent: 0,
        };
        try {
            win.webContents.send('transub-zip-update-status', status);
        } catch { /* ignore */ }

        const phase = String(status.phase || '');
        if (phase !== lastPhase) lastPhase = phase;
        if (phase === 'done' || phase === 'error') {
            if (!terminalAt) terminalAt = Date.now();
            const wait = phase === 'done' ? 1800 : 6000;
            if (Date.now() - terminalAt >= wait) {
                stopPolling();
                try { app.quit(); } catch { /* ignore */ }
            }
        } else {
            terminalAt = 0;
        }
    }

    function createWindow() {
        win = new BrowserWindow({
            width: 420,
            height: 220,
            resizable: false,
            maximizable: false,
            minimizable: true,
            fullscreenable: false,
            title: '正在升级 Transub',
            icon: getWindowIconOption(),
            autoHideMenuBar: true,
            backgroundColor: '#f9fafb',
            show: false,
            alwaysOnTop: true,
            webPreferences: {
                preload: path.join(__dirname, 'preload-update-progress.js'),
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: true,
            },
        });
        win.setMenuBarVisibility(false);
        win.removeMenu();
        applyWindowIcon(win);
        win.loadFile(resolveHtmlPath(app, 'update-progress.html'));
        win.once('ready-to-show', () => {
            if (!win || win.isDestroyed()) return;
            applyWindowIcon(win);
            win.show();
            win.focus();
            pushStatus();
        });
        win.on('closed', () => {
            win = null;
            stopPolling();
            try { app.quit(); } catch { /* ignore */ }
        });
        pollTimer = setInterval(() => {
            pushStatus();
            const status = readZipUpdateStatus(resolvedStatus);
            const phase = String(status?.phase || '');
            if (phase === 'done' || phase === 'error') return;
            const updatedAt = Date.parse(String(status?.updatedAt || ''));
            const age = Number.isFinite(updatedAt) ? (Date.now() - updatedAt) : 0;
            if (age > STALL_EXIT_MS) {
                writeFallbackError('升级长时间无进度，请查看临时目录中的 update.log，或手动重新启动 Transub。');
            }
        }, POLL_MS);
    }

    function writeFallbackError(message) {
        try {
            const { writeZipUpdateStatus } = require('./zip-update-status');
            writeZipUpdateStatus(resolvedStatus, {
                phase: 'error',
                percent: 100,
                message,
                error: message,
            });
        } catch { /* ignore */ }
        pushStatus();
    }

    ipcMain.handle('transub-zip-update-progress-get', () => (
        readZipUpdateStatus(resolvedStatus) || {
            phase: 'waiting',
            message: '正在准备升级…',
            percent: 0,
        }
    ));

    app.whenReady().then(() => {
        createWindow();
    });

    app.on('window-all-closed', () => {
        stopPolling();
        app.quit();
    });
}

function parseZipUpdateProgressArg(argv = process.argv.slice(1)) {
    for (const arg of argv) {
        if (arg.startsWith('--zip-update-progress=')) {
            return String(arg.slice('--zip-update-progress='.length) || '').trim();
        }
    }
    return '';
}

module.exports = {
    runZipUpdateProgressUi,
    parseZipUpdateProgressArg,
};
