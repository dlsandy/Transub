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

/** Dev docs stay in the git tree; never ship them next to the exe. */
function purgeShippedDocs(appOutDir) {
    const dirs = [
        path.join(appOutDir, 'docs'),
        path.join(appOutDir, 'resources', 'docs'),
        path.join(appOutDir, 'transub-engine', 'docs'),
    ];
    for (const dir of dirs) {
        if (!fs.existsSync(dir)) continue;
        fs.rmSync(dir, { recursive: true, force: true });
        console.log(`[after-pack] removed shipped docs: ${path.relative(appOutDir, dir)}`);
    }
}

/** Slim-pack hygiene: drop edition wheel cache + pip rename leftovers + on-demand heavies. */
function purgeSlimEngineBloat(appOutDir) {
    const engineRoot = path.join(appOutDir, 'transub-engine');
    if (!fs.existsSync(engineRoot)) return;

    const wheelsEdition = path.join(engineRoot, 'wheels-edition');
    if (fs.existsSync(wheelsEdition)) {
        fs.rmSync(wheelsEdition, { recursive: true, force: true });
        console.log('[after-pack] removed leaked wheels-edition/');
    }

    const sitePackages = path.join(engineRoot, 'runtime', 'Lib', 'site-packages');
    if (!fs.existsSync(sitePackages)) return;

    const onDemandDirs = [
        'nvidia',
        'torch', 'torch.libs', 'torchaudio', 'torchvision',
        'onnxruntime', 'ctranslate2',
        'whisper', 'demucs',
        'av', 'av.libs',
        'numba', 'llvmlite',
        'scipy', 'scipy.libs',
        'jieba',
        'sklearn',
        'sympy',
        'modelscope',
        'transformers',
    ];
    let removed = 0;
    for (const name of onDemandDirs) {
        const full = path.join(sitePackages, name);
        if (!fs.existsSync(full)) continue;
        fs.rmSync(full, { recursive: true, force: true });
        removed += 1;
    }
    // pip leftover rename dirs (~umpy.libs, ~nnxruntime, …)
    let leftovers = 0;
    try {
        for (const ent of fs.readdirSync(sitePackages, { withFileTypes: true })) {
            if (!ent.isDirectory()) continue;
            if (!ent.name.startsWith('~')) continue;
            fs.rmSync(path.join(sitePackages, ent.name), { recursive: true, force: true });
            leftovers += 1;
        }
    } catch (err) {
        console.warn('[after-pack] pip leftover scan failed:', err.message || err);
    }
    // Orphan dist-info for purged packages
    try {
        for (const ent of fs.readdirSync(sitePackages, { withFileTypes: true })) {
            if (!ent.isDirectory()) continue;
            const n = ent.name.toLowerCase();
            const drop = (
                n.startsWith('torch-') || n.startsWith('torchaudio-') || n.startsWith('torchvision-')
                || n.startsWith('onnxruntime-') || n.startsWith('ctranslate2-')
                || n.startsWith('av-') || n.startsWith('numba-') || n.startsWith('llvmlite-')
                || n.startsWith('scipy-') || n.startsWith('jieba-')
                || n.startsWith('scikit_learn-') || n.startsWith('scikit-learn-')
                || n.startsWith('sympy-') || n.startsWith('modelscope-')
                || n.startsWith('transformers-') || n.startsWith('nvidia_')
                || n.startsWith('openai_whisper-') || n.startsWith('demucs-')
            ) && n.includes('.dist-info');
            if (!drop) continue;
            fs.rmSync(path.join(sitePackages, ent.name), { recursive: true, force: true });
            leftovers += 1;
        }
    } catch {
        /* ignore */
    }
    if (removed || leftovers) {
        console.log(`[after-pack] purged on-demand site-packages: dirs=${removed}, extras=${leftovers}`);
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
    try {
        purgeShippedDocs(appOutDir);
    } catch (err) {
        console.warn('[after-pack] docs purge failed:', err.message || err);
    }
    try {
        purgeSlimEngineBloat(appOutDir);
    } catch (err) {
        console.warn('[after-pack] slim engine purge failed:', err.message || err);
    }

    try {
        const editionPath = path.join(appOutDir, 'resources', 'transub-edition.json');
        fs.mkdirSync(path.dirname(editionPath), { recursive: true });
        const version = String(packager.appInfo.version || '').trim();
        const {
            standardZipName,
        } = require('../electron/release-artifact-names');
        fs.writeFileSync(
            editionPath,
            `${JSON.stringify({
                edition: 'standard',
                version,
                role: 'first-install',
                label: '标准版',
                autoUpdateUses: version ? standardZipName(version) : 'Transub-*-win.zip',
                note: 'Automatic updates always download the standard (slim) zip; local ASR/GPU libs are preserved.',
            }, null, 2)}\n`,
            'utf8',
        );
        console.log('[after-pack] wrote resources/transub-edition.json (标准版)');
    } catch (err) {
        console.warn('[after-pack] edition marker failed:', err.message || err);
    }

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
