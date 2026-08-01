/**
 * Advanced LLM 本地目录布局
 */
const fs = require('fs');
const path = require('path');
const { getWritableRoot } = require('./app-paths');
const catalog = require('../src/js/advanced-managed-llm-catalog-core');
const sakuraCatalog = require('../src/js/sakura-mt-catalog-core');

/** @type {string|null} test-only override for models directory */
let modelsDirOverride = null;

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
    if (modelsDirOverride) return modelsDirOverride;
    return path.join(getAdvancedLlmRoot(), 'models');
}

/** @private test helper */
function __setModelsDirForTests(dir) {
    modelsDirOverride = dir ? String(dir) : null;
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

const GGUF_MAGIC = Buffer.from('GGUF');
const MIN_MODEL_BYTES = 1024 * 1024;
/** Accept modest size drift across mirrors / rounded catalog hints. */
const SIZE_TOLERANCE_LOW = 0.85;
const SIZE_TOLERANCE_HIGH = 1.08;

function formatBytesZh(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n <= 0) return '未知大小';
    if (n >= 1024 ** 3) return `${(n / (1024 ** 3)).toFixed(2)} GB`;
    if (n >= 1024 ** 2) return `${(n / (1024 ** 2)).toFixed(1)} MB`;
    return `${Math.round(n / 1024)} KB`;
}

function normalizeModelKey(name) {
    return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function readGgufMagic(filePath) {
    let fd;
    try {
        fd = fs.openSync(filePath, 'r');
        const buf = Buffer.alloc(4);
        const n = fs.readSync(fd, buf, 0, 4, 0);
        if (n < 4) return '';
        return buf.toString('ascii');
    } catch (_) {
        return '';
    } finally {
        if (fd != null) {
            try { fs.closeSync(fd); } catch (_) { /* ignore */ }
        }
    }
}

function isGgufMagicOk(filePath) {
    return readGgufMagic(filePath) === 'GGUF';
}

function listCatalogEntries() {
    const advanced = typeof catalog.listCatalog === 'function' ? catalog.listCatalog() : [];
    const sakura = typeof sakuraCatalog.listCatalog === 'function' ? sakuraCatalog.listCatalog() : [];
    const byId = new Map();
    for (const entry of [...advanced, ...sakura]) {
        if (entry?.id) byId.set(entry.id, entry);
    }
    return Array.from(byId.values());
}

/**
 * Presence-only check (legacy). Prefer validateModelFile for readiness.
 */
function isModelInstalled(entryOrId) {
    const p = getModelPath(entryOrId);
    if (!p) return false;
    try {
        const st = fs.statSync(p);
        return st.isFile() && st.size > MIN_MODEL_BYTES;
    } catch (_) {
        return false;
    }
}

/**
 * Validate a catalog model file on disk (name, size, GGUF magic).
 * @returns {{ ok: boolean, error?: string, code?: string, path?: string, size?: number, entry?: object }}
 */
function validateModelFile(entryOrId, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const entry = resolveModelEntry(entryOrId);
    if (!entry?.fileName) {
        return { ok: false, error: '未知模型', code: 'unknown_model' };
    }
    const filePath = String(opts.filePath || getModelPath(entry) || '').trim();
    if (!filePath) {
        return { ok: false, error: '无法解析模型路径', code: 'model_path_missing', entry };
    }

    let st;
    try {
        st = fs.statSync(filePath);
    } catch (_) {
        return {
            ok: false,
            error: `未找到 ${entry.fileName}。请放入：${getModelsDir()}`,
            code: 'model_file_missing',
            path: filePath,
            folder: getModelsDir(),
            fileName: entry.fileName,
            entry,
        };
    }
    if (!st.isFile()) {
        return {
            ok: false,
            error: `${entry.fileName} 不是文件`,
            code: 'model_not_file',
            path: filePath,
            entry,
        };
    }

    const size = st.size;
    const expected = Number(entry.sizeBytes) || 0;
    const sizeHint = entry.sizeHint || (expected ? formatBytesZh(expected) : '');

    if (size < MIN_MODEL_BYTES) {
        return {
            ok: false,
            error: `「${entry.name}」文件过小（${formatBytesZh(size)}），可能下载不完整或放错了文件`
                + (sizeHint ? `。期望约 ${sizeHint}` : '')
                + `：${filePath}`,
            code: 'model_file_too_small',
            path: filePath,
            size,
            entry,
        };
    }

    if (!String(entry.fileName).toLowerCase().endsWith('.gguf')) {
        return {
            ok: false,
            error: `「${entry.name}」目录项不是 GGUF 模型（${entry.fileName}）`,
            code: 'model_not_gguf_entry',
            path: filePath,
            size,
            entry,
        };
    }

    if (!isGgufMagicOk(filePath)) {
        const magic = readGgufMagic(filePath);
        return {
            ok: false,
            error: `「${entry.name}」不是有效的 GGUF 模型文件（文件头「${magic || '未知'}」，应为 GGUF）。`
                + '常见原因：手动下载了网页/HTML、下错量化版本，或文件未下完。'
                + (sizeHint ? ` 期望文件：${entry.fileName}（约 ${sizeHint}）` : ` 期望文件：${entry.fileName}`),
            code: 'model_not_gguf',
            path: filePath,
            size,
            entry,
        };
    }

    if (expected > MIN_MODEL_BYTES) {
        const low = expected * SIZE_TOLERANCE_LOW;
        const high = expected * SIZE_TOLERANCE_HIGH;
        if (size < low || size > high) {
            return {
                ok: false,
                error: `「${entry.name}」体积不符：当前 ${formatBytesZh(size)}，期望约 ${sizeHint || formatBytesZh(expected)}`
                    + `（${entry.fileName}）。可能下错了量化档位或文件不完整，请按软件提供的链接重新下载后放入：${getModelsDir()}`,
                code: 'model_size_mismatch',
                path: filePath,
                size,
                expectedBytes: expected,
                entry,
            };
        }
    }

    return {
        ok: true,
        path: filePath,
        size,
        entry,
        message: `已校验 ${entry.name}（${formatBytesZh(size)}）`,
    };
}

/**
 * Match an on-disk .gguf (possibly wrong name) to a catalog entry by name or size.
 * @returns {{ entry: object, reason: 'filename'|'size', fileName: string, path: string, size: number }|null}
 */
function matchCatalogEntryForFile(filePath, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const abs = String(filePath || '').trim();
    if (!abs) return null;
    let st;
    try {
        st = fs.statSync(abs);
    } catch (_) {
        return null;
    }
    if (!st.isFile() || st.size < MIN_MODEL_BYTES) return null;
    const base = path.basename(abs);
    if (!base.toLowerCase().endsWith('.gguf')) return null;

    const entries = listCatalogEntries();
    const wantKey = normalizeModelKey(base.replace(/\.gguf$/i, ''));
    for (const entry of entries) {
        if (!entry?.fileName) continue;
        if (normalizeModelKey(entry.fileName.replace(/\.gguf$/i, '')) === wantKey) {
            return {
                entry,
                reason: 'filename',
                fileName: base,
                path: abs,
                size: st.size,
            };
        }
    }

    if (opts.skipSize) return null;
    let best = null;
    let bestDelta = Infinity;
    for (const entry of entries) {
        const expected = Number(entry?.sizeBytes) || 0;
        if (expected < MIN_MODEL_BYTES) continue;
        const delta = Math.abs(st.size - expected) / expected;
        if (delta <= 0.03 && delta < bestDelta) {
            best = entry;
            bestDelta = delta;
        }
    }
    if (!best) return null;
    return {
        entry: best,
        reason: 'size',
        fileName: base,
        path: abs,
        size: st.size,
    };
}

/**
 * Scan models dir for misplaced / misnamed GGUF that likely belong to `entry`.
 */
function findMisplacedModelCandidates(entryOrId) {
    const entry = resolveModelEntry(entryOrId);
    if (!entry?.fileName) return [];
    const dir = getModelsDir();
    if (!fs.existsSync(dir)) return [];
    let names;
    try {
        names = fs.readdirSync(dir);
    } catch (_) {
        return [];
    }

    const expectedName = String(entry.fileName);
    const expectedKey = normalizeModelKey(expectedName.replace(/\.gguf$/i, ''));
    const expectedBytes = Number(entry.sizeBytes) || 0;
    const out = [];

    for (const name of names) {
        if (!String(name).toLowerCase().endsWith('.gguf')) continue;
        if (name === expectedName) continue;
        const full = path.join(dir, name);
        let st;
        try {
            st = fs.statSync(full);
        } catch (_) {
            continue;
        }
        if (!st.isFile() || st.size < MIN_MODEL_BYTES) continue;
        if (!isGgufMagicOk(full)) continue;

        const key = normalizeModelKey(name.replace(/\.gguf$/i, ''));
        const nameClose = key.includes(expectedKey) || expectedKey.includes(key)
            || (key.length > 12 && expectedKey.length > 12 && (
                key.slice(0, 16) === expectedKey.slice(0, 16)
            ));
        let sizeClose = false;
        if (expectedBytes > MIN_MODEL_BYTES) {
            const delta = Math.abs(st.size - expectedBytes) / expectedBytes;
            sizeClose = delta <= 0.03;
        }
        if (!nameClose && !sizeClose) continue;
        out.push({
            fileName: name,
            path: full,
            size: st.size,
            sizeLabel: formatBytesZh(st.size),
            reason: nameClose && sizeClose ? 'name+size' : (nameClose ? 'name' : 'size'),
            suggestRenameTo: expectedName,
            entry,
        });
    }
    return out;
}

/**
 * Human-readable hint when the expected file is missing but a lookalike exists.
 */
function buildMisplacedModelHint(entryOrId) {
    const entry = resolveModelEntry(entryOrId);
    const hits = findMisplacedModelCandidates(entry);
    if (!entry || !hits.length) return '';
    const top = hits[0];
    return `模型目录中发现「${top.fileName}」（${top.sizeLabel}），体积/名称接近「${entry.name}」。`
        + `请将其重命名为 ${entry.fileName} 后重试（目录：${getModelsDir()}）。`;
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
    validateModelFile,
    matchCatalogEntryForFile,
    findMisplacedModelCandidates,
    buildMisplacedModelHint,
    formatBytesZh,
    GGUF_MAGIC,
    __setModelsDirForTests,
};
