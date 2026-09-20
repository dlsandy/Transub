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
    'settings-panels.fragment.html',
    'workspace-scenes.fragment.html',
    'workspace-shelf.fragment.html',
    'workspace-models.fragment.html',
    'workspace-burn.fragment.html',
    'setup-wizard.fragment.html',
    'factory-modals.fragment.html',
    'editor-modals-drawers.fragment.html',
    'editor-modals-tools.fragment.html',
    'editor-modals-pro.fragment.html',
    'splash.html',
    'subtitle-editor.html',
    'about.html',
    'subtitle-shelf.html',
    'update.html',
    'update-progress.html',
    'icon.png',
    'icon-64.png',
    'icon-editor.png',
    'icon-player.png',
    'tseditor.png',
    'js/app.js',
    'js/main-ui-ux.js',
    'js/av-makers-embed.js',
    'js/ui-fragment-load-core.js',
    'js/settings-dom-load-core.js',
    'js/editor-ui-fragment-load-core.js',
    'js/setup-wizard-steps-core.js',
    'js/setup-wizard-appearance-core.js',
    'js/setup-wizard-goals-core.js',
    'js/setup-wizard-needs-core.js',
    'js/setup-wizard-model-recommend-core.js',
    'js/pip-mirror-ui-core.js',
    'js/env-fix-start-core.js',
    'js/setup-wizard-hf-pick-core.js',
    'js/setup-wizard-detect-core.js',
    'js/setup-wizard-plan-core.js',
    'js/setup-wizard-download-ui-core.js',
    'js/setup-wizard-prefs-core.js',
    'js/setup-wizard-apply-core.js',
    'js/setup-wizard-onboarding-core.js',
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
    'js/subtitle-editor/qc-summary-ui.js',
    'js/subtitle-editor/cue-split-plan.js',
    'js/subtitle-editor/silence-split-plan.js',
    'js/subtitle-editor/audio-snap-duration-plan.js',
    'js/subtitle-editor/retranscribe-range-plan.js',
    'js/subtitle-editor/batch-cue-filter-plan.js',
    'js/subtitle-editor/filler-check-plan.js',
    'js/subtitle-editor/filler-check-ui.js',
    'js/subtitle-editor/batch-retranslate-ui.js',
    'js/subtitle-editor/batch-delete-ui.js',
    'js/subtitle-editor/playhead-scrub.js',
    'js/subtitle-editor/subtitlecat-upload-ui.js',
    'js/subtitle-editor/glossary-import-ui.js',
    'js/subtitle-editor/player-handoff-ui.js',
    'js/subtitle-editor/target-lang-ui.js',
    'js/subtitle-editor/workflows.js',
    'js/subtitle-editor/inference-progress.js',
    'js/subtitle-editor/layout.js',
    'js/subtitle-editor/kept-and-markers.js',
    'js/subtitle-editor/qc-worker-client.js',
    'js/subtitle-editor/find-worker-client.js',
    'js/subtitle-editor/workspace-ui.js',
    'js/subtitle-editor/ass-override-ui.js',
    'js/subtitle-editor/ass-pos-drag.js',
    'js/subtitle-editor/ass-styles-ui.js',
    'js/subtitle-editor/jassub-preview.js',
    'js/subtitle-editor/low-conf-retranscribe.js',
    'js/about-window.js',
    'js/scene-presets-core.js',
    'js/scene-presets-ui.js',
    'js/combo-plans-core.js',
    'js/combo-plans-ui-core.js',
    'js/subtitle-shelf-core.js',
    'js/subtitle-shelf-translate-core.js',
    'js/subtitle-shelf-ui.js',
    'js/update-window.js',
    'js/update-progress.js',
    // Packaged index collapses CHROME_SCRIPTS into this bundle (build-renderer.js)
    'js/chrome.bundle.js',
    'js/eta-core.js',
    'js/i18n-core.js',
    'js/i18n-catalogs.js',
    'js/i18n.js',
    'js/i18n-ui-tf-core.js',
    'js/deferred-script-load-core.js',
    'js/media-extensions-core.js',
    'js/app-path-utils-core.js',
    'js/infer-stage-progress-core.js',
    'js/progress-display-core.js',
    'js/job-progress-log-core.js',
    'js/log-auto-scroll-core.js',
    'js/log-panel-render-core.js',
    'js/quality-pipeline-policy-core.js',
    'js/settings-options-normalize-core.js',
    'js/translate-mode-byok-policy-core.js',
    'js/translate-mode-form-core.js',
    'js/external-import-action-core.js',
    'js/item-posttask-paths-core.js',
    'js/subtitle-software-credit-core.js',
    'js/per-item-qc-pipeline-core.js',
    'js/post-task-qc-ui-core.js',
    'js/translate-mode-chip-core.js',
    'js/hybrid-model-pick-sync-core.js',
    'js/translate-external-pick-core.js',
    'js/translate-mode-ui-core.js',
    'js/params-mode-ui-core.js',
    'js/quick-toolbar-chips-ui-core.js',
    'js/translate-style-core.js',
    'js/huihui-qwen3-profile-core.js',
    'js/translategemma-profile-core.js',
    'js/smart-translate-recycle-guard-core.js',
    'js/smart-translate-align-core.js',
    'js/smart-translate-delivery-finalize-core.js',
    'js/engine-download-format-core.js',
    'js/engine-models-ui-core.js',
    'js/engine-models-lab-core.js',
    'js/engine-models-lab-ui-core.js',
    'js/engine-models-workspace-core.js',
    'js/engine-models-library-ui-core.js',
    'js/engine-models-cache-core.js',
    'js/engine-models-cache-shell-core.js',
    'js/engine-manual-download-core.js',
    'js/engine-gpu-torch-core.js',
    'js/compute-busy-ui-core.js',
    'js/batch-recovery-core.js',
    'js/asr-settings-core.js',
    'js/audio-option-mutex-core.js',
    'js/engine-missing-models-core.js',
    'js/missing-models-prompt-core.js',
    'js/start-readiness-core.js',
    'js/start-readiness-ui-core.js',
    'js/selection-toolbar-core.js',
    'js/live-batch-queue-core.js',
    'js/live-batch-rehydrate-core.js',
    'js/settings-saved-options-core.js',
    'js/settings-form-apply-core.js',
    'js/settings-modal-ui-core.js',
    'js/engine-env-ui-core.js',
    'js/post-batch-autofix-plan-core.js',
    'js/post-batch-runner-core.js',
    'js/batch-job-progress-core.js',
    'js/batch-start-runner-core.js',
    'js/busy-overlay-core.js',
    'js/media-intake-core.js',
    'js/retranslate-plan-core.js',
    'js/retranslate-runner-core.js',
    'js/retranslate-modal-ui-core.js',
    'js/shelf-translate-flow-core.js',
    'js/factory-task-list-ui-core.js',
    'js/player-launch-ui-core.js',
    'js/factory-shell-ui-core.js',
    'js/factory-workspace-nav-core.js',
    'js/factory-chrome-core.js',
    'js/factory-task-tab-core.js',
    'js/factory-task-ui-core.js',
    'js/task-list-actions-ui-core.js',
    'js/factory-task-reorder-core.js',
    'js/factory-status-bar-core.js',
    'js/list-removal-ui-core.js',
    'js/cli-command-core.js',
    'js/cli-command-ui-core.js',
    'js/burn-settings-ui-core.js',
    'js/job-session-control-core.js',
    'js/quick-extras-ui-core.js',
    'js/bilingual-task-ui-core.js',
    'js/factory-status-chips-core.js',
    'js/twai-model-select-ui-core.js',
    'js/managed-llm-pick-core.js',
    'js/app-dom-ids-core.js',
    'js/app-api-bind-core.js',
    'js/app-shell-deps-core.js',
    'js/post-task-ui-core.js',
    'js/item-qc-markers-core.js',
    'js/runtime-options-core.js',
    'js/app-menu-coord-core.js',
    'js/app-progress-shell-core.js',
    'js/app-wire-utils-core.js',
    'js/app-wire-chrome-shell-core.js',
    'js/app-wire-chrome-entitlement-core.js',
    'js/app-wire-chrome-translate-core.js',
    'js/app-wire-chrome-toolbar-core.js',
    'js/app-wire-chrome-session-core.js',
    'js/app-wire-chrome-intake-core.js',
    'js/app-wire-chrome-shelf-core.js',
    'js/app-wire-chrome-core.js',
    'js/app-wire-factory-ui-core.js',
    'js/app-wire-settings-core.js',
    'js/app-wire-engine-models-core.js',
    'js/app-wire-batch-core.js',
    'js/app-wire-boot-core.js',
    'js/app-init-core.js',
    'js/translate-style-picker-ui-core.js',
    'js/app-events-binder-core.js',
    'js/advanced-entitlement-ui-core.js',
    'js/resource-usage-ui-core.js',
    'js/main-ui-extras-core.js',
    'js/task-list-sort-core.js',
    'js/task-list-row-core.js',
    'js/content-profile-core.js',
    'js/subtitle-target-lang-core.js',
    'js/mt-target-route-core.js',
    'js/mt-target-form-sync-core.js',
    'js/glossary-target-pick-core.js',
    'js/mt-cast-link-core.js',
    'js/mt-concept-core.js',
    'js/advanced-entitlement-core.js',
    'js/advanced-license-crypto-core.js',
    'js/advanced-managed-llm-catalog-core.js',
    'js/sakura-mt-catalog-core.js',
    'js/sakura-translate-core.js',
    'js/smart-translate-hybrid-core.js',
    'js/smart-translate-readiness-core.js',
    'js/smart-translate-polish-core.js',
    'js/auto-scan-folders-core.js',
    'js/qwen-asr-batch-core.js',
    'js/qwen-asr-progress-core.js',
    'js/anime-whisper-preset-tip.js',
    'js/dual-subtitle-core.js',
    'js/transwithai-model-core.js',
    'js/subtitle-text-presets-core.js',
    'js/subtitle-workflows-core.js',
    'js/subtitle-chinese-core.js',
    'js/subtitle-burn-style-presets-core.js',
    'js/subtitle-burn-core.js',
    'js/subtitle-burn-style-presets-ui.js',
    'js/subtitle-burn-preview.js',
    'js/subtitle-burn-ui.js',
    'js/ass-override-core.js',
    'js/ass-style-packs-core.js',
    'js/ass-styles-core.js',
    'vendor/opencc-js/full.js',
    'vendor/jassub/jassub.js',
    'vendor/jassub/worker.js',
    'vendor/jassub/default.woff2',
    'vendor/jassub/wasm/jassub-worker.wasm',
    'vendor/jassub/wasm/jassub-worker-modern.wasm',
    'js/subtitle-qc-core.js',
    'js/subtitle-qc-smart-core.js',
    'js/subtitle-qc-silence-core.js',
    'js/subtitle-glossary-core.js',
    'js/subtitle-glossary-import-core.js',
    'js/subtitle-merge-core.js',
    'js/subtitle-fluency-core.js',
    'js/mt-sanitize-core.js',
    'js/mt-sanitize-intent-core.js',
    'js/mt-opaque-strings.js',
    'js/mt-sanitize-lexicon.js',
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
    'js/env-fix-progress-core.js',
    'js/env-fix-start-core.js',
    'js/pip-mirror-ui-core.js',
    'js/env-check.js',
    'js/setup-wizard-steps-core.js',
    'js/setup-wizard-appearance-core.js',
    'js/setup-wizard-goals-core.js',
    'js/setup-wizard-needs-core.js',
    'js/setup-wizard-model-recommend-core.js',
    'js/setup-wizard-hf-pick-core.js',
    'js/setup-wizard-detect-core.js',
    'js/setup-wizard-plan-core.js',
    'js/setup-wizard-download-ui-core.js',
    'js/setup-wizard-prefs-core.js',
    'js/setup-wizard-apply-core.js',
    'js/setup-wizard-onboarding-core.js',
    'js/manual-whl-link-export-core.js',
    'js/manual-whl-install.js',
    // Loaded via new Worker(), not <script src> — easy to miss in packaging audits
    'js/subtitle-qc-worker.js',
    'js/subtitle-find-worker.js',
    'vendor/app.css',
    'vendor/setup-wizard.css',
    'vendor/factory.css',
    'vendor/editor.css',
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
    'electron/engine-batch-loop.js',
    'electron/engine-download-job.js',
    'electron/engine-ensure-running.js',
    'electron/engine-range-transcribe.js',
    'electron/advanced-bridge.js',
    'electron/advanced-gates.js',
    'electron/advanced-module-loader.js',
    'electron/advanced-closed-api.js',
    'electron/advanced-qc-smart-fix.js',
    'electron/advanced-smart-translate-job.js',
    'electron/advanced-smart-translate-file.js',
    'electron/advanced-reconstruct-orchestration.js',
    'electron/advanced-batch-reconstruct.js',
    'electron/advanced-license-lifecycle.js',
    'electron/advanced-managed-llm-jobs.js',
    'electron/advanced-managed-llm-ipc.js',
    'electron/delivery-underfill-repair.js',
    'electron/tdp-fs.js',
    'electron/tdp-runtime.js',
    'electron/sakura-mt.js',
    'electron/sakura-translate.js',
    'electron/transwithai-bridge.js',
    'electron/transwithai-batch-loop.js',
    'electron/transwithai-progress-parse.js',
    'electron/transwithai-runtime-options-normalize.js',
    'electron/extensions-bridge.js',
    'electron/extensions-ffmpeg-ipc.js',
    'electron/extensions-shelf-ipc.js',
    'electron/extensions-subtitle-document.js',
    'electron/extensions-subtitle-editor-ipc.js',
    'electron/extensions-subtitle-postprocess.js',
    'electron/smart-translate-hybrid.js',
    'electron/live-batch-bridge.js',
    'electron/live-batch-queue.js',
];

const HTML_PAGES = [
    'index.html',
    'splash.html',
    'subtitle-editor.html',
    'about.html',
    'subtitle-shelf.html',
    'update.html',
    'update-progress.html',
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
    if (normalized.startsWith('src/js/') || normalized.startsWith('src/vendor/')) {
        const base = path.posix.basename(normalized);
        if (files.includes('src/js/*-core.js') && normalized.startsWith('src/js/') && /-core\.js$/.test(base)) {
            // still respect !src/js/... exclusions above
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

const {
    ASAR_EXCLUDE: PROPRIETARY_ASAR_FORBIDDEN,
    RENDERER_DIST_FORBIDDEN: PROPRIETARY_RENDERER_DIST_FORBIDDEN,
} = require('./proprietary-paths');

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
        if (!/[-]core\.js$/.test(file)) continue;
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

        // Settings + factory workspace panels must stay extracted (keeps index.html boot HTML lean).
        const fragSrc = path.join(src, 'settings-panels.fragment.html');
        const indexSrc = path.join(src, 'index.html');
        const workspaceFrags = [
            'workspace-scenes.fragment.html',
            'workspace-shelf.fragment.html',
            'workspace-models.fragment.html',
            'workspace-burn.fragment.html',
        ];
        if (!fs.existsSync(fragSrc)) {
            errors.push('缺少 src/settings-panels.fragment.html（先 npm run extract:settings-fragment）');
        } else if (fs.existsSync(indexSrc)) {
            const indexHtml = fs.readFileSync(indexSrc, 'utf8');
            if (!indexHtml.includes('data-settings-dom="pending"') && !indexHtml.includes('data-ui-fragment="pending"')) {
                errors.push('src/index.html 缺少设置占位 data-settings-dom/data-ui-fragment="pending"（勿把面板重新内联）');
            }
            if (indexHtml.includes('id="engineInstallPathInput"')) {
                errors.push('src/index.html 仍含设置控件 engineInstallPathInput（应只在 fragment）');
            }
            for (const name of workspaceFrags) {
                if (!fs.existsSync(path.join(src, name))) {
                    errors.push(`缺少 src/${name}（先 npm run extract:workspace-fragments）`);
                }
            }
            const chromeFrags = [
                'setup-wizard.fragment.html',
                'factory-modals.fragment.html',
            ];
            for (const name of chromeFrags) {
                if (!fs.existsSync(path.join(src, name))) {
                    errors.push(`缺少 src/${name}（先 npm run extract:factory-modal-fragments）`);
                }
            }
            if (!indexHtml.includes('vendor/factory.css')) {
                errors.push('src/index.html 缺少 vendor/factory.css 链接（先 npm run extract:factory-css）');
            }
            if (!/id="setupWizardModal"[^>]*data-ui-fragment="pending"/.test(indexHtml)) {
                errors.push('src/index.html 缺少设置向导占位 setupWizardModal[data-ui-fragment=pending]');
            }
            if (!/id="retranslateModal"[^>]*data-ui-fragment="pending"/.test(indexHtml)) {
                errors.push('src/index.html 缺少 retranslateModal[data-ui-fragment=pending]');
            }
            if (indexHtml.includes('id="wizardUiLocaleList"')) {
                errors.push('src/index.html 仍含向导控件 wizardUiLocaleList（应只在 setup-wizard.fragment.html）');
            }
            if (indexHtml.includes('id="retranslateModeLlm"')) {
                errors.push('src/index.html 仍含重译控件 retranslateModeLlm（应只在 factory-modals.fragment.html）');
            }
            if (!indexHtml.includes('id="workspaceShelf"') || !/id="workspaceShelf"[^>]*data-ui-fragment="pending"/.test(indexHtml)) {
                errors.push('src/index.html 缺少字幕库占位 workspaceShelf[data-ui-fragment=pending]');
            }
            if (indexHtml.includes('id="shelfCardList"')) {
                errors.push('src/index.html 仍含字幕库控件 shelfCardList（应只在 workspace-shelf.fragment.html）');
            }
            if (indexHtml.includes('id="engineModelsList"')) {
                errors.push('src/index.html 仍含模型列表 engineModelsList（应只在 workspace-models.fragment.html）');
            }
            if (indexHtml.includes('id="burnBatchList"')) {
                errors.push('src/index.html 仍含烧录队列 burnBatchList（应只在 workspace-burn.fragment.html）');
            }
            if (indexHtml.includes('id="scenesCardList"')) {
                errors.push('src/index.html 仍含场景列表 scenesCardList（应只在 workspace-scenes.fragment.html）');
            }
        }

        const editorSrcHtml = path.join(src, 'subtitle-editor.html');
        const editorFrags = [
            'editor-modals-drawers.fragment.html',
            'editor-modals-tools.fragment.html',
            'editor-modals-pro.fragment.html',
        ];
        for (const name of editorFrags) {
            if (!fs.existsSync(path.join(src, name))) {
                errors.push(`缺少 src/${name}（先 npm run extract:editor-modal-fragments）`);
            }
        }
        if (fs.existsSync(editorSrcHtml)) {
            const editorHtml = fs.readFileSync(editorSrcHtml, 'utf8');
            if (!editorHtml.includes('vendor/editor.css')) {
                errors.push('src/subtitle-editor.html 缺少 vendor/editor.css 链接（先 npm run extract:editor-css）');
            }
            if (!/id="editorFindReplaceModal"[^>]*data-ui-fragment="pending"/.test(editorHtml)) {
                errors.push('src/subtitle-editor.html 缺少 editorFindReplaceModal[data-ui-fragment=pending]');
            }
            if (!/id="editorSplitModal"[^>]*data-ui-fragment="pending"/.test(editorHtml)) {
                errors.push('src/subtitle-editor.html 缺少 editorSplitModal[data-ui-fragment=pending]');
            }
            if (editorHtml.includes('id="editorAssStyleList"')) {
                errors.push('src/subtitle-editor.html 仍含 ASS 样式列表（应只在 editor-modals-drawers.fragment.html）');
            }
            if (editorHtml.includes('id="editorBatchDurConfirm"')) {
                errors.push('src/subtitle-editor.html 仍含批量时长控件（应只在 editor-modals-tools.fragment.html）');
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

    // Bundled TDP language pack (Pro hot-reload overlay; neutral filename)
    const tdpBundledRel = 'shared/tdp/tdp-bundled.tpack';
    if (!fs.existsSync(path.join(root, tdpBundledRel))) {
        errors.push(`缺少语言优化包: ${tdpBundledRel}（用 tools/encode-tdp-pack.js 生成）`);
    } else if (!packageFilesCover(tdpBundledRel)) {
        errors.push(`package.json build.files 可能未打包: ${tdpBundledRel}`);
    }

    // Shared MT sanitize lexicon (required by mt-sanitize-core / mt-opaque-strings; not *-core.js)
    const mtLexiconRel = 'src/js/mt-sanitize-lexicon.js';
    if (!fs.existsSync(path.join(root, mtLexiconRel))) {
        errors.push(`缺少 MT sanitize 词表: ${mtLexiconRel}`);
    } else if (!packageFilesCover(mtLexiconRel)) {
        errors.push(`package.json build.files 可能未打包: ${mtLexiconRel}`);
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
        'electron/subtitle-shelf.js',
        'electron/subtitle-shelf-window.js',
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
    } else {
        const advText = fs.readFileSync(advancedIndex, 'utf8');
        const absRequires = advText.match(
            /require\(["'](?:[A-Za-z]:\\|\/(?:Users|home|tmp)\/)[^"']+["']\)/g,
        );
        if (absRequires?.length) {
            errors.push(
                `_advanced/index.js 含本机绝对路径 require（用户机无法加载）: ${absRequires[0]}`,
            );
        }
        if (!advText.includes('__transubHostReq')) {
            errors.push('_advanced/index.js 缺少宿主模块运行时解析（__transubHostReq）');
        }
    }
    for (const rel of PROPRIETARY_ASAR_FORBIDDEN) {
        if (packageFilesCover(rel.replace(/\\/g, '/'))) {
            errors.push(`闭源源码不应进入 asar files 白名单: ${rel}`);
        }
    }
    if (packageFilesCover('docs/architecture.md') || packageFilesCover('docs/advanced-boundary.md')) {
        errors.push('docs/ 不应进入 asar files 白名单');
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
    for (const rel of [
        'shared/av-actor-glossary.json',
        'shared/av-domain-glossary.json',
        'shared/av-glossary-i18n-overrides.json',
    ]) {
        if (!fs.existsSync(path.join(root, rel))) {
            errors.push(`缺少 AV 词库: ${rel}（运行 npm run build:av-glossary）`);
        } else if (!packageFilesCover(rel)) {
            errors.push(`package.json build.files 可能未打包: ${rel}`);
        }
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
            '!docs/**',
            '!wheels-edition/**',
            '!models/asr/**',
            '!models/mt/**',
            '!models/vad/**',
            '!**/site-packages/~*/**',
            '!**/site-packages/nvidia/**',
            '!**/site-packages/torch/**',
            '!**/site-packages/ctranslate2/**',
            '!**/site-packages/av/**',
            '!**/site-packages/numba/**',
            '!**/site-packages/llvmlite/**',
            '!**/site-packages/scipy/**',
            '!**/site-packages/jieba/**',
            '!**/site-packages/sklearn/**',
            '!**/site-packages/sympy/**',
            '!**/site-packages/modelscope/**',
            '!**/site-packages/transformers/**',
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
            'models/vad/firered-vad/**',
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
            { name: 'tokenizers-0.22.2-cp39-abi3-win_amd64.whl', minBytes: 500 * 1024 },
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
        // Silero VAD: PyPI faster-whisper 1.2.1 ships v6.0; we patch to v6.2 (#1390).
        const sileroWant = '914fd98ac0a73d69ba1e70c9b1d66acb740eff90500dfde08b89a961b168a6a9';
        const sileroInstalled = path.join(
            root,
            'transub-engine',
            'runtime',
            'Lib',
            'site-packages',
            'faster_whisper',
            'assets',
            'silero_vad_v6.onnx',
        );
        const sileroPatch = path.join(
            root,
            'transub-engine',
            'patches',
            'faster-whisper',
            'silero_vad_v6.onnx',
        );
        if (!fs.existsSync(sileroPatch)) {
            errors.push('缺少 Silero VAD v6.2 补丁: transub-engine/patches/faster-whisper/silero_vad_v6.onnx');
        } else if (!fs.existsSync(sileroInstalled)) {
            errors.push('缺少已安装的 silero_vad_v6.onnx（先运行 node tools/ensure-bundled-wheels.js）');
        } else {
            const crypto = require('crypto');
            const hash = crypto.createHash('sha256').update(fs.readFileSync(sileroInstalled)).digest('hex');
            if (hash !== sileroWant) {
                errors.push(
                    `内置 Silero VAD 未升级到 v6.2（got ${hash.slice(0, 12)}…；运行 node tools/ensure-bundled-wheels.js）`,
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
    // Bundled FFmpeg must be gyan essentials (not full_build) to keep release size down.
    const bundledFfmpeg = path.join(root, '_internal', 'bin', 'ffmpeg.exe');
    if (!fs.existsSync(bundledFfmpeg)) {
        errors.push('缺少内置 FFmpeg: _internal/bin/ffmpeg.exe（先运行 npm run setup:ffmpeg）');
    } else {
        try {
            const { execFileSync } = require('child_process');
            const out = execFileSync(bundledFfmpeg, ['-hide_banner', '-version'], {
                encoding: 'utf8',
                windowsHide: true,
                timeout: 15000,
                maxBuffer: 256 * 1024,
            });
            const versionLine = String(out || '').split(/\r?\n/).find((line) => /ffmpeg version/i.test(line)) || '';
            const lower = versionLine.toLowerCase();
            if (lower.includes('full_build') || lower.includes('full-build')) {
                errors.push(
                    `内置 FFmpeg 为 full_build，发行须用 essentials：${versionLine.trim() || bundledFfmpeg}（运行 npm run setup:ffmpeg）`,
                );
            } else if (!lower.includes('essentials')) {
                warnings.push(
                    `内置 FFmpeg 版本未标明 essentials（请确认来自 gyan essentials）：${versionLine.trim() || bundledFfmpeg}`,
                );
            }
        } catch (err) {
            errors.push(`内置 FFmpeg 无法运行: ${err && err.message ? err.message : err}`);
        }
    }
    // Dev tree: large Hub weights OK locally; packaging re-includes whisper-tiny + fsmn-vad + firered-vad
    const shippedModels = [
        ['asr', 'whisper-tiny', 'model.bin'],
        ['vad', 'fsmn-vad', 'model.pt'],
        ['vad', 'firered-vad', path.join('VAD', 'model.pth.tar')],
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
                if (dir === 'vad' && (name === 'fsmn-vad' || name === 'firered-vad')) return false;
                return true;
            });
            return kids.length > 0;
        } catch {
            return false;
        }
    });
    if (engineModelsHeavy) {
        warnings.push(
            'transub-engine/models 含额外已下载模型（打包仅放行 whisper-tiny / fsmn-vad / firered-vad；其余按需下载）',
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
        // Every non-Pro electron/*.js on disk must ship (catches stale packs after extracts)
        const allElectronJs = listJsFiles(path.join(root, 'electron'))
            .map((full) => path.relative(root, full).split(path.sep).join('/'))
            .filter((rel) => !isProprietaryAsarPath(rel));
        // Every non-Pro top-level src/js/*-core.js must ship via build.files glob
        const allSrcCores = fs.existsSync(path.join(root, 'src', 'js'))
            ? fs.readdirSync(path.join(root, 'src', 'js'))
                .filter((name) => /-core\.js$/.test(name))
                .map((name) => `src/js/${name}`)
                .filter((rel) => !isProprietaryAsarPath(rel))
            : [];
        const htmlAssetsInAsar = [];
        for (const page of HTML_PAGES) {
            const htmlPath = path.join(src, page);
            if (!fs.existsSync(htmlPath)) continue;
            for (const asset of extractHtmlLocalAssets(htmlPath)) {
                htmlAssetsInAsar.push(`renderer-dist/${asset.replace(/\\/g, '/')}`);
            }
        }
        const mustInAsar = [
            ...REQUIRED_RENDERER_FILES.map((f) => `renderer-dist/${f}`),
            ...htmlAssetsInAsar,
            ...requiredSrc.map((f) => f.replace(/\\/g, '/')),
            ...allSrcCores,
            ...asarElectronMust,
            ...allElectronJs,
        ];
        if (list) {
            const set = new Set(
                list.map((p) => String(p).replace(/\\/g, '/').replace(/^\//, '')),
            );
            const seenMust = new Set();
            for (const rel of mustInAsar) {
                const norm = rel.replace(/\\/g, '/').replace(/^\//, '');
                if (seenMust.has(norm)) continue;
                seenMust.add(norm);
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
            // Basename catch: proprietary algorithm sources must never appear under any asar path
            const propBasenames = new Set(
                PROPRIETARY_ASAR_FORBIDDEN.map((p) => path.posix.basename(p)),
            );
            for (const entry of set) {
                const base = path.posix.basename(entry);
                if (propBasenames.has(base)) {
                    errors.push(`asar 误含闭源源码（按文件名）: ${entry}`);
                }
            }
            for (const rel of [
                'shared/ja-asr-domain-fixes.json',
                'shared/av-actor-glossary.json',
                'shared/av-domain-glossary.json',
                'shared/av-glossary-i18n-overrides.json',
            ]) {
                if (!set.has(rel) && ![...set].some((x) => x === rel || x.endsWith(`/${rel}`))) {
                    errors.push(`asar 缺少: ${rel}`);
                }
            }
            const leakedDocs = [...set].find((x) => x === 'docs' || x.startsWith('docs/'));
            if (leakedDocs) {
                errors.push(`asar 误含 docs: ${leakedDocs}`);
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
            for (const rel of [
                'ja-asr-domain-fixes.json',
                'av-actor-glossary.json',
                'av-domain-glossary.json',
            ]) {
                if (!fs.existsSync(path.join(asarRoot, 'shared', rel))) {
                    errors.push(`解包目录缺少: shared/${rel}`);
                }
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
        if (fs.existsSync(path.join(unpackedRoot, 'docs'))) {
            errors.push('发行包误含 docs/（文档不随发行包分发）');
        }

        // Engine extraFiles: CUDA runtime never ships; whisper-tiny + fsmn-vad + firered-vad weights ship
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
            if (fs.existsSync(path.join(packedEngine, 'wheels-edition'))) {
                errors.push('发行包误含 transub-engine/wheels-edition（版次 wheel 缓存不得打进 slim 包）');
            }
            if (fs.existsSync(path.join(packedEngine, 'docs'))) {
                errors.push('发行包误含 transub-engine/docs/（文档不随发行包分发）');
            }
            const packedSite = path.join(packedEngine, 'runtime', 'Lib', 'site-packages');
            const forbiddenPackedPkgs = [
                'av', 'av.libs', 'numba', 'llvmlite', 'scipy', 'scipy.libs',
                'jieba', 'sklearn', 'sympy', 'modelscope', 'transformers',
                'torch', 'onnxruntime', 'ctranslate2',
            ];
            if (fs.existsSync(packedSite)) {
                for (const pkg of forbiddenPackedPkgs) {
                    if (fs.existsSync(path.join(packedSite, pkg))) {
                        errors.push(`发行包误含按需依赖 site-packages/${pkg}（应排除或 after-pack 清理）`);
                    }
                }
                try {
                    const leftover = fs.readdirSync(packedSite).find((n) => String(n).startsWith('~'));
                    if (leftover) {
                        errors.push(`发行包含 pip 残留目录 site-packages/${leftover}（应 after-pack 清理）`);
                    }
                } catch {
                    /* ignore */
                }
            }
            const allowedWeightDirs = new Set([
                path.join('models', 'asr', 'whisper-tiny'),
                path.join('models', 'vad', 'fsmn-vad'),
                path.join('models', 'vad', 'firered-vad'),
            ]);
            const weightRe = /\.(onnx|pt|pth|bin|safetensors|gguf|ct2|ckpt|tar)$/i;
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
                ['vad', 'firered-vad', path.join('VAD', 'model.pth.tar')],
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
                if (sub === 'vad') {
                    allowed.add('fsmn-vad');
                    allowed.add('firered-vad');
                }
                const extras = kids.filter((name) => !allowed.has(name));
                if (extras.length > 0) {
                    errors.push(
                        `发行包误含 transub-engine/models/${sub}/{${extras.join(',')}}（仅允许 whisper-tiny / fsmn-vad / firered-vad）`,
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
