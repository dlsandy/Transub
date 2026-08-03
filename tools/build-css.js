/**
 * Build Tailwind CSS into src/vendor/app.css.
 * Writes via a temp file + retries so Windows file locks (Electron / AV) do not fail the build.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const src = path.join(root, 'src');
const outDir = path.join(src, 'vendor');
const input = path.join(src, 'styles', 'app.css');
const output = path.join(outDir, 'app.css');
const outputTmp = path.join(outDir, `app.css.__build_${process.pid}.tmp`);

fs.mkdirSync(outDir, { recursive: true });

const tailwindCli = path.join(root, 'node_modules', 'tailwindcss', 'lib', 'cli.js');
if (!fs.existsSync(tailwindCli)) {
    console.error('[build-css] 未找到 tailwindcss，请先 npm install');
    process.exit(1);
}

function sleepSync(ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        /* busy wait — short retries only */
    }
}

function isRetryableFsError(err) {
    const code = String(err?.code || '');
    return (
        code === 'EBUSY'
        || code === 'EPERM'
        || code === 'EACCES'
        || code === 'UNKNOWN'
        || code === 'EAGAIN'
    );
}

function replaceWithRetry(from, to, attempts = 8) {
    let lastErr = null;
    for (let i = 1; i <= attempts; i += 1) {
        try {
            try {
                if (fs.existsSync(to)) {
                    fs.chmodSync(to, 0o666);
                    fs.unlinkSync(to);
                }
            } catch (err) {
                if (!isRetryableFsError(err)) throw err;
            }
            try {
                fs.renameSync(from, to);
            } catch {
                fs.copyFileSync(from, to);
                try { fs.unlinkSync(from); } catch { /* ignore */ }
            }
            return;
        } catch (err) {
            lastErr = err;
            if (!isRetryableFsError(err) || i === attempts) break;
            const wait = i * 250;
            console.warn(`[build-css] 写入被占用，${wait}ms 后重试 (${i}/${attempts})…`);
            sleepSync(wait);
        }
    }
    throw lastErr || new Error(`failed to write ${to}`);
}

console.log('[build-css]', path.basename(input), '→', path.relative(root, output));

try {
    if (fs.existsSync(outputTmp)) fs.unlinkSync(outputTmp);
} catch { /* ignore */ }

const result = spawnSync(process.execPath, [
    tailwindCli,
    '-c', path.join(root, 'tailwind.config.js'),
    '-i', input,
    '-o', outputTmp,
    '--minify',
], { stdio: 'inherit', cwd: root });

if (result.status !== 0) {
    try { fs.unlinkSync(outputTmp); } catch { /* ignore */ }
    process.exit(result.status ?? 1);
}

try {
    replaceWithRetry(outputTmp, output);
} catch (err) {
    try { fs.unlinkSync(outputTmp); } catch { /* ignore */ }
    console.error('[build-css] 无法写入 app.css（请关闭正在运行的 Transub / 暂停对该目录的杀毒实时扫描后重试）');
    console.error(err.message || err);
    process.exit(1);
}

console.log('[build-css] 完成');
