/**
 * Engine model / GPU / Demucs download job.
 * Bound from engine-bridge via createEngineDownloadJob(host).
 */
'use strict';

const REQUIRED_HOST_KEYS = [
    'getBatchRunning',
    'getDownloadBusy',
    'setDownloadBusy',
    'getDownloadAbort',
    'setDownloadAbort',
    'getEngineProc',
    'normalizeEngineDownloadKind',
    'broadcastEngineDownloadProgress',
    'readMergedOptions',
    'stopEngineProcessAndPort',
    'stopEngineProcess',
    'sleep',
    'ensureEngineRunning',
    'resolveEngineInstallPath',
    'resolveEngineRuntimePython',
    'DEFAULT_ENGINE_URL',
    'modelIdsNeedWhisperExtras',
    'modelIdsNeedSensevoiceExtras',
    'modelIdsNeedQwenExtras',
    'ensureAsrWhisperOffline',
    'ensureAsrSensevoiceOffline',
    'ensureAsrQwen3Offline',
    'ensureAudioSeparateRuntimeStream',
    'getAudioSeparateRuntime',
    'ensureGpuRuntimeStream',
    'getGpuRuntime',
    'downloadModelsStream',
];

/**
 * @param {object} host bridge bindings (mutable downloadBusy / downloadAbort via getters/setters)
 */
function createEngineDownloadJob(host) {
    if (!host || typeof host !== 'object') {
        throw new Error('createEngineDownloadJob: host required');
    }
    const missing = REQUIRED_HOST_KEYS.filter((k) => host[k] == null);
    if (missing.length) {
        throw new Error(`createEngineDownloadJob: incomplete host (missing: ${missing.join(', ')})`);
    }

    async function runEngineDownload(payload = {}, _event) {
        const {
            getBatchRunning,
            getDownloadBusy,
            setDownloadBusy,
            getDownloadAbort,
            setDownloadAbort,
            getEngineProc,
            normalizeEngineDownloadKind,
            broadcastEngineDownloadProgress,
            readMergedOptions,
            stopEngineProcessAndPort,
            stopEngineProcess,
            sleep,
            ensureEngineRunning,
            resolveEngineInstallPath,
            resolveEngineRuntimePython,
            DEFAULT_ENGINE_URL,
            modelIdsNeedWhisperExtras,
            modelIdsNeedSensevoiceExtras,
            modelIdsNeedQwenExtras,
            ensureAsrWhisperOffline,
            ensureAsrSensevoiceOffline,
            ensureAsrQwen3Offline,
            ensureAudioSeparateRuntimeStream,
            getAudioSeparateRuntime,
            ensureGpuRuntimeStream,
            getGpuRuntime,
            downloadModelsStream,
        } = host;

        if (getBatchRunning()) {
            return { ok: false, error: '字幕任务进行中，请先停止任务再下载模型 / 组件' };
        }
        if (getDownloadBusy()) {
            return { ok: false, error: '已有下载任务正在进行' };
        }
        setDownloadBusy(true);
        setDownloadAbort(new AbortController());
        const signal = getDownloadAbort().signal;
        const kind = normalizeEngineDownloadKind(payload.kind);
        const emit = (info) => {
            broadcastEngineDownloadProgress({ ...(info || {}), kind });
        };
        try {
            const options = await readMergedOptions(payload);
            const hfEndpoint = payload.hfEndpoint != null
                ? String(payload.hfEndpoint || '').trim().replace(/\/+$/, '')
                : String(options.engineHfEndpoint || '').trim().replace(/\/+$/, '');
            const hfToken = payload.hfToken != null
                ? String(payload.hfToken || '').trim()
                : String(options.engineHfToken || '').trim();
            const optionsWithHf = {
                ...options,
                engineHfEndpoint: hfEndpoint,
                engineHfToken: hfToken,
            };
            const preferredPipMirror = payload.preferredPipMirror != null
                ? String(payload.preferredPipMirror || '').trim()
                : (payload.pipMirror != null ? String(payload.pipMirror || '').trim() : '');
            const offlineExtrasOpts = preferredPipMirror
                ? { preferredPipMirror }
                : {};

            if (getBatchRunning()) {
                return { ok: false, error: '字幕任务进行中，请先停止任务再下载模型 / 组件' };
            }
            // Always reclaim engine + listen port before pip extras — orphaned
            // runtime\\python.exe holding onnxruntime/av DLLs causes WinError 5.
            try {
                stopEngineProcessAndPort();
            } catch {
                try { stopEngineProcess(); } catch { /* ignore */ }
            }
            await sleep(1200);

            // ASR extras must install while the engine is stopped: a running
            // server already imports native wheels and Windows then denies
            // overwrite (WinError 5 / 拒绝访问).
            const earlyModelIds = Array.isArray(payload.modelIds)
                ? payload.modelIds.map((id) => String(id || '').trim()).filter(Boolean)
                : [];
            const needWhisperExtras = !!payload.force || modelIdsNeedWhisperExtras(earlyModelIds);
            const needSensevoiceExtras = !!payload.force || modelIdsNeedSensevoiceExtras(earlyModelIds);
            const needQwenExtras = !!payload.force || modelIdsNeedQwenExtras(earlyModelIds);
            const installPath = resolveEngineInstallPath(optionsWithHf.engineInstallPath);
            const pythonPath = resolveEngineRuntimePython(installPath);

            if (kind === 'torch-rocm') {
                const { ensureTorchRocmOffline } = require('./engine-runtime-extras');
                emit({
                    phase: 'progress',
                    stage: 'pip',
                    message: '正在把 ROCm PyTorch 装进引擎运行时（系统 pip 无效）…',
                    pct: 8,
                });
                const pre = await ensureTorchRocmOffline({
                    pythonPath,
                    cwd: installPath,
                    force: true,
                    signal,
                    ...offlineExtrasOpts,
                    onProgress: (ev) => {
                        const detail = String(ev?.detail || ev?.message || '').trim();
                        emit({
                            phase: 'progress',
                            stage: 'pip',
                            message: detail ? `ROCm PyTorch · ${detail}` : '正在安装 ROCm PyTorch…',
                            pct: 30,
                        });
                    },
                });
                if (pre.cancelled || signal.aborted) {
                    emit({ phase: 'cancelled', ok: false, message: '已取消', pct: 0 });
                    return { ok: false, cancelled: true, error: 'cancelled' };
                }
                if (!pre.ok) {
                    const err = pre.error || pre.message || 'ROCm PyTorch 安装失败';
                    emit({
                        phase: 'error',
                        ok: false,
                        message: err,
                        pct: 0,
                        suggestManual: true,
                    });
                    return {
                        ok: false,
                        error: err,
                        code: pre.code || '',
                        logTail: pre.logTail,
                        pipCommand: pre.pipCommand || '',
                        suggestManual: true,
                        manualKind: 'torch-rocm',
                    };
                }
                emit({ phase: 'progress', message: 'ROCm PyTorch 已安装，正在重启引擎…', pct: 92 });
                const ensure2 = await ensureEngineRunning({ ...optionsWithHf, forceRestart: true });
                const message = pre.message || '已把 ROCm PyTorch 装进引擎运行时';
                if (!ensure2.ok) {
                    emit({ phase: 'done', ok: true, message: `${message}（引擎重启失败，请重新检测）`, pct: 100 });
                    return { ok: true, restarted: false, message };
                }
                emit({ phase: 'done', ok: true, message, pct: 100 });
                return { ok: true, restarted: true, message };
            }

            const emitOfflineExtrasProgress = (ev, label, pctBase, retry = false) => {
                const pct = Number(ev.percent);
                const downloadedBytes = Number(
                    ev.downloadedBytes ?? ev.received ?? ev.downloaded,
                );
                const totalBytes = Number(ev.totalBytes ?? ev.totalSize);
                const bytesPerSecond = Number(ev.bytesPerSecond ?? ev.speed);
                const mappedPct = Number.isFinite(pct)
                    ? Math.min(
                        pctBase + (retry ? 14 : 12),
                        pctBase + (retry ? 2 : 0) + Math.round(pct * 0.12),
                    )
                    : pctBase + (retry ? 4 : 2);
                const stage = String(ev.stage || 'pip').trim() || 'pip';
                const detail = String(ev.detail || ev.message || '').trim();
                const message = detail
                    ? `${label} · ${detail}`
                    : `正在${retry ? '重试' : ''}安装 ${label}…`;
                emit({
                    phase: 'progress',
                    stage,
                    // Runtime extras are not HF model weights — never invent a modelId.
                    message,
                    pct: mappedPct,
                    downloadedBytes: Number.isFinite(downloadedBytes) && downloadedBytes >= 0
                        ? downloadedBytes
                        : undefined,
                    totalBytes: Number.isFinite(totalBytes) && totalBytes > 0 ? totalBytes : undefined,
                    bytesPerSecond: Number.isFinite(bytesPerSecond) && bytesPerSecond > 0
                        ? bytesPerSecond
                        : undefined,
                    suggestManual: !!ev.suggestManual
                        || stage === 'torch_cuda'
                        || /改装 cuda|cuda pytorch|直链下载 cuda/i.test(detail),
                    raw: ev,
                });
            };

            const runOfflineExtras = async ({ need, ensureFn, label, pctBase }) => {
                if (!need || !pythonPath) return { ok: true, skipped: true };
                emit({
                    phase: 'progress',
                    stage: 'pip',
                    message: `正在补齐 ${label}（引擎已停止，避免文件占用）…`,
                    pct: pctBase,
                });
                let pre = await ensureFn({
                    pythonPath,
                    cwd: installPath,
                    force: false,
                    signal,
                    ...offlineExtrasOpts,
                    onProgress: (ev) => emitOfflineExtrasProgress(ev, label, pctBase, false),
                });
                if (
                    !pre.ok
                    && pre.code === 'EXTRAS_LOCKED_IN_PROCESS'
                    && !signal?.aborted
                ) {
                    // Do NOT --force-reinstall the full Whisper stack: onnxruntime-gpu
                    // from 「下载 GPU 支持」is often already mapped and WinError 5 again.
                    // Stop harder, wait, then install only still-missing wheels.
                    emit({
                        phase: 'progress',
                        stage: 'pip',
                        message: `${label}文件被占用，正在彻底停止引擎后重试（仅补缺失项）…`,
                        pct: pctBase + 2,
                    });
                    try {
                        stopEngineProcessAndPort();
                    } catch { /* ignore */ }
                    await sleep(1500);
                    pre = await ensureFn({
                        pythonPath,
                        cwd: installPath,
                        force: false,
                        signal,
                        ...offlineExtrasOpts,
                        onProgress: (ev) => emitOfflineExtrasProgress(ev, label, pctBase, true),
                    });
                }
                if (
                    !pre.ok
                    && (pre.code === 'TORCH_CUDA_INSTALL_FAILED' || pre.code === 'TORCH_CUDA_REQUIRED')
                ) {
                    pre.suggestManual = true;
                    pre.manualKind = 'torch-cuda';
                    if (!pre.error && pre.message) pre.error = pre.message;
                }
                return pre;
            };

            if (kind === 'models' && (needWhisperExtras || needSensevoiceExtras || needQwenExtras)) {
                if (needWhisperExtras) {
                    const pre = await runOfflineExtras({
                        need: true,
                        ensureFn: ensureAsrWhisperOffline,
                        label: 'Whisper 运行库',
                        pctBase: 3,
                    });
                    if (pre.cancelled || signal.aborted) {
                        emit({ phase: 'cancelled', ok: false, message: '已取消', pct: 0 });
                        return { ok: false, cancelled: true, error: 'cancelled' };
                    }
                    if (!pre.ok && pre.code !== 'SMART_APP_CONTROL' && !pre.skipped) {
                        const err = pre.error || pre.message || 'Whisper 运行库安装失败';
                        // Do not block SenseVoice repair when LID/Whisper extras fail first.
                        if (needSensevoiceExtras) {
                            emit({
                                phase: 'progress',
                                message: `Whisper 运行库暂未装好：${err}；继续补齐 SenseVoice…`,
                                pct: 8,
                            });
                        } else {
                            emit({ phase: 'error', ok: false, message: err, pct: 0 });
                            return { ok: false, error: err, code: pre.code || '', logTail: pre.logTail };
                        }
                    } else if (pre.code === 'SMART_APP_CONTROL') {
                        emit({
                            phase: 'progress',
                            message: pre.message || pre.error || 'Whisper 运行库受系统策略拦截，将继续尝试其它项…',
                            pct: 8,
                        });
                    }
                }
                if (needSensevoiceExtras) {
                    const pre = await runOfflineExtras({
                        need: true,
                        ensureFn: ensureAsrSensevoiceOffline,
                        label: 'SenseVoice 运行库',
                        pctBase: needWhisperExtras ? 10 : 3,
                    });
                    if (pre.cancelled || signal.aborted) {
                        emit({ phase: 'cancelled', ok: false, message: '已取消', pct: 0 });
                        return { ok: false, cancelled: true, error: 'cancelled' };
                    }
                    if (!pre.ok && pre.code !== 'SMART_APP_CONTROL' && !pre.skipped) {
                        const err = pre.error || pre.message || 'SenseVoice 运行库安装失败';
                        emit({
                            phase: 'error',
                            ok: false,
                            message: err,
                            pct: 0,
                            suggestManual: !!pre.suggestManual,
                        });
                        return {
                            ok: false,
                            error: err,
                            code: pre.code || '',
                            logTail: pre.logTail,
                            suggestManual: !!pre.suggestManual,
                            manualKind: pre.manualKind || '',
                        };
                    }
                    if (pre.code === 'SMART_APP_CONTROL') {
                        emit({
                            phase: 'progress',
                            message: pre.message || pre.error || 'SenseVoice 运行库受系统策略拦截，将继续尝试其它项…',
                            pct: 14,
                        });
                    }
                }
                if (needQwenExtras) {
                    const qwenPctBase = (needWhisperExtras ? 10 : 3)
                        + (needSensevoiceExtras ? 8 : 0);
                    const pre = await runOfflineExtras({
                        need: true,
                        ensureFn: ensureAsrQwen3Offline,
                        label: 'Qwen3-ASR 运行库',
                        pctBase: qwenPctBase,
                    });
                    if (pre.cancelled || signal.aborted) {
                        emit({ phase: 'cancelled', ok: false, message: '已取消', pct: 0 });
                        return { ok: false, cancelled: true, error: 'cancelled' };
                    }
                    if (!pre.ok && pre.code !== 'SMART_APP_CONTROL' && !pre.skipped) {
                        const err = pre.error || pre.message || 'Qwen3-ASR 运行库安装失败';
                        emit({
                            phase: 'error',
                            ok: false,
                            message: err,
                            pct: 0,
                            suggestManual: !!pre.suggestManual,
                        });
                        return {
                            ok: false,
                            error: err,
                            code: pre.code || '',
                            logTail: pre.logTail,
                            suggestManual: !!pre.suggestManual,
                            manualKind: pre.manualKind || 'torch-cuda',
                        };
                    }
                    if (pre.code === 'SMART_APP_CONTROL') {
                        emit({
                            phase: 'progress',
                            message: pre.message || pre.error || 'Qwen3-ASR 运行库受系统策略拦截，将继续尝试其它项…',
                            pct: qwenPctBase + 4,
                        });
                    }
                }
            }

            emit({ phase: 'progress', message: '正在启动引擎…', pct: 2 });
            let ensure = await ensureEngineRunning(optionsWithHf);
            const sakuraCatalogEarly = require('../src/js/sakura-mt-catalog-core');
            const earlyIds = Array.isArray(payload.modelIds)
                ? payload.modelIds.map((id) => String(id || '').trim()).filter(Boolean)
                : [];
            const earlySakuraOnly = earlyIds.length > 0
                && earlyIds.every((id) => sakuraCatalogEarly.isSakuraMtModel(id));
            if (!ensure.ok) {
                if (kind === 'models' && earlySakuraOnly) {
                    emit({
                        phase: 'progress',
                        message: '引擎未就绪，仅下载推理翻译 GGUF…',
                        pct: 10,
                    });
                    // Skip to sakura-only path below via empty engine + selected sakura ids
                    ensure = { ok: true, baseUrl: optionsWithHf.engineUrl || DEFAULT_ENGINE_URL };
                } else {
                    emit({ phase: 'error', ok: false, message: ensure.error || '引擎未就绪', pct: 0 });
                    return ensure;
                }
            }
            let baseUrl = ensure.baseUrl;

            if (kind === 'demucs') {
                emit({ phase: 'progress', message: '正在安装 Demucs + CUDA PyTorch（若有 GPU）…', pct: 8 });
                const res = await ensureAudioSeparateRuntimeStream(baseUrl, {
                    force: !!payload.force,
                    preferredPipMirror: preferredPipMirror || undefined,
                }, {
                    timeoutMs: 3600000,
                    signal,
                    onEvent: (ev) => {
                        const pct = Number(ev.percent);
                        emit({
                            phase: ev.type === 'done' ? 'done' : (ev.type === 'error' ? 'error' : 'progress'),
                            ok: ev.type === 'error' ? false : undefined,
                            message: ev.detail || ev.message || ev.hint || ev.stage || '处理中…',
                            pct: Number.isFinite(pct) ? pct : undefined,
                            raw: ev,
                        });
                    },
                });
                if (res.cancelled || signal.aborted) {
                    emit({ phase: 'cancelled', ok: false, message: '已取消', pct: 0 });
                    return { ok: false, cancelled: true, error: 'cancelled' };
                }
                if (!res.ok) {
                    const err = res.error || res.data?.message || 'Demucs 安装失败';
                    emit({ phase: 'error', ok: false, message: err, pct: 0 });
                    return { ok: false, error: err, raw: res.data };
                }
                const deferredTorch = !!(
                    res.data?.restartRequired
                    || res.data?.deferred
                    || res.data?.code === 'TORCH_CUDA_DEFERRED'
                    || res.data?.torchCuda?.code === 'TORCH_CUDA_DEFERRED'
                );
                emit({
                    phase: 'progress',
                    message: deferredTorch
                        ? 'CUDA PyTorch 将冷安装，正在重启引擎…'
                        : '正在重启引擎…',
                    pct: 92,
                });
                if (getEngineProc()) {
                    stopEngineProcess();
                    await sleep(800);
                }
                const ensure2 = await ensureEngineRunning({ ...optionsWithHf, forceRestart: true });
                if (!ensure2.ok) {
                    const msg = (res.data?.message || 'Demucs 已安装') + '（引擎重启失败，请手动检测引擎）';
                    emit({ phase: 'done', ok: true, message: msg, pct: 100 });
                    return { ok: true, restarted: false, message: msg, ...(res.data || {}) };
                }
                const statusRes = await getAudioSeparateRuntime(ensure2.baseUrl, { timeoutMs: 20000 });
                const message = statusRes.data?.hint || res.data?.message || 'Demucs 已就绪';
                emit({ phase: 'done', ok: true, message, pct: 100 });
                return {
                    ok: true,
                    restarted: true,
                    probe: statusRes.data || res.data?.probe,
                    message,
                    ...(res.data || {}),
                };
            }

            if (kind === 'gpu') {
                emit({ phase: 'progress', message: '检测 GPU 并安装 CUDA 12 运行库…', pct: 8 });
                const res = await ensureGpuRuntimeStream(baseUrl, {
                    force: !!payload.force,
                    preferredPipMirror: preferredPipMirror || undefined,
                }, {
                    timeoutMs: 1800000,
                    signal,
                    onEvent: (ev) => {
                        const pct = Number(ev.percent);
                        const downloadedBytes = Number(
                            ev.downloadedBytes ?? ev.received ?? ev.downloaded,
                        );
                        const totalBytes = Number(ev.totalBytes ?? ev.totalSize);
                        const bytesPerSecond = Number(ev.bytesPerSecond ?? ev.speed);
                        emit({
                            phase: ev.type === 'done' ? 'done' : (ev.type === 'error' ? 'error' : 'progress'),
                            ok: ev.type === 'error' ? false : undefined,
                            message: ev.detail || ev.message || ev.hint || ev.stage || '处理中…',
                            pct: Number.isFinite(pct) ? pct : undefined,
                            downloadedBytes: Number.isFinite(downloadedBytes) && downloadedBytes >= 0
                                ? downloadedBytes
                                : undefined,
                            totalBytes: Number.isFinite(totalBytes) && totalBytes > 0 ? totalBytes : undefined,
                            bytesPerSecond: Number.isFinite(bytesPerSecond) && bytesPerSecond > 0
                                ? bytesPerSecond
                                : undefined,
                            suggestManual: !!ev.suggestManual,
                            raw: ev,
                        });
                    },
                });
                if (res.cancelled || signal.aborted) {
                    emit({ phase: 'cancelled', ok: false, message: '已取消', pct: 0 });
                    return { ok: false, cancelled: true, error: 'cancelled' };
                }
                if (!res.ok) {
                    const err = res.error || res.data?.message || 'GPU 支持安装失败';
                    emit({ phase: 'error', ok: false, message: err, pct: 0 });
                    return { ok: false, error: err, raw: res.data };
                }
                emit({ phase: 'progress', message: '正在重启引擎以加载运行库…', pct: 92 });
                if (getEngineProc()) {
                    stopEngineProcess();
                    await sleep(800);
                }
                const ensure2 = await ensureEngineRunning({ ...optionsWithHf, forceRestart: true });
                if (!ensure2.ok) {
                    const msg = (res.data?.message || 'GPU 支持已安装') + '（引擎重启失败，请手动检测引擎）';
                    emit({ phase: 'done', ok: true, message: msg, pct: 100 });
                    return { ok: true, restarted: false, message: msg, ...(res.data || {}) };
                }
                const statusRes = await getGpuRuntime(ensure2.baseUrl, { timeoutMs: 20000 });
                const message = statusRes.data?.hint || res.data?.message || 'GPU 支持已就绪';
                emit({ phase: 'done', ok: true, message, pct: 100 });
                return {
                    ok: true,
                    restarted: true,
                    probe: statusRes.data || res.data?.probe,
                    message,
                    ...(res.data || {}),
                };
            }

            // models — optionally install GPU runtime first when missing
            try {
                const gpuStatus = await getGpuRuntime(baseUrl, { timeoutMs: 15000 });
                const st = gpuStatus.data?.status;
                if (gpuStatus.ok && (st === 'need_install' || st === 'partial')) {
                    if (payload.skipGpuPrestep) {
                        emit({
                            phase: 'progress',
                            message: '已跳过自动安装 GPU 支持（可稍后单独修复）',
                            pct: 36,
                        });
                    } else {
                        emit({
                            phase: 'progress',
                            message: gpuStatus.data?.hint || '检测到 GPU，先安装 CUDA 运行库…',
                            pct: 4,
                        });
                        const gpuRes = await ensureGpuRuntimeStream(baseUrl, {
                            force: false,
                            preferredPipMirror: preferredPipMirror || undefined,
                        }, {
                            timeoutMs: 1800000,
                            signal,
                            onEvent: (ev) => {
                                const pct = Number(ev.percent);
                                const mapped = Number.isFinite(pct) ? Math.min(35, Math.round(pct * 0.35)) : undefined;
                                const downloadedBytes = Number(
                                    ev.downloadedBytes ?? ev.received ?? ev.downloaded,
                                );
                                const totalBytes = Number(ev.totalBytes ?? ev.totalSize);
                                const bytesPerSecond = Number(ev.bytesPerSecond ?? ev.speed);
                                emit({
                                    phase: 'progress',
                                    message: `GPU：${ev.detail || ev.message || ev.stage || '安装中…'}`,
                                    pct: mapped,
                                    downloadedBytes: Number.isFinite(downloadedBytes) && downloadedBytes >= 0
                                        ? downloadedBytes
                                        : undefined,
                                    totalBytes: Number.isFinite(totalBytes) && totalBytes > 0 ? totalBytes : undefined,
                                    bytesPerSecond: Number.isFinite(bytesPerSecond) && bytesPerSecond > 0
                                        ? bytesPerSecond
                                        : undefined,
                                    suggestManual: !!ev.suggestManual,
                                    raw: ev,
                                });
                            },
                        });
                        if (gpuRes.cancelled || signal.aborted) {
                            emit({ phase: 'cancelled', ok: false, message: '已取消', pct: 0 });
                            return { ok: false, cancelled: true, error: 'cancelled' };
                        }
                        if (!gpuRes.ok) {
                            emit({
                                phase: 'progress',
                                message: `GPU 预装未完成（${gpuRes.error || gpuRes.data?.message || '继续下载模型'}），先继续模型/运行库…`,
                                pct: 36,
                            });
                        } else {
                            if (getEngineProc()) {
                                stopEngineProcess();
                                await sleep(600);
                            }
                            const ensureAfterGpu = await ensureEngineRunning({ ...optionsWithHf, forceRestart: true });
                            if (!ensureAfterGpu.ok) {
                                // Do not abort models/runtime download — one-click fix can continue
                                // and a later round / ensure-gpu step can recover.
                                emit({
                                    phase: 'progress',
                                    message: 'GPU 安装后引擎重启失败，仍继续下载模型/运行库…',
                                    pct: 36,
                                });
                            } else {
                                ensure = ensureAfterGpu;
                                baseUrl = ensureAfterGpu.baseUrl || baseUrl;
                                emit({ phase: 'progress', message: 'GPU 支持已处理，开始下载模型…', pct: 38 });
                            }
                        }
                    }
                }
            } catch { /* ignore optional GPU pre-step */ }

            // models — only selected IDs (do not merge profile when explicit list is sent)
            const sakuraCatalog = require('../src/js/sakura-mt-catalog-core');
            const allSelected = Array.isArray(payload.modelIds)
                ? payload.modelIds.map((id) => String(id || '').trim()).filter(Boolean)
                : [];
            const sakuraIds = allSelected.filter((id) => sakuraCatalog.isSakuraMtModel(id));
            const engineIds = allSelected.filter((id) => !sakuraCatalog.isSakuraMtModel(id));
            const useExplicitSelection = allSelected.length > 0;
            const profile = useExplicitSelection
                ? undefined
                : (payload.profile || options.engineProfile || 'balanced');

            if (!useExplicitSelection && !profile) {
                emit({ phase: 'error', ok: false, message: '未选择要下载的模型', pct: 0 });
                return { ok: false, error: '未选择要下载的模型' };
            }

            const doneIds = [];
            if (engineIds.length || profile) {
                emit({
                    phase: 'progress',
                    message: useExplicitSelection
                        ? `开始下载引擎模型（${engineIds.join(', ')}）…`
                        : `开始下载模型（档位 ${profile}）…`,
                    pct: 40,
                });
                const res = await downloadModelsStream(baseUrl, {
                    profile: profile || undefined,
                    modelIds: engineIds.length ? engineIds : undefined,
                    hfEndpoint,
                    hfToken: hfToken || undefined,
                    force: !!payload.force,
                }, {
                    timeoutMs: 1800000,
                    signal,
                    onEvent: (ev) => {
                        const stage = String(ev.stage || '').toLowerCase();
                        let pct = Number(ev.percent);
                        const downloadedBytes = Number(
                            ev.downloadedBytes ?? ev.received ?? ev.downloaded,
                        );
                        // Do not fall back to ev.total — engine SSE uses `total` for model count.
                        const totalBytes = Number(ev.totalBytes ?? ev.totalSize);
                        const bytesPerSecond = Number(ev.bytesPerSecond ?? ev.speed);
                        // Pip extras often omit percent; synthesize from byte counters.
                        if (!Number.isFinite(pct)
                            && Number.isFinite(downloadedBytes) && downloadedBytes >= 0
                            && Number.isFinite(totalBytes) && totalBytes > 0) {
                            pct = Math.max(0, Math.min(99, Math.round((downloadedBytes / totalBytes) * 100)));
                        }
                        let mapped;
                        if (Number.isFinite(pct)) {
                            if (stage === 'pip') {
                                // Reserve 40–58% for dependency wheels (torch etc.).
                                mapped = Math.min(58, 40 + Math.round(pct * 0.18));
                            } else {
                                mapped = Math.min(85, 58 + Math.round(pct * 0.27));
                            }
                        }
                        const detail = ev.detail || ev.message || '';
                        const rawModelId = ev.modelId != null ? String(ev.modelId).trim() : '';
                        const modelIdSuffix = rawModelId ? ` [${rawModelId}]` : '';
                        emit({
                            phase: ev.type === 'done' ? 'progress' : (ev.type === 'error' ? 'error' : 'progress'),
                            ok: ev.type === 'error' ? false : undefined,
                            message: `${detail}${modelIdSuffix}`.trim() || '下载中…',
                            pct: mapped,
                            // Keep raw catalog id so UI rows match (do not wrap in brackets).
                            modelId: rawModelId || undefined,
                            stage: stage || undefined,
                            index: Number.isFinite(Number(ev.index)) ? Number(ev.index) : undefined,
                            downloadedBytes: Number.isFinite(downloadedBytes) && downloadedBytes >= 0
                                ? downloadedBytes
                                : undefined,
                            totalBytes: Number.isFinite(totalBytes) && totalBytes > 0 ? totalBytes : undefined,
                            bytesPerSecond: Number.isFinite(bytesPerSecond) && bytesPerSecond > 0
                                ? bytesPerSecond
                                : undefined,
                            suggestManual: !!ev.suggestManual,
                            raw: ev,
                        });
                    },
                });
                if (res.cancelled || signal.aborted) {
                    emit({ phase: 'cancelled', ok: false, message: '已取消', pct: 0 });
                    return { ok: false, cancelled: true, error: 'cancelled' };
                }
                if (!res.ok) {
                    const rawMsg = res.error || res.data?.message || res.data?.error || '模型下载失败';
                    const hint = /connecttimeout|10060|timed out|internet connection|connection reset|10054/i.test(String(rawMsg))
                        && !hfEndpoint
                        ? '（可在设置中填写 Hugging Face 镜像 https://hf-mirror.com 后重试）'
                        : /gated|authorized list|门禁/i.test(String(rawMsg)) && !hfToken
                            ? '（请在设置 → 网络填写 Hugging Face Token，并在官网同意模型条款后重试）'
                            : '';
                    const err = `${rawMsg}${hint}`;
                    emit({ phase: 'error', ok: false, message: err, pct: 0 });
                    return { ok: false, error: err, raw: res.data };
                }
                const results = Array.isArray(res.data?.results) ? res.data.results : [];
                doneIds.push(...results.filter((r) => r?.ok).map((r) => r.id).filter(Boolean));
            }

            if (sakuraIds.length) {
                const sakuraMt = require('./sakura-mt');
                for (let i = 0; i < sakuraIds.length; i += 1) {
                    if (signal.aborted) {
                        emit({ phase: 'cancelled', ok: false, message: '已取消', pct: 0 });
                        return { ok: false, cancelled: true, error: 'cancelled' };
                    }
                    const sid = sakuraIds[i];
                    const entryName = sakuraCatalog.findCatalogEntry?.(sid)?.name || sid;
                    const basePct = 85 + Math.round((i / Math.max(1, sakuraIds.length)) * 14);
                    emit({
                        phase: 'progress',
                        message: `下载推理翻译「${entryName}」${i + 1}/${sakuraIds.length}…`,
                        pct: basePct,
                        modelId: sid,
                    });
                    const pull = await sakuraMt.pullSakuraModel({
                        modelId: sid,
                        force: !!payload.force,
                        signal,
                        onProgress: (p) => {
                            const pct = Number(p?.pct ?? p?.percent);
                            const downloadedBytes = Number(
                                p?.downloadedBytes ?? p?.received ?? p?.downloaded,
                            );
                            const totalBytes = Number(p?.totalBytes ?? p?.total);
                            const bytesPerSecond = Number(p?.bytesPerSecond ?? p?.speed);
                            emit({
                                phase: p?.phase === 'done' ? 'progress' : (p?.phase || 'progress'),
                                message: p?.message || `推理翻译 ${entryName}`,
                                pct: Number.isFinite(pct)
                                    ? Math.min(99, basePct + Math.round(pct * 0.14 / sakuraIds.length))
                                    : undefined,
                                downloadedBytes: Number.isFinite(downloadedBytes) && downloadedBytes >= 0
                                    ? downloadedBytes
                                    : undefined,
                                totalBytes: Number.isFinite(totalBytes) && totalBytes > 0 ? totalBytes : undefined,
                                bytesPerSecond: Number.isFinite(bytesPerSecond) && bytesPerSecond > 0
                                    ? bytesPerSecond
                                    : undefined,
                            });
                        },
                    });
                    if (!pull?.ok) {
                        const err = pull?.error || `推理翻译「${entryName}」下载失败`;
                        emit({ phase: 'error', ok: false, message: err, pct: 0 });
                        return { ok: false, error: err };
                    }
                    doneIds.push(sid);
                }
            }

            const message = `模型下载完成${doneIds.length ? `：${doneIds.join(', ')}` : ''}`;
            emit({ phase: 'done', ok: true, message, pct: 100 });
            return { ok: true, message, results: doneIds.map((id) => ({ id, ok: true })) };
        } catch (err) {
            const msg = err.message || String(err);
            emit({ phase: 'error', ok: false, message: msg, pct: 0 });
            return { ok: false, error: msg };
        } finally {
            setDownloadBusy(false);
            setDownloadAbort(null);
        }
    }

    return { runEngineDownload };
}

module.exports = {
    createEngineDownloadJob,
    REQUIRED_HOST_KEYS,
};
