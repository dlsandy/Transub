/**
 * Resolve and launch external Transub Player (Dock "open app", no media handoff).
 * No algorithms — spawn only.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PLAYER_EXE_NAMES = Object.freeze(['TransubPlayer.exe']);
const PLAYER_DOWNLOAD_URL = 'https://www.transub.cc/en/#download';

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

function pushPlayerDir(candidates, dir, source) {
    const root = String(dir || '').trim();
    if (!root) return;
    for (const name of PLAYER_EXE_NAMES) {
        pushCandidate(candidates, path.join(root, name), source);
    }
}

/**
 * @param {{ playerPath?: string, getAppRoot?: () => string, execPath?: string, env?: NodeJS.ProcessEnv }} [opts]
 * @returns {{ ok: boolean, path?: string, source?: string, candidates?: string[], error?: string }}
 */
function resolveExternalPlayerExe(opts = {}) {
    const env = opts.env || process.env;
    const configured = String(opts.playerPath || '').trim();
    const candidates = [];

    if (configured) pushCandidate(candidates, configured, 'settings');
    if (env.TRANSUB_PLAYER_EXE) pushCandidate(candidates, env.TRANSUB_PLAYER_EXE, 'env');

    const execPath = opts.execPath || process.execPath;
    const execDir = path.dirname(execPath);
    pushPlayerDir(candidates, execDir, 'beside-exe');
    pushPlayerDir(candidates, path.join(execDir, 'Transub Player'), 'beside-player-dir');
    pushPlayerDir(candidates, path.join(execDir, 'TransubPlayer'), 'beside-player-dir-alt');
    pushPlayerDir(candidates, path.join(execDir, 'player'), 'beside-player-short');

    let appRoot = '';
    try {
        appRoot = typeof opts.getAppRoot === 'function' ? String(opts.getAppRoot() || '') : '';
    } catch (_) { /* ignore */ }
    if (appRoot) {
        for (const folder of ['Transub-Player', 'Transub Player', 'TransubPlayer']) {
            const sibling = path.resolve(appRoot, '..', folder);
            pushPlayerDir(candidates, path.join(sibling, 'artifacts', 'pack'), 'dev-pack');
            pushPlayerDir(candidates, path.join(sibling, 'publish'), 'dev-publish');
            pushPlayerDir(
                candidates,
                path.join(sibling, 'src', 'TransubPlayer', 'bin', 'Release', 'net10.0-windows'),
                'dev-csharp-release',
            );
            pushPlayerDir(
                candidates,
                path.join(sibling, 'src', 'TransubPlayer', 'bin', 'Debug', 'net10.0-windows'),
                'dev-csharp-debug',
            );
        }
    }

    const localApp = env.LOCALAPPDATA || '';
    if (localApp) {
        pushPlayerDir(candidates, path.join(localApp, 'Programs', 'Transub Player'), 'localapp-programs');
        pushPlayerDir(candidates, path.join(localApp, 'Programs', 'TransubPlayer'), 'localapp-programs-alt');
        pushPlayerDir(candidates, path.join(localApp, 'Transub Player'), 'localapp');
        pushPlayerDir(candidates, path.join(localApp, 'TransubPlayer'), 'localapp-alt');
    }

    const pf = env.ProgramFiles || env['ProgramFiles'] || '';
    if (pf) {
        pushPlayerDir(candidates, path.join(pf, 'Transub Player'), 'program-files');
        pushPlayerDir(candidates, path.join(pf, 'TransubPlayer'), 'program-files-alt');
    }
    const pf86 = env['ProgramFiles(x86)'] || '';
    if (pf86) {
        pushPlayerDir(candidates, path.join(pf86, 'Transub Player'), 'program-files-x86');
        pushPlayerDir(candidates, path.join(pf86, 'TransubPlayer'), 'program-files-x86-alt');
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
        error: '未找到 Transub Player（TransubPlayer.exe）',
        candidates: candidates.map((x) => x.path),
    };
}

/**
 * Launch Transub Player with no media args (empty window / last session).
 * @param {object} [opts]
 * @returns {{ ok: boolean, pid?: number, exe?: string, source?: string, error?: string, downloadUrl?: string }}
 */
function launchExternalPlayer(opts = {}) {
    const resolved = resolveExternalPlayerExe(opts);
    if (!resolved.ok) {
        return {
            ok: false,
            error: resolved.error,
            candidates: resolved.candidates,
            downloadUrl: PLAYER_DOWNLOAD_URL,
            reason: 'not_installed',
        };
    }
    try {
        const child = spawn(resolved.path, [], {
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
        };
    } catch (err) {
        return {
            ok: false,
            error: err.message || String(err),
            exe: resolved.path,
            downloadUrl: PLAYER_DOWNLOAD_URL,
            reason: 'launch_failed',
        };
    }
}

/**
 * @param {(channel: string, handler: Function) => void} register
 * @param {{ getAppRoot?: () => string }} [deps]
 */
function registerPlayerLaunchRoutes(register, deps = {}) {
    const getAppRoot = typeof deps.getAppRoot === 'function' ? deps.getAppRoot : () => '';
    register('transub-resolve-player', async () => resolveExternalPlayerExe({ getAppRoot }));
    register('transub-open-player', async (_event, payload = {}) => {
        const playerPath = String(payload?.playerPath || '').trim();
        return launchExternalPlayer({
            playerPath,
            getAppRoot,
        });
    });
}

module.exports = {
    PLAYER_EXE_NAMES,
    PLAYER_DOWNLOAD_URL,
    resolveExternalPlayerExe,
    launchExternalPlayer,
    registerPlayerLaunchRoutes,
};
