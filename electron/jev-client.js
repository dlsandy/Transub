/**
 * HTTP client for Laya System One (local or Laya Studio).
 * Wire-compatible with POST /v1/systemone.
 */
const { asString } = require('./ipc-validate');
const jevCore = require('../src/js/jev-decision-core');

/**
 * @param {{
 *   apiKey?: string,
 *   endpoint?: string,
 *   model?: string,
 *   state: *,
 *   questions: object,
 *   signal?: AbortSignal,
 *   timeoutMs?: number,
 * }} opts
 */
async function invokeSystemOne(opts = {}) {
    const jevPortGuard = require('./jev-port-guard');
    const guarded = jevPortGuard.guardEndpoint(opts.endpoint || 'local');
    if (!guarded.ok) {
        return {
            ok: false,
            error: guarded.error || 'port_conflict',
            code: guarded.code,
            hint: guarded.hint,
        };
    }
    const endpoint = guarded.endpoint;
    const apiKey = asString(opts.apiKey, 8192).trim();
    if (jevCore.requiresApiKey(endpoint) && !apiKey) {
        return { ok: false, error: 'missing_api_key' };
    }

    const isHostedDecide = /jevtypesafeai\.com\/api\/v1\/decide/i.test(endpoint);
    const body = jevCore.buildSystemOneRequest({
        model: opts.model || jevCore.DEFAULT_MODEL,
        state: opts.state,
        questions: opts.questions,
        includeModel: !isHostedDecide,
    });

    const timeoutMs = Math.max(3000, Math.min(120000, Number(opts.timeoutMs) || 30000));
    const controller = new AbortController();
    const onAbort = () => {
        try { controller.abort(); } catch { /* ignore */ }
    };
    if (opts.signal) {
        if (opts.signal.aborted) onAbort();
        else opts.signal.addEventListener('abort', onAbort, { once: true });
    }
    const timer = setTimeout(onAbort, timeoutMs);

    try {
        const headers = {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        };
        if (apiKey) {
            headers.Authorization = `Bearer ${apiKey}`;
            // Laya Studio also accepts x-api-key
            if (/api\.laya\.studio/i.test(endpoint)) {
                headers['x-api-key'] = apiKey;
            }
        }
        const res = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: controller.signal,
        });
        let json = null;
        const text = await res.text();
        try {
            json = text ? JSON.parse(text) : null;
        } catch {
            json = null;
        }
        if (!res.ok) {
            const errMsg = (json && (json.error?.message || json.error || json.message))
                || `http_${res.status}`;
            return { ok: false, error: String(errMsg), status: res.status };
        }
        const parsed = jevCore.parseSystemOneResponse(json);
        if (!parsed.ok) return parsed;
        return { ...parsed, endpoint, status: res.status };
    } catch (err) {
        const name = String(err?.name || '');
        if (name === 'AbortError' || opts.signal?.aborted) {
            return { ok: false, error: 'aborted', aborted: true };
        }
        const msg = String(err?.message || err || '');
        const portGuard = require('./jev-port-guard');
        if (/ECONNREFUSED|fetch failed|networkerror|failed to fetch/i.test(msg)) {
            return {
                ok: false,
                error: 'laya_unreachable',
                detail: msg,
                hint: jevCore.isLocalSystemOneEndpoint(endpoint)
                    ? portGuard.localStartHint(portGuard.parsePortFromEndpoint(endpoint))
                    : undefined,
            };
        }
        return { ok: false, error: msg || String(err) };
    } finally {
        clearTimeout(timer);
        if (opts.signal) {
            try { opts.signal.removeEventListener('abort', onAbort); } catch { /* ignore */ }
        }
    }
}

/**
 * Cheap reachability check: GET …/v1/models (no decision credits on some hosts).
 * Falls back to a tiny noul probe via testJevConnection.
 */
async function probeSystemOne({ apiKey, endpoint, signal, timeoutMs } = {}) {
    const jevPortGuard = require('./jev-port-guard');
    const guarded = jevPortGuard.guardEndpoint(endpoint || 'local');
    if (!guarded.ok) {
        return {
            ok: false,
            error: guarded.error || 'port_conflict',
            code: guarded.code,
            hint: guarded.hint,
            endpoint: guarded.endpoint,
            port: guarded.port,
        };
    }
    const base = String(guarded.endpoint || '').replace(/\/+$/, '');
    const modelsUrl = base.replace(/\/v1\/systemone$/i, '/v1/models');
    const key = asString(apiKey, 8192).trim();
    if (jevCore.requiresApiKey(guarded.endpoint) && !key) {
        return { ok: false, error: 'missing_api_key', endpoint: guarded.endpoint, port: guarded.port };
    }

    const ms = Math.max(2000, Math.min(15000, Number(timeoutMs) || 8000));
    const controller = new AbortController();
    const onAbort = () => { try { controller.abort(); } catch { /* ignore */ } };
    if (signal) {
        if (signal.aborted) onAbort();
        else signal.addEventListener('abort', onAbort, { once: true });
    }
    const timer = setTimeout(onAbort, ms);
    try {
        const headers = { Accept: 'application/json' };
        if (key) {
            headers.Authorization = `Bearer ${key}`;
            if (/api\.laya\.studio/i.test(guarded.endpoint)) headers['x-api-key'] = key;
        }
        const res = await fetch(modelsUrl, { method: 'GET', headers, signal: controller.signal });
        if (res.ok) {
            let modelId = '';
            try {
                const json = await res.json();
                const data = Array.isArray(json?.data) ? json.data : [];
                modelId = String(data[0]?.id || json?.model || '').trim();
            } catch { /* ignore */ }
            return {
                ok: true,
                endpoint: guarded.endpoint,
                port: guarded.port,
                modelsUrl,
                model: modelId || undefined,
                via: 'models',
            };
        }
    } catch (_) {
        /* fall through to noul probe */
    } finally {
        clearTimeout(timer);
        if (signal) {
            try { signal.removeEventListener('abort', onAbort); } catch { /* ignore */ }
        }
    }

    const probe = await testJevConnection({ apiKey: key, endpoint, signal, timeoutMs: ms });
    if (!probe.ok) {
        return {
            ...probe,
            endpoint: guarded.endpoint,
            port: guarded.port,
            error: probe.error === 'laya_unreachable'
                ? 'Laya 未达（连接被拒绝）'
                : (probe.error || 'probe_failed'),
        };
    }
    return {
        ok: true,
        endpoint: guarded.endpoint,
        port: guarded.port,
        model: probe.model,
        via: 'noul',
    };
}

async function testJevConnection({ apiKey, endpoint, signal, timeoutMs } = {}) {
    return invokeSystemOne({
        apiKey,
        endpoint: endpoint || 'local',
        state: 'Transub connection probe: ping',
        questions: {
            ok: {
                type: 'noul',
                instructions: 'Is this a harmless health-check ping?',
            },
        },
        timeoutMs: timeoutMs || 20000,
        signal,
    });
}

module.exports = {
    invokeSystemOne,
    testJevConnection,
    probeSystemOne,
};
