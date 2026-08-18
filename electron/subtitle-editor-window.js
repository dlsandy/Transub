const { BrowserWindow, dialog } = require('electron');
const path = require('path');
const { resolveHtmlPath } = require('./app-paths');
const { getEditorWindowIconOption, applyEditorWindowIcon } = require('./icons');
const { guessVideoPathForSubtitle } = require('./subtitle-utils');
const { asString } = require('./ipc-validate');
const { refocusWindow } = require('./window-focus');
const { applySubtitleEditorMenu } = require('./subtitle-editor-menu');
const { attachUiZoom } = require('./ui-zoom');
const { getAppTheme, setAppTheme, EDITOR_BG } = require('./app-theme');

/** @type {Map<string, import('electron').BrowserWindow>} */
const editorWindows = new Map();
const EMPTY_EDITOR_KEY = '__welcome__';

/** @type {{
 *   beginSuppressMinimizeToTray?: (ms?: number) => void,
 *   restoreMainAfterSecondaryWindowClosed?: () => void,
 *   getMainWindow?: () => import('electron').BrowserWindow | null,
 *   showMainWindow?: () => import('electron').BrowserWindow | null | undefined,
 *   isMainHiddenToTray?: () => boolean,
 *   isQuitting?: () => boolean,
 * } | null} */
let linkedWindowManager = null;

function linkWindowManager(windowManager) {
    linkedWindowManager = windowManager || null;
}

/** Prevent Windows spurious main-window minimize→tray when this editor closes. */
function armMainMinimizeSuppress(ms) {
    try {
        linkedWindowManager?.beginSuppressMinimizeToTray?.(ms);
    } catch (_) { /* ignore */ }
}

function anyOtherEditorOpen() {
    for (const w of editorWindows.values()) {
        if (w && !w.isDestroyed()) return true;
    }
    return false;
}

/**
 * After an editor closes: undo Windows spurious main hide-to-tray, and if the
 * main app window is already running and still on-screen, focus it.
 * Leave an intentional tray hide alone (do not force-show).
 * Prefer an open subtitle library (or any other focused secondary) over yanking
 * focus back to the main generator window.
 */
function restoreMainAfterEditorClosed() {
    try {
        linkedWindowManager?.restoreMainAfterSecondaryWindowClosed?.();
        if (linkedWindowManager?.isQuitting?.()) return;
        // Keep focus on remaining editors; only hand off when none left.
        if (anyOtherEditorOpen()) return;
        // Soft-park keeps isVisible() true — tray flag is authoritative.
        if (linkedWindowManager?.isMainHiddenToTray?.()) return;

        try {
            const { getSubtitleLibraryWindow } = require('./subtitle-library-window');
            const lib = getSubtitleLibraryWindow();
            if (lib && !lib.isDestroyed()) {
                try {
                    if (lib.isVisible() && !lib.isMinimized()) {
                        lib.show();
                        lib.focus();
                        return;
                    }
                } catch (_) { /* fall through */ }
            }
        } catch (_) { /* ignore */ }

        const focused = BrowserWindow.getFocusedWindow();
        const main = linkedWindowManager?.getMainWindow?.();
        if (focused && main && !main.isDestroyed() && focused.id !== main.id) {
            // Another secondary (settings / about / update) still owns focus.
            return;
        }
        if (!main || main.isDestroyed()) return;
        try {
            // If restore-spurious already ran, main is visible again. If the user
            // had main in the tray on purpose, it is still hidden — leave it.
            if (!main.isVisible() || main.isMinimized()) return;
        } catch (_) {
            return;
        }
        linkedWindowManager?.showMainWindow?.();
    } catch (_) { /* ignore */ }
}

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

/**
 * Sync this editor window's chrome with the shared app theme.
 * Process-wide nativeTheme is owned by app-theme.js (never reset on close).
 * @param {import('electron').BrowserWindow | null | undefined} win
 * @param {boolean} dark
 */
function applyEditorWindowChrome(win, dark) {
    if (!win || win.isDestroyed()) return;
    win.__transubIsEditorWindow = true;
    win.__transubDarkTheme = !!dark;
    const next = dark ? 'dark' : 'light';
    try {
        if (getAppTheme() !== next) {
            setAppTheme(next);
            return;
        }
        win.setBackgroundColor(EDITOR_BG[next]);
    } catch (_) {
        try {
            win.setBackgroundColor(EDITOR_BG[next]);
        } catch (__) { /* ignore */ }
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

function pickLibrarySession(opts = {}) {
    const lib = opts.library && typeof opts.library === 'object' ? opts.library : opts;
    const mediaId = asString(lib.mediaId || opts.mediaId, 128).trim();
    const trackId = asString(lib.trackId || opts.trackId, 128).trim();
    const versionId = asString(lib.versionId || opts.versionId, 128).trim();
    if (!mediaId && !trackId && !versionId) return null;
    return {
        mediaId,
        trackId,
        versionId,
        role: asString(lib.role || opts.role, 32).trim(),
        roleLabel: asString(lib.roleLabel || opts.roleLabel, 64).trim(),
        recipeSummary: asString(lib.recipeSummary || opts.recipeSummary, 512).trim(),
        contentRef: asString(lib.contentRef || opts.contentRef, 1024).trim(),
        exportPath: asString(lib.exportPath || opts.exportPath, 4096).trim(),
        isActive: !!(lib.isActive ?? opts.isActive),
        mediaTitle: asString(lib.mediaTitle || opts.mediaTitle, 256).trim(),
        openedFromBlob: !!(lib.openedFromBlob ?? opts.openedFromBlob),
        mediaLinked: lib.mediaLinked != null ? !!lib.mediaLinked : (opts.mediaLinked != null ? !!opts.mediaLinked : undefined),
        mediaExists: lib.mediaExists != null ? !!lib.mediaExists : (opts.mediaExists != null ? !!opts.mediaExists : undefined),
        abPairAvailable: !!(lib.abPairAvailable ?? opts.abPairAvailable),
        abVersionIdA: asString(lib.abVersionIdA || opts.abVersionIdA, 128).trim(),
        abVersionIdB: asString(lib.abVersionIdB || opts.abVersionIdB, 128).trim(),
    };
}

/**
 * Push media association changes to open editor windows (same mediaId).
 * @param {{ mediaId?: string, videoPath?: string, mediaLinked?: boolean, mediaExists?: boolean, mediaTitle?: string, cleared?: boolean }} payload
 */
function notifyEditorsLibraryMediaUpdated(payload = {}) {
    const mediaId = asString(payload?.mediaId, 128).trim();
    if (!mediaId) return 0;
    let n = 0;
    for (const win of editorWindows.values()) {
        if (!win || win.isDestroyed() || win.webContents.isDestroyed()) continue;
        const winMediaId = asString(win.__transubLibraryMediaId, 128).trim();
        // Prefer media-scoped delivery; unknown sessions still receive (safe no-op in renderer).
        if (winMediaId && winMediaId !== mediaId) continue;
        try {
            win.webContents.send('transub-library-media-updated', payload || {});
            n += 1;
        } catch { /* ignore */ }
    }
    return n;
}

function rememberEditorLibraryMedia(win, library) {
    if (!win || win.isDestroyed()) return;
    const mid = asString(library?.mediaId, 128).trim();
    if (mid) win.__transubLibraryMediaId = mid;
    else if (library === null) win.__transubLibraryMediaId = '';
}

function createSubtitleEditorWindow(app, opts = {}) {
    const { subPath, videoPath, action } = opts;
    const library = pickLibrarySession(opts);
    const rawSub = String(subPath || '').trim();
    const resolvedSub = rawSub ? path.resolve(rawSub) : '';
    const key = editorWindowKey(resolvedSub);
    const openAction = asString(action, 64).trim();
    const existing = editorWindows.get(key);
    if (existing && !existing.isDestroyed()) {
        existing.focus();
        if (resolvedSub) {
            maximizeEditorWindow(existing);
            rememberEditorLibraryMedia(existing, library);
            sendEditorInit(existing, {
                subPath: resolvedSub,
                videoPath: videoPath || guessVideoPathForSubtitle(resolvedSub) || '',
                ...(openAction ? { action: openAction } : {}),
                ...(library ? { library } : {}),
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
    const preferDark = getAppTheme() === 'dark';
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
        autoHideMenuBar: false,
        backgroundColor: EDITOR_BG[preferDark ? 'dark' : 'light'],
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

    attachUiZoom(win);
    win.__transubIsEditorWindow = true;
    // 仅显示自定义归类菜单；不使用 Electron 原生 File/Edit/View 等菜单
    // 初始勾选与编辑器默认偏好对齐，随后由渲染进程同步真实状态
    applySubtitleEditorMenu(win, {
        autoFocus: false,
        waveform: true,
        darkTheme: preferDark,
        timelineZoomed: false,
    });
    applyEditorWindowIcon(win);
    applyEditorWindowChrome(win, preferDark);

    const initPayload = resolvedSub
        ? {
            subPath: resolvedSub,
            videoPath: linkedVideo,
            ...(openAction ? { action: openAction } : {}),
            ...(library ? { library } : {}),
        }
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

    rememberEditorLibraryMedia(win, library);
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
        // Arm early: async dirty-check can finish after Windows already fired a
        // spurious minimize on the main window.
        armMainMinimizeSuppress();

        let dirty = false;
        try {
            dirty = await win.webContents.executeJavaScript(
                'Boolean(window.__transubEditorGetDirty?.())',
                true
            );
        } catch (_) {
            closingConfirmed = true;
            armMainMinimizeSuppress();
            win.close();
            return;
        }

        if (!dirty) {
            closingConfirmed = true;
            armMainMinimizeSuppress();
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
        armMainMinimizeSuppress();
        win.close();
    });

    win.on('closed', () => {
        unbindEditorWindow(win);
        armMainMinimizeSuppress(1600);
        restoreMainAfterEditorClosed();
        // Last editor gone: drop idle llama-server so homepage ASR does not OOM.
        // Skip when homepage engine/TWAI still holds the compute lock (may need LLM).
        if (!anyOtherEditorOpen()) {
            try {
                require('./local-llm-reclaim').reclaimLocalLlmWhenEditorsGone();
            } catch (_) { /* ignore */ }
        }
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
    const { resolveDialogDefaultPath, rememberOpenPath } = require('./last-open-dir');
    const { getWritableRoot } = require('./app-paths');
    const getAppRoot = () => getWritableRoot();
    const defaultPath = resolveDialogDefaultPath(getAppRoot);
    const result = await dialog.showOpenDialog(parentWindow || undefined, {
        title: '选择要编辑的字幕文件',
        properties: ['openFile'],
        filters: [
            { name: '字幕 (SRT / VTT / LRC / ASS)', extensions: ['srt', 'vtt', 'lrc', 'ass', 'ssa'] },
            { name: '所有文件', extensions: ['*'] },
        ],
        defaultPath: defaultPath || undefined,
    });
    refocusWindow(parentWindow);
    if (result.canceled || !result.filePaths?.length) {
        return { ok: true, canceled: true };
    }
    const subPath = path.resolve(result.filePaths[0]);
    rememberOpenPath(getAppRoot, subPath);
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
    linkWindowManager(windowManager);
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
            const action = asString(payload.action, 64).trim();
            const library = pickLibrarySession(payload);
            createSubtitleEditorWindow(app, {
                subPath,
                videoPath,
                ...(action ? { action } : {}),
                ...(library ? { library } : {}),
            });
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
            if (payload.maximize !== false) maximizeEditorWindow(win);
            return { ok: true, path: resolved };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-open-settings', async (event, payload = {}) => {
        try {
            warmBridges?.();
            const parentWin = BrowserWindow.fromWebContents(event.sender);
            // Wizard has its own window — do not piggyback on settings.
            if (payload?.wizard) {
                const { openSetupWizardWindow } = require('./setup-wizard-window');
                return openSetupWizardWindow(app, {
                    parent: parentWin || undefined,
                    forceWizard: payload?.forceWizard !== false,
                });
            }
            const { openSettingsWindow } = require('./settings-window');
            return openSettingsWindow(app, {
                tab: payload?.tab || 'runtime',
                parent: parentWin || undefined,
                checkUpdate: !!payload?.checkUpdate,
                openLibrary: !!payload?.openLibrary,
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-open-setup-wizard', async (event, payload = {}) => {
        try {
            warmBridges?.();
            const parentWin = BrowserWindow.fromWebContents(event.sender);
            const { openSetupWizardWindow } = require('./setup-wizard-window');
            return openSetupWizardWindow(app, {
                parent: parentWin || undefined,
                forceWizard: payload?.forceWizard !== false,
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-consume-pending-setup-wizard', async () => {
        try {
            const { consumePendingSetupWizardOpen } = require('./setup-wizard-window');
            return { ok: true, ...consumePendingSetupWizardOpen() };
        } catch (err) {
            return { ok: false, forceWizard: true, error: err?.message || String(err) };
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

    register('transub-open-subtitle-library', async (event, payload = {}) => {
        try {
            warmBridges?.();
            const { openSubtitleLibraryWindow } = require('./subtitle-library-window');
            return openSubtitleLibraryWindow(app, {
                mediaId: payload?.mediaId || '',
                mediaPath: payload?.mediaPath || '',
                versionId: payload?.versionId || '',
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-library-start-retranslate', async (_event, payload = {}) => {
        try {
            warmBridges?.();
            const { startLibraryRetranslateOnMain } = require('./subtitle-library-window');
            return startLibraryRetranslateOnMain({ windowManager }, payload || {});
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-library-start-mt-train', async (_event, payload = {}) => {
        try {
            warmBridges?.();
            const { canOpenMtTrain, openMtTrainWindow } = require('./mt-train-window');
            const access = canOpenMtTrain(app);
            if (!access.ok) {
                return {
                    ok: false,
                    error: access.error || '无法打开学习向导',
                    code: access.code,
                    proRequired: access.code === 'not_entitled',
                };
            }
            const { prepareLibraryMtTrainPair } = require('./subtitle-library');
            const mediaId = String(payload?.mediaId || '').trim();
            if (!mediaId) return { ok: false, error: '缺少作品 ID' };
            const prepared = prepareLibraryMtTrainPair(mediaId, {
                preferTag: payload?.preferTag || '',
            });
            if (!prepared.ok) return prepared;
            const opened = await openMtTrainWindow(app, {
                jaPath: prepared.jaPath,
                zhPath: prepared.zhPath,
                zhPathA: prepared.zhPathA,
                zhPathB: prepared.zhPathB,
                title: prepared.title,
                source: 'subtitle-library',
            });
            if (!opened.ok) return opened;
            return { ...opened, prepared };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-open-mt-train', async (_event, payload = {}) => {
        try {
            const { canOpenMtTrain, openMtTrainWindow } = require('./mt-train-window');
            const access = canOpenMtTrain(app);
            if (!access.ok) {
                return {
                    ok: false,
                    error: access.error || '无法打开学习向导',
                    code: access.code,
                    proRequired: access.code === 'not_entitled',
                };
            }
            warmBridges?.();
            return await openMtTrainWindow(app, payload || null);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-mt-train-access', async () => {
        try {
            const { canOpenMtTrain } = require('./mt-train-window');
            const access = canOpenMtTrain(app);
            return {
                ok: true,
                canOpen: !!access.ok,
                isDev: !!access.isDev,
                isPro: !!access.isPro,
                audience: access.audience || null,
                error: access.ok ? null : (access.error || null),
                code: access.code || null,
            };
        } catch (err) {
            return { ok: false, canOpen: false, error: err.message || String(err) };
        }
    });

    register('transub-is-dev-build', async () => ({
        ok: true,
        isDev: !app.isPackaged,
    }));

    register('transub-upload-subtitlecat', async (_event, payload = {}) => {
        try {
            const { uploadSubtitleToSubtitleCat } = require('./subtitlecat-upload');
            return await uploadSubtitleToSubtitleCat(payload || {}, app);
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
            const { consumePendingSettingsOpen, consumePendingSettingsTab } = require('./settings-window');
            const pending = typeof consumePendingSettingsOpen === 'function'
                ? consumePendingSettingsOpen()
                : { tab: consumePendingSettingsTab(), wizard: false, forceWizard: false };
            const tab = pending?.tab || pendingOpenParamsTab;
            pendingOpenParamsTab = null;
            return {
                ok: true,
                tab: tab || null,
                wizard: !!pending?.wizard,
                forceWizard: !!pending?.forceWizard,
                openLibrary: !!pending?.openLibrary,
            };
        } catch {
            const tab = pendingOpenParamsTab;
            pendingOpenParamsTab = null;
            return { ok: true, tab: tab || null, wizard: false, forceWizard: false, openLibrary: false };
        }
    });

    register('transub-editor-refocus', async (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        refocusWindow(win);
        return { ok: true };
    });

    register('transub-editor-sync-menu', async (event, payload = {}) => {
        try {
            const win = BrowserWindow.fromWebContents(event.sender);
            if (!win || win.isDestroyed()) return { ok: false, error: '窗口不存在' };
            const viewState = payload?.viewState || payload || {};
            applySubtitleEditorMenu(win, viewState);
            applyEditorWindowChrome(win, viewState.darkTheme === true);
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-editor-confirm', async (event, payload = {}) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        const message = asString(payload.message, 4000).trim() || '确定？';
        const detail = asString(payload.detail, 4000).trim();
        const title = asString(payload.title, 200).trim() || '确认';
        const okLabel = asString(payload.okLabel, 40).trim() || '确定';
        const cancelLabel = asString(payload.cancelLabel, 40).trim() || '取消';
        const rawButtons = Array.isArray(payload.buttons)
            ? payload.buttons.map((b) => asString(b, 40).trim()).filter(Boolean)
            : null;
        const buttons = (rawButtons && rawButtons.length >= 2)
            ? rawButtons.slice(0, 6)
            : [okLabel, cancelLabel];
        const cancelId = Number.isInteger(payload.cancelId)
            ? Math.max(0, Math.min(buttons.length - 1, payload.cancelId))
            : buttons.length - 1;
        const defaultId = Number.isInteger(payload.defaultId)
            ? Math.max(0, Math.min(buttons.length - 1, payload.defaultId))
            : 0;
        try {
            const { response } = await dialog.showMessageBox(win || undefined, {
                type: payload.type || 'question',
                buttons,
                defaultId,
                cancelId,
                noLink: true,
                title,
                message,
                detail: detail || undefined,
            });
            refocusWindow(win);
            const idx = Number(response);
            return {
                ok: true,
                confirmed: idx !== cancelId,
                response: idx,
                cancelled: idx === cancelId,
            };
        } catch (err) {
            refocusWindow(win);
            return { ok: false, confirmed: false, cancelled: true, error: err.message || String(err) };
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
    notifyEditorsLibraryMediaUpdated,
};
