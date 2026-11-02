/**
 * Engine download-models + GPU/CUDA/Whisper/Demucs runtime IPC.
 * Extracted from engine-bridge setupEngineBridge (thin shell).
 */

/**
 * @param {(channel: string, handler: Function) => void} register
 * @param {object} host
 * @param {object} host.s mutable engine session (engineProc, batchRunning, …)
 * @param {object} host.h pure helpers / deps from engine-bridge
 */
function registerEngineRuntimeIpc(register, host = {}) {
    if (typeof register !== 'function') {
        throw new Error('registerEngineRuntimeIpc: register required');
    }
    const s = host.s;
    const h = host.h;
    if (!s || !h) throw new Error('registerEngineRuntimeIpc: host.s and host.h required');

    const {
        readMergedOptions,
        ensureEngineRunning,
        downloadModels,
        getGpuRuntime,
        scanSystemCuda,
        adoptSystemCuda,
        getAsrWhisperRuntime,
        getAudioSeparateRuntime,
        ensureGpuRuntime,
        sleep,
        stopEngineProcess,
        fs,
        path,
    } = h;

    register('transub-engine-download-models', async (_event, payload = {}) => {
        try {
            const options = await readMergedOptions(payload);
            const { resolveHfEndpointForDownload } = require('./engine-download-urls');
            const hfEndpoint = resolveHfEndpointForDownload(
                payload.hfEndpoint,
                options.engineHfEndpoint,
            );
            const hfToken = payload.hfToken != null && String(payload.hfToken).trim()
                ? String(payload.hfToken || '').trim()
                : String(options.engineHfToken || '').trim();
            const optionsWithHf = {
                ...options,
                engineHfEndpoint: hfEndpoint,
                engineHfToken: hfToken,
            };
            // Restart managed engine so HF_ENDPOINT is applied before Hub downloads.
            if (s.engineProc) {
                stopEngineProcess();
                await sleep(600);
            }
            const ensure = await ensureEngineRunning(optionsWithHf);
            if (!ensure.ok) return ensure;
            const modelIds = Array.isArray(payload.modelIds)
                ? payload.modelIds.map((id) => String(id || '').trim()).filter(Boolean)
                : undefined;
            const res = await downloadModels(ensure.baseUrl, {
                profile: payload.profile || options.engineProfile,
                modelIds,
                hfEndpoint,
                hfToken: hfToken || undefined,
                force: !!payload.force,
            }, { timeoutMs: 600000 });
            if (!res.ok) {
                const rawMsg = res.data?.message || res.data?.error || `模型下载失败 (HTTP ${res.status})`;
                const hint = /connecttimeout|10060|timed out|internet connection|connection reset|10054/i.test(String(rawMsg))
                    && !hfEndpoint
                    ? '（可在设置中填写 Hugging Face 镜像 https://hf-mirror.com 后重试）'
                    : /gated|authorized list|门禁/i.test(String(rawMsg)) && !hfToken
                        ? '（请在设置 → 网络填写 Hugging Face Token，并在官网同意模型条款后重试）'
                        : '';
                return {
                    ok: false,
                    error: `${rawMsg}${hint}`,
                    code: res.data?.code || '',
                    status: res.status,
                    raw: res.data,
                };
            }
            return { ok: true, ...(res.data || {}), status: res.status };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });
    
    register('transub-engine-gpu-status', async (_event, payload = {}) => {
        try {
            const options = await readMergedOptions(payload);
            const ensure = await ensureEngineRunning(options);
            if (!ensure.ok) return ensure;
            const res = await getGpuRuntime(ensure.baseUrl, { timeoutMs: 20000 });
            if (!res.ok) {
                return {
                    ok: false,
                    error: res.data?.message || res.data?.error || `GPU 状态查询失败 (HTTP ${res.status})`,
                    status: res.status,
                    raw: res.data,
                };
            }
            // Keep probe `status` (ready/partial/…); HTTP code goes to httpStatus.
            return { ok: true, ...(res.data || {}), httpStatus: res.status };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });
    
    register('transub-engine-scan-cuda', async (_event, payload = {}) => {
        try {
            const options = await readMergedOptions(payload);
            const ensure = await ensureEngineRunning(options);
            if (!ensure.ok) return ensure;
            const major = Number(payload?.major) || 12;
            const res = await scanSystemCuda(ensure.baseUrl, { major, timeoutMs: 45000 });
            if (!res.ok) {
                return {
                    ok: false,
                    error: res.data?.message || res.data?.error || `扫描失败 (HTTP ${res.status})`,
                    status: res.status,
                    raw: res.data,
                };
            }
            return { ok: true, ...(res.data || {}), status: res.status };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });
    
    register('transub-engine-adopt-cuda', async (_event, payload = {}) => {
        try {
            const options = await readMergedOptions(payload);
            const ensure = await ensureEngineRunning(options);
            if (!ensure.ok) return ensure;
            const major = Number(payload?.major) || 12;
            const res = await adoptSystemCuda(ensure.baseUrl, { major, timeoutMs: 180000 });
            if (!res.ok) {
                return {
                    ok: false,
                    error: res.data?.message || res.data?.error || `复用失败 (HTTP ${res.status})`,
                    status: res.status,
                    raw: res.data,
                };
            }
            // Restart so PATH / LoadLibrary picks up adopted bins.
            if (s.engineProc) {
                stopEngineProcess();
                await sleep(600);
                await ensureEngineRunning({ ...options, forceRestart: true });
            }
            return { ok: true, ...(res.data || {}), status: res.status };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });
    
    register('transub-engine-pick-cuda-root', async (event) => {
        try {
            const { dialog, BrowserWindow } = require('electron');
            const cudaScan = require('./cuda-runtime-scan');
            const { getWritableRoot } = require('./app-paths');
            const win = BrowserWindow.fromWebContents(event.sender);
            const picked = await dialog.showOpenDialog(win || undefined, {
                title: '选择含 CUDA 运行库的目录',
                message: '请选择含 cudart64_*.dll / cublas64_*.dll 的目录，或含 nvidia\\cuda_runtime\\bin 的 site-packages',
                properties: ['openDirectory'],
            });
            if (picked.canceled || !picked.filePaths?.length) {
                return { ok: false, cancelled: true };
            }
            const dir = path.resolve(String(picked.filePaths[0] || '').trim());
            if (!dir || !fs.existsSync(dir)) {
                return { ok: false, error: '目录无效' };
            }
            // Accept flat companion dir, nvidia tree, or site-packages parent.
            const candidates = [
                dir,
                path.join(dir, 'bin'),
                path.join(dir, 'nvidia'),
                path.basename(dir).toLowerCase() === 'nvidia' ? path.dirname(dir) : '',
                path.join(dir, 'Lib', 'site-packages'),
                path.join(dir, 'lib', 'site-packages'),
                path.join(dir, 'site-packages'),
            ].filter(Boolean);
            let savedRoot = dir;
            let scanHit = false;
            for (const major of [12, 13]) {
                for (const root of candidates) {
                    const scan = cudaScan.scanReusableCudaRuntimes({
                        major,
                        extraRoots: [root],
                        includePath: false,
                        env: { PATH: '' },
                    });
                    if (scan.ok && scan.best) {
                        savedRoot = root;
                        scanHit = true;
                        break;
                    }
                }
                if (scanHit) break;
            }
            const writable = getWritableRoot();
            const saved = cudaScan.addPersistedCudaExtraRoot(writable, savedRoot);
            if (!saved.ok) {
                return { ok: false, error: saved.error || '保存扫描目录失败' };
            }
            return {
                ok: true,
                dir: savedRoot,
                verified: scanHit,
                roots: saved.roots,
                message: scanHit
                    ? `已加入 CUDA 扫描目录：${savedRoot}`
                    : `已记录目录 ${savedRoot}（当前未检出齐全 companion DLL，仍会参与下次扫描）`,
            };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });
    
    register('transub-engine-asr-whisper-status', async (_event, payload = {}) => {
        try {
            const options = await readMergedOptions(payload);
            const ensure = await ensureEngineRunning(options);
            if (!ensure.ok) return ensure;
            const res = await getAsrWhisperRuntime(ensure.baseUrl, { timeoutMs: 20000 });
            if (!res.ok) {
                return {
                    ok: false,
                    error: res.data?.message || res.data?.error
                        || `Whisper 运行库查询失败 (HTTP ${res.status})`,
                    status: res.status,
                    raw: res.data,
                };
            }
            // Keep probe `status` (ready/need_install/…); HTTP code goes to httpStatus.
            return { ok: true, ...(res.data || {}), httpStatus: res.status };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });
    
    register('transub-engine-audio-separate-status', async (_event, payload = {}) => {
        try {
            const options = await readMergedOptions(payload);
            const ensure = await ensureEngineRunning(options);
            if (!ensure.ok) return ensure;
            const res = await getAudioSeparateRuntime(ensure.baseUrl, { timeoutMs: 20000 });
            if (!res.ok) {
                return {
                    ok: false,
                    error: res.data?.message || res.data?.error
                        || `Demucs 状态查询失败 (HTTP ${res.status})`,
                    status: res.status,
                    raw: res.data,
                };
            }
            // Keep probe `status` (ready/need_torch_cuda/…); HTTP code goes to httpStatus.
            // Overwriting with res.status (e.g. 200) made model library always show「下载」.
            return { ok: true, ...(res.data || {}), httpStatus: res.status };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });
    
    register('transub-engine-ensure-gpu', async (_event, payload = {}) => {
        try {
            const options = await readMergedOptions(payload);
            // Restart so pip-installed nvidia/* wheels are visible to a fresh process PATH.
            if (s.engineProc) {
                stopEngineProcess();
                await sleep(600);
            }
            const ensure = await ensureEngineRunning(options);
            if (!ensure.ok) return ensure;
            const res = await ensureGpuRuntime(ensure.baseUrl, {
                force: !!payload.force,
            }, { timeoutMs: 1800000 });
            if (!res.ok) {
                return {
                    ok: false,
                    error: res.data?.message || res.data?.error || `GPU 支持安装失败 (HTTP ${res.status})`,
                    code: res.data?.code || '',
                    status: res.status,
                    raw: res.data,
                };
            }
            // Restart again after install so newly added DLLs bind cleanly.
            if (s.engineProc) {
                stopEngineProcess();
                await sleep(800);
            }
            const ensure2 = await ensureEngineRunning({ ...options, forceRestart: true });
            if (!ensure2.ok) {
                return {
                    ok: true,
                    ...(res.data || {}),
                    restarted: false,
                    restartError: ensure2.error,
                    message: (res.data?.message || 'GPU 支持已安装') + '（引擎重启失败，请手动检测引擎）',
                };
            }
            const statusRes = await getGpuRuntime(ensure2.baseUrl, { timeoutMs: 20000 });
            return {
                ok: true,
                ...(res.data || {}),
                restarted: true,
                probe: statusRes.data || res.data?.probe,
                message: statusRes.data?.hint || res.data?.message || 'GPU 支持已就绪',
            };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });
    
}

module.exports = { registerEngineRuntimeIpc };
