/**
 * Windows app update via GitHub + Codeberg Releases (zip-only),
 * with official-site mirrors under https://www.transub.cc/updates/{version}/.
 * - Manifest is block digests only (shell / app / engine / other) — no file list
 * - Prefer delta zip when present; else dirty block zips; else full Transub-*-win.zip
 * - Download probes GitHub / Codeberg / 官网 and picks the fastest reachable URL
 * - Legacy NSIS installs are guided to switch to zip (Setup is no longer published)
 * Code signing is not used (no free Authenticode cert); archives are sha256-verified.
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
const {
    BLOCK_NAMES,
    COMPONENT_NAMES,
    blockZipName,
    deltaZipName,
    manifestAssetName,
    diffManifests,
    shouldUseFullZip,
    pickManifestAsset,
    pickBlockAsset,
    pickComponentAsset,
    pickDeltaAsset,
    tryReadBaseline,
    verifyArchiveSha256,
    readJsonFile,
} = require('./update-manifest-core');
const {
    isAutoUpdateFullZipName,
    standardZipName,
} = require('./release-artifact-names');

const GITHUB_OWNER = 'dlsandy';
const GITHUB_REPO = 'Transub';
const CODEBERG_OWNER = 'flyforyou';
const CODEBERG_REPO = 'Transub';
const RELEASES_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;
const CODEBERG_RELEASES_URL = `https://codeberg.org/${CODEBERG_OWNER}/${CODEBERG_REPO}/releases`;
const LATEST_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
const CODEBERG_LATEST_API = `https://codeberg.org/api/v1/repos/${CODEBERG_OWNER}/${CODEBERG_REPO}/releases/latest`;
const WEBSITE_ORIGIN = 'https://www.transub.cc';
const WEBSITE_UPDATES_BASE = `${WEBSITE_ORIGIN}/updates`;
const TRANWITHAI_RELEASES_URL = 'https://github.com/TransWithAI/Faster-Whisper-TransWithAI-ChickenRice/releases';

let updateReady = false;
/** @type {{
 *   version: string,
 *   releaseNotes?: string,
 *   downloadUrl?: string,
 *   downloadUrls?: string[],
 *   downloadName?: string,
 *   preferredSource?: string,
 *   mode?: 'zip'|'incremental',
 *   manifestUrls?: string[],
 *   manifestName?: string,
 *   deltaUrls?: string[],
 *   deltaName?: string,
 *   componentUrls?: Record<string, string[]>,
 * } | null} */
let pendingUpdate = null;
/** @type {{
 *   version: string,
 *   zipPath?: string,
 *   extractDir: string,
 *   packageRoot: string,
 *   installRoot: string,
 *   preserveRelPaths: string[],
 *   workDir: string,
 *   allowPartial?: boolean,
 *   updateManifest?: object|null,
 *   updateMode?: 'zip'|'incremental',
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
    // NSIS / Setup is no longer published; keep API for tests but always false.
    return false;
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
 * Normalize GitHub / Codeberg release notes into plain text for the UI.
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
 * Official-site update asset URL: /updates/{version}/{fileName}
 * @param {string} version
 * @param {string} fileName
 * @returns {string}
 */
function websiteUpdateAssetUrl(version, fileName) {
    const v = String(version || '').trim().replace(/^v/i, '');
    const name = String(fileName || '').trim().replace(/^\/+/, '');
    if (!v || !name || name.includes('..') || /[\\/]/.test(name)) return '';
    return `${WEBSITE_UPDATES_BASE}/${encodeURIComponent(v)}/${encodeURIComponent(name)}`;
}

function pushUniqueHttpsUrl(list, url) {
    const u = String(url || '').trim();
    if (!u || !/^https:\/\//i.test(u)) return false;
    if (list.includes(u)) return false;
    list.push(u);
    return true;
}

/**
 * Append www.transub.cc/updates/{ver}/… mirrors for probe/download.
 * Only mirrors artifact kinds already discovered on GitHub/Codeberg.
 * @returns {boolean} whether any website URL was added
 */
function appendWebsiteUpdateUrls(state) {
    const version = String(state?.latestVersion || '').trim().replace(/^v/i, '');
    if (!version || !state) return false;
    let added = false;

    if (Array.isArray(state.zipUrls) && state.zipUrls.length) {
        const zipName = String(state.zipName || '').trim() || standardZipName(version);
        if (!state.zipName) state.zipName = zipName;
        added = pushUniqueHttpsUrl(state.zipUrls, websiteUpdateAssetUrl(version, zipName)) || added;
    }

    if (Array.isArray(state.manifestUrls) && state.manifestUrls.length) {
        const manifestName = String(state.manifestName || '').trim() || manifestAssetName(version);
        if (!state.manifestName) state.manifestName = manifestName;
        added = pushUniqueHttpsUrl(state.manifestUrls, websiteUpdateAssetUrl(version, manifestName)) || added;
    }

    if (Array.isArray(state.deltaUrls) && state.deltaUrls.length) {
        const deltaName = String(state.deltaName || '').trim() || deltaZipName(version);
        if (!state.deltaName) state.deltaName = deltaName;
        added = pushUniqueHttpsUrl(state.deltaUrls, websiteUpdateAssetUrl(version, deltaName)) || added;
    }

    for (const block of BLOCK_NAMES) {
        const urls = state.componentUrls?.[block];
        if (!Array.isArray(urls) || !urls.length) continue;
        added = pushUniqueHttpsUrl(urls, websiteUpdateAssetUrl(version, blockZipName(version, block))) || added;
    }
    return added;
}

/**
 * Collect zip / manifest / component asset URLs from GitHub + Codeberg for the same latest version,
 * then append official-site mirrors for download speed probes.
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
    const manifestUrls = [];
    const deltaUrls = [];
    /** @type {Record<string, string[]>} */
    const componentUrls = Object.fromEntries(BLOCK_NAMES.map((c) => [c, []]));
    let zipName = '';
    let manifestName = '';
    let deltaName = '';
    const hosts = [
        { release: github, ver: ghVer },
        { release: codeberg, ver: cbVer },
    ];
    for (const { release, ver } of hosts) {
        if (!release || !ver || compareVersions(ver, latestVersion) !== 0) continue;
        const zip = pickZipAsset(release);
        if (zip?.browser_download_url) {
            zipUrls.push(String(zip.browser_download_url));
            if (!zipName) zipName = String(zip.name || '');
        }
        const manifest = pickManifestAsset(release);
        if (manifest?.browser_download_url) {
            manifestUrls.push(String(manifest.browser_download_url));
            if (!manifestName) manifestName = String(manifest.name || '');
        }
        const delta = pickDeltaAsset(release, latestVersion);
        if (delta?.browser_download_url) {
            deltaUrls.push(String(delta.browser_download_url));
            if (!deltaName) deltaName = String(delta.name || '');
        }
        for (const block of BLOCK_NAMES) {
            const asset = pickBlockAsset(release, block, latestVersion)
                || pickComponentAsset(release, block, latestVersion);
            if (asset?.browser_download_url) {
                componentUrls[block].push(String(asset.browser_download_url));
            }
        }
    }
    for (const block of BLOCK_NAMES) {
        componentUrls[block] = [...new Set(componentUrls[block])];
    }

    const dual = {
        github,
        codeberg,
        latestVersion,
        primaryRelease,
        zipUrls: [...new Set(zipUrls)],
        zipName,
        manifestUrls: [...new Set(manifestUrls)],
        manifestName,
        deltaUrls: [...new Set(deltaUrls)],
        deltaName,
        componentUrls,
        website: false,
        githubError: settled[0].status === 'rejected'
            ? String(settled[0].reason?.message || settled[0].reason || '')
            : '',
        codebergError: settled[1].status === 'rejected'
            ? String(settled[1].reason?.message || settled[1].reason || '')
            : '',
    };
    dual.website = appendWebsiteUpdateUrls(dual);
    return dual;
}

function pickZipAsset(release) {
    const assets = Array.isArray(release?.assets) ? release.assets : [];
    // Prefer English *-win.zip; still accept older Chinese / Win-Standard names.
    const preferred = assets.find((a) => isAutoUpdateFullZipName(a.name) && /(?:^|-)win\.zip$/i.test(String(a.name || '')))
        || assets.find((a) => /Win-标准版\.zip$/i.test(String(a.name || '')))
        || assets.find((a) => /Win-Standard\.zip$/i.test(String(a.name || '')));
    if (preferred) return preferred;
    const full = assets.find((a) => isAutoUpdateFullZipName(a.name));
    if (full) return full;
    return null;
}

async function downloadJsonFromUrls(urls, destPath, downloader) {
    const list = (Array.isArray(urls) ? urls : [])
        .map((u) => String(u || '').trim())
        .filter((u) => /^https:\/\//i.test(u));
    if (!list.length) throw new Error('缺少 update-manifest 下载地址');
    const primary = list[0];
    const extraUrls = list.slice(1);
    await downloader.downloadFile(primary, destPath, {
        extraUrls,
        skipProbe: list.length < 2,
        onProgress: (p) => {
            const phase = String(p.phase || '').trim();
            if (phase === 'probe' || phase === 'retry') {
                emitDownloadProgress({
                    percent: 0,
                    transferred: 0,
                    total: 0,
                    bytesPerSecond: 0,
                    phase,
                    message: String(p.message || '正在获取更新清单…'),
                });
            }
        },
    });
    return readJsonFile(destPath);
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
    const preferredZip = zipUrls[0] || '';
    const zipAuto = Boolean(
        updateAvailable
        && installKind === 'zip'
        && preferredZip
        && /\.zip$/i.test(dual.zipName || preferredZip),
    );
    const incrementalReady = Boolean(
        zipAuto
        && dual.manifestUrls?.length
        && tryReadBaseline(getInstallRootSafe()),
    );

    const releaseNotes = normalizeReleaseNotes(release.body || '');
    const sources = [];
    if (dual.github) sources.push('GitHub');
    if (dual.codeberg) sources.push('Codeberg');
    if (dual.website) sources.push('官网');

    if (zipAuto) {
        pendingUpdate = {
            version: latestVersion,
            releaseNotes,
            downloadUrl: preferredZip,
            downloadUrls: zipUrls,
            downloadName: dual.zipName || '',
            mode: incrementalReady ? 'incremental' : 'zip',
            manifestUrls: dual.manifestUrls || [],
            manifestName: dual.manifestName || '',
            deltaUrls: dual.deltaUrls || [],
            deltaName: dual.deltaName || '',
            componentUrls: dual.componentUrls || {},
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
        websiteUpdatesUrl: `${WEBSITE_UPDATES_BASE}/${encodeURIComponent(latestVersion)}/`,
        downloadUrl: preferredZip || pageUrl,
        downloadUrls: zipUrls,
        downloadName: dual.zipName || '',
        manifestUrls: dual.manifestUrls || [],
        updateSources: sources,
        portable: isPortableBuild(),
        packaged: Boolean(electronApp?.isPackaged),
        canAutoInstall: zipAuto,
        preservesEngineData: zipAuto,
        supportsIncremental: Boolean(dual.manifestUrls?.length),
        incrementalLikely: incrementalReady,
        transWithAiReleasesUrl: TRANWITHAI_RELEASES_URL,
        githubError: dual.githubError || '',
        codebergError: dual.codebergError || '',
        message: updateAvailable
            ? (zipAuto
                ? (incrementalReady
                    ? `发现新版本 v${latestVersion}（将按区块摘要增量更新；已下载的模型、支持库与 Advanced LLM 会保留）`
                    : `发现新版本 v${latestVersion}（将测速 GitHub / Codeberg / 官网后下载；已下载的模型、支持库与 Advanced LLM 会保留）`)
                : `发现新版本 v${latestVersion}`)
            : `已是最新版本 v${currentVersion}`,
    };
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
    const result = await checkViaGithubApi();
    if (installKind === 'nsis') {
        result.canAutoInstall = false;
        result.preservesEngineData = false;
        result.message = result.updateAvailable
            ? `${result.message}。Setup/NSIS 安装版已停更，请改用 Releases 中的 zip 解压版后即可应用内增量更新。`
            : `${result.message}（当前为旧版 Setup 安装；新版本请改用 zip 解压版）`;
        pendingUpdate = null;
    } else if (installKind === 'portable') {
        result.message = result.updateAvailable
            ? `${result.message}。便携版已停更，请改用 zip 解压版。`
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

function emitDownloaderProgress(downloader, downloadUrl, preferredSourceRef, p) {
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
            preferredSourceRef.value = downloader.downloadSourceLabel(
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
        message: preferredSourceRef.value
            ? `正在从 ${preferredSourceRef.value} 下载…`
            : (message || ''),
    });
}

async function finalizePendingZipPackage({
    version,
    workDir,
    extractDir,
    packageRoot,
    zipPath,
    downloadUrl,
    extraUrls,
    zipName,
    preferredSource,
    updateManifest,
    allowPartial,
    updateMode,
}) {
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
        allowPartial: Boolean(allowPartial),
        updateManifest: updateManifest || null,
        updateMode: updateMode || 'zip',
    };
    pendingUpdate = {
        ...(pendingUpdate || {}),
        version,
        downloadUrl,
        downloadUrls: [downloadUrl, ...extraUrls].filter(Boolean),
        downloadName: zipName,
        preferredSource,
        mode: updateMode || 'zip',
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

    const modeLabel = updateMode === 'incremental' ? '增量更新' : '更新';
    return {
        ok: true,
        updateReady: true,
        version,
        mode: updateMode || 'zip',
        preferredSource,
        preservesEngineData: true,
        preservedCount: preserveRelPaths.length,
        incremental: updateMode === 'incremental',
        message: preserveRelPaths.length
            ? `${modeLabel}已下载${preferredSource ? `（${preferredSource}）` : ''}，重启后完成安装（将保留已下载的模型、支持库与 Advanced LLM）`
            : `${modeLabel}已下载${preferredSource ? `（${preferredSource}）` : ''}，重启后完成安装`,
    };
}

async function downloadFullZipUpdate({
    downloadUrl,
    downloadUrls,
    version,
    downloadName,
    updateManifest,
}) {
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

    emitDownloadProgress({
        percent: 0,
        transferred: 0,
        total: 0,
        bytesPerSecond: 0,
        phase: 'probe',
        message: extraUrls.length
            ? '正在测速 GitHub / Codeberg / 官网下载源…'
            : '正在准备下载全量更新包…',
    });

    const preferredSourceRef = { value: '' };
    await downloader.downloadFile(downloadUrl, zipPath, {
        extraUrls,
        onProgress: (p) => emitDownloaderProgress(downloader, downloadUrl, preferredSourceRef, p),
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
    let manifest = updateManifest || null;
    if (!manifest) {
        const embedded = path.join(packageRoot, 'resources', 'update-manifest.json');
        if (fs.existsSync(embedded)) {
            try { manifest = readJsonFile(embedded); } catch { /* ignore */ }
        }
    }

    return finalizePendingZipPackage({
        version,
        workDir,
        extractDir,
        packageRoot,
        zipPath,
        downloadUrl,
        extraUrls,
        zipName,
        preferredSource: preferredSourceRef.value,
        updateManifest: manifest,
        allowPartial: false,
        updateMode: 'zip',
    });
}

async function downloadDeltaUpdate({
    version,
    deltaUrls,
    updateManifest,
    fullZipFallback,
}) {
    const downloader = require('./advanced-llm-download');
    clearPendingZipArtifacts();

    const urls = (Array.isArray(deltaUrls) ? deltaUrls : [])
        .map((u) => String(u || '').trim())
        .filter((u) => /^https:\/\//i.test(u));
    if (!urls.length) throw new Error('缺少 delta 增量包下载地址');

    const workDir = path.join(os.tmpdir(), `transub-zip-update-${process.pid}-${Date.now()}`);
    const extractDir = path.join(workDir, 'extract');
    fs.mkdirSync(workDir, { recursive: true });
    fs.mkdirSync(extractDir, { recursive: true });

    try {
        const preferredSourceRef = { value: '' };
        const downloadUrl = urls[0];
        const extraUrls = urls.slice(1);
        const zipName = `Transub-${version}-win-delta.zip`;
        const zipPath = path.join(workDir, zipName);
        emitDownloadProgress({
            percent: 5,
            transferred: 0,
            total: 0,
            bytesPerSecond: 0,
            phase: 'download',
            message: '正在下载变更文件增量包…',
        });
        await downloader.downloadFile(downloadUrl, zipPath, {
            extraUrls,
            onProgress: (p) => emitDownloaderProgress(downloader, downloadUrl, preferredSourceRef, p),
        });
        emitDownloadProgress({
            percent: 90,
            transferred: 0,
            total: 0,
            bytesPerSecond: 0,
            phase: 'preparing',
            message: '正在校验增量包…',
        });
        verifyArchiveSha256(zipPath, updateManifest?.deltaSha256 || '');
        emitDownloadProgress({
            percent: 92,
            transferred: 0,
            total: 0,
            bytesPerSecond: 0,
            phase: 'extracting',
            message: '增量包校验通过，正在解压…',
        });
        downloader.extractArchive(zipPath, extractDir, 'zip');

        let packageRoot = extractDir;
        if (fs.existsSync(path.join(extractDir, 'Transub.exe'))) {
            packageRoot = extractDir;
        } else {
            try {
                packageRoot = findPackageRoot(extractDir);
            } catch {
                packageRoot = extractDir;
            }
        }

        emitDownloadProgress({
            percent: 96,
            transferred: 0,
            total: 0,
            bytesPerSecond: 0,
            phase: 'preparing',
            message: '正在准备安装（扫描需保留的模型与支持库）…',
        });

        return await finalizePendingZipPackage({
            version,
            workDir,
            extractDir,
            packageRoot,
            zipPath,
            downloadUrl,
            extraUrls,
            zipName,
            preferredSource: preferredSourceRef.value,
            updateManifest,
            allowPartial: true,
            updateMode: 'incremental',
        });
    } catch (err) {
        clearPendingZipArtifacts();
        if (fullZipFallback) {
            console.warn('[app-updater] delta failed, falling back to full zip:', err?.message || err);
            emitDownloadProgress({
                percent: 0,
                transferred: 0,
                total: 0,
                bytesPerSecond: 0,
                phase: 'retry',
                message: `增量更新不可用，改为全量下载…（${err.message || err}）`,
            });
            return downloadFullZipUpdate(fullZipFallback);
        }
        throw err;
    }
}

async function downloadIncrementalUpdate({
    version,
    manifestUrls,
    componentUrls,
    dirtyBlocks,
    updateManifest,
    fullZipFallback,
}) {
    const downloader = require('./advanced-llm-download');
    clearPendingZipArtifacts();

    const blocks = Array.isArray(dirtyBlocks) ? dirtyBlocks : [];
    const workDir = path.join(os.tmpdir(), `transub-zip-update-${process.pid}-${Date.now()}`);
    const extractDir = path.join(workDir, 'extract');
    fs.mkdirSync(workDir, { recursive: true });
    fs.mkdirSync(extractDir, { recursive: true });

    try {
        const preferredSourceRef = { value: '' };
        let lastUrl = '';
        for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i];
            const urls = Array.isArray(componentUrls?.[block]) ? componentUrls[block] : [];
            if (!urls.length) {
                throw new Error(`缺少区块包 ${block}，回退全量更新`);
            }
            const downloadUrl = urls[0];
            lastUrl = downloadUrl;
            const extraUrls = urls.slice(1);
            const zipName = `Transub-${version}-win-${block}.zip`;
            const zipPath = path.join(workDir, zipName);
            emitDownloadProgress({
                percent: Math.round((i / Math.max(1, blocks.length)) * 80),
                transferred: 0,
                total: 0,
                bytesPerSecond: 0,
                phase: 'download',
                message: `正在下载区块 ${block}（${i + 1}/${blocks.length}）…`,
            });
            await downloader.downloadFile(downloadUrl, zipPath, {
                extraUrls,
                onProgress: (p) => emitDownloaderProgress(downloader, downloadUrl, preferredSourceRef, p),
            });
            const expectSha = String(updateManifest?.blocks?.[block]?.sha256 || '');
            verifyArchiveSha256(zipPath, expectSha);
            downloader.extractArchive(zipPath, extractDir, 'zip');
        }

        emitDownloadProgress({
            percent: 92,
            transferred: 0,
            total: 0,
            bytesPerSecond: 0,
            phase: 'preparing',
            message: '区块包已校验，正在准备安装…',
        });

        let packageRoot = extractDir;
        if (fs.existsSync(path.join(extractDir, 'Transub.exe'))) {
            packageRoot = extractDir;
        } else {
            try {
                packageRoot = findPackageRoot(extractDir);
            } catch {
                packageRoot = extractDir;
            }
        }

        emitDownloadProgress({
            percent: 96,
            transferred: 0,
            total: 0,
            bytesPerSecond: 0,
            phase: 'preparing',
            message: '正在准备安装（扫描需保留的模型与支持库）…',
        });

        return await finalizePendingZipPackage({
            version,
            workDir,
            extractDir,
            packageRoot,
            zipPath: '',
            downloadUrl: lastUrl || (manifestUrls && manifestUrls[0]) || '',
            extraUrls: [],
            zipName: `blocks-${version}.zip`,
            preferredSource: preferredSourceRef.value,
            updateManifest,
            allowPartial: true,
            updateMode: 'incremental',
        });
    } catch (err) {
        clearPendingZipArtifacts();
        if (fullZipFallback) {
            console.warn('[app-updater] block incremental failed, falling back to full zip:', err?.message || err);
            emitDownloadProgress({
                percent: 0,
                transferred: 0,
                total: 0,
                bytesPerSecond: 0,
                phase: 'retry',
                message: `增量更新不可用，改为全量下载…（${err.message || err}）`,
            });
            return downloadFullZipUpdate(fullZipFallback);
        }
        throw err;
    }
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
    let manifestUrls = Array.isArray(pendingUpdate?.manifestUrls)
        ? pendingUpdate.manifestUrls.map((u) => String(u || '').trim()).filter(Boolean)
        : [];
    let deltaUrls = Array.isArray(pendingUpdate?.deltaUrls)
        ? pendingUpdate.deltaUrls.map((u) => String(u || '').trim()).filter(Boolean)
        : [];
    let componentUrls = pendingUpdate?.componentUrls || {};

    const looksLikeZip = /\.zip(\?|#|$)/i.test(downloadUrl) || /\.zip$/i.test(downloadName);
    if (!downloadUrl || !looksLikeZip) {
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
        manifestUrls = Array.isArray(check.manifestUrls)
            ? check.manifestUrls.map((u) => String(u || '').trim()).filter(Boolean)
            : [];
        deltaUrls = Array.isArray(pendingUpdate?.deltaUrls)
            ? pendingUpdate.deltaUrls.map((u) => String(u || '').trim()).filter(Boolean)
            : [];
        componentUrls = pendingUpdate?.componentUrls || {};
    }

    if (!downloadUrl || !/^https:\/\//i.test(downloadUrl)) {
        return { ok: false, error: '缺少有效的 zip 下载地址' };
    }

    const fullZipFallback = {
        downloadUrl,
        downloadUrls,
        version,
        downloadName,
        updateManifest: null,
    };

    try {
        const installRoot = getInstallRootSafe();
        const baseline = tryReadBaseline(installRoot);
        const downloader = require('./advanced-llm-download');

        if (manifestUrls.length && baseline) {
            emitDownloadProgress({
                percent: 0,
                transferred: 0,
                total: 0,
                bytesPerSecond: 0,
                phase: 'probe',
                message: '正在获取区块更新清单…',
            });
            const workDir = path.join(os.tmpdir(), `transub-manifest-${process.pid}-${Date.now()}`);
            fs.mkdirSync(workDir, { recursive: true });
            const manifestPath = path.join(workDir, 'update-manifest.json');
            try {
                const remoteManifest = await downloadJsonFromUrls(manifestUrls, manifestPath, downloader);
                fullZipFallback.updateManifest = remoteManifest;
                const diff = diffManifests(baseline, remoteManifest);
                const dirtyBlocks = Array.isArray(diff.dirtyBlocks) ? diff.dirtyBlocks : diff.dirtyComponents;
                const useFull = shouldUseFullZip(diff, remoteManifest.fullZipBytes || 0, {
                    hasBaseline: true,
                    deltaZipBytes: Number(remoteManifest.deltaZipBytes) || 0,
                    remoteManifest,
                });
                if (!useFull && dirtyBlocks.length) {
                    const hasDelta = deltaUrls.length > 0
                        && Number(remoteManifest.deltaZipBytes) > 0;
                    if (hasDelta) {
                        return await downloadDeltaUpdate({
                            version: version || remoteManifest.version,
                            deltaUrls,
                            updateManifest: remoteManifest,
                            fullZipFallback,
                        });
                    }

                    const missingBlock = dirtyBlocks.some(
                        (c) => !Array.isArray(componentUrls?.[c]) || !componentUrls[c].length,
                    );
                    if (!missingBlock) {
                        return await downloadIncrementalUpdate({
                            version: version || remoteManifest.version,
                            manifestUrls,
                            componentUrls,
                            dirtyBlocks,
                            updateManifest: remoteManifest,
                            fullZipFallback,
                        });
                    }
                }
            } catch (err) {
                console.warn('[app-updater] manifest/incremental planning failed:', err?.message || err);
            } finally {
                try { rimrafSafe(workDir); } catch { /* ignore */ }
            }
        }

        return await downloadFullZipUpdate(fullZipFallback);
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
    if (installKind === 'nsis') {
        return {
            ok: false,
            error: 'Setup/NSIS 安装版已停更，请打开 Releases 下载 zip 解压版',
        };
    }
    return {
        ok: false,
        error: '当前安装方式不支持应用内下载（请使用 zip 解压版，或打开 Releases 手动下载）',
    };
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
        allowPartial: Boolean(meta.allowPartial),
        updateManifest: meta.updateManifest || null,
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
    if (
        pendingZipUpdate
        && updateReady
        && (pendingUpdate?.mode === 'zip' || pendingUpdate?.mode === 'incremental')
    ) {
        return quitAndInstallZipUpdate();
    }
    return { ok: false, error: '没有已下载的更新' };
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
    WEBSITE_ORIGIN,
    WEBSITE_UPDATES_BASE,
    websiteUpdateAssetUrl,
    appendWebsiteUpdateUrls,
    compareVersions,
    normalizeReleaseNotes,
    releaseVersion,
    getCurrentVersion,
    isPortableBuild,
    getInstallKind,
    canUseElectronUpdater,
    canAutoInstallZip,
    pickZipAsset,
    isAutoUpdateFullZipName,
    checkForAppUpdate,
    downloadAppUpdate,
    quitAndInstallUpdate,
    openUpdateDownload,
    setUpdateProgressListener,
    getPendingUpdate,
    isUpdateReady,
    fetchDualHostLatestReleases,
};
