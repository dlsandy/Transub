/**
 * Free llama-server listen ports.
 * The async path must not spawnSync: Get-NetTCPConnection blocks Electron's main
 * thread (near-zero CPU) and freezes the main window while a model is loading.
 */
const { execFile, spawnSync } = require('child_process');

function powershellListenScript(port) {
    const p = Number(port);
    return `
$conns = Get-NetTCPConnection -LocalPort ${p} -State Listen -ErrorAction SilentlyContinue;
$killed = $false;
foreach ($c in @($conns)) {
  $procId = [int]$c.OwningProcess;
  if ($procId -gt 0) {
    taskkill /PID $procId /T /F 2>$null | Out-Null;
    $killed = $true;
  }
}
if ($killed) { '1' } else { '0' }
`;
}

function createLlmPortReclaim(deps = {}) {
    const platform = deps.platform || process.platform;
    const execFileFn = deps.execFileFn || execFile;
    const spawnSyncFn = deps.spawnSyncFn || spawnSync;

    function killListenersOnPortSync(port) {
        const p = Number(port);
        if (!Number.isFinite(p) || p <= 0) return false;
        try {
            if (platform === 'win32') {
                const r = spawnSyncFn('powershell.exe', [
                    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', powershellListenScript(p),
                ], {
                    windowsHide: true,
                    encoding: 'utf8',
                    timeout: 15000,
                });
                return String(r?.stdout || '').trim() === '1';
            }
            const out = spawnSyncFn('lsof', ['-ti', `tcp:${p}`], { encoding: 'utf8' });
            return killPidsFromLsof(String(out?.stdout || ''), deps.killPid);
        } catch {
            return false;
        }
    }

    function killListenersOnPortAsync(port) {
        const p = Number(port);
        if (!Number.isFinite(p) || p <= 0) return Promise.resolve(false);
        return new Promise((resolve) => {
            try {
                if (platform === 'win32') {
                    execFileFn('powershell.exe', [
                        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', powershellListenScript(p),
                    ], {
                        windowsHide: true,
                        encoding: 'utf8',
                        timeout: 15000,
                    }, (_err, stdout) => {
                        resolve(String(stdout || '').trim() === '1');
                    });
                    return;
                }
                execFileFn('lsof', ['-ti', `tcp:${p}`], { encoding: 'utf8', timeout: 8000 }, (_err, stdout) => {
                    resolve(killPidsFromLsof(String(stdout || ''), deps.killPid));
                });
            } catch {
                resolve(false);
            }
        });
    }

    function killPortsSync(ports) {
        let any = false;
        for (const port of ports || []) {
            if (killListenersOnPortSync(port)) any = true;
        }
        return any;
    }

    async function killPortsAsync(ports) {
        const flags = await Promise.all((ports || []).map((port) => killListenersOnPortAsync(port)));
        return flags.some(Boolean);
    }

    return {
        killListenersOnPortSync,
        killListenersOnPortAsync,
        killPortsSync,
        killPortsAsync,
    };
}

function killPidsFromLsof(stdout, killPid) {
    const pids = String(stdout || '')
        .split(/\s+/)
        .map((x) => x.trim())
        .filter(Boolean);
    const kill = typeof killPid === 'function'
        ? killPid
        : (pid) => {
            process.kill(Number(pid), 'SIGTERM');
        };
    let killed = false;
    for (const pid of pids) {
        try {
            kill(pid);
            killed = true;
        } catch { /* ignore */ }
    }
    return killed;
}

module.exports = {
    powershellListenScript,
    createLlmPortReclaim,
    killPidsFromLsof,
};
