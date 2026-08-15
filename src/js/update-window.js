(function () {
    'use strict';

    const electron = globalThis.__ELECTRON__;

    const statusEl = () => document.getElementById('updateStatus');
    const metaEl = () => document.getElementById('updateMeta');
    const progressHost = () => document.getElementById('updateDownloadProgress');

    /** @type {{ latestVersion?: string, downloadUrl?: string, releasesUrl?: string, canAutoInstall?: boolean, installKind?: string, preservesEngineData?: boolean, releaseNotes?: string } | null} */
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

    function formatFailureMeta(fail = {}) {
        const parts = [];
        if (fail.code) parts.push(`原因码 ${fail.code}`);
        if (fail.preferredSource) parts.push(`线路 ${fail.preferredSource}`);
        if (Array.isArray(fail.triedSources) && fail.triedSources.length) {
            parts.push(`已试 ${fail.triedSources.join('/')}`);
        }
        if (fail.expectedSha || fail.gotSha) {
            parts.push(`校验 expect=${fail.expectedSha || '?'} got=${fail.gotSha || '?'}`);
        }
        if (fail.githubError) parts.push(`GitHub: ${String(fail.githubError).slice(0, 80)}`);
        if (fail.codebergError) parts.push(`Codeberg: ${String(fail.codebergError).slice(0, 80)}`);
        const tipByCode = {
            checksum: '校验失败：换线路重试，或从发布页手动下载同版本 zip',
            extract: '解压失败：确认磁盘空间充足且安装目录可写',
            probe: '清单探测失败：检查网络，或稍后再试 GitHub / Codeberg / 官网',
            download: '下载失败：可改用其它镜像，或从发布页手动下载',
            cancelled: '已取消',
        };
        parts.push(tipByCode[String(fail.code || '')]
            || '可改从 GitHub / Codeberg / 官网 Releases 手动下载');
        return parts.join(' · ');
    }

    function setChangelog(notes, { force = false } = {}) {
        const host = document.getElementById('updateChangelog');
        const body = document.getElementById('updateChangelogBody');
        if (!host || !body) return;
        const text = String(notes || '').trim();
        if (!text && !force) {
            host.classList.remove('is-visible');
            body.textContent = '';
            return;
        }
        body.textContent = text || '暂无更新说明';
        host.classList.add('is-visible');
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
        const phase = String(progress.phase || '').trim();
        const message = String(progress.message || '').trim();
        const label = document.getElementById('updateDownloadLabel');
        const pctEl = document.getElementById('updateDownloadPercent');
        const bar = document.getElementById('updateDownloadBar');
        const detail = document.getElementById('updateDownloadDetail');
        if (label) {
            if (message) {
                label.textContent = message;
            } else if (phase === 'probe') {
                label.textContent = '正在测速 GitHub / Codeberg / 官网…';
            } else if (phase === 'extracting') {
                label.textContent = version ? `正在解压 v${version}…` : '正在解压更新包…';
            } else if (phase === 'preparing' || phase === 'ready') {
                label.textContent = message || (version ? `正在准备 v${version}…` : '正在准备安装…');
            } else {
                label.textContent = version
                    ? `正在下载 v${version}…`
                    : '正在下载更新…';
            }
        }
        if (pctEl) pctEl.textContent = `${Math.round(percent)}%`;
        if (bar) bar.style.width = `${percent}%`;
        if (detail) {
            if (
                phase === 'probe'
                || phase === 'retry'
                || phase === 'extracting'
                || phase === 'preparing'
                || phase === 'ready'
                || phase === 'installing'
            ) {
                detail.textContent = message
                    || (phase === 'probe'
                        ? '比较 GitHub、Codeberg 与官网速度，自动选择较快线路'
                        : '请稍候，此阶段可能需要一段时间…');
            } else {
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
            setMeta(formatFailureMeta(res || {}));
            setChangelog('');
            showEl('openReleasesBtn', true);
            const openBtn = document.getElementById('openReleasesBtn');
            if (openBtn) openBtn.disabled = false;
            return;
        }

        setMeta(res.message || '');
        if (!res.updateAvailable) {
            setStatus(res.message || `已是最新版本 v${res.currentVersion}`, 'ok');
            setChangelog('');
            return;
        }

        setStatus(`发现新版本 v${res.latestVersion}`, 'info');
        setChangelog(res.releaseNotes, { force: true });
        const sources = Array.isArray(res.updateSources) ? res.updateSources.filter(Boolean) : [];
        const sourceHint = sources.length
            ? `可用更新源：${sources.join(' / ')}。`
            : '';
        if (res.canAutoInstall && electron?.transubDownloadAppUpdate) {
            showEl('downloadBtn', true);
            const btn = document.getElementById('downloadBtn');
            if (btn) btn.disabled = false;
            if (res.preservesEngineData || res.installKind === 'zip') {
                const incr = res.incrementalLikely
                    ? '检测到本地基线，将按区块摘要增量更新。'
                    : '将按需下载全量或增量包。';
                setMeta(`${sourceHint}${incr}下载前会测速并自动选择较快线路。已下载的模型、GPU/Demucs 支持库与 Advanced LLM 会保留。`);
            } else {
                setMeta(`${sourceHint}请从发布页手动下载 zip 解压版（Setup/NSIS 已停更）。`);
            }
        } else {
            showEl('openReleasesBtn', true);
            const btn = document.getElementById('openReleasesBtn');
            if (btn) btn.disabled = false;
            setMeta(`${sourceHint}请从发布页手动下载对应版本。`);
        }
    }

    async function runCheck() {
        if (busy) return;
        setBusy(true);
        resetActionButtons();
        setProgressVisible(false);
        setStatus('正在检查更新…');
        setMeta('');
        setChangelog('');
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

            const dl = await electron.transubDownloadAppUpdate({
                version: lastCheck.latestVersion,
            });
            if (!dl?.ok) {
                setProgressVisible(false);
                setStatus(dl?.error || '下载失败', 'err');
                showEl('openReleasesBtn', true);
                showEl('downloadBtn', true);
                const openBtn = document.getElementById('openReleasesBtn');
                const downloadBtn = document.getElementById('downloadBtn');
                if (openBtn) openBtn.disabled = false;
                if (downloadBtn) downloadBtn.disabled = false;
                setMeta(formatFailureMeta(dl || {}));
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
        setStatus('正在启动升级程序…', 'info');
        setMeta('主窗口即将关闭。请留意随后出现的「正在升级」进度窗口，文件替换期间请勿强制结束进程。');
        renderProgress({
            percent: 2,
            phase: 'installing',
            message: '正在启动升级程序，请稍候…',
        }, lastCheck?.latestVersion || '');
        showEl('installBtn', false);
        try {
            const res = await electron?.transubQuitAndInstallUpdate?.();
            if (res && res.ok === false) {
                setProgressVisible(false);
                setStatus(res.error || '安装失败', 'err');
                setMeta('');
                showEl('installBtn', true);
                const installBtn = document.getElementById('installBtn');
                if (installBtn) installBtn.disabled = false;
                setBusy(false);
                return;
            }
            if (res?.mode === 'nsis') {
                setStatus('即将打开安装程序，请按向导完成升级…', 'info');
                setMeta('安装程序启动后本窗口会关闭。');
            } else {
                setStatus('升级程序已启动，主程序即将退出…', 'info');
            }
        } catch (err) {
            setProgressVisible(false);
            setStatus(err?.message || '安装失败', 'err');
            setMeta('');
            showEl('installBtn', true);
            const installBtn = document.getElementById('installBtn');
            if (installBtn) installBtn.disabled = false;
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
