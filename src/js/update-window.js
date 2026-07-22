(function () {
    'use strict';

    const electron = globalThis.__ELECTRON__;

    const statusEl = () => document.getElementById('updateStatus');
    const metaEl = () => document.getElementById('updateMeta');
    const progressHost = () => document.getElementById('updateDownloadProgress');

    /** @type {{ latestVersion?: string, downloadUrl?: string, releasesUrl?: string, canAutoInstall?: boolean } | null} */
    let lastCheck = null;
    let busy = false;
    /** @type {(() => void) | null} */
    let unsubProgress = null;

    function setStatus(text, kind = '') {
        const el = statusEl();
        if (!el) return;
        el.textContent = text || '';
        el.classList.remove('is-ok', 'is-err', 'is-info');
        if (kind) el.classList.add(`is-${kind}`);
    }

    function setMeta(text) {
        const el = metaEl();
        if (el) el.textContent = text || '';
    }

    function showEl(id, visible) {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.toggle('hidden', !visible);
    }

    function setBusy(next) {
        busy = !!next;
        const checkBtn = document.getElementById('checkAgainBtn');
        if (checkBtn) checkBtn.disabled = busy;
        const downloadBtn = document.getElementById('downloadBtn');
        if (downloadBtn && !downloadBtn.classList.contains('hidden')) {
            downloadBtn.disabled = busy;
        }
        const openBtn = document.getElementById('openReleasesBtn');
        if (openBtn && !openBtn.classList.contains('hidden')) {
            openBtn.disabled = busy;
        }
        const installBtn = document.getElementById('installBtn');
        if (installBtn && !installBtn.classList.contains('hidden')) {
            installBtn.disabled = busy;
        }
    }

    function resetActionButtons() {
        showEl('downloadBtn', false);
        showEl('openReleasesBtn', false);
        showEl('installBtn', false);
        const downloadBtn = document.getElementById('downloadBtn');
        const openBtn = document.getElementById('openReleasesBtn');
        const installBtn = document.getElementById('installBtn');
        if (downloadBtn) downloadBtn.disabled = true;
        if (openBtn) openBtn.disabled = true;
        if (installBtn) installBtn.disabled = true;
    }

    function formatDownloadBytes(bytes) {
        const n = Number(bytes);
        if (!Number.isFinite(n) || n < 0) return '';
        if (n < 1024) return `${Math.round(n)} B`;
        if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
        if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
        return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }

    function setProgressVisible(visible) {
        const host = progressHost();
        if (!host) return;
        host.classList.toggle('is-visible', !!visible);
        if (!visible) {
            const bar = document.getElementById('updateDownloadBar');
            const pctEl = document.getElementById('updateDownloadPercent');
            const detail = document.getElementById('updateDownloadDetail');
            if (bar) bar.style.width = '0%';
            if (pctEl) pctEl.textContent = '0%';
            if (detail) detail.textContent = '';
        }
    }

    function renderProgress(progress = {}, version = '') {
        const host = progressHost();
        if (!host) return;
        host.classList.add('is-visible');
        const percent = Math.max(0, Math.min(100, Number(progress.percent) || 0));
        const transferred = Number(progress.transferred) || 0;
        const total = Number(progress.total) || 0;
        const speed = Number(progress.bytesPerSecond) || 0;
        const label = document.getElementById('updateDownloadLabel');
        const pctEl = document.getElementById('updateDownloadPercent');
        const bar = document.getElementById('updateDownloadBar');
        const detail = document.getElementById('updateDownloadDetail');
        if (label) {
            label.textContent = version
                ? `正在下载 v${version}…`
                : '正在下载更新…';
        }
        if (pctEl) pctEl.textContent = `${Math.round(percent)}%`;
        if (bar) bar.style.width = `${percent}%`;
        if (detail) {
            const parts = [];
            const done = formatDownloadBytes(transferred);
            const all = formatDownloadBytes(total);
            if (done && all) parts.push(`${done} / ${all}`);
            else if (done) parts.push(done);
            const rate = formatDownloadBytes(speed);
            if (rate) parts.push(`${rate}/s`);
            detail.textContent = parts.join(' · ');
        }
    }

    async function loadCurrentVersion() {
        const label = document.getElementById('currentVersionLabel');
        try {
            const res = await electron?.getAppVersion?.();
            const v = res?.version ? String(res.version).replace(/^v/i, '') : '';
            if (label) {
                label.textContent = v ? `当前版本 v${v}` : '当前版本未知';
            }
        } catch {
            if (label) label.textContent = '当前版本未知';
        }
    }

    function presentCheckResult(res) {
        lastCheck = res || null;
        resetActionButtons();
        setProgressVisible(false);

        if (!res?.ok) {
            setStatus(res?.error || '检查更新失败', 'err');
            setMeta('');
            return;
        }

        setMeta(res.message || '');
        if (!res.updateAvailable) {
            setStatus(res.message || `已是最新版本 v${res.currentVersion}`, 'ok');
            return;
        }

        setStatus(`发现新版本 v${res.latestVersion}`, 'info');
        if (res.canAutoInstall && electron?.transubDownloadAppUpdate) {
            showEl('downloadBtn', true);
            const btn = document.getElementById('downloadBtn');
            if (btn) btn.disabled = false;
            setMeta('可在本窗口下载并在重启后安装（NSIS 安装版）。');
        } else {
            showEl('openReleasesBtn', true);
            const btn = document.getElementById('openReleasesBtn');
            if (btn) btn.disabled = false;
            setMeta('请从 GitHub Releases 手动下载对应版本。');
        }
    }

    async function runCheck() {
        if (busy) return;
        setBusy(true);
        resetActionButtons();
        setProgressVisible(false);
        setStatus('正在检查更新…');
        setMeta('');
        try {
            if (!electron?.transWithAiCheckAppUpdate) {
                presentCheckResult({ ok: false, error: '当前环境不支持检查更新' });
                return;
            }
            const res = await electron.transWithAiCheckAppUpdate();
            presentCheckResult(res);
        } catch (err) {
            presentCheckResult({ ok: false, error: err?.message || '检查更新失败' });
        } finally {
            setBusy(false);
        }
    }

    async function runDownload() {
        if (busy || !lastCheck?.canAutoInstall) return;
        setBusy(true);
        showEl('downloadBtn', false);
        showEl('installBtn', false);
        setStatus(`正在下载 v${lastCheck.latestVersion}…`, 'info');
        renderProgress({ percent: 0 }, lastCheck.latestVersion);
        try {
            unsubProgress?.();
            unsubProgress = electron.onAppUpdateDownloadProgress?.((progress) => {
                renderProgress(progress, lastCheck.latestVersion);
            }) || null;

            const dl = await electron.transubDownloadAppUpdate();
            if (!dl?.ok) {
                setProgressVisible(false);
                setStatus(dl?.error || '下载失败', 'err');
                showEl('openReleasesBtn', true);
                showEl('downloadBtn', true);
                const openBtn = document.getElementById('openReleasesBtn');
                const downloadBtn = document.getElementById('downloadBtn');
                if (openBtn) openBtn.disabled = false;
                if (downloadBtn) downloadBtn.disabled = false;
                setMeta('应用内下载失败，可改从 GitHub Releases 手动下载。');
                return;
            }

            renderProgress({ percent: 100 }, lastCheck.latestVersion);
            const label = document.getElementById('updateDownloadLabel');
            const detail = document.getElementById('updateDownloadDetail');
            if (label) label.textContent = `v${lastCheck.latestVersion} 已下载完成`;
            if (detail) detail.textContent = '可立即重启安装';
            setStatus(dl.message || '更新已下载，可重启安装', 'ok');
            setMeta('');
            showEl('installBtn', true);
            const installBtn = document.getElementById('installBtn');
            if (installBtn) installBtn.disabled = false;
        } catch (err) {
            setProgressVisible(false);
            setStatus(err?.message || '下载失败', 'err');
            showEl('downloadBtn', true);
            const downloadBtn = document.getElementById('downloadBtn');
            if (downloadBtn) downloadBtn.disabled = false;
        } finally {
            try { unsubProgress?.(); } catch { /* ignore */ }
            unsubProgress = null;
            setBusy(false);
        }
    }

    async function runOpenReleases() {
        const url = lastCheck?.downloadUrl || lastCheck?.releasesUrl;
        try {
            await electron?.transubOpenUpdatePage?.({ url });
            setStatus('已在浏览器中打开下载页', 'ok');
        } catch (err) {
            setStatus(err?.message || '打开下载页失败', 'err');
        }
    }

    async function runInstall() {
        if (busy) return;
        setBusy(true);
        setStatus('正在退出并安装更新…', 'info');
        try {
            const res = await electron?.transubQuitAndInstallUpdate?.();
            if (res && res.ok === false) {
                setStatus(res.error || '安装失败', 'err');
                setBusy(false);
            }
        } catch (err) {
            setStatus(err?.message || '安装失败', 'err');
            setBusy(false);
        }
    }

    function bind() {
        document.getElementById('checkAgainBtn')?.addEventListener('click', () => {
            void runCheck();
        });
        document.getElementById('downloadBtn')?.addEventListener('click', () => {
            void runDownload();
        });
        document.getElementById('openReleasesBtn')?.addEventListener('click', () => {
            void runOpenReleases();
        });
        document.getElementById('installBtn')?.addEventListener('click', () => {
            void runInstall();
        });
        document.getElementById('closeBtn')?.addEventListener('click', () => {
            try { globalThis.close(); } catch { /* ignore */ }
        });

        electron?.onUpdateWindowCheck?.(() => {
            void runCheck();
        });
    }

    async function init() {
        bind();
        await loadCurrentVersion();
        const params = new URLSearchParams(globalThis.location?.search || '');
        // Prefer IPC nudge from main; fall back if it was missed during slow load.
        if (params.get('autoCheck') === '1') {
            setTimeout(() => {
                if (!busy && !lastCheck) void runCheck();
            }, 800);
        } else {
            setStatus('点击「重新检查」开始检查更新。');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { void init(); });
    } else {
        void init();
    }
}());
