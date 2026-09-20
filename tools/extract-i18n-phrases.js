/**
 * Harvest unique Hans chrome strings for phrase.* catalogs.
 * Sources: HTML pages + curated JS surfaces (menus, tray, toast/confirm).
 *
 * Usage:
 *   node tools/extract-i18n-phrases.js [--write-hans] [--limit=N]
 *   → tmp/i18n-phrase-harvest.json
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'tmp');
const harvestPath = path.join(outDir, 'i18n-phrase-harvest.json');
const catalogHans = path.join(root, 'shared', 'i18n', 'catalog', 'zh-Hans.json');

const CJK_RE = /[\u3400-\u9FFF\uF900-\uFAFF]/;
const ATTR_NAMES = ['title', 'placeholder', 'aria-label', 'aria-description', 'alt'];
const writeHans = process.argv.includes('--write-hans');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Math.max(1, Number(limitArg.slice('--limit='.length)) || 0) : 0;

/** All renderer HTML chrome (main shells + fragments + about/update/splash). */
const HTML_FILES = fs.readdirSync(path.join(root, 'src'))
    .filter((name) => name.endsWith('.html'))
    .map((name) => path.join('src', name).replace(/\\/g, '/'))
    .sort();

/** Menu / dialog / toast-heavy modules — full string scan with strict filters */
const JS_FILES_STRICT = [
    'electron/main-window-tray.js',
    'electron/subtitle-editor-menu.js',
    'electron/subtitle-editor-window.js',
    'electron/window-manager.js',
    'electron/auto-update-check.js',
    'electron/notifications.js',
    'src/js/about-window.js',
];

/** Large shells / mode UI — toast/confirm-ish call sites + label props */
const JS_FILES_UX = [
    'src/js/app.js',
    'src/js/subtitle-editor.js',
    'src/js/main-ui-ux.js',
    'src/js/translate-mode-ui-core.js',
    'src/js/env-check.js',
    'src/js/engine-env-ui-core.js',
    'src/js/engine-models-workspace-core.js',
];

const CODE_NOISE_RE = /(?:const |let |var |function |return |=>|\{\s*$|;|\brequire\b|\bmodule\b|\.js\b|\bif\s*\(|\belse\b|\bnew Map\b|\bnew Set\b)/;
const UX_CALL_RE = /(?:showToast|appConfirm|confirmDialog|confirmYesNo|showBatchSummary)\s*\(\s*(['"`])([\s\S]*?)\1/g;
const UX_PROP_RE = /(?:title|message|detail|primaryLabel|secondaryLabel|tertiaryLabel|actionLabel|label|toolTip)\s*:\s*(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g;

function hasCjk(s) {
    return CJK_RE.test(String(s || ''));
}

function cjkRatio(s) {
    const str = String(s || '');
    if (!str.length) return 0;
    const cjk = (str.match(/[\u3400-\u9FFF\uF900-\uFAFF]/g) || []).length;
    return cjk / str.length;
}

function normalizePhrase(raw) {
    let s = String(raw || '');
    s = s.replace(/\s+/g, ' ').trim();
    if (!hasCjk(s)) return '';
    if (s.length < 1 || s.length > 180) return '';
    if (/\$\{/.test(s)) return '';
    if (/^[\d\s\-_/\\|:.·…]+$/.test(s)) return '';
    if (CODE_NOISE_RE.test(s)) return '';
    // Prefer UI copy: enough CJK density (allow short labels like "设置")
    if (s.length >= 12 && cjkRatio(s) < 0.35) return '';
    if (s.length >= 40 && cjkRatio(s) < 0.45) return '';
    // Skip paths / urls
    if (/https?:\/\//i.test(s)) return '';
    if (/[A-Za-z]:\\/.test(s)) return '';
    return s;
}

const phrases = new Map();

function add(set, raw, source) {
    const s = normalizePhrase(raw);
    if (!s) return;
    if (!set.has(s)) set.set(s, new Set());
    set.get(s).add(source);
}

function stripBlocks(html) {
    return String(html || '')
        .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ');
}

function unescapeJsString(body) {
    return String(body || '')
        .replace(/\\n/g, ' ')
        .replace(/\\t/g, ' ')
        .replace(/\\'/g, "'")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
}

function harvestHtml(rel) {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) return;
    const html = stripBlocks(fs.readFileSync(file, 'utf8'));
    for (const name of ATTR_NAMES) {
        const re = new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'gi');
        let m;
        while ((m = re.exec(html))) add(phrases, m[2], `${rel}@${name}`);
    }
    const textRe = />([^<]+)</g;
    let tm;
    while ((tm = textRe.exec(html))) add(phrases, tm[1], `${rel}@text`);
}

function harvestJsStrict(rel) {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) return;
    const src = fs.readFileSync(file, 'utf8');
    const re = /(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
    let m;
    while ((m = re.exec(src))) {
        const quote = m[1];
        let body = m[2];
        if (quote === '`' && /\$\{/.test(body)) continue;
        add(phrases, unescapeJsString(body), rel);
    }
}

function harvestJsUx(rel) {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) return;
    const src = fs.readFileSync(file, 'utf8');
    let m;
    UX_CALL_RE.lastIndex = 0;
    while ((m = UX_CALL_RE.exec(src))) {
        if (m[1] === '`' && /\$\{/.test(m[2])) continue;
        add(phrases, unescapeJsString(m[2]), `${rel}@toast`);
    }
    UX_PROP_RE.lastIndex = 0;
    while ((m = UX_PROP_RE.exec(src))) {
        if (m[1] === '`' && /\$\{/.test(m[2])) continue;
        add(phrases, unescapeJsString(m[2]), `${rel}@prop`);
    }
    // label: '...' in menu-like objects still useful
    const labelRe = /\blabel\s*:\s*(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
    while ((m = labelRe.exec(src))) {
        if (m[1] === '`' && /\$\{/.test(m[2])) continue;
        add(phrases, unescapeJsString(m[2]), `${rel}@label`);
    }
}

function main() {
    HTML_FILES.forEach(harvestHtml);
    JS_FILES_STRICT.forEach(harvestJsStrict);
    JS_FILES_UX.forEach(harvestJsUx);

    let items = [...phrases.entries()]
        .map(([text, sources]) => ({
            text,
            sources: [...sources].sort(),
            key: `phrase.${text}`,
        }))
        .sort((a, b) => b.text.length - a.text.length || a.text.localeCompare(b.text, 'zh'));

    if (limit > 0) items = items.slice(0, limit);

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
        harvestPath,
        `${JSON.stringify({ generatedAt: new Date().toISOString(), count: items.length, items }, null, 2)}\n`,
        'utf8',
    );
    console.log(`[extract-i18n-phrases] ${items.length} unique → ${path.relative(root, harvestPath)}`);

    if (writeHans) {
        const hans = JSON.parse(fs.readFileSync(catalogHans, 'utf8'));
        let added = 0;
        items.forEach(({ key, text }) => {
            if (!Object.prototype.hasOwnProperty.call(hans, key)) {
                hans[key] = text;
                added += 1;
            }
        });
        // Keep non-phrase keys first, then phrases by length desc (match applyPhraseMap preference)
        const ordered = {};
        Object.keys(hans).filter((k) => !k.startsWith('phrase.')).forEach((k) => { ordered[k] = hans[k]; });
        Object.keys(hans).filter((k) => k.startsWith('phrase.')).sort((a, b) => b.length - a.length || a.localeCompare(b))
            .forEach((k) => { ordered[k] = hans[k]; });
        fs.writeFileSync(catalogHans, `${JSON.stringify(ordered, null, 2)}\n`, 'utf8');
        console.log(`[extract-i18n-phrases] zh-Hans phrase keys added=${added} totalKeys=${Object.keys(ordered).length}`);
    }
}

main();
