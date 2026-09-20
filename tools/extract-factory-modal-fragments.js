/**
 * Extract setup wizard + secondary factory modals from src/index.html.
 * Does not touch logDetailModal (live logHost used at boot).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const htmlPath = path.join(root, 'src', 'index.html');

/** @type {Array<{ key: string, roots: string[] }>} */
const FRAGMENTS = [
    {
        key: 'setup-wizard',
        roots: ['setupWizardModal'],
    },
    {
        key: 'factory-modals',
        roots: [
            'envFixProgressModal',
            'envCheckModal',
            'translateStylePickerModal',
            'retranslateModal',
            'appConfirmModal',
            'cliCommandModal',
            'batchSummaryModal',
            'shortcutsModal',
            'manualWhlModal',
            'previewModal',
        ],
    },
];

function findElementRange(html, id) {
    const markers = [` id="${id}"`, ` id='${id}'`];
    let idAt = -1;
    for (const m of markers) {
        idAt = html.indexOf(m);
        if (idAt >= 0) break;
    }
    if (idAt < 0) throw new Error(`id=${id} not found`);
    let start = html.lastIndexOf('<', idAt);
    if (start < 0) throw new Error(`open tag for ${id} not found`);
    const openSlice = html.slice(start);
    const openEnd = openSlice.indexOf('>');
    if (openEnd < 0) throw new Error(`malformed open tag for ${id}`);
    const openTag = openSlice.slice(0, openEnd + 1);
    const tagMatch = openTag.match(/^<\s*([a-zA-Z0-9:-]+)/);
    if (!tagMatch) throw new Error(`cannot parse tag name for ${id}`);
    const tagName = tagMatch[1];
    if (/\/>\s*$/.test(openTag)) {
        return { start, end: start + openEnd + 1 };
    }
    const re = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi');
    const slice = html.slice(start);
    let depth = 0;
    let end = -1;
    let m;
    while ((m = re.exec(slice))) {
        const tag = m[0];
        if (/^<\//.test(tag)) {
            depth -= 1;
            if (depth === 0) {
                end = start + m.index + tag.length;
                break;
            }
        } else if (!/\/>\s*$/.test(tag)) {
            depth += 1;
        }
    }
    if (end < 0) throw new Error(`end tag for ${id} not found`);
    if (html[end] === '\r') end += 1;
    if (html[end] === '\n') end += 1;
    return { start, end };
}

function placeholderFor(id) {
    return `    <div id="${id}" class="hidden" hidden data-ui-fragment="pending" aria-hidden="true"></div>\n\n`;
}

function extractOne(html, frag) {
    const fragPath = path.join(root, 'src', `${frag.key}.fragment.html`);
    const pendingRoot = html.includes(`id="${frag.roots[0]}"`)
        && new RegExp(`id="${frag.roots[0]}"[^>]*data-ui-fragment="pending"`).test(html);
    if (pendingRoot && fs.existsSync(fragPath)) {
        console.log(`[extract-factory-modal-fragments] ${frag.key} already extracted`);
        return html;
    }

    const ranges = frag.roots.map((id) => ({ id, ...findElementRange(html, id) }));
    const ordered = ranges.slice().sort((a, b) => b.start - a.start);
    const parts = ranges
        .slice()
        .sort((a, b) => a.start - b.start)
        .map((r) => html.slice(r.start, r.end).replace(/\s+$/, '') + '\n');

    fs.writeFileSync(fragPath, parts.join('\n'), 'utf8');
    console.log(`[extract-factory-modal-fragments] wrote ${path.relative(root, fragPath)} (${parts.join('').length} bytes)`);

    let next = html;
    for (const r of ordered) {
        next = next.slice(0, r.start) + placeholderFor(r.id) + next.slice(r.end);
    }
    return next;
}

let html = fs.readFileSync(htmlPath, 'utf8');
for (const frag of FRAGMENTS) {
    html = extractOne(html, frag);
}
fs.writeFileSync(htmlPath, html, 'utf8');
console.log('[extract-factory-modal-fragments] updated src/index.html');
