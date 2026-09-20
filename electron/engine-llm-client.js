/**
 * Engine-owned llama-server client (/v1/llm*).
 * Desktop still resolves catalog / spawn args; process lifecycle lives in the engine.
 */
const { spawnSync } = require('child_process');
const { engineFetch, getCapabilities, joinUrl } = require('./engine-client');

const LLM_FEATURE = 'llmServer';

/**
 * @param {string} baseUrl
 * @returns {Promise<boolean>}
 */
async function engineSupportsLlmServer(baseUrl) {
    const url = String(baseUrl || '').trim();
    if (!url) return false;
    try {
        const caps = await getCapabilities(url, { timeoutMs: 4000 });
        if (!caps?.ok) return false;
        const features = caps.data?.features || caps.features || {};
        return features[LLM_FEATURE] === true;
    } catch {
        return false;
    }
}

/**
 * @param {string} baseUrl
 * @param {object} [options]
 */
async function getLlmHealth(baseUrl, options = {}) {
    return engineFetch(baseUrl, '/v1/llm/health', {
        method: 'GET',
        timeoutMs: options.timeoutMs || 5000,
        signal: options.signal,
    });
}

/**
 * @param {string} baseUrl
 * @param {object} body
 * @param {object} [options]
 */
async function ensureLlm(baseUrl, body, options = {}) {
    return engineFetch(baseUrl, '/v1/llm/ensure', {
        method: 'POST',
        body: body && typeof body === 'object' ? body : {},
        timeoutMs: options.timeoutMs || 300000,
        signal: options.signal,
    });
}

/**
 * @param {string} baseUrl
 * @param {object} [options]
 */
async function stopLlm(baseUrl, options = {}) {
    const q = options.reason ? `?reason=${encodeURIComponent(String(options.reason))}` : '';
    return engineFetch(baseUrl, `/v1/llm${q}`, {
        method: 'DELETE',
        timeoutMs: options.timeoutMs || 20000,
        signal: options.signal,
    });
}

/**
 * @param {string} baseUrl
 * @param {{ delayMs?: number, cancel?: boolean }} [body]
 * @param {object} [options]
 */
async function scheduleLlmIdleStop(baseUrl, body = {}, options = {}) {
    return engineFetch(baseUrl, '/v1/llm/idle-stop', {
        method: 'POST',
        body: body && typeof body === 'object' ? body : {},
        timeoutMs: options.timeoutMs || 8000,
        signal: options.signal,
    });
}

/**
 * Synchronous DELETE for callers that cannot await (ASR handoff / app quit).
 * @param {string} baseUrl
 * @param {string} [reason]
 * @param {number} [timeoutMs]
 */
function stopLlmSync(baseUrl, reason = '', timeoutMs = 15000) {
    const root = String(baseUrl || '').replace(/\/+$/, '');
    if (!root) return { ok: false, error: 'no_engine_url' };
    const url = joinUrl(root, reason ? `/v1/llm?reason=${encodeURIComponent(reason)}` : '/v1/llm');
    const script = `
      const u = process.argv[1];
      fetch(u, { method: 'DELETE' })
        .then(async (r) => {
          const t = await r.text();
          process.stdout.write(t || '');
          process.exit(r.ok ? 0 : 1);
        })
        .catch((e) => {
          process.stderr.write(String(e && e.message ? e.message : e));
          process.exit(2);
        });
    `;
    try {
        const r = spawnSync(process.execPath, ['-e', script, url], {
            encoding: 'utf8',
            timeout: Math.max(3000, Number(timeoutMs) || 15000),
            windowsHide: true,
        });
        let data = null;
        try {
            data = r.stdout ? JSON.parse(r.stdout) : null;
        } catch {
            data = { raw: r.stdout || '' };
        }
        if (r.status === 0) {
            return { ok: true, data, via: 'engine-sync' };
        }
        return {
            ok: false,
            error: (data && (data.error || data.message)) || r.stderr || `exit ${r.status}`,
            data,
            via: 'engine-sync',
        };
    } catch (err) {
        return { ok: false, error: err?.message || String(err), via: 'engine-sync' };
    }
}

module.exports = {
    LLM_FEATURE,
    engineSupportsLlmServer,
    getLlmHealth,
    ensureLlm,
    stopLlm,
    scheduleLlmIdleStop,
    stopLlmSync,
};
