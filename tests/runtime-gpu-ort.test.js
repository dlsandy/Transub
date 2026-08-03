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

function runPy(script) {
    const res = spawnSync(RUNTIME_PY, ['-c', script], {
        encoding: 'utf8',
        timeout: 60000,
    });
    if (res.error) throw res.error;
    if (res.status !== 0) {
        throw new Error(`python failed (${res.status}): ${res.stderr || res.stdout}`);
    }
    return String(res.stdout || '').trim();
}

describe('runtime_gpu onnxruntime-gpu CUDA target', () => {
    it('parses classic and R610+ nvidia-smi CUDA banners', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runPy(`
import json
from transub_engine.runtime_gpu import _parse_driver_cuda_version_from_text
classic = "| NVIDIA-SMI 566.14    Driver Version: 566.14    CUDA Version: 12.7     |"
modern = "| NVIDIA-SMI 610.62                 KMD Version: 610.62        CUDA UMD Version: 13.3     |"
print(json.dumps({
    "classic": _parse_driver_cuda_version_from_text(classic),
    "modern": _parse_driver_cuda_version_from_text(modern),
    "live": __import__("transub_engine.runtime_gpu", fromlist=["_parse_driver_cuda_version"])._parse_driver_cuda_version(),
}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.classic, '12.7');
        assert.strictEqual(payload.modern, '13.3');
        // Live machine may lack a GPU in CI; only assert shape when present.
        if (payload.live) {
            assert.ok(/^\d+\.\d+/.test(payload.live), `unexpected live cuda: ${payload.live}`);
        }
    });

    it('maps driver CUDA 12/13 to matching onnxruntime-gpu pins', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runPy(`
import json
from transub_engine.runtime_gpu import (
    resolve_ort_gpu_cuda_target,
    ort_gpu_spec_for_target,
    ort_gpu_install_hint,
)

rows = []
for driver, prefer in (("12.4", True), ("13.2", True), ("11.8", True), ("", True)):
    target = resolve_ort_gpu_cuda_target(
        driver,
        has_cublas12=False,
        has_cublas13=False,
        prefer_driver=prefer,
    )
    spec = ort_gpu_spec_for_target(target)
    rows.append({
        "driver": driver,
        "target": target,
        "requirement": (spec or {}).get("requirement"),
    })

# Userspace-only cu12 must not pick CUDA 13 ORT (ABI mismatch).
assert resolve_ort_gpu_cuda_target(
    "13.2",
    has_cublas12=True,
    has_cublas13=False,
    prefer_driver=False,
) == "cuda12"
# Planning with prefer_driver still follows the driver banner.
assert resolve_ort_gpu_cuda_target(
    "13.2",
    has_cublas12=True,
    has_cublas13=False,
    prefer_driver=True,
) == "cuda13"
# cu13-only userspace → cuda13 even if driver string is empty.
assert resolve_ort_gpu_cuda_target(
    "",
    has_cublas12=False,
    has_cublas13=True,
    prefer_driver=False,
) == "cuda13"

hint12 = ort_gpu_install_hint("12.6")
hint13 = ort_gpu_install_hint("13.0")
print(json.dumps({"rows": rows, "hint12": hint12, "hint13": hint13}))
`);
        const payload = JSON.parse(out);
        const byDriver = Object.fromEntries(payload.rows.map((r) => [r.driver, r]));
        assert.strictEqual(byDriver['12.4'].target, 'cuda12');
        assert.ok(/>=1\.21,<1\.27/.test(byDriver['12.4'].requirement));
        assert.strictEqual(byDriver['13.2'].target, 'cuda13');
        assert.ok(/>=1\.27/.test(byDriver['13.2'].requirement));
        assert.strictEqual(byDriver['11.8'].target, null);
        assert.strictEqual(byDriver[''].target, 'cuda12');
        assert.ok(/CUDA 12/.test(payload.hint12));
        assert.ok(/1\.21/.test(payload.hint12));
        assert.ok(/CUDA 13/.test(payload.hint13));
        assert.ok(/1\.27/.test(payload.hint13));
    });

    it('probe_gpu_runtime exposes ortGpuTarget fields', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runPy(`
import json
from transub_engine.runtime_gpu import probe_gpu_runtime
p = probe_gpu_runtime()
print(json.dumps({
    "ok": p.get("ok"),
    "hasOrtTarget": "ortGpuTarget" in p,
    "hasOrtReq": "ortGpuRequirement" in p,
    "hasCublas13": "cublas13" in p,
    "hasAsrReady": "asrGpuReady" in p,
    "hasWhispersegReady": "whispersegGpuReady" in p,
}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.ok, true);
        assert.strictEqual(payload.hasOrtTarget, true);
        assert.strictEqual(payload.hasOrtReq, true);
        assert.strictEqual(payload.hasCublas13, true);
        assert.strictEqual(payload.hasAsrReady, true);
        assert.strictEqual(payload.hasWhispersegReady, true);
    });

    it('status hint separates ASR/CT2 readiness from WhisperSeg ORT', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runPy(`
import json
from transub_engine.runtime_gpu import _status_hint

ready_both = _status_hint(
    "ready", "RTX", "13.3",
    ct2_ok=True, ort_ok=True, ort_needed=True,
    ort_req="onnxruntime-gpu>=1.27",
)
partial_ort = _status_hint(
    "partial", "RTX", "13.3",
    ct2_ok=True, ort_ok=False, ort_needed=True,
    ort_req="onnxruntime-gpu>=1.27",
)
partial_ct2 = _status_hint(
    "partial", "RTX", "13.3",
    ct2_ok=False, ort_ok=True, ort_needed=True,
    ort_req="onnxruntime-gpu>=1.27",
)
ready_asr_only = _status_hint(
    "ready", "RTX", "12.6",
    ct2_ok=True, ort_ok=False, ort_needed=False,
)
print(json.dumps({
    "ready_both": ready_both,
    "partial_ort": partial_ort,
    "partial_ct2": partial_ct2,
    "ready_asr_only": ready_asr_only,
}, ensure_ascii=False))
`);
        const payload = JSON.parse(out);
        assert.ok(/ASR\/CTranslate2 \+ WhisperSeg ONNX/.test(payload.ready_both));
        assert.ok(/ASR\/CTranslate2 GPU/.test(payload.partial_ort));
        assert.ok(/WhisperSeg/.test(payload.partial_ort));
        assert.ok(/onnxruntime-gpu>=1\.27/.test(payload.partial_ort));
        // Must not claim blanket "GPU runtime ready" when ORT is missing.
        assert.ok(!/^GPU /.test(payload.partial_ort));
        assert.ok(/CTranslate2/.test(payload.partial_ct2));
        assert.ok(/WhisperSeg ONNX GPU/.test(payload.partial_ct2));
        assert.ok(/ASR\/CTranslate2/.test(payload.ready_asr_only));
        assert.ok(!/WhisperSeg ONNX/.test(payload.ready_asr_only));
    });

    it('probe marks partial when CT2 ready but onnxruntime-gpu missing', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runPy(`
import json
from unittest.mock import patch
from transub_engine import runtime_gpu as rg

device = {
    "hasCuda": True,
    "gpuName": "NVIDIA GeForce RTX 3080",
    "vramMb": 10240,
    "ramMb": 32768,
}
with patch.object(rg, "detect_device", return_value=device), \\
     patch.object(rg, "_parse_driver_cuda_version", return_value="13.3"), \\
     patch.object(rg, "find_cublas64_12", return_value=r"C:\\\\cublas64_12.dll"), \\
     patch.object(rg, "find_cublas64_13", return_value=""), \\
     patch.object(rg, "ctranslate2_cuda_usable", return_value=True), \\
     patch.object(rg, "_ort_gpu_requirement_satisfied", return_value=False), \\
     patch.object(rg, "_ort_gpu_version_installed", return_value=""):
    p = rg.probe_gpu_runtime()
print(json.dumps({
    "status": p.get("status"),
    "asrGpuReady": p.get("asrGpuReady"),
    "ortGpuCuda": p.get("ortGpuCuda"),
    "hint": p.get("hint") or "",
}, ensure_ascii=False))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.status, 'partial');
        assert.strictEqual(payload.asrGpuReady, true);
        assert.strictEqual(payload.ortGpuCuda, false);
        assert.ok(/WhisperSeg/.test(payload.hint));
        assert.ok(!/^GPU 运行库已就绪/.test(payload.hint));
    });

    it('accepts CUDA 12 ORT as ready on CUDA 13 drivers with cu12 libs', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runPy(`
import json
from unittest.mock import patch
from packaging.version import Version
from transub_engine import runtime_gpu as rg

device = {
    "hasCuda": True,
    "gpuName": "NVIDIA GeForce RTX 3080",
    "vramMb": 10240,
    "ramMb": 32768,
}

def sat(req):
    from packaging.requirements import Requirement
    from importlib.metadata import PackageNotFoundError
    try:
        r = Requirement(str(req or ""))
    except Exception:
        return False
    if r.name != "onnxruntime-gpu":
        return False
    installed = Version("1.21.1")
    return (not r.specifier) or (installed in r.specifier)

with patch.object(rg, "detect_device", return_value=device), \\
     patch.object(rg, "_parse_driver_cuda_version", return_value="13.3"), \\
     patch.object(rg, "find_cublas64_12", return_value=r"C:\\\\cublas64_12.dll"), \\
     patch.object(rg, "find_cublas64_13", return_value=""), \\
     patch.object(rg, "ctranslate2_cuda_usable", return_value=True), \\
     patch.object(rg, "_ort_gpu_requirement_satisfied", side_effect=sat), \\
     patch.object(rg, "_ort_gpu_version_installed", return_value="1.21.1"):
    ready = rg.resolve_ort_gpu_readiness("13.3", has_cublas12=True, has_cublas13=False)
    p = rg.probe_gpu_runtime()
print(json.dumps({
    "ready": ready,
    "status": p.get("status"),
    "ortGpuCuda": p.get("ortGpuCuda"),
    "ortGpuTarget": p.get("ortGpuTarget"),
    "ortGpuDesiredTarget": p.get("ortGpuDesiredTarget"),
    "missing": p.get("missingPackages") or [],
    "hint": p.get("hint") or "",
}, ensure_ascii=False))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.ready.ok, true);
        assert.strictEqual(payload.ready.target, 'cuda12');
        assert.strictEqual(payload.ready.desiredTarget, 'cuda13');
        assert.strictEqual(payload.status, 'ready');
        assert.strictEqual(payload.ortGpuCuda, true);
        assert.strictEqual(payload.ortGpuTarget, 'cuda12');
        assert.strictEqual(payload.ortGpuDesiredTarget, 'cuda13');
        assert.deepStrictEqual(payload.missing, []);
        assert.ok(/ASR\/CTranslate2 \+ WhisperSeg ONNX/.test(payload.hint));
        assert.ok(!/未就绪/.test(payload.hint));
    });
});
