/**
 * Persist last successful engine model catalog for task-safe browse-only UI.
 * File lives under the writable software root (not settings.json).
 */

const fs = require('fs');
const path = require('path');
const { getWritableRoot } = require('./app-paths');
const { isRetiredEngineAsrModelId } = require('./engine-asr-aliases');

const CACHE_VERSION = 1;
const CACHE_FILE_NAME = 'engine-models-cache.json';
const MAX_ROWS = 800;

function isRetiredCachedModelId(id) {
    const raw = String(id || '').trim();
    if (!raw) return true;
    if (isRetiredEngineAsrModelId(raw)) return true;
    // Retired local-only Transub-JA test GGUFs — drop from persisted catalog cache.
    if (/^transub-ja/i.test(raw)) return true;
    return false;
}

function getCacheFilePath() {
    return path.join(getWritableRoot(), CACHE_FILE_NAME);
}

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function sanitizeModelRow(row) {
    if (!row || typeof row !== 'object') return null;
    const id = String(row.id || '').trim();
    if (!id || isRetiredCachedModelId(id)) return null;
    return {
        id,
        name: String(row.name || id).trim() || id,
        kind: String(row.kind || '').trim(),
        installed: !!row.installed,
        incomplete: !!row.incomplete,
        size_hint_mb: Number(row.size_hint_mb) || 0,
    };
}

function sanitizePickRow(row) {
    if (!row || typeof row !== 'object') return null;
    const id = String(row.id || '').trim();
    if (!id || isRetiredCachedModelId(id)) return null;
    const out = {
        id,
        name: String(row.name || id).trim() || id,
        kind: String(row.kind || '').trim(),
        group: String(row.group || row.kind || '').trim(),
        installed: !!row.installed,
        incomplete: !!row.incomplete,
        recommended: !!row.recommended,
        shipped: !!row.shipped,
        sizeHint: String(row.sizeHint || row.size_hint || '').trim(),
        note: String(row.note || '').trim(),
        source: String(row.source || '').trim(),
        familyLabel: String(row.familyLabel || '').trim(),
        paramBillion: row.paramBillion != null ? Number(row.paramBillion) || undefined : undefined,
        translateOnly: !!row.translateOnly,
        freePipelineTranslate: !!row.freePipelineTranslate,
        proScale: !!row.proScale,
        ramHint: String(row.ramHint || '').trim(),
    };
    if (row.size_hint_mb != null) out.size_hint_mb = Number(row.size_hint_mb) || 0;
    return out;
}

function sanitizeDemucsProbe(probe) {
    if (!probe || typeof probe !== 'object') return null;
    return {
        ok: probe.ok !== false,
        status: String(probe.status || '').trim(),
        message: String(probe.message || '').trim().slice(0, 240),
    };
}

function sanitizeSnapshot(input = {}) {
    const models = asArray(input.models).map(sanitizeModelRow).filter(Boolean).slice(0, MAX_ROWS);
    const pickCatalog = asArray(input.pickCatalog || input.catalog)
        .map(sanitizePickRow)
        .filter(Boolean)
        .slice(0, MAX_ROWS);
    const managedCatalog = asArray(input.managedCatalog)
        .map(sanitizePickRow)
        .filter(Boolean)
        .slice(0, MAX_ROWS);
    const savedAt = Number(input.savedAt) || Date.now();
    if (!models.length && !pickCatalog.length) {
        return null;
    }
    return {
        version: CACHE_VERSION,
        savedAt,
        models,
        pickCatalog,
        managedCatalog,
        demucsProbe: sanitizeDemucsProbe(input.demucsProbe),
    };
}

function loadCache() {
    const filePath = getCacheFilePath();
    try {
        if (!fs.existsSync(filePath)) {
            return { ok: true, empty: true, cache: null, path: filePath };
        }
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const cache = sanitizeSnapshot(raw);
        if (!cache) {
            return { ok: true, empty: true, cache: null, path: filePath };
        }
        return { ok: true, empty: false, cache, path: filePath };
    } catch (err) {
        return { ok: false, error: err?.message || String(err), cache: null, path: filePath };
    }
}

function saveCache(payload = {}) {
    const cache = sanitizeSnapshot(payload);
    if (!cache) {
        return { ok: false, error: 'empty_snapshot' };
    }
    const filePath = getCacheFilePath();
    try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        const tmp = `${filePath}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, `${JSON.stringify(cache)}\n`, 'utf8');
        fs.renameSync(tmp, filePath);
        return { ok: true, path: filePath, savedAt: cache.savedAt, count: cache.pickCatalog.length || cache.models.length };
    } catch (err) {
        return { ok: false, error: err?.message || String(err), path: filePath };
    }
}

module.exports = {
    CACHE_VERSION,
    CACHE_FILE_NAME,
    getCacheFilePath,
    sanitizeSnapshot,
    loadCache,
    saveCache,
};
