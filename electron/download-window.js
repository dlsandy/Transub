/**
 * 下载进度广播（无独立下载管理窗口）
 *
 * 各 bridge 负责实际下载；本模块仅向所有 BrowserWindow 推送进度事件。
 */
const { BrowserWindow } = require('electron');

/**
 * @param {string} channel
 * @param {object} info
 */
function broadcastProgress(channel, info) {
    try {
        for (const win of BrowserWindow.getAllWindows()) {
            try {
                win.webContents.send(channel, info);
            } catch (_) { /* ignore */ }
        }
    } catch (_) { /* ignore */ }
}

function broadcastEngineDownloadProgress(info) {
    broadcastProgress('transub-engine-download-progress', info);
}

function broadcastManagedLlmProgress(info) {
    broadcastProgress('transub-advanced-managed-llm-progress', info);
}

function broadcastAppUpdateProgress(info) {
    broadcastProgress('transub-app-update-progress', info);
}

/** @deprecated 下载管理窗口已移除 */
function openDownloadWindow() {
    return { ok: true, removed: true };
}

/** @deprecated */
function openEngineDownloadWindow(_app, options = {}) {
    return { ok: true, removed: true, ...options };
}

/** @deprecated */
function openAdvancedLlmDownloadWindow(_app, options = {}) {
    return { ok: true, removed: true, ...options };
}

/** @deprecated */
function openDownloadHub() {
    return { ok: true, removed: true };
}

function getDownloadWindow() {
    return null;
}

function getEngineDownloadWindow() {
    return null;
}

function sendToDownloadWindow() {
    return false;
}

function sendToEngineDownloadWindow() {
    return false;
}

function getLastDownloadSession() {
    return null;
}

function getLastEngineDownloadSession() {
    return null;
}

function focusDownloadWindow() {
    return null;
}

function setupDownloadHubIpc() {
    // no-op：下载管理窗口已移除
}

function setDownloadTrayTipHandler() {
    // no-op
}

module.exports = {
    openDownloadWindow,
    openEngineDownloadWindow,
    openAdvancedLlmDownloadWindow,
    openDownloadHub,
    getDownloadWindow,
    getEngineDownloadWindow,
    sendToDownloadWindow,
    sendToEngineDownloadWindow,
    broadcastEngineDownloadProgress,
    broadcastManagedLlmProgress,
    broadcastAppUpdateProgress,
    getLastDownloadSession,
    getLastEngineDownloadSession,
    focusDownloadWindow,
    setupDownloadHubIpc,
    setDownloadTrayTipHandler,
    buildDownloadTrayTip: () => '',
    applyAppUpdateProgress: () => {},
    upsertSession: () => null,
    patchTask: () => null,
};
