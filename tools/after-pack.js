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

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** @param {import('electron-builder').AfterPackContext} context */
module.exports = async function afterPack(context) {
    if (process.platform !== 'win32') return;

    const { packager, appOutDir } = context;
    const productFilename = packager.appInfo.productFilename;
    const exePath = path.join(appOutDir, `${productFilename}.exe`);
    const iconPath = path.join(packager.info.buildResourcesDir, 'app.ico');

    const args = [
        exePath,
        '--set-version-string', 'FileDescription', packager.appInfo.description || productFilename,
        '--set-version-string', 'ProductName', packager.appInfo.productName,
        '--set-version-string', 'LegalCopyright', packager.appInfo.copyright,
        '--set-file-version', packager.appInfo.shortVersion || packager.appInfo.buildVersion,
        '--set-product-version', packager.appInfo.shortVersionWindows || packager.appInfo.getVersionInWeirdWindowsForm(),
        '--set-version-string', 'InternalName', productFilename,
        '--set-version-string', 'OriginalFilename', '',
        '--set-version-string', 'CompanyName', packager.appInfo.companyName || productFilename,
    ];

    if (fs.existsSync(iconPath)) {
        args.push('--set-icon', iconPath);
    }

    const maxAttempts = 8;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            runRcedit(args);
            console.log(`[after-pack] 已写入 exe 图标与版本信息 (${productFilename}.exe)`);
            return;
        } catch (err) {
            if (attempt === maxAttempts) {
                throw new Error(`写入 exe 图标失败（已重试 ${maxAttempts} 次）: ${err.message}`);
            }
            console.warn(`[after-pack] rcedit 第 ${attempt} 次失败，${attempt * 500}ms 后重试…`);
            await sleep(attempt * 500);
        }
    }
};
