/**
 * Translate phrase.* keys present in zh-Hans but missing in target locales.
 * Primary: Google gtx (unofficial); fallback: MyMemory.
 * Resumable via tmp/i18n-mt-missing-{locale}.json
 *
 *   node tools/mt-i18n-missing.js --locale=en|ja|ko|all [--force] [--limit=N] [--also-same-as-zh]
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const catalogDir = path.join(root, 'shared', 'i18n', 'catalog');
const force = process.argv.includes('--force');
const localeArg = (process.argv.find((a) => a.startsWith('--locale=')) || '--locale=all').slice('--locale='.length);
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Math.max(1, Number(limitArg.slice('--limit='.length)) || 0) : 0;
const alsoSame = process.argv.includes('--also-same-as-zh');

const GTX_TL = { en: 'en', ja: 'ja', ko: 'ko' };
const MYMEMORY_PAIR = { en: 'zh-CN|en', ja: 'zh-CN|ja', ko: 'zh-CN|ko' };
const CJK_RE = /[\u3400-\u9FFF\uF900-\uFAFF]/;

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

function pickMyMemory(payload, fallback) {
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

function parseGtx(json) {
    if (!Array.isArray(json) || !Array.isArray(json[0])) return '';
    return json[0].map((part) => (Array.isArray(part) ? String(part[0] || '') : '')).join('').trim();
}

async function translateGtx(text, tl) {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh-CN&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 TransubI18n/1.0' },
    });
    if (!res.ok) throw new Error(`gtx HTTP ${res.status}`);
    const json = await res.json();
    const out = parseGtx(json);
    if (!out) throw new Error('gtx empty');
    return out;
}

async function translateMyMemory(text, langpair) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(langpair)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`mymemory HTTP ${res.status}`);
    const json = await res.json();
    if (Number(json.responseStatus) !== 200 && json.responseStatus !== '200') {
        throw new Error(String(json.responseDetails || json.responseStatus || 'mymemory failed'));
    }
    return pickMyMemory(json, text);
}

async function translateOne(text, locale) {
    const tl = GTX_TL[locale];
    try {
        return await translateGtx(text, tl);
    } catch (err) {
        // fallback
        try {
            return await translateMyMemory(text, MYMEMORY_PAIR[locale]);
        } catch (err2) {
            throw new Error(`${err.message}; ${err2.message}`);
        }
    }
}

function needsTranslation(locale, key, hansText, pack) {
    if (!key.startsWith('phrase.')) return false;
    if (!Object.prototype.hasOwnProperty.call(pack, key)) return true;
    if (force) return true;
    const cur = String(pack[key] || '');
    if (!cur) return true;
    // Treat identical Hans chrome as still missing for catalog locales
    if (cur === hansText && CJK_RE.test(cur) && locale !== 'zh-Hant-TW') {
        // Always retry polluted / failed identity fills for newly harvested chrome
        if (alsoSame || cur.length <= 80) return true;
    }
    return false;
}

async function runLocale(locale) {
    if (!GTX_TL[locale]) throw new Error(`unsupported ${locale}`);
    const hans = load('zh-Hans');
    const pack = load(locale);
    const cachePath = path.join(root, 'tmp', `i18n-mt-missing-${locale}.json`);
    const cache = (!force && fs.existsSync(cachePath))
        ? JSON.parse(fs.readFileSync(cachePath, 'utf8'))
        : {};

    // Drop polluted identity translations so they re-enter the queue
    let purged = 0;
    Object.keys(pack).filter((k) => k.startsWith('phrase.')).forEach((k) => {
        if (pack[k] === hans[k] && CJK_RE.test(String(pack[k] || ''))) {
            // Keep intentional bilingual examples that mix scripts and were pre-existing
            // Only purge if cache says we never successfully translated, or value equals Hans
            if (!cache[k] || cache[k] === hans[k]) {
                delete pack[k];
                purged += 1;
            }
        }
    });

    let keys = Object.keys(hans).filter((k) => needsTranslation(locale, k, hans[k], pack));
    keys.sort((a, b) => {
        const am = Object.prototype.hasOwnProperty.call(pack, a) ? 1 : 0;
        const bm = Object.prototype.hasOwnProperty.call(pack, b) ? 1 : 0;
        return am - bm || b.length - a.length;
    });
    if (limit > 0) keys = keys.slice(0, limit);

    console.log(`[mt-i18n-missing] ${locale} candidates=${keys.length} purgedIdentity=${purged}`);
    let done = 0;
    let skipped = 0;
    let failed = 0;
    const started = Date.now();

    for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i];
        const text = String(hans[key] || key.slice('phrase.'.length));
        if (!force && cache[key] && cache[key] !== text) {
            pack[key] = cache[key];
            skipped += 1;
            continue;
        }

        let ok = false;
        for (let attempt = 1; attempt <= 4; attempt += 1) {
            try {
                // eslint-disable-next-line no-await-in-loop
                const translated = await translateOne(text, locale);
                if (!translated || translated === text) throw new Error('unchanged');
                pack[key] = translated;
                cache[key] = translated;
                done += 1;
                ok = true;
                break;
            } catch (err) {
                const msg = String(err?.message || err || '');
                const backoff = /429|TOO MANY|rate/i.test(msg) ? 2000 * attempt : 400 * attempt;
                // eslint-disable-next-line no-await-in-loop
                await new Promise((r) => setTimeout(r, backoff));
                if (attempt === 4) {
                    failed += 1;
                    console.warn(`[mt-i18n-missing] fail ${locale} ${key}: ${msg}`);
                }
            }
        }
        if ((i + 1) % 25 === 0 || i === keys.length - 1) {
            fs.mkdirSync(path.dirname(cachePath), { recursive: true });
            fs.writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
            writeOrdered(locale, pack);
            const elapsed = ((Date.now() - started) / 1000).toFixed(1);
            console.log(`[mt-i18n-missing] ${locale} ${i + 1}/${keys.length} done=${done} cache=${skipped} fail=${failed} ${elapsed}s`);
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 80));
    }
    fs.writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
    writeOrdered(locale, pack);
    console.log(`[mt-i18n-missing] ${locale} wrote catalog + ${path.relative(root, cachePath)}`);
}

async function main() {
    const locales = localeArg === 'all' ? ['en', 'ja', 'ko'] : [localeArg];
    for (const locale of locales) {
        // eslint-disable-next-line no-await-in-loop
        await runLocale(locale);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
