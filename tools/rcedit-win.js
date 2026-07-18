/**
 * Shared Windows rcedit runner (app-builder-bin preferred, then electron-builder cache).
 */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

function getRceditPath() {
    const cacheRoot = process.env.ELECTRON_BUILDER_CACHE
        || path.join(process.env.LOCALAPPDATA || '', 'electron-builder', 'Cache');
    const candidates = [
        path.join(cacheRoot, 'winCodeSign', 'winCodeSign-2.6.0', 'rcedit-x64.exe'),
        path.join(cacheRoot, 'winCodeSign', 'winCodeSign-2.6.0', 'rcedit-ia32.exe'),
    ];
    return candidates.find((p) => fs.existsSync(p)) || null;
}

function getAppBuilderPath() {
    try {
        return require('app-builder-bin').appBuilderPath;
    } catch {
        return null;
    }
}

/**
 * @param {string[]} args rcedit argv (exe path first, then --set-icon / --set-version-string …)
 */
function runRcedit(args) {
    const appBuilder = getAppBuilderPath();
    if (appBuilder) {
        execFileSync(appBuilder, ['rcedit', '--args', JSON.stringify(args)], { stdio: 'pipe' });
        return;
    }

    const rcedit = getRceditPath();
    if (!rcedit) {
        throw new Error('未找到 rcedit，请先运行一次 electron-builder 以下载构建工具');
    }
    execFileSync(rcedit, args, { stdio: 'pipe' });
}

module.exports = {
    runRcedit,
    getRceditPath,
    getAppBuilderPath,
};
