const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const RUNTIME_PY = path.join(
    __dirname,
    '..',
    'transub-engine',
    'runtime',
    'python.exe',
);

function runPy(script, timeout = 15000) {
    const res = spawnSync(RUNTIME_PY, ['-c', script], {
        encoding: 'utf8',
        timeout,
    });
    if (res.error) throw res.error;
    if (res.status !== 0) {
        throw new Error(`python failed (${res.status}): ${res.stderr || res.stdout}`);
    }
    return String(res.stdout || '').trim();
}

describe('runtime_audio / device probes must not load torch', () => {
    it('probe_audio_separate does not import torch or demucs', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runPy(`
import json, sys, time
t0 = time.perf_counter()
from transub_engine.runtime_audio import probe_audio_separate
from transub_engine.runtime_gpu import _torch_lib_dirs
from transub_engine.device import detect_device, torch_cuda_libs_present
probe = probe_audio_separate()
detect_device()
_torch_lib_dirs()
elapsed_ms = int((time.perf_counter() - t0) * 1000)
loaded = [n for n in ("torch", "demucs") if n in sys.modules]
print(json.dumps({
    "ok": probe.get("ok"),
    "status": probe.get("status"),
    "elapsedMs": elapsed_ms,
    "loaded": loaded,
    "cudaLibs": bool(torch_cuda_libs_present()),
    "keys": sorted(probe.keys()),
}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.ok, true);
        assert.ok(['ready', 'need_install', 'need_torch_cuda'].includes(payload.status));
        assert.deepStrictEqual(payload.loaded, [], `probe loaded native stacks: ${payload.loaded}`);
        // Filesystem probe should finish in well under a second; 8s is a hang tripwire.
        assert.ok(payload.elapsedMs < 8000, `probe too slow (${payload.elapsedMs}ms) — likely imported torch`);
        assert.ok(payload.keys.includes('torchCuda'));
        assert.ok(payload.keys.includes('installed'));
    });

    it('env-check SenseVoice probe uses importlib.metadata, not import torch', function () {
        const fs = require('fs');
        const src = fs.readFileSync(
            path.join(__dirname, '..', 'electron', 'env-check.js'),
            'utf8',
        );
        const fn = src.slice(src.indexOf('async function checkSensevoiceRuntime'));
        const body = fn.slice(0, fn.indexOf('async function checkWhisperRuntime'));
        assert.match(body, /from importlib\.metadata import PackageNotFoundError, version/);
        assert.doesNotMatch(body, /['"] import torch['"]/);
        assert.doesNotMatch(body, /__import__\(mod\)/);
    });

    it('env-check Whisper probe uses importlib.metadata, not import av', function () {
        const fs = require('fs');
        const src = fs.readFileSync(
            path.join(__dirname, '..', 'electron', 'env-check.js'),
            'utf8',
        );
        const fn = src.slice(src.indexOf('async function checkWhisperRuntime'));
        const body = fn.slice(0, Math.min(fn.length, 3500));
        assert.match(body, /from importlib\.metadata import PackageNotFoundError, version/);
        assert.doesNotMatch(body, /['"] import av['"]/);
        assert.doesNotMatch(body, /['"] import ctranslate2/);
    });

    it('torch CUDA direct-download URLs encode pytorch.org plus signs', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runPy(`
import json
from transub_engine.pip_mirror_util import (
    torch_cuda_wheel_url,
    TORCH_CUDA_WHEEL_FILES,
    TORCH_CUDA_VARIANT_CONFIG,
)
name = TORCH_CUDA_WHEEL_FILES[0]
cu128 = TORCH_CUDA_VARIANT_CONFIG["cu128"]["wheel_files"][0]
print(json.dumps({
    "aliyun": torch_cuda_wheel_url("https://mirrors.aliyun.com/pytorch-wheels/cu126/", name),
    "official": torch_cuda_wheel_url("https://download.pytorch.org/whl/cu126/", name),
    "cu128": torch_cuda_wheel_url("https://download.pytorch.org/whl/cu128/", cu128),
}))
`);
        const payload = JSON.parse(out);
        assert.ok(payload.aliyun.includes('+cu126'));
        assert.ok(payload.official.includes('%2Bcu126'));
        assert.ok(payload.cu128.includes('%2Bcu128'));
    });

    it('needs_torch_cuda128 detects Blackwell compute capability', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runPy(`
import json
from transub_engine.device import needs_torch_cuda128, resolve_torch_cuda_variant
print(json.dumps({
    "rtx50": needs_torch_cuda128("NVIDIA GeForce RTX 5080"),
    "rtx40": needs_torch_cuda128("NVIDIA GeForce RTX 4090"),
    "variant128": resolve_torch_cuda_variant(
        gpu_name="NVIDIA GeForce RTX 5080",
        driver_cuda_major=12,
    ),
    "variant130": resolve_torch_cuda_variant(
        gpu_name="NVIDIA GeForce RTX 5080",
        driver_cuda_major=13,
    ),
}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.rtx50, true);
        assert.strictEqual(payload.rtx40, false);
        assert.strictEqual(payload.variant128, 'cu128');
        assert.strictEqual(payload.variant130, 'cu130');
    });

    it('probe_gpu_runtime downgrades ready to partial on torch mismatch', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runPy(`
import json
from unittest.mock import patch
import transub_engine.runtime_gpu as rg
device = {
    "hasCuda": True,
    "gpuName": "NVIDIA GeForce RTX 5080",
    "needsTorchCuda128": True,
    "torchCudaVariant": "cu130",
    "driverCudaMajor": 13,
    "vramMb": 16000,
}
with patch.object(rg, "detect_device", return_value=device), \\
     patch.object(rg, "_parse_driver_cuda_version", return_value="13.3"), \\
     patch.object(rg, "find_cublas64_12", return_value=r"C:\\\\cublas64_12.dll"), \\
     patch.object(rg, "find_cublas64_13", return_value=""), \\
     patch.object(rg, "ctranslate2_cuda_status", return_value={"ok": True, "reason": "", "deviceCount": 1}), \\
     patch.object(rg, "resolve_ort_gpu_readiness", return_value={
         "ok": True, "target": "cuda12", "desiredTarget": "cuda13",
         "requirement": "onnxruntime-gpu>=1.21", "desiredRequirement": "onnxruntime-gpu>=1.27",
     }), \\
     patch("transub_engine.device.torch_cuda_variant_mismatch", return_value=True), \\
     patch("transub_engine.device.installed_torch_cuda_tag", return_value="cu126"):
    p = rg.probe_gpu_runtime()
print(json.dumps({"status": p.get("status"), "mismatch": p.get("torchCudaMismatch")}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.mismatch, true);
        assert.strictEqual(payload.status, 'partial');
    });

    it('defers CUDA torch install when torch is already live in-process', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runPy(`
import json, tempfile
from pathlib import Path
from unittest.mock import patch
from transub_engine import runtime_audio as ra
from transub_engine.runtime_audio import _install_torch_cuda

td = Path(tempfile.mkdtemp())
(td / "torch-2.11.0+cu126-cp312-cp312-win_amd64.whl").write_bytes(b"PK")
(td / "torchaudio-2.11.0+cu126-cp312-cp312-win_amd64.whl").write_bytes(b"PK")

with patch.object(ra, "_torch_native_live_in_process", return_value=True), \\
     patch.object(ra, "_local_torch_cuda_wheels_dir", return_value=str(td)), \\
     patch.object(ra, "_torch_cuda_runtime_lists", return_value={
         "find_links": (), "index_urls": (), "label": "cu126",
     }):
    out = _install_torch_cuda(force=True)
print(json.dumps({
    "ok": out.get("ok"),
    "deferred": out.get("deferred"),
    "restartRequired": out.get("restartRequired"),
    "code": out.get("code"),
}))
ra.clear_pending_torch_cuda_install()
`, 30000);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.ok, true);
        assert.strictEqual(payload.deferred, true);
        assert.strictEqual(payload.restartRequired, true);
        assert.strictEqual(payload.code, 'TORCH_CUDA_DEFERRED');
    });
});
