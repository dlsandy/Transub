/**
 * llama-server 运行时安装与进程生命周期
 */
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const catalog = require('../src/js/advanced-managed-llm-catalog-core');
const llmFs = require('./advanced-llm-fs');
const downloader = require('./advanced-llm-download');
const { asPlainObject } = require('./ipc-validate');

/** @type {import('child_process').ChildProcess | null} */
let serverProc = null;
/** @type {{ modelId: string, port: number, baseUrl: string } | null} */
let serverState = null;
let installAbort = null;
const IDLE_STOP_MS = 5 * 60 * 1000;
/** @type {ReturnType<typeof setTimeout> | null} */
let idleStopTimer = null;
/** @type {{ exePath: string, mtimeMs: number, size: number, tag: string } | null} */
let probedTagCache = null;
/** Last stderr/stdout snippet from llama-server (for crash diagnostics). */
let lastServerLogTail = '';

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
    const numbered = s.match(/\bversion:\s*(\d+)\b/i);
    if (numbered) return `b${numbered[1]}`;
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
    }
    return probeLlamaServerTag(exe);
}

function clearIdleStopTimer() {
    if (idleStopTimer) {
        clearTimeout(idleStopTimer);
        idleStopTimer = null;
    }
}

function scheduleIdleStop(delayMs = IDLE_STOP_MS) {
    clearIdleStopTimer();
    idleStopTimer = setTimeout(() => {
        idleStopTimer = null;
        stopLlamaServer();
    }, delayMs);
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
 * 解析偏好运行时包 id：显式参数 → 高级设置 → 硬件默认（NVIDIA→CUDA 13/12，否则 Vulkan）。
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
 * 按硬件 CUDA 主版本把 managedLlm.runtimeId 默认设为匹配后端（CUDA 13 / 12）。
 * 有 NVIDIA + CUDA≥12 时写入；无独显不改动。
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
        if (!hints.preferCuda) {
            return { ok: true, skipped: true, reason: 'no_cuda' };
        }
        const recommended = catalog.getDefaultRuntimeId(process.platform, process.arch, hints);
        if (!recommended || !/^win-cuda\d+-x64$/i.test(recommended)) {
            return { ok: true, skipped: true, reason: 'no_recommended' };
        }

        const { readAdvancedDoc, writeAdvancedDoc } = require('./advanced-license-data');
        const read = readAdvancedDoc();
        const doc = read.doc;
        const managed = catalog.normalizeManagedLlm(doc?.managedLlm, hints);
        const previousId = String(managed.runtimeId || '').trim();
        if (previousId === recommended) {
            return { ok: true, already: true, runtimeId: recommended, previousId };
        }

        const isCudaPkg = /^win-cuda\d+-x64$/i.test(previousId);
        // Soft sync: fill empty preference or correct CUDA 12↔13 mismatch.
        // force: also replace Vulkan / other backends (wizard / one-click install).
        if (!options.force && previousId && !isCudaPkg) {
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
    const outdated = !!(installed && installedTag && installedTag !== catalogTag);
    const mismatch = !!(installed && preferredId && installedId && installedId !== preferredId);
    const choices = catalog.listRuntimePackages(process.platform, process.arch, hints);
    let message = !pkg
        ? `当前平台暂不支持内置运行时（${process.platform}-${process.arch}）`
        : (installed
            ? `llama-server 已就绪（${installedTag || catalogTag}${installedId ? ` · ${installedId}` : ''}）`
            : `尚未安装运行时（llama.cpp ${catalogTag} · ${pkg.label}）`);
    if (outdated) {
        message = `${message} · 可更新至 ${catalogTag}`;
    }
    if (mismatch) {
        const preferLabel = pkg?.label || preferredId;
        const installedLabel = meta?.label || installedId;
        message = `${message} · 偏好「${preferLabel}」，当前为「${installedLabel}」，请重新安装运行时`;
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
 * e.g. cudart-llama-bin-win-cuda-13.3-x64
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
 * Same CUDA flavor (12.4 / 13.3) + marker DLLs present → skip cudart re-download.
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
    // Prefer catalog tag for freshly installed package. Live --version can stall
    // the main process while CUDA DLLs load; meta is enough for outdated checks.
    let probed = '';
    try {
        probed = probeLlamaServerTag(exePath);
    } catch (_) { /* ignore */ }
    const companionId = resolveCompanionId(pkg);
    const meta = {
        tag: probed || catalog.LLAMA_CPP_TAG,
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
    if (pkg.companionUrl && !companionPath) {
        return {
            ok: false,
            error: `「${pkg.label}」还需选择 CUDA 运行库压缩包（cudart-*.zip）`,
            code: 'companion_missing',
        };
    }
    if (companionPath && !fs.existsSync(companionPath)) {
        return { ok: false, error: '未找到 CUDA 运行库压缩包', code: 'companion_missing' };
    }

    stopLlamaServer();
    llmFs.ensureDirs();
    const runtimeDir = llmFs.getRuntimeDir();
    const stamp = `${Date.now()}-${process.pid}`;
    const staging = path.join(llmFs.getAdvancedLlmRoot(), `_runtime-staging-${stamp}`);
    const companionStaging = path.join(llmFs.getAdvancedLlmRoot(), `_runtime-cudart-${stamp}`);

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
                    error: '解压后未找到 CUDA 组件（ggml-cuda.dll / cudart）。请确认同时选择了主程序 zip 与 cudart zip。',
                    code: 'cuda_dll_missing',
                };
            }
        }

        const meta = writeInstalledRuntimeMeta(pkg, exe, { source: 'manual-zip' });
        sendProgress(opts.onProgress, {
            phase: 'done',
            kind: 'runtime',
            message: `运行时安装完成（${pkg.label}）`,
            pct: 100,
        });
        return { ok: true, exePath: exe, meta };
    } catch (err) {
        return {
            ok: false,
            error: downloader.formatError(err),
            code: 'runtime_import_failed',
        };
    } finally {
        await downloader.rimrafSafeAsync(staging);
        await downloader.rimrafSafeAsync(companionStaging);
    }
}

/**
 * 下载并解压 llama-server 运行时。
 * 更新 llama.cpp 时：若本机已有同 CUDA 版本的 cudart 且文件齐全，则跳过 CUDA 运行库下载。
 * @param {{ force?: boolean, reinstall?: boolean, forceCompanion?: boolean, runtimeId?: string, packageId?: string, signal?: AbortSignal, onProgress?: Function }} [options]
 */
async function ensureRuntimeInstalled(options = {}) {
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

    const existing = getRuntimeStatus({ runtimeId: pkg.id });
    const meta = llmFs.readRuntimeMeta();
    const installedTag = String(existing.installedTag || resolveInstalledRuntimeTag(existing.exePath, meta) || '').trim();
    const samePackage = !!(
        existing.installed
        && existing.exePath
        && meta?.packageId === pkg.id
        && installedTag
        && installedTag === catalog.LLAMA_CPP_TAG
    );
    // 已是目标后端且版本匹配：即使 force 也不重复下载（除非显式 reinstall）
    if (samePackage && !opts.reinstall) {
        return { ok: true, already: true, exePath: existing.exePath, meta };
    }
    if (existing.installed && existing.exePath && !opts.force && !opts.reinstall) {
        // 已装其它后端 / 旧版本：任务中途不自动切换，除非 force
        return {
            ok: true,
            already: true,
            exePath: existing.exePath,
            meta,
            outdated: !!(installedTag && installedTag !== catalog.LLAMA_CPP_TAG),
            mismatch: meta?.packageId !== pkg.id,
        };
    }

    cancelRuntimeInstall();
    // 替换目录前先停掉占用 exe 的进程
    stopLlamaServer();
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
    let reuseCompanion = canReuseInstalledCompanion(pkg, meta, runtimeDir, opts);
    if (reuseCompanion) {
        const kept = preserveCompanionArtifacts(runtimeDir, companionKeep);
        reuseCompanion = !!(kept.ok && kept.files.length);
        if (!reuseCompanion) {
            try { await downloader.rimrafSafeAsync(companionKeep); } catch (_) { /* ignore */ }
        }
    }
    const needCompanionDownload = !!(companionUrl && !reuseCompanion);
    const companionPath = needCompanionDownload
        ? path.join(llmFs.getAdvancedLlmRoot(), `_runtime-${pkg.id}-cudart-${stamp}.${archiveExt}`)
        : '';

    try {
        sendProgress(opts.onProgress, {
            phase: 'start',
            kind: 'runtime',
            message: `开始下载运行时 ${pkg.label}${pkg.sizeHint ? `（${pkg.sizeHint}）` : ''}…`,
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
                    message: p.message || `下载运行时（${pkg.label}）…`,
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
                message: '复用已有 CUDA 运行库，跳过 cudart 下载',
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
                message: '正在还原 CUDA 运行库…',
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

        const written = writeInstalledRuntimeMeta(pkg, exe, {
            source: 'download',
            companionId: companionId || undefined,
            companionReused: reuseCompanion || undefined,
        });

        sendProgress(opts.onProgress, {
            phase: 'done',
            kind: 'runtime',
            message: reuseCompanion
                ? `运行时安装完成（${pkg.label}，已复用 CUDA 运行库）`
                : `运行时安装完成（${pkg.label}）`,
            pct: 100,
        });
        return { ok: true, exePath: exe, meta: written, companionReused: !!reuseCompanion };
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

function stopLlamaServer() {
    clearIdleStopTimer();
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
    return { ok: true, stopped: had };
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

async function waitForHealthy(port, { timeoutMs = 180000, signal, onProgress } = {}) {
    const started = Date.now();
    let lastMsgAt = 0;
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
 * 确保指定 GGUF 模型对应的 llama-server 已在监听。
 * GPU 启动失败时自动降层 / 回退 CPU（Whisper 占满显存时常见）。
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
        serverProc
        && serverState
        && serverState.modelId === entry.id
        && serverState.port === port
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
        };
    }

    stopLlamaServer();

    const exe = llmFs.resolveServerExe();
    if (!exe) {
        return { ok: false, error: '未找到 llama-server 可执行文件', code: 'exe_missing' };
    }

    const wantGpu = Number.isFinite(Number(opts.nGpuLayers))
        ? Math.max(0, Math.round(Number(opts.nGpuLayers)))
        : 99;
    const contextSize = Number.isFinite(Number(opts.contextSize))
        ? Number(opts.contextSize)
        : 8192;

    // Prefer full GPU → partial → CPU. 7B + residual Whisper VRAM often needs fallback.
    const nglAttempts = [...new Set([
        wantGpu,
        wantGpu > 0 ? Math.min(40, wantGpu) : 0,
        wantGpu > 0 ? Math.min(20, wantGpu) : 0,
        0,
    ].filter((n) => Number.isFinite(n) && n >= 0))];

    let lastFail = { ok: false, error: 'llama-server 启动失败', code: 'spawn_failed' };

    for (let i = 0; i < nglAttempts.length; i += 1) {
        if (opts.signal?.aborted) {
            return { ok: false, error: '已取消', code: 'cancelled' };
        }
        stopLlamaServer();
        const nGpuLayers = nglAttempts[i];
        const modeLabel = nGpuLayers <= 0 ? 'CPU' : `GPU ngl=${nGpuLayers}`;

        sendProgress(opts.onProgress, {
            phase: 'starting',
            kind: 'server',
            message: `启动 llama-server（${entry.name} · ${modeLabel}）…`,
            pct: Math.round((i / Math.max(1, nglAttempts.length)) * 40),
        });

        const args = [
            '-m', modelPath,
            '--host', '127.0.0.1',
            '--port', String(port),
            '-c', String(contextSize),
            '-ngl', String(nGpuLayers),
            '-a', entry.id,
        ];

        let logTail = '';
        const appendLog = (buf) => {
            logTail = `${logTail}${buf.toString('utf8')}`.slice(-6000);
            lastServerLogTail = logTail;
        };

        let spawnError = null;
        try {
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
            stopLlamaServer();
            continue;
        }

        const healthy = await waitForHealthy(port, {
            timeoutMs: Number(opts.timeoutMs) || 180000,
            signal: opts.signal,
            onProgress: opts.onProgress,
        });
        if (healthy.ok) {
            serverState = { modelId: entry.id, port, baseUrl };
            sendProgress(opts.onProgress, {
                phase: 'ready',
                kind: 'server',
                message: nGpuLayers <= 0
                    ? '本地模型服务已就绪（CPU）'
                    : `本地模型服务已就绪（${modeLabel}）`,
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
        };
        stopLlamaServer();
        // Only retry lower ngl when process exited or GPU-related failure
        if (i < nglAttempts.length - 1) {
            sendProgress(opts.onProgress, {
                phase: 'starting',
                kind: 'server',
                message: `${modeLabel} 失败，尝试降低 GPU 负载…`,
            });
            await downloader.sleep(800);
        }
    }

    return lastFail;
}

module.exports = {
    resolvePreferredRuntimeId,
    syncRuntimePreferenceToHardware,
    parseLlamaCppTag,
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
    installRuntimeFromLocalArchives,
    cancelRuntimeInstall,
    ensureLlamaServer,
    stopLlamaServer,
    clearIdleStopTimer,
    scheduleIdleStop,
    IDLE_STOP_MS,
    isServerHealthy,
    getServerBaseUrl,
    getLastServerLogTail,
    getServerState: () => (serverState ? { ...serverState } : null),
};
