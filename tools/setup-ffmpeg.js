/**
 * Download bundled FFmpeg/ffprobe into _internal/bin for reproducible setups.
 * Prefer gyan.dev essentials build (Windows x64). Skips if essentials binaries
 * already exist unless --force is passed. Replaces full_build automatically.
 *
 * Usage:
 *   node tools/setup-ffmpeg.js
 *   node tools/setup-ffmpeg.js --force
 *   node tools/setup-ffmpeg.js --zip=E:\path\ffmpeg-essentials.zip
 *   TRANSUB_FFMPEG_ZIP=... node tools/setup-ffmpeg.js
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

function resolveLocalZipArg() {
    const fromEnv = String(process.env.TRANSUB_FFMPEG_ZIP || '').trim();
    if (fromEnv) return path.resolve(fromEnv);
    const arg = process.argv.find((a) => a.startsWith('--zip='));
    if (arg) return path.resolve(arg.slice('--zip='.length).trim());
    const idx = process.argv.indexOf('--zip');
    if (idx >= 0 && process.argv[idx + 1]) return path.resolve(process.argv[idx + 1]);
    return '';
}

const LOCAL_ZIP = resolveLocalZipArg();

function existsExe(name) {
    const p = path.join(binDir, process.platform === 'win32' ? `${name}.exe` : name);
    return fs.existsSync(p) ? p : null;
}

/**
 * @returns {{ ok: boolean, variant: 'essentials'|'full'|'unknown', versionLine: string }}
 */
function probeFfmpegVariant(exePath) {
    if (!exePath || !fs.existsSync(exePath)) {
        return { ok: false, variant: 'unknown', versionLine: '' };
    }
    try {
        const out = execFileSync(exePath, ['-hide_banner', '-version'], {
            encoding: 'utf8',
            windowsHide: true,
            timeout: 15000,
            maxBuffer: 256 * 1024,
        });
        const versionLine = String(out || '').split(/\r?\n/).find((line) => /ffmpeg version/i.test(line)) || '';
        const lower = versionLine.toLowerCase();
        let variant = 'unknown';
        if (lower.includes('essentials')) variant = 'essentials';
        else if (lower.includes('full_build') || lower.includes('full-build') || /\bfull\b/.test(lower)) {
            variant = 'full';
        }
        return { ok: true, variant, versionLine: versionLine.trim() };
    } catch (err) {
        return { ok: false, variant: 'unknown', versionLine: String(err && err.message || err) };
    }
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

function unblockBinaries(paths) {
    if (process.platform !== 'win32') return;
    const literals = paths.map((p) => `Unblock-File -LiteralPath ${JSON.stringify(p)}`).join('; ');
    try {
        execFileSync('powershell.exe', [
            '-NoProfile', '-ExecutionPolicy', 'Bypass',
            '-Command',
            literals,
        ], { windowsHide: true });
    } catch {
        /* MOTW unblock is best-effort */
    }
}

async function main() {
    if (process.platform !== 'win32') {
        console.log('[setup-ffmpeg] Non-Windows: place ffmpeg/ffprobe on PATH or in _internal/bin');
        return;
    }

    const existingFfmpeg = existsExe('ffmpeg');
    const existingFfprobe = existsExe('ffprobe');
    if (existingFfmpeg && existingFfprobe && !FORCE) {
        const probed = probeFfmpegVariant(existingFfmpeg);
        if (probed.ok && probed.variant === 'essentials') {
            console.log('[setup-ffmpeg] Already present (essentials):');
            console.log(' ', existingFfmpeg);
            console.log(' ', existingFfprobe);
            if (probed.versionLine) console.log(' ', probed.versionLine);
            console.log('[setup-ffmpeg] Pass --force to re-download.');
            return;
        }
        if (probed.ok && probed.variant === 'full') {
            console.log('[setup-ffmpeg] Existing full_build detected; replacing with essentials…');
            if (probed.versionLine) console.log(' ', probed.versionLine);
        } else {
            console.log('[setup-ffmpeg] Existing binaries are not essentials; re-downloading…');
            if (probed.versionLine) console.log(' ', probed.versionLine);
        }
    }

    fs.mkdirSync(binDir, { recursive: true });
    const tmpDir = path.join(root, 'temp', 'ffmpeg-download');
    fs.mkdirSync(tmpDir, { recursive: true });
    const extractDir = path.join(tmpDir, 'extract');
    let zipPath = path.join(tmpDir, 'ffmpeg-essentials.zip');
    let keepZip = false;

    if (LOCAL_ZIP) {
        if (!fs.existsSync(LOCAL_ZIP)) {
            throw new Error(`Local FFmpeg zip not found: ${LOCAL_ZIP}`);
        }
        zipPath = LOCAL_ZIP;
        keepZip = true;
        console.log('[setup-ffmpeg] Using local zip', zipPath);
    } else {
        console.log('[setup-ffmpeg] Downloading', FFMPEG_URL);
        await download(FFMPEG_URL, zipPath);
    }

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
    unblockBinaries([ffmpegDest, ffprobeDest]);

    const installed = probeFfmpegVariant(ffmpegDest);
    if (!installed.ok) {
        throw new Error(`Installed ffmpeg failed to run: ${installed.versionLine || 'unknown error'}`);
    }
    if (installed.variant === 'full') {
        throw new Error(
            `Build is full_build, but Transub requires essentials. source=${LOCAL_ZIP || FFMPEG_URL}`,
        );
    }
    if (installed.variant !== 'essentials') {
        const sourceHint = LOCAL_ZIP || FFMPEG_URL;
        if (!String(sourceHint).toLowerCase().includes('essentials')) {
            console.warn(
                '[setup-ffmpeg] Warning: version string does not say essentials;',
                'confirm the zip/URL is an essentials build.',
            );
        }
    }

    console.log('[setup-ffmpeg] Installed:');
    console.log(' ', ffmpegDest);
    console.log(' ', ffprobeDest);
    if (installed.versionLine) console.log(' ', installed.versionLine);
    try {
        const mb = (fs.statSync(ffmpegDest).size + fs.statSync(ffprobeDest).size) / (1024 * 1024);
        console.log(`[setup-ffmpeg] Size: ${mb.toFixed(1)} MB (ffmpeg + ffprobe)`);
    } catch {
        /* ignore */
    }

    try {
        if (keepZip) {
            if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
        } else {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    } catch {
        /* ignore cleanup errors */
    }
}

main().catch((err) => {
    console.error('[setup-ffmpeg]', err.message || err);
    process.exit(1);
});
