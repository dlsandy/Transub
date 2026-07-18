/**
 * 原生对话框 / window.confirm 关闭后，将 OS 焦点还给 BrowserWindow，
 * 并通知渲染进程恢复输入焦点（Windows + Electron 常见失焦）。
 */
function refocusWindow(win, options = {}) {
    if (!win || win.isDestroyed()) return;
    const { notifyRenderer = true, retries = true } = options;

    const apply = () => {
        if (!win || win.isDestroyed()) return;
        try {
            if (win.isMinimized()) win.restore();
        } catch (_) { /* ignore */ }

        // Windows: blur→focus 可打断「假焦点」状态（窗口看似前台但无法输入）
        if (process.platform === 'win32') {
            try { win.blur(); } catch (_) { /* ignore */ }
        }

        try {
            win.show();
            win.focus();
            if (typeof win.moveTop === 'function') win.moveTop();
        } catch (_) { /* ignore */ }

        const wc = win.webContents;
        if (wc && !wc.isDestroyed()) {
            try { wc.focus(); } catch (_) { /* ignore */ }
            if (notifyRenderer) {
                try { wc.send('subtitle-editor-refocus'); } catch (_) { /* ignore */ }
            }
        }
    };

    apply();
    if (!retries) return;

    setTimeout(apply, 40);
    setTimeout(apply, 120);
    setTimeout(apply, 280);
}

module.exports = { refocusWindow };
