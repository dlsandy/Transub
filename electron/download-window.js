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

module.exports = {
    broadcastEngineDownloadProgress,
    broadcastManagedLlmProgress,
    broadcastAppUpdateProgress,
};
