/**
 * Merge tmp/i18n-phrase-{locale}*.json maps into one file, then seed catalog.
 *   node tools/merge-i18n-phrase-maps.js --locale=en
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const tmp = path.join(root, 'tmp');
const locale = (process.argv.find((a) => a.startsWith('--locale=')) || '').slice('--locale='.length);
if (!locale) {
    console.error('Usage: --locale=en|ja|ko');
    process.exit(1);
}

const files = fs.readdirSync(tmp)
    .filter((n) => n.startsWith(`i18n-phrase-${locale}-chunk`) && n.endsWith('.json'))
    .sort()
    .map((n) => path.join(tmp, n));

// Optional standalone map (not the merge output) — apply first so chunks win.
const standalone = path.join(tmp, `i18n-phrase-${locale}-extra.json`);
if (fs.existsSync(standalone)) files.unshift(standalone);

const merged = {};
files.forEach((file) => {
    const pack = JSON.parse(fs.readFileSync(file, 'utf8'));
    Object.assign(merged, pack);
});
const out = path.join(tmp, `i18n-phrase-${locale}.json`);
fs.writeFileSync(out, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
console.log(`[merge-i18n] ${locale} keys=${Object.keys(merged).length} from ${files.length} file(s)`);

const seed = spawnSync(process.execPath, [
    path.join(__dirname, 'seed-i18n-phrases.js'),
    `--locale=${locale}`,
    `--from=${out}`,
    '--force',
], { stdio: 'inherit' });
process.exit(seed.status || 0);
