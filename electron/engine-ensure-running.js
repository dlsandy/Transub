/**
 * Ensure local engine HTTP server is up (spawn / health / force-restart policy).
 * Bound from engine-bridge via createEngineEnsureRunning(host).
 */
'use strict';

const path = require('path');
const { spawn } = require('child_process');

const REQUIRED_HOST_KEYS = [
    'getEngineProc',
    'setEngineProc',
    'getEngineBaseUrl',
    'setEngineBaseUrl',
    'getBatchRunning',
    'mergeEngineOptions',
    'resolveEngineInstallPath',
    'DEFAULT_ENGINE_URL',
    'parseHostPort',
    'stopEngineProcess',
    'stopEngineProcessAndPort',
    'killListenersOnPort',
    'sleep',
    'getHealth',
    'waitForHealthPoll',
    'isApiCompatible',
    'appendEngineLogLine',
    'resolveEngineEntrypoints',
    'getBundledEnginePath',
    'injectFfmpegPathEnv',
    'resetEngineLogFile',
    'attachEngineProcessLogs',
];

/**
 * @param {object} host bridge bindings (mutable engineProc / engineBaseUrl / batchRunning via getters/setters)
 */
function createEngineEnsureRunning(host) {
    if (!host || typeof host !== 'object') {
        throw new Error('createEngineEnsureRunning: host required');
    }
    const missing = REQUIRED_HOST_KEYS.filter((k) => host[k] == null);
    if (missing.length) {
        throw new Error(`createEngineEnsureRunning: incomplete host (missing: ${missing.join(', ')})`);
    }

    const {
        getEngineProc,
        setEngineProc,
        getEngineBaseUrl,
        setEngineBaseUrl,
        getBatchRunning,
        mergeEngineOptions,
        resolveEngineInstallPath,
        DEFAULT_ENGINE_URL,
        parseHostPort,
        stopEngineProcess,
        stopEngineProcessAndPort,
        killListenersOnPort,
        sleep,
        getHealth,
        waitForHealthPoll,
        isApiCompatible,
        appendEngineLogLine,
        resolveEngineEntrypoints,
        getBundledEnginePath,
        injectFfmpegPathEnv,
        resetEngineLogFile,
        attachEngineProcessLogs,
    } = host;

    const spawnFn = typeof host.spawn === 'function' ? host.spawn : spawn;

    /** Serialize concurrent ensure calls to avoid port 10048 spawn storms. */
    let ensureChain = Promise.resolve();
    let lastEngineExitCode = null;

    async function waitForHealth(baseUrl, opts = {}) {
        return waitForHealthPoll(baseUrl, { ...opts, getHealth });
    }

    function isEngineChildAlive() {
        const engineProc = getEngineProc();
        return !!(engineProc && engineProc.exitCode == null && !engineProc.killed);
    }

    function readEngineEnsurePolicy(forceRestart = false) {
        const { decideEngineEnsureAction } = require('./engine-ensure-policy');
        let computeBusyKind = '';
        try {
            const status = require('./compute-task-lock').getStatus();
            if (status?.busy) computeBusyKind = String(status.kind || '').trim();
        } catch (_) { /* ignore */ }
        return decideEngineEnsureAction({
            forceRestart: !!forceRestart,
            batchRunning: !!getBatchRunning(),
            computeBusyKind,
            childAlive: isEngineChildAlive(),
        });
    }

    async function ensureEngineRunning(options = {}) {
        const run = () => ensureEngineRunningUnlocked(options);
        const p = ensureChain.then(run, run);
        ensureChain = p.then(() => undefined, () => undefined);
        return p;
    }

    async function ensureEngineRunningUnlocked(options = {}) {
        const opts = mergeEngineOptions(options);
        opts.engineInstallPath = resolveEngineInstallPath(opts.engineInstallPath);
        setEngineBaseUrl(opts.engineUrl || DEFAULT_ENGINE_URL);
        const engineBaseUrl = () => getEngineBaseUrl();
        const pinComputeLockUrl = (baseUrl) => {
            try {
                require('./compute-task-lock').setEngineLockBaseUrl(baseUrl || engineBaseUrl());
            } catch (_) { /* ignore */ }
        };
        const forceRestart = !!options.forceRestart;
        const shouldStop = typeof options.shouldStop === 'function' ? options.shouldStop : null;
        const preserve = readEngineEnsurePolicy(forceRestart);

        if (forceRestart) {
            if (!preserve.allowForceRestart) {
                return {
                    ok: false,
                    error: '字幕任务运行中，无法重启引擎',
                    code: 'compute_busy',
                };
            }
            // Torch reimport poison / CUDA load failures need a *new* Python process.
            // Never treat "port still healthy after kill" as a successful restart.
            const { port } = parseHostPort(engineBaseUrl());
            stopEngineProcess();
            killListenersOnPort(port);
            await sleep(800);
            let afterKill = await getHealth(engineBaseUrl(), { timeoutMs: 2000 }).catch(() => ({ ok: false }));
            if (afterKill.ok && afterKill.data?.ok) {
                appendEngineLogLine(
                    '[engine] 强制重启：端口仍被占用，再次结束监听…'
                );
                stopEngineProcessAndPort();
                killListenersOnPort(port);
                await sleep(1200);
                afterKill = await getHealth(engineBaseUrl(), { timeoutMs: 2000 }).catch(() => ({ ok: false }));
            }
            if (afterKill.ok && afterKill.data?.ok) {
                appendEngineLogLine(
                    '[engine] 强制重启失败：端口仍被占用，未能拉起新进程'
                );
                return {
                    ok: false,
                    error: '强制重启失败：引擎端口仍被占用（未能拉起新进程）',
                    code: 'force_restart_port_busy',
                    health: afterKill.data,
                };
            }
            // Fall through to spawn a fresh engine below.
        }

        const health = await getHealth(engineBaseUrl(), { timeoutMs: 2000 }).catch(() => ({ ok: false }));
        if (!forceRestart && health.ok && health.data?.ok) {
            if (!isApiCompatible(health.data.apiVersion)) {
                return {
                    ok: false,
                    error: `引擎 API 主版本不兼容（got ${health.data.apiVersion}）`,
                    health: health.data,
                };
            }
            pinComputeLockUrl(engineBaseUrl());
            return { ok: true, baseUrl: engineBaseUrl(), health: health.data, spawned: false };
        }

        // Prior Start may have left a still-warming child after a short health miss.
        // Wait on it instead of taskkill + respawn (cold torch preload is expensive).
        if (!forceRestart && isEngineChildAlive() && preserve.allowKill) {
            appendEngineLogLine('[engine] 检测到未就绪的引擎进程，继续等待冷启动…');
            const warming = await waitForHealth(engineBaseUrl(), {
                timeoutMs: 120000,
                shouldStop,
                isChildAlive: isEngineChildAlive,
                getChildExitCode: () => lastEngineExitCode,
            });
            if (warming.ok && warming.data?.ok) {
                if (!isApiCompatible(warming.data.apiVersion)) {
                    stopEngineProcessAndPort();
                    return {
                        ok: false,
                        error: `引擎 API 主版本不兼容（got ${warming.data?.apiVersion}）`,
                        health: warming.data,
                    };
                }
                pinComputeLockUrl(engineBaseUrl());
                return {
                    ok: true,
                    baseUrl: engineBaseUrl(),
                    health: warming.data,
                    spawned: false,
                    resumedWarmup: true,
                };
            }
            if (warming.cancelled) {
                return { ok: false, error: '已取消', cancelled: true };
            }
            // Child died or still unreachable — fall through to a clean spawn.
            if (!isEngineChildAlive()) {
                appendEngineLogLine(
                    `[engine] 冷启动进程已退出，将重新拉起：${warming.error || 'unknown'}`,
                );
            }
        }

        // Settings → 模型 (and other catalog probes) call ensureEngineRunning while ASR
        // may block the engine event loop. A short health timeout must not taskkill the job.
        if (!preserve.allowKill) {
            if (preserve.treatAsRunning) {
                pinComputeLockUrl(engineBaseUrl());
                return {
                    ok: true,
                    baseUrl: engineBaseUrl(),
                    health: health.data || null,
                    spawned: false,
                    busy: true,
                };
            }
            return {
                ok: false,
                error: '字幕任务运行中，暂不拉起/重启引擎',
                code: 'compute_busy',
            };
        }

        if (!opts.engineAutoStart) {
            return { ok: false, error: '引擎未运行，且未启用自动启动' };
        }

        const entry = resolveEngineEntrypoints(opts.engineInstallPath);
        if (!entry) {
            const hint = opts.engineInstallPath
                || getBundledEnginePath()
                || '（未找到内置引擎）';
            return {
                ok: false,
                error: `未找到引擎：请确认内置目录 ${hint} 为独立版（含 runtime\\python.exe），或浏览自定义引擎目录，或启动已有 serve 并填写引擎 URL`,
            };
        }

        const spawnOnce = async () => {
            lastEngineExitCode = null;
            stopEngineProcess();
            const { host: bindHost, port } = parseHostPort(engineBaseUrl());
            // Extra port sweep before bind — concurrent callers used to race here.
            killListenersOnPort(port);
            await sleep(400);
            const args = [...entry.args, 'serve', '--host', bindHost, '--port', String(port)];
            let env = {
                ...process.env,
                TRANSUB_ENGINE_STUB: process.env.TRANSUB_ENGINE_STUB || '',
                TQDM_DISABLE: '1',
                // Force UTF-8 so Chinese progress / logs are not GBK-mojibake on Windows.
                PYTHONIOENCODING: process.env.PYTHONIOENCODING || 'utf-8',
                PYTHONUTF8: process.env.PYTHONUTF8 || '1',
                // Suppress transformers/UserWarning spam in captured stderr.
                PYTHONWARNINGS: process.env.PYTHONWARNINGS
                    || 'ignore::UserWarning:transformers,ignore::FutureWarning',
            };
            try {
                const { applyEngineTempEnv } = require('./temp-cleanup');
                // Keep ASR/Demucs/ffmpeg scratch out of %TEMP%; cleared after each job.
                env = applyEngineTempEnv(env);
            } catch { /* optional */ }
            try {
                const { applyProxyToEnv, normalizeProxyOptions } = require('./proxy-settings');
                // Prefer explicit proxy fields on opts (full settings payload); otherwise keep
                // the proxy already applied to the main process (activeProxy / process.env).
                if (Object.prototype.hasOwnProperty.call(opts, 'proxyEnabled')
                    || Object.prototype.hasOwnProperty.call(opts, 'proxyUrl')) {
                    applyProxyToEnv(env, normalizeProxyOptions(opts));
                } else {
                    applyProxyToEnv(env);
                }
            } catch { /* proxy optional */ }
            const hfEndpoint = String(opts.engineHfEndpoint || '').trim().replace(/\/+$/, '');
            if (hfEndpoint) {
                env.HF_ENDPOINT = hfEndpoint;
            }
            const hfToken = String(opts.engineHfToken || opts.hfToken || '').trim();
            if (hfToken) {
                env.HF_TOKEN = hfToken;
                env.HUGGING_FACE_HUB_TOKEN = hfToken;
            }
            // Avoid Xet/CAS 401s when pulling LFS weights via domestic mirrors.
            if (!env.HF_HUB_DISABLE_XET) {
                env.HF_HUB_DISABLE_XET = '1';
            }
            // huggingface_hub defaults to 10s; too short for mirror/CDN hops on large weights.
            if (!env.HF_HUB_DOWNLOAD_TIMEOUT) {
                env.HF_HUB_DOWNLOAD_TIMEOUT = '120';
            }
            if (!env.HF_HUB_ETAG_TIMEOUT) {
                env.HF_HUB_ETAG_TIMEOUT = '30';
            }
            env = injectFfmpegPathEnv(env, opts.ffmpegPath, opts.engineInstallPath);
            if (!env.TRANSUB_ENGINE_HOME && opts.engineInstallPath) {
                env.TRANSUB_ENGINE_HOME = path.resolve(String(opts.engineInstallPath));
            }
            try {
                const tdpFs = require('./tdp-fs');
                env.TRANSUB_TDP_DIR = tdpFs.getTdpRoot();
            } catch { /* optional */ }
            try {
                const cudaScan = require('./cuda-runtime-scan');
                const { getWritableRoot, getInstallRoot, getBundledEnginePath: getBundled } = require('./app-paths');
                let writable = '';
                let install = '';
                try { writable = getWritableRoot(); } catch { /* ignore */ }
                try { install = getInstallRoot(); } catch { /* ignore */ }
                const engineRoot = opts.engineInstallPath || getBundled() || '';
                const joined = cudaScan.formatCudaExtraRootsEnv({
                    engineRoots: [engineRoot].filter(Boolean),
                    writableRoot: writable,
                    startDirs: [engineRoot, writable, install].filter(Boolean),
                });
                if (joined) env.TRANSUB_CUDA_EXTRA_ROOTS = joined;
            } catch { /* optional */ }
            try {
                resetEngineLogFile();
                const engineProc = spawnFn(entry.command, args, {
                    cwd: entry.cwd || opts.engineInstallPath,
                    env,
                    windowsHide: true,
                    stdio: ['ignore', 'pipe', 'pipe'],
                });
                setEngineProc(engineProc);
                attachEngineProcessLogs(engineProc);
                appendEngineLogLine(`[engine] 启动 ${entry.command} ${args.join(' ')}`);
                engineProc.on('exit', (code, signal) => {
                    lastEngineExitCode = code;
                    appendEngineLogLine(`[engine] 进程退出 code=${code} signal=${signal || ''}`);
                    setEngineProc(null);
                    // Unexpected exit can leave a sibling listener on the port (respawn race).
                    if (code !== 0 && code != null) {
                        try {
                            const { port: exitPort } = parseHostPort(getEngineBaseUrl() || DEFAULT_ENGINE_URL);
                            killListenersOnPort(exitPort);
                        } catch { /* ignore */ }
                    }
                });
            } catch (err) {
                return { ok: false, error: `无法启动引擎: ${err.message || err}` };
            }

            // Cold start: cmd_serve preloads torch / probes GPU *before* binding the
            // port, so /v1/health can stay unreachable for well over 45s on first
            // launch. Killing a still-alive child then made the first「开始任务」
            // fail with opaque "HTTP 0" while the second click succeeded.
            const SPAWN_HEALTH_TIMEOUT_MS = 120000;
            const SPAWN_HEALTH_GRACE_MS = 60000;
            const healthWaitOpts = {
                shouldStop,
                isChildAlive: isEngineChildAlive,
                getChildExitCode: () => lastEngineExitCode,
            };
            let ready = await waitForHealth(engineBaseUrl(), {
                ...healthWaitOpts,
                timeoutMs: SPAWN_HEALTH_TIMEOUT_MS,
            });
            if (!ready.ok && !ready.cancelled && isEngineChildAlive()) {
                appendEngineLogLine('[engine] 冷启动尚未绑定端口，继续等待…');
                ready = await waitForHealth(engineBaseUrl(), {
                    ...healthWaitOpts,
                    timeoutMs: SPAWN_HEALTH_GRACE_MS,
                });
            }
            if (!ready.ok) {
                const live = getEngineProc();
                const exitCode = ready.exitCode != null
                    ? ready.exitCode
                    : (lastEngineExitCode != null
                        ? lastEngineExitCode
                        : (live && live.exitCode != null ? live.exitCode : null));
                const stillAlive = isEngineChildAlive();
                if (stillAlive) {
                    // Leave the child so the next Start can attach without a full respawn.
                    appendEngineLogLine(
                        '[engine] 健康检查超时，保留引擎进程供下次重试（勿杀冷启动中的 Python）',
                    );
                } else {
                    stopEngineProcess();
                }
                const baseErr = ready.cancelled
                    ? '已取消'
                    : (ready.error || '引擎启动后健康检查失败');
                const withExit = (!ready.cancelled && exitCode != null
                    && !String(baseErr).includes(`退出码 ${exitCode}`))
                    ? `${baseErr}（进程退出码 ${exitCode}）`
                    : baseErr;
                return {
                    ok: false,
                    error: withExit,
                    cancelled: !!ready.cancelled,
                    exitCode: exitCode == null ? undefined : exitCode,
                    code: exitCode === 75
                        ? 'torch_cold_heal_exit'
                        : (stillAlive ? 'engine_starting' : undefined),
                };
            }
            if (!isApiCompatible(ready.data?.apiVersion)) {
                stopEngineProcessAndPort();
                return {
                    ok: false,
                    error: `引擎 API 主版本不兼容（got ${ready.data?.apiVersion}）`,
                    health: ready.data,
                };
            }
            pinComputeLockUrl(engineBaseUrl());
            return { ok: true, baseUrl: engineBaseUrl(), health: ready.data, spawned: true };
        };

        let result = await spawnOnce();
        // Exit 75 = serve queued cold CUDA torch reinstall and exited for a clean respawn.
        if (!result.ok && result.code === 'torch_cold_heal_exit' && !options._torchHealRetried) {
            appendEngineLogLine('[engine] Torch 冷修复退出，正在重新拉起引擎…');
            await sleep(1000);
            result = await spawnOnce();
            if (result.ok) result.torchHealed = true;
        }
        return result;
    }

    return {
        ensureEngineRunning,
        readEngineEnsurePolicy,
        isEngineChildAlive,
        waitForHealth,
    };
}

module.exports = {
    createEngineEnsureRunning,
    REQUIRED_HOST_KEYS,
};
