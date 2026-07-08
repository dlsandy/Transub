const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const src = path.join(root, 'src');
const outDir = path.join(src, 'vendor');
const input = path.join(src, 'styles', 'app.css');
const output = path.join(outDir, 'app.css');

fs.mkdirSync(outDir, { recursive: true });

const tailwindCli = path.join(root, 'node_modules', 'tailwindcss', 'lib', 'cli.js');
if (!fs.existsSync(tailwindCli)) {
    console.error('[build-css] 未找到 tailwindcss，请先 npm install');
    process.exit(1);
}

console.log('[build-css]', path.basename(input), '→', path.relative(root, output));
const result = spawnSync(process.execPath, [
    tailwindCli,
    '-c', path.join(root, 'tailwind.config.js'),
    '-i', input,
    '-o', output,
    '--minify',
], { stdio: 'inherit', cwd: root });
if (result.status !== 0) process.exit(result.status ?? 1);
console.log('[build-css] 完成');
