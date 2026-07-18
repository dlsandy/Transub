/**
 * Download bundled FFmpeg/ffprobe into _internal/bin for reproducible setups.
 * Prefer gyan.dev essentials build (Windows x64). Skips if binaries already exist
 * unless --force is passed.
 *
 * Usage:
 *   node tools/setup-ffmpeg.js
 *   node tools/setup-ffmpeg.js --force
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const binDir = path.join(root, '_internal', 'bin');
const FFMPEG_URL = process.env.TRANSUB_FFMPEG_URL
    || 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip';
const FORCE = process.argv.includes('--force');

function existsExe(name) {
    const p = path.join(binDir, process.platform === 'win32' ? `${name}.exe` : name);
    return fs.existsSync(p) ? p : null;
}

function download(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        const getter = url.startsWith('https') ? https : http;
        const req = getter.get(url, { headers: { 'User-Agent': 'Transub-setup-ffmpeg' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                file.close();
                fs.unlinkSync(dest);
                download(res.headers.location, dest).then(resolve, reject);
                return;
            }
            if (res.statusCode !== 200) {
                file.close();
                fs.unlinkSync(dest);
                reject(new Error(`Download failed: HTTP ${res.statusCode}`));
                return;
            }
            res.pipe(file);
            file.on('finish', () => file.close(() => resolve(dest)));
        });
        req.on('error', (err) => {
            try { file.close(); fs.unlinkSync(dest); } catch { /* ignore */ }
            reject(err);
        });
    });
}

function extractZip(zipPath, destDir) {
    fs.mkdirSync(destDir, { recursive: true });
    if (process.platform === 'win32') {
        execFileSync('powershell.exe', [
            '-NoProfile', '-Command',
            `Expand-Archive -LiteralPath ${JSON.stringify(zipPath)} -DestinationPath ${JSON.stringify(destDir)} -Force`,
        ], { stdio: 'inherit' });
        return;
    }
    execFileSync('unzip', ['-o', zipPath, '-d', destDir], { stdio: 'inherit' });
}

function findBinary(extractRoot, exeName) {
    const want = process.platform === 'win32' ? `${exeName}.exe` : exeName;
    const stack = [extractRoot];
    while (stack.length) {
        const dir = stack.pop();
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                stack.push(full);
                continue;
            }
            if (entry.isFile() && entry.name.toLowerCase() === want.toLowerCase()) {
                return full;
            }
        }
    }
    return null;
}

async function main() {
    if (process.platform !== 'win32') {
        console.log('[setup-ffmpeg] Non-Windows: place ffmpeg/ffprobe on PATH or in _internal/bin');
        return;
    }

    const existingFfmpeg = existsExe('ffmpeg');
    const existingFfprobe = existsExe('ffprobe');
    if (existingFfmpeg && existingFfprobe && !FORCE) {
        console.log('[setup-ffmpeg] Already present:');
        console.log(' ', existingFfmpeg);
        console.log(' ', existingFfprobe);
        console.log('[setup-ffmpeg] Pass --force to re-download.');
        return;
    }

    fs.mkdirSync(binDir, { recursive: true });
    const tmpDir = path.join(root, 'temp', 'ffmpeg-download');
    fs.mkdirSync(tmpDir, { recursive: true });
    const zipPath = path.join(tmpDir, 'ffmpeg-essentials.zip');
    const extractDir = path.join(tmpDir, 'extract');

    console.log('[setup-ffmpeg] Downloading', FFMPEG_URL);
    await download(FFMPEG_URL, zipPath);
    console.log('[setup-ffmpeg] Extracting…');
    if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
    extractZip(zipPath, extractDir);

    const ffmpegSrc = findBinary(extractDir, 'ffmpeg');
    const ffprobeSrc = findBinary(extractDir, 'ffprobe');
    if (!ffmpegSrc || !ffprobeSrc) {
        throw new Error('ffmpeg.exe / ffprobe.exe not found in archive');
    }

    const ffmpegDest = path.join(binDir, 'ffmpeg.exe');
    const ffprobeDest = path.join(binDir, 'ffprobe.exe');
    fs.copyFileSync(ffmpegSrc, ffmpegDest);
    fs.copyFileSync(ffprobeSrc, ffprobeDest);

    try {
        execFileSync('powershell.exe', [
            '-NoProfile', '-ExecutionPolicy', 'Bypass',
            '-Command',
            `Unblock-File -LiteralPath ${JSON.stringify(ffmpegDest)}; Unblock-File -LiteralPath ${JSON.stringify(ffprobeDest)}`,
        ], { windowsHide: true });
    } catch {
        /* MOTW unblock is best-effort */
    }

    console.log('[setup-ffmpeg] Installed:');
    console.log(' ', ffmpegDest);
    console.log(' ', ffprobeDest);

    try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
        /* ignore cleanup errors */
    }
}

main().catch((err) => {
    console.error('[setup-ffmpeg]', err.message || err);
    process.exit(1);
});
