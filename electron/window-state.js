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

function getWindowStatePath() {
    return path.join(getWritableRoot(), WINDOW_STATE_FILE);
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
        console.warn('[window-state] 读取窗口状态失败:', err.message);
        return null;
    }
}

function writeWindowState(state) {
    try {
        const filePath = getWindowStatePath();
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    } catch (err) {
        console.warn('[window-state] 保存窗口状态失败:', err.message);
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

module.exports = {
    DEFAULT_WINDOW,
    SAVE_STATE_DEBOUNCE_MS,
    sanitizeWindowState,
    loadWindowState,
    writeWindowState,
    captureWindowState,
};
