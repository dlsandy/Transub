const path = require('path');

const EDITABLE_SUBTITLE_EXTS = new Set(['.srt', '.vtt', '.lrc']);
const VIDEO_FILE_EXTS = new Set([
    '.mp4', '.m4v', '.webm', '.mkv', '.avi', '.mov', '.wmv', '.flv',
    '.ts', '.mpeg', '.mpg', '.3gp',
]);

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

/**
 * Normalize and reject obviously unsafe path strings before filesystem use.
 * Does not restrict to a root — desktop apps open user-chosen files anywhere —
 * but blocks null bytes and empty paths, and optionally enforces extensions.
 */
function assertUserFilePath(inputPath, { allowedExts = null, label = '文件' } = {}) {
    const raw = asString(inputPath, 4096).trim();
    if (!raw) throw new Error(`缺少${label}路径`);
    if (raw.includes('\0')) throw new Error(`${label}路径非法`);
    const resolved = path.resolve(raw);
    if (!resolved || resolved.includes('\0')) throw new Error(`${label}路径非法`);
    if (allowedExts && allowedExts.size) {
        const ext = path.extname(resolved).toLowerCase();
        if (!allowedExts.has(ext)) {
            throw new Error(`${label}扩展名不受支持: ${ext || '(无)'}`);
        }
    }
    return resolved;
}

function assertEditableSubtitlePath(inputPath) {
    return assertUserFilePath(inputPath, {
        allowedExts: EDITABLE_SUBTITLE_EXTS,
        label: '字幕',
    });
}

function assertSubtitleMetaPath(inputPath) {
    return assertUserFilePath(inputPath, {
        allowedExts: EDITABLE_SUBTITLE_EXTS,
        label: '字幕元数据',
    });
}

function assertVideoFilePath(inputPath) {
    return assertUserFilePath(inputPath, {
        allowedExts: VIDEO_FILE_EXTS,
        label: '视频',
    });
}

/** Only allow http(s) for shell.openExternal — blocks file:, javascript:, etc. */
function isSafeExternalUrl(url) {
    const raw = asString(url, 4096).trim();
    if (!raw) return false;
    let parsed;
    try {
        parsed = new URL(raw);
    } catch {
        return false;
    }
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
}

function assertSafeExternalUrl(url) {
    const raw = asString(url, 4096).trim();
    if (!raw) throw new Error('缺少 URL');
    if (!isSafeExternalUrl(raw)) throw new Error('仅允许打开 http/https 链接');
    return raw;
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
    EDITABLE_SUBTITLE_EXTS,
    VIDEO_FILE_EXTS,
    asString,
    asOptionalString,
    asNumber,
    asPlainObject,
    asStringArray,
    resolveSafePath,
    assertUserFilePath,
    assertEditableSubtitlePath,
    assertSubtitleMetaPath,
    assertVideoFilePath,
    isSafeExternalUrl,
    assertSafeExternalUrl,
    validateFetchOptions,
};
