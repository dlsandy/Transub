/**
 * Afdian fulfillment client: redeem Pro license by out_trade_no.
 */
const DEFAULT_AFDIAN_FULFILL_URL = 'https://pay.kimtem.net';
/** Tried in order when primary fails with a network error */
const FALLBACK_AFDIAN_FULFILL_URLS = [
    'https://transub-afdian.transubafdian.workers.dev',
];
/** Optional shared secret; must match Worker REDEEM_SHARED_SECRET when set */
const DEFAULT_REDEEM_SECRET = '';

function fulfillBaseUrl() {
    const fromEnv = String(process.env.TRANSUB_AFDIAN_FULFILL_URL || '').trim().replace(/\/+$/, '');
    if (fromEnv) return fromEnv;
    return String(DEFAULT_AFDIAN_FULFILL_URL || '').trim().replace(/\/+$/, '');
}

function fulfillUrlCandidates() {
    const primary = fulfillBaseUrl();
    const fromEnvFallbacks = String(process.env.TRANSUB_AFDIAN_FULFILL_FALLBACKS || '')
        .split(/[,;\s]+/)
        .map((s) => s.trim().replace(/\/+$/, ''))
        .filter(Boolean);
    const list = [primary, ...fromEnvFallbacks, ...FALLBACK_AFDIAN_FULFILL_URLS];
    const out = [];
    const seen = new Set();
    for (const u of list) {
        if (!u || seen.has(u)) continue;
        seen.add(u);
        out.push(u);
    }
    return out;
}

function redeemSecret() {
    const fromEnv = String(process.env.TRANSUB_AFDIAN_REDEEM_SECRET || '').trim();
    if (fromEnv) return fromEnv;
    return String(DEFAULT_REDEEM_SECRET || '').trim();
}

function resolveFetchImpl(custom) {
    if (custom) return custom;
    try {
        const { net } = require('electron');
        if (typeof net?.fetch === 'function') {
            return net.fetch.bind(net);
        }
    } catch (_) { /* not in Electron / tests */ }
    return typeof fetch === 'function' ? fetch : null;
}

function formatNetworkError(err) {
    if (!err) return '领取请求失败';
    if (err.name === 'AbortError') return '领取超时，请稍后重试';
    const cause = err.cause || {};
    const code = String(cause.code || err.code || '').toUpperCase();
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
        return '无法解析领取服务器域名，请检查网络或 DNS（可尝试 1.1.1.1）';
    }
    if (code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'UND_ERR_HEADERS_TIMEOUT') {
        return '连接领取服务器超时，请稍后重试或检查代理';
    }
    if (code === 'ECONNREFUSED' || code === 'ECONNRESET') {
        return '领取服务器连接被重置，请检查代理或防火墙';
    }
    if (code === 'CERT_HAS_EXPIRED' || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
        return '领取服务器证书校验失败';
    }
    const detail = String(cause.message || err.message || '').trim() || '领取请求失败';
    if (detail === 'fetch failed' || detail === 'Failed to fetch') {
        return '无法连接领取服务器。请浏览器打开 https://pay.kimtem.net/health 自检；若失败请检查网络/代理，或稍后重试';
    }
    return detail;
}

function isRetryableNetworkError(err) {
    if (!err || err.name === 'AbortError') return false;
    const cause = err.cause || {};
    const code = String(cause.code || err.code || '').toUpperCase();
    if (['ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET',
        'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_SOCKET'].includes(code)) {
        return true;
    }
    const detail = String(cause.message || err.message || '');
    return detail === 'fetch failed' || detail === 'Failed to fetch' || /network/i.test(detail);
}

/**
 * @param {string} outTradeNo
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number, bases?: string[] }} [opts]
 * @returns {Promise<{ ok: true, licenseKey: string, licenseId?: string, outTradeNo?: string, cached?: boolean }
 *   | { ok: false, error: string, code?: string }>}
 */
async function redeemLicenseByOrder(outTradeNo, opts = {}) {
    const no = String(outTradeNo || '').trim();
    if (!no) return { ok: false, error: '请填写爱发电订单号', code: 'bad_request' };

    const bases = Array.isArray(opts.bases) && opts.bases.length
        ? opts.bases.map((b) => String(b || '').trim().replace(/\/+$/, '')).filter(Boolean)
        : fulfillUrlCandidates();
    if (!bases.length) {
        return {
            ok: false,
            error: '未配置领取服务地址（TRANSUB_AFDIAN_FULFILL_URL）',
            code: 'misconfigured',
        };
    }

    const fetchImpl = resolveFetchImpl(opts.fetchImpl);
    if (!fetchImpl) {
        return { ok: false, error: '当前环境不支持联网领取', code: 'misconfigured' };
    }

    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    const secret = redeemSecret();
    if (secret) headers['X-Transub-Redeem-Secret'] = secret;

    const timeoutMs = Math.max(3000, Number(opts.timeoutMs) || 20000);
    let lastNetworkError = null;

    for (let i = 0; i < bases.length; i += 1) {
        const base = bases[i];
        let url;
        try {
            url = new URL('/redeem', `${base}/`);
        } catch (_) {
            lastNetworkError = new Error('领取服务地址无效');
            continue;
        }

        const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = ac ? setTimeout(() => ac.abort(), timeoutMs) : null;
        let res;
        try {
            res = await fetchImpl(url.toString(), {
                method: 'POST',
                headers,
                body: JSON.stringify({ outTradeNo: no }),
                signal: ac?.signal,
            });
        } catch (err) {
            lastNetworkError = err;
            if (isRetryableNetworkError(err) && i < bases.length - 1) continue;
            return {
                ok: false,
                error: formatNetworkError(err),
                code: err?.name === 'AbortError' ? 'timeout' : 'network',
            };
        } finally {
            if (timer) clearTimeout(timer);
        }

        let json;
        try {
            json = await res.json();
        } catch (_) {
            return { ok: false, error: `领取服务响应无效 (HTTP ${res.status})`, code: 'bad_response' };
        }

        if (!json?.ok || !String(json.licenseKey || '').trim()) {
            return {
                ok: false,
                error: json?.error || `领取失败 (HTTP ${res.status})`,
                code: json?.code || 'redeem_failed',
            };
        }

        return {
            ok: true,
            licenseKey: String(json.licenseKey).trim(),
            licenseId: json.licenseId ? String(json.licenseId) : undefined,
            outTradeNo: json.outTradeNo ? String(json.outTradeNo) : no,
            cached: !!json.cached,
            fulfillBase: base,
        };
    }

    return {
        ok: false,
        error: formatNetworkError(lastNetworkError),
        code: 'network',
    };
}

module.exports = {
    DEFAULT_AFDIAN_FULFILL_URL,
    FALLBACK_AFDIAN_FULFILL_URLS,
    fulfillBaseUrl,
    fulfillUrlCandidates,
    redeemSecret,
    formatNetworkError,
    redeemLicenseByOrder,
};
