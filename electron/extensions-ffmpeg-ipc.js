/**
 * FFmpeg / burn / env-check IPC channels.
 * Extracted from extensions-bridge to keep the monolith thin.
 */

const path = require('path');
const { dialog } = require('electron');
const {
    probeVideo,
    resolveFfmpegValidation,
    validateFfmpegSetup,
    detectSilenceInRange,
    cancelActiveFfmpegJobs,
    extractWaveformPeaks,
    probeAcousticWindow,
} = require('./ffmpeg-bridge');
const { loadSettings } = require('./settings-data');
const { asString } = require('./ipc-validate');
const { refocusWindow } = require('./window-focus');

/**
 * @param {(channel: string, handler: Function) => void} register
 * @param {object} deps
 * @param {() => string} deps.getAppRoot
 * @param {(event: any) => any} deps.browserWindowFromEvent
 * @param {typeof dialog} [deps.dialog]
 * @param {typeof refocusWindow} [deps.refocusWindow]
 */
function registerExtensionsFfmpegIpc(register, deps = {}) {
    if (typeof register !== 'function') {
        throw new Error('registerExtensionsFfmpegIpc: register required');
    }
    const { getAppRoot, browserWindowFromEvent } = deps;
    const showDialog = deps.dialog || dialog;
    const doRefocus = deps.refocusWindow || refocusWindow;

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

    register('ffmpeg-probe-acoustic', async (_event, payload = {}) => {
        try {
            const filePath = asString(payload.path || payload.mediaPath, 4096).trim();
            if (!filePath) return { ok: false, error: '缺少路径' };
            const settings = loadSettings(getAppRoot).options || {};
            const ffmpegPath = payload.ffmpegPath != null
                ? asString(payload.ffmpegPath, 4096).trim()
                : settings.ffmpegPath;
            return await probeAcousticWindow(filePath, {
                ffmpegPath,
                durationSec: payload.durationSec,
                startSec: payload.startSec,
                noiseDb: payload.noiseDb,
                minSilenceSec: payload.minSilenceSec,
            });
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
            return validateFfmpegSetup(ffmpegPath, { quick: !!payload.quick });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-env-check', async (_event, payload = {}) => {
        try {
            const { runEnvCheck } = require('./env-check');
            const settings = loadSettings(getAppRoot).options || {};
            const ffmpegPath = payload.ffmpegPath != null
                ? asString(payload.ffmpegPath, 4096).trim()
                : settings.ffmpegPath;
            const engineInstallPath = payload.engineInstallPath != null
                ? asString(payload.engineInstallPath, 4096).trim()
                : String(settings.engineInstallPath || '').trim();
            const engineAsrModel = payload.engineAsrModel != null
                ? asString(payload.engineAsrModel, 128).trim()
                : String(settings.engineAsrModel || '').trim();
            return await runEnvCheck({
                ffmpegPath,
                engineInstallPath,
                engineAsrModel,
                // Wizard passes syncLlamaBackend:true to force CUDA 12/13 preference.
                syncLlamaBackend: !!payload.syncLlamaBackend,
                scope: payload.scope != null
                    ? asString(payload.scope, 32).trim()
                    : 'full',
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err), items: [] };
        }
    });

    register('ffmpeg-detect-silence', async (_event, payload = {}) => {
        try {
            const filePath = asString(payload.path, 4096).trim();
            if (!filePath) return { ok: false, error: '缺少视频路径' };
            const startMs = Math.max(0, Math.round(Number(payload.startMs) || 0));
            const durationMs = Math.max(0, Math.round(Number(payload.durationMs) || 0));
            let endMs = Math.round(Number(payload.endMs) || 0);
            if (durationMs >= 200) {
                endMs = startMs + durationMs;
            } else if (!(endMs > startMs)) {
                endMs = startMs + Math.max(100, durationMs);
            }
            const settings = loadSettings(getAppRoot).options || {};
            const ffmpegPathSetting = payload.ffmpegPath != null
                ? asString(payload.ffmpegPath, 4096).trim()
                : settings.ffmpegPath;
            return detectSilenceInRange(filePath, startMs, endMs, {
                ffmpegPathSetting,
                noiseDb: Number(payload.noiseDb),
                minSilenceSec: Number(payload.minSilenceSec),
                minSegmentMs: Number(payload.minSegmentMs),
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('ffmpeg-cancel', async () => {
        try {
            return cancelActiveFfmpegJobs();
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('ffmpeg-burn-hardsub', async (event, payload = {}) => {
        try {
            const settings = loadSettings(getAppRoot).options || {};
            const ffmpegPathSetting = payload.ffmpegPath != null
                ? asString(payload.ffmpegPath, 4096).trim()
                : settings.ffmpegPath;
            let burnSettings = {
                burnContainer: 'mp4',
                burnEncoderId: 'libx264',
                burnAudioMode: 'copy',
                burnCrf: 18,
                burnResolutionId: 'source',
                burnFpsId: 'source',
                burnEncodeSpeedId: 'medium',
                burnOutputSuffix: 'burned',
                burnOutputDir: '',
            };
            try {
                const burnCore = require('../src/js/subtitle-burn-core');
                burnSettings = {
                    ...burnSettings,
                    ...burnCore.normalizeBurnSettingsOptions(settings),
                };
            } catch (_) { /* keep defaults */ }
            // Encode/path live in settings.json; do not let a stale renderer payload override them.
            const { burnHardsub } = require('./ffmpeg-burn');
            const computeLock = require('./compute-task-lock');
            return await computeLock.runWithComputeLock({
                kind: 'ffmpeg_burn',
                owner: '字幕烧录',
                source: 'factory',
            }, async () => burnHardsub({
                videoPath: asString(payload.videoPath, 4096).trim(),
                subtitlePath: asString(payload.subtitlePath, 4096).trim(),
                bilingualSubtitlePath: asString(payload.bilingualSubtitlePath || payload.dualSubtitlePath, 4096).trim(),
                sourceSubtitlePath: asString(payload.sourceSubtitlePath, 4096).trim(),
                subtitleTrack: asString(payload.subtitleTrack, 32).trim(),
                outputPath: asString(payload.outputPath, 4096).trim(),
                container: burnSettings.burnContainer,
                styleMode: asString(payload.styleMode, 32).trim(),
                outputMode: asString(payload.outputMode, 32).trim(),
                audioMode: burnSettings.burnAudioMode,
                basicStyle: payload.basicStyle && typeof payload.basicStyle === 'object'
                    ? payload.basicStyle
                    : undefined,
                crf: burnSettings.burnCrf,
                resolutionId: burnSettings.burnResolutionId,
                fpsId: burnSettings.burnFpsId,
                encodeSpeedId: burnSettings.burnEncodeSpeedId,
                outputSuffix: burnSettings.burnOutputSuffix,
                outputDir: burnSettings.burnOutputDir,
                encoderId: burnSettings.burnEncoderId,
                ffmpegPathSetting,
                onProgress: (progress) => {
                    try {
                        if (event?.sender && !event.sender.isDestroyed()) {
                            event.sender.send('ffmpeg-burn-progress', progress || {});
                        }
                    } catch (_) { /* ignore */ }
                },
            }));
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('ffmpeg-burn-preview-clip', async (event, payload = {}) => {
        try {
            const settings = loadSettings(getAppRoot).options || {};
            const ffmpegPathSetting = payload.ffmpegPath != null
                ? asString(payload.ffmpegPath, 4096).trim()
                : settings.ffmpegPath;
            const { burnPreviewClip } = require('./ffmpeg-burn');
            const computeLock = require('./compute-task-lock');
            return await computeLock.runWithComputeLock({
                kind: 'ffmpeg_burn_preview',
                owner: '字幕烧录预览',
                source: 'factory',
            }, async () => burnPreviewClip({
                videoPath: asString(payload.videoPath, 4096).trim(),
                subtitlePath: asString(payload.subtitlePath, 4096).trim(),
                bilingualSubtitlePath: asString(payload.bilingualSubtitlePath || payload.dualSubtitlePath, 4096).trim(),
                sourceSubtitlePath: asString(payload.sourceSubtitlePath, 4096).trim(),
                subtitleTrack: asString(payload.subtitleTrack, 32).trim(),
                styleMode: asString(payload.styleMode, 32).trim(),
                basicStyle: payload.basicStyle && typeof payload.basicStyle === 'object'
                    ? payload.basicStyle
                    : undefined,
                startSec: Number(payload.startSec) || 0,
                durationSec: Number(payload.durationSec) || 45,
                maxHeight: Number(payload.maxHeight) || 720,
                ffmpegPathSetting,
                onProgress: (progress) => {
                    try {
                        if (event?.sender && !event.sender.isDestroyed()) {
                            event.sender.send('ffmpeg-burn-progress', progress || {});
                        }
                    } catch (_) { /* ignore */ }
                },
            }));
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('ffmpeg-burn-delete-preview', async (_event, payload = {}) => {
        try {
            const fs = require('fs');
            const pathMod = require('path');
            const os = require('os');
            const filePath = asString(payload.path || payload.outputPath, 4096).trim();
            if (!filePath) return { ok: false, error: '缺少预览路径' };
            const resolved = pathMod.resolve(filePath);
            const previewRoot = pathMod.resolve(pathMod.join(os.tmpdir(), 'transub-burn-preview'));
            const rootKey = process.platform === 'win32' ? previewRoot.toLowerCase() : previewRoot;
            const fileKey = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
            if (fileKey !== rootKey && !fileKey.startsWith(rootKey + pathMod.sep)) {
                return { ok: false, error: '只能删除预览临时文件' };
            }
            if (fs.existsSync(resolved)) {
                fs.unlinkSync(resolved);
            }
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('ffmpeg-burn-list-encoders', async (_event, payload = {}) => {
        try {
            const settings = loadSettings(getAppRoot).options || {};
            const ffmpegPathSetting = payload.ffmpegPath != null
                ? asString(payload.ffmpegPath, 4096).trim()
                : settings.ffmpegPath;
            const { listBurnEncoders } = require('./ffmpeg-burn');
            return await listBurnEncoders({ ffmpegPathSetting });
        } catch (err) {
            return { ok: false, error: err.message || String(err), encoders: [] };
        }
    });

    register('ffmpeg-burn-read-text', async (_event, payload = {}) => {
        try {
            const filePath = asString(payload.path || payload.subtitlePath, 4096).trim();
            if (!filePath) return { ok: false, error: '缺少字幕路径' };
            const { readSubtitleText } = require('./ffmpeg-burn');
            return readSubtitleText(filePath);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('ffmpeg-burn-select-output', async (event, options = {}) => {
        try {
            const win = browserWindowFromEvent(event);
            const container = asString(options.container, 16).trim().toLowerCase() === 'mkv' ? 'mkv' : 'mp4';
            const hint = asString(options.defaultPath, 4096).trim();
            const { resolveDialogDefaultPath, rememberOpenPath } = require('./last-open-dir');
            const defaultPath = resolveDialogDefaultPath(getAppRoot, hint)
                || hint
                || `output.burned.${container}`;
            const result = await showDialog.showSaveDialog(win || undefined, {
                title: options.title || '保存烧录成片',
                defaultPath,
                filters: [
                    { name: 'MP4', extensions: ['mp4'] },
                    { name: 'MKV', extensions: ['mkv'] },
                    { name: '所有文件', extensions: ['*'] },
                ],
            });
            doRefocus(win);
            if (result.canceled || !result.filePath) {
                return { ok: true, canceled: true };
            }
            let out = path.resolve(result.filePath);
            if (!/\.(mp4|mkv)$/i.test(out)) {
                out = `${out}.${container}`;
            }
            rememberOpenPath(getAppRoot, out);
            return { ok: true, canceled: false, path: out };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('ffmpeg-extract-waveform', async (_event, payload = {}) => {
        try {
            const filePath = asString(payload.path, 4096).trim();
            if (!filePath) return { ok: false, error: '缺少视频路径' };
            const settings = loadSettings(getAppRoot).options || {};
            const ffmpegPathSetting = payload.ffmpegPath != null
                ? asString(payload.ffmpegPath, 4096).trim()
                : settings.ffmpegPath;
            return extractWaveformPeaks(filePath, {
                ffmpegPathSetting,
                peaksPerSec: Number(payload.peaksPerSec),
                maxPeaks: Number(payload.maxPeaks),
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('electron-select-ffmpeg', async (event, options = {}) => {
        const win = browserWindowFromEvent(event);
        const result = await showDialog.showOpenDialog(win, {
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
}

module.exports = { registerExtensionsFfmpegIpc };
