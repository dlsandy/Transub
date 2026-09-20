/**
 * Restore settings-panels.fragment.html back into src/index.html (undo lazy settings DOM).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const htmlPath = path.join(root, 'src', 'index.html');
const fragPath = path.join(root, 'src', 'settings-panels.fragment.html');

if (!fs.existsSync(fragPath)) {
    console.log('[restore-settings-fragment] no fragment — nothing to do');
    process.exit(0);
}

let html = fs.readFileSync(htmlPath, 'utf8');
const fragment = fs.readFileSync(fragPath, 'utf8');
if (!fragment.includes('id="paramsModal"')) {
    throw new Error('fragment missing paramsModal');
}

const startMarker = '    <div id="paramsModal"';
const start = html.indexOf(startMarker);
if (start < 0) throw new Error('paramsModal placeholder not found in index.html');

const slice = html.slice(start);
const re = /<\/?div\b[^>]*>/gi;
let depth = 0;
let end = -1;
let m;
while ((m = re.exec(slice))) {
    const tag = m[0];
    if (/^<div\b/i.test(tag)) depth += 1;
    else if (/^<\/div/i.test(tag)) {
        depth -= 1;
        if (depth === 0) {
            end = start + m.index + tag.length;
            break;
        }
    }
}
if (end < 0) throw new Error('could not find end of paramsModal placeholder');
if (html[end] === '\r') end += 1;
if (html[end] === '\n') end += 1;

const restored = fragment.endsWith('\n') ? fragment : `${fragment}\n`;
html = html.slice(0, start) + restored + html.slice(end);
fs.writeFileSync(htmlPath, html, 'utf8');
fs.unlinkSync(fragPath);
console.log('[restore-settings-fragment] restored paramsModal into index.html and removed fragment');
