/**
 * App-wide HTTP(S) proxy: settings normalize, env for child processes,
 * undici global dispatcher for Node fetch, and helpers for http/https downloads.
 */
const http = require('http');
const https = require('https');
const { URL } = require('url');

const DEFAULT_BYPASS = 'localhost,127.0.0.1,::1,<local>';

/** @type {{ enabled: boolean, url: string, bypass: string } | null} */
let activeProxy = null;
/** @type {import('undici').Dispatcher | null} */
let activeDispatcher = null;
/** @type {typeof import('undici') | null} */
let undiciMod = null;

/**
 * Packaged Electron does not expose Node's bundled undici via require();
 * undici is a production dependency so it resolves from node_modules/app.asar.
 */
function loadUndici() {
    if (undiciMod) return undiciMod;
    try {
        undiciMod = require('undici');
        return undiciMod;
    } catch (err) {
        throw new Error(
            `无法加载 undici（代理/联网探测需要）：${err.message || err}`,
        );
    }
}

const httpsAgentDirect = new https.Agent({
    keepAlive: true,
    family: 4,
    timeout: 120000,
});
const httpAgentDirect = new http.Agent({
    keepAlive: true,
    family: 4,
    timeout: 120000,
});

function asTrimmed(value, max = 2048) {
    return String(value ?? '').trim().slice(0, max);
}

/**
 * Normalize proxy fields from settings / form payload.
 * @param {object} input
 * @returns {{ proxyEnabled: boolean, proxyUrl: string, proxyBypass: string }}
 */
function normalizeProxyOptions(input = {}) {
    const enabled = !!input.proxyEnabled;
    let url = asTrimmed(input.proxyUrl, 512);
    if (url && !/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
        url = `http://${url}`;
    }
    if (url) {
        try {
            const parsed = new URL(url);
            url = parsed.toString().replace(/\/$/, '');
        } catch {
            url = '';
        }
    }
    const bypass = asTrimmed(input.proxyBypass, 2048) || DEFAULT_BYPASS;
    return {
        proxyEnabled: enabled,
        proxyUrl: url,
        proxyBypass: bypass,
    };
}

function isProxyActive(cfg = {}) {
    return !!(cfg.proxyEnabled && cfg.proxyUrl && isHttpProxyUrl(cfg.proxyUrl));
}

function isHttpProxyUrl(url) {
    try {
        const p = new URL(url).protocol.toLowerCase();
        return p === 'http:' || p === 'https:';
    } catch {
        return false;
    }
}

function mergeBypassList(userBypass = '') {
    const parts = String(userBypass || '')
        .split(/[,;\s]+/)
        .map((p) => p.trim())
        .filter(Boolean);
    const defaults = DEFAULT_BYPASS.split(',');
    return [...new Set([...defaults, ...parts])].join(',');
}

function hostMatchesBypass(hostname, bypass) {
    const host = String(hostname || '').toLowerCase();
    if (!host) return true;
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
    const rules = String(bypass || '')
        .split(/[,;\s]+/)
        .map((r) => r.trim().toLowerCase())
        .filter(Boolean);
    for (const rule of rules) {
        if (rule === '<local>') {
            if (!host.includes('.')) return true;
            continue;
        }
        if (rule.startsWith('*.') && host.endsWith(rule.slice(1))) return true;
        if (host === rule || host.endsWith(`.${rule}`)) return true;
    }
    return false;
}

/**
 * Write proxy env vars onto an env object (for spawn) or process.env.
 * @param {NodeJS.ProcessEnv} env
 * @param {{ proxyEnabled?: boolean, proxyUrl?: string, proxyBypass?: string } | null} options
 */
function applyProxyToEnv(env, options = null) {
    const cfg = options ? normalizeProxyOptions(options) : (activeProxy
        ? { proxyEnabled: true, proxyUrl: activeProxy.url, proxyBypass: activeProxy.bypass }
        : normalizeProxyOptions({}));
    const keys = [
        'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
        'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy',
    ];
    for (const key of keys) {
        delete env[key];
    }
    if (isProxyActive(cfg)) {
        const bypass = mergeBypassList(cfg.proxyBypass);
        env.HTTP_PROXY = cfg.proxyUrl;
        env.HTTPS_PROXY = cfg.proxyUrl;
        env.ALL_PROXY = cfg.proxyUrl;
        env.NO_PROXY = bypass;
        env.http_proxy = cfg.proxyUrl;
        env.https_proxy = cfg.proxyUrl;
        env.all_proxy = cfg.proxyUrl;
        env.no_proxy = bypass;
    }
    return env;
}

async function clearUndiciDispatcher() {
    if (activeDispatcher && typeof activeDispatcher.close === 'function') {
        try {
            await activeDispatcher.close();
        } catch { /* ignore */ }
    }
    activeDispatcher = null;
}

/**
 * Apply proxy from settings: process.env + undici global dispatcher + Chromium session.
 * @param {object} options settings options
 * @param {{ session?: Electron.Session }} [hooks]
 */
async function applyProxyFromSettings(options = {}, hooks = {}) {
    const cfg = normalizeProxyOptions(options);
    activeProxy = isProxyActive(cfg)
        ? { enabled: true, url: cfg.proxyUrl, bypass: mergeBypassList(cfg.proxyBypass) }
        : null;

    applyProxyToEnv(process.env, cfg);

    const undici = loadUndici();
    await clearUndiciDispatcher();

    if (activeProxy) {
        const dispatcher = new undici.EnvHttpProxyAgent({
            httpProxy: activeProxy.url,
            httpsProxy: activeProxy.url,
            noProxy: activeProxy.bypass,
        });
        undici.setGlobalDispatcher(dispatcher);
        activeDispatcher = dispatcher;
    } else {
        const agent = new undici.Agent();
        undici.setGlobalDispatcher(agent);
        activeDispatcher = agent;
    }

    const ses = hooks.session;
    if (ses && typeof ses.setProxy === 'function') {
        try {
            if (activeProxy) {
                await ses.setProxy({
                    proxyRules: activeProxy.url,
                    proxyBypassRules: activeProxy.bypass,
                });
            } else {
                await ses.setProxy({ mode: 'direct' });
            }
        } catch (err) {
            console.warn('[proxy] session.setProxy failed:', err?.message || err);
        }
    }

    return { ok: true, ...cfg, active: !!activeProxy };
}

function getActiveProxy() {
    return activeProxy ? { ...activeProxy } : null;
}

/**
 * Agents for Node http/https.get. When proxy is on, returns tunnel agents.
 */
function getDownloadAgents() {
    if (!activeProxy || !isHttpProxyUrl(activeProxy.url)) {
        return { httpAgent: httpAgentDirect, httpsAgent: httpsAgentDirect };
    }
    const proxyUrl = new URL(activeProxy.url);
    const bypass = activeProxy.bypass;

    function shouldBypass(targetUrl) {
        try {
            return hostMatchesBypass(new URL(targetUrl).hostname, bypass);
        } catch {
            return false;
        }
    }

    const httpsAgent = new https.Agent({
        keepAlive: true,
        family: 4,
        timeout: 120000,
        createConnection(options, callback) {
            const targetHost = options.host || options.hostname;
            const targetPort = options.port || 443;
            const fakeUrl = `https://${targetHost}`;
            if (shouldBypass(fakeUrl)) {
                return httpsAgentDirect.createConnection(options, callback);
            }
            const connectReq = http.request({
                host: proxyUrl.hostname,
                port: proxyUrl.port || (proxyUrl.protocol === 'https:' ? 443 : 80),
                method: 'CONNECT',
                path: `${targetHost}:${targetPort}`,
                headers: {
                    Host: `${targetHost}:${targetPort}`,
                    ...(proxyUrl.username
                        ? {
                            'Proxy-Authorization': `Basic ${Buffer.from(
                                `${decodeURIComponent(proxyUrl.username)}:${decodeURIComponent(proxyUrl.password || '')}`,
                            ).toString('base64')}`,
                        }
                        : {}),
                },
                timeout: 120000,
            });
            connectReq.on('connect', (res, socket) => {
                if (res.statusCode !== 200) {
                    socket.destroy();
                    callback(new Error(`代理 CONNECT 失败 HTTP ${res.statusCode}`));
                    return;
                }
                callback(null, socket);
            });
            connectReq.on('error', callback);
            connectReq.on('timeout', () => {
                connectReq.destroy();
                callback(Object.assign(new Error('代理连接超时'), { code: 'ETIMEDOUT' }));
            });
            connectReq.end();
        },
    });

    const httpAgent = new http.Agent({
        keepAlive: true,
        family: 4,
        timeout: 120000,
    });

    // Tag agents so requestGet can rewrite HTTP requests through the proxy.
    httpsAgent.__transubProxy = proxyUrl;
    httpAgent.__transubProxy = proxyUrl;
    httpAgent.__transubBypass = bypass;
    httpsAgent.__transubBypass = bypass;

    return { httpAgent, httpsAgent };
}

/**
 * Probe outbound connectivity (optionally via current proxy settings in form).
 * @param {object} [options] optional override proxy fields; else uses active
 */
/**
 * Probe outbound connectivity (optionally via form override without mutating globals).
 * @param {object|null} [options] if set, probe with these proxy fields using a one-off dispatcher
 */
async function testProxyConnectivity(options = null) {
    const cfg = options
        ? normalizeProxyOptions(options)
        : (activeProxy
            ? { proxyEnabled: true, proxyUrl: activeProxy.url, proxyBypass: activeProxy.bypass }
            : { proxyEnabled: false, proxyUrl: '', proxyBypass: DEFAULT_BYPASS });

    if (cfg.proxyEnabled && cfg.proxyUrl && !isHttpProxyUrl(cfg.proxyUrl)) {
        return {
            ok: false,
            error: '目前仅支持 HTTP/HTTPS 代理（如 http://127.0.0.1:7890）。请改用客户端的 HTTP 端口。',
            code: 'unsupported_scheme',
        };
    }

    if (cfg.proxyEnabled && !cfg.proxyUrl) {
        return {
            ok: false,
            error: '请填写代理服务器地址',
            code: 'missing_url',
        };
    }

    const undici = loadUndici();
    let dispatcher = null;
    let ownsDispatcher = false;
    if (options) {
        if (isProxyActive(cfg)) {
            dispatcher = new undici.EnvHttpProxyAgent({
                httpProxy: cfg.proxyUrl,
                httpsProxy: cfg.proxyUrl,
                noProxy: mergeBypassList(cfg.proxyBypass),
            });
            ownsDispatcher = true;
        } else {
            dispatcher = new undici.Agent();
            ownsDispatcher = true;
        }
    }

    const started = Date.now();
    const testUrl = 'https://www.github.com/';
    try {
        const res = await undici.request(testUrl, {
            method: 'HEAD',
            headersTimeout: 15000,
            bodyTimeout: 15000,
            ...(dispatcher ? { dispatcher } : {}),
        });
        try {
            if (typeof res.body.dump === 'function') await res.body.dump();
            else await res.body.text();
        } catch { /* ignore */ }
        const ms = Date.now() - started;
        const viaProxy = isProxyActive(cfg);
        if (res.statusCode >= 200 && res.statusCode < 500) {
            return {
                ok: true,
                status: res.statusCode,
                latencyMs: ms,
                viaProxy,
                proxyUrl: viaProxy ? cfg.proxyUrl : '',
                message: viaProxy
                    ? `代理可用（HTTP ${res.statusCode}，${ms} ms）`
                    : `直连可用（HTTP ${res.statusCode}，${ms} ms）`,
            };
        }
        return {
            ok: false,
            status: res.statusCode,
            latencyMs: ms,
            error: `探测失败 HTTP ${res.statusCode}`,
            code: 'http_error',
        };
    } catch (err) {
        return {
            ok: false,
            error: err?.message || String(err),
            code: err?.code || 'network',
            viaProxy: isProxyActive(cfg),
        };
    } finally {
        if (ownsDispatcher && dispatcher && typeof dispatcher.close === 'function') {
            try { await dispatcher.close(); } catch { /* ignore */ }
        }
    }
}

function resolveHfProbeUrl(endpoint = '') {
    let base = String(endpoint || '').trim().replace(/\/+$/, '');
    if (!base) base = 'https://huggingface.co';
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(base)) {
        base = `https://${base}`;
    }
    try {
        const u = new URL(base);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
            return { ok: false, error: '镜像地址仅支持 http/https' };
        }
        return { ok: true, url: u.toString().replace(/\/$/, '') };
    } catch {
        return { ok: false, error: '镜像地址无效' };
    }
}

/**
 * Probe Hugging Face hub / mirror reachability.
 * @param {{ hfEndpoint?: string, proxyEnabled?: boolean, proxyUrl?: string, proxyBypass?: string }} [options]
 */
async function testHfEndpointConnectivity(options = {}) {
    const resolved = resolveHfProbeUrl(options.hfEndpoint);
    if (!resolved.ok) {
        return { ok: false, error: resolved.error, code: 'invalid_url' };
    }

    const cfg = normalizeProxyOptions(options);
    if (cfg.proxyEnabled && cfg.proxyUrl && !isHttpProxyUrl(cfg.proxyUrl)) {
        return {
            ok: false,
            error: '当前表单代理不是 HTTP/HTTPS，无法用于探测。请先修正代理地址，或关闭代理后再测。',
            code: 'unsupported_proxy',
        };
    }

    const undici = loadUndici();
    let dispatcher = null;
    let ownsDispatcher = false;
    if (Object.prototype.hasOwnProperty.call(options, 'proxyEnabled')
        || Object.prototype.hasOwnProperty.call(options, 'proxyUrl')) {
        if (isProxyActive(cfg)) {
            dispatcher = new undici.EnvHttpProxyAgent({
                httpProxy: cfg.proxyUrl,
                httpsProxy: cfg.proxyUrl,
                noProxy: mergeBypassList(cfg.proxyBypass),
            });
        } else {
            dispatcher = new undici.Agent();
        }
        ownsDispatcher = true;
    }

    const started = Date.now();
    const label = String(options.hfEndpoint || '').trim()
        ? resolved.url
        : '官方 Hub（huggingface.co）';

    async function probe(method) {
        const res = await undici.request(resolved.url, {
            method,
            headers: {
                Accept: '*/*',
                'User-Agent': 'Transub-Network-Test/2.0',
            },
            headersTimeout: 15000,
            bodyTimeout: 15000,
            ...(dispatcher ? { dispatcher } : {}),
        });
        try {
            if (typeof res.body.dump === 'function') await res.body.dump();
            else await res.body.text();
        } catch { /* ignore */ }
        return res;
    }

    try {
        let res;
        try {
            res = await probe('HEAD');
            // Some mirrors reject HEAD
            if (res.statusCode === 405 || res.statusCode === 501) {
                res = await probe('GET');
            }
        } catch (headErr) {
            try {
                res = await probe('GET');
            } catch {
                throw headErr;
            }
        }
        const ms = Date.now() - started;
        const viaProxy = ownsDispatcher ? isProxyActive(cfg) : !!getActiveProxy();
        if (res.statusCode >= 200 && res.statusCode < 500) {
            return {
                ok: true,
                status: res.statusCode,
                latencyMs: ms,
                url: resolved.url,
                viaProxy,
                message: `${label} 可用（HTTP ${res.statusCode}，${ms} ms）${viaProxy ? ' · 经代理' : ''}`,
            };
        }
        return {
            ok: false,
            status: res.statusCode,
            latencyMs: ms,
            url: resolved.url,
            error: `${label} 探测失败 HTTP ${res.statusCode}`,
            code: 'http_error',
        };
    } catch (err) {
        return {
            ok: false,
            error: err?.message || String(err),
            code: err?.code || 'network',
            url: resolved.url,
        };
    } finally {
        if (ownsDispatcher && dispatcher && typeof dispatcher.close === 'function') {
            try { await dispatcher.close(); } catch { /* ignore */ }
        }
    }
}

module.exports = {
    DEFAULT_BYPASS,
    normalizeProxyOptions,
    isHttpProxyUrl,
    isProxyActive,
    mergeBypassList,
    hostMatchesBypass,
    applyProxyToEnv,
    applyProxyFromSettings,
    getActiveProxy,
    getDownloadAgents,
    testProxyConnectivity,
    resolveHfProbeUrl,
    testHfEndpointConnectivity,
};
