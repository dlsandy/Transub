/**
 * Advanced 软件内模型广播（独立选模窗口已并入设置页「大模型设置」）
 */

/**
 * 通知设置等窗口：活动模型已变更。
 * @param {object} [payload]
 */
function broadcastManagedModelChanged(payload = {}) {
    try {
        const { BrowserWindow: BW } = require('electron');
        for (const win of BW.getAllWindows()) {
            try {
                win.webContents.send('transub-advanced-llm-model-changed', payload);
            } catch (_) { /* ignore */ }
        }
    } catch (_) { /* ignore */ }
}

/** @deprecated 独立窗口已移除；保留空实现以免旧调用方崩溃 */
function openAdvancedLlmPickWindow() {
    return { ok: true, removed: true, message: '请在设置 → Pro → 大模型设置内选用模型' };
}

function getPickWindow() {
    return null;
}

function sendToPickWindow() {
    return false;
}

function focusPickWindow() {
    return null;
}

module.exports = {
    openAdvancedLlmPickWindow,
    getPickWindow,
    sendToPickWindow,
    focusPickWindow,
    broadcastManagedModelChanged,
};
