/**
 * llama-server 运行时安装与进程生命周期
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
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

function getRuntimeStatus() {
    const pkg = catalog.getRuntimePackage();
    const meta = llmFs.readRuntimeMeta();
    const exe = llmFs.resolveServerExe(meta);
    const installed = !!exe && fs.existsSync(exe);
    return {
        kind: 'llama-server',
        supported: !!pkg,
        package: pkg,
        installed,
        exePath: installed ? exe : '',
        meta,
        tag: catalog.LLAMA_CPP_TAG,
        message: !pkg
            ? `当前平台暂不支持内置运行时（${process.platform}-${process.arch}）`
            : (installed
                ? `llama-server 已就绪（${meta?.tag || catalog.LLAMA_CPP_TAG}${meta?.packageId ? ` · ${meta.packageId}` : ''}）`
                : `尚未安装运行时（llama.cpp ${catalog.LLAMA_CPP_TAG} · ${pkg.label}）`),
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

/**
 * 下载并解压 llama-server 运行时。
 */
async function ensureRuntimeInstalled(options = {}) {
    const opts = asPlainObject(options);
    const pkg = catalog.getRuntimePackage();
    if (!pkg) {
        return {
            ok: false,
            error: `当前平台暂不支持内置 llama-server（${process.platform}-${process.arch}）`,
            code: 'platform_unsupported',
        };
    }

    const existing = getRuntimeStatus();
    if (existing.installed && !opts.force) {
        const meta = llmFs.readRuntimeMeta();
        if (meta?.tag === catalog.LLAMA_CPP_TAG && meta?.packageId === pkg.id) {
            return { ok: true, already: true, exePath: existing.exePath, meta };
        }
        // 旧版本仍可用，除非 force
        if (existing.exePath && !opts.force) {
            return { ok: true, already: true, exePath: existing.exePath, meta, outdated: meta?.tag !== catalog.LLAMA_CPP_TAG };
        }
    }

    cancelRuntimeInstall();
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
    const archivePath = path.join(
        llmFs.getAdvancedLlmRoot(),
        `_runtime-${pkg.id}-${stamp}.${pkg.archive === 'zip' ? 'zip' : 'tar.gz'}`,
    );

    try {
        sendProgress(opts.onProgress, {
            phase: 'start',
            kind: 'runtime',
            message: `开始下载运行时 ${pkg.label}…`,
            pct: 0,
        });

        fs.mkdirSync(staging, { recursive: true });

        await downloader.downloadFile(pkg.url, archivePath, {
            signal: controller.signal,
            onProgress: (p) => sendProgress(opts.onProgress, {
                ...p,
                kind: 'runtime',
                message: p.message || '下载运行时…',
            }),
        });

        sendProgress(opts.onProgress, {
            phase: 'extracting',
            kind: 'runtime',
            message: '正在解压运行时…',
            pct: 99,
        });
        downloader.extractArchive(archivePath, staging, pkg.archive);

        // 清空旧 runtime 再迁入（保留 models）；删不干净则换旁路目录
        const cleared = downloader.rimrafSafe(runtimeDir);
        if (!cleared.ok && fs.existsSync(runtimeDir)) {
            const bypass = `${runtimeDir}.old-${stamp}`;
            try {
                fs.renameSync(runtimeDir, bypass);
                downloader.rimrafSafe(bypass);
            } catch (err) {
                return {
                    ok: false,
                    error: `无法替换旧运行时目录：${err.message || err}`,
                    code: 'runtime_busy',
                };
            }
        }
        fs.mkdirSync(runtimeDir, { recursive: true });

        // 若解压根目录仅有一层文件夹，提升内容
        const stagedEntries = fs.readdirSync(staging);
        let sourceRoot = staging;
        if (stagedEntries.length === 1) {
            const only = path.join(staging, stagedEntries[0]);
            if (fs.statSync(only).isDirectory()) sourceRoot = only;
        }
        copyDirRecursive(sourceRoot, runtimeDir);

        const exe = llmFs.findFileRecursive(runtimeDir, pkg.exeName, 5);
        if (!exe) {
            return { ok: false, error: `解压后未找到 ${pkg.exeName}`, code: 'exe_missing' };
        }
        if (process.platform !== 'win32') {
            try { fs.chmodSync(exe, 0o755); } catch (_) { /* ignore */ }
        }

        const meta = {
            tag: catalog.LLAMA_CPP_TAG,
            packageId: pkg.id,
            label: pkg.label,
            exeName: pkg.exeName,
            exePath: exe,
            installedAt: new Date().toISOString(),
        };
        llmFs.writeRuntimeMeta(meta);

        sendProgress(opts.onProgress, {
            phase: 'done',
            kind: 'runtime',
            message: '运行时安装完成',
            pct: 100,
        });
        return { ok: true, exePath: exe, meta };
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
        downloader.rimrafSafe(staging);
        // 顺带清理历史残留 staging / 旁路目录（失败不影响安装结果）
        try {
            const root = llmFs.getAdvancedLlmRoot();
            for (const name of fs.readdirSync(root)) {
                const shouldClean = name === '_runtime-staging'
                    || name.startsWith('_runtime-staging-')
                    || name.startsWith('runtime.old-')
                    || /\.trash-\d+/.test(name)
                    || (name.startsWith('_runtime-') && (name.endsWith('.zip') || name.endsWith('.tar.gz') || name.endsWith('.partial')));
                if (shouldClean) {
                    downloader.rimrafSafe(path.join(root, name));
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
            }
        });
        spawnedProc.on('exit', () => {
            if (serverProc === spawnedProc) {
                serverProc = null;
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
    getRuntimeStatus,
    ensureRuntimeInstalled,
    cancelRuntimeInstall,
    ensureLlamaServer,
    stopLlamaServer,
    clearIdleStopTimer,
    scheduleIdleStop,
    IDLE_STOP_MS,
    isServerHealthy,
    getServerBaseUrl,
    getServerState: () => (serverState ? { ...serverState } : null),
};
