/**
 * Resolve and launch external Transub Editor (P5).
 * No algorithms — spawn only.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

/** Canonical install alias + Rust binary name (HO-07). */
const EDITOR_EXE_NAMES = ['Transub.Editor.exe', 'transub-editor.exe'];

function normalizeBackend(raw) {
    const v = String(raw || '').trim().toLowerCase();
    if (v === 'external' || v === 'native' || v === 'csharp' || v === 'dotnet') return 'external';
    if (v === 'auto' || v === 'prefer-external' || v === 'prefer_external') return 'auto';
    return 'electron';
}

function normalizeEditorPath(raw) {
    return String(raw || '').trim();
}

function fileExists(p) {
    try {
        return !!(p && fs.existsSync(p) && fs.statSync(p).isFile());
    } catch (_) {
        return false;
    }
}

function pushCandidate(candidates, p, source) {
    const abs = String(p || '').trim();
    if (!abs) return;
    if (candidates.some((c) => c.path === abs)) return;
    candidates.push({ path: abs, source });
}

/** Push both Transub.Editor.exe and transub-editor.exe under a directory. */
function pushEditorDir(candidates, dir, source) {
    const root = String(dir || '').trim();
    if (!root) return;
    for (const name of EDITOR_EXE_NAMES) {
        pushCandidate(candidates, path.join(root, name), source);
    }
}

/**
 * @param {{ subtitleEditorPath?: string, getAppRoot?: () => string, execPath?: string, env?: NodeJS.ProcessEnv }} [opts]
 * @returns {{ ok: boolean, path?: string, source?: string, candidates?: string[] }}
 */
function resolveExternalEditorExe(opts = {}) {
    const env = opts.env || process.env;
    const configured = normalizeEditorPath(opts.subtitleEditorPath);
    const candidates = [];

    if (configured) pushCandidate(candidates, configured, 'settings');
    if (env.TRANSUB_EDITOR_EXE) pushCandidate(candidates, env.TRANSUB_EDITOR_EXE, 'env');

    const execPath = opts.execPath || process.execPath;
    const execDir = path.dirname(execPath);
    pushEditorDir(candidates, execDir, 'beside-exe');
    pushEditorDir(candidates, path.join(execDir, 'Transub.Editor'), 'beside-exe-dir');
    pushEditorDir(candidates, path.join(execDir, 'editor'), 'beside-editor-dir');

    let appRoot = '';
    try {
        appRoot = typeof opts.getAppRoot === 'function' ? String(opts.getAppRoot() || '') : '';
    } catch (_) { /* ignore */ }
    if (appRoot) {
        // Legacy C# sibling (kept for transition).
        const siblingCs = path.resolve(appRoot, '..', 'Transub.Editor');
        pushCandidate(
            candidates,
            path.join(siblingCs, 'src', 'Transub.Editor', 'bin', 'Release', 'net10.0-windows', 'Transub.Editor.exe'),
            'dev-csharp-release',
        );
        pushCandidate(
            candidates,
            path.join(siblingCs, 'src', 'Transub.Editor', 'bin', 'Debug', 'net10.0-windows', 'Transub.Editor.exe'),
            'dev-csharp-debug',
        );
        pushEditorDir(candidates, path.join(siblingCs, 'publish'), 'dev-csharp-publish');

        // Rust workspace sibling: `Transub Editor` (space) or Transub.Editor-rs.
        for (const folder of ['Transub Editor', 'Transub.Editor', 'Transub-Editor']) {
            const siblingRust = path.resolve(appRoot, '..', folder);
            pushEditorDir(candidates, path.join(siblingRust, 'target', 'release'), 'dev-rust-release');
            pushEditorDir(candidates, path.join(siblingRust, 'target', 'debug'), 'dev-rust-debug');
        }
    }

    const localApp = env.LOCALAPPDATA || '';
    if (localApp) {
        pushEditorDir(candidates, path.join(localApp, 'Programs', 'Transub.Editor'), 'localapp-programs');
        pushEditorDir(candidates, path.join(localApp, 'Transub.Editor'), 'localapp');
    }
    const pf = env.ProgramFiles || env['ProgramFiles'] || '';
    if (pf) {
        pushEditorDir(candidates, path.join(pf, 'Transub.Editor'), 'program-files');
    }

    for (const c of candidates) {
        if (fileExists(c.path)) {
            return {
                ok: true,
                path: path.resolve(c.path),
                source: c.source,
                candidates: candidates.map((x) => x.path),
            };
        }
    }
    return {
        ok: false,
        error: '未找到 Transub Editor（Transub.Editor.exe / transub-editor.exe）— 请安装或在设置中指定路径',
        candidates: candidates.map((x) => x.path),
    };
}

/**
 * Build argv for Transub Editor
 * @param {{ subPath?: string, videoPath?: string, mediaPath?: string, from?: string, sourceLanguage?: string, translateTarget?: string, contentProfile?: string, chineseSubtitleVariant?: string, manifestPath?: string }} opts
 */
function buildExternalEditorArgs(opts = {}) {
    const sub = String(opts.subPath || opts.path || '').trim();
    const media = String(opts.mediaPath || opts.videoPath || '').trim();
    const from = String(opts.from || 'transub').trim() || 'transub';
    const src = String(opts.sourceLanguage || opts.src || '').trim();
    const tgt = String(opts.translateTarget || opts.tgt || '').trim();
    const profile = String(opts.contentProfile || opts.profile || '').trim();
    const variant = String(opts.chineseSubtitleVariant || '').trim();
    const manifest = String(opts.manifestPath || opts.manifest || '').trim();

    // Prefer protocol URL when we have language/profile metadata.
    if (sub && (src || tgt || profile || variant || manifest)) {
        const q = new URLSearchParams();
        q.set('sub', path.resolve(sub));
        if (media) q.set('media', path.resolve(media));
        if (src) q.set('src', src);
        if (tgt) q.set('tgt', tgt);
        if (profile) q.set('profile', profile);
        if (variant) q.set('variant', variant);
        if (manifest) q.set('manifest', path.resolve(manifest));
        q.set('from', from);
        return [`transub://edit?${q.toString()}`];
    }

    const args = [];
    if (sub) {
        args.push('--sub', path.resolve(sub));
        if (media) args.push('--media', path.resolve(media));
        if (manifest) args.push('--manifest', path.resolve(manifest));
        args.push('--from', from);
    }
    return args;
}

/**
 * @param {object} opts
 * @returns {{ ok: boolean, pid?: number, exe?: string, source?: string, error?: string, backend?: string }}
 */
function launchExternalEditor(opts = {}) {
    const resolved = resolveExternalEditorExe(opts);
    if (!resolved.ok) {
        return { ok: false, error: resolved.error, candidates: resolved.candidates, backend: 'external' };
    }
    const args = buildExternalEditorArgs(opts);
    try {
        const child = spawn(resolved.path, args, {
            detached: true,
            stdio: 'ignore',
            windowsHide: false,
        });
        child.unref();
        return {
            ok: true,
            pid: child.pid,
            exe: resolved.path,
            source: resolved.source,
            args,
            backend: 'external',
        };
    } catch (err) {
        return {
            ok: false,
            error: err.message || String(err),
            exe: resolved.path,
            backend: 'external',
        };
    }
}

/**
 * Decide whether to use external editor for this open request.
 * @param {{ options?: object, forceElectron?: boolean, forceExternal?: boolean, getAppRoot?: () => string }} ctx
 */
function shouldUseExternalEditor(ctx = {}) {
    if (ctx.forceElectron) return false;
    if (ctx.forceExternal) return true;
    const backend = normalizeBackend(ctx.options?.subtitleEditorBackend);
    if (backend === 'external') return true;
    if (backend === 'auto') {
        const resolved = resolveExternalEditorExe({
            subtitleEditorPath: ctx.options?.subtitleEditorPath,
            getAppRoot: ctx.getAppRoot,
            env: ctx.env,
            execPath: ctx.execPath,
        });
        return !!resolved.ok;
    }
    return false;
}

/** Sidecar stamp path written by Rust Editor on save. */
function writebackStampPath(subPath) {
    const sub = path.resolve(String(subPath || '').trim());
    if (!sub) return '';
    return path.join(path.dirname(sub), `${path.basename(sub)}.transub-editor-saved.json`);
}

/** @type {Map<string, { timer: NodeJS.Timeout, stopAt: NodeJS.Timeout, lastMtime: number }>} */
const _writebackWatches = new Map();

/**
 * Poll Editor writeback stamp next to `subPath` until timeout.
 * @param {string} subPath
 * @param {(info: { subPath: string, stampPath: string, savedAtMs?: number }) => void} onUpdate
 * @param {{ intervalMs?: number, maxMs?: number }} [opts]
 * @returns {() => void} stop
 */
function watchEditorWriteback(subPath, onUpdate, opts = {}) {
    const sub = path.resolve(String(subPath || '').trim());
    const stampPath = writebackStampPath(sub);
    if (!sub || !stampPath || typeof onUpdate !== 'function') {
        return () => {};
    }
    stopEditorWritebackWatch(sub);

    const intervalMs = Math.max(500, Number(opts.intervalMs) || 1500);
    const maxMs = Math.max(intervalMs, Number(opts.maxMs) || 2 * 60 * 60 * 1000);
    let lastMtime = 0;
    try {
        if (fs.existsSync(stampPath)) {
            lastMtime = fs.statSync(stampPath).mtimeMs;
        }
    } catch (_) { /* ignore */ }

    const timer = setInterval(() => {
        try {
            if (!fs.existsSync(stampPath)) return;
            const st = fs.statSync(stampPath);
            if (st.mtimeMs <= lastMtime) return;
            lastMtime = st.mtimeMs;
            let savedAtMs;
            try {
                const raw = JSON.parse(fs.readFileSync(stampPath, 'utf8'));
                if (raw && typeof raw.savedAtMs === 'number') savedAtMs = raw.savedAtMs;
            } catch (_) { /* ignore */ }
            onUpdate({ subPath: sub, stampPath, savedAtMs });
        } catch (_) { /* ignore */ }
    }, intervalMs);

    const stopAt = setTimeout(() => stopEditorWritebackWatch(sub), maxMs);
    _writebackWatches.set(sub.toLowerCase(), { timer, stopAt, lastMtime });
    return () => stopEditorWritebackWatch(sub);
}

function stopEditorWritebackWatch(subPath) {
    const key = path.resolve(String(subPath || '').trim()).toLowerCase();
    const entry = _writebackWatches.get(key);
    if (!entry) return;
    clearInterval(entry.timer);
    clearTimeout(entry.stopAt);
    _writebackWatches.delete(key);
}

/**
 * Open editor preferring external when configured; caller supplies electronFallback().
 * @param {object} payload
 * @param {{ getOptions?: () => object, getAppRoot?: () => string, electronFallback?: (payload: object) => any, onExternalLaunched?: (result: object, payload: object) => void }} deps
 */
function openSubtitleEditorPreferExternal(payload = {}, deps = {}) {
    const options = typeof deps.getOptions === 'function' ? (deps.getOptions() || {}) : {};
    const useExternal = shouldUseExternalEditor({
        options,
        forceElectron: !!payload.forceElectron,
        forceExternal: !!payload.forceExternal,
        getAppRoot: deps.getAppRoot,
    });
    if (!useExternal) {
        return deps.electronFallback
            ? { ok: true, backend: 'electron', ...(deps.electronFallback(payload) || {}) }
            : { ok: false, error: '无 Electron 回退', backend: 'electron' };
    }

    const launched = launchExternalEditor({
        ...payload,
        subtitleEditorPath: options.subtitleEditorPath,
        getAppRoot: deps.getAppRoot,
        from: payload.from || 'transub',
    });
    if (launched.ok) {
        if (typeof deps.onExternalLaunched === 'function') {
            try {
                deps.onExternalLaunched(launched, payload);
            } catch (_) { /* ignore */ }
        }
        return launched;
    }

    // Fall back to Electron so the user is never stuck.
    if (typeof deps.electronFallback === 'function') {
        const fb = deps.electronFallback(payload) || {};
        return {
            ok: true,
            backend: 'electron',
            fallback: true,
            externalError: launched.error,
            ...fb,
        };
    }
    return launched;
}

module.exports = {
    EDITOR_EXE_NAMES,
    normalizeBackend,
    normalizeEditorPath,
    resolveExternalEditorExe,
    buildExternalEditorArgs,
    launchExternalEditor,
    shouldUseExternalEditor,
    openSubtitleEditorPreferExternal,
    writebackStampPath,
    watchEditorWriteback,
    stopEditorWritebackWatch,
};
