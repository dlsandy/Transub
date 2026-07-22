const { BrowserWindow, dialog } = require('electron');
const path = require('path');
const { resolveHtmlPath } = require('./app-paths');
const { getEditorWindowIconOption, applyEditorWindowIcon } = require('./icons');
const { guessVideoPathForSubtitle } = require('./subtitle-utils');
const { asString } = require('./ipc-validate');
const { refocusWindow } = require('./window-focus');

/** @type {Map<string, import('electron').BrowserWindow>} */
const editorWindows = new Map();
const EMPTY_EDITOR_KEY = '__welcome__';

function editorWindowKey(subPath) {
    const raw = String(subPath || '').trim();
    if (!raw) return EMPTY_EDITOR_KEY;
    return process.platform === 'win32'
        ? path.resolve(raw).toLowerCase()
        : path.resolve(raw);
}

function sendEditorInit(win, payload) {
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
    win.webContents.send('subtitle-editor-init', payload);
}

function unbindEditorWindow(win) {
    for (const [key, existing] of editorWindows.entries()) {
        if (existing === win) editorWindows.delete(key);
    }
}

function bindEditorWindow(win, subPath) {
    if (!win || win.isDestroyed()) return;
    unbindEditorWindow(win);
    editorWindows.set(editorWindowKey(subPath), win);
}

const WELCOME_WINDOW = {
    width: 480,
    height: 640,
    minWidth: 420,
    minHeight: 520,
};

const EDITOR_WINDOW = {
    width: 1100,
    height: 720,
    minWidth: 800,
    minHeight: 520,
};

function maximizeEditorWindow(win) {
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    if (!win.isMaximized()) win.maximize();
}

function createSubtitleEditorWindow(app, { subPath, videoPath } = {}) {
    const rawSub = String(subPath || '').trim();
    const resolvedSub = rawSub ? path.resolve(rawSub) : '';
    const key = editorWindowKey(resolvedSub);
    const existing = editorWindows.get(key);
    if (existing && !existing.isDestroyed()) {
        existing.focus();
        if (resolvedSub) {
            maximizeEditorWindow(existing);
            sendEditorInit(existing, {
                subPath: resolvedSub,
                videoPath: videoPath || guessVideoPathForSubtitle(resolvedSub) || '',
            });
        }
        return existing;
    }

    // 无路径启动时仅复用空启动窗（保持小窗，不最大化）
    if (!resolvedSub) {
        const welcome = editorWindows.get(EMPTY_EDITOR_KEY);
        if (welcome && !welcome.isDestroyed()) {
            if (welcome.isMinimized()) welcome.restore();
            welcome.show();
            welcome.focus();
            return welcome;
        }
    }

    const linkedVideo = resolvedSub
        ? (String(videoPath || '').trim() || guessVideoPathForSubtitle(resolvedSub) || '')
        : '';
    const size = resolvedSub ? EDITOR_WINDOW : WELCOME_WINDOW;
    const win = new BrowserWindow({
        width: size.width,
        height: size.height,
        minWidth: size.minWidth,
        minHeight: size.minHeight,
        center: !resolvedSub,
        title: resolvedSub
            ? `Transub Editor — ${path.basename(resolvedSub)}`
            : 'Transub Editor',
        icon: getEditorWindowIconOption(),
        autoHideMenuBar: true,
        backgroundColor: '#f3f4f6',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            webSecurity: true,
            backgroundThrottling: false,
        },
        show: false,
    });

    win.setMenuBarVisibility(false);
    win.removeMenu();
    applyEditorWindowIcon(win);

    const initPayload = resolvedSub
        ? { subPath: resolvedSub, videoPath: linkedVideo }
        : { welcome: true };
    let shown = false;
    const reveal = () => {
        if (shown || win.isDestroyed()) return;
        shown = true;
        applyEditorWindowIcon(win);
        win.show();
        // 有字幕文件时最大化；启动欢迎页保持小窗居中
        if (resolvedSub) maximizeEditorWindow(win);
        applyEditorWindowIcon(win);
    };
    win.once('ready-to-show', reveal);
    // 大页面首次绘制偏慢时，避免长时间完全无窗口
    setTimeout(reveal, 450);

    win.webContents.once('did-finish-load', () => {
        sendEditorInit(win, initPayload);
    });

    const loadOpts = resolvedSub
        ? { query: { sub: path.basename(resolvedSub) } }
        : { query: { welcome: '1' } };
    win.loadFile(resolveHtmlPath(app, 'subtitle-editor.html'), loadOpts);

    let closingConfirmed = false;

    win.on('close', async (e) => {
        if (closingConfirmed || win.isDestroyed() || win.webContents.isDestroyed()) return;
        e.preventDefault();

        let dirty = false;
        try {
            dirty = await win.webContents.executeJavaScript(
                'Boolean(window.__transubEditorGetDirty?.())',
                true
            );
        } catch (_) {
            closingConfirmed = true;
            win.close();
            return;
        }

        if (!dirty) {
            closingConfirmed = true;
            win.close();
            return;
        }

        const { response } = await dialog.showMessageBox(win, {
            type: 'warning',
            buttons: ['保存', '不保存', '取消'],
            defaultId: 0,
            cancelId: 2,
            title: '未保存的更改',
            message: '字幕已修改但未保存',
            detail: '是否在关闭前保存更改？',
            noLink: true,
        });

        if (response === 2) {
            refocusWindow(win);
            return;
        }

        if (response === 0) {
            let saved = false;
            try {
                saved = await win.webContents.executeJavaScript(
                    '(async () => Boolean(await window.__transubEditorSaveBeforeClose?.()))()',
                    true
                );
            } catch (_) {
                return;
            }
            if (!saved) {
                refocusWindow(win);
                return;
            }
        }

        closingConfirmed = true;
        win.close();
    });

    win.on('closed', () => {
        unbindEditorWindow(win);
    });

    bindEditorWindow(win, resolvedSub);
    return win;
}

async function pickSubtitleFile(parentWindow) {
    if (parentWindow && !parentWindow.isDestroyed()) {
        if (parentWindow.isMinimized()) parentWindow.restore();
        parentWindow.show();
        parentWindow.focus();
    }
    const result = await dialog.showOpenDialog(parentWindow || undefined, {
        title: '选择要编辑的字幕文件',
        properties: ['openFile'],
        filters: [
            { name: '字幕 (SRT / VTT / LRC)', extensions: ['srt', 'vtt', 'lrc'] },
            { name: '所有文件', extensions: ['*'] },
        ],
    });
    refocusWindow(parentWindow);
    if (result.canceled || !result.filePaths?.length) {
        return { ok: true, canceled: true };
    }
    const subPath = path.resolve(result.filePaths[0]);
    return {
        ok: true,
        canceled: false,
        path: subPath,
        videoPath: guessVideoPathForSubtitle(subPath) || '',
    };
}

/** @type {string|null} */
let pendingOpenParamsTab = null;

function registerSubtitleEditorWindowRoutes(register, app, { warmBridges, windowManager } = {}) {
    register('transub-open-subtitle-editor', async (event, payload = {}) => {
        try {
            warmBridges?.();
            const parentWin = BrowserWindow.fromWebContents(event.sender);

            if (payload.pick) {
                const picked = await pickSubtitleFile(parentWin);
                if (picked.canceled) return { ok: true, canceled: true };
                if (!picked.path) return picked;
                createSubtitleEditorWindow(app, {
                    subPath: picked.path,
                    videoPath: picked.videoPath,
                });
                return { ok: true, path: picked.path };
            }

            const subPath = asString(payload.subPath || payload.path, 4096).trim();
            if (!subPath) {
                if (payload.welcome) {
                    createSubtitleEditorWindow(app, {});
                    return { ok: true, welcome: true };
                }
                return { ok: false, error: '缺少字幕路径' };
            }
            const videoPath = asString(payload.videoPath, 4096).trim();
            createSubtitleEditorWindow(app, { subPath, videoPath });
            return { ok: true, path: path.resolve(subPath) };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-editor-register-path', async (event, payload = {}) => {
        try {
            const win = BrowserWindow.fromWebContents(event.sender);
            if (!win || win.isDestroyed()) return { ok: false, error: '窗口不存在' };
            const subPath = asString(payload.subPath || payload.path, 4096).trim();
            if (!subPath) return { ok: false, error: '缺少字幕路径' };
            const resolved = path.resolve(subPath);
            bindEditorWindow(win, resolved);
            try {
                win.setMinimumSize(EDITOR_WINDOW.minWidth, EDITOR_WINDOW.minHeight);
                win.setTitle(`Transub Editor — ${path.basename(resolved)}`);
            } catch (_) { /* ignore */ }
            maximizeEditorWindow(win);
            return { ok: true, path: resolved };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-open-settings', async (event, payload = {}) => {
        try {
            warmBridges?.();
            const parentWin = BrowserWindow.fromWebContents(event.sender);
            const { openSettingsWindow } = require('./settings-window');
            return openSettingsWindow(app, {
                tab: payload?.tab || 'editor',
                parent: parentWin || undefined,
                checkUpdate: !!payload?.checkUpdate,
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-open-update-window', async (event, payload = {}) => {
        try {
            warmBridges?.();
            const parentWin = BrowserWindow.fromWebContents(event.sender);
            const { openUpdateWindow } = require('./update-window');
            return openUpdateWindow(app, {
                parent: parentWin || undefined,
                autoCheck: payload?.autoCheck !== false,
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-open-about-window', async (event) => {
        try {
            warmBridges?.();
            const parentWin = BrowserWindow.fromWebContents(event.sender);
            const { openAboutWindow } = require('./about-window');
            return openAboutWindow(app, {
                parent: parentWin || undefined,
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-show-main-window', async () => {
        try {
            warmBridges?.();
            if (!windowManager?.showMainWindow) {
                return { ok: false, error: '无法打开字幕生成器' };
            }
            windowManager.showMainWindow();
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-consume-pending-open-params', async () => {
        try {
            const { consumePendingSettingsTab } = require('./settings-window');
            const tab = consumePendingSettingsTab() || pendingOpenParamsTab;
            pendingOpenParamsTab = null;
            return { ok: true, tab: tab || null };
        } catch {
            const tab = pendingOpenParamsTab;
            pendingOpenParamsTab = null;
            return { ok: true, tab: tab || null };
        }
    });

    register('transub-editor-refocus', async (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        refocusWindow(win);
        return { ok: true };
    });

    register('transub-editor-confirm', async (event, payload = {}) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        const message = asString(payload.message, 4000).trim() || '确定？';
        const detail = asString(payload.detail, 4000).trim();
        const title = asString(payload.title, 200).trim() || '确认';
        const okLabel = asString(payload.okLabel, 40).trim() || '确定';
        const cancelLabel = asString(payload.cancelLabel, 40).trim() || '取消';
        try {
            const { response } = await dialog.showMessageBox(win || undefined, {
                type: payload.type || 'question',
                buttons: [okLabel, cancelLabel],
                defaultId: 0,
                cancelId: 1,
                noLink: true,
                title,
                message,
                detail: detail || undefined,
            });
            refocusWindow(win);
            return { ok: true, confirmed: response === 0 };
        } catch (err) {
            refocusWindow(win);
            return { ok: false, confirmed: false, error: err.message || String(err) };
        }
    });
}

function closeAllSubtitleEditorWindows() {
    for (const win of editorWindows.values()) {
        if (!win.isDestroyed()) win.destroy();
    }
    editorWindows.clear();
}

async function openSubtitleEditorOrPick(app) {
    return createSubtitleEditorWindow(app, {});
}

module.exports = {
    createSubtitleEditorWindow,
    registerSubtitleEditorWindowRoutes,
    closeAllSubtitleEditorWindows,
    openSubtitleEditorOrPick,
};
