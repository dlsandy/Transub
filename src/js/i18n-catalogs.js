/**
 * UI catalog registry + lazy pack loader (generated — do not edit by hand).
 * Source: shared/i18n/catalog/*.json + shared/i18n/locales.json
 * Regenerate: node tools/sync-i18n-catalogs.js
 *
 * Packs live in js/i18n-catalogs/<locale>.js and are loaded on demand in the browser.
 * Node prefers shared/i18n/catalog/*.json via loadCatalogsFromDisk / ensureCatalog.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubI18nCatalogs = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function i18nCatalogsFactory() {
    const REGISTRY = {
    "default": "zh-Hans",
    "fallbackChain": [
        "en",
        "zh-Hans"
    ],
    "locales": [
        {
            "id": "zh-Hans",
            "bcp47": "zh-CN",
            "nativeName": "简体中文",
            "enabled": true,
            "strategy": "source"
        },
        {
            "id": "zh-Hant-TW",
            "bcp47": "zh-TW",
            "nativeName": "繁體中文",
            "enabled": true,
            "strategy": "hans-opencc"
        },
        {
            "id": "en",
            "bcp47": "en",
            "nativeName": "English",
            "enabled": true,
            "strategy": "catalog"
        },
        {
            "id": "ja",
            "bcp47": "ja",
            "nativeName": "日本語",
            "enabled": true,
            "strategy": "catalog"
        },
        {
            "id": "ko",
            "bcp47": "ko",
            "nativeName": "한국어",
            "enabled": true,
            "strategy": "catalog"
        }
    ]
};

    const KNOWN_LOCALES = [
    "zh-Hans",
    "zh-Hant-TW",
    "en",
    "ja",
    "ko"
];

    /** @type {Record<string, object>} */
    const CATALOGS = Object.create(null);

    /** @type {Map<string, Promise<object|null>>} */
    const inflight = new Map();

    function getRegistry() {
        return REGISTRY;
    }

    function getCatalogs() {
        return CATALOGS;
    }

    function getCatalog(locale) {
        return CATALOGS[locale] || null;
    }

    function listCatalogLocales() {
        const keys = Object.keys(CATALOGS);
        return keys.length ? keys : KNOWN_LOCALES.slice();
    }

    function registerCatalog(locale, pack) {
        const id = String(locale || '').trim();
        if (!id || !pack || typeof pack !== 'object') return;
        CATALOGS[id] = pack;
    }

    function catalogDirOnDisk() {
        if (typeof require === 'undefined') return null;
        try {
            const path = require('path');
            return path.join(__dirname, '..', '..', 'shared', 'i18n', 'catalog');
        } catch {
            return null;
        }
    }

    function loadCatalogFromDiskSync(locale) {
        if (typeof require === 'undefined') return null;
        try {
            const path = require('path');
            const fs = require('fs');
            const dir = catalogDirOnDisk();
            if (!dir) return null;
            const file = path.join(dir, locale + '.json');
            if (!fs.existsSync(file)) return null;
            let raw = fs.readFileSync(file, 'utf8');
            if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
            const pack = JSON.parse(raw);
            registerCatalog(locale, pack);
            return pack;
        } catch {
            return null;
        }
    }

    /** Prefer disk JSON in Node (dev / Electron); fall back to in-memory packs. */
    function loadCatalogsFromDisk() {
        if (typeof require === 'undefined') return CATALOGS;
        try {
            const path = require('path');
            const fs = require('fs');
            const dir = catalogDirOnDisk();
            const out = { ...CATALOGS };
            if (!dir || !fs.existsSync(dir)) return out;
            for (const locale of KNOWN_LOCALES) {
                const file = path.join(dir, locale + '.json');
                if (fs.existsSync(file)) {
                    let raw = fs.readFileSync(file, 'utf8');
                    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
                    out[locale] = JSON.parse(raw);
                    CATALOGS[locale] = out[locale];
                }
            }
            fs.readdirSync(dir).filter((n) => n.endsWith('.json')).forEach((n) => {
                const id = n.replace(/\.json$/i, '');
                if (!out[id]) {
                    let raw = fs.readFileSync(path.join(dir, n), 'utf8');
                    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
                    out[id] = JSON.parse(raw);
                    CATALOGS[id] = out[id];
                }
            });
            return out;
        } catch {
            return CATALOGS;
        }
    }

    function loadRegistryFromDisk() {
        if (typeof require === 'undefined') return REGISTRY;
        try {
            const path = require('path');
            const fs = require('fs');
            const file = path.join(__dirname, '..', '..', 'shared', 'i18n', 'locales.json');
            if (fs.existsSync(file)) {
                return JSON.parse(fs.readFileSync(file, 'utf8'));
            }
        } catch { /* ignore */ }
        return REGISTRY;
    }

    function loadCatalogScript(locale) {
        const g = typeof globalThis !== 'undefined' ? globalThis : null;
        const doc = g && g.document;
        if (!doc || typeof doc.createElement !== 'function') {
            return Promise.reject(new Error('cannot load catalog script: no document'));
        }
        const src = 'js/i18n-catalogs/' + locale + '.js';
        return new Promise((resolve, reject) => {
            const existing = doc.querySelector('script[src="' + src + '"]');
            if (existing) {
                if (CATALOGS[locale]) {
                    resolve(CATALOGS[locale]);
                    return;
                }
                existing.addEventListener('load', () => resolve(CATALOGS[locale] || null));
                existing.addEventListener('error', () => reject(new Error('catalog script failed: ' + locale)));
                return;
            }
            const el = doc.createElement('script');
            el.src = src;
            el.async = true;
            el.onload = () => resolve(CATALOGS[locale] || null);
            el.onerror = () => reject(new Error('catalog script failed: ' + locale));
            (doc.head || doc.documentElement || doc.body).appendChild(el);
        });
    }

    /**
     * Ensure a locale pack is in memory.
     * @param {string} locale
     * @returns {Promise<object|null>}
     */
    function ensureCatalog(locale) {
        const id = String(locale || '').trim();
        if (!id) return Promise.resolve(null);
        if (CATALOGS[id]) return Promise.resolve(CATALOGS[id]);
        if (inflight.has(id)) return inflight.get(id);

        const p = Promise.resolve().then(() => {
            if (CATALOGS[id]) return CATALOGS[id];
            const fromDisk = loadCatalogFromDiskSync(id);
            if (fromDisk) return fromDisk;
            return loadCatalogScript(id);
        }).finally(() => {
            inflight.delete(id);
        });
        inflight.set(id, p);
        return p;
    }

    /**
     * Load active locale plus fallback chain entries.
     * @param {string} locale
     * @param {string[]} [fallbackChain]
     */
    function ensureCatalogsForLocale(locale, fallbackChain) {
        const chain = [];
        const push = (id) => {
            const n = String(id || '').trim();
            if (n && !chain.includes(n)) chain.push(n);
        };
        push(locale);
        (Array.isArray(fallbackChain) ? fallbackChain : (REGISTRY.fallbackChain || [])).forEach(push);
        push(REGISTRY.default || 'zh-Hans');
        return Promise.all(chain.map((id) => ensureCatalog(id).catch(() => null))).then(() => CATALOGS);
    }

    return {
        REGISTRY,
        CATALOGS,
        KNOWN_LOCALES,
        getRegistry,
        getCatalogs,
        getCatalog,
        listCatalogLocales,
        registerCatalog,
        ensureCatalog,
        ensureCatalogsForLocale,
        loadCatalogsFromDisk,
        loadRegistryFromDisk,
    };
}));
