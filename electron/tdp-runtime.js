/**
 * TDP runtime: check CDN manifest, download, verify Ed25519, apply / hot-reload.
 * Download is open; applying sections requires Pro entitlement.
 *
 * Applied sections are shared with Sakura translation (same process modules):
 *   L01 → tone-adapt lexicon + Sakura NSFW system prompt / glossary merge
 *   P01 → av_soft profiling → enables Sakura NSFW / sanitize paths
 *   D01 → mt-sanitize JA ASR domain fixes (Sakura preprocesses sources before infer)
 *
 * CDN HTTPS uses Chromium net.fetch (not Node https): Electron/BoringSSL resets
 * against www.transub.cc (openresty), while Chromium's stack succeeds.
 */
const fs = require('fs');
const path = require('path');
const tdpFs = require('./tdp-fs');
const tdpPack = require('../src/js/tdp-pack-core');
const tdpCrypto = require('../src/js/tdp-crypto-core');
const { downloadFile } = require('./advanced-llm-download');

const DEFAULT_MANIFEST_URL = 'https://www.transub.cc/tdp/manifest.json';
const TDP_UA = 'Transub-TDP';

/** @type {AbortController|null} */
let pullAbort = null;

function getManifestUrl() {
    const env = String(process.env.TRANSUB_TDP_MANIFEST_URL || '').trim();
    return env || DEFAULT_MANIFEST_URL;
}

function isProEntitled() {
    try {
        const gates = require('./advanced-gates');
        const gate = gates.requireFeature('*');
        return !!(gate && gate.ok);
    } catch {
        return false;
    }
}

function getAppVersion() {
    try {
        return String(require('../package.json').version || '').trim();
    } catch {
        return '';
    }
}

/** Prefer Electron Chromium fetch; fall back to global fetch (tests / Node). */
function resolveTdpFetch() {
    try {
        const { net } = require('electron');
        if (typeof net?.fetch === 'function') return net.fetch.bind(net);
    } catch { /* not in Electron */ }
    return typeof fetch === 'function' ? fetch.bind(globalThis) : null;
}

function formatTdpNetworkError(err, actionLabel = '请求') {
    if (!err) return `${actionLabel}失败`;
    if (err.name === 'AbortError') return `${actionLabel}超时`;
    const cause = err.cause || {};
    const code = String(cause.code || err.code || '').toUpperCase();
    const detail = String(cause.message || err.message || '').trim();
    if (code === 'ECONNRESET' || /ECONNRESET/i.test(detail)) {
        return `${actionLabel}连接被重置，请检查网络/代理后重试`;
    }
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
        return `无法解析更新服务器域名，请检查网络或 DNS`;
    }
    if (code === 'ETIMEDOUT' || /timeout/i.test(detail)) {
        return `${actionLabel}超时，请稍后重试`;
    }
    return detail || `${actionLabel}失败`;
}

async function httpGetJson(url, { timeoutMs = 20000, signal } = {}) {
    const fetchImpl = resolveTdpFetch();
    if (!fetchImpl) {
        throw new Error('当前环境无法发起 HTTPS 请求');
    }
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    const onOuterAbort = () => ac.abort();
    if (signal) {
        if (signal.aborted) ac.abort();
        else signal.addEventListener('abort', onOuterAbort, { once: true });
    }
    try {
        const res = await fetchImpl(url, {
            method: 'GET',
            headers: { Accept: 'application/json', 'User-Agent': TDP_UA },
            signal: ac.signal,
            redirect: 'follow',
        });
        if (!res.ok) {
            throw new Error(`清单 HTTP ${res.status}`);
        }
        const text = await res.text();
        try {
            return JSON.parse(text);
        } catch (err) {
            throw new Error(`清单解析失败：${err.message || err}`);
        }
    } catch (err) {
        if (err && err.message && String(err.message).startsWith('清单')) throw err;
        throw new Error(formatTdpNetworkError(err, '清单请求'));
    } finally {
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onOuterAbort);
    }
}

/**
 * Download pack via Chromium net (small tpack). Falls back to Node downloadFile
 * only when Electron net.fetch is unavailable.
 */
async function downloadTdpPack(url, destPath, { signal, expectedBytes, onProgress } = {}) {
    const fetchImpl = resolveTdpFetch();
    const canUseChromium = !!(fetchImpl && (() => {
        try {
            require('electron');
            return true;
        } catch {
            return false;
        }
    })());

    if (!canUseChromium) {
        await downloadFile(url, destPath, {
            signal,
            expectedBytes,
            skipProbe: true,
            onProgress,
        });
        return;
    }

    const res = await fetchImpl(url, {
        method: 'GET',
        headers: { Accept: '*/*', 'User-Agent': TDP_UA },
        signal,
        redirect: 'follow',
    });
    if (!res.ok) {
        throw new Error(`下载 HTTP ${res.status}`);
    }

    const totalHeader = Number(res.headers.get('content-length') || 0);
    const total = expectedBytes || totalHeader || 0;

    // Prefer streaming when body is a web ReadableStream.
    if (res.body && typeof res.body.getReader === 'function') {
        const reader = res.body.getReader();
        const chunks = [];
        let received = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = Buffer.from(value);
            chunks.push(chunk);
            received += chunk.length;
            if (typeof onProgress === 'function') {
                try {
                    onProgress({
                        received,
                        total: total || undefined,
                        percent: total > 0 ? Math.min(99, Math.round((received / total) * 100)) : undefined,
                    });
                } catch { /* ignore */ }
            }
        }
        const buf = Buffer.concat(chunks);
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.writeFileSync(destPath, buf);
        return;
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (typeof onProgress === 'function') {
        try {
            onProgress({ received: buf.length, total: total || buf.length, percent: 100 });
        } catch { /* ignore */ }
    }
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, buf);
}

function localStatus() {
    const meta = tdpFs.readMeta();
    const packPath = tdpFs.getCurrentPackPath();
    const hasPack = !!(meta && fs.existsSync(packPath));
    const bundledPath = tdpFs.resolveBundledPackPath();
    const hasBundled = fs.existsSync(bundledPath);
    return {
        entitled: isProEntitled(),
        installedVersion: hasPack ? String(meta.version || '') : '',
        installedAt: hasPack ? (meta.installedAt || null) : null,
        source: hasPack ? (meta.source || 'cdn') : (hasBundled ? 'bundled' : 'none'),
        applied: !!(hasPack && meta.applied && isProEntitled()),
        bundledAvailable: hasBundled,
        manifestUrl: getManifestUrl(),
        activeD01: fs.existsSync(tdpFs.getActiveD01Path()),
    };
}

function restoreBundledConsumers() {
    try {
        const tone = require('../src/js/tone-adapt-lexicon-core');
        tone.reloadFromBundled?.();
    } catch { /* ignore */ }
    try {
        const profile = require('../src/js/content-profile-core');
        profile.reloadAvMakersFromBundled?.();
    } catch { /* ignore */ }
    try {
        const sanitize = require('../src/js/mt-sanitize-core');
        sanitize.reloadJaAsrDomainFromBundled?.();
    } catch { /* ignore */ }
}

/**
 * Apply pack buffer sections into JS consumers + engine-visible D01 file.
 * Validates/decodes first; on mid-apply failure rolls back to bundled consumers.
 * @returns {{ ok: true, sections: string[] } | { ok: false, error: string, code?: string }}
 */
function applyPackBuffer(buf, { requirePro = true } = {}) {
    if (requirePro && !isProEntitled()) {
        return { ok: false, error: '需要 Pro 许可才能使用语言优化包', code: 'not_entitled' };
    }
    let parsed;
    try {
        parsed = tdpPack.parsePack(buf);
    } catch (err) {
        return { ok: false, error: err.message || '数据包无法解析' };
    }

    const l01 = tdpPack.getSection(parsed, 'L01');
    const p01 = tdpPack.getSection(parsed, 'P01');
    const d01 = tdpPack.getSection(parsed, 'D01');

    /** @type {Array<{from:string,to:string}>|null} */
    let d01Pairs = null;
    try {
        if (d01) d01Pairs = tdpPack.decodeD01Payload(d01);
    } catch (err) {
        return { ok: false, error: err.message || 'D01 区段无效' };
    }

    const applied = [];
    let mutated = false;
    try {
        if (l01) {
            const tone = require('../src/js/tone-adapt-lexicon-core');
            if (typeof tone.reloadFromTz1Buffer !== 'function') {
                throw new Error('语气词库热加载不可用');
            }
            if (!tone.reloadFromTz1Buffer(l01)) {
                throw new Error('L01 语气词库应用失败');
            }
            mutated = true;
            applied.push('L01');
        }
        if (p01) {
            const profile = require('../src/js/content-profile-core');
            if (typeof profile.reloadAvMakersFromAm1Buffer !== 'function') {
                throw new Error('片商识别热加载不可用');
            }
            if (!profile.reloadAvMakersFromAm1Buffer(p01)) {
                throw new Error('P01 片商表应用失败');
            }
            mutated = true;
            applied.push('P01');
        }
        if (d01) {
            const sanitize = require('../src/js/mt-sanitize-core');
            if (typeof sanitize.reloadJaAsrDomainBasePairs !== 'function') {
                throw new Error('日语领域修正热加载不可用');
            }
            if (!sanitize.reloadJaAsrDomainBasePairs(d01Pairs)) {
                throw new Error('D01 领域修正应用失败');
            }
            mutated = true;
            applied.push('D01');
            tdpFs.ensureDirs();
            const dest = tdpFs.getActiveD01Path();
            const tmp = `${dest}.${process.pid}.tmp`;
            fs.writeFileSync(tmp, d01);
            fs.renameSync(tmp, dest);
        }
    } catch (err) {
        if (mutated) {
            try { tdpFs.clearActiveOverlay(); } catch { /* ignore */ }
            restoreBundledConsumers();
        }
        return { ok: false, error: err.message || '热加载失败' };
    }
    return { ok: true, sections: applied };
}

function clearAppliedOverlay() {
    tdpFs.clearActiveOverlay();
    restoreBundledConsumers();
    const meta = tdpFs.readMeta();
    if (meta) {
        tdpFs.writeMeta({ ...meta, applied: false });
    }
}

/**
 * On startup / entitlement change: apply current pack if Pro, else clear overlay.
 */
function syncAppliedState() {
    if (!isProEntitled()) {
        if (tdpFs.readMeta()?.applied || fs.existsSync(tdpFs.getActiveD01Path())) {
            clearAppliedOverlay();
        }
        return { ok: true, applied: false, ...localStatus() };
    }
    const packPath = tdpFs.getCurrentPackPath();
    if (fs.existsSync(packPath)) {
        try {
            const buf = fs.readFileSync(packPath);
            const res = applyPackBuffer(buf, { requirePro: true });
            if (res.ok) {
                const meta = tdpFs.readMeta() || {};
                tdpFs.writeMeta({ ...meta, applied: true });
                return { ok: true, applied: true, sections: res.sections, ...localStatus() };
            }
        } catch { /* fall through to bundled */ }
    }
    const bundled = tdpFs.resolveBundledPackPath();
    if (fs.existsSync(bundled)) {
        try {
            const buf = fs.readFileSync(bundled);
            const res = applyPackBuffer(buf, { requirePro: true });
            if (res.ok) {
                const meta = tdpFs.readMeta();
                if (meta) tdpFs.writeMeta({ ...meta, applied: true, source: meta.source || 'bundled' });
                return { ok: true, applied: true, source: 'bundled', sections: res.sections, ...localStatus() };
            }
        } catch { /* ignore */ }
    }
    // Keep meta honest when nothing could be applied.
    const meta = tdpFs.readMeta();
    if (meta?.applied) {
        tdpFs.writeMeta({ ...meta, applied: false });
    }
    return { ok: true, applied: false, ...localStatus() };
}

async function checkForUpdate() {
    const local = localStatus();
    let raw;
    try {
        raw = await httpGetJson(getManifestUrl());
    } catch (err) {
        return {
            ok: false,
            error: err.message || '无法获取更新清单',
            local,
        };
    }
    const norm = tdpPack.normalizeManifest(raw);
    if (!norm.ok) return { ok: false, error: norm.error, local };

    const latest = norm.latest;
    const appVer = getAppVersion();
    if (latest.minAppVersion && appVer
        && tdpPack.compareVersions(appVer, latest.minAppVersion) < 0) {
        return {
            ok: false,
            error: `需要软件版本 ≥ ${latest.minAppVersion}`,
            local,
            remote: latest,
        };
    }

    const current = local.installedVersion || '0';
    const updateAvailable = tdpPack.compareVersions(current, latest.version) < 0
        || (!local.installedVersion && !!latest.version);

    return {
        ok: true,
        local,
        remote: latest,
        updateAvailable,
        upToDate: !updateAvailable && !!local.installedVersion,
    };
}

/**
 * Download + verify + install + hot-reload (apply only if Pro).
 */
async function pullUpdate({ onProgress } = {}) {
    if (pullAbort) {
        try { pullAbort.abort(); } catch { /* ignore */ }
    }
    pullAbort = new AbortController();
    const signal = pullAbort.signal;

    const checked = await checkForUpdate();
    if (!checked.ok) return checked;
    if (!checked.updateAvailable && checked.local?.installedVersion) {
        // Still allow re-apply if Pro and not applied
        if (isProEntitled() && !checked.local.applied) {
            const synced = syncAppliedState();
            return { ok: true, message: '已应用本地数据包', ...synced, remote: checked.remote };
        }
        return {
            ok: true,
            message: '已是最新',
            upToDate: true,
            local: checked.local,
            remote: checked.remote,
        };
    }

    const latest = checked.remote;
    tdpFs.ensureDirs();
    const stagingPack = path.join(tdpFs.getStagingDir(), `tdp-${latest.version}.tpack`);
    const emit = (info) => {
        try { onProgress?.(info); } catch { /* ignore */ }
    };

    emit({ phase: 'start', version: latest.version, percent: 0 });
    try {
        await downloadTdpPack(latest.url, stagingPack, {
            signal,
            expectedBytes: latest.size || undefined,
            onProgress: (p) => {
                emit({
                    phase: 'download',
                    version: latest.version,
                    percent: p?.percent,
                    received: p?.received,
                    total: p?.total || latest.size,
                });
            },
        });
    } catch (err) {
        if (err?.name === 'AbortError' || err?.code === 'cancelled') {
            return { ok: false, error: '已取消', code: 'cancelled' };
        }
        return { ok: false, error: formatTdpNetworkError(err, '下载') };
    }

    let buf;
    try {
        buf = fs.readFileSync(stagingPack);
    } catch (err) {
        return { ok: false, error: err.message || '读取下载文件失败' };
    }

    const verified = tdpCrypto.verifyPackBuffer(buf, {
        version: latest.version,
        sha256: latest.sha256,
        sig: latest.sig,
        size: latest.size || undefined,
    });
    if (!verified.ok) {
        try { fs.unlinkSync(stagingPack); } catch { /* ignore */ }
        return { ok: false, error: verified.error || '校验失败' };
    }

    // Parse sanity
    try {
        tdpPack.parsePack(buf);
    } catch (err) {
        try { fs.unlinkSync(stagingPack); } catch { /* ignore */ }
        return { ok: false, error: err.message || '数据包格式无效' };
    }

    tdpFs.ensureDirs();
    const dest = tdpFs.getCurrentPackPath();
    fs.copyFileSync(stagingPack, dest);
    try { fs.unlinkSync(stagingPack); } catch { /* ignore */ }

    const meta = {
        version: latest.version,
        sha256: verified.sha256,
        sig: latest.sig,
        size: buf.length,
        installedAt: new Date().toISOString(),
        source: 'cdn',
        applied: false,
        notes: latest.notes || '',
    };
    tdpFs.writeMeta(meta);

    emit({ phase: 'apply', version: latest.version, percent: 100 });

    let applyRes = { ok: true, sections: [] };
    if (isProEntitled()) {
        applyRes = applyPackBuffer(buf, { requirePro: true });
        if (applyRes.ok) {
            meta.applied = true;
            tdpFs.writeMeta(meta);
        }
    }

    emit({ phase: 'done', version: latest.version, percent: 100 });

    return {
        ok: true,
        message: isProEntitled()
            ? (applyRes.ok ? `已更新至 ${latest.version}` : `已下载 ${latest.version}，应用失败：${applyRes.error}`)
            : `已下载 ${latest.version}（开通 Pro 后可使用）`,
        version: latest.version,
        applied: !!(applyRes.ok && isProEntitled()),
        sections: applyRes.sections || [],
        local: localStatus(),
        remote: latest,
    };
}

function cancelPull() {
    if (pullAbort) {
        try { pullAbort.abort(); } catch { /* ignore */ }
        pullAbort = null;
    }
    return { ok: true };
}

module.exports = {
    DEFAULT_MANIFEST_URL,
    getManifestUrl,
    localStatus,
    checkForUpdate,
    pullUpdate,
    cancelPull,
    applyPackBuffer,
    syncAppliedState,
    clearAppliedOverlay,
    isProEntitled,
};
