/**
 * Load renderer scripts on demand (shelf / burn / wizard / settings helpers).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubDeferredScriptLoad = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function deferredScriptLoadFactory() {
    /** @type {Map<string, Promise<void>>} */
    const inflight = new Map();
    /** @type {Set<string>} */
    const loaded = new Set();

    function scriptAlreadyPresent(src) {
        try {
            const scripts = global.document?.querySelectorAll?.('script[src]') || [];
            for (const el of scripts) {
                const s = String(el.getAttribute('src') || '');
                if (s === src || s.endsWith('/' + src) || s.endsWith('\\' + src)) return true;
            }
        } catch { /* ignore */ }
        return false;
    }

    function loadScript(src) {
        const key = String(src || '').trim();
        if (!key) return Promise.resolve();
        if (loaded.has(key) || scriptAlreadyPresent(key)) {
            loaded.add(key);
            return Promise.resolve();
        }
        if (inflight.has(key)) return inflight.get(key);
        const p = new Promise((resolve, reject) => {
            const doc = global.document;
            if (!doc?.head && !doc?.body) {
                reject(new Error('document not ready for script: ' + key));
                return;
            }
            const el = doc.createElement('script');
            el.src = key;
            el.async = false;
            el.onload = () => {
                loaded.add(key);
                inflight.delete(key);
                resolve();
            };
            el.onerror = () => {
                inflight.delete(key);
                reject(new Error('failed to load script: ' + key));
            };
            (doc.head || doc.body).appendChild(el);
        });
        inflight.set(key, p);
        return p;
    }

    function loadScripts(srcs) {
        const list = Array.isArray(srcs) ? srcs : [srcs];
        return list.reduce(
            (chain, src) => chain.then(() => loadScript(src)),
            Promise.resolve(),
        );
    }

    const GROUPS = {
        shelf: [
            'js/subtitle-shelf-core.js',
            'js/subtitle-shelf-translate-core.js',
            'js/subtitle-shelf-ui.js',
        ],
        burn: [
            'js/subtitle-burn-style-presets-core.js',
            'js/subtitle-burn-core.js',
            'js/subtitle-burn-style-presets-ui.js',
            'js/subtitle-burn-preview.js',
            'js/subtitle-burn-ui.js',
        ],
        wizard: [
            'js/env-fix-progress-core.js',
            'js/env-fix-start-core.js',
            'js/pip-mirror-ui-core.js',
            'js/env-check.js',
            'js/setup-wizard.js',
        ],
        envCheck: [
            'js/env-fix-progress-core.js',
            'js/env-fix-start-core.js',
            'js/pip-mirror-ui-core.js',
            'js/env-check.js',
        ],
        advancedSettings: [
            'js/advanced-settings.js',
        ],
        features: [
            'js/features.js',
        ],
        manualWhl: [
            'js/manual-whl-link-export-core.js',
            'js/manual-whl-install.js',
        ],
        editorPrefs: [
            'js/settings-editor-prefs.js',
        ],
        smartTranslate: [
            'js/huihui-qwen3-profile-core.js',
            'js/translategemma-profile-core.js',
            'js/smart-translate-recycle-guard-core.js',
            'js/smart-translate-align-core.js',
            'js/smart-translate-hybrid-core.js',
            'js/smart-translate-readiness-core.js',
            'js/smart-translate-polish-core.js',
            'js/subtitle-qc-smart-core.js',
            'js/post-batch-autofix-plan-core.js',
            'js/retranslate-plan-core.js',
        ],
        catalogs: [
            'js/sakura-mt-catalog-core.js',
            'js/advanced-managed-llm-catalog-core.js',
            'js/transwithai-model-core.js',
            'js/av-makers-embed.js',
            'js/auto-scan-folders-core.js',
            'js/anime-whisper-preset-tip.js',
        ],
        qwenAsr: [
            'js/qwen-asr-batch-core.js',
            'js/qwen-asr-progress-core.js',
        ],
    };

    function loadGroup(name) {
        const list = GROUPS[name];
        if (!list) return Promise.resolve();
        return loadScripts(list);
    }

    return {
        loadScript,
        loadScripts,
        loadGroup,
        GROUPS,
    };
}));
