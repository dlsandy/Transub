/**
 * Detached zip-update applier. Run with ELECTRON_RUN_AS_NODE after the main app quits.
 * Args: <metaJsonPath>
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function loadMerge() {
    // Prefer sibling module next to this script (asar or plain).
    try {
        return require('./zip-update-merge');
    } catch {
        /* fall through */
    }
    const fromArg = process.argv[3];
    if (fromArg && fs.existsSync(fromArg)) {
        return require(fromArg);
    }
    throw new Error('无法加载 zip-update-merge');
}

function loadStatusWriter() {
    try {
        return require('./zip-update-status');
    } catch {
        /* fall through */
    }
    // Minimal fallback if sibling module is unavailable outside asar.
    return {
        writeZipUpdateStatus(statusPath, patch = {}) {
            if (!statusPath) return;
            try {
                fs.mkdirSync(path.dirname(statusPath), { recursive: true });
                fs.writeFileSync(
                    statusPath,
                    `${JSON.stringify({
                        phase: patch.phase || 'working',
                        message: patch.message || '',
                        percent: Number(patch.percent) || 0,
                        error: patch.error || '',
                        updatedAt: new Date().toISOString(),
                    }, null, 2)}\n`,
                    'utf8',
                );
            } catch { /* ignore */ }
        },
    };
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function isPidAlive(pid) {
    const n = Number(pid);
    if (!Number.isFinite(n) || n <= 0) return false;
    try {
        process.kill(n, 0);
        return true;
    } catch (err) {
        return err && err.code === 'EPERM';
    }
}

async function waitForPidExit(pid, timeoutMs = 120000, onTick) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (!isPidAlive(pid)) {
            await sleep(800);
            return;
        }
        if (typeof onTick === 'function') {
            try { onTick(); } catch { /* ignore */ }
        }
        await sleep(400);
    }
    throw new Error(`等待进程退出超时 (pid=${pid})`);
}

function appendLog(logPath, line) {
    if (!logPath) return;
    try {
        fs.mkdirSync(path.dirname(logPath), { recursive: true });
        fs.appendFileSync(logPath, `${new Date().toISOString()} ${line}\n`, 'utf8');
    } catch {
        /* ignore */
    }
}

function launchExe(exePath, cwd) {
    const child = spawn(exePath, [], {
        cwd,
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
    });
    child.unref();
}

function cleanupPaths(paths, merge) {
    for (const p of paths || []) {
        if (!p) continue;
        try {
            if (fs.existsSync(p)) merge.rimrafSafe(p);
        } catch {
            /* ignore */
        }
    }
}

async function main() {
    const metaPath = process.argv[2];
    if (!metaPath || !fs.existsSync(metaPath)) {
        throw new Error('缺少更新元数据文件');
    }
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const logPath = meta.logPath || '';
    const statusPath = meta.statusPath || '';
    const { writeZipUpdateStatus } = loadStatusWriter();
    const setStatus = (patch) => writeZipUpdateStatus(statusPath, patch);
    const merge = loadMerge();

    appendLog(logPath, `start waitPid=${meta.waitPid} install=${meta.installRoot}`);
    setStatus({
        phase: 'waiting',
        message: '正在等待主程序退出…',
        percent: 4,
    });

    await waitForPidExit(meta.waitPid, Number(meta.waitTimeoutMs) || 120000, () => {
        setStatus({
            phase: 'waiting',
            message: '正在等待主程序退出（请勿强制结束进程）…',
            percent: 6,
        });
    });
    appendLog(logPath, 'app exited, applying merge');
    setStatus({
        phase: 'preparing',
        message: '主程序已退出，开始安装更新…',
        percent: 10,
    });

    const result = merge.applyZipUpdateMerge({
        installRoot: meta.installRoot,
        packageRoot: meta.packageRoot,
        preserveRelPaths: meta.preserveRelPaths,
        onProgress: (info) => {
            setStatus({
                phase: info.phase || 'copying',
                message: info.message || '正在安装更新…',
                percent: info.percent,
            });
            appendLog(logPath, `${info.phase || 'progress'} ${info.percent || 0}% ${info.message || ''}`);
        },
    });
    appendLog(logPath, `merge ok preserved=${(result.preserved || []).length}`);

    const exePath = meta.exePath || path.join(meta.installRoot, 'Transub.exe');
    if (!fs.existsSync(exePath)) {
        throw new Error(`安装后未找到可执行文件: ${exePath}`);
    }

    setStatus({
        phase: 'relaunching',
        message: '即将重新启动 Transub…',
        percent: 97,
    });
    launchExe(exePath, meta.installRoot);
    appendLog(logPath, `relaunched ${exePath}`);

    setStatus({
        phase: 'done',
        message: '升级完成，正在启动新版本…',
        percent: 100,
    });

    // Keep status file briefly for the progress UI; do not delete it with cleanupPaths.
    const cleanup = [...(meta.cleanupPaths || []), metaPath].filter((p) => p && p !== statusPath);
    cleanupPaths(cleanup, merge);
    appendLog(logPath, 'done');
}

main().catch((err) => {
    const msg = err && err.message ? err.message : String(err);
    try {
        const metaPath = process.argv[2];
        if (metaPath && fs.existsSync(metaPath)) {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            appendLog(meta.logPath || '', `ERROR ${msg}`);
            try {
                const { writeZipUpdateStatus } = loadStatusWriter();
                writeZipUpdateStatus(meta.statusPath || '', {
                    phase: 'error',
                    message: `升级失败：${msg}`,
                    percent: 100,
                    error: msg,
                });
            } catch { /* ignore */ }
        }
    } catch {
        /* ignore */
    }
    console.error('[zip-update-apply]', msg);
    process.exitCode = 1;
    // Keep process alive briefly so logs flush on Windows
    setTimeout(() => process.exit(1), 200);
});
