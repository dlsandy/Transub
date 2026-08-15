/**
 * Shared helpers for zip incremental updates (block digests, no per-file manifest).
 *
 * Blocks (user-facing):
 *   shell  — Electron/Chromium shell (exe/dll/locales)
 *   app    — main app (asar / _advanced / shared)
 *   engine — transub-engine runtime
 *   other  — _internal (ffmpeg) + misc
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MANIFEST_FORMAT = 2;
const FULL_ZIP_BYTE_RATIO = 0.6;
const BASELINE_REL = path.join('resources', 'update-baseline.json');
/** @type {readonly string[]} */
const BLOCK_NAMES = Object.freeze(['shell', 'app', 'engine', 'other']);
/** @deprecated alias — packaging/download still use block names */
const COMPONENT_NAMES = BLOCK_NAMES;

/**
 * @param {string} relPath
 * @returns {'shell'|'app'|'engine'|'other'}
 */
function assignBlock(relPath) {
    const p = String(relPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
    const lower = p.toLowerCase();
    if (!p) return 'other';
    if (lower.startsWith('_internal/') || lower === '_internal') return 'other';
    if (lower.startsWith('transub-engine/') || lower === 'transub-engine') return 'engine';
    if (
        lower.startsWith('resources/')
        || lower === 'resources'
        || lower.startsWith('_advanced/')
        || lower === '_advanced'
        || lower.startsWith('shared/')
        || lower === 'shared'
    ) {
        return 'app';
    }
    if (lower.startsWith('locales/') || lower === 'locales') return 'shell';
    if (!p.includes('/') && /\.(exe|dll|pak|dat|bin|json|txt|html)$/i.test(p)) return 'shell';
    if (!p.includes('/')) return 'shell';
    return 'other';
}

/** @deprecated use assignBlock */
function assignComponent(relPath) {
    return assignBlock(relPath);
}

function normalizeRelPath(relPath) {
    return String(relPath || '')
        .replace(/\\/g, '/')
        .replace(/^\.\/+/, '')
        .replace(/^\/+/, '');
}

/**
 * @param {string} absPath
 * @returns {string}
 */
function sha256File(absPath) {
    const hash = crypto.createHash('sha256');
    const fd = fs.openSync(absPath, 'r');
    try {
        const buf = Buffer.alloc(1024 * 1024);
        let n;
        while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
            hash.update(buf.subarray(0, n));
        }
    } finally {
        fs.closeSync(fd);
    }
    return hash.digest('hex');
}

/**
 * @param {string} rootDir
 * @param {{ ignoreRel?: (rel: string) => boolean }} [opts]
 * @returns {string[]} posix-relative paths
 */
function walkFiles(rootDir, opts = {}) {
    const root = path.resolve(String(rootDir || ''));
    const ignoreRel = typeof opts.ignoreRel === 'function' ? opts.ignoreRel : null;
    const out = [];
    if (!root || !fs.existsSync(root)) return out;

    const stack = [''];
    while (stack.length) {
        const rel = stack.pop();
        const abs = rel ? path.join(root, rel) : root;
        let entries;
        try {
            entries = fs.readdirSync(abs, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const ent of entries) {
            const childRelOs = rel ? path.join(rel, ent.name) : ent.name;
            const childRel = normalizeRelPath(childRelOs);
            if (ignoreRel && ignoreRel(childRel)) continue;
            if (ent.isDirectory()) {
                stack.push(childRelOs);
                continue;
            }
            if (ent.isFile()) out.push(childRel);
        }
    }
    out.sort((a, b) => a.localeCompare(b));
    return out;
}

function defaultIgnoreRel(rel) {
    const p = normalizeRelPath(rel).toLowerCase();
    if (p === 'resources/update-baseline.json') return true;
    if (p === 'resources/update-manifest.json') return true;
    if (p.endsWith('.__ts_preserve__') || p.includes('.__ts_preserve__/')) return true;
    return false;
}

/**
 * Group unpacked files into blocks (paths only; digests come from block zips later).
 * @param {string} unpackedDir
 * @returns {{ byBlock: Record<string, string[]>, fileCount: number }}
 */
function collectBlockFileLists(unpackedDir) {
    const root = path.resolve(String(unpackedDir || ''));
    if (!root || !fs.existsSync(root)) throw new Error(`unpacked dir missing: ${root}`);
    /** @type {Record<string, string[]>} */
    const byBlock = Object.fromEntries(BLOCK_NAMES.map((b) => [b, []]));
    const rels = walkFiles(root, { ignoreRel: defaultIgnoreRel });
    for (const rel of rels) {
        const block = assignBlock(rel);
        if (!byBlock[block]) byBlock[block] = [];
        byBlock[block].push(rel);
    }
    return { byBlock, fileCount: rels.length };
}

/**
 * Build a block-only update manifest (no per-file list).
 * Call after block zips exist so sha256/bytes can be filled via finalizeManifestBlocks.
 * @param {{
 *   version: string,
 *   fullZipName?: string,
 *   fullZipBytes?: number,
 * }} opts
 */
function buildBlockManifestSkeleton(opts = {}) {
    const version = String(opts.version || '').trim();
    if (!version) throw new Error('version required');
    const fullZipName = String(opts.fullZipName || require('./release-artifact-names').standardZipName(version)).trim();
    const fullZipBytes = Number(opts.fullZipBytes);
    /** @type {Record<string, { name: string, bytes: number, sha256: string, fileCount: number }>} */
    const blocks = {};
    for (const name of BLOCK_NAMES) {
        blocks[name] = {
            name: blockZipName(version, name),
            bytes: 0,
            sha256: '',
            fileCount: 0,
        };
    }
    return {
        format: MANIFEST_FORMAT,
        version,
        generatedAt: new Date().toISOString(),
        fullZip: fullZipName,
        fullZipBytes: Number.isFinite(fullZipBytes) && fullZipBytes > 0 ? fullZipBytes : 0,
        blocks,
        deltaZip: '',
        deltaZipBytes: 0,
        deltaSha256: '',
        deltaFromVersion: '',
    };
}

/**
 * @deprecated Prefer collectBlockFileLists + buildBlockManifestSkeleton.
 * Kept for tests that still build from a temp tree without zips: synthesizes
 * block digests from sorted file hashes (not published in production).
 */
function buildManifestFromDir(unpackedDir, opts = {}) {
    const version = String(opts.version || '').trim();
    if (!version) throw new Error('version required');
    const root = path.resolve(String(unpackedDir || ''));
    const { byBlock } = collectBlockFileLists(root);
    const manifest = buildBlockManifestSkeleton({
        version,
        fullZipName: opts.fullZipName,
        fullZipBytes: opts.fullZipBytes,
    });
    for (const block of BLOCK_NAMES) {
        const files = byBlock[block] || [];
        const hash = crypto.createHash('sha256');
        let bytes = 0;
        for (const rel of files) {
            const abs = path.join(root, rel);
            const st = fs.statSync(abs);
            const fileSha = sha256File(abs);
            hash.update(rel);
            hash.update('\0');
            hash.update(fileSha);
            hash.update('\0');
            bytes += st.size;
        }
        manifest.blocks[block] = {
            name: blockZipName(version, block),
            bytes,
            sha256: files.length ? hash.digest('hex') : '',
            fileCount: files.length,
        };
    }
    return manifest;
}

/**
 * Fill block zip metadata after archives are written.
 * @param {object} manifest
 * @param {Record<string, { absPath: string, fileCount: number }>} blockZipPaths
 */
function finalizeManifestBlocks(manifest, blockZipPaths) {
    if (!manifest.blocks) manifest.blocks = {};
    for (const block of BLOCK_NAMES) {
        const info = blockZipPaths?.[block];
        if (!info?.absPath || !fs.existsSync(info.absPath)) {
            manifest.blocks[block] = {
                name: blockZipName(manifest.version, block),
                bytes: 0,
                sha256: '',
                fileCount: 0,
            };
            continue;
        }
        const st = fs.statSync(info.absPath);
        manifest.blocks[block] = {
            name: path.basename(info.absPath),
            bytes: st.size,
            sha256: sha256File(info.absPath),
            fileCount: Number(info.fileCount) || 0,
        };
    }
    return manifest;
}

function blockDigest(manifest, block) {
    const b = manifest?.blocks?.[block];
    return String(b?.sha256 || '').toLowerCase();
}

/**
 * Block-level diff (no file list).
 * @returns {{
 *   dirtyBlocks: string[],
 *   dirtyComponents: string[],
 *   downloadBytes: number,
 *   changedFiles: [],
 * }}
 */
function diffManifests(baseline, remote) {
    const dirtyBlocks = [];
    let downloadBytes = 0;
    for (const block of BLOCK_NAMES) {
        const remoteSha = blockDigest(remote, block);
        if (!remoteSha) continue;
        const localSha = blockDigest(baseline, block);
        if (localSha && localSha === remoteSha) continue;
        dirtyBlocks.push(block);
        downloadBytes += Number(remote?.blocks?.[block]?.bytes) || 0;
    }
    return {
        dirtyBlocks,
        dirtyComponents: dirtyBlocks.slice(),
        downloadBytes,
        changedFiles: [],
    };
}

/**
 * @param {{ downloadBytes?: number, dirtyBlocks?: string[], dirtyComponents?: string[] }} diff
 * @param {object|null|undefined} remoteManifest
 * @param {{ deltaZipBytes?: number }} [opts]
 */
function estimateIncrementalDownloadBytes(diff, remoteManifest, opts = {}) {
    const deltaFromOpts = Number(opts.deltaZipBytes);
    if (Number.isFinite(deltaFromOpts) && deltaFromOpts > 0) return deltaFromOpts;
    const deltaFromManifest = Number(remoteManifest?.deltaZipBytes);
    if (Number.isFinite(deltaFromManifest) && deltaFromManifest > 0) return deltaFromManifest;

    const dirty = Array.isArray(diff?.dirtyBlocks) && diff.dirtyBlocks.length
        ? diff.dirtyBlocks
        : (Array.isArray(diff?.dirtyComponents) ? diff.dirtyComponents : []);
    let sum = 0;
    let counted = 0;
    for (const b of dirty) {
        const n = Number(remoteManifest?.blocks?.[b]?.bytes);
        if (Number.isFinite(n) && n > 0) {
            sum += n;
            counted += 1;
        }
    }
    if (counted > 0) return sum;
    return Number(diff?.downloadBytes) || 0;
}

/**
 * @param {{ dirtyBlocks?: string[], dirtyComponents?: string[], changedFiles?: unknown[] }} diff
 * @param {number} fullZipBytes
 * @param {{ hasBaseline?: boolean, deltaZipBytes?: number, remoteManifest?: object }} [opts]
 */
function shouldUseFullZip(diff, fullZipBytes, opts = {}) {
    if (!opts.hasBaseline) return true;
    const dirty = Array.isArray(diff?.dirtyBlocks) && diff.dirtyBlocks.length
        ? diff.dirtyBlocks
        : (Array.isArray(diff?.dirtyComponents) ? diff.dirtyComponents : []);
    if (!dirty.length) return true;
    const full = Number(fullZipBytes) || 0;
    const downloadBytes = estimateIncrementalDownloadBytes(diff, opts.remoteManifest, opts);
    if (full > 0 && downloadBytes > full * FULL_ZIP_BYTE_RATIO) return true;

    const hasDelta = (Number.isFinite(Number(opts.deltaZipBytes)) && Number(opts.deltaZipBytes) > 0)
        || (Number.isFinite(Number(opts.remoteManifest?.deltaZipBytes))
            && Number(opts.remoteManifest.deltaZipBytes) > 0);
    // Without delta, dirty shell+app+engine is usually worse than full slim zip
    if (
        !hasDelta
        && dirty.includes('engine')
        && dirty.includes('shell')
        && (dirty.includes('app') || dirty.includes('other'))
    ) {
        return true;
    }
    return false;
}

function blockZipName(version, block) {
    return `Transub-${String(version).trim()}-win-${block}.zip`;
}

/** @deprecated use blockZipName */
function componentZipName(version, component) {
    return blockZipName(version, component);
}

function deltaZipName(version) {
    return `Transub-${String(version).trim()}-win-delta.zip`;
}

function manifestAssetName(version) {
    return `Transub-${String(version).trim()}-update-manifest.json`;
}

function pickManifestAsset(release) {
    const assets = Array.isArray(release?.assets) ? release.assets : [];
    return assets.find((a) => /update-manifest\.json$/i.test(String(a.name || '')))
        || assets.find((a) => /update-manifest/i.test(String(a.name || '')) && /\.json$/i.test(String(a.name || '')))
        || null;
}

function pickBlockAsset(release, block, version) {
    const assets = Array.isArray(release?.assets) ? release.assets : [];
    const wanted = blockZipName(version, block).toLowerCase();
    const exact = assets.find((a) => String(a.name || '').toLowerCase() === wanted);
    if (exact) return exact;
    // Legacy component zip names from format 1
    const legacy = {
        shell: 'electron',
        other: 'internal',
    };
    const legacyName = legacy[block];
    if (legacyName) {
        const reLegacy = new RegExp(`transub-.*-win-${legacyName}\\.zip$`, 'i');
        const hit = assets.find((a) => reLegacy.test(String(a.name || '')));
        if (hit) return hit;
    }
    const re = new RegExp(`transub-.*-win-${block}\\.zip$`, 'i');
    return assets.find((a) => re.test(String(a.name || ''))) || null;
}

/** @deprecated use pickBlockAsset */
function pickComponentAsset(release, component, version) {
    return pickBlockAsset(release, component, version);
}

function pickDeltaAsset(release, version) {
    const assets = Array.isArray(release?.assets) ? release.assets : [];
    const wanted = deltaZipName(version).toLowerCase();
    const exact = assets.find((a) => String(a.name || '').toLowerCase() === wanted);
    if (exact) return exact;
    return assets.find((a) => /transub-.*-win-delta\.zip$/i.test(String(a.name || ''))) || null;
}

function readJsonFile(absPath) {
    const raw = fs.readFileSync(absPath, 'utf8');
    return JSON.parse(raw);
}

function hasBlockBaseline(json) {
    if (!json || typeof json !== 'object') return false;
    const blocks = json.blocks;
    if (!blocks || typeof blocks !== 'object') return false;
    return BLOCK_NAMES.some((b) => String(blocks[b]?.sha256 || '').trim());
}

function tryReadBaseline(installRoot) {
    const root = path.resolve(String(installRoot || ''));
    const candidates = [
        path.join(root, BASELINE_REL),
        path.join(root, 'resources', 'update-manifest.json'),
    ];
    for (const abs of candidates) {
        if (!fs.existsSync(abs)) continue;
        try {
            const json = readJsonFile(abs);
            if (hasBlockBaseline(json)) return json;
            // Legacy format-1 file lists cannot be used for block checks — skip.
        } catch {
            /* try next */
        }
    }
    return null;
}

function writeBaseline(installRoot, manifest) {
    const root = path.resolve(String(installRoot || ''));
    if (!root) throw new Error('installRoot required');
    const abs = path.join(root, BASELINE_REL);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const payload = {
        format: MANIFEST_FORMAT,
        version: String(manifest?.version || '').trim(),
        fullZip: manifest?.fullZip || '',
        fullZipBytes: Number(manifest?.fullZipBytes) || 0,
        blocks: manifest?.blocks || {},
        savedAt: new Date().toISOString(),
    };
    fs.writeFileSync(abs, `${JSON.stringify(payload)}\n`, 'utf8');
    return abs;
}

/**
 * Verify a downloaded archive against expected sha256.
 * @param {string} absPath
 * @param {string} expectedSha256
 */
function verifyArchiveSha256(absPath, expectedSha256) {
    const want = String(expectedSha256 || '').toLowerCase();
    if (!want) return { ok: true, skipped: true };
    const got = sha256File(absPath);
    if (got !== want) {
        const err = new Error(`增量包校验失败: ${path.basename(absPath)}`);
        err.code = 'checksum';
        err.expectedSha = want.slice(0, 12);
        err.gotSha = String(got || '').slice(0, 12);
        throw err;
    }
    return { ok: true, sha256: got };
}

/**
 * @deprecated Per-file verify removed from update path; kept for older tests.
 */
async function verifyPackageFiles(packageRoot, files, opts = {}) {
    const root = path.resolve(String(packageRoot || ''));
    const list = Array.isArray(files) ? files : [];
    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
    const yieldEvery = 32;
    for (let i = 0; i < list.length; i++) {
        const f = list[i];
        const rel = normalizeRelPath(f.path);
        const abs = path.join(root, rel);
        if (!fs.existsSync(abs)) {
            throw new Error(`增量包缺少文件: ${rel}`);
        }
        const st = fs.statSync(abs);
        if (Number.isFinite(Number(f.size)) && Number(f.size) >= 0 && st.size !== Number(f.size)) {
            throw new Error(`增量文件大小不匹配: ${rel}`);
        }
        const sha = sha256File(abs);
        if (sha !== String(f.sha256 || '').toLowerCase()) {
            throw new Error(`增量文件校验失败: ${rel}`);
        }
        if (onProgress && ((i + 1) % yieldEvery === 0 || i + 1 === list.length)) {
            try { onProgress({ checked: i + 1, total: list.length }); } catch { /* ignore */ }
        }
        if (i + 1 < list.length && (i + 1) % yieldEvery === 0) {
            await new Promise((resolve) => setImmediate(resolve));
        }
    }
    return { ok: true, checked: list.length };
}

module.exports = {
    MANIFEST_FORMAT,
    FULL_ZIP_BYTE_RATIO,
    BASELINE_REL,
    BLOCK_NAMES,
    COMPONENT_NAMES,
    assignBlock,
    assignComponent,
    normalizeRelPath,
    sha256File,
    walkFiles,
    defaultIgnoreRel,
    collectBlockFileLists,
    buildBlockManifestSkeleton,
    buildManifestFromDir,
    finalizeManifestBlocks,
    diffManifests,
    estimateIncrementalDownloadBytes,
    shouldUseFullZip,
    blockZipName,
    componentZipName,
    deltaZipName,
    manifestAssetName,
    pickManifestAsset,
    pickBlockAsset,
    pickComponentAsset,
    pickDeltaAsset,
    tryReadBaseline,
    writeBaseline,
    verifyArchiveSha256,
    verifyPackageFiles,
    readJsonFile,
    hasBlockBaseline,
};
