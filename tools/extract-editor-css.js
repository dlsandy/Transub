/**
 * Extract editor theme CSS from src/subtitle-editor.html into styles/editor.css
 * and link vendor/editor.css from the page.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const htmlPath = path.join(root, 'src', 'subtitle-editor.html');
const stylesDir = path.join(root, 'src', 'styles');
const outCss = path.join(stylesDir, 'editor.css');
const vendorCss = path.join(root, 'src', 'vendor', 'editor.css');

let html = fs.readFileSync(htmlPath, 'utf8');
if (html.includes('href="vendor/editor.css"') && !html.includes(':root,\nhtml.editor-theme-light')) {
    // Heuristic: already linked and big theme selectors gone
    if (fs.existsSync(outCss) || fs.existsSync(vendorCss)) {
        console.log('[extract-editor-css] already extracted');
        process.exit(0);
    }
}

const styleOpen = html.indexOf('<style>', html.indexOf('</title>'));
const styleClose = html.indexOf('</style>', styleOpen);
if (styleOpen < 0 || styleClose < 0) throw new Error('editor style block not found');

const inner = html.slice(styleOpen + '<style>'.length, styleClose).replace(/^\uFEFF/, '');
if (!inner.includes('--ed-bg') && !inner.includes('editor-theme')) {
    throw new Error('unexpected style block (missing editor theme tokens)');
}

fs.mkdirSync(stylesDir, { recursive: true });
fs.mkdirSync(path.dirname(vendorCss), { recursive: true });
fs.writeFileSync(outCss, inner.replace(/^\n+/, '').replace(/\n+$/, '') + '\n', 'utf8');
fs.copyFileSync(outCss, vendorCss);

const link = '    <link rel="stylesheet" href="vendor/editor.css">\n';
html = html.slice(0, styleOpen) + link + html.slice(styleClose + '</style>'.length);
fs.writeFileSync(htmlPath, html, 'utf8');
console.log(`[extract-editor-css] wrote styles/editor.css + vendor/editor.css (${inner.length} chars)`);
