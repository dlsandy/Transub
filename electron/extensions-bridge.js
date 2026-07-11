const fs = require('fs');
const path = require('path');
const { dialog, shell, BrowserWindow, app } = require('electron');
const { probeVideo, resolveFfmpegValidation, validateFfmpegSetup } = require('./ffmpeg-bridge');
const { loadPresets, saveCustomPreset, deleteCustomPreset } = require('./presets-data');
const { loadTaskHistory, appendTaskHistory } = require('./task-history');
const { detectGpuEnvironment } = require('./gpu-detect');
const { resolveLocalSubtitlePath, resolveLocalSubtitleBatch, collectSubtitleSidecars, isSubtitleFile, guessVideoPathForSubtitle, VIDEO_EXTENSIONS: SUBTITLE_VIDEO_EXTENSIONS } = require('./subtitle-utils');
const { parseSubtitle, serializeSubtitle, detectFormat, isEditableFormat } = require('./subtitle-format');
const { resolveMediaUrl } = require('./media-protocol');
const { loadSettings, saveSettings, getSettingsFilePath } = require('./settings-data');
const { getProjectRoot } = require('./app-paths');
const { asString } = require('./ipc-validate');
const { refocusWindow } = require('./window-focus');

const VIDEO_EXTENSIONS = new Set([
    'mp4', 'mkv', 'avi', 'wmv', 'mov', 'flv', 'webm', 'm4v', 'ts', 'mpeg', 'mpg', 'rmvb', 'rm', '3gp',
]);

function isVideoFile(filePath) {
    const ext = path.extname(String(filePath || '')).slice(1).toLowerCase();
    return VIDEO_EXTENSIONS.has(ext);
}

function scanVideosInDirectory(rootDir, recursive = true) {
    const results = [];
    const queue = [path.resolve(rootDir)];
    const seen = new Set();

    while (queue.length) {
        const dir = queue.shift();
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (recursive) queue.push(full);
                continue;
            }
            if (!entry.isFile() || !isVideoFile(full)) continue;
            const key = process.platform === 'win32' ? full.toLowerCase() : full;
            if (seen.has(key)) continue;
            seen.add(key);
            results.push(full);
        }
    }
    return results.sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

function readSubtitleDocument(filePath) {
    const resolved = path.resolve(String(filePath || ''));
    if (!fs.existsSync(resolved)) return { ok: false, error: '字幕文件不存在' };
    if (!isSubtitleFile(path.basename(resolved))) return { ok: false, error: '不是支持的字幕文件' };
    try {
        const raw = fs.readFileSync(resolved, 'utf8');
        const format = detectFormat(resolved, raw);
        if (!isEditableFormat(format)) {
            return { ok: false, error: `暂不支持编辑 ${format.toUpperCase()} 格式，请使用 SRT / VTT / LRC` };
        }
        const parsed = parseSubtitle(raw, format);
        return {
            ok: true,
            path: resolved,
            basename: path.basename(resolved),
            format: parsed.format,
            cues: parsed.cues,
            header: parsed.header || [],
            cueCount: parsed.cues.length,
        };
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    }
}

function writeSubtitleDocument(filePath, payload = {}) {
    const resolved = path.resolve(String(filePath || ''));
    const format = detectFormat(resolved, '');
    const saveFormat = isEditableFormat(payload.format) ? payload.format : format;
    if (!isEditableFormat(saveFormat)) {
        return { ok: false, error: '不支持的字幕格式' };
    }
    const cues = Array.isArray(payload.cues) ? payload.cues : [];
    if (!cues.length) return { ok: false, error: '字幕内容为空' };
    try {
        const content = serializeSubtitle({
            format: saveFormat,
            cues,
            header: payload.header,
        });
        let backupPath;
        if (payload.createBackup === true && fs.existsSync(resolved)) {
            backupPath = `${resolved}.bak`;
            fs.copyFileSync(resolved, backupPath);
        }
        fs.writeFileSync(resolved, content, 'utf8');
        return { ok: true, path: resolved, backupPath, cueCount: cues.length };
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    }
}

function listSubtitleSidecars(videoPath, outputDir) {
    const resolved = path.resolve(String(videoPath || ''));
    if (!fs.existsSync(resolved)) return { ok: false, error: '视频文件不存在' };
    const seen = new Set();
    const sidecars = [];
    const add = (p) => {
        const key = process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p);
        if (seen.has(key)) return;
        seen.add(key);
        sidecars.push(path.resolve(p));
    };

    for (const p of collectSubtitleSidecars(resolved)) add(p);

    if (outputDir) {
        const dir = path.resolve(String(outputDir));
        const stem = path.basename(resolved, path.extname(resolved));
        try {
            for (const name of fs.readdirSync(dir)) {
                if (!isSubtitleFile(name)) continue;
                const fileStem = name.slice(0, name.length - path.extname(name).length);
                if (fileStem === stem || fileStem.startsWith(`${stem}.`)) {
                    add(path.join(dir, name));
                }
            }
        } catch (_) { /* skip */ }
    }

    const items = sidecars.map((p) => {
        let format = detectFormat(p, '');
        let editable = isEditableFormat(format);
        if (editable) {
            try {
                const raw = fs.readFileSync(p, 'utf8');
                format = detectFormat(p, raw);
                editable = isEditableFormat(format);
            } catch (_) { editable = false; }
        }
        return {
            path: p,
            basename: path.basename(p),
            format,
            editable,
        };
    });
    return { ok: true, sidecars: items };
}

function readSubtitlePreview(filePath, maxLines = 24) {
    const resolved = path.resolve(String(filePath || ''));
    if (!fs.existsSync(resolved)) return { ok: false, error: '字幕文件不存在' };
    try {
        const raw = fs.readFileSync(resolved, 'utf8');
        const lines = raw.split(/\r?\n/).slice(0, maxLines);
        return { ok: true, path: resolved, preview: lines.join('\n'), truncated: raw.split(/\r?\n/).length > maxLines };
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    }
}

function openLatestInferLog(installPath) {
    const logPath = path.join(path.resolve(String(installPath || '')), 'latest.log');
    if (!fs.existsSync(logPath)) return { ok: false, error: '未找到 latest.log' };
    shell.openPath(logPath);
    return { ok: true, path: logPath };
}

function browserWindowFromEvent(event) {
    return BrowserWindow.fromWebContents(event.sender);
}

function setupExtensionsBridge(api, deps) {
    const { register } = api;
    const { getAppRoot } = deps;

    register('ffmpeg-probe', async (_event, payload = {}) => {
        try {
            const filePath = asString(payload.path, 4096).trim();
            if (!filePath) return { ok: false, error: '缺少路径' };
            const settings = loadSettings(getAppRoot).options || {};
            const ffmpegPath = payload.ffmpegPath != null
                ? asString(payload.ffmpegPath, 4096).trim()
                : settings.ffmpegPath;
            const validation = resolveFfmpegValidation(ffmpegPath);
            if (!validation.ok) return { ok: false, error: validation.error };
            return probeVideo(filePath, validation.path);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('ffmpeg-validate', async (_event, payload = {}) => {
        try {
            const settings = loadSettings(getAppRoot).options || {};
            const ffmpegPath = payload.ffmpegPath != null
                ? asString(payload.ffmpegPath, 4096).trim()
                : settings.ffmpegPath;
            return validateFfmpegSetup(ffmpegPath);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('electron-select-ffmpeg', async (event, options = {}) => {
        const win = browserWindowFromEvent(event);
        const result = await dialog.showOpenDialog(win, {
            title: options.title || '选择 ffmpeg.exe',
            properties: ['openFile'],
            filters: [
                { name: 'FFmpeg', extensions: ['exe'] },
                { name: '所有文件', extensions: ['*'] },
            ],
        });
        if (result.canceled || !result.filePaths?.length) {
            return { ok: true, canceled: true };
        }
        return { ok: true, canceled: false, path: result.filePaths[0] };
    });

    register('transwithai-scan-folder', async (_event, payload = {}) => {
        try {
            const folder = asString(payload.folder, 4096).trim();
            if (!folder || !fs.existsSync(folder)) return { ok: false, error: '文件夹不存在' };
            const files = scanVideosInDirectory(folder, payload.recursive !== false);
            return { ok: true, files };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transwithai-check-subtitles', async (_event, payload = {}) => {
        try {
            const paths = Array.isArray(payload.paths) ? payload.paths : [];
            const outputDir = asString(payload.outputDir, 4096).trim();
            const map = {};
            for (const p of paths) {
                const videoPath = asString(p, 4096).trim();
                if (!videoPath) continue;
                const sub = resolveLocalSubtitlePath(videoPath, outputDir || undefined);
                if (sub) map[videoPath] = sub;
            }
            return { ok: true, subtitles: map };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transwithai-get-presets', async () => {
        try {
            return { ok: true, presets: loadPresets().presets };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transwithai-save-preset', async (_event, payload = {}) => {
        try {
            const preset = saveCustomPreset(payload);
            return { ok: true, preset, presets: loadPresets().presets };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transwithai-delete-preset', async (_event, payload = {}) => {
        try {
            deleteCustomPreset(payload.id);
            return { ok: true, presets: loadPresets().presets };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transwithai-get-task-history', async () => {
        try {
            return { ok: true, entries: loadTaskHistory().entries };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transwithai-detect-gpu', async () => {
        try {
            const info = await detectGpuEnvironment();
            return { ok: true, info };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transwithai-subtitle-preview', async (_event, payload = {}) => {
        try {
            const filePath = asString(payload.path, 4096).trim();
            return readSubtitlePreview(filePath, Number(payload.maxLines) || 24);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-read-subtitle', async (_event, payload = {}) => {
        try {
            const filePath = asString(payload.path, 4096).trim();
            if (!filePath) return { ok: false, error: '缺少路径' };
            return readSubtitleDocument(filePath);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-write-subtitle', async (_event, payload = {}) => {
        try {
            const filePath = asString(payload.path, 4096).trim();
            if (!filePath) return { ok: false, error: '缺少路径' };
            return writeSubtitleDocument(filePath, payload);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-list-subtitle-sidecars', async (_event, payload = {}) => {
        try {
            const videoPath = asString(payload.videoPath, 4096).trim();
            const outputDir = asString(payload.outputDir, 4096).trim();
            if (!videoPath) return { ok: false, error: '缺少视频路径' };
            return listSubtitleSidecars(videoPath, outputDir || undefined);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-select-subtitle', async (event, options = {}) => {
        try {
            const win = browserWindowFromEvent(event);
            if (win && !win.isDestroyed()) {
                if (win.isMinimized()) win.restore();
                win.show();
                win.focus();
            }
            const defaultPath = asString(options.defaultPath, 4096).trim();
            const result = await dialog.showOpenDialog(win || undefined, {
                title: options.title || '选择字幕文件',
                properties: ['openFile'],
                filters: [
                    { name: '字幕 (SRT / VTT / LRC)', extensions: ['srt', 'vtt', 'lrc'] },
                    { name: '所有文件', extensions: ['*'] },
                ],
                defaultPath: defaultPath || undefined,
            });
            refocusWindow(win);
            if (result.canceled || !result.filePaths?.length) {
                return { ok: true, canceled: true };
            }
            const subPath = path.resolve(result.filePaths[0]);
            const videoPath = guessVideoPathForSubtitle(subPath) || '';
            return { ok: true, canceled: false, path: subPath, videoPath };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-select-editor-video', async (event, payload = {}) => {
        try {
            const win = browserWindowFromEvent(event);
            if (win && !win.isDestroyed()) {
                if (win.isMinimized()) win.restore();
                win.show();
                win.focus();
            }
            const hintPath = asString(payload.defaultPath, 4096).trim();
            const defaultPath = hintPath ? path.dirname(path.resolve(hintPath)) : undefined;
            const result = await dialog.showOpenDialog(win, {
                title: payload.title || '选择关联视频',
                properties: ['openFile'],
                filters: [{ name: '视频', extensions: SUBTITLE_VIDEO_EXTENSIONS }],
                defaultPath,
            });
            refocusWindow(win);
            if (result.canceled || !result.filePaths?.length) {
                return { ok: true, canceled: true };
            }
            return { ok: true, canceled: false, path: path.resolve(result.filePaths[0]) };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-guess-video-for-subtitle', async (_event, payload = {}) => {
        try {
            const subPath = asString(payload.path, 4096).trim();
            if (!subPath) return { ok: false, error: '缺少字幕路径' };
            const videoPath = guessVideoPathForSubtitle(subPath);
            return { ok: true, videoPath: videoPath || null };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-resolve-media-url', async (_event, payload = {}) => {
        try {
            const filePath = asString(payload.path, 4096).trim();
            return resolveMediaUrl(filePath);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transwithai-open-latest-log', async (_event, payload = {}) => {
        try {
            return openLatestInferLog(payload.installPath);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transwithai-export-config', async (event) => {
        try {
            const win = browserWindowFromEvent(event);
            const result = await dialog.showSaveDialog(win, {
                title: '导出配置',
                defaultPath: path.join(getProjectRoot(), 'transub-config-export.json'),
                filters: [{ name: 'JSON', extensions: ['json'] }],
            });
            if (result.canceled || !result.filePath) return { ok: true, canceled: true };
            const options = loadSettings(getAppRoot).options || {};
            fs.writeFileSync(result.filePath, `${JSON.stringify({ version: 1, options }, null, 2)}\n`, 'utf8');
            return { ok: true, path: result.filePath };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transwithai-import-config', async (event) => {
        try {
            const win = browserWindowFromEvent(event);
            const result = await dialog.showOpenDialog(win, {
                title: '导入配置',
                filters: [{ name: 'JSON', extensions: ['json'] }],
                properties: ['openFile'],
            });
            if (result.canceled || !result.filePaths?.length) return { ok: true, canceled: true };
            const parsed = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
            const options = parsed.options ?? parsed;
            if (!options || typeof options !== 'object') return { ok: false, error: '无效配置文件' };
            saveSettings(getAppRoot, options);
            return { ok: true, options };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transwithai-check-app-update', async () => {
        try {
            const pkg = require(path.join(getProjectRoot(), 'package.json'));
            return {
                ok: true,
                currentVersion: pkg.version || '1.0.0',
                transWithAiReleasesUrl: 'https://github.com/TransWithAI/Faster-Whisper-TransWithAI-ChickenRice/releases',
            };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transwithai-open-path', async (_event, targetPath) => {
        try {
            const p = asString(targetPath, 4096).trim();
            if (!p) return { ok: false, error: '缺少路径' };
            const errMsg = await shell.openPath(path.resolve(p));
            return errMsg ? { ok: false, error: errMsg } : { ok: true };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

}

module.exports = {
    setupExtensionsBridge,
    scanVideosInDirectory,
    appendTaskHistory,
    readSubtitleDocument,
    writeSubtitleDocument,
    listSubtitleSidecars,
};
