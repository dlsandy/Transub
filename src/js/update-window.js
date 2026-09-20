(function () {
    'use strict';

    function uiTf(template, vars) {
        const api = globalThis.TransubI18n;
        if (api?.tf) return api.tf(template, vars);
        return String(template || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (_, name) => (
            vars && Object.prototype.hasOwnProperty.call(vars, name) && vars[name] != null
                ? String(vars[name])
                : `{${name}}`
        ));
    }

    const electron = globalThis.__ELECTRON__;
    const UPDATE_SOURCE_STORAGE_KEY = 'transub-app-update-source';
    const UPDATE_SOURCES = ['auto', 'gitcode', 'github'];

    /** @type {{ latestVersion?: string, downloadUrl?: string, releasesUrl?: string, canAutoInstall?: boolean, installKind?: string, preservesEngineData?: boolean, releaseNotes?: string, currentVersion?: string, serverVersion?: string } | null} */
    let lastAppCheck = null;
    /** @type {{ updateAvailable?: boolean, remote?: { version?: string, notes?: string }, local?: { installedVersion?: string, entitled?: boolean, applied?: boolean } } | null} */
    let lastTdpCheck = null;

    let appBusy = false;
    let tdpBusy = false;
    /** @type {(() => void) | null} */
    let unsubAppProgress = null;
    /** @type {(() => void) | null} */
    let unsubTdpProgress = null;

    function $(id) {
        return document.getElementById(id);
    }

    function formatVersion(v) {
        const s = String(v || '').trim().replace(/^v/i, '');
        return s ? `v${s}` : '—';
    }

    function getUpdateSource() {
        try {
            const raw = String(localStorage.getItem(UPDATE_SOURCE_STORAGE_KEY) || '').trim().toLowerCase();
            if (raw === 'codeberg') return 'auto';
            if (UPDATE_SOURCES.includes(raw)) return raw;
        } catch { /* ignore */ }
        return 'auto';
    }

    function setUpdateSource(source) {
        const next = UPDATE_SOURCES.includes(source) ? source : 'auto';
        try { localStorage.setItem(UPDATE_SOURCE_STORAGE_KEY, next); } catch { /* ignore */ }
        document.querySelectorAll('[data-update-source]').forEach((btn) => {
            const el = /** @type {HTMLButtonElement} */ (btn);
            el.classList.toggle('is-active', el.dataset.updateSource === next);
        });
        return next;
    }

    function setStatus(elId, text, kind = '') {
        const el = $(elId);
        if (!el) return;
        el.textContent = text || '';
        el.classList.remove('is-ok', 'is-err', 'is-info');
        if (kind) el.classList.add(`is-${kind}`);
    }

    function setMeta(elId, text) {
        const el = $(elId);
        if (el) el.textContent = text || '';
    }

    function setChangelog(elId, notes) {
        const body = $(elId);
        if (!body) return;
        const text = String(notes || '').trim();
        body.textContent = text || '暂无更新说明';
        body.classList.toggle('is-empty', !text);
    }

    function showEl(id, visible) {
        const el = $(id);
        if (el) el.classList.toggle('hidden', !visible);
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
        if (fail.gitcodeError) parts.push(`GitCode: ${String(fail.gitcodeError).slice(0, 80)}`);
        const tipByCode = {
            checksum: '校验失败：换节点重试，或从发布页手动下载同版本 zip',
            extract: '解压失败：确认磁盘空间充足且安装目录可写',
            probe: '清单探测失败：检查网络，或稍后再试 GitHub / GitCode',
            download: '下载失败：可改用其它节点，或从发布页手动下载',
            cancelled: '已取消',
        };
        parts.push(tipByCode[String(fail.code || '')]
            || '可改从 GitHub / GitCode Releases 手动下载');
        return parts.join(' · ');
    }

    function formatDownloadBytes(bytes) {
        const n = Number(bytes);
        if (!Number.isFinite(n) || n < 0) return '';
        if (n < 1024) return `${Math.round(n)} B`;
        if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
        if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
        return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }

    function setProgressVisible(prefix, visible) {
        const host = $(`${prefix}DownloadProgress`);
        if (!host) return;
        host.classList.toggle('is-visible', !!visible);
        if (!visible) {
            const bar = $(`${prefix}DownloadBar`);
            const pctEl = $(`${prefix}DownloadPercent`);
            const detail = $(`${prefix}DownloadDetail`);
            if (bar) bar.style.width = '0%';
            if (pctEl) pctEl.textContent = '0%';
            if (detail) detail.textContent = '';
        }
    }

    function renderAppProgress(progress = {}, version = '') {
        const host = $('appDownloadProgress');
        if (!host) return;
        host.classList.add('is-visible');
        const percent = Math.max(0, Math.min(100, Number(progress.percent) || 0));
        const transferred = Number(progress.transferred) || 0;
        const total = Number(progress.total) || 0;
        const speed = Number(progress.bytesPerSecond) || 0;
        const phase = String(progress.phase || '').trim();
        const message = String(progress.message || '').trim();
        const label = $('appDownloadLabel');
        const pctEl = $('appDownloadPercent');
        const bar = $('appDownloadBar');
        const detail = $('appDownloadDetail');
        if (label) {
            if (message) label.textContent = message;
            else if (phase === 'probe') label.textContent = '正在测速下载源（国内优先 GitCode）…';
            else if (phase === 'extracting') label.textContent = version ? uiTf('正在解压 {version}…', { version: `v${version}` }) : '正在解压更新包…';
            else label.textContent = version ? uiTf('正在下载 {version}…', { version: `v${version}` }) : '正在下载更新…';
        }
        if (pctEl) pctEl.textContent = `${Math.round(percent)}%`;
        if (bar) bar.style.width = `${percent}%`;
        if (detail) {
            if (phase === 'probe' || phase === 'retry' || phase === 'extracting' || phase === 'preparing' || phase === 'ready' || phase === 'installing') {
                detail.textContent = message || '请稍候…';
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

    function renderTdpProgress(progress = {}) {
        const host = $('tdpDownloadProgress');
        if (!host) return;
        host.classList.add('is-visible');
        const percent = Math.max(0, Math.min(100, Number(progress.percent) || 0));
        const phase = String(progress.phase || '').trim();
        const version = String(progress.version || '').trim();
        const label = $('tdpDownloadLabel');
        const pctEl = $('tdpDownloadPercent');
        const bar = $('tdpDownloadBar');
        const detail = $('tdpDownloadDetail');
        const phaseLabel = phase === 'download' ? '正在从官网下载'
            : phase === 'apply' ? '正在应用'
                : phase === 'verify' ? '正在校验'
                    : '准备中';
        if (label) label.textContent = `${phaseLabel}${version ? ` v${version}` : ''}`;
        if (pctEl) pctEl.textContent = `${Math.round(percent)}%`;
        if (bar) bar.style.width = `${percent}%`;
        if (detail) {
            const received = Number(progress.received) || 0;
            const total = Number(progress.total) || 0;
            if (received && total) detail.textContent = `${formatDownloadBytes(received)} / ${formatDownloadBytes(total)}`;
            else detail.textContent = '更新节点：官网';
        }
    }

    function setAppBusy(next) {
        appBusy = !!next;
        const ids = ['appCheckBtn', 'appDownloadBtn', 'appOpenReleasesBtn', 'appInstallBtn'];
        ids.forEach((id) => {
            const btn = $(id);
            if (!btn || btn.classList.contains('hidden')) return;
            btn.disabled = appBusy;
        });
        document.querySelectorAll('#appUpdateNodeGroup .upd-node-btn').forEach((btn) => {
            btn.disabled = appBusy;
        });
    }

    function setTdpBusy(next) {
        tdpBusy = !!next;
        ['tdpCheckBtn', 'tdpUpdateBtn', 'tdpCancelBtn'].forEach((id) => {
            const btn = $(id);
            if (!btn || btn.classList.contains('hidden')) return;
            btn.disabled = tdpBusy;
        });
    }

    function resetAppActions() {
        showEl('appDownloadBtn', false);
        showEl('appOpenReleasesBtn', false);
        showEl('appInstallBtn', false);
        ['appDownloadBtn', 'appOpenReleasesBtn', 'appInstallBtn'].forEach((id) => {
            const btn = $(id);
            if (btn) btn.disabled = true;
        });
    }

    function renderAppVersions(res) {
        const currentEl = $('appCurrentVersion');
        const serverEl = $('appServerVersion');
        const current = res?.currentVersion || lastAppCheck?.currentVersion || '';
        const server = res?.serverVersion || res?.latestVersion || '';
        if (currentEl) {
            currentEl.textContent = formatVersion(current);
        }
        if (serverEl) {
            serverEl.textContent = formatVersion(server);
            serverEl.classList.toggle('is-new', !!(res?.updateAvailable && server));
        }
    }

    function renderTdpVersions(local, remote, updateAvailable) {
        const currentEl = $('tdpCurrentVersion');
        const serverEl = $('tdpServerVersion');
        const localVer = local?.installedVersion || (local?.bundledAvailable ? '内置' : '');
        const remoteVer = remote?.version || '';
        if (currentEl) currentEl.textContent = localVer ? (localVer === '内置' ? '内置' : formatVersion(localVer)) : '无';
        if (serverEl) {
            serverEl.textContent = formatVersion(remoteVer);
            serverEl.classList.toggle('is-new', !!updateAvailable);
        }
    }

    function presentAppCheckResult(res) {
        lastAppCheck = res || null;
        resetAppActions();
        setProgressVisible('app', false);
        renderAppVersions(res);

        if (!res?.ok) {
            setStatus('appUpdateStatus', res?.error || '检查更新失败', 'err');
            setMeta('appUpdateMeta', formatFailureMeta(res || {}));
            setChangelog('appChangelogBody', '');
            showEl('appOpenReleasesBtn', true);
            const openBtn = $('appOpenReleasesBtn');
            if (openBtn) openBtn.disabled = false;
            return;
        }

        setChangelog('appChangelogBody', res.releaseNotes);
        const sources = Array.isArray(res.updateSources) ? res.updateSources.filter(Boolean) : [];
        const sourceHint = sources.length
            ? uiTf('可用节点：{list}。国内用户建议选择：GitCode', { list: sources.join(' / ') })
            : '';

        if (!res.updateAvailable) {
            setStatus('appUpdateStatus', res.message || uiTf('已是最新版本 {version}', { version: formatVersion(res.currentVersion) }), 'ok');
            setMeta('appUpdateMeta', sourceHint || '已同步最新发布说明');
            return;
        }

        setStatus('appUpdateStatus', uiTf('发现新版本 {version}', { version: formatVersion(res.latestVersion) }), 'info');
        if (res.canAutoInstall && electron?.transubDownloadAppUpdate) {
            showEl('appDownloadBtn', true);
            const btn = $('appDownloadBtn');
            if (btn) btn.disabled = false;
            const node = getUpdateSource();
            const nodeHint = node === 'auto'
                ? '下载时将测速并自动选择较快节点。'
                : uiTf('下载时将固定使用 {node} 节点。', { node: node === 'gitcode' ? 'GitCode' : 'GitHub' });
            const incr = res.incrementalLikely
                ? '检测到本地基线，将尝试增量更新。'
                : '将按需下载全量或增量包。';
            setMeta('appUpdateMeta', `${sourceHint}${nodeHint}${incr}已下载的模型、GPU/Demucs 支持库与 Advanced LLM 会保留。`);
        } else {
            showEl('appOpenReleasesBtn', true);
            const btn = $('appOpenReleasesBtn');
            if (btn) btn.disabled = false;
            setMeta('appUpdateMeta', `${sourceHint}请从发布页手动下载 zip 解压版。`);
        }
    }

    function presentTdpCheckResult(checked, localFallback) {
        if (!checked?.ok) {
            lastTdpCheck = null;
            setTdpTabBadge(false);
            setStatus('tdpUpdateStatus', checked?.error || '检查失败', 'err');
            setMeta('tdpUpdateMeta', '');
            setChangelog('tdpChangelogBody', '');
            renderTdpVersions(localFallback || {}, checked?.remote || {}, false);
            const updateBtn = $('tdpUpdateBtn');
            if (updateBtn) updateBtn.disabled = true;
            return;
        }

        lastTdpCheck = checked;
        const local = checked.local || localFallback || {};
        const remote = checked.remote || {};
        renderTdpVersions(local, remote, checked.updateAvailable);

        const notes = String(remote.notes || local.notes || '').trim();
        setChangelog('tdpChangelogBody', notes);

        const entitled = !!local.entitled;
        const updateBtn = $('tdpUpdateBtn');

        if (checked.updateAvailable) {
            setStatus('tdpUpdateStatus', uiTf('发现新版本 {version}', { version: formatVersion(remote.version) }), 'info');
            setTdpTabBadge(true);
            const meta = ['更新节点：官网'];
            if (!entitled) meta.push('开通 Pro 后可下载并应用');
            else if (!local.applied) meta.push('已开通 Pro，更新后将自动应用');
            setMeta('tdpUpdateMeta', meta.join(' · '));
            if (updateBtn) {
                updateBtn.disabled = false;
                updateBtn.textContent = entitled
                    ? uiTf('立即更新 · {version}', { version: formatVersion(remote.version) })
                    : '立即更新（需 Pro）';
            }
        } else if (checked.upToDate) {
            setStatus('tdpUpdateStatus', '已是最新优化包', 'ok');
            setTdpTabBadge(false);
            setMeta('tdpUpdateMeta', entitled
                ? (local.applied ? '已热加载使用中 · 官网' : '已开通 Pro · 官网')
                : '开通 Pro 后可使用 · 官网');
            if (updateBtn) {
                updateBtn.disabled = !entitled || !!local.applied;
                updateBtn.textContent = entitled && !local.applied ? '应用本地包' : '立即更新';
            }
        } else {
            setStatus('tdpUpdateStatus', entitled ? '可检查并应用优化包' : '开通 Pro 后可使用语言优化包');
            setTdpTabBadge(false);
            setMeta('tdpUpdateMeta', '更新节点：官网');
            if (updateBtn) updateBtn.disabled = !entitled;
        }
    }

    async function runAppCheck() {
        if (appBusy) return;
        setAppBusy(true);
        resetAppActions();
        setProgressVisible('app', false);
        setStatus('appUpdateStatus', '正在检查软件更新…');
        setMeta('appUpdateMeta', '');
        try {
            if (!electron?.transWithAiCheckAppUpdate) {
                presentAppCheckResult({ ok: false, error: '当前环境不支持检查更新' });
                return;
            }
            const res = await electron.transWithAiCheckAppUpdate();
            presentAppCheckResult(res);
        } catch (err) {
            presentAppCheckResult({ ok: false, error: err?.message || '检查更新失败' });
        } finally {
            setAppBusy(false);
        }
    }

    async function runTdpCheck() {
        if (tdpBusy) return;
        setTdpBusy(true);
        setProgressVisible('tdp', false);
        setStatus('tdpUpdateStatus', '正在检查 Pro 优化包…');
        setMeta('tdpUpdateMeta', '');
        let localFallback = null;
        try {
            if (!electron?.transubTdpGetStatus) {
                setStatus('tdpUpdateStatus', '当前环境不支持 Pro 优化包', 'err');
                return;
            }
            const statusRes = await electron.transubTdpGetStatus();
            if (!statusRes?.ok) {
                setStatus('tdpUpdateStatus', statusRes?.error || '无法读取优化包状态', 'err');
                return;
            }
            localFallback = statusRes.tdp;
            renderTdpVersions(localFallback, {}, false);

            if (!electron?.transubTdpCheck) {
                presentTdpCheckResult({ ok: true, local: localFallback, upToDate: true }, localFallback);
                return;
            }
            const checked = await electron.transubTdpCheck();
            presentTdpCheckResult(checked, localFallback);
        } catch (err) {
            setStatus('tdpUpdateStatus', err?.message || '检查失败', 'err');
        } finally {
            setTdpBusy(false);
        }
    }

    async function runAppDownload() {
        if (appBusy || !lastAppCheck?.canAutoInstall) return;
        setAppBusy(true);
        showEl('appDownloadBtn', false);
        showEl('appInstallBtn', false);
        setStatus('appUpdateStatus', uiTf('正在下载 {version}…', { version: formatVersion(lastAppCheck.latestVersion) }), 'info');
        renderAppProgress({ percent: 0 }, lastAppCheck.latestVersion);
        try {
            unsubAppProgress?.();
            unsubAppProgress = electron.onAppUpdateDownloadProgress?.((progress) => {
                renderAppProgress(progress, lastAppCheck?.latestVersion);
            }) || null;

            const dl = await electron.transubDownloadAppUpdate({
                version: lastAppCheck.latestVersion,
                updateSource: getUpdateSource(),
            });
            if (!dl?.ok) {
                setProgressVisible('app', false);
                setStatus('appUpdateStatus', dl?.error || '下载失败', 'err');
                showEl('appOpenReleasesBtn', true);
                showEl('appDownloadBtn', true);
                const openBtn = $('appOpenReleasesBtn');
                const downloadBtn = $('appDownloadBtn');
                if (openBtn) openBtn.disabled = false;
                if (downloadBtn) downloadBtn.disabled = false;
                setMeta('appUpdateMeta', formatFailureMeta(dl || {}));
                return;
            }

            renderAppProgress({ percent: 100 }, lastAppCheck.latestVersion);
            const label = $('appDownloadLabel');
            const detail = $('appDownloadDetail');
            if (label) label.textContent = uiTf('{version} 已下载完成', { version: formatVersion(lastAppCheck.latestVersion) });
            if (detail) detail.textContent = '可立即重启安装';
            setStatus('appUpdateStatus', dl.message || '更新已下载，可重启安装', 'ok');
            setMeta('appUpdateMeta', '');
            showEl('appInstallBtn', true);
            const installBtn = $('appInstallBtn');
            if (installBtn) installBtn.disabled = false;
        } catch (err) {
            setProgressVisible('app', false);
            setStatus('appUpdateStatus', err?.message || '下载失败', 'err');
            showEl('appDownloadBtn', true);
            const downloadBtn = $('appDownloadBtn');
            if (downloadBtn) downloadBtn.disabled = false;
        } finally {
            try { unsubAppProgress?.(); } catch { /* ignore */ }
            unsubAppProgress = null;
            setAppBusy(false);
        }
    }

    async function runAppOpenReleases() {
        const url = lastAppCheck?.downloadUrl || lastAppCheck?.releasesUrl;
        try {
            await electron?.transubOpenUpdatePage?.({ url });
            setStatus('appUpdateStatus', '已在浏览器中打开发布页', 'ok');
        } catch (err) {
            setStatus('appUpdateStatus', err?.message || '打开发布页失败', 'err');
        }
    }

    async function runAppInstall() {
        if (appBusy) return;
        setAppBusy(true);
        setStatus('appUpdateStatus', '正在启动升级程序…', 'info');
        setMeta('appUpdateMeta', '主窗口即将关闭。请留意随后出现的「正在升级」进度窗口。');
        renderAppProgress({
            percent: 2,
            phase: 'installing',
            message: '正在启动升级程序，请稍候…',
        }, lastAppCheck?.latestVersion || '');
        showEl('appInstallBtn', false);
        try {
            const res = await electron?.transubQuitAndInstallUpdate?.();
            if (res && res.ok === false) {
                setProgressVisible('app', false);
                setStatus('appUpdateStatus', res.error || '安装失败', 'err');
                setMeta('appUpdateMeta', '');
                showEl('appInstallBtn', true);
                const installBtn = $('appInstallBtn');
                if (installBtn) installBtn.disabled = false;
                setAppBusy(false);
                return;
            }
            setStatus('appUpdateStatus', '升级程序已启动，主程序即将退出…', 'info');
        } catch (err) {
            setProgressVisible('app', false);
            setStatus('appUpdateStatus', err?.message || '安装失败', 'err');
            setMeta('appUpdateMeta', '');
            showEl('appInstallBtn', true);
            const installBtn = $('appInstallBtn');
            if (installBtn) installBtn.disabled = false;
            setAppBusy(false);
        }
    }

    async function runTdpUpdate() {
        if (tdpBusy || !electron?.transubTdpPull) return;
        setTdpBusy(true);
        showEl('tdpCancelBtn', true);
        const cancelBtn = $('tdpCancelBtn');
        if (cancelBtn) cancelBtn.disabled = false;
        setStatus('tdpUpdateStatus', '正在从官网下载优化包…', 'info');
        renderTdpProgress({ phase: 'start', percent: 0, version: lastTdpCheck?.remote?.version });
        try {
            unsubTdpProgress?.();
            unsubTdpProgress = electron.onTransubTdpProgress?.((info) => {
                const pct = Number(info?.percent);
                renderTdpProgress({
                    phase: info?.phase,
                    percent: Number.isFinite(pct) ? pct : 0,
                    version: info?.version,
                    received: info?.received,
                    total: info?.total,
                });
            }) || null;

            const res = await electron.transubTdpPull();
            setProgressVisible('tdp', false);
            showEl('tdpCancelBtn', false);

            if (!res?.ok) {
                setStatus('tdpUpdateStatus', res?.error || '更新失败', 'err');
                return;
            }

            setStatus('tdpUpdateStatus', res.message || '优化包已更新', 'ok');
            setMeta('tdpUpdateMeta', '更新节点：官网');
            await runTdpCheck();
        } catch (err) {
            setProgressVisible('tdp', false);
            showEl('tdpCancelBtn', false);
            setStatus('tdpUpdateStatus', err?.message || '更新失败', 'err');
        } finally {
            try { unsubTdpProgress?.(); } catch { /* ignore */ }
            unsubTdpProgress = null;
            setTdpBusy(false);
        }
    }

    async function runTdpCancel() {
        try {
            await electron?.transubTdpCancelPull?.();
        } catch { /* ignore */ }
        setProgressVisible('tdp', false);
        showEl('tdpCancelBtn', false);
        setStatus('tdpUpdateStatus', '已取消下载', 'info');
        setTdpBusy(false);
    }

    async function loadAppCurrentVersion() {
        try {
            const res = await electron?.getAppVersion?.();
            const v = res?.version ? String(res.version).replace(/^v/i, '') : '';
            const el = $('appCurrentVersion');
            if (el) el.textContent = v ? formatVersion(v) : '未知';
            if (lastAppCheck) lastAppCheck.currentVersion = v;
        } catch {
            const el = $('appCurrentVersion');
            if (el) el.textContent = '未知';
        }
    }

    function setTdpTabBadge(visible) {
        const badge = $('tdpTabBadge');
        if (badge) badge.classList.toggle('hidden', !visible);
    }

    function switchTab(tabId) {
        const tab = tabId === 'tdp' ? 'tdp' : 'app';
        document.querySelectorAll('[data-upd-tab]').forEach((btn) => {
            const el = /** @type {HTMLButtonElement} */ (btn);
            const active = el.dataset.updTab === tab;
            el.classList.toggle('is-active', active);
            el.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        document.querySelectorAll('[data-upd-panel]').forEach((panel) => {
            const el = /** @type {HTMLElement} */ (panel);
            const active = el.dataset.updPanel === tab;
            el.classList.toggle('is-active', active);
            if (active) el.removeAttribute('hidden');
            else el.setAttribute('hidden', '');
        });
    }

    function bind() {
        $('appCheckBtn')?.addEventListener('click', () => { void runAppCheck(); });
        $('appDownloadBtn')?.addEventListener('click', () => { void runAppDownload(); });
        $('appOpenReleasesBtn')?.addEventListener('click', () => { void runAppOpenReleases(); });
        $('appInstallBtn')?.addEventListener('click', () => { void runAppInstall(); });
        $('tdpCheckBtn')?.addEventListener('click', () => { void runTdpCheck(); });
        $('tdpUpdateBtn')?.addEventListener('click', () => { void runTdpUpdate(); });
        $('tdpCancelBtn')?.addEventListener('click', () => { void runTdpCancel(); });
        $('closeBtn')?.addEventListener('click', () => {
            try { globalThis.close(); } catch { /* ignore */ }
        });

        document.querySelectorAll('[data-upd-tab]').forEach((btn) => {
            btn.addEventListener('click', () => {
                switchTab(btn.getAttribute('data-upd-tab') || 'app');
            });
        });

        document.querySelectorAll('#appUpdateNodeGroup [data-update-source]').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (appBusy) return;
                setUpdateSource(btn.getAttribute('data-update-source') || 'auto');
            });
        });

        electron?.onUpdateWindowCheck?.(() => {
            void runAppCheck();
            void runTdpCheck();
        });
    }

    async function init() {
        bind();
        switchTab('app');
        setUpdateSource(getUpdateSource());
        await loadAppCurrentVersion();
        const params = new URLSearchParams(globalThis.location?.search || '');
        if (params.get('autoCheck') === '1') {
            setTimeout(() => {
                if (!appBusy && !lastAppCheck) void runAppCheck();
                if (!tdpBusy && !lastTdpCheck) void runTdpCheck();
            }, 400);
        } else {
            setStatus('appUpdateStatus', '点击「检查更新」获取最新版本与日志。');
            setStatus('tdpUpdateStatus', '点击「检查更新」获取 Pro 优化包状态。');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { void init(); });
    } else {
        void init();
    }
}());
