/**
 * Background app update checks driven by settings.autoUpdateCheckInterval.
 * Values: off | daily | weekly | monthly
 */
const { loadSettings, patchSettings } = require('./settings-data');

const VALID_INTERVALS = new Set(['off', 'daily', 'weekly', 'monthly']);

const INTERVAL_MS = {
    daily: 24 * 60 * 60 * 1000,
    weekly: 7 * 24 * 60 * 60 * 1000,
    monthly: 30 * 24 * 60 * 60 * 1000,
};

/** Poll while the app stays open; actual checks still respect the chosen interval. */
const POLL_MS = 60 * 60 * 1000;
/** Let the main/editor window finish first paint before the first network check. */
const STARTUP_DELAY_MS = 12_000;

/** @type {NodeJS.Timeout|null} */
let startupTimer = null;
/** @type {NodeJS.Timeout|null} */
let pollTimer = null;
let checkRunning = false;
/** @type {string|null} */
let dismissedVersion = null;
/** @type {import('electron').App|null} */
let boundApp = null;
/** @type {(() => string)|null} */
let getAppRootFn = null;
/** @type {(() => import('electron').BrowserWindow|null)|null} */
let getParentWindowFn = null;

function getElectron() {
    try {
        return require('electron');
    } catch {
        return null;
    }
}

function normalizeAutoUpdateCheckInterval(value) {
    const v = String(value || '').trim().toLowerCase();
    return VALID_INTERVALS.has(v) ? v : 'weekly';
}

/**
 * @param {string} interval
 * @param {string|null|undefined} lastCheckAt ISO timestamp
 * @param {number} [now]
 */
function isAutoUpdateCheckDue(interval, lastCheckAt, now = Date.now()) {
    const normalized = normalizeAutoUpdateCheckInterval(interval);
    if (normalized === 'off') return false;
    const span = INTERVAL_MS[normalized];
    if (!span) return false;
    const last = Date.parse(String(lastCheckAt || ''));
    if (!Number.isFinite(last)) return true;
    return now - last >= span;
}

function clearAutoUpdateTimers() {
    if (startupTimer) {
        clearTimeout(startupTimer);
        startupTimer = null;
    }
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}

function resolveParentWindow() {
    try {
        const fromHook = getParentWindowFn?.();
        if (fromHook && !fromHook.isDestroyed()) return fromHook;
    } catch { /* ignore */ }
    const electron = getElectron();
    const BrowserWindow = electron?.BrowserWindow;
    if (!BrowserWindow) return null;
    try {
        const focused = BrowserWindow.getFocusedWindow();
        if (focused && !focused.isDestroyed()) return focused;
    } catch { /* ignore */ }
    try {
        const all = BrowserWindow.getAllWindows().filter((w) => w && !w.isDestroyed());
        return all[0] || null;
    } catch {
        return null;
    }
}

async function promptUpgrade(app, checkResult) {
    const latest = String(checkResult?.latestVersion || '').trim();
    const current = String(checkResult?.currentVersion || '').trim();
    if (!latest) return;

    if (dismissedVersion && dismissedVersion === latest) return;

    const electron = getElectron();
    const dialog = electron?.dialog;
    if (!dialog?.showMessageBox) return;

    const parent = resolveParentWindow();
    const opts = {
        type: 'info',
        buttons: ['稍后', '立即升级'],
        defaultId: 1,
        cancelId: 0,
        title: '发现新版本',
        message: `发现新版本 v${latest}`,
        detail: current
            ? `当前版本 v${current}。是否打开更新窗口进行升级？`
            : '是否打开更新窗口进行升级？',
        noLink: true,
    };

    const { response } = parent
        ? await dialog.showMessageBox(parent, opts)
        : await dialog.showMessageBox(opts);

    if (response === 1) {
        const { openUpdateWindow } = require('./update-window');
        openUpdateWindow(app, { parent: parent || undefined, autoCheck: true });
    } else {
        dismissedVersion = latest;
    }
}

async function runAutoUpdateCheckIfDue(app, { force = false } = {}) {
    if (!app || checkRunning) return { ok: false, skipped: true, reason: 'busy' };
    if (!app.isPackaged) return { ok: false, skipped: true, reason: 'dev' };

    const getRoot = getAppRootFn || (() => '');
    let options = {};
    try {
        options = loadSettings(getRoot).options || {};
    } catch (err) {
        console.warn('[auto-update-check] load settings failed:', err?.message || err);
        return { ok: false, skipped: true, reason: 'settings' };
    }

    const interval = normalizeAutoUpdateCheckInterval(options.autoUpdateCheckInterval);
    if (interval === 'off') return { ok: false, skipped: true, reason: 'off' };
    if (!force && !isAutoUpdateCheckDue(interval, options.lastAutoUpdateCheckAt)) {
        return { ok: false, skipped: true, reason: 'not-due' };
    }

    checkRunning = true;
    try {
        const { checkForAppUpdate } = require('./app-updater');
        const { getUpdateWindow } = require('./update-window');
        const result = await checkForAppUpdate();

        try {
            patchSettings(getRoot, { lastAutoUpdateCheckAt: new Date().toISOString() });
        } catch (err) {
            console.warn('[auto-update-check] patch last check failed:', err?.message || err);
        }

        if (!result?.ok) {
            return { ok: false, error: result?.error || 'check failed' };
        }

        if (result.updateAvailable) {
            const existing = getUpdateWindow?.();
            if (existing && !existing.isDestroyed()) {
                // User already has the update UI open — don't stack another prompt.
                return { ok: true, updateAvailable: true, prompted: false };
            }
            await promptUpgrade(app, result);
            return { ok: true, updateAvailable: true, prompted: true };
        }

        return { ok: true, updateAvailable: false };
    } catch (err) {
        console.warn('[auto-update-check] check failed:', err?.message || err);
        return { ok: false, error: err?.message || String(err) };
    } finally {
        checkRunning = false;
    }
}

/**
 * Start / restart background scheduling from current settings.
 * @param {import('electron').App} app
 * @param {{
 *   getAppRoot?: () => string,
 *   getParentWindow?: () => import('electron').BrowserWindow|null,
 * }} [hooks]
 */
function scheduleAutoUpdateChecks(app, hooks = {}) {
    boundApp = app || null;
    if (typeof hooks.getAppRoot === 'function') getAppRootFn = hooks.getAppRoot;
    if (typeof hooks.getParentWindow === 'function') getParentWindowFn = hooks.getParentWindow;

    clearAutoUpdateTimers();
    if (!boundApp) return;

    let interval = 'off';
    try {
        const opts = loadSettings(getAppRootFn || (() => '')).options || {};
        interval = normalizeAutoUpdateCheckInterval(opts.autoUpdateCheckInterval);
    } catch { /* ignore */ }

    if (interval === 'off') return;
    if (!boundApp.isPackaged) return;

    startupTimer = setTimeout(() => {
        startupTimer = null;
        void runAutoUpdateCheckIfDue(boundApp);
        pollTimer = setInterval(() => {
            void runAutoUpdateCheckIfDue(boundApp);
        }, POLL_MS);
        if (typeof pollTimer.unref === 'function') pollTimer.unref();
    }, STARTUP_DELAY_MS);
    if (typeof startupTimer.unref === 'function') startupTimer.unref();
}

/** Re-read settings after save and reschedule. */
function syncAutoUpdateCheckFromOptions(app, _options = {}) {
    scheduleAutoUpdateChecks(app || boundApp, {
        getAppRoot: getAppRootFn || undefined,
        getParentWindow: getParentWindowFn || undefined,
    });
}

function stopAutoUpdateChecks() {
    clearAutoUpdateTimers();
    checkRunning = false;
}

module.exports = {
    VALID_INTERVALS,
    INTERVAL_MS,
    normalizeAutoUpdateCheckInterval,
    isAutoUpdateCheckDue,
    scheduleAutoUpdateChecks,
    syncAutoUpdateCheckFromOptions,
    stopAutoUpdateChecks,
    runAutoUpdateCheckIfDue,
};
