'use strict';

/**
 * Dev-only Sanitize 训练台 window: spawn/reuse local HTTP console and open BrowserWindow.
 * Packaged builds must never start the server or open this window.
 */
const { BrowserWindow, app: electronApp } = require('electron');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { getWindowIconOption, applyWindowIcon } = require('./icons');
const { attachUiZoom } = require('./ui-zoom');

const TRAIN_PORT = Number(process.env.MT_TRAIN_PORT) || 8787;
const TRAIN_HOST = '127.0.0.1';
const TRAIN_URL = `http://${TRAIN_HOST}:${TRAIN_PORT}/`;

/** @type {import('electron').BrowserWindow|null} */
let mtTrainWindow = null;
/** @type {import('child_process').ChildProcess|null} */
let trainServerChild = null;
let quitHookInstalled = false;

function isDevBuild(app = electronApp) {
    try {
        return !app.isPackaged;
    } catch (_) {
        return false;
    }
}

function getRepoRoot() {
    return path.resolve(__dirname, '..');
}

function probeTrainServer(timeoutMs = 800) {
    return new Promise((resolve) => {
        const req = http.get({
            hostname: TRAIN_HOST,
            port: TRAIN_PORT,
            path: '/api/health',
            timeout: timeoutMs,
        }, (res) => {
            let raw = '';
            res.setEncoding('utf8');
            res.on('data', (c) => { raw += c; });
            res.on('end', () => {
                if (res.statusCode < 200 || res.statusCode >= 500) {
                    resolve({ up: false, stale: false });
                    return;
                }
                try {
                    const data = JSON.parse(raw || '{}');
                    const hasAuto = !!(data?.features?.autoPropose);
                    // Old servers lack /api/health → fall through via titles probe
                    resolve({ up: true, stale: !hasAuto, version: data.version || 0 });
                } catch (_) {
                    resolve({ up: true, stale: true });
                }
            });
        });
        req.on('timeout', () => {
            req.destroy();
            resolve({ up: false, stale: false });
        });
        req.on('error', () => resolve({ up: false, stale: false }));
    });
}

/** Fallback for very old servers that only have /api/titles. */
function probeTrainServerLegacy(timeoutMs = 800) {
    return new Promise((resolve) => {
        const req = http.get({
            hostname: TRAIN_HOST,
            port: TRAIN_PORT,
            path: '/api/titles?limit=1',
            timeout: timeoutMs,
        }, (res) => {
            res.resume();
            resolve(res.statusCode >= 200 && res.statusCode < 500);
        });
        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });
        req.on('error', () => resolve(false));
    });
}

function resolveNodeBinary() {
    if (process.env.npm_node_execpath && require('fs').existsSync(process.env.npm_node_execpath)) {
        return process.env.npm_node_execpath;
    }
    return 'node';
}

async function waitForTrainServer({ attempts = 40, intervalMs = 250 } = {}) {
    for (let i = 0; i < attempts; i += 1) {
        const probe = await probeTrainServer();
        if (probe.up && !probe.stale) return true;
        // Legacy up but no health → treat as ready only after we restarted with --force
        await new Promise((r) => setTimeout(r, intervalMs));
    }
    return false;
}

async function ensureTrainServer() {
    const probe = await probeTrainServer();
    if (probe.up && !probe.stale) {
        return { ok: true, reused: true, url: TRAIN_URL };
    }
    // Old process without auto-propose, or nothing listening → start with --force
    const legacyUp = !probe.up && await probeTrainServerLegacy();
    const needForce = probe.stale || legacyUp || probe.up;

    const root = getRepoRoot();
    const serverJs = path.join(root, 'tools', 'mt-train', 'server.js');
    if (!require('fs').existsSync(serverJs)) {
        return { ok: false, error: `找不到训练台服务：${serverJs}` };
    }
    stopTrainServerChild();
    const nodeBin = resolveNodeBinary();
    const args = [serverJs, `--port=${TRAIN_PORT}`];
    if (needForce) args.push('--force');
    try {
        trainServerChild = spawn(nodeBin, args, {
            cwd: root,
            stdio: 'ignore',
            windowsHide: true,
            env: { ...process.env },
        });
        trainServerChild.on('exit', () => {
            if (trainServerChild) trainServerChild = null;
        });
        trainServerChild.on('error', () => {
            trainServerChild = null;
        });
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    }
    const ready = await waitForTrainServer();
    if (!ready) {
        stopTrainServerChild();
        return { ok: false, error: `训练台服务未能在 ${TRAIN_PORT} 端口就绪` };
    }
    return { ok: true, reused: false, url: TRAIN_URL, restarted: needForce };
}

function stopTrainServerChild() {
    const child = trainServerChild;
    trainServerChild = null;
    if (!child || child.killed) return;
    try {
        if (process.platform === 'win32' && child.pid) {
            spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
                stdio: 'ignore',
                windowsHide: true,
            });
        } else {
            child.kill('SIGTERM');
        }
    } catch (_) { /* ignore */ }
}

function installQuitHook(app) {
    if (quitHookInstalled) return;
    quitHookInstalled = true;
    app.on('before-quit', () => {
        stopTrainServerChild();
    });
}

function focusMtTrainWindow() {
    const win = mtTrainWindow;
    if (!win || win.isDestroyed()) return null;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    applyWindowIcon(win);
    return win;
}

/**
 * @param {import('electron').App} app
 * @returns {Promise<{ ok: boolean, error?: string, url?: string }>}
 */
async function openMtTrainWindow(app) {
    if (!isDevBuild(app)) {
        return { ok: false, error: '仅开发模式可用' };
    }
    installQuitHook(app);

    const server = await ensureTrainServer();
    if (!server.ok) return server;

    const existing = focusMtTrainWindow();
    if (existing) {
        try {
            existing.reload();
        } catch (_) { /* ignore */ }
        return { ok: true, url: TRAIN_URL, focused: true, reusedServer: server.reused };
    }

    let backgroundColor = '#f4f1ea';
    try {
        const { getAppTheme, MAIN_BG } = require('./app-theme');
        backgroundColor = MAIN_BG[getAppTheme()] || backgroundColor;
    } catch (_) { /* ignore */ }

    const win = new BrowserWindow({
        width: 1280,
        height: 840,
        minWidth: 960,
        minHeight: 640,
        title: 'Transub Sanitize训练台',
        icon: getWindowIconOption(),
        autoHideMenuBar: true,
        backgroundColor,
        show: false,
        modal: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload-mt-train.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    mtTrainWindow = win;
    attachUiZoom(win);
    win.setMenuBarVisibility(false);
    win.removeMenu();
    applyWindowIcon(win);

    win.on('closed', () => {
        if (mtTrainWindow === win) mtTrainWindow = null;
    });

    await win.loadURL(TRAIN_URL);

    win.once('ready-to-show', () => {
        if (win.isDestroyed()) return;
        applyWindowIcon(win);
        win.show();
        win.focus();
    });

    return { ok: true, url: TRAIN_URL, reusedServer: server.reused };
}

function getMtTrainWindow() {
    if (mtTrainWindow && !mtTrainWindow.isDestroyed()) return mtTrainWindow;
    return null;
}

function isMtTrainWindowSender(webContents) {
    const win = getMtTrainWindow();
    return !!(win && webContents && win.webContents === webContents);
}

module.exports = {
    isDevBuild,
    openMtTrainWindow,
    getMtTrainWindow,
    isMtTrainWindowSender,
    stopTrainServerChild,
    TRAIN_URL,
    TRAIN_PORT,
};
