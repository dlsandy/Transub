const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { getProjectRoot, getWritableRoot } = require('./app-paths');

function getBundledBinaryRoots() {
    const roots = [];
    const add = (dir) => {
        const resolved = path.resolve(String(dir || ''));
        if (resolved && !roots.includes(resolved)) roots.push(resolved);
    };
    try {
        add(getWritableRoot());
    } catch {
        /* ignore */
    }
    try {
        add(getProjectRoot());
    } catch {
        /* ignore */
    }
    add(process.cwd());
    return roots;
}

function buildBundledBinaryCandidates(exeName) {
    const names = process.platform === 'win32'
        ? [`${exeName}.exe`, exeName]
        : [exeName, `${exeName}.exe`];
    const candidates = [];
    for (const root of getBundledBinaryRoots()) {
        for (const name of names) {
            candidates.push(path.join(root, '_internal', 'bin', name));
            candidates.push(path.join(root, name));
            candidates.push(path.join(root, 'tools', name));
        }
    }
    return candidates;
}

function findExistingExecutable(candidates) {
    for (const candidate of candidates) {
        if (!candidate) continue;
        if (fs.existsSync(candidate)) return path.resolve(candidate);
    }
    return null;
}

function findBundledFfprobePath() {
    return findExistingExecutable(buildBundledBinaryCandidates('ffprobe'));
}

function findBundledFfmpegPath() {
    return findExistingExecutable(buildBundledBinaryCandidates('ffmpeg'));
}

function findFfprobePath(ffmpegPathSetting) {
    const custom = resolveFfprobeFromSetting(ffmpegPathSetting);
    if (custom) return custom;
    return findBundledFfprobePath() || 'ffprobe';
}

function isPathExecutableName(exe) {
    const name = String(exe || '').trim().toLowerCase();
    return name === 'ffmpeg' || name === 'ffprobe' || name === 'ffmpeg.exe' || name === 'ffprobe.exe';
}

function hasMarkOfTheWeb(filePath) {
    if (process.platform !== 'win32') return false;
    const resolved = path.resolve(String(filePath || ''));
    if (!resolved || !fs.existsSync(resolved)) return false;
    try {
        return fs.existsSync(`${resolved}:Zone.Identifier`);
    } catch {
        return false;
    }
}

function unblockWindowsExecutable(filePath) {
    const resolved = path.resolve(String(filePath || ''));
    if (process.platform !== 'win32' || !resolved || !fs.existsSync(resolved)) {
        return Promise.resolve({ ok: false, skipped: true });
    }

    return new Promise((resolve) => {
        const ps = spawn('powershell.exe', [
            '-NoProfile',
            '-ExecutionPolicy', 'Bypass',
            '-Command', `Unblock-File -LiteralPath ${JSON.stringify(resolved)} -ErrorAction Stop`,
        ], { windowsHide: true });
        ps.on('close', (code) => resolve({ ok: code === 0 }));
        ps.on('error', (err) => resolve({ ok: false, error: err.message || String(err) }));
    });
}

async function ensureWindowsExecutableReady(exe, toolLabel = 'FFmpeg') {
    if (process.platform !== 'win32') return { ok: true };
    const resolved = String(exe || '').trim();
    if (!resolved || isPathExecutableName(resolved) || !fs.existsSync(resolved)) {
        return { ok: true };
    }

    const targets = [resolved];
    try {
        const stat = fs.statSync(resolved);
        if (stat.isDirectory()) {
            targets.length = 0;
            for (const name of ['ffmpeg.exe', 'ffprobe.exe']) {
                const candidate = path.join(resolved, name);
                if (fs.existsSync(candidate)) targets.push(candidate);
            }
        } else {
            const dir = path.dirname(resolved);
            for (const name of ['ffmpeg.exe', 'ffprobe.exe']) {
                const sibling = path.join(dir, name);
                if (fs.existsSync(sibling) && !targets.includes(sibling)) targets.push(sibling);
            }
        }
    } catch {
        /* ignore stat errors */
    }

    const blocked = targets.filter((target) => hasMarkOfTheWeb(target));
    if (!blocked.length) return { ok: true };

    for (const target of blocked) {
        await unblockWindowsExecutable(target);
    }

    const stillBlocked = blocked.filter((target) => hasMarkOfTheWeb(target));
    if (stillBlocked.length) {
        const sample = stillBlocked[0];
        return {
            ok: false,
            error: `Windows 拦截了 ${toolLabel}（${sample} 仍带有「来自互联网」标记）。请在资源管理器中右键 ffmpeg.exe → 属性 → 勾选「解除锁定」，或在 Windows 安全中心 → 病毒和威胁防护 → 保护历史记录 中允许该程序。`,
        };
    }
    return { ok: true, unblocked: true };
}

function formatExecutableSpawnError(err, exe, toolLabel) {
    const code = String(err?.code || '').toUpperCase();
    const target = String(exe || '').trim();
    if (code === 'EACCES' || code === 'EPERM') {
        return `Windows 拒绝运行 ${toolLabel}${target ? `（${target}）` : ''}。请在 Windows 安全中心允许：病毒和威胁防护 → 保护历史记录 中允许该程序，或为 ffmpeg.exe 添加排除项。`;
    }
    if (code === 'ENOENT' && target && !isPathExecutableName(target) && fs.existsSync(target)) {
        return `Windows 可能拦截了 ${toolLabel}（${target}）。请右键该文件 → 属性 → 勾选「解除锁定」后重试。`;
    }
    if (target && !isPathExecutableName(target) && hasMarkOfTheWeb(target)) {
        return `Windows 拦截了 ${toolLabel}（${target} 带有「来自互联网」标记）。请右键该文件 → 属性 → 勾选「解除锁定」后重试。`;
    }
    return `无法运行 ${toolLabel}。请在参数 → 高级 中重新设置 FFmpeg 路径，或将其加入系统 PATH`;
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

    return (async () => {
        const ready = await ensureWindowsExecutableReady(exe, 'ffprobe');
        if (!ready.ok) return { ok: false, error: ready.error };

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
            proc.on('error', (err) => {
                resolve({
                    ok: false,
                    error: formatExecutableSpawnError(err, exe, 'ffprobe'),
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
    })();
}

function validateFfprobeExecutable(ffprobePath) {
    const exe = String(ffprobePath || '').trim();
    if (!exe) {
        return Promise.resolve({ ok: false, error: '未指定 ffprobe 路径' });
    }
    if (exe !== 'ffprobe' && !fs.existsSync(exe)) {
        return Promise.resolve({ ok: false, error: `文件不存在：${exe}` });
    }

    return (async () => {
        const ready = await ensureWindowsExecutableReady(exe, 'ffprobe');
        if (!ready.ok) return { ok: false, error: ready.error };

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
            proc.on('error', (err) => {
                resolve({
                    ok: false,
                    error: formatExecutableSpawnError(err, exe, 'ffprobe'),
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
    })();
}

function resolveFfmpegForExecution(ffmpegPathSetting) {
    const customRaw = String(ffmpegPathSetting || '').trim();
    if (!customRaw) {
        const bundled = findBundledFfmpegPath();
        if (bundled) {
            return { ok: true, path: bundled, bundled: true };
        }
        return { ok: true, path: 'ffmpeg', usePath: true };
    }
    const exe = resolveFfmpegFromSetting(ffmpegPathSetting);
    if (exe !== 'ffmpeg' && !fs.existsSync(exe)) {
        return {
            ok: false,
            path: exe,
            error: `未在指定路径找到 ffmpeg：${exe}。请在参数 → 高级 中设置 FFmpeg 路径（需包含 ffmpeg.exe），或将其加入系统 PATH`,
        };
    }
    return {
        ok: true,
        path: exe,
        custom: true,
        ffmpegPath: customRaw,
    };
}

function validateFfmpegExecutable(ffmpegPath) {
    const exe = String(ffmpegPath || '').trim();
    if (!exe) {
        return Promise.resolve({ ok: false, error: '未指定 ffmpeg 路径' });
    }
    if (exe !== 'ffmpeg' && !fs.existsSync(exe)) {
        return Promise.resolve({ ok: false, error: `文件不存在：${exe}` });
    }

    return (async () => {
        const ready = await ensureWindowsExecutableReady(exe, 'ffmpeg');
        if (!ready.ok) return { ok: false, error: ready.error };

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
            proc.on('error', (err) => {
                resolve({
                    ok: false,
                    error: formatExecutableSpawnError(err, exe, 'ffmpeg'),
                });
            });
            proc.on('close', (code) => {
                if (code !== 0) {
                    resolve({ ok: false, error: `ffmpeg 检测失败（退出码 ${code}）` });
                    return;
                }
                const versionLine = stdout.split(/\r?\n/).find((line) => /ffmpeg version/i.test(line)) || '';
                resolve({
                    ok: true,
                    path: exe,
                    version: versionLine.replace(/^ffmpeg version\s+/i, '').trim() || '未知版本',
                });
            });
        });
    })();
}

async function validateFfmpegSetup(ffmpegPathSetting) {
    const validation = resolveFfmpegValidation(ffmpegPathSetting);
    if (!validation.ok) return validation;
    const versionCheck = await validateFfprobeExecutable(validation.path);
    if (!versionCheck.ok) return versionCheck;

    const ffmpegResolved = resolveFfmpegForExecution(ffmpegPathSetting);
    if (!ffmpegResolved.ok) return ffmpegResolved;
    const ffmpegCheck = await validateFfmpegExecutable(ffmpegResolved.path);
    if (!ffmpegCheck.ok) return ffmpegCheck;

    return {
        ok: true,
        ffprobePath: validation.path,
        ffmpegPath: validation.ffmpegPath || ffmpegPathSetting || '',
        version: versionCheck.version,
        ffmpegVersion: ffmpegCheck.version,
        custom: !!validation.custom,
        bundled: !!validation.bundled,
        usePath: !!validation.usePath,
    };
}

function normalizeFfmpegPath(value) {
    return String(value || '').trim();
}

function resolveFfmpegFromSetting(ffmpegPathSetting) {
    const raw = String(ffmpegPathSetting || '').trim();
    if (!raw) return 'ffmpeg';

    let resolved = path.resolve(raw);
    try {
        if (fs.existsSync(resolved)) {
            const stat = fs.statSync(resolved);
            if (stat.isDirectory()) {
                const winExe = path.join(resolved, 'ffmpeg.exe');
                if (fs.existsSync(winExe)) return winExe;
                const unixExe = path.join(resolved, 'ffmpeg');
                if (fs.existsSync(unixExe)) return unixExe;
                return winExe;
            }
            const base = path.basename(resolved).toLowerCase();
            if (base === 'ffmpeg.exe' || base === 'ffmpeg') {
                return resolved;
            }
            if (base === 'ffprobe.exe' || base === 'ffprobe') {
                const dir = path.dirname(resolved);
                const sibling = path.join(dir, base.includes('.exe') ? 'ffmpeg.exe' : 'ffmpeg');
                if (fs.existsSync(sibling)) return sibling;
                return path.join(dir, 'ffmpeg.exe');
            }
        }
    } catch {
        /* ignore stat errors */
    }

    if (/\.exe$/i.test(resolved)) {
        const dir = path.dirname(resolved);
        const base = path.basename(resolved).toLowerCase();
        if (base.includes('ffprobe')) {
            return path.join(dir, 'ffmpeg.exe');
        }
        return resolved;
    }

    return path.join(resolved, 'ffmpeg.exe');
}

function parseSilenceDetectLog(stderr, offsetSec = 0, clipEndSec = null) {
    const intervals = [];
    let pendingStart = null;
    const lines = String(stderr || '').split(/\r?\n/);
    for (const line of lines) {
        const startMatch = line.match(/silence_start:\s*([0-9.]+)/);
        if (startMatch) {
            pendingStart = Number(startMatch[1]) + offsetSec;
            continue;
        }
        const endMatch = line.match(/silence_end:\s*([0-9.]+)/);
        if (endMatch && pendingStart != null) {
            const end = Number(endMatch[1]) + offsetSec;
            if (end > pendingStart) {
                intervals.push({ startSec: pendingStart, endSec: end });
            }
            pendingStart = null;
        }
    }
    // FFmpeg often emits silence_start without silence_end when silence runs to EOF
    if (pendingStart != null && clipEndSec != null && Number.isFinite(clipEndSec) && clipEndSec > pendingStart) {
        intervals.push({ startSec: pendingStart, endSec: Number(clipEndSec) });
    }
    return intervals;
}

function clampSilenceIntervals(intervals, startSec, endSec, minSilenceSec) {
    const minDur = Math.max(0.05, Number(minSilenceSec) || 0.25);
    return (intervals || [])
        .map(({ startSec: s, endSec: e }) => ({
            startSec: Math.max(s, startSec),
            endSec: Math.min(e, endSec),
        }))
        .filter(({ startSec: s, endSec: e }) => e - s >= minDur && s < endSec && e > startSec);
}

function silenceMidpointsToMs(intervals, startMs, endMs, minSegmentMs = 400) {
    const span = Math.max(1, Math.round(Number(endMs) || 0) - Math.round(Number(startMs) || 0));
    // Soften edge margin on short cues so mid-phrase pauses near edges still qualify
    const requested = Math.max(100, Math.round(Number(minSegmentMs) || 400));
    const minSeg = Math.min(requested, Math.max(120, Math.floor(span * 0.18)));
    const points = (intervals || [])
        .map(({ startSec, endSec }) => Math.round(((startSec + endSec) / 2) * 1000))
        .filter((ms) => ms > startMs + minSeg && ms < endMs - minSeg)
        .sort((a, b) => a - b);

    const deduped = [];
    for (const ms of points) {
        if (!deduped.length || ms - deduped[deduped.length - 1] >= minSeg) {
            deduped.push(ms);
        }
    }
    return deduped;
}

function detectSilenceInRange(filePath, startMs, endMs, options = {}) {
    const resolved = path.resolve(String(filePath || ''));
    if (!fs.existsSync(resolved)) {
        return Promise.resolve({ ok: false, error: '文件不存在' });
    }

    const startMsNum = Math.max(0, Math.round(Number(startMs) || 0));
    const endMsNum = Math.max(startMsNum + 100, Math.round(Number(endMs) || 0));
    const startSec = startMsNum / 1000;
    const endSec = endMsNum / 1000;
    const durationSec = endSec - startSec;
    if (durationSec < 0.2) {
        return Promise.resolve({
            ok: false,
            error: `字幕时间范围过短（${durationSec.toFixed(3)}s），无法分析静音`,
        });
    }

    const noiseDb = Number(options.noiseDb);
    const minSilenceSec = Math.max(0.04, Number(options.minSilenceSec) || 0.25);
    const noise = Number.isFinite(noiseDb) ? noiseDb : -35;
    const ffmpegResolved = resolveFfmpegForExecution(options.ffmpegPathSetting || options.ffmpegPath);
    if (!ffmpegResolved.ok) {
        return Promise.resolve({ ok: false, error: ffmpegResolved.error });
    }
    const exe = ffmpegResolved.path;
    // -ss/-t before -i: fast seek; -t is duration (avoids -to absolute-time confusion).
    // silencedetect timestamps are relative to the seek start → add startSec when parsing.
    const args = [
        '-hide_banner',
        '-nostats',
        '-ss', String(startSec),
        '-t', String(durationSec),
        '-i', resolved,
        '-vn',
        '-sn',
        '-dn',
        '-af', `silencedetect=noise=${noise}dB:duration=${minSilenceSec}`,
        '-f', 'null',
        '-',
    ];

    return (async () => {
        const ready = await ensureWindowsExecutableReady(exe, 'ffmpeg');
        if (!ready.ok) return { ok: false, error: ready.error };

        return new Promise((resolve) => {
            let stderr = '';
            let proc;
            try {
                proc = spawn(exe, args, { windowsHide: true });
            } catch (err) {
                resolve({ ok: false, error: err.message || String(err) });
                return;
            }
            proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
            proc.on('error', (err) => {
                resolve({
                    ok: false,
                    error: formatExecutableSpawnError(err, exe, 'ffmpeg'),
                });
            });
            proc.on('close', (code) => {
                if (code !== 0 && !/silence_/.test(stderr)) {
                    resolve({ ok: false, error: stderr.trim() || `ffmpeg 退出码 ${code}` });
                    return;
                }
                const rawIntervals = parseSilenceDetectLog(stderr, startSec, endSec);
                // Allow slightly shorter intervals after window clamping
                const intervals = clampSilenceIntervals(
                    rawIntervals,
                    startSec,
                    endSec,
                    Math.max(0.04, minSilenceSec * 0.75),
                );
                const splitPointsMs = silenceMidpointsToMs(
                    intervals,
                    startMsNum,
                    endMsNum,
                    options.minSegmentMs,
                );
                resolve({
                    ok: true,
                    intervals: intervals.map(({ startSec: s, endSec: e }) => ({
                        startMs: Math.round(s * 1000),
                        endMs: Math.round(e * 1000),
                    })),
                    splitPointsMs,
                    meta: {
                        startMs: startMsNum,
                        endMs: endMsNum,
                        durationMs: endMsNum - startMsNum,
                        noiseDb: noise,
                        minSilenceSec,
                    },
                });
            });
        });
    })();
}

/**
 * 按时间范围导出音频片段（16k mono wav，供区间重转写）
 */
function extractMediaRange(filePath, startMs, endMs, outPath, options = {}) {
    const resolved = path.resolve(String(filePath || ''));
    const output = path.resolve(String(outPath || ''));
    if (!fs.existsSync(resolved)) {
        return Promise.resolve({ ok: false, error: '媒体文件不存在' });
    }
    if (!output) {
        return Promise.resolve({ ok: false, error: '缺少输出路径' });
    }

    const startSec = Math.max(0, Number(startMs) || 0) / 1000;
    const endSec = Math.max(startSec + 0.15, Number(endMs) || 0) / 1000;
    const durationSec = endSec - startSec;
    if (durationSec < 0.2) {
        return Promise.resolve({ ok: false, error: '截取时间范围过短' });
    }

    const ffmpegResolved = resolveFfmpegForExecution(options.ffmpegPathSetting || options.ffmpegPath);
    if (!ffmpegResolved.ok) {
        return Promise.resolve({ ok: false, error: ffmpegResolved.error });
    }
    const exe = ffmpegResolved.path;

    try {
        fs.mkdirSync(path.dirname(output), { recursive: true });
    } catch (err) {
        return Promise.resolve({ ok: false, error: err.message || String(err) });
    }

    const args = [
        '-hide_banner',
        '-nostats',
        '-y',
        '-ss', String(startSec),
        '-t', String(durationSec),
        '-i', resolved,
        '-vn',
        '-sn',
        '-dn',
        '-ac', '1',
        '-ar', '16000',
        '-c:a', 'pcm_s16le',
        output,
    ];

    return (async () => {
        const ready = await ensureWindowsExecutableReady(exe, 'ffmpeg');
        if (!ready.ok) return { ok: false, error: ready.error };

        return new Promise((resolve) => {
            let stderr = '';
            let proc;
            try {
                proc = spawn(exe, args, { windowsHide: true });
            } catch (err) {
                resolve({ ok: false, error: err.message || String(err) });
                return;
            }
            proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
            proc.on('error', (err) => {
                resolve({
                    ok: false,
                    error: formatExecutableSpawnError(err, exe, 'ffmpeg'),
                });
            });
            proc.on('close', (code) => {
                if (code !== 0 || !fs.existsSync(output)) {
                    resolve({ ok: false, error: stderr.trim().slice(-400) || `ffmpeg 退出码 ${code}` });
                    return;
                }
                resolve({
                    ok: true,
                    path: output,
                    startMs: Math.round(startSec * 1000),
                    endMs: Math.round(endSec * 1000),
                    durationMs: Math.round(durationSec * 1000),
                });
            });
        });
    })();
}

module.exports = {
    findFfprobePath,
    findBundledFfprobePath,
    findBundledFfmpegPath,
    resolveFfprobeFromSetting,
    resolveFfmpegFromSetting,
    resolveFfmpegForExecution,
    resolveFfmpegValidation,
    validateFfprobeExecutable,
    validateFfmpegExecutable,
    validateFfmpegSetup,
    probeVideo,
    normalizeFfmpegPath,
    parseSilenceDetectLog,
    clampSilenceIntervals,
    silenceMidpointsToMs,
    detectSilenceInRange,
    extractMediaRange,
};
