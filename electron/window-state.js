const fs = require('fs');
const path = require('path');
const { screen } = require('electron');
const { getWritableRoot } = require('./app-paths');
const { clampInt } = require('./shared-utils');

const WINDOW_STATE_FILE = 'window-state.json';
const DEFAULT_WINDOW = Object.freeze({
    width: 1680,
    height: 1200,
    // Keep header / 添加·开始 / 常用设置 chips on one row (avoid flex-wrap).
    minWidth: 1100,
    minHeight: 640,
});
const SAVE_STATE_DEBOUNCE_MS = 400;

function getWindowStatePath(name = '') {
    const key = String(name || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!key) return path.join(getWritableRoot(), WINDOW_STATE_FILE);
    return path.join(getWritableRoot(), `window-state-${key}.json`);
}

function boundsOverlapWorkArea(bounds, workArea) {
    return bounds.x < workArea.x + workArea.width
        && bounds.x + bounds.width > workArea.x
        && bounds.y < workArea.y + workArea.height
        && bounds.y + bounds.height > workArea.y;
}

function sanitizeWindowState(raw, defaults = DEFAULT_WINDOW) {
    if (!raw || typeof raw !== 'object') return null;
    const minW = Number(defaults.minWidth) > 0 ? Number(defaults.minWidth) : DEFAULT_WINDOW.minWidth;
    const minH = Number(defaults.minHeight) > 0 ? Number(defaults.minHeight) : DEFAULT_WINDOW.minHeight;
    const defW = Number(defaults.width) > 0 ? Number(defaults.width) : DEFAULT_WINDOW.width;
    const defH = Number(defaults.height) > 0 ? Number(defaults.height) : DEFAULT_WINDOW.height;
    const width = clampInt(raw.width, defW, minW, 10000);
    const height = clampInt(raw.height, defH, minH, 10000);
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

function loadWindowState(name = '', defaults = DEFAULT_WINDOW) {
    try {
        const filePath = getWindowStatePath(name);
        if (!fs.existsSync(filePath)) return null;
        return sanitizeWindowState(JSON.parse(fs.readFileSync(filePath, 'utf8')), defaults);
    } catch (err) {
        console.warn('[window-state] 读取窗口状态失败:', err.message);
        return null;
    }
}

function writeWindowState(state, name = '') {
    try {
        const filePath = getWindowStatePath(name);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    } catch (err) {
        console.warn('[window-state] 保存窗口状态失败:', err.message);
    }
}

function captureWindowState(win, defaults = DEFAULT_WINDOW) {
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
    }, defaults);
}

module.exports = {
    DEFAULT_WINDOW,
    SAVE_STATE_DEBOUNCE_MS,
    sanitizeWindowState,
    loadWindowState,
    writeWindowState,
    captureWindowState,
};
