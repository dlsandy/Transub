const { downloadArtifact } = require('@electron/get');
const extract = require('extract-zip');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

process.env.ELECTRON_MIRROR = process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/';

const version = require('../node_modules/electron/package.json').version;
const distPath = path.resolve(__dirname, '..', 'node_modules', 'electron', 'dist');
const electronDir = path.resolve(__dirname, '..', 'node_modules', 'electron');
const exePath = path.join(distPath, 'electron.exe');

function isInstalled() {
    try {
        const ver = fs.readFileSync(path.join(distPath, 'version'), 'utf-8').replace(/^v/, '');
        const platformPath = fs.readFileSync(path.join(electronDir, 'path.txt'), 'utf-8').trim();
        return ver === version && platformPath === 'electron.exe' && fs.existsSync(exePath);
    } catch {
        return false;
    }
}

function extractZip(zipPath, dest) {
    if (process.platform === 'win32') {
        execFileSync('powershell.exe', [
            '-NoProfile', '-Command',
            `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${dest.replace(/'/g, "''")}' -Force`,
        ], { stdio: 'inherit' });
        return;
    }
    return extract(zipPath, { dir: dest });
}

async function main() {
    if (isInstalled()) {
        console.log('Electron already installed:', exePath);
        return;
    }

    console.log('Downloading Electron', version, '...');
    const zipPath = await downloadArtifact({
        version,
        artifactName: 'electron',
        platform: process.platform,
        arch: process.arch === 'x64' ? 'x64' : process.arch,
    });
    console.log('Zip:', zipPath);

    if (fs.existsSync(distPath)) {
        fs.rmSync(distPath, { recursive: true, force: true });
    }
    fs.mkdirSync(distPath, { recursive: true });

    console.log('Extracting to', distPath, '...');
    await extractZip(zipPath, distPath);

    fs.writeFileSync(path.join(electronDir, 'path.txt'), 'electron.exe', 'utf8');
    fs.writeFileSync(path.join(distPath, 'version'), `v${version}`);

    if (!fs.existsSync(exePath)) {
        throw new Error('electron.exe not found after extract');
    }
    console.log('OK:', exePath);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
