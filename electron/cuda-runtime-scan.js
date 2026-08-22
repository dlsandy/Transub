/**
 * Whitelist scan for reusable CUDA companion DLLs (cudart / cublas / cublasLt).
 * Used to skip re-downloading llama.cpp cudart zips when the machine already
 * has a matching NVIDIA toolkit or pip nvidia-* layout.
 *
 * Not a full-disk search: only env paths, NVIDIA toolkit roots, site-packages
 * nvidia trees, and optional extraRoots. Prefers toolkit / nvidia wheels over
 * torch\lib (CT2 / load conflicts). Copies into Transub's own runtime dir.
 */

const fs = require('fs');
const path = require('path');

const MIN_DLL_BYTES = 50 * 1024;

/** @param {number} major */
function requiredDllNames(major) {
    const m = Number(major) || 0;
    if (m < 12) return [];
    return [
        `cudart64_${m}.dll`,
        `cublas64_${m}.dll`,
        `cublasLt64_${m}.dll`,
    ];
}

/** Companion zip artifacts only (same rule as advanced-llama-server). */
function isCompanionArtifactName(name) {
    return /^(cudart|cublasLt|cublas)/i.test(String(name || ''));
}

function pathKey(p) {
    const full = path.resolve(String(p || ''));
    return process.platform === 'win32' ? full.toLowerCase() : full;
}

function isTorchLibPath(absPath) {
    const norm = String(absPath || '').toLowerCase().replace(/\//g, '\\');
    return norm.includes('\\torch\\lib\\') || /[/\\]torch[/\\]lib[/\\]/i.test(norm);
}

/**
 * @param {number} major
 * @returns {string[]}
 */
function defaultEnvCudaKeys(major) {
    const m = Number(major) || 0;
    const keys = ['CUDA_PATH'];
    if (m === 12) {
        for (let i = 9; i >= 0; i -= 1) keys.push(`CUDA_PATH_V12_${i}`);
    } else if (m === 13) {
        for (let i = 5; i >= 0; i -= 1) keys.push(`CUDA_PATH_V13_${i}`);
    } else if (m >= 12) {
        for (let i = 9; i >= 0; i -= 1) keys.push(`CUDA_PATH_V${m}_${i}`);
    }
    return keys;
}

/**
 * @param {object} [opts]
 * @param {number} opts.major CUDA major (12 / 13)
 * @param {string[]} [opts.extraRoots]
 * @param {NodeJS.ProcessEnv} [opts.env]
 * @param {boolean} [opts.includePath=true]
 * @returns {{ id: string, label: string, dirs: string[], rank: number }[]}
 */
function listWhitelistPools(opts = {}) {
    const major = Number(opts.major) || 0;
    const env = opts.env || process.env;
    const includePath = opts.includePath !== false;
    /** @type {{ id: string, label: string, dirs: string[], rank: number }[]} */
    const pools = [];
    const seenPool = new Set();

    const pushPool = (id, label, dirs, rank) => {
        const cleaned = [];
        const seenDir = new Set();
        for (const raw of dirs || []) {
            const dir = path.resolve(String(raw || '').trim());
            if (!dir) continue;
            const key = pathKey(dir);
            if (seenDir.has(key)) continue;
            seenDir.add(key);
            try {
                if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;
            } catch (_) {
                continue;
            }
            cleaned.push(dir);
        }
        if (!cleaned.length) return;
        const poolKey = `${id}|${cleaned.map(pathKey).sort().join(';')}`;
        if (seenPool.has(poolKey)) return;
        seenPool.add(poolKey);
        pools.push({ id, label, dirs: cleaned, rank });
    };

    for (const key of defaultEnvCudaKeys(major)) {
        const root = String(env[key] || '').trim();
        if (!root) continue;
        const bin = process.platform === 'win32'
            ? path.join(root, 'bin')
            : path.join(root, 'lib64');
        pushPool(`env:${key}`, `环境变量 ${key}`, [bin, root], 10);
    }

    if (process.platform === 'win32') {
        const toolkitBase = path.join(
            process.env['ProgramFiles'] || 'C:\\Program Files',
            'NVIDIA GPU Computing Toolkit',
            'CUDA',
        );
        try {
            if (fs.existsSync(toolkitBase)) {
                const prefix = major >= 12 ? `v${major}` : 'v12';
                const children = fs.readdirSync(toolkitBase)
                    .filter((n) => n.toLowerCase().startsWith(prefix.toLowerCase()))
                    .sort()
                    .reverse();
                for (const name of children) {
                    pushPool(
                        `toolkit:${name}`,
                        `NVIDIA CUDA Toolkit ${name}`,
                        [path.join(toolkitBase, name, 'bin')],
                        20,
                    );
                }
            }
        } catch (_) { /* ignore */ }
    }

    const sitePackageRoots = [];
    for (const raw of opts.extraRoots || []) {
        const root = path.resolve(String(raw || '').trim());
        if (root) sitePackageRoots.push(root);
    }
    // Common engine / venv layouts beside userData when caller passes engine roots.
    for (const sp of sitePackageRoots) {
        const nvidiaRoot = path.basename(sp).toLowerCase() === 'nvidia'
            ? sp
            : path.join(sp, 'nvidia');
        const dirs = nvidiaPackageBinDirs(nvidiaRoot, major);
        if (dirs.length) {
            pushPool(`pip-nvidia:${pathKey(nvidiaRoot)}`, 'pip nvidia CUDA 包', dirs, 30);
        }
        // Flat bin next to site-packages root (rare)
        pushPool(`extra:${pathKey(sp)}`, '额外运行库目录', [sp, path.join(sp, 'bin')], 40);
    }

    if (includePath) {
        const parts = String(env.PATH || env.Path || '').split(path.delimiter);
        for (const part of parts) {
            const dir = String(part || '').trim();
            if (!dir) continue;
            // Only keep PATH entries that already contain the marker cudart — avoids noise.
            const marker = path.join(dir, `cudart64_${major}.dll`);
            if (!fs.existsSync(marker)) continue;
            if (isTorchLibPath(dir)) {
                pushPool(`path-torch:${pathKey(dir)}`, 'PATH（torch\\lib，次选）', [dir], 90);
            } else {
                pushPool(`path:${pathKey(dir)}`, 'PATH 中的 CUDA 目录', [dir], 50);
            }
        }
    }

    return pools.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
}

/**
 * @param {string} nvidiaRoot
 * @param {number} major
 * @returns {string[]}
 */
function nvidiaPackageBinDirs(nvidiaRoot, major) {
    const root = String(nvidiaRoot || '').trim();
    if (!root || !fs.existsSync(root)) return [];
    const cu = `cu${major}`;
    const candidates = [
        path.join(root, 'cuda_runtime', 'bin'),
        path.join(root, 'cublas', 'bin'),
        path.join(root, 'cuda_runtime', 'lib'),
        path.join(root, 'cublas', 'lib'),
        path.join(root, cu, 'bin'),
        path.join(root, cu, 'bin', 'x86_64'),
        path.join(root, cu, 'lib'),
        path.join(root, cu, 'lib', 'x86_64'),
    ];
    return candidates.filter((d) => {
        try {
            return fs.existsSync(d) && fs.statSync(d).isDirectory();
        } catch (_) {
            return false;
        }
    });
}

/**
 * Collect companion DLL basenames → absolute paths from a pool.
 * @param {string[]} dirs
 * @param {number} major
 * @returns {Map<string, { abs: string, size: number }>}
 */
function collectCompanionDllMap(dirs, major) {
    const required = new Set(requiredDllNames(major).map((n) => n.toLowerCase()));
    /** @type {Map<string, { abs: string, size: number }>} */
    const map = new Map();
    for (const dir of dirs || []) {
        let names = [];
        try {
            names = fs.readdirSync(dir);
        } catch (_) {
            continue;
        }
        for (const name of names) {
            if (!isCompanionArtifactName(name)) continue;
            const abs = path.join(dir, name);
            let st;
            try {
                st = fs.statSync(abs);
            } catch (_) {
                continue;
            }
            if (!st.isFile() || st.size < MIN_DLL_BYTES) continue;
            const key = name.toLowerCase();
            // Prefer required major markers; still keep other companion DLLs for copy.
            if (!required.has(key) && !/^cudart|^cublas/i.test(name)) continue;
            const prev = map.get(key);
            if (!prev || st.size > prev.size) {
                map.set(key, { abs, size: st.size });
            }
        }
    }
    return map;
}

/**
 * @param {Map<string, { abs: string, size: number }>} dllMap
 * @param {number} major
 * @returns {{ ok: boolean, missing: string[] }}
 */
function validateCompanionDllMap(dllMap, major) {
    const missing = [];
    for (const name of requiredDllNames(major)) {
        if (!dllMap.has(name.toLowerCase())) missing.push(name);
    }
    return { ok: missing.length === 0, missing };
}

/**
 * Rank: lower is better. Penalize torch\lib and incomplete sets.
 * @param {{ rank: number, dllMap: Map<string, { abs: string, size: number }> }} candidate
 */
function scoreCandidate(candidate) {
    let score = Number(candidate.rank) || 50;
    let torchHits = 0;
    let totalSize = 0;
    for (const entry of candidate.dllMap.values()) {
        totalSize += entry.size || 0;
        if (isTorchLibPath(entry.abs)) torchHits += 1;
    }
    if (torchHits) score += 40 + torchHits * 5;
    // Prefer fuller / larger real installs slightly.
    score -= Math.min(10, Math.floor(totalSize / (50 * 1024 * 1024)));
    return score;
}

/**
 * Scan whitelist locations for a reusable CUDA companion set.
 * @param {object} [opts]
 * @param {number} opts.major
 * @param {string[]} [opts.extraRoots]
 * @param {NodeJS.ProcessEnv} [opts.env]
 * @param {boolean} [opts.includePath]
 * @returns {{
 *   ok: boolean,
 *   major: number,
 *   required: string[],
 *   candidates: object[],
 *   best: object|null,
 * }}
 */
function scanReusableCudaRuntimes(opts = {}) {
    const major = Number(opts.major) || 0;
    const required = requiredDllNames(major);
    if (!required.length) {
        return { ok: false, major, required: [], candidates: [], best: null };
    }

    const pools = listWhitelistPools(opts);
    /** @type {object[]} */
    const candidates = [];
    for (const pool of pools) {
        const dllMap = collectCompanionDllMap(pool.dirs, major);
        const check = validateCompanionDllMap(dllMap, major);
        if (!check.ok) continue;
        const files = [...dllMap.values()].map((v) => v.abs);
        const candidate = {
            id: pool.id,
            label: pool.label,
            dirs: pool.dirs,
            rank: pool.rank,
            dllMap,
            files,
            fileCount: files.length,
            source: pool.id.split(':')[0],
        };
        candidate.score = scoreCandidate(candidate);
        candidates.push(candidate);
    }

    candidates.sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));
    const best = candidates[0] || null;
    return {
        ok: !!best,
        major,
        required,
        candidates: candidates.map((c) => ({
            id: c.id,
            label: c.label,
            source: c.source,
            dirs: c.dirs,
            fileCount: c.fileCount,
            files: c.files,
            score: c.score,
        })),
        best: best
            ? {
                id: best.id,
                label: best.label,
                source: best.source,
                dirs: best.dirs,
                fileCount: best.fileCount,
                files: best.files,
                score: best.score,
                dllMap: best.dllMap,
            }
            : null,
    };
}

/**
 * Copy validated companion DLLs into destDir (flat). Prefer hardlink, fall back to copy.
 * @param {object} candidate from scanReusableCudaRuntimes().best
 * @param {string} destDir
 * @returns {{ ok: boolean, files: string[], error?: string, linked?: number, copied?: number }}
 */
function copyReusableCudaRuntime(candidate, destDir) {
    const dest = path.resolve(String(destDir || '').trim());
    if (!dest) return { ok: false, files: [], error: 'dest_missing' };
    const dllMap = candidate?.dllMap;
    if (!dllMap || !(dllMap instanceof Map) || !dllMap.size) {
        // Rebuild from files list when dllMap stripped (IPC / tests).
        if (!Array.isArray(candidate?.files) || !candidate.files.length) {
            return { ok: false, files: [], error: 'candidate_empty' };
        }
    }

    /** @type {{ name: string, abs: string }[]} */
    const entries = [];
    if (dllMap instanceof Map) {
        for (const [key, info] of dllMap.entries()) {
            entries.push({ name: path.basename(info.abs) || key, abs: info.abs });
        }
    } else {
        for (const abs of candidate.files) {
            entries.push({ name: path.basename(abs), abs });
        }
    }

    try {
        fs.mkdirSync(dest, { recursive: true });
    } catch (err) {
        return { ok: false, files: [], error: err?.message || String(err) };
    }

    /** @type {string[]} */
    const outFiles = [];
    let linked = 0;
    let copied = 0;
    try {
        for (const { name, abs } of entries) {
            if (!name || !fs.existsSync(abs)) {
                return { ok: false, files: outFiles, error: `missing:${name || abs}` };
            }
            const to = path.join(dest, name);
            try {
                if (fs.existsSync(to)) fs.unlinkSync(to);
            } catch (_) { /* ignore */ }
            let ok = false;
            try {
                fs.linkSync(abs, to);
                linked += 1;
                ok = true;
            } catch (_) {
                fs.copyFileSync(abs, to);
                copied += 1;
                ok = true;
            }
            if (!ok) return { ok: false, files: outFiles, error: `copy_failed:${name}` };
            outFiles.push(to);
        }
    } catch (err) {
        return { ok: false, files: outFiles, error: err?.message || String(err) };
    }

    return { ok: true, files: outFiles, linked, copied };
}

/**
 * Convenience: scan + copy into dest. Falls back cleanly when nothing found.
 * @param {object} opts scan opts + { destDir }
 */
function tryReuseSystemCudaCompanion(opts = {}) {
    const destDir = String(opts.destDir || '').trim();
    if (!destDir) return { ok: false, code: 'dest_missing' };
    const scan = scanReusableCudaRuntimes(opts);
    if (!scan.best) {
        return {
            ok: false,
            code: 'not_found',
            major: scan.major,
            required: scan.required,
            candidates: scan.candidates,
        };
    }
    const copied = copyReusableCudaRuntime(scan.best, destDir);
    if (!copied.ok) {
        return {
            ok: false,
            code: 'copy_failed',
            error: copied.error,
            best: summarizeBest(scan.best),
        };
    }
    return {
        ok: true,
        code: 'reused',
        best: summarizeBest(scan.best),
        files: copied.files,
        linked: copied.linked,
        copied: copied.copied,
    };
}

function summarizeBest(best) {
    if (!best) return null;
    return {
        id: best.id,
        label: best.label,
        source: best.source,
        dirs: best.dirs,
        fileCount: best.fileCount,
        files: best.files,
        score: best.score,
    };
}

/**
 * Resolve common engine site-packages roots for optional extraRoots.
 * @param {string} engineRoot
 * @returns {string[]}
 */
function engineNvidiaExtraRoots(engineRoot) {
    const root = path.resolve(String(engineRoot || '').trim() || '');
    if (!root) return [];
    const bases = [
        path.join(root, 'runtime', 'Lib', 'site-packages'),
        path.join(root, 'runtime', 'lib', 'site-packages'),
        path.join(root, '.venv', 'Lib', 'site-packages'),
        path.join(root, 'venv', 'Lib', 'site-packages'),
    ];
    return bases.filter((p) => {
        try {
            return fs.existsSync(p) && fs.statSync(p).isDirectory();
        } catch (_) {
            return false;
        }
    });
}

module.exports = {
    MIN_DLL_BYTES,
    requiredDllNames,
    isCompanionArtifactName,
    listWhitelistPools,
    nvidiaPackageBinDirs,
    collectCompanionDllMap,
    validateCompanionDllMap,
    scanReusableCudaRuntimes,
    copyReusableCudaRuntime,
    tryReuseSystemCudaCompanion,
    engineNvidiaExtraRoots,
    // test helper
    _isTorchLibPath: isTorchLibPath,
};
