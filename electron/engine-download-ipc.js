/**
 * Engine download job + folder/url tooling IPC (before batch generate).
 * Extracted from engine-bridge setupEngineBridge (thin shell).
 */

/**
 * @param {(channel: string, handler: Function) => void} register
 * @param {object} host
 * @param {object} host.s mutable engine session (engineProc, batchRunning, …)
 * @param {object} host.h pure helpers / deps from engine-bridge
 */
function registerEngineDownloadIpc(register, host = {}) {
    if (typeof register !== 'function') {
        throw new Error('registerEngineDownloadIpc: register required');
    }
    const s = host.s;
    const h = host.h;
    if (!s || !h) throw new Error('registerEngineDownloadIpc: host.s and host.h required');

    const {
        stopEngineProcessAndPort,
        broadcastEngineDownloadProgress,
        getEngineDownloadJob,
    } = h;

    register('transub-engine-open-download', async (_event, payload = {}) => {
        // 下载管理窗口已移除；调用方应直接使用 transub-engine-run-download
        return { ok: true, removed: true, kind: String(payload?.kind || 'models') };
    });
    
    register('transub-engine-cancel-download', async () => {
        try {
            if (s.downloadAbort) {
                try { s.downloadAbort.abort(); } catch { /* ignore */ }
            }
            // Never kill a running subtitle batch — only the download and its engine.
            // Kill the listen port too: aborting the SSE client does not stop an
            // in-process model download if we no longer hold s.engineProc.
            if (!s.batchRunning) {
                try { stopEngineProcessAndPort(); } catch { /* ignore */ }
            }
            broadcastEngineDownloadProgress({
                phase: 'cancelled',
                ok: false,
                message: s.batchRunning
                    ? '已取消下载（字幕任务仍在运行）'
                    : '已取消下载',
                pct: 0,
            });
            return { ok: true, cancelled: true };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });
    
    register('transub-engine-run-download', async (_event, payload = {}) => {
        return getEngineDownloadJob().runEngineDownload(payload, _event);
    });
    
}

module.exports = { registerEngineDownloadIpc };
