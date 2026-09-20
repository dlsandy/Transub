/**
 * Seed phrase.* keys into locale catalogs from harvest / zh-Hans.
 *
 *   node tools/seed-i18n-phrases.js --locale=zh-Hant-TW   # OpenCC from Hans text
 *   node tools/seed-i18n-phrases.js --locale=en --from=tmp/i18n-phrase-en.json
 *   node tools/seed-i18n-phrases.js --locale=all-hant
 *
 * --from JSON shape: { "phrase.设置": "Settings", ... } or { "设置": "Settings" }
 * Does not overwrite existing phrase keys unless --force.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const catalogDir = path.join(root, 'shared', 'i18n', 'catalog');
const harvestPath = path.join(root, 'tmp', 'i18n-phrase-harvest.json');
const force = process.argv.includes('--force');
const localeArg = (process.argv.find((a) => a.startsWith('--locale=')) || '').slice('--locale='.length);
const fromArg = (process.argv.find((a) => a.startsWith('--from=')) || '').slice('--from='.length);

function loadJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeOrderedCatalog(file, pack) {
    const ordered = {};
    Object.keys(pack).filter((k) => !k.startsWith('phrase.')).sort().forEach((k) => {
        ordered[k] = pack[k];
    });
    Object.keys(pack).filter((k) => k.startsWith('phrase.'))
        .sort((a, b) => b.length - a.length || a.localeCompare(b))
        .forEach((k) => { ordered[k] = pack[k]; });
    fs.writeFileSync(file, `${JSON.stringify(ordered, null, 2)}\n`, 'utf8');
}

function phraseEntriesFromHans() {
    const hans = loadJson(path.join(catalogDir, 'zh-Hans.json'));
    const fromCatalog = Object.entries(hans)
        .filter(([k]) => k.startsWith('phrase.'))
        .map(([k, v]) => [k, String(v)]);
    if (fromCatalog.length) return fromCatalog;
    if (!fs.existsSync(harvestPath)) {
        throw new Error('No zh-Hans phrase.* and no harvest — run extract-i18n-phrases.js --write-hans first');
    }
    const harvest = loadJson(harvestPath);
    return (harvest.items || []).map((it) => [it.key, it.text]);
}

function mergePhrases(locale, translator) {
    const file = path.join(catalogDir, `${locale}.json`);
    const pack = fs.existsSync(file) ? loadJson(file) : {};
    let added = 0;
    let updated = 0;
    const entries = phraseEntriesFromHans();
    entries.forEach(([key, hansText]) => {
        const next = translator(hansText, key);
        if (next == null || next === '') return;
        if (!Object.prototype.hasOwnProperty.call(pack, key)) {
            pack[key] = next;
            added += 1;
        } else if (force) {
            if (pack[key] !== next) updated += 1;
            pack[key] = next;
        }
    });
    writeOrderedCatalog(file, pack);
    console.log(`[seed-i18n-phrases] ${locale} added=${added} updated=${updated} force=${force}`);
}

function loadExternalMap(file) {
    const raw = loadJson(file);
    const map = new Map();
    Object.entries(raw).forEach(([k, v]) => {
        if (k.startsWith('phrase.')) map.set(k, String(v));
        else map.set(`phrase.${k}`, String(v));
    });
    return map;
}

function main() {
    if (!localeArg) {
        console.error('Usage: --locale=zh-Hant-TW|en|ja|ko|all-hant [--from=file] [--force]');
        process.exit(1);
    }

    if (localeArg === 'all-hant' || localeArg === 'zh-Hant-TW') {
        let convert;
        try {
            const OpenCC = require('opencc-js');
            convert = OpenCC.Converter({ from: 'cn', to: 'twp' });
        } catch (err) {
            console.error('[seed-i18n-phrases] opencc-js required:', err.message);
            process.exit(1);
        }
        mergePhrases('zh-Hant-TW', (hans) => convert(hans));
        // Also seed non-phrase keys from Hans if missing (reuse seed-zh-hant-tw logic lightly)
        require('./seed-zh-hant-tw');
        return;
    }

    if (!fromArg || !fs.existsSync(fromArg)) {
        console.error(`[seed-i18n-phrases] --from= JSON required for locale ${localeArg}`);
        process.exit(1);
    }
    const map = loadExternalMap(path.resolve(fromArg));
    mergePhrases(localeArg, (hans, key) => map.get(key) || map.get(`phrase.${hans}`) || map.get(hans) || null);
    require('./sync-i18n-catalogs');
}

main();
