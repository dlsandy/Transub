/**
 * Combo plans CDN runtime: fetch manifest/plans via Chromium net.fetch, cache locally,
 * fall back to tools/combo-plans-samples when offline/dev.
 */
const fs = require('fs');
const path = require('path');
const { getWritableRoot } = require('./app-paths');

const DEFAULT_MANIFEST_URL = 'https://www.transub.cc/combo-plans/manifest.json';
const UA = 'Transub-ComboPlans';
const CACHE_DIR_NAME = 'combo-plans-cache';

let comboPlansCore = null;
function core() {
    if (!comboPlansCore) {
        comboPlansCore = require('../src/js/combo-plans-core.js');
    }
    return comboPlansCore;
}

function getManifestUrl() {
    const env = String(process.env.TRANSUB_COMBO_PLANS_MANIFEST_URL || '').trim();
    return env || DEFAULT_MANIFEST_URL;
}

function resolveFetch() {
    try {
        const { net } = require('electron');
        if (typeof net?.fetch === 'function') return net.fetch.bind(net);
    } catch { /* not in Electron */ }
    return typeof fetch === 'function' ? fetch.bind(globalThis) : null;
}

function formatNetworkError(err, actionLabel = '请求') {
    if (!err) return `${actionLabel}失败`;
    if (err.name === 'AbortError') return `${actionLabel}超时`;
    const cause = err.cause || {};
    const code = String(cause.code || err.code || '').toUpperCase();
    const detail = String(cause.message || err.message || '').trim();
    if (code === 'ECONNRESET' || /ECONNRESET/i.test(detail)) {
        return `${actionLabel}连接被重置，请检查网络后重试`;
    }
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
        return '无法解析服务器域名，请检查网络或 DNS';
    }
    if (code === 'ETIMEDOUT' || /timeout/i.test(detail)) {
        return `${actionLabel}超时，请稍后重试`;
    }
    return detail || `${actionLabel}失败`;
}

function getCacheDir() {
    return path.join(getWritableRoot(), CACHE_DIR_NAME);
}

function getSamplesDir() {
    return path.join(__dirname, '..', 'tools', 'combo-plans-samples');
}

function ensureDir(dir) {
    try {
        fs.mkdirSync(dir, { recursive: true });
    } catch { /* ignore */ }
}

function readJsonFile(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
}

function writeJsonFile(filePath, data) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function resolveUrl(baseUrl, relative) {
    const rel = String(relative || '').trim();
    if (!rel) return '';
    if (/^https?:\/\//i.test(rel)) return rel;
    try {
        return new URL(rel, baseUrl).href;
    } catch {
        const base = String(baseUrl || '').replace(/\/[^/]*$/, '/');
        return `${base}${rel.replace(/^\//, '')}`;
    }
}

async function httpGetJson(url, { timeoutMs = 20000, signal } = {}) {
    const fetchImpl = resolveFetch();
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
            headers: { Accept: 'application/json', 'User-Agent': UA },
            signal: ac.signal,
            redirect: 'follow',
        });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}（${url}）`);
        }
        const text = await res.text();
        try {
            return JSON.parse(text);
        } catch (err) {
            throw new Error(`JSON 解析失败：${err.message || err}`);
        }
    } catch (err) {
        if (err && err.message && /^HTTP |JSON /.test(String(err.message))) throw err;
        throw new Error(formatNetworkError(err, '组合方案请求'));
    } finally {
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onOuterAbort);
    }
}

function loadCachedManifest() {
    const filePath = path.join(getCacheDir(), 'manifest.json');
    if (!fs.existsSync(filePath)) return null;
    try {
        return core().normalizeManifest(readJsonFile(filePath));
    } catch {
        return null;
    }
}

function loadSamplesManifest() {
    const filePath = path.join(getSamplesDir(), 'manifest.json');
    if (!fs.existsSync(filePath)) return null;
    try {
        return core().normalizeManifest(readJsonFile(filePath));
    } catch {
        return null;
    }
}

function loadPlanFromDisk(planId, { preferCache = true } = {}) {
    const id = String(planId || '').trim();
    if (!id) return null;
    const candidates = [];
    if (preferCache) {
        candidates.push(path.join(getCacheDir(), 'plans', `${id}.json`));
    }
    candidates.push(path.join(getSamplesDir(), 'plans', `${id}.json`));
    if (!preferCache) {
        candidates.unshift(path.join(getCacheDir(), 'plans', `${id}.json`));
    }
    for (const filePath of candidates) {
        if (!fs.existsSync(filePath)) continue;
        try {
            const plan = core().normalizeComboPlan(readJsonFile(filePath));
            if (plan) return plan;
        } catch { /* try next */ }
    }
    return null;
}

function cacheManifest(manifest) {
    try {
        writeJsonFile(path.join(getCacheDir(), 'manifest.json'), {
            schemaVersion: manifest.schemaVersion,
            updatedAt: manifest.updatedAt,
            plans: (manifest.plans || []).map((p) => ({
                id: p.id,
                file: p.file || `plans/${p.id}.json`,
                version: p.version,
                group: p.group,
                name: p.name,
                summary: p.summary,
                language: p.language,
                subtitleTargetLang: p.subtitleTargetLang,
                translateMode: p.translateMode,
                requiresPro: p.requiresPro,
                hardware: p.hardware,
            })),
        });
    } catch { /* ignore cache write */ }
}

function cachePlan(plan) {
    if (!plan?.id) return;
    try {
        writeJsonFile(path.join(getCacheDir(), 'plans', `${plan.id}.json`), plan);
    } catch { /* ignore */ }
}

/**
 * List plans (index). forceRefresh hits CDN then updates cache.
 */
async function listComboPlans({ forceRefresh = false } = {}) {
    const manifestUrl = getManifestUrl();
    let source = 'cache';
    let manifest = null;
    let error = '';

    const cached = loadCachedManifest();
    if (forceRefresh || !cached || !(cached.plans || []).length) {
        try {
            const remote = await httpGetJson(manifestUrl);
            manifest = core().normalizeManifest(remote);
            cacheManifest(manifest);
            source = 'cdn';
        } catch (err) {
            error = err.message || String(err);
            manifest = loadCachedManifest();
            if (manifest) source = 'cache';
            else {
                manifest = loadSamplesManifest();
                if (manifest) source = 'samples';
            }
        }
    } else {
        manifest = loadCachedManifest();
        source = 'cache';
    }

    if (!manifest) {
        manifest = loadSamplesManifest() || { schemaVersion: 1, updatedAt: '', plans: [] };
        if (manifest.plans?.length) source = source === 'cdn' ? source : 'samples';
    }

    return {
        ok: true,
        source,
        manifestUrl,
        error: error || undefined,
        schemaVersion: manifest.schemaVersion,
        updatedAt: manifest.updatedAt,
        plans: manifest.plans || [],
    };
}

/**
 * Get full plan document by id (CDN file → cache → samples).
 */
async function getComboPlan(planId, { forceRefresh = false } = {}) {
    const id = String(planId || '').trim();
    if (!id) return { ok: false, error: '缺少方案 id' };

    const list = await listComboPlans({ forceRefresh: false });
    const indexEntry = (list.plans || []).find((p) => p.id === id);

    if (!forceRefresh) {
        const local = loadPlanFromDisk(id);
        if (local && (!indexEntry || local.version >= (indexEntry.version || 1))) {
            return { ok: true, source: 'cache', plan: local };
        }
    }

    const manifestUrl = getManifestUrl();
    const rel = indexEntry?.file || `plans/${id}.json`;
    const planUrl = resolveUrl(manifestUrl, rel);
    try {
        const remote = await httpGetJson(planUrl);
        const plan = core().normalizeComboPlan(remote);
        if (!plan) return { ok: false, error: '方案格式无效' };
        cachePlan(plan);
        return { ok: true, source: 'cdn', plan };
    } catch (err) {
        const local = loadPlanFromDisk(id);
        if (local) {
            return {
                ok: true,
                source: 'fallback',
                plan: local,
                error: err.message || String(err),
            };
        }
        return { ok: false, error: err.message || String(err) };
    }
}

async function refreshComboPlans() {
    return listComboPlans({ forceRefresh: true });
}

module.exports = {
    DEFAULT_MANIFEST_URL,
    getManifestUrl,
    listComboPlans,
    getComboPlan,
    refreshComboPlans,
    loadPlanFromDisk,
    getSamplesDir,
};
