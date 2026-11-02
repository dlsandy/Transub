/**
 * Standalone environment doctor BrowserWindow (version / GPU hard gate).
 */

const { BrowserWindow } = require('electron');
const path = require('path');
const { resolveHtmlPath } = require('./app-paths');
const { getWindowIconOption, applyWindowIcon } = require('./icons');
const { attachUiZoom } = require('./ui-zoom');
const { attachSplashThenLoad } = require('./window-splash-boot');
const { writeOkForVersion } = require('./env-doctor-gate');

/** @type {import('electron').BrowserWindow|null} */
let envDoctorWindow = null;

/** @type {{ onPassed?: (info?: object) => void, onAbortQuit?: () => void, passed?: boolean }|null} */
let doctorSession = null;

function getEnvDoctorWindow() {
    if (envDoctorWindow && !envDoctorWindow.isDestroyed()) return envDoctorWindow;
    return null;
}

function focusEnvDoctorWindow() {
    const win = getEnvDoctorWindow();
    if (!win) return null;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    applyWindowIcon(win);
    return win;
}

/**
 * @param {import('electron').App} app
 * @param {{ onPassed?: (info?: object) => void, onAbortQuit?: () => void }} [options]
 */
function openEnvDoctorWindow(app, { onPassed, onAbortQuit } = {}) {
    const existing = focusEnvDoctorWindow();
    if (existing) {
        if (!doctorSession) doctorSession = { passed: false };
        if (typeof onPassed === 'function') doctorSession.onPassed = onPassed;
        if (typeof onAbortQuit === 'function') doctorSession.onAbortQuit = onAbortQuit;
        return { ok: true, reused: true };
    }

    doctorSession = {
        onPassed: typeof onPassed === 'function' ? onPassed : null,
        onAbortQuit: typeof onAbortQuit === 'function' ? onAbortQuit : null,
        passed: false,
    };

    let backgroundColor = '#f9fafb';
    try {
        const { getAppTheme, MAIN_BG } = require('./app-theme');
        backgroundColor = MAIN_BG[getAppTheme()] || backgroundColor;
    } catch (_) { /* ignore */ }

    const win = new BrowserWindow({
        width: 720,
        height: 820,
        minWidth: 640,
        minHeight: 680,
        title: '字幕工厂 环境检测',
        icon: getWindowIconOption(),
        autoHideMenuBar: true,
        backgroundColor,
        show: false,
        modal: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    envDoctorWindow = win;
    attachUiZoom(win);
    win.setMenuBarVisibility(false);
    win.removeMenu();
    applyWindowIcon(win);

    win.on('closed', () => {
        if (envDoctorWindow === win) envDoctorWindow = null;
        const session = doctorSession;
        doctorSession = null;
        // Closing without pass → quit so users cannot bypass the gate via tray.
        if (!session?.passed) {
            try {
                if (typeof session?.onAbortQuit === 'function') session.onAbortQuit();
                else app.quit();
            } catch (_) {
                try { app.quit(); } catch { /* ignore */ }
            }
        }
    });

    const query = new URLSearchParams({ envDoctor: '1' });
    const notifyOpen = () => {
        if (win.isDestroyed() || win.webContents.isDestroyed()) return;
        win.webContents.send('transub-open-env-doctor', { force: true });
        setTimeout(() => {
            if (win.isDestroyed() || win.webContents.isDestroyed()) return;
            win.webContents.send('transub-open-env-doctor', { force: true });
        }, 150);
    };

    attachSplashThenLoad(win, {
        splashHtml: resolveHtmlPath(app, 'splash.html'),
        splashSearch: 'kind=env-doctor',
        mainHtml: resolveHtmlPath(app, 'index.html'),
        mainSearch: query.toString(),
        onReveal: () => {
            if (win.isDestroyed()) return;
            applyWindowIcon(win);
            if (!win.isVisible()) win.show();
            win.focus();
        },
        onMainLoaded: notifyOpen,
    });

    return { ok: true };
}

/**
 * Mark gate passed, stamp version, invoke onPassed, close doctor window.
 * @param {import('electron').App} app
 */
function completeEnvDoctorPass(app) {
    const ver = String(app?.getVersion?.() || '').trim();
    const stamp = writeOkForVersion(ver);
    if (doctorSession) doctorSession.passed = true;
    const onPassed = doctorSession?.onPassed;
    const win = getEnvDoctorWindow();
    try {
        if (typeof onPassed === 'function') onPassed({ okForVersion: ver, stamp });
    } catch (err) {
        console.warn('[env-doctor] onPassed failed:', err?.message || err);
    }
    if (win && !win.isDestroyed()) {
        try { win.close(); } catch (_) { /* ignore */ }
    }
    return { ok: true, ...stamp, okForVersion: ver };
}

function registerEnvDoctorIpc(register, deps = {}) {
    const app = deps.app;
    if (!app) throw new Error('registerEnvDoctorIpc requires deps.app');
    const getWindowManager = deps.getWindowManager || (() => null);

    register('transub-env-doctor-status', async () => {
        const { readGateState, needsEnvDoctorGate } = require('./env-doctor-gate');
        const ver = String(app.getVersion() || '').trim();
        return {
            ok: true,
            appVersion: ver,
            ...readGateState(),
            needsGate: needsEnvDoctorGate(ver, { getAppRoot: deps.getAppRoot }),
            standalone: !!getEnvDoctorWindow(),
        };
    });

    register('transub-env-doctor-passed', async () => {
        try {
            return completeEnvDoctorPass(app);
        } catch (err) {
            return { ok: false, error: err?.message || String(err) };
        }
    });

    register('transub-env-doctor-stamp', async () => {
        try {
            const ver = String(app.getVersion() || '').trim();
            return writeOkForVersion(ver);
        } catch (err) {
            return { ok: false, error: err?.message || String(err) };
        }
    });

    register('transub-open-env-doctor', async () => {
        try {
            const wm = getWindowManager();
            return openEnvDoctorWindow(app, {
                onPassed: () => {
                    try { wm?.createMainWindow?.(); } catch (_) { /* ignore */ }
                },
                onAbortQuit: () => {
                    try {
                        if (typeof wm?.quitApp === 'function') wm.quitApp();
                        else app.quit();
                    } catch (_) {
                        try { app.quit(); } catch { /* ignore */ }
                    }
                },
            });
        } catch (err) {
            return { ok: false, error: err?.message || String(err) };
        }
    });

    register('transub-env-doctor-quit', async () => {
        try {
            if (doctorSession) doctorSession.passed = false;
            const wm = getWindowManager();
            const win = getEnvDoctorWindow();
            if (win && !win.isDestroyed()) {
                try { win.close(); } catch (_) { /* ignore */ }
            } else if (typeof wm?.quitApp === 'function') {
                wm.quitApp();
            } else {
                app.quit();
            }
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err?.message || String(err) };
        }
    });
}

module.exports = {
    openEnvDoctorWindow,
    getEnvDoctorWindow,
    completeEnvDoctorPass,
    registerEnvDoctorIpc,
};
