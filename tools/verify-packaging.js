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
    'update-progress.html',
    'advanced-llm-pick.html',
    'icon.png',
    'icon-64.png',
    'icon-editor.png',
    'tseditor.png',
    'js/app.js',
    'js/main-ui-ux.js',
    'js/av-makers-embed.js',
    'js/setup-wizard.js',
    'js/settings-editor-prefs.js',
    'js/advanced-settings.js',
    'js/features.js',
    'js/subtitle-editor.js',
    'js/subtitle-editor-launcher.js',
    'js/subtitle-editor/boot.js',
    'js/subtitle-editor/modals.js',
    'js/subtitle-editor/prefs.js',
    'js/subtitle-editor/undo.js',
    'js/subtitle-editor/utils.js',
    'js/subtitle-editor/workflows.js',
    'js/subtitle-editor/inference-progress.js',
    'js/subtitle-editor/layout.js',
    'js/subtitle-editor/kept-and-markers.js',
    'js/subtitle-editor/qc-worker-client.js',
    'js/subtitle-editor/find-worker-client.js',
    'js/subtitle-editor/workspace-ui.js',
    'js/about-window.js',
    'js/update-window.js',
    'js/update-progress.js',
    'js/advanced-llm-pick-window.js',
    'js/eta-core.js',
    'js/media-extensions-core.js',
    'js/content-profile-core.js',
    'js/advanced-entitlement-core.js',
    'js/advanced-license-crypto-core.js',
    'js/advanced-managed-llm-catalog-core.js',
    'js/sakura-mt-catalog-core.js',
    'js/sakura-translate-core.js',
    'js/dual-subtitle-core.js',
    'js/transwithai-model-core.js',
    'js/subtitle-text-presets-core.js',
    'js/subtitle-workflows-core.js',
    'js/subtitle-chinese-core.js',
    'js/subtitle-chinese-dict.js',
    'js/subtitle-qc-core.js',
    'js/subtitle-glossary-core.js',
    'js/subtitle-fluency-core.js',
    'js/mt-sanitize-core.js',
    'js/mt-opaque-strings.js',
    'js/subtitle-meta-core.js',
    'js/subtitle-split-core.js',
    'js/transcript-compare-core.js',
    'js/editor-markers-core.js',
    'js/export-checklist-core.js',
    'js/cue-list-window-core.js',
    'js/undo-patch-core.js',
    'js/timeline-magnet-core.js',
    'js/editor-workspace-core.js',
    'js/bilingual-review-core.js',
    'js/find-replace-core.js',
    'js/speaker-suggest-core.js',
    'js/env-check.js',
    'js/manual-whl-install.js',
    // Loaded via new Worker(), not <script src> — easy to miss in packaging audits
    'js/subtitle-qc-worker.js',
    'js/subtitle-find-worker.js',
    'vendor/app.css',
    'vendor/font-awesome/css/font-awesome.min.css',
    'vendor/font-awesome/fonts/fontawesome-webfont.woff2',
    'vendor/font-awesome/fonts/fontawesome-webfont.woff',
    'vendor/font-awesome/fonts/fontawesome-webfont.ttf',
];

const ELECTRON_MUST_EXIST = [
    'electron/main.js',
    'electron/preload.js',
    'electron/bridge-registry.js',
    'electron/engine-bridge.js',
    'electron/engine-client.js',
    'electron/engine-options.js',
    'electron/engine-job-options.js',
    'electron/engine-audio-options.js',
    'electron/engine-mt-adapter.js',
    'electron/advanced-bridge.js',
    'electron/advanced-gates.js',
    'electron/sakura-mt.js',
    'electron/sakura-translate.js',
    'electron/transwithai-bridge.js',
    'electron/extensions-bridge.js',
];

const HTML_PAGES = [
    'index.html',
    'splash.html',
    'subtitle-editor.html',
    'about.html',
    'update.html',
    'update-progress.html',
    'advanced-llm-pick.html',
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

function packageFilesCover(relPosix) {
    const files = pkg.build?.files || [];
    const normalized = relPosix.replace(/\\/g, '/');
    // Explicit exclusions win (closed-source Pro algorithm sources)
    for (const f of files) {
        if (typeof f !== 'string' || !f.startsWith('!')) continue;
        const neg = f.slice(1).replace(/\\/g, '/');
        if (neg === normalized) return false;
        if (neg.endsWith('/**/*') && normalized.startsWith(neg.slice(0, -4))) return false;
        if (neg.includes('*')) {
            // simple basename / prefix globs used in package.json
            const re = new RegExp(`^${neg.replace(/\./g, '\\.').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')}$`);
            if (re.test(normalized)) return false;
        }
    }
    // electron/**/* covers electron only; src/js must match explicit patterns
    if (normalized.startsWith('electron/')) {
        return files.some((f) => f === 'electron/**/*' || (typeof f === 'string' && f.startsWith('electron/') && !f.startsWith('!')));
    }
    if (normalized.startsWith('renderer-dist/')) {
        return files.some((f) => f === 'renderer-dist/**/*' || f.startsWith('renderer-dist/'));
    }
    if (normalized === 'package.json') {
        return files.includes('package.json');
    }
    if (normalized.startsWith('src/js/')) {
        const base = path.posix.basename(normalized);
        if (files.includes('src/js/*-core.js') && /-core\.js$/.test(base)) {
            // still respect !src/js/... exclusions above
            return true;
        }
        if (files.includes('src/js/subtitle-chinese-dict.js') && base === 'subtitle-chinese-dict.js') {
            return true;
        }
        if (files.includes('src/js/tone-adapt.tz1') && base === 'tone-adapt.tz1') {
            return true;
        }
        if (files.includes('src/js/av-makers.am1') && base === 'av-makers.am1') {
            return true;
        }
        if (files.includes('src/js/av-makers-embed.js') && base === 'av-makers-embed.js') {
            return true;
        }
        return files.some((f) => {
            if (f === normalized) return true;
            if (f.endsWith('/**/*') && normalized.startsWith(f.slice(0, -4))) return true;
            return false;
        });
    }
    if (normalized.startsWith('shared/')) {
        return files.some((f) => {
            if (f === normalized) return true;
            if (f === 'shared/**/*') return true;
            if (typeof f === 'string' && f.startsWith('shared/') && !f.startsWith('!')) return true;
            return false;
        });
    }
    return false;
}

/** Pro algorithm sources: shipped only via minified `_advanced`, not app.asar */
const PROPRIETARY_ASAR_FORBIDDEN = [
    'electron/advanced-context-reconstruct.js',
    'electron/advanced-film-reconstruct.js',
    'electron/advanced-bilingual-semantic.js',
    'electron/advanced-reconstruct-runtime.js',
    'electron/advanced-smart-translate.js',
    'src/js/advanced-film-reconstruct-core.js',
    'src/js/advanced-smart-translate-core.js',
];

/** Same closed cores must not leak through renderer-dist/** → asar */
const PROPRIETARY_RENDERER_DIST_FORBIDDEN = [
    'renderer-dist/js/advanced-film-reconstruct-core.js',
    'renderer-dist/js/advanced-smart-translate-core.js',
];

function isProprietaryAsarPath(rel) {
    const norm = String(rel || '').replace(/\\/g, '/');
    return PROPRIETARY_ASAR_FORBIDDEN.includes(norm);
}

function collectSrcJsRequiresFromElectron() {
    const electronDir = path.join(root, 'electron');
    const required = new Set();
    const re = /require\(\s*['"](\.\.\/src\/js\/[^'"]+)['"]\s*\)/g;
    const skipProprietary = new Set(
        PROPRIETARY_ASAR_FORBIDDEN
            .filter((p) => p.startsWith('electron/'))
            .map((p) => path.normalize(p)),
    );
    for (const file of listJsFiles(electronDir)) {
        const relElectron = path.relative(root, file).split(path.sep).join('/');
        if (skipProprietary.has(path.normalize(relElectron))) continue;
        const text = fs.readFileSync(file, 'utf8');
        let m;
        while ((m = re.exec(text))) {
            let rel = path.normalize(m[1].replace(/^\.\.\//, ''));
            if (!rel.endsWith('.js')) rel = `${rel}.js`;
            // Closed sources ship via `_advanced`, not app.asar
            if (isProprietaryAsarPath(rel)) continue;
            required.add(rel);
        }
    }
    // Cores may also require sibling cores / dict
    const srcJs = path.join(root, 'src', 'js');
    for (const file of listJsFiles(srcJs)) {
        if (!/[-]core\.js$/.test(file) && !file.endsWith('subtitle-chinese-dict.js')) continue;
        const relCore = path.relative(root, file).split(path.sep).join('/');
        if (isProprietaryAsarPath(relCore)) continue;
        const text = fs.readFileSync(file, 'utf8');
        const localRe = /require\(\s*['"](\.\/[^'"]+)['"]\s*\)/g;
        let m;
        while ((m = localRe.exec(text))) {
            let rel = path.normalize(path.join('src', 'js', m[1].replace(/^\.\//, '')));
            if (!rel.endsWith('.js')) rel = `${rel}.js`;
            if (isProprietaryAsarPath(rel)) continue;
            if (fs.existsSync(path.join(root, rel))) required.add(rel);
        }
    }
    return [...required].sort();
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

/** Worker / importScripts paths that HTML scanning cannot see. */
function collectDynamicRendererAssets() {
    const assets = new Set();
    const jsRoot = path.join(src, 'js');
    const files = listJsFiles(jsRoot);
    const workerRe = /new\s+Worker\(\s*['"`]([^'"`]+)['"`]/g;
    const importRe = /importScripts\(\s*([^)]+)\)/g;
    const strRe = /['"`](\.?\/?[^'"`]+\.js)['"`]/g;
    for (const file of files) {
        const text = fs.readFileSync(file, 'utf8');
        let m;
        while ((m = workerRe.exec(text))) {
            assets.add(m[1].replace(/^\.\//, ''));
        }
        // subtitle-editor.js passes workerUrl: 'js/...'
        const urlRe = /workerUrl\s*:\s*['"`]([^'"`]+)['"`]/g;
        while ((m = urlRe.exec(text))) {
            assets.add(m[1].replace(/^\.\//, ''));
        }
        while ((m = importRe.exec(text))) {
            const block = m[1];
            let s;
            strRe.lastIndex = 0;
            while ((s = strRe.exec(block))) {
                // Worker scripts live under src/js/; importScripts paths are relative to the worker file
                const relFromWorker = s[1].replace(/^\.\//, '');
                const workerDir = path.posix.dirname(
                    path.relative(jsRoot, file).split(path.sep).join('/'),
                );
                const resolved = path.posix.normalize(
                    workerDir === '.' ? relFromWorker : `${workerDir}/${relFromWorker}`,
                );
                assets.add(`js/${resolved}`.replace(/\\/g, '/'));
            }
        }
    }
    // Normalize js/js/ → js/
    return [...assets]
        .map((a) => a.replace(/\\/g, '/').replace(/^js\/js\//, 'js/'))
        .filter((a) => a.endsWith('.js'));
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

        for (const asset of collectDynamicRendererAssets()) {
            const inDist = path.join(outDir, asset);
            if (!fs.existsSync(inDist)) {
                errors.push(`动态加载资源缺少: ${asset}（Worker / importScripts；需由 build-renderer 复制）`);
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

    // Opaque tone-adapt payload (read via fs from tone-adapt-lexicon-core, not require())
    const toneAdaptRel = 'src/js/tone-adapt.tz1';
    if (!fs.existsSync(path.join(root, toneAdaptRel))) {
        errors.push(`缺少语调适配数据: ${toneAdaptRel}（用 tools/encode-tone-adapt.js 生成）`);
    } else if (!packageFilesCover(toneAdaptRel)) {
        errors.push(`package.json build.files 可能未打包: ${toneAdaptRel}`);
    }

    // Opaque AV maker prefixes (content-profile-core + av-makers-embed.js)
    const avMakersRel = 'src/js/av-makers.am1';
    const avEmbedRel = 'src/js/av-makers-embed.js';
    if (!fs.existsSync(path.join(root, avMakersRel))) {
        errors.push(`缺少番号厂牌数据: ${avMakersRel}（用 tools/fetch-av-makers.js 生成）`);
    } else if (!packageFilesCover(avMakersRel)) {
        errors.push(`package.json build.files 可能未打包: ${avMakersRel}`);
    }
    if (!fs.existsSync(path.join(root, avEmbedRel))) {
        errors.push(`缺少番号厂牌 embed: ${avEmbedRel}（用 tools/fetch-av-makers.js / encode-av-makers.js 生成）`);
    } else if (!packageFilesCover(avEmbedRel)) {
        errors.push(`package.json build.files 可能未打包: ${avEmbedRel}`);
    }

    const electronMustExist = [
        ...ELECTRON_MUST_EXIST,
        'electron/about-window.js',
        'electron/settings-window.js',
        'electron/subtitle-editor-window.js',
        'electron/update-window.js',
        'electron/download-window.js',
        'electron/advanced-llm-pick-window.js',
        'electron/editor-history.js',
        'electron/text-presets-data.js',
        'electron/editor-workflows-data.js',
        'electron/transwithai-options.js',
        'electron/transcript-keep.js',
        'electron/app-paths.js',
        'electron/installer.nsh',
    ];
    for (const rel of electronMustExist) {
        if (!fs.existsSync(path.join(root, rel))) {
            errors.push(`缺少主进程/打包文件: ${rel}`);
        }
    }

    // Vendored Engine standalone dist (extraFiles → next to exe; no ffmpeg copy)
    const engineMarkers = [
        'transub-engine/ENGINE_ROOT',
        'transub-engine/runtime/python.exe',
        'transub-engine/DIST_MANIFEST.txt',
        'transub-engine/serve.bat',
    ];
    for (const rel of engineMarkers) {
        if (!fs.existsSync(path.join(root, rel))) {
            errors.push(`缺少内置引擎独立版 dist: ${rel}`);
        }
    }
    const extraFiles = Array.isArray(pkg.build?.extraFiles) ? pkg.build.extraFiles : [];
    const engineExtra = extraFiles.find((entry) => {
        if (!entry || typeof entry !== 'object') return false;
        const from = String(entry.from || '').replace(/\\/g, '/');
        const to = String(entry.to || '').replace(/\\/g, '/');
        return from === 'transub-engine' || to === 'transub-engine';
    });
    const advancedExtra = extraFiles.find((entry) => {
        if (!entry || typeof entry !== 'object') return false;
        const from = String(entry.from || '').replace(/\\/g, '/');
        const to = String(entry.to || '').replace(/\\/g, '/');
        return from === '_advanced' || to === '_advanced';
    });
    if (!advancedExtra) {
        errors.push('package.json build.extraFiles 未包含闭源 _advanced 模块');
    }
    const advancedIndex = path.join(root, '_advanced', 'index.js');
    if (!fs.existsSync(advancedIndex)) {
        errors.push('缺少 _advanced/index.js（请先 npm run build:advanced）');
    } else if (fs.statSync(advancedIndex).size < 500) {
        errors.push('_advanced/index.js 过小，疑似未正确打包 Pro 算法');
    }
    for (const rel of PROPRIETARY_ASAR_FORBIDDEN) {
        if (packageFilesCover(rel.replace(/\\/g, '/'))) {
            errors.push(`闭源源码不应进入 asar files 白名单: ${rel}`);
        }
    }
    for (const rel of PROPRIETARY_RENDERER_DIST_FORBIDDEN) {
        if (fs.existsSync(path.join(root, rel))) {
            errors.push(`renderer-dist 仍含闭源算法（应在 build-renderer 删除）: ${rel}`);
        }
        if (packageFilesCover(rel.replace(/\\/g, '/'))) {
            errors.push(`闭源源码不应经 renderer-dist 进入 asar: ${rel}`);
        }
    }

    // JA ASR domain fix SSOT (mt-sanitize Node + engine Python)
    const jaAsrFixesRel = 'shared/ja-asr-domain-fixes.json';
    if (!fs.existsSync(path.join(root, jaAsrFixesRel))) {
        errors.push(`缺少 ASR 领域纠错 SSOT: ${jaAsrFixesRel}`);
    } else if (!packageFilesCover(jaAsrFixesRel)) {
        errors.push(`package.json build.files 可能未打包: ${jaAsrFixesRel}`);
    }
    const sharedExtra = extraFiles.find((entry) => {
        if (!entry || typeof entry !== 'object') return false;
        const from = String(entry.from || '').replace(/\\/g, '/');
        const to = String(entry.to || '').replace(/\\/g, '/');
        return from === jaAsrFixesRel || to === jaAsrFixesRel || from === 'shared' || to === 'shared';
    });
    if (!sharedExtra) {
        errors.push('package.json build.extraFiles 未包含 shared/ja-asr-domain-fixes.json（引擎侧需 exe 旁可读）');
    }

    if (!engineExtra) {
        errors.push('package.json build.extraFiles 未包含 transub-engine');
    } else {
        const filter = Array.isArray(engineExtra.filter) ? engineExtra.filter.map(String) : [];
        const requiredExcludes = [
            '!models/asr/**',
            '!models/mt/**',
            '!models/vad/**',
            '!**/site-packages/nvidia/**',
            '!**/site-packages/torch/**',
            '!**/site-packages/ctranslate2/**',
            '!**/*.pt',
            '!**/*.onnx',
            '!**/*.safetensors',
            '!**/*.gguf',
            '!**/*.ct2',
        ];
        for (const pattern of requiredExcludes) {
            if (!filter.includes(pattern)) {
                errors.push(`package.json transub-engine filter 缺少排除项: ${pattern}`);
            }
        }
        // Small ASR/Hub essentials ship with the engine; do not exclude them.
        const mustNotExclude = [
            '!**/site-packages/faster_whisper/**',
            '!**/site-packages/funasr/**',
            '!**/site-packages/tokenizers/**',
            '!**/site-packages/huggingface_hub/**',
        ];
        for (const pattern of mustNotExclude) {
            if (filter.includes(pattern)) {
                errors.push(`package.json 不应排除小体积必需包: ${pattern}`);
            }
        }
        const requiredIncludes = [
            'models/asr/whisper-tiny/**',
            'models/vad/fsmn-vad/**',
        ];
        for (const pattern of requiredIncludes) {
            if (!filter.includes(pattern)) {
                errors.push(`package.json transub-engine filter 缺少内置模型放行: ${pattern}`);
            }
        }
        const wheelsDir = path.join(root, 'transub-engine', 'wheels');
        const requiredWheels = [
            { name: 'faster_whisper-1.2.1-py3-none-any.whl', minBytes: 500 * 1024 },
            { name: 'funasr-1.3.30-py3-none-any.whl', minBytes: 200 * 1024 },
            { name: 'tokenizers-0.23.1-cp310-abi3-win_amd64.whl', minBytes: 500 * 1024 },
            { name: 'huggingface_hub-1.25.1-py3-none-any.whl', minBytes: 100 * 1024 },
            { name: 'httpx-0.28.1-py3-none-any.whl', minBytes: 20 * 1024 },
            { name: 'tqdm-4.70.0-py3-none-any.whl', minBytes: 10 * 1024 },
            { name: 'pyyaml-6.0.3-cp312-cp312-win_amd64.whl', minBytes: 50 * 1024 },
        ];
        for (const whl of requiredWheels) {
            const bundledWhl = path.join(wheelsDir, whl.name);
            if (!fs.existsSync(bundledWhl)) {
                errors.push(
                    `缺少内置 wheel: transub-engine/wheels/${whl.name}（先运行 node tools/ensure-bundled-wheels.js）`,
                );
            } else {
                try {
                    if (fs.statSync(bundledWhl).size < whl.minBytes) {
                        errors.push(`内置 wheel 体积异常（过小）: ${whl.name}`);
                    }
                } catch (_) { /* ignore */ }
            }
        }
        const requiredPkgs = ['faster_whisper', 'tokenizers', 'huggingface_hub', 'httpx', 'tqdm'];
        for (const pkg of requiredPkgs) {
            const pkgDir = path.join(
                root,
                'transub-engine',
                'runtime',
                'Lib',
                'site-packages',
                pkg,
            );
            if (!fs.existsSync(pkgDir)) {
                errors.push(
                    `缺少已安装的 ${pkg} 包（先运行 node tools/ensure-bundled-wheels.js）`,
                );
            }
        }
        // funasr may be installed as a single module path or package dir
        const funasrPkg = path.join(root, 'transub-engine', 'runtime', 'Lib', 'site-packages', 'funasr');
        if (!fs.existsSync(funasrPkg)) {
            errors.push('缺少已安装的 funasr 包（先运行 node tools/ensure-bundled-wheels.js）');
        }
        // Re-includes must come after weight excludes so last-match-wins keeps markers.
        const lastPt = filter.lastIndexOf('!**/*.pt');
        const lastBin = filter.lastIndexOf('!**/*.bin');
        const lastWeightExclude = Math.max(lastPt, lastBin);
        for (const pattern of requiredIncludes) {
            const idx = filter.indexOf(pattern);
            if (idx >= 0 && lastWeightExclude >= 0 && idx < lastWeightExclude) {
                errors.push(
                    `package.json transub-engine filter 中 ${pattern} 须写在权重排除（!**/*.pt / !**/*.bin）之后`,
                );
            }
        }
    }
    const engineFfmpeg = path.join(root, 'transub-engine', '_internal', 'bin', 'ffmpeg.exe');
    if (fs.existsSync(engineFfmpeg)) {
        warnings.push('transub-engine/_internal/bin 仍有 ffmpeg.exe（打包已过滤；建议删除以免与软件内置重复）');
    }
    // Dev tree: large Hub weights OK locally; packaging re-includes only whisper-tiny + fsmn-vad
    const shippedModels = [
        ['asr', 'whisper-tiny', 'model.bin'],
        ['vad', 'fsmn-vad', 'model.pt'],
    ];
    for (const [kind, id, marker] of shippedModels) {
        const markerPath = path.join(root, 'transub-engine', 'models', kind, id, marker);
        if (!fs.existsSync(markerPath)) {
            errors.push(
                `缺少发行内置模型: transub-engine/models/${kind}/${id}/${marker}（先运行 node tools/ensure-bundled-models.js）`,
            );
        }
    }
    const engineModelsHeavy = ['asr', 'mt', 'vad'].some((dir) => {
        const p = path.join(root, 'transub-engine', 'models', dir);
        if (!fs.existsSync(p)) return false;
        try {
            const kids = fs.readdirSync(p).filter((name) => {
                if (dir === 'asr' && name === 'whisper-tiny') return false;
                if (dir === 'vad' && name === 'fsmn-vad') return false;
                return true;
            });
            return kids.length > 0;
        } catch {
            return false;
        }
    });
    if (engineModelsHeavy) {
        warnings.push(
            'transub-engine/models 含额外已下载模型（打包仅放行 whisper-tiny / fsmn-vad；其余按需下载）',
        );
    }
    const engineNvidia = path.join(
        root,
        'transub-engine',
        'runtime',
        'Lib',
        'site-packages',
        'nvidia',
    );
    if (fs.existsSync(engineNvidia)) {
        warnings.push('transub-engine/runtime 含 nvidia CUDA 包（打包已排除；请用设置「ensure-gpu」按需安装）');
    }
    // Source-only layout must not be the vendored default
    if (
        fs.existsSync(path.join(root, 'transub-engine', 'install.bat'))
        && !fs.existsSync(path.join(root, 'transub-engine', 'runtime', 'python.exe'))
    ) {
        errors.push('transub-engine/ 仍是源码版（install.bat 且无 runtime）；请替换为独立版 dist');
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
            for (const rel of PROPRIETARY_ASAR_FORBIDDEN) {
                const norm = rel.replace(/\\/g, '/');
                if (set.has(norm)) {
                    errors.push(`asar 误含闭源源码: ${rel}`);
                }
            }
            for (const rel of PROPRIETARY_RENDERER_DIST_FORBIDDEN) {
                const norm = rel.replace(/\\/g, '/');
                if (set.has(norm) || [...set].some((x) => x.endsWith(`/${path.posix.basename(norm)}`) && x.includes('renderer-dist/'))) {
                    errors.push(`asar 误含闭源源码: ${rel}`);
                }
            }
            if (!set.has('shared/ja-asr-domain-fixes.json')
                && ![...set].some((x) => x === 'shared/ja-asr-domain-fixes.json' || x.endsWith('/shared/ja-asr-domain-fixes.json'))) {
                errors.push('asar 缺少: shared/ja-asr-domain-fixes.json');
            }
        } else if (fs.existsSync(asarRoot) && fs.statSync(asarRoot).isDirectory()) {
            for (const rel of mustInAsar) {
                if (!fs.existsSync(path.join(asarRoot, rel))) {
                    errors.push(`解包目录缺少: ${rel}`);
                }
            }
            for (const rel of PROPRIETARY_ASAR_FORBIDDEN) {
                if (fs.existsSync(path.join(asarRoot, rel))) {
                    errors.push(`解包 asar 目录误含闭源源码: ${rel}`);
                }
            }
            for (const rel of PROPRIETARY_RENDERER_DIST_FORBIDDEN) {
                if (fs.existsSync(path.join(asarRoot, rel))) {
                    errors.push(`解包 asar 目录误含闭源源码: ${rel}`);
                }
            }
            if (!fs.existsSync(path.join(asarRoot, 'shared', 'ja-asr-domain-fixes.json'))) {
                errors.push('解包目录缺少: shared/ja-asr-domain-fixes.json');
            }
        } else {
            warnings.push(`无法校验 asar: ${asarRoot}`);
        }

        // Editor shortcut lives next to exe (outside asar)
        const unpackedRoot = path.dirname(path.dirname(path.resolve(asarRoot)));
        const advancedPacked = path.join(unpackedRoot, '_advanced', 'index.js');
        if (!fs.existsSync(advancedPacked)) {
            errors.push(`解包目录缺少闭源模块: ${advancedPacked}`);
        }
        const sharedPacked = path.join(unpackedRoot, 'shared', 'ja-asr-domain-fixes.json');
        if (!fs.existsSync(sharedPacked)) {
            errors.push(`解包目录缺少 ASR SSOT: ${sharedPacked}`);
        }
        const editorLnk = path.join(unpackedRoot, 'Transub Editor.lnk');
        if (!fs.existsSync(editorLnk)) {
            errors.push(`解包目录缺少 Transub Editor.lnk（期望: ${editorLnk}）`);
        }

        // Engine extraFiles: CUDA runtime never ships; only whisper-tiny + fsmn-vad weights ship
        const packedEngine = path.join(unpackedRoot, 'transub-engine');
        if (fs.existsSync(packedEngine)) {
            const packedNvidia = path.join(
                packedEngine,
                'runtime',
                'Lib',
                'site-packages',
                'nvidia',
            );
            if (fs.existsSync(packedNvidia)) {
                errors.push('发行包误含 transub-engine/runtime/.../nvidia（CUDA 应按需安装，勿打包）');
            }
            const allowedWeightDirs = new Set([
                path.join('models', 'asr', 'whisper-tiny'),
                path.join('models', 'vad', 'fsmn-vad'),
            ]);
            const weightRe = /\.(onnx|pt|pth|bin|safetensors|gguf|ct2|ckpt)$/i;
            const walkHeavy = (dir, relBase = '', depth = 0) => {
                if (depth > 8 || !fs.existsSync(dir)) return null;
                let entries;
                try {
                    entries = fs.readdirSync(dir, { withFileTypes: true });
                } catch {
                    return null;
                }
                for (const ent of entries) {
                    const full = path.join(dir, ent.name);
                    const rel = relBase ? path.join(relBase, ent.name) : ent.name;
                    if (ent.isFile() && weightRe.test(ent.name)) {
                        const allowed = [...allowedWeightDirs].some(
                            (prefix) => rel === prefix || rel.startsWith(`${prefix}${path.sep}`),
                        );
                        if (!allowed) return full;
                    }
                    if (ent.isDirectory() && ent.name !== 'runtime') {
                        const hit = walkHeavy(full, rel, depth + 1);
                        if (hit) return hit;
                    }
                }
                return null;
            };
            const heavyHit = walkHeavy(path.join(packedEngine, 'models'), 'models');
            if (heavyHit) {
                errors.push(`发行包误含引擎模型权重: ${path.relative(unpackedRoot, heavyHit)}`);
            }
            for (const [kind, id, marker] of [
                ['asr', 'whisper-tiny', 'model.bin'],
                ['vad', 'fsmn-vad', 'model.pt'],
            ]) {
                const markerPath = path.join(packedEngine, 'models', kind, id, marker);
                if (!fs.existsSync(markerPath)) {
                    errors.push(`发行包缺少内置模型: models/${kind}/${id}/${marker}`);
                }
            }
            for (const sub of ['asr', 'mt', 'vad']) {
                const subDir = path.join(packedEngine, 'models', sub);
                if (!fs.existsSync(subDir)) continue;
                let kids = [];
                try {
                    kids = fs.readdirSync(subDir);
                } catch {
                    kids = [];
                }
                const allowed = new Set();
                if (sub === 'asr') allowed.add('whisper-tiny');
                if (sub === 'vad') allowed.add('fsmn-vad');
                const extras = kids.filter((name) => !allowed.has(name));
                if (extras.length > 0) {
                    errors.push(
                        `发行包误含 transub-engine/models/${sub}/{${extras.join(',')}}（仅允许 whisper-tiny / fsmn-vad）`,
                    );
                }
            }
        } else {
            errors.push(`解包目录缺少 transub-engine/（期望: ${packedEngine}）`);
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
