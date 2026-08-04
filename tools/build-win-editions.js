/**
 * Build first-install edition zips (CPU / CUDA) from slim win-unpacked.
 * Auto-update continues to use Transub-*-win.zip;
 * these CPU/CUDA zips are optional first-install release assets (currently unpublished).
 *
 * Usage:
 *   node tools/build-win-editions.js
 *   node tools/build-win-editions.js --editions=cpu
 *   node tools/build-win-editions.js --editions=cpu,cuda --prefer-local-runtime
 */
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    EDITION_NAMES,
    ONNXRUNTIME_GPU_PIP,
    CUDA_LOCAL_COPY_PREFIXES,
    editionZipName,
    wheelsForEdition,
} = require('./win-edition-wheels');

const ROOT = path.resolve(__dirname, '..');
const VERSION = require(path.join(ROOT, 'package.json')).version;

function parseArgs(argv) {
    const out = {
        unpacked: path.join(ROOT, 'dist', 'win-unpacked'),
        outDir: path.join(ROOT, 'dist'),
        editions: [...EDITION_NAMES],
        preferLocalRuntime: false,
        wheelCache: path.join(ROOT, 'transub-engine', 'wheels-edition'),
        keepWork: false,
    };
    for (const arg of argv) {
        if (arg.startsWith('--unpacked=')) out.unpacked = path.resolve(arg.slice(11));
        else if (arg.startsWith('--out=')) out.outDir = path.resolve(arg.slice(6));
        else if (arg.startsWith('--editions=')) {
            out.editions = arg.slice(11).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
        } else if (arg === '--prefer-local-runtime') out.preferLocalRuntime = true;
        else if (arg.startsWith('--wheel-cache=')) out.wheelCache = path.resolve(arg.slice(14));
        else if (arg === '--keep-work') out.keepWork = true;
    }
    out.editions = out.editions.filter((e) => EDITION_NAMES.includes(e));
    return out;
}

function log(msg) {
    console.log(`[win-editions] ${msg}`);
}

function ensureTar() {
    const r = spawnSync('tar', ['--version'], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error('tar is required to build edition zips');
}

function rimrafSafe(abs) {
    if (!abs || !fs.existsSync(abs)) return;
    try {
        fs.rmSync(abs, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (err) {
        console.warn(`[win-editions] rimraf failed: ${abs}: ${err.message || err}`);
    }
}

function copyTree(src, dest) {
    rimrafSafe(dest);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (process.platform === 'win32') {
        const r = spawnSync(
            'robocopy.exe',
            [src, dest, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/nc', '/ns', '/np'],
            { encoding: 'utf8' },
        );
        // robocopy: 0–7 success
        if ((r.status ?? 1) > 7) {
            throw new Error(`robocopy failed (${r.status}): ${src} → ${dest}`);
        }
        return;
    }
    fs.cpSync(src, dest, { recursive: true });
}

function writeEditionMarker(unpackedDir, edition) {
    const abs = path.join(unpackedDir, 'resources', 'transub-edition.json');
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const {
        standardZipName,
        editionLabel,
    } = require('../electron/release-artifact-names');
    const payload = {
        edition,
        version: VERSION,
        role: 'first-install',
        label: editionLabel(edition),
        autoUpdateUses: standardZipName(VERSION),
        note: 'Automatic updates always download the standard (slim) zip; local ASR/GPU libs are preserved.',
    };
    fs.writeFileSync(abs, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function resolveEditionPython(unpackedDir) {
    const candidates = [
        path.join(unpackedDir, 'transub-engine', 'runtime', 'python.exe'),
        path.join(unpackedDir, 'transub-engine', 'runtime', 'python'),
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    throw new Error(`edition runtime python missing under ${unpackedDir}`);
}

function runPython(pythonPath, args, opts = {}) {
    const r = spawnSync(pythonPath, args, {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        windowsHide: true,
        ...opts,
    });
    if (r.status !== 0) {
        throw new Error(
            `python ${args.join(' ')} failed (${r.status}):\n${r.stderr || r.stdout || ''}`,
        );
    }
    return r;
}

async function downloadWheel(spec, destPath) {
    if (fs.existsSync(destPath) && fs.statSync(destPath).size > 1024) {
        log(`cache hit ${spec.fileName}`);
        return destPath;
    }
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const urls = [spec.mirrorUrl, spec.officialUrl].filter(Boolean);
    let lastErr = null;
    for (const url of urls) {
        try {
            log(`download ${spec.id} ← ${url}`);
            const res = await fetch(url, {
                headers: { 'User-Agent': 'Transub-EditionBuilder' },
                redirect: 'follow',
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const tmp = `${destPath}.part`;
            const fh = fs.openSync(tmp, 'w');
            try {
                if (!res.body || typeof res.body.getReader !== 'function') {
                    const buf = Buffer.from(await res.arrayBuffer());
                    fs.writeSync(fh, buf);
                } else {
                    const reader = res.body.getReader();
                    for (;;) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        if (value) fs.writeSync(fh, Buffer.from(value));
                    }
                }
            } finally {
                fs.closeSync(fh);
            }
            fs.renameSync(tmp, destPath);
            const mb = (fs.statSync(destPath).size / (1024 * 1024)).toFixed(1);
            log(`saved ${spec.fileName} (${mb} MB)`);
            return destPath;
        } catch (err) {
            lastErr = err;
            try { fs.unlinkSync(`${destPath}.part`); } catch { /* ignore */ }
        }
    }
    throw new Error(`failed to download ${spec.fileName}: ${lastErr?.message || lastErr}`);
}

function pipInstallWheels(pythonPath, wheelPaths) {
    if (!wheelPaths.length) return;
    const args = [
        '-m', 'pip', 'install', '--upgrade', '--no-deps', '--no-warn-script-location',
        ...wheelPaths,
    ];
    log(`pip install ${wheelPaths.length} local wheels`);
    runPython(pythonPath, args);
}

function pipInstallSpecs(pythonPath, specs) {
    if (!specs.length) return;
    const args = [
        '-m', 'pip', 'install', '--upgrade', '--no-warn-script-location',
        '-i', 'https://mirrors.aliyun.com/pypi/simple',
        '--trusted-host', 'mirrors.aliyun.com',
        '--only-binary=:all:',
        ...specs,
    ];
    log(`pip install ${specs.join(' ')}`);
    runPython(pythonPath, args);
}

function pipUninstall(pythonPath, names) {
    const args = ['-m', 'pip', 'uninstall', '-y', ...names];
    const r = spawnSync(pythonPath, args, {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
    });
    // uninstall returns non-zero when package absent — ignore
    if (r.status !== 0) {
        log(`pip uninstall note: ${(r.stderr || r.stdout || '').trim().slice(0, 200)}`);
    }
}

function sitePackagesDir(unpackedDir) {
    return path.join(unpackedDir, 'transub-engine', 'runtime', 'Lib', 'site-packages');
}

function localRuntimeSitePackages() {
    return path.join(ROOT, 'transub-engine', 'runtime', 'Lib', 'site-packages');
}

function shouldCopyLocalName(name) {
    const n = String(name || '').toLowerCase();
    return CUDA_LOCAL_COPY_PREFIXES.some((prefix) => (
        n === prefix
        || n.startsWith(`${prefix}-`)
        || n.startsWith(`${prefix}.`)
        || n.startsWith(`${prefix}_`)
    ));
}

function copyCudaLibsFromLocalRuntime(destUnpacked) {
    const srcSp = localRuntimeSitePackages();
    const destSp = sitePackagesDir(destUnpacked);
    if (!fs.existsSync(srcSp)) return false;
    const nvidiaDir = path.join(srcSp, 'nvidia');
    if (!fs.existsSync(nvidiaDir)) return false;
    fs.mkdirSync(destSp, { recursive: true });
    let copied = 0;
    for (const ent of fs.readdirSync(srcSp, { withFileTypes: true })) {
        if (!shouldCopyLocalName(ent.name)) continue;
        const from = path.join(srcSp, ent.name);
        const to = path.join(destSp, ent.name);
        rimrafSafe(to);
        fs.cpSync(from, to, { recursive: true });
        copied += 1;
    }
    log(`copied ${copied} site-package entries from local CUDA runtime`);
    return copied > 0;
}

function createEditionZip(outZip, unpackedDir) {
    const { walkFiles, normalizeRelPath } = require('../electron/update-manifest-core');
    const rels = walkFiles(unpackedDir, {
        ignoreRel: (rel) => {
            const p = normalizeRelPath(rel).toLowerCase();
            return p.endsWith('.__ts_preserve__') || p.includes('.__ts_preserve__/');
        },
    });
    if (!rels.length) throw new Error(`no files under ${unpackedDir}`);
    if (fs.existsSync(outZip)) fs.unlinkSync(outZip);
    const listFile = `${outZip}.filelist.txt`;
    fs.writeFileSync(listFile, `${rels.join('\n')}\n`, 'utf8');
    try {
        const r = spawnSync(
            'tar',
            ['-a', '-c', '-f', outZip, '-C', unpackedDir, '-T', listFile],
            { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
        );
        if (r.status !== 0) {
            throw new Error(`edition zip failed: ${r.stderr || r.stdout || r.status}`);
        }
    } finally {
        try { fs.unlinkSync(listFile); } catch { /* ignore */ }
    }
}

function listCachedWheels(editionDir) {
    if (!fs.existsSync(editionDir)) return [];
    return fs.readdirSync(editionDir)
        .filter((n) => /\.whl$/i.test(n))
        .map((n) => path.join(editionDir, n))
        .sort((a, b) => a.localeCompare(b));
}

async function ensurePinnedWheels(edition, cacheDir) {
    const wheels = wheelsForEdition(edition);
    for (const spec of wheels) {
        await downloadWheel(spec, path.join(cacheDir, spec.fileName));
    }
    return listCachedWheels(cacheDir);
}

async function buildCpuEdition(workDir, args) {
    const python = resolveEditionPython(workDir);
    writeEditionMarker(workDir, 'cpu');
    const cacheDir = path.join(args.wheelCache, 'cpu');
    let paths = await ensurePinnedWheels('cpu', cacheDir);
    // Prefer offline cache from ensure-edition-wheels (av/scipy/…).
    if (paths.length < 10) {
        pipInstallSpecs(python, [
            'av>=10.0.0',
            'scipy>=1.4.1',
            'soundfile>=0.12.1',
            'sentencepiece>=0.2.0',
            'setuptools>=69',
        ]);
    }
    paths = listCachedWheels(cacheDir);
    pipUninstall(python, ['onnxruntime-gpu', 'torch', 'torchaudio']);
    pipInstallWheels(python, paths);
}

async function buildCudaEdition(workDir, args) {
    const python = resolveEditionPython(workDir);
    writeEditionMarker(workDir, 'cuda');
    const cacheDir = path.join(args.wheelCache, 'cuda');
    const usedLocal = args.preferLocalRuntime && copyCudaLibsFromLocalRuntime(workDir);
    if (!usedLocal) {
        let paths = await ensurePinnedWheels('cuda', cacheDir);
        const hasOrtGpu = paths.some((p) => /onnxruntime.gpu|onnxruntime_gpu/i.test(path.basename(p)));
        const hasAv = paths.some((p) => /^av-/i.test(path.basename(p)));
        if (!hasOrtGpu || !hasAv) {
            const specs = [];
            if (!hasOrtGpu) specs.push(ONNXRUNTIME_GPU_PIP);
            if (!hasAv) specs.push('av>=10.0.0');
            pipInstallSpecs(python, specs);
            // Also refresh cache for next offline build when network worked.
            try {
                const { spawnSync: sp } = require('child_process');
                sp(python, [
                    '-m', 'pip', 'download', '--dest', cacheDir, '--only-binary=:all:',
                    '-i', 'https://mirrors.aliyun.com/pypi/simple',
                    '--trusted-host', 'mirrors.aliyun.com',
                    ...specs,
                ], { encoding: 'utf8', windowsHide: true });
            } catch { /* ignore cache refresh errors */ }
            paths = listCachedWheels(cacheDir);
        }
        pipUninstall(python, ['onnxruntime', 'torch', 'torchaudio']);
        pipInstallWheels(python, paths);
    } else {
        // Local copy covers nvidia/torch/ort/ct2; still ensure light Whisper deps.
        const whisperOnly = wheelsForEdition('cpu').filter((w) => (
            w.id === 'numpy' || w.id === 'ctranslate2'
        ));
        const paths = [];
        for (const spec of whisperOnly) {
            const destSp = sitePackagesDir(workDir);
            const already = spec.id === 'ctranslate2'
                ? fs.existsSync(path.join(destSp, 'ctranslate2'))
                : true;
            if (already && spec.id === 'ctranslate2') continue;
            paths.push(await downloadWheel(spec, path.join(cacheDir, spec.fileName)));
        }
        if (paths.length) pipInstallWheels(python, paths);
    }
}

async function buildEdition(edition, args) {
    const workRoot = path.join(os.tmpdir(), `transub-edition-${edition}-${process.pid}`);
    const workDir = path.join(workRoot, `win-${edition}`);
    const outZip = path.join(args.outDir, editionZipName(VERSION, edition));
    log(`building ${edition} → ${path.basename(outZip)}`);
    try {
        copyTree(args.unpacked, workDir);
        if (edition === 'cpu') await buildCpuEdition(workDir, args);
        else if (edition === 'cuda') await buildCudaEdition(workDir, args);
        else throw new Error(`unknown edition ${edition}`);

        createEditionZip(outZip, workDir);
        const mb = (fs.statSync(outZip).size / (1024 * 1024)).toFixed(1);
        log(`done ${path.basename(outZip)} (${mb} MB)`);
        return outZip;
    } finally {
        if (!args.keepWork) rimrafSafe(workRoot);
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    ensureTar();
    if (!fs.existsSync(path.join(args.unpacked, 'Transub.exe'))) {
        throw new Error(`Missing Transub.exe under ${args.unpacked}`);
    }
    if (!args.editions.length) {
        throw new Error('No editions selected (use --editions=cpu,cuda)');
    }
    fs.mkdirSync(args.outDir, { recursive: true });
    fs.mkdirSync(args.wheelCache, { recursive: true });

    // Mark slim tree as standard (does not rewrite slim zip; generate-update-manifest may run first).
    writeEditionMarker(args.unpacked, 'standard');

    const written = [];
    for (const edition of args.editions) {
        written.push(await buildEdition(edition, args));
    }
    log('all editions built:');
    for (const abs of written) {
        log(`  ${path.basename(abs)}`);
    }
}

main().catch((err) => {
    console.error(`[win-editions] ${err.stack || err.message || err}`);
    process.exit(1);
});
