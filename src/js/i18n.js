/**
 * Renderer UI i18n bootstrap.
 * Depends on: i18n-core.js, i18n-catalogs.js
 * Optional: subtitle-chinese-core + lazy OpenCC (Hant deep convert)
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
    let booted = false;
    /** @type {Promise<void>|null} */
    let bootPromise = null;

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

    async function ensureConverterForLocale(locale) {
        if (!core.isHantLocale || !core.isHantLocale(locale)) return;
        convertReady = false;
        try {
            await global.TransubSubtitleChinese?.ensureOpenCC?.();
        } catch (err) {
            console.warn('[TransubI18n] OpenCC ensure failed:', err?.message || err);
        }
        resolveConverter();
    }

    function readStoredLocale() {
        try {
            return core.normalizeUiLocale(global.localStorage?.getItem(STORAGE_KEY));
        } catch {
            return core.DEFAULT_UI_LOCALE;
        }
    }

    const i18n = core.createI18n({
        catalogs,
        locale: readStoredLocale(),
        fallbackChain: core.UI_LOCALE_REGISTRY?.fallbackChain,
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

    async function ensureCatalogs(locale) {
        if (typeof catalogMod.ensureCatalogsForLocale === 'function') {
            await catalogMod.ensureCatalogsForLocale(
                locale,
                core.UI_LOCALE_REGISTRY?.fallbackChain,
            );
        } else if (typeof catalogMod.loadCatalogsFromDisk === 'function') {
            catalogMod.loadCatalogsFromDisk();
        }
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
        if (!node) return;
        if (node.nodeType === 1) {
            applyLocale(node);
        } else if (node.nodeType === 11) {
            Array.from(node.childNodes || []).forEach(localizeAddedNode);
        }
    }

    function startObserver() {
        if (observer || typeof MutationObserver === 'undefined' || !global.document?.body) return;
        observer = new MutationObserver((mutations) => {
            if (applying) return;
            for (const m of mutations) {
                if (m.type === 'childList') {
                    m.addedNodes.forEach(localizeAddedNode);
                }
            }
        });
        observer.observe(global.document.body, { childList: true, subtree: true });
    }

    async function setLocale(next, { apply = true, persist = true } = {}) {
        const locale = i18n.setLocale(next);
        await ensureCatalogs(locale);
        await ensureConverterForLocale(locale);
        if (persist) persistLocale(locale);
        if (apply) applyLocale(global.document);
        try {
            global.dispatchEvent(new CustomEvent('transub-ui-locale', { detail: { locale } }));
        } catch { /* ignore */ }
        return locale;
    }

    /**
     * Rebuild <select> options from the locale registry (enabled entries).
     * Option labels use catalog key settings.uiLocale.locale.<id>.
     */
    function fillUiLocaleSelect(selectEl, { selected } = {}) {
        if (!selectEl || selectEl.tagName !== 'SELECT') return;
        const entries = typeof core.listUiLocales === 'function'
            ? core.listUiLocales({ enabledOnly: true })
            : (core.UI_LOCALES || []).map((id) => ({ id, nativeName: id }));
        const want = core.normalizeUiLocale(
            selected != null ? selected : (selectEl.value || i18n.getLocale()),
        );
        const prevApplying = applying;
        applying = true;
        try {
            selectEl.textContent = '';
            entries.forEach((entry) => {
                const opt = global.document.createElement('option');
                opt.value = entry.id;
                const key = core.optionLabelKey
                    ? core.optionLabelKey(entry.id)
                    : `settings.uiLocale.locale.${entry.id}`;
                opt.setAttribute('data-i18n', key);
                opt.textContent = i18n.t(key) || entry.nativeName || entry.id;
                selectEl.appendChild(opt);
            });
            if ([...selectEl.options].some((o) => o.value === want)) {
                selectEl.value = want;
            } else if (selectEl.options.length) {
                selectEl.value = selectEl.options[0].value;
            }
        } finally {
            applying = prevApplying;
        }
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

    async function boot() {
        if (booted) return;
        if (bootPromise) return bootPromise;
        bootPromise = (async () => {
            const locale = i18n.getLocale();
            await ensureCatalogs(locale);
            await ensureConverterForLocale(locale);
            const select = global.document?.getElementById?.('uiLocaleSelect');
            if (select) fillUiLocaleSelect(select, { selected: locale });
            applyLocale();
            startObserver();
            wrapToastHub();
            booted = true;
        })().catch((err) => {
            console.warn('[TransubI18n] boot failed:', err?.message || err);
            try {
                applyLocale();
                startObserver();
                wrapToastHub();
            } catch { /* ignore */ }
            booted = true;
        });
        return bootPromise;
    }

    if (global.document?.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', () => { void boot(); });
    } else {
        void boot();
    }

    global.addEventListener?.('load', () => {
        wrapToastHub();
        void boot().then(() => applyLocale());
    });

    try {
        const electronApi = global.__ELECTRON__ || global.electron || null;
        const onUpdated = electronApi?.onSettingsUpdated;
        if (typeof onUpdated === 'function') {
            onUpdated((payload) => {
                const next = payload?.options?.uiLocale ?? payload?.uiLocale;
                if (next == null) return;
                const normalized = core.normalizeUiLocale(next);
                if (normalized === i18n.getLocale()) return;
                void setLocale(normalized, { apply: true, persist: true }).then(() => {
                    const select = global.document?.getElementById?.('uiLocaleSelect');
                    if (select) fillUiLocaleSelect(select, { selected: normalized });
                });
            });
        }
    } catch { /* ignore */ }

    function tf(template, vars) {
        const nextVars = {};
        if (vars && typeof vars === 'object') {
            Object.keys(vars).forEach((k) => {
                const v = vars[k];
                nextVars[k] = (typeof v === 'string') ? i18n.tx(v) : v;
            });
        }
        return i18n.tf(template, nextVars);
    }

    global.TransubI18n = {
        t: i18n.t,
        tf,
        tx: i18n.tx,
        setLocale,
        getLocale: i18n.getLocale,
        applyLocale,
        apply: applyLocale,
        fillUiLocaleSelect,
        ensureReady: boot,
        normalizeUiLocale: core.normalizeUiLocale,
        isHantLocale: core.isHantLocale,
        localeStrategy: core.localeStrategy,
        listUiLocales: core.listUiLocales,
        UI_LOCALES: core.UI_LOCALES,
        UI_LOCALE_REGISTRY: core.UI_LOCALE_REGISTRY,
        DEFAULT_UI_LOCALE: core.DEFAULT_UI_LOCALE,
        htmlLangForLocale: core.htmlLangForLocale,
        wrapToastHub,
    };
}(typeof globalThis !== 'undefined' ? globalThis : window));
