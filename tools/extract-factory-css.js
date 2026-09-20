/**
 * Extract factory chrome CSS from src/index.html into styles/factory.css.
 * Keeps critical <style id="factory-workspace-visibility"> inline.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const htmlPath = path.join(root, 'src', 'index.html');
const stylesDir = path.join(root, 'src', 'styles');
const outCss = path.join(stylesDir, 'factory.css');
const vendorCss = path.join(root, 'src', 'vendor', 'factory.css');

let html = fs.readFileSync(htmlPath, 'utf8');
if (html.includes('href="vendor/factory.css"') && fs.existsSync(outCss)) {
    console.log('[extract-factory-css] already extracted');
    process.exit(0);
}

const critEnd = html.indexOf('</style>', html.indexOf('id="factory-workspace-visibility"'));
if (critEnd < 0) throw new Error('critical factory-workspace-visibility style not found');

// Large style after FOUC script / after critical block
const searchFrom = critEnd + '</style>'.length;
const styleOpen = html.indexOf('<style>', searchFrom);
if (styleOpen < 0) throw new Error('main factory style block not found');
let styleClose = html.indexOf('</style>', styleOpen);
if (styleClose < 0) throw new Error('main factory style close not found');

// Fix historical double close: </style></style>
let end = styleClose + '</style>'.length;
if (html.slice(end, end + '</style>'.length) === '</style>') {
    end += '</style>'.length;
}

const inner = html.slice(styleOpen + '<style>'.length, styleClose);
fs.mkdirSync(stylesDir, { recursive: true });
fs.mkdirSync(path.dirname(vendorCss), { recursive: true });
fs.writeFileSync(outCss, inner.replace(/^\n+/, '').replace(/\n+$/, '') + '\n', 'utf8');
fs.copyFileSync(outCss, vendorCss);

const link = '    <link rel="stylesheet" href="vendor/factory.css">\n';
html = html.slice(0, styleOpen) + link + html.slice(end);
fs.writeFileSync(htmlPath, html, 'utf8');
console.log(`[extract-factory-css] wrote styles/factory.css + vendor/factory.css (${inner.length} chars)`);
