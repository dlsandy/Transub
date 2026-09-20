/**
 * Transub Station control-plane client (discovery + ready probe).
 * Station 0.2: one port for control API + OpenAI-compat /v1 proxy.
 */
const DEFAULT_STATION_URL = 'http://127.0.0.1:8787';

/**
 * @param {unknown} raw
 * @returns {string}
 */
function normalizeStationUrl(raw) {
    let s = String(raw == null ? '' : raw).trim().slice(0, 512);
    if (!s) s = DEFAULT_STATION_URL;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `http://${s}`;
    try {
        const u = new URL(s);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
            return DEFAULT_STATION_URL;
        }
        // Control-plane root — strip trailing /v1 or /api paths users may paste.
        let path = (u.pathname || '/').replace(/\/+$/, '') || '';
        if (/\/v1$/i.test(path)) path = path.replace(/\/v1$/i, '');
        if (/\/api$/i.test(path)) path = path.replace(/\/api$/i, '');
        const root = `${u.protocol}//${u.host}${path || ''}`;
        return root.replace(/\/+$/, '') || DEFAULT_STATION_URL;
    } catch {
        return DEFAULT_STATION_URL;
    }
}

/**
 * @param {object} [input]
 * @returns {{
 *   transubStationEnabled: boolean,
 *   transubStationUrl: string,
 *   transubStationModel: string,
 * }}
 */
function normalizeStationOptions(input = {}) {
    const enabled = !!input.transubStationEnabled;
    return {
        transubStationEnabled: enabled,
        transubStationUrl: normalizeStationUrl(input.transubStationUrl),
        transubStationModel: String(input.transubStationModel || '').trim().slice(0, 256),
    };
}

/**
 * @param {object} cfg
 * @returns {{ ok: boolean, ready: boolean, openaiBaseUrl: string, model: string, apiKey: string, temperature: number|null, topP: number|null, maxConcurrency: number, chatCompletionsUrl: string, error?: string }}
 */
function parseClientConfig(cfg) {
    const raw = cfg && typeof cfg === 'object' ? cfg : {};
    const ready = raw.ready === true;
    const openaiBaseUrl = String(raw.openai_base_url || raw.openaiBaseUrl || '').trim();
    const model = String(raw.model || '').trim();
    const apiKey = String(raw.api_key || raw.apiKey || 'transub').trim() || 'transub';
    const chatCompletionsUrl = String(raw.chat_completions_url || raw.chatCompletionsUrl || '').trim();
    const temperature = Number.isFinite(Number(raw.temperature)) ? Number(raw.temperature) : null;
    const topP = Number.isFinite(Number(raw.top_p ?? raw.topP)) ? Number(raw.top_p ?? raw.topP) : null;
    let maxConcurrency = Number(raw.max_concurrency ?? raw.maxConcurrency);
    if (!Number.isFinite(maxConcurrency) || maxConcurrency < 1) maxConcurrency = 1;
    maxConcurrency = Math.min(64, Math.floor(maxConcurrency));
    if (!openaiBaseUrl && !chatCompletionsUrl) {
        return {
            ok: false,
            ready: false,
            openaiBaseUrl: '',
            model: '',
            apiKey,
            temperature,
            topP,
            maxConcurrency: 1,
            chatCompletionsUrl: '',
            error: 'Station 未返回 openai_base_url',
        };
    }
    return {
        ok: true,
        ready,
        openaiBaseUrl: openaiBaseUrl || (chatCompletionsUrl.replace(/\/chat\/completions\/?$/i, '') || ''),
        model,
        apiKey,
        temperature,
        topP,
        maxConcurrency,
        chatCompletionsUrl,
    };
}

/**
 * @param {string} stationUrl
 * @param {string} path
 * @param {{
 *   signal?: AbortSignal,
 *   timeoutMs?: number,
 *   method?: string,
 *   body?: object|null,
 *   headers?: Record<string, string>,
 *   absoluteUrl?: string,
 * }} [opts]
 */
async function stationFetchJson(stationUrl, path, opts = {}) {
    const method = String(opts.method || 'GET').toUpperCase() || 'GET';
    const base = normalizeStationUrl(stationUrl);
    const url = opts.absoluteUrl
        ? String(opts.absoluteUrl)
        : `${base}${path.startsWith('/') ? path : `/${path}`}`;
    // Model switch with wait:true can take minutes while GGUF loads — allow up to 5 min.
    const timeoutMs = Math.max(1000, Math.min(300000, Number(opts.timeoutMs) || 8000));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    if (opts.signal) {
        if (opts.signal.aborted) controller.abort();
        else opts.signal.addEventListener('abort', onAbort, { once: true });
    }
    const headers = {
        Accept: 'application/json',
        ...(opts.headers && typeof opts.headers === 'object' ? opts.headers : {}),
    };
    let bodyText = null;
    if (opts.body != null && method !== 'GET' && method !== 'HEAD') {
        bodyText = JSON.stringify(opts.body);
        if (!headers['Content-Type'] && !headers['content-type']) {
            headers['Content-Type'] = 'application/json';
        }
    }
    try {
        // Always direct — Station is local/LAN like engine; never go through app HTTP proxy
        // (proxy often breaks 192.168.x.x with opaque "fetch failed").
        let res;
        try {
            const undici = require('undici');
            const dispatcher = new undici.Agent({
                connect: { family: 4, timeout: timeoutMs },
                bodyTimeout: timeoutMs,
                headersTimeout: timeoutMs,
            });
            try {
                const ures = await undici.request(url, {
                    method,
                    headers,
                    body: bodyText || undefined,
                    signal: controller.signal,
                    dispatcher,
                });
                let body = null;
                try {
                    body = await ures.body.json();
                } catch {
                    body = null;
                }
                res = { ok: ures.statusCode >= 200 && ures.statusCode < 300, status: ures.statusCode, body, url };
            } finally {
                try { dispatcher.close(); } catch { /* ignore */ }
            }
        } catch (undiciErr) {
            // Fallback to global fetch if undici unavailable.
            try {
                const fres = await fetch(url, {
                    method,
                    headers,
                    body: bodyText || undefined,
                    signal: controller.signal,
                });
                let body = null;
                try {
                    body = await fres.json();
                } catch {
                    body = null;
                }
                res = { ok: fres.ok, status: fres.status, body, url };
            } catch (fetchErr) {
                const cause = fetchErr?.cause?.message || undiciErr?.cause?.message || '';
                const msg = fetchErr?.message || undiciErr?.message || String(fetchErr || undiciErr);
                const err = new Error(
                    cause && !String(msg).includes(cause)
                        ? `${msg}（${cause}）→ ${url}`
                        : `${msg} → ${url}`,
                );
                err.cause = fetchErr?.cause || undiciErr?.cause || fetchErr || undiciErr;
                throw err;
            }
        }
        return res;
    } finally {
        clearTimeout(timer);
        if (opts.signal) opts.signal.removeEventListener('abort', onAbort);
    }
}

/**
 * @param {unknown} body
 * @returns {Array<{ id: string, name: string }>}
 */
function parseModelsListBody(body) {
    const out = [];
    const seen = new Set();
    const push = (id, name) => {
        const mid = String(id || '').trim();
        if (!mid || seen.has(mid)) return;
        seen.add(mid);
        out.push({ id: mid, name: String(name || mid).trim() || mid });
    };
    if (!body) return out;
    if (Array.isArray(body)) {
        for (const row of body) {
            if (typeof row === 'string') push(row, row);
            else if (row && typeof row === 'object') {
                push(row.id || row.model || row.name, row.name || row.id || row.model);
            }
        }
        return out;
    }
    if (typeof body !== 'object') return out;
    const lists = [body.data, body.models, body.items, body.available, body.catalog];
    for (const list of lists) {
        if (!Array.isArray(list)) continue;
        for (const row of list) {
            if (typeof row === 'string') push(row, row);
            else if (row && typeof row === 'object') {
                push(row.id || row.model || row.name, row.name || row.id || row.model);
            }
        }
    }
    if (body.model) push(body.model, body.model);
    return out;
}

function openaiModelsUrl(openaiBaseUrl) {
    const raw = String(openaiBaseUrl || '').trim().replace(/\/+$/, '');
    if (!raw) return '';
    if (/\/v1$/i.test(raw)) return `${raw}/models`;
    if (/\/models$/i.test(raw)) return raw;
    return `${raw}/v1/models`;
}

/**
 * @param {{ stationUrl?: string, signal?: AbortSignal, timeoutMs?: number }} [opts]
 */
async function fetchClientConfig(opts = {}) {
    const stationUrl = normalizeStationUrl(opts.stationUrl);
    try {
        const res = await stationFetchJson(stationUrl, '/api/client/config', opts);
        if (!res.body || typeof res.body !== 'object') {
            return {
                ok: false,
                ready: false,
                error: res.status === 0
                    ? '无法连接 Station'
                    : `Station 响应无效（HTTP ${res.status}）`,
                stationUrl,
            };
        }
        const parsed = parseClientConfig(res.body);
        if (!parsed.ok) {
            return { ...parsed, stationUrl, httpStatus: res.status };
        }
        if (!res.ok && !parsed.ready) {
            return {
                ...parsed,
                ok: false,
                error: `Station 未就绪（HTTP ${res.status}）`,
                stationUrl,
                httpStatus: res.status,
            };
        }
        return { ...parsed, stationUrl, httpStatus: res.status };
    } catch (err) {
        const aborted = err?.name === 'AbortError';
        return {
            ok: false,
            ready: false,
            error: aborted ? '连接 Station 超时或已取消' : (err?.message || String(err)),
            stationUrl,
        };
    }
}

/**
 * @param {{ stationUrl?: string, signal?: AbortSignal, timeoutMs?: number }} [opts]
 */
async function probeStationReady(opts = {}) {
    const stationUrl = normalizeStationUrl(opts.stationUrl);
    try {
        const res = await stationFetchJson(stationUrl, '/api/client/ready', opts);
        const ready = !!(res.body && res.body.ready === true);
        if (ready) {
            // Enrich with model name from config when available.
            let model = '';
            try {
                const cfg = await fetchClientConfig({ ...opts, stationUrl });
                if (cfg?.model) model = String(cfg.model);
            } catch { /* ignore */ }
            return {
                ok: true,
                ready: true,
                message: model
                    ? `Station 已就绪 · ${model}（${stationUrl}）`
                    : `Station 已就绪（${stationUrl}）`,
                stationUrl,
                model,
                httpStatus: res.status,
            };
        }

        // Not ready — pull config for a clearer hint (model / detail).
        let model = '';
        let cfgDetail = '';
        try {
            const cfgRes = await stationFetchJson(stationUrl, '/api/client/config', opts);
            if (cfgRes.body && typeof cfgRes.body === 'object') {
                model = String(cfgRes.body.model || '').trim();
                cfgDetail = String(
                    cfgRes.body.message
                    || cfgRes.body.detail
                    || cfgRes.body.status
                    || '',
                ).trim();
            }
        } catch { /* ignore */ }

        const bodyDetail = res.body && typeof res.body === 'object'
            ? String(res.body.message || res.body.detail || '').trim()
            : '';
        const detail = bodyDetail || cfgDetail;
        const modelHint = model ? `当前模型「${model}」` : '尚未加载模型';
        const tip = '请在 Station 控制台启动或切换模型，就绪后再点「探测就绪」';
        return {
            ok: false,
            ready: false,
            error: detail
                ? `已连通 Station，但未就绪：${detail}（${modelHint}）。${tip}`
                : `已连通 Station，但未就绪（${modelHint}）。${tip}`,
            stationUrl,
            model,
            httpStatus: res.status,
        };
    } catch (err) {
        const aborted = err?.name === 'AbortError';
        const raw = String(opts.stationUrl || '').trim();
        const hint = /\/v1\/?$/i.test(raw)
            ? '（已去掉末尾 /v1，控制面请用根地址）'
            : '';
        return {
            ok: false,
            ready: false,
            error: aborted
                ? `连接 Station 超时或已取消 → ${stationUrl}${hint}`
                : `${err?.message || String(err)}${hint}`,
            stationUrl,
        };
    }
}

/**
 * List models available on Station (control-plane + OpenAI-compat /models).
 * @param {{
 *   stationUrl?: string,
 *   signal?: AbortSignal,
 *   timeoutMs?: number,
 *   preferredModel?: string,
 * }} [opts]
 */
async function listStationModels(opts = {}) {
    const stationUrl = normalizeStationUrl(opts.stationUrl);
    const preferred = String(opts.preferredModel || '').trim();
    const models = [];
    const seen = new Set();
    const push = (id, name) => {
        const mid = String(id || '').trim();
        if (!mid || seen.has(mid)) return;
        seen.add(mid);
        models.push({ id: mid, name: String(name || mid).trim() || mid });
    };

    let cfg = null;
    try {
        cfg = await fetchClientConfig(opts);
    } catch (err) {
        return {
            ok: false,
            models: [],
            activeModel: preferred,
            ready: false,
            stationUrl,
            error: err?.message || String(err),
        };
    }

    try {
        const res = await stationFetchJson(stationUrl, '/api/models', {
            ...opts,
            timeoutMs: Math.min(2500, Number(opts.timeoutMs) || 2500),
        });
        if (res?.body) {
            for (const row of parseModelsListBody(res.body)) push(row.id, row.name);
        }
    } catch { /* optional control-plane catalog */ }

    if (cfg?.ok && cfg.openaiBaseUrl) {
        try {
            const modelsUrl = openaiModelsUrl(cfg.openaiBaseUrl);
            if (modelsUrl) {
                const res = await stationFetchJson(stationUrl, '/models', {
                    ...opts,
                    timeoutMs: Math.min(2500, Number(opts.timeoutMs) || 2500),
                    absoluteUrl: modelsUrl,
                    headers: {
                        Authorization: `Bearer ${cfg.apiKey || 'transub'}`,
                    },
                });
                if (res?.body) {
                    for (const row of parseModelsListBody(res.body)) push(row.id, row.name);
                }
            }
        } catch { /* optional openai catalog */ }
    }

    if (cfg?.model) push(cfg.model, cfg.model);
    if (preferred) push(preferred, preferred);

    let activeFromApi = '';
    try {
        const active = await fetchActiveModel({ ...opts, stationUrl, timeoutMs: 5000 });
        if (active?.id) {
            activeFromApi = active.id;
            push(active.id, active.name || active.id);
        }
    } catch { /* optional */ }

    const activeModel = preferred || activeFromApi || String(cfg?.model || '').trim() || (models[0]?.id || '');
    const connected = !!(cfg && (cfg.ok || cfg.httpStatus));
    if (!models.length && !connected) {
        return {
            ok: false,
            models: [],
            activeModel: preferred,
            ready: false,
            stationUrl,
            error: cfg?.error || '无法连接 Station',
        };
    }
    return {
        ok: true,
        models,
        activeModel,
        ready: !!cfg?.ready,
        stationUrl,
        openaiBaseUrl: cfg?.openaiBaseUrl || '',
        error: models.length ? '' : (cfg?.error || 'Station 未返回可用模型'),
    };
}

/**
 * Parse GET /api/models/active (and similar) payloads.
 * @param {unknown} body
 * @returns {{ id: string, name: string, ready: boolean|null }}
 */
function parseActiveModelBody(body) {
    const raw = body && typeof body === 'object' ? body : {};
    const nested = raw.active && typeof raw.active === 'object'
        ? raw.active
        : (raw.model && typeof raw.model === 'object' ? raw.model : null);
    const src = nested || raw;
    const id = String(
        src.model_id || src.modelId || src.id || (typeof raw.model === 'string' ? raw.model : '')
            || src.model || src.name || '',
    ).trim();
    const name = String(src.name || src.display_name || src.displayName || id).trim() || id;
    const ready = typeof src.ready === 'boolean'
        ? src.ready
        : (typeof raw.ready === 'boolean' ? raw.ready : null);
    return { id, name, ready };
}

/**
 * Current Station activity model via GET /api/models/active.
 * @param {{ stationUrl?: string, signal?: AbortSignal, timeoutMs?: number }} [opts]
 */
async function fetchActiveModel(opts = {}) {
    const stationUrl = normalizeStationUrl(opts.stationUrl);
    try {
        const res = await stationFetchJson(stationUrl, '/api/models/active', {
            ...opts,
            method: 'GET',
            timeoutMs: Math.min(8000, Number(opts.timeoutMs) || 5000),
        });
        if (!res?.ok && res?.status !== 200) {
            return {
                ok: false,
                id: '',
                name: '',
                ready: null,
                stationUrl,
                error: `HTTP ${res?.status || '?'}`,
            };
        }
        const parsed = parseActiveModelBody(res?.body);
        return {
            ok: !!parsed.id,
            id: parsed.id,
            name: parsed.name,
            ready: parsed.ready,
            stationUrl,
            body: res?.body || null,
        };
    } catch (err) {
        return {
            ok: false,
            id: '',
            name: '',
            ready: null,
            stationUrl,
            error: err?.message || String(err),
        };
    }
}

/**
 * Switch Station active model via unified control API, wait until ready by default.
 * Official: POST /api/switch { model | model_id, wait? }
 * Fallback: POST /api/models/:id/switch
 * @param {{
 *   stationUrl?: string,
 *   model?: string,
 *   wait?: boolean,
 *   signal?: AbortSignal,
 *   timeoutMs?: number,
 * }} [opts]
 */
async function selectStationModel(opts = {}) {
    const model = String(opts.model || '').trim().slice(0, 256);
    if (!model) {
        return { ok: false, error: '缺少模型 id', model: '' };
    }
    const stationUrl = normalizeStationUrl(opts.stationUrl);
    const wait = opts.wait !== false;
    // Sync switch waits for ready — GGUF load can take a while on first touch.
    const timeoutMs = Math.max(
        wait ? 60000 : 8000,
        Math.min(300000, Number(opts.timeoutMs) || (wait ? 120000 : 15000)),
    );

    let switched = false;
    let lastError = '';
    let switchBody = null;

    // Unified entry (id / alias / display name / filename).
    try {
        const res = await stationFetchJson(stationUrl, '/api/switch', {
            ...opts,
            method: 'POST',
            body: { model, model_id: model, wait },
            timeoutMs,
        });
        if (res?.ok || res?.status === 204) {
            switched = true;
            switchBody = res.body;
        } else {
            lastError = res?.status ? `HTTP ${res.status}` : 'switch failed';
            const detail = res?.body && typeof res.body === 'object'
                ? String(res.body.message || res.body.detail || res.body.error || '').trim()
                : '';
            if (detail) lastError = detail;
        }
    } catch (err) {
        lastError = err?.message || String(err);
    }

    // REST-style fallback when unified route missing.
    if (!switched) {
        try {
            const enc = encodeURIComponent(model);
            const path = wait
                ? `/api/models/${enc}/switch`
                : `/api/models/${enc}/switch?wait=false`;
            const res = await stationFetchJson(stationUrl, path, {
                ...opts,
                method: 'POST',
                body: {},
                timeoutMs,
            });
            if (res?.ok || res?.status === 204) {
                switched = true;
                switchBody = res.body;
                lastError = '';
            } else if (res?.status && res.status !== 404) {
                lastError = res.status ? `HTTP ${res.status}` : lastError;
            }
        } catch (err) {
            if (!lastError) lastError = err?.message || String(err);
        }
    }

    let active = null;
    try {
        active = await fetchActiveModel({ ...opts, stationUrl, timeoutMs: 8000 });
    } catch { /* ignore */ }

    let cfg = null;
    try {
        cfg = await fetchClientConfig({ ...opts, stationUrl, timeoutMs: 8000 });
    } catch { /* ignore */ }

    const fromSwitch = parseActiveModelBody(switchBody);
    const activeModel = String(
        active?.id || fromSwitch.id || cfg?.model || model,
    ).trim() || model;
    const ready = active?.ready === true
        || !!cfg?.ready
        || (switched && wait);

    return {
        ok: switched,
        model,
        switched,
        activeModel,
        ready,
        stationUrl,
        stationReportedModel: String(active?.id || cfg?.model || '').trim(),
        warning: switched
            ? ''
            : (lastError
                ? `Station 切换失败（${lastError}）；已记下首选模型，请求时将带上该 model`
                : 'Station 切换失败；已记下首选模型，请求时将带上该 model'),
        error: switched ? '' : lastError,
    };
}

/**
 * Resolve OpenAI-compat endpoint from Station for external sentence MT.
 * @param {{
 *   stationUrl?: string,
 *   preferredModel?: string,
 *   transubStationModel?: string,
 *   signal?: AbortSignal,
 *   timeoutMs?: number,
 * }} [opts]
 */
async function resolveStationSentenceMtEndpoint(opts = {}) {
    const cfg = await fetchClientConfig(opts);
    if (!cfg.ok) {
        return {
            ok: false,
            source: 'station',
            error: cfg.error || '无法从 Station 获取配置',
            code: cfg.ready === false ? 'station_not_ready' : 'station_config_failed',
            ready: !!cfg.ready,
        };
    }
    if (!cfg.ready) {
        return {
            ok: false,
            source: 'station',
            error: 'Station 未就绪。请在 Station 控制台切换/启动模型后再试。',
            code: 'station_not_ready',
            ready: false,
            model: cfg.model || '',
            baseUrl: cfg.openaiBaseUrl || '',
        };
    }
    const preferred = String(opts.preferredModel || opts.transubStationModel || '').trim();
    const model = preferred || String(cfg.model || '').trim();
    if (!model) {
        return {
            ok: false,
            source: 'station',
            error: 'Station 已连接但未返回 model。请在 Station 中选择模型。',
            code: 'station_no_model',
            ready: true,
        };
    }
    const baseUrl = String(cfg.openaiBaseUrl || '').trim();
    if (!baseUrl) {
        return {
            ok: false,
            source: 'station',
            error: 'Station 未返回 openai_base_url',
            code: 'station_no_base_url',
            ready: true,
        };
    }
    let hostHint = '';
    try {
        const u = new URL(baseUrl.includes('://') ? baseUrl : `http://${baseUrl}`);
        hostHint = u.host || '';
    } catch {
        hostHint = baseUrl.replace(/^https?:\/\//i, '').split('/')[0] || '';
    }
    return {
        ok: true,
        source: 'station',
        apiKey: cfg.apiKey || 'transub',
        baseUrl,
        model,
        modelId: model,
        modelName: model,
        skipLocalEnsure: true,
        parallelSlots: cfg.maxConcurrency || 1,
        hostHint,
        temperature: cfg.temperature,
        topP: cfg.topP,
        ready: true,
    };
}

module.exports = {
    DEFAULT_STATION_URL,
    normalizeStationUrl,
    normalizeStationOptions,
    parseClientConfig,
    parseModelsListBody,
    parseActiveModelBody,
    openaiModelsUrl,
    fetchClientConfig,
    fetchActiveModel,
    probeStationReady,
    listStationModels,
    selectStationModel,
    resolveStationSentenceMtEndpoint,
};
