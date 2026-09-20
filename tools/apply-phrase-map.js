/**
 * Merge a phrase map JSON into a locale catalog.
 *   node tools/apply-phrase-map.js --locale=en --from=tmp/i18n-dyn-templates-en.json
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const locale = (process.argv.find((a) => a.startsWith('--locale=')) || '').slice(9);
const from = (process.argv.find((a) => a.startsWith('--from=')) || '').slice(7);
if (!locale || !from) {
    console.error('Usage: --locale=en --from=file.json');
    process.exit(1);
}
const catalogPath = path.join(root, 'shared', 'i18n', 'catalog', `${locale}.json`);
const pack = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const map = JSON.parse(fs.readFileSync(path.resolve(from), 'utf8'));
let n = 0;
Object.entries(map).forEach(([k, v]) => {
    const key = k.startsWith('phrase.') ? k : `phrase.${k}`;
    pack[key] = String(v);
    n += 1;
});
const ordered = {};
Object.keys(pack).filter((k) => !k.startsWith('phrase.')).sort()
    .forEach((k) => { ordered[k] = pack[k]; });
Object.keys(pack).filter((k) => k.startsWith('phrase.'))
    .sort((a, b) => b.length - a.length || a.localeCompare(b))
    .forEach((k) => { ordered[k] = pack[k]; });
fs.writeFileSync(catalogPath, `${JSON.stringify(ordered, null, 2)}\n`, 'utf8');
console.log(`[apply-phrase-map] ${locale} wrote ${n} keys`);
