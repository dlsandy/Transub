/**
 * Local .whl pick / validate / install IPC (manual SenseVoice / GPU / Demucs fallback).
 * Extracted from engine-bridge to keep the monolith thin.
 */
const path = require('path');
const { spawn } = require('child_process');
const {
    validateWhlFiles,
    installLocalWheels,
} = require('./local-whl-install');
const { normalizeEngineDownloadKind } = require('./engine-download-info');
const { broadcastEngineDownloadProgress } = require('./download-window');

/**
 * @param {(channel: string, handler: Function) => void} register
 * @param {object} deps
 * @param {() => boolean} deps.isBatchRunning
 * @param {() => boolean} deps.isDownloadBusy
 * @param {(v: boolean) => void} deps.setDownloadBusy
 * @param {() => AbortController|null} deps.getDownloadAbort
 * @param {(ac: AbortController|null) => void} deps.setDownloadAbort
 * @param {(payload?: object) => Promise<object>} deps.readMergedOptions
 * @param {(installPath: string) => string} deps.resolveEngineInstallPath
 * @param {(installPath: string) => string|null} deps.resolveEngineRuntimePython
 * @param {() => any} deps.getEngineProc
 * @param {() => void} deps.stopEngineProcess
 * @param {(ms: number) => Promise<void>} deps.sleep
 * @param {(opts: object) => Promise<object>} deps.ensureEngineRunning
 * @param {(baseUrl: string, opts?: object) => Promise<object>} deps.getAudioSeparateRuntime
 * @param {(baseUrl: string, opts?: object) => Promise<object>} deps.getGpuRuntime
 */
function ortWhlSelectOpts(payload = {}) {
    return {
        ortGpuRequirement: payload.ortGpuRequirement,
        ortGpuDesiredTarget: payload.ortGpuDesiredTarget || payload.ortGpuTarget,
        ortGpuTarget: payload.ortGpuTarget,
    };
}

function registerLocalWhlIpc(register, deps = {}) {
    if (typeof register !== 'function') {
        throw new Error('registerLocalWhlIpc: register required');
    }
    const {
        isBatchRunning,
        isDownloadBusy,
        setDownloadBusy,
        getDownloadAbort,
        setDownloadAbort,
        readMergedOptions,
        resolveEngineInstallPath,
        resolveEngineRuntimePython,
        getEngineProc,
        stopEngineProcess,
        sleep,
        ensureEngineRunning,
        getAudioSeparateRuntime,
        getGpuRuntime,
    } = deps;

    register('transub-engine-pick-whl', async (event, payload = {}) => {
        try {
            const { BrowserWindow, dialog } = require('electron');
            const win = BrowserWindow.fromWebContents(event.sender);
            if (win && !win.isDestroyed()) {
                if (win.isMinimized()) win.restore();
                win.show();
                win.focus();
            }
            const result = await dialog.showOpenDialog(win || undefined, {
                title: String(payload.title || '选择已下载的 .whl 文件（可多选）'),
                properties: ['openFile', 'multiSelections'],
                filters: [
                    { name: 'Python Wheel (*.whl)', extensions: ['whl'] },
                    { name: '所有文件', extensions: ['*'] },
                ],
                defaultPath: String(payload.defaultPath || '').trim() || undefined,
            });
            if (result.canceled || !result.filePaths?.length) {
                return { ok: true, canceled: true, paths: [] };
            }
            const checked = validateWhlFiles(result.filePaths, ortWhlSelectOpts(payload));
            if (!checked.ok) return checked;
            return {
                ok: true,
                canceled: false,
                paths: checked.paths,
                dropped: checked.dropped || [],
                notes: checked.notes || [],
                note: checked.note || '',
            };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-validate-whl', async (_event, payload = {}) => {
        try {
            return validateWhlFiles(
                payload.paths || payload.wheelPaths || [],
                ortWhlSelectOpts(payload),
            );
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-install-local-wheels', async (_event, payload = {}) => {
        if (isBatchRunning?.()) {
            return { ok: false, error: '字幕任务进行中，请先停止任务再安装组件' };
        }
        if (isDownloadBusy?.()) {
            return { ok: false, error: '已有下载/安装任务正在进行' };
        }
        const kind = normalizeEngineDownloadKind(payload.kind || 'gpu');
        const selectOpts = ortWhlSelectOpts(payload);
        const checked = validateWhlFiles(payload.paths || payload.wheelPaths || [], selectOpts);
        if (!checked.ok) return checked;

        setDownloadBusy?.(true);
        const ac = new AbortController();
        setDownloadAbort?.(ac);
        const signal = ac.signal;
        const emit = (info) => {
            broadcastEngineDownloadProgress({ ...(info || {}), kind, source: 'local-whl' });
        };

        try {
            const options = await readMergedOptions(payload);
            const installPath = resolveEngineInstallPath(options.engineInstallPath);
            const pythonPath = resolveEngineRuntimePython(installPath);
            if (!pythonPath) {
                const err = '找不到引擎 Python（请确认引擎目录含 runtime\\python.exe）';
                emit({ phase: 'error', ok: false, message: err, pct: 0 });
                return { ok: false, error: err };
            }

            if (getEngineProc?.()) {
                emit({ phase: 'progress', message: '正在停止引擎以便安装…', pct: 2 });
                stopEngineProcess?.();
                await sleep(600);
            }

            // onnxruntime (CPU) and onnxruntime-gpu are mutually exclusive.
            const hasOrtGpuWhl = checked.paths.some((p) => /onnxruntime[_-]gpu/i.test(path.basename(p)));
            if (hasOrtGpuWhl) {
                emit({
                    phase: 'progress',
                    message: '正在卸载 CPU 版 onnxruntime（与 GPU 版互斥）…',
                    pct: 5,
                });
                try {
                    await new Promise((resolve) => {
                        const child = spawn(
                            pythonPath,
                            ['-m', 'pip', 'uninstall', '-y', 'onnxruntime'],
                            { windowsHide: true, stdio: 'ignore' },
                        );
                        const t = setTimeout(() => {
                            try { child.kill(); } catch (_) { /* ignore */ }
                            resolve();
                        }, 60_000);
                        child.on('close', () => {
                            clearTimeout(t);
                            resolve();
                        });
                        child.on('error', () => {
                            clearTimeout(t);
                            resolve();
                        });
                    });
                } catch (_) { /* ignore */ }
            }

            emit({
                phase: 'progress',
                message: checked.note
                    ? `${checked.note}。正在本地安装 ${checked.paths.length} 个组件，可能需要几分钟…`
                    : `正在本地安装 ${checked.paths.length} 个组件，可能需要几分钟，请耐心等待…`,
                pct: 8,
            });

            const res = await installLocalWheels({
                pythonPath,
                wheelPaths: checked.paths,
                ...selectOpts,
                signal,
                onProgress: (ev) => {
                    const pct = Number(ev.percent);
                    emit({
                        phase: ev.type === 'done' ? 'progress' : (ev.type === 'error' ? 'error' : 'progress'),
                        message: ev.detail || ev.message || '安装中…',
                        pct: Number.isFinite(pct) ? Math.min(88, pct) : undefined,
                        raw: ev,
                    });
                },
            });

            if (res.cancelled || signal.aborted) {
                emit({ phase: 'cancelled', ok: false, message: '已取消', pct: 0 });
                return { ok: false, cancelled: true, error: 'cancelled' };
            }
            if (!res.ok) {
                const err = res.error || '本地安装失败';
                emit({ phase: 'error', ok: false, message: err, pct: 0 });
                return { ok: false, error: err, logTail: res.logTail };
            }

            emit({ phase: 'progress', message: '正在重启引擎…', pct: 92 });
            const ensure2 = await ensureEngineRunning({ ...options, forceRestart: true });
            if (!ensure2.ok) {
                const msg = '本地 wheel 已安装（引擎重启失败，请手动检测引擎）';
                emit({ phase: 'done', ok: true, message: msg, pct: 100 });
                return {
                    ok: true,
                    restarted: false,
                    message: msg,
                    installed: res.installed,
                    kind,
                };
            }

            let message = `本地安装完成（${(res.installed || []).join(', ')}）`;
            let probe = null;
            try {
                if (kind === 'demucs') {
                    const statusRes = await getAudioSeparateRuntime(ensure2.baseUrl, { timeoutMs: 20000 });
                    probe = statusRes.data || null;
                    message = statusRes.data?.hint || message;
                } else if (kind === 'gpu') {
                    const statusRes = await getGpuRuntime(ensure2.baseUrl, { timeoutMs: 20000 });
                    probe = statusRes.data || null;
                    message = statusRes.data?.hint || message;
                }
            } catch (_) { /* ignore probe errors */ }

            emit({ phase: 'done', ok: true, message, pct: 100 });
            return {
                ok: true,
                restarted: true,
                message,
                installed: res.installed,
                kind,
                probe,
            };
        } catch (err) {
            const msg = err.message || String(err);
            emit({ phase: 'error', ok: false, message: msg, pct: 0 });
            return { ok: false, error: msg };
        } finally {
            setDownloadBusy?.(false);
            setDownloadAbort?.(null);
        }
    });
}

module.exports = {
    registerLocalWhlIpc,
};
