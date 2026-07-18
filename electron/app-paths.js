const fs = require('fs');
const path = require('path');

const SHELL_DIR = __dirname;

function getProjectRoot() {
    return path.join(SHELL_DIR, '..');
}

/**
 * Directory that contains the running app binaries (exe + extraFiles like `_internal`).
 * Portable builds extract here to a temp folder each launch — do NOT store user settings here.
 */
function getInstallRoot() {
    try {
        const { app } = require('electron');
        if (app?.isPackaged) {
            return path.dirname(process.execPath);
        }
    } catch {
        // electron unavailable outside the main process
    }
    return getProjectRoot();
}

/**
 * Stable writable root for settings, history, glossary, presets, temp meta.
 * - Portable: next to the real portable .exe (PORTABLE_EXECUTABLE_DIR)
 * - Packaged NSIS / installed: Electron userData (survives upgrades)
 * - Dev: project root
 */
function getWritableRoot(env = process.env) {
    const portableDir = String(env.PORTABLE_EXECUTABLE_DIR || '').trim();
    if (portableDir) {
        return path.resolve(portableDir);
    }
    try {
        const { app } = require('electron');
        if (app?.isPackaged && typeof app.getPath === 'function') {
            return app.getPath('userData');
        }
    } catch {
        // electron unavailable outside the main process
    }
    return getProjectRoot();
}

function findRendererRoot(baseDir) {
    const candidates = [
        path.join(baseDir, 'src'),
        path.join(baseDir, 'renderer-dist'),
        baseDir,
    ];
    for (const dir of candidates) {
        if (fs.existsSync(path.join(dir, 'index.html'))) {
            return dir;
        }
    }
    return null;
}

function getAppRoot(app) {
    const arg = process.argv.find((a) => a.startsWith('--app-root='));
    if (arg) {
        const root = path.resolve(arg.slice('--app-root='.length));
        return findRendererRoot(root) || root;
    }
    if (!app.isPackaged) {
        return path.join(getProjectRoot(), 'src');
    }
    // Packaged UI lives inside app.asar (renderer-dist), not next to the exe,
    // so HTML/JS/CSS cannot be casually edited as loose files.
    const fromAsar = findRendererRoot(app.getAppPath());
    if (fromAsar) return fromAsar;
    const fromResources = findRendererRoot(path.join(process.resourcesPath, 'app'));
    if (fromResources) return fromResources;
    const exeDir = path.dirname(process.execPath);
    const fromExe = findRendererRoot(exeDir);
    if (fromExe) return fromExe;
    return exeDir;
}

function resolveHtmlPath(app, fileName) {
    return path.join(getAppRoot(app), fileName);
}

/**
 * Copy user JSON files from the old next-to-exe location into the stable writable root.
 * Settings migration is handled in settings-data; this covers glossary / history / presets.
 */
function migrateLegacyUserDataFiles(fileNames = [
    'transub-glossary.json',
    'transub-task-history.json',
    'transub-presets.json',
]) {
    let writable;
    let install;
    try {
        writable = getWritableRoot();
        install = getInstallRoot();
    } catch {
        return;
    }
    if (!writable || !install || path.resolve(writable) === path.resolve(install)) {
        return;
    }
    for (const name of fileNames) {
        const dest = path.join(writable, name);
        const src = path.join(install, name);
        if (fs.existsSync(dest) || !fs.existsSync(src)) continue;
        try {
            fs.mkdirSync(writable, { recursive: true });
            fs.copyFileSync(src, dest);
        } catch (err) {
            console.warn(`[app-paths] 迁移 ${name} 失败:`, err.message);
        }
    }
}

module.exports = {
    SHELL_DIR,
    getProjectRoot,
    getInstallRoot,
    getWritableRoot,
    findRendererRoot,
    getAppRoot,
    resolveHtmlPath,
    migrateLegacyUserDataFiles,
};
