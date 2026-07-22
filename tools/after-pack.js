const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { runRcedit } = require('./rcedit-win');

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveEditorIcon(appOutDir, buildResourcesDir) {
    const candidates = [
        path.join(appOutDir, 'resources', 'icons', 'editor-app.ico'),
        path.join(buildResourcesDir, 'editor-app.ico'),
        path.join(__dirname, '..', 'electron', 'editor-app.ico'),
    ];
    return candidates.find((p) => fs.existsSync(p)) || '';
}

/** Create "Transub Editor.lnk" next to the exe (zip / dir / NSIS staging). */
function createEditorShortcut(appOutDir, productFilename, buildResourcesDir) {
    const exePath = path.join(appOutDir, `${productFilename}.exe`);
    if (!fs.existsSync(exePath)) {
        console.warn('[after-pack] skip Editor shortcut: exe missing');
        return;
    }
    const lnkPath = path.join(appOutDir, 'Transub Editor.lnk');
    const iconPath = resolveEditorIcon(appOutDir, buildResourcesDir);
    const iconLiteral = iconPath
        ? `'${iconPath.replace(/'/g, "''")},0'`
        : `'${exePath.replace(/'/g, "''")},0'`;
    const ps = [
        `$ws = New-Object -ComObject WScript.Shell`,
        `$lnk = $ws.CreateShortcut('${lnkPath.replace(/'/g, "''")}')`,
        `$lnk.TargetPath = '${exePath.replace(/'/g, "''")}'`,
        `$lnk.Arguments = '--subtitle-editor-only'`,
        `$lnk.WorkingDirectory = '${appOutDir.replace(/'/g, "''")}'`,
        `$lnk.WindowStyle = 1`,
        `$lnk.Description = 'Transub Editor'`,
        `$lnk.IconLocation = ${iconLiteral}`,
        `$lnk.Save()`,
    ].join('; ');
    try {
        execFileSync(
            'powershell.exe',
            ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps],
            { stdio: 'pipe', windowsHide: true },
        );
        console.log('[after-pack] 已创建 Transub Editor.lnk');
    } catch (err) {
        console.warn('[after-pack] 创建 Editor 快捷方式失败:', err.message || err);
    }
}

/** @param {import('electron-builder').AfterPackContext} context */
module.exports = async function afterPack(context) {
    if (process.platform !== 'win32') return;

    const { packager, appOutDir } = context;
    const productFilename = packager.appInfo.productFilename;
    const exePath = path.join(appOutDir, `${productFilename}.exe`);
    const buildResourcesDir = packager.info.buildResourcesDir;
    const iconPath = path.join(buildResourcesDir, 'app.ico');

    createEditorShortcut(appOutDir, productFilename, buildResourcesDir);

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
