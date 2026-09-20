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
    // AMD / ROCm PyTorch still uses the torch.cuda device API — map amd → cuda.
    if (
        d === 'cuda'
        || d === 'cuda_low_vram'
        || d === 'cuda_batch'
        || d === 'gpu'
        || d === 'amd'
        || d === 'rocm'
    ) {
        return 'cuda';
    }
    return 'auto';
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, Math.max(0, Number(ms) || 0)));
}

/**
 * Prefer structured network errors over opaque "HTTP 0" (status 0 = no response).
 * @param {{ status?: number, error?: string, data?: { message?: string, error?: string } } | null | undefined} res
 * @returns {string}
 */
function formatHealthProbeError(res) {
    if (!res) return '引擎未响应';
    const fromData = res.data?.message || res.data?.error;
    if (fromData) return String(fromData);
    if (res.error) return String(res.error);
    const status = Number(res.status);
    if (Number.isFinite(status) && status > 0) return `HTTP ${status}`;
    return '引擎未响应';
}

/**
 * Poll engine /v1/health until ok, cancelled, child exit, or timeout.
 * @param {string} baseUrl
 * @param {{
 *   timeoutMs?: number,
 *   intervalMs?: number,
 *   shouldStop?: () => boolean,
 *   getHealth: (url: string, opts?: object) => Promise<{ ok: boolean, status?: number, data?: object, error?: string }>,
 *   isChildAlive?: () => boolean,
 *   getChildExitCode?: () => number | null | undefined,
 * }} opts
 */
async function waitForHealth(baseUrl, {
    timeoutMs = 30000,
    intervalMs = 400,
    shouldStop = null,
    getHealth,
    isChildAlive = null,
    getChildExitCode = null,
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
        // Spawned child died before bind — fail fast instead of polling until timeout
        // and surfacing a misleading "HTTP 0".
        if (typeof isChildAlive === 'function' && !isChildAlive()) {
            const code = typeof getChildExitCode === 'function' ? getChildExitCode() : null;
            const exitPart = code == null ? '' : `（退出码 ${code}）`;
            return {
                ok: false,
                error: lastErr
                    ? `引擎进程已退出${exitPart}：${lastErr}`
                    : `引擎进程在就绪前退出${exitPart}`,
                exitCode: code == null ? undefined : code,
            };
        }
        try {
            const res = await getHealth(baseUrl, { timeoutMs: 2000 });
            if (res.ok && res.data?.ok) return res;
            lastErr = formatHealthProbeError(res);
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
    formatHealthProbeError,
    waitForHealth,
};
