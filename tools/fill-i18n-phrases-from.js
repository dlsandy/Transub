/**
 * Copy missing phrase.* from a source catalog into a target catalog.
 *   node tools/fill-i18n-phrases-from.js --from=en --to=ja
 *   node tools/fill-i18n-phrases-from.js --from=en --to=ko
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const catalogDir = path.join(root, 'shared', 'i18n', 'catalog');
const fromId = (process.argv.find((a) => a.startsWith('--from=')) || '').slice(7);
const toId = (process.argv.find((a) => a.startsWith('--to=')) || '').slice(5);
const force = process.argv.includes('--force');

if (!fromId || !toId) {
    console.error('Usage: --from=en --to=ja [--force]');
    process.exit(1);
}

function load(id) {
    return JSON.parse(fs.readFileSync(path.join(catalogDir, `${id}.json`), 'utf8'));
}

function writeOrdered(file, pack) {
    const ordered = {};
    Object.keys(pack).filter((k) => !k.startsWith('phrase.')).sort()
        .forEach((k) => { ordered[k] = pack[k]; });
    Object.keys(pack).filter((k) => k.startsWith('phrase.'))
        .sort((a, b) => b.length - a.length || a.localeCompare(b))
        .forEach((k) => { ordered[k] = pack[k]; });
    fs.writeFileSync(file, `${JSON.stringify(ordered, null, 2)}\n`, 'utf8');
}

const from = load(fromId);
const toPath = path.join(catalogDir, `${toId}.json`);
const to = fs.existsSync(toPath) ? load(toId) : {};
let added = 0;
let updated = 0;
Object.keys(from).filter((k) => k.startsWith('phrase.')).forEach((k) => {
    if (!Object.prototype.hasOwnProperty.call(to, k)) {
        to[k] = from[k];
        added += 1;
    } else if (force) {
        if (to[k] !== from[k]) updated += 1;
        to[k] = from[k];
    }
});
// also copy missing non-phrase keys
Object.keys(from).filter((k) => !k.startsWith('phrase.')).forEach((k) => {
    if (!Object.prototype.hasOwnProperty.call(to, k)) {
        to[k] = from[k];
        added += 1;
    }
});
writeOrdered(toPath, to);
console.log(`[fill-i18n] ${fromId}→${toId} added=${added} updated=${updated}`);
require('./sync-i18n-catalogs');
