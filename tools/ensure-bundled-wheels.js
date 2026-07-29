/**
 * Ensure small essential wheels under transub-engine/wheels and install them
 * into the embeddable runtime (offline-friendly).
 *
 * Policy: ship wheels ≤ ~5 MB that Whisper / SenseVoice / Hub clients need.
 * Large native stacks stay on-demand: ctranslate2, av, onnxruntime, torch, CUDA, numba…
 *
 * Usage:
 *   node tools/ensure-bundled-wheels.js
 *   node tools/ensure-bundled-wheels.js --check
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const engineRoot = path.join(root, 'transub-engine');
const wheelsDir = path.join(engineRoot, 'wheels');
const pythonExe = path.join(engineRoot, 'runtime', 'python.exe');
const checkOnly = process.argv.includes('--check');
const MAX_WHEEL_BYTES = 5 * 1024 * 1024;

/**
 * Curated small essentials (pip download --no-deps).
 * @type {{ id: string, spec: string, importName?: string, required?: boolean }[]}
 */
const PACKAGES = [
    // Whisper API (native CT2 still on-demand)
    { id: 'faster-whisper', spec: 'faster-whisper==1.2.1', importName: 'faster_whisper', required: true },
    // SenseVoice Python package (torch still on-demand)
    { id: 'funasr', spec: 'funasr==1.3.30', importName: 'funasr', required: false },
    // HF / tokenizer stack used by Whisper + model downloads
    { id: 'tokenizers', spec: 'tokenizers==0.23.1', importName: 'tokenizers', required: true },
    { id: 'huggingface-hub', spec: 'huggingface-hub==1.25.1', importName: 'huggingface_hub', required: true },
    { id: 'hf-xet', spec: 'hf-xet==1.5.2', importName: 'hf_xet', required: false },
    { id: 'httpx', spec: 'httpx==0.28.1', importName: 'httpx', required: true },
    { id: 'httpcore', spec: 'httpcore==1.0.9', importName: 'httpcore', required: true },
    { id: 'h11', spec: 'h11==0.16.0', importName: 'h11', required: true },
    { id: 'anyio', spec: 'anyio==4.14.2', importName: 'anyio', required: true },
    { id: 'idna', spec: 'idna==3.18', importName: 'idna', required: true },
    { id: 'certifi', spec: 'certifi==2026.7.22', importName: 'certifi', required: true },
    { id: 'click', spec: 'click==8.4.2', importName: 'click', required: true },
    { id: 'colorama', spec: 'colorama==0.4.6', importName: 'colorama', required: false },
    { id: 'filelock', spec: 'filelock==3.32.0', importName: 'filelock', required: true },
    { id: 'fsspec', spec: 'fsspec==2026.7.0', importName: 'fsspec', required: true },
    { id: 'packaging', spec: 'packaging==26.2', importName: 'packaging', required: true },
    { id: 'pyyaml', spec: 'pyyaml==6.0.3', importName: 'yaml', required: true },
    { id: 'tqdm', spec: 'tqdm==4.70.0', importName: 'tqdm', required: true },
    { id: 'typing_extensions', spec: 'typing_extensions==4.16.0', importName: 'typing_extensions', required: true },
    { id: 'protobuf', spec: 'protobuf==7.35.1', importName: 'google.protobuf', required: false },
    { id: 'flatbuffers', spec: 'flatbuffers==25.12.19', importName: 'flatbuffers', required: false },
];

function listWheelFiles() {
    if (!fs.existsSync(wheelsDir)) return [];
    return fs.readdirSync(wheelsDir)
        .filter((n) => /\.whl$/i.test(n))
        .map((n) => {
            const full = path.join(wheelsDir, n);
            let size = 0;
            try { size = fs.statSync(full).size; } catch (_) { /* ignore */ }
            return { name: n, full, size };
        });
}

function findWheelForPackage(pkgId) {
    const raw = String(pkgId || '').toLowerCase();
    // Wheel names use PEP 427 distribution prefixes (usually underscores).
    // Do NOT rewrite hyphens inside the full filename — that also breaks the
    // version separator (faster_whisper-1.2.1 → faster_whisper_1.2.1).
    const prefixes = Array.from(new Set([
        raw,
        raw.replace(/-/g, '_'),
        raw.replace(/_/g, '-'),
    ]));
    const wheels = listWheelFiles();
    return wheels.find((w) => {
        const name = String(w.name || '').toLowerCase();
        return prefixes.some((p) => name.startsWith(`${p}-`));
    }) || null;
}

function runPython(args, opts = {}) {
    return spawnSync(pythonExe, args, {
        cwd: engineRoot,
        encoding: 'utf8',
        timeout: opts.timeout || 180000,
        env: { ...process.env, PYTHONUTF8: '1' },
    });
}

function importOk(importName) {
    if (!importName || !fs.existsSync(pythonExe)) return false;
    const res = runPython(
        ['-c', `import ${importName}; print(getattr(${importName}, "__version__", "ok"))`],
        { timeout: 45000 },
    );
    return res.status === 0;
}

function downloadPackage(spec) {
    console.log(`[ensure-bundled-wheels] download ${spec}`);
    const res = runPython([
        '-m', 'pip', 'download',
        '--no-deps',
        '-d', wheelsDir,
        '-i', 'https://mirrors.aliyun.com/pypi/simple',
        '--trusted-host', 'mirrors.aliyun.com',
        spec,
    ], { timeout: 300000 });
    if (res.status !== 0) {
        console.error(res.stdout || '');
        console.error(res.stderr || '');
        throw new Error(`pip download failed: ${spec}`);
    }
}

function pruneOversizedWheels() {
    for (const w of listWheelFiles()) {
        if (w.size > MAX_WHEEL_BYTES) {
            console.warn(
                `[ensure-bundled-wheels] remove oversized ${w.name} (${(w.size / 1024 / 1024).toFixed(1)} MB > 5 MB)`,
            );
            try { fs.unlinkSync(w.full); } catch (_) { /* ignore */ }
        }
    }
}

function installAllFromWheels() {
    const wheels = listWheelFiles().map((w) => w.full);
    if (!wheels.length) {
        throw new Error('no wheels to install');
    }
    console.log(`[ensure-bundled-wheels] pip install ${wheels.length} local wheels`);
    const res = runPython([
        '-m', 'pip', 'install',
        '--upgrade',
        '--no-deps',
        '--no-index',
        '--find-links', wheelsDir,
        ...wheels,
    ], { timeout: 300000 });
    if (res.status !== 0) {
        console.error(res.stdout || '');
        console.error(res.stderr || '');
        throw new Error('pip install from wheels/ failed');
    }
}

function writeManifest() {
    const wheels = listWheelFiles().sort((a, b) => a.name.localeCompare(b.name));
    const lines = [
        '# Auto-generated by tools/ensure-bundled-wheels.js',
        `# Total: ${wheels.length} wheels, ${(wheels.reduce((s, w) => s + w.size, 0) / 1024 / 1024).toFixed(2)} MB`,
        '',
        ...wheels.map((w) => `${w.name}\t${w.size}`),
        '',
    ];
    fs.writeFileSync(path.join(wheelsDir, 'MANIFEST.txt'), lines.join('\n'), 'utf8');
}

function check() {
    const missing = [];
    for (const pkg of PACKAGES) {
        const whl = findWheelForPackage(pkg.id);
        if (!whl) missing.push(`${pkg.id} (wheel)`);
        else if (pkg.required && pkg.importName && !importOk(pkg.importName)) {
            // funasr may fail without torch — only hard-fail required imports
            missing.push(`${pkg.id} (not importable: ${pkg.importName})`);
        }
    }
    if (missing.length) {
        console.error(`[ensure-bundled-wheels] missing: ${missing.join(', ')}`);
        process.exit(1);
    }
    console.log(`[ensure-bundled-wheels] ok (${listWheelFiles().length} wheels)`);
}

function main() {
    if (!fs.existsSync(pythonExe)) {
        console.error(`[ensure-bundled-wheels] missing engine python: ${pythonExe}`);
        process.exit(1);
    }
    fs.mkdirSync(wheelsDir, { recursive: true });

    if (checkOnly) {
        check();
        return;
    }

    for (const pkg of PACKAGES) {
        if (!findWheelForPackage(pkg.id)) {
            try {
                downloadPackage(pkg.spec);
            } catch (err) {
                if (pkg.required) throw err;
                console.warn(`[ensure-bundled-wheels] optional skip ${pkg.id}: ${err.message}`);
            }
        }
    }
    pruneOversizedWheels();
    installAllFromWheels();
    writeManifest();

    for (const pkg of PACKAGES.filter((p) => p.required && p.importName)) {
        if (!importOk(pkg.importName)) {
            console.error(`[ensure-bundled-wheels] cannot import required ${pkg.importName}`);
            process.exit(1);
        }
    }
    // Soft-check funasr (needs torch for full import)
    if (findWheelForPackage('funasr')) {
        console.log('[ensure-bundled-wheels] funasr wheel present (torch still on-demand)');
    }
    console.log(`[ensure-bundled-wheels] ready (${listWheelFiles().length} wheels)`);
}

try {
    main();
} catch (err) {
    console.error(err?.message || err);
    process.exit(1);
}
