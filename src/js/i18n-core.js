/**
 * UI i18n core (Node + browser). Catalogs are injected by the host.
 * Locale IDs: zh-Hans (default) | zh-Hant-TW
 *
 * Coverage model:
 * - t(key): curated catalog keys
 * - tx(hansText): locale display for hardcoded Simplified Chinese chrome
 *   (catalog phrase override → OpenCC twp when Hant → passthrough when Hans)
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
    const UI_LOCALES = Object.freeze(['zh-Hans', 'zh-Hant-TW']);
    const DEFAULT_UI_LOCALE = 'zh-Hans';
    const FALLBACK_UI_LOCALE = 'zh-Hans';

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
    });

    const HTML_LANG = Object.freeze({
        'zh-Hans': 'zh-CN',
        'zh-Hant-TW': 'zh-TW',
    });

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
        '.library-player-time',
    ].join(',');

    const ATTRS_TO_LOCALIZE = ['title', 'placeholder', 'aria-label', 'aria-description'];

    function normalizeUiLocale(raw) {
        const s = String(raw || '').trim();
        if (!s) return DEFAULT_UI_LOCALE;
        if (UI_LOCALES.includes(s)) return s;
        const mapped = ALIASES[s.toLowerCase()];
        return mapped || DEFAULT_UI_LOCALE;
    }

    function isHantLocale(locale) {
        return normalizeUiLocale(locale) === 'zh-Hant-TW';
    }

    function htmlLangForLocale(locale) {
        const id = normalizeUiLocale(locale);
        return HTML_LANG[id] || HTML_LANG[DEFAULT_UI_LOCALE];
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
     * @param {string} key
     * @param {object} [opts]
     */
    function t(key, opts = {}) {
        const k = String(key || '');
        if (!k) return '';
        const catalogs = opts.catalogs || {};
        const locale = normalizeUiLocale(opts.locale);
        const fallback = normalizeUiLocale(opts.fallbackLocale || FALLBACK_UI_LOCALE);
        let raw = lookup(catalogs, locale, k);
        if (raw === undefined && locale !== fallback) {
            raw = lookup(catalogs, fallback, k);
        }
        if (raw === undefined) return k;
        return interpolate(raw, opts.vars);
    }

    function applyPhraseMap(text, catalogs, locale) {
        const pack = catalogs && catalogs[locale];
        if (!pack || typeof pack !== 'object') return text;
        const entries = [];
        Object.keys(pack).forEach((k) => {
            if (!k.startsWith('phrase.')) return;
            const from = k.slice('phrase.'.length);
            if (!from) return;
            entries.push([from, String(pack[k])]);
        });
        if (!entries.length) return text;
        entries.sort((a, b) => b[0].length - a[0].length);
        let out = String(text || '');
        entries.forEach(([from, to]) => {
            if (out.includes(from)) out = out.split(from).join(to);
        });
        return out;
    }

    /**
     * Display hardcoded Hans chrome in the active locale.
     * Phrase overrides: catalog keys `phrase.<hansSubstring>` (applied before OpenCC).
     */
    function tx(text, opts = {}) {
        const src = text == null ? '' : String(text);
        if (!src || !hasCjk(src)) return src;
        const locale = normalizeUiLocale(opts.locale);
        if (!isHantLocale(locale)) return src;

        const catalogs = opts.catalogs || {};
        const phraseKey = `phrase.${src}`;
        const overridden = lookup(catalogs, locale, phraseKey);
        if (overridden !== undefined) {
            return interpolate(overridden, opts.vars);
        }

        const staged = applyPhraseMap(src, catalogs, locale);
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
                if (raw == null || !String(raw).trim() || !hasCjk(raw)) {
                    return NodeFilter.FILTER_REJECT;
                }
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

    function createI18n({
        catalogs = {},
        locale = DEFAULT_UI_LOCALE,
        fallbackLocale = FALLBACK_UI_LOCALE,
        convertHansToHant = null,
    } = {}) {
        let current = normalizeUiLocale(locale);
        const packs = catalogs && typeof catalogs === 'object' ? catalogs : {};
        const stores = {
            textOrig: new WeakMap(),
            attrOrig: new WeakMap(),
        };

        function translate(key, vars) {
            return t(key, {
                catalogs: packs,
                locale: current,
                fallbackLocale,
                vars,
            });
        }

        function translateText(text, vars) {
            return tx(text, {
                catalogs: packs,
                locale: current,
                vars,
                convertHansToHant,
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
            tx: translateText,
            setLocale,
            getLocale: () => current,
            apply,
            getCatalogs: () => packs,
            stores,
        };
    }

    return {
        UI_LOCALES,
        DEFAULT_UI_LOCALE,
        FALLBACK_UI_LOCALE,
        CJK_RE,
        normalizeUiLocale,
        isHantLocale,
        htmlLangForLocale,
        hasCjk,
        interpolate,
        t,
        tx,
        applyDom,
        applyDomDeep,
        shouldSkipElement,
        createI18n,
    };
}));
