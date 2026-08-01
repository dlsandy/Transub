/**
 * Windows app update via GitHub + Codeberg Releases.
 * - Zip / win-unpacked: download zip (speed-probe GitHub/Codeberg), merge in place, relaunch
 * - NSIS: electron-updater when latest.yml is present (installer.nsh stashes the same user data on update)
 * - Portable / unpackaged: release APIs + open download page
 * Code signing is not used (no free Authenticode cert).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { asString } = require('./ipc-validate');
const {
    collectPreserveRelPaths,
    findPackageRoot,
    rimrafSafe,
} = require('./zip-update-merge');

const GITHUB_OWNER = 'dlsandy';
const GITHUB_REPO = 'Transub';
const CODEBERG_OWNER = 'flyforyou';
const CODEBERG_REPO = 'Transub';
const RELEASES_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;
const CODEBERG_RELEASES_URL = `https://codeberg.org/${CODEBERG_OWNER}/${CODEBERG_REPO}/releases`;
const LATEST_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
const CODEBERG_LATEST_API = `https://codeberg.org/api/v1/repos/${CODEBERG_OWNER}/${CODEBERG_REPO}/releases/latest`;
const TRANWITHAI_RELEASES_URL = 'https://github.com/TransWithAI/Faster-Whisper-TransWithAI-ChickenRice/releases';

/** @type {import('electron-updater').AppUpdater | null} */
let updater = null;
let updateReady = false;
/** @type {{
 *   version: string,
 *   releaseNotes?: string,
 *   downloadUrl?: string,
 *   downloadUrls?: string[],
 *   downloadName?: string,
 *   preferredSource?: string,
 *   mode?: 'nsis'|'zip',
 * } | null} */
let pendingUpdate = null;
/** @type {{
 *   version: string,
 *   zipPath: string,
 *   extractDir: string,
 *   packageRoot: string,
 *   installRoot: string,
 *   preserveRelPaths: string[],
 *   workDir: string,
 * } | null} */
let pendingZipUpdate = null;
/** @type {((progress: {
 *   percent: number,
 *   transferred: number,
 *   total: number,
 *   bytesPerSecond: number,
 * }) => void) | null} */
let progressListener = null;

function setUpdateProgressListener(fn) {
    progressListener = typeof fn === 'function' ? fn : null;
}

function emitDownloadProgress(progressObj) {
    if (!progressListener) return;
    const percent = Number(progressObj?.percent);
    const transferred = Number(progressObj?.transferred);
    const total = Number(progressObj?.total);
    const bytesPerSecond = Number(progressObj?.bytesPerSecond);
    try {
        progressListener({
            percent: Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0,
            transferred: Number.isFinite(transferred) ? Math.max(0, transferred) : 0,
            total: Number.isFinite(total) ? Math.max(0, total) : 0,
            bytesPerSecond: Number.isFinite(bytesPerSecond) ? Math.max(0, bytesPerSecond) : 0,
        });
    } catch (err) {
        console.warn('[app-updater] progress listener error', err?.message || err);
    }
}

function getElectronApp() {
    try {
        const electron = require('electron');
        return electron && typeof electron === 'object' ? electron.app : null;
    } catch {
        return null;
    }
}

function getElectronShell() {
    try {
        const electron = require('electron');
        return electron && typeof electron === 'object' ? electron.shell : null;
    } catch {
        return null;
    }
}

function getCurrentVersion() {
    const electronApp = getElectronApp();
    try {
        if (electronApp?.getVersion) {
            const v = String(electronApp.getVersion() || '').trim();
            if (v) return v;
        }
    } catch {
        /* fall through */
    }
    try {
        return String(require(path.join(__dirname, '..', 'package.json')).version || '0.0.0');
    } catch {
        return '0.0.0';
    }
}

function isPortableBuild() {
    return Boolean(process.env.PORTABLE_EXECUTABLE_DIR);
}

function getInstallRootSafe() {
    try {
        return require('./app-paths').getInstallRoot();
    } catch {
        return path.dirname(process.execPath);
    }
}

/**
 * @returns {'nsis'|'zip'|'portable'|'dev'|'unsupported'}
 */
function getInstallKind() {
    if (process.platform !== 'win32') return 'unsupported';
    if (isPortableBuild()) return 'portable';
    const electronApp = getElectronApp();
    if (!electronApp?.isPackaged) return 'dev';
    const installRoot = getInstallRootSafe();
    // electron-builder NSIS writes Uninstall <ProductName>.exe beside the app
    if (fs.existsSync(path.join(installRoot, 'Uninstall Transub.exe'))) {
        return 'nsis';
    }
    return 'zip';
}

function canUseElectronUpdater() {
    return getInstallKind() === 'nsis';
}

function canAutoInstallZip() {
    return getInstallKind() === 'zip';
}

function parseVersion(raw) {
    const s = String(raw || '').trim().replace(/^v/i, '');
    const parts = s.split(/[.+-]/).map((p) => parseInt(p, 10));
    return [
        Number.isFinite(parts[0]) ? parts[0] : 0,
        Number.isFinite(parts[1]) ? parts[1] : 0,
        Number.isFinite(parts[2]) ? parts[2] : 0,
    ];
}

function compareVersions(a, b) {
    const pa = parseVersion(a);
    const pb = parseVersion(b);
    for (let i = 0; i < 3; i++) {
        if (pa[i] > pb[i]) return 1;
        if (pa[i] < pb[i]) return -1;
    }
    return 0;
}

/**
 * Normalize electron-updater / GitHub release notes into plain text for the UI.
 * @param {unknown} notes
 * @param {number} [maxLen]
 */
function normalizeReleaseNotes(notes, maxLen = 8000) {
    let text = '';
    if (typeof notes === 'string') {
        text = notes;
    } else if (Array.isArray(notes)) {
        text = notes.map((item) => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object') {
                const version = String(item.version || '').trim();
                const body = String(item.note || item.notes || item.body || '').trim();
                if (version && body) return `## ${version}\n${body}`;
                return body || (version ? `## ${version}` : '');
            }
            return '';
        }).filter(Boolean).join('\n\n');
    } else if (notes != null && typeof notes === 'object') {
        text = String(notes.note || notes.notes || notes.body || '');
    }
    return asString(text, maxLen).trim();
}

async function fetchGithubReleaseNotes() {
    try {
        const dual = await fetchDualHostLatestReleases();
        return normalizeReleaseNotes(dual.primaryRelease?.body || '');
    } catch {
        return '';
    }
}

function releaseVersion(release) {
    return String(release?.tag_name || release?.name || '').replace(/^v/i, '').trim();
}

/**
 * @param {string} apiUrl
 * @param {{ github?: boolean }} [opts]
 */
async function fetchLatestReleaseJson(apiUrl, opts = {}) {
    const headers = {
        Accept: opts.github ? 'application/vnd.github+json' : 'application/json',
        'User-Agent': 'Transub-Updater',
    };
    if (opts.github) headers['X-GitHub-Api-Version'] = '2022-11-28';
    const res = await fetch(apiUrl, { headers });
    if (!res.ok) {
        throw new Error(`Release API ${res.status}`);
    }
    return res.json();
}

async function fetchGithubLatestRelease() {
    return fetchLatestReleaseJson(LATEST_API, { github: true });
}

async function fetchCodebergLatestRelease() {
    return fetchLatestReleaseJson(CODEBERG_LATEST_API);
}

/**
 * Collect zip/setup asset URLs from GitHub + Codeberg for the same latest version.
 * @returns {Promise<{
 *   github: object|null,
 *   codeberg: object|null,
 *   latestVersion: string,
 *   primaryRelease: object|null,
 *   zipUrls: string[],
 *   setupUrls: string[],
 *   zipName: string,
 *   setupName: string,
 * }>}
 */
async function fetchDualHostLatestReleases() {
    const settled = await Promise.allSettled([
        fetchGithubLatestRelease(),
        fetchCodebergLatestRelease(),
    ]);
    const github = settled[0].status === 'fulfilled' ? settled[0].value : null;
    const codeberg = settled[1].status === 'fulfilled' ? settled[1].value : null;
    if (!github && !codeberg) {
        const err = settled.find((r) => r.status === 'rejected')?.reason;
        throw new Error(err?.message || '无法连接 GitHub / Codeberg 发布接口');
    }

    const ghVer = github ? releaseVersion(github) : '';
    const cbVer = codeberg ? releaseVersion(codeberg) : '';
    let latestVersion = ghVer || cbVer;
    let primaryRelease = github || codeberg;
    if (ghVer && cbVer) {
        const cmp = compareVersions(cbVer, ghVer);
        if (cmp > 0) {
            latestVersion = cbVer;
            primaryRelease = codeberg;
        } else if (cmp < 0) {
            latestVersion = ghVer;
            primaryRelease = github;
        } else {
            latestVersion = ghVer;
            primaryRelease = github;
        }
    }

    const zipUrls = [];
    const setupUrls = [];
    let zipName = '';
    let setupName = '';
    const hosts = [
        { release: github, ver: ghVer },
        { release: codeberg, ver: cbVer },
    ];
    for (const { release, ver } of hosts) {
        if (!release || !ver || compareVersions(ver, latestVersion) !== 0) continue;
        const zip = pickZipAsset(release);
        const setup = pickSetupAsset(release);
        if (zip?.browser_download_url) {
            zipUrls.push(String(zip.browser_download_url));
            if (!zipName) zipName = String(zip.name || '');
        }
        if (setup?.browser_download_url) {
            setupUrls.push(String(setup.browser_download_url));
            if (!setupName) setupName = String(setup.name || '');
        }
    }

    return {
        github,
        codeberg,
        latestVersion,
        primaryRelease,
        zipUrls: [...new Set(zipUrls)],
        setupUrls: [...new Set(setupUrls)],
        zipName,
        setupName,
        githubError: settled[0].status === 'rejected'
            ? String(settled[0].reason?.message || settled[0].reason || '')
            : '',
        codebergError: settled[1].status === 'rejected'
            ? String(settled[1].reason?.message || settled[1].reason || '')
            : '',
    };
}

function pickSetupAsset(release) {
    const assets = Array.isArray(release?.assets) ? release.assets : [];
    // Prefer zip; then NSIS Setup. Keep portable as fallback for older Releases.
    const zip = assets.find((a) => /\.zip$/i.test(a.name || '') && /transub/i.test(a.name || ''));
    if (zip) return zip;
    const setup = assets.find((a) => /setup/i.test(a.name || '') && /\.exe$/i.test(a.name || ''));
    if (setup) return setup;
    const portable = assets.find((a) => /portable/i.test(a.name || '') && /\.exe$/i.test(a.name || ''));
    if (portable) return portable;
    return assets.find((a) => /\.exe$/i.test(a.name || '')) || null;
}

function pickZipAsset(release) {
    const assets = Array.isArray(release?.assets) ? release.assets : [];
    return assets.find((a) => /\.zip$/i.test(a.name || '') && /transub/i.test(a.name || '')) || null;
}

function getUpdater() {
    if (updater) return updater;
    if (!canUseElectronUpdater()) return null;
    // Lazy require so unpackaged / portable / zip paths never load native updater deps unnecessarily
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;
    autoUpdater.setFeedURL({
        provider: 'github',
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
    });

    autoUpdater.on('update-available', (info) => {
        pendingUpdate = {
            version: info.version,
            releaseNotes: normalizeReleaseNotes(info.releaseNotes),
            mode: 'nsis',
        };
    });
    autoUpdater.on('download-progress', (progress) => {
        emitDownloadProgress(progress);
    });
    autoUpdater.on('update-downloaded', () => {
        updateReady = true;
    });
    autoUpdater.on('error', (err) => {
        console.warn('[app-updater]', err?.message || err);
    });

    updater = autoUpdater;
    return updater;
}

async function checkViaGithubApi() {
    const currentVersion = getCurrentVersion();
    const dual = await fetchDualHostLatestReleases();
    const latestVersion = dual.latestVersion;
    const release = dual.primaryRelease;
    if (!latestVersion || !release) {
        return {
            ok: true,
            currentVersion,
            updateAvailable: false,
            mode: 'release-api',
            installKind: getInstallKind(),
            releasesUrl: RELEASES_URL,
            codebergReleasesUrl: CODEBERG_RELEASES_URL,
            transWithAiReleasesUrl: TRANWITHAI_RELEASES_URL,
            message: '无法解析最新版本号',
        };
    }
    const updateAvailable = compareVersions(latestVersion, currentVersion) > 0;
    const installKind = getInstallKind();
    const electronApp = getElectronApp();
    const zipUrls = dual.zipUrls;
    const setupUrls = dual.setupUrls;
    const preferredZip = zipUrls[0] || '';
    const preferredSetup = setupUrls[0] || '';
    const zipAuto = Boolean(
        updateAvailable
        && installKind === 'zip'
        && preferredZip
        && /\.zip$/i.test(dual.zipName || preferredZip),
    );

    const releaseNotes = normalizeReleaseNotes(release.body || '');
    const sources = [];
    if (dual.github) sources.push('GitHub');
    if (dual.codeberg) sources.push('Codeberg');

    if (zipAuto) {
        pendingUpdate = {
            version: latestVersion,
            releaseNotes,
            downloadUrl: preferredZip,
            downloadUrls: zipUrls,
            downloadName: dual.zipName || '',
            mode: 'zip',
        };
    }

    const pageUrl = release.html_url
        || (dual.github?.html_url)
        || (dual.codeberg?.html_url)
        || RELEASES_URL;

    return {
        ok: true,
        currentVersion,
        latestVersion,
        updateAvailable,
        mode: 'release-api',
        installKind,
        releaseName: release.name || `v${latestVersion}`,
        releaseNotes,
        releasesUrl: dual.github?.html_url || RELEASES_URL,
        codebergReleasesUrl: dual.codeberg?.html_url || CODEBERG_RELEASES_URL,
        downloadUrl: (installKind === 'zip' && preferredZip)
            ? preferredZip
            : (preferredSetup || pageUrl),
        downloadUrls: installKind === 'zip' ? zipUrls : setupUrls,
        downloadName: (installKind === 'zip' ? dual.zipName : dual.setupName) || '',
        updateSources: sources,
        portable: isPortableBuild(),
        packaged: Boolean(electronApp?.isPackaged),
        canAutoInstall: zipAuto,
        preservesEngineData: zipAuto,
        transWithAiReleasesUrl: TRANWITHAI_RELEASES_URL,
        githubError: dual.githubError || '',
        codebergError: dual.codebergError || '',
        message: updateAvailable
            ? (zipAuto
                ? `发现新版本 v${latestVersion}（将测速 GitHub / Codeberg 后下载；已下载的模型、支持库与 Advanced LLM 会保留）`
                : `发现新版本 v${latestVersion}`)
            : `已是最新版本 v${currentVersion}`,
    };
}

async function checkViaElectronUpdater() {
    const currentVersion = getCurrentVersion();
    const autoUpdater = getUpdater();
    if (!autoUpdater) {
        return checkViaGithubApi();
    }

    try {
        const result = await autoUpdater.checkForUpdates();
        const info = result?.updateInfo;
        const latestVersion = info?.version || pendingUpdate?.version || '';
        if (!latestVersion) {
            // No latest.yml or feed empty — fall back
            return checkViaGithubApi();
        }
        const updateAvailable = compareVersions(latestVersion, currentVersion) > 0;
        let releaseNotes = normalizeReleaseNotes(info?.releaseNotes)
            || normalizeReleaseNotes(pendingUpdate?.releaseNotes);
        if (updateAvailable && !releaseNotes) {
            releaseNotes = await fetchGithubReleaseNotes();
        }
        if (updateAvailable) {
            pendingUpdate = {
                version: latestVersion,
                releaseNotes,
                mode: 'nsis',
            };
        }
        return {
            ok: true,
            currentVersion,
            latestVersion,
            updateAvailable,
            mode: 'electron-updater',
            installKind: 'nsis',
            releaseNotes,
            releasesUrl: RELEASES_URL,
            portable: false,
            packaged: true,
            canAutoInstall: updateAvailable,
            updateReady,
            preservesEngineData: true,
            transWithAiReleasesUrl: TRANWITHAI_RELEASES_URL,
            message: updateAvailable
                ? `发现新版本 v${latestVersion}（可在应用内下载安装，将保留已下载的模型与支持库）`
                : `已是最新版本 v${currentVersion}`,
        };
    } catch (err) {
        const fallback = await checkViaGithubApi();
        fallback.updaterError = err.message || String(err);
        fallback.message = `${fallback.message}（自动更新源不可用，已改用 GitHub Releases）`;
        return fallback;
    }
}

async function checkForAppUpdate() {
    if (process.platform !== 'win32') {
        return {
            ok: false,
            error: '仅支持 Windows',
            currentVersion: getCurrentVersion(),
            releasesUrl: RELEASES_URL,
        };
    }
    const installKind = getInstallKind();
    if (installKind === 'nsis') {
        return checkViaElectronUpdater();
    }
    const result = await checkViaGithubApi();
    if (installKind === 'portable') {
        result.message = result.updateAvailable
            ? `${result.message}。便携版已停更，请改用 zip 解压版或 Setup 安装版。`
            : result.message;
    } else if (installKind === 'dev') {
        result.message = `${result.message}（开发模式仅检查，不自动安装）`;
    }
    return result;
}

function clearPendingZipArtifacts() {
    if (!pendingZipUpdate) return;
    try {
        if (pendingZipUpdate.workDir) rimrafSafe(pendingZipUpdate.workDir);
    } catch {
        /* ignore */
    }
    pendingZipUpdate = null;
}

async function downloadZipUpdate() {
    if (!canAutoInstallZip()) {
        return { ok: false, error: '当前不是 zip 解压版，无法应用内更新' };
    }
    let downloadUrl = String(pendingUpdate?.downloadUrl || '').trim();
    let downloadUrls = Array.isArray(pendingUpdate?.downloadUrls)
        ? pendingUpdate.downloadUrls.map((u) => String(u || '').trim()).filter(Boolean)
        : [];
    let version = String(pendingUpdate?.version || '').trim();
    let downloadName = String(pendingUpdate?.downloadName || '').trim();

    const looksLikeZip = /\.zip(\?|#|$)/i.test(downloadUrl) || /\.zip$/i.test(downloadName);
    if (!downloadUrl || !looksLikeZip) {
        // Refresh from GitHub / Codeberg so a stale pendingUpdate does not block install
        const check = await checkViaGithubApi();
        if (!check.updateAvailable || !check.canAutoInstall) {
            return { ok: false, error: check.message || '没有可下载的 zip 更新' };
        }
        downloadUrl = String(check.downloadUrl || '').trim();
        downloadUrls = Array.isArray(check.downloadUrls)
            ? check.downloadUrls.map((u) => String(u || '').trim()).filter(Boolean)
            : [];
        version = String(check.latestVersion || '').trim();
        downloadName = String(check.downloadName || '').trim();
    }

    if (!downloadUrl || !/^https:\/\//i.test(downloadUrl)) {
        return { ok: false, error: '缺少有效的 zip 下载地址' };
    }

    const extraUrls = downloadUrls.filter((u) => u && u !== downloadUrl && /^https:\/\//i.test(u));
    const downloader = require('./advanced-llm-download');
    clearPendingZipArtifacts();

    const workDir = path.join(os.tmpdir(), `transub-zip-update-${process.pid}-${Date.now()}`);
    const extractDir = path.join(workDir, 'extract');
    const zipName = downloadName && /\.zip$/i.test(downloadName)
        ? downloadName
        : `Transub-${version || 'update'}-win.zip`;
    const zipPath = path.join(workDir, zipName);

    fs.mkdirSync(workDir, { recursive: true });
    fs.mkdirSync(extractDir, { recursive: true });

    try {
        emitDownloadProgress({
            percent: 0,
            transferred: 0,
            total: 0,
            bytesPerSecond: 0,
            phase: 'probe',
            message: extraUrls.length
                ? '正在测速 GitHub / Codeberg 下载源…'
                : '正在准备下载…',
        });

        let preferredSource = '';
        await downloader.downloadFile(downloadUrl, zipPath, {
            extraUrls,
            onProgress: (p) => {
                const phase = String(p.phase || '').trim();
                const message = String(p.message || '').trim();
                if (phase === 'probe' || phase === 'retry') {
                    emitDownloadProgress({
                        percent: 0,
                        transferred: 0,
                        total: 0,
                        bytesPerSecond: 0,
                        phase: phase || 'probe',
                        message: message || '正在测速下载源…',
                    });
                    if (p.preferredUrl) {
                        preferredSource = downloader.downloadSourceLabel(
                            p.preferredUrl,
                            downloadUrl,
                        );
                    }
                    return;
                }
                const received = Number(p.received || p.downloadedBytes || 0);
                const total = Number(p.total || p.totalBytes || 0);
                const pct = Number(p.pct);
                emitDownloadProgress({
                    percent: Number.isFinite(pct)
                        ? Math.min(90, pct)
                        : (total > 0 ? Math.min(90, (received / total) * 100) : 0),
                    transferred: received,
                    total,
                    bytesPerSecond: Number(p.bytesPerSecond) || 0,
                    phase: 'download',
                    message: preferredSource
                        ? `正在从 ${preferredSource} 下载…`
                        : (message || ''),
                });
            },
        });

        emitDownloadProgress({
            percent: 92,
            transferred: 0,
            total: 0,
            bytesPerSecond: 0,
            phase: 'extracting',
            message: '下载完成，正在解压更新包…',
        });

        downloader.extractArchive(zipPath, extractDir, 'zip');

        emitDownloadProgress({
            percent: 96,
            transferred: 0,
            total: 0,
            bytesPerSecond: 0,
            phase: 'preparing',
            message: '正在准备安装（扫描需保留的模型与支持库）…',
        });

        const packageRoot = findPackageRoot(extractDir);
        const installRoot = getInstallRootSafe();
        const preserveRelPaths = collectPreserveRelPaths(installRoot);

        pendingZipUpdate = {
            version,
            zipPath,
            extractDir,
            packageRoot,
            installRoot,
            preserveRelPaths,
            workDir,
        };
        pendingUpdate = {
            ...(pendingUpdate || {}),
            version,
            downloadUrl,
            downloadUrls: [downloadUrl, ...extraUrls],
            downloadName: zipName,
            preferredSource,
            mode: 'zip',
        };
        updateReady = true;

        emitDownloadProgress({
            percent: 100,
            transferred: 0,
            total: 0,
            bytesPerSecond: 0,
            phase: 'ready',
            message: preferredSource
                ? `已从 ${preferredSource} 下载完成，可点击「重启安装」`
                : '更新已就绪，可点击「重启安装」',
        });

        return {
            ok: true,
            updateReady: true,
            version,
            mode: 'zip',
            preferredSource,
            preservesEngineData: true,
            preservedCount: preserveRelPaths.length,
            message: preserveRelPaths.length
                ? `更新已下载${preferredSource ? `（${preferredSource}）` : ''}，重启后完成安装（将保留已下载的模型、支持库与 Advanced LLM）`
                : `更新已下载${preferredSource ? `（${preferredSource}）` : ''}，重启后完成安装`,
        };
    } catch (err) {
        clearPendingZipArtifacts();
        updateReady = false;
        return { ok: false, error: err.message || String(err) };
    }
}

async function downloadAppUpdate() {
    const installKind = getInstallKind();
    if (installKind === 'zip') {
        return downloadZipUpdate();
    }
    if (!canUseElectronUpdater()) {
        return {
            ok: false,
            error: '当前安装方式不支持应用内下载（请使用 zip 解压版或 NSIS 安装版，或打开 Releases 手动下载）',
        };
    }
    const autoUpdater = getUpdater();
    if (!autoUpdater) return { ok: false, error: '更新器不可用' };
    try {
        await autoUpdater.downloadUpdate();
        updateReady = true;
        return {
            ok: true,
            updateReady: true,
            version: pendingUpdate?.version || '',
            mode: 'nsis',
            preservesEngineData: true,
            message: '更新已下载，重启后完成安装（将保留已下载的模型与支持库）',
        };
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    }
}

function stopEngineBeforeUpdate() {
    try {
        const engine = require('./engine-bridge');
        if (typeof engine.stopEngineProcess === 'function') {
            engine.stopEngineProcess();
        }
    } catch (err) {
        console.warn('[app-updater] stop engine:', err?.message || err);
    }
    try {
        require('./advanced-llama-server').stopLlamaServer();
    } catch (err) {
        console.warn('[app-updater] stop llama-server:', err?.message || err);
    }
}

function quitAndInstallZipUpdate() {
    if (!updateReady || !pendingZipUpdate) {
        return { ok: false, error: '没有已下载的 zip 更新' };
    }
    const meta = pendingZipUpdate;
    const electronApp = getElectronApp();
    if (!electronApp) return { ok: false, error: '应用实例不可用' };

    stopEngineBeforeUpdate();

    const stagingDir = path.join(os.tmpdir(), `transub-zip-apply-${process.pid}-${Date.now()}`);
    fs.mkdirSync(stagingDir, { recursive: true });
    const hostExe = path.join(stagingDir, 'transub-update-host.exe');
    const metaPath = path.join(stagingDir, 'update-meta.json');
    const logPath = path.join(stagingDir, 'update.log');
    const statusPath = path.join(stagingDir, 'update-status.json');
    const applyScript = path.join(__dirname, 'zip-update-apply.js');
    const mergeScript = path.join(__dirname, 'zip-update-merge.js');
    const statusWriterPath = path.join(__dirname, 'zip-update-status.js');

    try {
        fs.copyFileSync(process.execPath, hostExe);
    } catch (err) {
        return { ok: false, error: `无法准备更新宿主: ${err.message || err}` };
    }

    try {
        const { writeZipUpdateStatus } = require('./zip-update-status');
        writeZipUpdateStatus(statusPath, {
            phase: 'waiting',
            message: '正在启动升级程序，请稍候…',
            percent: 2,
        });
    } catch { /* ignore */ }

    const payload = {
        waitPid: process.pid,
        waitTimeoutMs: 180000,
        installRoot: meta.installRoot,
        packageRoot: meta.packageRoot,
        preserveRelPaths: meta.preserveRelPaths,
        exePath: path.join(meta.installRoot, 'Transub.exe'),
        logPath,
        statusPath,
        cleanupPaths: [meta.workDir],
    };
    fs.writeFileSync(metaPath, JSON.stringify(payload, null, 2), 'utf8');

    // Progress UI must outlive this process; skip single-instance by using a dedicated argv.
    try {
        if (typeof electronApp.releaseSingleInstanceLock === 'function') {
            electronApp.releaseSingleInstanceLock();
        }
    } catch { /* ignore */ }

    try {
        const progressUi = spawn(process.execPath, [`--zip-update-progress=${statusPath}`], {
            detached: true,
            stdio: 'ignore',
            windowsHide: false,
            env: {
                ...process.env,
            },
        });
        progressUi.unref();
    } catch (err) {
        console.warn('[app-updater] progress UI failed:', err?.message || err);
    }

    try {
        const child = spawn(hostExe, [applyScript, metaPath, mergeScript, statusWriterPath], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
            env: {
                ...process.env,
                ELECTRON_RUN_AS_NODE: '1',
            },
        });
        child.unref();
    } catch (err) {
        return { ok: false, error: `无法启动更新进程: ${err.message || err}` };
    }

    setImmediate(() => {
        try {
            electronApp.quit();
        } catch (err) {
            console.warn('[app-updater] quit failed', err?.message || err);
        }
    });
    return { ok: true, mode: 'zip', statusPath };
}

function quitAndInstallUpdate() {
    if (pendingZipUpdate && updateReady && pendingUpdate?.mode === 'zip') {
        return quitAndInstallZipUpdate();
    }
    if (!updateReady || !canUseElectronUpdater()) {
        return { ok: false, error: '没有已下载的更新' };
    }
    const autoUpdater = getUpdater();
    if (!autoUpdater) return { ok: false, error: '更新器不可用' };
    stopEngineBeforeUpdate();
    // NSIS installer shows its own UI; give the in-app window a moment to display a tip.
    setTimeout(() => {
        try {
            autoUpdater.quitAndInstall(false, true);
        } catch (err) {
            console.warn('[app-updater] quitAndInstall failed', err?.message || err);
        }
    }, 400);
    return { ok: true, mode: 'nsis' };
}

function getPendingUpdate() {
    return pendingUpdate ? { ...pendingUpdate } : null;
}

function isUpdateReady() {
    return !!updateReady;
}

async function openUpdateDownload(url) {
    const target = asString(url || RELEASES_URL, 4096).trim() || RELEASES_URL;
    if (!/^https:\/\//i.test(target)) {
        return { ok: false, error: '仅允许打开 https 链接' };
    }
    const shell = getElectronShell();
    if (!shell?.openExternal) {
        return { ok: false, error: '无法打开外部链接' };
    }
    await shell.openExternal(target);
    return { ok: true };
}

module.exports = {
    GITHUB_OWNER,
    GITHUB_REPO,
    CODEBERG_OWNER,
    CODEBERG_REPO,
    RELEASES_URL,
    CODEBERG_RELEASES_URL,
    compareVersions,
    normalizeReleaseNotes,
    releaseVersion,
    getCurrentVersion,
    isPortableBuild,
    getInstallKind,
    canUseElectronUpdater,
    canAutoInstallZip,
    checkForAppUpdate,
    downloadAppUpdate,
    quitAndInstallUpdate,
    openUpdateDownload,
    setUpdateProgressListener,
    getPendingUpdate,
    isUpdateReady,
};
