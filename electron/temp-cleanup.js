/**
 * Isolate engine job temps under writableRoot/temp/engine-work and sweep leftovers.
 * System %TEMP% stays clean; Electron range-re clips use short-lived transub-* dirs.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getWritableRoot } = require('./app-paths');

/** Electron-side job scratch dirs in os.tmpdir() (not update/install staging). */
const ELECTRON_JOB_TEMP_PREFIXES = [
    'transub-engine-re-',
    'transub-re-',
    'transub-trial-',
    'transub-asr-diagnostics',
];

function getEngineWorkTempRoot() {
    return path.join(getWritableRoot(), 'temp', 'engine-work');
}

function ensureEngineWorkTempRoot() {
    const root = getEngineWorkTempRoot();
    try {
        fs.mkdirSync(root, { recursive: true });
    } catch { /* ignore */ }
    return root;
}

/**
 * Point Python tempfile / third-party scratch at our engine-work dir.
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 */
function applyEngineTempEnv(env = {}) {
    const next = { ...env };
    const root = ensureEngineWorkTempRoot();
    next.TEMP = root;
    next.TMP = root;
    next.TMPDIR = root;
    next.TRANSUB_ENGINE_TEMP = root;
    return next;
}

function _rmPath(target) {
    try {
        fs.rmSync(target, { recursive: true, force: true });
        return true;
    } catch {
        return false;
    }
}

/**
 * Empty engine-work (best-effort). Safe after a job when engine TEMP is redirected here.
 * @returns {{ ok: boolean, removed: number, root: string }}
 */
function clearEngineWorkTemp() {
    const root = getEngineWorkTempRoot();
    let removed = 0;
    if (!fs.existsSync(root)) {
        return { ok: true, removed: 0, root };
    }
    let entries = [];
    try {
        entries = fs.readdirSync(root);
    } catch (err) {
        return { ok: false, removed: 0, root, error: err.message || String(err) };
    }
    for (const name of entries) {
        if (_rmPath(path.join(root, name))) removed += 1;
    }
    return { ok: true, removed, root };
}

/**
 * Remove orphan Electron job dirs from the system temp folder.
 * @param {{ minAgeMs?: number, tmpDir?: string }} [opts]
 */
function sweepElectronJobTemps(opts = {}) {
    const tmpDir = String(opts.tmpDir || os.tmpdir() || '').trim();
    const minAgeMs = Math.max(0, Number(opts.minAgeMs) || 0);
    const now = Date.now();
    let removed = 0;
    if (!tmpDir || !fs.existsSync(tmpDir)) {
        return { ok: true, removed: 0, tmpDir };
    }
    let entries = [];
    try {
        entries = fs.readdirSync(tmpDir, { withFileTypes: true });
    } catch (err) {
        return { ok: false, removed: 0, tmpDir, error: err.message || String(err) };
    }
    for (const ent of entries) {
        const name = String(ent.name || '');
        if (!ELECTRON_JOB_TEMP_PREFIXES.some((p) => name.startsWith(p))) continue;
        const full = path.join(tmpDir, name);
        if (minAgeMs > 0) {
            try {
                const st = fs.statSync(full);
                if (now - Number(st.mtimeMs || 0) < minAgeMs) continue;
            } catch {
                continue;
            }
        }
        if (_rmPath(full)) removed += 1;
    }
    return { ok: true, removed, tmpDir };
}

/**
 * After each media item / batch / cancel: clear engine-work + Electron job orphans.
 * @param {{ minAgeMs?: number }} [opts]
 */
function cleanupAfterJob(opts = {}) {
    const engine = clearEngineWorkTemp();
    const electron = sweepElectronJobTemps(opts);
    return {
        ok: !!(engine.ok && electron.ok),
        engineRemoved: engine.removed || 0,
        electronRemoved: electron.removed || 0,
        engineRoot: engine.root,
    };
}

module.exports = {
    ELECTRON_JOB_TEMP_PREFIXES,
    getEngineWorkTempRoot,
    ensureEngineWorkTempRoot,
    applyEngineTempEnv,
    clearEngineWorkTemp,
    sweepElectronJobTemps,
    cleanupAfterJob,
};
