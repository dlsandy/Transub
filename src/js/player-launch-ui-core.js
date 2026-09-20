/**
 * Dock: open Transub Player app (no media handoff). If not installed, intro + download.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubPlayerLaunchUi = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function playerLaunchUiFactory(global) {
    const PLAYER_DOWNLOAD_URL = 'https://www.transub.cc/en/#download';

    const INTRO_MESSAGE = [
        'Transub Player 是面向外语片的字幕播放器：打开影片即可观看，可读字幕会随后跟上（实时识别 / 翻译，可随时用 1 / 2 / 3 切换译文、原文、双语）。',
        '',
        '当前本机未检测到已安装的 Transub Player。是否打开下载页？',
    ].join('\n');

    /**
     * @param {object} deps
     * @param {object} [deps.electron]
     * @param {(opts: object) => Promise<boolean|string>} [deps.appConfirm]
     * @param {(msg: string, tone?: string) => void} [deps.showToast]
     * @param {(s: string, vars?: object) => string} [deps.uiTf]
     */
    function createPlayerLaunchUi(deps) {
        const d = deps || {};
        const electron = d.electron;
        const appConfirm = d.appConfirm || (async () => false);
        const showToast = d.showToast || (() => {});
        const uiTf = d.uiTf || ((s) => s);

        async function promptInstallAndMaybeDownload(result) {
            const downloadUrl = String(result?.downloadUrl || PLAYER_DOWNLOAD_URL).trim() || PLAYER_DOWNLOAD_URL;
            const ok = await appConfirm({
                title: uiTf('Transub Player'),
                message: uiTf(INTRO_MESSAGE),
                primaryLabel: uiTf('打开下载页'),
                secondaryLabel: uiTf('稍后再说'),
            });
            if (!ok) return { ok: false, cancelled: true, reason: 'not_installed' };
            try {
                const opened = await electron?.openExternal?.(downloadUrl);
                if (opened?.ok === false) {
                    showToast(opened.error || uiTf('无法打开下载页'), 'err');
                    return { ok: false, error: opened.error || 'open_failed', reason: 'not_installed' };
                }
                return { ok: true, openedDownload: true, downloadUrl };
            } catch (err) {
                const msg = err?.message || uiTf('无法打开下载页');
                showToast(msg, 'err');
                return { ok: false, error: msg, reason: 'not_installed' };
            }
        }

        async function openPlayerApp() {
            if (!electron?.transubOpenPlayer) {
                showToast(uiTf('需在桌面版中使用'), 'err');
                return { ok: false, error: 'no_ipc' };
            }
            let result;
            try {
                result = await electron.transubOpenPlayer({});
            } catch (err) {
                const msg = err?.message || uiTf('无法打开 Transub Player');
                showToast(msg, 'err');
                return { ok: false, error: msg };
            }
            if (result?.ok) return result;
            if (result?.reason === 'not_installed' || /未找到/.test(String(result?.error || ''))) {
                return promptInstallAndMaybeDownload(result);
            }
            showToast(result?.error || uiTf('无法打开 Transub Player'), 'err');
            return result || { ok: false, error: 'launch_failed' };
        }

        return {
            openPlayerApp,
            PLAYER_DOWNLOAD_URL,
            INTRO_MESSAGE,
        };
    }

    return { createPlayerLaunchUi, PLAYER_DOWNLOAD_URL };
}));
