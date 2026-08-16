/**
 * Sync shared/i18n/catalog/*.json → src/js/i18n-catalogs.js (browser embed).
 * Run after editing JSON catalogs (also invoked by seed-zh-hant-tw.js).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const catalogDir = path.join(root, 'shared', 'i18n', 'catalog');
const outFile = path.join(root, 'src', 'js', 'i18n-catalogs.js');

const LOCALES = ['zh-Hans', 'zh-Hant-TW'];

function loadJson(locale) {
    const file = path.join(catalogDir, `${locale}.json`);
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw);
}

function main() {
    const catalogs = {};
    for (const locale of LOCALES) {
        catalogs[locale] = loadJson(locale);
    }
    const body = JSON.stringify(catalogs, null, 4);
    const code = `/**
 * Embedded UI catalogs (generated — do not edit by hand).
 * Source: shared/i18n/catalog/*.json
 * Regenerate: node tools/sync-i18n-catalogs.js
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
    const CATALOGS = ${body};

    function getCatalogs() {
        return CATALOGS;
    }

    function getCatalog(locale) {
        return CATALOGS[locale] || null;
    }

    /** Prefer disk JSON in Node (dev / Electron); fall back to embed. */
    function loadCatalogsFromDisk() {
        if (typeof require === 'undefined') return CATALOGS;
        try {
            const path = require('path');
            const fs = require('fs');
            const dir = path.join(__dirname, '..', '..', 'shared', 'i18n', 'catalog');
            const out = { ...CATALOGS };
            for (const locale of Object.keys(CATALOGS)) {
                const file = path.join(dir, locale + '.json');
                if (fs.existsSync(file)) {
                    out[locale] = JSON.parse(fs.readFileSync(file, 'utf8'));
                }
            }
            return out;
        } catch {
            return CATALOGS;
        }
    }

    return {
        CATALOGS,
        getCatalogs,
        getCatalog,
        loadCatalogsFromDisk,
    };
}));
`;
    fs.writeFileSync(outFile, code, 'utf8');
    console.log(`[sync-i18n-catalogs] wrote ${path.relative(root, outFile)} (${LOCALES.join(', ')})`);
}

main();
