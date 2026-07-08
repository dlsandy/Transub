const { spawn } = require('child_process');
const path = require('path');
const { shell } = require('electron');

function scheduleSystemShutdown(delaySec = 60, message = '') {
    const sec = Math.max(0, Math.floor(Number(delaySec) || 0));
    if (process.platform === 'win32') {
        const args = ['/s', '/t', String(sec)];
        if (message) args.push('/c', String(message).slice(0, 512));
        try {
            const child = spawn('shutdown', args, { windowsHide: true, detached: true, stdio: 'ignore' });
            child.unref();
            return { ok: true, delaySec: sec };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    }
    return { ok: false, error: '当前系统不支持自动关机' };
}

function scheduleSystemSleep() {
    if (process.platform !== 'win32') {
        return { ok: false, error: '当前系统不支持睡眠' };
    }
    try {
        const child = spawn('rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0'], {
            windowsHide: true,
            detached: true,
            stdio: 'ignore',
        });
        child.unref();
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    }
}

function playCompletionSound() {
    if (process.platform !== 'win32') return { ok: false };
    try {
        spawn('powershell.exe', [
            '-NoProfile', '-Command',
            '[console]::beep(880,180); Start-Sleep -Milliseconds 80; [console]::beep(1100,220)',
        ], { windowsHide: true, detached: true, stdio: 'ignore' }).unref();
        return { ok: true };
    } catch {
        return { ok: false };
    }
}

function openPathInShell(targetPath) {
    const p = String(targetPath || '').trim();
    if (!p) return { ok: false, error: '缺少路径' };
    try {
        shell.openPath(path.resolve(p));
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    }
}

module.exports = {
    scheduleSystemShutdown,
    scheduleSystemSleep,
    playCompletionSound,
    openPathInShell,
};
