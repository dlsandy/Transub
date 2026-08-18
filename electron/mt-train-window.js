'use strict';

/**
 * Learning wizard window: spawn/reuse local HTTP console and open BrowserWindow.
 * Dev: always available. Packaged: Transub Pro only; writes forced to local sandbox.
 */
const { BrowserWindow, app: electronApp } = require('electron');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { getWindowIconOption, applyWindowIcon } = require('./icons');
const { attachUiZoom } = require('./ui-zoom');

const TRAIN_PORT = Number(process.env.MT_TRAIN_PORT) || 8787;
const TRAIN_HOST = '127.0.0.1';

/** @type {import('electron').BrowserWindow|null} */
let mtTrainWindow = null;
/** @type {import('child_process').ChildProcess|null} */
let trainServerChild = null;
let quitHookInstalled = false;
/** @type {'dev'|'pro'} */
let activeAudience = 'dev';

function isDevBuild(app = electronApp) {
    try {
        return !app.isPackaged;
    } catch (_) {
        return false;
    }
}

function isProEntitledForTrain() {
    try {
        const gates = require('./advanced-gates');
        return !!gates.requireFeature('*')?.ok;
    } catch (_) {
        return false;
    }
}

/**
 * @param {import('electron').App} [app]
 * @returns {{ ok: boolean, audience?: 'dev'|'pro', error?: string, code?: string, isDev?: boolean, isPro?: boolean }}
 */
function canOpenMtTrain(app = electronApp) {
    if (isDevBuild(app)) {
        return { ok: true, audience: 'dev', isDev: true, isPro: isProEntitledForTrain() };
    }
    if (isProEntitledForTrain()) {
        return { ok: true, audience: 'pro', isDev: false, isPro: true };
    }
    return {
        ok: false,
        error: '学习向导需要 Transub Pro',
        code: 'not_entitled',
        isDev: false,
        isPro: false,
    };
}

function trainWizardUrl(audience = activeAudience) {
    const q = audience === 'pro' ? '?pro=1' : '';
    return `http://${TRAIN_HOST}:${TRAIN_PORT}/${q}`;
}

function getRepoRoot() {
    try {
        if (electronApp?.isPackaged && typeof electronApp.getAppPath === 'function') {
            return electronApp.getAppPath();
        }
    } catch (_) { /* ignore */ }
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
                    const f = data?.features || {};
                    const required = [
                        'autoPropose', 'loopReport', 'crossCollateral', 'wizardOnly',
                        'residualDirty', 'harvestReport', 'feedPack', 'asrSuggest',
                        'opposingFixtures', 'userSandbox', 'wizardUxSimplify',
                        'wizardAutoApply', 'wizardDoneState',
                    ];
                    const stale = required.some((k) => !f[k]);
                    resolve({
                        up: true,
                        stale,
                        version: data.version || 0,
                        audience: data.audience === 'pro' ? 'pro' : 'dev',
                    });
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
    if (!isDevBuild()) {
        return process.execPath;
    }
    if (process.env.npm_node_execpath && require('fs').existsSync(process.env.npm_node_execpath)) {
        return process.env.npm_node_execpath;
    }
    return 'node';
}

async function waitForTrainServer({ attempts = 40, intervalMs = 250, audience = 'dev' } = {}) {
    for (let i = 0; i < attempts; i += 1) {
        const probe = await probeTrainServer();
        if (probe.up && !probe.stale) {
            if (audience === 'pro' && probe.audience !== 'pro') {
                // wrong mode — keep waiting / caller will force restart
            } else {
                return true;
            }
        }
        await new Promise((r) => setTimeout(r, intervalMs));
    }
    return false;
}

/**
 * @param {{ audience?: 'dev'|'pro' }} [opts]
 */
async function ensureTrainServer(opts = {}) {
    const audience = opts.audience === 'pro' ? 'pro' : 'dev';
    activeAudience = audience;
    const url = trainWizardUrl(audience);

    const probe = await probeTrainServer();
    const audienceMismatch = probe.up && !probe.stale && audience === 'pro' && probe.audience !== 'pro';
    if (probe.up && !probe.stale && !audienceMismatch) {
        return { ok: true, reused: true, url, audience };
    }

    const legacyUp = !probe.up && await probeTrainServerLegacy();
    const needForce = probe.stale || legacyUp || probe.up || audienceMismatch;

    const root = getRepoRoot();
    const serverJs = path.join(root, 'tools', 'mt-train', 'server.js');
    if (!require('fs').existsSync(serverJs)) {
        return {
            ok: false,
            error: isDevBuild()
                ? `找不到学习向导服务：${serverJs}`
                : '安装包缺少学习向导组件，请更新到最新版',
        };
    }
    stopTrainServerChild();
    const nodeBin = resolveNodeBinary();
    const args = [serverJs, `--port=${TRAIN_PORT}`];
    if (needForce) args.push('--force');
    try {
        const { getWritableRoot } = require('./app-paths');
        const writable = getWritableRoot();
        const env = {
            ...process.env,
            TRANSUB_MT_SANDBOX_ROOT: writable,
            TRANSUB_MT_USER_REMAPS: path.join(writable, 'mt-user-remaps.json'),
            MT_TRAIN_TARGET: 'sandbox',
            TRANSUB_MT_TRAIN_AUDIENCE: audience,
        };
        if (!isDevBuild()) {
            env.ELECTRON_RUN_AS_NODE = '1';
        }
        trainServerChild = spawn(nodeBin, args, {
            cwd: root,
            stdio: 'ignore',
            windowsHide: true,
            env,
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
    const ready = await waitForTrainServer({ audience });
    if (!ready) {
        stopTrainServerChild();
        return { ok: false, error: `学习向导服务未能在 ${TRAIN_PORT} 端口就绪` };
    }
    return { ok: true, reused: false, url, audience, restarted: needForce };
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

/** @type {{ jaPath?: string, zhPath?: string, title?: string, zhPathA?: string, zhPathB?: string, source?: string }|null} */
let pendingLibraryPair = null;

function setPendingLibraryPair(pair) {
    pendingLibraryPair = pair && typeof pair === 'object' ? { ...pair } : null;
}

function consumePendingLibraryPair() {
    const pair = pendingLibraryPair;
    pendingLibraryPair = null;
    return { ok: true, pair: pair || null };
}

/**
 * @param {import('electron').App} app
 * @param {{ jaPath?: string, zhPath?: string, title?: string, zhPathA?: string, zhPathB?: string, source?: string }} [pending]
 * @returns {Promise<{ ok: boolean, error?: string, url?: string, code?: string }>}
 */
async function openMtTrainWindow(app, pending = null) {
    const access = canOpenMtTrain(app);
    if (!access.ok) {
        return { ok: false, error: access.error || '无法打开学习向导', code: access.code };
    }
    installQuitHook(app);

    if (pending && (pending.jaPath || pending.zhPath)) {
        setPendingLibraryPair({
            jaPath: pending.jaPath || '',
            zhPath: pending.zhPath || '',
            zhPathA: pending.zhPathA || '',
            zhPathB: pending.zhPathB || '',
            title: pending.title || '',
            source: pending.source || 'subtitle-library',
        });
    }

    const audience = access.audience || 'dev';
    const server = await ensureTrainServer({ audience });
    if (!server.ok) return server;
    const url = server.url || trainWizardUrl(audience);

    const existing = focusMtTrainWindow();
    if (existing) {
        const pair = pendingLibraryPair;
        pendingLibraryPair = null;
        try {
            existing.webContents.send('transub-mt-train-pending-pair', pair || {});
        } catch (_) { /* ignore */ }
        try {
            if (existing.webContents.getURL() !== url) {
                await existing.loadURL(url);
            }
            existing.focus();
        } catch (_) { /* ignore */ }
        return { ok: true, url, focused: true, reusedServer: server.reused, audience };
    }

    let backgroundColor = '#eef2ef';
    try {
        const { getAppTheme, MAIN_BG } = require('./app-theme');
        backgroundColor = MAIN_BG[getAppTheme()] || backgroundColor;
    } catch (_) { /* ignore */ }

    const win = new BrowserWindow({
        width: 1100,
        height: 820,
        minWidth: 720,
        minHeight: 560,
        show: false,
        backgroundColor,
        title: 'Transub 学习向导',
        ...getWindowIconOption(),
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

    await win.loadURL(url);

    win.once('ready-to-show', () => {
        if (win.isDestroyed()) return;
        applyWindowIcon(win);
        win.show();
        win.focus();
    });

    return { ok: true, url, reusedServer: server.reused, audience };
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
    TRAIN_PORT,
    isDevBuild,
    canOpenMtTrain,
    isProEntitledForTrain,
    ensureTrainServer,
    stopTrainServerChild,
    openMtTrainWindow,
    getMtTrainWindow,
    isMtTrainWindowSender,
    setPendingLibraryPair,
    consumePendingLibraryPair,
    trainWizardUrl,
};
