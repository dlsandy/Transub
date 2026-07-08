const { Notification } = require('electron');

function sendNotification(body) {
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
};
