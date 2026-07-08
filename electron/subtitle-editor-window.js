const { BrowserWindow, dialog } = require('electron');
const path = require('path');
const { resolveHtmlPath } = require('./app-paths');
const { getAppIcon } = require('./icons');
const { guessVideoPathForSubtitle } = require('./subtitle-utils');
const { asString } = require('./ipc-validate');

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
    const icon = getAppIcon();
    const win = new BrowserWindow({
        width: 1100,
        height: 720,
        minWidth: 800,
        minHeight: 520,
        title: `字幕编辑 — ${path.basename(resolvedSub)}`,
        icon: icon.isEmpty() ? undefined : icon,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            webSecurity: false,
        },
        show: false,
    });

    win.setMenuBarVisibility(false);
    win.removeMenu();

    const initPayload = { subPath: resolvedSub, videoPath: linkedVideo };

    win.once('ready-to-show', () => {
        if (!win.isDestroyed()) {
            win.maximize();
            win.show();
        }
    });

    win.webContents.once('did-finish-load', () => {
        sendEditorInit(win, initPayload);
    });

    win.loadFile(resolveHtmlPath(app, 'subtitle-editor.html'));

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

        if (response === 2) return;

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
            if (!saved) return;
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

function registerSubtitleEditorWindowRoutes(register, app) {
    register('transub-open-subtitle-editor', async (event, payload = {}) => {
        try {
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
}

function closeAllSubtitleEditorWindows() {
    for (const win of editorWindows.values()) {
        if (!win.isDestroyed()) win.destroy();
    }
    editorWindows.clear();
}

module.exports = {
    createSubtitleEditorWindow,
    registerSubtitleEditorWindowRoutes,
    closeAllSubtitleEditorWindows,
};
