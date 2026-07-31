/**
 * UI zoom for high-DPI / 4K displays.
 * Preference persisted under writable root; applied via webContents.setZoomFactor.
 */

const fs = require('fs');
const path = require('path');
const { getWritableRoot } = require('./app-paths');

function electronApi() {
    return require('electron');
}

const PREFS_FILE = 'ui-prefs.json';
const DEFAULT_PREF = 'auto';
const ALLOWED_FIXED = Object.freeze([1, 1.1, 1.25, 1.5]);
const MIN_FACTOR = 0.85;
const MAX_FACTOR = 2;
const MOVE_DEBOUNCE_MS = 200;
/** Physical width/height (px) treated as 4K-class. */
const PHYS_W_4K = 3500;
const PHYS_H_4K = 2000;

/** @type {string|number} */
let cachedPref = null;
/** @type {WeakMap<import('electron').BrowserWindow, { moveTimer?: ReturnType<typeof setTimeout> }>} */
const attached = new WeakMap();

function getPrefsPath() {
    return path.join(getWritableRoot(), PREFS_FILE);
}

/**
 * @param {unknown} raw
 * @returns {'auto'|number}
 */
function sanitizeUiZoomPref(raw) {
    if (raw === 'auto' || raw == null || raw === '') return DEFAULT_PREF;
    const n = Number(raw);
    if (!Number.isFinite(n)) return DEFAULT_PREF;
    for (const allowed of ALLOWED_FIXED) {
        if (Math.abs(n - allowed) < 0.001) return allowed;
    }
    return Math.max(MIN_FACTOR, Math.min(MAX_FACTOR, Math.round(n * 100) / 100));
}

/**
 * @param {'auto'|number} pref
 * @param {{ size?: { width?: number, height?: number }, scaleFactor?: number }|null|undefined} display
 * @returns {number}
 */
function resolveZoomFactor(pref, display) {
    const sanitized = sanitizeUiZoomPref(pref);
    if (sanitized !== 'auto') {
        return Math.max(MIN_FACTOR, Math.min(MAX_FACTOR, Number(sanitized)));
    }

    const scale = Number(display?.scaleFactor);
    const scaleFactor = Number.isFinite(scale) && scale > 0 ? scale : 1;
    const w = Number(display?.size?.width) || 0;
    const h = Number(display?.size?.height) || 0;
    const physicalW = w * scaleFactor;
    const physicalH = h * scaleFactor;
    const is4kClass = physicalW >= PHYS_W_4K || physicalH >= PHYS_H_4K;
    if (!is4kClass) return 1;
    if (scaleFactor >= 1.5) return 1;
    if (scaleFactor >= 1.25) return 1.1;
    return 1.25;
}

function loadUiZoomPref() {
    if (cachedPref !== null) return cachedPref;
    try {
        const filePath = getPrefsPath();
        if (!fs.existsSync(filePath)) {
            cachedPref = DEFAULT_PREF;
            return cachedPref;
        }
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        cachedPref = sanitizeUiZoomPref(raw?.uiZoom);
        return cachedPref;
    } catch (err) {
        console.warn('[ui-zoom] 读取偏好失败:', err.message);
        cachedPref = DEFAULT_PREF;
        return cachedPref;
    }
}

function writeUiZoomPref(pref) {
    const value = sanitizeUiZoomPref(pref);
    cachedPref = value;
    try {
        const filePath = getPrefsPath();
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        let existing = {};
        try {
            if (fs.existsSync(filePath)) {
                existing = JSON.parse(fs.readFileSync(filePath, 'utf8')) || {};
            }
        } catch { /* ignore corrupt */ }
        const next = { ...existing, uiZoom: value };
        fs.writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    } catch (err) {
        console.warn('[ui-zoom] 保存偏好失败:', err.message);
    }
    return value;
}

/**
 * @param {import('electron').BrowserWindow} win
 */
function applyUiZoomToWindow(win) {
    if (!win || win.isDestroyed() || win.webContents?.isDestroyed?.()) return;
    try {
        const { screen } = electronApi();
        const bounds = win.getBounds();
        const display = screen.getDisplayMatching(bounds);
        const factor = resolveZoomFactor(loadUiZoomPref(), display);
        win.webContents.setZoomFactor(factor);
    } catch (err) {
        console.warn('[ui-zoom] 应用缩放失败:', err.message);
    }
}

function applyUiZoomToAll() {
    try {
        const { BrowserWindow } = electronApi();
        for (const win of BrowserWindow.getAllWindows()) {
            applyUiZoomToWindow(win);
        }
    } catch (err) {
        console.warn('[ui-zoom] 全量应用失败:', err.message);
    }
}

/**
 * @param {import('electron').BrowserWindow} win
 */
function attachUiZoom(win) {
    if (!win || win.isDestroyed()) return;
    if (attached.has(win)) {
        applyUiZoomToWindow(win);
        return;
    }
    const state = {};
    attached.set(win, state);

    const apply = () => applyUiZoomToWindow(win);
    win.webContents.on('did-finish-load', apply);
    win.on('moved', () => {
        if (state.moveTimer) clearTimeout(state.moveTimer);
        state.moveTimer = setTimeout(apply, MOVE_DEBOUNCE_MS);
    });
    win.on('closed', () => {
        if (state.moveTimer) clearTimeout(state.moveTimer);
    });

    // Apply ASAP for already-loading / shown windows
    apply();
}

/**
 * @param {unknown} [pref]
 */
function setUiZoomPref(pref) {
    const value = writeUiZoomPref(pref);
    applyUiZoomToAll();
    return value;
}

function getUiZoomPref() {
    return loadUiZoomPref();
}

/** @internal test helper */
function _resetUiZoomCacheForTests() {
    cachedPref = null;
}

module.exports = {
    DEFAULT_PREF,
    ALLOWED_FIXED,
    sanitizeUiZoomPref,
    resolveZoomFactor,
    loadUiZoomPref,
    writeUiZoomPref,
    getUiZoomPref,
    setUiZoomPref,
    applyUiZoomToWindow,
    applyUiZoomToAll,
    attachUiZoom,
    _resetUiZoomCacheForTests,
};
