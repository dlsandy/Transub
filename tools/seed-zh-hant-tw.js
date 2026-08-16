/**
 * Seed missing zh-Hant-TW keys from zh-Hans via OpenCC (twp).
 * Does not overwrite existing Hant keys unless --force.
 * Then regenerates src/js/i18n-catalogs.js.
 *
 * Usage: node tools/seed-zh-hant-tw.js [--force]
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const catalogDir = path.join(root, 'shared', 'i18n', 'catalog');
const hansPath = path.join(catalogDir, 'zh-Hans.json');
const hantPath = path.join(catalogDir, 'zh-Hant-TW.json');
const force = process.argv.includes('--force');

function load(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function main() {
    let OpenCC;
    try {
        OpenCC = require('opencc-js');
    } catch (err) {
        console.error('[seed-zh-hant-tw] opencc-js required:', err.message);
        process.exit(1);
    }
    const convert = OpenCC.Converter({ from: 'cn', to: 'twp' });
    const hans = load(hansPath);
    const hant = fs.existsSync(hantPath) ? load(hantPath) : {};
    let added = 0;
    let updated = 0;
    const out = { ...hant };
    for (const [key, value] of Object.entries(hans)) {
        const src = String(value ?? '');
        const seeded = convert(src);
        if (!Object.prototype.hasOwnProperty.call(out, key)) {
            out[key] = seeded;
            added += 1;
            continue;
        }
        if (force) {
            if (out[key] !== seeded) updated += 1;
            out[key] = seeded;
        }
    }
    // Stable key order: follow Hans, then extras
    const ordered = {};
    for (const key of Object.keys(hans)) {
        if (Object.prototype.hasOwnProperty.call(out, key)) ordered[key] = out[key];
    }
    for (const key of Object.keys(out)) {
        if (!Object.prototype.hasOwnProperty.call(ordered, key)) ordered[key] = out[key];
    }
    fs.writeFileSync(hantPath, `${JSON.stringify(ordered, null, 2)}\n`, 'utf8');
    console.log(`[seed-zh-hant-tw] added=${added} updated=${updated} force=${force}`);
    require('./sync-i18n-catalogs');
}

main();
