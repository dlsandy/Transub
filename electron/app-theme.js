'use strict';

const { app, BrowserWindow, nativeTheme } = require('electron');
const fs = require('fs');
const path = require('path');

const MAIN_BG = Object.freeze({ light: '#f9fafb', dark: '#111827' });
const EDITOR_BG = Object.freeze({ light: '#f3f4f6', dark: '#0f1419' });

/** @type {'light'|'dark'} */
let currentTheme = 'light';
let themeFilePersisted = false;
/** @type {((ms?: number) => void) | null} */
let suppressMinimizeFn = null;

function normalizeTheme(value) {
    return String(value || '').trim() === 'dark' ? 'dark' : 'light';
}

function getAppThemePath() {
    try {
        return path.join(app.getPath('userData'), 'transub-app-theme');
    } catch (_) {
        return '';
    }
}

function getLegacyEditorChromePath() {
    try {
        return path.join(app.getPath('userData'), 'transub-editor-chrome-theme');
    } catch (_) {
        return '';
    }
}

function readThemeFile(filePath) {
    if (!filePath) return null;
    try {
        const raw = String(fs.readFileSync(filePath, 'utf8') || '').trim();
        if (raw === 'dark' || raw === 'light') return raw;
    } catch (_) { /* ignore */ }
    return null;
}

function writeThemeFiles(theme) {
    const t = normalizeTheme(theme);
    const primary = getAppThemePath();
    if (primary) {
        try {
            fs.writeFileSync(primary, t, 'utf8');
            themeFilePersisted = true;
        } catch (_) { /* ignore */ }
    }
    const legacy = getLegacyEditorChromePath();
    if (legacy) {
        try { fs.writeFileSync(legacy, t, 'utf8'); } catch (_) { /* ignore */ }
    }
}

function isEditorWindow(win) {
    try {
        if (win.__transubIsEditorWindow === true) return true;
        const url = String(win.webContents?.getURL?.() || '');
        return url.includes('subtitle-editor.html');
    } catch (_) {
        return false;
    }
}

function backgroundForWindow(win, theme) {
    const t = normalizeTheme(theme);
    return isEditorWindow(win) ? EDITOR_BG[t] : MAIN_BG[t];
}

function applyNativeThemeSource(theme) {
    const t = normalizeTheme(theme);
    try {
        nativeTheme.themeSource = t === 'dark' ? 'dark' : 'light';
    } catch (_) { /* ignore */ }
}

function applyWindowChromeColors(theme) {
    const t = normalizeTheme(theme);
    try {
        for (const win of BrowserWindow.getAllWindows()) {
            if (!win || win.isDestroyed()) continue;
            try {
                win.setBackgroundColor(backgroundForWindow(win, t));
            } catch (_) { /* ignore */ }
            try {
                if (isEditorWindow(win)) win.__transubDarkTheme = t === 'dark';
            } catch (_) { /* ignore */ }
        }
    } catch (_) { /* ignore */ }
}

function broadcastTheme(theme) {
    const payload = { theme: normalizeTheme(theme) };
    try {
        for (const win of BrowserWindow.getAllWindows()) {
            if (!win || win.isDestroyed() || win.webContents?.isDestroyed?.()) continue;
            try {
                win.webContents.send('transub-app-theme-changed', payload);
            } catch (_) { /* ignore */ }
        }
    } catch (_) { /* ignore */ }
}

function linkSuppressMinimizeToTray(fn) {
    suppressMinimizeFn = typeof fn === 'function' ? fn : null;
}

function getAppTheme() {
    return normalizeTheme(currentTheme);
}

function isAppThemePersisted() {
    return themeFilePersisted;
}

/**
 * @param {string} theme
 * @param {{ broadcast?: boolean, persist?: boolean }} [opts]
 */
function setAppTheme(theme, opts = {}) {
    const next = normalizeTheme(theme);
    const prev = normalizeTheme(currentTheme);
    const changed = next !== prev;
    currentTheme = next;

    if (opts.persist !== false) writeThemeFiles(next);

    let nativeChanged = false;
    try {
        const want = next === 'dark' ? 'dark' : 'light';
        nativeChanged = nativeTheme.themeSource !== want;
    } catch (_) { /* ignore */ }

    if (changed || nativeChanged) {
        try { suppressMinimizeFn?.(1600); } catch (_) { /* ignore */ }
        applyNativeThemeSource(next);
    }

    applyWindowChromeColors(next);

    if (opts.broadcast !== false) broadcastTheme(next);
    return next;
}

/**
 * Load persisted theme and apply nativeTheme before any BrowserWindow is created.
 */
function initAppTheme() {
    const primary = readThemeFile(getAppThemePath());
    if (primary) {
        themeFilePersisted = true;
        currentTheme = primary;
    } else {
        const legacy = readThemeFile(getLegacyEditorChromePath());
        currentTheme = legacy || 'light';
        themeFilePersisted = false;
        // Seed shared file from legacy chrome pref so later boots are consistent.
        if (legacy) writeThemeFiles(legacy);
    }
    applyNativeThemeSource(currentTheme);
    return getAppTheme();
}

function registerAppThemeIpc(ipcMain) {
    if (!ipcMain || typeof ipcMain.handle !== 'function') return;
    ipcMain.handle('transub-get-app-theme', async () => ({
        ok: true,
        theme: getAppTheme(),
        persisted: isAppThemePersisted(),
    }));
    ipcMain.handle('transub-set-app-theme', async (_event, payload = {}) => {
        try {
            const theme = setAppTheme(payload?.theme);
            return { ok: true, theme };
        } catch (err) {
            return { ok: false, error: err?.message || String(err), theme: getAppTheme() };
        }
    });
}

module.exports = {
    MAIN_BG,
    EDITOR_BG,
    normalizeTheme,
    getAppTheme,
    isAppThemePersisted,
    setAppTheme,
    initAppTheme,
    linkSuppressMinimizeToTray,
    registerAppThemeIpc,
    backgroundForWindow,
    applyWindowChromeColors,
};
