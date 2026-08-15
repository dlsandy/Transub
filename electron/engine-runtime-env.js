/**
 * Engine install path helpers: runtime python, entrypoints, ffmpeg/CUDA PATH.
 */
const fs = require('fs');
const path = require('path');

function resolvePythonCommand() {
    if (process.env.TRANSUB_ENGINE_PYTHON) {
        return process.env.TRANSUB_ENGINE_PYTHON;
    }
    return process.platform === 'win32' ? 'python' : 'python3';
}

function resolveEngineRuntimePython(installPath) {
    const root = path.resolve(String(installPath || '').trim() || '.');
    const candidates = process.platform === 'win32'
        ? [
            path.join(root, 'runtime', 'python.exe'),
            path.join(root, 'runtime', 'Scripts', 'python.exe'),
        ]
        : [
            path.join(root, 'runtime', 'bin', 'python'),
            path.join(root, 'runtime', 'bin', 'python3'),
        ];
    for (const exe of candidates) {
        if (fs.existsSync(exe)) return exe;
    }
    return '';
}

function resolveEngineEntrypoints(installPath) {
    const root = path.resolve(String(installPath || '').trim() || '.');
    // Prefer standalone dist (embeddable CPython) — not system Python / source tree.
    const runtimePy = resolveEngineRuntimePython(root);
    if (runtimePy) {
        return {
            type: 'module',
            command: runtimePy,
            args: ['-m', 'transub_engine'],
            cwd: root,
            runtime: true,
        };
    }
    const candidates = [
        path.join(root, 'transub-engine.exe'),
        path.join(root, 'dist', 'transub-engine.exe'),
        path.join(root, '.venv', 'Scripts', 'transub-engine.exe'),
        path.join(root, '.venv', 'bin', 'transub-engine'),
    ];
    for (const exe of candidates) {
        if (fs.existsSync(exe)) {
            return { type: 'exe', command: exe, args: [] };
        }
    }
    // Dev / source checkout: system python -m transub_engine
    if (fs.existsSync(path.join(root, 'transub_engine')) || fs.existsSync(path.join(root, 'pyproject.toml'))) {
        return {
            type: 'module',
            command: resolvePythonCommand(),
            args: ['-m', 'transub_engine'],
            cwd: root,
        };
    }
    return null;
}

function findEngineBundledFfmpeg(installPath) {
    const root = path.resolve(String(installPath || '').trim() || '.');
    const names = process.platform === 'win32'
        ? ['ffmpeg.exe', 'ffmpeg']
        : ['ffmpeg', 'ffmpeg.exe'];
    for (const name of names) {
        const candidates = [
            path.join(root, '_internal', 'bin', name),
            path.join(root, '_internal', name),
            path.join(root, 'bin', name),
        ];
        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) return candidate;
        }
    }
    return '';
}

/**
 * Prepend nvidia-* wheel bin dirs (cublas64_12.dll etc.) so CT2/Whisper can use GPU.
 */
function injectNvidiaCudaPathEnv(env, engineInstallPath = '') {
    const next = { ...(env || {}) };
    try {
        const root = path.resolve(String(engineInstallPath || '').trim() || '.');
        const candidates = [
            path.join(root, 'runtime', 'Lib', 'site-packages', 'nvidia'),
            path.join(root, 'runtime', 'lib', 'site-packages', 'nvidia'),
            path.join(root, '.venv', 'Lib', 'site-packages', 'nvidia'),
            path.join(root, 'venv', 'Lib', 'site-packages', 'nvidia'),
            path.join(root, '.venv', 'lib', 'site-packages', 'nvidia'),
        ];
        const sep = path.delimiter;
        const current = String(next.PATH || process.env.PATH || '');
        const lower = new Set(current.split(sep).map((p) => p.toLowerCase()).filter(Boolean));
        const prepend = [];
        for (const nvidiaRoot of candidates) {
            if (!fs.existsSync(nvidiaRoot)) continue;
            let entries = [];
            try {
                entries = fs.readdirSync(nvidiaRoot, { withFileTypes: true });
            } catch {
                continue;
            }
            for (const ent of entries) {
                if (!ent.isDirectory()) continue;
                for (const sub of ['bin', 'lib', path.join('lib', 'x64')]) {
                    const dir = path.join(nvidiaRoot, ent.name, sub);
                    if (!fs.existsSync(dir)) continue;
                    const key = dir.toLowerCase();
                    if (lower.has(key)) continue;
                    lower.add(key);
                    prepend.push(dir);
                }
            }
        }
        if (prepend.length) {
            next.PATH = `${prepend.join(sep)}${sep}${current}`;
        }
        if (engineInstallPath) {
            next.TRANSUB_ENGINE_HOME = path.resolve(String(engineInstallPath).trim());
        }
    } catch { /* ignore */ }
    return next;
}

function injectFfmpegPathEnv(env, ffmpegPathSetting, engineInstallPath = '') {
    const next = { ...env };
    try {
        const ffmpegBridge = require('./ffmpeg-bridge');
        const resolved = ffmpegBridge.resolveFfmpegForExecution(ffmpegPathSetting);
        let exe = resolved?.ok ? String(resolved.path || '').trim() : '';
        // Prefer Transub's bundled ffmpeg — engine dist no longer ships a copy.
        if (!exe || exe === 'ffmpeg') {
            exe = String(ffmpegBridge.findBundledFfmpegPath?.() || '').trim();
        }
        if (!exe || exe === 'ffmpeg') {
            exe = String(findEngineBundledFfmpeg(engineInstallPath) || '').trim();
        }
        if (!exe || exe === 'ffmpeg' || !fs.existsSync(exe)) {
            return injectNvidiaCudaPathEnv(next, engineInstallPath);
        }
        const dir = path.dirname(exe);
        const sep = path.delimiter;
        const current = String(next.PATH || process.env.PATH || '');
        const parts = current.split(sep).map((p) => p.toLowerCase());
        if (!parts.includes(dir.toLowerCase())) {
            next.PATH = `${dir}${sep}${current}`;
        }
        next.FFMPEG_BINARY = exe;
        next.FFMPEG_PATH = exe;
        if (engineInstallPath) {
            next.TRANSUB_ENGINE_HOME = path.resolve(String(engineInstallPath).trim());
        }
    } catch { /* ignore */ }
    return injectNvidiaCudaPathEnv(next, engineInstallPath);
}

module.exports = {
    resolvePythonCommand,
    resolveEngineRuntimePython,
    resolveEngineEntrypoints,
    findEngineBundledFfmpeg,
    injectNvidiaCudaPathEnv,
    injectFfmpegPathEnv,
};
