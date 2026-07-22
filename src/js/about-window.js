/**
 * About Transub window renderer.
 */
(function () {
    const electron = window.__ELECTRON__;
    const PROJECT_HOME_URL = 'https://github.com/dlsandy/Transub';
    const ENGINE_URL = 'https://github.com/TransWithAI/Faster-Whisper-TransWithAI-ChickenRice';

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

    async function openUrl(url) {
        try {
            await electron?.openExternal?.(url);
        } catch (_) { /* ignore */ }
    }

    function bind() {
        document.getElementById('aboutGithubBtn')?.addEventListener('click', () => {
            void openUrl(PROJECT_HOME_URL);
        });
        document.getElementById('aboutEngineBtn')?.addEventListener('click', () => {
            void openUrl(ENGINE_URL);
        });
        document.getElementById('aboutCloseBtn')?.addEventListener('click', () => {
            window.close();
        });
    }

    void fillVersion();
    bind();
}());
