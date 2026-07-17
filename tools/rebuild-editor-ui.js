/**
 * One-shot helper: rebuild subtitle-editor.html chrome while preserving modals.
 * Run: node tools/rebuild-editor-ui.js
 */
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'src', 'subtitle-editor.html');
const cssPath = path.join(__dirname, 'editor-ui-style.css');
const shellPath = path.join(__dirname, 'editor-ui-shell.html');

let html = fs.readFileSync(htmlPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const shell = fs.readFileSync(shellPath, 'utf8');

const splitIdx = html.indexOf('<div id="editorSplitModal"');
const scriptIdx = html.indexOf('<script src="js/subtitle-split-core.js"');
if (splitIdx < 0 || scriptIdx < 0) {
    throw new Error('Could not locate modal/script markers in subtitle-editor.html');
}

let modals = html.slice(splitIdx, scriptIdx);
// Strip leftover video panel that historically sat between QC and retranscribe modals
modals = modals.replace(
    /\s*<aside id="editorVideoWrap"[\s\S]*?<\/aside>\s*<\/div>\s*(?=<div id="editorRetranscribeDurModal")/,
    '\n\n        ',
);
modals = modals
    .replace(
        'id="editorFindReplaceModal" class="editor-modal hidden"',
        'id="editorFindReplaceModal" class="editor-modal editor-drawer hidden"',
    )
    .replace(
        'id="editorGlossaryModal" class="editor-modal hidden"',
        'id="editorGlossaryModal" class="editor-modal editor-drawer hidden"',
    )
    .replace(
        'id="editorQcModal" class="editor-modal hidden"',
        'id="editorQcModal" class="editor-modal editor-drawer hidden"',
    );

const headEnd = html.indexOf('</head>');
const headStart = html.slice(0, html.indexOf('<style>'));
const out = `${headStart}<style>\n${css}\n</style>\n</head>\n${shell}\n${modals}\n    <script src="js/subtitle-split-core.js"></script>
    <script src="js/subtitle-fluency-core.js"></script>
    <script src="js/subtitle-qc-core.js"></script>
    <script src="js/subtitle-meta-core.js"></script>
    <script src="js/subtitle-glossary-core.js"></script>
    <script src="js/subtitle-editor.js"></script>
</body>
</html>
`;

// Fix accidental duplicate head close if shell includes body only
const cleaned = out.replace('</head>\n</head>', '</head>');
fs.writeFileSync(htmlPath, cleaned, 'utf8');
console.log('Rebuilt', htmlPath, 'bytes', cleaned.length);
