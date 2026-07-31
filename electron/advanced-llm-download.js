/**
 * 大文件下载（带进度）与解压
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execFileSync } = require('child_process');
const { asString } = require('./ipc-validate');
const { getDownloadAgents, hostMatchesBypass } = require('./proxy-settings');

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

/**
 * 展开可读错误（AggregateError 在 Windows/双栈 DNS 下很常见）。
 */
function formatError(err) {
    if (err == null) return '未知错误';
    if (typeof err === 'string') return err;
    if (err.name === 'AbortError' || err.code === 'cancelled') return '已取消';

    const code = err.code || err.cause?.code;
    if (code === 'ENOTFOUND') {
        return `无法解析域名${err.hostname ? ` ${err.hostname}` : ''}（请检查网络）`;
    }
    if (code === 'ECONNREFUSED') return '连接被拒绝';
    if (code === 'ECONNRESET') return '连接被重置';
    if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT') {
        return '连接超时';
    }
    if (code === 'CERT_HAS_EXPIRED' || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
        return '证书校验失败';
    }

    if (err.name === 'AggregateError' || Array.isArray(err.errors)) {
        const parts = (err.errors || [])
            .map((e) => formatError(e))
            .filter(Boolean);
        const uniq = [...new Set(parts)].slice(0, 4);
        if (uniq.length) return uniq.join('；');
        return '网络连接失败（请检查是否可访问 GitHub / Hugging Face，或稍后重试）';
    }

    if (err.cause) {
        const nested = formatError(err.cause);
        if (nested && nested !== '未知错误') return nested;
    }

    const msg = String(err.message || '').trim();
    if (msg && msg !== 'AggregateError') return msg;
    return code ? `网络错误（${code}）` : '网络连接失败';
}

/** Sample size for mirror speed probes (first N bytes). */
const PROBE_SAMPLE_BYTES = 65536;
const PROBE_TIMEOUT_MS = 8000;

/**
 * 国内网络：展开镜像候选（顺序仅作默认；下载前会测速重排）。
 */
function expandDownloadUrls(url) {
    const raw = asString(url, 4096).trim();
    if (!raw) return [];
    const mirrors = [];
    try {
        const u = new URL(raw);
        if (u.hostname === 'huggingface.co' || u.hostname.endsWith('.huggingface.co')) {
            mirrors.push(raw.replace('://huggingface.co', '://hf-mirror.com'));
        }
        if (u.hostname === 'github.com') {
            mirrors.push(`https://ghfast.top/${raw}`);
            mirrors.push(`https://mirror.ghproxy.com/${raw}`);
        }
        if (u.hostname === 'objects.githubusercontent.com' || u.hostname === 'release-assets.githubusercontent.com') {
            mirrors.push(`https://ghfast.top/${raw}`);
        }
    } catch (_) { /* ignore */ }
    return [...new Set([...mirrors, raw])];
}

function isMirrorCandidateUrl(url, originalUrl = '') {
    const u = String(url || '');
    if (/hf-mirror\.com|ghfast\.top|ghproxy\.com/i.test(u)) return true;
    const orig = String(originalUrl || '').trim();
    return Boolean(orig) && u !== orig && u.includes(orig);
}

function downloadSourceLabel(url, originalUrl = '') {
    const u = String(url || '');
    if (/hf-mirror\.com/i.test(u)) return 'HF 镜像';
    if (/ghfast\.top/i.test(u)) return 'ghfast';
    if (/ghproxy\.com/i.test(u)) return 'ghproxy';
    if (originalUrl && u === String(originalUrl).trim()) return '官方源';
    try {
        return new URL(u).hostname || '备用源';
    } catch (_) {
        return isMirrorCandidateUrl(u, originalUrl) ? '镜像' : '主线路';
    }
}

/**
 * Read at most maxBytes from a response, then destroy the socket.
 */
function readResponseSample(res, maxBytes, signal) {
    return new Promise((resolve, reject) => {
        let size = 0;
        let settled = false;
        const finish = (fn, arg) => {
            if (settled) return;
            settled = true;
            try { res.destroy(); } catch (_) { /* ignore */ }
            fn(arg);
        };
        const onAbort = () => {
            finish(reject, Object.assign(new Error('已取消'), { name: 'AbortError', code: 'cancelled' }));
        };
        if (signal) {
            if (signal.aborted) {
                onAbort();
                return;
            }
            signal.addEventListener('abort', onAbort, { once: true });
        }
        res.on('data', (chunk) => {
            if (settled) return;
            size += chunk.length;
            if (size >= maxBytes) {
                finish(resolve, size);
            }
        });
        res.on('end', () => finish(resolve, size));
        res.on('error', (err) => finish(reject, err));
    });
}

/**
 * Probe one candidate: follow redirects, pull a small sample, measure latency/throughput.
 * @returns {Promise<{ url: string, ok: boolean, latencyMs: number, sampleBytes?: number, bytesPerSec?: number, status?: number, error?: string, finalUrl?: string }>}
 */
async function probeDownloadUrl(url, options = {}) {
    const timeoutMs = Math.max(1000, Number(options.timeoutMs) || PROBE_TIMEOUT_MS);
    const sampleBytes = Math.max(1024, Number(options.sampleBytes) || PROBE_SAMPLE_BYTES);
    const signal = options.signal;
    const t0 = Date.now();
    let current = String(url || '').trim();
    if (!current) {
        return { url: '', ok: false, latencyMs: 0, error: '缺少地址' };
    }

    try {
        for (let hop = 0; hop < 8; hop += 1) {
            if (signal?.aborted) {
                throw Object.assign(new Error('已取消'), { name: 'AbortError', code: 'cancelled' });
            }
            let res;
            try {
                res = await requestGet(current, {
                    signal,
                    timeoutMs,
                    headers: {
                        Accept: '*/*',
                        Range: `bytes=0-${sampleBytes - 1}`,
                    },
                });
            } catch (err) {
                if (err?.name === 'AbortError' || err?.code === 'cancelled') throw err;
                return {
                    url,
                    ok: false,
                    latencyMs: Date.now() - t0,
                    error: formatError(err),
                    finalUrl: current,
                };
            }

            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                current = new URL(res.headers.location, current).toString();
                continue;
            }

            if (res.statusCode !== 200 && res.statusCode !== 206) {
                res.resume();
                return {
                    url,
                    ok: false,
                    latencyMs: Date.now() - t0,
                    status: res.statusCode,
                    error: `HTTP ${res.statusCode}`,
                    finalUrl: current,
                };
            }

            let got = 0;
            try {
                got = await readResponseSample(res, sampleBytes, signal);
            } catch (err) {
                if (err?.name === 'AbortError' || err?.code === 'cancelled') throw err;
                return {
                    url,
                    ok: false,
                    latencyMs: Date.now() - t0,
                    error: formatError(err),
                    finalUrl: current,
                };
            }

            const ms = Math.max(1, Date.now() - t0);
            const ok = got > 0;
            return {
                url,
                ok,
                latencyMs: ms,
                sampleBytes: got,
                bytesPerSec: ok ? Math.round(got / (ms / 1000)) : 0,
                status: res.statusCode,
                finalUrl: current,
            };
        }
        return {
            url,
            ok: false,
            latencyMs: Date.now() - t0,
            error: '重定向过多',
            finalUrl: current,
        };
    } catch (err) {
        if (err?.name === 'AbortError' || err?.code === 'cancelled') throw err;
        return {
            url,
            ok: false,
            latencyMs: Date.now() - t0,
            error: formatError(err),
        };
    }
}

/**
 * Sort URLs by probe results: reachable first, then higher throughput, then lower latency.
 * Unreachable hosts keep relative order at the end so download can still fall back.
 * @param {Array<object>} probeResults
 * @param {string[]} [urls]
 */
function orderDownloadUrlsByProbe(probeResults, urls) {
    const list = Array.isArray(urls) && urls.length
        ? urls.map((u) => String(u || '').trim()).filter(Boolean)
        : [...new Set((probeResults || []).map((r) => String(r?.url || '').trim()).filter(Boolean))];
    if (list.length <= 1) return list;

    const byUrl = new Map();
    for (const row of probeResults || []) {
        const key = String(row?.url || '').trim();
        if (key && !byUrl.has(key)) byUrl.set(key, row);
    }

    const indexOf = (u) => {
        const i = list.indexOf(u);
        return i >= 0 ? i : 1e9;
    };

    return [...list].sort((a, b) => {
        const ra = byUrl.get(a) || { ok: false, latencyMs: 1e12, bytesPerSec: 0 };
        const rb = byUrl.get(b) || { ok: false, latencyMs: 1e12, bytesPerSec: 0 };
        const aOk = Boolean(ra.ok);
        const bOk = Boolean(rb.ok);
        if (aOk !== bOk) return aOk ? -1 : 1;

        const sa = Number(ra.bytesPerSec) || 0;
        const sb = Number(rb.bytesPerSec) || 0;
        if (sa !== sb && (sa > 0 || sb > 0)) return sb - sa;

        const la = ra.latencyMs != null ? Number(ra.latencyMs) : 1e12;
        const lb = rb.latencyMs != null ? Number(rb.latencyMs) : 1e12;
        if (la !== lb) return la - lb;

        return indexOf(a) - indexOf(b);
    });
}

/**
 * Probe all candidates in parallel, then return preferred download order.
 * @param {string[]} urls
 * @param {{ signal?: AbortSignal, onProgress?: Function, timeoutMs?: number, skipProbe?: boolean }} [options]
 */
async function orderDownloadUrls(urls, options = {}) {
    const list = [...new Set((urls || []).map((u) => String(u || '').trim()).filter(Boolean))];
    if (list.length <= 1 || options.skipProbe) return list;

    if (typeof options.onProgress === 'function') {
        try {
            options.onProgress({
                phase: 'probe',
                message: `正在测速 ${list.length} 个下载源…`,
                pct: 0,
                probeTotal: list.length,
            });
        } catch (_) { /* ignore */ }
    }

    const results = await Promise.all(
        list.map((u) => probeDownloadUrl(u, {
            signal: options.signal,
            timeoutMs: options.timeoutMs || PROBE_TIMEOUT_MS,
        })),
    );
    const ordered = orderDownloadUrlsByProbe(results, list);
    const best = results.find((r) => r.url === ordered[0]) || results[0];

    if (typeof options.onProgress === 'function') {
        try {
            const label = downloadSourceLabel(ordered[0], options.originalUrl || list[list.length - 1]);
            const detail = best?.ok
                ? (best.bytesPerSec > 0
                    ? `${label}（约 ${formatBytes(best.bytesPerSec)}/s）`
                    : `${label}（${Math.round(best.latencyMs)} ms）`)
                : label;
            options.onProgress({
                phase: 'probe',
                message: `测速完成，优先使用 ${detail}`,
                pct: 0,
                probeResults: results,
                preferredUrl: ordered[0],
            });
        } catch (_) { /* ignore */ }
    }

    return ordered;
}

function requestGet(url, { headers = {}, signal, timeoutMs = 180000 } = {}) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const done = (fn, arg) => {
            if (settled) return;
            settled = true;
            fn(arg);
        };

        const isHttps = String(url).startsWith('https');
        const { httpAgent, httpsAgent } = getDownloadAgents();
        const commonHeaders = {
            'User-Agent': 'Transub-Advanced-LLM/2.0',
            Accept: '*/*',
            ...headers,
        };

        /** @type {import('http').ClientRequest} */
        let req;
        let needsEnd = false;

        if (!isHttps && httpAgent.__transubProxy) {
            let target;
            try {
                target = new URL(url);
            } catch (err) {
                done(reject, err);
                return;
            }
            if (!hostMatchesBypass(target.hostname, httpAgent.__transubBypass)) {
                const proxy = httpAgent.__transubProxy;
                const authHeaders = proxy.username
                    ? {
                        'Proxy-Authorization': `Basic ${Buffer.from(
                            `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password || '')}`,
                        ).toString('base64')}`,
                    }
                    : {};
                needsEnd = true;
                req = http.request({
                    host: proxy.hostname,
                    port: proxy.port || (proxy.protocol === 'https:' ? 443 : 80),
                    method: 'GET',
                    path: url,
                    agent: false,
                    headers: {
                        ...commonHeaders,
                        Host: target.host,
                        ...authHeaders,
                    },
                    timeout: timeoutMs,
                }, (res) => done(resolve, res));
            }
        }

        if (!req) {
            const getter = isHttps ? https : http;
            const agent = isHttps ? httpsAgent : httpAgent;
            req = getter.get(url, {
                agent,
                headers: commonHeaders,
                timeout: timeoutMs,
            }, (res) => done(resolve, res));
        }

        req.on('timeout', () => {
            try { req.destroy(); } catch (_) { /* ignore */ }
            done(reject, Object.assign(new Error('连接超时'), { code: 'ETIMEDOUT' }));
        });
        req.on('error', (err) => done(reject, err));

        if (signal) {
            const onAbort = () => {
                try { req.destroy(); } catch (_) { /* ignore */ }
                done(reject, Object.assign(new Error('已取消'), { name: 'AbortError', code: 'cancelled' }));
            };
            if (signal.aborted) onAbort();
            else signal.addEventListener('abort', onAbort, { once: true });
        }

        if (needsEnd) {
            try { req.end(); } catch (_) { /* ignore */ }
        }
    });
}

/**
 * @param {string} url
 * @param {string} destPath
 * @param {{ onProgress?: Function, signal?: AbortSignal, expectedBytes?: number, skipProbe?: boolean }} [options]
 */
async function downloadFile(url, destPath, options = {}) {
    const expanded = expandDownloadUrls(url);
    if (!expanded.length) throw new Error('缺少下载地址');

    const candidates = await orderDownloadUrls(expanded, {
        signal: options.signal,
        onProgress: options.onProgress,
        skipProbe: options.skipProbe,
        originalUrl: url,
        timeoutMs: options.probeTimeoutMs,
    });

    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const partial = `${destPath}.partial`;
    const perCandidateAttempts = Math.max(1, Number(options.retriesPerUrl) || 2);

    const errors = [];
    for (let i = 0; i < candidates.length; i += 1) {
        const candidate = candidates[i];
        for (let attempt = 0; attempt < perCandidateAttempts; attempt += 1) {
            try {
                if (options.signal?.aborted) {
                    throw Object.assign(new Error('已取消'), { name: 'AbortError', code: 'cancelled' });
                }
                try { fs.unlinkSync(partial); } catch (_) { /* ignore */ }

                if (typeof options.onProgress === 'function' && (i > 0 || attempt > 0)) {
                    try {
                        if (attempt > 0) {
                            options.onProgress({
                                phase: 'retry',
                                message: `连接中断，重试同一线路（${attempt + 1}/${perCandidateAttempts}）…`,
                                pct: 0,
                            });
                        } else {
                            const label = downloadSourceLabel(candidate, url);
                            options.onProgress({
                                phase: 'retry',
                                message: `改用 ${label}（${i + 1}/${candidates.length}）…`,
                                pct: 0,
                            });
                        }
                    } catch (_) { /* ignore */ }
                }

                const result = await downloadFileOnce(candidate, destPath, partial, options);
                return result;
            } catch (err) {
                if (err?.name === 'AbortError' || err?.code === 'cancelled') throw err;
                const label = downloadSourceLabel(candidate, url);
                errors.push(`${label}: ${formatError(err)}`);
                const transient = /ECONNRESET|ETIMEDOUT|ESOCKETTIMEDOUT|连接被重置|连接超时/i.test(
                    String(err?.code || '') + String(err?.message || ''),
                );
                if (transient && attempt + 1 < perCandidateAttempts) {
                    await sleep(500 * (attempt + 1));
                    continue;
                }
                // 短暂退避后试下一候选
                await sleep(400 * (i + 1));
                break;
            }
        }
    }

    throw Object.assign(
        new Error(`下载失败：${errors.slice(0, 3).join('；')}`),
        { code: 'download_failed', errors },
    );
}

async function downloadFileOnce(targetUrl, destPath, partial, options = {}) {
    let current = targetUrl;
    for (let hop = 0; hop < 10; hop += 1) {
        if (options.signal?.aborted) {
            throw Object.assign(new Error('已取消'), { name: 'AbortError', code: 'cancelled' });
        }
        let res;
        try {
            res = await requestGet(current, {
                signal: options.signal,
                headers: {
                    // HF 对无 UA / 部分客户端会拦；对 resolve 链接友好
                    Accept: '*/*',
                },
                timeoutMs: options.timeoutMs || 180000,
            });
        } catch (err) {
            const hopHint = current !== targetUrl ? `（跳转后 ${current}）` : '';
            throw Object.assign(
                new Error(`${formatError(err)}${hopHint}`),
                { code: err?.code, cause: err, finalUrl: current },
            );
        }
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            current = new URL(res.headers.location, current).toString();
            continue;
        }
        if (res.statusCode !== 200) {
            let body = '';
            try {
                body = await readResponseText(res, 500);
            } catch (_) {
                res.resume();
            }
            const hint = body ? ` ${body.replace(/\s+/g, ' ').slice(0, 120)}` : '';
            const hopHint = current !== targetUrl ? ` @ ${current}` : '';
            throw Object.assign(
                new Error(`HTTP ${res.statusCode}${hint}${hopHint}`),
                { code: 'http_error', status: res.statusCode, finalUrl: current },
            );
        }

        const total = Number(res.headers['content-length'])
            || Number(options.expectedBytes)
            || 0;
        let received = 0;
        let lastPct = -1;
        let lastSpeedAt = Date.now();
        let lastSpeedBytes = 0;
        let bytesPerSecond = 0;
        const file = fs.createWriteStream(partial);

        await new Promise((resolve, reject) => {
            let settled = false;
            const finish = (fn, arg) => {
                if (settled) return;
                settled = true;
                fn(arg);
            };
            const onAbort = () => {
                try { res.destroy(); } catch (_) { /* ignore */ }
                try { file.destroy(); } catch (_) { /* ignore */ }
                finish(reject, Object.assign(new Error('已取消'), { name: 'AbortError', code: 'cancelled' }));
            };
            if (options.signal) {
                if (options.signal.aborted) onAbort();
                else options.signal.addEventListener('abort', onAbort, { once: true });
            }

            res.on('data', (chunk) => {
                received += chunk.length;
                const now = Date.now();
                const dt = (now - lastSpeedAt) / 1000;
                if (dt >= 0.25) {
                    bytesPerSecond = (received - lastSpeedBytes) / dt;
                    lastSpeedBytes = received;
                    lastSpeedAt = now;
                }
                if (typeof options.onProgress === 'function') {
                    const pct = total > 0
                        ? Math.min(99, Math.floor((received / total) * 100))
                        : undefined;
                    if (pct == null || pct >= lastPct + 1 || dt >= 0.25) {
                        lastPct = pct == null ? lastPct : pct;
                        try {
                            options.onProgress({
                                phase: 'downloading',
                                received,
                                total: total || undefined,
                                downloadedBytes: received,
                                totalBytes: total || undefined,
                                bytesPerSecond,
                                pct,
                                message: total
                                    ? `下载中 ${pct}%（${formatBytes(received)} / ${formatBytes(total)}）`
                                    : `下载中 ${formatBytes(received)}`,
                            });
                        } catch (_) { /* ignore */ }
                    }
                }
            });
            res.on('error', (err) => {
                const hopHint = current !== targetUrl ? `（跳转后 ${current}）` : '';
                finish(reject, Object.assign(
                    new Error(`${formatError(err)}${hopHint}`),
                    { code: err?.code, cause: err, finalUrl: current },
                ));
            });
            file.on('error', (err) => finish(reject, err));
            file.on('finish', () => finish(resolve));
            res.pipe(file);
        });

        // 过小的响应多半是错误页
        if (received < 1024 && Number(options.expectedBytes) > 1024 * 1024) {
            try { fs.unlinkSync(partial); } catch (_) { /* ignore */ }
            throw new Error('下载内容过小，可能被拦截或返回了错误页');
        }

        fs.renameSync(partial, destPath);
        if (typeof options.onProgress === 'function') {
            options.onProgress({
                phase: 'downloaded',
                received,
                total: total || received,
                downloadedBytes: received,
                totalBytes: total || received,
                bytesPerSecond: 0,
                pct: 100,
                message: '下载完成',
            });
        }
        return {
            ok: true,
            path: destPath,
            bytes: received,
            url: current,
            redirected: current !== targetUrl,
        };
    }
    throw new Error('下载重定向过多');
}

function readResponseText(res, maxLen = 500) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        res.on('data', (c) => {
            if (size >= maxLen) return;
            chunks.push(c);
            size += c.length;
        });
        res.on('end', () => {
            resolve(Buffer.concat(chunks).toString('utf8').slice(0, maxLen));
        });
        res.on('error', reject);
    });
}

function formatBytes(n) {
    const v = Number(n) || 0;
    if (v < 1024) return `${v} B`;
    if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
    if (v < 1024 * 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(1)} MB`;
    return `${(v / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function extractArchive(archivePath, destDir, archiveKind = 'zip') {
    fs.mkdirSync(destDir, { recursive: true });
    const kind = String(archiveKind || 'zip').toLowerCase();
    if (kind === 'zip') {
        if (process.platform === 'win32') {
            execFileSync('powershell.exe', [
                '-NoProfile', '-Command',
                `Expand-Archive -LiteralPath ${JSON.stringify(archivePath)} -DestinationPath ${JSON.stringify(destDir)} -Force`,
            ], { stdio: 'pipe', windowsHide: true });
            return;
        }
        execFileSync('unzip', ['-o', archivePath, '-d', destDir], { stdio: 'pipe' });
        return;
    }
    if (kind === 'tar.gz' || kind === 'tgz') {
        execFileSync('tar', ['-xzf', archivePath, '-C', destDir], { stdio: 'pipe' });
        return;
    }
    throw new Error(`不支持的压缩格式：${archiveKind}`);
}

function sleepSync(ms) {
    const end = Date.now() + Math.max(0, ms);
    while (Date.now() < end) {
        /* busy wait briefly for sync retry backoff */
    }
}

/**
 * Windows 上 fs.rmSync 偶发 ENOTEMPTY/EBUSY：重试 + 改名后再删 + rd 兜底。
 * 失败时不抛错（调用方可继续用唯一临时目录）。
 */
function rimrafSafe(target, { retries = 6 } = {}) {
    if (!target) return { ok: true, skipped: true };
    const abs = path.resolve(String(target));
    if (!fs.existsSync(abs)) return { ok: true, skipped: true };

    let lastErr = null;
    for (let i = 0; i < retries; i += 1) {
        try {
            fs.rmSync(abs, { recursive: true, force: true, maxRetries: 3, retryDelay: 80 });
            if (!fs.existsSync(abs)) return { ok: true };
        } catch (err) {
            lastErr = err;
        }

        try {
            if (fs.existsSync(abs)) {
                const renamed = `${abs}.trash-${Date.now()}-${i}`;
                fs.renameSync(abs, renamed);
                try {
                    fs.rmSync(renamed, { recursive: true, force: true, maxRetries: 3, retryDelay: 80 });
                } catch (_) {
                    // 旁路目录留给下次或系统清理
                }
                if (!fs.existsSync(abs)) return { ok: true, renamed: true };
            } else {
                return { ok: true };
            }
        } catch (err) {
            lastErr = err;
        }

        if (process.platform === 'win32') {
            try {
                execFileSync('cmd.exe', ['/c', 'rd', '/s', '/q', abs], {
                    stdio: 'ignore',
                    windowsHide: true,
                });
                if (!fs.existsSync(abs)) return { ok: true, via: 'rd' };
            } catch (err) {
                lastErr = err;
            }
        }

        sleepSync(50 * (i + 1));
    }

    return {
        ok: !fs.existsSync(abs),
        error: lastErr ? formatError(lastErr) : 'ENOTEMPTY',
    };
}

module.exports = {
    downloadFile,
    extractArchive,
    formatBytes,
    formatError,
    expandDownloadUrls,
    probeDownloadUrl,
    orderDownloadUrls,
    orderDownloadUrlsByProbe,
    downloadSourceLabel,
    rimrafSafe,
    sleep,
};
