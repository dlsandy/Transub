/**
 * Hardsub burn-in via ffmpeg (subtitles=/ass= filter).
 * Keep encode plumbing here — do not grow ffmpeg-bridge monolith.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const {
    resolveFfmpegForExecution,
    probeVideo,
    findFfprobePath,
    trackFfmpegProc,
    ensureWindowsExecutableReady,
    formatExecutableSpawnError,
} = require('./ffmpeg-bridge');

const burnCore = require('../src/js/subtitle-burn-core');

function runFfmpegCapture(exe, args) {
    return new Promise((resolve) => {
        let stdout = '';
        let stderr = '';
        let proc;
        try {
            proc = spawn(exe, args, { windowsHide: true });
            trackFfmpegProc(proc);
        } catch (err) {
            resolve({
                ok: false,
                error: formatExecutableSpawnError
                    ? formatExecutableSpawnError(err, exe, 'ffmpeg')
                    : (err.message || String(err)),
            });
            return;
        }
        proc.stdout.on('data', (c) => { stdout += c.toString(); });
        proc.stderr.on('data', (c) => { stderr += c.toString(); });
        proc.on('error', (err) => {
            resolve({
                ok: false,
                error: formatExecutableSpawnError
                    ? formatExecutableSpawnError(err, exe, 'ffmpeg')
                    : (err.message || String(err)),
            });
        });
        proc.on('close', (code, signal) => {
            if (signal || code === null) {
                resolve({ ok: false, cancelled: true, error: '已取消' });
                return;
            }
            // `ffmpeg -encoders` exits 0; some builds print to stderr.
            resolve({ ok: true, code, stdout, stderr });
        });
    });
}

/**
 * List software + hardware H.264 encoders available in the bundled/custom ffmpeg.
 */
async function listBurnEncoders(options = {}) {
    const ffmpegResolved = resolveFfmpegForExecution(options.ffmpegPathSetting || options.ffmpegPath);
    if (!ffmpegResolved.ok) {
        return { ok: false, error: ffmpegResolved.error, encoders: burnCore.parseAvailableEncoders('') };
    }
    const exe = ffmpegResolved.path;
    const ready = await ensureWindowsExecutableReady(exe, 'ffmpeg');
    if (!ready.ok) {
        return { ok: false, error: ready.error, encoders: burnCore.parseAvailableEncoders('') };
    }
    const captured = await runFfmpegCapture(exe, ['-hide_banner', '-encoders']);
    if (!captured.ok) {
        return {
            ok: false,
            error: captured.error,
            encoders: burnCore.parseAvailableEncoders(''),
        };
    }
    const text = `${captured.stdout || ''}\n${captured.stderr || ''}`;
    const encoders = burnCore.parseAvailableEncoders(text);
    return { ok: true, encoders, ffmpegPath: exe };
}

function readSubtitleText(filePath) {
    const resolved = path.resolve(String(filePath || ''));
    if (!fs.existsSync(resolved)) return { ok: false, error: '字幕文件不存在' };
    try {
        const text = fs.readFileSync(resolved, 'utf8');
        const ext = path.extname(resolved).slice(1).toLowerCase();
        return {
            ok: true,
            path: resolved,
            text,
            format: ext === 'ssa' ? 'ass' : ext,
        };
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    }
}

/**
 * Build a temporary dual ASS from target+source tracks when dual style is enabled
 * but the active path is not yet ASS with ZH/Source styles.
 */
function buildTempDualAssFromTracks({
    targetPath,
    sourcePath,
    bilingualPath,
    outDir,
    style,
}) {
    const dualCandidate = String(bilingualPath || '').trim();
    if (dualCandidate && /\.(ass|ssa)$/i.test(dualCandidate) && fs.existsSync(dualCandidate)) {
        return { ok: true, path: path.resolve(dualCandidate), temporary: false };
    }

    const target = String(targetPath || '').trim();
    const source = String(sourcePath || '').trim();
    if (!target || !source || !fs.existsSync(target) || !fs.existsSync(source)) {
        return { ok: false, skipped: true, error: '双行样式需要双语 ASS，或同时关联译文与原文轨' };
    }

    let parseSubtitle;
    let serializeDualAss;
    try {
        ({ parseSubtitle, serializeDualAss } = require('./subtitle-format'));
    } catch (_) {
        return { ok: false, error: '字幕解析模块不可用' };
    }

    let dualCore = null;
    try {
        dualCore = require('../src/js/dual-subtitle-core');
    } catch (_) { /* optional overlap helper */ }

    try {
        const targetRaw = fs.readFileSync(target, 'utf8');
        const sourceRaw = fs.readFileSync(source, 'utf8');
        const targetDoc = parseSubtitle(targetRaw, path.extname(target).slice(1));
        const sourceDoc = parseSubtitle(sourceRaw, path.extname(source).slice(1));
        const primaryCues = Array.isArray(targetDoc?.cues) ? targetDoc.cues : [];
        const pairCues = Array.isArray(sourceDoc?.cues) ? sourceDoc.cues : [];
        if (!primaryCues.length) {
            return { ok: false, error: '译文轨没有可用字幕行' };
        }
        const assText = serializeDualAss(primaryCues, pairCues, {
            primaryRole: 'target',
            title: 'Transub Burn Dual',
            dualTemplate: {
                lineOrder: style?.lineOrder === 'source-first' ? 'source-first' : 'target-first',
                marginGap: Math.max(24, Number(style?.lineGap) || 28),
            },
            findBestOverlapCue: dualCore?.findBestOverlapCue || undefined,
        });
        const tempPath = path.join(outDir, `.transub-burn-dual-${Date.now()}.ass`);
        fs.writeFileSync(tempPath, assText, 'utf8');
        return { ok: true, path: tempPath, temporary: true };
    } catch (err) {
        return { ok: false, error: err?.message || String(err) };
    }
}

/**
 * Prepare hardsub paths/filter (dual ASS rewrite + force_style/ass=).
 * Shared by full burn and short Chromium-safe preview clips.
 */
function prepareHardsubJob(options = {}) {
    const trackResolvedPath = burnCore.preferBurnSubtitlePath(options)
        || String(options.subtitlePath || '').trim();
    const validated = burnCore.validateBurnPair({
        ...options,
        subtitlePath: trackResolvedPath,
        resolutionId: options.resolutionId || options.resolution,
        fpsId: options.fpsId || options.fps,
    });
    if (!validated.ok) return validated;
    const job = validated.job;

    const videoPath = path.resolve(job.videoPath);
    let subtitlePath = path.resolve(job.subtitlePath);
    const outputPath = path.resolve(job.outputPath);
    let tempAssPath = '';
    const originalSubtitlePath = subtitlePath;

    if (!fs.existsSync(videoPath)) {
        return { ok: false, error: '视频文件不存在' };
    }
    if (!fs.existsSync(subtitlePath)) {
        return { ok: false, error: '字幕文件不存在' };
    }
    if (path.resolve(videoPath) === path.resolve(outputPath)) {
        return { ok: false, error: '输出路径不能与源视频相同' };
    }

    const outDir = path.dirname(outputPath);
    try {
        fs.mkdirSync(outDir, { recursive: true });
    } catch (err) {
        return { ok: false, error: err.message || '无法创建输出目录' };
    }

    const style = job.basicStyle || {};
    // Preview always hardsubs so style is visible; softsub mux has nothing to show.
    const forceHardsub = options.forceHardsub === true;
    const outputMode = forceHardsub
        ? 'hardsub'
        : (burnCore.normalizeOutputMode
            ? burnCore.normalizeOutputMode(options.outputMode || job.outputMode)
            : (options.outputMode || job.outputMode || 'hardsub'));
    job.outputMode = outputMode;
    job.audioMode = burnCore.normalizeAudioMode
        ? burnCore.normalizeAudioMode(options.audioMode || job.audioMode)
        : (options.audioMode || job.audioMode || 'copy');

    const wantDualStyle = outputMode === 'hardsub'
        && style.enableSource === true
        && job.styleMode !== 'document';
    if (wantDualStyle) {
        let workingAss = subtitlePath;
        if (!/\.(ass|ssa)$/i.test(workingAss)) {
            const built = buildTempDualAssFromTracks({
                targetPath: options.subtitlePath || options.targetSubtitlePath || originalSubtitlePath,
                sourcePath: options.sourceSubtitlePath,
                bilingualPath: options.bilingualSubtitlePath || options.dualSubtitlePath,
                outDir,
                style,
            });
            if (built.ok) {
                if (built.temporary) tempAssPath = built.path;
                workingAss = built.path;
            } else if (!built.skipped) {
                return { ok: false, error: built.error || '无法生成双语 ASS' };
            }
        }
        if (/\.(ass|ssa)$/i.test(workingAss) && burnCore.maybeRewriteAssForBurnStyle) {
            try {
                const raw = fs.readFileSync(workingAss, 'utf8');
                const rewritten = burnCore.maybeRewriteAssForBurnStyle(raw, style);
                if (rewritten?.ok && rewritten.text) {
                    const rewritePath = path.join(outDir, `.transub-burn-style-${Date.now()}.ass`);
                    fs.writeFileSync(rewritePath, rewritten.text, 'utf8');
                    if (tempAssPath && tempAssPath !== rewritePath) {
                        try { fs.unlinkSync(tempAssPath); } catch (_) { /* ignore */ }
                    }
                    tempAssPath = rewritePath;
                    subtitlePath = rewritePath;
                    job.styleMode = 'document';
                } else {
                    subtitlePath = workingAss;
                    job.styleMode = 'document';
                }
            } catch (_) { /* fall through to force_style */ }
        }
    }

    const filterRes = outputMode === 'softsub'
        ? { ok: true, filter: '', styleMode: job.styleMode }
        : burnCore.buildBurnVideoFilter({
            subtitlePath,
            styleMode: job.styleMode,
            basicStyle: job.basicStyle,
            // Preview clip applies its own max-height scale; keep source geometry here
            // unless caller wants the real burn resolution/fps.
            resolutionId: options.previewClip ? 'source' : job.resolutionId,
            fpsId: options.previewClip ? 'source' : job.fpsId,
        });
    if (!filterRes.ok) {
        if (tempAssPath) {
            try { fs.unlinkSync(tempAssPath); } catch (_) { /* ignore */ }
        }
        return filterRes;
    }
    job.videoPath = videoPath;
    job.subtitlePath = subtitlePath;
    job.outputPath = outputPath;
    job.videoFilter = filterRes.filter || '';
    job.encoderId = burnCore.normalizeEncoderId(options.encoderId || job.encoderId, { allowPro: true });
    job.encodeSpeedId = burnCore.normalizeEncodeSpeedId
        ? burnCore.normalizeEncodeSpeedId(options.encodeSpeedId || job.encodeSpeedId)
        : (options.encodeSpeedId || job.encodeSpeedId || 'medium');

    return {
        ok: true,
        job,
        validated,
        tempAssPath,
        originalSubtitlePath,
        videoPath,
        outputPath,
    };
}

/**
 * @param {object} options
 * @returns {Promise<object>}
 */
async function burnHardsub(options = {}) {
    const prepared = prepareHardsubJob(options);
    if (!prepared.ok) return prepared;
    const {
        job,
        validated,
        originalSubtitlePath,
        videoPath,
        outputPath,
    } = prepared;
    let { tempAssPath } = prepared;

    const ffmpegResolved = resolveFfmpegForExecution(options.ffmpegPathSetting || options.ffmpegPath);
    if (!ffmpegResolved.ok) {
        if (tempAssPath) {
            try { fs.unlinkSync(tempAssPath); } catch (_) { /* ignore */ }
        }
        return { ok: false, error: ffmpegResolved.error };
    }
    const exe = ffmpegResolved.path;
    const ready = await ensureWindowsExecutableReady(exe, 'ffmpeg');
    if (!ready.ok) {
        if (tempAssPath) {
            try { fs.unlinkSync(tempAssPath); } catch (_) { /* ignore */ }
        }
        return { ok: false, error: ready.error };
    }

    let durationSec = 0;
    try {
        const ffprobe = findFfprobePath(options.ffmpegPathSetting || options.ffmpegPath);
        const probed = await probeVideo(videoPath, ffprobe);
        if (probed?.ok && Number(probed.duration) > 0) {
            durationSec = Number(probed.duration);
        } else if (Number(probed?.durationSec) > 0) {
            durationSec = Number(probed.durationSec);
        }
    } catch (_) { /* progress may stay indeterminate */ }

    const args = burnCore.buildFfmpegBurnArgs(job);
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
    if (onProgress) {
        onProgress({ percent: 0, currentSec: 0, durationSec, phase: 'start' });
    }

    return new Promise((resolve) => {
        let stderr = '';
        let settled = false;
        let lastPct = -1;
        const cleanupTemp = () => {
            if (!tempAssPath) return;
            try { fs.unlinkSync(tempAssPath); } catch (_) { /* ignore */ }
            tempAssPath = '';
        };
        const finish = (result) => {
            if (settled) return;
            settled = true;
            cleanupTemp();
            resolve(result);
        };

        let proc;
        try {
            proc = spawn(exe, args, { windowsHide: true });
            trackFfmpegProc(proc);
        } catch (err) {
            finish({
                ok: false,
                error: formatExecutableSpawnError
                    ? formatExecutableSpawnError(err, exe, 'ffmpeg')
                    : (err.message || String(err)),
            });
            return;
        }

        const emitProgress = (chunk) => {
            if (!onProgress) return;
            const sec = burnCore.parseFfmpegTimeToSec(chunk);
            if (sec == null) return;
            const percent = burnCore.progressPercent(sec, durationSec);
            if (percent === lastPct && percent > 0) return;
            lastPct = percent;
            onProgress({ percent, currentSec: sec, durationSec, phase: 'encode' });
        };

        proc.stdout.on('data', (chunk) => {
            emitProgress(chunk.toString());
        });
        proc.stderr.on('data', (chunk) => {
            const text = chunk.toString();
            stderr += text;
            if (stderr.length > 80000) stderr = stderr.slice(-40000);
            emitProgress(text);
        });
        proc.on('error', (err) => {
            finish({
                ok: false,
                error: formatExecutableSpawnError
                    ? formatExecutableSpawnError(err, exe, 'ffmpeg')
                    : (err.message || String(err)),
            });
        });
        proc.on('close', (code, signal) => {
            if (signal || code === null) {
                finish({ ok: false, cancelled: true, error: '已取消' });
                return;
            }
            if (code !== 0) {
                const tip = stderr.trim().split(/\r?\n/).slice(-8).join('\n');
                finish({
                    ok: false,
                    error: tip || `ffmpeg 退出码 ${code}`,
                    code,
                    encoderId: job.encoderId,
                });
                return;
            }
            if (!fs.existsSync(outputPath)) {
                finish({ ok: false, error: '烧录完成但未找到输出文件' });
                return;
            }
            if (onProgress) {
                onProgress({ percent: 100, currentSec: durationSec, durationSec, phase: 'done' });
            }
            finish({
                ok: true,
                outputPath,
                videoPath,
                subtitlePath: originalSubtitlePath,
                container: job.container,
                styleMode: validated.job.styleMode,
                encoderId: job.encoderId,
                resolutionId: job.resolutionId,
                fpsId: job.fpsId,
                durationSec,
            });
        });
    });
}

/**
 * Encode a short hardsub preview mp4 (libx264) for in-app playback.
 * Guarantees Chromium can paint frames and style matches hardsub filters.
 */
async function burnPreviewClip(options = {}) {
    const os = require('os');
    const previewDir = path.join(os.tmpdir(), 'transub-burn-preview');
    try {
        fs.mkdirSync(previewDir, { recursive: true });
    } catch (err) {
        return { ok: false, error: err.message || '无法创建预览临时目录' };
    }
    const previewOut = path.join(previewDir, `preview-${Date.now()}-${process.pid}.mp4`);
    const prepared = prepareHardsubJob({
        ...options,
        outputPath: previewOut,
        container: 'mp4',
        forceHardsub: true,
        previewClip: true,
        // Keep preview independent of Pro HW encoders / softsub mode.
        encoderId: 'libx264',
        audioMode: 'encode',
        outputMode: 'hardsub',
    });
    if (!prepared.ok) return prepared;
    const { job, videoPath, outputPath } = prepared;
    let { tempAssPath } = prepared;

    job.previewStartSec = Math.max(0, Number(options.startSec) || 0);
    job.previewDurationSec = Math.min(180, Math.max(8, Number(options.durationSec) || 45));
    job.previewMaxHeight = Math.max(360, Math.min(1080, Math.round(Number(options.maxHeight) || 720)));

    const ffmpegResolved = resolveFfmpegForExecution(options.ffmpegPathSetting || options.ffmpegPath);
    if (!ffmpegResolved.ok) {
        if (tempAssPath) {
            try { fs.unlinkSync(tempAssPath); } catch (_) { /* ignore */ }
        }
        return { ok: false, error: ffmpegResolved.error };
    }
    const exe = ffmpegResolved.path;
    const ready = await ensureWindowsExecutableReady(exe, 'ffmpeg');
    if (!ready.ok) {
        if (tempAssPath) {
            try { fs.unlinkSync(tempAssPath); } catch (_) { /* ignore */ }
        }
        return { ok: false, error: ready.error };
    }

    const clipDur = job.previewDurationSec;
    const args = burnCore.buildFfmpegHardsubPreviewArgs(job);
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
    if (onProgress) {
        onProgress({ percent: 0, currentSec: 0, durationSec: clipDur, phase: 'preview-start' });
    }

    return new Promise((resolve) => {
        let stderr = '';
        let settled = false;
        let lastPct = -1;
        const cleanupAss = () => {
            if (!tempAssPath) return;
            try { fs.unlinkSync(tempAssPath); } catch (_) { /* ignore */ }
            tempAssPath = '';
        };
        const finish = (result) => {
            if (settled) return;
            settled = true;
            cleanupAss();
            resolve(result);
        };

        let proc;
        try {
            proc = spawn(exe, args, { windowsHide: true });
            trackFfmpegProc(proc);
        } catch (err) {
            finish({
                ok: false,
                error: formatExecutableSpawnError
                    ? formatExecutableSpawnError(err, exe, 'ffmpeg')
                    : (err.message || String(err)),
            });
            return;
        }

        const emitProgress = (chunk) => {
            if (!onProgress) return;
            const sec = burnCore.parseFfmpegTimeToSec(chunk);
            if (sec == null) return;
            const percent = burnCore.progressPercent(sec, clipDur);
            if (percent === lastPct && percent > 0) return;
            lastPct = percent;
            onProgress({ percent, currentSec: sec, durationSec: clipDur, phase: 'preview-encode' });
        };

        proc.stdout.on('data', (chunk) => emitProgress(chunk.toString()));
        proc.stderr.on('data', (chunk) => {
            const text = chunk.toString();
            stderr += text;
            if (stderr.length > 80000) stderr = stderr.slice(-40000);
            emitProgress(text);
        });
        proc.on('error', (err) => {
            finish({
                ok: false,
                error: formatExecutableSpawnError
                    ? formatExecutableSpawnError(err, exe, 'ffmpeg')
                    : (err.message || String(err)),
            });
        });
        proc.on('close', (code, signal) => {
            if (signal || code === null) {
                try { fs.unlinkSync(outputPath); } catch (_) { /* ignore */ }
                finish({ ok: false, cancelled: true, error: '已取消' });
                return;
            }
            if (code !== 0) {
                try { fs.unlinkSync(outputPath); } catch (_) { /* ignore */ }
                const tip = stderr.trim().split(/\r?\n/).slice(-8).join('\n');
                finish({ ok: false, error: tip || `预览编码失败（退出码 ${code}）`, code });
                return;
            }
            if (!fs.existsSync(outputPath)) {
                finish({ ok: false, error: '预览编码完成但未找到文件' });
                return;
            }
            if (onProgress) {
                onProgress({ percent: 100, currentSec: clipDur, durationSec: clipDur, phase: 'preview-done' });
            }
            finish({
                ok: true,
                outputPath,
                videoPath,
                preview: true,
                durationSec: clipDur,
                startSec: job.previewStartSec,
                styleMode: job.styleMode,
                videoFilter: job.videoFilter,
            });
        });
    });
}

module.exports = {
    burnHardsub,
    burnPreviewClip,
    prepareHardsubJob,
    listBurnEncoders,
    readSubtitleText,
    buildTempDualAssFromTracks,
};
