/**
 * Lazy-load UI HTML fragments via Electron IPC (file:// fetch is blocked by Chromium CORS).
 * Used by settings panels, factory workspaces, factory/setup modals, and editor modals.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubUiFragmentLoad = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function uiFragmentLoadFactory(global) {
    /** @type {Record<string, { file: string, roots: string[] }>} */
    const REGISTRY = {
        'settings-panels': {
            file: 'settings-panels.fragment.html',
            roots: ['paramsModal'],
        },
        'workspace-scenes': {
            file: 'workspace-scenes.fragment.html',
            roots: ['workspaceScenes', 'presetNameModal'],
        },
        'workspace-shelf': {
            file: 'workspace-shelf.fragment.html',
            roots: ['workspaceShelf'],
        },
        'workspace-models': {
            file: 'workspace-models.fragment.html',
            roots: ['workspaceModels', 'engineModelsLabModal'],
        },
        'workspace-burn': {
            file: 'workspace-burn.fragment.html',
            roots: ['workspaceBurn'],
        },
        'setup-wizard': {
            file: 'setup-wizard.fragment.html',
            roots: ['setupWizardModal'],
        },
        'factory-modals': {
            file: 'factory-modals.fragment.html',
            roots: [
                'envFixProgressModal',
                'envFixStartModal',
                'envCheckModal',
                'translateStylePickerModal',
                'retranslateModal',
                'appConfirmModal',
                'cliCommandModal',
                'batchSummaryModal',
                'shortcutsModal',
                'manualWhlModal',
                'previewModal',
                'comboPlansModal',
            ],
        },
        'editor-modals-drawers': {
            file: 'editor-modals-drawers.fragment.html',
            roots: [
                'editorFindReplaceModal',
                'editorGlossaryModal',
                'editorAnilistImportModal',
                'editorAssStylesModal',
                'editorBreakWordsModal',
                'editorTextPresetsModal',
                'editorWorkflowModal',
                'editorQcModal',
            ],
        },
        'editor-modals-tools': {
            file: 'editor-modals-tools.fragment.html',
            roots: [
                'editorSplitModal',
                'editorBatchDurModal',
                'editorSmartSplitModal',
                'editorSilenceSplitModal',
                'editorSmartAdjustModal',
                'editorRemoveNoiseModal',
                'editorFillerCheckModal',
                'editorBatchDeleteModal',
                'editorBatchRetranslateModal',
                'editorChineseConvertModal',
                'editorCompressRepModal',
                'editorViewingPunctModal',
                'editorRetranscribeDurModal',
            ],
        },
        'editor-modals-pro': {
            file: 'editor-modals-pro.fragment.html',
            roots: [
                'editorFilmHintModal',
                'editorFilmBriefModal',
                'editorReconstructReviewModal',
                'editorGenericModal',
                'editorShortcutsModal',
            ],
        },
    };

    const FACTORY_CHROME_FRAGMENT_KEYS = ['factory-modals', 'setup-wizard'];
    const EDITOR_MODAL_FRAGMENT_KEYS = [
        'editor-modals-drawers',
        'editor-modals-tools',
        'editor-modals-pro',
    ];

    /** @type {Map<string, Promise<void>>} */
    const inflight = new Map();
    /** @type {Set<string>} */
    const ready = new Set();

    function getDoc() {
        return (global && global.document)
            || (typeof document !== 'undefined' ? document : null);
    }

    function getElectron() {
        return (global && (global.__ELECTRON__ || global.electron))
            || (typeof window !== 'undefined' && (window.__ELECTRON__ || window.electron))
            || null;
    }

    function isReady(key) {
        const k = String(key || '');
        if (ready.has(k)) return true;
        const meta = REGISTRY[k];
        if (!meta) return false;
        const doc = getDoc();
        if (!doc) return false;
        const all = meta.roots.every((id) => {
            const el = doc.getElementById(id);
            return el && el.getAttribute('data-ui-fragment') !== 'pending'
                && el.getAttribute('data-settings-dom') !== 'pending';
        });
        if (all) ready.add(k);
        return all;
    }

    function fragmentUrl(fileName) {
        try {
            const loc = (global && global.location) || (typeof location !== 'undefined' ? location : null);
            const base = String(loc?.href || '');
            if (base.includes('?') || base.includes('#')) {
                return base.replace(/[?#].*$/, '').replace(/[^/]+$/, fileName);
            }
            return new URL(fileName, base || 'file:///').href;
        } catch {
            return fileName;
        }
    }

    async function loadFragmentHtml(fileName) {
        const electron = getElectron();
        if (typeof electron?.transubReadUiFragment === 'function') {
            const res = await electron.transubReadUiFragment({ name: fileName });
            if (res?.ok && typeof res.html === 'string' && res.html.trim()) {
                return res.html;
            }
            if (res && res.ok === false) {
                throw new Error(res.error || `fragment IPC failed: ${fileName}`);
            }
        }
        const res = await fetch(fragmentUrl(fileName), { cache: 'force-cache' });
        if (!res.ok) throw new Error(`fragment HTTP ${res.status}: ${fileName}`);
        return res.text();
    }

    function collectTopElements(html) {
        const doc = getDoc();
        if (!doc) return [];
        const tmp = doc.createElement('div');
        tmp.innerHTML = String(html || '').trim();
        return Array.from(tmp.children || []);
    }

    function injectFragment(key, html) {
        const meta = REGISTRY[key];
        const doc = getDoc();
        if (!meta || !doc) throw new Error(`unknown fragment: ${key}`);
        const nodes = collectTopElements(html);
        if (!nodes.length) throw new Error(`empty fragment: ${key}`);

        const byId = new Map();
        nodes.forEach((el) => {
            if (el && el.id) byId.set(el.id, el);
        });

        for (const id of meta.roots) {
            const next = byId.get(id);
            if (!next) throw new Error(`fragment ${key} missing #${id}`);
            next.removeAttribute('data-ui-fragment');
            next.removeAttribute('data-settings-dom');
            const cur = doc.getElementById(id);
            if (!cur) {
                doc.body.appendChild(next);
            } else {
                cur.replaceWith(next);
            }
        }
        ready.add(key);
        try {
            const target = global || (typeof window !== 'undefined' ? window : null);
            target?.dispatchEvent?.(new CustomEvent('transub-ui-fragment-ready', { detail: { key } }));
        } catch { /* ignore */ }
    }

    async function ensureUiFragment(key) {
        const k = String(key || '');
        if (!REGISTRY[k]) throw new Error(`unknown ui fragment: ${k}`);
        if (isReady(k)) return;
        if (inflight.has(k)) return inflight.get(k);
        const p = (async () => {
            const html = await loadFragmentHtml(REGISTRY[k].file);
            injectFragment(k, html);
        })().finally(() => {
            inflight.delete(k);
        });
        inflight.set(k, p);
        return p;
    }

    function workspaceFragmentKey(workspaceId) {
        const id = String(workspaceId || '');
        if (id === 'scenes') return 'workspace-scenes';
        if (id === 'shelf') return 'workspace-shelf';
        if (id === 'models') return 'workspace-models';
        if (id === 'burn') return 'workspace-burn';
        return '';
    }

    async function ensureAll(keys) {
        const list = Array.isArray(keys) ? keys : [];
        await Promise.all(list.map((k) => ensureUiFragment(k)));
    }

    function ensureFactoryChromeDom() {
        return ensureAll(FACTORY_CHROME_FRAGMENT_KEYS);
    }

    function ensureEditorModalDom() {
        return ensureAll(EDITOR_MODAL_FRAGMENT_KEYS);
    }

    return {
        REGISTRY,
        FACTORY_CHROME_FRAGMENT_KEYS,
        EDITOR_MODAL_FRAGMENT_KEYS,
        ensureUiFragment,
        ensureAll,
        ensureFactoryChromeDom,
        ensureEditorModalDom,
        isReady,
        workspaceFragmentKey,
        // Back-compat aliases for settings
        ensureSettingsDom: () => ensureUiFragment('settings-panels'),
        isSettingsReady: () => isReady('settings-panels'),
    };
}));
