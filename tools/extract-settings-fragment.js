/**
 * Extract #paramsModal from src/index.html into settings-panels.fragment.html
 * and leave a slim placeholder in index.html.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const htmlPath = path.join(root, 'src', 'index.html');
const fragPath = path.join(root, 'src', 'settings-panels.fragment.html');

let html = fs.readFileSync(htmlPath, 'utf8');
if (html.includes('data-settings-dom="pending"') && fs.existsSync(fragPath)) {
    console.log('[extract-settings-fragment] already extracted');
    process.exit(0);
}

const startMarker = '    <div id="paramsModal"';
const start = html.indexOf(startMarker);
if (start < 0) throw new Error('paramsModal start not found');

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
if (end < 0) throw new Error('paramsModal end not found');
if (html[end] === '\r') end += 1;
if (html[end] === '\n') end += 1;

const fragment = html.slice(start, end);
fs.writeFileSync(fragPath, fragment, 'utf8');

const placeholder = `    <div id="paramsModal" class="hidden fixed inset-0 z-[100] items-center justify-center p-4 bg-black/40 backdrop-blur-[1px]" role="dialog" aria-modal="true" aria-labelledby="paramsModalTitle" data-settings-dom="pending">
        <div class="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-6xl max-h-[min(92vh,56rem)] flex flex-col overflow-hidden relative">
            <div class="flex items-center justify-center gap-2 px-4 py-16 text-sm text-gray-500">
                <span class="boot-spinner" aria-hidden="true"></span>
                <span>正在加载设置…</span>
            </div>
        </div>
    </div>

`;

html = html.slice(0, start) + placeholder + html.slice(end);
fs.writeFileSync(htmlPath, html, 'utf8');
console.log(`[extract-settings-fragment] wrote ${path.relative(root, fragPath)} (${fragment.length} bytes)`);
