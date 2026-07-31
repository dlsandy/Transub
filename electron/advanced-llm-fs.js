/**
 * Advanced LLM 本地目录布局
 */
const fs = require('fs');
const path = require('path');
const { getWritableRoot } = require('./app-paths');
const catalog = require('../src/js/advanced-managed-llm-catalog-core');
const sakuraCatalog = require('../src/js/sakura-mt-catalog-core');

function getAdvancedLlmRoot() {
    // Same software-directory layout as settings (portable / install / project root).
    return path.join(getWritableRoot(), 'advanced-llm');
}

/** Resolve GGUF catalog entry from Advanced or free Sakura catalogs. */
function resolveModelEntry(entryOrId) {
    if (entryOrId && typeof entryOrId === 'object' && entryOrId.fileName) {
        return entryOrId;
    }
    const id = String(entryOrId || '').trim();
    if (!id) return null;
    return catalog.findCatalogEntry(id) || sakuraCatalog.findCatalogEntry(id);
}

function getRuntimeDir() {
    return path.join(getAdvancedLlmRoot(), 'runtime');
}

function getModelsDir() {
    return path.join(getAdvancedLlmRoot(), 'models');
}

function getRuntimeMetaPath() {
    return path.join(getRuntimeDir(), 'runtime.json');
}

function getModelPath(entryOrId) {
    const entry = resolveModelEntry(entryOrId);
    if (!entry?.fileName) return '';
    return path.join(getModelsDir(), entry.fileName);
}

function ensureDirs() {
    fs.mkdirSync(getRuntimeDir(), { recursive: true });
    fs.mkdirSync(getModelsDir(), { recursive: true });
}

function readRuntimeMeta() {
    const filePath = getRuntimeMetaPath();
    if (!fs.existsSync(filePath)) return null;
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (_) {
        return null;
    }
}

function writeRuntimeMeta(meta) {
    ensureDirs();
    fs.writeFileSync(getRuntimeMetaPath(), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
}

function resolveServerExe(meta = readRuntimeMeta()) {
    const pkg = catalog.getRuntimePackage();
    const exeName = meta?.exeName || pkg?.exeName || (process.platform === 'win32' ? 'llama-server.exe' : 'llama-server');
    const candidates = [
        path.join(getRuntimeDir(), exeName),
        meta?.exePath ? String(meta.exePath) : '',
    ].filter(Boolean);
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    // 递归查找（解压后可能有子目录）
    const found = findFileRecursive(getRuntimeDir(), exeName, 4);
    return found || '';
}

function findFileRecursive(rootDir, fileName, maxDepth = 4) {
    if (!rootDir || !fs.existsSync(rootDir) || maxDepth < 0) return '';
    let entries;
    try {
        entries = fs.readdirSync(rootDir, { withFileTypes: true });
    } catch (_) {
        return '';
    }
    for (const entry of entries) {
        const full = path.join(rootDir, entry.name);
        if (entry.isFile() && entry.name === fileName) return full;
        if (entry.isDirectory() && entry.name !== '.' && entry.name !== '..') {
            const hit = findFileRecursive(full, fileName, maxDepth - 1);
            if (hit) return hit;
        }
    }
    return '';
}

function isRuntimeInstalled() {
    const exe = resolveServerExe();
    if (!exe) return false;
    const meta = readRuntimeMeta();
    const pkg = catalog.getRuntimePackage();
    if (meta?.tag && meta.tag !== catalog.LLAMA_CPP_TAG) return true; // 旧版也可先用
    if (pkg && meta?.packageId && meta.packageId !== pkg.id) return true;
    return true;
}

function isModelInstalled(entryOrId) {
    const p = getModelPath(entryOrId);
    if (!p) return false;
    try {
        const st = fs.statSync(p);
        return st.isFile() && st.size > 1024 * 1024;
    } catch (_) {
        return false;
    }
}

module.exports = {
    getAdvancedLlmRoot,
    getRuntimeDir,
    getModelsDir,
    getRuntimeMetaPath,
    getModelPath,
    ensureDirs,
    readRuntimeMeta,
    writeRuntimeMeta,
    resolveServerExe,
    findFileRecursive,
    isRuntimeInstalled,
    isModelInstalled,
    resolveModelEntry,
};
