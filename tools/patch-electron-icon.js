/**
 * Patch node_modules/electron/dist/electron.exe with Transub app.ico.
 * Without this, `npm start` on Windows shows the Electron default taskbar icon
 * (the process image is electron.exe, so Windows prefers its embedded icon).
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { runRcedit } = require('./rcedit-win');

const root = path.resolve(__dirname, '..');
const electronDir = path.join(root, 'node_modules', 'electron');
const distPath = path.join(electronDir, 'dist');
const exePath = path.join(distPath, 'electron.exe');
const iconPath = path.join(root, 'electron', 'app.ico');
const stampPath = path.join(distPath, '.transub-icon-stamp');

function readElectronVersion() {
    try {
        return fs.readFileSync(path.join(distPath, 'version'), 'utf8').trim().replace(/^v/, '');
    } catch {
        return '';
    }
}

function iconFingerprint() {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(iconPath)).digest('hex');
    return `${readElectronVersion()}:${hash}`;
}

function alreadyPatched() {
    if (!fs.existsSync(stampPath) || !fs.existsSync(exePath)) return false;
    try {
        const stamp = fs.readFileSync(stampPath, 'utf8').trim();
        if (stamp !== iconFingerprint()) return false;
        // Re-patch if electron.exe was replaced after the stamp (e.g. reinstall same version)
        return fs.statSync(stampPath).mtimeMs >= fs.statSync(exePath).mtimeMs;
    } catch {
        return false;
    }
}

function patchElectronIcon({ quiet = false } = {}) {
    if (process.platform !== 'win32') return false;
    if (!fs.existsSync(exePath)) {
        if (!quiet) console.warn('[patch-electron-icon] 未找到 electron.exe，跳过');
        return false;
    }
    if (!fs.existsSync(iconPath)) {
        if (!quiet) console.warn('[patch-electron-icon] 未找到 electron/app.ico，跳过');
        return false;
    }
    if (alreadyPatched()) {
        if (!quiet) console.log('[patch-electron-icon] 已是 Transub 图标，跳过');
        return true;
    }

    try {
        runRcedit([exePath, '--set-icon', iconPath]);
        fs.writeFileSync(stampPath, `${iconFingerprint()}\n`, 'utf8');
        if (!quiet) console.log('[patch-electron-icon] 已写入 electron.exe 图标');
        return true;
    } catch (err) {
        if (!quiet) {
            console.warn('[patch-electron-icon] 写入失败（任务栏可能仍显示 Electron 默认图标）:', err.message);
        }
        return false;
    }
}

if (require.main === module) {
    // Always exit 0 so `npm start` is not blocked when rcedit is unavailable.
    patchElectronIcon({ quiet: false });
}

module.exports = { patchElectronIcon };
