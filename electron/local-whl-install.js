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
 * @param {string[]} paths
 * @returns {{ ok: true, paths: string[] } | { ok: false, error: string }}
 */
function validateWhlFiles(paths) {
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
    return { ok: true, paths: list };
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

/**
 * @param {string[]} wheelPaths
 * @param {{ indexUrl?: string, trustedHost?: string, allowIndex?: boolean }} [opts]
 */
function buildLocalPipInstallArgs(wheelPaths, opts = {}) {
    const validated = validateWhlFiles(wheelPaths);
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
    try {
        args = buildLocalPipInstallArgs(opts.wheelPaths, opts);
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

        const names = normalizeWhlPaths(opts.wheelPaths).map((p) => path.basename(p));
        onProgress?.({
            type: 'progress',
            stage: 'install',
            percent: 5,
            detail: `正在本地安装 ${names.length} 个 wheel…`,
            files: names,
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
                onProgress?.({
                    type: 'progress',
                    stage: 'install',
                    percent: 40,
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
                    files: normalizeWhlPaths(opts.wheelPaths),
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
    buildLocalPipInstallArgs,
    installLocalWheels,
};
