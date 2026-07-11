const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const FFPROBE_CANDIDATES = [
    'ffprobe',
    'ffprobe.exe',
    path.join(process.cwd(), 'ffprobe.exe'),
    path.join(process.cwd(), 'tools', 'ffprobe.exe'),
];

function findBundledFfprobePath() {
    for (const candidate of FFPROBE_CANDIDATES) {
        if (candidate.includes(path.sep) || candidate.endsWith('.exe')) {
            if (fs.existsSync(candidate)) return path.resolve(candidate);
        }
    }
    return null;
}

function findFfprobePath(ffmpegPathSetting) {
    const custom = resolveFfprobeFromSetting(ffmpegPathSetting);
    if (custom) return custom;
    return findBundledFfprobePath() || 'ffprobe';
}

function resolveFfprobeFromSetting(ffmpegPathSetting) {
    const raw = String(ffmpegPathSetting || '').trim();
    if (!raw) return null;

    let resolved = path.resolve(raw);
    try {
        if (fs.existsSync(resolved)) {
            const stat = fs.statSync(resolved);
            if (stat.isDirectory()) {
                const winProbe = path.join(resolved, 'ffprobe.exe');
                if (fs.existsSync(winProbe)) return winProbe;
                const unixProbe = path.join(resolved, 'ffprobe');
                if (fs.existsSync(unixProbe)) return unixProbe;
                return winProbe;
            }
            const base = path.basename(resolved).toLowerCase();
            if (base === 'ffmpeg.exe' || base === 'ffmpeg') {
                const dir = path.dirname(resolved);
                const sibling = path.join(dir, base.includes('.exe') ? 'ffprobe.exe' : 'ffprobe');
                if (fs.existsSync(sibling)) return sibling;
                return path.join(dir, 'ffprobe.exe');
            }
            if (base === 'ffprobe.exe' || base === 'ffprobe') {
                return resolved;
            }
        }
    } catch {
        /* ignore stat errors */
    }

    if (/\.exe$/i.test(resolved)) {
        const dir = path.dirname(resolved);
        const base = path.basename(resolved).toLowerCase();
        if (base.includes('ffmpeg')) {
            return path.join(dir, 'ffprobe.exe');
        }
        return resolved;
    }

    return path.join(resolved, 'ffprobe.exe');
}

function resolveFfmpegValidation(ffmpegPathSetting) {
    const customRaw = String(ffmpegPathSetting || '').trim();
    if (customRaw) {
        const ffprobePath = resolveFfprobeFromSetting(customRaw);
        if (ffprobePath && fs.existsSync(ffprobePath)) {
            return {
                ok: true,
                path: ffprobePath,
                custom: true,
                ffmpegPath: customRaw,
            };
        }
        return {
            ok: false,
            path: ffprobePath || customRaw,
            custom: true,
            ffmpegPath: customRaw,
            error: `未在指定路径找到 ffprobe${ffprobePath ? `：${ffprobePath}` : ''}`,
        };
    }

    const bundled = findBundledFfprobePath();
    if (bundled) {
        return { ok: true, path: bundled, bundled: true };
    }
    return { ok: true, path: 'ffprobe', usePath: true };
}

function parseDurationFromFfprobeOutput(text) {
    const match = String(text || '').match(/"duration"\s*:\s*"([0-9.]+)"/);
    return match ? Number(match[1]) : 0;
}

function parseVideoStreamFromFfprobeOutput(text) {
    try {
        const data = JSON.parse(String(text || ''));
        const stream = Array.isArray(data.streams) ? data.streams[0] : null;
        return {
            duration: Number(data.format?.duration) || 0,
            codec: String(stream?.codec_name || '').toLowerCase(),
            width: Number(stream?.width) || 0,
            height: Number(stream?.height) || 0,
        };
    } catch {
        return {
            duration: parseDurationFromFfprobeOutput(text),
            codec: '',
            width: 0,
            height: 0,
        };
    }
}

function probeVideo(filePath, ffprobePath) {
    const resolved = path.resolve(String(filePath || ''));
    if (!fs.existsSync(resolved)) {
        return Promise.resolve({ ok: false, error: '文件不存在' });
    }
    const exe = ffprobePath || findFfprobePath();
    const args = [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=codec_name,width,height',
        '-show_entries', 'format=duration',
        '-of', 'json',
        resolved,
    ];

    return new Promise((resolve) => {
        let stdout = '';
        let stderr = '';
        let proc;
        try {
            proc = spawn(exe, args, { windowsHide: true });
        } catch (err) {
            resolve({ ok: false, error: err.message || String(err) });
            return;
        }
        proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
        proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
        proc.on('error', () => {
            resolve({
                ok: false,
                error: '未找到 ffprobe。请在参数 → 高级 中设置 FFmpeg 路径，或将其加入系统 PATH',
            });
        });
        proc.on('close', (code) => {
            if (code !== 0) {
                resolve({ ok: false, error: stderr.trim() || `ffprobe 退出码 ${code}` });
                return;
            }
            const info = parseVideoStreamFromFfprobeOutput(stdout);
            resolve({
                ok: true,
                duration: info.duration,
                codec: info.codec,
                width: info.width,
                height: info.height,
                path: resolved,
            });
        });
    });
}

function validateFfprobeExecutable(ffprobePath) {
    const exe = String(ffprobePath || '').trim();
    if (!exe) {
        return Promise.resolve({ ok: false, error: '未指定 ffprobe 路径' });
    }
    if (exe !== 'ffprobe' && !fs.existsSync(exe)) {
        return Promise.resolve({ ok: false, error: `文件不存在：${exe}` });
    }

    return new Promise((resolve) => {
        let stdout = '';
        let proc;
        try {
            proc = spawn(exe, ['-version'], { windowsHide: true });
        } catch (err) {
            resolve({ ok: false, error: err.message || String(err) });
            return;
        }
        proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
        proc.stderr.on('data', (chunk) => { stdout += chunk.toString(); });
        proc.on('error', () => {
            resolve({
                ok: false,
                error: '无法运行 ffprobe。请检查路径是否正确，或在参数 → 高级 中重新设置 FFmpeg 路径',
            });
        });
        proc.on('close', (code) => {
            if (code !== 0) {
                resolve({ ok: false, error: `ffprobe 检测失败（退出码 ${code}）` });
                return;
            }
            const versionLine = stdout.split(/\r?\n/).find((line) => /ffprobe version/i.test(line)) || '';
            resolve({
                ok: true,
                path: exe,
                version: versionLine.replace(/^ffprobe version\s+/i, '').trim() || '未知版本',
            });
        });
    });
}

async function validateFfmpegSetup(ffmpegPathSetting) {
    const validation = resolveFfmpegValidation(ffmpegPathSetting);
    if (!validation.ok) return validation;
    const versionCheck = await validateFfprobeExecutable(validation.path);
    if (!versionCheck.ok) return versionCheck;
    return {
        ok: true,
        ffprobePath: validation.path,
        ffmpegPath: validation.ffmpegPath || ffmpegPathSetting || '',
        version: versionCheck.version,
        custom: !!validation.custom,
        bundled: !!validation.bundled,
        usePath: !!validation.usePath,
    };
}

function normalizeFfmpegPath(value) {
    return String(value || '').trim();
}

module.exports = {
    findFfprobePath,
    findBundledFfprobePath,
    resolveFfprobeFromSetting,
    resolveFfmpegValidation,
    validateFfprobeExecutable,
    validateFfmpegSetup,
    probeVideo,
    normalizeFfmpegPath,
};
