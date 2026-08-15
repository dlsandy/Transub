const fs = require('fs');
const path = require('path');

const SHELL_DIR = __dirname;

function getProjectRoot() {
    return path.join(SHELL_DIR, '..');
}

/**
 * Directory that contains the running app binaries (exe + extraFiles like `_internal`).
 * Portable builds extract here to a temp folder each launch — user data for portable
 * builds must use PORTABLE_EXECUTABLE_DIR via getWritableRoot() instead.
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
 * Vendored Transub Engine dist next to the app (dev: project/transub-engine).
 * FFmpeg is NOT required here — Transub injects its own `_internal/bin` via FFMPEG_BINARY.
 */
function getBundledEnginePath() {
    return path.join(getInstallRoot(), 'transub-engine');
}

/** True when dir looks like a Transub Engine standalone / source / exe root. */
function isValidEngineRoot(dir) {
    const root = path.resolve(String(dir || '').trim() || '');
    if (!root || !fs.existsSync(root)) return false;
    const runtimePy = process.platform === 'win32'
        ? path.join(root, 'runtime', 'python.exe')
        : path.join(root, 'runtime', 'bin', 'python');
    return (
        fs.existsSync(path.join(root, 'ENGINE_ROOT'))
        || fs.existsSync(runtimePy)
        || fs.existsSync(path.join(root, 'transub-engine.exe'))
        || fs.existsSync(path.join(root, 'dist', 'transub-engine.exe'))
        || fs.existsSync(path.join(root, 'transub_engine'))
        || fs.existsSync(path.join(root, 'pyproject.toml'))
        || fs.existsSync(path.join(root, '.venv', 'Scripts', 'transub-engine.exe'))
        || fs.existsSync(path.join(root, '.venv', 'bin', 'transub-engine'))
    );
}

/** Bundled engine path if present; otherwise empty string. */
function getBundledEnginePathIfPresent() {
    const p = getBundledEnginePath();
    return isValidEngineRoot(p) ? p : '';
}

/**
 * Stable writable root for settings, history, glossary, presets, LLM models, temp meta.
 * Always under the software directory (not Electron userData / AppData):
 * - Portable: next to the real portable .exe (PORTABLE_EXECUTABLE_DIR)
 * - Packaged NSIS / installed: install root (dirname of exe)
 * - Dev: project root
 */
function getWritableRoot(env = process.env) {
    const portableDir = String(env.PORTABLE_EXECUTABLE_DIR || '').trim();
    if (portableDir) {
        return path.resolve(portableDir);
    }
    try {
        const { app } = require('electron');
        if (app?.isPackaged) {
            return getInstallRoot();
        }
    } catch {
        // electron unavailable outside the main process
    }
    return getProjectRoot();
}

/** Former AppData / userData root (pre software-dir layout). Empty when unavailable. */
function getLegacyUserDataRoot() {
    try {
        const { app } = require('electron');
        if (app && typeof app.getPath === 'function') {
            return app.getPath('userData');
        }
    } catch {
        // electron unavailable outside the main process
    }
    return '';
}

function copyFileIfMissing(src, dest) {
    if (!src || !dest || fs.existsSync(dest) || !fs.existsSync(src)) return false;
    try {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
        return true;
    } catch (err) {
        console.warn(`[app-paths] 迁移文件失败 ${path.basename(dest)}:`, err.message);
        return false;
    }
}

function copyDirIfMissing(srcDir, destDir) {
    if (!srcDir || !destDir || !fs.existsSync(srcDir)) return;
    let entries;
    try {
        entries = fs.readdirSync(srcDir, { withFileTypes: true });
    } catch (err) {
        console.warn(`[app-paths] 读取迁移源失败 ${path.basename(srcDir)}:`, err.message);
        return;
    }
    try {
        fs.mkdirSync(destDir, { recursive: true });
    } catch (err) {
        console.warn(`[app-paths] 创建迁移目标失败 ${path.basename(destDir)}:`, err.message);
        return;
    }
    for (const entry of entries) {
        const from = path.join(srcDir, entry.name);
        const to = path.join(destDir, entry.name);
        if (entry.isDirectory()) {
            copyDirIfMissing(from, to);
        } else if (entry.isFile()) {
            copyFileIfMissing(from, to);
        }
    }
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
 * Copy user JSON / advanced-llm from former Electron userData into the software directory.
 * Settings migration also consults userData in settings-data.
 */
function migrateLegacyUserDataFiles(fileNames = [
    'transub-glossary.json',
    'transub-task-history.json',
    'transub-editor-history.json',
    'transub-presets.json',
    'transub-text-presets.json',
    'transub-editor-workflows.json',
    'transub-advanced.json',
    'transub-advanced-device.json',
    'transub-settings.json',
    'ui-prefs.json',
    'window-state.json',
    'transcript-keep-pins.json',
    'transub-sense-memory.json',
]) {
    let writable;
    let legacyRoot;
    try {
        writable = getWritableRoot();
        legacyRoot = getLegacyUserDataRoot();
    } catch {
        return;
    }
    if (!writable || !legacyRoot || path.resolve(writable) === path.resolve(legacyRoot)) {
        return;
    }
    for (const name of fileNames) {
        copyFileIfMissing(path.join(legacyRoot, name), path.join(writable, name));
    }
    // Former nested data/ copies (older builds).
    for (const name of ['transub-settings.json', 'transwithai-settings.json']) {
        copyFileIfMissing(
            path.join(legacyRoot, 'data', name),
            path.join(writable, name === 'transwithai-settings.json' ? 'transub-settings.json' : name),
        );
    }
    copyDirIfMissing(path.join(legacyRoot, 'advanced-llm'), path.join(writable, 'advanced-llm'));
    copyDirIfMissing(path.join(legacyRoot, 'subtitles'), path.join(writable, 'subtitles'));
    copyDirIfMissing(path.join(legacyRoot, 'temp'), path.join(writable, 'temp'));
    copyDirIfMissing(path.join(legacyRoot, 'transwithai-config'), path.join(writable, 'transwithai-config'));
    copyDirIfMissing(path.join(legacyRoot, 'advanced-modules'), path.join(writable, 'advanced-modules'));
    copyDirIfMissing(path.join(legacyRoot, 'backup'), path.join(writable, 'backup'));
    copyDirIfMissing(path.join(legacyRoot, 'tdp'), path.join(writable, 'tdp'));
    copyDirIfMissing(path.join(legacyRoot, 'subtitle-library'), path.join(writable, 'subtitle-library'));
}

module.exports = {
    SHELL_DIR,
    getProjectRoot,
    getInstallRoot,
    getBundledEnginePath,
    getBundledEnginePathIfPresent,
    isValidEngineRoot,
    getWritableRoot,
    getLegacyUserDataRoot,
    findRendererRoot,
    getAppRoot,
    resolveHtmlPath,
    migrateLegacyUserDataFiles,
};
