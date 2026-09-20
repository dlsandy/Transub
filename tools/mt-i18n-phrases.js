/**
 * Batch-translate harvest phrases via MyMemory (no Google).
 *   node tools/mt-i18n-phrases.js --locale=en|ja|ko|all
 * Resumable; writes tmp/i18n-phrase-{locale}.json
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const harvestPath = path.join(root, 'tmp', 'i18n-phrase-harvest.json');
const force = process.argv.includes('--force');
const localeArg = (process.argv.find((a) => a.startsWith('--locale=')) || '--locale=all').slice('--locale='.length);

const LANGPAIR = {
    en: 'zh-CN|en',
    ja: 'zh-CN|ja',
    ko: 'zh-CN|ko',
};

function pickTranslation(payload, fallback) {
    const matches = Array.isArray(payload?.matches) ? payload.matches : [];
    const scored = matches
        .map((m) => ({
            text: String(m.translation || '').trim(),
            quality: Number(m.quality) || 0,
            match: Number(m.match) || 0,
        }))
        .filter((m) => m.text && !/\.(ini|xml|json|dll|exe)$/i.test(m.text));
    scored.sort((a, b) => (b.quality - a.quality) || (b.match - a.match) || (b.text.length - a.text.length));
    if (scored[0]?.text) return scored[0].text;
    const direct = String(payload?.responseData?.translatedText || '').trim();
    if (direct && !/\.(ini|xml|json|dll|exe)$/i.test(direct)) return direct;
    return fallback;
}

async function translateOne(text, langpair) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(langpair)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (Number(json.responseStatus) !== 200 && json.responseStatus !== '200') {
        throw new Error(String(json.responseDetails || json.responseStatus || 'translate failed'));
    }
    return pickTranslation(json, text);
}

async function runLocale(locale) {
    const langpair = LANGPAIR[locale];
    if (!langpair) throw new Error(`unsupported ${locale}`);
    const harvest = JSON.parse(fs.readFileSync(harvestPath, 'utf8'));
    const outPath = path.join(root, 'tmp', `i18n-phrase-${locale}.json`);
    const out = (!force && fs.existsSync(outPath))
        ? JSON.parse(fs.readFileSync(outPath, 'utf8'))
        : {};
    const items = harvest.items || [];
    let done = 0;
    let skipped = 0;
    let failed = 0;
    const started = Date.now();
    for (let i = 0; i < items.length; i += 1) {
        const { key, text } = items[i];
        if (!force && out[key]) {
            skipped += 1;
            continue;
        }
        let ok = false;
        for (let attempt = 1; attempt <= 4; attempt += 1) {
            try {
                // eslint-disable-next-line no-await-in-loop
                out[key] = await translateOne(text, langpair);
                done += 1;
                ok = true;
                break;
            } catch (err) {
                // eslint-disable-next-line no-await-in-loop
                await new Promise((r) => setTimeout(r, 600 * attempt));
                if (attempt === 4) {
                    failed += 1;
                    out[key] = text;
                    console.warn(`[mt-i18n] fail ${locale} #${i}: ${err.message}`);
                }
            }
        }
        if (!ok && !out[key]) out[key] = text;
        if ((i + 1) % 25 === 0 || i === items.length - 1) {
            fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
            const elapsed = ((Date.now() - started) / 1000).toFixed(1);
            console.log(`[mt-i18n] ${locale} ${i + 1}/${items.length} done=${done} skip=${skipped} fail=${failed} ${elapsed}s`);
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 80));
    }
    fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
    console.log(`[mt-i18n] wrote ${path.relative(root, outPath)} keys=${Object.keys(out).length}`);
}

async function main() {
    if (!fs.existsSync(harvestPath)) {
        console.error('missing harvest');
        process.exit(1);
    }
    const locales = localeArg === 'all' ? ['en', 'ja', 'ko'] : [localeArg];
    for (const loc of locales) {
        // eslint-disable-next-line no-await-in-loop
        await runLocale(loc);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
