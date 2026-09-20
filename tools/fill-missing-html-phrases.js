/**
 * Add missing HTML chrome phrases into catalogs (identity Hans + EN/JA/KO stubs from EN fill later).
 *   node tools/fill-missing-html-phrases.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const catalogDir = path.join(root, 'shared', 'i18n', 'catalog');
const HTML_FILES = fs.readdirSync(path.join(root, 'src'))
    .filter((name) => name.endsWith('.html'))
    .map((name) => path.join('src', name).replace(/\\/g, '/'))
    .sort();
const CJK_RE = /[\u3400-\u9FFF\uF900-\uFAFF]/;

function strip(html) {
    return String(html || '')
        .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ');
}

function normalize(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
}

function collect() {
    const set = new Set();
    HTML_FILES.forEach((rel) => {
        const html = strip(fs.readFileSync(path.join(root, rel), 'utf8'));
        for (const m of html.matchAll(/>([^<]+)</g)) {
            const t = normalize(m[1]);
            if (t && CJK_RE.test(t) && t.length <= 180) set.add(t);
        }
        for (const attr of ['title', 'placeholder', 'aria-label', 'aria-description']) {
            const re = new RegExp(`\\b${attr}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'gi');
            let m;
            while ((m = re.exec(html))) {
                const t = normalize(m[2]);
                if (t && CJK_RE.test(t) && t.length <= 180) set.add(t);
            }
        }
    });
    return [...set];
}

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

function main() {
    const texts = collect();
    const hans = load('zh-Hans');
    const en = load('en');
    const ja = load('ja');
    const ko = load('ko');
    const hant = load('zh-Hant-TW');
    let OpenCC;
    try {
        OpenCC = require('opencc-js').Converter({ from: 'cn', to: 'twp' });
    } catch {
        OpenCC = (s) => s;
    }
    let added = 0;
    texts.forEach((text) => {
        const key = `phrase.${text}`;
        if (!Object.prototype.hasOwnProperty.call(hans, key)) {
            hans[key] = text;
            added += 1;
        }
        if (!Object.prototype.hasOwnProperty.call(en, key)) {
            // leave English as Hans temporarily — better than missing; runtime falls back anyway
            // Prefer copying nothing so fallback chain uses Hans; still add identity for coverage tools
            en[key] = text;
        }
        if (!Object.prototype.hasOwnProperty.call(ja, key)) ja[key] = en[key] || text;
        if (!Object.prototype.hasOwnProperty.call(ko, key)) ko[key] = en[key] || text;
        if (!Object.prototype.hasOwnProperty.call(hant, key)) hant[key] = OpenCC(text);
    });
    writeOrdered('zh-Hans', hans);
    writeOrdered('en', en);
    writeOrdered('ja', ja);
    writeOrdered('ko', ko);
    writeOrdered('zh-Hant-TW', hant);
    console.log(`[fill-missing-html] texts=${texts.length} newHansPhrases=${added}`);
    require('./sync-i18n-catalogs');
}

main();
