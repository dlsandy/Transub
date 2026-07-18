const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'src');
const outDir = path.join(root, 'renderer-dist');

function copyRecursive(from, dest) {
    if (!fs.existsSync(from)) return;
    const stat = fs.statSync(from);
    if (stat.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        for (const name of fs.readdirSync(from)) {
            copyRecursive(path.join(from, name), path.join(dest, name));
        }
        return;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(from, dest);
}

function minifyJsDir(dir) {
    let esbuild;
    try {
        esbuild = require('esbuild');
    } catch {
        console.warn('[build-renderer] esbuild 不可用，跳过 JS 压缩');
        return;
    }
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        if (fs.statSync(full).isDirectory()) {
            minifyJsDir(full);
            continue;
        }
        if (!name.endsWith('.js') || name.endsWith('.min.js')) continue;
        const code = fs.readFileSync(full, 'utf8');
        const result = esbuild.transformSync(code, { minify: true, target: 'chrome140' });
        fs.writeFileSync(full, result.code);
    }
}

console.log('[build-renderer] 1/3 Tailwind CSS');
require('./build-css');

console.log('[build-renderer] 2/3 复制渲染层');
if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
copyRecursive(path.join(src, 'index.html'), path.join(outDir, 'index.html'));
copyRecursive(path.join(src, 'subtitle-editor.html'), path.join(outDir, 'subtitle-editor.html'));
copyRecursive(path.join(src, 'icon.png'), path.join(outDir, 'icon.png'));
copyRecursive(path.join(src, 'js'), path.join(outDir, 'js'));
copyRecursive(path.join(src, 'vendor'), path.join(outDir, 'vendor'));

console.log('[build-renderer] 3/3 压缩 JS');
minifyJsDir(path.join(outDir, 'js'));
console.log('[build-renderer] 完成');
