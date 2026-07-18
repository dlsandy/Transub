/**
 * Ensure Electron binary is present under node_modules/electron/dist.
 * Electron 42+ no longer downloads via its own npm postinstall; we invoke
 * the package's install.js (same as `npx install-electron`) with the China mirror.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

process.env.ELECTRON_MIRROR = process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/';

const electronDir = path.resolve(__dirname, '..', 'node_modules', 'electron');
const installJs = path.join(electronDir, 'install.js');
const version = require(path.join(electronDir, 'package.json')).version;
const distPath = path.join(electronDir, 'dist');
const exeName = process.platform === 'win32' ? 'electron.exe' : 'electron';
const exePath = path.join(distPath, exeName);

function isInstalled() {
    try {
        const ver = fs.readFileSync(path.join(distPath, 'version'), 'utf-8').replace(/^v/, '');
        const platformPath = fs.readFileSync(path.join(electronDir, 'path.txt'), 'utf-8').trim();
        return ver === version && platformPath === exeName && fs.existsSync(exePath);
    } catch {
        return false;
    }
}

if (!fs.existsSync(installJs)) {
    console.error('[setup-electron] electron package missing; run npm install first');
    process.exit(1);
}

if (!isInstalled()) {
    console.log('Downloading Electron', version, '...');
    const result = spawnSync(process.execPath, [installJs], {
        cwd: electronDir,
        env: process.env,
        stdio: 'inherit',
    });

    if (result.status !== 0) {
        process.exit(result.status || 1);
    }

    if (!fs.existsSync(exePath)) {
        console.error('[setup-electron] electron binary not found after install:', exePath);
        process.exit(1);
    }

    console.log('OK:', exePath);
} else {
    console.log('Electron already installed:', exePath);
}

// Windows taskbar uses the host exe icon; keep electron.exe branded for `npm start`.
if (process.platform === 'win32') {
    try {
        require('./patch-electron-icon').patchElectronIcon({ quiet: false });
    } catch (err) {
        console.warn('[setup-electron] patch icon skipped:', err.message);
    }
}
