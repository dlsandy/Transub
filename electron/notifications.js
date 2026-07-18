const { Notification } = require('electron');

/** 系统托盘/桌面通知；默认关闭，由设置 trayNotifyEnabled 控制 */
let trayNotifyEnabled = false;

function setTrayNotifyEnabled(enabled) {
    trayNotifyEnabled = !!enabled;
}

function isTrayNotifyEnabled() {
    return trayNotifyEnabled;
}

function sendNotification(body) {
    if (!trayNotifyEnabled) return false;
    if (!Notification.isSupported()) return false;
    const text = String(body || '').trim();
    if (!text) return false;
    try {
        const n = new Notification({
            title: '',
            body: text,
        });
        n.show();
        return true;
    } catch {
        return false;
    }
}

function notifySubtitleComplete(summary) {
    sendNotification(summary ? `字幕生成完成 · ${summary}` : '字幕生成完成');
}

module.exports = {
    sendNotification,
    notifySubtitleComplete,
    setTrayNotifyEnabled,
    isTrayNotifyEnabled,
};
