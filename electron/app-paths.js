const fs = require('fs');
const path = require('path');

const SHELL_DIR = __dirname;

function getProjectRoot() {
    return path.join(SHELL_DIR, '..');
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
    const exeDir = path.dirname(process.execPath);
    const fromExe = findRendererRoot(exeDir);
    if (fromExe) return fromExe;
    const fromResources = findRendererRoot(path.join(process.resourcesPath, 'app'));
    if (fromResources) return fromResources;
    return exeDir;
}

function resolveHtmlPath(app, fileName) {
    return path.join(getAppRoot(app), fileName);
}

module.exports = {
    SHELL_DIR,
    getProjectRoot,
    findRendererRoot,
    getAppRoot,
    resolveHtmlPath,
};
