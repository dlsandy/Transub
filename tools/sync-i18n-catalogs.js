/**
 * Sync shared/i18n/catalog/*.json + locales.json →
 *   - src/js/i18n-catalogs.js (registry + lazy loader; no embedded packs)
 *   - src/js/i18n-catalogs/<locale>.js (one pack per locale)
 * Run after editing JSON catalogs: node tools/sync-i18n-catalogs.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const i18nDir = path.join(root, 'shared', 'i18n');
const catalogDir = path.join(i18nDir, 'catalog');
const localesFile = path.join(i18nDir, 'locales.json');
const outFile = path.join(root, 'src', 'js', 'i18n-catalogs.js');
const outDir = path.join(root, 'src', 'js', 'i18n-catalogs');
const coreFile = path.join(root, 'src', 'js', 'i18n-core.js');

function loadLocalesRegistry() {
    const raw = JSON.parse(fs.readFileSync(localesFile, 'utf8'));
    if (!raw || !Array.isArray(raw.locales) || !raw.locales.length) {
        throw new Error('locales.json missing locales[]');
    }
    return raw;
}

function loadJson(locale) {
    const file = path.join(catalogDir, `${locale}.json`);
    if (!fs.existsSync(file)) {
        throw new Error(`missing catalog: ${file}`);
    }
    let raw = fs.readFileSync(file, 'utf8');
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
    return JSON.parse(raw);
}

function assertCoreRegistryMatch(registry) {
    if (!fs.existsSync(coreFile)) return;
    const coreSrc = fs.readFileSync(coreFile, 'utf8');
    const ids = registry.locales.map((e) => e.id);
    for (const id of ids) {
        if (!coreSrc.includes(`id: '${id}'`) && !coreSrc.includes(`id: "${id}"`)) {
            console.warn(
                `[sync-i18n-catalogs] warn: i18n-core.js may be missing locale id "${id}" — update UI_LOCALE_REGISTRY`,
            );
        }
    }
}

function writeLocalePack(locale, pack) {
    const body = JSON.stringify(pack, null, 4);
    const code = `/**
 * UI catalog pack for ${locale} (generated — do not edit by hand).
 * Regenerate: node tools/sync-i18n-catalogs.js
 */
(function (global) {
    const pack = ${body};
    const api = global.TransubI18nCatalogs;
    if (api && typeof api.registerCatalog === 'function') {
        api.registerCatalog(${JSON.stringify(locale)}, pack);
    } else if (typeof module !== 'undefined' && module.exports) {
        module.exports = pack;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this));
`;
    fs.writeFileSync(path.join(outDir, `${locale}.js`), code, 'utf8');
}

function main() {
    const registry = loadLocalesRegistry();
    assertCoreRegistryMatch(registry);

    const localeIds = registry.locales
        .filter((e) => e && e.enabled !== false && e.id)
        .map((e) => String(e.id));

    const onDisk = fs.readdirSync(catalogDir)
        .filter((n) => n.endsWith('.json'))
        .map((n) => n.replace(/\.json$/i, ''));
    const ordered = [];
    const seen = new Set();
    localeIds.forEach((id) => {
        if (!seen.has(id)) {
            ordered.push(id);
            seen.add(id);
        }
    });
    onDisk.forEach((id) => {
        if (!seen.has(id)) {
            ordered.push(id);
            seen.add(id);
            console.warn(`[sync-i18n-catalogs] catalog ${id}.json not in locales.json — still emitting`);
        }
    });

    fs.mkdirSync(outDir, { recursive: true });
    for (const name of fs.readdirSync(outDir)) {
        if (name.endsWith('.js')) fs.unlinkSync(path.join(outDir, name));
    }

    for (const locale of ordered) {
        writeLocalePack(locale, loadJson(locale));
    }

    const registryBody = JSON.stringify(registry, null, 4);
    const localeListBody = JSON.stringify(ordered, null, 4);
    const code = `/**
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
    const REGISTRY = ${registryBody};

    const KNOWN_LOCALES = ${localeListBody};

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
                const id = n.replace(/\\.json$/i, '');
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
`;
    fs.writeFileSync(outFile, code, 'utf8');
    console.log(`[sync-i18n-catalogs] wrote ${path.relative(root, outFile)} + ${ordered.length} packs (${ordered.join(', ')})`);
}

main();
