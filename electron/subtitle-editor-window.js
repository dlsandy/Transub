const { BrowserWindow, dialog } = require('electron');
const path = require('path');
const { resolveHtmlPath } = require('./app-paths');
const { getEditorWindowIconOption, applyEditorWindowIcon } = require('./icons');
const { guessVideoPathForSubtitle } = require('./subtitle-utils');
const { asString } = require('./ipc-validate');
const { refocusWindow } = require('./window-focus');

/** @type {Map<string, import('electron').BrowserWindow>} */
const editorWindows = new Map();

function editorWindowKey(subPath) {
    return process.platform === 'win32'
        ? path.resolve(String(subPath || '')).toLowerCase()
        : path.resolve(String(subPath || ''));
}

function sendEditorInit(win, payload) {
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
    win.webContents.send('subtitle-editor-init', payload);
}

function createEditorPickSplashWindow(app) {
    const win = new BrowserWindow({
        width: 420,
        height: 210,
        resizable: false,
        maximizable: false,
        minimizable: true,
        fullscreenable: false,
        title: 'Transub 字幕编辑器',
        icon: getEditorWindowIconOption(),
        autoHideMenuBar: true,
        backgroundColor: '#f3f4f6',
        center: true,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
        show: false,
    });
    win.setMenuBarVisibility(false);
    win.removeMenu();
    const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<style>
html,body{margin:0;height:100%;font-family:"Segoe UI","Microsoft YaHei",sans-serif;background:#f3f4f6;color:#1f2937}
.wrap{height:100%;display:flex;align-items:center;justify-content:center;padding:1.25rem;box-sizing:border-box}
.card{width:100%;text-align:center}
.brand{font-size:0.75rem;font-weight:600;letter-spacing:0.04em;color:#6d28d9;margin:0 0 0.7rem}
h1{font-size:1rem;font-weight:600;margin:0 0 0.35rem}
p{margin:0;font-size:0.8rem;color:#6b7280;line-height:1.45}
.spin{width:1.15rem;height:1.15rem;margin:0.85rem auto 0;border:2px solid #ddd6fe;border-top-color:#6d28d9;border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
</style></head><body><div class="wrap"><div class="card">
<p class="brand">Transub</p>
<h1>正在启动字幕编辑器</h1>
<p>请在弹出的对话框中选择要编辑的字幕文件…</p>
<div class="spin" aria-hidden="true"></div>
</div></div></body></html>`;
    applyEditorWindowIcon(win);
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    win.once('ready-to-show', () => {
        if (!win.isDestroyed()) {
            applyEditorWindowIcon(win);
            win.show();
        }
    });
    // 即使页面未及时 ready，也不要长时间完全无窗口
    setTimeout(() => {
        if (!win.isDestroyed() && !win.isVisible()) win.show();
    }, 300);
    return win;
}

function createSubtitleEditorWindow(app, { subPath, videoPath } = {}) {
    const resolvedSub = path.resolve(String(subPath || ''));
    const key = editorWindowKey(resolvedSub);
    const existing = editorWindows.get(key);
    if (existing && !existing.isDestroyed()) {
        existing.focus();
        if (!existing.isMaximized()) existing.maximize();
        sendEditorInit(existing, {
            subPath: resolvedSub,
            videoPath: videoPath || guessVideoPathForSubtitle(resolvedSub) || '',
        });
        return existing;
    }

    const linkedVideo = String(videoPath || '').trim()
        || guessVideoPathForSubtitle(resolvedSub)
        || '';
    const win = new BrowserWindow({
        width: 1100,
        height: 720,
        minWidth: 800,
        minHeight: 520,
        title: `Transub字幕编辑器 — ${path.basename(resolvedSub)}`,
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

    const initPayload = { subPath: resolvedSub, videoPath: linkedVideo };
    let shown = false;
    const reveal = () => {
        if (shown || win.isDestroyed()) return;
        shown = true;
        applyEditorWindowIcon(win);
        if (!win.isMaximized()) win.maximize();
        win.show();
    };
    win.once('ready-to-show', reveal);
    // 大页面首次绘制偏慢时，避免长时间完全无窗口
    setTimeout(reveal, 450);

    win.webContents.once('did-finish-load', () => {
        sendEditorInit(win, initPayload);
    });

    win.loadFile(resolveHtmlPath(app, 'subtitle-editor.html'), {
        query: { sub: path.basename(resolvedSub) },
    });

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
        editorWindows.delete(key);
    });

    editorWindows.set(key, win);
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

function openMainSettingsWindow(windowManager, tab = 'editor') {
    if (!windowManager?.showMainWindow) {
        return { ok: false, error: '主窗口不可用' };
    }
    const win = windowManager.showMainWindow();
    if (!win || win.isDestroyed()) {
        return { ok: false, error: '无法打开主窗口' };
    }
    const resolvedTab = asString(tab, 64).trim() || 'editor';
    pendingOpenParamsTab = resolvedTab;
    const payload = { tab: resolvedTab };
    const send = () => {
        if (win.isDestroyed() || win.webContents.isDestroyed()) return;
        win.webContents.send('transub-open-params', payload);
    };
    if (win.webContents.isLoading()) {
        win.webContents.once('did-finish-load', () => setTimeout(send, 80));
    } else {
        send();
        setTimeout(send, 200);
    }
    return { ok: true };
}

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
            if (!subPath) return { ok: false, error: '缺少字幕路径' };
            const videoPath = asString(payload.videoPath, 4096).trim();
            createSubtitleEditorWindow(app, { subPath, videoPath });
            return { ok: true, path: path.resolve(subPath) };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-open-settings', async (_event, payload = {}) => {
        try {
            return openMainSettingsWindow(windowManager, payload?.tab || 'editor');
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-consume-pending-open-params', async () => {
        const tab = pendingOpenParamsTab;
        pendingOpenParamsTab = null;
        return { ok: true, tab: tab || null };
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
    const splash = createEditorPickSplashWindow(app);
    try {
        const picked = await pickSubtitleFile(splash);
        if (picked.canceled || !picked.path) {
            app.quit();
            return null;
        }
        return createSubtitleEditorWindow(app, {
            subPath: picked.path,
            videoPath: picked.videoPath,
        });
    } finally {
        if (splash && !splash.isDestroyed()) {
            splash.destroy();
        }
    }
}

module.exports = {
    createSubtitleEditorWindow,
    registerSubtitleEditorWindowRoutes,
    closeAllSubtitleEditorWindows,
    openSubtitleEditorOrPick,
};
