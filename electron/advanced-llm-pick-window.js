/**
 * Advanced 软件内模型变更广播（独立选模窗口已并入设置页「智能翻译模型」）
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

module.exports = {
    broadcastManagedModelChanged,
};
