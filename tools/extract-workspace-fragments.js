/**
 * Extract factory workspace panels from src/index.html into *.fragment.html files
 * and leave slim placeholders (data-ui-fragment="pending").
 *
 * Fragments:
 *   workspace-scenes  (+ presetNameModal)
 *   workspace-shelf
 *   workspace-models  (+ engineModelsLabModal)
 *   workspace-burn
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const htmlPath = path.join(root, 'src', 'index.html');

/** @type {Array<{ key: string, roots: string[], label: string }>} */
const FRAGMENTS = [
    {
        key: 'workspace-scenes',
        roots: ['workspaceScenes', 'presetNameModal'],
        label: '场景预设',
    },
    {
        key: 'workspace-shelf',
        roots: ['workspaceShelf'],
        label: '字幕库',
    },
    {
        key: 'workspace-models',
        roots: ['workspaceModels', 'engineModelsLabModal'],
        label: '模型管理',
    },
    {
        key: 'workspace-burn',
        roots: ['workspaceBurn'],
        label: '字幕烧录',
    },
];

function findElementRange(html, id) {
    const markers = [
        ` id="${id}"`,
        ` id='${id}'`,
    ];
    let idAt = -1;
    for (const m of markers) {
        idAt = html.indexOf(m);
        if (idAt >= 0) break;
    }
    if (idAt < 0) throw new Error(`id=${id} not found`);

    // Walk back to the opening '<' of this tag.
    let start = html.lastIndexOf('<', idAt);
    if (start < 0) throw new Error(`open tag for ${id} not found`);

    const openSlice = html.slice(start);
    const openEnd = openSlice.indexOf('>');
    if (openEnd < 0) throw new Error(`malformed open tag for ${id}`);
    const openTag = openSlice.slice(0, openEnd + 1);
    const tagMatch = openTag.match(/^<\s*([a-zA-Z0-9:-]+)/);
    if (!tagMatch) throw new Error(`cannot parse tag name for ${id}`);
    const tagName = tagMatch[1];
    const selfClosing = /\/>\s*$/.test(openTag);
    if (selfClosing) {
        return { start, end: start + openEnd + 1 };
    }

    const re = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi');
    const searchFrom = start;
    const slice = html.slice(searchFrom);
    let depth = 0;
    let end = -1;
    let m;
    while ((m = re.exec(slice))) {
        const tag = m[0];
        if (/^<\//.test(tag)) {
            depth -= 1;
            if (depth === 0) {
                end = searchFrom + m.index + tag.length;
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

function placeholderFor(id, label) {
    if (id === 'presetNameModal' || id === 'engineModelsLabModal') {
        return `    <div id="${id}" class="hidden" hidden data-ui-fragment="pending" aria-hidden="true"></div>\n\n`;
    }
    return `        <section id="${id}" class="factory-workspace-pending" aria-label="${label}" data-ui-fragment="pending">
            <div class="flex items-center justify-center gap-2 px-4 py-16 text-sm text-gray-500">
                <span class="boot-spinner" aria-hidden="true"></span>
                <span>正在加载${label}…</span>
            </div>
        </section>

`;
}

function extractOne(html, frag) {
    const fragPath = path.join(root, 'src', `${frag.key}.fragment.html`);
    if (fs.existsSync(fragPath) && html.includes(`id="${frag.roots[0]}"`) && html.includes('data-ui-fragment="pending"')) {
        const pendingRoot = html.includes(`id="${frag.roots[0]}"`)
            && new RegExp(`id="${frag.roots[0]}"[^>]*data-ui-fragment="pending"`).test(html);
        if (pendingRoot) {
            console.log(`[extract-workspace-fragments] ${frag.key} already extracted`);
            return html;
        }
    }

    const ranges = frag.roots.map((id) => ({ id, ...findElementRange(html, id) }));
    // Extract from last to first so offsets stay valid.
    const ordered = ranges.slice().sort((a, b) => b.start - a.start);
    const parts = ranges
        .slice()
        .sort((a, b) => a.start - b.start)
        .map((r) => html.slice(r.start, r.end).replace(/\s+$/, '') + '\n');

    fs.writeFileSync(fragPath, parts.join('\n'), 'utf8');
    console.log(`[extract-workspace-fragments] wrote ${path.relative(root, fragPath)} (${parts.join('').length} bytes)`);

    let next = html;
    for (const r of ordered) {
        next = next.slice(0, r.start) + placeholderFor(r.id, frag.label) + next.slice(r.end);
    }
    return next;
}

let html = fs.readFileSync(htmlPath, 'utf8');
for (const frag of FRAGMENTS) {
    html = extractOne(html, frag);
}
fs.writeFileSync(htmlPath, html, 'utf8');
console.log('[extract-workspace-fragments] updated src/index.html');
