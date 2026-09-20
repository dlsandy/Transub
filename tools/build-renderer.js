const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'src');
const outDir = path.join(root, 'renderer-dist');

/** Critical-path scripts kept in src/index.html (order matters). Packaged builds collapse these into chrome.bundle.js. */
const CHROME_SCRIPTS = [
    'js/eta-core.js',
    'js/subtitle-chinese-core.js',
    'js/i18n-core.js',
    'js/i18n-catalogs.js',
    'js/i18n.js',
    'js/i18n-ui-tf-core.js',
    'js/media-extensions-core.js',
    'js/app-path-utils-core.js',
    'js/deferred-script-load-core.js',
    'js/infer-stage-progress-core.js',
    'js/progress-display-core.js',
    'js/job-progress-log-core.js',
    'js/log-auto-scroll-core.js',
    'js/log-panel-render-core.js',
    'js/subtitle-target-lang-core.js',
    'js/mt-target-route-core.js',
    'js/mt-target-form-sync-core.js',
    'js/glossary-target-pick-core.js',
    'js/mt-cast-link-core.js',
    'js/mt-concept-core.js',
    'js/quality-pipeline-policy-core.js',
    'js/settings-options-normalize-core.js',
    'js/translate-mode-byok-policy-core.js',
    'js/translate-external-pick-core.js',
    'js/translate-mode-form-core.js',
    'js/external-import-action-core.js',
    'js/cli-command-core.js',
    'js/cli-command-ui-core.js',
    'js/item-posttask-paths-core.js',
    'js/subtitle-software-credit-core.js',
    'js/per-item-qc-pipeline-core.js',
    'js/post-task-qc-ui-core.js',
    'js/translate-mode-chip-core.js',
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
    'js/ui-fragment-load-core.js',
    'js/settings-dom-load-core.js',
    'js/settings-form-apply-core.js',
    'js/settings-modal-ui-core.js',
    'js/engine-env-ui-core.js',
    'js/burn-settings-ui-core.js',
    'js/job-session-control-core.js',
    'js/quick-extras-ui-core.js',
    'js/bilingual-task-ui-core.js',
    'js/factory-status-chips-core.js',
    'js/scene-presets-core.js',
    'js/scene-presets-ui.js',
    'js/combo-plans-core.js',
    'js/combo-plans-ui-core.js',
    'js/params-mode-ui-core.js',
    'js/quick-toolbar-chips-ui-core.js',
    'js/subtitle-shelf-core.js',
    'js/subtitle-shelf-translate-core.js',
    'js/subtitle-shelf-ui.js',
    'js/subtitle-burn-style-presets-core.js',
    'js/subtitle-burn-core.js',
    'js/subtitle-burn-style-presets-ui.js',
    'js/subtitle-burn-preview.js',
    'js/subtitle-burn-ui.js',
    'js/task-list-sort-core.js',
    'js/task-list-row-core.js',
    'js/factory-chrome-core.js',
    'js/advanced-entitlement-ui-core.js',
    'js/player-launch-ui-core.js',
    'js/factory-shell-ui-core.js',
    'js/factory-workspace-nav-core.js',
    'js/factory-task-tab-core.js',
    'js/factory-task-ui-core.js',
    'js/factory-task-list-ui-core.js',
    'js/task-list-actions-ui-core.js',
    'js/list-removal-ui-core.js',
    'js/translate-style-picker-ui-core.js',
    'js/factory-task-reorder-core.js',
    'js/factory-status-bar-core.js',
    'js/resource-usage-ui-core.js',
    'js/main-ui-extras-core.js',
    'js/av-makers-embed.js',
    'js/content-profile-core.js',
    'js/sakura-mt-catalog-core.js',
    'js/advanced-managed-llm-catalog-core.js',
    'js/transwithai-model-core.js',
    'js/twai-model-select-ui-core.js',
    'js/auto-scan-folders-core.js',
    'js/smart-translate-hybrid-core.js',
    'js/smart-translate-readiness-core.js',
    'js/hybrid-model-pick-sync-core.js',
    'js/translate-mode-ui-core.js',
    'js/smart-translate-polish-core.js',
    'js/subtitle-qc-smart-core.js',
    'js/post-batch-autofix-plan-core.js',
    'js/post-batch-runner-core.js',
    'js/batch-job-progress-core.js',
    'js/batch-start-runner-core.js',
    'js/retranslate-plan-core.js',
    'js/retranslate-runner-core.js',
    'js/retranslate-modal-ui-core.js',
    'js/shelf-translate-flow-core.js',
    'js/qwen-asr-batch-core.js',
    'js/qwen-asr-progress-core.js',
    'js/dual-subtitle-core.js',
    'js/main-ui-ux.js',
    'js/anime-whisper-preset-tip.js',
    'js/busy-overlay-core.js',
    'js/media-intake-core.js',
    'js/app-events-binder-core.js',
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
    'js/app.js',
    'js/settings-editor-prefs.js',
    'js/manual-whl-link-export-core.js',
    'js/manual-whl-install.js',
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
    'js/setup-wizard.js',
    'js/advanced-settings.js',
    'js/features.js',
    'js/subtitle-editor-launcher.js',
];

function copyRecursive(from, dest) {
    if (!fs.existsSync(from)) return;
    const stat = fs.statSync(from);
    if (stat.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        for (const name of fs.readdirSync(from)) {
            copyRecursive(path.join(from, name), path.join(dest, name));
        }
        return;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(from, dest);
}

function minifyJsDir(dir) {
    let esbuild;
    try {
        esbuild = require('esbuild');
    } catch {
        console.warn('[build-renderer] esbuild 不可用，跳过 JS 压缩');
        return;
    }
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        if (fs.statSync(full).isDirectory()) {
            minifyJsDir(full);
            continue;
        }
        if (!name.endsWith('.js') || name.endsWith('.min.js') || name === 'chrome.bundle.js') continue;
        const code = fs.readFileSync(full, 'utf8');
        const result = esbuild.transformSync(code, { minify: true, target: 'chrome140' });
        fs.writeFileSync(full, result.code);
    }
}

function buildChromeBundle() {
    const parts = [];
    for (const rel of CHROME_SCRIPTS) {
        const full = path.join(outDir, rel);
        if (!fs.existsSync(full)) {
            console.warn('[build-renderer] chrome bundle missing:', rel);
            continue;
        }
        parts.push(`/* ${rel} */\n` + fs.readFileSync(full, 'utf8'));
    }
    const bundlePath = path.join(outDir, 'js', 'chrome.bundle.js');
    fs.writeFileSync(bundlePath, parts.join('\n;\n'), 'utf8');

    const indexPath = path.join(outDir, 'index.html');
    let html = fs.readFileSync(indexPath, 'utf8');
    const first = CHROME_SCRIPTS[0];
    const last = CHROME_SCRIPTS[CHROME_SCRIPTS.length - 1];
    const startTag = `<script src="${first}"></script>`;
    const endTag = `<script src="${last}"></script>`;
    const startIdx = html.indexOf(startTag);
    const endIdx = html.indexOf(endTag);
    if (startIdx < 0 || endIdx < 0 || endIdx < startIdx) {
        console.warn('[build-renderer] could not rewrite index.html for chrome.bundle.js');
        return;
    }
    const before = html.slice(0, startIdx);
    const after = html.slice(endIdx + endTag.length);
    html = `${before}<script src="js/chrome.bundle.js"></script>${after}`;
    fs.writeFileSync(indexPath, html, 'utf8');
    console.log(`[build-renderer] chrome.bundle.js (${(fs.statSync(bundlePath).size / 1024).toFixed(0)} KB) + index rewrite`);
}

console.log('[build-renderer] 1/3 Tailwind CSS');
require('./build-css');

console.log('[build-renderer] 1b/3 sync jassub vendor');
try {
    const { spawnSync } = require('child_process');
    const sync = spawnSync(process.execPath, [path.join(__dirname, 'sync-jassub-vendor.js')], {
        cwd: root,
        stdio: 'inherit',
    });
    if (sync.status) {
        console.warn('[build-renderer] sync-jassub-vendor exit', sync.status);
    }
} catch (err) {
    console.warn('[build-renderer] sync-jassub-vendor skipped:', err.message);
}

console.log('[build-renderer] 2/3 复制渲染层');
if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
copyRecursive(path.join(src, 'index.html'), path.join(outDir, 'index.html'));
copyRecursive(path.join(src, 'settings-panels.fragment.html'), path.join(outDir, 'settings-panels.fragment.html'));
copyRecursive(path.join(src, 'workspace-scenes.fragment.html'), path.join(outDir, 'workspace-scenes.fragment.html'));
copyRecursive(path.join(src, 'workspace-shelf.fragment.html'), path.join(outDir, 'workspace-shelf.fragment.html'));
copyRecursive(path.join(src, 'workspace-models.fragment.html'), path.join(outDir, 'workspace-models.fragment.html'));
copyRecursive(path.join(src, 'workspace-burn.fragment.html'), path.join(outDir, 'workspace-burn.fragment.html'));
copyRecursive(path.join(src, 'setup-wizard.fragment.html'), path.join(outDir, 'setup-wizard.fragment.html'));
copyRecursive(path.join(src, 'factory-modals.fragment.html'), path.join(outDir, 'factory-modals.fragment.html'));
copyRecursive(path.join(src, 'editor-modals-drawers.fragment.html'), path.join(outDir, 'editor-modals-drawers.fragment.html'));
copyRecursive(path.join(src, 'editor-modals-tools.fragment.html'), path.join(outDir, 'editor-modals-tools.fragment.html'));
copyRecursive(path.join(src, 'editor-modals-pro.fragment.html'), path.join(outDir, 'editor-modals-pro.fragment.html'));
copyRecursive(path.join(src, 'splash.html'), path.join(outDir, 'splash.html'));
copyRecursive(path.join(src, 'subtitle-editor.html'), path.join(outDir, 'subtitle-editor.html'));
copyRecursive(path.join(src, 'update.html'), path.join(outDir, 'update.html'));
copyRecursive(path.join(src, 'update-progress.html'), path.join(outDir, 'update-progress.html'));
copyRecursive(path.join(src, 'about.html'), path.join(outDir, 'about.html'));
copyRecursive(path.join(src, 'subtitle-shelf.html'), path.join(outDir, 'subtitle-shelf.html'));
copyRecursive(path.join(src, 'icon.png'), path.join(outDir, 'icon.png'));
copyRecursive(path.join(src, 'icon-64.png'), path.join(outDir, 'icon-64.png'));
copyRecursive(path.join(src, 'icon-editor.png'), path.join(outDir, 'icon-editor.png'));
copyRecursive(path.join(src, 'icon-player.png'), path.join(outDir, 'icon-player.png'));
copyRecursive(path.join(src, 'tseditor.png'), path.join(outDir, 'tseditor.png'));
copyRecursive(path.join(src, 'js'), path.join(outDir, 'js'));
copyRecursive(path.join(src, 'vendor'), path.join(outDir, 'vendor'));
// Keep styles/*.css as source of truth; sync into vendor before/after copy.
try {
    const styleSync = [
        ['setup-wizard.css', 'setup-wizard.css'],
        ['factory.css', 'factory.css'],
        ['editor.css', 'editor.css'],
    ];
    for (const [srcName, vendorName] of styleSync) {
        const styleSrc = path.join(src, 'styles', srcName);
        const styleVendor = path.join(src, 'vendor', vendorName);
        if (!fs.existsSync(styleSrc)) continue;
        fs.copyFileSync(styleSrc, styleVendor);
        fs.copyFileSync(styleSrc, path.join(outDir, 'vendor', vendorName));
    }
} catch (err) {
    console.warn('[build-renderer] styles CSS sync failed:', err?.message || err);
}

// Closed-source Pro algorithms ship via `_advanced` only — strip from renderer asar copy.
const { ASAR_EXCLUDE } = require('./proprietary-paths');
const proprietaryRendererJs = ASAR_EXCLUDE
    .filter((p) => p.startsWith('src/js/'))
    .map((p) => path.basename(p));
for (const name of proprietaryRendererJs) {
    const full = path.join(outDir, 'js', name);
    if (fs.existsSync(full)) fs.unlinkSync(full);
}

console.log('[build-renderer] 3/3 压缩 JS + chrome bundle');
minifyJsDir(path.join(outDir, 'js'));
buildChromeBundle();
console.log('[build-renderer] 完成');
