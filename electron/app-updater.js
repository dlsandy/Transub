/**
 * Windows app update via GitHub Releases.
 * - NSIS installs: electron-updater when latest.yml is present
 * - Portable / missing yml / unpackaged: GitHub Releases API + open download page
 * Code signing is not used (no free Authenticode cert).
 */
const path = require('path');
const { asString } = require('./ipc-validate');

const GITHUB_OWNER = 'dlsandy';
const GITHUB_REPO = 'Transub';
const RELEASES_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;
const LATEST_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
const TRANWITHAI_RELEASES_URL = 'https://github.com/TransWithAI/Faster-Whisper-TransWithAI-ChickenRice/releases';

/** @type {import('electron-updater').AppUpdater | null} */
let updater = null;
let updateReady = false;
/** @type {{ version: string, releaseNotes?: string } | null} */
let pendingUpdate = null;

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

function canUseElectronUpdater() {
    try {
        const electronApp = getElectronApp();
        return Boolean(electronApp?.isPackaged) && !isPortableBuild() && process.platform === 'win32';
    } catch {
        return false;
    }
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
    const prefer = assets.find((a) => /setup/i.test(a.name || '') && /\.exe$/i.test(a.name || ''));
    if (prefer) return prefer;
    return assets.find((a) => /\.exe$/i.test(a.name || '') && !/portable/i.test(a.name || '')) || null;
}

function getUpdater() {
    if (updater) return updater;
    if (!canUseElectronUpdater()) return null;
    // Lazy require so unpackaged / portable paths never load native updater deps unnecessarily
    // eslint-disable-next-line global-require
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
        };
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
            releasesUrl: RELEASES_URL,
            transWithAiReleasesUrl: TRANWITHAI_RELEASES_URL,
            message: '无法解析最新版本号',
        };
    }
    const updateAvailable = compareVersions(latestVersion, currentVersion) > 0;
    const setup = pickSetupAsset(release);
    const electronApp = getElectronApp();
    return {
        ok: true,
        currentVersion,
        latestVersion,
        updateAvailable,
        mode: 'github-api',
        releaseName: release.name || `v${latestVersion}`,
        releaseNotes: asString(release.body || '', 8000),
        releasesUrl: release.html_url || RELEASES_URL,
        downloadUrl: setup?.browser_download_url || release.html_url || RELEASES_URL,
        downloadName: setup?.name || '',
        portable: isPortableBuild(),
        packaged: Boolean(electronApp?.isPackaged),
        canAutoInstall: false,
        transWithAiReleasesUrl: TRANWITHAI_RELEASES_URL,
        message: updateAvailable
            ? `发现新版本 v${latestVersion}`
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
            };
        }
        return {
            ok: true,
            currentVersion,
            latestVersion,
            updateAvailable,
            mode: 'electron-updater',
            releaseNotes: pendingUpdate?.releaseNotes || '',
            releasesUrl: RELEASES_URL,
            portable: false,
            packaged: true,
            canAutoInstall: updateAvailable,
            updateReady,
            transWithAiReleasesUrl: TRANWITHAI_RELEASES_URL,
            message: updateAvailable
                ? `发现新版本 v${latestVersion}（可在应用内下载安装）`
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
    if (canUseElectronUpdater()) {
        return checkViaElectronUpdater();
    }
    const result = await checkViaGithubApi();
    if (isPortableBuild()) {
        result.message = result.updateAvailable
            ? `${result.message}。便携版请手动下载安装包覆盖运行。`
            : result.message;
    } else if (!getElectronApp()?.isPackaged) {
        result.message = `${result.message}（开发模式仅检查，不自动安装）`;
    }
    return result;
}

async function downloadAppUpdate() {
    if (!canUseElectronUpdater()) {
        return { ok: false, error: '当前安装方式不支持应用内下载（请使用 NSIS 安装版，或打开 Releases 手动下载）' };
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
            message: '更新已下载，重启后完成安装',
        };
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    }
}

function quitAndInstallUpdate() {
    if (!updateReady || !canUseElectronUpdater()) {
        return { ok: false, error: '没有已下载的更新' };
    }
    const autoUpdater = getUpdater();
    if (!autoUpdater) return { ok: false, error: '更新器不可用' };
    setImmediate(() => {
        autoUpdater.quitAndInstall(false, true);
    });
    return { ok: true };
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
    canUseElectronUpdater,
    checkForAppUpdate,
    downloadAppUpdate,
    quitAndInstallUpdate,
    openUpdateDownload,
};
