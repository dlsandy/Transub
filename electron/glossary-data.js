const fs = require('fs');
const path = require('path');
const { getWritableRoot } = require('./app-paths');

const GLOSSARY_FILE_NAME = 'transub-glossary.json';
const PROJECT_GLOSSARY_SUFFIX = '.glossary.json';

function glossaryCore() {
    // Packaged under app.asar/src/js (see package.json build.files)
    return require('../src/js/subtitle-glossary-core');
}

function getGlossaryFilePath() {
    return path.join(getWritableRoot(), GLOSSARY_FILE_NAME);
}

function emptyGlossary() {
    return {
        version: 1,
        updatedAt: null,
        entries: [],
    };
}

function readGlossary() {
    const filePath = getGlossaryFilePath();
    if (!fs.existsSync(filePath)) {
        return { ok: true, path: filePath, glossary: emptyGlossary(), exists: false };
    }
    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const glossary = {
            version: Number(parsed.version) || 1,
            updatedAt: parsed.updatedAt || null,
            entries: Array.isArray(parsed.entries) ? parsed.entries : [],
        };
        return { ok: true, path: filePath, glossary, exists: true };
    } catch (err) {
        return { ok: false, error: err.message || String(err), path: filePath };
    }
}

function writeGlossary(glossary) {
    const filePath = getGlossaryFilePath();
    try {
        const { normalizeGlossary } = glossaryCore();
        const payload = normalizeGlossary({
            version: 1,
            updatedAt: new Date().toISOString(),
            entries: Array.isArray(glossary?.entries) ? glossary.entries : [],
        });
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
        invalidateBatchGlossaryCache();
        return { ok: true, path: filePath, glossary: payload };
    } catch (err) {
        return { ok: false, error: err.message || String(err), path: filePath };
    }
}

function projectGlossaryPathForSubtitle(subPath) {
    const resolved = path.resolve(String(subPath || ''));
    if (!resolved) return '';
    const stem = path.basename(resolved, path.extname(resolved));
    return path.join(path.dirname(resolved), `${stem}${PROJECT_GLOSSARY_SUFFIX}`);
}

function projectGlossaryPathForMedia(mediaPath) {
    const resolved = path.resolve(String(mediaPath || ''));
    if (!resolved) return '';
    const stem = path.basename(resolved, path.extname(resolved));
    return path.join(path.dirname(resolved), `${stem}${PROJECT_GLOSSARY_SUFFIX}`);
}

function readGlossaryFileIfExists(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return null;
    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const { normalizeGlossary } = glossaryCore();
        return normalizeGlossary({
            version: Number(parsed.version) || 1,
            updatedAt: parsed.updatedAt || null,
            entries: Array.isArray(parsed.entries) ? parsed.entries : [],
        });
    } catch {
        return null;
    }
}

/** Batch merge cache — global + sidecar reads repeat per engine item. */
const batchGlossaryCache = new Map();
const BATCH_GLOSSARY_CACHE_MAX = 64;

function fileMtimeMs(filePath) {
    const p = String(filePath || '').trim();
    if (!p || !fs.existsSync(p)) return 0;
    try {
        return fs.statSync(p).mtimeMs;
    } catch {
        return 0;
    }
}

function collectBatchGlossarySidecarPaths(opts = {}) {
    const mediaPath = String(opts.mediaPath || '').trim();
    const outputDir = String(opts.outputDir || '').trim();
    const subtitlePath = String(opts.subtitlePath || '').trim();
    const paths = [];
    if (mediaPath) paths.push(projectGlossaryPathForMedia(mediaPath));
    if (mediaPath && outputDir) {
        const stem = path.basename(mediaPath, path.extname(mediaPath));
        paths.push(path.join(outputDir, `${stem}${PROJECT_GLOSSARY_SUFFIX}`));
    }
    if (subtitlePath) paths.push(projectGlossaryPathForSubtitle(subtitlePath));
    const seen = new Set();
    const out = [];
    for (const filePath of paths) {
        const norm = path.resolve(filePath);
        if (!norm || seen.has(norm)) continue;
        seen.add(norm);
        out.push(norm);
    }
    return out;
}

function batchGlossaryCacheKey(opts = {}) {
    const parts = [String(fileMtimeMs(getGlossaryFilePath()))];
    for (const p of collectBatchGlossarySidecarPaths(opts)) {
        parts.push(`${p}:${fileMtimeMs(p)}`);
    }
    return parts.join('|');
}

function pruneBatchGlossaryCache() {
    if (batchGlossaryCache.size <= BATCH_GLOSSARY_CACHE_MAX) return;
    const drop = batchGlossaryCache.size - BATCH_GLOSSARY_CACHE_MAX;
    for (const key of [...batchGlossaryCache.keys()].slice(0, drop)) {
        batchGlossaryCache.delete(key);
    }
}

function invalidateBatchGlossaryCache() {
    batchGlossaryCache.clear();
}

/** Global + project glossary for engine batch (media / output sidecar). */
function readBatchMergedGlossary(opts = {}) {
    const cacheKey = batchGlossaryCacheKey(opts);
    const cached = batchGlossaryCache.get(cacheKey);
    if (cached) return cached;

    const { mergeGlossaries } = glossaryCore();
    const globalResult = readGlossary();
    let merged = globalResult.ok && globalResult.glossary
        ? globalResult.glossary
        : emptyGlossary();

    for (const filePath of collectBatchGlossarySidecarPaths(opts)) {
        const projectG = readGlossaryFileIfExists(filePath);
        if (projectG?.entries?.length) {
            merged = mergeGlossaries(merged, projectG);
        }
    }

    batchGlossaryCache.set(cacheKey, merged);
    pruneBatchGlossaryCache();
    return merged;
}

function readProjectGlossary(subPath) {
    const filePath = projectGlossaryPathForSubtitle(subPath);
    if (!filePath) return { ok: false, error: '缺少字幕路径' };
    if (!fs.existsSync(filePath)) {
        return { ok: true, path: filePath, glossary: emptyGlossary(), exists: false };
    }
    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const { normalizeGlossary } = glossaryCore();
        const glossary = normalizeGlossary({
            version: Number(parsed.version) || 1,
            updatedAt: parsed.updatedAt || null,
            entries: Array.isArray(parsed.entries) ? parsed.entries : [],
        });
        return { ok: true, path: filePath, glossary, exists: true };
    } catch (err) {
        return { ok: false, error: err.message || String(err), path: filePath };
    }
}

function writeProjectGlossary(subPath, glossary) {
    const filePath = projectGlossaryPathForSubtitle(subPath);
    if (!filePath) return { ok: false, error: '缺少字幕路径' };
    try {
        const { normalizeGlossary } = glossaryCore();
        const payload = normalizeGlossary({
            version: 1,
            updatedAt: new Date().toISOString(),
            entries: Array.isArray(glossary?.entries) ? glossary.entries : [],
        });
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
        invalidateBatchGlossaryCache();
        return { ok: true, path: filePath, glossary: payload };
    } catch (err) {
        return { ok: false, error: err.message || String(err), path: filePath };
    }
}

function readMergedGlossary(subPath) {
    const globalResult = readGlossary();
    if (!globalResult.ok) return globalResult;
    const projectResult = readProjectGlossary(subPath);
    if (!projectResult.ok) return projectResult;
    const { mergeGlossaries } = glossaryCore();
    return {
        ok: true,
        path: projectResult.path || globalResult.path,
        glossary: mergeGlossaries(globalResult.glossary, projectResult.glossary),
        global: globalResult.glossary,
        project: projectResult.glossary,
        globalPath: globalResult.path,
        projectPath: projectResult.path,
        projectExists: !!projectResult.exists,
    };
}

function resolveGlossaryScope(payload = {}) {
    const scope = String(payload.scope || 'global').toLowerCase();
    if (scope === 'project' || scope === 'merged') return scope;
    return 'global';
}

function readGlossaryByScope(payload = {}) {
    const scope = resolveGlossaryScope(payload);
    if (scope === 'project') {
        const subPath = String(payload.subtitlePath || payload.path || '').trim();
        if (!subPath) return { ok: false, error: '缺少字幕路径' };
        return readProjectGlossary(subPath);
    }
    if (scope === 'merged') {
        const subPath = String(payload.subtitlePath || payload.path || '').trim();
        if (!subPath) return { ok: false, error: '缺少字幕路径' };
        return readMergedGlossary(subPath);
    }
    return readGlossary();
}

function writeGlossaryByScope(payload = {}) {
    const scope = resolveGlossaryScope(payload);
    const glossary = payload.glossary || payload;
    if (scope === 'project') {
        const subPath = String(payload.subtitlePath || payload.path || '').trim();
        if (!subPath) return { ok: false, error: '缺少字幕路径' };
        return writeProjectGlossary(subPath, glossary);
    }
    return writeGlossary(glossary);
}

module.exports = {
    GLOSSARY_FILE_NAME,
    PROJECT_GLOSSARY_SUFFIX,
    getGlossaryFilePath,
    projectGlossaryPathForSubtitle,
    projectGlossaryPathForMedia,
    readGlossaryFileIfExists,
    readBatchMergedGlossary,
    invalidateBatchGlossaryCache,
    emptyGlossary,
    readGlossary,
    writeGlossary,
    readProjectGlossary,
    writeProjectGlossary,
    readMergedGlossary,
    readGlossaryByScope,
    writeGlossaryByScope,
};
