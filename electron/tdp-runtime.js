/**
 * TDP runtime: check CDN manifest, download, verify Ed25519, apply / hot-reload.
 * Download is open; applying sections requires Pro entitlement.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const tdpFs = require('./tdp-fs');
const tdpPack = require('../src/js/tdp-pack-core');
const tdpCrypto = require('../src/js/tdp-crypto-core');
const { downloadFile } = require('./advanced-llm-download');
const { getDownloadAgents } = require('./proxy-settings');

const DEFAULT_MANIFEST_URL = 'https://www.transub.cc/tdp/manifest.json';

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

function httpGetJson(url, { timeoutMs = 20000 } = {}) {
    return new Promise((resolve, reject) => {
        let parsed;
        try {
            parsed = new URL(url);
        } catch (err) {
            reject(err);
            return;
        }
        const lib = parsed.protocol === 'https:' ? https : http;
        const { httpAgent, httpsAgent } = getDownloadAgents();
        const agent = parsed.protocol === 'https:' ? httpsAgent : httpAgent;
        const req = lib.get(url, {
            agent,
            timeout: timeoutMs,
            headers: { Accept: 'application/json', 'User-Agent': 'Transub-TDP' },
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                httpGetJson(new URL(res.headers.location, url).toString(), { timeoutMs })
                    .then(resolve, reject);
                return;
            }
            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error(`清单 HTTP ${res.statusCode}`));
                return;
            }
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                try {
                    const text = Buffer.concat(chunks).toString('utf8');
                    resolve(JSON.parse(text));
                } catch (err) {
                    reject(new Error(`清单解析失败：${err.message || err}`));
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('清单请求超时'));
        });
    });
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
        await downloadFile(latest.url, stagingPack, {
            signal,
            expectedBytes: latest.size || undefined,
            skipProbe: true,
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
        return { ok: false, error: err.message || '下载失败' };
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
