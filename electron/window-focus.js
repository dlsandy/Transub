/**
 * 原生对话框关闭后，将 OS 焦点还给 BrowserWindow 并通知渲染进程恢复输入焦点。
 */
function refocusWindow(win) {
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    const wc = win.webContents;
    if (wc && !wc.isDestroyed()) {
        wc.send('subtitle-editor-refocus');
    }
}

module.exports = { refocusWindow };
