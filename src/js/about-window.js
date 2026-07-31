/**
 * About Transub window renderer.
 */
(function () {
    const electron = window.__ELECTRON__;
    const PROJECT_HOME_URL = 'https://github.com/dlsandy/Transub';
    const AFDIAN_PURCHASE_URL = 'https://afdian.com/a/transub';

    async function fillVersion() {
        const el = document.getElementById('aboutVersion');
        if (!el) return;
        let ver = '';
        try {
            const res = await electron?.getAppVersion?.();
            ver = String(res?.version || '').trim().replace(/^v/i, '');
        } catch (_) { /* ignore */ }
        el.textContent = ver ? `版本 ${ver}` : '版本 —';
    }

    async function fillAdvancedStatus() {
        const el = document.getElementById('aboutAdvancedStatus');
        if (!el) return;
        try {
            const res = await electron?.transubAdvancedGetStatus?.();
            if (!res?.ok) {
                el.textContent = 'Pro：未检测';
                return;
            }
            const s = res.status || {};
            if (s.entitled) {
                el.textContent = s.devUnlock
                    ? 'Pro：已解锁（开发）'
                    : 'Pro：已解锁';
            } else {
                el.textContent = 'Pro：未解锁（设置 → Pro 购买/激活）';
            }
        } catch (_) {
            el.textContent = 'Pro：—';
        }
    }

    async function openUrl(url) {
        try {
            await electron?.openExternal?.(url);
        } catch (_) { /* ignore */ }
    }

    function bind() {
        document.getElementById('aboutGithubBtn')?.addEventListener('click', () => {
            void openUrl(PROJECT_HOME_URL);
        });
        document.getElementById('aboutAfdianBtn')?.addEventListener('click', () => {
            void openUrl(AFDIAN_PURCHASE_URL);
        });
    }

    void fillVersion();
    void fillAdvancedStatus();
    bind();
}());
