/**
 * Windows app update via GitHub Releases.
 * - Zip / win-unpacked: download zip, merge in place (preserve models + GPU/Demucs + Advanced LLM), relaunch
 * - NSIS: electron-updater when latest.yml is present (installer.nsh stashes the same user data on update)
 * - Portable / unpackaged: GitHub Releases API + open download page
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
const RELEASES_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;
const LATEST_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
const TRANWITHAI_RELEASES_URL = 'https://github.com/TransWithAI/Faster-Whisper-TransWithAI-ChickenRice/releases';

/** @type {import('electron-updater').AppUpdater | null} */
let updater = null;
let updateReady = false;
/** @type {{
 *   version: string,
 *   releaseNotes?: string,
 *   downloadUrl?: string,
 *   downloadName?: string,
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

async function fetchGithubLatestRelease() {
    const res = await fetch(LATEST_API, {
        headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'Transub-Updater',
            'X-GitHub-Api-Version': '2022-11-28',
        },
    });
    if (!res.ok) {
        throw new Error(`GitHub API ${res.status}`);
    }
    return res.json();
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
            releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : '',
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
    const release = await fetchGithubLatestRelease();
    const latestVersion = String(release.tag_name || release.name || '').replace(/^v/i, '');
    if (!latestVersion) {
        return {
            ok: true,
            currentVersion,
            updateAvailable: false,
            mode: 'github-api',
            installKind: getInstallKind(),
            releasesUrl: RELEASES_URL,
            transWithAiReleasesUrl: TRANWITHAI_RELEASES_URL,
            message: '无法解析最新版本号',
        };
    }
    const updateAvailable = compareVersions(latestVersion, currentVersion) > 0;
    const installKind = getInstallKind();
    const zipAsset = pickZipAsset(release);
    const setup = installKind === 'zip' && zipAsset ? zipAsset : pickSetupAsset(release);
    const electronApp = getElectronApp();
    const zipAuto = Boolean(
        updateAvailable
        && installKind === 'zip'
        && zipAsset
        && /\.zip$/i.test(zipAsset.name || ''),
    );

    if (zipAuto) {
        pendingUpdate = {
            version: latestVersion,
            releaseNotes: asString(release.body || '', 8000),
            downloadUrl: zipAsset.browser_download_url,
            downloadName: zipAsset.name || '',
            mode: 'zip',
        };
    }

    return {
        ok: true,
        currentVersion,
        latestVersion,
        updateAvailable,
        mode: 'github-api',
        installKind,
        releaseName: release.name || `v${latestVersion}`,
        releaseNotes: asString(release.body || '', 8000),
        releasesUrl: release.html_url || RELEASES_URL,
        downloadUrl: setup?.browser_download_url || release.html_url || RELEASES_URL,
        downloadName: setup?.name || '',
        portable: isPortableBuild(),
        packaged: Boolean(electronApp?.isPackaged),
        canAutoInstall: zipAuto,
        preservesEngineData: zipAuto,
        transWithAiReleasesUrl: TRANWITHAI_RELEASES_URL,
        message: updateAvailable
            ? (zipAuto
                ? `发现新版本 v${latestVersion}（可在应用内更新，将保留已下载的模型、支持库与 Advanced LLM）`
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
        if (updateAvailable) {
            pendingUpdate = {
                version: latestVersion,
                releaseNotes: typeof info?.releaseNotes === 'string' ? info.releaseNotes : '',
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
            releaseNotes: pendingUpdate?.releaseNotes || '',
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
    let version = String(pendingUpdate?.version || '').trim();
    let downloadName = String(pendingUpdate?.downloadName || '').trim();

    const looksLikeZip = /\.zip(\?|#|$)/i.test(downloadUrl) || /\.zip$/i.test(downloadName);
    if (!downloadUrl || !looksLikeZip) {
        // Refresh from GitHub so a stale pendingUpdate does not block install
        const check = await checkViaGithubApi();
        if (!check.updateAvailable || !check.canAutoInstall) {
            return { ok: false, error: check.message || '没有可下载的 zip 更新' };
        }
        downloadUrl = String(check.downloadUrl || '').trim();
        version = String(check.latestVersion || '').trim();
        downloadName = String(check.downloadName || '').trim();
    }

    if (!downloadUrl || !/^https:\/\//i.test(downloadUrl)) {
        return { ok: false, error: '缺少有效的 zip 下载地址' };
    }

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
        });

        await downloader.downloadFile(downloadUrl, zipPath, {
            onProgress: (p) => {
                const received = Number(p.received || p.downloadedBytes || 0);
                const total = Number(p.total || p.totalBytes || 0);
                const pct = Number(p.pct);
                emitDownloadProgress({
                    percent: Number.isFinite(pct)
                        ? pct
                        : (total > 0 ? Math.min(99, (received / total) * 100) : 0),
                    transferred: received,
                    total,
                    bytesPerSecond: Number(p.bytesPerSecond) || 0,
                });
            },
        });

        emitDownloadProgress({
            percent: 99,
            transferred: 0,
            total: 0,
            bytesPerSecond: 0,
        });

        downloader.extractArchive(zipPath, extractDir, 'zip');
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
            downloadName: zipName,
            mode: 'zip',
        };
        updateReady = true;

        emitDownloadProgress({
            percent: 100,
            transferred: 0,
            total: 0,
            bytesPerSecond: 0,
        });

        return {
            ok: true,
            updateReady: true,
            version,
            mode: 'zip',
            preservesEngineData: true,
            preservedCount: preserveRelPaths.length,
            message: preserveRelPaths.length
                ? '更新已下载，重启后完成安装（将保留已下载的模型、支持库与 Advanced LLM）'
                : '更新已下载，重启后完成安装',
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
    const applyScript = path.join(__dirname, 'zip-update-apply.js');
    const mergeScript = path.join(__dirname, 'zip-update-merge.js');

    try {
        fs.copyFileSync(process.execPath, hostExe);
    } catch (err) {
        return { ok: false, error: `无法准备更新宿主: ${err.message || err}` };
    }

    const payload = {
        waitPid: process.pid,
        waitTimeoutMs: 180000,
        installRoot: meta.installRoot,
        packageRoot: meta.packageRoot,
        preserveRelPaths: meta.preserveRelPaths,
        exePath: path.join(meta.installRoot, 'Transub.exe'),
        logPath,
        cleanupPaths: [meta.workDir],
    };
    fs.writeFileSync(metaPath, JSON.stringify(payload, null, 2), 'utf8');

    try {
        const child = spawn(hostExe, [applyScript, metaPath, mergeScript], {
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
    return { ok: true, mode: 'zip' };
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
    setImmediate(() => {
        autoUpdater.quitAndInstall(false, true);
    });
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
    RELEASES_URL,
    compareVersions,
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
