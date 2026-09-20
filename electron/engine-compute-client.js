/**
 * Engine product compute lock client (/v1/compute/*).
 * Sync helpers for desktop compute-task-lock (tryAcquire is sync today).
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { engineFetch, getCapabilities, joinUrl } = require('./engine-client');

const COMPUTE_FEATURE = 'computeLock';

const SYNC_HELPER = `
const http = require('http');
const https = require('https');
const { URL } = require('url');
const method = String(process.argv[2] || 'GET').toUpperCase();
const urlStr = String(process.argv[3] || '');
const rawBody = process.argv[4] || '';
const timeoutMs = Math.max(1000, Number(process.argv[5]) || 8000);
let settled = false;
function finish(obj) {
  if (settled) return;
  settled = true;
  process.stdout.write(JSON.stringify(obj));
  process.exit(0);
}
try {
  const u = new URL(urlStr);
  const lib = u.protocol === 'https:' ? https : http;
  const req = lib.request({
    protocol: u.protocol,
    hostname: u.hostname,
    port: u.port || (u.protocol === 'https:' ? 443 : 80),
    path: (u.pathname || '/') + (u.search || ''),
    method,
    headers: {
      Accept: 'application/json',
      ...(rawBody ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(rawBody),
      } : {}),
    },
    timeout: timeoutMs,
  }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => {
      finish({
        status: res.statusCode || 0,
        body: Buffer.concat(chunks).toString('utf8'),
      });
    });
  });
  req.on('timeout', () => {
    req.destroy();
    finish({ status: 0, error: 'timeout' });
  });
  req.on('error', (e) => finish({ status: 0, error: String(e && e.message ? e.message : e) }));
  if (rawBody) req.write(rawBody);
  req.end();
} catch (e) {
  finish({ status: 0, error: String(e && e.message ? e.message : e) });
}
`;

let helperPath = '';

function resolveHelperPath() {
    if (helperPath && fs.existsSync(helperPath)) return helperPath;
    helperPath = path.join(os.tmpdir(), `transub-engine-compute-sync-${process.pid}.js`);
    fs.writeFileSync(helperPath, SYNC_HELPER, 'utf8');
    return helperPath;
}

/**
 * @param {string} method
 * @param {string} url
 * @param {object|null} body
 * @param {number} [timeoutMs]
 */
function engineJsonSync(method, url, body = null, timeoutMs = 8000) {
    const helper = resolveHelperPath();
    const payload = body == null ? '' : JSON.stringify(body);
    const t = Math.max(1000, Number(timeoutMs) || 8000);
    try {
        const r = spawnSync(
            process.execPath,
            [helper, String(method || 'GET').toUpperCase(), String(url || ''), payload, String(t)],
            {
                encoding: 'utf8',
                timeout: t + 2000,
                windowsHide: true,
                maxBuffer: 2 * 1024 * 1024,
            },
        );
        let parsed = null;
        try {
            parsed = r.stdout ? JSON.parse(r.stdout) : null;
        } catch {
            parsed = null;
        }
        if (!parsed || parsed.status === 0) {
            return {
                ok: false,
                code: 'network',
                error: parsed?.error || r.stderr || r.error?.message || 'engine sync fetch failed',
                status: 0,
                data: null,
            };
        }
        let data = null;
        try {
            data = parsed.body ? JSON.parse(parsed.body) : null;
        } catch {
            data = { raw: parsed.body };
        }
        const okHttp = parsed.status >= 200 && parsed.status < 300;
        const okBody = !data || data.ok !== false;
        return {
            ok: okHttp && okBody,
            status: parsed.status,
            data,
            error: data?.error || data?.message || (!okHttp ? `HTTP ${parsed.status}` : undefined),
            code: data?.code,
        };
    } catch (err) {
        return { ok: false, code: 'network', error: err?.message || String(err), status: 0, data: null };
    }
}

/**
 * @param {string} baseUrl
 * @returns {Promise<boolean>}
 */
async function engineSupportsComputeLock(baseUrl) {
    const url = String(baseUrl || '').trim();
    if (!url) return false;
    try {
        const caps = await getCapabilities(url, { timeoutMs: 4000 });
        if (!caps?.ok) return false;
        const features = caps.data?.features || caps.features || {};
        return features[COMPUTE_FEATURE] === true;
    } catch {
        return false;
    }
}

/**
 * Sync capability probe (caches via 404 / missing feature on first acquire).
 * @param {string} baseUrl
 */
function getComputeStatusSync(baseUrl, timeoutMs = 5000) {
    const root = String(baseUrl || '').replace(/\/+$/, '');
    if (!root) return { ok: false, code: 'no_engine_url' };
    return engineJsonSync('GET', joinUrl(root, '/v1/compute/status'), null, timeoutMs);
}

function acquireComputeLockSync(baseUrl, meta = {}, timeoutMs = 8000) {
    const root = String(baseUrl || '').replace(/\/+$/, '');
    if (!root) return { ok: false, code: 'no_engine_url' };
    return engineJsonSync('POST', joinUrl(root, '/v1/compute/acquire'), {
        kind: meta.kind || 'compute',
        owner: meta.owner || '',
        source: meta.source || '',
        clientId: meta.clientId || '',
    }, timeoutMs);
}

function releaseComputeLockSync(baseUrl, token = '', timeoutMs = 8000) {
    const root = String(baseUrl || '').replace(/\/+$/, '');
    if (!root) return { ok: false, code: 'no_engine_url' };
    return engineJsonSync('POST', joinUrl(root, '/v1/compute/release'), {
        token: String(token || ''),
    }, timeoutMs);
}

function forceReleaseComputeLockSync(baseUrl, timeoutMs = 8000) {
    const root = String(baseUrl || '').replace(/\/+$/, '');
    if (!root) return { ok: false, code: 'no_engine_url' };
    return engineJsonSync('POST', joinUrl(root, '/v1/compute/force-release'), {}, timeoutMs);
}

async function getComputeStatus(baseUrl, options = {}) {
    return engineFetch(baseUrl, '/v1/compute/status', {
        method: 'GET',
        timeoutMs: options.timeoutMs || 5000,
        signal: options.signal,
    });
}

async function acquireComputeLock(baseUrl, meta = {}, options = {}) {
    return engineFetch(baseUrl, '/v1/compute/acquire', {
        method: 'POST',
        body: {
            kind: meta.kind || 'compute',
            owner: meta.owner || '',
            source: meta.source || '',
            clientId: meta.clientId || '',
        },
        timeoutMs: options.timeoutMs || 8000,
        signal: options.signal,
    });
}

async function releaseComputeLock(baseUrl, token = '', options = {}) {
    return engineFetch(baseUrl, '/v1/compute/release', {
        method: 'POST',
        body: { token: String(token || '') },
        timeoutMs: options.timeoutMs || 8000,
        signal: options.signal,
    });
}

module.exports = {
    COMPUTE_FEATURE,
    engineSupportsComputeLock,
    engineJsonSync,
    getComputeStatusSync,
    acquireComputeLockSync,
    releaseComputeLockSync,
    forceReleaseComputeLockSync,
    getComputeStatus,
    acquireComputeLock,
    releaseComputeLock,
};
