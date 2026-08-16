/**
 * Renderer UI i18n bootstrap.
 * Depends on: i18n-core.js, i18n-catalogs.js
 * Optional: vendor/opencc-js + subtitle-chinese-core (Hant deep convert)
 */
(function (global) {
    const core = global.TransubI18nCore;
    const catalogMod = global.TransubI18nCatalogs;
    if (!core || !catalogMod) {
        console.warn('[TransubI18n] core/catalogs missing — load i18n-core.js and i18n-catalogs.js first');
        return;
    }

    const STORAGE_KEY = 'transub.uiLocale';
    const catalogs = (typeof catalogMod.getCatalogs === 'function')
        ? catalogMod.getCatalogs()
        : (catalogMod.CATALOGS || {});

    let convertHansToHant = null;
    let convertReady = false;

    function resolveConverter() {
        if (convertReady) return convertHansToHant;
        convertReady = true;
        try {
            const chinese = global.TransubSubtitleChinese;
            if (chinese && typeof chinese.convertText === 'function') {
                convertHansToHant = (text) => {
                    const r = chinese.convertText(text, 's2t', { locale: 'twp' });
                    return (r && typeof r === 'object' && r.text != null) ? String(r.text) : String(r ?? text);
                };
                return convertHansToHant;
            }
        } catch { /* ignore */ }
        try {
            const OpenCC = global.OpenCC;
            if (OpenCC && typeof OpenCC.Converter === 'function') {
                const conv = OpenCC.Converter({ from: 'cn', to: 'twp' });
                convertHansToHant = (text) => conv(String(text || ''));
                return convertHansToHant;
            }
        } catch { /* ignore */ }
        convertHansToHant = null;
        return null;
    }

    function readStoredLocale() {
        try {
            return core.normalizeUiLocale(global.localStorage?.getItem(STORAGE_KEY));
        } catch {
            return core.DEFAULT_UI_LOCALE;
        }
    }

    resolveConverter();
    const i18n = core.createI18n({
        catalogs,
        locale: readStoredLocale(),
        fallbackLocale: core.FALLBACK_UI_LOCALE,
        convertHansToHant: (text) => {
            const fn = resolveConverter();
            return fn ? fn(text) : text;
        },
    });

    let observer = null;
    let applying = false;

    function persistLocale(locale) {
        try {
            global.localStorage?.setItem(STORAGE_KEY, locale);
        } catch { /* ignore */ }
    }

    function applyLocale(root) {
        if (applying) return { keyed: 0, deep: 0 };
        applying = true;
        try {
            resolveConverter();
            return i18n.apply(root || global.document);
        } finally {
            applying = false;
        }
    }

    function localizeAddedNode(node) {
        if (!core.isHantLocale(i18n.getLocale()) || !node) return;
        if (node.nodeType === 1) {
            applyLocale(node);
        } else if (node.nodeType === 11) {
            // DocumentFragment
            Array.from(node.childNodes || []).forEach(localizeAddedNode);
        }
    }

    function startObserver() {
        if (observer || typeof MutationObserver === 'undefined' || !global.document?.body) return;
        observer = new MutationObserver((mutations) => {
            if (applying || !core.isHantLocale(i18n.getLocale())) return;
            for (const m of mutations) {
                if (m.type === 'childList') {
                    m.addedNodes.forEach(localizeAddedNode);
                }
            }
        });
        observer.observe(global.document.body, { childList: true, subtree: true });
    }

    function setLocale(next, { apply = true, persist = true } = {}) {
        const locale = i18n.setLocale(next);
        if (persist) persistLocale(locale);
        if (apply) applyLocale(global.document);
        try {
            global.dispatchEvent(new CustomEvent('transub-ui-locale', { detail: { locale } }));
        } catch { /* ignore */ }
        return locale;
    }

    function localizeConfirmOpts(opts = {}) {
        const next = { ...opts };
        ['title', 'message', 'primaryLabel', 'secondaryLabel', 'tertiaryLabel', 'actionLabel']
            .forEach((k) => {
                if (next[k] != null) next[k] = i18n.tx(next[k]);
            });
        return next;
    }

    function wrapToastHub() {
        const ux = global.TransubMainUiUx;
        if (!ux || ux.__i18nWrapped) return;
        if (typeof ux.showToast === 'function') {
            const origToast = ux.showToast.bind(ux);
            ux.showToast = function showToast(message, tone, options) {
                const opts = options && typeof options === 'object'
                    ? localizeConfirmOpts(options)
                    : options;
                return origToast(i18n.tx(message), tone, opts);
            };
        }
        if (typeof ux.confirmDialog === 'function') {
            const orig = ux.confirmDialog.bind(ux);
            ux.confirmDialog = function confirmDialog(opts = {}) {
                return orig(localizeConfirmOpts(opts));
            };
        }
        if (typeof ux.confirmYesNo === 'function') {
            const orig = ux.confirmYesNo.bind(ux);
            ux.confirmYesNo = function confirmYesNo(opts = {}) {
                return orig(localizeConfirmOpts(opts));
            };
        }
        if (typeof ux.showBatchSummary === 'function') {
            const orig = ux.showBatchSummary.bind(ux);
            ux.showBatchSummary = function showBatchSummary(opts = {}) {
                return orig(localizeConfirmOpts(opts));
            };
        }
        ux.__i18nWrapped = true;
    }

    function boot() {
        applyLocale();
        startObserver();
        wrapToastHub();
    }

    if (global.document?.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    // Re-wrap after late script loads (main-ui-ux may load after i18n)
    global.addEventListener?.('load', () => {
        wrapToastHub();
        applyLocale();
    });

    // Sync locale when settings are saved from any window.
    try {
        const electronApi = global.__ELECTRON__ || global.electron || null;
        const onUpdated = electronApi?.onSettingsUpdated;
        if (typeof onUpdated === 'function') {
            onUpdated((payload) => {
                const next = payload?.options?.uiLocale ?? payload?.uiLocale;
                if (next == null) return;
                const normalized = core.normalizeUiLocale(next);
                if (normalized === i18n.getLocale()) return;
                setLocale(normalized, { apply: true, persist: true });
            });
        }
    } catch { /* ignore */ }

    global.TransubI18n = {
        t: i18n.t,
        tx: i18n.tx,
        setLocale,
        getLocale: i18n.getLocale,
        applyLocale,
        apply: applyLocale,
        normalizeUiLocale: core.normalizeUiLocale,
        isHantLocale: core.isHantLocale,
        UI_LOCALES: core.UI_LOCALES,
        DEFAULT_UI_LOCALE: core.DEFAULT_UI_LOCALE,
        htmlLangForLocale: core.htmlLangForLocale,
        wrapToastHub,
    };
}(typeof globalThis !== 'undefined' ? globalThis : window));
