const path = require('path');
const fs = require('fs');
const { runRcedit } = require('./rcedit-win');

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
