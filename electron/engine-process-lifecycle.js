/**
 * Engine process stop / port reclaim / VRAM release before local LLM.
 */
const { spawnSync } = require('child_process');

/**
 * @param {{
 *   getProc: () => import('child_process').ChildProcess | null,
 *   setProc: (p: any) => void,
 *   getBaseUrl: () => string,
 *   parseHostPort: (url: string) => { host: string, port: number },
 *   defaultUrl: string,
 *   appendEngineLogLine: (line: string, sender?: any) => void,
 *   releaseGpuMemory: (baseUrl: string, opts?: object) => Promise<any>,
 *   mergeEngineOptions: (opts: object) => object,
 *   sleep: (ms: number) => Promise<void>,
 *   spawnSyncFn?: typeof spawnSync,
 *   stopLlamaServer?: () => void,
 *   platform?: string,
 * }} deps
 */
function createEngineProcessLifecycle(deps) {
    const runSpawn = deps.spawnSyncFn || spawnSync;
    const platform = deps.platform || process.platform;

    function stopEngineProcess() {
        const engineProc = deps.getProc();
        if (!engineProc) return;
        const pid = engineProc.pid;
        try {
            if (platform === 'win32' && pid) {
                runSpawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
                    windowsHide: true,
                    stdio: 'ignore',
                    timeout: 15000,
                });
            } else {
                engineProc.kill('SIGTERM');
            }
        } catch { /* ignore */ }
        try {
            engineProc.kill();
        } catch { /* ignore */ }
        deps.setProc(null);
    }

    function killListenersOnPort(port) {
        const p = Number(port) || 8765;
        if (!p) return;
        try {
            if (platform === 'win32') {
                const ps = `
$conns = Get-NetTCPConnection -LocalPort ${p} -State Listen -ErrorAction SilentlyContinue;
foreach ($c in @($conns)) {
  $procId = [int]$c.OwningProcess;
  if ($procId -gt 0) { taskkill /PID $procId /T /F 2>$null | Out-Null }
}
`;
                runSpawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], {
                    windowsHide: true,
                    stdio: 'ignore',
                    timeout: 15000,
                });
            } else {
                const out = runSpawn('lsof', ['-ti', `tcp:${p}`], { encoding: 'utf8' });
                const pids = String(out.stdout || '')
                    .split(/\s+/)
                    .map((x) => x.trim())
                    .filter(Boolean);
                for (const pid of pids) {
                    try { process.kill(Number(pid), 'SIGTERM'); } catch { /* ignore */ }
                }
            }
        } catch { /* ignore */ }
    }

    function stopEngineProcessAndPort() {
        stopEngineProcess();
        try {
            const { port } = deps.parseHostPort(deps.getBaseUrl() || deps.defaultUrl);
            killListenersOnPort(port);
        } catch { /* ignore */ }
    }

    function stopLlamaServerQuiet() {
        try {
            if (typeof deps.stopLlamaServer === 'function') {
                deps.stopLlamaServer();
            } else {
                require('./advanced-llama-server').stopLlamaServer();
            }
        } catch { /* ignore */ }
    }

    function reclaimLocalComputeAfterEngineBatch({
        usedExternalMt = false,
        failedOrCancelled = false,
    } = {}) {
        if (usedExternalMt || failedOrCancelled) {
            stopLlamaServerQuiet();
        }
        if (failedOrCancelled) {
            stopEngineProcessAndPort();
            deps.appendEngineLogLine('[engine] 任务失败或已中断 · 已停止引擎与本地 LLM 进程');
        } else if (usedExternalMt) {
            deps.appendEngineLogLine('[engine] 批次结束 · 已停止本地 LLM（llama-server）');
        }
    }

    async function releaseEngineVramBeforeLocalLlm(options = {}) {
        const opts = deps.mergeEngineOptions(options || {});
        const baseUrl = opts.engineUrl || deps.getBaseUrl() || deps.defaultUrl;
        const { port } = deps.parseHostPort(baseUrl);
        try {
            const soft = await deps.releaseGpuMemory(baseUrl, { timeoutMs: 15000 });
            if (soft?.ok) {
                deps.appendEngineLogLine('[engine] 已释放 GPU 缓存（准备本地 LLM）');
            }
        } catch { /* ignore */ }
        stopEngineProcess();
        killListenersOnPort(port);
        await deps.sleep(1200);
        deps.appendEngineLogLine('[engine] 已停止引擎进程以释放显存（Sakura / llama-server）');
    }

    return {
        stopEngineProcess,
        stopEngineProcessAndPort,
        stopLlamaServerQuiet,
        reclaimLocalComputeAfterEngineBatch,
        killListenersOnPort,
        releaseEngineVramBeforeLocalLlm,
    };
}

module.exports = {
    createEngineProcessLifecycle,
};
