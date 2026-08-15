/**
 * Engine spawn / URL / device helpers (pure or near-pure).
 */

function parseHostPort(url) {
    try {
        const u = new URL(url);
        return {
            host: u.hostname || '127.0.0.1',
            port: Number(u.port) || 8765,
        };
    } catch {
        return { host: '127.0.0.1', port: 8765 };
    }
}

function mapDeviceForEngine(device) {
    const d = String(device || '').trim().toLowerCase();
    if (d === 'cpu') return 'cpu';
    // Pass cuda explicitly so Demucs / ASR do not silently treat preference as vague "auto".
    if (d === 'cuda' || d === 'cuda_low_vram' || d === 'cuda_batch' || d === 'gpu') return 'cuda';
    return 'auto';
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, Math.max(0, Number(ms) || 0)));
}

/**
 * Poll engine /v1/health until ok, cancelled, or timeout.
 * @param {string} baseUrl
 * @param {{
 *   timeoutMs?: number,
 *   intervalMs?: number,
 *   shouldStop?: () => boolean,
 *   getHealth: (url: string, opts?: object) => Promise<{ ok: boolean, status?: number, data?: object }>,
 * }} opts
 */
async function waitForHealth(baseUrl, {
    timeoutMs = 30000,
    intervalMs = 400,
    shouldStop = null,
    getHealth,
} = {}) {
    if (typeof getHealth !== 'function') {
        throw new Error('waitForHealth requires getHealth');
    }
    const started = Date.now();
    let lastErr = '';
    while (Date.now() - started < timeoutMs) {
        if (typeof shouldStop === 'function' && shouldStop()) {
            return { ok: false, error: '已取消', cancelled: true };
        }
        try {
            const res = await getHealth(baseUrl, { timeoutMs: 2000 });
            if (res.ok && res.data?.ok) return res;
            lastErr = res.data?.message || `HTTP ${res.status}`;
        } catch (err) {
            lastErr = err.message || String(err);
        }
        await sleep(intervalMs);
    }
    return { ok: false, error: lastErr || '引擎健康检查超时' };
}

module.exports = {
    parseHostPort,
    mapDeviceForEngine,
    sleep,
    waitForHealth,
};
