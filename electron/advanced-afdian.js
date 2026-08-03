/**
 * Afdian fulfillment + hard device-limit client.
 */
const DEFAULT_AFDIAN_FULFILL_URL = 'https://pay.kimtem.net';
const FALLBACK_AFDIAN_FULFILL_URLS = [
    'https://transub-afdian.transubafdian.workers.dev',
];
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

function formatNetworkError(err, actionLabel = '领取') {
    if (!err) return `${actionLabel}请求失败`;
    if (err.name === 'AbortError') return `${actionLabel}超时，请稍后重试`;
    const cause = err.cause || {};
    const code = String(cause.code || err.code || '').toUpperCase();
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
        return '无法解析许可服务器域名，请检查网络或 DNS（可尝试 1.1.1.1）';
    }
    if (code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'UND_ERR_HEADERS_TIMEOUT') {
        return '连接许可服务器超时，请稍后重试或检查代理';
    }
    if (code === 'ECONNREFUSED' || code === 'ECONNRESET') {
        return '许可服务器连接被重置，请检查代理或防火墙';
    }
    if (code === 'CERT_HAS_EXPIRED' || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
        return '许可服务器证书校验失败';
    }
    const detail = String(cause.message || err.message || '').trim() || `${actionLabel}请求失败`;
    if (detail === 'fetch failed' || detail === 'Failed to fetch') {
        return '无法连接许可服务器。请浏览器打开 https://pay.kimtem.net/health 自检；若失败请检查网络/代理';
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

function buildHeaders() {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    const secret = redeemSecret();
    if (secret) headers['X-Transub-Redeem-Secret'] = secret;
    return headers;
}

/**
 * POST JSON to fulfill service with primary + fallback hosts.
 */
async function postFulfill(pathName, body, opts = {}) {
    const label = opts.actionLabel || '请求';
    const bases = Array.isArray(opts.bases) && opts.bases.length
        ? opts.bases.map((b) => String(b || '').trim().replace(/\/+$/, '')).filter(Boolean)
        : fulfillUrlCandidates();
    if (!bases.length) {
        return {
            ok: false,
            error: '未配置许可服务地址（TRANSUB_AFDIAN_FULFILL_URL）',
            code: 'misconfigured',
        };
    }

    const fetchImpl = resolveFetchImpl(opts.fetchImpl);
    if (!fetchImpl) {
        return { ok: false, error: '当前环境不支持联网许可', code: 'misconfigured' };
    }

    const timeoutMs = Math.max(3000, Number(opts.timeoutMs) || 20000);
    const headers = buildHeaders();
    let lastNetworkError = null;

    for (let i = 0; i < bases.length; i += 1) {
        const base = bases[i];
        let url;
        try {
            url = new URL(pathName, `${base}/`);
        } catch (_) {
            lastNetworkError = new Error('许可服务地址无效');
            continue;
        }

        const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = ac ? setTimeout(() => ac.abort(), timeoutMs) : null;
        let res;
        try {
            res = await fetchImpl(url.toString(), {
                method: 'POST',
                headers,
                body: JSON.stringify(body || {}),
                signal: ac?.signal,
            });
        } catch (err) {
            lastNetworkError = err;
            if (isRetryableNetworkError(err) && i < bases.length - 1) continue;
            return {
                ok: false,
                error: formatNetworkError(err, label),
                code: err?.name === 'AbortError' ? 'timeout' : 'network',
            };
        } finally {
            if (timer) clearTimeout(timer);
        }

        let json;
        try {
            json = await res.json();
        } catch (_) {
            return { ok: false, error: `许可服务响应无效 (HTTP ${res.status})`, code: 'bad_response' };
        }

        if (!json?.ok) {
            return {
                ok: false,
                error: json?.error || `${label}失败 (HTTP ${res.status})`,
                code: json?.code || 'request_failed',
                hint: json?.hint,
                retryAt: json?.retryAt,
                retryInMs: json?.retryInMs,
                devices: json?.devices,
                lastTransferAt: json?.lastTransferAt,
                maxDevices: json?.maxDevices,
                status: res.status,
            };
        }

        return { ...json, ok: true, fulfillBase: base };
    }

    return {
        ok: false,
        error: formatNetworkError(lastNetworkError, label),
        code: 'network',
    };
}

async function redeemLicenseByOrder(outTradeNo, opts = {}) {
    const no = String(outTradeNo || '').trim();
    if (!no) return { ok: false, error: '请填写爱发电订单号', code: 'bad_request' };
    return postFulfill('/redeem', { outTradeNo: no }, { ...opts, actionLabel: '领取' });
}

async function bindLicenseDevice({ licenseKey, deviceId, label = '' }, opts = {}) {
    const key = String(licenseKey || '').trim();
    const id = String(deviceId || '').trim();
    if (!key) return { ok: false, error: '缺少许可密钥', code: 'bad_request' };
    if (!id) return { ok: false, error: '缺少设备标识', code: 'bad_request' };
    return postFulfill('/license/bind', { licenseKey: key, deviceId: id, label }, {
        ...opts,
        actionLabel: '激活绑定',
    });
}

async function transferLicenseDevice({ licenseKey, deviceId, label = '' }, opts = {}) {
    const key = String(licenseKey || '').trim();
    const id = String(deviceId || '').trim();
    if (!key) return { ok: false, error: '缺少许可密钥', code: 'bad_request' };
    if (!id) return { ok: false, error: '缺少设备标识', code: 'bad_request' };
    return postFulfill('/license/transfer', { licenseKey: key, deviceId: id, label }, {
        ...opts,
        actionLabel: '换机',
    });
}

async function revalidateLicenseDevice({ licenseKey, deviceId }, opts = {}) {
    const key = String(licenseKey || '').trim();
    const id = String(deviceId || '').trim();
    if (!key) return { ok: false, error: '缺少许可密钥', code: 'bad_request' };
    if (!id) return { ok: false, error: '缺少设备标识', code: 'bad_request' };
    return postFulfill('/license/revalidate', { licenseKey: key, deviceId: id }, {
        ...opts,
        actionLabel: '复核',
    });
}

async function unbindLicenseDevice({ licenseKey, deviceId }, opts = {}) {
    const key = String(licenseKey || '').trim();
    const id = String(deviceId || '').trim();
    if (!key || !id) return { ok: true, skipped: true };
    return postFulfill('/license/unbind', { licenseKey: key, deviceId: id }, {
        ...opts,
        actionLabel: '解绑',
        timeoutMs: opts.timeoutMs || 10000,
    });
}

module.exports = {
    DEFAULT_AFDIAN_FULFILL_URL,
    FALLBACK_AFDIAN_FULFILL_URLS,
    fulfillBaseUrl,
    fulfillUrlCandidates,
    redeemSecret,
    formatNetworkError,
    postFulfill,
    redeemLicenseByOrder,
    bindLicenseDevice,
    transferLicenseDevice,
    revalidateLicenseDevice,
    unbindLicenseDevice,
};
