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

/** Silero v6.2 ONNX (faster-whisper #1390); PyPI 1.2.1 still ships v6.0. */
const SILERO_VAD_V6_PATCH = {
    assetRel: path.join('patches', 'faster-whisper', 'silero_vad_v6.onnx'),
    wheelMember: 'faster_whisper/assets/silero_vad_v6.onnx',
    installedRel: path.join(
        'runtime',
        'Lib',
        'site-packages',
        'faster_whisper',
        'assets',
        'silero_vad_v6.onnx',
    ),
    sha256: '914fd98ac0a73d69ba1e70c9b1d66acb740eff90500dfde08b89a961b168a6a9',
    minBytes: 1_200_000,
};

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
    // transformers 4.57.x requires tokenizers<=0.23.0; 0.23.0 stable was never
    // published and 0.23.1 breaks import — pin 0.22.2.
    { id: 'tokenizers', spec: 'tokenizers==0.22.2', importName: 'tokenizers', required: true },
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
    // FireRedVAD Python API (weights ship separately; torch still on-demand)
    { id: 'fireredvad', spec: 'fireredvad==0.0.2', importName: 'fireredvad', required: true },
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

/** Dist name as on PyPI / importlib.metadata (e.g. faster-whisper). */
function distNameOf(pkg) {
    return String(pkg.spec || pkg.id || '').split(/[=<>!~]/)[0].trim();
}

function distInstalled(distName) {
    const name = String(distName || '').trim();
    if (!name || !fs.existsSync(pythonExe)) return false;
    const res = runPython(
        ['-c', `from importlib.metadata import version; print(version(${JSON.stringify(name)}))`],
        { timeout: 30000 },
    );
    return res.status === 0;
}

function importOk(importName) {
    if (!importName || !fs.existsSync(pythonExe)) return false;
    const res = runPython(
        ['-c', `import ${importName}; print(getattr(${importName}, "__version__", "ok"))`],
        { timeout: 45000 },
    );
    return res.status === 0;
}

/**
 * Required packages must be installed. Full import is best-effort: faster_whisper
 * pulls ctranslate2→torch; a broken/SAC-blocked local torch must not fail slim packaging.
 */
function requiredPackageReady(pkg) {
    const dist = distNameOf(pkg);
    if (!distInstalled(dist)) {
        return { ok: false, detail: `not installed: ${dist}` };
    }
    if (!pkg.importName) return { ok: true, detail: 'installed' };
    if (importOk(pkg.importName)) return { ok: true, detail: 'importable' };
    // Package files present; native import failed (torch/SAC/DLL) — warn, allow packaging.
    return {
        ok: true,
        soft: true,
        detail: `installed but import ${pkg.importName} failed (often SAC-blocked torch / missing CT2); slim pack still OK`,
    };
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

function sha256File(filePath) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function sileroPatchAssetPath() {
    return path.join(engineRoot, SILERO_VAD_V6_PATCH.assetRel);
}

function sileroPatchReady() {
    const asset = sileroPatchAssetPath();
    if (!fs.existsSync(asset)) {
        return { ok: false, detail: `missing patch asset: ${SILERO_VAD_V6_PATCH.assetRel}` };
    }
    let size = 0;
    try { size = fs.statSync(asset).size; } catch (_) { /* ignore */ }
    if (size < SILERO_VAD_V6_PATCH.minBytes) {
        return { ok: false, detail: `patch asset too small: ${SILERO_VAD_V6_PATCH.assetRel}` };
    }
    const hash = sha256File(asset);
    if (hash !== SILERO_VAD_V6_PATCH.sha256) {
        return {
            ok: false,
            detail: `patch asset sha256 mismatch (got ${hash}, want ${SILERO_VAD_V6_PATCH.sha256})`,
        };
    }
    return { ok: true, asset, hash };
}

/**
 * Replace Silero v6.0 ONNX inside the faster-whisper wheel + installed package
 * with the vendored v6.2 weights (same I/O as FW's reconstructed asset).
 */
function applySileroVadV6Patch() {
    const ready = sileroPatchReady();
    if (!ready.ok) throw new Error(ready.detail);
    const asset = ready.asset;
    const installed = path.join(engineRoot, SILERO_VAD_V6_PATCH.installedRel);
    fs.mkdirSync(path.dirname(installed), { recursive: true });
    fs.copyFileSync(asset, installed);
    if (sha256File(installed) !== SILERO_VAD_V6_PATCH.sha256) {
        throw new Error('failed to write patched silero_vad_v6.onnx into site-packages');
    }

    const whl = findWheelForPackage('faster-whisper');
    if (!whl) throw new Error('faster-whisper wheel missing; cannot patch Silero VAD');
    const py = `
import hashlib, shutil, sys, tempfile, zipfile
from pathlib import Path
wheel = Path(sys.argv[1])
asset = Path(sys.argv[2])
member = sys.argv[3].replace("\\\\", "/")
want = sys.argv[4]
data = asset.read_bytes()
got = hashlib.sha256(data).hexdigest()
if got != want:
    raise SystemExit(f"patch asset hash mismatch: {got}")
tmp = Path(tempfile.mkdtemp(prefix="fw-silero-"))
try:
    out = tmp / wheel.name
    with zipfile.ZipFile(wheel, "r") as zin, zipfile.ZipFile(out, "w") as zout:
        replaced = False
        for info in zin.infolist():
            name = info.filename.replace("\\\\", "/")
            if name == member:
                zi = zipfile.ZipInfo(filename=info.filename, date_time=info.date_time)
                zi.compress_type = zipfile.ZIP_DEFLATED
                zi.external_attr = info.external_attr
                zout.writestr(zi, data)
                replaced = True
            else:
                zout.writestr(info, zin.read(info.filename))
        if not replaced:
            raise SystemExit(f"member not found in wheel: {member}")
    shutil.move(str(out), str(wheel))
finally:
    shutil.rmtree(tmp, ignore_errors=True)
print("patched", wheel.name, "member", member, "sha256", got)
`;
    const res = runPython(
        ['-c', py, whl.full, asset, SILERO_VAD_V6_PATCH.wheelMember, SILERO_VAD_V6_PATCH.sha256],
        { timeout: 120000 },
    );
    if (res.stdout) process.stdout.write(res.stdout);
    if (res.stderr) process.stderr.write(res.stderr);
    if (res.status !== 0) {
        throw new Error('failed to patch silero_vad_v6.onnx inside faster-whisper wheel');
    }
    console.log(
        `[ensure-bundled-wheels] Silero VAD → v6.2 (${SILERO_VAD_V6_PATCH.sha256.slice(0, 12)}…)`,
    );
}

function sileroInstalledPatched() {
    const installed = path.join(engineRoot, SILERO_VAD_V6_PATCH.installedRel);
    if (!fs.existsSync(installed)) {
        return { ok: false, detail: 'installed silero_vad_v6.onnx missing' };
    }
    const hash = sha256File(installed);
    if (hash !== SILERO_VAD_V6_PATCH.sha256) {
        return {
            ok: false,
            detail: `installed silero_vad_v6.onnx not v6.2 (got ${hash})`,
        };
    }
    return { ok: true, hash };
}

function check() {
    const missing = [];
    for (const pkg of PACKAGES) {
        const whl = findWheelForPackage(pkg.id);
        if (!whl) missing.push(`${pkg.id} (wheel)`);
        else if (pkg.required) {
            const ready = requiredPackageReady(pkg);
            if (!ready.ok) missing.push(`${pkg.id} (${ready.detail})`);
            else if (ready.soft) console.warn(`[ensure-bundled-wheels] ${pkg.id}: ${ready.detail}`);
        }
    }
    const patchAsset = sileroPatchReady();
    if (!patchAsset.ok) missing.push(`silero-vad-v6.2 (${patchAsset.detail})`);
    const patched = sileroInstalledPatched();
    if (!patched.ok) missing.push(`silero-vad-v6.2 (${patched.detail})`);
    if (missing.length) {
        console.error(`[ensure-bundled-wheels] missing: ${missing.join(', ')}`);
        process.exit(1);
    }
    console.log(`[ensure-bundled-wheels] ok (${listWheelFiles().length} wheels; Silero VAD v6.2)`);
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
    applySileroVadV6Patch();
    writeManifest();

    for (const pkg of PACKAGES.filter((p) => p.required)) {
        const ready = requiredPackageReady(pkg);
        if (!ready.ok) {
            console.error(`[ensure-bundled-wheels] ${ready.detail}`);
            process.exit(1);
        }
        if (ready.soft) {
            console.warn(`[ensure-bundled-wheels] ${pkg.id}: ${ready.detail}`);
        }
    }
    // Soft-check funasr (needs torch for full import)
    if (findWheelForPackage('funasr')) {
        console.log('[ensure-bundled-wheels] funasr wheel present (torch still on-demand)');
    }
    console.log(`[ensure-bundled-wheels] ready (${listWheelFiles().length} wheels; Silero VAD v6.2)`);
}

try {
    main();
} catch (err) {
    console.error(err?.message || err);
    process.exit(1);
}
