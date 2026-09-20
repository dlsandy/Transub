/**
 * Merge tmp/i18n-chunk-{locale}-*.json into catalog and sync renderer packs.
 *   node tools/merge-i18n-chunks.js --locale=ja|ko|en|all
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const catalogDir = path.join(root, 'shared', 'i18n', 'catalog');
const localeArg = (process.argv.find((a) => a.startsWith('--locale=')) || '--locale=all').slice('--locale='.length);

function load(id) {
    return JSON.parse(fs.readFileSync(path.join(catalogDir, `${id}.json`), 'utf8'));
}

function writeOrdered(id, pack) {
    const ordered = {};
    Object.keys(pack).filter((k) => !k.startsWith('phrase.')).sort()
        .forEach((k) => { ordered[k] = pack[k]; });
    Object.keys(pack).filter((k) => k.startsWith('phrase.'))
        .sort((a, b) => b.length - a.length || a.localeCompare(b))
        .forEach((k) => { ordered[k] = pack[k]; });
    fs.writeFileSync(path.join(catalogDir, `${id}.json`), `${JSON.stringify(ordered, null, 2)}\n`, 'utf8');
}

function mergeLocale(locale) {
    const hans = load('zh-Hans');
    const pack = load(locale);
    const files = fs.readdirSync(path.join(root, 'tmp'))
        .filter((n) => n.startsWith(`i18n-chunk-${locale}-`) && n.endsWith('.json'))
        .sort();
    let added = 0;
    let skipped = 0;
    files.forEach((name) => {
        const map = JSON.parse(fs.readFileSync(path.join(root, 'tmp', name), 'utf8'));
        Object.entries(map).forEach(([key, val]) => {
            if (!hans[key]) {
                skipped += 1;
                return;
            }
            const next = String(val || '').trim();
            if (!next || next === hans[key]) {
                skipped += 1;
                return;
            }
            pack[key] = next;
            added += 1;
        });
    });
    // intentional bilingual leftovers
    if (locale === 'en' || locale === 'ja' || locale === 'ko') {
        if (hans['phrase.日本語']) pack['phrase.日本語'] = '日本語';
        if (hans['phrase.Harry Potter, 哈利・波特']) {
            pack['phrase.Harry Potter, 哈利・波特'] = 'Harry Potter, 哈利・波特';
        }
    }
    writeOrdered(locale, pack);
    const missing = Object.keys(hans).filter((k) => k.startsWith('phrase.') && !(k in pack));
    console.log(`[merge-i18n-chunks] ${locale} files=${files.length} added=${added} skipped=${skipped} missing=${missing.length}`);
}

const locales = localeArg === 'all' ? ['en', 'ja', 'ko'] : [localeArg];
locales.forEach(mergeLocale);

const sync = spawnSync(process.execPath, [path.join(__dirname, 'sync-i18n-catalogs.js')], { stdio: 'inherit' });
process.exit(sync.status || 0);
