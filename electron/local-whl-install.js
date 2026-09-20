/**
 * Local .whl validation and pip install helpers (GPU / Demucs manual fallback).
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { assertUserFilePath } = require('./ipc-validate');

const WHL_EXTS = new Set(['.whl']);

const DEFAULT_PIP_INDEX = 'https://mirrors.aliyun.com/pypi/simple';
const DEFAULT_PIP_TRUSTED_HOST = 'mirrors.aliyun.com';

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function normalizeWhlPaths(value) {
    const list = Array.isArray(value) ? value : (value ? [value] : []);
    const out = [];
    const seen = new Set();
    for (const item of list) {
        let resolved;
        try {
            resolved = assertUserFilePath(item, { allowedExts: WHL_EXTS, label: 'Wheel' });
        } catch (_) {
            continue;
        }
        const key = resolved.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(resolved);
    }
    return out;
}

/**
 * Parse PEP 427 version from a wheel basename (best-effort).
 * @param {string} filePath
 * @returns {string}
 */
function parseWhlVersion(filePath) {
    const base = path.basename(String(filePath || ''), '.whl');
    const m = String(base).match(/-(\d+\.\d+(?:\.\d+){0,2})(?:[+-]|$)/);
    return m ? m[1] : '';
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compareWhlSemver(a, b) {
    const pa = String(a || '').split('.').map((x) => Number(x) || 0);
    const pb = String(b || '').split('.').map((x) => Number(x) || 0);
    const n = Math.max(pa.length, pb.length);
    for (let i = 0; i < n; i += 1) {
        const x = pa[i] || 0;
        const y = pb[i] || 0;
        if (x !== y) return x - y;
    }
    return 0;
}

/**
 * Prefer CUDA12 (<1.27) vs CUDA13 (>=1.27) onnxruntime-gpu wheel from opts / driver.
 * @param {object} [opts]
 * @returns {{ target: 'cuda12'|'cuda13', fileName?: string } | null}
 */
function resolveOrtGpuPrefer(opts = {}) {
    try {
        const { resolveOrtGpuManualPackage } = require('./engine-download-info');
        const pkg = resolveOrtGpuManualPackage(opts || {});
        if (pkg?.target === 'cuda12' || pkg?.target === 'cuda13') {
            return { target: pkg.target, fileName: pkg.fileName || '' };
        }
    } catch (_) { /* optional */ }
    const req = String(opts.ortGpuRequirement || '').trim();
    if (/<\s*1\.27/.test(req)) return { target: 'cuda12' };
    if (/>=\s*1\.27/.test(req)) return { target: 'cuda13' };
    return null;
}

/**
 * Pick one onnxruntime-gpu wheel when several were selected.
 * @param {string[]} gpuPaths
 * @param {object} [opts]
 * @returns {string}
 */
function pickOrtGpuWheel(gpuPaths, opts = {}) {
    const list = (Array.isArray(gpuPaths) ? gpuPaths : []).filter(Boolean);
    if (list.length <= 1) return list[0] || '';
    const prefer = resolveOrtGpuPrefer(opts);
    if (prefer?.fileName) {
        const want = String(prefer.fileName).toLowerCase();
        const hit = list.find((p) => path.basename(p).toLowerCase() === want);
        if (hit) return hit;
    }
    const wantCuda13 = prefer?.target === 'cuda13';
    const scored = list.map((p) => {
        const ver = parseWhlVersion(p);
        const parts = ver.split('.').map((x) => Number(x) || 0);
        const minor = (parts[0] || 0) * 1000 + (parts[1] || 0);
        const isCuda13ish = minor >= 1027; // 1.27+
        let score = 0;
        if (wantCuda13) score += isCuda13ish ? 1000 : 0;
        else if (prefer?.target === 'cuda12') score += isCuda13ish ? 0 : 1000;
        else score += 100;
        // Prefer higher patch within the matching band.
        score += Math.min(99, (parts[0] || 0) * 10 + (parts[1] || 0) + Math.min(9, parts[2] || 0) / 10);
        return { p, score, ver };
    });
    scored.sort((a, b) => b.score - a.score || compareWhlSemver(b.ver, a.ver));
    return scored[0].p;
}

/**
 * Auto-fix mutual-exclusion / duplicate ORT wheels and order install so GPU wins.
 * Does not touch torch CPU/CUDA mixes (those still hard-fail in conflict check).
 *
 * @param {string[]} paths already normalized / size-checked
 * @param {object} [opts] ortGpuRequirement / ortGpuDesiredTarget / ortGpuTarget
 * @returns {{ paths: string[], dropped: string[], notes: string[], note: string }}
 */
function resolveWhlVariantSelection(paths, opts = {}) {
    const list = Array.isArray(paths) ? paths.slice() : [];
    /** @type {string[]} */
    const dropped = [];
    /** @type {string[]} */
    const notes = [];

    const isOrtCpu = (p) => guessPackageIdFromWhl(p) === 'onnxruntime';
    const isOrtGpu = (p) => guessPackageIdFromWhl(p) === 'onnxruntime-gpu';

    const ortCpu = list.filter(isOrtCpu);
    const ortGpu = list.filter(isOrtGpu);

    let kept = list.slice();

    if (ortCpu.length && ortGpu.length) {
        for (const p of ortCpu) {
            dropped.push(p);
            notes.push(`已自动忽略 CPU 版 onnxruntime（${path.basename(p)}），保留 onnxruntime-gpu`);
        }
        kept = kept.filter((p) => !isOrtCpu(p));
    }

    const gpuLeft = kept.filter(isOrtGpu);
    if (gpuLeft.length > 1) {
        const keepOne = pickOrtGpuWheel(gpuLeft, opts);
        for (const p of gpuLeft) {
            if (path.resolve(p).toLowerCase() === path.resolve(keepOne).toLowerCase()) continue;
            dropped.push(p);
            notes.push(`已自动忽略多余的 onnxruntime-gpu（${path.basename(p)}），保留 ${path.basename(keepOne)}`);
        }
        const keepKey = path.resolve(keepOne).toLowerCase();
        kept = kept.filter((p) => !isOrtGpu(p) || path.resolve(p).toLowerCase() === keepKey);
    }

    // Install onnxruntime-gpu last so --force-reinstall wins over any CPU ORT leftovers.
    const nonGpu = kept.filter((p) => !isOrtGpu(p));
    const gpuTail = kept.filter(isOrtGpu);
    const ordered = nonGpu.concat(gpuTail);

    return {
        paths: ordered,
        dropped,
        notes,
        note: notes.join('；'),
    };
}

/**
 * @param {string[]} paths
 * @param {object} [opts]
 * @returns {{ ok: true, paths: string[], dropped?: string[], notes?: string[], note?: string } | { ok: false, error: string }}
 */
function validateWhlFiles(paths, opts = {}) {
    const list = normalizeWhlPaths(paths);
    if (!list.length) {
        return { ok: false, error: '请选择至少一个 .whl 文件' };
    }
    for (const filePath of list) {
        if (!fs.existsSync(filePath)) {
            return { ok: false, error: `文件不存在：${path.basename(filePath)}` };
        }
        let st;
        try {
            st = fs.statSync(filePath);
        } catch (err) {
            return { ok: false, error: `无法读取 ${path.basename(filePath)}：${err.message || err}` };
        }
        if (!st.isFile()) {
            return { ok: false, error: `不是文件：${path.basename(filePath)}` };
        }
        if (st.size < 1024) {
            return { ok: false, error: `文件过小，可能不是有效 wheel：${path.basename(filePath)}` };
        }
    }
    const resolved = resolveWhlVariantSelection(list, opts);
    if (!resolved.paths.length) {
        return { ok: false, error: '自动调整后没有可安装的 .whl（请至少保留 onnxruntime-gpu 或其它组件）' };
    }
    const conflict = findWhlVariantConflictError(resolved.paths);
    if (conflict) {
        return { ok: false, error: conflict };
    }
    return {
        ok: true,
        paths: resolved.paths,
        dropped: resolved.dropped,
        notes: resolved.notes,
        note: resolved.note,
    };
}

/**
 * Guess pip package id from a wheel filename (best-effort).
 * nvidia_cublas_cu12-12.x-….whl → nvidia-cublas-cu12
 */
function guessPackageIdFromWhl(filePath) {
    const base = path.basename(String(filePath || ''), '.whl');
    const name = base.split('-')[0] || '';
    return name.replace(/_/g, '-').toLowerCase();
}

const TORCH_FAMILY_IDS = new Set(['torch', 'torchaudio', 'torchvision']);

/**
 * Build a clear Chinese error when multiple wheels map to the same pip package
 * (e.g. CPU + CUDA torch). onnxruntime CPU/GPU mixes are auto-resolved earlier.
 * @param {string[]} paths
 * @returns {string|null}
 */
function findWhlVariantConflictError(paths) {
    const list = Array.isArray(paths) ? paths : [];
    /** @type {Map<string, string[]>} */
    const byPkg = new Map();
    for (const filePath of list) {
        const id = guessPackageIdFromWhl(filePath);
        if (!id) continue;
        const base = path.basename(String(filePath || ''));
        if (!byPkg.has(id)) byPkg.set(id, []);
        byPkg.get(id).push(base);
    }

    for (const [pkgId, files] of byPkg) {
        if (files.length <= 1) continue;
        if (TORCH_FAMILY_IDS.has(pkgId)) {
            const hasCuda = files.some((f) => /\+cu\d+/i.test(f));
            const hasCpu = files.some((f) => !/\+cu\d+/i.test(f));
            if (hasCuda && hasCpu) {
                return `不能同时选择 CPU 与 CUDA 版 ${pkgId}（${files.join('、')}）。有 NVIDIA 独显请只保留 +cu 版；无独显请只保留无 +cu 的 CPU 版。`;
            }
            if (hasCuda) {
                return `不能同时选择多种 CUDA 变体的 ${pkgId}（${files.join('、')}）。请只保留与本机驱动匹配的一项（如 cu126 / cu128 / cu130）。`;
            }
            return `不能同时安装多个 ${pkgId}（${files.join('、')}）。请只保留一个 .whl。`;
        }
        return `不能同时安装多个 ${pkgId}（${files.join('、')}）。请只保留一个 .whl。`;
    }
    return null;
}

/**
 * @param {string[]} wheelPaths
 * @param {{ indexUrl?: string, trustedHost?: string, allowIndex?: boolean }} [opts]
 */
function buildLocalPipInstallArgs(wheelPaths, opts = {}) {
    const validated = validateWhlFiles(wheelPaths, opts);
    if (!validated.ok) {
        throw new Error(validated.error);
    }
    // Default: fully offline. Contacting a PyPI index after download often hangs
    // 10–30 minutes on domestic networks (`pip install --upgrade path.whl`).
    if (opts.allowIndex) {
        const indexUrl = String(opts.indexUrl || DEFAULT_PIP_INDEX).trim() || DEFAULT_PIP_INDEX;
        let trustedHost = String(opts.trustedHost || '').trim();
        if (!trustedHost) {
            try {
                trustedHost = new URL(indexUrl).hostname || DEFAULT_PIP_TRUSTED_HOST;
            } catch (_) {
                trustedHost = DEFAULT_PIP_TRUSTED_HOST;
            }
        }
        return [
            '-m',
            'pip',
            'install',
            '--force-reinstall',
            '-i',
            indexUrl,
            '--trusted-host',
            trustedHost,
            ...validated.paths,
        ];
    }
    return [
        '-m',
        'pip',
        'install',
        '--force-reinstall',
        '--no-deps',
        '--no-index',
        '--no-cache-dir',
        '--disable-pip-version-check',
        ...validated.paths,
    ];
}

/**
 * Run `python -m pip install <wheels…>` with live stdout progress.
 * @param {{
 *   pythonPath: string,
 *   wheelPaths: string[],
 *   signal?: AbortSignal,
 *   onProgress?: (ev: object) => void,
 *   timeoutMs?: number,
 *   indexUrl?: string,
 *   trustedHost?: string,
 * }} opts
 */
function installLocalWheels(opts = {}) {
    const pythonPath = String(opts.pythonPath || '').trim();
    if (!pythonPath || !fs.existsSync(pythonPath)) {
        return Promise.resolve({ ok: false, error: '找不到引擎 Python（runtime\\python.exe）' });
    }

    let args;
    /** @type {string[]} */
    let validatedPaths = [];
    let adjustNote = '';
    try {
        const validated = validateWhlFiles(opts.wheelPaths, opts);
        if (!validated.ok) {
            return Promise.resolve({ ok: false, error: validated.error });
        }
        validatedPaths = validated.paths;
        adjustNote = String(validated.note || '');
        // Paths already validated — build argv without re-running resolve.
        if (opts.allowIndex) {
            const indexUrl = String(opts.indexUrl || DEFAULT_PIP_INDEX).trim() || DEFAULT_PIP_INDEX;
            let trustedHost = String(opts.trustedHost || '').trim();
            if (!trustedHost) {
                try {
                    trustedHost = new URL(indexUrl).hostname || DEFAULT_PIP_TRUSTED_HOST;
                } catch (_) {
                    trustedHost = DEFAULT_PIP_TRUSTED_HOST;
                }
            }
            args = [
                '-m', 'pip', 'install', '--force-reinstall',
                '-i', indexUrl, '--trusted-host', trustedHost,
                ...validatedPaths,
            ];
        } else {
            args = [
                '-m', 'pip', 'install', '--force-reinstall',
                '--no-deps', '--no-index', '--no-cache-dir', '--disable-pip-version-check',
                ...validatedPaths,
            ];
        }
    } catch (err) {
        return Promise.resolve({ ok: false, error: err.message || String(err) });
    }

    const timeoutMs = Math.max(60_000, Number(opts.timeoutMs) || 3_600_000);
    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
    const signal = opts.signal;

    return new Promise((resolve) => {
        if (signal?.aborted) {
            resolve({ ok: false, cancelled: true, error: 'cancelled' });
            return;
        }

        const names = validatedPaths.map((p) => path.basename(p));
        onProgress?.({
            type: 'progress',
            stage: 'install',
            percent: 5,
            detail: adjustNote
                ? `${adjustNote}。正在本地安装 ${names.length} 个组件，请耐心等待…`
                : `正在本地安装 ${names.length} 个组件，请耐心等待…`,
            files: names,
            note: adjustNote,
        });

        /** @type {import('child_process').ChildProcessWithoutNullStreams} */
        let child;
        try {
            const env = {
                ...process.env,
                PYTHONUNBUFFERED: '1',
                PIP_PROGRESS_BAR: 'on',
                PIP_DEFAULT_TIMEOUT: '60',
                PIP_DISABLE_PIP_VERSION_CHECK: '1',
            };
            if (!opts.allowIndex) {
                env.PIP_NO_INDEX = '1';
            }
            child = spawn(pythonPath, args, {
                windowsHide: true,
                env,
            });
        } catch (err) {
            resolve({ ok: false, error: err.message || String(err) });
            return;
        }

        let settled = false;
        const lines = [];
        let lastDetail = '';
        let progressTick = 0;
        const finish = (result) => {
            if (settled) return;
            settled = true;
            try { clearTimeout(timer); } catch (_) { /* ignore */ }
            if (signal) {
                try { signal.removeEventListener('abort', onAbort); } catch (_) { /* ignore */ }
            }
            resolve(result);
        };

        const onAbort = () => {
            try {
                if (process.platform === 'win32' && child.pid) {
                    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
                        windowsHide: true,
                        stdio: 'ignore',
                    });
                } else {
                    child.kill('SIGTERM');
                }
            } catch (_) { /* ignore */ }
            finish({ ok: false, cancelled: true, error: 'cancelled' });
        };

        if (signal) {
            if (signal.aborted) {
                onAbort();
                return;
            }
            signal.addEventListener('abort', onAbort, { once: true });
        }

        const timer = setTimeout(() => {
            try {
                if (process.platform === 'win32' && child.pid) {
                    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
                        windowsHide: true,
                        stdio: 'ignore',
                    });
                } else {
                    child.kill('SIGTERM');
                }
            } catch (_) { /* ignore */ }
            finish({ ok: false, error: `本地 pip 安装超时（>${Math.round(timeoutMs / 60000)} 分钟）` });
        }, timeoutMs);

        const handleChunk = (buf) => {
            const text = buf.toString('utf8');
            const parts = text.split(/\r?\n/);
            for (const line of parts) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                lines.push(trimmed);
                if (lines.length > 80) lines.shift();
                lastDetail = trimmed.slice(0, 200);
                progressTick += 1;
                // Pip rarely emits percent; climb slowly while lines arrive so UI isn't stuck at 40%.
                const softPct = Math.min(88, 35 + Math.min(50, Math.floor(progressTick * 1.2)));
                onProgress?.({
                    type: 'progress',
                    stage: 'install',
                    percent: softPct,
                    detail: lastDetail,
                });
            }
        };

        child.stdout?.on('data', handleChunk);
        child.stderr?.on('data', handleChunk);
        child.on('error', (err) => {
            finish({ ok: false, error: err.message || String(err) });
        });
        child.on('close', (code) => {
            const logTail = lines.slice(-20).join('\n');
            if (code === 0) {
                onProgress?.({
                    type: 'done',
                    stage: 'install',
                    percent: 100,
                    detail: `已安装 ${names.length} 个 wheel`,
                    files: names,
                });
                finish({
                    ok: true,
                    installed: names,
                    files: validatedPaths,
                    note: adjustNote,
                    logTail,
                });
                return;
            }
            const errMsg = lastDetail
                || (logTail ? logTail.slice(-400) : `pip 退出码 ${code}`);
            finish({
                ok: false,
                error: `本地安装失败：${errMsg}`,
                code,
                logTail,
            });
        });
    });
}

module.exports = {
    WHL_EXTS,
    DEFAULT_PIP_INDEX,
    DEFAULT_PIP_TRUSTED_HOST,
    normalizeWhlPaths,
    validateWhlFiles,
    guessPackageIdFromWhl,
    parseWhlVersion,
    resolveWhlVariantSelection,
    pickOrtGpuWheel,
    findWhlVariantConflictError,
    buildLocalPipInstallArgs,
    installLocalWheels,
};
