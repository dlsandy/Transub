'use strict';

/**
 * GitHub download mirror prefixes (CN / regional).
 * Each prefix is prepended to the original https://github.com/... URL, e.g.
 *   https://gh.monlor.com/ + https://github.com/org/repo/...
 *
 * Defaults are periodically re-verified; dead presets are migrated away in
 * `migrateLegacyGithubMirrorDefaults`.
 */

const DEFAULT_GITHUB_MIRROR_PREFIXES = [
    'https://g.blfrp.cn/',
    'https://gh-proxy.com/',
    'https://gh.nxnow.top/',
    'https://ghproxy.net/',
];

/**
 * Exact previous shipped default sets — auto-replace on load when the user
 * still has one of these verbatim (custom lists are left alone).
 */
const LEGACY_GITHUB_MIRROR_DEFAULT_SETS = [
    ['https://ghfast.top/', 'https://mirror.ghproxy.com/'],
    ['https://gh.monlor.com/', 'https://ghproxy.net/'],
];

/** @deprecated keep export name for older requires / tests */
const LEGACY_DEAD_GITHUB_MIRROR_DEFAULTS = LEGACY_GITHUB_MIRROR_DEFAULT_SETS[0];

/** Small public release asset used by connectivity / speed tests. */
const GITHUB_MIRROR_PROBE_FILE = 'https://github.com/cli/cli/releases/download/v2.62.0/gh_2.62.0_checksums.txt';

/** Per-target probe budget (connect + headers + body). Keep short so the UI does not look frozen. */
const GITHUB_MIRROR_PROBE_TIMEOUT_MS = 8000;

const MAX_MIRRORS = 24;
const MAX_PREFIX_LEN = 512;

function loadUndici() {
    try {
        return require('undici');
    } catch (err) {
        throw new Error(`无法加载 undici（GitHub 镜像测速需要）：${err.message || err}`);
    }
}

function githubProbeConnectOptions() {
    return { timeout: GITHUB_MIRROR_PROBE_TIMEOUT_MS, family: 4 };
}

function createGithubProbeDispatcher(undici, cfg) {
    const { isProxyActive, mergeBypassList } = require('./proxy-settings');
    const connect = githubProbeConnectOptions();
    if (isProxyActive(cfg)) {
        return new undici.EnvHttpProxyAgent({
            httpProxy: cfg.proxyUrl,
            httpsProxy: cfg.proxyUrl,
            noProxy: mergeBypassList(cfg.proxyBypass),
            connect,
        });
    }
    return new undici.Agent({
        connect,
        headersTimeout: GITHUB_MIRROR_PROBE_TIMEOUT_MS,
        bodyTimeout: GITHUB_MIRROR_PROBE_TIMEOUT_MS,
    });
}

function asString(value, maxLen = MAX_PREFIX_LEN) {
    return String(value == null ? '' : value).trim().slice(0, maxLen);
}

/**
 * Normalize one mirror prefix to `https://host.../` form (trailing slash).
 * @param {string} raw
 * @returns {string}
 */
function normalizeGithubMirrorPrefix(raw) {
    let s = asString(raw, MAX_PREFIX_LEN);
    if (!s) return '';
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
        s = `https://${s}`;
    }
    try {
        const u = new URL(s);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
        // Drop accidental query/hash; keep path (some mirrors use path prefix).
        let out = `${u.protocol}//${u.host}${u.pathname || '/'}`;
        if (!out.endsWith('/')) out += '/';
        return out.slice(0, MAX_PREFIX_LEN);
    } catch {
        return '';
    }
}

/**
 * @param {string|string[]|null|undefined} input
 * @returns {string[]}
 */
function normalizeGithubMirrorPrefixes(input) {
    let lines = [];
    if (Array.isArray(input)) {
        lines = input.map((x) => String(x == null ? '' : x));
    } else if (input == null) {
        return [...DEFAULT_GITHUB_MIRROR_PREFIXES];
    } else {
        lines = String(input).split(/\r?\n/);
    }
    const out = [];
    const seen = new Set();
    for (const line of lines) {
        const n = normalizeGithubMirrorPrefix(line);
        if (!n || seen.has(n)) continue;
        seen.add(n);
        out.push(n);
        if (out.length >= MAX_MIRRORS) break;
    }
    return out;
}

/**
 * Parse textarea text. Empty textarea → empty list (user cleared mirrors).
 * @param {string} text
 * @returns {string[]}
 */
function parseGithubMirrorsText(text) {
    const raw = String(text == null ? '' : text);
    if (!raw.trim()) return [];
    return normalizeGithubMirrorPrefixes(raw.split(/\r?\n/));
}

/**
 * @param {string[]|null|undefined} list
 * @returns {string}
 */
function formatGithubMirrorsText(list) {
    const arr = Array.isArray(list) ? list : normalizeGithubMirrorPrefixes(list);
    return arr.join('\n');
}

/**
 * If the saved list is exactly an old shipped default set, swap to current defaults.
 * Custom user lists (even if they include a dead host) are left untouched.
 * @param {string[]} list
 * @returns {string[]}
 */
function migrateLegacyGithubMirrorDefaults(list) {
    const arr = Array.isArray(list) ? list.map((x) => String(x || '').trim()).filter(Boolean) : [];
    const key = arr.slice().sort().join('\n');
    for (const legacy of LEGACY_GITHUB_MIRROR_DEFAULT_SETS) {
        if (arr.length !== legacy.length) continue;
        if (key === legacy.slice().sort().join('\n')) {
            return [...DEFAULT_GITHUB_MIRROR_PREFIXES];
        }
    }
    return arr;
}

/**
 * Build candidate download URLs for a GitHub (or objects.githubusercontent) URL.
 * @param {string} url
 * @param {string[]} [prefixes]
 * @returns {string[]}
 */
function expandWithGithubMirrors(url, prefixes = DEFAULT_GITHUB_MIRROR_PREFIXES) {
    const raw = asString(url, 4096);
    if (!raw) return [];
    const list = [];
    try {
        const u = new URL(raw);
        const host = u.hostname.toLowerCase();
        const isGithub = host === 'github.com'
            || host === 'objects.githubusercontent.com'
            || host === 'release-assets.githubusercontent.com'
            || host.endsWith('.githubusercontent.com');
        if (isGithub) {
            for (const prefix of prefixes || []) {
                const p = normalizeGithubMirrorPrefix(prefix);
                if (!p) continue;
                list.push(`${p.replace(/\/+$/, '')}/${raw}`);
            }
        }
    } catch (_) { /* ignore */ }
    return [...new Set(list)];
}

function loadGithubMirrorPrefixesFromSettings() {
    try {
        const { loadSettings } = require('./settings-data');
        const opts = loadSettings()?.options || {};
        if (Object.prototype.hasOwnProperty.call(opts, 'githubMirrorUrls')) {
            const raw = opts.githubMirrorUrls;
            // Empty list is intentional (official only); null/undefined → treat as empty text.
            const normalized = normalizeGithubMirrorPrefixes(
                Array.isArray(raw) ? raw : String(raw == null ? '' : raw).split(/\r?\n/),
            );
            return migrateLegacyGithubMirrorDefaults(normalized);
        }
    } catch (_) { /* ignore */ }
    return [...DEFAULT_GITHUB_MIRROR_PREFIXES];
}

function mirrorLabel(prefixOrUrl) {
    const s = String(prefixOrUrl || '');
    try {
        return new URL(s.includes('://') ? s : `https://${s}`).hostname || s;
    } catch {
        return s.slice(0, 48) || '镜像';
    }
}

function buildMirrorProbeUrl(prefix) {
    const p = normalizeGithubMirrorPrefix(prefix);
    if (!p) return '';
    return `${p.replace(/\/+$/, '')}/${GITHUB_MIRROR_PROBE_FILE}`;
}

/**
 * Probe one URL (GET + Range) with optional proxy from options.
 * @param {string} testUrl
 * @param {object} options proxy fields
 * @param {import('undici').Dispatcher|null} dispatcher
 */
async function probeUrlLatency(testUrl, options, dispatcher) {
    const undici = loadUndici();
    const started = Date.now();
    const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(GITHUB_MIRROR_PROBE_TIMEOUT_MS)
        : undefined;
    try {
        const res = await undici.request(testUrl, {
            method: 'GET',
            headersTimeout: GITHUB_MIRROR_PROBE_TIMEOUT_MS,
            bodyTimeout: GITHUB_MIRROR_PROBE_TIMEOUT_MS,
            headers: {
                'User-Agent': 'Transub-GithubMirrorProbe',
                Accept: '*/*',
                Range: 'bytes=0-255',
            },
            ...(signal ? { signal } : {}),
            ...(dispatcher ? { dispatcher } : {}),
        });
        let sample = '';
        try {
            sample = String(await res.body.text()).slice(0, 256);
        } catch { /* ignore */ }
        const ms = Date.now() - started;
        const status = res.statusCode;
        // 3xx = reachable (release assets often redirect to objects.githubusercontent.com).
        if (status >= 300 && status < 400) {
            return { ok: true, status, latencyMs: ms };
        }
        const looksHtml = /<!DOCTYPE|<html[\s>]/i.test(sample);
        const looksPayload = sample.length > 16 && !looksHtml;
        const ok = status >= 200 && status < 400 && looksPayload;
        return {
            ok,
            status,
            latencyMs: ms,
            error: ok
                ? undefined
                : (looksHtml
                    ? '返回了网页而非文件'
                    : (status >= 400 ? `HTTP ${status}` : '无有效内容')),
        };
    } catch (err) {
        return {
            ok: false,
            latencyMs: Date.now() - started,
            error: err?.message || String(err),
            code: err?.code || 'network',
        };
    }
}

/**
 * Speed-test configured GitHub mirrors (+ official github.com baseline).
 * @param {{
 *   mirrors?: string|string[],
 *   includeOfficial?: boolean,
 *   proxyEnabled?: boolean,
 *   proxyUrl?: string,
 *   proxyBypass?: string,
 * }} [options]
 */
async function testGithubMirrorsConnectivity(options = {}) {
    const { normalizeProxyOptions, isProxyActive, isHttpProxyUrl } = require('./proxy-settings');
    const cfg = normalizeProxyOptions(options);
    if (cfg.proxyEnabled && cfg.proxyUrl && !isHttpProxyUrl(cfg.proxyUrl)) {
        return {
            ok: false,
            error: '当前表单代理不是 HTTP/HTTPS，无法用于测速。请先修正代理地址，或关闭代理后再测。',
            code: 'unsupported_proxy',
            results: [],
        };
    }

    let mirrors;
    if (Object.prototype.hasOwnProperty.call(options, 'mirrors')
        || Object.prototype.hasOwnProperty.call(options, 'githubMirrorUrls')) {
        const raw = options.mirrors != null ? options.mirrors : options.githubMirrorUrls;
        mirrors = Array.isArray(raw) || String(raw || '').trim()
            ? normalizeGithubMirrorPrefixes(Array.isArray(raw) ? raw : String(raw).split(/\r?\n/))
            : [];
    } else {
        mirrors = loadGithubMirrorPrefixesFromSettings();
    }

    const includeOfficial = options.includeOfficial !== false;
    const targets = [];
    if (includeOfficial) {
        targets.push({
            kind: 'official',
            label: 'GitHub 官方',
            prefix: '',
            probeUrl: GITHUB_MIRROR_PROBE_FILE,
        });
    }
    for (const prefix of mirrors) {
        const probeUrl = buildMirrorProbeUrl(prefix);
        if (!probeUrl) continue;
        targets.push({
            kind: 'mirror',
            label: mirrorLabel(prefix),
            prefix,
            probeUrl,
        });
    }

    if (!targets.length) {
        return {
            ok: false,
            error: '没有可测速的镜像（请至少填写一行镜像前缀，或保留「官方」对照）',
            code: 'empty',
            results: [],
        };
    }

    const undici = loadUndici();
    const dispatcher = createGithubProbeDispatcher(undici, cfg);
    const viaProxy = isProxyActive(cfg);
    try {
        const results = await Promise.all(targets.map(async (t) => {
            const probed = await probeUrlLatency(t.probeUrl, options, dispatcher);
            return {
                kind: t.kind,
                label: t.label,
                prefix: t.prefix || undefined,
                url: t.probeUrl,
                ok: !!probed.ok,
                status: probed.status,
                latencyMs: probed.latencyMs,
                error: probed.error,
                viaProxy,
                message: probed.ok
                    ? `${t.label} 可用（${probed.latencyMs} ms）`
                    : `${t.label} 失败（${probed.error || '网络错误'}）`,
            };
        }));
        const okOnes = results.filter((r) => r.ok).sort((a, b) => a.latencyMs - b.latencyMs);
        const fastest = okOnes[0] || null;
        return {
            ok: okOnes.length > 0,
            results,
            fastest: fastest
                ? { label: fastest.label, latencyMs: fastest.latencyMs, prefix: fastest.prefix, kind: fastest.kind }
                : null,
            viaProxy,
            message: fastest
                ? `测速完成 · 最快 ${fastest.label}（${fastest.latencyMs} ms）${viaProxy ? ' · 经代理' : ''}`
                : `测速完成 · 全部失败${viaProxy ? ' · 经代理' : ''}`,
        };
    } finally {
        if (dispatcher && typeof dispatcher.close === 'function') {
            try { await dispatcher.close(); } catch { /* ignore */ }
        }
    }
}

module.exports = {
    DEFAULT_GITHUB_MIRROR_PREFIXES,
    LEGACY_GITHUB_MIRROR_DEFAULT_SETS,
    LEGACY_DEAD_GITHUB_MIRROR_DEFAULTS,
    GITHUB_MIRROR_PROBE_FILE,
    GITHUB_MIRROR_PROBE_TIMEOUT_MS,
    normalizeGithubMirrorPrefix,
    normalizeGithubMirrorPrefixes,
    parseGithubMirrorsText,
    formatGithubMirrorsText,
    migrateLegacyGithubMirrorDefaults,
    expandWithGithubMirrors,
    loadGithubMirrorPrefixesFromSettings,
    mirrorLabel,
    buildMirrorProbeUrl,
    testGithubMirrorsConnectivity,
};
