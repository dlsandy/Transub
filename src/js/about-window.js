/**
 * About Transub window renderer.
 */
(function () {
    const electron = window.__ELECTRON__;
    const OFFICIAL_SITE_URL = 'https://www.transub.cc/';
    const GITHUB_RELEASES_URL = 'https://github.com/dlsandy/Transub/releases';
    const CODEBERG_RELEASES_URL = 'https://codeberg.org/flyforyou/Transub/releases';
    const AFDIAN_PURCHASE_URL = 'https://afdian.com/item/41fef1a28bf211f189e252540025c377';

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

    function setAfdianVisible(visible) {
        const btn = document.getElementById('aboutAfdianBtn');
        if (!btn) return;
        btn.hidden = !visible;
    }

    async function fillAdvancedStatus() {
        const el = document.getElementById('aboutAdvancedStatus');
        if (!el) return;
        try {
            const res = await electron?.transubAdvancedGetStatus?.();
            if (!res?.ok) {
                el.textContent = 'Pro：未检测';
                setAfdianVisible(true);
                return;
            }
            const s = res.status || {};
            if (s.entitled) {
                el.textContent = s.devUnlock
                    ? 'Pro：已解锁（开发）'
                    : 'Pro：已解锁';
                setAfdianVisible(false);
            } else {
                el.textContent = 'Pro：未解锁（设置 → Pro 购买/激活）';
                setAfdianVisible(true);
            }
        } catch (_) {
            el.textContent = 'Pro：—';
            setAfdianVisible(true);
        }
    }

    async function openUrl(url) {
        try {
            await electron?.openExternal?.(url);
        } catch (_) { /* ignore */ }
    }

    function bind() {
        document.getElementById('aboutWebsiteBtn')?.addEventListener('click', () => {
            void openUrl(OFFICIAL_SITE_URL);
        });
        document.getElementById('aboutGithubBtn')?.addEventListener('click', () => {
            void openUrl(GITHUB_RELEASES_URL);
        });
        document.getElementById('aboutCodebergBtn')?.addEventListener('click', () => {
            void openUrl(CODEBERG_RELEASES_URL);
        });
        document.getElementById('aboutAfdianBtn')?.addEventListener('click', () => {
            void openUrl(AFDIAN_PURCHASE_URL);
        });
    }

    void fillVersion();
    void fillAdvancedStatus();
    bind();
}());
