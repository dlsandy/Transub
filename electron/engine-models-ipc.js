/**
 * Engine model validate/list/delete/recommend/detect/translate-cues IPC.
 * Extracted from engine-bridge setupEngineBridge (thin shell).
 */

/**
 * @param {(channel: string, handler: Function) => void} register
 * @param {object} host
 * @param {object} host.s mutable engine session (engineProc, batchRunning, …)
 * @param {object} host.h pure helpers / deps from engine-bridge
 */
function registerEngineModelsIpc(register, host = {}) {
    if (typeof register !== 'function') {
        throw new Error('registerEngineModelsIpc: register required');
    }
    const s = host.s;
    const h = host.h;
    if (!s || !h) throw new Error('registerEngineModelsIpc: host.s and host.h required');

    const {
        readMergedOptions,
        ensureEngineRunning,
        getCapabilities,
        listModels,
        omitRetiredEngineModels,
        deleteModels,
        recommendModels,
        detectLanguage,
        translateCuesWithEngineOpus,
        sleep,
        stopEngineProcess,
        stopEngineProcessAndPort,
    } = h;

    register('transub-engine-validate', async (_event, payload = {}) => {
        try {
            const options = await readMergedOptions(payload);
            const ensure = await ensureEngineRunning(options);
            if (!ensure.ok) return ensure;
            const caps = await getCapabilities(ensure.baseUrl);
            return {
                ok: true,
                baseUrl: ensure.baseUrl,
                health: ensure.health,
                capabilities: caps.data || null,
                spawned: !!ensure.spawned,
                version: ensure.health?.engineVersion || '',
            };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });
    
    register('transub-engine-list-models', async (_event, payload = {}) => {
        try {
            const sakuraMt = require('./sakura-mt');
            const sakuraModels = sakuraMt.listSakuraModelsForEngine();
            const options = await readMergedOptions(payload);
            const ensure = await ensureEngineRunning(options);
            if (!ensure.ok) {
                return {
                    ...ensure,
                    // Still expose free Sakura so MT dropdown works offline from engine.
                    models: sakuraModels,
                };
            }
            const res = await listModels(ensure.baseUrl);
            if (!res.ok) {
                return {
                    ok: false,
                    error: res.data?.message || res.data?.error || `列出模型失败 (HTTP ${res.status})`,
                    status: res.status,
                    raw: res.data,
                    models: sakuraModels,
                };
            }
            return {
                ok: true,
                models: omitRetiredEngineModels([
                    ...(Array.isArray(res.data?.models) ? res.data.models : []),
                    ...sakuraModels,
                ]),
                profiles: res.data?.profiles || {},
                raw: res.data,
            };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });
    
    register('transub-engine-delete-models', async (_event, payload = {}) => {
        try {
            if (s.batchRunning) {
                return { ok: false, error: '字幕任务进行中，请先停止任务再删除模型' };
            }
            if (s.downloadBusy) {
                return { ok: false, error: '已有下载任务正在进行，请稍后再删除' };
            }
            const engineDelete = require('./engine-delete-model');
            const modelIds = engineDelete.uniqueIds(
                Array.isArray(payload.modelIds) ? payload.modelIds : [],
            );
            if (!modelIds.length) {
                return { ok: false, error: '未指定要删除的模型' };
            }
    
            const options = await readMergedOptions(payload);
            const rowsById = {};
            try {
                const ensureList = await ensureEngineRunning(options);
                if (ensureList.ok) {
                    const listRes = await listModels(ensureList.baseUrl, { timeoutMs: 15000 });
                    if (listRes.ok && Array.isArray(listRes.data?.models)) {
                        for (const m of listRes.data.models) {
                            const id = String(m?.id || '').trim();
                            if (id) rowsById[id] = m;
                        }
                    }
                }
            } catch (_) { /* list optional */ }
    
            try {
                stopEngineProcessAndPort();
            } catch {
                try { stopEngineProcess(); } catch { /* ignore */ }
            }
            await sleep(800);
    
            const deleteViaEngine = async (engineIds) => {
                const ensure = await ensureEngineRunning(options);
                if (!ensure.ok) return { ok: false, error: ensure.error || 'engine unavailable' };
                const res = await deleteModels(ensure.baseUrl, { modelIds: engineIds }, {
                    timeoutMs: 120000,
                });
                if (!res.ok) {
                    return {
                        ok: false,
                        error: res.data?.message || res.data?.error || `删除失败 (HTTP ${res.status})`,
                        failed: engineIds.map((id) => ({
                            id,
                            error: res.data?.message || res.data?.error || 'delete failed',
                        })),
                    };
                }
                return {
                    ok: true,
                    deleted: res.data?.deleted || [],
                    skipped: res.data?.skipped || [],
                    failed: res.data?.failed || [],
                };
            };
    
            return await engineDelete.deleteModelsBatch(modelIds, options, {
                rowsById,
                deleteViaEngine,
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });
    
    register('transub-engine-recommend', async (_event, payload = {}) => {
        try {
            const options = await readMergedOptions(payload);
            const ensure = await ensureEngineRunning(options);
            if (!ensure.ok) return ensure;
            const res = await recommendModels(ensure.baseUrl, payload.body || payload || {});
            if (!res.ok) {
                return {
                    ok: false,
                    error: res.data?.message || res.data?.error || `推荐失败 (HTTP ${res.status})`,
                    status: res.status,
                };
            }
            return { ok: true, ...(res.data || {}) };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });
    
    register('transub-engine-detect-language', async (_event, payload = {}) => {
        try {
            if (s.batchRunning) {
                return { ok: false, error: '字幕任务运行中，暂不探测语种' };
            }
            const options = await readMergedOptions(payload.options || payload || {});
            const mediaPath = String(payload.mediaPath || payload.path || '').trim();
            if (!mediaPath) return { ok: false, error: '未指定媒体路径' };
            const ensure = await ensureEngineRunning(options);
            if (!ensure.ok) return ensure;
            const res = await detectLanguage(ensure.baseUrl, {
                mediaPath,
                asrModel: payload.asrModel || options.engineAsrModel || undefined,
                device: payload.device || options.device || 'auto',
                durationSec: Math.max(3, Math.min(30, Number(payload.durationSec) || 12)),
                startSec: Math.max(0, Math.min(3600, Number(payload.startSec) || 0)),
            }, { timeoutMs: 600000 });
            if (!res.ok) {
                return {
                    ok: false,
                    error: res.data?.message || res.data?.error || `语种探测失败 (HTTP ${res.status})`,
                    status: res.status,
                    code: res.data?.code,
                };
            }
            return { ok: true, ...(res.data || {}) };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });
    
    register('transub-engine-translate-cues', async (event, payload = {}) => {
        try {
            return await translateCuesWithEngineOpus(payload || {}, {
                onProgress: (progress) => {
                    try {
                        if (!event?.sender?.isDestroyed?.()) {
                            event.sender.send('transub-engine-translate-progress', progress);
                        }
                    } catch (_) { /* ignore */ }
                },
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });
    
}

module.exports = { registerEngineModelsIpc };
