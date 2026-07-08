const path = require('path');

function asString(value, maxLen = 8192) {
    if (value == null) return '';
    const s = String(value);
    return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function asOptionalString(value, maxLen = 8192) {
    if (value == null) return undefined;
    return asString(value, maxLen);
}

function asNumber(value, { min = -Infinity, max = Infinity, fallback = 0 } = {}) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

function asPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value;
}

function asStringArray(value, maxItems = 500) {
    if (!Array.isArray(value)) return [];
    return value.slice(0, maxItems).map((v) => asString(v, 4096));
}

function resolveSafePath(inputPath, allowedRoots = []) {
    const resolved = path.resolve(asString(inputPath, 4096));
    if (!allowedRoots.length) return resolved;
    for (const root of allowedRoots) {
        const base = path.resolve(root);
        if (resolved === base || resolved.startsWith(base + path.sep)) {
            return resolved;
        }
    }
    throw new Error('路径不在允许范围内');
}

function validateFetchOptions(options = {}) {
    const opts = asPlainObject(options);
    const out = {
        method: asString(opts.method || 'GET', 16).toUpperCase() || 'GET',
        referrer: asOptionalString(opts.referrer, 2048),
        siteReferer: asOptionalString(opts.siteReferer, 2048),
        proxy: asOptionalString(opts.proxy, 512),
    };
    if (opts.headers && typeof opts.headers === 'object' && !Array.isArray(opts.headers)) {
        out.headers = {};
        for (const [k, v] of Object.entries(opts.headers)) {
            if (Object.keys(out.headers).length >= 32) break;
            out.headers[asString(k, 128)] = asString(v, 2048);
        }
    }
    if (opts.body != null) {
        out.body = asString(opts.body, 512 * 1024);
    }
    return out;
}

module.exports = {
    asString,
    asOptionalString,
    asNumber,
    asPlainObject,
    asStringArray,
    resolveSafePath,
    validateFetchOptions,
};
