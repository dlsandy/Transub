/**
 * Verify packaging inputs: renderer-dist assets + main-process src/js requires
 * covered by electron-builder "files". Run after build:renderer (and optionally
 * against an unpacked asar dir via --asar-root=...).
 *
 * Usage:
 *   node tools/verify-packaging.js
 *   node tools/verify-packaging.js --asar-root=path/to/win-unpacked/resources/app.asar
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'src');
const outDir = path.join(root, 'renderer-dist');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const REQUIRED_RENDERER_FILES = [
    'index.html',
    'splash.html',
    'subtitle-editor.html',
    'about.html',
    'update.html',
    'icon.png',
    'icon-64.png',
    'icon-editor.png',
    'tseditor.png',
    'js/app.js',
    'js/features.js',
    'js/subtitle-editor.js',
    'js/subtitle-editor-launcher.js',
    'js/subtitle-editor/boot.js',
    'js/subtitle-editor/modals.js',
    'js/subtitle-editor/prefs.js',
    'js/subtitle-editor/undo.js',
    'js/subtitle-editor/utils.js',
    'js/subtitle-editor/workflows.js',
    'js/about-window.js',
    'js/update-window.js',
    'js/eta-core.js',
    'js/dual-subtitle-core.js',
    'js/transwithai-model-core.js',
    'js/subtitle-text-presets-core.js',
    'js/subtitle-workflows-core.js',
    'js/subtitle-chinese-core.js',
    'js/subtitle-chinese-dict.js',
    'js/subtitle-qc-core.js',
    'js/subtitle-glossary-core.js',
    'js/subtitle-fluency-core.js',
    'js/subtitle-meta-core.js',
    'js/subtitle-split-core.js',
    'vendor/app.css',
    'vendor/font-awesome/css/font-awesome.min.css',
    'vendor/font-awesome/fonts/fontawesome-webfont.woff2',
    'vendor/font-awesome/fonts/fontawesome-webfont.woff',
    'vendor/font-awesome/fonts/fontawesome-webfont.ttf',
];

const HTML_PAGES = [
    'index.html',
    'splash.html',
    'subtitle-editor.html',
    'about.html',
    'update.html',
];

function listJsFiles(dir, acc = []) {
    if (!fs.existsSync(dir)) return acc;
    for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        if (fs.statSync(full).isDirectory()) listJsFiles(full, acc);
        else if (name.endsWith('.js')) acc.push(full);
    }
    return acc;
}

function collectSrcJsRequiresFromElectron() {
    const electronDir = path.join(root, 'electron');
    const required = new Set();
    const re = /require\(\s*['"](\.\.\/src\/js\/[^'"]+)['"]\s*\)/g;
    for (const file of listJsFiles(electronDir)) {
        const text = fs.readFileSync(file, 'utf8');
        let m;
        while ((m = re.exec(text))) {
            let rel = path.normalize(m[1].replace(/^\.\.\//, ''));
            if (!rel.endsWith('.js')) rel = `${rel}.js`;
            required.add(rel);
        }
    }
    // Cores may also require sibling cores / dict
    const srcJs = path.join(root, 'src', 'js');
    for (const file of listJsFiles(srcJs)) {
        if (!/[-]core\.js$/.test(file) && !file.endsWith('subtitle-chinese-dict.js')) continue;
        const text = fs.readFileSync(file, 'utf8');
        const localRe = /require\(\s*['"](\.\/[^'"]+)['"]\s*\)/g;
        let m;
        while ((m = localRe.exec(text))) {
            let rel = path.normalize(path.join('src', 'js', m[1].replace(/^\.\//, '')));
            if (!rel.endsWith('.js')) rel = `${rel}.js`;
            if (fs.existsSync(path.join(root, rel))) required.add(rel);
        }
    }
    return [...required].sort();
}

function packageFilesCover(relPosix) {
    const files = pkg.build?.files || [];
    const normalized = relPosix.replace(/\\/g, '/');
    // electron/**/* covers electron only; src/js must match explicit patterns
    if (normalized.startsWith('electron/')) {
        return files.some((f) => f === 'electron/**/*' || f.startsWith('electron/'));
    }
    if (normalized.startsWith('renderer-dist/')) {
        return files.some((f) => f === 'renderer-dist/**/*' || f.startsWith('renderer-dist/'));
    }
    if (normalized === 'package.json') {
        return files.includes('package.json');
    }
    if (normalized.startsWith('src/js/')) {
        const base = path.posix.basename(normalized);
        if (files.includes('src/js/*-core.js') && /-core\.js$/.test(base)) return true;
        if (files.includes('src/js/subtitle-chinese-dict.js') && base === 'subtitle-chinese-dict.js') {
            return true;
        }
        return files.some((f) => {
            if (f === normalized) return true;
            if (f.endsWith('/**/*') && normalized.startsWith(f.slice(0, -4))) return true;
            return false;
        });
    }
    return false;
}

function extractHtmlLocalAssets(htmlPath) {
    const html = fs.readFileSync(htmlPath, 'utf8');
    const assets = new Set();
    const re = /(?:src|href)=["'](?!https?:|data:|blob:|#|mailto:)([^"']+)["']/gi;
    let m;
    while ((m = re.exec(html))) {
        let rel = m[1].split('?')[0].split('#')[0];
        if (!rel || rel.startsWith('/')) continue;
        assets.add(rel.replace(/^\.\//, ''));
    }
    return [...assets];
}

function asarList(asarRoot) {
    // asarRoot may be a .asar file or an extracted directory
    if (fs.existsSync(asarRoot) && fs.statSync(asarRoot).isDirectory()) {
        return null; // caller walks dir
    }
    try {
        const asar = require('@electron/asar');
        return asar.listPackage(asarRoot);
    } catch (err) {
        console.warn('[verify-packaging] cannot list asar:', err.message);
        return null;
    }
}

function main() {
    const args = process.argv.slice(2);
    const asarArg = args.find((a) => a.startsWith('--asar-root='));
    const asarRoot = asarArg ? asarArg.slice('--asar-root='.length) : '';

    const errors = [];
    const warnings = [];

    if (!fs.existsSync(outDir)) {
        errors.push(`缺少 renderer-dist/，请先运行 npm run build:renderer`);
    } else {
        for (const rel of REQUIRED_RENDERER_FILES) {
            const full = path.join(outDir, rel);
            if (!fs.existsSync(full)) {
                errors.push(`renderer-dist 缺少: ${rel}`);
            }
        }

        for (const page of HTML_PAGES) {
            const htmlPath = path.join(src, page);
            if (!fs.existsSync(htmlPath)) {
                errors.push(`源码缺少 HTML: ${page}`);
                continue;
            }
            for (const asset of extractHtmlLocalAssets(htmlPath)) {
                if (asset.endsWith('.css') && asset.includes('font-awesome')) {
                    // vendored; checked via REQUIRED list
                }
                const inDist = path.join(outDir, asset);
                if (!fs.existsSync(inDist)) {
                    errors.push(`${page} 引用 ${asset}，但 build-renderer 未复制到 renderer-dist`);
                }
            }
        }
    }

    const requiredSrc = collectSrcJsRequiresFromElectron();
    for (const rel of requiredSrc) {
        const full = path.join(root, rel);
        if (!fs.existsSync(full)) {
            errors.push(`electron 引用的模块不存在: ${rel}`);
            continue;
        }
        if (!packageFilesCover(rel.replace(/\\/g, '/'))) {
            errors.push(`package.json build.files 可能未打包: ${rel}`);
        }
    }

    const electronMustExist = [
        'electron/about-window.js',
        'electron/settings-window.js',
        'electron/subtitle-editor-window.js',
        'electron/update-window.js',
        'electron/editor-history.js',
        'electron/text-presets-data.js',
        'electron/editor-workflows-data.js',
        'electron/transwithai-options.js',
        'electron/app-paths.js',
        'electron/installer.nsh',
    ];
    for (const rel of electronMustExist) {
        if (!fs.existsSync(path.join(root, rel))) {
            errors.push(`缺少主进程/打包文件: ${rel}`);
        }
    }

    // installer.nsh is buildResources only — not inside app.asar
    const asarElectronMust = electronMustExist.filter((rel) => !rel.endsWith('.nsh'));

    if (asarRoot) {
        const list = asarList(asarRoot);
        const mustInAsar = [
            ...REQUIRED_RENDERER_FILES.map((f) => `renderer-dist/${f}`),
            ...requiredSrc.map((f) => f.replace(/\\/g, '/')),
            ...asarElectronMust,
        ];
        if (list) {
            const set = new Set(
                list.map((p) => String(p).replace(/\\/g, '/').replace(/^\//, '')),
            );
            for (const rel of mustInAsar) {
                const norm = rel.replace(/\\/g, '/').replace(/^\//, '');
                const found = set.has(norm)
                    || [...set].some((x) => x === norm || x.endsWith(`/${norm}`));
                if (!found) errors.push(`asar 缺少: ${rel}`);
            }
        } else if (fs.existsSync(asarRoot) && fs.statSync(asarRoot).isDirectory()) {
            for (const rel of mustInAsar) {
                if (!fs.existsSync(path.join(asarRoot, rel))) {
                    errors.push(`解包目录缺少: ${rel}`);
                }
            }
        } else {
            warnings.push(`无法校验 asar: ${asarRoot}`);
        }

        // Editor shortcut lives next to exe (outside asar)
        const unpackedRoot = path.dirname(path.dirname(path.resolve(asarRoot)));
        const editorLnk = path.join(unpackedRoot, 'Transub Editor.lnk');
        if (!fs.existsSync(editorLnk)) {
            errors.push(`解包目录缺少 Transub Editor.lnk（期望: ${editorLnk}）`);
        }
    }

    if (warnings.length) {
        console.warn('[verify-packaging] 警告:');
        warnings.forEach((w) => console.warn(`  - ${w}`));
    }
    if (errors.length) {
        console.error('[verify-packaging] 失败:');
        errors.forEach((e) => console.error(`  - ${e}`));
        process.exit(1);
    }
    console.log(
        `[verify-packaging] 通过（renderer ${REQUIRED_RENDERER_FILES.length} 项，主进程 require ${requiredSrc.length} 项`
        + (asarRoot ? '，含 asar 抽查' : '')
        + '）',
    );
}

main();
