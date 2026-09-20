/**
 * Report i18n phrase / key coverage vs harvest and zh-Hans.
 *
 *   node tools/report-i18n-coverage.js
 *   → tmp/i18n-coverage-report.json
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const catalogDir = path.join(root, 'shared', 'i18n', 'catalog');
const harvestPath = path.join(root, 'tmp', 'i18n-phrase-harvest.json');
const outPath = path.join(root, 'tmp', 'i18n-coverage-report.json');
const registry = JSON.parse(fs.readFileSync(path.join(root, 'shared', 'i18n', 'locales.json'), 'utf8'));

function loadCatalog(id) {
    const file = path.join(catalogDir, `${id}.json`);
    if (!fs.existsSync(file)) return {};
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function main() {
    const hans = loadCatalog('zh-Hans');
    const hansKeys = Object.keys(hans).filter((k) => !k.startsWith('phrase.'));
    const hansPhrases = Object.keys(hans).filter((k) => k.startsWith('phrase.'));
    const harvest = fs.existsSync(harvestPath)
        ? JSON.parse(fs.readFileSync(harvestPath, 'utf8'))
        : { count: 0, items: [] };

    const locales = (registry.locales || []).map((e) => e.id);
    const byLocale = {};
    locales.forEach((id) => {
        if (id === 'zh-Hans') return;
        const pack = loadCatalog(id);
        const missingKeys = hansKeys.filter((k) => !Object.prototype.hasOwnProperty.call(pack, k));
        const missingPhrases = hansPhrases.filter((k) => !Object.prototype.hasOwnProperty.call(pack, k));
        const phraseCount = Object.keys(pack).filter((k) => k.startsWith('phrase.')).length;
        const keyCount = Object.keys(pack).filter((k) => !k.startsWith('phrase.')).length;
        byLocale[id] = {
            strategy: (registry.locales.find((e) => e.id === id) || {}).strategy,
            keyed: { present: keyCount, missing: missingKeys.length, missingSample: missingKeys.slice(0, 20) },
            phrases: {
                present: phraseCount,
                missing: missingPhrases.length,
                coverage: hansPhrases.length
                    ? Number(((phraseCount / hansPhrases.length) * 100).toFixed(1))
                    : 100,
                missingSample: missingPhrases.slice(0, 15).map((k) => k.slice('phrase.'.length)),
            },
        };
    });

    const report = {
        generatedAt: new Date().toISOString(),
        harvestCount: harvest.count || 0,
        zhHans: { keys: hansKeys.length, phrases: hansPhrases.length },
        byLocale,
    };
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`[report-i18n-coverage] → ${path.relative(root, outPath)}`);
    locales.filter((id) => id !== 'zh-Hans').forEach((id) => {
        const row = byLocale[id];
        console.log(
            `  ${id}: keys ${row.keyed.present}/${hansKeys.length} phrases ${row.phrases.present}/${hansPhrases.length} (${row.phrases.coverage}%)`,
        );
    });
}

main();
