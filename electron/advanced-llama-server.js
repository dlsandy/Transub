/**
 * llama-server 运行时安装与进程生命周期
 */
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const catalog = require('../src/js/advanced-managed-llm-catalog-core');
const llamaTuning = require('../src/js/llama-server-tuning-core');
const llmFs = require('./advanced-llm-fs');
const downloader = require('./advanced-llm-download');
const cudaScan = require('./cuda-runtime-scan');
const { asPlainObject } = require('./ipc-validate');
const { createLlmPortReclaim } = require('./llm-port-reclaim');

const llmPortReclaim = createLlmPortReclaim();

/**
 * Optional engine / nearby / Python nvidia roots so pip wheels & prior installs
 * can supply cudart without re-downloading.
 * @returns {string[]}
 */
function resolveCudaScanExtraRoots() {
    /** @type {string[]} */
    const engineRoots = [];
    let writableRoot = '';
    /** @type {string[]} */
    const startDirs = [];
    try {
        const {
            getBundledEnginePath,
            getBundledEnginePathIfPresent,
            getWritableRoot,
            getInstallRoot,
        } = require('./app-paths');
        const bundled = (typeof getBundledEnginePathIfPresent === 'function'
            ? getBundledEnginePathIfPresent()
            : '') || (typeof getBundledEnginePath === 'function' ? getBundledEnginePath() : '');
        if (bundled) engineRoots.push(bundled);
        try {
            writableRoot = typeof getWritableRoot === 'function' ? getWritableRoot() : '';
        } catch (_) { /* ignore */ }
        try {
            if (typeof getInstallRoot === 'function') startDirs.push(getInstallRoot());
        } catch (_) { /* ignore */ }
        if (writableRoot) startDirs.push(writableRoot);
        if (bundled) startDirs.push(bundled);
    } catch (_) { /* ignore */ }
    try {
        const llmFs = require('./advanced-llm-fs');
        const rt = typeof llmFs.getRuntimeDir === 'function' ? llmFs.getRuntimeDir() : '';
        if (rt) startDirs.push(rt);
    } catch (_) { /* ignore */ }
    return cudaScan.discoverCudaExtraRoots({
        engineRoots,
        writableRoot,
        startDirs,
    });
}

/**
 * Prefer Transub-owned companion; else whitelist-scan the machine and copy into keepDir.
 * @returns {{ reused: boolean, fromSystem: boolean, sourceLabel: string }}
 */
function tryPreserveOrScanCompanion(pkg, meta, runtimeDir, keepDir, opts = {}) {
    let reuseCompanion = canReuseInstalledCompanion(pkg, meta, runtimeDir, opts);
    if (reuseCompanion) {
        const kept = preserveCompanionArtifacts(runtimeDir, keepDir);
        reuseCompanion = !!(kept.ok && kept.files.length);
        if (reuseCompanion) {
            return { reused: true, fromSystem: false, sourceLabel: '本机已装运行时' };
        }
    }

    if (opts.reinstall || opts.forceCompanion) {
        return { reused: false, fromSystem: false, sourceLabel: '' };
    }
    if (!pkg?.companionUrl) {
        return { reused: false, fromSystem: false, sourceLabel: '' };
    }

    const major = resolveCompanionCudaMajor(resolveCompanionId(pkg), pkg.id);
    if (!major) return { reused: false, fromSystem: false, sourceLabel: '' };

    const result = cudaScan.tryReuseSystemCudaCompanion({
        major,
        destDir: keepDir,
        extraRoots: resolveCudaScanExtraRoots(),
    });
    if (result.ok && result.files?.length) {
        return {
            reused: true,
            fromSystem: true,
            sourceLabel: result.best?.label || '本机 CUDA 运行库',
        };
    }
    return { reused: false, fromSystem: false, sourceLabel: '' };
}

/** @type {import('child_process').ChildProcess | null} */
let serverProc = null;
/** @type {{ modelId: string, port: number, baseUrl: string } | null} */
let serverState = null;
/** @type {'local'|'engine'} */
let llmOwner = 'local';
/** @type {string} */
let delegatedEngineUrl = '';
/** @type {boolean|null} cached capabilities.features.llmServer */
let engineLlmSupportedCache = null;
let installAbort = null;
const IDLE_STOP_MS = 5 * 60 * 1000;
/** @type {ReturnType<typeof setTimeout> | null} */
let idleStopTimer = null;
/** @type {{ exePath: string, mtimeMs: number, size: number, tag: string } | null} */
let probedTagCache = null;
/** Last stderr/stdout snippet from llama-server (for crash diagnostics). */
let lastServerLogTail = '';

function resolveEngineUrlForLlm(opts = {}) {
    let url = String(opts.engineUrl || '').trim().replace(/\/+$/, '');
    if (!url) {
        try {
            url = String(require('./engine-options').DEFAULT_ENGINE_URL || '').trim().replace(/\/+$/, '');
        } catch (_) { /* ignore */ }
    }
    return url;
}

/**
 * @param {object} opts
 * @returns {Promise<string>} engine base URL when llmServer is available, else ''
 */
async function resolveEngineLlmBaseUrl(opts = {}) {
    if (opts.preferEngine === false || opts.forceLocal === true) return '';
    const url = resolveEngineUrlForLlm(opts);
    if (!url) return '';
    if (engineLlmSupportedCache === false) return '';
    if (engineLlmSupportedCache === true) return url;
    try {
        const ok = await require('./engine-llm-client').engineSupportsLlmServer(url);
        engineLlmSupportedCache = !!ok;
        return ok ? url : '';
    } catch {
        engineLlmSupportedCache = false;
        return '';
    }
}

function markLlmOwnedByEngine(engineUrl, state) {
    llmOwner = 'engine';
    delegatedEngineUrl = String(engineUrl || '').replace(/\/+$/, '');
    serverProc = null;
    serverState = state || null;
}

function markLlmOwnedLocal() {
    llmOwner = 'local';
    delegatedEngineUrl = '';
}

function getLastServerLogTail(maxLen = 800) {
    const n = Math.max(80, Math.min(4000, Number(maxLen) || 800));
    return String(lastServerLogTail || '').slice(-n);
}

/**
 * 从 llama-server --version 输出解析构建号（如 b10077）。
 * @param {string} text
 * @returns {string}
 */
function parseLlamaCppTag(text) {
    const s = String(text || '');
    // v0.3.0+ / v0.4.0+ semver output: "version: 0.4.0 (build 10819, commit …)"
    const buildTagged = s.match(/\bbuild\s+(\d{4,})\b/i);
    if (buildTagged) return `b${buildTagged[1]}`;
    const numbered = s.match(/\bversion:\s*(\d+)\b/i);
    // Reject truncated/garbage probes (e.g. "version: 0") — real llama.cpp builds are 4+ digits.
    if (numbered && /^\d{4,}$/.test(numbered[1])) return `b${numbered[1]}`;
    const tagged = s.match(/\b(b\d{4,})\b/i);
    return tagged ? `b${tagged[1].slice(1)}` : '';
}

/**
 * 探测本机 llama-server 可执行文件真实构建号。
 * @param {string} exePath
 * @returns {string}
 */
function probeLlamaServerTag(exePath) {
    const exe = String(exePath || '').trim();
    if (!exe || !fs.existsSync(exe)) return '';
    try {
        const st = fs.statSync(exe);
        if (
            probedTagCache
            && probedTagCache.exePath === exe
            && probedTagCache.mtimeMs === st.mtimeMs
            && probedTagCache.size === st.size
            && probedTagCache.tag
        ) {
            return probedTagCache.tag;
        }
        const r = spawnSync(exe, ['--version'], {
            encoding: 'utf8',
            // Keep short: CUDA builds may load drivers; long hangs freeze the whole app.
            timeout: 2500,
            windowsHide: true,
        });
        const tag = parseLlamaCppTag(`${r.stdout || ''}\n${r.stderr || ''}`);
        if (tag) {
            probedTagCache = {
                exePath: exe,
                mtimeMs: st.mtimeMs,
                size: st.size,
                tag,
            };
        }
        return tag;
    } catch (_) {
        return '';
    }
}

/**
 * 已安装构建号：优先缓存 / runtime.json，避免每次 spawnSync llama-server --version
 *（CUDA 构建冷启动可卡主进程数秒，表现为整应用假死）。
 * @param {string} [exePath]
 * @param {object|null} [meta]
 * @param {{ forceProbe?: boolean }} [opts]
 */
function resolveInstalledRuntimeTag(exePath = '', meta = null, opts = {}) {
    const forceProbe = !!opts.forceProbe;
    const exe = String(exePath || '').trim();
    if (!forceProbe && exe && fs.existsSync(exe) && probedTagCache) {
        try {
            const st = fs.statSync(exe);
            if (
                probedTagCache.exePath === exe
                && probedTagCache.mtimeMs === st.mtimeMs
                && probedTagCache.size === st.size
                && probedTagCache.tag
            ) {
                return probedTagCache.tag;
            }
        } catch (_) { /* ignore */ }
    }
    if (!forceProbe) {
        const metaTag = String(meta?.probedTag || meta?.tag || '').trim();
        if (metaTag) return metaTag;
        // Do not spawn llama-server for a version string. Loading unsigned
        // ggml / CUDA DLLs under Smart App Control / WDAC can freeze Windows
        // (Code Integrity 3077 on ggml-cpu-*.dll / llama-server.exe).
        return '';
    }
    return probeLlamaServerTag(exe);
}

function clearIdleStopTimer() {
    if (idleStopTimer) {
        clearTimeout(idleStopTimer);
        idleStopTimer = null;
    }
    if (llmOwner === 'engine' && delegatedEngineUrl) {
        try {
            require('./engine-llm-client')
                .scheduleLlmIdleStop(delegatedEngineUrl, { cancel: true })
                .catch(() => { /* ignore */ });
        } catch (_) { /* ignore */ }
    }
}

function scheduleIdleStop(delayMs = IDLE_STOP_MS) {
    const delay = Math.max(0, Number(delayMs) || IDLE_STOP_MS);
    clearIdleStopTimer();
    if (llmOwner === 'engine' && delegatedEngineUrl) {
        try {
            require('./engine-llm-client')
                .scheduleLlmIdleStop(delegatedEngineUrl, { delayMs: delay })
                .catch(() => { /* ignore */ });
        } catch (_) { /* ignore */ }
        return;
    }
    idleStopTimer = setTimeout(() => {
        idleStopTimer = null;
        void stopLlamaServerAsync().catch(() => {});
    }, delay);
}

function sendProgress(onProgress, info) {
    if (typeof onProgress === 'function') {
        try { onProgress(info); } catch (_) { /* ignore */ }
    }
}

function getServerBaseUrl(port) {
    const p = Number(port) || catalog.DEFAULT_SERVER_PORT;
    return `http://127.0.0.1:${p}/v1`;
}

async function fetchOk(url, { timeoutMs = 3000 } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { method: 'GET', signal: controller.signal });
        return res.ok;
    } catch (_) {
        return false;
    } finally {
        clearTimeout(timer);
    }
}

async function isServerHealthy(port) {
    const p = Number(port) || catalog.DEFAULT_SERVER_PORT;
    if (await fetchOk(`http://127.0.0.1:${p}/health`, { timeoutMs: 2500 })) return true;
    if (await fetchOk(`http://127.0.0.1:${p}/v1/models`, { timeoutMs: 2500 })) return true;
    return false;
}

function runtimePreferHints() {
    try {
        return require('./advanced-runtime-prefer').getHints();
    } catch (_) {
        return {};
    }
}

/**
 * 解析偏好运行时包 id：显式参数 → 高级设置 → 硬件默认（NVIDIA→CUDA / AMD→ROCm，否则 Vulkan）。
 * @param {string} [explicit]
 */
function resolvePreferredRuntimeId(explicit = '') {
    const hints = runtimePreferHints();
    const fromOpt = String(explicit || '').trim();
    if (fromOpt) {
        const pkg = catalog.getRuntimePackage(process.platform, process.arch, fromOpt, hints);
        if (pkg) return pkg.id;
    }
    try {
        const { readAdvancedDoc } = require('./advanced-license-data');
        const managed = catalog.normalizeManagedLlm(readAdvancedDoc().doc?.managedLlm, hints);
        if (managed.runtimeId) {
            const pkg = catalog.getRuntimePackage(
                process.platform,
                process.arch,
                managed.runtimeId,
                hints,
            );
            if (pkg) return pkg.id;
        }
    } catch (_) { /* ignore */ }
    return catalog.getDefaultRuntimeId(process.platform, process.arch, hints)
        || catalog.getRuntimePackage(process.platform, process.arch, '', hints)?.id
        || '';
}

/**
 * 按硬件把 managedLlm.runtimeId 默认设为匹配后端（CUDA 13/12 或 ROCm）。
 * 有 NVIDIA + CUDA≥12 或 AMD 时写入；无独显不改动。
 * @param {{ force?: boolean, gpuInfo?: object|null }} [opts]
 * @returns {{ ok: boolean, skipped?: boolean, already?: boolean, runtimeId?: string, previousId?: string, reason?: string }}
 */
function syncRuntimePreferenceToHardware(opts = {}) {
    const options = asPlainObject(opts);
    try {
        const prefer = require('./advanced-runtime-prefer');
        if (options.gpuInfo) {
            prefer.applyGpuInfo(options.gpuInfo);
        } else if (!prefer.getHints().ready) {
            // Sync callers (env-check) usually pass gpuInfo; otherwise use cached hints.
        }
        const hints = prefer.getHints();
        const recommended = catalog.getDefaultRuntimeId(process.platform, process.arch, hints);
        const wantCuda = !!(hints.preferCuda && recommended && /^win-cuda\d+-x64$/i.test(recommended));
        const wantRocm = !!(hints.preferRocm && recommended && /rocm/i.test(recommended));
        if (!wantCuda && !wantRocm) {
            return { ok: true, skipped: true, reason: hints.preferCuda || hints.preferRocm ? 'no_recommended' : 'no_accel' };
        }

        const { readAdvancedDoc, writeAdvancedDoc } = require('./advanced-license-data');
        const read = readAdvancedDoc();
        const doc = read.doc;
        const managed = catalog.normalizeManagedLlm(doc?.managedLlm, hints);
        const previousId = String(managed.runtimeId || '').trim();
        if (previousId === recommended) {
            return { ok: true, already: true, runtimeId: recommended, previousId };
        }

        const isAccelPkg = wantCuda
            ? /^win-cuda\d+-x64$/i.test(previousId)
            : /rocm/i.test(previousId);
        // Soft sync: fill empty preference or correct same-family mismatch (CUDA 12↔13 / ROCm).
        // force: also replace Vulkan / other backends (wizard / one-click install).
        if (!options.force && previousId && !isAccelPkg) {
            return { ok: true, skipped: true, reason: 'user_backend', previousId, runtimeId: previousId };
        }

        const saved = writeAdvancedDoc({
            ...doc,
            managedLlm: { ...managed, runtimeId: recommended },
        });
        if (!saved.ok) {
            return { ok: false, error: saved.error || 'write_failed', runtimeId: recommended, previousId };
        }
        return { ok: true, runtimeId: recommended, previousId };
    } catch (err) {
        return { ok: false, error: err?.message || String(err) };
    }
}

function getRuntimeStatus(options = {}) {
    const opts = asPlainObject(options);
    const hints = runtimePreferHints();
    const preferredId = resolvePreferredRuntimeId(opts.runtimeId || opts.packageId);
    const pkg = catalog.getRuntimePackage(process.platform, process.arch, preferredId, hints);
    const meta = llmFs.readRuntimeMeta();
    const exe = llmFs.resolveServerExe(meta);
    const installed = !!exe && fs.existsSync(exe);
    const installedId = String(meta?.packageId || '').trim();
    const catalogTag = catalog.LLAMA_CPP_TAG;
    const installedTag = installed ? resolveInstalledRuntimeTag(exe, meta) : '';
    // Outdated only when installed build is older than Transub recommended pin.
    // Installing 「官方最新」 (newer than pin) must not be flagged as outdated.
    const installedBuild = Number(String(installedTag || '').replace(/^b/i, ''));
    const catalogBuild = Number(String(catalogTag || '').replace(/^b/i, ''));
    const outdated = !!(
        installed
        && installedTag
        && Number.isFinite(installedBuild)
        && Number.isFinite(catalogBuild)
        && installedBuild < catalogBuild
    );
    const mismatch = !!(installed && preferredId && installedId && installedId !== preferredId);
    const choices = catalog.listRuntimePackages(process.platform, process.arch, hints);
    let message = !pkg
        ? `当前平台暂不支持内置运行时（${process.platform}-${process.arch}）`
        : (installed
            ? `llama-server 已就绪（${installedTag || catalogTag}${installedId ? ` · ${installedId}` : ''}）`
            : `尚未安装运行时（llama.cpp ${catalogTag} · ${pkg.label}）`);
    if (outdated) {
        message = `${message} · 可更新至建议版 ${catalogTag}`;
    }
    if (mismatch) {
        const preferLabel = pkg?.label || preferredId;
        const installedLabel = meta?.label || installedId;
        message = `${message} · 偏好「${preferLabel}」，当前为「${installedLabel}」，请重新安装运行时`;
    }

    /** @type {object|null} */
    let systemCompanion = null;
    if (pkg?.companionUrl && process.platform === 'win32') {
        const major = resolveCompanionCudaMajor(resolveCompanionId(pkg), pkg.id);
        if (major) {
            try {
                const scan = cudaScan.scanReusableCudaRuntimes({
                    major,
                    extraRoots: resolveCudaScanExtraRoots(),
                });
                if (scan.best) {
                    systemCompanion = {
                        found: true,
                        major: scan.major,
                        label: scan.best.label,
                        source: scan.best.source,
                        fileCount: scan.best.fileCount,
                    };
                    if (!installed) {
                        message = `${message} · 可复用本机「${scan.best.label}」，安装时将跳过 cudart 下载`;
                    }
                } else {
                    systemCompanion = { found: false, major: scan.major };
                }
            } catch (_) {
                systemCompanion = null;
            }
        }
    }

    return {
        kind: 'llama-server',
        supported: !!pkg,
        package: pkg,
        preferredPackageId: preferredId || pkg?.id || '',
        installedPackageId: installedId,
        mismatch,
        outdated,
        choices,
        installed,
        exePath: installed ? exe : '',
        meta,
        tag: catalogTag,
        installedTag: installedTag || '',
        message,
        systemCompanion,
    };
}

function cancelRuntimeInstall() {
    if (installAbort) {
        try { installAbort.abort(); } catch (_) { /* ignore */ }
        installAbort = null;
        return { ok: true, cancelled: true };
    }
    return { ok: true, cancelled: false };
}

function flattenStagingRoot(staging) {
    const stagedEntries = fs.readdirSync(staging);
    let sourceRoot = staging;
    if (stagedEntries.length === 1) {
        const only = path.join(staging, stagedEntries[0]);
        if (fs.statSync(only).isDirectory()) sourceRoot = only;
    }
    return sourceRoot;
}

/**
 * Stable cudart package id (independent of llama.cpp tag).
 * e.g. cudart-llama-bin-win-cuda-13.4-x64
 * @param {object|string|null|undefined} pkgOrUrl
 * @returns {string}
 */
function resolveCompanionId(pkgOrUrl) {
    const url = typeof pkgOrUrl === 'string'
        ? pkgOrUrl
        : String(pkgOrUrl?.companionUrl || pkgOrUrl?.companionId || '');
    const m = String(url).match(/(cudart[^/\\]*?win-cuda-[\d.]+-x64)/i);
    return m ? m[1].toLowerCase() : '';
}

/**
 * @param {string} companionId
 * @param {string} [packageId]
 * @returns {number}
 */
function resolveCompanionCudaMajor(companionId = '', packageId = '') {
    const fromCompanion = /cuda-(\d+)/i.exec(String(companionId || ''));
    if (fromCompanion) return Number(fromCompanion[1]) || 0;
    const fromPkg = /win-cuda(\d+)/i.exec(String(packageId || ''));
    return fromPkg ? (Number(fromPkg[1]) || 0) : 0;
}

/** CUDA companion zip artifacts only (not ggml-cuda.dll from the main package). */
function isCompanionArtifactName(name) {
    return /^(cudart|cublasLt|cublas)/i.test(String(name || ''));
}

/**
 * @param {string} runtimeDir
 * @returns {string[]} absolute paths
 */
function listCompanionArtifacts(runtimeDir) {
    const root = String(runtimeDir || '').trim();
    if (!root || !fs.existsSync(root)) return [];
    /** @type {string[]} */
    const out = [];
    const walk = (dir, depth) => {
        if (depth > 3) return;
        let names = [];
        try { names = fs.readdirSync(dir); } catch (_) { return; }
        for (const name of names) {
            const abs = path.join(dir, name);
            let st;
            try { st = fs.statSync(abs); } catch (_) { continue; }
            if (st.isDirectory()) {
                walk(abs, depth + 1);
                continue;
            }
            if (st.isFile() && isCompanionArtifactName(name)) out.push(abs);
        }
    };
    walk(root, 0);
    return out;
}

/**
 * @param {string} runtimeDir
 * @param {string} companionId
 * @param {string} [packageId]
 * @returns {boolean}
 */
function hasReusableCompanion(runtimeDir, companionId = '', packageId = '') {
    const major = resolveCompanionCudaMajor(companionId, packageId);
    if (!major) return false;
    const marker = `cudart64_${major}.dll`;
    if (llmFs.findFileRecursive(runtimeDir, marker, 4)) return true;
    try {
        return fs.existsSync(path.join(runtimeDir, marker));
    } catch (_) {
        return false;
    }
}

/**
 * Whether an existing CUDA runtime library can be kept when updating llama.cpp.
 * Same CUDA flavor (12.4 / 13.x) + marker DLLs present → skip cudart re-download.
 * @param {object|null|undefined} pkg
 * @param {object|null|undefined} meta
 * @param {string} runtimeDir
 * @param {{ reinstall?: boolean, forceCompanion?: boolean }} [opts]
 */
function canReuseInstalledCompanion(pkg, meta = null, runtimeDir = '', opts = {}) {
    if (!pkg?.companionUrl) return false;
    if (opts.reinstall || opts.forceCompanion) return false;
    const wantId = resolveCompanionId(pkg);
    if (!wantId) return false;
    const installedCompanion = String(meta?.companionId || '').trim().toLowerCase();
    const installedPkg = String(meta?.packageId || '').trim();
    const sameCompanion = !!(installedCompanion && installedCompanion === wantId);
    const samePackage = !!(installedPkg && installedPkg === pkg.id);
    // Backward compatible: older runtime.json has no companionId; same packageId is enough.
    if (!sameCompanion && !samePackage) return false;
    return hasReusableCompanion(runtimeDir, wantId, pkg.id);
}

/**
 * Copy cudart/cublas DLLs aside before wiping runtime/.
 * @param {string} runtimeDir
 * @param {string} destDir
 * @returns {{ ok: boolean, files: string[] }}
 */
function preserveCompanionArtifacts(runtimeDir, destDir) {
    const files = listCompanionArtifacts(runtimeDir);
    if (!files.length) return { ok: false, files: [] };
    fs.mkdirSync(destDir, { recursive: true });
    for (const abs of files) {
        const rel = path.relative(runtimeDir, abs);
        const to = path.join(destDir, rel);
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(abs, to);
    }
    return { ok: true, files };
}

async function replaceRuntimeDir(runtimeDir, stamp) {
    const cleared = await downloader.rimrafSafeAsync(runtimeDir);
    if (!cleared.ok && fs.existsSync(runtimeDir)) {
        const bypass = `${runtimeDir}.old-${stamp}`;
        try {
            fs.renameSync(runtimeDir, bypass);
            // Best-effort cleanup of bypass; do not block install on slow deletes.
            void downloader.rimrafSafeAsync(bypass);
        } catch (err) {
            return {
                ok: false,
                error: `无法替换旧运行时目录：${err.message || err}`,
                code: 'runtime_busy',
            };
        }
    }
    fs.mkdirSync(runtimeDir, { recursive: true });
    return { ok: true };
}

function writeInstalledRuntimeMeta(pkg, exePath, extra = {}) {
    probedTagCache = null;
    // Prefer catalog/override tag for freshly installed package. Live --version can stall
    // the main process while CUDA DLLs load; meta is enough for outdated checks.
    let probed = '';
    try {
        probed = probeLlamaServerTag(exePath);
    } catch (_) { /* ignore */ }
    const companionId = resolveCompanionId(pkg);
    const targetTag = catalog.normalizeLlamaCppTag?.(pkg.tag)
        || catalog.normalizeLlamaCppTag?.(extra.tag)
        || catalog.LLAMA_CPP_TAG;
    const meta = {
        tag: probed || targetTag,
        packageId: pkg.id,
        label: pkg.label,
        backend: pkg.backend || '',
        exeName: pkg.exeName,
        exePath,
        installedAt: new Date().toISOString(),
        ...extra,
    };
    if (companionId && meta.companionId == null) meta.companionId = companionId;
    if (probed) meta.probedTag = probed;
    if (targetTag && !meta.requestedTag) meta.requestedTag = targetTag;
    llmFs.writeRuntimeMeta(meta);
    return meta;
}

/**
 * 从本机已下载的 zip/tar 安装运行时（手动下载后选用）。
 * @param {{ runtimeId?: string, archivePath: string, companionPath?: string, onProgress?: Function }} options
 */
async function installRuntimeFromLocalArchives(options = {}) {
    const opts = asPlainObject(options);
    try {
        await require('./advanced-runtime-prefer').ensurePreferCudaReady();
    } catch (_) { /* ignore */ }
    const hints = runtimePreferHints();
    const preferredId = resolvePreferredRuntimeId(opts.runtimeId || opts.packageId);
    const pkg = catalog.getRuntimePackage(process.platform, process.arch, preferredId, hints);
    if (!pkg) {
        return {
            ok: false,
            error: `当前平台暂不支持内置 llama-server（${process.platform}-${process.arch}）`,
            code: 'platform_unsupported',
        };
    }

    const archivePath = path.resolve(String(opts.archivePath || '').trim());
    if (!archivePath || !fs.existsSync(archivePath)) {
        return { ok: false, error: '未找到运行时压缩包', code: 'archive_missing' };
    }
    const companionPath = String(opts.companionPath || '').trim()
        ? path.resolve(String(opts.companionPath).trim())
        : '';
    if (companionPath && !fs.existsSync(companionPath)) {
        return { ok: false, error: '未找到 CUDA 运行库压缩包', code: 'companion_missing' };
    }

    await stopLlamaServerAsync();
    llmFs.ensureDirs();
    const runtimeDir = llmFs.getRuntimeDir();
    const stamp = `${Date.now()}-${process.pid}`;
    const staging = path.join(llmFs.getAdvancedLlmRoot(), `_runtime-staging-${stamp}`);
    const companionStaging = path.join(llmFs.getAdvancedLlmRoot(), `_runtime-cudart-${stamp}`);
    const companionKeep = path.join(llmFs.getAdvancedLlmRoot(), `_runtime-cudart-keep-${stamp}`);
    const companionId = resolveCompanionId(pkg);
    let systemCompanionLabel = '';
    let reuseSystemCompanion = false;

    if (pkg.companionUrl && !companionPath) {
        const major = resolveCompanionCudaMajor(companionId, pkg.id);
        const scanned = major
            ? cudaScan.tryReuseSystemCudaCompanion({
                major,
                destDir: companionKeep,
                extraRoots: resolveCudaScanExtraRoots(),
            })
            : { ok: false };
        if (scanned.ok && scanned.files?.length) {
            reuseSystemCompanion = true;
            systemCompanionLabel = scanned.best?.label || '本机 CUDA 运行库';
        } else {
            return {
                ok: false,
                error: `「${pkg.label}」还需选择 CUDA 运行库压缩包（cudart-*.zip），或先安装 NVIDIA CUDA Toolkit / 引擎 GPU 组件以便自动复用`,
                code: 'companion_missing',
            };
        }
    }

    try {
        sendProgress(opts.onProgress, {
            phase: 'extracting',
            kind: 'runtime',
            message: `正在从本地压缩包安装 ${pkg.label}…`,
            pct: 10,
        });
        fs.mkdirSync(staging, { recursive: true });
        await downloader.extractArchiveAsync(archivePath, staging, pkg.archive);

        const replaced = await replaceRuntimeDir(runtimeDir, stamp);
        if (!replaced.ok) return replaced;

        await copyDirRecursiveAsync(flattenStagingRoot(staging), runtimeDir);

        if (companionPath) {
            sendProgress(opts.onProgress, {
                phase: 'extracting',
                kind: 'runtime',
                message: '正在解压 CUDA 运行库…',
                pct: 70,
            });
            fs.mkdirSync(companionStaging, { recursive: true });
            await downloader.extractArchiveAsync(companionPath, companionStaging, pkg.archive);
            await copyDirRecursiveAsync(flattenStagingRoot(companionStaging), runtimeDir);
        } else if (reuseSystemCompanion) {
            sendProgress(opts.onProgress, {
                phase: 'extracting',
                kind: 'runtime',
                message: `正在复用本机 CUDA 运行库（${systemCompanionLabel}）…`,
                pct: 70,
            });
            await copyDirRecursiveAsync(companionKeep, runtimeDir);
        }

        const exe = llmFs.findFileRecursive(runtimeDir, pkg.exeName, 5);
        if (!exe) {
            return { ok: false, error: `解压后未找到 ${pkg.exeName}`, code: 'exe_missing' };
        }
        if (process.platform !== 'win32') {
            try { fs.chmodSync(exe, 0o755); } catch (_) { /* ignore */ }
        }

        if (pkg.backend === 'cuda') {
            const cudaDll = llmFs.findFileRecursive(runtimeDir, 'ggml-cuda.dll', 4)
                || llmFs.findFileRecursive(runtimeDir, 'cudart64_13.dll', 4)
                || llmFs.findFileRecursive(runtimeDir, 'cudart64_12.dll', 4);
            if (!cudaDll) {
                return {
                    ok: false,
                    error: '解压后未找到 CUDA 组件（ggml-cuda.dll / cudart）。请确认同时选择了主程序 zip 与 cudart zip，或本机 CUDA 运行库齐全。',
                    code: 'cuda_dll_missing',
                };
            }
        }
        if (pkg.backend === 'rocm') {
            const hipDll = llmFs.findFileRecursive(runtimeDir, 'ggml-hip.dll', 4)
                || llmFs.findFileRecursive(runtimeDir, 'amdhip64_7.dll', 4)
                || llmFs.findFileRecursive(runtimeDir, 'amdhip64.dll', 4);
            if (!hipDll) {
                return {
                    ok: false,
                    error: '解压后未找到 ROCm/HIP 组件（ggml-hip.dll）。请确认选择了 win-rocm / ubuntu-rocm 包，并完成本机 ROCm/HIP 安装。',
                    code: 'rocm_dll_missing',
                };
            }
        }

        const meta = writeInstalledRuntimeMeta(pkg, exe, {
            source: reuseSystemCompanion ? 'manual-zip+system-cudart' : 'manual-zip',
            companionId: companionId || undefined,
            companionReused: reuseSystemCompanion || undefined,
            companionSource: systemCompanionLabel || undefined,
        });
        sendProgress(opts.onProgress, {
            phase: 'done',
            kind: 'runtime',
            message: reuseSystemCompanion
                ? `运行时安装完成（${pkg.label}，已复用 ${systemCompanionLabel}）`
                : `运行时安装完成（${pkg.label}）`,
            pct: 100,
        });
        return {
            ok: true,
            exePath: exe,
            meta,
            companionReused: !!reuseSystemCompanion,
            companionFromSystem: !!reuseSystemCompanion,
        };
    } catch (err) {
        return {
            ok: false,
            error: downloader.formatError(err),
            code: 'runtime_import_failed',
        };
    } finally {
        await downloader.rimrafSafeAsync(staging);
        await downloader.rimrafSafeAsync(companionStaging);
        await downloader.rimrafSafeAsync(companionKeep);
    }
}

/**
 * True when a GitHub release JSON has at least one llama.cpp binary archive.
 * @param {object|null|undefined} release
 * @returns {boolean}
 */
function releaseHasLlamaCppBinaries(release) {
    const assets = Array.isArray(release?.assets) ? release.assets : [];
    return assets.some((a) => /llama-.*-bin-/i.test(String(a?.name || '')));
}

/**
 * Pick the newest llama.cpp build tag that ships binary zips.
 * Prefer b#### releases (often marked prerelease). Fall back to nightly-tag.txt
 * on the stable /releases/latest stub when present.
 * @param {object[]} releases
 * @param {object|null} [latestStable]
 * @returns {{ tag: string, htmlUrl?: string }|null}
 */
function pickLatestLlamaCppBuildRelease(releases, latestStable = null) {
    const list = Array.isArray(releases) ? releases : [];
    for (const rel of list) {
        const tag = catalog.normalizeLlamaCppTag?.(rel?.tag_name || rel?.name)
            || parseLlamaCppTag(String(rel?.tag_name || rel?.name || ''));
        if (!/^b\d{4,}$/i.test(tag)) continue;
        const assets = Array.isArray(rel?.assets) ? rel.assets : [];
        // Empty assets can happen with sparse payloads; still accept b#### tags.
        if (assets.length && !releaseHasLlamaCppBinaries(rel)) continue;
        return {
            tag,
            htmlUrl: String(rel?.html_url || '').trim() || undefined,
        };
    }
    const nightlyAsset = (Array.isArray(latestStable?.assets) ? latestStable.assets : [])
        .find((a) => /nightly-tag\.txt$/i.test(String(a?.name || '')));
    if (nightlyAsset) {
        return {
            tag: '',
            htmlUrl: String(latestStable?.html_url || '').trim() || undefined,
            nightlyTagUrl: String(
                nightlyAsset.browser_download_url
                || nightlyAsset.url
                || '',
            ).trim() || undefined,
        };
    }
    return null;
}

/**
 * Fetch the latest llama.cpp *binary* release tag from GitHub.
 * Do not use /releases/latest alone: that endpoint returns the newest non-prerelease
 * (e.g. v0.4.0) which currently only ships nightly-tag.txt — rewriting catalog URLs
 * to llama-v0.4.0-bin-… then 404s on GitHub and every mirror.
 * @returns {Promise<{ ok: boolean, tag?: string, htmlUrl?: string, error?: string }>}
 */
async function fetchLatestLlamaCppTag() {
    const listUrl = 'https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=40';
    const latestUrl = 'https://api.github.com/repos/ggml-org/llama.cpp/releases/latest';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    const headers = {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Transub-Runtime',
        'X-GitHub-Api-Version': '2022-11-28',
    };
    try {
        const listRes = await fetch(listUrl, {
            method: 'GET',
            signal: controller.signal,
            headers,
        });
        if (!listRes.ok) {
            return { ok: false, error: `GitHub Release API ${listRes.status}` };
        }
        const releases = await listRes.json();
        if (!Array.isArray(releases)) {
            return { ok: false, error: '未能解析 llama.cpp Release 列表' };
        }

        let latestStable = null;
        try {
            const latestRes = await fetch(latestUrl, {
                method: 'GET',
                signal: controller.signal,
                headers,
            });
            if (latestRes.ok) latestStable = await latestRes.json();
        } catch { /* optional */ }

        const picked = pickLatestLlamaCppBuildRelease(releases, latestStable);
        if (picked?.tag) {
            return {
                ok: true,
                tag: picked.tag,
                htmlUrl: picked.htmlUrl,
            };
        }

        // Last resort: nightly-tag.txt on the stable stub (points at current b####).
        const nightlyUrl = picked?.nightlyTagUrl
            || (latestStable
                ? `https://github.com/ggml-org/llama.cpp/releases/download/${encodeURIComponent(String(latestStable.tag_name || '').trim())}/nightly-tag.txt`
                : '');
        if (nightlyUrl) {
            const nightRes = await fetch(nightlyUrl, {
                method: 'GET',
                signal: controller.signal,
                headers: { 'User-Agent': 'Transub-Runtime', Accept: 'text/plain,*/*' },
            });
            if (nightRes.ok) {
                const text = await nightRes.text();
                const tag = catalog.normalizeLlamaCppTag?.(text)
                    || parseLlamaCppTag(text);
                if (/^b\d{4,}$/i.test(tag)) {
                    return {
                        ok: true,
                        tag,
                        htmlUrl: picked?.htmlUrl
                            || String(latestStable?.html_url || '').trim()
                            || undefined,
                    };
                }
            }
        }

        return {
            ok: false,
            error: '未找到带二进制包的 llama.cpp 构建（b####）。请改用「建议版」或稍后重试。',
        };
    } catch (err) {
        if (err?.name === 'AbortError') {
            return { ok: false, error: '查询 llama.cpp 最新版本超时' };
        }
        return { ok: false, error: err?.message || String(err) || '查询最新版本失败' };
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Resolve install package + target tag for recommended / latest channels.
 * @param {{ runtimeId?: string, packageId?: string, channel?: string, llamaCppTag?: string, tag?: string }} opts
 */
async function resolveRuntimeInstallPackage(opts = {}) {
    const preferredId = resolvePreferredRuntimeId(opts.runtimeId || opts.packageId);
    const hints = runtimePreferHints();
    const base = catalog.getRuntimePackage(process.platform, process.arch, preferredId, hints);
    if (!base) {
        return {
            ok: false,
            error: `当前平台暂不支持内置 llama-server（${process.platform}-${process.arch}）`,
            code: 'platform_unsupported',
        };
    }
    const channelRaw = String(opts.channel || '').trim().toLowerCase();
    const channel = (channelRaw === 'latest' || channelRaw === 'upstream' || channelRaw === 'official')
        ? 'latest'
        : 'recommended';
    const explicitRaw = String(opts.llamaCppTag || opts.tag || '').trim();
    let targetTag = catalog.normalizeLlamaCppTag?.(opts.llamaCppTag)
        || catalog.normalizeLlamaCppTag?.(opts.tag)
        || '';
    if (explicitRaw && !targetTag) {
        return {
            ok: false,
            error: `不支持的 llama.cpp 标签「${explicitRaw}」（需要 b#### 构建号；v0.x 正式版不含二进制包）`,
            code: 'invalid_tag',
        };
    }
    if (!targetTag && channel === 'latest') {
        const latest = await fetchLatestLlamaCppTag();
        if (!latest.ok) {
            return {
                ok: false,
                error: latest.error || '无法获取 llama.cpp 官方最新版本',
                code: 'latest_tag_failed',
            };
        }
        targetTag = catalog.normalizeLlamaCppTag?.(latest.tag) || '';
        if (!targetTag) {
            return {
                ok: false,
                error: `官方最新标签无效（${latest.tag || 'empty'}），无法构造下载地址`,
                code: 'latest_tag_invalid',
            };
        }
    }
    if (!targetTag) targetTag = catalog.LLAMA_CPP_TAG;
    if (!/^b\d{4,}$/i.test(targetTag)) {
        return {
            ok: false,
            error: `不支持的 llama.cpp 标签「${targetTag}」（需要 b#### 构建号）`,
            code: 'invalid_tag',
        };
    }
    const pkg = catalog.rewriteRuntimePackageTag
        ? catalog.rewriteRuntimePackageTag(base, targetTag)
        : { ...base, tag: targetTag };
    return {
        ok: true,
        pkg,
        targetTag,
        channel,
        recommendedTag: catalog.LLAMA_CPP_TAG,
    };
}

/**
 * 下载并解压 llama-server 运行时。
 * 更新 llama.cpp 时：若本机已有同 CUDA 版本的 cudart 且文件齐全，则跳过 CUDA 运行库下载；
 * 否则白名单扫描 NVIDIA Toolkit / pip nvidia 包并复制到运行时目录。
 * @param {{ force?: boolean, reinstall?: boolean, forceCompanion?: boolean, runtimeId?: string, packageId?: string, channel?: string, llamaCppTag?: string, signal?: AbortSignal, onProgress?: Function }} [options]
 */
async function ensureRuntimeInstalled(options = {}) {
    const opts = asPlainObject(options);
    try {
        await require('./advanced-runtime-prefer').ensurePreferCudaReady();
    } catch (_) { /* ignore */ }
    const resolved = await resolveRuntimeInstallPackage(opts);
    if (!resolved.ok) {
        return {
            ok: false,
            error: resolved.error || '无法解析运行时包',
            code: resolved.code || 'resolve_failed',
        };
    }
    const pkg = resolved.pkg;
    const targetTag = resolved.targetTag || catalog.LLAMA_CPP_TAG;

    const existing = getRuntimeStatus({ runtimeId: pkg.id });
    const meta = llmFs.readRuntimeMeta();
    const installedTag = String(existing.installedTag || resolveInstalledRuntimeTag(existing.exePath, meta) || '').trim();
    const samePackage = !!(
        existing.installed
        && existing.exePath
        && meta?.packageId === pkg.id
        && installedTag
        && installedTag === targetTag
    );
    // 已是目标后端且版本匹配：即使 force 也不重复下载（除非显式 reinstall）
    if (samePackage && !opts.reinstall) {
        return {
            ok: true,
            already: true,
            exePath: existing.exePath,
            meta,
            targetTag,
            channel: resolved.channel,
        };
    }
    if (existing.installed && existing.exePath && !opts.force && !opts.reinstall) {
        // 已装其它后端 / 旧版本：任务中途不自动切换，除非 force
        return {
            ok: true,
            already: true,
            exePath: existing.exePath,
            meta,
            outdated: !!(installedTag && installedTag !== targetTag),
            mismatch: meta?.packageId !== pkg.id,
            targetTag,
            channel: resolved.channel,
        };
    }

    cancelRuntimeInstall();
    // 替换目录前先停掉占用 exe 的进程
    await stopLlamaServerAsync();
    const controller = new AbortController();
    installAbort = controller;
    if (opts.signal) {
        if (opts.signal.aborted) {
            return { ok: false, error: '已取消', code: 'cancelled' };
        }
        opts.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    llmFs.ensureDirs();
    const runtimeDir = llmFs.getRuntimeDir();
    const stamp = `${Date.now()}-${process.pid}`;
    const staging = path.join(llmFs.getAdvancedLlmRoot(), `_runtime-staging-${stamp}`);
    const companionStaging = path.join(llmFs.getAdvancedLlmRoot(), `_runtime-cudart-${stamp}`);
    const companionKeep = path.join(llmFs.getAdvancedLlmRoot(), `_runtime-cudart-keep-${stamp}`);
    const archiveExt = pkg.archive === 'zip' ? 'zip' : 'tar.gz';
    const archivePath = path.join(
        llmFs.getAdvancedLlmRoot(),
        `_runtime-${pkg.id}-${stamp}.${archiveExt}`,
    );
    const companionUrl = String(pkg.companionUrl || '').trim();
    const companionId = resolveCompanionId(pkg);
    const preserve = tryPreserveOrScanCompanion(pkg, meta, runtimeDir, companionKeep, opts);
    const reuseCompanion = !!preserve.reused;
    const companionFromSystem = !!preserve.fromSystem;
    const companionSourceLabel = String(preserve.sourceLabel || '').trim();
    const needCompanionDownload = !!(companionUrl && !reuseCompanion);
    const companionPath = needCompanionDownload
        ? path.join(llmFs.getAdvancedLlmRoot(), `_runtime-${pkg.id}-cudart-${stamp}.${archiveExt}`)
        : '';

    try {
        const channelLabel = resolved.channel === 'latest' ? '官方最新' : '建议版';
        const sizePart = pkg.sizeHint ? `（${pkg.sizeHint}）` : '';
        sendProgress(opts.onProgress, {
            phase: 'start',
            kind: 'runtime',
            message: `开始下载运行时 ${pkg.label}（${channelLabel} ${targetTag}）${sizePart}…`,
            pct: 0,
        });

        fs.mkdirSync(staging, { recursive: true });

        const mainWeight = needCompanionDownload ? 55 : 100;
        await downloader.downloadFile(pkg.url, archivePath, {
            signal: controller.signal,
            onProgress: (p) => {
                const rawPct = Number(p.pct);
                const pct = Number.isFinite(rawPct)
                    ? Math.round((rawPct / 100) * mainWeight)
                    : undefined;
                sendProgress(opts.onProgress, {
                    ...p,
                    kind: 'runtime',
                    pct,
                    message: p.message || `下载运行时（${pkg.label} · ${targetTag}）…`,
                });
            },
        });

        if (needCompanionDownload && companionPath) {
            sendProgress(opts.onProgress, {
                phase: 'start',
                kind: 'runtime',
                message: '下载 CUDA 运行库（cudart）…',
                pct: mainWeight,
            });
            await downloader.downloadFile(companionUrl, companionPath, {
                signal: controller.signal,
                onProgress: (p) => {
                    const rawPct = Number(p.pct);
                    const pct = Number.isFinite(rawPct)
                        ? Math.round(mainWeight + (rawPct / 100) * (98 - mainWeight))
                        : undefined;
                    sendProgress(opts.onProgress, {
                        ...p,
                        kind: 'runtime',
                        pct,
                        message: p.message || '下载 CUDA 运行库…',
                    });
                },
            });
        } else if (reuseCompanion) {
            sendProgress(opts.onProgress, {
                phase: 'start',
                kind: 'runtime',
                message: companionFromSystem
                    ? `复用本机 CUDA 运行库（${companionSourceLabel || '已校验'}），跳过 cudart 下载`
                    : '复用已有 CUDA 运行库，跳过 cudart 下载',
                pct: Math.min(98, mainWeight),
            });
        }

        sendProgress(opts.onProgress, {
            phase: 'extracting',
            kind: 'runtime',
            message: '正在解压运行时…',
            pct: 99,
        });
        await downloader.extractArchiveAsync(archivePath, staging, pkg.archive);

        const replaced = await replaceRuntimeDir(runtimeDir, stamp);
        if (!replaced.ok) return replaced;

        await copyDirRecursiveAsync(flattenStagingRoot(staging), runtimeDir);

        if (reuseCompanion) {
            sendProgress(opts.onProgress, {
                phase: 'extracting',
                kind: 'runtime',
                message: companionFromSystem
                    ? `正在复制本机 CUDA 运行库（${companionSourceLabel || '已校验'}）…`
                    : '正在还原 CUDA 运行库…',
                pct: 99,
            });
            await copyDirRecursiveAsync(companionKeep, runtimeDir);
            if (!hasReusableCompanion(runtimeDir, companionId, pkg.id)) {
                return {
                    ok: false,
                    error: '复用 CUDA 运行库失败（文件缺失）。请重试并勾选完整重装，或手动安装 cudart。',
                    code: 'companion_reuse_failed',
                };
            }
        } else if (needCompanionDownload && companionPath) {
            sendProgress(opts.onProgress, {
                phase: 'extracting',
                kind: 'runtime',
                message: '正在解压 CUDA 运行库…',
                pct: 99,
            });
            fs.mkdirSync(companionStaging, { recursive: true });
            await downloader.extractArchiveAsync(companionPath, companionStaging, pkg.archive);
            await copyDirRecursiveAsync(flattenStagingRoot(companionStaging), runtimeDir);
        }

        const exe = llmFs.findFileRecursive(runtimeDir, pkg.exeName, 5);
        if (!exe) {
            return { ok: false, error: `解压后未找到 ${pkg.exeName}`, code: 'exe_missing' };
        }
        if (process.platform !== 'win32') {
            try { fs.chmodSync(exe, 0o755); } catch (_) { /* ignore */ }
        }
        if (pkg.backend === 'rocm') {
            const hipDll = llmFs.findFileRecursive(runtimeDir, 'ggml-hip.dll', 4)
                || llmFs.findFileRecursive(runtimeDir, 'amdhip64_7.dll', 4)
                || llmFs.findFileRecursive(runtimeDir, 'amdhip64.dll', 4);
            if (!hipDll) {
                return {
                    ok: false,
                    error: '解压后未找到 ROCm/HIP 组件（ggml-hip.dll）。请确认下载的是 win-rocm / ubuntu-rocm 包，并完成本机 ROCm/HIP 安装。',
                    code: 'rocm_dll_missing',
                };
            }
        }

        const written = writeInstalledRuntimeMeta(pkg, exe, {
            source: companionFromSystem ? 'download+system-cudart' : 'download',
            companionId: companionId || undefined,
            companionReused: reuseCompanion || undefined,
            companionFromSystem: companionFromSystem || undefined,
            companionSource: companionSourceLabel || undefined,
            channel: resolved.channel,
            requestedTag: targetTag,
            tag: targetTag,
        });

        sendProgress(opts.onProgress, {
            phase: 'done',
            kind: 'runtime',
            message: reuseCompanion
                ? (companionFromSystem
                    ? `运行时安装完成（${pkg.label} · ${targetTag}，已复用 ${companionSourceLabel || '本机 CUDA'}）`
                    : `运行时安装完成（${pkg.label} · ${targetTag}，已复用 CUDA 运行库）`)
                : `运行时安装完成（${pkg.label} · ${targetTag}）`,
            pct: 100,
        });
        return {
            ok: true,
            exePath: exe,
            meta: written,
            companionReused: !!reuseCompanion,
            companionFromSystem: !!companionFromSystem,
            targetTag,
            channel: resolved.channel,
        };
    } catch (err) {
        if (err?.name === 'AbortError' || err?.code === 'cancelled') {
            return { ok: false, error: '已取消', code: 'cancelled' };
        }
        return {
            ok: false,
            error: downloader.formatError(err),
            code: 'runtime_install_failed',
        };
    } finally {
        installAbort = null;
        try { fs.unlinkSync(archivePath); } catch (_) { /* ignore */ }
        if (companionPath) {
            try { fs.unlinkSync(companionPath); } catch (_) { /* ignore */ }
        }
        await downloader.rimrafSafeAsync(staging);
        await downloader.rimrafSafeAsync(companionStaging);
        await downloader.rimrafSafeAsync(companionKeep);
        // 顺带清理历史残留 staging / 旁路目录（失败不影响安装结果）
        try {
            const root = llmFs.getAdvancedLlmRoot();
            for (const name of fs.readdirSync(root)) {
                const shouldClean = name === '_runtime-staging'
                    || name.startsWith('_runtime-staging-')
                    || name.startsWith('_runtime-cudart-')
                    || name.startsWith('runtime.old-')
                    || /\.trash-\d+/.test(name)
                    || (name.startsWith('_runtime-') && (name.endsWith('.zip') || name.endsWith('.tar.gz') || name.endsWith('.partial')));
                if (shouldClean) {
                    await downloader.rimrafSafeAsync(path.join(root, name));
                }
            }
        } catch (_) { /* ignore */ }
    }
}


function copyDirRecursive(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
        const from = path.join(src, name);
        const to = path.join(dest, name);
        const st = fs.statSync(from);
        if (st.isDirectory()) copyDirRecursive(from, to);
        else fs.copyFileSync(from, to);
    }
}

/** Yield occasionally so Electron main can paint / handle IPC during large CUDA copies. */
async function copyDirRecursiveAsync(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    const names = fs.readdirSync(src);
    for (let i = 0; i < names.length; i += 1) {
        const name = names[i];
        const from = path.join(src, name);
        const to = path.join(dest, name);
        const st = fs.statSync(from);
        if (st.isDirectory()) {
            await copyDirRecursiveAsync(from, to);
        } else {
            fs.copyFileSync(from, to);
        }
        if (i % 16 === 0) {
            await downloader.sleep(0);
        }
    }
}

/**
 * Transub reserves DEFAULT_SERVER_PORT (+1 for Sakura). After Electron restart,
 * stopLlamaServer's serverProc is null but an orphan may still hold VRAM.
 */
function listDefaultLlmPorts() {
    const base = Number(catalog.DEFAULT_SERVER_PORT) || 39281;
    return [base, base + 1];
}

function killListenersOnPortSync(port) {
    return llmPortReclaim.killListenersOnPortSync(port);
}

function killDefaultLlmPortsQuiet() {
    return llmPortReclaim.killPortsSync(listDefaultLlmPorts());
}

function killDefaultLlmPortsQuietAsync() {
    return llmPortReclaim.killPortsAsync(listDefaultLlmPorts());
}

function stopLlamaServer() {
    if (idleStopTimer) {
        clearTimeout(idleStopTimer);
        idleStopTimer = null;
    }
    if (llmOwner === 'engine' && delegatedEngineUrl) {
        const url = delegatedEngineUrl;
        try {
            require('./engine-llm-client').stopLlmSync(url, 'desktop_stop');
        } catch (_) { /* ignore */ }
        markLlmOwnedLocal();
        serverState = null;
        serverProc = null;
        // Also clear desktop ports — engine stop may leave a prior local orphan.
        const orphan = killDefaultLlmPortsQuiet();
        return { ok: true, stopped: true, via: 'engine', orphanCleared: orphan };
    }
    const had = !!serverProc;
    if (serverProc) {
        try {
            if (process.platform === 'win32') {
                spawn('taskkill', ['/pid', String(serverProc.pid), '/T', '/F'], {
                    windowsHide: true,
                    stdio: 'ignore',
                });
            } else {
                serverProc.kill('SIGTERM');
            }
        } catch (_) { /* ignore */ }
        serverProc = null;
    }
    serverState = null;
    markLlmOwnedLocal();
    // Orphan from a prior Electron session is not in serverProc — free reserved ports.
    const orphan = killDefaultLlmPortsQuiet();
    return { ok: true, stopped: had || orphan, orphanCleared: orphan };
}

/**
 * Non-blocking stop for UI-critical paths (editor close). Engine-owned LLM uses
 * async DELETE; local process uses fire-and-forget taskkill (same as sync path).
 */
async function stopLlamaServerAsync() {
    if (idleStopTimer) {
        clearTimeout(idleStopTimer);
        idleStopTimer = null;
    }
    if (llmOwner === 'engine' && delegatedEngineUrl) {
        const url = delegatedEngineUrl;
        markLlmOwnedLocal();
        serverState = null;
        serverProc = null;
        try {
            await require('./engine-llm-client').stopLlm(url, {
                reason: 'desktop_stop',
                timeoutMs: 8000,
            });
        } catch (_) { /* ignore */ }
        const orphan = await killDefaultLlmPortsQuietAsync();
        return { ok: true, stopped: true, via: 'engine', orphanCleared: orphan };
    }
    const had = !!serverProc;
    if (serverProc) {
        try {
            if (process.platform === 'win32') {
                spawn('taskkill', ['/pid', String(serverProc.pid), '/T', '/F'], {
                    windowsHide: true,
                    stdio: 'ignore',
                });
            } else {
                serverProc.kill('SIGTERM');
            }
        } catch (_) { /* ignore */ }
        serverProc = null;
    }
    serverState = null;
    markLlmOwnedLocal();
    const orphan = await killDefaultLlmPortsQuietAsync();
    return { ok: true, stopped: had || orphan, orphanCleared: orphan };
}

function formatSpawnFailure(err, exe) {
    const msg = String(err?.message || err || 'spawn failed');
    const code = String(err?.code || '');
    const blocked = process.platform === 'win32'
        && (code === 'UNKNOWN' || /spawn\s+UNKNOWN/i.test(msg));
    if (blocked) {
        return {
            ok: false,
            error: '无法启动 llama-server：已被 Windows「智能应用控制 / Device Guard」拦截。'
                + '请把应用数据放在 C: 用户目录，或在「Windows 安全中心 → 应用和浏览器控制 → 智能应用控制」中关闭后重试。',
            code: 'spawn_blocked',
            exePath: exe || '',
        };
    }
    return {
        ok: false,
        error: `无法启动 llama-server：${msg}`,
        code: 'spawn_failed',
        exePath: exe || '',
    };
}

async function waitForHealthy(port, {
    timeoutMs = 180000,
    signal,
    onProgress,
    getLogTail,
    stallAfterMs = 0,
    sampleGpuUsedMiB = null,
} = {}) {
    const started = Date.now();
    let lastMsgAt = 0;
    let stallAnchor = started;
    let lastUsedMiB = null;
    let lastGpuSampleAt = 0;
    while (Date.now() - started < timeoutMs) {
        if (signal?.aborted) {
            return { ok: false, error: '已取消', code: 'cancelled' };
        }
        if (await isServerHealthy(port)) {
            return { ok: true };
        }
        if (serverProc && serverProc.exitCode != null) {
            return { ok: false, error: `llama-server 已退出（code ${serverProc.exitCode}）`, code: 'server_exited' };
        }
        const tail = String(
            (typeof getLogTail === 'function' ? getLogTail() : '') || lastServerLogTail || '',
        );
        if (/out of memory|CUDA error|failed to allocate|GGML_ASSERT|cannot allocate/i.test(tail)) {
            return {
                ok: false,
                error: 'GPU 加载失败（显存不足或 CUDA 错误）',
                code: 'gpu_load_failed',
            };
        }
        // While VRAM used is still climbing, the model is loading — reset stall clock.
        if (stallAfterMs > 0 && typeof sampleGpuUsedMiB === 'function') {
            const nowSample = Date.now();
            if (nowSample - lastGpuSampleAt >= 2000) {
                lastGpuSampleAt = nowSample;
                try {
                    const used = await sampleGpuUsedMiB();
                    if (Number.isFinite(used)) {
                        if (lastUsedMiB == null || used > lastUsedMiB + 64) {
                            stallAnchor = nowSample;
                        }
                        lastUsedMiB = used;
                    }
                } catch { /* ignore probe errors */ }
            }
        }
        // GPU load can hang at HTTP 503 when CUDA init stalls (broken cudart / WDAC).
        // Empty VRAM ≠ OOM — caller must not treat this as reason to drop to CPU.
        if (stallAfterMs > 0 && Date.now() - stallAnchor >= stallAfterMs) {
            const hint = /cuda|ggml|cublas|driver|device/i.test(tail)
                ? '（见 llama-server 日志）'
                : '（显存可能仍空闲：多为 CUDA 初始化卡住，而非显存不足）';
            return {
                ok: false,
                error: `GPU 模型加载停滞${hint}`,
                code: 'gpu_load_stalled',
            };
        }
        const now = Date.now();
        if (now - lastMsgAt > 3000) {
            lastMsgAt = now;
            sendProgress(onProgress, {
                phase: 'starting',
                kind: 'server',
                message: '正在加载模型到内存…',
                pct: undefined,
            });
        }
        await downloader.sleep(500);
    }
    return { ok: false, error: '启动超时：模型加载过久或运行时异常', code: 'server_timeout' };
}

/**
 * Resolve speculative decoding plan for catalog models with built-in MTP.
 * Experimental draft-model (-md) speculative decoding is no longer user-configurable.
 * @param {object} entry catalog row
 * @returns {{ enabled: boolean, reason?: string, specType?: string, specDraftNMax?: number, draftModelId?: string, draftModelName?: string, draftModelPath?: string }}
 */
function resolveSpeculativePlan(entry) {
    const ls = entry?.llamaServer && typeof entry.llamaServer === 'object'
        ? entry.llamaServer
        : {};
    const entrySpec = String(ls.specType || entry?.specType || '').trim().toLowerCase();
    if (entrySpec === 'draft-mtp' || entry?.mtp === true || ls.mtpSpeculative === true) {
        const nMax = Number(ls.specDraftNMax ?? entry?.specDraftNMax);
        return {
            enabled: true,
            specType: 'draft-mtp',
            specDraftNMax: Number.isFinite(nMax) && nMax >= 1
                ? Math.min(8, Math.round(nMax))
                : 2,
        };
    }
    return { enabled: false, reason: 'disabled' };
}

/**
 * Resolve llama-server -np / client concurrency from hardware hints (parallel always auto; smart-translate parallel off).
 * @param {object} entry catalog row
 * @param {object} opts ensureLlamaServer options
 * @param {number} nGpuLayers
 * @returns {Promise<{ mode: string, smartTranslateParallel: boolean, slots: number, clientConcurrency: number }>}
 */
async function resolveParallelPlanForModel(entry, opts, nGpuLayers) {
    let gpuFreeMiB = null;
    let gpuTotalMiB = null;
    try {
        const gpu = await require('./system-resources').sampleGpu();
        if (gpu && Number(gpu.memTotalMiB) > 0) {
            gpuTotalMiB = gpu.memTotalMiB;
            gpuFreeMiB = Math.max(0, Number(gpu.memTotalMiB) - Number(gpu.memUsedMiB || 0));
        }
    } catch (_) { /* ignore */ }
    const contextSize = Number.isFinite(Number(opts.contextSize))
        ? Number(opts.contextSize)
        : (Number.isFinite(Number(entry?.contextSize)) ? Number(entry.contextSize) : 8192);
    const plan = llamaTuning.resolveLlamaParallelPlan({
        llamaParallelMode: 'auto',
        llamaSmartTranslateParallel: false,
    }, {
        purpose: opts.parallelPurpose || 'mt',
        afterAsr: opts.afterAsr === true && opts.vramHandoffReady !== true,
        paramBillion: entry?.paramBillion,
        activeParamBillion: entry?.activeParamBillion,
        weightGiB: entry?.weightGiB,
        sizeBytes: entry?.sizeBytes,
        moe: entry?.moe === true,
        nCpuMoe: entry?.llamaServer?.nCpuMoe ?? entry?.nCpuMoe,
        contextSize,
        nGpuLayers,
        gpuFreeMiB,
        gpuTotalMiB,
    });
    try {
        const sakuraCatalog = require('../src/js/sakura-mt-catalog-core');
        const hymtCore = require('../src/js/hymt-translate-core');
        const tgCore = require('../src/js/translategemma-translate-core');
        const isHyMt = hymtCore.isHyMtModel?.(entry?.id)
            || sakuraCatalog.resolvePromptFamily?.(entry?.id) === 'hymt';
        const isTg = tgCore.isTranslateGemmaModel?.(entry?.id)
            || sakuraCatalog.resolvePromptFamily?.(entry?.id) === 'translategemma';
        if (sakuraCatalog.findCatalogEntry(entry?.id)) {
            const cap = llamaTuning.resolveMtPostAsrSlotCap({
                afterAsr: opts.afterAsr === true,
                vramHandoffReady: opts.vramHandoffReady === true,
                paramBillion: entry?.paramBillion,
            });
            if (isHyMt || isTg) {
                const hyPlan = llamaTuning.resolveLlamaParallelPlan({
                    llamaParallelMode: 'auto',
                    llamaSmartTranslateParallel: false,
                }, {
                    purpose: opts.parallelPurpose || 'mt',
                    afterAsr: opts.afterAsr === true && opts.vramHandoffReady !== true,
                    paramBillion: entry?.paramBillion,
                    contextSize,
                    nGpuLayers,
                    gpuFreeMiB,
                    gpuTotalMiB,
                });
                const slots = Math.max(1, Math.min(cap, Number(hyPlan.slots) || 1));
                return { ...hyPlan, slots, clientConcurrency: slots };
            }
            const slots = Math.max(1, Math.min(cap, Number(plan.slots) || 1));
            return { ...plan, slots, clientConcurrency: slots };
        }
    } catch (_) { /* ignore */ }
    return plan;
}

/**
 * Poll nvidia-smi until enough VRAM is free (post-Torch ASR handoff to llama-server).
 * @param {object} [options]
 * @returns {Promise<{ ok: boolean, code?: string, gpuFreeMiB?: number, gpuTotalMiB?: number, skipped?: boolean }>}
 */
async function waitForGpuVramHeadroom(options = {}) {
    const minFreeMiB = Math.max(512, Math.round(Number(options.minFreeMiB) || 5500));
    const timeoutMs = Math.max(1000, Math.round(Number(options.timeoutMs) || 20000));
    const pollMs = Math.max(100, Math.round(Number(options.pollMs) || 250));
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
    const waitLabel = String(options.waitLabel || '等待 GPU 显存释放').trim() || '等待 GPU 显存释放';
    const started = Date.now();
    let probeFailures = 0;
    let lastProgressAt = 0;

    const tickProgress = (gpuFree, gpuTotal, note) => {
        if (!onProgress) return;
        const elapsedSec = Math.max(1, Math.round((Date.now() - started) / 1000));
        const freeGb = Number.isFinite(gpuFree) && gpuFree > 0
            ? `空闲约 ${(gpuFree / 1024).toFixed(1)} GB`
            : '正在检测显存';
        const needGb = (minFreeMiB / 1024).toFixed(1);
        sendProgress(onProgress, {
            phase: 'starting',
            kind: 'server',
            message: note
                || `${waitLabel}（${freeGb}，需要 ≥${needGb} GB · ${elapsedSec}s）…`,
        });
    };

    tickProgress(null, null, options.progressNote || `${waitLabel}…`);

    while (Date.now() - started < timeoutMs) {
        if (options.signal?.aborted) {
            return { ok: false, code: 'cancelled' };
        }
        try {
            const gpu = await require('./system-resources').sampleGpu();
            const total = Number(gpu?.memTotalMiB);
            if (Number.isFinite(total) && total > 0) {
                probeFailures = 0;
                const used = Number(gpu?.memUsedMiB) || 0;
                const free = Math.max(0, Math.round(total - used));
                if (free >= minFreeMiB) {
                    return { ok: true, gpuFreeMiB: free, gpuTotalMiB: Math.round(total) };
                }
                if (Date.now() - lastProgressAt >= 2000) {
                    lastProgressAt = Date.now();
                    tickProgress(free, total);
                }
            } else {
                probeFailures += 1;
            }
        } catch {
            probeFailures += 1;
        }
        if (probeFailures >= 3) {
            return {
                ok: true,
                code: 'probe_unavailable',
                skipped: true,
            };
        }
        await downloader.sleep(pollMs);
    }
    try {
        const gpu = await require('./system-resources').sampleGpu();
        const total = Number(gpu?.memTotalMiB) || 0;
        const free = total > 0
            ? Math.max(0, Math.round(total - (Number(gpu?.memUsedMiB) || 0)))
            : 0;
        return { ok: false, code: 'timeout', gpuFreeMiB: free, gpuTotalMiB: total };
    } catch {
        return { ok: false, code: 'timeout' };
    }
}

async function releaseEngineGpuBeforeLlama(opts = {}) {
    if (opts.afterAsr !== true) return { ok: false, skipped: true };
    let url = String(opts.engineUrl || '').trim().replace(/\/+$/, '');
    if (!url) {
        try {
            url = String(require('./engine-options').DEFAULT_ENGINE_URL || '').trim().replace(/\/+$/, '');
        } catch { /* ignore */ }
    }
    if (!url) return { ok: false, skipped: true, reason: 'no_engine_url' };
    try {
        const { releaseGpuMemory } = require('./engine-client');
        const res = await releaseGpuMemory(url, { timeoutMs: 12000 });
        return { ok: !!res?.ok, data: res?.data, skipped: false };
    } catch (err) {
        return { ok: false, error: err?.message || String(err), skipped: false };
    }
}

async function sampleGpuUsedMiBSafe() {
    try {
        const gpu = await require('./system-resources').sampleGpu();
        const used = Number(gpu?.memUsedMiB);
        return Number.isFinite(used) ? used : null;
    } catch {
        return null;
    }
}

async function sampleGpuFreeMiBSafe() {
    try {
        const gpu = await require('./system-resources').sampleGpu();
        const total = Number(gpu?.memTotalMiB);
        if (!Number.isFinite(total) || total <= 0) return null;
        const used = Number(gpu?.memUsedMiB) || 0;
        return Math.max(0, Math.round(total - used));
    } catch {
        return null;
    }
}

/**
 * Whether local LLM may auto-degrade to CPU on GPU OOM / tight VRAM.
 * Prefers explicit opts; otherwise reads persisted settings (default: false).
 * @param {object} opts
 * @returns {boolean}
 */
function resolveAutoCpuOnGpuBusy(opts = {}) {
    if (opts.autoCpuOnGpuBusy === true || opts.allowCpuFallback === true) return true;
    if (opts.autoCpuOnGpuBusy === false || opts.allowCpuFallback === false) return false;
    try {
        const { loadSettings } = require('./settings-data');
        return loadSettings()?.options?.autoCpuOnGpuBusy === true;
    } catch {
        return false;
    }
}

/**
 * 确保指定 GGUF 模型对应的 llama-server 已在监听。
 * GPU 失败时优先降 -ngl；仅在开启「GPU 繁忙时自动改用 CPU」且真实 OOM / 显存偏紧时才落到 CPU。
 */
async function ensureLlamaServer(options = {}) {
    clearIdleStopTimer();

    const opts = asPlainObject(options);
    const entry = llmFs.resolveModelEntry(opts.modelId);
    if (!entry) {
        return { ok: false, error: '未知模型', code: 'unknown_model' };
    }
    if (!llmFs.isModelInstalled(entry)) {
        return {
            ok: false,
            error: `模型「${entry.name}」尚未下载`,
            code: 'model_not_installed',
            modelId: entry.id,
        };
    }

    const runtime = await ensureRuntimeInstalled({
        force: false,
        runtimeId: opts.runtimeId || opts.packageId,
        onProgress: opts.onProgress,
        signal: opts.signal,
    });
    if (!runtime.ok) return runtime;

    const port = Number(opts.port) || catalog.DEFAULT_SERVER_PORT;
    const modelPath = llmFs.getModelPath(entry);
    const baseUrl = getServerBaseUrl(port);

    if (
        serverState
        && serverState.modelId === entry.id
        && serverState.port === port
        && (serverProc || llmOwner === 'engine')
        && await isServerHealthy(port)
    ) {
        return {
            ok: true,
            already: true,
            modelId: entry.id,
            model: entry.id,
            baseUrl,
            apiKey: 'local',
            port,
            nGpuLayers: Number.isFinite(Number(serverState.nGpuLayers))
                ? Number(serverState.nGpuLayers)
                : undefined,
            parallelSlots: Number(serverState.parallelSlots) > 1
                ? Number(serverState.parallelSlots)
                : 1,
            speculative: !!serverState.speculative,
            draftModelId: serverState.draftModelId || undefined,
            via: llmOwner === 'engine' ? 'engine' : 'local',
        };
    }

    await stopLlamaServerAsync();

    const exe = llmFs.resolveServerExe();
    if (!exe) {
        return { ok: false, error: '未找到 llama-server 可执行文件', code: 'exe_missing' };
    }

    const wantGpu = Number.isFinite(Number(opts.nGpuLayers))
        ? Math.max(0, Math.round(Number(opts.nGpuLayers)))
        : 99;
    const contextSize = Number.isFinite(Number(opts.contextSize))
        ? Number(opts.contextSize)
        : (Number.isFinite(Number(entry?.contextSize)) ? Number(entry.contextSize) : 8192);

    let vramHandoffReady = false;
    if (opts.afterAsr === true && wantGpu > 0) {
        const minFreeMiB = Number.isFinite(Number(opts.minFreeVramMiB)) && Number(opts.minFreeVramMiB) > 0
            ? Math.round(Number(opts.minFreeVramMiB))
            : llamaTuning.estimateLlamaLoadMinFreeMiB({
                paramBillion: entry?.paramBillion,
                activeParamBillion: entry?.activeParamBillion,
                weightGiB: entry?.weightGiB,
                sizeBytes: entry?.sizeBytes,
                moe: entry?.moe === true,
                nCpuMoe: entry?.llamaServer?.nCpuMoe ?? entry?.nCpuMoe,
                contextSize,
            });
        sendProgress(opts.onProgress, {
            phase: 'starting',
            kind: 'server',
            message: '识别刚结束，正在释放引擎 ASR 显存…',
        });
        const released = await releaseEngineGpuBeforeLlama(opts);
        if (released.ok) {
            sendProgress(opts.onProgress, {
                phase: 'starting',
                kind: 'server',
                message: '引擎 ASR 显存已释放，等待 GPU 就绪…',
            });
        }
        const waitTimeoutMs = released.ok ? 12000 : 20000;
        const headroom = await waitForGpuVramHeadroom({
            minFreeMiB,
            timeoutMs: opts.vramWaitTimeoutMs || waitTimeoutMs,
            signal: opts.signal,
            onProgress: opts.onProgress,
            waitLabel: '识别刚结束，等待 GPU 显存释放',
            progressNote: '识别刚结束，等待 GPU 显存释放…',
        });
        if (headroom.ok && Number.isFinite(headroom.gpuFreeMiB)) {
            vramHandoffReady = true;
            sendProgress(opts.onProgress, {
                phase: 'starting',
                kind: 'server',
                message: headroom.code === 'probe_unavailable'
                    ? '无法读取显存计数，直接尝试加载推理模型…'
                    : `GPU 显存已就绪（空闲约 ${(headroom.gpuFreeMiB / 1024).toFixed(1)} GB）`,
            });
        } else if (headroom.code === 'timeout') {
            // Still try parallel with measured free VRAM; may fall back to 1 slot.
            vramHandoffReady = true;
            sendProgress(opts.onProgress, {
                phase: 'starting',
                kind: 'server',
                message: Number.isFinite(headroom.gpuFreeMiB)
                    ? `GPU 显存仍偏紧（空闲约 ${(headroom.gpuFreeMiB / 1024).toFixed(1)} GB），继续尝试加载推理模型…`
                    : 'GPU 显存仍偏紧，继续尝试加载推理模型…',
            });
        } else if (headroom.code === 'probe_unavailable') {
            vramHandoffReady = true;
        }
        const settleMs = llamaTuning.resolveLlamaHandoffSettleMs({
            headroomOk: !!(headroom.ok && Number.isFinite(headroom.gpuFreeMiB)),
            releasedOk: !!released.ok,
        });
        if (settleMs > 0) {
            await downloader.sleep(settleMs);
        }
    }

    const minFreeForModel = Number.isFinite(Number(opts.minFreeVramMiB)) && Number(opts.minFreeVramMiB) > 0
        ? Math.round(Number(opts.minFreeVramMiB))
        : llamaTuning.estimateLlamaLoadMinFreeMiB({
            paramBillion: entry?.paramBillion,
            activeParamBillion: entry?.activeParamBillion,
            weightGiB: entry?.weightGiB,
            sizeBytes: entry?.sizeBytes,
            moe: entry?.moe === true,
            nCpuMoe: entry?.llamaServer?.nCpuMoe ?? entry?.nCpuMoe,
            contextSize,
        });

    // Full GPU → partial only. CPU is added later only when autoCpuOnGpuBusy + real OOM + tight VRAM.
    const autoCpuOnGpuBusy = resolveAutoCpuOnGpuBusy(opts);
    let allowCpuFallback = wantGpu <= 0;
    let nglAttempts = llamaTuning.buildLlamaNglAttempts(wantGpu, { allowCpuFallback });
    let oomWaitRetries = 0;

    let lastFail = { ok: false, error: 'llama-server 启动失败', code: 'spawn_failed' };
    const specPlan = resolveSpeculativePlan(entry);
    if (specPlan.reason === 'draft_missing' && specPlan.draftModelName) {
        sendProgress(opts.onProgress, {
            phase: 'starting',
            kind: 'server',
            message: `推测解码已启用，但草稿模型「${specPlan.draftModelName}」尚未安装，将不使用`,
        });
    }
    const entryServerOpts = llamaTuning.resolveLlamaServerOptsFromEntry(entry);
    const specAttempts = (() => {
        if (specPlan.enabled && specPlan.specType === 'draft-mtp') {
            return [
                {
                    specType: 'draft-mtp',
                    specDraftNMax: specPlan.specDraftNMax,
                    draftModelPath: '',
                    draftModelId: '',
                },
                { specType: '', draftModelPath: '', draftModelId: '' },
            ];
        }
        if (specPlan.enabled && specPlan.draftModelPath) {
            return [
                {
                    specType: 'draft-simple',
                    draftModelPath: specPlan.draftModelPath,
                    draftModelId: specPlan.draftModelId,
                },
                { specType: '', draftModelPath: '', draftModelId: '' },
            ];
        }
        return [{ specType: '', draftModelPath: '', draftModelId: '' }];
    })();

    let sameNglRetries = 0;
    for (let i = 0; i < nglAttempts.length; i += 1) {
        if (opts.signal?.aborted) {
            return { ok: false, error: '已取消', code: 'cancelled' };
        }
        await stopLlamaServerAsync();
        const nGpuLayers = nglAttempts[i];
        const modeLabel = nGpuLayers <= 0 ? 'CPU' : `GPU ngl=${nGpuLayers}`;

        sendProgress(opts.onProgress, {
            phase: 'starting',
            kind: 'server',
            message: `启动 llama-server（${entry.name} · ${modeLabel}）…`,
            pct: Math.round((i / Math.max(1, nglAttempts.length)) * 40),
        });

        const parallelPlan = await resolveParallelPlanForModel(entry, {
            ...opts,
            vramHandoffReady,
        }, nGpuLayers);
        const npAttempts = [...new Set([
            parallelPlan.slots,
            1,
        ].filter((n) => Number.isFinite(n) && n >= 1 && n <= 4))];

        let lastHealthy = null;
        for (let j = 0; j < npAttempts.length; j += 1) {
            const parallelSlots = npAttempts[j];
            if (opts.signal?.aborted) {
                return { ok: false, error: '已取消', code: 'cancelled' };
            }

            for (let s = 0; s < specAttempts.length; s += 1) {
                const specAttempt = specAttempts[s];
                if (j > 0 || s > 0) {
                    await stopLlamaServerAsync();
                }

                let gpuFreeMiB = null;
                let gpuTotalMiB = null;
                try {
                    const gpu = await require('./system-resources').sampleGpu();
                    if (gpu && Number(gpu.memTotalMiB) > 0) {
                        gpuTotalMiB = gpu.memTotalMiB;
                        gpuFreeMiB = Math.max(0, Number(gpu.memTotalMiB) - Number(gpu.memUsedMiB || 0));
                    }
                } catch (_) { /* ignore */ }

                const args = llamaTuning.buildLlamaServerSpawnArgs({
                    modelPath,
                    host: '127.0.0.1',
                    port,
                    contextSize,
                    nGpuLayers,
                    alias: entry.id,
                    parallelSlots,
                    llamaJinja: entry.llamaJinja === true,
                    ...entryServerOpts,
                    gpuFreeMiB,
                    gpuTotalMiB,
                    draftModelPath: specAttempt.draftModelPath || undefined,
                    speculativeEnabled: !!specAttempt.draftModelPath,
                    // Explicit attempt wins (including empty fallback after MTP failure).
                    specType: Object.prototype.hasOwnProperty.call(specAttempt, 'specType')
                        ? (specAttempt.specType || '')
                        : (entryServerOpts.specType || ''),
                    specDraftNMax: specAttempt.specDraftNMax || entryServerOpts.specDraftNMax,
                });

                const speculative = !!specAttempt.draftModelPath
                    || String(specAttempt.specType || '') === 'draft-mtp';
                const gpuStallMs = llamaTuning.resolveLlamaGpuStallAfterMs({
                    nGpuLayers,
                    afterAsr: opts.afterAsr === true,
                    paramBillion: entry?.paramBillion,
                });
                const gpuTimeoutCap = opts.afterAsr === true ? 300000 : 240000;
                const healthTimeoutMs = nGpuLayers > 0
                    ? Math.min(Number(opts.timeoutMs) || 240000, gpuTimeoutCap)
                    : (Number(opts.timeoutMs) || 180000);

                // Prefer engine-owned process when /v1/llm* is available (compute-ownership P1).
                const engineLlmUrl = await resolveEngineLlmBaseUrl(opts);
                if (engineLlmUrl) {
                    await stopLlamaServerAsync();
                    sendProgress(opts.onProgress, {
                        phase: 'starting',
                        kind: 'server',
                        message: `引擎托管启动 llama-server（${entry.name} · ${modeLabel}）…`,
                    });
                    let ens;
                    try {
                        ens = await require('./engine-llm-client').ensureLlm(engineLlmUrl, {
                            modelId: entry.id,
                            exePath: exe,
                            args,
                            port,
                            // Desktop already released ASR VRAM when afterAsr; avoid double work.
                            afterAsr: false,
                            cwd: path.dirname(exe),
                            nGpuLayers,
                            parallelSlots,
                            speculative,
                            draftModelId: speculative ? (specAttempt.draftModelId || '') : '',
                            healthTimeoutMs,
                        }, { timeoutMs: healthTimeoutMs + 30000, signal: opts.signal });
                    } catch (err) {
                        lastFail = {
                            ok: false,
                            error: err?.message || String(err),
                            code: 'engine_llm_ensure_failed',
                        };
                        continue;
                    }
                    const payload = ens?.data && typeof ens.data === 'object' ? ens.data : ens;
                    if (ens?.ok && payload?.ok) {
                        markLlmOwnedByEngine(engineLlmUrl, {
                            modelId: entry.id,
                            port,
                            baseUrl,
                            nGpuLayers: Number.isFinite(Number(payload.nGpuLayers))
                                ? Number(payload.nGpuLayers)
                                : nGpuLayers,
                            parallelSlots,
                            parallelMode: parallelPlan.mode,
                            speculative,
                            draftModelId: speculative ? specAttempt.draftModelId : '',
                        });
                        const parallelNote = parallelSlots > 1 ? ` · 并行×${parallelSlots}` : '';
                        sendProgress(opts.onProgress, {
                            phase: 'ready',
                            kind: 'server',
                            message: `llama-server 已就绪（引擎托管 · ${modeLabel}${parallelNote}）`,
                            pct: 100,
                        });
                        return {
                            ok: true,
                            already: !!payload.already,
                            modelId: entry.id,
                            model: entry.id,
                            baseUrl,
                            apiKey: 'local',
                            port,
                            nGpuLayers: serverState?.nGpuLayers,
                            parallelSlots,
                            speculative,
                            draftModelId: serverState?.draftModelId || undefined,
                            via: 'engine',
                        };
                    }
                    if (payload?.logTail) lastServerLogTail = String(payload.logTail);
                    lastFail = {
                        ok: false,
                        error: payload?.error || ens?.error || '引擎启动 llama-server 失败',
                        code: payload?.code || ens?.code || 'engine_llm_ensure_failed',
                    };
                    if (
                        ens?.code === 'network'
                        || payload?.code === 'exe_rejected'
                        || payload?.code === 'exe_missing'
                    ) {
                        engineLlmSupportedCache = false;
                    }
                }

                let logTail = '';
                const appendLog = (buf) => {
                    logTail = `${logTail}${buf.toString('utf8')}`.slice(-6000);
                    lastServerLogTail = logTail;
                };

                let spawnError = null;
                try {
                    markLlmOwnedLocal();
                    serverProc = spawn(exe, args, {
                        cwd: path.dirname(exe),
                        windowsHide: true,
                        env: process.env,
                        stdio: ['ignore', 'pipe', 'pipe'],
                    });
                } catch (err) {
                    serverProc = null;
                    lastFail = formatSpawnFailure(err, exe);
                    continue;
                }

                serverProc.stdout?.on('data', appendLog);
                serverProc.stderr?.on('data', appendLog);
                const spawnedProc = serverProc;
                spawnedProc.on('error', (err) => {
                    spawnError = err;
                    if (serverProc === spawnedProc) {
                        serverProc = null;
                        serverState = null;
                    }
                });
                spawnedProc.on('exit', (code, signal) => {
                    lastServerLogTail = logTail;
                    if (serverProc === spawnedProc) {
                        serverProc = null;
                        serverState = null;
                    }
                    if (code != null && code !== 0) {
                        console.warn(
                            `[llama-server] exited code=${code} signal=${signal || ''} tail=${logTail.slice(-400)}`,
                        );
                    }
                });

                // Windows SAC/WDAC may fail CreateProcess asynchronously as spawn UNKNOWN.
                await new Promise((resolve) => {
                    if (spawnError || spawnedProc.pid) {
                        resolve();
                        return;
                    }
                    const timer = setTimeout(resolve, 100);
                    spawnedProc.once('spawn', () => {
                        clearTimeout(timer);
                        resolve();
                    });
                    spawnedProc.once('error', (err) => {
                        spawnError = err;
                        clearTimeout(timer);
                        resolve();
                    });
                });
                if (spawnError) {
                    lastFail = formatSpawnFailure(spawnError, exe);
                    await stopLlamaServerAsync();
                    continue;
                }

                const healthy = await waitForHealthy(port, {
                    timeoutMs: healthTimeoutMs,
                    stallAfterMs: gpuStallMs,
                    signal: opts.signal,
                    onProgress: opts.onProgress,
                    getLogTail: () => logTail,
                    sampleGpuUsedMiB: nGpuLayers > 0 ? sampleGpuUsedMiBSafe : null,
                });
                lastHealthy = healthy;
                if (healthy.ok) {
                    serverState = {
                        modelId: entry.id,
                        port,
                        baseUrl,
                        nGpuLayers,
                        parallelSlots,
                        parallelMode: parallelPlan.mode,
                        speculative,
                        draftModelId: speculative ? specAttempt.draftModelId : '',
                    };
                    const parallelNote = parallelSlots > 1 ? ` · 并行×${parallelSlots}` : '';
                    const specNote = speculative ? ' · 推测解码' : '';
                    sendProgress(opts.onProgress, {
                        phase: 'ready',
                        kind: 'server',
                        message: nGpuLayers <= 0
                            ? `本地模型服务已就绪（CPU${parallelNote}${specNote}）`
                            : `本地模型服务已就绪（${modeLabel}${parallelNote}${specNote}）`,
                        pct: 100,
                    });
                    return {
                        ok: true,
                        modelId: entry.id,
                        model: entry.id,
                        modelName: entry.name,
                        baseUrl,
                        apiKey: 'local',
                        port,
                        nGpuLayers,
                        parallelSlots,
                        speculative,
                        draftModelId: speculative ? specAttempt.draftModelId : undefined,
                    };
                }

                const exitCode = serverProc?.exitCode;
                const detail = [healthy.error, logTail.trim().split(/\r?\n/).slice(-8).join(' | ')]
                    .filter(Boolean)
                    .join(' · ')
                    .slice(0, 800);
                lastFail = {
                    ok: false,
                    error: exitCode != null
                        ? `llama-server 异常退出（code ${exitCode}${nGpuLayers > 0 ? ` · ${modeLabel}` : ''}）${detail ? `：${detail}` : ''}`
                        : (detail || healthy.error || 'llama-server 启动失败'),
                    code: healthy.code || 'server_exited',
                    logTail: logTail.slice(-1500),
                    nGpuLayers,
                    parallelSlots,
                    speculative: !!specAttempt.draftModelPath
                        || String(specAttempt.specType || '') === 'draft-mtp',
                };
                await stopLlamaServerAsync();
                if (
                    (specAttempt.draftModelPath || String(specAttempt.specType || '') === 'draft-mtp')
                    && s + 1 < specAttempts.length
                ) {
                    sendProgress(opts.onProgress, {
                        phase: 'starting',
                        kind: 'server',
                        message: '推测解码启动失败，回退为常规模式…',
                    });
                }
            }
        } // npAttempts

        const freeMiB = await sampleGpuFreeMiBSafe();
        const oomHint = lastHealthy?.code === 'gpu_load_failed'
            || /out of memory|failed to allocate|cannot allocate/i.test(String(lastFail.logTail || ''));
        // Auto CPU only when the user opted in (autoCpuOnGpuBusy) AND OOM + tight VRAM.
        if (
            autoCpuOnGpuBusy
            && !allowCpuFallback
            && oomHint
            && Number.isFinite(freeMiB)
            && !llamaTuning.isLlamaGpuHeadroomAmple({
                gpuFreeMiB: freeMiB,
                minFreeMiB: minFreeForModel,
                paramBillion: entry?.paramBillion,
                contextSize,
            })
        ) {
            allowCpuFallback = true;
            nglAttempts = llamaTuning.buildLlamaNglAttempts(wantGpu, { allowCpuFallback: true });
        }

        // Setting off: on OOM, wait for VRAM then retry GPU instead of falling back to CPU.
        if (
            !autoCpuOnGpuBusy
            && !allowCpuFallback
            && oomHint
            && nGpuLayers > 0
            && oomWaitRetries < 2
        ) {
            oomWaitRetries += 1;
            sendProgress(opts.onProgress, {
                phase: 'starting',
                kind: 'server',
                message: Number.isFinite(freeMiB)
                    ? `GPU 显存不足（空闲约 ${(freeMiB / 1024).toFixed(1)} GB），等待释放后重试（未启用自动改用 CPU）…`
                    : 'GPU 显存不足，等待释放后重试（未启用自动改用 CPU）…',
            });
            await waitForGpuVramHeadroom({
                minFreeMiB: minFreeForModel,
                timeoutMs: opts.afterAsr === true ? 45000 : 30000,
                pollMs: 400,
                onProgress: opts.onProgress,
                signal: opts.signal,
                waitLabel: '等待 GPU 显存释放后重试',
                progressNote: 'GPU 显存不足，等待释放后重试（未启用自动改用 CPU）…',
            });
            sameNglRetries = 0;
            i -= 1;
            await downloader.sleep(opts.afterAsr === true ? 2000 : 1000);
            continue;
        }

        const decision = llamaTuning.resolveLlamaNglFallbackAction({
            failCode: lastHealthy?.code || lastFail.code,
            nGpuLayers,
            sameNglRetries,
            maxSameRetries: 1,
            allowCpuFallback,
            gpuFreeMiB: freeMiB,
            minFreeMiB: minFreeForModel,
            paramBillion: entry?.paramBillion,
            contextSize,
            oomHint,
        });

        if (decision.action === 'retry_same' && nGpuLayers > 0) {
            sameNglRetries += 1;
            i -= 1;
            sendProgress(opts.onProgress, {
                phase: 'starting',
                kind: 'server',
                message: Number.isFinite(freeMiB)
                    ? `${modeLabel} 未就绪（空闲约 ${(freeMiB / 1024).toFixed(1)} GB），同档重试…`
                    : `${modeLabel} 未就绪，同档重试…`,
            });
            await downloader.sleep(opts.afterAsr === true ? 3500 : 1500);
            continue;
        }

        sameNglRetries = 0;
        if (i < nglAttempts.length - 1) {
            const stallHint = lastHealthy?.code === 'gpu_load_stalled'
                ? '（加载超时，显存未必不足）'
                : '';
            sendProgress(opts.onProgress, {
                phase: 'starting',
                kind: 'server',
                message: `${modeLabel} 失败${stallHint}，尝试降低 GPU 层数…`,
            });
            await downloader.sleep(
                nGpuLayers > 0
                    ? (opts.afterAsr === true ? 3500 : 1500)
                    : 800,
            );
        } else if (decision.action === 'fail' || !allowCpuFallback) {
            if (!allowCpuFallback && nGpuLayers > 0) {
                lastFail = {
                    ...lastFail,
                    error: `${lastFail.error || 'GPU 启动失败'}（已跳过自动 CPU 降级；可开启「GPU 繁忙时自动改用 CPU」、换 CUDA/Vulkan 运行时，或在设置中将推理设备改为 CPU）`,
                    code: lastFail.code || 'gpu_unavailable',
                };
            }
        }
    }

    return lastFail;
}

module.exports = {
    resolvePreferredRuntimeId,
    syncRuntimePreferenceToHardware,
    resolveParallelPlanForModel,
    buildLlamaServerSpawnArgs: llamaTuning.buildLlamaServerSpawnArgs,
    resolveParallelSlots: llamaTuning.resolveParallelSlots,
    parseLlamaCppTag,
    releaseHasLlamaCppBinaries,
    pickLatestLlamaCppBuildRelease,
    probeLlamaServerTag,
    resolveInstalledRuntimeTag,
    resolveCompanionId,
    resolveCompanionCudaMajor,
    canReuseInstalledCompanion,
    hasReusableCompanion,
    listCompanionArtifacts,
    preserveCompanionArtifacts,
    getRuntimeStatus,
    ensureRuntimeInstalled,
    fetchLatestLlamaCppTag,
    resolveRuntimeInstallPackage,
    installRuntimeFromLocalArchives,
    cancelRuntimeInstall,
    waitForGpuVramHeadroom,
    releaseEngineGpuBeforeLlama,
    resolveAutoCpuOnGpuBusy,
    ensureLlamaServer,
    stopLlamaServer,
    stopLlamaServerAsync,
    killDefaultLlmPortsQuiet,
    listDefaultLlmPorts,
    clearIdleStopTimer,
    scheduleIdleStop,
    IDLE_STOP_MS,
    isServerHealthy,
    getServerBaseUrl,
    getLastServerLogTail,
    getServerState: () => (serverState ? { ...serverState } : null),
    getLlmOwner: () => llmOwner,
    scanReusableCudaRuntimes: (opts) => cudaScan.scanReusableCudaRuntimes({
        ...opts,
        extraRoots: [
            ...(Array.isArray(opts?.extraRoots) ? opts.extraRoots : []),
            ...resolveCudaScanExtraRoots(),
        ],
    }),
};
