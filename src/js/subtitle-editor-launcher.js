/**
 * 主窗口：打开独立字幕编辑窗口
 */
(function (global) {
    const electron = global.__ELECTRON__;
    const core = () => global.TransubCore;

    async function openEditor(subPath, videoPath) {
        if (!subPath) return false;
        try {
            const res = await electron?.transubOpenSubtitleEditor?.({
                subPath,
                videoPath: videoPath || '',
            });
            if (res?.ok === false) {
                core()?.appendLog(res?.error || '无法打开字幕编辑器', 'err');
                return false;
            }
            return true;
        } catch (err) {
            core()?.appendLog(err?.message || String(err), 'err');
            return false;
        }
    }

    /** 打开字幕编辑器启动页（欢迎窗口） */
    async function openWelcome() {
        try {
            const res = await electron?.transubOpenSubtitleEditor?.({ welcome: true });
            if (res?.ok === false) {
                core()?.appendLog(res?.error || '无法打开字幕编辑器', 'err');
                return false;
            }
            return true;
        } catch (err) {
            core()?.appendLog(err?.message || String(err), 'err');
            return false;
        }
    }

    async function pickAndOpen() {
        try {
            const pick = await electron?.transubSelectSubtitle?.({ title: '选择要编辑的字幕文件' });
            if (!pick?.ok) {
                core()?.appendLog(pick?.error || '无法打开文件选择框', 'err');
                return false;
            }
            if (pick.canceled || !pick.path) return true;
            return openEditor(pick.path, pick.videoPath || '');
        } catch (err) {
            core()?.appendLog(err?.message || String(err), 'err');
            return false;
        }
    }

    global.TransubSubtitleEditor = { openEditor, openWelcome, pickAndOpen };
}(window));
