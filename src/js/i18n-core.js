/**
 * UI i18n core (Node + browser). Catalogs are injected by the host.
 * Locale IDs: registry in shared/i18n/locales.json (mirrored below).
 *
 * Coverage model:
 * - t(key): curated catalog keys with fallback chain (locale → en → zh-Hans)
 * - tx(hansText): Hans→Hant OpenCC + phrase overrides (hans-opencc strategy only)
 * - applyDom + applyDomDeep: data-i18n* then convert remaining chrome text
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubI18nCore = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function i18nCoreFactory() {
    /** Keep in sync with shared/i18n/locales.json (sync-i18n-catalogs validates). */
    const UI_LOCALE_REGISTRY = Object.freeze({
        default: 'zh-Hans',
        fallbackChain: Object.freeze(['en', 'zh-Hans']),
        locales: Object.freeze([
            Object.freeze({
                id: 'zh-Hans', bcp47: 'zh-CN', nativeName: '简体中文',
                enabled: true, strategy: 'source',
            }),
            Object.freeze({
                id: 'zh-Hant-TW', bcp47: 'zh-TW', nativeName: '繁體中文',
                enabled: true, strategy: 'hans-opencc',
            }),
            Object.freeze({
                id: 'en', bcp47: 'en', nativeName: 'English',
                enabled: true, strategy: 'catalog',
            }),
            Object.freeze({
                id: 'ja', bcp47: 'ja', nativeName: '日本語',
                enabled: true, strategy: 'catalog',
            }),
            Object.freeze({
                id: 'ko', bcp47: 'ko', nativeName: '한국어',
                enabled: true, strategy: 'catalog',
            }),
        ]),
    });

    const DEFAULT_UI_LOCALE = UI_LOCALE_REGISTRY.default;
    const FALLBACK_UI_LOCALE = 'zh-Hans';
    const UI_LOCALES = Object.freeze(
        UI_LOCALE_REGISTRY.locales.map((e) => e.id),
    );

    const ALIASES = Object.freeze({
        zh: 'zh-Hans',
        'zh-cn': 'zh-Hans',
        'zh-hans': 'zh-Hans',
        'zh-sg': 'zh-Hans',
        'zh-tw': 'zh-Hant-TW',
        'zh-hant': 'zh-Hant-TW',
        'zh-hant-tw': 'zh-Hant-TW',
        'zh-hk': 'zh-Hant-TW',
        'zh-hant-hk': 'zh-Hant-TW',
        hans: 'zh-Hans',
        hant: 'zh-Hant-TW',
        tw: 'zh-Hant-TW',
        en: 'en',
        'en-us': 'en',
        'en-gb': 'en',
        'en-au': 'en',
        english: 'en',
        ja: 'ja',
        'ja-jp': 'ja',
        jp: 'ja',
        japanese: 'ja',
        ko: 'ko',
        'ko-kr': 'ko',
        kr: 'ko',
        korean: 'ko',
    });

    const localeById = new Map(
        UI_LOCALE_REGISTRY.locales.map((e) => [e.id, e]),
    );

    const CJK_RE = /[\u3400-\u9FFF\uF900-\uFAFF]/;
    const SKIP_TAGS = new Set([
        'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE', 'SVG', 'MATH', 'KBD', 'SAMP',
    ]);
    /** Closest() skip — user content / logs / editable subtitle surfaces */
    const SKIP_CLOSEST = [
        '[data-i18n-skip]',
        '[contenteditable=""],[contenteditable="true"]',
        'input:not([type="button"]):not([type="submit"]):not([type="reset"])',
        'textarea',
        '.cue-text',
        '.cue-edit',
        '.cue-editor',
        '.subtitle-cue-text',
        '#logPanel',
        '#logOutput',
        '.task-log',
        '.mono-log',
        '[data-path]',
    ].join(',');

    const ATTRS_TO_LOCALIZE = ['title', 'placeholder', 'aria-label', 'aria-description'];

    function getLocaleEntry(locale) {
        return localeById.get(normalizeUiLocale(locale)) || localeById.get(DEFAULT_UI_LOCALE);
    }

    function listUiLocales({ enabledOnly = true } = {}) {
        return UI_LOCALE_REGISTRY.locales.filter((e) => (enabledOnly ? e.enabled : true));
    }

    function localeStrategy(locale) {
        const entry = getLocaleEntry(locale);
        return entry?.strategy || 'catalog';
    }

    function normalizeUiLocale(raw) {
        const s = String(raw || '').trim();
        if (!s) return DEFAULT_UI_LOCALE;
        if (localeById.has(s)) return s;
        const mapped = ALIASES[s.toLowerCase()];
        if (mapped && localeById.has(mapped)) return mapped;
        const lower = s.toLowerCase();
        const primary = lower.split(/[-_]/)[0];
        const byPrimary = ALIASES[primary];
        if (byPrimary && localeById.has(byPrimary)) return byPrimary;
        return DEFAULT_UI_LOCALE;
    }

    function isHantLocale(locale) {
        return localeStrategy(locale) === 'hans-opencc';
    }

    function htmlLangForLocale(locale) {
        const entry = getLocaleEntry(locale);
        return entry?.bcp47 || 'zh-CN';
    }

    function resolveFallbackChain(locale, opts = {}) {
        const id = normalizeUiLocale(locale);
        const chain = [id];
        const configured = Array.isArray(opts.fallbackChain)
            ? opts.fallbackChain
            : UI_LOCALE_REGISTRY.fallbackChain;
        configured.forEach((fb) => {
            const n = normalizeUiLocale(fb);
            if (!chain.includes(n)) chain.push(n);
        });
        if (!chain.includes(FALLBACK_UI_LOCALE)) chain.push(FALLBACK_UI_LOCALE);
        return chain;
    }

    function hasCjk(text) {
        return CJK_RE.test(String(text || ''));
    }

    function interpolate(template, vars) {
        const text = String(template ?? '');
        if (!vars || typeof vars !== 'object') return text;
        return text.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, name) => {
            if (!Object.prototype.hasOwnProperty.call(vars, name)) return `{${name}}`;
            const v = vars[name];
            return v == null ? '' : String(v);
        });
    }

    function lookup(catalogs, locale, key) {
        const pack = catalogs && catalogs[locale];
        if (!pack || typeof pack !== 'object') return undefined;
        const v = pack[key];
        return v == null ? undefined : String(v);
    }

    /**
     * Format a Hans template that uses {var} placeholders.
     * Looks up phrase.<template> in catalog locales; falls back to interpolating the Hans template.
     */
    function tf(template, vars, opts = {}) {
        const src = template == null ? '' : String(template);
        if (!src) return '';
        const catalogs = opts.catalogs || {};
        const chain = resolveFallbackChain(opts.locale, {
            fallbackChain: opts.fallbackChain
                || (opts.fallbackLocale
                    ? [opts.fallbackLocale, FALLBACK_UI_LOCALE]
                    : undefined),
        });
        const phraseKey = `phrase.${src}`;
        let raw;
        for (let i = 0; i < chain.length; i += 1) {
            const loc = chain[i];
            // Allow zh-Hans identity phrase if present; otherwise keep walking.
            raw = lookup(catalogs, loc, phraseKey);
            if (raw !== undefined) break;
        }
        if (raw === undefined) raw = src;
        return interpolate(raw, vars);
    }

    /**
     * @param {string} key
     * @param {object} [opts]
     */
    function t(key, opts = {}) {
        const k = String(key || '');
        if (!k) return '';
        const catalogs = opts.catalogs || {};
        const chain = resolveFallbackChain(opts.locale, {
            fallbackChain: opts.fallbackChain
                || (opts.fallbackLocale
                    ? [opts.fallbackLocale, FALLBACK_UI_LOCALE]
                    : undefined),
        });
        let raw;
        for (let i = 0; i < chain.length; i += 1) {
            raw = lookup(catalogs, chain[i], k);
            if (raw !== undefined) break;
        }
        if (raw === undefined) return k;
        return interpolate(raw, opts.vars);
    }

    function applyPhraseMap(text, catalogs, locale, cache) {
        const pack = catalogs && catalogs[locale];
        if (!pack || typeof pack !== 'object') return text;
        let entries = cache && cache.get(locale);
        if (!entries) {
            entries = [];
            Object.keys(pack).forEach((k) => {
                if (!k.startsWith('phrase.')) return;
                const from = k.slice('phrase.'.length);
                if (!from) return;
                entries.push([from, String(pack[k])]);
            });
            entries.sort((a, b) => b[0].length - a[0].length);
            if (cache) cache.set(locale, entries);
        }
        if (!entries.length) return text;
        let out = String(text || '');
        entries.forEach(([from, to]) => {
            if (out.includes(from)) out = out.split(from).join(to);
        });
        return out;
    }

    /**
     * Display hardcoded Hans chrome in the active locale.
     * - source: passthrough
     * - hans-opencc: phrase exact → phrase map → OpenCC
     * - catalog (en/ja/ko/…): phrase exact → phrase map → passthrough (Hans until translated)
     * Phrase keys: `phrase.<hansText>` (exact or substring via map).
     */
    function tx(text, opts = {}) {
        const src = text == null ? '' : String(text);
        if (!src || !hasCjk(src)) return src;
        const locale = normalizeUiLocale(opts.locale);
        const strategy = localeStrategy(locale);
        if (strategy === 'source') return src;

        const catalogs = opts.catalogs || {};
        const phraseCache = opts.phraseCache || null;
        const chain = resolveFallbackChain(locale, {
            fallbackChain: opts.fallbackChain
                || (opts.fallbackLocale
                    ? [opts.fallbackLocale, FALLBACK_UI_LOCALE]
                    : undefined),
        });

        const phraseKey = `phrase.${src}`;
        for (let i = 0; i < chain.length; i += 1) {
            const loc = chain[i];
            if (localeStrategy(loc) === 'source') continue;
            const overridden = lookup(catalogs, loc, phraseKey);
            if (overridden !== undefined) {
                return interpolate(overridden, opts.vars);
            }
        }

        // Substring phrase maps are for Hant term overrides only.
        // Catalog locales (en/ja/ko) must not partial-replace (avoids mixed-language chrome).
        if (strategy === 'catalog') {
            return src;
        }

        let staged = src;
        for (let i = 0; i < chain.length; i += 1) {
            const loc = chain[i];
            if (localeStrategy(loc) !== 'hans-opencc') continue;
            const next = applyPhraseMap(staged, catalogs, loc, phraseCache);
            if (next !== staged) {
                staged = next;
                break;
            }
        }

        if (strategy === 'hans-opencc') {
            const convert = typeof opts.convertHansToHant === 'function'
                ? opts.convertHansToHant
                : null;
            if (convert) {
                try {
                    return convert(staged);
                } catch {
                    return staged;
                }
            }
        }
        return staged;
    }

    function setAttr(el, name, value) {
        if (!el || value == null) return;
        el.setAttribute(name, value);
    }

    function applyDom(root, translateFn) {
        const scope = root && root.querySelectorAll ? root : null;
        if (!scope || typeof translateFn !== 'function') return 0;
        let count = 0;
        const nodes = scope.querySelectorAll(
            '[data-i18n],[data-i18n-title],[data-i18n-placeholder],[data-i18n-aria-label],[data-i18n-html]',
        );
        nodes.forEach((el) => {
            const textKey = el.getAttribute('data-i18n');
            if (textKey) {
                el.textContent = translateFn(textKey);
                count += 1;
            }
            const htmlKey = el.getAttribute('data-i18n-html');
            if (htmlKey) {
                el.innerHTML = translateFn(htmlKey);
                count += 1;
            }
            const titleKey = el.getAttribute('data-i18n-title');
            if (titleKey) {
                setAttr(el, 'title', translateFn(titleKey));
                count += 1;
            }
            const phKey = el.getAttribute('data-i18n-placeholder');
            if (phKey) {
                setAttr(el, 'placeholder', translateFn(phKey));
                count += 1;
            }
            const ariaKey = el.getAttribute('data-i18n-aria-label');
            if (ariaKey) {
                setAttr(el, 'aria-label', translateFn(ariaKey));
                count += 1;
            }
        });
        return count;
    }

    function shouldSkipElement(el) {
        if (!el || el.nodeType !== 1) return true;
        if (SKIP_TAGS.has(el.tagName)) return true;
        try {
            if (el.closest && el.closest(SKIP_CLOSEST)) return true;
        } catch { /* invalid selector in old env */ }
        if (el.isContentEditable) return true;
        return false;
    }

    /**
     * Convert remaining chrome (non data-i18n) using txFn(hansOriginal).
     * Stores Hans originals on first visit so locale can toggle without reload.
     */
    function applyDomDeep(root, txFn, stores) {
        const doc = root && (root.nodeType === 9 ? root : root.ownerDocument);
        const scope = root && (root.body || root);
        if (!scope || typeof txFn !== 'function' || !doc) return 0;

        const textOrig = stores?.textOrig || new WeakMap();
        const attrOrig = stores?.attrOrig || new WeakMap();
        let count = 0;

        const walker = doc.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                const parent = node.parentElement;
                if (!parent || shouldSkipElement(parent)) return NodeFilter.FILTER_REJECT;
                if (parent.closest && parent.closest('[data-i18n],[data-i18n-html]')) {
                    return NodeFilter.FILTER_REJECT;
                }
                const raw = node.nodeValue;
                if (raw == null || !String(raw).trim()) {
                    return NodeFilter.FILTER_REJECT;
                }
                // Already captured Hans original: keep re-translating even after the
                // live text lost CJK (e.g. zh-Hans → en → ja / back to Hans).
                if (textOrig.has(node)) return NodeFilter.FILTER_ACCEPT;
                if (!hasCjk(raw)) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            },
        });

        const textNodes = [];
        for (let n = walker.nextNode(); n; n = walker.nextNode()) textNodes.push(n);
        textNodes.forEach((node) => {
            if (!textOrig.has(node)) textOrig.set(node, node.nodeValue);
            const orig = textOrig.get(node);
            const next = txFn(orig);
            if (next !== node.nodeValue) {
                node.nodeValue = next;
                count += 1;
            }
        });

        const attrEls = scope.querySelectorAll
            ? scope.querySelectorAll('[title],[placeholder],[aria-label],[aria-description]')
            : [];
        attrEls.forEach((el) => {
            if (shouldSkipElement(el)) return;
            if (el.hasAttribute('data-i18n-title')
                || el.hasAttribute('data-i18n-placeholder')
                || el.hasAttribute('data-i18n-aria-label')) {
                return;
            }
            let bag = attrOrig.get(el);
            if (!bag) {
                bag = {};
                attrOrig.set(el, bag);
            }
            ATTRS_TO_LOCALIZE.forEach((name) => {
                if (!el.hasAttribute(name)) return;
                if (!Object.prototype.hasOwnProperty.call(bag, name)) {
                    bag[name] = el.getAttribute(name);
                }
                const orig = bag[name];
                if (!hasCjk(orig)) return;
                const next = txFn(orig);
                if (next !== el.getAttribute(name)) {
                    el.setAttribute(name, next);
                    count += 1;
                }
            });
        });

        return count;
    }

    function optionLabelKey(localeId) {
        return `settings.uiLocale.locale.${localeId}`;
    }

    function createI18n({
        catalogs = {},
        locale = DEFAULT_UI_LOCALE,
        fallbackLocale = FALLBACK_UI_LOCALE,
        fallbackChain = null,
        convertHansToHant = null,
    } = {}) {
        let current = normalizeUiLocale(locale);
        const packs = catalogs && typeof catalogs === 'object' ? catalogs : {};
        const stores = {
            textOrig: new WeakMap(),
            attrOrig: new WeakMap(),
        };
        const phraseCache = new Map();
        const chainOpt = Array.isArray(fallbackChain) && fallbackChain.length
            ? fallbackChain
            : (fallbackLocale
                ? [fallbackLocale, ...UI_LOCALE_REGISTRY.fallbackChain]
                : UI_LOCALE_REGISTRY.fallbackChain);

        function translate(key, vars) {
            return t(key, {
                catalogs: packs,
                locale: current,
                fallbackChain: chainOpt,
                vars,
            });
        }

        function translateText(text, vars) {
            return tx(text, {
                catalogs: packs,
                locale: current,
                fallbackChain: chainOpt,
                vars,
                convertHansToHant,
                phraseCache,
            });
        }

        function translateFormat(template, vars) {
            return tf(template, vars, {
                catalogs: packs,
                locale: current,
                fallbackChain: chainOpt,
            });
        }

        function setLocale(next) {
            current = normalizeUiLocale(next);
            return current;
        }

        function apply(root) {
            const doc = root
                || (typeof document !== 'undefined' ? document : null);
            if (!doc) return { keyed: 0, deep: 0 };
            if (doc.documentElement) {
                doc.documentElement.lang = htmlLangForLocale(current);
            }
            const keyed = applyDom(doc, translate);
            const deep = applyDomDeep(doc, translateText, stores);
            return { keyed, deep };
        }

        return {
            t: translate,
            tf: translateFormat,
            tx: translateText,
            setLocale,
            getLocale: () => current,
            apply,
            getCatalogs: () => packs,
            stores,
        };
    }

    return {
        UI_LOCALE_REGISTRY,
        UI_LOCALES,
        DEFAULT_UI_LOCALE,
        FALLBACK_UI_LOCALE,
        CJK_RE,
        normalizeUiLocale,
        isHantLocale,
        localeStrategy,
        listUiLocales,
        getLocaleEntry,
        htmlLangForLocale,
        resolveFallbackChain,
        optionLabelKey,
        hasCjk,
        interpolate,
        t,
        tf,
        tx,
        applyDom,
        applyDomDeep,
        shouldSkipElement,
        createI18n,
    };
}));
